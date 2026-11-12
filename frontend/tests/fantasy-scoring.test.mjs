import assert from 'node:assert/strict';
import test from 'node:test';
import { readFrontend, readSource } from './helpers.mjs';

const { FPTS_TITLE, fptsTitle, scoringFormula, scoringHeaderValue } = await import('../src/utils/fantasy.js');

const FANDUEL = { pts: 1, reb: 1.2, ast: 1.5, stl: 3, blk: 3, tov: -1 };

test('the FanDuel formula matches the default tooltip', () => {
  assert.equal(`FanDuel fantasy points: ${scoringFormula(FANDUEL)}`, FPTS_TITLE);
});

test('formulas drop zero weights and handle a negative first term', () => {
  assert.equal(scoringFormula({ pts: 1, reb: 1, ast: 2, stl: 3, blk: 3, tov: 0 }), 'PTS + REB + 2 AST + 3 STL + 3 BLK');
  assert.equal(scoringFormula({ pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: -2 }), '−2 TOV');
  assert.equal(scoringFormula({}), '0');
});

test('the default sends no header; presets send their id; custom sends every valid weight', () => {
  assert.equal(scoringHeaderValue(null), null);
  assert.equal(scoringHeaderValue({ preset: 'fanduel', weights: FANDUEL }), null);
  assert.equal(scoringHeaderValue({ preset: 'espn' }), 'espn');
  assert.equal(scoringHeaderValue({ preset: 'custom', weights: { ...FANDUEL, pts: 5, reb: '', ast: 'x' } }),
    'custom:pts=5,stl=3,blk=3,tov=-1');
});

test("FPTS tooltips name the user's scoring and fall back to FanDuel", () => {
  assert.equal(fptsTitle(null), FPTS_TITLE);
  assert.equal(fptsTitle({ preset: 'custom', label: 'Custom', weights: { ...FANDUEL, pts: 5 } }),
    'Custom fantasy points: 5 PTS + 1.2 REB + 1.5 AST + 3 STL + 3 BLK − TOV');
});

test('every API request carries the scoring header next to the auth token', () => {
  const main = readFrontend('src/main.jsx');
  assert.match(main, /const scoring = isApi \? scoringHeaderValue\(getScoring\(\)\) : null;/);
  assert.match(main, /headers\.set\(SCORING_HEADER, scoring\)/);
});

test('the profile page saves scoring to the account and mirrors it locally', () => {
  const profile = readSource('Profile.jsx');
  assert.match(profile, /buildApiUrl\('profile\/scoring'\), \{\s*method: 'PUT'/);
  assert.match(profile, /setScoring\(data\.scoring\)/);
  assert.match(readFrontend('src/App.jsx'), /<Route path="\/profile" element=\{<Profile \/>\} \/>/);
  assert.match(readSource('SiteHeader.jsx'), /<Link to="\/profile"/);
});

test('the Stats page ranks the whole league by actual fantasy points', () => {
  const stats = readSource('Stats.jsx');
  assert.match(stats, /sort: \[[^\]]*'fantasy'[^\]]*\]/);
  assert.match(stats, /onClick=\{\(\) => handleSort\('fantasy'\)\}/);
  assert.match(stats, /player\.stats\?\.fantasy_last\?\.toFixed\(1\)/);
});

test('the profile form only renders (and saves) once the saved setting has loaded', () => {
  const profile = readSource('Profile.jsx');
  assert.match(profile, /presets\.length === 0 \? \(/);
  // An HTML proxy error is not JSON; it must not surface as a raw SyntaxError.
  assert.match(profile, /await response\.json\(\)\.catch\(\(\) => \(\{\}\)\)/);
});

test('an expired session on the profile page signs out instead of showing a load error', () => {
  const profile = readSource('Profile.jsx');
  assert.equal(profile.match(/if \(response\.status === 401\) return endSession\(\);/g)?.length, 2);
  assert.match(profile, /const endSession = \(\) => \{\s*clearAuth\(\);/);
  assert.match(profile, /useState\(isAuthenticated\)/);
});
