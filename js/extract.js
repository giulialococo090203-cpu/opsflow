/* =====================================================================
   EXTRACT — lettura del testo dai file caricati, senza librerie esterne
   - PDF: parser interno (oggetti, object stream, FlateDecode, ToUnicode)
   - DOCX: lettura dello zip e di word/document.xml (titoli → "## ")
   - TXT, MD, CSV, TEX, HTML: testo diretto
   Usa DecompressionStream del browser (Chrome/Edge 103+, Safari 16.4+).
   Le immagini e i PDF scansionati non contengono testo leggibile: vengono
   comunque conservati come allegati.
   ===================================================================== */
'use strict';

const Extract = (() => {
  const latin1 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };

  async function inflate(u8, raw = false) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Il browser non supporta la decompressione: aggiorna il browser');
    const ds = new DecompressionStream(raw ? 'deflate-raw' : 'deflate');
    const w = ds.writable.getWriter();
    w.write(u8).catch(() => {}); w.close().catch(() => {});
    const r = ds.readable.getReader();
    const chunks = []; let n = 0;
    try { for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); n += value.length; } }
    catch (e) { if (!n) throw e; /* dati troncati: tieni quanto decompresso */ }
    const out = new Uint8Array(n); let o = 0;
    chunks.forEach(c => { out.set(c, o); o += c.length; });
    return out;
  }

  /* =================== PDF =================== */
  async function pdf(buf, opts = {}) {
    const u8 = new Uint8Array(buf);
    const s = latin1(u8);
    if (!s.startsWith('%PDF')) throw new Error('Il file non è un PDF valido');
    if (/\/Encrypt\s/.test(s)) throw new Error('PDF protetto/cifrato: apri il file e copia il testo manualmente');
    const objs = new Map();
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let m;
    while ((m = re.exec(s))) {
      const start = re.lastIndex;
      const end = s.indexOf('endobj', start);
      if (end < 0) break;
      const body = s.slice(start, end);
      const si = body.search(/stream\r?\n/);
      let dict = body, stream = null;
      if (si >= 0 && /^\s*<</.test(body)) {
        dict = body.slice(0, si);
        const ds = start + si + body.slice(si).match(/stream\r?\n/)[0].length;
        let de = s.lastIndexOf('endstream', end);
        const lm = dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
        if (lm && ds + +lm[1] <= de) de = ds + +lm[1];
        stream = u8.subarray(ds, de);
      }
      objs.set(+m[1], { dict, stream, decoded: null });
      re.lastIndex = end + 6;
    }
    const decode = async o => {
      if (!o || !o.stream) return null;
      if (o.decoded) return o.decoded;
      let data = o.stream;
      const f = (o.dict.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/) || [])[1] || '';
      if (/FlateDecode/.test(f)) { try { data = await inflate(data); } catch (e) { data = new Uint8Array(0); } }
      else if (/DCTDecode|JPXDecode|CCITT|JBIG2/.test(f)) data = new Uint8Array(0);
      o.decoded = data;
      return data;
    };
    // object stream (PDF 1.5+): oggetti compressi
    for (const [, o] of [...objs]) {
      if (!/\/Type\s*\/ObjStm/.test(o.dict)) continue;
      const data = latin1(await decode(o));
      const N = +(o.dict.match(/\/N\s+(\d+)/) || [])[1], first = +(o.dict.match(/\/First\s+(\d+)/) || [])[1];
      const head = data.slice(0, first).trim().split(/\s+/).map(Number);
      for (let i = 0; i < N; i++) {
        const num = head[2 * i], off = first + head[2 * i + 1], next = i + 1 < N ? first + head[2 * i + 3] : data.length;
        if (!objs.has(num)) objs.set(num, { dict: data.slice(off, next), stream: null, decoded: null });
      }
    }
    const get = ref => objs.get(+ref);
    const refOf = (dict, key) => { const mm = dict.match(new RegExp('/' + key + '\\s+(\\d+)\\s+\\d+\\s+R')); return mm ? +mm[1] : null; };
    const inlineDict = (dict, key) => {
      const i = dict.search(new RegExp('/' + key + '\\s*<<'));
      if (i < 0) return null;
      let k = dict.indexOf('<<', i), depth = 0, j = k;
      for (; j < dict.length; j++) { if (dict.startsWith('<<', j)) { depth++; j++; } else if (dict.startsWith('>>', j)) { depth--; j++; if (!depth) break; } }
      return dict.slice(k, j + 1);
    };
    const dictOf = (dict, key) => inlineDict(dict, key) || ((r => r !== null && get(r) ? get(r).dict : null)(refOf(dict, key)));

    // ---- CMap ToUnicode ----
    const hexToStr = h => { let out = ''; for (let i = 0; i + 3 < h.length + 1; i += 4) { const c = parseInt(h.substr(i, 4), 16); if (!isNaN(c)) out += String.fromCharCode(c); } if (h.length === 2) out = String.fromCharCode(parseInt(h, 16)); return out; };
    function parseCMap(txt) {
      const map = new Map(); let bytes = 1;
      const cs = txt.match(/begincodespacerange\s*<([0-9a-fA-F]+)>/);
      if (cs) bytes = cs[1].length / 2;
      txt.replace(/beginbfchar([\s\S]*?)endbfchar/g, (_, b) => { b.replace(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g, (__, src, dst) => { map.set(parseInt(src, 16), hexToStr(dst)); }); });
      txt.replace(/beginbfrange([\s\S]*?)endbfrange/g, (_, b) => {
        b.replace(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g, (__, lo, hi, dst) => {
          const a = parseInt(lo, 16), z = parseInt(hi, 16);
          if (dst[0] === '[') { const list = dst.match(/<([0-9a-fA-F]*)>/g) || []; list.forEach((h, k) => map.set(a + k, hexToStr(h.slice(1, -1)))); }
          else { const base = dst.slice(1, -1); for (let c = a; c <= z && c - a < 65536; c++) { const v = parseInt(base, 16) + (c - a); map.set(c, base.length > 4 ? hexToStr(base.slice(0, -4)) + String.fromCharCode(v & 0xffff) : String.fromCharCode(v)); } }
        });
      });
      return { map, bytes };
    }
    const fontCache = new Map();
    async function fontInfo(fontDict) {
      if (!fontDict) return { map: null, bytes: 1 };
      if (fontCache.has(fontDict)) return fontCache.get(fontDict);
      const type0 = /\/Subtype\s*\/Type0/.test(fontDict);
      let info = { map: null, bytes: type0 ? 2 : 1 };
      const tu = refOf(fontDict, 'ToUnicode');
      if (tu !== null && get(tu)) { const cm = parseCMap(latin1(await decode(get(tu)) || new Uint8Array(0))); info = { map: cm.map, bytes: type0 ? 2 : cm.bytes }; }
      // larghezze dei glifi (per capire dove cadono gli spazi)
      const arrOf = (d, key) => { const mm = d.match(new RegExp('/' + key + '\\s*\\[')); if (mm) { const i0 = d.indexOf('[', mm.index); let dep = 0, j = i0; for (; j < d.length; j++) { if (d[j] === '[') dep++; else if (d[j] === ']') { dep--; if (!dep) break; } } return d.slice(i0 + 1, j); } const r = refOf(d, key); if (r !== null && get(r)) return get(r).dict.replace(/^\s*\[|\]\s*$/g, ''); return null; };
      info.widths = new Map(); info.dw = 1000;
      if (type0) {
        const dref = (fontDict.match(/\/DescendantFonts\s*\[?\s*(\d+)\s+\d+\s+R/) || [])[1];
        const dd = dref && get(dref) ? get(dref).dict : (inlineDict(fontDict, 'DescendantFonts') || '');
        const dwm = dd.match(/\/DW\s+(\d+)/); if (dwm) info.dw = +dwm[1];
        const W = arrOf(dd, 'W');
        if (W) {
          const toks = W.match(/\[[^\]]*\]|-?[\d.]+/g) || [];
          for (let k = 0; k < toks.length;) {
            const c0 = +toks[k];
            if (toks[k + 1] && toks[k + 1][0] === '[') { (toks[k + 1].slice(1, -1).trim().split(/\s+/)).forEach((w, q) => info.widths.set(c0 + q, +w)); k += 2; }
            else { const c1 = +toks[k + 1], w = +toks[k + 2]; for (let c = c0; c <= c1 && c - c0 < 65536; c++) info.widths.set(c, w); k += 3; }
          }
        }
      } else {
        const fc = +(fontDict.match(/\/FirstChar\s+(\d+)/) || [0, 0])[1];
        const W = arrOf(fontDict, 'Widths');
        if (W) W.trim().split(/\s+/).forEach((w, q) => info.widths.set(fc + q, +w));
        info.dw = 500;
      }
      fontCache.set(fontDict, info);
      return info;
    }
    // ---- pagine nell'ordine dell'albero ----
    const pages = [];
    const root = (() => { const r = s.match(/\/Root\s+(\d+)\s+\d+\s+R/); return r ? get(r[1]) : null; })();
    const walk = (num, inherited, depth = 0) => {
      const o = get(num);
      if (!o || depth > 30) return;
      const res = o.dict.includes('/Resources') ? o.dict : inherited;
      if (/\/Type\s*\/Pages/.test(o.dict)) { const kids = (o.dict.match(/\/Kids\s*\[([^\]]*)\]/) || [])[1] || ''; (kids.match(/(\d+)\s+\d+\s+R/g) || []).forEach(k => walk(parseInt(k, 10), res, depth + 1)); }
      else if (/\/Type\s*\/Page\b/.test(o.dict)) pages.push({ o, res });
    };
    if (root) { const pr = refOf(root.dict, 'Pages'); if (pr !== null) walk(pr, ''); }
    if (!pages.length) [...objs.values()].filter(o => /\/Type\s*\/Page\b/.test(o.dict)).forEach(o => pages.push({ o, res: o.dict }));

    const out = []; let curXO = {};
    for (const pg of pages) {
      const resDict = inlineDict(pg.res, 'Resources') || dictOf(pg.res, 'Resources') || '';
      const fontsDict = dictOf(resDict, 'Font') || '';
      const fonts = {};
      (fontsDict.match(/\/([^\s/<>\[\]()]+)\s+(\d+)\s+\d+\s+R/g) || []).forEach(x => { const mm = x.match(/\/([^\s/<>\[\]()]+)\s+(\d+)/); fonts[mm[1]] = get(mm[2]) ? get(mm[2]).dict : null; });
      let content = '';
      const cref = pg.o.dict.match(/\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/);
      if (cref) for (const r of (cref[1].match(/(\d+)\s+\d+\s+R/g) || [])) { const d = await decode(get(parseInt(r, 10))); if (d) content += latin1(d) + '\n'; }
      const xo = {};
      if (opts.images) {
        const xd = dictOf(resDict, 'XObject') || '';
        (xd.match(/\/([^\s/<>\[\]()]+)\s+(\d+)\s+\d+\s+R/g) || []).forEach(x => { const mm = x.match(/\/([^\s/<>\[\]()]+)\s+(\d+)/); const o = get(mm[2]); if (o && /\/Subtype\s*\/Image/.test(o.dict)) xo[mm[1]] = +mm[2]; });
      }
      curXO = xo;
      out.push(await pageText(content, fonts));
    }
    async function pageText(c, fonts) {
      let font = { map: null, bytes: 1, widths: new Map(), dw: 500 };
      let fs = 10, Tc = 0, Tw = 0, Tz = 1, TL = 0;
      let tm = [1, 0, 0, 1, 0, 0], lm = [1, 0, 0, 1, 0, 0];
      let text = '', line = '', lastY = null, lastX = null;
      const flush = () => { if (line.trim()) text += line.replace(/\s+$/, '') + '\n'; line = ''; };
      const pos = () => [tm[4], tm[5]];
      const show = str => {
        const [x, y] = pos();
        const h = Math.abs(tm[3]) * fs || fs;
        if (lastY !== null && Math.abs(y - lastY) > 0.6 * h) flush();
        else if (lastX !== null && line && !/\s$/.test(line) && x - lastX > 0.18 * Math.abs(tm[0] || 1) * fs) line += ' ';
        let t = '', adv = 0;
        const step = (code, ch) => { const w = font.widths.has(code) ? font.widths.get(code) : font.dw; adv += (w / 1000 * fs + Tc + (code === 32 && font.bytes === 1 ? Tw : 0)) * Tz; t += ch; };
        if (font.bytes === 2) { for (let i = 0; i + 1 < str.length; i += 2) { const code = (str.charCodeAt(i) << 8) | str.charCodeAt(i + 1); step(code, font.map && font.map.has(code) ? font.map.get(code) : ''); } }
        else for (let i = 0; i < str.length; i++) { const code = str.charCodeAt(i); step(code, font.map && font.map.has(code) ? font.map.get(code) : (code === 0x92 ? '’' : code === 0x93 ? '“' : code === 0x94 ? '”' : code === 0x96 ? '–' : str[i])); }
        line += t;
        tm[4] += adv * tm[0]; tm[5] += adv * tm[1];
        lastX = tm[4]; lastY = y;
      };
      const kern = n => { const d = -n / 1000 * fs * Tz; tm[4] += d * tm[0]; tm[5] += d * tm[1]; };
      const td = (tx, ty) => { lm = [lm[0], lm[1], lm[2], lm[3], lm[4] + tx * lm[0] + ty * lm[2], lm[5] + tx * lm[1] + ty * lm[3]]; tm = lm.slice(); };
      let i = 0; const L = c.length; const stack = [];
      const readString = () => {
        let depth = 1, r = ''; i++;
        while (i < L && depth) {
          const ch = c[i];
          if (ch === '\\') {
            const n = c[i + 1];
            const esc = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
            if (esc[n] !== undefined) { r += esc[n]; i += 2; }
            else if (/[0-7]/.test(n)) { let o = ''; let k = i + 1; while (k < i + 4 && /[0-7]/.test(c[k])) o += c[k++]; r += String.fromCharCode(parseInt(o, 8) & 255); i = k; }
            else if (n === '\r' || n === '\n') { i += 2; if (n === '\r' && c[i] === '\n') i++; }
            else { r += n; i += 2; }
            continue;
          }
          if (ch === '(') depth++;
          if (ch === ')') { depth--; if (!depth) { i++; break; } }
          r += ch; i++;
        }
        return r;
      };
      const readHex = () => { const e = c.indexOf('>', i); const h = c.slice(i + 1, e).replace(/\s/g, ''); i = e + 1; let r = ''; for (let k = 0; k < h.length; k += 2) r += String.fromCharCode(parseInt((h.substr(k, 2) + '0').slice(0, 2), 16)); return r; };
      while (i < L) {
        const ch = c[i];
        if (ch === '(') { stack.push({ s: readString() }); continue; }
        if (ch === '<' && c[i + 1] !== '<') { stack.push({ s: readHex() }); continue; }
        if (ch === '[') { stack.push({ arr: true }); i++; continue; }
        if (ch === ']') { const items = []; while (stack.length && !stack[stack.length - 1].arr) items.unshift(stack.pop()); stack.pop(); stack.push({ list: items }); i++; continue; }
        if (ch === '%') { while (i < L && c[i] !== '\n' && c[i] !== '\r') i++; continue; }
        if (/\s/.test(ch)) { i++; continue; }
        if (ch === '/') { let j = i + 1; while (j < L && !/[\s/\[\]()<>{}%]/.test(c[j])) j++; stack.push({ name: c.slice(i + 1, j) }); i = j; continue; }
        if (/[0-9.+\-]/.test(ch)) { let j = i + 1; while (j < L && /[0-9.]/.test(c[j])) j++; stack.push({ num: parseFloat(c.slice(i, j)) }); i = j; continue; }
        if (ch === '<' && c[i + 1] === '<') { let d = 0, j = i; for (; j < L; j++) { if (c.startsWith('<<', j)) { d++; j++; } else if (c.startsWith('>>', j)) { d--; j++; if (!d) break; } } i = j + 1; stack.push({}); continue; }
        let j = i; while (j < L && /[A-Za-z*'"]/.test(c[j])) j++;
        if (j === i) { i++; continue; }
        const op = c.slice(i, j); i = j;
        const nums = stack.filter(x => x.num !== undefined).map(x => x.num);
        const n = k => nums[nums.length - k];
        switch (op) {
          case 'Do': { const nm = stack.filter(x => x.name).pop(); if (nm && curXO[nm.name] !== undefined) { flush(); text += '\u0001IMG' + curXO[nm.name] + '\u0001\n'; lastY = null; } break; }
          case 'BI': { const e = c.indexOf('EI', i); i = e < 0 ? L : e + 2; break; }
          case 'BT': tm = [1, 0, 0, 1, 0, 0]; lm = tm.slice(); break;
          case 'Tf': { const nm = stack.filter(x => x.name).pop(); font = await fontInfo(nm ? fonts[nm.name] : null); if (nums.length) fs = n(1) || fs; break; }
          case 'Tc': if (nums.length) Tc = n(1); break;
          case 'Tw': if (nums.length) Tw = n(1); break;
          case 'Tz': if (nums.length) Tz = n(1) / 100; break;
          case 'TL': if (nums.length) TL = n(1); break;
          case 'Td': if (nums.length >= 2) td(n(2), n(1)); break;
          case 'TD': if (nums.length >= 2) { TL = -n(1); td(n(2), n(1)); } break;
          case 'Tm': if (nums.length >= 6) { tm = nums.slice(-6); lm = tm.slice(); } break;
          case 'T*': td(0, -TL); break;
          case 'Tj': { const st = stack.filter(x => x.s !== undefined).pop(); if (st) show(st.s); break; }
          case "'": { td(0, -TL); const st = stack.filter(x => x.s !== undefined).pop(); if (st) show(st.s); break; }
          case '"': { if (nums.length >= 2) { Tw = n(2); Tc = n(1); } td(0, -TL); const st = stack.filter(x => x.s !== undefined).pop(); if (st) show(st.s); break; }
          case 'TJ': { const lst = stack.filter(x => x.list).pop(); if (lst) lst.list.forEach(x => { if (x.s !== undefined) show(x.s); else if (x.num !== undefined) kern(x.num); }); break; }
          default: break;
        }
        stack.length = 0;
      }
      flush();
      return text;
    }
    const text = out.join('\n\f\n').replace(/[ \t]+\n/g, '\n').replace(/\u0000/g, '');
    if (!opts.images) return { text, pages: pages.length };
    // immagini incorporate: JPEG così come sono, Flate RGB/Gray a 8 bit → PNG
    const imgCache = new Map();
    const image = async num => {
      if (imgCache.has(num)) return imgCache.get(num);
      let r = null;
      try { r = await pdfImage(get(num)); } catch (e) { r = null; }
      imgCache.set(num, r);
      return r;
    };
    async function pdfImage(o) {
      if (!o || !o.stream) return null;
      const d = o.dict, W = +(d.match(/\/Width\s+(\d+)/) || [])[1], H = +(d.match(/\/Height\s+(\d+)/) || [])[1];
      if (!W || !H || W * H < 120 * 90 || W < 60 || H < 40 || W * H > 30e6) return null;
      const f = (d.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/) || [])[1] || '';
      if (/DCTDecode/.test(f) && !/FlateDecode/.test(f)) return /DeviceCMYK/.test(d) ? null : { blob: new Blob([o.stream.slice()], { type: 'image/jpeg' }), w: W, h: H, ext: 'jpg' };
      if (!/FlateDecode/.test(f) || /\[\s*\/FlateDecode\s*\/\w+/.test(f)) return null;
      if (+(d.match(/\/BitsPerComponent\s+(\d+)/) || [0, 8])[1] !== 8) return null;
      let nc = 0;
      const cs = (d.match(/\/ColorSpace\s*(\/\w+|\[[^\]]*\]|\d+\s+\d+\s+R)/) || [])[1] || '';
      const csTxt = /^\d/.test(cs) ? ((get(parseInt(cs, 10)) || {}).dict || '') : cs;
      if (/DeviceRGB|CalRGB/.test(csTxt)) nc = 3; else if (/DeviceGray|CalGray/.test(csTxt)) nc = 1;
      else if (/ICCBased/.test(csTxt)) { const ir = (csTxt.match(/ICCBased\s+(\d+)\s+\d+\s+R/) || [])[1]; const io = ir && get(ir); nc = io ? +(io.dict.match(/\/N\s+(\d)/) || [0, 0])[1] : 0; }
      if (nc !== 1 && nc !== 3) return null;
      let data = await inflate(o.stream);
      const pred = +(d.match(/\/Predictor\s+(\d+)/) || [0, 1])[1];
      const row = W * nc;
      if (pred >= 10) {
        const outB = new Uint8Array(row * H);
        for (let y = 0; y < H; y++) {
          const ft = data[y * (row + 1)], src = data.subarray(y * (row + 1) + 1, (y + 1) * (row + 1)), o2 = y * row;
          for (let x = 0; x < row; x++) {
            const a = x >= nc ? outB[o2 + x - nc] : 0, b = y ? outB[o2 - row + x] : 0, c = y && x >= nc ? outB[o2 - row + x - nc] : 0;
            let v = src[x];
            if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
            else if (ft === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
            outB[o2 + x] = v & 255;
          }
        }
        data = outB;
      }
      if (data.length < row * H || typeof document === 'undefined') return null;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const cx = cv.getContext('2d'), im = cx.createImageData(W, H);
      for (let k = 0, q = 0; k < W * H; k++, q += nc) { const r = data[q], g = nc === 3 ? data[q + 1] : r, b = nc === 3 ? data[q + 2] : r; im.data[k * 4] = r; im.data[k * 4 + 1] = g; im.data[k * 4 + 2] = b; im.data[k * 4 + 3] = 255; }
      cx.putImageData(im, 0, 0);
      const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
      return blob ? { blob, w: W, h: H, ext: 'png' } : null;
    }
    return { text, pages: pages.length, image };
  }

  /* =================== ZIP / DOCX =================== */
  async function unzip(buf, wanted) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('File non valido (archivio zip non riconosciuto)');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
      if (wanted(name)) {
        const lnl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true);
        const data = u8.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + csize);
        files[name] = method === 8 ? await inflate(data, true) : data;
      }
      p += 46 + nlen + elen + clen;
    }
    return files;
  }
  const xmlText = s => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  async function docx(buf) {
    const files = await unzip(buf, n => n === 'word/document.xml');
    const xml = files['word/document.xml'] ? new TextDecoder().decode(files['word/document.xml']) : '';
    if (!xml) throw new Error('Documento Word non valido');
    const out = [];
    (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).forEach(p => {
      const style = (p.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '';
      let t = '';
      p.replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>/g, (m, txt) => { t += txt !== undefined ? xmlText(txt) : m.startsWith('<w:tab') ? '\t' : '\n'; return m; });
      if (!t.trim()) { out.push(''); return; }
      const lv = (style.match(/^(?:Heading|Titolo|Title|berschrift)(\d)?/i) || [])[1];
      if (/^(Heading|Titolo|berschrift)\d/i.test(style)) out.push('#'.repeat(Math.min(4, +lv + 1)) + ' ' + t.trim());
      else if (/^Title/i.test(style)) out.push('# ' + t.trim());
      else if (/ListParagraph|Paragrafoelenco/i.test(style)) out.push('- ' + t.trim());
      else out.push(t);
    });
    return { text: out.join('\n').replace(/\n{3,}/g, '\n\n'), pages: null };
  }
  async function pptx(buf) {
    const files = await unzip(buf, n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    const names = Object.keys(files).sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
    return { text: names.map((n, i) => '## Slide ' + (i + 1) + '\n' + (new TextDecoder().decode(files[n]).match(/<a:p>[\s\S]*?<\/a:p>/g) || []).map(p => xmlText(p.replace(/<a:br\/>/g, '\n'))).filter(x => x.trim()).join('\n')).join('\n\n'), pages: names.length };
  }


  /* =================== STRUTTURA (per caricare documenti nelle fasi) ===================
     Elementi in ordine di lettura:
       {t:'h', level, text, num}   titolo di sezione
       {t:'p', text}               paragrafo (markdown leggero: **grassetto**)
       {t:'li', text}              punto elenco
       {t:'table', rows}           tabella (prima riga = intestazione)
       {t:'img', blob, w, h, ext}  figura
       {t:'cap', text, kind}       didascalia ("Fig. 3: …", "Table 2: …")            */
  const CAP_RE = /^(fig\.?|figure|figura|table|tab\.?|tabella|chart|grafico|graph)\s*\d+(\.\d+)?\s*[:.\-–—]\s*\S/i;
  const capKind = t => /^(table|tab\.?|tabella)\s*\d/i.test(t) ? 'table' : 'figure';
  const SKIP_HEAD = /^(index|indice|table of contents|contents|index of figures|indice delle figure|list of figures|elenco delle figure|index of tables|list of tables)$/i;
  const KNOWN_H1 = /^(summary|executive summary|abstract|introduction|introduzione|sintesi|sommario|conclusions?|conclusioni|bibliography|bibliografia|references|riferimenti|sitography|sitografia|appendix|appendice|allegati|premessa)$/i;
  function splitNum(text) {
    const m = text.match(/^((?:\d+\.)*\d+)\.?\s+(\S.*)$/);
    return m ? { num: m[1], text: m[2].trim(), level: Math.min(4, m[1].split('.').length) } : { num: '', text: text.trim(), level: 0 };
  }

  async function docxStructure(buf) {
    const files = await unzip(buf, n => n === 'word/document.xml' || n === 'word/_rels/document.xml.rels' || n === 'word/styles.xml' || n.startsWith('word/media/'));
    const dec = n => files[n] ? new TextDecoder().decode(files[n]) : '';
    const xml = dec('word/document.xml');
    if (!xml) throw new Error('Documento Word non valido');
    const rel = {};
    dec('word/_rels/document.xml.rels').replace(/<Relationship\b([^>]*)>/g, (m, a) => { const id = (a.match(/\bId="([^"]+)"/) || [])[1], t = (a.match(/\bTarget="([^"]+)"/) || [])[1]; if (id && t) rel[id] = t.replace(/^\/?word\//, '').replace(/^\.\//, ''); return m; });
    const styles = {};
    dec('word/styles.xml').replace(/<w:style\b[\s\S]*?<\/w:style>/g, st => { const id = (st.match(/w:styleId="([^"]+)"/) || [])[1]; if (id) styles[id] = { name: (st.match(/<w:name w:val="([^"]+)"/) || [])[1] || id, outline: (st.match(/<w:outlineLvl w:val="(\d)"/) || [])[1] }; return st; });
    const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [])[1] || xml;
    // trova la chiusura di un elemento rispettando l'annidamento
    const closeOf = (str, start, tag) => {
      const re = new RegExp('<(/?)w:' + tag + '(?=[\\s>/])[^>]*?(/?)>', 'g'); re.lastIndex = start; let depth = 0, m;
      while ((m = re.exec(str))) { if (m[2]) { if (!depth) return re.lastIndex; continue; } if (m[1]) { depth--; if (!depth) return re.lastIndex; } else depth++; }
      return str.length;
    };
    const runsText = p => {
      let out = '';
      (p.match(/<w:r[\s>][\s\S]*?<\/w:r>/g) || []).forEach(r => {
        if (/<w:instrText/.test(r) && !/<w:t[\s>]/.test(r)) return;
        let t = '';
        r.replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>/g, (m, x) => { t += x !== undefined ? xmlText(x) : m.startsWith('<w:tab') ? ' ' : '\n'; return m; });
        if (!t) return;
        const bold = /<w:b(?:\s+w:val="(?:1|true|on)")?\s*\/>/.test(r) && !/<w:b\s+w:val="(?:0|false|off)"/.test(r);
        out += bold && t.trim() ? t.replace(/^(\s*)([\s\S]*?)(\s*)$/, (mm, a, b2, c) => a + '**' + b2 + '**' + c) : t;
      });
      return out.replace(/\*\*\*\*/g, '').replace(/\*\*(\s+)\*\*/g, '$1');
    };
    const els = [];
    const para = p => {
      const sid = (p.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '';
      const sname = (styles[sid] || {}).name || sid;
      if (/^(toc|sommario|indice|table of figures|tabella delle figure)/i.test(sname) || /^TOC\d/i.test(sid)) return;
      // figure (prima del testo del paragrafo)
      (p.match(/r:(?:embed|id)="(rId\d+)"/g) || []).forEach(x => { const id = x.match(/"(rId\d+)"/)[1], t = rel[id]; if (t && files['word/' + t] && /\.(png|jpe?g|gif|bmp)$/i.test(t)) { const ext = t.split('.').pop().toLowerCase(); const data = files['word/' + t]; if (data.length > 1500) els.push({ t: 'img', blob: new Blob([data.slice()], { type: ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'bmp' ? 'image/bmp' : 'image/jpeg' }), ext: ext === 'jpeg' ? 'jpg' : ext }); } });
      const raw = runsText(p);
      const plain = raw.replace(/\*\*/g, '').trim();
      if (!plain) return;
      const hl = (sname.match(/^(?:heading|titolo|überschrift|titre)\s*(\d)/i) || [])[1] || (/^Heading(\d)$/i.test(sid) ? sid.slice(7) : null);
      const ol = (p.match(/<w:outlineLvl w:val="(\d)"/) || [])[1] || (styles[sid] || {}).outline;
      if (/^(title|titolo|subtitle|sottotitolo)$/i.test(sname)) { els.push({ t: 'p', text: '**' + plain + '**' }); return; }
      if (hl || (ol !== undefined && ol !== null && +ol < 4)) {
        const sn = splitNum(plain);
        els.push({ t: 'h', level: hl ? +hl : ol !== undefined && ol !== null ? +ol + 1 : 1, text: sn.text, num: sn.num });
        return;
      }
      if (/caption|didascalia/i.test(sname) || (CAP_RE.test(plain) && plain.length < 260)) { els.push({ t: 'cap', text: plain, kind: capKind(plain) }); return; }
      // paragrafo tutto in grassetto e breve = titolo "a mano"
      const allBold = /^\*\*[^*]+\*\*$/.test(raw.trim());
      if ((allBold && plain.length < 90 && !/[.:;]$/.test(plain)) || (KNOWN_H1.test(plain) && plain.length < 40)) { const sn = splitNum(plain); els.push({ t: 'h', level: sn.level || (KNOWN_H1.test(sn.text) ? 1 : 2), text: sn.text, num: sn.num, guessed: true }); return; }
      if (/<w:numPr>/.test(p) || /list|elenco/i.test(sname)) { els.push({ t: 'li', text: raw.trim() }); return; }
      els.push({ t: 'p', text: raw.trim() });
    };
    const table = tb => {
      const rows = [];
      let i = 0;
      const re = /<w:tr[\s>]/g; let m;
      while ((m = re.exec(tb))) {
        const end = closeOf(tb, m.index, 'tr'); const tr = tb.slice(m.index, end); re.lastIndex = end;
        const cells = []; const rc = /<w:tc[\s>]/g; let c;
        while ((c = rc.exec(tr))) { const ce = closeOf(tr, c.index, 'tc'); cells.push((tr.slice(c.index, ce).match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || []).map(x => runsText(x).replace(/\*\*/g, '').trim()).filter(Boolean).join(' ')); rc.lastIndex = ce; }
        if (cells.some(x => x)) rows.push(cells);
        i++;
      }
      if (!rows.length) return;
      // tabelle-impaginazione (una sola cella) → testo normale
      if (rows.every(r => r.length === 1)) { rows.forEach(r => els.push({ t: 'p', text: r[0] })); return; }
      const w = Math.max(...rows.map(r => r.length)); rows.forEach(r => { while (r.length < w) r.push(''); });
      els.push({ t: 'table', rows });
    };
    const re = /<w:(p|tbl)(?=[\s>/])[^>]*?(\/?)>/g; let m;
    while ((m = re.exec(body))) {
      if (m[2]) continue;
      const end = closeOf(body, m.index, m[1]);
      const chunk = body.slice(m.index, end);
      if (m[1] === 'tbl') table(chunk); else para(chunk);
      re.lastIndex = end;
    }
    return { els };
  }

  async function pdfStructure(buf) {
    const r = await pdf(buf, { images: true });
    const pages = r.text.split('\n\f\n').map(pg => pg.split('\n').map(l => fixSpaced(l).replace(/\s+/g, ' ').trim()).filter(Boolean));
    // righe ripetute in testa/piede di pagina (intestazione, numero di pagina)
    const edge = {};
    pages.forEach(ls => { const seen = new Set(); ls.slice(0, 3).concat(ls.slice(-3)).forEach(l => { const k = l.replace(/\d+/g, '#'); if (!seen.has(k)) { seen.add(k); edge[k] = (edge[k] || 0) + 1; } }); });
    const rep = new Set(Object.keys(edge).filter(k => pages.length >= 3 && edge[k] >= Math.max(3, pages.length * 0.4)));
    const imgCount = {};
    pages.forEach(ls => new Set(ls.filter(l => /^\u0001IMG\d+\u0001$/.test(l))).forEach(l => { imgCount[l] = (imgCount[l] || 0) + 1; }));
    const els = [];
    const lens = pages.flat().filter(l => l.length > 20 && !/^\u0001/.test(l)).map(l => l.length).sort((a, b) => a - b);
    const full = lens.length ? lens[Math.floor(lens.length * 0.8)] : 80;
    let para = '', lastLen = 0;
    const flushP = () => { if (para.trim()) els.push({ t: 'p', text: para.trim() }); para = ''; };
    let lastTop = 0;
    for (let pi = 0; pi < pages.length; pi++) {
      const ls = pages[pi].filter((l, k, a) => !((k < 3 || k >= a.length - 3) && rep.has(l.replace(/\d+/g, '#'))) && !/^\d{1,3}$/.test(l));
      const dots = ls.filter(l => /\.{5,}|…{3,}|(\. ){4,}/.test(l)).length;
      if (ls.length && dots / ls.length > 0.35) continue; // pagina di indice
      for (const l of ls) {
        if (/^\u0001IMG\d+\u0001$/.test(l)) {
          flushP();
          if (imgCount[l] > 2) continue; // logo ripetuto su ogni pagina
          const img = await r.image(+l.slice(4, -1));
          if (img) els.push(Object.assign({ t: 'img' }, img));
          continue;
        }
        if (/\.{5,}/.test(l)) continue;
        if (CAP_RE.test(l) && l.length < 200) { flushP(); els.push({ t: 'cap', text: l, kind: capKind(l) }); continue; }
        const sn = splitNum(l);
        const head = l.length < 95 && !/[.,;:]$/.test(l) && (
          (sn.num && sn.level <= 4 && +sn.num.split('.')[0] <= 15 && /^[A-ZÀ-Ü]/.test(sn.text) && sn.text.split(' ').length <= 14 && !/:\s+\S/.test(sn.text) && (sn.level > 1 || +sn.num === lastTop + 1 || +sn.num === lastTop)) ||
          KNOWN_H1.test(l));
        if (head) { flushP(); if (sn.num && sn.level === 1) lastTop = +sn.num; els.push({ t: 'h', level: sn.level || 1, text: sn.text, num: sn.num }); continue; }
        if (/^[•▪◦●■\-–*]\s+/.test(l)) { flushP(); els.push({ t: 'li', text: l.replace(/^[•▪◦●■\-–*]\s+/, '') }); lastLen = 0; continue; }
        // continuazione di un punto elenco
        const prev = els[els.length - 1];
        if (!para && prev && prev.t === 'li' && lastLen >= full * 0.75 && /^[a-zà-ü(]/.test(l)) { prev.text += ' ' + l; lastLen = l.length; continue; }
        para = para ? (para.endsWith('-') && /^[a-zà-ü]/.test(l) ? para.slice(0, -1) + l : para + ' ' + l) : l;
        lastLen = l.length;
        if (/[.:!?)]$/.test(l) && l.length < full * 0.85) flushP();
        else if (prev && prev.t === 'li' && para === l && /[.;]$/.test(l)) flushP();
      }
      // a fine pagina il paragrafo può continuare
    }
    flushP();
    return { els, pages: r.pages };
  }

  /** documento → elementi strutturati (DOCX, PDF; il resto come testo) */
  async function structure(f) {
    const name = f.name.toLowerCase();
    const buf = await f.arrayBuffer();
    if (name.endsWith('.docx')) return docxStructure(buf);
    if (name.endsWith('.pdf') || f.type === 'application/pdf') return pdfStructure(buf);
    const r = await file(new File([buf], f.name, { type: f.type }));
    const els = [];
    U.str(r.text).split(/\n{2,}/).forEach(b => { const t = b.trim(); if (!t) return; const h = t.match(/^(#{1,4})\s+(.*)$/); if (h && !t.includes('\n')) { const sn = splitNum(h[2]); els.push({ t: 'h', level: h[1].length, text: sn.text, num: sn.num }); } else if (/^## Slide \d+/.test(t)) { const [first, ...rest] = t.split('\n'); els.push({ t: 'h', level: 2, text: first.replace(/^#+\s*/, '') }); if (rest.length) els.push({ t: 'p', text: rest.join('\n') }); } else els.push({ t: 'p', text: t }); });
    return { els };
  }

  /* =================== INGRESSO UNICO =================== */
  async function file(f) {
    const name = f.name.toLowerCase();
    const buf = await f.arrayBuffer();
    let r;
    if (name.endsWith('.pdf') || f.type === 'application/pdf') r = await pdf(buf);
    else if (name.endsWith('.docx')) r = await docx(buf);
    else if (name.endsWith('.pptx')) r = await pptx(buf);
    else if (/\.(txt|md|markdown|csv|tsv|tex|json)$/.test(name) || /^text\/plain/.test(f.type)) r = { text: new TextDecoder().decode(buf), pages: null };
    else if (/\.html?$/.test(name)) { const d = document.createElement('div'); d.innerHTML = new TextDecoder().decode(buf).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ''); r = { text: d.innerText || d.textContent || '', pages: null }; }
    else if (/\.(doc|ppt|xls|xlsx|pages|key|numbers)$/.test(name)) throw new Error('Formato non leggibile direttamente: salvalo come PDF o .docx');
    else return { text: '', pages: null, unsupported: true };
    r.text = U.str(r.text).replace(/\r/g, '').split('\n').map(fixSpaced).join('\n').replace(/[ \t]{3,}/g, '  ').trim();
    r.words = U.words(r.text);
    r.scanned = /\.pdf$/.test(name) && r.words < 20 * Math.max(1, r.pages || 1) * 0.2;
    return r;
  }
  /** righe con lettere spaziate ("P o r t e r ' s  v a l u e") → parole normali */
  function fixSpaced(line) {
    const toks = line.trim().split(' ').filter(Boolean);
    if (toks.length < 6 || toks.filter(t => t.length === 1).length / toks.length < 0.7) return line;
    return line.trim().replace(/ {2,}/g, '\u0000').replace(/ /g, '').replace(/\u0000/g, ' ');
  }
  /** individua i titoli di sezione in un testo estratto (numerati, MAIUSCOLI o markdown) */
  function headings(text) {
    return U.str(text).split('\n').map((l, i) => ({ l: l.trim(), i })).filter(({ l }) => l.length > 2 && l.length < 95 && !/\.{4,}/.test(l) &&
      (/^#{1,4}\s+\S/.test(l) || /^\d+(\.\d+){0,3}\.?\s+[A-ZÀ-Üa-z]/.test(l) || (/^[A-ZÀ-Ü0-9 '’&\-:,()]{5,}$/.test(l) && /[A-Z]{3}/.test(l))));
  }
  return { file, pdf, docx, headings, structure, CAP_RE, SKIP_HEAD };
})();
