# Next-Game Predictions

`/predictions/games`

## Review images

- Dark · [Desktop](mockups/dark-desktop.png) · [Mobile](mockups/dark-mobile.png)
- Light · [Desktop](mockups/light-desktop.png) · [Mobile](mockups/light-mobile.png)
- [Dark direction and motion notes](../dark-direction.md) · [Dark prompts](../dark-imagegen-prompts.md) · [Light prompts](../light-imagegen-prompts.md)

These images show the signed-in first viewport. The light phone renders a right arrow on the sort toggle. Avatar treatments vary across renders. The archived screenshot is the reference for the archived −1.7 FPTS change on the first card. Use the API-provided deltas when implementing.

## Existing screen references

- [Desktop viewport](existing/desktop.png) · `Screenshots/Signed in/desktop/game-predictions.png`
- [Mobile viewport](existing/mobile.png) · `Screenshots/Signed in/mobile/game-predictions.png`
- [Full desktop page with pager](existing/desktop-full.png) · `Screenshots/Signed in/desktop/game-predictions--full.png`
- [Guest preview · desktop](existing/preview-desktop.png) · `Screenshots/Signed out/desktop/game-predictions-preview--full.png`
- [Guest preview · mobile](existing/preview-mobile.png) · `Screenshots/Signed out/mobile/game-predictions-preview--full.png`
- [Stale slate · desktop](existing/stale-slate-desktop.png) · `Screenshots/Controlled API states/desktop/game-predictions-stale-slate.png`
- [Stale slate · mobile](existing/stale-slate-mobile.png) · `Screenshots/Controlled API states/mobile/game-predictions-stale-slate.png`

## Existing UI brief

Source is the November 14, 2026 archive and the CourtVision source. The signed-in desktop screenshot is 1440 × 900 and its full-page companion shows the cards and pager. Mobile is 390 × 844.

The old page uses a nearly black background, orange accents and a large centered uppercase white-and-orange heading. The desktop header has a Court Vision wordmark, Stats, Standings, Games, Predictions (selected), Recommendations, Favourites, Contact, Privacy and a CD account button. Mobile shows the wordmark, Menu and CD. Below the header, a glowing orange Next Game pill is selected alongside Season, followed by the “PER-GAME MODEL” eyebrow, “NEXT GAME PREDICTIONS” title and model explanation covering recent form, rest, the betting line, both teams’ form and injuries.

The centered summary shows “Sat, Nov 14” slate, 5 games, 127 players and “PTS ↓” sorting. It is one row on desktop and a 2×2 arrangement on mobile. Matchup buttons are horizontal on desktop and stack vertically on mobile. Each shows logos with codes as fallback, away @ home, ET start, optional spread and optional game total. Click again to deselect. The selected game limits Team choices and clears an incompatible team filter.

The five captured games are DEN @ NOP, 7:00 PM ET, DEN −10.5 and O/U 234.5. DAL @ CLE, 7:30 PM ET, CLE −3.5 and O/U 231.5. DET @ MIA, 8:00 PM ET, DET −5.5 and O/U 226.5. BKN @ MEM, 8:00 PM ET, MEM −5.5 and O/U 225.5. CHI @ MIN, 8:00 PM ET, no line displayed.

The bordered filter panel contains Search (“Search players…”), Team (“All Teams” initially) and Clear Filters. Clear resets the search, team and matchup. The next row has Sort by (“Predicted PTS” initially), a separate “↓ Highest to Lowest” direction button and the results status (“127 players”). Field options are Name, predicted PTS/REB/AST/3PM/STL/BLK/TOV/MIN/PRA/FPTS, and PTS/PRA/FPTS above average. Ascending is Lowest to Highest. Name uses A to Z or Z to A. Changing filters or sort resets pagination.

Player cards appear three across on desktop and in a single column on phone. Each shows player name, position, “Predicted · change vs last 10 games”, four emphasized boxes for PTS/REB/AST/FPTS, and six smaller boxes for 3PM/STL/BLK/TOV/MIN/PRA. Each box shows a projection and its signed difference from the last-10 average. Neutral difference is 0.0. Team/opponent logos, @ or vs, ET tipoff, conditional injury badge, and the Player stats action appear below. Selecting a player opens Player Details. Sorting by a secondary stat promotes it into the primary group.

Archived first cards, metric order PTS, REB, AST, FPTS, 3PM, STL, BLK, TOV, MIN, PRA. Each entry is projection followed by change.

- Giannis Antetokounmpo · F · MIA vs DET · 8:00 PM ET. 26.8 −0.3, 10.8 −2.2, 5.2 −0.1, 50.8 −1.7, 0.8 +0.2, 1.1 +0.4, 1.1 0.0, 3.4 −0.1, 33.9 +1.1, 42.8 −2.6.
- Cade Cunningham · G · DET @ MIA · 8:00 PM ET. 24.8 −0.5, 4.9 −0.4, 7.6 −0.3, 41.7 −6.3, 2.0 −0.1, 1.0 −0.6, 0.0 −0.9, 3.4 +0.4, 35.9 +1.3, 37.3 −1.2.
- Ty Jerome · G · MEM vs BKN · 8:00 PM ET. 24.7 +1.3, 3.2 +0.2, 5.0 −0.2, 36.3 +1.5, 2.1 −0.2, 1.0 +0.2, 0.0 −0.1, 2.7 0.0, 31.1 +0.6, 32.9 +1.3.

Signed-in pages contain up to 12 players. Page one shows Previous disabled, Page 1 of 11, Showing 1–12 of 127 players and Next. The guest preview replaces the pager with a lock message, Log In and Create Account. Expired sessions have a distinct reauthentication message. Other states include initial loading, Updating during requests, filtered and sorted results, no matches, API error, unavailable predictions, and stale slate. A stale notice appears above matchups and says that the dated slate has already played. The player dialog has its own Current Stats and Next Game states.

## Frontend entry points

- Page and styles · `frontend/src/pages/GamePredictions.jsx` (local checkout at capture) · [Predictions.css](../../../frontend/src/pages/Predictions.css) · `frontend/src/pages/GamePredictions.css` (local checkout at capture)
- Shared components · `frontend/src/components/GameMatchup.jsx` (local checkout at capture) · `frontend/src/components/PredictionModeToggle.jsx` (local checkout at capture) · `frontend/src/components/StaleSlateNotice.jsx` (local checkout at capture) · [FilterBar.jsx](../../../frontend/src/components/FilterBar.jsx) · [Pagination.jsx](../../../frontend/src/components/Pagination.jsx) · [PlayerCard.jsx](../../../frontend/src/components/PlayerCard.jsx) · [PlayerStatsModal.jsx](../../../frontend/src/components/PlayerStatsModal.jsx)
- Related frontend tests · `frontend/tests/game-predictions.test.mjs` (local checkout at capture) · [filter-bar-and-pagination.test.mjs](../../../frontend/tests/filter-bar-and-pagination.test.mjs) · [list-query.test.mjs](../../../frontend/tests/list-query.test.mjs)

The sort, page and filters flow through [useListQuery.js](../../../frontend/src/hooks/useListQuery.js). Projection labels and baseline comparison are in `frontend/src/config/gamePredictionStats.js` (local checkout at capture) and `frontend/src/utils/gamePredictions.js` (local checkout at capture).

## State coverage

Filter [archive-crosswalk.csv](../archive-crosswalk.csv) by mockup IDs beginning with `P01-`. See [Next-Game Predictions in the mockup checklist](../mockup-checklist.md#p01--next-game-predictions) for the planned redesign frames.
