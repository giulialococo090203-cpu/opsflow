/* =====================================================================
   DATI DEMO — progetto dimostrativo (azienda fittizia)
   Serve a provare dashboard, scadenze, linee guida, fasi, errori,
   revisioni e relazione. Contiene volutamente alcune incoerenze che il
   Project Checker deve trovare. Eliminabile con "ELIMINA DATI DEMO".
   ===================================================================== */
'use strict';

const Demo = {
  build() {
    const d = n => U.addDays(U.todayISO(), n);
    const iso = n => { const x = U.toDate(d(n)); x.setHours(10, 30); return x.toISOString(); };
    const P = Factory.project({
      name: 'DEMO · Miglioramento del processo di gestione ordini', subject: 'Business Process Management', degree: 'LM Ingegneria Gestionale',
      professor: 'Prof. Esempio (demo)', year: '2026/27', members: ['Studente A', 'Studente B', 'Studente C'], dueDate: d(40),
      objective: 'Ridurre il lead time del processo di gestione degli ordini di un\'azienda partner (fittizia), mantenendo la qualità del servizio.',
      description: 'Analisi AS-IS del processo ordini di "Alfa Forniture S.r.l." (azienda fittizia), calcolo dei KPI, proposta TO-BE e confronto tramite simulazione.',
      notes: 'Progetto dimostrativo: tutti i dati sono inventati a scopo di prova.'
    });
    P.isDemo = true;
    P.createdAt = iso(-30);
    P.brief.original = 'Progetto di Business Process Management – A.A. 2026/27 (TESTO DIMOSTRATIVO)\n\nOgni gruppo deve analizzare un processo reale di un\'azienda partner e proporne il miglioramento.\nL\'obiettivo è ridurre il lead time del processo di gestione degli ordini mantenendo la qualità del servizio.\nIl gruppo deve raccogliere i dati sul processo attuale tramite interviste e documenti aziendali.\nÈ richiesto il modello AS-IS del processo in notazione BPMN.\nDevono essere calcolati i principali KPI del processo (lead time, tempo di lavorazione, tasso di errore).\nIl gruppo deve proporre uno scenario TO-BE e confrontarlo con l\'AS-IS tramite simulazione.\nLa relazione finale non deve superare le 40 pagine, esclusi gli allegati.\nOgni grafico deve essere accompagnato da una tabella con i dati.\nConsegna intermedia (deliverable D2) entro il ' + U.fmtDate(d(5)) + '.\nConsegna finale entro il ' + U.fmtDate(d(40)) + '.';
    P.brief.savedAt = iso(-29);
    const bi = (cat, text, done) => Object.assign(Factory.briefItem(cat, text, 'AUTO'), { done, doneAt: done ? iso(-12) : null });
    P.brief.analysis = [
      bi('objectives', 'Ridurre il lead time del processo di gestione degli ordini mantenendo la qualità del servizio.', false),
      bi('data', 'Raccogliere i dati sul processo attuale tramite interviste e documenti aziendali.', true),
      bi('mandatory', 'Modello AS-IS del processo in notazione BPMN.', true),
      bi('results', 'Calcolare i principali KPI del processo (lead time, tempo di lavorazione, tasso di errore).', false),
      bi('mandatory', 'Proporre uno scenario TO-BE e confrontarlo con l\'AS-IS tramite simulazione.', false),
      bi('constraints', 'La relazione finale non deve superare le 40 pagine, esclusi gli allegati.', false),
      bi('mandatory', 'Ogni grafico deve essere accompagnato da una tabella con i dati.', false),
      bi('deliverables', 'Relazione finale.', false)
    ];
    // materiale del professore
    const pn = (o) => Object.assign(Factory.profNote(), o, { createdAt: iso(-10) });
    const pn1 = pn({ title: 'Il modello AS-IS deve includere le eccezioni', date: d(-10), category: 'CORREZIONE', source: 'Revisione', importance: 'ALTA', content: 'Nel diagramma AS-IS mancano i percorsi di eccezione (ordine incompleto, prodotto non disponibile). Aggiungerli prima della consegna D2.', applied: false });
    const pn2 = pn({ title: 'KPI: indicare sempre la formula', date: d(-20), category: 'INDICAZIONE UFFICIALE', source: 'Lezione', importance: 'ALTA', content: 'Per ogni KPI riportare la formula, il significato dei simboli e l\'unità di misura.', applied: true });
    const pn3 = pn({ title: 'Tracciabilità dei dati', date: d(-20), category: 'CRITERIO DI VALUTAZIONE', source: 'Lezione', importance: 'MEDIA', content: 'Ogni numero riportato nella relazione deve poter essere ricondotto a una fonte (intervista, documento, calcolo).', applied: false });
    const pn4 = pn({ title: 'Usare i minuti per tutti i tempi', date: d(-15), category: 'CONSIGLIO', source: 'Email', importance: 'BASSA', content: 'Conviene usare la stessa unità (minuti) per tutti i tempi del processo.', applied: true });
    P.profNotes = [pn1, pn2, pn3, pn4];
    // esempio precedente
    P.examples = [Object.assign(Factory.example(), {
      title: 'Esempio DEMO · Ottimizzazione del processo di picking (a.a. precedente)', year: '2025/26', subject: 'Business Process Management', grade: '28', corrected: true,
      description: 'Elaborato fittizio usato per mostrare l\'estrazione del metodo.',
      text: '1. THE COMPANY AND ITS BUSINESS PROCESS\n1.1 Company description\nThe company operates in wholesale distribution.\n1.2 Supply chain analysis\n1.3 Value chain\n2. BPM PROJECT\n2.1 Process analysis AS-IS\nThe AS-IS process was modelled in BPMN with swimlanes for each department.\nTable 1 - Activity times\nFigure 1 - BPMN AS-IS diagram\n2.2 KPI definition\nLead time = sum of activity times\nError rate = errors / orders * 100\n2.3 TO-BE proposal\nTwo alternative TO-BE scenarios were compared through simulation with Arena.\nFigure 2 - Simulation results\nTable 2 - KPI comparison AS-IS vs TO-BE\n3. CONCLUSIONS\nThe TO-BE scenario reduces the lead time.',
      knownErrors: 'Unità di misura dei tempi non uniformi\nConclusioni non collegate ai KPI', createdAt: iso(-26)
    })];
    P.examples[0].method = AI.analyzeExample(P.examples[0]);
    P.examplesSynthesis = AI.synthesizeExamples(P.examples);
    // fasi
    const ph1 = Object.assign(Factory.phase(0, 'Raccolta dati'), { description: 'Interviste e raccolta documenti sul processo ordini.', start: d(-28), end: d(-14) });
    const ph2 = Object.assign(Factory.phase(1, 'Analisi AS-IS'), { description: 'Modello BPMN del processo attuale e calcolo del lead time.', start: d(-14), end: d(3) });
    const ph3 = Object.assign(Factory.phase(2, 'KPI e grafici'), { description: 'Calcolo dei KPI e rappresentazione grafica.', start: d(1), end: d(15) });
    const ph4 = Object.assign(Factory.phase(3, 'Scenario TO-BE e simulazione'), { description: 'Proposta di miglioramento e confronto tramite simulazione.', start: d(15), end: d(30) });
    const ck = (t, done) => Object.assign(Factory.checkItem(t), { done, doneAt: done ? iso(-15) : null });
    ph1.checklist = [ck('Dati raccolti', true), ck('Dati controllati', true)];
    ph2.checklist = [ck('Modello BPMN AS-IS', true), ck('Percorsi di eccezione', false), ck('Calcolo lead time', true), ck('Risultato verificato', false)];
    ph3.checklist = [ck('Formula verificata', false), ck('Calcolo completato', false), ck('Grafico realizzato', false), ck('Interpretazione scritta', false)];
    ph4.checklist = C.DEFAULT_CHECKLIST.map(t => Factory.checkItem(t));
    const blk = (type, o) => Object.assign(Factory.block(type), o, { createdAt: iso(-12), updatedAt: iso(-8) });
    const b11 = blk('text', { title: 'Interviste svolte', content: 'Sono state svolte 3 interviste con il responsabile ordini e 2 operatori. Sono stati analizzati i report del gestionale relativi a un mese tipo.', status: 'VERIFICATO', inReport: true, source: 'Interviste in azienda (demo)' });
    const b12 = blk('table', { title: 'Tempi delle attività AS-IS', columns: ['Attività', 'Tempo medio [min]', 'Ordini/mese'], rows: [['Ricezione ordine', '6', '1200'], ['Verifica disponibilità', '14', '1200'], ['Inserimento a sistema', '9', '1150'], ['Conferma al cliente', '13', '1150']], notes: 'Fonte: report gestionale, mese tipo (dati dimostrativi).', status: 'VERIFICATO', inReport: true });
    ph1.blocks = [b11, b12];
    const b21 = blk('formula', { title: 'Lead time', latex: 'LT = \\sum_{i=1}^{n} t_i', content: 'LT = lead time [min]; t_i = tempo medio dell\'attività i [min]', status: 'VERIFICATO' });
    const b22 = blk('calc', { title: 'Lead time medio AS-IS', expression: 't1 + t2 + t3 + t4', variables: [{ name: 't1', value: '6', unit: 'min' }, { name: 't2', value: '14', unit: 'min' }, { name: 't3', value: '9', unit: 'min' }, { name: 't4', value: '13', unit: 'min' }], resultName: 'Lead time medio', statedResult: '42', computed: 42, unit: 'min', status: 'VERIFICATO', inReport: true });
    const b23 = blk('result', { title: 'Lead time AS-IS', name: 'Lead time medio', value: '42', unit: 'min', content: 'Somma dei tempi medi delle quattro attività.', status: 'VERIFICATO', inReport: true });
    b22.refs = [{ type: 'block', id: b12.id }];
    b23.refs = [{ type: 'block', id: b22.id }];
    const b24 = blk('text', { title: 'Commento al modello AS-IS', content: 'Dal modello emerge che la verifica di disponibilità è l\'attività più lunga. Dall\'analisi emerge un lead time medio = 45 min, con forte variabilità nei giorni di picco.', status: 'BOZZA', inReport: true });
    ph2.blocks = [b21, b22, b23, b24];
    const b31 = blk('chart', { title: 'Tempo medio per attività', chartType: 'bar', labels: 'Ricezione; Verifica; Inserimento; Conferma', series: [{ name: 'AS-IS', data: '6; 14; 9; 13' }], xLabel: 'Attività', yLabel: 'Tempo medio', xUnit: '', yUnit: '', status: 'BOZZA' });
    b31.refs = [{ type: 'block', id: b12.id }];
    const b32 = blk('calc', { title: 'Tasso di errore', expression: 'errori / ordini * 100', variables: [{ name: 'errori', value: '36', unit: 'ordini' }, { name: 'ordini', value: '1200', unit: 'ordini' }], resultName: 'Tasso di errore', statedResult: '3.5', computed: null, unit: '%', status: 'DA VERIFICARE' });
    const b33 = blk('interpretation', { title: 'Prime considerazioni', content: 'La verifica di disponibilità incide per un terzo del lead time: è il primo candidato al miglioramento.', status: 'BOZZA' });
    ph3.blocks = [b31, b32, b33];
    P.phases = [ph1, ph2, ph3, ph4];
    // linee guida
    const gl = o => Object.assign(Factory.guideline(), o, { createdAt: iso(-25), updatedAt: iso(-9) });
    P.guidelines = [
      gl({ title: 'Modellare il processo AS-IS in BPMN', description: 'Rappresentare il processo attuale in BPMN con swimlane per ogni funzione aziendale.', motivation: 'Richiesto esplicitamente dalla consegna.', source: 'CONSEGNA', sourceRef: 'Consegna: "È richiesto il modello AS-IS del processo in notazione BPMN"', priority: 'ALTA', mandatory: true, status: 'COMPLETATA', phaseId: ph2.id }),
      gl({ title: 'Includere i percorsi di eccezione nel modello AS-IS', description: 'Aggiungere ordine incompleto e prodotto non disponibile come percorsi alternativi.', motivation: 'Correzione del professore alla revisione.', source: 'CORREZIONE_PROF', sourceRef: 'Revisione del ' + U.fmtDate(d(-10)), priority: 'CRITICA', mandatory: true, status: 'DA VERIFICARE', phaseId: ph2.id }),
      gl({ title: 'Calcolare i KPI con formula esplicita', description: 'Lead time, tempo di lavorazione e tasso di errore con formula, simboli e unità.', motivation: 'Indicazione data a lezione.', source: 'INDICAZIONE_PROF', sourceRef: 'Lezione del ' + U.fmtDate(d(-20)), priority: 'ALTA', mandatory: true, status: 'IN CORSO', phaseId: ph3.id }),
      gl({ title: 'Tabella dei dati prima di ogni grafico', description: 'Ogni grafico deve essere preceduto dalla tabella con i dati rappresentati.', motivation: 'Richiesto dalla consegna.', source: 'CONSEGNA', sourceRef: 'Consegna: "Ogni grafico deve essere accompagnato da una tabella con i dati"', priority: 'MEDIA', mandatory: false, status: 'NON INIZIATA', phaseId: ph3.id }),
      gl({ title: 'Proporre almeno due alternative TO-BE', description: 'Confrontare due scenari di miglioramento invece di uno solo.', motivation: 'Rende più solida la scelta dello scenario finale.', source: 'AI', sourceRef: 'Proposta di Claude (demo) · da verificare con il professore', priority: 'MEDIA', mandatory: false, status: 'NON INIZIATA', phaseId: ph4.id })
    ];
    // scadenze e attività
    const dl1 = Object.assign(Factory.deadline(), { title: 'Scelta dell\'azienda partner', kind: 'MILESTONE', date: d(-25), status: 'COMPLETATA', priority: 'ALTA' });
    const dl2 = Object.assign(Factory.deadline(), { title: 'Consegna intermedia D2 (AS-IS e KPI)', kind: 'CONSEGNA INTERMEDIA', date: d(5), time: '23:59', priority: 'ALTA', description: 'Caricare il modello AS-IS con eccezioni e i KPI calcolati.' });
    const dl3 = Object.assign(Factory.deadline(), { title: 'Modello TO-BE pronto per la simulazione', kind: 'MILESTONE', date: d(25), priority: 'MEDIA' });
    const tk = o => Object.assign(Factory.task(), o, { createdAt: iso(-12) });
    const t1 = tk({ title: 'Completare il modello AS-IS con i percorsi di eccezione', phaseId: ph2.id, deadlineId: dl2.id, priority: 'ALTA', due: d(3) });
    const t2 = tk({ title: 'Calcolare tasso di errore e tempo di lavorazione', phaseId: ph3.id, deadlineId: dl2.id, priority: 'ALTA', status: 'IN CORSO', due: d(4) });
    const t3 = tk({ title: 'Preparare le slide per la consegna D2', deadlineId: dl2.id, priority: 'MEDIA', due: d(5) });
    const t4 = tk({ title: 'Intervista al responsabile ordini', phaseId: ph1.id, status: 'COMPLETATA', doneAt: iso(-20) });
    dl2.taskIds = [t1.id, t2.id, t3.id]; dl2.phaseIds = [ph2.id];
    P.deadlines = [dl1, dl2, dl3];
    P.tasks = [t1, t2, t3, t4];
    // revisioni e domande
    const r1 = Object.assign(Factory.revision(), { date: d(-10), time: '11:00', status: 'SVOLTA', topics: 'Modello AS-IS in BPMN\nDati raccolti', materials: 'Diagramma BPMN stampato', corrections: 'Il modello AS-IS deve includere i percorsi di eccezione.', indications: 'Per ogni KPI riportare la formula.', nextActions: 'Aggiungere le eccezioni al BPMN\nDefinire le formule dei KPI', createdAt: iso(-15) });
    const r2 = Object.assign(Factory.revision(), { date: d(2), time: '15:00', status: 'PIANIFICATA', topics: 'Modello AS-IS aggiornato con le eccezioni\nPrimi KPI', createdAt: iso(-8) });
    P.revisions = [r1, r2];
    P.questions = [
      Object.assign(Factory.question(), { text: 'Il modello AS-IS deve includere anche il sottoprocesso di fatturazione?', topic: 'Analisi AS-IS', priority: 'ALTA', revisionId: r2.id, createdAt: iso(-6) }),
      Object.assign(Factory.question(), { text: 'Per la simulazione possiamo usare un software diverso da Arena?', topic: 'Simulazione', priority: 'MEDIA', createdAt: iso(-4) })
    ];
    // relazione
    const sec = t => P.report.sections.find(s => s.title === t);
    Object.assign(sec('Introduzione'), { content: 'Il progetto analizza il processo di gestione degli ordini di Alfa Forniture S.r.l. (azienda fittizia) con l\'obiettivo di ridurne il lead time.', status: 'BOZZA' });
    Object.assign(sec('Obiettivo'), { content: 'Ridurre il lead time del processo ordini mantenendo la qualità del servizio.', status: 'RIVISTA' });
    Object.assign(sec('Metodologia'), { content: 'Il processo è stato modellato in BPMN (Figura 1) a partire da interviste e dati del gestionale (Tabella 1).', status: 'BOZZA' });
    Object.assign(sec('Risultati'), { content: 'Il lead time medio del processo AS-IS è pari a 42 min. Il tasso di errore è del 3,5%. Lo scenario TO-BE permetterebbe una riduzione stimata del 30% del lead time (vedi Grafico 2).', status: 'BOZZA' });
    // regole personalizzate
    P.customRules = [
      Object.assign(Factory.customRule(), { text: 'Ogni grafico deve indicare le unità degli assi', type: 'chart-axis-units', severity: 'ATTENZIONE' }),
      Object.assign(Factory.customRule(), { text: 'Il professore vuole sempre la tabella prima del grafico', type: 'table-before-chart', severity: 'ATTENZIONE' }),
      Object.assign(Factory.customRule(), { text: 'Rileggere tutta la relazione ad alta voce prima della consegna', type: 'manual', severity: 'INFO' })
    ];
    // attività registrate
    [[-30, 'Progetto creato: ' + P.info.name], [-29, 'Consegna ufficiale inserita'], [-25, 'Create 4 fasi dalle linee guida'], [-20, 'Completata attività: Intervista al responsabile ordini'],
      [-12, 'Aggiunto blocco Tabella in "Raccolta dati"'], [-10, 'Revisione del ' + U.fmtDate(d(-10)) + ' registrata'], [-8, 'Calcolo eseguito: Lead time medio = 42']].forEach(([n, t]) => P.activity.unshift({ id: U.uid('act'), at: iso(n), text: t, type: 'demo' }));
    P.history.unshift({ id: U.uid('ver'), at: iso(-9), type: 'guidelines', elementId: P.guidelines[1].id, label: P.guidelines[1].title, field: 'status', before: '{"status":"NON INIZIATA"}', after: '{"status":"DA VERIFICARE"}', rawBefore: { status: 'NON INIZIATA' }, reason: 'Eccezioni aggiunte, da verificare', origin: 'UTENTE' });
    return P;
  }
};
