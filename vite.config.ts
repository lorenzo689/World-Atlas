import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The Spring Boot backend (http://localhost:8080) is reached through the dev/preview server, so the
// browser only ever talks to one origin: no CORS in development and the WebSocket works on /ws.
const backend = process.env.BACKEND_URL ?? 'http://localhost:8080'
const proxy = {
  '/api': { target: backend, changeOrigin: true },
  '/ws': { target: backend, ws: true, changeOrigin: true },
  '/swagger-ui': { target: backend, changeOrigin: true },
  '/v3/api-docs': { target: backend, changeOrigin: true },
}

export default defineConfig({
  base: process.env.VITE_STATIC_DEMO === 'true' ? '/World-Atlas/' : '/',
  plugins: [react(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'jsdom',
    // JSDOM workers are memory-heavy; bounding them avoids startup timeouts on developer machines.
    maxWorkers: 2,
    testTimeout: 10000,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    globals: false,
  },
})
