import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import PageHero from '../components/PageHero';
import PlayerCard from '../components/PlayerCard';
import PlayerStatsModal from '../components/PlayerStatsModal';
import useFlip from '../hooks/useFlip';
import useListQuery from '../hooks/useListQuery';
import ScrollReveal from '../components/ScrollReveal';
import { PREDICTION_STATS } from '../config/predictionStats';
import { getFavorites, toggleFavorite } from '../utils/favorites';
import { isAuthenticated } from '../utils/auth';
import { buildApiUrl } from '../config/api';
import { scrollToIfAbove } from '../utils/scroll';
import { samePlayerName } from '../utils/playerNames';
import { getPredictionsHeroStats } from '../utils/pageHero';
import { getPredictionCardStats } from '../utils/playerCard';
import './Predictions.css';

const toNumber = (value) => Number(value) || 0;

const toFavoritePlayer = (player) => ({
  id: player.id,
  name: player.name,
  team: player.team,
  position: player.position,
  age: toNumber(player.age),
  stats: {
    ppg_last: toNumber(player.ppg_last),
    apg_last: toNumber(player.apg_last),
    rpg_last: toNumber(player.rpg_last),
    spg_last: toNumber(player.spg_last),
    bpg_last: toNumber(player.bpg_last),
    tov_last: toNumber(player.tov_last),
    minutes: toNumber(player.mpg_last),
    fg_pct_last: toNumber(player.fg_pct_last),
    fg3_pct_last: toNumber(player.fg3_pct_last),
    ft_pct_last: toNumber(player.ft_pct_last),
  },
});

// Everything the URL may carry for this list, with its default (only non-defaults show up).
const LIST_DEFAULTS = { q: '', team: '', position: '', sort: 'predicted_ppg', order: 'desc', page: 1 };
const LIST_ALLOWED = {
  sort: ['name', ...PREDICTION_STATS.map((stat) => stat.predictedField)],
  order: ['asc', 'desc'],
};

