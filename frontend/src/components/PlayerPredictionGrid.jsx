import React from 'react';
import { PREDICTION_GROUPS } from '../config/predictionStats';
import { getStatDelta } from '../utils/playerCard';
import './PlayerPredictionGrid.css';

const formatValue = (value) => (Number(value) || 0).toFixed(1);
const BADGE_ARROWS = { up: '↗', down: '↘', flat: '→' };

const PlayerPredictionGrid = ({ currentStats = {}, predictionStats = {} }) => (
  <div className="player-prediction-groups">
    {PREDICTION_GROUPS.map((group) => (
      <section className="player-prediction-group" key={group.id}>
        <div className="player-prediction-group-header">
          <span className="cv-section-badge-mini">{group.label}</span>
        </div>
        <div className="player-prediction-grid">
          {group.stats.map((stat) => {
            // No games this season yet: show the prediction alone, with nothing to compare against.
            const hasCurrent = currentStats?.[stat.key] != null;
            const predicted = predictionStats?.[stat.key];
            // Same delta as the prediction cards: the signed change in the stat's own units.
            const delta = hasCurrent ? getStatDelta(currentStats[stat.key], predicted) : null;
            const changeSuffix = stat.changeUnit === 'pp' ? ' pp' : '';

            return (
              <article className="player-pred-card" key={stat.key}>
                <div className="player-pred-label">{stat.label}</div>

                <div className="player-pred-comparison">
                  <div className="player-pred-val-box past">
                    <span className="player-pred-val">{hasCurrent ? formatValue(currentStats[stat.key]) : '—'}</span>
                    <span className="player-pred-unit">{stat.unit}</span>
                  </div>

                  <div className="player-pred-arrow">→</div>

                  <div className="player-pred-val-box predicted">
                    <span className="player-pred-val">{formatValue(predicted)}</span>
                    <span className="player-pred-unit">{stat.unit}</span>
                  </div>
                </div>

                {delta && (
                  <div className="player-pred-footer">
                    <span className={`player-pred-badge ${delta.direction}`}>
                      <span className="badge-arrow">{BADGE_ARROWS[delta.direction]}</span>
                      <span>{delta.text}{changeSuffix}</span>
                    </span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    ))}
  </div>
);

export default PlayerPredictionGrid;
