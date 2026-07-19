import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PlayerPredictionGrid from './PlayerPredictionGrid';
import './Recommendations.css';

const FALLBACK_PLAYERS = {
  PPG: {
    PLAYER_NAME: "Bez Mbeng",
    TEAM: "UTA",
    POSITION: "SG",
    PPG_LAST: 8.1,
    PREDICTED_PPG: 10.6,
    PPG_IMPROVEMENT: 31.0,
    APG_LAST: 4.1,
    PREDICTED_APG: 4.3,
    APG_IMPROVEMENT: 5.3,
    RPG_LAST: 3.8,
    PREDICTED_RPG: 4.9,
    RPG_IMPROVEMENT: 30.1
  },
  APG: {
    PLAYER_NAME: "Stephen Curry",
    TEAM: "GSW",
    POSITION: "PG",
    PPG_LAST: 26.6,
    PREDICTED_PPG: 28.9,
    PPG_IMPROVEMENT: 8.7,
    APG_LAST: 4.7,
    PREDICTED_APG: 5.6,
    APG_IMPROVEMENT: 18.2,
    RPG_LAST: 3.6,
    PREDICTED_RPG: 4.6,
    RPG_IMPROVEMENT: 28.6
  },
  RPG: {
    PLAYER_NAME: "Kadary Richmond",
    TEAM: "WAS",
    POSITION: "SG",
    PPG_LAST: 8.3,
    PREDICTED_PPG: 10.1,
    PPG_IMPROVEMENT: 22.2,
    APG_LAST: 2.7,
    PREDICTED_APG: 3.2,
    APG_IMPROVEMENT: 16.8,
    RPG_LAST: 3.3,
    PREDICTED_RPG: 5.3,
    RPG_IMPROVEMENT: 59.8
  }
};

