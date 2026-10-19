/* Ngaosun Power Limited — service worker
   Makes the site installable and usable offline on iOS and Android.

   Strategy
   - Navigation (the HTML page): network-first, so a republish is picked up
     immediately; falls back to the cached page when the phone is offline.
   - Icons / manifest / other same-origin assets: stale-while-revalidate,
     served instantly from cache and refreshed in the background.
   - Anything cross-origin: passed straight through, never cached.
*/

const VERSION = 'v19';
const CACHE = 'ngaosun-' + VERSION;

/* Resolved relative to this file, so the worker keeps working whether the
   site is served from the domain root or from a sub-path. */
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './i18n.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-64.png',
  './assets/logo-mark.png',
  './assets/x1-motorbike.jpg',
  './assets/case-emotorbike-handover.jpg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      /* allSettled: one missing file must not abort the whole install */
      return Promise.allSettled(
        PRECACHE.map(function (url) {
          return cache.add(new Request(url, { cache: 'reload' }));
        })
      );
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE) return caches.delete(key);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;

  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  /* Never touch cross-origin traffic (analytics, fonts, anything else). */
  if (url.origin !== self.location.origin) return;

  /* --- page navigations: network first --- */
  if (req.mode === 'navigate') {
    event.respondWith(
      /* no-store: the host sends a 10 minute max-age on the HTML, which would
         otherwise keep serving a page from before the last publish */
      fetch(req, { cache: 'no-store' })
        .then(function (res) {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
          return res;
        })
        .catch(function () {
          return caches.match('./index.html').then(function (cached) {
            return cached || caches.match('./') || Response.error();
          });
        })
    );
    return;
  }

  /* --- other same-origin assets: stale-while-revalidate --- */
  event.respondWith(
    caches.match(req).then(function (cached) {
      const network = fetch(req)
        .then(function (res) {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        })
        .catch(function () { return cached; });

      return cached || network;
    })
  );
});
