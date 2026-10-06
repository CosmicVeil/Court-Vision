import unittest
from unittest.mock import patch

from app import create_app
from app.api.routes import games as games_routes


class GameDetailApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # load_data=False: no pickles, model or database needed.
        cls.module = games_routes
        cls.client = create_app(load_data=False).test_client()

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
