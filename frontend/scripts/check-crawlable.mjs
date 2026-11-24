// Checks that built pages are readable without JavaScript: what Googlebot's first pass, Bing,
// AI crawlers and link previews see. Run after `npm run build`:
//   node scripts/check-crawlable.mjs [distDir]   (default: frontend/dist)
// Exits 1 if any route fails. Dependency-free: plain string/regex parsing of our own build output.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getPageMeta } from '../src/config/seo.js';

const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ROUTES = ['/', '/predictions', '/predictions/games', '/games', '/recommendations/games'];
// Pages whose point is the model's numbers: they must ship a dated table of projections.
export const PROJECTION_ROUTES = ['/predictions', '/predictions/games', '/recommendations/games'];
export const MIN_TEXT_LENGTH = 200;
export const MIN_TABLE_ROWS = 5;

// '/' -> <dist>/index.html, '/x/y' -> <dist>/x/y/index.html (how static hosts resolve directory URLs).
export function routeFile(distDir, route) {
  const parts = route.split('/').filter(Boolean);
  return path.join(distDir, ...parts, 'index.html');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

// { name: value } for one tag's attributes, values entity-decoded; names lower-cased.
export function parseAttrs(tag) {
  const attrs = {};
  const body = tag.replace(/^<[a-z0-9-]+/i, '').replace(/\/?>$/, '');
  for (const m of body.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

// Opening tags named `name` (e.g. 'meta'), as { tag, attrs }.
export function findTags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(m => ({ tag: m[0], attrs: parseAttrs(m[0]) }));
}

// Inner HTML of every <name>...</name> element (no nesting of the same tag assumed, true for td/tr/tbody).
export function innerHtmlOf(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'gi'))].map(m => m[1]);
}

export function headHtml(html) {
  const m = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  return m ? m[1] : '';
}

