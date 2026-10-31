import { PREDICTION_STATS } from '../config/predictionStats.js';

// Below this the change is noise, so the card shows it as flat rather than up or down.
const FLAT_DELTA = 0.05;

const toFinite = value => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function formatStat(value, { digits = 1, suffix = '' } = {}) {
  return `${(toFinite(value) ?? 0).toFixed(digits)}${suffix}`;
}

export function getStatDelta(current, predicted) {
  const from = toFinite(current);
  const to = toFinite(predicted);
  if (from === null || to === null) return null;
  const change = to - from;
  if (Math.abs(change) < FLAT_DELTA) return { text: '0.0', direction: 'flat' };
  // A real minus sign, so "−1.8" lines up with "+1.8" in tabular figures.
  return { text: `${change > 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}`, direction: change > 0 ? 'up' : 'down' };
}

const PREDICTION_MAIN = ['ppg', 'apg', 'rpg'];
const SHOOTING = [
  { key: 'fg_pct', label: 'FG%' },
  { key: 'fg3_pct', label: '3P%' },
  { key: 'ft_pct', label: 'FT%' },
];
const percent = { suffix: '%' };

// Predictions are for this season, so they compare against this season so far (so_far_*, from the
// game archive). A player with no games yet has nothing to compare against.
const soFarShooting = player => SHOOTING.map(({ key, label }) => {
  const value = toFinite(player?.[`so_far_${key}`]);
  return { key, label, value: value === null ? '—' : formatStat(value, percent) };
});

export function getPredictionCardStats(player) {
  const main = PREDICTION_MAIN.map(key => {
    const stat = PREDICTION_STATS.find(item => item.key === key);
    return {
      key,
      label: stat.unit,
      value: formatStat(player?.[stat.predictedField]),
      delta: getStatDelta(player?.[`so_far_${key}`], player?.[stat.predictedField]),
    };
  });
  return { main, extra: soFarShooting(player) };
}

// The home "Projected leaders" panel gets the model's raw rows (PREDICTED_PPG, …) plus the API's
// so_far_* fields. Cards lead with the tab's own stat, then fill up with PPG/APG/RPG.
export function getLeaderCardStats(player, lead = 'ppg') {
  const keys = [lead, ...PREDICTION_MAIN.filter(key => key !== lead)].slice(0, PREDICTION_MAIN.length);
  const main = keys.map(key => {
    const field = key.toUpperCase();
    return {
      key,
      label: PREDICTION_STATS.find(item => item.key === key).unit,
      value: formatStat(player?.[`PREDICTED_${field}`]),
      delta: getStatDelta(player?.[`so_far_${key}`], player?.[`PREDICTED_${field}`]),
    };
  });
  return { main, extra: soFarShooting(player) };
}

export function getSeasonCardStats(player) {
  const stats = player?.stats || {};
  const stat = (key, label, options) => ({ key, label, value: formatStat(stats[`${key}_last`], options) });
  return {
    main: [stat('ppg', 'PPG'), stat('apg', 'APG'), stat('rpg', 'RPG')],
    extra: [
      stat('spg', 'SPG'),
      stat('bpg', 'BPG'),
      ...SHOOTING.map(({ key, label }) => stat(key, label, percent)),
      { key: 'games', label: 'GP', value: formatStat(stats.games_played, { digits: 0 }) },
    ],
  };
}

// A saved favourite keeps whatever its source page had: one saved from Predictions has no games
// played, for example. Leave out stats with no saved value rather than showing them as 0.
const SEASON_SOURCE = { games: 'games_played' };

export function getFavouriteCardStats(player) {
  const { main, extra } = getSeasonCardStats(player);
  const saved = stat => toFinite(player?.stats?.[SEASON_SOURCE[stat.key] ?? `${stat.key}_last`]) !== null;
  return { main, extra: extra.filter(saved) };
}

export const toStatValues = stats => Object.fromEntries((stats || []).map(stat => [stat.key, stat.value]));

// Keys whose value differs from the previous render, so only those tick in.
export function getChangedStatKeys(previous, stats) {
  if (!previous) return new Set();
  return new Set((stats || [])
    .filter(stat => stat.key in previous && previous[stat.key] !== stat.value)
    .map(stat => stat.key));
}
