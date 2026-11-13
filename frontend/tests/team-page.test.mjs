import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import * as React from 'react';
import * as Router from 'react-router-dom';
import {
  buildTeamEndpoint, formatScore, getHeadshotUrl, getRecentForm, getScoringAverages,
  getTeamColor, getTeamLeaders, getTeamPath, summarizeGames, withRunningRecord,
} from '../src/utils/team.js';
import { readFrontend } from './helpers.mjs';
import { loadFrontendModule, renderComponent } from './render-helpers.mjs';

const { Roster, TeamHero, SeasonGames } = loadFrontendModule('src/pages/Team.jsx', ['Roster', 'TeamHero', 'SeasonGames']);
beforeEach(t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network request'); });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
});

const team = readFrontend('src/pages/Team.jsx');
const css = readFrontend('src/pages/Team.css');
const hero = team.slice(team.indexOf('function TeamHero('), team.indexOf('function Leaders('));
const leaders = team.slice(team.indexOf('function Leaders('), team.indexOf('function Roster('));
const seasonGames = team.slice(team.indexOf('function SeasonGames('), team.indexOf('export default function Team('));
const headshot = readFrontend('src/components/PlayerHeadshot.jsx');
const game = (result, is_home = true, season_type = 2) => ({ result, is_home, season_type });
const scoredGame = (score, result = 'W', season_type = 2) => ({ ...game(result, true, season_type), score });

test('team paths and API endpoints normalize case and surrounding whitespace', () => {
  for (const tricode of ['LAL', 'lal', ' LaL ']) {
    assert.equal(getTeamPath(tricode), '/teams/LAL');
    assert.equal(buildTeamEndpoint(tricode), 'teams/LAL');
  }
});

test('team paths encode route delimiters and tolerate missing values', () => {
  assert.equal(getTeamPath('a/b?#'), '/teams/A%2FB%3F%23');
  assert.equal(buildTeamEndpoint('a/b?#'), 'teams/A%2FB%3F%23');
  for (const value of [undefined, null, '']) {
    assert.equal(getTeamPath(value), '/teams/');
    assert.equal(buildTeamEndpoint(value), 'teams/');
  }
});

test('headshots use NBA person IDs and the requested CDN dimensions', () => {
  assert.equal(getHeadshotUrl(2544), 'https://cdn.nba.com/headshots/nba/latest/260x190/2544.png');
  assert.equal(getHeadshotUrl('2544', 'small'), getHeadshotUrl(2544));
  assert.equal(getHeadshotUrl(2544, 'large'), 'https://cdn.nba.com/headshots/nba/latest/1040x760/2544.png');
  assert.equal(getHeadshotUrl(899999999), 'https://cdn.nba.com/headshots/nba/latest/260x190/899999999.png');
});

test('headshots reject missing, noninteger, nonpositive and fallback IDs', () => {
  for (const id of [undefined, null, '', ' ', 'abc', 1.5, '1.5', 0, -1, NaN, Infinity, -Infinity, 900000000, '900000000', 999999999]) {
    assert.equal(getHeadshotUrl(id), '', `invalid ID: ${String(id)}`);
  }
});

test('unknown headshot sizes fall back to small', () => {
  for (const size of ['medium', '', null, 'constructor', 'toString', '__proto__']) {
    assert.equal(getHeadshotUrl(2544, size), getHeadshotUrl(2544, 'small'), `unknown size: ${size}`);
  }
});

test('summary computes home and away records and newest-first winning streak', () => {
  assert.deepEqual(summarizeGames([
    game('W'), game('W', false), game('L'), game('W', false), game('L', false),
  ]), { home: '1-1', away: '2-1', streak: 'W2' });
});

test('summary computes losing and full-season streaks', () => {
  assert.deepEqual(summarizeGames([game('L', false), game('L'), game('W')]),
    { home: '1-1', away: '0-1', streak: 'L2' });
  assert.deepEqual(summarizeGames([game('W'), game('W')]),
    { home: '2-0', away: '0-0', streak: 'W2' });
  assert.deepEqual(summarizeGames([game('L', false)]),
    { home: '0-0', away: '0-1', streak: 'L1' });
});

test('summary ignores preseason, postseason, play-in and unplayed rows even within a streak', () => {
  assert.deepEqual(summarizeGames([
    game('L', true, 3), game('W'), game(null), game('L', true, 1),
    game('L', false, 5), game('W', false), game('T'), game(''), null, {}, game('L'),
  ]), { home: '1-1', away: '1-0', streak: 'W2' });
});

test('summary tolerates non-arrays and returns empty records without usable games', () => {
  for (const games of [undefined, null, {}, 'games', 12, [], [null, {}, game(null), game('W', true, 3)]]) {
    assert.deepEqual(summarizeGames(games), { home: '0-0', away: '0-0', streak: '' });
  }
});

test('summary does not mutate or reorder games', () => {
  const games = Object.freeze([Object.freeze(game('W')), Object.freeze(game('L', false))]);
  assert.deepEqual(summarizeGames(games), { home: '1-0', away: '0-1', streak: 'W1' });
  assert.deepEqual(games, [game('W'), game('L', false)]);
});

