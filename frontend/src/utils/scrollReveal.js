export const REVEAL_IN_VIEW_RATIO = 0.92;
export const REVEAL_OBSERVER_OPTIONS = { threshold: 0.12, rootMargin: '0px 0px -8% 0px' };
export const DEFER_OBSERVER_OPTIONS = { rootMargin: '25% 0px' };

export function isAlreadyInView(top, viewportHeight, ratio = REVEAL_IN_VIEW_RATIO) {
  return Number.isFinite(viewportHeight) && viewportHeight > 0 && top < viewportHeight * ratio;
}

export function getRevealDelay(index, { step = 60, cap = 8 } = {}) {
  return `${Math.min(Math.max(0, index | 0), cap) * step}ms`;
}
