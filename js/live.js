/* =====================================================================
   LIVE — relazione che si forma mentre si lavora + Home semplificata
   - Ogni blocco di contenuto delle fasi viene assegnato a una sezione
     della relazione (automaticamente per parole chiave, oppure a mano).
   - Ogni sezione mostra: testo scritto da voi (priorità) oppure la
     BOZZA AUTOMATICA composta dai blocchi assegnati.
   - Esportazioni e stampa usano il testo "effettivo" di ogni sezione.
   ===================================================================== */
'use strict';

/* ---------- parole chiave delle sezioni: [titolo sezione, contenuti che ci vanno] ---------- */
const SECTION_KEYS = [
  [/^(summary|sintesi|sommario|abstract)$/, /\bsummary\b|\bsintesi\b|\babstract\b/],
  [/general characteristics|company description|the company and its business processes|caratteristiche generali/, /\bcompany\b|azienda|aziendal|storia|history|organigram|organi[sz]ation|organizzaz|mercato|market|competitor|concorrent|financial|finanz|bilanci|prodott|products|services|servizi|indici|ratios?\b/],
  [/supply chain/, /supply chain|fornitor|supplier|clienti\b|customers?\b|logistic/],
  [/value chain|catena del valore/, /value chain|catena del valore|primary activit|support activit|porter/],
  [/overview of the specific process|process description|descrizione del processo|process analysis/, /process description|descrizione del processo|fasi del processo|process phases|overview|\bkpi\b|indicator|performance|sipoc|lead time|cycle time|tempo di ciclo|problem/],
  [/plan of attack|piano/, /plan of attack|piano di lavoro|piano d.attacco/],
  [/software/, /software|bizagi|\bvisio\b|gestionale/],
  [/critical|critic/, /critical|critic|criticit|bottleneck|collo di bottiglia|problemi del processo|issues/],
  [/re-?engineering|to-?be solution/, /re-?engineering|to-?be solution|soluzione to-?be|proposta|improvement|miglioramento/],
  [/as-?is vs|comparison|confronto/, /confronto|comparison|compare means|as-?is vs|as is vs/],
  [/sensitiv|sensibilit/, /sensitiv|sensibilit/],
  [/conclus/, /conclus/],
  [/appendix|appendice|allegati/, /appendix|appendice|allegat/]
];
const MODEL_KEYS = [['idef0', /idef0|idef-0|nodo a-?0|node a-?0|context diagram/], ['bpmn', /bpmn|bizagi/], ['uml', /\buml\b|use case|activity diagram|diagramma dei casi|diagramma delle attivit/], ['arena', /arena|simulaz|simulation|output analyzer|run setup|create module|process module/]];

