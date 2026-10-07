/* =====================================================================
   DATA · PROJECT · STATE
   - Costanti di dominio (gerarchia fonti, stati, priorità…)
   - Fabbrica e normalizzazione del progetto (migrazioni future)
   - Store: progetto corrente, elenco progetti, impostazioni, autosave
   - Model: CRUD generico sulle collezioni con ID univoci
   - History: cronologia attività + versioni degli elementi
   - Metrics: progresso reale, project health, scadenze, "cosa fare adesso"
   ===================================================================== */
'use strict';

/* ---------- COSTANTI ---------- */
const C = {
  APP_VERSION: '1.9.0',
  SCHEMA: 1,
  SOURCES: [
    { id: 'CORREZIONE_PROF', rank: 1, label: 'Correzione diretta del professore' },
    { id: 'CONSEGNA', rank: 2, label: 'Consegna ufficiale' },
    { id: 'INDICAZIONE_PROF', rank: 3, label: 'Indicazione ufficiale del professore' },
    { id: 'CRITERI', rank: 4, label: 'Criteri di valutazione' },
    { id: 'ESEMPI_CORRETTI', rank: 5, label: 'Esercizi/progetti corretti dal professore' },
    { id: 'STUDENTE', rank: 6, label: 'Materiale sviluppato dallo studente' },
    { id: 'AI', rank: 7, label: 'Suggerimento AI' }
  ],
  PROF_CATEGORIES: ['INDICAZIONE UFFICIALE', 'CORREZIONE', 'CONSIGLIO', 'REQUISITO', 'CRITERIO DI VALUTAZIONE', 'NOTA'],
  PROF_CAT_SOURCE: { 'CORREZIONE': 'CORREZIONE_PROF', 'INDICAZIONE UFFICIALE': 'INDICAZIONE_PROF', 'REQUISITO': 'INDICAZIONE_PROF',
    'CONSIGLIO': 'INDICAZIONE_PROF', 'CRITERIO DI VALUTAZIONE': 'CRITERI', 'NOTA': 'INDICAZIONE_PROF' },
  PROF_SOURCES_KIND: ['Lezione', 'Email', 'Messaggio', 'Revisione', 'Ricevimento', 'Documento', 'Altro'],
  PRIORITIES: ['BASSA', 'MEDIA', 'ALTA', 'CRITICA'],
  GUIDE_STATUS: ['NON INIZIATA', 'IN CORSO', 'DA VERIFICARE', 'COMPLETATA', 'APPROVATA'],
  GUIDE_SCORE: { 'NON INIZIATA': 0, 'IN CORSO': 0.4, 'DA VERIFICARE': 0.7, 'COMPLETATA': 0.9, 'APPROVATA': 1 },
  TASK_STATUS: ['DA FARE', 'IN CORSO', 'COMPLETATA'],
  DEADLINE_STATUS: ['APERTA', 'COMPLETATA', 'ANNULLATA'],
  DEADLINE_KIND: ['SCADENZA', 'MILESTONE', 'CONSEGNA INTERMEDIA', 'CONSEGNA FINALE'],
  REVISION_STATUS: ['PIANIFICATA', 'SVOLTA', 'ANNULLATA'],
  QUESTION_STATUS: ['APERTA', 'POSTA', 'RISPOSTA', 'ARCHIVIATA'],
  SEVERITY: ['INFO', 'ATTENZIONE', 'PROBABILE ERRORE', 'CRITICO'],
  SEV_RANK: { 'INFO': 0, 'ATTENZIONE': 1, 'PROBABILE ERRORE': 2, 'CRITICO': 3 },
  ISSUE_STATUS: ['APERTO', 'RIVEDI DOPO', 'IN CORREZIONE', 'RISOLTO', 'IGNORATO', 'NON È UN ERRORE'],
  ISSUE_ACTIVE: ['APERTO', 'RIVEDI DOPO', 'IN CORREZIONE'],
  ORIGINS: ['UTENTE', 'PROFESSORE', 'CLAUDE', 'CONTROLLO AUTOMATICO', 'MEMBRO DEL GRUPPO'],
  BLOCK_TYPES: {
    text: 'Testo', formula: 'Formula', calc: 'Calcolo', result: 'Risultato', table: 'Tabella', chart: 'Grafico',
    image: 'Immagine', observation: 'Osservazione', interpretation: 'Interpretazione', note: 'Nota', attachment: 'Allegati'
  },
  BLOCK_STATUS: ['BOZZA', 'DA VERIFICARE', 'VERIFICATO'],
  REPORT_STATUS: ['VUOTA', 'BOZZA', 'RIVISTA', 'FINALE'],
  REPORT_SCORE: { 'VUOTA': 0, 'BOZZA': 0.5, 'RIVISTA': 0.8, 'FINALE': 1 },
  BRIEF_CATS: [
    { id: 'objectives', label: 'Obiettivi' }, { id: 'constraints', label: 'Vincoli' }, { id: 'mandatory', label: 'Elementi obbligatori' },
    { id: 'data', label: 'Dati richiesti' }, { id: 'results', label: 'Risultati richiesti' }, { id: 'deliverables', label: 'Elaborati richiesti' },
    { id: 'deadlines', label: 'Scadenze' }
  ],
  FILE_CATEGORIES: ['Consegna', 'Materiale professore', 'Esempio', 'Dati', 'Immagine', 'Elaborato', 'Relazione', 'Altro'],
  DEFAULT_REPORT: [
    ['Introduzione', true], ['Obiettivo', true], ['Metodologia', true], ['Dati', true], ['Sviluppo', false], ['Calcoli', false],
    ['Risultati', true], ['Analisi', false], ['Discussione', false], ['Conclusioni', true], ['Bibliografia', true], ['Allegati', false]
  ],
  DEFAULT_CHECKLIST: ['Dati raccolti', 'Dati controllati', 'Formula verificata', 'Calcolo completato', 'Risultato verificato',
    'Grafico realizzato', 'Interpretazione scritta', 'Revisione effettuata', 'Inserito nella relazione'],
  /* Struttura della relazione ricavata dai D4 degli anni precedenti (InGenius, Don't Let Me Manage!, 3MG).
     [titolo, livello (1-3), numerata, obbligatoria, nota, vecchi titoli equivalenti] */
  D4_REPORT: [
    ['Summary', 1, false, true, 'Prima del capitolo 1 (InGenius, Don\'t Let Me Manage!). Racconta il semestre: scelta dell\'azienda e motivazioni, incontri con il referente, processo scelto, problema principale, soluzione TO-BE e risultati.', ['sintesi', 'sommario', 'abstract', 'introduzione']],
    ['The company and its business processes', 1, true, false, 'Capitolo 1. Le sottosezioni contengono il dettaglio.', []],
    ['General characteristics', 2, true, true, 'Storia dell\'azienda, organizzazione/organigramma (figura), prodotti/servizi, mercato e concorrenti, indici finanziari (ROI, ROE, ROS…).', ['the company and its business processes', 'company description']],
    ['Supply chain analysis', 2, true, true, 'Supply chain, fornitori, clienti, logistica.', []],
    ['Main company\'s business processes (Value chain)', 2, true, true, 'Value chain di Porter: attività primarie e di supporto, con figura (metodo dell\'Esercitazione 1).', ['value chain', 'company process analysis (value chain)']],
    ['The BPM project', 1, true, false, 'Capitolo 2.', []],
    ['Overview of the specific process', 2, true, true, 'Processo scelto, fasi del processo, problema riscontrato, KPI di processo (eventuale SIPOC, Esercitazione 2).', ['process description and performance indicators', 'process analysis']],
    ['Plan of attack', 2, true, true, 'Obiettivo, piano di lavoro e motivazioni.', []],
    ['Software description', 2, true, false, 'Software usati (es. Bizagi, Arena, gestionale dell\'azienda) e motivazioni.', ['software', 'software description']],
    ['AS-IS mapping and modelling', 2, true, false, 'Introduzione breve alla modellazione AS-IS.', []],
    ['AS-IS modelling in IDEF0', 3, true, true, 'Context diagram (A-0), nodo A0 e scomposizioni; contesto, obiettivo e punto di vista della modellazione; input, output, controlli e meccanismi.', []],
    ['AS-IS modelling in BPMN', 3, true, true, 'Diagramma BPMN (es. Bizagi) con pool/lane e descrizione del flusso.', []],
    ['AS-IS modelling in UML', 3, true, true, 'Use case diagram e activity diagram, con descrizione.', []],
    ['Quantitative analysis of the AS-IS process in Arena', 2, true, true, 'Modello Arena: moduli (Create, Process, Decide…), parametri e distribuzioni, run setup, output analyzer.', ['as-is quantitative analysis and simulation (arena)', 'quantitative analysis as-is in arena']],
    ['Analysis of the critical issues', 2, true, true, 'Criticità del processo AS-IS, cause, proposte di miglioramento.', ['critical analysis', 'analysis of critical issues and improvements']],
    ['Process re-engineering: TO-BE solution', 2, true, false, 'Descrizione della soluzione TO-BE proposta.', ['to-be process']],
    ['TO-BE modelling in IDEF0', 3, true, true, '', []],
    ['TO-BE modelling in BPMN', 3, true, true, '', []],
    ['TO-BE modelling in UML', 3, true, true, '', []],
    ['Quantitative analysis of the TO-BE process in Arena', 3, true, true, 'Modello Arena TO-BE e output.', ['to-be quantitative analysis and simulation (arena)', 'quantitative analysis to-be in arena']],
    ['AS-IS vs TO-BE comparison', 2, true, true, 'Confronto dei KPI AS-IS/TO-BE, compare means.', ['kpi comparison between as-is and to-be models']],
    ['Sensitivity analysis', 2, true, true, '', []],
    ['Conclusions', 1, true, true, 'Capitolo 3. Risultati ottenuti, benefici per l\'azienda, limiti e sviluppi futuri.', ['conclusion', 'conclusioni']],
    ['Bibliography', 1, false, true, 'Fonti citate (siti, libri, documenti aziendali).', ['bibliografia', 'references']],
    ['Appendix', 1, false, false, 'Figure di dettaglio (moduli Arena, nodi IDEF0).', ['appendice', 'allegati']]
  ],
  CUSTOM_RULE_TYPES: [
    { id: 'chart-axis-units', label: 'Ogni grafico deve indicare titolo e unità degli assi', params: [] },
    { id: 'table-before-chart', label: 'In ogni fase la tabella deve precedere il grafico', params: [] },
    { id: 'block-field', label: 'Ogni blocco di un tipo deve avere un campo compilato', params: ['blockType', 'field'] },
    { id: 'report-contains', label: 'La relazione deve contenere un termine/espressione', params: ['term'] },
    { id: 'forbidden-term', label: 'Termine da non usare (usa un termine alternativo)', params: ['term', 'replacement'] },
    { id: 'report-section', label: 'Sezione obbligatoria nella relazione', params: ['term'] },
    { id: 'min-words', label: 'Numero minimo di parole in una sezione della relazione', params: ['term', 'number'] },
    { id: 'result-refs', label: 'Ogni risultato deve indicare da cosa deriva', params: [] },
    { id: 'manual', label: 'Controllo manuale (da confermare nel Controllo finale)', params: [] }
  ],
  BLOCK_FIELDS: { title: 'Titolo', content: 'Testo/descrizione', unit: 'Unità', source: 'Fonte', refs: 'Deriva da', caption: 'Didascalia' }
};
C.SOURCE_BY_ID = Object.fromEntries(C.SOURCES.map(s => [s.id, s]));

