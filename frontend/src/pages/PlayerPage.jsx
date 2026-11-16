import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PlayerProfile from '../components/PlayerProfile';
import { buildPlayerFallback, fetchPlayerPage, normalizePlayerRow } from '../utils/playerDetails';
import { readPlayerTab, withPlayerTab } from '../utils/playerPage';
import './Stats.css';
import './PlayerPage.css';

// What the page shows for each load state. Exported so tests can render it without effects.
export function PlayerPageContent({ status, player, tab, onTabChange, returnTo, onBack }) {
  return (
    <div className="pp-page">
      <div className="pp-shell">
        <div className="pp-topbar">
          <Link to="/stats" className="pp-back" onClick={onBack}>← BACK</Link>
          {player && (
            <p className="pp-status" role="status">{status === 'loading' ? 'Loading full profile…' : ''}</p>
          )}
        </div>
        {player ? (
          <PlayerProfile player={player} loading={status === 'loading'} tab={tab} onTabChange={onTabChange} returnTo={returnTo} />
        ) : status === 'loading' ? (
          <div className="pp-empty" role="status">
            <div className="search-spinner" />
            <p>Loading player…</p>
          </div>
        ) : (
          <div className="pp-empty">
            <h1 className="pp-empty-title">Player not found</h1>
            <p>No NBA player matches this link. Search the stats list to find them.</p>
            <Link to="/stats" className="pp-empty-link">Browse player stats</Link>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerPageBody() {
  const { playerId, name } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // The row the linking page passed in router state: shown at once while the full profile loads.
  const [hint] = useState(() => location.state?.player ?? null);
  const [result, setResult] = useState(() => ({ status: 'loading', player: hint ? buildPlayerFallback(normalizePlayerRow(hint)) : null }));

  useEffect(() => {
    // Aborting on cleanup drops a slow answer for a player the user has already left.
    const controller = new AbortController();
    fetchPlayerPage({ playerId, name, hint }, controller.signal)
      .then(player => setResult({ status: player ? 'ready' : 'missing', player }))
      .catch(error => { if (error.name !== 'AbortError') setResult({ status: 'missing', player: null }); });
    return () => controller.abort();
  }, [playerId, name, hint]);

  // Replace, not push: switching tabs shouldn't fill the history Back walks through. The router
  // state is kept so a reload of this entry still has its placeholder.
  const onTabChange = tab => setSearchParams(withPlayerTab(searchParams, tab), { replace: true, state: location.state });

  // The router numbers its history entries (idx); 0 means this page was opened directly, so
  // there is nothing in the app to go back to and the link's own /stats is followed instead.
  const onBack = event => {
    if (!(window.history.state?.idx > 0)) return;
    event.preventDefault();
    navigate(-1);
  };

  return (
    <PlayerPageContent status={result.status} player={result.player} tab={readPlayerTab(searchParams)}
      onTabChange={onTabChange} returnTo={`${location.pathname}${location.search}`} onBack={onBack} />
  );
}

// Keyed by path, so moving from one player to another starts fresh instead of showing the old one.
export default function PlayerPage() {
  const { pathname } = useLocation();
  return <PlayerPageBody key={pathname} />;
}
