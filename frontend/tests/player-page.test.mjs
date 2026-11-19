import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test, { beforeEach } from 'node:test';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as Router from 'react-router-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PLAYER_TABS, playerPath, readPlayerTab, withPlayerTab } from '../src/utils/playerPage.js';
import { readFrontend } from './helpers.mjs';
import { loadFrontendModule } from './render-helpers.mjs';

const { fetchPlayerPage } = loadFrontendModule('src/utils/playerDetails.js');
const { default: PlayerPage, PlayerPageContent } = loadFrontendModule('src/pages/PlayerPage.jsx');

beforeEach(t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network request'); });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
});

const fullPlayer = Object.freeze({
  id: 2544, name: 'Test Player', team: 'LAL', position: 'F', age: 25,
  current_stats: { ppg: 27.1, apg: 8.2, rpg: 7.4, spg: 1.3, bpg: 0.6, fg_pct: 51.2, fg3_pct: 38.1, ft_pct: 74.5, games_played: 40, minutes: 35.2 },
  ml_stats: null,
  injury: { status: 'Out', status_abbr: 'OUT', injury: 'Foot', detail: '', side: '', return_date: null, note: '' },
  history: { 2025: { games_played: 70, minutes: 34, ppg: 25, rpg: 7, apg: 8, spg: 1, bpg: 1, fg_pct: 50, fg3_pct: 37, ft_pct: 75 },
    2026: { games_played: 40, minutes: 35, ppg: 27, rpg: 7, apg: 8, spg: 1, bpg: 1, fg_pct: 51, fg3_pct: 38, ft_pct: 74, in_progress: true } },
});

// ---------- playerPath ----------
test('playerPath links by NBA id, preferring id over personId', () => {
  for (const [player, expected] of [
    [{ id: 2544, name: 'Test Player' }, '/players/2544'],
    [{ personId: 201939, name: 'Box Score Row' }, '/players/201939'],
    [{ id: 2544, personId: 201939 }, '/players/2544'],
    [{ id: null, personId: 201939 }, '/players/201939'],
    [{ id: 0 }, '/players/0'],
    [{ id: '1628983' }, '/players/1628983'],
  ]) {
    assert.equal(playerPath(player), expected, JSON.stringify(player));
  }
});

test('playerPath falls back to the encoded name and never uses the ESPN id', () => {
  assert.equal(playerPath({ espn_id: 123, name: 'Test Player' }), '/players/by-name/Test%20Player');
  assert.equal(playerPath({ espnId: 123, name: 'Test Player' }), '/players/by-name/Test%20Player');
  assert.equal(playerPath({ id: null, personId: null, name: 'X' }), '/players/by-name/X');
  assert.equal(playerPath({ id: '', name: 'X' }), '/players/by-name/X');
  assert.equal(playerPath({ name: 'Luka Dončić' }), '/players/by-name/Luka%20Don%C4%8Di%C4%87');
  assert.equal(playerPath({ name: 'A/B?#' }), '/players/by-name/A%2FB%3F%23');
});

// ---------- tabs in the URL ----------
test('the five tabs keep the popout labels and order', () => {
  assert.deepEqual(PLAYER_TABS.map(tab => [tab.id, tab.label]), [
    ['current', 'Current Stats'], ['games', 'Game Log'], ['predictions', 'AI Predictions'],
    ['next-game', 'Game projections'], ['history', 'Career History'],
  ]);
});

test('readPlayerTab accepts known tabs and defaults anything else to Current Stats', () => {
  for (const id of ['current', 'games', 'predictions', 'next-game', 'history']) {
    assert.equal(readPlayerTab(new URLSearchParams({ tab: id })), id);
  }
  for (const search of ['', 'tab=', 'tab=bogus', 'tab=GAMES', 'other=games']) {
    assert.equal(readPlayerTab(new URLSearchParams(search)), 'current', search);
  }
});

