import { useLayoutEffect, useRef } from 'react';

// Keep the region and its controls mounted; only animate the newly selected content.
// The first render is skipped: the cards inside already run their own data-enter intro.
export default function ResultRegion({ changeKey, children, ...props }) {
  const ref = useRef(null);
  // Compare keys rather than using a "mounted" flag: StrictMode re-runs effects on mount in dev.
  const shownKey = useRef(changeKey);
  useLayoutEffect(() => {
    if (shownKey.current === changeKey) return undefined;
    shownKey.current = changeKey;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const animation = ref.current?.animate(
      [{ opacity: 0.35, translate: '0 6px' }, { opacity: 1, translate: '0 0' }],
      { duration: 220, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
    );
    return () => animation?.cancel();
  }, [changeKey]);
  return <div ref={ref} {...props}>{children}</div>;
}
