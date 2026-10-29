import { useId } from 'react';
import { toFilterOptions } from '../utils/pagination';
import './FilterBar.css';

// One filter row for list pages: a search box, any number of selects, and Clear Filters.
// It holds no state: the page passes each value and handler, so list state stays in the URL
// (useListQuery) and the search draft stays with the page.
//   search:  { value, onChange, placeholder }
//   filters: [{ key, label, value, onChange, allLabel, options }]
export default function FilterBar({ search, filters = [], onClear, label = 'Filter players' }) {
  const id = useId();

  return (
    <div className="fb" role="search" aria-label={label}>
      {search && (
        <div className="fb-field fb-field--search">
          <label className="fb-label" htmlFor={`${id}-search`}>Search</label>
          <input
            id={`${id}-search`}
            type="search"
            className="fb-control"
            placeholder={search.placeholder || 'Search players...'}
            value={search.value}
            onChange={search.onChange}
            autoComplete="off"
          />
        </div>
      )}

      {filters.map(filter => (
        <div className="fb-field" key={filter.key}>
          <label className="fb-label" htmlFor={`${id}-${filter.key}`}>{filter.label}</label>
          <select
            id={`${id}-${filter.key}`}
            className="fb-control fb-select"
            value={filter.value}
            onChange={filter.onChange}
          >
            <option value="">{filter.allLabel}</option>
            {toFilterOptions(filter.options).map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      ))}

      <button type="button" className="fb-clear" onClick={onClear}>
        Clear Filters
      </button>
    </div>
  );
}
