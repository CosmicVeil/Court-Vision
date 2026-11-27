import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { readRepo, readSource } from './helpers.mjs';
import { loadFrontendModule, renderComponent } from './render-helpers.mjs';

// The FPTS header reads the signed-in user's scoring from localStorage while rendering.
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const { default: PlayerHeadToHead, HeadToHeadTable, HEAD_TO_HEAD_LIMIT } =
  loadFrontendModule('src/components/PlayerHeadToHead.jsx');

beforeEach(t => {
  t.mock.method(globalThis, 'fetch', () => new Promise(() => {}));
});

const game = (id, date, extra = {}) => ({
  game_id: id, date, result: 'W', score: '120-100', minutes: 36, pts: 43, reb: 9, ast: 0,
  stl: 1, blk: 0, fgm: 16, fga: 25, fg3m: 4, fg3a: 9, fpts: 55.3, ...extra,
});

test('the table shows the average first, then each meeting linking to its game page', () => {
  const data = {
    games: [game('402', '2026-01-09'), game('401', '2025-03-02', { result: 'L', score: '100-120', pts: 30 })],
    averages: { games: 2, minutes: 36, pts: 36.5, reb: 9.5, ast: 5, stl: 1, blk: 0, fg_pct: 54, fg3_pct: null, fpts: 48 },
  };
  const html = renderComponent(HeadToHeadTable, { data, opponent: 'UTA' });
  const rows = [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map(match => match[1]).slice(1);
  assert.equal(rows.length, 3);
  assert.match(rows[0], /Avg \(2 GP\)/);
  assert.match(rows[0], /<td>54%<\/td><td>—<\/td>/);  // a missing 3P% shows a dash
  assert.match(rows[1], /href="\/games\/402"/);
  assert.match(rows[1], /Jan 9, 2026/);
  assert.match(rows[1], /game-log-win[^>]*>W<\/span> 120-100/);
  assert.match(rows[2], /game-log-loss[^>]*>L<\/span> 100-120/);
  assert.match(rows[2], /<td class="game-log-highlight">30<\/td>/);
  assert.match(rows[1], /<td>16-25<\/td><td>4-9<\/td><td>55\.3<\/td>/);
});

test('no meetings shows an empty message instead of a table', () => {
  for (const data of [{ games: [], averages: null }, null]) {
    const html = renderComponent(HeadToHeadTable, { data, opponent: 'UTA' });
    assert.doesNotMatch(html, /<table/);
    assert.match(html, /No recorded games against UTA yet\./);
  }
});

test('the panel starts loading, titled with the limit and opponent', () => {
  const html = renderComponent(PlayerHeadToHead, { playerId: 1627750, opponent: 'UTA' });
  assert.equal(HEAD_TO_HEAD_LIMIT, 5);
  assert.match(html, /Last 5 vs UTA/);
  assert.match(html, /role="status"[^>]*>Loading games against UTA/);
});

test('without a player or opponent the panel renders nothing', () => {
  assert.equal(renderComponent(PlayerHeadToHead, { playerId: 0, opponent: 'UTA' }), '');
  assert.equal(renderComponent(PlayerHeadToHead, { playerId: 1627750, opponent: '' }), '');
});

test('the panel requests the player-vs-team route and the Game projections tab shows it', () => {
  assert.match(readSource('PlayerHeadToHead.jsx'),
    /players\/\$\{playerId\}\/vs\/\$\{encodeURIComponent\(opponent\)\}\?limit=\$\{HEAD_TO_HEAD_LIMIT\}/);
  assert.match(readSource('PlayerNextGame.jsx'),
    /<PlayerHeadToHead playerId=\{Number\(player\.id\) \|\| 0\} opponent=\{prediction\.opponent\} \/>/);
  assert.match(readRepo('backend/app/api/routes/players.py'), /@bp\.route\('\/players\/<int:player_id>\/vs\/<team>'/);
});
