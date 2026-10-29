// Keep in sync with the version shown in the header of index.html
const CACHE_NAME = 'smartlearn-cache-v33';
const urlsToCache = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Cache storage is shared by every app on itaigree.github.io, so only delete our own old caches
          if (cacheName.startsWith('smartlearn-cache-') && cacheName !== CACHE_NAME) return caches.delete(cacheName);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Design files the app loads from CDNs (Tailwind, fonts, icons). Kept in the cache so already-written
// lessons can be read without internet; served from cache and refreshed in the background.
const CDN_HOSTS = ['cdn.tailwindcss.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          const network = fetch(event.request)
            .then(response => {
              // Opaque (no-cors) responses have status 0 but are still usable
              if (response && (response.ok || response.type === 'opaque')) cache.put(event.request, response.clone());
              return response;
            })
            .catch(() => cached);
          event.waitUntil(network.catch(() => {})); // let the background refresh finish
          return cached || network;
        })
      )
    );
    return;
  }

  // Let API calls (e.g. Gemini) and anything else from other origins go straight to the network
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Clicking a "ready" notification brings the app to the front and opens the syllabus / lesson
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const open = (event.notification.data && event.notification.data.open) || '';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find(c => c.url.startsWith(self.registration.scope));
    if (client) {
      await client.focus();
      client.postMessage({ type: 'notification-click', open });
    } else {
      await self.clients.openWindow(self.registration.scope + (open ? '?open=' + encodeURIComponent(open) : ''));
    }
  })());
});
