import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { isFavorite, toggleFavorite, getFavorites } from '../utils/favorites';
import { isAuthenticated } from '../utils/auth';
import { buildApiUrl } from '../config/api';
import { scrollToIfAbove } from '../utils/scroll';
import { samePlayerName } from '../utils/playerNames';
import FilterBar from '../components/FilterBar';
import PageHero from '../components/PageHero';
import Pagination from '../components/Pagination';
import PlayerCard from '../components/PlayerCard';
import PlayerStatsModal from '../components/PlayerStatsModal';
import useFlip from '../hooks/useFlip';
import useListQuery from '../hooks/useListQuery';
import ScrollReveal from '../components/ScrollReveal';
import { getStatsHeroStats } from '../utils/pageHero';
import { getSeasonCardStats } from '../utils/playerCard';
import './Stats.css';

// Everything the URL may carry for this list, with its default (only non-defaults show up).
const LIST_DEFAULTS = { q: '', team: '', position: '', season: '', sort: 'name', order: 'asc', page: 1, view: 'table' };
const LIST_ALLOWED = {
  sort: ['name', 'team', 'position', 'ppg', 'apg', 'rpg', 'spg', 'bpg', 'fg_pct', 'fg3_pct', 'ft_pct', 'games'],
  order: ['asc', 'desc'],
  season: ['2020', '2021', '2022', '2023', '2024', '2025', '2026'],
  view: ['table', 'cards'],
};
const STATS_PAGE_SIZE = 100;
// Newest first; the label shows the NBA season each year ends.
const SEASON_OPTIONS = ['2026', '2025', '2024', '2023', '2022', '2021', '2020']
  .map(year => ({ value: year, label: `${year - 1}-${year.slice(2)} (${year})` }));

