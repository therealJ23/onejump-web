// Client app service worker: caches the app shell so it opens instantly and offline.
// API responses are never cached (they're private and must stay fresh).
const VERSION = 'oj-client-v1';
const SHELL = ['/client', '/css/tokens.css', '/css/app.css', '/js/client/main.js', '/js/shared/api.js', '/js/shared/icons.js', '/js/shared/format.js', '/js/shared/components.js', '/js/shared/ui.js', '/js/shared/charts.js', '/js/client/screens/today.js', '/js/client/screens/workout.js', '/js/client/screens/checkin.js', '/js/client/screens/chat.js', '/js/client/screens/progress.js', '/js/client/screens/me.js', '/img/icon-192.png', '/img/favicon.svg', '/manifest.webmanifest'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/files/')) return; // private data: network only
  if (e.request.mode === 'navigate' && url.pathname.startsWith('/client')) {
    e.respondWith(fetch(e.request).catch(() => caches.match('/client')));
    return;
  }
  // Static assets: network first so updates show up, cache as fallback.
  e.respondWith(fetch(e.request).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); } return res; }).catch(() => caches.match(e.request)));
});
