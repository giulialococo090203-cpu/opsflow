/* =====================================================================
   VIEWS (parte 1) — Dashboard · Progetto · Consegna · Materiale prof. ·
   Esempi · Linee guida · Sviluppo (fasi, checklist, blocchi)
   Ogni vista: Views.x = { title, render(params) → HTML, mount(root) }
   Le azioni dei pulsanti sono in Actions[nome] (data-action="nome").
   I campi modificabili in linea usano data-bind (vedi Binders).
   ===================================================================== */
'use strict';

const Views = {};
const Actions = {};
const Binders = {};
const Forms = {};

/* ---------- helper di vista ---------- */
const H = {
  head(title, sub = '', actions = '') {
    return '<div class="page-head"><div><h1>' + U.esc(title) + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div><div class="btn-group">' + actions + '</div></div>';
  },
  card(title, body, extra = '', cls = '') {
    return '<section class="card ' + cls + '">' + (title ? '<div class="card-head"><h3>' + title + '</h3><div class="btn-group">' + extra + '</div></div>' : '') + body + '</section>';
  },
  srcLabel(id) { const s = C.SOURCE_BY_ID[id]; return s ? s.rank + ' · ' + s.label : '—'; },
  srcBadge(id) { const s = C.SOURCE_BY_ID[id]; if (!s) return ''; return '<span class="badge ' + (s.rank <= 2 ? 'risk' : s.rank <= 4 ? 'warn' : s.rank === 7 ? 'violet' : '') + '" data-tip="Gerarchia delle fonti: ' + U.attr(s.label) + '">F' + s.rank + ' ' + U.esc(s.id === 'AI' ? 'AI' : s.label.split(' ')[0]) + '</span>'; },
  qBtn(text, topic = '', refType = '', refId = '') {
    return '<button class="btn xs ghost" data-action="question-add" data-text="' + U.attr(U.truncate(text, 300)) + '" data-topic="' + U.attr(topic) + '" data-reftype="' + U.attr(refType) + '" data-refid="' + U.attr(refId) + '" data-tip="Aggiungi alle domande per il professore">？ Domanda</button>';
  },
  editDel(coll, id, extra = '') {
    return '<div class="btn-group">' + extra + '<button class="btn xs" data-action="edit" data-coll="' + coll + '" data-id="' + id + '">Modifica</button><button class="btn xs danger" data-action="delete" data-coll="' + coll + '" data-id="' + id + '">Elimina</button></div>';
  },
  phaseOptions(withEmpty = true) { return (withEmpty ? [['', '— nessuna —']] : []).concat(Model.phasesSorted().map(p => [p.id, 'Fase ' + (p.order + 1) + ' · ' + p.title])); },
  md(text) { return '<div class="md">' + U.md(text) + '</div>'; },
  sevBadge(s) { return UI.badge(s); },
  refChips(block) {
    return block.refs.map((r, i) => '<span class="ref-chip">' + (Model.refExists(r) ? '' : '⚠ ') + U.esc(U.truncate(Model.refLabel(r), 60)) + '<button data-action="ref-remove" data-id="' + block.id + '" data-i="' + i + '" aria-label="Rimuovi riferimento">×</button></span>').join(' ');
  }
};

/* ---------- AZIONI GENERICHE (CRUD) ---------- */
const FACTORY_OF = { guidelines: 'guideline', tasks: 'task', deadlines: 'deadline', revisions: 'revision', questions: 'question', profNotes: 'profNote', examples: 'example', customRules: 'customRule' };
const TRACKED = ['guidelines', 'profNotes', 'examples', 'deadlines', 'revisions'];
function openEditor(coll, id, preset = {}) {
  const obj = id ? Model.get(coll, id) : Object.assign(Factory[FACTORY_OF[coll]](), preset);
  if (!obj) return UI.toast('Elemento non trovato', 'err');
  const fields = Forms[coll](obj);
  UI.form({
    title: (id ? 'Modifica ' : 'Nuovo/a ') + (Model.COLL_LABEL[coll] || '').toLowerCase(), fields, value: obj, size: fields.length > 8 ? 'wide' : '', track: !!id && TRACKED.includes(coll),
    onSubmit(v, meta) {
      if (Forms[coll + 'Fix']) Forms[coll + 'Fix'](v, obj);
      if (id) Model.update(coll, id, v, meta);
      else { const o = Object.assign(obj, v); Model.add(coll, o); if (Forms[coll + 'After']) Forms[coll + 'After'](o); }
      App.refresh();
    }
  });
}
Actions['edit'] = d => openEditor(d.coll, d.id);
Actions['new'] = d => openEditor(d.coll, null, d.preset ? JSON.parse(d.preset) : {});
Actions['delete'] = async d => {
  const o = Model.get(d.coll, d.id);
  if (!o) return;
  if (!(await UI.confirm('Eliminare "' + Model.labelOf(d.coll, o) + '"?', { okLabel: 'Elimina', danger: true }))) return;
  const snap = Model.remove(d.coll, d.id);
  App.refresh();
  UI.toast((Model.COLL_LABEL[d.coll] || 'Elemento') + ' eliminato', 'info', { actionLabel: 'Annulla', onAction: () => { Model.restore(snap); App.refresh(); } });
};
Actions['go'] = d => App.go(d.route, d.id || '', d.extra || '');

/* ---------- DOMANDE PER IL PROFESSORE (da qualsiasi sezione) ---------- */
Actions['question-add'] = d => {
  const ref = d.reftype ? { type: d.reftype, id: d.refid } : null;
  openQuestionForm({ text: d.text || '', topic: d.topic || '', sourceRef: ref });
};
Actions['question-quick'] = () => openQuestionForm({ topic: (Views[App.route.name] || {}).title || '' });
function openQuestionForm(preset) {
  const q = Object.assign(Factory.question(), preset);
  const nr = Metrics.nextRevision();
  if (nr) q.revisionId = nr.id;
  UI.form({ title: 'Aggiungi alle domande per il professore', fields: Forms.questions(q), value: q, submitLabel: 'Aggiungi domanda',
    onSubmit(v) { Model.add('questions', Object.assign(q, v)); UI.toast('Domanda aggiunta alla lista'); App.refresh(); } });
}

/* =====================================================================
   FORM (schemi)
   ===================================================================== */
Forms.info = () => [
  { key: 'name', label: 'Nome progetto', required: true, full: true },
  { key: 'subject', label: 'Materia' }, { key: 'degree', label: 'Corso di laurea' },
  { key: 'professor', label: 'Docente' }, { key: 'year', label: 'Anno accademico', placeholder: 'es. 2026/27' },
  { key: 'members', label: 'Componenti del gruppo', type: 'tags', full: true, hint: 'Separati da virgola' },
  { key: 'teamName', label: 'Nome del team' }, { key: 'company', label: 'Azienda del progetto' },
  { key: 'referent', label: 'Referente aziendale e contatti', full: true },
  { key: 'dueDate', label: 'Data consegna finale', type: 'date' },
  { key: 'objective', label: 'Obiettivo', type: 'textarea', rows: 3 },
  { key: 'description', label: 'Descrizione', type: 'textarea', rows: 3 },
  { key: 'notes', label: 'Note', type: 'textarea', rows: 3 }
];
Forms.profNotes = () => [
  { key: 'title', label: 'Titolo', required: true, full: true },
  { key: 'date', label: 'Data', type: 'date', required: true },
  { key: 'category', label: 'Categoria', type: 'select', options: C.PROF_CATEGORIES },
  { key: 'source', label: 'Fonte', type: 'select', options: C.PROF_SOURCES_KIND },
  { key: 'importance', label: 'Importanza', type: 'select', options: C.PRIORITIES },
  { key: 'content', label: 'Contenuto', type: 'textarea', rows: 7, hint: 'Riporta le parole del professore il più fedelmente possibile' },
  { key: 'notes', label: 'Note personali', type: 'textarea', rows: 2 },
  { key: 'applied', label: 'Già recepita nel progetto', type: 'checkbox' }
];
Forms.examples = () => [
  { key: 'title', label: 'Titolo', required: true, full: true },
  { key: 'year', label: 'Anno' }, { key: 'subject', label: 'Materia' },
  { key: 'grade', label: 'Voto (se conosciuto)' }, { key: 'corrected', label: 'Corretto dal professore', type: 'checkbox' },
  { key: 'description', label: 'Descrizione', type: 'textarea', rows: 2 },
  { key: 'text', label: 'Testo (serve per ricavare il metodo)', type: 'textarea', rows: 12, hint: 'Più comodo: usa "Carica PDF / Word" nella pagina Esempi, il testo viene letto in automatico.' },
  { key: 'knownErrors', label: 'Errori conosciuti (uno per riga)', type: 'textarea', rows: 3 },
  { key: 'notes', label: 'Note', type: 'textarea', rows: 2 }
];
Forms.guidelines = () => [
  { key: 'title', label: 'Titolo', required: true, full: true },
  { key: 'description', label: 'Descrizione', type: 'textarea', rows: 4 },
  { key: 'motivation', label: 'Motivazione', type: 'textarea', rows: 2 },
  { key: 'source', label: 'Fonte (gerarchia)', type: 'select', options: C.SOURCES.map(s => [s.id, s.rank + ' · ' + s.label]) },
  { key: 'sourceRef', label: 'Riferimento fonte', placeholder: 'es. Consegna punto 3, email del 12/10' },
  { key: 'priority', label: 'Priorità', type: 'select', options: C.PRIORITIES },
  { key: 'status', label: 'Stato', type: 'select', options: C.GUIDE_STATUS },
  { key: 'phaseId', label: 'Fase collegata', type: 'select', options: H.phaseOptions() },
  { key: 'mandatory', label: 'Obbligatoria (controllata dal checker)', type: 'checkbox' },
  { key: 'notes', label: 'Note', type: 'textarea', rows: 2 }
];
Forms.tasks = () => [
  { key: 'title', label: 'Attività', required: true, full: true },
  { key: 'phaseId', label: 'Fase', type: 'select', options: H.phaseOptions() },
  { key: 'deadlineId', label: 'Scadenza collegata', type: 'select', options: [['', '— nessuna —']].concat(Model.list('deadlines').map(d => [d.id, U.fmtDate(d.date) + ' · ' + d.title])) },
  { key: 'status', label: 'Stato', type: 'select', options: C.TASK_STATUS },
  { key: 'priority', label: 'Priorità', type: 'select', options: C.PRIORITIES },
  { key: 'due', label: 'Data prevista', type: 'date' },
  { key: 'notes', label: 'Note', type: 'textarea', rows: 2 }
];
Forms.tasksFix = (v, o) => { if (v.status === 'COMPLETATA' && o.status !== 'COMPLETATA') v.doneAt = U.nowISO(); if (v.status !== 'COMPLETATA') v.doneAt = null; };
Forms.deadlines = () => [
  { key: 'title', label: 'Titolo', required: true, full: true },
  { key: 'kind', label: 'Tipo', type: 'select', options: C.DEADLINE_KIND },
  { key: 'priority', label: 'Priorità', type: 'select', options: C.PRIORITIES },
  { key: 'date', label: 'Data', type: 'date', required: true }, { key: 'time', label: 'Ora (facoltativa)', type: 'time' },
  { key: 'status', label: 'Stato', type: 'select', options: C.DEADLINE_STATUS },
  { key: 'description', label: 'Descrizione', type: 'textarea', rows: 2 },
  { key: 'taskIds', label: 'Attività collegate', type: 'multiselect', options: Model.list('tasks').map(t => [t.id, t.title + ' (' + t.status.toLowerCase() + ')']) },
  { key: 'phaseIds', label: 'Fasi collegate', type: 'multiselect', options: H.phaseOptions(false) }
];
Forms.revisions = () => [
  { key: 'date', label: 'Data', type: 'date', required: true }, { key: 'time', label: 'Ora', type: 'time' },
  { key: 'status', label: 'Stato', type: 'select', options: C.REVISION_STATUS },
  { key: 'topics', label: 'Argomenti da mostrare', type: 'textarea', rows: 3 },
  { key: 'materials', label: 'Materiale da portare', type: 'textarea', rows: 2 },
  { key: 'questionsText', label: 'Altre domande (oltre a quelle in lista)', type: 'textarea', rows: 2 },
  { key: 'openProblems', label: 'Problemi aperti', type: 'textarea', rows: 2 },
  { key: 'corrections', label: 'Correzioni ricevute', type: 'textarea', rows: 3, hint: 'Dopo la revisione: verranno proposte come materiale del professore (categoria CORREZIONE)' },
  { key: 'indications', label: 'Indicazioni ricevute', type: 'textarea', rows: 3 },
  { key: 'nextActions', label: 'Attività successive (una per riga)', type: 'textarea', rows: 3, hint: 'Puoi trasformarle in attività con un clic' },
  { key: 'notes', label: 'Note', type: 'textarea', rows: 2 }
];
Forms.questions = () => [
  { key: 'text', label: 'Domanda', type: 'textarea', rows: 3, required: true },
  { key: 'topic', label: 'Argomento' },
  { key: 'priority', label: 'Priorità', type: 'select', options: C.PRIORITIES },
  { key: 'revisionId', label: 'Revisione prevista', type: 'select', options: [['', '— da assegnare —']].concat(Model.list('revisions').slice().sort((a, b) => U.str(a.date).localeCompare(U.str(b.date))).map(r => [r.id, U.fmtDate(r.date) + ' (' + r.status.toLowerCase() + ')'])) },
  { key: 'status', label: 'Stato', type: 'select', options: C.QUESTION_STATUS },
  { key: 'answer', label: 'Risposta del professore', type: 'textarea', rows: 3 }
];
Forms.questionsFix = (v) => { if (U.str(v.answer).trim() && (v.status === 'APERTA' || v.status === 'POSTA')) v.status = 'RISPOSTA'; };
Forms.customRules = () => [
  { key: 'text', label: 'Regola (descrizione)', required: true, full: true, placeholder: 'es. Il professore vuole sempre la tabella prima del grafico' },
  { key: 'type', label: 'Tipo di controllo', type: 'select', options: C.CUSTOM_RULE_TYPES.map(t => [t.id, t.label]) },
  { key: 'severity', label: 'Gravità segnalazione', type: 'select', options: C.SEVERITY },
  { key: 'p_blockType', label: 'Tipo di blocco (per "campo compilato")', type: 'select', options: [['', 'Tutti']].concat(Object.entries(C.BLOCK_TYPES)) },
  { key: 'p_field', label: 'Campo richiesto (per "campo compilato")', type: 'select', options: Object.entries(C.BLOCK_FIELDS) },
  { key: 'p_term', label: 'Termine / sezione', hint: 'Per: contenere termine, termine vietato, sezione obbligatoria, parole minime' },
  { key: 'p_replacement', label: 'Termine alternativo (per termine vietato)' },
  { key: 'p_number', label: 'Numero minimo di parole', type: 'number' },
  { key: 'active', label: 'Regola attiva', type: 'checkbox' }
];
Forms.customRulesFix = (v) => {
  v.params = { blockType: v.p_blockType, field: v.p_field, term: v.p_term, replacement: v.p_replacement, number: v.p_number };
  ['p_blockType', 'p_field', 'p_term', 'p_replacement', 'p_number'].forEach(k => delete v[k]);
};

