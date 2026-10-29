export const UPCOMING_GAMES_PAGE_SIZE = 20;

const positiveInteger = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const buildUpcomingGamesEndpoint = (page) => (
  `games/upcoming?page=${positiveInteger(page)}`
);

export const normalizeUpcomingGamesPage = (payload = {}) => {
  const totalGames = Math.max(0, Number.parseInt(payload.count, 10) || 0);
  const totalPages = Math.max(1, positiveInteger(payload.total_pages));
  const page = Math.min(positiveInteger(payload.page), totalPages);

  return {
    games: Array.isArray(payload.games) ? payload.games : [],
    totalGames,
    totalPages,
    page,
  };
};
