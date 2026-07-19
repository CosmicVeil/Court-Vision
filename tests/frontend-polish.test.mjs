import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readComponent = (filename) => readFileSync(
  new URL(`../src/components/${filename}`, import.meta.url),
  "utf8",
);

test("authenticated visitors do not render the final homepage account CTA", () => {
  const source = readComponent("home.jsx");
  assert.match(source, /\{!isLoggedIn && \(\s*<section className="cta-section">/);
  assert.match(source, /to="\/login"/);
  assert.match(source, /to="\/create-account"/);
});

test("recommendation percentage badges use sign-aware classes", () => {
  const recommendations = readComponent("Recommendations.jsx");
  const chart = readComponent("RecommendationChart.jsx");

  assert.match(recommendations, /spotlight-growth-badge \$\{improvement >= 0 \? 'positive' : 'negative'\}/);
  assert.match(recommendations, /spotlight-stat-growth \$\{impVal >= 0 \? 'positive' : 'negative'\}/);
  assert.match(recommendations, /\{improvement >= 0 \? '\+' : ''\}\{improvement\.toFixed\(1\)\}/);
  assert.match(chart, /growth-callout \$\{improvement >= 0 \? 'positive' : 'negative'\}/);
});

test("negative recommendation modifiers use the red palette", () => {
  const css = readComponent("Recommendations.css");
  assert.match(css, /\.spotlight-growth-badge\.negative\s*\{[^}]*color:\s*#f87171/s);
  assert.match(css, /\.spotlight-stat-growth\.negative\s*\{[^}]*color:\s*#f87171/s);
  assert.match(css, /\.growth-callout\.negative\s*\{[^}]*color:\s*#f87171/s);
});

test("AI prediction list cards show the three main predicted stats", () => {
  const source = readComponent("Predictions.jsx");
  for (const field of ["predicted_ppg", "predicted_apg", "predicted_rpg"]) {
    assert.match(source, new RegExp(`key: ['"]${field}['"]`));
  }
  assert.match(source, /prediction-card-main-stats/);
  assert.match(source, /modalTab === 'predictions'[\s\S]*PlayerPredictionGrid/);
  assert.doesNotMatch(source, /toPredictionPageStats/);
});

test("AI prediction card identity and badges are centered", () => {
  const css = readComponent("Predictions.css");
  assert.match(css, /\.prediction-card \.player-meta\s*\{[^}]*flex-direction:\s*column[^}]*align-items:\s*center[^}]*text-align:\s*center/s);
  assert.match(css, /\.prediction-card \.player-badges\s*\{[^}]*justify-content:\s*center/s);
  assert.match(css, /\.team-badge,\s*\.position-badge,\s*\.age-badge\s*\{[^}]*align-items:\s*center[^}]*justify-content:\s*center/s);
});

test("AI predictions use one unified sort field with contextual direction labels", () => {
  const source = readComponent("Predictions.jsx");
  assert.match(source, /<option value="name">Name<\/option>/);
  assert.match(source, /const isNameSort = sortBy === 'name'/);
  assert.match(source, /isNameSort \? 'A to Z' : 'Lowest to Highest'/);
  assert.match(source, /isNameSort \? 'Z to A' : 'Highest to Lowest'/);
  assert.match(source, /setSortOrder\(nextSortBy === 'name' \? 'asc' : 'desc'\)/);
  assert.match(source, /const handleSortDirectionChange/);
  assert.doesNotMatch(source, /onClick=\{\(\) => handleSort\('name'\)\}/);
});

test("professional sort styling groups both controls and provides focus states", () => {
  const css = readComponent("Predictions.css");
  assert.match(css, /\.sort-control-group\s*\{/);
  assert.match(css, /\.sort-direction-btn:focus-visible\s*\{/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.sort-control-group/);
});