test('score formatting handles regulation, single and multiple overtimes', () => {
  for (const [overtimes, suffix] of [[undefined, ''], [null, ''], [0, ''], [-1, ''], [1, ' OT'], [2, ' 2OT'], ['3', ' 3OT']]) {
    assert.equal(formatScore({ score: '123-112', overtimes }), `123-112${suffix}`);
  }
});

test('score formatting returns empty text without a score', () => {
  for (const value of [undefined, null, {}, { score: null }, { score: '', overtimes: 2 }]) {
    assert.equal(formatScore(value), '');
  }
});

test('team colors cover every NBA team with a hex color and normalize tricodes', () => {
  const tricodes = 'ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS'.split(' ');
  for (const tricode of tricodes) {
    assert.match(getTeamColor(tricode), /^#[\da-f]{6}$/i, tricode);
    assert.notEqual(getTeamColor(tricode), '#ff6436', tricode);
    assert.equal(getTeamColor(` ${tricode.toLowerCase()} `), getTeamColor(tricode));
  }
  assert.equal(getTeamColor('LAL'), '#552583');
  assert.equal(getTeamColor('BOS'), '#007A33');
  assert.equal(getTeamColor('GSW'), '#FFC72C');
});

test('team colors fall back to ember for missing, unknown and inherited keys', () => {
  for (const tricode of [undefined, null, '', ' ', 'XYZ', 'constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.equal(getTeamColor(tricode), '#ff6436', String(tricode));
  }
});

test('scoring averages preserve team-opponent order on wins and losses and round to one decimal', () => {
  assert.deepEqual(getScoringAverages([
    scoredGame('123-112'), scoredGame('90-101', 'L'), scoredGame('110-99'),
  ]), { ppg: 107.7, oppPpg: 104 });
  assert.deepEqual(getScoringAverages([scoredGame('99-100', 'L'), scoredGame('100-99')]),
    { ppg: 99.5, oppPpg: 99.5 });
});

test('scoring averages ignore other seasons and games without W or L', () => {
  assert.deepEqual(getScoringAverages([
    scoredGame('120-100'), scoredGame('200-10', 'W', 1), scoredGame('200-10', 'W', 3),
    scoredGame('200-10', 'W', 5), scoredGame('200-10', 'W', '2'),
    scoredGame('200-10', null), scoredGame('200-10', ''), scoredGame('200-10', 'T'), null, {},
  ]), { ppg: 120, oppPpg: 100 });
});

test('scoring averages ignore missing, nonnumeric and wrongly delimited scores', () => {
  const malformed = [undefined, null, '', ' ', 'abc', '100', '100:90', '100-90-80', 'abc-90', '100-NaN', 'Infinity-90', '-100-90'];
  for (const score of malformed) {
    assert.deepEqual(getScoringAverages([scoredGame(score)]), { ppg: null, oppPpg: null }, String(score));
    assert.deepEqual(getScoringAverages([scoredGame(score), scoredGame('120-100')]),
      { ppg: 120, oppPpg: 100 }, String(score));
  }
});

test('scoring averages reject score strings with an empty team or opponent side', () => {
  for (const score of ['100-', '-90', '-', '100- ', ' -90', ' - ']) {
    assert.deepEqual(getScoringAverages([scoredGame(score)]), { ppg: null, oppPpg: null }, score);
    assert.deepEqual(getScoringAverages([scoredGame(score), scoredGame('120-100')]),
      { ppg: 120, oppPpg: 100 }, score);
  }
});

test('scoring averages return nulls for non-arrays and seasons without usable scores', () => {
  for (const games of [undefined, null, {}, 'games', 12, [], [null, {}, game('W'), scoredGame('120-100', 'W', 3)]]) {
    assert.deepEqual(getScoringAverages(games), { ppg: null, oppPpg: null });
  }
});

test('recent form takes the latest five regular-season results and displays oldest first', () => {
  const games = [game('L', true, 3), game('W'), game(null), game('L'), game('W', true, 1),
    game('W'), game('L', true, 5), game('T'), null, {}, game('L'), game('L'), game('W')];
  assert.deepEqual(getRecentForm(games), ['L', 'L', 'W', 'L', 'W']);
  assert.deepEqual(getRecentForm(games, 2), ['L', 'W']);
  assert.deepEqual(getRecentForm(games, 0), []);
  assert.deepEqual(getRecentForm(games, 20), ['W', 'L', 'L', 'W', 'L', 'W']);
  assert.deepEqual(getRecentForm([game('W')]), ['W']);
});

test('recent form tolerates non-arrays and no regular-season results', () => {
  for (const games of [undefined, null, {}, 'games', 12, [], [null, {}, game(null), game('W', true, 3)]]) {
    assert.deepEqual(getRecentForm(games), []);
  }
});

test('scoring averages and recent form do not mutate or reorder games', () => {
  const games = Object.freeze([Object.freeze(scoredGame('90-100', 'L')), Object.freeze(scoredGame('120-100'))]);
  assert.deepEqual(getScoringAverages(games), { ppg: 105, oppPpg: 100 });
  assert.deepEqual(getRecentForm(games), ['W', 'L']);
  assert.deepEqual(games, [scoredGame('90-100', 'L'), scoredGame('120-100')]);
});

test('running records accumulate chronologically while preserving newest-first order and game fields', () => {
  const games = [game('L'), game('W'), game('W'), game('L')]
    .map((entry, index) => ({ ...entry, game_id: `game-${index}`, score: '100-90' }));
  assert.deepEqual(withRunningRecord(games), games.map((entry, index) => ({
    ...entry, record: ['2-2', '2-1', '1-1', '0-1'][index],
  })));
  assert.deepEqual(withRunningRecord([game('W')]), [{ ...game('W'), record: '1-0' }]);
});

test('running records leave other seasons and unplayed games blank without counting them', () => {
  const games = [game('W', true, 3), game('L'), game(null), game('W', true, 5), game('T'),
    game('W'), game('L', true, 1), game(''), {}];
  assert.deepEqual(withRunningRecord(games), games.map((entry, index) => ({
    ...entry, record: ['', '1-1', '', '', '', '1-0', '', '', ''][index],
  })));
});

test('running records tolerate non-arrays and null entries', () => {
  for (const games of [undefined, null, {}, 'games', 12, [], [null, undefined]]) {
    assert.deepEqual(withRunningRecord(games), []);
  }
  assert.deepEqual(withRunningRecord([null, game('L'), undefined, game('W')]),
    [{ ...game('L'), record: '1-1' }, { ...game('W'), record: '1-0' }]);
});

test('running records create fresh objects and do not overwrite input records or reorder input', () => {
  const games = Object.freeze([
    Object.freeze({ ...game('W'), record: 'old' }), Object.freeze(game('L')), Object.freeze(game(null)),
  ]);
  const result = withRunningRecord(games);
  assert.notEqual(result, games);
  result.forEach((entry, index) => assert.notEqual(entry, games[index]));
  assert.deepEqual(result.map(entry => entry.record), ['1-1', '0-1', '']);
  assert.deepEqual(games, [{ ...game('W'), record: 'old' }, game('L'), game(null)]);
});

test('team leaders select points, rebounds and assists independently with labels and numeric values', () => {
  const scorer = { id: 1, ppg: '30.5', rpg: 4, apg: 2 };
  const rebounder = { id: 2, ppg: 20, rpg: '12.2', apg: 1 };
  const passer = { id: 3, ppg: 9, rpg: 3, apg: '10.1' };
  const result = getTeamLeaders([passer, scorer, rebounder]);
  assert.deepEqual(result, [
    { key: 'ppg', label: 'Points', player: scorer, value: 30.5 },
    { key: 'rpg', label: 'Rebounds', player: rebounder, value: 12.2 },
    { key: 'apg', label: 'Assists', player: passer, value: 10.1 },
  ]);
  assert.equal(result[0].player, scorer);
  assert.equal(result[1].player, rebounder);
  assert.equal(result[2].player, passer);
});

test('a player can lead all three stats and tied leaders keep roster order without mutation', () => {
  const first = Object.freeze({ id: 1, ppg: 25, rpg: 10, apg: 8 });
  const second = Object.freeze({ id: 2, ppg: 25, rpg: 10, apg: 8 });
  const roster = Object.freeze([first, second]);
  assert.deepEqual(getTeamLeaders(roster).map(entry => entry.player), [first, first, first]);
  assert.deepEqual(getTeamLeaders([second, first]).map(entry => entry.player), [second, second, second]);
  assert.deepEqual(roster, [first, second]);
});

test('team leaders skip stats without a positive value and tolerate missing or malformed stats', () => {
  const scorer = { id: 1, ppg: '0.1', rpg: 0, apg: -1 };
  assert.deepEqual(getTeamLeaders([null, {}, { ppg: 'bad', rpg: null, apg: NaN }, scorer]),
    [{ key: 'ppg', label: 'Points', player: scorer, value: 0.1 }]);
  const passer = { id: 2, ppg: 0, rpg: -2, apg: 4 };
  assert.deepEqual(getTeamLeaders([passer]), [{ key: 'apg', label: 'Assists', player: passer, value: 4 }]);
  for (const roster of [undefined, null, {}, 'roster', 12, [], [null, {}, { ppg: 0, rpg: -2, apg: 'bad' }]]) {
    assert.deepEqual(getTeamLeaders(roster), []);
  }
});

// JSX/CSS contracts follow this project's source-assertion convention; these do not mount React.
test('team route mounts Team and standings names link to it', () => {
  assert.match(readFrontend('src/App.jsx'), /<Route\s+path="\/teams\/:tricode"\s+element=\{<Team\s*\/>\}/);
  const standings = readFrontend('src/pages/Standings.jsx');
  assert.match(standings, /<Link\s+to=\{getTeamPath\(team\.tricode\)\}[^>]*>[\s\S]*?\{team\.team\}[\s\S]*?<\/Link>/);
});

test('box score team link follows the selected team tab', () => {
  assert.match(readFrontend('src/components/GameBoxScore.jsx'),
    /<Link\s+to=\{getTeamPath\(game\[tab\]\.tricode\)\}[^>]*>[\s\S]*?\{game\[tab\]\.name\}[\s\S]*?<\/Link>/);
});

test('team request uses route tricode and aborts on navigation', () => {
  assert.match(team, /const\s+\{\s*tricode\s*\}\s*=\s*useParams\(\)/);
  assert.match(team, /fetch\(buildApiUrl\(buildTeamEndpoint\(tricode\)\),\s*\{\s*signal:\s*controller\.signal\s*\}\)/);
  assert.match(team, /return\s*\(\)\s*=>\s*controller\.abort\(\);\s*\},\s*\[tricode\]\)/);
  assert.match(team, /result\.tricode === tricode \? result\.status : 'loading'/);
  assert.match(team, /error\.name !== 'AbortError'/);
});

