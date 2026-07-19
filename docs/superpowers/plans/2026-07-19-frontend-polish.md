# Frontend Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the homepage signup CTA for authenticated users, correct negative recommendation colors, simplify AI prediction cards, and replace the clunky sorting UI with one professional control.

**Architecture:** Keep all behavior within the existing React components and shared CSS. Add source-level regression coverage following the project's current Node test pattern, then make focused JSX and CSS changes without altering API contracts, model inputs, or popup prediction content.

**Tech Stack:** React 19, React Router, CSS, Node's built-in test runner, Vite 7

## Global Constraints

- Work directly on `main` as explicitly approved by the user.
- Preserve `Backend/__pycache__/nba_ai_system.cpython-312.pyc`; it is an unrelated user-owned modification.
- Do not change backend prediction, recommendation, or sorting behavior.
- AI Predictions list cards show predicted PPG, APG, and RPG only; the popup retains all ten metrics.
- Positive and zero recommendation percentages remain green; negative percentages become red and never receive a leading plus sign.
- Name sort uses A-to-Z/Z-to-A copy; numeric sorts use Highest-to-Lowest/Lowest-to-Highest copy.

---

### Task 1: Authenticated Homepage CTA Visibility

**Files:**
- Create: `tests/frontend-polish.test.mjs`
- Modify: `src/components/home.jsx`

**Interfaces:**
- Consumes: existing `isLoggedIn: boolean` state in `Home`.
- Produces: conditional rendering of `.cta-section` only when `isLoggedIn === false`.

- [ ] **Step 1: Write the failing homepage CTA test**

Create `tests/frontend-polish.test.mjs` with source reads and a test that requires the final CTA section to be guarded by `!isLoggedIn` while retaining both account routes:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/frontend-polish.test.mjs`

Expected: FAIL because `.cta-section` is currently unconditional.

- [ ] **Step 3: Guard the final CTA in `home.jsx`**

Wrap the existing final section without changing its content:

```jsx
{!isLoggedIn && (
  <section className="cta-section">
    <div className="cta-container">
      <h2 className="cta-title">Ready to Elevate Your Basketball Experience?</h2>
      <p className="cta-description">Join thousands of basketball enthusiasts and get access to exclusive insights, predictions, and more.</p>
      <div className="cta-buttons">
        <Link to="/login" className="cta-button primary large">Get Started</Link>
        <Link to="/create-account" className="cta-button secondary large">Create Account</Link>
      </div>
    </div>
  </section>
)}
```

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/frontend-polish.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the homepage change**

```bash
git add tests/frontend-polish.test.mjs src/components/home.jsx
git commit -m "feat: hide homepage signup CTA when logged in"
```

---

### Task 2: Sign-Aware Recommendation Styling

**Files:**
- Modify: `tests/frontend-polish.test.mjs`
- Modify: `src/components/Recommendations.jsx`
- Modify: `src/components/RecommendationChart.jsx`
- Modify: `src/components/Recommendations.css`

**Interfaces:**
- Consumes: numeric `improvement` and `impVal` values already computed by the recommendation components.
- Produces: `positive` or `negative` modifier classes on every recommendation percentage element.

- [ ] **Step 1: Add failing sign-style tests**

Append tests that require conditional classes, conditional plus signs, and red negative CSS:

```js
test("recommendation percentage badges use sign-aware classes", () => {
  const recommendations = readComponent("Recommendations.jsx");
  const chart = readComponent("RecommendationChart.jsx");

  assert.match(recommendations, /spotlight-growth-badge \$\{improvement >= 0 \? 'positive' : 'negative'\}/);
  assert.match(recommendations, /spotlight-stat-growth \$\{impVal >= 0 \? 'positive' : 'negative'\}/);
  assert.match(recommendations, /\{improvement >= 0 \? '\+' : ''\}/);
  assert.match(chart, /growth-callout \$\{improvement >= 0 \? 'positive' : 'negative'\}/);
});

