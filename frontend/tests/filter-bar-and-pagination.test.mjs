import assert from 'node:assert/strict';
import test from 'node:test';
import { readSource } from './helpers.mjs';

const { getPaginationView, toFilterOptions } =
  await import('../src/utils/pagination.js').catch(() => ({}));

const view = (overrides) => getPaginationView({ page: 1, totalPages: 6, totalItems: 583, pageSize: 100, ...overrides });

test('the range covers the current page and stops at the total on the last page', () => {
  assert.equal(typeof getPaginationView, 'function');
  assert.equal(view({ page: 1 }).rangeLabel, 'Showing 1 - 100 of 583 players');
  assert.equal(view({ page: 2 }).rangeLabel, 'Showing 101 - 200 of 583 players');
  assert.equal(view({ page: 6 }).rangeLabel, 'Showing 501 - 583 of 583 players');
  assert.equal(getPaginationView({ page: 3, totalPages: 49, totalItems: 583, pageSize: 12 }).rangeLabel,
    'Showing 25 - 36 of 583 players');
});

test('Previous is disabled on the first page and Next on the last, and the targets never leave 1..totalPages', () => {
  const first = view({ page: 1 });
  assert.equal(first.previousDisabled, true);
  assert.equal(first.nextDisabled, false);
  assert.equal(first.previousPage, 1);
  assert.equal(first.nextPage, 2);

  const last = view({ page: 6 });
  assert.equal(last.previousDisabled, false);
  assert.equal(last.nextDisabled, true);
  assert.equal(last.previousPage, 5);
  assert.equal(last.nextPage, 6);
});

test('no results shows an empty range, one page, and both buttons disabled', () => {
  const empty = getPaginationView({ page: 1, totalPages: 0, totalItems: 0, pageSize: 100 });
  assert.equal(empty.rangeLabel, 'Showing 0 - 0 of 0 players');
  assert.equal(empty.totalPages, 1, 'a missing or zero page count still reads "Page 1 of 1"');
  assert.equal(empty.previousDisabled, true);
  assert.equal(empty.nextDisabled, true);
});

test('a page past the end (an old URL after filtering) keeps Next disabled and Previous steps back inside the range', () => {
  const stale = view({ page: 99 });
  assert.equal(stale.page, 99, 'the page shown is the one that was fetched');
  assert.equal(stale.nextDisabled, true);
  assert.equal(stale.previousDisabled, false);
  assert.equal(stale.previousPage, 6);
  assert.equal(stale.rangeLabel, 'Showing 0 - 0 of 583 players');
});

test('bad inputs fall back to safe numbers, and the item noun can change', () => {
  const odd = getPaginationView({ page: 'x', totalPages: undefined, totalItems: -4, pageSize: 12, itemLabel: 'games' });
  assert.equal(odd.page, 1);
  assert.equal(odd.totalPages, 1);
  assert.equal(odd.rangeLabel, 'Showing 0 - 0 of 0 games');
});

test('filter options accept plain strings from the API or value/label pairs', () => {
  assert.equal(typeof toFilterOptions, 'function');
  assert.deepEqual(toFilterOptions(['LAL', 'BOS']), [{ value: 'LAL', label: 'LAL' }, { value: 'BOS', label: 'BOS' }]);
  assert.deepEqual(toFilterOptions([{ value: '2026', label: '2025-26 (2026)' }]), [{ value: '2026', label: '2025-26 (2026)' }]);
  assert.deepEqual(toFilterOptions(undefined), []);
  assert.deepEqual(toFilterOptions(['', 'ATL', null]), [{ value: 'ATL', label: 'ATL' }],
    'the API sends an empty team; "All Teams" already covers it');
});

test('FilterBar labels every control, keeps search controlled and uses prefixed class names', () => {
  const bar = readSource('FilterBar.jsx');
  assert.match(bar, /<label\b[^>]*htmlFor=/, 'visible labels tied to their controls');
  assert.match(bar, /type="search"/);
  assert.match(bar, /value={search\.value}/, 'the page owns the search draft (a controlled input)');
  assert.match(bar, /type="button"/);
  assert.doesNotMatch(bar, /className="(filters-section|filter-group|filter-select|search-input|clear-filters-btn)"/);
  const css = readSource('FilterBar.css');
  assert.doesNotMatch(css, /^\s*\.(filters-section|filter-group|filter-select|search-input|clear-filters-btn)\b/m);
  assert.doesNotMatch(css, /transition:\s*all/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
});

test('Pagination is a labelled nav that marks the current page and stacks on phones', () => {
  const pager = readSource('Pagination.jsx');
  assert.match(pager, /<nav\b[^>]*aria-label="Pagination"/);
  assert.match(pager, /aria-current="page"/);
  assert.match(pager, /getPaginationView\(/);
  assert.match(pager, /disabled={view\.previousDisabled}/);
  assert.match(pager, /disabled={view\.nextDisabled}/);
  assert.match(pager, /data-numeric/);
  const css = readSource('Pagination.css');
  assert.doesNotMatch(css, /^\s*\.(pagination|page-[a-z-]+)\b/m, 'no bare global names');
  assert.doesNotMatch(css, /transition:\s*all/);
  assert.match(css, /max-width: 100%/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('Stats and Predictions both use the shared FilterBar and Pagination and drop the old markup and CSS', () => {
  for (const [page, css] of [['Stats.jsx', 'Stats.css'], ['Predictions.jsx', 'Predictions.css']]) {
    const source = readSource(page);
    assert.match(source, /<FilterBar\b/, page);
    assert.match(source, /<Pagination\b[\s\S]*onPageChange={goToPage}/, page);
    assert.doesNotMatch(source, /className="(filters-section|pagination|pagination-controls|clear-filters-btn)"/, page);
    assert.match(source, /setSearchDraft\(''\)/, `${page}: Clear Filters also empties the search draft`);
    assert.doesNotMatch(readSource(css), /^\s*\.(filters-section|filter-group|search-input|clear-filters-btn|pagination[a-z-]*|page-[a-z-]+)\b/m, css);
  }
  assert.match(readSource('Stats.jsx'), /pageSize={STATS_PAGE_SIZE}/);
  assert.match(readSource('Predictions.jsx'), /pageSize={PREDICTIONS_PAGE_SIZE}/);
});
