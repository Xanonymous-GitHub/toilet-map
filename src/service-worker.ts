declare const __PWA_CACHE_NAME__: string;
declare const __PWA_CORE_ASSETS__: string[];

const worker = self as unknown as ServiceWorkerGlobalScope;
const cacheName = __PWA_CACHE_NAME__;
const coreAssets = __PWA_CORE_ASSETS__;

worker.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => cache.addAll(coreAssets))
      .then(() => worker.skipWaiting()),
  );
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("relief-") && name !== cacheName)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => worker.clients.claim()),
  );
});

worker.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== worker.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(cacheName);
        return (
          (await cache.match("/index.html")) ??
          new Response("Reconnect to download this app", { status: 503 })
        );
      }),
    );
    return;
  }
  // Only application assets are eligible; public map tiles stay outside this cache.
  if (coreAssets.includes(url.pathname)) {
    event.respondWith(
      caches
        .open(cacheName)
        .then(async (cache) => (await cache.match(url.pathname)) ?? fetch(request)),
    );
  }
});
