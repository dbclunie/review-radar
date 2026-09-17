// Review Radar service worker — enables offline use and "Add to Home Screen".
//
// CACHE_NAME is bumped on this push specifically to purge whatever stale index.html
// is already sitting in existing installs' caches (the real bug this fixes: the old
// version cached the HTML itself cache-first with a CACHE_NAME that never changed,
// so updates never reached anyone who'd already visited once).
const CACHE_NAME = 'review-radar-v2';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Never cache live network calls — map tiles, geocoding/search, and static map
  // snapshots all need to hit the network fresh every time.
  const isLiveMapOrGeoCall =
    url.includes('nominatim.openstreetmap.org') ||
    url.includes('tile.openstreetmap.org') ||
    url.includes('staticmap.openstreetmap.de');
  if (isLiveMapOrGeoCall) {
    event.respondWith(fetch(event.request));
    return;
  }

  // The app's own HTML document is where every real update lives, so it must never
  // be served stale-by-default. Network-first: always try the live network copy
  // when online, and only fall back to whatever's cached if the network fails
  // (genuinely offline). This is the actual fix — CACHE_NAME rotation alone only
  // clears the *existing* stale copy, it doesn't stop this same bug recurring on
  // the next update if the document itself stayed cache-first.
  const isAppDocument =
    event.request.mode === 'navigate' ||
    url.endsWith('/') || url.endsWith('/index.html');
  if (isAppDocument) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Genuinely static assets (icons, manifest, pinned-version CDN libraries) rarely
  // if ever change, so cache-first here is correct and keeps the app opening fast.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
