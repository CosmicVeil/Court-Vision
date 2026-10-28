import { useEffect, useLayoutEffect, useRef } from 'react';
import { getFlipMoves } from '../utils/flip';

// Same values as --duration-slow and --ease-brand; the Web Animations API needs them as literals.
const DURATION_MS = 400;
const EASING = 'cubic-bezier(.22, 1, .36, 1)';

// Layout positions (offsetLeft/Top) ignore transforms and scrolling, so a tilted or
// half-revealed card still reports where it really sits in the grid.
function snapshot(container) {
  return new Map([...container.querySelectorAll(':scope > [data-flip]')]
    .map(element => [element.dataset.flip, { x: element.offsetLeft, y: element.offsetTop, element }]));
}

// FLIP for a keyed list: after each commit, items that moved are drawn at their old position
// (Invert) and animated to the new one (Play). Children opt in with a data-flip key.
export default function useFlip(containerRef) {
  const previousRef = useRef(null);
  const observedRef = useRef(null);
  const resizeObserverRef = useRef(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container !== observedRef.current) {
      // A resize reflows the grid without a commit; re-snapshot so the next sort doesn't
      // animate that reflow as if it were a move.
      resizeObserverRef.current?.disconnect();
      observedRef.current = container;
      previousRef.current = null;
      if (container && typeof ResizeObserver !== 'undefined') {
        resizeObserverRef.current = new ResizeObserver(() => { previousRef.current = snapshot(container); });
        resizeObserverRef.current.observe(container);
      }
    }
    if (!container) return;

    const next = snapshot(container);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) {
      for (const { key, dx, dy } of getFlipMoves(previousRef.current, next)) {
        const { element } = next.get(key);
        // Cards still waiting for their scroll reveal are hidden; let the reveal bring them in.
        if (!element.hasAttribute('data-revealed')) continue;
        // `translate` composes with the card's tilt `transform` instead of replacing it.
        element.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: DURATION_MS, easing: EASING });
      }
    }
    previousRef.current = next;
  });

  useEffect(() => () => resizeObserverRef.current?.disconnect(), []);
}
