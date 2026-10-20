export function formatSeasonTeams(teams) {
  if (!Array.isArray(teams)) return '';
  return teams.filter(team => typeof team === 'string' && team && team !== 'UNK').join(' → ');
}
