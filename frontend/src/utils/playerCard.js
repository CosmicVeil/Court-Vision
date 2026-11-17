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
// The Predictions page also shows fantasy points, so the stat it can be sorted by is on the card.
const PREDICTION_CARD_MAIN = [...PREDICTION_MAIN, 'fantasy'];
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

// Each predicted stat with its change vs this season so far: shared by the cards and the table.
const predictedStats = (player, keys) => keys.map(key => {
  const stat = PREDICTION_STATS.find(item => item.key === key);
  return {
    key,
    label: stat.unit,
    value: formatStat(player?.[stat.predictedField], stat.changeUnit === 'pp' ? percent : undefined),
    delta: getStatDelta(player?.[`so_far_${key}`], player?.[stat.predictedField]),
  };
});

export function getPredictionCardStats(player) {
  return { main: predictedStats(player, PREDICTION_CARD_MAIN), extra: soFarShooting(player) };
}

// The Predictions table view: one column per predicted per-game stat plus fantasy points. `field`
// is the predicted field, which is also the page's sort key for that column.
const TABLE_KEYS = ['ppg', 'apg', 'rpg', 'spg', 'bpg', 'fantasy'];
const toTableColumn = stat => ({ key: stat.key, label: stat.unit, field: stat.predictedField });
export const PREDICTION_TABLE_COLUMNS = TABLE_KEYS.map(key => toTableColumn(PREDICTION_STATS.find(item => item.key === key)));

// Sorting by a predicted stat the table doesn't show (TOV, MPG, shooting) adds that stat's column,
// so the order on screen is always explained by a visible, marked column.
export function getPredictionTableColumns(sortBy) {
  const sorted = PREDICTION_STATS.find(stat => stat.predictedField === sortBy);
  return sorted && !TABLE_KEYS.includes(sorted.key)
    ? [...PREDICTION_TABLE_COLUMNS, toTableColumn(sorted)]
    : PREDICTION_TABLE_COLUMNS;
}

export function getPredictionTableRow(player, columns = PREDICTION_TABLE_COLUMNS) {
  return predictedStats(player, columns.map(column => column.key)).map(({ key, value, delta }) => ({ key, value, delta }));
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
      stat('fantasy', 'FPTS'),
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
