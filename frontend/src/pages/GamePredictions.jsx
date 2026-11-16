import ContentSkeleton from '../components/ContentSkeleton';
import LockIcon from '../components/LockIcon';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import FilterBar from '../components/FilterBar';
import GameMatchup from '../components/GameMatchup';
import InjuryBadge from '../components/InjuryBadge';
import PageHero from '../components/PageHero';
import Pagination from '../components/Pagination';
import PlayerCard from '../components/PlayerCard';
import PlayerStatsModal from '../components/PlayerStatsModal';
import PredictionModeToggle from '../components/PredictionModeToggle';
import ScrollReveal from '../components/ScrollReveal';
import StaleSlateNotice from '../components/StaleSlateNotice';
import useFlip from '../hooks/useFlip';
import useListQuery from '../hooks/useListQuery';
import { GAME_PREDICTION_STATS } from '../config/gamePredictionStats';
import { buildApiUrl } from '../config/api';
import { authHeaders, clearAuth, isAuthenticated } from '../utils/auth';
import {
  formatLine, formatSlateDate, formatTipoff, getGameCardStats, getGamePredictionsHeroStats,
  sortStatKey, teamsForGames,
} from '../utils/gamePredictions';
import { samePlayerName } from '../utils/playerNames';
import { scrollToIfAbove } from '../utils/scroll';
import './Predictions.css';
import './GamePredictions.css';

// "Above average" sorts rank by projection minus the last-10 average.
const DIFF_SORTS = ['pts', 'pra', 'fantasy'];
const LIST_DEFAULTS = { q: '', team: '', game: '', sort: 'predicted_pts', order: 'desc', page: 1 };
const LIST_ALLOWED = {
  sort: ['name', ...GAME_PREDICTION_STATS.map(stat => `predicted_${stat.key}`), ...DIFF_SORTS.map(key => `diff_${key}`)],
  order: ['asc', 'desc'],
};
const PAGE_SIZE = 12;