/* =====================================================================
   DASHBOARD
   ===================================================================== */
const DashboardDetails = {
  title: 'Dashboard', icon: '▦',
  render() {
    const P = Store.P;
    const ov = Metrics.overall(), hl = Metrics.health(), st = Metrics.stats();
    const nd = Metrics.nextDeadline(), days = Metrics.daysToDue();
    const lr = Metrics.lastRevision(), nr = Metrics.nextRevision();
    const open = Metrics.openIssues();
    const sevCount = s => open.filter(i => i.severity === s).length;
    const att = Metrics.attention();
    const rp = Metrics.reportProgress();
    const tasksOpen = Model.list('tasks').filter(t => t.status !== 'COMPLETATA').sort((a, b) => (U.str(a.due) || '9').localeCompare(U.str(b.due) || '9')).slice(0, 6);
    const qOpen = Model.list('questions').filter(q => q.status === 'APERTA').sort((a, b) => C.PRIORITIES.indexOf(b.priority) - C.PRIORITIES.indexOf(a.priority)).slice(0, 5);
    let h = '';
    h += '<div class="grid g4 mb">';
    h += H.card('', '<div class="kpi"><span class="lbl">Progresso generale</span><span class="val">' + ov.total + '%</span>' + UI.progress(ov.total, 'lg') + '<span class="det mt-s">Calcolato da fasi, linee guida, revisioni e relazione</span></div>');
    h += H.card('', '<div class="kpi"><span class="lbl">Prossima scadenza</span>' + (nd ? '<span class="val" style="font-size:17px">' + U.esc(U.truncate(nd.title, 40)) + '</span><span class="det">' + U.fmtDate(nd.date) + (nd.time ? ' ' + nd.time : '') + ' ' + UI.daysBadge(nd.date) + '</span>' : '<span class="det">Nessuna scadenza futura</span>') + '</div>');
    h += H.card('', '<div class="kpi"><span class="lbl">Giorni alla consegna</span><span class="val">' + (days === null ? '—' : days < 0 ? 'Scaduta' : days) + '</span><span class="det">' + (days === null ? '<button class="btn xs" data-action="edit-info">Imposta la data</button>' : 'Consegna ' + U.fmtDate(P.info.dueDate) + ' · ' + U.relDays(P.info.dueDate)) + '</span></div>');
    h += H.card('', '<div class="kpi"><span class="lbl">Project health</span><span class="health h-' + hl.level + '"><span class="dot"></span>' + hl.level + '</span><span class="det">Punteggio ' + hl.score + '/100 <button class="btn xs ghost" data-action="health-details">Perché?</button></span></div>');
    h += '</div>';

    h += '<div class="grid g3 mb">';
    h += H.card('Attività da completare', tasksOpen.length ? '<div class="stack s">' + tasksOpen.map(t => '<label class="check-line"><input type="checkbox" data-change="task-toggle" data-id="' + t.id + '"><span class="grow">' + U.esc(t.title) + ' ' + (t.due ? UI.daysBadge(t.due) : '') + '<br><span class="tiny muted">' + U.esc((Model.get('phases', t.phaseId) || {}).title || 'Senza fase') + '</span></span></label>').join('') + '</div>' : UI.empty('Nessuna attività aperta', 'Aggiungi attività nelle fasi o nelle scadenze.'),
      '<span class="badge">' + st.tasksOpen + ' aperte</span><button class="btn xs" data-action="new" data-coll="tasks">＋</button>');
    h += H.card('Possibili errori aperti', '<div class="row mb">' + ['CRITICO', 'PROBABILE ERRORE', 'ATTENZIONE', 'INFO'].map(s => UI.badge(s + ' ' + sevCount(s))).join('') + '</div>' +
      (open.length ? '<div class="stack s">' + open.slice().sort((a, b) => C.SEV_RANK[b.severity] - C.SEV_RANK[a.severity]).slice(0, 4).map(i => '<button class="sr-item" data-action="go" data-route="checks" data-id="' + i.id + '">' + UI.badge(i.severity) + ' ' + U.esc(U.truncate(i.problem, 80)) + '<small>' + U.esc(i.element) + '</small></button>').join('') + '</div>' : UI.empty('Nessun errore aperto', P.checker.lastRunAt ? 'Ultimo controllo: ' + U.fmtDateTime(P.checker.lastRunAt) : 'Esegui il Project Checker.')),
      '<button class="btn xs" data-action="go" data-route="checks">Apri</button>');
    h += H.card('Attenzione richiesta', att.length ? '<div class="attn">' + att.slice(0, 6).map(a => '<div class="attn-item ' + a.level + '"><div class="grow"><b>' + U.esc(a.title) + '</b><small>' + U.esc(a.text) + '</small></div><button class="btn xs" data-action="go" data-route="' + a.route + '" data-id="' + U.attr(a.id || '') + '">Vai</button></div>').join('') + (att.length > 6 ? '<p class="small muted">+ altri ' + (att.length - 6) + '</p>' : '') + '</div>' : UI.empty('Tutto sotto controllo', 'Nessuna scadenza, revisione o errore critico da segnalare.'));
    h += '</div>';

    h += '<div class="grid g3 mb">';
    h += H.card('Revisioni con il professore', '<div class="stack"><div><h4>Ultima revisione</h4>' + (lr ? '<p>' + U.fmtDate(lr.date) + ' · ' + U.esc(U.truncate(lr.corrections || lr.indications || lr.topics || 'nessuna nota', 90)) + '</p>' : '<p class="muted">Nessuna revisione svolta</p>') + '</div>' +
      '<div><h4>Prossima revisione</h4>' + (nr ? (() => { const rd = Metrics.revisionReadiness(nr); return '<p>' + U.fmtDate(nr.date) + (nr.time ? ' ' + nr.time : '') + ' ' + UI.daysBadge(nr.date) + ' ' + (rd.ready ? UI.badge('pronta', 'ok') : UI.badge('non pronta', 'warn')) + '</p>' + (rd.ready ? '' : '<p class="small muted">Manca: ' + U.esc(rd.missing.join(', ')) + '</p>') + '<button class="btn xs mt-s" data-action="revision-prepare" data-id="' + nr.id + '">Prepara revisione</button>'; })() : '<p class="muted">Nessuna revisione pianificata</p><button class="btn xs mt-s" data-action="new" data-coll="revisions">Pianifica</button>') + '</div></div>');
    h += H.card('Stato della relazione', '<div class="kpi"><span class="val">' + rp.pct + '%</span>' + UI.progress(rp.pct) + '<span class="det mt-s">' + rp.filled + '/' + rp.total + ' sezioni scritte · ' + rp.words + ' parole</span></div><div class="row mt">' +
      C.REPORT_STATUS.map(s => UI.badge(s + ' ' + (rp.byStatus[s] || 0))).join('') + '</div>' + (rp.requiredEmpty && rp.requiredEmpty.length ? '<p class="small mt">Obbligatorie vuote: ' + U.esc(rp.requiredEmpty.map(s => s.title).join(', ')) + '</p>' : ''), '<button class="btn xs" data-action="go" data-route="report">Apri</button>');
    h += H.card('Domande da fare al professore', qOpen.length ? '<ul class="stack s" style="padding-left:18px;margin:0">' + qOpen.map(q => '<li>' + U.esc(U.truncate(q.text, 100)) + ' ' + UI.badge(q.priority) + '</li>').join('') + '</ul>' : UI.empty('Nessuna domanda aperta', 'Usa "＋ Domanda prof." da qualsiasi sezione.'),
      '<span class="badge">' + st.questionsOpen + '</span><button class="btn xs" data-action="go" data-route="questions">Apri</button>');
    h += '</div>';

    h += '<div class="grid g2 mb">';
    h += H.card('Progresso per area', '<div class="stack s">' + ov.parts.map(p => '<div class="prog-row" data-tip="Peso ' + p.weight + '% · ' + U.attr(p.detail) + '"><span>' + U.esc(p.label) + '</span>' + UI.progress(p.pct) + '<span class="pct">' + p.pct + '%</span></div>').join('') +
      '<div class="divider"></div>' + (ov.phRows.length ? ov.phRows.map(r => '<div class="prog-row" data-tip="' + U.attr(r.done + '/' + r.total + ' · base: ' + r.basis) + '"><span class="small">' + U.esc(U.truncate(r.label, 32)) + '</span>' + UI.progress(r.pct) + '<span class="pct small">' + r.pct + '%</span></div>').join('') : '<p class="muted small">Nessuna fase</p>') +
      '<div class="divider"></div><div class="prog-row"><b>TOTALE</b>' + UI.progress(ov.total, 'lg') + '<span class="pct">' + ov.total + '%</span></div></div>');
    h += H.card('Ultime modifiche', P.activity.length ? '<div class="log">' + P.activity.slice(0, 9).map(a => '<div class="log-item"><span class="log-time">' + (U.isoToLocalDate(a.at) === U.todayISO() ? U.fmtTime(a.at) : U.fmtDate(a.at).slice(0, 5)) + '</span><span>' + U.esc(a.text) + '</span></div>').join('') + '</div>' : UI.empty('Nessuna attività', ''),
      '<button class="btn xs" data-action="go" data-route="history">Cronologia</button>');
    h += '</div>';

    h += H.card('Statistiche', '<div class="grid g4">' + [
      ['Attività', st.tasks], ['Completate', st.tasksDone], ['Aperte', st.tasksOpen], ['Checklist', st.checklistDone + '/' + st.checklist],
      ['Errori aperti', st.issuesOpen], ['Errori risolti', st.issuesResolved], ['Revisioni svolte', st.revisions], ['Giorni alla consegna', st.daysToDue === null ? '—' : st.daysToDue]
    ].map(([l, v]) => '<div class="kpi"><span class="lbl">' + l + '</span><span class="val" style="font-size:20px">' + v + '</span></div>').join('') + '</div>');
    return h;
  },
  whatNowHTML(list) {
    if (!list.length) return '<p class="mt">Nessuna priorità urgente: il progetto è in ordine. Puoi continuare con la fase in corso o eseguire il Quality Check.</p>';
    return '<div class="mt">' + list.map((x, i) => '<div class="wn-item"><span class="wn-num">' + (i + 1) + '</span><div><b>' + U.esc(x.title) + '</b><p class="small muted mt-s">' + U.esc(x.why) + '</p></div><button class="btn sm primary" data-action="go" data-route="' + x.route + '" data-id="' + U.attr(x.id || '') + '">' + U.esc(x.actionLabel) + '</button></div>').join('') + '</div>';
  }
};
Actions['what-now'] = () => { App.ui.whatNow = Metrics.whatNow(); const el = UI.$('#whatnow-out'); if (el) el.innerHTML = DashboardDetails.whatNowHTML(App.ui.whatNow); };
Actions['health-details'] = () => {
  const hl = Metrics.health();
  UI.modal({ title: 'Project health: ' + hl.level + ' (' + hl.score + '/100)', size: 'narrow', body: '<p class="small muted mb">Si parte da 100 e si sottraggono punti per ogni fattore di rischio rilevato.</p>' +
    (hl.reasons.length ? '<div class="table-wrap"><table class="tbl"><tr><th>Fattore</th><th class="right">Punti</th></tr>' + hl.reasons.map(r => '<tr><td>' + U.esc(r.text) + '</td><td class="num">−' + r.pts + '</td></tr>').join('') + '</table></div>' : '<p>Nessun fattore di rischio rilevato.</p>') +
    '<p class="small muted mt">OTTIMO ≥ 85 · BUONO ≥ 65 · ATTENZIONE ≥ 45 · RISCHIO &lt; 45</p>' });
};
Actions['task-toggle'] = (d, el) => {
  const t = Model.get('tasks', d.id);
  if (!t) return;
  const done = el.checked;
  Model.update('tasks', d.id, { status: done ? 'COMPLETATA' : 'DA FARE', doneAt: done ? U.nowISO() : null }, { track: false });
  History.log((done ? 'Completata attività: ' : 'Riaperta attività: ') + t.title, 'tasks');
  App.refresh();
};

/* =====================================================================
   PROGETTO (scheda + archivio file)
   ===================================================================== */