test("negative recommendation modifiers use the red palette", () => {
  const css = readComponent("Recommendations.css");
  for (const selector of [
    ".spotlight-growth-badge.negative",
    ".spotlight-stat-growth.negative",
    ".growth-callout.negative",
  ]) {
    assert.match(css, new RegExp(`${selector.replaceAll(".", "\\\\.")}\\\\s*\\\\{[^}]*#f87171`, "s"));
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/frontend-polish.test.mjs`

Expected: the new recommendation tests FAIL because the modifier classes and red rules do not exist.

- [ ] **Step 3: Add modifier classes and correct sign formatting**

In `Recommendations.jsx`, change the featured badge and each stat percentage:

```jsx
<div className={`spotlight-growth-badge ${improvement >= 0 ? 'positive' : 'negative'}`}>
  {improvement >= 0 ? '+' : ''}{improvement.toFixed(1)}% {s} Breakout
</div>

<span className={`spotlight-stat-growth ${impVal >= 0 ? 'positive' : 'negative'}`}>
  {impVal >= 0 ? '+' : ''}{impVal.toFixed(1)}%
</span>
```

In `RecommendationChart.jsx`, add the equivalent modifier:

```jsx
<div className={`growth-callout ${improvement >= 0 ? 'positive' : 'negative'}`}>
  {improvement >= 0 ? '+' : ''}{improvement.toFixed(1)}% PROJECTED GROWTH
</div>
```

- [ ] **Step 4: Split the existing green styles into positive and negative rules**

Keep structural styling on the base selectors. Move the green palette to `.positive` modifiers and add the red palette:

```css
.spotlight-growth-badge.positive,
.growth-callout.positive {
  background: rgba(76, 175, 80, 0.12);
  border-color: rgba(76, 175, 80, 0.3);
  color: #4caf50;
}

.growth-callout.positive {
  box-shadow: 0 0 12px rgba(76, 175, 80, 0.1);
}

.spotlight-growth-badge.negative,
.growth-callout.negative {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.growth-callout.negative {
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.1);
}

.spotlight-stat-growth.positive { color: #4caf50; }
.spotlight-stat-growth.negative { color: #f87171; }
```

- [ ] **Step 5: Run the focused tests**

Run: `node --test tests/frontend-polish.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the recommendation fix**

```bash
git add tests/frontend-polish.test.mjs src/components/Recommendations.jsx src/components/RecommendationChart.jsx src/components/Recommendations.css
git commit -m "fix: color negative recommendation changes red"
```

---

### Task 3: Compact AI Prediction Cards

**Files:**
- Modify: `tests/frontend-polish.test.mjs`
- Modify: `src/components/Predictions.jsx`
- Modify: `src/components/Predictions.css`

**Interfaces:**
- Consumes: `player.predicted_ppg`, `player.predicted_apg`, and `player.predicted_rpg` from the unchanged predictions API response.
- Produces: `MAIN_PREDICTION_STATS`, a three-entry display configuration used only by list cards.
- Preserves: the existing popup `PlayerPredictionGrid` and all ten prediction metrics.

- [ ] **Step 1: Add failing compact-card and alignment tests**

Append:

```js
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
  assert.match(css, /\.prediction-card \.player-meta\s*\{[^}]*text-align:\s*center/s);
  assert.match(css, /\.prediction-card \.player-badges\s*\{[^}]*justify-content:\s*center/s);
  assert.match(css, /\.team-badge,[\s\S]*\.age-badge\s*\{[^}]*align-items:\s*center[^}]*justify-content:\s*center/s);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/frontend-polish.test.mjs`

Expected: the compact-card tests FAIL because list cards still render the ten-stat grid.

- [ ] **Step 3: Replace the list grid with a three-stat summary**

Remove `toPredictionPageStats` from the config import and add a focused constant:

```jsx
import { PREDICTION_STATS } from '../config/predictionStats';

const MAIN_PREDICTION_STATS = [
  { key: 'predicted_ppg', label: 'PPG' },
  { key: 'predicted_apg', label: 'APG' },
  { key: 'predicted_rpg', label: 'RPG' },
];
```

Replace only the list card's `PlayerPredictionGrid` with:

```jsx
<div className="prediction-card-main-stats">
  {MAIN_PREDICTION_STATS.map((stat) => (
    <div className="prediction-main-stat" key={stat.key}>
      <span className="prediction-main-stat-value">
        {(Number(player[stat.key]) || 0).toFixed(1)}
      </span>
      <span className="prediction-main-stat-label">Predicted {stat.label}</span>
    </div>
  ))}
</div>
```

Leave the popup's existing `PlayerPredictionGrid` untouched.

- [ ] **Step 4: Add compact card and centering styles**

In `Predictions.css`, remove the list-card override for `.prediction-card .player-prediction-grid` and add:

```css
.prediction-card .player-meta { text-align: center; }
.prediction-card .player-badges { justify-content: center; }

.team-badge, .position-badge, .age-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.prediction-card-main-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.prediction-main-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 92px;
  padding: 14px 10px;
  border: 1px solid rgba(255, 69, 0, 0.12);
  border-radius: 12px;
  background: rgba(17, 24, 39, 0.45);
  text-align: center;
}

.prediction-main-stat-value {
  color: #fff;
  font-size: 1.65rem;
  font-weight: 800;
}

.prediction-main-stat-label {
  margin-top: 4px;
  color: #9ca3af;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
```

- [ ] **Step 5: Run focused and expanded prediction tests**

Run: `node --test tests/frontend-polish.test.mjs tests/expanded-predictions.test.mjs`

Expected: PASS, including the assertion that the popup still consumes `PlayerPredictionGrid`.

- [ ] **Step 6: Commit the compact cards**

```bash
git add tests/frontend-polish.test.mjs src/components/Predictions.jsx src/components/Predictions.css
git commit -m "feat: simplify AI prediction list cards"
```

---

### Task 4: Unified Professional Sorting Control

**Files:**
- Modify: `tests/frontend-polish.test.mjs`
- Modify: `src/components/Predictions.jsx`
- Modify: `src/components/Predictions.css`

**Interfaces:**
- Consumes: existing `sortBy`, `sortOrder`, `setCurrentPage`, and `PREDICTION_STATS`.
- Produces: `handleSortFieldChange(event)` and `handleSortDirectionChange()` callbacks.
- Preserves: `sort_by` and `sort_order` API query parameter values.

- [ ] **Step 1: Add failing unified-sort tests**

Append:

```js
test("AI predictions use one unified sort field and contextual direction labels", () => {
  const source = readComponent("Predictions.jsx");
  assert.match(source, /<option value="name">Name<\/option>/);
  assert.match(source, /const isNameSort = sortBy === 'name'/);
  assert.match(source, /isNameSort \? 'A to Z' : 'Highest to Lowest'/);
  assert.match(source, /isNameSort \? 'Z to A' : 'Lowest to Highest'/);
  assert.match(source, /setSortOrder\(nextSortBy === 'name' \? 'asc' : 'desc'\)/);
  assert.match(source, /handleSortDirectionChange/);
  assert.doesNotMatch(source, /onClick=\{\(\) => handleSort\('name'\)\}/);
});

test("professional sort styling groups both controls and provides focus states", () => {
  const css = readComponent("Predictions.css");
  assert.match(css, /\.sort-control-group\s*\{/);
  assert.match(css, /\.sort-direction-btn:focus-visible\s*\{/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.sort-control-group/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/frontend-polish.test.mjs`

Expected: the unified-sort tests FAIL because the current Name and order buttons are separate.

- [ ] **Step 3: Add sort handlers and contextual copy**

Replace `handleSort` with:

```jsx
const handleSortFieldChange = (event) => {
  const nextSortBy = event.target.value;
  setSortBy(nextSortBy);
  setSortOrder(nextSortBy === 'name' ? 'asc' : 'desc');
  setCurrentPage(1);
};

const handleSortDirectionChange = () => {
  setSortOrder((currentOrder) => currentOrder === 'asc' ? 'desc' : 'asc');
  setCurrentPage(1);
};

const isNameSort = sortBy === 'name';
const sortDirectionLabel = sortOrder === 'asc'
  ? (isNameSort ? 'A to Z' : 'Lowest to Highest')
  : (isNameSort ? 'Z to A' : 'Highest to Lowest');
```

- [ ] **Step 4: Replace the three disconnected controls**

Use one group with an accessible field label and button:

```jsx
<div className="sorting-section">
  <div className="sort-control-group">
    <label className="sort-label" htmlFor="prediction-sort-field">Sort by</label>
    <select
      id="prediction-sort-field"
      className="prediction-sort-select"
      value={sortBy}
      onChange={handleSortFieldChange}
    >
      <option value="name">Name</option>
      {PREDICTION_STATS.map((stat) => (
        <option value={stat.predictedField} key={stat.key}>Predicted {stat.unit}</option>
      ))}
    </select>
    <button
      type="button"
      className="sort-direction-btn"
      onClick={handleSortDirectionChange}
      aria-label={`Change sort direction. Current order: ${sortDirectionLabel}`}
    >
      <span aria-hidden="true">{sortOrder === 'asc' ? '↑' : '↓'}</span>
      <span>{sortDirectionLabel}</span>
    </button>
  </div>
</div>
```

- [ ] **Step 5: Replace legacy sorting CSS**

Replace the current sorting rules with:

```css
.sorting-section {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 40px;
}

.sort-control-group {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: rgba(17, 24, 39, 0.72);
  border: 1px solid rgba(255, 69, 0, 0.16);
  border-radius: 12px;
  backdrop-filter: blur(10px);
}

.sort-label {
  padding-left: 8px;
  color: #9ca3af;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.prediction-sort-select,
.sort-direction-btn {
  min-height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  background: rgba(31, 41, 55, 0.82);
  color: #f3f4f6;
  font: inherit;
}

.prediction-sort-select {
  min-width: 210px;
  padding: 0 36px 0 14px;
  border-radius: 8px;
  cursor: pointer;
}

.sort-direction-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.prediction-sort-select:hover,
.sort-direction-btn:hover {
  border-color: rgba(255, 69, 0, 0.45);
  background: rgba(255, 69, 0, 0.1);
}

.prediction-sort-select:focus-visible,
.sort-direction-btn:focus-visible {
  outline: 2px solid #ff4500;
  outline-offset: 2px;
}
```

Add this inside the existing `@media (max-width: 768px)` block:

```css
.sorting-section { justify-content: stretch; }
.sort-control-group { width: 100%; flex-wrap: wrap; }
.sort-label { width: 100%; padding: 2px 4px 0; }
.prediction-sort-select { flex: 1 1 190px; min-width: 0; }
.sort-direction-btn { flex: 1 1 160px; }
```

- [ ] **Step 6: Run focused tests**

Run: `node --test tests/frontend-polish.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit the sort UI**

```bash
git add tests/frontend-polish.test.mjs src/components/Predictions.jsx src/components/Predictions.css
git commit -m "feat: refine AI prediction sorting controls"
```

---

### Task 5: Full Frontend Verification

**Files:**
- Verify only; modify a task-owned file only if a verification failure reveals an issue introduced by this plan.

**Interfaces:**
- Consumes: all completed frontend changes.
- Produces: evidence that the combined change passes regression tests, lint for changed files, and production compilation.

- [ ] **Step 1: Run the complete Node test suite**

Run: `node --test tests/*.test.mjs`

Expected: all tests PASS.

- [ ] **Step 2: Lint the changed React files**

Run: `npx eslint src/components/home.jsx src/components/Recommendations.jsx src/components/RecommendationChart.jsx src/components/Predictions.jsx`

Expected: exit code 0 with no lint errors introduced by this work.

- [ ] **Step 3: Build the production frontend**

Run: `npm run build`

Expected: Vite exits successfully and writes the production bundle.

- [ ] **Step 4: Inspect repository scope**

Run: `git status --short && git diff --check`

Expected: only the pre-existing `Backend/__pycache__/nba_ai_system.cpython-312.pyc` modification remains; no whitespace errors.
