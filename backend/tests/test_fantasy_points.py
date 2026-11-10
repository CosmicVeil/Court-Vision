import unittest
from copy import deepcopy
from unittest.mock import Mock, patch

import numpy as np
import pandas as pd

from app import state
from app.api.helpers import so_far_stats
from app.api.routes.predictions import _prediction_rows_from_model
from app.ml.nba_ai_system import FEATURE_COLUMNS, NBAAISystem
from app.services import live_games, recommendations
from app.utils.fantasy import PER_GAME_KEYS, fantasy_points
from tests.test_current_season import SeasonRouteTestCase, season_player
from tests.test_nba_ai_model import make_player


class FantasyPointsTests(unittest.TestCase):
    def test_fanduel_weights(self):
        # 25 + 1.2*10 + 1.5*5 + 3*2 + 3*1 - 3 = 50.5
        stats = {'pts': 25, 'reb': 10, 'ast': 5, 'stl': 2, 'blk': 1, 'tov': 3}
        self.assertEqual(fantasy_points(stats), 50.5)

    def test_key_maps_onto_per_game_names(self):
        stats = {'ppg': 25, 'rpg': 10, 'apg': 5, 'spg': 2, 'bpg': 1, 'tov': 3}
        self.assertEqual(fantasy_points(stats, PER_GAME_KEYS.get), 50.5)

    def test_missing_and_none_values_count_as_zero(self):
        self.assertEqual(fantasy_points({}), 0)
        self.assertEqual(fantasy_points({'pts': 10, 'reb': None}), 10.0)

    def test_digits_none_skips_rounding(self):
        self.assertAlmostEqual(fantasy_points({'pts': 10.04, 'reb': 1.04}, digits=None), 11.288)


class UnroundedSourceTests(unittest.TestCase):
    """Every FPTS is scored from unrounded stats; rounding each stat first can drift ~0.5."""

    def test_so_far_stats_score_the_raw_averages(self):
        # Raw: 20.04 + 1.2*5.04 + 1.5*6.04 + 3*1.04 + 3*0.54 - 2 = 37.888 -> 37.9.
        # The rounded line (20.0, 5.0, 6.0, 1.0, 0.5, 2.0) would score 37.5.
        player = season_player(PPG_LAST=20.04, RPG_LAST=5.04, APG_LAST=6.04, SPG_LAST=1.04, BPG_LAST=0.54)
        stats = so_far_stats(player)
        self.assertEqual((stats['ppg'], stats['rpg'], stats['apg']), (20.0, 5.0, 6.0))
        self.assertEqual(stats['fantasy'], 37.9)

    def _system(self):
        system = NBAAISystem()
        system.model_trained = True
        system.data = {2025: [make_player('Test Player', ppg=10.04, apg=2.04, rpg=4.04, spg=1.04,
                                          bpg=0.54, tov=1.5, PLAYER_ID=1)]}
        system.scaler.fit(np.zeros((1, len(FEATURE_COLUMNS))))
        # Order of TARGET_SPECS: ppg, apg, rpg, spg, bpg, tov, mpg, fg%, 3p%, ft%.
        system.model = Mock()
        system.model.predict.return_value = np.array([[12.04, 3.04, 5.04, 1.04, 0.54, 2.0, 27, 0.48, 0.37, 0.82]])
        return system

    def test_predictions_frame_has_raw_fantasy_columns(self):
        system = self._system()
        row = system.build_predictions_df().iloc[0]
        # 10.04 + 1.2*4.04 + 1.5*2.04 + 3*1.04 + 3*0.54 - 1.5 = 21.188
        self.assertAlmostEqual(row['FANTASY_LAST'], 21.188)
        # 12.04 + 1.2*5.04 + 1.5*3.04 + 3*1.04 + 3*0.54 - 2 = 25.388
        self.assertAlmostEqual(row['PREDICTED_FANTASY'], 25.388)

    def test_predictions_frame_has_fantasy_improvement(self):
        row = self._system().build_predictions_df().iloc[0]
        self.assertAlmostEqual(row['FANTASY_IMPROVEMENT'], (25.388 - 21.188) / 21.188 * 100)

    def test_player_prediction_scores_raw_values(self):
        system = self._system()
        system.prepare_data = Mock(return_value=(np.zeros((1, len(FEATURE_COLUMNS))), None, None))
        system.predict = Mock(return_value=system.model.predict.return_value)
        payload = system.get_player_prediction('Test Player')
        self.assertEqual(payload['current_stats']['fantasy'], 21.2)
        self.assertEqual(payload['predicted_stats']['fantasy'], 25.4)
        self.assertEqual(payload['improvements']['fantasy'], round((25.388 - 21.188) / 21.188 * 100, 1))

    def test_model_rows_carry_rounded_fantasy_fields(self):
        frame = pd.DataFrame([{**make_player('Test Player'), 'FANTASY_LAST': 21.188, 'PREDICTED_FANTASY': 25.35,
                               **{f'PREDICTED_{key}': 1.0 for key in ('PPG', 'APG', 'RPG', 'SPG', 'BPG', 'TOV',
                                                                       'MPG', 'FG_PCT', 'FG3_PCT', 'FT_PCT')}}])
        with patch.object(state, 'ai') as ai:
            ai.nba_ai_system.build_predictions_df.return_value = frame
            row = _prediction_rows_from_model()[0]
        self.assertEqual((row['fantasy_last'], row['predicted_fantasy']), (21.2, 25.4))


