import json
import os
import unittest
from copy import deepcopy
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch

from app import create_app, db, state
from app.api.helpers import get_player_stats_summary
from app.api.routes.players import _season_line
from app.services import game_archive


def grouped_row(**changes):
    return {
        'nba_player_id': 1, 'player_name': 'Archive Name', 'team': 'DAL',
        'position': 'G', 'games': 4, 'minutes': Decimal('130'),
        'pts': 97, 'reb': 29, 'ast': 32, 'stl': 5, 'blk': 2, 'tov': 9,
        'fgm': 34, 'fga': 70, 'fg3m': 8, 'fg3a': 25, 'ftm': 21, 'fta': 24,
        **changes,
    }


class GroupedConnection:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def execute(self, sql, params):
        self.calls.append((sql, params))
        return self

    def fetchall(self):
        return self.rows


class SeasonPlayerAveragesTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.object(state, 'nba_data', [
            {'PLAYER_ID': 1, 'PLAYER_NAME': 'Pickle Name', 'POSITION': 'PG',
             'AGE': 27, 'HEIGHT': 190, 'WEIGHT': 90},
        ]))

    def query(self, rows):
        self.assertTrue(callable(getattr(game_archive, 'season_player_averages', None)))
        conn = GroupedConnection(rows)
        return game_archive.season_player_averages(conn, 2027), conn

    def test_averages_and_weighted_shooting_ratios(self):
        rows, _ = self.query([grouped_row()])
        self.assertEqual(rows, [{
            'PLAYER_ID': 1, 'PLAYER_NAME': 'Pickle Name', 'TEAM': 'DAL',
            'POSITION': 'PG', 'AGE': 28, 'HEIGHT': 190, 'WEIGHT': 90,
            'PPG_LAST': 24.25, 'RPG_LAST': 7.25, 'APG_LAST': 8.0,
            'SPG_LAST': 1.25, 'BPG_LAST': 0.5, 'TOV_LAST': 2.25, 'MIN_LAST': 32.5,
            'FG_PCT_LAST': 34 / 70, 'FG3_PCT_LAST': 0.32, 'FT_PCT_LAST': 0.875,
            'GAMES_PLAYED_LAST': 4,
        }])
        self.assertIsInstance(rows[0]['MIN_LAST'], float)
        summary = get_player_stats_summary(rows[0])
        self.assertEqual(summary['stats']['ppg_last'], 24.2)
        self.assertEqual(summary['stats']['fg3_pct_last'], 32.0)
        self.assertEqual(_season_line(rows[0])['games_played'], 4)
        self.assertEqual(_season_line(rows[0])['minutes'], 32.5)

    def test_query_excludes_preseason_playoffs_dnp_and_null_ids(self):
        _, conn = self.query([])
        self.assertEqual(len(conn.calls), 1)
        sql, params = conn.calls[0]
        sql = ' '.join(sql.split())
        for clause in ('p.season = %s', 'p.season_type = 2', 'NOT p.did_not_play',
                       'p.nba_player_id IS NOT NULL', 'GROUP BY p.nba_player_id',
                       'JOIN games g USING (game_id)'):
            self.assertIn(clause, sql)
        self.assertEqual(params, (2027,))
        for field in ('team', 'player_name', 'position'):
            self.assertIn(f'array_agg(p.{field} ORDER BY p.game_date DESC, g.tipoff DESC NULLS LAST)', sql)
        self.assertIn('FILTER (WHERE p.position IS NOT NULL)', sql)

    def test_null_id_skipped_and_empty_archive(self):
        for rows in ([], [grouped_row(nba_player_id=None)]):
            with self.subTest(rows=rows):
                self.assertEqual(self.query(rows)[0], [])

    def test_rookie_position_fallback_and_zero_attempts(self):
        for position, expected in (('C', 'C'), (None, 'UNK')):
            with self.subTest(position=position):
                rows, _ = self.query([grouped_row(nba_player_id=99, position=position,
                                                fgm=0, fga=0, fg3m=0, fg3a=0, ftm=0, fta=0)])
                row = rows[0]
                self.assertEqual(row['PLAYER_NAME'], 'Archive Name')
                self.assertEqual(row['POSITION'], expected)
                self.assertIsNone(row['AGE'])
                self.assertNotIn('HEIGHT', row)
                self.assertNotIn('WEIGHT', row)
                for key in ('FG_PCT_LAST', 'FG3_PCT_LAST', 'FT_PCT_LAST'):
                    self.assertEqual(row[key], 0)

    def query_on(self, today, rows):
        now = datetime(today.year, today.month, today.day, 12, tzinfo=timezone.utc)
        with patch.object(game_archive, 'datetime', wraps=datetime) as clock:
            clock.now.return_value = now
            return self.query(rows)[0]

    def test_archive_only_player_with_bio_gets_age_height_weight(self):
        bio = {'birth_date': date(2006, 10, 2), 'height_in': 81.0, 'weight_lb': 220.0}
        for today, age in ((date(2026, 11, 1), 20), (date(2026, 10, 2), 20), (date(2026, 10, 1), 19)):
            with self.subTest(today=today):
                row = self.query_on(today, [grouped_row(nba_player_id=99, **bio)])[0]
                self.assertEqual((row['AGE'], row['HEIGHT'], row['WEIGHT']), (age, 81.0, 220.0))

    def test_archive_only_bio_with_null_fields(self):
        row = self.query_on(date(2026, 11, 1), [grouped_row(
            nba_player_id=99, birth_date=None, height_in=None, weight_lb=210.0)])[0]
        self.assertIsNone(row['AGE'])
        self.assertNotIn('HEIGHT', row)
        self.assertEqual(row['WEIGHT'], 210.0)

    def test_pkl_player_ignores_bio(self):
        row = self.query_on(date(2026, 11, 1), [grouped_row(
            birth_date=date(2000, 1, 1), height_in=70.0, weight_lb=150.0)])[0]
        self.assertEqual((row['AGE'], row['HEIGHT'], row['WEIGHT']), (28, 190, 90))

    def test_query_joins_player_bios(self):
        _, conn = self.query([])
        self.assertEqual(len(conn.calls), 1)
        sql = ' '.join(conn.calls[0][0].split())
        self.assertIn('LEFT JOIN player_bios b ON b.espn_player_id = p.espn_player_id', sql)
        self.assertEqual(conn.calls[0][1], (2027,))

    def test_query_errors_propagate_to_refresh_owner(self):
        self.assertTrue(callable(getattr(game_archive, 'season_player_averages', None)))
        conn = MagicMock()
        conn.execute.side_effect = RuntimeError('query failed')
        with self.assertRaisesRegex(RuntimeError, 'query failed'):
            game_archive.season_player_averages(conn, 2027)


