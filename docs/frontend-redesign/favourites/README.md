# Favourites

`/favourites`

## Review images

Mockups are pending design direction review. The screenshots below show the existing frontend.

## Existing screen references

- [Desktop viewport](existing/desktop.png) · `Screenshots/Signed-in interactions/desktop/favourites-populated.png`
- [Mobile viewport](existing/mobile.png) · `Screenshots/Signed-in interactions/mobile/favourites-populated.png`

## Existing UI brief

- Saved Favourites title, explanatory copy, and summary of saved count, team count, average PPG and top scorer. Each card shows name/team/position/age, PPG/APG/RPG, available SPG/BPG/FG%/3P%/FT%/FPTS/GP, height/weight if provided, and available consistency/PPG/APG/RPG trends. Visible content includes remove control and Full profile. Saved players from Stats and Predictions can have different optional fields.
- Visible content includes loading, guest gate with Log In/Create Account, empty with Go to Stats, populated, remove behaviour including last item removed, and player modal.

## Frontend entry points

- Page and styles · [Favourites.jsx](../../../frontend/src/pages/Favourites.jsx) · [Favourites.css](../../../frontend/src/pages/Favourites.css)
- Shared components · [PageHero.jsx](../../../frontend/src/components/PageHero.jsx) · [PlayerCard.jsx](../../../frontend/src/components/PlayerCard.jsx) · [PlayerStatsModal.jsx](../../../frontend/src/components/PlayerStatsModal.jsx)
- Related frontend tests · [favourites-card.test.mjs](../../../frontend/tests/favourites-card.test.mjs) · [player-card.test.mjs](../../../frontend/tests/player-card.test.mjs)

## State coverage

Filter [archive-crosswalk.csv](../archive-crosswalk.csv) by mockup IDs beginning with `P12-`. See [Favourites in the mockup checklist](../mockup-checklist.md#p12--favourites) for the planned redesign frames.
