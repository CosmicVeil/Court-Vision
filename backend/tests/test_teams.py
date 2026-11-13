"""Offline contracts for the team archive reader and /api/teams endpoints."""
import unittest
from copy import deepcopy
from datetime import date
from unittest.mock import patch

from app import create_app, state
from app.api.routes import teams
from app.services import game_archive
from app.services.live_games import TEAM_LOGOS


def game_row(game_id="401", **overrides):
    return {
        "game_id": game_id, "game_date": date(2026, 3, 11), "season_type": 2,
        "home_team": "LAL", "away_team": "BOS", "home_score": 123,
        "away_score": 112, "num_periods": 4, **overrides,
    }


def player_row(player_id=1, name="Test Player", **overrides):
    return {
        "PLAYER_ID": player_id, "PLAYER_NAME": name, "TEAM": "LAL",
        "POSITION": "G", "AGE": 25.0, "GAMES_PLAYED_LAST": 12,
        "PPG_LAST": 22.26, "RPG_LAST": 5.14, "APG_LAST": 6.78,
        "SPG_LAST": 1.26, "BPG_LAST": 0.84, "TOV_LAST": 2.34,
        "FG_PCT_LAST": 0.4567, "FG3_PCT_LAST": 0.3784, "FT_PCT_LAST": 0.8126,
        **overrides,
    }


class Connection:
    """Returns supplied query results; deliberately does not emulate PostgreSQL."""
    def __init__(self, rows=(), failure=None, close_failure=None):
        self.rows = list(rows)
        self.listed = []
        self.listed_failure = None
        self.failure = failure
        self.close_failure = close_failure
        self.calls = []
        self.close_calls = 0

    def execute(self, sql, params):
        self.calls.append((sql, params))
        if self.failure:
            raise self.failure
        return self

    def fetchall(self):
        if "latest WHERE team" in self.calls[-1][0]:
            if self.listed_failure:
                raise self.listed_failure
            return self.listed
        return self.rows

    def close(self):
        self.close_calls += 1
        if self.close_failure:
            raise self.close_failure


