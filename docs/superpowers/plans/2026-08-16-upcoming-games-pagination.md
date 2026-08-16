# Upcoming Games Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paginate the Upcoming Games tab with the backend's 10-game pages and restyle the roster/details button to match CourtVision.

**Architecture:** Put endpoint construction, response normalization, and page-label calculations in a small frontend utility with direct Node tests. `LiveGames.jsx` will consume that utility, retain the selected page during the visit, and render Predictions-style controls. `LiveGames.css` will own scoped pagination and roster-button styles.

**Tech Stack:** React 19, Vite 7, JavaScript ES modules, Node test runner, CSS.

## Global Constraints

- Consume `GET /api/games/upcoming?page=<number>` fields `games`, `count`, `total_pages`, and `page`.
- Treat the backend page size as exactly 10 games.
- Match the Predictions page's Previous/Page/Next interaction without numbered buttons.
- Preserve the selected upcoming page when switching tabs and refresh that page every 30 seconds.
- Preserve the existing roster/details expand behavior.
- Do not modify the user's backend pagination or CSV-cache changes.

---

### Task 1: Upcoming-games pagination model

**Files:**
- Create: `src/utils/upcomingGamesPagination.js`
- Create: `tests/upcoming-games-pagination.test.mjs`

**Interfaces:**
- Produces: `UPCOMING_GAMES_PAGE_SIZE: 10`.
- Produces: `buildUpcomingGamesEndpoint(page: number) -> string`.
- Produces: `normalizeUpcomingGamesPage(payload: object) -> { games, totalGames, totalPages, page }`.
- Produces: `getUpcomingPaginationView({ page, totalPages, totalGames, loading }) -> { previousDisabled, nextDisabled, pageLabel, countLabel }`.

- [ ] **Step 1: Write failing utility tests**

Create `tests/upcoming-games-pagination.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUpcomingGamesEndpoint,
  getUpcomingPaginationView,
  normalizeUpcomingGamesPage,
} from "../src/utils/upcomingGamesPagination.js";

test("upcoming games endpoint requests the selected positive page", () => {
  assert.equal(buildUpcomingGamesEndpoint(3), "games/upcoming?page=3");
  assert.equal(buildUpcomingGamesEndpoint(0), "games/upcoming?page=1");
});

test("upcoming games response metadata is normalized for the UI", () => {
  assert.deepEqual(normalizeUpcomingGamesPage({
    games: [{ gameId: "game-11" }],
    count: 23,
    total_pages: 3,
    page: 2,
  }), {
    games: [{ gameId: "game-11" }],
    totalGames: 23,
    totalPages: 3,
    page: 2,
  });
});

test("pagination view reports boundaries and the ten-game range", () => {
  assert.deepEqual(getUpcomingPaginationView({
    page: 2,
    totalPages: 3,
    totalGames: 23,
    loading: false,
  }), {
    previousDisabled: false,
    nextDisabled: false,
    pageLabel: "Page 2 of 3",
    countLabel: "Showing 11 - 20 of 23 games",
  });

  assert.equal(getUpcomingPaginationView({
    page: 3,
    totalPages: 3,
    totalGames: 23,
    loading: true,
  }).nextDisabled, true);
});
```

- [ ] **Step 2: Run the utility tests and verify the missing-module failure**

Run: `node --test tests/upcoming-games-pagination.test.mjs`

Expected: FAIL because `src/utils/upcomingGamesPagination.js` does not exist.

- [ ] **Step 3: Implement the pagination utility**

Create `src/utils/upcomingGamesPagination.js`:

```js
export const UPCOMING_GAMES_PAGE_SIZE = 10;

const positiveInteger = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const buildUpcomingGamesEndpoint = (page) => (
  `games/upcoming?page=${positiveInteger(page)}`
);

export const normalizeUpcomingGamesPage = (payload = {}) => {
  const totalGames = Math.max(0, Number.parseInt(payload.count, 10) || 0);
  const totalPages = Math.max(1, positiveInteger(payload.total_pages));
  const page = Math.min(positiveInteger(payload.page), totalPages);

  return {
    games: Array.isArray(payload.games) ? payload.games : [],
    totalGames,
    totalPages,
    page,
  };
};

export const getUpcomingPaginationView = ({
  page,
  totalPages,
  totalGames,
  loading,
}) => {
  const safeTotalPages = Math.max(1, positiveInteger(totalPages));
  const safePage = Math.min(positiveInteger(page), safeTotalPages);
  const safeTotalGames = Math.max(0, Number.parseInt(totalGames, 10) || 0);
  const start = safeTotalGames === 0
    ? 0
    : ((safePage - 1) * UPCOMING_GAMES_PAGE_SIZE) + 1;
  const end = Math.min(safePage * UPCOMING_GAMES_PAGE_SIZE, safeTotalGames);

  return {
    previousDisabled: Boolean(loading) || safePage === 1,
    nextDisabled: Boolean(loading) || safePage === safeTotalPages,
    pageLabel: `Page ${safePage} of ${safeTotalPages}`,
    countLabel: `Showing ${start} - ${end} of ${safeTotalGames} games`,
  };
};
```

