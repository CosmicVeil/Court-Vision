export function samePlayerName(a, b) {
  const normalize = (value) => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.'’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalize(a) === normalize(b);
}
