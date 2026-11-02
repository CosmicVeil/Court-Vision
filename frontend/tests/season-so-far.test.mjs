import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { readSource } from './helpers.mjs';

const helperUrl = new URL('../src/utils/seasonSoFar.js', import.meta.url);
async function helpers() {
  assert.ok(existsSync(helperUrl), 'season-so-far formatting helper exists');
  return import(helperUrl);
}

const player = { so_far_ppg: 24.14, so_far_rpg: 7.24, so_far_apg: 8, so_far_gp: 4 };

test('so-far card rounds per-game stats and labels the games played', async () => {
  const { getSoFarStats } = await helpers();
  assert.deepEqual(getSoFarStats(player), {
    label: '2026-27 so far · 4 GP',
    stats: [
      { key: 'ppg', label: 'PPG', value: '24.1' },
      { key: 'rpg', label: 'RPG', value: '7.2' },
      { key: 'apg', label: 'APG', value: '8.0' },
    ],
  });
});

test('missing so-far fields display dashes, while zero remains a number', async () => {
  const { getSoFarStats } = await helpers();
  for (const missing of [{}, { so_far_ppg: null, so_far_rpg: null, so_far_apg: null, so_far_gp: null }]) {
    const result = getSoFarStats(missing);
    assert.equal(result.label, '2026-27 so far · — GP');
    assert.deepEqual(result.stats.map(stat => stat.value), ['—', '—', '—']);
  }
  const result = getSoFarStats({ so_far_ppg: 0, so_far_rpg: 0, so_far_apg: 0, so_far_gp: 0 });
  assert.equal(result.label, '2026-27 so far · 0 GP');
  assert.deepEqual(result.stats.map(stat => stat.value), ['0.0', '0.0', '0.0']);
});

test('spotlight so-far line includes all stats and GP', async () => {
  const { formatSoFarLine } = await helpers();
  assert.equal(formatSoFarLine(player), '24.1 PPG · 7.2 RPG · 8.0 APG · 4 GP');
  assert.equal(formatSoFarLine({ ...player, so_far_ppg: 0 }), '0.0 PPG · 7.2 RPG · 8.0 APG · 4 GP');
});

test('spotlight handles null and absent fallback data', async () => {
  const { formatSoFarLine } = await helpers();
  assert.equal(formatSoFarLine({}), '—');
  assert.equal(formatSoFarLine({ so_far_ppg: null, so_far_rpg: null, so_far_apg: null, so_far_gp: null }), '—');
  assert.equal(formatSoFarLine({ ...player, so_far_apg: null }), '24.1 PPG · 7.2 RPG · — APG · 4 GP');
});

test('Stats accepts 2027 in the URL and lists its season first', () => {
  const source = readSource('Stats.jsx');
  assert.match(source, /season: \[[^\]]*'2027'/);
  assert.match(source, /const SEASON_OPTIONS = \['2027'/);
  assert.match(source, /label: `\$\{year - 1\}-\$\{year.slice\(2\)\} \(\$\{year\}\)`/);
});

test('Career History marks only in-progress rows with the existing tag', () => {
  const source = readSource('PlayerStatsModal.jsx');
  assert.match(source, /season.in_progress && <span className="game-log-tag">In progress<\/span>/);
  assert.match(source, /Object.entries\(player.history \|\| \{\}\).reverse\(\)/);
});

test('Predictions adds so-far stats inside its card and preserves shooting stats', () => {
  const source = readSource('Predictions.jsx');
  assert.match(source, /getSoFarStats\(player\)/);
  assert.match(source, /<PlayerCard[\s\S]*extraLabel="This Season Shooting"[\s\S]*className="pc-extra"[\s\S]*soFar.label[\s\S]*soFar.stats.map[\s\S]*data-numeric[\s\S]*<\/PlayerCard>/);
  assert.match(source, /stats=\{main\}/);
  assert.match(source, /extraStats=\{extra\}/);
});

test('Recommendations adds the so-far row and preserves improvement calculations', () => {
  const source = readSource('Recommendations.jsx');
  assert.match(source, /className="stat-label">2026-27 SO FAR<\/span>/);
  assert.match(source, /className="spotlight-stat-val"[^>]*>\{formatSoFarLine\(player\)\}/);
  assert.match(source, /const improvement = player\[`\$\{s\}_IMPROVEMENT`\] \|\| 0/);
  assert.match(source, /const impVal = player\[`\$\{statName\}_IMPROVEMENT`\] \|\| 0/);
});

test('missing age shows a dash in the modal and is hidden in search results', () => {
  assert.match(readSource('PlayerStatsModal.jsx'), /<strong>Age:<\/strong> \{player\.age \?\? '—'\}/);
  assert.match(readSource('Home.jsx'), /\{player\.age != null && ` · Age \$\{player\.age\}`\}/);
});
