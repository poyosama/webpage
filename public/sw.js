/* El tablero. — service worker
 * Objetivo: que la app de la pantalla de inicio abra al toque aunque la señal sea mala.
 * - Página (navegación): red primero con 3,5 s de espera; si no llega, la última versión guardada.
 * - /_next/static/* (archivos con hash, nunca cambian): del teléfono primero.
 * - Imágenes/íconos propios: del teléfono y se actualizan por detrás.
 * - Supabase y otros dominios: no se tocan (siempre red).
 */
const VERSION = "v4";
const PAGES = `et-pages-${VERSION}`;
const STATIC = `et-static-${VERSION}`;
const ASSETS = `et-assets-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, STATIC, ASSETS]);
      for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
      await self.clients.claim();
    })()
  );
});

const timeout = (ms) => new Promise((resolve) => setTimeout(() => resolve(null), ms));

async function trimCache(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Página: todas las rutas de la app sirven la misma app, se guarda bajo "/"
  // (las páginas sueltas como privacidad o importar-untitled van directo a la red)
  if (req.mode === "navigate" && /^\/(privacidad|terminos|importar-untitled|admin)(\/|$)/.test(url.pathname)) return;
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES);
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok && res.type === "basic") cache.put("/", res.clone());
            return res;
          })
          .catch(() => null);
        const fast = await Promise.race([network, timeout(3500)]);
        if (fast) return fast;
        const cached = await cache.match("/");
        if (cached) return cached;
        const late = await network;
        return late || new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      })()
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res && res.ok) {
          cache.put(req, res.clone());
          trimCache(STATIC, 250);
        }
        return res;
      })()
    );
    return;
  }

  if (/\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSETS);
        const hit = await cache.match(req);
        const refresh = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              cache.put(req, res.clone());
              trimCache(ASSETS, 150);
            }
            return res;
          })
          .catch(() => null);
        return hit || (await refresh) || fetch(req);
      })()
    );
  }
});
