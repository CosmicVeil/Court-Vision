import { useCallback, useEffect, useRef, useState } from 'react';
import { buildApiUrl } from '../config/api';
import ShotChart from './ShotChart';
import PlayByPlayTicker from './PlayByPlayTicker';
import { STATUS_LIVE, STATUS_SCHEDULED } from '../utils/liveGames';

/**
 * LIVE COURT tab body: assembles the shot chart and the play-by-play ticker from
 * /api/games/{id}/playbyplay. Polls every 10s while the game is live.
 *
 * Props:
 *   gameId — the game id
 *   status — numeric game status (scheduled / live / final)
 *   teams  — { home, away } tricodes from the parent game object (for a fallback)
 */

const PBP_POLL_MS = 10000;

export default function CourtView({ gameId, status, teams: fallbackTeams }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fullCourt, setFullCourt] = useState(false);
  const requestRef = useRef(null);

  const isScheduled = Number(status) === STATUS_SCHEDULED;
  const isLive = Number(status) === STATUS_LIVE;

  const fetchPlays = useCallback(async (background = false) => {
    if (isScheduled) {
      setLoading(false);
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (!background) setLoading(true);
    try {
      const response = await fetch(buildApiUrl(`games/${encodeURIComponent(gameId)}/playbyplay`), { signal: controller.signal });
      if (!response.ok) throw new Error('Unable to load play-by-play');
      const next = await response.json();
      setData(next);
      setError(null);
    } catch (reason) {
      if (reason.name !== 'AbortError' && !background) setError(reason.message);
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (!background && !controller.signal.aborted) setLoading(false);
    }
  }, [gameId, isScheduled]);

  useEffect(() => {
    fetchPlays(false);
    return () => requestRef.current?.abort();
  }, [fetchPlays]);

  // Live polling every 10s; stops when the game is no longer live.
  useEffect(() => {
    if (!isLive) return undefined;
    const interval = setInterval(() => fetchPlays(true), PBP_POLL_MS);
    return () => clearInterval(interval);
  }, [isLive, fetchPlays]);

  if (isScheduled) {
    return (
      <div className="courtview-placeholder">
        <div className="courtview-placeholder-court" aria-hidden="true">🏀</div>
        <h3>Court view unlocks at tip-off</h3>
        <p>Live play-by-play and the shot chart appear here once this game starts.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="courtview-loading"><div className="spinner" /><p>LOADING COURT...</p></div>;
  }

  if (error) {
    return (
      <div className="courtview-error">
        <p>{error}</p>
        <button className="expand-btn" onClick={() => fetchPlays(false)}>TRY AGAIN</button>
      </div>
    );
  }

  const teams = data?.teams?.home ? data.teams : fallbackTeams;
  const shots = data?.shots || [];
  const plays = data?.plays || [];

  if (!data?.available || (!shots.length && !plays.length)) {
    return <div className="courtview-placeholder"><h3>No court data yet</h3><p>Play-by-play will appear once the game produces data.</p></div>;
  }

  return (
    <div className="courtview">
      <div className="courtview-head">
        <div className="courtview-teams" data-numeric>
          <span className="cv-team away">{teams?.away}</span>
          <span className="cv-vs">at</span>
          <span className="cv-team home">{teams?.home}</span>
        </div>
        <button type="button" className="court-toggle" onClick={() => setFullCourt(value => !value)}
          aria-pressed={fullCourt}>
          {fullCourt ? 'Half court' : 'Full court'}
        </button>
      </div>

      <div className="courtview-grid">
        <section className="courtview-chart">
          <ShotChart shots={shots} full={fullCourt} />
        </section>
        <section className="courtview-ticker">
          <h3 className="courtview-ticker-title">Play-by-play</h3>
          <PlayByPlayTicker plays={plays} isLive={isLive} />
        </section>
      </div>
    </div>
  );
}
