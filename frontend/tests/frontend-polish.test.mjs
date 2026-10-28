import assert from "node:assert/strict";
import test from "node:test";
import { readSource as readComponent } from "./helpers.mjs";

test("authenticated visitors do not render the final homepage account CTA", () => {
  const source = readComponent("Home.jsx");
  assert.match(source, /\{!isLoggedIn && \(\s*<section className="cta-section">/);
  assert.match(source, /to="\/create-account"/);
  // Logging in moved to the shared header, which every page (Home included) renders.
  assert.match(readComponent("SiteHeader.jsx"), /to="\/login"/);
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
  // The fields themselves are covered by getPredictionCardStats in player-card.test.mjs.
  assert.match(source, /getPredictionCardStats\(player\)/);
  assert.match(source, /<PlayerCard\b[\s\S]*stats=\{main\}/);
  assert.match(source, /<PlayerStatsModal\b/);
  assert.doesNotMatch(source, /toPredictionPageStats/);
});

test("AI predictions use one unified sort field with contextual direction labels", () => {
  const source = readComponent("Predictions.jsx");
  assert.match(source, /<option value="name">Name<\/option>/);
  assert.match(source, /const isNameSort = sortBy === 'name'/);
  assert.match(source, /isNameSort \? 'A to Z' : 'Lowest to Highest'/);
  assert.match(source, /isNameSort \? 'Z to A' : 'Highest to Lowest'/);
  assert.match(source, /order: nextSortBy === 'name' \? 'asc' : 'desc'/);
  assert.match(source, /const handleSortDirectionChange/);
  assert.doesNotMatch(source, /onClick=\{\(\) => handleSort\('name'\)\}/);
});

test("professional sort styling groups both controls and provides focus states", () => {
  const css = readComponent("Predictions.css");
  assert.match(css, /\.sort-control-group\s*\{/);
  assert.match(css, /\.sort-direction-btn:focus-visible\s*\{/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.sort-control-group/);
});
