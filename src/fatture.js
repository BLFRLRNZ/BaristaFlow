/* ---------- fatture elettroniche: lettura dei file XML (anche firmati .p7m e dentro uno zip) ---------- */
const FE_TIPI = ['TD01', 'TD02', 'TD05', 'TD24', 'TD25', 'TD26'];   // fatture che portano merce; le note di credito (TD04) no
const FE = {list: [], ignored: 0};

const feNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const feNome = s => feNorm(s).replace(/\b(s r l s|s r l|srls|srl|s p a|spa|s n c|snc|s a s|sas|soc coop|societa cooperativa|societa|soc|unipersonale|di|e|c|ditta)\b/g, ' ').replace(/\s+/g, ' ').trim();
const fePiva = s => String(s || '').replace(/^[A-Za-z]{2}/, '').replace(/\s/g, '');
const feNum1 = s => (String(s || '').match(/\d+/) || [''])[0].replace(/^0+/, '');
const feRif = f => `n. ${f.numero} del ${fmtD(f.data)}`;

/* --- dai byte del file al testo XML --- */
const feCat = parts => { const o = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
function feIsXml(b) { let i = 0; if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) i = 3; while (i < b.length && [0x20, 0x09, 0x0a, 0x0d].includes(b[i])) i++; return b[i] === 0x3c; }
/* busta firmata CAdES (.p7m): si cerca il contenuto, anche spezzato in più pezzi o con lunghezze indefinite */
function feBer(b) {
  let found = null;
  const len = i => { const l = b[i]; if (l < 0x80) return [l, i + 1]; if (l === 0x80) return [-1, i + 1]; let n = l & 0x7f, v = 0; i++; while (n--) v = v * 256 + b[i++]; return [v, i]; };
  const el = i => {
    const tag = b[i++];
    if ((tag & 0x1f) === 0x1f) while (b[i++] & 0x80);
    const [l, p] = len(i), cons = tag & 0x20, octets = (tag & 0xdf) === 0x04;
    if (!cons) { if (l < 0) return b.length; const end = p + l; if (octets && !found && l > 0 && feIsXml(b.subarray(p, end))) found = b.subarray(p, end); return end; }
    const end = l < 0 ? b.length : p + l, parts = octets ? [] : null;
    let q = p;
    while (q < end && !found) {
      if (l < 0 && b[q] === 0 && b[q + 1] === 0) { q += 2; break; }
      if (parts) { const [cl, cp] = len(q + 1); parts.push(b.subarray(cp, cp + cl)); q = cp + cl; }
      else q = el(q);
    }
    if (parts && !found) { const all = feCat(parts); if (feIsXml(all)) found = all; }
    return l < 0 ? q : end;
  };
  try { el(0); } catch { /* busta non leggibile */ }
  return found;
}
function feB64(b) {
  const head = new TextDecoder('latin1').decode(b.subarray(0, 80)).trim();
  if (!/^MI[A-Za-z0-9+/]/.test(head)) return null;
  try { const s = atob(new TextDecoder('latin1').decode(b).replace(/[^A-Za-z0-9+/=]/g, '')); return Uint8Array.from(s, c => c.charCodeAt(0)); } catch { return null; }
}
function feXmlBytes(b) {
  if (feIsXml(b)) return b;
  const der = feB64(b) || b, inner = feBer(der);
  if (inner) return inner;
  const s = new TextDecoder('latin1').decode(der), i = s.search(/<\?xml|<([\w.-]+:)?FatturaElettronica[\s>]/), j = s.search(/<\/([\w.-]+:)?FatturaElettronica>/);
  return i >= 0 && j > i ? der.subarray(i, s.indexOf('>', j) + 1) : null;
}
function feText(b) {
  const enc = (new TextDecoder('latin1').decode(b.subarray(0, 200)).match(/encoding=["']([\w-]+)["']/i) || [])[1] || 'utf-8';
  try { return new TextDecoder(enc).decode(b); } catch { return new TextDecoder('utf-8').decode(b); }
}
/* zip scaricato dal portale o dal commercialista: si leggono i file dentro */
async function feUnzip(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), out = [];
  let e = b.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('zip');
  let p = dv.getUint32(e + 16, true);
  for (let k = dv.getUint16(e + 10, true); k > 0 && dv.getUint32(p, true) === 0x02014b50; k--) {
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    if (name.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(name)) continue;
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true), data = b.subarray(start, start + size);
    if (method === 0) out.push({name, bytes: data});
    else if (method === 8) out.push({name, bytes: new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())});
  }
  return out;
}

