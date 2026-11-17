// The player page (/players/:playerId): its tabs, the ?tab= query that selects one, and links to it.

export const PLAYER_TABS = [
  { id: 'current', label: 'Current Stats' },
  { id: 'games', label: 'Game Log' },
  { id: 'predictions', label: 'AI Predictions' },
  { id: 'next-game', label: 'Game projections' },
  { id: 'history', label: 'Career History' },
];

const DEFAULT_TAB = 'current';

// Where a player row links to. The NBA.com person ID (box-score rows call it personId) when there
// is one; ESPN IDs are a different numbering, so rows with only a name link by name instead.
export function playerPath(player) {
  const id = player?.id ?? player?.personId;
  if (id !== null && id !== undefined && id !== '') return `/players/${encodeURIComponent(id)}`;
  return `/players/by-name/${encodeURIComponent(player?.name ?? '')}`;
}

// The tab named in the URL, or Current Stats when it is missing or unknown.
export function readPlayerTab(searchParams) {
  const tab = searchParams.get('tab');
  return PLAYER_TABS.some(item => item.id === tab) ? tab : DEFAULT_TAB;
}

// A copy of the query with the tab set; the default tab is left out so the plain URL stays canonical.
export function withPlayerTab(searchParams, tab) {
  const next = new URLSearchParams(searchParams);
  if (tab === DEFAULT_TAB) next.delete('tab');
  else next.set('tab', tab);
  return next;
}
