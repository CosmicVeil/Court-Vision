import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeFavoritePlayer } from '../src/utils/favorites.js';
import { getFavouritesHeroStats } from '../src/utils/pageHero.js';
import { getFavouriteCardStats } from '../src/utils/playerCard.js';

const component = readFileSync(new URL('../src/pages/Favourites.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/pages/Favourites.css', import.meta.url), 'utf8');

test('favourites render the shared PlayerCard with remove and open wired to the existing handlers', () => {
  assert.match(component, /<PlayerCard\b/);
  assert.match(component, /<div className="pc-grid">/);
  assert.match(component, /getFavouriteCardStats\(player\)/);
  assert.match(component, /isFavorite\s+onToggleFavorite=\{\(\) => handleRemoveFavorite\(player\.id\)\}/);
  assert.match(component, /onOpen=\{\(\) => handlePlayerClick\(player\)\}/);
  assert.match(component, /<PlayerStatsModal\b/);
  // The hand-built card and its click-anywhere div are gone.
  assert.doesNotMatch(component, /favourite-card|<div[^>]*onClick=/);
  assert.doesNotMatch(css, /\.favourite-card|\.favorite-btn-fav|\.stat-item-fav/);
});

test('favourites keep their trend tiles inside the card', () => {
  for (const name of ['player-trends-fav', 'trends-grid-fav', 'trend-item-fav', 'trend-label-fav', 'trend-value-fav']) assert.match(css, new RegExp(`\\.${name}`));
  assert.match(css, /\.trend-value-fav\.positive/); assert.match(css, /\.trend-value-fav\.negative/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});

test('the page heading is the shared PageHero with a key stats row', () => {
  assert.match(component, /<PageHero eyebrow="PLAYER ROSTER" title="SAVED" accent="FAVOURITES"/);
  assert.match(component, /getFavouritesHeroStats\(\{ ready: !loading, favorites \}\)/);
  // ScrollReveal stays mounted through loading so the cards rise in when they arrive.
  assert.match(component, /<ScrollReveal scanKey=\{favorites\} \/>/);
});

test('inline styling moved into the stylesheet; only the reveal delay stays inline', () => {
  const styles = component.match(/style=\{[^}]*\}\}?/g) ?? [];
  assert.ok(styles.every(style => /^style=\{enterDelay\(\d+\)\}$/.test(style)), styles.join(', '));
  for (const name of ['empty-state\\.is-locked', 'empty-icon-wrapper', 'empty-actions', 'empty-cta\\.is-secondary']) assert.match(css, new RegExp(`\\.${name}\\s*\\{`));
  assert.match(css, /\.empty-cta:focus-visible\s*\{\s*outline:\s*2px solid var\(--color-ember-orange\);\s*outline-offset:\s*3px;/);
});

test('favourite hero stats count players and teams and find the top scorer', () => {
  const players = [
    { name: 'A', team: 'BOS', stats: { ppg_last: 20 } },
    { name: 'B', team: 'BOS', stats: { ppg_last: 30 } },
    { name: 'C', team: 'UNK', stats: { ppg_last: null } },
  ];
  assert.deepEqual(getFavouritesHeroStats({ ready: true, favorites: players }).map(stat => [stat.key, stat.value]),
    [['saved', '3'], ['teams', '1'], ['ppg', '25.0'], ['top', 'B']]);
  assert.deepEqual(getFavouritesHeroStats({ ready: true, favorites: [] }).map(stat => stat.value), ['0', '0', '—', '—']);
  assert.ok(getFavouritesHeroStats({ ready: false, favorites: players }).every(stat => stat.value === '—'));
});

test('favourite card stats leave out values the saved player does not have, but keep zeros', () => {
  const fromPredictions = normalizeFavoritePlayer({ id: 1, name: 'P', stats: { ppg_last: 12, apg_last: 3, rpg_last: 4, fg_pct_last: 0 } });
  const { main, extra } = getFavouriteCardStats(fromPredictions);
  assert.deepEqual(main.map(stat => stat.value), ['12.0', '3.0', '4.0']);
  assert.deepEqual(extra.map(stat => [stat.key, stat.value]), [['fg_pct', '0.0%']]);
  const full = getFavouriteCardStats({ stats: { spg_last: 1, bpg_last: 1, fg_pct_last: 50, fg3_pct_last: 40, ft_pct_last: 80, games_played: 0 } });
  assert.deepEqual(full.extra.map(stat => stat.key), ['spg', 'bpg', 'fg_pct', 'fg3_pct', 'ft_pct', 'games']);
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
