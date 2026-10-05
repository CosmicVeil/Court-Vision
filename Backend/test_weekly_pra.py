import importlib
import os
import sys
import types
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import live_games


def event(game_id, date, state="post", completed=True, home="LAL", away="DEN", season_type=2):
    return {
        "id": game_id, "date": date, "season": {"type": season_type},
        "status": {"type": {"state": state, "completed": completed}},
        "competitions": [{"competitors": [
            {"homeAway": "home", "score": "100", "team": {"abbreviation": home}},
            {"homeAway": "away", "score": "99", "team": {"abbreviation": away}},
        ]}],
    }


def player(name, pts, reb, ast, person_id=1):
    return {"personId": person_id, "name": name, "position": "G", "status": "ACTIVE",
            "pts": pts, "reb": reb, "ast": ast}


class WeeklyPraTests(unittest.TestCase):
    def setUp(self):
        live_games._cache.clear()
        live_games._WEEK_BOX_CACHE.clear()
        live_games._WEEK_DAY_CACHE.clear()
        self.now = datetime(2026, 10, 8, 12, tzinfo=live_games._ET)

    def test_week_boundaries_rollover_and_dst(self):
        self.assertEqual(tuple(map(str, live_games.current_week_bounds(datetime(2026, 10, 11, 23, 59, tzinfo=live_games._ET)))), ("2026-10-05", "2026-10-11"))
        self.assertEqual(tuple(map(str, live_games.current_week_bounds(datetime(2026, 10, 12, 0, 0, tzinfo=live_games._ET)))), ("2026-10-12", "2026-10-18"))
        self.assertEqual(tuple(map(str, live_games.current_week_bounds(datetime(2026, 10, 12, 3, 30, tzinfo=timezone.utc)))), ("2026-10-05", "2026-10-11"))
        self.assertEqual(tuple(map(str, live_games.current_week_bounds(datetime(2026, 11, 2, 4, 30, tzinfo=timezone.utc)))), ("2026-10-26", "2026-11-01"))
        self.assertEqual(tuple(map(str, live_games.current_week_bounds(datetime(2026, 3, 9, 3, 30, tzinfo=timezone.utc)))), ("2026-03-02", "2026-03-08"))

    def run_with(self, events_by_day, boxes, now=None):
        def fake_get(url, params=None):
            if url == live_games._SCOREBOARD:
                return {"events": events_by_day.get(params["dates"], [])}
            value = boxes.get(params["event"], {"home": [], "away": []})
            if isinstance(value, Exception):
                raise value
            return value
        def fake_box(game_id, home, away):
            value = boxes.get(game_id, {"home": [], "away": []})
            if isinstance(value, Exception):
                raise value
            return value
        with patch.object(live_games, "_get", side_effect=fake_get), patch.object(live_games, "_fetch_boxscore", side_effect=fake_box):
            return live_games.get_weekly_top_pra(now or self.now)

    def test_none_scheduled_and_postponed_are_ignored(self):
        scheduled = event("s", "2026-10-08T23:00Z", "pre", False)
        postponed = event("p", "2026-10-08T23:00Z", "post", False)
        with patch.object(live_games, "_get", return_value={"events": [scheduled, postponed]}), \
             patch.object(live_games, "_fetch_boxscore") as fetch:
            result = live_games.get_weekly_top_pra(self.now)
        self.assertIsNone(result["player"])
        self.assertEqual(result["week_start"], "2026-10-05")
        fetch.assert_not_called()

    def test_max_live_preseason_and_tie_breaks(self):
        early = event("early", "2026-10-06T00:00Z", season_type=1)
        later = event("later", "2026-10-08T00:00Z", "in", False)
        result = self.run_with(
            {"20261005": [early], "20261007": [later]},
            {"early": {"home": [player("Zed", 20, 10, 10)], "away": [player("Amy", 25, 10, 5)]},
             "later": {"home": [player("Winner", 30, 10, 11)], "away": []}},
        )
        self.assertEqual(result["player"]["name"], "Winner")
        self.assertTrue(result["player"]["is_live"])
        self.assertEqual(result["player"]["pra"], 51)
        self.assertEqual(set(result["player"]), {
            "name", "team", "position", "pts", "reb", "ast", "pra",
            "opponent", "game_id", "game_date", "is_live", "player_id",
        })
        live_games._WEEK_BOX_CACHE.clear()
        live_games._WEEK_DAY_CACHE.clear()
        tied = self.run_with(
            {"20261005": [early], "20261007": [later]},
            {"early": {"home": [player("Zed", 20, 10, 10), player("Amy", 20, 10, 10)], "away": []},
             "later": {"home": [player("Aaron", 20, 10, 10)], "away": []}},
        )
        self.assertEqual(tied["player"]["name"], "Amy")

    def test_preseason_is_counted_and_future_dates_are_not_requested(self):
        preseason = event("preseason", "2026-10-08T00:00Z", season_type=1)
        requested_dates = []

        def fake_get(url, params=None):
            if url == live_games._SCOREBOARD:
                requested_dates.append(params["dates"])
                return {"events": [preseason] if params["dates"] == "20261008" else []}
            return None

        with patch.object(live_games, "_get", side_effect=fake_get), \
             patch.object(live_games, "_fetch_boxscore", return_value={
                 "home": [player("Preseason Star", 10, 10, 10)], "away": [],
             }):
            result = live_games.get_weekly_top_pra(self.now)
        self.assertEqual(result["player"]["name"], "Preseason Star")
        self.assertEqual(requested_dates, ["20261005", "20261006", "20261007", "20261008"])

    def test_one_box_failure_does_not_break_result(self):
        bad = event("bad", "2026-10-06T00:00Z")
        good = event("good", "2026-10-07T00:00Z")
        result = self.run_with({"20261005": [bad], "20261006": [good]},
                               {"bad": RuntimeError("boom"), "good": {"home": [player("Good", 9, 8, 7)], "away": []}})
        self.assertEqual(result["player"]["name"], "Good")

    def test_final_cached_and_live_expires(self):
        final = event("final", "2026-10-06T00:00Z")
        live = event("live", "2026-10-08T00:00Z", "in", False)
        boxes = {"final": {"home": [player("Final", 1, 2, 3)], "away": []},
                 "live": {"home": [player("Live", 5, 5, 5)], "away": []}}
        with patch.object(live_games, "_weekly_events", return_value=[final, live]), \
             patch.object(live_games, "_fetch_boxscore", side_effect=lambda game_id, *_: boxes[game_id]) as fetch, \
             patch.object(live_games.time, "time", side_effect=[0, 0, 30, 30, 61, 61]):
            live_games.get_weekly_top_pra(self.now)
            live_games.get_weekly_top_pra(self.now)
            live_games.get_weekly_top_pra(self.now)
        self.assertEqual([call.args[0] for call in fetch.call_args_list], ["final", "live", "live"])

    def test_live_cache_is_refetched_before_becoming_final(self):
        game = {"gameId": "changing", "home": {"tricode": "LAL"}, "away": {"tricode": "DEN"}}
        stale = {"home": [player("Player", 1, 1, 1)], "away": []}
        fresh = {"home": [player("Player", 10, 10, 10)], "away": []}
        summary_key = live_games._SUMMARY + str(sorted({"event": "changing"}.items()))
        live_games._cache[summary_key] = {"data": {"stale": True}, "ts": 1}
        with patch.object(live_games, "_fetch_boxscore", side_effect=[stale, fresh]) as fetch, \
             patch.object(live_games.time, "time", return_value=10):
            self.assertEqual(live_games._weekly_boxscore(game, True), stale)
            self.assertEqual(live_games._weekly_boxscore(game, False), fresh)
        self.assertEqual(fetch.call_count, 2)
        self.assertNotIn(summary_key, live_games._cache)
        self.assertTrue(live_games._WEEK_BOX_CACHE["changing"]["final"])


class WeeklyPraEndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fake_db = types.ModuleType("db")
        fake_ai = types.ModuleType("nba_ai_system")
        for name in ["init_db", "get_db", "create_user_from_json", "authenticate_user_from_json",
                     "get_user_by_id", "get_saved_players", "save_player", "remove_saved_player"]:
            setattr(fake_db, name, MagicMock())
        for name in ["get_ai_predictions_bundle", "get_player_prediction", "initialize_nba_ai",
                     "nba_ai_system", "warm_predictions_cache"]:
            setattr(fake_ai, name, MagicMock())
        fake_ai.STAT_SCALE = {}
        with patch.dict(os.environ, {"LOW_MEMORY": "true"}), patch.dict(sys.modules, {"db": fake_db, "nba_ai_system": fake_ai}):
            sys.modules.pop("app", None)
            cls.module = importlib.import_module("app")
        cls.client = cls.module.app.test_client()

    def test_endpoint_shapes(self):
        empty = {"player": None, "week_start": "2026-10-05", "week_end": "2026-10-11"}
        with patch.object(self.module, "get_weekly_top_pra", return_value=empty):
            response = self.client.get("/api/stats/top-pra")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), empty)
        player_payload = {"name": "A", "team": "LAL", "position": "G", "pts": 1, "reb": 2,
                          "ast": 3, "pra": 6, "opponent": "DEN", "game_id": "1",
                          "game_date": "2026-10-05", "is_live": True, "player_id": 4}
        payload = {**empty, "player": player_payload}
        with patch.object(self.module, "get_weekly_top_pra", return_value=payload):
            response = self.client.get("/api/stats/top-pra")
        self.assertEqual(set(response.get_json()), {"player", "week_start", "week_end"})
        self.assertEqual(set(response.get_json()["player"]), set(player_payload))

    def test_endpoint_runs_real_selector_with_mocked_espn(self):
        started = event("route-game", "2026-10-07T23:00:00Z")
        fixed_now = datetime(2026, 10, 8, 12, tzinfo=live_games._ET)

        def fake_get(url, params=None):
            if url == live_games._SCOREBOARD:
                events = [started] if params["dates"] == "20261007" else []
                return {"events": events}
            return None

        live_games._WEEK_DAY_CACHE.clear()
        live_games._WEEK_BOX_CACHE.clear()
        with patch.object(live_games, "_get", side_effect=fake_get), \
             patch.object(live_games, "_fetch_boxscore", return_value={
                 "home": [player("Route Star", 20, 8, 7)], "away": [],
             }), \
             patch.object(self.module, "get_weekly_top_pra",
                          side_effect=lambda: live_games.get_weekly_top_pra(fixed_now)):
            response = self.client.get("/api/stats/top-pra")

        body = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(body), {"player", "week_start", "week_end"})
        self.assertEqual(body["player"]["name"], "Route Star")
        self.assertEqual(set(body["player"]), {
            "name", "team", "position", "pts", "reb", "ast", "pra",
            "opponent", "game_id", "game_date", "is_live", "player_id",
        })

    def test_predictions_cache_repairs_recommendation_names(self):
        cache = {"recommendations": {"PRA": [
            {"PLAYER_NAME": "Luka DonÄ\x8diÄ\x87", "PRA": 40},
            {"name": "Nikola JokiÄ\x87", "PRA": 39},
        ]}}
        repaired = self.module._repair_predictions_cache(cache)
        self.assertEqual(repaired["recommendations"]["PRA"][0]["PLAYER_NAME"], "Luka Dončić")
        self.assertEqual(repaired["recommendations"]["PRA"][1]["name"], "Nikola Jokić")
        self.assertEqual(repaired["recommendations"]["PRA"][0]["PRA"], 40)


if __name__ == "__main__":
    unittest.main()
