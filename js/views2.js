/* =====================================================================
   VIEWS (parte 2) — Controlli (checker, error log, regole, controllo
   finale, quality check) · Revisioni · Scadenze/Attività/Timeline ·
   Domande · Relazione · Claude · Cronologia · Impostazioni · Benvenuto
   ===================================================================== */
'use strict';

const tabsHTML = (tabs, active, action) => '<div class="tabs" role="tablist">' + tabs.map(([k, l, b]) => '<button role="tab" aria-selected="' + (k === active) + '" class="' + (k === active ? 'active' : '') + '" data-action="' + action + '" data-tab="' + k + '">' + l + (b !== undefined && b !== null && b !== '' ? ' <span class="badge">' + b + '</span>' : '') + '</button>').join('') + '</div>';

/* =====================================================================
   CONTROLLI
   ===================================================================== */
Views.checks = {
  title: 'Controlli', icon: '✓',
  render(params) {
    const P = Store.P;
    if (params.extra && ['issues', 'log', 'rules', 'memory', 'final', 'quality'].includes(params.extra)) App.ui.checkTab = params.extra;
    if (params.id && Model.get('issues', params.id)) { App.ui.checkTab = 'issues'; const is = Model.get('issues', params.id); if (!C.ISSUE_ACTIVE.includes(is.status)) App.ui.issueStatus = 'all'; }
    const tab = App.ui.checkTab || 'issues';
    const active = Metrics.openIssues();
    const ls = P.checker.lastSummary;
    let h = H.head('Controlli · Project Checker', 'Controlli deterministici su completezza, coerenza, calcoli, unità, riferimenti, scadenze, consegna e indicazioni del professore. <b>Nessuna correzione viene applicata automaticamente.</b>',
      '<button class="btn primary" data-action="checker-run">Esegui Project Checker</button><button class="btn" data-action="checker-run-report">Controlla coerenza relazione</button><button class="btn" data-action="issue-manual">Segnalazione manuale</button>');
    h += '<p class="small muted mb">' + (P.checker.lastRunAt ? 'Ultimo controllo: ' + U.fmtDateTime(P.checker.lastRunAt) + (ls ? ' · ' + ls.created + ' nuove, ' + ls.resolved + ' risolte, ' + ls.skipped + ' escluse perché segnate "non è un errore"' : '') : 'Il controllo non è ancora stato eseguito.') + '</p>';
    h += tabsHTML([['issues', 'Possibili errori', active.length], ['log', 'Error log', P.issues.length], ['rules', 'Regole', P.customRules.length || ''], ['memory', 'Decisioni memorizzate', P.suppressions.length || ''], ['final', 'Controllo finale'], ['quality', 'Quality check']], tab, 'check-tab');
    h += this[tab](params);
    return h;
  },
  issueCard(i) {
    const sevCls = i.severity === 'PROBABILE ERRORE' ? 'PROBABILE' : i.severity;
    const act = C.ISSUE_ACTIVE.includes(i.status);
    return '<article class="card sev-' + sevCls + ' issue" id="item-' + i.id + '"><div class="row between"><div class="row"><b style="letter-spacing:.04em">POSSIBILE ERRORE</b>' + UI.badge(i.severity) + UI.badge(i.status) + (i.origin === 'CLAUDE' ? UI.badge('da Claude', 'violet') : i.origin === 'UTENTE' ? UI.badge('manuale', 'outline') : '') + '</div><span class="tiny muted">Rilevato ' + U.fmtDateTime(i.date) + '</span></div>' +
      '<dl><dt>Categoria</dt><dd>' + U.esc(i.category) + '</dd><dt>Elemento</dt><dd>' + (i.ref && i.ref.route ? '<button class="btn xs ghost" style="padding:0;color:var(--accent)" data-action="issue-goto" data-id="' + i.id + '">' + U.esc(i.element) + ' →</button>' : U.esc(i.element)) + '</dd>' +
      '<dt>Problema</dt><dd>' + U.esc(i.problem) + '</dd><dt>Motivo</dt><dd>' + U.esc(i.reason || '—') + '</dd><dt>Fonte del controllo</dt><dd>' + U.esc(i.source || i.ruleName || '—') + '</dd>' +
      '<dt>Affidabilità</dt><dd><span class="conf">' + UI.progress(i.confidence, i.confidence >= 75 ? 'risk' : i.confidence >= 50 ? 'warn' : '') + '<b>' + i.confidence + '%</b></span></dd><dt>Suggerimento</dt><dd>' + U.esc(i.suggestion || '—') + '</dd>' +
      (i.decision ? '<dt>Decisione</dt><dd>' + U.esc(i.decision) + (i.decidedAt ? ' <span class="tiny muted">(' + U.fmtDateTime(i.decidedAt) + ')</span>' : '') + '</dd>' : '') + (i.correction ? '<dt>Correzione effettuata</dt><dd>' + U.esc(i.correction) + '</dd>' : '') + (i.notes ? '<dt>Note</dt><dd class="prewrap">' + U.esc(i.notes) + '</dd>' : '') + '</dl>' +
      '<div class="row between"><div class="btn-group">' + (act ? (i.status === 'IN CORREZIONE' ? '<button class="btn sm ok" data-action="issue-decide" data-d="risolto" data-id="' + i.id + '">Segna come corretto</button>' : '<button class="btn sm primary" data-action="issue-decide" data-d="correggi" data-id="' + i.id + '">CORREGGI</button>') +
        '<button class="btn sm" data-action="issue-decide" data-d="ignora" data-id="' + i.id + '">IGNORA</button><button class="btn sm" data-action="issue-decide" data-d="nonerrore" data-id="' + i.id + '">NON È UN ERRORE</button>' + (i.status !== 'RIVEDI DOPO' ? '<button class="btn sm" data-action="issue-decide" data-d="dopo" data-id="' + i.id + '">RIVEDI DOPO</button>' : '')
        : '<button class="btn sm" data-action="issue-decide" data-d="riapri" data-id="' + i.id + '">Riapri</button>') + '</div><div class="btn-group">' + H.qBtn('Segnalazione "' + i.category + '" su ' + i.element + ': ' + i.problem, 'Controlli', 'issues', i.id) + '<button class="btn xs" data-action="issue-edit" data-id="' + i.id + '">Note / gravità</button></div></div></article>';
  },
  issues(params) {
    const P = Store.P;
    const st = App.ui.issueStatus || 'active', sv = App.ui.issueSev || '', cat = App.ui.issueCat || '';
    let list = P.issues.filter(i => st === 'all' ? true : st === 'active' ? C.ISSUE_ACTIVE.includes(i.status) : i.status === st)
      .filter(i => !sv || i.severity === sv).filter(i => !cat || i.category === cat)
      .sort((a, b) => (C.SEV_RANK[b.severity] - C.SEV_RANK[a.severity]) || (b.confidence - a.confidence));
    const cats = [...new Set(P.issues.map(i => i.category))].sort();
    let h = '<div class="card mb"><div class="row"><span class="lbl">Stato</span>' + UI.select('data-change="issue-filter" data-f="issueStatus" aria-label="Stato"', [['active', 'Attivi'], ['all', 'Tutti']].concat(C.ISSUE_STATUS.map(s => [s, s])), st) +
      '<span class="lbl">Gravità</span>' + UI.select('data-change="issue-filter" data-f="issueSev" aria-label="Gravità"', [['', 'Tutte']].concat(C.SEVERITY.map(s => [s, s])), sv) +
      '<span class="lbl">Categoria</span>' + UI.select('data-change="issue-filter" data-f="issueCat" aria-label="Categoria"', [['', 'Tutte']].concat(cats.map(c => [c, c])), cat) + '<span class="muted small">' + list.length + ' segnalazioni</span></div></div>';
    if (!list.length) return h + UI.empty(P.checker.lastRunAt ? 'Nessuna segnalazione con questi filtri' : 'Nessun controllo eseguito', P.checker.lastRunAt ? 'Ottimo lavoro, oppure cambia i filtri.' : 'Premi "Esegui Project Checker".');
    return h + '<div class="stack">' + list.slice(0, 200).map(i => this.issueCard(i)).join('') + '</div>' + (list.length > 200 ? '<p class="muted mt">Mostrate le prime 200.</p>' : '');
  },
  log() {
    const P = Store.P;
    const list = P.issues.slice().sort((a, b) => U.str(b.date).localeCompare(U.str(a.date)));
    if (!list.length) return UI.empty('Error log vuoto', 'Le segnalazioni del checker e quelle manuali compaiono qui con le tue decisioni.');
    return '<div class="row between mb"><span class="small muted">' + list.length + ' segnalazioni registrate</span><div class="btn-group"><button class="btn sm" data-action="export-errors" data-fmt="csv">Esporta CSV</button><button class="btn sm" data-action="export-errors" data-fmt="md">Esporta Markdown</button></div></div>' +
      '<div class="table-wrap"><table class="tbl"><tr><th>Data</th><th>Categoria</th><th>Descrizione</th><th>Gravità</th><th>Stato</th><th>Decisione</th><th>Correzione effettuata</th><th>Note</th><th></th></tr>' +
      list.map(i => '<tr><td class="nowrap small">' + U.fmtDateTime(i.date) + '</td><td class="small">' + U.esc(i.category) + '</td><td class="small">' + U.esc(U.truncate(i.problem, 160)) + '<br><span class="muted">' + U.esc(i.element) + '</span></td><td>' + UI.badge(i.severity) + '</td><td>' + UI.badge(i.status) + '</td><td class="small">' + U.esc(i.decision || '—') + '</td><td class="small">' + U.esc(i.correction || '—') + '</td><td class="small">' + U.esc(U.truncate(i.notes, 80)) + '</td>' +
        '<td><div class="btn-group"><button class="btn xs" data-action="issue-edit" data-id="' + i.id + '">Modifica</button><button class="btn xs" data-action="go" data-route="checks" data-id="' + i.id + '">Scheda</button></div></td></tr>').join('') + '</table></div>';
  },
  rules() {
    const P = Store.P;
    let h = H.card('Regole personalizzate', '<p class="small muted mb">Controlli tuoi (es. "Ogni grafico deve indicare le unità degli assi", "Il professore vuole sempre la tabella prima del grafico"). Vengono applicati a ogni esecuzione del checker; quelle di tipo "manuale" compaiono nel Controllo finale da confermare.</p>' +
      (P.customRules.length ? '<div class="table-wrap"><table class="tbl"><tr><th>Attiva</th><th>Regola</th><th>Tipo</th><th>Gravità</th><th></th></tr>' + P.customRules.map(r => '<tr><td><input type="checkbox" data-change="rule-active" data-id="' + r.id + '"' + (r.active ? ' checked' : '') + ' aria-label="Attiva"></td><td>' + U.esc(r.text) + (r.params && r.params.term ? ' <span class="muted small">(' + U.esc(r.params.term) + ')</span>' : '') + '</td><td class="small">' + U.esc((C.CUSTOM_RULE_TYPES.find(t => t.id === r.type) || {}).label || r.type) + '</td><td>' + UI.badge(r.severity) + '</td><td>' + H.editDel('customRules', r.id) + '</td></tr>').join('') + '</table></div>' : UI.empty('Nessuna regola personalizzata', '')),
      '<button class="btn sm primary" data-action="rule-new">Nuova regola</button>', 'mb');
    h += H.card('Regole integrate', '<p class="small muted mb">Puoi disattivare un controllo se non è pertinente al tuo progetto. Il contatore "non è un errore" riduce automaticamente l\'affidabilità delle segnalazioni di quella regola.</p><div class="table-wrap"><table class="tbl"><tr><th>Attiva</th><th>Regola</th><th>Gruppo</th><th>Segnate "non è un errore"</th></tr>' +
      Checker.RULES.map(r => '<tr><td><input type="checkbox" data-change="builtin-rule" data-id="' + r.id + '"' + (P.disabledRules.includes(r.id) ? '' : ' checked') + ' aria-label="Attiva"></td><td>' + U.esc(r.name) + '</td><td class="small">' + U.esc(r.group) + '</td><td class="num">' + ((P.ruleStats[r.id] || {}).falsePositives || 0) + '</td></tr>').join('') + '</table></div>');
    return h;
  },
  memory() {
    const P = Store.P;
    if (!P.suppressions.length) return UI.empty('Nessuna decisione memorizzata', 'Quando segni una segnalazione come "NON È UN ERRORE", la situazione viene ricordata e non verrà più segnalata finché resta identica.');
    return '<div class="table-wrap"><table class="tbl"><tr><th>Data</th><th>Elemento</th><th>Segnalazione</th><th>Nota</th><th></th></tr>' + P.suppressions.map((s, i) => '<tr><td class="nowrap small">' + U.fmtDateTime(s.at) + '</td><td class="small">' + U.esc(s.element) + '</td><td class="small">' + U.esc(U.truncate(s.problem, 160)) + '</td><td class="small">' + U.esc(s.note || '') + '</td><td><button class="btn xs" data-action="suppression-remove" data-i="' + i + '">Torna a segnalare</button></td></tr>').join('') + '</table></div>';
  },
  final() {
    const r = App.ui.finalResult;
    const P = Store.P;
    let h = '<div class="row mb"><button class="btn primary" data-action="final-run">Esegui controllo finale</button><span class="small muted">Esegue anche il Project Checker completo.</span>' + (r ? '<button class="btn sm" data-action="final-copy">Copia risultato</button>' : '') + '</div>';
    if (!r) return h + UI.empty('Controllo finale non ancora eseguito', 'Verifica requisiti della consegna, indicazioni del professore, dati, calcoli, risultati, grafici, errori aperti, relazione, coerenza e scadenze.');
    const ico = s => s === 'ok' ? '<span class="fc-ico ok">✓</span>' : s === 'warn' ? '<span class="fc-ico warn">⚠</span>' : s === 'risk' ? '<span class="fc-ico risk">✗</span>' : '<span class="fc-ico muted">–</span>';
    h += H.card('Esito del ' + U.fmtDateTime(r.at), r.rows.map(x => '<div class="fc-row">' + ico(x.state) + '<div><b>' + U.esc(x.label) + '</b><div class="small muted">' + U.esc(x.detail) + (x.blocking ? '' : ' · non bloccante') + '</div></div><div class="btn-group">' +
      (x.manualId ? '<label class="check-line small"><input type="checkbox" data-change="manual-confirm" data-id="' + x.manualId + '"' + (P.manualConfirm[x.manualId] ? ' checked' : '') + '><span>Confermo</span></label>' : '<button class="btn xs" data-action="go" data-route="' + x.route + '">Vai</button>') + '</div></div>').join('') +
      '<div class="verdict mt ' + (r.ready ? 'ok' : 'risk') + '">' + (r.ready ? '✓ PRONTO PER LA CONSEGNA' : '✗ NON ANCORA PRONTO') + '</div>' + (r.ready ? '<p class="small muted mt-s">Nessun elemento bloccante. Rileggi comunque la relazione finale prima di consegnare.</p>' : '<h4 class="mt">Motivazioni</h4><ul class="small">' + r.reasons.map(x => '<li>' + U.esc(x) + '</li>').join('') + '</ul>'));
    return h;
  },
  quality() {
    const q = App.ui.quality;
    let h = '<div class="row mb"><button class="btn primary" data-action="quality-run">Esegui Quality Check</button><span class="small muted">Valuta gli aspetti che distinguono un progetto completo da uno molto curato. <b>Non stima il voto.</b></span></div>';
    if (!q) return h + UI.empty('Quality check non ancora eseguito', 'Chiarezza, completezza, coerenza, tracciabilità, motivazione delle scelte, grafici, tabelle, terminologia, ordine, conclusioni, contraddizioni, rispetto delle indicazioni.');
    h += '<div class="table-wrap"><table class="tbl"><tr><th>Area</th><th>Livello</th><th style="width:160px">Punteggio</th><th>Dettagli</th><th>Come migliorare</th></tr>' + q.areas.map(a => '<tr><td><b>' + U.esc(a.name) + '</b></td><td><b class="q-' + U.esc(a.level.split(' ')[0]) + '">' + U.esc(a.level) + '</b></td><td>' + (a.score === null ? '<span class="muted small">dati insufficienti</span>' : '<div class="row nw">' + UI.progress(a.score, a.score >= 90 ? 'ok' : a.score >= 70 ? '' : a.score >= 40 ? 'warn' : 'risk') + '<span class="small">' + a.score + '</span></div>') + '</td><td class="small">' + a.details.map(U.esc).join('<br>') + '</td><td class="small">' + a.tips.map(U.esc).join('<br>') + '</td></tr>').join('') + '</table></div>' +
      '<p class="small muted mt">Eseguito il ' + U.fmtDateTime(q.at) + '. I livelli derivano da regole esplicite sui dati del progetto: sono un supporto alla revisione, non una previsione del voto.</p>';
    return h;
  }
};
Actions['check-tab'] = d => { App.ui.checkTab = d.tab; App.go('checks', '', d.tab); };
Actions['checker-run'] = () => {
  const s = Checker.run();
  UI.toast('Controllo completato: ' + s.created + ' nuove segnalazioni, ' + s.resolved + ' risolte, ' + s.open + ' aperte');
  App.renderNav(); App.refresh();
};
Actions['checker-run-report'] = () => {
  const s = Checker.run({ groups: ['relazione'] });
  UI.toast('Coerenza relazione: ' + s.findings + ' segnalazioni (' + s.created + ' nuove, ' + s.resolved + ' risolte)');
  App.ui.issueCat = ''; App.renderNav(); App.refresh();
};
Actions['issue-filter'] = (d, el) => { App.ui[d.f] = el.value; App.refresh(); };
Actions['issue-goto'] = d => {
  const i = Model.get('issues', d.id);
  if (!i || !i.ref) return;
  App.go(i.ref.route, i.ref.id || '', i.ref.blockId || '');
};
Actions['issue-decide'] = async d => {
  const i = Model.get('issues', d.id);
  if (!i) return;
  let note = '';
  if (d.d === 'nonerrore') {
    const r = await new Promise(res => UI.form({ title: 'NON È UN ERRORE', intro: '<p class="small muted">La situazione verrà memorizzata e non sarà più segnalata finché resta identica.</p>', fields: [{ key: 'note', label: 'Perché non è un errore? (facoltativo)', type: 'textarea', rows: 2 }], submitLabel: 'Conferma', onSubmit(v) { res(v); } , onMount(m) { const c = m.close; m.close = () => { c(); res(null); }; } }));
    if (!r) return;
    note = r.note;
  }
  if (d.d === 'risolto') {
    const r = await new Promise(res => UI.form({ title: 'Correzione effettuata', fields: [{ key: 'correction', label: 'Cosa hai corretto?', type: 'textarea', rows: 2 }], submitLabel: 'Segna come corretto', onSubmit(v) { res(v); }, onMount(m) { const c = m.close; m.close = () => { c(); res(null); }; } }));
    if (!r) return;
    i.correction = r.correction || 'Corretto manualmente';
  }
  Checker.decide(d.id, d.d, note);
  App.renderNav();
  if (d.d === 'correggi' && i.ref && i.ref.route) { UI.toast('Segnalazione in correzione: modifica l\'elemento, poi riesegui il checker o segnala come corretto'); App.go(i.ref.route, i.ref.id || '', i.ref.blockId || ''); }
  else App.refresh();
};
Actions['issue-edit'] = d => {
  const i = Model.get('issues', d.id);
  if (!i) return;
  UI.form({ title: 'Error log: dettagli', fields: [{ key: 'severity', label: 'Gravità', type: 'select', options: C.SEVERITY }, { key: 'status', label: 'Stato', type: 'select', options: C.ISSUE_STATUS }, { key: 'correction', label: 'Correzione effettuata', type: 'textarea', rows: 2 }, { key: 'notes', label: 'Note', type: 'textarea', rows: 3 }],
    value: i, onSubmit(v) {
      if (v.severity !== i.severity) i.severityManual = true;
      if (v.status === 'RISOLTO' && i.status !== 'RISOLTO') i.resolvedAt = U.nowISO();
      History.version({ type: 'issues', id: i.id, label: U.truncate(i.problem, 60), field: 'dettagli', before: { severity: i.severity, status: i.status, correction: i.correction, notes: i.notes }, after: v, origin: 'UTENTE' });
      Object.assign(i, v); Store.touch(); App.renderNav(); App.refresh();
    } });
};
Actions['issue-manual'] = () => UI.form({ title: 'Segnalazione manuale', fields: [
  { key: 'category', label: 'Categoria', required: true, placeholder: 'es. DUBBIO METODOLOGICO' }, { key: 'severity', label: 'Gravità', type: 'select', options: C.SEVERITY },
  { key: 'element', label: 'Elemento interessato', required: true, full: true }, { key: 'problem', label: 'Problema', type: 'textarea', rows: 2, required: true },
  { key: 'reason', label: 'Motivo', type: 'textarea', rows: 2 }, { key: 'suggestion', label: 'Suggerimento', type: 'textarea', rows: 2 }, { key: 'confidence', label: 'Affidabilità (0-100)', type: 'number' }],
  value: { severity: 'ATTENZIONE', confidence: 70 },
  onSubmit(v) {
    Store.P.issues.push(Object.assign({ id: U.uid('iss'), fp: U.hash('manual' + U.nowISO() + Math.random()), rule: 'manual', ruleName: 'Segnalazione manuale', group: 'manuale', date: U.nowISO(), lastSeen: U.nowISO(), ref: null, source: 'Segnalazione dell\'utente', status: 'APERTO', decision: '', correction: '', notes: '', origin: 'UTENTE', resolvedAt: null }, v, { confidence: U.clamp(+v.confidence || 50, 0, 100) }));
    History.log('Segnalazione manuale: ' + U.truncate(v.problem, 60), 'errori'); Store.touch(); App.renderNav(); App.refresh();
  } });
