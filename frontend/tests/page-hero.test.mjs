import assert from 'node:assert/strict';
import test from 'node:test';
import { readSource } from './helpers.mjs';

const { getHeroWords, formatSeason, getStatsHeroStats, getPredictionsHeroStats } =
  await import('../src/utils/pageHero.js').catch(() => ({}));

const values = stats => stats.map(({ label, value }) => [label, value]);

test('heading words are numbered across the plain and ember parts, for one rising stagger', () => {
  assert.equal(typeof getHeroWords, 'function');
  assert.deepEqual(getHeroWords('NBA PLAYER', 'STATISTICS'), [
    { text: 'NBA', accent: false, index: 0 },
    { text: 'PLAYER', accent: false, index: 1 },
    { text: 'STATISTICS', accent: true, index: 2 },
  ]);
  assert.deepEqual(getHeroWords('  NEURAL   MATCHUP ', ''), [
    { text: 'NEURAL', accent: false, index: 0 },
    { text: 'MATCHUP', accent: false, index: 1 },
  ]);
});

test('a season year is shown as the NBA season it ends, and no year means the current season', () => {
  assert.equal(typeof formatSeason, 'function');
  assert.equal(formatSeason('2026'), '2025-26');
  assert.equal(formatSeason('2020'), '2019-20');
  assert.equal(formatSeason(''), '2026-27');
});

test('Stats hero shows the matching players, season, sort and page', () => {
  assert.equal(typeof getStatsHeroStats, 'function');
  assert.deepEqual(values(getStatsHeroStats({ ready: true, total: 583, year: '', sort: 'ppg', order: 'desc', page: 2, totalPages: 6 })),
    [['Players', '583'], ['Season', '2026-27'], ['Sorted by', 'PPG ↓'], ['Page', '2 / 6']]);
  assert.deepEqual(values(getStatsHeroStats({ ready: true, total: 1234, year: '2023', sort: 'name', order: 'asc', page: 1, totalPages: 13 })),
    [['Players', '1,234'], ['Season', '2022-23'], ['Sorted by', 'Name ↑'], ['Page', '1 / 13']]);
});

test('Predictions hero shows players, how many stats are forecast, sort and page', () => {
  assert.equal(typeof getPredictionsHeroStats, 'function');
  assert.deepEqual(values(getPredictionsHeroStats({ ready: true, total: 583, sort: 'predicted_apg', order: 'desc', page: 1, totalPages: 49 })),
    [['Players', '583'], ['Stats forecast', '10'], ['Sorted by', 'APG ↓'], ['Page', '1 / 49']]);
  assert.equal(getPredictionsHeroStats({ ready: true, total: 5, sort: 'name', order: 'asc', page: 1, totalPages: 1 })[2].value, 'Name ↑');
});

test('before the first response every value is a placeholder, so nothing claims a number it does not have', () => {
  for (const stats of [getStatsHeroStats({ ready: false }), getPredictionsHeroStats({ ready: false })]) {
    assert.ok(stats.every(({ value }) => value === '—'), JSON.stringify(stats));
  }
});

test('an unknown sort key still produces a readable label', () => {
  assert.equal(getStatsHeroStats({ ready: true, total: 1, sort: 'mystery', order: 'asc', page: 1, totalPages: 1 })[2].value, 'mystery ↑');
});

test('PageHero renders the section anatomy with rising words and ticking stats', () => {
  const hero = readSource('PageHero.jsx');
  for (const slot of ['eyebrow', 'display-heading', 'lead', 'stat-strip']) assert.match(hero, new RegExp(`data-slot="${slot}"`));
  assert.match(hero, /getHeroWords\(title, accent\)/);
  assert.match(hero, /'--word': word\.index/);
  assert.match(hero, /aria-label={`\$\{title\} \$\{accent\}`\.trim\(\)}/, 'split words are read as one heading');
  assert.match(hero, /key={value}/, 'values re-key so a change ticks in');
  const css = readSource('PageHero.css');
  assert.match(css, /animation: rise/);
  assert.match(css, /animation: tick-in/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
});

test('Stats and Predictions use PageHero, including while the first load is pending', () => {
  for (const file of ['Stats.jsx', 'Predictions.jsx']) {
    const page = readSource(file);
    assert.match(page, /<PageHero\b/, file);
    assert.doesNotMatch(page, /className="(stats|predictions)-header"/, file);
  }
  const stats = readSource('Stats.jsx');
  assert.ok((stats.match(/\{hero\}/g) || []).length >= 3, 'loading, error and loaded views all show the hero');
});

test('box-score sort buttons are scoped, so they do not restyle the Stats sort buttons', () => {
  // Page CSS is global: a bare .sort-btn in LiveGames.css loads after Stats.css and wins.
  const css = readSource('LiveGames.css');
  assert.doesNotMatch(css, /^\s*\.sort-(btn|arrow)\b/m);
  assert.match(css, /\.boxscore \.sort-btn \{/);
});

test('Predictions copy describes the model it actually uses (XGBoost, this season\'s averages)', () => {
  const page = readSource('Predictions.jsx');
  assert.doesNotMatch(page, /neural/i, 'the model is gradient-boosted trees, not a neural network');
  assert.match(page, /XGBoost/);
  assert.match(page, /this season/i);
});

test('Home, Contact and Recommendations describe the XGBoost model, not neural networks or inputs it does not use', () => {
  for (const file of ['Home.jsx', 'Contact.jsx', 'Recommendations.jsx']) {
    const page = readSource(file);
    assert.doesNotMatch(page, /neural|deep.learning/i, file);
    assert.match(page, /XGBoost/, file);
  }
  // The model only sees each player's own season stats: no pace, ratings or opponent matchups.
  assert.doesNotMatch(readSource('Home.jsx'), /team pace|offensive rating|matchup efficiency|possession metrics/i);
});