class SingleGameRefreshTests(unittest.TestCase):
    def test_single_game_refresh_and_existing_game_skip(self):
        for already_stored in (False, True):
            with self.subTest(already_stored=already_stored), \
                 patch.object(db, 'get_db') as connect, \
                 patch.object(game_archive, 'archived_game_ids', return_value={'1'} if already_stored else set()), \
                 patch.object(game_archive, 'archive_game', return_value=True) as archive, \
                 patch.object(state, 'load_current_season', create=True) as refresh:
                game_archive._archive_in_background('1')
                if already_stored:
                    archive.assert_not_called()
                    refresh.assert_not_called()
                else:
                    archive.assert_called_once_with(connect.return_value, '1')
                    refresh.assert_called_once_with(connect.return_value)
                connect.return_value.close.assert_called_once_with()

    def test_single_game_failure_remains_retryable(self):
        for failure in (False, RuntimeError('archive failed')):
            with self.subTest(failure=failure), patch.object(game_archive, '_seen', {'1'}), \
                 patch.object(db, 'get_db') as connect, \
                 patch.object(game_archive, 'archived_game_ids', return_value=set()), \
                 patch.object(game_archive, 'archive_game', return_value=False,
                              side_effect=failure if isinstance(failure, Exception) else None), \
                 patch.object(state, 'load_current_season', create=True) as refresh:
                game_archive._archive_in_background('1')
                self.assertNotIn('1', game_archive._seen)
                refresh.assert_not_called()
                connect.return_value.close.assert_called_once_with()