Actions['rule-new'] = () => openEditor('customRules', null, { active: true });
Actions['rule-active'] = (d, el) => { const r = Model.get('customRules', d.id); if (!r) return; r.active = el.checked; Store.touch(); };
Actions['builtin-rule'] = (d, el) => { const P = Store.P; P.disabledRules = P.disabledRules.filter(x => x !== d.id); if (!el.checked) P.disabledRules.push(d.id); History.log('Regola "' + d.id + '" ' + (el.checked ? 'attivata' : 'disattivata'), 'controlli'); Store.touch(); };
Actions['suppression-remove'] = d => {
  const P = Store.P, s = P.suppressions[+d.i];
  if (!s) return;
  P.suppressions.splice(+d.i, 1);
  const iss = P.issues.find(x => x.fp === s.fp);
  if (iss && iss.status === 'NON È UN ERRORE') { iss.status = 'APERTO'; iss.decision = 'Riattivata'; }
  if (P.ruleStats[s.rule]) P.ruleStats[s.rule].falsePositives = Math.max(0, P.ruleStats[s.rule].falsePositives - 1);
  Store.touch(); App.refresh();
};
Actions['final-run'] = () => { App.ui.finalResult = Checker.finalCheck(); App.renderNav(); App.refresh(); };
Actions['final-copy'] = async () => {
  const r = App.ui.finalResult;
  if (!r) return;
  const sym = { ok: '✓', warn: '⚠', risk: '✗', na: '–' };
  const txt = 'CONTROLLO FINALE — ' + Store.P.info.name + ' (' + U.fmtDateTime(r.at) + ')\n\n' + r.rows.map(x => sym[x.state] + ' ' + x.label.toUpperCase() + ': ' + x.detail).join('\n') + '\n\n' + (r.ready ? 'PRONTO PER LA CONSEGNA' : 'NON ANCORA PRONTO\n- ' + r.reasons.join('\n- '));
  UI.toast((await U.copy(txt)) ? 'Risultato copiato' : 'Copia non riuscita');
};
Actions['manual-confirm'] = (d, el) => { const P = Store.P; if (el.checked) P.manualConfirm[d.id] = U.nowISO(); else delete P.manualConfirm[d.id]; Store.touch(); };
Actions['quality-run'] = () => { App.ui.quality = Checker.qualityCheck(); App.refresh(); };

/* =====================================================================
   REVISIONI
   ===================================================================== */
