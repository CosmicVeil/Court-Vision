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

// The link-preview card (public/og-image.png). Previews need an absolute URL.
const SHARE_IMAGE = {
  url: `${SITE_URL}/og-image.png`,
  width: '1200',
  height: '630',
  alt: 'CourtVision: NBA stats & AI player predictions',
};

// Structured data for every page: what the site is and who runs it.
const SITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL, description: DEFAULT_META.description },
    { '@type': 'Organization', name: SITE_NAME, url: SITE_URL, image: SHARE_IMAGE.url },
    // What the site does, so search engines and AI answers can list it among NBA stats and prediction tools.
    {
      '@type': 'WebApplication',
      name: SITE_NAME,
      url: SITE_URL,
      description: DEFAULT_META.description,
      applicationCategory: 'SportsApplication',
      operatingSystem: 'Any (web browser)',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      featureList: [
        'Live NBA scores and box scores',
        'NBA player and team stats, standings and leaders',
        "Machine-learning (XGBoost) predictions of each NBA player's next-game points, rebounds and assists",
        'Daily AI player picks for the NBA slate',
      ],
    },
  ],
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

// { title, description, canonical, noindex, jsonLd } for a URL path. Canonical is null for noindex pages;
// jsonLd is the page's own structured data (team pages only), or null.
export function getPageMeta(rawPathname) {
  const pathname = trimSlash(rawPathname || '/');
  const page = (meta, noindex = false) => ({
    title: withSiteName(meta.title),
    description: meta.description || DEFAULT_META.description,
    canonical: noindex ? null : `${SITE_URL}${pathname}`,
    noindex,
    jsonLd: null,
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
    const canonical = `${SITE_URL}/teams/${tricode}`;
    return {
      ...page({
        title: `${name} Roster, Schedule & Stats`,
        description: `The ${name} roster, season results, team leaders and player stats, plus AI predictions for every ${tricode} player.`,
      }),
      canonical,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'SportsTeam',
        name,
        url: canonical,
        sport: 'Basketball',
        memberOf: { '@type': 'SportsOrganization', name: 'National Basketball Association', alternateName: 'NBA' },
      },
    };
  }

  // Single games go stale within a day, and stat charts sit behind login: keep them out of the index.
  if (/^\/games\/[^/]+$/.test(pathname)) return page({ title: 'NBA Game – Box Score' }, true);
  if (/^\/recommendations\/[^/]+$/.test(pathname)) return page({ title: 'NBA Stat Recommendations' }, true);
  // Player pages: PageMeta only sees the path, so the title can't name the player, and thousands of
  // pages with one title would be duplicate content. Keep them out of the index for now.
  if (/^\/players\/(?:by-name\/)?(?!by-name$)[^/]+$/.test(pathname)) {
    return page({ title: 'NBA Player – Stats, Game Log & Predictions' }, true);
  }

  // Netlify answers every URL with 200, so an unknown path would look like a real page. noindex stops that.
  return page({ title: 'Page Not Found' }, true);
}

const escapeText = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// Vite inserts script children as-is; with < escaped the JSON can never contain "</script>".
const jsonLdText = data => JSON.stringify(data).replace(/</g, '\\u003c');

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
    { tag: 'meta', attrs: { property: 'og:image', content: SHARE_IMAGE.url } },
    { tag: 'meta', attrs: { property: 'og:image:width', content: SHARE_IMAGE.width } },
    { tag: 'meta', attrs: { property: 'og:image:height', content: SHARE_IMAGE.height } },
    { tag: 'meta', attrs: { property: 'og:image:alt', content: SHARE_IMAGE.alt } },
    { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
    { tag: 'meta', attrs: { name: 'twitter:image', content: SHARE_IMAGE.url } },
    { tag: 'script', attrs: { type: 'application/ld+json' }, children: jsonLdText(SITE_JSON_LD) },
  ];
}

// sitemap.xml for every indexable page, written into dist/ at build time.
export function buildSitemap() {
  const urls = INDEXABLE_PATHS.map(path => `  <url><loc>${SITE_URL}${path}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
