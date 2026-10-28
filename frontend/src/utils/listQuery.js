// List pages (Stats, Predictions) keep their sort, page, view and filters in the query string,
// so a refresh, a shared link or Back returns to the same list. `defaults` lists every key and
// its type (a number means a page number); `allowed` restricts keys to known values.

export function readListQuery(search, defaults, allowed = {}) {
  const params = new URLSearchParams(search);
  const state = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const raw = params.get(key);
    if (raw === null || raw === '') continue;
    if (typeof defaults[key] === 'number') {
      const number = Number(raw);
      if (Number.isInteger(number) && number >= 1) state[key] = number;
    } else if (!allowed[key] || allowed[key].includes(raw)) {
      state[key] = raw;
    }
  }
  return state;
}

// Only values that differ from the defaults go in the URL, so the plain page stays /stats.
export function writeListQuery(state, defaults) {
  const params = new URLSearchParams();
  for (const key of Object.keys(defaults)) {
    if (state[key] !== undefined && state[key] !== defaults[key]) params.set(key, String(state[key]));
  }
  return params.toString();
}
