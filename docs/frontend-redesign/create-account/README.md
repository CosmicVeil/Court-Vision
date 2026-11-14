# Create Account

`/create-account`

## Review images

Mockups are pending design direction review. The screenshots below show the existing frontend.

## Existing screen references

- [Desktop viewport](existing/desktop.png) · `Screenshots/Signed out/desktop/create-account.png`
- [Mobile viewport](existing/mobile.png) · `Screenshots/Signed out/mobile/create-account.png`

## Existing UI brief

- Heading, description, first name, last name, email, masked password and confirm password, Create Account, Log In and Back to Home. Visible content includes per-field required/malformed email/minimum six characters/mismatch errors, duplicate email or server form-level error, disabled/busy submit and successful return destination. Password fields mask their values.

## Frontend entry points

- Page and styles · [SignUp.jsx](../../../frontend/src/pages/SignUp.jsx) · [Auth.css](../../../frontend/src/pages/Auth.css)
- Related frontend tests · [auth-cta.test.mjs](../../../frontend/tests/auth-cta.test.mjs) · [small-pages-refresh.test.mjs](../../../frontend/tests/small-pages-refresh.test.mjs)

## State coverage

Filter [archive-crosswalk.csv](../archive-crosswalk.csv) by mockup IDs beginning with `P14-`. See [Create Account in the mockup checklist](../mockup-checklist.md#p14--create-account) for the planned redesign frames.
