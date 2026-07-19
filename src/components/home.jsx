import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./home.css";
import AIPredictions from "./AIPredictions";
import PlayerPredictionGrid from "./PlayerPredictionGrid";
import { isAuthenticated, getUser, logout } from "../utils/auth";

const API = "";

const BasketballAnimation = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    class GlowingOrb {
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 6 + 2;
        this.speedX = (Math.random() - 0.5) * 1.5;
        this.speedY = (Math.random() - 0.5) * 1.5;
        this.baseOpacity = Math.random() * 0.5 + 0.2;
        this.color = Math.random() > 0.5 ? '#ff4500' : '#e53935';
        this.pulsePhase = Math.random() * Math.PI * 2;
      }
      update() {
        this.x += this.speedX; this.y += this.speedY; this.pulsePhase += 0.05;
        if (this.x < -this.size) this.x = canvas.width + this.size;
        if (this.x > canvas.width + this.size) this.x = -this.size;
        if (this.y < -this.size) this.y = canvas.height + this.size;
        if (this.y > canvas.height + this.size) this.y = -this.size;
      }
      draw() {
        const op = this.baseOpacity + Math.sin(this.pulsePhase) * 0.2;
        ctx.save(); ctx.globalAlpha = op;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.shadowBlur = 15; ctx.shadowColor = this.color;
        ctx.fill(); ctx.restore();
      }
    }
    const orbs = Array.from({ length: 40 }, () => new GlowingOrb());
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      orbs.forEach(o => { o.update(); o.draw(); });
      ctx.lineWidth = 0.5;
      for (let i = 0; i < orbs.length; i++)
        for (let j = i + 1; j < orbs.length; j++) {
          const dx = orbs[i].x - orbs[j].x, dy = orbs[i].y - orbs[j].y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255,69,0,${0.2*(1-dist/150)})`;
            ctx.moveTo(orbs[i].x, orbs[i].y); ctx.lineTo(orbs[j].x, orbs[j].y);
            ctx.stroke();
          }
        }
      requestAnimationFrame(animate);
    }
    animate();
    const onResize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return <canvas ref={canvasRef} className="basketball-canvas" />;
};

function TrendingGameCard({ game }) {
  const isLive   = game.status === 2;
  const isFinal  = game.status === 3;
  const isFuture = game.status === 1;
  const homeWin  = game.home.score > game.away.score;
  const awayWin  = game.away.score > game.home.score;
  return (
    <div className="featured-card">
      <div className={`featured-badge ${isLive ? "" : "upcoming"}`}>
        {isLive && <span className="trend-live-dot" />}
        {isLive ? `LIVE · Q${game.period}` : isFinal ? "FINAL" : game.statusText}
      </div>
      <div className="featured-content">
        <div className="trend-matchup">
          <div className={`trend-team ${!isFuture && awayWin ? "trend-winner" : ""}`}>
            {game.away.logo && <img src={game.away.logo} alt={game.away.tricode} className="trend-logo" />}
            <span className="trend-tricode">{game.away.tricode}</span>
            <span className="trend-score">{isFuture ? "–" : game.away.score}</span>
          </div>
          <span className="trend-vs">VS</span>
          <div className={`trend-team ${!isFuture && homeWin ? "trend-winner" : ""}`}>
            {game.home.logo && <img src={game.home.logo} alt={game.home.tricode} className="trend-logo" />}
            <span className="trend-tricode">{game.home.tricode}</span>
            <span className="trend-score">{isFuture ? "–" : game.home.score}</span>
          </div>
        </div>
        {isLive && game.gameClock && <p className="featured-time">{game.gameClock} remaining in Q{game.period}</p>}
        {isFuture && game.arena && <p className="featured-time">{game.arena}</p>}
        <Link to="/games" className="featured-link">
          {isLive ? "Watch Live →" : isFinal ? "View Boxscore →" : "View Details →"}
        </Link>
      </div>
    </div>
  );
}

function PRACard({ player, onPlayerClick }) {
  if (!player) return null;
  return (
    <div 
      className="featured-card pra-card clickable-pra-card" 
      onClick={() => onPlayerClick && onPlayerClick(player.name)}
      style={{ cursor: 'pointer' }}
    >
      <div className="featured-badge highlight">WEEK'S BEST PRA</div>
      <div className="featured-content">
        <h3 className="pra-name">{player.name}</h3>
        <p className="pra-meta">{player.team} · {player.position}</p>
        <div className="pra-stats-row">
          <div className="pra-stat"><span className="pra-val">{player.ppg}</span><span className="pra-lbl">PPG</span></div>
          <div className="pra-stat"><span className="pra-val">{player.rpg}</span><span className="pra-lbl">RPG</span></div>
          <div className="pra-stat"><span className="pra-val">{player.apg}</span><span className="pra-lbl">APG</span></div>
          <div className="pra-stat pra-total"><span className="pra-val">{player.pra}</span><span className="pra-lbl">PRA</span></div>
        </div>
        <div className="featured-link">
          Click for Full Stats →
        </div>
      </div>
    </div>
  );
}

function TrendingSection({ onPlayerClick }) {
  const [liveGames,   setLiveGames]   = useState([]);
  const [futureGames, setFutureGames] = useState([]);
  const [praPlayer,   setPraPlayer]   = useState(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const [todayRes, upRes, praRes] = await Promise.all([
          fetch(`${API}/api/games/today`),
          fetch(`${API}/api/games/upcoming`),
          fetch(`${API}/api/stats/top-pra`),
        ]);
        const today    = await todayRes.json();
        const upcoming = await upRes.json();
        const pra      = await praRes.json();

        const todayGames    = today.games    || [];
        const upcomingGames = upcoming.games || [];

        const live   = todayGames.filter(g => g.status === 2);
        const final  = todayGames.filter(g => g.status === 3);
        const todayF = todayGames.filter(g => g.status === 1);

        // Live games fill slots 1+2; otherwise take 2 future games
        const gameCards = live.length > 0
          ? [...live, ...final, ...todayF].slice(0, 2)
          : [...todayF, ...upcomingGames].slice(0, 2);

        setLiveGames(gameCards);
        setFutureGames(upcomingGames);
        setPraPlayer(pra.name ? pra : null);
      } catch (e) {
        console.error("Trending fetch failed", e);
      } finally {
        setLoading(false);
      }
    };
    fetch_();
  }, []);

  if (loading) {
    return (
      <div className="featured-grid">
        {[0,1,2].map(i => (
          <div key={i} className="featured-card trend-skeleton">
            <div className="skeleton-badge" /><div className="skeleton-body" />
          </div>
        ))}
      </div>
    );
  }

  const cards = liveGames.length === 0 && !praPlayer ? (
    <div className="featured-card trend-empty">
      <div className="featured-badge upcoming">NO GAMES</div>
      <div className="featured-content">
        <h3>No games today</h3>
        <p className="featured-time">Check back later for live updates</p>
        <Link to="/games" className="featured-link">View Schedule →</Link>
      </div>
    </div>
  ) : (
    <>
      {liveGames.map(g => <TrendingGameCard key={g.gameId} game={g} />)}
      <PRACard player={praPlayer} onPlayerClick={onPlayerClick} />
    </>
  );

  return <div className="featured-grid">{cards}</div>;
}

const Home = () => {
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);

  // States for search and popup modal
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [modalTab, setModalTab] = useState("current"); // current, predictions, history
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  const searchContainerRef = useRef(null);

  const handlePlayerClick = async (playerName) => {
    setLoadingPlayer(true);
    setModalTab('current');
    try {
      const response = await fetch(`/api/players/search-all?query=${encodeURIComponent(playerName)}`);
      const data = await response.json();
      const match = (data.players || []).find(p => p.name.toLowerCase() === playerName.toLowerCase());
      if (match) {
        setSelectedPlayer(match);
      } else {
        setSelectedPlayer({
          name: playerName,
          current_stats: { ppg: 0, apg: 0, rpg: 0, spg: 0, bpg: 0, tov: 0, mpg: 0, fg_pct: 0, fg3_pct: 0, ft_pct: 0, games_played: 0, minutes: 0 },
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

  useEffect(() => {
    const authenticated = isAuthenticated();
    setIsLoggedIn(authenticated);
    if (authenticated) setUser(getUser());
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setIsDropdownOpen(false);
    };
    if (isDropdownOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isDropdownOpen]);

  // Click outside to dismiss search results
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setSearchResults([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard handlers for Esc key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setSelectedPlayer(null);
        setSearchResults([]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Autocomplete fetch logic
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setIsSearching(true);
        try {
          const response = await fetch(`/api/players/search-all?query=${encodeURIComponent(searchQuery)}`);
          const data = await response.json();
          setSearchResults(data.players || []);
        } catch (error) {
          console.error("Error searching players:", error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleLogout = async () => {
    await logout();
    setIsLoggedIn(false); setUser(null); setIsDropdownOpen(false);
    navigate("/");
  };

  return (
    <div className="main-wrapper">
      <BasketballAnimation />
      <header className="header">
        <div className="header-left">
          <span className="header-title">COURT VISION</span>
        </div>
        <nav className="header-nav">
          <Link to="/stats">STATS</Link>
          <Link to="/games">LIVE GAMES</Link>
          <Link to="/predictions">PREDICTIONS</Link>
          <Link to="/recommendations">RECOMMENDATIONS</Link>
          <Link to="/favourites">FAVOURITES</Link>
          <Link to="/contact">CONTACT</Link>
        </nav>
        <div className="header-profile" ref={dropdownRef}>
          <button className="profile-btn" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
            {isLoggedIn && user
              ? <div className="profile-initials">{user.first_name?.[0]?.toUpperCase()}{user.last_name?.[0]?.toUpperCase()}</div>
              : <img src="/images/profile_image.jpg" alt="Profile" className="profile-img" />}
          </button>
          {isDropdownOpen && (
            <div className="profile-dropdown">
              {isLoggedIn && user ? (
                <>
                  <div className="dropdown-user-info">
                    <div className="dropdown-user-name">{user.first_name} {user.last_name}</div>
                    <div className="dropdown-user-email">{user.email}</div>
                  </div>
                  <div className="dropdown-divider" />
                  <Link to="/favourites" className="dropdown-item" onClick={() => setIsDropdownOpen(false)}>My Favourites</Link>
                  <Link to="/recommendations" className="dropdown-item" onClick={() => setIsDropdownOpen(false)}>Recommendations</Link>
                  <div className="dropdown-divider" />
                  <button className="dropdown-item logout-btn" onClick={handleLogout}>Logout</button>
                </>
              ) : (
                <>
                  <Link to="/login" className="dropdown-item" onClick={() => setIsDropdownOpen(false)}>Login</Link>
                  <Link to="/create-account" className="dropdown-item" onClick={() => setIsDropdownOpen(false)}>Create Account</Link>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <section className="hero-split-bg">
        <div className="hero-center-content">
          <h1 className="hero-title">
            <span className="highlight">COURT</span> VISION
          </h1>
          <p className="hero-subtitle">Your Ultimate Destination for Basketball Insights, Stats, and AI-Powered Predictions</p>
          
          {/* Custom Search Bar with Autocomplete suggestions */}
          <div className="hero-search-wrapper" ref={searchContainerRef}>
            <div className="search-bar-container">
              <svg className="search-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input
                type="text"
                className="search-input-field"
                placeholder="Search NBA player (e.g. LeBron James, Stephen Curry)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {isSearching && <div className="search-spinner"></div>}
              {searchQuery && (
                <button className="clear-search-btn" onClick={() => setSearchQuery("")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              )}
            </div>
            
            {searchResults.length > 0 && (
              <div className="search-results-dropdown">
                {searchResults.map((player) => (
                  <div 
                    key={player.name} 
                    className="search-result-item"
                    onClick={() => {
                      setSelectedPlayer(player);
                      setModalTab("current");
                      setSearchResults([]);
                      setSearchQuery("");
                    }}
                  >
                    <div className="search-result-player-info">
                      <span className="search-result-player-name">{player.name}</span>
                      <span className="search-result-player-meta">{player.position} · Age {player.age}</span>
                    </div>
                    <span className="search-result-player-team">{player.team}</span>
                  </div>
                ))}
              </div>
            )}
            
            {searchQuery.trim().length >= 2 && !isSearching && searchResults.length === 0 && (
              <div className="search-results-dropdown">
                <div className="search-dropdown-no-results">No players found matching "{searchQuery}"</div>
              </div>
            )}
          </div>

          <div className="hero-cta">
            <Link to="/stats" className="cta-button primary">Explore Stats</Link>
            <Link to="/recommendations" className="cta-button secondary">Get Recommendations</Link>
          </div>
        </div>
      </section>

      <section className="featured-section">
        <div className="featured-container">
          <h2 className="section-title">Trending Now</h2>
          <p className="section-description">Live scores, upcoming matchups, and this week's standout performer</p>
          <TrendingSection onPlayerClick={handlePlayerClick} />
        </div>
      </section>

      <section className="how-it-works-section">
        <div className="how-it-works-container">
          <h2 className="section-title">How It Works</h2>
          <p className="section-description">Get started in three simple steps and unlock the power of AI-driven basketball insights</p>
          <div className="steps-container">
            <div className="step-item">
              <div className="step-number">01</div>
              <div className="step-content"><h3>Create Your Account</h3><p>Sign up in seconds and personalize your experience with your favorite teams and players.</p></div>
            </div>
            <div className="step-connector" />
            <div className="step-item">
              <div className="step-number">02</div>
              <div className="step-content"><h3>Explore & Analyze</h3><p>Dive into comprehensive statistics, AI predictions, and personalized recommendations.</p></div>
            </div>
            <div className="step-connector" />
            <div className="step-item">
              <div className="step-number">03</div>
              <div className="step-content"><h3>Stay Ahead</h3><p>Get real-time updates, save favorites, and make informed decisions with cutting-edge insights.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section id="ai-predictions" className="ai-section">
        <div className="ai-content">
          <h2 className="section-title">AI Predictions</h2>
          <p className="section-description">Get ahead of the game with our cutting-edge AI predictions powered by advanced analytics</p>
          <AIPredictions onPlayerClick={(p) => handlePlayerClick(p.PLAYER_NAME || p.name)} />
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-container">
          <h2 className="cta-title">Ready to Elevate Your Basketball Experience?</h2>
          <p className="cta-description">Join thousands of basketball enthusiasts and get access to exclusive insights, predictions, and more.</p>
          <div className="cta-buttons">
            <Link to="/login" className="cta-button primary large">Get Started</Link>
            <Link to="/create-account" className="cta-button secondary large">Create Account</Link>
          </div>
        </div>
      </section>

      {/* Interactive Glassmorphic Stats Popup Modal */}
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
              <button 
                className={`stats-modal-tab-btn ${modalTab === "current" ? "active" : ""}`}
                onClick={() => setModalTab("current")}
              >
                Current Stats
              </button>
              <button 
                className={`stats-modal-tab-btn ${modalTab === "predictions" ? "active" : ""}`}
                onClick={() => setModalTab("predictions")}
              >
                AI Predictions
              </button>
              <button 
                className={`stats-modal-tab-btn ${modalTab === "history" ? "active" : ""}`}
                onClick={() => setModalTab("history")}
              >
                Career History
              </button>
            </div>

            <div className="stats-modal-body">
              {modalTab === "current" && (
                <div>
                  <div className="stats-grid-container">
                    <div className="stat-box-card">
                      <div className="stat-box-value highlighted">{selectedPlayer.current_stats.ppg}</div>
                      <div className="stat-box-label">PPG</div>
                    </div>
                    <div className="stat-box-card">
                      <div className="stat-box-value">{selectedPlayer.current_stats.apg}</div>
                      <div className="stat-box-label">APG</div>
                    </div>
                    <div className="stat-box-card">
                      <div className="stat-box-value">{selectedPlayer.current_stats.rpg}</div>
                      <div className="stat-box-label">RPG</div>
                    </div>
                    <div className="stat-box-card">
                      <div className="stat-box-value">{selectedPlayer.current_stats.spg}</div>
                      <div className="stat-box-label">SPG</div>
                    </div>
                    <div className="stat-box-card">
                      <div className="stat-box-value">{selectedPlayer.current_stats.bpg}</div>
                      <div className="stat-box-label">BPG</div>
                    </div>
                  </div>

                  <div className="secondary-stats-container">
                    <h3 className="secondary-stats-title">Shooting & Playing Time</h3>
                    <div className="percentage-stat-row">
                      <div className="percentage-stat-header">
                        <span className="percentage-stat-name">Field Goal (FG%)</span>
                        <span className="percentage-stat-value">{selectedPlayer.current_stats.fg_pct}%</span>
                      </div>
                      <div className="percentage-stat-track">
                        <div className="percentage-stat-bar" style={{ width: `${selectedPlayer.current_stats.fg_pct}%` }}></div>
                      </div>
                    </div>
                    <div className="percentage-stat-row">
                      <div className="percentage-stat-header">
                        <span className="percentage-stat-name">3-Point (3PT%)</span>
                        <span className="percentage-stat-value">{selectedPlayer.current_stats.fg3_pct}%</span>
                      </div>
                      <div className="percentage-stat-track">
                        <div className="percentage-stat-bar" style={{ width: `${selectedPlayer.current_stats.fg3_pct}%` }}></div>
                      </div>
                    </div>
                    <div className="percentage-stat-row">
                      <div className="percentage-stat-header">
                        <span className="percentage-stat-name">Free Throw (FT%)</span>
                        <span className="percentage-stat-value">{selectedPlayer.current_stats.ft_pct}%</span>
                      </div>
                      <div className="percentage-stat-track">
                        <div className="percentage-stat-bar" style={{ width: `${selectedPlayer.current_stats.ft_pct}%` }}></div>
                      </div>
                    </div>
                    <div className="percentage-stat-row" style={{ marginTop: "1.5rem" }}>
                      <div className="percentage-stat-header" style={{ marginBottom: 0 }}>
                        <span className="percentage-stat-name">Games Played / Playing Time</span>
                        <span className="percentage-stat-value">{selectedPlayer.current_stats.games_played} Games | {selectedPlayer.current_stats.minutes} MPG</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {modalTab === "predictions" && (
                <div>
                  {selectedPlayer.ml_stats ? (
                    <PlayerPredictionGrid
                      currentStats={selectedPlayer.current_stats}
                      predictionStats={selectedPlayer.ml_stats.predicted_stats}
                      improvements={selectedPlayer.ml_stats.improvements}
                    />
                  ) : (
                    <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>
                      AI Prediction model is currently loading or unavailable for this player.
                    </div>
                  )}
                </div>
              )}

              {modalTab === "history" && (
                <div className="stats-history-table-container">
                  <div className="stats-history-scroll-box">
                    <table className="stats-history-table">
                      <thead>
                        <tr>
                          <th>Season</th>
                          <th>GP</th>
                          <th>MIN</th>
                          <th>PPG</th>
                          <th>RPG</th>
                          <th>APG</th>
                          <th>SPG</th>
                          <th>BPG</th>
                          <th>FG%</th>
                          <th>3P%</th>
                          <th>FT%</th>
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

export default Home;
