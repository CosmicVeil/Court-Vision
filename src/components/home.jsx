import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./home.css";
import AIPredictions from "./AIPredictions";
import { isAuthenticated, getUser, logout } from "../utils/auth";

const API = "http://localhost:5000";

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

function PRACard({ player }) {
  if (!player) return null;
  return (
    <div className="featured-card pra-card">
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
        <Link to={`/stats?search=${encodeURIComponent(player.name)}`} className="featured-link">
          View Full Stats →
        </Link>
      </div>
    </div>
  );
}

function TrendingSection() {
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
      <PRACard player={praPlayer} />
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
          <TrendingSection />
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
          <AIPredictions />
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
    </div>
  );
};

export default Home;