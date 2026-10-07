/* =====================================================================
   ROUTER · EVENTI · RICERCA · BACKUP · AVVIO
   - Navigazione a viste dinamiche tramite hash (#/vista/id/extra)
   - Delegazione eventi: data-action (click), data-change (change),
     data-bind (modifica in linea con autosave)
   - Ricerca globale
   - Backup completo JSON (con file allegati opzionali) e importazione
   - Dati demo, PWA, gestione errori
   ===================================================================== */
'use strict';

const NAV = [
  { k: 'dashboard', label: 'Home' },
  { k: 'dev', label: 'Fasi del lavoro' },
  { k: 'report', label: 'Relazione' },
  { k: 'deadlines', label: 'Calendario', group: 'calendario' },
  { k: 'brief', label: 'Materiali', group: 'materiali' },
  { k: 'checks', label: 'Controlli' }
];
const NAV_MORE = ['claude', 'history', 'settings'];
/* VISTA SEMPLICE (predefinita): solo le 4 pagine che servono a tutti, senza opzioni avanzate */
const NAV_SIMPLE = [
  { k: 'dashboard', label: 'Inizia qui', ico: '①' },
  { k: 'dev', label: 'Fasi del lavoro', ico: '②' },
  { k: 'report', label: 'Relazione', ico: '③' },
  { k: 'deadlines', label: 'Scadenze', ico: '◷' }
];
const isSimple = () => !window.__forceFull && (!Store.settings || Store.settings.mode !== 'full');
function applyMode() {
  document.body.classList.toggle('simple', isSimple());
  const b = UI.$('#mode-toggle');
  if (b) b.innerHTML = isSimple() ? 'Vista semplice · <u>passa a completa</u>' : 'Vista completa · <u>passa a semplice</u>';
}
Actions['mode-toggle'] = async () => {
  Store.settings.mode = isSimple() ? 'full' : 'simple';
  await Store.saveSettings();
  applyMode(); App.refresh();
  UI.toast(isSimple() ? 'Vista semplice: solo le cose essenziali' : 'Vista completa: tutte le funzioni');
};
/* pagine raggruppate: mostrano una barra di schede in alto */
const GROUPS = {
  calendario: [['deadlines', 'Scadenze e timeline'], ['revisions', 'Revisioni'], ['questions', 'Domande al prof.']],
  materiali: [['brief', 'Consegna'], ['prof', 'Dal professore'], ['examples', 'Esempi'], ['guidelines', 'Linee guida'], ['project', 'Scheda progetto e file']]
};
const groupOf = name => Object.keys(GROUPS).find(g => GROUPS[g].some(([k]) => k === name)) || null;

