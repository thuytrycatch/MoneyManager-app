/* =====================================================================
 *  sw.js — Service worker for "Sổ Thu Chi" (PWA: installable + offline)
 * ---------------------------------------------------------------------
 *  Caches ONLY the static app shell + public CDN libraries/fonts so the
 *  app opens offline and shows the last-loaded data (from IndexedDB).
 *
 *  SECURITY — never cached, always straight to the network:
 *    • the Supabase project API  (*.supabase.co — your household's data + auth)
 *    • the Claude API            (api.anthropic.com)
 *    • the Gemini API            (generativelanguage.googleapis.com)
 *    • config.js                 (may hold API keys when running locally)
 *  This prevents another person on a shared device from reading cached data,
 *  and keeps secrets out of the Cache Storage.
 * ===================================================================== */
'use strict';

// Bump VERSION whenever this file changes → old caches are purged on activate.
const VERSION = 'v4';
const CACHE = 'sotc-' + VERSION;

// Cross-origin hosts whose PUBLIC assets are safe to cache (no auth, no secrets).
const CACHEABLE_HOSTS = [
  'cdnjs.cloudflare.com', // Chart.js
  'cdn.jsdelivr.net',     // @supabase/supabase-js (the library, NOT your data)
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// Requests that must NEVER be stored (authenticated data or secrets).
function isSensitive(url) {
  return /(^|\.)supabase\.co$/i.test(url.hostname) ||
    url.hostname === 'api.anthropic.com' ||
    url.hostname === 'generativelanguage.googleapis.com' ||
    url.pathname.endsWith('/config.js');
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;        // never intercept writes
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (isSensitive(url)) return;            // data/secrets → network only, never cached

  const sameOrigin = url.origin === self.location.origin;
  const cacheable = sameOrigin || CACHEABLE_HOSTS.includes(url.hostname);
  if (!cacheable) return;                  // unknown cross-origin → passthrough

  // App shell (page navigations): network-first so new releases are picked up,
  // falling back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch (e) {
        return (await caches.match(req)) ||
          (await caches.match('index.html')) ||
          (await caches.match('./')) ||
          Response.error();
      }
    })());
    return;
  }

  // Static assets + public libs: stale-while-revalidate (fast, self-updating).
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const fromNetwork = fetch(req).then((res) => {
      if (res && res.ok && res.type !== 'opaque') {
        caches.open(CACHE).then((c) => c.put(req, res.clone()).catch(() => {}));
      }
      return res;
    }).catch(() => null);
    return cached || (await fromNetwork) || Response.error();
  })());
});

// Tapping a reminder notification focuses an open tab (or opens the app).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow('.');
  })());
});
