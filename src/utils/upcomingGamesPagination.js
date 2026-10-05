export const UPCOMING_GAMES_PAGE_SIZE = 10;

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

export const getUpcomingPaginationView = ({
  page,
  totalPages,
  totalGames,
  loading,
}) => {
  const safeTotalPages = Math.max(1, positiveInteger(totalPages));
  const safePage = Math.min(positiveInteger(page), safeTotalPages);
  const safeTotalGames = Math.max(0, Number.parseInt(totalGames, 10) || 0);
  const start = safeTotalGames === 0
    ? 0
    : ((safePage - 1) * UPCOMING_GAMES_PAGE_SIZE) + 1;
  const end = Math.min(safePage * UPCOMING_GAMES_PAGE_SIZE, safeTotalGames);

  return {
    previousDisabled: Boolean(loading) || safePage === 1,
    nextDisabled: Boolean(loading) || safePage === safeTotalPages,
    pageLabel: `Page ${safePage} of ${safeTotalPages}`,
    countLabel: `Showing ${start} - ${end} of ${safeTotalGames} games`,
  };
};
