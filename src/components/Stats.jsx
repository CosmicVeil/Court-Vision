import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { isFavorite, toggleFavorite, getFavorites } from '../utils/favorites';
import { isAuthenticated } from '../utils/auth';
import './Stats.css';

const Stats = () => {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [teams, setTeams] = useState([]);
  const [positions, setPositions] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'cards'
  const [favorites, setFavorites] = useState(new Set()); // Track favorites for re-renders
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [modalTab, setModalTab] = useState('current');
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  const [selectedYear, setSelectedYear] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);

  const API_BASE_URL = '/api';

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

  // Fetch full player details (multi-season + ML) when a row is clicked
  const handlePlayerClick = async (player) => {
    setLoadingPlayer(true);
    setModalTab('current');
    try {
      const response = await fetch(`${API_BASE_URL}/players/search-all?query=${encodeURIComponent(player.name)}`);
      const data = await response.json();
      const match = (data.players || []).find(p => p.name === player.name);
      if (match) {
        setSelectedPlayer(match);
      } else {
        // Fallback: build a basic profile from the table data
        setSelectedPlayer({
          name: player.name,
          team: player.team,
          position: player.position,
          age: player.age,
          current_stats: {
            ppg: player.stats?.ppg_last || 0,
            apg: player.stats?.apg_last || 0,
            rpg: player.stats?.rpg_last || 0,
            spg: player.stats?.spg_last || 0,
            bpg: player.stats?.bpg_last || 0,
            fg_pct: player.stats?.fg_pct_last || 0,
            fg3_pct: player.stats?.fg3_pct_last || 0,
            ft_pct: player.stats?.ft_pct_last || 0,
            games_played: player.stats?.games_played || 0,
            minutes: 0
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
    fetchPlayers();
  }, [currentPage, searchTerm, selectedTeam, selectedPosition, selectedYear, sortBy, sortOrder]);

  const fetchPlayers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '100',
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      
      if (searchTerm) params.append('search', searchTerm);
      if (selectedTeam) params.append('team', selectedTeam);
      if (selectedPosition) params.append('position', selectedPosition);
      if (selectedYear) params.append('year', selectedYear);

      const response = await fetch(`${API_BASE_URL}/players?${params}`);
      if (!response.ok) throw new Error('Failed to fetch players');
      
      const data = await response.json();
      setPlayers(data.players || []);
      setTotalPages(data.pagination?.total_pages || 1);
      setTotalPlayers(data.pagination?.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeams = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/teams`);
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
      const response = await fetch(`${API_BASE_URL}/positions`);
      if (response.ok) {
        const data = await response.json();
        setPositions(data.positions || []);
      }
    } catch (err) {
      console.error('Failed to fetch positions:', err);
    }
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleTeamFilter = (e) => {
    setSelectedTeam(e.target.value);
    setCurrentPage(1);
  };

  const handlePositionFilter = (e) => {
    setSelectedPosition(e.target.value);
    setCurrentPage(1);
  };

  const handleYearFilter = (e) => {
    setSelectedYear(e.target.value);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedTeam('');
    setSelectedPosition('');
    setSelectedYear('');
    setCurrentPage(1);
  };

  // Players arrive pre-sorted from the backend
  const sortedPlayers = players;

  const handleSort = (newSortBy) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      // Default descending for stats (highest first), ascending for text fields
      if (newSortBy === 'name' || newSortBy === 'team' || newSortBy === 'position') {
        setSortOrder('asc');
      } else {
        setSortOrder('desc');
      }
    }
    setCurrentPage(1);
  };

  if (loading && players.length === 0) {
    return (
      <div className="stats-container">
        <div className="loading">Loading NBA players...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="stats-container">
        <div className="error">
          Error: {error}
          <br />
          Make sure the Flask API server is running on http://localhost:5000
        </div>
      </div>
    );
  }

  return (
    <div className="stats-container">
      <div className="stats-header">
        <Link to="/" className="back-to-home">← Back to Home</Link>
        <h1>NBA Player Statistics</h1>
        <p>Browse and analyze NBA player performance data</p>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <div className="filter-group">
          <input
            type="text"
            placeholder="Search players..."
            value={searchTerm}
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

        <div className="filter-group">
          <select value={selectedYear} onChange={handleYearFilter} className="filter-select">
            <option value="">All Seasons</option>
            <option value="2026">2025-26 (2026)</option>
            <option value="2025">2024-25 (2025)</option>
            <option value="2024">2023-24 (2024)</option>
            <option value="2023">2022-23 (2023)</option>
            <option value="2022">2021-22 (2022)</option>
            <option value="2021">2020-21 (2021)</option>
            <option value="2020">2019-20 (2020)</option>
          </select>
        </div>
        
        <button onClick={clearFilters} className="clear-filters-btn">
          Clear Filters
        </button>
      </div>

      {/* View Mode and Sorting */}
      <div className="controls-section">
        <div className="view-mode-toggle">
          <button 
            className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            Table View
          </button>
          <button 
            className={`view-btn ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => setViewMode('cards')}
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
      </div>

      {/* Players Display */}
      {viewMode === 'table' ? (
        <div className="table-container">
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
        <div className="players-grid">
          {sortedPlayers.map(player => (
            <div key={player.id} className="player-card stats-card-clickable" onClick={() => handlePlayerClick(player)}>
              <div className="player-header">
                <div className="player-header-top">
                  <h3 className="player-name">{player.name}</h3>
                  <button
                    className={`favorite-btn-card ${favorites.has(player.id) ? 'favorited' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFavoriteToggle(player);
                    }}
                    title={favorites.has(player.id) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {favorites.has(player.id) ? 'FAVORITED' : 'ADD FAV'}
                  </button>
                </div>
                <div className="player-team-position">
                  <span className="team-badge">{player.team}</span>
                  <span className="position-badge">{player.position}</span>
                </div>
              </div>
              
              <div className="player-info">
                <div className="player-details">
                  <span className="player-age">Age: {player.age}</span>
                </div>
              </div>

              <div className="player-stats">
                <h4>Current Season Stats</h4>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-label">PPG</span>
                    <span className="stat-value">{player.stats?.ppg_last?.toFixed(1) || '0.0'}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">APG</span>
                    <span className="stat-value">{player.stats?.apg_last?.toFixed(1) || '0.0'}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">RPG</span>
                    <span className="stat-value">{player.stats?.rpg_last?.toFixed(1) || '0.0'}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">SPG</span>
                    <span className="stat-value">{player.stats?.spg_last?.toFixed(1) || '0.0'}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">BPG</span>
                    <span className="stat-value">{player.stats?.bpg_last?.toFixed(1) || '0.0'}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">FG%</span>
                    <span className="stat-value">{player.stats?.fg_pct_last?.toFixed(1) || '0.0'}%</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">3P%</span>
                    <span className="stat-value">{player.stats?.fg3_pct_last?.toFixed(1) || '0.0'}%</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">FT%</span>
                    <span className="stat-value">{player.stats?.ft_pct_last?.toFixed(1) || '0.0'}%</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Games</span>
                    <span className="stat-value">{player.stats?.games_played || 0}</span>
                  </div>
                </div>
              </div>

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
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="pagination">
        <div className="pagination-controls">
          <button 
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="pagination-btn"
          >
            ← Previous
          </button>
          
          <div className="pagination-info">
            <div className="page-info-main">
              <span className="page-label">Page</span>
              <span className="page-current">{currentPage}</span>
              <span className="page-separator">of</span>
              <span className="page-total">{totalPages}</span>
            </div>
            <div className="page-count-info">
              Showing {sortedPlayers.length > 0 ? (currentPage - 1) * 100 + 1 : 0} - {Math.min(currentPage * 100, (currentPage - 1) * 100 + sortedPlayers.length)} of {totalPlayers} players
            </div>
          </div>
          
          <button 
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="pagination-btn"
          >
            Next →
          </button>
        </div>
      </div>

      {loading && (
        <div className="loading-overlay">
          <div className="loading">Loading more players...</div>
        </div>
      )}

      {/* Player Details Popup Modal */}
      {(selectedPlayer || loadingPlayer) && (
        <div className="stats-modal-backdrop" onClick={() => { if (!loadingPlayer) setSelectedPlayer(null); }}>
          <div className="stats-modal-container" onClick={(e) => e.stopPropagation()}>
            {loadingPlayer && !selectedPlayer ? (
              <div style={{ padding: '4rem', textAlign: 'center' }}>
                <div className="search-spinner" style={{ width: 32, height: 32, margin: '0 auto 1rem' }}></div>
                <p style={{ color: 'var(--text-secondary)' }}>Loading player details...</p>
              </div>
            ) : selectedPlayer && (
              <>
                <button className="stats-modal-close-btn" onClick={() => setSelectedPlayer(null)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                
                <div className="stats-modal-header">
                  <div className="stats-modal-player-title-row">
                    <h2 className="stats-modal-player-name">{selectedPlayer.name}</h2>
                    <span className="stats-modal-player-team-badge">{selectedPlayer.team}</span>
                  </div>
                  <p className="stats-modal-player-meta">
                    <span><strong>Position:</strong> {selectedPlayer.position}</span>
                    <span>•</span>
                    <span><strong>Age:</strong> {selectedPlayer.age}</span>
                  </p>
                </div>

                <div className="stats-modal-tabs">
                  <button className={`stats-modal-tab-btn ${modalTab === 'current' ? 'active' : ''}`} onClick={() => setModalTab('current')}>Current Stats</button>
                  <button className={`stats-modal-tab-btn ${modalTab === 'predictions' ? 'active' : ''}`} onClick={() => setModalTab('predictions')}>AI Predictions</button>
                  <button className={`stats-modal-tab-btn ${modalTab === 'history' ? 'active' : ''}`} onClick={() => setModalTab('history')}>Career History</button>
                </div>

                <div className="stats-modal-body">
                  {modalTab === 'current' && (
                    <div>
                      <div className="stats-grid-container">
                        <div className="stat-box-card"><div className="stat-box-value highlighted">{selectedPlayer.current_stats.ppg}</div><div className="stat-box-label">PPG</div></div>
                        <div className="stat-box-card"><div className="stat-box-value">{selectedPlayer.current_stats.apg}</div><div className="stat-box-label">APG</div></div>
                        <div className="stat-box-card"><div className="stat-box-value">{selectedPlayer.current_stats.rpg}</div><div className="stat-box-label">RPG</div></div>
                        <div className="stat-box-card"><div className="stat-box-value">{selectedPlayer.current_stats.spg}</div><div className="stat-box-label">SPG</div></div>
                        <div className="stat-box-card"><div className="stat-box-value">{selectedPlayer.current_stats.bpg}</div><div className="stat-box-label">BPG</div></div>
                      </div>
                      <div className="secondary-stats-container">
                        <h3 className="secondary-stats-title">Shooting & Playing Time</h3>
                        <div className="percentage-stat-row">
                          <div className="percentage-stat-header"><span className="percentage-stat-name">Field Goal (FG%)</span><span className="percentage-stat-value">{selectedPlayer.current_stats.fg_pct}%</span></div>
                          <div className="percentage-stat-track"><div className="percentage-stat-bar" style={{ width: `${selectedPlayer.current_stats.fg_pct}%` }}></div></div>
                        </div>
                        <div className="percentage-stat-row">
                          <div className="percentage-stat-header"><span className="percentage-stat-name">3-Point (3PT%)</span><span className="percentage-stat-value">{selectedPlayer.current_stats.fg3_pct}%</span></div>
                          <div className="percentage-stat-track"><div className="percentage-stat-bar" style={{ width: `${selectedPlayer.current_stats.fg3_pct}%` }}></div></div>
                        </div>
                        <div className="percentage-stat-row">
                          <div className="percentage-stat-header"><span className="percentage-stat-name">Free Throw (FT%)</span><span className="percentage-stat-value">{selectedPlayer.current_stats.ft_pct}%</span></div>
                          <div className="percentage-stat-track"><div className="percentage-stat-bar" style={{ width: `${selectedPlayer.current_stats.ft_pct}%` }}></div></div>
                        </div>
                        <div className="percentage-stat-row" style={{ marginTop: '1.5rem' }}>
                          <div className="percentage-stat-header" style={{ marginBottom: 0 }}>
                            <span className="percentage-stat-name">Games Played / Playing Time</span>
                            <span className="percentage-stat-value">{selectedPlayer.current_stats.games_played} Games | {selectedPlayer.current_stats.minutes} MPG</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {modalTab === 'predictions' && (
                    <div>
                      {selectedPlayer.ml_stats ? (
                        <div className="ai-pred-cards-grid">
                          {['ppg', 'apg', 'rpg'].map((stat) => {
                            const labels = { ppg: 'Points Per Game (PPG)', apg: 'Assists Per Game (APG)', rpg: 'Rebounds Per Game (RPG)' };
                            const units = { ppg: 'PPG', apg: 'APG', rpg: 'RPG' };
                            const imp = selectedPlayer.ml_stats.improvements[stat];
                            return (
                              <div className="ai-pred-box" key={stat}>
                                <div className="ai-pred-box-label">{labels[stat]}</div>
                                <div className="ai-pred-values-flex">
                                  <span className="ai-pred-num old">{selectedPlayer.current_stats[stat]} <small>{units[stat]}</small></span>
                                  <span className="ai-pred-arrow">→</span>
                                  <span className="ai-pred-num new">{selectedPlayer.ml_stats.predicted_stats[stat]} <small>{units[stat]}</small></span>
                                </div>
                                <div className={`ai-pred-badge ${imp >= 0 ? 'positive' : 'negative'}`}>{imp >= 0 ? '+' : ''}{imp}%</div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>AI Prediction model is currently loading or unavailable for this player.</div>
                      )}
                    </div>
                  )}

                  {modalTab === 'history' && (
                    <div className="stats-history-table-container">
                      <div className="stats-history-scroll-box">
                        <table className="stats-history-table">
                          <thead>
                            <tr>
                              <th>Season</th><th>GP</th><th>MIN</th><th>PPG</th><th>RPG</th><th>APG</th><th>SPG</th><th>BPG</th><th>FG%</th><th>3P%</th><th>FT%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(selectedPlayer.history || {}).reverse().map(([year, stats]) => (
                              <tr key={year}>
                                <td><strong>{year}</strong></td>
                                <td>{stats.games_played}</td>
                                <td>{stats.minutes}</td>
                                <td>{stats.ppg}</td>
                                <td>{stats.rpg}</td>
                                <td>{stats.apg}</td>
                                <td>{stats.spg}</td>
                                <td>{stats.bpg}</td>
                                <td>{stats.fg_pct}%</td>
                                <td>{stats.fg3_pct}%</td>
                                <td>{stats.ft_pct}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
