// Keep in sync with the version shown in the header of index.html
const CACHE_NAME = 'smartlearn-cache-v38';
const urlsToCache = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

// The design files the page loads from CDNs. Cached at install too: on the first visit the page loads them before
// this worker runs, so otherwise the app would look broken offline until a second visit.
const CDN_FILES = [
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.all([
      cache.addAll(urlsToCache),
      // Best effort, at most 10 s each: a CDN that is down or hangs must not hold up the install (the page caches
      // them later too). CORS (these CDNs allow it) so an error page can be told apart and isn't cached.
      ...CDN_FILES.map(url => Promise.race([
        fetch(url, { mode: 'cors' }).then(response => { if (response.ok) return cache.put(url, response); }).catch(() => {}),
        new Promise(resolve => setTimeout(resolve, 10000))
      ]))
    ]))
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
        // ignoreVary: copies cached at install were requested by this worker, not the page (other headers)
        cache.match(event.request, { ignoreVary: true }).then(cached => {
          const network = fetch(event.request)
            .then(response => {
              // Opaque (no-cors) responses have status 0 but are still usable - though they may be an error page,
              // so one never replaces a copy we have
              if (response && (response.ok || (response.type === 'opaque' && !cached))) cache.put(event.request, response.clone());
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
  // Every page URL is the app itself - also the links with ?open=... from reminders and notifications,
  // so offline they open the cached app instead of the browser's error page
  const isPage = event.request.mode === 'navigate';
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            const isApp = isPage && (response.headers.get('Content-Type') || '').includes('text/html');
            caches.open(CACHE_NAME).then(cache => cache.put(isApp ? './' : event.request, responseToCache));
        }
        return response;
      })
      .catch(() => caches.match(isPage ? './' : event.request))
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
