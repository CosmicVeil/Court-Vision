# Season Predictions

`/predictions`

## Review images

Mockups are pending design direction review. The screenshots below show the existing frontend.

## Existing screen references

- [Desktop viewport](existing/desktop.png) · `Screenshots/Signed out/desktop/season-predictions-preview.png`
- [Mobile viewport](existing/mobile.png) · `Screenshots/Signed out/mobile/season-predictions-preview.png`

## Existing UI brief

- Season/Next game tabs, season model title and explanation, players, stats forecast count, sort and page. Search, Team, Position, Clear filters, Name or predicted PPG/APG/RPG/SPG/BPG/TOV/MPG/FG%/3P%/FT%/FPTS and direction including A–Z. Existing states or controls include result count/updating.
- Cards show name/team/position/age, PPG/APG/RPG/FPTS projected and change vs season so far, season FG%/3P%/FT%, season-to-date GP/PPG/RPG/APG, favourite toggle and Full projection. Missing data uses the source placeholders. Full details use the shared modal.
- Existing states or controls include signed-in pager, top-12 guest preview with Log In/Create Account, expired session with the same actions, loading, error, no results, fantasy sort/team filter and favourite authentication prompt.

## Frontend entry points

- Page and styles · [Predictions.jsx](../../../frontend/src/pages/Predictions.jsx) · [Predictions.css](../../../frontend/src/pages/Predictions.css)
- Shared components · `frontend/src/components/PredictionModeToggle.jsx` (local checkout at capture) · [FilterBar.jsx](../../../frontend/src/components/FilterBar.jsx) · [Pagination.jsx](../../../frontend/src/components/Pagination.jsx) · [PlayerCard.jsx](../../../frontend/src/components/PlayerCard.jsx) · [PlayerStatsModal.jsx](../../../frontend/src/components/PlayerStatsModal.jsx)
- Related frontend tests · [expanded-predictions.test.mjs](../../../frontend/tests/expanded-predictions.test.mjs) · [prediction-card-favourites.test.mjs](../../../frontend/tests/prediction-card-favourites.test.mjs) · [season-so-far.test.mjs](../../../frontend/tests/season-so-far.test.mjs) · [list-query.test.mjs](../../../frontend/tests/list-query.test.mjs)

## State coverage

Filter [archive-crosswalk.csv](../archive-crosswalk.csv) by mockup IDs beginning with `P08-`. See [Season Predictions in the mockup checklist](../mockup-checklist.md#p08--season-predictions) for the planned redesign frames.
