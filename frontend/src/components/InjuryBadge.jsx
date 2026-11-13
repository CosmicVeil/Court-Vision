import { injuryTone, injurySummary } from '../utils/injury';
import './InjuryBadge.css';

// Small OUT / DTD pill for a player on the injury report; renders nothing when healthy.
export default function InjuryBadge({ injury, className = '' }) {
  if (!injury?.status) return null;
  const summary = injurySummary(injury);
  return (
    <span className={`injury-badge injury-badge--${injuryTone(injury)} ${className}`.trim()} title={summary} aria-label={summary}>
      {injury.status_abbr || injury.status}
    </span>
  );
}
