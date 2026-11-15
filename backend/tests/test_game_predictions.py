"""Per-game predictions for upcoming games: feature building, the cache, ranking and the routes.

Offline: synthetic archive rows, no database, no ESPN, no trained model.
"""
import unittest
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pandas as pd

from app import create_app, state
from app.api.routes.predictions import PUBLIC_PREVIEW_LIMIT
from app.ml.game_features import FEATURE_COLUMNS, TARGET_COLUMNS
from app.ml.game_upcoming import build_upcoming_frame, player_form
from app.services import game_predictions

SLATE = date(2026, 11, 20)


def _history(espn_id, team, minutes, start=date(2026, 11, 1), season=2027, **overrides):
    """One played game per day for a player, oldest first, with pts = minutes / 2."""
    rows = []
    for offset, value in enumerate(minutes):
        rows.append({
            "game_id": f"g{espn_id}-{offset}", "espn_player_id": espn_id, "nba_player_id": espn_id + 1000,
            "player_name": f"Player {espn_id}", "position": "G", "team": team,
            "game_date": start + timedelta(days=offset), "season": season, "starter": offset % 2 == 0,
            "did_not_play": False, "minutes": value, "pts": value / 2, "reb": 5, "ast": 3, "stl": 1,
            "blk": 0, "tov": 2, "fg3m": 1, "fga": 10, "fta": 4, **overrides,
        })
    return rows


def _appearances(history):
    return [{key: row[key] for key in ("game_id", "espn_player_id", "team", "game_date", "did_not_play", "minutes", "pts")}
            | {"dnp_reason": None} for row in history]


GAME = {"game_id": "next", "game_date": SLATE, "home": "LAL", "away": "BOS", "spread": -4.5, "over_under": 228.0}


class PlayerFormTests(unittest.TestCase):
    def test_windows_match_the_view_definitions(self):
        history = _history(1, "LAL", [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120])
        history += _history(1, "LAL", [5], start=date(2026, 4, 1), season=2026)  # last season
        form = player_form(history, SLATE, season=2027).set_index("espn_player_id").loc[1]

        self.assertEqual(form["games_before"], 13)                    # every season counts
        self.assertAlmostEqual(form["min_last5"], (80 + 90 + 100 + 110 + 120) / 5)
        self.assertAlmostEqual(form["min_last10"], sum(range(30, 130, 10)) / 10)
        self.assertAlmostEqual(form["min_season_avg"], sum(range(10, 130, 10)) / 12)  # this season only
        self.assertEqual(form["rest_days"], (SLATE - date(2026, 11, 12)).days)
        self.assertEqual(form["back_to_back"], 0.0)
        self.assertAlmostEqual(form["starter_rate_last10"], 0.5)

    def test_ignores_games_on_or_after_the_slate_and_did_not_plays(self):
        history = _history(1, "LAL", [30] * 6)
        history += _history(1, "LAL", [99], start=SLATE)                       # the game being predicted
        history += _history(1, "LAL", [0], start=date(2026, 11, 7))[:1]          # zero minutes
        history[-1]["game_id"] = "zero"
        dnp = _history(1, "LAL", [40], start=date(2026, 11, 8))
        dnp[0].update(did_not_play=True, game_id="dnp")
        form = player_form(history + dnp, SLATE, season=2027).set_index("espn_player_id").loc[1]
        self.assertEqual(form["games_before"], 6)
        self.assertEqual(form["min_last10"], 30)

    def test_null_did_not_play_is_dropped_like_the_view(self):
        history = _history(1, "LAL", [30] * 6) + _history(1, "LAL", [90], start=date(2026, 11, 10), did_not_play=None)
        history[-1]["game_id"] = "null"
        form = player_form(history, SLATE, season=2027).set_index("espn_player_id").loc[1]
        self.assertEqual(form["games_before"], 6)

    def test_rotation_means_playing_in_one_of_the_teams_last_three_games(self):
        history = _history(1, "LAL", [30] * 10) + _history(2, "LAL", [10] * 6)  # 2 stopped on Nov 6
        history += _history(3, "STARS", [12] * 6)                                # exhibitions only
        form = player_form(history, SLATE, season=2027).set_index("espn_player_id")
        self.assertTrue(form.loc[1, "in_rotation"])
        self.assertFalse(form.loc[2, "in_rotation"])
        self.assertFalse(form.loc[3, "in_rotation"])

    def test_team_comes_from_the_latest_league_game(self):
        history = _history(1, "LAL", [30] * 6) + _history(1, "STARS", [12], start=date(2026, 11, 10))
        history[-1]["game_id"] = "allstar"
        form = player_form(history, SLATE, season=2027).set_index("espn_player_id").loc[1]
        self.assertEqual(form["team"], "LAL")