// Inner HTML of <div id="root">, balancing nested divs; null when there is no root div.
export function extractRootHtml(html) {
  const open = /<div\b[^>]*\bid\s*=\s*["']?root["']?[^>]*>/i.exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const tags = /<div\b[^>]*>|<\/div\s*>/gi;
  tags.lastIndex = start;
  let depth = 1;
  for (let m; (m = tags.exec(html));) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  return html.slice(start); // unclosed: take the rest
}

// Text a reader would see: no scripts, styles, comments or tags; entities decoded; whitespace collapsed.
export function visibleText(html) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

// Rows of the first <table> in `html` that has a <tbody>, each row as its cells' visible text.
export function tableRows(html) {
  const rowsPerTable = innerHtmlOf(html, 'table').map(table => {
    const tbody = innerHtmlOf(table, 'tbody')[0];
    if (tbody === undefined) return null;
    return innerHtmlOf(tbody, 'tr').map(row => [...row.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(c => visibleText(c[2])));
  });
  // The biggest table is the one that matters (a page may also have a small legend table).
  return rowsPerTable.filter(Boolean).sort((a, b) => b.length - a.length)[0] ?? null;
}

const hasNumber = text => /\d/.test(text);

// Problems with one page's HTML against the expected meta; [] means crawlable.
export function checkHtml(html, route, meta = getPageMeta(route)) {
  const problems = [];
  const head = headHtml(html);

  const titles = innerHtmlOf(head, 'title').map(t => decodeEntities(t).trim());
  if (titles.length !== 1) problems.push(`expected exactly one <title> in <head>, found ${titles.length}`);
  else if (titles[0] !== meta.title) problems.push(`title is "${titles[0]}", expected "${meta.title}"`);

  const descriptions = findTags(head, 'meta').filter(t => (t.attrs.name || '').toLowerCase() === 'description');
  if (descriptions.length !== 1) problems.push(`expected exactly one meta description, found ${descriptions.length}`);
  else if (descriptions[0].attrs.content !== meta.description) {
    problems.push(`meta description is "${descriptions[0].attrs.content}", expected "${meta.description}"`);
  }

  const canonicals = findTags(html, 'link').filter(t => (t.attrs.rel || '').toLowerCase().split(/\s+/).includes('canonical'));
  if (canonicals.length === 0) problems.push(`missing <link rel="canonical">, expected ${meta.canonical}`);
  else if (canonicals.length > 1) problems.push(`expected one canonical link, found ${canonicals.length}`);
  else if (canonicals[0].attrs.href !== meta.canonical) {
    problems.push(`canonical is ${canonicals[0].attrs.href}, expected ${meta.canonical}`);
  }

  const root = extractRootHtml(html);
  const text = root === null ? '' : visibleText(root);
  if (root === null) problems.push('no <div id="root"> found');
  else if (text.length === 0) problems.push('empty root: <div id="root"> has no visible text (client-only SPA shell)');
  else if (text.length < MIN_TEXT_LENGTH) {
    problems.push(`root has only ${text.length} characters of visible text, need at least ${MIN_TEXT_LENGTH}`);
  }

  let rows = null;
  let datetime = null;
  if (PROJECTION_ROUTES.includes(route)) {
    const rootHtml = root ?? '';
    const times = findTags(rootHtml, 'time').filter(t => t.attrs.datetime !== undefined);
    datetime = times.find(t => !Number.isNaN(Date.parse(t.attrs.datetime)))?.attrs.datetime ?? null;
    if (times.length === 0) problems.push('projection page has no <time datetime="..."> inside #root');
    else if (datetime === null) problems.push(`<time datetime="${times[0].attrs.datetime}"> is not a valid date`);

    rows = tableRows(rootHtml);
    if (rows === null) problems.push('projection page has no <table> with a <tbody> inside #root');
    else if (rows.length < MIN_TABLE_ROWS) {
      problems.push(`projection table has ${rows.length} <tbody> rows, need at least ${MIN_TABLE_ROWS}`);
    } else {
      const bad = rows.findIndex(cells => !cells.some(hasNumber));
      if (bad !== -1) problems.push(`projection table row ${bad + 1} has no cell with a number`);
    }
  }

  return {
    problems,
    title: titles[0] ?? null,
    textLength: text.length,
    textPreview: text.slice(0, 160),
    rowCount: rows ? rows.length : null,
    datetime,
  };
}

// One result per route: { route, file, ok, problems, title, textLength, textPreview, rowCount, datetime }.
export function checkCrawlable(distDir, routes = ROUTES) {
  return routes.map(route => {
    const file = routeFile(distDir, route);
    if (!existsSync(file)) {
      return { route, file, ok: false, problems: [`file not found: ${file}`], title: null, textLength: 0,
        textPreview: '', rowCount: null, datetime: null };
    }
    const result = checkHtml(readFileSync(file, 'utf8'), route);
    return { route, file, ok: result.problems.length === 0, ...result };
  });
}

export function formatReport(results) {
  const lines = [];
  for (const r of results) {
    lines.push(`${r.ok ? 'PASS' : 'FAIL'} ${r.route}  (${path.relative(process.cwd(), r.file) || r.file})`);
    lines.push(`  title: ${r.title ?? '(none)'}`);
    lines.push(`  text: ${r.textLength} chars${r.rowCount !== null ? `, table rows: ${r.rowCount}` : ''}${r.datetime ? `, datetime: ${r.datetime}` : ''}`);
    if (r.textPreview) lines.push(`  preview: ${r.textPreview}`);
    for (const p of r.problems) lines.push(`  - ${p}`);
  }
  const failed = results.filter(r => !r.ok).length;
  lines.push('', failed ? `${failed} of ${results.length} routes failed.` : `All ${results.length} routes are crawlable.`);
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // An explicit dir is relative to the cwd; the default is frontend/dist wherever this is run from.
  const distDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(FRONTEND_DIR, 'dist');
  const results = checkCrawlable(distDir);
  console.log(formatReport(results));
  process.exitCode = results.every(r => r.ok) ? 0 : 1;
}
