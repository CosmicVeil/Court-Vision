import unittest
from contextlib import contextmanager
from datetime import date
from unittest.mock import patch

from app import create_app, state
from app.services import prediction_accuracy as accuracy


def prediction(player_id, predicted_ppg, ppg_last, **changes):
    row = {'id': player_id, 'name': f'Player {player_id}'}
    for key in ('ppg', 'apg', 'rpg', 'spg', 'bpg', 'tov', 'mpg'):
        row[f'predicted_{key}'] = 0.0
        row[f'{key}_last'] = 0.0
    return {**row, 'predicted_ppg': predicted_ppg, 'ppg_last': ppg_last, **changes}


def actual(player_id, ppg, games=10, **changes):
    row = {f'{key}_LAST': 0.0 for key in ('PPG', 'APG', 'RPG', 'SPG', 'BPG', 'TOV', 'MIN')}
    return {**row, 'PLAYER_ID': player_id, 'TEAM': 'DAL', 'PPG_LAST': ppg, 'GAMES_PLAYED_LAST': games, **changes}


def stat_row(stat='ppg', players=150, mae=2.0, baseline_mae=2.5):
    return {'stat': stat, 'players': players, 'min_games': 5, 'mae': mae, 'baseline_mae': baseline_mae}


class FakeConnection:
    def __init__(self, rows=None, logged_seasons=()):
        self.rows = rows or []
        self.logged_seasons = [{'season': season} for season in logged_seasons]
        self.last_sql = ''
        self.calls = []
        self.commits = 0
        self.rollbacks = 0

    @contextmanager
    def transaction(self):
        yield

    def execute(self, sql, params=None):
        self.last_sql = ' '.join(sql.split())
        self.calls.append((self.last_sql, params))
        return self

    def fetchall(self):
        if self.last_sql.startswith('SELECT DISTINCT season FROM prediction_log'):
            return self.logged_seasons
        return self.rows

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class ComputeTests(unittest.TestCase):
    def test_mae_and_naive_baseline_per_stat(self):
        rows = accuracy.compute(
            [prediction(1, 20.0, 24.0), prediction(2, 10.0, 9.0)],
            [actual(1, 22.0), actual(2, 13.0)],
        )
        ppg = rows[0]
        self.assertEqual(ppg['stat'], 'ppg')
        self.assertEqual(ppg['players'], 2)
        self.assertEqual(ppg['min_games'], accuracy.MIN_GAMES)
        self.assertAlmostEqual(ppg['mae'], (2.0 + 3.0) / 2)
        self.assertAlmostEqual(ppg['baseline_mae'], (2.0 + 4.0) / 2)
        self.assertEqual([r['stat'] for r in rows], ['ppg', 'apg', 'rpg', 'spg', 'bpg', 'tov', 'mpg'])

    def test_skips_small_samples_and_players_without_both_sides(self):
        rows = accuracy.compute(
            [prediction(1, 20.0, 24.0), prediction(2, 10.0, 9.0), prediction(3, 5.0, 5.0),
             prediction(4, None, 8.0)],
            [actual(1, 22.0), actual(2, 30.0, games=accuracy.MIN_GAMES - 1), actual(4, 8.0), actual(5, 12.0)],
        )
        self.assertEqual(rows[0]['players'], 1)
        self.assertAlmostEqual(rows[0]['mae'], 2.0)

    def test_nothing_to_score_returns_no_rows(self):
        self.assertEqual(accuracy.compute([prediction(1, 20.0, 24.0)], []), [])
        self.assertEqual(accuracy.compute([], [actual(1, 22.0)]), [])


