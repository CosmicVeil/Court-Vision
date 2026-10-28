import { STATUS_LIVE } from './liveGames.js';

export function getLiveGamesStats({ todayGames, upcomingTotalGames, lastUpdated, loading, formatTime = date => date.toLocaleTimeString() }) {
  const games = Array.isArray(todayGames) ? todayGames : [];
  const upcoming = Number(upcomingTotalGames);
  return [
    { key: 'live', label: 'Live now', value: loading ? '—' : games.filter(game => Number(game.status) === STATUS_LIVE).length },
    { key: 'today', label: 'Today', value: loading ? '—' : games.length },
    { key: 'upcoming', label: 'Upcoming', value: loading ? '—' : Number.isFinite(upcoming) ? Math.max(0, Math.trunc(upcoming)) : 0 },
    { key: 'sync', label: 'Last sync', value: !loading && lastUpdated ? formatTime(lastUpdated) : '—' },
  ];
}