class CatchUpTests(unittest.TestCase):
    def test_eastern_date_window_and_custom_days(self):
        self.assertTrue(callable(getattr(game_archive, 'catch_up_recent_games', None)))
        conn = MagicMock()
        counts = {'archived': 2, 'skipped': 1, 'failed': 0}
        with patch.object(game_archive, 'archive_dates', return_value=counts) as archive:
            self.assertEqual(game_archive.catch_up_recent_games(conn, today=date(2026, 10, 29)), counts)
            archive.assert_called_once_with(conn, date(2026, 10, 26), date(2026, 10, 29))
            archive.reset_mock()
            game_archive.catch_up_recent_games(conn, days=1, today=date(2026, 10, 29))
            archive.assert_called_once_with(conn, date(2026, 10, 28), date(2026, 10, 29))

    def test_backfill_start_widens_the_window_but_never_narrows_it(self):
        conn = MagicMock()
        with patch.object(game_archive, 'archive_dates') as archive:
            game_archive.catch_up_recent_games(conn, today=date(2026, 10, 29), start=date(2026, 10, 1))
            archive.assert_called_once_with(conn, date(2026, 10, 1), date(2026, 10, 29))
            archive.reset_mock()
            game_archive.catch_up_recent_games(conn, today=date(2026, 10, 29), start=date(2026, 10, 28))
            archive.assert_called_once_with(conn, date(2026, 10, 26), date(2026, 10, 29))

    def test_default_today_is_eastern_even_before_utc_midnight_rollover(self):
        self.assertTrue(callable(getattr(game_archive, 'catch_up_recent_games', None)))
        instant = datetime(2026, 10, 30, 2, tzinfo=timezone.utc)
        with patch.object(game_archive, 'datetime') as clock, \
             patch.object(game_archive, 'archive_dates') as archive:
            clock.now.side_effect = lambda tz: instant.astimezone(tz)
            conn = MagicMock()
            game_archive.catch_up_recent_games(conn)
            clock.now.assert_called_once_with(game_archive._ET)
            archive.assert_called_once_with(conn, date(2026, 10, 26), date(2026, 10, 29))

    def test_repeated_catch_up_skips_stored_games(self):
        self.assertTrue(callable(getattr(game_archive, 'catch_up_recent_games', None)))
        conn = MagicMock()
        stored = set()
        def store_game(connection, game_id):
            stored.add(game_id)
            return True
        with patch.object(game_archive, 'completed_game_ids_on', return_value=['missed']), \
             patch.object(game_archive, 'archived_game_ids', side_effect=lambda c, ids: stored & set(ids)), \
             patch.object(game_archive, 'archive_game', side_effect=store_game) as archive, \
             patch.object(game_archive.time, 'sleep'):
            first = game_archive.catch_up_recent_games(conn, days=0, today=date(2026, 10, 29))
            second = game_archive.catch_up_recent_games(conn, days=0, today=date(2026, 10, 29))
        self.assertEqual(first, {'archived': 1, 'skipped': 0, 'failed': 0})
        self.assertEqual(second, {'archived': 0, 'skipped': 1, 'failed': 0})
        archive.assert_called_once_with(conn, 'missed')

    def test_background_refreshes_only_new_games_and_closes(self):
        self.assertTrue(callable(getattr(game_archive, '_catch_up_in_background', None)))
        for archived in (0, 2):
            with self.subTest(archived=archived), \
                 patch.object(db, 'get_db') as connect, \
                 patch.object(game_archive, 'catch_up_recent_games', return_value={'archived': archived}) as catch_up, \
                 patch.object(state, 'load_current_season', create=True) as refresh:
                game_archive._catch_up_in_background()
                catch_up.assert_called_once_with(connect.return_value, start=None)
                if archived:
                    refresh.assert_called_once_with(connect.return_value)
                else:
                    refresh.assert_not_called()
                connect.return_value.close.assert_called_once_with()

    def test_background_passes_the_backfill_start(self):
        with patch.object(db, 'get_db') as connect, \
             patch.object(game_archive, 'catch_up_recent_games', return_value={'archived': 0}) as catch_up:
            game_archive._catch_up_in_background(date(2026, 10, 1))
            catch_up.assert_called_once_with(connect.return_value, start=date(2026, 10, 1))

    def test_background_relinks_after_catch_up(self):
        order = []
        with patch.object(db, 'get_db') as connect, \
             patch.object(game_archive, 'catch_up_recent_games',
                          side_effect=lambda conn, start=None: order.append('catch_up') or {'archived': 2}) as catch_up, \
             patch.object(game_archive, 'relink_player_ids',
                          side_effect=lambda conn: order.append('relink') or 0) as relink, \
             patch.object(state, 'load_current_season', create=True) as refresh:
            game_archive._catch_up_in_background()
            self.assertEqual(order, ['catch_up', 'relink'])
            catch_up.assert_called_once_with(connect.return_value, start=None)
            relink.assert_called_once_with(connect.return_value)
            refresh.assert_called_once_with(connect.return_value)
            connect.return_value.close.assert_called_once_with()

    def test_background_reloads_when_only_relink_linked_players(self):
        with patch.object(db, 'get_db') as connect, \
             patch.object(game_archive, 'catch_up_recent_games', return_value={'archived': 0}), \
             patch.object(game_archive, 'relink_player_ids', return_value=3) as relink, \
             patch.object(state, 'load_current_season', create=True) as refresh, patch('builtins.print') as log:
            game_archive._catch_up_in_background()
            refresh.assert_called_once_with(connect.return_value)
            relink.assert_called_once_with(connect.return_value)
            log.assert_any_call('[game_archive] relinked 3 players')
            connect.return_value.close.assert_called_once_with()

    def test_background_skips_reload_when_nothing_new(self):
        with patch.object(db, 'get_db') as connect, \
             patch.object(game_archive, 'catch_up_recent_games', return_value={'archived': 0}), \
             patch.object(game_archive, 'relink_player_ids', return_value=0) as relink, \
             patch.object(state, 'load_current_season', create=True) as refresh, patch('builtins.print') as log:
            game_archive._catch_up_in_background()
            relink.assert_called_once_with(connect.return_value)
            refresh.assert_not_called()
            self.assertFalse(any('relinked' in str(call) for call in log.call_args_list))
            connect.return_value.close.assert_called_once_with()

    def test_background_reloads_new_games_when_relink_fails(self):
        with patch.object(db, 'get_db') as connect, \
             patch.object(game_archive, 'catch_up_recent_games', return_value={'archived': 2}), \
             patch.object(game_archive, 'relink_player_ids', side_effect=RuntimeError('relink failed')) as relink, \
             patch.object(state, 'load_current_season', create=True) as refresh, patch('builtins.print') as log:
            order = MagicMock()
            order.attach_mock(relink, 'relink')
            order.attach_mock(connect.return_value.rollback, 'rollback')
            order.attach_mock(refresh, 'refresh')
            game_archive._catch_up_in_background()
            self.assertEqual([call[0] for call in order.mock_calls], ['relink', 'rollback', 'refresh'])
            relink.assert_called_once_with(connect.return_value)
            connect.return_value.rollback.assert_called_once_with()
            refresh.assert_called_once_with(connect.return_value)
            self.assertIn('relink failed', log.call_args.args[0])
            connect.return_value.close.assert_called_once_with()

    def test_background_fills_bios_after_relink(self):
        order = []
        with patch.object(db, 'get_db') as connect, \
             patch.object(game_archive, 'catch_up_recent_games',
                          side_effect=lambda conn, start=None: order.append('catch_up') or {'archived': 0}), \
             patch.object(game_archive, 'relink_player_ids', side_effect=lambda conn: order.append('relink') or 0), \
             patch.object(game_archive, 'fill_missing_bios',
                          side_effect=lambda conn: order.append('bios') or 4) as bios, \
             patch.object(state, 'load_current_season', create=True) as refresh, patch('builtins.print') as log:
            game_archive._catch_up_in_background()
            self.assertEqual(order, ['catch_up', 'relink', 'bios'])
            bios.assert_called_once_with(connect.return_value)
            refresh.assert_called_once_with(connect.return_value)
            log.assert_any_call('[game_archive] fetched 4 player bios')

    def test_background_skips_reload_when_no_bios(self):
        with patch.object(db, 'get_db'), \
             patch.object(game_archive, 'catch_up_recent_games', return_value={'archived': 0}), \
             patch.object(game_archive, 'relink_player_ids', return_value=0), \
             patch.object(game_archive, 'fill_missing_bios', return_value=0), \
             patch.object(state, 'load_current_season', create=True) as refresh, patch('builtins.print') as log:
            game_archive._catch_up_in_background()
            refresh.assert_not_called()
            self.assertFalse(any('player bios' in str(call) for call in log.call_args_list))

    def test_background_bio_failure_rolls_back_and_still_reloads(self):
        with patch.object(db, 'get_db') as connect, \
             patch.object(game_archive, 'catch_up_recent_games', return_value={'archived': 2}), \
             patch.object(game_archive, 'relink_player_ids', return_value=0), \
             patch.object(game_archive, 'fill_missing_bios', side_effect=RuntimeError('espn down')) as bios, \
             patch.object(state, 'load_current_season', create=True) as refresh, patch('builtins.print') as log:
            order = MagicMock()
            order.attach_mock(bios, 'bios')
            order.attach_mock(connect.return_value.rollback, 'rollback')
            order.attach_mock(refresh, 'refresh')
            game_archive._catch_up_in_background()
            self.assertEqual([call[0] for call in order.mock_calls], ['bios', 'rollback', 'refresh'])
            self.assertIn('espn down', log.call_args.args[0])
            connect.return_value.close.assert_called_once_with()

    def test_background_failure_logs_and_closes(self):
        self.assertTrue(callable(getattr(game_archive, '_catch_up_in_background', None)))
        with patch.object(db, 'get_db') as connect, \
             patch.object(game_archive, 'catch_up_recent_games', side_effect=RuntimeError('catch-up failed')), \
             patch.object(state, 'load_current_season', create=True) as refresh, patch('builtins.print') as log:
            game_archive._catch_up_in_background()
            connect.return_value.close.assert_called_once_with()
            refresh.assert_not_called()
            self.assertIn('catch-up failed', log.call_args.args[0])

    def test_connection_failure_is_logged(self):
        self.assertTrue(callable(getattr(game_archive, '_catch_up_in_background', None)))
        with patch.object(db, 'get_db', side_effect=RuntimeError('offline')), patch('builtins.print') as log:
            game_archive._catch_up_in_background()
            self.assertIn('offline', log.call_args.args[0])

class CatchUpThrottleTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.object(game_archive, 'auto_archive_enabled', True))
        self.enterContext(patch.object(game_archive, '_last_catch_up', 0, create=True))
        self.clock = self.enterContext(patch.object(game_archive, '_clock', return_value=3600, create=True))
        self.submit = self.enterContext(patch.object(game_archive._executor, 'submit'))

    def test_hourly_throttle_from_live_feed(self):
        game_archive.archive_finished_games([])
        self.assertEqual(self.submit.call_count, 1)
        self.submit.assert_called_once_with(game_archive._catch_up_in_background, None)
        self.clock.return_value = 4200
        game_archive.archive_finished_games([])
        self.assertEqual(self.submit.call_count, 1)
        self.clock.return_value = 7201
        game_archive.archive_finished_games([])
        self.assertEqual(self.submit.call_count, 2)

    def test_disabled_feed_does_not_schedule(self):
        game_archive.auto_archive_enabled = False
        game_archive.archive_finished_games([])
        self.submit.assert_not_called()

    def test_forced_startup_counts_toward_throttle(self):
        self.assertTrue(callable(getattr(game_archive, 'schedule_catch_up', None)))
        self.clock.return_value = 10
        self.assertFalse(game_archive.schedule_catch_up())
        self.assertTrue(game_archive.schedule_catch_up(force=True, start=date(2026, 10, 1)))
        self.submit.assert_called_once_with(game_archive._catch_up_in_background, date(2026, 10, 1))
        self.clock.return_value = 3609
        self.assertFalse(game_archive.schedule_catch_up())
        self.clock.return_value = 3610
        self.assertTrue(game_archive.schedule_catch_up())


