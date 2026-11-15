# Player Stats

`/stats`

## Review images

[Light and dark redesign board](mockups/light-dark.png) · Player stats table and filters on desktop and mobile.

## Existing screen references

- [Desktop viewport](existing/desktop.png) · `Screenshots/Signed out/desktop/stats.png`
- [Mobile viewport](existing/mobile.png) · `Screenshots/Signed out/mobile/stats.png`
- [Card view · desktop](existing/card-view-desktop.png) · `Screenshots/Public interactions/desktop/stats-card-view.png`
- [Card view · mobile](existing/card-view-mobile.png) · `Screenshots/Public interactions/mobile/stats-card-view.png`

## Existing UI brief

- Title and summary show players, season, sort and page. Filters are Search players, Team, Position, Season and Clear Filters. Visible content includes Table View/Card View, result count/updating, plus Name, Team, Position, PPG, APG, RPG, FG%, FPTS and Games quick sorts with direction. Table also sorts SPG, BPG, 3P% and FT%.
- Table includes name, team, position, age, PPG, APG, RPG, SPG, BPG, FG%, 3P%, FT%, FPTS, GP and Favourite. Rows open profiles. FPTS has a scoring formula tooltip. Card view contains the same stats, identity, Add Fav/Favorited and Full profile, plus consistency and PPG/APG/RPG trends with signs. The archive shows combined season/position/fantasy and team-filtered sorted cards.
- The archive includes loading, error, no search results, signed-in and guest views, pager positions and the favourite auth prompt. The table scrolls horizontally on narrow screens.

## Frontend entry points

- Page and styles · [Stats.jsx](../../../frontend/src/pages/Stats.jsx) · [Stats.css](../../../frontend/src/pages/Stats.css)
- Shared components · [FilterBar.jsx](../../../frontend/src/components/FilterBar.jsx) · [Pagination.jsx](../../../frontend/src/components/Pagination.jsx) · [PlayerCard.jsx](../../../frontend/src/components/PlayerCard.jsx) · [PlayerStatsModal.jsx](../../../frontend/src/components/PlayerStatsModal.jsx)
- Related frontend tests · [filter-bar-and-pagination.test.mjs](../../../frontend/tests/filter-bar-and-pagination.test.mjs) · [list-query.test.mjs](../../../frontend/tests/list-query.test.mjs) · [player-card.test.mjs](../../../frontend/tests/player-card.test.mjs)

## State coverage

Filter [archive-crosswalk.csv](../archive-crosswalk.csv) by mockup IDs beginning with `P03-`. See [Player Stats in the mockup checklist](../mockup-checklist.md#p03--player-stats) for the planned redesign frames.
