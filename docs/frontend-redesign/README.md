# CourtVision frontend redesign handoff

Start with the route below. Its folder contains the existing UI brief, representative desktop and mobile archive screenshots, the frontend entry points and related tests. The Next-Game Predictions folder also contains the four generated review images. The design direction and remaining mockups are pending review. Source paths marked “local checkout at capture” refer to features in the archived working tree. The linked files are available on the base branch.

- [Mockup checklist](mockup-checklist.md) maps screens and states to image coverage.
- [Archive crosswalk](archive-crosswalk.csv) maps 3,860 media records to checklist IDs. Paths are relative to the original `CourtVision UI Reference` folder, captured November 14, 2026 at `b3f6133` with local working-tree changes. This folder includes representative captures. The full archive includes alternate states, videos and catalog data.
- [Dark direction and motion notes](dark-direction.md) describe the proposed style. [Dark prompts](dark-imagegen-prompts.md) and [light prompts](light-imagegen-prompts.md) reproduce the concept inputs.
- [Current frontend design system](../../frontend/docs/design-system.md) documents the existing shared components and structural tokens.

## Design coverage by route

**Every route has old UI screenshots. Next-Game Predictions is the only route with new redesign mockups.** Its four concepts cover the signed-in first viewport and are awaiting design approval. See the [mockup checklist](mockup-checklist.md) for other states.

| Route | Page brief and source | Old UI screenshots | New redesign mockups |
| --- | --- | --- | --- |
| `/predictions/games` | [Next-Game Predictions](next-game-predictions/README.md) | [Desktop](next-game-predictions/existing/desktop.png) · [Mobile](next-game-predictions/existing/mobile.png) | **Concepts available** · [Dark desktop](next-game-predictions/mockups/dark-desktop.png) · [Dark mobile](next-game-predictions/mockups/dark-mobile.png) · [Light desktop](next-game-predictions/mockups/light-desktop.png) · [Light mobile](next-game-predictions/mockups/light-mobile.png) |
| `/` | [Home](home/README.md) | [Desktop](home/existing/desktop.png) · [Mobile](home/existing/mobile.png) | Pending · old UI references only |
| `/stats` | [Player Stats](player-stats/README.md) | [Desktop](player-stats/existing/desktop.png) · [Mobile](player-stats/existing/mobile.png) | Pending · old UI references only |
| `/standings` | [Standings](standings/README.md) | [Desktop](standings/existing/desktop.png) · [Mobile](standings/existing/mobile.png) | Pending · old UI references only |
| `/teams/:tricode` | [Team](team/README.md) | [Desktop](team/existing/desktop.png) · [Mobile](team/existing/mobile.png) | Pending · old UI references only |
| `/games` | [NBA Games](games/README.md) | [Desktop](games/existing/desktop.png) · [Mobile](games/existing/mobile.png) | Pending · old UI references only |
| `/games/:gameId` | [Game Detail](game-detail/README.md) | [Desktop](game-detail/existing/desktop.png) · [Mobile](game-detail/existing/mobile.png) | Pending · old UI references only |
| `/predictions` | [Season Predictions](season-predictions/README.md) | [Desktop](season-predictions/existing/desktop.png) · [Mobile](season-predictions/existing/mobile.png) | Pending · old UI references only |
| `/recommendations` | [Breakout Recommendations](breakout-recommendations/README.md) | [Desktop](breakout-recommendations/existing/desktop.png) · [Mobile](breakout-recommendations/existing/mobile.png) | Pending · old UI references only |
| `/recommendations/games` | [Next-Game Picks](next-game-picks/README.md) | [Desktop](next-game-picks/existing/desktop.png) · [Mobile](next-game-picks/existing/mobile.png) | Pending · old UI references only |
| `/recommendations/:stat` | [Recommendation chart](recommendation-chart/README.md) | [Desktop](recommendation-chart/existing/desktop.png) · [Mobile](recommendation-chart/existing/mobile.png) | Pending · old UI references only |
| `/favourites` | [Favourites](favourites/README.md) | [Desktop](favourites/existing/desktop.png) · [Mobile](favourites/existing/mobile.png) | Pending · old UI references only |
| `/login` | [Login](login/README.md) | [Desktop](login/existing/desktop.png) · [Mobile](login/existing/mobile.png) | Pending · old UI references only |
| `/create-account` | [Create Account](create-account/README.md) | [Desktop](create-account/existing/desktop.png) · [Mobile](create-account/existing/mobile.png) | Pending · old UI references only |
| `/profile` | [Profile & Scoring](profile-scoring/README.md) | [Desktop](profile-scoring/existing/desktop.png) · [Mobile](profile-scoring/existing/mobile.png) | Pending · old UI references only |
| `/contact` | [Contact](contact/README.md) | [Desktop](contact/existing/desktop.png) · [Mobile](contact/existing/mobile.png) | Pending · old UI references only |
| `/privacy` | [Privacy & Cookies](privacy/README.md) | [Desktop](privacy/existing/desktop.png) · [Mobile](privacy/existing/mobile.png) | Pending · old UI references only |
| `Unmatched route` | [404](not-found/README.md) | [Desktop](not-found/existing/desktop.png) · [Mobile](not-found/existing/mobile.png) | Pending · old UI references only |
| `All routes` | [Shared navigation and interaction](site-shell/README.md) | [Desktop](site-shell/existing/desktop.png) · [Mobile](site-shell/existing/mobile.png) | Pending · old UI references only |
| `Shared overlay` | [Player Details modal](player-details/README.md) | [Desktop](player-details/existing/desktop.png) · [Mobile](player-details/existing/mobile.png) | Pending · old UI references only |

## Existing visual baseline

The captured site uses near-black backgrounds, charcoal surfaces, white and orange uppercase headings, letter-spaced labels, rounded outlined cards, pill tabs, orange accents and occasional glows. Desktop pages typically use a centered display hero, summary strip, filter or tab controls, then the data. Mobile replaces the header links with a menu and wraps or stacks content. Wide stat tables have horizontally scrollable areas. Some cards animate on hover, scroll and data changes. The archive includes 1440 and 1100 desktop, 768 tablet and 390 and 320 phone widths.

## Using the handoff

1. Open the route folder and read its existing UI brief. Match that inventory to the screenshot and the linked React and CSS files.
2. Use the approved mockup for visual decisions once a direction is selected. Use the checklist and archive for loading, empty, authenticated, expired and responsive states. Treat the archived slate numbers as reference data.
3. Start shared visual changes in the shell, tokens or shared component when several routes use the same pattern. Check all affected routes after a shared change. Preserve routing, filter and sort behavior, keyboard and touch actions, auth return destinations and scoring semantics.
4. For implementation verification, run `npm test` and `npm run build` from `frontend/`. Review 1440 px desktop and 390 px phone with the route's key states. Check the 768 px tablet and 320 px phone widths when layout changes. Review the parallel source states for any control shown differently by a generated image.
5. Add approved mockups to their route folder and link them from the route README and the matching checklist entry. Record which viewport and state each image shows.
