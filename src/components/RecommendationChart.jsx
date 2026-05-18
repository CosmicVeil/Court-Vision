import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import './Recommendations.css';

const RecommendationChart = () => {
    const { stat } = useParams();
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const API_BASE_URL = '/api';

    useEffect(() => {
        const fetchRecommendations = async () => {
            try {
                setLoading(true);
                const response = await fetch(`${API_BASE_URL}/recommendations/${stat}`);

                if (!response.ok) {
                    throw new Error(`Failed to fetch recommendations: ${response.status}`);
                }

                const data = await response.json();
                const list = Array.isArray(data) ? data : (data?.[stat] ?? []);
                setPlayers(list);
                setError(null);
            } catch (err) {
                console.error('Error fetching recommendations:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchRecommendations();
    }, [stat]);

    if (loading) {
        return (
            <div className="recommendations-wrapper">
                <div className="spotlight-loader-wrap">
                    <div className="spotlight-spinner"></div>
                    <p className="spotlight-loader">Processing AI Trend Indexes...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="recommendations-wrapper">
                <div className="error">Error: {error}</div>
            </div>
        );
    }

    const predictedKey = `PREDICTED_${stat}`;
    const lastKey = `${stat}_LAST`;
    const improvementKey = `${stat}_IMPROVEMENT`;

    const getStatWording = (statType) => {
        switch (statType?.toUpperCase()) {
            case 'PPG':
                return {
                    title: "Scoring Outbreaks",
                    desc: "AI-identified offensive weapons projected to make massive leaps in their scoring output next season."
                };
            case 'APG':
                return {
                    title: "Playmaking Visionaries",
                    desc: "Breakout hubs and distributors forecasted to dramatically boost their playmaking footprint."
                };
            case 'RPG':
                return {
                    title: "Glass Dominators",
                    desc: "Physical forces projected to exert total glass supremacy and record-shattering rebound climbs."
                };
            case 'PRA':
                return {
                    title: "All-Around Virtuosos",
                    desc: "Elite multifaceted athletes projected to elevate their complete Points, Rebounds, and Assists footprint."
                };
            default:
                return {
                    title: "AI Breakout Indexes",
                    desc: "Top AI-identified breakout candidates across all primary categories."
                };
        }
    };

    const wording = getStatWording(stat);

    return (
        <div className="recommendations-wrapper">
            <header className="recommendations-header">
                <Link to="/recommendations" className="back-link">← Back to Radar</Link>
                <h1 className="recommendations-title">
                    {wording.title}
                </h1>
                <p className="recommendations-subtitle">
                    {wording.desc}
                </p>
            </header>

            <div className="recommendations-content">
                {players.length === 0 ? (
                    <p className="section-description">No recommendations available yet.</p>
                ) : (
                    <div className="recommendations-grid">
                        {players.map((player, index) => {
                            const improvement = Number(player[improvementKey] ?? 0);
                            const lastKeyVal = Number(player[lastKey] ?? 0);
                            const predictedKeyVal = Number(player[predictedKey] ?? 0);

                            // Dynamically scale progress bar lengths
                            const maxScale = stat === 'PRA' ? 60 : stat === 'PPG' ? 40 : 20;
                            const currentWidth = Math.min((lastKeyVal / maxScale) * 100, 100);
                            const predictedWidth = Math.min((predictedKeyVal / maxScale) * 100, 100);

                            return (
                            <div key={player.PLAYER_NAME ?? index} className="recommendation-card analytic-card">
                                <div className="card-header">
                                    <span className="rank-badge">#{index + 1}</span>
                                    <span className="category-badge team-code">{player.TEAM}</span>
                                </div>
                                <div className="card-body">
                                    <h3 className="insight-title">{player.PLAYER_NAME}</h3>
                                    
                                    <div className="player-meta-badges">
                                        <span className="meta-badge-item age">AGE {player.AGE}</span>
                                        <span className="meta-badge-item position">{player.POSITION}</span>
                                    </div>

                                    <div className="growth-callout">
                                        {improvement >= 0 ? '+' : ''}{improvement.toFixed(1)}% PROJECTED GROWTH
                                    </div>

                                    {/* Stats Comparison Bars */}
                                    <div className="stats-comparison-bars">
                                        <div className="bar-container">
                                            <div className="bar-header">
                                                <span className="bar-lbl">Current {stat}</span>
                                                <span className="bar-val">{lastKeyVal.toFixed(1)}</span>
                                            </div>
                                            <div className="bar-track">
                                                <div className="bar-fill current" style={{ width: `${currentWidth}%` }}></div>
                                            </div>
                                        </div>

                                        <div className="bar-container projected">
                                            <div className="bar-header">
                                                <span className="bar-lbl">AI Projected {stat}</span>
                                                <span className="bar-val">{predictedKeyVal.toFixed(1)}</span>
                                            </div>
                                            <div className="bar-track">
                                                <div className="bar-fill projected" style={{ width: `${predictedWidth}%` }}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RecommendationChart;
