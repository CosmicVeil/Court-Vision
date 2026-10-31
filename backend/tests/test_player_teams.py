import os
import unittest
from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch

from app import create_app, db, state
from app.services import game_archive, live_games


def archive_row(player_id, team, day, hour=None):
    return {
        "nba_player_id": player_id, "team": team, "game_date": date(2026, 10, day),
        "tipoff": datetime(2026, 10, day, hour, tzinfo=timezone.utc) if hour is not None else None,
    }


class LatestPlayerTeamsTests(unittest.TestCase):
    def query(self, rows):
        self.assertTrue(callable(getattr(game_archive, "latest_player_teams", None)))
        conn = MagicMock()
        conn.execute.return_value.fetchall.return_value = rows
        return game_archive.latest_player_teams(conn), conn

    def test_picks_newest_game_date(self):
        result, _ = self.query([
            archive_row(1, "DAL", 15), archive_row(2, "BOS", 1, 20),
            archive_row(1, "LAL", 1, 23),
        ])
        self.assertEqual(result, {1: "DAL", 2: "BOS"})

    def test_same_date_breaks_tie_by_tipoff(self):
        rows = [archive_row(1, "DAL", 15, 23), archive_row(1, "LAL", 15, 20),
                archive_row(1, "BOS", 15)]
        for ordered_rows in (rows, list(reversed(rows))):
            with self.subTest(rows=ordered_rows):
                result, _ = self.query(ordered_rows)
                self.assertEqual(result, {1: "DAL"})

    def test_newest_non_nba_team_does_not_replace_latest_nba_team(self):
        result, _ = self.query([
            archive_row(1, "LAL", 1), archive_row(1, "DAL", 15),
            archive_row(1, "EAST", 20), archive_row(2, "LEB", 20),
        ])
        self.assertEqual(result, {1: "DAL"})

    def test_query_filters_nba_teams_before_selecting_latest_row(self):
        _, conn = self.query([])
        sql = " ".join(conn.execute.call_args.args[0].split())
        self.assertIn("AND p.team = ANY(%s)", sql)
        self.assertLess(sql.index("AND p.team = ANY(%s)"), sql.index("ORDER BY"))
        self.assertEqual(set(conn.execute.call_args.args[1][0]), set(live_games.TEAM_IDS))

    def test_skips_rows_without_nba_player_id_and_empty_result(self):
        for rows in ([], [archive_row(None, "LAL", 15)]):
            with self.subTest(rows=rows):
                result, _ = self.query(rows)
                self.assertEqual(result, {})

    def test_query_orders_by_date_then_tipoff(self):
        _, conn = self.query([])
        sql = " ".join(conn.execute.call_args.args[0].split())
        self.assertIn("DISTINCT ON (p.nba_player_id)", sql)
        self.assertIn("JOIN games g USING (game_id)", sql)
        self.assertIn("WHERE p.nba_player_id IS NOT NULL", sql)
        self.assertIn("ORDER BY p.nba_player_id, p.game_date DESC, g.tipoff DESC NULLS LAST", sql)


def event(game_id="live", status="in", home="LAL", away="DAL"):
    return {
        "id": game_id, "date": "2026-10-20T23:00Z",
        "status": {"type": {"state": status}},
        "competitions": [{"competitors": [
            {"homeAway": "home", "team": {"abbreviation": home}, "score": "100"},
            {"homeAway": "away", "team": {"abbreviation": away}, "score": "99"},
        ]}],
    }


class PlayerTeamsTestCase(unittest.TestCase):
    def setUp(self):
        self.addCleanup(setattr, state, "nba_data", state.nba_data)
        self.addCleanup(setattr, state, "nba_name_index", state.nba_name_index)
        state.nba_data = [
            {"PLAYER_ID": 1, "PLAYER_NAME": "Traded Player", "TEAM": "LAL", "POSITION": "G"},
            {"PLAYER_ID": 2, "PLAYER_NAME": "Other Player", "TEAM": "BOS", "POSITION": "F"},
        ]
        state.nba_name_index = {"traded player": state.nba_data[0], "other player": state.nba_data[1]}
        self.conn = MagicMock()
        self.conn.execute.return_value.fetchall.return_value = [archive_row(1, "DAL", 15)]
        self.enterContext(patch.dict(os.environ, {"DATABASE_URL": "postgresql://test.invalid/test"}))
        self.get_db = self.enterContext(patch.object(db, "get_db", return_value=self.conn))

    def apply_teams(self):
        self.assertTrue(callable(getattr(state, "apply_archive_teams", None)))
        return state.apply_archive_teams()


