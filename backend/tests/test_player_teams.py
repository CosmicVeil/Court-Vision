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


def observation(team, day, hour=None):
    row = archive_row(None, team, day, hour)
    return row["team"], row["game_date"], row["tipoff"]


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
        self.assertEqual(result, {1: observation("DAL", 15), 2: observation("BOS", 1, 20)})

    def test_same_date_breaks_tie_by_tipoff(self):
        rows = [archive_row(1, "DAL", 15, 23), archive_row(1, "LAL", 15, 20),
                archive_row(1, "BOS", 15)]
        for ordered_rows in (rows, list(reversed(rows))):
            with self.subTest(rows=ordered_rows):
                result, _ = self.query(ordered_rows)
                self.assertEqual(result, {1: observation("DAL", 15, 23)})

    def test_newest_non_nba_team_does_not_replace_latest_nba_team(self):
        result, _ = self.query([
            archive_row(1, "LAL", 1), archive_row(1, "DAL", 15),
            archive_row(1, "EAST", 20), archive_row(2, "LEB", 20),
        ])
        self.assertEqual(result, {1: observation("DAL", 15)})

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
        self.assertIn("AND p.did_not_play IS NOT TRUE", sql)
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
        self.enterContext(patch.object(state, "live_team_rows", {}))
        state.nba_data = [
            {"PLAYER_ID": 1, "PLAYER_NAME": "Traded Player", "TEAM": "LAL", "POSITION": "G"},
            {"PLAYER_ID": 2, "PLAYER_NAME": "Other Player", "TEAM": "BOS", "POSITION": "F"},
        ]
        state.nba_name_index = {"traded player": state.nba_data[0], "other player": state.nba_data[1]}
        self.conn = MagicMock()
        self.conn.execute.return_value.fetchall.return_value = [archive_row(1, "DAL", 15)]
        self.enterContext(patch.dict(os.environ, {"DATABASE_URL": "postgresql://test.invalid/test"}))
        self.get_db = self.enterContext(patch.object(db, "get_db", return_value=self.conn))
        # Offline: the routes' injury report (an ESPN call) is empty in these tests.
        self.enterContext(patch("app.services.injuries.get_injuries", return_value={}))

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
        for name in ("load_nba_data", "load_multi_season_data", "assign_player_ids", "load_ai", "load_current_season",
                     "start_prediction_accuracy", "start_live_refresh"):
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

    def test_player_team_lookup_includes_archive_only_players_and_prefers_synced_team(self):
        self.apply_teams()
        archive_players = [{"PLAYER_ID": 1, "TEAM": "LAL"}, {"PLAYER_ID": 3, "TEAM": "OKC"}]
        with patch.object(state, "current_season_data", archive_players):
            response = self.client.get("/api/players/teams")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["teams_by_player_id"], {"1": "DAL", "2": "BOS", "3": "OKC"})

    def test_background_archive_updates_player_card_search_and_cached_predictions(self):
        self.apply_teams()
        self.conn.execute.return_value.fetchall.return_value = [archive_row(1, "OKC", 21)]
        cached_row = {"id": 1, "name": "Traded Player", "team": "DAL", "position": "G"}
        with patch.object(game_archive, "archived_game_ids", return_value=set()), \
             patch.object(game_archive, "archive_game", return_value=True), \
             patch.object(state, "load_current_season"), \
             patch.object(state, "is_render", True), patch.object(state, "ai_available", True), \
             patch.object(state, "predictions_cache", {"all_players_list": [cached_row]}):
            game_archive._archive_in_background("trade-debut")
            self.assertEqual(self.client.get("/api/players/1").get_json()["team"], "OKC")
            search = self.client.get("/api/players/search-all?query=traded").get_json()["players"]
            self.assertEqual(search[0]["team"], "OKC")
            predictions = self.client.get("/api/predictions?team=OKC").get_json()["predictions"]
            self.assertEqual(predictions[0]["team"], "OKC")
            self.assertEqual(cached_row["team"], "DAL")

    def test_background_catch_up_updates_player_card_without_a_live_request(self):
        with patch.object(game_archive, "catch_up_recent_games", return_value={"archived": 1}), \
             patch.object(game_archive, "relink_player_ids", return_value=0), \
             patch.object(game_archive, "fill_missing_bios", return_value=0), \
             patch.object(state, "load_current_season"):
            game_archive._catch_up_in_background()
        self.assertEqual(self.client.get("/api/players/1").get_json()["team"], "DAL")


