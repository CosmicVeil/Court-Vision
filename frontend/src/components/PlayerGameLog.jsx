import { useEffect, useState } from 'react';
import { buildApiUrl } from '../config/api';
import './PlayerGameLog.css';

// Matches the backend clamp and fits a full season including preseason, play-in, and playoffs.
const SEASON_GAME_LIMIT = 200;
const AVERAGE_ROWS = [['last5', 'Last 5'], ['last10', 'Last 10'], ['season', 'Season']];

const formatDate = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const pct = value => (value === null || value === undefined ? '—' : `${value}%`);
const plusMinus = value => (value > 0 ? `+${value}` : `${value ?? '—'}`);

const SEASONS = [
  { value: '2026-2027', label: '2026-2027 (Current)' },
  { value: '2025-2026', label: '2025-2026' },
  { value: '2024-2025', label: '2024-2025' },
  { value: '2023-2024', label: '2023-2024' },
  { value: '2022-2023', label: '2022-2023' },
  { value: '2021-2022', label: '2021-2022' },
];

export default function PlayerGameLog({ playerId }) {
  const [selectedSeason, setSelectedSeason] = useState('2026-2027');
  // Keyed by player and season so switching shows the loading state.
  const [result, setResult] = useState({ playerId: null, season: '2026-2027', status: 'loading', data: null });

  useEffect(() => {
    if (!playerId) return undefined;
    const controller = new AbortController();
    setResult(prev => ({ ...prev, status: 'loading' }));
    fetch(buildApiUrl(`players/${playerId}/games?limit=${SEASON_GAME_LIMIT}&season=${encodeURIComponent(selectedSeason)}`), { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Game log unavailable');
        return response.json();
      })
      .then(data => setResult({ playerId, season: selectedSeason, status: 'ready', data }))
      .catch(error => {
        if (error.name !== 'AbortError') setResult({ playerId, season: selectedSeason, status: 'error', data: null });
      });
    return () => controller.abort();
  }, [playerId, selectedSeason]);

  if (!playerId) return <div className="game-log-empty">Game log is unavailable for this player.</div>;

  const availableSeasons = result.data?.available_seasons || [];
  const seasonOptions = availableSeasons.length
    ? availableSeasons.map(s => ({
        value: s,
        label: s === '2026-2027' ? '2026-2027 (Current)' : s,
      }))
    : SEASONS;

  const isLoading = result.playerId !== playerId || result.season !== selectedSeason || result.status === 'loading';
  const isError = result.status === 'error';
  const games = result.data?.games || [];
  const averages = result.data?.averages || {};
  const seasonDisplay = result.data?.season || selectedSeason;

  return (
    <div className="game-log">
      <div className="game-log-toolbar">
        <div className="game-log-season-group">
          <label htmlFor="game-log-season-select" className="game-log-season-label">
            <span className="game-log-label-icon">🏀</span> SEASON
          </label>
          <div className="game-log-select-wrapper">
            <select
              id="game-log-season-select"
              className="game-log-season-select"
              value={selectedSeason}
              onChange={e => setSelectedSeason(e.target.value)}
              disabled={isLoading && result.status !== 'ready'}
            >
              {seasonOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="game-log-season-badge">
          Season: <strong>{seasonDisplay}</strong>
        </div>
      </div>

      {isLoading ? (
        <div className="game-log-empty">
          <div className="search-spinner game-log-spinner" />
          Loading {selectedSeason} game log...
        </div>
      ) : isError ? (
        <div className="game-log-empty">Game log is unavailable for the {selectedSeason} season.</div>
      ) : !games.length ? (
        <div className="game-log-empty">No games recorded for this player in the {selectedSeason} season.</div>
      ) : (
        <>
          <h3 className="secondary-stats-title">Recent Form · {seasonDisplay}</h3>
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

          <h3 className="secondary-stats-title game-log-title">All Games ({games.length})</h3>
          <div className="stats-history-scroll-box game-log-scroll" tabIndex={0} role="region" aria-label="Season game log">
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
        </>
      )}
    </div>
  );
}
