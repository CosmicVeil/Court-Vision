export const REVEAL_IN_VIEW_RATIO = 0.92;
export const REVEAL_THRESHOLD = 0.12;
// The 0 threshold reports targets too tall to ever reach REVEAL_THRESHOLD; shouldReveal decides.
export const REVEAL_OBSERVER_OPTIONS = { threshold: [0, REVEAL_THRESHOLD], rootMargin: '0px 0px -8% 0px' };
export const DEFER_OBSERVER_OPTIONS = { rootMargin: '25% 0px' };

export function shouldReveal({ isIntersecting, intersectionRatio, boundingClientRect, rootBounds }) {
  if (!isIntersecting) return false;
  if (intersectionRatio >= REVEAL_THRESHOLD) return true;
  // A target taller than the root can peak below the threshold, so any overlap counts.
  return Boolean(rootBounds) && boundingClientRect.height > rootBounds.height;
}

export function isAlreadyInView(top, viewportHeight, ratio = REVEAL_IN_VIEW_RATIO) {
  return Number.isFinite(viewportHeight) && viewportHeight > 0 && top < viewportHeight * ratio;
}

export function getRevealDelay(index, { step = 60, cap = 8 } = {}) {
  return `${Math.min(Math.max(0, index | 0), cap) * step}ms`;
}