class UpcomingRosterFantasyTests(unittest.TestCase):
    def test_upcoming_roster_carries_season_fpts_from_raw_averages(self):
        # 20.04 + 1.2*5.04 + 1.5*6.04 + 3*1 + 3*0.5 - 2 = 37.648 -> 37.6 (rounded stats would give 37.5).
        player = season_player(TEAM='LAL', PPG_LAST=20.04, RPG_LAST=5.04, APG_LAST=6.04)
        roster = live_games._roster_from_pkl('LAL', [player])
        self.assertEqual(roster[0]['season_ppg'], 20.0)
        self.assertEqual(roster[0]['season_fpts'], 37.6)


class LiveBoxScoreFantasyTests(unittest.TestCase):
    def _summary(self, *athletes):
        labels = ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'TO', 'STL', 'BLK', '+/-']
        return {'boxscore': {'players': [{
            'team': {'abbreviation': 'LAL'},
            'statistics': [{'labels': labels, 'athletes': list(athletes)}],
        }]}}

    def test_live_box_score_players_carry_game_fpts(self):
        # 25 + 1.2*10 + 1.5*5 + 3*2 + 3*1 - 3 = 50.5
        played = {'athlete': {'displayName': 'Test Player', 'id': '1'},
                  'stats': ['34', '25', '9-18', '2-5', '5-6', '10', '5', '3', '2', '1', '+8']}
        benched = {'athlete': {'displayName': 'Bench Player', 'id': '2'}, 'didNotPlay': True, 'stats': []}
        with patch.object(live_games, '_get', return_value=self._summary(played, benched)):
            box = live_games._fetch_boxscore('1', 'LAL', 'BOS')
        self.assertEqual([p['fpts'] for p in box['home']], [50.5, None])


class FantasyRecommendationTests(unittest.TestCase):
    def _frame(self):
        def row(name, last, predicted):
            return {'PLAYER_NAME': name, 'FANTASY_LAST': last, 'PREDICTED_FANTASY': predicted,
                    'FANTASY_IMPROVEMENT': (predicted - last) / last * 100}
        return pd.DataFrame([
            row('Small Base', 10.0, 15.0),   # +50%, but projected under 25 FPTS: filtered out
            row('Steady Star', 50.0, 52.0),  # +4%
            row('Riser', 30.0, 36.0),        # +20%
        ])

    def test_ranks_biggest_fantasy_jump_among_meaningful_projections(self):
        with patch.object(recommendations, '_build_predictions_df', return_value=self._frame()):
            ranked = recommendations.get_top_performers('FANTASY')
        self.assertEqual([player['PLAYER_NAME'] for player in ranked], ['Riser', 'Steady Star'])



class FantasyRecommendationRouteTests(SeasonRouteTestCase):
    def test_route_serves_fantasy_from_cache_and_model(self):
        state.ai_available = True
        state.is_render = True
        state.predictions_cache = {'recommendations': {'FANTASY': [{'PLAYER_NAME': 'Cached Riser'}]}}
        self.assertEqual(self.get_json('/api/recommendations/fantasy')[0]['PLAYER_NAME'], 'Cached Riser')
        state.is_render = False
        with patch('app.api.routes.predictions.get_top_performers', return_value=[{'PLAYER_NAME': 'Live Riser'}]) as getter:
            self.assertEqual(self.get_json('/api/recommendations/FANTASY')[0]['PLAYER_NAME'], 'Live Riser')
        getter.assert_called_once_with('FANTASY')


class FantasySortTests(SeasonRouteTestCase):
    def setUp(self):
        super().setUp()
        state.ai_available = True
        state.is_render = True
        # The scorer leads in points, the big man in fantasy points.
        rows = [
            {'id': 10, 'name': 'Pure Scorer', 'team': 'LAL', 'position': 'G',
             'predicted_ppg': 30.0, 'predicted_fantasy': 30.0},
            {'id': 11, 'name': 'Big Man', 'team': 'BOS', 'position': 'C',
             'predicted_ppg': 15.0, 'predicted_fantasy': 39.9},
            # A row from a cache written before fantasy points existed sorts as 0 instead of failing.
            {'id': 12, 'name': 'Old Cache Row', 'team': 'NYK', 'position': 'F', 'predicted_ppg': 20.0},
        ]
        state.predictions_cache = {'all_players_list': rows}
        self.cache_before = deepcopy(state.predictions_cache)

    def test_sort_by_predicted_fantasy_ranks_before_paging(self):
        by_points = self.get_json('/api/predictions?sort_by=predicted_ppg&sort_order=desc&limit=1')
        self.assertEqual(by_points['predictions'][0]['name'], 'Pure Scorer')
        by_fantasy = self.get_json('/api/predictions?sort_by=predicted_fantasy&sort_order=desc')
        self.assertEqual([row['name'] for row in by_fantasy['predictions']],
                         ['Big Man', 'Pure Scorer', 'Old Cache Row'])
        self.assertEqual(state.predictions_cache, self.cache_before)


if __name__ == '__main__':
    unittest.main()
