/* ---------- azioni rapide (pulsante +) ---------- */
function sheetQuick() {
  if (!guard()) return;
  const qa = (act, ic, t, d, cls = '') => `<button type="button" class="qa ${cls}" data-act="qgo" data-go="${act}"><span class="ti">${ic}</span><span><b>${esc(t)}</b><br><span>${esc(d)}</span></span></button>`;
  const rep = x => `<button type="button" class="row" data-act="qprod" data-ric="${esc(x.r.id)}" data-qta="${esc(fmtIn(x.qta))}">${av(esc(x.r.sigla || autoSigla(x.r.nome)), 'pri')}<span class="m"><b>${esc(x.r.nome)}</b><span>${x.n === 1 ? `Fatto ${quando(x.last.data)}` : `Fatto ${x.n} volte in sei settimane, l’ultima ${quando(x.last.data)}`}</span></span><span class="s"><span class="q">${fmtQ(x.qta, unitOk(x.r.resaUnita))}</span></span></button>`;
  openSheet({title: 'Nuova registrazione', small: true,
    body: () => { const ab = prodAbituali(); return `<div class="qgrid">
      ${qa('new-prod', IC.chef, 'Produzione', 'Registra un lotto da una scheda tecnica', 'main')}
      ${ab.length ? `<div class="qrep"><h3>Produci di nuovo</h3><div class="list">${ab.map(rep).join('')}</div></div>` : ''}
      ${qa('new-doc', IC.receipt, 'Acquisto', 'Fattura, DDT o scontrino')}
      ${qa('scarico', IC.sell, 'Scarico', 'Vendita, scarto o uso interno')}
      ${qa('new-ric', IC.doc, 'Scheda tecnica', 'Nuovo prodotto o semilavorato')}
      ${qa('new-art', IC.box, 'Articolo', 'Materia prima, rivendita, imballaggio')}
      ${qa('new-forn', IC.truck, 'Fornitore', 'Ragione sociale e contatti')}
      ${qa('fe-import', IC.down, 'Importa fatture', 'XML o PDF dei fornitori')}
    </div>`; }});
}
/* le produzioni delle ultime sei settimane, dalle più frequenti, con la quantità fatta più spesso:
   un tocco e il modulo è già compilato */
function prodAbituali(n = 3) {
  const t = today(), from = addDays(t, -42), m = new Map();
  for (const p of S.data.produzioni.values()) {
    const r = S.data.ricette.get(p.ricettaId);
    if (!r || r.archiviato || !validIso(p.data) || p.data < from || p.data > t || !(+p.qta > 0)) continue;
    const x = m.get(r.id) || {r, n: 0, last: p, qs: new Map()};
    x.n++;
    if (p.data > x.last.data || (p.data === x.last.data && (p.creato || 0) > (x.last.creato || 0))) x.last = p;
    const q = r6(+p.qta); x.qs.set(q, (x.qs.get(q) || 0) + 1);
    m.set(r.id, x);
  }
  return [...m.values()].map(x => {
    const lq = r6(+x.last.qta);
    x.qta = [...x.qs.entries()].sort((a, b) => b[1] - a[1] || (b[0] === lq) - (a[0] === lq))[0][0];
    return x;
  }).sort((a, b) => b.n - a.n || b.last.data.localeCompare(a.last.data)).slice(0, n);
}
const quando = d => { const n = daysBetween(d, today()); return n <= 0 ? 'oggi' : n === 1 ? 'ieri' : `${n} giorni fa`; };

