import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Prefix relative API requests with the configured API URL in production
const originalFetch = window.fetch;
window.fetch = function (input, init) {
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
  return originalFetch(input, init);
};

import App from './App.jsx' 
import './components/home.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
