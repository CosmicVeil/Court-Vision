import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildApiUrl } from '../config/api';
import { GameMatchup } from '../components/GameBoxScore';
import { LIVE_GAMES_REFRESH_MS, STATUS_LIVE, getGameDetailPath } from '../utils/liveGames';
import { buildUpcomingGamesEndpoint, getUpcomingPaginationView, normalizeUpcomingGamesPage } from '../utils/upcomingGamesPagination';
import HeroOrbit from '../components/HeroOrbit';
import LiveTicker from '../components/LiveTicker';
import PillNav from '../components/PillNav';
import ScrollReveal from '../components/ScrollReveal';
import SyncDock from '../components/SyncDock';
import { getLiveGamesStats } from '../utils/liveGamesStats';
import { getScoreChanges, getTilt } from '../utils/liveInteractions';
import { getRevealDelay } from '../utils/scrollReveal';
import './LiveGames.css';

const GAME_STATUS_ORDER = { 2: 0, 1: 1, 3: 2 };
const TILT_PROPERTIES = ['--rx', '--ry', '--mx', '--my'];

function GameCard({ game, index, scoreChanges }) {
  const isLive = Number(game.status) === STATUS_LIVE;
  const cardRef = useRef(null);
  const frameRef = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  // Pointer tilt writes CSS variables straight to the element: no React state, so no re-render per move.
  const onPointerMove = event => {
    if (event.pointerType !== 'mouse') return;
    const { clientX, clientY } = event;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const card = cardRef.current;
      if (!card) return;
      const { rx, ry, mx, my } = getTilt({ clientX, clientY }, card.getBoundingClientRect());
      card.style.setProperty('--rx', `${rx}deg`);
      card.style.setProperty('--ry', `${ry}deg`);
      card.style.setProperty('--mx', `${mx}%`);
      card.style.setProperty('--my', `${my}%`);
    });
  };
  const onPointerLeave = () => {
    cancelAnimationFrame(frameRef.current);
    TILT_PROPERTIES.forEach(property => cardRef.current?.style.removeProperty(property));
  };

  return (
    <Link to={getGameDetailPath(game.gameId)} className="game-card-link" data-reveal data-defer style={{ '--reveal-delay': getRevealDelay(index) }}
      onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <article ref={cardRef} className={`game-card ${isLive ? 'live' : Number(game.status) === 3 ? 'final' : 'future'}`}>
        {isLive && <div className="live-pulse-ring" />}
        <div className="game-card-header">
          <GameMatchup game={game} scoreChanges={scoreChanges} />
          <span className="expand-btn">
            <span className="cta-label">{Number(game.status) === 1 ? 'View Roster' : 'View Details'}</span>
            <span className="cta-arrow" aria-hidden="true">→</span>
          </span>
        </div>
      </article>
    </Link>
  );
}

