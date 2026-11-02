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

// Oldest season (end year) in nba_multi_season_data.pkl; a history starting here may be cut off.
const FIRST_HISTORY_SEASON = 2003;

// Trims the game log seasons to the ones since the player's first season in `history` (keyed by end year).
export function playerSeasons(seasons, history) {
  const years = Object.keys(history || {}).map(Number).filter(Number.isInteger);
  if (!years.length) return seasons;
  const firstYear = Math.min(...years);
  if (firstYear <= FIRST_HISTORY_SEASON) return seasons;
  return seasons.filter(label => Number(label.split('-')[1]) >= firstYear);
}
