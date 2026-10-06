// Favorites utility functions using localStorage

const FAVORITES_KEY = 'nba_favorites';

const toFiniteOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const pick = (player, key, aliases = []) => {
  for (const candidate of [key, ...aliases]) {
    const value = player.stats?.[candidate] ?? player.trends?.[candidate] ?? player[candidate];
    if (value !== null && value !== undefined) return value;
  }
  return null;
};

export const normalizeFavoritePlayer = (player = {}) => {
  const stat = (key, aliases) => toFiniteOrNull(pick(player, key, aliases));
  const trends = {
    ppg_trend: stat('ppg_trend'),
    apg_trend: stat('apg_trend'),
    rpg_trend: stat('rpg_trend'),
    consistency_score: stat('consistency_score'),
  };

  return {
    ...player,
    id: player.id ?? player.personId ?? player.player_id,
    name: player.name ?? player.player_name ?? 'Unknown Player',
    team: player.team ?? player.team_abbreviation ?? 'UNK',
    position: player.position ?? 'UNK',
    age: toFiniteOrNull(player.age),
    height: toFiniteOrNull(player.height),
    weight: toFiniteOrNull(player.weight),
    stats: {
      ppg_last: stat('ppg_last', ['ppg']), apg_last: stat('apg_last', ['apg']),
      rpg_last: stat('rpg_last', ['rpg']), spg_last: stat('spg_last', ['spg']),
      bpg_last: stat('bpg_last', ['bpg']), tov_last: stat('tov_last', ['tov']),
      minutes: stat('minutes', ['mpg_last', 'mpg']), fg_pct_last: stat('fg_pct_last', ['fg_pct']),
      fg3_pct_last: stat('fg3_pct_last', ['fg3_pct']), ft_pct_last: stat('ft_pct_last', ['ft_pct']),
      games_played: stat('games_played', ['games_played_last']),
    },
    trends: Object.values(trends).some(value => value !== null) ? trends : null,
  };
};

export const getFavorites = () => {
  try {
    const favorites = localStorage.getItem(FAVORITES_KEY);
    return favorites ? JSON.parse(favorites) : [];
  } catch (error) {
    console.error('Error getting favorites:', error);
    return [];
  }
};

export const addFavorite = (player) => {
  try {
    const favorites = getFavorites();
    // Check if player already exists (by player id)
    if (!favorites.find(fav => fav.id === player.id)) {
      favorites.push(player);
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error adding favorite:', error);
    return false;
  }
};

export const removeFavorite = (playerId) => {
  try {
    const favorites = getFavorites();
    const updated = favorites.filter(fav => fav.id !== playerId);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
    return true;
  } catch (error) {
    console.error('Error removing favorite:', error);
    return false;
  }
};

export const isFavorite = (playerId) => {
  try {
    const favorites = getFavorites();
    return favorites.some(fav => fav.id === playerId);
  } catch (error) {
    console.error('Error checking favorite:', error);
    return false;
  }
};

export const toggleFavorite = (player) => {
  if (isFavorite(player.id)) {
    removeFavorite(player.id);
    return false;
  } else {
    addFavorite(player);
    return true;
  }
};