class DailyCatchUpTests(unittest.TestCase):
    def setUp(self):
        self.schedule = self.enterContext(patch.object(game_archive, 'schedule_catch_up'))

    def test_loop_queues_a_forced_catch_up_after_each_interval_until_stopped(self):
        stop = MagicMock()
        stop.wait.side_effect = [False, False, True]  # two intervals pass, then the stop flag is set
        game_archive._daily_catch_up_loop(stop, 86400)
        self.assertEqual(stop.wait.call_args_list, [unittest.mock.call(86400)] * 3)
        self.assertEqual(self.schedule.call_args_list, [unittest.mock.call(force=True)] * 2)

    def test_loop_survives_a_failed_schedule(self):
        stop = MagicMock()
        stop.wait.side_effect = [False, False, True]
        self.schedule.side_effect = [RuntimeError('executor shut down'), True]
        game_archive._daily_catch_up_loop(stop, 10)
        self.assertEqual(self.schedule.call_count, 2)

    def test_daily_interval_is_24_hours(self):
        self.assertEqual(game_archive.DAILY_CATCH_UP_INTERVAL, 24 * 3600)

    def test_start_runs_one_daemon_thread_per_process(self):
        self.enterContext(patch.object(game_archive, '_daily_thread', None))
        with patch.object(game_archive.threading, 'Thread') as thread_class:
            thread_class.return_value.is_alive.return_value = True
            self.assertTrue(game_archive.start_daily_catch_up())
            self.assertFalse(game_archive.start_daily_catch_up(), 'a running timer is not started twice')
        thread_class.assert_called_once()
        self.assertTrue(thread_class.call_args.kwargs['daemon'])
        self.assertEqual(thread_class.call_args.kwargs['args'][1], game_archive.DAILY_CATCH_UP_INTERVAL)
        thread_class.return_value.start.assert_called_once_with()


class CurrentSeasonStateTests(unittest.TestCase):
    def setUp(self):
        self.old = [{'PLAYER_ID': 1}]
        self.enterContext(patch.object(state, 'current_season_data', self.old, create=True))
        self.enterContext(patch.object(state, 'current_season_year', 2026, create=True))
        self.enterContext(patch.dict(os.environ, {'DATABASE_URL': 'postgresql://test.invalid/test'}))
        self.connect = self.enterContext(patch.object(db, 'get_db'))
        self.enterContext(patch.object(game_archive, 'current_season_year', return_value=2027))

    def load(self, *args):
        self.assertTrue(callable(getattr(state, 'load_current_season', None)))
        return state.load_current_season(*args)

    def test_no_database_never_connects(self):
        os.environ.pop('DATABASE_URL')
        self.assertEqual(self.load(), 0)
        self.connect.assert_not_called()

    def test_atomic_refresh_with_owned_or_borrowed_connection(self):
        for borrowed in (False, True):
            with self.subTest(borrowed=borrowed):
                state.current_season_data = self.old
                conn = MagicMock()
                self.connect.reset_mock()
                self.connect.return_value = conn
                new = [{'PLAYER_ID': 2}]
                def read(connection, year):
                    self.assertIs(state.current_season_data, self.old)
                    self.assertEqual((connection, year), (conn, 2027))
                    return new
                with patch.object(game_archive, 'season_player_averages', side_effect=read):
                    self.assertEqual(self.load(*([conn] if borrowed else [])), 1)
                self.assertIs(state.current_season_data, new)
                self.assertEqual(self.old, [{'PLAYER_ID': 1}])
                self.assertEqual(state.current_season_year, 2027)
                if borrowed:
                    self.connect.assert_not_called()
                    conn.close.assert_not_called()
                else:
                    self.connect.assert_called_once_with()
                    conn.close.assert_called_once_with()

    def test_empty_archive_replaces_previous_list(self):
        with patch.object(game_archive, 'season_player_averages', return_value=[]):
            self.assertEqual(self.load(), 0)
        self.assertEqual(state.current_season_data, [])

    def test_query_failure_keeps_previous_data_and_closes_owned_connection(self):
        with patch.object(game_archive, 'season_player_averages', side_effect=RuntimeError('query failed')):
            self.assertEqual(self.load(), 0)
        self.assertIs(state.current_season_data, self.old)
        self.assertEqual(state.current_season_year, 2026)
        self.connect.return_value.close.assert_called_once_with()

    def test_connection_failure_keeps_previous_data(self):
        self.connect.side_effect = RuntimeError('offline')
        self.assertEqual(self.load(), 0)
        self.assertIs(state.current_season_data, self.old)

    def test_initialize_loads_after_ids_and_teams_then_schedules_only_with_db(self):
        self.assertTrue(callable(getattr(state, 'load_current_season', None)))
        self.enterContext(patch.object(state, 'ai_available', False))
        self.enterContext(patch.object(game_archive, 'auto_archive_enabled', False))
        events = []
        for name in ('load_nba_data', 'load_multi_season_data', 'assign_player_ids', 'load_ai',
                     'apply_archive_teams', 'load_current_season'):
            self.enterContext(patch.object(state, name, side_effect=lambda n=name: events.append(n)))
        self.enterContext(patch.object(db, 'init_db', side_effect=lambda: events.append('init_db')))
        schedule = self.enterContext(patch.object(game_archive, 'schedule_catch_up'))
        daily = self.enterContext(patch.object(game_archive, 'start_daily_catch_up', create=True))
        state.initialize()
        self.assertLess(events.index('assign_player_ids'), events.index('load_current_season'))
        self.assertLess(events.index('init_db'), events.index('load_current_season'))
        self.assertLess(events.index('apply_archive_teams'), events.index('load_current_season'))
        schedule.assert_called_once_with(force=True, start=None)
        daily.assert_called_once_with()
        self.assertTrue(game_archive.auto_archive_enabled)
        os.environ.pop('DATABASE_URL')
        schedule.reset_mock()
        daily.reset_mock()
        state.initialize()
        schedule.assert_not_called()
        daily.assert_not_called()
        self.assertFalse(game_archive.auto_archive_enabled)


SO_FAR_ROW_KEYS = tuple(f'so_far_{key}' for key in (
    'ppg', 'apg', 'rpg', 'spg', 'bpg', 'tov', 'mpg', 'fg_pct', 'fg3_pct', 'ft_pct', 'gp'))


