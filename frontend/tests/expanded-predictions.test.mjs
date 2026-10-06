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
  for (const filename of consumers) {
    const source = readSource(filename);
    assert.match(source, /PlayerPredictionGrid/, filename);
  }
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
  assert.match(source, /PREDICTED_SPG/);
  assert.match(source, /PREDICTED_BPG/);
});