/* ---------- FABBRICA DEL PROGETTO ---------- */
const Factory = {
  project(info = {}) {
    const now = U.nowISO();
    return {
      id: U.uid('prj'), schema: C.SCHEMA, createdAt: now, updatedAt: now, isDemo: false,
      info: Object.assign({ name: '', subject: '', degree: '', professor: '', year: '', members: [], teamName: '', referent: '', company: '', description: '', objective: '', dueDate: '', notes: '' }, info),
      brief: { original: '', savedAt: null, history: [], analysis: [] },
      profNotes: [], examples: [], examplesSynthesis: '', guidelines: [], phases: [], tasks: [], deadlines: [], revisions: [], questions: [],
      issues: [], suppressions: [], ruleStats: {}, disabledRules: [], customRules: [], manualConfirm: {},
      report: { title: '', sections: C.DEFAULT_REPORT.map(([t, r], i) => Factory.reportSection(t, r, i)), imports: [], snapshots: [], lastCheckAt: null, cover: { line1: '', line2: '', line3: '', logoIds: [] } },
      proposals: [], claudeNotes: [], files: [], history: [], activity: [],
      checker: { lastRunAt: null, lastSummary: null },
      settings: { deadlineWarnDays: 7, revisionWarnDays: 3 }
    };
  },
  reportSection(title, required = false, order = 0, level = 1, numbered = true) {
    return { id: U.uid('sec'), title, required, order, level, numbered, content: '', status: 'VUOTA', notes: '', updatedAt: null };
  },
  phase(order = 0, title = '') {
    return { id: U.uid('ph'), order, title: title || 'Nuova fase', description: '', guidelineIds: [], start: '', end: '',
      checklist: [], blocks: [], notes: '', createdAt: U.nowISO() };
  },
  checkItem(text) { return { id: U.uid('chk'), text, done: false, doneAt: null }; },
  block(type) {
    const b = { id: U.uid('blk'), type, title: '', content: '', status: 'BOZZA', refs: [], inReport: false, source: '', createdAt: U.nowISO(), updatedAt: U.nowISO() };
    if (type === 'formula') b.latex = '';
    if (type === 'calc') Object.assign(b, { expression: '', variables: [], resultName: '', statedResult: '', computed: null, unit: '' });
    if (type === 'result') Object.assign(b, { name: '', value: '', unit: '' });
    if (type === 'table') Object.assign(b, { columns: ['Colonna 1', 'Colonna 2'], rows: [['', '']], notes: '' });
    if (type === 'chart') Object.assign(b, { chartType: 'bar', labels: '', series: [{ name: 'Serie 1', data: '' }], xLabel: '', yLabel: '', xUnit: '', yUnit: '' });
    if (type === 'image') Object.assign(b, { fileId: '', caption: '' });
    if (type === 'attachment') b.fileIds = [];
    return b;
  },
  guideline() { return { id: U.uid('gl'), title: '', description: '', motivation: '', source: 'STUDENTE', sourceRef: '', priority: 'MEDIA', mandatory: false, status: 'NON INIZIATA', notes: '', phaseId: '', createdAt: U.nowISO(), updatedAt: U.nowISO() }; },
  task() { return { id: U.uid('tsk'), title: '', phaseId: '', deadlineId: '', status: 'DA FARE', priority: 'MEDIA', due: '', notes: '', createdAt: U.nowISO(), doneAt: null }; },
  deadline() { return { id: U.uid('dl'), title: '', kind: 'SCADENZA', date: '', time: '', description: '', priority: 'MEDIA', taskIds: [], phaseIds: [], status: 'APERTA', createdAt: U.nowISO() }; },
  revision() { return { id: U.uid('rev'), date: '', time: '', status: 'PIANIFICATA', topics: '', materials: '', questionsText: '', openProblems: '', corrections: '', indications: '', nextActions: '', notes: '', prep: null, createdAt: U.nowISO() }; },
  question() { return { id: U.uid('q'), text: '', topic: '', priority: 'MEDIA', createdAt: U.nowISO(), revisionId: '', answer: '', status: 'APERTA', sourceRef: null }; },
  profNote() { return { id: U.uid('pn'), title: '', date: U.todayISO(), category: 'INDICAZIONE UFFICIALE', content: '', source: 'Lezione', importance: 'MEDIA', notes: '', fileIds: [], applied: false, createdAt: U.nowISO() }; },
  example() { return { id: U.uid('ex'), title: '', year: '', subject: '', description: '', text: '', fileIds: [], grade: '', corrected: false, knownErrors: '', notes: '', method: null, createdAt: U.nowISO() }; },
  customRule() { return { id: U.uid('rule'), text: '', type: 'manual', params: {}, active: true, severity: 'ATTENZIONE', createdAt: U.nowISO() }; },
  briefItem(cat, text, origin = 'UTENTE') { return { id: U.uid('br'), cat, text, done: false, origin, createdAt: U.nowISO() }; }
};

