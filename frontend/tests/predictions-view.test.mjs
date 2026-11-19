import assert from 'node:assert/strict';
import test from 'node:test';
import { Children, isValidElement } from 'react';
import { readSource } from './helpers.mjs';
import { loadFrontendModule, renderComponent } from './render-helpers.mjs';

const { readListQuery, writeListQuery } = await import('../src/utils/listQuery.js');
const { LIST_DEFAULTS, LIST_ALLOWED, PredictionsTable, nextSortQuery } = loadFrontendModule(
  'src/pages/Predictions.jsx', ['LIST_DEFAULTS', 'LIST_ALLOWED', 'PredictionsTable', 'nextSortQuery']);

const page = readSource('Predictions.jsx');

test('Predictions opens in card view, so existing links keep showing cards', () => {
  assert.equal(readListQuery('', LIST_DEFAULTS, LIST_ALLOWED).view, 'cards');
  assert.equal(readListQuery('?sort=predicted_apg&page=2', LIST_DEFAULTS, LIST_ALLOWED).view, 'cards');
});

test('?view=table opens the table, and unknown views fall back to cards', () => {
  assert.equal(readListQuery('?view=table', LIST_DEFAULTS, LIST_ALLOWED).view, 'table');
  assert.equal(readListQuery('?view=cards', LIST_DEFAULTS, LIST_ALLOWED).view, 'cards');
  for (const view of ['grid', 'TABLE', '']) {
    assert.equal(readListQuery(`?view=${view}`, LIST_DEFAULTS, LIST_ALLOWED).view, 'cards', `view=${view}`);
  }
});

test('only the table view shows up in the URL', () => {
  const state = readListQuery('', LIST_DEFAULTS, LIST_ALLOWED);
  assert.equal(writeListQuery(state, LIST_DEFAULTS), '');
  assert.equal(writeListQuery({ ...state, view: 'table' }, LIST_DEFAULTS), 'view=table');
  assert.equal(writeListQuery({ ...state, view: 'table', page: 3 }, LIST_DEFAULTS), 'page=3&view=table');
});

test('clicking a stat header sorts by it highest first, and clicking it again flips the order', () => {
  assert.equal(typeof nextSortQuery, 'function');
  assert.deepEqual(nextSortQuery('predicted_ppg', 'desc', 'predicted_apg'), { sort: 'predicted_apg', order: 'desc', page: 1 });
  assert.deepEqual(nextSortQuery('name', 'asc', 'predicted_bpg'), { sort: 'predicted_bpg', order: 'desc', page: 1 });
  assert.deepEqual(nextSortQuery('predicted_ppg', 'desc', 'predicted_ppg'), { order: 'asc', page: 1 });
  assert.deepEqual(nextSortQuery('predicted_ppg', 'asc', 'predicted_ppg'), { order: 'desc', page: 1 });
});

test('clicking the Player header sorts by name A to Z, and again Z to A', () => {
  assert.deepEqual(nextSortQuery('predicted_ppg', 'desc', 'name'), { sort: 'name', order: 'asc', page: 1 });
  assert.deepEqual(nextSortQuery('name', 'asc', 'name'), { order: 'desc', page: 1 });
});

const players = [
  {
    id: 1629029, name: 'Luka Dončić', team: 'LAL', position: 'PG', age: 26,
    predicted_ppg: 31.2, so_far_ppg: 29.4, predicted_apg: 8.1, so_far_apg: 8.9, predicted_rpg: 8.5, so_far_rpg: 8.48,
    predicted_spg: 1.4, so_far_spg: 1.1, predicted_bpg: 0.5, so_far_bpg: 0.4, predicted_fantasy: 52.6, so_far_fantasy: 50.1,
  },
  { id: 1641705, name: 'Victor Wembanyama', team: 'SAS', position: 'C', age: 21, predicted_ppg: 25, predicted_bpg: 3.6 },
];

const renderTable = props => renderComponent(PredictionsTable, {
  players, sortBy: 'predicted_ppg', sortOrder: 'desc', loading: false,
  favoriteIds: new Set([1641705]), onSort: () => {}, onOpen: () => {}, onToggleFavorite: () => {},
  ...props,
});

test('the table shows one clickable row per player with who they are', () => {
  const html = renderTable();
  assert.equal(html.match(/<tr class="stats-row-clickable"/g)?.length, 2);
  assert.match(html, /<table class="players-table">/);
  assert.match(html, /<div class="table-wrapper">/);
  assert.match(html, /<a class="table-row-open" href="\/players\/1629029"[^>]*>Luka Dončić<\/a>/);
  assert.match(html, /<span class="team-badge-table">LAL<\/span>/);
  assert.match(html, /<span class="position-badge-table">C<\/span>/);
  assert.match(html, /<td>26<\/td>/);
});

