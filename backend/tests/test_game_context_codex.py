"""Synthetic context regressions; no database, network, or model artifacts.

Same-date fixtures designate a target as the day's first tip-off. Game IDs are
opaque identifiers, not timestamps; a smaller ID must not make a later game
available to that target. The archive has tipoff, but the context inputs omit it.
"""

import unittest
from copy import deepcopy
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import Mock, patch

import numpy as np
import pandas as pd

from app.ml.game_context_features import (
    ABSENCE_FEATURES,
    CONTEXT_FEATURES,
    OPPONENT_FEATURES,
    TEAM_FEATURES,
    absence_totals,
    add_context,
    team_form,
)
from app.ml.game_features import (
    FEATURE_COLUMNS,
    ID_COLUMNS,
    PLAYER_FEATURE_COLUMNS,
    TARGET_COLUMNS,
    load_training_frame,
    prepare_frame,
)


START = date(2026, 1, 1)


def team_row(day, team="AAA", opponent="BBB", **changes):
    row = dict(game_id=f"g{day:03}", team=team, opponent=opponent,
               game_date=START + timedelta(days=day), pts=100, fgm=40,
               fga=80, fg3m=10, fta=20, oreb=10, reb=40, ast=25, blk=5, tov=12)
    row.update(changes)
    return row


def matchup(day, **changes):
    return [team_row(day, **changes), team_row(day, "BBB", "AAA", **changes)]


def appearance(day, player=1, team="AAA", **changes):
    row = dict(game_id=f"g{day:03}", espn_player_id=player, team=team,
               game_date=START + timedelta(days=day), did_not_play=False,
               dnp_reason=None, minutes=30, pts=20)
    row.update(changes)
    return row


def absent(day, player=1, team="AAA", **changes):
    row = appearance(day, player, team, did_not_play=True, dnp_reason="REST",
                     minutes=None, pts=None)
    row.update(changes)
    return row


def view_row(day, player=1, **changes):
    row = {column: Decimal("1.5") for column in PLAYER_FEATURE_COLUMNS + TARGET_COLUMNS}
    row.update(game_id=f"g{day:03}", espn_player_id=player, nba_player_id=None,
               player_name=f"Player {player}", team="AAA", opponent="BBB",
               game_date=START + timedelta(days=day), games_before=8,
               is_home=True, back_to_back=False)
    row.update(changes)
    return row


def at(frame, game_id, team="AAA"):
    return frame.set_index(["game_id", "team"]).loc[(game_id, team)]


class ContextTemporalRegressions(unittest.TestCase):
    def test_current_and_future_stats_do_not_change_any_target_context(self):
        teams = [row for day in range(8) for row in matchup(day, pts=100 + day)]
        appearances = [appearance(day) for day in range(5)] + [absent(5)]
        appearances += [appearance(day, minutes=40, pts=30) for day in (6, 7)]
        frame = pd.DataFrame([view_row(5)])
        expected = add_context(frame, teams, appearances)
        altered_teams, altered_appearances = deepcopy(teams), deepcopy(appearances)
        for row in altered_teams:
            if row["game_date"] >= START + timedelta(days=5):
                for column in ("pts", "fgm", "fga", "fg3m", "fta", "oreb", "reb", "ast", "blk", "tov"):
                    row[column] = 999
        for row in altered_appearances:
            if row["game_date"] >= START + timedelta(days=5):
                row.update(minutes=999, pts=999)
        actual = add_context(frame, reversed(altered_teams), reversed(altered_appearances))
        pd.testing.assert_frame_equal(actual, expected)

    def test_team_window_excludes_current_and_eleventh_previous_game(self):
        rows = [row for day in range(13) for row in matchup(day, pts=day * 10)]
        result = at(team_form(rows), "g012")
        self.assertEqual(result["pts_last10"], 65.0)  # days 2 through 11
        self.assertEqual(result["pts_allowed_last10"], 65.0)

    def test_absence_window_counts_ten_played_games_not_ten_appearances(self):
        rows = []
        for number in range(12):
            rows.append(appearance(2 * number, minutes=number + 1, pts=2 * (number + 1)))
            rows.append(absent(2 * number + 1))
        rows += [absent(24), absent(25)]
        for game_id in ("g023", "g024", "g025"):
            with self.subTest(game_id=game_id):
                result = at(absence_totals(rows), game_id)
                self.assertEqual(result["missing_min"], 7.5)  # played values 3..12
                self.assertEqual(result["missing_pts"], 15.0)

