import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./Home.css";
import AIPredictions from "../components/AIPredictions";
import PlayerStatsModal from "../components/PlayerStatsModal";
import ScrollReveal from "../components/ScrollReveal";
import { isAuthenticated } from "../utils/auth";
import { buildApiUrl } from "../config/api";
import { samePlayerName } from "../utils/playerNames";
import { extractWeeklyPraPlayer, formatPraGameDate } from "../utils/weeklyPra";
import { enterDelay, getRevealDelay } from "../utils/scrollReveal";

// Inline style placing a data-reveal element at `index` in its section's stagger.
const revealDelay = index => ({ '--reveal-delay': getRevealDelay(index) });

// The eyebrow / display heading / lead anatomy every section below the intro shares.
function SectionHead({ id, eyebrow, title, accent, lead }) {
  return (
    <div className="home-section-head" data-reveal>
      <span className="cv-section-badge" data-slot="eyebrow">{eyebrow}</span>
      <h2 id={id} className="home-section-title" data-slot="display-heading">
        {title} <span className="text-ember">{accent}</span>
      </h2>
      {lead && <p className="home-section-lead" data-slot="lead">{lead}</p>}
    </div>
  );
}

function TrendingGameCard({ game, index }) {
  const isLive = game.status === 2;
  const isFinal = game.status === 3;
  const isFuture = game.status === 1;
  const homeWin = game.home.score > game.away.score;
  const awayWin = game.away.score > game.home.score;
  return (
    <div className="featured-card" data-reveal style={revealDelay(index)}>
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

// The name is the button; its ::after stretches over the card, so the whole card stays clickable
// and keyboard users reach it with Tab (same pattern as PlayerCard).
function PRACard({ player, onPlayerClick, index }) {
  if (!player) return null;
  return (
    <article className="featured-card pra-card" data-reveal style={revealDelay(index)}>
      <div className="featured-badge highlight">
        WEEK'S BEST PRA {player.is_live && <><span className="trend-live-dot" /> LIVE</>}
      </div>
      <div className="featured-content">
        <h3 className="pra-name">
          <button
            type="button"
            className="pra-open"
            onClick={() => onPlayerClick && onPlayerClick({ name: player.name, team: player.team, position: player.position })}
          >
            {player.name}
          </button>
        </h3>
        <p className="pra-meta">{player.team} · {player.position}</p>
        <p className="pra-game-meta"><span>vs {player.opponent}</span> · {formatPraGameDate(player.game_date)}</p>
        <div className="pra-stats-row">
          <div className="pra-stat"><span className="pra-val">{player.pts}</span><span className="pra-lbl">PTS</span></div>
          <div className="pra-stat"><span className="pra-val">{player.reb}</span><span className="pra-lbl">REB</span></div>
          <div className="pra-stat"><span className="pra-val">{player.ast}</span><span className="pra-lbl">AST</span></div>
          <div className="pra-stat pra-total"><span className="pra-val">{player.pra}</span><span className="pra-lbl">PRA</span></div>
        </div>
        <div className="featured-link" aria-hidden="true">
          Click for Full Stats →
        </div>
      </div>
    </article>
  );
}

// onSettled tells Home the cards are in the DOM, so ScrollReveal can rescan for them.
function TrendingSection({ onPlayerClick, onSettled }) {
  const [liveGames, setLiveGames] = useState([]);
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
        setPraPlayer(praRes.ok ? extractWeeklyPraPlayer(pra) : null);
      } catch (e) {
        console.error("Trending fetch failed", e);
      } finally {
        setLoading(false);
        onSettled(true);
      }
    };
    fetch_();
  }, [onSettled]);

  if (loading) {
    return (
      <div className="featured-grid" data-defer aria-busy="true">
        {[0, 1, 2].map(i => (
          <div key={i} className="featured-card trend-skeleton" data-reveal style={revealDelay(i)}>
            <div className="skeleton-badge" /><div className="skeleton-body" />
          </div>
        ))}
      </div>
    );
  }

  const cards = liveGames.length === 0 && !praPlayer ? (
    <div className="featured-card trend-empty" data-reveal>
      <div className="featured-badge upcoming">LIVE SLATE</div>
      <div className="featured-content trend-empty-content">
        <div className="trend-empty-radar">
          <div className="trend-empty-dot" />
        </div>
        <div className="trend-empty-info">
          <h3>NO LIVE GAMES TODAY</h3>
          <p className="featured-time">Next-season XGBoost projections and full season stats are still a click away</p>
          <Link to="/games" className="cta-button primary trend-empty-cta">VIEW GAME SCHEDULE →</Link>
        </div>
      </div>
    </div>
  ) : (
    <>
      {liveGames.map((g, i) => <TrendingGameCard key={g.gameId} game={g} index={i} />)}
      {praPlayer && <PRACard player={praPlayer} onPlayerClick={onPlayerClick} index={liveGames.length} />}
    </>
  );

  return <div className="featured-grid" data-defer>{cards}</div>;
}

