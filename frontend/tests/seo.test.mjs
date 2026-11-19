import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import React, { Children, isValidElement } from 'react';
import * as Router from 'react-router-dom';
import { readFrontend as read, readSource } from './helpers.mjs';
import { loadFrontendModule, renderComponent } from './render-helpers.mjs';
import { buildSitemap, DEFAULT_META, defaultHeadTags, getPageMeta, INDEXABLE_PATHS, SITE_URL } from '../src/config/seo.js';
import { getTeamColor, TEAMS } from '../src/utils/team.js';

// Home and the box score read the login state from localStorage while rendering.
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

test('public pages get their own title, description and canonical URL', () => {
  const stats = getPageMeta('/stats');
  assert.match(stats.title, /^NBA Player Stats.* \| CourtVision$/);
  assert.ok(stats.description.length > 50);
  assert.equal(stats.canonical, `${SITE_URL}/stats`);
  assert.equal(stats.noindex, false);
  assert.equal(getPageMeta('/').canonical, `${SITE_URL}/`);
  assert.doesNotMatch(getPageMeta('/').title, /\| CourtVision$/, 'home title already names the site');
});

test('a trailing slash maps to the same page', () => {
  assert.deepEqual(getPageMeta('/standings/'), getPageMeta('/standings'));
});

test('every page has a distinct title', () => {
  const titles = INDEXABLE_PATHS.map(path => getPageMeta(path).title);
  assert.equal(new Set(titles).size, titles.length);
});

test('team pages use the full team name and an upper-case canonical', () => {
  const lakers = getPageMeta('/teams/lal');
  assert.match(lakers.title, /^Los Angeles Lakers Roster/);
  assert.equal(lakers.canonical, `${SITE_URL}/teams/LAL`);
  assert.equal(lakers.noindex, false);
  assert.equal(getPageMeta('/teams/XYZ').noindex, true);
});

test('account pages, single games, login-only charts and unknown URLs are noindex with no canonical', () => {
  for (const path of ['/login', '/create-account', '/profile', '/favourites', '/games/0022400001',
    '/recommendations/PTS', '/no-such-page']) {
    const meta = getPageMeta(path);
    assert.equal(meta.noindex, true, path);
    assert.equal(meta.canonical, null, path);
  }
});

test('player pages share a player title and stay out of the index', () => {
  for (const path of ['/players/2544', '/players/2544/', '/players/by-name/LeBron%20James', '/players/by-name/%ZZ']) {
    const meta = getPageMeta(path);
    assert.equal(meta.title, 'NBA Player – Stats, Game Log & Predictions | CourtVision', path);
    assert.equal(meta.noindex, true, path);
    assert.equal(meta.canonical, null, path);
  }
  for (const path of ['/players', '/players/1/extra', '/players/by-name']) {
    assert.equal(getPageMeta(path).title, 'Page Not Found | CourtVision', path);
  }
});

test('a malformed team URL is a noindex page, not a crash', () => {
  assert.equal(getPageMeta('/teams/%ZZ').noindex, true);
  assert.equal(getPageMeta('/teams/%E0%A4%A').title, 'Team Not Found | CourtVision');
});

test('every team has a name and its own colour', () => {
  assert.equal(Object.keys(TEAMS).length, 30);
  for (const [tricode, team] of Object.entries(TEAMS)) {
    assert.ok(team.name, tricode);
    assert.equal(getTeamColor(tricode.toLowerCase()), team.color);
  }
});

