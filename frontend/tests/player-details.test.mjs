import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { loadFrontendModule, renderComponent } from './render-helpers.mjs';

const { buildPlayerFallback, fetchPlayerDetails } = loadFrontendModule('src/utils/playerDetails.js');
const { default: PlayerStatsModal } = loadFrontendModule('src/components/PlayerStatsModal.jsx');
beforeEach(t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network request'); });
});

test('fallback keeps the NBA id, otherwise uses personId, otherwise null', () => {
  for (const [ids, expected] of [
    [{ id: 2544, personId: 201939 }, 2544],
    [{ personId: 201939 }, 201939],
    [{ id: null, personId: 201939 }, 201939],
    [{ id: undefined, personId: '201939' }, '201939'],
    [{}, null], [{ id: null, personId: null }, null],
    [{ id: 0, personId: 201939 }, 0],
  ]) {
    assert.equal(buildPlayerFallback({ name: 'Test Player', ...ids }).id, expected, JSON.stringify(ids));
  }
});

test('fallback adds the id without mutating the box-score row or losing its stats', () => {
  const player = Object.freeze({
    personId: 2544, name: 'Test Player', team: 'LAL', position: 'F', age: 25,
    pts: 24, reb: 7, ast: 8, stl: 2, blk: 1, tov: 3, min: 36,
  });
  assert.deepEqual(buildPlayerFallback(player), {
    id: 2544, name: 'Test Player', team: 'LAL', position: 'F', age: 25,
    current_stats: {
      ppg: 24, rpg: 7, apg: 8, spg: 2, bpg: 1, tov: 3, mpg: 36,
      fg_pct: 0, fg3_pct: 0, ft_pct: 0, games_played: 0,
    },
    ml_stats: null, history: {},
  });
  assert.equal(Object.hasOwn(player, 'id'), false);
});

test('a search without an exact match carries the box-score personId into the modal photo', async t => {
  const signal = new AbortController().signal;
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({
    ok: true, json: async () => ({ players: [{ id: 201939, name: 'Another Player' }] }),
  }));
  const player = await fetchPlayerDetails({ name: 'Test Player', personId: 2544 }, signal);
  assert.equal(player.id, 2544);
  assert.deepEqual(fetchMock.mock.calls[0].arguments,
    ['/api/players/search-all?query=Test%20Player', { signal }]);
  const html = renderComponent(PlayerStatsModal, { player, loading: false, onClose: () => {} });
  assert.match(html, /class="player-headshot stats-modal-photo"/);
  assert.match(html, /<img[^>]*src="https:\/\/cdn\.nba\.com\/headshots\/nba\/latest\/260x190\/2544\.png"[^>]*alt=""/);
  assert.doesNotMatch(html, /player-headshot-fallback/);
});

test('a successful exact search keeps the detail id used by the modal header', async t => {
  const detail = { id: 2544, name: 'Test Player', team: 'LAL', position: 'F', age: 25 };
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ players: [detail] }) }));
  const player = await fetchPlayerDetails({ name: 'Test Player', personId: 201939 });
  assert.equal(player, detail);
  const html = renderComponent(PlayerStatsModal, { player, loading: false, onClose: () => {} });
  assert.match(html, /class="stats-modal-header stats-modal-header--photo"/);
  assert.match(html, /260x190\/2544\.png/);
  assert.match(html, /<h2[^>]*>Test Player<\/h2>/);
  assert.match(html, /class="stats-modal-player-team-badge">LAL<\/span>/);
  assert.match(html, /<strong>Position:<\/strong> F/);
  assert.match(html, /<strong>Age:<\/strong> 25/);
});

test('modal renders a labelled silhouette path instead of requesting a photo for unusable ids', () => {
  for (const ids of [{}, { id: null }, { id: 0 }, { id: 900000000 }, { personId: null }]) {
    const player = buildPlayerFallback({ name: 'Rookie', ...ids });
    const html = renderComponent(PlayerStatsModal, { player, loading: false, onClose: () => {} });
    assert.doesNotMatch(html, /<img\b/);
    assert.match(html, /<svg[^>]*class="player-headshot-fallback"[^>]*role="img"[^>]*aria-label="No photo of Rookie"/);
    assert.match(html, /<circle\b/);
    assert.match(html, /<path d="[^"]+"/);
    assert.match(html, /<h2[^>]*>Rookie<\/h2>/);
  }
});

test('closed and loading modals do not render a premature photo', () => {
  assert.equal(renderComponent(PlayerStatsModal, { player: null, loading: false, onClose: () => {} }), '');
  const html = renderComponent(PlayerStatsModal, { player: null, loading: true, onClose: () => {} });
  assert.match(html, /Loading player details/);
  assert.doesNotMatch(html, /player-headshot|stats-modal-photo|<img\b/);
});

test('fallback passes through season shooting percentages and games played without rescaling', () => {
  const player = Object.freeze({ name: 'Season Player', fg_pct: 45.7, fg3_pct: 37.8, ft_pct: 81.3, games_played: 12 });
  const { current_stats: stats } = buildPlayerFallback(player);
  assert.deepEqual([stats.fg_pct, stats.fg3_pct, stats.ft_pct, stats.games_played], [45.7, 37.8, 81.3, 12]);
});

test('fallback defaults absent and null season stats to zero and preserves explicit zeros', () => {
  const fields = ['fg_pct', 'fg3_pct', 'ft_pct', 'games_played'];
  for (const value of [undefined, null, 0]) {
    const player = { name: 'Inactive Player', ...Object.fromEntries(fields.map(key => [key, value])) };
    const { current_stats: stats } = buildPlayerFallback(player);
    assert.deepEqual(fields.map(key => stats[key]), [0, 0, 0, 0]);
  }
});
