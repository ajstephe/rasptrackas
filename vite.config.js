import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // ── offline resilience ────────────────────────────────────────────────
    // manifest.json + icons already exist and are linked by hand in
    // index.html — this only adds the missing piece, a service worker that
    // precaches the app shell so opening it with no signal shows your
    // last-synced data instead of a blank/failed load. manifest:false keeps
    // the hand-written manifest.json as the single source of truth instead
    // of generating a second one. registerType:'prompt' (not autoUpdate) so
    // an update never swaps the running app out from under an in-progress
    // shift entry — App.jsx surfaces it as a toast the person acts on.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      includeAssets: ['apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'maskable-512x512.png', 'manifest.json'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
