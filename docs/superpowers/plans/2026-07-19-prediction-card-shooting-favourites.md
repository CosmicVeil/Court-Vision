# Prediction Card Shooting and Favourites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show current-season FG%, 3P%, and FT% on every compact AI prediction card and let authenticated users add or remove that player from favourites with the existing `ADD FAV` interaction.

**Architecture:** Keep the prediction API unchanged and render the three existing flat percentage fields directly in `Predictions.jsx`. Reuse the current authentication and local-storage favourite utilities, adapting prediction records into the nested `stats` shape already consumed by `Favourites.jsx`; source-contract tests protect the UI behavior and responsive CSS.

**Tech Stack:** React 19, React Router, Vite, browser localStorage, CSS, Node.js built-in test runner

## Global Constraints

- Button copy must be exactly `ADD FAV` when unsaved and `FAVORITED` when saved.
- Current-season shooting must display `FG%`, `3P%`, and `FT%`, each to one decimal place.
- Clicking the favourite button must not open the player details popup.
- Signed-out users must receive the existing login/create-account prompt.
- Saved prediction players must use the nested `stats` shape expected by the Favourites page.
- Keep the centered player identity layout and avoid horizontal overflow at desktop and mobile widths.
- Do not change the backend API, model inputs, model outputs, model artifacts, or training process.

## File Structure

- Create `tests/prediction-card-favourites.test.mjs`: focused source-contract coverage for shooting values, favourite behavior, normalized data, empty-state copy, and responsive styling.
- Modify `src/components/Predictions.jsx`: render current shooting, manage favourite state, normalize prediction records, and show the authentication prompt.
- Modify `src/components/Predictions.css`: style the header action, shooting row, saved state, focus state, and mobile layout.
- Modify `src/components/Favourites.jsx`: mention AI Predictions in the empty-state instructions.

---

### Task 1: Prediction-card shooting and favourite behavior

**Files:**
- Create: `tests/prediction-card-favourites.test.mjs`
- Modify: `src/components/Predictions.jsx:1-465`
- Modify: `src/components/Favourites.jsx:124-134`

**Interfaces:**
- Consumes: `getFavorites(): Player[]`, `toggleFavorite(player): boolean`, and `isAuthenticated(): boolean` from the existing utilities; flat prediction fields returned by `/api/predictions`.
- Produces: `toFavoritePlayer(player): FavoritePlayer`, `CURRENT_SHOOTING_STATS`, card-local `favoriteIds: Set`, and `handleFavoriteToggle(event, player)` for Task 2's CSS selectors.

- [ ] **Step 1: Write the failing behavior tests**

Create `tests/prediction-card-favourites.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readComponent = (filename) => readFileSync(
  new URL(`../src/components/${filename}`, import.meta.url),
  "utf8",
);

test("AI prediction cards show all current-season shooting percentages", () => {
  const source = readComponent("Predictions.jsx");

  for (const [field, label] of [
    ["fg_pct_last", "FG%"],
    ["fg3_pct_last", "3P%"],
    ["ft_pct_last", "FT%"],
  ]) {
    assert.match(source, new RegExp(`key: ['"]${field}['"], label: ['"]${label.replace("%", "\\%")}`));
  }
  assert.match(source, /This Season Shooting/);
  assert.match(source, /Number\(player\[stat\.key\]\) \|\| 0\)\.toFixed\(1\)/);
  assert.match(source, /prediction-shooting-value[\s\S]*%/);
});

test("AI prediction favourites are authenticated, isolated from card clicks, and stateful", () => {
  const source = readComponent("Predictions.jsx");

  assert.match(source, /import \{ getFavorites, toggleFavorite \} from '\.\.\/utils\/favorites'/);
  assert.match(source, /import \{ isAuthenticated \} from '\.\.\/utils\/auth'/);
  assert.match(source, /const \[favoriteIds, setFavoriteIds\] = useState\(new Set\(\)\)/);
  assert.match(source, /event\.stopPropagation\(\)/);
  assert.match(source, /if \(!isAuthenticated\(\)\) \{[\s\S]*setShowAuthModal\(true\)/);
  assert.match(source, /toggleFavorite\(toFavoritePlayer\(player\)\)/);
  assert.match(source, /aria-pressed=\{favoriteIds\.has\(player\.id\)\}/);
  assert.match(source, /'FAVORITED' : 'ADD FAV'/);
  assert.match(source, /showAuthModal &&/);
  assert.match(source, /to="\/login"/);
  assert.match(source, /to="\/create-account"/);
});

test("prediction favourites are normalized for the Favourites page", () => {
  const source = readComponent("Predictions.jsx");
  const normalizer = source.match(/const toFavoritePlayer = \(player\) => \(\{[\s\S]*?\n\}\);/)?.[0] || "";

  for (const field of [
    "ppg_last",
    "apg_last",
    "rpg_last",
    "spg_last",
    "bpg_last",
    "tov_last",
    "fg_pct_last",
    "fg3_pct_last",
    "ft_pct_last",
  ]) {
    assert.match(normalizer, new RegExp(`${field}: toNumber\\(player\\.${field}\\)`));
  }
  assert.match(normalizer, /stats: \{/);
  assert.match(normalizer, /minutes: toNumber\(player\.mpg_last\)/);
});

test("Favourites empty state names both places where players can be saved", () => {
  const source = readComponent("Favourites.jsx");
  assert.match(source, /Stats or AI Predictions/);
});
```

