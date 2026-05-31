import React, { useEffect, useState } from "react";
import "./AIPredictions.css";

const AIPredictions = ({ onPlayerClick }) => {
  const [predictions, setPredictions] = useState({
    top_scorers: [],
    top_assists: [],
    top_rebounders: [],
    breakout_players: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('scorers');

  useEffect(() => {
    const API_URL = "/api/ai-predictions";
    const fetchPredictions = async () => {
      try {
        const response = await fetch(API_URL);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setPredictions(data?.predictions ?? {
          top_scorers: [],
          top_assists: [],
          top_rebounders: [],
          breakout_players: []
        });
      } catch (err) {
        console.error("Failed to fetch predictions:", err);
        setError("Failed to connect to AI server. Make sure the backend is running.");
      } finally {
        setLoading(false);
      }
    };

    fetchPredictions();
  }, []);

  const formatStat = (value) => {
    if (typeof value === 'number') {
      return value.toFixed(1);
    }
    return value || '0.0';
  };

  const renderPlayerCard = (player, index, statType) => {
    const getStatDisplay = () => {
      switch (statType) {
        case 'scorers':
          return {
            past: formatStat(player.PPG_LAST || 0),
            current: formatStat(player.PREDICTED_PPG),
            label: 'PPG'
          };
        case 'assists':
          return {
            past: formatStat(player.APG_LAST || 0),
            current: formatStat(player.PREDICTED_APG),
            label: 'APG'
          };
        case 'rebounders':
          return {
            past: formatStat(player.RPG_LAST || 0),
            current: formatStat(player.PREDICTED_RPG),
            label: 'RPG'
          };
        case 'breakout':
          return {
            past: formatStat(player.PPG_LAST || 0),
            current: formatStat(player.PREDICTED_PPG),
            label: 'Est. PPG',
            apg_past: formatStat(player.APG_LAST || 0),
            apg_current: formatStat(player.PREDICTED_APG),
            rpg_past: formatStat(player.RPG_LAST || 0),
            rpg_current: formatStat(player.PREDICTED_RPG)
          };
        default:
          return {
            past: '0.0',
            current: '0.0',
            label: 'N/A'
          };
      }
    };

    const stat = getStatDisplay();

    return (
      <div key={index} className="player-card" onClick={() => onPlayerClick && onPlayerClick(player)} style={{ cursor: 'pointer' }}>
        <div className="player-rank">#{index + 1}</div>
        <div className="player-info">
          <div className="player-name">{player.PLAYER_NAME}</div>
          <div className="player-details">
            {player.TEAM} • {player.POSITION} • Age {player.AGE}
          </div>
        </div>
        <div className="player-stat">
          {statType === 'breakout' ? (
            <div className="stat-breakout">
              <div className="breakout-stats-grid">
                <div className="breakout-stat">
                  <div className="stat-value-small">{stat.past}</div>
                  <div className="stat-arrow-small">→</div>
                  <div className="stat-value-small">{stat.current}</div>
                  <div className="stat-label-small">PPG</div>
                </div>
                <div className="breakout-stat">
                  <div className="stat-value-small">{stat.apg_past}</div>
                  <div className="stat-arrow-small">→</div>
                  <div className="stat-value-small">{stat.apg_current}</div>
                  <div className="stat-label-small">APG</div>
                </div>
                <div className="breakout-stat">
                  <div className="stat-value-small">{stat.rpg_past}</div>
                  <div className="stat-arrow-small">→</div>
                  <div className="stat-value-small">{stat.rpg_current}</div>
                  <div className="stat-label-small">RPG</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="stat-comparison">
              <div className="stat-past">
                <div className="stat-value-small">{stat.past}</div>
                <div className="stat-label-small">Past {stat.label}</div>
              </div>
              <div className="stat-arrow">→</div>
              <div className="stat-current">
                <div className="stat-value">{stat.current}</div>
                <div className="stat-label">Predicted {stat.label}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="ai-predictions-container">
        <div className="loading">Loading AI predictions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ai-predictions-container">
        <div className="error">{error}</div>
      </div>
    );
  }

  const tabs = [
    { id: 'scorers', label: 'Top Scorers', data: predictions.top_scorers },
    { id: 'assists', label: 'Top Assists', data: predictions.top_assists },
    { id: 'rebounders', label: 'Top Rebounders', data: predictions.top_rebounders },
    { id: 'breakout', label: 'Breakout Players', data: predictions.breakout_players }
  ];

  const activeTabData = tabs.find(tab => tab.id === activeTab);

  return (
    <div className="ai-predictions-container">
      <div className="predictions-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="predictions-content">
        {activeTabData && activeTabData.data && activeTabData.data.length > 0 ? (
          <div className="players-grid">
            {activeTabData.data.slice(0, 10).map((player, index) => 
              renderPlayerCard(player, index, activeTab)
            )}
          </div>
        ) : (
          <div className="no-data">No predictions available for {activeTabData?.label}.</div>
        )}
      </div>
    </div>
  );
};

export default AIPredictions;
