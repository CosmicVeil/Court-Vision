import assert from 'node:assert/strict';
import test from 'node:test';
import {
  escapeHtml, PUBLIC_PREVIEW_LIMIT, publicGamePredictions, publicSeasonPredictions, renderRouteHtml, ROUTES,
  upcomingSlate,
} from '../scripts/prerender.mjs';
import { DEFAULT_META, getPageMeta } from '../src/config/seo.js';

// Synthetic data only: no real cache files, no network.
const TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="script-src 'self' 'sha256-abc='" />
    <script>/* theme */</script>
    <title>${DEFAULT_META.title}</title>
    <meta name="description" content="${DEFAULT_META.description}">
    <meta property="og:title" content="${DEFAULT_META.title}">
    <meta property="og:description" content="${DEFAULT_META.description}">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

const FUTURE = '2999-01-01';
const gameRow = (i, extra = {}) => ({
  id: 1000 + i, espn_id: 5000 + i, name: `Player ${i}`, team: 'BOS', opponent: 'NYK', is_home: i % 2 === 0,
  game_id: 'g1', game_date: FUTURE, tipoff: `${FUTURE}T00:00Z`, injury: null,
  predicted_pts: 10 + i, predicted_reb: 5, predicted_ast: 3, predicted_minutes: 30, ...extra,
});
const gameCache = (players) => ({
  generated_at: '2026-11-23T19:54:16+00:00', slate_date: FUTURE, slate_dates: [FUTURE],
  accuracy: { pts: { mae: 4.56, naive_mae: 4.76 } },
  games: [{ game_id: 'g1', home: 'BOS', away: 'NYK', tipoff: `${FUTURE}T00:00Z`, game_date: FUTURE, odds_text: 'BOS -3' }],
  players,
});
const seasonCache = (n) => ({
  all_players_list: Array.from({ length: n }, (_, i) => ({
    id: i, name: `Season ${i}`, team: 'LAL', position: 'PG', predicted_ppg: i, predicted_rpg: 1, predicted_apg: 1,
    predicted_mpg: 30, predicted_fantasy: 20, ppg_last: i,
  })),
});
const DATA = {
  game: gameCache(Array.from({ length: 30 }, (_, i) => gameRow(i))),
  season: seasonCache(30),
  predictionsUpdatedAt: '2026-11-10T20:50:18-05:00',
};

const rootOf = html => html.match(/<div id="root">([\s\S]*)<\/div>\s*<\/body>/)[1];
const tbodyRows = html => (html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1].match(/<tr>/g) || []).length;

test('escapeHtml escapes markup and quotes', () => {
  assert.equal(escapeHtml(`<script>"x" & 'y'</script>`), '&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;');
});

