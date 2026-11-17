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
    // Team roster rows carry the injury report entry; box-score rows do not.
    injury: player.injury ?? null,
    history: {},
  };
}

// Linking pages hand over their own rows: season averages (ppg, or current_stats.ppg on search
// results), last-season fields (ppg_last, stats.ppg_last, PPG_LAST), the per-game model's last-10
// averages (last10_pts) or box-score names. Copy the first one present under the box-score names
// buildPlayerFallback reads, so the fallback profile shows the row's stats instead of zeros.
const ROW_STAT_NAMES = {
  pts: ['ppg', 'ppg_last', 'last10_pts'], reb: ['rpg', 'rpg_last', 'last10_reb'],
  ast: ['apg', 'apg_last', 'last10_ast'], stl: ['spg', 'spg_last', 'last10_stl'],
  blk: ['bpg', 'bpg_last', 'last10_blk'], tov: ['tov', 'tov_last', 'last10_tov'],
  min: ['mpg', 'minutes', 'mpg_last', 'last10_minutes'],
  fg_pct: ['fg_pct', 'fg_pct_last'], fg3_pct: ['fg3_pct', 'fg3_pct_last'], ft_pct: ['ft_pct', 'ft_pct_last'],
  games_played: ['games_played_last'],
};

export function normalizePlayerRow(row) {
  const normalized = { ...row };
  for (const [key, names] of Object.entries(ROW_STAT_NAMES)) {
    const candidates = [key, ...names].flatMap(name => [
      row?.[name], row?.stats?.[name], row?.current_stats?.[name], row?.[name.toUpperCase()],
    ]);
    normalized[key] = candidates.find(value => value !== undefined && value !== null);
  }
  return normalized;
}

export async function fetchPlayerDetails(player, signal) {
  const response = await fetch(buildApiUrl(`players/search-all?query=${encodeURIComponent(player.name)}`), { signal });
  if (!response.ok) throw new Error('Unable to load player details');
  const data = await response.json();
  return (data.players || []).find(item => samePlayerName(item.name, player.name))
    || buildPlayerFallback(player);
}

// The player page's profile: by NBA id first, then by name (the route's name, or the row the
// linking page handed over as `hint`). Resolves to null when nothing can be found; an abort rejects.
export async function fetchPlayerPage({ playerId, name, hint }, signal) {
  if (/^\d+$/.test(playerId ?? '')) {
    try {
      const response = await fetch(buildApiUrl(`players/${playerId}`), { signal });
      if (response.ok) return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') throw error;
    }
  }
  const searchName = name || hint?.name;
  if (!searchName) return null;
  const row = { ...normalizePlayerRow(hint), name: searchName };
  try {
    const player = await fetchPlayerDetails(row, signal);
    // Without a row, an unmatched search only echoes the name back: that is "not found".
    return hint || player.id != null ? player : null;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    return hint ? buildPlayerFallback(row) : null;
  }
}
