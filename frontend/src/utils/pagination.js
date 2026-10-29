const toInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Everything the shared Pagination bar shows, from the page in the URL and the server's totals.
// The page is not clamped for display: a stale URL (page 99 of 6) says so, while Previous steps
// back into the real range and Next stays disabled. While loading, both buttons are disabled so a
// double click can't skip a page before the first one arrives.
export const getPaginationView = ({ page, totalPages, totalItems, pageSize, itemLabel = 'players', loading = false }) => {
  const safeTotalPages = Math.max(1, toInteger(totalPages, 1));
  const safePage = Math.max(1, toInteger(page, 1));
  const safeTotal = Math.max(0, toInteger(totalItems, 0));
  const size = Math.max(1, toInteger(pageSize, 1));
  const first = (safePage - 1) * size + 1;
  const inRange = safeTotal > 0 && first <= safeTotal;
  const start = inRange ? first : 0;
  const end = inRange ? Math.min(safePage * size, safeTotal) : 0;

  return {
    page: safePage,
    totalPages: safeTotalPages,
    previousDisabled: Boolean(loading) || safePage <= 1,
    nextDisabled: Boolean(loading) || safePage >= safeTotalPages,
    previousPage: Math.max(1, Math.min(safePage - 1, safeTotalPages)),
    nextPage: Math.min(safePage + 1, safeTotalPages),
    rangeLabel: `Showing ${start} - ${end} of ${safeTotal} ${itemLabel}`,
  };
};

// Filter options from the API arrive as plain strings ('LAL'); hand-written ones carry a label.
// Empty values are dropped: the "All ..." option already stands for "no filter".
export const toFilterOptions = (options = []) => (options || [])
  .map(option => (
    option !== null && typeof option === 'object' ?{ value: option.value, label: option.label } : { value: option, label: option }
  ))
  .filter(option => option.value !== '' && option.value != null);
