import assert from 'node:assert/strict';
import test from 'node:test';
import { readFrontend as read } from './helpers.mjs';

const live = await import('../src/utils/liveGames.js');
const detail = await import('../src/utils/gameDetail.js').catch(() => ({}));

const player = (personId, pts, reb, ast, extra = {}) => ({ personId, name: `P${personId}`, pts, reb, ast, stl: 0, blk: 0, ...extra });
const team = (tricode, quarters) => ({ tricode, quarters: quarters.map((score, index) => ({ q: index + 1, score })) });

test('periods are labelled Q1-Q4 then OT1, OT2', () => {
  assert.equal(typeof live.formatPeriod, 'function');
  for (const [period, label] of [[1, 'Q1'], [4, 'Q4'], [5, 'OT1'], [6, 'OT2'], ['5', 'OT1'], [0, ''], [undefined, ''], [NaN, '']]) {
    assert.equal(live.formatPeriod(period), label);
  }
  const matchup = read('src/components/GameBoxScore.jsx');
  assert.match(matchup, /formatPeriod\(game\.period\)/, 'live status badge uses the shared label');
  assert.doesNotMatch(matchup, /`Q\$\{game\.period\}/);
});

test('game leaders pick the top points, rebounds and assists across both teams', () => {
  assert.equal(typeof detail.getGameLeaders, 'function');
  const game = {
    status: 2,
    away: { tricode: 'BKN' }, home: { tricode: 'BOS' },
    players: { away: [player(1, 30, 4, 2), player(2, 8, 11, 1)], home: [player(3, 30, 5, 9), player(4, 12, 2, 3)] },
  };
  assert.deepEqual(detail.getGameLeaders(game), [
    { key: 'pts', label: 'Points', value: 30, player: game.players.away[0], side: 'away', tricode: 'BKN' },
    { key: 'reb', label: 'Rebounds', value: 11, player: game.players.away[1], side: 'away', tricode: 'BKN' },
    { key: 'ast', label: 'Assists', value: 9, player: game.players.home[0], side: 'home', tricode: 'BOS' },
  ], 'ties keep the first player found (away before home)');
  assert.deepEqual(detail.getGameLeaders({ ...game, players: { away: [], home: [] } }), []);
  assert.deepEqual(detail.getGameLeaders({ ...game, players: undefined }), []);
});

test('scheduled games lead with season averages', () => {
  const game = {
    status: 1, away: { tricode: 'BKN' }, home: { tricode: 'BOS' },
    players: { away: [player(1, 0, 0, 0, { season_ppg: 21.4, season_rpg: 5, season_apg: 6.1 })], home: [player(2, 0, 0, 0, { season_ppg: 18, season_rpg: 9.8, season_apg: 2 })] },
  };
  assert.deepEqual(detail.getGameLeaders(game).map(({ key, label, value, tricode }) => ({ key, label, value, tricode })), [
    { key: 'season_ppg', label: 'Season PPG', value: 21.4, tricode: 'BKN' },
    { key: 'season_rpg', label: 'Season RPG', value: 9.8, tricode: 'BOS' },
    { key: 'season_apg', label: 'Season APG', value: 6.1, tricode: 'BKN' },
  ]);
});

test('period breakdown pairs scores, scales bars and names the winner', () => {
  assert.equal(typeof detail.getPeriodBreakdown, 'function');
  const rows = detail.getPeriodBreakdown(team('BKN', [21, 30, 25, 31, 7]), team('BOS', [26, 30, 30, 31, 6]));
  assert.deepEqual(rows.map(row => row.label), ['Q1', 'Q2', 'Q3', 'Q4', 'OT1']);
  assert.deepEqual(rows[0], { label: 'Q1', away: 21, home: 26, awayShare: 0.68, homeShare: 0.84, winner: 'home' });
  assert.equal(rows[1].winner, 'tie');
  assert.equal(rows[4].winner, 'away');
  assert.equal(rows[3].awayShare, 1, 'the highest period score fills the bar');
  const early = detail.getPeriodBreakdown(team('BKN', [20]), team('BOS', [18]));
  assert.equal(early.length, 4, 'always shows four quarters');
  assert.deepEqual(early[2], { label: 'Q3', away: null, home: null, awayShare: 0, homeShare: 0, winner: null });
  assert.deepEqual(detail.getPeriodBreakdown({}, {}).map(row => row.winner), [null, null, null, null]);
});

test('column leaders mark the best value per stat, ignoring zeros', () => {
  assert.equal(typeof detail.getColumnLeaders, 'function');
  const players = [player(1, 20, 3, 0, { stl: 2 }), player(2, 25, 3, 0), player(3, 5, 1, 0)];
  assert.deepEqual(detail.getColumnLeaders(players), { pts: 25, reb: 3, ast: null, stl: 2, blk: null });
  assert.deepEqual(detail.getColumnLeaders([]), { pts: null, reb: null, ast: null, stl: null, blk: null });
});

test('the detail page adopts the scoreboard, leaders, momentum and live dock', () => {
  const page = read('src/pages/LiveGameDetail.jsx');
  for (const pattern of [/<GameScoreboard/, /getGameLeaders/, /getPeriodBreakdown/, /<SyncDock/, /<ScrollReveal/, /getScoreChanges/,
    /data-slot="stat-strip"/, /onClick=\{\(\) => selectPlayer\(leader\.player\)\}/, /lg-detail-page/]) assert.match(page, pattern);
  // Behaviour kept from before.
  for (const pattern of [/LIVE_GAMES_REFRESH_MS/, /GAME NOT FOUND/, /UNABLE TO LOAD GAME/, /<BoxScore/, /PlayerStatsModal/]) assert.match(page, pattern);
  const board = read('src/components/GameScoreboard.jsx');
  // Changes are computed where the data is fetched; the scoreboard only displays them.
  for (const pattern of [/data-slot="display-heading"/, /scoreChanges/, /formatPeriod/, /data-score-pop/]) assert.match(board, pattern);
  const box = read('src/components/GameBoxScore.jsx');
  for (const pattern of [/<PillNav/, /getColumnLeaders/, /<tbody key=\{tab\}/, /is-leader/]) assert.match(box, pattern);
});

test('detail-page styles fix the oversized logos and stay scoped', () => {
  const css = read('src/pages/LiveGames.css');
  const section = css.slice(css.indexOf('/* Game detail page'));
  assert.ok(section.length > 100, 'game detail section exists');
  assert.match(section, /\.q-logo\s*\{[^}]*width: 20px/);
  assert.match(section, /position: sticky/);
  assert.doesNotMatch(section, /transition: all/);
  for (const selector of ['.bs-row', '.period-bar', '.scoreboard-score']) {
    assert.match(section, new RegExp(`prefers-reduced-motion[\\s\\S]*\\${selector}`), `${selector} has a reduced-motion rule`);
  }
});
