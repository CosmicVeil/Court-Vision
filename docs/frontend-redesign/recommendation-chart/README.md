# Recommendation chart

`/recommendations/:stat`

## Review images

Mockups are pending design direction review. The screenshots below show the existing frontend.

## Existing screen references

- [Desktop viewport](existing/desktop.png) · `Screenshots/Signed in/desktop/recommendation-chart-pra.png`
- [Mobile viewport](existing/mobile.png) · `Screenshots/Signed in/mobile/recommendation-chart-pra.png`

## Existing UI brief

- The chart headings are Scoring Outbreaks (PPG), Playmaking Visionaries (APG), Glass Dominators (RPG), All-Around Virtuosos (PRA) and Fantasy Risers (FPTS). Existing states or controls include Back to Radar, heading and stat description. Each ranked player card shows rank, team, player, age, position, signed projected growth, current value/bar and projected value/bar, and Full projection. When supplied outside the fantasy chart, show FPTS actual → projected, with current-season FPTS when available.
- Archived states include loading, empty, error, guest auth gate (Log In/Create Account) and player modal. An unrecognized stat uses the generic chart heading if data is returned. Empty and failed responses have their own displays.

## Frontend entry points

- Page and styles · [RecommendationChart.jsx](../../../frontend/src/pages/RecommendationChart.jsx) · [Recommendations.css](../../../frontend/src/pages/Recommendations.css)
- Shared components · [TiltCard.jsx](../../../frontend/src/components/TiltCard.jsx) · [PlayerStatsModal.jsx](../../../frontend/src/components/PlayerStatsModal.jsx)
- Related frontend tests · [recommendations-cards.test.mjs](../../../frontend/tests/recommendations-cards.test.mjs) · [fantasy.test.mjs](../../../frontend/tests/fantasy.test.mjs)

## State coverage

Filter [archive-crosswalk.csv](../archive-crosswalk.csv) by mockup IDs beginning with `P11-`. See [Recommendation chart in the mockup checklist](../mockup-checklist.md#p11--recommendation-chart) for the planned redesign frames.