- [ ] **Step 4: Run the utility tests**

Run: `node --test tests/upcoming-games-pagination.test.mjs`

Expected: three tests pass.

- [ ] **Step 5: Commit the model and tests**

```bash
git add src/utils/upcomingGamesPagination.js tests/upcoming-games-pagination.test.mjs
git commit -m "test: define upcoming games pagination behavior"
```

### Task 2: Paginated Upcoming Games UI and site-matched controls

**Files:**
- Modify: `src/components/LiveGames.jsx:1-315`
- Modify: `src/components/LiveGames.css:42-190`
- Modify: `tests/upcoming-games-pagination.test.mjs`

**Interfaces:**
- Consumes: `buildUpcomingGamesEndpoint`, `normalizeUpcomingGamesPage`, and `getUpcomingPaginationView` from Task 1.
- Consumes: backend response `{ games, count, total_pages, page }` with a fixed page size of 10.
- Produces: Predictions-style Previous/Page/Next controls and an ember-outline `.expand-btn`.

- [ ] **Step 1: Add a failing UI contract test**

Extend `tests/upcoming-games-pagination.test.mjs`:

```js
import { readFileSync } from "node:fs";

const liveGamesSource = readFileSync(
  new URL("../src/components/LiveGames.jsx", import.meta.url),
  "utf8",
);
const liveGamesCss = readFileSync(
  new URL("../src/components/LiveGames.css", import.meta.url),
  "utf8",
);

test("Upcoming Games consumes pagination metadata and renders matching controls", () => {
  assert.match(liveGamesSource, /buildUpcomingGamesEndpoint/);
  assert.match(liveGamesSource, /normalizeUpcomingGamesPage/);
  assert.match(liveGamesSource, /getUpcomingPaginationView/);
  assert.match(liveGamesSource, /className="lg-pagination"/);
  assert.match(liveGamesSource, /upcomingTotalGames[\s\S]*count-badge/);
  assert.match(liveGamesSource, />Previous Page</);
  assert.match(liveGamesSource, />Next Page</);
});

test("Live Games styles pagination and the roster button with site controls", () => {
  assert.match(liveGamesCss, /\.lg-pagination-btn\s*\{/);
  assert.match(liveGamesCss, /\.lg-pagination-btn:focus-visible\s*\{/);
  assert.match(liveGamesCss, /\.expand-btn\s*\{[^}]*border-radius:\s*var\(--radius-full/s);
  assert.match(liveGamesCss, /\.expand-btn:hover\s*\{/);
  assert.match(liveGamesCss, /\.expand-btn:focus-visible\s*\{/);
});
```

- [ ] **Step 2: Run the test and verify the UI contract failure**

Run: `node --test tests/upcoming-games-pagination.test.mjs`

Expected: FAIL because `LiveGames.jsx` has no pagination state or controls and `LiveGames.css` has no `.expand-btn` styles.

- [ ] **Step 3: Wire backend pagination into `LiveGames.jsx`**

Import the helpers and add state:

```jsx
import {
  buildUpcomingGamesEndpoint,
  getUpcomingPaginationView,
  normalizeUpcomingGamesPage,
} from "../utils/upcomingGamesPagination";

const [upcomingPage, setUpcomingPage] = useState(1);
const [upcomingTotalPages, setUpcomingTotalPages] = useState(1);
const [upcomingTotalGames, setUpcomingTotalGames] = useState(0);
const [upcomingLoading, setUpcomingLoading] = useState(false);
```

Update the upcoming request and response handling inside `fetchGames`:

```jsx
setUpcomingLoading(true);
const [todayRes, upRes] = await Promise.all([
  fetch(buildApiUrl("games/today")),
  fetch(buildApiUrl(buildUpcomingGamesEndpoint(upcomingPage))),
]);
const todayData = await todayRes.json();
const upcomingData = normalizeUpcomingGamesPage(await upRes.json());
setTodayGames(todayData.games || []);
setUpcomingGames(upcomingData.games);
setUpcomingTotalGames(upcomingData.totalGames);
setUpcomingTotalPages(upcomingData.totalPages);
if (upcomingData.page !== upcomingPage) setUpcomingPage(upcomingData.page);
```

