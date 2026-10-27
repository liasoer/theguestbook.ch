// Service Worker der Web-App: zeigt Mitteilungen bei neuen Anfragen und öffnet beim Antippen die App.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { text: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titel || 'Neue Anfrage', {
    body: d.text || '',
    icon: 'img/icon-192.png',
    badge: 'img/icon-192.png',
    data: { url: d.url || './index.html' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const ziel = new URL(e.notification.data && e.notification.data.url || './index.html', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(fenster => {
    for (const f of fenster) {
      if ('focus' in f) { if ('navigate' in f) f.navigate(ziel).catch(() => {}); return f.focus(); }
    }
    return self.clients.openWindow(ziel);
  }));
});