const Revisions = {
  prepare(r) {
    const P = Store.P;
    const prev = P.revisions.filter(x => x.id !== r.id && x.status === 'SVOLTA' && U.str(x.date) <= U.str(r.date || U.todayISO())).sort((a, b) => U.str(b.date).localeCompare(U.str(a.date)))[0];
    const since = prev ? U.toDate(prev.date).toISOString() : P.createdAt;
    const sinceLbl = prev ? 'dalla revisione del ' + U.fmtDate(prev.date) : 'dall\'inizio del progetto';
    const after = iso => iso && iso >= since;
    const num = Model.numbering().map;
    const lines = [];
    const sec = (t, arr) => lines.push('## ' + t + '\n' + (arr.length ? arr.map(x => '- ' + x).join('\n') : '- (nessun elemento)') + '\n');
    const show = U.str(r.topics).split('\n').map(s => s.trim()).filter(Boolean);
    Model.allBlocks().filter(x => after(x.block.updatedAt) && x.block.type !== 'note').slice(0, 12).forEach(x => show.push(Model.blockLabel(x.block) + ' (Fase ' + (x.phase.order + 1) + ': ' + x.phase.title + ')'));
    sec('Cosa mostrare', show);
    const done = [];
    Model.phasesSorted().forEach(ph => ph.checklist.filter(c => c.done && after(c.doneAt)).forEach(c => done.push(ph.title + ': ' + c.text)));
    P.tasks.filter(t => t.status === 'COMPLETATA' && after(t.doneAt)).forEach(t => done.push('Attività: ' + t.title));
    P.guidelines.filter(g => ['COMPLETATA', 'APPROVATA'].includes(g.status) && after(g.updatedAt)).forEach(g => done.push('Linea guida: ' + g.title + ' (' + g.status.toLowerCase() + ')'));
    P.brief.analysis.filter(a => a.done && after(a.doneAt)).forEach(a => done.push('Requisito consegna: ' + U.truncate(a.text, 90)));
    sec('Cosa abbiamo completato ' + sinceLbl, done);
    sec('Cosa è cambiato ' + sinceLbl, P.history.filter(v => after(v.at)).slice(0, 25).map(v => U.fmtDate(v.at) + ' · ' + v.label + ' — ' + v.field + (v.reason ? ' (' + v.reason + ')' : '') + ' [' + v.origin + ']'));
    const probs = U.str(r.openProblems).split('\n').map(s => s.trim()).filter(Boolean);
    Metrics.openIssues('ATTENZIONE').sort((a, b) => C.SEV_RANK[b.severity] - C.SEV_RANK[a.severity]).slice(0, 12).forEach(i => probs.push('[' + i.severity + '] ' + i.element + ': ' + i.problem));
    sec('Problemi aperti', probs);
    const qs = P.questions.filter(q => (q.revisionId === r.id || !q.revisionId) && ['APERTA', 'POSTA'].includes(q.status)).sort((a, b) => C.PRIORITIES.indexOf(b.priority) - C.PRIORITIES.indexOf(a.priority)).map(q => q.text + (q.priority === 'ALTA' || q.priority === 'CRITICA' ? ' [' + q.priority + ']' : ''));
    U.str(r.questionsText).split('\n').map(s => s.trim()).filter(Boolean).forEach(q => qs.push(q));
    sec('Domande da fare', qs);
    const res = Model.allBlocks().filter(x => x.block.type === 'result' && x.block.value).map(x => (num[x.block.id] || '') + ' ' + x.block.name + ' = ' + x.block.value + ' ' + U.str(x.block.unit) + (x.block.status !== 'VERIFICATO' ? ' (da verificare)' : ''));
    Model.allBlocks().filter(x => x.block.type === 'calc' && x.block.resultName && (x.block.statedResult || x.block.computed !== null)).forEach(x => res.push(x.block.resultName + ' = ' + (x.block.statedResult || U.fmtNum(x.block.computed)) + ' ' + U.str(x.block.unit)));
    sec('Risultati importanti', res);
    const files = U.str(r.materials).split('\n').map(s => s.trim()).filter(Boolean);
    P.files.filter(f => after(f.createdAt)).forEach(f => files.push(f.name + ' (' + f.category + ')'));
    Model.allBlocks().filter(x => ['image', 'chart', 'table'].includes(x.block.type)).forEach(x => files.push(Model.blockLabel(x.block)));
    sec('File necessari', [...new Set(files)]);
    const text = '# Preparazione revisione del ' + U.fmtDate(r.date) + (r.time ? ' ore ' + r.time : '') + '\n_' + (P.info.name || '') + ' · generata il ' + U.fmtDateTime(U.nowISO()) + '_\n\n' + lines.join('\n');
    return { text, at: U.nowISO() };
  }
};
Views.revisions = {
  title: 'Revisioni', icon: '◎',
  render(params) {
    const P = Store.P;
    const list = P.revisions.slice().sort((a, b) => U.str(b.date).localeCompare(U.str(a.date)));
    let h = H.head('Revisioni con il professore', 'Prepara ogni incontro, registra correzioni e indicazioni ricevute e trasformale in attività.', '<button class="btn primary" data-action="new" data-coll="revisions">Nuova revisione</button>');
    if (!list.length) return h + UI.empty('Nessuna revisione', 'Pianifica la prima revisione con il professore.', '<button class="btn primary" data-action="new" data-coll="revisions">Pianifica revisione</button>');
    h += '<div class="stack">' + list.map(r => {
      const rd = Metrics.revisionReadiness(r);
      const qs = P.questions.filter(q => q.revisionId === r.id);
      const fld = (l, v) => v ? '<div><h4>' + l + '</h4><p class="prewrap small mt-s">' + U.esc(v) + '</p></div>' : '';
      return '<article class="card ' + (r.status === 'SVOLTA' ? '' : 'accent-left') + '" id="item-' + r.id + '"><div class="row between top"><div><h3>Revisione del ' + U.fmtDate(r.date) + (r.time ? ' · ' + r.time : '') + '</h3><div class="row mt-s">' + UI.badge(r.status) + (r.status === 'PIANIFICATA' ? UI.daysBadge(r.date) + (rd.ready ? UI.badge('pronta', 'ok') : UI.badge('non pronta', 'warn')) : '') + '</div></div>' +
        '<div class="btn-group">' + (r.status === 'PIANIFICATA' ? '<button class="btn sm primary" data-action="revision-prepare" data-id="' + r.id + '">PREPARA REVISIONE</button><button class="btn sm" data-action="revision-done" data-id="' + r.id + '">Registra esito</button>' : '') + H.editDel('revisions', r.id) + '</div></div>' +
        (r.status === 'PIANIFICATA' && !rd.ready ? '<p class="small mt-s" style="color:var(--warn)">Manca: ' + U.esc(rd.missing.join(', ')) + '</p>' : '') +
        '<div class="grid g3 mt">' + fld('Argomenti da mostrare', r.topics) + fld('Materiale da portare', r.materials) + fld('Problemi aperti', r.openProblems) + fld('Correzioni ricevute', r.corrections) + fld('Indicazioni ricevute', r.indications) + fld('Attività successive', r.nextActions) + fld('Note', r.notes) + fld('Altre domande', r.questionsText) + '</div>' +
        '<div class="mt"><h4>Domande assegnate (' + qs.length + ')</h4>' + (qs.length ? '<ul class="small mt-s">' + qs.map(q => '<li>' + U.esc(q.text) + ' ' + UI.badge(q.status) + (q.answer ? '<br><span class="muted">→ ' + U.esc(q.answer) + '</span>' : '') + '</li>').join('') + '</ul>' : '<p class="small muted">Nessuna. Assegnale dalla sezione Domande.</p>') + '</div>' +
        (r.status === 'SVOLTA' && (r.corrections || r.indications || r.nextActions) ? '<div class="btn-group mt">' + (r.corrections || r.indications ? '<button class="btn sm" data-action="revision-to-prof" data-id="' + r.id + '">Registra come materiale del professore</button>' : '') + (r.nextActions ? '<button class="btn sm" data-action="revision-to-tasks" data-id="' + r.id + '">Crea attività dalle attività successive</button>' : '') + '</div>' : '') +
        (r.prep ? '<details class="exp mt"' + (params.id === r.id ? ' open' : '') + '><summary>Preparazione generata il ' + U.fmtDateTime(r.prep.at) + '</summary><div class="exp-body"><div class="btn-group mb"><button class="btn xs" data-action="revision-prep-copy" data-id="' + r.id + '">Copia</button><button class="btn xs" data-action="revision-prep-download" data-id="' + r.id + '">Scarica .md</button><button class="btn xs" data-action="revision-prep-print" data-id="' + r.id + '">Stampa</button></div>' + H.md(r.prep.text) + '</div></details>' : '') + '</article>';
    }).join('') + '</div>';
    return h;
  },
  mount(root, params) { if (params.id) { const el = document.getElementById('item-' + params.id); if (el) el.scrollIntoView({ block: 'start' }); } }
};
Actions['revision-prepare'] = d => {
  const r = Model.get('revisions', d.id);
  if (!r) return;
  r.prep = Revisions.prepare(r);
  History.log('Preparata revisione del ' + U.fmtDate(r.date), 'revisions');
  Store.touch();
  if (App.route.name !== 'revisions') App.go('revisions', r.id); else App.go('revisions', r.id);
  UI.toast('Preparazione generata: controlla argomenti, materiale e domande');
};
Actions['revision-prep-copy'] = async d => { const r = Model.get('revisions', d.id); if (r && r.prep) UI.toast((await U.copy(r.prep.text)) ? 'Copiato' : 'Copia non riuscita'); };
Actions['revision-prep-download'] = d => { const r = Model.get('revisions', d.id); if (r && r.prep) U.download('revisione-' + r.date + '.md', r.prep.text, 'text/markdown;charset=utf-8'); };
Actions['revision-prep-print'] = d => { const r = Model.get('revisions', d.id); if (r && r.prep) App.print('<h1>' + U.esc(Store.P.info.name) + '</h1>' + U.md(r.prep.text)); };
Actions['revision-done'] = d => {
  const r = Model.get('revisions', d.id);
  if (!r) return;
  UI.form({ title: 'Esito della revisione del ' + U.fmtDate(r.date), size: 'wide', fields: [
    { key: 'corrections', label: 'Correzioni ricevute', type: 'textarea', rows: 4 }, { key: 'indications', label: 'Indicazioni ricevute', type: 'textarea', rows: 4 },
    { key: 'nextActions', label: 'Attività successive (una per riga)', type: 'textarea', rows: 3 }, { key: 'notes', label: 'Note', type: 'textarea', rows: 2 }],
    value: r, submitLabel: 'Segna come SVOLTA',
    onSubmit(v) {
      Model.update('revisions', r.id, Object.assign(v, { status: 'SVOLTA' }), { reason: 'Esito revisione', origin: 'PROFESSORE' });
      P_questionsPosed(r.id);
      App.refresh();
      UI.toast('Revisione registrata. Registra le correzioni come materiale del professore per farle controllare dal checker.');
    } });
};
function P_questionsPosed(revId) { Store.P.questions.forEach(q => { if (q.revisionId === revId && q.status === 'APERTA') q.status = 'POSTA'; }); Store.touch(); }
Actions['revision-to-prof'] = d => {
  const r = Model.get('revisions', d.id);
  if (!r) return;
  let n = 0;
  if (U.str(r.corrections).trim()) { const pn = Object.assign(Factory.profNote(), { title: 'Correzioni revisione ' + U.fmtDate(r.date), date: r.date || U.todayISO(), category: 'CORREZIONE', source: 'Revisione', importance: 'ALTA', content: r.corrections }); Model.add('profNotes', pn); n++; }
  if (U.str(r.indications).trim()) { const pn = Object.assign(Factory.profNote(), { title: 'Indicazioni revisione ' + U.fmtDate(r.date), date: r.date || U.todayISO(), category: 'INDICAZIONE UFFICIALE', source: 'Revisione', importance: 'MEDIA', content: r.indications }); Model.add('profNotes', pn); n++; }
  UI.toast(U.plural(n, 'elemento registrato', 'elementi registrati') + ' nel materiale del professore');
  App.go('prof');
};
Actions['revision-to-tasks'] = d => {
  const r = Model.get('revisions', d.id);
  if (!r) return;
  const lines = U.str(r.nextActions).split('\n').map(s => s.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean);
  const existing = new Set(Model.list('tasks').map(t => U.norm(t.title)));
  let n = 0;
  lines.forEach(l => { if (existing.has(U.norm(l))) return; Model.add('tasks', Object.assign(Factory.task(), { title: l, priority: 'ALTA', notes: 'Da revisione del ' + U.fmtDate(r.date) })); n++; });
  UI.toast(n ? 'Create ' + n + ' attività (assegnale a fasi e scadenze)' : 'Le attività esistono già');
  App.go('deadlines', '', 'tasks');
};

/* =====================================================================
   SCADENZE · ATTIVITÀ · TIMELINE
   ===================================================================== */
Views.deadlines = {
  title: 'Calendario', icon: '◷',
  render(params) {
    if (params.extra && ['deadlines', 'tasks', 'timeline'].includes(params.extra)) App.ui.dlTab = params.extra;
    if (params.id && Model.get('tasks', params.id)) App.ui.dlTab = 'tasks';
    const tab = App.ui.dlTab || 'deadlines';
    const P = Store.P;
    let h = H.head('Scadenze, attività e timeline', 'Le date si aggiornano automaticamente rispetto a oggi (' + U.fmtDate(U.todayISO()) + ').', '<button class="btn primary" data-action="new" data-coll="deadlines">Nuova scadenza</button><button class="btn" data-action="new" data-coll="tasks">Nuova attività</button>');
    h += tabsHTML([['deadlines', 'Scadenze', P.deadlines.filter(d => d.status === 'APERTA').length], ['tasks', 'Attività', P.tasks.filter(t => t.status !== 'COMPLETATA').length], ['timeline', 'Timeline']], tab, 'dl-tab');
    return h + this[tab](params);
  },
  deadlines(params) {
    const P = Store.P;
    const days = Metrics.daysToDue();
    let h = '';
    if (U.isValidDate(P.info.dueDate)) h += '<div class="card accent-left mb"><div class="row between"><div><h4>Consegna finale</h4><h2 class="mt-s">' + (days < 0 ? 'CONSEGNA SUPERATA DI ' + (-days) + ' GIORNI' : days === 0 ? 'CONSEGNA OGGI' : days === 1 ? 'CONSEGNA DOMANI' : 'CONSEGNA TRA ' + days + ' GIORNI') + '</h2><p class="small muted">' + U.fmtDate(P.info.dueDate) + '</p></div><div style="min-width:220px"><span class="small">Progresso generale</span>' + UI.progress(Metrics.overall().total, 'lg') + '<b>' + Metrics.overall().total + '%</b></div></div></div>';
    else h += '<div class="card mb"><p>Data di consegna finale non impostata. <button class="btn xs" data-action="edit-info">Imposta</button></p></div>';
    const list = P.deadlines.slice().sort((a, b) => (a.status === 'APERTA' ? 0 : 1) - (b.status === 'APERTA' ? 0 : 1) || U.str(a.date).localeCompare(U.str(b.date)));
    if (!list.length) return h + UI.empty('Nessuna scadenza', 'Aggiungi consegne intermedie, milestone e date importanti.');
    h += '<div class="stack">' + list.map(d => {
      const st = Metrics.deadlineState(d);
      const n = st.days;
      const rel = n === null ? 'DATA NON VALIDA' : n < 0 ? 'SUPERATA DI ' + (-n) + ' GIORNI' : n === 0 ? 'OGGI' : n === 1 ? 'DOMANI' : 'TRA ' + n + ' GIORNI';
      const riskB = d.status !== 'APERTA' ? UI.badge(d.status) : st.risk === 'SUPERATA' ? UI.badge('superata', 'risk') : st.risk === 'RISCHIO' ? UI.badge('rischio ritardo', 'risk') : st.risk === 'VICINA' ? UI.badge('vicina', 'warn') : UI.badge('in tempo', 'ok');
      return '<article class="card ' + (st.risk === 'SUPERATA' || st.risk === 'RISCHIO' ? 'sev-CRITICO' : st.risk === 'VICINA' ? 'sev-ATTENZIONE' : '') + '" id="item-' + d.id + '"' + (d.status !== 'APERTA' ? ' style="opacity:.75"' : '') + '><div class="row between top"><div><div class="row">' + UI.badge(d.kind, 'accent') + UI.badge(d.priority) + riskB + '</div><h3 class="mt-s">' + U.esc(d.title) + '</h3><p class="small mt-s"><b>' + U.fmtDate(d.date) + (d.time ? ' ore ' + d.time : '') + '</b> · ' + (d.status === 'APERTA' ? rel : 'chiusa') + '</p></div>' +
        '<div class="btn-group"><button class="btn sm ' + (d.status === 'APERTA' ? 'ok' : '') + '" data-action="deadline-toggle" data-id="' + d.id + '">' + (d.status === 'APERTA' ? 'Segna completata' : 'Riapri') + '</button>' + H.editDel('deadlines', d.id) + '</div></div>' +
        (d.description ? '<p class="small mt-s prewrap">' + U.esc(d.description) + '</p>' : '') +
        '<div class="grid g2 mt"><div><h4>Attività collegate (' + st.tasks.length + ')</h4>' + (st.tasks.length ? '<div class="stack s mt-s">' + st.tasks.map(t => '<label class="check-line small"><input type="checkbox" data-change="task-toggle" data-id="' + t.id + '"' + (t.status === 'COMPLETATA' ? ' checked' : '') + '><span>' + U.esc(t.title) + '</span></label>').join('') + '</div>' : '<p class="small muted mt-s">Nessuna</p>') + '</div>' +
        '<div><h4>Fasi collegate (' + st.phases.length + ')</h4>' + (st.phases.length ? st.phases.map(p => { const pr = Metrics.phaseProgress(p); return '<div class="prog-row mt-s"><span class="small">' + U.esc(U.truncate(p.title, 26)) + '</span>' + UI.progress(pr.pct) + '<span class="pct small">' + pr.pct + '%</span></div>'; }).join('') : '<p class="small muted mt-s">Nessuna</p>') + '</div></div></article>';
    }).join('') + '</div>';
    return h;
  },
  tasks(params) {
    const P = Store.P;
    const f = App.ui.taskFilter || 'open';
    const list = P.tasks.filter(t => f === 'all' ? true : f === 'open' ? t.status !== 'COMPLETATA' : t.status === f).sort((a, b) => (U.str(a.due) || '9999').localeCompare(U.str(b.due) || '9999'));
    let h = '<div class="card mb"><div class="row"><span class="lbl">Mostra</span>' + UI.select('data-change="task-filter" aria-label="Filtro attività"', [['open', 'Da completare'], ['all', 'Tutte']].concat(C.TASK_STATUS.map(s => [s, s])), f) + '<span class="small muted">' + list.length + ' attività</span></div></div>';
    if (!list.length) return h + UI.empty('Nessuna attività', 'Le attività possono essere collegate a fasi e scadenze.');
    return h + '<div class="table-wrap"><table class="tbl"><tr><th>Attività</th><th>Fase</th><th>Scadenza</th><th>Data</th><th>Priorità</th><th>Stato</th><th></th></tr>' + list.map(t => {
      const ph = Model.get('phases', t.phaseId), dl = Model.get('deadlines', t.deadlineId);
      return '<tr id="item-' + t.id + '"><td>' + U.esc(t.title) + (t.notes ? '<br><span class="tiny muted">' + U.esc(U.truncate(t.notes, 80)) + '</span>' : '') + '</td><td class="small">' + (ph ? U.esc(ph.title) : '—') + '</td><td class="small">' + (dl ? U.esc(dl.title) : '—') + '</td><td class="nowrap small">' + (t.due ? U.fmtDate(t.due) + '<br>' + UI.daysBadge(t.due) : '—') + '</td><td>' + UI.badge(t.priority) + '</td>' +
        '<td>' + UI.select('data-change="task-status" data-id="' + t.id + '" aria-label="Stato attività"', C.TASK_STATUS, t.status) + '</td><td>' + H.editDel('tasks', t.id) + '</td></tr>';
    }).join('') + '</table></div>';
  },
  timeline() {
    const P = Store.P;
    const ev = [];
    ev.push({ date: U.isoToLocalDate(P.createdAt), title: 'Creazione del progetto', kind: 'progetto', cls: 'ok' });
    Model.phasesSorted().forEach(ph => {
      const pr = Metrics.phaseProgress(ph).pct;
      if (U.isValidDate(ph.start)) ev.push({ date: ph.start, title: 'Inizio fase ' + (ph.order + 1) + ': ' + ph.title, kind: 'fase', cls: '' });
      if (U.isValidDate(ph.end)) ev.push({ date: ph.end, title: 'Fine prevista fase ' + (ph.order + 1) + ': ' + ph.title + ' (' + pr + '%)', kind: 'fase', cls: pr >= 100 ? 'ok' : U.daysUntil(ph.end) < 0 ? 'risk' : '' });
    });
    P.deadlines.filter(d => U.isValidDate(d.date)).forEach(d => ev.push({ date: d.date, time: d.time, title: d.title, kind: d.kind.toLowerCase(), cls: d.status === 'COMPLETATA' ? 'ok' : Metrics.deadlineState(d).risk === 'SUPERATA' || Metrics.deadlineState(d).risk === 'RISCHIO' ? 'risk' : '' }));
    P.revisions.filter(r => U.isValidDate(r.date)).forEach(r => ev.push({ date: r.date, time: r.time, title: 'Revisione con il professore (' + r.status.toLowerCase() + ')', kind: 'revisione', cls: r.status === 'SVOLTA' ? 'ok' : '' }));
    if (U.isValidDate(P.info.dueDate)) ev.push({ date: P.info.dueDate, title: 'CONSEGNA FINALE', kind: 'consegna', cls: 'k-final' });
    ev.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    if (ev.length <= 1) return UI.empty('Timeline vuota', 'Aggiungi date alle fasi, scadenze, revisioni e la consegna finale.');
    const today = U.todayISO();
    let placed = false, h = '<div class="card"><div class="timeline">';
    ev.forEach(e => {
      if (!placed && e.date > today) { h += '<div class="today-line">Oggi · ' + U.fmtDate(today) + '</div>'; placed = true; }
      h += '<div class="tl-item ' + (e.date < today ? 'past ' : e.date === today ? 'today ' : '') + e.cls + '"><div class="tl-date">' + U.fmtDate(e.date) + (e.time ? ' ' + e.time : '') + ' · ' + U.relDays(e.date) + '</div><div class="tl-title">' + U.esc(e.title) + ' <span class="badge outline">' + U.esc(e.kind) + '</span></div></div>';
    });
    if (!placed) h += '<div class="today-line">Oggi · ' + U.fmtDate(today) + '</div>';
    return h + '</div></div>';
  },
  mount(root, params) { if (params.id) { const el = document.getElementById('item-' + params.id); if (el) { el.scrollIntoView({ block: 'center' }); el.style.outline = '2px solid var(--accent)'; } } }
};
Actions['dl-tab'] = d => { App.ui.dlTab = d.tab; App.go('deadlines', '', d.tab); };
Actions['task-filter'] = (d, el) => { App.ui.taskFilter = el.value; App.refresh(); };
Actions['task-status'] = (d, el) => { Model.update('tasks', d.id, { status: el.value, doneAt: el.value === 'COMPLETATA' ? U.nowISO() : null }, { track: false }); History.log('Attività "' + Model.get('tasks', d.id).title + '" → ' + el.value, 'tasks'); App.refresh(); };
Actions['deadline-toggle'] = d => { const x = Model.get('deadlines', d.id); if (!x) return; Model.update('deadlines', d.id, { status: x.status === 'APERTA' ? 'COMPLETATA' : 'APERTA' }, { reason: 'Cambio stato' }); App.renderNav(); App.refresh(); };

