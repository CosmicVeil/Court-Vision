"""Scoring presets, custom weights, the X-Fantasy-Scoring header and the profile endpoints."""
import unittest
from copy import deepcopy
from unittest.mock import MagicMock, patch

from app import db, state
from app.api.helpers import rescore_prediction, rescore_prediction_row
from app.api.routes import games as games_route
from app.utils.fantasy import (
    FANTASY_WEIGHTS, MAX_ABS_WEIGHT, SCORING_PRESETS, describe_setting, fantasy_points, normalize_setting,
    parse_scoring,
)
from tests.test_current_season import SeasonRouteTestCase, season_player

ESPN = SCORING_PRESETS['espn']['weights']
LINE = {'pts': 25, 'reb': 10, 'ast': 5, 'stl': 2, 'blk': 1, 'tov': 3}


class PresetTests(unittest.TestCase):
    def test_fanduel_is_the_default_preset(self):
        self.assertEqual(SCORING_PRESETS['fanduel']['weights'], FANTASY_WEIGHTS)
        self.assertEqual(parse_scoring(None), FANTASY_WEIGHTS)
        self.assertEqual(parse_scoring(''), FANTASY_WEIGHTS)

    def test_every_preset_weights_exactly_the_six_predicted_stats(self):
        for preset_id, preset in SCORING_PRESETS.items():
            with self.subTest(preset=preset_id):
                self.assertEqual(set(preset['weights']), set(FANTASY_WEIGHTS))

    def test_weights_change_the_score(self):
        # ESPN: 25 + 10 + 2*5 + 4*2 + 4*1 - 2*3 = 51; FanDuel scores the same line 50.5.
        self.assertEqual(fantasy_points(LINE, weights=ESPN), 51.0)
        self.assertEqual(fantasy_points(LINE), 50.5)

    def test_yahoo_high_score_is_its_own_approximate_preset(self):
        yahoo = SCORING_PRESETS['yahoo']
        self.assertEqual((yahoo['label'], yahoo['weights']['reb'], yahoo['weights']['ast']), ('Yahoo High Score', 1.0, 2.0))
        self.assertFalse(yahoo['exact'])

    def test_turnovers_can_be_free(self):
        self.assertEqual(fantasy_points({'tov': 10}, weights=parse_scoring('custom:tov=0')), 0)


class ParseScoringTests(unittest.TestCase):
    def test_preset_ids_are_case_insensitive(self):
        self.assertEqual(parse_scoring(' ESPN '), ESPN)

    def test_unknown_preset_falls_back_to_default(self):
        self.assertEqual(parse_scoring('sleeper'), FANTASY_WEIGHTS)

    def test_custom_overrides_named_stats_and_keeps_the_rest(self):
        weights = parse_scoring('custom:pts=5,tov=-2.5')
        self.assertEqual(weights, {**FANTASY_WEIGHTS, 'pts': 5.0, 'tov': -2.5})

    def test_custom_ignores_unknown_stats_and_bad_numbers(self):
        weights = parse_scoring('custom:fg3m=1,pts=abc,reb=nan,ast,blk=4')
        self.assertEqual(weights, {**FANTASY_WEIGHTS, 'blk': 4.0})

    def test_custom_weights_are_clamped(self):
        weights = parse_scoring('custom:pts=1e9,tov=-1e9')
        self.assertEqual((weights['pts'], weights['tov']), (MAX_ABS_WEIGHT, -MAX_ABS_WEIGHT))

    def test_returns_a_copy_never_the_shared_preset(self):
        parse_scoring('fanduel')['pts'] = 99
        self.assertEqual(FANTASY_WEIGHTS['pts'], 1.0)


