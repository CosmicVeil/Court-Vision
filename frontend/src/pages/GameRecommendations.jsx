import ResultRegion from '../components/ResultRegion';
import LockIcon from '../components/LockIcon';
import ContentSkeleton from '../components/ContentSkeleton';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import GameMatchup from '../components/GameMatchup';
import InjuryBadge from '../components/InjuryBadge';
import PillNav from '../components/PillNav';
import PlayerStatsModal from '../components/PlayerStatsModal';
import PredictionModeToggle from '../components/PredictionModeToggle';
import StaleSlateNotice from '../components/StaleSlateNotice';
import TiltCard from '../components/TiltCard';
import { GAME_PICK_KINDS, GAME_PICK_STATS, gameStat } from '../config/gamePredictionStats';
import { buildApiUrl } from '../config/api';
import { authHeaders, clearAuth, isAuthenticated } from '../utils/auth';
import { formatSlateDate, formatTipoff, getPickLine } from '../utils/gamePredictions';
import { samePlayerName } from '../utils/playerNames';
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
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(buildApiUrl('game-recommendations'), { signal: controller.signal, headers: authHeaders() })
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
        if (response.ok) setData(await response.json());
      })
      .catch(err => { if (!controller.signal.aborted) console.error('Error fetching game picks', err); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const handlePlayerClick = async player => {
    setLoadingPlayer(true);
    try {
      const response = await fetch(buildApiUrl(`players/search-all?query=${encodeURIComponent(player.name)}`));
      const body = await response.json();
      const match = (body.players || []).find(p => samePlayerName(p.name, player.name));
      setSelectedPlayer(match || {
        name: player.name, team: player.team, position: player.position || 'UNK',
        current_stats: {
          ppg: player.last10_pts || 0, rpg: player.last10_reb || 0, apg: player.last10_ast || 0,
          spg: player.last10_stl || 0, bpg: player.last10_blk || 0, tov: player.last10_tov || 0,
          mpg: player.last10_minutes || 0, fg_pct: 0, fg3_pct: 0, ft_pct: 0, games_played: 0,
          minutes: player.last10_minutes || 0,
        },
        ml_stats: null,
        history: {},
      });
    } catch (err) {
      console.error('Error fetching player details:', err);
    } finally {
      setLoadingPlayer(false);
    }
  };

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
          {data?.slate_date ? ` on ${formatSlateDate(data.slate_date)}` : ''}
        </p>
      </header>

      <div className="recommendations-content">
        {data && <StaleSlateNotice data={data} />}
        {/* Signed-out visitors always get the sign-in card, so only show the tabs while loading if
            they will still be there afterwards; otherwise the layout jumps when the 401 arrives. */}
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
                              <div className="gr-who">
                                <button type="button" className="gr-name" onClick={() => handlePlayerClick(player)}>
                                  {player.name}
                                </button>
                                <span className="gr-meta" data-numeric>
                                  <GameMatchup player={player} /> · {formatTipoff(player.tipoff)}
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
              players averaging {data.min_average_minutes ?? 15}+ minutes. Players ruled out on the injury report
              are left out; questionable ones are flagged.
            </p>
          </>
        )}
      </div>

      <PlayerStatsModal player={selectedPlayer} loading={loadingPlayer} onClose={() => setSelectedPlayer(null)} />
    </div>
  );
}
