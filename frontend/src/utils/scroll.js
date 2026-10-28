// A new page starts at the top when the path changes by a link click (PUSH) or redirect
// (REPLACE). A query-only change (sorting, paging) keeps the path, so it keeps your place.
// Back/Forward (POP) is left to the browser's own restoration, which works on pages that render
// at once (Contact, Privacy); pages that fetch first (Stats, Predictions) are too short when it
// runs, so they open at the top. Restoring those would mean saving positions per history entry.
export const shouldResetScroll = (navigationType, previousPath, nextPath) =>
  navigationType !== 'POP' && previousPath !== nextPath;

// True when an element's top is scrolled out of view or hidden under the fixed header.
export const isAboveView = (top, headerOffset) => top < headerOffset;

// After paging, bring the top of the results back into view if the reader had scrolled past it.
// scrollIntoView honours scroll-padding-top (the header) and the page's scroll-behavior.
export function scrollToIfAbove(element) {
  if (!element) return;
  const headerOffset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  if (isAboveView(element.getBoundingClientRect().top, headerOffset)) element.scrollIntoView({ block: 'start' });
}
