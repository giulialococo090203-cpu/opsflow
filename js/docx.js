/* =====================================================================
   DOCX — esportazione della relazione in Word nel formato dei D4
   Senza librerie: XML OOXML + archivio zip (metodo "store").
   - Copertina: loghi, corso, A.Y., materia, titolo, team, membri, referente
   - Index e Index of Figures come campi di Word (numeri di pagina
     calcolati da Word all'apertura: "Aggiorna campi")
   - Intestazione "Business Process Management" con icona, numero di
     pagina in basso al centro
   - Titoli numerati (Titolo 1/2/3 → compaiono nell'indice), testo
     giustificato Arial 11, figure e tabelle con didascalie numerate
   ===================================================================== */
'use strict';

const Docx = (() => {
  /* ---------- zip (store) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let off = 0;
    files.forEach(({ name, data }) => {
      const nameB = enc.encode(name), d = typeof data === 'string' ? enc.encode(data) : data, crc = crc32(d);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, d.length, true); lh.setUint32(22, d.length, true); lh.setUint16(26, nameB.length, true);
      parts.push(new Uint8Array(lh.buffer), nameB, d);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, d.length, true); ch.setUint32(24, d.length, true); ch.setUint16(28, nameB.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nameB);
      off += 30 + nameB.length + d.length;
    });
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  /* ---------- XML helpers ---------- */
  const x = s => U.str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const run = (t, o = {}) => '<w:r>' + (o.b || o.i || o.color || o.sz || o.font || o.hl ? '<w:rPr>' + (o.font ? '<w:rFonts w:ascii="' + o.font + '" w:hAnsi="' + o.font + '"/>' : '') + (o.b ? '<w:b/>' : '') + (o.i ? '<w:i/>' : '') + (o.color ? '<w:color w:val="' + o.color + '"/>' : '') + (o.sz ? '<w:sz w:val="' + o.sz + '"/>' : '') + (o.hl ? '<w:highlight w:val="yellow"/>' : '') + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + x(t) + '</w:t></w:r>';
  const para = (runs, o = {}) => '<w:p><w:pPr>' + (o.style ? '<w:pStyle w:val="' + o.style + '"/>' : '') + (o.keepNext ? '<w:keepNext/>' : '') + (o.pageBreak ? '<w:pageBreakBefore/>' : '') + (o.numId ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="' + o.numId + '"/></w:numPr>' : '') + (o.spacing ? '<w:spacing ' + o.spacing + '/>' : '') + (o.ind ? '<w:ind ' + o.ind + '/>' : '') + (o.jc ? '<w:jc w:val="' + o.jc + '"/>' : '') + '</w:pPr>' + runs + '</w:p>';
  const fld = (instr, cached) => '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ' + x(instr) + ' </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' + cached + '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
  const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  /** testo con **grassetto**, *corsivo*, `codice`, $formula$ → run */
  function inline(text, base = {}) {
    const out = [];
    U.str(text).split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\$[^$\n]+\$)/).forEach(tok => {
      if (!tok) return;
      if (/^\*\*[^*]+\*\*$/.test(tok)) out.push(run(tok.slice(2, -2), Object.assign({}, base, { b: true })));
      else if (/^\*[^*]+\*$/.test(tok)) out.push(run(tok.slice(1, -1), Object.assign({}, base, { i: true })));
      else if (/^`[^`]+`$/.test(tok)) out.push(run(tok.slice(1, -1), Object.assign({}, base, { font: 'Consolas' })));
      else if (/^\$[^$]+\$$/.test(tok)) out.push(run(tok.slice(1, -1), Object.assign({}, base, { i: true, font: 'Cambria Math' })));
      else out.push(run(tok, base));
    });
    return out.join('');
  }

  /* ---------- immagini ---------- */
  async function imgInfo(blob) {
    let w = 0, h = 0;
    try { const bm = await createImageBitmap(blob); w = bm.width; h = bm.height; if (bm.close) bm.close(); }
    catch (e) { await new Promise(res => { const im = new Image(); im.onload = () => { w = im.naturalWidth; h = im.naturalHeight; res(); }; im.onerror = res; im.src = URL.createObjectURL(blob); }); }
    let data = blob, ext = /png/.test(blob.type) ? 'png' : /jpe?g/.test(blob.type) ? 'jpeg' : '';
    if (!ext && w && h) {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const im = await createImageBitmap(blob).catch(() => null);
      if (im) { cv.getContext('2d').drawImage(im, 0, 0); data = await new Promise(r => cv.toBlob(r, 'image/png')); ext = 'png'; }
    }
    return { data: new Uint8Array(await data.arrayBuffer()), ext: ext || 'png', w: w || 600, h: h || 400 };
  }
  function drawing(rid, id, wpx, hpx, maxW = 5580000, maxH = 6800000) {
    let cx = wpx * 9525, cy = hpx * 9525;
    const k = Math.min(1, maxW / cx, maxH / cy); cx = Math.round(cx * k); cy = Math.round(cy * k);
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + id + '" name="Picture ' + id + '"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + id + '" name="img' + id + '"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  }
  async function iconPNG() {
    const cv = document.createElement('canvas'); cv.width = 96; cv.height = 84;
    const g = cv.getContext('2d');
    g.fillStyle = '#9b9b9b'; g.strokeStyle = '#6d6d6d'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(14, 4); g.lineTo(68, 4); g.lineTo(60, 24); g.lineTo(6, 24); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#444'; g.beginPath(); g.moveTo(64, 24); g.lineTo(64, 32); g.stroke();
    g.fillStyle = '#8db33a'; g.strokeStyle = '#5f7f20'; g.fillRect(30, 32, 60, 20); g.strokeRect(30, 32, 60, 20);
    g.strokeStyle = '#444'; g.beginPath(); g.moveTo(60, 52); g.lineTo(60, 58); g.stroke();
    g.fillStyle = '#c0504d'; g.strokeStyle = '#8c2d2a'; g.beginPath(); g.moveTo(60, 58); g.lineTo(78, 70); g.lineTo(60, 82); g.lineTo(42, 70); g.closePath(); g.fill(); g.stroke();
    const b = await new Promise(r => cv.toBlob(r, 'image/png'));
    return new Uint8Array(await b.arrayBuffer());
  }
  async function chartPNG(b) {
    if (!window.Chart) return null;
    const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 680;
    cv.style.cssText = 'position:fixed;left:-9999px;top:0;width:1200px;height:680px';
    document.body.appendChild(cv);
    try {
      const d = UI.chartDataPublic ? UI.chartDataPublic(b) : null;
      if (!d) return null;
      const ch = new Chart(cv, { type: b.chartType === 'scatter' ? 'line' : b.chartType, data: d, options: { responsive: false, animation: false, devicePixelRatio: 1, plugins: { legend: { labels: { font: { size: 22 } } } },
        scales: b.chartType === 'pie' ? {} : { x: { title: { display: !!(b.xLabel || b.xUnit), text: (b.xLabel || '') + (b.xUnit ? ' [' + b.xUnit + ']' : ''), font: { size: 22 } }, ticks: { font: { size: 20 } } }, y: { title: { display: !!(b.yLabel || b.yUnit), text: (b.yLabel || '') + (b.yUnit ? ' [' + b.yUnit + ']' : ''), font: { size: 22 } }, ticks: { font: { size: 20 } } } } } });
      const ctx = cv.getContext('2d'); ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      ch.destroy();
      return { data: new Uint8Array(await blob.arrayBuffer()), ext: 'png', w: 1200, h: 680 };
    } catch (e) { return null; } finally { cv.remove(); }
  }

  /* ---------- costruzione ---------- */
  async function build() {
    const P = Store.P;
    const en = LiveReport.lang() === 'en';
    const L = en ? { fig: 'Fig.', tab: 'Table', index: 'Index', figIndex: 'Index of Figures', todo: '[To be completed]', team: 'Team’s name:', members: 'Members’ names:', referent: 'Name and contacts of the business referent:' }
      : { fig: 'Fig.', tab: 'Tabella', index: 'Indice', figIndex: 'Indice delle figure', todo: '[Da completare]', team: 'Nome del team:', members: 'Componenti:', referent: 'Referente aziendale e contatti:' };
    const media = [], rels = [];
    let imgId = 1, figN = 0, tabN = 0;
    const addImage = (img) => { const rid = 'rIdImg' + imgId; const name = 'image' + imgId + '.' + img.ext; media.push({ name: 'word/media/' + name, data: img.data }); rels.push('<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + name + '"/>'); return { rid, id: imgId++ }; };
    const fileImage = async (fileId) => { const rec = await DB.get('files', fileId); if (!rec || !rec.blob) return null; return imgInfo(rec.blob); };
    const figCaption = text => { figN++; return para(run(L.fig + ' ') + fld('SEQ Figure \\* ARABIC', run(String(figN))) + inline(': ' + text), { style: 'Caption', jc: 'center' }); };
    const tabCaption = text => { tabN++; return para(run(L.tab + ' ') + fld('SEQ Table \\* ARABIC', run(String(tabN))) + inline(': ' + text), { style: 'Caption', jc: 'center', keepNext: true }); };
    const figures = [];
    const capRe = /^\*?\s*(figure|figura|fig\.?|chart|grafico|tabella|table|tab\.)\s*(?:\d+(?:\.\d+)?)?\s*[:.\-–—]?\s*(.*?)\*?$/i;

    /** markdown della sezione → paragrafi Word */
    async function mdToXml(md) {
      const lines = U.str(md).replace(/\r/g, '').split('\n');
      const out = [];
      let i = 0, pendingTabCap = null;
      const isCap = l => { const t = l.trim(); return /^\*[^*].*\*$/.test(t) && capRe.test(t.replace(/^\*|\*$/g, '')); };
      while (i < lines.length) {
        const l = lines[i], t = l.trim();
        if (!t) { i++; continue; }
        let m;
        if ((m = t.match(/^\[\[(FIG|CHART):([\w-]+)\]\]$/))) {
          let img = null;
          if (m[1] === 'FIG') img = await fileImage(m[2]);
          else { const f = Model.findBlock(m[2]); if (f) img = await chartPNG(f.block); }
          let cap = '';
          let k = i + 1; while (k < lines.length && !lines[k].trim()) k++;
          if (k < lines.length && isCap(lines[k])) { cap = lines[k].trim().replace(/^\*|\*$/g, '').replace(capRe, '$2'); i = k; }
          if (img) { const r = addImage(img); out.push(para(drawing(r.rid, r.id, img.w, img.h), { jc: 'center', keepNext: true, spacing: 'w:before="120" w:after="60"' })); }
          else if (m[1] === 'CHART') { const f = Model.findBlock(m[2]); if (f) { const d = UI.chartDataPublic(f.block); out.push(tableXml([[f.block.xLabel || ''].concat(d.datasets.map(s => s.label))].concat(d.labels.map((lb, q) => [lb].concat(d.datasets.map(s => U.fmtNum(s.data[q]))))))); } }
          if (img || m[1] === 'CHART') { const c = cap || (m[1] === 'CHART' ? (Model.findBlock(m[2]) || { block: {} }).block.title : '') || ''; out.push(figCaption(c)); figures.push(c); }
          i++; continue;
        }
        if (isCap(t)) {
          const raw = t.replace(/^\*|\*$/g, '');
          const kind = raw.match(capRe)[1].toLowerCase();
          const text = raw.replace(capRe, '$2');
          if (/^(table|tabella|tab)/.test(kind)) { pendingTabCap = text; i++; continue; }
          out.push(figCaption(text)); figures.push(text); i++; continue;
        }
        if ((m = t.match(/^(#{1,4})\s+(.*)$/))) { out.push(para(inline(m[2]), { style: 'Heading4', keepNext: true })); i++; continue; }
        if (/^\$\$/.test(t)) { let tex = t.replace(/^\$\$/, ''); while (!/\$\$\s*$/.test(tex) && i + 1 < lines.length) { i++; tex += ' ' + lines[i].trim(); } out.push(para(run(tex.replace(/\$\$\s*$/, ''), { i: true, font: 'Cambria Math' }), { jc: 'center' })); i++; continue; }
        if (/^\|.*\|$/.test(t)) {
          const rows = [];
          while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { const r = lines[i].trim(); if (!/^\|[\s:|-]+\|$/.test(r)) rows.push(r.replace(/^\||\|$/g, '').split('|').map(c => c.trim())); i++; }
          if (pendingTabCap !== null) { out.push(tabCaption(pendingTabCap)); pendingTabCap = null; }
          out.push(tableXml(rows)); out.push(para('', { spacing: 'w:after="60"' }));
          continue;
        }
        if (/^[-*•]\s+/.test(t)) { out.push(para(inline(t.replace(/^[-*•]\s+/, '')), { style: 'ListParagraph', numId: 1 })); i++; continue; }
        if ((m = t.match(/^(\d+)[.)]\s+(.*)$/))) { out.push(para(run(m[1] + ') ') + inline(m[2]), { style: 'ListParagraph', ind: 'w:left="720" w:hanging="360"' })); i++; continue; }
        if (/^>/.test(t)) { out.push(para(inline(t.replace(/^>\s?/, ''), { i: true }), { ind: 'w:left="567"' })); i++; continue; }
        const buf = [t];
        while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#{1,4}\s|[-*•]\s|\d+[.)]\s|\||\[\[|\$\$|>)/.test(lines[i + 1].trim()) && !isCap(lines[i + 1])) { i++; buf.push(lines[i].trim()); }
        if (pendingTabCap !== null) { out.push(para(inline(pendingTabCap, { i: true }))); pendingTabCap = null; }
        out.push(para(inline(buf.join(' '))));
        i++;
      }
      return out.join('');
    }
    function tableXml(rows) {
      if (!rows.length) return '';
      const n = Math.max(...rows.map(r => r.length));
      const w = Math.floor(9500 / n);
      const cell = (t, head) => '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (head ? '<w:shd w:val="clear" w:color="auto" w:fill="DCE6F2"/>' : '') + '</w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/><w:jc w:val="left"/></w:pPr>' + inline(t, head ? { b: true, sz: 20 } : { sz: 20 }) + '</w:p></w:tc>';
      return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/><w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="808080"/>').join('') + '</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' + Array.from({ length: n }, () => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>' +
        rows.map((r, ri) => '<w:tr>' + (ri === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : '') + Array.from({ length: n }, (_, ci) => cell(r[ci] || '', ri === 0)).join('') + '</w:tr>').join('') + '</w:tbl>';
    }

    /* --- copertina --- */
    const c = LiveReport.cover();
    let body = '';
    const logos = [];
    for (const id of c.logoIds) { const im = await fileImage(id); if (im) logos.push(im); }
    if (logos.length) { const r = addImage(logos[0]); body += para(drawing(r.rid, r.id, logos[0].w, logos[0].h, 2300000, 1100000), { jc: logos.length > 1 ? 'left' : 'center' }); }
    body += para('', { spacing: 'w:after="600"' });
    body += para(run(c.line1, { b: true, sz: 30 }), { jc: 'center', spacing: 'w:after="0"' }) + para(run(c.line2, { b: true, sz: 30 }), { jc: 'center', spacing: 'w:after="0"' }) + para(run(c.line3, { b: true, sz: 30 }), { jc: 'center' });
    if (logos.length > 1) { body += para('', { spacing: 'w:after="300"' }); logos.slice(1).forEach(im => { const r = addImage(im); body += para(drawing(r.rid, r.id, im.w, im.h, 3600000, 3000000), { jc: 'center' }); }); }
    body += para('', { spacing: 'w:after="500"' }) + para(run(c.title, { b: true, sz: 30 }), { jc: 'center', spacing: 'w:after="600"' });
    body += para(run(L.team, { b: true }), { spacing: 'w:after="0"', jc: 'left' }) + para(run(c.team || ''), { jc: 'left' });
    body += para(run(L.members, { b: true }), { spacing: 'w:after="0"', jc: 'left' }) + c.members.map(mb => para(run(mb), { style: 'ListParagraph', numId: 1, jc: 'left', spacing: 'w:after="0"' })).join('') + para('', { spacing: 'w:after="0"' });
    body += para(run(L.referent, { b: true }), { spacing: 'w:after="0"', jc: 'left' }) + para(run(c.referent || ''), { jc: 'left' });

    /* --- contenuto (prima, per sapere quante figure ci sono) --- */
    const plan = LiveReport.exportPlan();
    let content = '';
    const tocEntries = [];
    for (let k = 0; k < plan.length; k++) {
      const { s, e, num } = plan[k];
      const lv = Math.min(3, s.level || 1);
      const head = (num ? num + ' ' : '') + s.title;
      tocEntries.push({ lv, text: head });
      const styleH = 'Heading' + lv;
      content += para(run(lv === 1 ? head.toUpperCase() === head ? head : head : head), { style: styleH, pageBreak: lv === 1 && k > 0 && !(plan[k - 1] && plan[k - 1].s.level === 1 && plan[k - 1].e.mode === 'empty' && plan[k - 1].s.numbered && false) });
      if (e.mode === 'empty') {
        const hasKids = plan[k + 1] && (plan[k + 1].s.level || 1) > lv;
        if (!hasKids) content += para(run(L.todo + (s.notes ? ' ' + s.notes : ''), { hl: true, i: true }));
      } else content += await mdToXml(e.md);
    }
    /* --- indici --- */
    const toc = (instr, entries, styleOf) => entries.length ? '<w:p><w:pPr><w:pStyle w:val="' + styleOf(entries[0]) + '"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9628"/></w:tabs></w:pPr><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> ' + instr + ' </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' + run(entries[0].text) + '<w:r><w:tab/></w:r></w:p>' +
      entries.slice(1).map(en2 => '<w:p><w:pPr><w:pStyle w:val="' + styleOf(en2) + '"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9628"/></w:tabs></w:pPr>' + run(en2.text) + '<w:r><w:tab/></w:r></w:p>').join('') + '<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>' : '';
    body += pageBreak + para(run(L.index, { b: true, sz: 26 }), { spacing: 'w:after="160"' }) + toc('TOC \\o "1-3" \\h \\z \\u', tocEntries, en2 => 'TOC' + en2.lv);
    if (figures.length) body += pageBreak + para(run(L.figIndex, { b: true, sz: 24 }), { spacing: 'w:after="160"' }) + toc('TOC \\h \\z \\c "Figure"', figures.map((f, q) => ({ text: L.fig + ' ' + (q + 1) + ': ' + f })), () => 'TableofFigures');
    body += pageBreak.replace('<w:p>', '<w:p>') + content;

    /* --- parti del pacchetto --- */
    const icon = await iconPNG();
    const sect = '<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1134" w:bottom="1418" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>';
    const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '><w:body>' + body + sect + '</w:body></w:document>';
    const headerXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ' + NS + '><w:p><w:pPr><w:jc w:val="right"/></w:pPr>' + run(P.info.subject || 'Business Process Management', { b: true, i: true, color: '1F6FB2', sz: 20 }) + run('  ') + drawing('rIdIcon', 9000, 96, 84, 420000, 380000) + '</w:p></w:hdr>';
    const footerXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ' + NS + '>' + para(fld('PAGE', run('1', { sz: 18 })), { jc: 'center' }) + '</w:ftr>';
    const H = (id, sz, after, extra = '') => '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + (id.startsWith('Heading') ? 'heading ' + id.slice(7) : id) + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="' + after[0] + '" w:after="' + after[1] + '"/><w:jc w:val="left"/>' + extra + '</w:pPr><w:rPr><w:b/><w:sz w:val="' + sz + '"/></w:rPr></w:style>';
    const tocStyle = (n, ind, b) => '<w:style w:type="paragraph" w:styleId="TOC' + n + '"><w:name w:val="toc ' + n + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9628"/></w:tabs><w:spacing w:after="60"/><w:ind w:left="' + ind + '"/><w:jc w:val="left"/></w:pPr>' + (b ? '<w:rPr><w:b/></w:rPr>' : '') + '</w:style>';
    const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      H('Heading1', 28, [240, 160], '<w:outlineLvl w:val="0"/>') + H('Heading2', 24, [240, 120], '<w:ind w:left="142"/><w:outlineLvl w:val="1"/>') + H('Heading3', 22, [200, 100], '<w:ind w:left="284"/><w:outlineLvl w:val="2"/>') + H('Heading4', 22, [160, 60]) +
      '<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="60" w:after="200"/><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:ind w:left="720"/></w:pPr></w:style>' +
      tocStyle(1, 0, true) + tocStyle(2, 220, true) + tocStyle(3, 440, false) + '<w:style w:type="paragraph" w:styleId="TableofFigures"><w:name w:val="table of figures"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9628"/></w:tabs><w:spacing w:after="40"/><w:jc w:val="left"/></w:pPr></w:style>' +
      '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style></w:styles>';
    const numberingXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>';
    const settingsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/><w:defaultTabStop w:val="709"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';
    const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' + rels.join('') + '</Relationships>';
    const hdrRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdIcon" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/bpm-icon.png"/></Relationships>';
    const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>';
    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>';
    const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + x(c.title) + '</dc:title><dc:creator>' + x(c.team || P.info.members.join(', ')) + '</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</dcterms:created></cp:coreProperties>';
    const blob = zip([
      { name: '[Content_Types].xml', data: types }, { name: '_rels/.rels', data: rootRels }, { name: 'docProps/core.xml', data: core },
      { name: 'word/document.xml', data: documentXml }, { name: 'word/styles.xml', data: stylesXml }, { name: 'word/settings.xml', data: settingsXml }, { name: 'word/numbering.xml', data: numberingXml },
      { name: 'word/header1.xml', data: headerXml }, { name: 'word/footer1.xml', data: footerXml }, { name: 'word/_rels/document.xml.rels', data: docRels }, { name: 'word/_rels/header1.xml.rels', data: hdrRels },
      { name: 'word/media/bpm-icon.png', data: icon }
    ].concat(media));
    return { blob, stats: { sections: plan.length, figures: figN, tables: tabN, images: imgId - 1 } };
  }
  return { build, zip, crc32 };
})();

Actions['report-docx'] = async () => {
  UI.toast('Creo il documento Word…');
  try {
    const { blob, stats } = await Docx.build();
    const P = Store.P;
    const isB = typeof Course !== 'undefined' && Course.isBpm(), dn = isB ? Course.nextDeliverable() : 0;
    U.download(isB ? Course.team() + '_D' + dn + '.docx' : U.slug(P.info.teamName || P.info.name) + '-relazione-' + U.todayISO() + '.docx', blob);
    History.log('Esportata relazione Word (' + stats.sections + ' sezioni, ' + stats.figures + ' figure, ' + stats.tables + ' tabelle)', 'report');
    Store.touch();
    UI.toast('Word scaricato: ' + stats.sections + ' sezioni, ' + stats.figures + ' figure, ' + stats.tables + ' tabelle. All\'apertura Word chiede di aggiornare i campi: rispondi Sì per i numeri di pagina dell\'indice.' + (isB && dn > 1 ? ' Per la consegna salvatelo in PDF come ' + Course.fileName(dn) + ' e caricatelo su MS Teams.' : ''));
    if (isB) { const pg = Course.pages().total; if (pg > Course.MAX_PAGES) UI.toast('Attenzione: circa ' + Math.round(pg) + ' pagine stimate, il massimo è ' + Course.MAX_PAGES + '. Controllate il numero esatto nel Word.', 'err'); }
  } catch (e) { console.error(e); UI.toast('Esportazione Word non riuscita: ' + e.message, 'err'); }
};