class BuildUpcomingFrameTests(unittest.TestCase):
    def setUp(self):
        self.history = (
            _history(1, "LAL", [36] * 10)                                       # starter
            + _history(2, "LAL", [30] * 10)                                     # will be ruled out
            + _history(3, "BOS", [25] * 10)                                     # questionable
            + _history(4, "BOS", [20] * 3)                                      # too few games
            + _history(5, "BOS", [20] * 10, start=date(2026, 9, 1))             # not played for months
            + _history(6, "NYK", [30] * 10)                                     # not on the slate
        )
        self.injuries = {
            1002: {"status": "Out", "espnId": 2, "team": "LAL"},
            1003: {"status": "Questionable", "status_abbr": "Q", "espnId": 3, "team": "BOS"},
        }

    def _frame(self, injuries=None):
        return build_upcoming_frame([GAME], self.history, [], _appearances(self.history),
                                    self.injuries if injuries is None else injuries, season=2027)

    def test_rosters_skip_out_inactive_short_history_and_other_teams(self):
        frame = self._frame()
        self.assertEqual(sorted(frame["espn_player_id"]), [1, 3])
        self.assertTrue(set(FEATURE_COLUMNS) <= set(frame.columns))

    def test_ruled_out_player_counts_as_missing_minutes(self):
        frame = self._frame().set_index("espn_player_id")
        self.assertEqual(frame.loc[1, "team_missing_min"], 30)       # his usual minutes
        self.assertEqual(frame.loc[1, "team_missing_min_recent"], 30)  # played within 14 days
        self.assertEqual(frame.loc[3, "opp_missing_min"], 30)
        self.assertEqual(frame.loc[3, "team_missing_min"], 0)          # nobody out is 0, not NaN

    def test_without_injuries_nobody_is_missing(self):
        frame = self._frame(injuries={}).set_index("espn_player_id")
        self.assertIn(2, frame.index)
        self.assertEqual(frame.loc[1, "team_missing_min"], 0)

    def test_home_and_away_see_the_spread_from_their_own_side(self):
        frame = self._frame().set_index("espn_player_id")
        self.assertEqual(frame.loc[1, "team_spread"], -4.5)
        self.assertEqual(frame.loc[3, "team_spread"], 4.5)
        self.assertEqual(frame.loc[1, "is_home"], 1.0)
        self.assertEqual(frame.loc[3, "over_under"], 228.0)
        self.assertEqual(frame.loc[3, "injury"]["status"], "Questionable")

    def test_no_games_gives_an_empty_frame(self):
        self.assertTrue(build_upcoming_frame([], self.history, [], [], {}).empty)


class ScoreboardEventTests(unittest.TestCase):
    def _event(self, state="pre", home="GS", away="NY", odds=None):
        return {"id": 401, "date": "2026-11-21T00:30Z", "status": {"type": {"state": state}},
                "competitions": [{"competitors": [
                    {"homeAway": "home", "team": {"abbreviation": home}},
                    {"homeAway": "away", "team": {"abbreviation": away}}],
                    "odds": odds if odds is not None else [{"spread": -3.5, "overUnder": 221.5, "details": "GS -3.5"}]}]}

    def test_parses_teams_and_home_line(self):
        game = game_predictions.parse_scoreboard_event(self._event())
        self.assertEqual((game["game_id"], game["home"], game["away"]), ("401", "GSW", "NYK"))
        self.assertEqual((game["spread"], game["over_under"]), (-3.5, 221.5))

    def test_missing_odds_are_none(self):
        game = game_predictions.parse_scoreboard_event(self._event(odds=[]))
        self.assertIsNone(game["spread"])

    def test_started_and_exhibition_games_are_skipped(self):
        self.assertIsNone(game_predictions.parse_scoreboard_event(self._event(state="in")))
        self.assertIsNone(game_predictions.parse_scoreboard_event(self._event(home="STARS")))