test('team page distinguishes loading, missing team and request failure', () => {
  assert.match(team, /response\.status === 404\) return null/);
  assert.match(team, /!response\.ok\) throw new Error/);
  for (const text of ['Loading team…', 'No NBA team matches', 'Unable to load this team.', 'role="status"']) {
    assert.ok(team.includes(text), text);
  }
});

test('empty roster, empty season and unavailable archive have distinct messages', () => {
  assert.match(renderComponent(Roster, { roster: [] }), /No roster data for this team yet\./);
  assert.match(renderComponent(SeasonGames, { games: [], available: true }), /No games played yet this season\./);
  assert.match(renderComponent(SeasonGames, { games: [], available: false, missing: 30 }),
    /Game results are unavailable right now\./);
});

test('team banner replaces PageHero and uses the normalized team color in every page state', () => {
  assert.doesNotMatch(team, /\bPageHero\b/);
  assert.match(team, /const pageStyle = \{ '--team-color': getTeamColor\(tricode\) \}/);
  const pages = team.match(/<div className="tp-page"[^>]*>/g);
  assert.equal(pages.length, 2);
  for (const page of pages) assert.match(page, /style=\{pageStyle\}/);
  assert.match(team, /<TeamHero team=\{team\} record=\{record\} games=\{games\} seasonLabel=\{seasonLabel\} gamesAvailable=\{gamesAvailable\}/);
  assert.match(hero, /<header className="tp-hero">/);
  assert.match(hero, /team\.logo && <img src=\{team\.logo\} alt="" className="tp-logo"/);
  assert.match(hero, /<h1[^>]*>[\s\S]*className="tp-city">\{team\.city\}[\s\S]*className="tp-name">\{team\.name\}[\s\S]*<\/h1>/);
  assert.match(hero, /\{seasonLabel\} SEASON/);
  assert.match(css, /\.tp-hero\s*\{[^}]*background:[^}]*var\(--team-color\)/);
});

