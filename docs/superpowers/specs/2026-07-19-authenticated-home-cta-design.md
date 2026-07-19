# Authenticated Homepage CTA Visibility

## Goal

Remove the final homepage account call-to-action when the visitor is already logged in.

## Design

`Home` already initializes `isLoggedIn` from the shared `isAuthenticated()` helper and updates that state during logout. The final `.cta-section` will render only when `isLoggedIn` is false.

Logged-out visitors will continue to see the complete “Ready to Elevate Your Basketball Experience?” section with its “Get Started” and “Create Account” links. Logged-in users will not receive that section in the DOM. Logging out will restore it through the existing state update.

The profile controls and earlier “How It Works” section remain unchanged.

## Testing

Add a focused regression test verifying that the final CTA is guarded by `!isLoggedIn` and its account links remain in the logged-out branch. Run the full Node test suite and production Vite build.

## Out of Scope

- Changing login, signup, or logout behavior.
- Hiding account-related copy in “How It Works.”
- Changing CTA styling or replacing it with logged-in content.
