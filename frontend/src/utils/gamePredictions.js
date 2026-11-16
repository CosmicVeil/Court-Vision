import { GAME_PREDICTION_STATS, gameStat } from '../config/gamePredictionStats.js';
import { formatStat, getStatDelta } from './playerCard.js';

const ET = 'America/New_York';
const PLACEHOLDER = '—';

const finite = value => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
  ? null : Number(value));

// Tip-off in US Eastern, the timezone the NBA schedules in: "7:30 PM ET".
export function formatTipoff(iso) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return 'TBD';
  return `${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ET })} ET`;
}

// "2026-11-14" -> "Sat, Nov 14". Parsed as a calendar date, so no timezone can shift the day.
export function formatSlateDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return PLACEHOLDER;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Today's calendar date in US Eastern, "YYYY-MM-DD": the day the API counts slates by.
export function todayInEastern(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: ET });
}

// A slate day relative to today: "Today", "Tomorrow", else "Wed, Nov 18".
export function formatDayLabel(value, today = todayInEastern()) {
  if (value && value === today) return 'Today';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today || '');
  if (value && match) {
    const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1, 12));
    if (value === next.toISOString().slice(0, 10)) return 'Tomorrow';
  }
  return formatSlateDate(value);
}

// Every day covered, as "Mon, Nov 16" or "Nov 16 – Nov 18".
export function formatSlateRange(dates) {
  const days = (dates || []).filter(Boolean);
  if (days.length <= 1) return formatSlateDate(days[0]);
  const short = value => formatSlateDate(value).replace(/^\w+, /, '');
  return `${short(days[0])} – ${short(days[days.length - 1])}`;
}

// Day tabs for a multi-day slate, nearest first, with an optional "All days" tab (id '').
export function getDayTabs(dates, { all = false, today } = {}) {
  const tabs = (dates || []).map(date => ({ id: date, label: formatDayLabel(date, today) }));
  return all ? [{ id: '', label: 'All days' }, ...tabs] : tabs;
}

// Games grouped by day, nearest day first; games without a date go with the slate's first day.
export function groupGamesByDay(games, fallbackDate = '') {
  const groups = new Map();
  for (const game of games || []) {
    const date = game.game_date || fallbackDate;
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(game);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([date, dayGames]) => ({ date, games: dayGames }));
}

// One of a player's later games, compacted for a line under his card: day, and PTS / REB / AST.
export function getLaterGameLine(game, today) {
  return {
    day: formatDayLabel(game?.game_date, today),
    stats: ['pts', 'reb', 'ast'].map(key => ({
      key, label: gameStat(key).unit,
      value: finite(game?.[`predicted_${key}`]) === null ? PLACEHOLDER : formatStat(game[`predicted_${key}`]),
    })),
  };
}

// Betting line in the usual form: the favourite and its spread, plus the total.
// spread is the home team's line, so a negative one means the home team is favoured.
export function formatLine(game) {
  const spread = finite(game?.spread);
  const total = finite(game?.over_under);
  const parts = [];
  if (spread !== null) {
    if (spread === 0) parts.push('PK');
    else parts.push(`${spread < 0 ? game.home : game.away} −${Math.abs(spread)}`);
  }
  if (total !== null) parts.push(`O/U ${total}`);
  return parts.join(' · ');
}

// One stat on a card: the projection, with its change against the last-10 average.
function cardStat(player, key) {
  return {
    key,
    label: gameStat(key).unit,
    value: formatStat(player?.[`predicted_${key}`]),
    delta: getStatDelta(player?.[`last10_${key}`], player?.[`predicted_${key}`]),
  };
}

const MAIN = ['pts', 'reb', 'ast', 'fantasy'];
// Everything else, in priority order; the card shows the first EXTRA_COUNT (two rows of three).
const EXTRA = ['fg3m', 'stl', 'blk', 'tov', 'minutes', 'pra', 'fantasy'];
const EXTRA_COUNT = 6;