/* dentro claude.ai la pagina non può usare l'indirizzo (#/…) per navigare: il percorso resta in memoria */
const MEM_ROUTE = !!(window.claude && typeof window.claude.use === 'function');
let memHash = '';
const getHash = () => MEM_ROUTE ? memHash : location.hash;
const setHash = h => { if (MEM_ROUTE) { memHash = h; App.render(); window.scrollTo(0, 0); } else location.hash = h; };
if (MEM_ROUTE) document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href^="#/"]');
  if (!a || e.defaultPrevented) return;
  e.preventDefault();
  if (!a.dataset.action) { closeSidebar(); setHash(a.getAttribute('href')); }
}, true);
const App = {
  route: { name: 'dashboard', id: '', extra: '' },
  ui: {},
  installPrompt: null,
  _today: U.todayISO(),

  /* ---------- ROUTER ---------- */
  parseHash() {
    const parts = (getHash() || '').replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    return { name: parts[0] || 'dashboard', id: parts[1] || '', extra: parts[2] || '' };
  },
  go(name, id = '', extra = '') {
    const h = '#/' + [name, id, extra].map(x => encodeURIComponent(x || '')).join('/').replace(/\/+$/, '');
    closeSidebar();
    if (getHash() === h) this.render(); else setHash(h);
  },
  render() {
    const view = UI.$('#view');
    const r = this.parseHash();
    this.route = r;
    UI.destroyCharts();
    if (!Store.P) {
      view.innerHTML = Views.welcome.render();
      this.renderNav();
      document.title = 'Assistente Progetto Universitario';
      return;
    }
    const v = Views[r.name] || Views.dashboard;
    if (!Views[r.name]) this.route.name = 'dashboard';
    try {
      applyMode();
      const g = isSimple() ? null : groupOf(this.route.name);
      view.innerHTML = (g ? '<div class="tabs group-tabs">' + GROUPS[g].map(([k, l]) => '<button class="' + (k === this.route.name ? 'active' : '') + '" data-action="go" data-route="' + k + '">' + U.esc(l) + '</button>').join('') + '</div>' : '') + v.render(r);
      UI.afterRender(view);
      if (v.mount) v.mount(view, r);
    } catch (e) {
      console.error(e);
      view.innerHTML = '<div class="card sev-CRITICO"><h2>Errore nella visualizzazione</h2><p class="mt-s">' + U.esc(e.message) + '</p><p class="small muted mt-s">I tuoi dati non sono stati modificati. Prova a ricaricare la pagina o esporta un backup.</p><div class="btn-group mt"><button class="btn" data-action="go" data-route="dashboard">Torna alla dashboard</button><button class="btn" data-action="backup-export">Esporta backup</button></div></div>';
    }
    Store.settings.lastRoute = this.route.name;
    this.renderNav();
    document.title = (v.title || '') + ' · ' + (Store.P.info.name || 'Progetto') + ' — Assistente Progetto';
  },
  refresh() {
    const y = window.scrollY;
    const active = document.activeElement && document.activeElement.id;
    this.render();
    window.scrollTo(0, y);
    if (active) { const el = document.getElementById(active); if (el && el.focus && !el.closest('.modal')) el.focus({ preventScroll: true }); }
  },
  refreshNavOnly() { this.renderNav(); },

  /* ---------- NAVIGAZIONE ---------- */
  renderNav() {
    const nav = UI.$('#nav');
    const sel = UI.$('#project-select');
    sel.innerHTML = Store.index.length ? Store.index.slice().sort((a, b) => U.str(a.name).localeCompare(U.str(b.name))).map(p => '<option value="' + p.id + '"' + (Store.P && p.id === Store.P.id ? ' selected' : '') + '>' + U.esc(p.name + (p.isDemo ? ' (demo)' : '')) + '</option>').join('') + '<option value="__new">＋ Nuovo progetto…</option>' : '<option value="__new">＋ Nuovo progetto…</option>';
    if (!Store.P) { nav.innerHTML = '<a href="#/settings" data-action="go" data-route="settings"><span class="ico">⚙</span>Impostazioni</a>'; return; }
    const open = Metrics.openIssues();
    const counts = {
      checks: open.length ? { n: open.length, risk: open.some(i => i.severity === 'CRITICO') } : null,
      questions: (() => { const n = Store.P.questions.filter(q => q.status === 'APERTA').length; return n ? { n } : null; })(),
      deadlines: (() => { const n = Metrics.deadlinesSorted().filter(d => ['RISCHIO', 'SUPERATA'].includes(Metrics.deadlineState(d).risk)).length; return n ? { n, risk: true } : null; })(),
      claude: (() => { const n = Store.P.proposals.reduce((a, b) => a + b.items.filter(i => i.status === 'PROPOSTA').length, 0); return n ? { n } : null; })(),
      brief: !U.str(Store.P.brief.original).trim() ? { n: '!', risk: true } : null,
      prof: (() => { const n = Store.P.profNotes.filter(x => x.category === 'CORREZIONE' && !x.applied).length; return n ? { n, risk: true } : null; })()
    };
    const cur = this.route.name;
    const groupCount = g => { const ks = GROUPS[g].map(x => x[0]); const cs = ks.map(k => counts[k]).filter(Boolean); return cs.length ? { n: cs.reduce((s, c) => s + (typeof c.n === 'number' ? c.n : 1), 0), risk: cs.some(c => c.risk) } : null; };
    const link = (k, label, active, c) => '<a href="#/' + k + '" class="' + (active ? 'active' : '') + '"' + (active ? ' aria-current="page"' : '') + '><span class="ico" aria-hidden="true">' + Views[k].icon + '</span>' + U.esc(label) + (c ? '<span class="cnt' + (c.risk ? ' risk' : '') + '">' + c.n + '</span>' : '') + '</a>';
    if (isSimple()) { nav.innerHTML = NAV_SIMPLE.map(x => '<a href="#/' + x.k + '" class="' + (cur === x.k ? 'active' : '') + '"' + (cur === x.k ? ' aria-current="page"' : '') + '><span class="ico step-ico" aria-hidden="true">' + x.ico + '</span>' + U.esc(x.label) + (counts[x.k] ? '<span class="cnt' + (counts[x.k].risk ? ' risk' : '') + '">' + counts[x.k].n + '</span>' : '') + '</a>').join(''); return; }
    const moreOpen = NAV_MORE.includes(cur);
    nav.innerHTML = NAV.map(x => link(x.k, x.label, x.group ? groupOf(cur) === x.group : cur === x.k, x.group ? groupCount(x.group) : counts[x.k])).join('') +
      '<details class="nav-more"' + (moreOpen ? ' open' : '') + '><summary>Altro</summary>' + NAV_MORE.map(k => link(k, Views[k].title, cur === k, counts[k])).join('') + '</details>';
  },

  /* ---------- PROGETTI ---------- */
  newProjectForm() {
    UI.form({ title: 'Nuovo progetto', size: 'wide', intro: '<p class="small muted">Tutti i campi restano modificabili in seguito.</p>',
      fields: Forms.info().concat([{ key: 'brief', label: 'Consegna ufficiale (testo integrale, puoi inserirla anche dopo)', type: 'textarea', rows: 6 }]),
      submitLabel: 'Crea progetto',
      async onSubmit(v) {
        const brief = v.brief; delete v.brief;
        Store.flush();
        const p = await Store.createProject(v);
        if (U.str(brief).trim()) { p.brief.original = brief; p.brief.savedAt = U.nowISO(); History.log('Consegna ufficiale inserita', 'consegna'); await Store.saveNow(); }
        UI.toast('Progetto creato');
        App.afterProjectChange();
      } });
  },
  afterProjectChange() {
    this.ui = {};
    this.renderNav();
    if (Store.P) this.go('dashboard'); else { if (MEM_ROUTE) memHash = ''; else location.hash = ''; this.render(); }
  },

  /* ---------- STAMPA ---------- */
  print(html) {
    const area = UI.$('#print-area');
    area.innerHTML = html;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(() => { if (document.body.classList.contains('printing')) done(); }, 1500); }, 60);
  }
};

