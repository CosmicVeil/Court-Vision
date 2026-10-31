export const SO_FAR_LABEL = '2026-27 so far';

const SO_FAR_KEYS = ['ppg', 'rpg', 'apg'];

export function getSoFarStats(player) {
  return {
    label: `${SO_FAR_LABEL} · ${player.so_far_gp ?? '—'} GP`,
    stats: SO_FAR_KEYS.map(key => ({
      key,
      label: key.toUpperCase(),
      value: player[`so_far_${key}`] == null ? '—' : Number(player[`so_far_${key}`]).toFixed(1),
    })),
  };
}

export function formatSoFarLine(player) {
  if (SO_FAR_KEYS.every(key => player[`so_far_${key}`] == null)) return '—';
  const { stats } = getSoFarStats(player);
  return [...stats.map(stat => `${stat.value} ${stat.label}`), `${player.so_far_gp ?? '—'} GP`].join(' · ');
}
