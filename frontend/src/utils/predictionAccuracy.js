// The stats the home page advertises, in display order.
const HIGHLIGHT_STATS = [
  { key: 'ppg', label: 'PTS' },
  { key: 'rpg', label: 'REB' },
  { key: 'apg', label: 'AST' },
];

// What the home page shows from GET /api/predictions/accuracy, or null when there is nothing
// worth advertising (no snapshot yet, or the backend did not rate the season as good).
export function getAccuracyHighlights(payload) {
  const accuracy = payload?.accuracy;
  const headline = accuracy?.stats?.ppg;
  if (!accuracy?.good || !headline) return null;
  return {
    season: accuracy.season,
    asOf: accuracy.as_of,
    players: accuracy.players,
    minGames: accuracy.min_games,
    edgePct: headline.improvement_pct,
    // Only stats where the model beats the "same as last season" baseline are shown.
    stats: HIGHLIGHT_STATS
      .filter(({ key }) => accuracy.stats[key]?.improvement_pct > 0)
      .map(({ key, label }) => ({ key, label, miss: Number(accuracy.stats[key].mae).toFixed(1) })),
    // Players whose line the model got closest to, each as predicted vs actual per stat.
    bestCalls: (accuracy.best_calls || []).map(call => ({
      id: call.id,
      name: call.name,
      meta: [call.team, `${call.games} GP`].filter(Boolean).join(' · '),
      stats: HIGHLIGHT_STATS.filter(({ key }) => call.stats?.[key]).map(({ key, label }) => ({
        key,
        label,
        predicted: Number(call.stats[key].predicted).toFixed(1),
        actual: Number(call.stats[key].actual).toFixed(1),
      })),
    })),
  };
}