test('team banner shows archive record, splits, streak, recent form and scoring averages', () => {
  const html = renderComponent(TeamHero, heroProps());
  assert.match(html, /class="tp-record"[^>]*>1-1<\/span>/);
  assert.match(html, /class="tp-streak" data-result="W"[^>]*>W1<\/span>/);
  assert.match(html, /aria-label="Last 2 games, oldest first: L W"/);
  assert.match(html, /<dt>Home<\/dt><dd[^>]*>1-0<\/dd>/);
  assert.match(html, /<dt>Away<\/dt><dd[^>]*>0-1<\/dd>/);
  assert.match(html, /<dt>PPG<\/dt><dd[^>]*>105.0<\/dd>/);
  assert.match(html, /<dt>Opp PPG<\/dt><dd[^>]*>100.0<\/dd>/);
  assert.doesNotMatch(html, /tp-partial/);
});

test('leader cards use headshots and real buttons connected to the existing player modal', () => {
  assert.match(leaders, /const leaders = getTeamLeaders\(roster\)/);
  assert.match(leaders, /if \(!leaders\.length\) return null/);
  assert.match(leaders, /<section className="tp-leaders" aria-label="Team leaders">/);
  assert.match(leaders, /<button[^>]*type="button"[^>]*className="tp-leader"[^>]*onClick=\{\(\) => onSelect\(player\)\}/);
  for (const content of ['{label} per game', '{stat(value)}', '{player.name}', '{player.position}']) {
    assert.ok(leaders.includes(content), content);
  }
  assert.match(leaders, /<PlayerHeadshot playerId=\{player\.id\} name=\{player\.name\} className="tp-leader-photo"/);
  assert.match(team, /<Leaders roster=\{roster\} onSelect=\{selectPlayer\}/);
});

