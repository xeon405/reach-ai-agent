/* OutshipAi Service Worker
 * Strategies:
 *  - Navigations: stale-while-revalidate on the app shell (instant loads),
 *    offline.html as last-resort fallback.
 *  - /assets/* (hashed, immutable): cache-first.
 *  - Supabase REST/auth/functions + cross-origin: network only (never cached).
 */
const VERSION = "v5";
const SHELL_CACHE = `shell-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;
const SHELL_URL = "/";
const OFFLINE_URL = "/offline.html";
const NAV_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([SHELL_URL, OFFLINE_URL]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isDynamic(url) {
  return (
    url.hostname.endsWith("supabase.co") ||
    url.pathname.startsWith("/functions/") ||
    url.pathname.startsWith("/api/")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never intercept auth/DB/edge traffic — always live.
  if (isDynamic(url)) return;
  if (url.origin !== self.location.origin && !url.hostname.includes("fonts.")) return;

  // Google Fonts: always live pass-through, never cached (cross-origin, versioned).
  if (url.hostname.includes("fonts.")) {
    event.respondWith(fetch(req));
    return;
  }

  // App shell navigations: network-first (fresh deploys always win),
  // fall back to cached shell, then offline page.
  if (req.mode === "navigate") {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const timeout = new Promise((resolve) =>
          setTimeout(() => resolve(null), NAV_TIMEOUT_MS)
        );
        try {
          const fresh = await Promise.race([fetch(req), timeout]);
          if (fresh && fresh.ok) {
            cache.put(SHELL_URL, fresh.clone());
            return fresh;
          }
          if (fresh) return fresh;
        } catch {
          /* offline — fall through to cache */
        }
        const cached = (await cache.match(req)) || (await cache.match(SHELL_URL));
        return cached || caches.match(OFFLINE_URL);
      })
    );
    return;
  }

  // Hashed static assets: cache-first forever.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(req, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  // Other same-origin/static (icons, manifest): cache-first with background update.
  event.respondWith(
    caches.open(ASSET_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return cached || Response.error();
      }
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// ---- Web Push ----

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* plain text fallback */
  }
  const title = data.title || "OutshipAi";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.kind || "outreachai",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).toString();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
