import assert from "node:assert/strict";
import test from "node:test";
import { readFrontend, readSource } from "./helpers.mjs";
import {
  formatLine, formatSlateDate, formatTipoff, getGameCardStats, getGameModelEdge,
  getGamePredictionsHeroStats, getPickLine, sortStatKey, teamsForGames,
} from "../src/utils/gamePredictions.js";

const player = {
  name: "Test Player", team: "DEN", opponent: "NOP", is_home: false,
  predicted_pts: 24.4, last10_pts: 26.2, predicted_reb: 4.0, last10_reb: 4.0,
  predicted_ast: 7.1, last10_ast: 6.0, predicted_fantasy: 40.2, last10_fantasy: 41.0,
  predicted_fg3m: 2.5, last10_fg3m: 3.0, predicted_stl: 1, last10_stl: 1, predicted_blk: 0.3, last10_blk: 0.2,
  predicted_minutes: 34, last10_minutes: 35, predicted_pra: 35.5, last10_pra: 36.2,
};

test("tip-off is shown in Eastern time; bad input is TBD", () => {
  assert.equal(formatTipoff("2026-11-15T00:30Z"), "7:30 PM ET");
  assert.equal(formatTipoff(""), "TBD");
  assert.equal(formatTipoff("nonsense"), "TBD");
});

test("slate date keeps its calendar day in any timezone", () => {
  assert.equal(formatSlateDate("2026-11-14"), "Sat, Nov 14");
  assert.equal(formatSlateDate(null), "—");
});

test("betting line names the favourite from the home spread", () => {
  assert.equal(formatLine({ home: "NOP", away: "DEN", spread: 10.5, over_under: 234.5 }), "DEN −10.5 · O/U 234.5");
  assert.equal(formatLine({ home: "CLE", away: "DAL", spread: -3, over_under: null }), "CLE −3");
  assert.equal(formatLine({ home: "A", away: "B", spread: 0 }), "PK");
  assert.equal(formatLine({ home: "A", away: "B" }), "");
});

test("cards show projections with the change against the last-10 average", () => {
  const { main, extra } = getGameCardStats(player);
  assert.deepEqual(main.map(stat => stat.label), ["PTS", "REB", "AST", "FPTS"]);
  assert.deepEqual(main[0], { key: "pts", label: "PTS", value: "24.4", delta: { text: "−1.8", direction: "down" } });
  assert.equal(main[1].delta.direction, "flat");
  assert.deepEqual(extra.map(stat => stat.label), ["3PM", "STL", "BLK", "TOV", "MIN", "PRA"]);
});

test("a card sorted by another stat leads with it and drops it from the extras", () => {
  const { main, extra } = getGameCardStats(player, "fg3m");
  assert.deepEqual(main.map(stat => stat.key), ["fg3m", "pts", "reb", "ast"]);
  assert.deepEqual(extra.map(stat => stat.key), ["stl", "blk", "tov", "minutes", "pra", "fantasy"]);
});

test("sort params map back to their stat", () => {
  assert.equal(sortStatKey("predicted_reb"), "reb");
  assert.equal(sortStatKey("diff_pra"), "pra");
  assert.equal(sortStatKey("name"), "pts");
  assert.equal(sortStatKey("predicted_bogus"), "pts");
});

test("pick line shows projection, average and a signed difference", () => {
  assert.deepEqual(getPickLine(player, "ast"), { predicted: "7.1", average: "6.0", diff: { text: "+1.1", up: true } });
  assert.deepEqual(getPickLine({ predicted_ast: 3 }, "ast"), { predicted: "3.0", average: "—", diff: null });
});

test("model edge comes from the cache's held-out accuracy, or null without it", () => {
  const edge = getGameModelEdge({ pts: { mae: 4.56, naive_mae: 4.76, improvement_pct: 4.19 }, reb: { mae: 1.86, naive_mae: 1.93 } });
  assert.equal(edge.pointsEdge, 4);
  assert.deepEqual(edge.stats, [{ key: "pts", label: "PTS", miss: "4.6" }, { key: "reb", label: "REB", miss: "1.9" }]);
  assert.equal(getGameModelEdge({}), null);
  assert.equal(getGameModelEdge(undefined), null);
});

