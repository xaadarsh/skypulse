import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// API target can be overridden (the QA suite runs its own backend with a separate database)
const api = process.env.SKYPULSE_API ?? 'http://127.0.0.1:8000'
const proxy = { '/api': { target: api, rewrite: (p: string) => p.replace(/^\/api/, '') } }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: Number(process.env.PORT ?? 5173), strictPort: !!process.env.PORT, proxy },
  preview: { port: Number(process.env.PORT ?? 5173), strictPort: !!process.env.PORT, proxy },
  build: { chunkSizeWarningLimit: 1600 },
})
