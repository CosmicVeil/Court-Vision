import ContentSkeleton from '../components/ContentSkeleton';
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { applyFavoriteTeams, getFavorites, normalizeFavoritePlayer, removeFavorite } from '../utils/favorites';
import { isAuthenticated } from '../utils/auth';
import { buildApiUrl } from '../config/api';
import PageHero from '../components/PageHero';
import PlayerCard from '../components/PlayerCard';
import ScrollReveal from '../components/ScrollReveal';
import { getFavouritesHeroStats } from '../utils/pageHero';
import { getFavouriteCardStats } from '../utils/playerCard';
import { playerPath } from '../utils/playerPage';
import './Favourites.css';
import { enterDelay } from '../utils/scrollReveal';

const Favourites = () => {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const authenticated = isAuthenticated();
  const navigate = useNavigate();

  const handlePlayerClick = (player) => {
    navigate(playerPath(player), { state: { player } });
  };

  useEffect(() => {
    if (!authenticated) return;
    const saved = getFavorites().map(normalizeFavoritePlayer);
    setFavorites(saved);
    setLoading(false);
    if (saved.length === 0) return;

    const controller = new AbortController();
    fetch(buildApiUrl('players/teams'), { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Unable to load current player teams');
        return response.json();
      })
      .then(({ teams_by_player_id }) => {
        if (!controller.signal.aborted) {
          setFavorites(current => applyFavoriteTeams(current, teams_by_player_id));
        }
      })
      .catch(error => {
        if (!controller.signal.aborted) console.error('Error refreshing favourite teams:', error);
      });
    return () => controller.abort();
  }, [authenticated]);

  const handleRemoveFavorite = (playerId) => {
    if (removeFavorite(playerId)) {
      setFavorites(current => current.filter(player => player.id !== playerId));
    }
  };

  const hero = (lead, stats) => (
    <PageHero eyebrow="PLAYER ROSTER" title="Saved" accent="Favourites" lead={lead} stats={stats} />
  );

  if (!authenticated) {
    return (
      <div className="favourites-wrapper">
        {hero('Track and manage your personalized player watchlist')}
        <div className="empty-state is-locked" data-enter style={enterDelay(1)}>
          <div className="empty-icon-wrapper">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-ember-orange, #ff6436)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h2 className="empty-title">AUTHENTICATION REQUIRED</h2>
          <p className="empty-description">
            Create a free account or log in to track your favorite NBA players and save customized analytics.
          </p>
          <div className="empty-actions">
            <Link to="/login" className="empty-cta">LOG IN</Link>
            <Link to="/create-account" className="empty-cta is-secondary">CREATE ACCOUNT</Link>
          </div>
        </div>
      </div>
    );
  }

  // One tree for loading and loaded, so ScrollReveal is already mounted when the cards
  // arrive and they rise in (it never hides content that is on screen at mount).
  return (
    <div className="favourites-wrapper">
      {hero('Your personalized watchlist of tracked NBA athletes', getFavouritesHeroStats({ ready: !loading, favorites }))}

      {loading ? (
        <ContentSkeleton count={3} label="Loading favorites…" />
      ) : favorites.length === 0 ? (
        <div className="empty-state" data-enter style={enterDelay(1)}>
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
          <p className="info-text" data-enter style={enterDelay(1)}>
            Click the FAVORITED button to remove a player from favorites
          </p>

          <div className="pc-grid">
            {favorites.map((player, index) => {
              const { main, extra } = getFavouriteCardStats(player);
              const hasTrends = player.trends && [
                player.trends.consistency_score,
                player.trends.ppg_trend,
                player.trends.apg_trend,
                player.trends.rpg_trend,
              ].some(value => value !== null && value !== undefined);
              return (
                <PlayerCard
                  key={player.id}
                  index={index}
                  player={player}
                  stats={main}
                  statsLabel="Current Season Stats"
                  extraStats={extra}
                  isFavorite
                  onToggleFavorite={() => handleRemoveFavorite(player.id)}
                  onOpen={() => handlePlayerClick(player)}
                  ctaLabel="Full profile"
                >
                  {(player.height !== null || player.weight !== null) && (
                    <p className="player-details-fav">
                      {player.height !== null && <span className="player-detail-item-fav">Height: {Math.floor(player.height / 12)}'{player.height % 12}"</span>}
                      {player.weight !== null && <span className="player-detail-item-fav">Weight: {player.weight} lbs</span>}
                    </p>
                  )}

                  {hasTrends && (
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
                            <span className={`trend-value-fav ${player.trends.ppg_trend > 0 ? 'positive' : 'negative'}`}>
                              {player.trends.ppg_trend > 0 ? '+' : ''}{player.trends.ppg_trend.toFixed(1)}
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
                </PlayerCard>
              );
            })}
          </div>
        </div>
      )}

      <ScrollReveal scanKey={favorites} />
    </div>
  );
};

export default Favourites;