def _row(name, team="LAL", minutes=30.0, pts=(20.0, 15.0), game_id="next", injury=None):
    row = {"id": 100 + int("".join(c for c in name if c.isdigit()) or 0), "espn_id": 1, "name": name, "team": team, "opponent": "BOS", "is_home": True,
           "position": "G", "game_id": game_id, "tipoff": "", "injury": injury}
    for stat in TARGET_COLUMNS:
        row[f"predicted_{stat}"], row[f"last10_{stat}"] = 2.0, 2.0
    row["predicted_pts"], row["last10_pts"] = pts
    row["predicted_minutes"], row["last10_minutes"] = minutes, minutes
    return row


class RankingTests(unittest.TestCase):
    def test_enrich_derives_pra_fantasy_and_diffs(self):
        row = game_predictions.enrich(_row("A", pts=(20.0, 15.0)))
        self.assertEqual(row["predicted_pra"], 24.0)
        self.assertEqual(row["team_logo"], "https://cdn.nba.com/logos/nba/1610612747/global/L/logo.svg")  # LAL
        self.assertTrue(row["opponent_logo"].endswith("/1610612738/global/L/logo.svg"))                  # BOS
        game = game_predictions.with_logos({"home": "LAL", "away": "XXX"})
        self.assertEqual((game["home_logo"], game["away_logo"]), (row["team_logo"], None))
        self.assertEqual(row["diff_pts"], 5.0)
        # FanDuel: pts + 1.2 reb + 1.5 ast + 3 stl + 3 blk - tov
        self.assertEqual(row["predicted_fantasy"], round(20 + 2.4 + 3 + 6 + 6 - 2, 1))
        custom = game_predictions.enrich(_row("A"), {"pts": 1, "reb": 0, "ast": 0, "stl": 0, "blk": 0, "tov": 0})
        self.assertEqual(custom["predicted_fantasy"], 20.0)

    def test_enrich_keeps_missing_averages_missing(self):
        row = _row("A")
        row["last10_reb"] = None
        row = game_predictions.enrich(row)
        self.assertIsNone(row["last10_pra"])
        self.assertIsNone(row["diff_pra"])

    def test_recommendations_rank_each_kind(self):
        rows = [game_predictions.enrich(r) for r in (
            _row("Up big", pts=(25.0, 15.0)), _row("Up small", pts=(16.0, 15.0)),
            _row("Down", pts=(10.0, 15.0)), _row("Bench up", minutes=8.0, pts=(12.0, 4.0)),
            _row("Top", pts=(30.0, 29.0)))]
        picks = game_predictions.recommendations(rows, limit=3)
        names = lambda kind: [row["name"] for row in picks[kind]["pts"]]  # noqa: E731
        self.assertEqual(names("top"), ["Top", "Up big", "Up small"])
        self.assertEqual(names("over"), ["Up big", "Up small", "Top"])   # bench player filtered out
        self.assertEqual(names("fade"), ["Down"])
        self.assertEqual(set(picks["top"]), set(game_predictions.RECOMMENDATION_STATS))

    def test_sort_and_filter(self):
        rows = [game_predictions.enrich(r) for r in (
            _row("b", pts=(10.0, 10.0)), _row("a", team="BOS", pts=(20.0, 10.0), game_id="other"))]
        self.assertEqual([r["name"] for r in game_predictions.sort_rows(rows, "name", "asc")], ["a", "b"])
        self.assertEqual([r["name"] for r in game_predictions.sort_rows(rows, "bogus", "desc")], ["a", "b"])
        self.assertEqual([r["name"] for r in game_predictions.filter_rows(rows, team="BOS")], ["a"])
        self.assertEqual([r["name"] for r in game_predictions.filter_rows(rows, game_id="next")], ["b"])
        self.assertEqual([r["name"] for r in game_predictions.filter_rows(rows, search="A")], ["a"])


