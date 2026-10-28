import assert from 'node:assert/strict';
import test from 'node:test';
import { readSource } from './helpers.mjs';

const { readListQuery, writeListQuery } = await import('../src/utils/listQuery.js').catch(() => ({}));
const { shouldResetScroll } = await import('../src/utils/scroll.js').catch(() => ({}));

const DEFAULTS = { q: '', team: '', sort: 'name', order: 'asc', page: 1, view: 'table' };
const ALLOWED = { sort: ['name', 'ppg', 'apg'], order: ['asc', 'desc'], view: ['table', 'cards'] };

test('an empty URL gives the defaults', () => {
  assert.equal(typeof readListQuery, 'function');
  assert.deepEqual(readListQuery('', DEFAULTS, ALLOWED), DEFAULTS);
});

test('the URL restores sort, order, page, view and filters', () => {
  assert.deepEqual(readListQuery('?sort=ppg&order=desc&page=3&view=cards&team=LAL&q=luka', DEFAULTS, ALLOWED),
    { q: 'luka', team: 'LAL', sort: 'ppg', order: 'desc', page: 3, view: 'cards' });
});

test('hand-edited or stale values fall back to the defaults instead of breaking the page', () => {
  assert.deepEqual(readListQuery('?sort=drop_table&order=sideways&view=grid', DEFAULTS, ALLOWED), DEFAULTS);
  for (const page of ['0', '-2', '2.5', 'abc', '']) {
    assert.equal(readListQuery(`?page=${page}`, DEFAULTS, ALLOWED).page, 1, `page=${page}`);
  }
  assert.equal(readListQuery('?unknown=1', DEFAULTS, ALLOWED).unknown, undefined);
});

test('the URL only carries what differs from the defaults', () => {
  assert.equal(typeof writeListQuery, 'function');
  assert.equal(writeListQuery(DEFAULTS, DEFAULTS), '');
  assert.equal(writeListQuery({ ...DEFAULTS, sort: 'ppg', order: 'desc', page: 2 }, DEFAULTS), 'sort=ppg&order=desc&page=2');
  assert.equal(writeListQuery({ ...DEFAULTS, q: 'De Aaron' }, DEFAULTS), 'q=De+Aaron');
});

test('reading what was written gives the same state back', () => {
  const state = { q: 'shai', team: 'OKC', sort: 'apg', order: 'desc', page: 4, view: 'cards' };
  assert.deepEqual(readListQuery(`?${writeListQuery(state, DEFAULTS)}`, DEFAULTS, ALLOWED), state);
});

test('scroll resets only when the path changes, so sorting (a query change) keeps your place', () => {
  assert.equal(shouldResetScroll('PUSH', '/stats', '/predictions'), true);
  assert.equal(shouldResetScroll('REPLACE', '/stats', '/stats'), false, 'same page, new query string');
  assert.equal(shouldResetScroll('POP', '/predictions', '/stats'), false);
});

test('Stats and Predictions keep their list state in the URL and load in place', () => {
  for (const file of ['Stats.jsx', 'Predictions.jsx']) {
    const page = readSource(file);
    assert.match(page, /useListQuery\(/, file);
    assert.match(page, /new AbortController\(\)/, file);
    assert.match(page, /signal\.aborted/, file);
    assert.match(page, /aria-busy={loading}/, file);
    assert.match(page, /data-results/, file);
    assert.doesNotMatch(page, /loading-overlay/, file);
    assert.match(page, /scrollToIfAbove\(resultsRef\.current\)[\s\S]*scrollToIfAbove\(resultsRef\.current\)/, `${file}: paging and sorting both scroll`);
  }
});
