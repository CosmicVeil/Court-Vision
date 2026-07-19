import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PlayerPredictionGrid from './PlayerPredictionGrid';
import './Recommendations.css';

const RecommendationChart = () => {
    const { stat } = useParams();
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // States for player details modal
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [loadingPlayer, setLoadingPlayer] = useState(false);
    const [modalTab, setModalTab] = useState('current'); // current, predictions, history

    const handlePlayerClick = async (player) => {
        setLoadingPlayer(true);
        setModalTab('current');
        try {
            const response = await fetch(`${API_BASE_URL}/players/search-all?query=${encodeURIComponent(player.PLAYER_NAME || player.name)}`);
            const data = await response.json();
            const match = (data.players || []).find(p => p.name.toLowerCase() === (player.PLAYER_NAME || player.name).toLowerCase());
            if (match) {
                setSelectedPlayer(match);
            } else {
                setSelectedPlayer({
                    name: player.PLAYER_NAME || player.name,
                    team: player.TEAM || player.team || 'UNK',
                    position: player.POSITION || player.position || 'UNK',
                    current_stats: {
                        ppg: player.pts || player.PPG_LAST || 0,
                        rpg: player.reb || player.RPG_LAST || 0,
                        apg: player.ast || player.APG_LAST || 0,
                        spg: player.stl || player.SPG_LAST || 0,
                        bpg: player.blk || player.BPG_LAST || 0,
                        tov: player.tov || player.TOV_LAST || 0,
                        mpg: player.min || player.MIN_LAST || 0,
                        fg_pct: 0, fg3_pct: 0, ft_pct: 0, games_played: 0, minutes: 0
                    },
                    ml_stats: null,
                    history: {}
                });
            }
        } catch (err) {
            console.error('Error fetching player details:', err);
        } finally {
            setLoadingPlayer(false);
        }
    };

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
                            <div 
                                key={player.PLAYER_NAME ?? index} 
                                className="recommendation-card analytic-card"
                                onClick={() => handlePlayerClick(player)}
                            >
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

                                    <div className={`growth-callout ${improvement >= 0 ? 'positive' : 'negative'}`}>
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

            {/* Player Details Popup Modal */}
            {(selectedPlayer || loadingPlayer) && (
                <div className="stats-modal-backdrop" onClick={() => { if (!loadingPlayer) setSelectedPlayer(null); }}>
                    <div className="stats-modal-container" onClick={(e) => e.stopPropagation()}>
                        {loadingPlayer && !selectedPlayer ? (
                            <div style={{ padding: '4rem', textAlign: 'center' }}>
                                <div className="search-spinner" style={{ width: 32, height: 32, margin: '0 auto 1rem' }}></div>
                                <p style={{ color: 'var(--text-secondary)' }}>Loading player details...</p>
                            </div>
                        ) : selectedPlayer && (
                            <>
                                <button className="stats-modal-close-btn" onClick={() => setSelectedPlayer(null)}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                                
                                <div className="stats-modal-header">
                                    <div className="stats-modal-player-title-row">
                                        <h2 className="stats-modal-player-name">{selectedPlayer.name}</h2>
                                        <span className="stats-modal-player-team-badge">{selectedPlayer.team}</span>
                                    </div>
                                    <p className="stats-modal-player-meta">
                                        <span><strong>Position:</strong> {selectedPlayer.position}</span>
                                        <span>•</span>
                                        <span><strong>Age:</strong> {selectedPlayer.age}</span>
                                    </p>
                                </div>

                                <div className="stats-modal-tabs">
                                    <button className={`stats-modal-tab-btn ${modalTab === 'current' ? 'active' : ''}`} onClick={() => setModalTab('current')}>Current Stats</button>
                                    <button className={`stats-modal-tab-btn ${modalTab === 'predictions' ? 'active' : ''}`} onClick={() => setModalTab('predictions')}>AI Predictions</button>
                                    <button className={`stats-modal-tab-btn ${modalTab === 'history' ? 'active' : ''}`} onClick={() => setModalTab('history')}>Career History</button>
                                </div>

                                <div className="stats-modal-body">
                                    {modalTab === 'current' && (
                                        <div>
                                            <div className="stats-grid-container">
                                                <div className="stat-box-card"><div className="stat-box-value highlighted">{selectedPlayer.current_stats.ppg}</div><div className="stat-box-label">PPG</div></div>
                                                <div className="stat-box-card"><div className="stat-box-value">{selectedPlayer.current_stats.apg}</div><div className="stat-box-label">APG</div></div>
                                                <div className="stat-box-card"><div className="stat-box-value">{selectedPlayer.current_stats.rpg}</div><div className="stat-box-label">RPG</div></div>
                                                <div className="stat-box-card"><div className="stat-box-value">{selectedPlayer.current_stats.spg}</div><div className="stat-box-label">SPG</div></div>
                                                <div className="stat-box-card"><div className="stat-box-value">{selectedPlayer.current_stats.bpg}</div><div className="stat-box-label">BPG</div></div>
                                            </div>
                                            <div className="secondary-stats-container">
                                                <h3 className="secondary-stats-title">Shooting & Playing Time</h3>
                                                <div className="percentage-stat-row">
                                                    <div className="percentage-stat-header"><span className="percentage-stat-name">Field Goal (FG%)</span><span className="percentage-stat-value">{selectedPlayer.current_stats.fg_pct}%</span></div>
                                                    <div className="percentage-stat-track"><div className="percentage-stat-bar" style={{ width: `${selectedPlayer.current_stats.fg_pct}%` }}></div></div>
                                                </div>
                                                <div className="percentage-stat-row">
                                                    <div className="percentage-stat-header"><span className="percentage-stat-name">3-Point (3PT%)</span><span className="percentage-stat-value">{selectedPlayer.current_stats.fg3_pct}%</span></div>
                                                    <div className="percentage-stat-track"><div className="percentage-stat-bar" style={{ width: `${selectedPlayer.current_stats.fg3_pct}%` }}></div></div>
                                                </div>
                                                <div className="percentage-stat-row">
                                                    <div className="percentage-stat-header"><span className="percentage-stat-name">Free Throw (FT%)</span><span className="percentage-stat-value">{selectedPlayer.current_stats.ft_pct}%</span></div>
                                                    <div className="percentage-stat-track"><div className="percentage-stat-bar" style={{ width: `${selectedPlayer.current_stats.ft_pct}%` }}></div></div>
                                                </div>
                                                <div className="percentage-stat-row" style={{ marginTop: '1.5rem' }}>
                                                    <div className="percentage-stat-header" style={{ marginBottom: 0 }}>
                                                        <span className="percentage-stat-name">Games Played / Playing Time</span>
                                                        <span className="percentage-stat-value">{selectedPlayer.current_stats.games_played} Games | {selectedPlayer.current_stats.minutes} MPG</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {modalTab === 'predictions' && (
                                        <div>
                                            {selectedPlayer.ml_stats ? (
                                                <PlayerPredictionGrid
                                                    currentStats={selectedPlayer.current_stats}
                                                    predictionStats={selectedPlayer.ml_stats.predicted_stats}
                                                    improvements={selectedPlayer.ml_stats.improvements}
                                                />
                                            ) : (
                                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>AI Prediction model is currently loading or unavailable for this player.</div>
                                            )}
                                        </div>
                                    )}

                                    {modalTab === 'history' && (
                                        <div className="stats-history-table-container">
                                            <div className="stats-history-scroll-box">
                                                <table className="stats-history-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Season</th><th>GP</th><th>MIN</th><th>PPG</th><th>RPG</th><th>APG</th><th>SPG</th><th>BPG</th><th>FG%</th><th>3P%</th><th>FT%</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {Object.entries(selectedPlayer.history || {}).reverse().map(([year, stats]) => (
                                                            <tr key={year}>
                                                                <td><strong>{year}</strong></td>
                                                                <td>{stats.games_played}</td>
                                                                <td>{stats.minutes}</td>
                                                                <td>{stats.ppg}</td>
                                                                <td>{stats.rpg}</td>
                                                                <td>{stats.apg}</td>
                                                                <td>{stats.spg}</td>
                                                                <td>{stats.bpg}</td>
                                                                <td>{stats.fg_pct}%</td>
                                                                <td>{stats.fg3_pct}%</td>
                                                                <td>{stats.ft_pct}%</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default RecommendationChart;
