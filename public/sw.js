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
const VERSION = "gp-v8-push";
// V10.4: offline.html text changed ("le PC du garage redémarre peut-être") — this line changes the
// worker, so phones install it again and re-cache /offline.html (same cache names, pages kept).
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
// PWA app (client « /app » + team « /equipe »): new icons and manifests. The version change above makes
// phones install this worker again and drop the old caches (static files and page copies).
// Stale code: /_next/static files have a content hash in their name (a new build = new names), pages
// are network-first, and Next.js reloads the page by itself when it sees a new build on navigation.
const PRECACHE = ["/offline.html", "/icons/app-192.png", "/icons/team-192.png", "/icons/icon-192.png", "/icons/icon-512.png"];

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

// Web Push (team app): « Nouveau véhicule pour vous » even when the app is closed. The payload comes from
// src/server/push.ts: { title, body, url, tag }. One notification per order (tag), replaced if sent again.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const url = typeof data.url === "string" && data.url.startsWith("/garage/") ? data.url : "/garage/app";
  event.waitUntil(
    self.registration.showNotification(data.title || "GaragePro", {
      body: data.body || "",
      icon: "/icons/team-192.png",
      badge: "/icons/team-192.png",
      tag: data.tag || undefined,
      renotify: !!data.tag,
      vibrate: [200, 100, 200],
      data: { url },
    }),
  );
});

// Tap on the notification: focus an open team-app window on the car, or open it.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/garage/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          return c.navigate(url).then((w) => (w || c).focus()).catch(() => c.focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
