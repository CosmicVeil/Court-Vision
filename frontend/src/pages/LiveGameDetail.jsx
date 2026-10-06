import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { buildApiUrl } from '../config/api';
import { BoxScore, GameMatchup, QuarterTable } from '../components/GameBoxScore';
import PlayerStatsModal from '../components/PlayerStatsModal';
import { buildGameDetailEndpoint, LIVE_GAMES_REFRESH_MS, STATUS_FINAL, STATUS_SCHEDULED } from '../utils/liveGames';
import { buildPlayerFallback, fetchPlayerDetails } from '../utils/playerDetails';
import './LiveGames.css';

export default function LiveGameDetail() {
  const { gameId } = useParams();
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [player, setPlayer] = useState(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const gameStatusRef = useRef(null);
  const gameRequestsRef = useRef(new Set());
  const playerRequestRef = useRef(null);

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
      setGame(nextGame);
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

  return (
    <div className="lg-page lg-detail-page">
      <div className="lg-hero">
        <Link to="/games" className="back-to-home">← ALL GAMES</Link>
        <h1 className="lg-title">GAME <span className="text-ember">DETAIL</span></h1>
      </div>
      <main className="lg-content">
        {loading ? (
          <div className="lg-loading"><div className="spinner" /><p>LOADING GAME...</p></div>
        ) : notFound ? (
          <div className="no-games"><h2>GAME NOT FOUND</h2><p>This game is not in today's or upcoming schedule.</p><Link to="/games" className="expand-btn">BACK TO GAMES</Link></div>
        ) : error ? (
          <div className="no-games"><h2>UNABLE TO LOAD GAME</h2><p>{error}</p><button className="expand-btn" onClick={() => requestGame(false)}>TRY AGAIN</button></div>
        ) : game && (
          <article className="game-card lg-detail-card">
            <div className="game-card-header"><GameMatchup game={game} /></div>
            <div className="game-detail">
              {Number(game.status) !== STATUS_SCHEDULED && <QuarterTable home={game.home} away={game.away} />}
              <BoxScore game={game} onPlayerClick={selectPlayer} />
            </div>
          </article>
        )}
      </main>
      <PlayerStatsModal player={player} loading={playerLoading} onClose={closePlayer} />
    </div>
  );
}
