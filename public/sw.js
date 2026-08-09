const PLAY_POT_BUILD_ID = "__PLAY_POT_BUILD_ID__";
const PLAY_POT_PRECACHE_URLS = /* __PLAY_POT_PRECACHE_START__ */ [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
] /* __PLAY_POT_PRECACHE_END__ */;

const CACHE_PREFIX = "play-pot-shell-";
const CACHE_NAME = `${CACHE_PREFIX}${PLAY_POT_BUILD_ID}`;
const OFFLINE_DOCUMENT_URL = "/";
const IS_FINALIZED_BUILD = !PLAY_POT_BUILD_ID.startsWith("__PLAY_POT_");
const PRECACHE_PATHS = new Set(
  PLAY_POT_PRECACHE_URLS.map(
    (path) => new URL(path, self.location.origin).pathname,
  ),
);

function cacheRequest(path, cacheMode = "default") {
  return new Request(new URL(path, self.location.origin), {
    method: "GET",
    credentials: "same-origin",
    cache: cacheMode,
  });
}

async function cacheShellResponse(cache, path) {
  const request = cacheRequest(path, "reload");
  const response = await fetch(request);
  if (!response.ok) {
    throw new Error(`Could not cache Play Pot shell asset: ${path}`);
  }

  if (path !== OFFLINE_DOCUMENT_URL) {
    await cache.put(request, response);
    return;
  }

  // The server-rendered document varies on framework request headers. Store a
  // normalized copy so a normal offline navigation can always reuse it.
  const headers = new Headers(response.headers);
  headers.delete("Vary");
  headers.set("Cache-Control", "no-cache");
  const offlineDocument = new Response(await response.arrayBuffer(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  await cache.put(cacheRequest(OFFLINE_DOCUMENT_URL), offlineDocument);
}

async function installOfflineShell() {
  const cache = await caches.open(CACHE_NAME);
  try {
    await Promise.all(
      PLAY_POT_PRECACHE_URLS.map((path) => cacheShellResponse(cache, path)),
    );
  } catch (error) {
    await caches.delete(CACHE_NAME);
    throw error;
  }
}

self.addEventListener("install", (event) => {
  if (!IS_FINALIZED_BUILD) return;
  event.waitUntil(installOfflineShell());
});

self.addEventListener("activate", (event) => {
  if (!IS_FINALIZED_BUILD) return;
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME,
          )
          .map((cacheName) => caches.delete(cacheName)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "PLAY_POT_OFFLINE_STATUS") return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const offlineDocument = IS_FINALIZED_BUILD
        ? await cache.match(cacheRequest(OFFLINE_DOCUMENT_URL), {
            ignoreVary: true,
          })
        : null;
      event.ports[0]?.postMessage({
        type: "PLAY_POT_OFFLINE_STATUS",
        ready: Boolean(offlineDocument),
        buildId: PLAY_POT_BUILD_ID,
      });
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (!IS_FINALIZED_BUILD) return;

  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const offlineDocument = await cache.match(
          cacheRequest(OFFLINE_DOCUMENT_URL),
          { ignoreVary: true },
        );
        return offlineDocument ?? fetch(request);
      })(),
    );
    return;
  }

  if (!PRECACHE_PATHS.has(url.pathname)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: true });
      return cached ?? fetch(request);
    })(),
  );
});