def season_player(**changes):
    return {
        'PLAYER_ID': 1, 'PLAYER_NAME': 'Test Player', 'TEAM': 'LAL', 'POSITION': 'F', 'AGE': 30,
        'PPG_LAST': 20.0, 'APG_LAST': 6.0, 'RPG_LAST': 5.0, 'SPG_LAST': 1.0,
        'BPG_LAST': 0.5, 'TOV_LAST': 2.0, 'MIN_LAST': 30.0,
        'FG_PCT_LAST': 0.5, 'FG3_PCT_LAST': 0.3, 'FT_PCT_LAST': 0.8, 'GAMES_PLAYED_LAST': 70,
        **changes,
    }


class BackfillStartTests(unittest.TestCase):
    def test_reads_an_iso_date_and_ignores_blank_or_invalid_values(self):
        for value, expected in (('2026-10-01', date(2026, 10, 1)), (' 2026-10-01 ', date(2026, 10, 1)),
                                ('', None), ('next week', None), ('10/01/2026', None)):
            with self.subTest(value=value), patch.dict(os.environ, {'ARCHIVE_BACKFILL_START': value}), \
                 patch('builtins.print') as log:
                self.assertEqual(state.backfill_start(), expected)
                self.assertEqual(log.called, expected is None and bool(value.strip()))
        with patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(state.backfill_start())

    def test_initialize_hands_the_backfill_start_to_the_startup_catch_up(self):
        events = []
        for name in ('load_nba_data', 'load_multi_season_data', 'assign_player_ids', 'load_ai',
                     'apply_archive_teams', 'load_current_season'):
            self.enterContext(patch.object(state, name))
        self.enterContext(patch.object(db, 'init_db'))
        self.enterContext(patch.object(state, 'ai_available', False))
        self.enterContext(patch.object(game_archive, 'auto_archive_enabled', False))
        self.enterContext(patch.object(game_archive, 'start_daily_catch_up'))
        schedule = self.enterContext(patch.object(game_archive, 'schedule_catch_up'))
        self.enterContext(patch.dict(os.environ, {'DATABASE_URL': 'postgresql://test.invalid/test',
                                                  'ARCHIVE_BACKFILL_START': '2026-10-01'}))
        state.initialize()
        schedule.assert_called_once_with(force=True, start=date(2026, 10, 1))


class SeasonRouteTestCase(unittest.TestCase):
    def setUp(self):
        self.pickle = season_player()
        self.current = season_player(TEAM='DAL', PPG_LAST=24.14, RPG_LAST=7.24, APG_LAST=8.04,
                                     TOV_LAST=3.1, MIN_LAST=32.5, GAMES_PLAYED_LAST=4)
        for name, value in (
            ('nba_data', [self.pickle]), ('nba_name_index', {'test player': self.pickle}),
            ('multi_season_data', {2026: [self.pickle]}),
            ('multi_season_name_indexes', {2026: {'test player': self.pickle}}),
            ('current_season_data', [self.current]), ('current_season_year', 2027),
            ('ai_available', False), ('is_render', False), ('predictions_cache', None),
        ):
            self.enterContext(patch.object(state, name, value))
        self.client = create_app(load_data=False).test_client()

    def get_json(self, url):
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200, response.get_json())
        return response.get_json()


class PlayersRouteTests(SeasonRouteTestCase):
    def test_default_and_explicit_current_year_serve_archive(self):
        for query in ('', '?year=2027'):
            with self.subTest(query=query):
                players = self.get_json('/api/players' + query)['players']
                self.assertEqual(len(players), 1)
                self.assertEqual(players[0]['stats']['ppg_last'], 24.1)
                self.assertEqual(players[0]['team'], 'DAL')

    def test_old_year_and_invalid_year_keep_pickle_behavior(self):
        for query in ('?year=2026', '?year=invalid', '?year=2000'):
            with self.subTest(query=query):
                player = self.get_json('/api/players' + query)['players'][0]
                self.assertEqual(player['stats']['ppg_last'], 20.0)
                self.assertEqual(player['team'], 'LAL')

    def test_empty_current_season_falls_back(self):
        state.current_season_data = []
        for query in ('', '?year=2027'):
            self.assertEqual(self.get_json('/api/players' + query)['players'][0]['stats']['ppg_last'], 20.0)

    def test_current_season_without_multi_season_pickle(self):
        state.multi_season_data = None
        self.assertEqual(self.get_json('/api/players?year=2027')['players'][0]['stats']['ppg_last'], 24.1)

    def test_filter_and_pagination_apply_to_archive(self):
        self.assertEqual(self.get_json('/api/players?team=LAL')['players'], [])
        result = self.get_json('/api/players?team=DAL&position=F&search=Test&limit=1&page=2')
        self.assertEqual(result['players'], [])
        self.assertEqual(result['pagination']['total'], 1)

    def test_teams_positions_and_missing_pickle_behavior_unchanged(self):
        self.assertEqual(self.get_json('/api/teams'), {'teams': ['LAL']})
        self.assertEqual(self.get_json('/api/positions'), {'positions': ['F']})
        state.nba_data = None
        self.assertEqual(self.client.get('/api/players').status_code, 500)


class SearchAllTests(SeasonRouteTestCase):
    def test_current_history_added_without_changing_pickle_history(self):
        player = self.get_json('/api/players/search-all?query=Test')['players'][0]
        self.assertEqual(player['history']['2026'], _season_line(self.pickle))
        self.assertNotIn('in_progress', player['history']['2026'])
        self.assertEqual(player['history'].get('2027'), {
            'in_progress': True, 'ppg': 24.1, 'rpg': 7.2, 'apg': 8.0, 'spg': 1.0, 'bpg': 0.5,
            'fg_pct': 50.0, 'fg3_pct': 30.0, 'ft_pct': 80.0, 'games_played': 4, 'minutes': 32.5,
        })
        self.assertEqual(player['current_stats']['ppg'], 24.1)
        self.assertEqual(player['current_stats']['tov'], 3.1)
        self.assertEqual(player['current_stats']['mpg'], 32.5)

    def test_missing_current_player_and_empty_archive_keep_pickle_stats(self):
        for data in ([], [season_player(PLAYER_ID=99)]):
            with self.subTest(data=data):
                state.current_season_data = data
                player = self.get_json('/api/players/search-all?query=Test')['players'][0]
                self.assertEqual(player['history'], {'2026': _season_line(self.pickle)})
                self.assertEqual(player['current_stats']['ppg'], 20.0)
                self.assertEqual(player['current_stats']['tov'], 2.0)
                self.assertEqual(player['current_stats']['mpg'], 30.0)


    def test_ml_stats_carry_the_current_season_line_to_compare_against(self):
        prediction = {
            'current_stats': {'ppg': 20.0, 'apg': 5.0},
            'predicted_stats': {'ppg': 22.0, 'apg': 5.5},
            'improvements': {'ppg': 10.0, 'apg': 10.0},
        }
        state.ai_available = True
        state.predictions_cache = {'players': {'test player': prediction}}
        player = self.get_json('/api/players/search-all?query=Test')['players'][0]
        self.assertEqual(player['current_stats']['ppg'], 24.1)
        self.assertEqual(player['ml_stats'], {
            'so_far_stats': {'ppg': 24.1, 'apg': 8.0, 'rpg': 7.2, 'spg': 1.0, 'bpg': 0.5,
                             'tov': 3.1, 'mpg': 32.5, 'fg_pct': 50.0, 'fg3_pct': 30.0,
                             'ft_pct': 80.0, 'gp': 4},
            'predicted_stats': prediction['predicted_stats'],
            'improvements': prediction['improvements'],
        })
        state.current_season_data = []
        player = self.get_json('/api/players/search-all?query=Test')['players'][0]
        self.assertIsNone(player['ml_stats']['so_far_stats'])