class NormalizeSettingTests(unittest.TestCase):
    def test_preset_setting_drops_extra_keys(self):
        self.assertEqual(normalize_setting({'preset': 'espn', 'weights': {'pts': 9}}), {'preset': 'espn'})

    def test_custom_setting_fills_all_six_weights(self):
        setting = normalize_setting({'preset': 'custom', 'weights': {'pts': 5}})
        self.assertEqual(setting, {'preset': 'custom', 'weights': {**FANTASY_WEIGHTS, 'pts': 5.0}})

    def test_rejects_unusable_settings(self):
        for value in (None, 'espn', {}, {'preset': 'nope'}, {'preset': 'custom'},
                      {'preset': 'custom', 'weights': [1, 2]}):
            with self.subTest(value=value):
                self.assertIsNone(normalize_setting(value))


class DescribeSettingTests(unittest.TestCase):
    def test_preset_is_spelled_out_with_label_and_weights(self):
        self.assertEqual(describe_setting({'preset': 'espn'}), {'preset': 'espn', 'label': 'ESPN Points', 'weights': ESPN})

    def test_missing_setting_describes_the_default(self):
        self.assertEqual(describe_setting(None)['preset'], 'fanduel')


class RescoreTests(unittest.TestCase):
    def test_default_weights_return_the_row_untouched(self):
        row = {'predicted_fantasy': 30.0}
        self.assertIs(rescore_prediction_row(row, dict(FANTASY_WEIGHTS)), row)

    def test_api_row_is_rescored_as_a_copy(self):
        row = {'ppg_last': 20, 'rpg_last': 5, 'apg_last': 5, 'spg_last': 1, 'bpg_last': 1, 'tov_last': 2,
               'predicted_ppg': 25, 'predicted_rpg': 10, 'predicted_apg': 5, 'predicted_spg': 2,
               'predicted_bpg': 1, 'predicted_tov': 3, 'fantasy_last': 0, 'predicted_fantasy': 0}
        before = dict(row)
        rescored = rescore_prediction_row(row, ESPN)
        self.assertEqual(rescored['predicted_fantasy'], 51.0)
        self.assertEqual(rescored['fantasy_last'], 39.0)  # 20 + 5 + 10 + 4 + 4 - 4
        self.assertEqual(row, before)

    def test_cached_row_rescores_its_nested_detail_stats_too(self):
        # predictions_cache.json rows carry the flat list fields and the nested detail shape.
        line = {'ppg': 25, 'rpg': 10, 'apg': 5, 'spg': 2, 'bpg': 1, 'tov': 3}
        last = {'ppg': 20, 'rpg': 5, 'apg': 5, 'spg': 1, 'bpg': 1, 'tov': 2}
        row = {**{f'predicted_{k}': v for k, v in line.items()}, **{f'{k}_last': v for k, v in last.items()},
               'fantasy_last': 0, 'predicted_fantasy': 0,
               'current_stats': {**last, 'fantasy': 0}, 'predicted_stats': {**line, 'fantasy': 0},
               'improvements': {'ppg': 25.0, 'fantasy': 0}}
        rescored = rescore_prediction_row(row, ESPN)
        self.assertEqual(rescored['predicted_stats']['fantasy'], rescored['predicted_fantasy'])
        self.assertEqual(rescored['current_stats']['fantasy'], rescored['fantasy_last'])
        self.assertEqual(rescored['improvements'], {'ppg': 25.0, 'fantasy': 30.8})  # 51 vs 39
        self.assertEqual(row['predicted_stats']['fantasy'], 0)

    def test_model_row_gets_a_new_improvement(self):
        row = {'PPG_LAST': 10, 'PREDICTED_PPG': 15, 'FANTASY_LAST': 1, 'PREDICTED_FANTASY': 1,
               'FANTASY_IMPROVEMENT': 0}
        rescored = rescore_prediction_row(row, ESPN)
        self.assertEqual((rescored['FANTASY_LAST'], rescored['PREDICTED_FANTASY']), (10, 15))
        self.assertEqual(rescored['FANTASY_IMPROVEMENT'], 50.0)

    def test_prediction_payload_without_current_stats_keeps_its_improvements(self):
        payload = {'predicted_stats': {'ppg': 25, 'rpg': 10, 'apg': 5, 'spg': 2, 'bpg': 1, 'tov': 3,
                                       'fantasy': 50.5},
                   'improvements': {'fantasy': 7.0}}
        rescored = rescore_prediction(payload, ESPN)
        self.assertEqual(rescored['predicted_stats']['fantasy'], 51.0)
        self.assertEqual(rescored['improvements'], {'fantasy': 7.0})
        self.assertEqual(payload['predicted_stats']['fantasy'], 50.5)