Set `upcomingLoading` to `false` in `finally` and change the callback dependency list to `[upcomingPage]`. Derive the UI model:

```jsx
const upcomingPagination = getUpcomingPaginationView({
  page: upcomingPage,
  totalPages: upcomingTotalPages,
  totalGames: upcomingTotalGames,
  loading: upcomingLoading,
});
```

Use `upcomingTotalGames` in the Upcoming Games badge. After the upcoming games grid, render:

```jsx
<nav className="lg-pagination" aria-label="Upcoming games pages">
  <div className="lg-pagination-controls">
    <button
      type="button"
      className="lg-pagination-btn"
      disabled={upcomingPagination.previousDisabled}
      onClick={() => setUpcomingPage((page) => Math.max(1, page - 1))}
    >
      Previous Page
    </button>
    <div className="lg-pagination-info">
      <div className="lg-page-label">{upcomingPagination.pageLabel}</div>
      <div className="lg-page-count">{upcomingPagination.countLabel}</div>
    </div>
    <button
      type="button"
      className="lg-pagination-btn"
      disabled={upcomingPagination.nextDisabled}
      onClick={() => setUpcomingPage((page) => Math.min(upcomingTotalPages, page + 1))}
    >
      Next Page
    </button>
  </div>
</nav>
```

Add `type="button"` and `aria-expanded={expanded}` to the existing roster/details button without changing its label or click behavior.

- [ ] **Step 4: Add scoped pagination and roster-button styles**

Add the pagination rules after `.games-grid`:

```css
.lg-pagination { display: flex; justify-content: center; margin: 40px 0 20px; }
.lg-pagination-controls { display: flex; align-items: center; gap: 20px; }
.lg-pagination-btn {
  padding: 10px 24px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 100, 54, 0.25);
  border-radius: var(--radius-full, 9999px);
  color: #fff;
  font: 700 11px var(--font-mono, monospace);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;
}
.lg-pagination-btn:hover:not(:disabled) {
  background: rgba(255, 100, 54, 0.15);
  border-color: var(--color-ember-orange, #ff6436);
  box-shadow: 0 0 16px rgba(255, 100, 54, 0.25);
}
.lg-pagination-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.lg-pagination-btn:focus-visible { outline: 2px solid #ff6436; outline-offset: 3px; }
.lg-pagination-info { text-align: center; min-width: 180px; }
.lg-page-label { color: #fff; font: 700 12px var(--font-mono, monospace); margin-bottom: 4px; }
.lg-page-count { color: var(--color-stone, #8e8c94); font: 11px var(--font-mono, monospace); }
```

Add the roster button rules near the game-card controls:

```css
.expand-btn {
  display: block;
  margin: 18px auto 0;
  padding: 9px 18px;
  background: rgba(255, 100, 54, 0.08);
  border: 1px solid rgba(255, 100, 54, 0.4);
  border-radius: var(--radius-full, 9999px);
  color: var(--color-ember-orange, #ff6436);
  font: 700 10px var(--font-mono, monospace);
  letter-spacing: 1.2px;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;
}
.expand-btn:hover {
  color: #fff;
  background: rgba(255, 100, 54, 0.2);
  border-color: var(--color-ember-orange, #ff6436);
  box-shadow: 0 0 16px rgba(255, 100, 54, 0.25);
  transform: translateY(-1px);
}
.expand-btn:focus-visible { outline: 2px solid #ff6436; outline-offset: 3px; }
```

Add `@media (max-width: 600px)` rules that set `.lg-pagination-controls { flex-direction: column; gap: 12px; }` and `.lg-pagination-btn { width: min(100%, 220px); }`.

- [ ] **Step 5: Run the pagination tests**

Run: `node --test tests/upcoming-games-pagination.test.mjs`

Expected: all tests pass.

- [ ] **Step 6: Run frontend regression verification**

Run: `node --test tests/*.test.mjs`

Expected: all frontend tests pass.

Run: `npm run lint`

Expected: ESLint exits successfully.

Run: `npm run build`

Expected: Vite production build exits successfully.

- [ ] **Step 7: Commit the UI implementation**

```bash
git add src/components/LiveGames.jsx src/components/LiveGames.css tests/upcoming-games-pagination.test.mjs
git commit -m "feat: paginate upcoming games"
```
