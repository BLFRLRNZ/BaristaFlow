/* Barista Flow: lavoro senza rete. Prima prova la rete (così l'app è sempre aggiornata), se manca usa la copia salvata. */
const CACHE = 'barista-flow-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icone/icon.svg', './icone/icon-192.png', './icone/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin && !/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? await caches.match('./index.html') : undefined) || Response.error()));
});
