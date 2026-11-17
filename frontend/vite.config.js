import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { PRODUCTION_API_URL } from './src/config/apiUrl.js'
import { apiOriginFrom, injectCsp } from './src/config/csp.js'
import { buildSitemap, defaultHeadTags } from './src/config/seo.js'

// SEO from one source (src/config/seo.js): default head tags into index.html, sitemap.xml into dist/.
const seo = () => ({
  name: 'courtvision-seo',
  transformIndexHtml: () => defaultHeadTags().map(tag => ({ ...tag, injectTo: 'head' })),
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: buildSitemap() })
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
const apiUrlFor = mode => loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL || PRODUCTION_API_URL

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
