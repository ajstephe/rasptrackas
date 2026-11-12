import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Vercel sets VERCEL_ENV to production / preview at build time; the app
  // uses it to allow demo-only switches (e.g. ?festive) on previews only.
  define: { __VERCEL_ENV__: JSON.stringify(process.env.VERCEL_ENV || 'development') },
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
        // The spreadsheet library is ~40% of the app's size but only used for
        // Excel export, so it isn't downloaded with every install/update; it's
        // fetched the first time someone exports, then kept for offline use.
        globIgnores: ['**/exceljs*'],
        runtimeCaching: [{
          // Self-hosted fonts: each one downloads the first time a theme uses
          // it, then stays cached for offline use.
          urlPattern: ({ url }) => url.pathname.startsWith('/fonts/') && url.pathname.endsWith('.woff2'),
          handler: 'CacheFirst',
          options: { cacheName: 'fonts', expiration: { maxEntries: 120 } },
        }, {
          urlPattern: ({ url }) => /\/assets\/exceljs[^/]*\.js$/.test(url.pathname),
          handler: 'CacheFirst',
          options: { cacheName: 'exceljs', expiration: { maxEntries: 2 } },
        }],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