class MetricsTests(unittest.TestCase):
    def test_bias_median_and_share_of_players_beating_the_baseline(self):
        errors = accuracy.score(
            [prediction(1, 20.0, 24.0), prediction(2, 10.0, 9.0), prediction(3, 15.0, 15.5)],
            [actual(1, 22.0), actual(2, 13.0), actual(3, 15.0)],
        )
        self.assertEqual(errors[0], {
            'player_id': 1, 'player_name': 'Player 1', 'team': 'DAL', 'stat': 'ppg',
            'predicted': 20.0, 'last_season': 24.0, 'actual': 22.0, 'games': 10,
        })
        ppg = accuracy.metrics(errors)[0]
        self.assertAlmostEqual(ppg['bias'], (-2.0 - 3.0 + 0.0) / 3)
        self.assertAlmostEqual(ppg['median_abs_error'], 2.0)
        self.assertAlmostEqual(ppg['beat_baseline_pct'], 200 / 3)  # player 1 ties the baseline: not a win
        self.assertEqual(accuracy.metrics([]), [])


class BestCallsTests(unittest.TestCase):
    def test_ranks_rotation_players_by_total_points_rebounds_assists_miss(self):
        predictions = [
            prediction(1, 20.0, 24.0, predicted_rpg=5.0, predicted_apg=4.0),
            prediction(2, 10.0, 9.0, predicted_rpg=3.0, predicted_apg=2.0),
            prediction(3, 8.0, 8.0), prediction(4, 6.0, 6.0),
        ]
        actuals = [
            actual(1, 21.0, RPG_LAST=5.5, APG_LAST=4.0, MIN_LAST=30.0),
            actual(2, 10.2, RPG_LAST=3.0, APG_LAST=2.1, MIN_LAST=24.0),
            actual(3, 8.0, MIN_LAST=accuracy.BEST_CALL_MIN_MINUTES - 1),
            actual(4, 6.0, games=accuracy.BEST_CALL_MIN_GAMES - 1, MIN_LAST=30.0),
        ]
        calls = accuracy.best_calls(accuracy.score(predictions, actuals))
        self.assertEqual([c['id'] for c in calls], [2, 1])
        self.assertEqual(calls[0], {
            'id': 2, 'name': 'Player 2', 'team': 'DAL', 'games': 10, 'miss': 0.3,
            'stats': {'ppg': {'predicted': 10.0, 'actual': 10.2}, 'rpg': {'predicted': 3.0, 'actual': 3.0},
                      'apg': {'predicted': 2.0, 'actual': 2.1}},
        })
        self.assertEqual(len(accuracy.best_calls(accuracy.score(predictions, actuals), limit=1)), 1)


class PredictionLogTests(unittest.TestCase):
    def test_version_is_stable_and_changes_with_any_prediction(self):
        rows = [prediction(1, 20.0, 24.0), prediction(2, 10.0, 9.0)]
        self.assertEqual(accuracy.model_version(rows), accuracy.model_version(list(reversed(rows))))
        self.assertNotEqual(accuracy.model_version(rows),
                            accuracy.model_version([prediction(1, 20.1, 24.0), prediction(2, 10.0, 9.0)]))
        self.assertEqual(len(accuracy.model_version(rows)), 12)

    def test_first_sight_inserts_every_player_stat_once(self):
        conn = FakeConnection()
        rows = [prediction(1, 20.0, 24.0)]
        self.assertTrue(accuracy.log_predictions(conn, 2027, rows))
        sql, params = conn.calls[1]
        self.assertIn('INSERT INTO prediction_log', sql)
        self.assertIn('ON CONFLICT DO NOTHING', sql)
        self.assertEqual(params[:2], (2027, accuracy.model_version(rows)))
        self.assertEqual(params[2], [1] * 7)
        self.assertEqual(sorted(params[4]), sorted(['ppg', 'apg', 'rpg', 'spg', 'bpg', 'tov', 'mpg']))
        self.assertEqual(conn.commits, 1)

    def test_already_logged_for_this_season_inserts_nothing(self):
        conn = FakeConnection(logged_seasons=[2027])
        self.assertTrue(accuracy.log_predictions(conn, 2027, [prediction(1, 20.0, 24.0)]))
        self.assertEqual(len(conn.calls), 1)

    def test_predictions_logged_for_an_earlier_season_are_stale(self):
        conn = FakeConnection(logged_seasons=[2027])
        with patch('builtins.print'):
            self.assertFalse(accuracy.log_predictions(conn, 2028, [prediction(1, 20.0, 24.0)]))
        self.assertEqual(len(conn.calls), 1)
        self.assertFalse(accuracy.log_predictions(FakeConnection(), 2027, []))

    def test_player_errors_query_matches_the_season_averages_filters(self):
        conn = FakeConnection()
        accuracy.player_errors(conn, 2027, 'abc', as_of=date(2026, 11, 1), min_games=8)
        sql, params = conn.calls[0]
        for clause in ('season_type = 2', 'NOT did_not_play', 'nba_player_id IS NOT NULL',
                       'game_date <= %(as_of)s::date', 'HAVING COUNT(*) >= %(min_games)s',
                       "WHEN 'mpg' THEN a.mpg", 'l.model_version = %(version)s'):
            self.assertIn(clause, sql)
        self.assertEqual(params, {'season': 2027, 'version': 'abc', 'as_of': date(2026, 11, 1), 'min_games': 8})


