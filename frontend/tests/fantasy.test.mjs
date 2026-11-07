import assert from 'node:assert/strict';
import test from 'node:test';

const { FPTS_TITLE, getFantasyComparison } = await import('../src/utils/fantasy.js');

test('fantasy comparison reads the raw model fields and works out the relative change', () => {
  assert.deepEqual(getFantasyComparison({ FANTASY_LAST: 40, PREDICTED_FANTASY: 44 }), { last: 40, predicted: 44, change: 10 });
  assert.equal(getFantasyComparison({ FANTASY_LAST: 0, PREDICTED_FANTASY: 5 }).change, 0, 'no baseline means no change, not Infinity');
});

test('rows without fantasy points (the built-in fallbacks) give no comparison', () => {
  assert.equal(getFantasyComparison({ PPG_LAST: 8.1, PREDICTED_PPG: 10.6 }), null);
  assert.equal(getFantasyComparison({ FANTASY_LAST: 30, PREDICTED_FANTASY: null }), null);
  assert.equal(getFantasyComparison(undefined), null);
});

test('the FPTS tooltip states the FanDuel weights', () => {
  assert.match(FPTS_TITLE, /PTS \+ 1\.2 REB \+ 1\.5 AST \+ 3 STL \+ 3 BLK − TOV/);
});