/* ---------- SIDEBAR MOBILE ---------- */
function closeSidebar() { const s = UI.$('#sidebar'); if (s) s.classList.remove('open'); document.body.classList.remove('nav-open'); }
Actions['toggle-sidebar'] = () => { const open = UI.$('#sidebar').classList.toggle('open'); document.body.classList.toggle('nav-open', open); };
/* telefono: il menu laterale si chiude toccando fuori, scegliendo una voce o cambiando pagina;
   i menu a tendina (⋯, Altro) si chiudono toccando fuori o dopo aver scelto */
document.addEventListener('click', e => {
  const t = e.target;
  if (t.closest && (t.closest('.sidebar-backdrop') || (t.closest('#nav a') && !t.closest('summary')))) closeSidebar();
  document.querySelectorAll('details.menu[open]').forEach(d => { if (!d.contains(t) || (t.closest('.menu-pop') && t.closest('button,a') && !t.closest('label'))) d.removeAttribute('open'); });
}, true);
window.addEventListener('hashchange', closeSidebar);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSidebar(); document.querySelectorAll('details.menu[open]').forEach(d => d.removeAttribute('open')); } });
Actions['toggle-theme'] = async () => {
  const cur = document.documentElement.dataset.theme;
  Store.settings.theme = cur === 'dark' ? 'light' : 'dark';
  UI.applyTheme(); await Store.saveSettings(); App.refresh();
};

/* =====================================================================
   RICERCA GLOBALE
   ===================================================================== */
const Search = {
  run(q) {
    const P = Store.P;
    if (!P || U.norm(q).length < 2) return [];
    const nq = U.norm(q);
    const res = [];
    const add = (group, title, text, route, id, extra) => {
      const nt = U.norm(text);
      const i = nt.indexOf(nq);
      if (i < 0 && !U.norm(title).includes(nq)) return;
      const raw = U.str(text).replace(/\s+/g, ' ');
      const snip = i >= 0 ? (i > 40 ? '…' : '') + raw.slice(Math.max(0, i - 40), i + nq.length + 60) + '…' : '';
      res.push({ group, title, snip, route, id: id || '', extra: extra || '' });
    };
    Model.allBlocks().forEach(({ phase, block }) => add('Progetto', Model.blockLabel(block) + ' · Fase ' + (phase.order + 1), Model.blockText(block), 'dev', phase.id, block.id));
    Model.phasesSorted().forEach(ph => { add('Progetto', 'Fase ' + (ph.order + 1) + ': ' + ph.title, ph.title + ' ' + ph.description + ' ' + ph.checklist.map(c => c.text).join(' '), 'dev', ph.id); });
    P.tasks.forEach(t => add('Attività', t.title, t.title + ' ' + t.notes, 'deadlines', t.id));
    P.deadlines.forEach(d => add('Scadenze', d.title + ' · ' + U.fmtDate(d.date), d.title + ' ' + d.description, 'deadlines', d.id));
    add('Consegna', 'Consegna ufficiale', P.brief.original, 'brief');
    P.brief.analysis.forEach(a => add('Consegna', U.truncate(a.text, 60), a.text, 'brief', a.id));
    P.profNotes.forEach(n => add('Indicazioni professore', n.title + ' · ' + n.category, n.title + ' ' + n.content + ' ' + n.notes, 'prof', n.id));
    P.guidelines.forEach(g => add('Linee guida', g.title, g.title + ' ' + g.description + ' ' + g.motivation + ' ' + g.notes, 'guidelines', g.id));
    P.examples.forEach(e => add('Esempi', e.title, e.title + ' ' + e.description + ' ' + e.text + ' ' + e.knownErrors, 'examples', e.id));
    P.issues.forEach(i => add('Errori', i.category + ' · ' + i.status, i.problem + ' ' + i.element + ' ' + i.notes, 'checks', i.id));
    P.revisions.forEach(r => add('Revisioni', 'Revisione ' + U.fmtDate(r.date), [r.topics, r.materials, r.openProblems, r.corrections, r.indications, r.nextActions, r.notes].join(' '), 'revisions', r.id));
    P.questions.forEach(x => add('Domande', U.truncate(x.text, 60), x.text + ' ' + x.answer + ' ' + x.topic, 'questions', x.id));
    P.report.sections.forEach(s => add('Relazione', s.title, s.title + ' ' + s.content, 'report', s.id));
    P.claudeNotes.forEach(n => add('Claude', n.title, n.title + ' ' + n.content, 'claude'));
    P.files.forEach(f => add('File', f.name, f.name + ' ' + f.description + ' ' + f.ref, 'project'));
    return res;
  },
  show(q) {
    const box = UI.$('#search-results');
    const res = this.run(q);
    if (!q || U.norm(q).length < 2) { box.hidden = true; return; }
    if (!res.length) { box.innerHTML = '<p class="small muted" style="padding:8px">Nessun risultato per "' + U.esc(q) + '"</p>'; box.hidden = false; return; }
    const groups = {};
    res.forEach(r => { (groups[r.group] = groups[r.group] || []).push(r); });
    box.innerHTML = Object.entries(groups).map(([g, list]) => '<div class="sr-group">' + U.esc(g) + ' (' + list.length + ')</div>' + list.slice(0, 8).map(r => '<button class="sr-item" data-action="search-go" data-route="' + r.route + '" data-id="' + U.attr(r.id) + '" data-extra="' + U.attr(r.extra) + '">' + U.highlight(r.title, q) + (r.snip ? '<small>' + U.highlight(r.snip, q) + '</small>' : '') + '</button>').join('')).join('');
    box.hidden = false;
  }
};
Actions['search-go'] = d => { UI.$('#search-results').hidden = true; App.go(d.route, d.id, d.extra); };

