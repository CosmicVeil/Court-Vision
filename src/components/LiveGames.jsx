import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./LiveGames.css";

const API = "";
const STATUS_LIVE  = 2;
const STATUS_FINAL = 3;

function QuarterTable({ home, away }) {
  const maxQ = Math.max(home.quarters?.length || 0, away.quarters?.length || 0, 4);
  const labels = Array.from({ length: maxQ }, (_, i) => i < 4 ? `Q${i+1}` : `OT${i-3}`);
  const score = (quarters, q) => { const p = quarters?.find(x => x.q === q+1); return p ? p.score : "-"; };
  return (
    <div className="quarter-table-wrap">
      <table className="quarter-table">
        <thead><tr><th>Team</th>{labels.map(l => <th key={l}>{l}</th>)}<th>T</th></tr></thead>
        <tbody>
          {[away, home].map(team => (
            <tr key={team.tricode}>
              <td className="team-cell">
                {team.logo && <img src={team.logo} alt={team.tricode} className="q-logo" />}
                <span>{team.tricode}</span>
              </td>
              {labels.map((_, i) => <td key={i}>{score(team.quarters, i)}</td>)}
              <td className="total-cell">{team.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlayerRow({ player, onClick, isFuture }) {
  return (
    <tr className={`player-row ${player.oncourt ? "oncourt" : ""}`} onClick={() => onClick(player)}>
      <td className="player-name-cell">
        {player.oncourt && <span className="live-dot" />}
        <span className="pname">{player.name}</span>
        <span className="ppos">{player.position}</span>
      </td>
      <td>{isFuture ? "–" : player.min}</td>
      <td className="stat-highlight">{player.pts}</td>
      <td>{player.reb}</td>
      <td>{player.ast}</td>
      <td>{player.stl}</td>
      <td>{player.blk}</td>
      {isFuture ? (
        <>
          <td className="season-stat">{player.season_ppg ?? "–"}</td>
          <td className="season-stat">{player.season_rpg ?? "–"}</td>
          <td className="season-stat">{player.season_apg ?? "–"}</td>
        </>
      ) : (
        <>
          <td>{player.fgm}/{player.fga}</td>
          <td>{player.fg3m}/{player.fg3a}</td>
          <td>{player.ftm}/{player.fta}</td>
          <td className={player.plusMinus > 0 ? "plus" : player.plusMinus < 0 ? "minus" : ""}>
            {player.plusMinus > 0 ? `+${player.plusMinus}` : player.plusMinus}
          </td>
        </>
      )}
    </tr>
  );
}

function BoxScore({ game, onPlayerClick }) {
  const [tab, setTab] = useState("home");
  const isFuture = Number(game.status) === 1;
  const players  = game.players?.[tab] || [];
  const starters = players.slice(0, 5);
  const bench    = players.slice(5);

  return (
    <div className="boxscore">
      <div className="bs-tabs">
        {["away", "home"].map(side => (
          <button key={side} className={`bs-tab ${tab === side ? "active" : ""}`} onClick={() => setTab(side)}>
            {game[side].logo && <img src={game[side].logo} alt="" className="tab-logo" />}
            {game[side].city} {game[side].name}
          </button>
        ))}
      </div>

      {isFuture && (
        <div className="future-note">
          Season averages shown &nbsp;·&nbsp; Game stats update at tip-off
        </div>
      )}

      <div className="player-table-wrap">
        <table className="player-table">
          <thead>
            <tr>
              <th>Player</th><th>MIN</th>
              <th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th>
              {isFuture
                ? <><th className="season-header">S·PPG</th><th className="season-header">S·RPG</th><th className="season-header">S·APG</th></>
                : <><th>FG</th><th>3P</th><th>FT</th><th>+/-</th></>
              }
            </tr>
          </thead>
          <tbody>
            {starters.length > 0 && <tr className="group-header"><td colSpan={12}>{isFuture ? "Roster (by PPG)" : "Starters"}</td></tr>}
            {starters.map(p => <PlayerRow key={p.personId} player={p} onClick={onPlayerClick} isFuture={isFuture} />)}
            {bench.length > 0 && <tr className="group-header"><td colSpan={12}>Bench</td></tr>}
            {bench.map(p => <PlayerRow key={p.personId} player={p} onClick={onPlayerClick} isFuture={isFuture} />)}
            {players.length === 0 && <tr><td colSpan={12} className="no-data">No player data available</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GameCard({ game, onPlayerClick }) {
  const [expanded, setExpanded] = useState(false);
  const isLive   = game.status === STATUS_LIVE;
  const isFinal  = game.status === STATUS_FINAL;
  const isFuture = game.status === 1;
  const hasPlayers = (game.players?.home?.length > 0 || game.players?.away?.length > 0);

  return (
    <div className={`game-card ${isLive ? "live" : isFinal ? "final" : "future"}`}>
      {isLive && <div className="live-pulse-ring" />}
      <div className="game-card-header" onClick={() => hasPlayers && setExpanded(e => !e)}>
        <div className={`status-badge ${isLive ? "badge-live" : isFinal ? "badge-final" : "badge-upcoming"}`}>
          {isLive && <span className="pulse-dot" />}
          {isLive ? `Q${game.period} · ${game.gameClock || ""}` : game.statusText}
        </div>
        <div className="matchup">
          <div className={`team-block ${!isFuture && game.away.score > game.home.score ? "winning" : ""}`}>
            {game.away.logo ? <img src={game.away.logo} alt={game.away.tricode} className="team-logo" /> : <div className="team-logo-placeholder">{game.away.tricode}</div>}
            <span className="team-tricode">{game.away.tricode}</span>
            {game.away.record && <span className="team-record">{game.away.record}</span>}
            <span className={`team-score ${isFuture ? "score-future" : ""}`}>{isFuture ? "–" : game.away.score}</span>
          </div>
          <div className="vs-divider">
            {!isFuture ? <span className="vs-dash">—</span> : <span className="vs-text">VS</span>}
          </div>
          <div className={`team-block ${!isFuture && game.home.score > game.away.score ? "winning" : ""}`}>
            {game.home.logo ? <img src={game.home.logo} alt={game.home.tricode} className="team-logo" /> : <div className="team-logo-placeholder">{game.home.tricode}</div>}
            <span className="team-tricode">{game.home.tricode}</span>
            {game.home.record && <span className="team-record">{game.home.record}</span>}
            <span className={`team-score ${isFuture ? "score-future" : ""}`}>{isFuture ? "–" : game.home.score}</span>
          </div>
        </div>
        {game.arena && <div className="arena-label">{game.arena}</div>}
        {hasPlayers && (
          <button className="expand-btn">{expanded ? "Hide Roster ▲" : (isFuture ? "View Roster ▼" : "View Details ▼")}</button>
        )}
      </div>

      {expanded && hasPlayers && (
        <div className="game-detail">
          {!isFuture && <QuarterTable home={game.home} away={game.away} />}
          <BoxScore game={game} onPlayerClick={onPlayerClick} />
        </div>
      )}
    </div>
  );
}

export default function LiveGames() {
  const navigate = useNavigate();
  const [todayGames,    setTodayGames]    = useState([]);
  const [upcomingGames, setUpcomingGames] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [tab,           setTab]           = useState("today");
  const [lastUpdated,   setLastUpdated]   = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  const [modalTab, setModalTab] = useState('current');

  // Dismiss modal on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setSelectedPlayer(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchGames = useCallback(async () => {
    try {
      const [todayRes, upRes] = await Promise.all([
        fetch(`${API}/api/games/today`),
        fetch(`${API}/api/games/upcoming`),
      ]);
      const todayData = await todayRes.json();
      const upData    = await upRes.json();
      setTodayGames(todayData.games || []);
      setUpcomingGames(upData.games || []);
      setLastUpdated(new Date());
    } catch (e) {
      console.error("Failed to fetch games", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGames();
    const interval = setInterval(fetchGames, 30000);
    return () => clearInterval(interval);
  }, [fetchGames]);

  const handlePlayerClick = async (player) => {
    setLoadingPlayer(true);
    setModalTab('current');
    try {
      const response = await fetch(`/api/players/search-all?query=${encodeURIComponent(player.name)}`);
      const data = await response.json();
      const match = (data.players || []).find(p => p.name.toLowerCase() === player.name.toLowerCase());
      if (match) {
        setSelectedPlayer(match);
      } else {
        setSelectedPlayer({
          name: player.name,
          team: player.team || 'UNK',
          position: player.position || 'UNK',
          current_stats: {
            ppg: player.pts || 0,
            rpg: player.reb || 0,
            apg: player.ast || 0,
            spg: player.stl || 0,
            bpg: player.blk || 0,
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

  const liveGames   = todayGames.filter(g => Number(g.status) === 2);
  const finalGames  = todayGames.filter(g => Number(g.status) === 3);
  const todayFuture = todayGames.filter(g => Number(g.status) === 1);
  const displayToday = [...todayGames].sort((a, b) => {
    const order = { 2: 0, 1: 1, 3: 2 }; // live → future → final
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  return (
    <div className="lg-page">
      <div className="lg-hero">
        <div className="lg-hero-bg" />
        <Link to="/" className="back-to-home">← Back to Home</Link>
        <h1 className="lg-title">
          <span className="lg-title-dim">NBA</span>
          <span className="lg-title-accent"> LIVE</span>
        </h1>
        <p className="lg-subtitle">Real-time scores · Boxscores · Player stats</p>
        {lastUpdated && (
          <div className="last-updated">
            Updated {lastUpdated.toLocaleTimeString()}
            <button className="refresh-btn" onClick={fetchGames}>↻ Refresh</button>
          </div>
        )}
      </div>

      <div className="lg-tabs">
        <button className={`lg-tab ${tab === "today" ? "active" : ""}`} onClick={() => setTab("today")}>
          Today
          {liveGames.length > 0 && <span className="live-badge">{liveGames.length} LIVE</span>}
        </button>
        <button className={`lg-tab ${tab === "upcoming" ? "active" : ""}`} onClick={() => setTab("upcoming")}>
          Upcoming
          {upcomingGames.length > 0 && <span className="count-badge">{upcomingGames.length}</span>}
        </button>
      </div>

      <div className="lg-content">
        {loading ? (
          <div className="lg-loading"><div className="spinner" /><p>Loading games...</p></div>
        ) : tab === "today" ? (
          displayToday.length === 0 ? (
            <div className="no-games">
              <h3>No games scheduled today</h3>
              <p>Check the Upcoming tab for future games</p>
            </div>
          ) : (
            <div className="games-grid">
              {displayToday.map(g => <GameCard key={g.gameId} game={g} onPlayerClick={handlePlayerClick} />)}
            </div>
          )
        ) : (
          upcomingGames.length === 0 ? (
            <div className="no-games"><h3>No upcoming games found</h3></div>
          ) : (
            <div className="games-grid">
              {upcomingGames.map(g => <GameCard key={g.gameId} game={g} onPlayerClick={handlePlayerClick} />)}
            </div>
          )
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
                        <div className="ai-pred-cards-grid">
                          {['ppg', 'apg', 'rpg'].map((stat) => {
                            const labels = { ppg: 'Points Per Game (PPG)', apg: 'Assists Per Game (APG)', rpg: 'Rebounds Per Game (RPG)' };
                            const units = { ppg: 'PPG', apg: 'APG', rpg: 'RPG' };
                            const imp = selectedPlayer.ml_stats.improvements[stat];
                            return (
                              <div className="ai-pred-box" key={stat}>
                                <div className="ai-pred-box-label">{labels[stat]}</div>
                                <div className="ai-pred-values-flex">
                                  <span className="ai-pred-num old">{selectedPlayer.current_stats[stat]} <small>{units[stat]}</small></span>
                                  <span className="ai-pred-arrow">→</span>
                                  <span className="ai-pred-num new">{selectedPlayer.ml_stats.predicted_stats[stat]} <small>{units[stat]}</small></span>
                                </div>
                                <div className={`ai-pred-badge ${imp >= 0 ? 'positive' : 'negative'}`}>{imp >= 0 ? '+' : ''}{imp}%</div>
                              </div>
                            );
                          })}
                        </div>
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
}