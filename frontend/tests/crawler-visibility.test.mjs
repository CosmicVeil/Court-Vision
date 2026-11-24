import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { getPageMeta } from '../src/config/seo.js';
import {
  checkCrawlable, extractRootHtml, formatReport, ROUTES, routeFile, visibleText,
} from '../scripts/check-crawlable.mjs';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

const escapeAttr = text => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const escapeText = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const PROSE = 'CourtVision projects every NBA player\'s next game with a machine-learning model trained on '
  + 'recent form, matchups and rest. The table below lists the projected points, rebounds and assists for '
  + 'tonight\'s slate, refreshed every morning before tip-off.';

const tableHtml = rows => `<table><thead><tr><th>Player</th><th>PTS</th></tr></thead><tbody>${
  Array.from({ length: rows }, (_, i) => `<tr><td>Player ${String.fromCharCode(65 + i)}</td><td>${20 + i}.5</td></tr>`).join('')
}</tbody></table>`;

// A prerendered page for `route`; options break one thing at a time.
function page(route, { title, canonical = true, time = true, rows = 6, root } = {}) {
  const meta = getPageMeta(route);
  const body = root ?? `<main><h1>${escapeText(meta.title)}</h1><p>${escapeText(PROSE)}</p>`
    + `${time ? '<p>Updated <time datetime="2026-11-24T15:00:00Z">Nov 24</time></p>' : ''}${tableHtml(rows)}</main>`;
  return `<!doctype html><html lang="en"><head>
    <title>${escapeText(title ?? meta.title)}</title>
    <meta name="description" content="${escapeAttr(meta.description)}">
    ${canonical ? `<link rel="canonical" href="${meta.canonical}">` : ''}
    <script type="module" src="/assets/index.js"></script>
  </head><body><div id="root">${body}</div></body></html>`;
}

function makeDist(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'crawlable-'));
  for (const [route, html] of Object.entries(files)) {
    const file = routeFile(dir, route);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, html);
  }
  return dir;
}

function checkOne(route, html) {
  const dir = makeDist({ [route]: html });
  try {
    return checkCrawlable(dir, [route])[0];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('routes map to directory index files', () => {
  assert.equal(routeFile('/d', '/'), path.join('/d', 'index.html'));
  assert.equal(routeFile('/d', '/predictions/games'), path.join('/d', 'predictions', 'games', 'index.html'));
  assert.deepEqual(ROUTES, ['/', '/predictions', '/predictions/games', '/games', '/recommendations/games']);
});

test('root extraction balances nested divs and visible text drops scripts and tags', () => {
  const html = '<div id="root"><div><p>A &amp; B</p></div><script>var x = 1;</script><div>C</div></div><div>after</div>';
  assert.equal(extractRootHtml(html), '<div><p>A &amp; B</p></div><script>var x = 1;</script><div>C</div>');
  assert.equal(visibleText(extractRootHtml(html)), 'A & B C');
  assert.equal(extractRootHtml('<div id="app"></div>'), null);
});

test('the empty SPA shell fails with an "empty root" problem', () => {
  const result = checkOne('/predictions', page('/predictions', { root: '' }));
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(p => p.startsWith('empty root')), result.problems.join('\n'));
  assert.equal(result.textLength, 0);
});

test('a prerendered page with meta, a date and a projection table passes', () => {
  for (const route of ROUTES) {
    const result = checkOne(route, page(route));
    assert.deepEqual(result.problems, [], route);
    assert.equal(result.ok, true, route);
    assert.equal(result.title, getPageMeta(route).title);
  }
});

test('each missing piece is reported', () => {
  const cases = [
    [{ title: 'CourtVision' }, /^title is "CourtVision", expected/],
    [{ canonical: false }, /^missing <link rel="canonical">/],
    [{ time: false }, /no <time datetime/],
    [{ rows: 3 }, /has 3 <tbody> rows, need at least 5/],
    [{ root: `<p>${'x'.repeat(50)}</p>` }, /only 50 characters/],
  ];
  for (const [options, expected] of cases) {
    const result = checkOne('/predictions/games', page('/predictions/games', options));
    assert.equal(result.ok, false, JSON.stringify(options));
    assert.ok(result.problems.some(p => expected.test(p)), `${JSON.stringify(options)}: ${result.problems.join('; ')}`);
  }
});

test('an invalid datetime, number-free rows and duplicate titles fail', () => {
  const badTime = page('/recommendations/games').replace('2026-11-24T15:00:00Z', 'tonight');
  assert.ok(checkOne('/recommendations/games', badTime).problems.some(p => /not a valid date/.test(p)));

  const noNumbers = page('/predictions').replace(/<td>\d+\.5<\/td>/, '<td>n/a</td>');
  assert.ok(checkOne('/predictions', noNumbers).problems.some(p => /row 1 has no cell with a number/.test(p)));

  const twoTitles = page('/games').replace('</head>', '<title>Other</title></head>');
  assert.ok(checkOne('/games', twoTitles).problems.some(p => /exactly one <title>/.test(p)));
});

test('non-projection pages need no table or date', () => {
  const result = checkOne('/games', page('/games', { time: false, rows: 0 }));
  assert.deepEqual(result.problems, []);
});

test('a missing file is a failure, and the report names it', () => {
  const dir = makeDist({});
  try {
    const results = checkCrawlable(dir, ['/games']);
    assert.equal(results[0].ok, false);
    assert.match(results[0].problems[0], /^file not found/);
    assert.match(formatReport(results), /FAIL \/games[\s\S]*1 of 1 routes failed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the real build is crawlable on every key route', t => {
  if (!existsSync(path.join(DIST, 'index.html'))) {
    t.skip('run npm run build first');
    return;
  }
  const results = checkCrawlable(DIST);
  assert.ok(results.every(r => r.ok), `\n${formatReport(results)}`);
});
