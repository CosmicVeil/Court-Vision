# Shared navigation and interaction

`All routes`

## Review images

Mockups are pending design direction review. The screenshots below show the existing frontend.

## Existing screen references

- [Desktop viewport](existing/desktop.png) · `Screenshots/Public interactions/desktop/account-menu.png`
- [Mobile viewport](existing/mobile.png) · `Screenshots/Public interactions/mobile/mobile-main-menu.png`

## Existing UI brief

**SH** Brand links home. Desktop navigation contains Stats, Standings, Games, Predictions, Recommendations, Favourites, Contact and Privacy. The header marks the active route, including nested routes. Phone uses Menu with open/closed states and all eight destinations. Account control uses a guest icon or initials. Guest menu offers Login and Create Account. Signed-in menu shows full name and email, Profile & Scoring, My Favourites, Recommendations and Log Out. Back to top appears after scrolling. The Games routes can also show a floating sync dock.

**Pagination** Previous, Next, current page and total pages, and displayed range out of total items. First and last states show the disabled edge action. Upcoming and Past also have pending page changes. Player filters and active sort/direction remain in place as pages change.

**Favourite gate** Overlay on the originating Stats or Season Predictions screen, with account-required title, benefit, Log In, Create Account and close action. Favourite controls offer Add Fav and Favorited states.

## Frontend entry points

- Routing and tokens · [App.jsx](../../../frontend/src/App.jsx) · [tokens.css](../../../frontend/src/styles/tokens.css)
- Shared components · [AppShell.jsx](../../../frontend/src/components/AppShell.jsx) · [SiteHeader.jsx](../../../frontend/src/components/SiteHeader.jsx) · [BackToTop.jsx](../../../frontend/src/components/BackToTop.jsx) · [PageHero.jsx](../../../frontend/src/components/PageHero.jsx) · [PillNav.jsx](../../../frontend/src/components/PillNav.jsx) · [FilterBar.jsx](../../../frontend/src/components/FilterBar.jsx) · [Pagination.jsx](../../../frontend/src/components/Pagination.jsx)
- Related frontend tests · [site-shell.test.mjs](../../../frontend/tests/site-shell.test.mjs) · [page-hero.test.mjs](../../../frontend/tests/page-hero.test.mjs) · [pill-nav.test.mjs](../../../frontend/tests/pill-nav.test.mjs) · [filter-bar-and-pagination.test.mjs](../../../frontend/tests/filter-bar-and-pagination.test.mjs)

## State coverage

Filter [archive-crosswalk.csv](../archive-crosswalk.csv) by mockup IDs beginning with `SH-`. See [Shared navigation and interaction in the mockup checklist](../mockup-checklist.md#sh--shared-navigation-and-interaction) for the planned redesign frames.
