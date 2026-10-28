import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { buildApiUrl } from '../config/api';
import { BoxScore, QuarterTable } from '../components/GameBoxScore';
import GameScoreboard from '../components/GameScoreboard';
import PlayerStatsModal from '../components/PlayerStatsModal';
import ScrollReveal from '../components/ScrollReveal';
import SyncDock from '../components/SyncDock';
import { getGameLeaders, getPeriodBreakdown } from '../utils/gameDetail';
import { getScoreChanges } from '../utils/liveInteractions';
import { buildGameDetailEndpoint, LIVE_GAMES_REFRESH_MS, STATUS_FINAL, STATUS_LIVE, STATUS_SCHEDULED } from '../utils/liveGames';
import { buildPlayerFallback, fetchPlayerDetails } from '../utils/playerDetails';
import { getRevealDelay } from '../utils/scrollReveal';
import './LiveGames.css';

function PeriodMomentum({ game }) {
  const rows = getPeriodBreakdown(game.away, game.home);
  return (
    <section className="detail-section detail-momentum" data-reveal>
      <div className="detail-section-head">
        <h2 className="detail-section-title">Period by period</h2>
        <div className="period-legend" aria-hidden="true">
          <span className="legend-away">{game.away.tricode}</span>
          <span className="legend-home">{game.home.tricode}</span>
        </div>
      </div>
      <div className="period-bars" aria-hidden="true">
        {rows.map((row, index) => (
          <div key={row.label} className="period-col" data-winner={row.winner || undefined}>
            <div className="period-bar-pair">
              <span className="period-bar bar-away" style={{ '--share': row.awayShare, '--i': index }} />
              <span className="period-bar bar-home" style={{ '--share': row.homeShare, '--i': index }} />
            </div>
            <span className="period-label">{row.label}</span>
            <span className="period-scores" data-numeric>{row.away ?? '–'}–{row.home ?? '–'}</span>
          </div>
        ))}
      </div>
      <QuarterTable home={game.home} away={game.away} />
    </section>
  );
}

