// Fantasy points arrive from the API already scored from unrounded stats (backend
// app/utils/fantasy.py), so the frontend only formats them; it never re-scores rounded values.
// The user's scoring rides along on every API request as the X-Fantasy-Scoring header (see
// main.jsx); without it the backend scores with FanDuel.
export const FPTS_TITLE = 'FanDuel fantasy points: PTS + 1.2 REB + 1.5 AST + 3 STL + 3 BLK − TOV';

export const SCORING_HEADER = 'X-Fantasy-Scoring';

// The six scored stats, in the backend's order, with their box-score labels.
export const SCORING_STATS = [
  { key: 'pts', label: 'PTS' }, { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' },
  { key: 'stl', label: 'STL' }, { key: 'blk', label: 'BLK' }, { key: 'tov', label: 'TOV' },
];

// Header value for a scoring setting ({ preset, weights }): null for the default, the preset id,
// or 'custom:pts=5,reb=1.2,...'.
export function scoringHeaderValue(setting) {
  const preset = setting?.preset;
  if (!preset || preset === 'fanduel') return null;
  if (preset !== 'custom') return preset;
  const weights = setting.weights || {};
  const parts = SCORING_STATS
    .filter(({ key }) => weights[key] !== '' && weights[key] !== null && Number.isFinite(Number(weights[key])))
    .map(({ key }) => `${key}=${Number(weights[key])}`);
  return `custom:${parts.join(',')}`;
}

// 'PTS + 1.2 REB + 1.5 AST + 3 STL + 3 BLK − TOV' from a weights object; zero weights are left out.
export function scoringFormula(weights) {
  const terms = SCORING_STATS
    .map(({ key, label }) => ({ label, weight: Number(weights?.[key]) || 0 }))
    .filter(({ weight }) => weight !== 0);
  if (!terms.length) return '0';
  return terms.map(({ label, weight }, index) => {
    const size = Math.abs(weight);
    const term = size === 1 ? label : `${size} ${label}`;
    if (index === 0) return weight < 0 ? `−${term}` : term;
    return `${weight < 0 ? '−' : '+'} ${term}`;
  }).join(' ');
}

// Tooltip for an FPTS column under the user's scoring; FanDuel's when they have none.
export function fptsTitle(setting) {
  if (!setting?.weights || !setting.label) return FPTS_TITLE;
  return `${setting.label} fantasy points: ${scoringFormula(setting.weights)}`;
}

const toFinite = value => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

// Last season -> projected FPTS from a raw model row (FANTASY_LAST, PREDICTED_FANTASY), with the
// relative change the other spotlight rows show. Null for rows without fantasy points, such as
// the page's built-in fallback players.
export function getFantasyComparison(row) {
  const last = toFinite(row?.FANTASY_LAST);
  const predicted = toFinite(row?.PREDICTED_FANTASY);
  if (last === null || predicted === null) return null;
  return { last, predicted, change: last ? ((predicted - last) / last) * 100 : 0 };
}
