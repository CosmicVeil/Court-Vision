import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildUpcomingGamesEndpoint,
  normalizeUpcomingGamesPage,
  UPCOMING_GAMES_PAGE_SIZE,
} from "../src/utils/upcomingGamesPagination.js";
import { getPaginationView } from "../src/utils/pagination.js";

const liveGamesSource = readFileSync(
  new URL("../src/pages/LiveGames.jsx", import.meta.url),
  "utf8",
);
const liveGamesCss = readFileSync(
  new URL("../src/pages/LiveGames.css", import.meta.url),
  "utf8",
);

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

test("shared pagination view reports the twenty-game range and disables both buttons while loading", () => {
  const upcomingView = (overrides) => getPaginationView({
    page: 2,
    totalPages: 3,
    totalItems: 45,
    pageSize: UPCOMING_GAMES_PAGE_SIZE,
    itemLabel: "games",
    ...overrides,
  });

  assert.equal(UPCOMING_GAMES_PAGE_SIZE, 20);
  assert.equal(upcomingView().rangeLabel, "Showing 21 - 40 of 45 games");
  assert.equal(upcomingView().previousDisabled, false);
  assert.equal(upcomingView().nextDisabled, false);
  assert.equal(upcomingView({ page: 1 }).previousDisabled, true);
  assert.equal(upcomingView({ page: 3 }).nextDisabled, true);
  assert.equal(upcomingView({ loading: true }).previousDisabled, true);
  assert.equal(upcomingView({ loading: true }).nextDisabled, true);
});

test("Upcoming Games consumes pagination metadata and renders matching controls", () => {
  assert.match(liveGamesSource, /buildUpcomingGamesEndpoint/);
  assert.match(liveGamesSource, /normalizeUpcomingGamesPage/);
  assert.match(liveGamesSource, /count-badge">\{upcomingTotalGames\}/);
  assert.match(liveGamesSource, /<Pagination\b[^>]*pageSize=\{UPCOMING_GAMES_PAGE_SIZE\}[^>]*itemLabel="games"[^>]*loading=\{upcomingLoading\}/);
  assert.doesNotMatch(liveGamesSource, /lg-pagination|getUpcomingPaginationView/);
});

test("Upcoming Games marks itself loading for each fetch so the pager disables until the page arrives", () => {
  const fetchGames = liveGamesSource.slice(
    liveGamesSource.indexOf("const fetchGames = useCallback"),
    liveGamesSource.indexOf("}, [upcomingPage]);"),
  );
  // A page change creates a new fetchGames (it depends on upcomingPage), whose effect runs it at once.
  assert.match(fetchGames, /^const fetchGames = useCallback\(async \(\) => \{\s*setUpcomingLoading\(true\);/);
  assert.match(fetchGames, /await Promise\.all\(\[fetchToday\(\), fetchUpcoming\(\)\]\);[\s\S]*setUpcomingLoading\(false\);/);
  assert.match(liveGamesSource, /useEffect\(\(\) => \{ fetchGames\(\);[^\n]*\}, \[fetchGames\]\);/);
  assert.match(liveGamesSource, /loading=\{upcomingLoading\}/);
});

test("Live Games leaves pagination to the shared pager and styles the roster button with site controls", () => {
  assert.doesNotMatch(liveGamesCss, /^\s*\.lg-(pagination|page-)[a-z-]*/m);
  assert.match(liveGamesCss, /\.expand-btn\s*\{[^}]*border-radius:\s*var\(--radius-full/s);
  assert.match(liveGamesCss, /\.expand-btn:hover\s*\{/);
  assert.match(liveGamesCss, /\.expand-btn:focus-visible\s*\{/);
});
