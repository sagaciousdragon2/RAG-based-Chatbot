import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,        // Listen on all interfaces (0.0.0.0), required for ngrok
    port: 5173,
    allowedHosts: [
      'all',           // Allow any host — covers all ngrok URLs automatically
      '.ngrok-free.app',
      '.ngrok.io',
      '.ngrok-free.dev',
    ]
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: ['all'],
  }
})
