import assert from 'node:assert/strict';
import test from 'node:test';
import { readFrontend as read, readSource } from './helpers.mjs';

const { getFlipMoves } = await import('../src/utils/flip.js').catch(() => ({}));
const { shouldResetScroll, isAboveView } = await import('../src/utils/scroll.js').catch(() => ({}));

test('FLIP moves are the offset from the new position back to the old one', () => {
  assert.equal(typeof getFlipMoves, 'function');
  const before = new Map([['a', { x: 0, y: 0 }], ['b', { x: 340, y: 0 }], ['c', { x: 0, y: 420 }]]);
  const after = new Map([['a', { x: 340, y: 0 }], ['b', { x: 0, y: 0 }], ['c', { x: 0, y: 420 }], ['d', { x: 340, y: 420 }]]);
  assert.deepEqual(getFlipMoves(before, after), [
    { key: 'a', dx: -340, dy: 0 },
    { key: 'b', dx: 340, dy: 0 },
  ], 'unmoved (c) and new (d) cards are left alone');
});

test('FLIP ignores sub-pixel jitter and handles a missing snapshot', () => {
  assert.deepEqual(getFlipMoves(new Map([['a', { x: 0, y: 0 }]]), new Map([['a', { x: 0.4, y: -0.6 }]])), []);
  assert.deepEqual(getFlipMoves(null, new Map([['a', { x: 1, y: 1 }]])), []);
});

test('scroll resets to the top for link clicks, not for Back/Forward', () => {
  assert.equal(typeof shouldResetScroll, 'function');
  assert.equal(shouldResetScroll('PUSH', '/stats', '/predictions'), true);
  assert.equal(shouldResetScroll('REPLACE', '/login', '/'), true);
  assert.equal(shouldResetScroll('POP', '/predictions', '/stats'), false, 'Back/Forward is left to the browser');
});

test('results only scroll into view when their top is hidden above or under the header', () => {
  assert.equal(typeof isAboveView, 'function');
  assert.equal(isAboveView(-300, 88), true);
  assert.equal(isAboveView(40, 88), true, 'tucked under the fixed header');
  assert.equal(isAboveView(200, 88), false);
});

test('the page scrolls smoothly unless reduced motion is on, stops below the header, and has themed scrollbars', () => {
  const tokens = read('src/styles/tokens.css');
  assert.match(tokens, /color-scheme: dark/);
  assert.match(tokens, /--header-height: 72px/);
  assert.match(tokens, /scroll-padding-top: calc\(var\(--header-height\)/);
  assert.match(tokens, /scrollbar-gutter: stable/);
  assert.match(tokens, /html\s*\{[^}]*scroll-behavior: smooth;/);
  const reduced = tokens.slice(tokens.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduced, /html\s*\{\s*scroll-behavior: auto;/, 'reduced motion jumps instead of gliding');
  // Colours belong to the theme, so the scrollbar styling lives in Home.css, not the tokens.
  const theme = read('src/pages/Home.css');
  assert.match(theme, /scrollbar-color:/);
  assert.match(theme, /scrollbar-width: thin/);
  assert.match(theme, /::-webkit-scrollbar-thumb/);
  assert.doesNotMatch(theme, /scroll-behavior/, 'one source for scroll behaviour');
});

test('the shell resets scroll on navigation and offers back-to-top', () => {
  const shell = readSource('AppShell.jsx');
  assert.match(shell, /useNavigationType/);
  assert.match(shell, /shouldResetScroll\(navigationType, previousPathRef\.current, pathname\)/);
  assert.match(shell, /behavior: 'instant'/, 'a new page must not visibly scroll up from the old position');
  assert.match(shell, /<BackToTop \/>/);
  const button = readSource('BackToTop.jsx');
  assert.match(button, /IntersectionObserver/);
  assert.match(button, /inert={!visible}/);
  assert.match(button, /aria-label="Back to top"/);
});

test('Stats and Predictions cards glide to new positions and page changes scroll to the results', () => {
  const hook = read('src/hooks/useFlip.js');
  assert.match(hook, /getFlipMoves/);
  assert.match(hook, /offsetLeft/, 'layout positions, unaffected by tilt transforms or scroll');
  assert.match(hook, /\.animate\(/);
  assert.match(hook, /prefers-reduced-motion: reduce/);
  assert.match(readSource('PlayerCard.jsx'), /data-flip={player\.id}/);
  for (const file of ['Stats.jsx', 'Predictions.jsx']) {
    const page = readSource(file);
    assert.match(page, /useFlip\(gridRef\)/, file);
    assert.match(page, /goToPage/, file);
  }
});