/* --- dal testo XML alla fattura --- */
const feLotto = s => (String(s || '').match(/\bLOT(?:TO)?\b\.?\s*:?\s*([A-Z0-9][A-Z0-9\-/.]{2,24})/i) || [])[1] || '';
function feData(s) {
  s = String(s || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return validIso(s.slice(0, 10)) ? s.slice(0, 10) : '';
  const m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/); if (!m) return '';
  const y = m[3].length === 2 ? '20' + m[3] : m[3], iso = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return validIso(iso) ? iso : '';
}
const feScadTxt = s => { const m = String(s || '').match(/\b(?:SCAD\w*|TMC|DA CONSUMARSI)\b\.?\s*:?\s*(?:IL\s+|ENTRO\s+)?(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i); return m ? feData(m[1]) : ''; };
function feParse(text, file) {
  const doc = new DOMParser().parseFromString(text, 'application/xml'), root = doc.documentElement;
  if (!root || doc.getElementsByTagName('parsererror').length) return {err: 'il file non è un XML leggibile'};
  const rn = root.localName;
  if (/^(FileMetadati|RicevutaConsegna|NotificaScarto|NotificaEsito|NotificaMancataConsegna|MetadatiInvioFile|AttestazioneTrasmissioneFattura)/.test(rn)) return {ignore: true};
  if (rn !== 'FatturaElettronica' && rn !== 'FatturaElettronicaSemplificata') return {err: 'non è una fattura elettronica'};
  const kids = (el, name) => el ? [...el.children].filter(c => c.localName === name) : [];
  const q = (el, path) => { let cur = el ? [el] : []; for (const n of path.split('/')) cur = cur.flatMap(x => kids(x, n)); return cur[0] || null; };
  const tx = (el, path) => (q(el, path)?.textContent || '').trim();
  const num = s => { const v = parseFloat(String(s).replace(',', '.')); return Number.isFinite(v) ? v : null; };
  const sempl = rn === 'FatturaElettronicaSemplificata';
  const ced = q(root, 'FatturaElettronicaHeader/CedentePrestatore'), an = sempl ? ced : q(ced, 'DatiAnagrafici');
  const forn = {
    nome: tx(an, 'Anagrafica/Denominazione') || tx(an, 'Denominazione') || [tx(an, 'Anagrafica/Nome') || tx(an, 'Nome'), tx(an, 'Anagrafica/Cognome') || tx(an, 'Cognome')].filter(Boolean).join(' '),
    piva: tx(an, 'IdFiscaleIVA/IdCodice'), cf: tx(an, 'CodiceFiscale'),
    sede: [tx(ced, 'Sede/Indirizzo'), tx(ced, 'Sede/NumeroCivico'), tx(ced, 'Sede/CAP'), tx(ced, 'Sede/Comune'), tx(ced, 'Sede/Provincia') ? `(${tx(ced, 'Sede/Provincia')})` : ''].filter(Boolean).join(' '),
    email: tx(ced, 'Contatti/Email'), telefono: tx(ced, 'Contatti/Telefono')
  };
  const fatture = kids(root, 'FatturaElettronicaBody').map((B, bi) => {
    const G = q(B, 'DatiGenerali/DatiGeneraliDocumento');
    const righe = sempl
      ? kids(B, 'DatiBeniServizi').map((L, i) => ({n: i + 1, codice: '', descr: tx(L, 'Descrizione'), qta: null, um: '', prezzo: null, totale: num(tx(L, 'Importo')), tipoCP: '', lotto: feLotto(tx(L, 'Descrizione')), scadenza: feScadTxt(tx(L, 'Descrizione'))}))
      : kids(q(B, 'DatiBeniServizi'), 'DettaglioLinee').map((L, i) => {
        const adg = kids(L, 'AltriDatiGestionali'), descr = tx(L, 'Descrizione');
        const lot = adg.find(x => /lott/i.test(tx(x, 'TipoDato'))), sca = adg.find(x => /scad|tmc/i.test(tx(x, 'TipoDato')));
        return {n: +tx(L, 'NumeroLinea') || i + 1, codice: tx(L, 'CodiceArticolo/CodiceValore'), descr, qta: num(tx(L, 'Quantita')), um: tx(L, 'UnitaMisura'), prezzo: num(tx(L, 'PrezzoUnitario')), totale: num(tx(L, 'PrezzoTotale')), tipoCP: tx(L, 'TipoCessionePrestazione'),
          lotto: (lot && (tx(lot, 'RiferimentoTesto') || tx(lot, 'RiferimentoNumero'))) || feLotto(descr),
          scadenza: (sca && (feData(tx(sca, 'RiferimentoData')) || feData(tx(sca, 'RiferimentoTesto')))) || feScadTxt(descr)};
      });
    return {file, part: bi, sempl, forn, tipo: tx(G, 'TipoDocumento'), numero: tx(G, 'Numero'), data: tx(G, 'Data').slice(0, 10), totale: num(tx(G, 'ImportoTotaleDocumento')),
      ddt: kids(q(B, 'DatiGenerali'), 'DatiDDT').map(d => ({numero: tx(d, 'NumeroDDT'), data: tx(d, 'DataDDT').slice(0, 10)})), righe};
  });
  return {fatture};
}
/* --- PDF delle fatture: testo letto con pdf.js (si scarica solo la prima volta che serve) --- */
let fePdfJs = null;
function fePdfLib() {
  if (!fePdfJs) fePdfJs = import(new URL('vendor/pdfjs/pdf.min.js', location.href).href)
    .then(m => { m.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.js', location.href).href; return m; })
    .catch(e => { fePdfJs = null; throw e; });
  return fePdfJs;
}
/* pezzi di testo con la loro posizione; un pezzo con due o più spazi dentro contiene più colonne e si divide */
function fePdfItems(tc) {
  const out = [];
  for (const i of tc.items) {
    const s = typeof i.str === 'string' ? i.str : '';
    if (!s.trim()) continue;
    const h = Math.hypot(i.transform[2], i.transform[3]) || Math.abs(i.transform[0]) || 8, x = i.transform[4], y = i.transform[5];
    const cw = (i.width > 0 ? i.width : s.length * h * .5) / Math.max(1, s.length), re = /\S+(?: \S+)*/g;
    const mono = tc.styles?.[i.fontName]?.fontFamily === 'monospace';
    let m; while ((m = re.exec(s))) out.push({s: m[0], x: x + m.index * cw, w: m[0].length * cw, y, h, mono});
  }
  return out;
}
/* righe ricostruite dalla posizione verticale, celle separate dagli spazi larghi */
function fePdfLines(items) {
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of items) {
    const L = lines[lines.length - 1];
    if (L && Math.abs(L.y - it.y) <= Math.max(1.5, Math.min(it.h, L.h) * .45)) L.items.push(it); else lines.push({y: it.y, h: it.h, items: [it]});
  }
  for (const L of lines) {
    L.items.sort((a, b) => a.x - b.x);
    const cells = [];
    for (const it of L.items) {
      const c = cells[cells.length - 1], gap = c ? it.x - (c.x + c.w) : 1e9;
      if (c && gap < Math.max(1.6, it.h * (it.mono ? .75 : .34))) { c.s += (gap > it.h * .08 ? ' ' : '') + it.s; c.w = Math.max(c.w, it.x + it.w - c.x); }
      else cells.push({s: it.s, x: it.x, w: it.w});
    }
    // celle di soli numeri unite da pdf.js («11,50 10» = importo e aliquota): un numero per cella, ognuno al suo posto
    L.cells = cells.map(c => ({...c, s: c.s.replace(/\s+/g, ' ').trim()})).filter(c => c.s).flatMap(c => {
      const t = c.s.split(' ');
      if (t.length < 2 || !t.every(v => /^[-+(]?[\d.,]*\d[\d.,]*\)?%?$/.test(v))) return [c];
      const cw = c.w / c.s.length; let off = 0;
      return t.map(v => { const o = {s: v, x: c.x + off * cw, w: v.length * cw}; off += v.length + 1; return o; });
    });
    L.text = L.cells.map(c => c.s).join('  ');
  }
  return lines.filter(L => L.cells.length);
}
async function fePdfPages(bytes) {
  const lib = await fePdfLib();
  const task = lib.getDocument({data: bytes.slice(), verbosity: 0, isEvalSupported: false, disableFontFace: true, useSystemFonts: false});
  const pages = [];
  try {
    const doc = await task.promise;
    for (let n = 1; n <= Math.min(doc.numPages, 12); n++) {
      const pg = await doc.getPage(n);
      pages.push({lines: fePdfLines(fePdfItems(await pg.getTextContent()))});
      pg.cleanup();
    }
  } finally { try { task.destroy(); } catch { /* già chiuso */ } }
  return pages;
}
/* numeri: «1.234,56», «56,70», «9,45000», «12.50»; il separatore dei decimali si deduce dal documento */
const feDec = text => ((text.match(/\d,\d{2}(?!\d)/g) || []).length >= (text.match(/\d\.\d{2}(?!\d)/g) || []).length ? ',' : '.');
function feNumP(s, dec) {
  const raw = String(s ?? '').replace(/€|EUR/gi, ' ').trim();
  if (/\d\s+[\d.,]*\d/.test(raw)) return null;   // due numeri, non uno solo
  let t = raw.replace(/\s/g, '');
  if (!/^[-+(]?[\d.,]*\d[\d.,]*\)?-?%?$/.test(t)) return null;
  const neg = /^-|-$|^\(/.test(t); t = t.replace(/[-+()%]/g, '');
  const c = t.lastIndexOf(','), d = t.lastIndexOf('.');
  if (c >= 0 && d >= 0) t = c > d ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (c >= 0) t = t.match(/,/g).length === 1 && (dec === ',' || !/,\d{3}$/.test(t)) ? t.replace(',', '.') : t.replace(/,/g, '');
  else if (d >= 0) t = t.match(/\./g).length === 1 && (dec === '.' || !/\.\d{3}$/.test(t)) ? t : t.replace(/\./g, '');
  const v = parseFloat(t);
  return Number.isFinite(v) ? (neg ? -v : v) : null;
}
const FE_COL = [
  ['totale', /^(prezzo\s*totale|importo(\s*(netto|riga|totale))?|tot(ale)?(\s*riga)?|valore|imponibile|netto(\s*riga)?|ammontare)\b/i],
  ['prezzo', /^(prezzo(\s*(unit(ario|\.)?|netto|cad\.?))?|p\.?\s*unit\.?|pr\.?\s*unit\.?|unitario|listino)\b/i],
  ['qta', /^(q\.?\s*t[àa]'?|quantit[àa]|qta|q\.?ty|qnt|colli|pezzi|n\.?\s*pz|quant\.?)/i],
  ['um', /^(u\.?\s*m\.?|um|unit[àa](\s*di\s*misura)?|mis\.?)$/i],
  ['sconto', /^(sconto|sconti|sc\.?|sc\.?\s*%|%\s*sc|magg)/i],
  ['iva', /^(%?\s*iva|aliq|cod\.?\s*iva|c\.?\s*iva)/i],
  ['codice', /^(cod(\.|ice)?(\s*art(icolo|\.)?)?|art\.?|articolo|rif\.?)$/i],
  ['descr', /(descri|prodotto|articolo|denominazione|merce|beni)/i]
];
const feRole = s => (FE_COL.find(([, re]) => re.test(String(s).trim())) || [])[0] || null;
const FE_STOPROW = /^(totale|riepilog|dati\s+riepilogo|imponibile|aliquota|scadenz|modalit|pagament|castelletto|esigibil|annotazioni|segue|a\s+riportare|da\s+riportare|contributo\s+conai\s+assolto|iban)/i;
const FE_CARRY = /^(segue|a\s+riportare|da\s+riportare)/i, FE_RIPORTO = /^riport(o|ato)\b/i;
const FE_DDTREF = /\bD\.?\s?D\.?\s?T\.?(?:\s+n(?:r|um)?\.?|\s+numero)?\s*[:.]?\s*([A-Z0-9][\w/-]*)\s+(?:del|data|dt\.?)\s*[:.]?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i;
function feBelow(lines, li, cell) {
  for (let k = li + 1; k < Math.min(lines.length, li + 3); k++) { const c = lines[k].cells.find(c => c.x < cell.x + cell.w + 6 && c.x + c.w > cell.x - 6); if (c) return c.s; }
  return '';
}
function feRowCheck(r) {
  const sc = r.sconto > 0 && r.sconto < 100 ? r.sconto : 0;
  if (r.qta != null && r.prezzo != null && r.totale != null) {
    const tol = Math.max(.011, Math.abs(r.totale) * .006);
    r.ok = Math.abs(r.qta * r.prezzo * (1 - sc / 100) - r.totale) <= tol || Math.abs(r.qta * r.prezzo - r.totale) <= tol;
  } else if (r.totale != null && r.qta == null) r.ok = true;
  else if (r.totale == null && r.qta != null && r.prezzo != null) { r.totale = Math.round(r.qta * r.prezzo * (1 - sc / 100) * 100) / 100; r.ok = false; }
  else r.ok = false;
  return r;
}
/* ruolo dell'intestazione e fin dove arriva l'etichetta riconosciuta («Importo IVA» → importo, fino a «Importo») */
function feRoleEnd(s) {
  const t = String(s).trim();
  for (const [r, re] of FE_COL) { const m = re.exec(t); if (m) { let e = m.index + m[0].length; while (e < t.length && /[A-Za-zÀ-ÿ0-9_]/.test(t[e])) e++; return [r, e]; } }
  return [null, 0];
}
const FE_SPLIT2 = new Set(['iva', 'um', 'qta', 'sconto']);
/* intestazioni scritte attaccate: «Importo IVA», «Q.tà UM», «UMSconto o magg.» */
function feSplitHead(cells) {
  const out = [];
  for (const c of cells) {
    const w = c.s.split(' '), cw = c.w / Math.max(1, c.s.length), [role, end] = feRoleEnd(c.s);
    let done = false;
    for (let k = 1; k < w.length && !done; k++) {
      const a = w.slice(0, k).join(' '), b = w.slice(k).join(' '), ra = feRole(a), [rb, eb] = feRoleEnd(b);
      if (!ra || !rb) continue;
      // già riconosciuta: si divide solo in due etichette intere, non «Prezzo netto», «Cod. IVA», «Descrizione articolo»
      if (role && !(end <= a.length && ra !== rb && FE_SPLIT2.has(rb) && eb >= b.replace(/[\s%€.()]+$/, '').length)) continue;
      out.push({s: a, x: c.x, w: a.length * cw}, {s: b, x: c.x + (a.length + 1) * cw, w: b.length * cw}); done = true;
    }
    if (!done && !role) for (let k = 1; k < c.s.length && !done; k++) {
      if (!/[a-zà-ü.%]/i.test(c.s[k - 1]) || !/[A-Z%]/.test(c.s[k])) continue;
      const a = c.s.slice(0, k), b = c.s.slice(k);
      if (feRole(a) && feRole(b)) { out.push({s: a, x: c.x, w: a.length * cw}, {s: b, x: c.x + a.length * cw, w: b.length * cw}); done = true; }
    }
    if (!done) out.push(c);
  }
  return out;
}
/* righe della tabella: colonne dalle intestazioni (Descrizione, Quantità, Prezzo, Importo…) */
function feHead(L) {
  const hc = feSplitHead(L.cells), roles = hc.map(c => feRole(c.s));
  if (!roles.includes('descr')) {   // «Codice | Articolo | Q.tà…»: qui «Articolo» è la descrizione
    const k = roles.lastIndexOf('codice');
    if (k >= 0 && /^articol/i.test(hc[k].s) && roles.indexOf('codice') !== k) roles[k] = 'descr';
  }
  const rs = new Set(roles.filter(Boolean));
  if (!(rs.has('descr') && (rs.has('totale') || rs.has('prezzo')) && (rs.has('qta') || rs.has('prezzo')) && rs.size >= 3)) return null;
  const cols = hc.map((c, i) => ({role: roles[i], x0: c.x, x1: c.x + c.w})).filter(c => c.role).sort((a, b) => a.x0 - b.x0);
  cols.forEach((c, i) => { c.l = i ? (cols[i - 1].x1 + c.x0) / 2 : -1e9; c.r = i < cols.length - 1 ? (c.x1 + cols[i + 1].x0) / 2 : 1e9; });
  return cols;
}
function fePdfTable(pages, dec) {
  const rows = [], ddt = [];
  let cols = null, open = false;   // open: la tabella prosegue nella pagina dopo («segue», «a riportare»)
  for (const P of pages) {
    const heads = P.lines.map(feHead);
    // pagina che continua la tabella senza ripetere le intestazioni: si tengono le colonne di prima
    const carried = !heads.some(Boolean) && !!cols && open;
    if (!carried) cols = null;
    let last = null, stop = false;
    for (const [li, L] of P.lines.entries()) {
      if (heads[li]) { cols = heads[li]; last = null; stop = false; open = true; continue; }
      if (!cols || stop) continue;
      if (FE_RIPORTO.test(L.cells[0].s)) { last = null; continue; }   // il riporto della pagina prima non è una riga
      if (FE_STOPROW.test(L.cells[0].s) || /\btotale\s+(documento|fattura|imponibile|merce)\b/i.test(L.text)) { stop = true; open = FE_CARRY.test(L.cells[0].s); continue; }
      const dm = L.text.match(FE_DDTREF);
      if (dm && L.cells.length <= 3) { ddt.push({numero: dm[1], data: feData(dm[2])}); last = null; continue; }
      const cell = {};
      for (const c of L.cells) {
        const isNum = feNumP(c.s, dec) != null, ref = isNum ? c.x + c.w / 2 : c.x + 1;
        const col = cols.find(k => ref >= k.l && ref < k.r) || cols[0];
        (cell[col.role] ||= []).push(c.s);
      }
      const get = r => (cell[r] || []).join(' ').trim();
      const numIn = r => { const xs = (cell[r] || []).map(v => feNumP(v, dec)).filter(v => v != null); return xs.length ? xs[xs.length - 1] : null; };
      const stray = ['qta', 'prezzo', 'totale', 'sconto', 'iva'].flatMap(r => (cell[r] || []).filter(v => feNumP(v, dec) == null && /^[A-Za-z]{1,4}\.?$/.test(v)));
      let q = numIn('qta'), um = get('um') || stray[0] || '';
      if (q == null && get('qta')) { const m = get('qta').match(/^([\d.,]+)\s*([A-Za-z]{1,4}\.?)$/); if (m) { q = feNumP(m[1], dec); um = um || m[2]; } }
      const pr = numIn('prezzo'), tot = numIn('totale'), sc = numIn('sconto');
      let descr = get('descr');
      if (q == null && pr != null && tot != null) {   // quantità finita in coda alla descrizione: si accetta solo se quantità × prezzo torna
        const m = descr.match(/^(.*\S)\s+(\d+(?:[.,]\d+)?)(?:\s+([A-Za-z]{1,3}\.?))?$/), v = m && feNumP(m[2], dec), k = sc > 0 && sc < 100 ? 1 - sc / 100 : 1;
        if (v > 0 && Math.abs(v * pr * k - tot) <= Math.max(.011, Math.abs(tot) * .006)) { q = v; descr = m[1]; um = um || m[3] || ''; }
      }
      if (carried && !(descr && [q, pr, tot].filter(v => v != null).length >= 2)) continue;   // in cima alla pagina: intestazioni, indirizzi, numero di pagina
      if (q == null && pr == null && tot == null) {   // riga di sola descrizione: continua quella sopra (spesso lotto e scadenza)
        if (last && descr && last.y - L.y < (L.h || 10) * 2.8) { last.descr += ' ' + descr; last.lotto ||= feLotto(descr); last.scadenza ||= feScadTxt(descr); last.y = L.y; }
        continue;
      }
      const row = feRowCheck({descr, codice: get('codice'), qta: q, um, prezzo: pr, sconto: sc, totale: tot, lotto: feLotto(descr), scadenza: feScadTxt(descr), y: L.y});
      rows.push(row); last = row;
    }
  }
  return {rows, ddt};
}
/* senza intestazioni riconoscibili: righe in cui quantità × prezzo = importo */
function fePdfLoose(pages, dec) {
  const rows = [];
  for (const P of pages) for (const L of P.lines) {
    if (L.cells.length < 3 || /totale|imponibile|\biva\b|aliquota|bollo/i.test(L.text)) continue;
    const n = L.cells.map(c => feNumP(c.s, dec));
    let hit = null;
    for (let i = 0; i < n.length && !hit; i++) if (n[i] > 0) for (let j = i + 1; j < n.length && !hit; j++) if (n[j] > 0) for (let k = j + 1; k < n.length && !hit; k++) {
      if (!(n[k] > 0)) continue;
      const sc = k > j + 1 && n[j + 1] > 0 && n[j + 1] < 100 ? n[j + 1] : 0;
      if (Math.abs(n[i] * n[j] - n[k]) <= Math.max(.011, n[k] * .006) || (sc && Math.abs(n[i] * n[j] * (1 - sc / 100) - n[k]) <= Math.max(.011, n[k] * .006))) hit = [i, j, k, sc];
    }
    if (!hit) continue;
    let [i, j, k, sc] = hit;
    if (!Number.isInteger(n[i]) && Number.isInteger(n[j])) [i, j] = [j, i];   // la quantità di solito è un numero intero
    const text = L.cells.filter((c, x) => x < Math.min(i, j) && n[x] == null);
    const um = L.cells.find((c, x) => x > 0 && x < k && n[x] == null && /^[A-Za-z]{1,4}\.?$/.test(c.s))?.s || '';
    const descr = text.filter(c => c.s !== um).map(c => c.s).join(' ');
    if (!descr) continue;
    rows.push({descr, codice: '', qta: n[i], um, prezzo: n[j], sconto: sc, totale: n[k], lotto: feLotto(descr), scadenza: feScadTxt(descr), ok: true});
  }
  return rows;
}
/* intestazione: fornitore e partita IVA, numero, data, totali, DDT citati */
function fePdfHead(pages, dec) {
  const all = pages.flatMap(p => p.lines), first = pages[0]?.lines || [], text = all.map(l => l.text).join('\n'), own = fePiva(cfg().piva);
  const pv = [];
  for (const L of all) for (const m of L.text.matchAll(/(?:P\.?\s?IVA|PARTITA\s+IVA|P\.\s?I\.|VAT(?:\s+NO\.?)?|AI\s+FINI\s+IVA|C\.?F\.?\s*(?:E|\/)\s*P\.?\s?IVA)[^0-9A-Z]{0,14}(?:IT\s?)?(\d{11})\b/gi)) pv.push(m[1]);
  if (!pv.length) for (const m of text.matchAll(/\bIT\s?(\d{11})\b/g)) pv.push(m[1]);
  const piva = pv.find(v => v !== own) || '';
  let nome = (all.find(L => /^denominazione\s*:/i.test(L.text))?.text || '').replace(/^denominazione\s*:\s*/i, '').split('  ')[0];
  if (!nome) {
    const legal = /\b(S\.?\s?R\.?\s?L\.?\s?S?|S\.?\s?P\.?\s?A\.?|S\.?\s?N\.?\s?C\.?|S\.?\s?A\.?\s?S\.?|SOC\.?\s+COOP|&\s*C\.?|DITTA)(\b|$)/i;
    const skip = /fattura|documento|pagina|^data|numero|cliente|spett|destinat|cessionario|committente|\bvia\b|viale|piazza|corso|tel\.?|fax|e-?mail|pec|www\.|http|iban|\bcap\b|c\.f\.|p\.?\s?iva|codice|partita/i;
    const top = first.slice(0, 30).filter(L => /[A-Za-z]{3}/.test(L.cells[0].s) && !skip.test(L.cells[0].s));
    nome = (top.find(L => legal.test(L.cells[0].s)) || top[0])?.cells[0].s || '';
  }
  let numero = '', data = '';
  for (const L of all) {
    const m = L.text.match(/\b(?:fattura(?:\s+(?:accompagnatoria|differita|immediata|elettronica))?|ft\.?|nota\s+di\s+credito|documento)\b[^\n]{0,25}?\b(?:numero|num\.?|nr\.?|n°|no\.|n\.?)(?=[\s:.°\d])\s*[:.]?\s*([A-Z0-9][A-Z0-9/\-.]{0,20})/i);
    if (m && /\d/.test(m[1]) && !FE_DDTREF.test(L.text)) {
      numero = m[1].replace(/[.,-]+$/, '');
      const d = L.text.slice(m.index).match(/\b(?:del|data)\s*[:.]?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i); if (d) data = feData(d[1]);
      break;
    }
  }
  if (!numero || !data) all.forEach((L, li) => {
    const cn = L.cells.find(c => /^(numero(\s+(documento|fattura|doc\.?))?|n\.?\s*(documento|doc\.?|fattura)|nr\.?\s*doc\.?)$/i.test(c.s));
    const cd = L.cells.find(c => /^data(\s+(documento|fattura|doc\.?))?$/i.test(c.s));
    if (cn && !numero) numero = feBelow(all, li, cn);
    if (cd && !data) data = feData(feBelow(all, li, cd));
  });
  if (!data) { const d = text.match(/\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})\b/); if (d) data = feData(d[1]); }
  const amount = re => {
    for (const [li, L] of all.entries()) {
      const m = L.text.match(re); if (!m) continue;
      const next = L.text.slice(m.index + m[0].length).split(/\s+/).filter(Boolean);
      const v = next.length && next[0] !== '' ? feNumP(next[0] === '€' || /^eur/i.test(next[0]) ? next[1] : next[0], dec) : null;
      if (v != null) return v;
      let at = 0; const ci = L.cells.findIndex(c => (at += c.s.length + 2) > m.index);
      const b = feNumP(feBelow(all, li, L.cells[Math.max(0, ci)]), dec); if (b != null) return b;
    }
    return null;
  };
  const totale = amount(/totale\s*(documento|fattura|da\s+pagare|a\s+pagare|generale)\s*:?|^totale\s*(€|euro)?\s*:?(?=\s*[-\d€]|\s*$)|netto\s+a\s+pagare\s*:?/i);
  const imponibile = amount(/totale\s+imponibile\s*:?|^imponibile(\s+totale)?\s*:?|^totale\s+merce\s*:?|imponibile\s+complessivo\s*:?/i);
  const tipo = /nota\s+di\s+credito/i.test(text) ? 'TD04' : /fattura\s+differita|\bTD24\b/i.test(text) ? 'TD24' : /fattura|\bTD0?1\b/i.test(text) ? 'TD01' : /documento\s+di\s+trasporto|\bD\.?D\.?T\.?\b/i.test(text) ? 'DDT' : 'TD01';
  const ddt = [];
  for (const L of all) { const m = L.text.match(FE_DDTREF); if (m && !ddt.some(x => x.numero === m[1])) ddt.push({numero: m[1], data: feData(m[2])}); }
  return {nome, piva, numero, data, totale, imponibile, tipo, ddt};
}
async function fePdf(name, bytes) {
  let pages;
  try { pages = await fePdfPages(bytes); }
  catch (e) {
    if (e?.name === 'PasswordException') return {err: 'il PDF è protetto da password'};
    if (!fePdfJs && /import|module|fetch|load|worker/i.test(String(e?.message || e))) return {err: 'il lettore di PDF non si è caricato: riprova con la connessione attiva'};
    return {err: 'il PDF non si apre'};
  }
  const lines = pages.flatMap(p => p.lines);
  if (lines.length < 4) return {err: 'è una scansione senza testo: registrala a mano o usa l’XML'};
  const text = lines.map(l => l.text).join('\n'), dec = feDec(text), head = fePdfHead(pages, dec), tab = fePdfTable(pages, dec);
  const rows = tab.rows.length ? tab.rows : fePdfLoose(pages, dec);
  const somma = Math.round(rows.reduce((s, r) => s + (r.totale || 0), 0) * 100) / 100;
  const quadra = head.imponibile != null ? Math.abs(somma - head.imponibile) < .02 : null;
  const ddt = [...head.ddt]; for (const d of tab.ddt) if (!ddt.some(x => x.numero === d.numero)) ddt.push(d);
  return {fatture: [{file: name, part: 0, pdf: true, sempl: false, forn: {nome: head.nome.slice(0, 80), piva: head.piva, cf: '', sede: '', email: '', telefono: ''},
    tipo: head.tipo, numero: head.numero, data: head.data, totale: head.totale, imponibile: head.imponibile, somma, quadra, ddt,
    righe: rows.map((r, i) => ({n: i + 1, codice: r.codice || '', descr: r.descr || '', qta: r.qta, um: r.um || '', prezzo: r.prezzo, totale: r.totale, tipoCP: '', lotto: r.lotto || '', scadenza: r.scadenza || '', ok: !!r.ok})),
    testo: lines.slice(0, 300).map(l => l.text)}]};
}
async function feRead(files) {
  const out = [], seen = new Map(FE.list.map(e => [e.key, e]));
  let ignored = 0;
  const one = async (name, bytes, depth) => {
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4) {
      if (depth) { ignored++; return; }
      let entries; try { entries = await feUnzip(bytes); } catch { out.push({key: 'err:' + name, file: name, err: 'questo zip non si apre: estrai i file e caricali uno per uno'}); return; }
      for (const x of entries) await one(x.name.split('/').pop(), x.bytes, depth + 1);
      return;
    }
    const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
    const xb = isPdf ? null : feXmlBytes(bytes);
    if (!isPdf && !xb) { if (depth) ignored++; else out.push({key: 'err:' + name, file: name, err: 'non contiene una fattura elettronica'}); return; }
    const r = isPdf ? await fePdf(name, bytes) : feParse(feText(xb), name);
    if (r.ignore) { ignored++; return; }
    if (r.err) { out.push({key: 'err:' + name, file: name, err: r.err}); return; }
    for (const f of r.fatture) {
      const key = [fePiva(f.forn.piva) || feNome(f.forn.nome), f.numero, f.data].join('|');
      const ex = seen.get(key);
      if (ex) { if (ex.f?.pdf && !f.pdf && !ex.done) Object.assign(ex, {file: name, f}); continue; }
      const e = {key, file: name, f}; seen.set(key, e); out.push(e);
    }
  };
  for (const file of files) {
    let bytes; try { bytes = new Uint8Array(await file.arrayBuffer()); } catch { out.push({key: 'err:' + file.name, file: file.name, err: 'file non leggibile'}); continue; }
    await one(file.name, bytes, 0);
  }
  return {out, ignored};
}

/* --- abbinamenti: fornitore, articoli, unità --- */
function feFornOf(f) {
  const pv = fePiva(f.forn.piva), nm = feNome(f.forn.nome), fs = [...S.data.fornitori.values()];
  return (pv && fs.find(x => fePiva(x.piva) === pv)?.id) || (nm && fs.find(x => feNome(x.nome) === nm)?.id) || null;
}
const feKey = r => r.codice ? 'c:' + feNorm(r.codice) : 'd:' + feNorm(String(r.descr || '').replace(/\b(LOT(TO)?|SCAD\w*|TMC|DDT)\b[\s:.]*[\w/.-]*/gi, ' ')).slice(0, 90);
const FE_STOP = new Set(['per', 'con', 'del', 'della', 'delle', 'dei', 'allo', 'alla', 'alle', 'agli', 'nel', 'nella', 'senza', 'tipo']);
function feGuessArt(descr, fid) {
  const words = feNorm(descr).split(' ').filter(w => w.length > 2);
  let best = null, score = 0, tie = false;
  for (const a of S.data.articoli.values()) {
    if (a.archiviato) continue;
    const aw = feNorm(a.nome).split(' ').filter(w => w.length > 2 && !FE_STOP.has(w));
    if (!aw.length || !aw.every(w => words.some(x => x === w || (w.length > 4 && x.length > 4 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))))) continue;
    const sc = aw.length * 10 + (a.fornitoreId && a.fornitoreId === fid ? 5 : 0);
    if (sc > score) { best = a; score = sc; tie = false; } else if (sc === score) tie = true;
  }
  return tie ? null : best;
}
function feUm(um) {
  const u = String(um || '').trim().toUpperCase().replace(/\./g, '');
  if (/^(KG|KGM|KGS|KILO|KILI|CHILI|CHILOGRAMMI?)$/.test(u)) return 'kg';
  if (/^(G|GR|GRM|GRAMMI)$/.test(u)) return 'g';
  if (/^(L|LT|LTR|LTN|LITRI|LITRO)$/.test(u)) return 'l';
  if (u === 'ML') return 'ml'; if (u === 'CL') return 'cl';
  if (/^(PZ|PEZZI|PEZZO|NR|N|NUM|NUMERO|PC|PCS|UN|U|UNITA|CAD|CADAUNO|BT|BOTT|BOTTIGLIE|BOTTIGLIA|LATTINE|LATTINA)$/.test(u)) return 'pz';
  return u ? 'conf' : '';
}
function fePack(descr) {   // es. «CT 6X0,5LT», «BURRO 1KG», «ACQUA 0,5L CT 24»
  const s = String(descr || '').toUpperCase().replace(/(\d),(\d)/g, '$1.$2'), U = '(KG|GRAMMI|GR|G|LITRI|LT|L|CL|ML)\\b';
  let m = s.match(new RegExp(`(\\d+)\\s*[X×*]\\s*(\\d+(?:\\.\\d+)?)\\s*${U}`));
  if (m) return {n: +m[1], size: +m[2], u: m[3]};
  m = s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${U}\\s*[X×*]\\s*(\\d+)\\b`));
  if (m) return {n: +m[3], size: +m[1], u: m[2]};
  m = s.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${U}`));
  const n = (s.match(/\b(?:X|CT|CF|CONF|CRT|PZ|PEZZI)\.?\s*(\d+)\b/) || s.match(/\b(\d+)\s*(?:PZ|PEZZI|BOTTIGLIE|BT|LATTINE)\b/) || [])[1];
  if (m) return {n: n ? +n : 1, size: +m[1], u: m[2]};
  return n ? {n: +n, size: null, u: null} : null;
}
const FE_SIZE = {KG: [1, 'kg'], GRAMMI: [.001, 'kg'], GR: [.001, 'kg'], G: [.001, 'kg'], LITRI: [1, 'l'], LT: [1, 'l'], L: [1, 'l'], CL: [.01, 'l'], ML: [.001, 'l']};
/* quante unità di giacenza (kg, l, pz) per un'unità della fattura */
function feFactor(r, a) {
  const um = feUm(r.um), p = fePack(r.descr), base = a.unita;
  if (base === 'kg' && um === 'kg') return 1;
  if (base === 'kg' && um === 'g') return .001;
  if (base === 'l' && um === 'l') return 1;
  if (base === 'l' && (um === 'ml' || um === 'cl')) return um === 'ml' ? .001 : .01;
  if (base === 'pz' && um === 'pz') return 1;
  if (p) {
    if (base === 'pz') return p.n > 1 ? p.n : 1;
    const [k, u] = p.size != null ? FE_SIZE[p.u] || [] : [];
    if (u === base) return r6(p.n * p.size * k);
  }
  return 1;
}
/* per ogni riga: articolo, fattore, da saltare; «sicuro» quando viene da un abbinamento già confermato */
function feMatch(f, fid) {
  const ab = (fid && S.data.fornitori.get(fid)?.abbinamenti) || {};
  return f.righe.map(r => {
    const key = feKey(r), m = ab[key];
    if (m?.skip) return {key, skip: true, sure: true};
    if (m && S.data.articoli.has(m.a)) return {key, a: m.a, f: +m.f > 0 ? +m.f : 1, sure: r.qta > 0};
    if (['SC', 'PR', 'AB', 'AC'].includes(r.tipoCP) || (!f.sempl && !(r.qta > 0))) return {key, skip: true, sure: true};
    const g = feGuessArt(r.descr, fid);
    return g ? {key, a: g.id, f: feFactor(r, g), sure: false, guess: true} : {key, a: '', f: 1, sure: false};
  });
}
function feDdtDocs(f, fid) {
  if (!fid || !f.ddt.length) return [];
  return [...S.data.documenti.values()].filter(d => d.tipo === 'ddt' && d.fornitoreId === fid && f.ddt.some(x => feNum1(x.numero) === feNum1(d.numero) && (!x.data || x.data === d.data)));
}
function feDup(f, fid) {
  if (!fid) return false;
  return [...S.data.documenti.values()].some(d => d.fornitoreId === fid && ((d.tipo === 'fattura' && d.data === f.data && (String(d.numero).trim() === String(f.numero).trim() || feNum1(d.numero) === feNum1(f.numero))) || (d.tipo === 'ddt' && d.fatturaRif === feRif(f))));
}
/* fattura differita: i DDT citati che nell'app non ci sono */
const feDdtMancanti = (f, ddts) => f.ddt.filter(x => !ddts.some(d => feNum1(x.numero) === feNum1(d.numero) && (!x.data || x.data === d.data)));
const feDdtTxt = xs => xs.map(x => `n. ${x.numero}${x.data ? ' del ' + fmtD(x.data) : ''}`).join(', ');
/* per ogni riga (articolo e quantità in unità di giacenza): quanto è già in magazzino con i DDT registrati e quanto manca.
   I DDT si contano per articolo e si consumano riga dopo riga, così due righe dello stesso articolo non contano due volte lo stesso DDT. */
