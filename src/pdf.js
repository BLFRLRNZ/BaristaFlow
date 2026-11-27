/* ---------- PDF senza librerie ----------
   Un piccolo scrittore di PDF per i documenti che si scaricano su richiesta: pagine A4 con i caratteri standard
   Helvetica (ogni lettore di PDF li ha, non serve incorporarli), testo in WinAnsi con lettere accentate, euro e
   virgolette, a capo con le larghezze vere dei caratteri, linee, fondi grigi, tabelle che continuano sulla pagina dopo
   e il piè di pagina con «Pagina 1 di 2». Il file nasce solo quando lo si chiede: niente viene salvato o preparato prima. */
const PDF_LARG = {
  r: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],
  b: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556]};
const PDF_1252 = {'€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142,
  '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159};
/* un carattere in WinAnsi: gli spazi speciali diventano spazi, le lettere con segni non previsti perdono il segno,
   il resto diventa «?» */
function pdfByte(ch) {
  const c = ch.codePointAt(0);
  if (c >= 32 && c < 127) return c;
  if (c === 160 || c === 0x202f || (c >= 0x2000 && c <= 0x200a)) return 32;
  if (c > 160 && c <= 255) return c;
  if (PDF_1252[ch]) return PDF_1252[ch];
  const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return base && base !== ch && base.codePointAt(0) < 256 ? pdfByte(base[0]) : 63;
}
const pdfBytes = s => [...String(s ?? '').replace(/[\r\n\t]+/g, ' ')].map(pdfByte);
const pdfLargB = (b, size, bold) => b.reduce((t, x) => t + (PDF_LARG[bold ? 'b' : 'r'][x - 32] || 0), 0) * size / 1000;
const pdfLarg = (s, size, bold) => pdfLargB(pdfBytes(s), size, bold);
/* stringa PDF: parentesi e barre rovesciate protette, i caratteri oltre l'ASCII in ottale (il file resta tutto ASCII) */
const pdfStr = b => '(' + b.map(x => x === 40 || x === 41 || x === 92 ? '\\' + String.fromCharCode(x) : x < 128 ? String.fromCharCode(x) : '\\' + x.toString(8).padStart(3, '0')).join('') + ')';
const pdfUtf16 = s => '<FEFF' + Array.from({length: s.length}, (_, i) => s.charCodeAt(i).toString(16).padStart(4, '0')).join('') + '>';
/* a capo nella larghezza w; una parola più lunga della riga si spezza */
function pdfWrap(s, w, size, bold) {
  const out = [];
  for (const par of String(s ?? '').split('\n')) {
    let line = '';
    for (const word of par.split(/ +/)) {
      const t = line ? line + ' ' + word : word;
      if (pdfLarg(t, size, bold) <= w) { line = t; continue; }
      if (line) out.push(line);
      let wd = word;
      while (wd.length > 1 && pdfLarg(wd, size, bold) > w) {
        let k = wd.length - 1;
        while (k > 1 && pdfLarg(wd.slice(0, k), size, bold) > w) k--;
        out.push(wd.slice(0, k)); wd = wd.slice(k);
      }
      line = wd;
    }
    out.push(line);
  }
  return out;
}
function pdfDoc() {
  const W = 595.28, H = 841.89, M = 42, pages = [];
  const n = v => String(Math.round(v * 100) / 100);
  const d = {W, H, M, CW: W - 2 * M, y: 0, bottom: H - 66, ops: null};
  d.page = () => { d.ops = []; pages.push(d.ops); d.y = 48; };
  /* se non c'è posto per h punti si va alla pagina dopo; dice se l'ha fatto */
  d.need = h => { if (d.y + h <= d.bottom) return false; d.page(); return true; };
  /* testo con la linea di base a y, misurata dall'alto */
  d.text = (x, y, s, size = 10, o = {}) => {
    const b = pdfBytes(s); if (!b.length) return;
    const w = pdfLargB(b, size, o.bold), xx = o.align === 'right' ? x - w : x;
    d.ops.push(`${o.gray != null ? n(o.gray) + ' g ' : ''}BT /${o.bold ? 'F2' : 'F1'} ${n(size)} Tf ${n(xx)} ${n(H - y)} Td ${pdfStr(b)} Tj ET${o.gray != null ? ' 0 g' : ''}`);
  };
  d.line = (x1, y1, x2, y2, gray = 0, lw = .5) => d.ops.push(`${n(gray)} G ${n(lw)} w ${n(x1)} ${n(H - y1)} m ${n(x2)} ${n(H - y2)} l S`);
  d.rect = (x, y, w, h, gray) => d.ops.push(`${n(gray)} g ${n(x)} ${n(H - y - h)} ${n(w)} ${n(h)} re f 0 g`);
  /* paragrafo che va a capo da solo, anche da una pagina all'altra */
  d.para = (s, size = 10, o = {}) => {
    const lh = size * 1.38, x = o.x ?? M, w = o.w ?? d.CW - (x - M);
    for (const ln of pdfWrap(s, w, size, o.bold)) { d.need(lh); d.y += lh; d.text(x, d.y - lh * .3, ln, size, o); }
  };
  /* titolo di sezione con la riga sotto; non resta mai da solo in fondo alla pagina */
  d.section = t => { d.need(64); d.y += 14; d.para(t, 12, {bold: true}); d.y += 4; d.line(M, d.y, M + d.CW, d.y, .55, .8); d.y += 4; };
  /* dati a griglia: etichetta piccola sopra, valore in neretto sotto */
  d.grid = (pairs, k = 3) => {
    const cw = d.CW / k;
    for (let i = 0; i < pairs.length; i += k) {
      const row = pairs.slice(i, i + k), labs = row.map(([t]) => pdfWrap(t, cw - 14, 8)), vals = row.map(([, v]) => pdfWrap(v, cw - 14, 11, true));
      const h = Math.max(...labs.map(x => x.length)) * 10.5 + Math.max(...vals.map(x => x.length)) * 14.5 + 12;
      d.need(h);
      row.forEach((_, j) => {
        const x = M + j * cw; let yy = d.y;
        for (const ln of labs[j]) { yy += 10.5; d.text(x, yy - 2.5, ln, 8, {gray: .4}); }
        for (const ln of vals[j]) { yy += 14.5; d.text(x, yy - 3.5, ln, 11, {bold: true}); }
      });
      d.y += h;
    }
  };
  /* tabella: colonne {t, w, right}; righe {cells, indent, gray}. L'intestazione si ripete su ogni pagina nuova */
  d.table = (cols, rows, size = 9) => {
    const lh = size * 1.32, px = 4, py = 4.5;
    const cell = (lines, c, x, sz, o) => lines.forEach((ln, k) => d.text(c.right ? x + c.w - px : x + px + (o.ind || 0), d.y + py + lh * (k + 1) - lh * .3, ln, sz, {...o, align: c.right ? 'right' : 'left'}));
    const head = () => {
      const ls = cols.map(c => pdfWrap(c.t, c.w - 2 * px, size - .5, true)), h = Math.max(...ls.map(x => x.length)) * lh + 2 * py;
      d.need(h + 2 * lh + 2 * py);
      d.rect(M, d.y, d.CW, h, .92);
      let x = M; cols.forEach((c, i) => { cell(ls[i], c, x, size - .5, {bold: true, gray: .2}); x += c.w; });
      d.y += h;
    };
    head();
    for (const r of rows) {
      const ind = r.indent || 0, ls = cols.map((c, i) => pdfWrap(r.cells[i] ?? '', c.w - 2 * px - (i ? 0 : ind), size));
      const h = Math.max(...ls.map(x => x.length)) * lh + 2 * py;
      if (d.need(h)) head();
      let x = M; cols.forEach((c, i) => { cell(ls[i], c, x, size, {gray: r.gray, ind: i ? 0 : ind}); x += c.w; });
      d.y += h;
      d.line(M, d.y, M + d.CW, d.y, .78, .5);
    }
  };
  /* il file: piè di pagina su ogni pagina, poi oggetti, tabella dei riferimenti e coda */
  d.out = (title, foot) => {
    pages.forEach((ops, i) => {
      d.ops = ops;
      d.line(M, H - 46, W - M, H - 46, .8, .5);
      d.text(M, H - 31, foot, 7.5, {gray: .45});
      d.text(W - M, H - 31, `Pagina ${i + 1} di ${pages.length}`, 7.5, {gray: .45, align: 'right'});
    });
    const objs = ['', ''], add = s => objs.push(s);
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = pages.map(ops => {
      const c = ops.join('\n'), cid = add(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`);
      return add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(W)} ${n(H)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cid} 0 R >>`);
    });
    objs[0] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    const t = new Date(), p2 = v => String(v).padStart(2, '0');
    const info = add(`<< /Title ${pdfUtf16(title)} /Creator (Barista Flow) /Producer (Barista Flow) /CreationDate (D:${t.getFullYear()}${p2(t.getMonth() + 1)}${p2(t.getDate())}${p2(t.getHours())}${p2(t.getMinutes())}${p2(t.getSeconds())}) >>`);
    let s = '%PDF-1.4\n%âãÏÓ\n';
    const off = objs.map((o, i) => { const at = s.length; s += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
    const xref = s.length;
    s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Uint8Array.from(s, ch => ch.charCodeAt(0) & 255);
  };
  return d;
}

/* ---------- scheda di produzione di un lotto ----------
   Data, scadenza, quantità, operatore, allergeni, ingredienti con i lotti usati (anche quelli dei semilavorati),
   note e lo spazio per la firma: un PDF per il lotto che si sceglie, quando lo si chiede. */
function schedaProduzionePdf(id) {
  const Dd = drv(), l = Dd.prod.get(id); if (!l) return null;
  const p = l.p, u = lotUnit(l), r = l.item, c = cfg(), d = pdfDoc(), M = d.M;
  const al = algSort(p.allergeni || []), tr = algSort((p.tracce || []).filter(x => !al.includes(x)));
  d.page();
  const biz = [c.nome, c.indirizzo, c.piva ? 'P.IVA ' + c.piva : ''].filter(Boolean).join(' · ');
  if (biz) { d.para(biz, 9, {gray: .35}); d.y += 8; }
  d.para('SCHEDA DI PRODUZIONE', 9, {bold: true, gray: .45});
  d.y += 2; d.para(lotName(l), 20, {bold: true});
  d.para(`Lotto ${p.lotto}`, 13, {bold: true});
  d.y += 10; d.line(M, d.y, M + d.CW, d.y, 0, 1.2); d.y += 8;
  const kv = [['Data di produzione', fmtD(p.data)], [scadLabel(p.tipoScadenza), fmtD(l.scad)], ['Quantità prodotta', fmtQ(l.qta, u)]];
  if (p.operatore) kv.push(['Operatore', p.operatore]);
  if (r?.conservazione) kv.push(['Conservazione', r.conservazione]);
  if (r?.categoria) kv.push(['Categoria', r.categoria + (r.semilavorato ? ' (semilavorato)' : '')]);
  d.grid(kv, 3);

  d.section('Allergeni');
  d.para(al.length ? 'Contiene: ' + al.map(k => ALGN[k]).join(', ') : 'Nessuno dei 14 allergeni principali', 10.5, {bold: al.length > 0});
  if (tr.length) d.para('Può contenere tracce di: ' + tr.map(k => ALGN[k].toLowerCase()).join(', '), 10.5);

  d.section('Ingredienti e lotti utilizzati');
  let sub = false;
  const righe = (cs, dep, path) => cs.flatMap(cc => {
    const it = itemOf(cc.tipo, cc.refId), nome = (dep ? '– ' : '') + (it?.nome || cc.nome || 'Ingrediente eliminato'), q = fmtQ(+cc.qta, it ? baseOf(cc.tipo, it) : '');
    const row = (lotto, scad, prov) => ({cells: [nome, q, lotto, scad, prov], indent: dep * 12, gray: dep ? .3 : null});
    if (!cc.lotId) return [row('—', '—', 'Senza lotto registrato')];
    if (cc.tipo === 'ric') {
      const lp = Dd.prod.get(cc.lotId); if (!lp) return [row('—', '—', 'Lotto del semilavorato eliminato')];
      const own = row(lp.p.lotto, fmtD(lp.scad), `Produzione interna del ${fmtD(lp.data)}`);
      if (path.includes(cc.lotId)) return [own];
      sub = true;
      return [own, ...righe(lp.p.consumi || [], dep + 1, [...path, cc.lotId])];
    }
    const la = Dd.acq.get(cc.lotId); if (!la) return [row('—', '—', 'Documento d’acquisto eliminato')];
    return [row(la.lottoF || 'non indicato', fmtD(la.scad), [fornName(la.doc.fornitoreId), docName(la.doc), fattDi(la.doc)].filter(Boolean).join(' · '))];
  });
  const rows = righe(p.consumi || [], 0, [id]);
  if (rows.length) d.table([{t: 'Ingrediente', w: 148}, {t: 'Quantità', w: 64, right: true}, {t: 'Lotto', w: 84}, {t: 'Scadenza', w: 62}, {t: 'Provenienza', w: d.CW - 358}], rows);
  else d.para('Nessun ingrediente registrato.', 10);
  if (sub) { d.y += 4; d.para('Sotto ogni semilavorato ci sono i suoi ingredienti, con le quantità riferite all’intero lotto del semilavorato.', 8.5, {gray: .4}); }

  if (p.note) { d.section('Note'); d.para(p.note, 10); }

  d.need(80); d.y += 52;
  d.line(M, d.y, M + 220, d.y, 0, .6); d.text(M, d.y + 12, 'Firma dell’operatore', 8.5, {gray: .4});
  d.line(M + d.CW - 160, d.y, M + d.CW, d.y, 0, .6); d.text(M + d.CW - 160, d.y + 12, 'Data', 8.5, {gray: .4});
  return d.out(`Scheda di produzione ${p.lotto}`, `Barista Flow · scheda di produzione del lotto ${p.lotto} · generata il ${fmtD(today())}`);
}
