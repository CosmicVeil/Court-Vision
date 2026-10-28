import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { readFrontend as read } from './helpers.mjs';

const helpers = await import('../src/utils/scrollReveal.js').catch(() => ({}));

test('already-visible elements are revealed before hiding is enabled, at the 92 percent boundary', () => {
  assert.equal(typeof helpers.isAlreadyInView, 'function');
  for (const [top, height, expected] of [[0, 1000, true], [919, 1000, true], [920, 1000, false],
    [1100, 1000, false], [-100, 1000, true], [0, 0, false], [0, -1, false],
    [0, NaN, false], [0, undefined, false], [0, Infinity, false],
  ]) assert.equal(helpers.isAlreadyInView(top, height), expected);
  assert.equal(helpers.isAlreadyInView(500, 1000, 0.5), false);
});

test('stagger delays start at zero and cap long lists', () => {
  assert.equal(typeof helpers.getRevealDelay, 'function');
  for (const [index, expected] of [[0, '0ms'], [3, '180ms'], [8, '480ms'], [20, '480ms'], [-2, '0ms']]) {
    assert.equal(helpers.getRevealDelay(index), expected);
  }
  assert.equal(helpers.getRevealDelay(7, { step: 40, cap: 3 }), '120ms');
});

test('reveal and defer observation use the specified visibility margins', () => {
  // The 0 threshold also reports targets too tall to ever reach 12% visible.
  assert.deepEqual(helpers.REVEAL_OBSERVER_OPTIONS, { threshold: [0, 0.12], rootMargin: '0px 0px -8% 0px' });
  assert.deepEqual(helpers.DEFER_OBSERVER_OPTIONS, { rootMargin: '25% 0px' });
});

test('targets reveal at the threshold, or as soon as they intersect when taller than the viewport', () => {
  assert.equal(typeof helpers.shouldReveal, 'function');
  const entry = (isIntersecting, intersectionRatio, height, rootBounds = { height: 345 }) => ({
    isIntersecting, intersectionRatio, boundingClientRect: { height }, rootBounds,
  });
  // A 4000px target on a 345px root peaks at 0.086 visible and must still reveal.
  assert.equal(helpers.shouldReveal(entry(true, 0.05, 4000)), true);
  assert.equal(helpers.shouldReveal(entry(true, 0.05, 300)), false, 'short target below the threshold waits');
  assert.equal(helpers.shouldReveal(entry(true, 0.12, 300)), true);
  assert.equal(helpers.shouldReveal(entry(false, 0, 4000)), false, 'non-intersecting tall target stays hidden');
  assert.equal(helpers.shouldReveal(entry(false, 0, 300)), false);
  assert.equal(helpers.shouldReveal(entry(true, 0.05, 4000, null)), false, 'without root bounds only the threshold applies');
});

