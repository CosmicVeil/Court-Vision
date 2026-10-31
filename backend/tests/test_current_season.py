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
                self.assertEqual(row['AGE'], 0)
                self.assertNotIn('HEIGHT', row)
                self.assertNotIn('WEIGHT', row)
                for key in ('FG_PCT_LAST', 'FG3_PCT_LAST', 'FT_PCT_LAST'):
                    self.assertEqual(row[key], 0)

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

    def test_initialize_loads_after_ids_and_teams(self):
        self.assertTrue(callable(getattr(state, 'load_current_season', None)))
        self.enterContext(patch.object(state, 'ai_available', False))
        self.enterContext(patch.object(game_archive, 'auto_archive_enabled', False))
        events = []
        for name in ('load_nba_data', 'load_multi_season_data', 'assign_player_ids', 'load_ai',
                     'apply_archive_teams', 'load_current_season'):
            self.enterContext(patch.object(state, name, side_effect=lambda n=name: events.append(n)))
        self.enterContext(patch.object(db, 'init_db', side_effect=lambda: events.append('init_db')))
        state.initialize()
        self.assertLess(events.index('assign_player_ids'), events.index('load_current_season'))
        self.assertLess(events.index('init_db'), events.index('load_current_season'))
        self.assertLess(events.index('apply_archive_teams'), events.index('load_current_season'))
        self.assertTrue(game_archive.auto_archive_enabled)
        os.environ.pop('DATABASE_URL')
        state.initialize()
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
