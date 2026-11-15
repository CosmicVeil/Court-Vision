"""Offline tests for the team context features of the per-game stat model."""

import unittest
from datetime import date, timedelta
from decimal import Decimal

import numpy as np
import pandas as pd

from app.ml.game_context_features import (
    ABSENCE_FEATURES,
    CONTEXT_FEATURES,
    MIN_TEAM_GAMES,
    OPPONENT_FEATURES,
    RECENT_ABSENCE_DAYS,
    TEAM_FEATURES,
    WINDOW,
    absence_totals,
    add_context,
    team_form,
)
from unittest.mock import Mock

from app.ml.game_features import (
    FEATURE_COLUMNS,
    ID_COLUMNS,
    TARGET_COLUMNS,
    league_rows,
    load_training_frame,
    prepare_frame,
)
from tests.test_game_model import make_rows

START = date(2026, 1, 1)


def team_game(day, team, opponent, pts, **stats):
    row = {"game_id": f"g{day}", "team": team, "opponent": opponent,
           "game_date": START + timedelta(days=day), "pts": pts,
           "fgm": 40, "fga": 80, "fg3m": 10, "fta": 20, "oreb": 10, "reb": 40,
           "ast": 25, "blk": 5, "tov": 12}
    row.update(stats)
    return row


def matchup(day, aaa_pts, bbb_pts, **aaa_stats):
    return [team_game(day, "AAA", "BBB", aaa_pts, **aaa_stats),
            team_game(day, "BBB", "AAA", bbb_pts)]


def appearance(day, player, team="AAA", minutes=30.0, pts=20, reason=None):
    dnp = reason is not None
    return {"game_id": f"g{day}", "espn_player_id": player, "team": team,
            "game_date": START + timedelta(days=day), "did_not_play": dnp,
            "dnp_reason": reason, "minutes": None if dnp else minutes,
            "pts": None if dnp else pts}


def form_row(form, day, team):
    return form[(form["game_id"] == f"g{day}") & (form["team"] == team)].iloc[0]


def totals_row(totals, day, team="AAA"):
    return totals[(totals["game_id"] == f"g{day}") & (totals["team"] == team)].iloc[0]


class TeamFormTests(unittest.TestCase):
    def setUp(self):
        self.rows = [row for day in range(6) for row in matchup(day, 100 + 10 * day, 90)]

    def test_no_form_until_enough_earlier_games(self):
        form = team_form(self.rows)
        for day in range(MIN_TEAM_GAMES):
            self.assertTrue(np.isnan(form_row(form, day, "AAA")["pts_last10"]))
        self.assertFalse(np.isnan(form_row(form, MIN_TEAM_GAMES, "AAA")["pts_last10"]))

    def test_rolling_mean_uses_only_earlier_games(self):
        form = team_form(self.rows)
        self.assertAlmostEqual(form_row(form, 3, "AAA")["pts_last10"], (100 + 110 + 120) / 3)
        self.assertAlmostEqual(form_row(form, 5, "AAA")["pts_last10"], (100 + 110 + 120 + 130 + 140) / 5)

    def test_current_game_does_not_leak_into_its_own_features(self):
        changed = [dict(row, pts=999, tov=50) if row["game_id"] == "g5" else row for row in self.rows]
        before, after = team_form(self.rows), team_form(changed)
        pd.testing.assert_series_equal(form_row(before, 5, "AAA"), form_row(after, 5, "AAA"),
                                       check_names=False)
        pd.testing.assert_series_equal(form_row(before, 5, "BBB"), form_row(after, 5, "BBB"),
                                       check_names=False)

    def test_allowed_stats_come_from_the_other_team(self):
        form = team_form(self.rows)
        # BBB allowed exactly what AAA scored.
        self.assertAlmostEqual(form_row(form, 4, "BBB")["pts_allowed_last10"],
                               form_row(form, 4, "AAA")["pts_last10"])
        self.assertAlmostEqual(form_row(form, 4, "AAA")["pts_allowed_last10"], 90)

    def test_ratings_and_pace_match_hand_computation(self):
        form = team_form(self.rows)
        possessions = 80 + 0.44 * 20 - 10 + 12  # identical for both teams in every game
        row = form_row(form, 3, "AAA")
        self.assertAlmostEqual(row["pace_last10"], possessions)
        self.assertAlmostEqual(row["off_rating_last10"], 100 * 110 / possessions)
        self.assertAlmostEqual(row["def_rating_last10"], 100 * 90 / possessions)
        self.assertAlmostEqual(row["efg_last10"], (40 + 0.5 * 10) / 80)

    def test_window_is_limited_to_last_ten_games(self):
        rows = [row for day in range(WINDOW + 3) for row in matchup(day, day, 90)]
        form = team_form(rows)
        self.assertAlmostEqual(form_row(form, WINDOW + 2, "AAA")["pts_last10"],
                               np.mean(range(2, WINDOW + 2)))

    def test_row_order_and_database_types_do_not_matter(self):
        shuffled = [dict(row, pts=Decimal(row["pts"])) for row in reversed(self.rows)]
        pd.testing.assert_frame_equal(
            team_form(shuffled).sort_values(["game_id", "team"]).reset_index(drop=True),
            team_form(self.rows).sort_values(["game_id", "team"]).reset_index(drop=True))

    def test_missing_opponent_row_and_zero_attempts_give_nan_not_errors(self):
        rows = [team_game(day, "AAA", "BBB", 100, fga=0, fgm=0) for day in range(5)]
        row = form_row(team_form(rows), 4, "AAA")
        self.assertAlmostEqual(row["pts_last10"], 100)
        self.assertTrue(np.isnan(row["pts_allowed_last10"]))
        self.assertTrue(np.isnan(row["efg_last10"]))

    def test_empty_input(self):
        self.assertTrue(team_form([]).empty)


