import { useEffect, useRef } from 'react';
import usePointerTilt from '../hooks/usePointerTilt';
import { getChangedStatKeys, toStatValues } from '../utils/playerCard';
import { getRevealDelay } from '../utils/scrollReveal';
import './PlayerCard.css';

const DELTA_ARROWS = { up: '↑', down: '↓', flat: '→' };

function StatList({ stats, label, className, changed }) {
  if (!stats?.length) return null;
  return (
    <div className={className}>
      {label && <p className="pc-section-label">{label}</p>}
      <dl className="pc-stat-list">
        {stats.map(stat => (
          <div key={stat.key} className="pc-stat">
            <dt>{stat.label}</dt>
            {/* Keyed by value, so a changed value mounts fresh and its tick-in plays from the start. */}
            <dd key={stat.value} className="pc-stat-value" data-numeric data-tick={changed.has(stat.key) ? '' : undefined}>
              {stat.value}
            </dd>
            {stat.delta && (
              <dd className="pc-delta" data-direction={stat.delta.direction} data-numeric>
                <span aria-hidden="true">{DELTA_ARROWS[stat.delta.direction]}</span> {stat.delta.text}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}

// One player as a card: who they are, a few numbers, a favourite toggle, and a way in.
// The name is the button that opens the player; its ::after stretches over the whole card,
// so the card is clickable without nesting the favourite button inside another button.
export default function PlayerCard({
  player, stats, statsLabel, extraStats, extraLabel,
  isFavorite = false, onToggleFavorite, onOpen, index = 0, ctaLabel = 'View player', children,
}) {
  const { ref, onPointerMove, onPointerLeave } = usePointerTilt();
  // Compare against the values from the previous render (the usePrevious pattern), so only
  // values that actually changed tick in, and nothing animates on the first render.
  const allStats = [...(stats || []), ...(extraStats || [])];
  const previousRef = useRef(null);
  useEffect(() => { previousRef.current = toStatValues(allStats); });
  const changed = getChangedStatKeys(previousRef.current, allStats);

  return (
    <article ref={ref} className="pc-card" data-flip={player.id} data-reveal data-defer style={{ '--reveal-delay': getRevealDelay(index) }}
      onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <header className="pc-head">
        <div className="pc-identity">
          <h3 className="pc-name">
            <button type="button" className="pc-open" onClick={onOpen}>{player.name}</button>
          </h3>
          <div className="pc-badges">
            {player.team && <span className="pc-badge">{player.team}</span>}
            {player.position && <span className="pc-badge is-accent">{player.position}</span>}
            {player.age !== null && player.age !== undefined && player.age !== '' && (
              <span className="pc-badge is-muted" data-numeric>Age {player.age}</span>
            )}
          </div>
        </div>
        {onToggleFavorite && (
          <button type="button" className={`pc-fav ${isFavorite ? 'is-on' : ''}`} onClick={onToggleFavorite}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? `Remove ${player.name} from favorites` : `Add ${player.name} to favorites`}>
            {isFavorite ? 'FAVORITED' : 'ADD FAV'}
          </button>
        )}
      </header>

      <StatList stats={stats} label={statsLabel} className="pc-main" changed={changed} />
      <StatList stats={extraStats} label={extraLabel} className="pc-extra" changed={changed} />
      {children}

      <span className="pc-cta" aria-hidden="true">
        <span className="pc-cta-label">{ctaLabel}</span>
        <span className="pc-cta-arrow">→</span>
      </span>
    </article>
  );
}
