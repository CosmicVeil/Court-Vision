# CourtVision design system

A structural system (tokens, layout anatomy, motion, interaction), adapted from the way marmy.dev is built.
It is **not** a new look: colors, fonts and the dark ember/obsidian visual language stay exactly as they are
(`--color-ember-orange`, `--bg-main`, `--font-heading`, `--font-mono` in `src/pages/Home.css`).

The system is built once, in shared files, and adopted page by page. Phase 1 adopts it on the Live Games page only.

## 1. Tokens (`src/styles/tokens.css`, imported once in `src/main.jsx`)

Structural tokens only. No new colors.

| Group | Tokens |
|---|---|
| Spacing | `--space: 0.25rem` base unit; use `calc(var(--space) * n)` (4px grid). |
| Type scale | `--text-xs .75rem`, `--text-sm .875rem`, `--text-base 1rem`, `--text-lg 1.25rem`, `--text-xl 1.5rem`, `--text-2xl 1.875rem`, `--text-display-sm 3rem`, `--text-display-md 4rem` |
| Display type | `--tracking-display: -0.025em`, `--leading-display: 1.1`, `--leading-snug: 1.25` |
| Radius | `--radius-sm .375rem`, `--radius-md .75rem`, `--radius-lg 1rem`, `--radius-xl 1.5rem` (keep existing `--radius-full`) |
| Motion | `--duration-fast .15s`, `--duration-base .25s`, `--duration-slow .4s`, `--duration-reveal .7s`, `--ease-brand cubic-bezier(.22, 1, .36, 1)` |
| Layout | `--container-page 90rem`, `--container-content 64rem`, `--gutter` 16px on phones, 24px from 768px up |

Global rules in the same file:
- `[data-numeric], table { font-variant-numeric: tabular-nums; }`: scores, clocks and counts must not shift width when they change.
- `h1, h2, h3 { text-wrap: balance; }` and `p { text-wrap: pretty; }`.
- One `@media (prefers-reduced-motion: reduce)` block for the system: reveals become opacity-only (no translate/scale), and infinite decorative animations stop.

Do not rename or remove existing variables in `Home.css`; other pages still use them.

## 2. Section anatomy

Every page section follows the same order, and each part is marked with a `data-slot` attribute (the CSS targets roles, not one-off class names):

1. `data-slot="eyebrow"`: short muted label above the heading.
2. `data-slot="display-heading"`: the heading, display scale, words may rise in with a stagger on first load only.
3. `data-slot="lead"`: one sentence, muted, `max-width: 65ch`.
4. `data-slot="stat-strip"`: a `<dl>` with a top border (`border-top` using the existing subtle border color) and `padding-top: calc(var(--space) * 6)`. Each stat is `<div><dt>label</dt><dd data-numeric>value</dd></div>`, with the value visually above the label (`dt { order: 2 }`), the value at `--text-xl`, the label at `--text-xs` muted.

Existing class names may stay for styling hooks; `data-slot` is added alongside them.

## 3. Scroll reveal (`src/components/ScrollReveal.jsx` + CSS in `tokens.css`)

Progressive enhancement: content is visible by default and is only hidden once JavaScript has confirmed it can reveal it.

- CSS: `html[data-motion] [data-reveal]:not([data-revealed]) { opacity: 0; translate: 0 1.5rem; }`. Transitions on `opacity`/`translate` apply only under `html[data-motion-ready]`, using `--duration-reveal`, `--ease-brand` and a per-element `--reveal-delay` (default `0s`). Variant `data-reveal="fade"` has no translate.
- The component (renders `null`), in `useLayoutEffect`:
  1. Marks every `[data-reveal]` element that is already inside the viewport (top < 92% of viewport height) as `data-revealed` **before** setting `html[data-motion]`, so nothing visible on first paint flashes.
  2. Sets `data-motion`, forces a reflow, then sets `data-motion-ready`.
  3. One shared `IntersectionObserver` (`threshold: 0.12`, `rootMargin: '0px 0px -8% 0px'`) sets `data-revealed` and unobserves each element. No scroll listeners.
  4. A second observer (`rootMargin: '25% 0px'`) toggles `data-offscreen` on `section` and `[data-defer]` elements; CSS pauses all animations inside `[data-offscreen]` (`animation-play-state: paused`).
  5. Takes a `scanKey` prop. When it changes (for example the active tab or page), it observes any new `[data-reveal]` elements. Elements that were already revealed are never hidden again.
  6. Cleans up both observers and removes the `html` attributes on unmount.
