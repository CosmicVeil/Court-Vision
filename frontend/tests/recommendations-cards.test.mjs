import assert from "node:assert/strict";
import test from "node:test";
import { readSource } from "./helpers.mjs";

const radar = readSource("Recommendations.jsx");
const chart = readSource("RecommendationChart.jsx");
const css = readSource("Recommendations.css");

test("the radar page renders its one section directly, with no single-tab bar", () => {
  assert.doesNotMatch(radar, /category-tabs|tab-button|selectedCategory/);
  assert.doesNotMatch(css, /\.category-tabs/);
  assert.match(radar, /<div className="recommendations-section">/);
});

test("clickable player cards open from a real button, not a div onClick", () => {
  for (const [name, source] of [["Recommendations.jsx", radar], ["RecommendationChart.jsx", chart]]) {
    assert.match(source, /<button\s+type="button"\s+className="card-open"[\s\S]*?onClick=\{\(\) => handlePlayerClick\(/, name);
    assert.doesNotMatch(source, /<div[^>]*onClick=/, `${name} should not put click handlers on divs`);
  }
});

test("the stretched card button covers the card and shows the site focus ring", () => {
  assert.match(css, /\.card-open::after\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0/s);
  assert.match(css, /\.spotlight-card\s*\{[^}]*position:\s*relative/s);
  assert.match(css, /\.recommendation-card\s*\{[^}]*position:\s*relative/s);
  assert.match(css, /\.card-open:focus-visible::after\s*\{\s*outline:\s*2px solid var\(--color-ember-orange\);\s*outline-offset:\s*3px;/);
  assert.match(css, /\.view-stats-link:focus-visible\s*\{\s*outline:\s*2px solid var\(--color-ember-orange\);\s*outline-offset:\s*3px;/);
  assert.match(css, /\.spotlight-card:focus-within/);
  assert.match(css, /\.recommendation-card:focus-within/);
});

test("ranking bars grow with scale from a --fill fraction, never transition: all", () => {
  assert.doesNotMatch(css, /transition:\s*all/);
  assert.match(chart, /style=\{\{ '--fill': currentFill \}\}/);
  assert.match(chart, /style=\{\{ '--fill': predictedFill \}\}/);
  assert.doesNotMatch(chart, /width: `\$\{/);
  assert.match(css, /\.bar-fill\s*\{[^}]*scale:\s*var\(--fill, 0\) 1;[^}]*animation:\s*bar-grow/s);
  assert.match(css, /@keyframes bar-grow\s*\{\s*from\s*\{\s*scale:\s*0 1;/);
});

test("reduced motion drops the bar animation and the card lift", () => {
  const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/);
  assert.ok(block, "Recommendations.css ends with a reduced-motion block");
  assert.match(block[1], /\.bar-fill\s*\{\s*animation:\s*none;/);
  assert.match(block[1], /\.recommendation-card:focus-within\s*\{\s*transform:\s*none;/);
});

test("the page title shrinks with the viewport on phones so one long word cannot overflow", () => {
  assert.match(css, /@media \(max-width: 480px\)\s*\{\s*\.recommendations-title\s*\{\s*font-size:\s*8vw;/);
});

test("ranked list keeps the API order and has no sorting controls", () => {
  assert.match(chart, /players\.map\(\(player, index\) =>/);
  assert.match(chart, /#\{index \+ 1\}/);
  assert.doesNotMatch(chart, /\.sort\(|sortBy|<select/);
});