export default function GamePredictions() {
  const [query, updateQuery] = useListQuery(LIST_DEFAULTS, LIST_ALLOWED);
  const { q: searchTerm, team, game: gameId, sort: sortBy, order: sortOrder, page } = query;
  const [searchDraft, setSearchDraft] = useState(searchTerm);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  const gridRef = useRef(null);
  const resultsRef = useRef(null);
  useFlip(gridRef);

  // Each change aborts the previous request, so a slow older response never overwrites a newer one.
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page), limit: String(PAGE_SIZE), sort_by: sortBy, sort_order: sortOrder,
    });
    if (searchTerm) params.append('search', searchTerm);
    if (team) params.append('team', team);
    if (gameId) params.append('game_id', gameId);

    setLoading(true);
    fetch(buildApiUrl(`game-predictions?${params}`), { signal: controller.signal, headers: authHeaders() })
      .then(async response => {
        if (response.status === 503) {
          setUnavailable(true);
          return;
        }
        if (!response.ok) throw new Error('Failed to fetch per-game predictions');
        const body = await response.json();
        if (controller.signal.aborted) return;
        setData(body);
        setUnavailable(false);
        setError(null);
        if (body.preview && isAuthenticated()) {
          // A stored token the server rejected has expired: drop it and ask to sign in again.
          clearAuth();
          setSessionExpired(true);
        }
      })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, searchTerm, team, gameId, sortBy, sortOrder]);

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

  const predictions = data?.predictions || [];
  const games = data?.games || [];
  const totalPlayers = data?.pagination?.total || 0;
  const isPreview = data ? Boolean(data.preview) : !isAuthenticated();
  const leadStat = sortStatKey(sortBy);
  const teamOptions = teamsForGames(games, gameId);
  // Picking a game drops a team filter for a team not in it, which would otherwise match nobody.
  const selectGame = nextGameId => updateQuery({
    game: nextGameId,
    team: team && !teamsForGames(games, nextGameId).includes(team) ? '' : team,
    page: 1,
  });

  const goToPage = next => {
    updateQuery({ page: next });
    scrollToIfAbove(resultsRef.current);
  };
  const isNameSort = sortBy === 'name';
  const sortDirectionLabel = sortOrder === 'asc'
    ? (isNameSort ? 'A to Z' : 'Lowest to Highest')
    : (isNameSort ? 'Z to A' : 'Highest to Lowest');

  return (
    <div className="predictions-container game-predictions-page">
      <ScrollReveal scanKey={predictions} />
      <PredictionModeToggle base="/predictions" value="games" />
      <PageHero
        title="Game"
        accent="projections"
        lead="Player projections based on recent form, rest, matchup odds and injuries."
        stats={getGamePredictionsHeroStats({
          ready: Boolean(data) && !error, slateDate: data?.slate_date, games: games.length,
          total: totalPlayers, sort: sortBy, order: sortOrder,
        })}
      />

      <StaleSlateNotice data={data} />

      {games.length > 0 && (
        <section className="gp-slate" aria-label={`Games on ${formatSlateDate(data.slate_date)}`}>
          {games.map(game => {
            const active = gameId === game.game_id;
            return (
              <button key={game.game_id} type="button" className={`gp-game ${active ? 'is-active' : ''}`}
                aria-pressed={active} onClick={() => selectGame(active ? '' : game.game_id)}>
                <span className="gp-game-teams"><GameMatchup game={game} size="lg" /></span>
                <span className="gp-game-meta" data-numeric>{formatTipoff(game.tipoff)}</span>
                {formatLine(game) && <span className="gp-game-meta" data-numeric>{formatLine(game)}</span>}
              </button>
            );
          })}
        </section>
      )}

      <FilterBar
        search={{ value: searchDraft, onChange: e => { setSearchDraft(e.target.value); updateQuery({ q: e.target.value, page: 1 }); } }}
        filters={[
          { key: 'team', label: 'Team', allLabel: 'All Teams', value: team, options: teamOptions,
            onChange: e => updateQuery({ team: e.target.value, page: 1 }) },
        ]}
        onClear={() => { setSearchDraft(''); updateQuery({ q: '', team: '', game: '', page: 1 }); }}
      />

      <div className="sorting-section" ref={resultsRef}>
        <div className="sort-control-group">
          <label className="sort-label" htmlFor="game-prediction-sort-field">Sort by</label>
          <select id="game-prediction-sort-field" className="prediction-sort-select" value={sortBy}
            onChange={e => {
              const next = e.target.value;
              updateQuery({ sort: next, order: next === 'name' ? 'asc' : 'desc', page: 1 });
              scrollToIfAbove(resultsRef.current);
            }}>
            <option value="name">Name</option>
            {GAME_PREDICTION_STATS.map(stat => (
              <option key={stat.key} value={`predicted_${stat.key}`}>Predicted {stat.unit}</option>
            ))}
            {DIFF_SORTS.map(key => (
              <option key={key} value={`diff_${key}`}>
                {GAME_PREDICTION_STATS.find(stat => stat.key === key).unit} above average
              </option>
            ))}
          </select>
          <button type="button" className="sort-direction-btn"
            onClick={() => { updateQuery({ order: sortOrder === 'asc' ? 'desc' : 'asc', page: 1 }); scrollToIfAbove(resultsRef.current); }}
            aria-label={`Change sort direction. Current order: ${sortDirectionLabel}`}>
            <span className="sort-direction-icon" aria-hidden="true">{sortOrder === 'asc' ? '↑' : '↓'}</span>
            <span>{sortDirectionLabel}</span>
          </button>
        </div>
        <span data-slot="results-status" role="status" data-numeric>
          {loading ? 'Updating…' : `${totalPlayers} players`}
        </span>
      </div>

      {unavailable ? (
        <div className="no-results">
          Per-game predictions are not available right now. They are rebuilt every morning for the next day with games.
        </div>
      ) : loading && !data ? (
        <ContentSkeleton label="Loading game projections…" />
      ) : error ? (
        <div className="error">Error: {error}</div>
      ) : predictions.length === 0 ? (
        <div className="no-results">No players matched your search.</div>
      ) : (
        <>
          <p className="gp-results-caption">Projection · change vs last 10 games</p>
          <div className="pc-grid" ref={gridRef} data-results aria-busy={loading}>
            {predictions.map((player, index) => {
              const { main, extra } = getGameCardStats(player, leadStat);
              return (
                <PlayerCard
                  key={`${player.game_id}-${player.espn_id}`}
                  index={index}
                  player={{ id: player.id ?? player.espn_id, name: player.name, position: player.position }}
                  stats={main}
                  extraStats={extra}
                  onOpen={() => handlePlayerClick(player)}
                  ctaLabel="Player stats"
                  headerAside={
                  <p className="pc-matchup" data-numeric>
                    <GameMatchup player={player} size="md" />
                    <span>{formatTipoff(player.tipoff)}</span>
                    <InjuryBadge injury={player.injury} />
                  </p>
                  }
                />
              );
            })}
          </div>

          {isPreview ? (
            <div className="predictions-locked" data-enter>
              <div className="predictions-locked-icon" aria-hidden="true"><LockIcon /></div>
              <h2 className="predictions-locked-title">
                {sessionExpired ? 'Your session expired. Sign in again to see every player' : 'Sign in to see every player'}
              </h2>
              <p className="predictions-locked-desc">
                You're viewing the top {PAGE_SIZE} projections. Create a free account to search, sort and page
                through every player on the slate, and to see the per-game picks.
              </p>
              <div className="predictions-locked-actions">
                <Link to="/login" state={{ from: '/predictions/games' }} className="empty-cta">Log In</Link>
                <Link to="/create-account" state={{ from: '/predictions/games' }} className="empty-cta prediction-auth-secondary">
                  Create Account
                </Link>
              </div>
            </div>
          ) : (
            <Pagination page={page} totalPages={data?.pagination?.total_pages || 1} totalItems={totalPlayers}
              pageSize={PAGE_SIZE} onPageChange={goToPage} />
          )}
        </>
      )}

      <PlayerStatsModal player={selectedPlayer} loading={loadingPlayer} onClose={() => setSelectedPlayer(null)} />
    </div>
  );
}
