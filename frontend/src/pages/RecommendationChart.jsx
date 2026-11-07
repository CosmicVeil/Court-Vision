import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PlayerStatsModal from '../components/PlayerStatsModal';
import TiltCard from '../components/TiltCard';
import { FPTS_TITLE, getFantasyComparison } from '../utils/fantasy';
import { samePlayerName } from '../utils/playerNames';
import { authHeaders, clearAuth } from '../utils/auth';
import { enterDelay } from '../utils/scrollReveal';
import './Recommendations.css';

const RecommendationChart = () => {
    const { stat } = useParams();
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // Set when the endpoint rejects a signed-out / expired request (401).
    const [needsAuth, setNeedsAuth] = useState(false);

    // States for player details modal
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [loadingPlayer, setLoadingPlayer] = useState(false);

    const handlePlayerClick = async (player) => {
        setLoadingPlayer(true);
        try {
            const pName = player.PLAYER_NAME || player.name || '';
            const response = await fetch(`${API_BASE_URL}/players/search-all?query=${encodeURIComponent(pName)}`);
            const data = await response.json();
            const match = (data.players || []).find(p => samePlayerName(p.name, player.PLAYER_NAME || player.name));
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
                setNeedsAuth(false);
                const response = await fetch(`${API_BASE_URL}/recommendations/${stat}`, {
                    headers: authHeaders(),
                });

                if (response.status === 401) {
                    // Signed out or token expired: drop any stale token and prompt to sign in.
                    clearAuth();
                    setNeedsAuth(true);
                    setError(null);
                    return;
                }
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

    if (needsAuth) {
        return (
            <div className="recommendations-wrapper">
                <div className="predictions-locked" data-enter>
                    <div className="predictions-locked-icon" aria-hidden="true">🔒</div>
                    <h2 className="predictions-locked-title">Sign in to see full predictions</h2>
                    <p className="predictions-locked-desc">
                        Breakout recommendations are a free account feature. Create an account
                        or log in to unlock AI-projected breakout candidates.
                    </p>
                    <div className="predictions-locked-actions">
                        <Link to="/login" state={{ from: `/recommendations/${stat}` }} className="empty-cta">Log In</Link>
                        <Link to="/create-account" state={{ from: `/recommendations/${stat}` }} className="empty-cta prediction-auth-secondary">
                            Create Account
                        </Link>
                    </div>
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
    // The API key for fantasy points is FANTASY (matching its FANTASY_LAST/PREDICTED_FANTASY columns).
    const statLabel = stat === 'FANTASY' ? 'FPTS' : stat;
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
            case 'FANTASY':
                return {
                    title: "Fantasy Risers",
                    desc: "Players projected to add the most FanDuel fantasy points per game, counting every stat they fill."
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
            <header className="recommendations-header" data-enter>
                <div className="stats-nav-top">
                    <Link to="/recommendations" className="back-to-home">← RADAR</Link>
                    <span className="cv-section-badge">AI SPOTLIGHT</span>
                </div>
                <h1 className="recommendations-title">
                    {wording.title.toUpperCase()}
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

                            // Bar fill as a 0-1 fraction of the stat's scale; CSS scales the bar by it
                            const maxScale = stat === 'PRA' || stat === 'FANTASY' ? 60 : stat === 'PPG' ? 40 : 20;
                            const currentFill = Math.min(Math.max(lastKeyVal / maxScale, 0), 1);
                            const predictedFill = Math.min(Math.max(predictedKeyVal / maxScale, 0), 1);
                            const fantasy = getFantasyComparison(player);

                            return (
                            <TiltCard
                                key={player.PLAYER_NAME ?? index}
                                className="recommendation-card analytic-card"
                                data-enter
                                style={enterDelay(index + 1)}
                                cta="Full projection"
                            >
                                <div className="card-header">
                                    <span className="rank-badge">#{index + 1}</span>
                                    <span className="category-badge team-code">{player.TEAM}</span>
                                </div>
                                <div className="card-body">
                                    <h3 className="insight-title">
                                        <button type="button" className="card-open" onClick={() => handlePlayerClick(player)}>
                                            {player.PLAYER_NAME}
                                        </button>
                                    </h3>
                                    
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
                                                <span className="bar-lbl">Current {statLabel}</span>
                                                <span className="bar-val">{lastKeyVal.toFixed(1)}</span>
                                            </div>
                                            <div className="bar-track">
                                                <div className="bar-fill current" style={{ '--fill': currentFill }}></div>
                                            </div>
                                        </div>

                                        <div className="bar-container projected">
                                            <div className="bar-header">
                                                <span className="bar-lbl">AI Projected {statLabel}</span>
                                                <span className="bar-val">{predictedKeyVal.toFixed(1)}</span>
                                            </div>
                                            <div className="bar-track">
                                                <div className="bar-fill projected" style={{ '--fill': predictedFill }}></div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* On the fantasy list the bars already show FPTS, so this row would repeat them. */}
                                    {fantasy && stat !== 'FANTASY' && (
                                        <div className="rec-fantasy-row">
                                            <span className="bar-lbl" title={FPTS_TITLE}>Fantasy (FPTS)</span>
                                            <span className="rec-fantasy-val" data-numeric>
                                                {fantasy.last.toFixed(1)} → <strong>{fantasy.predicted.toFixed(1)}</strong>
                                            </span>
                                            {player.so_far_fantasy != null && (
                                                <span className="rec-fantasy-so-far" data-numeric>
                                                    2026-27 so far {Number(player.so_far_fantasy).toFixed(1)}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </TiltCard>
                            );
                        })}
                    </div>
                )}
            </div>

            <PlayerStatsModal player={selectedPlayer} loading={loadingPlayer} onClose={() => setSelectedPlayer(null)} />
        </div>
    );
};

export default RecommendationChart;