function feCopri(ddts, items) {
  const pool = new Map();
  for (const d of ddts) for (const r of d.righe || []) pool.set(r.articoloId, r6((pool.get(r.articoloId) || 0) + (+r.qta || 0)));
  return items.map(u => {
    if (!u || !(u.q > 0)) return {gia: 0, resto: 0};
    const have = pool.get(u.a) || 0, gia = r6(Math.min(u.q, have));
    pool.set(u.a, r6(have - gia));
    return {gia, resto: r6(u.q - gia)};
  });
}
function feStatus(e) {
  if (e.err) return {k: 'err', txt: e.err[0].toUpperCase() + e.err.slice(1)};
  if (e.done) return {k: 'done', txt: 'Importata'};
  if (e.scartata) return {k: 'skip', txt: 'Non importata'};
  const f = e.f;
  if (f.tipo === 'TD04') return {k: 'skip', txt: 'Nota di credito: non si carica'};
  if (f.tipo === 'DDT') return {k: 'skip', txt: 'Sembra un DDT, non una fattura: registralo come DDT'};
  if (f.pdf && !f.righe.length) return {k: 'err', txt: 'Righe non riconosciute nel PDF: registrala a mano'};
  if (!FE_TIPI.includes(f.tipo)) return {k: 'skip', txt: `Documento ${f.tipo || 'senza tipo'}: non si carica`};
  const fid = feFornOf(f);
  if (feDup(f, fid)) return {k: 'dup', txt: 'Già importata'};
  if (!fid) return {k: 'check', txt: 'Fornitore nuovo'};
  const m = feMatch(f, fid);
  if (m.every(x => x.skip)) return {k: 'check', txt: 'Nessuna riga di merce riconosciuta'};
  if (f.pdf && (!f.numero || !f.data)) return {k: 'check', txt: 'Da controllare: numero o data'};
  if (f.pdf && (f.quadra !== true || f.righe.some((r, i) => !m[i].skip && !r.ok))) return {k: 'check', txt: 'Da controllare: importi letti dal PDF'};
  // differita con solo una parte dei DDT nell'app: va guardata prima di caricare la merce che manca
  const dd = f.ddt.length ? feDdtDocs(f, fid) : [], manca = dd.length ? feDdtMancanti(f, dd).length : 0;
  if (manca) return {k: 'check', txt: `Da controllare: ${manca === 1 ? '1 DDT non registrato' : manca + ' DDT non registrati'}`};
  const n = m.filter(x => !x.sure).length;
  return n ? {k: 'check', txt: `Da controllare: ${n === 1 ? '1 riga' : n + ' righe'}`} : {k: 'ready', txt: 'Pronta'};
}

