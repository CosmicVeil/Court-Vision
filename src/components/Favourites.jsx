import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getFavorites, removeFavorite } from '../utils/favorites';
import { isAuthenticated } from '../utils/auth';
import { buildApiUrl } from '../config/api';
import PlayerPredictionGrid from './PlayerPredictionGrid';
import './Favourites.css';

const Favourites = () => {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
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
      const response = await fetch(buildApiUrl(`players/search-all?query=${encodeURIComponent(player.name)}`));
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
            ppg: player.stats?.ppg_last || 0,
            rpg: player.stats?.rpg_last || 0,
            apg: player.stats?.apg_last || 0,
            spg: player.stats?.spg_last || 0,
            bpg: player.stats?.bpg_last || 0,
            tov: player.stats?.tov_last || 0,
            mpg: player.stats?.minutes || 0,
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

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = () => {
    try {
      const favList = getFavorites();
      setFavorites(favList);
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFavorite = (playerId) => {
    removeFavorite(playerId);
    loadFavorites();
  };

  if (!isAuthenticated()) {
    return (
      <div className="favourites-wrapper">
        <header className="favourites-header">
          <div className="stats-nav-top">
            <Link to="/" className="back-to-home">← HOME</Link>
            <span className="cv-section-badge">PLAYER ROSTER</span>
          </div>
          <h1 className="favourites-title">SAVED <span className="text-ember">FAVOURITES</span></h1>
          <p className="favourites-subtitle">Track and manage your personalized player watchlist</p>
        </header>
        <div className="empty-state" style={{ maxWidth: '520px', margin: '0 auto' }}>
          <div className="empty-icon-wrapper" style={{ margin: '0 auto 1.5rem', width: 64, height: 64, borderRadius: '50%', background: 'rgba(255, 100, 54, 0.12)', border: '1px solid rgba(255, 100, 54, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-ember-orange, #ff6436)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h2 className="empty-title">AUTHENTICATION REQUIRED</h2>
          <p className="empty-description">
            Create a free account or log in to track your favorite NBA players and save customized analytics.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '2rem' }}>
            <Link to="/login" className="empty-cta">LOG IN</Link>
            <Link to="/create-account" className="empty-cta" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,100,54,0.25)', color: '#fff', boxShadow: 'none' }}>CREATE ACCOUNT</Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="favourites-wrapper">
        <div className="loading-state">Loading favorites...</div>
      </div>
    );
  }

  return (
    <div className="favourites-wrapper">
      <header className="favourites-header">
        <div className="stats-nav-top">
          <Link to="/" className="back-to-home">← HOME</Link>
          <span className="cv-section-badge">PLAYER ROSTER</span>
        </div>
        <h1 className="favourites-title">
          SAVED <span className="text-ember">FAVOURITES</span>
        </h1>
        <p className="favourites-subtitle">
          Your personalized watchlist of tracked NBA athletes ({favorites.length} saved)
        </p>
      </header>

      {favorites.length === 0 ? (
        <div className="empty-state">
          <h2 className="empty-title">No favorites yet</h2>
          <p className="empty-description">
            Add players from Stats or AI Predictions to start tracking your favorites!
          </p>
          <Link to="/stats" className="empty-cta">
            Go to Stats →
          </Link>
        </div>
      ) : (
        <div className="favourites-content">
          <div className="favourites-info">
            <p className="info-text">
              Click the FAVORITED button to remove a player from favorites
            </p>
          </div>

          <div className="favourites-grid">
            {favorites.map(player => (
              <div 
                key={player.id} 
                className="favourite-card favourite-card-clickable"
                onClick={() => handlePlayerClick(player)}
                style={{ cursor: 'pointer' }}
              >
                <div className="card-header-fav">
                  <div className="player-header-info">
                    <h3 className="player-name-fav">{player.name}</h3>
                    <div className="player-meta-fav">
                      <span className="team-badge-fav">{player.team}</span>
                      <span className="position-badge-fav">{player.position}</span>
                    </div>
                  </div>
                  <button
                    className="favorite-btn-fav favorited"
                    onClick={(e) => { e.stopPropagation(); handleRemoveFavorite(player.id); }}
                    title="Remove from favorites"
                  >
                    FAVORITED
                  </button>
                </div>
                
                <div className="player-info-fav">
                  <div className="player-details-fav">
                    <span>Age: {player.age}</span>
                    {player.height && (
                      <span>Height: {Math.floor(player.height / 12)}'{player.height % 12}"</span>
                    )}
                    {player.weight && (
                      <span>Weight: {player.weight} lbs</span>
                    )}
                  </div>
                </div>

                {player.stats && (
                  <div className="player-stats-fav">
                    <h4 className="stats-title">Current Season Stats</h4>
                    <div className="stats-grid-fav">
                      <div className="stat-item-fav">
                        <span className="stat-label-fav">PPG</span>
                        <span className="stat-value-fav">{player.stats?.ppg_last?.toFixed(1) || '0.0'}</span>
                      </div>
                      <div className="stat-item-fav">
                        <span className="stat-label-fav">APG</span>
                        <span className="stat-value-fav">{player.stats?.apg_last?.toFixed(1) || '0.0'}</span>
                      </div>
                      <div className="stat-item-fav">
                        <span className="stat-label-fav">RPG</span>
                        <span className="stat-value-fav">{player.stats?.rpg_last?.toFixed(1) || '0.0'}</span>
                      </div>
                      <div className="stat-item-fav">
                        <span className="stat-label-fav">SPG</span>
                        <span className="stat-value-fav">{player.stats?.spg_last?.toFixed(1) || '0.0'}</span>
                      </div>
                      <div className="stat-item-fav">
                        <span className="stat-label-fav">BPG</span>
                        <span className="stat-value-fav">{player.stats?.bpg_last?.toFixed(1) || '0.0'}</span>
                      </div>
                      <div className="stat-item-fav">
                        <span className="stat-label-fav">FG%</span>
                        <span className="stat-value-fav">{player.stats?.fg_pct_last?.toFixed(1) || '0.0'}%</span>
                      </div>
                      {player.stats?.fg3_pct_last && (
                        <div className="stat-item-fav">
                          <span className="stat-label-fav">3P%</span>
                          <span className="stat-value-fav">{player.stats.fg3_pct_last.toFixed(1)}%</span>
                        </div>
                      )}
                      {player.stats?.ft_pct_last && (
                        <div className="stat-item-fav">
                          <span className="stat-label-fav">FT%</span>
                          <span className="stat-value-fav">{player.stats.ft_pct_last.toFixed(1)}%</span>
                        </div>
                      )}
                      {player.stats?.games_played && (
                        <div className="stat-item-fav">
                          <span className="stat-label-fav">Games</span>
                          <span className="stat-value-fav">{player.stats.games_played}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {player.trends && (
                  <div className="player-trends-fav">
                    <h4 className="trends-title">Performance Trends</h4>
                    <div className="trends-grid-fav">
                      {player.trends.consistency_score && (
                        <div className="trend-item-fav">
                          <span className="trend-label-fav">Consistency</span>
                          <span className="trend-value-fav">{player.trends.consistency_score.toFixed(2)}</span>
                        </div>
                      )}
                      {player.trends.ppg_trend !== undefined && (
                        <div className="trend-item-fav">
                          <span className="trend-label-fav">PPG Trend</span>
                          <span className={`trend-value-fav ${(player.trends.ppg_trend || 0) > 0 ? 'positive' : 'negative'}`}>
                            {(player.trends.ppg_trend || 0) > 0 ? '+' : ''}{player.trends.ppg_trend.toFixed(1)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
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
                  {modalTab === 'current' && (() => {
                    const stats = selectedPlayer.current_stats || selectedPlayer.stats || {};
                    const ppg = stats.ppg ?? stats.ppg_last ?? 0;
                    const apg = stats.apg ?? stats.apg_last ?? 0;
                    const rpg = stats.rpg ?? stats.rpg_last ?? 0;
                    const spg = stats.spg ?? stats.spg_last ?? 0;
                    const bpg = stats.bpg ?? stats.bpg_last ?? 0;
                    const fg_pct = stats.fg_pct ?? stats.fg_pct_last ?? 0;
                    const fg3_pct = stats.fg3_pct ?? stats.fg3_pct_last ?? 0;
                    const ft_pct = stats.ft_pct ?? stats.ft_pct_last ?? 0;
                    const gp = stats.games_played ?? 0;
                    const min = stats.minutes ?? stats.mpg ?? 0;

                    return (
                      <div>
                        <div className="stats-grid-container">
                          <div className="stat-box-card"><div className="stat-box-value highlighted">{ppg}</div><div className="stat-box-label">PPG</div></div>
                          <div className="stat-box-card"><div className="stat-box-value">{apg}</div><div className="stat-box-label">APG</div></div>
                          <div className="stat-box-card"><div className="stat-box-value">{rpg}</div><div className="stat-box-label">RPG</div></div>
                          <div className="stat-box-card"><div className="stat-box-value">{spg}</div><div className="stat-box-label">SPG</div></div>
                          <div className="stat-box-card"><div className="stat-box-value">{bpg}</div><div className="stat-box-label">BPG</div></div>
                        </div>
                        <div className="secondary-stats-container">
                          <h3 className="secondary-stats-title">Shooting &amp; Playing Time</h3>
                          <div className="percentage-stat-row">
                            <div className="percentage-stat-header"><span className="percentage-stat-name">Field Goal (FG%)</span><span className="percentage-stat-value">{fg_pct}%</span></div>
                            <div className="percentage-stat-track"><div className="percentage-stat-bar" style={{ width: `${Math.min(Math.max(fg_pct, 0), 100)}%` }}></div></div>
                          </div>
                          <div className="percentage-stat-row">
                            <div className="percentage-stat-header"><span className="percentage-stat-name">3-Point (3PT%)</span><span className="percentage-stat-value">{fg3_pct}%</span></div>
                            <div className="percentage-stat-track"><div className="percentage-stat-bar" style={{ width: `${Math.min(Math.max(fg3_pct, 0), 100)}%` }}></div></div>
                          </div>
                          <div className="percentage-stat-row">
                            <div className="percentage-stat-header"><span className="percentage-stat-name">Free Throw (FT%)</span><span className="percentage-stat-value">{ft_pct}%</span></div>
                            <div className="percentage-stat-track"><div className="percentage-stat-bar" style={{ width: `${Math.min(Math.max(ft_pct, 0), 100)}%` }}></div></div>
                          </div>
                          <div className="percentage-stat-row" style={{ marginTop: '1.5rem' }}>
                            <div className="percentage-stat-header" style={{ marginBottom: 0 }}>
                              <span className="percentage-stat-name">Games Played / Playing Time</span>
                              <span className="percentage-stat-value">{gp} Games | {min} MPG</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

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

export default Favourites;
