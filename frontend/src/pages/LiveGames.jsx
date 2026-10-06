import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildApiUrl } from '../config/api';
import { GameMatchup } from '../components/GameBoxScore';
import { LIVE_GAMES_REFRESH_MS, STATUS_LIVE, getGameDetailPath } from '../utils/liveGames';
import { buildUpcomingGamesEndpoint, getUpcomingPaginationView, normalizeUpcomingGamesPage } from '../utils/upcomingGamesPagination';
import './LiveGames.css';

const GAME_STATUS_ORDER = { 2: 0, 1: 1, 3: 2 };

function GameCard({ game }) {
  const isLive = Number(game.status) === STATUS_LIVE;
  return (
    <Link to={getGameDetailPath(game.gameId)} className="game-card-link">
      <article className={`game-card ${isLive ? 'live' : Number(game.status) === 3 ? 'final' : 'future'}`}>
        {isLive && <div className="live-pulse-ring" />}
        <div className="game-card-header">
          <GameMatchup game={game} />
          <span className="expand-btn">{Number(game.status) === 1 ? 'View Roster →' : 'View Details →'}</span>
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

  const fetchGames = useCallback(async () => {
    setUpcomingLoading(true);
    const fetchToday = async () => {
      try {
        const response = await fetch(buildApiUrl('games/today'));
        if (!response.ok) throw new Error('Unable to load today\'s games');
        const data = await response.json();
        setTodayGames(data.games || []);
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

  return <div className="lg-page">
    <div className="lg-hero">
      <div className="stats-nav-top">
        <Link to="/" className="back-to-home">← HOME</Link>
        <span className="cv-section-badge">REAL-TIME ARENA</span>
      </div>
      <h1 className="lg-title">NBA <span className="text-ember">LIVE SLATE</span></h1>
      <p className="lg-subtitle">Live game scores, active box scores &amp; possession stats</p>
      {lastUpdated && (
        <div className="last-updated">
          <span>LAST SYNC: {lastUpdated.toLocaleTimeString()}</span>
          <button className="refresh-btn" onClick={fetchGames}>↻ REFRESH</button>
        </div>
      )}
    </div>
    <div className="lg-tabs">
      <button className={`lg-tab ${tab === 'today' ? 'active' : ''}`} onClick={() => setTab('today')}>
        TODAY'S SLATE
        {liveGames.length > 0 && <span className="live-badge">{liveGames.length} LIVE</span>}
      </button>
      <button className={`lg-tab ${tab === 'upcoming' ? 'active' : ''}`} onClick={() => setTab('upcoming')}>
        UPCOMING GAMES
        {upcomingTotalGames > 0 && <span className="count-badge">{upcomingTotalGames}</span>}
      </button>
    </div>
    <div className="lg-content">
      {loading ? (
        <div className="lg-loading"><div className="spinner" /><p>LOADING REAL-TIME SLATE...</p></div>
      ) : games.length === 0 ? (
        <div className="no-games">
          {tab === 'today' && <div className="trend-empty-radar" style={{ margin: '0 auto 1.5rem' }}><div className="trend-empty-dot" /></div>}
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
          <div className="games-grid">{games.map(game => <GameCard key={game.gameId} game={game} />)}</div>
          {tab === 'upcoming' && (
            <nav className="lg-pagination" aria-label="Upcoming games pages">
              <div className="lg-pagination-controls">
                <button className="lg-pagination-btn" disabled={pagination.previousDisabled} onClick={() => setUpcomingPage(page => Math.max(1, page - 1))}>Previous Page</button>
                <div className="lg-pagination-info"><div className="lg-page-label">{pagination.pageLabel}</div><div className="lg-page-count">{pagination.countLabel}</div></div>
                <button className="lg-pagination-btn" disabled={pagination.nextDisabled} onClick={() => setUpcomingPage(page => Math.min(upcomingTotalPages, page + 1))}>Next Page</button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  </div>;
}
