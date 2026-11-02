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
  assert.match(gameLog, /import \{[^}]*\bformatSeasonTeams\b[^}]*\} from ['"]\.\.\/utils\/gameLog['"]/);
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

test("current season label rolls over on October 1 and the list is not hardcoded", async () => {
  const { currentSeasonLabel } = await import(new URL("../src/utils/gameLog.js", import.meta.url));
  assert.equal(currentSeasonLabel(new Date(2026, 8, 30)), "2025-2026");
  assert.equal(currentSeasonLabel(new Date(2026, 9, 1)), "2026-2027");
  assert.equal(currentSeasonLabel(new Date(2027, 0, 15)), "2026-2027");
  assert.doesNotMatch(gameLog, /'20\d\d-20\d\d'/);
  assert.match(gameLog, /useState\(\(\) => defaultSeason\(history\)\)/);
});

test("absence formatter explains injured seasons", async () => {
  const { formatAbsence } = await import(new URL("../src/utils/gameLog.js", import.meta.url));
  assert.equal(typeof formatAbsence, "function", "absence formatter exists");
  const absence = { reason: "Left ACL surgery", reasons: ["Left ACL surgery"], games_missed: 63 };
  assert.equal(formatAbsence(absence, "2019-2020", ["GSW"]),
    "Did not play in 2019-2020 (GSW) — Left ACL surgery · missed 63 games");
  assert.equal(formatAbsence({ ...absence, reasons: ["Left ACL surgery", "Right achilles tendon surgery"] }, "2019-2020", ["GSW", "BKN"]),
    "Did not play in 2019-2020 (GSW → BKN) — Left ACL surgery, Right achilles tendon surgery · missed 63 games");
  for (const reasons of [undefined, [], "invalid"]) {
    assert.equal(formatAbsence({ ...absence, reasons }, "2019-2020", ["GSW"]),
      "Did not play in 2019-2020 (GSW) — Left ACL surgery · missed 63 games");
  }
  assert.equal(formatAbsence(absence, "2019-2020", []),
    "Did not play in 2019-2020 — Left ACL surgery · missed 63 games");
  assert.equal(formatAbsence({ games_missed: 63 }, "2019-2020", ["GSW"]),
    "Did not play in 2019-2020 (GSW) · missed 63 games");
  assert.equal(formatAbsence({ ...absence, games_missed: 1 }, "2019-2020", ["GSW"]),
    "Did not play in 2019-2020 (GSW) — Left ACL surgery · missed 1 game");
  assert.equal(formatAbsence({ reasons: [null, "", 42, "Left ACL surgery"] }, "2019-2020", ["UNK"]),
    "Did not play in 2019-2020 — Left ACL surgery");
  for (const games_missed of [undefined, null, 0, -1, "63", NaN]) {
    assert.equal(formatAbsence({ games_missed }, "2019-2020", ["GSW"]), "Did not play in 2019-2020 (GSW)");
  }
  for (const invalid of [null, undefined, "injured"]) {
    assert.equal(formatAbsence(invalid, "2019-2020", ["GSW"]), "");
  }
});

test("game log shows the absence message and keeps the generic empty message otherwise", () => {
  assert.match(gameLog, /import \{[^}]*\bformatAbsence\b[^}]*\} from ['"]\.\.\/utils\/gameLog['"]/);
  assert.match(gameLog, /const absenceMessage = isLoading \? '' : formatAbsence\(result\.data\?\.absence, selectedSeason, result\.data\?\.teams\)/);
  assert.match(gameLog, /!games\.length \? \(\s*absenceMessage \? \(\s*<div className="game-log-empty">\{absenceMessage\}<\/div>/);
  assert.match(gameLog, /No games recorded for this player in the \{selectedSeason\} season\./);
});

test("season dropdown starts at the player's first season in history", async () => {
  const { playerSeasons } = await import(new URL("../src/utils/gameLog.js", import.meta.url));
  const seasons = ["2026-2027", "2025-2026", "2024-2025", "2023-2024", "2022-2023", "2021-2022", "2002-2003", "2001-2002"];
  // Rookie drafted in 2022: first season 2022-23 (end year 2023).
  assert.deepEqual(playerSeasons(seasons, { 2023: {}, 2025: {}, 2027: {} }, "2026-2027"), seasons.slice(0, 5));
  // History starting at the pkl's first season may be cut off, so keep every season.
  assert.deepEqual(playerSeasons(seasons, { 2003: {}, 2004: {}, 2027: {} }, "2026-2027"), seasons);
  for (const history of [undefined, null, {}]) assert.deepEqual(playerSeasons(seasons, history, "2026-2027"), seasons);
  assert.match(gameLog, /playerSeasons\(result\.data\?\.available_seasons/);
  assert.match(readSource("PlayerStatsModal.jsx"), /<PlayerGameLog playerId=\{player\.id\} history=\{player\.history\} \/>/);
});

test("retired players' seasons end at their last season and open on it", async () => {
  const { defaultSeason, playerSeasons } = await import(new URL("../src/utils/gameLog.js", import.meta.url));
  const current = "2026-2027";
  const seasons = Array.from({ length: 26 }, (_, i) => `${2026 - i}-${2027 - i}`);
  const span = (from, to) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, {}]));

  // History starting at the pkl's first season keeps the full start; the end stops at 2018-19.
  const dirk = span(2003, 2019);
  assert.deepEqual(playerSeasons(seasons, dirk, current), seasons.filter(s => Number(s.split("-")[1]) <= 2019));
  assert.equal(defaultSeason(dirk, current), "2018-2019");
  // A retired player who started after 2003 is trimmed at both ends.
  assert.deepEqual(playerSeasons(seasons, { 2010: {}, 2015: {} }, current), ["2014-2015", "2013-2014", "2012-2013", "2011-2012", "2010-2011", "2009-2010"]);
  assert.equal(defaultSeason({ 2010: {}, 2015: {} }, current), "2014-2015");

  // Last played last season: may be injured or not have played yet, so the current season stays.
  assert.equal(playerSeasons(seasons, { 2024: {}, 2026: {} }, current)[0], current);
  assert.equal(defaultSeason({ 2024: {}, 2026: {} }, current), current);

  // Active players, rookies and empty history are unchanged.
  assert.deepEqual(playerSeasons(seasons, { 2023: {}, 2025: {}, 2027: {} }, current), seasons.slice(0, 5));
  assert.equal(defaultSeason({ 2023: {}, 2027: {} }, current), current);
  assert.deepEqual(playerSeasons(seasons, { 2027: {} }, current), [current]);
  assert.equal(defaultSeason({ 2027: {} }, current), current);
  for (const history of [undefined, null, {}]) {
    assert.deepEqual(playerSeasons(seasons, history, current), seasons);
    assert.equal(defaultSeason(history, current), current);
  }
});

test("the Current label only marks the real current season", () => {
  assert.match(gameLog, /import \{[^}]*\bdefaultSeason\b[^}]*\} from '\.\.\/utils\/gameLog'/);
  assert.match(gameLog, /label: s === currentSeason \? `\$\{s\} \(Current\)` : s/);
  assert.doesNotMatch(gameLog, /availableSeasons\[0\]/);
});