class ScoringHeaderRouteTests(SeasonRouteTestCase):
    def setUp(self):
        super().setUp()
        # Two players: the guard scores more points, the big wins on ESPN's 4x stocks.
        guard = season_player(PLAYER_ID=1, PLAYER_NAME='Guard', PPG_LAST=28.0, RPG_LAST=4.0, APG_LAST=6.0,
                              SPG_LAST=1.0, BPG_LAST=0.2, TOV_LAST=3.5)
        big = season_player(PLAYER_ID=2, PLAYER_NAME='Big', PPG_LAST=20.0, RPG_LAST=11.0, APG_LAST=3.0,
                            SPG_LAST=1.5, BPG_LAST=2.5, TOV_LAST=1.5)
        self.enterContext(patch.object(state, 'current_season_data', [guard, big]))

    def get_scored(self, url, scoring=None):
        headers = {'Authorization': 'Bearer test'}
        if scoring:
            headers['X-Fantasy-Scoring'] = scoring
        response = self.client.get(url, headers=headers)
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertIn('X-Fantasy-Scoring', response.headers.get('Vary', ''))
        return response.get_json()

    def test_players_rank_league_wide_by_actual_fantasy_under_the_preset(self):
        # FanDuel: guard 28+4.8+9+3+0.6-3.5 = 41.9, big 20+13.2+4.5+4.5+7.5-1.5 = 48.2.
        fanduel = self.get_scored('/api/players?sort_by=fantasy&sort_order=desc')['players']
        self.assertEqual([(p['name'], p['stats']['fantasy_last']) for p in fanduel],
                         [('Big', 48.2), ('Guard', 41.9)])
        # Custom: points worth 5 each flips the order (guard 153.9, big 128.2).
        custom = self.get_scored('/api/players?sort_by=fantasy&sort_order=desc', 'custom:pts=5')['players']
        self.assertEqual([(p['name'], p['stats']['fantasy_last']) for p in custom],
                         [('Guard', 153.9), ('Big', 128.2)])

    def test_predictions_sort_by_rescored_fantasy_without_touching_the_cache(self):
        state.ai_available, state.is_render = True, True
        rows = [
            {'id': 1, 'name': 'Guard', 'team': 'LAL', 'position': 'G', 'predicted_ppg': 30.0,
             'predicted_rpg': 3.0, 'predicted_apg': 5.0, 'predicted_spg': 1.0, 'predicted_bpg': 0.0,
             'predicted_tov': 3.0, 'predicted_fantasy': 41.1},
            {'id': 2, 'name': 'Big', 'team': 'BOS', 'position': 'C', 'predicted_ppg': 18.0,
             'predicted_rpg': 12.0, 'predicted_apg': 2.0, 'predicted_spg': 1.0, 'predicted_bpg': 3.0,
             'predicted_tov': 1.0, 'predicted_fantasy': 47.4},
        ]
        with patch.object(state, 'predictions_cache', {'all_players_list': rows}):
            before = deepcopy(state.predictions_cache)
            url = '/api/predictions?sort_by=predicted_fantasy&sort_order=desc'
            self.assertEqual([p['name'] for p in self.get_scored(url)['predictions']], ['Big', 'Guard'])
            custom = self.get_scored(url, 'custom:pts=5')['predictions']
            self.assertEqual([(p['name'], p['predicted_fantasy']) for p in custom],
                             [("Guard", 161.1), ("Big", 118.4)])
            self.assertEqual(state.predictions_cache, before)

    def test_live_box_scores_are_rescored_on_a_copy(self):
        box = {'name': 'Guard', 'pts': 25, 'reb': 10, 'ast': 5, 'stl': 2, 'blk': 1, 'tov': 3, 'fpts': 50.5}
        roster = {'name': 'Test Player', 'season_fpts': 1.0}
        cached = [{'gameId': '1', 'players': {'home': [box], 'away': [roster]}}]
        snapshot = deepcopy(cached)
        with patch.object(games_route, 'get_todays_games', return_value=cached), \
             patch.object(games_route, 'archive_finished_games'):
            game = self.get_scored('/api/games/today', 'espn')['games'][0]
        self.assertEqual(game['players']['home'][0]['fpts'], 51.0)
        # Rescored from the unrounded season row in nba_name_index (season_player defaults).
        self.assertEqual(game['players']['away'][0]['season_fpts'], 39.0)  # 20+5+12+4+2-4
        self.assertEqual(cached, snapshot)


    def test_roster_season_fpts_matches_by_person_id_before_name(self):
        # The roster name differs from the season row's, so only the person ID can find it.
        roster = {'personId': state.nba_data[0]['PLAYER_ID'], 'name': 'Renamed Player', 'season_fpts': 1.0}
        missing = {'personId': 999, 'name': 'Nobody', 'season_fpts': 1.0}
        cached = [{'gameId': '1', 'players': {'home': [roster, missing], 'away': []}}]
        with patch.object(games_route, 'get_todays_games', return_value=cached), \
             patch.object(games_route, 'archive_finished_games'):
            home = self.get_scored('/api/games/today', 'espn')['games'][0]['players']['home']
        self.assertEqual(home[0]['season_fpts'], 39.0)
        self.assertIsNone(home[1]['season_fpts'])


