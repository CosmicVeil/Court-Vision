import assert from 'node:assert/strict';
import test from 'node:test';
import { readSource as read } from './helpers.mjs';

test('signed-in homepage branch keeps analysis without account CTA', () => {
  const source = read('Home.jsx');
  assert.match(source, /useState\(\(\) => isAuthenticated\(\)\)/);
  const branch = source.match(/\{isLoggedIn && \([\s\S]*?\n\s*\)\}/)?.[0] || '';
  assert.match(branch, /START ANALYZING/); assert.doesNotMatch(branch, /\/create-account/);
});

test('login account prompt is auth gated', () => assert.match(read('Login.jsx'), /!isAuthenticated\(\) && <p>/));
