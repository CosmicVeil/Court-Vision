import assert from 'node:assert/strict';
import test from 'node:test';
import { readSource as read } from './helpers.mjs';

test('signed-in homepage keeps analysis without account CTA', () => {
  const source = read('Home.jsx');
  assert.match(source, /useState\(\(\) => isAuthenticated\(\)\)/);
  // One closing section: START ANALYZING is unconditional, only the account link is gated.
  const actions = source.match(/<div className="home-cta-actions"[\s\S]*?\n\s*<\/div>/)?.[0] || '';
  const gated = actions.match(/\{!isLoggedIn && \([\s\S]*?\)\}/)?.[0] || '';
  assert.match(actions.replace(gated, ''), /START ANALYZING/); assert.doesNotMatch(actions.replace(gated, ''), /\/create-account/);
  assert.match(gated, /to="\/create-account"/);
});

test('login account prompt is auth gated', () => assert.match(read('Login.jsx'), /!isAuthenticated\(\) && <p>/));
