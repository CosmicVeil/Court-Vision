import { getPaginationView } from '../utils/pagination';
import './Pagination.css';

// Previous / "Page X of Y" + range / Next. The page decides what a page change does
// (onPageChange), so it can update the URL and scroll back to its own results.
export default function Pagination({ page, totalPages, totalItems, pageSize, itemLabel, onPageChange }) {
  const view = getPaginationView({ page, totalPages, totalItems, pageSize, itemLabel });

  return (
    <nav className="pager" aria-label="Pagination">
      <div className="pager-bar">
        <button
          type="button"
          className="pager-btn pager-btn--prev"
          onClick={() => onPageChange(view.previousPage)}
          disabled={view.previousDisabled}
          aria-label="Previous page"
        >
          <span aria-hidden="true">←</span> Previous
        </button>

        <div className="pager-info">
          <div className="pager-page" data-numeric>
            Page <span className="pager-current" aria-current="page">{view.page}</span> of <span className="pager-total">{view.totalPages}</span>
          </div>
          <div className="pager-range" data-numeric>{view.rangeLabel}</div>
        </div>

        <button
          type="button"
          className="pager-btn pager-btn--next"
          onClick={() => onPageChange(view.nextPage)}
          disabled={view.nextDisabled}
          aria-label="Next page"
        >
          Next <span aria-hidden="true">→</span>
        </button>
      </div>
    </nav>
  );
}
