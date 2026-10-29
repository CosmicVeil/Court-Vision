import React, { useEffect, useRef, useState } from "react";
import { API_ENDPOINTS } from "../config/api";
import PlayerCard from "./PlayerCard";
import { getLeaderCardStats } from "../utils/playerCard";
import "./AIPredictions.css";

const EMPTY_PREDICTIONS = {
  top_scorers: [],
  top_assists: [],
  top_rebounders: [],
  top_steals: [],
  top_blocks: [],
  breakout_players: []
};

const toCardPlayer = (player) => ({
  name: player.PLAYER_NAME,
  team: player.TEAM,
  position: player.POSITION,
  age: Number.isFinite(player.AGE) ? Math.round(player.AGE) : null,
});

// onContentChange reports what is on screen (tab + load state), so the page can rescan for the
// cards' data-reveal targets whenever a new set mounts.
const AIPredictions = ({ onPlayerClick, onContentChange, lazy = true }) => {
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
      const maxRetries = 3;
      const baseDelay = 5000; // 5 seconds between retries

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        let timeoutId;
        try {
          const timeoutPromise = new Promise((_, reject) =>
            { timeoutId = setTimeout(() => reject(new Error('Request timed out')), 60000); }
          );
          const response = await Promise.race([
            fetch(API_ENDPOINTS.aiPredictions),
            timeoutPromise,
          ]);
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const data = await response.json();
          if (!cancelled) {
            setPredictions(data?.predictions ?? EMPTY_PREDICTIONS);
            setError(null);
          }
          return; // Success - exit retry loop
        } catch (err) {
          console.error(`Attempt ${attempt + 1}/${maxRetries} failed:`, err);
          if (cancelled) return;
          
          if (attempt < maxRetries - 1) {
            // Wait before retrying (server might be waking up from cold start)
            await new Promise(resolve => setTimeout(resolve, baseDelay * (attempt + 1)));
          } else {
            setError("Failed to connect to AI server. Make sure the backend is running.");
          }
        } finally {
          clearTimeout(timeoutId);
        }
      }
      if (!cancelled) {
        setLoading(false);
      }
    };

    fetchPredictions().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [shouldLoad]);


  // `lead` is the stat each tab ranks by; its card shows that stat first.
  const tabs = [
    { id: 'scorers', label: 'Top Scorers', lead: 'ppg', data: predictions.top_scorers },
    { id: 'assists', label: 'Top Assists', lead: 'apg', data: predictions.top_assists },
    { id: 'rebounders', label: 'Top Rebounders', lead: 'rpg', data: predictions.top_rebounders },
    { id: 'steals', label: 'Top Steals', lead: 'spg', data: predictions.top_steals },
    { id: 'blocks', label: 'Top Blocks', lead: 'bpg', data: predictions.top_blocks },
    { id: 'breakout', label: 'Breakout Players', lead: 'ppg', data: predictions.breakout_players }
  ];

  const activeTabData = tabs.find(tab => tab.id === activeTab);
  const waitingToLoad = lazy && !shouldLoad;
  const shownCount = activeTabData?.data?.length ?? 0;
  const contentKey = `${activeTab}:${waitingToLoad || loading ? 'loading' : error ? 'error' : shownCount}`;

  useEffect(() => {
    onContentChange?.(contentKey);
  }, [contentKey, onContentChange]);

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
          <div className="pc-grid">
            {activeTabData.data.slice(0, 10).map((player, index) => {
              const { main, extra } = getLeaderCardStats(player, activeTabData.lead);
              return (
                <PlayerCard
                  key={player.PLAYER_NAME}
                  index={index}
                  player={toCardPlayer(player)}
                  stats={main}
                  statsLabel="Predicted · change vs this season"
                  extraStats={extra}
                  extraLabel="This Season Shooting"
                  onOpen={() => onPlayerClick && onPlayerClick(player)}
                  ctaLabel="Full projection"
                />
              );
            })}
          </div>
        ) : (
          <div className="no-data">No predictions available for {activeTabData?.label}.</div>
        )}
      </div>
    </div>
  );
};

export default AIPredictions;
