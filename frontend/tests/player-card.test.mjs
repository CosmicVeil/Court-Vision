import assert from 'node:assert/strict';
import test from 'node:test';
import { readFrontend as read, readSource } from './helpers.mjs';

const { formatStat, getStatDelta, getPredictionCardStats, getSeasonCardStats, getChangedStatKeys } =
  await import('../src/utils/playerCard.js').catch(() => ({}));

test('only values that differ from the previous render count as changed', () => {
  assert.equal(typeof getChangedStatKeys, 'function');
  const stats = [{ key: 'ppg', value: '7.4' }, { key: 'apg', value: '1.9' }];
  assert.deepEqual([...getChangedStatKeys(null, stats)], [], 'the first render has nothing to compare');
  assert.deepEqual([...getChangedStatKeys({ ppg: '10.4', apg: '1.9' }, stats)], ['ppg']);
  assert.deepEqual([...getChangedStatKeys({ ppg: '7.4' }, stats)], [], 'a newly added stat is not a change');
});

test('stats format to fixed digits, with missing values shown as zero', () => {
  assert.equal(typeof formatStat, 'function');
  assert.equal(formatStat(24.13), '24.1');
  assert.equal(formatStat('7'), '7.0');
  assert.equal(formatStat(45.25, { suffix: '%' }), '45.3%');
  assert.equal(formatStat(72, { digits: 0 }), '72');
  for (const missing of [null, undefined, '', 'n/a', NaN]) assert.equal(formatStat(missing), '0.0');
});

test('a delta is the signed change from now to the prediction, flat inside half a tenth', () => {
  assert.equal(typeof getStatDelta, 'function');
  assert.deepEqual(getStatDelta(22.3, 24.1), { text: '+1.8', direction: 'up' });
  assert.deepEqual(getStatDelta(24.1, 22.3), { text: '−1.8', direction: 'down' });
  assert.deepEqual(getStatDelta(10, 10.04), { text: '0.0', direction: 'flat' });
  assert.equal(getStatDelta(null, 24.1), null, 'no current value means nothing to compare');
  assert.equal(getStatDelta(22.3, undefined), null);
});

test('prediction cards lead with predicted PPG/APG/RPG and their change, then current shooting', () => {
  assert.equal(typeof getPredictionCardStats, 'function');
  const { main, extra } = getPredictionCardStats({
    predicted_ppg: 24.1, ppg_last: 22.3,
    predicted_apg: 5, apg_last: 5.02,
    predicted_rpg: 7.2, rpg_last: 8,
    fg_pct_last: 48.12, fg3_pct_last: 36.6, ft_pct_last: null,
  });
  assert.deepEqual(main, [
    { key: 'ppg', label: 'PPG', value: '24.1', delta: { text: '+1.8', direction: 'up' } },
    { key: 'apg', label: 'APG', value: '5.0', delta: { text: '0.0', direction: 'flat' } },
    { key: 'rpg', label: 'RPG', value: '7.2', delta: { text: '−0.8', direction: 'down' } },
  ]);
  assert.deepEqual(extra, [
    { key: 'fg_pct', label: 'FG%', value: '48.1%' },
    { key: 'fg3_pct', label: '3P%', value: '36.6%' },
    { key: 'ft_pct', label: 'FT%', value: '0.0%' },
  ]);
});

test('season cards lead with PPG/APG/RPG, then the rest of the season line', () => {
  assert.equal(typeof getSeasonCardStats, 'function');
  const { main, extra } = getSeasonCardStats({
    stats: { ppg_last: 30.04, apg_last: 8, rpg_last: 9.96, spg_last: 1.4, bpg_last: 0.6,
      fg_pct_last: 52.1, fg3_pct_last: 38, ft_pct_last: 81.56, games_played: 71 },
  });
  assert.deepEqual(main.map(stat => [stat.label, stat.value]), [['PPG', '30.0'], ['APG', '8.0'], ['RPG', '10.0']]);
  assert.deepEqual(extra.map(stat => [stat.label, stat.value]),
    [['SPG', '1.4'], ['BPG', '0.6'], ['FG%', '52.1%'], ['3P%', '38.0%'], ['FT%', '81.6%'], ['GP', '71']]);
  assert.ok(main.every(stat => !stat.delta), 'season stats have nothing to compare against');
  assert.deepEqual(getSeasonCardStats({}).main.map(stat => stat.value), ['0.0', '0.0', '0.0']);
});

test('PlayerCard opens through a real button, keeps favourites separate, and uses the shared motion', () => {
  const card = readSource('PlayerCard.jsx');
  assert.match(card, /<button type="button" className="pc-open"/, 'the name is the button that opens the player');
  assert.match(card, /aria-pressed={isFavorite}/);
  assert.match(card, /data-reveal/);
  assert.match(card, /getRevealDelay\(index\)/);
  assert.match(card, /usePointerTilt\(\)/);
  assert.match(card, /data-numeric/);
  assert.match(card, /{children}/, 'pages compose extra content into the card');
  assert.doesNotMatch(card, /<div[^>]*onClick/);
});

test('Stats and Predictions render PlayerCard instead of clickable divs, and reveal it', () => {
  for (const file of ['Stats.jsx', 'Predictions.jsx']) {
    const page = readSource(file);
    assert.match(page, /<PlayerCard\b/, file);
    assert.match(page, /<ScrollReveal scanKey=/, file);
    assert.doesNotMatch(page, /className="(prediction-card|player-card)[^"]*"/, file);
  }
});

test('Live Games and PlayerCard share one pointer-tilt hook', () => {
  const hook = read('src/hooks/usePointerTilt.js');
  assert.match(hook, /getTilt/);
  assert.match(hook, /requestAnimationFrame/);
  assert.match(hook, /pointerType !== 'mouse'/);
  assert.match(readSource('LiveGames.jsx'), /usePointerTilt\(\)/);
});

test('the card grid fits phones and gates pointer effects', () => {
  const css = readSource('PlayerCard.css');
  assert.match(css, /grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, \d+px\), 1fr\)\)/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.pc-open::after\s*\{[^}]*inset: 0/s, 'the open button stretches over the card');
  assert.doesNotMatch(css, /transition: all/);
});
