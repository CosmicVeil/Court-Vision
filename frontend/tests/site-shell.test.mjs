import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync } from 'node:fs';
import { readFrontend as read, readSource } from './helpers.mjs';

const { NAV_LINKS, getInitials } = await import('../src/utils/siteNav.js').catch(() => ({}));

test('every nav link points at a route the app defines', () => {
  assert.ok(Array.isArray(NAV_LINKS) && NAV_LINKS.length > 0);
  const routes = new Set([...read('src/App.jsx').matchAll(/path="([^"]+)"/g)].map(match => match[1]));
  for (const link of NAV_LINKS) {
    assert.ok(routes.has(link.to), `${link.to} is not a route`);
    assert.ok(link.label);
  }
});

test('nav keeps Home\'s link order, with Privacy right after Contact', () => {
  assert.deepEqual(NAV_LINKS.map(link => link.to),
    ['/stats', '/games', '/predictions', '/recommendations', '/favourites', '/contact', '/privacy']);
});

test('initials come from the first and last name, upper-cased', () => {
  assert.equal(typeof getInitials, 'function');
  assert.equal(getInitials({ first_name: 'mohan', last_name: 'dixit' }), 'MD');
  assert.equal(getInitials({ first_name: 'Varun' }), 'V');
  assert.equal(getInitials({}), '');
  assert.equal(getInitials(null), '');
});

test('all routes render inside the shared shell (a layout route)', () => {
  const app = read('src/App.jsx');
  assert.match(app, /import AppShell from "\.\/components\/AppShell\.jsx"/);
  assert.match(app, /<Route element={<AppShell \/>}>[\s\S]*<Route path="\*" element={<NotFound \/>} \/>[\s\S]*<\/Route>/);
  const shell = readSource('AppShell.jsx');
  assert.match(shell, /<SiteHeader \/>/);
  assert.match(shell, /<Outlet \/>/);
});

test('the site header marks the current page, re-reads auth per route and has a phone menu', () => {
  const header = readSource('SiteHeader.jsx');
  assert.match(header, /NavLink/);
  assert.match(header, /useLocation/);
  assert.match(header, /IntersectionObserver/);
  assert.match(header, /aria-expanded={menuOpen}/);
  assert.match(header, /aria-controls="site-menu"/);
  assert.match(header, /<Link to="\/" className="header-title">COURT VISION<\/Link>/);
  const css = read('src/components/SiteHeader.css');
  assert.match(css, /\.header-nav a\[aria-current="page"\]/);
  // The full link row needs ~1080px, so the menu button takes over below 1100px, not just on phones.
  assert.match(css, /@media \(max-width: 1099px\)\s*\{[^@]*\.header-nav\s*\{\s*display: none;[^@]*\.header-menu-btn\s*\{\s*display: flex;/);
  assert.match(css, /@media \(min-width: 1100px\)\s*\{\s*\.header-menu\s*\{\s*display: none;/);
  assert.doesNotMatch(css, /transition: all/);
});

test('pages no longer draw their own header or a back-to-home link', () => {
  assert.doesNotMatch(readSource('Home.jsx'), /<header/);
  assert.doesNotMatch(readSource('NotFound.jsx'), /<header/);
  assert.doesNotMatch(read('src/pages/Home.css'), /^\.header\s*\{/m);
  for (const file of readdirSync(new URL('../src/pages/', import.meta.url)).filter(name => name.endsWith('.jsx'))) {
    assert.doesNotMatch(readSource(file), /← HOME/, file);
  }
});
