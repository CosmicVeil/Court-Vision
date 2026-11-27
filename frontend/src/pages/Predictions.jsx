import ContentSkeleton from '../components/ContentSkeleton';
import FavouriteStar from '../components/FavouriteStar';
import LockIcon from '../components/LockIcon';
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import FilterBar from '../components/FilterBar';
import PageHero from '../components/PageHero';
import Pagination from '../components/Pagination';
import PlayerCard from '../components/PlayerCard';
import PlayerHeadshot from '../components/PlayerHeadshot';
import PredictionModeToggle from '../components/PredictionModeToggle';
import useFlip from '../hooks/useFlip';
import useListQuery from '../hooks/useListQuery';
import ScrollReveal from '../components/ScrollReveal';
import { PREDICTION_STATS } from '../config/predictionStats';
import { getFavorites, toggleFavorite } from '../utils/favorites';
import { authHeaders, clearAuth, isAuthenticated } from '../utils/auth';
import { buildApiUrl } from '../config/api';
import { scrollToIfAbove } from '../utils/scroll';
import { playerPath } from '../utils/playerPage';
import { getPredictionsHeroStats } from '../utils/pageHero';
import { getPredictionCardStats, getPredictionTableColumns, getPredictionTableRow } from '../utils/playerCard';
import { getSoFarStats } from '../utils/seasonSoFar';
// The table view reuses the Stats page table (.players-table, .view-btn, …); loaded first so
// Predictions.css still wins where the two share a class name.
import './Stats.css';
import './Predictions.css';

const toNumber = (value) => Number(value) || 0;

const toFavoritePlayer = (player) => ({
  id: player.id,
  name: player.name,
  team: player.team,
  position: player.position,
  age: toNumber(player.age),
  stats: {
    ppg_last: toNumber(player.ppg_last),
    apg_last: toNumber(player.apg_last),
    rpg_last: toNumber(player.rpg_last),
    spg_last: toNumber(player.spg_last),
    bpg_last: toNumber(player.bpg_last),
    tov_last: toNumber(player.tov_last),
    minutes: toNumber(player.mpg_last),
    fg_pct_last: toNumber(player.fg_pct_last),
    fg3_pct_last: toNumber(player.fg3_pct_last),
    ft_pct_last: toNumber(player.ft_pct_last),
  },
});

// Everything the URL may carry for this list, with its default (only non-defaults show up).
const LIST_DEFAULTS = { q: '', team: '', position: '', sort: 'predicted_ppg', order: 'desc', page: 1, view: 'cards' };
const LIST_ALLOWED = {
  sort: ['name', ...PREDICTION_STATS.map((stat) => stat.predictedField)],
  order: ['asc', 'desc'],
  view: ['cards', 'table'],
};
const PREDICTIONS_PAGE_SIZE = 12;

const DELTA_ARROWS = { up: '↑', down: '↓', flat: '→' };
const ARIA_SORT = { asc: 'ascending', desc: 'descending' };

// A stat header sorts by its column highest first (Player sorts A to Z); clicking the active
// column flips the order.
const nextSortQuery = (sortBy, sortOrder, field) => (
  sortBy === field
    ? { order: sortOrder === 'asc' ? 'desc' : 'asc', page: 1 }
    : { sort: field, order: field === 'name' ? 'asc' : 'desc', page: 1 }
);

