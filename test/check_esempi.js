// Controlla i dati di esempio generati dall'app: coerenza di lotti, consumi, movimenti e quello che si vede in «Oggi».
// Uso: node test/check_esempi.js [AAAA-MM-GG ...]   (senza date: oggi e alcuni giorni della settimana diversi)
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = ['core.js', 'esempi.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n');
const ctx = {console, Intl, Date, Math, JSON, Map, Set, Array, Object, String, Number, isNaN, isFinite, Promise, setTimeout};
vm.createContext(ctx);
vm.runInContext(src + `
;globalThis.__api = {buildSample, S, drv, derive, COLS, EPS, st, daysBetween, addDays, artStock, cfg, recCostOf, priceStats, periodStart};`, ctx);
const api = ctx.__api;

let fails = 0;
const check = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } };
const days = process.argv.slice(2).length ? process.argv.slice(2) : ['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30', '2027-03-15', '2027-07-04'];
for (const T of days) {
  const t0 = Date.now();
  const data = api.buildSample(T);
  const ms = Date.now() - t0;
  for (const c of api.COLS) api.S.data[c] = new Map(Object.entries(data[c] || {}).map(([id, v]) => [id, {...v, id}]));
  api.S.ver++;
  const D = api.drv();
  const n = Object.fromEntries(Object.entries(data).map(([c, v]) => [c, Object.keys(v).length]));
  const tot = Object.values(n).reduce((a, b) => a + b, 0), size = JSON.stringify(data).length;
  // giacenze mai negative, consumi e movimenti che puntano a lotti esistenti
  for (const l of [...D.acq.values(), ...D.prod.values()]) check(l.res > -1e-6, `${T} giacenza negativa ${l.key} ${l.res}`);
  for (const p of api.S.data.produzioni.values()) for (const c of p.consumi) {
    check(!!c.lotId, `${T} consumo senza lotto in ${p.lotto}: ${c.nome}`);
    const l = (c.tipo === 'ric' ? D.prod : D.acq).get(c.lotId);
    check(!!l, `${T} lotto mancante ${c.lotId}`);
    if (l) { check(l.data <= p.data, `${T} ${p.lotto} usa un lotto arrivato dopo`); check(!l.scad || l.scad >= p.data, `${T} ${p.lotto} usa un lotto già scaduto ${c.lotId}`); }
  }
  for (const m of api.S.data.movimenti.values()) {
    const l = (m.lotKind === 'prod' ? D.prod : D.acq).get(m.lotId);
    check(!!l, `${T} movimento su lotto mancante ${m.lotId}`);
    if (l) check(m.data >= l.data && m.data < T, `${T} data movimento ${m.data} fuori dal lotto ${l.data}`);
  }
  for (const v of Object.values(data).flatMap(c => Object.values(c))) check(v.esempio === true, `${T} elemento senza il segno di esempio`);
  const ids = Object.values(data).flatMap(c => Object.keys(c));
  check(ids.every(id => /^[A-Za-z0-9_\-~:@+]{1,120}$/.test(id)), `${T} id non validi`);
  // quello che si vede in Oggi
  const w = api.cfg().giorniAvviso, lots = [...D.acq.values(), ...D.prod.values()].filter(l => l.res > api.EPS && l.scad);
  const exp = lots.filter(l => l.scad < T), soon = lots.filter(l => l.scad >= T && api.daysBetween(T, l.scad) <= w);
  const under = [...api.S.data.articoli.values()].filter(a => !a.archiviato && +a.scortaMin > 0 && api.artStock(a.id).usable < +a.scortaMin);
  const d30 = api.addDays(T, -30), rinc = [...D.prices.entries()].filter(([id, s]) => { if (s.length < 2) return false; const l = s[s.length - 1], pv = s[s.length - 2]; return l.date >= d30 && (l.p - pv.p) / pv.p >= .05; }).map(([id]) => api.S.data.articoli.get(id).nome);
  const vetrina = [...D.prod.values()].filter(l => l.res > api.EPS);
  const urg = [...api.S.data.documenti.values()].filter(d => d.note.startsWith('Spesa urgente'));
  const scarti = [...api.S.data.movimenti.values()].filter(m => m.tipo === 'scarto');
  check(exp.length >= 1 && exp.length <= 5, `${T} scaduti ${exp.length}`);
  check(under.length >= 2, `${T} sotto scorta ${under.length}`);
  check(rinc.length === 3, `${T} rincari ${rinc}`);
  check(vetrina.length >= 6, `${T} in vetrina ${vetrina.length}`);
  check(urg.length <= 3, `${T} spese urgenti ${urg.length}`);
  check(D.prices.get('es-a-burro')?.length >= 15, `${T} punti del burro ${D.prices.get('es-a-burro')?.length}`);
  console.log(`${T} (${['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][new Date(T + 'T12:00:00Z').getUTCDay()]}) ${ms} ms · ${tot} elementi, ${Math.round(size / 1024)} KB ·`, JSON.stringify(n));
  console.log(`   scaduti ${exp.length} [${exp.map(l => (l.p?.lotto || l.item?.nome) + ' ' + l.res).join(', ')}] · in scadenza ${soon.length} · sotto scorta ${under.length} [${under.map(a => a.nome).join(', ')}] · rincari [${rinc.join(', ')}] · vetrina ${vetrina.length} · urgenti ${urg.length} [${urg.map(d => d.righe.map(r => api.S.data.articoli.get(r.articoloId).nome + ' ' + r.qta).join('+')).join(' | ')}] · scarti ${scarti.length}`);
}
console.log(fails ? `\n${fails} controlli falliti` : '\nDati di esempio coerenti');
process.exit(fails ? 1 : 0);
