import { useMemo, useState } from 'react';
import CourtSVG from './CourtSVG';
import { espnToCourt, shotDistanceFt, shotZone } from '../utils/courtGeometry';
import { teamDotColor } from '../utils/teamColors';

/**
 * Shot chart — plots every field-goal attempt as a dot on the half-court.
 * Filled dot = made, hollow ring = missed, coloured by shooting team.
 * Hover (or focus) a dot to see player, shot type, and distance.
 * A dropdown filters to a single player.
 *
 * Props:
 *   shots — array from /playbyplay (each: x, y, made, value, type, player, team, period, clock)
 *   full  — half vs full court view (passed through to CourtSVG)
 */
export default function ShotChart({ shots = [], full = false }) {
  const [playerFilter, setPlayerFilter] = useState('all');
  const [hovered, setHovered] = useState(null);

  // Unique players for the filter, sorted by attempts (most active first).
  const players = useMemo(() => {
    const counts = new Map();
    for (const shot of shots) {
      if (!shot.player) continue;
      counts.set(shot.player, (counts.get(shot.player) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [shots]);

  const visible = useMemo(() => {
    const mapped = shots
      .map((shot, index) => {
        const point = espnToCourt(shot.x, shot.y);
        return point ? { ...shot, index, cx: point.x, cy: point.y } : null;
      })
      .filter(Boolean);
    return playerFilter === 'all' ? mapped : mapped.filter(shot => shot.player === playerFilter);
  }, [shots, playerFilter]);

  const made = visible.filter(shot => shot.made).length;
  const total = visible.length;
  const pct = total ? Math.round((made / total) * 100) : 0;

  if (!shots.length) {
    return <div className="shotchart-empty">No shot data available for this game yet.</div>;
  }

  return (
    <div className="shotchart">
      <div className="shotchart-controls">
        <label className="shotchart-filter">
          <span className="shotchart-filter-label">Player</span>
          <select value={playerFilter} onChange={event => setPlayerFilter(event.target.value)}>
            <option value="all">All players</option>
            {players.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <div className="shotchart-legend" aria-hidden="true">
          <span className="legend-item"><span className="legend-dot made" /> Made</span>
          <span className="legend-item"><span className="legend-dot missed" /> Missed</span>
        </div>
        <div className="shotchart-summary" data-numeric>
          {made}/{total} <span className="shotchart-pct">{pct}% FG</span>
        </div>
      </div>

      <div className="shotchart-court">
        <CourtSVG full={full}>
          {visible.map(shot => {
            const color = teamDotColor(shot.team);
            const active = hovered?.index === shot.index;
            return (
              <circle
                key={shot.index}
                cx={shot.cx}
                cy={shot.cy}
                r={active ? 1.3 : 0.9}
                className={`shot-dot ${shot.made ? 'is-made' : 'is-missed'} ${active ? 'is-active' : ''}`}
                style={shot.made
                  ? { fill: color, stroke: color }
                  : { fill: 'transparent', stroke: color }}
                onMouseEnter={() => setHovered(shot)}
                onMouseLeave={() => setHovered(current => (current?.index === shot.index ? null : current))}
                onFocus={() => setHovered(shot)}
                onBlur={() => setHovered(current => (current?.index === shot.index ? null : current))}
                tabIndex={0}
                role="img"
                aria-label={`${shot.player || 'Unknown'} ${shot.made ? 'made' : 'missed'} ${shotZone(shot.x, shot.y, shot.value)} from ${shotDistanceFt(shot.x, shot.y)} feet`}
              />
            );
          })}
        </CourtSVG>

        {hovered && (
          <div className="shot-tooltip" role="status">
            <span className="shot-tooltip-player">{hovered.player || 'Unknown player'}</span>
            <span className="shot-tooltip-row">
              <span className={`shot-tooltip-result ${hovered.made ? 'made' : 'missed'}`}>
                {hovered.made ? 'MADE' : 'MISSED'}
              </span>
              <span>{hovered.type || shotZone(hovered.x, hovered.y, hovered.value)}</span>
            </span>
            <span className="shot-tooltip-meta" data-numeric>
              {shotDistanceFt(hovered.x, hovered.y)} ft · {hovered.value}PT · {hovered.team}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
