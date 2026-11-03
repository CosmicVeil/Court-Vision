import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync } from 'node:fs';
import { readFrontend as read, readSource } from './helpers.mjs';
import { getUser, isAuthenticated, logout, setAuth } from '../src/utils/auth.js';

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

// Exercise real auth storage changes; only browser storage and the network are replaced.
function logoutSession(t, fetchResponse) {
  const values = new Map();
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  } });
  t.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else delete globalThis.localStorage;
  });
  setAuth('old-token', { first_name: 'Test', last_name: 'User', email: 'test@example.com' });
  return t.mock.method(globalThis, 'fetch', fetchResponse);
}

test('logout clears the local session before a slow server answers and sends the saved token', async t => {
  let resolveRequest;
  const request = new Promise(resolve => { resolveRequest = resolve; });
  const fetchMock = logoutSession(t, () => request);
  const pending = logout();
  try {
    assert.equal(isAuthenticated(), false);
    assert.equal(getUser(), null);
    assert.equal(fetchMock.mock.calls.length, 1);
    assert.deepEqual(fetchMock.mock.calls[0].arguments, ['/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer old-token' },
    }]);
  } finally {
    resolveRequest({ ok: true });
    await pending;
  }
  assert.equal(isAuthenticated(), false);
  assert.equal(getUser(), null);
});

for (const failure of ['offline', 'server error']) {
  test(`logout clears local auth immediately when the request fails: ${failure}`, async t => {
    let finishRequest;
    const request = new Promise((resolve, reject) => {
      finishRequest = () => failure === 'offline' ? reject(new Error('offline')) : resolve({ ok: false, status: 500 });
    });
    logoutSession(t, () => request);
    t.mock.method(console, 'error', () => {});
    const pending = logout();
    try {
      assert.equal(isAuthenticated(), false);
      assert.equal(getUser(), null);
    } finally {
      finishRequest();
      await assert.doesNotReject(pending);
    }
    assert.equal(isAuthenticated(), false);
    assert.equal(getUser(), null);
  });
}

test('logout without a token clears stale user data without contacting the server', async t => {
  const fetchMock = logoutSession(t, () => { throw new Error('unexpected request'); });
  localStorage.removeItem('authToken');
  await logout();
  assert.equal(getUser(), null);
  assert.equal(isAuthenticated(), false);
  assert.equal(fetchMock.mock.calls.length, 0);
});

test('a background logout response cannot clear a newly signed-in session', async t => {
  let resolveRequest;
  const request = new Promise(resolve => { resolveRequest = resolve; });
  logoutSession(t, () => request);
  const pending = logout();
  const nextUser = { first_name: 'Next', last_name: 'User' };
  setAuth('new-token', nextUser);
  resolveRequest({ ok: true });
  await pending;
  assert.equal(localStorage.getItem('authToken'), 'new-token');
  assert.deepEqual(getUser(), nextUser);
});

test('header logout closes the menu, clears its avatar and navigates without waiting on the network', () => {
  const header = readSource('SiteHeader.jsx');
  const handler = header.match(/const handleLogout = ([\s\S]*?);\n\n/)[1];
  const effects = [];
  // Run the actual handler with a never-settling logout, including when already home.
  const handleLogout = new Function('setDropdownOpen', 'logout', 'setUser', 'navigate', `return ${handler}`)(
    open => effects.push(['dropdown', open]),
    () => { effects.push(['logout']); return new Promise(() => {}); },
    user => effects.push(['user', user]),
    route => effects.push(['navigate', route]),
  );
  handleLogout();
  assert.deepEqual(effects, [['dropdown', false], ['logout'], ['user', null], ['navigate', '/']]);
});

test('profile dropdown remains mounted and inert when closed, preserving content until reopened', () => {
  const header = readSource('SiteHeader.jsx');
  assert.doesNotMatch(header, /dropdownOpen &&\s*\(/);
  assert.match(header, /className={`profile-dropdown \$\{dropdownOpen \? 'open' : ''\}`}\s+inert={!dropdownOpen}/);
  assert.match(header, /if \(!dropdownOpen\) setDropdownUser\(user\)/);
  const panel = header.slice(header.indexOf('className={`profile-dropdown'));
  assert.match(panel, /\{dropdownUser \? \(/);
  for (const field of ['first_name', 'last_name', 'email']) {
    assert.ok(panel.includes(`{dropdownUser.${field}}`));
  }
  assert.doesNotMatch(panel, /\{user[. ?]/);
});

test('profile dropdown fades and slides both ways using brand motion tokens', () => {
  const css = read('src/components/SiteHeader.css');
  const closed = css.match(/\.profile-dropdown\s*\{([^}]+)\}/)[1];
  assert.match(closed, /opacity: 0/);
  assert.match(closed, /translate: 0 -0\.5rem/);
  assert.match(closed, /visibility: hidden/);
  assert.match(closed, /pointer-events: none/);
  assert.match(closed, /transition:[^;]*opacity var\(--duration-base\) var\(--ease-brand\)/);
  assert.match(closed, /transition:[^;]*translate var\(--duration-base\) var\(--ease-brand\)/);
  assert.match(closed, /transition:[^;]*visibility var\(--duration-base\)/);
  assert.match(css, /\.profile-dropdown\.open\s*\{[^}]*opacity: 1;[^}]*translate: 0 0;[^}]*visibility: visible;[^}]*pointer-events: auto;/);
});

test('avatar changes fade in and keep a stable circle while the default image loads', () => {
  const css = read('src/components/SiteHeader.css');
  assert.match(css, /@keyframes avatar-in\s*\{\s*from\s*\{[^}]*opacity: 0/);
  for (const selector of ['profile-initials', 'profile-img']) {
    const rule = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]+)\\}`))[1];
    assert.match(rule, /width: 36px; height: 36px/);
    assert.match(rule, /animation: avatar-in var\(--duration-base\) var\(--ease-brand\)/);
  }
  assert.match(css, /\.profile-img\s*\{[^}]*background: var\(--color-graphite\)/);
  assert.match(css, /\.profile-img\s*\{[^}]*display: block/);
});

test('reduced motion disables dropdown and avatar motion', () => {
  const css = read('src/components/SiteHeader.css').split('@media (prefers-reduced-motion: reduce)')[1];
  assert.match(css, /\.profile-dropdown\s*\{\s*transition: none;/);
  assert.match(css, /\.profile-initials,\s*\.profile-img\s*\{\s*animation: none;/);
});
