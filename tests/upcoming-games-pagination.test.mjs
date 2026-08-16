import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildUpcomingGamesEndpoint,
  getUpcomingPaginationView,
  normalizeUpcomingGamesPage,
} from "../src/utils/upcomingGamesPagination.js";

const liveGamesSource = readFileSync(
  new URL("../src/components/LiveGames.jsx", import.meta.url),
  "utf8",
);
const liveGamesCss = readFileSync(
  new URL("../src/components/LiveGames.css", import.meta.url),
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

test("Upcoming Games consumes pagination metadata and renders matching controls", () => {
  assert.match(liveGamesSource, /buildUpcomingGamesEndpoint/);
  assert.match(liveGamesSource, /normalizeUpcomingGamesPage/);
  assert.match(liveGamesSource, /getUpcomingPaginationView/);
  assert.match(liveGamesSource, /className="lg-pagination"/);
  assert.match(liveGamesSource, /count-badge">\{upcomingTotalGames\}/);
  assert.match(liveGamesSource, />\s*Previous Page\s*</);
  assert.match(liveGamesSource, />\s*Next Page\s*</);
});

test("Live Games styles pagination and the roster button with site controls", () => {
  assert.match(liveGamesCss, /\.lg-pagination-btn\s*\{/);
  assert.match(liveGamesCss, /\.lg-pagination-btn:focus-visible\s*\{/);
  assert.match(liveGamesCss, /\.expand-btn\s*\{[^}]*border-radius:\s*var\(--radius-full/s);
  assert.match(liveGamesCss, /\.expand-btn:hover\s*\{/);
  assert.match(liveGamesCss, /\.expand-btn:focus-visible\s*\{/);
});
