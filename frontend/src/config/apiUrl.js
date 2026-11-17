// The production API when VITE_API_URL is not set. Its own module so vite.config.js can read it
// for the CSP's connect-src without importing api.js (which needs import.meta.env).
export const PRODUCTION_API_URL = 'https://court-vision-zxuj.onrender.com/api';
