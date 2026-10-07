/* =====================================================================
   UTILITIES
   Funzioni pure senza dipendenze: id, date, testo, numeri, calcolatrice
   sicura, markdown-lite, diff, download/copia.
   Espone l'oggetto globale U.
   ===================================================================== */
'use strict';

const U = (() => {

  /* ---------- ID e varie ---------- */
  let counter = 0;
  function uid(prefix = 'id') {
    counter = (counter + 1) % 1296;
    return prefix + '_' + Date.now().toString(36) + counter.toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 6);
  }
  function clone(o) {
    if (o === undefined) return undefined;
    try { return structuredClone(o); } catch (e) { return JSON.parse(JSON.stringify(o)); }
  }
  function debounce(fn, ms) {
    let t = null;
    const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    d.flush = (...a) => { clearTimeout(t); fn(...a); };
    d.cancel = () => clearTimeout(t);
    return d;
  }
  function hash(str) {
    let h = 5381;
    str = String(str);
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function str(x) { return x === null || x === undefined ? '' : String(x); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function pct(a, b) { return b > 0 ? Math.round(a / b * 100) : 0; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* ---------- HTML ---------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return str(s).replace(/[&<>"']/g, c => ESC[c]); }
  function attr(s) { return esc(s); }

  /* ---------- Testo ---------- */
  function norm(s) {
    return str(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }
  function words(s) { const m = str(s).trim().match(/\S+/g); return m ? m.length : 0; }
  function truncate(s, n) { s = str(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function sentences(text) {
    return str(text).replace(/\r/g, '').replace(/([.!?;])\s+/g, '$1\n').split(/\n+/).map(s => s.trim()).filter(s => s.length > 2);
  }
  function highlight(text, q) {
    const t = esc(text);
    if (!q) return t;
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    return t.replace(re, '<mark>$1</mark>');
  }

  /* ---------- Date ----------
     Le date sono salvate come stringhe 'YYYY-MM-DD' (locali) e orari 'HH:MM'.
     I timestamp di sistema sono ISO completi. */
  function pad(n) { return String(n).padStart(2, '0'); }
  function todayISO() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function nowISO() { return new Date().toISOString(); }
  function isValidDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str(s))) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }
  function toDate(s, time) {
    if (!isValidDate(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    let hh = 0, mm = 0;
    if (time && /^\d{1,2}:\d{2}$/.test(time)) [hh, mm] = time.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm);
  }
  function addDays(s, n) {
    const d = toDate(s) || new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  /** giorni di calendario da oggi alla data (negativo = passata), null se data non valida */
  function daysUntil(s) {
    const d = toDate(s);
    if (!d) return null;
    const t = toDate(todayISO());
    return Math.round((d - t) / 86400000);
  }
  function relDays(s) {
    const n = daysUntil(s);
    if (n === null) return 'data non valida';
    if (n === 0) return 'oggi';
    if (n === 1) return 'domani';
    if (n === -1) return 'ieri';
    if (n > 1) return 'tra ' + n + ' giorni';
    return 'superata di ' + (-n) + ' giorni';
  }
  function fmtDate(s) {
    if (!s) return '—';
    if (isValidDate(s)) { const [y, m, d] = s.split('-'); return d + '/' + m + '/' + y; }
    const d = new Date(s);
    if (isNaN(d)) return '—';
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  function fmtTime(iso) { const d = new Date(iso); return isNaN(d) ? '' : pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmtDateTime(iso) { const d = new Date(iso); return isNaN(d) ? '—' : fmtDate(iso) + ' ' + fmtTime(iso); }
  function isoToLocalDate(iso) { const d = new Date(iso); return isNaN(d) ? '' : d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  const MONTHS = { gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  /** trova date in un testo libero → [{text, date:'YYYY-MM-DD'}] */
  function findDates(text) {
    const out = [];
    const t = str(text);
    let m;
    const re1 = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/g;
    while ((m = re1.exec(t))) {
      let y = +m[3]; if (y < 100) y += 2000;
      const s = y + '-' + pad(+m[2]) + '-' + pad(+m[1]);
      if (isValidDate(s)) out.push({ text: m[0], date: s, index: m.index });
    }
    const re2 = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    while ((m = re2.exec(t))) { const s = m[0]; if (isValidDate(s)) out.push({ text: s, date: s, index: m.index }); }
    const re3 = new RegExp('\\b(\\d{1,2})\\s+(' + Object.keys(MONTHS).join('|') + ')\\s+(\\d{4})\\b', 'gi');
    while ((m = re3.exec(t))) {
      const s = m[3] + '-' + pad(MONTHS[m[2].toLowerCase()]) + '-' + pad(+m[1]);
      if (isValidDate(s)) out.push({ text: m[0], date: s, index: m.index });
    }
    return out;
  }

  /* ---------- Numeri ----------
     Estrae numeri da testo interpretando sia formato italiano (1.234,5)
     sia inglese (1,234.5). Ogni occorrenza ha più valori candidati. */
  function candidates(raw) {
    let s = raw.replace(/\s/g, '');
    const neg = s.startsWith('-') || s.startsWith('−');
    s = s.replace(/^[-−+]/, '');
    const out = new Set();
    const push = v => { if (isFinite(v)) out.add(neg ? -v : v); };
    const hasDot = s.includes('.'), hasComma = s.includes(',');
    if (!hasDot && !hasComma) push(parseFloat(s));
    else if (hasDot && hasComma) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) push(parseFloat(s.replace(/\./g, '').replace(',', '.')));
      else push(parseFloat(s.replace(/,/g, '')));
    } else if (hasComma) {
      const parts = s.split(',');
      if (parts.length === 2) push(parseFloat(parts[0] + '.' + parts[1]));
      if (parts.slice(1).every(p => p.length === 3)) push(parseFloat(parts.join('')));
    } else {
      const parts = s.split('.');
      if (parts.length === 2) push(parseFloat(s));
      if (parts.slice(1).every(p => p.length === 3)) push(parseFloat(parts.join('')));
    }
    return [...out];
  }
  function extractNumbers(text) {
    const t = str(text);
    const out = [];
    const re = /(^|[^\w.,])([-−]?(?:\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)%?)/g;
    let m;
    while ((m = re.exec(t))) {
      let raw = m[2];
      const index = m.index + m[1].length;
      if (!raw) continue;
      const percent = raw.endsWith('%');
      const core = raw.replace('%', '').trim();
      const vals = candidates(core);
      if (!vals.length) continue;
      const decimals = (core.split(/[.,]/).pop() || '').length;
      const ctxStart = Math.max(0, index - 40), ctxEnd = Math.min(t.length, index + raw.length + 40);
      out.push({ raw, values: vals, percent, index, decimals: /[.,]/.test(core) ? decimals : 0,
        before: t.slice(ctxStart, index), after: t.slice(index + raw.length, ctxEnd) });
    }
    return out;
  }
  /** true se due valori coincidono, anche considerando arrotondamenti (es. 68.27 ≈ 68.3) */
  function numClose(a, b) {
    if (a === b) return true;
    const diff = Math.abs(a - b);
    const scale = Math.max(Math.abs(a), Math.abs(b), 1e-12);
    if (diff / scale < 1e-9) return true;
    for (let d = 0; d <= 4; d++) {
      const f = Math.pow(10, d);
      if (Math.round(a * f) / f === b || Math.round(b * f) / f === a) return true;
    }
    return false;
  }
  /** il valore riportato (con `decimals` cifre decimali) coincide con il valore del progetto arrotondato? */
  function numReported(projVal, reported, decimals) {
    if (!isFinite(projVal) || !isFinite(reported)) return false;
    if (Math.abs(projVal - reported) <= 1e-9 * Math.max(1, Math.abs(reported))) return true;
    const f = Math.pow(10, Math.min(decimals || 0, 8));
    return Math.round(projVal * f) / f === reported;
  }
  function fmtNum(n, maxDec = 6) {
    if (n === null || n === undefined || n === '' || !isFinite(n)) return '';
    const r = Math.round(n * Math.pow(10, maxDec)) / Math.pow(10, maxDec);
    return String(r);
  }
  function parseNum(s) {
    if (typeof s === 'number') return s;
    const c = candidates(str(s).replace('%', '').trim());
    return c.length ? c[0] : NaN;
  }

  /* ---------- Calcolatrice sicura (niente eval) ----------
     Grammatica: expr := term (('+'|'-') term)* ; term := power (('*'|'/') power)* ;
     power := unary ('^' power)? ; unary := ('-'|'+') unary | call ; call := name '(' args ')' | primary */
  const FUNCS = {
    sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    round: (x, d = 0) => { const f = Math.pow(10, d); return Math.round(x * f) / f; }, floor: Math.floor, ceil: Math.ceil,
    min: Math.min, max: Math.max, pow: Math.pow,
    sum: (...a) => a.reduce((s, x) => s + x, 0), avg: (...a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN
  };
  const CONSTS = { pi: Math.PI, e: Math.E };
  function tokenize(src) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++;
        if (src[j] === 'e' || src[j] === 'E') { let k = j + 1; if (src[k] === '+' || src[k] === '-') k++; if (/[0-9]/.test(src[k])) { j = k; while (j < src.length && /[0-9]/.test(src[j])) j++; } }
        const n = Number(src.slice(i, j));
        if (isNaN(n)) throw new Error('Numero non valido: ' + src.slice(i, j));
        toks.push({ t: 'n', v: n }); i = j; continue;
      }
      if (/[A-Za-z_À-ɏ]/.test(c)) {
        let j = i; while (j < src.length && /[A-Za-z0-9_À-ɏ]/.test(src[j])) j++;
        toks.push({ t: 'id', v: src.slice(i, j) }); i = j; continue;
      }
      if ('+-*/^(),'.includes(c)) { toks.push({ t: c }); i++; continue; }
      if (c === '×' || c === '·') { toks.push({ t: '*' }); i++; continue; }
      if (c === '÷') { toks.push({ t: '/' }); i++; continue; }
      if (c === '−') { toks.push({ t: '-' }); i++; continue; }
      throw new Error('Carattere non riconosciuto: "' + c + '"');
    }
    return toks;
  }
  function evaluate(src, vars = {}) {
    const toks = tokenize(str(src).replace(/(\d),(\d)/g, (m, a, b) => a + '.' + b));
    if (!toks.length) throw new Error('Espressione vuota');
    let p = 0;
    const used = new Set();
    const peek = () => toks[p];
    const eat = t => { const k = toks[p]; if (!k || k.t !== t) throw new Error('Atteso "' + t + '"'); p++; return k; };
    function expr() { let v = term(); while (peek() && (peek().t === '+' || peek().t === '-')) { const o = toks[p++].t; const r = term(); v = o === '+' ? v + r : v - r; } return v; }
    function term() { let v = power(); while (peek() && (peek().t === '*' || peek().t === '/')) { const o = toks[p++].t; const r = power(); v = o === '*' ? v * r : v / r; } return v; }
    function power() { const b = unary(); if (peek() && peek().t === '^') { p++; return Math.pow(b, power()); } return b; }
    function unary() { if (peek() && peek().t === '-') { p++; return -unary(); } if (peek() && peek().t === '+') { p++; return unary(); } return primary(); }
    function primary() {
      const k = peek();
      if (!k) throw new Error('Espressione incompleta');
      if (k.t === 'n') { p++; return k.v; }
      if (k.t === '(') { p++; const v = expr(); eat(')'); return v; }
      if (k.t === 'id') {
        p++;
        if (peek() && peek().t === '(') {
          const f = FUNCS[k.v.toLowerCase()];
          if (!f) throw new Error('Funzione sconosciuta: ' + k.v);
          p++; const args = [];
          if (peek() && peek().t !== ')') { args.push(expr()); while (peek() && peek().t === ',') { p++; args.push(expr()); } }
          eat(')');
          return f(...args);
        }
        if (Object.prototype.hasOwnProperty.call(vars, k.v)) {
          used.add(k.v);
          const v = vars[k.v];
          if (v === '' || v === null || v === undefined || !isFinite(v)) throw new Error('La variabile "' + k.v + '" non ha un valore numerico');
          return Number(v);
        }
        const c = CONSTS[k.v.toLowerCase()];
        if (c !== undefined) return c;
        throw new Error('Variabile non definita: ' + k.v);
      }
      throw new Error('Simbolo inatteso: ' + k.t);
    }
    const v = expr();
    if (p < toks.length) throw new Error('Simbolo inatteso: ' + (toks[p].v || toks[p].t));
    return { value: v, used: [...used] };
  }
  function exprIdentifiers(src) {
    try { return tokenize(str(src)).filter(t => t.t === 'id').map(t => t.v).filter(v => !FUNCS[v.toLowerCase()] && CONSTS[v.toLowerCase()] === undefined); }
    catch (e) { return []; }
  }

  /* ---------- Markdown-lite ----------
     Supporta: # titoli, **grassetto**, *corsivo*, `codice`, elenchi -/1.,
     > citazioni, tabelle con |, $formula$ e $$formula$$ (rese da KaTeX se disponibile). */
  function inline(s) {
    let t = esc(s);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/\$([^$\n]+)\$/g, (m, tex) => '<span class="math" data-tex="' + tex + '">' + tex + '</span>');
    return t;
  }
  function md(src) {
    const text = str(src).replace(/\r/g, '');
    if (!text.trim()) return '';
    const blocks = [];
    const mathBlocks = [];
    const prepared = text.replace(/\$\$([\s\S]+?)\$\$/g, (m, tex) => { mathBlocks.push(tex.trim()); return '\n@@MATH' + (mathBlocks.length - 1) + '@@\n'; });
    const lines = prepared.split('\n');
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) { i++; continue; }
      const mm = l.trim().match(/^@@MATH(\d+)@@$/);
      if (mm) { const tex = mathBlocks[+mm[1]]; blocks.push('<div class="math math-block" data-tex="' + esc(tex) + '" data-display="1">' + esc(tex) + '</div>'); i++; continue; }
      const h = l.match(/^(#{1,4})\s+(.*)$/);
      if (h) { const lv = Math.min(4, h[1].length + 1); blocks.push('<h' + lv + '>' + inline(h[2]) + '</h' + lv + '>'); i++; continue; }
      if (/^\s*[-*•]\s+/.test(l)) {
        const items = [];
        while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) { items.push('<li>' + inline(lines[i].replace(/^\s*[-*•]\s+/, '')) + '</li>'); i++; }
        blocks.push('<ul>' + items.join('') + '</ul>'); continue;
      }
      if (/^\s*\d+[.)]\s+/.test(l)) {
        const items = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push('<li>' + inline(lines[i].replace(/^\s*\d+[.)]\s+/, '')) + '</li>'); i++; }
        blocks.push('<ol>' + items.join('') + '</ol>'); continue;
      }
      if (/^\s*>/.test(l)) {
        const q = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) { q.push(inline(lines[i].replace(/^\s*>\s?/, ''))); i++; }
        blocks.push('<blockquote>' + q.join('<br>') + '</blockquote>'); continue;
      }
      if (/^\s*\|.*\|\s*$/.test(l)) {
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i++; }
        const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const body = rows.filter(r => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
        const html = body.map((r, ri) => '<tr>' + cells(r).map(c => ri === 0 ? '<th>' + inline(c) + '</th>' : '<td>' + inline(c) + '</td>').join('') + '</tr>').join('');
        blocks.push('<table>' + html + '</table>'); continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s|^\s*[-*•]\s+|^\s*\d+[.)]\s+|^\s*>|^\s*\|.*\|\s*$|^@@MATH/.test(lines[i])) { para.push(inline(lines[i])); i++; }
      if (para.length) blocks.push('<p>' + para.join('<br>') + '</p>');
      else i++;
    }
    return blocks.join('\n');
  }
  function stripMd(src) {
    return str(src).replace(/\$\$[\s\S]+?\$\$/g, ' ').replace(/[#*`>|]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* ---------- Diff per parole (LCS) ---------- */
  function wordDiff(a, b) {
    const A = str(a).split(/(\s+)/), B = str(b).split(/(\s+)/);
    if (A.length * B.length > 4e6) return '<del>' + esc(a) + '</del>\n<ins>' + esc(b) + '</ins>';
    const n = A.length, m = B.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0; const out = [];
    while (i < n && j < m) {
      if (A[i] === B[j]) { out.push(esc(A[i])); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push('<del>' + esc(A[i]) + '</del>'); i++; }
      else { out.push('<ins>' + esc(B[j]) + '</ins>'); j++; }
    }
    while (i < n) out.push('<del>' + esc(A[i++]) + '</del>');
    while (j < m) out.push('<ins>' + esc(B[j++]) + '</ins>');
    return out.join('');
  }

  /* ---------- File, download, appunti ---------- */
  function download(filename, content, mime = 'text/plain;charset=utf-8') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  async function copy(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* fallback sotto */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  function blobToDataURL(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  }
  function dataURLtoBlob(d) {
    const [head, b64] = String(d).split(',');
    const mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    const bin = atob(b64 || '');
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }
  function fileSize(n) { if (!n) return '0 B'; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (n >= 1024 && i < 3) { n /= 1024; i++; } return (i ? n.toFixed(1) : n) + ' ' + u[i]; }
  function slug(s) { return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'progetto'; }

  return { uid, clone, debounce, hash, arr, str, clamp, pct, plural, esc, attr, norm, words, truncate, sentences, highlight,
    todayISO, nowISO, isValidDate, toDate, addDays, daysUntil, relDays, fmtDate, fmtTime, fmtDateTime, isoToLocalDate, findDates,
    extractNumbers, numClose, numReported, fmtNum, parseNum, candidates, evaluate, exprIdentifiers, md, stripMd, wordDiff,
    download, copy, blobToDataURL, dataURLtoBlob, fileSize, slug };
})();