/* =====================================================================
   DOMANDE PER IL PROFESSORE
   ===================================================================== */
Views.questions = {
  title: 'Domande', icon: '?',
  render(params) {
    const P = Store.P;
    const f = App.ui.qFilter || 'open';
    const list = P.questions.filter(q => f === 'all' ? true : f === 'open' ? ['APERTA', 'POSTA'].includes(q.status) : q.status === f)
      .sort((a, b) => C.PRIORITIES.indexOf(b.priority) - C.PRIORITIES.indexOf(a.priority) || U.str(a.createdAt).localeCompare(U.str(b.createdAt)));
    const revOpts = [['', '— da assegnare —']].concat(P.revisions.slice().sort((a, b) => U.str(a.date).localeCompare(U.str(b.date))).map(r => [r.id, U.fmtDate(r.date) + ' (' + r.status.toLowerCase() + ')']));
    let h = H.head('Domande per il professore', 'Lista centralizzata: puoi aggiungere domande da qualsiasi sezione con il pulsante "？ Domanda".', '<button class="btn primary" data-action="question-quick">Nuova domanda</button><button class="btn" data-action="export-questions">Esporta</button><button class="btn" data-action="claude-prepare" data-task="questions">Suggerimenti da Claude</button>');
    h += '<div class="card mb"><div class="row"><span class="lbl">Mostra</span>' + UI.select('data-change="q-filter" aria-label="Filtro domande"', [['open', 'Aperte e poste'], ['all', 'Tutte']].concat(C.QUESTION_STATUS.map(s => [s, s])), f) + '<span class="small muted">' + list.length + ' domande</span></div></div>';
    if (!list.length) return h + UI.empty('Nessuna domanda', 'Quando hai un dubbio, aggiungilo qui per non dimenticarlo alla prossima revisione.');
    h += '<div class="stack">' + list.map(q => '<article class="card" id="item-' + q.id + '"><div class="row between top"><div class="grow"><div class="row">' + UI.badge(q.priority) + UI.badge(q.status) + (q.topic ? '<span class="badge outline">' + U.esc(q.topic) + '</span>' : '') + '<span class="tiny muted">inserita il ' + U.fmtDate(q.createdAt) + '</span></div><p class="mt-s" style="font-weight:600">' + U.esc(q.text) + '</p>' +
      (q.sourceRef ? '<p class="tiny muted mt-s">Riferita a: ' + U.esc(Model.refLabel(q.sourceRef)) + '</p>' : '') + (q.answer ? '<div class="mt-s small" style="border-left:3px solid var(--ok);padding-left:10px"><b>Risposta del professore:</b> ' + U.esc(q.answer) + '</div>' : '') + '</div>' +
      '<div class="stack s" style="min-width:210px"><label class="small" for="qr-' + q.id + '">Revisione prevista</label>' + UI.select('id="qr-' + q.id + '" data-change="q-revision" data-id="' + q.id + '"', revOpts, q.revisionId) +
      '<div class="btn-group">' + (!q.answer ? '<button class="btn xs primary" data-action="q-answer" data-id="' + q.id + '">Registra risposta</button>' : '') + (q.answer ? '<button class="btn xs" data-action="q-to-prof" data-id="' + q.id + '">→ Materiale prof.</button>' : '') + H.editDel('questions', q.id) + '</div></div></div></article>').join('') + '</div>';
    return h;
  },
  mount(root, params) { if (params.id) { const el = document.getElementById('item-' + params.id); if (el) { el.scrollIntoView({ block: 'center' }); el.style.outline = '2px solid var(--accent)'; } } }
};
Actions['q-filter'] = (d, el) => { App.ui.qFilter = el.value; App.refresh(); };
Actions['q-revision'] = (d, el) => { const q = Model.get('questions', d.id); if (!q) return; q.revisionId = el.value; Store.touch(); };
Actions['q-answer'] = d => {
  const q = Model.get('questions', d.id);
  if (!q) return;
  UI.form({ title: 'Risposta del professore', intro: '<p class="small"><b>Domanda:</b> ' + U.esc(q.text) + '</p>', fields: [{ key: 'answer', label: 'Risposta', type: 'textarea', rows: 4, required: true }, { key: 'toProf', label: 'Registra anche come indicazione nel materiale del professore', type: 'checkbox' }],
    value: { toProf: true }, onSubmit(v) {
      Model.update('questions', q.id, { answer: v.answer, status: 'RISPOSTA' }, { reason: 'Risposta del professore', origin: 'PROFESSORE' });
      if (v.toProf) Model.add('profNotes', Object.assign(Factory.profNote(), { title: 'Risposta: ' + U.truncate(q.text, 60), category: 'INDICAZIONE UFFICIALE', source: 'Revisione', content: 'Domanda: ' + q.text + '\n\nRisposta: ' + v.answer }));
      App.refresh();
    } });
};
Actions['q-to-prof'] = d => { const q = Model.get('questions', d.id); if (!q) return; Model.add('profNotes', Object.assign(Factory.profNote(), { title: 'Risposta: ' + U.truncate(q.text, 60), category: 'INDICAZIONE UFFICIALE', source: 'Revisione', content: 'Domanda: ' + q.text + '\n\nRisposta: ' + q.answer })); UI.toast('Registrata nel materiale del professore'); };

/* =====================================================================
   RELAZIONE
   ===================================================================== */
const Report = {
  sec(id) { return Store.P.report.sections.find(s => s.id === id); },
  sorted() { return Store.P.report.sections.slice().sort((a, b) => a.order - b.order); },
  /** compone una bozza usando SOLO dati presenti nel progetto */
  compose(sec) {
    const P = Store.P, t = U.norm(sec.title), num = Model.numbering().map;
    const blocks = Model.allBlocks();
    const pick = types => blocks.filter(x => types.includes(x.block.type) && (x.block.inReport || !blocks.some(y => y.block.inReport)));
    const tableMd = b => '**' + (num[b.id] || 'Tabella') + (b.title ? ': ' + b.title : '') + '**\n\n| ' + b.columns.join(' | ') + ' |\n|' + b.columns.map(() => '---').join('|') + '|\n' + b.rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + (b.notes ? '\n\n_' + b.notes + '_' : '');
    const out = [];
    if (/introduz|introduction/.test(t)) { if (P.info.description) out.push(P.info.description); out.push('Progetto svolto per il corso di ' + (P.info.subject || '[materia]') + (P.info.professor ? ' (docente: ' + P.info.professor + ')' : '') + (P.info.year ? ', a.a. ' + P.info.year : '') + (P.info.members.length ? ', dal gruppo: ' + P.info.members.join(', ') : '') + '.'); }
    else if (/obiettiv|objective|aim|goal/.test(t)) { if (P.info.objective) out.push(P.info.objective); const ob = P.brief.analysis.filter(a => a.cat === 'objectives'); if (ob.length) out.push('Obiettivi indicati nella consegna:\n' + ob.map(a => '- ' + a.text).join('\n')); }
    else if (/metodolog|method/.test(t)) {
      const gl = P.guidelines.filter(g => ['COMPLETATA', 'APPROVATA', 'IN CORSO', 'DA VERIFICARE'].includes(g.status));
      out.push('Il lavoro è stato organizzato nelle seguenti fasi:\n' + Model.phasesSorted().map(ph => (ph.order + 1) + '. **' + ph.title + '**' + (ph.description ? ': ' + ph.description : '')).join('\n'));
      if (gl.length) out.push('Linee guida seguite:\n' + gl.map(g => '- ' + g.title + (g.motivation ? ' — ' + g.motivation : '')).join('\n'));
    }
    else if (/^dati|data$|dataset/.test(t)) pick(['table']).forEach(x => out.push(tableMd(x.block)));
    else if (/calcol|calculation/.test(t)) {
      pick(['formula']).forEach(x => out.push('**' + (num[x.block.id] || 'Formula') + (x.block.title ? ': ' + x.block.title : '') + '**\n\n$$' + x.block.latex + '$$' + (x.block.content ? '\n\n' + x.block.content : '')));
      pick(['calc']).forEach(x => { const b = x.block; out.push('**' + (num[b.id] || 'Calcolo') + (b.title ? ': ' + b.title : '') + '**\n\n- Espressione: `' + b.expression + '`\n' + U.arr(b.variables).map(v => '- ' + v.name + ' = ' + v.value + (v.unit ? ' ' + v.unit : '')).join('\n') + '\n- **' + (b.resultName || 'Risultato') + ' = ' + (b.statedResult || U.fmtNum(b.computed)) + (b.unit ? ' ' + b.unit : '') + '**'); });
    }
    else if (/risultat|result/.test(t)) {
      const rs = pick(['result']);
      if (rs.length) out.push(rs.map(x => '- **' + x.block.name + '**: ' + x.block.value + (x.block.unit && x.block.unit !== '-' ? ' ' + x.block.unit : '') + (x.block.refs.length ? ' (da ' + x.block.refs.map(r => Model.refLabel(r)).join('; ') + ')' : '')).join('\n'));
      pick(['chart', 'image']).forEach(x => out.push('Vedi ' + (num[x.block.id] || '') + (x.block.title ? ': ' + x.block.title : '') + (x.block.caption ? ' — ' + x.block.caption : '') + (x.block.content ? '. ' + x.block.content : '')));
    }
    else if (/analisi|analysis|discuss/.test(t)) pick(['interpretation', 'observation']).forEach(x => out.push((x.block.title ? '**' + x.block.title + '**\n\n' : '') + x.block.content));
    else if (/svilupp|development/.test(t)) Model.phasesSorted().forEach(ph => { const tx = ph.blocks.filter(b => b.type === 'text' && (b.inReport || !blocks.some(y => y.block.inReport)) && b.content); if (tx.length) out.push('### ' + ph.title + '\n\n' + tx.map(b => (b.title ? '**' + b.title + '**\n\n' : '') + b.content).join('\n\n')); });
    else if (/conclus/.test(t)) {
      const rs = blocks.filter(x => x.block.type === 'result' && x.block.value);
      out.push('[DA SCRIVERE: le conclusioni vanno scritte da te. Risultati del progetto su cui basarle:\n' + (rs.length ? rs.map(x => '- ' + x.block.name + ' = ' + x.block.value + ' ' + U.str(x.block.unit)).join('\n') : '- nessun risultato registrato') + ']');
    }
    else if (/bibliograf|referenc|fonti/.test(t)) { const src = [...new Set(blocks.map(x => U.str(x.block.source).trim()).filter(Boolean))]; if (src.length) out.push(src.map(s => '- ' + s).join('\n')); }
    else if (/allegat|appendix|annex/.test(t)) { const fs = P.files; if (fs.length) out.push(fs.map(f => '- ' + f.name + (f.description ? ' — ' + f.description : '')).join('\n')); }
    else blocks.filter(x => x.block.inReport && U.norm(x.phase.title).includes(t)).forEach(x => out.push(x.block.content || Model.blockLabel(x.block)));
    return out.filter(Boolean).join('\n\n');
  },
  markdown() {
    const P = Store.P;
    return '# ' + (P.report.title || P.info.name) + '\n\n' + (P.info.members.length ? '_' + P.info.members.join(', ') + '_\n\n' : '') + this.sorted().filter(s => U.str(s.content).trim()).map(s => '## ' + s.title + '\n\n' + s.content.trim()).join('\n\n') + '\n';
  },
  html(forPrint = false) {
    const P = Store.P;
    const div = document.createElement('div');
    div.innerHTML = '<h1>' + U.esc(P.report.title || P.info.name) + '</h1><p class="meta">' + U.esc([P.info.subject, P.info.degree, P.info.professor ? 'Docente: ' + P.info.professor : '', P.info.year].filter(Boolean).join(' · ')) + '<br>' + U.esc(P.info.members.join(', ')) + '</p>' +
      this.sorted().filter(s => U.str(s.content).trim()).map(s => '<h2>' + U.esc(s.title) + '</h2>' + U.md(s.content)).join('');
    UI.renderMath(div);
    return div.innerHTML;
  }
};
Binders['report-title'] = (el, phase) => { if (phase === 'input') { Store.P.report.title = el.value; Store.touch(); } };
Binders.report = (el, phase) => {
  const s = Report.sec(el.dataset.id);
  if (!s) return;
  const f = el.dataset.field;
  if (phase === 'input') {
    s[f] = el.value; s.updatedAt = U.nowISO();
    if (f === 'content') {
      if (s.status === 'VUOTA' && el.value.trim()) { s.status = 'BOZZA'; }
      Report._pv = Report._pv || U.debounce(v => { const pv = UI.$('[data-preview="report"]'); if (pv) { pv.innerHTML = U.md(v); UI.renderMath(pv); } }, 250);
      Report._pv(el.value);
    }
    Store.touch();
  }
  if (phase === 'change' && el._orig !== undefined && el._orig !== el.value) {
    History.version({ type: 'report', id: s.id, label: 'Relazione › ' + s.title, field: f, before: el._orig, after: el.value, origin: 'UTENTE', reason: 'Modifica diretta' });
    History.log('Modificata sezione relazione "' + s.title + '"', 'report', { coll: 'report', id: s.id });
    el._orig = el.value;
    if (f === 'title' || (f === 'content' && s.status === 'BOZZA')) App.refreshNavOnly();
  }
};
Actions['report-status'] = (d, el) => { const s = Report.sec(d.id); if (!s) return; History.version({ type: 'report', id: s.id, label: 'Relazione › ' + s.title, field: 'stato', before: s.status, after: el.value, origin: 'UTENTE' }); s.status = el.value; Store.touch(); App.refresh(); };
Actions['report-required'] = (d, el) => { const s = Report.sec(d.id); if (!s) return; s.required = el.checked; Store.touch(); App.refresh(); };
Actions['report-sec-add'] = () => UI.form({ title: 'Nuova sezione', fields: [{ key: 'title', label: 'Titolo', required: true, full: true }, { key: 'required', label: 'Obbligatoria', type: 'checkbox' }],
  onSubmit(v) { const P = Store.P; const s = Factory.reportSection(v.title, v.required, P.report.sections.length); P.report.sections.push(s); History.log('Aggiunta sezione relazione: ' + v.title, 'report'); Store.touch(); App.go('report', s.id); } });
