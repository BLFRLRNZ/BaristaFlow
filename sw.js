/* Barista Flow: lavoro senza rete. Prima prova la rete (così l'app è sempre aggiornata), se manca usa la copia salvata. */
const CACHE = 'barista-flow-v2';
const CORE = ['./', './index.html', './manifest.webmanifest', './icone/icon.svg', './icone/icon-192.png', './icone/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? await caches.match('./index.html') : undefined) || Response.error()));
});

/* notifiche di Barista Flow, mandate dallo script di Google anche quando l'app è chiusa */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = {body: e.data ? e.data.text() : ''}; }
  e.waitUntil(self.registration.showNotification(d.title || 'Barista Flow', {
    body: d.body || 'Apri Barista Flow per vedere cosa c’è da fare oggi.',
    tag: d.tag || 'barista-flow', icon: 'icone/icon-192.png', badge: 'icone/icon-192.png',
    data: {url: d.url || './#oggi'}
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './#oggi', self.registration.scope);
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    const c = list.find(w => w.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({tipo: 'apri', hash: url.hash}); return c.focus(); }
    return self.clients.openWindow(url.href);
  }));
});
