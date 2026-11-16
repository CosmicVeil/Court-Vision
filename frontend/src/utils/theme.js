export const THEME_KEY = 'courtvision-theme';
export const isTheme = value => value === 'light' || value === 'dark';

export function readTheme(storage, prefersLight = false) {
  try {
    const saved = storage?.getItem(THEME_KEY);
    if (isTheme(saved)) return saved;
  } catch { /* Private browsing can deny storage. */ }
  return prefersLight ? 'light' : 'dark';
}

export function applyTheme(theme, root = document.documentElement) {
  const next = isTheme(theme) ? theme : 'dark';
  root.dataset.theme = next;
  root.style.colorScheme = next;
  return next;
}

export function saveTheme(theme) {
  const next = applyTheme(theme);
  try { window.localStorage.setItem(THEME_KEY, next); } catch { /* Keep in-memory choice. */ }
  window.dispatchEvent(new Event('themechange'));
}

export function initializeTheme() {
  let storage;
  try { storage = window.localStorage; } catch { /* Storage may be inaccessible. */ }
  applyTheme(readTheme(storage, window.matchMedia?.('(prefers-color-scheme: light)').matches));
  window.addEventListener('storage', event => {
    if (event.key === THEME_KEY || event.key === null) {
      applyTheme(readTheme(storage, window.matchMedia?.('(prefers-color-scheme: light)').matches));
      window.dispatchEvent(new Event('themechange'));
    }
  });
}
