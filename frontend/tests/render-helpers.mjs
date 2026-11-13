import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { readFrontend } from './helpers.mjs';

// Use Vite's installed esbuild to load real JSX and extensionless imports in Node.
// Everything stays in memory: no dev server, generated files, CSS or image requests.
export function loadFrontendModule(path, extraExports = [], moduleOverrides = {}) {
  const filename = fileURLToPath(new URL(`../${path}`, import.meta.url));
  const result = buildSync({
    stdin: {
      contents: readFrontend(path) + (extraExports.length ? `\nexport { ${extraExports.join(', ')} };` : ''),
      sourcefile: filename,
      resolveDir: dirname(filename),
      loader: 'jsx',
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': '{"DEV":true}' },
  });
  const module = { exports: {} };
  const require = createRequire(import.meta.url);
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    name => Object.hasOwn(moduleOverrides, name) ? moduleOverrides[name] : require(name),
    module, module.exports,
  );
  return module.exports;
}

export function renderComponent(Component, props) {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/games/test'] },
    createElement(Component, props)));
}