class ContextAbsenceRegressions(unittest.TestCase):
    def test_team_change_keeps_player_history_but_charges_only_current_team(self):
        rows = [appearance(0, minutes=10, pts=4), appearance(1, minutes=20, pts=8),
                appearance(2, team="BBB", minutes=30, pts=12),
                absent(3, team="BBB"), appearance(3, player=2, team="AAA")]
        frame = pd.DataFrame([view_row(3), view_row(3, player=3, team="BBB", opponent="AAA")])
        result = add_context(frame, appearance_rows=rows)
        self.assertEqual(result["team_missing_min"].tolist(), [0.0, 20.0])
        self.assertEqual(result["opp_missing_min"].tolist(), [20.0, 0.0])
        self.assertEqual(result["team_missing_pts"].tolist(), [0.0, 8.0])

    def test_players_with_interleaved_histories_do_not_share_averages(self):
        rows = [appearance(0, player=1, minutes=10, pts=5),
                appearance(0, player=2, minutes=40, pts=30),
                absent(1, player=1), appearance(1, player=2, minutes=20, pts=10),
                absent(2, player=1), absent(2, player=2), absent(2, player=3)]
        result = at(absence_totals(reversed(rows)), "g002")
        self.assertEqual(result["missing_min"], 40.0)
        self.assertEqual(result["missing_pts"], 25.0)

    def test_decimal_stats_nullable_flags_and_missing_values(self):
        rows = [appearance(0, minutes=Decimal("12.5"), pts=Decimal("7"), did_not_play=None),
                appearance(1, minutes=Decimal("17.5"), pts=np.nan, did_not_play=np.bool_(False)),
                appearance(2, minutes=None, pts=None, did_not_play=np.nan),
                absent(3, did_not_play=np.bool_(True))]
        result = at(absence_totals(rows), "g003")
        self.assertEqual(result["missing_min"], 15.0)
        self.assertEqual(result["missing_pts"], 7.0)
        self.assertTrue((absence_totals(rows).iloc[:, 2:].dtypes == float).all())

    def test_unknown_reason_is_not_a_known_non_coach_absence(self):
        for reason in (None, np.nan, "", "   "):
            with self.subTest(reason=reason):
                rows = [appearance(0), absent(1, dnp_reason=reason)]
                result = at(absence_totals(rows), "g001")
                self.assertEqual(result["missing_min"], 0.0,
                                 "A missing reason cannot establish a pre-tip-off absence")

    def test_whitespace_does_not_turn_coachs_decision_into_known_absence(self):
        rows = [appearance(0), absent(1, dnp_reason="  Coach's Decision  ")]
        result = at(absence_totals(rows), "g001")
        self.assertEqual(result["missing_min"], 0.0)

    def test_recent_absence_boundary_is_inclusive_and_uses_last_played_game(self):
        rows = [appearance(0, minutes=24), absent(13), absent(14), absent(15)]
        totals = absence_totals(rows)
        self.assertEqual(at(totals, "g014")["missing_min_recent"], 24.0)
        self.assertEqual(at(totals, "g015")["missing_min_recent"], 0.0)
        self.assertEqual(at(totals, "g015")["missing_min"], 24.0)


