import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PlayerPredictionGrid from './PlayerPredictionGrid';
import { PREDICTION_STATS, toPredictionPageStats } from '../config/predictionStats';
import './Predictions.css';

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
  const [modalTab, setModalTab] = useState('current');

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
    setModalTab('current');
    try {
      const response = await fetch(`/api/players/search-all?query=${encodeURIComponent(player.name)}`);
      const data = await response.json();
      const match = (data.players || []).find(p => p.name.toLowerCase() === player.name.toLowerCase());
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

  const API_BASE_URL = '/api';

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

      const response = await fetch(`${API_BASE_URL}/predictions?${params}`);
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

  const handleSort = (newSortBy) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('desc'); // Default to highest predictions/values first
    }
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedTeam('');
    setSelectedPosition('');
    setCurrentPage(1);
  };

  return (
    <div className="predictions-container">
      <div className="predictions-header">
        <Link to="/" className="back-to-home">Back to Home</Link>
        <h1>COURT VISION AI PREDICTIONS</h1>
        <p>Advanced neural network predictions comparing current season stats against forecasted results</p>
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
        <span className="sort-label">Sort by:</span>
        <button 
          className={`sort-btn ${sortBy === 'name' ? 'active' : ''}`}
          onClick={() => handleSort('name')}
        >
          Name {sortBy === 'name' && (sortOrder === 'asc' ? 'Asc' : 'Desc')}
        </button>
        <select
          className="filter-select prediction-sort-select"
          value={sortBy === 'name' ? '' : sortBy}
          onChange={(event) => {
            setSortBy(event.target.value);
            setSortOrder('desc');
            setCurrentPage(1);
          }}
        >
          <option value="" disabled>Predicted metric</option>
          {PREDICTION_STATS.map((stat) => (
            <option value={stat.predictedField} key={stat.key}>Predicted {stat.unit}</option>
          ))}
        </select>
        <button className="sort-btn" onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}>
          {sortOrder === 'asc' ? 'Lowest first' : 'Highest first'}
        </button>
      </div>

      {loading && predictions.length === 0 ? (
        <div className="loading">Generating NBA predictions...</div>
      ) : error ? (
        (() => {
          const serverUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
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
                </div>

                <div className="card-body">
                  <PlayerPredictionGrid {...toPredictionPageStats(player)} />
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
                        <PlayerPredictionGrid
                          currentStats={selectedPlayer.current_stats}
                          predictionStats={selectedPlayer.ml_stats.predicted_stats}
                          improvements={selectedPlayer.ml_stats.improvements}
                        />
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
    </div>
  );
};

export default Predictions;
