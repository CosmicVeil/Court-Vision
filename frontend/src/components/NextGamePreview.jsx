import ContentSkeleton from "./ContentSkeleton";
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import GameMatchup from './GameMatchup';
import InjuryBadge from './InjuryBadge';
import PlayerCard from './PlayerCard';
import { buildApiUrl } from '../config/api';
import {
  formatSlateDate, formatTipoff, getGameCardStats, getGameModelEdge,
} from '../utils/gamePredictions';

const PREVIEW_COUNT = 4;

// Home teaser for the per-game model: the slate's top projected scorers and the model's held-out
// edge. Uses the public preview of /api/game-predictions, so it works signed out. onLoaded(true) lets the page rescan for the cards' reveal
// targets; pass a state setter, so it is stable and the fetch runs once.
export default function NextGamePreview({ onPlayerClick, onLoaded }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: String(PREVIEW_COUNT), sort_by: 'predicted_pts', sort_order: 'desc' });
    fetch(buildApiUrl(`game-predictions?${params}`), { signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then(body => { setData(body); onLoaded?.(true); })
      .catch(err => { if (!controller.signal.aborted) console.error('Per-game preview fetch failed', err); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [onLoaded]);

  const players = data?.predictions || [];
  const edge = getGameModelEdge(data?.accuracy);
  const actions = (
    <div className="home-cta-actions next-game-actions" data-reveal>
      <Link to="/predictions/games" className="cta-button primary">ALL GAME PROJECTIONS</Link>
      <Link to="/recommendations/games" className="cta-button secondary">GAME PICKS</Link>
    </div>
  );
  // No cache yet, the API is down, or the slate has already been played (stale): don't present
  // old games as upcoming. The links still lead to pages that explain why.
  if (loading) return <div className="next-game-preview"><ContentSkeleton count={PREVIEW_COUNT} label="Loading game projections…" /></div>;
  if (!players.length || data.stale) return actions;

  return (
    <div className="next-game-preview">
      <p className="next-game-meta" data-reveal data-numeric>
        {formatSlateDate(data.slate_date)} · {data.games?.length || 0} games
        {edge?.pointsEdge > 0 && <> · <strong>{edge.pointsEdge}% closer</strong> on points than a player's last-10 average</>}
      </p>
      <div className="pc-grid" data-defer>
        {players.map((player, index) => (
          <PlayerCard
            key={`${player.game_id}-${player.espn_id}`}
            index={index}
            player={{ id: player.id ?? player.espn_id, name: player.name, position: player.position }}
            stats={getGameCardStats(player).main}
            statsLabel="Predicted · change vs last 10 games"
            onOpen={() => onPlayerClick({ name: player.name, team: player.team, position: player.position })}
            ctaLabel="Player stats"
          >
            <p className="pc-matchup" data-numeric>
              <GameMatchup player={player} size="md" />
              <span>{formatTipoff(player.tipoff)}</span>
              <InjuryBadge injury={player.injury} />
            </p>
          </PlayerCard>
        ))}
      </div>
      {actions}
    </div>
  );
}
