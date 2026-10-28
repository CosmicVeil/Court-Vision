import unittest
from datetime import date
from unittest.mock import MagicMock, Mock, patch

import app.services.game_archive as game_archive
from app import create_app
from app.api.routes import games as games_routes
from app.api.routes import players as players_routes

KEYS = ["minutes", "points", "fieldGoalsMade-fieldGoalsAttempted",
        "threePointFieldGoalsMade-threePointFieldGoalsAttempted", "freeThrowsMade-freeThrowsAttempted",
        "rebounds", "assists", "turnovers", "steals", "blocks", "offensiveRebounds",
        "defensiveRebounds", "fouls", "plusMinus"]


def athlete(pid, name, stats, starter=False, dnp=False, reason=""):
    return {"athlete": {"id": str(pid), "displayName": name, "jersey": "1", "position": {"abbreviation": "G"}},
            "starter": starter, "didNotPlay": dnp, "reason": reason, "ejected": False, "stats": stats}


def summary(completed=True):
    return {
        "header": {
            "id": "401", "season": {"year": 2026, "type": 2},
            "competitions": [{
                "date": "2026-03-11T02:30Z", "neutralSite": False,
                "status": {"type": {"completed": completed}},
                "competitors": [
                    {"id": "13", "homeAway": "home", "winner": True, "score": "120",
                     "team": {"abbreviation": "LAL"}, "record": [{"summary": "40-25"}],
                     "linescores": [{"displayValue": "30"}] * 4},
                    {"id": "9", "homeAway": "away", "winner": False, "score": "110",
                     "team": {"abbreviation": "GS"}, "record": [{"summary": "33-31"}],
                     "linescores": [{"displayValue": "25"}] * 4 + [{"displayValue": "10"}]},
                ],
            }],
        },
        "gameInfo": {"attendance": 18997, "venue": {"fullName": "Crypto.com Arena", "address": {"city": "Los Angeles"}},
                     "officials": [{"displayName": "Ref One"}]},
        "pickcenter": [{"spread": -2.5, "overUnder": 229.5,
                        "homeTeamOdds": {"moneyLine": -140}, "awayTeamOdds": {"moneyLine": 120}}],
        "boxscore": {
            "teams": [{"homeAway": "home", "statistics": [
                {"name": "fieldGoalsMade-fieldGoalsAttempted", "displayValue": "45-90"},
                {"name": "offensiveRebounds", "displayValue": "12"},
                {"name": "pointsInPaint", "displayValue": "58"}]}],
            "players": [
                {"team": {"id": "13", "abbreviation": "LAL"}, "statistics": [{"keys": KEYS, "athletes": [
                    athlete(1, "Luka Dončić", ["38", "35", "12-24", "4-10", "7-8", "9", "11", "4", "2", "0", "1", "8", "3", "+12"], starter=True),
                    athlete(2, "Bench Guy", [], dnp=True, reason="COACH'S DECISION"),
                ]}]},
                {"team": {"id": "9", "abbreviation": "GS"}, "statistics": [{"keys": KEYS, "athletes": [
                    athlete(3, "Stephen Curry", ["36:30", "30", "10-20", "6-12", "4-4", "5", "6", "3", "1", "0", "0", "5", "2", "-8"], starter=True),
                ]}]},
            ],
        },
    }