class StartupArchiveTeamsTests(PlayerTeamsTestCase):
    def test_all_star_rows_keep_latest_nba_team_or_pkl_team(self):
        self.conn.execute.return_value.fetchall.return_value = [
            archive_row(1, "DAL", 15), archive_row(1, "EAST", 20),
            archive_row(2, "WEST", 20),
        ]
        self.assertEqual(self.apply_teams(), 1)
        self.assertEqual([p["TEAM"] for p in state.nba_data], ["DAL", "BOS"])
        self.conn.close.assert_called_once_with()

    def test_applies_archive_team_to_matching_player(self):
        self.conn.execute.return_value.fetchall.return_value.append(archive_row(99, "NYK", 15))
        self.assertEqual(self.apply_teams(), 1)
        self.assertEqual([p["TEAM"] for p in state.nba_data], ["DAL", "BOS"])
        self.assertEqual(state.nba_name_index["traded player"]["TEAM"], "DAL")
        self.conn.close.assert_called_once_with()
        self.assertEqual(self.apply_teams(), 0)

    def test_db_unavailable_keeps_pkl_team(self):
        self.get_db.side_effect = RuntimeError("database unavailable")
        self.assertEqual(self.apply_teams(), 0)
        self.assertEqual(state.nba_data[0]["TEAM"], "LAL")

    def test_query_failure_keeps_pkl_team_and_closes_conn(self):
        self.conn.execute.side_effect = RuntimeError("query failed")
        self.assertEqual(self.apply_teams(), 0)
        self.assertEqual(state.nba_data[0]["TEAM"], "LAL")
        self.conn.close.assert_called_once_with()

    def test_no_database_url_skips_db(self):
        os.environ.pop("DATABASE_URL", None)
        self.assertEqual(self.apply_teams(), 0)
        self.get_db.assert_not_called()
        self.assertEqual(state.nba_data[0]["TEAM"], "LAL")

    def test_empty_player_data_skips_db(self):
        for players in (None, []):
            with self.subTest(players=players):
                state.nba_data = players
                self.assertEqual(self.apply_teams(), 0)
        self.get_db.assert_not_called()

    def test_empty_archive_keeps_pkl_team(self):
        self.conn.execute.return_value.fetchall.return_value = []
        self.assertEqual(self.apply_teams(), 0)
        self.assertEqual(state.nba_data[0]["TEAM"], "LAL")
        self.conn.close.assert_called_once_with()

    def test_initialize_applies_teams_after_db_init(self):
        self.enterContext(patch.object(game_archive, "auto_archive_enabled", False))
        self.enterContext(patch.object(state, "ai_available", False))
        for name in ("load_nba_data", "load_multi_season_data", "assign_player_ids", "load_ai", "load_current_season"):
            self.enterContext(patch.object(state, name))
        self.enterContext(patch.object(game_archive, "schedule_catch_up"))
        init_db = self.enterContext(patch.object(db, "init_db"))

        def connect_after_init():
            init_db.assert_called_once_with()
            return self.conn

        self.get_db.side_effect = connect_after_init
        state.initialize()
        self.assertEqual(state.nba_data[0]["TEAM"], "DAL")
        self.conn.close.assert_called_once_with()


class ApiReflectsTeamTests(PlayerTeamsTestCase):
    def setUp(self):
        super().setUp()
        self.client = create_app(load_data=False).test_client()

    def test_players_team_filter_uses_new_team(self):
        self.apply_teams()
        players = self.client.get("/api/players").get_json()["players"]
        self.assertEqual({p["id"]: p["team"] for p in players}, {1: "DAL", 2: "BOS"})
        new_team = self.client.get("/api/players?team=DAL").get_json()["players"]
        old_team = self.client.get("/api/players?team=LAL").get_json()["players"]
        self.assertEqual([p["id"] for p in new_team], [1])
        self.assertEqual(old_team, [])

    def test_teams_list_and_player_detail(self):
        self.apply_teams()
        self.assertEqual(self.client.get("/api/teams").get_json()["teams"], ["BOS", "DAL"])
        self.assertEqual(self.client.get("/api/players/1").get_json()["team"], "DAL")