Views.project = {
  title: 'Progetto', icon: '◧',
  render() {
    const P = Store.P, i = P.info;
    const row = (l, v) => '<tr><th style="width:200px">' + l + '</th><td class="prewrap">' + (v ? U.esc(v) : '<span class="muted">—</span>') + '</td></tr>';
    let h = H.head('Progetto', 'Tutte le informazioni sono modificabili. Le modifiche vengono registrate nella cronologia.',
      '<button class="btn primary" data-action="edit-info">Modifica dati</button><button class="btn" data-action="project-new">Nuovo progetto</button>');
    h += '<div class="grid g2 mb">';
    h += H.card('Scheda progetto', '<div class="table-wrap"><table class="tbl">' + row('Nome progetto', i.name) + row('Materia', i.subject) + row('Corso di laurea', i.degree) + row('Docente', i.professor) +
      row('Anno accademico', i.year) + row('Componenti del gruppo', i.members.join(', ')) + row('Data consegna finale', i.dueDate ? U.fmtDate(i.dueDate) + ' (' + U.relDays(i.dueDate) + ')' : '') +
      row('Obiettivo', i.objective) + row('Descrizione', i.description) + row('Note', i.notes) + '</table></div>' +
      '<p class="small muted mt">La consegna ufficiale si gestisce nella sezione <button class="btn xs" data-action="go" data-route="brief">Consegna</button>, dove viene conservata senza modifiche.</p>');
    h += '<div class="stack">';
    h += H.card('Riepilogo', '<div class="grid g2">' + [['Creato il', U.fmtDateTime(P.createdAt)], ['Ultima modifica', U.fmtDateTime(P.updatedAt)], ['Fasi', P.phases.length], ['Linee guida', P.guidelines.length],
      ['Blocchi di contenuto', Model.allBlocks().length], ['File allegati', P.files.length], ['Versioni registrate', P.history.length], ['Tipo', P.isDemo ? 'Progetto dimostrativo' : 'Progetto reale']]
      .map(([l, v]) => '<div class="kpi"><span class="lbl">' + l + '</span><span class="det" style="font-size:15px;font-weight:600">' + U.esc(v) + '</span></div>').join('') + '</div>');
    h += H.card('Zona pericolosa', '<p class="small muted mb">L\'eliminazione rimuove il progetto e i suoi file da questo browser. Esporta prima un backup.</p><div class="btn-group"><button class="btn" data-action="backup-export">Esporta backup</button><button class="btn danger" data-action="project-delete">Elimina progetto</button></div>');
    h += '</div></div>';
    h += Views.project.filesCard();
    return h;
  },
  filesCard() {
    const P = Store.P;
    const files = P.files.slice().sort((a, b) => U.str(b.createdAt).localeCompare(U.str(a.createdAt)));
    return H.card('Archivio file del progetto', files.length ? '<div class="table-wrap"><table class="tbl"><tr><th>Nome</th><th>Categoria</th><th>Descrizione / riferimento</th><th>Dimensione</th><th>Data</th><th></th></tr>' +
      files.map(f => '<tr><td><button class="btn xs ghost" data-action="file-open" data-id="' + f.id + '">📎 ' + U.esc(U.truncate(f.name, 50)) + '</button>' + (f.storedBlob ? '' : ' ' + UI.badge('solo riferimento', 'warn')) + '</td><td>' + U.esc(f.category) + '</td><td class="small">' + U.esc(f.description) + (f.ref ? '<br><span class="muted">' + U.esc(f.ref) + '</span>' : '') + '</td><td class="num">' + U.fileSize(f.size) + '</td><td>' + U.fmtDate(f.createdAt) + '</td>' +
        '<td><div class="btn-group"><button class="btn xs" data-action="file-download" data-id="' + f.id + '">Scarica</button><button class="btn xs" data-action="file-edit" data-id="' + f.id + '">Modifica</button><button class="btn xs danger" data-action="file-delete" data-id="' + f.id + '">Elimina</button></div></td></tr>').join('') + '</table></div>'
      : UI.empty('Nessun file', 'Carica PDF, immagini, fogli di calcolo o documenti: restano salvati in questo browser.'),
      '<button class="btn sm" data-action="file-upload">Carica file</button><button class="btn sm" data-action="file-reference">Aggiungi solo riferimento</button>');
  }
};
Actions['edit-info'] = () => {
  const P = Store.P;
  UI.form({ title: 'Dati del progetto', fields: Forms.info(), value: P.info, size: 'wide', track: true,
    onSubmit(v, meta) {
      const before = U.clone(P.info);
      Object.assign(P.info, v);
      const keys = Object.keys(v).filter(k => JSON.stringify(before[k]) !== JSON.stringify(P.info[k]));
      if (keys.length) {
        History.version({ type: 'info', id: P.id, label: 'Dati del progetto', field: keys.join(', '), before: Object.fromEntries(keys.map(k => [k, before[k]])), after: Object.fromEntries(keys.map(k => [k, P.info[k]])), reason: meta.reason, origin: meta.origin });
        History.log('Modificati dati del progetto (' + keys.join(', ') + ')', 'progetto');
      }
      Store.touch(); App.renderNav(); App.refresh();
    } });
};
Actions['project-new'] = () => App.newProjectForm();
Actions['project-delete'] = async () => {
  const P = Store.P;
  if (!(await UI.confirm('Eliminare definitivamente il progetto "' + (P.info.name || 'Senza nome') + '" e tutti i suoi file? L\'operazione non può essere annullata.' + (Sync.on && !P.isDemo ? '\n\nATTENZIONE: il progetto è condiviso, verrà eliminato per TUTTO il team.' : ''), { okLabel: 'Elimina definitivamente', danger: true }))) return;
  const name = P.info.name;
  await Store.deleteProject(P.id);
  await Store.saveSettings();
  UI.toast('Progetto "' + name + '" eliminato');
  App.afterProjectChange();
};
Actions['file-upload'] = async (d) => {
  const files = await UI.pickFiles({ multiple: true });
  if (!files.length) return;
  const recs = await UI.Files.storeMany(files, { category: d.category || 'Altro' });
  UI.toast(U.plural(recs.length, 'file caricato', 'file caricati'));
  App.refresh();
};
Actions['file-reference'] = () => UI.form({ title: 'Aggiungi riferimento a un file', intro: '<p class="small muted">Per file che non vuoi caricare nel browser: conservi nome, categoria, descrizione e posizione (es. cartella, link, Drive).</p>',
  fields: [{ key: 'name', label: 'Nome file', required: true, full: true }, { key: 'category', label: 'Categoria', type: 'select', options: C.FILE_CATEGORIES }, { key: 'ref', label: 'Riferimento / posizione' }, { key: 'description', label: 'Descrizione', type: 'textarea', rows: 2 }],
  onSubmit(v) { Store.P.files.push(Object.assign({ id: U.uid('file'), type: '', size: 0, storedBlob: false, createdAt: U.nowISO() }, v)); History.log('Riferimento file aggiunto: ' + v.name, 'files'); Store.touch(); App.refresh(); } });
Actions['file-open'] = d => UI.Files.open(d.id);
Actions['file-download'] = d => UI.Files.download(d.id);
Actions['file-edit'] = d => {
  const f = Model.get('files', d.id);
  if (!f) return;
  UI.form({ title: 'Modifica file', fields: [{ key: 'name', label: 'Nome', required: true, full: true }, { key: 'category', label: 'Categoria', type: 'select', options: C.FILE_CATEGORIES }, { key: 'ref', label: 'Riferimento' }, { key: 'description', label: 'Descrizione', type: 'textarea', rows: 2 }],
    value: f, onSubmit(v) { Object.assign(f, v); Store.touch(); App.refresh(); } });
};
Actions['file-delete'] = async d => {
  const f = Model.get('files', d.id);
  if (!f) return;
  if (!(await UI.confirm('Eliminare il file "' + f.name + '"? Verrà scollegato anche dagli elementi che lo usano.', { okLabel: 'Elimina', danger: true }))) return;
  Model.remove('files', d.id);
  await UI.Files.remove(d.id);
  App.refresh();
};
Actions['file-detach'] = d => {
  const [coll, id] = U.str(d.owner).split(':');
  if (coll === 'reportcover') { Store.P.report.cover.logoIds = U.arr(Store.P.report.cover.logoIds).filter(x => x !== d.id); Store.touch(); UI.closeTop(); return Actions['report-cover'](); }
  const o = coll === 'block' ? (Model.findBlock(id) || {}).block : Model.get(coll, id);
  if (!o) return;
  o.fileIds = U.arr(o.fileIds).filter(x => x !== d.id);
  Store.touch(); App.refresh();
};
Actions['file-attach'] = async d => {
  const [coll, id] = U.str(d.owner).split(':');
  const o = coll === 'block' ? (Model.findBlock(id) || {}).block : Model.get(coll, id);
  if (!o) return;
  const files = await UI.pickFiles({ multiple: true });
  if (!files.length) return;
  const recs = await UI.Files.storeMany(files, { category: d.category || 'Altro', ref: Model.labelOf(coll === 'block' ? 'phases' : coll, o) });
  o.fileIds = U.arr(o.fileIds).concat(recs.map(r => r.id));
  Store.touch(); App.refresh();
};

/* =====================================================================
   CONSEGNA (originale immutabile + analisi)
   ===================================================================== */
Views.brief = {
  title: 'Consegna', icon: '✉',
  render(params) {
    const B = Store.P.brief;
    let h = H.head('Consegna del professore', 'Il testo originale viene conservato senza modifiche e ha priorità assoluta (fonte n. 2, subito dopo le correzioni dirette del professore).',
      '<button class="btn primary" data-action="brief-edit">' + (B.original ? 'Sostituisci consegna' : 'Inserisci consegna') + '</button><button class="btn" data-action="upload" data-kind="brief" data-accept=".pdf,.docx,.txt,.md,.html">Carica da file</button><button class="btn" data-action="brief-analyze"' + (B.original ? '' : ' disabled') + '>Analizza consegna</button>');
    h += '<div class="grid g2" style="align-items:start">';
    h += H.card('Consegna originale', B.original ? '<p class="small muted mb">Salvata il ' + U.fmtDateTime(B.savedAt) + ' · ' + U.words(B.original) + ' parole · sola lettura</p><div class="prewrap" style="max-height:70vh;overflow:auto;background:var(--surface-2);padding:12px;border-radius:6px;border:1px solid var(--line)">' + U.esc(B.original) + '</div>' +
      (B.history.length ? '<details class="exp mt"><summary>Versioni precedenti (' + B.history.length + ')</summary><div class="exp-body stack">' + B.history.map(v => '<div><p class="small muted">Sostituita il ' + U.fmtDateTime(v.replacedAt) + (v.reason ? ' · ' + U.esc(v.reason) : '') + '</p><div class="prewrap small" style="max-height:200px;overflow:auto;border:1px solid var(--line);padding:8px;border-radius:6px">' + U.esc(v.text) + '</div></div>').join('') + '</div></details>' : '')
      : UI.empty('Consegna non inserita', 'Incolla il testo integrale della consegna così com\'è.', '<button class="btn primary" data-action="brief-edit">Inserisci consegna</button>'),
      B.original ? '<button class="btn xs" data-action="brief-copy">Copia</button>' : '');
    let an = '';
    C.BRIEF_CATS.forEach(c => {
      const items = B.analysis.filter(a => a.cat === c.id);
      const req = ['mandatory', 'deliverables', 'results', 'data'].includes(c.id);
      an += '<div class="mb"><div class="row between"><h4>' + c.label + ' <span class="badge">' + items.length + '</span></h4><button class="btn xs" data-action="brief-item-add" data-cat="' + c.id + '">＋ Aggiungi</button></div>' +
        (items.length ? '<div class="stack s mt-s">' + items.map(a => '<div class="cl-item' + (a.done ? ' done' : '') + '" id="item-' + a.id + '">' +
          (req ? '<input type="checkbox" data-change="brief-item-done" data-id="' + a.id + '"' + (a.done ? ' checked' : '') + ' aria-label="Soddisfatto" title="Segna come soddisfatto">' : '<span class="muted">•</span>') +
          '<span class="cl-text small">' + U.esc(a.text) + (a.origin === 'AUTO' ? ' <span class="badge outline">da analisi</span>' : '') + '</span><span class="btn-group">' + H.qBtn('Chiarimento sulla consegna: "' + a.text + '"', 'Consegna', 'brief', a.id) +
          '<button class="btn xs" data-action="brief-item-edit" data-id="' + a.id + '">Modifica</button><button class="btn xs danger" data-action="brief-item-del" data-id="' + a.id + '">×</button></span></div>').join('') + '</div>' : '<p class="small muted mt-s">Nessuna voce</p>') + '</div>';
    });
    h += H.card('Analisi della consegna', '<p class="small muted mb">Le voci con casella (obbligatori, dati, risultati, elaborati) vengono controllate dal Project Checker finché non le segni come soddisfatte.</p>' + an);
    h += '</div>';
    return h;
  },
  mount(root, params) { if (params.id) { const el = document.getElementById('item-' + params.id); if (el) { el.scrollIntoView({ block: 'center' }); el.style.outline = '2px solid var(--accent)'; } } }
};
Actions['brief-edit'] = () => {
  const B = Store.P.brief;
  UI.form({ title: B.original ? 'Sostituisci la consegna' : 'Inserisci la consegna', size: 'wide',
    intro: B.original ? '<p class="small" style="color:var(--warn)">Il testo attuale non verrà perso: sarà conservato tra le versioni precedenti.</p>' : '<p class="small muted">Incolla il testo integrale e originale della consegna, senza riassumerlo.</p>',
    fields: [{ key: 'text', label: 'Testo integrale della consegna', type: 'textarea', rows: 18, required: true }].concat(B.original ? [{ key: 'reason', label: 'Motivo della sostituzione', placeholder: 'es. Nuova versione pubblicata dal docente' }] : []),
    value: { text: B.original }, submitLabel: 'Salva consegna',
    onSubmit(v) {
      if (B.original && v.text !== B.original) {
        B.history.unshift({ text: B.original, savedAt: B.savedAt, replacedAt: U.nowISO(), reason: v.reason || '' });
        History.version({ type: 'brief', id: 'brief', label: 'Consegna ufficiale', field: 'testo', before: B.original, after: v.text, reason: v.reason || 'Sostituzione consegna', origin: 'PROFESSORE' });
      }
      if (v.text !== B.original) { B.original = v.text; B.savedAt = U.nowISO(); History.log('Consegna ufficiale ' + (B.history.length ? 'sostituita' : 'inserita'), 'consegna'); Store.touch(); }
      App.refresh();
    } });
};
Actions['brief-copy'] = async () => { const ok = await U.copy(Store.P.brief.original); UI.toast(ok ? 'Consegna copiata' : 'Copia non riuscita', ok ? 'info' : 'err'); };
Actions['brief-analyze'] = () => {
  const B = Store.P.brief;
  const res = AI.analyzeBrief(B.original);
  const existing = new Set(B.analysis.map(a => U.norm(a.text)));
  const rows = res.items.filter(it => !existing.has(U.norm(it.text)));
  const unc = res.unclassified.filter(s => !existing.has(U.norm(s)));
  const catSel = (i, v) => UI.select('data-cat-i="' + i + '"', [['', '— escludi —']].concat(C.BRIEF_CATS.map(c => [c.id, c.label])), v);
  const body = '<p class="small muted mb">Analisi locale per parole chiave: <b>nessuna voce viene aggiunta senza la tua conferma</b>. Correggi la categoria o escludi le frasi non pertinenti.</p>' +
    (rows.length + unc.length ? '<div class="table-wrap"><table class="tbl"><tr><th style="width:40px">✓</th><th>Frase della consegna</th><th style="width:200px">Categoria</th></tr>' +
      rows.concat(unc.map(s => ({ cat: '', text: s }))).map((it, i) => '<tr><td><input type="checkbox" data-inc="' + i + '"' + (it.cat ? ' checked' : '') + '></td><td class="small" data-text="' + i + '">' + U.esc(it.text) + (it.date ? ' ' + UI.badge(U.fmtDate(it.date), 'info') : '') + '</td><td>' + catSel(i, it.cat) + '</td></tr>').join('') + '</table></div>' : '<p>Nessuna nuova frase da classificare.</p>') +
    (res.dates.length ? '<div class="mt"><h4>Date trovate</h4>' + res.dates.map((d, i) => '<label class="check-line mt-s"><input type="checkbox" data-date="' + i + '"><span>Crea scadenza per il ' + U.fmtDate(d.date) + ' («' + U.esc(d.text) + '»)' + (U.daysUntil(d.date) < 0 ? ' — data passata' : '') + '</span></label>').join('') + '</div>' : '');
  const all = rows.concat(unc.map(s => ({ cat: '', text: s })));
  const m = UI.modal({ title: 'Analisi della consegna: proposte', size: 'wide', body, footer: '<button class="btn" data-x>Annulla</button><button class="btn primary" data-ok>Aggiungi selezionate</button>' });
  m.el.querySelector('[data-x]').onclick = () => m.close();
  m.el.querySelector('[data-ok]').onclick = () => {
    let n = 0;
    all.forEach((it, i) => {
      const inc = m.el.querySelector('[data-inc="' + i + '"]'), cat = m.el.querySelector('[data-cat-i="' + i + '"]').value;
      if (inc && inc.checked && cat) { B.analysis.push(Factory.briefItem(cat, it.text, 'AUTO')); n++; }
    });
    res.dates.forEach((d, i) => {
      const c = m.el.querySelector('[data-date="' + i + '"]');
      if (c && c.checked) { const dl = Factory.deadline(); Object.assign(dl, { title: 'Scadenza dalla consegna (' + U.fmtDate(d.date) + ')', date: d.date, description: 'Trovata nel testo: «' + d.text + '»', priority: 'ALTA' }); Store.P.deadlines.push(dl); n++; }
    });
    History.log('Analisi consegna: aggiunte ' + n + ' voci', 'consegna');
    Store.touch(); m.close(); App.refresh();
  };
};
Actions['brief-item-add'] = d => UI.form({ title: 'Nuova voce: ' + (C.BRIEF_CATS.find(c => c.id === d.cat) || {}).label, fields: [{ key: 'text', label: 'Testo', type: 'textarea', rows: 3, required: true }, { key: 'cat', label: 'Categoria', type: 'select', options: C.BRIEF_CATS.map(c => [c.id, c.label]) }],
  value: { cat: d.cat }, onSubmit(v) { Store.P.brief.analysis.push(Factory.briefItem(v.cat, v.text)); History.log('Voce consegna aggiunta', 'consegna'); Store.touch(); App.refresh(); } });