class ParseSummaryTests(unittest.TestCase):
    def test_not_final_returns_none(self):
        self.assertIsNone(game_archive.parse_summary(summary(completed=False)))

    def test_game_row(self):
        game = game_archive.parse_summary(summary())["game"]
        self.assertEqual(game["game_id"], "401")
        self.assertEqual(game["season_label"], "2025-26")
        self.assertEqual(game["game_date"], date(2026, 3, 10))  # 02:30Z is the previous evening in ET
        self.assertEqual((game["home_team"], game["away_team"]), ("LAL", "GSW"))
        self.assertEqual(game["away_periods"], [25, 25, 25, 25, 10])
        self.assertEqual(game["num_periods"], 5)
        self.assertEqual((game["spread"], game["home_moneyline"], game["away_moneyline"]), (-2.5, -140, 120))
        self.assertEqual(game["officials"], ["Ref One"])

    def test_team_row(self):
        team = game_archive.parse_summary(summary())["teams"][0]
        self.assertEqual((team["team"], team["opponent"], team["is_home"], team["won"]), ("LAL", "GSW", True, True))
        self.assertEqual((team["fgm"], team["fga"], team["oreb"], team["paint_pts"]), (45, 90, 12, 58))

    def test_player_rows(self):
        players = {p["player_name"]: p for p in game_archive.parse_summary(summary())["players"]}
        luka = players["Luka Dončić"]
        self.assertEqual(luka["player_key"], "luka doncic")
        self.assertEqual(luka["nba_player_id"], 1629029)
        self.assertEqual(luka["espn_player_id"], 1)
        self.assertEqual((luka["team"], luka["opponent"], luka["is_home"], luka["starter"]), ("LAL", "GSW", True, True))
        self.assertEqual((luka["minutes"], luka["pts"], luka["fg3m"], luka["fg3a"], luka["oreb"], luka["dreb"], luka["pf"], luka["plus_minus"]),
                         (38.0, 35, 4, 10, 1, 8, 3, 12))
        self.assertEqual(players["Stephen Curry"]["minutes"], 36.5)
        self.assertEqual(players["Stephen Curry"]["plus_minus"], -8)
        bench = players["Bench Guy"]
        self.assertTrue(bench["did_not_play"])
        self.assertEqual(bench["dnp_reason"], "COACH'S DECISION")
        self.assertIsNone(bench["pts"])


class EspnSeasonTypeTest(unittest.TestCase):
    def test_display_names_map_to_season_types(self):
        cases = [
            ("2024-25 Preseason", 1),
            ("2024-25 Regular Season", 2),
            ("2024-25 Postseason", 3),
            ("2024-25 Playoffs", 3),
            ("2024-25 Play-In Tournament", 5),
            ("2024-25 Postseason Play-In", 5),
            ("2024-25 Playoff Play-In", 5),
            (None, 2),
            ("", 2),
            ("2024-25 All-Star", 2),
        ]
        for display_name, expected in cases:
            with self.subTest(display_name=display_name):
                self.assertEqual(game_archive._espn_season_type(display_name), expected)


class EspnAthleteGamelogTest(unittest.TestCase):
    def setUp(self):
        game_archive._espn_athlete_cache.clear()
        self.addCleanup(game_archive._espn_athlete_cache.clear)

    def test_season_types_use_display_names_without_ids(self):
        entries = [
            ("401", "2024-25 Postseason"),
            ("402", "2024-25 Regular Season"),
            ("403", "2024-25 Preseason"),
            ("404", "2024-25 Play-In Tournament"),
            ("405", None),
        ]
        payload = {
            "labels": ["MIN", "FG", "3PT", "FT", "REB", "AST", "BLK", "STL", "PF", "TO", "PTS"],
            "events": {
                eid: {"gameDate": "2025-04-20T19:00Z", "opponent": {"abbreviation": "BOS"},
                      "atVs": "vs", "gameResult": "W", "score": "110-100"}
                for eid, _ in entries
            },
            "seasonTypes": [
                {**({"displayName": name} if name is not None else {}),
                 "categories": [{"events": [{"eventId": eid,
                                             "stats": ["30", "8-16", "2-5", "4-4", "6", "7", "1", "2", "3", "2", "22"]}]}]}
                for eid, name in entries
            ],
        }
        with patch.object(game_archive.requests, "get", return_value=Mock(status_code=200, json=lambda: payload)) as get:
            result = game_archive._fetch_espn_athlete_gamelog(123, 2025)
        self.assertEqual({g["game_id"]: g["season_type"] for g in result},
                         {"401": 3, "402": 2, "403": 1, "404": 5, "405": 2})
        get.assert_called_once()


