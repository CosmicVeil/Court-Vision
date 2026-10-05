import { useEffect, useState } from 'react';
import PlayerPredictionGrid from './PlayerPredictionGrid';

const TABS = [
  ['current', 'Current Stats'],
  ['predictions', 'AI Predictions'],
  ['history', 'Career History'],
];

export default function PlayerStatsModal({ player, loading, onClose }) {
  const [tab, setTab] = useState('current');

  useEffect(() => setTab('current'), [player?.id, player?.name]);
  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, onClose]);

  if (!player && !loading) return null;
  const stats = player?.current_stats || player?.stats || {};
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
    <div className="stats-modal-backdrop" onClick={() => { if (!loading) onClose(); }}>
      <div className="stats-modal-container" onClick={event => event.stopPropagation()}>
        {loading && !player ? (
          <div style={{ padding: '4rem', textAlign: 'center' }}>
            <div className="search-spinner" style={{ width: 32, height: 32, margin: '0 auto 1rem' }} />
            <p style={{ color: 'var(--text-secondary)' }}>Loading player details...</p>
          </div>
        ) : player && (
          <>
            <button className="stats-modal-close-btn" onClick={onClose} aria-label="Close player details">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <div className="stats-modal-header">
              <div className="stats-modal-player-title-row">
                <h2 className="stats-modal-player-name">{player.name}</h2>
                <span className="stats-modal-player-team-badge">{player.team}</span>
              </div>
              <p className="stats-modal-player-meta">
                <span><strong>Position:</strong> {player.position}</span><span>•</span><span><strong>Age:</strong> {player.age}</span>
              </p>
            </div>
            <div className="stats-modal-tabs">
              {TABS.map(([name, label]) => (
                <button key={name} className={`stats-modal-tab-btn ${tab === name ? 'active' : ''}`} onClick={() => setTab(name)}>{label}</button>
              ))}
            </div>
            <div className="stats-modal-body">
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
              {tab === 'predictions' && (player.ml_stats ? (
                <PlayerPredictionGrid currentStats={player.current_stats} predictionStats={player.ml_stats.predicted_stats} improvements={player.ml_stats.improvements} />
              ) : <div className="no-data">AI Prediction model is currently loading or unavailable for this player.</div>)}
              {tab === 'history' && (
                <div className="stats-history-table-container">
                  <div className="stats-history-scroll-box">
                    <table className="stats-history-table">
                      <thead><tr><th>Season</th><th>GP</th><th>MIN</th><th>PPG</th><th>RPG</th><th>APG</th><th>SPG</th><th>BPG</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead>
                      <tbody>
                        {Object.entries(player.history || {}).reverse().map(([year, season]) => (
                          <tr key={year}><td><strong>{year}</strong></td><td>{season.games_played}</td><td>{season.minutes}</td><td>{season.ppg}</td><td>{season.rpg}</td><td>{season.apg}</td><td>{season.spg}</td><td>{season.bpg}</td><td>{season.fg_pct}%</td><td>{season.fg3_pct}%</td><td>{season.ft_pct}%</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
