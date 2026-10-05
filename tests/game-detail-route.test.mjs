import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getGameDetailPath } from '../src/utils/liveGames.js';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('game cards link to a dedicated detail route', () => {
  assert.match(read('src/App.jsx'), /path="\/games\/:gameId"/);
  assert.match(read('src/components/LiveGames.jsx'), /getGameDetailPath\(game\.gameId\)/);
  assert.doesNotMatch(read('src/components/LiveGames.jsx'), /setExpanded/);
  assert.equal(getGameDetailPath('401'), '/games/401');
});

test('game detail handles refresh, player modal and terminal states', () => {
  const detail = read('src/components/LiveGameDetail.jsx');
  for (const pattern of [/useParams/, /buildGameDetailEndpoint/, /LIVE_GAMES_REFRESH_MS/, /to="\/games"/, /GAME NOT FOUND/, /UNABLE TO LOAD GAME/, /BoxScore/, /PlayerStatsModal/]) assert.match(detail, pattern);
  assert.match(read('Backend/app.py'), /get_upcoming_games\(nba_data=nba_data\)/);
});
