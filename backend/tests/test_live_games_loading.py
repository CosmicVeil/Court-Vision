"""Loading behaviour of the Live Games endpoints (issue 95). Offline: ESPN is mocked."""
import threading
import unittest
from unittest.mock import patch

import requests

import app.services.live_games as live_games
from app import create_app
from app.api.routes import games as games_routes


def event(game_id, state="in", home="LAL", away="DEN"):
    return {
        "id": game_id, "date": "2026-11-09T00:00Z",
        "status": {"type": {"state": state, "completed": state == "post"}},
        "competitions": [{"competitors": [
            {"homeAway": "home", "score": "100", "team": {"abbreviation": home}},
            {"homeAway": "away", "score": "99", "team": {"abbreviation": away}},
        ]}],
    }


def box(name):
    return {"home": [{"personId": 1, "name": name}], "away": []}


EMPTY = {"home": [], "away": []}


class TodaysGamesLoadingTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.object(live_games, "_cache", {}))
        self.enterContext(patch.object(live_games, "_WEEK_BOX_CACHE", {}))
        self.enterContext(patch.object(live_games, "_last_today", {"date": None, "games": []}))
        self.enterContext(patch.object(live_games, "_todays_date_str", return_value="20261109"))
        self.events = [event("a"), event("b"), event("c")]
        self.scoreboard = self.enterContext(
            patch.object(live_games, "_get", side_effect=lambda url, params=None: {"events": self.events}))

    def fetch_with(self, side_effect):
        return self.enterContext(patch.object(live_games, "_fetch_boxscore", side_effect=side_effect))

    def test_boxscores_are_fetched_at_the_same_time_and_keep_scoreboard_order(self):
        # Every fetch waits at the barrier until all three have arrived. Fetched one
        # at a time, the first would wait alone and time out (BrokenBarrierError).
        barrier = threading.Barrier(3, timeout=5)

        def fetch(game_id, home, away):
            barrier.wait()
            return box(game_id)

        self.fetch_with(fetch)
        self.events.insert(1, event("later", "pre"))
        games = live_games.get_todays_games()

        self.assertEqual([g["gameId"] for g in games], ["a", "later", "b", "c"])
        self.assertEqual([g["players"]["home"][0]["name"] for g in games if g["status"] == 2], ["a", "b", "c"])
        self.assertEqual(games[1]["players"], EMPTY)

    def test_one_failed_boxscore_does_not_affect_the_others(self):
        def fetch(game_id, home, away):
            if game_id == "b":
                raise RuntimeError("ESPN hiccup")
            return box(game_id)

        self.fetch_with(fetch)
        roster = [{"PLAYER_NAME": "Roster Player", "PLAYER_ID": 7, "TEAM": "LAL"}]
        games = live_games.get_todays_games(roster)

        self.assertEqual(games[0]["players"], box("a"))
        self.assertEqual(games[2]["players"], box("c"))
        # No box score yet for "b": it falls back to the season roster.
        self.assertEqual([p["personId"] for p in games[1]["players"]["home"]], [7])

    def test_failed_live_boxscore_reuses_the_previous_one(self):
        self.events = [event("a")]
        fetch = self.fetch_with([box("first"), EMPTY])

        self.assertEqual(live_games.get_todays_games()[0]["players"], box("first"))
        self.assertEqual(live_games.get_todays_games()[0]["players"], box("first"))
        self.assertEqual(fetch.call_count, 2)

    def test_final_boxscore_is_fetched_once(self):
        self.events = [event("a", "post"), event("b", "in")]
        fetch = self.fetch_with(lambda game_id, home, away: box(game_id))

        for _ in range(3):
            games = live_games.get_todays_games()

        self.assertEqual([g["players"] for g in games], [box("a"), box("b")])
        fetched = [call.args[0] for call in fetch.call_args_list]
        self.assertEqual(fetched.count("a"), 1)
        self.assertEqual(fetched.count("b"), 3)

    def test_game_that_goes_final_is_refetched_once_past_the_stale_summary(self):
        self.events = [event("a", "in")]
        fetch = self.fetch_with([box("live"), box("final")])
        summary_key = live_games._SUMMARY + str(sorted({"event": "a"}.items()))

        live_games.get_todays_games()
        live_games._cache[summary_key] = {"data": {"stale": True}, "ts": 1}
        self.events = [event("a", "post")]
        first = live_games.get_todays_games()
        again = live_games.get_todays_games()

        # The summary cached while the game was live is dropped before the final fetch.
        self.assertNotIn(summary_key, live_games._cache)
        self.assertEqual(first[0]["players"], box("final"))
        self.assertEqual(again[0]["players"], box("final"))
        self.assertEqual(fetch.call_count, 2)

    def test_scoreboard_failure_serves_the_last_slate_from_the_same_day(self):
        self.fetch_with(lambda game_id, home, away: box(game_id))
        good = live_games.get_todays_games()

        self.scoreboard.side_effect = lambda url, params=None: None
        self.assertEqual(live_games.get_todays_games(), good)

        # A new Eastern day must not show yesterday's games.
        live_games._todays_date_str.return_value = "20261110"
        self.assertEqual(live_games.get_todays_games(), [])

    def test_scoreboard_failure_with_no_earlier_slate_returns_empty(self):
        self.scoreboard.side_effect = lambda url, params=None: None
        self.assertEqual(live_games.get_todays_games(), [])


class RequestTimeoutTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.object(live_games, "_cache", {}))

    def test_boxscore_requests_give_up_sooner_than_other_requests(self):
        with patch.object(live_games.requests, "get", side_effect=requests.Timeout("slow")) as get:
            self.assertIsNone(live_games._get(live_games._SUMMARY, params={"event": "1"}))
            self.assertIsNone(live_games._get(live_games._SCOREBOARD, params={"dates": "20261109"}))

        timeouts = [call.kwargs["timeout"] for call in get.call_args_list]
        self.assertEqual(timeouts, [live_games.BOXSCORE_TIMEOUT, live_games.REQUEST_TIMEOUT])
        self.assertLess(live_games.BOXSCORE_TIMEOUT, live_games.REQUEST_TIMEOUT)


class UpcomingPageRosterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = create_app(load_data=False).test_client()

    def schedule(self, count):
        return [{"gameId": f"g{i}", "status": 1, "home": {"tricode": "LAL"}, "away": {"tricode": "DEN"},
                 "players": {"home": [], "away": []}} for i in range(count)]

    def get_page(self, query=""):
        with patch.object(games_routes, "get_upcoming_games", return_value=self.schedule(45)) as upcoming, \
             patch.object(live_games, "_roster_from_pkl", side_effect=lambda tri, _: [{"name": tri}]) as roster:
            response = self.client.get(f"/api/games/upcoming{query}")
        return response.get_json(), upcoming, roster

    def test_rosters_are_built_only_for_the_requested_page(self):
        body, upcoming, roster = self.get_page("?page=3")

        # 45 games: page 3 holds the last 5, so 10 rosters instead of 90.
        self.assertEqual(roster.call_count, 10)
        upcoming.assert_called_once_with(days=365)
        self.assertEqual([g["gameId"] for g in body["games"]], [f"g{i}" for i in range(40, 45)])

    def test_response_shape_is_unchanged(self):
        body, _, _ = self.get_page()

        self.assertEqual(set(body), {"games", "count", "total_pages", "page"})
        self.assertEqual((body["count"], body["total_pages"], body["page"]), (45, 3, 1))
        self.assertEqual(len(body["games"]), games_routes.UPCOMING_GAMES_PER_PAGE)
        self.assertEqual(body["games"][0]["players"], {"home": [{"name": "LAL"}], "away": [{"name": "DEN"}]})


if __name__ == "__main__":
    unittest.main()
