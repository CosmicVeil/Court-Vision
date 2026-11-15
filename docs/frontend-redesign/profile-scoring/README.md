# Profile & Scoring

`/profile`

## Review images

[Light and dark redesign board](mockups/light-dark.png) · Scoring editor on desktop and mobile.

## Existing screen references

- [Desktop viewport](existing/desktop.png) · `Screenshots/Signed out/desktop/profile-locked.png`
- [Mobile viewport](existing/mobile.png) · `Screenshots/Signed out/mobile/profile-locked.png`
- [Signed-in scoring · desktop](existing/fanduel-default-desktop.png) · `Screenshots/Signed in/desktop/profile.png`
- [Signed-in scoring · mobile](existing/fanduel-default-mobile.png) · `Screenshots/Signed in/mobile/profile.png`

## Existing UI brief

- Visible content includes first/last name and email in header; scoring introduction and approximations. Preset radios show FanDuel default, DraftKings, ESPN Points, Yahoo High Score and Custom, plus any source “approx.” mark and the preset formula. Visible content includes six editable weights PTS, REB, AST, STL, BLK and TOV, edit-to-Custom behaviour, current FPTS formula and Save scoring.
- Existing states or controls include each selected preset, Custom editing, invalid/missing/out-of-range weight and disabled Save, saving, saved, save failed, first-load error and loading. Guest and expired views show explanatory text and Log In. The source shows the signed-in account identity.

## Frontend entry points

- Page and styles · [Profile.jsx](../../../frontend/src/pages/Profile.jsx) · [Profile.css](../../../frontend/src/pages/Profile.css)
- Shared components · [PageHero.jsx](../../../frontend/src/components/PageHero.jsx)
- Related frontend tests · [fantasy-scoring.test.mjs](../../../frontend/tests/fantasy-scoring.test.mjs) · [fantasy.test.mjs](../../../frontend/tests/fantasy.test.mjs)

## State coverage

Filter [archive-crosswalk.csv](../archive-crosswalk.csv) by mockup IDs beginning with `P15-`. See [Profile & Scoring in the mockup checklist](../mockup-checklist.md#p15--profile--scoring) for the planned redesign frames.