/* --- salvataggio --- */
async function feSave(e, fid, solo, lines, carica = false) {
  // lines: per riga {skip} oppure {a, f, q, lotto, scadenza}
  // solo: la merce dei DDT registrati è già in magazzino; carica: la merce che quei DDT non coprono entra con questa fattura
  const f = e.f, newF = !fid;
  if (newF) {
    fid = uid();
    if (!(await put('fornitori', fid, {nome: (f.forn.nome || 'Fornitore').slice(0, 80), piva: fePiva(f.forn.piva) || f.forn.cf || '', telefono: f.forn.telefono || '', email: f.forn.email || '', note: f.forn.sede ? `Sede: ${f.forn.sede}` : '', abbinamenti: {}, creato: Date.now()}))) return false;
  }
  const used = f.righe.map((r, i) => ({r, x: lines[i]})).filter(({x}) => !x.skip).map(({r, x}) => {
    const tot = x.imp != null ? x.imp : r.totale, qta = r6(x.q * x.f), imp = tot != null ? Math.round(tot * 100) / 100 : null;
    return {a: x.a, qta, imp, pu: imp != null && qta > 0 ? imp / qta : null, lotto: x.lotto, scadenza: x.scadenza};
  });
  // fattura differita con i DDT già registrati: si completano i loro prezzi, la merce non si carica di nuovo
  const ddts = solo ? feDdtDocs(f, fid) : [];
  for (const d of ddts) {
    const righe = (d.righe || []).map(r => { if (r.importo != null && r.importo !== '') return r; const s = used.find(u => u.a === r.articoloId && u.pu != null); return s ? {...r, importo: Math.round(s.pu * r.qta * 100) / 100} : r; });
    if (!(await put('documenti', d.id, {...strip(d), righe, fatturaRif: d.fatturaRif || feRif(f)}, true))) return false;
  }
  // della differita resta solo la merce che i DDT registrati non hanno già portato in magazzino
  const cv = solo ? feCopri(ddts, used.map(u => ({a: u.a, q: u.qta}))) : null;
  const keep = solo ? used.map((u, i) => cv[i].resto > EPS ? {...u, qta: cv[i].resto, imp: u.pu != null ? Math.round(u.pu * cv[i].resto * 100) / 100 : u.imp} : null).filter(Boolean) : used;
  const prezzi = solo && !carica, manca = solo ? feDdtMancanti(f, ddts) : [];   // senza «carica»: solo storico prezzi, come una volta
  if (keep.length) {
    const righe = keep.map(u => ({id: uid(), articoloId: u.a, qta: u.qta, importo: u.imp, lotto: prezzi ? '' : String(u.lotto || '').trim(), scadenza: prezzi ? '' : u.scadenza || ''}));
    const note = [`Importata dalla fattura elettronica ${f.file}.`, f.ddt.length ? `DDT: ${feDdtTxt(f.ddt)}.` : '',
      solo && !prezzi && manca.length ? `Qui c’è la merce ${manca.length === 1 ? 'del DDT' : 'dei DDT'} ${feDdtTxt(manca)}, ${manca.length === 1 ? 'che non era registrato' : 'che non erano registrati'} nell’app.` : ''].filter(Boolean).join(' ');
    if (!(await put('documenti', uid(), {tipo: 'fattura', numero: f.numero, data: f.data, fornitoreId: fid, fatturaRif: '', soloPrezzi: prezzi, note, allegati: [], righe, creato: Date.now()}))) return false;
  }
  // il fornitore ricorda gli abbinamenti e la partita IVA per la prossima volta
  const F = S.data.fornitori.get(fid);
  if (F) {
    const ab = {...(F.abbinamenti || {})};
    f.righe.forEach((r, i) => { const x = lines[i]; ab[feKey(r)] = x.skip ? {skip: true} : {a: x.a, f: x.f}; });
    await put('fornitori', fid, {...strip(F), piva: F.piva || fePiva(f.forn.piva) || '', abbinamenti: ab}, true);
  }
  for (const id of e.nuovi || []) { const a = S.data.articoli.get(id); if (a && !a.fornitoreId) await put('articoli', id, {...strip(a), fornitoreId: fid}, true); }
  e.done = true;
  if (e.posta) await fePostaClose();
  return true;
}