test('withPlayerTab sets the tab, drops it for Current Stats and keeps other params', () => {
  assert.equal(withPlayerTab(new URLSearchParams('x=1'), 'history').toString(), 'x=1&tab=history');
  assert.equal(withPlayerTab(new URLSearchParams('tab=games&x=1'), 'current').toString(), 'x=1');
  const original = new URLSearchParams('tab=games');
  withPlayerTab(original, 'history');
  assert.equal(original.toString(), 'tab=games', 'the current params are not mutated');
});

// ---------- loading ----------
const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('fetchPlayerPage loads the player by id', async t => {
  const signal = new AbortController().signal;
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => jsonResponse(200, fullPlayer));
  assert.equal(await fetchPlayerPage({ playerId: '2544', hint: null }, signal), fullPlayer);
  assert.deepEqual(fetchMock.mock.calls.map(call => call.arguments), [['/api/players/2544', { signal }]]);
});

test('a failed id lookup falls back to the name search with the row as hint', async t => {
  const match = { id: 2544, name: 'Test Player', team: 'LAL' };
  const fetchMock = t.mock.method(globalThis, 'fetch', async url => (url.includes('search-all')
    ? jsonResponse(200, { players: [{ id: 1, name: 'Other Player' }, match] })
    : jsonResponse(404, { error: 'Player not found' })));
  const player = await fetchPlayerPage({ playerId: '2544', hint: { id: 2544, name: 'Test Player' } });
  assert.equal(player, match);
  assert.deepEqual(fetchMock.mock.calls.map(call => call.arguments[0]),
    ['/api/players/2544', '/api/players/search-all?query=Test%20Player']);
});

test('a network error on the id lookup also falls back to the name search', async t => {
  const match = { id: 2544, name: 'Test Player' };
  t.mock.method(globalThis, 'fetch', async url => {
    if (!url.includes('search-all')) throw new TypeError('Failed to fetch');
    return jsonResponse(200, { players: [match] });
  });
  assert.equal(await fetchPlayerPage({ playerId: '2544', hint: { name: 'Test Player' } }), match);
});

test('with no match the row itself becomes the profile', async t => {
  t.mock.method(globalThis, 'fetch', async url => (url.includes('search-all')
    ? jsonResponse(200, { players: [] }) : jsonResponse(404, {})));
  const player = await fetchPlayerPage({ playerId: '2544', hint: { id: 2544, name: 'Test Player', team: 'LAL', pts: 24 } });
  assert.equal(player.id, 2544);
  assert.equal(player.name, 'Test Player');
  assert.equal(player.team, 'LAL');
  assert.equal(player.current_stats.ppg, 24);
});

test('a failed name search keeps the row as the profile, and with no row finds nothing', async t => {
  t.mock.method(globalThis, 'fetch', async () => jsonResponse(500, {}));
  const player = await fetchPlayerPage({ playerId: '2544', hint: { id: 2544, name: 'Test Player', pts: 24 } });
  assert.equal(player.name, 'Test Player');
  assert.equal(player.current_stats.ppg, 24);
  assert.equal(await fetchPlayerPage({ name: 'Test Player', hint: null }), null);
});

