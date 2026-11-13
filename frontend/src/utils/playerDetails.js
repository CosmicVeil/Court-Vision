import { buildApiUrl } from '../config/api';
import { samePlayerName } from './playerNames';

export function buildPlayerFallback(player) {
  return {
    // Box-score rows call the NBA.com ID personId; the popout needs it for the headshot.
    id: player.id ?? player.personId ?? null,
    name: player.name,
    team: player.team || 'UNK',
    position: player.position || 'UNK',
    age: player.age ?? null,
    current_stats: {
      ppg: player.pts ?? 0, rpg: player.reb ?? 0, apg: player.ast ?? 0,
      spg: player.stl ?? 0, bpg: player.blk ?? 0, tov: player.tov ?? 0,
      mpg: player.min ?? 0,
      // Season rows (the team roster) know these; box-score rows do not.
      fg_pct: player.fg_pct ?? 0, fg3_pct: player.fg3_pct ?? 0, ft_pct: player.ft_pct ?? 0,
      games_played: player.games_played ?? 0,
    },
    ml_stats: null,
    history: {},
  };
}

export async function fetchPlayerDetails(player, signal) {
  const response = await fetch(buildApiUrl(`players/search-all?query=${encodeURIComponent(player.name)}`), { signal });
  if (!response.ok) throw new Error('Unable to load player details');
  const data = await response.json();
  return (data.players || []).find(item => samePlayerName(item.name, player.name))
    || buildPlayerFallback(player);
}