/* =====================================================================
   BACKUP
   ===================================================================== */
const Backup = {
  async exportProject(includeFiles = true) {
    Store.flush();
    const P = Store.P;
    const out = { format: 'assistente-progetto-backup', formatVersion: 1, app: C.APP_VERSION, exportedAt: U.nowISO(), project: P, files: [] };
    if (includeFiles) {
      const recs = await DB.filesOf(P.id);
      for (const r of recs) { if (r.blob) out.files.push({ id: r.id, name: r.name, type: r.type, size: r.size, data: await U.blobToDataURL(r.blob) }); }
    }
    const name = U.slug(P.info.name) + '-backup-' + U.todayISO() + '.json';
    U.download(name, JSON.stringify(out), 'application/json');
    P.lastBackupAt = U.nowISO();
    History.log('Esportato backup ' + (includeFiles ? 'completo (con ' + out.files.length + ' file)' : 'senza file'), 'backup');
    Store.touch();
    UI.toast('Backup esportato: ' + name);
  },
  async importFile(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { throw new Error('Il file non è un JSON valido'); }
    return this.importData(data, file.name);
  },
  async importData(data, sourceName) {
    let project = data && data.format === 'assistente-progetto-backup' ? data.project : (data && data.info && data.id ? data : null);
    if (!project) throw new Error('Il file non sembra un backup di Assistente Progetto');
    project = normalizeProject(project);
    const files = U.arr(data.files);
    const exists = Store.index.find(p => p.id === project.id);
    let mode = 'new';
    if (exists) {
      mode = await new Promise(res => {
        let choice = null;
        const m = UI.modal({ title: 'Progetto già presente', size: 'narrow', body: '<p>Nel browser esiste già il progetto "' + U.esc(exists.name) + '". Cosa vuoi fare?</p>',
          footer: '<button class="btn" data-c>Annulla</button><button class="btn" data-copy>Importa come copia</button><button class="btn danger" data-rep>Sostituisci</button>', onClose: () => res(choice) });
        m.el.querySelector('[data-c]').onclick = () => m.close();
        m.el.querySelector('[data-copy]').onclick = () => { choice = 'copy'; m.close(); };
        m.el.querySelector('[data-rep]').onclick = () => { choice = 'replace'; m.close(); };
      });
      if (!mode) return null;
    }
    const fileMap = {};
    if (mode === 'copy') {
      project.id = U.uid('prj');
      project.info.name = project.info.name + ' (copia)';
      project.files.forEach(f => { fileMap[f.id] = U.uid('file'); });
      const remap = id => fileMap[id] || id;
      project.files.forEach(f => { f.id = remap(f.id); });
      project.profNotes.forEach(n => { n.fileIds = U.arr(n.fileIds).map(remap); });
      project.examples.forEach(n => { n.fileIds = U.arr(n.fileIds).map(remap); });
      project.phases.forEach(ph => ph.blocks.forEach(b => { if (b.fileId) b.fileId = remap(b.fileId); if (b.fileIds) b.fileIds = b.fileIds.map(remap); }));
    }
    if (mode === 'replace') await DB.deleteProjectFiles(project.id);
    let restored = 0;
    for (const f of files) {
      try {
        const id = fileMap[f.id] || f.id;
        await DB.put('files', { id, projectId: project.id, blob: U.dataURLtoBlob(f.data), name: f.name, type: f.type, size: f.size });
        restored++;
      } catch (e) { console.warn('File non ripristinato', f.name, e); }
    }
    const withBlob = new Set(files.map(f => fileMap[f.id] || f.id));
    project.files.forEach(f => { if (f.storedBlob && !withBlob.has(f.id)) f.storedBlob = false; });
    Store.flush();
    History.activity(project, 'Progetto importato (' + sourceName + ')', 'backup');
    await Store.createProject(null, { project });
    return { project, restored, mode };
  }
};
Actions['backup-export'] = d => Backup.exportProject(!d.nofiles).catch(e => UI.toast('Esportazione non riuscita: ' + e.message, 'err'));
Actions['backup-import'] = async () => {
  const [f] = await UI.pickFiles({ multiple: false, accept: '.json,application/json' });
  if (!f) return;
  try {
    const r = await Backup.importFile(f);
    if (!r) return;
    UI.toast('Importato "' + r.project.info.name + '"' + (r.restored ? ' con ' + r.restored + ' file' : ''));
    App.afterProjectChange();
  } catch (e) { UI.toast('Importazione non riuscita: ' + e.message, 'err'); }
};