- [ ] **Step 2: Run the focused tests and confirm the new contract fails**

Run: `node --test tests/prediction-card-favourites.test.mjs`

Expected: FAIL in the four new tests because `CURRENT_SHOOTING_STATS`, prediction-card favourite behavior, the normalizer, and the revised empty-state copy do not exist yet.

- [ ] **Step 3: Add prediction shooting configuration, favourite normalization, and state**

In `src/components/Predictions.jsx`, add the imports after the prediction-stat import:

```js
import { getFavorites, toggleFavorite } from '../utils/favorites';
import { isAuthenticated } from '../utils/auth';
```

Add these definitions after `MAIN_PREDICTION_STATS`:

```js
const CURRENT_SHOOTING_STATS = [
  { key: 'fg_pct_last', label: 'FG%' },
  { key: 'fg3_pct_last', label: '3P%' },
  { key: 'ft_pct_last', label: 'FT%' },
];

const toNumber = (value) => Number(value) || 0;

const toFavoritePlayer = (player) => ({
  id: player.id,
  name: player.name,
  team: player.team,
  position: player.position,
  age: toNumber(player.age),
  stats: {
    ppg_last: toNumber(player.ppg_last),
    apg_last: toNumber(player.apg_last),
    rpg_last: toNumber(player.rpg_last),
    spg_last: toNumber(player.spg_last),
    bpg_last: toNumber(player.bpg_last),
    tov_last: toNumber(player.tov_last),
    minutes: toNumber(player.mpg_last),
    fg_pct_last: toNumber(player.fg_pct_last),
    fg3_pct_last: toNumber(player.fg3_pct_last),
    ft_pct_last: toNumber(player.ft_pct_last),
  },
});
```

Add component state beside the existing modal state:

```js
const [favoriteIds, setFavoriteIds] = useState(new Set());
const [showAuthModal, setShowAuthModal] = useState(false);
```

Add a mount effect and handler before `handlePlayerClick`:

```js
useEffect(() => {
  setFavoriteIds(new Set(getFavorites().map((favorite) => favorite.id)));
}, []);

const handleFavoriteToggle = (event, player) => {
  event.stopPropagation();

  if (!isAuthenticated()) {
    setShowAuthModal(true);
    return;
  }

  const isNowFavorite = toggleFavorite(toFavoritePlayer(player));
  setFavoriteIds((currentIds) => {
    const nextIds = new Set(currentIds);
    if (isNowFavorite) {
      nextIds.add(player.id);
    } else {
      nextIds.delete(player.id);
    }
    return nextIds;
  });
};
```

- [ ] **Step 4: Render the favourite action and current shooting row**

Inside each prediction card's `.card-header`, add this button before `.player-meta`:

```jsx
<button
  type="button"
  className={`prediction-favorite-btn ${favoriteIds.has(player.id) ? 'favorited' : ''}`}
  onClick={(event) => handleFavoriteToggle(event, player)}
  aria-pressed={favoriteIds.has(player.id)}
  aria-label={favoriteIds.has(player.id)
    ? `Remove ${player.name} from favorites`
    : `Add ${player.name} to favorites`}
>
  {favoriteIds.has(player.id) ? 'FAVORITED' : 'ADD FAV'}
</button>
```

