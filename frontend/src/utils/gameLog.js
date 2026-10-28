export function formatSeasonTeams(teams) {
  if (!Array.isArray(teams)) return '';
  return teams.filter(team => typeof team === 'string' && team && team !== 'UNK').join(' → ');
}

export function formatAbsence(absence, season, teams) {
  if (!absence || typeof absence !== 'object') return '';
  let message = `Did not play in ${season}`;
  const seasonTeams = formatSeasonTeams(teams);
  if (seasonTeams) message += ` (${seasonTeams})`;
  const reasons = (Array.isArray(absence.reasons) && absence.reasons.length ? absence.reasons : [absence.reason])
    .filter(reason => typeof reason === 'string' && reason);
  if (reasons.length) message += ` — ${reasons.join(', ')}`;
  const missed = absence.games_missed;
  if (typeof missed === 'number' && missed > 0) message += ` · missed ${missed} ${missed === 1 ? 'game' : 'games'}`;
  return message;
}

// Mirrors current_season_year() in backend/app/services/game_archive.py: rolls over on October 1.
export function currentSeasonLabel(today = new Date()) {
  const endYear = today.getMonth() >= 9 ? today.getFullYear() + 1 : today.getFullYear();
  return `${endYear - 1}-${endYear}`;
}
