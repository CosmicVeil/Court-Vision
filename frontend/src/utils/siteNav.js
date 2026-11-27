// Primary site navigation, in the order the header shows it.
export const NAV_LINKS = [
  { to: '/stats', label: 'Stats' },
  { to: '/standings', label: 'Standings' },
  { to: '/games', label: 'Games' },
  { to: '/predictions', label: 'Predictions' },
  { to: '/recommendations', label: 'Recommendations' },
  { to: '/favourites', label: 'Favourites' },
  // Contact page temporarily hidden; restore this entry (and the route in App.jsx) to bring it back.
  // { to: '/contact', label: 'Contact' },
  { to: '/privacy', label: 'Privacy' },
];

export function getInitials(user) {
  const initial = name => (typeof name === 'string' ? name.trim().charAt(0).toUpperCase() : '');
  return `${initial(user?.first_name)}${initial(user?.last_name)}`;
}

const AUTH_PATHS = new Set(['/login', '/create-account']);

// Where Login / Create Account should send the user afterwards: the page they are on now.
// From an auth page itself, keep the destination it was opened with instead of looping back to it.
// Matched like React Router matches routes: case-insensitive, trailing slashes ignored (/LOGIN/ is Login).
export function getAuthReturnTo(location) {
  const route = (location?.pathname || '').toLowerCase().replace(/\/+$/, '');
  if (AUTH_PATHS.has(route)) return location.state?.from || '/';
  return `${location?.pathname || '/'}${location?.search || ''}`;
}
