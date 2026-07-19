import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readComponent = (filename) => readFileSync(
  new URL(`../src/components/${filename}`, import.meta.url),
  "utf8",
);

test("AI prediction cards show all current-season shooting percentages", () => {
  const source = readComponent("Predictions.jsx");

  for (const [field, label] of [
    ["fg_pct_last", "FG%"],
    ["fg3_pct_last", "3P%"],
    ["ft_pct_last", "FT%"],
  ]) {
    assert.match(source, new RegExp(`key: ['"]${field}['"], label: ['"]${label}`));
  }
  assert.match(source, /This Season Shooting/);
  assert.match(source, /Number\(player\[stat\.key\]\) \|\| 0\)\.toFixed\(1\)/);
  assert.match(source, /prediction-shooting-value[\s\S]*%/);
});

test("AI prediction favourites are authenticated, isolated from card clicks, and stateful", () => {
  const source = readComponent("Predictions.jsx");

  assert.match(source, /import \{ getFavorites, toggleFavorite \} from '\.\.\/utils\/favorites'/);
  assert.match(source, /import \{ isAuthenticated \} from '\.\.\/utils\/auth'/);
  assert.match(source, /const \[favoriteIds, setFavoriteIds\] = useState\(new Set\(\)\)/);
  assert.match(source, /event\.stopPropagation\(\)/);
  assert.match(source, /if \(!isAuthenticated\(\)\) \{[\s\S]*setShowAuthModal\(true\)/);
  assert.match(source, /toggleFavorite\(toFavoritePlayer\(player\)\)/);
  assert.match(source, /aria-pressed=\{favoriteIds\.has\(player\.id\)\}/);
  assert.match(source, /'FAVORITED' : 'ADD FAV'/);
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
