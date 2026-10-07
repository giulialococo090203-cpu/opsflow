/* =====================================================================
   TRANSLATE — scrivete in italiano, nella relazione (in inglese) appare
   la traduzione automatica.
   - Si traducono: testo delle sezioni, testi/osservazioni dei contenuti
     delle fasi, titoli dei contenuti, didascalie di figure e tabelle.
     I dati (celle delle tabelle, numeri, formule) restano come sono.
   - La traduzione è salvata nel progetto (condivisa con il team) e rifatta
     solo quando il testo italiano cambia.
   - Motori, in ordine: traduttore del browser (Chrome recente, sul
     computer, nessun invio di dati); servizio gratuito MyMemory (il testo
     viene inviato a translated.net; limite giornaliero gratuito).
   - Il testo italiano originale non viene mai modificato.
   ===================================================================== */
'use strict';

const Translate = (() => {
  const IT = new Set('il lo la i gli le di da del della dello dei degli delle che e è ed per con su nel nella nei nelle al alla ai alle un una uno non sono sia come anche più questo questa questi queste quello quella perché quindi ogni tra fra dove quando viene vengono essere stato stata sul sulla dal dalla abbiamo è hanno ha fatto attività azienda processo'.split(' '));
  const EN = new Set('the and of to in is are for with that this these those on as by be was were from at an it its which have has not or can will process company'.split(' '));
  const st = { busy: false, timer: null, engine: null, chrome: null, failed: 0, quotaUntil: 0, last: '' };

  function hash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + s.length; }
  function isItalian(text) {
    const w = U.str(text).toLowerCase().replace(/\[\[[^\]]*\]\]|\$[^$]*\$|[^a-zàèéìòù\s]/g, ' ').split(/\s+/).filter(Boolean);
    if (!w.length) return false;
    let it = 0, en = 0;
    w.forEach(x => { if (IT.has(x)) it++; if (EN.has(x)) en++; });
    if (/[àèìòù]/.test(text) && it >= 1 && en === 0) return true;
    return it >= 2 ? it > en * 1.2 : (w.length <= 6 && it >= 1 && en === 0);
  }
  const enabled = () => Store.P && LiveReport.lang() === 'en' && (Store.P.settings || {}).autoTranslate !== false;

  /* ---------- motori ---------- */
  async function chromeEngine() {
    if (st.chrome !== null) return st.chrome;
    st.chrome = false;
    try {
      if ('Translator' in self) {
        const within = (pr, ms) => Promise.race([pr, new Promise(r => setTimeout(() => r(null), ms))]);
        const av = await within(self.Translator.availability({ sourceLanguage: 'it', targetLanguage: 'en' }), 2000);
        if (av === 'available') st.chrome = (await within(self.Translator.create({ sourceLanguage: 'it', targetLanguage: 'en' }), 4000)) || false;
      }
    } catch (e) { st.chrome = false; }
    return st.chrome;
  }
  async function myMemory(text) {
    if (Date.now() < st.quotaUntil) throw new Error('quota');
    const url = 'https://api.mymemory.translated.net/get?langpair=it%7Cen&q=' + encodeURIComponent(text);
    const r = await fetch(url);
    const j = await r.json();
    if (j.quotaFinished || /MYMEMORY WARNING|QUOTA/i.test(j.responseDetails || '') || j.responseStatus === 429) { st.quotaUntil = Date.now() + 3600e3; throw new Error('quota'); }
    if (+j.responseStatus !== 200) throw new Error(j.responseDetails || 'errore traduzione');
    return String(j.responseData.translatedText || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  }
  /** spezza in frasi da massimo ~450 caratteri (limite del servizio gratuito) */
  function pieces(text) {
    const out = []; let cur = '';
    text.replace(/([.!?;:])\s+/g, '$1\u0001').split('\u0001').forEach(s => {
      while (s.length > 450) { out.push(s.slice(0, 450)); s = s.slice(450); }
      if ((cur + ' ' + s).length > 450) { if (cur) out.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s;
    });
    if (cur) out.push(cur);
    return out;
  }
  async function plain(text) {
    if (!text.trim()) return text;
    const ch = await chromeEngine();
    if (ch) { try { const r = await Promise.race([ch.translate(text), new Promise((_, j) => setTimeout(() => j(new Error('lento')), 15000))]); st.engine = 'browser'; return r; } catch (e) { st.chrome = false; } }
    st.engine = 'mymemory';
    const parts = [];
    for (const p of pieces(text)) parts.push(await myMemory(p));
    return parts.join(' ');
  }
  /** traduce markdown riga per riga lasciando intatti elenchi, titoli, tabelle, formule e figure */
  async function markdown(md) {
    const lines = U.str(md).split('\n');
    const out = [];
    for (const l of lines) {
      const t = l.trim();
      if (!t || /^\|.*\|$/.test(t) || /^\[\[(FIG|CHART):/.test(t) || /^\$\$/.test(t) || /^[-=*_]{3,}$/.test(t)) { out.push(l); continue; }
      const m = l.match(/^(\s*(?:#{1,4}\s+|[-*•]\s+|\d+[.)]\s+|>\s*)?)(.*)$/);
      const body = m[2];
      // formule inline $…$ protette
      const keep = []; const masked = body.replace(/\$[^$]+\$/g, x => { keep.push(x); return '⟦' + (keep.length - 1) + '⟧'; });
      let tr = await plain(masked);
      tr = tr.replace(/⟦\s*(\d+)\s*⟧/g, (x, i) => keep[+i] || x);
      out.push(m[1] + tr);
    }
    return out.join('\n');
  }

  /* ---------- cosa tradurre ---------- */
  function jobs() {
    const P = Store.P, list = [];
    P.report.sections.forEach(s => { const t = U.str(s.content); if (t.trim() && isItalian(t)) list.push({ obj: s, field: 'content', text: t, md: true }); });
    Model.allBlocks().forEach(({ block: b }) => {
      if (['note', 'attachment'].includes(b.type)) return;
      if (['text', 'observation', 'interpretation'].includes(b.type) || b.content) { const t = U.str(b.content); if (t.trim() && isItalian(t)) list.push({ obj: b, field: 'content', text: t, md: true }); }
      ['title', 'caption'].forEach(f => { const t = U.str(b[f]); if (t.trim() && isItalian(t)) list.push({ obj: b, field: f, text: t, md: false }); });
    });
    return list.filter(j => { const e = (j.obj.en || {})[j.field]; return !e || e.src !== hash(j.text); });
  }
  async function sweep() {
    if (st.busy || !enabled()) return;
    const todo = jobs();
    if (!todo.length) { indicator(''); return; }
    st.busy = true;
    let done = 0;
    try {
      for (const j of todo) {
        if (U.str(j.obj[j.field]) !== j.text) continue;   // cambiato nel frattempo
        indicator('Traduco in inglese… ' + (done + 1) + '/' + todo.length);
        const en = j.md ? await markdown(j.text) : await plain(j.text);
        if (U.str(j.obj[j.field]) !== j.text) continue;
        j.obj.en = Object.assign({}, j.obj.en || {}, { [j.field]: { src: hash(j.text), text: en } });
        done++;
      }
      st.failed = 0;
      indicator('');
    } catch (e) {
      st.failed++;
      indicator(e.message === 'quota' ? 'Traduzione automatica: limite giornaliero raggiunto, riprova più tardi' : 'Traduzione automatica non riuscita: riprovo tra poco');
    } finally {
      st.busy = false;
      if (done) { Store.touch(); if (!document.activeElement || !/^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName)) App.refresh(); }
    }
  }
  function schedule(ms = 2500) { clearTimeout(st.timer); st.timer = setTimeout(sweep, st.failed ? Math.min(60000, ms * (st.failed + 1) * 4) : ms); }
  function indicator(msg) { st.last = msg; const el = document.getElementById('tr-status'); if (el) { el.textContent = msg; el.hidden = !msg; } }

  /** testo da usare nella relazione inglese (traduzione aggiornata, altrimenti l'originale) */
  function en(obj, field) {
    const t = U.str(obj && obj[field]);
    if (!t || !enabled()) return t;
    const e = (obj.en || {})[field];
    if (e && e.src === hash(t)) return e.text;
    return t;
  }
  function state(obj, field) {
    const t = U.str(obj && obj[field]);
    if (!t.trim() || !isItalian(t)) return 'none';
    const e = (obj.en || {})[field];
    return e && e.src === hash(t) ? 'done' : 'pending';
  }

  // ogni salvataggio fa ripartire la traduzione dopo una pausa
  const origTouch = Store.touch.bind(Store);
  Store.touch = function () { origTouch(); if (enabled()) schedule(); };

  return { isItalian, en, state, sweep, schedule, enabled, get engine() { return st.engine; }, get last() { return st.last; } };
})();

Actions['set-autotranslate'] = (d, el) => { Store.P.settings.autoTranslate = !!el.checked; Store.touch(); if (el.checked) Translate.sweep(); App.refresh(); };
