import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { THEME_KEY, readTheme, applyTheme, saveTheme, initializeTheme } from '../src/utils/theme.js';

const storage = value => ({ getItem: () => value });
test('saved themes override the OS; missing, invalid and blocked storage follow it', () => {
  assert.equal(readTheme(storage('dark'), true), 'dark');
  assert.equal(readTheme(storage('light'), false), 'light');
  for (const value of [null, '', 'system', '<script>']) {
    assert.equal(readTheme(storage(value), true), 'light');
    assert.equal(readTheme(storage(value), false), 'dark');
  }
  assert.equal(readTheme({ getItem() { throw Error('blocked'); } }, true), 'light');
  assert.equal(readTheme(undefined), 'dark');
});
test('applying appearance updates the root and native controls together', () => {
  const root = { dataset: {}, style: {} };
  assert.equal(applyTheme('light', root), 'light');
  assert.deepEqual(root, { dataset: { theme: 'light' }, style: { colorScheme: 'light' } });
  assert.equal(applyTheme('invalid', root), 'dark');
});
test('bootstrap matches module preference resolution before rendering', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const saved of ['light', 'dark', null, 'invalid']) {
    for (const prefersLight of [true, false]) {
      const document = { documentElement: { dataset: {}, style: {} } };
      vm.runInNewContext(script, { document, localStorage: storage(saved), matchMedia: () => ({ matches: prefersLight }) });
      assert.equal(document.documentElement.dataset.theme, readTheme(storage(saved), prefersLight));
    }
  }
});
test('switching survives blocked storage and syncs cross-tab changes', t => {
  const root = { dataset: {}, style: {} };
  const events = new EventTarget();
  let saved = 'dark';
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: root } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage: { getItem: () => saved, setItem: () => { throw Error('blocked'); } },
    matchMedia: () => ({ matches: true }),
    addEventListener: events.addEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  } });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else delete globalThis.document;
  });
  initializeTheme();
  assert.equal(root.dataset.theme, 'dark');
  let notified = 0;
  events.addEventListener('themechange', () => notified++);
  saveTheme('light');
  assert.equal(root.dataset.theme, 'light');
  assert.equal(notified, 1);
  const change = new Event('storage');
  Object.defineProperty(change, 'key', { value: THEME_KEY });
  events.dispatchEvent(change);
  assert.equal(root.dataset.theme, 'dark');
  saved = null;
  events.dispatchEvent(change);
  assert.equal(root.dataset.theme, 'light');
});