// The rows each linking page actually hands over, with their stats under that page's own names.
const CALLER_ROWS = {
  Stats: { id: 2544, name: 'Test Player', team: 'LAL', stats: { ppg_last: 25.3, rpg_last: 7.1, apg_last: 8.2, spg_last: 1.2, bpg_last: 0.6, tov_last: 3.1, mpg_last: 34.5, fg_pct_last: 51.2, fg3_pct_last: 38.4, ft_pct_last: 75.5, games_played: 55 } },
  Favourites: { id: 2544, name: 'Test Player', team: 'LAL', stats: { ppg_last: 25.3, rpg_last: 7.1, apg_last: 8.2, spg_last: 1.2, bpg_last: 0.6, tov_last: 3.1, minutes: 34.5, fg_pct_last: 51.2, fg3_pct_last: 38.4, ft_pct_last: 75.5, games_played: 55 } },
  Predictions: { name: 'Test Player', team: 'LAL', ppg_last: 25.3, rpg_last: 7.1, apg_last: 8.2, spg_last: 1.2, bpg_last: 0.6, tov_last: 3.1, minutes: 34.5, fg_pct_last: 51.2, fg3_pct_last: 38.4, ft_pct_last: 75.5, games_played_last: 55 },
  Uppercase: { name: 'Test Player', team: 'LAL', PPG_LAST: 25.3, RPG_LAST: 7.1, APG_LAST: 8.2, SPG_LAST: 1.2, BPG_LAST: 0.6, TOV_LAST: 3.1, MPG_LAST: 34.5, FG_PCT_LAST: 51.2, FG3_PCT_LAST: 38.4, FT_PCT_LAST: 75.5, GAMES_PLAYED: 55 },
  HomeSearch: { id: 2544, name: 'Test Player', team: 'LAL', current_stats: { ppg: 25.3, rpg: 7.1, apg: 8.2, spg: 1.2, bpg: 0.6, tov: 3.1, mpg: 34.5, fg_pct: 51.2, fg3_pct: 38.4, ft_pct: 75.5, games_played: 55 } },
  Season: { name: 'Test Player', team: 'LAL', ppg: 25.3, rpg: 7.1, apg: 8.2, spg: 1.2, bpg: 0.6, tov: 3.1, mpg: 34.5, fg_pct: 51.2, fg3_pct: 38.4, ft_pct: 75.5, games_played: 55 },
};
const CALLER_STATS = { ppg: 25.3, rpg: 7.1, apg: 8.2, spg: 1.2, bpg: 0.6, tov: 3.1, mpg: 34.5, fg_pct: 51.2, fg3_pct: 38.4, ft_pct: 75.5, games_played: 55 };
const pickStats = stats => Object.fromEntries(Object.keys(CALLER_STATS).map(key => [key, stats[key]]));

test('when both lookups fail, every caller row keeps its own stats in the profile', async t => {
  for (const [source, row] of Object.entries(CALLER_ROWS)) {
    t.mock.method(globalThis, 'fetch', async () => jsonResponse(500, {}));
    const failed = await fetchPlayerPage({ playerId: '2544', hint: row });
    assert.deepEqual(pickStats(failed.current_stats), CALLER_STATS, `${source}: search failed`);
    t.mock.method(globalThis, 'fetch', async url => (url.includes('search-all')
      ? jsonResponse(200, { players: [] }) : jsonResponse(404, {})));
    const unmatched = await fetchPlayerPage({ playerId: '2544', hint: row });
    assert.deepEqual(pickStats(unmatched.current_stats), CALLER_STATS, `${source}: nobody matched`);
  }
});

test('per-game model rows keep their last-10 averages when both lookups fail', async t => {
  t.mock.method(globalThis, 'fetch', async () => jsonResponse(500, {}));
  const row = { name: 'Test Player', team: 'LAL', last10_pts: 22.4, last10_reb: 6.1, last10_ast: 7.3,
    last10_stl: 1.1, last10_blk: 0.4, last10_tov: 2.9, last10_minutes: 33.8 };
  const player = await fetchPlayerPage({ name: 'Test Player', hint: row });
  assert.deepEqual(pickStats(player.current_stats),
    { ppg: 22.4, rpg: 6.1, apg: 7.3, spg: 1.1, bpg: 0.4, tov: 2.9, mpg: 33.8, fg_pct: 0, fg3_pct: 0, ft_pct: 0, games_played: 0 });
});

test('box-score names win over the other row formats, and missing stats stay 0', () => {
  const { normalizePlayerRow } = loadFrontendModule('src/utils/playerDetails.js');
  const row = normalizePlayerRow({ name: 'Test Player', pts: 30, ppg: 25, stats: { ppg_last: 20 } });
  assert.equal(row.pts, 30);
  assert.equal(row.name, 'Test Player');
  assert.equal(row.reb, undefined);
  assert.equal(normalizePlayerRow(null).pts, undefined);
});

