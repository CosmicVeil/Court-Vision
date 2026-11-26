// Build-time prerender for crawlers (issue #152). Runs after `vite build` (see package.json).
//
// The app renders in the browser, so dist/index.html ships an empty #root and every URL gets the
// home page's <title>. This script writes one HTML file per key route with that route's head tags
// and a plain-HTML summary of the projections inside #root. There is no hydration: the pages fetch
// in useEffect and signed-in users get different data, so main.jsx's createRoot().render() simply
// replaces the summary when the app loads.
//
// The HTML is public, so it shows only what a SIGNED-OUT visitor already gets from the API (same
// rows, same order, default FanDuel scoring). Each builder says which backend rule it mirrors.
//
//   node scripts/prerender.mjs
//   PRERENDER_PREDICTIONS_CACHE=... PRERENDER_GAME_PREDICTIONS_CACHE=... PRERENDER_DIST=... (optional)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPageMeta, SITE_NAME } from '../src/config/seo.js';
import { formatSlateDate, formatTipoff, todayInEastern } from '../src/utils/gamePredictions.js';

// Mirrors PUBLIC_PREVIEW_LIMIT in backend/app/api/routes/predictions.py (also imported by
// backend/app/api/routes/game_predictions.py): signed-out visitors get the first 12 rows only.
export const PUBLIC_PREVIEW_LIMIT = 12;
// The home page's "tonight's top projections" table: the first rows of the /predictions/games preview.
const HOME_TOP_ROWS = 5;

// Every prerendered route, and the file it is written to inside dist/.
export const ROUTES = {
  '/': 'index.html',
  '/predictions': 'predictions/index.html',
  '/predictions/games': 'predictions/games/index.html',
  '/games': 'games/index.html',
  '/recommendations/games': 'recommendations/games/index.html',
};

const NAV_LINKS = [
  ['/', 'Home'],
  ['/predictions', 'Season player predictions'],
  ['/predictions/games', 'Next-game predictions'],
  ['/recommendations/games', 'Game picks'],
  ['/games', "Tonight's games"],
  ['/stats', 'Player stats'],
  ['/standings', 'Standings'],
];

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const num = value => (value === null || value === undefined || !Number.isFinite(Number(value))
  ? '—' : Number(value).toFixed(1));

const validIso = value => typeof value === 'string' && !Number.isNaN(new Date(value).getTime());

function timeTag(iso) {
  const date = new Date(iso);
  const label = date.toLocaleString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  return `<time datetime="${escapeHtml(date.toISOString())}">${escapeHtml(label)} ET</time>`;
}