class BuildCacheTests(unittest.TestCase):
    def test_rows_carry_predictions_baselines_and_accuracy(self):
        history = _history(1, "LAL", [30] * 10) + _history(3, "BOS", [20] * 10)
        frame = build_upcoming_frame([GAME], history, [], _appearances(history), {}, season=2027)
        predictions = pd.DataFrame(1.26, index=frame.index, columns=TARGET_COLUMNS)
        model = SimpleNamespace(architecture="xgboost", trained_at="t", trained_rows=10)
        report = {"architectures": {"xgboost": {"stats": {"pts": {"mae": 4.561, "naive_mae": 4.76,
                                                                  "improvement_pct": 4.2, "n": 5}}}}}
        cache = game_predictions.build_cache("2026-11-20", [dict(GAME, tipoff="T")], frame, predictions, model, report)
        player = next(p for p in cache["players"] if p["espn_id"] == 1)
        self.assertEqual(player["predicted_pts"], 1.3)
        self.assertEqual(player["last10_pts"], 15.0)
        self.assertEqual(player["last10_minutes"], 30.0)
        self.assertEqual((player["id"], player["tipoff"], player["opponent"]), (1001, "T", "BOS"))
        self.assertEqual(cache["accuracy"], {"pts": {"mae": 4.56, "naive_mae": 4.76, "improvement_pct": 4.2}})
        self.assertEqual(cache["slate_date"], "2026-11-20")

    def test_accuracy_carries_over_when_there_is_no_report(self):
        model = SimpleNamespace(architecture="xgboost", trained_at="t", trained_rows=10)
        empty = pd.DataFrame(columns=["game_date"])
        previous = {"model": {"architecture": "xgboost"}, "accuracy": {"pts": {"mae": 4.5}}}
        cache = game_predictions.build_cache("d", [], empty, empty, model, None, previous=previous)
        self.assertEqual(cache["accuracy"], {"pts": {"mae": 4.5}})
        other = {"model": {"architecture": "random_forest"}, "accuracy": {"pts": {"mae": 9}}}
        self.assertEqual(game_predictions.build_cache("d", [], empty, empty, model, None, previous=other)["accuracy"], {})


class GamePredictionRouteTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(load_data=False)
        self.client = self.app.test_client()
        self.conn = MagicMock()
        db_patch = patch('app.auth.get_db', return_value=self.conn)
        db_patch.start()
        self.addCleanup(db_patch.stop)
        self.total = PUBLIC_PREVIEW_LIMIT + 8
        rows = [_row(f"Player {i:02d}", pts=(float(i), 10.0)) for i in range(self.total)]
        self.cache = {'slate_date': '2026-11-20', 'games': [], 'players': rows}
        cache_patch = patch.object(state, 'current_game_predictions', side_effect=lambda: self.cache)
        cache_patch.start()
        self.addCleanup(cache_patch.stop)

    def _signed_in(self):
        self.conn.execute.return_value.fetchone.return_value = {'user_id': 7}
        return {'Authorization': 'Bearer valid'}

    def test_signed_out_list_is_a_capped_preview(self):
        body = self.client.get('/api/game-predictions?limit=50&page=2').get_json()
        self.assertTrue(body['preview'])
        self.assertEqual(len(body['predictions']), PUBLIC_PREVIEW_LIMIT)
        self.assertEqual(body['predictions'][0]['name'], f"Player {self.total - 1:02d}")  # best projection first
        self.assertEqual(body['slate_date'], '2026-11-20')

    def test_signed_in_list_is_complete_and_sortable(self):
        body = self.client.get('/api/game-predictions?limit=50&sort_by=name&sort_order=asc',
                               headers=self._signed_in()).get_json()
        self.assertFalse(body['preview'])
        self.assertEqual(body['pagination']['total'], self.total)
        self.assertEqual(body['predictions'][0]['name'], 'Player 00')

    def test_recommendations_need_an_account(self):
        self.conn.execute.return_value.fetchone.return_value = None
        self.assertEqual(self.client.get('/api/game-recommendations').status_code, 401)
        body = self.client.get('/api/game-recommendations?limit=2', headers=self._signed_in()).get_json()
        self.assertEqual(len(body['recommendations']['top']['pts']), 2)

    def test_player_lookup_by_id_then_name(self):
        self.conn.execute.return_value.fetchone.return_value = None
        self.assertEqual(self.client.get('/api/game-predictions/player/1').status_code, 401)
        headers = self._signed_in()
        row = self.cache['players'][3]
        body = self.client.get(f"/api/game-predictions/player/{row['id']}", headers=headers).get_json()
        self.assertEqual(body['prediction']['name'], row['name'])
        self.assertIn('predicted_pra', body['prediction'])                  # enriched
        body = self.client.get('/api/game-predictions/player/0?name=player%2005', headers=headers).get_json()
        self.assertEqual(body['prediction']['name'], 'Player 05')
        body = self.client.get('/api/game-predictions/player/0', headers=headers).get_json()
        self.assertIsNone(body['prediction'])                                # not on the slate
        self.assertEqual(body['slate_date'], '2026-11-20')

    def test_missing_cache_is_503(self):
        self.cache = None
        self.assertEqual(self.client.get('/api/game-predictions').status_code, 503)
        self.assertEqual(self.client.get('/api/game-recommendations', headers=self._signed_in()).status_code, 503)

    def test_a_past_slate_is_flagged_stale(self):
        self.cache['slate_date'] = '2000-01-01'
        self.assertTrue(self.client.get('/api/game-predictions').get_json()['stale'])
        self.cache['slate_date'] = '2999-01-01'
        self.assertFalse(self.client.get('/api/game-predictions').get_json()['stale'])