test('the sitemap lists exactly the indexable pages, and robots.txt points to it', () => {
  const locs = [...buildSitemap().matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.deepEqual(locs, INDEXABLE_PATHS.map(path => `${SITE_URL}${path}`));
  assert.ok(locs.includes(`${SITE_URL}/teams/LAL`));
  const robots = read('public/robots.txt');
  assert.match(robots, new RegExp(`Sitemap: ${SITE_URL}/sitemap.xml`));
  assert.doesNotMatch(robots, /Disallow: \//, 'a Disallow would hide the noindex tag from crawlers');
});

test('default head tags come from DEFAULT_META and carry no canonical or og:url', () => {
  const tags = defaultHeadTags();
  assert.equal(tags.find(t => t.tag === 'title').children, DEFAULT_META.title.replace('&', '&amp;'));
  assert.equal(tags.find(t => t.attrs?.name === 'description').attrs.content, DEFAULT_META.description);
  const html = read('index.html');
  assert.doesNotMatch(html, /<title>|rel="canonical"|og:url/, 'a static canonical would point every URL at /');
  assert.match(read('vite.config.js'), /plugins: \[react\(\), seo\(\)[,\]]/);
});

test('PageMeta drops og:url along with the canonical on noindex pages', () => {
  assert.match(readSource('PageMeta.jsx'), /canonicalLink\.remove\(\);\s*document\.head\.querySelector\('meta\[property="og:url"\]'\)\?\.remove\(\);/);
});

test('every routed path in App.jsx has metadata other than the not-found fallback', () => {
  const routes = [...read('src/App.jsx').matchAll(/path="([^"*]+)"/g)].map(m => m[1].replace(/:\w+/, 'X'));
  for (const route of routes.filter(r => !r.includes('X'))) {
    assert.notEqual(getPageMeta(route).title, 'Page Not Found | CourtVision', route);
  }
});

test('the shell renders PageMeta', () => {
  assert.match(readSource('AppShell.jsx'), /<PageMeta \/>/);
});

// ---------- Social share image ----------
const metaContent = (tags, key) => tags.find(t => t.attrs?.property === key || t.attrs?.name === key)?.attrs.content;

test('default head tags give link previews a large absolute share image', () => {
  const tags = defaultHeadTags();
  assert.equal(metaContent(tags, 'og:image'), 'https://courtvision.works/og-image.png');
  assert.equal(metaContent(tags, 'og:image:width'), '1200');
  assert.equal(metaContent(tags, 'og:image:height'), '630');
  assert.match(metaContent(tags, 'og:image:alt'), /CourtVision/);
  assert.equal(metaContent(tags, 'twitter:card'), 'summary_large_image');
  assert.equal(metaContent(tags, 'twitter:image'), 'https://courtvision.works/og-image.png');
  assert.equal(tags.filter(t => t.attrs?.name === 'twitter:card').length, 1, 'one twitter:card, not summary as well');
});

// The PNG's IHDR chunk holds width and height as big-endian 32-bit ints at bytes 16 and 20.
test('the share image is a 1200x630 PNG in public/', () => {
  const url = new URL('../public/og-image.png', import.meta.url);
  assert.ok(existsSync(url), 'frontend/public/og-image.png is missing');
  const png = readFileSync(url);
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
});

// ---------- JSON-LD ----------
const siteJsonLd = () => defaultHeadTags().find(t => t.tag === 'script' && t.attrs?.type === 'application/ld+json');

test('index.html carries WebSite and Organization JSON-LD for crawlers that skip JavaScript', () => {
  const tag = siteJsonLd();
  assert.ok(tag, 'a static application/ld+json script');
  const data = JSON.parse(tag.children);
  assert.equal(data['@context'], 'https://schema.org');
  const byType = Object.fromEntries(data['@graph'].map(node => [node['@type'], node]));
  assert.equal(byType.WebSite.name, 'CourtVision');
  assert.equal(byType.WebSite.url, 'https://courtvision.works');
  assert.equal(byType.Organization.name, 'CourtVision');
  assert.equal(byType.Organization.url, 'https://courtvision.works');
  assert.equal(byType.Organization.image, 'https://courtvision.works/og-image.png');
});

test('the static JSON-LD cannot close its own script tag', () => {
  assert.doesNotMatch(siteJsonLd().children, /</, 'Vite inserts script children raw, so < must be escaped');
});

test('team pages describe the team as a SportsTeam in the NBA', () => {
  assert.deepEqual(getPageMeta('/teams/lal').jsonLd, {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    name: 'Los Angeles Lakers',
    url: 'https://courtvision.works/teams/LAL',
    sport: 'Basketball',
    memberOf: { '@type': 'SportsOrganization', name: 'National Basketball Association', alternateName: 'NBA' },
  });
  assert.equal(getPageMeta('/teams/BOS/').jsonLd.name, 'Boston Celtics');
});

test('pages that are not a real team carry no page JSON-LD', () => {
  for (const path of ['/', '/stats', '/standings', '/teams/XYZ', '/teams/%ZZ', '/players/2544', '/games/0022400001',
    '/login', '/no-such-page']) {
    assert.equal(getPageMeta(path).jsonLd, null, path);
  }
});

// A tiny <head>: enough of the DOM for PageMeta's querySelector/createElement/remove calls.
function fakeDocument() {
  const head = {
    children: [],
    querySelector(selector) {
      const [, tagName, attr, value] = selector.match(/^(\w+)\[([\w:-]+)="([^"]+)"\]$/);
      return this.children.find(el => el.tagName === tagName && el.attrs[attr] === value) ?? null;
    },
    appendChild(el) { this.children.push(el); return el; },
  };
  const createElement = tagName => ({
    tagName, attrs: {}, textContent: '',
    setAttribute(name, value) { this.attrs[name] = String(value); },
    remove() { head.children = head.children.filter(el => el !== this); },
  });
  return { head, createElement, title: '' };
}

// Runs PageMeta's effect for a path against the fake head; hooks are inert stand-ins.
function pageMetaRunner() {
  const location = { pathname: '/' };
  const { default: PageMeta } = loadFrontendModule('src/components/PageMeta.jsx', [], {
    react: { ...React, useEffect: effect => effect() },
    'react-router-dom': { ...Router, useLocation: () => location },
  });
  const doc = fakeDocument();
  const visit = pathname => {
    location.pathname = pathname;
    const previous = globalThis.document;
    globalThis.document = doc;
    try { PageMeta(); } finally { globalThis.document = previous; }
  };
  const jsonLdScripts = () => doc.head.children.filter(el => el.tagName === 'script' && el.attrs.type === 'application/ld+json');
  return { doc, visit, jsonLdScripts };
}

test('PageMeta writes the team JSON-LD into one managed script element', () => {
  const { visit, jsonLdScripts } = pageMetaRunner();
  visit('/teams/lal');
  assert.equal(jsonLdScripts().length, 1);
  const data = JSON.parse(jsonLdScripts()[0].textContent);
  assert.equal(data['@type'], 'SportsTeam');
  assert.equal(data.url, 'https://courtvision.works/teams/LAL');
  visit('/teams/bos');
  assert.equal(jsonLdScripts().length, 1, 'moving to another team reuses the element');
  assert.equal(JSON.parse(jsonLdScripts()[0].textContent).name, 'Boston Celtics');
});

test('PageMeta removes the team JSON-LD on other routes and leaves the site JSON-LD alone', () => {
  const { doc, visit, jsonLdScripts } = pageMetaRunner();
  const site = doc.createElement('script');
  site.setAttribute('type', 'application/ld+json');
  site.textContent = '{"@type":"WebSite"}';
  doc.head.appendChild(site);

  visit('/teams/lal');
  assert.equal(jsonLdScripts().length, 2);
  for (const path of ['/stats', '/players/2544', '/teams/XYZ']) {
    visit(path);
    assert.deepEqual(jsonLdScripts(), [site], path);
    assert.equal(site.textContent, '{"@type":"WebSite"}', path);
  }
});

// ---------- Homepage H1 ----------
test('the home page has exactly one h1, and it says what the site is', () => {
  const { default: Home } = loadFrontendModule('src/pages/Home.jsx');
  const h1s = [...renderComponent(Home, {}).matchAll(/<h1\b[^>]*>(.*?)<\/h1>/g)].map(match => match[1]);
  assert.equal(h1s.length, 1);
  assert.match(h1s[0], /NBA stats/);
  assert.match(h1s[0], /AI player predictions/);
});

test('the home h1 keeps the subtitle look instead of the browser h1 defaults', () => {
  const css = read('src/pages/Home.css');
  const rule = css.slice(css.indexOf('.hero-subtitle {'), css.indexOf('}', css.indexOf('.hero-subtitle {')));
  assert.match(rule, /font-size: 17px;/);
  assert.match(rule, /font-weight: 400;/, 'h1 is bold by default; the subtitle was regular weight');
});

// ---------- Crawlable player links ----------
// Walk a hook-free component's element tree and click like React bubbling: target first, then each
// ancestor, until a handler calls stopPropagation.
function findAll(node, match, ancestors = [], found = []) {
  if (!isValidElement(node)) return found;
  const path = [...ancestors, node];
  if (match(node)) found.push(path);
  Children.forEach(node.props.children, child => findAll(child, match, path, found));
  return found;
}
function click(path) {
  const event = { stopped: false, stopPropagation() { this.stopped = true; } };
  for (const element of [...path].reverse()) {
    element.props.onClick?.(event);
    if (event.stopped) break;
  }
  return event;
}
const byClass = (tree, className) => findAll(tree, node => node.props.className === className);

test('a PlayerCard given a destination opens through a real link to the player page', () => {
  const { default: PlayerCard } = loadFrontendModule('src/components/PlayerCard.jsx');
  const player = { id: 2544, name: 'Test Player', team: 'LAL' };
  const html = renderComponent(PlayerCard, { player, to: '/players/2544', linkState: { player } });
  assert.match(html, /<a class="pc-open" href="\/players\/2544"[^>]*>Test Player<\/a>/);
  assert.doesNotMatch(html, /<button[^>]*class="pc-open"/);
});

test('a PlayerCard without a destination keeps its open button (Favourites, home leaders)', () => {
  const { default: PlayerCard } = loadFrontendModule('src/components/PlayerCard.jsx');
  const html = renderComponent(PlayerCard, { player: { id: 2544, name: 'Test Player' }, onOpen: () => {} });
  assert.match(html, /<button type="button" class="pc-open">Test Player<\/button>/);
  assert.doesNotMatch(html, /href="\/players\//);
});

const predictionsPlayers = [
  { id: 1629029, name: 'Luka Dončić', team: 'LAL', position: 'PG', age: 26 },
  { id: 1641705, name: 'Victor Wembanyama', team: 'SAS', position: 'C', age: 21 },
];

test('the predictions table names are links to each player page', () => {
  const { PredictionsTable } = loadFrontendModule('src/pages/Predictions.jsx', ['PredictionsTable']);
  const html = renderComponent(PredictionsTable, {
    players: predictionsPlayers, sortBy: 'predicted_ppg', sortOrder: 'desc', loading: false,
    favoriteIds: new Set(), onSort: () => {}, onOpen: () => {}, onToggleFavorite: () => {},
  });
  assert.match(html, /<a class="table-row-open" href="\/players\/1629029"[^>]*>Luka Dončić<\/a>/);
  assert.match(html, /<a class="table-row-open" href="\/players\/1641705"[^>]*>Victor Wembanyama<\/a>/);
});

test('clicking a predictions name link does not also open the player from its row', () => {
  const { PredictionsTable } = loadFrontendModule('src/pages/Predictions.jsx', ['PredictionsTable']);
  const opened = [];
  const tree = PredictionsTable({
    players: predictionsPlayers, sortBy: 'predicted_ppg', sortOrder: 'desc', loading: false,
    favoriteIds: new Set(), onSort: () => {}, onOpen: player => opened.push(player.id), onToggleFavorite: () => {},
  });
  const [link] = byClass(tree, 'table-row-open');
  const linkElement = link.at(-1);
  assert.equal(linkElement.props.to, '/players/1629029');
  assert.equal(linkElement.props.state.player, predictionsPlayers[0]);
  assert.equal(click(link).stopped, true);
  assert.deepEqual(opened, [], 'the link navigates on its own; the row must not navigate again');
  click(byClass(tree, 'stats-row-clickable')[1]);
  assert.deepEqual(opened, [1641705], 'the rest of the row still opens the player');
});

const rosterRow = {
  id: 2544, name: 'Test Player', position: 'F', age: 25, games_played: 12,
  ppg: 22.26, rpg: 5.14, apg: 6.78, spg: 1.26, bpg: 0.84, fg_pct: 45.67, fg3_pct: 37.84, ft_pct: 81.26, fpts: 42.56,
};

test('team roster names link to the player page with the same placeholder the row hands over', () => {
  const { Roster } = loadFrontendModule('src/pages/Team.jsx', ['Roster']);
  const html = renderComponent(Roster, { roster: [rosterRow], tricode: 'lal', onSelect: () => {} });
  assert.match(html, /<a class="tp-player-name" href="\/players\/2544"[^>]*>Test Player<\/a>/);

  const selected = [];
  const tree = Roster({ roster: [rosterRow], tricode: 'lal', onSelect: player => selected.push(player.id) });
  const [link] = byClass(tree, 'tp-player-name');
  assert.deepEqual(link.at(-1).props.state.player,
    { ...rosterRow, team: 'LAL', pts: 22.26, reb: 5.14, ast: 6.78, stl: 1.26, blk: 0.84 });
  assert.equal(click(link).stopped, true);
  assert.deepEqual(selected, [], 'no second navigation from the row');
  click(byClass(tree, 'tp-player-row')[0]);
  assert.deepEqual(selected, [2544], 'the rest of the row still opens the player');
});

test('team leader cards are links to the player page', () => {
  const { Leaders } = loadFrontendModule('src/pages/Team.jsx', ['Leaders']);
  const html = renderComponent(Leaders, { roster: [rosterRow], tricode: 'lal' });
  assert.equal(html.match(/<a class="tp-leader" href="\/players\/2544"/g)?.length, 3, 'points, rebounds and assists');
  assert.doesNotMatch(html, /<button/);
});

test('box score names on the game page are links to the player page', () => {
  const { BoxScore } = loadFrontendModule('src/components/GameBoxScore.jsx');
  const side = (tricode, city, name) => ({ tricode, city, name, score: 100 });
  const game = {
    gameId: '0022400001', status: 2, home: side('LAL', 'Los Angeles', 'Lakers'), away: side('BOS', 'Boston', 'Celtics'),
    players: { home: [{ personId: 1629029, name: 'Luka Dončić', position: 'G', min: '34', pts: 30 }], away: [] },
  };
  const html = renderComponent(BoxScore, { game, onPlayerClick: () => {} });
  assert.match(html, /<a class="pname" href="\/players\/1629029"[^>]*>Luka Dončić<\/a>/);
});

// Pages whose lists live behind hooks and fetches: check the markup they render for each player.
test('hook-driven pages render each player name as a Link to the player page', () => {
  const stopRow = String.raw`onClick=\{event => event\.stopPropagation\(\)\}`;
  const expectations = {
    'Stats.jsx': [new RegExp(String.raw`<Link to=\{playerPath\(player\)\} state=\{\{ player \}\} className="player-name-link"\s+${stopRow}>\{player\.name\}</Link>`)],
    'GameRecommendations.jsx': [/<Link to=\{playerPath\(player\)\} state=\{\{ player \}\} className="gr-name">\s*\{player\.name\}\s*<\/Link>/],
    'Recommendations.jsx': [/<Link to=\{playerPath\(pagePlayer\)\} state=\{\{ player: pagePlayer \}\} className="card-open">\s*\{player\.PLAYER_NAME\}\s*<\/Link>/],
    'RecommendationChart.jsx': [/<Link to=\{playerPath\(pagePlayer\)\} state=\{\{ player: pagePlayer \}\} className="card-open">\s*\{player\.PLAYER_NAME\}\s*<\/Link>/],
    'LiveGameDetail.jsx': [/<Link to=\{playerPath\(leader\.player\)\} state=\{\{ player: leader\.player \}\} className="leader-card">/],
  };
  for (const [file, patterns] of Object.entries(expectations)) {
    for (const pattern of patterns) assert.match(readSource(file), pattern, file);
  }
});

test('the card views link their PlayerCards to the player page instead of an onOpen handler', () => {
  for (const file of ['Stats.jsx', 'Predictions.jsx', 'GamePredictions.jsx']) {
    const source = readSource(file);
    assert.match(source, /<PlayerCard\b[\s\S]*?to=\{playerPath\(player\)\}\s+linkState=\{\{ player \}\}/, file);
    assert.doesNotMatch(source, /onOpen=\{\(\) => handlePlayerClick\(player\)\}/, file);
  }
  // Favourites is a private page and keeps its button.
  assert.match(readSource('Favourites.jsx'), /onOpen=\{\(\) => handlePlayerClick\(player\)\}/);
});

test('recommendation chart cards link by the name in the upper-case recommendation row', () => {
  const { toPagePlayer } = loadFrontendModule('src/pages/RecommendationChart.jsx', ['toPagePlayer']);
  const row = { PLAYER_NAME: 'Bez Mbeng', TEAM: 'UTA', POSITION: 'SG', PPG_LAST: 8.1 };
  assert.deepEqual(toPagePlayer(row), { ...row, name: 'Bez Mbeng', team: 'UTA', position: 'SG' });
  assert.equal(toPagePlayer({ name: 'Plain Row', team: 'GSW' }).name, 'Plain Row');
});

test('player pages stay out of the index', () => {
  assert.equal(getPageMeta('/players/2544').noindex, true);
  assert.equal(INDEXABLE_PATHS.some(path => path.startsWith('/players')), false);
});