function table(caption, headers, rows) {
  const head = headers.map(h => `<th scope="col">${escapeHtml(h)}</th>`).join('');
  const body = rows.map(cells => `<tr>${cells.map((cell, i) => (i === 0
    ? `<th scope="row">${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`)).join('')}</tr>`).join('\n');
  return `<table>\n<caption>${escapeHtml(caption)}</caption>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table>`;
}

// ---- Data selection: mirrors of the signed-out API responses -------------------------------------

// backend/app/services/game_predictions.py upcoming(): drop days before today (US Eastern); if
// every day has passed, keep them all (the API then flags the slate stale).
export function upcomingSlate(cache, today) {
  const first = cache?.slate_date || '';
  const games = (cache?.games || []).map(game => ({ ...game, game_date: game.game_date || first }));
  const rows = (cache?.players || []).map(row => ({ ...row, game_date: row.game_date || first }));
  const dates = [...new Set([...games, ...rows].map(item => item.game_date)
    .concat(cache?.slate_dates || [first]))].filter(Boolean).sort();
  const keptDays = dates.filter(day => day >= today);
  const kept = keptDays.length ? keptDays : dates;
  return {
    slateDate: kept[0] || first,
    slateDates: kept,
    stale: Boolean(kept[0]) && kept[0] < today,
    games: games.filter(game => kept.includes(game.game_date)),
    players: rows.filter(row => kept.includes(row.game_date)),
  };
}

// drop_out_players(): players ruled out never appear. At build time only the cached injury is
// known; the API also re-checks the live injury report, which this cannot.
const isOut = injury => {
  if (!injury || typeof injury !== 'object') return false;
  const status = String(injury.status || '').trim().toLowerCase();
  const abbr = String(injury.status_abbr || '').trim().toLowerCase();
  return ['out', 'suspension'].includes(status) || ['out', 'susp'].includes(abbr);
};

// group_by_player(): one row per player, his nearest game (rows ordered by date, then tip-off).
function groupByPlayer(rows) {
  const sorted = [...rows].sort((a, b) => (
    `${a.game_date || ''}\u0000${a.tipoff || ''}`.localeCompare(`${b.game_date || ''}\u0000${b.tipoff || ''}`)));
  const byPlayer = new Map();
  for (const row of sorted) {
    const key = row.espn_id || row.id || row.name;
    if (!byPlayer.has(key)) byPlayer.set(key, row);
  }
  return [...byPlayer.values()];
}

// sort_rows(rows, 'predicted_pts', 'desc'): highest first, missing values last, ties keep order.
const byPredictedPtsDesc = rows => {
  const present = rows.filter(row => Number.isFinite(row.predicted_pts));
  const missing = rows.filter(row => !Number.isFinite(row.predicted_pts));
  return [...present.sort((a, b) => b.predicted_pts - a.predicted_pts), ...missing];
};

// GET /api/game-predictions as GamePredictions.jsx first calls it signed out (LIST_DEFAULTS: every
// day, sort_by=predicted_pts desc, page 1). backend/app/api/routes/game_predictions.py
// get_game_predictions() then caps anonymous users at PUBLIC_PREVIEW_LIMIT. `day` narrows to one
// day, as ?date= does.
export function publicGamePredictions(slate, day = '') {
  const rows = slate.players.filter(row => !isOut(row.injury) && (!day || row.game_date === day));
  return byPredictedPtsDesc(groupByPlayer(rows)).slice(0, PUBLIC_PREVIEW_LIMIT);
}

// GET /api/predictions as Predictions.jsx first calls it signed out (LIST_DEFAULTS: sort
// predicted_ppg desc, page 1). backend/app/api/routes/predictions.py get_all_predictions_paginated()
// sorts all_players_list, then keeps the first PUBLIC_PREVIEW_LIMIT for signed-out users.
// (The API also swaps in each player's current team at request time; the cached team is used here.)
export function publicSeasonPredictions(cache) {
  const rows = Array.isArray(cache?.all_players_list) ? cache.all_players_list : [];
  return [...rows].sort((a, b) => (b.predicted_ppg || 0) - (a.predicted_ppg || 0)).slice(0, PUBLIC_PREVIEW_LIMIT);
}

// ---- Per-route summaries ----------------------------------------------------------------------

function gameProjectionTable(caption, rows) {
  return table(caption, ['Player', 'Team', 'Opponent', 'Game', 'PTS', 'REB', 'AST', 'MIN'],
    rows.map(row => [row.name, row.team, `${row.is_home ? 'vs' : '@'} ${row.opponent}`,
      `${formatSlateDate(row.game_date)}, ${formatTipoff(row.tipoff)}`,
      num(row.predicted_pts), num(row.predicted_reb), num(row.predicted_ast), num(row.predicted_minutes)]));
}

function accuracySection(accuracy) {
  const stats = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['minutes', 'Minutes']]
    .filter(([key]) => Number.isFinite(accuracy?.[key]?.mae));
  if (!stats.length) return '';
  const rows = stats.map(([key, label]) => {
    const { mae, naive_mae: naive } = accuracy[key];
    return [label, Number(mae).toFixed(2), Number.isFinite(naive) ? Number(naive).toFixed(2) : "—"];
  });
  return `<h2>Model accuracy</h2>\n<p>Average error (MAE) on held-out past games, against a naive last-10-game average.</p>\n${
    table('Per-game model accuracy', ['Stat', 'Model MAE', 'Naive MAE'], rows)}`;
}

