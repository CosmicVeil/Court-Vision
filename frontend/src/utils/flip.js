// FLIP (First, Last, Invert, Play): for each item that exists in both snapshots and moved,
// the offset that puts it back where it was. Animating that offset to zero glides it into place.
const MIN_MOVE = 1;

export function getFlipMoves(previous, next) {
  if (!previous) return [];
  const moves = [];
  for (const [key, to] of next) {
    const from = previous.get(key);
    if (!from) continue;
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    if (Math.abs(dx) >= MIN_MOVE || Math.abs(dy) >= MIN_MOVE) moves.push({ key, dx, dy });
  }
  return moves;
}
