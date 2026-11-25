/* ---------- disegno della pagina ---------- */
let raf = 0;
function bump() { S.ver++; schedule(); notifSoon(); }
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); }
function paint() { renderChrome(); renderMain(); refreshSheets(); }
const VIEWS = {oggi: vOggi, banco: vBanco, produzione: vProduzione, schede: vSchede, magazzino: vMagazzino, acquisti: vAcquisti, prezzi: vPrezzi, fornitori: vFornitori, impostazioni: vImpostazioni};
const TITOLI = {oggi: 'Oggi', banco: 'Banco', produzione: 'Produzione', schede: 'Schede tecniche', magazzino: 'Magazzino', acquisti: 'Acquisti', prezzi: "Prezzi d'acquisto", fornitori: 'Fornitori', impostazioni: 'Impostazioni'};
const TAB = {schede: 'produzione', prezzi: 'acquisti', fornitori: 'acquisti'};
const route = () => { const h = location.hash.slice(1); return VIEWS[h] ? h : 'oggi'; };

function renderChrome() {
  const r = route(), tab = TAB[r] || r;
  $$('#tabs a').forEach(a => a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  const cl = $('#cfgLink'); if (r === 'impostazioni') cl.setAttribute('aria-current', 'page'); else cl.removeAttribute('aria-current');
  const sub = cfg().nome || 'Banco e laboratorio';
  $('#bizName').textContent = sub; $('#bizName2').textContent = sub;
  $('#tbTitle').textContent = TITOLI[r];
  const sy = $('#sync'); let t = '', w = false;
  if (S.mode === 'local') t = 'Dati nel browser';
  else if (S.mode === 'temp') { t = 'Prova: non salva'; w = true; }
  else if (S.mode === 'cloud') {
    if (S.ro) t = 'Sola lettura';
    else if (S.slow) { t = 'Connessione lenta'; w = true; }
    else if (S.fresh.size < COLS.length) t = 'Aggiorno…';
  }
  const demo = S.mode !== 'loading' && countSample() > 0;
  $('#demoPill').hidden = !demo;
  sy.textContent = demo && !w ? '' : t; sy.classList.toggle('warn', w);
}
function renderMain() {
  const main = $('#main');
  const ae = document.activeElement;
  const fid = ae && main.contains(ae) && ae.id ? ae.id : null;
  const sel = fid && typeof ae.selectionStart === 'number' ? [ae.selectionStart, ae.selectionEnd] : null;
  const html = (S.mode === 'loading' || (S.got.size < COLS.length && !S.slow))
    ? `<div class="skel" role="status" aria-label="Carico i dati"><div class="sk" style="height:22px;width:40%"></div><div class="sk" style="height:42px;width:65%"></div><div class="tiles"><div class="sk" style="height:118px"></div><div class="sk" style="height:118px"></div><div class="sk" style="height:118px"></div><div class="sk" style="height:118px"></div></div><div class="sk" style="height:66px"></div><div class="sk" style="height:66px"></div><div class="sk" style="height:66px"></div></div>`
    : VIEWS[route()]();
  if (main._h === html) return;
  main.innerHTML = html; main._h = html;
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus({preventScroll: true}); if (sel && el.setSelectionRange) { try { el.setSelectionRange(sel[0], sel[1]); } catch { /* campo senza selezione */ } } } }
}