// The page's StaleSlateNotice, for crawlers: when every cached day has passed (the daily run failed
// or hasn't replaced the cache yet), say so instead of presenting played games as upcoming.
function staleNotice(slate) {
  return slate.stale
    ? `<p role="status">These predictions are for ${escapeHtml(formatSlateDate(slate.slateDate))}, which has already been played. The next slate has not been generated yet.</p>`
    : '';
}

function updatedLine(iso) {
  return validIso(iso) ? `<p>Last updated ${timeTag(iso)}.</p>` : '';
}

const SUMMARIES = {
  '/predictions/games': ({ game, today }) => {
    const slate = upcomingSlate(game, today);
    const rows = publicGamePredictions(slate);
    const days = slate.slateDates.map(formatSlateDate).join(', ');
    return `<h1>NBA next-game predictions</h1>
<p>Projected box scores for every player's next NBA game from ${escapeHtml(SITE_NAME)}'s per-game model, built from recent form, matchups and rest. Slate: ${escapeHtml(days)}.</p>
${updatedLine(game.generated_at)}
${staleNotice(slate)}
${gameProjectionTable(`Top ${rows.length} projected scorers`, rows)}
<p>Sign in with a free account to see every player on the slate.</p>
${accuracySection(game.accuracy)}`;
  },

  '/recommendations/games': ({ game, today }) => {
    // /api/game-recommendations requires sign-in (@require_auth), so its over/fade picks are never
    // prerendered. What a signed-out visitor can get for the same night is the /api/game-predictions
    // preview for that day (?date=<nearest day>), whose first rows are also the "top" points picks.
    const slate = upcomingSlate(game, today);
    const rows = publicGamePredictions(slate, slate.slateDate);
    return `<h1>NBA game picks for ${escapeHtml(formatSlateDate(slate.slateDate))}</h1>
<p>The strongest projected performances on the next NBA slate, from ${escapeHtml(SITE_NAME)}'s per-game model. Below are the biggest projected scoring lines; the full picks (players due for a big night and fade candidates) are free with an account.</p>
${updatedLine(game.generated_at)}
${staleNotice(slate)}
${gameProjectionTable('Top projected lines', rows)}`;
  },

  '/games': ({ game, today }) => {
    const slate = upcomingSlate(game, today);
    const games = [...slate.games].sort((a, b) => `${a.game_date}${a.tipoff}`.localeCompare(`${b.game_date}${b.tipoff}`));
    return `<h1>NBA games: tonight's schedule</h1>
<p>Live NBA scores, tonight's schedule and box scores for every game. The live scoreboard loads in your browser; the upcoming games are listed below with tip-off times in US Eastern.</p>
${updatedLine(game.generated_at)}
${staleNotice(slate)}
${table(slate.stale ? 'Most recent NBA games' : 'Upcoming NBA games', ['Matchup', 'Date', 'Tip-off', 'Line'],
    games.map(g => [`${g.away} @ ${g.home}`, formatSlateDate(g.game_date), formatTipoff(g.tipoff), g.odds_text || '—']))}`;
  },

  '/predictions': ({ season, predictionsUpdatedAt }) => {
    const rows = publicSeasonPredictions(season);
    return `<h1>NBA player predictions</h1>
<p>Machine-learning projections of each NBA player's per-game averages: predicted points, rebounds, assists, minutes and fantasy points (FanDuel scoring), next to what he averages now.</p>
${updatedLine(predictionsUpdatedAt)}
${table(`Top ${rows.length} projected scorers`, ['Player', 'Team', 'Pos', 'PTS', 'REB', 'AST', 'MIN', 'FPTS', 'Current PTS'],
    rows.map(row => [row.name, row.team, row.position, num(row.predicted_ppg), num(row.predicted_rpg),
      num(row.predicted_apg), num(row.predicted_mpg), num(row.predicted_fantasy), num(row.ppg_last)]))}
<p>Sign in with a free account to see projections for every player.</p>`;
  },

  '/': ({ game, today }) => {
    const slate = upcomingSlate(game, today);
    const rows = publicGamePredictions(slate).slice(0, HOME_TOP_ROWS);
    return `<h1>${escapeHtml(SITE_NAME)}: NBA stats and AI player predictions</h1>
<p>${escapeHtml(SITE_NAME)} is a free NBA analytics dashboard: live scores, player and team stats, standings, and machine-learning predictions for every player's next game and for the season.</p>
${updatedLine(game.generated_at)}
${staleNotice(slate)}
${gameProjectionTable('Top projections for the next games', rows)}`;
  },
};

