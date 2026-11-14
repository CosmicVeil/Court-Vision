# Game Detail

`/games/:gameId`

## Review images

Mockups are pending design direction review. The screenshots below show the existing frontend.

## Existing screen references

- [Desktop viewport](existing/desktop.png) · `Screenshots/Game details/desktop/final-401909304.png`
- [Mobile viewport](existing/mobile.png) · `Screenshots/Game details/mobile/final-401909304.png`
- [Live game · desktop](existing/live-desktop.png) · `Screenshots/Controlled API states/desktop/game-detail-live.png`
- [Live game · mobile](existing/live-mobile.png) · `Screenshots/Controlled API states/mobile/game-detail-live.png`
- [Pregame · desktop](existing/scheduled-upcoming-desktop.png) · `Screenshots/Game details/desktop/upcoming-401909985.png`
- [Pregame · mobile](existing/scheduled-upcoming-mobile.png) · `Screenshots/Game details/mobile/upcoming-401909985.png`

## Existing UI brief

- Scoreboard shows All Games, start/status or live period/clock/final including overtime, away/home logo or tricode fallback, linked team, code, record, score or pre-tip placeholders, game margin and venue. Leaders show player/team/value with PTS/REB/AST/FPTS while live/final and season PPG/RPG/APG/FPTS before tipoff. Leaders open Player Details.
- Period by period appears during/after play. Visible content includes team legend, grouped quarter bars with values on hover/focus/tap, quarter/OT labels, and quarter table with team, Q1–Q4, OT columns where necessary, and total. Existing states or controls include score update and overtime.
- Box score has away/home team tabs with logos/full names, selected team’s roster link and sort toggles. Rows show player/position, MIN, PTS, REB, AST, STL, BLK. Live/final add FPTS, FG/3P/FT made-attempted and +/−; show on-court marker, column leaders, Starters/Bench, and unified sorted list. Pregame has season PPG/RPG/APG/FPTS and explanatory note; default roster ordering by PPG. Row opens player details. Existing states or controls include no-player-data state and tablet/phone horizontal table treatment.
- Sync dock for pregame/live shows status, next sync and refresh while scrolled. Existing states or controls include initial loading, not-found with Back to Games and API error with Try Again.

## Frontend entry points

- Page and styles · [LiveGameDetail.jsx](../../../frontend/src/pages/LiveGameDetail.jsx) · [LiveGames.css](../../../frontend/src/pages/LiveGames.css)
- Shared components · [GameScoreboard.jsx](../../../frontend/src/components/GameScoreboard.jsx) · [GameBoxScore.jsx](../../../frontend/src/components/GameBoxScore.jsx) · [SyncDock.jsx](../../../frontend/src/components/SyncDock.jsx) · [PlayerStatsModal.jsx](../../../frontend/src/components/PlayerStatsModal.jsx)
- Related frontend tests · [game-detail-route.test.mjs](../../../frontend/tests/game-detail-route.test.mjs) · [game-detail-design.test.mjs](../../../frontend/tests/game-detail-design.test.mjs) · [game-scoreboard.test.mjs](../../../frontend/tests/game-scoreboard.test.mjs)

## State coverage

Filter [archive-crosswalk.csv](../archive-crosswalk.csv) by mockup IDs beginning with `P07-`. See [Game Detail in the mockup checklist](../mockup-checklist.md#p07--game-detail) for the planned redesign frames.
