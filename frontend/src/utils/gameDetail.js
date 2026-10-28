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

export function getColumnLeaders(players, keys = BOX_SCORE_LEADER_KEYS) {
  return Object.fromEntries(keys.map(key => {
    const values = (players || []).map(player => numeric(player[key])).filter(Number.isFinite);
    const best = values.length ? Math.max(...values) : 0;
    return [key, best > 0 ? best : null];
  }));
}