class EmptyConnection:
    def execute(self, *args):
        return self

    def fetchall(self):
        return []

    def close(self):
        pass


class EspnSeasonAbsenceTests(unittest.TestCase):
    def setUp(self):
        for name in ("_espn_absence_cache", "_espn_team_tricode_cache", "_espn_athlete_cache"):
            cache = patch.dict(getattr(game_archive, name, {}), clear=True)
            cache.start()
            self.addCleanup(cache.stop)
        for name, value in (("_get_espn_athlete_id", 6475), ("_fetch_espn_athlete_gamelog", [])):
            patcher = patch.object(game_archive, name, return_value=value)
            mocked = patcher.start()
            self.addCleanup(patcher.stop)
            if name == "_fetch_espn_athlete_gamelog":
                self.gamelog = mocked
        self.eventlog = {
            "teams": {"9": {"id": "9"}},
            "events": {"count": 63, "items": [
                {"competition": {"$ref": f"https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/{401 + i}/competitions/{401 + i}?lang=en"},
                 "teamId": "9", "played": False} for i in range(63)
            ]},
        }
        self.reasons = {}
        self.team_abbreviations = {"9": "GS", "17": "BKN", "99": "EAST", "10": "GS"}
        request = patch.object(game_archive.requests, "get", side_effect=self.fake_get)
        self.get = request.start()
        self.addCleanup(request.stop)

    def fake_get(self, url, params=None, timeout=None):
        if url.endswith("/eventlog"):
            payload = self.eventlog
        elif "/teams/" in url:
            payload = {"team": {"abbreviation": self.team_abbreviations.get(url.rsplit("/", 1)[-1], "")}}
        elif url == game_archive._SUMMARY:
            reason = self.reasons.get(params["event"], "LEFT ACL SURGERY")
            payload = {"boxscore": {"players": [{"statistics": [{"athletes": [
                athlete(1, "Other player", [], dnp=True, reason="REST"),
                athlete(6475, "Klay Thompson", [], dnp=True, reason=reason),
            ]}]}]}}
        else:
            raise AssertionError(f"Unexpected request: {url}")
        return Mock(status_code=200, json=lambda: payload)

    def log(self, season="2019-2020", conn=None):
        return game_archive.player_game_log(conn or EmptyConnection(), 202691, season=season)

    def summary_ids(self):
        return [call.kwargs["params"]["event"] for call in self.get.call_args_list
                if call.args[0] == game_archive._SUMMARY]

    def assert_no_absence(self, result):
        self.assertIn("absence", result)
        self.assertIsNone(result["absence"])
        self.assertEqual(result["teams"], [])

    def test_all_unplayed_season_returns_teams_and_absence(self):
        result = self.log()
        self.assertEqual(result["teams"], ["GSW"])
        self.assertEqual(result["games"], [])
        self.assertEqual(result["absence"], {"reason": "Left ACL surgery", "reasons": ["Left ACL surgery"], "games_missed": 63})
        self.assertLessEqual(len(self.summary_ids()), 3)
        self.get.assert_any_call(
            "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2020/athletes/6475/eventlog",
            params={"limit": 100}, timeout=6)
        self.assertTrue(all(call.kwargs["timeout"] == 6 for call in self.get.call_args_list))

    def test_samples_first_middle_last_unplayed_games(self):
        self.log()
        self.assertEqual(self.summary_ids(), ["401", "432", "463"])

    def test_changing_reasons_are_distinct_in_season_order(self):
        self.reasons["432"] = "RIGHT ACHILLES TENDON SURGERY"
        result = self.log()
        self.assertIn("absence", result)
        self.assertEqual(result["absence"]["reasons"], ["Left ACL surgery", "Right achilles tendon surgery"])
        self.assertEqual(result["absence"]["reason"], "Left ACL surgery")

    def test_player_not_on_team_has_no_absence(self):
        self.eventlog = {"teams": {}, "events": {"count": 0, "items": []}}
        self.assert_no_absence(self.log())
        self.get.assert_called_once()
        self.assertTrue(self.get.call_args.args[0].endswith("/eventlog"))
        self.assert_no_absence(self.log())
        self.get.assert_called_once()

    def test_roster_without_events_has_no_absence(self):
        self.eventlog["events"] = {"count": 0, "items": []}
        self.assert_no_absence(self.log())
        self.assert_no_absence(self.log())
        self.get.assert_called_once()

    def test_network_error_degrades_to_empty(self):
        self.get.side_effect = game_archive.requests.RequestException("offline")
        self.assert_no_absence(self.log())
        self.assertEqual(game_archive._espn_absence_cache, {})
        self.get.side_effect = self.fake_get
        self.assertEqual(self.log()["teams"], ["GSW"])

    def test_non_200_eventlog_degrades_to_empty(self):
        self.get.side_effect = None
        self.get.return_value = Mock(status_code=503)
        self.assert_no_absence(self.log())
        self.assertEqual(game_archive._espn_absence_cache, {})
        self.get.assert_called_once()

    def test_absence_cached_per_athlete_and_season(self):
        first = self.log()
        self.assertEqual(first["teams"], ["GSW"])
        calls = self.get.call_count
        self.assertEqual(self.log(), first)
        self.assertEqual(self.get.call_count, calls)
        self.log(season="2020-2021")
        self.assertEqual(self.get.call_count, calls + 4)  # Team lookup is reused across seasons.
        with patch.object(game_archive, "_get_espn_athlete_id", return_value=3202):
            self.log()
        self.assertEqual(self.get.call_count, calls + 8)

    def test_played_season_has_null_absence_and_skips_eventlog(self):
        self.gamelog.return_value = [{**dict.fromkeys(game_archive._LOG_FIELDS),
                                      "game_id": "401", "date": "2020-01-01", "team": "GSW", "season_type": 2}]
        result = self.log()
        self.assertIn("absence", result)
        self.assertIsNone(result["absence"])
        self.assertEqual(result["teams"], ["GSW"])
        self.get.assert_not_called()

    def test_db_games_skip_espn_lookup(self):
        class PlayedConnection(EmptyConnection):
            def fetchall(self):
                return [{**dict.fromkeys(game_archive._LOG_FIELDS), "game_id": "401",
                         "game_date": date(2020, 1, 1), "team": "GSW", "opponent": "BOS",
                         "is_home": True, "home_score": 110, "away_score": 100, "season_type": 2}]

        result = self.log(conn=PlayedConnection())
        self.assertIn("absence", result)
        self.assertIsNone(result["absence"])
        self.assertEqual(result["teams"], ["GSW"])
        self.gamelog.assert_not_called()
        self.get.assert_not_called()

    def test_mock_connection_skips_absence_lookup(self):
        conn = MagicMock()
        conn.execute.return_value.fetchall.return_value = []
        self.assert_no_absence(self.log(conn=conn))
        self.get.assert_not_called()

    def test_partial_season_has_no_absence(self):
        self.eventlog["events"]["items"][31]["played"] = True
        self.assert_no_absence(self.log())
        self.assertEqual(self.summary_ids(), [])
        self.assert_no_absence(self.log())
        self.get.assert_called_once()

    def test_non_nba_team_result_is_cached(self):
        self.team_abbreviations["9"] = "EAST"
        self.assert_no_absence(self.log())
        calls = self.get.call_count
        self.assertEqual(calls, 2)
        self.assert_no_absence(self.log())
        self.assertEqual(self.get.call_count, calls)

    def test_events_without_team_ids_result_is_cached(self):
        self.eventlog["teams"] = {}
        for item in self.eventlog["events"]["items"]:
            del item["teamId"]
        self.assert_no_absence(self.log())
        self.assert_no_absence(self.log())
        self.get.assert_called_once()

    def test_unsuccessful_team_responses_are_not_cached(self):
        for response in (Mock(status_code=503),
                         Mock(status_code=200, json=lambda: {"team": {}})):
            with self.subTest(response=response):
                def failing_team(url, **kwargs):
                    if "/teams/" in url:
                        return response
                    return self.fake_get(url, **kwargs)

                self.get.side_effect = failing_team
                self.assert_no_absence(self.log())
                self.assertEqual(game_archive._espn_absence_cache, {})
                self.assertEqual(game_archive._espn_team_tricode_cache, {})
        self.get.side_effect = self.fake_get
        self.assertEqual(self.log()["teams"], ["GSW"])

    def test_teams_follow_event_order_then_remaining_roster_teams(self):
        self.eventlog["teams"] = {key: {"id": key} for key in ("17", "9", "99", "10", "unknown")}
        self.eventlog["events"]["items"][31]["teamId"] = "17"
        self.assertEqual(self.log()["teams"], ["GSW", "BKN"])

    def test_short_eventlogs_sample_each_game_once_and_fall_back_to_item_count(self):
        self.eventlog["events"] = {"items": self.eventlog["events"]["items"][:2]}
        result = self.log()
        self.assertIn("absence", result)
        self.assertEqual(result["absence"]["games_missed"], 2)
        self.assertEqual(self.summary_ids(), ["401", "402"])

    def test_count_includes_events_beyond_first_page(self):
        self.eventlog["events"]["count"] = 110
        result = self.log()
        self.assertIn("absence", result)
        self.assertEqual(result["absence"]["games_missed"], 110)
        self.assertEqual(self.summary_ids(), ["401", "432", "463"])

    def test_missing_summary_reasons_preserve_known_team_and_count(self):
        self.reasons = dict.fromkeys(("401", "432", "463"))
        result = self.log()
        self.assertEqual(result["teams"], ["GSW"])
        self.assertEqual(result["absence"], {"reason": None, "reasons": [], "games_missed": 63})
        calls = self.get.call_count
        self.assertEqual(self.log(), result)
        self.assertEqual(self.get.call_count, calls)

    def test_partial_team_failure_is_not_cached(self):
        self.eventlog["teams"]["17"] = {"id": "17"}
        for failure in (Mock(status_code=503), game_archive.requests.RequestException("offline")):
            with self.subTest(failure=failure):
                game_archive._espn_absence_cache.clear()
                game_archive._espn_team_tricode_cache.clear()

                def failing_team(url, **kwargs):
                    if url.endswith("/teams/17"):
                        if isinstance(failure, Exception):
                            raise failure
                        return failure
                    return self.fake_get(url, **kwargs)

                self.get.side_effect = failing_team
                self.assertEqual(self.log()["teams"], ["GSW"])
                self.assertEqual(game_archive._espn_absence_cache, {})
                self.get.side_effect = self.fake_get
                self.assertEqual(self.log()["teams"], ["GSW", "BKN"])
                self.assertIn((6475, 2020), game_archive._espn_absence_cache)

    def test_partial_summary_failure_is_not_cached(self):
        self.reasons["432"] = "RIGHT ACHILLES TENDON SURGERY"

        def failing_summary(url, **kwargs):
            if url == game_archive._SUMMARY and kwargs["params"]["event"] == "432":
                return Mock(status_code=503)
            return self.fake_get(url, **kwargs)

        self.get.side_effect = failing_summary
        self.assertEqual(self.log()["absence"]["reasons"], ["Left ACL surgery"])
        self.assertEqual(game_archive._espn_absence_cache, {})
        self.get.side_effect = self.fake_get
        self.assertEqual(self.log()["absence"]["reasons"],
                         ["Left ACL surgery", "Right achilles tendon surgery"])
        self.assertIn((6475, 2020), game_archive._espn_absence_cache)

    def test_summary_failures_preserve_known_team_and_count(self):
        def failing_summary(url, **kwargs):
            if url == game_archive._SUMMARY:
                if kwargs["params"]["event"] == "401":
                    raise game_archive.requests.RequestException("offline")
                return Mock(status_code=503)
            return self.fake_get(url, **kwargs)

        self.get.side_effect = failing_summary
        result = self.log()
        self.assertEqual(result["teams"], ["GSW"])
        self.assertEqual(result["absence"], {"reason": None, "reasons": [], "games_missed": 63})
        self.assertEqual(game_archive._espn_absence_cache, {})
        self.get.side_effect = self.fake_get
        self.assertEqual(self.log()["absence"]["reason"], "Left ACL surgery")
        self.assertIn((6475, 2020), game_archive._espn_absence_cache)

    def test_summary_reason_requires_matching_athlete_and_dnp(self):
        def unrelated_summary(url, **kwargs):
            if url == game_archive._SUMMARY:
                return Mock(status_code=200, json=lambda: {"boxscore": {"players": [{"statistics": [{"athletes": [
                    athlete(1, "Other player", [], dnp=True, reason="REST"),
                    athlete(6475, "Klay Thompson", [], dnp=False, reason="LEFT ACL SURGERY"),
                ]}]}]}})
            return self.fake_get(url, **kwargs)

        self.get.side_effect = unrelated_summary
        result = self.log()
        self.assertIn("absence", result)
        self.assertEqual(result["absence"]["reasons"], [])

    def test_team_lookup_failures_are_not_cached(self):
        def failing_team(url, **kwargs):
            if "/teams/" in url:
                raise game_archive.requests.RequestException("offline")
            return self.fake_get(url, **kwargs)

        self.get.side_effect = failing_team
        self.assert_no_absence(self.log())
        self.assertEqual(game_archive._espn_team_tricode_cache, {})
        self.get.side_effect = self.fake_get
        self.assertEqual(self.log()["teams"], ["GSW"])

    def test_reason_casing(self):
        formatter = getattr(game_archive, "_format_dnp_reason", None)
        self.assertTrue(callable(formatter), "DNP reason formatter exists")
        for raw, expected in (("LEFT ACL SURGERY", "Left ACL surgery"),
                              ("RIGHT MCL SPRAIN", "Right MCL sprain"),
                              ("RIGHT ACHILLES TENDON SURGERY", "Right achilles tendon surgery"),
                              ("PCL AND LCL SPRAINS", "PCL and LCL sprains"), ("", None), (None, None)):
            with self.subTest(raw=raw):
                self.assertEqual(formatter(raw), expected)

    def test_route_network_error_returns_200_with_null_absence(self):
        client = create_app(load_data=False).test_client()
        self.get.side_effect = game_archive.requests.RequestException("offline")
        with patch.object(players_routes.db, "get_db", return_value=EmptyConnection()):
            response = client.get("/api/players/202691/games?season=2019-2020")
        self.assertEqual(response.status_code, 200)
        self.assert_no_absence(response.get_json())


class AutoArchiveTests(unittest.TestCase):
    def setUp(self):
        game_archive._seen.clear()
        self.addCleanup(setattr, game_archive, "auto_archive_enabled", False)

    def test_disabled_by_default(self):
        with patch.object(game_archive._executor, "submit") as submit:
            game_archive.archive_finished_games([{"gameId": "1", "status": 3}])
        submit.assert_not_called()

    def test_queues_each_final_game_once(self):
        game_archive.auto_archive_enabled = True
        games = [{"gameId": "1", "status": 3}, {"gameId": "2", "status": 2}, {"gameId": "3", "status": 1}]
        with patch.object(game_archive._executor, "submit") as submit:
            game_archive.archive_finished_games(games)
            game_archive.archive_finished_games(games)
        submit.assert_called_once_with(game_archive._archive_in_background, "1")

    def test_today_route_hands_games_to_archive(self):
        client = create_app(load_data=False).test_client()
        games = [{"gameId": "1", "status": 3}]
        with patch.object(games_routes, "get_todays_games", return_value=games), \
             patch.object(games_routes, "archive_finished_games") as archive:
            self.assertEqual(client.get("/api/games/today").status_code, 200)
        archive.assert_called_once_with(games)


if __name__ == "__main__":
    unittest.main()
