/* =====================================================================
   STORAGE — IndexedDB
   Store:
     projects : un record per progetto (oggetto completo, chiave id)
     files    : allegati come Blob {id, projectId, blob, name, type, size}
     meta     : impostazioni globali (chiave 'settings')
   Se IndexedDB non è disponibile (es. alcune modalità private) si usa un
   fallback in memoria + localStorage per i soli progetti, e l'utente
   viene avvisato.
   ===================================================================== */
'use strict';

const DB = (() => {
  const NAME = 'assistente-progetto-universitario';
  const VERSION = 1;
  let db = null;
  let fallback = false;
  const mem = { projects: new Map(), files: new Map(), meta: new Map() };

  function open() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) { fallback = true; return resolve(false); }
      let req;
      try { req = indexedDB.open(NAME, VERSION); } catch (e) { fallback = true; return resolve(false); }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('files')) { const s = d.createObjectStore('files', { keyPath: 'id' }); s.createIndex('projectId', 'projectId'); }
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => { db = req.result; db.onversionchange = () => db.close(); resolve(true); };
      req.onerror = () => { fallback = true; resolve(false); };
      req.onblocked = () => { fallback = true; resolve(false); };
    }).then(ok => { if (!ok) loadFallback(); return ok; });
  }

  function loadFallback() {
    try {
      const raw = localStorage.getItem(NAME + ':projects');
      if (raw) JSON.parse(raw).forEach(p => mem.projects.set(p.id, p));
      const meta = localStorage.getItem(NAME + ':meta');
      if (meta) JSON.parse(meta).forEach(m => mem.meta.set(m.key, m));
    } catch (e) { /* localStorage non disponibile: resta solo memoria */ }
  }
  function persistFallback() {
    try {
      localStorage.setItem(NAME + ':projects', JSON.stringify([...mem.projects.values()]));
      localStorage.setItem(NAME + ':meta', JSON.stringify([...mem.meta.values()]));
    } catch (e) { throw new Error('Spazio di salvataggio esaurito o non disponibile'); }
  }

  function tx(store, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let result;
      const r = fn(s);
      if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error || new Error('Errore IndexedDB'));
      t.onabort = () => reject(t.error || new Error('Transazione annullata (spazio esaurito?)'));
    });
  }

  async function getAll(store) {
    if (fallback) return [...mem[store].values()].map(x => U.clone(x));
    return tx(store, 'readonly', s => s.getAll());
  }
  async function get(store, key) {
    if (fallback) return U.clone(mem[store].get(key));
    return tx(store, 'readonly', s => s.get(key));
  }
  async function put(store, value) {
    if (fallback) { mem[store].set(value.id || value.key, U.clone(value)); if (store !== 'files') persistFallback(); return; }
    return tx(store, 'readwrite', s => s.put(value));
  }
  async function del(store, key) {
    if (fallback) { mem[store].delete(key); if (store !== 'files') persistFallback(); return; }
    return tx(store, 'readwrite', s => s.delete(key));
  }
  async function filesOf(projectId) {
    if (fallback) return [...mem.files.values()].filter(f => f.projectId === projectId);
    return new Promise((resolve, reject) => {
      const t = db.transaction('files', 'readonly');
      const r = t.objectStore('files').index('projectId').getAll(projectId);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function deleteProjectFiles(projectId) {
    const fs = await filesOf(projectId);
    for (const f of fs) await del('files', f.id);
  }
  async function estimate() {
    try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch (e) { /* ignora */ }
    return null;
  }
  async function persist() {
    try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* ignora */ }
    return false;
  }

  return {
    open, getAll, get, put, del, filesOf, deleteProjectFiles, estimate, persist,
    get isFallback() { return fallback; }
  };
})();
