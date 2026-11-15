# Standings

`/standings`

## Review images

[Light and dark redesign board](mockups/light-dark.png) · League standings on desktop and mobile.

## Existing screen references

- [Desktop viewport](existing/desktop.png) · `Screenshots/More page states/desktop/standings-2026-27.png`
- [Mobile viewport](existing/mobile.png) · `Screenshots/Signed out/mobile/standings.png`

## Existing UI brief

- Summary shows teams, selected season, East/West counts. Season selector covers all 34 captured seasons. Visible content includes source (NBA Stats or ESPN) and Updating. Two labeled conference tables show rank, linked team mark/name, W, L, PCT, GB, Home, Away, Streak and L10, with active sort and direction. The archive contains current, historical, loading and error states. Historical seasons and reordered teams use the same grid.

## Frontend entry points

- Page and styles · [Standings.jsx](../../../frontend/src/pages/Standings.jsx) · [Standings.css](../../../frontend/src/pages/Standings.css)
- Shared components · [PageHero.jsx](../../../frontend/src/components/PageHero.jsx)
- Related frontend tests · [frontend-polish.test.mjs](../../../frontend/tests/frontend-polish.test.mjs) · [team-page.test.mjs](../../../frontend/tests/team-page.test.mjs)

## State coverage

Filter [archive-crosswalk.csv](../archive-crosswalk.csv) by mockup IDs beginning with `P04-`. See [Standings in the mockup checklist](../mockup-checklist.md#p04--standings) for the planned redesign frames.
