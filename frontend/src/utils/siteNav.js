// Primary site navigation, in the order the header shows it.
export const NAV_LINKS = [
  { to: '/stats', label: 'STATS' },
  { to: '/games', label: 'LIVE GAMES' },
  { to: '/predictions', label: 'PREDICTIONS' },
  { to: '/recommendations', label: 'RECOMMENDATIONS' },
  { to: '/favourites', label: 'FAVOURITES' },
  { to: '/contact', label: 'CONTACT' },
  { to: '/privacy', label: 'PRIVACY' },
];

export function getInitials(user) {
  const initial = name => (typeof name === 'string' ? name.trim().charAt(0).toUpperCase() : '');
  return `${initial(user?.first_name)}${initial(user?.last_name)}`;
}
