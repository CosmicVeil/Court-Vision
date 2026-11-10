import unittest
from unittest.mock import patch

import app.services.live_games as live_games
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

    def test_finds_upcoming_game_and_attaches_only_its_roster(self):
        def scheduled(game_id, home, away):
            return {'gameId': game_id, 'status': 1, 'home': {'tricode': home}, 'away': {'tricode': away},
                    'players': {'home': [], 'away': []}}

        games = [scheduled('future-0', 'BOS', 'NYK'), scheduled('future-1', 'LAL', 'DEN')]
        with patch.object(self.module, 'get_todays_games', return_value=[]), \
             patch.object(self.module, 'get_upcoming_games', return_value=games) as upcoming, \
             patch.object(live_games, '_roster_from_pkl', side_effect=lambda tri, _: [{'name': tri}]) as roster:
            response = self.client.get('/api/games/future-1')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['players'], {'home': [{'name': 'LAL'}], 'away': [{'name': 'DEN'}]})
        # The schedule is loaded without rosters; only the matched game gets one.
        upcoming.assert_called_once_with()
        self.assertEqual([call.args[0] for call in roster.call_args_list], ['LAL', 'DEN'])

    def test_unknown_game_returns_404(self):
        with patch.object(self.module, 'get_todays_games', return_value=[]), \
             patch.object(self.module, 'get_upcoming_games', return_value=[]):
            response = self.client.get('/api/games/missing')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json(), {'error': 'Game not found'})


if __name__ == '__main__':
    unittest.main()