test('each predicted stat cell shows the value and its change vs this season so far', () => {
  const html = renderTable();
  const luka = html.slice(html.indexOf('Luka Dončić'), html.indexOf('Victor Wembanyama'));
  const cells = [...luka.matchAll(/<td class="stat-cell"[^>]*>(.*?)<\/td>/g)].map(match => match[1]);
  assert.equal(cells.length, 6);
  assert.match(cells[0], /^31\.2<span class="pc-delta" data-direction="up"[^>]*><span aria-hidden="true">↑<\/span> \+1\.8<\/span>$/);
  assert.match(cells[1], /^8\.1<span class="pc-delta" data-direction="down"[^>]*>.*−0\.8<\/span>$/);
  assert.match(cells[2], /data-direction="flat"/);
  assert.match(cells[5], /^52\.6<span class="pc-delta" data-direction="up"[^>]*>.*\+2\.5<\/span>$/);

  const wemby = html.slice(html.indexOf('Victor Wembanyama'));
  assert.doesNotMatch(wemby, /pc-delta/, 'no games this season means no change to show');
  assert.match(wemby, /<td class="stat-cell"[^>]*>3\.6<\/td>/);
});

const sortLabels = html => [...html.matchAll(/<button type="button" class="table-sort-btn">(.*?)<\/button>/g)]
  .map(match => match[1].replace(/<[^>]+>.*?<\/[^>]+>/g, '').trim());

test('the Player and stat headers are sort buttons, and only the active one carries aria-sort', () => {
  const html = renderTable({ sortBy: 'predicted_rpg', sortOrder: 'asc' });
  assert.deepEqual(sortLabels(html), ['Player', 'PPG', 'APG', 'RPG', 'SPG', 'BPG', 'FPTS']);
  assert.equal(html.match(/aria-sort=/g)?.length, 1);
  assert.match(html, /<th aria-sort="ascending"[^>]*><button type="button" class="table-sort-btn">RPG/);
  const byName = renderTable({ sortBy: 'name', sortOrder: 'asc' });
  assert.equal(byName.match(/aria-sort=/g)?.length, 1);
  assert.match(byName, /<th aria-sort="ascending"[^>]*><button type="button" class="table-sort-btn">Player/);
});

test('sorting by a stat the table does not show adds that column, marked as the sort', () => {
  const html = renderTable({
    sortBy: 'predicted_ft_pct', sortOrder: 'desc',
    players: [{ id: 1, name: 'Shooter', predicted_ft_pct: 91.24, so_far_ft_pct: 88 }],
  });
  assert.deepEqual(sortLabels(html), ['Player', 'PPG', 'APG', 'RPG', 'SPG', 'BPG', 'FPTS', 'FT%']);
  assert.match(html, /<th aria-sort="descending"[^>]*><button type="button" class="table-sort-btn">FT%/);
  const cells = [...html.matchAll(/<td class="stat-cell"[^>]*>(.*?)<\/td>/g)].map(match => match[1]);
  assert.equal(cells.length, 7, 'every row gets the extra cell');
  assert.match(cells[6], /^91\.2%<span class="pc-delta" data-direction="up"[^>]*>.*\+3\.2<\/span>$/);
  assert.deepEqual(sortLabels(renderTable({ sortBy: 'predicted_bpg' })).length, 7, 'shown stats add nothing');
});

test('the favourite star reflects saved players and is labelled for each player', () => {
  const html = renderTable();
  assert.match(html, /aria-label="Add Luka Dončić to favorites" aria-pressed="false"/);
  assert.match(html, /aria-label="Remove Victor Wembanyama from favorites" aria-pressed="true"/);
});

// PredictionsTable has no hooks, so its real element tree can be walked and clicked without a DOM.
// A click runs the target's onClick and then each ancestor's, like React's bubbling, until a
// handler calls stopPropagation.
function findAll(node, match, ancestors = [], found = []) {
  if (!isValidElement(node)) return found;
  const path = [...ancestors, node];
  if (match(node)) found.push(path);
  Children.forEach(node.props.children, child => findAll(child, match, path, found));
  return found;
}

