import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PlayerStatsModal from '../components/PlayerStatsModal';
import { PREDICTION_STATS } from '../config/predictionStats';
import { getFavorites, toggleFavorite } from '../utils/favorites';
import { isAuthenticated } from '../utils/auth';
import { buildApiUrl } from '../config/api';
import { samePlayerName } from '../utils/playerNames';
import './Predictions.css';

const MAIN_PREDICTION_STATS = [
  { key: 'predicted_ppg', label: 'PPG' },
  { key: 'predicted_apg', label: 'APG' },
  { key: 'predicted_rpg', label: 'RPG' },
];

const CURRENT_SHOOTING_STATS = [
  { key: 'fg_pct_last', label: 'FG%' },
  { key: 'fg3_pct_last', label: '3P%' },
  { key: 'ft_pct_last', label: 'FT%' },
];

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

const Predictions = () => {
  const [predictions, setPredictions] = useState([]);
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
  const [sortBy, setSortBy] = useState('predicted_ppg');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [showAuthModal, setShowAuthModal] = useState(false);

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

  useEffect(() => {
    fetchPredictions();
  }, [currentPage, searchTerm, selectedTeam, selectedPosition, sortBy, sortOrder]);

  const fetchPredictions = async () => {
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

      const response = await fetch(buildApiUrl(`predictions?${params}`));
      if (!response.ok) throw new Error('Failed to fetch predictions');

      const data = await response.json();
      setPredictions(data.predictions || []);
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

  const handleSortFieldChange = (event) => {
    const nextSortBy = event.target.value;
    setSortBy(nextSortBy);
    setSortOrder(nextSortBy === 'name' ? 'asc' : 'desc');
    setCurrentPage(1);
  };

  const handleSortDirectionChange = () => {
    setSortOrder((currentOrder) => currentOrder === 'asc' ? 'desc' : 'asc');
    setCurrentPage(1);
  };

  const isNameSort = sortBy === 'name';
  const sortDirectionLabel = sortOrder === 'asc'
    ? (isNameSort ? 'A to Z' : 'Lowest to Highest')
    : (isNameSort ? 'Z to A' : 'Highest to Lowest');

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedTeam('');
    setSelectedPosition('');
    setCurrentPage(1);
  };

  return (
    <div className="predictions-container">
      <div className="predictions-header">
        <div className="stats-nav-top">
          <Link to="/" className="back-to-home">← HOME</Link>
          <span className="cv-section-badge">AI FORECASTING</span>
        </div>
        <h1>NEURAL MATCHUP <span className="text-ember">PREDICTIONS</span></h1>
        <p>Advanced neural network models forecasting player performance, breakout indicators, and season trends</p>
      </div>

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

        <button onClick={clearFilters} className="clear-filters-btn">
          Clear Filters
        </button>
      </div>

      <div className="sorting-section">
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
          <div className="predictions-grid">
            {predictions.map((player, idx) => (
              <div 
                key={player.id || idx} 
                className="prediction-card prediction-card-clickable"
                onClick={() => handlePlayerClick(player)}
                style={{ cursor: 'pointer' }}
              >
                <div className="card-header">
                  <div className="player-meta">
                    <h3>{player.name}</h3>
                    <div className="player-badges">
                      <span className="team-badge">{player.team}</span>
                      <span className="position-badge">{player.position}</span>
                      <span className="age-badge">Age {player.age}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`prediction-favorite-btn ${favoriteIds.has(player.id) ? 'favorited' : ''}`}
                    onClick={(event) => handleFavoriteToggle(event, player)}
                    aria-pressed={favoriteIds.has(player.id)}
                    aria-label={favoriteIds.has(player.id)
                      ? `Remove ${player.name} from favorites`
                      : `Add ${player.name} to favorites`}
                  >
                    {favoriteIds.has(player.id) ? 'FAVORITED' : 'ADD FAV'}
                  </button>
                </div>

                <div className="card-body">
                  <div className="prediction-card-main-stats">
                    {MAIN_PREDICTION_STATS.map((stat) => (
                      <div className="prediction-main-stat" key={stat.key}>
                        <span className="prediction-main-stat-value">
                          {(Number(player[stat.key]) || 0).toFixed(1)}
                        </span>
                        <span className="prediction-main-stat-label">Predicted {stat.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="prediction-card-shooting">
                    <span className="prediction-shooting-heading">This Season Shooting</span>
                    <div className="prediction-shooting-grid">
                      {CURRENT_SHOOTING_STATS.map((stat) => (
                        <div className="prediction-shooting-stat" key={stat.key}>
                          <span className="prediction-shooting-value">
                            {(Number(player[stat.key]) || 0).toFixed(1)}%
                          </span>
                          <span className="prediction-shooting-label">{stat.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pagination">
            <div className="pagination-controls">
              <button 
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
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
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="pagination-btn"
              >
                Next Page
              </button>
            </div>
          </div>
        </>
      )}

      {loading && predictions.length > 0 && (
        <div className="loading-overlay">
          <div className="loading">Updating Predictions...</div>
        </div>
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
