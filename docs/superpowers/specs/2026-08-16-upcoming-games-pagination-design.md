# Upcoming Games Pagination Design

## Goal

Paginate the Upcoming Games tab with the same Previous/Page/Next pattern used by the Predictions page. The frontend will consume the backend's existing paginated response instead of treating the returned games as the complete schedule.

## Backend contract

`GET /api/games/upcoming?page=<number>` returns:

```json
{
  "games": [],
  "count": 82,
  "total_pages": 9,
  "page": 1
}
```

The backend fixes the page size at 10 games. The frontend will use `count` for the total-game badge and range label, `total_pages` for navigation boundaries, and `page` as the confirmed current page.

## Frontend behavior

`LiveGames.jsx` will track the current upcoming-games page, total pages, total games, and page-loading state. Each initial load, page change, manual refresh, and 30-second refresh will request the selected page with `games/upcoming?page=N`.

The Today's Slate tab will retain its current behavior. Switching tabs will preserve the selected upcoming page for the current visit.

The Upcoming Games tab will:

- show the total game count in its badge;
- render only the games returned for the selected page;
- show Previous and Next buttons around a `Page X of Y` label;
- show `Showing X-Y of Z games` beneath the page label;
- disable Previous on page 1, Next on the last page, and both controls while a page request is running.

If the backend returns no games, the existing empty state remains. If a later page becomes invalid because the schedule shrinks, the frontend will move to the last available page.

## Styling

`LiveGames.css` will add page-specific pagination classes that match the Predictions page's obsidian, ember-orange, pill-button treatment. Page-specific class names will prevent global CSS collisions. On narrow screens, the controls will stack or tighten so they stay within the viewport.

## Testing and verification

A Node regression test will check the request's `page` query parameter, the response metadata state, the total-count badge, the Previous/Next controls, and the displayed range. Verification will run the frontend tests, ESLint, and the production build.

## Scope

This change will not alter the backend pagination contract, add numbered page buttons, sync pagination to the browser URL, or refactor the game cards and player modal.
