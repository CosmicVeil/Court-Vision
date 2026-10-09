import unittest
from datetime import date
from unittest.mock import MagicMock, patch

import app.services.game_archive as game_archive
from app import create_app
from app.api.routes import players as players_routes
from app.utils import player_ids

SEASON_DATA = {
    2025: [{"PLAYER_NAME": "Nate Williams", "NBA_PLAYER_ID": 1631466}],
    2026: [{"PLAYER_NAME": "Two Way Rookie", "NBA_PLAYER_ID": 1643999}],
}


class PlayerIdTests(unittest.TestCase):
    def setUp(self):
        player_ids.reset_index()
        patcher = patch.object(player_ids, "_season_data", return_value=SEASON_DATA)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(player_ids.reset_index)

    def test_bundled_nba_api_list(self):
        self.assertEqual(player_ids.nba_player_id("LeBron James"), 2544)
        self.assertEqual(player_ids.nba_player_id("Luka Doncic"), 1629029)  # accents and case ignored

    def test_season_data_covers_players_missing_from_nba_api(self):
        self.assertEqual(player_ids.nba_player_id("Two Way Rookie"), 1643999)

    def test_season_data_breaks_name_ties(self):
        # nba_api lists two retired "Nate Williams"; the season data knows the current one.
        self.assertEqual(player_ids.nba_player_id("Nate Williams"), 1631466)

    def test_aliases(self):
        self.assertEqual(player_ids.nba_player_id("Ron Holland"), player_ids.nba_player_id("Ronald Holland II"))

    def test_unknown_name_gets_stable_fallback_outside_nba_range(self):
        self.assertIsNone(player_ids.nba_player_id("Nobody Real"))
        fallback = player_ids.player_id_for("Nobody Real")
        self.assertGreaterEqual(fallback, player_ids.FALLBACK_ID_BASE)
        self.assertEqual(fallback, player_ids.player_id_for("nobody real"))


def log_row(game_id, day, season_type=2, dnp=False, pts=20, is_home=True):
    stats = dict(minutes=30.0, pts=pts, reb=5, oreb=1, dreb=4, ast=4, stl=1, blk=0, tov=2, pf=2,
                 fgm=8, fga=16, fg3m=2, fg3a=5, ftm=2, fta=2, plus_minus=5)
    if dnp:
        stats = {key: None for key in stats}
    return {"game_id": game_id, "game_date": date(2026, 3, day), "season_type": season_type,
            "season_label": "2025-26", "opponent": "BOS", "is_home": is_home,
            "home_score": 110, "away_score": 100, "starter": True, "did_not_play": dnp,
            "dnp_reason": "REST" if dnp else None, **stats}


class GameLogTests(unittest.TestCase):
    def log(self, rows, limit=10):
        conn = MagicMock()
        conn.execute.return_value.fetchall.return_value = rows
        return game_archive.player_game_log(conn, 2544, limit)

    def test_empty(self):
        result = self.log([])
        self.assertEqual(result["games"], [])
        self.assertIsNone(result["averages"]["season"])

    def test_games_and_averages(self):
        rows = [log_row("g4", 4, pts=30, is_home=False), log_row("g3", 3, dnp=True),
                log_row("g2", 2, pts=10), log_row("g1", 1, season_type=1, pts=50)]
        result = self.log(rows, limit=3)
        self.assertEqual([g["game_id"] for g in result["games"]], ["g4", "g3", "g2"])
        self.assertEqual((result["games"][0]["result"], result["games"][0]["score"]), ("L", "100-110"))
        self.assertEqual((result["games"][2]["result"], result["games"][2]["score"]), ("W", "110-100"))
        season = result["averages"]["season"]
        self.assertEqual((season["games"], season["pts"], season["fg_pct"]), (2, 20.0, 50.0))  # DNP and preseason skipped

    def test_preseason_counts_when_it_is_all_there_is(self):
        result = self.log([log_row("p1", 1, season_type=1, pts=12)])
        self.assertEqual(result["averages"]["last5"]["pts"], 12.0)


class GameLogRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = create_app(load_data=False).test_client()

    def test_returns_log(self):
        payload = {"player_id": 2544, "games": [], "averages": {}}
        with patch.object(players_routes.db, "get_db"), \
             patch.object(players_routes.game_archive, "player_game_log", return_value=payload) as log:
            response = self.client.get("/api/players/2544/games?limit=500")
        self.assertEqual(response.get_json(), payload)
        self.assertEqual(log.call_args.args[1:], (2544, 200))  # limit clamped

    def test_full_season_limit_passes_through(self):
        payload = {"player_id": 2544, "games": [], "averages": {}}
        with patch.object(players_routes.db, "get_db"), \
             patch.object(players_routes.game_archive, "player_game_log", return_value=payload) as log:
            for limit in (200, 150):
                with self.subTest(limit=limit):
                    self.client.get(f"/api/players/2544/games?limit={limit}")
                    self.assertEqual(log.call_args.args[1:], (2544, limit))

    def test_limit_lower_bound_and_default(self):
        payload = {"player_id": 2544, "games": [], "averages": {}}
        with patch.object(players_routes.db, "get_db"), \
             patch.object(players_routes.game_archive, "player_game_log", return_value=payload) as log:
            for query, expected in (("?limit=0", 1), ("?limit=-5", 1), ("", 10)):
                with self.subTest(query=query):
                    self.client.get(f"/api/players/2544/games{query}")
                    self.assertEqual(log.call_args.args[1:], (2544, expected))

    def test_database_error_is_503(self):
        with patch.object(players_routes.db, "get_db", side_effect=RuntimeError("down")):
            response = self.client.get("/api/players/2544/games")
        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()