class LiveBoxscoreTeamTests(PlayerTeamsTestCase):
    def setUp(self):
        super().setUp()
        self.enterContext(patch.object(live_games, "_cache", {}))
        self.boxscore = {"home": [], "away": [{"personId": 1, "name": "Traded Player"}]}
        self.scoreboard = self.enterContext(patch.object(live_games, "_get", return_value={"events": [event()]}))
        self.fetch = self.enterContext(patch.object(live_games, "_fetch_boxscore", return_value=self.boxscore))

    def test_live_boxscore_moves_player_and_rosters(self):
        self.scoreboard.return_value = {"events": [event(), event("scheduled", "pre", away="BOS")]}
        games = live_games.get_todays_games(state.nba_data)
        self.assertEqual(state.nba_data[0]["TEAM"], "DAL")
        self.assertEqual(games[0]["players"], self.boxscore)
        self.assertEqual(games[1]["players"]["home"], [])
        self.assertEqual([p["personId"] for p in live_games._roster_from_pkl("DAL", state.nba_data)], [1])
        self.assertEqual(live_games._roster_from_pkl("LAL", state.nba_data), [])
        self.assertEqual(state.nba_name_index["traded player"]["TEAM"], "DAL")
        client = create_app(load_data=False).test_client()
        self.assertEqual(client.get("/api/players/1").get_json()["team"], "DAL")
        self.assertEqual(client.get("/api/players?team=LAL").get_json()["players"], [])
        self.assertEqual(client.get("/api/players?team=DAL").get_json()["players"][0]["id"], 1)
        self.assertEqual(client.get("/api/teams").get_json()["teams"], ["BOS", "DAL"])
        self.fetch.assert_called_once_with("live", "LAL", "DAL")

    def test_final_boxscore_also_updates(self):
        self.scoreboard.return_value = {"events": [event(status="post")]}
        live_games.get_todays_games(state.nba_data)
        self.assertEqual(state.nba_data[0]["TEAM"], "DAL")

    def test_home_boxscore_updates_only_matching_ids(self):
        state.nba_data.append({"PLAYER_NAME": "Missing ID", "TEAM": "BOS"})
        self.boxscore["home"] = [{"personId": 2}, {"personId": 99}, {"personId": None}]
        self.boxscore["away"] = []
        live_games.get_todays_games(state.nba_data)
        self.assertEqual([p["TEAM"] for p in state.nba_data], ["LAL", "LAL", "BOS"])

    def test_scheduled_game_does_not_change_team(self):
        self.scoreboard.return_value = {"events": [event(status="pre")]}
        games = live_games.get_todays_games(state.nba_data)
        self.assertEqual(state.nba_data[0]["TEAM"], "LAL")
        self.assertEqual([p["personId"] for p in games[0]["players"]["home"]], [1])
        self.fetch.assert_not_called()

    def test_empty_boxscore_fallback_does_not_change_team(self):
        self.fetch.return_value = {"home": [], "away": []}
        games = live_games.get_todays_games(state.nba_data)
        self.assertEqual(state.nba_data[0]["TEAM"], "LAL")
        self.assertEqual([p["personId"] for p in games[0]["players"]["home"]], [1])

    def test_unknown_tricode_ignored(self):
        self.scoreboard.return_value = {"events": [event(away="UTAH")]}
        live_games.get_todays_games(state.nba_data)
        self.assertEqual(state.nba_data[0]["TEAM"], "LAL")

    def test_missing_season_data_still_returns_boxscore(self):
        for players in (None, []):
            with self.subTest(players=players):
                games = live_games.get_todays_games(players)
                self.assertEqual(games[0]["players"], self.boxscore)

    def test_unchanged_team_not_rewritten(self):
        self.assertTrue(hasattr(live_games, "_team_lock"))

        class UnchangedPlayer(dict):
            def __setitem__(self, key, value):
                raise AssertionError("Unchanged player should not be rewritten")

        state.nba_data[0] = UnchangedPlayer(state.nba_data[0], TEAM="DAL")
        with patch.object(live_games, "_team_lock") as lock:
            live_games.get_todays_games(state.nba_data)
        self.assertEqual(state.nba_data[0]["TEAM"], "DAL")
        lock.__enter__.assert_not_called()

    def test_team_write_holds_lock(self):
        self.assertTrue(hasattr(live_games, "_team_lock"))
        writes = []

        class LockedPlayer(dict):
            def __setitem__(self, key, value):
                if not live_games._team_lock.locked():
                    raise AssertionError("Team writes must hold the lock")
                writes.append((key, value))
                super().__setitem__(key, value)

        state.nba_data[0] = LockedPlayer(state.nba_data[0])
        live_games.get_todays_games(state.nba_data)
        self.assertEqual(writes, [("TEAM", "DAL")])
        self.assertEqual(state.nba_data[0]["TEAM"], "DAL")
        self.assertFalse(live_games._team_lock.locked())


if __name__ == "__main__":
    unittest.main()