const Recommendations = () => {
  const [selectedCategory, setSelectedCategory] = useState('players');
  const [topPerformers, setTopPerformers] = useState({});
  const [spotlightLoading, setSpotlightLoading] = useState(true);

  // States for player details modal
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  const [modalTab, setModalTab] = useState('current'); // current, predictions, history

  const handlePlayerClick = async (player) => {
    setLoadingPlayer(true);
    setModalTab('current');
    try {
      const response = await fetch(`/api/players/search-all?query=${encodeURIComponent(player.name || player.PLAYER_NAME)}`);
      const data = await response.json();
      const match = (data.players || []).find(p => p.name.toLowerCase() === (player.name || player.PLAYER_NAME).toLowerCase());
      if (match) {
        setSelectedPlayer(match);
      } else {
        setSelectedPlayer({
          name: player.name || player.PLAYER_NAME,
          team: player.team || player.TEAM || 'UNK',
          position: player.position || player.POSITION || 'UNK',
          current_stats: {
            ppg: player.pts || player.PPG_LAST || 0,
            rpg: player.reb || player.RPG_LAST || 0,
            apg: player.ast || player.APG_LAST || 0,
            spg: player.stl || player.SPG_LAST || 0,
            bpg: player.blk || player.BPG_LAST || 0,
            tov: player.tov || player.TOV_LAST || 0,
            mpg: player.min || player.MIN_LAST || 0,
            fg_pct: 0, fg3_pct: 0, ft_pct: 0, games_played: 0, minutes: 0
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
    const fetchSpotlights = async () => {
      try {
        setSpotlightLoading(true);
        const stats = ['PPG', 'APG', 'RPG', 'PRA'];
        const results = await Promise.all(
          stats.map(async (s) => {
            const res = await fetch(`/api/recommendations/${s}`);
            if (res.ok) {
              const data = await res.json();
              if (data && data.length > 0) {
                return { stat: s, player: data[0] };
              }
            }
            return { stat: s, player: null };
          })
        );
        const mapping = {};
        results.forEach(r => {
          mapping[r.stat] = r.player;
        });
        setTopPerformers(mapping);
      } catch (err) {
        console.error("Error fetching spotlights", err);
      } finally {
        setSpotlightLoading(false);
      }
    };
    fetchSpotlights();
  }, []);

  const insights = [
    {
      id: 1,
      title: 'Rising Stars',
      category: 'Trending',
      description: 'Young players showing exceptional growth this season with significant stat improvements',
      icon: 'TREND',
      details: 'Biggest predicted PRA jumps for players next season',
      link: '/recommendations/PRA'
    },

    {
      id: 2,
      title: 'Bucket Getters',
      category: 'Trending',
      description: 'Young players showing exceptional growth this season with significant PPG improvements',
      icon: 'PPG',
      details: 'Biggest predicted PPG jumps for players next season',
      link: '/recommendations/PPG'
    },

    {
      id: 3,
      title: 'Assist Leaders',
      category: 'Trending',
      description: 'Young players showing exceptional growth this season with significant APG improvements',
      icon: 'APG',
      details: 'Biggest predicted APG jumps for players next season',
      link: '/recommendations/APG'
    },

    {
      id: 4,
      title: 'Rebound Leaders',
      category: 'Trending',
      description: 'Young players showing exceptional growth this season with significant RPG improvements',
      icon: 'RPG',
      details: 'Biggest predicted RPG jumps for players next season',
      link: '/recommendations/RPG'
    }
  ]

  return (
    <div className="recommendations-wrapper">
      <header className="recommendations-header">
        <Link to="/" className="back-link">← Back to Home</Link>
        <h1 className="recommendations-title">
          RECOMMENDATIONS
        </h1>
        <p className="recommendations-subtitle">
          AI-powered personalized recommendations based on your preferences
        </p>
      </header>

      <div className="recommendations-content">
        <div className="category-tabs">
          <button
            className={`tab-button ${selectedCategory === 'players' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('players')}
          >
            Insights & Analysis
          </button>
        </div>

        {selectedCategory === 'players' && (
          <div className="recommendations-section">
            
            {/* Live AI Spotlight Section */}
            <div className="spotlight-section">
              <h2 className="spotlight-heading">LIVE AI RADAR</h2>
              <p className="spotlight-subheading">The #1 predicted breakout players across the league next season</p>
              {spotlightLoading ? (
                <div className="spotlight-loader-wrap">
                  <div className="spotlight-spinner"></div>
                  <p className="spotlight-loader">Calculating AI Forecasts...</p>
                </div>
              ) : (
                <div className="spotlight-grid">
                  {['PPG', 'APG', 'RPG'].map((s) => {
                    const player = topPerformers[s] || FALLBACK_PLAYERS[s];
                    const improvement = player[`${s}_IMPROVEMENT`] || 0;
                    const last = player[`${s}_LAST`] || 0;
                    const predicted = player[`PREDICTED_${s}`] || 0;
                    const label = s === 'PPG' ? 'Scoring Outbreak' : s === 'APG' ? 'Playmaking Visionary' : 'Glass Dominator';
                    
                    return (
                      <div 
                        key={s} 
                        className="spotlight-card"
                        onClick={() => handlePlayerClick({ name: player.PLAYER_NAME || player.name, team: player.TEAM || player.team, position: player.POSITION || player.position })}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="spotlight-badge-row">
                          <span className="spotlight-stat-tag">{s} Spotlight</span>
                          <span className="spotlight-role-tag">{label}</span>
                        </div>
                        <h3 className="spotlight-player-name">{player.PLAYER_NAME}</h3>
                        <div className="spotlight-team-badge">{player.TEAM} · {player.POSITION}</div>
                        
                        <div className={`spotlight-growth-badge ${improvement >= 0 ? 'positive' : 'negative'}`}>
                          {improvement >= 0 ? '+' : ''}{improvement.toFixed(1)}% {s} Breakout
                        </div>
                        
                        <div className="spotlight-stats-list">
                          {['PPG', 'APG', 'RPG'].map((statName) => {
                            const lastVal = player[`${statName}_LAST`] || 0;
                            const predVal = player[`PREDICTED_${statName}`] || 0;
                            const impVal = player[`${statName}_IMPROVEMENT`] || 0;
                            const isMainStat = statName === s;
                            
                            return (
                              <div key={statName} className={`spotlight-stat-row ${isMainStat ? 'highlighted' : ''}`}>
                                <span className="stat-label">{statName}</span>
                                <div className="spotlight-stat-comparison">
                                  <span className="spotlight-stat-val">{lastVal.toFixed(1)}</span>
                                  <span className="spotlight-stat-arrow">→</span>
                                  <span className="spotlight-stat-val predicted">{predVal.toFixed(1)}</span>
                                </div>
                                <span className={`spotlight-stat-growth ${impVal >= 0 ? 'positive' : 'negative'}`}>
                                  {impVal >= 0 ? '+' : ''}{impVal.toFixed(1)}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <h2 className="section-heading">Basketball Insights & Trends</h2>
            <p className="section-description">
              Discover key insights, trends, and analysis powered by AI to help you understand the game better
            </p>
            <div className="recommendations-grid">
              {insights.map((insight) => (
                <div key={insight.id} className="recommendation-card insight-card">
                  <div className="card-header">
                    <div className="insight-icon">{insight.icon}</div>
                    <div className="category-badge">{insight.category}</div>
                  </div>
                  <div className="card-body">
                    <h3 className="insight-title">{insight.title}</h3>
                    <p className="recommendation-reason">{insight.description}</p>
                    <div className="insight-details">
                      <span className="details-text">{insight.details}</span>
                    </div>
                  </div>
                  <div className="card-footer">
                    <Link to={insight.link} className="view-stats-link">
                      Explore More →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedCategory === 'games' && (
          <div className="recommendations-section">
            <h2 className="section-heading">Recommended Games to Watch</h2>
            <p className="section-description">
              AI predictions for upcoming games based on team performance and matchups
            </p>
            <div className="games-grid">
              {upcomingGames.map((game) => (
                <div key={game.id} className="game-card">
                  <div className="game-header">
                    <div className="game-teams">
                      <span className="team-name">{game.team1}</span>
                      <span className="vs">VS</span>
                      <span className="team-name">{game.team2}</span>
                    </div>
                    <div className="game-prediction">
                      <span className="prediction-label">AI Prediction</span>
                      <span className="prediction-value">{game.prediction}</span>
                    </div>
                  </div>
                  <div className="game-body">
                    <div className="game-date">{game.date}</div>
                    <div className="game-matchup">
                      <span className="matchup-label">Key Matchup:</span>
                      <span className="matchup-value">{game.keyMatchup}</span>
                    </div>
                    <p className="game-reason">{game.reason}</p>
                  </div>
                  <div className="game-footer">
                    <Link to="/stats" className="view-details-link">
                      View Details →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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

export default Recommendations;
