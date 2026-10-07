/* =====================================================================
   REMOTE — archivio del team su Supabase (gratuito, senza account Claude)
   Offre a Sync la stessa forma usata su claude.ai:
     db.collection(path).get() / onSnapshot() / doc(id).set() / delete()
     assets.upload(blob) / fetchBlob(id)
   Tutte le chiamate passano dalle funzioni create da supabase-setup.sql e
   richiedono il CODICE DEL TEAM. Gli aggiornamenti degli altri arrivano
   controllando ogni 3 secondi (30 s se la scheda non è in primo piano).
   La configurazione (indirizzo, chiave pubblica, codice, nome) resta in
   questo browser; il "link di invito" la passa ai compagni.
   ===================================================================== */
'use strict';

const Team = (() => {
  const KEY = 'ap-team-config';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const write = c => { try { if (c) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY); } catch (e) { /* storage non disponibile */ } };
  const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

  async function rpc(cfg, fn, args) {
    const url = cfg.url.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn;
    const headers = { 'Content-Type': 'application/json', apikey: cfg.key };
    if (/^eyJ/.test(cfg.key)) headers.Authorization = 'Bearer ' + cfg.key;
    let res;
    try { res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(Object.assign({ k: cfg.code }, args)) }); }
    catch (e) { const err = new Error('Server del team non raggiungibile (connessione assente?)'); err.code = 'unavailable'; throw err; }
    const txt = await res.text();
    let body = null; try { body = txt ? JSON.parse(txt) : null; } catch (e) { body = txt; }
    if (!res.ok) {
      const msg = (body && (body.message || body.hint)) || ('errore ' + res.status);
      const err = new Error(msg);
      err.code = /codice del team/i.test(msg) ? 'bad_code' : res.status >= 500 || res.status === 429 ? 'unavailable' : res.status === 404 ? 'not_setup' : 'invalid_argument';
      throw err;
    }
    return body;
  }

  /** db con la stessa forma della capacità `db` di claude.ai */
  function makeDb(cfg) {
    const snapDoc = (id, data) => ({ id, exists: data != null, data: () => (data == null ? undefined : data), metadata: { fromCache: false, hasPendingWrites: false } });
    const parentOf = path => { const s = path.split('/'); return { coll: s.slice(0, -1).join('/'), id: s[s.length - 1] }; };
    const docRef = path => ({
      id: parentOf(path).id, path,
      async get() { const r = await rpc(cfg, 'ap_get', { p: path }); const row = r && r[0]; return snapDoc(parentOf(path).id, row ? row.data : null); },
      async set(d) { const { coll, id } = parentOf(path); await rpc(cfg, 'ap_set', { p: path, c: coll, i: id, d }); },
      async update(d) { const cur = (await this.get()).data() || {}; await this.set(Object.assign({}, cur, d)); },
      async delete() { await rpc(cfg, 'ap_del', { p: path }); },
      onSnapshot() { return () => {}; },
      collection: p => collRef(path + '/' + p)
    });
    const collRef = path => ({
      path,
      doc: id => docRef(path + '/' + (id || U.uid('d'))),
      async add(d) { const r = this.doc(); await r.set(d); return r; },
      async get() {
        const rows = (await rpc(cfg, 'ap_list', { c: path })) || [];
        const docs = rows.map(r => snapDoc(r.id, r.data));
        return { docs, size: docs.length, empty: !docs.length, docChanges: () => docs.map(d => ({ type: 'added', doc: d })) };
      },
      onSnapshot(next, onErr) {
        let stop = false, cursor = -1, timer = null;
        const known = new Map();   // id → JSON
        const tick = async () => {
          if (stop) return;
          try {
            let rows;
            if (cursor < 0) { rows = (await rpc(cfg, 'ap_list', { c: path })) || []; }
            else rows = (await rpc(cfg, 'ap_since', { c: path, s: Math.max(0, cursor - 20) })) || [];
            const ch = [];
            rows.forEach(r => {
              cursor = Math.max(cursor, Number(r.seq) || 0);
              const prev = known.get(r.id);
              if (r.deleted) { if (prev !== undefined) { known.delete(r.id); ch.push({ type: 'removed', doc: snapDoc(r.id, JSON.parse(prev)) }); } return; }
              const s = JSON.stringify(r.data);
              if (prev === s) return;
              known.set(r.id, s);
              ch.push({ type: prev === undefined ? 'added' : 'modified', doc: snapDoc(r.id, r.data) });
            });
            if (cursor < 0) cursor = 0;
            if (ch.length) {
              const docs = [...known].map(([id, s]) => snapDoc(id, JSON.parse(s)));
              next({ docs, size: docs.length, empty: !docs.length, docChanges: () => ch, metadata: { fromCache: false, hasPendingWrites: false } });
            }
          } catch (e) {
            if (e.code === 'bad_code') { stop = true; if (onErr) onErr({ code: 'revoked', message: e.message }); return; }
          }
          timer = setTimeout(tick, document.hidden ? 30000 : 3000);
        };
        tick();
        const wake = () => { if (!document.hidden && !stop) { clearTimeout(timer); tick(); } };
        document.addEventListener('visibilitychange', wake);
        return () => { stop = true; clearTimeout(timer); document.removeEventListener('visibilitychange', wake); };
      }
    });
    return { doc: docRef, collection: collRef };
  }

  /** file: salvati a pezzi da ~700 KB (testo base64) nella tabella ap_blobs */
  function makeAssets(cfg) {
    const PIECE = 700000;
    const toB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
    return {
      acceptsAny: true,
      async upload(blob, opts = {}) {
        const id = U.uid('blob');
        const b64 = await toB64(blob);
        const n = Math.max(1, Math.ceil(b64.length / PIECE));
        for (let i = 0; i < n; i++) await rpc(cfg, 'ap_blob_put', { b: id, bi: i, bn: n, bt: opts.type || blob.type || 'application/octet-stream', bd: b64.slice(i * PIECE, (i + 1) * PIECE) });
        return { id, url: '', sizeBytes: blob.size, contentType: opts.type || blob.type };
      },
      async fetchBlob(id) {
        const first = ((await rpc(cfg, 'ap_blob_get', { b: id, bi: 0 })) || [])[0];
        if (!first) return null;
        let s = first.data;
        for (let i = 1; i < first.n; i++) { const r = ((await rpc(cfg, 'ap_blob_get', { b: id, bi: i })) || [])[0]; if (!r) return null; s += r.data; }
        const bin = atob(s); const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return new Blob([u], { type: first.type || 'application/octet-stream' });
      }
    };
  }

  return {
    config: read,
    save: write,
    async test(cfg) { return rpc(cfg, 'ap_ping', {}); },
    backend(cfg) { return { db: makeDb(cfg), assets: makeAssets(cfg), name: cfg.name || '' }; },
    inviteLink(cfg) {
      const base = location.href.split('#')[0];
      return base + '#join=' + b64e(JSON.stringify({ u: cfg.url, k: cfg.key, c: cfg.code }));
    },
    /** legge un eventuale link di invito dall'indirizzo */
    fromHash() {
      const m = (location.hash || '').match(/#join=([A-Za-z0-9_-]+)/);
      if (!m) return null;
      try { const o = JSON.parse(b64d(m[1])); return o.u && o.k && o.c ? { url: o.u, key: o.k, code: o.c } : null; } catch (e) { return null; }
    }
  };
})();
