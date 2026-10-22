export function formatSeasonTeams(teams) {
  if (!Array.isArray(teams)) return '';
  return teams.filter(team => typeof team === 'string' && team && team !== 'UNK').join(' → ');
}

// Mirrors current_season_year() in backend/app/services/game_archive.py: rolls over on October 1.
export function currentSeasonLabel(today = new Date()) {
  const endYear = today.getMonth() >= 9 ? today.getFullYear() + 1 : today.getFullYear();
  return `${endYear - 1}-${endYear}`;
}
