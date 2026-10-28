import assert from 'node:assert/strict';
import test from 'node:test';

const { getLiveGamesStats } = await import('../src/utils/liveGamesStats.js').catch(() => ({}));

test('stat strip reports fetched counts and sync time in anatomy order', () => {
  assert.equal(typeof getLiveGamesStats, 'function');
  const date = new Date('2026-10-27T12:00:00Z');
  assert.deepEqual(getLiveGamesStats({
    todayGames: [{ status: 2 }, { status: '2' }, { status: 1 }, { status: 3 }],
    upcomingTotalGames: '23', lastUpdated: date,
    formatTime: value => { assert.equal(value, date); return '12:00:00'; },
  }), [
    { key: 'live', label: 'Live now', value: 2 },
    { key: 'today', label: 'Today', value: 4 },
    { key: 'upcoming', label: 'Upcoming', value: 23 },
    { key: 'sync', label: 'Last sync', value: '12:00:00' },
  ]);
});

test('stat strip uses placeholders until initial loading finishes', () => {
  assert.equal(typeof getLiveGamesStats, 'function');
  assert.deepEqual(getLiveGamesStats({ loading: true, todayGames: [{ status: 2 }], upcomingTotalGames: 23,
    lastUpdated: new Date(), formatTime: () => assert.fail('Loading must not format sync time'),
  }).map(stat => stat.value), ['—', '—', '—', '—']);
});

test('stat strip normalizes missing and malformed count data without inventing a sync', () => {
  assert.equal(typeof getLiveGamesStats, 'function');
  for (const todayGames of [undefined, null, {}, 'games']) {
    assert.deepEqual(getLiveGamesStats({ todayGames }).map(stat => stat.value), [0, 0, 0, '—']);
  }
  for (const [input, expected] of [[-2, 0], [NaN, 0], [Infinity, 0], ['bad', 0], [3.8, 3], [0, 0]]) {
    assert.equal(getLiveGamesStats({ upcomingTotalGames: input })[2].value, expected);
  }
  const date = new Date('2026-10-27T12:00:00Z');
  assert.equal(getLiveGamesStats({ lastUpdated: date })[3].value, date.toLocaleTimeString());
});
