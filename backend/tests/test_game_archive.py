import unittest
from datetime import date
from unittest.mock import patch

import app.services.game_archive as game_archive
from app import create_app
from app.api.routes import games as games_routes

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
