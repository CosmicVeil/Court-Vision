import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { PRODUCTION_API_URL } from './src/config/apiUrl.js'
import { apiOriginFrom, injectCsp } from './src/config/csp.js'
import { buildSitemap, defaultHeadTags, INDEXNOW_KEY } from './src/config/seo.js'
import { ROUTES } from './scripts/prerender.mjs'

// SEO from one source (src/config/seo.js): default head tags into index.html, sitemap.xml and the
// IndexNow key file into dist/.
const seo = () => ({
  name: 'courtvision-seo',
  transformIndexHtml: () => defaultHeadTags().map(tag => ({ ...tag, injectTo: 'head' })),
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: buildSitemap() })
    this.emitFile({ type: 'asset', fileName: `${INDEXNOW_KEY}.txt`, source: INDEXNOW_KEY })
  },
  // `vite preview` only: route URLs as netlify.toml does. Prerendered routes get their own file, and
  // every other app URL gets spa.html. Without this, /predictions (no trailing slash) and /stats
  // would fall back to index.html, which is now the prerendered home page.
  configurePreviewServer(server) {
    server.middlewares.use((req, _res, next) => {
      const [path, query = ''] = req.url.split('?')
      const route = path.replace(/\/+$/, '') || '/'
      const file = ROUTES[route] || (/\.[a-z0-9]+$/i.test(route) ? null : 'spa.html')
      if (file && route !== '/') req.url = `/${file}${query ? `?${query}` : ''}`
      next()
    })
  },
})

// Content-Security-Policy <meta> for production builds only: the dev server relies on inline
// scripts and a websocket that a strict policy would block. 'post' so inline scripts are final
// before they are hashed.
const csp = (apiOrigin) => ({
  name: 'courtvision-csp',
  apply: 'build',
  transformIndexHtml: { order: 'post', handler: html => injectCsp(html, { apiOrigin }) },
})

// https://vite.dev/config/
// The CSP must allow whichever API the build will call: VITE_API_URL, else api.js's fallback.
// .env files live next to this config; resolve them from here, not from wherever the build was run.
const frontendDir = fileURLToPath(new URL('.', import.meta.url))
const apiUrlFor = mode => loadEnv(mode, frontendDir, 'VITE_').VITE_API_URL || PRODUCTION_API_URL

export default defineConfig(({ mode }) => ({
  plugins: [react(), seo(), csp(apiOriginFrom(apiUrlFor(mode)))],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      }
    }
  }
}))