class LiveBoxscoreTeamTests(PlayerTeamsTestCase):
    def setUp(self):
        super().setUp()
        self.enterContext(patch.object(live_games, "_cache", {}))
        self.enterContext(patch.object(live_games, "_WEEK_BOX_CACHE", {}))
        self.enterContext(patch.object(live_games, "_late_night_date_str", return_value=None))
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

    def test_live_debut_updates_all_current_views_before_archive(self):
        veteran = state.nba_data[0]
        current = dict(veteran, PPG_LAST=15)
        returning = {"PLAYER_ID": 3, "PLAYER_NAME": "Returning Player", "TEAM": "LAL", "POSITION": "G"}
        historic = {2026: [dict(veteran), dict(returning)]}
        prediction = {"id": 1, "name": veteran["PLAYER_NAME"], "team": "LAL", "position": "G"}
        model_row = {"PLAYER_NAME": veteran["PLAYER_NAME"], "TEAM": "LAL", "PREDICTED_PPG": 20}
        cache = {"all_players_list": [prediction], "bundle": {"top_scorers": [model_row]},
                 "recommendations": {"PPG": [model_row]}}
        self.boxscore["away"].append({"personId": 3, "name": "Returning Player"})
        with patch.object(state, "current_season_data", [current, dict(returning)]), \
             patch.object(state, "current_season_year", 2027), \
             patch.object(state, "multi_season_data", historic), \
             patch.object(state, "is_render", True), patch.object(state, "ai_available", True), \
             patch.object(state, "predictions_cache", cache), \
             patch("app.auth.get_db") as auth_db, \
             patch.object(game_archive, "archive_finished_games") as archive, \
             patch.object(state.time, "sleep", side_effect=InterruptedError):
            auth_db.return_value.execute.return_value.fetchone.return_value = {"user_id": 7}
            with self.assertRaises(InterruptedError):
                state._refresh_live_games()
            archive.assert_called_once()
            client = create_app(load_data=False).test_client()
            self.assertEqual(client.get("/api/players/1").get_json()["team"], "DAL")
            self.assertEqual(client.get("/api/players/3").get_json()["team"], "DAL")
            self.assertEqual(client.get("/api/players/teams").get_json()["teams_by_player_id"]["3"], "DAL")
            for year in ("", "&year=2027"):
                players = client.get("/api/players?team=DAL" + year).get_json()["players"]
                self.assertEqual({p["id"] for p in players}, {1, 3})
            self.assertEqual(client.get("/api/players?team=LAL").get_json()["players"], [])
            old_rows = client.get("/api/players?team=LAL&year=2026").get_json()["players"]
            self.assertEqual({p["id"] for p in old_rows}, {1, 3})
            self.assertEqual(client.get("/api/predictions?team=DAL").get_json()["predictions"][0]["team"], "DAL")
            bundle = client.get("/api/ai-predictions").get_json()["predictions"]
            self.assertEqual(bundle["top_scorers"][0]["TEAM"], "DAL")
            recommendations = client.get("/api/recommendations/PPG", headers={"Authorization": "Bearer valid"})
            self.assertEqual(recommendations.status_code, 200)
            self.assertEqual(recommendations.get_json()[0]["TEAM"], "DAL")
            self.assertEqual(recommendations.get_json()[0]["PREDICTED_PPG"], 20)
        self.assertEqual(current["TEAM"], "LAL")
        self.assertEqual(model_row["TEAM"], "LAL")

    def test_dnp_boxscore_does_not_change_team(self):
        self.boxscore["away"][0]["status"] = "DNP"
        live_games.get_todays_games(state.nba_data)
        self.assertEqual(state.nba_data[0]["TEAM"], "LAL")

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
        self.scoreboard.return_value = {"events": [event(away="XXX")]}
        live_games.get_todays_games(state.nba_data)
        self.assertEqual(state.nba_data[0]["TEAM"], "LAL")

    def test_espn_utah_abbreviation_maps_to_uta(self):
        # ESPN sends "UTAH"; the season data and TEAM_IDS use "UTA".
        state.nba_data.append({"PLAYER_NAME": "Jazz Player", "PLAYER_ID": 3, "TEAM": "UTA"})
        self.scoreboard.return_value = {"events": [event("scheduled", "pre", away="UTAH")]}
        game = live_games.get_todays_games(state.nba_data)[0]
        self.assertEqual(game["away"]["tricode"], "UTA")
        self.assertEqual(game["away"]["logo"], live_games.TEAM_LOGOS["UTA"])
        self.assertEqual([p["personId"] for p in game["players"]["away"]], [3])

    def test_missing_season_data_still_returns_boxscore(self):
        for players in (None, []):
            with self.subTest(players=players):
                games = live_games.get_todays_games(players)
                self.assertEqual(games[0]["players"], self.boxscore)

    def test_unchanged_team_records_recency_without_rewriting_the_label(self):
        class UnchangedPlayer(dict):
            def __setitem__(self, key, value):
                if key == "TEAM":
                    raise AssertionError("Unchanged team should not be rewritten")
                super().__setitem__(key, value)

        state.nba_data[0] = UnchangedPlayer(state.nba_data[0], TEAM="DAL")
        live_games.get_todays_games(state.nba_data)
        self.conn.execute.return_value.fetchall.return_value = [archive_row(1, "LAL", 19)]
        self.assertEqual(self.apply_teams(), 0)
        self.assertEqual(state.nba_data[0]["TEAM"], "DAL")

    def test_older_live_boxscore_does_not_undo_archive_update(self):
        self.conn.execute.return_value.fetchall.return_value = [archive_row(1, "OKC", 21)]
        self.apply_teams()
        live_games.get_todays_games(state.nba_data)
        self.assertEqual(state.nba_data[0]["TEAM"], "OKC")

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
        self.assertIn(("TEAM", "DAL"), writes)
        self.assertEqual(state.nba_data[0]["TEAM"], "DAL")
        self.assertFalse(live_games._team_lock.locked())


if __name__ == "__main__":
    unittest.main()
