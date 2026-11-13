// Display helpers for a player's injury entry, as served by the backend's injury report
// (backend/app/services/injuries.py): { status, status_abbr, injury, detail, side, return_date, note }.

// Colour family for the badge: Out is red, Day-To-Day amber, anything else (suspension...) neutral.
export function injuryTone(injury) {
  const status = (injury?.status || '').toLowerCase();
  if (status === 'out') return 'out';
  if (status === 'day-to-day') return 'dtd';
  return 'other';
}

// "Left Foot (Fracture)", "Ankle", or '' when ESPN gives no details.
export function injuryDescription(injury) {
  if (!injury) return '';
  const where = [injury.side, injury.injury].filter(Boolean).join(' ');
  if (!injury.detail) return where;
  return where ? `${where} (${injury.detail})` : injury.detail;
}

// "Expected back Dec 12", or '' without a (valid) return date. Noon avoids a timezone day shift.
export function injuryReturnLabel(injury) {
  if (!injury?.return_date) return '';
  const date = new Date(`${injury.return_date}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return `Expected back ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

// One-line tooltip/summary: "Out · Left Foot (Fracture) · Expected back Dec 12".
export function injurySummary(injury) {
  if (!injury) return '';
  return [injury.status, injuryDescription(injury), injuryReturnLabel(injury)].filter(Boolean).join(' · ');
}