class CacheReloadTests(unittest.TestCase):
    def test_rewritten_file_is_picked_up_without_a_restart(self):
        import json, os, tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'cache.json'
            with patch('app.config.data_path', return_value=path), \
                    patch.object(state, 'game_predictions_cache', None), patch.object(state, '_game_predictions_mtime', None):
                self.assertIsNone(state.current_game_predictions())          # no file yet
                path.write_text(json.dumps({'slate_date': 'a', 'players': []}))
                self.assertEqual(state.current_game_predictions()['slate_date'], 'a')
                path.write_text(json.dumps({'slate_date': 'b', 'players': []}))
                os.utime(path, (1, 1))                                        # a different mtime
                self.assertEqual(state.current_game_predictions()['slate_date'], 'b')

    def test_a_bad_file_keeps_the_previous_slate_and_is_read_once(self):
        import json, os, tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'cache.json'
            good = {'slate_date': 'a', 'players': []}
            with patch('app.config.data_path', return_value=path), \
                    patch.object(state, 'game_predictions_cache', good), patch.object(state, '_game_predictions_mtime', None), \
                    patch('builtins.print'):
                for mtime, content in ((1, '[1, 2]'), (2, 'null'), (3, '{"slate_date": "b"}'), (4, '{"players": ')):
                    path.write_text(content)
                    os.utime(path, (mtime, mtime))
                    self.assertIs(state.current_game_predictions(), good, content)
                with patch('builtins.open', side_effect=AssertionError('re-read an unchanged file')):
                    self.assertIs(state.current_game_predictions(), good)
                path.write_text(json.dumps({'slate_date': 'c', 'players': []}))
                os.utime(path, (5, 5))
                self.assertEqual(state.current_game_predictions()['slate_date'], 'c')


class AtomicCacheWriteTests(unittest.TestCase):
    def test_replaces_the_file_whole_and_leaves_no_temp_files(self):
        import json, tempfile
        from pathlib import Path
        from scripts.generate_game_predictions_cache import write_json_atomically
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'cache.json'
            path.write_text('{"old": true}')
            write_json_atomically(path, {'players': [1]})
            self.assertEqual(json.loads(path.read_text()), {'players': [1]})
            self.assertEqual([p.name for p in Path(folder).iterdir()], ['cache.json'])

    def test_a_failed_write_keeps_the_old_file(self):
        import tempfile
        from pathlib import Path
        from scripts.generate_game_predictions_cache import write_json_atomically
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'cache.json'
            path.write_text('{"old": true}')
            with self.assertRaises(TypeError):
                write_json_atomically(path, {'bad': object()})               # not JSON-serialisable
            self.assertEqual(path.read_text(), '{"old": true}')
            self.assertEqual([p.name for p in Path(folder).iterdir()], ['cache.json'])


if __name__ == '__main__':
    unittest.main()