class TeamSeasonGamesTests(unittest.TestCase):
    def test_query_scopes_season_and_both_sides_excludes_preseason_and_orders_newest(self):
        conn = Connection()
        self.assertEqual(game_archive.team_season_games(conn, "LAL", 2026), [])
        self.assertEqual(len(conn.calls), 1)
        sql, params = conn.calls[0]
        sql = " ".join(sql.upper().split())
        self.assertEqual(params, (2026, "LAL", "LAL"))
        self.assertIn("FROM GAMES WHERE SEASON = %S", sql)
        self.assertIn("SEASON_TYPE <> 1", sql)
        self.assertIn("(HOME_TEAM = %S OR AWAY_TEAM = %S)", sql)
        self.assertIn("ORDER BY GAME_DATE DESC, TIPOFF DESC NULLS LAST, GAME_ID DESC", sql)
        self.assertNotIn("LIMIT", sql)
        self.assertEqual(conn.close_calls, 0)  # Caller owns the connection.

    def test_home_win_complete_payload(self):
        result = game_archive.team_season_games(Connection([game_row()]), "LAL", 2026)
        self.assertEqual(result, [{
            "game_id": "401", "date": "2026-03-11", "season_type": 2,
            "is_home": True, "opponent": "BOS", "opponent_name": "Boston Celtics",
            "opponent_logo": TEAM_LOGOS["BOS"], "result": "W", "score": "123-112",
            "overtimes": 0,
        }])

    def test_home_and_away_wins_and_losses_keep_teams_score_first(self):
        for team, home, away, result, score in [
            ("LAL", 90, 100, "L", "90-100"),
            ("BOS", 90, 100, "W", "100-90"),
            ("BOS", 100, 90, "L", "90-100"),
            ("LAL", 0, 1, "L", "0-1"),
        ]:
            with self.subTest(team=team, home=home, away=away):
                game = game_archive.team_season_games(
                    Connection([game_row(home_score=home, away_score=away)]), team, 2026)[0]
                self.assertEqual((game["result"], game["score"]), (result, score))
                self.assertEqual(game["is_home"], team == "LAL")
                self.assertEqual(game["opponent"], "BOS" if team == "LAL" else "LAL")

    def test_missing_or_tied_scores_have_no_result_or_score(self):
        for home, away in [(None, 100), (100, None), (None, None), (100, 100), (0, 0)]:
            for team in ("LAL", "BOS"):
                with self.subTest(home=home, away=away, team=team):
                    game = game_archive.team_season_games(
                        Connection([game_row(home_score=home, away_score=away)]), team, 2026)[0]
                    self.assertIsNone(game["result"])
                    self.assertIsNone(game["score"])

    def test_overtimes_are_nonnegative_with_missing_periods_defaulting_to_regulation(self):
        for periods, expected in [(None, 0), (0, 0), (3, 0), (4, 0), (5, 1), (6, 2)]:
            with self.subTest(periods=periods):
                game = game_archive.team_season_games(
                    Connection([game_row(num_periods=periods)]), "LAL", 2026)[0]
                self.assertEqual(game["overtimes"], expected)

    def test_unknown_opponent_uses_tricode_and_empty_logo(self):
        game = game_archive.team_season_games(
            Connection([game_row(away_team="XYZ")]), "LAL", 2026)[0]
        self.assertEqual((game["opponent"], game["opponent_name"], game["opponent_logo"]),
                         ("XYZ", "XYZ", ""))

    def test_preserves_query_order_season_types_and_source_rows(self):
        rows = [game_row("403", season_type=3),
                game_row("402", season_type=5, game_date=date(2026, 3, 10)),
                game_row("401", game_date=date(2026, 3, 9))]
        before = deepcopy(rows)
        result = game_archive.team_season_games(Connection(rows), "LAL", 2026)
        self.assertEqual([g["game_id"] for g in result], ["403", "402", "401"])
        self.assertEqual([g["season_type"] for g in result], [3, 5, 2])
        self.assertEqual(rows, before)

    def test_reader_propagates_query_failure_for_route_to_handle(self):
        with self.assertRaisesRegex(RuntimeError, "offline"):
            game_archive.team_season_games(Connection(failure=RuntimeError("offline")), "LAL", 2026)


class TeamListedPlayersTests(unittest.TestCase):
    def test_latest_listing_is_selected_across_teams_before_filtering_membership(self):
        conn = Connection()
        conn.listed = [{"nba_player_id": None, "player_name": "Rookie", "position": "F"}]
        self.assertEqual(game_archive.team_listed_players(conn, "LAL", 2026), conn.listed)
        self.assertEqual(len(conn.calls), 1)
        sql, params = conn.calls[0]
        sql = " ".join(sql.upper().split())
        self.assertEqual(params, (2026, "LAL"))
        self.assertIn("SELECT NBA_PLAYER_ID, PLAYER_NAME, POSITION FROM (", sql)
        self.assertIn("DISTINCT ON (P.ESPN_PLAYER_ID)", sql)
        self.assertIn("JOIN GAMES G USING (GAME_ID)", sql)
        self.assertIn("WHERE P.SEASON = %S AND P.SEASON_TYPE <> 1", sql)
        self.assertIn("ORDER BY P.ESPN_PLAYER_ID, P.GAME_DATE DESC, G.TIPOFF DESC NULLS LAST", sql)
        inner, outer = sql.split(") LATEST")
        self.assertNotIn("TEAM =", inner)  # Otherwise a traded-away player's old row survives.
        self.assertEqual(outer.strip(), "WHERE TEAM = %S")
        for excluded in ("DID_NOT_PLAY", "MINUTES", "LIMIT"):
            self.assertNotIn(excluded, sql)  # Inactive and zero-minute listings still count.
        self.assertEqual(conn.close_calls, 0)

    def test_empty_listing_and_query_failure(self):
        self.assertEqual(game_archive.team_listed_players(Connection(), "LAL", 2026), [])
        with self.assertRaisesRegex(RuntimeError, "offline"):
            game_archive.team_listed_players(Connection(failure=RuntimeError("offline")), "LAL", 2026)