/** Porta qualunque oggetto importato alla struttura corrente (campi mancanti, tipi errati). */
function normalizeProject(p) {
  if (!p || typeof p !== 'object') throw new Error('Struttura del progetto non valida');
  const base = Factory.project();
  const out = Object.assign(base, p);
  out.info = Object.assign(Factory.project().info, p.info || {});
  if (!Array.isArray(out.info.members)) out.info.members = U.str(out.info.members).split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  out.brief = Object.assign({ original: '', savedAt: null, history: [], analysis: [] }, p.brief || {});
  ['profNotes', 'examples', 'guidelines', 'phases', 'tasks', 'deadlines', 'revisions', 'questions', 'issues', 'suppressions',
    'disabledRules', 'customRules', 'proposals', 'claudeNotes', 'files', 'history', 'activity'].forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
  ['ruleStats', 'manualConfirm', 'checker', 'settings'].forEach(k => { if (!out[k] || typeof out[k] !== 'object' || Array.isArray(out[k])) out[k] = base[k]; });
  out.settings = Object.assign({ deadlineWarnDays: 7, revisionWarnDays: 3 }, out.settings);
  out.report = Object.assign({ title: '', sections: [], imports: [], snapshots: [], lastCheckAt: null }, p.report || {});
  if (!Array.isArray(out.report.snapshots)) out.report.snapshots = [];
  if (!Array.isArray(out.report.imports)) out.report.imports = [];
  out.report.cover = Object.assign({ line1: '', line2: '', line3: '', logoIds: [] }, out.report.cover || {});
  out.report.cover.logoIds = U.arr(out.report.cover.logoIds);
  if (!Array.isArray(out.report.sections)) out.report.sections = [];
  out.report.sections = out.report.sections.map((s, i) => Object.assign(Factory.reportSection(s.title || 'Sezione', !!s.required, i), s, { level: [1, 2, 3].includes(s.level) ? s.level : 1, numbered: s.numbered !== undefined ? !!s.numbered : !/^(summary|sintesi|bibliograph|bibliografia|appendix|appendice|allegati)/i.test(s.title || '') }));
  out.phases = out.phases.map((ph, i) => {
    const n = Object.assign(Factory.phase(i), ph);
    n.checklist = U.arr(n.checklist).map(c => Object.assign(Factory.checkItem(''), c));
    n.blocks = U.arr(n.blocks).map(b => Object.assign(Factory.block(b.type || 'text'), b, { refs: U.arr(b.refs) }));
    n.guidelineIds = U.arr(n.guidelineIds);
    return n;
  });
  const fill = (coll, f) => { out[coll] = out[coll].map(x => Object.assign(f(), x)); };
  fill('guidelines', Factory.guideline); fill('tasks', Factory.task); fill('deadlines', Factory.deadline); fill('revisions', Factory.revision);
  fill('questions', Factory.question); fill('profNotes', Factory.profNote); fill('examples', Factory.example); fill('customRules', Factory.customRule);
  out.deadlines.forEach(d => { d.taskIds = U.arr(d.taskIds); d.phaseIds = U.arr(d.phaseIds); });
  out.brief.analysis = U.arr(out.brief.analysis).map(a => Object.assign(Factory.briefItem(a.cat || 'mandatory', ''), a));
  if (!out.id) out.id = U.uid('prj');
  out.schema = C.SCHEMA;
  return out;
}