class SetFantasyScoringTests(unittest.TestCase):
    def save(self, rowcount):
        conn = MagicMock()
        conn.execute.return_value.rowcount = rowcount
        with patch.object(db, 'get_db', return_value=conn):
            return db.set_fantasy_scoring(1, {'preset': 'espn'}), conn

    def test_reports_success_when_the_user_row_is_updated(self):
        saved, conn = self.save(1)
        self.assertTrue(saved)
        conn.commit.assert_called_once_with()
        conn.close.assert_called_once_with()

    def test_reports_failure_when_the_account_no_longer_exists(self):
        self.assertFalse(self.save(0)[0])


class ProfileScoringRouteTests(SeasonRouteTestCase):
    def test_get_returns_default_and_presets(self):
        with patch('app.api.routes.profile.get_user_by_id', return_value={'id': 1, 'fantasy_scoring': None}):
            body = self.get_json('/api/profile/scoring')
        self.assertEqual(body['scoring'], {'preset': 'fanduel', 'label': 'FanDuel', 'weights': FANTASY_WEIGHTS})
        self.assertEqual([p['id'] for p in body['presets']], list(SCORING_PRESETS))

    def test_put_saves_a_normalized_setting(self):
        with patch('app.api.routes.profile.set_fantasy_scoring', return_value=True) as save:
            response = self.client.put('/api/profile/scoring', headers={'Authorization': 'Bearer test'},
                                       json={'preset': 'custom', 'weights': {'pts': 5, 'fg3m': 1}})
        self.assertEqual(response.status_code, 200)
        expected = {'preset': 'custom', 'weights': {**FANTASY_WEIGHTS, 'pts': 5.0}}
        save.assert_called_once_with(1, expected)
        self.assertEqual(response.get_json()['scoring'], {**expected, 'label': 'Custom'})

    def test_put_rejects_bad_settings_and_needs_auth(self):
        response = self.client.put('/api/profile/scoring', headers={'Authorization': 'Bearer test'},
                                   json={'preset': 'nope'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.put('/api/profile/scoring', json={'preset': 'espn'}).status_code, 401)


if __name__ == '__main__':
    unittest.main()