test('Roster and Games use PillNav with counts and one labelled panel that switches content', () => {
  assert.match(team, /const \[tab, setTab\] = useState\('roster'\)/);
  assert.match(team, /<PillNav[^>]*label="Team sections"[^>]*idPrefix="tp"[^>]*panelId="tp-panel"[^>]*value=\{tab\} onChange=\{setTab\}/);
  assert.match(team, /id: 'roster', label: <>Roster <span[^>]*>\{roster\.length\}/);
  assert.match(team, /id: 'games', label: <>Games <span[^>]*>\{games\.length\}/);
  assert.equal((team.match(/role="tabpanel"/g) || []).length, 1);
  assert.match(team, /<section[^>]*id="tp-panel" role="tabpanel" aria-labelledby=\{`tp-tab-\$\{tab\}`\}/);
  assert.match(team, /tab === 'roster'\s*\? <Roster roster=\{roster\} onSelect=\{selectPlayer\} \/>\s*: <SeasonGames games=\{games\} available=\{gamesAvailable\} missing=\{gamesMissing\} \/>/);
});

test('roster keeps headshots and a keyboard-accessible player button', () => {
  assert.match(team, /<PlayerHeadshot playerId=\{player\.id\} name=\{player\.name\}/);
  assert.match(team, /<tr[^>]*onClick=\{\(\) => onSelect\(player\)\}/);
  assert.match(team, /<button type="button"[^>]*>\{player\.name\}<\/button>/);
  assert.match(team, /player\.age \?\? '—'/);
});

const rosterPlayer = {
  id: 2544, name: 'Test Player', position: 'F', age: 25, games_played: 12,
  ppg: 22.26, rpg: 5.14, apg: 6.78, spg: 1.26, bpg: 0.84,
  fg_pct: 45.67, fg3_pct: 37.84, ft_pct: 81.26, fpts: 42.56,
};
const rosterHtml = player => renderComponent(Roster, { roster: [player], onSelect: () => {} });
const statCells = html => [...html.matchAll(/<td\b[^>]*>(.*?)<\/td>/g)].slice(4).map(match => match[1]);

test('rendered roster has all nine stat headers and matching one-decimal cells', () => {
  const html = rosterHtml(rosterPlayer);
  assert.deepEqual([...html.matchAll(/<th\b[^>]*>(.*?)<\/th>/g)].map(match => match[1]),
    ['Player', 'Pos', 'Age', 'GP', 'PPG', 'RPG', 'APG', 'SPG', 'BPG', 'FG%', '3P%', 'FT%', 'FPTS']);
  assert.deepEqual(statCells(html), ['22.3', '5.1', '6.8', '1.3', '0.8', '45.7%', '37.8%', '81.3%', '42.6']);
  assert.match(html, /<button[^>]*type="button"[^>]*>Test Player<\/button>/);
});

test('rendered roster distinguishes missing stats from zero, including shooting and FPTS', () => {
  const fields = ['ppg', 'rpg', 'apg', 'spg', 'bpg', 'fg_pct', 'fg3_pct', 'ft_pct', 'fpts'];
  for (const value of [undefined, null, 0]) {
    const player = { ...rosterPlayer, ...Object.fromEntries(fields.map(key => [key, value])) };
    assert.deepEqual(statCells(rosterHtml(player)), value === 0
      ? ['0.0', '0.0', '0.0', '0.0', '0.0', '0.0%', '0.0%', '0.0%', '0.0']
      : Array(9).fill('—'));
  }
});

test('FPTS header describes the saved scoring while displaying the API total unchanged', t => {
  const stored = new Map();
  t.mock.method(globalThis.localStorage, 'getItem', key => stored.get(key) ?? null);
  const title = () => rosterHtml(rosterPlayer).match(/<th\b[^>]*title="([^"]*)"[^>]*>FPTS<\/th>/)?.[1];
  const fanDuel = 'FanDuel fantasy points: PTS + 1.2 REB + 1.5 AST + 3 STL + 3 BLK − TOV';
  assert.equal(title(), fanDuel);
  stored.set('authToken', 'test-token');
  for (const [scoring, expected] of [
    [{ label: 'ESPN Points', weights: { pts: 1, reb: 1, ast: 2, stl: 4, blk: 4, tov: -2 } },
      'ESPN Points fantasy points: PTS + REB + 2 AST + 4 STL + 4 BLK − 2 TOV'],
    [{ label: 'Custom', weights: { pts: 2, reb: 0, ast: 0, stl: 0, blk: 0, tov: -1 } },
      'Custom fantasy points: 2 PTS − TOV'],
  ]) {
    stored.set('user', JSON.stringify({ fantasy_scoring: scoring }));
    assert.equal(title(), expected);
    assert.equal(statCells(rosterHtml(rosterPlayer)).at(-1), '42.6');
  }
  stored.delete('authToken');
  assert.equal(title(), fanDuel, 'signed-out users ignore a stale saved scoring preference');
});

test('roster selection fetches existing modal details with fallback and close handling', () => {
  assert.match(team, /<Roster roster=\{roster\} onSelect=\{selectPlayer\}/);
  assert.match(team, /setPlayer\(await fetchPlayerDetails\(fallback, controller\.signal\)\)/);
  assert.match(team, /reason\.name !== 'AbortError'\) setPlayer\(buildPlayerFallback\(fallback\)\)/);
  assert.match(team, /pts: selected\.ppg, reb: selected\.rpg, ast: selected\.apg/);
  assert.match(team, /<PlayerStatsModal player=\{player\} loading=\{playerLoading\} onClose=\{closePlayer\}/);
  assert.match(team, /const closePlayer[\s\S]*?playerRequestRef\.current\?\.abort\(\)[\s\S]*?setPlayerLoading\(false\)[\s\S]*?setPlayer\(null\)/);
});

