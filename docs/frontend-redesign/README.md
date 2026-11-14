# CourtVision frontend redesign handoff

Start with the route below. Its folder contains the existing UI brief, representative desktop and mobile archive screenshots, the frontend entry points and related tests. The Next-Game Predictions folder also contains the four generated review images. The design direction and remaining mockups are pending review. Source paths marked “local checkout at capture” refer to features in the archived working tree. The linked files are available on the base branch.

- [Mockup checklist](mockup-checklist.md) maps screens and states to image coverage.
- [Archive crosswalk](archive-crosswalk.csv) maps 3,860 media records to checklist IDs. Paths are relative to the original `CourtVision UI Reference` folder, captured November 14, 2026 at `b3f6133` with local working-tree changes. This folder includes representative captures. The full archive includes alternate states, videos and catalog data.
- [Dark direction and motion notes](dark-direction.md) describe the proposed style. [Dark prompts](dark-imagegen-prompts.md) and [light prompts](light-imagegen-prompts.md) reproduce the concept inputs.
- [Current frontend design system](../../frontend/docs/design-system.md) documents the existing shared components and structural tokens.

## Routes and shared UI

| Route | Brief, images and source | New mockups |
| --- | --- | --- |
| `/predictions/games` | [Next-Game Predictions](next-game-predictions/README.md) | Dark and light concepts |
| `/` | [Home](home/README.md) | Planned |
| `/stats` | [Player Stats](player-stats/README.md) | Planned |
| `/standings` | [Standings](standings/README.md) | Planned |
| `/teams/:tricode` | [Team](team/README.md) | Planned |
| `/games` | [NBA Games](games/README.md) | Planned |
| `/games/:gameId` | [Game Detail](game-detail/README.md) | Planned |
| `/predictions` | [Season Predictions](season-predictions/README.md) | Planned |
| `/recommendations` | [Breakout Recommendations](breakout-recommendations/README.md) | Planned |
| `/recommendations/games` | [Next-Game Picks](next-game-picks/README.md) | Planned |
| `/recommendations/:stat` | [Recommendation chart](recommendation-chart/README.md) | Planned |
| `/favourites` | [Favourites](favourites/README.md) | Planned |
| `/login` | [Login](login/README.md) | Planned |
| `/create-account` | [Create Account](create-account/README.md) | Planned |
| `/profile` | [Profile & Scoring](profile-scoring/README.md) | Planned |
| `/contact` | [Contact](contact/README.md) | Planned |
| `/privacy` | [Privacy & Cookies](privacy/README.md) | Planned |
| `Unmatched route` | [404](not-found/README.md) | Planned |
| `All routes` | [Shared navigation and interaction](site-shell/README.md) | Planned |
| `Shared overlay` | [Player Details modal](player-details/README.md) | Planned |

## Existing visual baseline

The captured site uses near-black backgrounds, charcoal surfaces, white and orange uppercase headings, letter-spaced labels, rounded outlined cards, pill tabs, orange accents and occasional glows. Desktop pages typically use a centered display hero, summary strip, filter or tab controls, then the data. Mobile replaces the header links with a menu and wraps or stacks content. Wide stat tables have horizontally scrollable areas. Some cards animate on hover, scroll and data changes. The archive includes 1440 and 1100 desktop, 768 tablet and 390 and 320 phone widths.

## Using the handoff

1. Open the route folder and read its existing UI brief. Match that inventory to the screenshot and the linked React and CSS files.
2. Use the approved mockup for visual decisions once a direction is selected. Use the checklist and archive for loading, empty, authenticated, expired and responsive states. Treat the archived slate numbers as reference data.
3. Start shared visual changes in the shell, tokens or shared component when several routes use the same pattern. Check all affected routes after a shared change. Preserve routing, filter and sort behavior, keyboard and touch actions, auth return destinations and scoring semantics.
4. For implementation verification, run `npm test` and `npm run build` from `frontend/`. Review 1440 px desktop and 390 px phone with the route's key states. Check the 768 px tablet and 320 px phone widths when layout changes. Review the parallel source states for any control shown differently by a generated image.
5. Add approved mockups to their route folder and link them from the route README and the matching checklist entry. Record which viewport and state each image shows.
