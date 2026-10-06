export const STATUS_SCHEDULED = 1;
export const STATUS_LIVE = 2;
export const STATUS_FINAL = 3;
export const LIVE_GAMES_REFRESH_MS = 30000;

export const getGameDetailPath = (id) => `/games/${encodeURIComponent(id)}`;
export const buildGameDetailEndpoint = (id) => `games/${encodeURIComponent(id)}`;

export function formatGameTime(gameTime) {
  if (!gameTime) return '';
  const date = new Date(gameTime);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
