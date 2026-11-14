import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { buildSitemap, defaultHeadTags } from './src/config/seo.js'

// SEO from one source (src/config/seo.js): default head tags into index.html, sitemap.xml into dist/.
const seo = () => ({
  name: 'courtvision-seo',
  transformIndexHtml: () => defaultHeadTags().map(tag => ({ ...tag, injectTo: 'head' })),
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: buildSitemap() })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), seo()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
