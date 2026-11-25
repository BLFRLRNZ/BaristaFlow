/* ---------- Banco: lo scontrino interno ----------
   Alla cassa il bar batte solo il reparto, quindi l'app non sa cosa è stato venduto. Il Banco è lo scontrino
   interno: i prodotti in vendita a tasti grandi, ogni tocco ne aggiunge uno, le quantità si sistemano e si preme
   Invio. Il magazzino si scarica subito, prima dai lotti che scadono prima; l'ultimo scontrino si annulla con un
   tocco e in fondo alla pagina ci sono gli scontrini della giornata. */
const BANCO = {cart: new Map(), pop: null, draft: null, tutti: false, busy: false, t: 0};

/* i prodotti in vendita: le schede tecniche (tranne i semilavorati) e gli articoli di rivendita,
   per categoria e per nome, così ogni tasto resta sempre allo stesso posto */
function bancoItems() {
  const Dd = drv(), out = [];
  const add = (tipo, it, lots, u, cat) => {
    const p = +it.prezzoVendita;
    out.push({k: `${tipo}:${it.id}`, tipo, it, nome: String(it.nome || '').trim() || 'Senza nome', u, cat, s: stockOf(lots), prezzo: p > 0 ? p : null, step: u === 'pz' ? 1 : 0.1});
  };
  for (const r of S.data.ricette.values()) if (!r.archiviato && !r.semilavorato) add('ric', r, Dd.ricLots.get(r.id), unitOk(r.resaUnita) || 'pz', String(r.categoria || '').trim() || 'Altri prodotti');
  for (const a of S.data.articoli.values()) if (!a.archiviato && a.categoria === 'rivendita') add('art', a, Dd.artLots.get(a.id), unitOk(a.unita) || 'pz', 'Rivendita');
  return out.sort((x, y) => bancoCatOrd(x.cat, y.cat) || byName(x, y));
}
const bancoCatOrd = (a, b) => { const r = c => c === 'Rivendita' ? 2 : c === 'Altri prodotti' ? 1 : 0; return r(a) - r(b) || a.localeCompare(b, 'it'); };
const bancoIdx = () => new Map(bancoItems().map(x => [x.k, x]));
const bancoQ = (q, u) => u === 'pz' ? num(q) : fmtQ(q, u);
const bancoPrezzo = x => x.prezzo == null ? '' : EUR(x.prezzo) + (x.u === 'pz' ? '' : '/' + x.u);
const bancoRiga = (nome, q, u) => `${nome} ${u === 'pz' ? '×' + num(q) : fmtQ(q, u)}`;
const bancoResta = x => `${x.nome}: ne ${x.u === 'pz' && x.s.usable === 1 ? 'resta' : 'restano'} solo ${fmtQ(x.s.usable, x.u)}.`;
const bancoDom = k => k.replace(/[^\w-]/g, '-');
const bancoNome = n => esc(n).replace(/(\d) (?=(?:l|cl|ml|g|kg|pz)\b)/gi, '$1\u00a0');

/* le righe dello scontrino in corso, nell'ordine in cui sono state toccate; quelle sparite dall'archivio escono */
function bancoRighe(idx = bancoIdx()) {
  const out = [];
  for (const [k, q] of BANCO.cart) { const x = idx.get(k); if (x && q > EPS) out.push({x, q}); else BANCO.cart.delete(k); }
  return out;
}
function bancoConto(rs) {
  let tot = 0, senza = 0, pz = 0, altro = 0;
  for (const {x, q} of rs) { if (x.prezzo != null) tot += q * x.prezzo; else senza++; if (x.u === 'pz') pz += q; else altro++; }
  return {tot: Math.round(tot * 100) / 100, senza, pz, altro, n: rs.length};
}
const bancoPezzi = c => c.altro ? (c.n === 1 ? '1 prodotto' : `${c.n} prodotti`) : (c.pz === 1 ? '1 pezzo' : `${num(c.pz)} pezzi`);