test('complete season games render links, venue, scores and chronological running records', () => {
  const html = renderComponent(SeasonGames, { games: archivedGames, available: true });
  assert.doesNotMatch(html, /<(?:table|thead|tbody|tr|td|th)\b|tp-games-note/);
  for (const label of ['Date', 'Opponent', 'Result', 'Record']) {
    assert.match(html, new RegExp(`<span[^>]*>${label}</span>`));
  }
  assert.deepEqual([...html.matchAll(/class="tp-game-record"[^>]*>(.*?)<\/span>/g)].map(m => m[1]),
    ['Record', '1-1', '0-1']);
  assert.match(html, /<ul class="tp-games">/);
  assert.match(html, /href="\/teams\/BOS"/);
  assert.match(html, /href="\/games\/401"/);
  assert.match(html, /class="tp-venue">vs<\/span>/);
  assert.match(html, /class="tp-venue">@<\/span>/);
  assert.match(html, /class="tp-score"[^>]*>120-100<\/span>/);
});

test('each scored game line has only sibling opponent and game links, with no extra click targets', () => {
  const line = seasonGames.match(/<li\b[\s\S]*?<\/li>/)?.[0];
  assert.ok(line, 'a game is a list item');
  const links = [...line.matchAll(/<Link\b[\s\S]*?<\/Link>/g)].map(match => match[0]);
  assert.equal(links.length, 2, 'exactly two links in a scored line');
  assert.match(links[0], /to=\{getTeamPath\(game\.opponent\)\} className="tp-opponent"/);
  assert.match(links[1], /to=\{getGameDetailPath\(game\.game_id\)\} className="tp-game-link"/);
  for (const link of links) assert.equal((link.match(/<Link\b/g) || []).length, 1, 'links must not nest');
  assert.doesNotMatch(line, /<(?:a|button|input|select|textarea|summary)\b|\bon(?:Click|KeyDown|KeyUp|PointerDown|MouseDown)=|\b(?:tabIndex|role)=/);
  assert.match(links[1], /aria-label=\{`\$\{game\.result === 'W' \? 'Win' : 'Loss'\} \$\{formatScore\(game\)\}[\s\S]*\$\{game\.opponent_name \|\| game\.opponent\}, \$\{formatDate\(game\.date\)\}\. Open game\.`\}/);
});

test('a game without a score has no game link, linked marker or arrow', () => {
  assert.match(seasonGames, /data-linked=\{game\.score \? '' : undefined\}/);
  assert.match(seasonGames, /\{game\.score \? \(\s*<Link to=\{getGameDetailPath\(game\.game_id\)\}[\s\S]*?<\/Link>\s*\) : <span className="tp-result">—<\/span>\}/);
  assert.match(seasonGames, /className="tp-game-arrow" aria-hidden="true">\{game\.score \? '→' : ''\}/);
});

test('the game link covers the whole relative line and the opponent remains above it', () => {
  assert.match(css, /\.tp-game\s*\{[^}]*position:\s*relative\s*;/);
  const overlay = css.match(/\.tp-game-link::after\s*\{([^}]*)\}/)?.[1];
  assert.ok(overlay, 'the game link needs a generated overlay');
  assert.match(overlay, /content:\s*['"]{2}\s*;/);
  assert.match(overlay, /position:\s*absolute\s*;/);
  assert.match(overlay, /inset:\s*0\s*;/);
  const link = css.match(/\.tp-game-link\s*\{([^}]*)\}/)?.[1];
  assert.ok(link);
  assert.doesNotMatch(link, /position:\s*(?:relative|absolute|fixed|sticky)\b/, 'the li must remain the overlay containing block');
  assert.doesNotMatch(overlay, /pointer-events:\s*none/, 'the overlay must receive clicks');
  const opponent = css.match(/\.tp-opponent\s*\{([^}]*)\}/)?.[1];
  assert.ok(opponent);
  assert.match(opponent, /position:\s*relative\s*;/);
  assert.match(opponent, /z-index:\s*1\s*;/);
  assert.match(css, /\.tp-game-link:focus-visible::after\s*\{[^}]*outline:\s*2px solid/);
  assert.match(css, /\.tp-opponent:focus-visible/);
});