Actions['report-sec-del'] = async d => {
  const P = Store.P, i = P.report.sections.findIndex(s => s.id === d.id);
  if (i < 0) return;
  const s = P.report.sections[i];
  if (!(await UI.confirm('Eliminare la sezione "' + s.title + '"' + (s.content ? ' (' + U.words(s.content) + ' parole)' : '') + '?', { okLabel: 'Elimina', danger: true }))) return;
  P.report.sections.splice(i, 1);
  History.version({ type: 'report', id: s.id, label: 'Relazione › ' + s.title + ' (eliminata)', field: 'content', before: s.content, after: '', origin: 'UTENTE', reason: 'Sezione eliminata' });
  App.ui.repSec = null; Store.touch(); App.go('report');
  UI.toast('Sezione eliminata', 'info', { actionLabel: 'Annulla', onAction: () => { P.report.sections.splice(i, 0, s); Store.touch(); App.go('report', s.id); } });
};
Actions['report-sec-move'] = d => {
  const secs = Report.sorted(), i = secs.findIndex(s => s.id === d.id), j = i + Number(d.dir);
  if (j < 0 || j >= secs.length) return;
  [secs[i], secs[j]] = [secs[j], secs[i]];
  secs.forEach((s, k) => { s.order = k; });
  Store.touch(); App.refresh();
};
Actions['report-sec-reset'] = async () => {
  const P = Store.P;
  const have = new Set(P.report.sections.map(s => U.norm(s.title)));
  const add = C.DEFAULT_REPORT.filter(([t]) => !have.has(U.norm(t)));
  if (!add.length) return UI.toast('Tutte le sezioni standard sono già presenti');
  if (!(await UI.confirm('Aggiungere le sezioni standard mancanti (' + add.map(a => a[0]).join(', ') + ')? Le sezioni esistenti non cambiano.'))) return;
  add.forEach(([t, r]) => P.report.sections.push(Factory.reportSection(t, r, P.report.sections.length)));
  Store.touch(); App.refresh();
};
Actions['report-compose'] = async d => {
  const s = Report.sec(d.id);
  if (!s) return;
  const txt = Report.compose(s);
  if (!txt) return UI.toast('Nel progetto non ci sono dati utilizzabili per la sezione "' + s.title + '"', 'err');
  const m = UI.modal({ title: 'Componi da progetto: ' + s.title, size: 'wide', body: '<p class="small muted mb">Bozza costruita solo con dati presenti nel progetto. Verrà <b>aggiunta in fondo</b> al testo attuale: rielaborala con parole tue.</p><div class="grid g2"><textarea class="tall mono" data-compose>' + U.esc(txt) + '</textarea><div class="rep-preview md">' + U.md(txt) + '</div></div>',
    footer: '<button class="btn" data-x>Annulla</button><button class="btn primary" data-ok>Aggiungi alla sezione</button>' });
  UI.renderMath(m.el);
  m.el.querySelector('[data-x]').onclick = () => m.close();
  m.el.querySelector('[data-ok]').onclick = () => {
    const add = m.el.querySelector('[data-compose]').value;
    const before = s.content;
    s.content = (s.content.trim() ? s.content.trim() + '\n\n' : '') + add;
    if (s.status === 'VUOTA') s.status = 'BOZZA';
    History.version({ type: 'report', id: s.id, label: 'Relazione › ' + s.title, field: 'content', before, after: s.content, origin: 'CONTROLLO AUTOMATICO', reason: 'Composta da dati del progetto' });
    Store.touch(); m.close(); App.refresh();
  };
};
Actions['report-insert-ref'] = d => {
  const s = Report.sec(d.id);
  if (!s) return;
  const num = Model.numbering().map;
  const opts = [];
  Model.allBlocks().forEach(({ block: b }) => {
    if (b.type === 'result' && b.name) opts.push([b.name + ' = ' + b.value + (b.unit && b.unit !== '-' ? ' ' + b.unit : ''), 'Risultato: ' + b.name + ' = ' + b.value + ' ' + U.str(b.unit)]);
    if (b.type === 'calc' && b.resultName) opts.push([b.resultName + ' = ' + (b.statedResult || U.fmtNum(b.computed)) + (b.unit ? ' ' + b.unit : ''), 'Calcolo: ' + b.resultName]);
    if (num[b.id] && ['table', 'chart', 'image', 'formula'].includes(b.type)) opts.push([num[b.id] + (b.type === 'formula' ? ': $' + b.latex + '$' : ''), num[b.id] + (b.title ? ' — ' + b.title : '')]);
  });
  if (!opts.length) return UI.toast('Nessun risultato, tabella o grafico nel progetto', 'err');
  UI.form({ title: 'Inserisci dato del progetto', intro: '<p class="small muted">Il testo viene inserito alla posizione del cursore (o in fondo) con gli stessi valori del progetto.</p>', fields: [{ key: 'v', label: 'Elemento', type: 'select', options: opts }], submitLabel: 'Inserisci',
    onSubmit(v) {
      const ta = UI.$('#sec-content');
      const pos = ta && document.activeElement !== ta && Report._caret !== undefined ? Report._caret : (ta ? ta.selectionStart : s.content.length);
      const before = s.content;
      s.content = s.content.slice(0, pos) + v.v + s.content.slice(pos);
      History.version({ type: 'report', id: s.id, label: 'Relazione › ' + s.title, field: 'content', before, after: s.content, origin: 'UTENTE', reason: 'Inserito dato del progetto' });
      if (s.status === 'VUOTA') s.status = 'BOZZA';
      Store.touch(); App.refresh();
    } });
};
Actions['report-issues'] = () => { App.ui.checkTab = 'issues'; App.ui.issueStatus = 'active'; App.ui.issueCat = ''; App.go('checks'); };
Actions['report-export'] = d => {
  const P = Store.P, name = U.slug(P.report.title || P.info.name);
  if (d.fmt === 'md') return U.download(name + '-relazione.md', Report.markdown(), 'text/markdown;charset=utf-8');
  const doc = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>' + U.esc(P.report.title || P.info.name) + '</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"><style>body{font:16px/1.6 Georgia,serif;max-width:820px;margin:40px auto;padding:0 20px;color:#111}h1{font-size:28px}h2{margin-top:32px;border-bottom:1px solid #ccc;padding-bottom:4px}table{border-collapse:collapse;margin:10px 0}td,th{border:1px solid #999;padding:4px 8px}.meta{color:#555}.math-raw{font-family:monospace}</style></head><body>' + Report.html() + '</body></html>';
  U.download(name + '-relazione.html', doc, 'text/html;charset=utf-8');
};
Actions['report-print'] = () => App.print(Report.html(true));
Actions['report-snapshot'] = () => UI.form({ title: 'Salva versione della relazione', fields: [{ key: 'label', label: 'Etichetta', required: true, full: true, placeholder: 'es. Versione per revisione del 20/11' }],
  onSubmit(v) { const P = Store.P; P.report.snapshots = U.arr(P.report.snapshots); P.report.snapshots.unshift({ at: U.nowISO(), label: v.label, words: Metrics.reportProgress().words, title: P.report.title, sections: U.clone(P.report.sections) }); History.log('Salvata versione relazione: ' + v.label, 'report'); Store.touch(); App.refresh(); } });
Actions['report-snap-view'] = d => {
  const s = U.arr(Store.P.report.snapshots)[+d.i];
  if (!s) return;
  const m = UI.modal({ title: 'Versione: ' + s.label, size: 'wide', body: '<p class="small muted mb">' + U.fmtDateTime(s.at) + '</p><div class="md">' + s.sections.slice().sort((a, b) => a.order - b.order).filter(x => x.content).map(x => '<h2>' + U.esc(x.title) + '</h2>' + U.md(x.content)).join('') + '</div>' });
  UI.renderMath(m.el);
};
Actions['report-snap-restore'] = async d => {
  const P = Store.P, s = U.arr(P.report.snapshots)[+d.i];
  if (!s || !(await UI.confirm('Ripristinare la versione "' + s.label + '"? La relazione attuale verrà prima salvata come nuova versione.'))) return;
  P.report.snapshots.unshift({ at: U.nowISO(), label: 'Prima del ripristino di "' + s.label + '"', words: Metrics.reportProgress().words, title: P.report.title, sections: U.clone(P.report.sections) });
  P.report.sections = U.clone(s.sections);
  History.log('Ripristinata versione relazione: ' + s.label, 'report');
  Store.touch(); App.ui.repSec = null; App.refresh();
};
Actions['report-snap-del'] = async d => { const P = Store.P; if (!(await UI.confirm('Eliminare questa versione salvata?', { danger: true, okLabel: 'Elimina' }))) return; P.report.snapshots.splice(+d.i, 1); Store.touch(); App.refresh(); };
Actions['report-prompt'] = () => {
  const P = Store.P;
  const secs = Report.sorted();
  UI.form({ title: 'PREPARA PROMPT RELAZIONE', size: 'wide', intro: '<p class="small muted">Raccoglie automaticamente dati, consegna, indicazioni del professore, linee guida, fasi, risultati e numerazione di tabelle/grafici in un prompt ordinato. Esegui prima il Project Checker.</p>' +
    (Metrics.openIssues('PROBABILE ERRORE').length ? '<p class="small" style="color:var(--warn)">⚠ Ci sono ' + Metrics.openIssues('PROBABILE ERRORE').length + ' errori probabili/critici aperti: la relazione potrebbe riportarli.</p>' : ''),
    fields: [{ key: 'language', label: 'Lingua della relazione', type: 'select', options: ['Italiano', 'English'] }, { key: 'style', label: 'Registro', type: 'select', options: ['accademico', 'tecnico', 'sintetico'] },
      { key: 'sections', label: 'Sezioni da generare', type: 'multiselect', options: secs.map(s => [s.id, s.title + (s.required ? ' *' : '')]) }],
    value: { language: (/english|inglese/i.test(P.info.subject + P.info.degree + P.brief.original.slice(0, 400)) || P.report.sections.some(s => /^(summary|value chain|conclusions|bibliography)$/i.test(s.title))) ? 'English' : 'Italiano', style: 'accademico', sections: secs.map(s => s.id) }, submitLabel: 'Genera prompt',
    onSubmit(v) {
      const text = AI.buildReportPrompt({ language: v.language, style: v.style, sectionIds: v.sections.length ? v.sections : null });
      History.log('Preparato prompt relazione per Claude', 'claude');
      Store.touch();
      setTimeout(() => showPackage('Prompt relazione', text), 50);
    } });
};

