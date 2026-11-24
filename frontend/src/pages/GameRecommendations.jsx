import ResultRegion from '../components/ResultRegion';
import LockIcon from '../components/LockIcon';
import ContentSkeleton from '../components/ContentSkeleton';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import GameMatchup from '../components/GameMatchup';
import InjuryBadge from '../components/InjuryBadge';
import PlayerHeadshot from '../components/PlayerHeadshot';
import PillNav from '../components/PillNav';
import PredictionModeToggle from '../components/PredictionModeToggle';
import StaleSlateNotice from '../components/StaleSlateNotice';
import TiltCard from '../components/TiltCard';
import { GAME_PICK_KINDS, GAME_PICK_STATS, gameStat } from '../config/gamePredictionStats';
import { buildApiUrl } from '../config/api';
import { authHeaders, clearAuth, isAuthenticated } from '../utils/auth';
import { formatSlateDate, formatTipoff, getDayTabs, getPickLine } from '../utils/gamePredictions';
import { playerPath } from '../utils/playerPage';
import { enterDelay } from '../utils/scrollReveal';
import './Recommendations.css';
import './GameRecommendations.css';

const STAT_TABS = GAME_PICK_STATS.map(key => ({ id: key, label: gameStat(key).unit }));

export default function GameRecommendations() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [stat, setStat] = useState('pts');
  // '' = the nearest day, which the API picks; picks compare players within one night.
  const [day, setDay] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const query = day ? `?${new URLSearchParams({ date: day })}` : '';
    fetch(buildApiUrl(`game-recommendations${query}`), { signal: controller.signal, headers: authHeaders() })
      .then(async response => {
        if (response.status === 401) {
          clearAuth();
          setNeedsAuth(true);
          return;
        }
        if (response.status === 503) {
          setUnavailable(true);
          return;
        }
        if (response.ok) {
          const body = await response.json();
          if (!controller.signal.aborted) setData(body);
        }
      })
      .catch(err => { if (!controller.signal.aborted) console.error('Error fetching game picks', err); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [day]);

  const unit = gameStat(stat).unit;
  const showPicks = !loading && Boolean(data) && !needsAuth && !unavailable;

  return (
    <div className="recommendations-wrapper">
      <PredictionModeToggle base="/recommendations" value="games" />
      <header className="recommendations-header" data-enter>
        <div className="stats-nav-top">
          <span className="cv-section-badge">PER-GAME MODEL</span>
        </div>
        <h1 className="recommendations-title">
          Game <span className="text-ember">picks</span>
        </h1>
        <p className="recommendations-subtitle">
          Who our per-game model expects to beat, top or fall short of their recent form
          {data?.date || data?.slate_date ? ` on ${formatSlateDate(data.date || data.slate_date)}` : ''}
        </p>
      </header>

      <div className="recommendations-content">
        {data && <StaleSlateNotice data={data} />}
        {/* Signed-out visitors always get the sign-in card, so only show the tabs while loading if
            they will still be there afterwards; otherwise the layout jumps when the 401 arrives. */}
        {showPicks && data.slate_dates?.length > 1 && (
          <PillNav className="pm-toggle gr-day-tabs" tabClassName="pm-tab" label="Game day" idPrefix="gr-day"
            items={getDayTabs(data.slate_dates)} value={data.date || data.slate_dates[0]} onChange={setDay} />
        )}
        {((loading && isAuthenticated()) || showPicks) && (
          <PillNav className="pm-toggle gr-stat-tabs" tabClassName="pm-tab" label="Stat" idPrefix="gr"
            panelId={showPicks ? 'gr-panel' : undefined} items={STAT_TABS} value={stat} onChange={setStat} />
        )}
        {loading ? (
          <ContentSkeleton variant="picks" count={3} label="Loading recommendations…" />
        ) : needsAuth ? (
          <div className="predictions-locked">
            <div className="predictions-locked-icon" aria-hidden="true"><LockIcon /></div>
            <h2 className="predictions-locked-title">Sign in to see the picks</h2>
            <p className="predictions-locked-desc">
              Per-game picks are a free account feature. Log in or create an account to see who
              our model expects to have a big night.
            </p>
            <div className="predictions-locked-actions">
              <Link to="/login" state={{ from: '/recommendations/games' }} className="empty-cta">Log In</Link>
              <Link to="/create-account" state={{ from: '/recommendations/games' }} className="empty-cta prediction-auth-secondary">
                Create Account
              </Link>
            </div>
          </div>
        ) : unavailable || !data ? (
          <p className="gr-empty">
            Per-game picks are not available right now. They are rebuilt every morning for the next day with games.
          </p>
        ) : (
          <>
            <ResultRegion changeKey={stat} className="gr-grid" id="gr-panel" role="tabpanel" aria-labelledby={`gr-tab-${stat}`}>
              {GAME_PICK_KINDS.map((kind, index) => {
                const players = data.recommendations?.[kind.id]?.[stat] || [];
                return (
                  <TiltCard key={kind.id} as="section" className="spotlight-card gr-column" data-enter
                    style={enterDelay(index + 1)} aria-labelledby={`gr-${kind.id}-title`}>
                    <div className="spotlight-badge-row">
                      <span className="spotlight-stat-tag">{unit}</span>
                      <span className="spotlight-role-tag">{kind.role}</span>
                    </div>
                    <h2 id={`gr-${kind.id}-title`} className="gr-column-title">{kind.title}</h2>
                    <p className="gr-column-desc">{kind.description}</p>
                    {players.length === 0 ? (
                      <p className="gr-empty">No players on this slate.</p>
                    ) : (
                      <ol className="gr-list">
                        {players.map((player, rank) => {
                          const line = getPickLine(player, stat);
                          return (
                            <li key={`${player.game_id}-${player.espn_id}`} className="gr-row">
                              <span className="gr-rank" data-numeric>{rank + 1}</span>
                              <PlayerHeadshot playerId={player.id ?? null} name={player.name} className="player-row-photo" />
                              <div className="gr-who">
                                {/* playerPath uses the row's NBA id and ignores espn_id. */}
                                <Link to={playerPath(player)} state={{ player }} className="gr-name">
                                  {player.name}
                                </Link>
                                <span className="gr-meta" data-numeric>
                                  <GameMatchup player={player} gameId={player.game_id} /> · {formatTipoff(player.tipoff)}
                                  <InjuryBadge injury={player.injury} />
                                </span>
                              </div>
                              <div className="gr-numbers" data-numeric>
                                <span className="gr-predicted">{line.predicted}</span>
                                <span className="gr-average">avg {line.average}</span>
                                {line.diff && (
                                  <span className={`spotlight-stat-growth ${line.diff.up ? 'positive' : 'negative'}`}>
                                    {line.diff.text}
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </TiltCard>
                );
              })}
            </ResultRegion>
            <p className="gr-footnote">
              "avg" is the player's average over his previous 10 games. Above/below-average lists only include
              players averaging {data.min_average_minutes ?? 15}+ minutes, and leave out anyone already in the top
              projected lines. Players ruled out on the injury report
              are left out; questionable ones are flagged.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
