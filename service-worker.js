/* Service worker: rende l'app utilizzabile offline.
   - File dell'app: cache-first (aggiornati quando cambia CACHE_VERSION)
   - Librerie CDN (KaTeX, Chart.js): stale-while-revalidate
   I dati dell'utente NON passano di qui: restano in IndexedDB. */
const CACHE_VERSION = 'ap-v1.7.0';
const APP_FILES = [
  './', './index.html', './style.css', './manifest.json',
  './js/utils.js', './js/db.js', './js/state.js', './js/checker.js', './js/ai.js', './js/demo.js',
  './js/ui.js', './js/views.js', './js/views2.js', './js/extract.js', './js/upload.js', './js/live.js', './js/docx.js', './js/remote.js', './js/sync.js', './js/bpm-data.js', './js/app.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match('./index.html'))));
    return;
  }
  if (/cdn\.jsdelivr\.net$/.test(url.hostname)) {
    e.respondWith(caches.open(CACHE_VERSION).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
  }
});
