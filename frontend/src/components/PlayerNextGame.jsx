import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import GameMatchup from './GameMatchup';
import PillNav from './PillNav';
import PlayerHeadToHead from './PlayerHeadToHead';
import PlayerPredictionGrid from './PlayerPredictionGrid';
import { GAME_PREDICTION_GROUPS } from '../config/gamePredictionStats';
import { buildApiUrl } from '../config/api';
import { authHeaders } from '../utils/auth';
import { formatDayLabel, formatSlateDate, formatSlateRange, formatTipoff, toGameGridStats } from '../utils/gamePredictions';
import './PredictionModeToggle.css';

// The popup's Game projections tab: this player's predicted games, fetched when the tab opens.
// Opens on his nearest game; day tabs switch to his later ones (only days he plays).
// Matched by NBA.com ID, with the name as a fallback for popups built without one.
export default function PlayerNextGame({ player, returnTo }) {
  const [state, setState] = useState({ status: 'loading' });
  const [gameId, setGameId] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ name: player.name || '' });
    setState({ status: 'loading' });
    setGameId('');
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
  const games = data.predictions?.length ? data.predictions : [data.prediction].filter(Boolean);
  // '' (or a game no longer listed) = his nearest game.
  const prediction = games.find(game => game.game_id === gameId) || games[0] || null;
  const isLater = Boolean(prediction) && prediction !== games[0];
  const slate = formatSlateDate(data.slate_date);
  const covered = formatSlateRange(data.slate_dates?.length ? data.slate_dates : [data.slate_date]);
  if (data.stale) return <div className="no-data">The latest predictions are for {slate}, which has already been played.</div>;
  if (!prediction) {
    return (
      <div className="no-data">
        {player.name} is not predicted for {covered}: his team is not playing, he is ruled out, or he is outside the recent rotation.
      </div>
    );
  }
  const { currentStats, predictionStats } = toGameGridStats(prediction);
  return (
    <>
      {games.length > 1 && (
        <PillNav className="pm-toggle player-next-game-days" tabClassName="pm-tab" label="Game day" idPrefix="png-day"
          panelId="png-day-panel" value={prediction.game_id} onChange={setGameId}
          items={games.map(game => ({ id: game.game_id, label: formatDayLabel(game.game_date || data.slate_date) }))} />
      )}
      <div id="png-day-panel" role={games.length > 1 ? 'tabpanel' : undefined}>
        <h3 className="secondary-stats-title">
          {formatDayLabel(prediction.game_date || data.slate_date)} · <GameMatchup player={prediction} size="md" gameId={prediction.game_id} /> · {formatTipoff(prediction.tipoff)}
        </h3>
        <p className="player-next-game-note">
          Last-10-game average → predicted
          {isLater && ' · a later game: predicted from form as of today, updated each morning'}
        </p>
        <PlayerPredictionGrid currentStats={currentStats} predictionStats={predictionStats} groups={GAME_PREDICTION_GROUPS} />
        <PlayerHeadToHead playerId={Number(player.id) || 0} opponent={prediction.opponent} />
      </div>
    </>
  );
}
