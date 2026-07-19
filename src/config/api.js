/**
 * API Configuration
 * Uses environment variables for flexible deployment
 */

// Get API URL from environment variable, fallback to localhost for development
// Vite uses VITE_ prefix for environment variables
const getApiBaseUrl = () => {
  // Check if we have a production API URL set
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // For development, use relative URL (which works with Vite proxy)
  // For production builds, this will need to be set via VITE_API_URL
  if (import.meta.env.DEV) {
    // Development mode - use relative URL that works with Vite proxy
    return '';
  }
  
  // Production mode but no VITE_API_URL set - this will fail gracefully
  // You should set VITE_API_URL in your build environment
  console.warn('VITE_API_URL not set! Backend API calls will fail in production.');
  return '';
};

export const API_BASE_URL = getApiBaseUrl();

// Helper function to build API endpoints
export const buildApiUrl = (endpoint) => {
  // Remove leading slash if present to avoid double slashes
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
  
  if (API_BASE_URL) {
    // Production mode - use the configured API URL
    // Remove trailing slash from base URL if present
    const baseUrl = API_BASE_URL.replace(/\/$/, '');
    // The endpoint should already be clean (no leading slash)
    return `${baseUrl}/${cleanEndpoint}`;
  }
  
  // Development mode - return relative URL that works with Vite proxy
  // The proxy in vite.config.js forwards /api/* to http://localhost:5001
  return `/api/${cleanEndpoint}`;
};

// Commonly used API endpoints
export const API_ENDPOINTS = {
  players: buildApiUrl('players'),
  teams: buildApiUrl('teams'),
  positions: buildApiUrl('positions'),
  aiPredictions: buildApiUrl('ai-predictions'),
  health: buildApiUrl('health'),
};
