const CACHE_NAME = 'commute-companion-v4.0';
const CORE_ASSETS = [
  './manifest.json',
  './icon.svg',
  './data/servisi.json',
  './data/ulice_beograd.json',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS).catch(() => {});
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: 'window' }).then((windowClients) =>
          Promise.all(
            windowClients.map(async (client) => {
              try {
                client.postMessage({ type: 'SW_ACTIVATED', version: CACHE_NAME });
              } catch {
                // ignore
              }
              try {
                if ('navigate' in client && client.url) {
                  await client.navigate(client.url);
                }
              } catch {
                // ignore
              }
            })
          )
        )
      )
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept cross-origin audio TTS streams
  if (url.hostname.includes('translate.google.com')) {
    return;
  }

  // 1) Strictly Network-First (no-store) for HTML navigation, app bundles, live service JSON, and OSRM routing
  if (
    req.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.includes('/assets/') ||
    url.pathname.endsWith('/data/servisi.json') ||
    url.hostname.includes('project-osrm.org')
  ) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  // 2) Cache-first with background refresh for icons, fonts, and OSM map tiles
  if (
    url.origin === self.location.origin ||
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    );
  }
});