test('an unknown id with no row or name finds nothing after one request', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => jsonResponse(404, {}));
  assert.equal(await fetchPlayerPage({ playerId: '2544', hint: null }), null);
  assert.equal(fetchMock.mock.calls.length, 1);
});

test('a non-numeric id skips the id request and searches by the row name', async t => {
  const match = { id: 2544, name: 'Test Player' };
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => jsonResponse(200, { players: [match] }));
  assert.equal(await fetchPlayerPage({ playerId: 'abc', hint: { name: 'Test Player' } }), match);
  assert.deepEqual(fetchMock.mock.calls.map(call => call.arguments[0]), ['/api/players/search-all?query=Test%20Player']);
});

test('the by-name route searches the name and finds nothing when nobody matches', async t => {
  const match = { id: 2544, name: 'Test Player' };
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => jsonResponse(200, { players: [match] }));
  assert.equal(await fetchPlayerPage({ name: 'Test Player', hint: null }), match);
  assert.deepEqual(fetchMock.mock.calls.map(call => call.arguments[0]), ['/api/players/search-all?query=Test%20Player']);
  fetchMock.mock.mockImplementation(async () => jsonResponse(200, { players: [{ id: 1, name: 'Other Player' }] }));
  assert.equal(await fetchPlayerPage({ name: 'Nobody Here', hint: null }), null);
});

test('aborting rethrows instead of falling back', async t => {
  const abort = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw abort(); });
  await assert.rejects(fetchPlayerPage({ playerId: '2544', hint: { name: 'Test Player' } }), { name: 'AbortError' });
  assert.equal(fetchMock.mock.calls.length, 1, 'no name search after an abort');
  await assert.rejects(fetchPlayerPage({ name: 'Test Player', hint: { name: 'Test Player' } }), { name: 'AbortError' });
});

// ---------- routes and metadata ----------
test('App routes both player URLs to PlayerPage ahead of the catch-all', () => {
  const app = readFrontend('src/App.jsx');
  assert.match(app, /import PlayerPage from "\.\/pages\/PlayerPage\.jsx";/);
  const byId = app.indexOf('<Route path="/players/:playerId" element={<PlayerPage />} />');
  const byName = app.indexOf('<Route path="/players/by-name/:name" element={<PlayerPage />} />');
  const notFound = app.indexOf('path="*"');
  assert.ok(byId > 0 && byName > 0, 'both routes exist');
  assert.ok(byId < notFound && byName < notFound, 'before the not-found route');
});

// ---------- rendering ----------
function renderAt(entry, Element = PlayerPage) {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [entry] },
    createElement(Routes, null,
      createElement(Route, { path: '/players/:playerId', element: createElement(Element) }),
      createElement(Route, { path: '/players/by-name/:name', element: createElement(Element) }))));
}

function renderContent(props) {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/players/2544'] },
    createElement(PlayerPageContent, { tab: 'current', onTabChange: () => {}, returnTo: '/players/2544', onBack: () => {}, ...props })));
}