class AbsenceTests(unittest.TestCase):
    def test_nobody_absent_is_zero(self):
        totals = absence_totals([appearance(day, 1) for day in range(3)])
        self.assertEqual(totals_row(totals, 2)["missing_min"], 0)

    def test_injured_player_counts_with_his_usual_minutes_and_points(self):
        rows = [appearance(0, 1, minutes=30, pts=20), appearance(1, 1, minutes=34, pts=24),
                appearance(2, 1, reason="LEFT ANKLE SPRAIN"), appearance(2, 2)]
        row = totals_row(absence_totals(rows), 2)
        self.assertAlmostEqual(row["missing_min"], 32)
        self.assertAlmostEqual(row["missing_pts"], 22)
        self.assertAlmostEqual(row["missing_min_recent"], 32)

    def test_coachs_decision_is_ignored(self):
        rows = [appearance(0, 1), appearance(1, 1, reason="COACH'S DECISION"),
                appearance(2, 1, reason="Coach's Decision")]
        totals = absence_totals(rows)
        self.assertEqual(totals_row(totals, 1)["missing_min"], 0)
        self.assertEqual(totals_row(totals, 2)["missing_min"], 0)

    def test_long_absence_is_not_recent(self):
        late = RECENT_ABSENCE_DAYS + 1
        rows = [appearance(0, 1, minutes=30), appearance(RECENT_ABSENCE_DAYS, 1, reason="KNEE"),
                appearance(late, 1, reason="KNEE")]
        totals = absence_totals(rows)
        self.assertAlmostEqual(totals_row(totals, RECENT_ABSENCE_DAYS)["missing_min_recent"], 30)
        self.assertAlmostEqual(totals_row(totals, late)["missing_min"], 30)
        self.assertEqual(totals_row(totals, late)["missing_min_recent"], 0)

    def test_usual_minutes_ignore_this_game_and_later_games(self):
        rows = [appearance(0, 1, minutes=10), appearance(1, 1, reason="REST"),
                appearance(2, 1, minutes=40)]
        self.assertAlmostEqual(totals_row(absence_totals(rows), 1)["missing_min"], 10)

    def test_player_with_no_history_adds_nothing(self):
        rows = [appearance(0, 1, reason="ILLNESS"), appearance(0, 2)]
        self.assertEqual(totals_row(absence_totals(rows), 0)["missing_min"], 0)

    def test_absences_are_summed_per_team(self):
        rows = [appearance(0, 1, minutes=30), appearance(0, 2, minutes=20),
                appearance(0, 3, team="BBB", minutes=36),
                appearance(1, 1, reason="REST"), appearance(1, 2, reason="BACK"),
                appearance(1, 3, team="BBB", reason="REST")]
        totals = absence_totals(rows)
        self.assertAlmostEqual(totals_row(totals, 1, "AAA")["missing_min"], 50)
        self.assertAlmostEqual(totals_row(totals, 1, "BBB")["missing_min"], 36)

    def test_null_did_not_play_flag_is_not_an_absence(self):
        rows = [appearance(0, 1), dict(appearance(1, 1), did_not_play=None, minutes=None)]
        self.assertEqual(totals_row(absence_totals(rows), 1)["missing_min"], 0)

    def test_empty_input(self):
        self.assertTrue(absence_totals([]).empty)


