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
  // Keyboard focus on the card's button turns the shared corner arrow, like hover does.
  assert.match(readSource("TiltCard.css"), /\.tilt-card:has\(:focus-visible\) \.tilt-cta-arrow/);
});

test("ranking bars grow with scale from a --fill fraction, never transition: all", () => {
  assert.doesNotMatch(css, /transition:\s*all/);
  assert.match(chart, /style=\{\{ '--fill': currentFill \}\}/);
  assert.match(chart, /style=\{\{ '--fill': predictedFill \}\}/);
  assert.doesNotMatch(chart, /width: `\$\{/);
  assert.match(css, /\.bar-fill\s*\{[^}]*scale:\s*var\(--fill, 0\) 1;[^}]*animation:\s*bar-grow/s);
  assert.match(css, /@keyframes bar-grow\s*\{\s*from\s*\{\s*scale:\s*0 1;/);
});

test("reduced motion drops the bar animation and the card tilt and lift", () => {
  const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/);
  assert.ok(block, "Recommendations.css ends with a reduced-motion block");
  assert.match(block[1], /\.bar-fill\s*\{\s*animation:\s*none;/);
  const tilt = readSource("TiltCard.css").match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/);
  assert.match(tilt[1], /\.tilt-card\s*\{\s*transform:\s*none;\s*transition:\s*none;/);
});

test("the page title shrinks with the viewport on phones so one long word cannot overflow", () => {
  assert.match(css, /@media \(max-width: 480px\)\s*\{\s*\.recommendations-title\s*\{\s*font-size:\s*8vw;/);
});

test("ranked list keeps the API order and has no sorting controls", () => {
  assert.match(chart, /players\.map\(\(player, index\) =>/);
  assert.match(chart, /#\{index \+ 1\}/);
  assert.doesNotMatch(chart, /\.sort\(|sortBy|<select/);
});

test("every interactive card gets its tilt, spotlight, lift and arrow from the one TiltCard", () => {
  const tilt = readSource("TiltCard.jsx");
  const tiltCss = readSource("TiltCard.css");
  assert.match(tilt, /usePointerTilt\(\)/);
  assert.match(tilt, /import '\.\/TiltCard\.css'/);
  assert.match(tilt, /className=\{`tilt-card \$\{className\}`\.trim\(\)\}/);
  assert.match(tiltCss, /\.tilt-card\s*\{[^}]*transform: perspective\(900px\) rotateX\(var\(--rx, 0deg\)\) rotateY\(var\(--ry, 0deg\)\) translateY\(var\(--lift, 0px\)\)/s);
  assert.match(tiltCss, /\.tilt-card::before[\s\S]*?radial-gradient\(420px circle at var\(--mx, 50%\) var\(--my, 50%\)/);
  assert.match(tiltCss, /\.tilt-card:hover \{ --lift: -6px;/);
  // Scroll-revealed cards keep their tilt transition instead of losing it to the reveal rule.
  assert.match(tiltCss, /html\[data-motion-ready\] \.tilt-card\[data-reveal\]\s*\{[^}]*transform var\(--duration-base\)/s);

  assert.match(readSource("PlayerCard.jsx"), /<TiltCard as="article" className="pc-card"/);
  assert.match(radar, /<TiltCard key=\{s\} className="spotlight-card"[^>]*cta="Full projection">/);
  assert.match(radar, /<TiltCard key=\{insight\.id\} className="recommendation-card insight-card"/);
  assert.match(chart, /<TiltCard\s+key=\{player\.PLAYER_NAME \?\? index\}\s+className="recommendation-card analytic-card"[\s\S]*?cta="Full projection"/);

  // No second copy of the effect anywhere a card is styled.
  for (const [name, sheet] of [["Recommendations.css", css], ["PlayerCard.css", readSource("PlayerCard.css")]]) {
    assert.doesNotMatch(sheet, /rotateX|--lift|::before|pc-cta|tilt-cta-arrow/, name);
    assert.doesNotMatch(sheet, /\.(spotlight-card|recommendation-card|pc-card)\s*\{[^}]*\b(transform|transition):/s, `${name}: cards must not override TiltCard's transform/transition`);
  }
});

test("recommendation cards show fantasy points: last season -> projected, and this season so far", () => {
  assert.match(radar, /const fantasy = getFantasyComparison\(player\)/);
  assert.match(radar, /\{fantasy && \([\s\S]*?title=\{FPTS_TITLE\}>FPTS<\/span>[\s\S]*?fantasy\.last\.toFixed\(1\)[\s\S]*?fantasy\.predicted\.toFixed\(1\)[\s\S]*?fantasy\.change/);
  assert.match(chart, /const fantasy = getFantasyComparison\(player\)/);
  assert.match(chart, /className="rec-fantasy-row"[\s\S]*?fantasy\.last\.toFixed\(1\)[\s\S]*?player\.so_far_fantasy/);
});

test("recommendations include the biggest predicted fantasy points jump", () => {
  assert.match(radar, /const stats = \['PPG', 'APG', 'RPG', 'PRA', 'FANTASY'\]/, "the radar fetches the FANTASY category");
  assert.match(radar, /\{ stat: 'FANTASY', name: 'FPTS', role: 'Fantasy Riser' \}/, "a fourth spotlight card");
  assert.match(radar, /if \(!player\) return null;/, "no fallback player for fantasy, so the card waits for data");
  assert.match(radar, /link: '\/recommendations\/FANTASY'/, "an insight card links to the full list");
  assert.match(chart, /case 'FANTASY':[\s\S]*?title: "Fantasy Risers"/);
  assert.match(chart, /const statLabel = stat === 'FANTASY' \? 'FPTS' : stat;/);
  assert.match(chart, /Current \{statLabel\}/);
  assert.match(chart, /\{fantasy && stat !== 'FANTASY' && \(/, "no duplicate FPTS row on the fantasy list");
});

test("the insight cards wait for the spotlight so its cards don't push them off-screen", () => {
  const held = radar.indexOf("{!spotlightLoading && (");
  assert.ok(held > radar.indexOf('className="spotlight-section"'), "gate sits after the spotlight section");
  assert.ok(held < radar.indexOf("Basketball Insights & Trends"), "insight heading is inside the gate");
  assert.ok(held < radar.indexOf("insights.map("), "insight cards are inside the gate");
});
