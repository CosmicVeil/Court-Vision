# Breakout Recommendations

`/recommendations`

## Review images

Mockups are pending design direction review. The screenshots below show the existing frontend.

## Existing screen references

- [Desktop viewport](existing/desktop.png) · `Screenshots/Signed in/desktop/season-recommendations.png`
- [Mobile viewport](existing/mobile.png) · `Screenshots/Signed in/mobile/season-recommendations.png`

## Existing UI brief

- Season/Next game tabs, title, explanation and breakout spotlight. Spotlight cards show stat category/role, player/team/position, percentage breakout, actual and predicted PPG/APG/RPG/FPTS and percentage growth, plus season-so-far PPG/RPG/APG/FPTS/GP and Full projection. Four spotlight groups use PPG, APG, RPG and fantasy. Visible content includes loading, signed-in data, missing fantasy/fallback data and guest gate with login/create actions.
- Basketball Insights & Trends shows Rising Stars, Bucket Getters, Assist Leaders, Rebound Leaders and Fantasy Risers. Each needs category, title, summary, detail and Explore More linking to its stat-specific chart. Visible content includes the interactive state of a spotlight card and open player modal.

## Frontend entry points

- Page and styles · [Recommendations.jsx](../../../frontend/src/pages/Recommendations.jsx) · [Recommendations.css](../../../frontend/src/pages/Recommendations.css)
- Shared components · `frontend/src/components/PredictionModeToggle.jsx` (local checkout at capture) · [TiltCard.jsx](../../../frontend/src/components/TiltCard.jsx) · [PlayerStatsModal.jsx](../../../frontend/src/components/PlayerStatsModal.jsx)
- Related frontend tests · [recommendations-cards.test.mjs](../../../frontend/tests/recommendations-cards.test.mjs) · [season-so-far.test.mjs](../../../frontend/tests/season-so-far.test.mjs)

## State coverage

Filter [archive-crosswalk.csv](../archive-crosswalk.csv) by mockup IDs beginning with `P09-`. See [Breakout Recommendations in the mockup checklist](../mockup-checklist.md#p09--breakout-recommendations) for the planned redesign frames.
