import { Link } from 'react-router-dom';
import { getGameDetailPath } from '../utils/liveGames';
import { getOrbitChips } from '../utils/liveInteractions';

// Live scores floating around the hero heading. A mouse shortcut only: the game
// cards are the accessible path, so the chips stay out of the tab order and the tree.
export default function HeroOrbit({ games }) {
  const chips = getOrbitChips(games);
  if (!chips.length) return null;
  return (
    <div className="hero-orbit" aria-hidden="true" data-defer>
      {chips.map(({ gameId, matchup, status, slot }, index) => (
        <div key={gameId} className="orbit-slot" data-side={slot.side}
          style={{ [slot.side === 'left' ? 'right' : 'left']: `calc(100% + ${slot.gap})`, top: slot.y, '--r': slot.r, '--hx': slot.hx, '--hy': slot.hy }}>
          <div className="orbit-drift">
            <Link to={getGameDetailPath(gameId)} tabIndex={-1} className="orbit-chip"
              style={{ '--chip-delay': `${500 + index * 140}ms`, '--float-delay': `${index * -2}s` }}>
              <span className="pulse-dot" />
              <span data-numeric>{matchup}</span>
              <span className="orbit-chip-status">{status}</span>
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