// The card leads with the stat the list is sorted by, so the number you sorted on is visible.
export function getGameCardStats(player, lead = 'pts') {
  const main = MAIN.includes(lead) || !gameStat(lead) ? MAIN : [lead, ...MAIN.slice(0, MAIN.length - 1)];
  return {
    main: main.map(key => cardStat(player, key)),
    extra: EXTRA.filter(key => !main.includes(key)).slice(0, EXTRA_COUNT).map(key => cardStat(player, key)),
  };
}

// Sort param ("predicted_reb", "diff_pts") -> the stat key it is about ("reb", "pts").
export function sortStatKey(sort) {
  const match = /^(?:predicted|diff)_(.+)$/.exec(sort || '');
  return match && gameStat(match[1]) ? match[1] : 'pts';
}

// A pick card's headline: the projection and how far it is from the player's recent average.
export function getPickLine(player, key) {
  const predicted = finite(player?.[`predicted_${key}`]);
  const average = finite(player?.[`last10_${key}`]);
  const diff = predicted !== null && average !== null ? predicted - average : null;
  return {
    predicted: predicted === null ? PLACEHOLDER : predicted.toFixed(1),
    average: average === null ? PLACEHOLDER : average.toFixed(1),
    diff: diff === null ? null : { text: `${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)}`, up: diff >= 0 },
  };
}

// The model's held-out edge over "he'll match his last-10 average", from the cache's accuracy
// block (walk-forward MAE, backend scripts/evaluate_game_model.py). null without a report.
export function getGameModelEdge(accuracy) {
  const stats = ['pts', 'reb', 'ast']
    .map(key => ({ key, ...accuracy?.[key] }))
    .filter(stat => finite(stat.mae) !== null && finite(stat.naive_mae) !== null);
  if (!stats.length) return null;
  const points = stats.find(stat => stat.key === 'pts');
  return {
    pointsEdge: points ? Math.round(finite(points.improvement_pct) ?? 0) : null,
    stats: stats.map(stat => ({ key: stat.key, label: gameStat(stat.key).unit, miss: Number(stat.mae).toFixed(1) })),
  };
}

// slateDates: every day covered; day: the one picked, if any.
export function getGamePredictionsHeroStats({ ready, slateDate, slateDates, day, games, total, sort, order } = {}) {
  const arrow = order === 'asc' ? '↑' : '↓';
  const sortLabel = sort === 'name' ? 'Name' : `${sort?.startsWith('diff_') ? 'Δ ' : ''}${gameStat(sortStatKey(sort)).unit}`;
  const rows = [
    ['slate', 'Slate', day ? formatSlateDate(day) : formatSlateRange(slateDates?.length ? slateDates : [slateDate])],
    ['games', 'Games', String(games ?? 0)],
    ['players', 'Players', (Number(total) || 0).toLocaleString('en-US')],
    ['sort', 'Sorted by', `${sortLabel} ${arrow}`],
  ];
  return rows.map(([key, label, value]) => ({ key, label, value: ready ? value : PLACEHOLDER }));
}

// A next-game row (predicted_*, last10_*) as the two maps PlayerPredictionGrid compares.
export function toGameGridStats(prediction) {
  const currentStats = {};
  const predictionStats = {};
  for (const { key } of GAME_PREDICTION_STATS) {
    currentStats[key] = finite(prediction?.[`last10_${key}`]);
    predictionStats[key] = finite(prediction?.[`predicted_${key}`]);
  }
  return { currentStats, predictionStats };
}

// Team filter options: the teams in the selected game, or every team on the slate when no game
// is selected. Sorted, so the dropdown reads alphabetically.
export function teamsForGames(games, gameId = '') {
  const selected = gameId ? (games || []).filter(game => game.game_id === gameId) : (games || []);
  return [...new Set(selected.flatMap(game => [game.away, game.home]))].sort();
}
