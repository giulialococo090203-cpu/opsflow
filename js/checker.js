/* =====================================================================
   CHECKER — Project Checker deterministico (nessuna AI necessaria)
   - Regole: completezza, coerenza numerica, unità, calcoli ricalcolati,
     riferimenti, scadenze, revisioni, consegna, indicazioni professore,
     relazione ↔ progetto, grammatica di base, terminologia, duplicati,
     regole personalizzate.
   - Ogni segnalazione ha un "fingerprint" stabile: le decisioni
     dell'utente (NON È UN ERRORE / IGNORA) vengono ricordate.
   - Non modifica mai i contenuti: crea solo schede "POSSIBILE ERRORE".
   ===================================================================== */
'use strict';

const Checker = (() => {

  /* ---------- contesto calcolato una volta per esecuzione ---------- */
  function buildContext() {
    const P = Store.P;
    const blocks = Model.allBlocks();
    const numbering = Model.numbering();
    const corpus = Model.projectCorpus();
    const projNumbers = [];
    U.extractNumbers(corpus).forEach(n => projNumbers.push(...n.values));
    blocks.forEach(({ block: b }) => {
      if (b.type === 'calc' && b.computed !== null && b.computed !== '' && isFinite(b.computed)) projNumbers.push(Number(b.computed));
      if (b.type === 'chart') U.arr(b.series).forEach(s => U.str(s.data).split(/[;\s]+/).forEach(x => { const v = U.parseNum(x); if (isFinite(v)) projNumbers.push(v); }));
      if (b.type === 'table') U.arr(b.rows).forEach(r => U.arr(r).forEach(c => U.extractNumbers(c).forEach(n => projNumbers.push(...n.values))));
    });
    const reportText = P.report.sections.map(s => s.content).join('\n\n');
    return { P, blocks, numbering, corpus, projNumbers, reportText, days: Metrics.daysToDue(), now: U.todayISO() };
  }

  const blockRef = (phase, block) => ({ route: 'dev', id: phase.id, blockId: block.id });
  const elBlock = (phase, block) => 'Fase ' + (phase.order + 1) + ' › ' + Model.blockLabel(block);
  const TEXTY = ['text', 'observation', 'interpretation', 'note'];

  /* ---------- REGOLE ---------- */
  const RULES = [

    /* ===== PROGETTO / INFORMAZIONI ===== */
    { id: 'info-missing', group: 'progetto', name: 'Dati del progetto incompleti',
      run(ctx) {
        const i = ctx.P.info, miss = [];
        if (!U.str(i.name).trim()) miss.push('nome progetto');
        if (!U.str(i.subject).trim()) miss.push('materia');
        if (!U.str(i.professor).trim()) miss.push('docente');
        if (!U.isValidDate(i.dueDate)) miss.push('data consegna finale');
        if (!U.str(i.objective).trim()) miss.push('obiettivo');
        if (!miss.length) return [];
        return [{ key: miss.join(','), category: 'INFORMAZIONE MANCANTE', element: 'Scheda progetto', ref: { route: 'project' },
          problem: 'Campi non compilati: ' + miss.join(', '), reason: 'Senza questi dati alcuni controlli (scadenze, coerenza con l\'obiettivo) non possono funzionare.',
          source: 'Regola di completezza', confidence: 100, severity: miss.includes('data consegna finale') ? 'ATTENZIONE' : 'INFO', suggestion: 'Completa i campi nella sezione Progetto.' }];
      } },

    { id: 'brief-missing', group: 'consegna', name: 'Consegna non inserita o non analizzata',
      run(ctx) {
        const b = ctx.P.brief;
        if (!U.str(b.original).trim()) return [{ key: 'none', category: 'INFORMAZIONE MANCANTE', element: 'Consegna', ref: { route: 'brief' },
          problem: 'La consegna ufficiale non è stata inserita.', reason: 'La consegna è la fonte n.2 della gerarchia: senza di essa non è possibile verificare i requisiti.',
          source: 'Gerarchia delle fonti', confidence: 100, severity: 'ATTENZIONE', suggestion: 'Incolla il testo integrale della consegna nella sezione Consegna.' }];
        if (!b.analysis.length) return [{ key: 'noanalysis', category: 'SEZIONE INCOMPLETA', element: 'Analisi della consegna', ref: { route: 'brief' },
          problem: 'La consegna non è stata suddivisa in obiettivi, vincoli ed elementi obbligatori.', reason: 'Il checker usa queste voci per verificare le richieste non ancora soddisfatte.',
          source: 'Regola di completezza', confidence: 90, severity: 'INFO', suggestion: 'Usa "Analizza consegna" e accetta le voci corrette.' }];
        return [];
      } },

    { id: 'brief-items', group: 'consegna', name: 'Richieste della consegna non soddisfatte',
      run(ctx) {
        const sev = ctx.days === null ? 'INFO' : ctx.days <= 7 ? 'PROBABILE ERRORE' : ctx.days <= 21 ? 'ATTENZIONE' : 'INFO';
        return ctx.P.brief.analysis.filter(a => ['mandatory', 'deliverables', 'results', 'data'].includes(a.cat) && !a.done).map(a => ({
          key: a.id, category: 'REQUISITO NON COMPLETATO', element: 'Consegna › ' + (C.BRIEF_CATS.find(c => c.id === a.cat) || {}).label, ref: { route: 'brief', id: a.id },
          problem: 'Richiesta non ancora segnata come soddisfatta: "' + U.truncate(a.text, 120) + '"',
          reason: 'È un elemento della consegna ufficiale' + (ctx.days !== null ? ' e mancano ' + ctx.days + ' giorni alla consegna.' : '.'),
          source: 'Consegna ufficiale', confidence: 90, severity: sev, suggestion: 'Quando è soddisfatta, spuntala nell\'analisi della consegna.' }));
      } },

    { id: 'prof-unapplied', group: 'professore', name: 'Indicazioni del professore non recepite',
      run(ctx) {
        return ctx.P.profNotes.filter(n => ['CORREZIONE', 'REQUISITO', 'INDICAZIONE UFFICIALE'].includes(n.category) && !n.applied).map(n => ({
          key: n.id, category: 'RICHIESTA PROFESSORE NON SODDISFATTA', element: 'Materiale professore › ' + n.title, ref: { route: 'prof', id: n.id },
          problem: n.category + ' del ' + U.fmtDate(n.date) + ' non ancora segnata come recepita: "' + U.truncate(n.content || n.title, 120) + '"',
          reason: 'Fonte: ' + C.SOURCE_BY_ID[C.PROF_CAT_SOURCE[n.category]].label + ' (priorità ' + C.SOURCE_BY_ID[C.PROF_CAT_SOURCE[n.category]].rank + ' nella gerarchia).',
          source: n.source + ' ' + U.fmtDate(n.date), confidence: 90, severity: n.category === 'CORREZIONE' ? 'PROBABILE ERRORE' : 'ATTENZIONE',
          suggestion: 'Applica l\'indicazione e segnala "Recepita" nella scheda.' }));
      } },

    { id: 'guideline-mandatory', group: 'linee guida', name: 'Linee guida obbligatorie non completate',
      run(ctx) {
        return ctx.P.guidelines.filter(g => (g.mandatory || g.priority === 'CRITICA') && !['COMPLETATA', 'APPROVATA'].includes(g.status)).map(g => ({
          key: g.id + g.status, category: 'REQUISITO NON COMPLETATO', element: 'Linea guida › ' + g.title, ref: { route: 'guidelines', id: g.id },
          problem: 'Linea guida obbligatoria in stato "' + g.status + '".', reason: 'Fonte: ' + (C.SOURCE_BY_ID[g.source] || {}).label + (ctx.days !== null ? '. Giorni alla consegna: ' + ctx.days + '.' : '.'),
          source: 'Linee guida del progetto', confidence: 95, severity: ctx.days !== null && ctx.days <= 7 ? 'PROBABILE ERRORE' : ctx.days !== null && ctx.days <= 21 ? 'ATTENZIONE' : 'INFO',
          suggestion: 'Completa la linea guida o rivedi la sua priorità.' }));
      } },

    { id: 'guideline-ai-unverified', group: 'linee guida', name: 'Linee guida AI non verificate',
      run(ctx) {
        return ctx.P.guidelines.filter(g => g.source === 'AI' && g.status === 'APPROVATA' && !U.str(g.sourceRef).trim()).map(g => ({
          key: g.id, category: 'FONTE DA VERIFICARE', element: 'Linea guida › ' + g.title, ref: { route: 'guidelines', id: g.id },
          problem: 'Linea guida proposta dall\'AI approvata senza riferimento a una fonte del professore.', reason: 'Un suggerimento AI non ha mai priorità sulle indicazioni del professore (livello 7 della gerarchia).',
          source: 'Gerarchia delle fonti', confidence: 60, severity: 'INFO', suggestion: 'Indica nel campo "Riferimento fonte" su quale indicazione/consegna si basa, oppure lascia così se l\'hai verificata.' }));
      } },

    /* ===== SCADENZE E REVISIONI ===== */
    { id: 'deadline-risk', group: 'scadenze', name: 'Rischio scadenza',
      run(ctx) {
        const out = [];
        Metrics.deadlinesSorted().forEach(d => {
          const st = Metrics.deadlineState(d);
          if (st.risk === 'SUPERATA') out.push({ key: d.id + d.date, category: 'SCADENZA SUPERATA', element: 'Scadenza › ' + d.title, ref: { route: 'deadlines', id: d.id },
            problem: 'La scadenza del ' + U.fmtDate(d.date) + ' è ' + U.relDays(d.date) + ' ed è ancora aperta.', reason: 'Una scadenza superata non gestita può indicare lavoro mancante.',
            source: 'Calendario scadenze', confidence: 100, severity: 'CRITICO', suggestion: 'Completa le attività, sposta la data o segna la scadenza come completata/annullata.' });
          else if (st.risk === 'RISCHIO') out.push({ key: d.id + d.date + st.openTasks.length, category: 'RISCHIO SCADENZA', element: 'Scadenza › ' + d.title, ref: { route: 'deadlines', id: d.id },
            problem: 'Scadenza ' + U.relDays(d.date) + ' con ' + U.plural(st.openTasks.length, 'attività incompleta', 'attività incomplete') + (st.openPhases.length ? ' e ' + U.plural(st.openPhases.length, 'fase incompleta', 'fasi incomplete') : '') + '.',
            reason: 'Incomplete: ' + st.openTasks.map(t => t.title).concat(st.openPhases.map(p => p.title)).slice(0, 5).join('; '),
            source: 'Calendario scadenze', confidence: 90, severity: st.days <= 2 ? 'CRITICO' : 'PROBABILE ERRORE', suggestion: 'Concentrati sulle attività collegate o rivedi la pianificazione.' });
        });
        const dd = ctx.days;
        if (dd !== null && dd < 0) out.push({ key: 'final' + ctx.P.info.dueDate, category: 'SCADENZA SUPERATA', element: 'Consegna finale', ref: { route: 'project' },
          problem: 'La data di consegna finale (' + U.fmtDate(ctx.P.info.dueDate) + ') è superata.', reason: 'Se il progetto è già stato consegnato aggiorna la data o archivialo.',
          source: 'Scheda progetto', confidence: 100, severity: 'CRITICO', suggestion: 'Aggiorna la data di consegna.' });
        return out;
      } },

    { id: 'task-overdue', group: 'scadenze', name: 'Attività in ritardo',
      run(ctx) {
        return ctx.P.tasks.filter(t => t.status !== 'COMPLETATA' && U.isValidDate(t.due) && U.daysUntil(t.due) < 0).map(t => ({
          key: t.id + t.due, category: 'RISCHIO SCADENZA', element: 'Attività › ' + t.title, ref: { route: 'deadlines', id: t.id },
          problem: 'Attività con data ' + U.fmtDate(t.due) + ' (' + U.relDays(t.due) + ') non completata.', reason: 'Il ritardo può propagarsi sulle fasi successive.',
          source: 'Attività', confidence: 95, severity: 'ATTENZIONE', suggestion: 'Completa l\'attività o aggiorna la data.' }));
      } },

    { id: 'revision-ready', group: 'revisioni', name: 'Revisione non pronta',
      run(ctx) {
        const out = [];
        ctx.P.revisions.filter(r => r.status === 'PIANIFICATA' && U.isValidDate(r.date)).forEach(r => {
          const d = U.daysUntil(r.date);
          if (d >= 0 && d <= ctx.P.settings.revisionWarnDays) {
            const rd = Metrics.revisionReadiness(r);
            if (!rd.ready) out.push({ key: r.id + rd.missing.join(), category: 'REVISIONE NON PRONTA', element: 'Revisione del ' + U.fmtDate(r.date), ref: { route: 'revisions', id: r.id },
              problem: 'La revisione è ' + U.relDays(r.date) + ' ma mancano: ' + rd.missing.join(', ') + '.', reason: 'Arrivare preparati permette di ottenere indicazioni utili dal professore.',
              source: 'Revisioni', confidence: 95, severity: d <= 1 ? 'PROBABILE ERRORE' : 'ATTENZIONE', suggestion: 'Usa "PREPARA REVISIONE" e completa argomenti, materiale e domande.' });
          }
          if (d < 0) out.push({ key: r.id + 'past', category: 'INFORMAZIONE MANCANTE', element: 'Revisione del ' + U.fmtDate(r.date), ref: { route: 'revisions', id: r.id },
            problem: 'La revisione è passata ma risulta ancora "PIANIFICATA".', reason: 'Correzioni e indicazioni ricevute vanno registrate: sono la fonte con priorità più alta.',
            source: 'Revisioni', confidence: 85, severity: 'ATTENZIONE', suggestion: 'Registra correzioni e indicazioni e segna la revisione come SVOLTA.' });
        });
        return out;
      } },

    { id: 'questions-unanswered', group: 'revisioni', name: 'Domande senza risposta dopo la revisione',
      run(ctx) {
        return ctx.P.questions.filter(q => q.revisionId && ['APERTA', 'POSTA'].includes(q.status)).map(q => ({ q, r: Model.get('revisions', q.revisionId) }))
          .filter(x => x.r && x.r.status === 'SVOLTA').map(({ q, r }) => ({
            key: q.id, category: 'INFORMAZIONE MANCANTE', element: 'Domanda › ' + U.truncate(q.text, 60), ref: { route: 'questions', id: q.id },
            problem: 'Domanda assegnata alla revisione del ' + U.fmtDate(r.date) + ' (svolta) senza risposta registrata.', reason: 'La risposta del professore potrebbe cambiare il lavoro.',
            source: 'Domande per il professore', confidence: 80, severity: 'INFO', suggestion: 'Registra la risposta oppure riassegna la domanda alla prossima revisione.' }));
      } },

    /* ===== FASI ===== */
    { id: 'phase-empty', group: 'sviluppo', name: 'Fasi incomplete o passaggi saltati',
      run(ctx) {
        const out = [];
        const phases = Model.phasesSorted();
        phases.forEach((ph, i) => {
          const pr = Metrics.phaseProgress(ph);
          if (!ph.blocks.length && pr.pct === 100 && pr.total > 0) out.push({ key: ph.id + 'nocontent', category: 'SEZIONE INCOMPLETA', element: 'Fase ' + (ph.order + 1) + ' · ' + ph.title, ref: { route: 'dev', id: ph.id },
            problem: 'Checklist completata ma la fase non contiene alcun contenuto.', reason: 'Il lavoro svolto non è documentato: non potrà confluire nella relazione.',
            source: 'Regola di completezza', confidence: 80, severity: 'PROBABILE ERRORE', suggestion: 'Aggiungi blocchi con dati, calcoli o risultati.' });
          else if (!ph.blocks.length) out.push({ key: ph.id + 'empty', category: 'SEZIONE INCOMPLETA', element: 'Fase ' + (ph.order + 1) + ' · ' + ph.title, ref: { route: 'dev', id: ph.id },
            problem: 'La fase non contiene ancora contenuti.', reason: 'Normale se non è iniziata; da completare prima della consegna.',
            source: 'Regola di completezza', confidence: 70, severity: 'INFO', suggestion: 'Aggiungi i blocchi della fase quando la avvii.' });
          if (!ph.checklist.length) out.push({ key: ph.id + 'nochk', category: 'SEZIONE INCOMPLETA', element: 'Fase ' + (ph.order + 1) + ' · ' + ph.title, ref: { route: 'dev', id: ph.id },
            problem: 'La fase non ha una checklist.', reason: 'Senza checklist il progresso della fase si basa solo sui blocchi verificati.',
            source: 'Regola di completezza', confidence: 60, severity: 'INFO', suggestion: 'Aggiungi una checklist (anche quella standard).' });
          if (pr.pct === 100 && pr.total > 0) {
            const prevIncomplete = phases.slice(0, i).filter(p => Metrics.phaseProgress(p).pct < 100);
            if (prevIncomplete.length) out.push({ key: ph.id + prevIncomplete.map(p => p.id).join(), category: 'PASSAGGIO SALTATO', element: 'Fase ' + (ph.order + 1) + ' · ' + ph.title, ref: { route: 'dev', id: ph.id },
              problem: 'Fase completata mentre fasi precedenti non lo sono: ' + prevIncomplete.map(p => p.title).join(', ') + '.', reason: 'Le fasi successive di solito dipendono dai risultati di quelle precedenti.',
              source: 'Ordine delle fasi', confidence: 65, severity: 'ATTENZIONE', suggestion: 'Verifica che i dati usati provengano da fasi concluse.' });
          }
        });
        return out;
      } },

    /* ===== BLOCCHI ===== */
    { id: 'block-content', group: 'sviluppo', name: 'Contenuti dei blocchi',
      run(ctx) {
        const out = [];
        const add = (phase, b, k, cat, problem, reason, conf, sev, sugg) => out.push({ key: b.id + k, category: cat, element: elBlock(phase, b), ref: blockRef(phase, b), problem, reason, source: 'Controllo ' + C.BLOCK_TYPES[b.type], confidence: conf, severity: sev, suggestion: sugg });
        ctx.blocks.forEach(({ phase, block: b }) => {
          if (TEXTY.includes(b.type) && !U.str(b.content).trim()) add(phase, b, 'empty', 'VALORE MANCANTE', 'Blocco vuoto.', 'Un blocco senza contenuto non aggiunge informazioni.', 90, 'INFO', 'Compila il blocco o eliminalo.');
          if (b.type === 'formula') {
            const tex = U.str(b.latex).trim();
            if (!tex) add(phase, b, 'empty', 'VALORE MANCANTE', 'Formula vuota.', 'Il blocco formula non contiene un\'espressione LaTeX.', 90, 'INFO', 'Inserisci la formula in LaTeX.');
            else {
              let bal = 0; for (const ch of tex) { if (ch === '{') bal++; if (ch === '}') bal--; if (bal < 0) break; }
              const lr = (tex.match(/\\left/g) || []).length !== (tex.match(/\\right/g) || []).length;
              let katexErr = '';
              if (window.katex) { try { katex.renderToString(tex, { throwOnError: true }); } catch (e) { katexErr = e.message; } }
              if (bal !== 0 || lr || katexErr) add(phase, b, 'syntax' + U.hash(tex), 'FORMULA SOSPETTA', 'La formula contiene un errore di sintassi' + (katexErr ? ': ' + U.truncate(katexErr, 120) : ' (parentesi graffe o \\left/\\right non bilanciate).'), 'Una formula non corretta non verrà resa e potrebbe essere trascritta male.', 85, 'PROBABILE ERRORE', 'Controlla parentesi e comandi LaTeX.');
            }
          }
          if (b.type === 'calc') {
            if (!U.str(b.expression).trim()) { add(phase, b, 'noexpr', 'VALORE MANCANTE', 'Calcolo senza espressione.', 'Non è possibile verificare il risultato.', 90, 'ATTENZIONE', 'Inserisci l\'espressione del calcolo.'); return; }
            const vars = {};
            U.arr(b.variables).forEach(v => { if (v.name) vars[v.name] = U.str(v.value).trim() === '' ? '' : U.parseNum(v.value); });
            let res = null, err = null;
            try { res = U.evaluate(b.expression, vars); } catch (e) { err = e.message; }
            if (err) add(phase, b, 'err' + U.hash(b.expression + err), 'FORMULA SOSPETTA', 'Il calcolo non può essere eseguito: ' + err + '.', 'L\'espressione contiene simboli non riconosciuti o variabili senza valore.', 90, 'PROBABILE ERRORE', 'Controlla variabili e sintassi (operatori + - * / ^, funzioni sqrt, ln, log…).');
            else {
              const stated = U.str(b.statedResult).trim();
              if (stated) {
                const sv = U.parseNum(stated);
                if (isFinite(sv) && !U.numClose(res.value, sv)) add(phase, b, 'mismatch' + U.hash(stated + '|' + res.value), 'CALCOLO SOSPETTO',
                  'Il risultato indicato (' + stated + ') non coincide con il ricalcolo dell\'espressione (' + U.fmtNum(res.value) + ').', 'Il valore scritto potrebbe essere stato copiato male o calcolato con dati diversi.',
                  92, 'PROBABILE ERRORE', 'Verifica i dati e aggiorna il risultato con il valore ricalcolato, se corretto.');
              } else if (b.computed === null || b.computed === '') add(phase, b, 'nores', 'VALORE MANCANTE', 'Calcolo senza risultato registrato.', 'Il risultato non è stato salvato nel blocco.', 80, 'INFO', 'Premi "Calcola" per registrare il risultato.');
              const unused = Object.keys(vars).filter(k => !res.used.includes(k));
              if (unused.length) add(phase, b, 'unused' + unused.join(), 'VALORE NON UTILIZZATO', 'Variabili definite ma non usate nell\'espressione: ' + unused.join(', ') + '.', 'Potrebbe mancare un termine nella formula.', 60, 'INFO', 'Rimuovi le variabili inutili o correggi l\'espressione.');
            }
            const noUnit = U.arr(b.variables).filter(v => v.name && U.str(v.value).trim() !== '' && !U.str(v.unit).trim());
            if (noUnit.length) add(phase, b, 'varunit' + noUnit.map(v => v.name).join(), 'VERIFICA UNITÀ', 'Variabili senza unità di misura: ' + noUnit.map(v => v.name).join(', ') + '.', 'Senza unità non è possibile verificare la coerenza dimensionale (se adimensionali, scrivi "-").', 50, 'INFO', 'Indica l\'unità di misura di ogni variabile.');
            if (!U.str(b.unit).trim() && U.arr(b.variables).some(v => U.str(v.unit).trim() && v.unit !== '-')) add(phase, b, 'resunit', 'VERIFICA UNITÀ', 'Il risultato del calcolo non ha unità di misura.', 'Le variabili hanno unità: anche il risultato dovrebbe averla.', 65, 'ATTENZIONE', 'Indica l\'unità del risultato.');
          }
          if (b.type === 'result') {
            if (!U.str(b.name).trim()) add(phase, b, 'noname', 'VALORE MANCANTE', 'Risultato senza nome.', 'Il nome serve per il confronto con la relazione e gli altri valori.', 90, 'ATTENZIONE', 'Dai un nome al risultato (es. "Lead time medio").');
            if (!U.str(b.value).trim()) add(phase, b, 'noval', 'VALORE MANCANTE', 'Risultato senza valore.', 'Un risultato senza valore non può essere usato.', 95, 'ATTENZIONE', 'Inserisci il valore.');
            else if (isFinite(U.parseNum(b.value)) && !U.str(b.unit).trim()) add(phase, b, 'nounit', 'VERIFICA UNITÀ', 'Risultato numerico senza unità di misura.', 'Se è adimensionale scrivi "-" nel campo unità.', 45, 'INFO', 'Indica l\'unità di misura.');
            if (!b.refs.length) add(phase, b, 'norefs', 'RIFERIMENTO MANCANTE', 'Non è indicato da cosa deriva il risultato.', 'La tracciabilità (DERIVA DA) rende il risultato verificabile.', 60, 'INFO', 'Collega il calcolo, la tabella o l\'indicazione da cui deriva.');
            const used = Model.usedBy(b.id).length > 0;
            const inReport = (b.name && U.norm(ctx.reportText).includes(U.norm(b.name))) || !!LiveReport.sectionOf(phase, b);
            if (!used && !inReport && U.str(b.value).trim()) add(phase, b, 'unusedres', 'VALORE NON UTILIZZATO', 'Il risultato non è citato in altri blocchi né nella relazione.', 'Potrebbe essere un risultato dimenticato o superfluo.', 45, 'INFO', 'Citalo nella relazione o collegalo a un\'interpretazione.');
          }
          if (b.type === 'table') {
            if (!U.str(b.title).trim()) add(phase, b, 'notitle', 'VALORE MANCANTE', 'Tabella senza titolo.', 'Le tabelle devono essere identificabili nella relazione.', 80, 'INFO', 'Aggiungi un titolo.');
            const rows = U.arr(b.rows);
            if (!rows.length) add(phase, b, 'norows', 'VALORE MANCANTE', 'Tabella senza righe.', 'La tabella è vuota.', 95, 'ATTENZIONE', 'Aggiungi i dati.');
            const empty = rows.reduce((a, r) => a + U.arr(r).filter(c => !U.str(c).trim()).length, 0);
            if (empty) add(phase, b, 'emptycells' + empty, 'VALORE MANCANTE', U.plural(empty, 'cella vuota', 'celle vuote') + ' nella tabella.', 'Dati mancanti o celle da eliminare.', 70, empty > 3 ? 'ATTENZIONE' : 'INFO', 'Completa o elimina le celle vuote (usa "-" per i valori non applicabili).');
            const emptyHead = U.arr(b.columns).filter(c => !U.str(c).trim()).length;
            if (emptyHead) add(phase, b, 'emptyhead', 'VALORE MANCANTE', 'Colonne senza intestazione.', 'Ogni colonna dovrebbe avere nome e unità.', 80, 'INFO', 'Compila le intestazioni.');
          }
          if (b.type === 'chart') {
            const labels = U.str(b.labels).split(/;|\n/).map(s => s.trim()).filter(Boolean);
            const series = U.arr(b.series);
            if (!U.str(b.title).trim()) add(phase, b, 'notitle', 'GRAFICO INCOMPLETO', 'Grafico senza titolo.', 'I grafici devono essere identificabili.', 80, 'INFO', 'Aggiungi un titolo.');
            if (!U.str(b.xLabel).trim() || !U.str(b.yLabel).trim()) add(phase, b, 'noaxis', 'GRAFICO INCOMPLETO', 'Etichette degli assi mancanti.', 'Senza etichette il grafico non è leggibile.', 85, 'ATTENZIONE', 'Indica cosa rappresentano gli assi X e Y.');
            if (!labels.length || !series.some(s => U.str(s.data).trim())) add(phase, b, 'nodata', 'VALORE MANCANTE', 'Grafico senza dati.', 'Inserisci etichette e valori delle serie.', 95, 'ATTENZIONE', 'Inserisci i dati (separati da punto e virgola).');
            series.forEach((s, si) => {
              const vals = U.str(s.data).split(/;|\n/).map(x => x.trim()).filter(x => x !== '');
              if (!vals.length) return;
              const bad = vals.filter(v => !isFinite(U.parseNum(v)));
              if (bad.length) add(phase, b, 'nan' + si + bad.join(), 'VALORE NON VALIDO', 'Valori non numerici nella serie "' + s.name + '": ' + bad.slice(0, 4).join(', ') + '.', 'Il grafico non può rappresentarli.', 95, 'PROBABILE ERRORE', 'Usa solo numeri (virgola o punto per i decimali).');
              if (labels.length && vals.length !== labels.length) add(phase, b, 'len' + si + vals.length + '-' + labels.length, 'POSSIBILE INCOERENZA', 'La serie "' + s.name + '" ha ' + vals.length + ' valori ma le etichette sono ' + labels.length + '.', 'Alcuni punti potrebbero essere associati all\'etichetta sbagliata.', 90, 'PROBABILE ERRORE', 'Allinea il numero di valori e di etichette.');
            });
          }
          if (b.type === 'image') {
            if (!b.fileId) add(phase, b, 'nofile', 'VALORE MANCANTE', 'Blocco immagine senza immagine.', 'Il blocco è vuoto.', 95, 'ATTENZIONE', 'Carica l\'immagine.');
            if (!U.str(b.caption).trim()) add(phase, b, 'nocap', 'VALORE MANCANTE', 'Immagine senza didascalia.', 'La didascalia spiega cosa mostra la figura.', 70, 'INFO', 'Aggiungi una didascalia.');
          }
          if (b.type === 'attachment' && !U.arr(b.fileIds).length) add(phase, b, 'nofiles', 'VALORE MANCANTE', 'Blocco allegati senza file.', 'Il blocco è vuoto.', 90, 'INFO', 'Allega i file o elimina il blocco.');
          if ((b.type === 'interpretation' || b.type === 'observation') && U.str(b.content).trim() && !b.refs.length) add(phase, b, 'unsupported', 'CONCLUSIONE NON SUPPORTATA', 'Interpretazione/osservazione senza collegamento a dati o risultati.', 'Le affermazioni dovrebbero essere supportate da un risultato, una tabella o un calcolo.', 45, 'INFO', 'Collega con "Deriva da" gli elementi che la supportano.');
          b.refs.forEach(r => { if (!Model.refExists(r)) add(phase, b, 'deadref' + r.id, 'RIFERIMENTO MANCANTE', 'Il blocco cita un elemento che è stato eliminato.', 'Il collegamento "Deriva da" non è più valido.', 95, 'ATTENZIONE', 'Rimuovi o sostituisci il riferimento.'); });
        });
        return out;
      } },

    /* ===== COERENZA NUMERICA E UNITÀ ===== */
    { id: 'quantity-consistency', group: 'coerenza', name: 'Stesso parametro con valori o unità diversi',
      run(ctx) {
        const groups = {};
        Model.namedQuantities().forEach(q => { const k = U.norm(q.name); (groups[k] = groups[k] || []).push(q); });
        const out = [];
        Object.entries(groups).forEach(([k, list]) => {
          if (list.length < 2) return;
          if (k.length < 3 && list.every(q => q.kind === 'variabile')) return;
          const nums = list.filter(q => isFinite(q.value));
          const distinct = [];
          nums.forEach(q => { if (!distinct.some(d => U.numClose(d.value, q.value))) distinct.push(q); });
          const where = q => { const f = Model.findBlock(q.blockId); return f ? 'Fase ' + (f.phase.order + 1) + ' › ' + Model.blockLabel(f.block) : '?'; };
          if (distinct.length > 1) {
            const first = Model.findBlock(distinct[0].blockId);
            out.push({ key: k + distinct.map(d => d.value).join('|'), category: 'POSSIBILE INCOERENZA', element: '"' + list[0].name + '"', ref: first ? blockRef(first.phase, first.block) : { route: 'dev' },
              problem: 'Il parametro "' + list[0].name + '" ha valori diversi: ' + distinct.map(d => U.fmtNum(d.value) + (d.unit ? ' ' + d.unit : '') + ' (' + where(d) + ')').join(' · '),
              reason: 'Lo stesso elemento dovrebbe avere lo stesso valore in tutte le sezioni, salvo scenari diversi (es. AS-IS / TO-BE).', source: 'Confronto incrociato', confidence: 75, severity: 'PROBABILE ERRORE',
              suggestion: 'Uniforma il valore o rinomina i parametri se rappresentano grandezze diverse.' });
          }
          const units = [...new Set(list.map(q => U.str(q.unit).trim()).filter(u => u && u !== '-'))];
          if (units.length > 1) {
            const first = Model.findBlock(list[0].blockId);
            out.push({ key: k + 'u' + units.join('|'), category: 'VERIFICA UNITÀ', element: '"' + list[0].name + '"', ref: first ? blockRef(first.phase, first.block) : { route: 'dev' },
              problem: 'Il parametro "' + list[0].name + '" usa unità diverse: ' + units.join(', ') + '.', reason: 'Unità diverse per lo stesso parametro possono causare errori di conversione.',
              source: 'Confronto incrociato', confidence: 70, severity: 'ATTENZIONE', suggestion: 'Usa la stessa unità ovunque o indica la conversione.' });
          }
        });
        return out;
      } },

    { id: 'cited-missing', group: 'coerenza', name: 'Tabelle/grafici citati ma assenti',
      run(ctx) {
        const out = [];
        const counts = ctx.numbering.counts;
        const check = (text, element, ref, keyp) => {
          const re = /\b(tabella|table|grafico|figura|figure|fig\.)\s*(\d+)/gi;
          let m;
          while ((m = re.exec(U.str(text)))) {
            const kind = m[1].toLowerCase(), n = +m[2];
            const isTable = kind.startsWith('tab');
            const isChart = kind === 'grafico';
            const max = isTable ? counts.table : isChart ? counts.chart : counts.image + counts.chart;
            if (n > max) out.push({ key: keyp + kind + n, category: isTable ? 'TABELLA CITATA MA ASSENTE' : 'GRAFICO CITATO MA ASSENTE', element, ref,
              problem: '"' + m[0] + '" è citata/o ma nel progetto ' + (isTable ? 'ci sono ' + U.plural(max, 'tabella', 'tabelle') : 'ci sono ' + U.plural(max, (isChart ? 'grafico' : 'figura/grafico'), (isChart ? 'grafici' : 'figure/grafici'))) + '.',
              reason: 'La numerazione segue l\'ordine dei blocchi nelle fasi.', source: 'Riferimenti incrociati', confidence: 85, severity: 'PROBABILE ERRORE', suggestion: 'Aggiungi l\'elemento mancante o correggi il numero.' });
          }
        };
        ctx.blocks.forEach(({ phase, block }) => check(block.content, elBlock(phase, block), blockRef(phase, block), block.id));
        return out;
      } },

    { id: 'required-visuals', group: 'consegna', name: 'Grafici o tabelle richiesti dalla consegna',
      run(ctx) {
        const txt = U.norm(ctx.P.brief.original + ' ' + ctx.P.brief.analysis.map(a => a.text).join(' '));
        const out = [];
        if (!txt) return out;
        if (/grafic|chart|diagramm|plot/.test(txt) && !ctx.numbering.counts.chart && !ctx.numbering.counts.image) out.push({ key: 'charts', category: 'GRAFICO MANCANTE', element: 'Progetto', ref: { route: 'dev' },
          problem: 'La consegna cita grafici/diagrammi ma nel progetto non ce ne sono.', reason: 'Parole come "grafico" o "diagramma" compaiono nella consegna.', source: 'Consegna ufficiale', confidence: 55, severity: 'ATTENZIONE', suggestion: 'Aggiungi blocchi Grafico o Immagine (per i diagrammi).' });
        if (/tabell|table/.test(txt) && !ctx.numbering.counts.table) out.push({ key: 'tables', category: 'TABELLA MANCANTE', element: 'Progetto', ref: { route: 'dev' },
          problem: 'La consegna cita tabelle ma nel progetto non ce ne sono.', reason: 'La parola "tabella" compare nella consegna.', source: 'Consegna ufficiale', confidence: 55, severity: 'ATTENZIONE', suggestion: 'Aggiungi blocchi Tabella.' });
        return out;
      } },

    { id: 'duplicates', group: 'qualità', name: 'Duplicazioni',
      run(ctx) {
        const out = [];
        const seen = {};
        ctx.blocks.forEach(({ phase, block }) => {
          if (!TEXTY.includes(block.type)) return;
          const t = U.norm(block.content);
          if (t.length < 40) return;
          if (seen[t]) out.push({ key: block.id + seen[t].block.id, category: 'DUPLICAZIONE', element: elBlock(phase, block), ref: blockRef(phase, block),
            problem: 'Testo identico a ' + elBlock(seen[t].phase, seen[t].block) + '.', reason: 'Le ripetizioni appesantiscono il lavoro e la relazione.', source: 'Controllo duplicati', confidence: 85, severity: 'INFO', suggestion: 'Elimina uno dei due o rimanda all\'altro.' });
          else seen[t] = { phase, block };
        });
        const dupTitle = (coll, label, route) => {
          const m = {};
          Model.list(coll).forEach(x => { const t = U.norm(x.title || x.text); if (!t) return; if (m[t]) out.push({ key: coll + x.id, category: 'DUPLICAZIONE', element: label + ' › ' + U.truncate(x.title || x.text, 60), ref: { route, id: x.id },
            problem: label + ' duplicata/o.', reason: 'Esiste già un elemento con lo stesso testo.', source: 'Controllo duplicati', confidence: 80, severity: 'INFO', suggestion: 'Unisci o elimina il duplicato.' }); else m[t] = 1; });
        };
        dupTitle('guidelines', 'Linea guida', 'guidelines'); dupTitle('questions', 'Domanda', 'questions');
        return out;
      } },

    { id: 'grammar', group: 'qualità', name: 'Possibili errori di scrittura',
      run(ctx) {
        const out = [];
        const scan = (text) => {
          const t = U.str(text).replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$|`[^`]*`/g, ' ');
          const hits = [];
          let m;
          const rep = /\b([A-Za-zÀ-ÿ]{2,})\s+\1\b/gi;
          while ((m = rep.exec(t))) hits.push('parola ripetuta "' + m[0] + '"');
          if (/[^\s] {2,}[^\s]/.test(t)) hits.push('spazi doppi');
          const sp = t.match(/[A-Za-zÀ-ÿ]\s+[,;:!?](?!\S*\d)/);
          if (sp) hits.push('spazio prima della punteggiatura ("' + sp[0].trim() + '")');
          const ns = t.match(/[A-Za-zÀ-ÿ][,;][A-Za-zÀ-ÿ]/);
          if (ns) hits.push('manca lo spazio dopo la punteggiatura ("' + ns[0] + '")');
          const lc = t.match(/(?:^|[^.])\b(?!(?:es|ecc|pag|pp|cfr|vs|fig|tab|nr|n|p|e\.g|i\.e|etc)\.)[A-Za-zÀ-ÿ]{3,}\.\s+[a-zà-ù]{2,}/);
          if (lc) hits.push('minuscola dopo il punto ("' + U.truncate(lc[0].trim(), 30) + '")');
          const open = (t.match(/\(/g) || []).length, close = (t.match(/\)/g) || []).length;
          if (open !== close) hits.push('parentesi non bilanciate (' + open + ' aperte, ' + close + ' chiuse)');
          return hits;
        };
        ctx.blocks.forEach(({ phase, block }) => {
          if (!TEXTY.includes(block.type)) return;
          const h = scan(block.content);
          if (h.length) out.push({ key: block.id + U.hash(h.join()), category: 'POSSIBILE ERRORE GRAMMATICALE', element: elBlock(phase, block), ref: blockRef(phase, block),
            problem: h.slice(0, 4).join('; ') + '.', reason: 'Controllo automatico di base: può segnalare anche casi corretti.', source: 'Controllo di scrittura', confidence: 40, severity: 'INFO', suggestion: 'Rileggi il passaggio.' });
        });
        ctx.P.report.sections.forEach(s => {
          const h = scan(s.content);
          if (h.length) out.push({ key: s.id + U.hash(h.join()), category: 'POSSIBILE ERRORE GRAMMATICALE', element: 'Relazione › ' + s.title, ref: { route: 'report', id: s.id },
            problem: h.slice(0, 4).join('; ') + '.', reason: 'Controllo automatico di base: può segnalare anche casi corretti.', source: 'Controllo di scrittura', confidence: 40, severity: 'INFO', suggestion: 'Rileggi il passaggio.' });
        });
        return out;
      } },

    { id: 'terminology', group: 'qualità', name: 'Terminologia incoerente',
      run(ctx) {
        const text = ctx.blocks.map(({ block }) => TEXTY.includes(block.type) ? block.content + ' ' + block.title : block.title).join('\n') + '\n' + ctx.reportText;
        const low = text.toLowerCase();
        const out = [];
        const seen = new Set();
        const re = /\b([a-zà-ÿ]{2,})-([a-zà-ÿ]{2,})\b/gi;
        let m;
        while ((m = re.exec(text))) {
          const a = m[1].toLowerCase(), b = m[2].toLowerCase();
          const key = a + '-' + b;
          if (seen.has(key)) continue;
          seen.add(key);
          const variants = [];
          if (new RegExp('\\b' + a + ' ' + b + '\\b').test(low)) variants.push(a + ' ' + b);
          if (new RegExp('\\b' + a + b + '\\b').test(low)) variants.push(a + b);
          if (variants.length) out.push({ key, category: 'TERMINOLOGIA INCOERENTE', element: 'Progetto e relazione', ref: { route: 'report' },
            problem: 'Lo stesso termine è scritto in modi diversi: "' + key + '" / "' + variants.join('" / "') + '".', reason: 'Una terminologia uniforme è un segno di precisione.',
            source: 'Controllo terminologia', confidence: 60, severity: 'INFO', suggestion: 'Scegli una forma e usala ovunque (puoi creare una regola "Termine da non usare").' });
        }
        return out;
      } },

    /* ===== RELAZIONE ↔ PROGETTO ===== */
    { id: 'report-required', group: 'relazione', name: 'Sezioni obbligatorie della relazione',
      run(ctx) {
        const assign = LiveReport.assignments();
        return ctx.P.report.sections.filter(s => s.required && LiveReport.effective(s, assign).mode === 'empty').map(s => ({
          key: s.id, category: 'SEZIONE OBBLIGATORIA MANCANTE', element: 'Relazione › ' + s.title, ref: { route: 'report', id: s.id },
          problem: 'La sezione obbligatoria "' + s.title + '" è vuota (né testo scritto né contenuti del progetto assegnati).', reason: 'Sezione segnata come obbligatoria nella struttura della relazione.',
          source: 'Struttura relazione', confidence: 100, severity: ctx.days !== null && ctx.days <= 3 ? 'CRITICO' : ctx.days !== null && ctx.days <= 14 ? 'ATTENZIONE' : 'INFO',
          suggestion: 'Scrivila usando solo informazioni presenti nel progetto ("Componi da progetto").' }));
      } },

    { id: 'report-numbers', group: 'relazione', name: 'Dati della relazione non tracciati',
      run(ctx) {
        const out = [];
        const nums = ctx.projNumbers;
        const matchAny = (vals, percent, dec) => vals.some(v => nums.some(n => U.numReported(n, v, dec) || (percent && U.numReported(n * 100, v, dec)) || (percent && U.numReported(n, v / 100, dec + 2))));
        ctx.P.report.sections.forEach(s => {
          const isConcl = /conclus|discuss|risultat/i.test(s.title);
          U.extractNumbers(s.content.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$/g, ' ')).forEach(n => {
            const v = n.values[0];
            if (!n.decimals && !n.percent && Math.abs(v) <= 10) return;
            if (!n.decimals && !n.percent && v >= 1900 && v <= 2100) return;
            if (/(tabella|table|figura|figure|fig\.|grafico|fase|sezione|capitolo|cap\.|pag\.|p\.|paragrafo|par\.|n\.|allegato|revisione)\s*$/i.test(n.before)) return;
            if (/\/\s*$/.test(n.before) || /^\s*\//.test(n.after)) return;
            if (/^\.\d/.test(n.after)) return;
            if (matchAny(n.values, n.percent, n.decimals)) return;
            out.push({ key: s.id + n.raw, category: 'POSSIBILE DATO NON TRACCIATO', element: 'Relazione › ' + s.title, ref: { route: 'report', id: s.id },
              problem: 'Il valore "' + n.raw + '" non compare da nessuna parte nel progetto (contesto: «…' + U.truncate(n.before.slice(-30) + n.raw + n.after.slice(0, 30), 80) + '…»).',
              reason: 'Potrebbe essere un dato non registrato nel progetto, un arrotondamento diverso o un valore da verificare. Non significa che sia inventato.',
              source: 'Confronto relazione ↔ progetto', confidence: 60, severity: isConcl ? 'PROBABILE ERRORE' : 'ATTENZIONE',
              suggestion: 'Verifica il valore: se è corretto registralo nel progetto (es. blocco Risultato), altrimenti correggilo.' });
          });
        });
        return out;
      } },

    { id: 'report-quantities', group: 'relazione', name: 'Numeri differenti tra relazione e progetto',
      run(ctx) {
        const out = [];
        const all = Model.namedQuantities().filter(q => q.kind !== 'variabile' && U.norm(q.name).length >= 3 && isFinite(q.value));
        const byName = {};
        all.forEach(q => { (byName[U.norm(q.name)] = byName[U.norm(q.name)] || []).push(q); });
        const qs = Object.values(byName).map(list => Object.assign({}, list.find(q => q.kind !== 'testo') || list[0], { values: list.map(q => q.value) }));
        ctx.P.report.sections.forEach(s => {
          const low = U.norm(s.content);
          qs.forEach(q => {
            const name = U.norm(q.name);
            let idx = low.indexOf(name);
            while (idx >= 0) {
              const after = low.slice(idx + name.length, idx + name.length + 70);
              const m = after.match(/^[^.\n]*?(-?\d+(?:[.,]\d+)?(?:[.,]\d{3})*%?)/);
              if (m) {
                const n = U.extractNumbers(m[1])[0];
                if (n && !n.values.some(v => q.values.some(qv => U.numReported(qv, v, n.decimals) || (n.percent && U.numReported(qv, v / 100, n.decimals + 2)) || (n.percent && U.numReported(qv * 100, v, n.decimals))))) {
                  const f = Model.findBlock(q.blockId);
                  out.push({ key: s.id + name + n.raw, category: 'NUMERI DIFFERENTI', element: 'Relazione › ' + s.title, ref: { route: 'report', id: s.id },
                    problem: 'Nella relazione "' + q.name + '" è associato a ' + n.raw + ', nel progetto vale ' + U.fmtNum(q.value) + (q.unit ? ' ' + q.unit : '') + (f ? ' (' + Model.blockLabel(f.block) + ')' : '') + '.',
                    reason: 'Lo stesso dato deve avere lo stesso valore nel progetto e nella relazione.', source: 'Confronto relazione ↔ progetto', confidence: 70, severity: 'PROBABILE ERRORE',
                    suggestion: 'Verifica quale valore è corretto e uniformalo.' });
                }
              }
              idx = low.indexOf(name, idx + name.length);
            }
          });
        });
        return out;
      } },

    { id: 'report-formulas', group: 'relazione', name: 'Formule della relazione diverse dal progetto',
      run(ctx) {
        const out = [];
        const normTex = t => U.str(t).replace(/\s+/g, '').replace(/\\[,;!:]/g, '');
        const known = new Set();
        ctx.blocks.forEach(({ block }) => { if (block.type === 'formula') known.add(normTex(block.latex)); if (block.type === 'calc') known.add(normTex(block.expression)); });
        ctx.P.report.sections.forEach(s => {
          const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/g;
          let m;
          while ((m = re.exec(s.content))) {
            const tex = (m[1] || m[2] || '').trim();
            if (tex.length < 4 || !/[=+\-*/^\\]/.test(tex)) continue;
            if (!known.has(normTex(tex))) out.push({ key: s.id + U.hash(normTex(tex)), category: 'FORMULE DIFFERENTI', element: 'Relazione › ' + s.title, ref: { route: 'report', id: s.id },
              problem: 'La formula "' + U.truncate(tex, 80) + '" non coincide con nessuna formula o calcolo del progetto.', reason: 'Può essere una riscrittura equivalente oppure una formula diversa da quella usata nei calcoli.',
              source: 'Confronto relazione ↔ progetto', confidence: 50, severity: 'ATTENZIONE', suggestion: 'Verifica che sia la stessa formula usata nel progetto o aggiungi un blocco Formula.' });
          }
        });
        return out;
      } },

    { id: 'report-cited', group: 'relazione', name: 'Tabelle/grafici citati nella relazione ma assenti',
      run(ctx) {
        const out = [];
        const counts = ctx.numbering.counts;
        ctx.P.report.sections.forEach(s => {
          const re = /\b(tabella|table|grafico|figura|figure|fig\.)\s*(\d+)/gi;
          let m;
          while ((m = re.exec(s.content))) {
            const kind = m[1].toLowerCase(), n = +m[2];
            const isTable = kind.startsWith('tab');
            const max = isTable ? counts.table : kind === 'grafico' ? counts.chart : counts.image + counts.chart;
            if (n > max) out.push({ key: s.id + kind + n, category: isTable ? 'TABELLA CITATA MA ASSENTE' : 'GRAFICO CITATO MA ASSENTE', element: 'Relazione › ' + s.title, ref: { route: 'report', id: s.id },
              problem: '"' + m[0] + '" è citata/o nella relazione ma nel progetto non esiste (presenti: ' + max + ').', reason: 'La numerazione segue l\'ordine dei blocchi nelle fasi.',
              source: 'Confronto relazione ↔ progetto', confidence: 85, severity: 'PROBABILE ERRORE', suggestion: 'Aggiungi l\'elemento al progetto o correggi il riferimento.' });
          }
        });
        return out;
      } },

    { id: 'report-conclusions', group: 'relazione', name: 'Conclusioni non supportate',
      run(ctx) {
        const out = [];
        const concl = ctx.P.report.sections.filter(s => /conclus/i.test(s.title) && U.str(s.content).trim());
        const results = ctx.blocks.filter(({ block }) => block.type === 'result' && block.name);
        concl.forEach(s => {
          const low = U.norm(s.content);
          const cited = results.filter(({ block }) => low.includes(U.norm(block.name)));
          if (results.length && !cited.length) out.push({ key: s.id + 'nores', category: 'CONCLUSIONE NON SUPPORTATA', element: 'Relazione › ' + s.title, ref: { route: 'report', id: s.id },
            problem: 'Le conclusioni non citano nessuno dei risultati registrati nel progetto.', reason: 'Le conclusioni dovrebbero basarsi sui risultati ottenuti (' + results.slice(0, 4).map(r => r.block.name).join(', ') + '…).',
            source: 'Confronto relazione ↔ progetto', confidence: 55, severity: 'ATTENZIONE', suggestion: 'Richiama i risultati principali a supporto delle conclusioni.' });
          if (/\b(sicuramente|certamente|dimostra(to)? che|ovviamente|senza dubbio|always|clearly proves)\b/i.test(s.content)) out.push({ key: s.id + 'strong', category: 'CONCLUSIONE NON SUPPORTATA', element: 'Relazione › ' + s.title, ref: { route: 'report', id: s.id },
            problem: 'Le conclusioni contengono affermazioni molto forti ("sicuramente", "dimostra che"…).', reason: 'Affermazioni assolute vanno sostenute da dati espliciti.',
            source: 'Controllo di stile', confidence: 40, severity: 'INFO', suggestion: 'Valuta formulazioni più prudenti o cita il dato che lo dimostra.' });
        });
        return out;
      } }
  ];

  /* ---------- REGOLE PERSONALIZZATE ---------- */
  function customFindings(ctx) {
    const out = [];
    const rulesActive = ctx.P.customRules.filter(r => r.active);
    rulesActive.forEach(rule => {
      const base = { source: 'Regola personalizzata: ' + rule.text, severity: rule.severity || 'ATTENZIONE', confidence: 90, category: 'REGOLA PERSONALIZZATA' };
      const p = rule.params || {};
      const push = (key, element, ref, problem, suggestion) => out.push(Object.assign({}, base, { rule: 'custom:' + rule.id, key, element, ref, problem, reason: 'Hai definito questa regola: "' + rule.text + '".', suggestion }));
      if (rule.type === 'chart-axis-units') ctx.blocks.filter(x => x.block.type === 'chart').forEach(({ phase, block }) => {
        const miss = [];
        if (!U.str(block.title).trim()) miss.push('titolo');
        if (!U.str(block.xUnit).trim()) miss.push('unità asse X');
        if (!U.str(block.yUnit).trim()) miss.push('unità asse Y');
        if (miss.length) push(block.id + miss.join(), elBlock(phase, block), blockRef(phase, block), 'Il grafico non indica: ' + miss.join(', ') + '.', 'Compila i campi del grafico.');
      });
      if (rule.type === 'table-before-chart') Model.phasesSorted().forEach(ph => {
        const ci = ph.blocks.findIndex(b => b.type === 'chart'), ti = ph.blocks.findIndex(b => b.type === 'table');
        if (ci >= 0 && (ti < 0 || ti > ci)) push(ph.id + ci + '-' + ti, 'Fase ' + (ph.order + 1) + ' · ' + ph.title, { route: 'dev', id: ph.id }, ti < 0 ? 'La fase contiene un grafico ma nessuna tabella dei dati.' : 'Il grafico precede la tabella.', 'Sposta la tabella prima del grafico.');
      });
      if (rule.type === 'block-field') ctx.blocks.filter(x => !p.blockType || x.block.type === p.blockType).forEach(({ phase, block }) => {
        const f = p.field || 'title';
        const v = f === 'refs' ? block.refs.length : U.str(block[f]).trim();
        if (!v) push(block.id + f, elBlock(phase, block), blockRef(phase, block), 'Campo "' + (C.BLOCK_FIELDS[f] || f) + '" non compilato.', 'Compila il campo richiesto dalla regola.');
      });
      if (rule.type === 'report-contains' && p.term && !U.norm(ctx.reportText).includes(U.norm(p.term))) push('rc' + U.norm(p.term), 'Relazione', { route: 'report' }, 'La relazione non contiene "' + p.term + '".', 'Inserisci il termine/argomento richiesto.');
      if (rule.type === 'report-section' && p.term && !ctx.P.report.sections.some(s => U.norm(s.title).includes(U.norm(p.term)) && U.str(s.content).trim())) push('rs' + U.norm(p.term), 'Relazione', { route: 'report' }, 'Manca la sezione "' + p.term + '" o è vuota.', 'Aggiungi la sezione nella struttura della relazione.');
      if (rule.type === 'min-words' && p.term) ctx.P.report.sections.filter(s => U.norm(s.title).includes(U.norm(p.term))).forEach(s => {
        const w = U.words(U.stripMd(s.content));
        if (w < (+p.number || 0)) push(s.id + 'mw' + w, 'Relazione › ' + s.title, { route: 'report', id: s.id }, 'La sezione ha ' + w + ' parole, minimo richiesto ' + p.number + '.', 'Approfondisci la sezione.');
      });
      if (rule.type === 'forbidden-term' && p.term) {
        const re = new RegExp('\\b' + p.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        ctx.blocks.forEach(({ phase, block }) => { if (re.test(Model.blockText(block))) push(block.id + 'ft' + p.term, elBlock(phase, block), blockRef(phase, block), 'Usato il termine "' + p.term + '"' + (p.replacement ? ' invece di "' + p.replacement + '"' : '') + '.', p.replacement ? 'Sostituisci con "' + p.replacement + '".' : 'Riformula.'); });
        ctx.P.report.sections.forEach(s => { if (re.test(s.content)) push(s.id + 'ft' + p.term, 'Relazione › ' + s.title, { route: 'report', id: s.id }, 'Usato il termine "' + p.term + '"' + (p.replacement ? ' invece di "' + p.replacement + '"' : '') + '.', p.replacement ? 'Sostituisci con "' + p.replacement + '".' : 'Riformula.'); });
      }
      if (rule.type === 'result-refs') ctx.blocks.filter(x => x.block.type === 'result' && !x.block.refs.length).forEach(({ phase, block }) => push(block.id + 'rr', elBlock(phase, block), blockRef(phase, block), 'Il risultato non indica da cosa deriva.', 'Collega le fonti con "Deriva da".'));
    });
    return out;
  }

  /* ---------- ESECUZIONE E MEMORIA DELLE DECISIONI ---------- */
  function fingerprint(f) { return U.hash((f.rule || '') + '|' + f.key); }

  function collect(opts = {}) {
    const ctx = buildContext();
    const P = ctx.P;
    let findings = [];
    RULES.forEach(r => {
      if (opts.groups && !opts.groups.includes(r.group)) return;
      if (P.disabledRules.includes(r.id)) return;
      try { r.run(ctx).forEach(f => findings.push(Object.assign({ rule: r.id, ruleName: r.name }, f))); }
      catch (e) { console.error('Regola ' + r.id, e); }
    });
    if (!opts.groups || opts.groups.includes('personalizzate')) {
      try { findings = findings.concat(customFindings(ctx).map(f => Object.assign({ ruleName: 'Regola personalizzata' }, f))); } catch (e) { console.error(e); }
    }
    findings.forEach(f => {
      f.fp = fingerprint(f);
      const fpCount = (P.ruleStats[f.rule] || {}).falsePositives || 0;
      f.confidence = Math.max(10, Math.round(f.confidence * (1 - Math.min(0.6, fpCount * 0.1))));
    });
    return findings;
  }

  /** esegue i controlli e sincronizza l'error log; non tocca i contenuti */
  function run(opts = {}) {
    const P = Store.P;
    const findings = collect(opts);
    const suppressed = new Set(P.suppressions.map(s => s.fp));
    const byFp = new Map(P.issues.map(i => [i.fp, i]));
    const now = U.nowISO();
    let created = 0, reopened = 0, resolved = 0, skipped = 0;
    const seen = new Set();
    findings.forEach(f => {
      if (suppressed.has(f.fp)) { skipped++; return; }
      seen.add(f.fp);
      const ex = byFp.get(f.fp);
      if (ex) {
        Object.assign(ex, { problem: f.problem, reason: f.reason, element: f.element, ref: f.ref, confidence: f.confidence, suggestion: f.suggestion, lastSeen: now, category: f.category });
        if (ex.status === 'RISOLTO') { ex.status = 'APERTO'; ex.resolvedAt = null; reopened++; History.log('Errore ricomparso: ' + U.truncate(f.problem, 70), 'errori', { coll: 'issues', id: ex.id }); }
        if (C.SEV_RANK[f.severity] !== C.SEV_RANK[ex.severity] && !ex.severityManual) ex.severity = f.severity;
      } else {
        P.issues.push({ id: U.uid('iss'), fp: f.fp, rule: f.rule, ruleName: f.ruleName, group: (RULES.find(r => r.id === f.rule) || { group: 'personalizzate' }).group,
          date: now, lastSeen: now, category: f.category, element: f.element, ref: f.ref, problem: f.problem, reason: f.reason, source: f.source,
          confidence: f.confidence, suggestion: f.suggestion, severity: f.severity, status: 'APERTO', decision: '', correction: '', notes: '', origin: 'CONTROLLO AUTOMATICO', resolvedAt: null });
        created++;
      }
    });
    // segnalazioni automatiche attive non più rilevate → risolte
    P.issues.forEach(i => {
      if (i.origin !== 'CONTROLLO AUTOMATICO' || !C.ISSUE_ACTIVE.includes(i.status) || seen.has(i.fp)) return;
      if (opts.groups && !opts.groups.includes(i.group)) return;
      i.status = 'RISOLTO'; i.resolvedAt = now;
      if (!i.correction) i.correction = 'Non più rilevato dal controllo del ' + U.fmtDateTime(now);
      resolved++;
    });
    const summary = { at: now, findings: findings.length, created, reopened, resolved, skipped, open: Metrics.openIssues().length, groups: opts.groups || null };
    if (!opts.groups) { P.checker.lastRunAt = now; P.checker.lastSummary = summary; }
    if (opts.groups && opts.groups.includes('relazione')) P.report.lastCheckAt = now;
    History.log('Project Checker' + (opts.groups ? ' (' + opts.groups.join(', ') + ')' : '') + ': ' + created + ' nuove segnalazioni, ' + resolved + ' risolte', 'controlli');
    Store.touch();
    return summary;
  }

  /** decisione dell'utente su una segnalazione (memorizzata) */
  function decide(issueId, decision, note = '') {
    const P = Store.P;
    const i = P.issues.find(x => x.id === issueId);
    if (!i) throw new Error('Segnalazione non trovata');
    const prev = i.status;
    const map = { correggi: 'IN CORREZIONE', ignora: 'IGNORATO', nonerrore: 'NON È UN ERRORE', dopo: 'RIVEDI DOPO', riapri: 'APERTO', risolto: 'RISOLTO' };
    i.status = map[decision] || i.status;
    i.decision = decision === 'nonerrore' ? 'Non è un errore' : decision === 'ignora' ? 'Ignorato' : decision === 'dopo' ? 'Da rivedere' : decision === 'correggi' ? 'Da correggere' : decision === 'risolto' ? 'Corretto manualmente' : 'Riaperto';
    i.decidedAt = U.nowISO();
    if (note) i.notes = (i.notes ? i.notes + '\n' : '') + note;
    if (decision === 'nonerrore') {
      if (!P.suppressions.some(s => s.fp === i.fp)) P.suppressions.push({ fp: i.fp, rule: i.rule, problem: i.problem, element: i.element, at: U.nowISO(), note });
      P.ruleStats[i.rule] = P.ruleStats[i.rule] || { falsePositives: 0 };
      P.ruleStats[i.rule].falsePositives++;
    }
    if (decision === 'riapri') {
      const k = P.suppressions.findIndex(s => s.fp === i.fp);
      if (k >= 0) { P.suppressions.splice(k, 1); if (P.ruleStats[i.rule]) P.ruleStats[i.rule].falsePositives = Math.max(0, P.ruleStats[i.rule].falsePositives - 1); }
    }
    if (decision === 'risolto') i.resolvedAt = U.nowISO();
    History.version({ type: 'issues', id: i.id, label: U.truncate(i.problem, 60), field: 'stato', before: prev, after: i.status, reason: i.decision, origin: 'UTENTE' });
    History.log('Decisione su errore: ' + i.decision + ' — ' + U.truncate(i.problem, 60), 'errori', { coll: 'issues', id: i.id });
    Store.touch();
    return i;
  }

  /* ---------- CONTROLLO FINALE ---------- */
  function finalCheck() {
    run();
    const P = Store.P;
    const rows = [];
    const row = (label, state, detail, blocking = true, route) => rows.push({ label, state, detail, blocking, route });
    const issuesBy = (pred) => Metrics.openIssues().filter(pred);
    // Requisiti consegna
    const req = P.brief.analysis.filter(a => ['mandatory', 'deliverables', 'results', 'data'].includes(a.cat));
    const reqOpen = req.filter(a => !a.done);
    if (!U.str(P.brief.original).trim()) row('Requisiti consegna', 'risk', 'Consegna non inserita', true, 'brief');
    else if (!req.length) row('Requisiti consegna', 'warn', 'Consegna non analizzata: requisiti non verificabili', true, 'brief');
    else row('Requisiti consegna', reqOpen.length ? 'risk' : 'ok', reqOpen.length ? reqOpen.length + ' di ' + req.length + ' non soddisfatti' : req.length + '/' + req.length + ' soddisfatti', true, 'brief');
    // Indicazioni professore
    const pn = P.profNotes.filter(n => ['CORREZIONE', 'REQUISITO', 'INDICAZIONE UFFICIALE'].includes(n.category));
    const pnOpen = pn.filter(n => !n.applied);
    row('Indicazioni professore', pnOpen.length ? (pnOpen.some(n => n.category === 'CORREZIONE') ? 'risk' : 'warn') : 'ok', pn.length ? (pn.length - pnOpen.length) + '/' + pn.length + ' recepite' : 'Nessuna indicazione registrata', true, 'prof');
    // Linee guida
    const gm = P.guidelines.filter(g => g.mandatory || g.priority === 'CRITICA');
    const gmOpen = gm.filter(g => !['COMPLETATA', 'APPROVATA'].includes(g.status));
    row('Linee guida obbligatorie', gmOpen.length ? 'risk' : P.guidelines.length ? 'ok' : 'warn', P.guidelines.length ? (gm.length - gmOpen.length) + '/' + gm.length + ' completate' : 'Nessuna linea guida', true, 'guidelines');
    // Fasi
    const phases = Model.phasesSorted();
    const phOpen = phases.filter(p => Metrics.phaseProgress(p).pct < 100);
    row('Fasi e checklist', !phases.length ? 'warn' : phOpen.length ? 'warn' : 'ok', phases.length ? (phases.length - phOpen.length) + '/' + phases.length + ' fasi complete' + (phOpen.length ? ' (aperte: ' + phOpen.map(p => p.title).join(', ') + ')' : '') : 'Nessuna fase', true, 'dev');
    const typeRow = (label, type, route = 'dev') => {
      const bl = Model.allBlocks().filter(x => x.block.type === type);
      const iss = issuesBy(i => i.ref && i.ref.blockId && bl.some(x => x.block.id === i.ref.blockId) && C.SEV_RANK[i.severity] >= 1);
      const unver = bl.filter(x => x.block.status !== 'VERIFICATO');
      if (!bl.length) return row(label, 'na', 'Nessun elemento di questo tipo', false, route);
      row(label, iss.length || unver.length ? 'warn' : 'ok', bl.length + ' presenti' + (iss.length ? ' · ⚠ ' + iss.length + ' da verificare' : '') + (unver.length ? ' · ' + unver.length + ' non segnati come verificati' : ''), true, route);
    };
    typeRow('Dati (tabelle)', 'table'); typeRow('Calcoli', 'calc'); typeRow('Risultati', 'result'); typeRow('Grafici', 'chart'); typeRow('Formule', 'formula');
    // Errori aperti
    const open = Metrics.openIssues();
    const crit = open.filter(i => i.severity === 'CRITICO'), prob = open.filter(i => i.severity === 'PROBABILE ERRORE');
    row('Errori aperti', crit.length ? 'risk' : prob.length ? 'warn' : 'ok', open.length + ' aperti (' + crit.length + ' critici, ' + prob.length + ' probabili errori)', true, 'checks');
    // Relazione
    const rp = Metrics.reportProgress();
    const notFinal = P.report.sections.filter(s => s.required && !['RIVISTA', 'FINALE'].includes(s.status));
    row('Relazione', rp.requiredEmpty.length ? 'risk' : notFinal.length ? 'warn' : 'ok', rp.requiredEmpty.length ? 'Sezioni obbligatorie vuote: ' + rp.requiredEmpty.map(s => s.title).join(', ') : notFinal.length ? notFinal.length + ' sezioni obbligatorie non ancora riviste' : 'Sezioni obbligatorie complete e riviste', true, 'report');
    const coh = issuesBy(i => i.group === 'relazione' && i.category !== 'SEZIONE OBBLIGATORIA MANCANTE');
    row('Coerenza progetto/relazione', coh.length ? 'warn' : 'ok', coh.length ? coh.length + ' segnalazioni da verificare' : 'Nessuna incoerenza rilevata', true, 'checks');
    // Scadenze
    const over = Metrics.deadlinesSorted().filter(d => U.daysUntil(d.date) < 0);
    row('Scadenze', over.length ? 'risk' : 'ok', over.length ? over.length + ' superate ancora aperte' : 'Nessuna scadenza superata', true, 'deadlines');
    // Revisioni
    const rv = Metrics.revisionsProgress();
    row('Revisioni con il professore', rv.done ? 'ok' : 'warn', rv.done ? rv.done + ' revisioni svolte' : 'Nessuna revisione svolta', false, 'revisions');
    const qOpen = P.questions.filter(q => ['APERTA', 'POSTA'].includes(q.status));
    row('Domande al professore', qOpen.length ? 'warn' : 'ok', qOpen.length ? qOpen.length + ' domande ancora senza risposta' : 'Tutte le domande hanno risposta', false, 'questions');
    // Controlli manuali
    P.customRules.filter(r => r.active && r.type === 'manual').forEach(r => {
      const ok = !!P.manualConfirm[r.id];
      rows.push({ label: 'Controllo manuale: ' + r.text, state: ok ? 'ok' : 'warn', detail: ok ? 'Confermato il ' + U.fmtDateTime(P.manualConfirm[r.id]) : 'Da confermare', blocking: true, route: 'checks', manualId: r.id });
    });
    const blockers = rows.filter(r => r.blocking && (r.state === 'risk' || r.state === 'warn'));
    const ready = blockers.length === 0;
    History.log('Controllo finale: ' + (ready ? 'PRONTO PER LA CONSEGNA' : 'NON ANCORA PRONTO'), 'controlli');
    Store.touch();
    return { rows, ready, reasons: blockers.map(r => r.label + ': ' + r.detail), at: U.nowISO() };
  }

  /* ---------- QUALITY CHECK ("30 e lode") ---------- */
  function qualityCheck() {
    const P = Store.P;
    const blocks = Model.allBlocks();
    const open = Metrics.openIssues();
    const areas = [];
    const level = s => s === null ? 'N/D' : s >= 90 ? 'ECCELLENTE' : s >= 70 ? 'BUONO' : s >= 40 ? 'DA MIGLIORARE' : 'INSUFFICIENTE';
    const area = (name, score, details, tips) => areas.push({ name, score: score === null ? null : Math.round(U.clamp(score, 0, 100)), level: level(score === null ? null : U.clamp(score, 0, 100)), details, tips });
    const secs = P.report.sections.filter(s => U.str(s.content).trim());
    // Chiarezza
    if (!secs.length) area('Chiarezza', null, ['Relazione non ancora scritta'], ['Scrivi la relazione per valutare la chiarezza.']);
    else {
      const sents = secs.flatMap(s => U.sentences(U.stripMd(s.content)));
      const avg = sents.length ? sents.reduce((a, s) => a + U.words(s), 0) / sents.length : 0;
      const long = sents.filter(s => U.words(s) > 40).length;
      const structured = secs.filter(s => /^#|\n#|^\s*[-*]\s|\n\s*[-*]\s|\|/.test(s.content)).length;
      let sc = 100 - Math.max(0, avg - 22) * 3 - long * 4 + Math.min(10, structured * 2);
      area('Chiarezza', sc, ['Lunghezza media frase: ' + avg.toFixed(1) + ' parole', long + ' frasi oltre 40 parole', structured + ' sezioni con elenchi/tabelle/sottotitoli'], long ? ['Spezza le frasi più lunghe.'] : []);
    }
    // Completezza
    const req = P.brief.analysis.filter(a => ['mandatory', 'deliverables', 'results', 'data'].includes(a.cat));
    const rp = Metrics.reportProgress();
    const phs = Model.phasesSorted();
    const comp = [req.length ? U.pct(req.filter(a => a.done).length, req.length) : null, phs.length ? Math.round(phs.reduce((a, p) => a + Metrics.phaseProgress(p).pct, 0) / phs.length) : null,
      P.report.sections.filter(s => s.required).length ? U.pct(P.report.sections.filter(s => s.required && U.str(s.content).trim()).length, P.report.sections.filter(s => s.required).length) : null].filter(x => x !== null);
    area('Completezza', comp.length ? comp.reduce((a, b) => a + b, 0) / comp.length : null, ['Requisiti consegna soddisfatti: ' + (req.length ? req.filter(a => a.done).length + '/' + req.length : 'n/d'), 'Avanzamento medio fasi: ' + (phs.length ? Math.round(phs.reduce((a, p) => a + Metrics.phaseProgress(p).pct, 0) / phs.length) + '%' : 'n/d'), 'Sezioni obbligatorie scritte: ' + (P.report.sections.filter(s => s.required).length - rp.requiredEmpty.length) + '/' + P.report.sections.filter(s => s.required).length], []);
    // Coerenza
    const inc = open.filter(i => ['POSSIBILE INCOERENZA', 'NUMERI DIFFERENTI', 'VERIFICA UNITÀ', 'FORMULE DIFFERENTI'].includes(i.category));
    area('Coerenza', 100 - inc.length * 15, [inc.length + ' incoerenze aperte (valori, unità, formule)'], inc.length ? ['Risolvi le incoerenze segnalate nei Controlli.'] : []);
    // Tracciabilità
    const results = blocks.filter(x => x.block.type === 'result');
    const tracedRes = results.filter(x => x.block.refs.length).length;
    const untraced = open.filter(i => i.category === 'POSSIBILE DATO NON TRACCIATO').length;
    area('Tracciabilità', results.length ? U.pct(tracedRes, results.length) - untraced * 8 : (untraced ? 60 - untraced * 8 : null), [tracedRes + '/' + results.length + ' risultati con "Deriva da"', untraced + ' dati della relazione non tracciati'], ['Collega ogni risultato al calcolo o ai dati da cui deriva.']);
    // Motivazione delle scelte
    const gl = P.guidelines;
    const glMot = gl.filter(g => U.str(g.motivation).trim()).length;
    const motText = blocks.filter(x => TEXTY.includes(x.block.type) && /\b(perché|poiché|in quanto|abbiamo scelto|si è scelto|la scelta|motiv|because|therefore|quindi|per questo)\b/i.test(x.block.content)).length;
    const textBlocks = blocks.filter(x => TEXTY.includes(x.block.type)).length;
    area('Motivazione delle scelte', gl.length || textBlocks ? (gl.length ? U.pct(glMot, gl.length) * 0.5 : 50) + (textBlocks ? Math.min(50, motText / Math.max(1, phs.length) * 25) : 0) : null, [glMot + '/' + gl.length + ' linee guida motivate', motText + ' blocchi di testo con giustificazioni esplicite'], ['Per ogni scelta metodologica scrivi perché è stata fatta.']);
    // Grafici
    const charts = blocks.filter(x => x.block.type === 'chart');
    if (!charts.length) area('Qualità dei grafici', null, ['Nessun grafico'], []);
    else {
      const good = charts.filter(({ block: b }) => U.str(b.title).trim() && U.str(b.xLabel).trim() && U.str(b.yLabel).trim() && (U.str(b.xUnit).trim() || U.str(b.yUnit).trim())).length;
      const chIss = open.filter(i => i.ref && charts.some(c => c.block.id === i.ref.blockId)).length;
      area('Qualità dei grafici', U.pct(good, charts.length) - chIss * 10, [good + '/' + charts.length + ' grafici con titolo, assi e unità', chIss + ' segnalazioni aperte sui grafici'], ['Ogni grafico: titolo, etichette assi, unità, fonte dei dati.']);
    }
    // Tabelle
    const tables = blocks.filter(x => x.block.type === 'table');
    if (!tables.length) area('Qualità delle tabelle', null, ['Nessuna tabella'], []);
    else {
      const good = tables.filter(({ block: b }) => U.str(b.title).trim() && U.arr(b.rows).length && !U.arr(b.rows).some(r => U.arr(r).some(c => !U.str(c).trim())) && !U.arr(b.columns).some(c => !U.str(c).trim())).length;
      area('Qualità delle tabelle', U.pct(good, tables.length), [good + '/' + tables.length + ' tabelle con titolo, intestazioni e nessuna cella vuota'], ['Aggiungi titolo, unità nelle intestazioni e note sulla fonte.']);
    }
    // Precisione terminologica
    const term = open.filter(i => i.category === 'TERMINOLOGIA INCOERENTE' || (i.category === 'REGOLA PERSONALIZZATA' && /termine/i.test(i.problem))).length;
    const gram = open.filter(i => i.category === 'POSSIBILE ERRORE GRAMMATICALE').length;
    area('Precisione terminologica', 100 - term * 15 - gram * 4, [term + ' incoerenze terminologiche', gram + ' possibili errori di scrittura'], []);
    // Ordine
    let ordSc = 100;
    const ordDet = [];
    const skipped = open.filter(i => i.category === 'PASSAGGIO SALTATO').length;
    ordSc -= skipped * 15; ordDet.push(skipped + ' passaggi saltati tra le fasi');
    const tb = P.customRules.find(r => r.type === 'table-before-chart' && r.active);
    if (tb) { const v = open.filter(i => i.rule === 'custom:' + tb.id).length; ordSc -= v * 10; ordDet.push(v + ' violazioni "tabella prima del grafico"'); }
    const titlesOrdered = P.report.sections.every((s, i, a) => i === 0 || a[i - 1].order <= s.order);
    if (!titlesOrdered) { ordSc -= 10; ordDet.push('Ordine delle sezioni non coerente'); }
    area('Ordine', phs.length ? ordSc : null, ordDet, []);
    // Conclusioni supportate
    const concl = P.report.sections.find(s => /conclus/i.test(s.title));
    const cIss = open.filter(i => i.category === 'CONCLUSIONE NON SUPPORTATA' || (i.category === 'POSSIBILE DATO NON TRACCIATO' && /conclus/i.test(i.element))).length;
    area('Conclusioni supportate', concl && U.str(concl.content).trim() ? 100 - cIss * 25 : null, concl && U.str(concl.content).trim() ? [cIss + ' segnalazioni su conclusioni non supportate'] : ['Conclusioni non ancora scritte'], ['Ogni conclusione deve richiamare un risultato del progetto.']);
    // Assenza di contraddizioni
    const contr = open.filter(i => ['POSSIBILE INCOERENZA', 'NUMERI DIFFERENTI', 'CALCOLO SOSPETTO'].includes(i.category)).length;
    area('Assenza di contraddizioni', 100 - contr * 20, [contr + ' contraddizioni o calcoli sospetti aperti'], []);
    // Rispetto indicazioni professore
    const pn = P.profNotes.filter(n => n.category !== 'NOTA');
    area('Rispetto indicazioni del professore', pn.length ? U.pct(pn.filter(n => n.applied).length, pn.length) : null, [pn.length ? pn.filter(n => n.applied).length + '/' + pn.length + ' indicazioni recepite' : 'Nessuna indicazione registrata'], ['Registra tutte le indicazioni ricevute e segnala quando le hai applicate.']);
    History.log('Quality Check eseguito', 'controlli');
    Store.touch();
    return { areas, at: U.nowISO() };
  }

  return { RULES, run, collect, decide, finalCheck, qualityCheck, fingerprint };
})();