/* ---------- componenti ---------- */
const empty = (t, ic = IC.info) => `<div class="empty"><span class="ei">${ic}</span><span>${esc(t)}</span></div>`;
const search = (k, ph) => `<label class="srch">${IC.search}<input type="search" id="q-${k}" data-q="${k}" value="${esc(UI.q[k])}" placeholder="${esc(ph)}" aria-label="${esc(ph)}" autocomplete="off"></label>`;
const seg = (k, opts) => `<div class="seg" role="group">${opts.map(([v, t]) => `<button type="button" data-act="seg" data-k="${k}" data-v="${esc(v)}" aria-pressed="${UI[k] === v}">${esc(t)}</button>`).join('')}</div>`;
const navSeg = (cur, opts) => `<div class="seg" role="group">${opts.map(([v, t]) => `<button type="button" data-act="nav" data-to="${v}" aria-pressed="${cur === v}">${esc(t)}</button>`).join('')}</div>`;
const algChips = (al, tr) => `<div class="chips">${al.length ? al.map(a => `<span class="chip al">${esc(ALGN[a])}</span>`).join('') : '<span class="chip">Nessuno dei 14 allergeni</span>'}${(tr || []).map(a => `<span class="chip">Tracce: ${esc(ALGN[a].toLowerCase())}</span>`).join('')}</div>`;
/* i riquadri di «Oggi» filtrano l'elenco delle cose da fare; toccati di nuovo lo riaprono tutto */
const tile = (cls, n, label, f, ic) => `<button type="button" class="tile ${n ? cls : ''}" id="tile-${f}" data-act="todo-f" data-f="${f}" aria-pressed="${UI.todoF === f}" aria-controls="todo"><span class="ti">${ic}</span><b>${n}</b><span>${esc(label)}</span></button>`;
const av = (content, tone = '') => `<span class="av ${tone}" aria-hidden="true">${content}</span>`;
const catIc = c => c === 'rivendita' ? IC.bottle : c === 'imballaggio' ? IC.bag : IC.wheat;
const sigOf = l => esc(String(l.p?.lotto || '').split('-')[0].slice(0, 4) || 'LOT');
const initials = s => esc(String(s || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?');
function modeNote() {
  if (S.mode === 'temp') return `<p class="note warn">${IC.alert}<span>In questa vista l'archivio non è disponibile: puoi provare l'app, ma quello che inserisci non viene salvato. Aprila da claude.ai con l'accesso effettuato.</span></p>`;
  if (S.mode === 'local') return `<p class="note">${IC.info}<span>I dati sono salvati solo in questo browser. Esporta un backup ogni tanto da Impostazioni.</span></p>`;
  if (S.slow) return `<p class="note warn">${IC.alert}<span>I dati non sono ancora tutti arrivati: quello che vedi potrebbe non essere aggiornato. La pagina si aggiorna da sola.</span></p>`;
  return '';
}
function labelCard(l) {
  const s = st(l), p = l.p, u = lotUnit(l);
  return `<button type="button" class="lab ${s.c}" data-act="open-lotto" data-id="${esc(l.key)}">
    <span class="lab-top"><span>${esc(s.t)}</span>${IC.clock}</span>
    <span class="lab-body"><span class="lab-name">${esc(lotName(l))}</span><span class="lab-lot">${esc(p.lotto)}</span>
    <span class="lab-grid"><span><small>Prodotto</small><b>${fmtDs(p.data)}</b></span><span><small>${p.tipoScadenza === 'entro' ? 'Scade' : 'Pref. entro'}</small><b>${fmtDs(l.scad)}</b></span><span><small>Residuo</small><b>${fmtQ(l.res, u)}</b></span></span></span></button>`;
}
function lotInner(l) {
  const s = st(l);
  const sub = l.kind === 'prod' ? `Lotto ${l.p.lotto} · prodotto il ${fmtD(l.data)}` : `${l.lottoF ? 'Lotto ' + l.lottoF + ' · ' : ''}${docName(l.doc)}`;
  return `${av(l.kind === 'prod' ? sigOf(l) : catIc(l.item?.categoria), s.c)}<span class="m"><b>${esc(lotName(l))}</b><span>${esc(sub)}</span><span class="mc"><span class="chip ${s.c}">${esc(s.t)}</span></span></span>
    <span class="s"><span class="q">${fmtQ(l.res, lotUnit(l))}</span></span>`;
}
function lotRow(l, action) {
  const act = l.kind === 'prod' ? 'open-lotto' : 'open-acq';
  if (action && !S.ro) return `<div class="row has-act"><button type="button" class="row-main" data-act="${act}" data-id="${esc(l.key)}">${lotInner(l)}</button>${action}</div>`;
  return `<button type="button" class="row" data-act="${act}" data-id="${esc(l.key)}">${lotInner(l)}</button>`;
}
function prodRow(l) {
  const s = st(l), u = lotUnit(l);
  return `<button type="button" class="row" data-act="open-lotto" data-id="${esc(l.key)}">${av(sigOf(l), s.c)}
    <span class="m"><b>${esc(lotName(l))}</b><span>${esc(l.p.lotto)} · ${fmtD(l.data)}${l.p.operatore ? ' · ' + esc(l.p.operatore) : ''}</span><span class="mc"><span class="chip ${s.c}">${esc(s.t)}</span></span></span>
    <span class="s"><span class="q">${fmtQ(l.res, u)}</span><small class="muted">su ${fmtQ(l.qta, u)}</small></span></button>`;
}
function underRow(a) {
  const s = artStock(a.id);
  const inner = `${av(catIc(a.categoria), 'amb')}<span class="m"><b>${esc(a.nome)}</b><span>Ne hai ${fmtQ(s.usable, a.unita)}, scorta minima ${fmtQ(+a.scortaMin, a.unita)}${a.fornitoreId && fornName(a.fornitoreId) ? ' · ' + esc(fornName(a.fornitoreId)) : ''}</span><span class="mc"><span class="chip amb">Sotto scorta</span></span></span>`;
  if (S.ro) return `<button type="button" class="row" data-act="open-art" data-id="${esc(a.id)}">${inner}</button>`;
  return `<div class="row has-act"><button type="button" class="row-main" data-act="open-art" data-id="${esc(a.id)}">${inner}</button><button type="button" class="btn sm w" data-act="riordina" data-id="${esc(a.id)}">Riordina</button></div>`;
}
function spark(s) {
  if (!s || s.length < 2) return '';
  const W = 72, H = 26, ps = s.map(x => x.p), lo = Math.min(...ps), hi = Math.max(...ps);
  const t0 = parseIso(s[0].date).getTime(), t1 = parseIso(s[s.length - 1].date).getTime();
  const X = x => t1 > t0 ? 4 + (parseIso(x.date).getTime() - t0) / (t1 - t0) * (W - 8) : W / 2;
  const Y = v => hi > lo ? 4 + (1 - (v - lo) / (hi - lo)) * (H - 8) : H / 2;
  const l = s[s.length - 1];
  return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${s.map(x => `${X(x).toFixed(1)},${Y(x.p).toFixed(1)}`).join(' ')}"/><circle cx="${X(l).toFixed(1)}" cy="${Y(l.p).toFixed(1)}" r="3.5"/></svg>`;
}
const dcls = x => x == null || !isFinite(x) || Math.abs(x) < 0.005 ? '' : x > 0 ? 'up' : 'down';
const arw = up => `<span class="arw" aria-hidden="true">${up ? '▲' : '▼'}</span>`;
const delta = (x, label) => (x == null || !isFinite(x)) ? '' : `<span class="chip ${dcls(x)}"><span>${Math.abs(x) < 0.005 ? 'Stabile' : `${arw(x > 0)} ${pct(x)}`}${label ? ' ' + esc(label) : ''}</span></span>`;

/* ---------- Oggi ---------- */
function rincariRecenti() {
  const t = today(), soglia = cfg().sogliaRincaro / 100, d30 = addDays(t, -30);
  return [...drv().prices.entries()].map(([id, s]) => {
    const a = S.data.articoli.get(id); if (!a || a.archiviato || s.length < 2) return null;
    const l = s[s.length - 1], pv = s[s.length - 2], ch = pv.p > 0 ? (l.p - pv.p) / pv.p : 0;
    return l.date >= d30 && ch > 0.0001 && ch >= soglia ? {a, l, pv, ch} : null;
  }).filter(Boolean).sort((x, y) => y.ch - x.ch);
}
function vBenvenuto() {
  return `<section id="v-oggi"><div class="welcome"><span class="logo" aria-hidden="true">${LOGO}</span>
    <h1>Benvenuto in Barista Flow</h1>
    <p>Schede tecniche, lotti con scadenze e fatture, giacenze e prezzi d'acquisto del tuo bar, sempre a portata di mano.</p></div>
    ${modeNote()}
    <div class="wl-opts">
      <button type="button" class="qa main" data-act="load-sample"><span class="ti">${IC.chef}</span><span><b>Esplora con i dati di esempio</b><br><span>Un bar già avviato: quattro settimane di produzioni, acquisti e vendite, diciotto mesi di prezzi. Prova tutto liberamente.</span></span></button>
      <button type="button" class="qa" data-act="register"><span class="ti">${IC.shop}</span><span><b>Registra il tuo bar</b><br><span>Parti subito con i tuoi dati: fornitori, merce in magazzino, schede tecniche.</span></span></button>
    </div>
    <p class="hint wl-hint">Quando registri il bar, i dati di esempio e le prove che hai fatto vengono cancellati.</p></section>`;
}
function demoBanner() {
  const reg = registered();
  return `<div class="demo"><span class="ti">${IC.info}</span><span class="m"><b>Stai provando l'app con dati di esempio</b><span>Produci, scarica e registra acquisti liberamente. ${reg ? 'Quando vuoi, cancelli gli esempi e resti con i tuoi dati.' : 'Quando registri il tuo bar, tutto quello che c’è adesso viene cancellato.'}</span></span>
    <span class="demo-a w"><button type="button" class="btn sm" data-act="prova">Cosa contiene</button><button type="button" class="btn sm ${reg ? 'dan' : 'pri'}" data-act="register">${reg ? 'Cancella gli esempi' : 'Registra il tuo bar'}</button></span></div>`;
}
function primiPassi() {
  if (S.ro || !registered() || countSample() || lsGet('bf-primi-passi') === 'no') return '';
  const steps = [
    [S.data.fornitori.size > 0, 'Aggiungi i fornitori', 'Chi ti rifornisce e in che giorni consegna.', 'new-forn', IC.truck],
    [S.data.documenti.size > 0, 'Carica la merce che hai già', 'Un «Inventario iniziale» con lotti e scadenze di quello che c’è in magazzino.', 'inv-start', IC.box],
    [S.data.ricette.size > 0, 'Crea la prima scheda tecnica', 'Ingredienti e grammature: allergeni e costi si calcolano da soli.', 'new-ric', IC.doc],
    [S.data.produzioni.size > 0, 'Registra la prima produzione', 'Il lotto si porta dietro ingredienti, lotti dei fornitori e scadenza.', 'new-prod', IC.chef]
  ];
  const done = steps.filter(x => x[0]).length;
  if (done === steps.length) return '';
  return `<div class="steps"><div class="steps-h"><h2>Primi passi</h2><span class="chip">${done} di ${steps.length}</span><button type="button" class="lnk" data-act="primi-hide">Nascondi</button></div>
    <div class="list">${steps.map(([ok, t, d, act, ic], i) => `<button type="button" class="row${ok ? ' done' : ''}" data-act="${act}">${av(ok ? IC.check : ic, ok ? 'good' : i === done ? 'pri' : '')}<span class="m"><b>${esc(t)}</b><span>${esc(d)}</span></span></button>`).join('')}</div></div>`;
}
function vOggi() {
  if (showWelcome()) return vBenvenuto();
  const Dd = drv(), t = today(), w = cfg().giorniAvviso, F = UI.todoF;
  const lots = [...Dd.acq.values(), ...Dd.prod.values()].filter(l => l.res > EPS && l.scad);
  const exp = lots.filter(l => l.scad < t).sort(byScad);
  const soon = lots.filter(l => l.scad >= t && daysBetween(t, l.scad) <= w).sort(byScad);
  const dueToday = soon.filter(l => l.scad === t), later = soon.filter(l => l.scad > t);
  const under = [...S.data.articoli.values()].filter(a => !a.archiviato && +a.scortaMin > 0 && artStock(a.id).usable < +a.scortaMin).sort(byName);
  const rincari = rincariRecenti();
  const nToday = [...S.data.produzioni.values()].filter(p => p.data === t).length;
  const active = [...Dd.prod.values()].filter(l => l.res > EPS).sort(byScad);
  const h = new Date().getHours(), greet = h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const dateStr = cap(new Date().toLocaleDateString('it-IT', {weekday: 'long', day: 'numeric', month: 'long'}));
  const smal = l => `<button type="button" class="btn sm dan w" data-act="smaltisci" data-kind="${l.kind}" data-id="${esc(l.key)}">Smaltisci</button>`;
  // con tanti prodotti freschi l'elenco diventa lungo: se ne vedono quattro, gli altri a richiesta
  const more = !UI.todoAll && F !== 'scadenza' && later.length > 5 ? later.length - 4 : 0;
  const laterRows = (more ? later.slice(0, 4) : later).map(l => lotRow(l));
  if (more) laterRows.push(`<button type="button" class="row" data-act="todo-all">${av(IC.clock, 'amb')}<span class="m"><b>Altri ${more} in scadenza</b><span>Mostra tutto l’elenco</span></span></button>`);
  const posta = postaRow();
  // le cose da fare per urgenza: prima quello che non si può vendere, poi le scadenze, gli ordini e i prezzi
  const groups = [
    {id: 'scaduti', f: 'scaduti', t: 'Da smaltire', tone: 'red', rows: exp.map(l => lotRow(l, smal(l))), act: exp.length > 1 && !S.ro ? '<button type="button" class="btn sm dan w" data-act="smaltisci-tutti">Smaltisci tutti</button>' : ''},
    {id: 'oggi', f: 'scadenza', t: 'Scade oggi', tone: 'amb', rows: dueToday.map(l => lotRow(l))},
    {id: 'posta', f: '', t: 'Fatture da importare', tone: 'amb', rows: posta ? [posta] : []},
    {id: 'prossimi', f: 'scadenza', t: w === 1 ? 'Scade domani' : `Scade nei prossimi ${w} giorni`, tone: 'amb', rows: laterRows, n: later.length},
    {id: 'scorta', f: 'scorta', t: 'Da ordinare', tone: 'amb', rows: under.map(underRow)},
    {id: 'rincari', f: 'rincari', t: 'Prezzi in aumento', tone: 'red', rows: rincari.map(x => `<button type="button" class="row" data-act="open-prezzi" data-id="${esc(x.a.id)}">${av(IC.trend, 'red')}<span class="m"><b>${esc(x.a.nome)}</b><span>Rincaro: pagato ${EUR(x.l.p)} ${perU(x.a.unita)} il ${fmtD(x.l.date)}, prima ${EUR(x.pv.p)}</span><span class="mc">${delta(x.ch)}</span></span></button>`)}
  ].filter(g => g.rows.length && (!F || g.f === F));
  const grp = g => `<section class="todo-g" id="g-${g.id}" aria-label="${esc(g.t)}"><div class="todo-h"><i class="dot ${g.tone}" aria-hidden="true"></i><h3>${esc(g.t)}</h3><span class="todo-n">${g.n ?? g.rows.length}</span>${g.act || ''}</div><div class="list">${g.rows.join('')}</div></section>`;
  const FT = {scaduti: 'Lotti scaduti', scadenza: 'In scadenza', scorta: 'Sotto scorta', rincari: 'Rincari'};
  const VUOTO = {scaduti: 'Nessun lotto scaduto da smaltire.', scadenza: `Nessun prodotto scade ${w === 1 ? 'entro domani' : `nei prossimi ${w} giorni`}.`, scorta: 'Tutti gli articoli sono sopra la scorta minima.', rincari: 'Nessun rincaro negli ultimi 30 giorni.'};
  const todo = groups.length ? groups.map(grp).join('')
    : F ? empty(VUOTO[F], IC.check)
    : `<div class="empty done"><span class="ei">${IC.check}</span><b>Tutto in ordine</b><span>Nessuna scadenza vicina, scorte a posto e nessun rincaro.</span></div>`;
  const sample = countSample();
  return `<section id="v-oggi"><div class="ph"><div><p class="kick">${esc(dateStr)}</p><h1>${greet}</h1></div>
    <div class="acts w deskonly"><button type="button" class="btn pri" data-act="new-prod">${IC.plus}Nuova produzione</button><button type="button" class="btn" data-act="new-doc">${IC.receipt}Registra acquisto</button></div>
    <a class="btn bk-entry mobonly w" href="#banco">${IC.banco}Banco</a></div>
    ${sample && S.mode === 'local' ? '' : modeNote()}
    ${sample ? demoBanner() : primiPassi()}
    <div class="tiles">${tile('red', exp.length, 'Lotti scaduti da smaltire', 'scaduti', IC.alert)}${tile('amb', soon.length, w === 1 ? 'In scadenza entro domani' : `In scadenza entro ${w} giorni`, 'scadenza', IC.clock)}${tile('amb', under.length, 'Articoli sotto scorta', 'scorta', IC.box)}${tile('amb', rincari.length, 'Rincari recenti', 'rincari', IC.trend)}</div>
    <h2 id="da-controllare"><span>${F ? `Da fare: ${FT[F].toLowerCase()}` : 'Da fare'}</span>${F ? '<button type="button" class="lnk" data-act="todo-tutto">Mostra tutto</button>' : ''}</h2>
    <div class="todo" id="todo">${todo}</div>
    <h2 id="vetrina"><span>In vetrina e in frigo${active.length ? ` <span class="chip">${active.length}</span>` : ''}${nToday ? ` <span class="chip okk">${nToday === 1 ? '1 prodotto oggi' : nToday + ' prodotti oggi'}</span>` : ''}</span>${active.length > 1 ? `<span class="h2a carnav"><button type="button" class="btn icon" data-act="car" data-dir="-1" aria-label="Etichette precedenti">${IC.left}</button><button type="button" class="btn icon" data-act="car" data-dir="1" aria-label="Etichette successive">${IC.right}</button></span>` : ''}</h2>
    ${active.length ? `<div class="labels" id="labels" tabindex="0" aria-label="Lotti in giacenza">${active.map(labelCard).join('')}</div>` : empty('Nessun prodotto in giacenza. Quando registri una produzione, il lotto compare qui con la sua etichetta.', IC.chef)}</section>`;
}

/* ---------- Produzione e schede ---------- */
const prodNav = cur => `<div class="subnav">${navSeg(cur, [['produzione', 'Lotti'], ['schede', 'Schede tecniche']])}</div>`;
function vProduzione() {
  const q = UI.q.prod.trim().toLowerCase();
  let lots = [...drv().prod.values()];
  if (UI.prodF === 'attivi') lots = lots.filter(l => l.res > EPS);
  else if (UI.prodF === 'esauriti') lots = lots.filter(l => l.res <= EPS);
  if (q) lots = lots.filter(l => `${l.p.lotto} ${lotName(l)} ${l.p.operatore || ''}`.toLowerCase().includes(q));
  lots.sort((a, b) => b.data.localeCompare(a.data) || (b.p.creato || 0) - (a.p.creato || 0));
  const nRic = [...S.data.ricette.values()].filter(r => !r.archiviato).length;
  return `<section id="v-produzione"><div class="ph"><div><h1>Produzione</h1><p>Ogni lotto conserva gli ingredienti usati, i lotti dei fornitori con le loro fatture e la scadenza.</p></div>
    <div class="acts w"><button type="button" class="btn pri" data-act="new-prod" ${nRic ? '' : 'disabled'}>${IC.plus}Nuova produzione</button></div></div>
    ${prodNav('produzione')}
    ${nRic ? '' : `<p class="note w">${IC.info}<span>Per produrre serve almeno una scheda tecnica. <button type="button" class="lnk" data-act="new-ric">Crea la prima scheda</button></span></p>`}
    <div class="bar">${search('prod', 'Cerca lotto, prodotto o operatore')}${seg('prodF', [['attivi', 'Con giacenza'], ['esauriti', 'Esauriti'], ['tutti', 'Tutti']])}</div>
    ${lots.length ? `<div class="list">${lots.map(prodRow).join('')}</div>` : empty(q ? 'Nessun lotto corrisponde alla ricerca.' : 'Nessun lotto in questo elenco.', IC.chef)}</section>`;
}
function ricCard(r) {
  const al = algSort([...recAllergensOf(r, [r.id])]);
  const c = recCostOf(r, [r.id]), rq = +r.resaQta, s = ricStock(r.id), u = unitOk(r.resaUnita);
  return `<button type="button" class="rc" data-act="open-ric" data-id="${esc(r.id)}">
    <span class="rc-h"><b>${esc(r.nome)}</b><span class="chip">${esc(r.sigla || '')}</span></span>
    <span class="rc-m">${esc(r.categoria || 'Senza categoria')}${r.semilavorato ? ' · semilavorato' : ''} · resa ${fmtQ(rq, u)} · ${esc(shelfTxt(r))}</span>
    ${algChips(al, [])}
    <span class="rc-f"><span>Costo ${rq > 0 && !c.miss.length ? EUR(c.tot / rq) : '—'} ${u === 'pz' ? 'al pezzo' : 'al ' + u}</span><span>In giacenza ${fmtQ(s.usable, u)}</span></span></button>`;
}
function vSchede() {
  const q = UI.q.sch.trim().toLowerCase();
  let rs = [...S.data.ricette.values()].filter(r => !!r.archiviato === UI.schArch);
  const cats = [...new Set(rs.map(r => r.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'));
  if (UI.schCat && cats.includes(UI.schCat)) rs = rs.filter(r => r.categoria === UI.schCat);
  if (q) rs = rs.filter(r => `${r.nome} ${r.sigla} ${r.categoria}`.toLowerCase().includes(q));
  rs.sort(byName);
  const catSeg = cats.length > 1 ? seg('schCat', [['', 'Tutte'], ...cats.map(c => [c, c])]) : '';
  return `<section id="v-schede"><div class="ph"><div><h1>Schede tecniche</h1><p>Ricetta e grammature, allergeni, elenco ingredienti per il cartello, conservazione, durata e costo.</p></div>
    <div class="acts"><button type="button" class="btn pri w" data-act="new-ric">${IC.plus}Nuova scheda</button><button type="button" class="btn dl" data-act="dl-libro">${IC.down}Libro ingredienti</button></div></div>
    ${prodNav('schede')}
    <div class="bar">${search('sch', 'Cerca scheda')}${catSeg}</div>
    ${rs.length ? `<div class="cards">${rs.map(ricCard).join('')}</div>` : empty(q ? 'Nessuna scheda corrisponde alla ricerca.' : UI.schArch ? 'Nessuna scheda archiviata.' : 'Nessuna scheda tecnica. Crea la prima con «Nuova scheda».', IC.doc)}
    <p style="margin-top:18px"><button type="button" class="lnk" data-act="toggle-arch">${UI.schArch ? 'Torna alle schede attive' : 'Mostra le schede archiviate'}</button></p></section>`;
}

/* ---------- Magazzino ---------- */
function vMagazzino() {
  return `<section id="v-magazzino"><div class="ph"><div><h1>Magazzino</h1><p>Giacenze calcolate dai lotti: caricate con gli acquisti, scalate da produzioni e scarichi.</p></div>
    <div class="acts"><button type="button" class="btn w" data-act="new-art">${IC.plus}Nuovo articolo</button><button type="button" class="btn dl" data-act="dl-csv">${IC.down}Esporta CSV</button></div></div>
    <div class="subnav">${seg('magSeg', [['acq', 'Acquistati'], ['prod', 'Prodotti']])}</div>
    <div class="bar">${search('mag', UI.magSeg === 'acq' ? 'Cerca articolo o lotto del fornitore' : 'Cerca prodotto o lotto')}${UI.magSeg === 'acq' ? seg('magCat', [['tutti', 'Tutti'], ['materia', 'Materie prime'], ['rivendita', 'Rivendita'], ['imballaggio', 'Imballaggi']]) : ''}</div>
    ${UI.magSeg === 'acq' ? magAcq() : magProd()}</section>`;
}
function artRow(a) {
  const s = artStock(a.id), chips = [];
  let tone = '';
  if (s.expired > EPS) { chips.push(`<span class="chip red">Scaduto ${fmtQ(s.expired, a.unita)}</span>`); tone = 'red'; }
  if (s.next) {
    const n = daysBetween(today(), s.next);
    if (n <= cfg().giorniAvviso) { chips.push(`<span class="chip amb">${n === 0 ? 'Scade oggi' : n === 1 ? 'Scade domani' : `Scade tra ${n} giorni`}</span>`); tone ||= 'amb'; }
    else chips.push(`<span class="chip">Scade il ${fmtDs(s.next)}</span>`);
  }
  if (+a.scortaMin > 0 && s.usable < +a.scortaMin) { chips.push(`<span class="chip amb">Sotto scorta</span>`); tone ||= 'amb'; }
  return `<button type="button" class="row" data-act="open-art" data-id="${esc(a.id)}">${av(catIc(a.categoria), tone)}
    <span class="m"><b>${esc(a.nome)}</b><span>${esc(CAT[a.categoria] || CAT.materia)} · ${s.n === 1 ? '1 lotto' : `${s.n} lotti`} in giacenza</span><span class="mc">${chips.join('')}</span></span>
    <span class="s"><span class="q">${fmtQ(s.usable, a.unita)}</span></span></button>`;
}
function magAcq() {
  const q = UI.q.mag.trim().toLowerCase(), Dd = drv();
  let arts = [...S.data.articoli.values()].filter(a => !a.archiviato);
  if (UI.magCat !== 'tutti') arts = arts.filter(a => (a.categoria || 'materia') === UI.magCat);
  if (q) arts = arts.filter(a => String(a.nome).toLowerCase().includes(q) || (Dd.artLots.get(a.id) || []).some(l => l.lottoF.toLowerCase().includes(q)));
  arts.sort(byName);
  return arts.length ? `<div class="list">${arts.map(artRow).join('')}</div>` : empty(q ? 'Nessun articolo corrisponde alla ricerca.' : 'Nessun articolo in questa categoria.', IC.box);
}
function magProd() {
  const q = UI.q.mag.trim().toLowerCase(), Dd = drv();
  const out = [...S.data.ricette.values()].sort(byName).map(r => {
    const lots = (Dd.ricLots.get(r.id) || []).filter(l => l.res > EPS && (!q || `${r.nome} ${l.p.lotto}`.toLowerCase().includes(q)));
    if (!lots.length) return '';
    const s = stockOf(lots);
    return `<div class="grp"><div class="grp-h"><button type="button" class="lnk" data-act="open-ric" data-id="${esc(r.id)}">${esc(r.nome)}</button><span class="q">${fmtQ(s.usable, r.resaUnita)}${s.expired > EPS ? ` <small>+ ${fmtQ(s.expired, r.resaUnita)} scaduti</small>` : ''}</span></div><div class="list">${lots.map(prodRow).join('')}</div></div>`;
  }).join('');
  return out || empty(q ? 'Nessun prodotto corrisponde alla ricerca.' : 'Nessun prodotto in giacenza.', IC.chef);
}

/* ---------- Acquisti, fornitori ---------- */
const acqNav = cur => navSeg(cur, [['acquisti', 'Documenti'], ['prezzi', 'Prezzi'], ['fornitori', 'Fornitori']]);
const DOCAB = {fattura: 'FT', ddt: 'DDT', scontrino: 'SC', inventario: 'INV'};
function vAcquisti() {
  const q = UI.q.acq.trim().toLowerCase();
  let docs = [...S.data.documenti.values()];
  if (q) docs = docs.filter(d => [d.numero, fornName(d.fornitoreId), TIPI[d.tipo], d.fatturaRif, ...(d.righe || []).flatMap(r => [S.data.articoli.get(r.articoloId)?.nome, r.lotto])].join(' ').toLowerCase().includes(q));
  docs.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || (b.creato || 0) - (a.creato || 0));
  const rows = docs.map(d => {
    const n = (d.righe || []).length, att = (d.allegati || []).length;
    const noPrice = d.tipo !== 'inventario' && (d.righe || []).some(r => r.importo == null || r.importo === '');
    return `<button type="button" class="row" data-act="open-doc" data-id="${esc(d.id)}">${av(DOCAB[d.tipo] || 'DOC', noPrice ? 'amb' : '')}<span class="m"><b>${esc(docName(d))}</b><span>${esc(fornName(d.fornitoreId) || (d.tipo === 'inventario' ? 'Merce già in magazzino' : 'Fornitore non indicato'))} · ${n === 1 ? '1 riga' : `${n} righe`}${att ? ` · ${att === 1 ? '1 allegato' : `${att} allegati`}` : ''}${d.tipo === 'ddt' && d.fatturaRif ? ` · fattura ${esc(d.fatturaRif)}` : ''}</span><span class="mc">${d.soloPrezzi ? '<span class="chip">Solo storico prezzi</span>' : ''}${noPrice ? '<span class="chip amb">Prezzi da inserire</span>' : ''}</span></span><span class="s"><span class="q">${EUR(docTot(d))}</span></span></button>`;
  }).join('');
  return `<section id="v-acquisti"><div class="ph"><div><h1>Acquisti</h1><p>Fatture e DDT: ogni riga diventa un lotto di magazzino con lotto del fornitore, scadenza e costo.</p></div>
    <div class="acts w"><button type="button" class="btn pri" data-act="new-doc">${IC.plus}Registra documento</button><button type="button" class="btn" data-act="fe-import">${IC.down}Importa fatture${postaCoda().length ? ` <span class="chip amb">${postaMail(postaCoda())} dalla posta</span>` : ''}</button><button type="button" class="btn" data-act="new-forn">Nuovo fornitore</button></div></div>
    <div class="subnav">${acqNav('acquisti')}</div>
    <div class="bar">${search('acq', 'Cerca numero, fornitore, articolo o lotto')}</div>
    ${rows ? `<div class="list">${rows}</div>` : empty(q ? 'Nessun documento corrisponde alla ricerca.' : 'Nessun acquisto registrato. Registra la prima fattura o il primo DDT.', IC.receipt)}</section>`;
}
function vFornitori() {
  const q = UI.q.forn.trim().toLowerCase();
  let fs = [...S.data.fornitori.values()];
  if (q) fs = fs.filter(f => `${f.nome} ${f.piva || ''} ${f.note || ''}`.toLowerCase().includes(q));
  fs.sort(byName);
  const docs = [...S.data.documenti.values()];
  const rows = fs.map(f => {
    const mine = docs.filter(d => d.fornitoreId === f.id), last = mine.map(d => d.data).sort().pop(), tot = mine.reduce((t, d) => t + docTot(d), 0);
    return `<button type="button" class="row" data-act="open-forn" data-id="${esc(f.id)}">${av(initials(f.nome))}<span class="m"><b>${esc(f.nome)}</b><span>${mine.length === 1 ? '1 documento' : `${mine.length} documenti`}${last ? ' · ultimo ' + fmtD(last) : ''}${f.note ? ' · ' + esc(f.note) : ''}</span></span><span class="s"><span class="q">${EUR(tot)}</span></span></button>`;
  }).join('');
  return `<section id="v-fornitori"><div class="ph"><div><h1>Fornitori</h1><p>Chi ti rifornisce, con i documenti registrati e la spesa totale.</p></div>
    <div class="acts w"><button type="button" class="btn pri" data-act="new-forn">${IC.plus}Nuovo fornitore</button></div></div>
    <div class="subnav">${acqNav('fornitori')}</div>
    <div class="bar">${search('forn', 'Cerca fornitore')}</div>
    ${rows ? `<div class="list">${rows}</div>` : empty(q ? 'Nessun fornitore corrisponde alla ricerca.' : 'Nessun fornitore. Aggiungilo con «Nuovo fornitore».', IC.truck)}</section>`;
}

/* ---------- Prezzi d'acquisto ---------- */
function vPrezzi() {
  const k = PERIODI[UI.prezziP] ? UI.prezziP : '3m', start = periodStart(k), Dd = drv(), q = UI.q.prz.trim().toLowerCase();
  const rows = [];
  for (const id of Dd.prices.keys()) { const a = S.data.articoli.get(id); if (a) rows.push({a, ps: priceStats(id, start)}); }
  const head = `<section id="v-prezzi"><div class="ph"><div><h1>Prezzi d'acquisto</h1><p>Prezzo al kg, al litro o al pezzo preso da fatture e DDT, IVA esclusa: così confronti anche confezioni di misura diversa.</p></div>
    <div class="acts"><button type="button" class="btn dl" data-act="dl-prezzi">${IC.down}Esporta CSV</button></div></div>
    <div class="subnav">${acqNav('prezzi')}</div>`;
  if (!rows.length) return head + empty('Ancora nessun prezzo: registra fatture o DDT con gli importi delle righe. Puoi inserire anche fatture vecchie spuntando «Solo storico prezzi», così vedi subito l’andamento.', IC.tag) + '</section>';
  const tot = r6(rows.reduce((t, r) => t + r.ps.extra, 0));
  const act = rows.filter(r => r.ps.inP.length && r.ps.before || r.ps.inP.length > 1);
  const up = act.filter(r => r.ps.chg > 0.005), down = act.filter(r => r.ps.chg < -0.005);
  const lbl = k === 'tutto' ? 'Dal primo acquisto registrato' : `Negli ultimi ${PERIODI[k][0]}`;
  const ref = k === 'tutto' ? 'ai primi prezzi registrati' : 'ai prezzi di inizio periodo';
  const worst = [...rows].sort((x, y) => y.ps.extra - x.ps.extra)[0], best = [...rows].sort((x, y) => x.ps.extra - y.ps.extra)[0];
  const finding = tot > 0.005
    ? `${lbl} hai speso ${EUR(tot)} in più rispetto ${ref}${worst.ps.extra > 0.005 ? `: il rincaro che pesa di più è ${worst.a.nome} (+${EUR(worst.ps.extra)})` : ''}.`
    : tot < -0.005 ? `${lbl} hai risparmiato ${EUR(-tot)} rispetto ${ref}${best.ps.extra < -0.005 ? `, soprattutto su ${best.a.nome}` : ''}.`
    : `${lbl} i prezzi sono rimasti stabili.`;
  let list = q ? rows.filter(r => String(r.a.nome).toLowerCase().includes(q)) : rows;
  list = [...list].sort((x, y) => (y.ps.extra - x.ps.extra) || ((y.ps.chg ?? 0) - (x.ps.chg ?? 0)) || byName(x.a, y.a));
  const prodRows = list.map(({a, ps}) => `<button type="button" class="row" data-act="open-prezzi" data-id="${esc(a.id)}">${av(catIc(a.categoria), ps.inP.length ? (dcls(ps.chg) === 'up' ? 'red' : dcls(ps.chg) === 'down' ? 'good' : '') : '')}
      <span class="m"><b>${esc(a.nome)}</b><span>Ultimo ${EUR(ps.last.p)} ${perU(a.unita)} il ${fmtD(ps.last.date)}${fornName(ps.last.forn) ? ' · ' + esc(fornName(ps.last.forn)) : ''}</span><span>${ps.s.length === 1 ? '1 acquisto' : ps.s.length + ' acquisti'}${Math.abs(ps.extra) >= 0.005 ? ` · ${ps.extra > 0 ? `+${EUR(ps.extra)} spesi in più` : `${EUR(-ps.extra)} risparmiati`}` : ''}</span><span class="mc">${ps.inP.length ? delta(ps.chg) : '<span class="chip">Nessun acquisto nel periodo</span>'}</span></span>
      <span class="s">${spark(ps.s)}</span></button>`).join('');
  const iva = cfg().iva;
  const imp = [...S.data.ricette.values()].filter(r => !r.archiviato).map(r => {
    const rq = +r.resaQta, now = recCostOf(r, [r.id]), then = recCostOf(r, [r.id], id => priceAt(id, start));
    if (!(rq > 0) || now.miss.length || then.miss.length || !(then.tot > 0)) return null;
    const cN = now.tot / rq, cT = then.tot / rq, pr = +r.prezzoVendita, net = pr > 0 ? pr / (1 + iva / 100) : 0;
    return {r, cN, cT, ch: (cN - cT) / cT, fN: net ? cN / net * 100 : null, fT: net ? cT / net * 100 : null};
  }).filter(x => x && Math.abs(x.ch) >= 0.005).sort((x, y) => y.ch - x.ch);
  const fc = v => num(Math.round(v * 10) / 10) + '%';
  const impRows = imp.map(x => { const u = unitOk(x.r.resaUnita); return `<button type="button" class="row" data-act="open-ric" data-id="${esc(x.r.id)}">${av(esc(x.r.sigla || autoSigla(x.r.nome)), dcls(x.ch) === 'up' ? 'red' : 'good')}<span class="m"><b>${esc(x.r.nome)}</b><span>Costo ${u === 'pz' ? 'al pezzo' : 'al ' + u}: ${EUR(x.cT)} → ${EUR(x.cN)}</span>${x.fN != null ? `<span>Food cost ${fc(x.fT)} → ${fc(x.fN)}</span>` : ''}<span class="mc">${delta(x.ch)}</span></span></button>`; }).join('');
  const missing = [...S.data.documenti.values()].filter(d => d.tipo !== 'inventario' && (d.righe || []).some(r => r.importo == null || r.importo === '')).sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  return head + `<div class="bar">${seg('prezziP', Object.entries(PERIODI).map(([v, [t]]) => [v, t]))}</div>
    <p class="finding">${esc(finding)}</p>
    <div class="stats"><div class="stat ${tot > 0.005 ? 'up' : tot < -0.005 ? 'down' : ''}"><b>${tot > 0.005 ? '+' : tot < -0.005 ? '−' : ''}${EUR(Math.abs(tot))}</b><span>${tot < -0.005 ? 'Risparmiati' : 'Spesi in più'} rispetto ${esc(ref)}</span></div><div class="stat"><b>${up.length}</b><span>${up.length === 1 ? 'Prodotto rincarato' : 'Prodotti rincarati'}</span></div><div class="stat"><b>${down.length}</b><span>${down.length === 1 ? 'Prodotto calato' : 'Prodotti calati'}</span></div></div>
    <h2>Prodotti</h2><p class="muted" style="margin-top:-4px">Variazione del prezzo ${k === 'tutto' ? 'dal primo acquisto registrato' : `negli ultimi ${PERIODI[k][0]}`}, dai rincari che pesano di più.</p>
    <div class="bar">${search('prz', 'Cerca prodotto')}</div>
    ${prodRows ? `<div class="list">${prodRows}</div>` : empty('Nessun prodotto corrisponde alla ricerca.', IC.search)}
    <h2>Costo delle schede</h2>
    <p class="muted" style="margin-top:-4px">Costo per unità oggi e con i prezzi di ${k === 'tutto' ? 'quando hai iniziato a registrarli' : 'inizio periodo'}.</p>
    ${impRows ? `<div class="list">${impRows}</div>` : empty('Nessuna variazione di costo nelle schede in questo periodo.', IC.doc)}
    ${missing.length ? `<h2>Prezzi da completare</h2><p class="muted" style="margin-top:-4px">${missing.length === 1 ? 'Un documento ha' : missing.length + ' documenti hanno'} righe senza importo. Quando arriva la fattura, apri il documento e inserisci gli importi: entrano subito nello storico.</p><div class="list">${missing.slice(0, 8).map(d => `<button type="button" class="row" data-act="open-doc" data-id="${esc(d.id)}">${av(DOCAB[d.tipo] || 'DOC', 'amb')}<span class="m"><b>${esc(docName(d))}</b><span>${esc(fornName(d.fornitoreId) || 'Fornitore non indicato')}</span><span class="mc"><span class="chip amb">Prezzi da inserire</span></span></span></button>`).join('')}</div>` : ''}</section>`;
}

/* ---------- Impostazioni ---------- */
function vImpostazioni() {
  const c = cfg(), n = countSample(), reg = registered();
  const where = S.mode === 'cloud' ? 'I dati sono salvati nell’archivio di questa pagina su claude.ai e si vedono da ogni dispositivo con cui la apri.' : S.mode === 'local' ? 'I dati sono salvati solo in questo browser: esporta spesso un backup.' : 'In questa vista i dati non vengono salvati.';
  const dis = S.ro ? 'disabled' : '';
  const prova = n ? `<div class="setgrp"><h2>Prova con i dati di esempio</h2><div class="card"><p>Stai usando ${n} elementi di esempio: un bar con quattro settimane di produzioni, acquisti e vendite e diciotto mesi di prezzi. ${reg ? 'Quando vuoi, cancellali per lavorare solo con i tuoi dati.' : 'Quando registri il tuo bar vengono cancellati, insieme a quello che hai inserito durante la prova.'}</p>
      <div class="acts">${reg ? '<button type="button" class="btn dan w" data-act="register">Cancella gli esempi</button>' : ''}<button type="button" class="btn w" data-act="reset-sample">Riporta gli esempi a oggi</button></div>
      <p class="hint" style="margin-top:10px">«Riporta gli esempi a oggi» rimette tutto come all'inizio, con scadenze e consegne aggiornate alla data di oggi.</p></div></div>` : '';
  const bar = n && !reg
    ? `<div class="setgrp"><h2>Il tuo bar</h2><div class="card regbox"><p>Non hai ancora registrato il bar. Con la registrazione nome, indirizzo e partita IVA compaiono nell'app e sulle schede che stampi, e i dati di esempio vengono cancellati.</p><button type="button" class="btn pri w" data-act="register">Registra il tuo bar</button></div></div>`
    : `<div class="setgrp"><h2>Il tuo bar</h2><div class="card">
      <label class="fld"><span>Nome del bar</span><input type="text" id="cfg-nome" name="nome" value="${esc(c.nome)}" placeholder="Es. Bar Centrale" ${dis}></label>
      <label class="fld"><span>Indirizzo</span><input type="text" id="cfg-ind" name="indirizzo" value="${esc(c.indirizzo)}" placeholder="Es. Via Roma 1, Cittanova" ${dis}></label>
      <label class="fld"><span>Partita IVA</span><input type="text" id="cfg-piva" name="piva" value="${esc(c.piva)}" inputmode="numeric" ${dis}></label>
      <p class="hint" style="margin:-4px 0 0">Compaiono in alto nell'app e sulle schede tecniche e sui documenti dei lotti che scarichi o stampi.</p></div></div>`;
  return `<section id="v-impostazioni"><div class="ph"><div><h1>Impostazioni</h1><p>${esc(where)}</p></div></div>
    ${prova}
    <form id="cfgForm">${bar}
    <div class="setgrp"><h2>Avvisi e calcoli</h2><div class="card">
      <div class="g2"><label class="fld"><span>Avviso scadenze (giorni prima)</span><input type="text" id="cfg-gg" name="giorniAvviso" inputmode="numeric" value="${esc(c.giorniAvviso)}" ${dis}></label>
      <label class="fld"><span>Segnala rincari oltre (%)</span><input type="text" id="cfg-sr" name="sogliaRincaro" inputmode="decimal" value="${esc(fmtIn(c.sogliaRincaro))}" ${dis}></label></div>
      <div class="g2"><label class="fld"><span>IVA sulle vendite (%)</span><input type="text" id="cfg-iva" name="iva" inputmode="decimal" value="${esc(fmtIn(c.iva))}" ${dis}></label></div>
      <p class="hint" style="margin:-4px 0 14px">L'IVA serve solo a calcolare il food cost sul prezzo di vendita. In «Oggi» compare un avviso quando un prodotto comprato negli ultimi 30 giorni costa più della soglia rispetto all'acquisto precedente.</p>
      <button type="submit" class="btn pri w">Salva impostazioni</button>
    </div></div></form>
    ${postaCard()}
    ${notifCard()}
    <div class="setgrp"><h2>Backup ed esportazioni</h2><div class="card"><p class="muted">Il backup contiene tutto: schede, acquisti, lotti, movimenti. Serve anche per spostare i dati su un altro dispositivo o sistema.</p>
      <div class="acts"><button type="button" class="btn dl" data-act="dl-backup">${IC.down}Esporta backup</button><label class="btn w">Importa backup<input type="file" accept="application/json,.json" data-file="import"></label><button type="button" class="btn dl" data-act="dl-csv">${IC.down}Giacenze in CSV</button></div>
      ${S.mode !== 'local' && !S.downloads ? '<p class="hint" style="margin-top:10px">Il download dei file non è disponibile in questa vista.</p>' : ''}</div></div>
    ${!n && !ownCount() && !S.ro ? `<div class="setgrp"><h2>Dati di esempio</h2><div class="card"><p>L'archivio è vuoto: puoi riempirlo con un bar di esempio per provare tutte le funzioni. ${reg ? 'Lo cancelli quando vuoi.' : 'Si cancella quando registri il tuo bar.'}</p><button type="button" class="btn w" data-act="load-sample">Carica i dati di esempio</button></div></div>` : ''}
    <div class="setgrp"><div class="about"><span class="logo">${LOGO}</span><span><b>Barista Flow</b><br>Schede tecniche, lotti, scadenze, giacenze e prezzi.</span></div></div></section>`;
}
