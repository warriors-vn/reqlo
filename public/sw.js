// Hand-written service worker (no Workbox/vite-plugin-pwa — see vite.config.ts for why).
//
// Scope is deliberately narrow: this only caches reqlo's own app shell and static assets.
// It must never intercept the arbitrary cross-origin API requests the app sends on the
// user's behalf — those are excluded explicitly below and are the entire reason a broad
// "cache everything" service worker would be dangerous here.

const CACHE_VERSION = "v1";
const SHELL_CACHE = `reqlo-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `reqlo-assets-${CACHE_VERSION}`;
const CURRENT_CACHES = new Set([SHELL_CACHE, ASSET_CACHE]);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !CURRENT_CACHES.has(key)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isOwnStaticAsset(url) {
  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname === "/favicon.svg" ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin (user API) requests

  // App shell: network-first, falling back to the last cached copy when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match("/"))),
    );
    return;
  }

  // Hashed static assets: cache-first, since a content change always produces a new filename.
  if (isOwnStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          return response;
        });
      }),
    );
  }
});
