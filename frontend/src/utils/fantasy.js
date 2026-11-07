// FanDuel fantasy points arrive from the API already scored from unrounded stats (backend
// app/utils/fantasy.py), so the frontend only formats them; it never re-scores rounded values.
export const FPTS_TITLE = 'FanDuel fantasy points: PTS + 1.2 REB + 1.5 AST + 3 STL + 3 BLK − TOV';

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
