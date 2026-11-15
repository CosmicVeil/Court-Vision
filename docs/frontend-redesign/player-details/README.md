# Player Details modal

`Shared overlay`

## Review images

[Light and dark redesign board](mockups/light-dark.png) · Player Details overlay on desktop and mobile.

## Existing screen references

- [Desktop viewport](existing/desktop.png) · `Screenshots/Public interactions/desktop/home-player-modal--current-stats.png`
- [Mobile viewport](existing/mobile.png) · `Screenshots/Public interactions/mobile/home-player-modal--current-stats.png`
- [Next Game tab · desktop](existing/next-game-populated-desktop.png) · `Screenshots/More page states/desktop/player-next-game-populated.png`
- [Next Game tab · mobile](existing/next-game-populated-mobile.png) · `Screenshots/More page states/mobile/player-next-game-populated.png`

## Existing UI brief

- Shared across entry points. Visible content includes loading, desktop overlay and a scrollable modal on narrow screens, close button and dimmed originating page. Escape/backdrop dismiss when ready. Identity includes headshot/fallback, name, team, position, age, injury badge, injury description, estimated return and optional note. The modal has five tabs and scrollable content.
- Current Stats includes PPG/APG/RPG/SPG/BPG, FG%/3PT%/FT% with tracks, GP and MPG. Game Log offers season picker/current marking. Visible content includes loading, unavailable/error and no games. Recent Form spans include Span, GP, MIN, PTS, REB, AST, STL, BLK, FG%, 3P%, FPTS. Full log includes count, Date, Team, Opponent, Result, MIN, PTS/REB/AST/STL/BLK/TOV, FG/3PT/FT made-attempted, +/− and FPTS, with PRE/POST/PLAY-IN labels where relevant. Visible content includes current/historical seasons and a horizontal reading frame.
- AI Predictions compares current to projected per-game PPG/APG/RPG/SPG/BPG/TOV/MPG, shooting FG%/3P%/FT% and FPTS, using percent and percentage-point change where applicable. Existing states or controls include populated, locked with Log In/Create a free account, and unavailable.
- Next Game shows slate date, team/opponent, tipoff, last-10 average → prediction and signed change for PTS, REB, AST, 3PM, STL, BLK, TOV, MIN, PRA and FPTS. Existing states or controls include separately loading, auth gate with return links, unavailable, stale and no eligible player projection.
- Career History table shows Season, In progress marker, GP, MIN, PPG, RPG, APG, SPG, BPG, FG%, 3P%, FT%. Existing states or controls include empty history and source-derived fallback identity when the player has no detailed record.

## Frontend entry points

- Current modal styles · [Home.css](../../../frontend/src/pages/Home.css) · [Stats.css](../../../frontend/src/pages/Stats.css)
- Shared components · [PlayerStatsModal.jsx](../../../frontend/src/components/PlayerStatsModal.jsx) · [PlayerHeadshot.jsx](../../../frontend/src/components/PlayerHeadshot.jsx) · [InjuryBadge.jsx](../../../frontend/src/components/InjuryBadge.jsx) · [PlayerGameLog.jsx](../../../frontend/src/components/PlayerGameLog.jsx) · `frontend/src/components/PlayerNextGame.jsx` (local checkout at capture) · [PlayerPredictionGrid.jsx](../../../frontend/src/components/PlayerPredictionGrid.jsx)
- Related frontend tests · [player-details.test.mjs](../../../frontend/tests/player-details.test.mjs) · [player-game-log.test.mjs](../../../frontend/tests/player-game-log.test.mjs) · [injury-status.test.mjs](../../../frontend/tests/injury-status.test.mjs) · `frontend/tests/game-predictions.test.mjs` (local checkout at capture) · [expanded-predictions.test.mjs](../../../frontend/tests/expanded-predictions.test.mjs)

## State coverage

Filter [archive-crosswalk.csv](../archive-crosswalk.csv) by mockup IDs beginning with `PM-`. See [Player Details modal in the mockup checklist](../mockup-checklist.md#pm--player-details-modal) for the planned redesign frames.
