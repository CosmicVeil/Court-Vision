# Home

`/`

## Review images

Mockups are pending design direction review. The screenshots below show the existing frontend.

## Existing screen references

- [Desktop viewport](existing/desktop.png) · `Screenshots/Signed out/desktop/home.png`
- [Mobile viewport](existing/mobile.png) · `Screenshots/Signed out/mobile/home.png`

## Existing UI brief

- The opening shows a full-width animated basketball court, centered COURT VISION title, platform summary, Explore Stats and Get Recommendations. The court and lettering change through the captured scroll stages before the player search section. The closing call to action contains Start Analyzing for both audiences and Create Free Account for guests.
- Player search shows title, guidance, name input, searching indicator, clear action, suggestion list with name, position, optional age and team, and no-match feedback with the query. Select a result to open Player Details.
- Trending includes live/upcoming/final cards with status, away and home logos/codes, quarter/clock or tipoff, scores or upcoming placeholders, venue when provided, winner/leader emphasis and Watch Live/View Boxscore/View Details linking to Games. Weekly best PRA adds player, team, position, opponent, game date, live status, PTS, REB, AST, PRA and Full Stats. Visible content includes loading and the empty state with View Game Schedule.
- How It Works has three steps covering account creation, exploration and recommendations. Projected Leaders shows six selectable groups (scorers, assists, rebounds, steals, blocks, breakout). Cards show name/team/position/age, selected lead stat plus production metrics, projected values and change vs season so far, FG%/3P%/FT% so far and Full projection. The section has loading, error and category-specific empty states.
- Model report card shows season, scoring accuracy edge, baseline, player count, minimum GP, as-of date, average misses by stat, and closest calls with player/context and projected versus actual comparison. The report card is omitted when the snapshot fails its quality threshold.
- Next Game Projections preview has slate date, game count, points accuracy edge vs last-10 baseline when available, four player cards with position, matchup, tipoff, injury treatment and PTS/REB/AST/FPTS plus last-10 change. Each opens Player stats. Both All Next-Game Predictions and Next-Game Picks remain accessible even when the preview has no valid slate.

## Frontend entry points

- Page and styles · [Home.jsx](../../../frontend/src/pages/Home.jsx) · [Home.css](../../../frontend/src/pages/Home.css)
- Shared components · [AIPredictions.jsx](../../../frontend/src/components/AIPredictions.jsx) · `frontend/src/components/NextGamePreview.jsx` (local checkout at capture) · [PlayerStatsModal.jsx](../../../frontend/src/components/PlayerStatsModal.jsx) · [ScrollReveal.jsx](../../../frontend/src/components/ScrollReveal.jsx) · [BackToTop.jsx](../../../frontend/src/components/BackToTop.jsx)
- Related frontend tests · [home-refresh.test.mjs](../../../frontend/tests/home-refresh.test.mjs) · [prediction-accuracy.test.mjs](../../../frontend/tests/prediction-accuracy.test.mjs) · [weekly-pra-card.test.mjs](../../../frontend/tests/weekly-pra-card.test.mjs) · [auth-cta.test.mjs](../../../frontend/tests/auth-cta.test.mjs)

## State coverage

Filter [archive-crosswalk.csv](../archive-crosswalk.csv) by mockup IDs beginning with `P02-`. See [Home in the mockup checklist](../mockup-checklist.md#p02--home) for the planned redesign frames.
