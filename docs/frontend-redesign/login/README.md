# Login

`/login`

## Review images

[Light and dark redesign board](mockups/light-dark.png) · Sign-in form on desktop and mobile.

## Existing screen references

- [Desktop viewport](existing/desktop.png) · `Screenshots/Signed out/desktop/login.png`
- [Mobile viewport](existing/mobile.png) · `Screenshots/Signed out/mobile/login.png`

## Existing UI brief

- Heading, short access description, labeled email and masked password, Login, Create Account and Back to Home. Visible content includes default, filled, submitting with busy label, invalid credentials/network error and browser-required-field feedback. Existing states or controls include the signed-in header variant seen in archive. Successful login lands on originating page when supplied, with Next-Game Picks as a captured return example.

## Frontend entry points

- Page and styles · [Login.jsx](../../../frontend/src/pages/Login.jsx) · [Auth.css](../../../frontend/src/pages/Auth.css)
- Related frontend tests · [auth-cta.test.mjs](../../../frontend/tests/auth-cta.test.mjs) · [small-pages-refresh.test.mjs](../../../frontend/tests/small-pages-refresh.test.mjs)

## State coverage

Filter [archive-crosswalk.csv](../archive-crosswalk.csv) by mockup IDs beginning with `P13-`. See [Login in the mockup checklist](../mockup-checklist.md#p13--login) for the planned redesign frames.
