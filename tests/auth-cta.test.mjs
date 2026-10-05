import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = file => readFileSync(new URL(`../src/components/${file}`, import.meta.url), 'utf8');

test('signed-in homepage branch keeps analysis without account CTA', () => {
  const source = read('home.jsx');
  assert.match(source, /useState\(\(\) => isAuthenticated\(\)\)/);
  const branch = source.match(/\{isLoggedIn && \([\s\S]*?\n\s*\)\}/)?.[0] || '';
  assert.match(branch, /START ANALYZING/); assert.doesNotMatch(branch, /\/create-account/);
});

test('login account prompt is auth gated', () => assert.match(read('Login.jsx'), /!isAuthenticated\(\) && <p>/));