After `.prediction-card-main-stats`, add:

```jsx
<div className="prediction-card-shooting">
  <span className="prediction-shooting-heading">This Season Shooting</span>
  <div className="prediction-shooting-grid">
    {CURRENT_SHOOTING_STATS.map((stat) => (
      <div className="prediction-shooting-stat" key={stat.key}>
        <span className="prediction-shooting-value">
          {(Number(player[stat.key]) || 0).toFixed(1)}%
        </span>
        <span className="prediction-shooting-label">{stat.label}</span>
      </div>
    ))}
  </div>
</div>
```

Before the component's closing container, render the existing Stats-page authentication pattern:

```jsx
{showAuthModal && (
  <div className="stats-modal-backdrop" onClick={() => setShowAuthModal(false)}>
    <div
      className="stats-modal-container"
      onClick={(event) => event.stopPropagation()}
      style={{ maxWidth: '450px', textAlign: 'center', padding: '3rem 2rem' }}
    >
      <button
        type="button"
        className="stats-modal-close-btn"
        onClick={() => setShowAuthModal(false)}
        aria-label="Close authentication prompt"
      >
        ×
      </button>
      <div className="prediction-auth-icon" aria-hidden="true">🔒</div>
      <h2 className="empty-title">Authentication Required</h2>
      <p className="empty-description">
        You must create an account or log in to save your favorite NBA players and customize your analytics tracking!
      </p>
      <div className="prediction-auth-actions">
        <Link to="/login" className="empty-cta">Log In</Link>
        <Link to="/create-account" className="empty-cta prediction-auth-secondary">Create Account</Link>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Update the Favourites empty-state instructions**

In `src/components/Favourites.jsx`, replace the empty-state sentence with:

```jsx
<p className="empty-description">
  Add players from Stats or AI Predictions to start tracking your favorites!
