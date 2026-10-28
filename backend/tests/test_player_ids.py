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


def log_row(game_id, day, season_type=2, dnp=False, pts=20, is_home=True, team="LAL"):
    stats = dict(minutes=30.0, pts=pts, reb=5, oreb=1, dreb=4, ast=4, stl=1, blk=0, tov=2, pf=2,
                 fgm=8, fga=16, fg3m=2, fg3a=5, ftm=2, fta=2, plus_minus=5)
    if dnp:
        stats = {key: None for key in stats}
    return {"game_id": game_id, "game_date": date(2026, 3, day), "season_type": season_type,
            "season_label": "2025-26", "team": team, "opponent": "BOS", "is_home": is_home,
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
        self.assertEqual(result.get("teams"), [])

    def test_each_game_has_team(self):
        result = self.log([log_row("g2", 2), log_row("g1", 1)])
        self.assertEqual([g.get("team") for g in result["games"]], ["LAL", "LAL"])
        self.assertEqual(result.get("teams"), ["LAL"])

    def test_teams_in_chronological_order_after_trade(self):
        rows = [log_row("g4", 4, team="DAL"), log_row("g3", 3, team="DAL"),
                log_row("g2", 2, dnp=True), log_row("g1", 1, season_type=1)]
        result = self.log(rows)
        self.assertEqual([g.get("team") for g in result["games"]], ["DAL", "DAL", "LAL", "LAL"])
        self.assertEqual(result.get("teams"), ["LAL", "DAL"])
        self.assertEqual(self.log(rows, limit=1).get("teams"), ["LAL", "DAL"])

    def test_teams_are_distinct_even_when_player_returns_to_team(self):
        result = self.log([log_row("g3", 3), log_row("g2", 2, team="DAL"), log_row("g1", 1)])
        self.assertEqual(result.get("teams"), ["LAL", "DAL"])

    def test_teams_ignore_non_nba_all_star_teams(self):
        rows = [log_row("g4", 4), log_row("g3", 3, team="WORLD"),
                log_row("g2", 2, team="EAST"), log_row("g1", 1)]
        result = self.log(rows)
        self.assertEqual(result.get("teams"), ["LAL"])
        self.assertEqual([g.get("team") for g in result["games"]], ["LAL", "WORLD", "EAST", "LAL"])
        self.assertEqual([g["game_id"] for g in result["games"]], ["g4", "g3", "g2", "g1"])

    def test_missing_team_falls_back_to_unk(self):
        missing = log_row("g1", 1)
        del missing["team"]
        rows = [log_row("g4", 4, team="UNK"), log_row("g3", 3, team=""),
                log_row("g2", 2, team=None), missing]
        result = self.log(rows)
        self.assertEqual([g.get("team") for g in result["games"]], ["UNK"] * 4)
        self.assertEqual(result.get("teams"), [])

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


class EspnGamelogTeamTests(unittest.TestCase):
    def setUp(self):
        cache = patch.dict(game_archive._espn_athlete_cache, clear=True)
        cache.start()
        self.addCleanup(cache.stop)
        request = patch.object(game_archive.requests, "get")
        self.request = request.start()
        self.addCleanup(request.stop)
        self.request.return_value.status_code = 200

    def payload(self, teams):
        events = {}
        entries = []
        for day, team in enumerate(teams, start=1):
            eid = str(day)
            events[eid] = {"gameDate": f"2025-03-{day:02d}T19:00:00Z",
                           "opponent": {"abbreviation": "BOS"}, "atVs": "vs",
                           "gameResult": "W", "score": "110-100"}
            if team is not None:
                events[eid]["team"] = team
            entries.append({"eventId": eid, "stats": ["30", "20", "5", "4", "1", "0", "2", "2", "8-16", "2-5", "2-2"]})
        return {"labels": ["MIN", "PTS", "REB", "AST", "STL", "BLK", "TO", "PF", "FG", "3PT", "FT"],
                "events": events, "seasonTypes": [{"id": 2, "categories": [{"events": entries}]}]}

    def test_espn_games_include_team_tricode(self):
        self.request.return_value.json.return_value = self.payload([
            {"abbreviation": "GS"}, {"abbreviation": "SA"}, {"abbreviation": "LAL"}])
        games = game_archive._fetch_espn_athlete_gamelog(1, 2025)
        self.assertEqual([g.get("team") for g in games], ["LAL", "SAS", "GSW"])

    def test_espn_missing_team_is_unk(self):
        payload = self.payload([None, {}, {"abbreviation": ""}, {"abbreviation": None}, None])
        payload["events"]["5"]["team"] = None
        self.request.return_value.json.return_value = payload
        games = game_archive._fetch_espn_athlete_gamelog(1, 2025)
        self.assertEqual([g.get("team") for g in games], ["UNK"] * 5)

    def test_espn_fallback_returns_teams_list(self):
        class EmptyConnection:
            def execute(self, *args):
                return self

            def fetchall(self):
                return []

        self.request.return_value.json.return_value = self.payload([
            {"abbreviation": "LAL"}, None, {"abbreviation": "LAL"},
            {"abbreviation": "DAL"}, {"abbreviation": "DAL"}])
        with patch.object(game_archive, "_get_espn_athlete_id", return_value=1):
            result = game_archive.player_game_log(EmptyConnection(), 2544, season="2024-2025")
            limited = game_archive.player_game_log(EmptyConnection(), 2544, limit=1, season="2024-2025")
        self.assertEqual([g.get("team") for g in result["games"]], ["DAL", "DAL", "LAL", "UNK", "LAL"])
        self.assertEqual(result.get("teams"), ["LAL", "DAL"])
        self.assertEqual(limited.get("teams"), ["LAL", "DAL"])


class GameLogSeasonTests(unittest.TestCase):
    def test_season_rolls_over_on_october_first(self):
        self.assertEqual(game_archive.current_season_year(date(2026, 9, 30)), 2026)
        self.assertEqual(game_archive.current_season_year(date(2026, 10, 1)), 2027)
        self.assertEqual(game_archive.current_season_year(date(2027, 6, 15)), 2027)

    def test_available_seasons_run_newest_to_first_espn_season(self):
        seasons = game_archive.available_seasons(date(2026, 10, 22))
        self.assertEqual(seasons[:2], ["2026-2027", "2025-2026"])
        self.assertEqual(seasons[-1], "1993-1994")
        self.assertEqual(len(seasons), 2027 - game_archive.FIRST_GAME_LOG_SEASON + 1)

    def test_available_seasons_add_next_season_after_rollover(self):
        self.assertEqual(game_archive.available_seasons(date(2027, 10, 1))[0], "2027-2028")
        self.assertEqual(game_archive.available_seasons(date(2027, 9, 30))[0], "2026-2027")

    def test_missing_or_invalid_season_resolves_to_current(self):
        with patch.object(game_archive, "current_season_year", return_value=2031):
            for value in (None, "current", "latest", "nonsense"):
                with self.subTest(value=value):
                    self.assertEqual(game_archive._resolve_season(value), (2031, "2030-2031"))
            self.assertEqual(game_archive._resolve_season("1998-99"), (1999, "1998-1999"))


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

    def test_season_param_passes_through(self):
        payload = {"player_id": 2544, "games": [], "averages": {}, "season": "2024-2025"}
        with patch.object(players_routes.db, "get_db"), \
             patch.object(players_routes.game_archive, "player_game_log", return_value=payload) as log:
            response = self.client.get("/api/players/2544/games?season=2024-2025")
            self.assertEqual(response.get_json(), payload)
            self.assertEqual(log.call_args.kwargs.get("season"), "2024-2025")

    def test_database_error_is_503(self):
        with patch.object(players_routes.db, "get_db", side_effect=RuntimeError("down")):
            response = self.client.get("/api/players/2544/games")
        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()
