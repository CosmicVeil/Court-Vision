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
             patch.object(self.module, 'get_upcoming_games', return_value=[]), \
             patch.object(self.module, '_archived_game', return_value=None) as archived:
            response = self.client.get('/api/games/missing')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json(), {'error': 'Game not found'})
        archived.assert_called_once_with('missing')

    def test_finished_game_from_an_earlier_day_comes_from_the_archive(self):
        game = {'gameId': 'old-1', 'status': 3}
        with patch.object(self.module, 'get_todays_games', return_value=[]), \
             patch.object(self.module, 'get_upcoming_games', return_value=[]), \
             patch.object(self.module.db, 'get_db', return_value=Connection()), \
             patch.object(self.module.game_archive, 'archived_game', return_value=game) as archived:
            response = self.client.get('/api/games/old-1')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), game)
        self.assertEqual(archived.call_args.args[1], 'old-1')

    def test_archive_outage_is_a_404_not_a_500(self):
        with patch.object(self.module, 'get_todays_games', return_value=[]), \
             patch.object(self.module, 'get_upcoming_games', return_value=[]), \
             patch.object(self.module.db, 'get_db', side_effect=RuntimeError('no database')):
            response = self.client.get('/api/games/old-1')
        self.assertEqual(response.status_code, 404)


class Connection:
    closed = False

    def close(self):
        self.closed = True


class PastGamesApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = games_routes
        cls.client = create_app(load_data=False).test_client()

    def get(self, url, total=45):
        self.conn = Connection()
        with patch.object(self.module.db, 'get_db', return_value=self.conn), \
             patch.object(self.module.game_archive, 'past_games',
                          return_value=([{'gameId': 'old-1'}], total)) as self.past_games:
            return self.client.get(url)

    def test_returns_the_requested_page_with_pagination_metadata(self):
        response = self.get('/api/games/past?page=2')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(),
                         {'games': [{'gameId': 'old-1'}], 'count': 45, 'total_pages': 3, 'page': 2})
        # Page 2 of 20 per page starts at row 20.
        self.past_games.assert_called_once_with(self.conn, limit=20, offset=20)
        self.assertTrue(self.conn.closed)

    def test_missing_or_invalid_page_falls_back_to_the_first(self):
        for url in ('/api/games/past', '/api/games/past?page=0', '/api/games/past?page=abc'):
            with self.subTest(url=url):
                self.assertEqual(self.get(url).get_json()['page'], 1)
                self.past_games.assert_called_once_with(self.conn, limit=20, offset=0)

    def test_past_is_not_mistaken_for_a_game_id(self):
        with patch.object(self.module, 'get_todays_games') as today:
            self.get('/api/games/past')
        today.assert_not_called()

    def test_database_outage_returns_503_with_an_empty_list(self):
        with patch.object(self.module.db, 'get_db', side_effect=RuntimeError('no database')):
            response = self.client.get('/api/games/past')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json()['games'], [])


if __name__ == '__main__':
    unittest.main()
