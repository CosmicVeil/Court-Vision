import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildPastGamesEndpoint,
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
  // The upcoming request clears its own flag, so a slow box score fetch can't keep the pager disabled.
  assert.match(fetchGames, /const fetchUpcoming = async \(\) => \{[\s\S]*setUpcomingLoading\(false\);\s*\};\s*await Promise\.all\(\[fetchToday\(\), fetchUpcoming\(\)\]\);\s*$/);
  assert.match(liveGamesSource, /useEffect\(\(\) => \{ fetchGames\(\);[^\n]*\}, \[fetchGames\]\);/);
  assert.match(liveGamesSource, /loading=\{upcomingLoading\}/);
});

test("Today's slate stops loading when its own request settles, without waiting for upcoming games", () => {
  const fetchToday = liveGamesSource.slice(
    liveGamesSource.indexOf("const fetchToday = async"),
    liveGamesSource.indexOf("const fetchUpcoming = async"),
  );
  // After the try/catch, so a failed request clears the spinner too.
  assert.match(fetchToday, /catch \(error\) \{[^}]*\}[\s\S]*setLoading\(false\);\s*\};\s*$/);
  assert.equal(liveGamesSource.match(/setLoading\(false\)/g).length, 1, "nothing after Promise.all clears it");
  // Each tab shows its own spinner; the upcoming tab's is tied to the first upcoming response.
  assert.match(liveGamesSource, /const panelLoading = tab === 'today' \? loading : tab === 'upcoming' \? !upcomingReady : !pastReady;/);
  assert.match(liveGamesSource, /\{panelLoading \? \(/);
  assert.match(liveGamesSource, /setUpcomingReady\(true\);/);
});

test("past games endpoint requests the selected positive page", () => {
  assert.equal(buildPastGamesEndpoint(4), "games/past?page=4");
  assert.equal(buildPastGamesEndpoint(-2), "games/past?page=1");
  assert.equal(buildPastGamesEndpoint("abc"), "games/past?page=1");
});

test("Past Games is a third tab with its own page, pager and spinner, outside the live refresh", () => {
  assert.match(liveGamesSource, /\{ id: 'past', label: <><span className="lg-tab-label">PAST GAMES<\/span>/);
  assert.match(liveGamesSource, /count-badge">\{past\.totalGames\}/);
  assert.match(liveGamesSource, /tab === 'past' && \(\s*<Pagination\b[^>]*page=\{pastPage\}[^>]*loading=\{pastLoading\}[^>]*onPageChange=\{setPastPage\}/);
  // Finished games never change: they are fetched per page, not by the 30-second fetchGames.
  const fetchGames = liveGamesSource.slice(
    liveGamesSource.indexOf("const fetchGames = useCallback"),
    liveGamesSource.indexOf("}, [upcomingPage]);"),
  );
  assert.doesNotMatch(fetchGames, /buildPastGamesEndpoint/);
  assert.match(liveGamesSource, /buildApiUrl\(buildPastGamesEndpoint\(pastPage\)\)[\s\S]*\}, \[pastPage\]\);/);
  // A slow response for a page the user already left must not overwrite the current one.
  assert.match(liveGamesSource, /if \(stale\) return;\s*setPast\(page\);/);
  assert.match(liveGamesSource, /return \(\) => \{ stale = true; \};/);
});

test("the site calls the page Games now that it also holds past results", async () => {
  const { NAV_LINKS } = await import("../src/utils/siteNav.js");
  assert.deepEqual(NAV_LINKS.find(link => link.to === "/games"), { to: "/games", label: "GAMES" });
  assert.match(liveGamesSource, /<span className="lg-title-word" style=\{\{ '--word': 1 \}\}>GAMES<\/span>/);
});

test("Live Games leaves pagination to the shared pager and styles the roster button with site controls", () => {
  assert.doesNotMatch(liveGamesCss, /^\s*\.lg-(pagination|page-)[a-z-]*/m);
  assert.match(liveGamesCss, /\.expand-btn\s*\{[^}]*border-radius:\s*var\(--radius-full/s);
  assert.match(liveGamesCss, /\.expand-btn:hover\s*\{/);
  assert.match(liveGamesCss, /\.expand-btn:focus-visible\s*\{/);
});