/* ---------- STORE ---------- */
const Store = {
  P: null,               // progetto corrente
  index: [],             // [{id, name, isDemo, updatedAt}]
  settings: { theme: 'auto', lastProjectId: null, lastRoute: 'dashboard' },
  saveState: 'idle',
  lastSavedAt: null,
  listeners: [],

  async init() {
    await DB.open();
    const meta = await DB.get('meta', 'settings');
    if (meta && meta.value) Object.assign(this.settings, meta.value);
    const all = await DB.getAll('projects');
    this.index = all.map(p => ({ id: p.id, name: (p.info && p.info.name) || 'Senza nome', isDemo: !!p.isDemo, updatedAt: p.updatedAt }));
    const pick = all.find(p => p.id === this.settings.lastProjectId) || all.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    if (pick) this.P = normalizeProject(pick);
    DB.persist();
  },
  onSave(fn) { this.listeners.push(fn); },
  setSaveState(s) { this.saveState = s; this.listeners.forEach(f => { try { f(s); } catch (e) { /* ignora */ } }); },

  async saveSettings() {
    try { await DB.put('meta', { key: 'settings', value: this.settings }); } catch (e) { console.warn(e); }
  },
  /** salvataggio immediato del progetto corrente */
  async saveNow() {
    if (!this.P) return;
    this.pending = false;
    this.setSaveState('saving');
    try {
      this.P.updatedAt = U.nowISO();
      await DB.put('projects', this.P);
      const ix = this.index.find(x => x.id === this.P.id);
      const row = { id: this.P.id, name: this.P.info.name || 'Senza nome', isDemo: this.P.isDemo, updatedAt: this.P.updatedAt };
      if (ix) Object.assign(ix, row); else this.index.push(row);
      this.lastSavedAt = new Date();
      this.setSaveState('saved');
    } catch (e) {
      console.error(e);
      this.setSaveState('error');
      if (window.UI) UI.toast('Errore di salvataggio: ' + e.message, 'err');
    }
  },
  /** segnala una modifica: salva in automatico dopo una breve pausa */
  touch() {
    if (!this.P) return;
    this.pending = true;
    this.setSaveState('saving');
    this._deb = this._deb || U.debounce(() => this.saveNow(), 500);
    this._deb();
  },
  flush() { if (this._deb && this.pending) this._deb.flush(); },

  async createProject(info, opts = {}) {
    const p = opts.project ? normalizeProject(opts.project) : Factory.project(info);
    if (!opts.project) {
      p.phases = [];
      History.activity(p, 'Progetto creato: ' + (p.info.name || 'Senza nome'), 'progetto');
    }
    this.P = p;
    this.settings.lastProjectId = p.id;
    await this.saveNow();
    await this.saveSettings();
    return p;
  },
  async switchProject(id) {
    this.flush();
    const p = await DB.get('projects', id);
    if (!p) throw new Error('Progetto non trovato');
    this.P = normalizeProject(p);
    this.settings.lastProjectId = id;
    await this.saveSettings();
  },
  async deleteProject(id) {
    await DB.del('projects', id);
    await DB.deleteProjectFiles(id);
    this.index = this.index.filter(x => x.id !== id);
    if (this.P && this.P.id === id) {
      this.P = null;
      if (this.index.length) await this.switchProject(this.index[0].id);
    }
  }
};

/* ---------- HISTORY: attività e versioni ---------- */
const History = {
  activity(p, text, type = 'modifica', ref = null) {
    p = p || Store.P;
    if (!p) return;
    p.activity.unshift({ id: U.uid('act'), at: U.nowISO(), text, type, ref });
    if (p.activity.length > 1500) p.activity.length = 1500;
  },
  /** registra una versione di un elemento (prima → dopo) */
  version({ type, id, label, field, before, after, reason = '', origin = 'UTENTE' }) {
    const p = Store.P;
    if (!p) return;
    const b = typeof before === 'string' ? before : JSON.stringify(before, null, 1);
    const a = typeof after === 'string' ? after : JSON.stringify(after, null, 1);
    if (b === a) return;
    p.history.unshift({ id: U.uid('ver'), at: U.nowISO(), type, elementId: id, label, field, before: b, after: a,
      rawBefore: typeof before === 'string' ? null : U.clone(before), reason, origin });
    if (p.history.length > 2000) p.history.length = 2000;
  },
  log(text, type, ref) { this.activity(Store.P, text, type, ref); }
};

