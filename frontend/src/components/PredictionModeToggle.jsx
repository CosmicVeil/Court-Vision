import { useNavigate } from 'react-router-dom';
import PillNav from './PillNav';
import './PredictionModeToggle.css';

const MODES = [
  { id: 'season', label: 'Season' },
  { id: 'games', label: 'Game projections' },
];

// Switches a page between the season model and the per-game model. Each mode is its own route
// (/predictions vs /predictions/games), so a link or refresh lands on the same view.
export default function PredictionModeToggle({ base, value }) {
  const navigate = useNavigate();
  return (
    <div className="pm-toggle-wrap">
      <PillNav className="pm-toggle" tabClassName="pm-tab" label="Prediction model" idPrefix={`pm${base.replace(/\W/g, '-')}`}
        items={MODES} value={value}
        onChange={mode => { if (mode !== value) navigate(mode === 'games' ? `${base}/games` : base); }} />
    </div>
  );
}