/* ---------- modifiche allo scontrino ---------- */
function bancoPaint() { clearTimeout(BANCO.t); renderMain(); BANCO.pop = null; refreshSheets(); }
/* una quantità che si sta scrivendo vale subito: su iPhone il tocco su Invio può arrivare prima che il campo la confermi */
function bancoFlush() { if (BANCO.draft) bancoSet(BANCO.draft.k, BANCO.draft.v, true); }
function bancoAdd(k) {
  if (!guard()) return;
  bancoFlush();
  const x = bancoIdx().get(k); if (!x) return;
  if (x.s.usable <= EPS) { toast(x.s.expired > EPS ? `${x.nome}: c’è solo merce scaduta, da smaltire.` : `${x.nome} non risulta in giacenza: registra la produzione o l’acquisto per venderlo.`, true); return; }
  const cur = BANCO.cart.get(k) || 0, nq = r6(Math.min(cur + x.step, x.s.usable));
  if (nq <= cur + EPS) { toast(bancoResta(x), true); return; }
  BANCO.cart.set(k, nq); BANCO.pop = k; bancoPaint();
}
function bancoSub(k) {
  bancoFlush();
  const cur = BANCO.cart.get(k); if (!cur) return;
  const x = bancoIdx().get(k), nq = r6(cur - (x?.step || 1));
  if (nq <= EPS) BANCO.cart.delete(k); else BANCO.cart.set(k, nq);
  bancoPaint();
}
/* quantità scritta a mano: vuota o zero toglie la riga, oltre la giacenza si ferma a quella */
function bancoSet(k, v, later) {
  BANCO.draft = null;
  const x = bancoIdx().get(k);
  let q = String(v ?? '').trim() === '' ? 0 : pnum(v);
  if (x && !(q >= 0)) toast('Quantità non valida.', true);
  else if (x) {
    if (x.u === 'pz') q = Math.round(q);
    if (q > x.s.usable + EPS) { toast(bancoResta(x), true); q = x.s.usable; }
    if (q <= EPS) BANCO.cart.delete(k); else BANCO.cart.set(k, r6(q));
  }
  // dopo aver scritto si tocca spesso subito Invio: la pagina si ridisegna un attimo dopo, così quel tocco non va perso
  if (later) { clearTimeout(BANCO.t); BANCO.t = setTimeout(bancoPaint, 400); } else bancoPaint();
}
function bancoSvuota() {
  if (!BANCO.cart.size) return;
  const prima = new Map(BANCO.cart);
  BANCO.cart.clear(); BANCO.draft = null;
  if (top()?.banco) closeSheet();
  bancoPaint();
  toast('Scontrino svuotato', false, {label: 'Ripristina', fn: () => { if (BANCO.cart.size) return; BANCO.cart = prima; bancoPaint(); }});
}