/* =====================================================================
   PROGETTO BPM OPSFLOW PRECARICATO (js/bpm-data.js)
   Elimina tutti i progetti di prova di questo browser e carica il
   progetto reale già calibrato. Chiede sempre conferma.
   ===================================================================== */
async function loadBpmPreset(ask = true) {
  if (!window.BPM_PRESET) return UI.toast('Dati del progetto BPM non trovati (manca js/bpm-data.js)', 'err');
  const victims = Sync.on ? Store.index.filter(p => p.isDemo) : Store.index.slice();
  const n = victims.length;
  if (ask && !(await UI.confirm((n ? 'Verranno eliminati DEFINITIVAMENTE ' + U.plural(n, 'progetto', 'progetti') + ' (' + victims.map(p => '"' + p.name + '"').join(', ') + ').\n\n' : '') + 'Poi verrà caricato il progetto "BPM · Team OpsFlow 2026/27" con calendario M1–M9, team e shortlist del D1, esercitazioni 1-2 ed esempi D4.', { title: 'Riparti con il progetto OpsFlow', okLabel: n ? 'Elimina e carica OpsFlow' : 'Carica OpsFlow', danger: n > 0 }))) return;
  Store.flush();
  for (const p of victims) await Store.deleteProject(p.id);
  const data = U.clone(window.BPM_PRESET);
  data.project.createdAt = U.nowISO();
  await Backup.importData(data, 'progetto OpsFlow precaricato');
  Store.settings.bpmPresetApplied = true;
  Store.settings.bpmPresetVersion = window.BPM_PRESET_VERSION || 1;
  if (Store.P) { Store.P.presetVersion = window.BPM_PRESET_VERSION || 1; Store.touch(); }
  await Store.saveSettings();
  UI.toast(Sync.on ? 'Progetto OpsFlow caricato e condiviso con il team.' : 'Progetto OpsFlow caricato. Dati di prova eliminati.');
  App.afterProjectChange();
}
Actions['bpm-preset'] = () => loadBpmPreset(true);
/** aggiornamento non distruttivo del progetto OpsFlow già caricato */
async function upgradeOpsFlow() {
  const P = Store.P, src = window.BPM_PRESET.project;
  await Uploader.applyD4Structure(true);
  // D1 (team e shortlist) fuori dal testo della relazione
  const d1 = P.phases.find(ph => /^d1\b/i.test(U.norm(ph.title)));
  const sumId = (P.report.sections.find(s => s.title === 'Summary') || {}).id;
  if (d1) d1.blocks.forEach(b => { if (b.section && b.section === sumId) b.section = ''; });
  ['teamName', 'company', 'referent'].forEach(k => { if (!U.str(P.info[k]).trim() && src.info && src.info[k]) P.info[k] = src.info[k]; });
  let added = 0;
  src.phases.forEach(sp => {
    const ph = P.phases.find(x => U.norm(x.title) === U.norm(sp.title));
    if (!ph) return;
    sp.checklist.forEach(c => { if (!ph.checklist.some(x => U.norm(x.text) === U.norm(c.text))) { ph.checklist.push(Factory.checkItem(c.text)); added++; } });
  });
  History.log('Progetto aggiornato alla versione ' + window.BPM_PRESET_VERSION + ' (struttura D4, ' + added + ' punti di checklist)', 'progetto');
  Store.settings.bpmPresetVersion = window.BPM_PRESET_VERSION;
  P.presetVersion = window.BPM_PRESET_VERSION;
  await Store.saveSettings();
  await Store.saveNow();
}

/* =====================================================================
   DATI DEMO
   ===================================================================== */
Actions['demo-load'] = async () => {
  const ex = Store.index.find(p => p.isDemo);
  if (ex && !(await UI.confirm('Esiste già un progetto demo. Crearne un altro?'))) { await Store.switchProject(ex.id); return App.afterProjectChange(); }
  Store.flush();
  const p = Demo.build();
  await Store.createProject(null, { project: p });
  Checker.run();
  await Store.saveNow();
  UI.toast('Progetto demo caricato: contiene alcuni errori voluti da scoprire con il Project Checker');
  App.afterProjectChange();
};
Actions['demo-delete'] = async () => {
  const demos = Store.index.filter(p => p.isDemo);
  if (!demos.length) return UI.toast('Nessun progetto demo presente');
  if (!(await UI.confirm('Eliminare ' + U.plural(demos.length, 'progetto demo', 'progetti demo') + ' e i relativi file? I progetti reali non vengono toccati.', { okLabel: 'Elimina dati demo', danger: true }))) return;
  for (const p of demos) await Store.deleteProject(p.id);
  await Store.saveSettings();
  UI.toast('Dati demo eliminati');
  App.afterProjectChange();
};

/* =====================================================================
   EVENTI GLOBALI
   ===================================================================== */
