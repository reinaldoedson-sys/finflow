import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      {
        name: 'finflow-sw-server',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const rawUrl = req.url ? req.url.split('?')[0] : '';
            if (rawUrl === '/sw.js') {
              try {
                const swCode = fs.readFileSync(path.resolve(import.meta.dirname, 'public/sw.js'), 'utf-8');
                res.writeHead(200, {
                  'Content-Type': 'application/javascript; charset=utf-8',
                  'Cache-Control': 'no-store, no-cache, must-revalidate',
                  'Service-Worker-Allowed': '/'
                });
                res.end(swCode);
                return;
              } catch {
                next();
                return;
              }
            }
            if (rawUrl === '/manifest.json' || rawUrl === '/manifest.webmanifest') {
              try {
                const manifestCode = fs.readFileSync(path.resolve(import.meta.dirname, 'public/manifest.json'), 'utf-8');
                res.writeHead(200, {
                  'Content-Type': 'application/manifest+json; charset=utf-8',
                  'Cache-Control': 'no-cache'
                });
                res.end(manifestCode);
                return;
              } catch {
                next();
                return;
              }
            }
            if (rawUrl === '/api/quotes') {
              (async () => {
                try {
                  const urlObj = new URL(req.url || '', 'http://localhost:3000');
                  const symbolsParam = urlObj.searchParams.get('symbols') || '';
                  const symbols = symbolsParam
                    .split(',')
                    .map(s => s.trim().toUpperCase())
                    .filter(Boolean);

                  if (symbols.length === 0) {
                    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(JSON.stringify({ success: true, quotes: {} }));
                    return;
                  }

                  const quotes: Record<string, any> = {};
                  await Promise.all(symbols.map(async (rawSymbol) => {
                    let yahooSymbol = rawSymbol;
                    if (rawSymbol === 'BTC' || rawSymbol === 'BITCOIN') yahooSymbol = 'BTC-USD';
                    else if (rawSymbol === 'ETH' || rawSymbol === 'ETHEREUM') yahooSymbol = 'ETH-USD';
                    else if (rawSymbol === 'SOL' || rawSymbol === 'SOLANA') yahooSymbol = 'SOL-USD';
                    else if (/^[A-Z]{4}\d{1,2}$/i.test(rawSymbol) && !rawSymbol.endsWith('.SA')) {
                      yahooSymbol = `${rawSymbol}.SA`;
                    }

                    try {
                      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                      });
                      const data = await response.json();
                      const meta = data?.chart?.result?.[0]?.meta;
                      if (meta && typeof meta.regularMarketPrice === 'number') {
                        quotes[rawSymbol] = {
                          symbol: rawSymbol,
                          name: meta.shortName || meta.symbol || rawSymbol,
                          price: meta.regularMarketPrice,
                          previousClose: meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice,
                          changePercent: typeof meta.regularMarketChangePercent === 'number' ? meta.regularMarketChangePercent : 0,
                          currency: meta.currency || 'BRL',
                          updatedAt: new Date().toISOString()
                        };
                      }
                    } catch (e) {
                      // ignore individual ticker fetch errors
                    }
                  }));

                  res.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=30'
                  });
                  res.end(JSON.stringify({ success: true, quotes, timestamp: new Date().toISOString() }));
                } catch (err: any) {
                  res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                  res.end(JSON.stringify({ success: false, error: err.message }));
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
        registerType: 'autoUpdate',
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