Actions['brief-item-edit'] = d => {
  const a = Store.P.brief.analysis.find(x => x.id === d.id);
  if (!a) return;
  UI.form({ title: 'Modifica voce', fields: [{ key: 'text', label: 'Testo', type: 'textarea', rows: 3, required: true }, { key: 'cat', label: 'Categoria', type: 'select', options: C.BRIEF_CATS.map(c => [c.id, c.label]) }, { key: 'done', label: 'Soddisfatta', type: 'checkbox' }],
    value: a, onSubmit(v) { History.version({ type: 'brief', id: a.id, label: 'Voce consegna', field: 'testo', before: a.text, after: v.text, origin: 'UTENTE' }); Object.assign(a, v); Store.touch(); App.refresh(); } });
};
Actions['brief-item-del'] = async d => {
  const B = Store.P.brief, i = B.analysis.findIndex(x => x.id === d.id);
  if (i < 0 || !(await UI.confirm('Eliminare questa voce dell\'analisi? Il testo originale della consegna non cambia.', { okLabel: 'Elimina', danger: true }))) return;
  const [it] = B.analysis.splice(i, 1);
  Store.touch(); App.refresh();
  UI.toast('Voce eliminata', 'info', { actionLabel: 'Annulla', onAction: () => { B.analysis.splice(i, 0, it); Store.touch(); App.refresh(); } });
};
Actions['brief-item-done'] = (d, el) => {
  const a = Store.P.brief.analysis.find(x => x.id === d.id);
  if (!a) return;
  a.done = el.checked; a.doneAt = el.checked ? U.nowISO() : null;
  History.log((a.done ? 'Requisito soddisfatto: ' : 'Requisito riaperto: ') + U.truncate(a.text, 60), 'consegna');
  Store.touch(); App.refresh();
};

/* =====================================================================
   MATERIALE DEL PROFESSORE
   ===================================================================== */
Views.prof = {
  title: 'Materiale professore', icon: '✎',
  render(params) {
    const P = Store.P;
    const f = App.ui.profFilter || '';
    const rank = n => C.SOURCE_BY_ID[C.PROF_CAT_SOURCE[n.category]].rank;
    const list = P.profNotes.filter(n => !f || n.category === f).sort((a, b) => rank(a) - rank(b) || U.str(b.date).localeCompare(U.str(a.date)));
    let h = H.head('Materiale del professore', 'Indicazioni a lezione, email, messaggi, correzioni, criteri di valutazione, file. Ordinati per gerarchia delle fonti, poi per data.',
      '<button class="btn primary" data-action="new" data-coll="profNotes">Nuovo elemento</button><button class="btn" data-action="upload" data-kind="prof">Carica file</button>');
    h += '<div class="card mb"><div class="row between"><div class="row"><span class="lbl">Categoria:</span>' + UI.select('data-change="prof-filter" aria-label="Filtra per categoria"', [['', 'Tutte (' + P.profNotes.length + ')']].concat(C.PROF_CATEGORIES.map(c => [c, c + ' (' + P.profNotes.filter(n => n.category === c).length + ')'])), f) + '</div>' +
      '<details class="exp" style="min-width:260px"><summary>Gerarchia delle fonti</summary><div class="exp-body small"><ol style="margin:0;padding-left:18px">' + C.SOURCES.map(s => '<li>' + U.esc(s.label) + '</li>').join('') + '</ol><p class="muted mt-s">Una proposta AI non ha mai priorità automatica sulle indicazioni del professore.</p></div></details></div></div>';
    if (!list.length) h += UI.empty('Nessun elemento', 'Registra qui tutto ciò che il professore dice o scrive sul progetto.', '<button class="btn primary" data-action="new" data-coll="profNotes">Aggiungi il primo</button>');
    else h += '<div class="stack">' + list.map(n => {
      const src = C.PROF_CAT_SOURCE[n.category];
      return '<article class="card ' + (n.category === 'CORREZIONE' ? 'sev-CRITICO' : n.category === 'REQUISITO' || n.category === 'INDICAZIONE UFFICIALE' ? 'sev-ATTENZIONE' : 'sev-INFO') + '" id="item-' + n.id + '">' +
        '<div class="row between top"><div class="stack s grow"><div class="row">' + UI.badge(n.category, n.category === 'CORREZIONE' ? 'risk' : 'accent') + H.srcBadge(src) + UI.badge('importanza ' + n.importance, UI.STATUS_CLASS[n.importance]) + '<span class="small muted">' + U.fmtDate(n.date) + ' · ' + U.esc(n.source) + '</span></div><h3>' + U.esc(n.title) + '</h3></div>' +
        '<label class="check-line small"><input type="checkbox" data-change="prof-applied" data-id="' + n.id + '"' + (n.applied ? ' checked' : '') + '><span>Recepita nel progetto</span></label></div>' +
        (n.content ? '<div class="mt-s">' + H.md(n.content) + '</div>' : '') + (n.notes ? '<p class="small muted mt-s"><b>Note:</b> ' + U.esc(n.notes) + '</p>' : '') +
        '<div class="row between mt"><div class="row small">' + UI.Files.chips(n.fileIds, true, 'profNotes:' + n.id) + '<button class="btn xs" data-action="file-attach" data-owner="profNotes:' + n.id + '" data-category="Materiale professore">＋ File</button></div>' +
        H.editDel('profNotes', n.id, H.qBtn('Riguardo a "' + n.title + '": ', 'Materiale professore', 'profNotes', n.id) + '<button class="btn xs" data-action="prof-to-guideline" data-id="' + n.id + '">→ Linea guida</button>') + '</div></article>';
    }).join('') + '</div>';
    return h;
  },
  mount(root, params) { if (params.id) { const el = document.getElementById('item-' + params.id); if (el) { el.scrollIntoView({ block: 'center' }); el.style.outline = '2px solid var(--accent)'; } } }
};
Actions['prof-filter'] = (d, el) => { App.ui.profFilter = el.value; App.refresh(); };
Actions['prof-applied'] = (d, el) => { const n = Model.get('profNotes', d.id); if (!n) return; Model.update('profNotes', d.id, { applied: el.checked }, { reason: el.checked ? 'Indicazione recepita' : 'Indicazione riaperta' }); App.refresh(); };
Actions['prof-to-guideline'] = d => {
  const n = Model.get('profNotes', d.id);
  if (!n) return;
  openEditor('guidelines', null, { title: n.title, description: n.content, source: C.PROF_CAT_SOURCE[n.category], sourceRef: n.category + ' del ' + U.fmtDate(n.date) + ' (' + n.source + ')', priority: n.category === 'CORREZIONE' ? 'CRITICA' : n.importance, mandatory: ['CORREZIONE', 'REQUISITO'].includes(n.category) });
};

/* =====================================================================
   ESEMPI PRECEDENTI
   ===================================================================== */
Views.examples = {
  title: 'Esempi', icon: '❐',
  render() {
    const P = Store.P;
    let h = H.head('Esempi precedenti', 'Esercizi, progetti ed elaborati degli anni precedenti. L\'app ricava il metodo (struttura, metodologia, terminologia, ordine) senza copiarne il contenuto.',
      '<button class="btn primary" data-action="upload" data-kind="example" data-accept=".pdf,.docx,.pptx,.txt,.md,.html">Carica PDF / Word</button><button class="btn" data-action="new" data-coll="examples">Nuovo esempio</button><button class="btn" data-action="examples-synth"' + (P.examples.some(e => e.text) ? '' : ' disabled') + '>Genera sintesi del metodo</button>');
    h += H.card('Sintesi del metodo', (P.examplesSynthesis ? '<div class="grid g2"><div><label class="lbl" for="ex-synth">Testo modificabile</label><textarea id="ex-synth" class="tall mono" data-bind="synthesis">' + U.esc(P.examplesSynthesis) + '</textarea></div><div><span class="lbl">Anteprima</span><div class="rep-preview" data-preview="synthesis">' + U.md(P.examplesSynthesis) + '</div></div></div>'
      : UI.empty('Nessuna sintesi', 'Aggiungi esempi con il loro testo, analizzali e genera la sintesi. Potrai modificarla e includerla nei pacchetti per Claude.')), '', 'mb');
    if (!P.examples.length) h += UI.empty('Nessun esempio', 'Aggiungi vecchi progetti o esercizi corretti dal professore.', '<button class="btn primary" data-action="new" data-coll="examples">Aggiungi esempio</button>');
    else h += '<div class="stack">' + P.examples.map(e => {
      const m = e.method;
      const list = (t, arr) => arr && arr.length ? '<div class="mb"><h4>' + t + '</h4><ul class="small" style="margin:4px 0 0;padding-left:18px">' + arr.slice(0, 30).map(x => '<li>' + U.esc(x) + '</li>').join('') + '</ul></div>' : '';
      return '<article class="card" id="item-' + e.id + '"><div class="row between top"><div><h3>' + U.esc(e.title) + '</h3><div class="row small mt-s">' + [e.year, e.subject].filter(Boolean).map(x => '<span class="muted">' + U.esc(x) + '</span>').join(' · ') +
        (e.grade ? UI.badge('voto ' + e.grade, 'ok') : '') + (e.corrected ? UI.badge('corretto dal professore', 'accent') : '') + UI.badge(U.words(e.text) + ' parole', '') + '</div></div>' +
        H.editDel('examples', e.id, '<button class="btn xs" data-action="example-load-text" data-id="' + e.id + '">Carica testo da file</button><button class="btn xs primary" data-action="example-analyze" data-id="' + e.id + '"' + (e.text ? '' : ' disabled') + '>Analizza metodo</button>') + '</div>' +
        (e.description ? '<p class="mt-s">' + U.esc(e.description) + '</p>' : '') + (e.knownErrors ? '<p class="small mt-s"><b>Errori conosciuti:</b> ' + U.esc(e.knownErrors) + '</p>' : '') +
        '<div class="row small mt-s">' + UI.Files.chips(e.fileIds, true, 'examples:' + e.id) + '<button class="btn xs" data-action="file-attach" data-owner="examples:' + e.id + '" data-category="Esempio">＋ File</button></div>' +
        (m ? '<details class="exp mt"><summary>Metodo ricavato · ' + m.counts.headings + ' sezioni, ' + m.counts.tables + ' tabelle, ' + m.counts.charts + ' figure/diagrammi, ' + m.counts.formulas + ' formule <span class="muted small">(' + U.fmtDateTime(m.analyzedAt) + ')</span></summary><div class="exp-body grid g2">' +
          '<div>' + list('Struttura', m.structure) + list('Ordine delle operazioni', m.order) + list('Metodologia', m.methodology) + '</div><div>' + list('Formule', m.formulas) + list('Calcoli', m.calculations) + list('Tabelle', m.tables) + list('Grafici e diagrammi', m.charts) +
          (m.terminology.length ? '<div class="mb"><h4>Terminologia</h4><p class="small">' + U.esc(m.terminology.join(', ')) + '</p></div>' : '') + (m.acronyms.length ? '<div class="mb"><h4>Sigle</h4><p class="small">' + U.esc(m.acronyms.join(', ')) + '</p></div>' : '') + list('Errori ricorrenti', m.recurringErrors) + '</div></div></details>' : '') + '</article>';
    }).join('') + '</div>';
    return h;
  }
};
Actions['example-analyze'] = d => {
  const e = Model.get('examples', d.id);
  if (!e || !U.str(e.text).trim()) return UI.toast('Inserisci prima il testo dell\'esempio', 'err');
  e.method = AI.analyzeExample(e);
  History.log('Analizzato metodo dell\'esempio: ' + e.title, 'examples');
  Store.touch(); App.refresh();
  UI.toast('Metodo ricavato: controlla la sezione "Metodo ricavato"');
};
Actions['examples-synth'] = async () => {
  const P = Store.P;
  P.examples.filter(e => e.text && !e.method).forEach(e => { e.method = AI.analyzeExample(e); });
  if (P.examplesSynthesis && !(await UI.confirm('Sostituire la sintesi attuale? La versione precedente resterà nella cronologia.'))) return;
  const s = AI.synthesizeExamples(P.examples);
  History.version({ type: 'synthesis', id: 'synthesis', label: 'Sintesi del metodo', field: 'testo', before: P.examplesSynthesis, after: s, reason: 'Rigenerata', origin: 'CONTROLLO AUTOMATICO' });
  P.examplesSynthesis = s;
  History.log('Generata sintesi del metodo dagli esempi', 'examples');
  Store.touch(); App.refresh();
};
Actions['example-load-text'] = async d => {
  const e = Model.get('examples', d.id);
  if (!e) return;
  const [f] = await UI.pickFiles({ multiple: false, accept: '.pdf,.docx,.pptx,.txt,.md,.markdown,.html,.htm,.csv,.tex,text/*' });
  if (!f) return;
  let text = '';
  try { text = (await Extract.file(f)).text; } catch (err) { return UI.toast(err.message, 'err'); }
  if (!text) return UI.toast('Nessun testo leggibile nel file', 'err');
  if (e.text && !(await UI.confirm('Sostituire il testo attuale dell\'esempio con il contenuto di "' + f.name + '"?'))) return;
  Model.update('examples', e.id, { text }, { reason: 'Testo caricato da ' + f.name });
  App.refresh();
};
Binders.synthesis = (el) => {
  Store.P.examplesSynthesis = el.value; Store.touch();
  const pv = UI.$('[data-preview="synthesis"]');
  if (pv) { pv.innerHTML = U.md(el.value); UI.renderMath(pv); }
};

