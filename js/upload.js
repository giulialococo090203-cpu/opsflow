/* =====================================================================
   UPLOAD — "carica il file e l'app fa i passaggi"
   Pulsante "Carica file" e trascinamento su qualsiasi pagina:
   1. salva il file (IndexedDB)  2. ne estrae il testo (Extract)
   3. propone cosa contiene      4. esegue i passaggi corrispondenti:
      - Consegna            → testo originale + analisi in proposte
      - Materiale professore → nuova indicazione con il testo
      - Esempio precedente   → esempio + metodo + sintesi aggiornata
      - Nostra relazione     → sezioni come PROPOSTE da accettare + coerenza
      - Risposta di Claude   → proposte
      - Solo allegato        → archivio file
   Niente viene applicato alla relazione senza la tua conferma.
   ===================================================================== */
'use strict';

const Uploader = (() => {
  const KINDS = [['phase', 'Lavoro di una fase (PDF/Word) → contenuti della fase e relazione'], ['example', 'Esempio precedente (relazione D4, esercitazione, elaborato)'], ['brief', 'Consegna ufficiale'], ['prof', 'Materiale del professore (slide, email, correzioni)'],
    ['report', 'La nostra relazione (bozza D3/D4 da importare)'], ['claude', 'Risposta di Claude'], ['attachment', 'Solo allegato (archivio file)']];
  function guess(file, ex) {
    const n = U.norm(file.name), t = ex.text || '';
    if (!t) return 'attachment';
    if (/#{1,4}\s*(linea guida|fase|osservazione|domanda)\s*[:\-–]/i.test(t)) return 'claude';
    if (/consegna|assignment|brief|traccia/.test(n)) return 'brief';
    if (/opsflow/i.test(n + ' ' + t.slice(0, 600)) || /bozza|draft|nostra|our/.test(n)) return 'phase';
    if (/\bd[34]\b|exercise|esercitaz|^es[ .]|report|relazione|solution|soluzion/.test(n) || ex.words > 1500) return 'example';
    if (/lesson|lezione|slide|email|mail|correz/.test(n)) return 'prof';
    return ex.words > 600 ? 'example' : 'prof';
  }
  function titleFrom(file, text) {
    const lines = U.str(text).split('\n').map(l => l.trim()).filter(l => l.length > 8 && l.length < 120 && !/^(business process management|index|indice|\d+)$/i.test(l));
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ');
    const cand = lines.slice(0, 12).find(l => /process|improv|optimi|management of|miglior|analisi|exercise|esercit/i.test(l) && !/^business process management$/i.test(l));
    return cand ? base + ' · ' + U.truncate(cand, 90) : base;
  }

  /** prepara i testi delle sezioni della relazione a partire da un documento */
  function reportToMarkdown(text) {
    if (/^##\s+\S/m.test(text)) return text;
    const secs = Store.P.report.sections;
    const key = t => U.norm(t).replace(/^[\d.\s]+/, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const hs = Extract.headings(text);
    const lines = U.str(text).split('\n');
    hs.forEach(h => {
      const k = key(h.l.replace(/^#+\s*/, ''));
      if (k.length < 4) return;
      const sec = secs.find(s => { const st = key(s.title); return st === k || (k.length >= 6 && (st.includes(k) || k.includes(st))); });
      if (sec) lines[h.i] = '## ' + sec.title;
    });
    return lines.join('\n');
  }

  async function process(files, presetKind, ctx = {}) {
    if (!Store.P) return UI.toast('Crea o apri prima un progetto', 'err');
    if (!files || !files.length) return;
    UI.toast('Lettura di ' + U.plural(files.length, 'file', 'file') + ' in corso…');
    const items = [];
    for (const f of files) {
      let ex = { text: '', pages: null, words: 0 }, err = '';
      try { ex = await Extract.file(f); } catch (e) { err = e.message; }
      items.push({ file: f, ex, err, kind: presetKind === 'phase' && !/\.(pdf|docx|pptx|txt|md)$/i.test(f.name) ? 'attachment' : presetKind || guess(f, ex) });
    }
    const SIMPLE_K = ['phase', 'prof', 'example', 'attachment'];
    const kinds = typeof isSimple === 'function' && isSimple() ? KINDS.filter(([v]) => SIMPLE_K.includes(v)) : KINDS;
    if (kinds !== KINDS) items.forEach(it => { if (!SIMPLE_K.includes(it.kind)) it.kind = it.ex.text ? 'phase' : 'attachment'; });
    const opts = k => kinds.map(([v, l]) => '<option value="' + v + '"' + (v === k ? ' selected' : '') + '>' + U.esc(l) + '</option>').join('');
    const body = '<p class="small muted mb">Indica cosa contiene ogni file: l\'app eseguirà i passaggi corrispondenti. Il file viene comunque salvato nell\'archivio del progetto.</p>' +
      items.map((it, i) => '<div class="card flat mb"><div class="row between top"><div class="grow"><b>' + U.esc(it.file.name) + '</b> <span class="small muted">' + U.fileSize(it.file.size) + (it.ex.pages ? ' · ' + it.ex.pages + ' pagine' : '') + ' · ' + it.ex.words + ' parole lette</span>' +
        (it.err ? '<p class="small" style="color:var(--risk)">' + U.esc(it.err) + '</p>' : it.ex.unsupported ? '<p class="small muted">Formato senza testo leggibile: verrà salvato come allegato.</p>' : it.ex.scanned ? '<p class="small" style="color:var(--warn)">Pochissimo testo: forse è un PDF scansionato (immagine). Verrà salvato, ma il contenuto va inserito a mano.</p>' : '') +
        (it.ex.text ? '<details class="exp mt-s"><summary class="small">Anteprima del testo letto</summary><div class="exp-body"><pre class="small" style="max-height:200px;overflow:auto">' + U.esc(it.ex.text.slice(0, 2500)) + '</pre></div></details>' : '') + '</div>' +
        '<div style="min-width:320px"><div class="field"><label for="up-k-' + i + '">Che cos\'è?</label><select id="up-k-' + i + '" data-upk="' + i + '">' + opts(it.ex.text || it.kind === 'phase' ? it.kind : 'attachment') + '</select></div>' +
        '<div data-upph="' + i + '"' + (it.kind === 'phase' ? '' : ' hidden') + '><div class="field mt-s"><label for="up-ph-' + i + '">In quale fase?</label><select id="up-ph-' + i + '">' + phaseOpts(it.file, ctx.phaseId) + '</select></div>' +
        '<div class="field mt-s adv"><label for="up-sec-' + i + '">In quale sezione della relazione?</label><select id="up-sec-' + i + '">' + secOpts() + '</select></div></div></div></div></div>').join('');
    const m = UI.modal({ title: 'Carica file nel progetto', size: 'wide', body, footer: '<button class="btn" data-x>Annulla</button><button class="btn primary" data-ok>Elabora</button>' });
    m.el.querySelector('[data-x]').onclick = () => m.close();
    items.forEach((it, i) => { const sel = m.el.querySelector('[data-upk="' + i + '"]'); sel.onchange = () => { m.el.querySelector('[data-upph="' + i + '"]').hidden = sel.value !== 'phase'; }; });
    m.el.querySelector('[data-ok]').onclick = async () => {
      items.forEach((it, i) => { it.kind = m.el.querySelector('[data-upk="' + i + '"]').value; it.phaseId = m.el.querySelector('#up-ph-' + i).value; it.section = m.el.querySelector('#up-sec-' + i).value; });
      m.close();
      const done = [];
      let next = null;
      for (const it of items) {
        try { const r = await apply(it); done.push(r.msg); if (r.next) next = r.next; }
        catch (e) { UI.toast(it.file.name + ': ' + e.message, 'err'); }
      }
      Store.touch();
      App.renderNav();
      if (done.length) UI.toast(done.join(' · '));
      if (next) next(); else App.refresh();
    };
  }

  function phaseOpts(file, pre) {
    const phases = Model.phasesSorted();
    const n = U.norm(file.name);
    const byName = phases.find(p => { const m = U.norm(p.title).match(/^(d\d)\b/); return m && new RegExp('\\b' + m[1] + '\\b').test(n); }) ||
      phases.find(p => /arena|simul/.test(n) && /arena|simul/.test(U.norm(p.title))) || phases.find(p => /present/.test(n) && /present/.test(U.norm(p.title)));
    const cur = pre || (App.route.name === 'dev' && (App.route.id || App.ui.devPhase)) || (byName && byName.id) || (phases.find(p => Metrics.phaseProgress(p).pct < 100) || phases[0] || {}).id;
    return phases.map((p, k) => '<option value="' + p.id + '"' + (p.id === cur ? ' selected' : '') + '>' + (k + 1) + '. ' + U.esc(U.truncate(p.title, 60)) + '</option>').join('');
  }
  function secOpts() {
    const secs = Store.P.report.sections.slice().sort((a, b) => a.order - b.order), nums = LiveReport.numbers(secs);
    return '<option value="auto" selected>Automatica: dai titoli del documento</option>' + secs.map(s => '<option value="' + s.id + '">' + '\u00a0\u00a0'.repeat(Math.max(0, (s.level || 1) - 1)) + U.esc((nums[s.id] ? nums[s.id] + ' ' : '') + s.title) + '</option>').join('') + '<option value="none">Non inserire nella relazione</option>';
  }
  /** titolo → sezione della relazione (null se nessuna corrisponde) */
  function matchSection(title) {
    const key = t => U.norm(t).replace(/^[\d.\s]+/, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const k = key(title);
    if (k.length < 3) return null;
    const secs = Store.P.report.sections.slice().sort((a, b) => a.order - b.order);
    const alias = t => { const r = C.D4_REPORT.find(x => U.norm(x[0]) === U.norm(t)); return r ? r[5] || [] : []; };
    let hit = secs.find(s => key(s.title) === k || alias(s.title).some(a => key(a) === k));
    if (hit) return hit;
    hit = secs.filter(s => { const st = key(s.title); return st.length >= 6 && k.length >= 6 && (st.includes(k) || k.includes(st)); }).sort((a, b) => key(b.title).length - key(a.title).length)[0];
    if (hit) return hit;
    return LiveReport.autoSection({ title: '', description: '' }, { type: 'text', title }) || null;
  }
  /** documento di una fase → blocchi (testo per titolo, tabelle, figure con didascalia) assegnati alle sezioni */
  async function toPhase(it) {
    const P = Store.P, f = it.file;
    const ph = P.phases.find(p => p.id === it.phaseId) || Model.phasesSorted()[0];
    if (!ph) throw new Error('Crea prima almeno una fase');
    const st = await Extract.structure(f);
    const els = st.els || [];
    const rec = await UI.Files.store(f, { category: 'Elaborato', description: 'Caricato nella fase "' + ph.title + '"' });
    const importId = U.uid('imp'), base = f.name.replace(/\.[^.]+$/, '');
    const choice = it.section || 'auto';
    const fileSec = matchSection(base.replace(/[_\-]+/g, ' '));
    const hasHeads = els.some(e => e.t === 'h');
    const out = [];
    const mk = (type, o) => { const b = Object.assign(Factory.block(type), o, { importId, fromFile: f.name }); out.push(b); return b; };
    const att = mk('attachment', { title: 'File caricato: ' + f.name, fileIds: rec ? [rec.id] : [], section: 'none' });
    if (!rec) att.fileIds = [];
    let headSec = null, headTitle = '', skip = false, pre = true, cur = null, lastLi = false, pendCap = null, figN = 0;
    const stackSec = [];
    const secId = () => choice !== 'auto' ? choice : (headSec ? headSec.id : fileSec ? fileSec.id : '');
    const flush = () => {
      if (!cur || !cur.md.trim()) { cur = null; return; }
      const words = U.words(cur.md);
      if (pre && hasHeads && words < 150) mk('note', { title: 'Testo iniziale di ' + f.name + ' (copertina)', content: cur.md, section: 'none' });
      else mk('text', { title: cur.title, content: cur.md, section: secId() });
      cur = null;
    };
    const add = (txt, li) => { if (!cur) cur = { title: headTitle || base, md: '' }; cur.md += (cur.md ? (li && lastLi ? '\n' : '\n\n') : '') + (li ? '- ' : '') + txt; lastLi = li; };
    const stripCap = t => t.replace(/^(fig\.?|figure|figura|table|tab\.?|tabella|chart|grafico|graph)\s*\d+(\.\d+)?\s*[:.\-–—]\s*/i, '').trim();
    for (let k = 0; k < els.length; k++) {
      const e = els[k];
      if (e.t === 'h') {
        flush(); pre = false; lastLi = false;
        skip = Extract.SKIP_HEAD.test(e.text.trim());
        if (skip) continue;
        const lv = Math.max(1, Math.min(4, e.level || 1));
        const m = matchSection(e.text);
        stackSec.length = lv - 1;
        stackSec[lv - 1] = m;
        headSec = m || stackSec.slice(0, lv - 1).reverse().find(Boolean) || headSec;
        headTitle = e.text;
        continue;
      }
      if (skip) continue;
      if (e.t === 'p') { add(e.text, false); continue; }
      if (e.t === 'li') { add(e.text, true); continue; }
      if (e.t === 'cap') {
        const prev = out[out.length - 1];
        const nxt = els[k + 1];
        if (e.kind === 'figure' && nxt && nxt.t === 'img' && !(prev && prev.type === 'image' && !prev.caption && !cur)) { pendCap = stripCap(e.text); continue; }
        if (e.kind === 'table' && nxt && nxt.t === 'table') { pendCap = stripCap(e.text); continue; }
        if (!cur && prev && ((e.kind === 'figure' && prev.type === 'image') || (e.kind === 'table' && prev.type === 'table')) && !prev.caption && !prev._cap) { if (prev.type === 'image') prev.caption = stripCap(e.text); else { prev.title = stripCap(e.text); prev._cap = true; } continue; }
        add('*' + e.text + '*', false); continue;
      }
      if (e.t === 'table') {
        flush();
        const rows = e.rows.map(r => r.map(c => U.str(c)));
        const cols = rows.length > 1 ? rows[0] : rows[0].map((_, q) => 'Colonna ' + (q + 1));
        mk('table', { title: pendCap || headTitle || base, columns: cols, rows: rows.length > 1 ? rows.slice(1) : rows, section: secId(), _cap: !!pendCap });
        pendCap = null; continue;
      }
      if (e.t === 'img') {
        if (pre && hasHeads) continue; // loghi della copertina
        flush();
        figN++;
        const ext = e.ext || 'png';
        const file = new File([e.blob], base + ' - figura ' + figN + '.' + ext, { type: e.blob.type || 'image/' + ext });
        const r2 = await UI.Files.store(file, { category: 'Immagine', description: 'Figura estratta da ' + f.name });
        if (r2) mk('image', { title: pendCap || headTitle || ('Figura da ' + base), fileId: r2.id, caption: pendCap || '', section: secId() });
        pendCap = null; continue;
      }
    }
    flush();
    out.forEach(b => { delete b._cap; if (choice === 'none' && b.type !== 'attachment') b.section = 'none'; });
    ph.blocks.push(...out);
    ph.imports = U.arr(ph.imports); ph.imports.unshift({ id: importId, file: f.name, fileId: rec ? rec.id : '', at: U.nowISO(), count: out.length - 1 });
    History.log('Caricato "' + f.name + '" nella fase "' + ph.title + '": ' + U.plural(out.length - 1, 'contenuto', 'contenuti'), 'fasi');
    const used = new Set(out.map(b => (LiveReport.sectionOf(ph, b) || {}).id).filter(Boolean));
    const cnt = (t) => out.filter(b => b.type === t).length;
    const msg = f.name + ': ' + U.plural(cnt('text'), 'testo', 'testi') + ', ' + U.plural(cnt('table'), 'tabella', 'tabelle') + ', ' + U.plural(cnt('image'), 'figura', 'figure') + ' → ' + U.plural(used.size, 'sezione', 'sezioni') + ' della relazione';
    return { msg, next: () => App.go('dev', ph.id) };
  }

  async function apply(it) {
    if (it.kind === 'phase') return toPhase(it);
    const P = Store.P, f = it.file, text = it.ex.text || '';
    const catOf = { brief: 'Consegna', prof: 'Materiale professore', example: 'Esempio', report: 'Relazione', claude: 'Altro', attachment: 'Altro' };
    const rec = await UI.Files.store(f, { category: catOf[it.kind], description: it.ex.words ? it.ex.words + ' parole lette automaticamente' : '' });
    const fileIds = rec ? [rec.id] : [];
    if (it.kind === 'attachment' || !text) return { msg: f.name + ' salvato in archivio' };
    if (it.kind === 'brief') {
      const B = P.brief;
      if (B.original && B.original !== text) { B.history.unshift({ text: B.original, savedAt: B.savedAt, replacedAt: U.nowISO(), reason: 'Sostituita caricando ' + f.name }); History.version({ type: 'brief', id: 'brief', label: 'Consegna ufficiale', field: 'testo', before: B.original, after: text, reason: 'Caricata da file ' + f.name, origin: 'PROFESSORE' }); }
      B.original = text; B.savedAt = U.nowISO();
      History.log('Consegna caricata da file: ' + f.name, 'consegna');
      return { msg: 'Consegna inserita', next: () => { App.go('brief'); setTimeout(() => Actions['brief-analyze'](), 300); } };
    }
    if (it.kind === 'prof') {
      const n = Object.assign(Factory.profNote(), { title: f.name.replace(/\.[^.]+$/, ''), category: 'INDICAZIONE UFFICIALE', source: 'Documento', importance: 'MEDIA', content: text.length > 30000 ? text.slice(0, 30000) + '\n\n[…testo troncato: il file completo è allegato]' : text, fileIds, notes: 'Caricato da file: verifica categoria e importanza.' });
      Model.add('profNotes', n);
      return { msg: 'Materiale del professore aggiunto', next: () => { App.go('prof', n.id); setTimeout(() => openEditor('profNotes', n.id), 300); } };
    }
    if (it.kind === 'example') {
      const e = Object.assign(Factory.example(), { title: titleFrom(f, text), subject: P.info.subject, text, fileIds, description: 'Caricato da ' + f.name + (it.ex.pages ? ' (' + it.ex.pages + ' pagine)' : '') + '. Completa anno, voto e correzioni se li conosci.' });
      e.method = AI.analyzeExample(e);
      Model.add('examples', e);
      const before = P.examplesSynthesis;
      P.examplesSynthesis = AI.synthesizeExamples(P.examples);
      History.version({ type: 'synthesis', id: 'synthesis', label: 'Sintesi del metodo', field: 'testo', before, after: P.examplesSynthesis, reason: 'Aggiornata dopo il caricamento di ' + f.name, origin: 'CONTROLLO AUTOMATICO' });
      return { msg: 'Esempio analizzato (' + e.method.counts.headings + ' sezioni, ' + e.method.counts.tables + ' tabelle, ' + e.method.counts.charts + ' figure)', next: () => App.go('examples', e.id) };
    }
    if (it.kind === 'report' || it.kind === 'claude') {
      const md = it.kind === 'report' ? reportToMarkdown(text) : text;
      const res = AI.parseResponse(md, it.kind === 'report' ? 'report' : 'auto');
      const batch = { id: U.uid('prop'), at: U.nowISO(), kind: res.kind, raw: md, items: res.items, source: f.name };
      P.proposals.unshift(batch);
      if (res.kind === 'report') { P.report.imports = U.arr(P.report.imports); P.report.imports.unshift({ at: batch.at, text: md, file: f.name }); }
      History.log('Importato ' + f.name + ': ' + U.plural(res.items.length, 'proposta', 'proposte'), 'claude');
      return { msg: U.plural(res.items.length, 'proposta', 'proposte') + ' da ' + f.name, next: () => { App.ui.claudeTab = 'proposals'; App.go('claude', batch.id); } };
    }
    return { msg: f.name + ' salvato' };
  }

  /* ---------- struttura della relazione dagli esempi ---------- */
  async function applyD4Structure(silent = false) {
    const P = Store.P;
    if (!silent && !(await UI.confirm('Applicare il formato dei D4 degli anni precedenti?\n\nCapitoli numerati (1. The company… 2. The BPM project… 3. Conclusions) con sottosezioni 1.1, 2.4.1…\nIl testo già scritto viene mantenuto e spostato nella sezione corrispondente; prima viene salvata una versione della relazione.', { okLabel: 'Applica formato D4' }))) return;
    P.report.snapshots = U.arr(P.report.snapshots);
    P.report.snapshots.unshift({ at: U.nowISO(), label: 'Prima del formato D4', words: Metrics.reportProgress().words, title: P.report.title, sections: U.clone(P.report.sections) });
    const old = P.report.sections.slice();
    const used = new Set();
    const next = C.D4_REPORT.map(([t, level, numbered, req, notes, aliases], i) => {
      const keys = [U.norm(t)].concat((aliases || []).map(U.norm));
      const ex = old.find(s => !used.has(s.id) && keys.includes(U.norm(s.title)));
      if (ex) { used.add(ex.id); return Object.assign(ex, { title: t, level, numbered, required: req, order: i, notes: notes || ex.notes }); }
      return Object.assign(Factory.reportSection(t, req, i, level, numbered), { notes });
    });
    // i blocchi assegnati a mano a sezioni non più presenti restano su "automatico"
    old.filter(s => !used.has(s.id) && U.str(s.content).trim()).forEach(s => next.splice(next.length - 2, 0, Object.assign(s, { order: 0, level: 2, numbered: true, required: false })));
    next.forEach((s, k) => { s.order = k; });
    P.report.sections = next;
    History.log('Applicato il formato della relazione dei D4 precedenti', 'report');
    Store.touch(); App.ui.repSec = null;
    if (silent) return;
    App.refresh();
    UI.toast('Formato D4 applicato');
  }
  function fromExamples() {
    const P = Store.P;
    const ex = P.examples.filter(e => e.method && e.method.structure.length);
    if (!ex.length) return UI.toast('Carica e analizza prima almeno un esempio', 'err');
    const norm = h => U.norm(h).replace(/^[\d.\s]+/, '').replace(/[^a-z0-9 \-]/g, '').trim();
    const cnt = {}, label = {};
    ex.forEach(e => new Set(e.method.structure.map(norm).filter(x => x.length > 3)).forEach(h => { cnt[h] = (cnt[h] || 0) + 1; label[h] = label[h] || e.method.structure.find(x => norm(x) === h).replace(/^[\d.\s]+/, '').trim(); }));
    const min = ex.length >= 2 ? 2 : 1;
    const have = new Set(P.report.sections.map(s => U.norm(s.title)));
    const list = Object.keys(cnt).filter(h => cnt[h] >= min && !have.has(h)).sort((a, b) => cnt[b] - cnt[a]).slice(0, 40);
    if (!list.length) return UI.toast('Nessuna sezione ricorrente nuova da aggiungere');
    const m = UI.modal({ title: 'Sezioni ricorrenti negli esempi', body: '<p class="small muted mb">Titoli presenti in almeno ' + min + ' esempi e non ancora nella tua relazione. Seleziona quelli da aggiungere.</p><div class="stack s">' + list.map(h => '<label class="check-line"><input type="checkbox" value="' + U.attr(h) + '"><span>' + U.esc(label[h]) + ' <span class="badge">' + cnt[h] + '/' + ex.length + '</span></span></label>').join('') + '</div>',
      footer: '<button class="btn" data-x>Annulla</button><button class="btn primary" data-ok>Aggiungi selezionate</button>' });
    m.el.querySelector('[data-x]').onclick = () => m.close();
    m.el.querySelector('[data-ok]').onclick = () => {
      UI.$$('input:checked', m.el).forEach(c => P.report.sections.push(Object.assign(Factory.reportSection(label[c.value], false, P.report.sections.length), { notes: 'Presente in ' + cnt[c.value] + '/' + ex.length + ' esempi.' })));
      Store.touch(); m.close(); App.refresh();
    };
  }
  return { process, apply, applyD4Structure, fromExamples, reportToMarkdown, matchSection, toPhase, KINDS };
})();

Actions['upload'] = async d => { const files = await UI.pickFiles({ multiple: true, accept: d.accept || '' }); if (files.length) Uploader.process(files, d.kind || null, { phaseId: d.ph || '' }); };
Actions['phase-import-remove'] = async d => {
  const ph = Store.P.phases.find(p => p.id === d.ph); if (!ph) return;
  const imp = U.arr(ph.imports).find(x => x.id === d.id); if (!imp) return;
  const n = ph.blocks.filter(b => b.importId === imp.id).length;
  if (!(await UI.confirm('Rimuovere i ' + n + ' contenuti creati da "' + imp.file + '"?\n\nI blocchi che avete modificato vengono rimossi comunque: se volete tenerne qualcuno, copiatelo prima. Il file resta nell\'archivio.', { okLabel: 'Rimuovi contenuti', danger: true }))) return;
  ph.blocks = ph.blocks.filter(b => b.importId !== imp.id);
  ph.imports = ph.imports.filter(x => x !== imp);
  History.log('Rimossi i contenuti di "' + imp.file + '" dalla fase "' + ph.title + '"', 'fasi');
  Store.touch(); App.refresh(); UI.toast('Contenuti rimossi');
};
Actions['report-d4-structure'] = () => Uploader.applyD4Structure();
Actions['report-from-examples'] = () => Uploader.fromExamples();

/* trascina i file su qualsiasi pagina */
(() => {
  let depth = 0, overlay = null;
  const show = on => {
    if (on && !overlay) { overlay = document.createElement('div'); overlay.style.cssText = 'position:fixed;inset:0;z-index:150;background:rgba(43,76,126,.18);border:3px dashed var(--accent);display:grid;place-items:center;font:700 20px var(--font);color:var(--accent);pointer-events:none'; overlay.textContent = 'Rilascia i file: l\'app li legge e li elabora'; document.body.appendChild(overlay); }
    if (!on && overlay) { overlay.remove(); overlay = null; }
  };
  const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  document.addEventListener('dragenter', e => { if (!hasFiles(e) || !Store.P) return; depth++; show(true); });
  document.addEventListener('dragleave', e => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) show(false); });
  document.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth = 0; show(false);
    if (document.querySelector('.modal-back')) return;
    const kinds = { brief: 'brief', prof: 'prof', examples: 'example', report: 'report', dev: 'phase' };
    Uploader.process([...e.dataTransfer.files], kinds[App.route.name] || null, { phaseId: App.route.name === 'dev' ? (App.route.id || App.ui.devPhase) : '' });
  });
})();
