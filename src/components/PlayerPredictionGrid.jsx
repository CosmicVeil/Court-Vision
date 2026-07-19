import { PREDICTION_GROUPS, calculatePredictionChange } from '../config/predictionStats';
import './PlayerPredictionGrid.css';

const formatValue = (value) => (Number(value) || 0).toFixed(1);

const PlayerPredictionGrid = ({ currentStats = {}, predictionStats = {}, improvements = {} }) => (
  <div className="player-prediction-groups">
    {PREDICTION_GROUPS.map((group) => (
      <section className="player-prediction-group" key={group.id}>
        <h3 className="player-prediction-group-title">{group.label}</h3>
        <div className="player-prediction-grid">
          {group.stats.map((stat) => {
            const current = Number(currentStats?.[stat.key]) || 0;
            const predicted = Number(predictionStats?.[stat.key]) || 0;
            const suppliedChange = improvements?.[stat.key];
            const change = suppliedChange ?? calculatePredictionChange(current, predicted, stat.changeUnit);
            const changeSuffix = stat.changeUnit === 'pp' ? ' pp' : '%';

            return (
              <article className="ai-pred-box player-prediction-card" key={stat.key}>
                <div className="ai-pred-box-label">{stat.label}</div>
                <div className="ai-pred-values-flex">
                  <span className="ai-pred-num old">{formatValue(current)} <small>{stat.unit}</small></span>
                  <span className="ai-pred-arrow">→</span>
                  <span className="ai-pred-num new">{formatValue(predicted)} <small>{stat.unit}</small></span>
                </div>
                <div className={`ai-pred-badge ${change >= 0 ? 'positive' : 'negative'}`}>
                  {change >= 0 ? '+' : ''}{formatValue(change)}{changeSuffix}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    ))}
  </div>
);

export default PlayerPredictionGrid;
