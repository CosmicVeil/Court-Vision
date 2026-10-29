import assert from "node:assert/strict";
import test from "node:test";
import { readFrontend, readSource } from "./helpers.mjs";
import { enterDelay } from "../src/utils/scrollReveal.js";

const tokens = readFrontend("src/styles/tokens.css");

test("data-enter plays the shared rise keyframe on mount, staggered, without holding translate afterwards", () => {
  assert.match(tokens, /\[data-enter\]\s*\{\s*animation:\s*rise var\(--duration-reveal\) var\(--ease-brand\) var\(--reveal-delay, 0s\) backwards;/);
});

test("reduced motion turns page entry off", () => {
  const reduced = tokens.slice(tokens.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\[data-enter\]\s*\{\s*animation:\s*none;/);
});

test("enterDelay reuses the reveal stagger and its cap", () => {
  assert.deepEqual(enterDelay(0), { "--reveal-delay": "0ms" });
  assert.deepEqual(enterDelay(3), { "--reveal-delay": "180ms" });
  assert.deepEqual(enterDelay(40), { "--reveal-delay": "480ms" });
});

// Pages whose content is on screen at mount; Live Games, Predictions and Stats load in through
// PageHero and data-reveal instead, and Home's sections sit below its intro (home-refresh.test.mjs).
const pages = {
  "Recommendations.jsx": 4,
  "RecommendationChart.jsx": 2,
  "Favourites.jsx": 5,
  "Contact.jsx": 5,
  "Privacy.jsx": 6,
  "NotFound.jsx": 5,
  "Login.jsx": 4,
  "SignUp.jsx": 4,
};

test("every static page tags its blocks for page entry, in a stagger", () => {
  for (const [file, min] of Object.entries(pages)) {
    const source = readSource(file);
    const tagged = source.match(/\bdata-enter\b/g) ?? [];
    assert.ok(tagged.length >= min, `${file} tags ${tagged.length} blocks, expected at least ${min}`);
    assert.match(source, /import \{ enterDelay \} from ['"]\.\.\/utils\/scrollReveal['"]/, file);
    assert.match(source, /enterDelay\(/, `${file} staggers its blocks`);
  }
});

test("listed cards stagger by their position", () => {
  assert.match(readSource("RecommendationChart.jsx"), /data-enter\s+style=\{enterDelay\(index \+ 1\)\}/);
  assert.match(readSource("Recommendations.jsx"), /className="spotlight-card" data-enter style=\{enterDelay\(index \+ 1\)\}/);
  assert.match(readSource("Favourites.jsx"), /data-enter\s+style=\{\{ cursor: 'pointer', \.\.\.enterDelay\(index \+ 2\) \}\}/);
});
