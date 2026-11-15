# NBA Games

`/games`

## Review images

[Light and dark redesign board](mockups/light-dark.png) · Games slate on desktop and mobile.

## Existing screen references

- [Desktop viewport](existing/desktop.png) · `Screenshots/Signed out/desktop/games.png`
- [Mobile viewport](existing/mobile.png) · `Screenshots/Signed out/mobile/games.png`
- [Live slate · desktop](existing/live-slate-desktop.png) · `Screenshots/Controlled API states/desktop/games-live-slate.png`
- [Live slate · mobile](existing/live-slate-mobile.png) · `Screenshots/Controlled API states/mobile/games-live-slate.png`

## Existing UI brief

- The heading area contains title, subtitle, Live now, Today, Upcoming and Last sync, manual Refresh and floating matchup links. Tabs below it are Today’s Slate, Upcoming Games and Past Games, with counts when available. Ticker entries show matchup and status/time or score, link to game and indicate live games.
- Each card shows status/date/time, live period and clock, away/home mark, code and record, score or pre-tip dash, winner/leader styling, arena, and an action to open the box score or game. Visible content includes mixed live/scheduled/final, a score update, and scheduled-only. Upcoming and Past show pagination. Each tab has its own loading and empty panels. Today’s empty panel offers View Upcoming Schedule.
- Scrolled state shows the floating sync dock with Live count, Next sync progress and manual refresh. The dock refresh control spins while manually triggered.

## Frontend entry points

- Page and styles · [LiveGames.jsx](../../../frontend/src/pages/LiveGames.jsx) · [LiveGames.css](../../../frontend/src/pages/LiveGames.css)
- Shared components · [GameBoxScore.jsx](../../../frontend/src/components/GameBoxScore.jsx) · [HeroOrbit.jsx](../../../frontend/src/components/HeroOrbit.jsx) · [LiveTicker.jsx](../../../frontend/src/components/LiveTicker.jsx) · [SyncDock.jsx](../../../frontend/src/components/SyncDock.jsx) · [PillNav.jsx](../../../frontend/src/components/PillNav.jsx) · [Pagination.jsx](../../../frontend/src/components/Pagination.jsx)
- Related frontend tests · [live-games-interactions.test.mjs](../../../frontend/tests/live-games-interactions.test.mjs) · [live-games-stats.test.mjs](../../../frontend/tests/live-games-stats.test.mjs) · [upcoming-games-pagination.test.mjs](../../../frontend/tests/upcoming-games-pagination.test.mjs)

## State coverage

Filter [archive-crosswalk.csv](../archive-crosswalk.csv) by mockup IDs beginning with `P06-`. See [NBA Games in the mockup checklist](../mockup-checklist.md#p06--nba-games) for the planned redesign frames.