// One row per player. The row opens the player page; the name is also a real link (for keyboards,
// crawlers and new tabs) that stops its click so the row doesn't navigate a second time, and the
// star stops its own click.
function PredictionsTable({ players, sortBy, sortOrder, loading, favoriteIds, onSort, onOpen, onToggleFavorite }) {
  const columns = getPredictionTableColumns(sortBy);
  const sortHeader = (field, label) => (
    <th aria-sort={sortBy === field ? ARIA_SORT[sortOrder] : undefined} key={field} className="sortable">
      <button type="button" className="table-sort-btn" onClick={() => onSort(field)}>
        {label}
        {sortBy === field && <span aria-hidden="true"> {sortOrder === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
  return (
    <div className="table-container" data-results aria-busy={loading}>
      <div className="table-wrapper">
        <table className="players-table">
          <thead>
            <tr>
              {sortHeader('name', 'Player')}
              <th>Team</th>
              <th>Position</th>
              <th>Age</th>
              {columns.map((column) => sortHeader(column.field, column.label))}
              <th className="favorite-header">Favorite</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, idx) => {
              const isFavorite = favoriteIds.has(player.id);
              return (
                <tr key={player.id || idx} className="stats-row-clickable" onClick={() => onOpen(player)}>
                  <td className="player-name-cell">
                    <span className="player-name-with-photo">
                      <PlayerHeadshot playerId={player.id} name={player.name} className="player-row-photo" />
                      <strong><Link to={playerPath(player)} state={{ player }} className="table-row-open"
                        onClick={(event) => event.stopPropagation()}>{player.name}</Link></strong>
                    </span>
                  </td>
                  <td><span className="team-badge-table">{player.team}</span></td>
                  <td><span className="position-badge-table">{player.position}</span></td>
                  <td>{player.age}</td>
                  {getPredictionTableRow(player, columns).map((stat) => (
                    <td key={stat.key} className="stat-cell" data-numeric>
                      {stat.value}
                      {stat.delta && (
                        <span className="pc-delta" data-direction={stat.delta.direction}>
                          <span aria-hidden="true">{DELTA_ARROWS[stat.delta.direction]}</span> {stat.delta.text}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="favorite-cell">
                    <button
                      type="button"
                      className={`favorite-btn ${isFavorite ? 'favorited' : ''}`}
                      onClick={(event) => { event.stopPropagation(); onToggleFavorite(event, player); }}
                      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      aria-label={isFavorite ? `Remove ${player.name} from favorites` : `Add ${player.name} to favorites`}
                      aria-pressed={isFavorite}
                    >
                      <FavouriteStar selected={isFavorite} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Predictions = () => {
  const [query, updateQuery] = useListQuery(LIST_DEFAULTS, LIST_ALLOWED);
  const { q: searchTerm, team: selectedTeam, position: selectedPosition,
    sort: sortBy, order: sortOrder, page: currentPage, view: viewMode } = query;
  // The search box keeps its own draft so typing never waits on a router update.
  const [searchDraft, setSearchDraft] = useState(searchTerm);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teams, setTeams] = useState([]);
  const [positions, setPositions] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [showAuthModal, setShowAuthModal] = useState(false);
  // True when the server returned only the signed-out preview slice.
  const [isPreview, setIsPreview] = useState(!isAuthenticated());
  const [sessionExpired, setSessionExpired] = useState(false);
  const gridRef = useRef(null);
  const resultsRef = useRef(null);
  const navigate = useNavigate();
  useFlip(gridRef);

  const goToPage = (page) => {
    updateQuery({ page });
    scrollToIfAbove(resultsRef.current);
  };

  useEffect(() => {
    setFavoriteIds(new Set(getFavorites().map((favorite) => favorite.id)));
  }, []);

  const handleFavoriteToggle = (event, player) => {
    event.stopPropagation();

    if (!isAuthenticated()) {
      setShowAuthModal(true);
      return;
    }

    const isNowFavorite = toggleFavorite(toFavoritePlayer(player));
    setFavoriteIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (isNowFavorite) {
        nextIds.add(player.id);
      } else {
        nextIds.delete(player.id);
      }
      return nextIds;
    });
  };

  const handlePlayerClick = (player) => {
    navigate(playerPath(player), { state: { player } });
  };



  useEffect(() => {
    fetchTeams();
    fetchPositions();
  }, []);

  // Each change aborts the previous request, so a slow older response can never overwrite a
  // newer one (last request wins).
  useEffect(() => {
    const controller = new AbortController();
    fetchPredictions(controller.signal);
    return () => controller.abort();
  }, [currentPage, searchTerm, selectedTeam, selectedPosition, sortBy, sortOrder]);

  const fetchPredictions = async (signal) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: String(PREDICTIONS_PAGE_SIZE),
        sort_by: sortBy,
        sort_order: sortOrder,
      });

      if (searchTerm) params.append('search', searchTerm);
      if (selectedTeam) params.append('team', selectedTeam);
      if (selectedPosition) params.append('position', selectedPosition);

      const response = await fetch(buildApiUrl(`predictions?${params}`), {
        signal,
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error('Failed to fetch predictions');

      const data = await response.json();
      if (signal.aborted) return;
      setPredictions(data.predictions || []);
      setIsPreview(Boolean(data.preview));
      if (data.preview && isAuthenticated()) {
        // A stored token that the server rejected has expired: drop it and ask to sign in again.
        clearAuth();
        setSessionExpired(true);
      }
      setTotalPages(data.pagination?.total_pages || 1);
      setTotalPlayers(data.pagination?.total || 0);
    } catch (err) {
      if (signal.aborted) return;
      setError(err.message);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  };

  const fetchTeams = async () => {
    try {
      const response = await fetch(buildApiUrl('teams'));
      if (response.ok) {
        const data = await response.json();
        setTeams(data.teams || []);
      }
    } catch (err) {
      console.error('Failed to fetch teams:', err);
    }
  };

  const fetchPositions = async () => {
    try {
      const response = await fetch(buildApiUrl('positions'));
      if (response.ok) {
        const data = await response.json();
        setPositions(data.positions || []);
      }
    } catch (err) {
      console.error('Failed to fetch positions:', err);
    }
  };

  const handleSearch = (e) => {
    setSearchDraft(e.target.value);
    updateQuery({ q: e.target.value, page: 1 });
  };

  const handleTeamFilter = (e) => {
    updateQuery({ team: e.target.value, page: 1 });
  };

  const handlePositionFilter = (e) => {
    updateQuery({ position: e.target.value, page: 1 });
  };

  const handleSortFieldChange = (event) => {
    const nextSortBy = event.target.value;
    updateQuery({ sort: nextSortBy, order: nextSortBy === 'name' ? 'asc' : 'desc', page: 1 });
    scrollToIfAbove(resultsRef.current);
  };

  const handleSortDirectionChange = () => {
    updateQuery({ order: sortOrder === 'asc' ? 'desc' : 'asc', page: 1 });
    scrollToIfAbove(resultsRef.current);
  };

  const handleColumnSort = (field) => {
    updateQuery(nextSortQuery(sortBy, sortOrder, field));
    scrollToIfAbove(resultsRef.current);
  };

  const isNameSort = sortBy === 'name';
  const sortDirectionLabel = sortOrder === 'asc'
    ? (isNameSort ? 'A to Z' : 'Lowest to Highest')
    : (isNameSort ? 'Z to A' : 'Highest to Lowest');

  const clearFilters = () => {
    setSearchDraft('');
    updateQuery({ q: '', team: '', position: '', page: 1 });
  };

  return (
    <div className="predictions-container">
      {/* New cards arrive with each fetch, so the reveal rescans when the list changes (cards only). */}
      <ScrollReveal scanKey={viewMode === 'cards' ? predictions : null} />
      <PredictionModeToggle base="/predictions" value="season" />
      <PageHero
        eyebrow="OUR MODEL"
        title="Season"
        accent="Predictions"
        lead="Our model uses past seasons' stats to predict each player's per-game averages for this season."
        stats={getPredictionsHeroStats({
          ready: !error && (!loading || predictions.length > 0),
          total: totalPlayers, sort: sortBy, order: sortOrder, page: currentPage, totalPages,
        })}
      />

      <FilterBar
        search={{ value: searchDraft, onChange: handleSearch }}
        filters={[
          { key: 'team', label: 'Team', allLabel: 'All Teams', value: selectedTeam, onChange: handleTeamFilter, options: teams },
          { key: 'position', label: 'Position', allLabel: 'All Positions', value: selectedPosition, onChange: handlePositionFilter, options: positions },
        ]}
        onClear={clearFilters}
      />

      <div className="sorting-section" ref={resultsRef}>
        <div className="view-mode-toggle">
          <button
            type="button"
            className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
            aria-pressed={viewMode === 'table'}
            onClick={() => updateQuery({ view: 'table' })}
          >
            Table View
          </button>
          <button
            type="button"
            className={`view-btn ${viewMode === 'cards' ? 'active' : ''}`}
            aria-pressed={viewMode === 'cards'}
            onClick={() => updateQuery({ view: 'cards' })}
          >
            Card View
          </button>
        </div>
        <div className="sort-control-group">
          <label className="sort-label" htmlFor="prediction-sort-field">Sort by</label>
          <select
            id="prediction-sort-field"
            className="prediction-sort-select"
            value={sortBy}
            onChange={handleSortFieldChange}
          >
            <option value="name">Name</option>
            {PREDICTION_STATS.map((stat) => (
              <option value={stat.predictedField} key={stat.key}>Predicted {stat.unit}</option>
            ))}
          </select>
          <button
            type="button"
            className="sort-direction-btn"
            onClick={handleSortDirectionChange}
            aria-label={`Change sort direction. Current order: ${sortDirectionLabel}`}
          >
            <span className="sort-direction-icon" aria-hidden="true">{sortOrder === 'asc' ? '↑' : '↓'}</span>
            <span>{sortDirectionLabel}</span>
          </button>
        </div>
        {/* Announces reloads to screen readers too; the dimmed results alone are visual only. */}
        <span data-slot="results-status" role="status" data-numeric>
          {loading ? 'Updating…' : `${totalPlayers} players`}
        </span>
      </div>

      {loading && predictions.length === 0 ? (
        <ContentSkeleton variant={viewMode === 'table' ? 'table' : 'cards'} count={viewMode === 'table' ? 12 : 6} label="Loading season projections…" />
      ) : error ? (
        (() => {
          const serverUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : 'https://court-vision-zxuj.onrender.com');
          return (
            <div className="error">
              Error: {error}
              <br />
              Make sure the Flask API server is running on {serverUrl}
            </div>
          );
        })()
      ) : predictions.length === 0 ? (
        <div className="no-results">No player predictions matched your search criteria.</div>
      ) : (
        <>
          {viewMode === 'table' ? (
            <PredictionsTable
              players={predictions}
              sortBy={sortBy}
              sortOrder={sortOrder}
              loading={loading}
              favoriteIds={favoriteIds}
              onSort={handleColumnSort}
              onOpen={handlePlayerClick}
              onToggleFavorite={handleFavoriteToggle}
            />
          ) : (
          <div className="pc-grid" ref={gridRef} data-results aria-busy={loading}>
            {predictions.map((player, idx) => {
              const { main, extra } = getPredictionCardStats(player);
              const soFar = getSoFarStats(player);
              return (
                <PlayerCard
                  key={player.id || idx}
                  index={idx}
                  player={player}
                  stats={main}
                  statsLabel="Predicted · change vs this season"
                  extraStats={extra}
                  extraLabel="This Season Shooting"
                  isFavorite={favoriteIds.has(player.id)}
                  onToggleFavorite={(event) => handleFavoriteToggle(event, player)}
                  to={playerPath(player)}
                  linkState={{ player }}
                  ctaLabel="Full projection"
                >
                  <div className="pc-extra">
                    <p className="pc-section-label">{soFar.label}</p>
                    <dl className="pc-stat-list">
                      {soFar.stats.map(stat => (
                        <div key={stat.key} className="pc-stat">
                          <dt>{stat.label}</dt>
                          <dd className="pc-stat-value" data-numeric>{stat.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </PlayerCard>
              );
            })}
          </div>
          )}

          {isPreview ? (
            <div className="predictions-locked" data-enter>
              <div className="predictions-locked-icon" aria-hidden="true"><LockIcon /></div>
              <h2 className="predictions-locked-title">
                {sessionExpired ? 'Your session expired. Sign in again to see full predictions' : 'Sign in to see full predictions'}
              </h2>
              <p className="predictions-locked-desc">
                You're viewing a free preview of the top {PREDICTIONS_PAGE_SIZE} players.
                Create a free account to unlock the full searchable, sortable predictions
                list, per-player projections and breakout recommendations.
              </p>
              <div className="predictions-locked-actions">
                <Link to="/login" state={{ from: '/predictions' }} className="empty-cta">Log In</Link>
                <Link to="/create-account" state={{ from: '/predictions' }} className="empty-cta prediction-auth-secondary">
                  Create Account
                </Link>
              </div>
            </div>
          ) : (
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              totalItems={totalPlayers}
              pageSize={PREDICTIONS_PAGE_SIZE}
              onPageChange={goToPage}
            />
          )}
        </>
      )}

      {showAuthModal && (
        <div className="stats-modal-backdrop" onClick={() => setShowAuthModal(false)}>
          <div
            className="stats-modal-container"
            onClick={(event) => event.stopPropagation()}
            style={{ maxWidth: '450px', textAlign: 'center', padding: '3rem 2rem' }}
          >
            <button
              type="button"
              className="stats-modal-close-btn"
              onClick={() => setShowAuthModal(false)}
              aria-label="Close authentication prompt"
            >
              ×
            </button>
            <div className="prediction-auth-icon" aria-hidden="true"><LockIcon /></div>
            <h2 className="empty-title">Authentication Required</h2>
            <p className="empty-description">
              You must create an account or log in to save your favorite NBA players and customize your analytics tracking!
            </p>
            <div className="prediction-auth-actions">
              <Link to="/login" state={{ from: '/predictions' }} className="empty-cta">Log In</Link>
              <Link to="/create-account" state={{ from: '/predictions' }} className="empty-cta prediction-auth-secondary">Create Account</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Predictions;
