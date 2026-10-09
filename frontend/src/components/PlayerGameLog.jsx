import { useEffect, useState } from 'react';
import { buildApiUrl } from '../config/api';
import './PlayerGameLog.css';

const GAME_LIMIT = 10;
const AVERAGE_ROWS = [['last5', 'Last 5'], ['last10', 'Last 10'], ['season', 'Season']];

const formatDate = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const pct = value => (value === null || value === undefined ? '—' : `${value}%`);
const plusMinus = value => (value > 0 ? `+${value}` : `${value ?? '—'}`);

export default function PlayerGameLog({ playerId }) {
  // Keyed by player so switching players shows the loading state without a reset in the effect.
  const [result, setResult] = useState({ playerId: null, status: 'loading', data: null });

  useEffect(() => {
    if (!playerId) return undefined;
    const controller = new AbortController();
    fetch(buildApiUrl(`players/${playerId}/games?limit=${GAME_LIMIT}`), { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Game log unavailable');
        return response.json();
      })
      .then(data => setResult({ playerId, status: 'ready', data }))
      .catch(error => {
        if (error.name !== 'AbortError') setResult({ playerId, status: 'error', data: null });
      });
    return () => controller.abort();
  }, [playerId]);

  if (!playerId) return <div className="game-log-empty">Game log is unavailable for this player.</div>;
  if (result.playerId !== playerId || result.status === 'loading') {
    return <div className="game-log-empty"><div className="search-spinner game-log-spinner" />Loading game log...</div>;
  }
  if (result.status === 'error') return <div className="game-log-empty">Game log is unavailable right now.</div>;

  const { games = [], averages = {}, season } = result.data;
  if (!games.length) return <div className="game-log-empty">No games recorded for this player yet.</div>;

  return (
    <div className="game-log">
      <h3 className="secondary-stats-title">Recent Form{season ? ` · ${season}` : ''}</h3>
      <div className="stats-history-scroll-box">
        <table className="stats-history-table game-log-averages">
          <thead><tr><th>Span</th><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG%</th><th>3P%</th></tr></thead>
          <tbody>
            {AVERAGE_ROWS.filter(([key]) => averages[key]).map(([key, label]) => {
              const avg = averages[key];
              return (
                <tr key={key}>
                  <td><strong>{label}</strong></td><td>{avg.games}</td><td>{avg.minutes}</td>
                  <td className="game-log-highlight">{avg.pts}</td><td>{avg.reb}</td><td>{avg.ast}</td>
                  <td>{avg.stl}</td><td>{avg.blk}</td><td>{pct(avg.fg_pct)}</td><td>{pct(avg.fg3_pct)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="secondary-stats-title game-log-title">Last {games.length} Games</h3>
      <div className="stats-history-scroll-box">
        <table className="stats-history-table">
          <thead><tr><th>Date</th><th>Opp</th><th>Result</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG</th><th>3PT</th><th>FT</th><th>+/-</th></tr></thead>
          <tbody>
            {games.map(game => (
              <tr key={game.game_id}>
                <td>{formatDate(game.date)}{game.season_type === 1 && <span className="game-log-tag">PRE</span>}</td>
                <td>{game.is_home ? 'vs' : '@'} {game.opponent}</td>
                <td><span className={game.result === 'W' ? 'game-log-win' : 'game-log-loss'}>{game.result}</span> {game.score}</td>
                {game.did_not_play ? (
                  <td colSpan={11} className="game-log-dnp">DNP{game.dnp_reason ? ` — ${game.dnp_reason.toLowerCase()}` : ''}</td>
                ) : (
                  <>
                    <td>{game.minutes}</td><td className="game-log-highlight">{game.pts}</td><td>{game.reb}</td><td>{game.ast}</td>
                    <td>{game.stl}</td><td>{game.blk}</td><td>{game.tov}</td>
                    <td>{game.fgm}-{game.fga}</td><td>{game.fg3m}-{game.fg3a}</td><td>{game.ftm}-{game.fta}</td>
                    <td>{plusMinus(game.plus_minus)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