test('a loaded player shows the large photo, identity, injury, tabs and Current Stats', () => {
  const html = renderContent({ status: 'ready', player: fullPlayer });
  assert.match(html, /<h1[^>]*class="pp-name"[^>]*>Test Player<\/h1>/);
  assert.match(html, /class="pp-team-badge">LAL<\/span>/);
  assert.match(html, /class="player-headshot pp-photo"/);
  assert.match(html, /src="https:\/\/cdn\.nba\.com\/headshots\/nba\/latest\/1040x760\/2544\.png"/);
  assert.match(html, /<strong>Position:<\/strong> F/);
  assert.match(html, /<strong>Age:<\/strong> 25/);
  assert.match(html, />OUT<\/span>/);
  assert.match(html, /<div class="injury-summary"><strong>Out<\/strong><span>· Foot<\/span><\/div>/);
  assert.deepEqual([...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map(match => match[1]),
    ['Current Stats', 'Game Log', 'AI Predictions', 'Game projections', 'Career History']);
  assert.match(html, /id="pp-tab-current"[^>]*aria-selected="true"/);
  assert.match(html, /class="stats-grid-container"/);
  assert.match(html, /class="stat-box-value highlighted">27\.1<\/div>/);
  assert.match(html, /40 Games \| 35\.2 MPG/);
  assert.match(html, /<a[^>]*class="pp-back"[^>]*href="\/stats"|<a[^>]*href="\/stats"[^>]*class="pp-back"/);
  assert.doesNotMatch(html, /Loading full profile|stats-modal-backdrop|Close player details/);
});

test('router state renders an instant placeholder before any request', () => {
  const html = renderAt({ pathname: '/players/2544', state: { player: { id: 2544, name: 'Test Player', team: 'LAL', pts: 24 } } });
  assert.match(html, /<h1[^>]*>Test Player<\/h1>/);
  assert.match(html, /class="stat-box-value highlighted">24<\/div>/);
  assert.match(html, /1040x760\/2544\.png/);
  assert.match(html, /role="status"[^>]*>Loading full profile…/);
  assert.equal(globalThis.fetch.mock.calls.length, 0);
});

test('the placeholder shows a Stats row\'s stats, which live under stats.*_last', () => {
  const html = renderAt({ pathname: '/players/2544', state: { player: CALLER_ROWS.Stats } });
  assert.match(html, /class="stat-box-value highlighted">25\.3<\/div>/);
  assert.match(html, />51\.2%</);
  assert.match(html, />55(<!-- -->)? Games \|/);
});

test('the Game Log waits for the full profile, so its season list starts from real history', () => {
  const state = { player: { id: 2544, name: 'Test Player' } };
  const placeholder = renderAt({ pathname: '/players/2544', search: '?tab=games', state });
  assert.match(placeholder, /id="pp-tab-games"[^>]*aria-selected="true"/);
  assert.doesNotMatch(placeholder, /class="game-log/);
  assert.match(placeholder, /Loading game log…/);
  const loaded = renderContent({ status: 'ready', player: fullPlayer, tab: 'games' });
  assert.match(loaded, /class="game-log/);
  assert.doesNotMatch(loaded, /Loading game log…/);
});

test('without router state the page shows a spinner and no premature photo', () => {
  const html = renderAt({ pathname: '/players/2544' });
  assert.match(html, /Loading player…/);
  assert.match(html, /class="search-spinner"/);
  assert.doesNotMatch(html, /player-headshot|<img\b|<h1/);
});

test('the not-found state explains and links to the stats list', () => {
  const html = renderContent({ status: 'missing', player: null });
  assert.match(html, /<h1[^>]*>Player not found<\/h1>/);
  assert.match(html, /href="\/stats"[^>]*>Browse player stats</);
  assert.doesNotMatch(html, /player-headshot|role="tab"/);
});

test('the tab in the query opens that tab, and an unknown one opens Current Stats', () => {
  const state = { player: { id: 2544, name: 'Test Player' } };
  const history = renderAt({ pathname: '/players/2544', search: '?tab=history', state });
  assert.match(history, /id="pp-tab-history"[^>]*aria-selected="true"/);
  assert.match(history, /id="pp-tab-current"[^>]*aria-selected="false"/);
  assert.match(history, /class="stats-history-table"/);
  assert.doesNotMatch(history, /class="stats-grid-container"/);
  const bogus = renderAt({ pathname: '/players/2544', search: '?tab=bogus', state });
  assert.match(bogus, /id="pp-tab-current"[^>]*aria-selected="true"/);
  assert.match(bogus, /class="stats-grid-container"/);
});

test('Career History lists newest season first and tags the season in progress', () => {
  const html = renderContent({ status: 'ready', player: fullPlayer, tab: 'history' });
  const seasons = [...html.matchAll(/<td><strong>(\d+)<\/strong>/g)].map(match => match[1]);
  assert.deepEqual(seasons, ['2026', '2025']);
  assert.equal([...html.matchAll(/class="game-log-tag">In progress</g)].length, 1);
});

test('the by-name route renders the same page', () => {
  const html = renderAt({ pathname: '/players/by-name/Test%20Player', state: { player: { name: 'Test Player', team: 'BOS' } } });
  assert.match(html, /<h1[^>]*>Test Player<\/h1>/);
  assert.match(html, /class="pp-team-badge">BOS<\/span>/);
});

// ---------- page behaviour (effects, back, tabs) with inert hooks ----------
// The page body runs with captured hooks: no DOM; fetch stays mocked by each test.
function pageBody({ params = { playerId: '2544' }, pathname = '/players/2544', search = '', state = null } = {}) {
  const effects = [];
  const resultWrites = [];
  const navigateCalls = [];
  const searchParamCalls = [];
  let stateIndex = 0;
  const { PlayerPageBody } = loadFrontendModule('src/pages/PlayerPage.jsx', ['PlayerPageBody'], {
    react: { ...React,
      useState: initial => {
        const value = typeof initial === 'function' ? initial() : initial;
        const writes = stateIndex++ === 1 ? resultWrites : [];
        return [value, next => writes.push(next)];
      },
      useEffect: effect => { effects.push(effect); },
    },
    'react-router-dom': { ...Router,
      useParams: () => params,
      useLocation: () => ({ pathname, search, state, key: 'abc' }),
      useNavigate: () => (...args) => navigateCalls.push(args),
      useSearchParams: () => [new URLSearchParams(search), (...args) => searchParamCalls.push(args)],
    },
  });
  const element = PlayerPageBody();
  return { element, effects, resultWrites, navigateCalls, searchParamCalls };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test('the page loads by id and shows the result', async t => {
  t.mock.method(globalThis, 'fetch', async () => jsonResponse(200, fullPlayer));
  const { element, effects, resultWrites } = pageBody();
  assert.equal(element.props.status, 'loading');
  assert.equal(element.props.player, null);
  effects.forEach(effect => effect());
  await flush();
  assert.deepEqual(resultWrites, [{ status: 'ready', player: fullPlayer }]);
});

test('the page reports not found when nothing can be loaded', async t => {
  t.mock.method(globalThis, 'fetch', async () => jsonResponse(404, {}));
  const { effects, resultWrites } = pageBody();
  effects.forEach(effect => effect());
  await flush();
  assert.deepEqual(resultWrites, [{ status: 'missing', player: null }]);
});

test('leaving the page aborts the request and ignores its late answer', async t => {
  let release;
  const fetchMock = t.mock.method(globalThis, 'fetch', (url, { signal }) => new Promise((resolve, reject) => {
    release = () => (signal.aborted ? reject(Object.assign(new Error('aborted'), { name: 'AbortError' })) : resolve(jsonResponse(200, fullPlayer)));
  }));
  const { effects, resultWrites } = pageBody();
  const cleanups = effects.map(effect => effect());
  cleanups.forEach(cleanup => cleanup?.());
  assert.equal(fetchMock.mock.calls[0].arguments[1].signal.aborted, true);
  release();
  await flush();
  assert.deepEqual(resultWrites, []);
});

test('router state seeds the placeholder and the name for the fallback search', async t => {
  const row = { id: 2544, name: 'Test Player', team: 'LAL', pts: 24 };
  const fetchMock = t.mock.method(globalThis, 'fetch', async url => (url.includes('search-all')
    ? jsonResponse(200, { players: [] }) : jsonResponse(404, {})));
  const { element, effects, resultWrites } = pageBody({ state: { player: row } });
  assert.equal(element.props.status, 'loading');
  assert.equal(element.props.player.name, 'Test Player');
  assert.equal(element.props.player.current_stats.ppg, 24);
  effects.forEach(effect => effect());
  await flush();
  assert.equal(fetchMock.mock.calls.length, 2);
  assert.equal(resultWrites.at(-1).status, 'ready');
  assert.equal(resultWrites.at(-1).player.current_stats.ppg, 24);
});

test('the by-name route searches by the decoded route name', async t => {
  const match = { id: 2544, name: 'Test Player' };
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => jsonResponse(200, { players: [match] }));
  const { effects, resultWrites } = pageBody({ params: { name: 'Test Player' }, pathname: '/players/by-name/Test%20Player' });
  effects.forEach(effect => effect());
  await flush();
  assert.deepEqual(fetchMock.mock.calls.map(call => call.arguments[0]), ['/api/players/search-all?query=Test%20Player']);
  assert.deepEqual(resultWrites, [{ status: 'ready', player: match }]);
});

test('choosing a tab replaces the URL query and keeps the router state', () => {
  const state = { player: { id: 2544, name: 'Test Player' } };
  const { element, searchParamCalls } = pageBody({ search: '?tab=games', state });
  assert.equal(element.props.tab, 'games');
  element.props.onTabChange('history');
  element.props.onTabChange('current');
  assert.equal(searchParamCalls.length, 2);
  assert.equal(searchParamCalls[0][0].toString(), 'tab=history');
  assert.equal(searchParamCalls[1][0].toString(), '');
  for (const call of searchParamCalls) assert.deepEqual(call[1], { replace: true, state });
});

test('the login links return to this player page and tab', () => {
  const { element } = pageBody({ search: '?tab=predictions' });
  assert.equal(element.props.returnTo, '/players/2544?tab=predictions');
});

test('Back goes to the previous in-app page, or follows its /stats link when there is none', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete globalThis.window;
  });
  const click = () => {
    let prevented = false;
    return { event: { preventDefault: () => { prevented = true; } }, prevented: () => prevented };
  };
  for (const [historyState, goesBack] of [[{ idx: 3 }, true], [{ idx: 0 }, false], [null, false]]) {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { history: { state: historyState } } });
    const { element, navigateCalls } = pageBody();
    const { event, prevented } = click();
    element.props.onBack(event);
    assert.equal(prevented(), goesBack, JSON.stringify(historyState));
    assert.deepEqual(navigateCalls, goesBack ? [[-1]] : [], JSON.stringify(historyState));
  }
});