class SummaryTests(unittest.TestCase):
    def test_good_needs_enough_players_and_a_better_headline_mae_than_the_baseline(self):
        self.assertTrue(accuracy.is_good([stat_row()]))
        self.assertFalse(accuracy.is_good([stat_row(players=accuracy.MIN_PLAYERS - 1)]))
        self.assertFalse(accuracy.is_good([stat_row(mae=2.5, baseline_mae=2.5)]))
        self.assertFalse(accuracy.is_good([stat_row(stat='rpg')]))
        self.assertFalse(accuracy.is_good([]))

    def test_summary_payload(self):
        summary = accuracy.summarize(2027, date(2026, 11, 9), [
            stat_row(mae=2.904, baseline_mae=3.031), stat_row(stat='rpg', players=140, mae=1.2, baseline_mae=1.0),
            stat_row(stat='mpg'),  # internal only: never in the public payload
        ], [{'id': 1}])
        self.assertEqual(summary, {
            'season': '2026-27', 'as_of': '2026-11-09', 'players': 150, 'min_games': 5, 'good': True,
            'stats': {
                'ppg': {'mae': 2.9, 'baseline_mae': 3.03, 'improvement_pct': 4.2},
                'rpg': {'mae': 1.2, 'baseline_mae': 1.0, 'improvement_pct': -20.0},
            },
            'best_calls': [{'id': 1}],
        })
        self.assertIsNone(accuracy.summarize(2027, date(2026, 11, 9), []))


class StorageTests(unittest.TestCase):
    def test_save_snapshot_upserts_one_row_per_stat(self):
        conn = FakeConnection()
        accuracy.save_snapshot(conn, 2027, date(2026, 11, 9), [stat_row(), stat_row(stat='rpg')])
        self.assertEqual(len(conn.calls), 2)
        sql, params = conn.calls[0]
        self.assertIn('INSERT INTO prediction_accuracy', sql)
        self.assertIn('ON CONFLICT (season, snapshot_date, stat) DO UPDATE SET', sql)
        self.assertEqual(params, [2027, date(2026, 11, 9), 'ppg', 150, 5, 2.0, 2.5])
        self.assertEqual(conn.commits, 1)

    def test_latest_snapshot_reads_the_newest_date_in_stat_order(self):
        conn = FakeConnection([
            {'snapshot_date': date(2026, 11, 9), **stat_row(stat='rpg')},
            {'snapshot_date': date(2026, 11, 9), **stat_row()},
        ])
        summary = accuracy.latest_snapshot(conn, 2027)
        sql, params = conn.calls[0]
        self.assertIn('SELECT MAX(snapshot_date) FROM prediction_accuracy WHERE season = %s', sql)
        self.assertEqual(params, (2027, 2027))
        self.assertEqual(list(summary['stats']), ['ppg', 'rpg'])
        self.assertEqual(summary['best_calls'], [])
        self.assertEqual(summary['as_of'], '2026-11-09')
        self.assertIsNone(accuracy.latest_snapshot(FakeConnection(), 2027))


class RecordTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.object(state, 'prediction_accuracy', None))
        self.enterContext(patch.object(state, 'current_season_year', 2027))
        self.enterContext(patch.object(state, 'current_season_data', [actual(1, 22.0)]))
        self.enterContext(patch.object(accuracy, '_prediction_rows', [prediction(1, 20.0, 24.0)]))

    def test_record_stores_and_publishes_the_snapshot(self):
        conn = FakeConnection()
        summary = accuracy.record(conn, today=date(2026, 11, 9))
        self.assertEqual(len(conn.calls), 7)
        self.assertEqual(conn.calls[0][1][:3], [2027, date(2026, 11, 9), 'ppg'])
        self.assertIs(state.prediction_accuracy, summary)
        self.assertEqual(summary['stats']['ppg'], {'mae': 2.0, 'baseline_mae': 2.0, 'improvement_pct': 0.0})
        self.assertEqual(list(summary['stats']), ['ppg', 'apg', 'rpg'])
        self.assertFalse(summary['good'])

    def test_record_without_a_connection_only_publishes(self):
        self.assertIsNotNone(accuracy.record(today=date(2026, 11, 9)))
        self.assertEqual(state.prediction_accuracy['as_of'], '2026-11-09')

    def test_record_is_a_no_op_before_start_and_when_nothing_can_be_scored(self):
        conn = FakeConnection()
        with patch.object(accuracy, '_prediction_rows', None):
            self.assertIsNone(accuracy.record(conn))
        with patch.object(state, 'current_season_data', []):
            self.assertIsNone(accuracy.record(conn))
        self.assertEqual(conn.calls, [])
        self.assertIsNone(state.prediction_accuracy)

    def test_a_failed_write_never_raises_and_keeps_the_previous_snapshot(self):
        conn = FakeConnection()
        conn.execute = lambda *args: (_ for _ in ()).throw(RuntimeError('db down'))
        with patch.object(state, 'prediction_accuracy', 'previous'), patch('builtins.print'):
            self.assertIsNone(accuracy.record(conn))
            self.assertEqual(state.prediction_accuracy, 'previous')
        self.assertEqual(conn.rollbacks, 1)

    def test_start_loads_cached_predictions_then_falls_back_to_the_stored_snapshot(self):
        cache = {'all_players_list': [prediction(1, 21.0, 24.0)]}
        with patch.object(state, 'predictions_cache', cache):
            self.assertEqual(accuracy.start()['stats']['ppg']['mae'], 1.0)
        stored = FakeConnection([{'snapshot_date': date(2026, 11, 8), **stat_row()}])
        with patch.object(state, 'predictions_cache', cache), patch.object(state, 'current_season_data', []):
            self.assertEqual(accuracy.start(stored)['as_of'], '2026-11-08')
        self.assertIn('INSERT INTO prediction_log', stored.calls[1][0])

    def test_start_does_not_score_stale_predictions(self):
        cache = {'all_players_list': [prediction(1, 21.0, 24.0)]}
        conn = FakeConnection(logged_seasons=[2026])
        with patch.object(state, 'predictions_cache', cache), patch('builtins.print'):
            self.assertIsNone(accuracy.start(conn))
        self.assertIsNone(accuracy._prediction_rows)
        self.assertIsNone(accuracy.record(conn))
        self.assertIsNone(state.prediction_accuracy)


class StartupTests(unittest.TestCase):
    def test_reloading_the_season_re_scores_the_predictions_on_the_same_connection(self):
        conn = FakeConnection()
        with patch.dict('os.environ', {'DATABASE_URL': 'postgresql://unused/test'}), \
             patch.object(state, 'current_season_data', []), \
             patch.object(state.game_archive, 'season_player_averages', return_value=[actual(1, 22.0)]), \
             patch.object(accuracy, 'record') as record:
            self.assertEqual(state.load_current_season(conn), 1)
        record.assert_called_once_with(conn)

    def test_startup_snapshot_skips_storage_without_a_database(self):
        with patch.dict('os.environ', {}, clear=True), patch.object(accuracy, 'start') as start, \
             patch.object(state.db, 'get_db') as get_db:
            state.start_prediction_accuracy()
        start.assert_called_once_with(None)
        get_db.assert_not_called()


