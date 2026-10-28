import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { readFrontend as read } from './helpers.mjs';

const { getIndicatorGeometry, getNextTabIndex } = await import('../src/utils/pillNav.js').catch(() => ({}));

test('pill indicator uses the target tab offset and width including badge growth', () => {
  assert.equal(typeof getIndicatorGeometry, 'function');
  const tabs = [{ offsetLeft: 4, offsetWidth: 160 }, { offsetLeft: 168, offsetWidth: 200 }];
  assert.deepEqual(getIndicatorGeometry(tabs, 0), { x: 4, width: 160 });
  assert.deepEqual(getIndicatorGeometry(tabs, 1), { x: 168, width: 200 });
  tabs[1].offsetWidth = 220;
  assert.deepEqual(getIndicatorGeometry(tabs, 1), { x: 168, width: 220 });
});

test('pill indicator ignores an absent target', () => {
  assert.equal(typeof getIndicatorGeometry, 'function');
  assert.equal(getIndicatorGeometry([], 0), null);
  for (const index of [-1, 1, 0.5, NaN, undefined]) {
    assert.equal(getIndicatorGeometry([{ offsetLeft: 0, offsetWidth: 100 }], index), null);
  }
});

test('arrow navigation wraps without selecting tabs or handling native activation keys', () => {
  assert.equal(typeof getNextTabIndex, 'function');
  for (const [current, key, count, expected] of [
    [0, 'ArrowRight', 3, 1], [2, 'ArrowRight', 3, 0],
    [1, 'ArrowLeft', 3, 0], [0, 'ArrowLeft', 3, 2],
    [0, 'ArrowRight', 1, 0], [0, 'ArrowLeft', 0, null],
    [-1, 'ArrowRight', 2, null], [2, 'ArrowLeft', 2, null],
    [0, 'Enter', 2, null], [0, ' ', 2, null], [0, 'Tab', 2, null],
  ]) assert.equal(getNextTabIndex(current, key, count), expected);
});

test('PillNav wires accessible manual activation, pointer/focus preview, measured motion and cleanup', () => {
  assert.ok(existsSync(new URL('../src/components/PillNav.jsx', import.meta.url)), 'PillNav exists');
  const source = read('src/components/PillNav.jsx');
  for (const pattern of [/role="tablist"/, /role="tab"/, /aria-selected=/, /aria-controls=\{panelId\}/,
    /aria-hidden="true"/, /tabIndex=/, /onClick=\{.*onChange\(item.id\)/,
    /onPointerEnter=/, /pointerType === 'mouse'/, /onFocus=/, /onPointerLeave=/,
    /onBlur=/, /contains\(event.relatedTarget\)/, /getNextTabIndex/, /\.focus\(/,
    /offsetLeft/, /offsetWidth/, /translateX/, /ResizeObserver/, /observer.observe\(nav\)/,
    /observer.observe\(tab\)/, /observer\??\.disconnect\(/, /cancelAnimationFrame/,
    /requestAnimationFrame\([\s\S]*setAttribute\('data-indicator-animate'/,
  ]) assert.match(source, pattern);
  assert.ok(source.indexOf("setAttribute('data-indicator-ready'") < source.indexOf("setAttribute('data-indicator-animate'"));
});

// Compile the real JSX with the project's existing Vite compiler. A small hook
// harness supplies refs/effects; DOM sizing and observer callbacks stay controlled.
async function mountPillNav() {
  const { transformWithEsbuild } = await import('vite');
  const { runInNewContext } = await import('node:vm');
  const source = read('src/components/PillNav.jsx');
  const { code } = await transformWithEsbuild(source, 'PillNav.jsx', { jsx: 'transform', jsxFactory: 'createElement' });
  let cursor = 0;
  const hooks = [];
  const pending = [];
  const frames = new Map();
  const observers = [];
  const changed = [];
  let nextFrame = 0;
  let tree;
  const nav = {
    attributes: new Set(),
    setAttribute(name) { this.attributes.add(name); },
    removeAttribute(name) { this.attributes.delete(name); },
    contains(target) { return tabs.includes(target); },
  };
  const indicator = { style: {} };
  const tabs = [
    { offsetLeft: 4, offsetWidth: 160, focus: () => tree.children[0][0].props.onFocus() },
    { offsetLeft: 168, offsetWidth: 200, focus: () => tree.children[0][1].props.onFocus() },
  ];
  class Observer {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
    disconnect() { this.targets.clear(); }
  }
  const context = {
    getIndicatorGeometry, getNextTabIndex, ResizeObserver: Observer,
    createElement: (type, props, ...children) => ({ type, props, children }),
    useRef: initial => { const index = cursor++; return hooks[index] ??= { current: initial }; },
    useState: initial => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], value => { hooks[index] = value; }];
    },
    useLayoutEffect: (effect, deps) => {
      const index = cursor++;
      const previous = hooks[index];
      if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) {
        pending.push(() => { previous?.cleanup?.(); hooks[index] = { deps, cleanup: effect() }; });
      }
    },
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  runInNewContext(code.replace(/import[^;]+;/g, '').replace('export default function', 'function'), context);
  const props = {
    items: [{ id: 'today', label: 'Today' }, { id: 'upcoming', label: 'Upcoming' }],
    value: 'today', label: 'Game lists', idPrefix: 'lg', panelId: 'lg-panel', onChange: id => changed.push(id),
  };
  const render = () => {
    cursor = 0;
    tree = context.PillNav(props);
    tree.props.ref.current = nav;
    tree.children[0].forEach((button, i) => button.props.ref(tabs[i]));
    tree.children[1].props.ref.current = indicator;
    pending.splice(0).forEach(effect => effect());
    return tree;
  };
  return {
    render, props, tabs, nav, indicator, observers, changed, frames,
    flushFrames: () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); },
    cleanup: () => hooks.forEach(hook => hook?.cleanup?.()),
  };
}

