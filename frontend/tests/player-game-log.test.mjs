import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";

import { readFrontend, readRepo, readSource } from "./helpers.mjs";

const gameLog = readSource("PlayerGameLog.jsx");
const gameLogCss = readFrontend("src/components/PlayerGameLog.css");

test("season type lookup maps preseason, playoff and play-in labels and modifiers", () => {
  assert.match(gameLog, /1:\s*\{\s*label:\s*'PRE',\s*modifier:\s*'pre'/);
  assert.match(gameLog, /3:\s*\{\s*label:\s*'POST',\s*modifier:\s*'post'/);
  assert.match(gameLog, /5:\s*\{\s*label:\s*'PLAY-IN',\s*modifier:\s*'playin'/);
  assert.doesNotMatch(gameLog, /2:\s*\{\s*label:/);
});

test("season tags use the lookup, base class and modifier in the Date cell", () => {
  assert.match(gameLog, /const tag = SEASON_TYPE_TAGS\[type\]/);
  assert.match(gameLog, /return tag && <span/);
  assert.match(gameLog, /className=\{`game-log-tag game-log-tag--\$\{tag\.modifier\}`\}>\{tag\.label\}/);
  assert.match(gameLog, /<td>\{formatDate\(game\.date\)\}\{seasonTag\(game\.season_type\)\}<\/td>/);
  assert.doesNotMatch(gameLog, /season_type === 1 &&/);
});

test("playoff tags use the ember accent while PRE stays muted", () => {
  assert.match(gameLogCss, /\.game-log-tag--post[^{]*\{[^}]*color:\s*var\(--color-ember-orange\)/);
  assert.match(gameLogCss, /\.game-log-tag--playin[^{]*\{[^}]*color:\s*var\(--color-ember-orange\)/);
  assert.match(gameLogCss, /\.game-log-tag--post[^{]*\{[^}]*border-color:\s*rgba\(255,\s*100,\s*54,\s*0\.45\)/);
  assert.match(gameLogCss, /\.game-log-tag--playin[^{]*\{[^}]*border-color:\s*rgba\(255,\s*100,\s*54,\s*0\.45\)/);
  assert.match(gameLogCss, /\.game-log-tag\s*\{[^}]*color:\s*var\(--color-stone\)[^}]*border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.12\)/);
});

test("season teams preserve trade order and omit unknown or missing teams", async () => {
  const helperUrl = new URL("../src/utils/gameLog.js", import.meta.url);
  assert.ok(existsSync(helperUrl), "season team formatter exists");
  const { formatSeasonTeams } = await import(helperUrl);
  assert.equal(formatSeasonTeams(["LAL", "DAL"]), "LAL → DAL");
  assert.equal(formatSeasonTeams(["LAL"]), "LAL");
  assert.equal(formatSeasonTeams([null, "LAL", "UNK", "", 42, "DAL"]), "LAL → DAL");
  for (const teams of [[], undefined, null, "LAL", {}, ["UNK"], ["", "UNK"]]) {
    assert.equal(formatSeasonTeams(teams), "");
  }
});

test("games show the player's team before the opponent with an unknown placeholder", () => {
  assert.match(gameLog, /<th>Team<\/th>\s*<th>Opp<\/th>/);
  assert.match(gameLog, /<td className="game-log-team">\{game\.team && game\.team !== 'UNK' \? game\.team : '—'\}<\/td>\s*<td>\{game\.is_home/);
  assert.match(gameLog, /colSpan=\{11\}/);
});

test("season badge shows formatted teams only after the selected season loads", () => {
  assert.match(gameLog, /import \{ formatSeasonTeams \} from ['"]\.\.\/utils\/gameLog['"]/);
  assert.match(gameLog, /const seasonTeams = isLoading \? '' : formatSeasonTeams\(result\.data\?\.teams\)/);
  assert.match(gameLog, /Season: <strong>\{seasonDisplay\}<\/strong>\s*\{seasonTeams && <span className="game-log-season-teams"> · \{seasonTeams\}<\/span>\}/);
});

test("team labels use the existing orange and monospace styling", () => {
  assert.match(gameLogCss, /\.game-log-season-teams\s*\{[^}]*color:\s*var\(--color-ember-orange, #ff6436\)[^}]*font-weight:\s*700/);
  assert.match(gameLogCss, /\.stats-history-table td\.game-log-team\s*\{[^}]*font-family:\s*var\(--font-mono\)[^}]*font-weight:\s*600/);
});

test("game log requests the full season", () => {
  assert.match(gameLog, /SEASON_GAME_LIMIT = 200/);
  assert.match(gameLog, /games\?limit=\$\{SEASON_GAME_LIMIT\}/);
  assert.doesNotMatch(gameLog, /limit=10\b|GAME_LIMIT = 10/);
});

test("frontend full-season limit matches the backend clamp", () => {
  assert.match(readRepo("backend/app/api/routes/players.py"), /MAX_GAME_LOG_LIMIT = 200/);
});

test("games table sits in one dedicated scroll container", () => {
  assert.match(gameLog, /className="stats-history-scroll-box game-log-scroll"[\s\S]*?<table className="stats-history-table">[\s\S]*?games\.map/);
});

test("game log scroll container supports both axes", () => {
  assert.match(gameLogCss, /\.stats-history-scroll-box\.game-log-scroll\s*\{[^}]*max-height:\s*360px[^}]*overflow:\s*auto/);
});

test("game log column headers are sticky with an opaque background", () => {
  assert.match(gameLogCss, /\.game-log-scroll[^{]*th\s*\{[^}]*position:\s*sticky[^}]*top:\s*0[^}]*background:[^}]*var\(--color-graphite/);
});

test("heading reflects the full list while Recent Form stays separate", () => {
  assert.match(gameLog, /All Games \(\{games\.length\}\)/);
  assert.doesNotMatch(gameLog, /Last \{games\.length\} Games/);
  assert.match(gameLog, /Recent Form/);
  assert.match(gameLog, /game-log-averages/);
  assert.ok(gameLog.indexOf("game-log-averages") < gameLog.indexOf("game-log-scroll"));
});