/* scarico rapido: scegli cosa, poi quanto */
function sheetScarico() {
  if (!guard()) return;
  const o = {title: 'Registra uno scarico', small: true, tall: true, q: '',
    body: () => {
      const q = o.q.trim().toLowerCase();
      const items = [
        ...[...S.data.ricette.values()].map(r => ({tipo: 'ric', it: r, s: ricStock(r.id), u: unitOk(r.resaUnita)})),
        ...[...S.data.articoli.values()].filter(a => !a.archiviato).map(a => ({tipo: 'art', it: a, s: artStock(a.id), u: unitOk(a.unita)}))
      ].filter(x => x.s.usable + x.s.expired > EPS && (x.tipo !== 'ric' || x.it.semilavorato || vendite()) && (!q || String(x.it.nome).toLowerCase().includes(q)))
        .sort((x, y) => (x.tipo === y.tipo ? 0 : x.tipo === 'ric' ? -1 : 1) || byName(x.it, y.it));
      const row = x => `<button type="button" class="row" data-act="scarico-go" data-tipo="${x.tipo}" data-id="${esc(x.it.id)}">${av(x.tipo === 'ric' ? esc(x.it.sigla || autoSigla(x.it.nome)) : catIc(x.it.categoria), x.s.expired > EPS ? 'red' : '')}<span class="m"><b>${esc(x.it.nome)}</b><span>${x.tipo === 'ric' ? 'Prodotto' : esc(CAT[x.it.categoria] || CAT.materia)} · ${x.s.n === 1 ? '1 lotto' : x.s.n + ' lotti'}</span></span><span class="s"><span class="q">${fmtQ(x.s.usable + x.s.expired, x.u)}</span></span></button>`;
      return `<div class="bar">${`<label class="srch">${IC.search}<input type="search" id="q-scarico" data-sq="1" value="${esc(o.q)}" placeholder="Cerca prodotto o articolo" aria-label="Cerca prodotto o articolo" autocomplete="off"></label>`}</div>
        ${items.length ? `<div class="list">${items.map(row).join('')}</div>` : empty(q ? 'Niente corrisponde alla ricerca.' : 'Non c’è niente in giacenza da scaricare.', IC.box)}`;
    }};
  openSheet(o);
}

/* ---------- ricerca unica: la lente in alto ----------
   Un posto solo per cercare tutto. Si sceglie cosa (lotti prodotti, lotti acquistati, documenti, articoli, schede,
   fornitori), per i documenti anche il tipo, per i lotti se hanno ancora giacenza, e il periodo. Si può anche non
   scrivere niente: scelto il tipo, o il periodo, esce l'elenco intero. Si cerca per più parole insieme, senza badare
   agli accenti, anche per data (10/08) o per mese (agosto). Il foglio è a tutta altezza con il campo in cima, così sul
   telefono la tastiera non lo copre. Le scelte restano finché l'app è aperta. */