/* =====================================================================
   LINEE GUIDA
   ===================================================================== */
Views.guidelines = {
  title: 'Linee guida', icon: '☰',
  render(params) {
    const P = Store.P;
    const f = App.ui.glFilter || '';
    const list = P.guidelines.filter(g => !f || g.status === f).slice().sort((a, b) => (C.SOURCE_BY_ID[a.source].rank - C.SOURCE_BY_ID[b.source].rank) || (C.PRIORITIES.indexOf(b.priority) - C.PRIORITIES.indexOf(a.priority)));
    const gp = Metrics.guidelinesProgress();
    let h = H.head('Linee guida del progetto', 'Struttura ufficiale del progetto. Flusso consigliato: Prepara per Claude → Claude genera → controlli e completi → importi → approvi.',
      '<button class="btn primary" data-action="new" data-coll="guidelines">Nuova linea guida</button><button class="btn" data-action="claude-prepare" data-task="guidelines">Genera con Claude</button><button class="btn" data-action="claude-import" data-kind="guidelines">Importa risposta</button><button class="btn" data-action="phases-from-guidelines"' + (P.guidelines.length ? '' : ' disabled') + '>Crea fasi</button>');
    h += '<div class="card mb"><div class="row between"><div class="row"><span class="lbl">Stato:</span>' + UI.select('data-change="gl-filter" aria-label="Filtra per stato"', [['', 'Tutti (' + P.guidelines.length + ')']].concat(C.GUIDE_STATUS.map(s => [s, s + ' (' + P.guidelines.filter(g => g.status === s).length + ')'])), f) + '</div>' +
      '<div class="row" style="min-width:260px"><span class="small">Avanzamento</span><div class="grow">' + UI.progress(gp.pct) + '</div><b>' + gp.pct + '%</b></div></div></div>';
    if (!list.length) h += UI.empty('Nessuna linea guida', P.guidelines.length ? 'Nessuna linea guida con questo stato.' : 'Crea le linee guida a mano o generale con Claude a partire da consegna ed esempi.');
    else h += '<div class="stack">' + list.map(g => {
      const ph = Model.get('phases', g.phaseId);
      return '<article class="card accent-left" id="item-' + g.id + '" style="border-left-color:' + (g.source === 'AI' ? 'var(--violet)' : C.SOURCE_BY_ID[g.source].rank <= 2 ? 'var(--risk)' : 'var(--accent)') + '">' +
        '<div class="row between top"><div class="stack s grow"><div class="row">' + H.srcBadge(g.source) + UI.badge(g.priority) + (g.mandatory ? UI.badge('obbligatoria', 'risk') : '') + (ph ? '<button class="btn xs ghost" data-action="go" data-route="dev" data-id="' + ph.id + '">→ Fase ' + (ph.order + 1) + ': ' + U.esc(ph.title) + '</button>' : '') + '</div><h3>' + U.esc(g.title) + '</h3></div>' +
        '<div>' + UI.select('data-change="gl-status" data-id="' + g.id + '" aria-label="Stato linea guida"', C.GUIDE_STATUS, g.status) + '</div></div>' +
        (g.description ? '<div class="mt-s">' + H.md(g.description) + '</div>' : '') + (g.motivation ? '<p class="small mt-s"><b>Motivazione:</b> ' + U.esc(g.motivation) + '</p>' : '') +
        (g.sourceRef ? '<p class="small muted mt-s"><b>Fonte:</b> ' + U.esc(g.sourceRef) + '</p>' : '') + (g.notes ? '<p class="small muted mt-s"><b>Note:</b> ' + U.esc(g.notes) + '</p>' : '') +
        '<div class="row between mt"><span class="tiny muted">Aggiornata ' + U.fmtDateTime(g.updatedAt) + '</span>' + H.editDel('guidelines', g.id, H.qBtn('Sulla linea guida "' + g.title + '": ', 'Linee guida', 'guidelines', g.id)) + '</div></article>';
    }).join('') + '</div>';
    return h;
  },
  mount(root, params) { if (params.id) { const el = document.getElementById('item-' + params.id); if (el) { el.scrollIntoView({ block: 'center' }); el.style.outline = '2px solid var(--accent)'; } } }
};
Actions['gl-filter'] = (d, el) => { App.ui.glFilter = el.value; App.refresh(); };
Actions['gl-status'] = (d, el) => { Model.update('guidelines', d.id, { status: el.value }, { reason: 'Cambio stato' }); App.refresh(); };
Actions['phases-from-guidelines'] = () => {
  const P = Store.P;
  const free = P.guidelines.filter(g => !g.phaseId || !Model.get('phases', g.phaseId));
  const body = '<p class="small muted mb">Scegli come trasformare le linee guida in fasi operative. Tutto resta modificabile.</p>' +
    '<label class="check-line"><input type="radio" name="pm" value="each" checked><span><b>Una fase per ogni linea guida selezionata</b></span></label>' +
    '<label class="check-line mt-s"><input type="radio" name="pm" value="std"><span><b>Fasi standard</b> (Raccolta dati, Analisi, Calcoli, Sviluppo, Grafici, Interpretazione, Relazione) — poi colleghi le linee guida</span></label>' +
    '<label class="check-line mt"><input type="checkbox" data-stdchk checked><span>Aggiungi la checklist standard a ogni nuova fase</span></label>' +
    '<div class="mt"><h4>Linee guida senza fase (' + free.length + ')</h4><div class="stack s mt-s" style="max-height:300px;overflow:auto">' + (free.length ? free.map(g => '<label class="check-line"><input type="checkbox" data-gl="' + g.id + '" checked><span>' + U.esc(g.title) + ' ' + UI.badge(g.priority) + '</span></label>').join('') : '<p class="small muted">Tutte le linee guida hanno già una fase.</p>') + '</div></div>';
  const m = UI.modal({ title: 'Crea fasi dalle linee guida', body, footer: '<button class="btn" data-x>Annulla</button><button class="btn primary" data-ok>Crea fasi</button>' });
  m.el.querySelector('[data-x]').onclick = () => m.close();
  m.el.querySelector('[data-ok]').onclick = () => {
    const mode = m.el.querySelector('input[name=pm]:checked').value;
    const std = m.el.querySelector('[data-stdchk]').checked;
    let order = P.phases.length;
    const mk = (title, desc) => { const ph = Factory.phase(order++, title); ph.description = desc || ''; if (std) ph.checklist = C.DEFAULT_CHECKLIST.map(t => Factory.checkItem(t)); P.phases.push(ph); return ph; };
    let n = 0;
    if (mode === 'each') UI.$$('[data-gl]', m.el).filter(c => c.checked).forEach(c => { const g = Model.get('guidelines', c.dataset.gl); const ph = mk(g.title, g.description); g.phaseId = ph.id; n++; });
    else ['Raccolta dati', 'Analisi', 'Calcoli', 'Sviluppo', 'Grafici', 'Interpretazione', 'Relazione'].forEach(t => { mk(t); n++; });
    History.log('Create ' + n + ' fasi dalle linee guida', 'phases');
    Store.touch(); m.close(); App.go('dev');
  };
};

/* =====================================================================
   SVILUPPO PROGETTO — fasi, attività, checklist, blocchi
   ===================================================================== */
