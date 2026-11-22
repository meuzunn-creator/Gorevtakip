importScripts("config.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
firebase.initializeApp(CFG.firebase);
firebase.messaging().onBackgroundMessage(p =>
  self.registration.showNotification(p.data.title, {
    body: p.data.body, icon: "icons/icon-192.png", badge: "icons/icon-192.png",
    tag: p.data.tag || "gorev", renotify: true
  }));
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(self.registration.scope));
});