test('headshot swaps failed or absent URLs for a silhouette and resets on URL change', () => {
  assert.match(headshot, /getHeadshotUrl\(playerId, size\)/);
  assert.match(headshot, /url && !failed \?/);
  assert.match(headshot, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(headshot, /useEffect\(\(\) => setFailed\(false\), \[url\]\)/);
  assert.match(headshot, /<svg[^>]*className="player-headshot-fallback"[^>]*role="img"[^>]*aria-label=/);
  assert.match(headshot, /<circle/);
  assert.match(headshot, /<path/);
  assert.match(headshot, /<img[^>]*alt=""[^>]*loading="lazy"/);
});

test('roster table scrolls on narrow screens and headshots keep their crop', () => {
  assert.match(css, /\.tp-table-wrap\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /\.tp-player-name:focus-visible/);
  assert.match(readFrontend('src/components/PlayerHeadshot.css'),
    /\.player-headshot img\s*\{[^}]*object-fit:\s*cover;[^}]*object-position:\s*center top/);
});

test('responsive rules stack the banner and leaders and replace opponent names with tricodes', () => {
  const tablet = css.slice(css.indexOf('@media (max-width: 860px)'), css.indexOf('@media (max-width: 640px)'));
  const mobile = css.slice(css.indexOf('@media (max-width: 640px)'), css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(tablet, /\.tp-hero\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(mobile, /\.tp-leaders\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(mobile, /\.tp-tabs\s*\{[^}]*width:\s*100%/);
  assert.match(mobile, /\.tp-game\s*\{[^}]*grid-template-columns:\s*5\.5rem minmax\(0, 1fr\) auto/);
  assert.match(mobile, /\.tp-game-record,\s*\.tp-game-arrow,\s*\.tp-games-head span:nth-child\(n \+ 4\)\s*\{\s*display:\s*none/);
  assert.match(mobile, /\.tp-opponent-name\s*\{\s*display:\s*none/);
  assert.match(mobile, /\.tp-opponent-tricode\s*\{\s*display:\s*inline/);
});

test('leaders and tabs have focus feedback and reduced motion disables card and arrow animation', () => {
  assert.match(css, /\.tp-leader:focus-visible\s*\{[^}]*border-color:/);
  assert.match(css, /\.tp-tab:focus-visible\s*\{[^}]*outline:\s*2px solid/);
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduced, /\.tp-leader,\s*\.tp-tab,\s*\.tp-game-arrow\s*\{\s*transition:\s*none/);
  assert.match(reduced, /\.tp-leader:hover,\s*\.tp-leader:active\s*\{\s*transform:\s*none/);
});

const archivedGames = Object.freeze([
  Object.freeze({ game_id: '401', date: '2026-03-11', season_type: 2, result: 'W', score: '120-100',
    is_home: true, opponent: 'BOS', opponent_name: 'Boston Celtics' }),
  Object.freeze({ game_id: '400', date: '2026-03-09', season_type: 2, result: 'L', score: '90-100',
    is_home: false, opponent: 'DAL', opponent_name: 'Dallas Mavericks' }),
]);
const standingsRecord = { wins: 20, losses: 10, source: 'standings', home: '12-3', away: '8-7', streak: 'L4' };
const heroProps = (overrides = {}) => ({
  team: { city: 'Los Angeles', name: 'Lakers' }, seasonLabel: '2025-26',
  record: { wins: 1, losses: 1, source: 'archive' }, games: archivedGames,
  gamesAvailable: true, gamesMissing: 0, ...overrides,
});

test('partial archive banner prefers standings record, splits and streak and explains limited averages', () => {
  const html = renderComponent(TeamHero, heroProps({ record: standingsRecord, gamesMissing: 28 }));
  assert.match(html, /class="tp-record"[^>]*>20-10<\/span>/);
  assert.match(html, /<dt>Home<\/dt><dd[^>]*>12-3<\/dd>/);
  assert.match(html, /<dt>Away<\/dt><dd[^>]*>8-7<\/dd>/);
  assert.match(html, /class="tp-streak" data-result="L"[^>]*>L4<\/span>/);
  assert.match(html, /class="tp-partial">Record from the standings\./);
  assert.match(html, /2 archived games only \(28 missing\)/);
  assert.match(html, /<dt>PPG<\/dt><dd[^>]*>105.0<\/dd>/);
  assert.match(html, /aria-label="Last 2 games, oldest first: L W"/);
});

test('standings still display when the database is down, without a partial-archive note', () => {
  const html = renderComponent(TeamHero, heroProps({
    record: standingsRecord, games: [], gamesAvailable: false, gamesMissing: 30,
  }));
  assert.match(html, /class="tp-record"[^>]*>20-10<\/span>/);
  assert.match(html, /<dt>Home<\/dt><dd[^>]*>12-3<\/dd>/);
  assert.match(html, /<dt>Away<\/dt><dd[^>]*>8-7<\/dd>/);
  assert.match(html, /class="tp-streak"[^>]*>L4<\/span>/);
  assert.match(html, /<dt>PPG<\/dt><dd[^>]*>—<\/dd>/);
  assert.match(html, /<dt>Opp PPG<\/dt><dd[^>]*>—<\/dd>/);
  assert.doesNotMatch(html, /tp-partial|tp-form/);
});

test('missing standings splits use archive summaries when available and dashes during an outage', () => {
  const record = { wins: 20, losses: 10, source: 'standings', home: null, away: null, streak: null };
  const html = renderComponent(TeamHero, heroProps({ record, gamesMissing: 28 }));
  assert.match(html, /<dt>Home<\/dt><dd[^>]*>1-0<\/dd>/);
  assert.match(html, /<dt>Away<\/dt><dd[^>]*>0-1<\/dd>/);
  assert.match(html, /class="tp-streak"[^>]*>W1<\/span>/);
  const unavailable = renderComponent(TeamHero, heroProps({ record, games: [], gamesAvailable: false }));
  assert.match(unavailable, /<dt>Home<\/dt><dd[^>]*>—<\/dd>/);
  assert.match(unavailable, /<dt>Away<\/dt><dd[^>]*>—<\/dd>/);
  assert.doesNotMatch(unavailable, /tp-streak/);
});

test('archive outage without standings hides the zero record while an empty available archive shows it', () => {
  for (const gamesAvailable of [true, false]) {
    const html = renderComponent(TeamHero, heroProps({
      record: { wins: 0, losses: 0, source: 'archive' }, games: [], gamesAvailable,
    }));
    assert.match(html, new RegExp(`class="tp-record"[^>]*>${gamesAvailable ? '0-0' : '—'}</span>`));
    assert.doesNotMatch(html, /tp-partial|tp-streak|tp-form/);
  }
});

test('partial season games show the archive count and blank every running record including the header', () => {
  const html = renderComponent(SeasonGames, { games: archivedGames, available: true, missing: 28 });
  assert.match(html, /class="tp-games-note">Showing 2 of 30 games\./);
  assert.deepEqual([...html.matchAll(/class="tp-game-record"[^>]*>(.*?)<\/span>/g)].map(m => m[1]), ['', '', '']);
  assert.match(html, /href="\/games\/401"/);
  assert.match(html, /class="tp-score"[^>]*>120-100<\/span>/);
  assert.equal(archivedGames.some(game => Object.hasOwn(game, 'record')), false);
});

test('empty partial archive distinguishes missing games from a season with no games played', () => {
  const html = renderComponent(SeasonGames, { games: [], available: true, missing: 30 });
  assert.match(html, /None of this season&#x27;s 30 games are archived yet\./);
  assert.doesNotMatch(html, /No games played|tp-games-note|tp-game-record/);
});

test('listed player renders zero games and nine unavailable stats', () => {
  const player = { id: 900000001, name: 'Inactive Rookie', position: 'F', age: null, games_played: 0,
    ...Object.fromEntries(['ppg', 'rpg', 'apg', 'spg', 'bpg', 'fg_pct', 'fg3_pct', 'ft_pct', 'fpts'].map(key => [key, null])) };
  const html = rosterHtml(player);
  assert.deepEqual(statCells(html), Array(9).fill('—'));
  assert.match(html, /<td>F<\/td><td>—<\/td><td>0<\/td>/);
  assert.match(html, /<button[^>]*>Inactive Rookie<\/button>/);
});

// Capture callbacks from the actual page with inert hooks; no effects, DOM or network run.
// Its real fetchPlayerDetails and buildPlayerFallback remain bundled and execute normally.
function teamCallbacks() {
  const callbacks = [];
  const stateWrites = [];
  const { default: Team } = loadFrontendModule('src/pages/Team.jsx', [], {
    react: { ...React,
      useState: initial => {
        const writes = [];
        stateWrites.push(writes);
        return [initial, value => writes.push(value)];
      },
      useEffect: () => {},
      useRef: value => ({ current: value }),
      useCallback: callback => { callbacks.push(callback); return callback; },
    },
    'react-router-dom': { ...Router, useParams: () => ({ tricode: 'lal' }) },
  });
  Team();
  return { selectPlayer: callbacks[1], playerWrites: stateWrites[2], loadingWrites: stateWrites[3] };
}

test('team selection preserves every roster fallback stat on failed or unmatched detail requests', async t => {
  for (const response of ['network failure', 'http failure', 'no match']) {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
      if (response === 'network failure') throw new Error('offline');
      return { ok: response !== 'http failure', json: async () => ({ players: [] }) };
    });
    const { selectPlayer, playerWrites, loadingWrites } = teamCallbacks();
    await selectPlayer(Object.freeze({ ...rosterPlayer }));
    assert.deepEqual(playerWrites.at(-1), {
      id: 2544, name: 'Test Player', team: 'LAL', position: 'F', age: 25,
      current_stats: { ppg: 22.26, rpg: 5.14, apg: 6.78, spg: 1.26, bpg: 0.84,
        fg_pct: 45.67, fg3_pct: 37.84, ft_pct: 81.26, games_played: 12, tov: 0, mpg: 0 },
      ml_stats: null, injury: null, history: {},
    }, response);
    assert.equal(playerWrites[0], null);
    assert.deepEqual(loadingWrites, [true, false]);
    assert.equal(fetchMock.mock.calls.length, 1);
    assert.equal(fetchMock.mock.calls[0].arguments[0], '/api/players/search-all?query=Test%20Player');
    assert.ok(fetchMock.mock.calls[0].arguments[1].signal instanceof AbortSignal);
    fetchMock.mock.restore();
  }
});
