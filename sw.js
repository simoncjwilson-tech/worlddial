const CACHE = "onetime-v37";
const CACHE_PREFIX = "onetime-";
// Versioned entry assets make an old active worker's cache miss when fresh HTML lands.
// A stale worker may return index.html, but it cannot pair it with stale CSS or JS.
const ASSETS = ["./", "./index.html", "./style.css?release=v37", "./app.js?release=v37", "./manifest.webmanifest", "./icon-v2.svg", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./icon-1024.png"];
self.addEventListener("install", event => event.waitUntil(
  caches.open(CACHE)
    .then(cache => Promise.all(ASSETS.map(asset => fetch(new Request(asset, { cache: "reload" })).then(response => {
      if (!response.ok) throw new Error(`Unable to cache ${asset}`);
      return cache.put(asset, response);
    }))))
    .then(() => self.skipWaiting())
));
self.addEventListener("activate", event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request).then(hit => hit || fetch(event.request).then(response => {
    const copy = response.clone(); cache.put(event.request, copy); return response;
  }).catch(error => {
    if (event.request.mode === "navigate") return cache.match("./index.html");
    throw error;
  }))));
});
