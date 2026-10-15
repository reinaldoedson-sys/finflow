import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { getQuotes, normalizeSymbols } from './server/quotes.ts';

export default defineConfig(() => {
  return {
    plugins: [
      {
        name: 'finflow-sw-server',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const rawUrl = req.url ? req.url.split('?')[0] : '';
            if (rawUrl === '/api/quotes') {
              (async () => {
                try {
                  const urlObj = new URL(req.url || '', 'http://localhost:3000');
                  const symbolsParam = urlObj.searchParams.get('symbols') || '';
                  const symbols = normalizeSymbols(symbolsParam);

                  if (symbols.length === 0) {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: true, quotes: {}, timestamp: new Date().toISOString() }));
                    return;
                  }

                  const quotes = await getQuotes(symbols);

                  res.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'public, max-age=30'
                  });
                  res.end(JSON.stringify({ success: true, quotes, timestamp: new Date().toISOString() }));
                } catch (err: any) {
                  res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                  res.end(JSON.stringify({ success: false, error: err?.message || 'Internal error' }));
                }
              })();
              return;
            }
            next();
          });
        }
      },
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: [
          'favicon.ico',
          'apple-touch-icon.png',
          'icon.svg',
          'icon-maskable.svg',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png'
        ],
        manifest: {
          id: '/',
          name: 'FinFlow - Gestão Financeira',
          short_name: 'FinFlow',
          description: 'Aplicativo de gestão de finanças pessoais com alta segurança, controle de despesas e sincronização em nuvem.',
          theme_color: '#0b0f17',
          background_color: '#0b0f17',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        workbox: {
          cleanupOutdatedCaches: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\/.*/],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^\/api\/.*/i,
              handler: 'NetworkOnly'
            },
            {
              urlPattern: /^https:\/\/.*(?:firebaseio\.com|googleapis\.com|firestore|identitytoolkit).*/i,
              handler: 'NetworkOnly'
            }
          ]
        },
        devOptions: {
          enabled: false
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.')
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {}
    }
  };
});
