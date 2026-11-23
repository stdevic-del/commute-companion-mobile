const CACHE_NAME = 'commute-companion-v4.63';
const OFFLINE_BRIEFING_URL = '/__offline_briefing_package.json';
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
            })
          )
        )
      )
  );
});

// Prima kompletan tekstualni paket aktivnog brifinga (vesti, struja/voda servisi, vreme) i čuva ga u Cache API
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'CACHE_BRIEFING_PACKAGE' || !data.payload) return;

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        const body = JSON.stringify(data.payload);
        const response = new Response(body, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'X-Offline-Cached': '1',
          },
        });
        return cache.put(new Request(OFFLINE_BRIEFING_URL), response);
      })
      .catch(() => {})
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 0) Direktno čitanje keširanog tekstualnog paketa aktivnog brifinga iz Cache API
  if (url.pathname.endsWith(OFFLINE_BRIEFING_URL)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(new Request(OFFLINE_BRIEFING_URL));
        return (
          cached ||
          new Response(JSON.stringify({ cached: false }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      })
    );
    return;
  }

  // Never intercept cross-origin audio TTS streams or OpenStreetMap tile servers
  if (
    url.hostname.includes('translate.google.com') ||
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('openstreetmap.org')
  ) {
    return;
  }

  // 1) Stale-While-Revalidate for precomputed static news-feed JSON (< 200ms + offline support)
  if (
    url.hostname === 'raw.githubusercontent.com' &&
    url.pathname.includes('/news-feed/') &&
    url.pathname.endsWith('.json')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req, { ignoreSearch: true });
        const networkPromise = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              cache.put(req, res.clone());
            }
            return res;
          })
          .catch(() => cached);

        return cached || networkPromise;
      })
    );
    return;
  }

  // 2) Network-First with Cache fallback for HTML navigation, app bundles, live service JSON, weather, and OSRM routing
  if (
    req.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.includes('/assets/') ||
    url.pathname.endsWith('/data/servisi.json') ||
    url.pathname.endsWith('/servisi.json') ||
    url.pathname.endsWith('/feed.json') ||
    url.hostname.includes('api.open-meteo.com') ||
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

  // 3) Cache-first with background refresh for icons, fonts, and wsrv.nl optimized WebP thumbnails
  if (
    url.origin === self.location.origin ||
    url.hostname === 'wsrv.nl' ||
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