class ArchiveOnlySearchTests(SeasonRouteTestCase):
    def setUp(self):
        super().setUp()
        self.rookie = season_player(
            PLAYER_ID=1642000, PLAYER_NAME='AJ Dybantsa', TEAM='WAS', POSITION='F', AGE=0,
            PPG_LAST=18.26, TOV_LAST=2.44, MIN_LAST=31.0, GAMES_PLAYED_LAST=3,
        )
        state.current_season_data = [self.current, self.rookie]

    def test_archive_only_rookie_returned_with_current_stats_and_in_progress_history(self):
        players = self.get_json('/api/players/search-all?query=Dybantsa')['players']
        self.assertEqual(len(players), 1)
        player = players[0]
        self.assertEqual(player['id'], 1642000)
        self.assertEqual(player['name'], 'AJ Dybantsa')
        self.assertEqual(player['team'], 'WAS')
        self.assertEqual(player['position'], 'F')
        self.assertEqual(player['age'], 0)
        self.assertEqual(player['current_stats'], {
            'ppg': 18.3, 'apg': 6.0, 'rpg': 5.0, 'spg': 1.0, 'bpg': 0.5,
            'tov': 2.4, 'mpg': 31.0, 'fg_pct': 50.0, 'fg3_pct': 30.0,
            'ft_pct': 80.0, 'games_played': 3, 'minutes': 31.0,
        })
        self.assertEqual(player['history'], {
            '2027': {**_season_line(self.rookie), 'in_progress': True},
        })
        self.assertIsNone(player['ml_stats'])

    def test_archive_only_rookie_without_bio_returns_null_age(self):
        self.rookie['AGE'] = None
        player = self.get_json('/api/players/search-all?query=Dybantsa')['players'][0]
        self.assertIsNone(player['age'])

    def test_players_list_sorted_by_age_handles_null_age(self):
        self.rookie['AGE'] = None
        response = self.client.get('/api/players', query_string={'sort_by': 'age'})
        self.assertEqual(response.status_code, 200)

    def test_pkl_player_result_unchanged(self):
        players = self.get_json('/api/players/search-all?query=Test')['players']
        self.assertEqual(len(players), 1)
        original = players[0]
        self.assertEqual(original['team'], 'LAL')
        self.assertEqual(original['history'], {
            '2026': _season_line(self.pickle),
            '2027': {**_season_line(self.current), 'in_progress': True},
        })
        self.rookie['PLAYER_NAME'] = 'Test Rookie'
        for archive_name in ('Test Player', 'Tést Player Jr.'):
            with self.subTest(archive_name=archive_name):
                self.current['PLAYER_NAME'] = archive_name
                players = self.get_json('/api/players/search-all?query=Test')['players']
                self.assertEqual([p['name'] for p in players], ['Test Player', 'Test Rookie'])
                self.assertEqual(players[0], original)

    def test_normalized_name_matching_for_archive_only_player(self):
        self.rookie['PLAYER_NAME'] = 'Égor Dëmin-Jr.'
        for query in ('egor demin', 'Demin'):
            with self.subTest(query=query):
                response = self.client.get('/api/players/search-all', query_string={'query': query})
                self.assertEqual(response.status_code, 200)
                players = response.get_json()['players']
                self.assertEqual(len(players), 1)
                self.assertEqual(players[0]['id'], 1642000)
                self.assertEqual(players[0]['name'], 'Égor Dëmin-Jr.')
        for query in ('No Match', ''):
            self.assertEqual(self.get_json('/api/players/search-all?query=' + query)['players'], [])

    def test_archive_only_ml_stats_only_from_cache(self):
        prediction = {
            'predicted_stats': {'ppg': 22.0, 'apg': 5.5},
            'improvements': {'ppg': 10.0, 'apg': 10.0},
        }
        state.ai_available = True
        for cache in ({'players': {'aj dybantsa': prediction}}, None, {'players': {}}):
            with self.subTest(cache=cache), patch.object(state, 'ai') as ai:
                state.predictions_cache = cache
                players = self.get_json('/api/players/search-all?query=Dybantsa')['players']
                self.assertEqual(len(players), 1)
                ml_stats = players[0]['ml_stats']
                if cache and cache['players']:
                    self.assertEqual(ml_stats['predicted_stats'], prediction['predicted_stats'])
                    self.assertEqual(ml_stats['improvements'], prediction['improvements'])
                    self.assertEqual(ml_stats['so_far_stats']['ppg'], 18.3)
                else:
                    self.assertIsNone(ml_stats)
                ai.get_player_prediction.assert_not_called()
        with patch.object(state, 'get_cached_player_prediction', side_effect=RuntimeError('cache failed')):
            players = self.get_json('/api/players/search-all?query=Dybantsa')['players']
            self.assertEqual(len(players), 1)
            player = players[0]
            self.assertIsNone(player['ml_stats'])
            self.assertEqual(player['current_stats']['ppg'], 18.3)

    def test_result_cap_applies_to_archive_matches(self):
        self.pickle['PLAYER_NAME'] = 'Rookie 05 Veteran'
        state.nba_name_index = {'rookie 05 veteran': self.pickle}
        state.multi_season_name_indexes = {2026: state.nba_name_index}
        state.current_season_data = [
            season_player(PLAYER_ID=1642000 + i, PLAYER_NAME=f'Rookie {i:02d}')
            for i in reversed(range(20))
        ]
        players = self.get_json('/api/players/search-all?query=Rookie')['players']
        self.assertEqual(len(players), 15)
        expected = [f'Rookie {i:02d}' for i in range(14)]
        expected.insert(6, 'Rookie 05 Veteran')
        self.assertEqual([p['name'] for p in players], expected)


