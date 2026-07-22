/* NAZAR - Production PWA Service Worker Pre-Caching System */

const CACHE_NAME = 'nazar-vision-cache-v42';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css?v=42',
  '/app.js?v=42',
  '/detection-worker.js',
  '/manifest.json',
  '/nazar_icon.png'
];

// Install Event - Pre-cache core local assets only
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Pre-caching Core Assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up stale cache names
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing Stale Cache ', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Cache-First strategy for static assets & pre-cached CDN/Model payloads
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Never cache API endpoint requests
  if (url.includes('/api/')) {
    return;
  }

  // Intercept CDN library files & Google storage model weights
  if (url.includes('cdn.jsdelivr.net') || url.includes('storage.googleapis.com') || url.includes('github.io')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse; // Cache hit: return immediately
        }

        // Cache miss: fetch from network and dynamically cache
        return fetch(event.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        }).catch((err) => {
          console.warn("Failed to fetch asset from network: ", url, err);
          return new Response(JSON.stringify({ error: 'Offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        });
      })
    );
  } else {
    // Standard network request with cache fallback
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});
