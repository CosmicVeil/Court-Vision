// Issue #146: former (retired) players are browsable on the Stats page, not only via the Home search.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readSource } from './helpers.mjs';

const { getStatsHeroStats } = await import('../src/utils/pageHero.js').catch(() => ({}));
const { readListQuery } = await import('../src/utils/listQuery.js').catch(() => ({}));

const stats = readSource('Stats.jsx');

test('Stats has a Status filter whose only option is Former Players', () => {
  assert.match(stats, /key: 'status', label: 'Status', allLabel: 'Active Players'/);
  assert.match(stats, /STATUS_OPTIONS = \[\{ value: 'former', label: 'Former Players' \}\]/);
});

test('the status reaches the API instead of a year, and refetches when it changes', () => {
  assert.match(stats, /if \(selectedStatus\) params\.append\('status', selectedStatus\);\s*else if \(selectedYear\) params\.append\('year', selectedYear\);/);
  assert.match(stats, /selectedYear, selectedStatus, sortBy, sortOrder\]\);/);
});

test('status and season clear each other, and Clear Filters clears both', () => {
  assert.match(stats, /updateQuery\(\{ season: e\.target\.value, status: '', page: 1 \}\)/);
  assert.match(stats, /updateQuery\(\{ status: e\.target\.value, season: '', page: 1 \}\)/);
  assert.match(stats, /season: '', status: '', page: 1 \}\);/);
});

test('former rows show their final season in the table and on cards', () => {
  assert.match(stats, /selectedStatus === 'former' && <th>Last Season<\/th>/);
  assert.match(stats, /formatSeason\(player\.last_season\)/);
  assert.match(stats, /Final Season Stats \(\$\{formatSeason\(player\.last_season\)\}\)/);
});

test('?status=former survives a reload; anything else falls back to active players', () => {
  assert.equal(typeof readListQuery, 'function');
  const defaults = { status: '', page: 1 };
  const allowed = { status: ['former'] };
  assert.equal(readListQuery('?status=former', defaults, allowed).status, 'former');
  assert.equal(readListQuery('?status=retired', defaults, allowed).status, '');
});

test('the hero says Past seasons for former players, since each row has its own season', () => {
  assert.equal(typeof getStatsHeroStats, 'function');
  const season = opts => getStatsHeroStats({ ready: true, total: 1, sort: 'name', order: 'asc', page: 1, totalPages: 1, ...opts })[1].value;
  assert.equal(season({ former: true, year: '' }), 'Past seasons');
  assert.equal(season({ year: '2023' }), '2022-23');
});