class TeamStandingsTests(unittest.TestCase):
    def test_finds_either_conference_and_ignores_other_teams(self):
        for conference in ("east", "west"):
            with self.subTest(conference=conference):
                row = {"tricode": "LAL", "wins": 12, "losses": 4}
                table = {"east": [{"tricode": "BOS"}], "west": [{"tricode": "DAL"}]}
                table[conference].append(row)
                with patch.object(teams.standings, "get_standings", return_value=table) as get:
                    self.assertEqual(teams._standings_row("LAL"), row)
                get.assert_called_once_with()

    def test_missing_team_missing_conference_and_malformed_table_return_none(self):
        for table in ({}, {"east": [{"tricode": "BOS"}]}, {"west": []}, None,
                      {"east": None}, {"east": [None]}):
            with self.subTest(table=table), patch.object(teams.standings, "get_standings", return_value=table):
                self.assertIsNone(teams._standings_row("LAL"))

    def test_provider_failure_returns_none(self):
        with patch.object(teams.standings, "get_standings", side_effect=RuntimeError("offline")):
            self.assertIsNone(teams._standings_row("LAL"))


class TeamRouteTests(unittest.TestCase):
    def setUp(self):
        self.standings_row = self.enterContext(patch("app.api.routes.teams._standings_row", return_value=None))
        self.conn = Connection()
        self.get_db = self.enterContext(patch("app.db.get_db", return_value=self.conn))
        self.enterContext(patch.object(state, "current_season_year", 2026))
        self.enterContext(patch.object(state, "current_season_data", [player_row()]))
        self.enterContext(patch.object(state, "nba_data", [player_row(99, "Baseline Player")]))
        self.current_teams = self.enterContext(patch.object(state, "current_player_teams", return_value={1: "LAL"}))
        self.client = create_app(load_data=False).test_client()

    def get_team(self, tricode="LAL", headers=None):
        response = self.client.get(f"/api/teams/{tricode}", headers=headers)
        self.assertEqual(response.status_code, 200)
        return response.get_json()

    def test_golden_path_uses_real_reader_and_returns_complete_payload(self):
        self.conn.rows = [game_row()]
        data = self.get_team()
        self.assertEqual(set(data), {"team", "season", "season_label", "record", "games",
                                     "games_available", "games_missing", "roster"})
        self.assertEqual(data["team"], {"tricode": "LAL", "city": "Los Angeles",
                                        "name": "Lakers", "logo": TEAM_LOGOS["LAL"]})
        self.assertEqual((data["season"], data["season_label"]), (2026, "2025-26"))
        self.assertEqual(data["record"], {"wins": 1, "losses": 0, "source": "archive"})
        self.assertTrue(data["games_available"])
        self.assertEqual(data["games"][0]["score"], "123-112")
        self.assertEqual(data["roster"], [{"id": 1, "name": "Test Player", "position": "G",
                                          "age": 25, "games_played": 12, "ppg": 22.3,
                                          "rpg": 5.1, "apg": 6.8, "spg": 1.3, "bpg": 0.8,
                                          "fg_pct": 45.7, "fg3_pct": 37.8, "ft_pct": 81.3,
                                          "fpts": 42.6}])
        self.assertIs(type(data["roster"][0]["age"]), int)
        self.assertEqual(data["games_missing"], 0)
        self.assertEqual(len(self.conn.calls), 2)
        self.get_db.assert_called_once_with()
        self.assertEqual(self.conn.close_calls, 1)

    def test_tricode_is_case_insensitive_and_query_is_normalized(self):
        for tricode in ("lal", "LaL", "LAL"):
            with self.subTest(tricode=tricode):
                self.assertEqual(self.get_team(tricode)["team"]["tricode"], "LAL")
                self.assertEqual(self.conn.calls[-2][1], (2026, "LAL", "LAL"))
                self.assertEqual(self.conn.calls[-1][1], (2026, "LAL"))
                self.standings_row.assert_called_with("LAL")

    def test_unknown_team_is_404_without_database_or_roster_lookup(self):
        response = self.client.get("/api/teams/XYZ")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json(), {"error": "Team not found"})
        self.get_db.assert_not_called()
        self.current_teams.assert_not_called()

    def test_regular_record_excludes_postseason_playin_and_unusable_results(self):
        self.conn.rows = [game_row("1"), game_row("2", home_score=90),
                          game_row("3", season_type=3), game_row("4", season_type=5, home_score=90),
                          game_row("5", home_score=None), game_row("6", home_score=112)]
        data = self.get_team()
        self.assertEqual(data["record"], {"wins": 1, "losses": 1, "source": "archive"})
        self.assertEqual(len(data["games"]), 6)

    def test_empty_archive_is_available_with_zero_record(self):
        data = self.get_team()
        self.assertTrue(data["games_available"])
        self.assertEqual(data["games"], [])
        self.assertEqual(data["record"], {"wins": 0, "losses": 0, "source": "archive"})
        self.assertEqual(data["games_missing"], 0)

    def assert_unavailable_with_roster(self):
        data = self.get_team()
        self.assertFalse(data["games_available"])
        self.assertEqual(data["games"], [])
        self.assertEqual(data["record"], {"wins": 0, "losses": 0, "source": "archive"})
        self.assertEqual(data["games_missing"], 0)
        self.assertEqual([p["id"] for p in data["roster"]], [1])

    def test_connection_failure_keeps_roster_and_200(self):
        self.get_db.side_effect = RuntimeError("database offline")
        self.assert_unavailable_with_roster()
        self.assertEqual(self.conn.close_calls, 0)

    def test_query_failure_keeps_roster_and_closes_connection(self):
        self.conn.failure = RuntimeError("query failed")
        self.assert_unavailable_with_roster()
        self.assertEqual(self.conn.close_calls, 1)

    def test_fetch_failure_keeps_roster_and_closes_connection(self):
        with patch.object(self.conn, "fetchall", side_effect=RuntimeError("fetch failed")):
            self.assert_unavailable_with_roster()
        self.assertEqual(self.conn.close_calls, 1)

    def test_cleanup_failure_does_not_override_database_failure_response(self):
        self.conn.failure = RuntimeError("query failed")
        self.conn.close_failure = RuntimeError("connection lost during close")
        self.assert_unavailable_with_roster()

    def test_partial_archive_uses_standings_and_counts_only_regular_results(self):
        self.conn.rows = [game_row("1"), game_row("2", home_score=90),
                          game_row("3", season_type=3), game_row("4", season_type=5),
                          game_row("5", home_score=None)]
        row = {"wins": "20", "losses": "10", "home": "12-3", "away": "8-7", "streak": "W4"}
        self.standings_row.return_value = row
        before = deepcopy(row)
        data = self.get_team()
        self.assertEqual(data["record"], {**row, "wins": 20, "losses": 10, "source": "standings"})
        self.assertEqual(data["games_missing"], 28)
        self.assertEqual(len(data["games"]), 5)
        self.assertTrue(data["games_available"])
        self.assertEqual(row, before)

    def test_equal_or_older_standings_never_replace_archive_record(self):
        self.conn.rows = [game_row("1"), game_row("2", home_score=90)]
        for row in ({"wins": 2, "losses": 0}, {"wins": 0, "losses": 1},
                    {"wins": None, "losses": None}, {}, None):
            with self.subTest(row=row):
                self.standings_row.return_value = row
                data = self.get_team()
                self.assertEqual(data["record"], {"wins": 1, "losses": 1, "source": "archive"})
                self.assertEqual(data["games_missing"], 0)

    def test_empty_archive_uses_standings_and_normalizes_missing_splits(self):
        for splits in ({}, {"home": "", "away": "", "streak": ""},
                       {"home": None, "away": None, "streak": None}):
            with self.subTest(splits=splits):
                self.standings_row.return_value = {"wins": 3, "losses": None, **splits}
                data = self.get_team()
                self.assertTrue(data["games_available"])
                self.assertEqual(data["games"], [])
                self.assertEqual(data["games_missing"], 3)
                self.assertEqual(data["record"], {"wins": 3, "losses": 0, "source": "standings",
                                                 "home": None, "away": None, "streak": None})

    def test_database_down_with_standings_up_preserves_record_and_roster(self):
        self.get_db.side_effect = RuntimeError("database offline")
        self.standings_row.return_value = {"wins": 20, "losses": 10, "home": "12-3", "away": "8-7", "streak": "W4"}
        data = self.get_team()
        self.assertFalse(data["games_available"])
        self.assertEqual(data["games"], [])
        self.assertEqual(data["games_missing"], 30)
        self.assertEqual(data["record"], {**self.standings_row.return_value, "source": "standings"})
        self.assertEqual([p["id"] for p in data["roster"]], [1])

    def test_listing_query_failure_discards_already_read_games(self):
        self.conn.rows = [game_row()]
        self.conn.listed_failure = RuntimeError("listing query failed")
        self.assert_unavailable_with_roster()
        self.assertEqual(len(self.conn.calls), 2)
        self.assertEqual(self.conn.close_calls, 1)

    def test_close_failure_discards_successful_games_and_listings(self):
        self.conn.rows = [game_row()]
        self.conn.listed = [{"nba_player_id": 99, "player_name": "Baseline Player"}]
        self.conn.close_failure = RuntimeError("close failed")
        self.assert_unavailable_with_roster()
        self.assertEqual(len(self.conn.calls), 2)
        self.assertEqual(self.conn.close_calls, 1)

    def test_listed_known_player_uses_baseline_bio_but_never_last_season_stats(self):
        self.conn.listed = [{"nba_player_id": 99, "player_name": "Old Name", "position": "C"}]
        before = deepcopy(state.nba_data)
        roster = self.get_team()["roster"]
        self.assertEqual(roster[1], {
            "id": 99, "name": "Baseline Player", "position": "G", "age": 26, "games_played": 0,
            **dict.fromkeys(["ppg", "rpg", "apg", "spg", "bpg", "fg_pct", "fg3_pct", "ft_pct", "fpts"]),
        })
        self.assertEqual(state.nba_data, before)

    def test_listed_unknown_and_unresolved_players_have_null_stats_and_sort_last(self):
        self.conn.listed = [{"nba_player_id": 200, "player_name": "Zeta", "position": "F"},
                            {"nba_player_id": None, "player_name": "Alpha", "position": None}]
        before = deepcopy(self.conn.listed)
        with patch.object(teams, "player_id_for", return_value=900000001) as resolve, \
             patch.object(state, "current_season_data", [player_row(PPG_LAST=0)]):
            roster = self.get_team()["roster"]
        resolve.assert_called_once_with("Alpha")
        self.assertEqual([p["name"] for p in roster], ["Test Player", "Alpha", "Zeta"])
        for player, player_id, position in [(roster[1], 900000001, "UNK"), (roster[2], 200, "F")]:
            self.assertEqual((player["id"], player["position"], player["age"], player["games_played"]),
                             (player_id, position, None, 0))
            for key in ("ppg", "rpg", "apg", "spg", "bpg", "fg_pct", "fg3_pct", "ft_pct", "fpts"):
                self.assertIsNone(player[key])
        self.assertEqual(self.conn.listed, before)

    def test_listed_membership_respects_newer_observations_and_deduplicates(self):
        self.conn.listed = [{"nba_player_id": 1, "player_name": "Stale Name"},
                            {"nba_player_id": 99, "player_name": "Traded Away"},
                            {"nba_player_id": 200, "player_name": "Confirmed Here"},
                            {"nba_player_id": 200, "player_name": "Duplicate"}]
        self.current_teams.return_value = {1: "LAL", 99: "DAL", 200: "LAL"}
        roster = self.get_team()["roster"]
        self.assertEqual([p["id"] for p in roster], [1, 200])
        self.assertEqual((roster[0]["name"], roster[0]["ppg"]), ("Test Player", 22.3))
        self.assertIsNone(roster[1]["ppg"])

    def test_unresolved_listed_id_also_respects_newer_team_observation(self):
        self.conn.listed = [{"nba_player_id": None, "player_name": "Traded Rookie"}]
        self.current_teams.return_value = {200: "BOS"}
        with patch.object(teams, "player_id_for", return_value=200):
            self.assertEqual([p["id"] for p in self.get_team()["roster"]], [1])

    def test_current_team_overrides_stale_team_in_both_trade_directions(self):
        players = [player_row(1, "Traded Away"), player_row(2, "Traded In", TEAM="DAL"),
                   player_row(3, "Still Here"), player_row(4, "Other Team", TEAM="BOS")]
        before = deepcopy(players)
        self.current_teams.return_value = {1: "DAL", 2: "LAL"}
        with patch.object(state, "current_season_data", players):
            data = self.get_team()
        self.assertEqual([p["name"] for p in data["roster"]], ["Still Here", "Traded In"])
        self.assertEqual(players, before)

    def test_roster_sort_is_ppg_descending_then_name(self):
        players = [player_row(1, "Zeta", PPG_LAST=20.11), player_row(2, "Leader", PPG_LAST=30),
                   player_row(3, "Alpha", PPG_LAST=20.12), player_row(4, "Bench", PPG_LAST=0)]
        with patch.object(state, "current_season_data", players):
            roster = self.get_team()["roster"]
        self.assertEqual([p["name"] for p in roster], ["Leader", "Alpha", "Zeta", "Bench"])
        self.assertEqual([p["ppg"] for p in roster], [30, 20.1, 20.1, 0])

    def test_nonempty_current_season_takes_precedence_over_baseline(self):
        with patch.object(state, "current_season_data", [player_row(2, TEAM="BOS")]):
            self.assertEqual(self.get_team()["roster"], [])

    def test_empty_or_missing_current_season_falls_back_to_baseline(self):
        for current in ([], None):
            with self.subTest(current=current), patch.object(state, "current_season_data", current):
                self.assertEqual([p["id"] for p in self.get_team()["roster"]], [99])

    def test_no_datasets_returns_empty_roster(self):
        with patch.object(state, "current_season_data", []), patch.object(state, "nba_data", None):
            self.assertEqual(self.get_team()["roster"], [])

    def test_missing_and_null_roster_stats_have_safe_defaults(self):
        for extra in ({}, dict.fromkeys([
            "POSITION", "AGE", "GAMES_PLAYED_LAST", "PPG_LAST", "RPG_LAST", "APG_LAST",
            "SPG_LAST", "BPG_LAST", "TOV_LAST", "FG_PCT_LAST", "FG3_PCT_LAST", "FT_PCT_LAST",
        ])):
            with self.subTest(extra=extra), patch.object(state, "current_season_data", [
                {"PLAYER_ID": 1, "PLAYER_NAME": "Rookie", "TEAM": "LAL", **extra}
            ]):
                self.assertEqual(self.get_team()["roster"], [{
                    "id": 1, "name": "Rookie", "position": "UNK", "age": None,
                    "games_played": 0, "ppg": 0, "rpg": 0, "apg": 0,
                    "spg": 0, "bpg": 0, "fg_pct": 0.0, "fg3_pct": 0.0,
                    "ft_pct": 0.0, "fpts": 0.0,
                }])

    def test_shooting_defaults_and_ratio_boundaries_do_not_change_fantasy_points(self):
        fields = ("FG_PCT_LAST", "FG3_PCT_LAST", "FT_PCT_LAST")
        for values, expected in [({}, 0.0), (dict.fromkeys(fields), 0.0),
                                 (dict.fromkeys(fields, 0), 0.0), (dict.fromkeys(fields, 1), 100.0)]:
            player = {key: value for key, value in player_row().items() if key not in fields}
            player.update(values)
            with self.subTest(values=values), patch.object(state, "current_season_data", [player]):
                roster_player = self.get_team()["roster"][0]
                for key in ("fg_pct", "fg3_pct", "ft_pct"):
                    self.assertEqual(roster_player[key], expected)
                self.assertEqual(roster_player["fpts"], 42.6)

    def test_fantasy_scoring_is_request_scoped_and_does_not_mutate_season_stats(self):
        before = deepcopy(state.current_season_data)
        default = self.get_team()["roster"][0]
        # Independent expected totals include steals, blocks and negative turnover weights.
        for header, expected in [
            ("espn", 44.7), ("draftkings", 41.9),
            ("custom:pts=2,reb=0,ast=0,stl=0,blk=0,tov=-1", 42.2),
            ("custom:pts=0,reb=0,ast=0,stl=0,blk=0,tov=0", 0.0),
            ("fanduel", 42.6), ("unknown-preset", 42.6),
        ]:
            with self.subTest(header=header):
                scored = self.get_team(headers={"X-Fantasy-Scoring": header})["roster"][0]
                self.assertEqual(scored, {**default, "fpts": expected})
        self.assertEqual(self.get_team()["roster"][0], default)
        self.assertEqual(state.current_season_data, before)

    def test_fantasy_scores_unrounded_averages_and_rounds_only_the_total(self):
        player = player_row(PPG_LAST=20.04, RPG_LAST=5.04, APG_LAST=6.04,
                            SPG_LAST=1.04, BPG_LAST=1.04, TOV_LAST=2.04)
        with patch.object(state, "current_season_data", [player]):
            roster_player = self.get_team()["roster"][0]
        self.assertEqual(roster_player["fpts"], 39.3)  # 39.348; rounded inputs would give 39.0.
        self.assertEqual([roster_player[key] for key in ("ppg", "rpg", "apg", "spg", "bpg")],
                         [20.0, 5.0, 6.0, 1.0, 1.0])

    def test_baseline_roster_also_has_shooting_and_request_scored_fantasy(self):
        with patch.object(state, "current_season_data", []):
            player = self.get_team(headers={"X-Fantasy-Scoring": "espn"})["roster"][0]
        self.assertEqual(player["id"], 99)
        self.assertEqual([player[key] for key in ("spg", "bpg", "fg_pct", "fg3_pct", "ft_pct", "fpts")],
                         [1.3, 0.8, 45.7, 37.8, 81.3, 44.7])

    def test_missing_player_id_uses_name_resolver_and_current_team(self):
        with patch.object(state, "current_season_data", [player_row(None, TEAM="DAL")]), \
             patch("app.api.routes.teams.player_id_for", return_value=1) as resolve:
            self.assertEqual([p["id"] for p in self.get_team()["roster"]], [1])
        resolve.assert_called_once_with("Test Player")

    def test_existing_teams_list_still_returns_sorted_unique_teams(self):
        self.current_teams.return_value = {1: "LAL", 2: "BOS", 3: "LAL"}
        response = self.client.get("/api/teams")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"teams": ["BOS", "LAL"]})
        self.get_db.assert_not_called()


if __name__ == "__main__":
    unittest.main()
