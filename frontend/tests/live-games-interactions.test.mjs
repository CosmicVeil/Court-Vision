import assert from 'node:assert/strict';
import test from 'node:test';
import { readFrontend as read } from './helpers.mjs';

const helpers = await import('../src/utils/liveInteractions.js').catch(() => ({}));

const game = (gameId, status, away, home, extra = {}) => ({
  gameId, status, period: 4, gameClock: '1:37', statusText: 'Final',
  away: { tricode: 'BKN', score: away }, home: { tricode: 'BOS', score: home }, ...extra,
});

test('score changes are flagged per side only for games seen before', () => {
  assert.equal(typeof helpers.getScoreChanges, 'function');
  const before = [game('a', 2, 100, 98), game('b', 2, 50, 50)];
  const after = [game('a', 2, 102, 98), game('b', 2, 50, 50), game('c', 2, 10, 12)];
  assert.deepEqual(helpers.getScoreChanges(before, after), { a: { away: true, home: false } });
  assert.deepEqual(helpers.getScoreChanges([], after), {}, 'first load never pops');
  assert.deepEqual(helpers.getScoreChanges(null, after), {});
  assert.deepEqual(helpers.getScoreChanges(before, [game('a', 2, 100, 101)]), { a: { away: false, home: true } });
  assert.deepEqual(helpers.getScoreChanges([game('a', 1, undefined, undefined)], [game('a', 2, 0, 0)]), {},
    'tip-off from no score to 0-0 is not a scoring change');
});

test('pointer tilt maps the card position to clamped rotations and a spotlight origin', () => {
  assert.equal(typeof helpers.getTilt, 'function');
  const rect = { left: 100, top: 50, width: 200, height: 100 };
  assert.deepEqual(helpers.getTilt({ clientX: 200, clientY: 100 }, rect), { rx: 0, ry: 0, mx: 50, my: 50 });
  assert.deepEqual(helpers.getTilt({ clientX: 300, clientY: 50 }, rect), { rx: 4, ry: 4, mx: 100, my: 0 });
  assert.deepEqual(helpers.getTilt({ clientX: 100, clientY: 150 }, rect, 6), { rx: -6, ry: -6, mx: 0, my: 100 });
  assert.deepEqual(helpers.getTilt({ clientX: 900, clientY: -900 }, rect), { rx: 4, ry: 4, mx: 100, my: 0 }, 'clamps outside the card');
  assert.deepEqual(helpers.getTilt({ clientX: 5, clientY: 5 }, { left: 0, top: 0, width: 0, height: 0 }), { rx: 0, ry: 0, mx: 50, my: 50 });
});

test('ticker items describe live, final and upcoming games', () => {
  assert.equal(typeof helpers.getTickerItems, 'function');
  const items = helpers.getTickerItems([
    game('live', 2, 109, 107),
    game('final', 3, 99, 101),
    game('next', 1, undefined, undefined, { statusText: '7:30 PM ET' }),
  ]);
  assert.deepEqual(items, [
    { gameId: 'live', live: true, matchup: 'BKN 109 – 107 BOS', status: 'Q4 1:37' },
    { gameId: 'final', live: false, matchup: 'BKN 99 – 101 BOS', status: 'Final' },
    { gameId: 'next', live: false, matchup: 'BKN vs BOS', status: '7:30 PM ET' },
  ]);
  assert.deepEqual(helpers.getTickerItems(undefined), []);
});

test('orbit chips take live games first and never exceed the slots', () => {
  assert.equal(typeof helpers.getOrbitChips, 'function');
  assert.ok(Array.isArray(helpers.ORBIT_SLOTS) && helpers.ORBIT_SLOTS.length === 3);
  const chips = helpers.getOrbitChips([game('f', 3, 1, 2), game('l1', 2, 3, 4), game('l2', 2, 5, 6), game('l3', 2, 7, 8), game('l4', 2, 9, 9)]);
  assert.deepEqual(chips.map(chip => chip.gameId), ['l1', 'l2', 'l3']);
  assert.deepEqual(chips.map(chip => chip.slot), helpers.ORBIT_SLOTS);
  assert.equal(chips[0].matchup, 'BKN 3 – 4 BOS');
  assert.deepEqual(helpers.getOrbitChips([game('f', 3, 1, 2)]), [], 'no live games, no chips');
});

test('Live Games wires the interaction layer and keeps it accessible', () => {
  const page = read('src/pages/LiveGames.jsx');
  for (const pattern of [/<HeroOrbit/, /<LiveTicker/, /<SyncDock/, /getScoreChanges/, /usePointerTilt\(\)/,
    /onPointerMove/, /className="lg-title-word"/, /className="stat-tick" key=/]) assert.match(page, pattern);
  const dock = read('src/components/SyncDock.jsx');
  assert.match(dock, /new IntersectionObserver/);
  assert.match(dock, /aria-label="Refresh games now"/);
  assert.match(dock, /--countdown/);
  for (const file of ['src/components/HeroOrbit.jsx', 'src/components/LiveTicker.jsx']) {
    const source = read(file);
    assert.match(source, /aria-hidden="true"/, `${file} decoration is hidden from assistive tech`);
    assert.match(source, /tabIndex=\{-1\}/, `${file} links stay out of the tab order (cards are the accessible path)`);
  }
  assert.match(read('src/components/GameBoxScore.jsx'), /scoreChanges/);
});

test('interaction motion is gated for hover devices and reduced motion', () => {
  const css = read('src/pages/LiveGames.css');
  const tokens = read('src/styles/tokens.css');
  for (const name of ['rise', 'tick-in', 'float', 'appear', 'marquee', 'countdown', 'score-pop', 'ripple']) {
    assert.match(tokens, new RegExp(`@keyframes ${name}\\b`), `${name} keyframes live in the shared tokens`);
  }
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /\.lg-live-page \.game-card::after/);
  assert.doesNotMatch(css.slice(css.indexOf('/* Interaction layer')), /transition: all/);
  const reduced = tokens.slice(tokens.indexOf('@media (prefers-reduced-motion: reduce)'));
  for (const selector of ['.lg-title-word', '.stat-tick', '.orbit-chip', '.ticker-track']) {
    assert.match(reduced + css, new RegExp(selector.replace('.', '\\.')), `${selector} has a reduced-motion rule`);
  }
});