test('data from the caches is escaped, never injected as markup', () => {
  const evil = gameRow(99, { name: '<script>alert(1)</script>', team: '"><img src=x>' });
  const html = renderRouteHtml(TEMPLATE, '/predictions/games', { game: gameCache([evil, ...DATA.game.players]) });
  assert.doesNotMatch(rootOf(html), /<script>alert/);
  assert.doesNotMatch(rootOf(html), /<img/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('each route gets exactly one title and description, its own canonical and og:url', () => {
  for (const route of Object.keys(ROUTES)) {
    const html = renderRouteHtml(TEMPLATE, route, DATA);
    const meta = getPageMeta(route);
    assert.equal(html.match(/<title>/g).length, 1, route);
    assert.equal(html.match(/<meta name="description"/g).length, 1, route);
    assert.equal(html.match(/<link rel="canonical"/g).length, 1, route);
    assert.equal(html.match(/<meta property="og:title"/g).length, 1, route);
    assert.ok(html.includes(`<title>${escapeHtml(meta.title)}</title>`), route);
    assert.ok(html.includes(`<link rel="canonical" href="${meta.canonical}" />`), route);
    assert.ok(html.includes(`<meta property="og:url" content="${meta.canonical}" />`), route);
    assert.ok(html.includes(`content="script-src 'self' 'sha256-abc='"`), 'CSP meta untouched');
    // The only executable inline script is the template's own (hashed by the CSP).
    assert.equal(html.match(/<script>/g).length, 1, route);
  }
});

test('signed-out cap: 30 projection rows in, PUBLIC_PREVIEW_LIMIT out, highest first', () => {
  assert.equal(PUBLIC_PREVIEW_LIMIT, 12);
  const html = renderRouteHtml(TEMPLATE, '/predictions/games', DATA);
  assert.equal(tbodyRows(html), PUBLIC_PREVIEW_LIMIT);
  assert.match(html, /<th scope="row">Player 29<\/th>/);
  assert.doesNotMatch(html, /Player 17</, 'row 13 is gated');

  const season = renderRouteHtml(TEMPLATE, '/predictions', DATA);
  assert.equal(tbodyRows(season), PUBLIC_PREVIEW_LIMIT);
  assert.deepEqual(publicSeasonPredictions(DATA.season).map(r => r.name).slice(0, 2), ['Season 29', 'Season 28']);

  assert.equal(tbodyRows(renderRouteHtml(TEMPLATE, '/recommendations/games', DATA)), PUBLIC_PREVIEW_LIMIT);
});

test('players ruled out are dropped, and each player appears once at his nearest game', () => {
  const rows = [
    gameRow(1, { injury: { status: 'Out' } }),
    gameRow(2, { game_date: '2999-01-02', tipoff: '2999-01-02T00:00Z', predicted_pts: 40 }),
    gameRow(2, { predicted_pts: 20 }),
  ];
  const picked = publicGamePredictions(upcomingSlate(gameCache(rows), '2026-01-01'));
  assert.deepEqual(picked.map(r => [r.name, r.predicted_pts]), [['Player 2', 20]]);
});

test('past days are dropped from the slate', () => {
  const slate = upcomingSlate(gameCache([gameRow(1, { game_date: '2026-01-01' }), gameRow(2)]), '2026-06-01');
  assert.deepEqual(slate.players.map(r => r.name), ['Player 2']);
});

test('a slate whose days have all passed is labelled as played, not upcoming', () => {
  const PAST = '2000-01-01';
  const cache = {
    ...gameCache(Array.from({ length: 6 }, (_, i) => gameRow(i, { game_date: PAST, tipoff: `${PAST}T00:00Z` }))),
    slate_date: PAST, slate_dates: [PAST],
    games: [{ game_id: 'g1', home: 'BOS', away: 'NYK', tipoff: `${PAST}T00:00Z`, game_date: PAST }],
  };
  for (const route of ['/', '/predictions/games', '/recommendations/games', '/games']) {
    assert.match(renderRouteHtml(TEMPLATE, route, { game: cache }), /which has already been played/, route);
  }
  assert.match(renderRouteHtml(TEMPLATE, '/games', { game: cache }), /<caption>Most recent NBA games<\/caption>/);
  // A current slate carries no notice.
  for (const route of ['/', '/predictions/games', '/recommendations/games', '/games']) {
    assert.doesNotMatch(renderRouteHtml(TEMPLATE, route, DATA), /already been played/, route);
  }
});

test('pages carry a machine-readable <time datetime> and links to the other key routes', () => {
  for (const route of ['/predictions', '/predictions/games', '/recommendations/games']) {
    const html = renderRouteHtml(TEMPLATE, route, DATA);
    const datetime = html.match(/<time datetime="([^"]+)"/)?.[1];
    assert.ok(datetime && !Number.isNaN(Date.parse(datetime)), route);
    for (const other of Object.keys(ROUTES).filter(r => r !== route)) {
      assert.ok(html.includes(`<a href="${other}">`), `${route} links to ${other}`);
    }
  }
});

test('a missing cache still writes per-route head tags and a generic summary', () => {
  for (const route of Object.keys(ROUTES)) {
    const html = renderRouteHtml(TEMPLATE, route, { season: null, game: null });
    assert.ok(html.includes(`<title>${escapeHtml(getPageMeta(route).title)}</title>`), route);
    const text = rootOf(html).replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.ok(text.length >= 200, `${route}: ${text.length} chars`);
    assert.doesNotMatch(html, /<tbody>/, route);
  }
});

test('a template without an empty #root fails loudly', () => {
  assert.throws(() => renderRouteHtml('<html><head></head><body></body></html>', '/', DATA), /empty <div id="root">/);
});