// ---------- tab contrast ----------
// Theme colours from theme.css: the light block only overrides some of the dark (default) block.
function themeColors() {
  const css = readFrontend('src/styles/theme.css');
  const block = selector => {
    const body = css.slice(css.indexOf(`${selector} {`)).match(/\{([^}]*)\}/)[1];
    return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
  };
  const dark = block(':root, :root[data-theme="dark"]');
  const resolve = (vars, value) => (value.startsWith('var(') ? resolve(vars, vars[value.slice(4, -1)]) : value);
  return { dark: name => resolve(dark, dark[name]), light: name => { const vars = { ...dark, ...block(':root[data-theme="light"]') }; return resolve(vars, vars[name]); } };
}

function contrast(a, b) {
  const luminance = hex => {
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('tab labels stay readable (4.5:1) on and off the accent pill in both themes', () => {
  const css = readFrontend('src/pages/PlayerPage.css');
  const varOf = pattern => css.match(pattern)?.[1];
  const pill = varOf(/\.pp-page \[data-slot="pill-indicator"\] \{[^}]*background: var\((--[\w-]+)\)/);
  const onPill = varOf(/\.pp-tabs\[data-indicator-ready\] \.pp-tab\[data-indicator-target\] \{ color: var\((--[\w-]+)\); \}/);
  const active = varOf(/\.pp-tab\.active \{ color: var\((--[\w-]+)\);/);
  const idle = varOf(/\.pp-tab \{[^}]*\n  color: var\((--[\w-]+)\);/);
  const track = varOf(/\.pp-tabs \{[^}]*background: var\((--[\w-]+)\)/);
  assert.ok(pill && onPill && active && idle && track, 'tab colours are theme variables');
  for (const [theme, color] of Object.entries(themeColors())) {
    for (const [label, fg, bg] of [['on the pill', onPill, pill], ['active, pill elsewhere', active, track], ['idle', idle, track]]) {
      const ratio = contrast(color(fg), color(bg));
      assert.ok(ratio >= 4.5, `${theme} ${label}: ${color(fg)} on ${color(bg)} is ${ratio.toFixed(2)}:1`);
    }
  }
});

// ---------- locked predictions ----------
test('locked AI Predictions links carry the player page as the sign-in return path', () => {
  const links = [];
  const CapturingLink = ({ to, state, children }) => { links.push({ to, state }); return createElement('a', { href: to }, children); };
  const { default: PlayerProfile } = loadFrontendModule('src/components/PlayerProfile.jsx', [],
    { 'react-router-dom': { ...Router, Link: CapturingLink } });
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PlayerProfile, {
    player: { ...fullPlayer, predictions_locked: true }, tab: 'predictions', onTabChange: () => {}, returnTo: '/players/2544?tab=predictions',
  })));
  assert.match(html, /Sign in to see full predictions for Test Player\./);
  assert.deepEqual(links, [
    { to: '/login', state: { from: '/players/2544?tab=predictions' } },
    { to: '/create-account', state: { from: '/players/2544?tab=predictions' } },
  ]);
});

