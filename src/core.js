/* ---------- costanti ---------- */
const COLS = ['fornitori', 'articoli', 'documenti', 'ricette', 'produzioni', 'movimenti', 'impostazioni'];
const ALG = [['glutine', 'Glutine'], ['crostacei', 'Crostacei'], ['uova', 'Uova'], ['pesce', 'Pesce'], ['arachidi', 'Arachidi'], ['soia', 'Soia'], ['latte', 'Latte'], ['frutta_guscio', 'Frutta a guscio'], ['sedano', 'Sedano'], ['senape', 'Senape'], ['sesamo', 'Sesamo'], ['solfiti', 'Solfiti'], ['lupini', 'Lupini'], ['molluschi', 'Molluschi']];
const ALGN = Object.fromEntries(ALG);
const CAT = {materia: 'Materia prima', rivendita: 'Rivendita', imballaggio: 'Imballaggio'};
const CONS = {ambiente: 'Ambiente', frigo: 'Frigorifero', freezer: 'Congelatore'};
const TIPI = {fattura: 'Fattura', ddt: 'DDT', scontrino: 'Scontrino', inventario: 'Inventario iniziale'};
const MOV = {vendita: 'Venduto', scarto: 'Scartato', uso: 'Uso interno', rettifica: 'Rettifica inventario'};
const U = {kg: {f: 'm', k: 1}, g: {f: 'm', k: 0.001}, l: {f: 'v', k: 1}, ml: {f: 'v', k: 0.001}, pz: {f: 'p', k: 1}};
const EPS = 1e-6;
const svg = p => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const IC = {
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  copy: svg('<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>'),
  down: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>'),
  left: svg('<path d="m14.5 6-6 6 6 6"/>'),
  right: svg('<path d="m9.5 6 6 6-6 6"/>'),
  alert: svg('<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.3"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  box: svg('<path d="m3.5 7.5 8.5-4 8.5 4v9l-8.5 4-8.5-4z"/><path d="m3.5 7.5 8.5 4 8.5-4M12 11.5v9"/>'),
  trend: svg('<path d="m4 16 5.5-5.5 4 4L20 8"/><path d="M15 8h5v5"/>'),
  chef: svg('<path d="M7 17.5h10V21H7z"/><path d="M7 17.5v-4a4 4 0 1 1 1.8-7.6 4 4 0 0 1 6.4 0A4 4 0 1 1 17 13.5v4"/>'),
  doc: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14.5 3v4.5H19M9 12h7M9 16h5"/>'),
  receipt: svg('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
  truck: svg('<path d="M3 6.5h11v9H3zM14 9.5h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  tag: svg('<path d="M3.5 12.5V4.5h8l9 9-8 8z"/><circle cx="8" cy="9" r="1.4"/>'),
  bottle: svg('<path d="M10 3h4v3l1.5 2.5V20a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V8.5L10 6z"/><path d="M8.5 12h7"/>'),
  bag: svg('<path d="M5 8h14l-1 12.5H6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>'),
  wheat: svg('<path d="M12 21V9"/><path d="M12 13c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4zM12 13c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4zM12 9c-2 0-3.2-1.2-3.2-3.2C10.8 5.8 12 7 12 9zM12 9c2 0 3.2-1.2 3.2-3.2C13.2 5.8 12 7 12 9z"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  trash: svg('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>'),
  sell: svg('<path d="M4 7h16l-1.5 10.5h-13z"/><path d="M9 11v3M15 11v3"/>'),
  info: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.2"/>'),
  shop: svg('<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12.5V20h13v-7.5M10 20v-4.5h4V20"/>')
};
const LOGO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 11h12v3.5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z"/><path d="M16.5 12.5h1.2a2.3 2.3 0 0 1 0 4.6h-1.6"/><path d="M8 3.5c1.2 1.1-1.2 2.4 0 3.6M11.5 3.5c1.2 1.1-1.2 2.4 0 3.6" stroke="#e0a25f"/></svg>`;

/* ---------- utilità ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = o => JSON.parse(JSON.stringify(o ?? null));
const r6 = x => Math.round(x * 1e6) / 1e6;
const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoOf(new Date());
const parseIso = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const validIso = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(parseIso(s)) && parseIso(s).toISOString().slice(0, 10) === s;
const addDays = (s, n) => { const d = parseIso(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 864e5);
const fmtD = s => validIso(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—';
const fmtDs = s => !validIso(s) ? '—' : s.slice(0, 4) === today().slice(0, 4) ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}`;
const NF = new Intl.NumberFormat('it-IT', {maximumFractionDigits: 3});
const num = n => NF.format(Math.round(n * 1000) / 1000);
const unitOk = u => (U[u] ? u : '');
const fmtQ = (q, u) => {
  if (q == null || isNaN(q)) return '—';
  u = unitOk(u); const a = Math.abs(q);
  if (u === 'kg' && a > EPS && a < 1) return `${num(q * 1000)} g`;
  if (u === 'l' && a > EPS && a < 1) return `${num(q * 1000)} ml`;
  if (a < EPS) q = 0;
  return u ? `${num(q)} ${u}` : num(q);
};
const EUR = v => (v == null || !isFinite(v)) ? '—' : new Intl.NumberFormat('it-IT', {style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: Math.abs(v) < 1 && v !== 0 ? 3 : 2}).format(v);
const pnum = v => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.');
  return s === '' ? NaN : Number(s);
};
const fmtIn = x => (x == null || isNaN(x)) ? '' : String(r6(x)).replace('.', ',');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const lc1 = s => /^\p{Lu}{2,}/u.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const byName = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'it');
const algSort = arr => ALG.map(a => a[0]).filter(k => arr.includes(k));
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* non disponibile */ } };

function conv(q, from, to, pesoPz) {
  const a = U[from], b = U[to];
  if (!a || !b || isNaN(q)) return NaN;
  if (a.f === b.f) return q * a.k / b.k;
  if (b.f === 'p' && a.f === 'm' && pesoPz > 0) return q * a.k * 1000 / pesoPz;
  if (b.f === 'm' && a.f === 'p' && pesoPz > 0) return q * pesoPz / 1000 / b.k;
  return NaN;
}
const grams = (q, u, pesoPz) => { const x = U[u]; if (!x || isNaN(q)) return 0; return x.f === 'p' ? (pesoPz > 0 ? q * pesoPz : 0) : q * x.k * 1000; };
const unitOpts = (base, pesoPz) => base === 'kg' ? ['g', 'kg'] : base === 'l' ? ['ml', 'l'] : (pesoPz > 0 ? ['pz', 'g'] : ['pz']);
const buyUnits = base => base === 'kg' ? ['kg', 'g'] : base === 'l' ? ['l', 'ml'] : ['pz'];

/* ---------- stato ---------- */
const S = {db: null, mode: 'loading', ro: false, assets: null, downloads: null, user: null, got: new Set(), fresh: new Set(), slow: false, ver: 0, errShown: false, data: Object.fromEntries(COLS.map(c => [c, new Map()]))};
const UI = {q: {prod: '', sch: '', mag: '', acq: '', prz: '', forn: ''}, prodF: 'attivi', schCat: '', schArch: false, magSeg: 'acq', magCat: 'tutti', prezziP: '3m', todoAll: false};
const cfg = () => {
  const c = S.data.impostazioni.get('generale') || {};
  const g = Math.round(pnum(c.giorniAvviso)), iva = pnum(c.iva), sr = pnum(c.sogliaRincaro);
  return {nome: c.nome || '', indirizzo: c.indirizzo || '', piva: c.piva || '', giorniAvviso: g >= 0 ? g : 3, iva: iva >= 0 ? iva : 10, sogliaRincaro: sr >= 0 ? sr : 5};
};

/* archivio locale: usato fuori da claude.ai (dati nel browser) o in prova (dati in memoria) */
function localDB(key) {
  let store = {};
  if (key) { try { store = JSON.parse(lsGet(key) || '{}') || {}; } catch { store = {}; } }
  const subs = {};
  const save = () => { if (key) lsSet(key, JSON.stringify(store)); };
  const snap = c => {
    const docs = Object.entries(store[c] || {}).map(([id, v]) => ({id, exists: true, data: () => v, metadata: {fromCache: false, hasPendingWrites: false}}));
    return {docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {fromCache: false, hasPendingWrites: false}};
  };
  const emit = c => setTimeout(() => (subs[c] || []).forEach(f => f(snap(c))), 0);
  return {
    collection(c) {
      return {
        onSnapshot(next) { (subs[c] ||= []).push(next); emit(c); return () => { subs[c] = subs[c].filter(f => f !== next); }; },
        doc(id) {
          return {
            async set(v) { (store[c] ||= {})[id] = clone(v); save(); emit(c); },
            async delete() { if (store[c]) delete store[c][id]; save(); emit(c); },
            async get() { const v = store[c]?.[id]; return {id, exists: !!v, data: () => v}; }
          };
        }
      };
    },
    /* tante scritture insieme, salvate una volta sola */
    async bulk(ops) {
      for (const [c, id, v] of ops) { if (v == null) { if (store[c]) delete store[c][id]; } else (store[c] ||= {})[id] = clone(v); }
      save(); [...new Set(ops.map(o => o[0]))].forEach(emit);
    }
  };
}

/* ---------- scrittura ---------- */
async function put(col, id, doc, quiet) {
  doc = clone(doc); delete doc.id;
  if (col !== 'impostazioni' && !doc.esempio && !S.data[col].has(id) && countSample()) doc.esempio = true;   // durante la prova anche quello che crei è di prova
  S.data[col].set(id, {...doc, id}); bump();
  for (let tent = 0; tent < 2; tent++) {
    try { await S.db.collection(col).doc(id).set(doc); return true; }
    catch (e) {
      if (tent === 0 && (e?.code === 'unavailable' || e?.code === 'resource_exhausted')) { await sleep(700 + Math.random() * 900); continue; }
      if (!quiet) dbErr(e);
      return false;
    }
  }
  return false;
}
async function del(col, id, quiet) {
  S.data[col].delete(id); bump();
  try { await S.db.collection(col).doc(id).delete(); return true; }
  catch (e) { if (!quiet) dbErr(e); return false; }
}
function dbErr(e) {
  const c = e?.code;
  if (c === 'invalid_argument') toast('Salvataggio rifiutato: probabilmente hai solo accesso in lettura.', true);
  else if (c === 'quota_exceeded') toast("L'archivio è pieno: esporta un backup ed elimina dati vecchi.", true);
  else if (c === 'resource_exhausted') toast('Troppe operazioni ravvicinate: riprova tra qualche secondo.', true);
  else if (c === 'revoked') toast("L'accesso ai dati è stato ritirato.", true);
  else toast('Salvataggio non riuscito. Controlla la connessione e riprova.', true);
}
async function pool(items, n, fn) {
  let i = 0;
  const run = async () => { while (i < items.length) { const it = items[i++]; await fn(it); } };
  await Promise.all(Array.from({length: Math.min(n, items.length)}, run));
}

/* ---------- dati derivati: lotti, giacenze, costi ---------- */
let D = null, Dver = -1;
function drv() { if (Dver !== S.ver) { D = derive(); Dver = S.ver; } return D; }
function derive() {
  const A = S.data.articoli, R = S.data.ricette;
  const acq = new Map(), prod = new Map(), artLots = new Map(), ricLots = new Map(), lastCost = new Map(), prices = new Map(), invCost = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  const docs = [...S.data.documenti.values()].sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')) || (a.creato || 0) - (b.creato || 0));
  for (const doc of docs) for (const r of (Array.isArray(doc.righe) ? doc.righe : [])) {
    const q = +r.qta || 0, imp = (r.importo == null || r.importo === '') ? null : +r.importo;
    const costU = (q > 0 && imp != null && imp >= 0) ? imp / q : null;
    if (costU != null) {
      if (doc.tipo === 'inventario') invCost.set(r.articoloId, costU);
      else { push(prices, r.articoloId, {date: doc.data || '', p: costU, q, imp, forn: doc.fornitoreId || '', docId: doc.id, rigaId: r.id}); lastCost.set(r.articoloId, costU); }
    }
    if (doc.soloPrezzi) continue;
    const lot = {kind: 'acq', key: `${doc.id}:${r.id}`, doc, riga: r, itemId: r.articoloId, item: A.get(r.articoloId), qta: q, scad: validIso(r.scadenza) ? r.scadenza : '', data: doc.data || '', lottoF: String(r.lotto || ''), costU, used: [], mov: [], usedQ: 0, movQ: 0, res: 0};
    acq.set(lot.key, lot); push(artLots, r.articoloId, lot);
  }
  for (const [k, v] of invCost) if (!lastCost.has(k)) lastCost.set(k, v);
  for (const p of S.data.produzioni.values()) {
    const lot = {kind: 'prod', key: p.id, p, itemId: p.ricettaId, item: R.get(p.ricettaId), qta: +p.qta || 0, scad: validIso(p.scadenza) ? p.scadenza : '', data: p.data || '', used: [], mov: [], usedQ: 0, movQ: 0, res: 0};
    prod.set(p.id, lot); push(ricLots, p.ricettaId, lot);
  }
  for (const p of S.data.produzioni.values()) for (const c of (Array.isArray(p.consumi) ? p.consumi : [])) {
    if (!c.lotId) continue;
    const lot = (c.tipo === 'ric' ? prod : acq).get(c.lotId);
    if (lot) { lot.used.push({prodId: p.id, qta: +c.qta || 0}); lot.usedQ += +c.qta || 0; }
  }
  for (const m of S.data.movimenti.values()) {
    const lot = (m.lotKind === 'prod' ? prod : acq).get(m.lotId);
    if (lot) { lot.mov.push(m); lot.movQ += +m.delta || 0; }
  }
  for (const l of acq.values()) l.res = r6(l.qta - l.usedQ + l.movQ);
  for (const l of prod.values()) l.res = r6(l.qta - l.usedQ + l.movQ);
  const byExp = (a, b) => (a.scad || '9999').localeCompare(b.scad || '9999') || a.data.localeCompare(b.data);
  for (const arr of artLots.values()) arr.sort(byExp);
  for (const arr of ricLots.values()) arr.sort(byExp);
  return {acq, prod, artLots, ricLots, lastCost, prices, costMemo: new Map()};
}
const byScad = (a, b) => (a.scad || '9999').localeCompare(b.scad || '9999');
const itemOf = (tipo, id) => tipo === 'ric' ? S.data.ricette.get(id) : S.data.articoli.get(id);
const baseOf = (tipo, it) => tipo === 'ric' ? (unitOk(it?.resaUnita) || 'pz') : (unitOk(it?.unita) || 'kg');
const lotUnit = l => l.kind === 'prod' ? unitOk(l.p.unita || l.item?.resaUnita) : unitOk(l.item?.unita);
const lotName = l => l.kind === 'prod' ? (l.p.ricettaNome || l.item?.nome || 'Prodotto') : (l.item?.nome || 'Articolo eliminato');

function st(l) {
  if (l.res <= EPS) return {c: '', t: 'Esaurito', n: Infinity};
  if (!l.scad) return {c: '', t: 'Senza scadenza', n: Infinity};
  const n = daysBetween(today(), l.scad), w = cfg().giorniAvviso;
  if (n < 0) return {c: 'red', t: n === -1 ? 'Scaduto ieri' : `Scaduto da ${-n} giorni`, n};
  if (n === 0) return {c: 'amb', t: 'Scade oggi', n};
  if (n <= w) return {c: 'amb', t: n === 1 ? 'Scade domani' : `Scade tra ${n} giorni`, n};
  return {c: '', t: `Scade il ${fmtD(l.scad)}`, n};
}
function stockOf(lots) {
  const t = today(); let usable = 0, expired = 0, next = null, n = 0;
  for (const l of lots || []) if (l.res > EPS) {
    n++;
    if (l.scad && l.scad < t) expired += l.res;
    else { usable += l.res; if (l.scad && (!next || l.scad < next)) next = l.scad; }
  }
  return {usable: r6(usable), expired: r6(expired), next, n};
}
const artStock = id => stockOf(drv().artLots.get(id));
const ricStock = id => stockOf(drv().ricLots.get(id));

/* allergeni, elenco ingredienti, costi (anche su bozze di schede) */
function recAllergensOf(r, path = []) {
  const out = new Set();
  for (const g of (r?.ingredienti || [])) {
    if (g.tipo === 'ric') {
      if (path.includes(g.refId)) continue;
      const s = S.data.ricette.get(g.refId);
      if (s) recAllergensOf(s, [...path, g.refId]).forEach(a => out.add(a));
    } else (S.data.articoli.get(g.refId)?.allergeni || []).forEach(a => out.add(a));
  }
  return out;
}
function recTracceOf(r, path = []) {
  const out = new Set(Array.isArray(r?.tracce) ? r.tracce : []);
  for (const g of (r?.ingredienti || [])) if (g.tipo === 'ric' && !path.includes(g.refId)) {
    const s = S.data.ricette.get(g.refId);
    if (s) recTracceOf(s, [...path, g.refId]).forEach(a => out.add(a));
  }
  return out;
}
const curPrice = id => drv().lastCost.get(id) ?? null;
function recCostOf(r, path = [], pf = curPrice) {
  let tot = 0; const miss = new Set();
  for (const g of (r?.ingredienti || [])) {
    const it = itemOf(g.tipo, g.refId);
    if (!it) { miss.add('ingrediente eliminato'); continue; }
    const qb = conv(+g.qta, g.unita, baseOf(g.tipo, it), +it.pesoPz || 0);
    if (!(qb >= 0)) { miss.add(it.nome); continue; }
    if (g.tipo === 'ric') {
      if (path.includes(g.refId) || !(+it.resaQta > 0)) { miss.add(it.nome); continue; }
      const sub = recCostOf(it, [...path, g.refId], pf);
      sub.miss.forEach(m => miss.add(m));
      tot += qb * sub.tot / +it.resaQta;
    } else {
      const c = pf(g.refId);
      if (c == null) { miss.add(it.nome); continue; }
      tot += qb * c;
    }
  }
  return {tot, miss: [...miss]};
}
function lineCost(g, path) {
  const it = itemOf(g.tipo, g.refId); if (!it) return null;
  const qb = conv(+g.qta, g.unita, baseOf(g.tipo, it), +it.pesoPz || 0);
  if (!(qb >= 0)) return null;
  if (g.tipo === 'ric') { if (!(+it.resaQta > 0) || path.includes(g.refId)) return null; const s = recCostOf(it, [...path, g.refId]); return s.miss.length ? null : qb * s.tot / +it.resaQta; }
  const c = drv().lastCost.get(g.refId); return c == null ? null : qb * c;
}
const HASCAPS = /(^|[^\p{L}])\p{Lu}{2,}(?=$|[^\p{L}])/u;
const emph = h => h.replace(/(^|[^\p{L}])(\p{Lu}{2,})(?=$|[^\p{L}])/gu, '$1<b>$2</b>');
function artLabel(a) {
  let t = String(a.etichetta || '').trim();
  if (!t) t = lc1(String(a.nome || '').trim());
  const al = algSort(a.allergeni || []);
  if (al.length && !HASCAPS.test(t)) t += ` (${al.map(k => ALGN[k].toUpperCase()).join(', ')})`;
  return t;
}
function ingListOf(r, path = []) {
  return (r?.ingredienti || []).map(g => {
    const it = itemOf(g.tipo, g.refId); if (!it) return null;
    const gr = grams(+g.qta, g.unita, +it.pesoPz || 0);
    if (g.tipo === 'ric') {
      const nm = lc1(String(it.etichetta || it.nome || '').trim());
      if (path.includes(g.refId)) return {gr, t: nm};
      const sub = ingListOf(it, [...path, g.refId]);
      return {gr, t: sub.length ? `${nm} (${sub.map(s => s.t).join(', ')})` : nm};
    }
    return {gr, t: artLabel(it)};
  }).filter(Boolean).sort((a, b) => b.gr - a.gr);
}
function labelInfo(r, path) {
  const al = algSort([...recAllergensOf(r, path)]);
  const tr = algSort([...recTracceOf(r, path)].filter(x => !al.includes(x)));
  return {ing: ingListOf(r, path).map(x => x.t).join(', '), al, tr};
}
function labelPlain(r, path) {
  const x = labelInfo(r, path);
  return [`Ingredienti: ${x.ing || '—'}.`, `Allergeni: ${x.al.length ? x.al.map(k => ALGN[k].toLowerCase()).join(', ') : 'nessuno dei 14 allergeni principali'}.`, x.tr.length ? `Può contenere tracce di: ${x.tr.map(k => ALGN[k].toLowerCase()).join(', ')}.` : ''].filter(Boolean).join('\n');
}
function usesRec(id, target, seen = new Set()) {
  if (id === target) return true;
  const r = S.data.ricette.get(id); if (!r || seen.has(id)) return false; seen.add(id);
  return (r.ingredienti || []).some(g => g.tipo === 'ric' && usesRec(g.refId, target, seen));
}
function lotCost(prodId, stack = []) {
  const Dd = drv();
  if (Dd.costMemo.has(prodId)) return Dd.costMemo.get(prodId);
  const p = S.data.produzioni.get(prodId);
  if (!p || stack.includes(prodId)) return {tot: 0, partial: true};
  let tot = 0, partial = false;
  for (const c of (p.consumi || [])) {
    const q = +c.qta || 0; let u = null;
    if (c.lotId) {
      if (c.tipo === 'ric') { const lp = Dd.prod.get(c.lotId); if (lp && lp.qta > 0) { const sc = lotCost(c.lotId, [...stack, prodId]); u = sc.tot / lp.qta; if (sc.partial) partial = true; } }
      else { const la = Dd.acq.get(c.lotId); if (la) u = la.costU; }
    }
    if (u == null) {
      partial = true;
      if (c.tipo === 'ric') { const r = S.data.ricette.get(c.refId); if (r && +r.resaQta > 0) { const rc = recCostOf(r, [r.id]); if (!rc.miss.length) u = rc.tot / +r.resaQta; } }
      else u = Dd.lastCost.get(c.refId) ?? null;
    }
    if (u != null) tot += q * u;
  }
  const res = {tot, partial};
  Dd.costMemo.set(prodId, res);
  return res;
}
function lotCode(sigla, iso) {
  const base = `${String(sigla || 'LOT').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'LOT'}-${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(2, 4)}`;
  const codes = new Set([...S.data.produzioni.values()].map(p => p.lotto));
  let n = 1; while (codes.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
const autoSigla = nome => String(nome || '').normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'LOT';
function docName(d) {
  if (!d) return 'Documento eliminato';
  const t = TIPI[d.tipo] || 'Documento';
  if (d.tipo === 'inventario') return `${t} del ${fmtD(d.data)}`;
  return `${t}${d.numero ? ' n. ' + d.numero : ''} del ${fmtD(d.data)}`;
}
const docTot = d => (d.righe || []).reduce((s, r) => s + (r.importo == null || r.importo === '' ? 0 : +r.importo || 0), 0);
const fornName = id => S.data.fornitori.get(id)?.nome || '';
const shelfTxt = r => { const n = Math.round(+r.shelfLife || 0); return n === 0 ? 'in giornata' : n === 1 ? '1 giorno' : `${n} giorni`; };
const scadLabel = t => t === 'entro' ? 'Da consumarsi entro' : 'Da consumarsi preferibilmente entro';
const countSample = () => COLS.reduce((s, c) => s + [...S.data[c].values()].filter(v => v.esempio).length, 0);

/* ---------- analisi prezzi d'acquisto ---------- */
const PERIODI = {'3m': ['3 mesi', 3], '6m': ['6 mesi', 6], '12m': ['12 mesi', 12], 'tutto': ['Tutto', 0]};
function periodStart(k) {
  const n = (PERIODI[k] || PERIODI['3m'])[1];
  if (!n) return '0000-01-01';
  const d = parseIso(today()), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
const priceList = id => drv().prices.get(id) || [];
function priceAt(id, iso) {
  const s = priceList(id); if (!s.length) return null;
  let v = null; for (const x of s) { if (x.date <= iso) v = x.p; else break; }
  return v ?? s[0].p;
}
function priceStats(id, start) {
  const s = priceList(id); if (!s.length) return null;
  const last = s[s.length - 1], prev = s.length > 1 ? s[s.length - 2] : null;
  let before = null; for (const x of s) if (x.date < start) before = x;
  const inP = s.filter(x => x.date >= start);
  const ref = before ? before.p : (inP[0] ? inP[0].p : last.p);
  const extra = inP.reduce((t, x) => t + (x.p - ref) * x.q, 0);
  const chg = ref > 0 ? (last.p - ref) / ref : null, chgPrev = prev && prev.p > 0 ? (last.p - prev.p) / prev.p : null;
  let min = s[0], max = s[0], sq = 0, si = 0;
  for (const x of s) { if (x.p < min.p) min = x; if (x.p > max.p) max = x; sq += x.q; si += x.imp; }
  return {s, last, prev, before, inP, ref, refDate: before ? before.date : inP[0]?.date, extra: r6(extra), chg, chgPrev, min, max, avg: sq > 0 ? si / sq : null};
}
const pct = x => (x == null || !isFinite(x)) ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${num(Math.abs(Math.round(x * 1000) / 10))}%`;
const numP = v => new Intl.NumberFormat('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: Math.abs(v) < 1 ? 3 : 2}).format(v);
const perU = u => u === 'pz' ? 'al pezzo' : u === 'l' ? 'al litro' : 'al kg';