const Predictions = () => {
  const [query, updateQuery] = useListQuery(LIST_DEFAULTS, LIST_ALLOWED);
  const { q: searchTerm, team: selectedTeam, position: selectedPosition,
    sort: sortBy, order: sortOrder, page: currentPage } = query;
  // The search box keeps its own draft so typing never waits on a router update.
  const [searchDraft, setSearchDraft] = useState(searchTerm);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teams, setTeams] = useState([]);
  const [positions, setPositions] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const gridRef = useRef(null);
  const resultsRef = useRef(null);
  useFlip(gridRef);

  const goToPage = (page) => {
    updateQuery({ page });
    scrollToIfAbove(resultsRef.current);
  };

  useEffect(() => {
    setFavoriteIds(new Set(getFavorites().map((favorite) => favorite.id)));
  }, []);

  const handleFavoriteToggle = (event, player) => {
    event.stopPropagation();

    if (!isAuthenticated()) {
      setShowAuthModal(true);
      return;
    }

    const isNowFavorite = toggleFavorite(toFavoritePlayer(player));
    setFavoriteIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (isNowFavorite) {
        nextIds.add(player.id);
      } else {
        nextIds.delete(player.id);
      }
      return nextIds;
    });
  };

  // Dismiss modal on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setSelectedPlayer(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handlePlayerClick = async (player) => {
    setLoadingPlayer(true);
    try {
      const response = await fetch(buildApiUrl(`players/search-all?query=${encodeURIComponent(player.name)}`));
      const data = await response.json();
      const match = (data.players || []).find(p => samePlayerName(p.name, player.name));
      if (match) {
        setSelectedPlayer(match);
      } else {
        setSelectedPlayer({
          name: player.name,
          team: player.team || 'UNK',
          position: player.position || 'UNK',
          current_stats: {
            ppg: player.ppg_last || 0,
            rpg: player.rpg_last || 0,
            apg: player.apg_last || 0,
            spg: player.spg_last || 0, bpg: player.bpg_last || 0,
            tov: player.tov_last || 0, mpg: player.mpg_last || 0,
            fg_pct: player.fg_pct_last || 0, fg3_pct: player.fg3_pct_last || 0,
            ft_pct: player.ft_pct_last || 0, games_played: 0, minutes: player.mpg_last || 0
          },
          ml_stats: null,
          history: {}
        });
      }
    } catch (err) {
      console.error('Error fetching player details:', err);
    } finally {
      setLoadingPlayer(false);
    }
  };



  useEffect(() => {
    fetchTeams();
    fetchPositions();
  }, []);

  // Each change aborts the previous request, so a slow older response can never overwrite a
  // newer one (last request wins).
  useEffect(() => {
    const controller = new AbortController();
    fetchPredictions(controller.signal);
    return () => controller.abort();
  }, [currentPage, searchTerm, selectedTeam, selectedPosition, sortBy, sortOrder]);

  const fetchPredictions = async (signal) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '12',
        sort_by: sortBy,
        sort_order: sortOrder,
      });

      if (searchTerm) params.append('search', searchTerm);
      if (selectedTeam) params.append('team', selectedTeam);
      if (selectedPosition) params.append('position', selectedPosition);

      const response = await fetch(buildApiUrl(`predictions?${params}`), { signal });
      if (!response.ok) throw new Error('Failed to fetch predictions');

      const data = await response.json();
      if (signal.aborted) return;
      setPredictions(data.predictions || []);
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

  const handleSortFieldChange = (event) => {
    const nextSortBy = event.target.value;
    updateQuery({ sort: nextSortBy, order: nextSortBy === 'name' ? 'asc' : 'desc', page: 1 });
    scrollToIfAbove(resultsRef.current);
  };

  const handleSortDirectionChange = () => {
    updateQuery({ order: sortOrder === 'asc' ? 'desc' : 'asc', page: 1 });
    scrollToIfAbove(resultsRef.current);
  };

  const isNameSort = sortBy === 'name';
  const sortDirectionLabel = sortOrder === 'asc'
    ? (isNameSort ? 'A to Z' : 'Lowest to Highest')
    : (isNameSort ? 'Z to A' : 'Highest to Lowest');

  const clearFilters = () => {
    setSearchDraft('');
    updateQuery({ q: '', team: '', position: '', page: 1 });
  };

  return (
    <div className="predictions-container">
      {/* New cards arrive with each fetch, so the reveal rescans when the list changes. */}
      <ScrollReveal scanKey={predictions} />
      <PageHero
        eyebrow="XGBOOST FORECASTING"
        title="NEXT SEASON"
        accent="PREDICTIONS"
        lead="Gradient-boosted (XGBoost) models trained on past seasons project every player's per-game stats for next season"
        stats={getPredictionsHeroStats({
          ready: !error && (!loading || predictions.length > 0),
          total: totalPlayers, sort: sortBy, order: sortOrder, page: currentPage, totalPages,
        })}
      />

      <div className="filters-section">
        <div className="filter-group">
          <input
            type="text"
            placeholder="Search players..."
            value={searchDraft}
            onChange={handleSearch}
            className="search-input"
          />
        </div>

        <div className="filter-group">
          <select value={selectedTeam} onChange={handleTeamFilter} className="filter-select">
            <option value="">All Teams</option>
            {teams.map(team => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <select value={selectedPosition} onChange={handlePositionFilter} className="filter-select">
            <option value="">All Positions</option>
            {positions.map(position => (
              <option key={position} value={position}>{position}</option>
            ))}
          </select>
        </div>

        <button onClick={clearFilters} className="clear-filters-btn">
          Clear Filters
        </button>
      </div>

      <div className="sorting-section" ref={resultsRef}>
        <div className="sort-control-group">
          <label className="sort-label" htmlFor="prediction-sort-field">Sort by</label>
          <select
            id="prediction-sort-field"
            className="prediction-sort-select"
            value={sortBy}
            onChange={handleSortFieldChange}
          >
            <option value="name">Name</option>
            {PREDICTION_STATS.map((stat) => (
              <option value={stat.predictedField} key={stat.key}>Predicted {stat.unit}</option>
            ))}
          </select>
          <button
            type="button"
            className="sort-direction-btn"
            onClick={handleSortDirectionChange}
            aria-label={`Change sort direction. Current order: ${sortDirectionLabel}`}
          >
            <span className="sort-direction-icon" aria-hidden="true">{sortOrder === 'asc' ? '↑' : '↓'}</span>
            <span>{sortDirectionLabel}</span>
          </button>
        </div>
        {/* Announces reloads to screen readers too; the dimmed results alone are visual only. */}
        <span data-slot="results-status" role="status" data-numeric>
          {loading ? 'Updating…' : `${totalPlayers} players`}
        </span>
      </div>

      {loading && predictions.length === 0 ? (
        <div className="loading">Generating NBA predictions...</div>
      ) : error ? (
        (() => {
          const serverUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : 'https://court-vision-zxuj.onrender.com');
          return (
            <div className="error">
              Error: {error}
              <br />
              Make sure the Flask API server is running on {serverUrl}
            </div>
          );
        })()
      ) : predictions.length === 0 ? (
        <div className="no-results">No player predictions matched your search criteria.</div>
      ) : (
        <>
          <div className="pc-grid" ref={gridRef} data-results aria-busy={loading}>
            {predictions.map((player, idx) => {
              const { main, extra } = getPredictionCardStats(player);
              return (
                <PlayerCard
                  key={player.id || idx}
                  index={idx}
                  player={player}
                  stats={main}
                  statsLabel="Predicted · change vs this season"
                  extraStats={extra}
                  extraLabel="This Season Shooting"
                  isFavorite={favoriteIds.has(player.id)}
                  onToggleFavorite={(event) => handleFavoriteToggle(event, player)}
                  onOpen={() => handlePlayerClick(player)}
                  ctaLabel="Full projection"
                />
              );
            })}
          </div>

          <div className="pagination">
            <div className="pagination-controls">
              <button 
                onClick={() => goToPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="pagination-btn"
              >
                Previous Page
              </button>
              
              <div className="pagination-info">
                <div className="page-info-main">
                  <span className="page-label">Page</span>
                  <span className="page-current">{currentPage}</span>
                  <span className="page-separator">of</span>
                  <span className="page-total">{totalPages}</span>
                </div>
                <div className="page-count-info">
                  Showing {(currentPage - 1) * 12 + 1} - {Math.min(currentPage * 12, totalPlayers)} of {totalPlayers} players
                </div>
              </div>
              
              <button 
                onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="pagination-btn"
              >
                Next Page
              </button>
            </div>
          </div>
        </>
      )}

      <PlayerStatsModal player={selectedPlayer} loading={loadingPlayer} onClose={() => setSelectedPlayer(null)} />

      {showAuthModal && (
        <div className="stats-modal-backdrop" onClick={() => setShowAuthModal(false)}>
          <div
            className="stats-modal-container"
            onClick={(event) => event.stopPropagation()}
            style={{ maxWidth: '450px', textAlign: 'center', padding: '3rem 2rem' }}
          >
            <button
              type="button"
              className="stats-modal-close-btn"
              onClick={() => setShowAuthModal(false)}
              aria-label="Close authentication prompt"
            >
              ×
            </button>
            <div className="prediction-auth-icon" aria-hidden="true">🔒</div>
            <h2 className="empty-title">Authentication Required</h2>
            <p className="empty-description">
              You must create an account or log in to save your favorite NBA players and customize your analytics tracking!
            </p>
            <div className="prediction-auth-actions">
              <Link to="/login" className="empty-cta">Log In</Link>
              <Link to="/create-account" className="empty-cta prediction-auth-secondary">Create Account</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Predictions;
