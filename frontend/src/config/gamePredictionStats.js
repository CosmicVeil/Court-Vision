// Stats the per-game model predicts (backend app/ml/game_features.py TARGETS), plus the two the
// API derives from them. Each row in /api/game-predictions has predicted_<key>, last10_<key>
// (the player's average over his previous 10 games) and diff_<key> (predicted minus that average).
export const GAME_PREDICTION_STATS = [
  { key: 'pts', unit: 'PTS', label: 'Points' },
  { key: 'reb', unit: 'REB', label: 'Rebounds' },
  { key: 'ast', unit: 'AST', label: 'Assists' },
  { key: 'fg3m', unit: '3PM', label: 'Threes made' },
  { key: 'stl', unit: 'STL', label: 'Steals' },
  { key: 'blk', unit: 'BLK', label: 'Blocks' },
  { key: 'tov', unit: 'TOV', label: 'Turnovers' },
  { key: 'minutes', unit: 'MIN', label: 'Minutes' },
  // derived: computed by the API from the model's numbers (fantasy uses the Profile scoring preset).
  { key: 'pra', unit: 'PRA', label: 'Points + rebounds + assists', derived: true },
  { key: 'fantasy', unit: 'FPTS', label: 'Fantasy points', derived: true },
];

// Recommendation tabs, in the order the backend ranks them (RECOMMENDATION_STATS).
export const GAME_PICK_STATS = ['pts', 'reb', 'ast', 'fg3m', 'pra', 'fantasy'];

// The three pick lists the backend returns (RECOMMENDATION_KINDS).
export const GAME_PICK_KINDS = [
  {
    id: 'over',
    title: 'Due for a big night',
    role: 'Above average',
    description: 'Projected furthest above their own last-10-game average.',
  },
  {
    id: 'top',
    title: 'Top projected lines',
    role: 'Slate leader',
    description: 'The biggest raw projections on the slate.',
  },
  {
    id: 'fade',
    title: 'Fade watch',
    role: 'Below average',
    description: 'Projected furthest below their last-10-game average: tough matchup or fewer minutes.',
  },
];

// The popup's Game projections tab (PlayerPredictionGrid groups): the model's own stats, then derived ones.
export const GAME_PREDICTION_GROUPS = [
  { id: 'game-production', label: 'Box Score', stats: GAME_PREDICTION_STATS.filter(stat => !stat.derived) },
  { id: 'game-derived', label: 'Combined', stats: GAME_PREDICTION_STATS.filter(stat => stat.derived) },
];

export const gameStat = key => GAME_PREDICTION_STATS.find(stat => stat.key === key);