function bindEvents() {
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-action]');
    if (!el) {
      if (!e.target.closest('.search')) { const sr = UI.$('#search-results'); if (sr) sr.hidden = true; }
      return;
    }
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    const fn = Actions[el.dataset.action];
    if (!fn) { console.warn('Azione non definita: ' + el.dataset.action); return; }
    e.preventDefault();
    try { await fn(el.dataset, el, e); } catch (err) { console.error(err); UI.toast('Errore: ' + err.message, 'err'); }
  });
  document.addEventListener('change', async e => {
    const el = e.target;
    if (el.dataset && el.dataset.change) {
      const fn = Actions[el.dataset.change];
      if (fn) { try { await fn(el.dataset, el, e); } catch (err) { console.error(err); UI.toast('Errore: ' + err.message, 'err'); } }
      return;
    }
    if (el.dataset && el.dataset.bind && Binders[el.dataset.bind]) { try { Binders[el.dataset.bind](el, 'change'); } catch (err) { console.error(err); } }
  });
  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset && el.dataset.bind && Binders[el.dataset.bind]) { try { Binders[el.dataset.bind](el, 'input'); } catch (err) { console.error(err); UI.toast('Errore: ' + err.message, 'err'); } }
  });
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (el.dataset && el.dataset.bind) { el._orig = el.value; if (Binders[el.dataset.bind]) try { Binders[el.dataset.bind](el, 'focus'); } catch (err) { /* */ } }
  });
  document.addEventListener('keyup', e => { if (e.target && e.target.id === 'sec-content') Report._caret = e.target.selectionStart; });
  document.addEventListener('mouseup', e => { if (e.target && e.target.id === 'sec-content') Report._caret = e.target.selectionStart; });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { const sr = UI.$('#search-results'); if (sr && !sr.hidden) { sr.hidden = true; return; } if (UI.closeTop()) return; closeSidebar(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); UI.$('#global-search').focus(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); Store.flush(); UI.toast('Salvato'); }
  });
  const si = UI.$('#global-search');
  const deb = U.debounce(() => Search.show(si.value), 180);
  si.addEventListener('input', deb);
  si.addEventListener('focus', () => { if (si.value) Search.show(si.value); });
  si.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { const f = UI.$('#search-results .sr-item'); if (f) { e.preventDefault(); f.focus(); } } });
  UI.$('#search-results').addEventListener('keydown', e => {
    const items = UI.$$('#search-results .sr-item'), i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i < items.length - 1) { e.preventDefault(); items[i + 1].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) items[i - 1].focus(); else si.focus(); }
  });
  UI.$('#project-select').addEventListener('change', async e => {
    const v = e.target.value;
    if (v === '__new') { App.renderNav(); return App.newProjectForm(); }
    try { await Store.switchProject(v); App.afterProjectChange(); } catch (err) { UI.toast(err.message, 'err'); }
  });
  window.addEventListener('hashchange', () => App.render());
  window.addEventListener('beforeunload', e => { if (Store.pending) { Store.flush(); e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Store.flush(); else checkDayChange(); });
  if (window.matchMedia) { const mq = matchMedia('(prefers-color-scheme: dark)'); const f = () => { if (Store.settings.theme === 'auto') { UI.applyTheme(); App.refresh(); } }; if (mq.addEventListener) mq.addEventListener('change', f); }
  window.addEventListener('error', e => { if (e.message && !/ResizeObserver/.test(e.message)) UI.toast('Errore imprevisto: ' + e.message, 'err'); });
  window.addEventListener('unhandledrejection', e => { const m = e.reason && e.reason.message ? e.reason.message : String(e.reason); UI.toast('Errore: ' + m, 'err'); });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); App.installPrompt = e; });
  setInterval(checkDayChange, 60000);
}
/** le date relative (giorni mancanti) si aggiornano al cambio di giorno */
function checkDayChange() { const t = U.todayISO(); if (t !== App._today) { App._today = t; if (!document.querySelector('.modal-back')) App.refresh(); } }

/* =====================================================================
   TEAM — collegamento al progetto condiviso (Supabase) e link di invito
   ===================================================================== */
