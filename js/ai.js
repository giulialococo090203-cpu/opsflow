/* =====================================================================
   CLAUDE · ANALISI LOCALI
   - Analisi della consegna (classificazione per frasi, senza AI)
   - Analisi degli esempi precedenti: estrae il METODO, non il contenuto
   - PREPARA PER CLAUDE: pacchetti di testo strutturati da copiare
   - PREPARA PROMPT RELAZIONE
   - IMPORTA RISPOSTA CLAUDE: parser in proposte da accettare/rifiutare
   - Architettura per una futura integrazione API (solo via backend)
   ===================================================================== */
'use strict';

const AI = (() => {

  /* ---------- ANALISI DELLA CONSEGNA ---------- */
  const BRIEF_RULES = [
    { cat: 'deadlines', re: /\b(entro|scadenz|deadline|termine ultimo|data di consegna|da consegnare il|due (date|by)|by the)\b/i },
    { cat: 'constraints', re: /\b(massimo|minimo|al massimo|non (deve|devono|può|possono|è consentit)|vietat|limit|max\.?|min\.?|pagine|parole|caratteri|formato|font|interlinea|lunghezza|at most|no more than|maximum|minimum|pages|words|only|esclusivamente|soltanto)\b/i },
    { cat: 'deliverables', re: /\b(relazione|report|elaborat|presentazion|slide|poster|deliverable|documento finale|file|codice|allegat|tavol|consegnare|redigere|produrre|caricare|upload|submit|presentare)\b/i },
    { cat: 'mandatory', re: /\b(deve|devono|dovrà|dovranno|obbligatori|necessari|è richiest|sono richiest|richiede|bisogna|occorre|è indispensabile|must|required|shall|have to|need to|mandatory)\b/i },
    { cat: 'results', re: /\b(risultat|calcolar|stimar|determinar|valutar|kpi|indicator|confront|ottimizz|miglior|output|performance|simulaz|scenario|to-be|as-is|metric)/i },
    { cat: 'data', re: /\b(dati|dato|dataset|raccolt|intervist|misur|rilev|campion|questionari|data collection|collect|interview|survey|records?)\b/i },
    { cat: 'objectives', re: /\b(obiettiv|scopo|finalità|goal|aim|objective|purpose|si propone|mira a|l'obiettivo|intende)\b/i }
  ];
  function analyzeBrief(text) {
    const out = { items: [], unclassified: [], dates: U.findDates(text) };
    U.sentences(text).forEach(s => {
      if (s.length < 8) return;
      const hasDate = U.findDates(s).length > 0;
      let cat = null;
      if (hasDate) cat = 'deadlines';
      else for (const r of BRIEF_RULES) { if (r.re.test(s)) { cat = r.cat; break; } }
      if (cat) out.items.push({ cat, text: s.replace(/^[-*•\d.)\s]+/, '').trim(), date: hasDate ? U.findDates(s)[0].date : '' });
      else out.unclassified.push(s);
    });
    if (!out.items.some(i => i.cat === 'objectives') && out.unclassified.length) {
      out.items.unshift({ cat: 'objectives', text: out.unclassified.shift(), date: '', guessed: true });
    }
    return out;
  }

  /* ---------- ANALISI ESEMPI (metodo, non contenuto) ---------- */
  const STOP = new Set(('alla allo agli alle anche ancora avere aveva come con cosa dalla dalle degli delle della dello dove essere fare gli hanno il la le lo loro molto nella nelle nello negli non per però più poi quale quali quando quello questa queste questi questo sono sulla sulle stato stata stati tale tra una uno che chi del dei dal nel nei sul sui così ogni anche quindi inoltre mentre sono essere viene vengono può possono devono deve with from that this these those their there which when where while what have been were also into about than then they them such each other more most only some very will would could should shall being does done using used based between through within without after before under over well also figure table page '
    + 'company process processes business management model analysis section chapter').split(/\s+/));
  function analyzeExample(ex) {
    const text = U.str(ex.text);
    const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
    const headings = [];
    lines.forEach(l => {
      if (l.length > 90) return;
      const numbered = /^(\d+(?:\.\d+){0,3})\.?\s+[A-ZÀ-Ü][^.]{2,}$/.test(l);
      const caps = /^[A-ZÀ-Ü0-9 '’&\-:]{6,}$/.test(l) && l.split(/\s+/).length >= 2;
      const md = /^#{1,4}\s+/.test(l);
      if ((numbered || caps || md) && !/\.{4,}/.test(l)) headings.push(l.replace(/^#+\s*/, '').replace(/\s*\.{3,}\s*\d+$/, ''));
    });
    const toc = lines.filter(l => /\.{4,}\s*\d+$/.test(l)).map(l => l.replace(/\s*\.{4,}\s*\d+$/, '').trim());
    const struct = (toc.length >= 4 ? toc : headings).slice(0, 60);
    const formulas = lines.filter(l => (/[=≈≤≥]/.test(l) && /[A-Za-z]/.test(l) && /[\d+\-*/^()]/.test(l) && l.length < 160) || /\\(frac|sum|sqrt|cdot|alpha|beta|sigma|mu|lambda)/.test(l)).slice(0, 20);
    const calcs = lines.filter(l => /\d+\s*[+\-*/×x]\s*\d+/.test(l) && l.length < 160).slice(0, 15);
    const charts = lines.filter(l => /^(figura|figure|fig\.|grafico|chart|diagramma|diagram)\s*\d*/i.test(l) || /\b(grafico|diagramma|chart|histogram|istogramma|gantt|bpmn|idef0|uml|flowchart|swimlane)\b/i.test(l)).slice(0, 25);
    const tables = lines.filter(l => /^(tabella|table|tab\.)\s*\d+/i.test(l)).slice(0, 25);
    const methodology = U.sentences(text).filter(s => /\b(metodo|metodologi|approccio|procedura|modell|framework|tecnica|method|methodolog|approach|procedure|technique|bpmn|idef0|uml|simulat|arena|as-is|to-be|kpi|value chain|sipoc|swot|pareto|lean|six sigma|benchmark)/i.test(s)).slice(0, 20);
    const freq = {};
    (text.toLowerCase().match(/[a-zà-ÿ][a-zà-ÿ\-]{4,}/g) || []).forEach(w => { if (!STOP.has(w)) freq[w] = (freq[w] || 0) + 1; });
    const acr = {};
    (text.match(/\b[A-Z]{2,6}(?:-[A-Z]{2,6})?\b/g) || []).forEach(w => { acr[w] = (acr[w] || 0) + 1; });
    const terms = Object.entries(freq).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([w, n]) => w + ' (' + n + ')');
    const acronyms = Object.entries(acr).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([w, n]) => w + ' (' + n + ')');
    const order = struct.filter(h => /^\d+\.?\s/.test(h) && !/^\d+\.\d/.test(h)).slice(0, 15);
    return {
      analyzedAt: U.nowISO(), words: U.words(text),
      structure: struct, order: order.length ? order : struct.slice(0, 12), methodology, formulas, calculations: calcs, charts, tables,
      terminology: terms, acronyms,
      recurringErrors: U.str(ex.knownErrors).split(/\n|;/).map(s => s.trim()).filter(Boolean),
      counts: { headings: struct.length, formulas: formulas.length, charts: charts.length, tables: tables.length }
    };
  }
  function synthesizeExamples(examples) {
    const analyzed = examples.filter(e => e.method);
    if (!analyzed.length) return '';
    const normH = h => U.norm(h).replace(/^[\d.\s]+/, '').replace(/[^a-z0-9 ]/g, '').trim();
    const hCount = {}, tCount = {}, mCount = {};
    analyzed.forEach(e => {
      new Set(e.method.structure.map(normH).filter(Boolean)).forEach(h => { hCount[h] = (hCount[h] || 0) + 1; });
      new Set(e.method.terminology.map(t => t.replace(/\s*\(\d+\)$/, ''))).forEach(t => { tCount[t] = (tCount[t] || 0) + 1; });
      new Set(e.method.methodology.join(' ').toLowerCase().match(/\b(bpmn|idef0|uml|simulaz\w*|simulation|arena|as-is|to-be|kpi|value chain|sipoc|swot|pareto|lean|six sigma|benchmark\w*|gantt|swimlane|flowchart)\b/g) || []).forEach(m => { mCount[m] = (mCount[m] || 0) + 1; });
    });
    const min = analyzed.length >= 2 ? 2 : 1;
    const common = Object.entries(hCount).filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).slice(0, 25);
    const terms = Object.entries(tCount).filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).slice(0, 25);
    const methods = Object.entries(mCount).sort((a, b) => b[1] - a[1]);
    const best = analyzed.filter(e => U.parseNum(e.grade) >= 27 || /30|lode/i.test(U.str(e.grade)));
    const errs = analyzed.flatMap(e => e.method.recurringErrors.map(x => '- ' + x + ' _(' + e.title + ')_'));
    const avg = k => Math.round(analyzed.reduce((a, e) => a + (e.method.counts[k] || 0), 0) / analyzed.length);
    let md = '## Sintesi del metodo dagli esempi (' + analyzed.length + ' analizzati)\n\n';
    md += '_Generata localmente il ' + U.fmtDateTime(U.nowISO()) + '. Descrive il metodo ricorrente, non riporta contenuti da copiare. Verifica e correggi liberamente._\n\n';
    md += '### Struttura ricorrente\n' + (common.length ? common.map(([h, n]) => '- ' + h + ' (in ' + n + '/' + analyzed.length + ')').join('\n') : '- Nessun titolo in comune rilevato') + '\n\n';
    md += '### Metodologie e strumenti citati\n' + (methods.length ? methods.map(([m, n]) => '- ' + m.toUpperCase() + ' (in ' + n + '/' + analyzed.length + ')').join('\n') : '- Nessuna metodologia riconosciuta') + '\n\n';
    md += '### Terminologia comune\n' + (terms.length ? terms.map(([t]) => t).join(', ') : 'Nessun termine comune') + '\n\n';
    md += '### Elementi tipici (media per elaborato)\n- Titoli/sezioni: ' + avg('headings') + '\n- Tabelle citate: ' + avg('tables') + '\n- Figure/grafici/diagrammi citati: ' + avg('charts') + '\n- Formule: ' + avg('formulas') + '\n\n';
    md += '### Errori ricorrenti noti\n' + (errs.length ? errs.join('\n') : '- Nessun errore registrato negli esempi') + '\n\n';
    md += '### Lavori migliori\n' + (best.length ? best.map(e => '- ' + e.title + ' (voto ' + e.grade + (e.corrected ? ', corretto dal professore' : '') + '): ' + e.method.counts.tables + ' tabelle, ' + e.method.counts.charts + ' figure/diagrammi, ' + e.method.words + ' parole').join('\n') : '- Nessun esempio con voto ≥ 27 registrato') + '\n';
    return md;
  }

  /* ---------- PACCHETTI PER CLAUDE ---------- */
  const SECTIONS = [
    ['info', 'Dati del progetto'], ['brief', 'Consegna ufficiale e analisi'], ['prof', 'Indicazioni del professore'],
    ['guidelines', 'Linee guida'], ['examples', 'Esempi precedenti (metodo)'], ['project', 'Progetto attuale (fasi e contenuti)'],
    ['results', 'Risultati'], ['issues', 'Errori aperti'], ['questions', 'Domande per il professore'], ['deadlines', 'Scadenze e revisioni'], ['report', 'Relazione attuale']
  ];
  const TASKS = {
    guidelines: { label: 'Genera linee guida', defaults: ['info', 'brief', 'prof', 'examples'] },
    phases: { label: 'Trasforma le linee guida in fasi operative', defaults: ['info', 'brief', 'guidelines', 'deadlines'] },
    review: { label: 'Revisione critica del progetto (errori e incoerenze)', defaults: ['info', 'brief', 'prof', 'guidelines', 'project', 'results', 'issues'] },
    questions: { label: 'Suggerisci domande da fare al professore', defaults: ['info', 'brief', 'prof', 'guidelines', 'issues', 'questions'] },
    free: { label: 'Richiesta libera', defaults: ['info', 'brief', 'prof'] }
  };
  const HIERARCHY = C.SOURCES.map(s => s.rank + '. ' + s.label).join('\n');

  function blockToText(b, num) {
    const label = (num[b.id] || C.BLOCK_TYPES[b.type]) + (b.title ? ' — ' + b.title : '');
    const refs = b.refs.length ? '\n  Deriva da: ' + b.refs.map(r => Model.refLabel(r)).join('; ') : '';
    const st = ' [stato: ' + b.status + ']';
    switch (b.type) {
      case 'table': {
        const head = '| ' + b.columns.join(' | ') + ' |\n|' + b.columns.map(() => '---').join('|') + '|\n';
        return '#### ' + label + st + '\n' + head + b.rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + (b.notes ? '\nNote: ' + b.notes : '') + refs;
      }
      case 'calc': return '#### ' + label + st + '\nEspressione: ' + b.expression + '\nVariabili: ' + U.arr(b.variables).map(v => v.name + ' = ' + v.value + (v.unit ? ' ' + v.unit : '')).join('; ') +
        '\nRisultato' + (b.resultName ? ' (' + b.resultName + ')' : '') + ': ' + (b.statedResult || U.fmtNum(b.computed)) + (b.unit ? ' ' + b.unit : '') + (b.content ? '\nNote: ' + b.content : '') + refs;
      case 'result': return '#### ' + label + st + '\n' + b.name + ' = ' + b.value + (b.unit ? ' ' + b.unit : '') + (b.content ? '\n' + b.content : '') + refs;
      case 'formula': return '#### ' + label + st + '\n$$' + b.latex + '$$' + (b.content ? '\n' + b.content : '') + refs;
      case 'chart': return '#### ' + label + st + '\nTipo: ' + b.chartType + '; asse X: ' + b.xLabel + (b.xUnit ? ' [' + b.xUnit + ']' : '') + '; asse Y: ' + b.yLabel + (b.yUnit ? ' [' + b.yUnit + ']' : '') +
        '\nEtichette: ' + b.labels + '\n' + U.arr(b.series).map(s => 'Serie "' + s.name + '": ' + s.data).join('\n') + refs;
      case 'image': return '#### ' + label + st + '\n(immagine) Didascalia: ' + (b.caption || '—') + refs;
      case 'attachment': return '#### ' + label + '\nFile: ' + U.arr(b.fileIds).map(id => (Model.get('files', id) || {}).name).filter(Boolean).join(', ') + refs;
      default: return '#### ' + label + st + '\n' + U.str(b.content) + refs;
    }
  }

  function section(key, P, opts = {}) {
    const num = Model.numbering().map;
    switch (key) {
      case 'info': {
        const i = P.info;
        return '## DATI DEL PROGETTO\n- Nome: ' + i.name + '\n- Materia: ' + i.subject + '\n- Corso di laurea: ' + i.degree + '\n- Docente: ' + i.professor + '\n- Anno accademico: ' + i.year +
          '\n- Componenti: ' + i.members.join(', ') + '\n- Consegna finale: ' + U.fmtDate(i.dueDate) + (Metrics.daysToDue() !== null ? ' (' + U.relDays(i.dueDate) + ')' : '') +
          '\n- Obiettivo: ' + i.objective + '\n- Descrizione: ' + i.description + (i.notes ? '\n- Note: ' + i.notes : '');
      }
      case 'brief': {
        let s = '## CONSEGNA UFFICIALE (testo originale, priorità 2)\n"""\n' + (P.brief.original || '(non inserita)') + '\n"""';
        if (P.brief.analysis.length) s += '\n\n### Analisi della consegna\n' + C.BRIEF_CATS.map(c => {
          const it = P.brief.analysis.filter(a => a.cat === c.id);
          return it.length ? '**' + c.label + '**\n' + it.map(a => '- [' + (a.done ? 'x' : ' ') + '] ' + a.text).join('\n') : '';
        }).filter(Boolean).join('\n');
        return s;
      }
      case 'prof': {
        const ns = P.profNotes.slice().sort((a, b) => (C.SOURCE_BY_ID[C.PROF_CAT_SOURCE[a.category]].rank - C.SOURCE_BY_ID[C.PROF_CAT_SOURCE[b.category]].rank) || U.str(b.date).localeCompare(U.str(a.date)));
        return '## INDICAZIONI DEL PROFESSORE (ordinate per priorità)\n' + (ns.length ? ns.map(n => '- [' + n.category + ' · ' + U.fmtDate(n.date) + ' · ' + n.source + ' · importanza ' + n.importance + (n.applied ? ' · recepita' : ' · DA RECEPIRE') + '] **' + n.title + '**: ' + U.str(n.content).replace(/\n+/g, ' ')).join('\n') : '(nessuna)') +
          (P.revisions.some(r => r.corrections || r.indications) ? '\n\n### Dalle revisioni\n' + P.revisions.filter(r => r.corrections || r.indications).map(r => '- Revisione ' + U.fmtDate(r.date) + ': correzioni: ' + (r.corrections || '—') + ' · indicazioni: ' + (r.indications || '—')).join('\n') : '');
      }
      case 'guidelines': return '## LINEE GUIDA DEL PROGETTO\n' + (P.guidelines.length ? P.guidelines.map((g, i) => (i + 1) + '. **' + g.title + '** [' + g.status + ' · priorità ' + g.priority + (g.mandatory ? ' · obbligatoria' : '') + ' · fonte: ' + (C.SOURCE_BY_ID[g.source] || {}).label + ']\n   ' + U.str(g.description).replace(/\n+/g, ' ') + (g.motivation ? '\n   Motivazione: ' + g.motivation : '')).join('\n') : '(nessuna)');
      case 'examples': {
        let s = '## ESEMPI PRECEDENTI (da usare per il METODO, non per copiare contenuti)\n';
        s += P.examples.map(e => '### ' + e.title + ' (' + [e.year, e.subject, e.grade ? 'voto ' + e.grade : '', e.corrected ? 'corretto dal professore' : ''].filter(Boolean).join(' · ') + ')\n' + (e.description || '') +
          (e.method ? '\nStruttura: ' + e.method.structure.slice(0, 25).join(' / ') + '\nMetodologia: ' + e.method.methodology.slice(0, 6).join(' ') : '') + (e.knownErrors ? '\nErrori noti: ' + e.knownErrors : '') +
          (opts.fullExamples && e.text ? '\nTesto:\n"""\n' + U.truncate(e.text, 12000) + '\n"""' : '')).join('\n\n') || '(nessuno)';
        if (P.examplesSynthesis) s += '\n\n' + P.examplesSynthesis;
        return s;
      }
      case 'project': return '## PROGETTO ATTUALE\n' + (Model.phasesSorted().map(ph => {
        const pr = Metrics.phaseProgress(ph);
        return '### FASE ' + (ph.order + 1) + ' — ' + ph.title + ' (avanzamento ' + pr.pct + '%)\n' + (ph.description ? ph.description + '\n' : '') +
          (ph.checklist.length ? 'Checklist: ' + ph.checklist.map(c => (c.done ? '[x] ' : '[ ] ') + c.text).join('; ') + '\n' : '') + ph.blocks.map(b => blockToText(b, num)).join('\n\n');
      }).join('\n\n') || '(nessuna fase)');
      case 'results': {
        const rs = Model.allBlocks().filter(x => x.block.type === 'result' || (x.block.type === 'calc' && x.block.resultName));
        return '## RISULTATI REGISTRATI\n' + (rs.length ? rs.map(({ block: b }) => '- ' + (num[b.id] || '') + ' ' + (b.type === 'result' ? b.name + ' = ' + b.value + ' ' + U.str(b.unit) : b.resultName + ' = ' + (b.statedResult || U.fmtNum(b.computed)) + ' ' + U.str(b.unit)) + (b.refs.length ? ' (deriva da: ' + b.refs.map(r => Model.refLabel(r)).join('; ') + ')' : '')).join('\n') : '(nessuno)');
      }
      case 'issues': {
        const is = Metrics.openIssues();
        return '## SEGNALAZIONI APERTE DEL PROJECT CHECKER\n' + (is.length ? is.slice(0, 60).map(i => '- [' + i.severity + ' · ' + i.category + '] ' + i.element + ': ' + i.problem).join('\n') : '(nessuna)');
      }
      case 'questions': return '## DOMANDE PER IL PROFESSORE\n' + (P.questions.length ? P.questions.map(q => '- [' + q.status + '] ' + q.text + (q.answer ? ' → Risposta: ' + q.answer : '')).join('\n') : '(nessuna)');
      case 'deadlines': return '## SCADENZE E REVISIONI\n' + Metrics.deadlinesSorted(true).map(d => '- ' + U.fmtDate(d.date) + ' ' + d.title + ' [' + d.kind + ' · ' + d.status + ']').join('\n') +
        '\n' + P.revisions.map(r => '- Revisione ' + U.fmtDate(r.date) + ' [' + r.status + ']').join('\n');
      case 'report': return '## RELAZIONE ATTUALE\n' + P.report.sections.map(s => '### ' + s.title + ' [' + s.status + ']\n' + (s.content || '(vuota)')).join('\n\n');
      default: return '';
    }
  }

  function responseFormat(task) {
    switch (task) {
      case 'guidelines': return 'Rispondi SOLO con un elenco di linee guida in questo formato esatto (ripeti il blocco per ogni linea guida):\n\n### LINEA GUIDA: <titolo breve>\nDescrizione: <cosa fare concretamente>\nMotivazione: <perché, con riferimento alla fonte>\nFonte: <CONSEGNA | CORREZIONE_PROF | INDICAZIONE_PROF | CRITERI | ESEMPI_CORRETTI | STUDENTE | AI>\nRiferimento: <frase o elemento esatto da cui deriva>\nPriorità: <BASSA | MEDIA | ALTA | CRITICA>\nObbligatoria: <SÌ | NO>\n\nSe un punto della consegna è ambiguo, crea una linea guida con Fonte: AI e Priorità: ALTA che chieda di verificarlo con il professore.';
      case 'phases': return 'Rispondi SOLO con le fasi operative in questo formato (ripeti per ogni fase, in ordine):\n\n### FASE: <titolo>\nDescrizione: <obiettivo della fase>\nLinee guida collegate: <titoli separati da ;>\nChecklist:\n- <punto verificabile>\n- <punto verificabile>';
      case 'review': return 'Rispondi SOLO con le osservazioni in questo formato (ripeti per ognuna):\n\n### OSSERVAZIONE: <titolo>\nElemento: <fase/blocco/sezione interessata>\nProblema: <descrizione>\nMotivo: <perché potrebbe essere sbagliato, citando la fonte>\nSuggerimento: <come correggere>\nGravità: <INFO | ATTENZIONE | PROBABILE ERRORE | CRITICO>\nAffidabilità: <0-100>\n\nNon riscrivere il progetto: segnala soltanto.';
      case 'questions': return 'Rispondi SOLO con le domande in questo formato:\n\n### DOMANDA: <testo della domanda>\nArgomento: <argomento>\nPriorità: <BASSA | MEDIA | ALTA | CRITICA>';
      default: return 'Organizza la risposta con titoli "## ..." per facilitare l\'importazione. Ogni parte verrà valutata singolarmente prima di essere accettata.';
    }
  }

  function buildPackage({ sections, task = 'free', request = '', fullExamples = false }) {
    const P = Store.P;
    const t = TASKS[task] || TASKS.free;
    let s = '# PACCHETTO PROGETTO — ' + (P.info.name || 'Progetto') + '\n';
    s += '_Generato da Assistente Progetto il ' + U.fmtDateTime(U.nowISO()) + '_\n\n';
    s += '## ISTRUZIONI PER CLAUDE\n- Sei un assistente che aiuta lo studente a COSTRUIRE il progetto: non svolgerlo al suo posto.\n- Usa SOLO le informazioni contenute in questo pacchetto. Non inventare dati, valori, fonti o risultati.\n- Se un\'informazione manca, scrivi esplicitamente [DA VERIFICARE: …].\n- Segnala dubbi e incoerenze invece di risolverli in silenzio.\n- Rispetta questa gerarchia delle fonti (1 = priorità massima):\n' + HIERARCHY.split('\n').map(l => '  ' + l).join('\n') + '\n- Un tuo suggerimento (livello 7) non può mai contraddire le indicazioni del professore.\n\n';
    (sections || []).forEach(k => { const x = section(k, P, { fullExamples }); if (x) s += x + '\n\n'; });
    s += '## RICHIESTA: ' + t.label.toUpperCase() + '\n' + (request ? request + '\n\n' : '') + responseFormat(task) + '\n';
    return s;
  }

  function buildReportPrompt({ language = 'Italiano', style = 'accademico', sectionIds = null }) {
    const P = Store.P;
    const num = Model.numbering().map;
    const secs = P.report.sections.filter(s => !sectionIds || sectionIds.includes(s.id));
    let s = '# PROMPT RELAZIONE — ' + (P.info.name || 'Progetto') + '\n_Generato da Assistente Progetto il ' + U.fmtDateTime(U.nowISO()) + '_\n\n';
    s += '## COMPITO\nScrivi la relazione del progetto in lingua **' + language + '**, registro ' + style + ', usando ESCLUSIVAMENTE i dati qui sotto.\n\n';
    s += '## REGOLE OBBLIGATORIE\n1. Non inventare numeri, risultati, fonti o affermazioni: ogni valore numerico deve comparire nei DATI DEL PROGETTO.\n2. Riporta i numeri con lo stesso valore e la stessa unità del progetto.\n3. Cita tabelle, grafici e figure SOLO con la numerazione indicata (es. "Tabella 2", "Grafico 1"). Non citare elementi che non esistono.\n4. Le formule vanno scritte in LaTeX tra $...$ o $$...$$ e devono coincidere con quelle del progetto.\n5. Le conclusioni devono richiamare esplicitamente i risultati da cui derivano.\n6. Se per una sezione mancano informazioni, scrivi [DA COMPLETARE: cosa manca] invece di inventare.\n7. Rispetta le indicazioni del professore (priorità massima) e la consegna.\n8. Segui il modello delle relazioni degli anni precedenti (sezione MODELLO) e le note di ogni sezione, senza copiarne il testo.\n9. Restituisci il testo diviso per sezioni con intestazioni esattamente così: "## <Titolo sezione>" (senza numero). Ogni sezione deve usare i contenuti del progetto indicati tra [ ] nella STRUTTURA.\n\n';
    const rn = typeof LiveReport !== 'undefined' ? LiveReport.numbers() : {};
    const asg = typeof LiveReport !== 'undefined' ? LiveReport.assignments() : {};
    s += '## STRUTTURA RICHIESTA (formato dei D4: capitoli numerati 1. / 1.1. / 2.4.1.)\n' + secs.slice().sort((a, b) => a.order - b.order).map(x => '  '.repeat(Math.max(0, (x.level || 1) - 1)) + '- ' + (rn[x.id] ? rn[x.id] + ' ' : '') + x.title + (x.required ? ' (obbligatoria)' : '') + ((asg[x.id] || []).length ? ' [contenuti del progetto: ' + asg[x.id].map(a => blockToText(a.block, num).split('\n')[0].slice(0, 60)).join('; ') + ']' : '') + (x.notes ? ' — note: ' + x.notes : '')).join('\n') + '\n\n';
    s += section('info', P) + '\n\n' + section('brief', P) + '\n\n' + section('prof', P) + '\n\n' + section('guidelines', P) + '\n\n';
    if (P.examples.length) {
      s += '## MODELLO: RELAZIONI DEGLI ANNI PRECEDENTI\nPrendi esempio dalle relazioni precedenti per struttura, ordine dei capitoli, terminologia, livello di dettaglio e modo di presentare figure e tabelle. NON copiare frasi o contenuti: valgono solo come metodo.\n';
      s += P.examples.map(e => '- ' + e.title + (e.grade ? ' (voto ' + e.grade + ')' : '') + (e.method ? ': ' + e.method.structure.slice(0, 40).join(' / ') : '')).join('\n') + '\n\n' + (P.examplesSynthesis ? P.examplesSynthesis + '\n\n' : '');
    }
    s += '## DATI DEL PROGETTO\n' + Model.phasesSorted().map(ph => '### Fase ' + (ph.order + 1) + ' — ' + ph.title + '\n' + (ph.description ? ph.description + '\n' : '') + ph.blocks.filter(b => b.type !== 'note').map(b => blockToText(b, num)).join('\n\n')).join('\n\n') + '\n\n';
    s += section('results', P) + '\n\n';
    const existing = secs.filter(x => U.str(x.content).trim());
    if (existing.length) s += '## TESTO GIÀ SCRITTO DALLO STUDENTE (da mantenere e migliorare, non stravolgere)\n' + existing.map(x => '### ' + x.title + '\n' + x.content).join('\n\n') + '\n\n';
    s += '## FORMATO DI RISPOSTA\nSolo il testo della relazione, sezione per sezione, con "## <Titolo sezione>". Nessun commento finale.\n';
    return s;
  }

  /* ---------- PARSER RISPOSTA CLAUDE ---------- */
  function parseFields(body, keys) {
    const out = {};
    const lines = body.replace(/\r/g, '').split('\n');
    let cur = null;
    const keyRe = new RegExp('^\\s*(?:[-*]\\s*)?\\**(' + keys.join('|') + ')\\**\\s*[:：]\\s*(.*)$', 'i');
    lines.forEach(l => {
      const m = l.match(keyRe);
      if (m) { cur = keys.find(k => k.toLowerCase() === m[1].toLowerCase()); out[cur] = m[2].trim(); }
      else if (cur) out[cur] += '\n' + l;
    });
    Object.keys(out).forEach(k => { out[k] = out[k].trim(); });
    return out;
  }
  function splitHeaded(text, label) {
    const re = new RegExp('^#{1,4}\\s*' + label + '\\s*[:\\-–—]\\s*(.+)$', 'gim');
    const idx = [];
    let m;
    while ((m = re.exec(text))) idx.push({ i: m.index, end: re.lastIndex, title: m[1].replace(/\*+/g, '').trim() });
    return idx.map((h, k) => ({ title: h.title, body: text.slice(h.end, k + 1 < idx.length ? idx[k + 1].i : text.length).trim() }));
  }
  const pick = (v, list, def) => { const n = U.norm(v); const f = list.find(x => U.norm(x) === n || n.startsWith(U.norm(x))); return f || def; };

  function detectKind(text) {
    if (/#{1,4}\s*LINEA GUIDA\s*[:\-–]/i.test(text)) return 'guidelines';
    if (/#{1,4}\s*FASE\s*[:\-–]/i.test(text)) return 'phases';
    if (/#{1,4}\s*OSSERVAZIONE\s*[:\-–]/i.test(text)) return 'review';
    if (/#{1,4}\s*DOMANDA\s*[:\-–]/i.test(text)) return 'questions';
    const heads = (text.match(/^##\s+(.+)$/gm) || []).map(h => U.norm(h.replace(/^##\s+/, '')));
    const known = Store.P ? Store.P.report.sections.map(s => U.norm(s.title)) : [];
    if (heads.filter(h => known.includes(h)).length >= 2) return 'report';
    return 'generic';
  }

  function parseResponse(text, kind = 'auto') {
    const t = U.str(text).replace(/\r/g, '');
    if (kind === 'auto') kind = detectKind(t);
    const items = [];
    const mk = (type, title, fields) => items.push({ id: U.uid('pi'), type, title, fields, status: 'PROPOSTA' });
    if (kind === 'guidelines') {
      let parts = splitHeaded(t, 'LINEA GUIDA');
      if (!parts.length) parts = t.split(/\n(?=\s*\d+[.)]\s+)/).filter(p => p.trim()).map(p => { const l = p.trim().split('\n'); return { title: l[0].replace(/^\s*\d+[.)]\s*|\*+/g, '').trim(), body: l.slice(1).join('\n') }; });
      parts.forEach(p => {
        const f = parseFields(p.body, ['Descrizione', 'Motivazione', 'Fonte', 'Riferimento', 'Priorità', 'Priorita', 'Obbligatoria']);
        mk('guideline', p.title, { description: f.Descrizione || (Object.keys(f).length ? '' : p.body), motivation: f.Motivazione || '', claimedSource: pick(f.Fonte || '', C.SOURCES.map(s => s.id), ''),
          reference: f.Riferimento || '', priority: pick(f['Priorità'] || f.Priorita || '', C.PRIORITIES, 'MEDIA'), mandatory: /^s[iì]|^yes|^true/i.test(f.Obbligatoria || '') });
      });
    } else if (kind === 'phases') {
      splitHeaded(t, 'FASE').forEach(p => {
        const f = parseFields(p.body, ['Descrizione', 'Linee guida collegate', 'Checklist']);
        const checklist = U.str(f.Checklist).split('\n').map(l => l.replace(/^\s*[-*•□☐\[\]x ]+/i, '').trim()).filter(Boolean);
        mk('phase', p.title, { description: f.Descrizione || '', guidelines: U.str(f['Linee guida collegate']).split(/;|\n/).map(s => s.trim()).filter(Boolean), checklist });
      });
    } else if (kind === 'review') {
      splitHeaded(t, 'OSSERVAZIONE').forEach(p => {
        const f = parseFields(p.body, ['Elemento', 'Problema', 'Motivo', 'Suggerimento', 'Gravità', 'Gravita', 'Affidabilità', 'Affidabilita']);
        mk('issue', p.title, { element: f.Elemento || '', problem: f.Problema || p.title, reason: f.Motivo || '', suggestion: f.Suggerimento || '',
          severity: pick(f['Gravità'] || f.Gravita || '', C.SEVERITY, 'ATTENZIONE'), confidence: U.clamp(parseInt(f['Affidabilità'] || f.Affidabilita || '50', 10) || 50, 0, 100) });
      });
    } else if (kind === 'questions') {
      splitHeaded(t, 'DOMANDA').forEach(p => {
        const f = parseFields(p.body, ['Argomento', 'Priorità', 'Priorita']);
        mk('question', p.title, { topic: f.Argomento || '', priority: pick(f['Priorità'] || f.Priorita || '', C.PRIORITIES, 'MEDIA') });
      });
    } else if (kind === 'report') {
      const re = /^##\s+(.+)$/gm;
      const idx = [];
      let m;
      while ((m = re.exec(t))) idx.push({ i: m.index, end: re.lastIndex, title: m[1].trim() });
      idx.forEach((h, k) => mk('reportSection', h.title.replace(/^\d+[.)]?\s*/, ''), { content: t.slice(h.end, k + 1 < idx.length ? idx[k + 1].i : t.length).trim() }));
    }
    if (!items.length) {
      kind = 'generic';
      const re = /^#{1,3}\s+(.+)$/gm;
      const idx = [];
      let m;
      while ((m = re.exec(t))) idx.push({ i: m.index, end: re.lastIndex, title: m[1].trim() });
      if (idx.length >= 2) idx.forEach((h, k) => mk('text', h.title, { content: t.slice(h.end, k + 1 < idx.length ? idx[k + 1].i : t.length).trim() }));
      else mk('text', 'Risposta di Claude', { content: t.trim() });
    }
    return { kind, items };
  }

  /* ---------- FUTURA INTEGRAZIONE API ----------
     Per motivi di sicurezza la chiave API NON deve mai stare in questo file.
     Architettura prevista: l'app chiama un endpoint serverless dell'utente
     (es. Cloudflare Worker / Vercel Function) che conserva la chiave e
     inoltra la richiesta all'API di Claude. Il risultato rientra nello
     stesso flusso di "Importa risposta" come PROPOSTA, mai applicato in
     automatico. Funzione non esposta nell'interfaccia di questa versione. */
  async function callBackend(endpoint, prompt) {
    if (!/^https:\/\//.test(U.str(endpoint))) throw new Error('Endpoint non configurato o non sicuro (serve https)');
    const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
    if (!r.ok) throw new Error('Errore dal backend: ' + r.status);
    const j = await r.json();
    return U.str(j.text || j.content || '');
  }

  return { analyzeBrief, analyzeExample, synthesizeExamples, SECTIONS, TASKS, buildPackage, buildReportPrompt, parseResponse, detectKind, callBackend };
})();