- The 30-second data refresh must **not** replay reveals: cards keep stable keys (`gameId`), so React keeps the same DOM nodes and their `data-revealed`.
- Stagger lists by setting `--reveal-delay` per item, capped (for example `Math.min(index, 8) * 60ms`) so long lists don't wait seconds.
- Pure logic (which elements count as already in view, the stagger delay) lives in a small helper module so it can be tested with `node --test` without a DOM.

## 4. Pill nav with a sliding indicator (`src/components/PillNav.jsx`)

For segmented tabs (Today / Upcoming on Live Games).

- A container (`role="tablist"`) holds tab buttons (`role="tab"`, `aria-selected`) and one `aria-hidden` indicator `span` positioned absolutely.
- The indicator sits under the **active** tab and moves to the hovered or focused tab while the pointer or focus is inside the nav. When the pointer leaves, it returns to the active tab.
- Position comes from the target tab's `offsetLeft`/`offsetWidth`. Move it with `transform: translateX()` and set its width (or scale it from a fixed width); the motion itself must only animate `transform`/`opacity`.
- On first render, the indicator appears without gliding (no slide in from 0). It glides only between positions after that.
- Re-measures on resize, and when a tab's badge content changes width (for example "3 LIVE" appearing), using a `ResizeObserver` on the nav.
- Duration `--duration-slow`, `--ease-brand`. Press feedback on tabs: `scale: 0.96` on `:active`, `--duration-fast`.
- Keyboard: Left/Right arrows move between tabs, Enter/Space selects, and `:focus-visible` shows a clear ring.
- Hover-only effects are wrapped in `@media (hover: hover) and (pointer: fine)`.
- Indicator geometry is computed by a pure function (input: tab offsets/widths and the target index; output: x and width) with unit tests.

## 5. Motion rules

- UI motion (hover, press, tab indicator) stays at 250ms or less, except `--duration-slow` for the indicator glide and `--duration-reveal` for scroll reveals.
- Only `transform` and `opacity` are animated. No `transition: all`, and no animating `width`, `height`, `top`, `left`, `box-shadow` or `filter` on frequently seen elements.
- Enter uses `--ease-brand` (ease-out family). Never `ease-in` for UI.
- Continuous animations (live pulse rings and dots) are paused when their section is off screen, and are removed under reduced motion.
- No new dependencies: plain CSS and React only. No Framer Motion, GSAP, Tailwind utilities or icon libraries.

## 6. Chrome stability

Persistent chrome keeps a constant height regardless of its text: the hero meta row (last sync time, refresh button), the tab bar, and the pagination bar. Status text is a single line (`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`) with a reserved `min-height`. Changing "3 LIVE" to "4 LIVE" or a new sync time must not move anything around it.

## Phase 1 scope: Live Games (`/games`)

Files in scope: `src/pages/LiveGames.jsx`, `src/pages/LiveGames.css`, new `src/styles/tokens.css`, new `src/components/ScrollReveal.jsx`, new `src/components/PillNav.jsx`, their pure helpers in `src/utils/`, `src/main.jsx` (import tokens only), and new tests in `frontend/tests/`.

1. **Hero** uses the section anatomy:
   - eyebrow: the current "REAL-TIME ARENA" badge;
   - display heading: "NBA LIVE SLATE", keeping its ember span;
   - lead: the current subtitle;
   - stat strip with **Live now**, **Today** (game count), **Upcoming** (total) and **Last sync** (time).
   The refresh button stays and lives in the chrome-stable meta row. Stats are derived from data the page already fetches, by a pure helper with tests.
2. **Tabs** become `PillNav`, keeping the live and count badges.
3. **Game cards**: the grid and each card get `data-reveal` with a capped stagger. The live pulse ring pauses off screen. The hover lift uses `transform` only (replace `transition: all` and the `box-shadow` transition on cards with transform/opacity, keeping a static glow on hover if needed). Scores use `data-numeric`.
4. **Loading, empty and pagination** states keep their behavior. Pagination counts use `data-numeric`.
5. **The game detail page** (`LiveGameDetail.jsx`, `GameBoxScore.jsx`) also imports `LiveGames.css`. It must look and behave exactly as before; scope any changed selectors so they don't leak into it.
6. **Behavior is unchanged**: same endpoints, the same 30-second refresh, the same sort order, the same links to `/games/:id`, and existing tests still pass.

Out of scope for Phase 1: every other page, colors and fonts, the navbar, backend changes.
