/* Bildirimler + çevrimdışı çalışma */
importScripts("config.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
firebase.initializeApp(CFG.firebase);

firebase.messaging().onBackgroundMessage((p) => {
  const d = p.data || {};
  return self.registration.showNotification(d.title || "Bakım Görevleri", {
    body: d.body || "", icon: "icons/icon-192.png", badge: "icons/icon-192.png",
    tag: d.tag || "gorev", renotify: true,
  });
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && "focus" in c) return c.focus();
    return clients.openWindow(self.registration.scope);
  }));
});

const CACHE = "bakim-v3";
const SHELL = ["./", "index.html", "config.js", "manifest.json", "icons/icon-192.png", "icons/icon-512.png"];
const CDN = /^(www\.gstatic\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)$/;

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  // Uygulama dosyaları: önce internet (her zaman güncel), yoksa kayıtlı kopya
  if (u.origin === location.origin) {
    e.respondWith(fetch(r).then((res) => {
      if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true })
      .then((m) => m || (r.mode === "navigate" ? caches.match("index.html") : null))
      .then((m) => m || Response.error())));
    return;
  }
  // Sürümlü kütüphaneler ve yazı tipleri: kayıtlı kopya varsa onu kullan
  if (CDN.test(u.hostname)) {
    e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => {
      if (res.ok || res.type === "opaque") { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); }
      return res;
    })));
  }
});
