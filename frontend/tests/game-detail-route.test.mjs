import assert from 'node:assert/strict';
import test from 'node:test';
import { getGameDetailPath } from '../src/utils/liveGames.js';
import { readFrontend as read, readRepo } from './helpers.mjs';

test('game cards link to a dedicated detail route', () => {
  assert.match(read('src/App.jsx'), /path="\/games\/:gameId"/);
  assert.match(read('src/pages/LiveGames.jsx'), /getGameDetailPath\(game\.gameId\)/);
  assert.doesNotMatch(read('src/pages/LiveGames.jsx'), /setExpanded/);
  assert.equal(getGameDetailPath('401'), '/games/401');
});

test('game detail handles refresh, player modal and terminal states', () => {
  const detail = read('src/pages/LiveGameDetail.jsx');
  for (const pattern of [/useParams/, /buildGameDetailEndpoint/, /LIVE_GAMES_REFRESH_MS/, /to="\/games"/, /GAME NOT FOUND/, /UNABLE TO LOAD GAME/, /BoxScore/, /PlayerStatsModal/]) assert.match(detail, pattern);
  assert.match(readRepo('backend/app/api/routes/games.py'), /get_upcoming_games\(nba_data=state\.nba_data\)/);
});
