"""Route-level tests for the free-account gate on prediction endpoints.

Public:  limited preview of /api/predictions (first PUBLIC_PREVIEW_LIMIT players).
Gated:   full paginated /api/predictions (beyond the preview), /api/player-prediction/<name>,
         and /api/recommendations/<stat> — all 401 without a valid token.

The DB is mocked (no Postgres needed) exactly like RequireAuthTests in
test_auth_tokens.py: auth.get_db returns a MagicMock whose fetchone() decides
whether a token is valid.
"""
import unittest
from unittest.mock import MagicMock, patch

from app import create_app, state
from app.api.routes.predictions import PUBLIC_PREVIEW_LIMIT


def _fake_predictions(n):
    """n prediction rows in the shape the route produces (enough fields to sort/paginate)."""
    rows = []
    for i in range(n):
        row = {
            'id': 1000 + i,
            'name': f'Player {i:02d}',
            'team': 'LAL',
            'position': 'SF',
            'age': 25,
        }
        for key in ('ppg', 'apg', 'rpg', 'spg', 'bpg', 'tov'):
            row[f'{key}_last'] = 1.0
            row[f'predicted_{key}'] = 1.0
        row['mpg_last'] = 10.0
        row['predicted_mpg'] = 10.0
        for key in ('fg_pct', 'fg3_pct', 'ft_pct'):
            row[f'{key}_last'] = 50.0
            row[f'predicted_{key}'] = 50.0
        rows.append(row)
    return rows


class PredictionGatingTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(load_data=False)
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()

        # Mocked auth DB: fetchone() returns a user row only for the "valid" token.
        self.conn = MagicMock()
        self.db_patch = patch('app.auth.get_db', return_value=self.conn)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)

        # Serve predictions from an in-memory list via the Render cache path.
        self.total = PUBLIC_PREVIEW_LIMIT + 25
        self._patchers = [
            patch.object(state, 'ai_available', True),
            patch.object(state, 'is_render', True),
            patch.object(state, 'predictions_cache',
                         {'all_players_list': _fake_predictions(self.total),
                          'recommendations': {'PPG': _fake_predictions(5)}}),
            patch.object(state, 'current_season_data', []),
        ]
        for p in self._patchers:
            p.start()
            self.addCleanup(p.stop)

    def _as_valid(self):
        self.conn.execute.return_value.fetchone.return_value = {'user_id': 7}

    def _as_invalid(self):
        self.conn.execute.return_value.fetchone.return_value = None

    # --- /api/predictions: public preview vs full list ---------------------

    def test_predictions_public_preview_is_limited(self):
        """No token -> only the preview slice, flagged, never the full total."""
        response = self.client.get('/api/predictions?limit=50')
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertTrue(body['preview'])
        self.assertEqual(len(body['predictions']), PUBLIC_PREVIEW_LIMIT)
        self.assertEqual(body['pagination']['total'], PUBLIC_PREVIEW_LIMIT)
        self.assertEqual(body['pagination']['total_pages'], 1)

    def test_predictions_preview_cannot_page_past_the_cap(self):
        """A signed-out caller asking for page 2 still gets page 1's preview."""
        response = self.client.get('/api/predictions?page=2&limit=50')
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertTrue(body['preview'])
        self.assertEqual(body['pagination']['page'], 1)
        self.assertEqual(len(body['predictions']), PUBLIC_PREVIEW_LIMIT)

    def test_predictions_full_list_with_valid_token(self):
        """Valid token -> full total and real pagination, not the preview."""
        self._as_valid()
        response = self.client.get('/api/predictions?limit=50',
                                   headers={'Authorization': 'Bearer valid'})
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertFalse(body['preview'])
        self.assertEqual(body['pagination']['total'], self.total)
        self.assertEqual(len(body['predictions']), min(50, self.total))

    def test_predictions_invalid_token_falls_back_to_preview(self):
        """An invalid/expired token must not unlock the full list."""
        self._as_invalid()
        response = self.client.get('/api/predictions?limit=50',
                                   headers={'Authorization': 'Bearer nope'})
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertTrue(body['preview'])
        self.assertEqual(body['pagination']['total'], PUBLIC_PREVIEW_LIMIT)

    # --- /api/player-prediction/<name>: fully gated ------------------------

    def test_player_prediction_requires_auth(self):
        response = self.client.get('/api/player-prediction/LeBron%20James')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json(),
                         {'success': False, 'message': 'No token provided'})

    def test_player_prediction_rejects_invalid_token(self):
        self._as_invalid()
        response = self.client.get('/api/player-prediction/LeBron%20James',
                                   headers={'Authorization': 'Bearer nope'})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json(),
                         {'success': False, 'message': 'Invalid or expired token'})

    def test_player_prediction_allows_valid_token(self):
        self._as_valid()
        with patch.object(state, 'get_cached_player_prediction',
                          return_value={'name': 'LeBron James'}, create=True):
            response = self.client.get('/api/player-prediction/LeBron%20James',
                                       headers={'Authorization': 'Bearer valid'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()['ai_available'])

    # --- /api/recommendations/<stat>: fully gated --------------------------

    def test_recommendations_requires_auth(self):
        response = self.client.get('/api/recommendations/PPG')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json(),
                         {'success': False, 'message': 'No token provided'})

    def test_recommendations_allows_valid_token(self):
        self._as_valid()
        response = self.client.get('/api/recommendations/PPG',
                                   headers={'Authorization': 'Bearer valid'})
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.get_json(), list)