test('Game projections receives the same return path', () => {
  assert.match(readFrontend('src/components/PlayerProfile.jsx'), /<PlayerNextGame player=\{player\} returnTo=\{returnTo\} \/>/);
});

// ---------- call sites ----------
const CALL_SITES = ['Home', 'Stats', 'Predictions', 'Recommendations', 'RecommendationChart', 'Favourites',
  'GameRecommendations', 'GamePredictions', 'Team', 'LiveGameDetail'];

// A page reaches the player page either by navigate() or by a real <Link> (or a PlayerCard given `to`),
// in both cases handing over the row as router state.
test('every page that opened the popout now navigates to the player page', () => {
  for (const page of CALL_SITES) {
    const source = readFrontend(`src/pages/${page}.jsx`);
    assert.doesNotMatch(source, /PlayerStatsModal|selectedPlayer|loadingPlayer|playerLoading|closePlayer/, page);
    assert.match(source, /import \{ playerPath \} from (['"])\.\.\/utils\/playerPage\1;/, page);
    assert.match(source,
      /navigate\(playerPath\((\w+)\), \{ state: \{ player(?:: \1)? \} \}\)|to=\{playerPath\(([\w.]+)\)\}\s+(?:state|linkState)=\{\{ player(?:: [\w.]+(?:\([\w., ]+\))?)? \}\}/,
      page);
  }
  assert.equal(existsSync(new URL('../src/components/PlayerStatsModal.jsx', import.meta.url)), false);
});

test('home cards hand their NBA id, never the ESPN id, to the player link', () => {
  const preview = readFrontend('src/components/NextGamePreview.jsx');
  assert.match(preview, /onOpen=\{\(\) => onPlayerClick\(\{ id: player\.id, name: player\.name, team: player\.team, position: player\.position \}\)\}/);
  const home = readFrontend('src/pages/Home.jsx');
  assert.match(home, /onPlayerClick\(\{ id: player\.id, name: player\.name, team: player\.team, position: player\.position \}\)/);
  assert.equal(playerPath({ id: undefined, name: 'Test Player', espn_id: 99 }), '/players/by-name/Test%20Player');
});