/* ---------- MODEL: accesso e CRUD ---------- */
const Model = {
  COLL_LABEL: {
    guidelines: 'Linea guida', phases: 'Fase', tasks: 'Attività', deadlines: 'Scadenza', revisions: 'Revisione', questions: 'Domanda',
    issues: 'Errore', profNotes: 'Materiale professore', examples: 'Esempio', customRules: 'Regola', files: 'File', proposals: 'Proposta Claude', claudeNotes: 'Nota Claude'
  },
  get P() { return Store.P; },
  list(coll) { return Store.P ? U.arr(Store.P[coll]) : []; },
  get(coll, id) { return this.list(coll).find(x => x.id === id) || null; },
  add(coll, obj, logText) {
    Store.P[coll].push(obj);
    History.log(logText || (this.COLL_LABEL[coll] || 'Elemento') + ' aggiunto: ' + this.labelOf(coll, obj), coll, { coll, id: obj.id });
    Store.touch();
    return obj;
  },
  /** aggiorna con patch; se track=true registra la versione precedente */
  update(coll, id, patch, opts = {}) {
    const o = this.get(coll, id);
    if (!o) throw new Error('Elemento non trovato');
    const before = U.clone(o);
    Object.assign(o, patch, { updatedAt: U.nowISO() });
    if (opts.track !== false) {
      const keys = Object.keys(patch).filter(k => JSON.stringify(before[k]) !== JSON.stringify(o[k]));
      if (keys.length) {
        const pick = x => Object.fromEntries(keys.map(k => [k, x[k]]));
        History.version({ type: coll, id, label: this.labelOf(coll, o), field: keys.join(', '), before: pick(before), after: pick(o), reason: opts.reason || '', origin: opts.origin || 'UTENTE' });
        History.log((this.COLL_LABEL[coll] || 'Elemento') + ' modificato: ' + this.labelOf(coll, o) + (opts.reason ? ' (' + opts.reason + ')' : ''), coll, { coll, id });
      }
    }
    Store.touch();
    return o;
  },
  /** rimuove e restituisce i dati per l'eventuale annullamento */
  remove(coll, id) {
    const a = Store.P[coll];
    const i = a.findIndex(x => x.id === id);
    if (i < 0) return null;
    const [o] = a.splice(i, 1);
    const sideEffects = this.cleanupRefs(coll, id);
    History.log((this.COLL_LABEL[coll] || 'Elemento') + ' eliminato: ' + this.labelOf(coll, o), coll, null);
    Store.touch();
    return { coll, index: i, obj: o, sideEffects };
  },
  restore(snap) {
    if (!snap) return;
    Store.P[snap.coll].splice(Math.min(snap.index, Store.P[snap.coll].length), 0, snap.obj);
    (snap.sideEffects || []).forEach(f => f());
    History.log('Ripristinato: ' + this.labelOf(snap.coll, snap.obj), snap.coll, { coll: snap.coll, id: snap.obj.id });
    Store.touch();
  },
  /** pulizia riferimenti incrociati; restituisce funzioni di ripristino */
  cleanupRefs(coll, id) {
    const P = Store.P, undo = [];
    const strip = (o, key) => { if (o[key] === id) { o[key] = ''; undo.push(() => { o[key] = id; }); } };
    const stripArr = (o, key) => { const i = U.arr(o[key]).indexOf(id); if (i >= 0) { o[key].splice(i, 1); undo.push(() => o[key].splice(i, 0, id)); } };
    if (coll === 'phases') { P.tasks.forEach(t => strip(t, 'phaseId')); P.guidelines.forEach(g => strip(g, 'phaseId')); P.deadlines.forEach(d => stripArr(d, 'phaseIds')); }
    if (coll === 'tasks') P.deadlines.forEach(d => stripArr(d, 'taskIds'));
    if (coll === 'deadlines') P.tasks.forEach(t => strip(t, 'deadlineId'));
    if (coll === 'revisions') P.questions.forEach(q => strip(q, 'revisionId'));
    if (coll === 'guidelines') P.phases.forEach(ph => stripArr(ph, 'guidelineIds'));
    if (coll === 'files') { P.profNotes.forEach(n => stripArr(n, 'fileIds')); P.examples.forEach(n => stripArr(n, 'fileIds')); this.allBlocks().forEach(({ block }) => { stripArr(block, 'fileIds'); strip(block, 'fileId'); }); }
    return undo;
  },
  labelOf(coll, o) {
    if (!o) return '';
    return U.truncate(o.title || o.name || o.text || o.problem || (o.date ? U.fmtDate(o.date) : '') || o.id, 70);
  },

  /* --- fasi e blocchi --- */
  phasesSorted() { return this.list('phases').slice().sort((a, b) => a.order - b.order); },
  allBlocks() {
    const out = [];
    this.phasesSorted().forEach((phase, pi) => phase.blocks.forEach((block, bi) => out.push({ phase, block, pi, bi })));
    return out;
  },
  findBlock(id) { return this.allBlocks().find(x => x.block.id === id) || null; },
  /** numerazione progressiva Tabella N / Grafico N / Figura N / Formula N per tutto il progetto */
  numbering() {
    const n = { table: 0, chart: 0, image: 0, formula: 0, calc: 0, result: 0 };
    const map = {};
    const name = { table: 'Tabella', chart: 'Grafico', image: 'Figura', formula: 'Formula', calc: 'Calcolo', result: 'Risultato' };
    this.allBlocks().forEach(({ block }) => { if (n[block.type] !== undefined) { n[block.type]++; map[block.id] = name[block.type] + ' ' + n[block.type]; } });
    return { map, counts: n };
  },
  blockLabel(block) {
    if (!block) return '';
    const num = this.numbering().map[block.id];
    const t = block.type === 'result' ? (block.name || block.title) : block.title;
    return (num || C.BLOCK_TYPES[block.type]) + (t ? ': ' + t : '');
  },

  /* --- riferimenti interni (FONTI INTERNE / DERIVA DA) --- */
  refTargets() {
    const out = [];
    const num = this.numbering().map;
    this.allBlocks().forEach(({ block, phase }) => out.push({ type: 'block', id: block.id, label: (num[block.id] || C.BLOCK_TYPES[block.type]) + ': ' + (block.type === 'result' ? (block.name || block.title || '(senza nome)') : (block.title || '(senza titolo)')), group: 'Fase ' + (phase.order + 1) + ' · ' + phase.title }));
    this.list('profNotes').forEach(n => out.push({ type: 'profNotes', id: n.id, label: n.category + ' ' + U.fmtDate(n.date) + ': ' + n.title, group: 'Materiale professore' }));
    this.list('guidelines').forEach(g => out.push({ type: 'guidelines', id: g.id, label: g.title, group: 'Linee guida' }));
    this.list('revisions').forEach(r => out.push({ type: 'revisions', id: r.id, label: 'Revisione del ' + U.fmtDate(r.date), group: 'Revisioni' }));
    this.list('files').forEach(f => out.push({ type: 'files', id: f.id, label: f.name, group: 'File' }));
    (Store.P ? Store.P.brief.analysis : []).forEach(a => out.push({ type: 'brief', id: a.id, label: U.truncate(a.text, 80), group: 'Consegna' }));
    return out;
  },
  refLabel(ref) {
    if (!ref) return '';
    if (ref.type === 'block') { const f = this.findBlock(ref.id); return f ? this.blockLabel(f.block) : '(blocco eliminato)'; }
    if (ref.type === 'brief') { const a = Store.P.brief.analysis.find(x => x.id === ref.id); return a ? 'Consegna: ' + U.truncate(a.text, 60) : '(voce consegna eliminata)'; }
    const o = this.get(ref.type, ref.id);
    if (!o) return '(elemento eliminato)';
    if (ref.type === 'profNotes') return 'Prof. ' + U.fmtDate(o.date) + ': ' + U.truncate(o.title, 50);
    if (ref.type === 'revisions') return 'Revisione ' + U.fmtDate(o.date);
    return (this.COLL_LABEL[ref.type] || '') + ': ' + this.labelOf(ref.type, o);
  },
  refExists(ref) {
    if (!ref) return false;
    if (ref.type === 'block') return !!this.findBlock(ref.id);
    if (ref.type === 'brief') return !!Store.P.brief.analysis.find(x => x.id === ref.id);
    return !!this.get(ref.type, ref.id);
  },
  /** elementi che citano (refs) un dato blocco */
  usedBy(blockId) { return this.allBlocks().filter(({ block }) => block.refs.some(r => r.type === 'block' && r.id === blockId)); },

  /* --- testo complessivo del progetto (per confronti numerici) --- */
  blockText(b) {
    const parts = [b.title, b.content, b.source];
    if (b.type === 'formula') parts.push(b.latex);
    if (b.type === 'calc') { parts.push(b.expression, b.resultName, b.statedResult, b.unit, b.computed); U.arr(b.variables).forEach(v => parts.push(v.name, v.value, v.unit)); }
    if (b.type === 'result') parts.push(b.name, b.value, b.unit);
    if (b.type === 'table') { parts.push(U.arr(b.columns).join(' | ')); U.arr(b.rows).forEach(r => parts.push(U.arr(r).join(' | '))); parts.push(b.notes); }
    if (b.type === 'chart') { parts.push(b.labels, b.xLabel, b.yLabel, b.xUnit, b.yUnit); U.arr(b.series).forEach(s => parts.push(s.name, s.data)); }
    if (b.type === 'image') parts.push(b.caption);
    return parts.filter(x => x !== null && x !== undefined && x !== '').join('\n');
  },
  projectCorpus() {
    const P = Store.P;
    const parts = [];
    this.allBlocks().forEach(({ block }) => parts.push(this.blockText(block)));
    P.profNotes.forEach(n => parts.push(n.title, n.content));
    parts.push(P.brief.original, P.info.objective, P.info.description);
    P.revisions.forEach(r => parts.push(r.corrections, r.indications));
    return parts.filter(Boolean).join('\n');
  },
  /** quantità nominate: risultati, variabili di calcolo, risultati di calcolo, "Nome = valore unità" nei testi */
  namedQuantities() {
    const out = [], texts = [];
    this.allBlocks().forEach(({ block: b, phase }) => {
      const where = { blockId: b.id, phaseId: phase.id };
      if (b.type === 'result' && b.name) out.push(Object.assign({ name: b.name, value: U.parseNum(b.value), raw: b.value, unit: U.str(b.unit).trim(), kind: 'risultato' }, where));
      if (b.type === 'calc') {
        U.arr(b.variables).forEach(v => { if (v.name) out.push(Object.assign({ name: v.name, value: U.parseNum(v.value), raw: v.value, unit: U.str(v.unit).trim(), kind: 'variabile' }, where)); });
        if (b.resultName) {
          const val = b.computed !== null && b.computed !== undefined && b.computed !== '' ? Number(b.computed) : U.parseNum(b.statedResult);
          out.push(Object.assign({ name: b.resultName, value: val, raw: U.str(b.statedResult || b.computed), unit: U.str(b.unit).trim(), kind: 'calcolo' }, where));
        }
      }
      if (['text', 'observation', 'interpretation', 'note'].includes(b.type)) texts.push({ b, where });
    });
    // "Nome = valore unità" nei testi: il nome viene ricondotto a un parametro già noto se possibile
    const known = [...new Set(out.map(q => U.norm(q.name)).filter(n => n.length >= 3))].sort((a, z) => z.length - a.length);
    texts.forEach(({ b, where }) => {
      const re = /([A-Za-zÀ-ÿ][\wÀ-ÿ ]{0,60}?)\s*=\s*(-?\d+(?:[.,]\d+)?)\s*([A-Za-z%€$°µ/²³]+(?:\/[A-Za-z]+)?)?/g;
      let m;
      const txt = U.str(b.content);
      while ((m = re.exec(txt))) {
        const raw = U.norm(m[1]);
        const k = known.find(n => raw === n || raw.endsWith(' ' + n));
        const name = k ? out.find(q => U.norm(q.name) === k).name : m[1].trim().split(/\s+/).slice(-3).join(' ');
        out.push(Object.assign({ name, value: U.parseNum(m[2]), raw: m[2], unit: U.str(m[3]).trim(), kind: 'testo' }, where));
      }
    });
    return out.filter(q => q.name && U.norm(q.name).length > 0);
  }
};