const LiveReport = {
  lang() { return Store.P.report.sections.some(s => /^(summary|conclusions|bibliography|the bpm project)$/i.test(s.title)) ? 'en' : 'it'; },
  /** numerazione gerarchica: 1. / 1.1. / 2.4.1. */
  numbers(list) {
    const out = {}, c = [0, 0, 0];
    (list || Store.P.report.sections.slice().sort((a, b) => a.order - b.order)).forEach(s => {
      if (!s.numbered) { out[s.id] = ''; return; }
      const l = Math.min(3, Math.max(1, s.level || 1));
      c[l - 1]++; for (let k = l; k < 3; k++) c[k] = 0;
      out[s.id] = c.slice(0, l).join('.') + '.';
    });
    return out;
  },
  /** sezioni da includere nell'esportazione: le facoltative vuote vengono omesse, i capitoli restano se hanno figli inclusi */
  exportPlan(assign) {
    assign = assign || this.assignments();
    const secs = Store.P.report.sections.slice().sort((a, b) => a.order - b.order);
    const eff = secs.map(s => ({ s, e: this.effective(s, assign) }));
    const keep = eff.map(x => x.e.mode !== 'empty' || x.s.required);
    for (let k = eff.length - 1; k >= 0; k--) {
      if (keep[k]) continue;
      const l = eff[k].s.level || 1;
      for (let q = k + 1; q < eff.length && (eff[q].s.level || 1) > l; q++) if (keep[q]) { keep[k] = true; break; }
    }
    const plan = eff.filter((x, k) => keep[k]);
    const nums = this.numbers(plan.map(x => x.s));
    plan.forEach(x => { x.num = nums[x.s.id]; });
    return plan;
  },
  label(blockId) {
    const l = Model.numbering().map[blockId] || '';
    if (this.lang() !== 'en') return l;
    return l.replace(/^Tabella/, 'Table').replace(/^Grafico/, 'Chart').replace(/^Figura/, 'Figure').replace(/^Formula/, 'Equation').replace(/^Calcolo/, 'Calculation').replace(/^Risultato/, 'Result');
  },
  /** sezione suggerita per un blocco (null = nessuna) */
  autoSection(phase, b) {
    if (['note', 'attachment'].includes(b.type)) return null;
    // D1 (team, shortlist di aziende): materiale organizzativo, va in copertina e non nel testo della relazione
    const ownT = U.norm([b.title, b.name, b.caption].filter(Boolean).join(' '));
    if (/^d1\b/.test(U.norm(phase.title || '')) || /^(team\b|shortlist|deliverable\s*#?\s*1\b|note sul deliverable)/.test(ownT)) return null;
    const all = Store.P.report.sections.slice().sort((x, y) => x.order - y.order);
    const secs = all.filter((t, k) => !(t.level === 1 && all[k + 1] && all[k + 1].level > 1 && !U.str(t.content).trim()) || /summary|conclus|bibliog|appendix/i.test(t.title));
    const txt = U.norm([b.title, b.name, b.caption, b.resultName].filter(Boolean).join(' '));
    const own = U.norm([b.title, b.name, b.caption, b.resultName].filter(Boolean).join(' '));
    const tobe = /to-?be/.test(own) || (!/as-?is/.test(own) && /to-?be/.test(U.norm(phase.title)));
    const phaseTxt = U.norm(phase.title + ' ' + phase.description);
    const hasK = (n, k) => k === 'arena' ? /arena|simulation|simulaz/.test(n) : n.includes(k);
    const modelSec = (k, tb) => secs.find(t => { const n = U.norm(t.title); return hasK(n, k) && (tb ? /to-?be/.test(n) : /as-?is/.test(n)); }) || secs.find(t => hasK(U.norm(t.title), k));
    const keySec = text => { for (const [st, re] of SECTION_KEYS) { if (!re.test(text)) continue; const x = secs.find(t => st.test(U.norm(t.title))); if (x) return x; } return null; };
    // 1) il titolo del blocco decide per primo
    for (const [k, re] of MODEL_KEYS) if (re.test(own)) { const x = modelSec(k, tobe); if (x) return x; }
    let hit = own ? keySec(own) : null;
    if (hit) return hit;
    // 2) poi la fase, solo se indica un unico modello
    const models = MODEL_KEYS.filter(([, re]) => re.test(phaseTxt));
    if (models.length === 1) { const x = modelSec(models[0][0], tobe); if (x) return x; }
    hit = keySec(phaseTxt);
    if (hit && models.length === 0) return hit;
    // sezioni generiche: parole del titolo
    const gen = secs.find(s => { const w = U.norm(s.title).split(/\s+/).filter(x => x.length > 4); return w.length && w.every(x => txt.includes(x)); });
    if (gen) return gen;
    // ultima possibilità: per tipo di contenuto (strutture non D4)
    const BY_TYPE = { table: /^(dati|data|dataset)$/, calc: /^(calcoli|calculations?)$/, formula: /^(calcoli|calculations?|metodologia|methodology)$/,
      result: /^(risultati|results)$/, chart: /^(risultati|results)$/, image: /^(risultati|results|sviluppo|development)$/,
      interpretation: /^(analisi|discussione|analysis|discussion)$/, observation: /^(analisi|discussione|analysis|discussion)$/, text: /^(sviluppo|development)$/ };
    const re = BY_TYPE[b.type];
    return re ? secs.find(s => re.test(U.norm(s.title))) || null : null;
  },
  /** sezione effettiva di un blocco (scelta manuale > automatica) */
  sectionOf(phase, b) {
    if (b.section === 'none') return null;
    if (b.section) { const s = Store.P.report.sections.find(x => x.id === b.section); if (s) return s; }
    return this.autoSection(phase, b);
  },
  assignments() {
    const map = {};
    Model.allBlocks().forEach(({ phase, block }) => { const s = this.sectionOf(phase, block); if (s) (map[s.id] = map[s.id] || []).push({ phase, block }); });
    return map;
  },
  blockMd(b) {
    const lab = this.label(b.id);
    const cap = (l, t) => '*' + [l, t].filter(Boolean).join(': ') + '*';
    switch (b.type) {
      case 'table': return cap(lab, b.title) + '\n\n| ' + U.arr(b.columns).join(' | ') + ' |\n|' + U.arr(b.columns).map(() => '---').join('|') + '|\n' + U.arr(b.rows).map(r => '| ' + U.arr(r).join(' | ') + ' |').join('\n') + (b.notes ? '\n\n' + b.notes : '');
      case 'chart': return '[[CHART:' + b.id + ']]\n\n' + cap(lab, b.title) + (b.content ? '\n\n' + b.content : '');
      case 'image': return (b.fileId ? '[[FIG:' + b.fileId + ']]\n\n' : '') + cap(lab, b.caption || b.title) + (b.content ? '\n\n' + b.content : '');
      case 'formula': return (b.title ? '**' + b.title + '**\n\n' : '') + '$$' + b.latex + '$$' + (b.content ? '\n\n' + b.content : '');
      case 'calc': { const v = b.statedResult || U.fmtNum(b.computed); return (b.title ? '**' + b.title + '**\n\n' : '') + (b.expression ? '`' + b.resultName + ' = ' + b.expression + '`' : '') + (v ? '\n\n**' + (b.resultName || 'Result') + ' = ' + v + (b.unit ? ' ' + b.unit : '') + '**' : '') + (b.content ? '\n\n' + b.content : ''); }
      case 'result': return '- **' + (b.name || b.title) + '**: ' + b.value + (b.unit && b.unit !== '-' ? ' ' + b.unit : '') + (b.content ? ' — ' + b.content : '');
      default: return (b.title ? '**' + b.title + '**\n\n' : '') + U.str(b.content);
    }
  },
  hasContent(b) {
    switch (b.type) {
      case 'table': return U.arr(b.rows).some(r => U.arr(r).some(c => U.str(c).trim()));
      case 'chart': return U.str(b.labels).trim() !== '';
      case 'image': return !!b.fileId;
      case 'formula': return U.str(b.latex).trim() !== '';
      case 'calc': return U.str(b.expression).trim() !== '';
      case 'result': return U.str(b.value).trim() !== '';
      default: return U.str(b.content).trim() !== '';
    }
  },
  autoDraft(sec, assign) {
    assign = assign || this.assignments();
    const list = assign[sec.id] || [];
    const items = list.filter(x => this.hasContent(x.block));
    // titoli dei blocchi di testo: omessi se ripetono la sezione o il blocco precedente (documenti caricati)
    const tk = t => U.norm(t).replace(/^[\d.\s]+/, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const sk = tk(sec.title);
    let prevT = null;
    let md = items.map(x => {
      const b = x.block, k = tk(b.title);
      const same = b.type === 'text' && k && (k === sk || k === prevT || (k.length > 5 && (sk.includes(k) || k.includes(sk))));
      if (['text', 'observation', 'interpretation'].includes(b.type)) prevT = k;
      return (same ? U.str(b.content) : this.blockMd(b)) ;
    }).map((m, q) => { const b = items[q].block, intro = this.introSentence(b); return intro ? intro + '\n\n' + m : m; }).join('\n\n');
    if (/^(summary|sintesi|sommario|abstract)$/i.test(sec.title.trim())) { const sp = this.summaryProse(); md = sp + (md ? '\n\n' + md : ''); }
    if (/bibliograph|bibliografia|references/i.test(sec.title)) {
      const all = assign || this.assignments();
      const src = [...new Set(Object.values(all).flat().map(x => U.str(x.block.source).trim()).filter(Boolean))];
      if (src.length) md = (md ? md + '\n\n' : '') + src.map(s => '- ' + s).join('\n');
    }
    return { md, count: items.length, unverified: items.filter(x => x.block.status !== 'VERIFICATO').length, items };
  },
  /** frase che introduce tabelle, figure e grafici (senza numeri: Word li rinumera) */
  introSentence(b) {
    const en = this.lang() === 'en';
    const what = t => { t = U.str(t).trim().replace(/[.:]$/, ''); return t && /^[A-Z][a-z]+\b/.test(t) && !/^(Arena|Porter|Bizagi|Excel|Rockwell)\b/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t; };
    if (b.type === 'table') { const t = what(b.title); return en ? (t ? 'The following table reports ' + t + '.' : 'The following table summarises the collected data.') : (t ? 'La tabella seguente riporta ' + t + '.' : 'La tabella seguente riassume i dati raccolti.'); }
    if (b.type === 'image') { const t = what(b.caption || b.title); return en ? (t ? 'The figure below shows ' + t + '.' : '') : (t ? 'La figura seguente mostra ' + t + '.' : ''); }
    if (b.type === 'chart') { const t = what(b.title); return en ? (t ? 'The chart below represents ' + t + '.' : '') : (t ? 'Il grafico seguente rappresenta ' + t + '.' : ''); }
    return '';
  },
  /** Summary composto SOLO con i dati del progetto; quello che manca resta segnalato */
  summaryProse() {
    const P = Store.P, I = P.info, en = this.lang() === 'en';
    const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + (en ? ' and ' : ' e ') + a[a.length - 1];
    const todo = t => '[' + (en ? 'To be completed: ' : 'Da completare: ') + t + ']';
    const year = U.str(I.year).trim() || '2026/27';
    const team = U.str(I.teamName).trim();
    const out = [];
    out.push(en ? 'This report presents the project developed ' + (team ? 'by team ' + team + ' ' : '') + (I.members.length ? '(' + list(I.members) + ') ' : '') + 'for the Business Process Management course of the Master\'s degree in Management Engineering, A.Y. ' + year + '.'
      : 'Questa relazione presenta il progetto svolto ' + (team ? 'dal team ' + team + ' ' : '') + (I.members.length ? '(' + list(I.members) + ') ' : '') + 'per il corso di Business Process Management, A.A. ' + year + '.');
    const co = U.str(I.company).trim(), ref = U.str(I.referent).trim();
    out.push(co ? (en ? 'The project was carried out in collaboration with ' + co + (ref ? ', with ' + ref.split(/[\n,·]/)[0].trim() + ' as business referent' : '') + '.' : 'Il progetto è stato svolto in collaborazione con ' + co + (ref ? ', con referente aziendale ' + ref.split(/[\n,·]/)[0].trim() : '') + '.')
      : todo(en ? 'company chosen and reasons for the choice' : 'azienda scelta e motivi della scelta'));
    const proc = (this.assignments()[(P.report.sections.find(s => /overview of the specific process|process description|descrizione del processo/i.test(s.title)) || {}).id] || []).map(x => x.block).find(b => b.type === 'text' && U.str(b.content).trim());
    out.push(proc ? (en ? 'The analysed process is described in the chapter on the BPM project.' : 'Il processo analizzato è descritto nel capitolo sul progetto BPM.') : todo(en ? 'process analysed and main problem found' : 'processo analizzato e problema principale'));
    const done = P.report.sections.slice().sort((a, b) => a.order - b.order).filter(s => (s.level || 1) > 1 && this.effective(s).mode !== 'empty').map(s => s.title.replace(/\s*\(.*\)$/, ''));
    if (done.length) out.push((en ? 'The work covered ' : 'Il lavoro ha riguardato ') + list(done.map(t => t.charAt(0).toLowerCase() + t.slice(1).replace(/\bidef0\b/i, 'IDEF0').replace(/\bbpmn\b/i, 'BPMN').replace(/\buml\b/i, 'UML'))).replace(/as-is/gi, 'AS-IS').replace(/to-be/gi, 'TO-BE').replace(/arena/g, 'Arena') + '.');
    const res = Model.allBlocks().map(x => x.block).filter(b => b.type === 'result' && U.str(b.value).trim()).slice(0, 6);
    out.push(res.length ? (en ? 'The main results are: ' : 'I risultati principali sono: ') + res.map(b => (b.name || b.title) + ' = ' + b.value + (b.unit && b.unit !== '-' ? ' ' + b.unit : '')).join('; ') + '.' : todo(en ? 'TO-BE solution and main results (KPIs AS-IS vs TO-BE)' : 'soluzione TO-BE e risultati principali (KPI AS-IS vs TO-BE)'));
    return out.join(' ');
  },
  /** testo effettivo: scritto da voi > bozza automatica > vuoto */
  effective(sec, assign) {
    if (U.str(sec.content).trim()) return { md: sec.content, mode: 'manual' };
    const a = this.autoDraft(sec, assign);
    return a.md.trim() ? { md: a.md, mode: 'auto', count: a.count, unverified: a.unverified } : { md: '', mode: 'empty' };
  },
  /** markdown → HTML con figure e grafici incorporati */
  toHTML(md, forExport = false) {
    let html = U.md(md);
    html = html.replace(/<p>\[\[FIG:([\w-]+)\]\]<\/p>/g, (m, id) => forExport ? '' : '<figure style="margin:10px 0;text-align:center"><img data-file="' + id + '" alt="" style="max-height:420px;border:1px solid var(--line);border-radius:6px"></figure>');
    html = html.replace(/<p>\[\[CHART:([\w-]+)\]\]<\/p>/g, (m, id) => forExport ? '' : '<div class="chart-box" data-chart="' + id + '" style="margin:10px 0"></div>');
    return html.replace(/\[\[(FIG|CHART):[\w-]+\]\]/g, '');
  },
  stats() {
    const assign = this.assignments();
    const secs = Store.P.report.sections;
    const st = secs.map(s => ({ s, e: this.effective(s, assign) }));
    return { manual: st.filter(x => x.e.mode === 'manual').length, auto: st.filter(x => x.e.mode === 'auto').length, empty: st.filter(x => x.e.mode === 'empty'), total: secs.length, words: st.reduce((a, x) => a + U.words(U.stripMd(x.e.md.replace(/\[\[[^\]]+\]\]/g, ''))), 0) };
  }
};

/* ---------- le esportazioni usano il testo effettivo ---------- */
Report.markdown = function () {
  const P = Store.P, plan = LiveReport.exportPlan();
  const hd = x => '#'.repeat(Math.min(4, (x.s.level || 1) + 1)) + ' ' + (x.num ? x.num + ' ' : '') + x.s.title;
  return '# ' + (P.report.title || P.info.name) + '\n\n' + (P.info.members.length ? '_' + P.info.members.join(', ') + '_\n\n' : '') +
    plan.map(x => hd(x) + (x.e.md.trim() ? '\n\n' + x.e.md.replace(/\[\[(FIG|CHART):[\w-]+\]\]\n*/g, '').trim() : '')).join('\n\n') + '\n';
};
Report.html = function (live = false) {
  const P = Store.P, plan = LiveReport.exportPlan();
  const div = document.createElement('div');
  const head = live && LiveReport.coverHTML ? '<div class="print-cover">' + LiveReport.coverHTML() + '</div>' :
    '<h1>' + U.esc(P.report.title || P.info.name) + '</h1><p class="meta">' + U.esc([P.info.subject, P.info.degree, P.info.professor ? 'Docente: ' + P.info.professor : '', P.info.year].filter(Boolean).join(' · ')) + '<br>' + U.esc(P.info.members.join(', ')) + '</p>';
  const toc = '<div class="print-toc"><h2>Index</h2>' + plan.map(x => '<div class="toc-l' + (x.s.level || 1) + '">' + U.esc((x.num ? x.num + ' ' : '') + x.s.title) + '</div>').join('') + '</div>';
  div.innerHTML = head + (live ? toc : '') + plan.map(x => { const l = Math.min(4, (x.s.level || 1) + 1);
    return '<h' + l + (l === 2 && live ? ' class="pb"' : '') + '>' + U.esc((x.num ? x.num + ' ' : '') + x.s.title) + '</h' + l + '>' + (x.e.md.trim() ? LiveReport.toHTML(x.e.md, !live) : (x.s.required ? '<p><mark>[To be completed]</mark></p>' : '')); }).join('');
  UI.renderMath(div);
  return div.innerHTML;
};
Actions['report-print'] = async () => {
  const area = UI.$('#print-area');
  area.innerHTML = Report.html(true);
  await UI.renderImages(area);
  UI.$$('[data-chart]', area).forEach(c => c.remove());
  App.print(area.innerHTML);
};

/* ---------- vista RELAZIONE ---------- */
/* ---------- copertina (come i D4: loghi, corso, titolo, team, membri, referente) ---------- */
LiveReport.cover = function () {
  const P = Store.P, c = P.report.cover || {}, i = P.info;
  return {
    line1: c.line1 || (i.degree ? (/management engineering/i.test(i.degree) ? 'Master\'s degree in Management Engineering' : i.degree) : 'Master\'s degree in Management Engineering'),
    line2: c.line2 || ('A.Y. ' + (i.year || '')), line3: c.line3 || (i.subject || 'Business Process Management'),
    title: P.report.title || i.company && ('BPM project at ' + i.company) || i.name, team: i.teamName || '', members: i.members, referent: i.referent || '', logoIds: U.arr(c.logoIds)
  };
};
LiveReport.coverHTML = function () {
  const c = this.cover();
  return '<div class="rep-cover"><div class="rep-logos">' + (c.logoIds.length ? c.logoIds.map(id => '<img data-file="' + id + '" alt="Logo">').join('') : '<span class="small muted">[loghi: università / azienda — <button class="btn xs" data-action="report-cover">aggiungi</button>]</span>') + '</div>' +
    '<p class="cv-course">' + U.esc(c.line1) + '<br>' + U.esc(c.line2) + '<br>' + U.esc(c.line3) + '</p><p class="cv-title">' + U.esc(c.title) + '</p>' +
    '<div class="cv-meta"><p><b>Team\'s name:</b><br>' + U.esc(c.team || '—') + '</p><p class="mt-s"><b>Members\' names:</b></p><ul>' + c.members.map(m => '<li>' + U.esc(m) + '</li>').join('') + '</ul><p class="mt-s"><b>Name and contacts of the business referent:</b><br>' + U.esc(c.referent || '— (da inserire)') + '</p></div>' +
    '<p class="right"><button class="btn xs" data-action="report-cover">Modifica copertina</button></p></div>';
};
Actions['report-cover'] = () => {
  const P = Store.P, c = LiveReport.cover();
  UI.form({ title: 'Copertina della relazione', size: 'wide', intro: '<p class="small muted">Come nei D4: loghi in alto, corso e anno, titolo del progetto, team, membri, referente aziendale.</p>',
    fields: [{ key: 'title', label: 'Titolo del progetto', full: true, placeholder: 'es. Optimization of the order management process for …' },
      { key: 'line1', label: 'Riga 1', placeholder: 'Master\'s degree in Management Engineering' }, { key: 'line2', label: 'Riga 2', placeholder: 'A.Y. 2026/27' }, { key: 'line3', label: 'Riga 3', placeholder: 'Business Process Management' },
      { key: 'team', label: 'Team\'s name' }, { key: 'company', label: 'Azienda' }, { key: 'referent', label: 'Referente aziendale e contatti', full: true, placeholder: 'Nome Cognome (email)' },
      { key: 'members', label: 'Membri', type: 'tags', full: true },
      { key: 'logos', type: 'html', label: 'Loghi (università, dipartimento, azienda)', html: '<div class="row">' + UI.Files.chips(c.logoIds, true, 'reportcover:x') + '<button type="button" class="btn xs" data-action="report-cover-logo">＋ Aggiungi logo</button></div><span class="hint">Carica le immagini dei loghi che ti fornisce l\'università/azienda.</span>' }],
    value: { title: P.report.title, line1: P.report.cover.line1, line2: P.report.cover.line2, line3: P.report.cover.line3, team: P.info.teamName, company: P.info.company, referent: P.info.referent, members: P.info.members },
    onSubmit(v) { P.report.title = v.title; Object.assign(P.report.cover, { line1: v.line1, line2: v.line2, line3: v.line3 }); Object.assign(P.info, { teamName: v.team, company: v.company, referent: v.referent, members: v.members }); History.log('Copertina della relazione aggiornata', 'report'); Store.touch(); App.refresh(); } });
};
Actions['report-cover-logo'] = async () => {
  const files = await UI.pickFiles({ multiple: true, accept: 'image/*' });
  if (!files.length) return;
  const recs = await UI.Files.storeMany(files, { category: 'Immagine', description: 'Logo copertina' });
  Store.P.report.cover.logoIds = U.arr(Store.P.report.cover.logoIds).concat(recs.map(r => r.id));
  Store.touch(); UI.closeTop(); Actions['report-cover']();
};
Actions['report-level'] = (d, el) => { const s = Report.sec(d.id); if (!s) return; s.level = +el.value; Store.touch(); App.refresh(); };
Actions['report-numbered'] = (d, el) => { const s = Report.sec(d.id); if (!s) return; s.numbered = el.checked; Store.touch(); App.refresh(); };

Views.report = {
  title: 'Relazione', icon: '¶',
  render(params) {
    const P = Store.P;
    const secs = Report.sorted();
    const assign = LiveReport.assignments();
    const st = LiveReport.stats();
    const mode = params.id ? 'edit' : (App.ui.repMode || 'doc');
    const cur = secs.find(s => s.id === params.id) || null;
    const icon = e => e.mode === 'manual' ? '<span class="sec-ico ok" title="Testo scritto">●</span>' : e.mode === 'auto' ? '<span class="sec-ico auto" title="Bozza automatica dai contenuti del progetto">◐</span>' : '<span class="sec-ico" title="Vuota">○</span>';
    const repIssues = Metrics.openIssues().filter(i => i.group === 'relazione' || (i.ref && i.ref.route === 'report'));
    const plan = LiveReport.exportPlan(assign), planIds = new Set(plan.map(x => x.s.id)), nums = {};
    plan.forEach(x => { nums[x.s.id] = x.num; });
    let h = H.head('Relazione', (isSimple() ? 'Si scrive da sola con quello che fate e caricate nelle fasi. Cliccate una sezione a sinistra per leggerla, completarla o farla scrivere a Claude.' : 'Si scrive da sola mentre lavorate: ogni contenuto che aggiungete nelle fasi, o che l\'app legge dai PDF e Word caricati nelle fasi, finisce nella sezione giusta (◐ bozza automatica). Quando scrivete il vostro testo (●) quello ha la priorità.'),
      '<button class="btn primary" data-action="report-docx">Scarica Word (formato D4)</button><button class="btn adv" data-action="report-prompt">Fai scrivere a Claude</button><button class="btn simple-only" data-action="simple-info">Dati copertina</button><button class="btn" data-action="report-print">Stampa / PDF</button>');
    h += '<div class="card mb"><div class="row between"><div class="row"><span class="sec-ico ok">●</span><span class="small">' + st.manual + ' scritte</span><span class="sec-ico auto">◐</span><span class="small">' + st.auto + ' bozza automatica</span><span class="sec-ico">○</span><span class="small">' + st.empty.length + ' vuote</span><span class="small muted">· ' + st.words + ' parole</span></div>' +
      '<div class="btn-group adv">' + (repIssues.length ? '<button class="btn sm" data-action="report-issues" style="color:var(--warn)">⚠ ' + repIssues.length + ' da verificare</button>' : '') + '<button class="btn sm" data-action="checker-run-report">Controlla coerenza</button>' +
      '<details class="menu"><summary class="btn sm">Altro ▾</summary><div class="menu-pop"><button class="btn sm ghost" data-action="claude-import" data-kind="report">Importa testo da Claude</button><button class="btn sm ghost" data-action="upload" data-kind="report" data-accept=".pdf,.docx,.txt,.md">Importa bozza da file</button><button class="btn sm ghost" data-action="report-cover">Modifica copertina</button><button class="btn sm ghost" data-action="report-export" data-fmt="md">Scarica Markdown</button><button class="btn sm ghost" data-action="report-export" data-fmt="html">Scarica HTML</button><button class="btn sm ghost" data-action="report-snapshot">Salva una versione</button><button class="btn sm ghost" data-action="report-d4-structure">Applica formato D4</button><button class="btn sm ghost" data-action="report-from-examples">Sezioni ricorrenti negli esempi</button><button class="btn sm ghost" data-action="report-sec-add">Aggiungi sezione</button></div></details></div></div></div>';
    h += '<div class="rep-layout"><nav class="rep-nav" aria-label="Sezioni della relazione"><button class="' + (!cur ? 'active' : '') + '" data-action="report-doc"><b>📄 Documento completo</b></button>' +
      secs.map(s => { const e = LiveReport.effective(s, assign); const inc = planIds.has(s.id); return '<button class="lv' + (s.level || 1) + (cur && s.id === cur.id ? ' active' : '') + (inc ? '' : ' omitted') + '" data-action="go" data-route="report" data-id="' + s.id + '" title="' + (inc ? '' : 'Facoltativa e vuota: non verrà inclusa') + '"><span>' + icon(e) + ' ' + (nums[s.id] ? '<span class="secnum">' + nums[s.id] + '</span> ' : '') + U.esc(s.title) + '</span>' + (e.mode === 'auto' ? '<span class="tiny muted">' + e.count + '</span>' : '') + '</button>'; }).join('') + '</nav><div class="stack">';
    if (!cur) {
      h += '<article class="card rep-doc">' + LiveReport.coverHTML() + secs.map(s => {
        const e = LiveReport.effective(s, assign);
        const lv = s.level || 1, hasKids = secs.some((t, k) => k === secs.indexOf(s) + 1 && (t.level || 1) > lv);
        if (!planIds.has(s.id)) return '<section class="rep-sec omitted"><p class="small muted">' + U.esc(s.title) + ' — facoltativa e vuota: non verrà inclusa nella relazione. <button class="btn xs" data-action="go" data-route="report" data-id="' + s.id + '">Scrivi</button></p></section>';
        if (hasKids && e.mode === 'empty') return '<section class="rep-sec chapter"><h2 class="h-l1">' + (nums[s.id] ? nums[s.id] + ' ' : '') + U.esc(s.title) + '</h2></section>';
        return '<section class="rep-sec m-' + e.mode + '"><div class="row between"><h2 class="h-l' + lv + '">' + (nums[s.id] ? nums[s.id] + ' ' : '') + U.esc(s.title) + '</h2><div class="row">' + (e.mode === 'auto' ? '<span class="badge info">bozza automatica · ' + e.count + ' elementi' + (e.unverified ? ' · ' + e.unverified + ' da verificare' : '') + '</span>' : e.mode === 'manual' ? UI.badge(s.status) : '') + '<button class="btn xs" data-action="go" data-route="report" data-id="' + s.id + '">' + (e.mode === 'manual' ? 'Modifica' : 'Scrivi') + '</button></div></div>' +
          (e.mode === 'empty' ? '<p class="small muted rep-empty">Ancora vuota. ' + U.esc(s.notes || '') + '<br>Si riempie quando aggiungete nelle fasi contenuti su questo tema, oppure scrivendo qui.</p>' : '<div class="md">' + LiveReport.toHTML(e.md) + '</div>') + '</section>';
      }).join('') + '</article>';
    } else {
      const e = LiveReport.effective(cur, assign);
      const a = LiveReport.autoDraft(cur, assign);
      h += '<section class="card"><div class="row between"><input class="inline-input grow" style="font-size:19px;font-weight:700" aria-label="Titolo sezione" data-bind="report" data-id="' + cur.id + '" data-field="title" value="' + U.attr(cur.title) + '">' +
        '<div class="row adv">' + UI.select('data-change="report-level" data-id="' + cur.id + '" aria-label="Livello del titolo"', [['1', 'Capitolo (1.)'], ['2', 'Paragrafo (1.1.)'], ['3', 'Sottoparagrafo (1.1.1.)']], String(cur.level || 1)) + UI.select('data-change="report-status" data-id="' + cur.id + '" aria-label="Stato sezione"', C.REPORT_STATUS, cur.status) + '<details class="menu"><summary class="btn xs">⋯</summary><div class="menu-pop"><label class="check-line small"><input type="checkbox" data-change="report-required" data-id="' + cur.id + '"' + (cur.required ? ' checked' : '') + '><span>Obbligatoria (inclusa anche se vuota)</span></label><label class="check-line small"><input type="checkbox" data-change="report-numbered" data-id="' + cur.id + '"' + (cur.numbered ? ' checked' : '') + '><span>Numerata</span></label><button class="btn xs ghost" data-action="report-sec-move" data-id="' + cur.id + '" data-dir="-1">↑ Sposta su</button><button class="btn xs ghost" data-action="report-sec-move" data-id="' + cur.id + '" data-dir="1">↓ Sposta giù</button><button class="btn xs ghost" data-action="report-insert-ref" data-id="' + cur.id + '">Inserisci un dato del progetto</button><button class="btn xs danger" data-action="report-sec-del" data-id="' + cur.id + '">Elimina sezione</button></div></details></div></div>' +
        (cur.notes ? '<p class="small muted mt-s">💡 ' + U.esc(cur.notes) + '</p>' : '') + '</section>';
      h += '<section class="card"><div class="row between top"><div class="grow"><h3 style="margin:0">✍ Scrivere il testo di questa sezione</h3><p class="small muted mt-s">La bozza automatica mette insieme i vostri contenuti (testi, tabelle, figure) con frasi di collegamento. Per avere un testo scritto in forma di relazione, fatelo scrivere a Claude a partire SOLO dai dati del progetto e incollate qui la risposta: potete poi modificarla.</p></div>' +
        '<div class="btn-group"><button class="btn primary" data-action="report-sec-claude" data-id="' + cur.id + '">Fai scrivere questa sezione a Claude</button></div></div></section>';
      h += '<section class="card auto-box"><div class="row between"><h3>◐ Bozza automatica dai contenuti del progetto <span class="badge">' + a.count + '</span></h3>' + (a.md.trim() ? '<button class="btn sm" data-action="report-use-auto" data-id="' + cur.id + '">' + (U.str(cur.content).trim() ? 'Aggiungi in fondo al mio testo' : 'Usala come punto di partenza') + '</button>' : '') + '</div>' +
        (!a.items.length && a.md.trim() ? '<p class="small muted mt-s">Testo composto con i dati del progetto (scheda progetto, fasi, risultati). I punti [To be completed] indicano cosa manca: completate la scheda progetto oppure scrivete qui.</p>' : '') +
        (a.items.length ? '<p class="small muted mt-s">Da: ' + a.items.map(x => '<button class="btn xs ghost" data-action="go" data-route="dev" data-id="' + x.phase.id + '" data-extra="' + x.block.id + '">' + U.esc(Model.blockLabel(x.block)) + '</button>').join(' ') + '</p>' : a.md.trim() ? '' : '<p class="small muted mt-s">Ancora niente per questa sezione. Si riempie quando nelle fasi caricate un file (o aggiungete un contenuto) che parla di questo tema. Intanto potete scriverla qui sotto o farla scrivere a Claude.</p>') +
        (a.md.trim() && U.str(cur.content).trim() ? '<details class="exp mt-s"><summary class="small">Vedi la bozza automatica</summary><div class="exp-body md">' + LiveReport.toHTML(a.md) + '</div></details>' : '') + '</section>';
      h += '<section class="card"><div class="grid g2"><div class="field"><label for="sec-content">Il vostro testo ' + (e.mode === 'auto' ? '<span class="muted">(vuoto: nel documento si vede la bozza automatica)</span>' : '') + '</label><textarea id="sec-content" class="tall" style="min-height:420px" data-bind="report" data-id="' + cur.id + '" data-field="content" placeholder="Scrivete qui la sezione. **grassetto**, - elenchi, | tabelle |, $formule$">' + U.esc(cur.content) + '</textarea><span class="hint">' + U.words(U.stripMd(cur.content)) + ' parole · salvataggio automatico</span></div>' +
        '<div class="field"><span class="lbl">Come apparirà</span><div class="rep-preview md" data-preview="report" style="min-height:420px;max-height:none">' + LiveReport.toHTML(e.md) + '</div></div></div></section>';
    }
    h += '</div></div>';
    return h;
  }
};
/* ---------- una sezione scritta da Claude: prompt → risposta incollata → testo della sezione ---------- */
Actions['report-sec-claude'] = d => {
  const s = Report.sec(d.id); if (!s) return;
  const en = LiveReport.lang() === 'en';
  const prompt = AI.buildReportPrompt({ language: en ? 'English' : 'Italiano', style: 'accademico', sectionIds: [s.id] }) +
    '\n## SEZIONE DA SCRIVERE ORA\nScrivi SOLO la sezione "' + s.title + '"' + (s.notes ? ' (cosa conteneva nei D4 precedenti: ' + s.notes + ')' : '') + '. Testo in paragrafi continui, come in una relazione D4; dove il progetto non fornisce un dato scrivi [To be completed: …]. Dove ci sono tabelle o figure del progetto assegnate alla sezione, introducile nel testo (es. "The following table reports…") senza ricopiarle.\n';
  const m = UI.modal({ title: 'Fai scrivere a Claude: ' + s.title, size: 'wide',
    body: '<ol class="small stack s"><li><b>Copia il prompt</b> e incollalo in una nuova chat con Claude. Contiene solo i dati del vostro progetto e le regole: niente dati inventati.</li><li><b>Incolla qui sotto la risposta</b> di Claude e premi "Inserisci nella sezione". La versione precedente resta nella cronologia.</li></ol>' +
      '<div class="row mt"><button class="btn primary" data-copy>1 · Copia il prompt</button><a class="btn" href="https://claude.ai/new" target="_blank" rel="noopener">Apri Claude in una nuova scheda ↗</a><span class="small muted" data-copied></span></div>' +
      '<details class="exp mt-s"><summary class="small">Vedi il prompt (' + U.words(prompt) + ' parole)</summary><div class="exp-body"><pre class="small" style="max-height:220px;overflow:auto;white-space:pre-wrap">' + U.esc(prompt) + '</pre></div></details>' +
      '<div class="field mt"><label for="cl-resp">2 · Risposta di Claude</label><textarea id="cl-resp" rows="12" placeholder="Incolla qui il testo scritto da Claude…"></textarea></div>' +
      (U.str(s.content).trim() ? '<label class="check-line small mt-s"><input type="checkbox" id="cl-append"><span>Aggiungi in fondo al testo già scritto (altrimenti lo sostituisce)</span></label>' : ''),
    footer: '<button class="btn" data-x>Chiudi</button><button class="btn primary" data-ok>Inserisci nella sezione</button>' });
  m.el.querySelector('[data-x]').onclick = () => m.close();
  m.el.querySelector('[data-copy]').onclick = async () => { await U.copy(prompt); m.el.querySelector('[data-copied]').textContent = 'Prompt copiato ✓ — ora apri Claude e incollalo'; };
  m.el.querySelector('[data-ok]').onclick = () => {
    let t = U.str(m.el.querySelector('#cl-resp').value).replace(/\r/g, '').trim();
    if (!t) return UI.toast('Incolla prima la risposta di Claude', 'err');
    // via il titolo della sezione se Claude lo ha ripetuto
    t = t.replace(/^#{1,4}\s*[\d.\s]*([^\n]*)\n+/, (all, h) => U.norm(h).includes(U.norm(s.title).slice(0, 12)) ? '' : all).trim();
    const before = s.content;
    const app = m.el.querySelector('#cl-append');
    s.content = app && app.checked ? s.content.trim() + '\n\n' + t : t;
    if (['VUOTA', ''].includes(s.status || '')) s.status = 'BOZZA';
    History.version({ type: 'report', id: s.id, label: 'Relazione › ' + s.title, field: 'content', before, after: s.content, origin: 'CLAUDE', reason: 'Testo scritto da Claude e incollato' });
    Store.touch(); m.close(); App.refresh(); UI.toast('Testo inserito: rileggetelo e controllate i numeri');
  };
};
Actions['report-doc'] = () => { App.ui.repSec = null; App.go('report'); };
Actions['report-use-auto'] = d => {
  const s = Report.sec(d.id);
  if (!s) return;
  const a = LiveReport.autoDraft(s);
  const before = s.content;
  s.content = (U.str(s.content).trim() ? s.content.trim() + '\n\n' : '') + a.md;
  if (s.status === 'VUOTA') s.status = 'BOZZA';
  History.version({ type: 'report', id: s.id, label: 'Relazione › ' + s.title, field: 'content', before, after: s.content, origin: 'CONTROLLO AUTOMATICO', reason: 'Bozza automatica usata come testo' });
  Store.touch(); App.refresh();
};
/* anteprima del testo: usa figure/grafici */
Binders.report = (orig => (el, phase) => {
  orig(el, phase);
  if (phase === 'input' && el.dataset.field === 'content') {
    LiveReport._pv = LiveReport._pv || U.debounce(() => { const pv = UI.$('[data-preview="report"]'); const s = Report.sec(el.dataset.id); if (pv && s) { pv.innerHTML = LiveReport.toHTML(LiveReport.effective(s).md); UI.afterRender(pv); } }, 300);
    LiveReport._pv();
  }
})(Binders.report);

/* ---------- destinazione nella relazione per ogni blocco ---------- */
Actions['block-section'] = (d, el) => {
  const f = Model.findBlock(d.id);
  if (!f) return;
  f.block.section = el.value;
  const s = LiveReport.sectionOf(f.phase, f.block);
  History.log(Model.blockLabel(f.block) + ' → ' + (s ? 'relazione: ' + s.title : 'non incluso nella relazione'), 'blocks');
  Store.touch(); App.refresh();
};
LiveReport.blockSelect = function (phase, b) {
  const auto = this.autoSection(phase, b);
  const opts = [['', 'Automatico' + (auto ? ': ' + auto.title : ': nessuna sezione')]].concat(Store.P.report.sections.slice().sort((x, y) => x.order - y.order).map(s => [s.id, s.title]), [['none', 'Non includere']]);
  return '<label class="small row nw" title="In quale sezione della relazione va questo contenuto"><span>Nella relazione:</span>' + UI.select('data-change="block-section" data-id="' + b.id + '" aria-label="Sezione della relazione" style="width:auto;max-width:230px;padding:3px 6px;font-size:12px"', opts, b.section || '') + '</label>';
};

/* ---------- metriche relazione: contano anche le bozze automatiche ---------- */
Metrics.reportProgress = function () {
  const secs = Store.P ? Store.P.report.sections : [];
  if (!secs.length) return { pct: 0, total: 0, filled: 0, words: 0, byStatus: {}, requiredEmpty: [] };
  const assign = LiveReport.assignments();
  let w = 0, sc = 0;
  const byStatus = {};
  const eff = secs.map(s => ({ s, e: LiveReport.effective(s, assign) }));
  eff.forEach(({ s, e }) => { const wt = s.required ? 2 : 1; w += wt; sc += wt * (e.mode === 'manual' ? Math.max(0.5, C.REPORT_SCORE[s.status] || 0) : e.mode === 'auto' ? 0.3 : 0); byStatus[s.status] = (byStatus[s.status] || 0) + 1; });
  return { pct: Math.round(sc / w * 100), total: secs.length, filled: eff.filter(x => x.e.mode !== 'empty').length, words: eff.reduce((a, x) => a + U.words(U.stripMd(x.e.md.replace(/\[\[[^\]]+\]\]/g, ''))), 0), byStatus,
    requiredEmpty: eff.filter(x => x.s.required && x.e.mode === 'empty').map(x => x.s), auto: eff.filter(x => x.e.mode === 'auto').length };
};

/* =====================================================================
   HOME semplificata
   ===================================================================== */
Views.dashboard = {
  title: 'Home', icon: '⌂',
  render() {
    const P = Store.P;
    const ov = Metrics.overall(), hl = Metrics.health();
    const days = Metrics.daysToDue();
    const next = Metrics.whatNow();
    const rs = LiveReport.stats();
    const att = Metrics.attention().filter(a => a.level === 'risk').slice(0, 3);
    const dls = Metrics.deadlinesSorted(true).filter(d => d.status !== 'ANNULLATA');
    const nextDl = dls.find(d => d.status === 'APERTA');
    let h = '<div class="home-head"><div><h1>' + U.esc(P.info.name || 'Progetto') + '</h1><p class="muted mt-s">' + (days === null ? 'Imposta la data di consegna nella scheda progetto' : days < 0 ? 'Consegna finale superata' : 'Consegna finale ' + U.relDays(P.info.dueDate) + ' (' + U.fmtDate(P.info.dueDate) + ')') + ' · stato: <span class="h-' + hl.level + '" style="font-weight:700">' + hl.level + '</span></p></div>' +
      '<div class="home-progress"><span class="small muted">Avanzamento</span><div class="row nw">' + UI.progress(ov.total, 'lg') + '<b>' + ov.total + '%</b></div></div></div>';
    if (dls.length) h += '<div class="card mb"><h4>Il percorso</h4><div class="path">' + dls.map(d => {
      const st = d.status === 'COMPLETATA' ? 'done' : U.daysUntil(d.date) < 0 ? 'late' : d === nextDl ? 'next' : '';
      return '<button class="path-step ' + st + '" data-action="go" data-route="deadlines" data-id="' + d.id + '" title="' + U.attr(d.title + ' · ' + U.fmtDate(d.date)) + '"><span class="dot">' + (st === 'done' ? '✓' : st === 'late' ? '!' : '') + '</span><span class="lbl">' + U.esc(U.truncate(d.title.replace(/^(M\d+)\s*·\s*/, '$1 '), 26)) + '</span><span class="tiny">' + U.fmtDate(d.date).slice(0, 5) + '</span></button>';
    }).join('') + '</div>' + (nextDl ? '<p class="small mt-s"><b>Prossima tappa:</b> ' + U.esc(nextDl.title) + ' — ' + U.relDays(nextDl.date) + (dls.some(d => d.status === 'APERTA' && U.daysUntil(d.date) < 0) ? ' · <span style="color:var(--risk)">ci sono tappe passate da segnare come completate</span>' : '') + '</p>' : '') + '</div>';
    h += '<div class="card whatnow mb"><h2>Cosa fare adesso</h2>' + (next.length ? '<div class="mt-s">' + next.map((x, i) => '<div class="wn-item"><span class="wn-num">' + (i + 1) + '</span><div><b>' + U.esc(x.title) + '</b><p class="small muted mt-s">' + U.esc(x.why) + '</p></div><button class="btn sm primary" data-action="go" data-route="' + x.route + '" data-id="' + U.attr(x.id || '') + '">' + U.esc(x.actionLabel) + '</button></div>').join('') + '</div>' : '<p class="mt-s">Niente di urgente: continuate con la fase in corso.</p>') + '</div>';
    h += '<div class="grid g2 mb">';
    h += H.card('📄 La relazione', '<p class="small">' + rs.manual + ' sezioni scritte · ' + rs.auto + ' con bozza automatica · ' + rs.empty.length + ' vuote · ' + rs.words + ' parole</p><div class="mt-s">' + UI.progress(U.pct(rs.manual + rs.auto * 0.5, rs.total)) + '</div>' +
      (rs.empty.length ? '<p class="small muted mt">Da riempire: ' + rs.empty.slice(0, 6).map(x => U.esc(x.s.title)).join(', ') + (rs.empty.length > 6 ? '…' : '') + '</p>' : '') + '<button class="btn sm mt" data-action="go" data-route="report">Apri la relazione</button>');
    h += H.card('🧩 Le fasi', '<div class="stack s">' + ov.phRows.map(r => '<button class="prog-row linkrow" data-action="go" data-route="dev" data-id="' + r.id + '"><span class="small">' + U.esc(U.truncate(r.label, 34)) + '</span>' + UI.progress(r.pct) + '<span class="pct small">' + r.pct + '%</span></button>').join('') + '</div>' + (ov.phRows.length ? '' : '<p class="small muted">Nessuna fase</p>'));
    h += '</div>';
    if (att.length) h += H.card('⚠ Attenzione', '<div class="attn">' + att.map(a => '<div class="attn-item risk"><div class="grow"><b>' + U.esc(a.title) + '</b><small>' + U.esc(a.text) + '</small></div><button class="btn xs" data-action="go" data-route="' + a.route + '" data-id="' + U.attr(a.id || '') + '">Vai</button></div>').join('') + '</div>', '', 'mb');
    h += '<details class="exp mt"><summary>Tutti i dettagli (errori, attività, domande, revisioni, statistiche)</summary><div class="exp-body">' + DashboardDetails.render() + '</div></details>';
    return h;
  }
};

/* =====================================================================
   HOME DELLA VISTA SEMPLICE — "Inizia qui": 3 passi, niente altro
   ===================================================================== */
const SimpleHome = {
  currentPhase() {
    const ph = Model.phasesSorted();
    return ph.find(p => Metrics.phaseProgress(p).pct < 100 && (!p.end || U.daysUntil(p.end) >= 0)) || ph.find(p => Metrics.phaseProgress(p).pct < 100) || ph[ph.length - 1];
  },
  render() {
    const P = Store.P, I = P.info;
    const cur = this.currentPhase();
    const rs = LiveReport.stats();
    const nextDl = Metrics.deadlinesSorted(true).find(d => d.status === 'APERTA' && U.daysUntil(d.date) >= 0);
    const late = Metrics.deadlinesSorted(true).filter(d => d.status === 'APERTA' && U.daysUntil(d.date) < 0);
    const missing = [!U.str(I.company).trim() && 'azienda', !U.str(I.referent).trim() && 'referente aziendale', !U.str(P.report.title).trim() && 'titolo della relazione'].filter(Boolean);
    let h = '<div class="sh-head"><h1>Ciao! Ecco come si usa</h1><p class="muted">Tre passi. ' + (Sync.on ? 'Il progetto è condiviso: quello che fate lo vedono subito anche gli altri.' : 'I dati restano salvati in questo browser.') + '</p></div>';
    if (nextDl) h += '<div class="sh-deadline"><span class="sh-dl-ico">◷</span><div><b>Prossima scadenza: ' + U.esc(nextDl.title) + '</b><br><span class="small">' + U.fmtDate(nextDl.date) + (nextDl.time ? ' alle ' + nextDl.time : '') + ' · ' + U.relDays(nextDl.date) + '</span></div><button class="btn sm" data-action="go" data-route="deadlines">Tutte le scadenze</button></div>';
    h += '<ol class="sh-steps">';
    h += '<li class="sh-step"><span class="sh-n">1</span><div class="grow"><h2>Apri la fase su cui state lavorando</h2><p>Ogni fase ha una lista di cose da fare: spuntatele quando sono fatte.</p>' +
      (cur ? '<button class="btn primary lg" data-action="go" data-route="dev" data-id="' + cur.id + '">Vai a: ' + U.esc(U.truncate(cur.title, 48)) + '</button>' : '') +
      '<div class="sh-phases">' + Model.phasesSorted().map(p => { const pr = Metrics.phaseProgress(p).pct; return '<button class="sh-ph' + (p === cur ? ' cur' : '') + (pr >= 100 ? ' done' : '') + '" data-action="go" data-route="dev" data-id="' + p.id + '"><span>' + (pr >= 100 ? '✓ ' : '') + U.esc(U.truncate(p.title, 34)) + '</span>' + UI.progress(pr) + '</button>'; }).join('') + '</div></div></li>';
    h += '<li class="sh-step"><span class="sh-n">2</span><div class="grow"><h2>Caricate i file del lavoro</h2><p>PDF o Word (analisi, modelli IDEF0/BPMN/UML, Arena, bozze…). L\'app li legge e mette testi, tabelle e figure nel punto giusto della relazione. Potete anche trascinare i file nella pagina.</p>' +
      '<button class="btn primary lg" data-action="upload" data-kind="phase" data-ph="' + (cur ? cur.id : '') + '" data-accept=".pdf,.docx,.pptx,.txt,.md">⇪ Carica PDF o Word</button></div></li>';
    h += '<li class="sh-step"><span class="sh-n">3</span><div class="grow"><h2>Guardate e scaricate la relazione</h2><p>Si scrive da sola mentre lavorate, nel formato dei D4 degli anni scorsi. ' + (rs.manual + rs.auto) + ' sezioni su ' + rs.total + ' hanno già del testo.</p>' +
      '<div class="btn-group"><button class="btn primary lg" data-action="go" data-route="report">Apri la relazione</button><button class="btn lg" data-action="report-docx">Scarica in Word</button></div></div></li>';
    h += '</ol>';
    if (missing.length) h += '<div class="sh-note"><b>Manca qualche dato per la copertina e il Summary:</b> ' + missing.join(', ') + '. <button class="btn sm primary" data-action="simple-info">Inserisci i dati</button></div>';
    if (late.length) h += '<div class="sh-note warn">Ci sono ' + late.length + ' scadenze passate non segnate come fatte. <button class="btn sm" data-action="go" data-route="deadlines">Controlla</button></div>';
    h += TeamUI.card();
    h += '<p class="small muted mt">Serve qualcosa di più (materiale del professore, esempi, controlli, revisioni)? Usate "passa a completa" in fondo al menu a sinistra.</p>';
    return h;
  }
};
Views.dashboard.render = (orig => function (r) { return isSimple() ? SimpleHome.render() : orig.call(this, r); })(Views.dashboard.render);
Views.dashboard.title = 'Home';
Actions['simple-info'] = () => {
  const P = Store.P;
  UI.form({ title: 'Dati per la copertina della relazione', intro: '<p class="small muted">Compaiono nella copertina e nel Summary. Potete cambiarli quando volete.</p>',
    fields: [{ key: 'title', label: 'Titolo della relazione', type: 'text', placeholder: 'es. Optimization of the order management process' },
      { key: 'company', label: 'Azienda', type: 'text' }, { key: 'referent', label: 'Referente aziendale e contatti', type: 'text', placeholder: 'Nome Cognome · email · telefono' },
      { key: 'teamName', label: 'Nome del team', type: 'text' }],
    value: { title: P.report.title, company: P.info.company, referent: P.info.referent, teamName: P.info.teamName },
    onSubmit(v) { P.report.title = v.title; P.info.company = v.company; P.info.referent = v.referent; P.info.teamName = v.teamName; History.log('Dati della copertina aggiornati', 'progetto'); Store.touch(); App.refresh(); UI.toast('Dati salvati'); }
  });
};

/* ---------- SCADENZE nella vista semplice: un elenco in ordine di data ---------- */
Views.deadlines.render = (orig => function (r) {
  if (!isSimple()) return orig.call(this, r);
  const list = Metrics.deadlinesSorted(true).filter(d => d.status !== 'ANNULLATA');
  let h = H.head('Scadenze', 'Tutte le date del semestre in ordine. Quando una consegna è fatta, premete "Fatto".');
  h += '<div class="sd-list">' + list.map(d => {
    const done = d.status === 'COMPLETATA', n = U.daysUntil(d.date);
    const cls = done ? 'done' : n < 0 ? 'late' : n <= 7 ? 'soon' : '';
    return '<div class="sd-item ' + cls + '"><div class="sd-date"><b>' + U.fmtDate(d.date).slice(0, 5) + '</b><span>' + (d.time || '') + '</span></div><div class="grow"><div class="sd-title">' + (done ? '✓ ' : '') + U.esc(d.title) + '</div>' +
      '<div class="small muted">' + (done ? 'Fatto' : n < 0 ? 'Data passata: è stato consegnato?' : U.relDays(d.date)) + (d.description ? ' · ' + U.esc(U.truncate(d.description, 140)) : '') + '</div></div>' +
      '<button class="btn sm' + (done ? '' : ' ok') + '" data-action="deadline-toggle" data-id="' + d.id + '">' + (done ? 'Annulla' : 'Fatto') + '</button></div>';
  }).join('') + '</div>';
  return h;
})(Views.deadlines.render);