const Stats = () => {
  const [query, updateQuery] = useListQuery(LIST_DEFAULTS, LIST_ALLOWED);
  const { q: searchTerm, team: selectedTeam, position: selectedPosition, season: selectedYear,
    sort: sortBy, order: sortOrder, page: currentPage, view: viewMode } = query;
  // The search box keeps its own draft so typing never waits on a router update.
  const [searchDraft, setSearchDraft] = useState(searchTerm);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teams, setTeams] = useState([]);
  const [positions, setPositions] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [favorites, setFavorites] = useState(new Set()); // Track favorites for re-renders
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const gridRef = useRef(null);
  const resultsRef = useRef(null);
  useFlip(gridRef);

  const goToPage = (page) => {
    updateQuery({ page });
    scrollToIfAbove(resultsRef.current);
  };



  // Load favorites on mount
  useEffect(() => {
    const loadFavorites = () => {
      const favList = getFavorites();
      setFavorites(new Set(favList.map(f => f.id)));
    };
    loadFavorites();
  }, []);

  const handleFavoriteToggle = (player) => {
    if (!isAuthenticated()) {
      setShowAuthModal(true);
      return;
    }
    const wasFavorite = isFavorite(player.id);
    toggleFavorite(player);
    const newFavorites = new Set(favorites);
    if (wasFavorite) {
      newFavorites.delete(player.id);
    } else {
      newFavorites.add(player.id);
    }
    setFavorites(newFavorites);
  };

  // Fetch full player details (multi-season + ML) when a row or card is clicked
  const handlePlayerClick = async (player) => {
    if (!player) return;
    setLoadingPlayer(true);

    // Create an immediate baseline profile from the row/card data so modal opens instantly
    const initialProfile = {
      name: player.name || player.PLAYER_NAME || 'Unknown Player',
      team: player.team || player.TEAM_ABBREVIATION || 'NBA',
      position: player.position || player.POSITION || 'G/F',
      age: player.age || player.AGE || '--',
      current_stats: {
        ppg: player.stats?.ppg_last || player.ppg || 0,
        apg: player.stats?.apg_last || player.apg || 0,
        rpg: player.stats?.rpg_last || player.rpg || 0,
        spg: player.stats?.spg_last || player.spg || 0,
        bpg: player.stats?.bpg_last || player.bpg || 0,
        tov: player.stats?.tov_last || player.tov || 0,
        mpg: player.stats?.minutes || player.minutes || 0,
        fg_pct: player.stats?.fg_pct_last || player.fg_pct || 0,
        fg3_pct: player.stats?.fg3_pct_last || player.fg3_pct || 0,
        ft_pct: player.stats?.ft_pct_last || player.ft_pct || 0,
        games_played: player.stats?.games_played || player.games_played || 0,
        minutes: player.stats?.minutes || player.minutes || 0
      },
      ml_stats: null,
      history: {}
    };

    setSelectedPlayer(initialProfile);

    try {
      const pName = player.name || player.PLAYER_NAME || '';
      const response = await fetch(buildApiUrl(`players/search-all?query=${encodeURIComponent(pName)}`));
      if (response.ok) {
        const data = await response.json();
        const match = (data.players || []).find(p => samePlayerName(p.name, player.name || player.PLAYER_NAME));
        if (match) {
          setSelectedPlayer(match);
        }
      }
    } catch (err) {
      console.error('Error fetching full player details, using local data:', err);
    } finally {
      setLoadingPlayer(false);
    }
  };

  // Dismiss modal on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setSelectedPlayer(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    fetchTeams();
    fetchPositions();
  }, []);

  // Each change aborts the previous request, so a slow older response can never overwrite a
  // newer one (last request wins).
  useEffect(() => {
    const controller = new AbortController();
    fetchPlayers(controller.signal);
    return () => controller.abort();
  }, [currentPage, searchTerm, selectedTeam, selectedPosition, selectedYear, sortBy, sortOrder]);

  const fetchPlayers = async (signal) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: String(STATS_PAGE_SIZE),
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      
      if (searchTerm) params.append('search', searchTerm);
      if (selectedTeam) params.append('team', selectedTeam);
      if (selectedPosition) params.append('position', selectedPosition);
      if (selectedYear) params.append('year', selectedYear);

      const response = await fetch(buildApiUrl(`players?${params}`), { signal });
      if (!response.ok) throw new Error('Failed to fetch players');
      
      const data = await response.json();
      if (signal.aborted) return;
      setPlayers(data.players || []);
      setTotalPages(data.pagination?.total_pages || 1);
      setTotalPlayers(data.pagination?.total || 0);
    } catch (err) {
      if (signal.aborted) return;
      setError(err.message);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  };

  const fetchTeams = async () => {
    try {
      const response = await fetch(buildApiUrl('teams'));
      if (response.ok) {
        const data = await response.json();
        setTeams(data.teams || []);
      }
    } catch (err) {
      console.error('Failed to fetch teams:', err);
    }
  };

  const fetchPositions = async () => {
    try {
      const response = await fetch(buildApiUrl('positions'));
      if (response.ok) {
        const data = await response.json();
        setPositions(data.positions || []);
      }
    } catch (err) {
      console.error('Failed to fetch positions:', err);
    }
  };

  const handleSearch = (e) => {
    setSearchDraft(e.target.value);
    updateQuery({ q: e.target.value, page: 1 });
  };

  const handleTeamFilter = (e) => {
    updateQuery({ team: e.target.value, page: 1 });
  };

  const handlePositionFilter = (e) => {
    updateQuery({ position: e.target.value, page: 1 });
  };

  const handleYearFilter = (e) => {
    updateQuery({ season: e.target.value, page: 1 });
  };

  const clearFilters = () => {
    setSearchDraft('');
    updateQuery({ q: '', team: '', position: '', season: '', page: 1 });
  };

  // Players arrive pre-sorted from the backend
  const sortedPlayers = players;

  const handleSort = (newSortBy) => {
    if (sortBy === newSortBy) {
      updateQuery({ order: sortOrder === 'asc' ? 'desc' : 'asc', page: 1 });
    } else {
      // Default descending for stats (highest first), ascending for text fields
      const isText = newSortBy === 'name' || newSortBy === 'team' || newSortBy === 'position';
      updateQuery({ sort: newSortBy, order: isText ? 'asc' : 'desc', page: 1 });
    }
    scrollToIfAbove(resultsRef.current);
  };

  // Built before the early returns, so the first load and errors keep the same heading.
  const hero = (
    <PageHero
      eyebrow="PLAYER DATABASE"
      title="NBA PLAYER"
      accent="STATISTICS"
      lead="Browse and analyze comprehensive player performance metrics, season averages, and AI projections"
      stats={getStatsHeroStats({
        ready: !error && (!loading || players.length > 0),
        total: totalPlayers, year: selectedYear, sort: sortBy, order: sortOrder, page: currentPage, totalPages,
      })}
    />
  );

  if (loading && players.length === 0) {
    return (
      <div className="stats-container">
        {hero}
        <div className="loading">Loading NBA players...</div>
      </div>
    );
  }

  if (error) {
    const serverUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : 'https://court-vision-zxuj.onrender.com');
    return (
      <div className="stats-container">
        {hero}
        <div className="error">
          Error: {error}
          <br />
          Make sure the Flask API server is running on {serverUrl}
        </div>
      </div>
    );
  }

  return (
    <div className="stats-container">
      {/* Rescans when the card view opens or a new page of players arrives. */}
      <ScrollReveal scanKey={viewMode === 'cards' ? players : null} />
      {hero}

      <FilterBar
        search={{ value: searchDraft, onChange: handleSearch }}
        filters={[
          { key: 'team', label: 'Team', allLabel: 'All Teams', value: selectedTeam, onChange: handleTeamFilter, options: teams },
          { key: 'position', label: 'Position', allLabel: 'All Positions', value: selectedPosition, onChange: handlePositionFilter, options: positions },
          { key: 'season', label: 'Season', allLabel: 'All Seasons', value: selectedYear, onChange: handleYearFilter, options: SEASON_OPTIONS },
        ]}
        onClear={clearFilters}
      />

      {/* View Mode and Sorting */}
      <div className="controls-section" ref={resultsRef}>
        <div className="view-mode-toggle">
          <button 
            className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => updateQuery({ view: 'table' })}
          >
            Table View
          </button>
          <button 
            className={`view-btn ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => updateQuery({ view: 'cards' })}
          >
            Card View
          </button>
        </div>
        
        <div className="sorting-section">
          <span className="sort-label">Sort by:</span>
          <button 
            className={`sort-btn ${sortBy === 'name' ? 'active' : ''}`}
            onClick={() => handleSort('name')}
          >
            Name {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button 
            className={`sort-btn ${sortBy === 'team' ? 'active' : ''}`}
            onClick={() => handleSort('team')}
          >
            Team {sortBy === 'team' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button 
            className={`sort-btn ${sortBy === 'position' ? 'active' : ''}`}
            onClick={() => handleSort('position')}
          >
            Position {sortBy === 'position' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button 
            className={`sort-btn ${sortBy === 'ppg' ? 'active' : ''}`}
            onClick={() => handleSort('ppg')}
          >
            PPG {sortBy === 'ppg' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button 
            className={`sort-btn ${sortBy === 'apg' ? 'active' : ''}`}
            onClick={() => handleSort('apg')}
          >
            APG {sortBy === 'apg' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button 
            className={`sort-btn ${sortBy === 'rpg' ? 'active' : ''}`}
            onClick={() => handleSort('rpg')}
          >
            RPG {sortBy === 'rpg' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button 
            className={`sort-btn ${sortBy === 'fg_pct' ? 'active' : ''}`}
            onClick={() => handleSort('fg_pct')}
          >
            FG% {sortBy === 'fg_pct' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button 
            className={`sort-btn ${sortBy === 'games' ? 'active' : ''}`}
            onClick={() => handleSort('games')}
          >
            Games {sortBy === 'games' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
        </div>
        {/* Announces reloads to screen readers too; the dimmed results alone are visual only. */}
        <span data-slot="results-status" role="status" data-numeric>
          {loading ? 'Updating…' : `${totalPlayers} players`}
        </span>
      </div>

      {/* Players Display */}
      {viewMode === 'table' ? (
        <div className="table-container" data-results aria-busy={loading}>
          <div className="table-wrapper">
            <table className="players-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('name')} className="sortable">
                    Player {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('team')} className="sortable">
                    Team {sortBy === 'team' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('position')} className="sortable">
                    Position {sortBy === 'position' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th>Age</th>
                  <th onClick={() => handleSort('ppg')} className="sortable">
                    PPG {sortBy === 'ppg' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('apg')} className="sortable">
                    APG {sortBy === 'apg' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('rpg')} className="sortable">
                    RPG {sortBy === 'rpg' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('spg')} className="sortable">
                    SPG {sortBy === 'spg' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('bpg')} className="sortable">
                    BPG {sortBy === 'bpg' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('fg_pct')} className="sortable">
                    FG% {sortBy === 'fg_pct' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('fg3_pct')} className="sortable">
                    3P% {sortBy === 'fg3_pct' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('ft_pct')} className="sortable">
                    FT% {sortBy === 'ft_pct' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('games')} className="sortable">
                    Games {sortBy === 'games' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="favorite-header">Favorite</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((player, index) => (
                  <tr key={player.id || index} className="stats-row-clickable" onClick={() => handlePlayerClick(player)}>
                    <td className="player-name-cell">
                      <strong>{player.name}</strong>
                    </td>
                    <td>
                      <span className="team-badge-table">{player.team}</span>
                    </td>
                    <td>
                      <span className="position-badge-table">{player.position}</span>
                    </td>
                    <td>{player.age}</td>
                    <td className="stat-cell">{player.stats?.ppg_last?.toFixed(1) || '0.0'}</td>
                    <td className="stat-cell">{player.stats?.apg_last?.toFixed(1) || '0.0'}</td>
                    <td className="stat-cell">{player.stats?.rpg_last?.toFixed(1) || '0.0'}</td>
                    <td className="stat-cell">{player.stats?.spg_last?.toFixed(1) || '0.0'}</td>
                    <td className="stat-cell">{player.stats?.bpg_last?.toFixed(1) || '0.0'}</td>
                    <td className="stat-cell">{player.stats?.fg_pct_last?.toFixed(1) || '0.0'}%</td>
                    <td className="stat-cell">{player.stats?.fg3_pct_last?.toFixed(1) || '0.0'}%</td>
                    <td className="stat-cell">{player.stats?.ft_pct_last?.toFixed(1) || '0.0'}%</td>
                    <td className="stat-cell">{player.stats?.games_played || 0}</td>
                    <td className="favorite-cell">
                      <button
                        className={`favorite-btn ${favorites.has(player.id) ? 'favorited' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFavoriteToggle(player);
                        }}
                        title={favorites.has(player.id) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        {favorites.has(player.id) ? 'FAVORITED' : 'ADD FAV'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="pc-grid" ref={gridRef} data-results aria-busy={loading}>
          {sortedPlayers.map((player, index) => {
            const { main, extra } = getSeasonCardStats(player);
            return (
              <PlayerCard
                key={player.id}
                index={index}
                player={player}
                stats={main}
                statsLabel="Current Season Stats"
                extraStats={extra}
                isFavorite={favorites.has(player.id)}
                onToggleFavorite={() => handleFavoriteToggle(player)}
                onOpen={() => handlePlayerClick(player)}
                ctaLabel="Full profile"
              >
                <div className="player-trends">
                  <h4>Performance Trends</h4>
                  <div className="trends-grid">
                    <div className="trend-item">
                      <span className="trend-label">Consistency</span>
                      <span className="trend-value consistency">{player.trends?.consistency_score?.toFixed(2) || '0.00'}</span>
                    </div>
                    <div className="trend-item">
                      <span className="trend-label">PPG Trend</span>
                      <span className={`trend-value ${(player.trends?.ppg_trend || 0) > 0 ? 'positive' : (player.trends?.ppg_trend || 0) < 0 ? 'negative' : 'neutral'}`}>
                        {(player.trends?.ppg_trend || 0) > 0 ? '+' : ''}{player.trends?.ppg_trend?.toFixed(1) || '0.0'}
                      </span>
                    </div>
                    <div className="trend-item">
                      <span className="trend-label">APG Trend</span>
                      <span className={`trend-value ${(player.trends?.apg_trend || 0) > 0 ? 'positive' : (player.trends?.apg_trend || 0) < 0 ? 'negative' : 'neutral'}`}>
                        {(player.trends?.apg_trend || 0) > 0 ? '+' : ''}{player.trends?.apg_trend?.toFixed(1) || '0.0'}
                      </span>
                    </div>
                    <div className="trend-item">
                      <span className="trend-label">RPG Trend</span>
                      <span className={`trend-value ${(player.trends?.rpg_trend || 0) > 0 ? 'positive' : (player.trends?.rpg_trend || 0) < 0 ? 'negative' : 'neutral'}`}>
                        {(player.trends?.rpg_trend || 0) > 0 ? '+' : ''}{player.trends?.rpg_trend?.toFixed(1) || '0.0'}
                      </span>
                    </div>
                  </div>
                </div>
              </PlayerCard>
            );
          })}
        </div>
      )}

      <Pagination
        page={currentPage}
        totalPages={totalPages}
        totalItems={totalPlayers}
        pageSize={STATS_PAGE_SIZE}
        onPageChange={goToPage}
      />

      <PlayerStatsModal player={selectedPlayer} loading={loadingPlayer} onClose={() => setSelectedPlayer(null)} />

      {/* Custom GUI Authentication Warning Modal */}
      {showAuthModal && (
        <div className="stats-modal-backdrop" onClick={() => setShowAuthModal(false)}>
          <div className="stats-modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px', textAlign: 'center', padding: '3rem 2rem' }}>
            <button className="stats-modal-close-btn" onClick={() => setShowAuthModal(false)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <div style={{ fontSize: '4rem', marginBottom: '1.5rem', filter: 'drop-shadow(0 0 15px rgba(255, 69, 0, 0.4))' }}>🔒</div>
            <h2 className="empty-title" style={{ fontSize: '1.8rem', marginBottom: '1rem', color: '#fff', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: "'Outfit', sans-serif", fontWeight: 900 }}>Authentication Required</h2>
            <p className="empty-description" style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', lineHeight: '1.6', marginBottom: '2rem' }}>
              You must create an account or log in to save your favorite NBA players and customize your analytics tracking!
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <Link to="/login" className="empty-cta" style={{ textDecoration: 'none', padding: '0.8rem 2rem', fontSize: '1rem', textAlign: 'center' }}>Log In</Link>
              <Link to="/create-account" className="empty-cta" style={{ textDecoration: 'none', padding: '0.8rem 2rem', fontSize: '1rem', background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: '#fff', boxShadow: 'none', textAlign: 'center' }}>Create Account</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Stats;