const TeamUI = {
  card() {
    if (MEM_ROUTE) return '';
    if (Sync.on && Sync.kind === 'team') return '<div class="sh-note"><b>✓ Progetto condiviso con il team.</b> Per far entrare un compagno mandagli il link di invito: lo apre e lavora sugli stessi dati. <button class="btn sm primary" data-action="team-invite">Copia link di invito</button> <button class="btn sm adv" data-action="team-leave">Scollega questo browser</button></div>';
    return '<div class="sh-note"><b>Lavorate in più persone?</b> Collegate il progetto al server del team: ognuno vedrà le modifiche degli altri. <button class="btn sm primary" data-action="team-setup">Collega il progetto del team</button></div>';
  }
};
Actions['team-setup'] = () => {
  const c = Team.config() || {};
  UI.form({ title: 'Collega il progetto del team', size: 'wide',
    intro: '<p class="small muted">Servono i dati del server del team (Supabase): li trovi nella guida <b>GUIDA-TEAM.md</b>. Se un compagno ti ha mandato un <b>link di invito</b>, apri quello invece di compilare qui.</p>',
    fields: [{ key: 'url', label: 'Indirizzo del server (Project URL)', type: 'text', placeholder: 'https://xxxx.supabase.co' },
      { key: 'key', label: 'Chiave pubblica (anon / publishable key)', type: 'text' },
      { key: 'code', label: 'Codice del team', type: 'text', placeholder: 'opsflow-…' },
      { key: 'name', label: 'Il tuo nome (lo vedono gli altri quando modifichi)', type: 'text' }],
    value: { url: c.url || '', key: c.key || '', code: c.code || '', name: c.name || '' },
    submitLabel: 'Collega',
    async onSubmit(v) {
      const cfg = { url: v.url.trim(), key: v.key.trim(), code: v.code.trim(), name: v.name.trim() };
      if (!/^https:\/\/.+/.test(cfg.url) || !cfg.key || !cfg.code) throw new Error('Compila indirizzo, chiave e codice');
      try { await Team.test(cfg); } catch (e) { throw new Error(e.code === 'bad_code' ? 'Codice del team non valido' : e.code === 'not_setup' ? 'Il server non ha ancora le tabelle: esegui supabase-setup.sql (vedi guida)' : 'Collegamento non riuscito: ' + e.message); }
      Store.flush();
      Team.save(cfg);
      UI.toast('Collegato. Ricarico…');
      setTimeout(() => location.reload(), 700);
    } });
};
Actions['team-invite'] = async () => {
  const c = Team.config(); if (!c) return;
  const link = Team.inviteLink(c);
  const copied = await U.copy(link);
  UI.modal({ title: 'Link di invito per il team', body: '<p class="small">' + (copied ? 'Link copiato ✓. ' : '') + 'Mandalo ai compagni (WhatsApp, email): aprendolo entrano nel progetto, senza account. <b>Chi ha il link può modificare il progetto</b>: non pubblicarlo.</p>' +
    (location.protocol === 'file:' ? '<p class="small" style="color:var(--warn)">Attenzione: stai usando l\'app aperta da file sul tuo computer, quindi il link funziona solo qui. Usa il link del sito (GitHub Pages, vedi guida).</p>' : '') +
    '<textarea readonly rows="4" style="width:100%;margin-top:8px" onclick="this.select()">' + U.esc(link) + '</textarea>', footer: '<button class="btn primary" data-close>Fatto</button>' }).el.querySelector('[data-close]').onclick = function () { this.closest('.modal-back') && UI.closeTop(); };
};
Actions['team-leave'] = async () => {
  if (!(await UI.confirm('Scollegare questo browser dal progetto del team? I dati condivisi restano sul server; qui resta una copia locale non più aggiornata.', { okLabel: 'Scollega', danger: true }))) return;
  Team.save(null); location.reload();
};
async function teamJoinFromLink(inv) {
  history.replaceState(null, '', location.href.split('#')[0] + '#/dashboard');
  return new Promise(res => {
    UI.form({ title: 'Entra nel progetto del team',
      intro: '<p class="small muted">Hai aperto un link di invito. Scrivi il tuo nome: lo vedranno gli altri quando aggiorni qualcosa.</p>',
      fields: [{ key: 'name', label: 'Il tuo nome', type: 'text', placeholder: 'es. Beatrice' }], submitLabel: 'Entra',
      async onSubmit(v) {
        const cfg = Object.assign({}, inv, { name: v.name.trim() });
        try { await Team.test(cfg); } catch (e) { throw new Error(e.code === 'bad_code' ? 'Il link non è più valido: chiedi un nuovo invito' : 'Server del team non raggiungibile: ' + e.message); }
        Team.save(cfg); res(true);
      } });
    const back = document.querySelector('.modal-back:last-child [data-cancel]'); if (back) back.addEventListener('click', () => res(false));
  });
}

/* =====================================================================
   AVVIO
   ===================================================================== */
