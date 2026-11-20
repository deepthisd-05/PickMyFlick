const SHELL_CACHE = "pickmyflick-shell-v1";
const ASSET_CACHE = "pickmyflick-assets-v1";
const API_CACHE = "pickmyflick-api-v1";

const APP_SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/pwa-192x192.png",
  "/pwa-512x512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const allowedCaches = new Set([SHELL_CACHE, ASSET_CACHE, API_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !allowedCaches.has(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === "basic") {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error("Network and cache unavailable");
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok && response.type === "basic") {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    return cached;
  }
  const networkResponse = await fetchPromise;
  if (networkResponse) return networkResponse;
  return new Response("Offline", { status: 503, statusText: "Offline" });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Keep auth/session endpoints strictly network-only
  if (url.pathname.startsWith("/api/auth/")) {
    return;
  }

  // Keep /api/... requests network-first so ratings, wishlists, and recommendations stay fresh
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      networkFirst(request, API_CACHE).catch(
        () =>
          new Response(
            JSON.stringify({ error: "Offline: unable to reach server" }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            }
          )
      )
    );
    return;
  }

  // Navigation requests: network-first with cached app-shell fallback
  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, SHELL_CACHE).catch(async () => {
        const fallback = await caches.match("/");
        return (
          fallback ||
          new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          })
        );
      })
    );
    return;
  }

  // Vite dev modules: keep network-first so development updates aren't stale
  if (
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/node_modules/")
  ) {
    event.respondWith(networkFirst(request, ASSET_CACHE));
    return;
  }

  // Static frontend assets, icons, and manifest: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
});
