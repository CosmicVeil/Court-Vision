// Content-Security-Policy for the production build, injected into index.html as a <meta> tag by
// vite.config.js (so it works the same on Netlify and Vercel). Build-time only: not imported by the app.
//
// The auth token lives in localStorage, so the main job here is limiting what an injected script
// could do: scripts only run from our own origin (plus Google Analytics and hashed inline scripts),
// and requests and images can only go to the hosts the site actually uses.
import { createHash } from 'node:crypto';

const GOOGLE_ANALYTICS = {
  script: ['https://*.googletagmanager.com'],
  connect: ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com'],
  img: ['https://*.google-analytics.com', 'https://*.googletagmanager.com'],
};

// Team logos come from ESPN's CDN, player headshots from NBA.com's.
const IMAGE_HOSTS = ['https://*.espncdn.com', 'https://cdn.nba.com'];

export const buildCsp = ({ apiOrigin, inlineScriptHashes = [] }) => {
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", ...inlineScriptHashes.map(hash => `'${hash}'`), ...GOOGLE_ANALYTICS.script],
    // React and Tailwind set inline styles; injected CSS can restyle the page but cannot run code.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', ...IMAGE_HOSTS, ...GOOGLE_ANALYTICS.img],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...(apiOrigin ? [apiOrigin] : []), ...GOOGLE_ANALYTICS.connect],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
  return Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
};

// sha256 hashes of the inline (no src) scripts in an HTML document, in CSP source format.
export const inlineScriptHashes = (html) =>
  [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(([, body]) => body)
    .filter(body => body.trim())
    .map(body => `sha256-${createHash('sha256').update(body).digest('base64')}`);

// The API origin from VITE_API_URL (which may end in /api), or null when requests stay same-origin.
export const apiOriginFrom = (apiUrl) => {
  if (!apiUrl) return null;
  try {
    return new URL(apiUrl).origin;
  } catch {
    return null;
  }
};

// Insert the CSP <meta> right after <meta charset>, before any script it has to govern.
export const injectCsp = (html, { apiOrigin }) => {
  const policy = buildCsp({ apiOrigin, inlineScriptHashes: inlineScriptHashes(html) });
  const tag = `<meta http-equiv="Content-Security-Policy" content="${policy}" />`;
  const charset = html.match(/<meta charset[^>]*>/i);
  if (charset) return html.replace(charset[0], `${charset[0]}\n    ${tag}`);
  return html.replace(/<head>/i, `<head>\n    ${tag}`);
};
