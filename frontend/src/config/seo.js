// Per-route <title>, description and robots rules, read by components/PageMeta.jsx.
// The app renders in the browser, so this is how each URL tells search engines what it is.
// vite.config.js also uses it at build time for index.html's default tags and the sitemap.
import { cleanTricode, TEAMS } from '../utils/team.js';

export const SITE_URL = 'https://courtvision.works';
export const SITE_NAME = 'CourtVision';

export const DEFAULT_META = {
  title: `${SITE_NAME} – NBA Stats & AI Player Predictions`,
  description: "CourtVision is a free NBA analytics dashboard: live scores, player and team stats, standings, and machine-learning predictions for every player's next game.",
};

// Public pages worth ranking; together with the team pages they make up the sitemap.
const PUBLIC_PAGES = {
  '/': DEFAULT_META,
  '/stats': {
    title: 'NBA Player Stats – Season Averages & Leaders',
    description: 'Sortable NBA player stats for the current season: points, rebounds, assists and more for every player in the league.',
  },
  '/standings': {
    title: 'NBA Standings – Eastern & Western Conference',
    description: 'Current NBA standings for both conferences, with records, streaks and links to every team page.',
  },
  '/games': {
    title: 'NBA Scores Today – Live Games & Box Scores',
    description: "Live NBA scores, tonight's schedule and box scores for every game, updated as the games are played.",
  },
  '/predictions': {
    title: 'NBA Player Predictions – AI Stat Projections',
    description: 'Machine-learning projections for NBA players: predicted points, rebounds, assists and fantasy points.',
  },
  '/predictions/games': {
    title: 'NBA Next-Game Predictions – Projected Box Scores',
    description: "AI-projected stat lines for each player's next NBA game, built from recent form, matchups and rest.",
  },
  '/recommendations': {
    title: 'NBA Player Picks – AI Recommendations',
    description: 'The players CourtVision\'s model expects to outperform their averages, ranked by stat.',
  },
  '/recommendations/games': {
    title: 'NBA Game Picks – Tonight\'s Best Player Projections',
    description: "The strongest projected performances on the next NBA slate, picked by CourtVision's per-game model.",
  },
  '/contact': {
    title: 'Contact the CourtVision Team',
    description: 'Get in touch with the people behind CourtVision, the NBA stats and predictions platform.',
  },
  '/privacy': {
    title: 'Privacy Policy',
    description: 'How CourtVision collects, uses and protects your data.',
  },
};

// Account pages and per-user views: useful to visitors, useless (or empty) in search results.
const PRIVATE_PAGES = {
  '/login': 'Log In',
  '/create-account': 'Create Account',
  '/profile': 'Your Profile',
  '/favourites': 'Your Favourite Players',
};

export const INDEXABLE_PATHS = [
  ...Object.keys(PUBLIC_PAGES),
  ...Object.keys(TEAMS).map(tricode => `/teams/${tricode}`),
];

const withSiteName = title => (title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`);
const trimSlash = pathname => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);

// { title, description, canonical, noindex } for a URL path. Canonical is null for noindex pages.
export function getPageMeta(rawPathname) {
  const pathname = trimSlash(rawPathname || '/');
  const page = (meta, noindex = false) => ({
    title: withSiteName(meta.title),
    description: meta.description || DEFAULT_META.description,
    canonical: noindex ? null : `${SITE_URL}${pathname}`,
    noindex,
  });

  if (Object.hasOwn(PUBLIC_PAGES, pathname)) return page(PUBLIC_PAGES[pathname]);
  if (Object.hasOwn(PRIVATE_PAGES, pathname)) return page({ title: PRIVATE_PAGES[pathname] }, true);

  const team = pathname.match(/^\/teams\/([^/]+)$/);
  if (team) {
    // No decoding: real tricodes are plain letters, and decodeURIComponent throws on "%ZZ".
    const tricode = cleanTricode(team[1]);
    if (!Object.hasOwn(TEAMS, tricode)) return page({ title: 'Team Not Found' }, true);
    const { name } = TEAMS[tricode];
    // Canonical uses the upper-case tricode so /teams/lal and /teams/LAL count as one page.
    return {
      ...page({
        title: `${name} Roster, Schedule & Stats`,
        description: `The ${name} roster, season results, team leaders and player stats, plus AI predictions for every ${tricode} player.`,
      }),
      canonical: `${SITE_URL}/teams/${tricode}`,
    };
  }

  // Single games go stale within a day, and stat charts sit behind login: keep them out of the index.
  if (/^\/games\/[^/]+$/.test(pathname)) return page({ title: 'NBA Game – Box Score' }, true);
  if (/^\/recommendations\/[^/]+$/.test(pathname)) return page({ title: 'NBA Stat Recommendations' }, true);

  // Netlify answers every URL with 200, so an unknown path would look like a real page. noindex stops that.
  return page({ title: 'Page Not Found' }, true);
}

const escapeText = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// index.html's default <title> and description, as Vite tag descriptors (Vite escapes attributes).
// Crawlers that don't run JavaScript and link previews see these. Canonical and og:url are left
// to PageMeta: a static one would claim every URL is the home page.
export function defaultHeadTags() {
  const { title, description } = DEFAULT_META;
  return [
    { tag: 'title', children: escapeText(title) },
    { tag: 'meta', attrs: { name: 'description', content: description } },
    { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
    { tag: 'meta', attrs: { property: 'og:site_name', content: SITE_NAME } },
    { tag: 'meta', attrs: { property: 'og:title', content: title } },
    { tag: 'meta', attrs: { property: 'og:description', content: description } },
    { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary' } },
  ];
}

// sitemap.xml for every indexable page, written into dist/ at build time.
export function buildSitemap() {
  const urls = INDEXABLE_PATHS.map(path => `  <url><loc>${SITE_URL}${path}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
