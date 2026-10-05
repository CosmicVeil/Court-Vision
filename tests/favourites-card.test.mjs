import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeFavoritePlayer } from '../src/utils/favorites.js';

const component = readFileSync(new URL('../src/components/Favourites.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/Favourites.css', import.meta.url), 'utf8');

test('favourites card defines its stat and trend tile classes', () => {
  for (const name of ['player-stats-fav','stats-grid-fav','stat-item-fav','stat-label-fav','stat-value-fav','player-trends-fav','trends-grid-fav','trend-item-fav','trend-label-fav','trend-value-fav']) assert.match(css, new RegExp(`\\.${name}`));
  assert.match(css, /\.trend-value-fav\.positive/); assert.match(css, /\.trend-value-fav\.negative/);
  assert.match(css, /minmax\(min\(100%/); assert.match(css, /overflow-wrap:\s*anywhere/);
});

test('optional numeric favourite values use explicit presence checks', () => {
  assert.doesNotMatch(component, /\{player\.(?:stats|trends)\?*\.\w+ &&/);
  assert.doesNotMatch(component, /consistency_score &&/);
});

test('favourite normalizer preserves zeros and both saved shapes', () => {
  const nested = normalizeFavoritePlayer({ id: 1, name: 'A', stats: { ppg_last: 0, games_played: 0 }, trends: { consistency_score: 0 } });
  assert.equal(nested.stats.ppg_last, 0); assert.equal(nested.stats.games_played, 0); assert.equal(nested.trends.consistency_score, 0);
  const prediction = normalizeFavoritePlayer({ id: 2, name: 'B', stats: { ppg_last: 12, minutes: 30 } });
  assert.equal(prediction.stats.ppg_last, 12); assert.equal(prediction.stats.minutes, 30);
  assert.equal(prediction.stats.games_played, null);
  const legacy = normalizeFavoritePlayer({ id: 3, name: 'C', ppg_last: 9, mpg_last: 22 });
  assert.equal(legacy.stats.ppg_last, 9); assert.equal(legacy.stats.minutes, 22);
});
