import { formatSlateDate } from '../utils/gamePredictions';
import './StaleSlateNotice.css';

// Shown when the API flags the per-game cache as stale: its slate day has passed and the daily
// run has not replaced it yet, so these are no longer anyone's next game.
export default function StaleSlateNotice({ data }) {
  if (!data?.stale) return null;
  return (
    <p className="stale-slate" role="status">
      These predictions are for {formatSlateDate(data.slate_date)}, which has already been played.
      The next slate has not been generated yet.
    </p>
  );
}
