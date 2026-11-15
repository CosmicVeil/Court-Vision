# Next-Game Picks

`/recommendations/games`

## Review images

[Light and dark redesign board](mockups/light-dark.png) · Points picks on desktop and mobile.

## Existing screen references

- [Desktop viewport](existing/desktop.png) · `Screenshots/Signed-in interactions/desktop/game-recommendations-pts.png`
- [Mobile viewport](existing/mobile.png) · `Screenshots/Signed-in interactions/mobile/game-recommendations-pts.png`

## Existing UI brief

- Season/Next game tabs, next-game title, dated slate explanation and stale notice when applicable. Guest gate has Log In/Create Account. Existing states or controls include loading, failed or unavailable slate (same surface in source) and empty groups.
- Visible content includes PTS, REB, AST, 3PM, PRA and FPTS selected examples. Below the stat controls are Due for a big night (above last-10 average), Top projected lines (slate leaders), Fade watch (below average). Each group shows its name and criterion, unit, rank, player action, team/opponent and venue marker, ET tipoff, injury status, projection, last-10 average and signed difference. Existing states or controls include the footnote defining average, minutes cutoff and injury filtering. Player name opens details.

## Frontend entry points

- Page and styles · `frontend/src/pages/GameRecommendations.jsx` (local checkout at capture) · [Recommendations.css](../../../frontend/src/pages/Recommendations.css) · `frontend/src/pages/GameRecommendations.css` (local checkout at capture)
- Shared components · `frontend/src/components/PredictionModeToggle.jsx` (local checkout at capture) · `frontend/src/components/GameMatchup.jsx` (local checkout at capture) · `frontend/src/components/StaleSlateNotice.jsx` (local checkout at capture) · [PillNav.jsx](../../../frontend/src/components/PillNav.jsx) · [PlayerStatsModal.jsx](../../../frontend/src/components/PlayerStatsModal.jsx)
- Related frontend tests · `frontend/tests/game-predictions.test.mjs` (local checkout at capture) · [recommendations-cards.test.mjs](../../../frontend/tests/recommendations-cards.test.mjs)

## State coverage

Filter [archive-crosswalk.csv](../archive-crosswalk.csv) by mockup IDs beginning with `P10-`. See [Next-Game Picks in the mockup checklist](../mockup-checklist.md#p10--next-game-picks) for the planned redesign frames.
