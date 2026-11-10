import assert from 'node:assert/strict';
import test from 'node:test';
import { readSource } from './helpers.mjs';
import { getAccuracyHighlights } from '../src/utils/predictionAccuracy.js';

const stat = (mae, improvement_pct) => ({ mae, baseline_mae: 3, improvement_pct });
const payload = (changes = {}) => ({
  accuracy: {
    season: '2026-27', as_of: '2026-11-09', players: 323, min_games: 5, good: true,
    stats: { ppg: stat(2.9, 4.2), apg: stat(0.76, -1.5), rpg: stat(1.07, 3.9), spg: stat(0.32, 0.8) },
    best_calls: [{
      id: 7, name: 'Tyler Herro', team: 'MIL', games: 10, miss: 0.5,
      stats: { ppg: { predicted: 21, actual: 21.4 }, rpg: { predicted: 4.7, actual: 4.6 }, apg: { predicted: 4.3, actual: 4.3 } },
    }],
    ...changes,
  },
});

test('accuracy highlights show only the headline stats that beat the baseline', () => {
  assert.deepEqual(getAccuracyHighlights(payload()), {
    season: '2026-27', asOf: '2026-11-09', players: 323, minGames: 5, edgePct: 4.2,
    stats: [
      { key: 'ppg', label: 'PTS', miss: '2.9' },
      { key: 'rpg', label: 'REB', miss: '1.1' },
    ],
    bestCalls: [{
      id: 7, name: 'Tyler Herro', meta: 'MIL · 10 GP',
      stats: [
        { key: 'ppg', label: 'PTS', predicted: '21.0', actual: '21.4' },
        { key: 'rpg', label: 'REB', predicted: '4.7', actual: '4.6' },
        { key: 'apg', label: 'AST', predicted: '4.3', actual: '4.3' },
      ],
    }],
  });
  assert.deepEqual(getAccuracyHighlights(payload({ best_calls: undefined })).bestCalls, []);
});

test('nothing is advertised without a good snapshot', () => {
  assert.equal(getAccuracyHighlights(undefined), null);
  assert.equal(getAccuracyHighlights({ accuracy: null }), null);
  assert.equal(getAccuracyHighlights(payload({ good: false })), null);
  assert.equal(getAccuracyHighlights(payload({ stats: {} })), null);
});

test('home shows the accuracy strip only when there are highlights', () => {
  const home = readSource('Home.jsx');
  assert.match(home, /fetch\(buildApiUrl\('predictions\/accuracy'\)\)/);
  assert.match(home, /if \(!highlights\) return null;/);
  assert.match(home, /<ModelAccuracy \/>/);
  const css = readSource('Home.css');
  assert.match(css, /\.model-accuracy \{/);
  assert.match(home, /\{highlights\.bestCalls\.length > 0 && \(/);
  assert.match(css, /\.called-it-card \{/);
});
