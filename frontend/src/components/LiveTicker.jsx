import { Link } from 'react-router-dom';
import { getGameDetailPath } from '../utils/liveGames';
import { getTickerItems } from '../utils/liveInteractions';

// A scrolling score strip. The track holds two copies so translating it by -50% loops
// seamlessly. Decorative duplicate of the cards, so it is hidden from assistive tech.
export default function LiveTicker({ games }) {
  const items = getTickerItems(games);
  if (items.length < 2) return null;
  const row = copy => items.map(item => (
    <Link key={`${copy}-${item.gameId}`} to={getGameDetailPath(item.gameId)} tabIndex={-1}
      className={`ticker-item ${item.live ? 'is-live' : ''}`}>
      {item.live && <span className="pulse-dot" />}
      <span data-numeric className="ticker-matchup">{item.matchup}</span>
      <span className="ticker-status">{item.status}</span>
    </Link>
  ));
  return (
    <div className="lg-ticker" aria-hidden="true" data-defer>
      <div className="ticker-track" style={{ '--marquee-duration': `${Math.max(24, items.length * 7)}s` }}>
        {row('a')}{row('b')}
      </div>
    </div>
  );
}
