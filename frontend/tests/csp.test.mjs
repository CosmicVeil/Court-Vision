import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { apiOriginFrom, buildCsp, injectCsp, inlineScriptHashes } from '../src/config/csp.js';

const directive = (policy, name) => policy.split('; ').find(part => part.startsWith(`${name} `));

test('scripts only run from our origin, hashed inline scripts and Google Analytics', () => {
  const policy = buildCsp({ apiOrigin: 'https://api.example', inlineScriptHashes: ['sha256-abc'] });
  assert.equal(directive(policy, 'script-src'), "script-src 'self' 'sha256-abc' https://*.googletagmanager.com");
  assert.doesNotMatch(directive(policy, 'script-src'), /unsafe-inline|unsafe-eval/);
  assert.equal(directive(policy, 'object-src'), "object-src 'none'");
});

test('requests can only reach our API and analytics', () => {
  const connect = directive(buildCsp({ apiOrigin: 'https://api.example' }), 'connect-src');
  assert.match(connect, /^connect-src 'self' https:\/\/api\.example /);
  assert.equal(directive(buildCsp({ apiOrigin: null }), 'connect-src').includes('null'), false);
});

test('images are limited to the NBA and ESPN CDNs, not any https host', () => {
  const img = directive(buildCsp({}), 'img-src');
  assert.match(img, /https:\/\/cdn\.nba\.com/);
  assert.match(img, /https:\/\/\*\.espncdn\.com/);
  assert.doesNotMatch(img, / https: /);
});

test('inline script hashes match the exact script body and skip external scripts', () => {
  const body = '\n  window.x = 1;\n';
  const html = `<script>${body}</script><script type="module" src="/a.js"></script><script></script>`;
  const expected = `sha256-${createHash('sha256').update(body).digest('base64')}`;
  assert.deepEqual(inlineScriptHashes(html), [expected]);
});

test('an inline script with a data-src attribute is still hashed', () => {
  assert.equal(inlineScriptHashes('<script data-src="x">init()</script>').length, 1);
  assert.equal(inlineScriptHashes('<script\nsrc="/a.js"></script>').length, 0);
});

test('API origin is taken from VITE_API_URL with or without the /api suffix', () => {
  assert.equal(apiOriginFrom('https://court-vision.onrender.com/api'), 'https://court-vision.onrender.com');
  assert.equal(apiOriginFrom(''), null);
  assert.equal(apiOriginFrom('not a url'), null);
});

test('CSP meta is injected after charset and before the first script', () => {
  const html = '<html><head>\n<meta charset="UTF-8" />\n<script>a()</script></head></html>';
  const out = injectCsp(html, { apiOrigin: null });
  const csp = out.indexOf('Content-Security-Policy');
  assert.ok(out.indexOf('charset') < csp && csp < out.indexOf('<script>'));
  assert.match(out, new RegExp(inlineScriptHashes(html)[0].replace(/[+/=]/g, '\\$&')));
});

test("the CSP allows api.js's production fallback when VITE_API_URL is unset", async () => {
  const { PRODUCTION_API_URL } = await import("../src/config/apiUrl.js");
  const api = readFileSync(new URL("../src/config/api.js", import.meta.url), "utf8");
  const viteConfig = readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
  assert.match(api, /return PRODUCTION_API_URL;/);
  assert.doesNotMatch(api, /onrender\.com/);
  assert.match(viteConfig, /VITE_API_URL \|\| PRODUCTION_API_URL/);
  assert.match(buildCsp({ apiOrigin: apiOriginFrom(PRODUCTION_API_URL) }), /connect-src [^;]*https:\/\/court-vision-zxuj\.onrender\.com/);
});
