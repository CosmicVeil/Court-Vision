import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Recommendations.css';

const Recommendations = () => {
  const [selectedCategory, setSelectedCategory] = useState('players');
  const [topPerformers, setTopPerformers] = useState({});
  const [spotlightLoading, setSpotlightLoading] = useState(true);

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
                    const player = topPerformers[s];
                    if (!player) return null;
                    const improvement = player[`${s}_IMPROVEMENT`] || 0;
                    const last = player[`${s}_LAST`] || 0;
                    const predicted = player[`PREDICTED_${s}`] || 0;
                    const label = s === 'PPG' ? 'Scoring Outbreak' : s === 'APG' ? 'Playmaking Visionary' : 'Glass Dominator';
                    
                    return (
                      <div key={s} className="spotlight-card">
                        <div className="spotlight-badge-row">
                          <span className="spotlight-stat-tag">{s} Spotlight</span>
                          <span className="spotlight-role-tag">{label}</span>
                        </div>
                        <h3 className="spotlight-player-name">{player.PLAYER_NAME}</h3>
                        <div className="spotlight-team-badge">{player.TEAM} · {player.POSITION}</div>
                        
                        <div className="spotlight-growth-badge">
                          +{improvement.toFixed(1)}% {s} Breakout
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
                                <span className="spotlight-stat-growth">
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
    </div>
  );
};

export default Recommendations;
