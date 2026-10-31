import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readSource } from "./helpers.mjs";

const configPath = new URL("../src/config/predictionStats.js", import.meta.url);
const gridPath = new URL("../src/components/PlayerPredictionGrid.jsx", import.meta.url);

test("prediction config defines all ten metrics", () => {
  const config = readFileSync(configPath, "utf8");
  for (const key of ["ppg", "apg", "rpg", "spg", "bpg", "tov", "mpg", "fg_pct", "fg3_pct", "ft_pct"]) {
    assert.match(config, new RegExp(`key: ["']${key}["']`));
  }
});

test("shared grid labels percentage changes as percentage points", () => {
  const grid = readFileSync(gridPath, "utf8");
  assert.match(grid, /changeUnit === ["']pp["']/);
  assert.match(grid, /PlayerPredictionGrid/);
});

const consumers = [
  "Home.jsx",
  "Stats.jsx",
  "PlayerStatsModal.jsx",
  "Favourites.jsx",
  "Recommendations.jsx",
  "RecommendationChart.jsx",
  "Predictions.jsx",
];

test("every player popup uses the shared prediction grid", () => {
  assert.match(readSource("PlayerStatsModal.jsx"), /PlayerPredictionGrid/);
  for (const filename of consumers.filter(name => name !== "PlayerStatsModal.jsx")) {
    const source = readSource(filename);
    assert.match(source, /<PlayerStatsModal\b/, filename);
    assert.doesNotMatch(source, /stats-modal-tab-btn/, `${filename} should not inline the popup`);
  }
});

test("player popup has a game log tab backed by the per-player games endpoint", () => {
  assert.match(readSource("PlayerStatsModal.jsx"), /\['games', 'Game Log'\][\s\S]*<PlayerGameLog playerId=\{player\.id\}/);
  assert.match(readSource("PlayerGameLog.jsx"), /players\/\$\{playerId\}\/games/);
});

test("legacy three-stat popup loops are gone", () => {
  for (const filename of consumers) {
    const source = readSource(filename);
    assert.doesNotMatch(source, /\[['"]ppg['"], ['"]apg['"], ['"]rpg['"]\]\.map/, filename);
  }
});

test("home AI panel exposes steals and blocks tabs", () => {
  const source = readSource("AIPredictions.jsx");
  assert.match(source, /top_steals/);
  assert.match(source, /top_blocks/);
  // Each tab's card leads with the stat it ranks by (fields mapped in getLeaderCardStats).
  assert.match(source, /id: 'steals', label: 'Top Steals', lead: 'spg'/);
  assert.match(source, /id: 'blocks', label: 'Top Blocks', lead: 'bpg'/);
});

test("popup predictions compare against this season so far and work out the change themselves", () => {
  const modal = readSource("PlayerStatsModal.jsx");
  assert.match(modal, /Predicted · change vs this season/);
  assert.match(modal, /currentStats=\{player\.ml_stats\.so_far_stats\}/);
  assert.doesNotMatch(modal, /improvements=/, "the model's improvements are measured against last season");
  const grid = readFileSync(gridPath, "utf8");
  assert.match(grid, /hasCurrent/, "a player with no games this season shows no change");
});
