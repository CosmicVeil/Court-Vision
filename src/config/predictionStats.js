export const PREDICTION_GROUPS = [
  {
    id: 'production',
    label: 'Per Game Production',
    stats: [
      { key: 'ppg', label: 'Points Per Game', unit: 'PPG', changeUnit: '%', currentField: 'ppg_last', predictedField: 'predicted_ppg' },
      { key: 'apg', label: 'Assists Per Game', unit: 'APG', changeUnit: '%', currentField: 'apg_last', predictedField: 'predicted_apg' },
      { key: 'rpg', label: 'Rebounds Per Game', unit: 'RPG', changeUnit: '%', currentField: 'rpg_last', predictedField: 'predicted_rpg' },
      { key: 'spg', label: 'Steals Per Game', unit: 'SPG', changeUnit: '%', currentField: 'spg_last', predictedField: 'predicted_spg' },
      { key: 'bpg', label: 'Blocks Per Game', unit: 'BPG', changeUnit: '%', currentField: 'bpg_last', predictedField: 'predicted_bpg' },
      { key: 'tov', label: 'Turnovers Per Game', unit: 'TOV', changeUnit: '%', currentField: 'tov_last', predictedField: 'predicted_tov' },
      { key: 'mpg', label: 'Minutes Per Game', unit: 'MPG', changeUnit: '%', currentField: 'mpg_last', predictedField: 'predicted_mpg' },
    ],
  },
  {
    id: 'shooting',
    label: 'Shooting Efficiency',
    stats: [
      { key: 'fg_pct', label: 'Field Goal Percentage', unit: 'FG%', changeUnit: 'pp', currentField: 'fg_pct_last', predictedField: 'predicted_fg_pct' },
      { key: 'fg3_pct', label: 'Three-Point Percentage', unit: '3P%', changeUnit: 'pp', currentField: 'fg3_pct_last', predictedField: 'predicted_fg3_pct' },
      { key: 'ft_pct', label: 'Free Throw Percentage', unit: 'FT%', changeUnit: 'pp', currentField: 'ft_pct_last', predictedField: 'predicted_ft_pct' },
    ],
  },
];

export const PREDICTION_STATS = PREDICTION_GROUPS.flatMap((group) => group.stats);

export const calculatePredictionChange = (currentValue, predictedValue, changeUnit) => {
  const current = Number(currentValue) || 0;
  const predicted = Number(predictedValue) || 0;
  if (changeUnit === 'pp') return predicted - current;
  return current === 0 ? 0 : ((predicted - current) / current) * 100;
};

export const toPredictionPageStats = (player) => {
  const currentStats = {};
  const predictionStats = {};
  const improvements = {};

  for (const stat of PREDICTION_STATS) {
    currentStats[stat.key] = Number(player?.[stat.currentField]) || 0;
    predictionStats[stat.key] = Number(player?.[stat.predictedField]) || 0;
    improvements[stat.key] = calculatePredictionChange(
      currentStats[stat.key],
      predictionStats[stat.key],
      stat.changeUnit,
    );
  }

  return { currentStats, predictionStats, improvements };
};