/* --- fogli: elenco delle fatture lette e controllo di una fattura --- */
function sheetFatture() {
  if (!guard()) return;
  FE.list = []; FE.ignored = 0;
  const o = {title: 'Importa fatture', busy: false, live: true, fe: true,
    body: () => {
      const rows = FE.list.map((e, i) => {
        const s = feStatus(e), f = e.f;
        const tone = {ready: 'good', done: 'good', check: 'amb', err: 'red'}[s.k] || '';
        const title = f ? (f.numero ? `Fattura n. ${f.numero}${f.data ? ' del ' + fmtD(f.data) : ''}` : e.file) : e.file;
        const sub = f ? `${f.pdf ? 'PDF · ' : ''}${f.forn.nome || 'Fornitore'} · ${f.righe.length === 1 ? '1 riga' : f.righe.length + ' righe'}${f.totale != null ? ' · ' + EUR(f.totale) : ''}` : 'File non importato';
        const open = f && !['done', 'dup', 'skip'].includes(s.k);
        return `<${open ? 'button type="button"' : 'div'} class="row${open ? '' : ' static'}" ${open ? `data-act="fe-open" data-i="${i}"` : ''}>${av(s.k === 'done' || s.k === 'ready' ? IC.check : s.k === 'err' ? IC.alert : IC.receipt, tone)}<span class="m"><b>${esc(title)}</b><span>${esc(sub)}</span><span class="mc"><span class="chip ${tone}">${esc(s.txt)}</span></span></span></${open ? 'button' : 'div'}>`;
      }).join('');
      return `${postaBar()}<p class="muted">Carica le fatture dei fornitori. Gli XML delle fatture elettroniche, anche firmati (.p7m) o tanti insieme in uno .zip, si leggono in modo esatto. Dei PDF l'app legge il testo e ti propone righe e importi da controllare; le foto e le scansioni invece non si possono leggere.</p>
        ${countSample() ? '<p class="note warn">' + IC.info + '<span>Stai usando i dati di esempio: anche le fatture che importi ora vengono cancellate quando registri il bar.</span></p>' : ''}
        <p><label class="btn ${FE.list.length ? '' : 'pri'}">${IC.plus}${FE.list.length ? 'Aggiungi altri file' : 'Scegli i file'}<input type="file" accept=".xml,.p7m,.zip,.pdf,application/xml,text/xml,application/zip,application/pkcs7-mime,application/pdf" multiple data-file="fe"></label></p>
        ${o.busy === 'posta' ? '<p class="hint">Scarico le fatture arrivate dalla posta…</p>' : o.busy ? '<p class="hint">Leggo i file…</p>' : ''}
        ${FE.list.length ? `<div class="list">${rows}</div>` : ''}
        ${FE.ignored ? `<p class="hint" style="margin-top:10px">${FE.ignored === 1 ? 'Un file' : FE.ignored + ' file'} senza fattura (ricevute e metadati del Sistema di Interscambio) ${FE.ignored === 1 ? 'è stato saltato' : 'sono stati saltati'}.</p>` : ''}
        ${FE.list.some(e => e.f && feStatus(e).k === 'check') ? '<p class="hint" style="margin-top:10px">Tocca le fatture da controllare: la prima volta abbini le righe ai tuoi articoli, poi l’app se lo ricorda per quel fornitore.</p>' : ''}`;
    },
    foot: () => { const n = FE.list.filter(e => e.f && feStatus(e).k === 'ready').length; return n ? `<button type="button" class="btn pri" data-act="fe-all">Importa ${n === 1 ? 'la fattura pronta' : `le ${n} fatture pronte`}</button>` : ''; }};
  openSheet(o);
  if (postaCoda().length) fePostaLoad(o);
}
async function feAddFiles(o, files) {
  if (o.busy) { toast('Aspetta un attimo: sto ancora leggendo le fatture.'); return; }
  o.busy = true; paintSheet(o);
  try { const {out, ignored} = await feRead(files); FE.list.push(...out); FE.ignored += ignored; }
  catch { toast('Non sono riuscito a leggere i file.', true); }
  o.busy = false;
  if (stack.includes(o)) paintSheet(o);
}
async function feAll() {
  if (!guard()) return;
  const ready = FE.list.filter(e => e.f && feStatus(e).k === 'ready');
  let ok = 0;
  for (const e of ready) {
    const fid = feFornOf(e.f), m = feMatch(e.f, fid);
    const lines = m.map((x, i) => x.skip ? {skip: true} : {a: x.a, f: x.f, q: e.f.righe[i].qta, lotto: e.f.righe[i].lotto, scadenza: e.f.righe[i].scadenza});
    if (await feSave(e, fid, feDdtDocs(e.f, fid).length > 0, lines)) ok++;
  }
  refreshSheets();
  toast(ok === ready.length ? (ok === 1 ? 'Fattura importata' : `${ok} fatture importate`) : `Importate ${ok} fatture su ${ready.length}.`, ok < ready.length);
}
function sheetFattura(e) {
  const f = e.f, fid0 = feFornOf(f), pdf = !!f.pdf;
  const st = {forn: fid0 || '__new', solo: false, carica: true, numero: f.numero || '', data: f.data || '', fnome: f.forn.nome || '', fpiva: fePiva(f.forn.piva) || '', righe: []};
  const fill = () => {
    const fid = st.forn === '__new' ? null : st.forn, m = feMatch(f, fid);
    st.solo = feDdtDocs(f, fid).length > 0; st.carica = true;
    st.righe = f.righe.map((r, i) => ({a: m[i].skip ? '__skip' : m[i].a || '', fat: fmtIn(m[i].f || 1), q: r.qta > 0 ? fmtIn(r.qta) : '', imp: r.totale != null ? fmtIn(r.totale) : '', lotto: r.lotto || '', scad: r.scadenza || '', guess: !!m[i].guess}));
  };
  fill();
  const unitTxt = r => r.um ? esc(r.um) : 'unità';
  const totOf = i => pdf ? (String(st.righe[i].imp).trim() ? pnum(st.righe[i].imp) : null) : f.righe[i].totale;
  const fidOf = () => st.forn === '__new' ? null : st.forn;
  // differita: DDT registrati, DDT che mancano, e per ogni riga quanta merce c'è già e quanta manca
  const ddtsOf = () => st.solo ? feDdtDocs(f, fidOf()) : [];
  const mancaOf = () => { const dd = ddtsOf(); return dd.length ? feDdtMancanti(f, dd) : []; };
  const carica = () => st.solo && st.carica && mancaOf().length > 0;
  const copri = () => feCopri(ddtsOf(), st.righe.map(x => S.data.articoli.has(x.a) ? {a: x.a, q: r6(pnum(x.q) * pnum(x.fat))} : null));
  const conLotti = (i, cv) => !st.solo || (carica() && cv[i].resto > EPS);
  const hint = (i, cv = copri()) => {
    const x = st.righe[i], a = S.data.articoli.get(x.a), tot = totOf(i);
    if (!a) return '';
    const q = r6(pnum(x.q) * pnum(x.fat));
    if (!(q > 0)) return 'Indica quantità e conversione.';
    const pz = tot != null && tot >= 0 ? ` · ${EUR(tot / q)} ${a.unita === 'pz' ? 'al pezzo' : 'al ' + a.unita}` : '';
    if (!st.solo) return `In magazzino: ${fmtQ(q, a.unita)}${pz}`;
    const c = cv[i];
    if (c.resto <= EPS) return `Già in magazzino con i DDT: ${fmtQ(c.gia, a.unita)}${pz}`;
    return `${c.gia > EPS ? `Con i DDT: ${fmtQ(c.gia, a.unita)} · ` : ''}${carica() ? 'Da caricare' : 'Solo storico prezzi'}: ${fmtQ(c.resto, a.unita)}${pz}`;
  };
  const aggiorna = () => {   // mentre si scrive: suggerimenti e campi del lotto di ogni riga, senza ridisegnare il foglio
    const cv = copri();
    st.righe.forEach((x, i) => {
      const h = document.getElementById('fe-h-' + i); if (h) h.textContent = hint(i, cv);
      const l = document.getElementById('fe-l-' + i); if (l) l.hidden = !conLotti(i, cv);
    });
  };
  const sumTxt = () => {
    const s = Math.round(f.righe.reduce((t, r, i) => t + (st.righe[i].a === '__skip' && !pdf ? 0 : totOf(i) || 0), 0) * 100) / 100;
    const ref = f.imponibile;
    return ref == null ? `Somma delle righe: ${EUR(s)}. Imponibile non trovato nel PDF: confrontala con la fattura.` : Math.abs(s - ref) < .02 ? `Somma delle righe ${EUR(s)}: torna con l'imponibile della fattura.` : `Somma delle righe ${EUR(s)}, imponibile in fattura ${EUR(ref)}: controlla gli importi.`;
  };
  const lineHTML = (r, i, cv) => {
    const x = st.righe[i], a = S.data.articoli.get(x.a);
    return `<div class="card fe-line"><p class="fe-d"><b>${esc(r.descr || 'Riga ' + r.n)}</b></p>
      <p class="muted fe-q">${r.qta != null ? `${esc(fmtIn(r.qta))} ${unitTxt(r)}` : 'Quantità non indicata'}${r.prezzo != null ? ` × ${EUR(r.prezzo)}` : ''}${r.totale != null ? ` = <b>${EUR(r.totale)}</b>` : ''}${r.codice ? ` · cod. ${esc(r.codice)}` : ''}${pdf && !r.ok && x.a !== '__skip' ? ' <span class="chip amb">Quantità × prezzo non torna</span>' : ''}</p>
      <label class="fld"><span>Articolo${x.guess && x.a ? ' <span class="chip amb">Proposto: controlla</span>' : ''}</span><select data-k="righe.${i}.a"><option value="__skip" ${x.a === '__skip' ? 'selected' : ''}>Non è merce: non caricare</option><option value="" ${x.a === '' ? 'selected' : ''}>Scegli l'articolo…</option>${artOptions(x.a)}<option value="__new">+ Nuovo articolo…</option></select></label>
      ${a ? `<div class="${pdf ? 'g3' : 'g2'}"><label class="fld"><span>Quantità in fattura</span><input type="text" inputmode="decimal" data-k="righe.${i}.q" value="${esc(x.q)}" placeholder="0" autocomplete="off"></label>
      <label class="fld"><span>1 ${unitTxt(r)} = quanti ${a.unita === 'pz' ? 'pezzi' : a.unita}</span><input type="text" inputmode="decimal" data-k="righe.${i}.fat" value="${esc(x.fat)}" autocomplete="off"></label>
      ${pdf ? `<label class="fld"><span>Importo € senza IVA</span><input type="text" inputmode="decimal" data-k="righe.${i}.imp" value="${esc(x.imp)}" placeholder="0,00" autocomplete="off"></label>` : ''}</div>
      <p class="hint fe-h" id="fe-h-${i}">${esc(hint(i, cv))}</p>
      <div id="fe-l-${i}" ${conLotti(i, cv) ? '' : 'hidden'}><div class="g2"><label class="fld"><span>Lotto del fornitore</span><input type="text" data-k="righe.${i}.lotto" value="${esc(x.lotto)}" placeholder="Come sulla confezione" autocomplete="off"></label>
      <label class="fld"><span>Scadenza</span><input type="date" data-k="righe.${i}.scad" value="${esc(x.scad)}"></label></div>
      ${claudeRiga(st, i, {lot: `righe.${i}.lotto`, scad: `righe.${i}.scad`, art: `righe.${i}.a`, forn: 'forn'})}</div>` : ''}</div>`;
  };
  const o = {form: true, st, title: () => `Fattura${st.numero ? ' n. ' + st.numero : ''}${pdf ? ' (PDF)' : ''}`,
    body: () => {
      const fid = st.forn === '__new' ? null : st.forn, ddts = feDdtDocs(f, fid), man = ddts.length ? feDdtMancanti(f, ddts) : [], cv = copri();
      return `${pdf ? `<p class="note">${IC.info}<span>Letta dal PDF: controlla numero, data e importi prima di importare. Dall'XML la lettura è esatta.</span></p>
          <div class="g2"><label class="fld"><span>Numero della fattura</span><input type="text" data-k="numero" value="${esc(st.numero)}" autocomplete="off"></label>
          <label class="fld"><span>Data</span><input type="date" data-k="data" value="${esc(st.data)}"></label></div>`
        : `<p class="muted">${esc(f.forn.nome || 'Fornitore')}${f.forn.piva ? ' · P.IVA ' + esc(fePiva(f.forn.piva)) : ''} · ${fmtD(f.data)}${f.totale != null ? ' · totale ' + EUR(f.totale) : ''}</p>`}
        <label class="fld"><span>Fornitore</span><select data-k="forn"><option value="__new" ${st.forn === '__new' ? 'selected' : ''}>+ Crea «${esc(st.fnome || 'Fornitore')}»</option>${fornOpts(st.forn === '__new' ? '' : st.forn)}</select>${!fid0 ? '<small class="hint">Non l’ho trovato fra i tuoi fornitori: se c’è con un altro nome, sceglilo qui.</small>' : ''}</label>
        ${pdf && st.forn === '__new' ? `<div class="g2"><label class="fld"><span>Nome del nuovo fornitore</span><input type="text" data-k="fnome" value="${esc(st.fnome)}" autocomplete="off"></label>
          <label class="fld"><span>Partita IVA</span><input type="text" data-k="fpiva" value="${esc(st.fpiva)}" inputmode="numeric" autocomplete="off"></label></div>` : ''}
        ${f.ddt.length ? `<p class="note">${IC.info}<span>Fattura dei DDT ${esc(feDdtTxt(f.ddt))}${!ddts.length ? ', non ancora registrati nell’app.' : !man.length ? ': li hai già registrati.' : `: ne hai registrati ${ddts.length}. ${man.length === 1 ? 'Manca il DDT' : 'Mancano i DDT'} ${esc(feDdtTxt(man))}.`}</span></p>
          ${ddts.length ? `<label class="chk"><input type="checkbox" data-k="solo" ${st.solo ? 'checked' : ''}>${man.length ? 'La merce dei DDT registrati è già in magazzino: completa i loro prezzi senza caricarla di nuovo' : 'La merce è già in magazzino con i DDT: completa i loro prezzi senza caricarla di nuovo'}</label>` : ''}
          ${st.solo && man.length ? `<label class="chk"><input type="checkbox" data-k="carica" ${st.carica ? 'checked' : ''}>Carica in magazzino con questa fattura la merce ${man.length === 1 ? 'del DDT che manca' : 'dei DDT che mancano'}</label>
            <p class="hint" style="margin:-4px 0 14px">${st.carica ? 'Entra solo quello che i DDT registrati non coprono: lo vedi riga per riga.' : 'Senza spunta quella merce finisce solo nello storico prezzi: va bene solo se l’hai già caricata in un altro modo.'}</p>` : ''}` : ''}
        <h3>Righe della fattura</h3><p class="hint" style="margin:-4px 0 10px">Abbina ogni riga a un tuo articolo e controlla la conversione: per esempio «1 CT = 24 pezzi». L'app se lo ricorda per le prossime fatture di questo fornitore.</p>
        ${f.righe.map((r, i) => lineHTML(r, i, cv)).join('')}
        ${pdf ? `<p class="hint" id="fe-sum">${esc(sumTxt())}</p>
          <details class="fe-raw"><summary>Testo letto dal PDF</summary><pre>${esc((f.testo || []).join('\n'))}</pre></details>` : ''}
        <p class="err" id="ferr" role="alert"></p>`;
    },
    entry: e,
    foot: () => e.posta ? `<button type="button" class="btn" data-act="fe-scarta">Non importare</button><button type="button" class="btn pri" data-act="save">Importa fattura</button>` : foot('Importa fattura'),
    onField: (k, oo, kind, el) => {
      if (k === 'forn') { fill(); paintSheet(oo); return; }
      if (k === 'solo' || k === 'carica') { paintSheet(oo); return; }
      if (k === 'numero') { $('.sh-head h2', oo.el).textContent = oo.title(); return; }
      const m = k.match(/^righe\.(\d+)\.(a|q|fat|imp)$/); if (!m) return;
      const i = +m[1], x = st.righe[i];
      if (m[2] === 'a') {
        x.guess = false;
        if (x.a === '__new') {
          x.a = ''; el.value = '';
          const r = f.righe[i], um = feUm(r.um), pk = fePack(r.descr), sz = pk?.size != null ? (FE_SIZE[pk.u] || [])[1] : null;
          const nome = String(r.descr || '').replace(/\b(\d+\s*[X×*]\s*)?\d+(?:[.,]\d+)?\s*(KG|GRAMMI|GR|G|LITRI|LT|L|CL|ML)\b.*$/i, '').replace(/\b(CT|CF|CONF|CRT|PZ)\b\.?\s*\d*/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();
          formArticolo(null, nid => { x.a = nid; const a = S.data.articoli.get(nid); x.fat = fmtIn(feFactor(r, a)); (e.nuovi ||= []).push(nid); paintSheet(oo); },
            {nome: nome ? nome[0].toUpperCase() + nome.slice(1) : '', unita: um === 'kg' || um === 'g' ? 'kg' : um === 'l' || um === 'ml' || um === 'cl' ? 'l' : sz || 'pz', fornitoreId: st.forn === '__new' ? '' : st.forn});
          return;
        }
        const a = S.data.articoli.get(x.a); if (a) x.fat = fmtIn(feFactor(f.righe[i], a));
        paintSheet(oo); return;
      }
      aggiorna();
      const sm = document.getElementById('fe-sum'); if (sm) sm.textContent = sumTxt();
    },
    onSave: async oo => {
      if (pdf) {
        if (!st.numero.trim()) return ferr(oo, 'Scrivi il numero della fattura.');
        if (!validIso(st.data)) return ferr(oo, 'Indica la data della fattura.');
        if (st.forn === '__new' && !st.fnome.trim()) return ferr(oo, 'Scrivi il nome del fornitore.');
      }
      const lines = [], cv = copri();
      for (const [i, x] of st.righe.entries()) {
        const r = f.righe[i], name = (r.descr || 'Riga ' + r.n).slice(0, 40);
        if (x.a === '__skip') { lines.push({skip: true}); continue; }
        if (!S.data.articoli.has(x.a)) return ferr(oo, `«${name}»: scegli l'articolo o «Non è merce».`);
        const q = pnum(x.q), fat = pnum(x.fat);
        if (!(q > 0)) return ferr(oo, `«${name}»: quantità non valida.`);
        if (!(fat > 0)) return ferr(oo, `«${name}»: conversione non valida.`);
        let imp;
        if (pdf) { if (!String(x.imp).trim()) imp = null; else { imp = pnum(x.imp); if (!(imp >= 0)) return ferr(oo, `«${name}»: importo non valido.`); } }
        if (conLotti(i, cv) && x.scad && !validIso(x.scad)) return ferr(oo, `«${name}»: scadenza non valida.`);
        lines.push({a: x.a, f: fat, q, lotto: x.lotto, scadenza: x.scad, ...(pdf ? {imp} : {})});
      }
      if (!lines.some(x => !x.skip)) return ferr(oo, 'Nessuna riga da caricare: abbina almeno una riga a un articolo.');
      if (pdf) {
        f.numero = st.numero.trim(); f.data = st.data;
        if (st.forn === '__new') { f.forn.nome = st.fnome.trim(); f.forn.piva = st.fpiva.trim(); }
        if (feDup(f, st.forn === '__new' ? null : st.forn)) return ferr(oo, 'Questa fattura risulta già importata.');
      }
      oo.dirty = false;
      const nuova = carica() && cv.some(c => c.resto > EPS);
      if (await feSave(e, st.forn === '__new' ? null : st.forn, st.solo, lines, carica())) {
        closeSheet(); refreshSheets();
        toast(!st.solo ? 'Fattura importata: merce caricata in magazzino' : nuova ? 'Prezzi dei DDT completati e merce mancante caricata' : 'Fattura collegata ai DDT: prezzi completati');
      }
    }};
  openSheet(o);
}
