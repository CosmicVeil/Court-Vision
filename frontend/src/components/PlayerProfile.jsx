import { Link } from 'react-router-dom';
import InjuryBadge from './InjuryBadge';
import PillNav from './PillNav';
import PlayerGameLog from './PlayerGameLog';
import PlayerHeadshot from './PlayerHeadshot';
import PlayerNextGame from './PlayerNextGame';
import PlayerPredictionGrid from './PlayerPredictionGrid';
import { injuryDescription, injuryReturnLabel } from '../utils/injury';
import { PLAYER_TABS } from '../utils/playerPage';
import { getTeamColor } from '../utils/team';

// A player's header and tabbed stats, as shown on the player page. The page owns the selected tab
// (it lives in the URL) and returnTo, where the sign-in links on locked tabs bring the user back.
// loading: player is still the placeholder built from the linking page's row.
export default function PlayerProfile({ player, loading = false, tab, onTabChange, returnTo }) {
  const stats = player.current_stats || player.stats || {};
  const current = {
    ppg: stats.ppg ?? stats.ppg_last ?? 0,
    apg: stats.apg ?? stats.apg_last ?? 0,
    rpg: stats.rpg ?? stats.rpg_last ?? 0,
    spg: stats.spg ?? stats.spg_last ?? 0,
    bpg: stats.bpg ?? stats.bpg_last ?? 0,
    fgPct: stats.fg_pct ?? stats.fg_pct_last ?? 0,
    fg3Pct: stats.fg3_pct ?? stats.fg3_pct_last ?? 0,
    ftPct: stats.ft_pct ?? stats.ft_pct_last ?? 0,
    games: stats.games_played ?? 0,
    minutes: stats.minutes ?? stats.mpg ?? 0,
  };

  return (
    <>
      {/* The team's colour tints the header, as on the team page. */}
      <header className="pp-header" style={{ '--team-color': getTeamColor(player.team) }}>
        <PlayerHeadshot playerId={player.id} name={player.name} size="large" className="pp-photo" />
        <div className="pp-identity">
          <h1 className="pp-name" data-slot="display-heading">{player.name}</h1>
          <div className="pp-tags">
            <span className="pp-team-badge">{player.team}</span>
            <InjuryBadge injury={player.injury} />
          </div>
          <p className="pp-meta">
            <span><strong>Position:</strong> {player.position}</span><span aria-hidden="true">•</span><span><strong>Age:</strong> {player.age ?? '—'}</span>
          </p>
          {player.injury?.status && (
            <div className="injury-summary">
              <strong>{player.injury.status}</strong>
              {[injuryDescription(player.injury), injuryReturnLabel(player.injury)].filter(Boolean).map(part => (
                <span key={part}>· {part}</span>
              ))}
              {player.injury.note && <p className="injury-summary-note">{player.injury.note}</p>}
            </div>
          )}
        </div>
      </header>
      <PillNav className="pp-tabs" tabClassName="pp-tab" label="Player sections" idPrefix="pp" panelId="pp-panel"
        value={tab} onChange={onTabChange} items={PLAYER_TABS} />
      <section className="pp-panel" id="pp-panel" role="tabpanel" aria-labelledby={`pp-tab-${tab}`}>
        {tab === 'current' && (
          <div>
            <div className="stats-grid-container">
              {['ppg', 'apg', 'rpg', 'spg', 'bpg'].map(key => (
                <div className="stat-box-card" key={key}>
                  <div className={`stat-box-value ${key === 'ppg' ? 'highlighted' : ''}`}>{current[key]}</div>
                  <div className="stat-box-label">{key.toUpperCase()}</div>
                </div>
              ))}
            </div>
            <div className="secondary-stats-container">
              <h3 className="secondary-stats-title">Shooting &amp; Playing Time</h3>
              {[
                ['Field Goal (FG%)', current.fgPct],
                ['3-Point (3PT%)', current.fg3Pct],
                ['Free Throw (FT%)', current.ftPct],
              ].map(([label, value]) => (
                <div className="percentage-stat-row" key={label}>
                  <div className="percentage-stat-header"><span className="percentage-stat-name">{label}</span><span className="percentage-stat-value">{value}%</span></div>
                  <div className="percentage-stat-track"><div className="percentage-stat-bar" style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} /></div>
                </div>
              ))}
              <div className="percentage-stat-row" style={{ marginTop: '1.5rem' }}>
                <div className="percentage-stat-header" style={{ marginBottom: 0 }}>
                  <span className="percentage-stat-name">Games Played / Playing Time</span>
                  <span className="percentage-stat-value">{current.games} Games | {current.minutes} MPG</span>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* The log picks its first season from history once, so it waits for the full profile's. */}
        {tab === 'games' && (loading
          ? <div className="no-data" role="status">Loading game log…</div>
          : <PlayerGameLog playerId={player.id} history={player.history} />)}
        {tab === 'predictions' && (player.ml_stats ? (
          <>
            <h3 className="secondary-stats-title">Predicted · change vs this season</h3>
            <PlayerPredictionGrid currentStats={player.ml_stats.so_far_stats} predictionStats={player.ml_stats.predicted_stats} />
          </>
        ) : player.predictions_locked ? (
          <div className="no-data">
            <p>Sign in to see full predictions for {player.name}.</p>
            <p>
              <Link to="/login" state={{ from: returnTo }}>Log In</Link>
              {' · '}
              <Link to="/create-account" state={{ from: returnTo }}>Create a free account</Link>
            </p>
          </div>
        ) : <div className="no-data">AI Prediction model is currently loading or unavailable for this player.</div>)}
        {tab === 'next-game' && <PlayerNextGame player={player} returnTo={returnTo} />}
        {tab === 'history' && (
          <div className="stats-history-table-container">
            <div className="stats-history-scroll-box">
              <table className="stats-history-table">
                <thead><tr><th>Season</th><th>GP</th><th>MIN</th><th>PPG</th><th>RPG</th><th>APG</th><th>SPG</th><th>BPG</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead>
                <tbody>
                  {Object.entries(player.history || {}).reverse().map(([year, season]) => (
                    <tr key={year}><td><strong>{year}</strong> {season.in_progress && <span className="game-log-tag">In progress</span>}</td><td>{season.games_played}</td><td>{season.minutes}</td><td>{season.ppg}</td><td>{season.rpg}</td><td>{season.apg}</td><td>{season.spg}</td><td>{season.bpg}</td><td>{season.fg_pct}%</td><td>{season.fg3_pct}%</td><td>{season.ft_pct}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