class PlayerPopupPredictionGatingTests(unittest.TestCase):
    """/api/players/search-all and /api/players/<id> stay public, but the per-player
    prediction (ml_stats) is only included for signed-in callers."""

    def setUp(self):
        from tests.test_current_season import season_player

        player = season_player()
        prediction = {
            'predicted_stats': {'ppg': 22.0, 'apg': 5.5},
            'improvements': {'ppg': 10.0, 'apg': 10.0},
        }
        for name, value in (
            ('nba_data', [player]), ('nba_name_index', {'test player': player}),
            ('multi_season_data', {2026: [player]}),
            ('multi_season_name_indexes', {2026: {'test player': player}}),
            ('current_season_data', []), ('current_season_year', 2027),
            ('ai_available', True), ('is_render', True),
            ('predictions_cache', {'players': {'test player': prediction}}),
        ):
            self.enterContext(patch.object(state, name, value))
        # Offline: the routes' injury report (an ESPN call) is empty in these tests.
        self.enterContext(patch('app.services.injuries.get_injuries', return_value={}))
        self.validate = self.enterContext(patch('app.auth.validate_token', return_value=None))
        self.client = create_app(load_data=False).test_client()

    def _search(self, headers=None):
        response = self.client.get('/api/players/search-all?query=Test', headers=headers or {})
        self.assertEqual(response.status_code, 200)
        return response.get_json()['players'][0]

    def test_signed_out_search_hides_predictions_but_keeps_stats(self):
        player = self._search()
        self.assertIsNone(player['ml_stats'])
        self.assertTrue(player['predictions_locked'])
        self.assertIn('current_stats', player)
        self.assertIn('history', player)

    def test_invalid_token_search_hides_predictions(self):
        player = self._search({'Authorization': 'Bearer expired'})
        self.assertIsNone(player['ml_stats'])
        self.assertTrue(player['predictions_locked'])

    def test_signed_in_search_includes_predictions(self):
        self.validate.return_value = 7
        player = self._search({'Authorization': 'Bearer valid'})
        self.assertFalse(player['predictions_locked'])
        self.assertEqual(player['ml_stats']['predicted_stats'], {'ppg': 22.0, 'apg': 5.5})

    def test_player_by_id_follows_the_same_gate(self):
        signed_out = self.client.get('/api/players/1').get_json()
        self.assertIsNone(signed_out['ml_stats'])
        self.assertTrue(signed_out['predictions_locked'])
        self.validate.return_value = 7
        signed_in = self.client.get('/api/players/1', headers={'Authorization': 'Bearer valid'}).get_json()
        self.assertEqual(signed_in['ml_stats']['predicted_stats'], {'ppg': 22.0, 'apg': 5.5})


if __name__ == '__main__':
    unittest.main()
