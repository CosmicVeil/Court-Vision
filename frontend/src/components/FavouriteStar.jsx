// A functional favourite indicator; its parent button supplies the accessible label.
export default function FavouriteStar({ selected = false }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={selected ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9L12 3Z" />
    </svg>
  );
}
