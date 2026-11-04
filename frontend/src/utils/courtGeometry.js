/**
 * Court geometry — pure helpers that map ESPN shot coordinates onto an SVG
 * half-court and derive shot distance / zone.
 *
 * ESPN coordinate system (observed from the summary `plays` endpoint):
 *   x: 0..50   left-to-right across the baseline (court is 50 ft wide, x=25 is center)
 *   y: ~-4..47 distance from the baseline toward half court (0 ≈ at the rim)
 * Free throws carry a sentinel coordinate and are filtered out server-side.
 *
 * Our SVG half-court uses NBA dimensions in feet, drawn with the baseline at the
 * TOP (y=0) and half court at the BOTTOM. The hoop sits 5.25 ft from the baseline.
 * One SVG unit = one foot, so the viewBox is "0 0 50 47".
 */

// NBA half-court dimensions, in feet.
export const COURT = {
  WIDTH: 50,          // sideline to sideline
  HALF_LENGTH: 47,    // baseline to half court
  HOOP_X: 25,         // centered
  HOOP_FROM_BASELINE: 5.25, // center of rim from baseline
  RIM_RADIUS: 0.75,
  BACKBOARD_FROM_BASELINE: 4,
  BACKBOARD_WIDTH: 6,
  PAINT_WIDTH: 16,
  FT_LINE_FROM_BASELINE: 19,  // free-throw line
  FT_CIRCLE_RADIUS: 6,
  THREE_RADIUS: 23.75,        // arc radius from the hoop
  THREE_CORNER_X: 3,          // corner-3 sideline inset (22 ft from hoop -> 3 ft from sideline)
  THREE_CORNER_LENGTH: 14,    // length of the straight corner segment from baseline
  RESTRICTED_RADIUS: 4,
};

// ESPN coordinate bounds we treat as "on court". Anything outside is dropped.
const ESPN_X_MIN = 0;
const ESPN_X_MAX = 50;
const ESPN_Y_MIN = -5;
const ESPN_Y_MAX = 50;

/**
 * Map an ESPN {x, y} to SVG feet coordinates on our half-court.
 * Returns null for coordinates outside the plausible on-court range.
 */
export function espnToCourt(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < ESPN_X_MIN || x > ESPN_X_MAX || y < ESPN_Y_MIN || y > ESPN_Y_MAX) return null;
  // ESPN x already matches our 0..50 width. y is distance from baseline, same axis as ours.
  // Clamp y into the half court so a stray value never paints outside the lines.
  const svgX = clamp(x, 0, COURT.WIDTH);
  const svgY = clamp(y, 0, COURT.HALF_LENGTH);
  return { x: svgX, y: svgY };
}

/** Straight-line distance from the hoop, in feet, for an ESPN coordinate. */
export function shotDistanceFt(x, y) {
  const point = espnToCourt(x, y);
  if (!point) return null;
  const dx = point.x - COURT.HOOP_X;
  const dy = point.y - COURT.HOOP_FROM_BASELINE;
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}

/** Coarse zone label for a shot, used in tooltips and future filtering. */
export function shotZone(x, y, value) {
  const dist = shotDistanceFt(x, y);
  if (dist === null) return 'Unknown';
  if (value === 3 || dist >= 22) return '3PT';
  if (dist <= 4) return 'At rim';
  if (dist <= 10) return 'Paint';
  if (dist <= 16) return 'Mid-range';
  return 'Long 2';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
