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
