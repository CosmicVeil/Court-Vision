import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { readFrontend as read } from './helpers.mjs';

const block = (css, selector) => css.slice(css.indexOf(`${selector} {`)).split('}')[0];

test('structural token defaults preserve existing theme values regardless of eager page import order', () => {
  const main = read('src/main.jsx');
  assert.match(main, /import '.\/styles\/tokens.css'\s*\nimport '.\/pages\/Home.css'/);
  assert.ok(existsSync(new URL('../src/styles/tokens.css', import.meta.url)), 'Tokens exist');
  const css = read('src/styles/tokens.css');
  assert.match(css, /@layer[^\{]*\{\s*:root\s*\{/);
  for (const token of ['space', 'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl',
    'text-display-sm', 'text-display-md', 'tracking-display', 'leading-display', 'leading-snug',
    'radius-sm', 'radius-md', 'radius-lg', 'radius-xl', 'duration-fast', 'duration-base', 'duration-slow',
    'duration-reveal', 'ease-brand', 'container-page', 'container-content', 'gutter']) {
    assert.match(css, new RegExp(`--${token}:`));
  }
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|--radius-full:/i);
  assert.match(css, /\[data-numeric\], table\s*\{[^}]*tabular-nums/);
  assert.match(css, /h1, h2, h3\s*\{[^}]*text-wrap: balance/);
  assert.match(css, /p\s*\{[^}]*text-wrap: pretty/);
});

test('motion CSS pauses offscreen decoration and reduces motion without stopping the status spinner', () => {
  assert.ok(existsSync(new URL('../src/styles/tokens.css', import.meta.url)), 'Tokens exist');
  const css = read('src/styles/tokens.css');
  assert.match(css, /html\[data-motion\] \[data-reveal\]:not\(\[data-revealed\]\)/);
  assert.match(css, /html\[data-motion-ready\] \[data-reveal\]/);
  assert.match(css, /\[data-reveal="fade"\][^{]*\{[^}]*translate: none/);
  assert.match(css, /\[data-offscreen\]::before,/);
  assert.match(css, /\[data-offscreen\]::after,/);
  assert.match(css, /\[data-offscreen\] \*::before/);
  assert.match(css, /\[data-offscreen\] \*::after\s*\{[^}]*animation-play-state: paused !important/);
  assert.equal((css.match(/prefers-reduced-motion/g) || []).length, 1);
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion'));
  assert.match(reduced, /translate: none !important/);
  assert.match(reduced, /transition-property: opacity/);
  assert.match(reduced, /\[data-defer\] \*::after\s*\{[^}]*animation: none !important/);
  assert.match(reduced, /transition-duration: 0s/);
  assert.doesNotMatch(reduced, /spinner/);
  assert.doesNotMatch(css, /transition:\s*all/);
  assert.match(css, /\[data-indicator-animate\] [^{]*\{\s*transition: transform/);
  assert.match(css, /:focus-visible\s*\{[^}]*outline: 2px/);
});

test('Live Games adopts anatomy, numeric chrome, stable card identity and rescans after content changes', () => {
  const page = read('src/pages/LiveGames.jsx');
  for (const pattern of [/lg-page lg-live-page/, /<section className="lg-hero"/,
    /data-slot="eyebrow"/, /data-slot="display-heading"/, /data-slot="lead"/, /data-slot="stat-strip"/,
    /<dd data-numeric>/, /getLiveGamesStats/, /<PillNav/, /data-numeric className="live-badge"/,
    /data-numeric className="count-badge"/, /role="tabpanel"/, /aria-labelledby=/,
    /className="games-grid">/, /data-reveal data-defer/,
    /getRevealDelay\(index\)/, /key=\{game.gameId\}/, /index=\{index\}/,
    /<ScrollReveal scanKey=\{revealKey\}/, /\$\{tab\}:\$\{upcomingPage\}:\$\{loading\}/,
    /games.map\(g => g.gameId\).join\(','\)/, /<Pagination\b/, /games\/today/, /LIVE_GAMES_REFRESH_MS/, /GAME_STATUS_ORDER/,
  ]) assert.match(page, pattern);
  // Cards reveal individually; a reveal on the whole grid can be too tall to ever reach the threshold.
  assert.doesNotMatch(page, /className="games-grid"[^>]*data-reveal/);
  assert.match(page, /<div className="last-updated lg-meta-row">\s*\{lastUpdated &&/);
  assert.match(page, /className="trend-empty-radar" data-defer/);
  assert.match(read('src/components/GameBoxScore.jsx'), /<span data-numeric className=\{`team-score/);
});

test('Live Games chrome reserves single-line space and card motion stays scoped to the list', () => {
  const css = read('src/pages/LiveGames.css');
  for (const selector of ['.refresh-btn', '.lg-tab', '.lg-live-page .game-card']) {
    const rule = block(css, selector);
    assert.ok(rule.startsWith(selector), `Missing ${selector}`);
    assert.doesNotMatch(rule, /transition:\s*all/);
  }
  assert.match(block(css, '.lg-live-page .game-card'), /transition: transform/);
  assert.match(block(css, '.lg-meta-row'), /min-height:/);
  const rule = block(css, '.lg-meta-text');
  for (const pattern of [/min-height:/, /white-space: nowrap/, /text-overflow: ellipsis/]) assert.match(rule, pattern);
  // The page and range lines now come from the shared pager, which keeps them on one line too.
  const pagerLines = block(read('src/components/Pagination.css'), '.pager-page,\n.pager-range');
  for (const pattern of [/white-space: nowrap/, /text-overflow: ellipsis/]) assert.match(pagerLines, pattern);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)\s*\{\s*\.lg-tab:hover/);
  assert.match(css, /grid-template-columns: repeat\(auto-fill, minmax\(360px, 1fr\)\)/);
  assert.match(css, /\.game-card:hover\s*\{\s*transform: translateY\(-6px\)/);
  // The detail page adopts the system in its own .lg-detail-page scope, never the list page's.
  assert.doesNotMatch(read('src/pages/LiveGameDetail.jsx'), /lg-live-page/);
});

test('chrome constrains shrinking pagination and reserves badge space', () => {
  const css = read('src/pages/LiveGames.css');
  const pagerCss = read('src/components/Pagination.css');
  assert.match(block(pagerCss, '.pager-bar'), /max-width: 100%/);
  assert.match(block(pagerCss, '.pager-info'), /min-width: 0/);
  assert.match(block(css, '.live-badge'), /min-width: calc\(7ch \+ var\(--space\) \* 6\)/);
  assert.match(block(css, '.count-badge'), /min-width: calc\(3ch \+ var\(--space\) \* 4\)/);

});

test('localized sync times stay within the stat strip at narrow widths', () => {
  const rule = block(read('src/styles/tokens.css'), '[data-slot="stat-strip"] dd');
  assert.match(rule, /white-space: nowrap/);
  assert.match(rule, /overflow: hidden/);
  assert.match(rule, /text-overflow: ellipsis/);
});

test('pagination reserves enough monospace width for four-digit season totals', () => {
  const css = read('src/components/Pagination.css');
  const rule = block(css, '.pager-info');
  assert.match(rule, /font-family: var\(--font-mono, monospace\)/);
  // .pager-info sets no font-size, so its ch unit is measured at the inherited 16px default,
  // while the range line is drawn at 11px: each reserved ch holds 16/11 range characters.
  assert.doesNotMatch(rule, /font-size/);
  assert.match(css, /\n\.pager-range \{[^}]*font-size: 11px/);
  const reservedCharacters = Number(rule.match(/width: (\d+)ch/)?.[1]) * (16 / 11);
  for (const label of ['Showing 101 - 120 of 1215 games', 'Showing 1201 - 1215 of 1215 games', 'Showing 0 - 0 of 0 games']) {
    assert.ok(reservedCharacters >= label.length, `Reserved width fits ${label}`);
  }
  assert.match(rule, /max-width: 100%/);
  assert.match(rule, /min-width: 0/);
});

test('phone tabs stack readable labels and badges without clipping focus rings or indicator glow', () => {
  const css = read('src/pages/LiveGames.css');
  const mobile = css.slice(css.lastIndexOf('@media (max-width: 600px)'));
  assert.match(block(mobile, '.lg-tabs'), /width: 100%/);
  assert.doesNotMatch(block(mobile, '.lg-tabs'), /overflow[^:]*:\s*(auto|hidden|scroll)|scrollbar-width/);
  assert.match(block(mobile, '.lg-tab'), /flex: 1 1 0/);
  assert.match(block(mobile, '.lg-tab'), /min-width: 0/);
  assert.match(block(mobile, '.lg-tab'), /flex-direction: column/);
  assert.match(block(mobile, '.lg-tab'), /height: 76px/);
  const label = block(mobile, '.lg-tab-label');
  for (const pattern of [/white-space: normal/, /overflow: visible/, /text-overflow: clip/, /line-height: 14px/, /min-height: 28px/]) assert.match(label, pattern);
  assert.match(block(css, '.lg-tab-label'), /min-width: 0/);
  for (const selector of ['.live-badge', '.count-badge']) assert.match(block(css, selector), /flex-shrink: 0/);
  const page = read('src/pages/LiveGames.jsx');
  assert.match(page, /<span className="lg-tab-label">TODAY'S SLATE<\/span>/);
  assert.match(page, /<span className="lg-tab-label">UPCOMING GAMES<\/span>/);
});

test('sync stat keeps full-size time on a full row until four columns have room', () => {
  const css = read('src/pages/LiveGames.css');
  const narrow = css.slice(css.indexOf('@media (max-width: 800px)'));
  assert.match(block(narrow, '.lg-live-page .lg-stat-strip'), /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(block(narrow, '.lg-live-page .lg-stat-strip > div:last-child'), /grid-column: 1 \/ -1/);
  assert.match(block(read('src/styles/tokens.css'), '[data-slot="stat-strip"] dd'), /font-size: var\(--text-xl\)/);
});