test('PillNav places immediately, previews only mouse/focus, wraps focus and selects on native clicks', async () => {
  const h = await mountPillNav();
  let tree = h.render();
  assert.equal(tree.props.role, 'tablist');
  assert.equal(tree.children[0][0].props['aria-selected'], true);
  assert.equal(tree.children[0][0].props.tabIndex, 0);
  assert.equal(tree.children[0][1].props.tabIndex, -1);
  assert.equal(tree.children[0][1].props['aria-controls'], 'lg-panel');
  assert.equal(h.indicator.style.transform, 'translateX(4px)');
  assert.equal(h.indicator.style.width, '160px');
  assert.equal(h.nav.attributes.has('data-indicator-animate'), false);
  h.flushFrames();
  assert.equal(h.nav.attributes.has('data-indicator-animate'), true);
  tree.children[0][1].props.onPointerEnter({ pointerType: 'touch' });
  tree = h.render();
  assert.equal(h.indicator.style.transform, 'translateX(4px)');
  tree.children[0][1].props.onPointerEnter({ pointerType: 'mouse' });
  tree = h.render();
  assert.equal(h.indicator.style.transform, 'translateX(168px)');
  assert.deepEqual(h.changed, []);
  tree.props.onPointerLeave();
  tree = h.render();
  assert.equal(h.indicator.style.transform, 'translateX(4px)');
  let prevented = 0;
  tree.children[0][0].props.onKeyDown({ key: 'ArrowLeft', preventDefault: () => prevented++ });
  tree = h.render();
  assert.equal(prevented, 1);
  assert.equal(h.indicator.style.transform, 'translateX(168px)');
  assert.equal(tree.children[0][0].props['aria-selected'], true, 'Arrows move focus, not selection');
  tree.children[0][1].props.onKeyDown({ key: 'Enter', preventDefault: () => assert.fail('Native activation must not be intercepted') });
  tree.children[0][1].props.onClick();
  assert.deepEqual(h.changed, ['upcoming']);
  tree.props.onBlur({ currentTarget: h.nav, relatedTarget: h.tabs[0] });
  tree = h.render();
  assert.equal(h.indicator.style.transform, 'translateX(168px)');
  tree.props.onBlur({ currentTarget: h.nav, relatedTarget: null });
  h.render();
  assert.equal(h.indicator.style.transform, 'translateX(4px)');
  h.props.value = 'upcoming';
  h.render();
  assert.equal(h.indicator.style.transform, 'translateX(168px)');
  h.cleanup();
});

test('PillNav remeasures badge changes, handles absent selection and cancels observers/frames on unmount', async () => {
  const h = await mountPillNav();
  h.render();
  assert.deepEqual([...h.observers[0].targets], [h.nav, ...h.tabs]);
  h.tabs[0].offsetWidth = 190;
  h.observers[0].callback();
  assert.equal(h.indicator.style.width, '190px');
  h.props.value = 'missing';
  h.render();
  assert.equal(h.nav.attributes.has('data-indicator-ready'), false);
  h.cleanup();
  assert.equal(h.frames.size, 0);
  assert.ok(h.observers.every(observer => observer.targets.size === 0));
});