class ContextMergeRegressions(unittest.TestCase):
    def setUp(self):
        self.teams = [row for day in range(5) for row in matchup(day)]
        self.appearances = [appearance(day) for day in range(4)] + [absent(4)]

    def test_duplicate_inputs_do_not_multiply_or_reorder_player_rows(self):
        frame = pd.DataFrame([
            view_row(4, player=9, team="BBB", opponent="AAA"),
            view_row(3, player=1), view_row(4, player=2),
            view_row(99, player=4), view_row(4, player=2),
        ], index=pd.Index([7, 7, -1, 20, -1], name="source_row"))
        expected = add_context(frame, self.teams, self.appearances)
        result = add_context(frame, reversed(self.teams * 3), reversed(self.appearances * 3))
        pd.testing.assert_frame_equal(result, expected)
        pd.testing.assert_frame_equal(result[frame.columns], frame)
        self.assertEqual(result["team_missing_min"].iloc[2], 30.0)
        self.assertTrue(result[CONTEXT_FEATURES].iloc[3].isna().all())

    def test_identical_duplicates_do_not_change_rolling_windows_or_absence_sums(self):
        pd.testing.assert_frame_equal(team_form(self.teams * 3), team_form(self.teams))
        pd.testing.assert_frame_equal(absence_totals(self.appearances * 3), absence_totals(self.appearances))

    def test_opponent_defence_uses_opponents_previous_opponents(self):
        rows = []
        for day in range(3):
            rows += [team_row(day, "AAA", "CCC", pts=110),
                     team_row(day, "CCC", "AAA", pts=80)]
            rows += [team_row(day, "BBB", "DDD", game_id=f"other{day}", pts=120),
                     team_row(day, "DDD", "BBB", game_id=f"other{day}", pts=90)]
        rows += matchup(3, pts=999)
        frame = pd.DataFrame([view_row(3), view_row(3, 2, team="BBB", opponent="AAA")])
        result = add_context(frame, rows)
        self.assertEqual(result["team_pts_last10"].tolist(), [110.0, 120.0])
        self.assertEqual(result["opp_pts_allowed_last10"].tolist(), [90.0, 80.0])

    def test_partial_context_sources_preserve_independent_features(self):
        frame = pd.DataFrame([view_row(4), view_row(99)])
        team_only = add_context(frame, self.teams)
        self.assertEqual(team_only.loc[0, "team_pts_last10"], 100.0)
        self.assertTrue(team_only[ABSENCE_FEATURES].isna().all().all())
        absence_only = add_context(frame, appearance_rows=self.appearances)
        self.assertEqual(absence_only.loc[0, "team_missing_min"], 30.0)
        self.assertTrue(absence_only[TEAM_FEATURES + OPPONENT_FEATURES].isna().all().all())
        self.assertTrue(absence_only.loc[1, CONTEXT_FEATURES].isna().all())
        self.assertTrue(np.isnan(absence_only.loc[0, "opp_missing_min"]))

    def test_team_numeric_null_decimal_bool_nan_inputs(self):
        rows = [row for day in range(4) for row in matchup(day)]
        for row in rows:
            row.update(pts=Decimal("101.5"), blk=True, fga=None, fgm=np.nan)
        result = at(team_form(rows), "g003")
        self.assertEqual(result["pts_last10"], 101.5)
        self.assertEqual(result["blk_allowed_last10"], 1.0)
        self.assertTrue(np.isnan(result["efg_last10"]))
        self.assertTrue(np.isnan(result["pace_last10"]))

    def test_functions_do_not_mutate_inputs(self):
        frame = pd.DataFrame([view_row(4)])
        frame_before = frame.copy(deep=True)
        teams_before, appearances_before = deepcopy(self.teams), deepcopy(self.appearances)
        add_context(frame, self.teams, self.appearances)
        pd.testing.assert_frame_equal(frame, frame_before)
        self.assertEqual(self.teams, teams_before)
        self.assertEqual(self.appearances, appearances_before)

    def test_prepare_frame_filters_and_sorts_without_losing_row_identity(self):
        rows = [view_row(4, 9), view_row(3, 2), view_row(4, 1),
                view_row(0, 4, games_before=4), view_row(4, 5, pts=None)]
        result = prepare_frame(iter(rows), iter(self.teams * 2), iter(self.appearances * 2))
        self.assertEqual(list(zip(result.game_id, result.espn_player_id)),
                         [("g003", 2), ("g004", 1), ("g004", 9)])
        self.assertEqual(result["team_missing_min"].tolist(), [0.0, 30.0, 30.0])
        self.assertEqual(list(result.columns), ID_COLUMNS + FEATURE_COLUMNS + TARGET_COLUMNS)
        self.assertTrue((result[FEATURE_COLUMNS + TARGET_COLUMNS].dtypes == float).all())

    def test_empty_and_fully_filtered_frames_have_float_feature_dtypes(self):
        for rows in ([], [view_row(4, games_before=0)], [view_row(4, pts=None)]):
            for teams, appearances in (([], []), (self.teams, self.appearances)):
                with self.subTest(rows=len(rows), context=bool(teams)):
                    result = prepare_frame(rows, teams, appearances)
                    self.assertTrue(result.empty)
                    self.assertEqual(list(result.columns), ID_COLUMNS + FEATURE_COLUMNS + TARGET_COLUMNS)
                    self.assertTrue((result[FEATURE_COLUMNS + TARGET_COLUMNS].dtypes == float).all())
        self.assertTrue((team_form([]).drop(columns=["game_id", "team"]).dtypes == float).all())
        self.assertTrue((absence_totals([]).drop(columns=["game_id", "team"]).dtypes == float).all())

    def test_loader_routes_three_query_results_into_context_without_database(self):
        rows = [view_row(4)]
        conn = Mock()
        conn.execute.side_effect = [Mock(fetchall=Mock(return_value=value))
                                    for value in (rows, self.teams, self.appearances)]
        # The loader keeps NBA teams only; the synthetic rows use made-up tricodes.
        with patch("app.ml.game_features.TEAM_IDS", dict.fromkeys(("AAA", "BBB", "CCC", "DDD"), 0)):
            result = load_training_frame(conn)
        pd.testing.assert_frame_equal(result, prepare_frame(rows, self.teams, self.appearances))
        calls = conn.execute.call_args_list
        self.assertEqual(len(calls), 3)
        for call, table in zip(calls, ("player_game_features", "team_game_stats", "player_game_stats")):
            self.assertIn(f"FROM {table}", call.args[0])
        self.assertEqual(calls[0].args[1], (1,))
        self.assertEqual(calls[1].args[1], (1,))
        conn.close.assert_not_called()


if __name__ == "__main__":
    unittest.main()
