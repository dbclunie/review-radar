// Review Radar service worker — enables offline use and "Add to Home Screen".
// Bump CACHE_NAME whenever index.html changes so clients pick up the new version.
const CACHE_NAME = 'review-radar-v1';

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
  // snapshots all need to hit the network fresh every time. Caching these would
  // mean showing stale or wrong map data, which is worse than just failing offline.
  const isLiveMapOrGeoCall =
    url.includes('nominatim.openstreetmap.org') ||
    url.includes('tile.openstreetmap.org') ||
    url.includes('staticmap.openstreetmap.de');
  if (isLiveMapOrGeoCall) {
    event.respondWith(fetch(event.request));
    return;
  }

  // App shell + libraries: cache-first, so the app opens instantly and works
  // offline. Falls back to network for anything not already cached.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Only cache successful, same-origin-or-known-CDN responses
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
      // No offline fallback here — 'cached' is already known to be empty at this
      // point, so silently returning it again would be dead code, not a real
      // fallback. A genuine offline-first fallback page could be added later.
    })
  );
});
