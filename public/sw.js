// FinFlow Service Worker - Resilient Network-First Strategy
const CACHE_NAME = 'finflow-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-maskable.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn(`[SW] Precache skipped for ${asset}:`, err);
          })
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              console.log(`[SW] Purging old cache: ${key}`);
              return caches.delete(key);
            }
          })
        );
      })
    ])
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Bypass external APIs and Firebase
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('identitytoolkit') ||
    url.pathname.startsWith('/api/') ||
    url.protocol === 'chrome-extension:'
  ) {
    return;
  }

  // Bypass Vite dev modules (always fetch directly, never stale-cache)
  if (
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/@fs') ||
    url.pathname.startsWith('/@id') ||
    url.pathname.startsWith('/src/') ||
    url.searchParams.has('t') ||
    url.searchParams.has('v')
  ) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response('Network unavailable', { status: 503, statusText: 'Service Unavailable' });
      })
    );
    return;
  }

  // 1. Navigation requests (HTML): NETWORK FIRST with cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>FinFlow</title></head><body style="background:#0b0f17;color:#fff;text-align:center;padding:40px;font-family:sans-serif;"><h2>FinFlow está offline</h2><p>Verifique sua conexão à internet.</p><button onclick="window.location.reload()" style="background:#10b981;border:none;color:#000;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:bold;">Recarregar</button></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // 2. Static Assets: Stale-While-Revalidate with safe fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          return cachedResponse || new Response('', { status: 408, statusText: 'Request Timed Out' });
        });

      return cachedResponse || fetchPromise;
    })
  );
});