export default function LiveGameDetail() {
  const { gameId } = useParams();
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [player, setPlayer] = useState(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [scoreChanges, setScoreChanges] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);
  const gameStatusRef = useRef(null);
  const gameRequestsRef = useRef(new Set());
  const playerRequestRef = useRef(null);
  const previousGameRef = useRef(null);
  const heroRef = useRef(null);

  useEffect(() => {
    gameStatusRef.current = game?.status ?? null;
  }, [game?.status]);

  const fetchGame = useCallback(async (background = false, signal) => {
    if (!background) {
      setLoading(true);
      setNotFound(false);
      setError(null);
    }
    try {
      const response = await fetch(buildApiUrl(buildGameDetailEndpoint(gameId)), { signal });
      if (response.status === 404) {
        if (!background) {
          setNotFound(true);
          setGame(null);
          setError(null);
        }
        return;
      }
      if (!response.ok) throw new Error('Unable to load this game');
      const nextGame = await response.json();
      // Compared by gameId, so navigating to another game never reports a change.
      setScoreChanges(getScoreChanges(previousGameRef.current ? [previousGameRef.current] : [], [nextGame])[nextGame.gameId] || {});
      previousGameRef.current = nextGame;
      setGame(nextGame);
      setLastUpdated(new Date());
      gameStatusRef.current = nextGame.status;
      setError(null);
      setNotFound(false);
    } catch (reason) {
      if (reason.name !== 'AbortError' && !background) setError(reason.message);
    } finally {
      if (!background && !signal?.aborted) setLoading(false);
    }
  }, [gameId]);

  const requestGame = useCallback((background = false) => {
    const controller = new AbortController();
    gameRequestsRef.current.add(controller);
    return fetchGame(background, controller.signal).finally(() => {
      gameRequestsRef.current.delete(controller);
    });
  }, [fetchGame]);

  useEffect(() => {
    const requests = gameRequestsRef.current;
    gameStatusRef.current = null;
    requestGame(false);
    const interval = setInterval(() => {
      if (Number(gameStatusRef.current) !== STATUS_FINAL) requestGame(true);
    }, LIVE_GAMES_REFRESH_MS);

    return () => {
      clearInterval(interval);
      requests.forEach(controller => controller.abort());
      requests.clear();
    };
  }, [requestGame]);

  useEffect(() => () => playerRequestRef.current?.abort(), []);

  const closePlayer = useCallback(() => {
    playerRequestRef.current?.abort();
    playerRequestRef.current = null;
    setPlayerLoading(false);
    setPlayer(null);
  }, []);

  const selectPlayer = useCallback(async selected => {
    playerRequestRef.current?.abort();
    const controller = new AbortController();
    playerRequestRef.current = controller;
    setPlayer(null);
    setPlayerLoading(true);
    try {
      setPlayer(await fetchPlayerDetails(selected, controller.signal));
    } catch (reason) {
      if (reason.name !== 'AbortError') setPlayer(buildPlayerFallback(selected));
    } finally {
      if (playerRequestRef.current === controller) {
        playerRequestRef.current = null;
        setPlayerLoading(false);
      }
    }
  }, []);

  const ready = !loading && !notFound && !error && game;
  const leaders = ready ? getGameLeaders(game) : [];
  const isLive = Number(game?.status) === STATUS_LIVE;

  return (
    <div className="lg-page lg-detail-page">
      {ready ? (
        <section className="lg-hero detail-hero" ref={heroRef}>
          <GameScoreboard game={game} scoreChanges={scoreChanges} />
          {leaders.length > 0 && (
            <dl className="detail-leaders" data-slot="stat-strip">
              {leaders.map((leader, index) => (
                <div key={leader.key} data-reveal style={{ '--reveal-delay': getRevealDelay(index) }}>
                  <dt>{leader.label}</dt>
                  <dd>
                    <button type="button" className="leader-card" onClick={() => selectPlayer(leader.player)}>
                      <span className="leader-value" data-numeric><span className="stat-tick" key={leader.value}>{leader.value}</span></span>
                      <span className="leader-name">{leader.player.name}</span>
                      <span className="leader-team">{leader.tricode}</span>
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ) : (
        <div className="lg-hero">
          <Link to="/games" className="back-to-home">← ALL GAMES</Link>
          <h1 className="lg-title">GAME <span className="text-ember">DETAIL</span></h1>
        </div>
      )}
      <main className="lg-content">
        {loading ? (
          <div className="lg-loading"><div className="spinner" /><p>LOADING GAME...</p></div>
        ) : notFound ? (
          <div className="no-games"><h2>GAME NOT FOUND</h2><p>This game is not in today's or upcoming schedule.</p><Link to="/games" className="expand-btn">BACK TO GAMES</Link></div>
        ) : error ? (
          <div className="no-games"><h2>UNABLE TO LOAD GAME</h2><p>{error}</p><button className="expand-btn" onClick={() => requestGame(false)}>TRY AGAIN</button></div>
        ) : game && (
          <div className="lg-detail-card detail-body">
            {Number(game.status) !== STATUS_SCHEDULED && <PeriodMomentum game={game} />}
            <section className="detail-section detail-boxscore" data-reveal>
              <h2 className="detail-section-title">Box score</h2>
              <BoxScore game={game} onPlayerClick={selectPlayer} />
            </section>
          </div>
        )}
      </main>
      <ScrollReveal scanKey={`${loading}:${notFound}:${Boolean(error)}:${game?.gameId}`} />
      {ready && Number(game.status) !== STATUS_FINAL && (
        <SyncDock watchRef={heroRef} label={isLive ? 'LIVE' : 'PRE-GAME'} live={isLive}
          lastUpdated={lastUpdated} intervalMs={LIVE_GAMES_REFRESH_MS} onRefresh={() => requestGame(true)} />
      )}
      <PlayerStatsModal player={player} loading={playerLoading} onClose={closePlayer} />
    </div>
  );
}
