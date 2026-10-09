import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getFavorites, normalizeFavoritePlayer, removeFavorite } from '../utils/favorites';
import { isAuthenticated } from '../utils/auth';
import { buildApiUrl } from '../config/api';
import PlayerStatsModal from '../components/PlayerStatsModal';
import { samePlayerName } from '../utils/playerNames';
import './Favourites.css';

const Favourites = () => {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);

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
      const pName = player.name || '';
      const response = await fetch(buildApiUrl(`players/search-all?query=${encodeURIComponent(pName)}`));
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
            ppg: player.stats?.ppg_last ?? 0,
            rpg: player.stats?.rpg_last ?? 0,
            apg: player.stats?.apg_last ?? 0,
            spg: player.stats?.spg_last ?? 0,
            bpg: player.stats?.bpg_last ?? 0,
            tov: player.stats?.tov_last ?? 0,
            mpg: player.stats?.minutes ?? 0,
            fg_pct: player.stats?.fg_pct_last ?? 0,
            fg3_pct: player.stats?.fg3_pct_last ?? 0,
            ft_pct: player.stats?.ft_pct_last ?? 0,
            games_played: player.stats?.games_played ?? 0,
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
      setFavorites(favList.map(normalizeFavoritePlayer));
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
                    aria-label={`Remove ${player.name} from favourites`}
                  >
                    FAVORITED
                  </button>
                </div>
                
                <div className="player-info-fav">
                  <div className="player-details-fav">
                    {player.age !== null && player.age !== undefined && <span className="player-detail-item-fav">Age: {player.age}</span>}
                    {player.height !== null && player.height !== undefined && (
                      <span className="player-detail-item-fav">Height: {Math.floor(player.height / 12)}'{player.height % 12}"</span>
                    )}
                    {player.weight !== null && player.weight !== undefined && (
                      <span className="player-detail-item-fav">Weight: {player.weight} lbs</span>
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
                      {player.stats?.fg3_pct_last !== null && player.stats?.fg3_pct_last !== undefined && (
                        <div className="stat-item-fav">
                          <span className="stat-label-fav">3P%</span>
                          <span className="stat-value-fav">{player.stats.fg3_pct_last.toFixed(1)}%</span>
                        </div>
                      )}
                      {player.stats?.ft_pct_last !== null && player.stats?.ft_pct_last !== undefined && (
                        <div className="stat-item-fav">
                          <span className="stat-label-fav">FT%</span>
                          <span className="stat-value-fav">{player.stats.ft_pct_last.toFixed(1)}%</span>
                        </div>
                      )}
                      {player.stats?.games_played !== null && player.stats?.games_played !== undefined && (
                        <div className="stat-item-fav">
                          <span className="stat-label-fav">Games</span>
                          <span className="stat-value-fav">{player.stats.games_played}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {player.trends && [
                  player.trends.consistency_score,
                  player.trends.ppg_trend,
                  player.trends.apg_trend,
                  player.trends.rpg_trend,
                ].some(value => value !== null && value !== undefined) && (
                  <div className="player-trends-fav">
                    <h4 className="trends-title">Performance Trends</h4>
                    <div className="trends-grid-fav">
                      {player.trends.consistency_score !== null && player.trends.consistency_score !== undefined && (
                        <div className="trend-item-fav">
                          <span className="trend-label-fav">Consistency</span>
                          <span className="trend-value-fav">{player.trends.consistency_score.toFixed(2)}</span>
                        </div>
                      )}
                      {player.trends.ppg_trend !== null && player.trends.ppg_trend !== undefined && (
                        <div className="trend-item-fav">
                          <span className="trend-label-fav">PPG Trend</span>
                          <span className={`trend-value-fav ${(player.trends.ppg_trend || 0) > 0 ? 'positive' : 'negative'}`}>
                            {(player.trends.ppg_trend || 0) > 0 ? '+' : ''}{player.trends.ppg_trend.toFixed(1)}
                          </span>
                        </div>
                      )}
                      {player.trends.apg_trend !== null && player.trends.apg_trend !== undefined && (
                        <div className="trend-item-fav">
                          <span className="trend-label-fav">APG Trend</span>
                          <span className={`trend-value-fav ${player.trends.apg_trend > 0 ? 'positive' : 'negative'}`}>
                            {player.trends.apg_trend > 0 ? '+' : ''}{player.trends.apg_trend.toFixed(1)}
                          </span>
                        </div>
                      )}
                      {player.trends.rpg_trend !== null && player.trends.rpg_trend !== undefined && (
                        <div className="trend-item-fav">
                          <span className="trend-label-fav">RPG Trend</span>
                          <span className={`trend-value-fav ${player.trends.rpg_trend > 0 ? 'positive' : 'negative'}`}>
                            {player.trends.rpg_trend > 0 ? '+' : ''}{player.trends.rpg_trend.toFixed(1)}
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

      <PlayerStatsModal player={selectedPlayer} loading={loadingPlayer} onClose={() => setSelectedPlayer(null)} />
    </div>
  );
};

export default Favourites;