const CERCA = {q: '', cosa: 'tutto', doc: '', stato: '', cat: '', per: null, n: PAG};
const COSA = {tutto: 'Tutto', prod: 'Lotti prodotti', acq: 'Lotti acquistati', doc: 'Documenti', art: 'Articoli', ric: 'Schede', forn: 'Fornitori'};
const COSA_N = {prod: ['lotto prodotto', 'lotti prodotti'], acq: ['lotto acquistato', 'lotti acquistati'], doc: ['documento', 'documenti'], art: ['articolo', 'articoli'], ric: ['scheda', 'schede'], forn: ['fornitore', 'fornitori']};
const DATATI = ['prod', 'acq', 'doc'];   // i tipi che hanno una data: il periodo vale per loro
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const quandoTxt = iso => validIso(iso) ? `${fmtD(iso)} ${fmtDs(iso)} ${MESI[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : '';
const cercaPer = () => CERCA.per && (CERCA.per.da || CERCA.per.a) ? CERCA.per : null;
const nelPer = iso => { const x = cercaPer(); return !x || (validIso(iso) && (!x.da || iso >= x.da) && (!x.a || iso <= x.a)); };
const contaN = (k, n) => `${n} ${COSA_N[k][n === 1 ? 0 : 1]}`;
/* tutti i risultati di un tipo, già filtrati e ordinati */
function cercaTipo(k) {
  const Dd = drv(), parole = norm(CERCA.q).split(/\s+/).filter(Boolean);
  const ok = (...f) => { if (!parole.length) return true; const h = norm(f.filter(Boolean).join(' ')); return parole.every(w => h.includes(w)); };
  const stato = l => !CERCA.stato || (CERCA.stato === 'giac' ? l.res > EPS : l.res <= EPS);
  const recenti = (a, b) => String(b.data || '').localeCompare(String(a.data || ''));
  if (k === 'prod') return [...Dd.prod.values()].filter(l => stato(l) && nelPer(l.data) && ok(l.p.lotto, lotName(l), l.p.operatore, l.item?.sigla, quandoTxt(l.data), l.p.note))
    .sort((a, b) => recenti(a, b) || (b.p.creato || 0) - (a.p.creato || 0));
  if (k === 'acq') return [...Dd.acq.values()].filter(l => stato(l) && nelPer(l.data) && ok(l.lottoF, lotName(l), fornName(l.doc.fornitoreId), docName(l.doc), quandoTxt(l.data), l.scad && 'scadenza ' + fmtD(l.scad)))
    .sort((a, b) => recenti(a, b) || (b.doc.creato || 0) - (a.doc.creato || 0));
  if (k === 'doc') return [...S.data.documenti.values()].filter(d => (!CERCA.doc || d.tipo === CERCA.doc) && nelPer(d.data)
      && ok(d.numero, TIPI[d.tipo], fornName(d.fornitoreId), d.fatturaRif, quandoTxt(d.data), d.note, ...(d.righe || []).flatMap(r => [S.data.articoli.get(r.articoloId)?.nome, r.lotto])))
    .sort((a, b) => recenti(a, b) || (b.creato || 0) - (a.creato || 0));
  if (k === 'art') return [...S.data.articoli.values()].filter(a => (!a.archiviato || parole.length) && (!CERCA.cat || (a.categoria || 'materia') === CERCA.cat) && ok(a.nome, a.etichetta, CAT[a.categoria] || CAT.materia, fornName(a.fornitoreId))).sort(byName);
  if (k === 'ric') return [...S.data.ricette.values()].filter(r => (!r.archiviato || parole.length) && ok(r.nome, r.sigla, r.categoria, r.semilavorato && 'semilavorato')).sort(byName);
  if (k === 'forn') return [...S.data.fornitori.values()].filter(f => ok(f.nome, f.piva, f.note, f.telefono, f.email)).sort(byName);
  return [];
}
const cercaRiga = (k, x) => k === 'prod' ? prodRow(x) : k === 'acq' ? lotRow(x) : k === 'doc' ? docRow(x) : k === 'art' ? artRow(x) : k === 'ric' ? ricRow(x) : fornRow(x);
const chipC = (act, v, cur, t) => `<button type="button" class="dchip" data-act="${act}" data-v="${esc(v)}" aria-pressed="${cur === v}">${esc(t)}</button>`;
function cercaTesta() {
  const k = CERCA.cosa, per = cercaPer(), lots = k === 'prod' || k === 'acq';
  const sub = k === 'doc' ? [['', 'Tutti i tipi'], ['fattura', 'Fatture'], ['ddt', 'DDT'], ['scontrino', 'Scontrini'], ['inventario', 'Inventario']].map(([v, t]) => chipC('cerca-doc', v, CERCA.doc, t)).join('')
    : lots ? [['', 'Tutti'], ['giac', k === 'prod' && !vendite() ? 'Attivi' : 'Con giacenza'], ['fin', k === 'prod' && !vendite() ? 'In archivio' : 'Finiti']].map(([v, t]) => chipC('cerca-stato', v, CERCA.stato, t)).join('')
    : k === 'art' ? [['', 'Tutti'], ...Object.entries(CAT)].map(([v, t]) => chipC('cerca-cat', v, CERCA.cat, t)).join('') : '';
  const perB = k === 'tutto' || DATATI.includes(k)
    ? per ? `<span class="perbox"><button type="button" class="btn per on" id="per-cerca" data-act="periodo" aria-label="Periodo ${esc(perTxt(per))}: cambia">${IC.cal}<span>${esc(perShort(per))}</span></button><button type="button" class="btn icon per-x" data-act="per-togli" aria-label="Togli il periodo">${IC.x}</button></span>`
      : `<button type="button" class="btn per" id="per-cerca" data-act="periodo">${IC.cal}<span>Periodo</span></button>` : '';
  return `<div class="cerca-top"><label class="srch">${IC.search}<input type="search" id="q-globale" data-gq="1" value="${esc(CERCA.q)}" placeholder="Lotto, prodotto, fattura, fornitore, data…" aria-label="Cerca in tutta l'app" autocomplete="off" enterkeyhint="search"></label>
    <div class="cerca-cosa" role="group" aria-label="Cosa cerchi">${Object.entries(COSA).map(([v, t]) => chipC('cerca-cosa', v, k, t)).join('')}</div>
    ${sub || perB ? `<div class="cerca-f">${perB}${sub ? `<span class="cerca-sub" role="group" aria-label="Filtro">${sub}</span>` : ''}</div>` : ''}</div>`;
}
function cercaRisultati() {
  const k = CERCA.cosa, per = cercaPer(), q = CERCA.q.trim();
  if (k === 'tutto') {
    if (!q && !per) return empty('Scrivi cosa cerchi: codice di un lotto, prodotto, articolo, numero di fattura, fornitore, una data come 10/08 o un mese. Oppure scegli sopra cosa vedere e il periodo: si può cercare anche senza scrivere.', IC.search);
    const out = Object.keys(COSA_N).filter(t => !per || DATATI.includes(t)).map(t => {
      const xs = cercaTipo(t); if (!xs.length) return '';
      return `<h3 class="sres-h">${esc(COSA[t])} <span class="cnt">${xs.length}</span></h3><div class="list">${xs.slice(0, 5).map(x => cercaRiga(t, x)).join('')}</div>
        ${xs.length > 5 ? `<p class="vedi"><button type="button" class="lnk" data-act="cerca-cosa" data-v="${t}">Vedi tutti i ${contaN(t, xs.length)}</button></p>` : ''}`;
    }).join('');
    return (per ? `<p class="persum" id="persum">Lotti e documenti <b>${esc(perTxt(per))}</b></p>` : '') + (out || empty('Nessun risultato.', IC.search));
  }
  const xs = cercaTipo(k), more = xs.length - CERCA.n;
  const tot = k === 'doc' && xs.length ? ` · ${EUR(xs.reduce((t, d) => t + docTot(d), 0))} senza IVA` : '';
  const quando = per && DATATI.includes(k) ? ` <b>${esc(perTxt(per))}</b>` : '';
  return `<p class="persum" id="persum" role="status">${contaN(k, xs.length)}${q ? ' ' + (k === 'ric' ? (xs.length === 1 ? 'trovata' : 'trovate') : xs.length === 1 ? 'trovato' : 'trovati') : ''}${quando}${tot}</p>
    ${xs.length ? `<div class="list">${xs.slice(0, CERCA.n).map(x => cercaRiga(k, x)).join('')}${more > 0 ? `<button type="button" class="row" id="cerca-altri" data-act="cerca-altri">${av(IC.plus)}<span class="m"><b>Mostra altri ${Math.min(more, PAG)}</b><span>${more === 1 ? 'Ne resta 1' : `Ne restano ${more}`}</span></span></button>` : ''}</div>` : empty('Nessun risultato.', IC.search)}`;
}
function sheetSearch() {
  if (top()?.isSearch) return;
  const o = {title: 'Cerca', isSearch: true, tall: true, q: CERCA.q, body: () => `${cercaTesta()}<div class="sres">${cercaRisultati()}</div>`,
    after: x => { const row = $('.cerca-cosa', x.el), c = row && $('[aria-pressed=true]', row); if (c) row.scrollLeft = Math.max(0, c.offsetLeft - (row.clientWidth - c.offsetWidth) / 2); }};
  openSheet(o);
  const i = $('#q-globale', o.el); if (i) { i.focus({preventScroll: true}); try { i.select(); } catch { /* niente da selezionare */ } }
}
/* ridisegna la ricerca aperta, tenendo il campo com'era */
function cercaDipingi() {
  const o = stack.find(x => x.isSearch); if (!o) return;
  const b = $('.sh-body', o.el), y = b.scrollTop; paintSheet(o); b.scrollTop = y;
}
function cercaImposta(ch) { Object.assign(CERCA, ch, {n: PAG}); const o = stack.find(x => x.isSearch); if (o) { $('.sh-body', o.el).scrollTop = 0; paintSheet(o); } }

/* carosello delle etichette */
function scrollLabels(dir) {
  const el = $('#labels'); if (!el) return;
  const card = el.firstElementChild, step = card ? card.getBoundingClientRect().width + 12 : el.clientWidth * 0.8;
  el.scrollBy({left: dir * step, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
}

/* installabile sul telefono quando è pubblicata su un sito (non dentro claude.ai) */
function setupPWA() {
  if (S.mode !== 'local' || !/^https?:$/.test(location.protocol)) return;
  const l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.webmanifest'; document.head.append(l);
  const ic = document.createElement('link'); ic.rel = 'apple-touch-icon'; ic.href = 'icone/icon-180.png'; document.head.append(ic);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(reg => {
      // l'app installata può restare aperta per giorni: quando torna in primo piano controlla se c'è una versione nuova
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { reg.update().catch(() => {}); checkVersion(); } });
    }).catch(() => { /* senza lavoro offline */ });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) checkVersion(); });
  }
  setTimeout(checkVersion, 2500);
}
/* se sul sito c'è una versione diversa da quella aperta, un avviso propone di ricaricare */
let versionAsked = false;
async function checkVersion() {
  const cur = $('meta[name=barista-versione]')?.content;
  if (versionAsked || !cur || !navigator.onLine) return;
  try {
    const html = await (await fetch('index.html', {cache: 'no-cache'})).text();
    const v = html.match(/name="barista-versione" content="([0-9a-f]+)"/)?.[1];
    if (v && v !== cur && !versionAsked) { versionAsked = true; toast('C’è una versione nuova di Barista Flow.', false, {label: 'Aggiorna', stay: true, fn: () => location.reload()}); }
  } catch { /* senza rete: si riprova la prossima volta */ }
}
