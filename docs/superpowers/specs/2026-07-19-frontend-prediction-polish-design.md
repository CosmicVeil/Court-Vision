# Frontend Prediction Polish

## Goal

Make recommendation trends visually truthful, make the AI Predictions list easier to scan without reducing the detail available in each player's popup, and replace the current sorting UI with one clear professional control.

## Recommendation Trend Colors

Recommendation percentage changes will use their numeric sign to choose a visual state everywhere they appear. Positive and zero values will retain the existing green treatment. Negative values will use a red treatment and will not receive a leading plus sign.

This rule applies to:

- The featured player's breakout percentage badge.
- Each featured stat's percentage change.
- The projected-growth callout in the recommendation detail chart.

The underlying recommendation calculations and ranking behavior remain unchanged.

## AI Prediction List Cards

Each player card in the AI Predictions list will become a compact summary. It will show:

- Player name.
- Team, position, and age badges.
- Three predicted values: PPG, APG, and RPG.

The three values are predictions only; the list card will not show current-to-predicted comparisons. Clicking anywhere on the card will continue to open the existing player popup. The popup's Predictions tab will continue to show all ten model outputs, including shooting percentages, steals, blocks, turnovers, and minutes.

The list cards will read the existing prediction response fields directly, so this change requires no API or model changes.

## Alignment and Responsive Layout

The player name and the row of team, position, and age badges will be centered within each AI Predictions list card. Text inside all three badges will be centered horizontally and vertically.

The PPG, APG, and RPG values will use an equal three-column layout on normal card widths. Existing responsive behavior will be preserved, with spacing and sizing adjusted only where needed to keep the compact summary legible on narrow screens.

## Professional Sorting Control

Replace the current mixture of a separate Name button, predicted-metric dropdown, and order button with one cohesive sorting control. It will contain:

- A labeled “Sort by” dropdown with Name followed by every predicted metric.
- One adjacent direction button with a directional icon and descriptive text.

The direction copy will reflect the selected field. Numeric prediction metrics will use “Highest to Lowest” and “Lowest to Highest.” Name will use “A to Z” and “Z to A.” Selecting a different numeric metric will default to highest-to-lowest; selecting Name will default to A-to-Z. The direction button will reverse the current order without changing the selected field.

Both controls will share a compact container, consistent borders, hover and keyboard-focus states, and responsive sizing. On narrow screens, the group may expand to the available width while remaining a single visually related control. Every sort change will return the results to page 1 and continue using the existing backend `sort_by` and `sort_order` query parameters.

## Testing

Add focused frontend regression tests that verify:

- Negative recommendation changes receive a negative visual class and do not receive a plus sign.
- Positive recommendation changes retain the positive visual class and plus sign.
- AI Predictions list cards expose only the three main predicted stats while the popup still uses the full prediction grid.
- Player identity and badge alignment styles include centering rules.
- The unified sort field offers Name and all prediction metrics, assigns the correct default direction, and resets pagination.
- Direction labels adapt between numeric and alphabetical sorting while the existing API query values remain unchanged.

Run the complete frontend test suite and a production Vite build after implementation.

## Out of Scope

- Changing model inputs, retraining the model, or changing backend response shapes.
- Removing any metrics from the player popup.
- Changing recommendation calculations, ordering, or thresholds.
- Redesigning the popup itself.
- Changing backend sorting behavior or adding new sort fields.