const STEPS = [
  { number: "01", title: "CREATE YOUR ACCOUNT", text: "Sign up in seconds and personalize your analytics feed with your favorite NBA franchises and players." },
  { number: "02", title: "EXPLORE & ANALYZE", text: "Dig into live box scores, multi-season player stats, and XGBoost projections for this season." },
  { number: "03", title: "STAY AHEAD", text: "Receive daily value recommendations, automated injury adjustments, and real-time game probabilities." },
];

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
  // The shared header owns login state; Home only reads it once to pick its closing CTA.
  const [isLoggedIn] = useState(() => isAuthenticated());
  // Flips once the trending fetch settles; ScrollReveal rescans so the arriving cards animate in.
  const [trendingSettled, setTrendingSettled] = useState(false);
  // Same idea for the projected-leader cards, which change with each tab.
  const [leadersContent, setLeadersContent] = useState('');

  // States for search and popup modal
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  const searchContainerRef = useRef(null);

  const handlePlayerClick = async (playerInput) => {
    if (!playerInput) return;
    const playerName = typeof playerInput === 'string' ? playerInput : (playerInput.name || playerInput.PLAYER_NAME || '');
    if (!playerName) return;
    setLoadingPlayer(true);

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
        const match = (data.players || []).find(p => samePlayerName(p.name, playerName));
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

  // 3D Court Scroll Effect
  const heroRef = useRef(null);

  useEffect(() => {
    // Under reduced motion the intro is a still title card: no scroll-linked sequence, and
    // Home.css shrinks the wrapper to one screen. Re-checked if the preference changes.
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const onScroll = () => {
      const scrollY = window.scrollY;
      if (!heroRef.current) return;
      const el = heroRef.current;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Majestic, cinematic scroll pace matching 320vh hero wrapper: animation plays gracefully over 2.0 viewport heights
      const p = Math.min(Math.max(scrollY / (vh * 2.0), 0), 1);

      // Dual Rim positions relative to screen center (50vw, 50vh) - perfectly in the middle of the restricted circle!
      const hoopDist = vw * 0.395;
      const hoopRightX = hoopDist;
      const hoopLeftX = -hoopDist;
      const hoopDY = 0;

      // ── 1. DUAL LETTER-BY-LETTER PAPER-ROLL FOLD (p: 0 → 0.40)
      const foldProgress = Math.min(1, p / 0.40);
      el.style.setProperty('--cv-fold-p', foldProgress);

      const titleOp = p >= 0.40 ? 0 : Math.max(0, 1 - Math.pow(p / 0.40, 2.0));
      const titleDisplay = p >= 0.40 ? 'none' : 'flex';
      el.style.setProperty('--cv-title-op', titleOp);
      el.style.setProperty('--cv-title-display', titleDisplay);

      // ── 2. DUAL HOOP BASELINE UNFOLDING (p: 0.15 → 0.48)
      const hoopUnfold = Math.min(1, Math.max(0, (p - 0.15) / 0.33));
      const hoopOp = Math.min(1, hoopUnfold * 1.5);
      el.style.setProperty('--cv-hoop-unfold', hoopUnfold);
      el.style.setProperty('--cv-hoop-op', hoopOp);

      let bCourtOp = 0, bCourtX = 0, bCourtY = 0, bCourtRot = 0, bCourtScale = 1;
      let bVisionOp = 0, bVisionX = 0, bVisionY = 0, bVisionRot = 0, bVisionScale = 1;
      let shadowOp = 0;
      let netSwishX = 0, netSwishScale = 1, netSwishY = 1, rimFlex = 0;

      // ── 3. DUAL BALL TRAJECTORIES
      if (p <= 0.40) {
        // Phase 1: Dual balls gradually materialize and gather from COURT (left) and VISION (right) text
        const courtStartX = -vw * 0.12, courtEndX = -vw * 0.18;
        bCourtX = courtStartX + foldProgress * (courtEndX - courtStartX);
        bCourtY = 0;
        bCourtScale = 0.20 + foldProgress * 0.80;
        bCourtOp = foldProgress > 0.05 ? Math.min(1, (foldProgress - 0.05) * 2.5) : 0;
        bCourtRot = -foldProgress * 720; // roll left

        const visionStartX = vw * 0.12, visionEndX = vw * 0.18;
        bVisionX = visionStartX + foldProgress * (visionEndX - visionStartX);
        bVisionY = 0;
        bVisionScale = 0.20 + foldProgress * 0.80;
        bVisionOp = foldProgress > 0.05 ? Math.min(1, (foldProgress - 0.05) * 2.5) : 0;
        bVisionRot = foldProgress * 720; // roll right

        shadowOp = bCourtOp * 0.6;
      } else if (p <= 0.65) {
        // Phase 2: Both balls roll outward across the floor toward the key boxes
        bCourtOp = 1; bVisionOp = 1;
        bCourtScale = 1; bVisionScale = 1;
        const rP = (p - 0.40) / 0.25;

        const courtStartX = -vw * 0.18, courtEndX = hoopLeftX * 0.60;
        bCourtX = courtStartX + rP * (courtEndX - courtStartX);
        bCourtY = Math.sin(rP * Math.PI * 2) * 5;
        bCourtRot = -720 - rP * 880;

        const visionStartX = vw * 0.18, visionEndX = hoopRightX * 0.60;
        bVisionX = visionStartX + rP * (visionEndX - visionStartX);
        bVisionY = Math.sin(rP * Math.PI * 2) * 5;
        bVisionRot = 720 + rP * 880;

        shadowOp = 0.7;
      } else if (p <= 0.86) {
        // Phase 3: Dual High Parabolic Arc Shots into Left & Right Baskets
        bCourtOp = 1; bVisionOp = 1;
        const aP = (p - 0.65) / 0.21;

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
      } else if (p <= 0.96) {
        // Phase 4: Simultaneous Dual Swish through Left & Right Nets!
        bCourtOp = 1; bVisionOp = 1;
        const dP = (p - 0.86) / 0.10;

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
        const fP = (p - 0.96) / 0.04;
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

    const syncMotion = () => {
      window.removeEventListener('scroll', onScroll);
      if (reducedMotion.matches) {
        if (heroRef.current) heroRef.current.style.cssText = '';
        return;
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    };

    syncMotion();
    reducedMotion.addEventListener('change', syncMotion);
    return () => {
      reducedMotion.removeEventListener('change', syncMotion);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

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

  return (
    <div className="main-wrapper">
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
            <p className="hero-subtitle" data-enter>AI-powered basketball analytics, live stats &amp; predictions</p>
            <div className="hero-cta" data-enter style={enterDelay(1)}>
              <Link to="/stats" className="cta-button primary">EXPLORE STATS</Link>
              <Link to="/recommendations" className="cta-button secondary">GET RECOMMENDATIONS</Link>
            </div>
          </div>

        </div>
      </section>

      {/* ─── SEARCH SECTION (Underneath Court Vision) ─── */}
      <section className="home-section court-search-section" aria-labelledby="home-search-title">
        <div className="court-search-container" ref={searchContainerRef}>
          <SectionHead
            id="home-search-title"
            eyebrow="PLAYER SEARCH"
            title="SEARCH ANY"
            accent="NBA ATHLETE"
            lead="Instant telemetry, season trajectories, and AI-projected performance metrics"
          />

          <div className="hero-search-wrapper" data-reveal style={revealDelay(1)}>
            <div className="search-bar-container">
              <svg className="search-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input 
                type="text" 
                className="search-input-field" 
                placeholder="Search NBA player by name (e.g. Luka Dončić, Shai, Giannis)..." 
                aria-label="Search NBA players by name"
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
              />
              {isSearching && <div className="search-spinner"></div>}
              {searchQuery && (
                <button type="button" className="clear-search-btn" aria-label="Clear search" onClick={() => setSearchQuery("")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              )}
            </div>

            {searchResults.length > 0 && (
              <div className="search-results-dropdown">
                {searchResults.map((player) => (
                  <button type="button" key={player.name} className="search-result-item" onClick={() => { setSelectedPlayer(player); setSearchResults([]); setSearchQuery(""); }}>
                    <span className="search-result-player-info">
                      <span className="search-result-player-name">{player.name}</span>
                      <span className="search-result-player-meta">{player.position}{player.age != null && ` · Age ${player.age}`}</span>
                    </span>
                    <span className="search-result-player-team">{player.team}</span>
                  </button>
                ))}
              </div>
            )}
            {searchQuery.trim().length >= 2 && !isSearching && searchResults.length === 0 && (
              <div className="search-results-dropdown"><div className="search-dropdown-no-results">No players found matching "{searchQuery}"</div></div>
            )}
          </div>
        </div>
      </section>

      <section className="home-section featured-section" aria-labelledby="home-trending-title">
        <div className="featured-container">
          <SectionHead
            id="home-trending-title"
            eyebrow="LIVE INTEL"
            title="TRENDING"
            accent="NOW"
            lead="Live scores, upcoming matchups, and this week's standout performers"
          />
          <TrendingSection onPlayerClick={handlePlayerClick} onSettled={setTrendingSettled} />
        </div>
      </section>

      <section className="home-section how-it-works-section" aria-labelledby="home-steps-title">
        <div className="how-it-works-container">
          <SectionHead
            id="home-steps-title"
            eyebrow="WORKFLOW"
            title="HOW IT"
            accent="WORKS"
            lead="Unlock the full power of AI-driven basketball predictive intelligence in three steps"
          />
          <ol className="steps-container">
            {STEPS.map((step, index) => (
              <React.Fragment key={step.number}>
                {index > 0 && <li className="step-connector" aria-hidden="true" data-reveal="fade" style={revealDelay(index * 2 - 1)} />}
                <li className="step-item" data-reveal style={revealDelay(index * 2)}>
                  <div className="step-number" aria-hidden="true">{step.number}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </li>
              </React.Fragment>
            ))}
          </ol>
        </div>
      </section>

      <section className="home-section ai-section" aria-labelledby="home-leaders-title">
        <div className="ai-content">
          <SectionHead
            id="home-leaders-title"
            eyebrow="XGBOOST FORECASTING"
            title="PROJECTED"
            accent="LEADERS"
            lead="XGBoost models trained on past seasons project this season's top scorers, playmakers, rebounders and breakout players"
          />
          <div data-reveal style={revealDelay(1)}>
            <AIPredictions onPlayerClick={handlePlayerClick} onContentChange={setLeadersContent} />
          </div>
        </div>
      </section>

      {/* One closing CTA for everyone; only the account link depends on login state. */}
      <section className="home-section home-cta" aria-labelledby="home-cta-title">
        <SectionHead
          id="home-cta-title"
          eyebrow="GET STARTED"
          title="ELEVATE YOUR"
          accent="COURT VISION"
          lead="Live box scores, multi-season player stats and XGBoost projections for this season, all in one place."
        />
        <div className="home-cta-actions" data-reveal style={revealDelay(1)}>
          <Link to="/stats" className="cta-button primary large">START ANALYZING</Link>
          {!isLoggedIn && (
            <Link to="/create-account" className="cta-button secondary large">CREATE FREE ACCOUNT</Link>
          )}
        </div>
      </section>

      <ScrollReveal scanKey={`${trendingSettled}:${leadersContent}`} />
      <PlayerStatsModal player={selectedPlayer} loading={loadingPlayer} onClose={() => setSelectedPlayer(null)} />
    </div>
  );
};

export default Home;