class ReportTests(unittest.TestCase):
    def test_report_lists_every_stat_and_the_closest_and_biggest_misses(self):
        from scripts.accuracy_report import build_report

        errors = accuracy.score(
            [prediction(1, 20.0, 24.0), prediction(2, 10.0, 9.0), prediction(3, 15.0, 15.5)],
            [actual(1, 22.0), actual(2, 13.0), actual(3, 15.0)],
        )
        report = build_report(errors, 'ppg', top=1)
        self.assertIn('PPG         3    1.67      2.17   +23.1%   -1.67    2.00        67%', report)
        self.assertIn('MPG', report)
        closest, biggest = report.split('Closest PPG predictions')[1].split('Biggest PPG misses')
        self.assertIn('Player 3', closest)
        self.assertNotIn('Player 2', closest)
        self.assertIn('Player 2', biggest)
        self.assertIn('-3.0', biggest)
        self.assertEqual(build_report([], 'ppg', top=1), 'No players to score yet.')


class PlayerTableTests(unittest.TestCase):
    def setUp(self):
        self.errors = accuracy.score(
            [prediction(1, 20.0, 24.0, predicted_rpg=5.0), prediction(2, 10.0, 9.0, predicted_rpg=9.0),
             prediction(3, 15.0, 15.5, predicted_rpg=4.0)],
            [actual(1, 22.0, RPG_LAST=5.0), actual(2, 11.0, RPG_LAST=3.0), actual(3, 15.0, RPG_LAST=5.0)],
        )

    def test_ranks_every_player_by_one_stat_or_by_the_scaled_overall_miss(self):
        from scripts.accuracy_report import format_table, player_table

        self.assertEqual([p['player_name'] for p in player_table(self.errors, 'ppg')],
                         ['Player 3', 'Player 2', 'Player 1'])
        overall = player_table(self.errors)
        # Player 2 is close on points but six rebounds off: scaling each stat by its typical
        # miss (ppg 1.0, rpg 7/3) puts them last overall.
        self.assertEqual([p['player_name'] for p in overall], ['Player 3', 'Player 1', 'Player 2'])
        self.assertAlmostEqual(overall[1]['score'], (2.0 / 1.0 + 0.0) / 2)  # stats nobody missed on are left out
        self.assertEqual(overall[0]['stats']['ppg'], {'predicted': 15.0, 'actual': 15.0, 'error': 0.0})
        lines = format_table(overall).splitlines()
        self.assertEqual(len(lines), 5)
        self.assertIn('15.0/15.0', lines[2])
        self.assertTrue(lines[2].startswith('   1  Player 3'))

    def test_csv_has_predicted_actual_and_error_for_every_stat(self):
        import csv
        import os
        import tempfile
        from scripts.accuracy_report import player_table, write_csv

        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, 'accuracy.csv')
            write_csv(player_table(self.errors, 'ppg'), path)
            with open(path, newline='', encoding='utf-8') as f:
                rows = list(csv.DictReader(f))
        self.assertEqual(len(rows), 3)
        self.assertEqual(len(rows[0]), 5 + 7 * 3)
        self.assertEqual((rows[2]['player'], rows[2]['ppg_predicted'], rows[2]['ppg_actual'], rows[2]['ppg_error']),
                         ('Player 1', '20.0', '22.0', '-2.0'))


class AccuracyRouteTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app(load_data=False).test_client()

    def test_route_is_public_and_serves_the_published_snapshot(self):
        with patch.object(state, 'prediction_accuracy', None):
            response = self.client.get('/api/predictions/accuracy')
            self.assertEqual((response.status_code, response.get_json()), (200, {'accuracy': None}))
        with patch.object(state, 'prediction_accuracy', {'good': True}):
            self.assertEqual(self.client.get('/api/predictions/accuracy').get_json(), {'accuracy': {'good': True}})


if __name__ == '__main__':
    unittest.main()