/* =====================================================================
   CLAUDE — pacchetti, importazione, proposte
   ===================================================================== */
function showPackage(title, text) {
  const m = UI.modal({ title, size: 'wide', body: '<p class="small muted mb">' + text.length.toLocaleString('it-IT') + ' caratteri (~' + Math.round(text.length / 3.8).toLocaleString('it-IT') + ' token). Copia e incolla in Claude. Nessun dato lascia il browser finché non lo copi tu.</p><textarea class="tall mono" style="min-height:52vh" readonly data-pkg>' + U.esc(text) + '</textarea>',
    footer: '<button class="btn" data-dl>Scarica .txt</button><button class="btn" data-x>Chiudi</button><button class="btn primary" data-copy>Copia negli appunti</button>' });
  m.el.querySelector('[data-copy]').onclick = async () => { const ta = m.el.querySelector('[data-pkg]'); const ok = await U.copy(text); if (!ok) { ta.focus(); ta.select(); } UI.toast(ok ? 'Copiato: ora incollalo in Claude' : 'Seleziona il testo e copialo manualmente (Ctrl/Cmd+C)', ok ? 'info' : 'err'); };
  m.el.querySelector('[data-dl]').onclick = () => U.download(U.slug(title) + '.txt', text);
  m.el.querySelector('[data-x]').onclick = () => m.close();
}
Actions['claude-prepare'] = d => {
  const task = d.task || 'review';
  const t = AI.TASKS[task] || AI.TASKS.free;
  const m = UI.form({ title: 'PREPARA PER CLAUDE', size: 'wide', intro: '<p class="small muted">Scegli cosa includere: l\'app genera un testo strutturato con le istruzioni (gerarchia delle fonti, divieto di inventare dati) e il formato di risposta da reimportare.</p>',
    fields: [{ key: 'task', label: 'Cosa chiedere a Claude', type: 'select', options: Object.entries(AI.TASKS).map(([k, x]) => [k, x.label]), full: true },
      { key: 'sections', label: 'Informazioni da includere', type: 'multiselect', options: AI.SECTIONS },
      { key: 'fullExamples', label: 'Includi il testo completo degli esempi (pacchetto più lungo)', type: 'checkbox' },
      { key: 'request', label: 'Richiesta aggiuntiva (facoltativa)', type: 'textarea', rows: 3, placeholder: 'es. Concentrati sulla fase di simulazione; il professore vuole lo scenario TO-BE con almeno 2 alternative' }],
    value: { task, sections: t.defaults }, submitLabel: 'Genera pacchetto',
    onSubmit(v) {
      if (!v.sections.length) throw new Error('Seleziona almeno una sezione');
      const text = AI.buildPackage(v);
      History.log('Preparato pacchetto per Claude: ' + AI.TASKS[v.task].label, 'claude');
      Store.touch();
      setTimeout(() => showPackage('Pacchetto per Claude — ' + AI.TASKS[v.task].label, text), 50);
    } });
  const sel = m.el.querySelector('select[data-key="task"]');
  sel.addEventListener('change', () => { const def = AI.TASKS[sel.value].defaults; UI.$$('[data-key="sections"] input', m.el).forEach(c => { c.checked = def.includes(c.value); }); });
};
Actions['claude-import'] = d => {
  UI.form({ title: 'IMPORTA RISPOSTA CLAUDE', size: 'wide', intro: '<p class="small muted">Incolla la risposta di Claude. Verrà divisa in <b>PROPOSTE</b>: niente viene applicato finché non scegli ACCETTA per ogni elemento.</p>',
    fields: [{ key: 'kind', label: 'Tipo di risposta', type: 'select', options: [['auto', 'Rileva automaticamente'], ['guidelines', 'Linee guida'], ['phases', 'Fasi operative'], ['review', 'Osservazioni / errori'], ['questions', 'Domande per il professore'], ['report', 'Relazione (sezioni ## …)'], ['generic', 'Testo generico']] },
      { key: 'text', label: 'Risposta di Claude', type: 'textarea', rows: 16, required: true }],
    value: { kind: d.kind || 'auto' }, submitLabel: 'Analizza risposta',
    onSubmit(v) {
      const res = AI.parseResponse(v.text, v.kind);
      const P = Store.P;
      const batch = { id: U.uid('prop'), at: U.nowISO(), kind: res.kind, raw: v.text, items: res.items };
      P.proposals.unshift(batch);
      if (res.kind === 'report') { P.report.imports = U.arr(P.report.imports); P.report.imports.unshift({ at: batch.at, text: v.text }); }
      History.log('Importata risposta Claude (' + res.kind + '): ' + U.plural(res.items.length, 'proposta', 'proposte'), 'claude');
      Store.touch();
      App.ui.claudeTab = 'proposals';
      App.go('claude', batch.id);
      UI.toast(U.plural(res.items.length, 'proposta da valutare', 'proposte da valutare'));
    } });
};
const KIND_LABEL = { guidelines: 'Linee guida', phases: 'Fasi', review: 'Osservazioni', questions: 'Domande', report: 'Relazione', generic: 'Testo' };
const ITEM_LABEL = { guideline: 'Linea guida', phase: 'Fase', issue: 'Osservazione / possibile errore', question: 'Domanda', reportSection: 'Sezione relazione', text: 'Testo' };
const Claude = {
  find(bid, iid) { const b = Store.P.proposals.find(x => x.id === bid); return b ? { batch: b, item: b.items.find(x => x.id === iid) } : {}; },
  preview(it) {
    const f = it.fields;
    const kv = (k, v) => v ? '<p class="small mt-s"><b>' + k + ':</b> ' + U.esc(v) + '</p>' : '';
    switch (it.type) {
      case 'guideline': return kv('Descrizione', f.description) + kv('Motivazione', f.motivation) + kv('Fonte indicata da Claude', f.claimedSource ? H.srcLabel(f.claimedSource) : '') + kv('Riferimento', f.reference) + '<div class="row mt-s">' + UI.badge(f.priority) + (f.mandatory ? UI.badge('obbligatoria', 'risk') : '') + '</div>';
      case 'phase': return kv('Descrizione', f.description) + kv('Linee guida collegate', f.guidelines.join('; ')) + (f.checklist.length ? '<ul class="small mt-s">' + f.checklist.map(c => '<li>□ ' + U.esc(c) + '</li>').join('') + '</ul>' : '');
      case 'issue': return kv('Elemento', f.element) + kv('Problema', f.problem) + kv('Motivo', f.reason) + kv('Suggerimento', f.suggestion) + '<div class="row mt-s">' + UI.badge(f.severity) + '<span class="small">affidabilità ' + f.confidence + '%</span></div>';
      case 'question': return '<div class="row mt-s">' + (f.topic ? '<span class="badge outline">' + U.esc(f.topic) + '</span>' : '') + UI.badge(f.priority) + '</div>';
      case 'reportSection': { const ex = Store.P.report.sections.find(s => U.norm(s.title) === U.norm(it.title)); return '<p class="small mt-s">' + (ex ? 'Sostituirà il testo della sezione esistente "' + U.esc(ex.title) + '" (' + U.words(ex.content) + ' parole attuali, conservate nella cronologia).' : 'Creerà una nuova sezione.') + '</p><details class="exp mt-s"><summary class="small">Testo (' + U.words(f.content) + ' parole)</summary><div class="exp-body md">' + U.md(f.content) + '</div></details>'; }
      default: return '<details class="exp mt-s" open><summary class="small">Contenuto</summary><div class="exp-body md">' + U.md(f.content) + '</div></details>';
    }
  },
  accept(batch, it, fields) {
    const P = Store.P;
    const f = Object.assign({}, it.fields, fields || {});
    const title = (fields && fields.title) || it.title;
    let msg = '';
    if (it.type === 'guideline') {
      const g = Object.assign(Factory.guideline(), { title, description: f.description, motivation: f.motivation, priority: f.priority, mandatory: !!f.mandatory, source: f.source || 'AI',
        sourceRef: 'Proposta di Claude del ' + U.fmtDate(batch.at) + (f.claimedSource ? ' · fonte indicata da Claude: ' + H.srcLabel(f.claimedSource) : '') + (f.reference ? ' — «' + f.reference + '»' : '') });
      P.guidelines.push(g);
      History.version({ type: 'guidelines', id: g.id, label: g.title, field: 'creazione', before: '', after: g.title + '\n' + g.description, origin: 'CLAUDE', reason: 'Proposta accettata' });
      msg = 'Linea guida aggiunta (fonte: Suggerimento AI, verificala)';
    } else if (it.type === 'phase') {
      const ph = Factory.phase(P.phases.length, title);
      ph.description = f.description || '';
      ph.checklist = U.arr(f.checklist).map(t => Factory.checkItem(t));
      P.phases.push(ph);
      U.arr(f.guidelines).forEach(gt => { const g = P.guidelines.find(x => U.norm(x.title) === U.norm(gt)); if (g && !g.phaseId) g.phaseId = ph.id; });
      History.version({ type: 'phases', id: ph.id, label: 'Fase: ' + ph.title, field: 'creazione', before: '', after: ph.title, origin: 'CLAUDE', reason: 'Proposta accettata' });
      msg = 'Fase creata';
    } else if (it.type === 'issue') {
      P.issues.push({ id: U.uid('iss'), fp: U.hash('claude' + title + f.problem), rule: 'claude', ruleName: 'Revisione di Claude', group: 'claude', date: U.nowISO(), lastSeen: U.nowISO(), category: 'OSSERVAZIONE CLAUDE', element: f.element || title, ref: null,
        problem: f.problem || title, reason: f.reason, source: 'Suggerimento AI (livello 7 della gerarchia)', confidence: U.clamp(+f.confidence || 50, 0, 100), suggestion: f.suggestion, severity: f.severity, status: 'APERTO', decision: '', correction: '', notes: '', origin: 'CLAUDE', resolvedAt: null });
      msg = 'Aggiunta all\'error log come possibile errore';
    } else if (it.type === 'question') {
      P.questions.push(Object.assign(Factory.question(), { text: title, topic: f.topic, priority: f.priority }));
      msg = 'Domanda aggiunta';
    } else if (it.type === 'reportSection') {
      let s = P.report.sections.find(x => U.norm(x.title) === U.norm(title));
      if (!s) { s = Factory.reportSection(title, false, P.report.sections.length); P.report.sections.push(s); }
      History.version({ type: 'report', id: s.id, label: 'Relazione › ' + s.title, field: 'content', before: s.content, after: f.content, origin: 'CLAUDE', reason: 'Proposta di Claude accettata' });
      s.content = f.content; s.status = 'BOZZA'; s.updatedAt = U.nowISO();
      msg = 'Sezione "' + s.title + '" aggiornata: esegui il controllo di coerenza';
    } else {
      P.claudeNotes.unshift({ id: U.uid('cn'), at: U.nowISO(), title, content: f.content });
      msg = 'Salvato nelle note di Claude';
    }
    it.status = 'ACCETTATA'; it.decidedAt = U.nowISO();
    History.log('Proposta Claude accettata: ' + ITEM_LABEL[it.type] + ' "' + U.truncate(title, 50) + '"', 'claude');
    Store.touch();
    return msg;
  },
  editFields(it) {
    const f = it.fields;
    switch (it.type) {
      case 'guideline': return { fields: [{ key: 'title', label: 'Titolo', required: true, full: true }, { key: 'description', label: 'Descrizione', type: 'textarea', rows: 4 }, { key: 'motivation', label: 'Motivazione', type: 'textarea', rows: 2 },
        { key: 'source', label: 'Fonte (decidi tu)', type: 'select', options: C.SOURCES.map(s => [s.id, s.rank + ' · ' + s.label]), hint: 'Default: Suggerimento AI. Cambiala solo se hai verificato la fonte.' }, { key: 'priority', label: 'Priorità', type: 'select', options: C.PRIORITIES }, { key: 'mandatory', label: 'Obbligatoria', type: 'checkbox' }],
        value: Object.assign({ title: it.title, source: 'AI' }, f) };
      case 'phase': return { fields: [{ key: 'title', label: 'Titolo', required: true, full: true }, { key: 'description', label: 'Descrizione', type: 'textarea', rows: 3 }, { key: 'checklistText', label: 'Checklist (una voce per riga)', type: 'textarea', rows: 6 }],
        value: { title: it.title, description: f.description, checklistText: U.arr(f.checklist).join('\n') }, map: v => ({ title: v.title, description: v.description, checklist: v.checklistText.split('\n').map(s => s.trim()).filter(Boolean) }) };
      case 'issue': return { fields: [{ key: 'title', label: 'Titolo', full: true }, { key: 'element', label: 'Elemento', full: true }, { key: 'problem', label: 'Problema', type: 'textarea', rows: 2 }, { key: 'reason', label: 'Motivo', type: 'textarea', rows: 2 }, { key: 'suggestion', label: 'Suggerimento', type: 'textarea', rows: 2 }, { key: 'severity', label: 'Gravità', type: 'select', options: C.SEVERITY }, { key: 'confidence', label: 'Affidabilità', type: 'number' }], value: Object.assign({ title: it.title }, f) };
      case 'question': return { fields: [{ key: 'title', label: 'Domanda', type: 'textarea', rows: 3, required: true }, { key: 'topic', label: 'Argomento' }, { key: 'priority', label: 'Priorità', type: 'select', options: C.PRIORITIES }], value: Object.assign({ title: it.title }, f) };
      case 'reportSection': return { fields: [{ key: 'title', label: 'Sezione', required: true, full: true, hint: 'Deve coincidere con il titolo di una sezione per sostituirla' }, { key: 'content', label: 'Testo', type: 'textarea', rows: 18 }], value: { title: it.title, content: f.content } };
      default: return { fields: [{ key: 'title', label: 'Titolo', full: true }, { key: 'content', label: 'Contenuto', type: 'textarea', rows: 14 }], value: { title: it.title, content: f.content } };
    }
  }
};
Views.claude = {
  title: 'Claude', icon: '✦',
  render(params) {
    const P = Store.P;
    if (params.id && P.proposals.some(b => b.id === params.id)) App.ui.claudeTab = 'proposals';
    const tab = App.ui.claudeTab || 'proposals';
    const pending = P.proposals.reduce((a, b) => a + b.items.filter(i => i.status === 'PROPOSTA').length, 0);
    let h = H.head('Lavoro con Claude', 'Flusso: <b>PREPARA PER CLAUDE</b> → copi in Claude → <b>IMPORTA RISPOSTA</b> → valuti ogni proposta. Nessuna proposta viene applicata in automatico e un suggerimento AI non ha mai priorità sulle indicazioni del professore.',
      '<button class="btn primary" data-action="claude-prepare">PREPARA PER CLAUDE</button><button class="btn" data-action="report-prompt">PREPARA PROMPT RELAZIONE</button><button class="btn" data-action="claude-import">IMPORTA RISPOSTA CLAUDE</button>');
    h += tabsHTML([['proposals', 'Proposte', pending || ''], ['notes', 'Note salvate', P.claudeNotes.length || ''], ['guide', 'Come usarlo']], tab, 'claude-tab');
    if (tab === 'guide') return h + H.card('Flusso consigliato', '<ol class="stack s" style="padding-left:20px;margin:0"><li><b>Linee guida</b>: Prepara per Claude → "Genera linee guida" (consegna + indicazioni + esempi). Importa e accetta solo ciò che è corretto: entrano con fonte "Suggerimento AI".</li><li><b>Piano di lavoro</b>: "Trasforma le linee guida in fasi", oppure "Crea fasi" dalla sezione Linee guida.</li><li><b>Revisione critica</b>: "Revisione critica del progetto": le osservazioni accettate finiscono nell\'error log come possibili errori.</li><li><b>Domande</b>: Claude può suggerire domande per il professore.</li><li><b>Relazione</b>: PREPARA PROMPT RELAZIONE → Claude → Importa (sezioni "## Titolo") → Controlla coerenza → revisione manuale → versione finale.</li></ol><p class="small muted mt">I pacchetti contengono solo i dati che selezioni. I dati lasciano il browser solo quando li copi tu.</p>');
    if (tab === 'notes') return h + (P.claudeNotes.length ? '<div class="stack">' + P.claudeNotes.map(n => '<article class="card"><div class="row between"><div><h3>' + U.esc(n.title) + '</h3><span class="tiny muted">' + U.fmtDateTime(n.at) + '</span></div><button class="btn xs danger" data-action="claude-note-del" data-id="' + n.id + '">Elimina</button></div><div class="mt-s">' + H.md(n.content) + '</div></article>').join('') + '</div>' : UI.empty('Nessuna nota', 'Le proposte "salvate come nota" compaiono qui.'));
    if (!P.proposals.length) return h + UI.empty('Nessuna proposta', 'Importa una risposta di Claude per valutarla qui.', '<button class="btn primary" data-action="claude-import">Importa risposta</button>');
    h += '<div class="stack l">' + P.proposals.map(b => {
      const pend = b.items.filter(i => i.status === 'PROPOSTA').length;
      return '<section id="item-' + b.id + '"><div class="row between mb"><div class="row"><h2>' + U.esc(KIND_LABEL[b.kind] || b.kind) + '</h2><span class="small muted">importata il ' + U.fmtDateTime(b.at) + ' · ' + b.items.length + ' elementi · ' + pend + ' da valutare</span></div><div class="btn-group">' +
        (pend ? '<button class="btn xs" data-action="claude-reject-rest" data-id="' + b.id + '">Rifiuta le rimanenti</button>' : '') + '<button class="btn xs" data-action="claude-raw" data-id="' + b.id + '">Testo originale</button><button class="btn xs danger" data-action="claude-batch-del" data-id="' + b.id + '">Elimina</button></div></div>' +
        '<div class="stack">' + b.items.map(it => '<article class="proposal st-' + it.status.toLowerCase() + '"><div class="row between top"><div class="grow"><div class="row"><b style="letter-spacing:.04em;color:var(--violet)">PROPOSTA CLAUDE</b><span class="badge outline">' + U.esc(ITEM_LABEL[it.type]) + '</span>' + UI.badge(it.status) + '</div><h3 class="mt-s">' + U.esc(it.title) + '</h3>' + Claude.preview(it) + '</div>' +
          (it.status === 'PROPOSTA' ? '<div class="btn-group" style="flex-direction:column;align-items:stretch"><button class="btn sm ok" data-action="claude-accept" data-b="' + b.id + '" data-i="' + it.id + '">ACCETTA</button><button class="btn sm" data-action="claude-modify" data-b="' + b.id + '" data-i="' + it.id + '">MODIFICA</button><button class="btn sm danger" data-action="claude-reject" data-b="' + b.id + '" data-i="' + it.id + '">RIFIUTA</button><button class="btn sm" data-action="claude-note" data-b="' + b.id + '" data-i="' + it.id + '">SALVA COME NOTA</button></div>' : '<button class="btn xs" data-action="claude-undo" data-b="' + b.id + '" data-i="' + it.id + '"' + (it.status === 'ACCETTATA' ? ' disabled title="Già applicata: modificala nella sua sezione"' : '') + '>Rimetti in valutazione</button>') + '</div></article>').join('') + '</div></section>';
    }).join('') + '</div>';
    return h;
  },
  mount(root, params) { if (params.id) { const el = document.getElementById('item-' + params.id); if (el) el.scrollIntoView({ block: 'start' }); } }
};
Actions['claude-tab'] = d => { App.ui.claudeTab = d.tab; App.go('claude'); };
Actions['claude-accept'] = d => {
  const { batch, item } = Claude.find(d.b, d.i);
  if (!item) return;
  const msg = Claude.accept(batch, item);
  App.refresh();
  UI.toast(msg, 'info', item.type === 'reportSection' ? { actionLabel: 'Controlla coerenza', onAction: () => Actions['checker-run-report']() } : {});
};
Actions['claude-modify'] = d => {
  const { batch, item } = Claude.find(d.b, d.i);
  if (!item) return;
  const ef = Claude.editFields(item);
  UI.form({ title: 'Modifica e accetta: ' + ITEM_LABEL[item.type], size: 'wide', fields: ef.fields, value: ef.value, submitLabel: 'Accetta con modifiche',
    onSubmit(v) { const vals = ef.map ? ef.map(v) : v; const msg = Claude.accept(batch, item, vals); item.edited = true; App.refresh(); UI.toast(msg); } });
};
Actions['claude-reject'] = d => { const { item } = Claude.find(d.b, d.i); if (!item) return; item.status = 'RIFIUTATA'; item.decidedAt = U.nowISO(); History.log('Proposta Claude rifiutata: "' + U.truncate(item.title, 50) + '"', 'claude'); Store.touch(); App.refresh(); };
Actions['claude-note'] = d => {
  const { item } = Claude.find(d.b, d.i);
  if (!item) return;
  const f = item.fields;
  const content = f.content || Object.entries(f).filter(([, v]) => v && (typeof v === 'string' || Array.isArray(v))).map(([k, v]) => '**' + k + '**: ' + (Array.isArray(v) ? v.join('; ') : v)).join('\n\n');
  Store.P.claudeNotes.unshift({ id: U.uid('cn'), at: U.nowISO(), title: item.title, content });
  item.status = 'NOTA'; item.decidedAt = U.nowISO();
  Store.touch(); App.refresh(); UI.toast('Salvata come nota');
};
Actions['claude-undo'] = d => { const { item } = Claude.find(d.b, d.i); if (!item || item.status === 'ACCETTATA') return; item.status = 'PROPOSTA'; Store.touch(); App.refresh(); };
Actions['claude-reject-rest'] = d => { const b = Store.P.proposals.find(x => x.id === d.id); if (!b) return; b.items.forEach(i => { if (i.status === 'PROPOSTA') i.status = 'RIFIUTATA'; }); Store.touch(); App.refresh(); };
Actions['claude-raw'] = d => { const b = Store.P.proposals.find(x => x.id === d.id); if (!b) return; UI.modal({ title: 'Testo originale importato', size: 'wide', body: '<textarea class="tall mono" style="min-height:60vh" readonly>' + U.esc(b.raw) + '</textarea>' }); };
Actions['claude-batch-del'] = async d => { const P = Store.P; if (!(await UI.confirm('Eliminare questo gruppo di proposte? Gli elementi già accettati restano nel progetto.', { danger: true, okLabel: 'Elimina' }))) return; P.proposals = P.proposals.filter(b => b.id !== d.id); Store.touch(); App.refresh(); };
Actions['claude-note-del'] = async d => { const P = Store.P; if (!(await UI.confirm('Eliminare la nota?', { danger: true, okLabel: 'Elimina' }))) return; P.claudeNotes = P.claudeNotes.filter(n => n.id !== d.id); Store.touch(); App.refresh(); };