test("hero strip shows placeholders until the first response", () => {
  assert.ok(getGamePredictionsHeroStats({ ready: false }).every(stat => stat.value === "—"));
  const stats = getGamePredictionsHeroStats({ ready: true, slateDate: "2026-11-14", games: 5, total: 152, sort: "diff_pts", order: "desc" });
  assert.deepEqual(stats.map(stat => stat.value), ["Sat, Nov 14", "5", "152", "Δ PTS ↓"]);
});

test("both modes are routes, with the static /recommendations/games ahead of :stat", () => {
  const app = readFrontend("src/App.jsx");
  assert.match(app, /path="\/predictions\/games" element=\{<GamePredictions \/>\}/);
  assert.match(app, /path="\/recommendations\/games" element=\{<GameRecommendations \/>\}/);
  for (const [file, base, mode] of [
    ["Predictions.jsx", "/predictions", "season"], ["Recommendations.jsx", "/recommendations", "season"],
    ["GamePredictions.jsx", "/predictions", "games"], ["GameRecommendations.jsx", "/recommendations", "games"],
  ]) {
    assert.match(readSource(file), new RegExp(`<PredictionModeToggle base="${base}" value="${mode}" />`), file);
  }
});

test("home page has the next-game section", () => {
  const home = readSource("Home.jsx");
  assert.match(home, /<NextGamePreview onPlayerClick=\{handlePlayerClick\} onLoaded=\{setNextGameLoaded\} \/>/);
  assert.match(readSource("NextGamePreview.jsx"), /to="\/recommendations\/games"/);
});

test("a stale slate is called out on both pages and hidden on the home page", () => {
  assert.match(readSource("StaleSlateNotice.jsx"), /if \(!data\?\.stale\) return null;/);
  for (const file of ["GamePredictions.jsx", "GameRecommendations.jsx"]) {
    assert.match(readSource(file), /<StaleSlateNotice data=\{data\} \/>/, file);
  }
  assert.match(readSource("NextGamePreview.jsx"), /if \(!players\.length \|\| data\.stale\) return actions;/);
});

test("the popup's Game projections tab compares last-10 averages with the prediction", async () => {
  const { toGameGridStats } = await import("../src/utils/gamePredictions.js");
  const { currentStats, predictionStats } = toGameGridStats({ ...player, last10_reb: null });
  assert.equal(currentStats.pts, 26.2);
  assert.equal(predictionStats.pts, 24.4);
  assert.equal(currentStats.reb, null);              // shown as "—", not 0
  assert.equal(predictionStats.fantasy, 40.2);
  const modal = readSource("PlayerStatsModal.jsx");
  assert.match(modal, /\['next-game', 'Game projections'\]/);
  assert.match(modal, /<PlayerNextGame player=\{player\} returnTo=\{returnTo\} \/>/);
  assert.match(readSource("PlayerNextGame.jsx"), /groups=\{GAME_PREDICTION_GROUPS\}/);
});

test("per-game views show team logos instead of tricodes", () => {
  const matchup = readSource("GameMatchup.jsx");
  assert.match(matchup, /alt=\{tricode\} title=\{tricode\}/);              // still named for screen readers
  assert.match(matchup, /onError=\{\(\) => setFailed\(true\)\}/);           // falls back to the tricode
  assert.match(readSource("GamePredictions.jsx"), /<GameMatchup game=\{game\} size="lg" \/>/);
  for (const file of ["GamePredictions.jsx", "NextGamePreview.jsx", "GameRecommendations.jsx"]) {
    assert.match(readSource(file), /<GameMatchup player=\{player\}( size="md")? \/>/, file);
    assert.doesNotMatch(readSource(file), /formatMatchup|name: player\.name, team: player\.team, position: player\.position \}\}/, file);
  }
  assert.match(readSource("PlayerNextGame.jsx"), /<GameMatchup player=\{prediction\} size="md" \/>/);
});

test("team filter lists only the selected game's teams", () => {
  const games = [{ game_id: "1", away: "DEN", home: "NOP" }, { game_id: "2", away: "DAL", home: "CLE" }];
  assert.deepEqual(teamsForGames(games), ["CLE", "DAL", "DEN", "NOP"]);
  assert.deepEqual(teamsForGames(games, "2"), ["CLE", "DAL"]);
  assert.deepEqual(teamsForGames(games, "missing"), []);
  assert.deepEqual(teamsForGames(undefined), []);
  const page = readSource("GamePredictions.jsx");
  assert.match(page, /options: teamOptions/);
  assert.match(page, /team: team && !teamsForGames\(games, nextGameId\)\.includes\(team\) \? '' : team/);
});
