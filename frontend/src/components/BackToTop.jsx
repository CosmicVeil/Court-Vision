import { useEffect, useRef, useState } from 'react';
import './BackToTop.css';

// A floating button that appears once the reader is well down a long page. A 1px sentinel at
// the top is observed with the root extended 1.5 screens upward, so it only stops intersecting
// after that much scrolling. No scroll listener, and no tall element stretching short pages.
const OBSERVER_OPTIONS = { rootMargin: '150% 0px 0px 0px' };
export default function BackToTop() {
  const sentinelRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), OBSERVER_OPTIONS);
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} className="back-to-top-sentinel" aria-hidden="true" />
      {/* scroll-behavior on <html> makes this glide, or jump under reduced motion. */}
      <button type="button" className="back-to-top" aria-label="Back to top"
        data-visible={visible ? '' : undefined} aria-hidden={!visible} inert={!visible}
        onClick={() => window.scrollTo({ top: 0 })}>
        <span aria-hidden="true">↑</span>
      </button>
    </>
  );
}