/* Invio: una vendita per ogni lotto toccato, prima i lotti che scadono prima; tutto o niente */
async function bancoInvio() {
  if (!guard() || BANCO.busy) return;
  bancoFlush();
  const rs = bancoRighe();
  if (!rs.length) { toast('Tocca prima i prodotti venduti.', true); return; }
  // la giacenza si ricontrolla adesso: da un altro dispositivo qualcuno può aver venduto o scaricato
  const corto = rs.find(r => r.q > r.x.s.usable + EPS);
  if (corto) { toast(`${bancoResta(corto.x)} Correggi la quantità.`, true); return; }
  const t = today(), Dd = drv(), id = 'bc' + uid(), ult = bancoScontrini(t)[0];
  const creato = Math.max(Date.now(), (ult?.creato || 0) + 1), d = new Date(creato), ora = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const extra = countSample() ? {esempio: true} : {};   // durante la prova anche le vendite sono di prova
  const ops = [];
  for (const {x, q} of rs) {
    let rem = q;
    for (const l of (x.tipo === 'ric' ? Dd.ricLots : Dd.artLots).get(x.it.id) || []) {
      if (rem <= EPS) break;
      if (l.res <= EPS || (l.scad && l.scad < t)) continue;
      const qq = r6(Math.min(l.res, rem)); rem = r6(rem - qq);
      ops.push(['movimenti', uid(), {data: t, tipo: 'vendita', lotKind: l.kind, lotId: l.key, delta: -qq, nota: `Banco, ore ${ora}`, banco: id, ...(x.prezzo != null ? {prezzo: x.prezzo} : {}), creato, ...extra}]);
    }
  }
  const c = bancoConto(rs), prima = new Map(BANCO.cart);
  // lo scontrino si libera subito: si può già battere il prossimo mentre questo si salva
  BANCO.busy = true; BANCO.cart.clear(); BANCO.draft = null; UI.q.banco = '';
  if (top()?.banco) closeSheet();
  let ok = 0;
  try { ok = await writeMany(ops); } finally { BANCO.busy = false; }
  if (ok < ops.length) {
    await writeMany(ops.map(([col, i]) => [col, i, null]));
    if (!BANCO.cart.size) BANCO.cart = prima;
    bancoPaint();
    toast('Scontrino non registrato: controlla la connessione e riprova.', true);
    return;
  }
  buzz(); bancoPaint();
  toast(`Scontrino registrato: ${bancoPezzi(c)}${c.tot > 0 ? ' · ' + EUR(c.tot) : ''}`, false, {label: 'Annulla', fn: () => bancoAnnulla(id, true)});
}
async function bancoAnnulla(id, subito) {
  if (!guard()) return;
  const ms = [...S.data.movimenti.values()].filter(m => m.banco === id);
  if (!ms.length) return;
  if (!subito) {
    const s = bancoScontrini(ms[0].data).find(x => x.id === id);
    if (!(await ask(`Annullo lo scontrino delle ${s?.ora || '—'}${s ? ` (${bancoPezzi(s)}${s.tot > 0 ? ', ' + EUR(s.tot) : ''})` : ''}? I prodotti tornano in giacenza.`, 'Sì, annulla', true, 'No, lascialo'))) return;
  }
  const ok = await writeMany(ms.map(m => ['movimenti', m.id, null]));
  toast(ok === ms.length ? 'Scontrino annullato: i prodotti sono tornati in giacenza.' : 'Non sono riuscito ad annullare tutto lo scontrino: riprova.', ok < ms.length);
}

/* gli scontrini di un giorno, dal più recente: righe per prodotto (anche se presi da più lotti) e totale */
function bancoScontrini(t = today()) {
  const Dd = drv(), m = new Map();
  for (const v of S.data.movimenti.values()) {
    if (!v.banco || v.data !== t) continue;
    let s = m.get(v.banco);
    if (!s) m.set(v.banco, s = {id: v.banco, creato: +v.creato || 0, righe: new Map(), tot: 0, senza: 0, pz: 0, altro: 0});
    const l = (v.lotKind === 'prod' ? Dd.prod : Dd.acq).get(v.lotId), k = l ? `${l.kind}:${l.itemId}` : 'x';
    const r = s.righe.get(k) || {nome: l ? lotName(l) : 'Prodotto eliminato', u: l ? lotUnit(l) : '', q: 0, prezzo: +v.prezzo > 0 ? +v.prezzo : null};
    r.q = r6(r.q + Math.abs(+v.delta || 0)); s.righe.set(k, r);
  }
  for (const s of m.values()) {
    for (const r of s.righe.values()) { if (r.prezzo != null) s.tot += r.q * r.prezzo; else s.senza++; if (r.u === 'pz') s.pz += r.q; else s.altro++; }
    s.tot = Math.round(s.tot * 100) / 100; s.n = s.righe.size;
    const d = new Date(s.creato); s.ora = s.creato ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
  }
  return [...m.values()].sort((a, b) => b.creato - a.creato || (a.id < b.id ? 1 : -1));
}
const bancoDesc = s => [...s.righe.values()].map(r => bancoRiga(r.nome, r.q, r.u)).join(', ');

