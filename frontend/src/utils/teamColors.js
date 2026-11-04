/**
 * Primary team colours keyed by tricode, used to colour shot dots and ticker
 * accents. Values are the teams' primary brand hex. A neutral fallback keeps
 * unknown tricodes rendering.
 */
export const TEAM_COLORS = {
  ATL: '#E03A3E', BOS: '#007A33', BKN: '#000000', CHA: '#1D1160',
  CHI: '#CE1141', CLE: '#860038', DAL: '#00538C', DEN: '#0E2240',
  DET: '#C8102E', GSW: '#1D428A', HOU: '#CE1141', IND: '#002D62',
  LAC: '#C8102E', LAL: '#552583', MEM: '#5D76A9', MIA: '#98002E',
  MIL: '#00471B', MIN: '#0C2340', NOP: '#0C2340', NYK: '#006BB6',
  OKC: '#007AC1', ORL: '#0077C0', PHI: '#006BB6', PHX: '#1D1160',
  POR: '#E03A3E', SAC: '#5A2D81', SAS: '#C4CED4', TOR: '#CE1141',
  UTA: '#002B5C', WAS: '#002B5C',
};

const FALLBACK = '#8a8a94';

export function teamColor(tricode) {
  return TEAM_COLORS[tricode] || FALLBACK;
}

// Some primaries are very dark (BKN, DEN); for dots on a dark court we lift those
// toward their secondary so made/missed stays readable. Returns a display colour.
const DISPLAY_OVERRIDES = {
  BKN: '#c9c9cf', DEN: '#FEC524', MIN: '#78BE21', NOP: '#C8102E',
  UTA: '#F9A01B', WAS: '#E31837', DAL: '#2b7bd4', SAS: '#C4CED4',
};

export function teamDotColor(tricode) {
  return DISPLAY_OVERRIDES[tricode] || teamColor(tricode);
}
