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
  const o = {title: 'Registra uno scarico', small: true, q: '',
    body: () => {
      const q = o.q.trim().toLowerCase();
      const items = [
        ...[...S.data.ricette.values()].map(r => ({tipo: 'ric', it: r, s: ricStock(r.id), u: unitOk(r.resaUnita)})),
        ...[...S.data.articoli.values()].filter(a => !a.archiviato).map(a => ({tipo: 'art', it: a, s: artStock(a.id), u: unitOk(a.unita)}))
      ].filter(x => x.s.usable + x.s.expired > EPS && (!q || String(x.it.nome).toLowerCase().includes(q)))
        .sort((x, y) => (x.tipo === y.tipo ? 0 : x.tipo === 'ric' ? -1 : 1) || byName(x.it, y.it));
      const row = x => `<button type="button" class="row" data-act="scarico-go" data-tipo="${x.tipo}" data-id="${esc(x.it.id)}">${av(x.tipo === 'ric' ? esc(x.it.sigla || autoSigla(x.it.nome)) : catIc(x.it.categoria), x.s.expired > EPS ? 'red' : '')}<span class="m"><b>${esc(x.it.nome)}</b><span>${x.tipo === 'ric' ? 'Prodotto' : esc(CAT[x.it.categoria] || CAT.materia)} · ${x.s.n === 1 ? '1 lotto' : x.s.n + ' lotti'}</span></span><span class="s"><span class="q">${fmtQ(x.s.usable + x.s.expired, x.u)}</span></span></button>`;
      return `<div class="bar">${`<label class="srch">${IC.search}<input type="search" id="q-scarico" data-sq="1" value="${esc(o.q)}" placeholder="Cerca prodotto o articolo" aria-label="Cerca prodotto o articolo" autocomplete="off"></label>`}</div>
        ${items.length ? `<div class="list">${items.map(row).join('')}</div>` : empty(q ? 'Niente corrisponde alla ricerca.' : 'Non c’è niente in giacenza da scaricare.', IC.box)}`;
    }};
  openSheet(o);
}

/* ricerca globale: lotti, articoli, schede, documenti, fornitori */
function sheetSearch() {
  if (top()?.isSearch) return;
  const o = {title: 'Cerca', isSearch: true, q: '',
    body: () => {
      const q = o.q.trim().toLowerCase();
      if (q.length < 2) return `<div class="bar">${searchInput(o)}</div>${empty('Scrivi almeno due lettere: codice di un lotto (anche del fornitore), prodotto, articolo, numero di fattura o fornitore.', IC.search)}`;
      const Dd = drv(), has = v => String(v || '').toLowerCase().includes(q);
      const prod = [...Dd.prod.values()].filter(l => has(l.p.lotto) || has(lotName(l))).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 6);
      const acq = [...Dd.acq.values()].filter(l => l.lottoF && has(l.lottoF)).slice(0, 6);
      const arts = [...S.data.articoli.values()].filter(a => has(a.nome) || has(a.etichetta)).sort(byName).slice(0, 6);
      const ric = [...S.data.ricette.values()].filter(r => has(r.nome) || has(r.sigla)).sort(byName).slice(0, 6);
      const docs = [...S.data.documenti.values()].filter(d => has(d.numero) || has(docName(d)) || has(fornName(d.fornitoreId)) || has(d.fatturaRif)).sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 6);
      const forn = [...S.data.fornitori.values()].filter(f => has(f.nome) || has(f.piva)).sort(byName).slice(0, 6);
      const sec = (t, rows) => rows.length ? `<h3>${esc(t)}</h3><div class="list">${rows.join('')}</div>` : '';
      const out = [
        sec('Lotti prodotti', prod.map(l => prodRow(l))),
        sec('Lotti dei fornitori', acq.map(l => lotRow(l))),
        sec('Articoli', arts.map(artRow)),
        sec('Schede tecniche', ric.map(r => `<button type="button" class="row" data-act="open-ric" data-id="${esc(r.id)}">${av(esc(r.sigla || autoSigla(r.nome)), 'pri')}<span class="m"><b>${esc(r.nome)}</b><span>${esc(r.categoria || 'Senza categoria')}${r.semilavorato ? ' · semilavorato' : ''}</span></span></button>`)),
        sec('Documenti', docs.map(d => `<button type="button" class="row" data-act="open-doc" data-id="${esc(d.id)}">${av(DOCAB[d.tipo] || 'DOC')}<span class="m"><b>${esc(docName(d))}</b><span>${esc(fornName(d.fornitoreId) || '—')}</span></span><span class="s"><span class="q">${EUR(docTot(d))}</span></span></button>`)),
        sec('Fornitori', forn.map(f => `<button type="button" class="row" data-act="open-forn" data-id="${esc(f.id)}">${av(initials(f.nome))}<span class="m"><b>${esc(f.nome)}</b><span>${esc(f.note || f.piva || 'Fornitore')}</span></span></button>`))
      ].join('');
      return `<div class="bar">${searchInput(o)}</div><div class="sres">${out || empty('Nessun risultato.', IC.search)}</div>`;
    }};
  openSheet(o);
  const i = $('#q-globale', o.el); if (i) i.focus({preventScroll: true});
}
const searchInput = o => `<label class="srch">${IC.search}<input type="search" id="q-globale" data-gq="1" value="${esc(o.q)}" placeholder="Lotto, prodotto, fattura, fornitore…" aria-label="Cerca in tutta l'app" autocomplete="off" enterkeyhint="search"></label>`;

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