export default function LiveGames() {
  const [todayGames, setTodayGames] = useState([]);
  const [upcomingGames, setUpcomingGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('today');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [upcomingTotalPages, setUpcomingTotalPages] = useState(1);
  const [upcomingTotalGames, setUpcomingTotalGames] = useState(0);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [scoreChanges, setScoreChanges] = useState({});
  const previousTodayRef = useRef([]);
  const heroRef = useRef(null);

  const fetchGames = useCallback(async () => {
    setUpcomingLoading(true);
    const fetchToday = async () => {
      try {
        const response = await fetch(buildApiUrl('games/today'));
        if (!response.ok) throw new Error('Unable to load today\'s games');
        const data = await response.json();
        const nextToday = data.games || [];
        setScoreChanges(getScoreChanges(previousTodayRef.current, nextToday));
        previousTodayRef.current = nextToday;
        setTodayGames(nextToday);
        setLastUpdated(new Date());
      } catch (error) {
        console.error('Failed to fetch today\'s games', error);
      }
    };
    const fetchUpcoming = async () => {
      try {
        const response = await fetch(buildApiUrl(buildUpcomingGamesEndpoint(upcomingPage)));
        if (!response.ok) throw new Error('Unable to load upcoming games');
        const upcoming = normalizeUpcomingGamesPage(await response.json());
        setUpcomingGames(upcoming.games);
        setUpcomingTotalGames(upcoming.totalGames);
        setUpcomingTotalPages(upcoming.totalPages);
        if (upcoming.page !== upcomingPage) setUpcomingPage(upcoming.page);
      } catch (error) {
        console.error('Failed to fetch upcoming games', error);
      }
    };
    await Promise.all([fetchToday(), fetchUpcoming()]);
    setLoading(false);
    setUpcomingLoading(false);
  }, [upcomingPage]);

  useEffect(() => { fetchGames(); const interval = setInterval(fetchGames, LIVE_GAMES_REFRESH_MS); return () => clearInterval(interval); }, [fetchGames]);

  const liveGames = todayGames.filter(game => Number(game.status) === STATUS_LIVE);
  const displayToday = [...todayGames].sort(
    (a, b) => (GAME_STATUS_ORDER[a.status] ?? 3) - (GAME_STATUS_ORDER[b.status] ?? 3),
  );
  const pagination = getUpcomingPaginationView({ page: upcomingPage, totalPages: upcomingTotalPages, totalGames: upcomingTotalGames, loading: upcomingLoading });
  const games = tab === 'today' ? displayToday : upcomingGames;
  const stats = getLiveGamesStats({ todayGames, upcomingTotalGames, lastUpdated, loading });
  const revealKey = `${tab}:${upcomingPage}:${loading}:${games.map(g => g.gameId).join(',')}`;

  return <div className="lg-page lg-live-page">
    <section className="lg-hero" ref={heroRef}>
      <div className="stats-nav-top">
        <span className="cv-section-badge" data-slot="eyebrow">REAL-TIME ARENA</span>
      </div>
      <div className="lg-title-stage">
        <h1 className="lg-title" data-slot="display-heading">
          <span className="lg-title-word" style={{ '--word': 0 }}>NBA</span>{' '}
          <span className="text-ember">
            <span className="lg-title-word" style={{ '--word': 1 }}>LIVE</span>{' '}
            <span className="lg-title-word" style={{ '--word': 2 }}>SLATE</span>
          </span>
        </h1>
        <HeroOrbit games={todayGames} />
      </div>
      <p className="lg-subtitle" data-slot="lead">Live game scores, active box scores &amp; possession stats</p>
      <dl className="lg-stat-strip" data-slot="stat-strip">
        {/* Keyed by value so a changed number remounts and ticks in. */}
        {stats.map(({ key, label, value }) => <div key={key}><dt>{label}</dt><dd data-numeric><span className="stat-tick" key={value}>{value}</span></dd></div>)}
      </dl>
      <div className="last-updated lg-meta-row">
        {lastUpdated && (
          <>
            <span data-numeric className="lg-meta-text">LAST SYNC: {lastUpdated.toLocaleTimeString()}</span>
            <button className="refresh-btn" onClick={fetchGames}>↻ REFRESH</button>
          </>
        )}
      </div>
    </section>
    <PillNav className="lg-tabs" label="Game lists" idPrefix="lg" panelId="lg-panel" value={tab} onChange={setTab}
      items={[
        { id: 'today', label: <><span className="lg-tab-label">TODAY'S SLATE</span>{liveGames.length > 0 && <span data-numeric className="live-badge">{liveGames.length} LIVE</span>}</> },
        { id: 'upcoming', label: <><span className="lg-tab-label">UPCOMING GAMES</span>{upcomingTotalGames > 0 && <span data-numeric className="count-badge">{upcomingTotalGames}</span>}</> },
      ]} />
    {!loading && tab === 'today' && <LiveTicker games={displayToday} />}
    <div className="lg-content" id="lg-panel" role="tabpanel" aria-labelledby={`lg-tab-${tab}`}>
      {loading ? (
        <div className="lg-loading"><div className="spinner" /><p>LOADING REAL-TIME SLATE...</p></div>
      ) : games.length === 0 ? (
        <div className="no-games">
          {tab === 'today' && <div className="trend-empty-radar" data-defer style={{ margin: '0 auto 1.5rem' }}><div className="trend-empty-dot" /></div>}
          <h3>{tab === 'today' ? 'NO LIVE GAMES SCHEDULED TODAY' : 'NO UPCOMING GAMES FOUND'}</h3>
          {tab === 'today' && (
            <>
              <p>Check the Upcoming Games tab for the next NBA slate</p>
              <button className="cta-button primary" onClick={() => setTab('upcoming')} style={{ marginTop: '1.5rem', display: 'inline-block' }}>VIEW UPCOMING SCHEDULE →</button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="games-grid">{games.map((game, index) => <GameCard key={game.gameId} game={game} index={index} scoreChanges={scoreChanges[game.gameId]} />)}</div>
          {tab === 'upcoming' && (
            <nav className="lg-pagination" aria-label="Upcoming games pages">
              <div className="lg-pagination-controls">
                <button className="lg-pagination-btn" disabled={pagination.previousDisabled} onClick={() => setUpcomingPage(page => Math.max(1, page - 1))}>Previous Page</button>
                <div className="lg-pagination-info"><div data-numeric className="lg-page-label">{pagination.pageLabel}</div><div data-numeric className="lg-page-count">{pagination.countLabel}</div></div>
                <button className="lg-pagination-btn" disabled={pagination.nextDisabled} onClick={() => setUpcomingPage(page => Math.min(upcomingTotalPages, page + 1))}>Next Page</button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
    <ScrollReveal scanKey={revealKey} />
    {lastUpdated && (
      <SyncDock watchRef={heroRef} liveCount={liveGames.length} lastUpdated={lastUpdated}
        intervalMs={LIVE_GAMES_REFRESH_MS} onRefresh={fetchGames} />
    )}
  </div>;
}
