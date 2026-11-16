import assert from 'node:assert/strict';
import test from 'node:test';
import { readFrontend as read, readSource } from './helpers.mjs';
import { buildSitemap, DEFAULT_META, defaultHeadTags, getPageMeta, INDEXABLE_PATHS, SITE_URL } from '../src/config/seo.js';
import { getTeamColor, TEAMS } from '../src/utils/team.js';

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
  assert.match(read('vite.config.js'), /plugins: \[react\(\), seo\(\)\]/);
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
