import { COURT } from '../utils/courtGeometry';

/**
 * Accurate NBA half-court drawn in feet (1 SVG unit = 1 ft).
 * Baseline is at the top (y=0), half court at the bottom (y=47).
 * The hoop sits at (25, 5.25). Renders only lines + court surface; shot dots
 * and overlays are drawn by callers inside the same coordinate space.
 *
 * Props:
 *   full   — when true, extends the viewBox to a stylised full court (mirrors
 *            the half for context); otherwise shows the attacking half only.
 *   children — rendered on top of the court (e.g. shot dots), in court feet.
 */

const { WIDTH, HALF_LENGTH, HOOP_X, HOOP_FROM_BASELINE } = COURT;

// Precompute the 3-point line as a single path: corner segments + arc.
// Corner lines run from the baseline straight out to where the arc begins,
// 3 ft from each sideline (x = 3 and x = 47). The arc has radius 23.75 ft
// centred on the hoop. We find the y where the arc meets the corner lines.
function threePointPath() {
  const r = COURT.THREE_RADIUS;
  const cornerX = COURT.THREE_CORNER_X;              // 3
  const dxFromHoop = HOOP_X - cornerX;               // 22 ft horizontal from hoop
  // y offset of the arc at the corner x, relative to the hoop center.
  const dy = Math.sqrt(Math.max(0, r * r - dxFromHoop * dxFromHoop));
  const cornerEndY = HOOP_FROM_BASELINE + dy;        // where corner line meets arc
  const leftX = cornerX;
  const rightX = WIDTH - cornerX;                     // 47
  // Arc endpoints: left corner-top -> right corner-top, bulging away from baseline.
  // SVG arc: A rx ry xAxisRotation largeArcFlag sweepFlag endX endY
  return [
    `M ${leftX} 0`,
    `L ${leftX} ${cornerEndY.toFixed(2)}`,
    `A ${r} ${r} 0 0 0 ${rightX} ${cornerEndY.toFixed(2)}`,
    `L ${rightX} 0`,
  ].join(' ');
}

const THREE_PATH = threePointPath();

export default function CourtSVG({ full = false, children, className = '' }) {
  // Full view pads below the half court so the UI reads as a longer floor.
  const viewHeight = full ? HALF_LENGTH + 8 : HALF_LENGTH;
  const paintLeft = HOOP_X - COURT.PAINT_WIDTH / 2;

  return (
    <svg
      className={`court-svg ${className}`}
      viewBox={`0 0 ${WIDTH} ${viewHeight}`}
      preserveAspectRatio="xMidYMin meet"
      role="img"
      aria-label="Basketball half-court shot chart"
    >
      {/* Court surface */}
      <rect x="0" y="0" width={WIDTH} height={viewHeight} className="court-floor" />

      {/* Outer boundary (baseline + sidelines; half-court line at the bottom) */}
      <rect x="0.1" y="0.1" width={WIDTH - 0.2} height={HALF_LENGTH - 0.2} className="court-line court-bounds" />

      {/* Paint / key */}
      <rect x={paintLeft} y="0" width={COURT.PAINT_WIDTH} height={COURT.FT_LINE_FROM_BASELINE} className="court-line court-paint" />

      {/* Free-throw circle (top half solid; bottom half is dashed in real courts,
          drawn solid here for clarity) */}
      <circle cx={HOOP_X} cy={COURT.FT_LINE_FROM_BASELINE} r={COURT.FT_CIRCLE_RADIUS} className="court-line court-ft-circle" />

      {/* Restricted-area arc under the basket */}
      <path
        d={`M ${HOOP_X - COURT.RESTRICTED_RADIUS} ${HOOP_FROM_BASELINE}
            A ${COURT.RESTRICTED_RADIUS} ${COURT.RESTRICTED_RADIUS} 0 0 0 ${HOOP_X + COURT.RESTRICTED_RADIUS} ${HOOP_FROM_BASELINE}`}
        className="court-line court-restricted"
      />

      {/* Backboard + rim */}
      <line
        x1={HOOP_X - COURT.BACKBOARD_WIDTH / 2} y1={COURT.BACKBOARD_FROM_BASELINE}
        x2={HOOP_X + COURT.BACKBOARD_WIDTH / 2} y2={COURT.BACKBOARD_FROM_BASELINE}
        className="court-line court-backboard"
      />
      <circle cx={HOOP_X} cy={HOOP_FROM_BASELINE} r={COURT.RIM_RADIUS} className="court-line court-rim" />

      {/* Three-point line */}
      <path d={THREE_PATH} className="court-line court-three" />

      {/* Half-court line + center circle */}
      <line x1="0" y1={HALF_LENGTH} x2={WIDTH} y2={HALF_LENGTH} className="court-line court-halfline" />
      <path
        d={`M ${HOOP_X - 6} ${HALF_LENGTH} A 6 6 0 0 1 ${HOOP_X + 6} ${HALF_LENGTH}`}
        className="court-line court-center"
      />

      {/* Shot dots / overlays live on top, in the same feet coordinate space */}
      {children}
    </svg>
  );
}
