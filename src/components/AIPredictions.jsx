import React, { useEffect, useRef, useState } from "react";
import { API_ENDPOINTS } from "../config/api";
import "./AIPredictions.css";

const EMPTY_PREDICTIONS = {
  top_scorers: [],
  top_assists: [],
  top_rebounders: [],
  top_steals: [],
  top_blocks: [],
  breakout_players: []
};

const AIPredictions = ({ onPlayerClick, lazy = true }) => {
  const containerRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(!lazy);
  const [predictions, setPredictions] = useState(EMPTY_PREDICTIONS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('scorers');

  useEffect(() => {
    if (!lazy) return;

    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "250px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [lazy]);

  useEffect(() => {
    if (!shouldLoad) return;

    let cancelled = false;
    const fetchPredictions = async () => {
      setLoading(true);
      try {
        const response = await fetch(API_ENDPOINTS.aiPredictions);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (!cancelled) {
          setPredictions(data?.predictions ?? EMPTY_PREDICTIONS);
        }
      } catch (err) {
        console.error("Failed to fetch predictions:", err);
        if (!cancelled) {
          setError("Failed to connect to AI server. Make sure the backend is running.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchPredictions();
    return () => {
      cancelled = true;
    };
  }, [shouldLoad]);

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
        case 'steals':
          return {
            past: formatStat(player.SPG_LAST || 0),
            current: formatStat(player.PREDICTED_SPG),
            label: 'SPG'
          };
        case 'blocks':
          return {
            past: formatStat(player.BPG_LAST || 0),
            current: formatStat(player.PREDICTED_BPG),
            label: 'BPG'
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

  const tabs = [
    { id: 'scorers', label: 'Top Scorers', data: predictions.top_scorers },
    { id: 'assists', label: 'Top Assists', data: predictions.top_assists },
    { id: 'rebounders', label: 'Top Rebounders', data: predictions.top_rebounders },
    { id: 'steals', label: 'Top Steals', data: predictions.top_steals },
    { id: 'blocks', label: 'Top Blocks', data: predictions.top_blocks },
    { id: 'breakout', label: 'Breakout Players', data: predictions.breakout_players }
  ];

  const activeTabData = tabs.find(tab => tab.id === activeTab);
  const waitingToLoad = lazy && !shouldLoad;

  return (
    <div className="ai-predictions-container" ref={containerRef}>
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
        {waitingToLoad || loading ? (
          <div className="loading">Loading AI predictions...</div>
        ) : error ? (
          <div className="error">{error}</div>
        ) : activeTabData && activeTabData.data && activeTabData.data.length > 0 ? (
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
