/* Service worker: deixa o sistema instalável e rápido.
   - Arquivos com ?v= (scripts e estilos de uma versão): vêm da memória do aparelho, sem ir à internet. Versão nova = nome novo.
   - Página inicial e demais arquivos: rede primeiro (o sistema nunca fica desatualizado); a cópia guardada só é usada sem internet.
   Nada da /api é guardado (dados de vendas não ficam no aparelho). */
const CACHE = "norte-app-v5";
const BASE = ["/", "/manifest.webmanifest", "/icone-192.png", "/icone-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
const guardar = (req, r) => { if (r.ok && r.type === "basic") { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)).catch(() => {}); } return r; };
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  if (u.searchParams.has("v")) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((x) => guardar(e.request, x))));
    return;
  }
  e.respondWith(fetch(e.request).then((r) => guardar(e.request, r))
    .catch(() => caches.match(e.request, { ignoreSearch: u.pathname === "/" }).then((r) => r || caches.match("/"))));
});

/* Notificações no celular (Gerente/Administrador): nova venda e resumo de quem ainda não vendeu. */
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { corpo: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "Norte Link", {
    body: d.corpo || "", icon: "/icone-192.png", badge: "/icone-192.png", tag: d.tag || undefined, renotify: !!d.tag,
    data: { url: d.url || "/" }, lang: "pt-BR",
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const alvo = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => new URL(x.url).origin === self.location.origin);
    if (c) { c.postMessage({ ir: alvo }); return c.focus().catch(() => self.clients.openWindow(alvo)); }   // o app troca de tela sozinho (funciona também no iPhone)
    return self.clients.openWindow(alvo);
  }));
});
