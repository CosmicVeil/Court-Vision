// Player faces (#134): the shared PlayerCard and the player rows reuse PlayerHeadshot, which
// already falls back to a silhouette for made-up IDs (>= 900,000,000) and missing photos.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFrontend, readSource } from './helpers.mjs';
import { loadFrontendModule, renderComponent } from './render-helpers.mjs';

const { default: PlayerCard } = loadFrontendModule('src/components/PlayerCard.jsx');
const { PredictionsTable } = loadFrontendModule('src/pages/Predictions.jsx', ['PredictionsTable']);

const SMALL_PHOTO = id => new RegExp(`<img[^>]*src="https://cdn\\.nba\\.com/headshots/nba/latest/260x190/${id}\\.png"[^>]*alt=""`);
const SILHOUETTE = /<svg[^>]*class="player-headshot-fallback"/;

const renderCard = props => renderComponent(PlayerCard, { onOpen: () => {}, ...props });

test('a player card shows the NBA headshot for its player, beside the name', () => {
  const html = renderCard({ player: { id: 2544, name: 'LeBron James', team: 'LAL' } });
  assert.match(html, /<span class="player-headshot pc-photo">/);
  assert.match(html, SMALL_PHOTO(2544));
  assert.doesNotMatch(html, SILHOUETTE);
  // The photo sits with the name in one block, so the header layouts keep their columns.
  assert.match(html, /<div class="pc-who"><span class="player-headshot pc-photo">.*<div class="pc-identity"><h3 class="pc-name">/);
});

test('a player with a made-up fallback ID gets the silhouette, not a broken image', () => {
  const html = renderCard({ player: { id: 900_000_123, name: 'Unmatched Rookie' } });
  assert.match(html, /<span class="player-headshot pc-photo">/);
  assert.match(html, SILHOUETTE);
  assert.match(html, /aria-label="No photo of Unmatched Rookie"/);
  assert.doesNotMatch(html, /<img\b/);
});

test('headshotId overrides player.id, and null means the silhouette', () => {
  // Game prediction rows fall back to the ESPN ID for player.id; that must never reach NBA's CDN.
  const espnOnly = renderCard({ player: { id: 4433134, name: 'ESPN Only' }, headshotId: null });
  assert.match(espnOnly, SILHOUETTE);
  assert.doesNotMatch(espnOnly, /4433134\.png/);

  const both = renderCard({ player: { id: 4433134, name: 'Both IDs' }, headshotId: 1641706 });
  assert.match(both, SMALL_PHOTO(1641706));
});

test('a card with no ID at all has no photo slot rather than a silhouette', () => {
  const html = renderCard({ player: { name: 'Name Only', team: 'BOS' } });
  assert.doesNotMatch(html, /player-headshot/);
  assert.match(html, /<div class="pc-who"><div class="pc-identity">/);
});

test('the predictions table shows a small photo before each name, silhouette for fallback IDs', () => {
  const html = renderComponent(PredictionsTable, {
    players: [
      { id: 1629029, name: 'Luka Dončić', team: 'LAL', position: 'PG', age: 26 },
      { id: 900_000_001, name: 'No Photo', team: 'SAS', position: 'C', age: 21 },
    ],
    sortBy: 'predicted_ppg', sortOrder: 'desc', loading: false,
    favoriteIds: new Set(), onSort: () => {}, onOpen: () => {}, onToggleFavorite: () => {},
  });
  assert.equal(html.match(/<span class="player-headshot player-row-photo">/g)?.length, 2);
  assert.match(html, /<td class="player-name-cell"><span class="player-name-with-photo"><span class="player-headshot player-row-photo"><img[^>]*1629029\.png/);
  assert.match(html, /aria-label="No photo of No Photo"/);
});

test('the Stats table and the game pick rows reuse the same row photo', () => {
  assert.match(readSource('Stats.jsx'),
    /<span className="player-name-with-photo">\s*<PlayerHeadshot playerId=\{player\.id\} name=\{player\.name\} className="player-row-photo" \/>/);
  // Pick rows carry espn_id too; only the NBA.com id may be used for the photo.
  assert.match(readSource('GameRecommendations.jsx'),
    /<PlayerHeadshot playerId=\{player\.id \?\? null\} name=\{player\.name\} className="player-row-photo" \/>/);
  assert.match(readFrontend('src/pages/GameRecommendations.css'), /grid-template-columns: 24px auto minmax\(0, 1fr\) auto;/);
});

test('game prediction cards pass the NBA.com id for the photo, never the ESPN fallback', () => {
  for (const file of ['GamePredictions.jsx', 'NextGamePreview.jsx']) {
    assert.match(readSource(file), /headshotId=\{player\.id \?\? null\}/, file);
  }
});

test('card photos are a fixed square, smaller on narrow screens, and never shrink', () => {
  const css = readFrontend('src/components/PlayerCard.css');
  assert.match(css, /\.pc-photo \{ --headshot-size: 52px; \}/);
  assert.match(css, /@media \(max-width: 560px\) \{\s*\.pc-photo \{ --headshot-size: 44px; \}/);
  const headshot = readFrontend('src/components/PlayerHeadshot.css');
  // object-fit: cover crops the 4:3 photo into the circle without stretching it.
  assert.match(headshot, /object-fit: cover;/);
  assert.match(headshot, /flex-shrink: 0;/);
});

test('recommendation cards show the NBA.com PLAYER_ID the API now adds to each row', () => {
  // Top-20 page: every row comes from the API, so every card has a photo slot.
  assert.match(readSource('RecommendationChart.jsx'),
    /<div className="rec-who">\s*<PlayerHeadshot playerId=\{player\.PLAYER_ID\} name=\{player\.PLAYER_NAME\} className="rec-photo" \/>\s*<h3 className="insight-title">/);
  // Spotlight: the built-in fallback players carry no ID, so they get no slot.
  assert.match(readSource('Recommendations.jsx'),
    /\{player\.PLAYER_ID !== undefined && \(\s*<PlayerHeadshot playerId=\{player\.PLAYER_ID\} name=\{player\.PLAYER_NAME\} className="rec-photo" \/>/);
  const css = readFrontend('src/pages/Recommendations.css');
  assert.match(css, /\.rec-photo \{ --headshot-size: 52px; \}/);
  assert.match(css, /@media \(max-width: 560px\) \{\s*\.rec-photo \{ --headshot-size: 44px; \}/);
});

test('home AI cards hand PlayerCard the PLAYER_ID, so they show faces too', () => {
  assert.match(readSource('AIPredictions.jsx'), /const toCardPlayer = \(player\) => \(\{[^}]*id: player\.PLAYER_ID,/);
});
