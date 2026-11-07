import usePointerTilt from '../hooks/usePointerTilt';
import './TiltCard.css';

// The one implementation of the cards' pointer play: tilt, spotlight, hover lift and the corner
// arrow. usePointerTilt writes --rx/--ry/--mx/--my to the element and TiltCard.css turns them into
// the effect. A component, not the hook called inline, because each card in a list needs its own
// hook instance. `as` picks the element (PlayerCard is an <article>); other props pass through.
// cta adds the corner call to action (decorative: the card's own button is the way in).
export default function TiltCard({ as = 'div', className = '', cta, children, ...props }) {
  const Element = as;
  const { ref, onPointerMove, onPointerLeave } = usePointerTilt();
  return (
    <Element ref={ref} className={`tilt-card ${className}`.trim()}
      onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} {...props}>
      {children}
      {cta && (
        <span className="tilt-cta" aria-hidden="true">
          <span className="tilt-cta-label">{cta}</span>
          <span className="tilt-cta-arrow">→</span>
        </span>
      )}
    </Element>
  );
}
