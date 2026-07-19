# Prediction Card Shooting and Favourites Design

## Goal

Enhance each compact AI Predictions player card with the player's current-season shooting efficiency and the same text-based favourite interaction used on the Stats page. The prediction popup remains unchanged and continues to show the complete prediction set.

## Current-Season Shooting

Add a compact section below the three headline predicted stats (PPG, APG, and RPG) labeled `This Season Shooting`.

The section displays:

- `FG%` from `fg_pct_last`
- `3P%` from `fg3_pct_last`
- `FT%` from `ft_pct_last`

Each value is formatted to one decimal place with a percent sign. These are current-season inputs already returned by the predictions API, so this change does not alter the backend, prediction model, or training process.

## Favourite Interaction

Each prediction card includes a text button matching the Stats page language:

- `ADD FAV` when the player is not saved
- `FAVORITED` when the player is saved

The button uses the existing favourites and authentication utilities. Clicking it must not open the player prediction popup.

For authenticated users, clicking the button toggles the player in the existing `nba_favorites` local-storage collection and immediately updates the card state. For signed-out users, clicking it opens the same login/create-account prompt used by the Stats page.

The button will include accessible state information and keyboard behavior through native button semantics and an appropriate `aria-label`.

## Data Compatibility

Prediction API players use flat current-season fields, while the Favourites page expects current-season data in a nested `stats` object. Before saving a player from AI Predictions, normalize the player to the shared favourites shape:

```text
{
  id,
  name,
  team,
  position,
  age,
  stats: {
    ppg_last,
    apg_last,
    rpg_last,
    spg_last,
    bpg_last,
    tov_last,
    minutes,
    fg_pct_last,
    fg3_pct_last,
    ft_pct_last
  }
}
```

`mpg_last` from the prediction response maps to `stats.minutes`. Numeric values are normalized so the existing Favourites page can render a player added from either Stats or AI Predictions consistently.

## Layout and Styling

The existing centered player name, team, position, and age layout remains intact. The favourite action sits in the card header without overlapping longer player names. The shooting section visually separates current-season percentages from predicted counting stats while keeping all three percentages visible in one compact row.

The layout must remain readable at desktop and mobile widths without horizontal overflow. The saved and unsaved button states should be visually distinct and consistent with the existing CourtVision design language.

## Favourites Page Copy

Update the empty-state text on the Favourites page to mention that players can be added from either the Stats page or AI Predictions. The existing navigation action can continue to lead to Stats.

## Verification

Automated coverage will verify:

- all three current-season shooting fields and labels appear on prediction cards;
- percentage formatting uses one decimal place;
- the button uses `ADD FAV` and `FAVORITED` states;
- clicking the favourite button does not trigger the card popup;
- signed-out users receive the authentication prompt;
- saved prediction players use the nested `stats` shape expected by Favourites;
- the Favourites empty-state copy mentions AI Predictions;
- the production frontend build succeeds.

The completed UI will also be checked at desktop and mobile widths.

## Out of Scope

- Backend API changes
- Model input or output changes
- Model retraining
- Server-side favourite synchronization
- Changes to the detailed prediction popup