class SearchAllSnapshotTests(SeasonRouteTestCase):
    def test_full_output_unchanged(self):
        state.current_season_data.append(season_player(
            PLAYER_ID=1642000, PLAYER_NAME='AJ Dybantsa', TEAM='WAS', AGE=None,
            PPG_LAST=18.26, TOV_LAST=2.44, MIN_LAST=31.0, GAMES_PLAYED_LAST=3,
        ))
        state.ai_available = True
        state.predictions_cache = {'players': {'test player': {
            'predicted_stats': {'ppg': 22.0}, 'improvements': {'ppg': 10.0},
        }}}
        expected = {'players': [{
            'id': 1642000, 'name': 'AJ Dybantsa', 'team': 'WAS', 'position': 'F', 'age': None,
            'current_stats': {
                'ppg': 18.3, 'apg': 6.0, 'rpg': 5.0, 'spg': 1.0, 'bpg': 0.5,
                'tov': 2.4, 'mpg': 31.0, 'fg_pct': 50.0, 'fg3_pct': 30.0,
                'ft_pct': 80.0, 'games_played': 3, 'minutes': 31.0,
            },
            'ml_stats': None,
            'history': {'2027': {
                'ppg': 18.3, 'apg': 6.0, 'rpg': 5.0, 'spg': 1.0, 'bpg': 0.5,
                'fg_pct': 50.0, 'fg3_pct': 30.0, 'ft_pct': 80.0,
                'games_played': 3, 'minutes': 31.0, 'in_progress': True,
            }},
        }, {
            'id': 1, 'name': 'Test Player', 'team': 'LAL', 'position': 'F', 'age': 30,
            'current_stats': {
                'ppg': 24.1, 'apg': 8.0, 'rpg': 7.2, 'spg': 1.0, 'bpg': 0.5,
                'tov': 3.1, 'mpg': 32.5, 'fg_pct': 50.0, 'fg3_pct': 30.0,
                'ft_pct': 80.0, 'games_played': 4, 'minutes': 32.5,
            },
            'ml_stats': {
                'so_far_stats': {
                    'ppg': 24.1, 'apg': 8.0, 'rpg': 7.2, 'spg': 1.0, 'bpg': 0.5,
                    'tov': 3.1, 'mpg': 32.5, 'fg_pct': 50.0, 'fg3_pct': 30.0,
                    'ft_pct': 80.0, 'gp': 4,
                },
                'predicted_stats': {'ppg': 22.0}, 'improvements': {'ppg': 10.0},
            },
            'history': {
                '2026': {
                    'ppg': 20.0, 'apg': 6.0, 'rpg': 5.0, 'spg': 1.0, 'bpg': 0.5,
                    'fg_pct': 50.0, 'fg3_pct': 30.0, 'ft_pct': 80.0,
                    'games_played': 70, 'minutes': 30.0,
                },
                '2027': {
                    'ppg': 24.1, 'apg': 8.0, 'rpg': 7.2, 'spg': 1.0, 'bpg': 0.5,
                    'fg_pct': 50.0, 'fg3_pct': 30.0, 'ft_pct': 80.0,
                    'games_played': 4, 'minutes': 32.5, 'in_progress': True,
                },
            },
        }]}
        response = self.client.get('/api/players/search-all?query=t')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), expected)
        self.assertEqual(response.data, (json.dumps(
            expected, sort_keys=True, separators=(',', ':')) + '\n').encode())


class PlayerByIdTests(SeasonRouteTestCase):
    def test_pickle_player_returns_search_all_object_with_history(self):
        player = self.get_json('/api/players/1')
        self.assertEqual(player, self.get_json('/api/players/search-all?query=Test')['players'][0])
        self.assertEqual(player['history']['2026'], {
            'ppg': 20.0, 'apg': 6.0, 'rpg': 5.0, 'spg': 1.0, 'bpg': 0.5,
            'fg_pct': 50.0, 'fg3_pct': 30.0, 'ft_pct': 80.0,
            'games_played': 70, 'minutes': 30.0,
        })
        self.assertTrue(player['history']['2027']['in_progress'])
        self.assertEqual(player['current_stats']['ppg'], 24.1)
        self.assertEqual(player['team'], 'LAL')

    def test_older_season_lookup_prefers_newest_then_nba_data(self):
        older = season_player(PLAYER_ID=7, PLAYER_NAME='Older Player', TEAM='BOS')
        newer = {**older, 'TEAM': 'NYK'}
        state.multi_season_data = {2024: [older], 2025: [newer]}
        state.multi_season_name_indexes = {2024: {'older player': older}, 2025: {'older player': newer}}
        player = self.get_json('/api/players/7')
        self.assertEqual(player['id'], 7)
        self.assertEqual(player['team'], 'NYK')
        self.assertEqual(set(player['history']), {'2024', '2025'})
        self.assertEqual(player, self.get_json('/api/players/search-all?query=Older')['players'][0])
        state.nba_data.append({**newer, 'TEAM': 'LAL'})
        self.assertEqual(self.get_json('/api/players/7')['team'], 'LAL')

    def test_archive_only_rookie_resolves_with_cache_only_predictions(self):
        rookie = season_player(PLAYER_ID=1642000, PLAYER_NAME='AJ Dybantsa', TEAM='WAS', AGE=None)
        state.current_season_data.append(rookie)
        state.multi_season_data = None
        state.multi_season_name_indexes = {}
        state.ai_available = True
        prediction = {'predicted_stats': {'ppg': 22.0}, 'improvements': {'ppg': 10.0}}
        for cache in (None, {'players': {}}, {'players': {'aj dybantsa': prediction}}):
            with self.subTest(cache=cache), patch.object(state, 'ai') as ai:
                state.predictions_cache = cache
                player = self.get_json('/api/players/1642000')
                self.assertEqual(player, self.get_json('/api/players/search-all?query=Dybantsa')['players'][0])
                self.assertEqual(player['team'], 'WAS')
                self.assertIsNone(player['age'])
                self.assertEqual(player['history'], {'2027': {
                    'ppg': 20.0, 'apg': 6.0, 'rpg': 5.0, 'spg': 1.0, 'bpg': 0.5,
                    'fg_pct': 50.0, 'fg3_pct': 30.0, 'ft_pct': 80.0,
                    'games_played': 70, 'minutes': 30.0, 'in_progress': True,
                }})
                if cache and cache['players']:
                    self.assertEqual(player['ml_stats']['predicted_stats'], {'ppg': 22.0})
                    self.assertEqual(player['ml_stats']['so_far_stats']['ppg'], 20.0)
                else:
                    self.assertIsNone(player['ml_stats'])
                ai.get_player_prediction.assert_not_called()

    def test_live_predictions_without_archive_and_prediction_failure(self):
        state.current_season_data = []
        state.ai_available = True
        with patch.object(state, 'ai') as ai:
            ai.get_player_prediction.return_value = {
                'predicted_stats': {'ppg': 22.0}, 'improvements': {'ppg': 10.0},
            }
            player = self.get_json('/api/players/1')
            self.assertEqual(player.get('ml_stats'), {
                'so_far_stats': None, 'predicted_stats': {'ppg': 22.0},
                'improvements': {'ppg': 10.0},
            })
            ai.get_player_prediction.assert_called_once_with('Test Player')
            self.assertEqual(player['current_stats']['ppg'], 20.0)
            ai.get_player_prediction.side_effect = RuntimeError('prediction failed')
            player = self.get_json('/api/players/1')
            self.assertIsNone(player['ml_stats'])
            self.assertEqual(player['current_stats']['ppg'], 20.0)

    def test_unknown_id_returns_404(self):
        response = self.client.get('/api/players/999999')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json(), {'error': 'Player not found'})

    def test_invalid_ids_return_400(self):
        for player_id in (0, 1000000000):
            with self.subTest(player_id=player_id):
                response = self.client.get(f'/api/players/{player_id}')
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.get_json(), {'error': 'Invalid player ID'})

    def test_missing_data_returns_500(self):
        state.nba_data = None
        response = self.client.get('/api/players/1')
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.get_json(), {'error': 'NBA data not loaded'})


