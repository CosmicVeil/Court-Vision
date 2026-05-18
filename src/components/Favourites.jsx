import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getFavorites, removeFavorite } from '../utils/favorites';
import './Favourites.css';

const Favourites = () => {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

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
        <Link to="/" className="back-link">← Back to Home</Link>
        <h1 className="favourites-title">
          FAVOURITES
        </h1>
        <p className="favourites-subtitle">
          Your favorite NBA players ({favorites.length})
        </p>
      </header>

      {favorites.length === 0 ? (
        <div className="empty-state">
          <h2 className="empty-title">No favorites yet</h2>
          <p className="empty-description">
            Go to the Stats page and add players to favorites!
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
              <div key={player.id} className="favourite-card">
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
                    onClick={() => handleRemoveFavorite(player.id)}
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
    </div>
  );
};

export default Favourites;