</p>
```

- [ ] **Step 6: Run the focused tests and confirm the behavior passes**

Run: `node --test tests/prediction-card-favourites.test.mjs`

Expected: PASS, 4 tests passed and 0 failed.

- [ ] **Step 7: Commit the behavior**

```bash
git add tests/prediction-card-favourites.test.mjs src/components/Predictions.jsx src/components/Favourites.jsx
git commit -m "feat: add prediction card shooting and favourites"
```

---

### Task 2: Responsive prediction-card styling

**Files:**
- Modify: `tests/prediction-card-favourites.test.mjs`
- Modify: `src/components/Predictions.css:214-340,555-592`

**Interfaces:**
- Consumes: `.prediction-favorite-btn`, `.prediction-card-shooting`, `.prediction-shooting-grid`, `.prediction-shooting-stat`, and `.prediction-auth-*` markup produced by Task 1.
- Produces: distinct normal/saved/focus button states, a compact three-column shooting row, a non-overlapping header action, and mobile-safe card spacing.

- [ ] **Step 1: Add the failing styling test**

Append to `tests/prediction-card-favourites.test.mjs`:

```js
test("prediction shooting and favourite controls are styled responsively", () => {
  const css = readComponent("Predictions.css");

  assert.match(css, /\.prediction-card \.card-header\s*\{[^}]*position:\s*relative[^}]*padding-top:\s*38px/s);
  assert.match(css, /\.prediction-favorite-btn\s*\{/);
  assert.match(css, /\.prediction-favorite-btn\.favorited\s*\{/);
  assert.match(css, /\.prediction-favorite-btn:focus-visible\s*\{/);
  assert.match(css, /\.prediction-shooting-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.prediction-card\s*\{[^}]*padding:\s*20px/s);
});
```

- [ ] **Step 2: Run the focused tests and confirm the CSS contract fails**

Run: `node --test tests/prediction-card-favourites.test.mjs`

Expected: FAIL only in `prediction shooting and favourite controls are styled responsively` because the new selectors do not exist yet.

- [ ] **Step 3: Style the favourite action and shooting row**

In `src/components/Predictions.css`, extend `.prediction-card .card-header` and add the new selectors after the header rules:

```css
.prediction-card .card-header {
  position: relative;
  padding-top: 38px;
  margin-bottom: 24px;
}

.prediction-favorite-btn {
  position: absolute;
  top: 0;
  right: 0;
  min-height: 30px;
  padding: 6px 11px;
  border: 1px solid rgba(255, 69, 0, 0.4);
  border-radius: 8px;
  background: rgba(255, 69, 0, 0.1);
  color: #ff7043;
  font: inherit;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.prediction-favorite-btn:hover {
  background: rgba(255, 69, 0, 0.2);
  border-color: #ff5722;
  color: #fff;
}

.prediction-favorite-btn.favorited {
  background: rgba(16, 185, 129, 0.14);
  border-color: rgba(52, 211, 153, 0.45);
  color: #34d399;
}

.prediction-favorite-btn:focus-visible {
  outline: 2px solid #ff4500;
  outline-offset: 2px;
}
```

Add after `.prediction-main-stat-label`:

```css
.prediction-card-shooting {
  margin-top: 16px;
  padding-top: 15px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.prediction-shooting-heading {
  display: block;
  margin-bottom: 10px;
  color: #9ca3af;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-align: center;
  text-transform: uppercase;
}

.prediction-shooting-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.prediction-shooting-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  padding: 9px 6px;
  border-radius: 9px;
  background: rgba(17, 24, 39, 0.35);
  text-align: center;
}

.prediction-shooting-value {
  color: #f3f4f6;
  font-size: 1rem;
  font-weight: 800;
}

.prediction-shooting-label {
  margin-top: 2px;
  color: #9ca3af;
  font-size: 0.66rem;
  font-weight: 700;
}

.prediction-auth-icon {
  margin-bottom: 1.5rem;
  color: #ff4500;
  font-size: 4rem;
  filter: drop-shadow(0 0 15px rgba(255, 69, 0, 0.4));
}

.prediction-auth-actions {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.prediction-auth-actions .empty-cta {
  padding: 0.8rem 2rem;
  text-align: center;
  text-decoration: none;
}

.prediction-auth-secondary {
  border-color: rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  box-shadow: none;
}
```

Inside the existing `@media (max-width: 768px)` block, add:

```css
.prediction-card {
  padding: 20px;
}

.prediction-card-main-stats {
  gap: 8px;
}

.prediction-main-stat {
  min-height: 82px;
  padding: 12px 6px;
}
```

- [ ] **Step 4: Run focused and existing prediction tests**

Run: `node --test tests/prediction-card-favourites.test.mjs tests/frontend-polish.test.mjs tests/expanded-predictions.test.mjs`

Expected: PASS, all tests passed and 0 failed.

- [ ] **Step 5: Commit the responsive styling**

```bash
git add tests/prediction-card-favourites.test.mjs src/components/Predictions.css
git commit -m "style: refine prediction shooting and favourite controls"
```

---

### Task 3: Complete regression and production verification

**Files:**
- Verify: `src/components/Predictions.jsx`
- Verify: `src/components/Predictions.css`
- Verify: `src/components/Favourites.jsx`
- Verify: `tests/prediction-card-favourites.test.mjs`

**Interfaces:**
- Consumes: the completed Task 1 behavior and Task 2 styling.
- Produces: evidence that the full frontend test suite and production build remain healthy, with any lint differences classified against the pre-feature base.

- [ ] **Step 1: Run every repository source-contract test**

Run: `node --test tests/*.test.mjs`

Expected: PASS, all tests passed and 0 failed.

- [ ] **Step 2: Build the production frontend**

Run: `npm run build`

Expected: exit code 0 and a completed Vite production build in `dist/`.

- [ ] **Step 3: Run lint and classify only new findings**

Run: `npm run lint`

Expected: no new findings in `Predictions.jsx`, `Favourites.jsx`, or `tests/prediction-card-favourites.test.mjs`. Any repository-wide findings already proven at the pre-feature base are recorded as pre-existing rather than attributed to this feature.

- [ ] **Step 4: Inspect the final diff and working tree**

Run: `git diff HEAD~2 -- src/components/Predictions.jsx src/components/Predictions.css src/components/Favourites.jsx tests/prediction-card-favourites.test.mjs`

Expected: only the approved shooting, favourite, authentication-prompt, empty-copy, responsive-style, and test changes appear.

Run: `git status --short --branch`

Expected: the feature files are committed; the pre-existing user-owned `Backend/__pycache__/nba_ai_system.cpython-312.pyc` modification remains unstaged and untouched.
