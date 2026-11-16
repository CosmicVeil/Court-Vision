import './ContentSkeleton.css';

// The grid class each variant borrows from its real content, so placeholders sit where cards will.
const GRID_BY_VARIANT = {
  cards: 'pc-grid',
  games: 'games-grid',
  recommendations: 'recommendations-grid',
  picks: 'gr-grid',
  spotlight: 'spotlight-grid',
  table: '',
};

// Match the grid used by the eventual content, with one loading announcement.
// Pass label={null} when a parent already announces loading (e.g. two tables side by side).
export default function ContentSkeleton({ variant = 'cards', count = 6, label = 'Loading results…' }) {
  const grid = GRID_BY_VARIANT[variant] ?? GRID_BY_VARIANT.cards;
  const status = label ? { role: 'status', 'aria-label': label } : { 'aria-hidden': true };
  return (
    <div className={`content-skeleton content-skeleton--${variant} ${grid}`} {...status}>
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-item" aria-hidden="true" key={index}>
          <span className="skeleton-line skeleton-heading" />
          <span className="skeleton-line skeleton-subtitle" />
          <div className="skeleton-values">{Array.from({ length: variant === 'picks' ? 5 : 3 }, (_, row) => <span className="skeleton-line" key={row} />)}</div>
        </div>
      ))}
    </div>
  );
}
