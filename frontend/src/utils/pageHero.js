import { PREDICTION_STATS } from '../config/predictionStats.js';

// The season the backend serves when no year is chosen (2026-27, built from the game archive).
export const CURRENT_SEASON_YEAR = 2027;

const PLACEHOLDER = '—';
const ARROWS = { asc: '↑', desc: '↓' };

const STATS_SORT_LABELS = {
  name: 'Name', team: 'Team', position: 'Position', ppg: 'PPG', apg: 'APG', rpg: 'RPG', spg: 'SPG',
  bpg: 'BPG', fg_pct: 'FG%', fg3_pct: '3P%', ft_pct: 'FT%', games: 'Games',
};
const PREDICTION_SORT_LABELS = {
  name: 'Name',
  ...Object.fromEntries(PREDICTION_STATS.map(stat => [stat.predictedField, stat.unit])),
};

// Words of the heading, numbered across the plain part and the ember accent so they rise in
// one continuous stagger.
export function getHeroWords(title, accent = '') {
  const split = (text, isAccent) => String(text || '').trim().split(/\s+/).filter(Boolean)
    .map(word => ({ text: word, accent: isAccent }));
  return [...split(title, false), ...split(accent, true)].map((word, index) => ({ ...word, index }));
}

// "2026" is the 2025-26 season; no year means the current season.
export function formatSeason(year) {
  const end = Number(year) || CURRENT_SEASON_YEAR;
  return `${end - 1}-${String(end).slice(-2)}`;
}

const sortValue = (labels, sort, order) => `${labels[sort] || sort} ${ARROWS[order] || ''}`.trim();
const countValue = total => (Number(total) || 0).toLocaleString('en-US');
const pageValue = (page, totalPages) => `${page || 1} / ${Math.max(1, Number(totalPages) || 1)}`;

// Until the first response arrives, every value is a placeholder rather than a guess.
function build(ready, rows) {
  return rows.map(([key, label, value]) => ({ key, label, value: ready ? value : PLACEHOLDER }));
}

export function getStatsHeroStats({ ready, total, year, sort, order, page, totalPages } = {}) {
  return build(ready, [
    ['players', 'Players', countValue(total)],
    ['season', 'Season', formatSeason(year)],
    ['sort', 'Sorted by', sortValue(STATS_SORT_LABELS, sort, order)],
    ['page', 'Page', pageValue(page, totalPages)],
  ]);
}

export function getPredictionsHeroStats({ ready, total, sort, order, page, totalPages } = {}) {
  return build(ready, [
    ['players', 'Players', countValue(total)],
    ['forecast', 'Stats forecast', String(PREDICTION_STATS.length)],
    ['sort', 'Sorted by', sortValue(PREDICTION_SORT_LABELS, sort, order)],
    ['page', 'Page', pageValue(page, totalPages)],
  ]);
}

const finite = value => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));

// Favourites are read from localStorage, so `ready` is only false for the first render.
export function getFavouritesHeroStats({ ready, favorites = [] } = {}) {
  const scorers = favorites
    .map(player => ({ name: player.name, ppg: finite(player.stats?.ppg_last) }))
    .filter(player => player.ppg !== null);
  const top = scorers.reduce((best, player) => (!best || player.ppg > best.ppg ? player : best), null);
  const teams = new Set(favorites.map(player => player.team).filter(team => team && team !== 'UNK'));
  return build(ready, [
    ['saved', 'Saved', countValue(favorites.length)],
    ['teams', 'Teams', countValue(teams.size)],
    ['ppg', 'Avg PPG', scorers.length
      ? (scorers.reduce((sum, player) => sum + player.ppg, 0) / scorers.length).toFixed(1) : PLACEHOLDER],
    ['top', 'Top scorer', top ? top.name : PLACEHOLDER],
  ]);
}
