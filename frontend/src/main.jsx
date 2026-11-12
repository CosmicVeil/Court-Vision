import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { isApiRequest } from './config/api'
import { getAuthToken, getScoring } from './utils/auth'
import { SCORING_HEADER, scoringHeaderValue } from './utils/fantasy'

// Prefix relative API requests with the configured API URL in production, and send the
// session token with every request to our own API so account-gated data (full predictions,
// per-player projections, recommendations) loads for signed-in users on every page. The user's
// fantasy scoring goes along the same way, so every FPTS the API returns uses their preset.
const originalFetch = window.fetch;
window.fetch = function (input, init) {
  const isApi = isApiRequest(input);
  if (typeof input === 'string' && input.startsWith('/api')) {
    const apiBase = import.meta.env.VITE_API_URL || '';
    if (apiBase) {
      const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
      if (base.endsWith('/api')) {
        const path = input.substring(4);
        input = `${base}${path.startsWith('/') ? path : '/' + path}`;
      } else {
        input = `${base}${input.startsWith('/') ? input : '/' + input}`;
      }
    }
  }
  const token = isApi ? getAuthToken() : null;
  const scoring = isApi ? scoringHeaderValue(getScoring()) : null;
  if (token || scoring) {
    const headers = new Headers(init?.headers || {});
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    if (scoring && !headers.has(SCORING_HEADER)) headers.set(SCORING_HEADER, scoring);
    init = { ...init, headers };
  }
  return originalFetch(input, init);
};

import App from './App.jsx'
import './styles/tokens.css'
import './pages/Home.css'

import ReactGA from "react-ga4";

ReactGA.initialize("G-ZEC2G93W0V");
ReactGA.send({ hitType: "pageview", page: window.location.pathname });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