test('ScrollReveal progressively enables motion, rescans new nodes and cleans up without scroll polling', () => {
  assert.ok(existsSync(new URL('../src/components/ScrollReveal.jsx', import.meta.url)), 'ScrollReveal exists');
  const source = read('src/components/ScrollReveal.jsx');
  for (const pattern of [/useLayoutEffect/, /typeof IntersectionObserver/, /new IntersectionObserver/,
    /setAttribute\('data-revealed'/, /unobserve\(/, /new WeakSet/, /\[scanKey\]/,
    /toggleAttribute\('data-offscreen'/, /removeAttribute\('data-motion'\)/,
    /removeAttribute\('data-motion-ready'\)/, /disconnect\(/, /return null/,
  ]) assert.match(source, pattern);
  assert.ok(source.indexOf("setAttribute('data-revealed'") < source.indexOf("setAttribute('data-motion'"));
  assert.ok(source.indexOf("setAttribute('data-motion'") < source.indexOf('void root.offsetHeight'));
  assert.ok(source.indexOf('void root.offsetHeight') < source.indexOf("setAttribute('data-motion-ready'"));
  assert.doesNotMatch(source, /addEventListener\(['"]scroll/);
  assert.doesNotMatch(source, /removeAttribute\('data-revealed'/);
});

// The component renders null; execute its layout effects against observer/DOM
// doubles so lifecycle behavior is tested offline without a browser dependency.
async function mountReveal({ observerAvailable = true } = {}) {
  const { runInNewContext } = await import('node:vm');
  const effects = [];
  const events = [];
  const nodes = [];
  const observers = [];
  const makeNode = (top, defer = true) => {
    const attributes = new Set();
    const node = {
      attributes, defer,
      getBoundingClientRect: () => ({ top }),
      hasAttribute: name => attributes.has(name),
      setAttribute: name => { attributes.add(name); events.push(name); },
      removeAttribute: name => attributes.delete(name),
      toggleAttribute: (name, force) => force ? attributes.add(name) : attributes.delete(name),
    };
    nodes.push(node);
    return node;
  };
  const root = makeNode(0, false);
  nodes.pop();
  Object.defineProperty(root, 'offsetHeight', { get() { events.push('reflow'); return 1000; } });
  class Observer {
    constructor(callback, options) { this.callback = callback; this.options = options; this.targets = new Set(); observers.push(this); }
    observe(node) { this.targets.add(node); }
    unobserve(node) { this.targets.delete(node); }
    disconnect() { this.targets.clear(); }
  }
  const context = {
    ...helpers, useLayoutEffect: effect => effects.push(effect), useRef: () => ({ current: null }),
    IntersectionObserver: observerAvailable ? Observer : undefined,
    window: { innerHeight: 1000 },
    document: {
      documentElement: root,
      querySelectorAll: selector => selector.includes('data-reveal')
        ? nodes.filter(node => !node.attributes.has('data-revealed'))
        : nodes.filter(node => node.defer),
    },
  };
  const source = read('src/components/ScrollReveal.jsx')
    .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
    .replace('export default function', 'function');
  runInNewContext(`${source}\nScrollReveal({ scanKey: 'today' });`, context);
  return { effects, events, nodes, observers, root, makeNode };
}

test('reveal lifecycle premarks visible content, rescans once, pauses offscreen targets and survives remount', async () => {
  assert.ok(existsSync(new URL('../src/components/ScrollReveal.jsx', import.meta.url)), 'ScrollReveal exists');
  const h = await mountReveal();
  const visible = h.makeNode(100);
  const below = h.makeNode(1100);
  let cleanup = h.effects[0]();
  h.effects[1]();
  assert.ok(visible.attributes.has('data-revealed'));
  assert.deepEqual(h.events.slice(0, 4), ['data-revealed', 'data-motion', 'reflow', 'data-motion-ready']);
  const [reveal, defer] = h.observers;
  assert.equal(reveal.targets.size, 1);
  assert.ok(reveal.targets.has(below));
  const seen = (isIntersecting, intersectionRatio, height = 300) => ({
    target: below, isIntersecting, intersectionRatio, boundingClientRect: { height }, rootBounds: { height: 920 },
  });
  reveal.callback([seen(false, 0)]);
  assert.equal(below.attributes.has('data-revealed'), false);
  reveal.callback([seen(true, 0.05)]);
  assert.equal(below.attributes.has('data-revealed'), false, 'short target waits for the threshold');
  assert.ok(reveal.targets.has(below));
  reveal.callback([seen(true, 0.12)]);
  assert.ok(below.attributes.has('data-revealed'));
  assert.equal(reveal.targets.size, 0);
  defer.callback([{ target: below, isIntersecting: false }]);
  assert.ok(below.attributes.has('data-offscreen'));
  defer.callback([{ target: below, isIntersecting: true }]);
  assert.equal(below.attributes.has('data-offscreen'), false);
  const later = h.makeNode(1200);
  h.effects[1]();
  assert.ok(reveal.targets.has(later));
  assert.ok(defer.targets.has(later));
  assert.equal(reveal.targets.size, 1, 'Previously revealed nodes never replay');
  cleanup();
  assert.equal(reveal.targets.size, 0);
  assert.equal(defer.targets.size, 0);
  assert.equal(h.root.attributes.has('data-motion'), false);
  assert.equal(h.root.attributes.has('data-motion-ready'), false);
  cleanup = h.effects[0]();
  h.effects[1]();
  assert.ok(h.root.attributes.has('data-motion-ready'));
  assert.ok(h.observers[2].targets.has(later));
  assert.ok(visible.attributes.has('data-revealed'));
  cleanup();
});

test('missing IntersectionObserver leaves all content visible', async () => {
  assert.ok(existsSync(new URL('../src/components/ScrollReveal.jsx', import.meta.url)), 'ScrollReveal exists');
  const h = await mountReveal({ observerAvailable: false });
  h.makeNode(1100);
  h.effects[0]();
  h.effects[1]();
  assert.equal(h.observers.length, 0);
  assert.equal(h.root.attributes.size, 0);
});
