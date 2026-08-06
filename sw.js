const CACHE = 'u18-teamplaner-v1';
const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icons/teamplaner-icon.svg',
  './assets/icons/teamplaner-icon-192.png',
  './assets/icons/teamplaner-icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then(hit => hit || caches.match('./index.html'))));
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'U18 Teamplaner';
  const options = {
    body: data.body || 'Es gibt eine neue Team-Mitteilung.',
    icon: './assets/icons/teamplaner-icon-192.png',
    badge: './assets/icons/teamplaner-icon-192.png',
    tag: data.tag || 'teamplaner-info',
    data: { url: data.url || './' },
    vibrate: [80, 50, 80]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const existing = windows.find(win => win.url === target || win.url.startsWith(self.location.origin));
    return existing ? existing.focus() : clients.openWindow(target);
  }));
});
