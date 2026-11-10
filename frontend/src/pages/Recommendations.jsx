import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PlayerStatsModal from '../components/PlayerStatsModal';
import TiltCard from '../components/TiltCard';
import { buildApiUrl } from '../config/api';
import { clearAuth } from '../utils/auth';
import { FPTS_TITLE, getFantasyComparison } from '../utils/fantasy';
import { samePlayerName } from '../utils/playerNames';
import { enterDelay } from '../utils/scrollReveal';
import { formatSoFarLine } from '../utils/seasonSoFar';
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

// Spotlight categories: the API stat key, its display name and the card's role tag.
const SPOTLIGHTS = [
  { stat: 'PPG', name: 'PPG', role: 'Scoring Outbreak' },
  { stat: 'APG', name: 'APG', role: 'Playmaking Visionary' },
  { stat: 'RPG', name: 'RPG', role: 'Glass Dominator' },
  { stat: 'FANTASY', name: 'FPTS', role: 'Fantasy Riser' },
];

const Recommendations = () => {
  const [topPerformers, setTopPerformers] = useState({});
  const [spotlightLoading, setSpotlightLoading] = useState(true);
  // Recommendations need a free account; set when the API answers 401 (signed out or expired).
  const [needsAuth, setNeedsAuth] = useState(false);

  // States for player details modal
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);

  const handlePlayerClick = async (player) => {
    setLoadingPlayer(true);
    try {
      const pName = player.name || player.PLAYER_NAME || '';
      const response = await fetch(buildApiUrl(`players/search-all?query=${encodeURIComponent(pName)}`));
      const data = await response.json();
      const match = (data.players || []).find(p => samePlayerName(p.name, player.name || player.PLAYER_NAME));
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
        const stats = ['PPG', 'APG', 'RPG', 'PRA', 'FANTASY'];
        const results = await Promise.all(
          stats.map(async (s) => {
            const res = await fetch(buildApiUrl(`recommendations/${s}`));
            if (res.status === 401) {
              return { stat: s, player: null, unauthorized: true };
            }
            if (res.ok) {
              const data = await res.json();
              if (data && data.length > 0) {
                return { stat: s, player: data[0] };
              }
            }
            return { stat: s, player: null };
          })
        );
        if (results.some(r => r.unauthorized)) {
          clearAuth();
          setNeedsAuth(true);
          return;
        }
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
    },

    {
      id: 5,
      title: 'Fantasy Risers',
      category: 'Trending',
      description: 'Players projected to add the most FanDuel fantasy points per game across every stat',
      icon: 'FPTS',
      details: 'Biggest predicted fantasy points per game jumps for players next season',
      link: '/recommendations/FANTASY'
    }
  ]

  return (
    <div className="recommendations-wrapper">
      <header className="recommendations-header" data-enter>
        <div className="stats-nav-top">
          <span className="cv-section-badge">INTELLIGENCE RADAR</span>
        </div>
        <h1 className="recommendations-title">
          BREAKOUT <span className="text-ember">RECOMMENDATIONS</span>
        </h1>
        <p className="recommendations-subtitle">
          Players our model expects to improve the most per game next season, compared with their current averages
        </p>
      </header>

      <div className="recommendations-content">
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
            ) : needsAuth ? (
              <div className="predictions-locked">
                <div className="predictions-locked-icon" aria-hidden="true">🔒</div>
                <h2 className="predictions-locked-title">Sign in to see full predictions</h2>
                <p className="predictions-locked-desc">
                  Breakout recommendations are a free account feature. Log in or create an
                  account to see the players our model projects to make the biggest jumps.
                </p>
                <div className="predictions-locked-actions">
                  <Link to="/login" state={{ from: '/recommendations' }} className="empty-cta">Log In</Link>
                  <Link to="/create-account" state={{ from: '/recommendations' }} className="empty-cta prediction-auth-secondary">
                    Create Account
                  </Link>
                </div>
              </div>
            ) : (
              <div className="spotlight-grid">
                {SPOTLIGHTS.map(({ stat: s, name, role }, index) => {
                  // Fantasy points have no built-in fallback player, so that card waits for real data.
                  const player = topPerformers[s] || FALLBACK_PLAYERS[s];
                  if (!player) return null;
                  const improvement = player[`${s}_IMPROVEMENT`] || 0;
                  const fantasy = getFantasyComparison(player);
                  
                  return (
                    <TiltCard key={s} className="spotlight-card" data-enter style={enterDelay(index + 1)} cta="Full projection">
                      <div className="spotlight-badge-row">
                        <span className="spotlight-stat-tag">{name} Spotlight</span>
                        <span className="spotlight-role-tag">{role}</span>
                      </div>
                      <h3 className="spotlight-player-name">
                        <button
                          type="button"
                          className="card-open"
                          onClick={() => handlePlayerClick({ name: player.PLAYER_NAME || player.name, team: player.TEAM || player.team, position: player.POSITION || player.position })}
                        >
                          {player.PLAYER_NAME}
                        </button>
                      </h3>
                      <div className="spotlight-team-badge">{player.TEAM} · {player.POSITION}</div>
                      
                      <div className={`spotlight-growth-badge ${improvement >= 0 ? 'positive' : 'negative'}`}>
                        {improvement >= 0 ? '+' : ''}{improvement.toFixed(1)}% {name} Breakout
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
                        {fantasy && (
                          <div className={`spotlight-stat-row ${s === 'FANTASY' ? 'highlighted' : ''}`}>
                            <span className="stat-label" title={FPTS_TITLE}>FPTS</span>
                            <div className="spotlight-stat-comparison">
                              <span className="spotlight-stat-val">{fantasy.last.toFixed(1)}</span>
                              <span className="spotlight-stat-arrow">→</span>
                              <span className="spotlight-stat-val predicted">{fantasy.predicted.toFixed(1)}</span>
                            </div>
                            <span className={`spotlight-stat-growth ${fantasy.change >= 0 ? 'positive' : 'negative'}`}>
                              {fantasy.change >= 0 ? '+' : ''}{fantasy.change.toFixed(1)}%
                            </span>
                          </div>
                        )}
                        <div className="spotlight-stat-row">
                          <span className="stat-label">2026-27 SO FAR</span>
                          <span className="spotlight-stat-val" data-numeric>{formatSoFarLine(player)}</span>
                        </div>
                      </div>
                    </TiltCard>
                  );
                })}
              </div>
            )}
          </div>

          {/* Held back until the spotlight resolves: shown under the small loader, these cards would
              be pushed off-screen when the four tall spotlight cards arrive (a layout shift). */}
          {!spotlightLoading && (
            <>
              <h2 className="section-heading" data-enter style={enterDelay(4)}>Basketball Insights & Trends</h2>
              <p className="section-description" data-enter style={enterDelay(4)}>
                Discover key insights, trends, and analysis powered by AI to help you understand the game better
              </p>
              <div className="recommendations-grid">
                {insights.map((insight) => (
                  <TiltCard key={insight.id} className="recommendation-card insight-card" data-enter style={enterDelay(insight.id + 4)}>
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
                  </TiltCard>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <PlayerStatsModal player={selectedPlayer} loading={loadingPlayer} onClose={() => setSelectedPlayer(null)} />
    </div>
  );
};

export default Recommendations;