/* ---------- la pagina ---------- */
function vBanco() {
  const all = bancoItems(), idx = new Map(all.map(x => [x.k, x])), rs = bancoRighe(idx), c = bancoConto(rs), sc = bancoScontrini();
  const head = `<div class="ph"><div><h1>Banco</h1><p>Tocca i prodotti venduti e premi Invio: il magazzino si aggiorna da solo.</p></div></div>`;
  if (!all.length) return `<section id="v-banco">${head}${empty('Non c’è ancora niente da vendere. Al Banco compaiono le schede tecniche dei prodotti (non i semilavorati) e gli articoli di rivendita, come le bibite.', IC.banco)}
    <div class="acts w bk-new"><button type="button" class="btn" data-act="new-ric">${IC.plus}Nuova scheda tecnica</button><button type="button" class="btn" data-act="banco-new-art">${IC.plus}Nuovo articolo di rivendita</button></div></section>`;
  const cats = [...new Set(all.map(x => x.cat))];
  if (UI.bancoCat && !cats.includes(UI.bancoCat)) UI.bancoCat = '';
  const q = UI.q.banco.trim().toLowerCase();
  const vis = all.filter(x => (!UI.bancoCat || x.cat === UI.bancoCat) && (!q || x.nome.toLowerCase().includes(q)));
  const groups = [];
  for (const x of vis) { let g = groups[groups.length - 1]; if (!g || g.c !== x.cat) groups.push(g = {c: x.cat, xs: []}); g.xs.push(x); }
  const heads = !UI.bancoCat && cats.length > 1;
  const grid = groups.length ? groups.map(g => `${heads ? `<h3 class="bk-gh">${esc(g.c)}</h3>` : ''}<div class="bgrid">${g.xs.map(bancoTasto).join('')}</div>`).join('')
    : empty(q ? 'Nessun prodotto corrisponde alla ricerca.' : 'Nessun prodotto in questa categoria.', IC.search);
  const bar = S.ro ? '' : bancoBar(rs, c, sc[0]);
  return `<section id="v-banco"${bar ? ' class="has-bar"' : ''}>${head}
    <div class="bk"><div class="bk-main">
      <div class="bar">${search('banco', 'Cerca un prodotto')}${cats.length > 1 ? seg('bancoCat', [['', 'Tutti'], ...cats.map(x => [x, x])]) : ''}</div>
      ${S.ro ? `<p class="note">${IC.info}<span>Hai accesso solo in lettura: puoi guardare i prodotti, ma non registrare vendite.</span></p>` : ''}
      ${grid}${bancoOggi(sc)}</div>
      ${S.ro ? '' : bancoSide(rs, c, sc[0])}</div>${bar}</section>`;
}
function bancoTasto(x) {
  const q = BANCO.cart.get(x.k) || 0, off = x.s.usable <= EPS, exp = off && x.s.expired > EPS;
  const stato = off ? (exp ? 'Scaduto' : 'Esaurito') : fmtQ(x.s.usable, x.u), pr = bancoPrezzo(x);
  const label = `${x.nome}: ${off ? stato.toLowerCase() : 'disponibili ' + stato}${pr ? ', ' + pr : ''}${q ? `, nello scontrino ${bancoQ(q, x.u)}` : ''}`;
  return `<div class="bt${q ? ' sel' : ''}${off ? ' off' : ''}${exp ? ' exp' : ''}${BANCO.pop === x.k ? ' pop' : ''}"><button type="button" class="bt-add" id="bk-${bancoDom(x.k)}" data-act="banco-add" data-k="${esc(x.k)}" aria-label="${esc(label)}"${off ? ' aria-disabled="true"' : ''}><span class="bt-n">${bancoNome(x.nome)}</span><span class="bt-f"><span class="bt-s">${esc(stato)}</span>${pr ? `<span class="bt-p">${esc(pr)}</span>` : ''}</span></button>${q ? `<span class="bt-q" aria-hidden="true">${esc(bancoQ(q, x.u))}</span><button type="button" class="bt-sub" id="bm-${bancoDom(x.k)}" data-act="banco-sub" data-k="${esc(x.k)}" aria-label="Uno in meno: ${esc(x.nome)}">${IC.minus}</button>` : ''}</div>`;
}
/* le righe con le quantità da sistemare: nel riquadro di lato (computer) o nel foglio dello scontrino (telefono) */
function bancoRigheHtml(rs, pre) {
  return `<div class="bk-rows">${rs.map(({x, q}) => {
    const d = bancoDom(x.k), v = BANCO.draft?.k === x.k ? BANCO.draft.v : fmtIn(q);
    return `<div class="bk-r"><span class="bk-rn"><b>${bancoNome(x.nome)}</b><small>${x.prezzo != null ? `${esc(bancoPrezzo(x))}${x.u === 'pz' ? ' l’uno' : ''} · ${EUR(q * x.prezzo)}` : 'Senza prezzo di vendita'}</small></span>
      <span class="bk-st"><button type="button" class="btn icon" id="${pre}m-${d}" data-act="banco-sub" data-k="${esc(x.k)}" aria-label="Uno in meno: ${esc(x.nome)}">${IC.minus}</button><input type="text" inputmode="${x.u === 'pz' ? 'numeric' : 'decimal'}" id="${pre}q-${d}" data-bq="${esc(x.k)}" value="${esc(v)}" aria-label="Quantità di ${esc(x.nome)}${x.u === 'pz' ? '' : ' in ' + x.u}" autocomplete="off" enterkeyhint="done">${x.u === 'pz' ? '' : `<small class="bk-u">${esc(x.u)}</small>`}<button type="button" class="btn icon" id="${pre}p-${d}" data-act="banco-add" data-k="${esc(x.k)}" aria-label="Uno in più: ${esc(x.nome)}">${IC.plus}</button></span></div>`;
  }).join('')}</div>`;
}
const bancoTot = c => `<div class="bk-tot"><span>${c.n ? esc(bancoPezzi(c)) : 'Totale'}</span><b>${EUR(c.tot)}</b></div>${c.senza ? `<p class="hint bk-senza">${c.senza === 1 ? 'Un prodotto non ha' : `${c.senza} prodotti non hanno`} il prezzo di vendita: non entra nel totale.</p>` : ''}`;
function bancoSide(rs, c, last) {
  return `<aside class="bk-side" aria-label="Scontrino"><div class="bk-card">
      <div class="bk-h"><h2>Scontrino</h2>${rs.length ? '<button type="button" class="lnk" data-act="banco-svuota">Svuota</button>' : ''}</div>
      ${rs.length ? bancoRigheHtml(rs, 'b') : '<p class="bk-vuoto">Tocca i prodotti venduti: compaiono qui, con le quantità.</p>'}
      ${bancoTot(c)}
      <button type="button" class="btn pri bk-ok" id="bk-invio" data-act="banco-invio"${rs.length ? '' : ' disabled'}>Invio</button>
      <p class="hint bk-kbd">Con la tastiera basta premere Invio.</p></div>
    ${last ? `<div class="bk-last"><span class="m"><b>Ultimo scontrino · ${esc(last.ora)}</b><span>${esc(bancoPezzi(last))}${last.tot > 0 ? ' · ' + EUR(last.tot) : ''} · ${esc(bancoDesc(last))}</span></span><button type="button" class="btn sm" data-act="banco-annulla" data-id="${esc(last.id)}">Annulla</button></div>` : ''}</aside>`;
}
/* sul telefono: in basso lo scontrino in corso con Invio; a scontrino vuoto, l'ultimo battuto da annullare */
function bancoBar(rs, c, last) {
  if (rs.length) return `<div class="bk-bar on" role="region" aria-label="Scontrino in corso"><button type="button" class="bk-sum" data-act="banco-apri" aria-label="Apri lo scontrino per cambiare le quantità"><b>${esc(bancoPezzi(c))}</b><span>${c.tot > 0 || !c.senza ? EUR(c.tot) : 'Senza prezzi'} · Modifica</span></button><button type="button" class="bk-x" data-act="banco-svuota" aria-label="Svuota lo scontrino">${IC.x}</button><button type="button" class="bk-inv" data-act="banco-invio">Invio</button></div>`;
  if (last) return `<div class="bk-bar" role="region" aria-label="Ultimo scontrino"><span class="m"><b>Ultimo scontrino · ${esc(last.ora)}</b><span>${esc(bancoPezzi(last))}${last.tot > 0 ? ' · ' + EUR(last.tot) : ''} · ${esc(bancoDesc(last))}</span></span><button type="button" class="btn sm" data-act="banco-annulla" data-id="${esc(last.id)}">Annulla</button></div>`;
  return '';
}
function bancoOggi(sc) {
  if (!sc.length) return '';
  const tot = Math.round(sc.reduce((s, x) => s + x.tot, 0) * 100) / 100, pz = r6(sc.reduce((s, x) => s + x.pz, 0)), senza = sc.some(x => x.senza);
  const vis = BANCO.tutti || sc.length <= 5 ? sc : sc.slice(0, 4);
  const row = s => `<div class="row has-act"><span class="row-main">${av(IC.receipt)}<span class="m"><b>${esc(s.ora)}${s.tot > 0 ? ' · ' + EUR(s.tot) : ''}</b><span>${esc(bancoDesc(s))}</span></span></span>${S.ro ? '' : `<button type="button" class="btn sm" data-act="banco-annulla" data-id="${esc(s.id)}">Annulla</button>`}</div>`;
  return `<h2 id="bk-oggi">Scontrini di oggi</h2>
    <p class="bk-stat">${sc.length === 1 ? '1 scontrino' : `${sc.length} scontrini`}${pz ? ` · ${num(pz)} ${pz === 1 ? 'pezzo' : 'pezzi'}` : ''}${tot > 0 ? ` · ${EUR(tot)}${senza ? ' (senza i prodotti che non hanno prezzo)' : ''}` : ''}</p>
    <div class="list bk-list">${vis.map(row).join('')}${vis.length < sc.length ? `<button type="button" class="row" data-act="banco-tutti">${av(IC.clock)}<span class="m"><b>Altri ${sc.length - vis.length} scontrini</b><span>Mostra tutti quelli di oggi</span></span></button>` : ''}</div>`;
}
/* il foglio dello scontrino sul telefono, per cambiare le quantità o scriverle */
function sheetBanco() {
  if (top()?.banco) return;
  openSheet({title: 'Scontrino', small: true, live: true, banco: true,
    body: () => { const rs = bancoRighe(), c = bancoConto(rs); return rs.length ? bancoRigheHtml(rs, 's') + bancoTot(c) : empty('Lo scontrino è vuoto: tocca i prodotti venduti.', IC.banco); },
    foot: () => BANCO.cart.size ? '<button type="button" class="btn" data-act="banco-svuota">Svuota</button><button type="button" class="btn pri" data-act="banco-invio">Invio</button>' : ''});
}