const FALLBACK_TEXT = {
  '/': `${SITE_NAME} is a free NBA analytics dashboard with live scores, player and team stats, standings, and machine-learning predictions for every player's next game and for the season.`,
  '/predictions': 'Machine-learning projections of each NBA player\'s per-game averages: predicted points, rebounds, assists, minutes and fantasy points, next to what he averages now.',
  '/predictions/games': 'Projected box scores for every player\'s next NBA game, built by a per-game model from recent form, matchups and rest, with the model\'s accuracy against a naive baseline.',
  '/games': 'Live NBA scores, tonight\'s schedule and box scores for every game, updated as the games are played.',
  '/recommendations/games': 'The strongest projected performances on the next NBA slate: the biggest projected lines and the players expected to beat or fall short of their recent form.',
};

// Generic summary when a cache file is missing: the page still describes itself and links out.
function fallbackSummary(route) {
  const { title } = getPageMeta(route);
  return `<h1>${escapeHtml(title)}</h1>\n<p>${escapeHtml(FALLBACK_TEXT[route])} The latest numbers load when the page opens in your browser.</p>`;
}

// Readable fallback for visitors without JavaScript. The early bootstrap in index.html hides
// this summary while the client app loads, so visitors never see a different page flash first.
// style-src allows inline styles (src/config/csp.js).
const PRERENDER_STYLE = `<style>
.cv-prerender{max-width:64rem;margin:0 auto;padding:96px 16px 48px;color:var(--text-primary,#eee);font:16px/1.5 system-ui,sans-serif}
.cv-prerender a{color:var(--accent-primary,#f97316)}
.cv-prerender nav ul{display:flex;flex-wrap:wrap;gap:8px 16px;list-style:none;padding:0}
.cv-prerender table{width:100%;border-collapse:collapse;margin:16px 0;font-variant-numeric:tabular-nums}
.cv-prerender caption{text-align:left;font-weight:600;padding-bottom:8px}
.cv-prerender th,.cv-prerender td{padding:6px 8px;text-align:left;border-bottom:1px solid var(--border-glass,#333)}
.cv-prerender p{color:var(--text-secondary,#bbb)}
</style>`;

export function renderSummary(route, data = {}) {
  const build = SUMMARIES[route];
  const needsGame = route !== '/predictions';
  const hasData = needsGame ? Array.isArray(data.game?.players) : Array.isArray(data.season?.all_players_list);
  const body = build && hasData
    ? build({ today: todayInEastern(), ...data })
    : fallbackSummary(route);
  const nav = NAV_LINKS.filter(([href]) => href !== route)
    .map(([href, label]) => `<li><a href="${href}">${escapeHtml(label)}</a></li>`).join('');
  return `${PRERENDER_STYLE}<div class="cv-prerender">\n<nav aria-label="Site"><ul>${nav}</ul></nav>\n<main>\n${body}\n</main>\n</div>`;
}

// Replace (or add) one head tag matched by `pattern`.
function setHeadTag(html, pattern, tag) {
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
}

