import { useEffect, useRef } from 'react';
import { getTilt } from '../utils/liveInteractions';

const TILT_PROPERTIES = ['--rx', '--ry', '--mx', '--my'];

// Pointer tilt and spotlight for a card. It writes CSS variables straight to the element in
// requestAnimationFrame: no React state, so no re-render per pointer move. Mouse only.
export default function usePointerTilt() {
  const ref = useRef(null);
  const frameRef = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const onPointerMove = event => {
    if (event.pointerType !== 'mouse') return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const element = ref.current;
      if (!element) return;
      const { rx, ry, mx, my } = getTilt({ clientX, clientY }, element.getBoundingClientRect());
      element.style.setProperty('--rx', `${rx}deg`);
      element.style.setProperty('--ry', `${ry}deg`);
      element.style.setProperty('--mx', `${mx}%`);
      element.style.setProperty('--my', `${my}%`);
    });
  };

  const onPointerLeave = () => {
    cancelAnimationFrame(frameRef.current);
    TILT_PROPERTIES.forEach(property => ref.current?.style.removeProperty(property));
  };

  return { ref, onPointerMove, onPointerLeave };
}