/* ---------- METRICS: progresso, salute, priorità ---------- */
const Metrics = {
  phaseProgress(ph) {
    const tasks = Model.list('tasks').filter(t => t.phaseId === ph.id);
    const total = ph.checklist.length + tasks.length;
    const done = ph.checklist.filter(c => c.done).length + tasks.filter(t => t.status === 'COMPLETATA').length;
    if (total > 0) return { pct: U.pct(done, total), done, total, basis: 'checklist e attività' };
    if (ph.blocks.length) {
      const v = ph.blocks.filter(b => b.status === 'VERIFICATO').length;
      return { pct: U.pct(v, ph.blocks.length), done: v, total: ph.blocks.length, basis: 'blocchi verificati' };
    }
    return { pct: 0, done: 0, total: 0, basis: 'nessun elemento' };
  },
  guidelinesProgress() {
    const g = Model.list('guidelines');
    if (!g.length) return { pct: 0, total: 0, done: 0 };
    const s = g.reduce((a, x) => a + (C.GUIDE_SCORE[x.status] || 0), 0);
    return { pct: Math.round(s / g.length * 100), total: g.length, done: g.filter(x => x.status === 'COMPLETATA' || x.status === 'APPROVATA').length };
  },
  revisionsProgress() {
    const r = Model.list('revisions').filter(x => x.status !== 'ANNULLATA');
    const done = r.filter(x => x.status === 'SVOLTA').length;
    return { pct: U.pct(done, r.length), total: r.length, done };
  },
  reportProgress() {
    const secs = Store.P ? Store.P.report.sections : [];
    if (!secs.length) return { pct: 0, total: 0, filled: 0, words: 0, byStatus: {} };
    let w = 0, s = 0;
    const byStatus = {};
    secs.forEach(x => { const wt = x.required ? 2 : 1; w += wt; s += wt * (C.REPORT_SCORE[x.status] || 0); byStatus[x.status] = (byStatus[x.status] || 0) + 1; });
    const filled = secs.filter(x => U.str(x.content).trim()).length;
    const words = secs.reduce((a, x) => a + U.words(U.stripMd(x.content)), 0);
    return { pct: Math.round(s / w * 100), total: secs.length, filled, words, byStatus, requiredEmpty: secs.filter(x => x.required && !U.str(x.content).trim()) };
  },
  /** progresso complessivo con pesi dichiarati */
  overall() {
    const phases = Model.phasesSorted();
    const phRows = phases.map(ph => ({ label: 'Fase ' + (ph.order + 1) + ' · ' + ph.title, ...this.phaseProgress(ph), id: ph.id }));
    const phasesPct = phRows.length ? Math.round(phRows.reduce((a, r) => a + r.pct, 0) / phRows.length) : 0;
    const gl = this.guidelinesProgress(), rv = this.revisionsProgress(), rp = this.reportProgress();
    const parts = [
      { key: 'phases', label: 'Fasi di sviluppo', pct: phasesPct, weight: 55, detail: phRows.length ? phRows.length + ' fasi' : 'nessuna fase' },
      { key: 'guidelines', label: 'Linee guida', pct: gl.pct, weight: 15, detail: gl.total ? gl.done + '/' + gl.total + ' completate/approvate' : 'nessuna linea guida' },
      { key: 'revisions', label: 'Revisioni', pct: rv.pct, weight: 10, detail: rv.total ? rv.done + '/' + rv.total + ' svolte' : 'nessuna revisione pianificata' },
      { key: 'report', label: 'Relazione', pct: rp.pct, weight: 20, detail: rp.filled + '/' + rp.total + ' sezioni scritte' }
    ];
    const total = Math.round(parts.reduce((a, p) => a + p.pct * p.weight, 0) / parts.reduce((a, p) => a + p.weight, 0));
    return { phRows, parts, total };
  },
  openIssues(minSev = 'INFO') {
    const r = C.SEV_RANK[minSev];
    return Model.list('issues').filter(i => C.ISSUE_ACTIVE.includes(i.status) && C.SEV_RANK[i.severity] >= r);
  },
  deadlinesSorted(includeClosed = false) {
    return Model.list('deadlines').filter(d => includeClosed || d.status === 'APERTA').filter(d => U.isValidDate(d.date))
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  },
  /** stato di una scadenza: attività collegate incomplete e rischio */
  deadlineState(d) {
    const tasks = Model.list('tasks').filter(t => d.taskIds.includes(t.id) || t.deadlineId === d.id);
    const uniq = [...new Map(tasks.map(t => [t.id, t])).values()];
    const phases = Model.list('phases').filter(p => d.phaseIds.includes(p.id));
    const openTasks = uniq.filter(t => t.status !== 'COMPLETATA');
    const openPhases = phases.filter(p => this.phaseProgress(p).pct < 100);
    const days = U.daysUntil(d.date);
    const warn = Store.P ? Store.P.settings.deadlineWarnDays : 7;
    let risk = 'OK';
    if (d.status === 'APERTA') {
      if (days !== null && days < 0) risk = 'SUPERATA';
      else if (days !== null && days <= warn && (openTasks.length || openPhases.length)) risk = 'RISCHIO';
      else if (days !== null && days <= warn) risk = 'VICINA';
    }
    return { tasks: uniq, openTasks, phases, openPhases, days, risk };
  },
  nextDeadline() { return this.deadlinesSorted().find(d => U.daysUntil(d.date) >= 0) || null; },
  daysToDue() { return Store.P && U.isValidDate(Store.P.info.dueDate) ? U.daysUntil(Store.P.info.dueDate) : null; },
  lastRevision() {
    return Model.list('revisions').filter(r => r.status === 'SVOLTA').sort((a, b) => U.str(b.date).localeCompare(U.str(a.date)))[0] || null;
  },
  nextRevision() {
    return Model.list('revisions').filter(r => r.status === 'PIANIFICATA' && U.isValidDate(r.date) && U.daysUntil(r.date) >= 0)
      .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  },
  revisionReadiness(r) {
    const missing = [];
    if (!U.str(r.topics).trim()) missing.push('argomenti da mostrare');
    if (!U.str(r.materials).trim()) missing.push('materiale da portare');
    const qs = Model.list('questions').filter(q => q.revisionId === r.id && q.status === 'APERTA');
    if (!qs.length && !U.str(r.questionsText).trim()) missing.push('domande');
    if (!r.prep) missing.push('preparazione (PREPARA REVISIONE)');
    return { ready: missing.length === 0, missing, questions: qs };
  },
  stats() {
    const tasks = Model.list('tasks');
    const chk = Model.list('phases').reduce((a, p) => { a.t += p.checklist.length; a.d += p.checklist.filter(c => c.done).length; return a; }, { t: 0, d: 0 });
    const issues = Model.list('issues');
    return {
      tasks: tasks.length, tasksDone: tasks.filter(t => t.status === 'COMPLETATA').length, tasksOpen: tasks.filter(t => t.status !== 'COMPLETATA').length,
      checklist: chk.t, checklistDone: chk.d,
      issuesOpen: issues.filter(i => C.ISSUE_ACTIVE.includes(i.status)).length,
      issuesResolved: issues.filter(i => i.status === 'RISOLTO').length,
      revisions: Model.list('revisions').filter(r => r.status === 'SVOLTA').length,
      revisionsPlanned: Model.list('revisions').filter(r => r.status === 'PIANIFICATA').length,
      questionsOpen: Model.list('questions').filter(q => q.status === 'APERTA' || q.status === 'POSTA').length,
      daysToDue: this.daysToDue()
    };
  },
  /** PROJECT HEALTH: punteggio 0-100 con motivazioni esplicite */
  health() {
    const P = Store.P;
    let score = 100;
    const reasons = [];
    const hit = (pts, text) => { score -= pts; reasons.push({ pts, text }); };
    const ov = this.overall().total;
    const days = this.daysToDue();
    if (!U.str(P.brief.original).trim()) hit(10, 'Consegna ufficiale non inserita');
    if (days === null) hit(8, 'Data di consegna finale non impostata');
    else if (days < 0 && ov < 100) hit(40, 'Consegna finale superata');
    else {
      const start = U.toDate(U.isoToLocalDate(P.createdAt)), end = U.toDate(P.info.dueDate), now = U.toDate(U.todayISO());
      if (start && end && end > start) {
        const expected = U.clamp((now - start) / (end - start), 0, 1) * 100;
        const gap = expected - ov;
        if (gap > 30) hit(25, 'Avanzamento ' + ov + '% contro circa ' + Math.round(expected) + '% atteso a questa data');
        else if (gap > 12) hit(12, 'Avanzamento leggermente in ritardo (' + ov + '% contro ~' + Math.round(expected) + '% atteso)');
      }
    }
    const overdue = this.deadlinesSorted().filter(d => U.daysUntil(d.date) < 0);
    if (overdue.length) hit(Math.min(30, overdue.length * 15), U.plural(overdue.length, 'scadenza superata', 'scadenze superate') + ' ancora aperte');
    const risky = this.deadlinesSorted().filter(d => this.deadlineState(d).risk === 'RISCHIO');
    if (risky.length) hit(Math.min(20, risky.length * 10), U.plural(risky.length, 'scadenza vicina', 'scadenze vicine') + ' con attività incomplete');
    const crit = this.openIssues('CRITICO');
    if (crit.length) hit(Math.min(30, crit.length * 15), U.plural(crit.length, 'errore critico aperto', 'errori critici aperti'));
    const prob = this.openIssues('PROBABILE ERRORE').filter(i => i.severity === 'PROBABILE ERRORE');
    if (prob.length) hit(Math.min(15, prob.length * 4), U.plural(prob.length, 'probabile errore aperto', 'probabili errori aperti'));
    const mand = Model.list('guidelines').filter(g => (g.mandatory || g.priority === 'CRITICA') && !['COMPLETATA', 'APPROVATA'].includes(g.status));
    if (mand.length && days !== null && days <= 14) hit(10, U.plural(mand.length, 'linea guida obbligatoria non completata', 'linee guida obbligatorie non completate') + ' a meno di 2 settimane');
    const rp = this.reportProgress();
    if (rp.requiredEmpty && rp.requiredEmpty.length && days !== null && days <= 21) hit(10, U.plural(rp.requiredEmpty.length, 'sezione obbligatoria', 'sezioni obbligatorie') + ' della relazione ancora vuote');
    if (!Model.list('revisions').length) hit(5, 'Nessuna revisione con il professore pianificata');
    if (!Model.list('phases').length) hit(10, 'Nessuna fase operativa definita');
    score = U.clamp(score, 0, 100);
    const level = score >= 85 ? 'OTTIMO' : score >= 65 ? 'BUONO' : score >= 45 ? 'ATTENZIONE' : 'RISCHIO';
    return { score, level, reasons };
  },
  /** ATTENZIONE RICHIESTA: notifiche interne */
  attention() {
    const P = Store.P, out = [];
    this.deadlinesSorted().forEach(d => {
      const st = this.deadlineState(d);
      if (st.risk === 'SUPERATA') out.push({ level: 'risk', title: 'Scadenza superata: ' + d.title, text: U.fmtDate(d.date) + ' · ' + U.relDays(d.date), route: 'deadlines', id: d.id });
      else if (st.risk === 'RISCHIO') out.push({ level: 'risk', title: 'Rischio scadenza: ' + d.title, text: U.relDays(d.date) + ' · ' + U.plural(st.openTasks.length + st.openPhases.length, 'elemento collegato incompleto', 'elementi collegati incompleti'), route: 'deadlines', id: d.id });
      else if (st.risk === 'VICINA') out.push({ level: 'warn', title: 'Scadenza vicina: ' + d.title, text: U.relDays(d.date), route: 'deadlines', id: d.id });
    });
    const days = this.daysToDue();
    if (days !== null && days >= 0 && days <= 14) out.push({ level: days <= 5 ? 'risk' : 'warn', title: 'Consegna finale ' + U.relDays(P.info.dueDate), text: 'Data: ' + U.fmtDate(P.info.dueDate), route: 'deadlines' });
    Model.list('revisions').filter(r => r.status === 'PIANIFICATA' && U.isValidDate(r.date)).forEach(r => {
      const d = U.daysUntil(r.date);
      if (d >= 0 && d <= P.settings.revisionWarnDays) {
        const rd = this.revisionReadiness(r);
        out.push({ level: rd.ready ? 'warn' : 'risk', title: 'Revisione ' + U.relDays(r.date) + (rd.ready ? '' : ': non pronta'), text: rd.ready ? 'Preparazione completata' : 'Manca: ' + rd.missing.join(', '), route: 'revisions', id: r.id });
      } else if (d < 0) out.push({ level: 'warn', title: 'Revisione del ' + U.fmtDate(r.date) + ' ancora "pianificata"', text: 'Registra cosa è emerso e segnala come svolta', route: 'revisions', id: r.id });
    });
    this.openIssues('CRITICO').forEach(i => out.push({ level: 'risk', title: 'Errore critico: ' + U.truncate(i.problem, 70), text: i.element, route: 'checks', id: i.id }));
    if (!U.str(P.brief.original).trim()) out.push({ level: 'warn', title: 'Consegna ufficiale mancante', text: 'Inserisci il testo integrale della consegna', route: 'brief' });
    if (!U.isValidDate(P.info.dueDate)) out.push({ level: 'warn', title: 'Data di consegna finale mancante', text: 'Impostala nella scheda Progetto', route: 'project' });
    const unapplied = Model.list('profNotes').filter(n => (n.category === 'CORREZIONE' || n.category === 'REQUISITO') && !n.applied);
    if (unapplied.length) out.push({ level: 'warn', title: U.plural(unapplied.length, 'correzione/requisito del professore', 'correzioni/requisiti del professore') + ' da recepire', text: 'Segnala come recepite quando le hai applicate', route: 'prof' });
    return out;
  },
  /** COSA DEVO FARE ADESSO? — massimo 3 azioni con motivazione */
  whatNow() {
    const P = Store.P, c = [];
    const add = (score, title, why, route, id, actionLabel = 'Vai') => c.push({ score, title, why, route, id, actionLabel });
    const days = this.daysToDue();
    this.deadlinesSorted().forEach(d => {
      const st = this.deadlineState(d);
      if (st.risk === 'SUPERATA') add(100, 'Gestisci la scadenza superata "' + d.title + '"', 'È scaduta ' + U.relDays(d.date).replace('superata ', '') + ': completala, spostala o annullala.', 'deadlines', d.id);
      else if (st.risk === 'RISCHIO') {
        const first = st.openTasks[0];
        add(92 - st.days, 'Completa ' + (first ? '"' + first.title + '"' : 'gli elementi collegati') + ' per "' + d.title + '"', 'La scadenza è ' + U.relDays(d.date) + ' e ci sono ' + U.plural(st.openTasks.length + st.openPhases.length, 'elemento incompleto', 'elementi incompleti') + '.', 'deadlines', d.id);
      }
    });
    this.openIssues('CRITICO').filter(i => !(i.ref && i.ref.route === 'deadlines')).slice(0, 2).forEach(i => add(95, 'Risolvi l\'errore critico: ' + U.truncate(i.problem, 60), i.reason || 'Segnalato dal Project Checker con gravità CRITICO.', 'checks', i.id, 'Apri'));
    const nr = this.nextRevision();
    if (nr) {
      const d = U.daysUntil(nr.date), rd = this.revisionReadiness(nr);
      if (d <= P.settings.revisionWarnDays && !rd.ready) add(88 - d, 'Prepara la revisione ' + U.relDays(nr.date), 'Manca: ' + rd.missing.join(', ') + '.', 'revisions', nr.id, 'Prepara');
    }
    if (!U.str(P.brief.original).trim()) add(85, 'Inserisci la consegna ufficiale', 'È la base di tutto il progetto e ha priorità sulle altre fonti.', 'brief');
    else if (!P.brief.analysis.length) add(78, 'Analizza la consegna', 'Suddividila in obiettivi, vincoli, elementi obbligatori ed elaborati: il checker li userà per verificarti.', 'brief');
    if (!U.isValidDate(P.info.dueDate)) add(80, 'Imposta la data di consegna finale', 'Serve per calcolare giorni mancanti, rischio e project health.', 'project');
    const unapplied = Model.list('profNotes').filter(n => n.category === 'CORREZIONE' && !n.applied);
    if (unapplied.length) add(76, 'Applica la correzione del professore "' + U.truncate(unapplied[0].title, 50) + '"', 'Le correzioni dirette sono la fonte con priorità più alta.', 'prof', unapplied[0].id);
    if (!Model.list('guidelines').length) add(72, 'Definisci le linee guida del progetto', 'Puoi generarle con Claude ("Prepara per Claude" → Genera linee guida) e importarle come proposte.', 'guidelines');
    else if (!Model.list('phases').length) add(70, 'Trasforma le linee guida in fasi operative', 'Senza fasi non puoi tracciare lo sviluppo e il progresso.', 'guidelines');
    const mand = Model.list('guidelines').filter(g => (g.mandatory || g.priority === 'CRITICA') && !['COMPLETATA', 'APPROVATA'].includes(g.status));
    if (mand.length && days !== null && days <= 21) add(65, 'Completa la linea guida obbligatoria "' + U.truncate(mand[0].title, 50) + '"', 'Mancano ' + days + ' giorni alla consegna.', 'guidelines', mand[0].id);
    const nextPh = Model.phasesSorted().find(ph => this.phaseProgress(ph).pct < 100);
    if (nextPh) {
      const item = nextPh.checklist.find(x => !x.done);
      const task = Model.list('tasks').find(t => t.phaseId === nextPh.id && t.status !== 'COMPLETATA');
      const what = task ? 'attività "' + task.title + '"' : item ? 'punto "' + item.text + '"' : 'contenuti della fase';
      add(55, 'Continua la Fase ' + (nextPh.order + 1) + ' · ' + nextPh.title, 'Prossimo passo: ' + what + '. Le fasi precedenti sono completate.', 'dev', nextPh.id, 'Apri fase');
    }
    const prob = this.openIssues('PROBABILE ERRORE').filter(i => i.severity === 'PROBABILE ERRORE');
    if (prob.length) add(52, 'Valuta ' + U.plural(prob.length, 'probabile errore', 'probabili errori') + ' segnalati', 'Decidi per ognuno: correggi, ignora o non è un errore.', 'checks');
    const lr = P.checker.lastRunAt;
    if (!lr || (Date.now() - new Date(lr)) > 2 * 86400000) add(40, 'Esegui il Project Checker', lr ? 'L\'ultimo controllo risale al ' + U.fmtDateTime(lr) + '.' : 'Non è ancora stato eseguito un controllo.', 'checks', null, 'Controlla');
    const rp = this.reportProgress();
    if (rp.requiredEmpty && rp.requiredEmpty.length && (this.overall().total >= 60 || (days !== null && days <= 21))) add(48, 'Scrivi la sezione "' + rp.requiredEmpty[0].title + '" della relazione', 'È obbligatoria e ancora vuota.', 'report', rp.requiredEmpty[0].id);
    const qOpen = Model.list('questions').filter(q => q.status === 'APERTA' && !q.revisionId);
    if (qOpen.length && nr) add(45, 'Assegna ' + U.plural(qOpen.length, 'domanda', 'domande') + ' alla prossima revisione', 'Così non le dimentichi il ' + U.fmtDate(nr.date) + '.', 'questions');
    const seen = new Set();
    return c.sort((a, b) => b.score - a.score).filter(x => { const k = x.title; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 3);
  }
};
