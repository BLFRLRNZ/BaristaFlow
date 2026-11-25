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
async function feRead(files) {
  const out = [], seen = new Set(FE.list.map(e => e.key));
  let ignored = 0;
  const one = async (name, bytes, depth) => {
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4) {
      if (depth) { ignored++; return; }
      let entries; try { entries = await feUnzip(bytes); } catch { out.push({key: 'err:' + name, file: name, err: 'questo zip non si apre: estrai i file e caricali uno per uno'}); return; }
      for (const x of entries) await one(x.name.split('/').pop(), x.bytes, depth + 1);
      return;
    }
    const xb = feXmlBytes(bytes);
    if (!xb) { if (depth) ignored++; else out.push({key: 'err:' + name, file: name, err: 'non contiene una fattura elettronica'}); return; }
    const r = feParse(feText(xb), name);
    if (r.ignore) { ignored++; return; }
    if (r.err) { out.push({key: 'err:' + name, file: name, err: r.err}); return; }
    for (const f of r.fatture) {
      const key = [fePiva(f.forn.piva) || feNome(f.forn.nome), f.numero, f.data].join('|');
      if (seen.has(key)) continue;
      seen.add(key); out.push({key, file: name, f});
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
function feStatus(e) {
  if (e.err) return {k: 'err', txt: e.err[0].toUpperCase() + e.err.slice(1)};
  if (e.done) return {k: 'done', txt: 'Importata'};
  const f = e.f;
  if (f.tipo === 'TD04') return {k: 'skip', txt: 'Nota di credito: non si carica'};
  if (!FE_TIPI.includes(f.tipo)) return {k: 'skip', txt: `Documento ${f.tipo || 'senza tipo'}: non si carica`};
  const fid = feFornOf(f);
  if (feDup(f, fid)) return {k: 'dup', txt: 'Già importata'};
  if (!fid) return {k: 'check', txt: 'Fornitore nuovo'};
  const m = feMatch(f, fid);
  if (m.every(x => x.skip)) return {k: 'check', txt: 'Nessuna riga di merce riconosciuta'};
  const n = m.filter(x => !x.sure).length;
  return n ? {k: 'check', txt: `Da controllare: ${n === 1 ? '1 riga' : n + ' righe'}`} : {k: 'ready', txt: 'Pronta'};
}

/* --- salvataggio --- */
async function feSave(e, fid, solo, lines) {
  // lines: per riga {skip} oppure {a, f, q, lotto, scadenza}
  const f = e.f, newF = !fid;
  if (newF) {
    fid = uid();
    if (!(await put('fornitori', fid, {nome: (f.forn.nome || 'Fornitore').slice(0, 80), piva: fePiva(f.forn.piva) || f.forn.cf || '', telefono: f.forn.telefono || '', email: f.forn.email || '', note: f.forn.sede ? `Sede: ${f.forn.sede}` : '', abbinamenti: {}, creato: Date.now()}))) return false;
  }
  const used = f.righe.map((r, i) => ({r, x: lines[i]})).filter(({x}) => !x.skip).map(({r, x}) => {
    const qta = r6(x.q * x.f), imp = r.totale != null ? Math.round(r.totale * 100) / 100 : null;
    return {a: x.a, qta, imp, pu: imp != null && qta > 0 ? imp / qta : null, lotto: x.lotto, scadenza: x.scadenza};
  });
  // fattura differita con i DDT già registrati: si completano i loro prezzi, la merce non si carica di nuovo
  const ddts = solo ? feDdtDocs(f, fid) : [], inDdt = new Set(ddts.flatMap(d => (d.righe || []).map(r => r.articoloId)));
  for (const d of ddts) {
    const righe = (d.righe || []).map(r => { if (r.importo != null && r.importo !== '') return r; const s = used.find(u => u.a === r.articoloId && u.pu != null); return s ? {...r, importo: Math.round(s.pu * r.qta * 100) / 100} : r; });
    if (!(await put('documenti', d.id, {...strip(d), righe, fatturaRif: d.fatturaRif || feRif(f)}, true))) return false;
  }
  const keep = solo ? used.filter(u => !inDdt.has(u.a)) : used;
  if (keep.length) {
    const righe = keep.map(u => ({id: uid(), articoloId: u.a, qta: u.qta, importo: u.imp, lotto: solo ? '' : String(u.lotto || '').trim(), scadenza: solo ? '' : u.scadenza || ''}));
    const note = [`Importata dalla fattura elettronica ${f.file}.`, f.ddt.length ? `DDT: ${f.ddt.map(x => `n. ${x.numero}${x.data ? ' del ' + fmtD(x.data) : ''}`).join(', ')}.` : ''].filter(Boolean).join(' ');
    if (!(await put('documenti', uid(), {tipo: 'fattura', numero: f.numero, data: f.data, fornitoreId: fid, fatturaRif: '', soloPrezzi: solo, note, allegati: [], righe, creato: Date.now()}))) return false;
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
  return true;
}

/* --- fogli: elenco delle fatture lette e controllo di una fattura --- */
function sheetFatture() {
  if (!guard()) return;
  FE.list = []; FE.ignored = 0;
  const o = {title: 'Importa fatture', busy: false, live: true,
    body: () => {
      const rows = FE.list.map((e, i) => {
        const s = feStatus(e), f = e.f;
        const tone = {ready: 'good', done: 'good', check: 'amb', err: 'red'}[s.k] || '';
        const title = f ? `Fattura n. ${f.numero} del ${fmtD(f.data)}` : e.file;
        const sub = f ? `${f.forn.nome || 'Fornitore'} · ${f.righe.length === 1 ? '1 riga' : f.righe.length + ' righe'}${f.totale != null ? ' · ' + EUR(f.totale) : ''}` : 'File non importato';
        const open = f && !['done', 'dup', 'skip'].includes(s.k);
        return `<${open ? 'button type="button"' : 'div'} class="row${open ? '' : ' static'}" ${open ? `data-act="fe-open" data-i="${i}"` : ''}>${av(s.k === 'done' || s.k === 'ready' ? IC.check : s.k === 'err' ? IC.alert : IC.receipt, tone)}<span class="m"><b>${esc(title)}</b><span>${esc(sub)}</span><span class="mc"><span class="chip ${tone}">${esc(s.txt)}</span></span></span></${open ? 'button' : 'div'}>`;
      }).join('');
      return `<p class="muted">Carica i file XML delle fatture elettroniche, anche firmati (.p7m) o tanti insieme in uno .zip. Li scarichi dal portale Fatture e Corrispettivi dell'Agenzia delle Entrate, dal gestionale del commercialista o dalle mail dei fornitori.</p>
        ${countSample() ? '<p class="note warn">' + IC.info + '<span>Stai usando i dati di esempio: anche le fatture che importi ora vengono cancellate quando registri il bar.</span></p>' : ''}
        <p><label class="btn ${FE.list.length ? '' : 'pri'}">${IC.plus}${FE.list.length ? 'Aggiungi altri file' : 'Scegli i file'}<input type="file" accept=".xml,.p7m,.zip,application/xml,text/xml,application/zip,application/pkcs7-mime" multiple data-file="fe"></label></p>
        ${o.busy ? '<p class="hint">Leggo i file…</p>' : ''}
        ${FE.list.length ? `<div class="list">${rows}</div>` : ''}
        ${FE.ignored ? `<p class="hint" style="margin-top:10px">${FE.ignored === 1 ? 'Un file' : FE.ignored + ' file'} senza fattura (ricevute e metadati del Sistema di Interscambio) ${FE.ignored === 1 ? 'è stato saltato' : 'sono stati saltati'}.</p>` : ''}
        ${FE.list.some(e => e.f && feStatus(e).k === 'check') ? '<p class="hint" style="margin-top:10px">Tocca le fatture da controllare: la prima volta abbini le righe ai tuoi articoli, poi l’app se lo ricorda per quel fornitore.</p>' : ''}`;
    },
    foot: () => { const n = FE.list.filter(e => e.f && feStatus(e).k === 'ready').length; return n ? `<button type="button" class="btn pri" data-act="fe-all">Importa ${n === 1 ? 'la fattura pronta' : `le ${n} fatture pronte`}</button>` : ''; }};
  openSheet(o);
}
async function feAddFiles(o, files) {
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
  const f = e.f, fid0 = feFornOf(f);
  const st = {forn: fid0 || '__new', solo: false, righe: []};
  const fill = () => {
    const fid = st.forn === '__new' ? null : st.forn, m = feMatch(f, fid);
    st.solo = feDdtDocs(f, fid).length > 0;
    st.righe = f.righe.map((r, i) => ({a: m[i].skip ? '__skip' : m[i].a || '', fat: fmtIn(m[i].f || 1), q: r.qta > 0 ? fmtIn(r.qta) : '', lotto: r.lotto || '', scad: r.scadenza || '', guess: !!m[i].guess}));
  };
  fill();
  const unitTxt = r => r.um ? esc(r.um) : 'unità';
  const hint = (i) => {
    const x = st.righe[i], a = S.data.articoli.get(x.a), r = f.righe[i];
    if (!a) return '';
    const q = r6(pnum(x.q) * pnum(x.fat));
    if (!(q > 0)) return 'Indica quantità e conversione.';
    return `In magazzino: ${fmtQ(q, a.unita)}${r.totale != null ? ` · ${EUR(r.totale / q)} ${a.unita === 'pz' ? 'al pezzo' : 'al ' + a.unita}` : ''}`;
  };
  const lineHTML = (r, i) => {
    const x = st.righe[i], a = S.data.articoli.get(x.a);
    return `<div class="card fe-line"><p class="fe-d"><b>${esc(r.descr || 'Riga ' + r.n)}</b></p>
      <p class="muted fe-q">${r.qta != null ? `${esc(fmtIn(r.qta))} ${unitTxt(r)}` : 'Quantità non indicata'}${r.prezzo != null ? ` × ${EUR(r.prezzo)}` : ''}${r.totale != null ? ` = <b>${EUR(r.totale)}</b>` : ''}${r.codice ? ` · cod. ${esc(r.codice)}` : ''}</p>
      <label class="fld"><span>Articolo${x.guess && x.a ? ' <span class="chip amb">Proposto: controlla</span>' : ''}</span><select data-k="righe.${i}.a"><option value="__skip" ${x.a === '__skip' ? 'selected' : ''}>Non è merce: non caricare</option><option value="" ${x.a === '' ? 'selected' : ''}>Scegli l'articolo…</option>${artOptions(x.a)}<option value="__new">+ Nuovo articolo…</option></select></label>
      ${a ? `<div class="g2"><label class="fld"><span>Quantità in fattura</span><input type="text" inputmode="decimal" data-k="righe.${i}.q" value="${esc(x.q)}" placeholder="0" autocomplete="off"></label>
      <label class="fld"><span>1 ${unitTxt(r)} = quanti ${a.unita === 'pz' ? 'pezzi' : a.unita}</span><input type="text" inputmode="decimal" data-k="righe.${i}.fat" value="${esc(x.fat)}" autocomplete="off"></label></div>
      <p class="hint fe-h" id="fe-h-${i}">${esc(hint(i))}</p>
      ${st.solo ? '' : `<div class="g2"><label class="fld"><span>Lotto del fornitore</span><input type="text" data-k="righe.${i}.lotto" value="${esc(x.lotto)}" placeholder="Come sulla confezione" autocomplete="off"></label>
      <label class="fld"><span>Scadenza</span><input type="date" data-k="righe.${i}.scad" value="${esc(x.scad)}"></label></div>`}` : ''}</div>`;
  };
  const o = {form: true, st, title: `Fattura n. ${f.numero}`,
    body: () => {
      const fid = st.forn === '__new' ? null : st.forn, ddts = feDdtDocs(f, fid);
      return `<p class="muted">${esc(f.forn.nome || 'Fornitore')}${f.forn.piva ? ' · P.IVA ' + esc(fePiva(f.forn.piva)) : ''} · ${fmtD(f.data)}${f.totale != null ? ' · totale ' + EUR(f.totale) : ''}</p>
        <label class="fld"><span>Fornitore</span><select data-k="forn"><option value="__new" ${st.forn === '__new' ? 'selected' : ''}>+ Crea «${esc(f.forn.nome || 'Fornitore')}»</option>${fornOpts(st.forn === '__new' ? '' : st.forn)}</select>${!fid0 ? '<small class="hint">Non l’ho trovato fra i tuoi fornitori: se c’è con un altro nome, sceglilo qui.</small>' : ''}</label>
        ${f.ddt.length ? `<p class="note">${IC.info}<span>Fattura dei DDT ${esc(f.ddt.map(x => `n. ${x.numero}${x.data ? ' del ' + fmtD(x.data) : ''}`).join(', '))}${ddts.length ? `: ${ddts.length === f.ddt.length ? 'li hai già registrati' : `ne hai registrati ${ddts.length}`}.` : ', non ancora registrati nell’app.'}</span></p>
          ${ddts.length ? `<label class="chk"><input type="checkbox" data-k="solo" ${st.solo ? 'checked' : ''}>La merce è già in magazzino con i DDT: completa i loro prezzi senza caricarla di nuovo</label>` : ''}` : ''}
        <h3>Righe della fattura</h3><p class="hint" style="margin:-4px 0 10px">Abbina ogni riga a un tuo articolo e controlla la conversione: per esempio «1 CT = 24 pezzi». L'app se lo ricorda per le prossime fatture di questo fornitore.</p>
        ${f.righe.map(lineHTML).join('')}
        <p class="err" id="ferr" role="alert"></p>`;
    },
    foot: () => foot('Importa fattura'),
    onField: (k, oo, kind, el) => {
      if (k === 'forn') { fill(); paintSheet(oo); return; }
      if (k === 'solo') { paintSheet(oo); return; }
      const m = k.match(/^righe\.(\d+)\.(a|q|fat)$/); if (!m) return;
      const i = +m[1], x = st.righe[i];
      if (m[2] === 'a') {
        x.guess = false;
        if (x.a === '__new') {
          x.a = ''; el.value = '';
          const r = f.righe[i], um = feUm(r.um), p = fePack(r.descr), sz = p?.size != null ? (FE_SIZE[p.u] || [])[1] : null;
          const nome = String(r.descr || '').replace(/\b(\d+\s*[X×*]\s*)?\d+(?:[.,]\d+)?\s*(KG|GRAMMI|GR|G|LITRI|LT|L|CL|ML)\b.*$/i, '').replace(/\b(CT|CF|CONF|CRT|PZ)\b\.?\s*\d*/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();
          formArticolo(null, nid => { x.a = nid; const a = S.data.articoli.get(nid); x.fat = fmtIn(feFactor(r, a)); (e.nuovi ||= []).push(nid); paintSheet(oo); },
            {nome: nome ? nome[0].toUpperCase() + nome.slice(1) : '', unita: um === 'kg' || um === 'g' ? 'kg' : um === 'l' || um === 'ml' || um === 'cl' ? 'l' : sz || 'pz', fornitoreId: st.forn === '__new' ? '' : st.forn});
          return;
        }
        const a = S.data.articoli.get(x.a); if (a) x.fat = fmtIn(feFactor(f.righe[i], a));
        paintSheet(oo); return;
      }
      const h = document.getElementById('fe-h-' + i); if (h) h.textContent = hint(i);
    },
    onSave: async oo => {
      const lines = [];
      for (const [i, x] of st.righe.entries()) {
        const r = f.righe[i], name = (r.descr || 'Riga ' + r.n).slice(0, 40);
        if (x.a === '__skip') { lines.push({skip: true}); continue; }
        if (!S.data.articoli.has(x.a)) return ferr(oo, `«${name}»: scegli l'articolo o «Non è merce».`);
        const q = pnum(x.q), fat = pnum(x.fat);
        if (!(q > 0)) return ferr(oo, `«${name}»: quantità non valida.`);
        if (!(fat > 0)) return ferr(oo, `«${name}»: conversione non valida.`);
        if (!st.solo && x.scad && !validIso(x.scad)) return ferr(oo, `«${name}»: scadenza non valida.`);
        lines.push({a: x.a, f: fat, q, lotto: x.lotto, scadenza: x.scad});
      }
      if (!lines.some(x => !x.skip)) return ferr(oo, 'Nessuna riga da caricare: abbina almeno una riga a un articolo.');
      oo.dirty = false;
      if (await feSave(e, st.forn === '__new' ? null : st.forn, st.solo, lines)) {
        closeSheet(); refreshSheets();
        toast(st.solo ? 'Fattura collegata ai DDT: prezzi completati' : 'Fattura importata: merce caricata in magazzino');
      }
    }};
  openSheet(o);
}
