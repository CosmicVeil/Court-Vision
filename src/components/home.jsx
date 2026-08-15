import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./home.css";
import AIPredictions from "./AIPredictions";
import PlayerPredictionGrid from "./PlayerPredictionGrid";
import { isAuthenticated, getUser, logout } from "../utils/auth";
import { buildApiUrl } from "../config/api";

/* Scroll-reveal hook using IntersectionObserver */
function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
          }
        });
      },
      { threshold: 0.05, rootMargin: '0px 0px 100px 0px' }
    );
    document.querySelectorAll('.scroll-reveal, .scroll-reveal-left, .scroll-reveal-scale').forEach((el) => {
      observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);
}

function TrendingGameCard({ game }) {
  const isLive = game.status === 2;
  const isFinal = game.status === 3;
  const isFuture = game.status === 1;
  const homeWin = game.home.score > game.away.score;
  const awayWin = game.away.score > game.home.score;
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
  const [liveGames, setLiveGames] = useState([]);
  const [futureGames, setFutureGames] = useState([]);
  const [praPlayer, setPraPlayer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const [todayRes, upRes, praRes] = await Promise.all([
          fetch(buildApiUrl('games/today')),
          fetch(buildApiUrl('games/upcoming')),
          fetch(buildApiUrl('stats/top-pra')),
        ]);
        const today = await todayRes.json();
        const upcoming = await upRes.json();
        const pra = await praRes.json();

        const todayGames = today.games || [];
        const upcomingGames = upcoming.games || [];

        const live = todayGames.filter(g => g.status === 2);
        const final = todayGames.filter(g => g.status === 3);
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
        {[0, 1, 2].map(i => (
          <div key={i} className="featured-card trend-skeleton">
            <div className="skeleton-badge" /><div className="skeleton-body" />
          </div>
        ))}
      </div>
    );
  }

  const cards = liveGames.length === 0 && !praPlayer ? (
    <div className="featured-card trend-empty">
      <div className="featured-badge upcoming">LIVE SLATE</div>
      <div className="featured-content trend-empty-content">
        <div className="trend-empty-radar">
          <div className="trend-empty-dot" />
        </div>
        <div className="trend-empty-info">
          <h3>NO LIVE GAMES TODAY</h3>
          <p className="featured-time">Neural projection models & player stat trackers are active for upcoming matchups</p>
          <Link to="/games" className="cta-button primary trend-empty-cta">VIEW GAME SCHEDULE →</Link>
        </div>
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

const COURT_LETTERS = [
  { char: "C", id: 0 },
  { char: "O", id: 1 },
  { char: "U", id: 2 },
  { char: "R", id: 3 },
  { char: "T", id: 4 },
];

const VISION_LETTERS = [
  { char: "V", id: 0 },
  { char: "I", id: 1 },
  { char: "S", id: 2 },
  { char: "I", id: 3 },
  { char: "O", id: 4 },
  { char: "N", id: 5 },
];

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

  const handlePlayerClick = async (playerInput) => {
    if (!playerInput) return;
    const playerName = typeof playerInput === 'string' ? playerInput : (playerInput.name || playerInput.PLAYER_NAME || '');
    if (!playerName) return;
    setLoadingPlayer(true);
    setModalTab('current');

    const fallbackStats = typeof playerInput === 'object' ? {
      ppg: playerInput.ppg || playerInput.PPG_LAST || playerInput.stats?.ppg_last || 0,
      apg: playerInput.apg || playerInput.APG_LAST || playerInput.stats?.apg_last || 0,
      rpg: playerInput.rpg || playerInput.RPG_LAST || playerInput.stats?.rpg_last || 0,
      spg: playerInput.spg || playerInput.SPG_LAST || playerInput.stats?.spg_last || 0,
      bpg: playerInput.bpg || playerInput.BPG_LAST || playerInput.stats?.bpg_last || 0,
      tov: playerInput.tov || playerInput.TOV_LAST || playerInput.stats?.tov_last || 0,
      mpg: playerInput.mpg || playerInput.MINUTES || playerInput.stats?.minutes || 0,
      fg_pct: playerInput.fg_pct || playerInput.FG_PCT_LAST || playerInput.stats?.fg_pct_last || 0,
      fg3_pct: playerInput.fg3_pct || playerInput.FG3_PCT_LAST || playerInput.stats?.fg3_pct_last || 0,
      ft_pct: playerInput.ft_pct || playerInput.FT_PCT_LAST || playerInput.stats?.ft_pct_last || 0,
      games_played: playerInput.games_played || playerInput.GAMES_PLAYED || playerInput.stats?.games_played || 0,
      minutes: playerInput.minutes || playerInput.stats?.minutes || 0
    } : { ppg: 0, apg: 0, rpg: 0, spg: 0, bpg: 0, tov: 0, mpg: 0, fg_pct: 0, fg3_pct: 0, ft_pct: 0, games_played: 0, minutes: 0 };

    setSelectedPlayer({
      name: playerName,
      team: typeof playerInput === 'object' ? (playerInput.team || playerInput.TEAM_ABBREVIATION || 'NBA') : 'NBA',
      position: typeof playerInput === 'object' ? (playerInput.position || playerInput.POSITION || 'G/F') : 'G/F',
      age: typeof playerInput === 'object' ? (playerInput.age || playerInput.AGE || '--') : '--',
      current_stats: fallbackStats,
      ml_stats: null,
      history: {}
    });

    try {
      const response = await fetch(buildApiUrl(`players/search-all?query=${encodeURIComponent(playerName)}`));
      if (response.ok) {
        const data = await response.json();
        const match = (data.players || []).find(p => p.name.toLowerCase() === playerName.toLowerCase());
        if (match) {
          setSelectedPlayer(match);
        }
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

  // Scroll-reveal animations
  useScrollReveal();

  // Header scroll & 3D Court Scroll Effect
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const heroRef = useRef(null);

  useEffect(() => {
    const onScroll = () => {
      const scrollY = window.scrollY;
      setHeaderScrolled(scrollY > 80);
      if (!heroRef.current) return;
      const el = heroRef.current;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Snappy and smooth scroll pace matching 140vh hero wrapper: animation plays over 0.4 viewport heights
      const p = Math.min(Math.max(scrollY / (vh * 0.4), 0), 1);

      // Dual Rim positions relative to screen center (50vw, 50vh) - perfectly in the middle of the restricted circle!
      const hoopDist = vw * 0.395;
      const hoopRightX = hoopDist;
      const hoopLeftX = -hoopDist;
      const hoopDY = 0;

      // ── 1. DUAL LETTER-BY-LETTER PAPER-ROLL FOLD (p: 0 → 0.26)
      const foldProgress = Math.min(1, p / 0.26);
      el.style.setProperty('--cv-fold-p', foldProgress);

      const titleOp = p >= 0.26 ? 0 : Math.max(0, 1 - Math.pow(p / 0.26, 2.5));
      const titleDisplay = p >= 0.26 ? 'none' : 'flex';
      el.style.setProperty('--cv-title-op', titleOp);
      el.style.setProperty('--cv-title-display', titleDisplay);

      // ── 2. DUAL HOOP BASELINE UNFOLDING (p: 0.10 → 0.36)
      const hoopUnfold = Math.min(1, Math.max(0, (p - 0.10) / 0.26));
      const hoopOp = Math.min(1, hoopUnfold * 1.5);
      el.style.setProperty('--cv-hoop-unfold', hoopUnfold);
      el.style.setProperty('--cv-hoop-op', hoopOp);

      let bCourtOp = 0, bCourtX = 0, bCourtY = 0, bCourtRot = 0, bCourtScale = 1;
      let bVisionOp = 0, bVisionX = 0, bVisionY = 0, bVisionRot = 0, bVisionScale = 1;
      let shadowOp = 0;
      let netSwishX = 0, netSwishScale = 1, netSwishY = 1, rimFlex = 0;

      // ── 3. DUAL BALL TRAJECTORIES
      if (p <= 0.26) {
        // Phase 1: Dual balls gather from COURT (left) and VISION (right)
        const courtStartX = -vw * 0.12, courtEndX = -vw * 0.18;
        bCourtX = courtStartX + foldProgress * (courtEndX - courtStartX);
        bCourtY = 0;
        bCourtScale = 0.28 + foldProgress * 0.72;
        bCourtOp = foldProgress > 0.06 ? Math.min(1, (foldProgress - 0.06) * 3) : 0;
        bCourtRot = -foldProgress * 720; // roll left

        const visionStartX = vw * 0.12, visionEndX = vw * 0.18;
        bVisionX = visionStartX + foldProgress * (visionEndX - visionStartX);
        bVisionY = 0;
        bVisionScale = 0.28 + foldProgress * 0.72;
        bVisionOp = foldProgress > 0.06 ? Math.min(1, (foldProgress - 0.06) * 3) : 0;
        bVisionRot = foldProgress * 720; // roll right

        shadowOp = bCourtOp * 0.6;
      } else if (p <= 0.54) {
        // Phase 2: Both balls roll outward across the floor toward the key boxes
        bCourtOp = 1; bVisionOp = 1;
        bCourtScale = 1; bVisionScale = 1;
        const rP = (p - 0.26) / 0.28;

        const courtStartX = -vw * 0.18, courtEndX = hoopLeftX * 0.60;
        bCourtX = courtStartX + rP * (courtEndX - courtStartX);
        bCourtY = Math.sin(rP * Math.PI * 2) * 5;
        bCourtRot = -720 - rP * 880;

        const visionStartX = vw * 0.18, visionEndX = hoopRightX * 0.60;
        bVisionX = visionStartX + rP * (visionEndX - visionStartX);
        bVisionY = Math.sin(rP * Math.PI * 2) * 5;
        bVisionRot = 720 + rP * 880;

        shadowOp = 0.7;
      } else if (p <= 0.80) {
        // Phase 3: Dual High Parabolic Arc Shots into Left & Right Baskets
        bCourtOp = 1; bVisionOp = 1;
        const aP = (p - 0.54) / 0.26;

        // Left arc (COURT)
        const lx0 = hoopLeftX * 0.60, lx1 = hoopLeftX * 0.84, lx2 = hoopLeftX;
        const y0 = 0, y1 = hoopDY - vh * 0.26, y2 = hoopDY - 32;
        bCourtX = (1 - aP) * (1 - aP) * lx0 + 2 * (1 - aP) * aP * lx1 + aP * aP * lx2;
        bCourtY = (1 - aP) * (1 - aP) * y0 + 2 * (1 - aP) * aP * y1 + aP * aP * y2;
        bCourtRot = -1600 - aP * 360;
        bCourtScale = 1 - aP * 0.22;

        // Right arc (VISION)
        const rx0 = hoopRightX * 0.60, rx1 = hoopRightX * 0.84, rx2 = hoopRightX;
        bVisionX = (1 - aP) * (1 - aP) * rx0 + 2 * (1 - aP) * aP * rx1 + aP * aP * rx2;
        bVisionY = (1 - aP) * (1 - aP) * y0 + 2 * (1 - aP) * aP * y1 + aP * aP * y2;
        bVisionRot = 1600 + aP * 360;
        bVisionScale = 1 - aP * 0.22;

        shadowOp = Math.max(0, 0.7 - aP * 0.6);
      } else if (p <= 0.94) {
        // Phase 4: Simultaneous Dual Swish through Left & Right Nets!
        bCourtOp = 1; bVisionOp = 1;
        const dP = (p - 0.80) / 0.14;

        bCourtX = hoopLeftX;
        bCourtY = (hoopDY - 32) + dP * 125;
        bCourtScale = 0.78 - dP * 0.08;
        bCourtRot = -1960 - dP * 160;

        bVisionX = hoopRightX;
        bVisionY = (hoopDY - 32) + dP * 125;
        bVisionScale = 0.78 - dP * 0.08;
        bVisionRot = 1960 + dP * 160;

        shadowOp = 0.2 + dP * 0.5;

        // Dynamic Dual Swish Physics
        rimFlex = Math.sin(dP * Math.PI) * 3.5;
        netSwishX = Math.sin(dP * Math.PI) * 14;
        netSwishScale = 1 + Math.sin(dP * Math.PI) * 0.38;
        netSwishY = 1 + Math.sin(dP * Math.PI) * 0.18;
      } else {
        // Phase 5: Smooth exit into content
        const fP = (p - 0.94) / 0.06;
        bCourtOp = Math.max(0, 1 - fP);
        bVisionOp = Math.max(0, 1 - fP);
        bCourtX = hoopLeftX;
        bCourtY = (hoopDY - 32) + 125 + fP * 25;
        bVisionX = hoopRightX;
        bVisionY = (hoopDY - 32) + 125 + fP * 25;
        bCourtScale = 0.70; bVisionScale = 0.70;
        shadowOp = 0;
      }

      // Apply to CSS variables
      el.style.setProperty('--cv-ball-court-op', bCourtOp);
      el.style.setProperty('--cv-ball-court-x', `${bCourtX}px`);
      el.style.setProperty('--cv-ball-court-y', `${bCourtY}px`);
      el.style.setProperty('--cv-ball-court-rot', `${bCourtRot}deg`);
      el.style.setProperty('--cv-ball-court-scale', bCourtScale);

      el.style.setProperty('--cv-ball-vision-op', bVisionOp);
      el.style.setProperty('--cv-ball-vision-x', `${bVisionX}px`);
      el.style.setProperty('--cv-ball-vision-y', `${bVisionY}px`);
      el.style.setProperty('--cv-ball-vision-rot', `${bVisionRot}deg`);
      el.style.setProperty('--cv-ball-vision-scale', bVisionScale);

      el.style.setProperty('--cv-ball-shadow-op', shadowOp);
      el.style.setProperty('--cv-rim-flex', `${rimFlex}px`);
      el.style.setProperty('--cv-net-swish-x', `${netSwishX}px`);
      el.style.setProperty('--cv-net-swish-scale', netSwishScale);
      el.style.setProperty('--cv-net-swish-y', netSwishY);

      // UI fades out early
      el.style.setProperty('--cv-ui-op', Math.max(0, 1 - p / 0.12));
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
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
          const response = await fetch(buildApiUrl(`players/search-all?query=${encodeURIComponent(searchQuery)}`));
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
      <header className={`header ${headerScrolled ? 'scrolled' : ''}`}>
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

      {/* ─── HERO: Nike-style cinematic scroll ─────────────── */}
      <section className="cv-hero-wrapper" ref={heroRef}>
        <div className="cv-hero-sticky">

          {/* Official NBA Court Lines SVG — 3-point arcs, key paint rectangles, free-throw circles, restricted arcs */}
          <svg className="cv-court-svg" viewBox="0 0 1920 911" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            {/* Outer Boundary */}
            <rect className="cv-svg-line" x="80" y="60" width="1760" height="791" fill="none" stroke="rgba(255,100,54,0.35)" strokeWidth="3"/>
            {/* Half-court Division Line */}
            <line className="cv-svg-line cv-svg-dl1" x1="960" y1="60" x2="960" y2="851" stroke="rgba(255,100,54,0.35)" strokeWidth="3"/>
            {/* Center Jump Circle */}
            <circle className="cv-svg-line cv-svg-dl1" cx="960" cy="455.5" r="130" fill="none" stroke="rgba(255,100,54,0.35)" strokeWidth="3"/>
            <circle cx="960" cy="455.5" r="8" fill="rgba(255,100,54,0.5)"/>

            {/* ── LEFT HALF COURT (Official NBA Layout) ── */}
            {/* 3-Point Line: Corner straight lines + Large arc */}
            <line className="cv-svg-line cv-svg-dl2" x1="80" y1="140" x2="340" y2="140" stroke="rgba(255,100,54,0.3)" strokeWidth="3"/>
            <line className="cv-svg-line cv-svg-dl2" x1="80" y1="771" x2="340" y2="771" stroke="rgba(255,100,54,0.3)" strokeWidth="3"/>
            <path className="cv-svg-line cv-svg-dl3" d="M 340 140 A 420 420 0 0 1 340 771" fill="none" stroke="rgba(255,100,54,0.3)" strokeWidth="3"/>
            
            {/* Paint / Key Rectangle (16ft) */}
            <rect className="cv-svg-line cv-svg-dl2" x="80" y="305" width="380" height="301" fill="rgba(255,100,54,0.03)" stroke="rgba(255,100,54,0.35)" strokeWidth="3"/>
            
            {/* Free Throw Circle: Solid half (outer) + Dashed half (inner paint) */}
            <path className="cv-svg-line cv-svg-dl2" d="M 460 345.5 A 110 110 0 0 1 460 565.5" fill="none" stroke="rgba(255,100,54,0.35)" strokeWidth="3"/>
            <path className="cv-svg-line cv-svg-dl2" d="M 460 345.5 A 110 110 0 0 0 460 565.5" fill="none" stroke="rgba(255,100,54,0.22)" strokeWidth="2.5" strokeDasharray="10 8"/>
            
            {/* Restricted Area Semicircle (Mini arc directly under the rim) */}
            <path className="cv-svg-line cv-svg-dl3" d="M 140 395.5 L 195 395.5 A 60 60 0 0 1 195 515.5 L 140 515.5" fill="none" stroke="rgba(255,100,54,0.32)" strokeWidth="2.5"/>

            {/* ── RIGHT HALF COURT (Official NBA Layout) ── */}
            {/* 3-Point Line: Corner straight lines + Large arc */}
            <line className="cv-svg-line cv-svg-dl2" x1="1840" y1="140" x2="1580" y2="140" stroke="rgba(255,100,54,0.3)" strokeWidth="3"/>
            <line className="cv-svg-line cv-svg-dl2" x1="1840" y1="771" x2="1580" y2="771" stroke="rgba(255,100,54,0.3)" strokeWidth="3"/>
            <path className="cv-svg-line cv-svg-dl3" d="M 1580 140 A 420 420 0 0 0 1580 771" fill="none" stroke="rgba(255,100,54,0.3)" strokeWidth="3"/>
            
            {/* Paint / Key Rectangle (16ft) */}
            <rect className="cv-svg-line cv-svg-dl2" x="1460" y="305" width="380" height="301" fill="rgba(255,100,54,0.03)" stroke="rgba(255,100,54,0.35)" strokeWidth="3"/>
            
            {/* Free Throw Circle: Solid half (outer) + Dashed half (inner paint) */}
            <path className="cv-svg-line cv-svg-dl2" d="M 1460 345.5 A 110 110 0 0 0 1460 565.5" fill="none" stroke="rgba(255,100,54,0.35)" strokeWidth="3"/>
            <path className="cv-svg-line cv-svg-dl2" d="M 1460 345.5 A 110 110 0 0 1 1460 565.5" fill="none" stroke="rgba(255,100,54,0.22)" strokeWidth="2.5" strokeDasharray="10 8"/>
            
            {/* Restricted Area Semicircle (Mini arc directly under the rim) */}
            <path className="cv-svg-line cv-svg-dl3" d="M 1780 395.5 L 1725 395.5 A 60 60 0 0 0 1725 515.5 L 1780 515.5" fill="none" stroke="rgba(255,100,54,0.32)" strokeWidth="2.5"/>
          </svg>

          {/* Spotlight glow at center */}
          <div className="cv-court-spotlight" />

          {/* ── LEFT BASKETBALL HOOP (Left Baseline Key Box) ── */}
          <div className="cv-hoop-system cv-hoop-left cv-hoop-back">
            <div className="cv-stanchion-arm" />
            <div className="cv-stanchion-pole" />
            <div className="cv-stanchion-base" />
            <div className="cv-backboard">
              <div className="cv-backboard-glass" />
              <div className="cv-backboard-target" />
              <div className="cv-backboard-bracket" />
            </div>
            {/* Back layer of 3D Net (BEHIND the ball) */}
            <svg className="cv-net-svg cv-net-back" viewBox="0 0 100 115" xmlns="http://www.w3.org/2000/svg">
              <path d="M 12 20 Q 50 8 88 20" fill="none" stroke="#b83812" strokeWidth="4.5" />
              <path d="M 16 20 Q 25 58 35 96" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" />
              <path d="M 28 17 Q 34 56 42 96" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" />
              <path d="M 42 14 Q 45 55 48 96" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" />
              <path d="M 58 14 Q 55 55 54 96" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" />
              <path d="M 72 17 Q 66 56 60 96" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" />
              <path d="M 84 20 Q 75 58 67 96" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" />
              <path d="M 19 36 Q 50 28 81 36" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" />
              <path d="M 24 55 Q 50 48 76 55" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" />
              <path d="M 29 74 Q 50 68 71 74" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" />
            </svg>
          </div>

          {/* ── RIGHT BASKETBALL HOOP (Right Baseline Key Box) ── */}
          <div className="cv-hoop-system cv-hoop-right cv-hoop-back">
            <div className="cv-stanchion-arm" />
            <div className="cv-stanchion-pole" />
            <div className="cv-stanchion-base" />
            <div className="cv-backboard">
              <div className="cv-backboard-glass" />
              <div className="cv-backboard-target" />
              <div className="cv-backboard-bracket" />
            </div>
            <svg className="cv-net-svg cv-net-back" viewBox="0 0 100 115" xmlns="http://www.w3.org/2000/svg">
              <path d="M 12 20 Q 50 8 88 20" fill="none" stroke="#b83812" strokeWidth="4.5" />
              <path d="M 16 20 Q 25 58 35 96" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" />
              <path d="M 28 17 Q 34 56 42 96" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" />
              <path d="M 42 14 Q 45 55 48 96" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" />
              <path d="M 58 14 Q 55 55 54 96" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" />
              <path d="M 72 17 Q 66 56 60 96" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" />
              <path d="M 84 20 Q 75 58 67 96" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.6" />
              <path d="M 19 36 Q 50 28 81 36" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" />
              <path d="M 24 55 Q 50 48 76 55" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" />
              <path d="M 29 74 Q 50 68 71 74" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" />
            </svg>
          </div>

          {/* DUAL TITLE: COURT (left) + VISION (right) */}
          <div className="cv-main-title cv-fold-wrapper">
            <div className="cv-word cv-word--court">
              {COURT_LETTERS.map((item) => (
                <span
                  key={`c-${item.id}`}
                  className="cv-letter cv-letter--orange"
                  style={{ "--l-idx": item.id, "--word-dir": -1 }}
                >
                  {item.char}
                </span>
              ))}
            </div>
            <span className="cv-word-space">&nbsp;</span>
            <div className="cv-word cv-word--vision">
              {VISION_LETTERS.map((item) => (
                <span
                  key={`v-${item.id}`}
                  className="cv-letter cv-letter--white"
                  style={{ "--l-idx": item.id, "--word-dir": 1 }}
                >
                  {item.char}
                </span>
              ))}
            </div>
          </div>

          {/* ORANGE BASKETBALL (COURT -> Left Net) */}
          <div className="cv-ball cv-ball--court">
            <div className="cv-ball-shadow" />
            <div className="cv-ball-inner cv-ball-inner--orange">
              <div className="cv-ball-seam cv-ball-seam--h" />
              <div className="cv-ball-seam cv-ball-seam--v" />
              <div className="cv-ball-seam cv-ball-seam--c" />
              <div className="cv-ball-specular" />
            </div>
          </div>

          {/* WHITE / ICE BASKETBALL (VISION -> Right Net) */}
          <div className="cv-ball cv-ball--vision">
            <div className="cv-ball-shadow" />
            <div className="cv-ball-inner cv-ball-inner--white">
              <div className="cv-ball-seam cv-ball-seam--h" />
              <div className="cv-ball-seam cv-ball-seam--v" />
              <div className="cv-ball-seam cv-ball-seam--c" />
              <div className="cv-ball-specular" />
            </div>
          </div>

          {/* Front Layer: LEFT HOOP (Front Rim & Net) */}
          <div className="cv-hoop-front-wrapper cv-hoop-front-left">
            <svg className="cv-net-svg cv-net-front" viewBox="0 0 100 115" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="50" cy="20" rx="38" ry="10" fill="rgba(255,100,54,0.15)" />
              <path d="M 12 20 Q 50 32 88 20" fill="none" stroke="#ff6436" strokeWidth="5" strokeLinecap="round" />
              <path d="M 12 20 Q 50 29 88 20" fill="none" stroke="#ffa385" strokeWidth="1.8" />
              <path d="M 12 21 Q 20 60 34 98" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 24 25 Q 30 62 41 98" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 37 28 Q 40 64 47 98" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 50 29 Q 50 65 53 98" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 63 28 Q 60 64 59 98" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 76 25 Q 70 62 65 98" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 88 21 Q 80 60 72 98" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 15 40 Q 50 50 85 40" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" />
              <path d="M 21 60 Q 50 70 79 60" fill="none" stroke="rgba(255,255,255,0.80)" strokeWidth="1.5" />
              <path d="M 28 80 Q 50 88 73 80" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.4" />
              <path d="M 34 98 Q 53 104 72 98" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeDasharray="3 3" />
            </svg>
          </div>

          {/* Front Layer: RIGHT HOOP (Front Rim & Net) */}
          <div className="cv-hoop-front-wrapper cv-hoop-front-right">
            <svg className="cv-net-svg cv-net-front" viewBox="0 0 100 115" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="50" cy="20" rx="38" ry="10" fill="rgba(255,100,54,0.15)" />
              <path d="M 12 20 Q 50 32 88 20" fill="none" stroke="#ff6436" strokeWidth="5" strokeLinecap="round" />
              <path d="M 12 20 Q 50 29 88 20" fill="none" stroke="#ffa385" strokeWidth="1.8" />
              <path d="M 12 21 Q 20 60 34 98" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 24 25 Q 30 62 41 98" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 37 28 Q 40 64 47 98" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 50 29 Q 50 65 53 98" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 63 28 Q 60 64 59 98" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 76 25 Q 70 62 65 98" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 88 21 Q 80 60 72 98" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M 15 40 Q 50 50 85 40" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" />
              <path d="M 21 60 Q 50 70 79 60" fill="none" stroke="rgba(255,255,255,0.80)" strokeWidth="1.5" />
              <path d="M 28 80 Q 50 88 73 80" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.4" />
              <path d="M 34 98 Q 53 104 72 98" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeDasharray="3 3" />
            </svg>
          </div>

          {/* Hero UI CTA buttons */}
          <div className="cv-hero-ui">
            <p className="hero-subtitle">AI-powered basketball analytics, live stats &amp; predictions</p>
            <div className="hero-cta">
              <Link to="/stats" className="cta-button primary">EXPLORE STATS</Link>
              <Link to="/recommendations" className="cta-button secondary">GET RECOMMENDATIONS</Link>
            </div>
          </div>

        </div>
      </section>

      {/* ─── SEARCH SECTION (Underneath Court Vision) ─── */}
      <section className="court-search-section scroll-reveal">
        <div className="court-search-container" ref={searchContainerRef}>
          <div className="cv-section-badge-wrapper">
            <span className="cv-section-badge">PLAYER SEARCH</span>
          </div>
          <h2 className="court-search-title">SEARCH ANY <span className="text-ember">NBA ATHLETE</span></h2>
          <p className="court-search-subtitle">Instant telemetry, season trajectories, and AI-projected performance metrics</p>
          
          <div className="hero-search-wrapper">
            <div className="search-bar-container">
              <svg className="search-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input 
                type="text" 
                className="search-input-field" 
                placeholder="Search NBA player by name (e.g. Luka Dončić, Shai, Giannis)..." 
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
                  <div key={player.name} className="search-result-item" onClick={() => { setSelectedPlayer(player); setModalTab("current"); setSearchResults([]); setSearchQuery(""); }}>
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
              <div className="search-results-dropdown"><div className="search-dropdown-no-results">No players found matching "{searchQuery}"</div></div>
            )}
          </div>
        </div>
      </section>


      <section className="featured-section scroll-reveal">
        <div className="featured-container">
          <div className="cv-section-badge-wrapper">
            <span className="cv-section-badge">LIVE INTEL</span>
          </div>
          <h2 className="section-title">TRENDING <span className="text-ember">NOW</span></h2>
          <p className="section-description">Live scores, upcoming matchups, and this week's standout performers</p>
          <TrendingSection onPlayerClick={handlePlayerClick} />
        </div>
      </section>

      <section className="how-it-works-section scroll-reveal">
        <div className="how-it-works-container">
          <div className="cv-section-badge-wrapper">
            <span className="cv-section-badge">WORKFLOW</span>
          </div>
          <h2 className="section-title">HOW IT <span className="text-ember">WORKS</span></h2>
          <p className="section-description">Unlock the full power of AI-driven basketball predictive intelligence in three steps</p>
          <div className="steps-container">
            <div className="step-item">
              <div className="step-number">01</div>
              <div className="step-content">
                <h3>CREATE YOUR ACCOUNT</h3>
                <p>Sign up in seconds and personalize your analytics feed with your favorite NBA franchises and players.</p>
              </div>
            </div>
            <div className="step-connector" />
            <div className="step-item">
              <div className="step-number">02</div>
              <div className="step-content">
                <h3>EXPLORE & ANALYZE</h3>
                <p>Dive deep into real-time possession metrics, matchup efficiency ratings, and neural prediction models.</p>
              </div>
            </div>
            <div className="step-connector" />
            <div className="step-item">
              <div className="step-number">03</div>
              <div className="step-content">
                <h3>STAY AHEAD</h3>
                <p>Receive daily value recommendations, automated injury adjustments, and real-time game probabilities.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ai-section scroll-reveal">
        <div className="ai-content">
          <div className="cv-section-badge-wrapper">
            <span className="cv-section-badge">NEURAL INTEL</span>
          </div>
          <h2 className="section-title">AI MATCHUP <span className="text-ember">PREDICTIONS</span></h2>
          <p className="section-description">Advanced neural networks analyzing team pace, offensive rating & player match-ups</p>
          <AIPredictions onPlayerClick={handlePlayerClick} />
        </div>
      </section>

      <section className="cta-section scroll-reveal">
        <div className="cta-container">
          <div className="cv-section-badge-wrapper">
            <span className="cv-section-badge">GET STARTED</span>
          </div>
          <h2 className="cta-title">ELEVATE YOUR <span className="text-ember">COURT VISION</span></h2>
          <p className="cta-description">Join thousands of analysts, bettors, and basketball fanatics leveraging AI to discover winning insights.</p>
          <div className="cta-buttons">
            <Link to="/stats" className="cta-button primary large">START ANALYZING</Link>
            <Link to="/create-account" className="cta-button secondary large">CREATE FREE ACCOUNT</Link>
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
                  {modalTab === "current" && (() => {
                    const stats = selectedPlayer.current_stats || selectedPlayer.stats || {};
                    const ppg = stats.ppg ?? stats.ppg_last ?? 0;
                    const apg = stats.apg ?? stats.apg_last ?? 0;
                    const rpg = stats.rpg ?? stats.rpg_last ?? 0;
                    const spg = stats.spg ?? stats.spg_last ?? 0;
                    const bpg = stats.bpg ?? stats.bpg_last ?? 0;
                    const fg_pct = stats.fg_pct ?? stats.fg_pct_last ?? 0;
                    const fg3_pct = stats.fg3_pct ?? stats.fg3_pct_last ?? 0;
                    const ft_pct = stats.ft_pct ?? stats.ft_pct_last ?? 0;
                    const gp = stats.games_played ?? 0;
                    const min = stats.minutes ?? stats.mpg ?? 0;

                    return (
                      <div>
                        <div className="stats-grid-container">
                          <div className="stat-box-card">
                            <div className="stat-box-value highlighted">{ppg}</div>
                            <div className="stat-box-label">PPG</div>
                          </div>
                          <div className="stat-box-card">
                            <div className="stat-box-value">{apg}</div>
                            <div className="stat-box-label">APG</div>
                          </div>
                          <div className="stat-box-card">
                            <div className="stat-box-value">{rpg}</div>
                            <div className="stat-box-label">RPG</div>
                          </div>
                          <div className="stat-box-card">
                            <div className="stat-box-value">{spg}</div>
                            <div className="stat-box-label">SPG</div>
                          </div>
                          <div className="stat-box-card">
                            <div className="stat-box-value">{bpg}</div>
                            <div className="stat-box-label">BPG</div>
                          </div>
                        </div>

                        <div className="secondary-stats-container">
                          <h3 className="secondary-stats-title">Shooting &amp; Playing Time</h3>
                          <div className="percentage-stat-row">
                            <div className="percentage-stat-header">
                              <span className="percentage-stat-name">Field Goal (FG%)</span>
                              <span className="percentage-stat-value">{fg_pct}%</span>
                            </div>
                            <div className="percentage-stat-track">
                              <div className="percentage-stat-bar" style={{ width: `${Math.min(Math.max(fg_pct, 0), 100)}%` }}></div>
                            </div>
                          </div>
                          <div className="percentage-stat-row">
                            <div className="percentage-stat-header">
                              <span className="percentage-stat-name">3-Point (3PT%)</span>
                              <span className="percentage-stat-value">{fg3_pct}%</span>
                            </div>
                            <div className="percentage-stat-track">
                              <div className="percentage-stat-bar" style={{ width: `${Math.min(Math.max(fg3_pct, 0), 100)}%` }}></div>
                            </div>
                          </div>
                          <div className="percentage-stat-row">
                            <div className="percentage-stat-header">
                              <span className="percentage-stat-name">Free Throw (FT%)</span>
                              <span className="percentage-stat-value">{ft_pct}%</span>
                            </div>
                            <div className="percentage-stat-track">
                              <div className="percentage-stat-bar" style={{ width: `${Math.min(Math.max(ft_pct, 0), 100)}%` }}></div>
                            </div>
                          </div>
                          <div className="percentage-stat-row" style={{ marginTop: "1.5rem" }}>
                            <div className="percentage-stat-header" style={{ marginBottom: 0 }}>
                              <span className="percentage-stat-name">Games Played / Playing Time</span>
                              <span className="percentage-stat-value">{gp} Games | {min} MPG</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

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