async function start() {
  UI.$('#app-version').textContent = 'v' + C.APP_VERSION;
  if (MEM_ROUTE) document.body.classList.add('in-claude');
  applyMode();
  bindEvents();
  Store.onSave(s => UI.setSaveIndicator(s));
  try { await Store.init(); }
  catch (e) { console.error(e); UI.toast('Impossibile aprire l\'archivio locale: ' + e.message, 'err'); }
  // progetto del team su Supabase (link di invito o collegamento salvato)
  if (!MEM_ROUTE) {
    const inv = Team.fromHash();
    if (inv) await teamJoinFromLink(inv);
    const cfg = Team.config();
    if (cfg) {
      UI.$('#view').innerHTML = '<div class="empty" style="margin-top:60px"><h3>Collegamento al progetto del team…</h3><p class="small muted">Carico l\'ultima versione condivisa.</p></div>';
      try { await Sync.init(Team.backend(cfg)); }
      catch (e) { console.error(e); UI.toast((e.code === 'bad_code' ? 'Codice del team non valido. ' : 'Server del team non raggiungibile. ') + 'Per ora lavori solo su questo computer: le modifiche di adesso non arrivano agli altri.', 'err'); }
    }
  }
  // aperta da claude.ai: progetto condiviso con il team
  if (window.claude && typeof window.claude.use === 'function') {
    UI.$('#view').innerHTML = '<div class="empty" style="margin-top:60px"><h3>Collegamento al progetto del team…</h3><p class="small muted">Un attimo: carico l\'ultima versione condivisa.</p></div>';
    try { await Sync.init(); } catch (e) { console.error(e); UI.toast('Progetto condiviso non disponibile: lavori solo su questo computer.', 'err'); }
  }
  UI.applyTheme();
  if (DB.isFallback) UI.toast('IndexedDB non disponibile: salvataggio limitato. Esporta spesso un backup.', 'err');
  if (MEM_ROUTE) { if (!memHash && Store.P) memHash = '#/dashboard'; }
  else if (!location.hash && Store.P) location.replace('#/dashboard');
  App.render();
  const ops = Store.index.find(p => /OpsFlow/.test(p.name));
  // la versione del preset è salvata nel progetto (condiviso), non nel browser
  if (Store.P && /OpsFlow/.test(Store.P.info.name) && !Store.P.presetVersion && Store.P.report.sections.some(s => s.title === 'The BPM project') && (Store.settings.bpmPresetVersion || 0) >= (window.BPM_PRESET_VERSION || 1)) { Store.P.presetVersion = window.BPM_PRESET_VERSION; Store.touch(); }
  const opsVer = Store.P && Store.P.id === (ops || {}).id ? (Store.P.presetVersion || Store.settings.bpmPresetVersion || 1) : (Store.settings.bpmPresetVersion || 1);
  if (window.BPM_PRESET && ops && opsVer < (window.BPM_PRESET_VERSION || 1)) {
    setTimeout(() => {
      const m = UI.modal({ title: 'Aggiornamento del progetto OpsFlow', size: 'narrow',
        body: '<p>Novità per il progetto <b>' + U.esc(ops.name) + '</b>:</p><ul class="small mt-s"><li>le sezioni della relazione ora hanno <b>testo</b>: Summary composto con i dati del progetto, frasi che introducono tabelle e figure, e il pulsante <b>Fai scrivere questa sezione a Claude</b></li><li>team e shortlist del D1 vanno solo in copertina, non nel Summary</li><li>relazione nel <b>formato dei D4 precedenti</b>: copertina, Index, capitoli numerati 1. / 2.1. / 2.4.1., Summary e Bibliography</li><li>pulsante <b>Scarica Word (formato D4)</b>: il documento si compone con quello che avete fatto nelle fasi</li><li>in ogni fase potete <b>caricare PDF e Word</b>: paragrafi, tabelle e figure diventano blocchi e vanno nella sezione giusta della relazione</li></ul><p class="small mt-s">Quello che hai già scritto non viene toccato: il testo delle sezioni esistenti resta e prima viene salvata una versione della relazione.</p>',
        footer: '<button class="btn" data-later>Più tardi</button><button class="btn primary" data-go>Aggiorna</button>' });
      m.el.querySelector('[data-later]').onclick = () => m.close();
      m.el.querySelector('[data-go]').onclick = async () => {
        m.close();
        if (Store.P.id !== ops.id) await Store.switchProject(ops.id);
        await upgradeOpsFlow();
        App.afterProjectChange();
        UI.toast('Progetto OpsFlow aggiornato');
      };
    }, 400);
  } else if (window.BPM_PRESET && !Store.settings.bpmPresetApplied && !ops) {
    setTimeout(async () => {
      const m = UI.modal({ title: 'Progetto BPM OpsFlow pronto', size: 'narrow',
        body: '<p>È disponibile il progetto <b>BPM · Team OpsFlow 2026/27</b>, già calibrato con calendario M1–M9, revisioni, team e shortlist del Deliverable #1, esercitazioni 1-2 ed esempi D4.</p>' + (Sync.on ? '<p class="mt-s small">Il progetto sarà <b>condiviso</b>: chi apre questo link vede e modifica gli stessi dati. Se avevi già lavorato con la versione precedente dell\'app, scegli <b>Importa il mio backup</b> e seleziona il file di backup esportato.</p>' : '') + (Store.index.length && !Sync.on ? '<p class="mt-s">Caricandolo verranno <b>eliminati i ' + Store.index.length + ' progetti di prova</b> presenti in questo browser.</p>' : ''),
        footer: '<button class="btn" data-never>Non chiedere più</button><button class="btn" data-later>Più tardi</button>' + (Sync.on ? '<button class="btn" data-import>Importa il mio backup</button>' : '') + '<button class="btn primary" data-go>' + (Store.index.length && !Sync.on ? 'Elimina i dati di prova e carica' : 'Carica il progetto') + '</button>' });
      const imp = m.el.querySelector('[data-import]'); if (imp) imp.onclick = () => { m.close(); Actions['backup-import'](); };
      m.el.querySelector('[data-later]').onclick = () => m.close();
      m.el.querySelector('[data-never]').onclick = async () => { Store.settings.bpmPresetApplied = true; await Store.saveSettings(); m.close(); };
      m.el.querySelector('[data-go]').onclick = async () => { m.close(); await loadBpmPreset(false); };
    }, 400);
  }
  // le librerie esterne (KaTeX, Chart.js) arrivano in modo asincrono: ridisegna quando sono pronte
  window.addEventListener('load', () => { if (Store.P && (window.katex || window.Chart)) App.refresh(); });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.claude) {
    navigator.serviceWorker.register('service-worker.js').catch(err => console.warn('Service worker non registrato', err));
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
