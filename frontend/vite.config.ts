/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  appType: 'spa',
  server: {
    host: '0.0.0.0',
    port: 3634,
    allowedHosts: ['_all', 'frontend', 'backend'],
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: process.env['VITE_BACKEND_URL'] ?? 'http://localhost:3635',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'spa-fallback',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = (req.url ?? '/').split('?')[0]
          const isSpaRoute = !url.startsWith('/api/') && !url.startsWith('/@') && !url.includes('.')
          if (!isSpaRoute) { next(); return }
          const root = server.config.root
          const raw = fs.readFileSync(path.join(root, 'index.html'), 'utf-8')
          server.transformIndexHtml(req.url!, raw).then(html => {
            res.statusCode = 200
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(html)
          }).catch(next)
        })
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = (req.url ?? '/').split('?')[0]
          if (!url.startsWith('/api/') && !url.startsWith('/@') && !url.includes('.')) {
            const indexHtml = fs.readFileSync(path.resolve(__dirname, 'dist/index.html'), 'utf-8')
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.statusCode = 200
            res.end(indexHtml)
            return
          }
          next()
        })
      },
    },
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
