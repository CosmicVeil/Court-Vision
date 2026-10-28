import { STATUS_SCHEDULED, formatPeriod } from './liveGames.js';

const GAME_LEADERS = [
  { key: 'pts', label: 'Points' },
  { key: 'reb', label: 'Rebounds' },
  { key: 'ast', label: 'Assists' },
];

// Before tip-off there are no game stats, so the leaders come from season averages.
const SEASON_LEADERS = [
  { key: 'season_ppg', label: 'Season PPG' },
  { key: 'season_rpg', label: 'Season RPG' },
  { key: 'season_apg', label: 'Season APG' },
];

export const BOX_SCORE_LEADER_KEYS = ['pts', 'reb', 'ast', 'stl', 'blk'];

const numeric = value => (value === null || value === undefined || value === '' ? null : Number(value));

export function getGameLeaders(game) {
  const stats = Number(game?.status) === STATUS_SCHEDULED ? SEASON_LEADERS : GAME_LEADERS;
  const roster = ['away', 'home'].flatMap(side =>
    (game?.players?.[side] || []).map(player => ({ player, side })));
  return stats.flatMap(({ key, label }) => {
    let best = null;
    for (const entry of roster) {
      const value = numeric(entry.player[key]);
      // Strictly greater, so a tie keeps the first player found (away before home).
      if (Number.isFinite(value) && value > 0 && (!best || value > best.value)) best = { ...entry, value };
    }
    return best ? [{ key, label, value: best.value, player: best.player, side: best.side, tricode: game[best.side]?.tricode }] : [];
  });
}

const periodScore = (team, index) => numeric(team?.quarters?.find(item => item.q === index + 1)?.score);
const share = (value, max) => (value === null || max <= 0 ? 0 : Math.round((value / max) * 100) / 100);

export function getPeriodBreakdown(away, home) {
  const count = Math.max(away?.quarters?.length || 0, home?.quarters?.length || 0, 4);
  const pairs = Array.from({ length: count }, (_, index) => [periodScore(away, index), periodScore(home, index)]);
  const max = Math.max(0, ...pairs.flat().filter(Number.isFinite));
  return pairs.map(([awayScore, homeScore], index) => ({
    label: formatPeriod(index + 1),
    away: awayScore,
    home: homeScore,
    awayShare: share(awayScore, max),
    homeShare: share(homeScore, max),
    winner: awayScore === null || homeScore === null ? null
      : awayScore > homeScore ? 'away' : homeScore > awayScore ? 'home' : 'tie',
  }));
}

// Minutes arrive as "35" or "35:30"; "-" (did not play) and anything unparseable count as missing.
export function parseMinutes(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = /^(\d+)(?::(\d{1,2}))?$/.exec(String(value ?? '').trim());
  if (!match) return null;
  return Number(match[1]) + (match[2] ? Number(match[2]) / 60 : 0);
}

// Shooting columns show "made/attempted"; they sort by makes.
const SORT_FIELDS = { fg: 'fgm', fg3: 'fg3m', ft: 'ftm' };

function sortValue(player, key) {
  if (key === 'min') return parseMinutes(player.min);
  const value = numeric(player[SORT_FIELDS[key] || key]);
  return Number.isFinite(value) ? value : null;
}

export function sortPlayers(players, sort) {
  if (!sort) return players;
  const direction = sort.dir === 'asc' ? 1 : -1;
  return (players || [])
    .map((player, index) => ({ player, index, value: sortValue(player, sort.key) }))
    .sort((a, b) => {
      // Missing values sink to the bottom in both directions.
      if (a.value === null || b.value === null) return (a.value === null) - (b.value === null) || a.index - b.index;
      // Equal values keep roster order (a stable sort).
      return (a.value - b.value) * direction || a.index - b.index;
    })
    .map(entry => entry.player);
}

// Header clicks cycle: high to low, low to high, then back to the default grouped view.
export function nextSort(current, key) {
  if (!current || current.key !== key) return { key, dir: 'desc' };
  return current.dir === 'desc' ? { key, dir: 'asc' } : null;
}

export function getColumnLeaders(players, keys = BOX_SCORE_LEADER_KEYS) {
  return Object.fromEntries(keys.map(key => {
    const values = (players || []).map(player => numeric(player[key])).filter(Number.isFinite);
    const best = values.length ? Math.max(...values) : 0;
    return [key, best > 0 ? best : null];
  }));
}
