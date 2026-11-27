import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildApiUrl } from '../config/api';
import { getScoring } from '../utils/auth';
import { fptsTitle } from '../utils/fantasy';
import { getGameDetailPath } from '../utils/liveGames';
import './PlayerGameLog.css';

// How many past meetings to show, across seasons (the backend allows up to 20).
export const HEAD_TO_HEAD_LIMIT = 5;

const formatDate = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const pct = value => (value === null || value === undefined ? '—' : `${value}%`);
const fpts = value => (value === null || value === undefined ? '—' : Number(value).toFixed(1));

// The table, given the API's response. Split out so tests can render it without a fetch.
export function HeadToHeadTable({ data, opponent }) {
  const games = data?.games || [];
  const avg = data?.averages;
  if (!games.length) return <div className="game-log-empty">No recorded games against {opponent} yet.</div>;
  const fptsHeader = fptsTitle(getScoring());
  return (
    <div className="stats-history-scroll-box">
      <table className="stats-history-table game-log-averages h2h-table">
        <thead><tr><th>Date</th><th>Result</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG</th><th>3PT</th><th title={fptsHeader}>FPTS</th></tr></thead>
        <tbody>
          {avg && (
            <tr className="h2h-average">
              <td><strong>Avg ({avg.games} GP)</strong></td><td>—</td><td>{avg.minutes}</td>
              <td className="game-log-highlight">{avg.pts}</td><td>{avg.reb}</td><td>{avg.ast}</td>
              <td>{avg.stl}</td><td>{avg.blk}</td><td>{pct(avg.fg_pct)}</td><td>{pct(avg.fg3_pct)}</td><td>{fpts(avg.fpts)}</td>
            </tr>
          )}
          {games.map(game => (
            <tr key={game.game_id}>
              <td><Link to={getGameDetailPath(game.game_id)} className="game-log-game-link">{formatDate(game.date)}</Link></td>
              <td><span className={game.result === 'W' ? 'game-log-win' : 'game-log-loss'}>{game.result}</span> {game.score}</td>
              <td>{game.minutes}</td><td className="game-log-highlight">{game.pts}</td><td>{game.reb}</td><td>{game.ast}</td>
              <td>{game.stl}</td><td>{game.blk}</td><td>{game.fgm}-{game.fga}</td><td>{game.fg3m}-{game.fg3a}</td><td>{fpts(game.fpts)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// "Last 5 vs UTA": a player's recent games against his next opponent, with their average,
// from the game archive (GET /api/players/<id>/vs/<team>).
export default function PlayerHeadToHead({ playerId, opponent }) {
  const [result, setResult] = useState({ key: null, status: 'loading', data: null });
  const key = `${playerId}-${opponent}`;

  useEffect(() => {
    if (!playerId || !opponent) return undefined;
    const controller = new AbortController();
    fetch(buildApiUrl(`players/${playerId}/vs/${encodeURIComponent(opponent)}?limit=${HEAD_TO_HEAD_LIMIT}`), { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Head-to-head unavailable');
        return response.json();
      })
      .then(data => setResult({ key, status: 'ready', data }))
      .catch(error => { if (error.name !== 'AbortError') setResult({ key, status: 'error', data: null }); });
    return () => controller.abort();
  }, [key, playerId, opponent]);

  if (!playerId || !opponent) return null;
  const loading = result.key !== key || result.status === 'loading';
  return (
    <section className="h2h" aria-label={`Recent games against ${opponent}`}>
      <h3 className="secondary-stats-title game-log-title">Last {HEAD_TO_HEAD_LIMIT} vs {opponent}</h3>
      {loading ? <div className="game-log-empty" role="status">Loading games against {opponent}…</div>
        : result.status === 'error' ? <div className="game-log-empty">Head-to-head history is unavailable right now.</div>
          : <HeadToHeadTable data={result.data} opponent={opponent} />}
    </section>
  );
}
