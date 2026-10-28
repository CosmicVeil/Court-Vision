import assert from "node:assert/strict";
import test from "node:test";
import { readSource as readComponent } from "./helpers.mjs";

test("AI prediction cards show all current-season shooting percentages", () => {
  const source = readComponent("Predictions.jsx");
  // Which fields and how they format is covered by getPredictionCardStats in player-card.test.mjs.
  assert.match(source, /extraStats=\{extra\}/);
  assert.match(source, /extraLabel="This Season Shooting"/);
});

test("AI prediction favourites are authenticated, isolated from card clicks, and stateful", () => {
  const source = readComponent("Predictions.jsx");

  assert.match(source, /import \{ getFavorites, toggleFavorite \} from '\.\.\/utils\/favorites'/);
  assert.match(source, /import \{ isAuthenticated \} from '\.\.\/utils\/auth'/);
  assert.match(source, /const \[favoriteIds, setFavoriteIds\] = useState\(new Set\(\)\)/);
  assert.match(source, /event\.stopPropagation\(\)/);
  assert.match(source, /if \(!isAuthenticated\(\)\) \{[\s\S]*setShowAuthModal\(true\)/);
  assert.match(source, /toggleFavorite\(toFavoritePlayer\(player\)\)/);
  assert.match(source, /isFavorite=\{favoriteIds\.has\(player\.id\)\}/);
  const card = readComponent("PlayerCard.jsx");
  assert.match(card, /aria-pressed=\{isFavorite\}/);
  assert.match(card, /'FAVORITED' : 'ADD FAV'/);
  assert.match(source, /showAuthModal &&/);
  assert.match(source, /to="\/login"/);
  assert.match(source, /to="\/create-account"/);
});

test("prediction favourites are normalized for the Favourites page", () => {
  const source = readComponent("Predictions.jsx");
  const normalizer = source.match(/const toFavoritePlayer = \(player\) => \(\{[\s\S]*?\n\}\);/)?.[0] || "";

  for (const field of [
    "ppg_last",
    "apg_last",
    "rpg_last",
    "spg_last",
    "bpg_last",
    "tov_last",
    "fg_pct_last",
    "fg3_pct_last",
    "ft_pct_last",
  ]) {
    assert.match(normalizer, new RegExp(`${field}: toNumber\\(player\\.${field}\\)`));
  }
  assert.match(normalizer, /stats: \{/);
  assert.match(normalizer, /minutes: toNumber\(player\.mpg_last\)/);
});

test("Favourites empty state names both places where players can be saved", () => {
  const source = readComponent("Favourites.jsx");
  assert.match(source, /Stats or AI Predictions/);
});

test("player card favourite controls are styled, stateful and focusable", () => {
  const css = readComponent("PlayerCard.css");

  assert.match(css, /\.pc-fav\s*\{[^}]*z-index:\s*2/s, "sits above the stretched open button");
  assert.match(css, /\.pc-fav\.is-on\s*\{/);
  assert.match(css, /\.pc-fav:focus-visible\s*\{/);
  assert.match(css, /\.pc-stat-list\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.pc-card\s*\{[^}]*padding/s);
});
