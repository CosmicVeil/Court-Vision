import { useEffect, useState } from 'react';
import { getHeadshotUrl } from '../utils/team';
import './PlayerHeadshot.css';

// A player's official NBA headshot in a circle. A silhouette shows instead when the player has
// no NBA.com ID or the image fails to load (rookies and two-way players are often missing).
export default function PlayerHeadshot({ playerId, name = '', size = 'small', className = '' }) {
  const url = getHeadshotUrl(playerId, size);
  const [failed, setFailed] = useState(false);
  // The same component instance can be handed another player, so a past failure must not stick.
  useEffect(() => setFailed(false), [url]);

  return (
    <span className={`player-headshot ${className}`.trim()}>
      {url && !failed ? (
        // Decorative: the player's name is always printed next to the photo.
        <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <svg className="player-headshot-fallback" viewBox="0 0 24 24" role="img" aria-label={name ? `No photo of ${name}` : 'No photo'}>
          <circle cx="12" cy="9" r="4.2" />
          <path d="M3.5 24c0-5 3.8-8.2 8.5-8.2s8.5 3.2 8.5 8.2z" />
        </svg>
      )}
    </span>
  );
}
