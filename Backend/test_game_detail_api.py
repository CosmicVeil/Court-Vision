import importlib
import sys
import types
import unittest
from unittest.mock import MagicMock, patch


class GameDetailApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fake_db = types.ModuleType('db')
        fake_ai = types.ModuleType('nba_ai_system')
        for name in ['init_db', 'get_db', 'create_user_from_json', 'authenticate_user_from_json',
                     'get_user_by_id', 'get_saved_players', 'save_player', 'remove_saved_player']:
            setattr(fake_db, name, MagicMock())
        for name in ['get_ai_predictions_bundle', 'get_player_prediction', 'initialize_nba_ai',
                     'nba_ai_system', 'warm_predictions_cache']:
            setattr(fake_ai, name, MagicMock())
        fake_ai.STAT_SCALE = {}
        with patch.dict('os.environ', {'LOW_MEMORY': 'true'}), \
             patch.dict(sys.modules, {'db': fake_db, 'nba_ai_system': fake_ai}):
            sys.modules.pop('app', None)
            cls.module = importlib.import_module('app')
        cls.client = cls.module.app.test_client()

    @classmethod
    def tearDownClass(cls):
        sys.modules.pop('app', None)

    def test_finds_todays_game_without_loading_upcoming(self):
        game = {'gameId': 'today-1', 'status': 2}
        with patch.object(self.module, 'get_todays_games', return_value=[game]), \
             patch.object(self.module, 'get_upcoming_games') as upcoming:
            response = self.client.get('/api/games/today-1')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), game)
        upcoming.assert_not_called()

    def test_finds_upcoming_game(self):
        game = {'gameId': 'future-1', 'status': 1}
        with patch.object(self.module, 'get_todays_games', return_value=[]), \
             patch.object(self.module, 'get_upcoming_games', return_value=[game]):
            response = self.client.get('/api/games/future-1')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), game)

    def test_unknown_game_returns_404(self):
        with patch.object(self.module, 'get_todays_games', return_value=[]), \
             patch.object(self.module, 'get_upcoming_games', return_value=[]):
            response = self.client.get('/api/games/missing')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json(), {'error': 'Game not found'})


if __name__ == '__main__':
    unittest.main()