function click(path) {
  const event = { stopped: false, stopPropagation() { this.stopped = true; } };
  for (const element of [...path].reverse()) {
    element.props.onClick?.(event);
    if (event.stopped) break;
  }
  return event;
}

function interactiveTable(props = {}) {
  const calls = { sort: [], open: [], favorite: [] };
  const tree = PredictionsTable({
    players, sortBy: 'predicted_ppg', sortOrder: 'desc', loading: false, favoriteIds: new Set(),
    onSort: field => calls.sort.push(field),
    onOpen: player => calls.open.push(player.id),
    // Deliberately does not stop propagation: the table itself must keep the row from opening.
    onToggleFavorite: (event, player) => calls.favorite.push(player.id),
    ...props,
  });
  const byClass = className => findAll(tree, node => node.props.className === className);
  return { calls, byClass };
}

test('clicking a stat header asks to sort by that column', () => {
  const { calls, byClass } = interactiveTable();
  const headers = byClass('table-sort-btn');
  assert.equal(headers.length, 7);
  click(headers[0]);
  click(headers[2]);
  click(headers[6]);
  assert.deepEqual(calls.sort, ['name', 'predicted_apg', 'predicted_fantasy']);
  assert.deepEqual(calls.open, [], 'sorting opens no player');
});

// The name is a link that navigates by itself, so the row must not open the player a second time.
test('clicking a row opens that player; its name link navigates on its own', () => {
  const { calls, byClass } = interactiveTable();
  const rows = byClass('stats-row-clickable');
  click(rows[1]);
  const event = click(byClass('table-row-open')[0]);
  assert.equal(event.stopped, true);
  assert.equal(byClass('table-row-open')[0].at(-1).props.to, '/players/1629029');
  assert.deepEqual(calls.open, [1641705]);
  assert.deepEqual(calls.favorite, []);
});

test('the favourite star toggles that player without opening the player page', () => {
  const { calls, byClass } = interactiveTable();
  const stars = byClass('favorite-btn ');
  assert.equal(stars.length, 2);
  const event = click(stars[1]);
  assert.deepEqual(calls.favorite, [1641705]);
  assert.deepEqual(calls.open, [], 'the row behind the star must not navigate');
  assert.equal(event.stopped, true);
});

test('the page sends header sorts through nextSortQuery into the URL', () => {
  assert.match(page, /updateQuery\(nextSortQuery\(sortBy, sortOrder, field\)\);/);
  assert.match(page, /onSort=\{handleColumnSort\}\s*onOpen=\{handlePlayerClick\}\s*onToggleFavorite=\{handleFavoriteToggle\}/);
});

test('the page wires the toggle, the table styles and both views into the shared states', () => {
  assert.match(page, /import '\.\/Stats\.css';\s*import '\.\/Predictions\.css';/, 'Stats.css first, so Predictions.css still wins');
  assert.match(page, /<div className="view-mode-toggle"/);
  assert.match(page, /onClick=\{\(\) => updateQuery\(\{ view: 'table' \}\)\}/);
  assert.match(page, /onClick=\{\(\) => updateQuery\(\{ view: 'cards' \}\)\}/);
  assert.match(page, /<ContentSkeleton variant=\{viewMode === 'table' \? 'table' : 'cards'\}/);
  assert.match(page, /viewMode === 'table' \? \(\s*<PredictionsTable/);
  // The lock and the pager follow whichever view rendered, so both views keep them.
  assert.match(page, /<\/div>\s*\)\}\s*\{isPreview \? \(/);
  assert.match(page, /<ScrollReveal scanKey=\{viewMode === 'cards' \? predictions : null\} \/>/);
});

test('the whole sortable header cell sorts, plain headers do not look clickable, and the table scrolls', () => {
  const css = readSource('Predictions.css');
  assert.match(css, /\.predictions-container \.players-table th\.sortable \{\s*padding: 0;/);
  assert.match(css, /\.table-sort-btn \{\s*display: block;\s*width: 100%;/);
  assert.match(css, /\.predictions-container \.players-table th:not\(\.sortable\) \{\s*cursor: default;/);
  // The scroll fix lives in the shared Stats.css rule, so the Stats table gets it too.
  assert.doesNotMatch(css, /\.table-wrapper/);
  const stats = readSource('Stats.css');
  const wrapper = stats.slice(stats.indexOf('.table-wrapper {'), stats.indexOf('}', stats.indexOf('.table-wrapper {')));
  assert.match(wrapper, /overflow-x: auto;/);
  assert.doesNotMatch(wrapper, /overflow: hidden/);
});
