import assert from "node:assert/strict";
import test from "node:test";

import { readFrontend, readRepo, readSource } from "./helpers.mjs";

const gameLog = readSource("PlayerGameLog.jsx");
const gameLogCss = readFrontend("src/components/PlayerGameLog.css");

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