class AddContextTests(unittest.TestCase):
    def setUp(self):
        self.team_rows = [row for day in range(5) for row in matchup(day, 120, 90)]
        self.appearances = (
            [appearance(day, 1, minutes=30) for day in range(4)]
            + [appearance(day, 9, team="BBB", minutes=36) for day in range(4)]
            + [appearance(4, 1), appearance(4, 9, team="BBB", reason="REST")])
        self.frame = pd.DataFrame({
            "game_id": ["g4", "g4"], "team": ["AAA", "BBB"], "opponent": ["BBB", "AAA"],
        }, index=[7, 3])

    def test_player_gets_own_offence_and_opponent_defence(self):
        result = add_context(self.frame, self.team_rows, self.appearances)
        aaa, bbb = result.loc[7], result.loc[3]
        self.assertAlmostEqual(aaa["team_pts_last10"], 120)
        self.assertAlmostEqual(aaa["opp_pts_allowed_last10"], 120)  # BBB allowed AAA's 120
        self.assertAlmostEqual(bbb["team_pts_last10"], 90)
        self.assertAlmostEqual(bbb["opp_pts_allowed_last10"], 90)
        self.assertAlmostEqual(aaa["opp_missing_min"], 36)
        self.assertEqual(aaa["team_missing_min"], 0)
        self.assertAlmostEqual(bbb["team_missing_min"], 36)
        self.assertEqual(bbb["opp_missing_min"], 0)

    def test_keeps_rows_index_and_adds_every_column(self):
        result = add_context(self.frame, self.team_rows, self.appearances)
        self.assertEqual(list(result.index), [7, 3])
        self.assertEqual(set(CONTEXT_FEATURES) - set(result.columns), set())
        self.assertEqual(len(CONTEXT_FEATURES),
                         len(TEAM_FEATURES) + len(OPPONENT_FEATURES) + len(ABSENCE_FEATURES))

    def test_without_context_rows_columns_are_nan(self):
        result = add_context(self.frame)
        self.assertTrue(result[CONTEXT_FEATURES].isna().all().all())
        self.assertTrue((result[CONTEXT_FEATURES].dtypes == float).all())

    def test_replaces_context_columns_already_present(self):
        once = add_context(self.frame, self.team_rows, self.appearances)
        twice = add_context(once, self.team_rows, self.appearances)
        pd.testing.assert_frame_equal(once, twice)

    def test_prepare_frame_merges_context_in_feature_order(self):
        rows = make_rows(players=2, days=8)
        team_rows = [row for day in range(8) for row in matchup(day, 110, 100)]
        appearances = [appearance(day, player) for day in range(8) for player in range(2)]
        frame = prepare_frame(rows, team_rows, appearances)
        self.assertEqual(list(frame.columns), ID_COLUMNS + FEATURE_COLUMNS + TARGET_COLUMNS)
        self.assertEqual(len(frame), len(prepare_frame(rows)))
        self.assertTrue((frame["team_pts_last10"] == 110).all())
        self.assertTrue((frame["opp_pts_allowed_last10"] == 110).all())
        self.assertTrue((frame["team_missing_min"] == 0).all())


class LeagueRowsTests(unittest.TestCase):
    def test_keeps_only_games_between_nba_teams(self):
        rows = [{"team": "BOS", "opponent": "LAL"}, {"team": "STARS", "opponent": "WORLD"},
                {"team": "BOS", "opponent": "HAPOEL"}, {"team": "", "opponent": "NYK"}]
        self.assertEqual(league_rows(rows), [{"team": "BOS", "opponent": "LAL"}])

    def test_rows_without_an_opponent_are_judged_by_team(self):
        rows = [{"team": "BOS"}, {"team": "STRIPES"}]
        self.assertEqual(league_rows(rows), [{"team": "BOS"}])

    def test_loader_drops_all_star_rows_from_all_three_queries(self):
        def view_row(row, team, opponent):
            return dict(row, team=team, opponent=opponent)
        real = [view_row(row, "BOS", "LAL") for row in make_rows(players=1, days=8)]
        all_star = [dict(view_row(row, "STARS", "WORLD"), game_id="allstar", espn_player_id=99)
                    for row in make_rows(players=1, days=8)]
        team_rows = ([team_game(day, "BOS", "LAL", 110) for day in range(8)]
                     + [team_game(day, "LAL", "BOS", 100) for day in range(8)]
                     + [team_game(7, "STARS", "WORLD", 40)])
        appearances = [appearance(day, 0, team="BOS") for day in range(8)] + [
            appearance(7, 5, team="BOS", reason="REST"),
            # Without the filter this All-Star cameo would give player 5 "usual" minutes.
            dict(appearance(6, 5, team="STARS", minutes=12), game_id="allstar")]
        conn = Mock()
        conn.execute.return_value.fetchall.side_effect = [real + all_star, team_rows, appearances]
        frame = load_training_frame(conn)
        self.assertEqual(set(frame["team"]), {"BOS"})
        self.assertEqual(len(frame), len(prepare_frame(real)))
        self.assertTrue((frame["team_missing_min"] == 0).all())


if __name__ == "__main__":
    unittest.main()