Views.dev = {
  title: 'Fasi del lavoro', icon: '⚙',
  render(params) {
    const P = Store.P;
    const phases = Model.phasesSorted();
    let cur = phases.find(p => p.id === params.id) || phases.find(p => p.id === App.ui.devPhase) || phases[0];
    if (cur) App.ui.devPhase = cur.id;
    let h = H.head('Fasi del lavoro', 'Scegliete una fase a sinistra, spuntate le cose fatte e caricate i file del lavoro: finiscono da soli nella relazione.',
      '<button class="btn primary adv" data-action="phase-new">Nuova fase</button>');
    if (!phases.length) return h + UI.empty('Nessuna fase', 'Crea le fasi a mano oppure dalle linee guida.', '<div class="btn-group" style="justify-content:center"><button class="btn primary" data-action="phase-new">Nuova fase</button><button class="btn" data-action="go" data-route="guidelines">Vai alle linee guida</button></div>');
    h += '<div class="dev-layout"><nav class="phase-list" aria-label="Fasi">' + phases.map((ph, i) => {
      const pr = Metrics.phaseProgress(ph);
      return '<button class="phase-tab' + (ph.id === cur.id ? ' active' : '') + '" data-action="go" data-route="dev" data-id="' + ph.id + '"' + (ph.id === cur.id ? ' aria-current="true"' : '') + '><span class="pn">' + (i + 1) + '</span><span class="grow"><span style="display:block;font-weight:600;font-size:13px">' + U.esc(U.truncate(ph.title, 40)) + '</span>' +
        '<span class="row nw mt-s">' + UI.progress(pr.pct) + '<span class="tiny" style="min-width:32px;text-align:right">' + pr.pct + '%</span></span></span></button>';
    }).join('') + '</nav><div class="stack">' + this.phaseHTML(cur, phases) + '</div></div>';
    return h;
  },
  phaseHTML(ph, phases) {
    const pr = Metrics.phaseProgress(ph);
    const gls = Model.list('guidelines').filter(g => g.phaseId === ph.id);
    const tasks = Model.list('tasks').filter(t => t.phaseId === ph.id);
    const idx = phases.indexOf(ph);
    let h = '<section class="card"><div class="row between top"><div class="grow"><label class="sr-only" for="ph-title">Titolo fase</label><div class="row nw"><span class="badge accent">Fase ' + (idx + 1) + '</span><input id="ph-title" class="inline-input" style="font-size:18px;font-weight:700" data-bind="phase" data-id="' + ph.id + '" data-field="title" value="' + U.attr(ph.title) + '"></div></div>' +
      '<div class="btn-group adv"><button class="btn xs" data-action="phase-move" data-id="' + ph.id + '" data-dir="-1"' + (idx === 0 ? ' disabled' : '') + ' aria-label="Sposta su">↑</button><button class="btn xs" data-action="phase-move" data-id="' + ph.id + '" data-dir="1"' + (idx === phases.length - 1 ? ' disabled' : '') + ' aria-label="Sposta giù">↓</button>' +
      H.qBtn('Sulla fase "' + ph.title + '": ', 'Fase ' + (idx + 1)) + '<button class="btn xs danger" data-action="phase-delete" data-id="' + ph.id + '">Elimina fase</button></div></div>' +
      (ph.description ? '<p class="simple-only mt-s">' + U.esc(ph.description) + '</p>' : '') +
      '<div class="simple-only mt-s row nw">' + UI.progress(pr.pct, 'lg') + '<b>' + pr.pct + '% fatto</b>' + (ph.end ? '<span class="small muted">&nbsp;· entro il ' + U.fmtDate(ph.end) + '</span>' : '') + '</div>' +
      '<div class="grid g3 mt adv"><div class="field"><label for="ph-start">Inizio</label><input type="date" id="ph-start" data-bind="phase" data-id="' + ph.id + '" data-field="start" value="' + U.attr(ph.start) + '"></div><div class="field"><label for="ph-end">Fine prevista</label><input type="date" id="ph-end" data-bind="phase" data-id="' + ph.id + '" data-field="end" value="' + U.attr(ph.end) + '"></div>' +
      '<div class="kpi"><span class="lbl">Avanzamento</span><div class="row nw">' + UI.progress(pr.pct, 'lg') + '<b>' + pr.pct + '%</b></div><span class="tiny muted">' + pr.done + '/' + pr.total + ' · base: ' + pr.basis + '</span></div></div>' +
      '<div class="field mt adv"><label for="ph-desc">Descrizione / obiettivo della fase</label><textarea id="ph-desc" rows="2" data-bind="phase" data-id="' + ph.id + '" data-field="description">' + U.esc(ph.description) + '</textarea></div>' +
      '<div class="mt small adv"><b>Linee guida collegate:</b> ' + (gls.length ? gls.map(g => '<button class="btn xs ghost" data-action="go" data-route="guidelines" data-id="' + g.id + '">' + U.esc(g.title) + ' ' + UI.badge(g.status) + '</button>').join(' ') : '<span class="muted">nessuna (collegale dalla scheda della linea guida)</span>') + '</div></section>';
    // carica documenti della fase → contenuti → relazione
    const imps = U.arr(ph.imports);
    h += '<section class="card upload-card mt"><div class="row between top"><div class="grow"><h3 style="margin:0">Carica il lavoro di questa fase</h3><p class="small muted mt-s">PDF o Word (.docx): titoli, paragrafi, tabelle e figure con didascalia diventano contenuti qui sotto e vanno da soli nella sezione giusta della relazione (in base ai titoli del documento). Puoi anche trascinare i file su questa pagina.</p></div>' +
      '<button class="btn primary" data-action="upload" data-kind="phase" data-ph="' + ph.id + '" data-accept=".pdf,.docx,.pptx,.txt,.md">⇪ Carica PDF / Word</button></div>' +
      (imps.length ? '<div class="stack s mt">' + imps.map(x => { const n = ph.blocks.filter(b => b.importId === x.id).length; return '<div class="row between small"><span>📄 <b>' + U.esc(x.file) + '</b> <span class="muted">· ' + U.fmtDate(x.at.slice(0, 10)) + ' · ' + U.plural(n, 'contenuto', 'contenuti') + '</span></span><span class="btn-group">' + (x.fileId ? '<button class="btn xs ghost" data-action="file-open" data-id="' + x.fileId + '">Apri</button>' : '') + '<button class="btn xs ghost" data-action="phase-import-remove" data-ph="' + ph.id + '" data-id="' + x.id + '">Rimuovi contenuti</button></span></div>'; }).join('') + '</div>' : '') + '</section>';
    // attività + checklist
    h += '<div class="grid g2 ph-grid">';
    h += H.card('Attività della fase', (tasks.length ? '<div class="stack s">' + tasks.map(t => '<div class="cl-item' + (t.status === 'COMPLETATA' ? ' done' : '') + '"><input type="checkbox" data-change="task-toggle" data-id="' + t.id + '"' + (t.status === 'COMPLETATA' ? ' checked' : '') + ' aria-label="Completata"><span class="cl-text">' + U.esc(t.title) + ' ' + (t.due ? UI.daysBadge(t.due) : '') + (t.status === 'IN CORSO' ? ' ' + UI.badge('in corso', 'info') : '') + '</span>' + H.editDel('tasks', t.id) + '</div>').join('') + '</div>' : '<p class="small muted">Nessuna attività</p>'),
      '<button class="btn xs" data-action="new" data-coll="tasks" data-preset="' + U.attr(JSON.stringify({ phaseId: ph.id })) + '">＋ Attività</button>', 'adv');
    h += H.card('Cose da fare in questa fase', (ph.checklist.length ? '<div class="stack s">' + ph.checklist.map((c, i) => '<div class="cl-item' + (c.done ? ' done' : '') + '"><input type="checkbox" data-change="check-toggle" data-ph="' + ph.id + '" data-id="' + c.id + '"' + (c.done ? ' checked' : '') + ' aria-label="Fatto"><span class="cl-text">' + U.esc(c.text) + '</span><span class="btn-group adv"><button class="btn xs ghost" data-action="check-move" data-ph="' + ph.id + '" data-id="' + c.id + '" data-dir="-1" aria-label="Su"' + (i === 0 ? ' disabled' : '') + '>↑</button><button class="btn xs ghost" data-action="check-edit" data-ph="' + ph.id + '" data-id="' + c.id + '">✎</button><button class="btn xs ghost" data-action="check-del" data-ph="' + ph.id + '" data-id="' + c.id + '" aria-label="Elimina">×</button></span></div>').join('') + '</div>' : '<p class="small muted">Nessun punto</p>') +
      '<form class="row nw mt" data-form="check-add" data-ph="' + ph.id + '"><label class="sr-only" for="chk-new">Nuovo punto</label><input id="chk-new" type="text" placeholder="Nuovo punto della checklist…"><button class="btn sm" type="submit">Aggiungi</button></form>',
      ph.checklist.length ? '' : '<button class="btn xs" data-action="check-std" data-ph="' + ph.id + '">Checklist standard</button>');
    h += '</div>';
    // blocchi
    h += '<div class="row between mt"><h2>Contenuti della fase</h2><span class="small muted">' + U.plural(ph.blocks.length, 'blocco', 'blocchi') + '</span></div>';
    h += ph.blocks.length ? '<div class="stack">' + ph.blocks.map((b, i) => Blocks.html(ph, b, i, ph.blocks.length)).join('') + '</div>' : UI.empty('Nessun contenuto', 'Caricate un PDF o Word qui sopra, oppure aggiungete un testo, una tabella o un\'immagine con i pulsanti qui sotto.');
    h += '<div class="card mt"><div class="row"><span class="lbl">Aggiungi a mano:</span>' + Object.entries(C.BLOCK_TYPES).map(([k, l]) => '<button class="btn sm' + (['text', 'table', 'image'].includes(k) ? '' : ' adv') + '" data-action="block-add" data-ph="' + ph.id + '" data-type="' + k + '">＋ ' + l + '</button>').join('') + '</div></div>';
    return h;
  },
  mount(root, params) {
    if (params.extra) { const el = document.getElementById('blk-' + params.extra); if (el) { el.scrollIntoView({ block: 'center' }); el.style.outline = '2px solid var(--accent)'; } }
    const fm = root.querySelector('[data-form="check-add"]');
    if (fm) fm.addEventListener('submit', e => {
      e.preventDefault();
      const inp = fm.querySelector('input');
      const t = inp.value.trim();
      if (!t) return;
      const ph = Model.get('phases', fm.dataset.ph);
      ph.checklist.push(Factory.checkItem(t));
      History.log('Checklist "' + ph.title + '": aggiunto "' + t + '"', 'phases');
      Store.touch(); App.refresh();
      setTimeout(() => { const n = UI.$('#chk-new'); if (n) n.focus(); }, 30);
    });
  }
};
Binders.phase = (el, phase) => {
  const ph = Model.get('phases', el.dataset.id);
  if (!ph) return;
  const f = el.dataset.field;
  if (phase === 'input') { ph[f] = el.value; Store.touch(); }
  if (phase === 'change') {
    if (f === 'title') { const t = UI.$$('.phase-tab.active .grow span')[0]; if (t) t.textContent = U.truncate(el.value, 40); }
    if (el._orig !== undefined && el._orig !== el.value) History.version({ type: 'phases', id: ph.id, label: 'Fase: ' + ph.title, field: f, before: el._orig, after: el.value, origin: 'UTENTE' });
  }
};
Actions['phase-new'] = () => UI.form({ title: 'Nuova fase', fields: [{ key: 'title', label: 'Titolo', required: true, full: true }, { key: 'description', label: 'Descrizione', type: 'textarea', rows: 2 }, { key: 'start', label: 'Inizio', type: 'date' }, { key: 'end', label: 'Fine prevista', type: 'date' }, { key: 'std', label: 'Aggiungi checklist standard', type: 'checkbox' }],
  value: { std: true }, onSubmit(v) {
    const P = Store.P;
    const ph = Factory.phase(P.phases.length, v.title);
    Object.assign(ph, { description: v.description, start: v.start, end: v.end });
    if (v.std) ph.checklist = C.DEFAULT_CHECKLIST.map(t => Factory.checkItem(t));
    Model.add('phases', ph, 'Fase creata: ' + ph.title);
    App.go('dev', ph.id);
  } });
Actions['phase-move'] = d => {
  const phases = Model.phasesSorted();
  const i = phases.findIndex(p => p.id === d.id), j = i + Number(d.dir);
  if (i < 0 || j < 0 || j >= phases.length) return;
  [phases[i], phases[j]] = [phases[j], phases[i]];
  phases.forEach((p, k) => { p.order = k; });
  History.log('Riordinate le fasi', 'phases');
  Store.touch(); App.refresh();
};
Actions['phase-delete'] = async d => {
  const ph = Model.get('phases', d.id);
  if (!ph) return;
  if (!(await UI.confirm('Eliminare la fase "' + ph.title + '" con ' + U.plural(ph.blocks.length, 'blocco', 'blocchi') + ' e ' + U.plural(ph.checklist.length, 'punto', 'punti') + ' di checklist?', { okLabel: 'Elimina fase', danger: true }))) return;
  const snap = Model.remove('phases', d.id);
  Model.phasesSorted().forEach((p, k) => { p.order = k; });
  App.ui.devPhase = null;
  App.go('dev');
  UI.toast('Fase eliminata', 'info', { actionLabel: 'Annulla', onAction: () => { Model.restore(snap); Model.phasesSorted().forEach((p, k) => { p.order = k; }); App.go('dev', snap.obj.id); } });
};
const chk = d => { const ph = Model.get('phases', d.ph); return ph ? { ph, i: ph.checklist.findIndex(c => c.id === d.id) } : { ph: null, i: -1 }; };
Actions['check-toggle'] = (d, el) => {
  const { ph, i } = chk(d);
  if (!ph || i < 0) return;
  const c = ph.checklist[i];
  c.done = el.checked; c.doneAt = el.checked ? U.nowISO() : null;
  History.log((c.done ? '✓ ' : '↺ ') + ph.title + ': ' + c.text, 'checklist');
  Store.touch(); App.refresh();
};
Actions['check-move'] = d => { const { ph, i } = chk(d); if (!ph || i <= 0) return; [ph.checklist[i - 1], ph.checklist[i]] = [ph.checklist[i], ph.checklist[i - 1]]; Store.touch(); App.refresh(); };
Actions['check-edit'] = d => {
  const { ph, i } = chk(d);
  if (!ph || i < 0) return;
  UI.form({ title: 'Modifica punto checklist', fields: [{ key: 'text', label: 'Testo', required: true, full: true }], value: ph.checklist[i], onSubmit(v) { ph.checklist[i].text = v.text; Store.touch(); App.refresh(); } });
};
Actions['check-del'] = d => {
  const { ph, i } = chk(d);
  if (!ph || i < 0) return;
  const [c] = ph.checklist.splice(i, 1);
  Store.touch(); App.refresh();
  UI.toast('Punto eliminato', 'info', { actionLabel: 'Annulla', onAction: () => { ph.checklist.splice(i, 0, c); Store.touch(); App.refresh(); } });
};
Actions['check-std'] = d => { const ph = Model.get('phases', d.ph); if (!ph) return; ph.checklist = ph.checklist.concat(C.DEFAULT_CHECKLIST.map(t => Factory.checkItem(t))); Store.touch(); App.refresh(); };