// The route's head tags, in the same tags PageMeta.jsx later updates (it looks them up by
// name/property/rel), so the client never adds a second copy.
export function renderHead(template, route) {
  const { title, description, canonical } = getPageMeta(route);
  const attr = escapeHtml;
  let html = template.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  html = setHeadTag(html, /<meta name="description"[^>]*>/i, `<meta name="description" content="${attr(description)}" />`);
  html = setHeadTag(html, /<meta property="og:title"[^>]*>/i, `<meta property="og:title" content="${attr(title)}" />`);
  html = setHeadTag(html, /<meta property="og:description"[^>]*>/i, `<meta property="og:description" content="${attr(description)}" />`);
  if (canonical) {
    html = setHeadTag(html, /<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${attr(canonical)}" />`);
    html = setHeadTag(html, /<meta property="og:url"[^>]*>/i, `<meta property="og:url" content="${attr(canonical)}" />`);
  }
  return html;
}

export function renderRouteHtml(template, route, data = {}) {
  const html = renderHead(template, route);
  if (!/<div id="root"><\/div>/.test(html)) throw new Error('prerender: template has no empty <div id="root"></div>');
  // A function replacement, so "$" in the data is never read as a replacement pattern.
  return html.replace('<div id="root"></div>', () => `<div id="root">${renderSummary(route, data)}</div>`);
}

// ---- File IO ----------------------------------------------------------------------------------

function readJson(path, label) {
  if (!existsSync(path)) {
    console.warn(`prerender: WARNING ${label} not found at ${path}; writing head tags and a generic summary only.`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.warn(`prerender: WARNING could not read ${label} (${error.message}); writing a generic summary.`);
    return null;
  }
}

// When predictions_cache.json last changed: its last commit time. The file has no timestamp of its
// own, and the daily bot commits it only when the projections changed, so this is the honest "last
// updated". In a shallow clone (Vercel clones --depth=10) a file untouched for longer shows up as
// added in the boundary commit, which would claim a false, recent date, so boundary commits are
// ignored. Fallback: the game cache's generated_at, written by the same daily job.
function lastCommitTime(path) {
  try {
    const cwd = dirname(path);
    const [sha, time] = execFileSync('git', ['log', '-1', '--format=%H %cI', '--', path], { cwd, encoding: 'utf8' })
      .trim().split(' ');
    if (!sha) return null;
    const shallowFile = execFileSync('git', ['rev-parse', '--git-path', 'shallow'], { cwd, encoding: 'utf8' }).trim();
    const shallowPath = shallowFile.startsWith('/') ? shallowFile : join(cwd, shallowFile);
    if (existsSync(shallowPath) && readFileSync(shallowPath, 'utf8').includes(sha)) return null;
    return time;
  } catch {
    return null;
  }
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const dataDir = join(here, '..', '..', 'backend', 'data');
  const dist = process.env.PRERENDER_DIST || join(here, '..', 'dist');
  const seasonPath = process.env.PRERENDER_PREDICTIONS_CACHE || join(dataDir, 'predictions_cache.json');
  const gamePath = process.env.PRERENDER_GAME_PREDICTIONS_CACHE || join(dataDir, 'game_predictions_cache.json');

  // index.html becomes the prerendered home page, so keep the untouched build as spa.html: the
  // catch-all rewrite (netlify.toml, vercel.json) serves it for every other URL, which must not claim
  // the home page's title and canonical. Vite empties dist/ on each build; on a re-run spa.html is
  // the clean template.
  const shellPath = join(dist, 'spa.html');
  if (!existsSync(shellPath)) writeFileSync(shellPath, readFileSync(join(dist, 'index.html'), 'utf8'));
  const template = readFileSync(shellPath, 'utf8');
  const season = readJson(seasonPath, 'predictions_cache.json');
  const game = readJson(gamePath, 'game_predictions_cache.json');
  const predictionsUpdatedAt = (season && lastCommitTime(seasonPath)) || game?.generated_at || null;

  for (const [route, file] of Object.entries(ROUTES)) {
    const out = join(dist, file);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, renderRouteHtml(template, route, { season, game, predictionsUpdatedAt }));
    console.log(`prerender: ${route} -> dist/${file}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
