const CACHE_NAME = 'hkk-pwa-v1';

const STATIC_ASSETS = [
  '/',
  '/site.webmanifest',
  '/favicon-32.png',
  '/logo-192.png',
  '/logo-512.png',
  '/apple-touch-icon.png'
];

// Install: pre-cache critical shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA: Failed to cache some static assets during install', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: network pass-through for API calls, caching for app shell and assets
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never intercept non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Critical Safety: NEVER cache or intercept /api/* financial endpoints
  if (url.origin !== self.origin || url.pathname.startsWith('/api')) {
    return;
  }

  // Handle navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          const rootCached = await caches.match('/');
          if (rootCached) {
            return rootCached;
          }
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline | HisabKi Kitab</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:sans-serif;text-align:center;padding:40px;background:#f4f8ff;color:#1e293b;"><h2>Aap offline hain</h2><p>Internet connection check karein aur dobara koshish karein.</p></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }

  // Handle static assets (scripts, styles, images, fonts)
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|webp|woff2|woff|ttf|ico|json)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
