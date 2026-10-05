export function extractWeeklyPraPlayer(payload) {
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'player')) return null;
  return payload.player ?? null;
}

export function formatPraGameDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
