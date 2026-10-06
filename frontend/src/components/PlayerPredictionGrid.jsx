import React from 'react';
import { PREDICTION_GROUPS, calculatePredictionChange } from '../config/predictionStats';
import './PlayerPredictionGrid.css';

const formatValue = (value) => (Number(value) || 0).toFixed(1);

const PlayerPredictionGrid = ({ currentStats = {}, predictionStats = {}, improvements = {} }) => (
  <div className="player-prediction-groups">
    {PREDICTION_GROUPS.map((group) => (
      <section className="player-prediction-group" key={group.id}>
        <div className="player-prediction-group-header">
          <span className="cv-section-badge-mini">{group.label}</span>
        </div>
        <div className="player-prediction-grid">
          {group.stats.map((stat) => {
            const current = Number(currentStats?.[stat.key]) || 0;
            const predicted = Number(predictionStats?.[stat.key]) || 0;
            const suppliedChange = improvements?.[stat.key];
            const change = suppliedChange ?? calculatePredictionChange(current, predicted, stat.changeUnit);
            const changeSuffix = stat.changeUnit === 'pp' ? ' pp' : '%';
            const isPositive = change >= 0;

            return (
              <article className="player-pred-card" key={stat.key}>
                <div className="player-pred-label">{stat.label}</div>
                
                <div className="player-pred-comparison">
                  <div className="player-pred-val-box past">
                    <span className="player-pred-val">{formatValue(current)}</span>
                    <span className="player-pred-unit">{stat.unit}</span>
                  </div>
                  
                  <div className="player-pred-arrow">→</div>
                  
                  <div className="player-pred-val-box predicted">
                    <span className="player-pred-val">{formatValue(predicted)}</span>
                    <span className="player-pred-unit">{stat.unit}</span>
                  </div>
                </div>

                <div className="player-pred-footer">
                  <span className={`player-pred-badge ${isPositive ? 'positive' : 'negative'}`}>
                    <span className="badge-arrow">{isPositive ? '↗' : '↘'}</span>
                    <span>{isPositive ? '+' : ''}{formatValue(change)}{changeSuffix}</span>
                  </span>
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
