/*
 * GaragePro service worker — makes the app installable and usable when the
 * network drops:
 * - pages: network first; a copy of each page opened is kept, and shown when
 *   the network is gone (with an "offline" banner from the page itself);
 * - build files (/_next/static, icons, fonts): cache first (they never change);
 * - everything else (API, server actions, uploads, POST): network only — the
 *   garage hub (PC on the Wi-Fi) is what keeps writes working without internet.
 * The private page cache is cleared on sign-out (message "clear-private").
 */
const VERSION = "gp-v6-1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-private") event.waitUntil(caches.delete(PAGES));
});

const isStatic = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/site/brand/") || /\.(woff2?|ttf)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // writes always go to the server
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // live data, media, auth

  if (isStatic(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(STATIC).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Page navigations (and Next.js page data requests).
  if (req.mode === "navigate" || req.headers.get("RSC") === "1") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Keep a copy of normal pages only (not redirects, errors or private files).
          if (res.ok && res.type === "basic" && !res.headers.get("Content-Disposition")) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (req.mode === "navigate" ? caches.match("/offline.html") : Response.error())),
    );
  }
});
