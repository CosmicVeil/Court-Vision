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
