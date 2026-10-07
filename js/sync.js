/* =====================================================================
   SYNC — progetto condiviso tra i membri del team
   Quando l'app è aperta come pagina su claude.ai (link condiviso), i dati
   del progetto vivono in un archivio comune (capacità `db`) e i file in
   uno spazio comune (capacità `assets`): ogni modifica di un membro arriva
   agli altri in pochi secondi.
   Aperta in altro modo (doppio clic sul file, localhost) l'app funziona
   come prima, solo in questo browser.

   Come vengono divisi i dati: il progetto è spezzato in "parti" (una per
   fase, sezione della relazione, scadenza, esempio, …) così due persone
   che lavorano su cose diverse non si sovrascrivono. Sulla stessa parte
   vince l'ultima modifica salvata.
   Struttura nell'archivio:
     projects/<pid>                 → {name, updatedAt, by}
     projects/<pid>/parts/<chiave>  → {k, h, v | n, by, view, at}
     projects/<pid>/parts/<chiave>~~c<i> → pezzi delle parti > 200 KB
   ===================================================================== */
'use strict';

const Sync = (() => {
  let db = null, user = null, assets = null, downloads = null, myId = null;
  const viewId = U.uid('v');
  const ITEMIZE = ['profNotes', 'examples', 'guidelines', 'phases', 'tasks', 'deadlines', 'revisions', 'questions', 'proposals', 'files', 'customRules'];
  const CHUNK = 200000;
  const st = {
    on: false, pid: null, unsub: null,
    synced: {},        // chiave → hash dell'ultima versione condivisa (inviata o ricevuta)
    remote: {},        // chiave → valore ricevuto da applicare
    removed: new Set(),
    chunks: {},        // chiave → numero di pezzi scritti
    chunkBuf: {},      // chiave → {heads, pieces}
    pushing: false, again: false, applyTimer: null, deferred: false,
    lastBy: null, uploads: 0, error: null, prev: {}
  };

  /* ---------- utilità ---------- */
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + '.' + s.length; };
  const skey = k => String(k).replace(/[^A-Za-z0-9_\-.~:@+]/g, '_').slice(0, 190);
  const partsColl = pid => db.collection('projects/' + skey(pid) + '/parts');
  const head = pid => db.doc('projects/' + skey(pid));
  async function pool(tasks, n = 4) {
    let i = 0;
    const run = async () => { while (i < tasks.length) { const t = tasks[i++]; await t(); } };
    await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, run));
  }
  async function retry(fn) {
    try { return await fn(); }
    catch (e) { if (e && e.code === 'unavailable') { await new Promise(r => setTimeout(r, 400 + Math.random() * 800)); return fn(); } throw e; }
  }

  /* ---------- progetto ↔ parti ---------- */
  function split(P) {
    const parts = {};
    const p = Object.assign({}, P);
    ITEMIZE.forEach(K => {
      const arr = U.arr(p[K]);
      parts[K + '~_order'] = { ids: arr.map(x => x.id) };
      arr.forEach(x => { if (x && x.id) parts[K + '~' + skey(x.id)] = x; });
      delete p[K];
    });
    const rep = Object.assign({}, p.report || {});
    const secs = U.arr(rep.sections);
    delete rep.sections;
    parts['report.sections~_order'] = { ids: secs.map(s => s.id) };
    secs.forEach(s => { parts['report.sections~' + skey(s.id)] = s; });
    parts.report = rep;
    delete p.report;
    delete p.updatedAt;
    Object.keys(p).forEach(k => { parts['top~' + k] = { v: p[k] }; });
    return parts;
  }
  function assemble(parts) {
    const p = {};
    Object.keys(parts).forEach(k => { if (k.startsWith('top~')) p[k.slice(4)] = parts[k] ? parts[k].v : undefined; });
    const items = K => {
      const ord = (parts[K + '~_order'] || {}).ids || [];
      const seen = new Set(), out = [];
      ord.forEach(id => { const v = parts[K + '~' + skey(id)]; if (v && !seen.has(v.id)) { seen.add(v.id); out.push(v); } });
      // elementi aggiunti da altri e non ancora nell'ordine: in fondo
      Object.keys(parts).forEach(k => { if (k.startsWith(K + '~') && !k.endsWith('~_order')) { const v = parts[k]; if (v && v.id && !seen.has(v.id)) { seen.add(v.id); out.push(v); } } });
      return out;
    };
    ITEMIZE.forEach(K => { p[K] = items(K); });
    p.report = Object.assign({}, parts.report || {});
    p.report.sections = items('report.sections');
    return p;
  }
  function serialize(parts) { const out = {}; Object.keys(parts).forEach(k => { out[k] = JSON.stringify(parts[k] === undefined ? null : parts[k]); }); return out; }

  /* ---------- scrittura ---------- */
  async function writePart(k, json, h) {
    const coll = partsColl(st.pid), id = skey(k);
    const base = { k, h, by: myId, view: viewId, at: U.nowISO() };
    if (json.length > CHUNK) {
      const n = Math.ceil(json.length / CHUNK);
      for (let i = 0; i < n; i++) await retry(() => coll.doc(id + '~~c' + i).set({ k, part: k, ci: i, h, d: json.slice(i * CHUNK, (i + 1) * CHUNK) }));
      for (let i = n; i < (st.chunks[k] || 0); i++) await retry(() => coll.doc(id + '~~c' + i).delete());
      st.chunks[k] = n;
      await retry(() => coll.doc(id).set(Object.assign(base, { n })));
    } else {
      for (let i = 0; i < (st.chunks[k] || 0); i++) await retry(() => coll.doc(id + '~~c' + i).delete());
      st.chunks[k] = 0;
      await retry(() => coll.doc(id).set(Object.assign(base, { v: JSON.parse(json) })));
    }
  }
  async function push() {
    if (!st.on || !Store.P || Store.P.id !== st.pid || Store.P.isDemo) return;
    if (st.pushing) { st.again = true; return; }
    st.pushing = true;
    try {
      do {
        st.again = false;
        const P = Store.P;
        const json = serialize(split(P));
        const changed = Object.keys(json).filter(k => st.synced[k] !== hash(json[k]));
        const gone = Object.keys(st.synced).filter(k => !(k in json));
        if (!changed.length && !gone.length) break;
        indicator('saving');
        await pool(changed.map(k => async () => { const h = hash(json[k]); await writePart(k, json[k], h); st.synced[k] = h; }));
        await pool(gone.map(k => async () => {
          const id = skey(k);
          for (let i = 0; i < (st.chunks[k] || 0); i++) await retry(() => partsColl(st.pid).doc(id + '~~c' + i).delete());
          await retry(() => partsColl(st.pid).doc(id).delete());
          delete st.synced[k]; delete st.chunks[k];
        }));
        await retry(() => head(st.pid).set({ name: P.info.name || 'Progetto', updatedAt: U.nowISO(), by: myId, view: viewId }));
        st.error = null;
      } while (st.again);
      indicator('saved');
    } catch (e) {
      console.error('Sync push', e);
      st.error = e;
      indicator('error');
      if (e && e.code === 'bad_code') UI.toast('Codice del team non valido: le modifiche non vengono condivise.', 'err');
      else if (e && e.code === 'invalid_argument' && /write|permission|level/i.test(e.message || '')) UI.toast('Non hai il permesso di modificare il progetto condiviso: chiedi a chi l\'ha creato di invitarti come Editor.', 'err');
      else if (e && e.code === 'quota_exceeded') UI.toast('Spazio del progetto condiviso esaurito: ' + (e.message || ''), 'err');
      else UI.toast('Modifiche non ancora condivise (' + ((e && e.code) || 'errore') + '). Riprovo al prossimo salvataggio.', 'err');
    } finally { st.pushing = false; }
  }

  /* ---------- lettura ---------- */
  function readDoc(d, sink) {
    // sink: {parts, hashes, chunks}
    const x = d.data(); if (!x || !x.k) return;
    if (x.part !== undefined && x.ci !== undefined) { const b = (st.chunkBuf[x.part] = st.chunkBuf[x.part] || { pieces: {} }); b.pieces[x.ci] = x; return; }
    if (x.n) { const b = (st.chunkBuf[x.k] = st.chunkBuf[x.k] || { pieces: {} }); b.head = x; return; }
    sink(x.k, x.v, x.h, x);
  }
  function completeChunks(sink) {
    Object.keys(st.chunkBuf).forEach(k => {
      const b = st.chunkBuf[k];
      if (!b.head) return;
      let s = '';
      for (let i = 0; i < b.head.n; i++) { const pc = b.pieces[i]; if (!pc || pc.h !== b.head.h) return; s += pc.d; }
      try { sink(k, JSON.parse(s), b.head.h, b.head); st.chunks[k] = b.head.n; } catch (e) { /* pezzi incompleti */ }
      delete st.chunkBuf[k];
    });
  }
  async function load(pid) {
    const snap = await retry(() => partsColl(pid).get());
    const parts = {}, hashes = {};
    st.chunkBuf = {};
    const sink = (k, v, h) => { parts[k] = v; hashes[k] = h; };
    snap.docs.forEach(d => { if (d.exists) readDoc(d, sink); });
    completeChunks(sink);
    return { parts, hashes, count: snap.size };
  }
  function subscribe(pid) {
    if (st.unsub) { try { st.unsub(); } catch (e) { /* già chiuso */ } }
    st.unsub = partsColl(pid).onSnapshot(snap => {
      if (pid !== st.pid) return;
      let any = false;
      const sink = (k, v, h, raw) => {
        if (st.synced[k] === h) return;          // già uguale (anche la nostra eco)
        if (!(k in st.prev)) st.prev[k] = st.synced[k];
        st.remote[k] = v; st.removed.delete(k); st.synced[k] = h; any = true;
        if (raw && raw.by && raw.view !== viewId) st.lastBy = raw.by;
      };
      snap.docChanges().forEach(ch => {
        const d = ch.doc, x = d.data() || {};
        if (ch.type === 'removed') {
          if (x.part !== undefined) return;
          if (x.k && x.k in st.synced) { delete st.synced[x.k]; delete st.remote[x.k]; st.removed.add(x.k); any = true; }
          return;
        }
        readDoc(d, sink);
      });
      completeChunks(sink);
      if (any) scheduleApply();
    }, err => {
      console.warn('Sync subscribe', err);
      if (err && err.code === 'unavailable') setTimeout(() => { if (st.pid === pid) subscribe(pid); }, 3000);
    });
  }

  /* ---------- applicare le modifiche degli altri ---------- */
  const editing = () => { const a = document.activeElement; return a && a.closest && a.closest('#view, .modal') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'radio'; };
  function scheduleApply() {
    clearTimeout(st.applyTimer);
    st.applyTimer = setTimeout(apply, 350);
  }
  function apply() {
    if (!Store.P || !Object.keys(st.remote).length && !st.removed.size) return;
    // le parti modificate qui e non ancora inviate restano le nostre
    const local = split(Store.P);
    const json = serialize(local);
    let kept = 0;
    Object.keys(st.remote).forEach(k => {
      const lh = json[k] !== undefined ? hash(json[k]) : null;
      // modificata anche qui e non ancora inviata: vale la nostra (verrà inviata subito dopo)
      if (lh && st.prev[k] !== undefined && lh !== st.prev[k] && lh !== st.synced[k]) { kept++; return; }
      local[k] = st.remote[k];
    });
    st.removed.forEach(k => { delete local[k]; });
    st.remote = {}; st.removed = new Set(); st.prev = {};
    if (kept) setTimeout(push, 50);
    const keep = { updatedAt: Store.P.updatedAt };
    Store.P = normalizeProject(Object.assign(assemble(local), keep));
    DB.put('projects', Store.P).catch(() => {});
    const ix = Store.index.find(x => x.id === Store.P.id); if (ix) ix.name = Store.P.info.name;
    refreshView();
    note();
  }
  function refreshView() {
    if (editing() || document.querySelector('.modal-back')) {
      if (!st.deferred) {
        st.deferred = true;
        const later = () => setTimeout(() => { if (editing() || document.querySelector('.modal-back')) return; document.removeEventListener('focusout', later, true); st.deferred = false; App.refresh(); }, 250);
        document.addEventListener('focusout', later, true);
      }
      return;
    }
    App.refresh();
  }
  async function note() {
    let who = 'un membro del team';
    if (st.lastBy && !user && typeof st.lastBy === 'string' && st.lastBy !== myId) who = st.lastBy;
    if (st.lastBy && user) { try { const ps = await user.profiles([st.lastBy]); if (ps[st.lastBy] && ps[st.lastBy].name) who = ps[st.lastBy].name; } catch (e) { /* nome non disponibile */ } }
    const el = UI.$('#sync-status');
    if (el) { el.textContent = '⟳ Aggiornato da ' + who + ' · ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1500); }
  }
  function indicator(s) {
    const el = UI.$('#sync-status');
    if (!el) return;
    el.hidden = false;
    if (s === 'saving') el.textContent = '⟳ Condivido le modifiche…';
    else if (s === 'saved') el.textContent = st.uploads ? '⟳ Carico ' + st.uploads + ' file…' : '✓ Condiviso con il team';
    else if (s === 'error') el.textContent = '⚠ Non condiviso: riprovo';
  }

  /* ---------- apertura dei progetti ---------- */
  async function open(pid) {
    const r = await load(pid);
    if (!r.count) throw new Error('Progetto condiviso vuoto o non trovato');
    st.pid = pid; st.synced = Object.assign({}, r.hashes); st.remote = {}; st.removed = new Set(); st.prev = {};
    const P = normalizeProject(assemble(r.parts));
    P.id = pid;
    Store.P = P;
    Store.settings.lastProjectId = pid;
    await DB.put('projects', P).catch(() => {});
    subscribe(pid);
    return P;
  }
  async function attach(P) {
    if (!st.on || !P || P.isDemo) { detach(); return; }
    st.pid = P.id; st.synced = {}; st.chunks = {}; st.remote = {}; st.removed = new Set();
    // se il progetto esiste già nello spazio comune (sostituzione): riscrive tutto e toglie le parti in più
    try { const old = await load(P.id); Object.keys(old.hashes).forEach(k => { st.synced[k] = 'stale'; }); } catch (e) { /* nuovo */ }
    st.remoteIds && st.remoteIds.add(P.id);
    subscribe(P.id);
    await push();
    // i file già presenti in questo browser vanno nello spazio comune
    for (const f of U.arr(P.files)) if (!f.remote) { const rec = await origGet('files', f.id); if (rec && rec.blob) await uploadFile(rec); }
  }
  function detach() { if (st.unsub) { try { st.unsub(); } catch (e) { /* già chiuso */ } } st.unsub = null; st.pid = null; }
  async function remoteIndex() {
    const snap = await retry(() => db.collection('projects').get());
    return snap.docs.filter(d => d.exists && !(d.data() || {}).deleted).map(d => Object.assign({ id: d.id }, d.data()));
  }

  /* ---------- file nello spazio comune ---------- */
  const DIRECT = /^(image\/(png|jpeg|gif|webp)|application\/pdf|video\/(mp4|webm)|text\/(plain|csv|markdown)|application\/json)$/;
  const toB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
  async function uploadFile(rec) {
    if (!st.on || !assets || !Store.P) return;
    const P = Store.P;
    let meta = U.arr(P.files).find(f => f.id === rec.id);
    if (!meta || meta.remote) return;   // file di un altro progetto (es. import in corso) o già condiviso
    st.uploads++; indicator('saved');
    try {
      let blob = rec.blob, type = (blob.type || rec.type || '').split(';')[0], enc = '';
      if (!assets.acceptsAny && !DIRECT.test(type)) { blob = new Blob([await toB64(rec.blob)], { type: 'text/plain' }); type = 'text/plain'; enc = 'b64'; }
      if (blob.size > 20 * 1024 * 1024) { UI.toast('"' + rec.name + '" è troppo grande per essere condiviso (max circa 15 MB): resta solo su questo computer.', 'err'); return; }
      const r = await assets.upload(blob, { type });
      meta = U.arr(Store.P.files).find(f => f.id === rec.id);
      if (meta) { meta.remote = { asset: r.id, enc, type: rec.type || rec.blob.type || '' }; Store.touch(); }
    } catch (e) {
      console.warn('Upload', e);
      UI.toast('File "' + rec.name + '" non condiviso (' + ((e && e.code) || 'errore') + ').', 'err');
    } finally { st.uploads--; indicator('saved'); }
  }
  async function fetchFile(id) {
    const meta = Store.P && U.arr(Store.P.files).find(f => f.id === id);
    if (!meta || !meta.remote || !meta.remote.asset) return null;
    try {
      let blob;
      if (assets && assets.fetchBlob) { blob = await assets.fetchBlob(meta.remote.asset); if (!blob) return null; if (meta.type) blob = new Blob([blob], { type: meta.type }); }
      else {
      const res = await fetch('/_blob/' + meta.remote.asset);
      if (!res.ok) return null;
      if (meta.remote.enc === 'b64') { const bin = atob(await res.text()); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); blob = new Blob([u], { type: meta.remote.type || meta.type || 'application/octet-stream' }); }
      else blob = await res.blob();
      }
      const rec = { id, projectId: Store.P.id, blob, name: meta.name, type: meta.type, size: blob.size };
      await origPut('files', rec).catch(() => {});
      return rec;
    } catch (e) { console.warn('Download file', e); return null; }
  }

  /* ---------- aggancio al resto dell'app ---------- */
  const origPut = DB.put, origGet = DB.get, origFilesOf = DB.filesOf;
  DB.put = async (store, value) => {
    await origPut(store, value);
    if (store === 'files' && st.on && value && value.blob) setTimeout(() => uploadFile(value), 0);
  };
  DB.get = async (store, key) => {
    const r = await origGet(store, key);
    if (store !== 'files' || (r && r.blob) || !st.on) return r;
    return (await fetchFile(key)) || r;
  };
  DB.filesOf = async pid => {
    if (!st.on || !Store.P || Store.P.id !== pid) return origFilesOf(pid);
    const out = [];
    for (const f of U.arr(Store.P.files)) { const r = await DB.get('files', f.id); if (r && r.blob) out.push(r); }
    return out;
  };
  const origDownload = U.download;
  U.download = (filename, content, mime) => {
    if (!downloads) return origDownload(filename, content, mime);
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    downloads.save({ filename, data: blob }).catch(e => {
      if (e && e.code === 'declined') return;
      if (e && e.code === 'rejected_extension') { UI.toast('Formato non scaricabile da qui', 'err'); return; }
      origDownload(filename, content, mime);
    });
  };

  // Store: dopo ogni salvataggio locale le modifiche vengono condivise
  const origSaveNow = Store.saveNow.bind(Store);
  Store.saveNow = async function () { await origSaveNow(); if (st.on) push(); };
  const origCreate = Store.createProject.bind(Store);
  Store.createProject = async function (info, opts) { const p = await origCreate(info, opts); if (st.on) await attach(p); return p; };
  const origSwitch = Store.switchProject.bind(Store);
  Store.switchProject = async function (id) {
    if (!st.on) return origSwitch(id);
    this.flush();
    if (st.remoteIds && st.remoteIds.has(id)) { await open(id); await this.saveSettings(); return; }
    detach();
    return origSwitch(id);
  };
  const origDelete = Store.deleteProject.bind(Store);
  Store.deleteProject = async function (id) {
    if (st.on && st.remoteIds && st.remoteIds.has(id)) {
      if (st.pid === id) detach();
      try {
        const snap = await partsColl(id).get();
        await pool(snap.docs.map(d => () => retry(() => partsColl(id).doc(d.id).delete())));
        await retry(() => head(id).set({ deleted: true, updatedAt: U.nowISO(), by: myId }));
      } catch (e) { UI.toast('Eliminazione dal progetto condiviso non riuscita: ' + ((e && e.code) || e), 'err'); }
      st.remoteIds.delete(id);
    }
    return origDelete(id);
  };

  /* ---------- avvio ---------- */
  async function init(backend) {
    if (backend) { db = backend.db; assets = backend.assets; user = null; downloads = null; myId = backend.name || null; st.kind = 'team'; }
    else {
      if (!window.claude || typeof window.claude.use !== 'function') return false;
      const get = n => Promise.resolve(window.claude.use(n)).catch(() => null);
      [db, user, assets, downloads] = await Promise.all([get('db'), get('user'), get('assets'), get('downloads')]);
      if (!db) return false;
      try { myId = user ? await user.id() : null; } catch (e) { myId = null; }
      st.kind = 'claude';
    }
    let remote = [];
    try { remote = await remoteIndex(); } catch (e) { console.warn('Sync index', e); if (backend) throw e; return false; }
    st.on = true;
    st.remoteIds = new Set(remote.map(r => r.id));
    document.body.classList.add('shared');
    const sn = document.getElementById('side-note'); if (sn) sn.textContent = 'Progetto condiviso con il team.';
    indicator('saved');
    if (remote.length) {
      const local = Store.index.filter(x => x.isDemo && !st.remoteIds.has(x.id));
      Store.index = remote.map(r => ({ id: r.id, name: r.name || 'Progetto', isDemo: false, updatedAt: r.updatedAt })).concat(local);
      const pick = remote.find(r => r.id === Store.settings.lastProjectId) || remote.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
      try { await open(pick.id); }
      catch (e) { console.warn('Sync open', e); UI.toast('Impossibile aprire il progetto condiviso: ' + e.message, 'err'); }
    } else if (Store.P && !Store.P.isDemo) {
      await attach(Store.P);
      st.remoteIds.add(Store.P.id);
    }
    // nuovi progetti creati da altri compaiono nel menu
    db.collection('projects').onSnapshot(snap => {
      const rows = snap.docs.filter(d => d.exists && !(d.data() || {}).deleted).map(d => Object.assign({ id: d.id }, d.data()));
      st.remoteIds = new Set(rows.map(r => r.id));
      const demos = Store.index.filter(x => x.isDemo && !st.remoteIds.has(x.id));
      Store.index = rows.map(r => ({ id: r.id, name: r.name || 'Progetto', isDemo: false, updatedAt: r.updatedAt })).concat(demos);
      if (window.App) App.renderNav();
    }, () => {});
    window.addEventListener('beforeunload', e => { if (st.pushing || st.uploads) { e.preventDefault(); e.returnValue = ''; } });
    return true;
  }

  return {
    init, push, open, attach, split, assemble,
    get on() { return st.on; },
    get kind() { return st.kind; },
    get canUpload() { return !!assets; },
    status() { return { on: st.on, pid: st.pid, parts: Object.keys(st.synced).length, pushing: st.pushing, uploads: st.uploads, error: st.error && (st.error.code || String(st.error)) }; }
  };
})();
