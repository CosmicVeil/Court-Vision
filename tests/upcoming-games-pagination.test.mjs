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
