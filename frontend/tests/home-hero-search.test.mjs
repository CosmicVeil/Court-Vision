import assert from 'node:assert/strict';
import test from 'node:test';
import { readSource } from './helpers.mjs';
import { loadFrontendModule, renderComponent } from './render-helpers.mjs';

// Home reads the login state from localStorage while rendering; effects (fetches, scroll) never run here.
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const { default: Home, heroUiVars, heroResultsMaxHeight, fitHeroResults, searchDropdown } = loadFrontendModule(
  'src/pages/Home.jsx', ['heroUiVars', 'heroResultsMaxHeight', 'fitHeroResults', 'searchDropdown']);
const home = readSource('Home.jsx');
const css = readSource('Home.css');
const rule = selector => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `${selector} rule exists`);
  return css.slice(at, css.indexOf('}', at));
};

test('the player search sits in the hero, between the subtitle and the call-to-action buttons', () => {
  const html = renderComponent(Home, {});
  const ui = html.indexOf('class="cv-hero-ui"');
  const subtitle = html.indexOf('class="hero-subtitle"');
  const search = html.indexOf('class="search-input-field"');
  const cta = html.indexOf('class="hero-cta"');
  const heroEnd = html.indexOf('</section>');
  assert.ok(ui >= 0 && ui < subtitle, 'subtitle is inside the hero UI');
  assert.ok(subtitle < search && search < cta, 'search comes after the subtitle and before the buttons');
  assert.ok(cta < heroEnd, 'all of it is inside the hero section');
  assert.equal(html.match(/class="search-input-field"/g)?.length, 1, 'there is only one player search');
  assert.match(html, /<div class="hero-search-wrapper" data-enter="true"/, 'it enters with the rest of the hero UI');
});

test('the separate "Find a player" section further down is gone', () => {
  const html = renderComponent(Home, {});
  assert.doesNotMatch(html, /court-search-section|home-search-title|Find a/);
  assert.doesNotMatch(css, /\.court-search-section|\.court-search-container/);
});

test('the hero UI fades out over the first 12% of the intro and stops taking clicks once invisible', () => {
  assert.equal(typeof heroUiVars, 'function');
  assert.deepEqual(heroUiVars(0), { '--cv-ui-op': 1, '--cv-ui-pointer': 'auto' });
  assert.deepEqual(heroUiVars(0.06), { '--cv-ui-op': 0.5, '--cv-ui-pointer': 'auto' });
  assert.deepEqual(heroUiVars(0.12), { '--cv-ui-op': 0, '--cv-ui-pointer': 'none' });
  assert.deepEqual(heroUiVars(1), { '--cv-ui-op': 0, '--cv-ui-pointer': 'none' });
});

test('the scroll handler applies the hero UI vars, and CSS turns them into opacity and pointer events', () => {
  assert.match(home, /for \(const \[name, value\] of Object\.entries\(heroUiVars\(p\)\)\) el\.style\.setProperty\(name, value\);/);
  const ui = rule('.cv-hero-ui');
  assert.match(ui, /opacity: var\(--cv-ui-op, 1\);/);
  assert.match(ui, /pointer-events: var\(--cv-ui-pointer, auto\);/, 'defaults to clickable when no var is set');
});

test('reduced motion clears the inline vars, so the still hero UI stays visible and clickable', () => {
  assert.match(home, /if \(reducedMotion\.matches\) \{\s*if \(heroRef\.current\) heroRef\.current\.style\.cssText = '';\s*return;\s*\}/);
  const reducedCss = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.doesNotMatch(reducedCss, /pointer-events/);
});

test('in the hero, results open upward inside the clipped stage, capped to the measured space', () => {
  const dropdown = rule('.cv-hero-ui .search-results-dropdown');
  assert.match(dropdown, /top: auto;/);
  assert.match(dropdown, /bottom: calc\(100% \+ 8px\);/);
  assert.match(dropdown, /max-height: min\(320px, var\(--hero-results-max, 45vh\)\);/);
  assert.match(dropdown, /text-align: left;/, 'the hero UI is centred; result rows stay left aligned');
});

