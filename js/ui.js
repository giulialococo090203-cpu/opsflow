/* =====================================================================
   UI — primitive di interfaccia
   - toast, modali accessibili, conferma, form generati da schema
   - badge e classi di stato
   - file allegati (IndexedDB Blob) e anteprime
   - resa formule (KaTeX) e grafici (Chart.js) con fallback offline
   ===================================================================== */
'use strict';

const UI = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ---------- TOAST ---------- */
  function toast(msg, type = 'info', opts = {}) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'err' ? ' err' : '');
    el.setAttribute('role', type === 'err' ? 'alert' : 'status');
    el.innerHTML = '<span class="grow">' + U.esc(msg) + '</span>' + (opts.actionLabel ? '<button class="btn sm">' + U.esc(opts.actionLabel) + '</button>' : '');
    if (opts.actionLabel) el.querySelector('button').onclick = () => { try { opts.onAction(); } finally { el.remove(); } };
    box.appendChild(el);
    setTimeout(() => el.remove(), opts.duration || (opts.actionLabel ? 8000 : type === 'err' ? 7000 : 3200));
  }

  /* ---------- MODALI ---------- */
  const stack = [];
  function modal({ title, body, footer = '', size = '', onClose = null, label = '' }) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = '<div class="modal ' + size + '" role="dialog" aria-modal="true" aria-label="' + U.attr(label || title) + '">' +
      '<div class="modal-head"><h2>' + U.esc(title) + '</h2><button class="btn icon ghost" data-close aria-label="Chiudi">✕</button></div>' +
      '<div class="modal-body">' + body + '</div>' + (footer ? '<div class="modal-foot">' + footer + '</div>' : '') + '</div>';
    const prevFocus = document.activeElement;
    const close = () => {
      const i = stack.indexOf(m);
      if (i >= 0) stack.splice(i, 1);
      back.remove();
      if (onClose) onClose();
      if (prevFocus && prevFocus.focus && document.body.contains(prevFocus)) prevFocus.focus();
    };
    const m = { el: back, close, body: back.querySelector('.modal-body') };
    back.addEventListener('mousedown', e => { if (e.target === back) back._downOnBack = true; });
    back.addEventListener('click', e => { if (e.target === back && back._downOnBack) close(); back._downOnBack = false; });
    back.querySelector('[data-close]').onclick = close;
    back.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        const f = $$('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])', back).filter(x => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
    $('#modal-root').appendChild(back);
    stack.push(m);
    setTimeout(() => { const f = back.querySelector('input:not([type=hidden]):not([type=checkbox]),textarea,select,.modal-foot .btn.primary'); (f || back.querySelector('[data-close]')).focus(); }, 30);
    return m;
  }
  function closeTop() { const m = stack[stack.length - 1]; if (m) { m.close(); return true; } return false; }

  function confirm(message, { title = 'Conferma', okLabel = 'Conferma', danger = false } = {}) {
    return new Promise(res => {
      let done = false;
      const m = modal({ title, size: 'narrow', body: '<p class="prewrap">' + U.esc(message) + '</p>',
        footer: '<button class="btn" data-no>Annulla</button><button class="btn ' + (danger ? 'danger' : 'primary') + '" data-yes>' + U.esc(okLabel) + '</button>',
        onClose: () => { if (!done) res(false); } });
      m.el.querySelector('[data-no]').onclick = () => { done = true; m.close(); res(false); };
      m.el.querySelector('[data-yes]').onclick = () => { done = true; m.close(); res(true); };
      setTimeout(() => m.el.querySelector('[data-yes]').focus(), 40);
    });
  }

  /* ---------- FORM DA SCHEMA ----------
     field: {key,label,type,options,required,hint,full,rows,placeholder,mono}
     type: text|textarea|date|time|number|select|checkbox|tags|multiselect|html */
  function fieldHTML(f, v) {
    const id = 'f_' + f.key + '_' + Math.random().toString(36).slice(2, 7);
    const cls = 'field' + (f.full || f.type === 'textarea' || f.type === 'multiselect' || f.type === 'html' ? ' full' : '');
    const req = f.required ? ' required aria-required="true"' : '';
    const lab = '<label for="' + id + '">' + U.esc(f.label) + (f.required ? ' *' : '') + '</label>';
    const hint = f.hint ? '<span class="hint">' + U.esc(f.hint) + '</span>' : '';
    const opts = (f.options || []).map(o => Array.isArray(o) ? o : [o, o]);
    switch (f.type) {
      case 'textarea': return '<div class="' + cls + '">' + lab + '<textarea id="' + id + '" data-key="' + f.key + '" rows="' + (f.rows || 4) + '" class="' + (f.mono ? 'mono' : '') + (f.rows > 10 ? ' tall' : '') + '" placeholder="' + U.attr(f.placeholder || '') + '"' + req + '>' + U.esc(v) + '</textarea>' + hint + '</div>';
      case 'select': return '<div class="' + cls + '">' + lab + '<select id="' + id + '" data-key="' + f.key + '"' + req + '>' + opts.map(([val, l]) => '<option value="' + U.attr(val) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + U.esc(l) + '</option>').join('') + '</select>' + hint + '</div>';
      case 'checkbox': return '<div class="' + cls + '"><label class="check-line"><input type="checkbox" id="' + id + '" data-key="' + f.key + '"' + (v ? ' checked' : '') + '><span>' + U.esc(f.label) + '</span></label>' + hint + '</div>';
      case 'tags': return '<div class="' + cls + '">' + lab + '<input type="text" id="' + id + '" data-key="' + f.key + '" data-tags="1" value="' + U.attr(U.arr(v).join(', ')) + '" placeholder="' + U.attr(f.placeholder || 'Separati da virgola') + '">' + hint + '</div>';
      case 'multiselect': return '<div class="' + cls + '"><span class="lbl">' + U.esc(f.label) + '</span><div class="stack s" data-key="' + f.key + '" data-multi="1" style="max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:6px;padding:8px">' +
        (opts.length ? opts.map(([val, l]) => '<label class="check-line"><input type="checkbox" value="' + U.attr(val) + '"' + (U.arr(v).includes(val) ? ' checked' : '') + '><span>' + U.esc(l) + '</span></label>').join('') : '<span class="muted small">Nessun elemento disponibile</span>') + '</div>' + hint + '</div>';
      case 'html': return '<div class="' + cls + '">' + (f.label ? '<span class="lbl">' + U.esc(f.label) + '</span>' : '') + f.html + '</div>';
      default: return '<div class="' + cls + '">' + lab + '<input type="' + (f.type || 'text') + '" id="' + id + '" data-key="' + f.key + '" value="' + U.attr(v) + '" placeholder="' + U.attr(f.placeholder || '') + '"' + (f.type === 'number' ? ' step="any"' : '') + req + '>' + hint + '</div>';
    }
  }
  function readForm(root, fields) {
    const out = {};
    fields.forEach(f => {
      if (f.type === 'html') return;
      const el = root.querySelector('[data-key="' + f.key + '"]');
      if (!el) return;
      if (f.type === 'checkbox') out[f.key] = el.checked;
      else if (f.type === 'tags') out[f.key] = el.value.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
      else if (f.type === 'multiselect') out[f.key] = $$('input:checked', el).map(i => i.value);
      else if (f.type === 'number') out[f.key] = el.value === '' ? '' : Number(el.value);
      else out[f.key] = el.value;
    });
    return out;
  }
  function validate(fields, v) {
    for (const f of fields) {
      if (f.required && (v[f.key] === '' || v[f.key] === undefined || (Array.isArray(v[f.key]) && !v[f.key].length))) return 'Il campo "' + f.label + '" è obbligatorio.';
      if (f.type === 'date' && v[f.key] && !U.isValidDate(v[f.key])) return 'Data non valida nel campo "' + f.label + '".';
      if (f.type === 'time' && v[f.key] && !/^\d{2}:\d{2}$/.test(v[f.key])) return 'Ora non valida nel campo "' + f.label + '".';
    }
    return null;
  }
  /** form modale. onSubmit(values) → false per non chiudere; eccezione = messaggio d'errore */
  function form({ title, fields, value = {}, submitLabel = 'Salva', size = '', intro = '', track = false, extraFooter = '', onSubmit, onMount }) {
    let allFields = fields.slice();
    if (track) allFields = allFields.concat([
      { key: '__reason', label: 'Motivo della modifica (cronologia)', type: 'text', placeholder: 'Facoltativo', hint: 'Registrato nella cronologia delle versioni' },
      { key: '__origin', label: 'Origine', type: 'select', options: C.ORIGINS }
    ]);
    const val = Object.assign({ __origin: 'UTENTE', __reason: '' }, value);
    const body = (intro ? '<div class="mb">' + intro + '</div>' : '') + '<form class="form" novalidate>' + allFields.map(f => fieldHTML(f, val[f.key] === undefined ? '' : val[f.key])).join('') +
      '<div class="full small" data-err style="color:var(--risk)" role="alert"></div><button type="submit" hidden></button></form>';
    const m = modal({ title, body, size, footer: extraFooter + '<button class="btn" data-cancel>Annulla</button><button class="btn primary" data-submit>' + U.esc(submitLabel) + '</button>' });
    const fm = m.el.querySelector('form');
    const submit = async () => {
      const v = readForm(fm, allFields);
      const err = validate(allFields, v);
      const errBox = m.el.querySelector('[data-err]');
      if (err) { errBox.textContent = err; return; }
      const meta = { reason: v.__reason, origin: v.__origin };
      delete v.__reason; delete v.__origin;
      try {
        const r = await onSubmit(v, meta, m);
        if (r !== false) m.close();
      } catch (e) { errBox.textContent = e.message || String(e); }
    };
    m.el.querySelector('[data-submit]').onclick = submit;
    m.el.querySelector('[data-cancel]').onclick = () => m.close();
    fm.addEventListener('submit', e => { e.preventDefault(); submit(); });
    fm.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } });
    if (onMount) onMount(m);
    return m;
  }

  /* ---------- BADGE / CLASSI DI STATO ---------- */
  const STATUS_CLASS = {
    'NON INIZIATA': '', 'IN CORSO': 'info', 'DA VERIFICARE': 'warn', 'COMPLETATA': 'ok', 'APPROVATA': 'ok',
    'DA FARE': '', 'APERTA': 'info', 'ANNULLATA': '', 'PIANIFICATA': 'info', 'SVOLTA': 'ok', 'POSTA': 'warn', 'RISPOSTA': 'ok', 'ARCHIVIATA': '',
    'APERTO': 'risk', 'RIVEDI DOPO': 'warn', 'IN CORREZIONE': 'info', 'RISOLTO': 'ok', 'IGNORATO': '', 'NON È UN ERRORE': '',
    'BOZZA': '', 'VERIFICATO': 'ok', 'VUOTA': '', 'RIVISTA': 'info', 'FINALE': 'ok',
    'BASSA': '', 'MEDIA': 'info', 'ALTA': 'warn', 'CRITICA': 'risk',
    'INFO': 'info', 'ATTENZIONE': 'warn', 'PROBABILE ERRORE': 'risk', 'CRITICO': 'risk',
    'PROPOSTA': 'violet', 'ACCETTATA': 'ok', 'RIFIUTATA': '', 'NOTA': 'info'
  };
  function badge(text, cls) { return '<span class="badge ' + (cls !== undefined ? cls : (STATUS_CLASS[text] || '')) + '">' + U.esc(text) + '</span>'; }
  function progress(p, cls = '') {
    const c = cls || (p >= 100 ? 'ok' : '');
    return '<div class="progress ' + c + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '"><span style="width:' + U.clamp(p, 0, 100) + '%"></span></div>';
  }
  function daysBadge(date) {
    const d = U.daysUntil(date);
    if (d === null) return badge('senza data', '');
    const cls = d < 0 ? 'risk' : d <= 2 ? 'risk' : d <= 7 ? 'warn' : 'info';
    return badge(U.relDays(date), cls);
  }
  function empty(title, text, action = '') { return '<div class="empty"><b>' + U.esc(title) + '</b>' + U.esc(text) + (action ? '<div class="mt">' + action + '</div>' : '') + '</div>'; }
  function select(attrs, options, value) {
    return '<select ' + attrs + '>' + options.map(o => Array.isArray(o) ? o : [o, o]).map(([v, l]) => '<option value="' + U.attr(v) + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + U.esc(l) + '</option>').join('') + '</select>';
  }

  /* ---------- FILE ---------- */
  const urlCache = new Map();
  function pickFiles({ multiple = true, accept = '' } = {}) {
    return new Promise(res => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.multiple = multiple; if (accept) inp.accept = accept;
      inp.style.display = 'none';
      inp.onchange = () => { res([...inp.files]); inp.remove(); };
      document.body.appendChild(inp);
      inp.click();
    });
  }
  const Files = {
    async store(file, meta = {}) {
      const P = Store.P;
      if (file.size > 50 * 1024 * 1024 && !(await confirm('Il file "' + file.name + '" è molto grande (' + U.fileSize(file.size) + '). Salvarlo comunque nel browser?'))) return null;
      const id = U.uid('file');
      const rec = { id, name: file.name, type: file.type || 'application/octet-stream', size: file.size, category: meta.category || 'Altro', description: meta.description || '', ref: meta.ref || '', storedBlob: true, createdAt: U.nowISO() };
      try { await DB.put('files', { id, projectId: P.id, blob: file, name: file.name, type: rec.type, size: file.size }); }
      catch (e) { rec.storedBlob = false; toast('Impossibile salvare il contenuto del file: conservati solo nome e riferimento (' + e.message + ')', 'err'); }
      P.files.push(rec);
      History.log('File allegato: ' + file.name, 'files', { coll: 'files', id });
      Store.touch();
      return rec;
    },
    async storeMany(files, meta) { const out = []; for (const f of files) { const r = await this.store(f, meta); if (r) out.push(r); } return out; },
    async url(id) {
      if (urlCache.has(id)) return urlCache.get(id);
      const rec = await DB.get('files', id);
      if (!rec || !rec.blob) return null;
      const u = URL.createObjectURL(rec.blob);
      urlCache.set(id, u);
      return u;
    },
    async open(id) {
      const u = await this.url(id);
      if (!u) return toast('Contenuto del file non disponibile in questo browser', 'err');
      const w = window.open(u, '_blank');
      if (!w) { const meta = Model.get('files', id); U.download(meta ? meta.name : 'file', (await DB.get('files', id)).blob); }
    },
    async download(id) {
      const rec = await DB.get('files', id);
      const meta = Model.get('files', id);
      if (!rec || !rec.blob) return toast('Contenuto del file non disponibile', 'err');
      U.download(meta ? meta.name : rec.name, rec.blob);
    },
    async remove(id) {
      await DB.del('files', id);
      if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
    },
    chips(ids, removable = false, owner = '') {
      const list = U.arr(ids).map(id => Model.get('files', id)).filter(Boolean);
      if (!list.length) return '<span class="muted small">Nessun file</span>';
      return list.map(f => '<span class="ref-chip"><button class="linklike" style="color:var(--accent);font-size:11.5px;padding:0" data-action="file-open" data-id="' + f.id + '">📎 ' + U.esc(U.truncate(f.name, 40)) + '</button>' +
        (removable ? '<button data-action="file-detach" data-id="' + f.id + '" data-owner="' + U.attr(owner) + '" aria-label="Scollega file">×</button>' : '') + '</span>').join(' ');
    }
  };

  /* ---------- FORMULE E GRAFICI ---------- */
  function renderMath(root) {
    $$('.math[data-tex]', root || document).forEach(el => {
      const tex = el.getAttribute('data-tex');
      if (window.katex) {
        try { katex.render(tex, el, { throwOnError: false, displayMode: el.dataset.display === '1' }); return; } catch (e) { /* fallback */ }
      }
      el.classList.add('math-raw');
      el.textContent = (el.dataset.display === '1' ? '$$' : '$') + tex + (el.dataset.display === '1' ? '$$' : '$');
    });
  }
  const charts = new Map();
  function chartData(b) {
    const labels = U.str(b.labels).split(/;|\n/).map(s => s.trim()).filter(Boolean);
    const palette = ['#2b4c7e', '#d9822b', '#2f855a', '#b83280', '#6b46c1', '#319795', '#c53030', '#718096'];
    const datasets = U.arr(b.series).map((s, i) => {
      const data = U.str(s.data).split(/;|\n/).map(x => x.trim()).filter(x => x !== '').map(x => U.parseNum(x));
      const col = palette[i % palette.length];
      return { label: s.name || ('Serie ' + (i + 1)), data, backgroundColor: b.chartType === 'pie' ? labels.map((_, k) => palette[k % palette.length]) : col + (b.chartType === 'line' ? '' : 'cc'), borderColor: col, borderWidth: 2, tension: .2 };
    });
    return { labels, datasets };
  }
  function renderCharts(root) {
    $$('[data-chart]', root || document).forEach(box => {
      const id = box.dataset.chart;
      const f = Model.findBlock(id);
      if (!f) return;
      drawChart(box, f.block);
    });
  }
  function drawChart(box, b) {
    const id = b.id;
    if (charts.has(id)) { try { charts.get(id).destroy(); } catch (e) { /* */ } charts.delete(id); }
    const d = chartData(b);
    if (!d.labels.length || !d.datasets.some(s => s.data.length)) { box.innerHTML = '<div class="empty" style="height:100%;display:grid;place-items:center">Inserisci etichette e valori per vedere il grafico</div>'; return; }
    if (!window.Chart) {
      box.style.height = 'auto';
      box.innerHTML = '<p class="small muted mb">Libreria grafici non disponibile (offline): dati del grafico in tabella.</p><div class="table-wrap"><table class="tbl"><tr><th>' + U.esc(b.xLabel || 'Etichetta') + '</th>' + d.datasets.map(s => '<th>' + U.esc(s.label) + '</th>').join('') + '</tr>' +
        d.labels.map((l, i) => '<tr><td>' + U.esc(l) + '</td>' + d.datasets.map(s => '<td class="num">' + U.esc(U.fmtNum(s.data[i])) + '</td>').join('') + '</tr>').join('') + '</table></div>';
      return;
    }
    box.innerHTML = '<canvas aria-label="' + U.attr(b.title || 'Grafico') + '" role="img"></canvas>';
    const dark = document.documentElement.dataset.theme === 'dark';
    const tc = dark ? '#c3cad6' : '#3a4354', gc = dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.07)';
    const axis = (lab, unit) => ({ title: { display: !!(lab || unit), text: (lab || '') + (unit ? ' [' + unit + ']' : ''), color: tc }, ticks: { color: tc }, grid: { color: gc } });
    try {
      const ch = new Chart(box.querySelector('canvas'), {
        type: b.chartType === 'scatter' ? 'line' : b.chartType,
        data: d,
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { labels: { color: tc } }, title: { display: !!b.title, text: b.title, color: tc } },
          scales: b.chartType === 'pie' ? {} : { x: axis(b.xLabel, b.xUnit), y: axis(b.yLabel, b.yUnit) },
          showLine: b.chartType !== 'scatter'
        }
      });
      charts.set(id, ch);
    } catch (e) { box.innerHTML = '<div class="empty">Impossibile disegnare il grafico: ' + U.esc(e.message) + '</div>'; }
  }
  function destroyCharts() { charts.forEach(c => { try { c.destroy(); } catch (e) { /* */ } }); charts.clear(); }
  async function renderImages(root) {
    for (const img of $$('img[data-file]', root || document)) {
      const u = await Files.url(img.dataset.file);
      if (u) img.src = u; else img.replaceWith(Object.assign(document.createElement('div'), { className: 'empty', textContent: 'Immagine non disponibile in questo browser' }));
    }
  }
  function afterRender(root) { renderMath(root); renderCharts(root); renderImages(root); }

  /* ---------- TEMA E SALVATAGGIO ---------- */
  function applyTheme() {
    const t = Store.settings.theme;
    const dark = t === 'dark' || (t === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }
  function setSaveIndicator(s) {
    const el = $('#save-status');
    if (!el) return;
    el.className = 'save-status ' + (s === 'saving' ? 'saving' : s === 'error' ? 'error' : '');
    el.textContent = s === 'saving' ? 'SALVATAGGIO…' : s === 'error' ? 'ERRORE SALVATAGGIO' : s === 'saved' ? 'SALVATO ' + U.fmtTime(new Date().toISOString()) : '';
  }

  return { chartDataPublic: chartData, $, $$, toast, modal, closeTop, confirm, form, fieldHTML, readForm, badge, progress, daysBadge, empty, select, STATUS_CLASS,
    pickFiles, Files, renderMath, renderCharts, drawChart, destroyCharts, renderImages, afterRender, applyTheme, setSaveIndicator };
})();