/* ---------- BLOCCHI ---------- */
const Blocks = {
  html(ph, b, i, n) {
    const num = Model.numbering().map[b.id];
    const used = Model.usedBy(b.id);
    let h = '<article class="block" id="blk-' + b.id + '"><div class="block-head"><span class="btype">' + U.esc(num || C.BLOCK_TYPES[b.type]) + '</span>' +
      '<label class="sr-only" for="bt-' + b.id + '">Titolo blocco</label><input id="bt-' + b.id + '" class="btitle inline-input" placeholder="Titolo…" data-bind="block" data-id="' + b.id + '" data-field="title" value="' + U.attr(b.title) + '">' +
      '<span class="adv">' + UI.select('data-change="block-status" data-id="' + b.id + '" aria-label="Stato del blocco" style="width:auto"', C.BLOCK_STATUS, b.status) + '</span>' +
      LiveReport.blockSelect(ph, b) +
      '<div class="btn-group"><span class="adv"><button class="btn xs ghost" data-action="block-move" data-id="' + b.id + '" data-dir="-1"' + (i === 0 ? ' disabled' : '') + ' aria-label="Sposta su">↑</button><button class="btn xs ghost" data-action="block-move" data-id="' + b.id + '" data-dir="1"' + (i === n - 1 ? ' disabled' : '') + ' aria-label="Sposta giù">↓</button>' +
      H.qBtn('Su ' + (num || C.BLOCK_TYPES[b.type]) + (b.title ? ' "' + b.title + '"' : '') + ' (fase ' + ph.title + '): ', ph.title, 'block', b.id) + '</span><button class="btn xs danger" data-action="block-delete" data-id="' + b.id + '" aria-label="Elimina blocco">×</button></div></div><div class="block-body">';
    h += (this[b.type] || this.text).call(this, b);
    h += '</div><div class="block-foot adv">' + (b.fromFile ? '<span class="badge info" title="Contenuto letto dal file caricato">📄 ' + U.esc(U.truncate(b.fromFile, 40)) + '</span> ' : '') + '<b>Deriva da:</b> ' + (b.refs.length ? H.refChips(b) : '<span class="muted">—</span>') + ' <button class="btn xs" data-action="ref-add" data-id="' + b.id + '">＋ Collega fonte interna</button>' +
      '<label class="sr-only" for="bs-' + b.id + '">Fonte esterna</label><input id="bs-' + b.id + '" class="inline-input small" style="max-width:260px" placeholder="Fonte esterna (es. bibliografia, dataset)…" data-bind="block" data-id="' + b.id + '" data-field="source" value="' + U.attr(b.source) + '">' +
      (used.length ? '<span class="muted">· Usato da: ' + used.map(u => U.esc(Model.blockLabel(u.block))).join(', ') + '</span>' : '') + '</div></article>';
    return h;
  },
  ta(b, field, rows, ph) { return '<label class="sr-only" for="' + field + '-' + b.id + '">' + field + '</label><textarea id="' + field + '-' + b.id + '" rows="' + rows + '" data-bind="block" data-id="' + b.id + '" data-field="' + field + '" placeholder="' + U.attr(ph || '') + '">' + U.esc(b[field]) + '</textarea>'; },
  text(b) { return this.ta(b, 'content', 6, 'Scrivi qui… (supporta **grassetto**, elenchi con -, formule tra $…$)') + this.preview(b); },
  observation(b) { return this.ta(b, 'content', 4, 'Osservazione…') + '<p class="tiny muted mt-s">Collega con "Deriva da" i dati che la supportano.</p>'; },
  interpretation(b) { return this.ta(b, 'content', 5, 'Interpretazione dei risultati…') + '<p class="tiny muted mt-s">Un\'interpretazione senza collegamenti a risultati viene segnalata come "conclusione non supportata".</p>' + this.preview(b); },
  note(b) { return this.ta(b, 'content', 3, 'Nota di lavoro (non va in relazione se non la includi)…'); },
  preview(b) { return /\$|\*\*|^\s*[-#|]/m.test(b.content) ? '<details class="exp mt-s"><summary class="small">Anteprima formattata</summary><div class="exp-body md" data-preview-block="' + b.id + '">' + U.md(b.content) + '</div></details>' : ''; },
  formula(b) {
    return '<div class="grid g2"><div class="field"><label for="lx-' + b.id + '">Formula LaTeX</label><textarea id="lx-' + b.id + '" class="mono" rows="3" data-bind="block" data-id="' + b.id + '" data-field="latex" placeholder="es. CT = \\sum_{i=1}^{n} t_i">' + U.esc(b.latex) + '</textarea></div>' +
      '<div class="field"><span class="lbl">Anteprima</span><div class="formula-preview"><div class="math" data-display="1" data-tex="' + U.attr(b.latex) + '" data-formula-preview="' + b.id + '">' + U.esc(b.latex) + '</div></div></div></div>' +
      '<div class="field mt"><label for="content-' + b.id + '">Significato dei simboli / note</label>' + this.ta(b, 'content', 2, 'es. CT = tempo di ciclo [min]; t_i = durata attività i [min]') + '</div>';
  },
  calc(b) {
    const vars = U.arr(b.variables);
    const st = Blocks.calcState(b);
    return '<div class="grid g2"><div><span class="lbl">Variabili</span><div class="table-wrap mt-s"><table class="tbl var-table"><tr><th>Nome</th><th>Valore</th><th>Unità</th><th></th></tr>' +
      (vars.length ? vars.map((v, i) => '<tr><td><input aria-label="Nome variabile" data-bind="calc-var" data-id="' + b.id + '" data-i="' + i + '" data-field="name" value="' + U.attr(v.name) + '"></td><td><input aria-label="Valore" data-bind="calc-var" data-id="' + b.id + '" data-i="' + i + '" data-field="value" value="' + U.attr(v.value) + '"></td><td><input aria-label="Unità" data-bind="calc-var" data-id="' + b.id + '" data-i="' + i + '" data-field="unit" value="' + U.attr(v.unit) + '" style="width:80px"></td><td><button class="btn xs ghost" data-action="calc-var-del" data-id="' + b.id + '" data-i="' + i + '" aria-label="Elimina variabile">×</button></td></tr>').join('') : '<tr><td colspan="4" class="muted small">Nessuna variabile</td></tr>') +
      '</table></div><div class="btn-group mt-s"><button class="btn xs" data-action="calc-var-add" data-id="' + b.id + '">＋ Variabile</button><button class="btn xs" data-action="calc-var-detect" data-id="' + b.id + '">Rileva dall\'espressione</button></div></div>' +
      '<div class="stack s"><div class="field"><label for="ex-' + b.id + '">Espressione</label><input id="ex-' + b.id + '" class="mono" data-bind="block" data-id="' + b.id + '" data-field="expression" value="' + U.attr(b.expression) + '" placeholder="es. (t1 + t2 + t3) / n   ·   operatori + - * / ^   ·   sqrt, ln, log, exp, min, max, sum, avg"></div>' +
      '<div class="grid g3"><div class="field"><label for="rn-' + b.id + '">Nome risultato</label><input id="rn-' + b.id + '" data-bind="block" data-id="' + b.id + '" data-field="resultName" value="' + U.attr(b.resultName) + '" placeholder="es. Lead time medio"></div>' +
      '<div class="field"><label for="sr-' + b.id + '">Risultato dichiarato</label><input id="sr-' + b.id + '" data-bind="block" data-id="' + b.id + '" data-field="statedResult" value="' + U.attr(b.statedResult) + '" placeholder="valore scritto"></div>' +
      '<div class="field"><label for="un-' + b.id + '">Unità</label><input id="un-' + b.id + '" data-bind="block" data-id="' + b.id + '" data-field="unit" value="' + U.attr(b.unit) + '"></div></div>' +
      '<div class="row nw"><button class="btn sm primary" data-action="calc-run" data-id="' + b.id + '">Calcola e verifica</button><div class="calc-out grow' + (st.err ? ' err' : '') + '" id="calc-out-' + b.id + '">' + st.html + '</div></div></div></div>' +
      '<div class="field mt"><label for="content-' + b.id + '">Note sul calcolo</label>' + this.ta(b, 'content', 2, 'Ipotesi, fonti dei dati, arrotondamenti…') + '</div>';
  },
  calcState(b) {
    if (!U.str(b.expression).trim()) return { html: 'Inserisci un\'espressione', err: false };
    const vars = {};
    U.arr(b.variables).forEach(v => { if (v.name) vars[v.name] = U.str(v.value).trim() === '' ? '' : U.parseNum(v.value); });
    try {
      const r = U.evaluate(b.expression, vars);
      const stated = U.str(b.statedResult).trim();
      let cmp = '';
      if (stated) cmp = isFinite(U.parseNum(stated)) && U.numClose(r.value, U.parseNum(stated)) ? ' <span class="badge ok">coincide con il dichiarato</span>' : ' <span class="badge risk">diverso dal dichiarato (' + U.esc(stated) + ')</span>';
      const saved = b.computed !== null && b.computed !== '' && U.numClose(Number(b.computed), r.value);
      return { html: '= <b>' + U.esc(U.fmtNum(r.value)) + '</b> ' + U.esc(b.unit) + cmp + (saved ? '' : ' <span class="badge warn">non registrato: premi "Calcola"</span>'), err: false };
    } catch (e) { return { html: '⚠ ' + U.esc(e.message), err: true }; }
  },
  result(b) {
    return '<div class="grid g3"><div class="field"><label for="nm-' + b.id + '">Nome</label><input id="nm-' + b.id + '" data-bind="block" data-id="' + b.id + '" data-field="name" value="' + U.attr(b.name) + '" placeholder="es. Lead time medio"></div>' +
      '<div class="field"><label for="vl-' + b.id + '">Valore</label><input id="vl-' + b.id + '" data-bind="block" data-id="' + b.id + '" data-field="value" value="' + U.attr(b.value) + '"></div>' +
      '<div class="field"><label for="un-' + b.id + '">Unità</label><input id="un-' + b.id + '" data-bind="block" data-id="' + b.id + '" data-field="unit" value="' + U.attr(b.unit) + '" placeholder="es. min, €, %, -"></div></div>' +
      '<div class="field mt"><label for="content-' + b.id + '">Descrizione</label>' + this.ta(b, 'content', 2, 'Cosa rappresenta, come è stato ottenuto') + '</div>';
  },
  table(b) {
    const cols = U.arr(b.columns), rows = U.arr(b.rows);
    return '<div class="grid-editor"><table><thead><tr><th class="ctl"></th>' + cols.map((c, ci) => '<th><div class="row nw"><input aria-label="Intestazione colonna ' + (ci + 1) + '" data-bind="table-col" data-id="' + b.id + '" data-c="' + ci + '" value="' + U.attr(c) + '"><button class="btn xs ghost" data-action="table-col-del" data-id="' + b.id + '" data-c="' + ci + '" aria-label="Elimina colonna" title="Elimina colonna">×</button></div></th>').join('') + '</tr></thead><tbody>' +
      rows.map((r, ri) => '<tr><td class="ctl"><button class="btn xs ghost" data-action="table-row-del" data-id="' + b.id + '" data-r="' + ri + '" aria-label="Elimina riga ' + (ri + 1) + '" title="Elimina riga">×</button></td>' + cols.map((c, ci) => '<td><input aria-label="Riga ' + (ri + 1) + ' colonna ' + (ci + 1) + '" data-bind="table-cell" data-id="' + b.id + '" data-r="' + ri + '" data-c="' + ci + '" value="' + U.attr(U.arr(r)[ci]) + '"></td>').join('') + '</tr>').join('') + '</tbody></table></div>' +
      '<div class="btn-group mt-s"><button class="btn xs" data-action="table-row-add" data-id="' + b.id + '">＋ Riga</button><button class="btn xs" data-action="table-col-add" data-id="' + b.id + '">＋ Colonna</button><button class="btn xs" data-action="table-paste" data-id="' + b.id + '">Incolla da Excel/CSV</button><button class="btn xs" data-action="table-csv" data-id="' + b.id + '">Esporta CSV</button></div>' +
      '<div class="field mt"><label for="notes-' + b.id + '">Note / fonte dei dati</label><textarea id="notes-' + b.id + '" rows="2" data-bind="block" data-id="' + b.id + '" data-field="notes">' + U.esc(b.notes) + '</textarea></div>';
  },
  chart(b) {
    return '<div class="grid g2"><div class="stack s"><div class="grid g2"><div class="field"><label for="ct-' + b.id + '">Tipo</label>' + UI.select('id="ct-' + b.id + '" data-bind="block" data-id="' + b.id + '" data-field="chartType"', [['bar', 'Barre'], ['line', 'Linee'], ['scatter', 'Punti'], ['pie', 'Torta']], b.chartType) + '</div>' +
      '<div class="field"><label>&nbsp;</label><button class="btn sm" data-action="chart-from-table" data-id="' + b.id + '">Usa i dati di una tabella</button></div></div>' +
      '<div class="field"><label for="lb-' + b.id + '">Etichette asse X (separate da ;)</label><textarea id="lb-' + b.id + '" rows="2" data-bind="block" data-id="' + b.id + '" data-field="labels" placeholder="Gen; Feb; Mar">' + U.esc(b.labels) + '</textarea></div>' +
      U.arr(b.series).map((s, i) => '<div class="grid g2"><div class="field"><label for="sn-' + b.id + i + '">Serie ' + (i + 1) + ': nome</label><input id="sn-' + b.id + i + '" data-bind="chart-series" data-id="' + b.id + '" data-i="' + i + '" data-field="name" value="' + U.attr(s.name) + '"></div><div class="field"><label for="sd-' + b.id + i + '">Valori (separati da ;)</label><div class="row nw"><input id="sd-' + b.id + i + '" data-bind="chart-series" data-id="' + b.id + '" data-i="' + i + '" data-field="data" value="' + U.attr(s.data) + '"><button class="btn xs ghost" data-action="chart-series-del" data-id="' + b.id + '" data-i="' + i + '" aria-label="Elimina serie">×</button></div></div></div>').join('') +
      '<button class="btn xs" data-action="chart-series-add" data-id="' + b.id + '">＋ Serie</button>' +
      '<div class="grid g2"><div class="field"><label for="xl-' + b.id + '">Etichetta asse X</label><input id="xl-' + b.id + '" data-bind="block" data-id="' + b.id + '" data-field="xLabel" value="' + U.attr(b.xLabel) + '"></div><div class="field"><label for="xu-' + b.id + '">Unità X</label><input id="xu-' + b.id + '" data-bind="block" data-id="' + b.id + '" data-field="xUnit" value="' + U.attr(b.xUnit) + '"></div>' +
      '<div class="field"><label for="yl-' + b.id + '">Etichetta asse Y</label><input id="yl-' + b.id + '" data-bind="block" data-id="' + b.id + '" data-field="yLabel" value="' + U.attr(b.yLabel) + '"></div><div class="field"><label for="yu-' + b.id + '">Unità Y</label><input id="yu-' + b.id + '" data-bind="block" data-id="' + b.id + '" data-field="yUnit" value="' + U.attr(b.yUnit) + '"></div></div></div>' +
      '<div><div class="chart-box" data-chart="' + b.id + '"></div><div class="field mt"><label for="content-' + b.id + '">Commento</label>' + this.ta(b, 'content', 2, 'Cosa mostra il grafico') + '</div></div></div>';
  },
  image(b) {
    return '<div class="grid g2"><div>' + (b.fileId ? '<img data-file="' + b.fileId + '" alt="' + U.attr(b.caption || b.title || 'Immagine') + '" style="border:1px solid var(--line);border-radius:6px;max-height:420px;object-fit:contain">' : UI.empty('Nessuna immagine', 'Carica un\'immagine (PNG, JPG, SVG…).')) +
      '<div class="btn-group mt-s"><button class="btn xs" data-action="image-upload" data-id="' + b.id + '">' + (b.fileId ? 'Sostituisci immagine' : 'Carica immagine') + '</button>' + (b.fileId ? '<button class="btn xs" data-action="file-open" data-id="' + b.fileId + '">Apri</button>' : '') + '</div></div>' +
      '<div class="stack s"><div class="field"><label for="cap-' + b.id + '">Didascalia</label><input id="cap-' + b.id + '" data-bind="block" data-id="' + b.id + '" data-field="caption" value="' + U.attr(b.caption) + '"></div><div class="field"><label for="content-' + b.id + '">Descrizione</label>' + this.ta(b, 'content', 3, 'Cosa mostra la figura') + '</div></div></div>';
  },
  attachment(b) {
    return '<div class="row">' + UI.Files.chips(b.fileIds, true, 'block:' + b.id) + '<button class="btn xs" data-action="file-attach" data-owner="block:' + b.id + '" data-category="Elaborato">＋ Allega file</button></div><div class="field mt"><label for="content-' + b.id + '">Descrizione</label>' + this.ta(b, 'content', 2, 'Cosa contengono gli allegati') + '</div>';
  }
};
const blk = id => { const f = Model.findBlock(id); return f ? f.block : null; };
const TRACK_FIELDS = ['content', 'latex', 'expression', 'statedResult', 'value', 'name', 'unit', 'resultName'];
Binders.block = (el, phase) => {
  const f = Model.findBlock(el.dataset.id);
  if (!f) return;
  const b = f.block, field = el.dataset.field;
  if (phase === 'input' || (phase === 'change' && el.tagName === 'SELECT')) {
    b[field] = el.value; b.updatedAt = U.nowISO(); Store.touch();
    if (field === 'latex') { const pv = UI.$('[data-formula-preview="' + b.id + '"]'); if (pv) { pv.setAttribute('data-tex', el.value); pv.textContent = el.value; UI.renderMath(pv.parentNode); } }
    if (b.type === 'chart') { Blocks._redraw = Blocks._redraw || U.debounce(id => { const box = UI.$('[data-chart="' + id + '"]'); const x = blk(id); if (box && x) UI.drawChart(box, x); }, 400); Blocks._redraw(b.id); }
    if (b.type === 'calc' && ['expression', 'statedResult', 'unit'].includes(field)) { const o = UI.$('#calc-out-' + b.id); if (o) { const s = Blocks.calcState(b); o.innerHTML = s.html; o.classList.toggle('err', s.err); } }
    if (field === 'content') { const pv = UI.$('[data-preview-block="' + b.id + '"]'); if (pv) { pv.innerHTML = U.md(el.value); UI.renderMath(pv); } }
  }
  if (phase === 'change' && el._orig !== undefined && el._orig !== el.value) {
    if (TRACK_FIELDS.includes(field)) History.version({ type: 'block', id: b.id, label: Model.blockLabel(b), field, before: el._orig, after: el.value, origin: 'UTENTE', reason: 'Modifica diretta' });
    History.log('Modificato ' + Model.blockLabel(b) + ' (' + field + ')', 'blocks', { coll: 'block', id: b.id });
    el._orig = el.value;
  }
};
Binders['calc-var'] = (el, phase) => {
  const b = blk(el.dataset.id);
  if (!b || phase === 'focus') return;
  const v = b.variables[+el.dataset.i];
  if (!v) return;
  v[el.dataset.field] = el.value; Store.touch();
  const o = UI.$('#calc-out-' + b.id); if (o) { const s = Blocks.calcState(b); o.innerHTML = s.html; o.classList.toggle('err', s.err); }
};
Binders['table-col'] = (el, phase) => { const b = blk(el.dataset.id); if (!b || phase === 'focus') return; b.columns[+el.dataset.c] = el.value; Store.touch(); };
Binders['table-cell'] = (el, phase) => {
  const b = blk(el.dataset.id);
  if (!b || phase === 'focus') return;
  const r = +el.dataset.r, c = +el.dataset.c;
  while (b.rows[r].length <= c) b.rows[r].push('');
  b.rows[r][c] = el.value; Store.touch();
};
Binders['chart-series'] = (el, phase) => {
  const b = blk(el.dataset.id);
  if (!b || phase === 'focus') return;
  b.series[+el.dataset.i][el.dataset.field] = el.value; Store.touch();
  Blocks._redraw = Blocks._redraw || U.debounce(id => { const box = UI.$('[data-chart="' + id + '"]'); const x = blk(id); if (box && x) UI.drawChart(box, x); }, 400);
  Blocks._redraw(b.id);
};
Actions['block-add'] = d => {
  const ph = Model.get('phases', d.ph);
  if (!ph) return;
  const b = Factory.block(d.type);
  ph.blocks.push(b);
  History.log('Aggiunto blocco ' + C.BLOCK_TYPES[d.type] + ' in "' + ph.title + '"', 'blocks');
  Store.touch(); App.refresh();
  setTimeout(() => { const el = document.getElementById('blk-' + b.id); if (el) { el.scrollIntoView({ block: 'center' }); const f = el.querySelector('textarea,input.btitle'); if (f) f.focus(); } }, 50);
};
Actions['block-move'] = d => {
  const f = Model.findBlock(d.id);
  if (!f) return;
  const a = f.phase.blocks, i = a.indexOf(f.block), j = i + Number(d.dir);
  if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  Store.touch(); App.refresh();
};
Actions['block-delete'] = async d => {
  const f = Model.findBlock(d.id);
  if (!f) return;
  const used = Model.usedBy(d.id);
  if (!(await UI.confirm('Eliminare ' + Model.blockLabel(f.block) + '?' + (used.length ? '\nAttenzione: è citato da ' + used.length + ' altri blocchi.' : ''), { okLabel: 'Elimina', danger: true }))) return;
  const i = f.phase.blocks.indexOf(f.block);
  f.phase.blocks.splice(i, 1);
  History.version({ type: 'block', id: f.block.id, label: Model.blockLabel(f.block) + ' (eliminato)', field: 'blocco', before: f.block, after: '(eliminato)', origin: 'UTENTE', reason: 'Eliminazione' });
  History.log('Eliminato blocco ' + C.BLOCK_TYPES[f.block.type] + ' da "' + f.phase.title + '"', 'blocks');
  Store.touch(); App.refresh();
  UI.toast('Blocco eliminato', 'info', { actionLabel: 'Annulla', onAction: () => { f.phase.blocks.splice(i, 0, f.block); Store.touch(); App.refresh(); } });
};
Actions['block-status'] = (d, el) => { const b = blk(d.id); if (!b) return; const prev = b.status; b.status = el.value; History.version({ type: 'block', id: b.id, label: Model.blockLabel(b), field: 'stato', before: prev, after: b.status, origin: 'UTENTE' }); History.log(Model.blockLabel(b) + ' → ' + b.status, 'blocks'); Store.touch(); App.refresh(); };
Actions['block-inreport'] = (d, el) => { const b = blk(d.id); if (!b) return; b.inReport = el.checked; Store.touch(); };
Actions['ref-add'] = d => {
  const b = blk(d.id);
  if (!b) return;
  const targets = Model.refTargets().filter(t => !(t.type === 'block' && t.id === b.id) && !b.refs.some(r => r.type === t.type && r.id === t.id));
  const groups = {};
  targets.forEach(t => { (groups[t.group] = groups[t.group] || []).push(t); });
  const body = '<p class="small muted mb">Seleziona gli elementi da cui deriva questo contenuto (tracciabilità interna).</p><input type="search" placeholder="Filtra…" data-reffilter style="margin-bottom:10px"><div style="max-height:52vh;overflow:auto" class="stack s">' +
    (targets.length ? Object.entries(groups).map(([g, list]) => '<div data-refgroup><h4 class="mt-s">' + U.esc(g) + '</h4>' + list.map(t => '<label class="check-line mt-s" data-reflabel="' + U.attr(U.norm(t.label)) + '"><input type="checkbox" value="' + t.type + '|' + t.id + '"><span class="small">' + U.esc(t.label) + '</span></label>').join('') + '</div>').join('') : '<p class="muted">Nessun elemento disponibile.</p>') + '</div>';
  const m = UI.modal({ title: 'Collega fonti interne: DERIVA DA', body, footer: '<button class="btn" data-x>Annulla</button><button class="btn primary" data-ok>Collega</button>' });
  m.el.querySelector('[data-reffilter]').addEventListener('input', e => { const q = U.norm(e.target.value); UI.$$('[data-reflabel]', m.el).forEach(l => { l.hidden = q && !l.dataset.reflabel.includes(q); }); });
  m.el.querySelector('[data-x]').onclick = () => m.close();
  m.el.querySelector('[data-ok]').onclick = () => {
    const sel = UI.$$('input[type=checkbox]:checked', m.el).map(c => { const [type, id] = c.value.split('|'); return { type, id }; });
    if (sel.length) { b.refs = b.refs.concat(sel); History.log(Model.blockLabel(b) + ': collegate ' + sel.length + ' fonti interne', 'blocks'); Store.touch(); }
    m.close(); App.refresh();
  };
};
Actions['ref-remove'] = d => { const b = blk(d.id); if (!b) return; b.refs.splice(+d.i, 1); Store.touch(); App.refresh(); };
Actions['calc-var-add'] = d => { const b = blk(d.id); if (!b) return; b.variables.push({ name: '', value: '', unit: '' }); Store.touch(); App.refresh(); };
Actions['calc-var-del'] = d => { const b = blk(d.id); if (!b) return; b.variables.splice(+d.i, 1); Store.touch(); App.refresh(); };
Actions['calc-var-detect'] = d => {
  const b = blk(d.id);
  if (!b) return;
  const ids = [...new Set(U.exprIdentifiers(b.expression))].filter(n => !b.variables.some(v => v.name === n));
  if (!ids.length) return UI.toast('Nessuna nuova variabile trovata nell\'espressione');
  ids.forEach(n => b.variables.push({ name: n, value: '', unit: '' }));
  Store.touch(); App.refresh();
  UI.toast('Aggiunte ' + ids.length + ' variabili: inserisci i valori (l\'app non li inventa)');
};
Actions['calc-run'] = d => {
  const b = blk(d.id);
  if (!b) return;
  const vars = {};
  b.variables.forEach(v => { if (v.name) vars[v.name] = U.str(v.value).trim() === '' ? '' : U.parseNum(v.value); });
  try {
    const r = U.evaluate(b.expression, vars);
    const prev = b.computed;
    b.computed = r.value;
    History.version({ type: 'block', id: b.id, label: Model.blockLabel(b), field: 'risultato calcolato', before: U.fmtNum(prev), after: U.fmtNum(r.value), origin: 'CONTROLLO AUTOMATICO', reason: 'Ricalcolo' });
    History.log('Calcolo eseguito: ' + (b.resultName || b.title || 'calcolo') + ' = ' + U.fmtNum(r.value), 'blocks');
    Store.touch(); App.refresh();
    const st = U.str(b.statedResult).trim();
    if (st && !U.numClose(r.value, U.parseNum(st))) UI.toast('Il risultato dichiarato (' + st + ') è diverso dal ricalcolo (' + U.fmtNum(r.value) + '). Non è stato modificato: decidi tu.', 'err');
    else if (!st) UI.toast('Risultato registrato: ' + U.fmtNum(r.value) + '. Puoi copiarlo nel campo "Risultato dichiarato".');
  } catch (e) { UI.toast('Errore nel calcolo: ' + e.message, 'err'); }
};
Actions['table-row-add'] = d => { const b = blk(d.id); if (!b) return; b.rows.push(b.columns.map(() => '')); Store.touch(); App.refresh(); };
Actions['table-row-del'] = d => { const b = blk(d.id); if (!b) return; b.rows.splice(+d.r, 1); Store.touch(); App.refresh(); };
Actions['table-col-add'] = d => { const b = blk(d.id); if (!b) return; b.columns.push('Colonna ' + (b.columns.length + 1)); b.rows.forEach(r => r.push('')); Store.touch(); App.refresh(); };
Actions['table-col-del'] = async d => {
  const b = blk(d.id);
  if (!b || b.columns.length <= 1) return UI.toast('La tabella deve avere almeno una colonna', 'err');
  const c = +d.c;
  if (b.rows.some(r => U.str(r[c]).trim()) && !(await UI.confirm('La colonna "' + b.columns[c] + '" contiene dati. Eliminarla?', { okLabel: 'Elimina', danger: true }))) return;
  b.columns.splice(c, 1); b.rows.forEach(r => r.splice(c, 1)); Store.touch(); App.refresh();
};
Actions['table-paste'] = d => {
  const b = blk(d.id);
  if (!b) return;
  UI.form({ title: 'Incolla dati in tabella', intro: '<p class="small muted">Incolla celle copiate da Excel/Fogli (separate da tabulazione) oppure CSV (separate da ; o ,). La prima riga diventa l\'intestazione.</p>',
    fields: [{ key: 'text', label: 'Dati', type: 'textarea', rows: 10, mono: true, required: true }, { key: 'header', label: 'La prima riga è l\'intestazione', type: 'checkbox' }], value: { header: true }, submitLabel: 'Sostituisci dati della tabella',
    onSubmit(v) {
      const lines = v.text.replace(/\r/g, '').split('\n').filter(l => l.trim());
      const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
      const grid = lines.map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '')));
      const w = Math.max(...grid.map(r => r.length));
      grid.forEach(r => { while (r.length < w) r.push(''); });
      const before = { columns: b.columns, rows: b.rows };
      if (v.header) { b.columns = grid.shift(); } else b.columns = Array.from({ length: w }, (_, i) => 'Colonna ' + (i + 1));
      b.rows = grid;
      History.version({ type: 'block', id: b.id, label: Model.blockLabel(b), field: 'dati tabella', before, after: { columns: b.columns, rows: b.rows }, origin: 'UTENTE', reason: 'Dati incollati' });
      Store.touch(); App.refresh();
    } });
};
Actions['table-csv'] = d => {
  const b = blk(d.id);
  if (!b) return;
  const q = s => '"' + U.str(s).replace(/"/g, '""') + '"';
  U.download(U.slug(b.title || 'tabella') + '.csv', '﻿' + [b.columns].concat(b.rows).map(r => r.map(q).join(';')).join('\n'), 'text/csv;charset=utf-8');
};
Actions['chart-series-add'] = d => { const b = blk(d.id); if (!b) return; b.series.push({ name: 'Serie ' + (b.series.length + 1), data: '' }); Store.touch(); App.refresh(); };
Actions['chart-series-del'] = d => { const b = blk(d.id); if (!b) return; b.series.splice(+d.i, 1); Store.touch(); App.refresh(); };
Actions['chart-from-table'] = d => {
  const b = blk(d.id);
  if (!b) return;
  const tables = Model.allBlocks().filter(x => x.block.type === 'table');
  if (!tables.length) return UI.toast('Nel progetto non ci sono tabelle', 'err');
  const num = Model.numbering().map;
  UI.form({ title: 'Grafico dai dati di una tabella', intro: '<p class="small muted">La prima colonna diventa l\'asse X, le altre colonne numeriche diventano serie. I dati attuali del grafico verranno sostituiti.</p>',
    fields: [{ key: 'table', label: 'Tabella', type: 'select', options: tables.map(t => [t.block.id, (num[t.block.id] || 'Tabella') + ': ' + (t.block.title || 'senza titolo')]) }], submitLabel: 'Usa questi dati',
    onSubmit(v) {
      const t = blk(v.table);
      b.labels = t.rows.map(r => r[0]).join('; ');
      b.series = t.columns.slice(1).map((c, i) => ({ name: c, data: t.rows.map(r => r[i + 1]).join('; ') })).filter(s => s.data.split(';').some(x => isFinite(U.parseNum(x.trim()))));
      if (!b.series.length) b.series = [{ name: 'Serie 1', data: '' }];
      if (!b.xLabel) b.xLabel = t.columns[0];
      if (!b.refs.some(r => r.id === t.id)) b.refs.push({ type: 'block', id: t.id });
      Store.touch(); App.refresh();
    } });
};
Actions['image-upload'] = async d => {
  const b = blk(d.id);
  if (!b) return;
  const [f] = await UI.pickFiles({ multiple: false, accept: 'image/*' });
  if (!f) return;
  const rec = await UI.Files.store(f, { category: 'Immagine', ref: 'Blocco immagine' });
  if (!rec) return;
  b.fileId = rec.id;
  Store.touch(); App.refresh();
};
