import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import GameMatchup from './GameMatchup';
import PlayerPredictionGrid from './PlayerPredictionGrid';
import { GAME_PREDICTION_GROUPS } from '../config/gamePredictionStats';
import { buildApiUrl } from '../config/api';
import { authHeaders } from '../utils/auth';
import { formatSlateDate, formatTipoff, toGameGridStats } from '../utils/gamePredictions';

// The popup's Game projections tab: this player's per-game prediction, fetched when the tab opens.
// Matched by NBA.com ID, with the name as a fallback for popups built without one.
export default function PlayerNextGame({ player, returnTo }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ name: player.name || '' });
    setState({ status: 'loading' });
    fetch(buildApiUrl(`game-predictions/player/${Number(player.id) || 0}?${params}`),
      { signal: controller.signal, headers: authHeaders() })
      .then(async response => {
        if (response.status === 401) return setState({ status: 'locked' });
        if (!response.ok) return setState({ status: 'unavailable' });
        return setState({ status: 'ready', data: await response.json() });
      })
      .catch(() => { if (!controller.signal.aborted) setState({ status: 'unavailable' }); });
    return () => controller.abort();
  }, [player.id, player.name]);

  if (state.status === 'loading') return <div className="no-data">Loading next-game prediction...</div>;
  if (state.status === 'locked') {
    return (
      <div className="no-data">
        <p>Sign in to see {player.name}'s next-game prediction.</p>
        <p>
          <Link to="/login" state={{ from: returnTo }}>Log In</Link>
          {' · '}
          <Link to="/create-account" state={{ from: returnTo }}>Create a free account</Link>
        </p>
      </div>
    );
  }
  if (state.status === 'unavailable') return <div className="no-data">Next-game predictions are not available right now.</div>;

  const { data } = state;
  const prediction = data.prediction;
  const slate = formatSlateDate(data.slate_date);
  if (data.stale) return <div className="no-data">The latest predictions are for {slate}, which has already been played.</div>;
  if (!prediction) {
    return (
      <div className="no-data">
        {player.name} is not predicted for {slate}: his team is not playing, he is ruled out, or he is outside the recent rotation.
      </div>
    );
  }
  const { currentStats, predictionStats } = toGameGridStats(prediction);
  return (
    <>
      <h3 className="secondary-stats-title">
        {slate} · <GameMatchup player={prediction} size="md" /> · {formatTipoff(prediction.tipoff)}
      </h3>
      <p className="player-next-game-note">Last-10-game average → predicted</p>
      <PlayerPredictionGrid currentStats={currentStats} predictionStats={predictionStats} groups={GAME_PREDICTION_GROUPS} />
    </>
  );
}
