/* Service worker: app usabile anche senza connessione.
   - File dell'app: PRIMA la rete (così tutti vedono subito l'ultima versione),
     la copia salvata solo se si è offline.
   - Librerie CDN (KaTeX, Chart.js): copia salvata, aggiornata in background.
   I dati dell'utente NON passano di qui. */
const CACHE_VERSION = 'ap-v2.0.1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html', { ignoreSearch: true }))));
    return;
  }
  if (/cdn\.jsdelivr\.net$/.test(url.hostname)) {
    e.respondWith(caches.open(CACHE_VERSION).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
  }
});