/* =====================================================================
   CRONOLOGIA (attività + versioni)
   ===================================================================== */
const Restore = {
  can(v) {
    if (v.type === 'report') return !!Report.sec(v.elementId) && v.field !== 'stato';
    if (v.type === 'block') return !!Model.findBlock(v.elementId) && (v.rawBefore || ['content', 'latex', 'expression', 'statedResult', 'value', 'name', 'unit', 'resultName', 'stato'].includes(v.field));
    if (v.type === 'phases') return !!Model.get('phases', v.elementId) && v.field !== 'creazione';
    if (v.type === 'info') return !!v.rawBefore;
    if (v.type === 'synthesis') return true;
    if (['guidelines', 'profNotes', 'examples', 'deadlines', 'revisions', 'tasks', 'questions'].includes(v.type)) return !!Model.get(v.type, v.elementId) && !!v.rawBefore;
    return false;
  },
  apply(v) {
    const P = Store.P;
    const reason = 'Ripristino della versione del ' + U.fmtDateTime(v.at);
    if (v.type === 'report') { const s = Report.sec(v.elementId); History.version({ type: 'report', id: s.id, label: v.label, field: v.field, before: s[v.field], after: v.before, origin: 'UTENTE', reason }); s[v.field] = v.before; }
    else if (v.type === 'block') {
      const b = Model.findBlock(v.elementId).block;
      if (v.rawBefore && typeof v.rawBefore === 'object' && !Array.isArray(v.rawBefore) && v.field !== 'blocco') { History.version({ type: 'block', id: b.id, label: v.label, field: v.field, before: { columns: b.columns, rows: b.rows }, after: v.rawBefore, origin: 'UTENTE', reason }); Object.assign(b, U.clone(v.rawBefore)); }
      else { const key = v.field === 'stato' ? 'status' : v.field; History.version({ type: 'block', id: b.id, label: v.label, field: v.field, before: b[key], after: v.before, origin: 'UTENTE', reason }); b[key] = v.before; }
    }
    else if (v.type === 'phases') { const ph = Model.get('phases', v.elementId); History.version({ type: 'phases', id: ph.id, label: v.label, field: v.field, before: ph[v.field], after: v.before, origin: 'UTENTE', reason }); ph[v.field] = v.before; }
    else if (v.type === 'info') { const keys = Object.keys(v.rawBefore); History.version({ type: 'info', id: P.id, label: 'Dati del progetto', field: keys.join(', '), before: Object.fromEntries(keys.map(k => [k, P.info[k]])), after: v.rawBefore, origin: 'UTENTE', reason }); Object.assign(P.info, U.clone(v.rawBefore)); }
    else if (v.type === 'synthesis') { History.version({ type: 'synthesis', id: 'synthesis', label: v.label, field: 'testo', before: P.examplesSynthesis, after: v.before, origin: 'UTENTE', reason }); P.examplesSynthesis = v.before; }
    else Model.update(v.type, v.elementId, U.clone(v.rawBefore), { reason, origin: 'UTENTE' });
    History.log('Ripristinata versione: ' + v.label, 'history');
    Store.touch();
  }
};
Views.history = {
  title: 'Cronologia', icon: '↺',
  render(params) {
    const P = Store.P;
    const tab = App.ui.histTab || 'activity';
    let h = H.head('Cronologia', 'Registro delle attività e versioni precedenti degli elementi modificati, con origine della modifica.', '<button class="btn" data-action="export-history">Esporta CSV</button>');
    h += tabsHTML([['activity', 'Attività', P.activity.length], ['versions', 'Versioni', P.history.length]], tab, 'hist-tab');
    const q = U.norm(App.ui.histQ || '');
    h += '<div class="card mb"><div class="row"><label class="lbl" for="hist-q">Filtra</label><input id="hist-q" type="search" style="max-width:340px" value="' + U.attr(App.ui.histQ || '') + '" data-bind="hist-q" placeholder="Testo da cercare…">' +
      (tab === 'versions' ? '<span class="lbl">Origine</span>' + UI.select('data-change="hist-origin" aria-label="Origine"', [['', 'Tutte']].concat(C.ORIGINS.map(o => [o, o])), App.ui.histOrigin || '') : '') + '</div></div>';
    if (tab === 'activity') {
      const list = P.activity.filter(a => !q || U.norm(a.text).includes(q)).slice(0, 400);
      if (!list.length) return h + UI.empty('Nessuna attività', '');
      let day = '', out = '<div class="card"><div class="log">';
      list.forEach(a => {
        const d = U.isoToLocalDate(a.at);
        if (d !== day) { day = d; out += '<div class="log-day">' + (d === U.todayISO() ? 'Oggi' : d === U.addDays(U.todayISO(), -1) ? 'Ieri' : U.fmtDate(d)) + '</div>'; }
        out += '<div class="log-item"><span class="log-time">' + U.fmtTime(a.at) + '</span><span>' + U.esc(a.text) + '</span></div>';
      });
      return h + out + '</div></div>';
    }
    const og = App.ui.histOrigin || '';
    const list = P.history.filter(v => (!og || v.origin === og) && (!q || U.norm(v.label + ' ' + v.field + ' ' + v.reason).includes(q))).slice(0, 400);
    if (!list.length) return h + UI.empty('Nessuna versione', 'Le modifiche importanti (contenuti, linee guida, relazione, dati del progetto…) vengono registrate qui.');
    return h + '<div class="table-wrap"><table class="tbl"><tr><th>Data</th><th>Elemento</th><th>Campo</th><th>Origine</th><th>Motivo</th><th></th></tr>' + list.map(v => '<tr><td class="nowrap small">' + U.fmtDateTime(v.at) + '</td><td>' + U.esc(v.label) + '</td><td class="small">' + U.esc(v.field) + '</td><td>' + UI.badge(v.origin, v.origin === 'CLAUDE' ? 'violet' : v.origin === 'PROFESSORE' ? 'risk' : v.origin === 'CONTROLLO AUTOMATICO' ? 'info' : '') + '</td><td class="small">' + U.esc(v.reason || '') + '</td><td><button class="btn xs" data-action="version-view" data-id="' + v.id + '">Vedi</button></td></tr>').join('') + '</table></div>';
  }
};
Binders['hist-q'] = (el, phase) => { if (phase !== 'input') return; App.ui.histQ = el.value; Views.history._d = Views.history._d || U.debounce(() => { App.refresh(); const i = UI.$('#hist-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 350); Views.history._d(); };
Actions['hist-tab'] = d => { App.ui.histTab = d.tab; App.refresh(); };
Actions['hist-origin'] = (d, el) => { App.ui.histOrigin = el.value; App.refresh(); };
Actions['version-view'] = d => {
  const v = Store.P.history.find(x => x.id === d.id);
  if (!v) return;
  const can = Restore.can(v);
  const m = UI.modal({ title: 'Versione: ' + v.label, size: 'wide', body: '<p class="small muted mb">' + U.fmtDateTime(v.at) + ' · campo: ' + U.esc(v.field) + ' · origine: ' + U.esc(v.origin) + (v.reason ? ' · motivo: ' + U.esc(v.reason) : '') + '</p>' +
    '<h4>Differenze</h4><div class="diff mt-s mb">' + U.wordDiff(v.before, v.after) + '</div><div class="grid g2"><div><h4>Versione precedente</h4><div class="diff mt-s">' + U.esc(v.before || '(vuoto)') + '</div></div><div><h4>Versione nuova</h4><div class="diff mt-s">' + U.esc(v.after || '(vuoto)') + '</div></div></div>',
    footer: (can ? '<button class="btn primary" data-restore>Ripristina versione precedente</button>' : '<span class="small muted">Ripristino non disponibile per questo elemento (eliminato o non ripristinabile)</span>') + '<button class="btn" data-x>Chiudi</button>' });
  m.el.querySelector('[data-x]').onclick = () => m.close();
  const r = m.el.querySelector('[data-restore]');
  if (r) r.onclick = async () => { if (!(await UI.confirm('Ripristinare la versione precedente? Anche il ripristino verrà registrato nella cronologia.'))) return; Restore.apply(v); m.close(); App.refresh(); UI.toast('Versione ripristinata'); };
};

/* =====================================================================
   IMPOSTAZIONI · BACKUP · ESPORTAZIONI
   ===================================================================== */
Views.settings = {
  title: 'Impostazioni', icon: '⚙',
  render() {
    const P = Store.P;
    let h = H.head('Impostazioni', 'Aspetto, backup, esportazioni, dati demo e privacy.');
    h += TeamUI.card();
    h += '<div class="grid g2" style="align-items:start"><div class="stack">';
    h += H.card('Aspetto', '<div class="field"><label for="set-theme">Tema</label>' + UI.select('id="set-theme" data-change="set-theme"', [['auto', 'Automatico (come il sistema)'], ['light', 'Chiaro'], ['dark', 'Scuro']], Store.settings.theme) + '</div>');
    h += H.card('Avvisi del progetto', '<div class="grid g2"><div class="field"><label for="set-dl">Avvisa scadenze entro (giorni)</label><input id="set-dl" type="number" min="1" max="60" data-change="set-warn" data-k="deadlineWarnDays" value="' + P.settings.deadlineWarnDays + '"></div><div class="field"><label for="set-rv">Avvisa revisioni entro (giorni)</label><input id="set-rv" type="number" min="1" max="30" data-change="set-warn" data-k="revisionWarnDays" value="' + P.settings.revisionWarnDays + '"></div></div>');
    h += H.card('Backup completo', '<p class="small muted mb">Un unico file .json con progetto, linee guida, fasi, attività, scadenze, revisioni, errori, relazione, impostazioni, cronologia e (facoltativo) i file allegati.</p><div class="btn-group"><button class="btn primary" data-action="backup-export">ESPORTA PROGETTO</button><button class="btn" data-action="backup-export" data-nofiles="1">Esporta senza file</button><button class="btn" data-action="backup-import">IMPORTA PROGETTO</button></div>');
    h += H.card('Esportazioni', '<div class="btn-group"><button class="btn sm" data-action="backup-export" data-nofiles="1">Progetto JSON</button><button class="btn sm" data-action="report-export" data-fmt="html">Relazione HTML</button><button class="btn sm" data-action="report-export" data-fmt="md">Relazione Markdown</button><button class="btn sm" data-action="report-print">Relazione → Stampa/PDF</button><button class="btn sm" data-action="export-errors" data-fmt="csv">Error log CSV</button><button class="btn sm" data-action="export-errors" data-fmt="md">Error log Markdown</button><button class="btn sm" data-action="export-checklist">Checklist</button><button class="btn sm" data-action="export-questions">Domande professore</button><button class="btn sm" data-action="export-history">Cronologia CSV</button></div><p class="small muted mt">Per un PDF usa "Stampa/PDF" e scegli "Salva come PDF" come stampante.</p>');
    h += '</div><div class="stack">';
    h += H.card('Privacy', '<p><b>Tutti i dati restano in questo browser</b>, salvati in IndexedDB sul tuo dispositivo. L\'app non ha server e non invia nulla in rete.</p><p class="small mt-s">I dati escono solo se li copi tu (es. "Prepara per Claude") o se esporti un file. Le librerie per formule e grafici vengono scaricate da una CDN pubblica, senza inviare i tuoi dati.</p><p class="small mt-s muted">Attenzione: cancellando i dati di navigazione del sito puoi perdere i progetti. Esporta regolarmente un backup.</p>');
    h += H.card('Archiviazione', '<div id="storage-info" class="small">Calcolo in corso…</div>' + (DB.isFallback ? '<p class="small mt-s" style="color:var(--risk)">IndexedDB non disponibile in questo browser/modalità: i dati sono salvati in modo limitato. Esporta spesso un backup.</p>' : ''));
    h += H.card('Progetto BPM OpsFlow', '<p class="small muted mb">Elimina tutti i progetti di questo browser (anche quelli di prova) e ricarica il progetto OpsFlow calibrato: calendario M1–M9, team e shortlist del D1, esercitazioni 1-2, esempi D4.</p><button class="btn danger" data-action="bpm-preset"' + (window.BPM_PRESET ? '' : ' disabled') + '>Riparti con il progetto OpsFlow</button>');
    h += H.card('Dati demo', '<p class="small muted mb">Un progetto dimostrativo per provare dashboard, scadenze, linee guida, fasi, errori, revisioni e relazione.</p><div class="btn-group"><button class="btn" data-action="demo-load">Carica progetto demo</button><button class="btn danger" data-action="demo-delete"' + (Store.index.some(p => p.isDemo) ? '' : ' disabled') + '>ELIMINA DATI DEMO</button></div>');
    h += H.card('Applicazione', '<p class="small">Versione ' + C.APP_VERSION + ' · ' + U.plural(Store.index.length, 'progetto', 'progetti') + ' in questo browser.</p><p class="small mt-s">Installabile come app (PWA) quando viene aperta da un indirizzo https o localhost: in Chrome/Edge usa l\'icona "Installa" nella barra degli indirizzi, in Safari "Condividi → Aggiungi alla schermata Home" o "File → Aggiungi al Dock".</p>' + (App.installPrompt ? '<button class="btn sm primary mt" data-action="pwa-install">Installa app</button>' : '') +
      '<p class="small mt-s muted">Integrazione futura con Claude API: prevista solo tramite un backend/serverless personale che custodisce la chiave. In questa versione si usa il flusso Copia → Claude → Incolla.</p>');
    h += '</div></div>';
    return h;
  },
  async mount() {
    const el = UI.$('#storage-info');
    if (!el) return;
    const e = await DB.estimate();
    const files = await DB.filesOf(Store.P.id).catch(() => []);
    const fsize = files.reduce((a, f) => a + (f.size || 0), 0);
    const jsize = new Blob([JSON.stringify(Store.P)]).size;
    el.innerHTML = 'Progetto: ' + U.fileSize(jsize) + ' di dati + ' + U.fileSize(fsize) + ' di file allegati.' + (e ? '<br>Spazio usato dal browser per questo sito: ' + U.fileSize(e.usage) + ' su ' + U.fileSize(e.quota) + ' disponibili.' : '');
  }
};
Actions['set-theme'] = async (d, el) => { Store.settings.theme = el.value; UI.applyTheme(); await Store.saveSettings(); UI.destroyCharts(); App.refresh(); };
Actions['set-warn'] = (d, el) => { const v = parseInt(el.value, 10); if (!(v >= 1 && v <= 60)) return UI.toast('Inserisci un numero tra 1 e 60', 'err'); Store.P.settings[d.k] = v; Store.touch(); };
Actions['pwa-install'] = async () => { if (!App.installPrompt) return; App.installPrompt.prompt(); await App.installPrompt.userChoice.catch(() => null); App.installPrompt = null; App.refresh(); };
Actions['export-errors'] = d => {
  const P = Store.P, list = P.issues.slice().sort((a, b) => U.str(a.date).localeCompare(U.str(b.date)));
  const name = U.slug(P.info.name) + '-error-log';
  if (d.fmt === 'csv') {
    const q = s => '"' + U.str(s).replace(/"/g, '""').replace(/\n/g, ' ') + '"';
    const rows = [['Data', 'Categoria', 'Elemento', 'Descrizione', 'Motivo', 'Gravità', 'Affidabilità', 'Stato', 'Decisione', 'Correzione effettuata', 'Note', 'Origine']].concat(list.map(i => [U.fmtDateTime(i.date), i.category, i.element, i.problem, i.reason, i.severity, i.confidence, i.status, i.decision, i.correction, i.notes, i.origin]));
    return U.download(name + '.csv', '﻿' + rows.map(r => r.map(q).join(';')).join('\n'), 'text/csv;charset=utf-8');
  }
  U.download(name + '.md', '# Error log — ' + P.info.name + '\n_Esportato il ' + U.fmtDateTime(U.nowISO()) + '_\n\n' + list.map(i => '## [' + i.severity + '] ' + i.category + '\n- **Data:** ' + U.fmtDateTime(i.date) + '\n- **Elemento:** ' + i.element + '\n- **Descrizione:** ' + i.problem + '\n- **Motivo:** ' + (i.reason || '—') + '\n- **Stato:** ' + i.status + '\n- **Decisione:** ' + (i.decision || '—') + '\n- **Correzione effettuata:** ' + (i.correction || '—') + '\n- **Note:** ' + (i.notes || '—')).join('\n\n'), 'text/markdown;charset=utf-8');
};
Actions['export-checklist'] = () => {
  const P = Store.P;
  U.download(U.slug(P.info.name) + '-checklist.md', '# Checklist — ' + P.info.name + '\n_Esportata il ' + U.fmtDateTime(U.nowISO()) + '_\n\n' + Model.phasesSorted().map(ph => '## Fase ' + (ph.order + 1) + ' — ' + ph.title + ' (' + Metrics.phaseProgress(ph).pct + '%)\n' + (ph.checklist.map(c => '- [' + (c.done ? 'x' : ' ') + '] ' + c.text).join('\n') || '- (nessun punto)') + '\n' + Model.list('tasks').filter(t => t.phaseId === ph.id).map(t => '- [' + (t.status === 'COMPLETATA' ? 'x' : ' ') + '] Attività: ' + t.title).join('\n')).join('\n\n'), 'text/markdown;charset=utf-8');
};
Actions['export-questions'] = () => {
  const P = Store.P;
  const groups = {};
  P.questions.forEach(q => { const r = Model.get('revisions', q.revisionId); const k = r ? 'Revisione del ' + U.fmtDate(r.date) : 'Da assegnare'; (groups[k] = groups[k] || []).push(q); });
  U.download(U.slug(P.info.name) + '-domande-professore.md', '# Domande per il professore — ' + P.info.name + '\n\n' + Object.entries(groups).map(([k, qs]) => '## ' + k + '\n' + qs.map(q => '- [' + (q.status === 'RISPOSTA' ? 'x' : ' ') + '] ' + q.text + ' _(' + q.priority.toLowerCase() + (q.topic ? ', ' + q.topic : '') + ')_' + (q.answer ? '\n  - **Risposta:** ' + q.answer : '')).join('\n')).join('\n\n'), 'text/markdown;charset=utf-8');
};
Actions['export-history'] = () => {
  const P = Store.P, q = s => '"' + U.str(s).replace(/"/g, '""').replace(/\n/g, ' ') + '"';
  const rows = [['Data', 'Elemento', 'Campo', 'Versione precedente', 'Versione nuova', 'Motivo', 'Origine']].concat(P.history.map(v => [U.fmtDateTime(v.at), v.label, v.field, U.truncate(v.before, 500), U.truncate(v.after, 500), v.reason, v.origin]));
  U.download(U.slug(P.info.name) + '-cronologia.csv', '﻿' + rows.map(r => r.map(q).join(';')).join('\n'), 'text/csv;charset=utf-8');
};

/* =====================================================================
   BENVENUTO (nessun progetto)
   ===================================================================== */
Views.welcome = {
  title: 'Benvenuto', icon: '',
  render() {
    return '<div class="welcome"><div class="card"><div class="brand-mark" style="width:44px;height:44px;font-size:16px;margin-bottom:14px">AP</div><h1>Assistente per il progetto universitario</h1>' +
      '<p class="mt-s muted">Ti aiuta a costruire il progetto passo dopo passo, senza costruirlo al posto tuo: consegna, indicazioni del professore, esempi, linee guida, fasi, controlli, revisioni, scadenze e relazione.</p>' +
      '<div class="flow mt">' + ['Consegna', 'Esempi', 'Analisi', 'Linee guida (Claude)', 'Revisione personale', 'Piano di lavoro', 'Sviluppo', 'Controllo errori', 'Revisione professore', 'Correzioni', 'Relazione', 'Coerenza', 'Quality check', 'Consegna finale'].map(s => '<span>' + s + '</span>').join('<i>→</i>') + '</div>' +
      '<div class="btn-group mt-l">' + (window.BPM_PRESET ? '<button class="btn primary big" data-action="bpm-preset">Carica il progetto BPM OpsFlow</button>' : '') + '<button class="btn big" data-action="project-new">Crea un nuovo progetto</button><button class="btn big" data-action="demo-load">Prova il progetto demo</button><button class="btn big" data-action="backup-import">Importa backup</button>' + (typeof MEM_ROUTE !== 'undefined' && !MEM_ROUTE && !Sync.on ? '<button class="btn big" data-action="team-setup">Collega il progetto del team</button>' : '') + '</div>' +
      '<p class="small muted mt-l">' + (Sync.on ? 'Progetto condiviso: quello che aggiungi lo vedono anche gli altri. ' : 'I dati restano solo in questo browser. ') + (DB.isFallback ? '<b style="color:var(--risk)">IndexedDB non disponibile: esporta spesso un backup.</b>' : '') + '</p></div></div>';
  }
};
