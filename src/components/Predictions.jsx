import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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

  const formatPercentage = (past, predicted) => {
    if (!past) return '+100%';
    const pct = ((predicted - past) / past) * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
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
        <button 
          className={`sort-btn ${sortBy === 'predicted_ppg' ? 'active' : ''}`}
          onClick={() => handleSort('predicted_ppg')}
        >
          Predicted PPG {sortBy === 'predicted_ppg' && (sortOrder === 'asc' ? 'Asc' : 'Desc')}
        </button>
        <button 
          className={`sort-btn ${sortBy === 'predicted_apg' ? 'active' : ''}`}
          onClick={() => handleSort('predicted_apg')}
        >
          Predicted APG {sortBy === 'predicted_apg' && (sortOrder === 'asc' ? 'Asc' : 'Desc')}
        </button>
        <button 
          className={`sort-btn ${sortBy === 'predicted_rpg' ? 'active' : ''}`}
          onClick={() => handleSort('predicted_rpg')}
        >
          Predicted RPG {sortBy === 'predicted_rpg' && (sortOrder === 'asc' ? 'Asc' : 'Desc')}
        </button>
      </div>

      {loading && predictions.length === 0 ? (
        <div className="loading">Generating NBA predictions...</div>
      ) : error ? (
        <div className="error">
          Error: {error}
          <br />
          Make sure the Flask API server is running on http://localhost:5000
        </div>
      ) : predictions.length === 0 ? (
        <div className="no-results">No player predictions matched your search criteria.</div>
      ) : (
        <>
          <div className="predictions-grid">
            {predictions.map((player, idx) => (
              <div key={player.id || idx} className="prediction-card">
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
                  <div className="stat-comparison-row">
                    <div className="stat-type">PPG</div>
                    <div className="stat-values">
                      <div className="val-block">
                        <span className="val-lbl">Current</span>
                        <span className="val-num">{player.ppg_last.toFixed(1)}</span>
                      </div>
                      <div className="val-arrow">→</div>
                      <div className="val-block predicted">
                        <span className="val-lbl">Predicted</span>
                        <span className="val-num highlight">{player.predicted_ppg.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className={`growth-badge ${player.predicted_ppg >= player.ppg_last ? 'positive' : 'negative'}`}>
                      {formatPercentage(player.ppg_last, player.predicted_ppg)}
                    </div>
                  </div>

                  <div className="stat-comparison-row">
                    <div className="stat-type">APG</div>
                    <div className="stat-values">
                      <div className="val-block">
                        <span className="val-lbl">Current</span>
                        <span className="val-num">{player.apg_last.toFixed(1)}</span>
                      </div>
                      <div className="val-arrow">→</div>
                      <div className="val-block predicted">
                        <span className="val-lbl">Predicted</span>
                        <span className="val-num highlight">{player.predicted_apg.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className={`growth-badge ${player.predicted_apg >= player.apg_last ? 'positive' : 'negative'}`}>
                      {formatPercentage(player.apg_last, player.predicted_apg)}
                    </div>
                  </div>

                  <div className="stat-comparison-row">
                    <div className="stat-type">RPG</div>
                    <div className="stat-values">
                      <div className="val-block">
                        <span className="val-lbl">Current</span>
                        <span className="val-num">{player.rpg_last.toFixed(1)}</span>
                      </div>
                      <div className="val-arrow">→</div>
                      <div className="val-block predicted">
                        <span className="val-lbl">Predicted</span>
                        <span className="val-num highlight">{player.predicted_rpg.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className={`growth-badge ${player.predicted_rpg >= player.rpg_last ? 'positive' : 'negative'}`}>
                      {formatPercentage(player.rpg_last, player.predicted_rpg)}
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
    </div>
  );
};

export default Predictions;