/* Invio da tastiera: nella ricerca aggiunge l'unico prodotto trovato, su una quantità la conferma, altrove registra */
function bancoEnter(e) {
  if (e.isComposing || route() !== 'banco' || (stack.length && !top()?.banco)) return false;
  const t = e.target;
  if (t.dataset?.bq !== undefined) {
    e.preventDefault(); bancoSet(t.dataset.bq, t.value);
    $('[data-act=banco-invio]:not([disabled])', stack.length ? top().el : $('.bk-side') || document)?.focus({preventScroll: true});
    return true;
  }
  if (t.id === 'q-banco' && t.value.trim()) {
    e.preventDefault();
    const q = t.value.trim().toLowerCase(), m = bancoItems().filter(x => x.s.usable > EPS && (!UI.bancoCat || x.cat === UI.bancoCat) && x.nome.toLowerCase().includes(q));
    if (m.length === 1) { UI.q.banco = ''; bancoAdd(m[0].k); }
    else toast(m.length ? 'Più prodotti corrispondono: scrivi qualche lettera in più o tocca quello giusto.' : 'Nessun prodotto in giacenza corrisponde alla ricerca.', true);
    return true;
  }
  if (t.id !== 'q-banco' && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || (t.closest?.('button, a') && !t.closest('.bt, [data-act=banco-invio]')))) return false;
  if (!BANCO.cart.size) return false;
  e.preventDefault(); if (!e.repeat) bancoInvio();
  return true;
}
