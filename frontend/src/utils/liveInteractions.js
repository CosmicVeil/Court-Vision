import { STATUS_LIVE, STATUS_SCHEDULED, formatPeriod } from './liveGames.js';

// Hand-placed positions around the hero heading: x/y place the chip, r tilts it,
// hx/hy is where it drifts when the hero is hovered.
// Each chip is anchored to a side edge of the heading (offset by gap), so it never covers
// the text whatever the heading's width; y is a percentage of the heading's height.
export const ORBIT_SLOTS = [
  { side: 'left', gap: '1.5rem', y: '40%', r: '-6deg', hx: '-1.5rem', hy: '-0.75rem' },
  { side: 'right', gap: '2.5rem', y: '-10%', r: '5deg', hx: '1.5rem', hy: '-1rem' },
  { side: 'right', gap: '1rem', y: '78%', r: '-3deg', hx: '1.25rem', hy: '1rem' },
];

const toScore = value => (value === null || value === undefined || value === '' ? null : Number(value));

export function getScoreChanges(previousGames, nextGames) {
  const previous = new Map((previousGames || []).map(game => [game.gameId, game]));
  const changes = {};
  for (const game of nextGames || []) {
    const before = previous.get(game.gameId);
    if (!before) continue;
    const changed = side => {
      const old = toScore(before[side]?.score);
      const now = toScore(game[side]?.score);
      return Number.isFinite(old) && Number.isFinite(now) && old !== now;
    };
    const away = changed('away');
    const home = changed('home');
    if (away || home) changes[game.gameId] = { away, home };
  }
  return changes;
}

const clamp01 = value => Math.min(1, Math.max(0, value));
const round = value => Math.round(value * 100) / 100 || 0;

export function getTilt({ clientX, clientY }, rect, maxDeg = 4) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return { rx: 0, ry: 0, mx: 50, my: 50 };
  const px = clamp01((clientX - rect.left) / rect.width);
  const py = clamp01((clientY - rect.top) / rect.height);
  return { rx: round((0.5 - py) * 2 * maxDeg), ry: round((px - 0.5) * 2 * maxDeg), mx: round(px * 100), my: round(py * 100) };
}

function describe(game) {
  const status = Number(game.status);
  const away = game.away?.tricode || 'AWAY';
  const home = game.home?.tricode || 'HOME';
  const matchup = status === STATUS_SCHEDULED
    ? `${away} vs ${home}`
    : `${away} ${game.away?.score ?? 0} – ${game.home?.score ?? 0} ${home}`;
  const label = status === STATUS_LIVE ? `${formatPeriod(game.period)} ${game.gameClock || ''}`.trim() : game.statusText || '';
  return { gameId: game.gameId, live: status === STATUS_LIVE, matchup, status: label };
}

export function getTickerItems(games) {
  return (games || []).map(describe);
}

export function getOrbitChips(games, slots = ORBIT_SLOTS) {
  return (games || [])
    .filter(game => Number(game.status) === STATUS_LIVE)
    .slice(0, slots.length)
    .map((game, index) => ({ ...describe(game), slot: slots[index] }));
}
