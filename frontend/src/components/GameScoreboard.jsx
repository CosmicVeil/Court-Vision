import { Link } from 'react-router-dom';
import { STATUS_FINAL, STATUS_LIVE, STATUS_SCHEDULED, formatGameTime, formatPeriod } from '../utils/liveGames';

function statusLabel(game) {
  const status = Number(game.status);
  if (status === STATUS_LIVE) return [formatPeriod(game.period), game.gameClock].filter(Boolean).join(' · ');
  if (status === STATUS_SCHEDULED) {
    const hasTime = /\d{1,2}:\d{2}/.test(game.statusText || '');
    return [game.statusText, hasTime ? '' : formatGameTime(game.gameTime)].filter(Boolean).join(' · ');
  }
  return game.statusText || 'Final';
}

function marginLabel(game) {
  const status = Number(game.status);
  if (status === STATUS_SCHEDULED) return '';
  const away = Number(game.away?.score) || 0;
  const home = Number(game.home?.score) || 0;
  if (away === home) return status === STATUS_FINAL ? 'Final · tied' : 'Tied';
  const leader = away > home ? game.away : game.home;
  return `${leader.tricode} ${status === STATUS_FINAL ? 'won' : 'leads'} by ${Math.abs(away - home)}`;
}

// The game page hero: both teams, the score, and where the game stands.
export default function GameScoreboard({ game, scoreChanges }) {
  const status = Number(game.status);
  const isFuture = status === STATUS_SCHEDULED;
  const away = Number(game.away?.score) || 0;
  const home = Number(game.home?.score) || 0;
  const leading = isFuture || away === home ? null : away > home ? 'away' : 'home';
  const spoken = isFuture
    ? `${game.away.city} ${game.away.name} at ${game.home.city} ${game.home.name}`
    : `${game.away.city} ${game.away.name} ${away}, ${game.home.city} ${game.home.name} ${home}`;

  return (
    <div className="scoreboard">
      <div className="scoreboard-meta">
        <Link to="/games" className="back-to-home">← ALL GAMES</Link>
        <span className={`scoreboard-status ${status === STATUS_LIVE ? 'is-live' : ''}`} data-slot="eyebrow">
          {status === STATUS_LIVE && <span className="pulse-dot" />}
          <span data-numeric>{statusLabel(game)}</span>
        </span>
      </div>
      <h1 className="scoreboard-heading" data-slot="display-heading" aria-label={spoken}>
        {['away', 'home'].map((side, index) => {
          const team = game[side];
          const popped = Boolean(scoreChanges?.[side]);
          return (
            <span key={side} className={`scoreboard-team side-${side} ${leading && leading !== side ? 'is-trailing' : ''}`}
              style={{ '--word': index * 2 }} aria-hidden="true">
              {team.logo ? <img src={team.logo} alt="" className="scoreboard-logo" /> : <span className="team-logo-placeholder">{team.tricode}</span>}
              <span className="scoreboard-name">
                <span className="scoreboard-tricode">{team.tricode}</span>
                {team.record && <span className="scoreboard-record" data-numeric>{team.record}</span>}
              </span>
              <span className="scoreboard-score" data-numeric key={popped ? `${side}-${team.score}` : side}
                data-score-pop={popped ? '' : undefined}>
                {isFuture ? '–' : team.score}
              </span>
            </span>
          );
        })}
        <span className="scoreboard-vs" aria-hidden="true" style={{ '--word': 1 }}>{isFuture ? 'VS' : '—'}</span>
      </h1>
      <p className="scoreboard-sub" data-slot="lead">
        {[marginLabel(game), game.arena].filter(Boolean).join(' · ')}
      </p>
    </div>
  );
}
