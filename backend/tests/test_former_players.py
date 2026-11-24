"""Former (retired or out-of-league) players on /api/players?status=former. Synthetic data only."""
import unittest
from unittest.mock import patch

from app import create_app, state
from app.api.routes import players


def row(player_id, name, team, ppg, position='G'):
    return {'PLAYER_ID': player_id, 'PLAYER_NAME': name, 'TEAM': team, 'POSITION': position, 'AGE': 30,
            'PPG_LAST': ppg, 'APG_LAST': 1.0, 'RPG_LAST': 1.0, 'GAMES_PLAYED_LAST': 60}


ACTIVE = row(1, 'Still Playing', 'LAL', 25.0)
RETIRED_LAST_YEAR = row(2, 'Just Retired', 'BOS', 18.0)
RETIRED_LONG_AGO = row(3, 'Old Legend', 'SEA', 30.0, position='F')

HISTORY = {
    2016: [row(3, 'Old Legend', 'NJN', 22.0, position='F'), row(2, 'Just Retired', 'CHA', 9.0)],
    2017: [RETIRED_LONG_AGO, row(1, 'Still Playing', 'MIA', 12.0)],
    2026: [ACTIVE, RETIRED_LAST_YEAR],
}


class FormerPlayersTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.object(state, 'nba_data', HISTORY[2026]))
        self.enterContext(patch.object(state, 'multi_season_data', HISTORY))
        self.enterContext(patch.object(state, 'current_season_data', [dict(ACTIVE, TEAM='DAL')]))
        self.enterContext(patch.object(state, 'current_season_year', 2027))
        self.enterContext(patch.object(state, 'live_team_rows', {}))
        self.client = create_app(load_data=False).test_client()

    def get(self, query):
        response = self.client.get(f'/api/players?{query}')
        self.assertEqual(response.status_code, 200)
        return response.get_json()

    def test_lists_each_former_player_once_at_their_final_season(self):
        former = {p['PLAYER_NAME']: p for p in players.former_players()}
        self.assertEqual(set(former), {'Just Retired', 'Old Legend'})
        self.assertEqual((former['Just Retired']['LAST_SEASON'], former['Just Retired']['TEAM']), (2026, 'BOS'))
        self.assertEqual((former['Old Legend']['LAST_SEASON'], former['Old Legend']['PPG_LAST']), (2017, 30.0))

    def test_does_not_mutate_the_season_rows(self):
        players.former_players()
        self.assertNotIn('LAST_SEASON', RETIRED_LONG_AGO)

    def test_status_former_returns_former_players_with_their_last_season(self):
        data = self.get('status=former&sort_by=ppg&sort_order=desc')
        self.assertEqual([(p['name'], p['team'], p['last_season']) for p in data['players']],
                         [('Old Legend', 'SEA', 2017), ('Just Retired', 'BOS', 2026)])
        self.assertEqual(data['pagination']['total'], 2)
        self.assertEqual(data['filters']['status'], 'former')

    def test_status_former_ignores_year_and_still_filters(self):
        self.assertEqual([p['name'] for p in self.get('status=former&year=2016')['players']],
                         ['Just Retired', 'Old Legend'])
        self.assertEqual([p['name'] for p in self.get('status=former&search=legend')['players']], ['Old Legend'])
        self.assertEqual([p['name'] for p in self.get('status=former&position=F')['players']], ['Old Legend'])
        self.assertEqual([p['name'] for p in self.get('status=former&team=BOS')['players']], ['Just Retired'])

    def test_default_list_is_current_players_only_without_last_season(self):
        data = self.get('')
        self.assertEqual([(p['name'], p['team']) for p in data['players']], [('Still Playing', 'DAL')])
        self.assertNotIn('last_season', data['players'][0])
        self.assertEqual(data['filters']['status'], '')

    def test_unknown_status_is_ignored(self):
        self.assertEqual([p['name'] for p in self.get('status=<b>retired</b>')['players']], ['Still Playing'])

    def test_without_an_archive_the_newest_pickle_season_counts_as_current(self):
        with patch.object(state, 'current_season_data', []):
            self.assertEqual([p['PLAYER_NAME'] for p in players.former_players()], ['Old Legend'])

    def test_nan_trends_from_the_pickle_fall_back_so_the_response_stays_valid_json(self):
        nan_row = dict(RETIRED_LONG_AGO, PPG_TREND=float('nan'), APG_TREND=float('nan'),
                       RPG_TREND=float('nan'), CONSISTENCY_SCORE=float('nan'))
        with patch.object(state, 'multi_season_data', {**HISTORY, 2017: [nan_row]}):
            response = self.client.get('/api/players?status=former')
        self.assertNotIn(b'NaN', response.data)
        legend = next(p for p in response.get_json()['players'] if p['name'] == 'Old Legend')
        self.assertTrue(all(isinstance(v, float) for v in legend['trends'].values()), legend['trends'])

    def test_active_player_matched_by_id_even_if_name_differs(self):
        renamed = dict(ACTIVE, PLAYER_NAME='Still Playing Jr.')
        with patch.object(state, 'current_season_data', [renamed]):
            names = {p['PLAYER_NAME'] for p in players.former_players()}
        self.assertNotIn('Still Playing', names)


if __name__ == '__main__':
    unittest.main()
