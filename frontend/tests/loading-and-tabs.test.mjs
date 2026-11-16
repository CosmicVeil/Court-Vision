import assert from "node:assert/strict";
import test from "node:test";
import { readSource } from "./helpers.mjs";
import { loadFrontendModule, renderComponent } from "./render-helpers.mjs";

const { default: ContentSkeleton } = loadFrontendModule("src/components/ContentSkeleton.jsx");

test("skeletons borrow the real grid class for each variant and fall back to cards", () => {
  assert.match(renderComponent(ContentSkeleton, { variant: "picks", count: 1 }), /class="content-skeleton content-skeleton--picks gr-grid"/);
  assert.match(renderComponent(ContentSkeleton, { variant: "table", count: 1 }), /class="content-skeleton content-skeleton--table "/);
  assert.match(renderComponent(ContentSkeleton, { variant: "unknown", count: 1 }), /content-skeleton--unknown pc-grid/);
  // Picks rows have five value lines, everything else three.
  assert.equal(renderComponent(ContentSkeleton, { variant: "picks", count: 1 }).match(/<span class="skeleton-line"/g).length, 5);
  assert.equal(renderComponent(ContentSkeleton, { count: 2 }).match(/class="skeleton-item"/g).length, 2);
});

test("a skeleton announces loading once, or stays silent when its parent announces", () => {
  const announced = renderComponent(ContentSkeleton, { count: 1, label: "Loading players…" });
  assert.match(announced, /role="status" aria-label="Loading players…"/);
  const silent = renderComponent(ContentSkeleton, { count: 1, label: null });
  assert.doesNotMatch(silent, /role="status"/);
  assert.match(silent, /^<div class="content-skeleton[^"]*" aria-hidden="true"/);

  const standings = readSource("Standings.jsx");
  assert.equal(standings.match(/role="status" aria-label="Loading standings…"/g)?.length, 1);
  assert.equal(standings.match(/<ContentSkeleton variant="table" count=\{15\} label=\{null\} \/>/g)?.length, 2);
});

test("result regions animate content switches but not their first render", () => {
  const region = readSource("ResultRegion.jsx");
  assert.match(region, /const shownKey = useRef\(changeKey\)/);
  assert.match(region, /if \(shownKey\.current === changeKey\) return undefined;\s*shownKey\.current = changeKey;/);
});

test("a stat change ignores the previous stat's late recommendation response", () => {
  const chart = readSource("RecommendationChart.jsx");
  assert.match(chart, /let cancelled = false;/);
  assert.match(chart, /return \(\) => \{ cancelled = true; \};\s*\}, \[stat\]\);/);
  assert.match(chart, /const data = await response\.json\(\);\s*if \(cancelled\) return;/);
  assert.match(chart, /if \(!cancelled\) setLoading\(false\);/);
});

test("game picks only show stat tabs while loading for signed-in visitors", () => {
  const picks = readSource("GameRecommendations.jsx");
  assert.match(picks, /\(\(loading && isAuthenticated\(\)\) \|\| showPicks\) && \(/);
  assert.match(picks, /panelId=\{showPicks \? 'gr-panel' : undefined\}/);
});

test("Home projection leaders use the same pill tabs as the game picks", () => {
  const leaders = readSource("AIPredictions.jsx");
  assert.match(leaders, /<PillNav className="pm-toggle ai-stat-tabs" tabClassName="pm-tab"/);
  assert.match(leaders, /id="ai-panel" role="tabpanel"/);
  assert.doesNotMatch(leaders, /tab-button/);
  assert.doesNotMatch(readSource("Home.css"), /\.predictions-tabs/);
});

test("sign-in prompts share one lock icon", () => {
  for (const file of ["Recommendations.jsx", "RecommendationChart.jsx", "GameRecommendations.jsx", "GamePredictions.jsx", "Predictions.jsx", "Stats.jsx"]) {
    const source = readSource(file);
    assert.match(source, /<LockIcon \/>/, file);
    assert.doesNotMatch(source, /M8 10V7a4/, file);
  }
});
