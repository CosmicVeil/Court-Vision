import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { samePlayerName } from '../src/utils/playerNames.js';
import { extractWeeklyPraPlayer, formatPraGameDate } from '../src/utils/weeklyPra.js';

test('weekly PRA payload helpers and name matching', () => {
  assert.equal(extractWeeklyPraPlayer(undefined), null);
  assert.equal(extractWeeklyPraPlayer({ player: null }), null);
  assert.equal(extractWeeklyPraPlayer({ name: 'old shape' }), null);
  const player = { name: 'Luka Dončić' };
  assert.equal(extractWeeklyPraPlayer({ player }), player);
  assert.equal(formatPraGameDate('2026-10-07'), 'Wed, Oct 7');
  assert.equal(samePlayerName('Luka Dončić', 'luka doncic'), true);
});

test('home renders only a real weekly PRA player with game stats', () => {
  const source = fs.readFileSync(new URL('../src/pages/Home.jsx', import.meta.url), 'utf8');
  assert.match(source, /\{praPlayer && <PRACard/);
  assert.doesNotMatch(source, /pra\.name/);
  for (const field of ['pts', 'reb', 'ast', 'pra', 'opponent', 'is_live']) {
    assert.match(source, new RegExp(`player\\.${field}`));
  }
  assert.doesNotMatch(source, /player\.ppg/);
  assert.match(source, /trend-live-dot/);
});
