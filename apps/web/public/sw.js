/*
 * Atlas service worker — offline app shell + runtime caching.
 *
 * Same-origin GETs only, and NEVER /api/*. The header comment used to say the
 * API is a different origin — it is not. In production Caddy serves the API at
 * /api/* on the SAME origin, which is the whole reason the session cookie
 * works, so the origin check below skipped nothing and every API call went
 * through here.
 *
 * That broke the Google OAuth callback in a way that looked nothing like the
 * cause: Google redirects the browser to /api/connectors/google/callback, which
 * is a NAVIGATION, and the API answers it with a 302 on to /settings. The SW's
 * fetch() follows that redirect, and the browser refuses a redirected response
 * for a navigation request — so the promise rejected, the catch ran, and the
 * user was shown the offline page while perfectly online.
 *
 * Navigations are network-first with an offline fallback; static assets are
 * stale-while-revalidate.
 */
const CACHE = 'atlas-v3';
const PRECACHE = ['/offline.html', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Web Push: show the notification the API sent.
self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // A push that isn't JSON still deserves a generic notification.
    data = {};
  }
  const title = data.title || 'Atlas';
  const options = {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { url: data.url || '/today' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping a notification focuses an open Atlas tab or opens one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/today';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ('focus' in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // cross-origin is not ours
  // The API is same-origin in production. It must never be cached, and its
  // redirects must reach the browser untouched.
  if (url.pathname.startsWith('/api/')) return;

  // Page navigations: fresh HTML when online, the offline shell when not.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/offline.html').then((r) => r || Response.error()),
      ),
    );
    return;
  }

  // Anything with a query string is a DYNAMIC read, never a static asset.
  //
  // This is what took the live site down with "a client-side exception has
  // occurred". The App Router fetches its React payloads as ordinary GETs —
  // `/today?_rsc=1a2b3c` — which are same-origin, not /api/, and not a
  // navigation, so they fell into the stale-while-revalidate branch below and
  // were cached by URL. Deploy a new build and the SAME url now answers with a
  // payload from a build whose chunks no longer exist, `cached || network`
  // hands the old one straight back, and React throws on the mismatch. Serving
  // yesterday's payload is not a cache hit, it is a wrong answer.
  if (url.search) return;

  // Only real static files are worth caching, and only the immutable ones.
  // `/_next/static/*` is content-hashed, so a cached copy can never be stale:
  // a changed file is a changed URL. Everything else goes to the network.
  const immutable = url.pathname.startsWith('/_next/static/');
  const asset = /\.(js|css|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif|ico|webmanifest)$/i.test(
    url.pathname,
  );
  if (!immutable && !asset) return;

  // Serve cached immediately, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
