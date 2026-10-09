/* =====================================================================
   COURSE — parametri del corso BPM 2026/27 (slide "Lesson 0")
   - Deliverables at a Glance: contenuto, formato, data, nome del file
   - Guidelines for the Final Report: pagine per sezione, max 40 pagine,
     citazioni con reference list completa, didascalia su ogni figura e
     tabella, appendice solo per diagrammi non citati
   - Rules & Deadlines: −1 punto ogni 24 h di ritardo, D4 in ritardo =
     esclusione da M8 e −3 punti, presentazioni in inglese, email del
     referente al docente prima del 21/12/2026
   Le stime delle pagine sono indicative (circa 450 parole per pagina,
   figure e tabelle contate a parte): il conteggio vero è quello del Word.
   ===================================================================== */
'use strict';

const Course = {
  VERSION: 2,
  MAX_PAGES: 40,
  WORDS_PER_PAGE: 450,
  TEAMS_CHANNEL: 'MS Teams (BPM 2026–2027)',
  DELIVERABLES: [
    { n: 1, fmt: 'docx', due: '2026-10-02', en: 'Team details & 4–6 candidate companies', it: 'dati del team e 4–6 aziende candidate' },
    { n: 2, fmt: 'pdf', due: '2026-10-23', en: 'Idea, plan of attack, company & process overview', it: 'idea, piano di lavoro (plan of attack), panoramica di azienda e processo' },
    { n: 3, fmt: 'pdf', due: '2026-11-12', en: 'Almost-complete draft of the final report', it: 'bozza quasi completa della relazione finale' },
    { n: 4, fmt: 'pdf', due: '2026-12-10', en: 'Final report (max 40 pages)', it: 'relazione finale (massimo 40 pagine)' }
  ],
  /* [titolo sezione (regex), pagine min, max, etichetta] */
  BUDGET: [
    [/^(summary|sintesi|sommario|abstract)$/, 2, 2, 'Summary'],
    [/company and its business processes|company & its business processes/, 5, 6, '1. The Company & Its Business Processes'],
    [/^the bpm project$/, 25, 30, '2. The BPM Project'],
    [/^conclus/, 1, 2, '3. Conclusions']
  ],
  RULES: [
    ['⚠', '−1 punto per ogni 24 ore di ritardo di una consegna.'],
    ['⚠', 'Relazione finale (D4) in ritardo: il team è escluso dalla Milestone 8 (presentazioni) e prende −3 punti.'],
    ['🌐', 'Presentazioni e discussioni si fanno in inglese.'],
    ['✓', 'Prima del 21/12/2026 il referente aziendale invia via email la sua approvazione al docente.'],
    ['💡', 'D1, D2 e D3 non hanno un voto proprio, ma il feedback che ricevete orienta la relazione finale.']
  ],

  isBpm(P = Store.P) { return !!P && P.report.sections.some(s => /^the bpm project$/i.test(s.title)); },
  team(P = Store.P) { return (U.str(P.info.teamName).trim() || 'Team').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, ''); },
  fileName(n, fmt) { const d = this.DELIVERABLES.find(x => x.n === n); return this.team() + '_D' + n + '.' + (fmt || (d ? d.fmt : 'pdf')); },
  /** consegna (1-4) a cui si riferisce una scadenza, dal titolo */
  delivOf(dl) { const m = U.str(dl && dl.title).match(/\bD([1-4])\b/); return m && /CONSEGNA/.test(dl.kind || '') ? +m[1] : null; },
  /** prossima consegna non ancora chiusa (per il nome del file scaricato) */
  nextDeliverable() {
    const P = Store.P;
    const today0 = U.todayISO();
    const open = P.deadlines.filter(d => this.delivOf(d) && d.status === 'APERTA' && U.str(d.date) >= today0).sort((a, b) => U.str(a.date).localeCompare(U.str(b.date)));
    if (open.length) return this.delivOf(open[0]);
    const today = U.todayISO();
    const d = this.DELIVERABLES.find(x => x.due >= today);
    return d ? d.n : 4;
  },
  /** ritardo di una consegna aperta e penalità prevista dalle regole */
  lateness(dl) {
    const n = this.delivOf(dl);
    if (!n || dl.status !== 'APERTA' || !U.isValidDate(dl.date)) return null;
    const due = new Date(dl.date + 'T' + (/^\d\d:\d\d$/.test(dl.time || '') ? dl.time : '23:59') + ':00');
    const ms = Date.now() - due.getTime();
    if (ms <= 0) return null;
    const points = Math.ceil(ms / 86400000);
    return { n, hours: Math.floor(ms / 3600000), points, text: 'Ritardo: −' + points + (points === 1 ? ' punto' : ' punti') + (n === 4 ? ' · esclusione dalla Milestone 8 e altri −3 punti' : '') + ' (se non è stato ancora consegnato).' };
  },

  /* ---------- stima delle pagine ---------- */
  estimate(md) {
    const s = U.str(md);
    const figs = (s.match(/\[\[(FIG|CHART):/g) || []).length;
    const lines = s.split('\n');
    const tableRows = lines.filter(l => /^\s*\|.*\|\s*$/.test(l) && !/^\s*\|[\s\-:|]+\|\s*$/.test(l)).length;
    const tables = (s.match(/(^|\n)\s*\|[^\n]*\|\s*\n\s*\|[\s\-:|]+\|/g) || []).length;
    const formulas = (s.match(/\$\$/g) || []).length / 2;
    const prose = lines.filter(l => !/^\s*\|/.test(l)).join('\n').replace(/\[\[[^\]]+\]\]/g, '').replace(/\$\$[\s\S]*?\$\$/g, '');
    const words = U.words(U.stripMd(prose));
    return words / this.WORDS_PER_PAGE + figs * 0.4 + tables * 0.1 + tableRows * 0.035 + formulas * 0.08;
  },
  budgetOf(sec) { const t = U.norm(sec.title); return this.BUDGET.find(([re]) => re.test(t)) || null; },
  /** pagine stimate per capitolo (capitolo = sezione di livello 1 con le sue sottosezioni) */
  pages() {
    const plan = LiveReport.exportPlan();
    const chapters = [];
    let cur = null;
    plan.forEach(x => {
      const pg = this.estimate(x.e.md) + 0.06;   // titolo
      if ((x.s.level || 1) === 1 || !cur) { cur = { s: x.s, num: x.num, pages: 0, budget: this.budgetOf(x.s) }; chapters.push(cur); }
      cur.pages += pg;
    });
    const front = 2;   // copertina + indice
    const body = chapters.reduce((a, c) => a + c.pages, 0);
    return { chapters, front, total: front + body };
  },
  pagesCard(compact) {
    if (!this.isBpm()) return '';
    const pg = this.pages();
    const r1 = x => Math.round(x * 10) / 10;
    const rows = pg.chapters.map(c => {
      const b = c.budget, p = r1(c.pages);
      let cls = '', note = '';
      if (b) { if (p > b[2] + 0.4) { cls = 'risk'; note = 'oltre il limite'; } else if (p >= b[1] - 0.4) { cls = 'ok'; note = 'nel range'; } else note = 'mancano ~' + Math.max(1, Math.round(b[1] - p)) + ' pag.'; }
      else if (/appendix|appendice/i.test(c.s.title)) note = 'solo diagrammi non citati nel testo';
      const pct = b ? Math.min(100, Math.round(p / b[2] * 100)) : 0;
      return '<div class="pg-row"><span class="small pg-name">' + U.esc((c.num ? c.num + ' ' : '') + c.s.title) + '</span>' + (b ? UI.progress(pct) : '<span></span>') +
        '<span class="small nowrap pg-val ' + cls + '">~' + p + (b ? ' / ' + (b[1] === b[2] ? b[1] : b[1] + '–' + b[2]) : '') + ' pag.</span><span class="tiny muted pg-note">' + note + '</span></div>';
    }).join('');
    const tot = r1(pg.total), over = tot > this.MAX_PAGES;
    const head = '<div class="row between"><h4>Pagine (linee guida del corso)</h4><span class="badge ' + (over ? 'risk' : tot > this.MAX_PAGES - 4 ? 'warn' : 'ok') + '">~' + tot + ' / ' + this.MAX_PAGES + ' pagine</span></div>';
    const foot = '<p class="tiny muted mt-s">Stima: ~' + this.WORDS_PER_PAGE + ' parole a pagina, figure e tabelle contate a parte, più copertina e indice. Il numero esatto lo vedete nel Word. Regole: massimo ' + this.MAX_PAGES + ' pagine in tutto · ogni articolo citato nel testo con reference list completa alla fine · didascalia su ogni figura e tabella.</p>';
    if (compact) return '<div class="card mb pg-card">' + head + '</div>';
    return '<details class="card mb pg-card"' + (over ? ' open' : '') + '><summary class="pg-sum">' + head + '</summary><div class="mt-s">' + rows + foot + '</div></details>';
  },

  /* ---------- citazioni ---------- */
  references() {
    const P = Store.P, assign = LiveReport.assignments();
    const ref = P.report.sections.find(s => /^(references|bibliography|bibliografia)$/i.test(s.title.trim()));
    if (!ref) return null;
    const md = LiveReport.effective(ref, assign).md;
    const items = md.split('\n').map(l => l.replace(/^\s*(?:[-*•]|\d+[.)]|\[\d+\])\s*/, '').trim()).filter(l => l.length > 8);
    const body = P.report.sections.filter(s => s !== ref).map(s => LiveReport.effective(s, assign).md).join('\n');
    const key = it => {
      if (/^https?:\/\//i.test(it)) return null;       // siti: non serve citazione autore-anno
      const au = (it.match(/^([A-ZÀ-Ý][A-Za-zÀ-ÿ'\-]+)/) || [])[1];
      const yr = (it.match(/\((\d{4})[a-z]?\)|\b(19|20)\d{2}\b/) || [])[0];
      return au ? { au, yr: yr ? yr.replace(/\D/g, '').slice(0, 4) : '' } : null;
    };
    const uncited = items.filter(it => { const k = key(it); if (!k) return false; return !new RegExp('\\b' + k.au.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(body); });
    // citazioni (Autore, anno) nel testo senza voce in References
    const cites = [...new Set((body.match(/\(([A-ZÀ-Ý][A-Za-zÀ-ÿ'\-]+)(?: et al\.)?(?: (?:&|and) [A-ZÀ-Ý][A-Za-zÀ-ÿ'\-]+)?,? (\d{4})[a-z]?\)/g) || []))];
    const missing = cites.filter(c => { const au = c.match(/\(([A-ZÀ-Ý][A-Za-zÀ-ÿ'\-]+)/)[1]; return !items.some(it => it.includes(au)); });
    return { ref, items, uncited, missing };
  },

  /* ---------- aggiornamento del progetto ai parametri del corso ---------- */
  async apply(silent = true) {
    const P = Store.P;
    if (!P) return;
    await Uploader.applyD4Structure(true);
    const team = this.team();
    // scadenze: contenuto, formato, nome del file, penalità
    P.deadlines.forEach(d => {
      const n = this.delivOf(d);
      const desc = U.str(d.description);
      if (n) {
        const D = this.DELIVERABLES.find(x => x.n === n);
        if (D && D.due !== d.date && !U.isValidDate(d.date)) d.date = D.due;
        if (!/MS Teams/.test(desc)) {
          d.description = (desc ? desc.trim() + '\n\n' : '') + 'Contenuto: ' + D.it + '.\nFormato: .' + D.fmt + ' · caricare su ' + this.TEAMS_CHANNEL + ' con il nome ' + team + '_D' + n + '.' + D.fmt + '.\n' +
            (n < 4 ? 'Non ha un voto proprio, ma il feedback orienta la relazione finale.\nRitardo: −1 punto ogni 24 ore.' : 'Massimo 40 pagine.\nRitardo: −1 punto ogni 24 ore; un D4 in ritardo esclude il team dalla Milestone 8 (presentazioni) con altri −3 punti.');
        }
      } else if (/presentazion/i.test(d.title) && !/inglese/i.test(desc)) d.description = (desc ? desc.trim() + '\n' : '') + 'Presentazioni e discussioni in inglese.';
      else if (/referente/i.test(d.title) && !/al docente/i.test(desc)) d.description = (desc ? desc.trim() + '\n' : '') + 'Il referente aziendale invia via email la sua approvazione al docente prima del 21/12/2026.';
    });
    // materiale del professore
    if (!P.profNotes.some(n => /Lesson 0 · consegne, relazione finale e regole/.test(n.title))) {
      P.profNotes.push(Object.assign(Factory.profNote(), {
        title: 'Lesson 0 · consegne, relazione finale e regole', category: 'INDICAZIONE UFFICIALE', importance: 'CRITICA', source: 'Lezione', applied: true, notes: 'Recepita nell\'app: struttura del capitolo 2, pagine per sezione, consegne, regole e controlli.',
        content: 'Slide "Deliverables at a Glance", "Guidelines for the Final Report", "Rules & Deadlines to Remember" (Lesson 0).\n\n' +
          '**Consegne** (caricare ogni file su ' + this.TEAMS_CHANNEL + ' come name_of_the_group_D#, es. ' + team + '_D2.pdf)\n' +
          this.DELIVERABLES.map(D => '- D' + D.n + ' · ' + D.en + ' — .' + D.fmt + ' — ' + U.fmtDate(D.due)).join('\n') +
          '\n- D1, D2 e D3 non hanno un voto proprio, ma il feedback orienta la relazione finale.\n\n' +
          '**Relazione finale: pagine**\n- Summary: 2\n- 1. The Company & Its Business Processes: 5–6\n- 2. The BPM Project: 25–30 (2.1 process & system · 2.2 mapping & modelling · 2.3 quantitative analysis · 2.4 critical factors · 2.5 improvement / TO-BE redesign)\n- 3. Conclusions: 1–2\n- Appendix: solo diagrammi non citati nel testo\n- Massimo 40 pagine in tutto. Citare ogni articolo nel testo, con reference list completa alla fine. Didascalia su ogni figura e tabella.\n\n' +
          '**Regole**\n' + this.RULES.slice(0, 4).map(r => '- ' + r[1]).join('\n')
      }));
    }
    // linee guida
    const gl = (title, description, extra) => { if (P.guidelines.some(g => U.norm(g.title) === U.norm(title))) return; P.guidelines.push(Object.assign(Factory.guideline(), { title, description, source: 'CONSEGNA', sourceRef: 'Lesson 0', priority: 'ALTA', mandatory: true }, extra || {})); };
    gl('Pagine per sezione della relazione finale', 'Summary 2 · Cap. 1 Company & business processes 5–6 · Cap. 2 BPM project 25–30 · Cap. 3 Conclusions 1–2 · Appendix solo diagrammi non citati. Massimo 40 pagine in tutto.');
    gl('Citare ogni articolo nel testo con reference list completa', 'Ogni articolo usato va citato nel testo e compare nella lista dei riferimenti alla fine (References); ogni voce della lista è citata nel testo.');
    gl('Didascalia su ogni figura e tabella', 'Ogni figura e ogni tabella ha numero e didascalia (es. "Figure 3: AS-IS BPMN diagram").');
    gl('Appendice solo per diagrammi non citati nel testo', 'Le figure citate nel testo stanno nel capitolo; in Appendix vanno solo i diagrammi di dettaglio non citati.');
    gl('Nome dei file consegnati: ' + team + '_D#', 'Caricare ogni consegna su ' + this.TEAMS_CHANNEL + ' come name_of_the_group_D# (D1 .docx; D2, D3, D4 .pdf), es. ' + team + '_D2.pdf.', { priority: 'MEDIA' });
    gl('Presentazione e discussione in inglese', 'Presentazioni e discussioni (Milestone 8) si fanno in inglese.', { priority: 'MEDIA' });
    gl('Consegne puntuali', '−1 punto per ogni 24 ore di ritardo; un D4 in ritardo esclude il team dalla Milestone 8 con altri −3 punti.');
    P.courseVersion = this.VERSION;
    History.log('Progetto aggiornato con i parametri del corso (Lesson 0): struttura del capitolo 2 (2.1–2.5), pagine per sezione, consegne e regole', 'progetto');
    Store.touch();
    if (!silent) { App.refresh(); UI.toast('Parametri del corso applicati'); }
  },
  maybeOffer() {
    const P = Store.P;
    if (!this.isBpm(P) || (P.courseVersion || 0) >= this.VERSION) return;
    setTimeout(() => {
      if (UI.$('.modal-back')) return;   // c'è già un'altra finestra aperta: si chiede al prossimo avvio
      const m = UI.modal({ title: 'Nuovi parametri del corso', size: 'narrow',
        body: '<p>Dalle slide della Lesson 0:</p><ul class="small mt-s"><li>capitolo 2 della relazione organizzato come chiede il corso: <b>2.1 processo e sistema · 2.2 mappatura e modellazione · 2.3 analisi quantitativa · 2.4 fattori critici · 2.5 TO-BE</b></li><li><b>pagine per sezione</b> e massimo 40 pagine, con stima automatica</li><li>formato e <b>nome del file</b> di ogni consegna (es. ' + U.esc(this.team()) + '_D2.pdf) e penalità di ritardo</li><li>controlli su didascalie e citazioni</li></ul><p class="small mt-s">Il testo già scritto resta: le sezioni vengono solo spostate e rinumerate, e prima viene salvata una versione della relazione.</p>',
        footer: '<button class="btn" data-later>Più tardi</button><button class="btn primary" data-go>Aggiorna</button>' });
      m.el.querySelector('[data-later]').onclick = () => m.close();
      m.el.querySelector('[data-go]').onclick = async () => { m.close(); await Course.apply(false); };
    }, 900);
  },

  /* ---------- riquadro con regole e consegne (pagina Scadenze) ---------- */
  rulesCard() {
    if (!this.isBpm()) return '';
    const P = Store.P, team = this.team();
    const rows = this.DELIVERABLES.map(D => {
      const dl = P.deadlines.find(d => this.delivOf(d) === D.n);
      const done = dl && dl.status === 'COMPLETATA';
      const late = dl ? this.lateness(dl) : null;
      return '<tr><td><b>D' + D.n + '</b></td><td class="small">' + U.esc(D.it) + '</td><td class="small nowrap">.' + D.fmt + '</td><td class="small nowrap">' + U.fmtDate(dl && dl.date || D.due) + (dl && dl.time ? ' ' + dl.time : '') + '</td><td class="small"><code>' + U.esc(team + '_D' + D.n + '.' + D.fmt) + '</code></td><td class="small">' + (done ? '✓ consegnato' : late ? '<span style="color:var(--risk)">' + U.esc(late.text) + '</span>' : '') + '</td></tr>';
    }).join('');
    return '<details class="card mb course-card"><summary><b>Consegne e regole del corso</b> <span class="small muted">— formato, nome del file su ' + U.esc(this.TEAMS_CHANNEL) + ', penalità</span></summary>' +
      '<div class="table-wrap mt-s"><table class="tbl"><tr><th>#</th><th>Contenuto</th><th>Formato</th><th>Scadenza</th><th>Nome del file</th><th></th></tr>' + rows + '</table></div>' +
      '<ul class="course-rules mt-s">' + this.RULES.map(r => '<li><span>' + r[0] + '</span>' + U.esc(r[1]) + '</li>').join('') + '</ul></details>';
  }
};

/* ---------- controlli del corso nel Project Checker ---------- */
(() => {
  if (typeof Checker === 'undefined' || !Checker.RULES) return;
  Checker.RULES.push(
    { id: 'course-pages', group: 'relazione', name: 'Pagine della relazione (linee guida del corso)',
      run(ctx) {
        if (!Course.isBpm(ctx.P)) return [];
        const pg = Course.pages(), out = [];
        const tot = Math.round(pg.total);
        if (pg.total > Course.MAX_PAGES) out.push({ key: 'total', category: 'LIMITE SUPERATO', element: 'Relazione', ref: { route: 'report' },
          problem: 'La relazione stimata è di circa ' + tot + ' pagine: il massimo è ' + Course.MAX_PAGES + '.', reason: 'Linee guida della relazione finale (Lesson 0): massimo 40 pagine in tutto.',
          source: 'Linee guida del corso', confidence: 70, severity: ctx.days !== null && ctx.days <= 14 ? 'PROBABILE ERRORE' : 'ATTENZIONE', suggestion: 'Accorcia il testo o sposta i diagrammi non citati in Appendix. Verifica il numero esatto nel Word.' });
        pg.chapters.forEach(c => {
          if (!c.budget || c.pages <= c.budget[2] + 0.5) return;
          out.push({ key: c.s.id + Math.round(c.pages), category: 'LIMITE SUPERATO', element: 'Relazione › ' + c.s.title, ref: { route: 'report', id: c.s.id },
            problem: '"' + c.s.title + '" è di circa ' + Math.round(c.pages * 10) / 10 + ' pagine; il corso indica ' + (c.budget[1] === c.budget[2] ? c.budget[1] : c.budget[1] + '–' + c.budget[2]) + '.', reason: 'Pagine per sezione indicate nelle linee guida della relazione finale.',
            source: 'Linee guida del corso', confidence: 60, severity: 'ATTENZIONE', suggestion: 'Riduci questa parte o sposta i dettagli in Appendix (solo diagrammi non citati nel testo).' });
        });
        return out;
      } },
    { id: 'course-captions', group: 'relazione', name: 'Figure e tabelle senza didascalia',
      run(ctx) {
        if (!Course.isBpm(ctx.P)) return [];
        const assign = LiveReport.assignments(), out = [];
        Object.values(assign).flat().forEach(({ phase, block: b }) => {
          if (!['table', 'chart', 'image'].includes(b.type) || !LiveReport.hasContent(b)) return;
          const cap = b.type === 'image' ? (b.caption || b.title) : b.title;
          if (U.str(cap).trim()) return;
          out.push({ key: b.id, category: 'VALORE MANCANTE', element: 'Fase ' + (phase.order + 1) + ' › ' + Model.blockLabel(b), ref: { route: 'dev', id: phase.id, blockId: b.id },
            problem: (b.type === 'table' ? 'Tabella' : b.type === 'chart' ? 'Grafico' : 'Figura') + ' inclusa nella relazione senza didascalia.', reason: 'Linee guida del corso: ogni figura e ogni tabella deve avere la didascalia.',
            source: 'Linee guida del corso', confidence: 95, severity: 'ATTENZIONE', suggestion: 'Scrivi un titolo/didascalia che dica cosa mostra (es. "AS-IS BPMN diagram of the order process").' });
        });
        return out;
      } },
    { id: 'course-citations', group: 'relazione', name: 'Citazioni e reference list',
      run(ctx) {
        if (!Course.isBpm(ctx.P)) return [];
        const r = Course.references();
        if (!r) return [];
        const out = [];
        r.uncited.forEach(it => out.push({ key: 'u' + U.norm(it).slice(0, 40), category: 'RIFERIMENTO NON CITATO', element: 'Relazione › ' + r.ref.title, ref: { route: 'report', id: r.ref.id },
          problem: 'Voce della reference list mai citata nel testo: "' + U.truncate(it, 110) + '"', reason: 'Linee guida del corso: ogni articolo va citato nel testo, con reference list completa alla fine.',
          source: 'Linee guida del corso', confidence: 60, severity: 'ATTENZIONE', suggestion: 'Cita l\'articolo nel punto del testo in cui lo usate (es. "(Autore, anno)") oppure toglilo dalla lista.' }));
        r.missing.forEach(c => out.push({ key: 'm' + c, category: 'RIFERIMENTO MANCANTE', element: 'Relazione › ' + r.ref.title, ref: { route: 'report', id: r.ref.id },
          problem: 'Citazione ' + c + ' nel testo senza voce corrispondente in ' + r.ref.title + '.', reason: 'La reference list alla fine deve essere completa.',
          source: 'Linee guida del corso', confidence: 70, severity: 'ATTENZIONE', suggestion: 'Aggiungi il riferimento completo nella sezione ' + r.ref.title + '.' }));
        return out;
      } },
    { id: 'course-late', group: 'scadenze', name: 'Consegne in ritardo (penalità del corso)',
      run(ctx) {
        return ctx.P.deadlines.map(d => ({ d, l: Course.lateness(d) })).filter(x => x.l).map(({ d, l }) => ({ key: d.id + l.points, category: 'SCADENZA SUPERATA', element: 'Scadenza › ' + d.title, ref: { route: 'deadlines', id: d.id },
          problem: 'D' + l.n + ' risulta non consegnato da ' + l.hours + ' ore. ' + l.text, reason: 'Regole del corso: −1 punto ogni 24 ore di ritardo' + (l.n === 4 ? '; D4 in ritardo = esclusione dalla Milestone 8 e −3 punti.' : '.'),
          source: 'Regole del corso', confidence: 100, severity: 'CRITICO', suggestion: 'Se l\'avete già caricato su MS Teams, premete "Fatto" sulla scadenza.' }));
      } }
  );
})();

/* ---------- agganci alle viste ---------- */
Views.report.render = (orig => function (params) {
  const h = orig.call(this, params);
  if (!Course.isBpm()) return h;
  const i = h.indexOf('<div class="rep-layout">');
  return i < 0 ? h : h.slice(0, i) + Course.pagesCard(!!params.id) + h.slice(i);
})(Views.report.render);
Views.deadlines.render = (orig => function (params) {
  const h = orig.call(this, params);
  const card = Course.rulesCard();
  if (!card) return h;
  const s = h.indexOf('<div class="page-head">'), i = s < 0 ? -1 : h.indexOf('</div></div>', s);   // fine dell'intestazione della pagina
  return i < 0 ? card + h : h.slice(0, i + 12) + card + h.slice(i + 12);
})(Views.deadlines.render);
Actions['course-apply'] = async () => {
  if (!(await UI.confirm('Applicare i parametri del corso (Lesson 0)?\n\nCapitolo 2 come 2.1–2.5, pagine per sezione, consegne con formato e nome del file, regole e controlli. Il testo già scritto resta; prima viene salvata una versione della relazione.', { okLabel: 'Applica' }))) return;
  await Course.apply(false);
};