class RemovedSearchRouteTests(SeasonRouteTestCase):
    def test_search_by_name_route_removed(self):
        response = self.client.get('/api/players/search/Test')
        self.assertEqual(response.status_code, 404)
        self.assertIsNone(response.get_json(silent=True))
        self.assertNotIn('players.search_player', self.client.application.view_functions)


class PredictionsSoFarTests(SeasonRouteTestCase):
    def setUp(self):
        super().setUp()
        state.ai_available = True
        state.is_render = True
        self.rows = [
            {'id': 1, 'name': 'Test Player', 'team': 'LAL', 'position': 'F',
             'ppg_last': 20.0, 'predicted_ppg': 23.0, 'custom': 'preserved'},
            {'id': 2, 'name': 'Without Games', 'team': 'BOS', 'position': 'G',
             'ppg_last': 15.0, 'predicted_ppg': 18.0},
        ]
        self.named_rows = [
            {'PLAYER_NAME': 'Tést Player', 'PPG_LAST': 20.0, 'PREDICTED_PPG': 23.0, 'PPG_IMPROVEMENT': 15.0},
            {'PLAYER_NAME': 'Without Games', 'PPG_LAST': 15.0, 'PREDICTED_PPG': 18.0},
        ]
        state.predictions_cache = {
            'all_players_list': deepcopy(self.rows),
            'bundle': {'top_scorers': deepcopy(self.named_rows), 'top_assists': deepcopy(self.named_rows)},
            'recommendations': {'PPG': deepcopy(self.named_rows)},
        }
        self.cache_before = deepcopy(state.predictions_cache)

    def assert_enriched(self, rows, originals):
        self.assertEqual(len(rows), 2)
        expected = [
            {'so_far_ppg': 24.1, 'so_far_apg': 8.0, 'so_far_rpg': 7.2, 'so_far_spg': 1.0,
             'so_far_bpg': 0.5, 'so_far_tov': 3.1, 'so_far_mpg': 32.5, 'so_far_fg_pct': 50.0,
             'so_far_fg3_pct': 30.0, 'so_far_ft_pct': 80.0, 'so_far_gp': 4},
            {key: None for key in SO_FAR_ROW_KEYS},
        ]
        self.assertEqual(rows, [{**original, **extra} for original, extra in zip(originals, expected)])
        self.assertEqual(state.predictions_cache, self.cache_before)

    def test_paginated_cache_enriches_without_mutation(self):
        self.assert_enriched(self.get_json('/api/predictions')['predictions'], self.rows)

    def test_refresh_is_visible_on_next_request(self):
        first = self.get_json('/api/predictions?limit=1')['predictions'][0]
        self.assertEqual(first.get('so_far_ppg'), 24.1)
        state.current_season_data = [season_player(PPG_LAST=30, GAMES_PLAYED_LAST=5)]
        second = self.get_json('/api/predictions?limit=1')['predictions'][0]
        self.assertEqual(second['so_far_ppg'], 30.0)
        self.assertEqual(second['so_far_gp'], 5)
        self.assertEqual(state.predictions_cache, self.cache_before)

    def test_id_match_precedes_name_and_missing_id_falls_back_to_name(self):
        state.predictions_cache['all_players_list'][0]['name'] = 'Renamed Player'
        rows = self.get_json('/api/predictions')['predictions']
        self.assertEqual(rows[0].get('so_far_ppg'), 24.1)
        state.predictions_cache['all_players_list'][0] = {**self.rows[0], 'id': 999}
        rows = self.get_json('/api/predictions')['predictions']
        self.assertEqual(rows[0].get('so_far_ppg'), 24.1)

    def test_ai_bundle_cache_matches_normalized_player_name(self):
        bundle = self.get_json('/api/ai-predictions')['predictions']
        for rows in bundle.values():
            self.assert_enriched(rows, self.named_rows)

    def test_recommendations_cache_and_service_paths(self):
        self.assert_enriched(self.get_json('/api/recommendations/PPG'), self.named_rows)
        state.is_render = False
        with patch('app.api.routes.predictions.get_top_performers', return_value=self.named_rows) as service:
            self.assert_enriched(self.get_json('/api/recommendations/PPG'), self.named_rows)
            service.assert_called_once_with('PPG')
        self.assertNotIn('so_far_ppg', self.named_rows[0])

    def test_model_predictions_and_bundle_paths(self):
        state.is_render = False
        with patch('app.api.routes.predictions._prediction_rows_from_model', return_value=self.rows):
            self.assert_enriched(self.get_json('/api/predictions')['predictions'], self.rows)
        with patch.object(state, 'ai') as ai:
            ai.get_ai_predictions_bundle.return_value = {'top_scorers': self.named_rows}
            self.assert_enriched(self.get_json('/api/ai-predictions')['predictions']['top_scorers'], self.named_rows)
            ai.get_ai_predictions_bundle.assert_called_once_with(10)
        self.assertNotIn('so_far_ppg', self.rows[0])
        self.assertNotIn('so_far_ppg', self.named_rows[0])

    def test_no_current_games_gives_nulls_on_all_routes(self):
        state.current_season_data = []
        groups = [self.get_json('/api/predictions')['predictions'],
                  self.get_json('/api/ai-predictions')['predictions']['top_scorers'],
                  self.get_json('/api/recommendations/PPG')]
        for rows in groups:
            for row in rows:
                for key in SO_FAR_ROW_KEYS:
                    self.assertIn(key, row)
                    self.assertIsNone(row[key])
        self.assertEqual(state.predictions_cache, self.cache_before)