// A stand-in for the search wrapper: where it sits on screen and what --header-height resolves to.
const fakeWrapper = (top, headerHeight = '60px') => {
  const set = {};
  return {
    set,
    getBoundingClientRect: () => ({ top }),
    style: { setProperty: (name, value) => { set[name] = value; } },
    view: { getComputedStyle: () => ({ getPropertyValue: name => (name === '--header-height' ? headerHeight : '') }) },
  };
};

test('on a short landscape phone the results stop below the fixed header instead of under it', () => {
  // 568×320: the bar's top lands about 166px down (9% bottom offset, one CTA row, margins, 56px bar).
  const wrapper = fakeWrapper(166);
  fitHeroResults(wrapper, wrapper.view);
  assert.deepEqual(wrapper.set, { '--hero-results-max': '90px' });
  // The dropdown's top edge = bar top − 8px gap − its height; it must clear the 60px header.
  assert.ok(166 - 8 - parseFloat(wrapper.set['--hero-results-max']) >= 60, 'first result is not hidden behind the header');
});

test('the results cap follows the header height and never goes negative', () => {
  assert.equal(heroResultsMaxHeight(700, 60), 624, 'tall screens: plenty of room, CSS still caps at 320px');
  assert.equal(heroResultsMaxHeight(166, 72), 78, 'the taller header from tokens.css leaves less room');
  assert.equal(heroResultsMaxHeight(166.7, 60), 90, 'whole pixels, rounded down so it never overlaps');
  assert.equal(heroResultsMaxHeight(50, 60), 0, 'no room at all gives 0, not a negative height');

  const noHeader = fakeWrapper(300, '');
  fitHeroResults(noHeader, noHeader.view);
  assert.deepEqual(noHeader.set, { '--hero-results-max': '284px' }, 'an unset header height counts as 0');
});

test('Home measures the room once results open and again on resize, not on every scroll', () => {
  assert.match(home, /useEffect\(\(\) => \{\s*if \(!showDropdown\) return;\s*const fit = \(\) => fitHeroResults\(searchContainerRef\.current\);\s*fit\(\);\s*window\.addEventListener\('resize', fit\);\s*return \(\) => window\.removeEventListener\('resize', fit\);\s*\}, \[showDropdown\]\);/);
});

test('the search shows results, a no-match note, or nothing, and a closed list shows nothing', () => {
  const base = { query: 'jam', isSearching: false, resultCount: 15, open: true };
  assert.equal(searchDropdown(base), 'results');
  assert.equal(searchDropdown({ ...base, resultCount: 0 }), 'no-results');
  assert.equal(searchDropdown({ ...base, resultCount: 0, isSearching: true }), null, 'not while still searching');
  assert.equal(searchDropdown({ ...base, query: ' j ', resultCount: 0 }), null, 'one letter is not a search');
  // Escape or a click outside closes the list: it must not claim the query matched no one.
  assert.equal(searchDropdown({ ...base, open: false }), null);
  assert.equal(searchDropdown({ ...base, resultCount: 0, open: false }), null);
});

test('Escape and clicks outside close the list; typing or focusing the bar reopens it', () => {
  assert.match(home, /!searchContainerRef\.current\.contains\(e\.target\)\) \{\s*setResultsOpen\(false\);/);
  assert.match(home, /if \(e\.key === "Escape"\) \{\s*setResultsOpen\(false\);/);
  assert.match(home, /onChange=\{\(e\) => \{ setSearchQuery\(e\.target\.value\); setResultsOpen\(true\); \}\}/);
  assert.match(home, /onFocus=\{\(\) => setResultsOpen\(true\)\}/);
  assert.match(home, /\{dropdown === 'results' && \(/);
  assert.match(home, /\{dropdown === 'no-results' && \(/);
});
