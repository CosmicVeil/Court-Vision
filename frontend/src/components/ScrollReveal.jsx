import { useLayoutEffect, useRef } from 'react';
import { DEFER_OBSERVER_OPTIONS, REVEAL_OBSERVER_OPTIONS, isAlreadyInView, shouldReveal } from '../utils/scrollReveal';

export default function ScrollReveal({ scanKey }) {
  const scanRef = useRef(null);

  useLayoutEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const root = document.documentElement;
    const revealTargets = new WeakSet();
    const deferTargets = new WeakSet();
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!shouldReveal(entry)) return;
        entry.target.setAttribute('data-revealed', '');
        revealObserver.unobserve(entry.target);
      });
    }, REVEAL_OBSERVER_OPTIONS);
    const deferObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.target.toggleAttribute('data-offscreen', !entry.isIntersecting));
    }, DEFER_OBSERVER_OPTIONS);

    const scan = (initial = false) => {
      const targets = [...document.querySelectorAll('[data-reveal]:not([data-revealed])')]
        .filter(element => !revealTargets.has(element));
      // Batch geometry reads before attribute writes to avoid layout thrashing.
      const alreadyVisible = initial ? targets.filter(element => isAlreadyInView(element.getBoundingClientRect().top, window.innerHeight)) : [];
      alreadyVisible.forEach(element => element.setAttribute('data-revealed', ''));
      targets.forEach(element => {
        revealTargets.add(element);
        if (!element.hasAttribute('data-revealed')) revealObserver.observe(element);
      });
      document.querySelectorAll('section, [data-defer]').forEach(element => {
        if (deferTargets.has(element)) return;
        deferTargets.add(element);
        deferObserver.observe(element);
      });
    };

    scanRef.current = scan;
    scan(true);
    root.setAttribute('data-motion', '');
    void root.offsetHeight;
    root.setAttribute('data-motion-ready', '');

    return () => {
      revealObserver.disconnect();
      deferObserver.disconnect();
      scanRef.current = null;
      root.removeAttribute('data-motion');
      root.removeAttribute('data-motion-ready');
      document.querySelectorAll('section, [data-defer]').forEach(element => element.removeAttribute('data-offscreen'));
    };
  }, []);

  useLayoutEffect(() => { scanRef.current?.(); }, [scanKey]);

  return null;
}
