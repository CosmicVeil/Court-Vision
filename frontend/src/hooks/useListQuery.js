import { useSearchParams } from 'react-router-dom';
import { readListQuery, writeListQuery } from '../utils/listQuery';

// The URL is the single source of truth for a list's sort, page, view and filters: the state is
// read from it on every render, and updates write back to it. `replace` keeps Back meaning
// "the previous page", not "the previous sort".
export default function useListQuery(defaults, allowed) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = readListQuery(searchParams, defaults, allowed);

  // Functional form, so two updates in one handler both apply.
  const updateQuery = patch => setSearchParams(
    current => writeListQuery({ ...readListQuery(current, defaults, allowed), ...patch }, defaults),
    { replace: true },
  );

  return [query, updateQuery];
}
