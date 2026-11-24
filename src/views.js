/* ---------- disegno della pagina ---------- */
let raf = 0;
function bump() { S.ver++; schedule(); }
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); }
function paint() { renderChrome(); renderMain(); refreshSheets(); }
const VIEWS = {oggi: vOggi, produzione: vProduzione, schede: vSchede, magazzino: vMagazzino, acquisti: vAcquisti, prezzi: vPrezzi, impostazioni: vImpostazioni};
const route = () => { const h = location.hash.slice(1); return VIEWS[h] ? h : 'oggi'; };

function renderChrome() {
  const r = route();
  const tab = r === 'prezzi' ? 'acquisti' : r;
  $$('#tabs a').forEach(a => a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  const cl = $('#cfgLink'); if (r === 'impostazioni') cl.setAttribute('aria-current', 'page'); else cl.removeAttribute('aria-current');
  $('#bizName').textContent = cfg().nome || 'Banco e laboratorio';
  const sy = $('#sync'); let t = '', w = false;
  if (S.mode === 'local') t = 'Dati nel browser';
  else if (S.mode === 'temp') { t = 'Prova: non salva'; w = true; }
  else if (S.mode === 'cloud') {
    if (S.ro) t = 'Sola lettura';
    else if (S.slow) { t = 'Connessione lenta'; w = true; }
    else t = S.fresh.size === COLS.length ? 'Salvato' : 'Aggiorno…';
  }
  sy.textContent = t; sy.classList.toggle('warn', w);
}
function renderMain() {
  const main = $('#main');
  const ae = document.activeElement;
  const fid = ae && main.contains(ae) && ae.id ? ae.id : null;
  const sel = fid && typeof ae.selectionStart === 'number' ? [ae.selectionStart, ae.selectionEnd] : null;
  const html = (S.mode === 'loading' || (S.got.size < COLS.length && !S.slow))
    ? `<div class="loading" role="status"><span class="spin" aria-hidden="true"></span><p>Carico i dati del bar…</p></div>`
    : VIEWS[route()]();
  if (main._h === html) return;
  main.innerHTML = html; main._h = html;
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus({preventScroll: true}); if (sel && el.setSelectionRange) { try { el.setSelectionRange(sel[0], sel[1]); } catch { /* campo senza selezione */ } } } }
}

/* ---------- componenti ---------- */
const empty = t => `<div class="empty">${esc(t)}</div>`;
const search = (k, ph) => `<input type="search" id="q-${k}" data-q="${k}" value="${esc(UI.q[k])}" placeholder="${esc(ph)}" aria-label="${esc(ph)}" autocomplete="off">`;
const seg = (k, opts) => `<div class="seg" role="group">${opts.map(([v, t]) => `<button type="button" data-act="seg" data-k="${k}" data-v="${esc(v)}" aria-pressed="${UI[k] === v}">${esc(t)}</button>`).join('')}</div>`;
const algChips = (al, tr) => `<div class="chips">${al.length ? al.map(a => `<span class="chip al">${esc(ALGN[a])}</span>`).join('') : '<span class="chip">Nessuno dei 14 allergeni</span>'}${(tr || []).map(a => `<span class="chip">Tracce: ${esc(ALGN[a].toLowerCase())}</span>`).join('')}</div>`;
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
const delta = (x, label) => (x == null || !isFinite(x)) ? '' : `<span class="chip ${dcls(x)}">${Math.abs(x) < 0.005 ? 'Stabile' : `${x > 0 ? '▲' : '▼'} ${pct(x)}`}${label ? ' ' + esc(label) : ''}</span>`;
const tile = (cls, n, label, to) => `<button type="button" class="tile ${n ? cls : ''}" data-act="jump" data-to="${to}"><b>${n}</b><span>${esc(label)}</span></button>`;
function modeNote() {
  if (S.mode === 'temp') return `<p class="note warn">In questa vista l'archivio non è disponibile: puoi provare l'app, ma quello che inserisci non viene salvato. Aprila da claude.ai con l'accesso effettuato.</p>`;
  if (S.mode === 'local') return `<p class="note">I dati sono salvati solo in questo browser. Esporta un backup ogni tanto da Impostazioni.</p>`;
  if (S.slow) return `<p class="note warn">I dati non sono ancora tutti arrivati: quello che vedi potrebbe non essere aggiornato. La pagina si aggiorna da sola.</p>`;
  return '';
}
function labelCard(l) {
  const s = st(l), p = l.p, u = lotUnit(l);
  return `<button type="button" class="lab ${s.c}" data-act="open-lotto" data-id="${esc(l.key)}">
    <span class="lab-top"><span>${esc(s.t)}</span><span>${p.tipoScadenza === 'entro' ? 'Consumare entro' : 'Preferibilmente entro'}</span></span>
    <span class="lab-body"><span class="lab-name">${esc(lotName(l))}</span><span class="lab-lot">${esc(p.lotto)}</span>
    <span class="lab-grid"><span><small>Prodotto</small><b>${fmtDs(p.data)}</b></span><span><small>Scade</small><b>${fmtDs(l.scad)}</b></span><span><small>Residuo</small><b>${fmtQ(l.res, u)}</b></span></span></span></button>`;
}
function lotRow(l) {
  const s = st(l);
  const sub = l.kind === 'prod' ? `Lotto ${l.p.lotto} · prodotto il ${fmtD(l.data)}` : `${l.lottoF ? 'Lotto ' + l.lottoF + ' · ' : ''}${docName(l.doc)}`;
  return `<button type="button" class="row" data-act="${l.kind === 'prod' ? 'open-lotto' : 'open-acq'}" data-id="${esc(l.key)}">
    <span class="m"><b>${esc(lotName(l))}</b><span>${esc(sub)}</span></span>
    <span class="s"><span class="q">${fmtQ(l.res, lotUnit(l))}</span><span class="chip ${s.c}">${esc(s.t)}</span></span></button>`;
}
function prodRow(l) {
  const s = st(l), u = lotUnit(l);
  return `<button type="button" class="row" data-act="open-lotto" data-id="${esc(l.key)}">
    <span class="m"><b>${esc(lotName(l))}</b><span>${esc(l.p.lotto)} · ${fmtD(l.data)}${l.p.operatore ? ' · ' + esc(l.p.operatore) : ''}</span></span>
    <span class="s"><span class="q">${fmtQ(l.res, u)} <small>su ${fmtQ(l.qta, u)}</small></span><span class="chip ${s.c}">${esc(s.t)}</span></span></button>`;
}
function underRow(a) {
  const s = artStock(a.id);
  return `<button type="button" class="row" data-act="open-art" data-id="${esc(a.id)}">
    <span class="m"><b>${esc(a.nome)}</b><span>Scorta minima ${fmtQ(+a.scortaMin, a.unita)}${a.fornitoreId && fornName(a.fornitoreId) ? ' · da ' + esc(fornName(a.fornitoreId)) : ''}</span></span>
    <span class="s"><span class="q">${fmtQ(s.usable, a.unita)}</span><span class="chip amb">Sotto scorta</span></span></button>`;
}

/* ---------- Oggi ---------- */
function vOggi() {
  const Dd = drv(), t = today(), w = cfg().giorniAvviso;
  const lots = [...Dd.acq.values(), ...Dd.prod.values()].filter(l => l.res > EPS && l.scad);
  const exp = lots.filter(l => l.scad < t).sort(byScad);
  const soon = lots.filter(l => l.scad >= t && daysBetween(t, l.scad) <= w).sort(byScad);
  const under = [...S.data.articoli.values()].filter(a => !a.archiviato && +a.scortaMin > 0 && artStock(a.id).usable < +a.scortaMin).sort(byName);
  const nToday = [...S.data.produzioni.values()].filter(p => p.data === t).length;
  const soglia = cfg().sogliaRincaro / 100, d30 = addDays(t, -30);
  const rincari = [...Dd.prices.entries()].map(([id, s]) => {
    const a = S.data.articoli.get(id); if (!a || a.archiviato || s.length < 2) return null;
    const l = s[s.length - 1], pv = s[s.length - 2], ch = pv.p > 0 ? (l.p - pv.p) / pv.p : 0;
    return l.date >= d30 && ch > 0.0001 && ch >= soglia ? {a, l, pv, ch} : null;
  }).filter(Boolean).sort((x, y) => y.ch - x.ch);
  const active = [...Dd.prod.values()].filter(l => l.res > EPS).sort(byScad);
  const dateStr = cap(new Date().toLocaleDateString('it-IT', {weekday: 'long', day: 'numeric', month: 'long'}));
  const sample = countSample();
  return `<div class="ph"><div><p class="muted">${esc(dateStr)}</p><h1>La giornata al banco</h1></div>
    <div class="acts w"><button type="button" class="btn pri" data-act="new-prod">${IC.plus}Nuova produzione</button><button type="button" class="btn" data-act="new-doc">Registra acquisto</button></div></div>
    ${modeNote()}
    ${sample ? `<p class="note">Stai guardando dati di esempio: quando vuoi li elimini da Impostazioni.</p>` : ''}
    <div class="tiles">${tile('red', exp.length, 'Lotti scaduti da smaltire', 'da-controllare')}${tile('amb', soon.length, w === 1 ? 'In scadenza entro domani' : `In scadenza entro ${w} giorni`, 'da-controllare')}${tile('amb', under.length, 'Articoli sotto scorta', 'da-controllare')}${tile('', nToday, 'Lotti prodotti oggi', 'vetrina')}</div>
    <h2 id="vetrina">In vetrina e in frigo</h2>
    ${active.length ? `<div class="labels">${active.map(labelCard).join('')}</div>` : empty('Nessun prodotto in giacenza. Quando registri una produzione, il lotto compare qui con la sua etichetta.')}
    <h2 id="da-controllare">Da controllare</h2>
    ${exp.length || soon.length || under.length || rincari.length ? `<div class="list">${exp.map(lotRow).join('')}${soon.map(lotRow).join('')}${under.map(underRow).join('')}${rincari.map(x => `<button type="button" class="row" data-act="open-prezzi" data-id="${esc(x.a.id)}"><span class="m"><b>${esc(x.a.nome)}</b><span>Rincaro: pagato ${EUR(x.l.p)} ${perU(x.a.unita)} il ${fmtD(x.l.date)}, prima ${EUR(x.pv.p)}</span></span><span class="s">${delta(x.ch)}</span></button>`).join('')}</div>` : empty('Niente da segnalare: nessuna scadenza vicina, scorte a posto e nessun rincaro.')}`;
}

/* ---------- Produzione ---------- */
function vProduzione() {
  const q = UI.q.prod.trim().toLowerCase();
  let lots = [...drv().prod.values()];
  if (UI.prodF === 'attivi') lots = lots.filter(l => l.res > EPS);
  else if (UI.prodF === 'esauriti') lots = lots.filter(l => l.res <= EPS);
  if (q) lots = lots.filter(l => `${l.p.lotto} ${lotName(l)} ${l.p.operatore || ''}`.toLowerCase().includes(q));
  lots.sort((a, b) => b.data.localeCompare(a.data) || (b.p.creato || 0) - (a.p.creato || 0));
  const nRic = [...S.data.ricette.values()].filter(r => !r.archiviato).length;
  return `<div class="ph"><div><h1>Produzione</h1><p>Ogni lotto conserva gli ingredienti usati, i lotti dei fornitori con le loro fatture e la scadenza.</p></div>
    <div class="acts w"><button type="button" class="btn pri" data-act="new-prod" ${nRic ? '' : 'disabled'}>${IC.plus}Nuova produzione</button></div></div>
    ${nRic ? '' : `<p class="note w">Per produrre serve almeno una scheda tecnica. <button type="button" class="lnk" data-act="new-ric">Crea la prima scheda</button></p>`}
    <div class="bar">${search('prod', 'Cerca lotto, prodotto o operatore')}${seg('prodF', [['attivi', 'Con giacenza'], ['esauriti', 'Esauriti'], ['tutti', 'Tutti']])}</div>
    ${lots.length ? `<div class="list">${lots.map(prodRow).join('')}</div>` : empty(q ? 'Nessun lotto corrisponde alla ricerca.' : 'Nessun lotto in questo elenco.')}`;
}

/* ---------- Schede tecniche ---------- */
function ricCard(r) {
  const al = algSort([...recAllergensOf(r, [r.id])]);
  const c = recCostOf(r, [r.id]), rq = +r.resaQta, s = ricStock(r.id), u = unitOk(r.resaUnita);
  return `<button type="button" class="rc" data-act="open-ric" data-id="${esc(r.id)}">
    <span class="rc-h"><b>${esc(r.nome)}</b><span class="chip">${esc(r.sigla || '')}</span></span>
    <span class="rc-m">${esc(r.categoria || 'Senza categoria')}${r.semilavorato ? ' · semilavorato' : ''} · resa ${fmtQ(rq, u)} · ${esc(shelfTxt(r))}</span>
    ${algChips(al, [])}
    <span class="rc-f"><span>Costo ${rq > 0 && !c.miss.length ? EUR(c.tot / rq) : '—'} al ${u === 'pz' ? 'pezzo' : u}</span><span>In giacenza ${fmtQ(s.usable, u)}</span></span></button>`;
}
function vSchede() {
  const q = UI.q.sch.trim().toLowerCase();
  let rs = [...S.data.ricette.values()].filter(r => !!r.archiviato === UI.schArch);
  const cats = [...new Set(rs.map(r => r.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'));
  if (UI.schCat && cats.includes(UI.schCat)) rs = rs.filter(r => r.categoria === UI.schCat);
  if (q) rs = rs.filter(r => `${r.nome} ${r.sigla} ${r.categoria}`.toLowerCase().includes(q));
  rs.sort(byName);
  const catSeg = cats.length > 1 ? seg('schCat', [['', 'Tutte'], ...cats.map(c => [c, c])]) : '';
  return `<div class="ph"><div><h1>Schede tecniche</h1><p>Ricetta e grammature, allergeni, elenco ingredienti per il cartello, conservazione, durata e costo.</p></div>
    <div class="acts"><button type="button" class="btn pri w" data-act="new-ric">${IC.plus}Nuova scheda</button><button type="button" class="btn dl" data-act="dl-libro">${IC.down}Libro ingredienti</button></div></div>
    <div class="bar">${search('sch', 'Cerca scheda')}${catSeg}</div>
    ${rs.length ? `<div class="cards">${rs.map(ricCard).join('')}</div>` : empty(q ? 'Nessuna scheda corrisponde alla ricerca.' : UI.schArch ? 'Nessuna scheda archiviata.' : 'Nessuna scheda tecnica. Crea la prima con «Nuova scheda».')}
    <p style="margin-top:18px"><button type="button" class="lnk" data-act="toggle-arch">${UI.schArch ? 'Torna alle schede attive' : 'Mostra le schede archiviate'}</button></p>`;
}

/* ---------- Magazzino ---------- */
function vMagazzino() {
  return `<div class="ph"><div><h1>Magazzino</h1><p>Giacenze calcolate dai lotti: caricate con gli acquisti, scalate da produzioni e scarichi.</p></div>
    <div class="acts"><button type="button" class="btn w" data-act="new-art">${IC.plus}Nuovo articolo</button><button type="button" class="btn dl" data-act="dl-csv">${IC.down}Esporta CSV</button></div></div>
    <div class="bar">${seg('magSeg', [['acq', 'Acquistati'], ['prod', 'Prodotti']])}${search('mag', UI.magSeg === 'acq' ? 'Cerca articolo o lotto del fornitore' : 'Cerca prodotto o lotto')}</div>
    ${UI.magSeg === 'acq' ? magAcq() : magProd()}`;
}
function artRow(a) {
  const s = artStock(a.id), chips = [];
  if (s.expired > EPS) chips.push(`<span class="chip red">Scaduto ${fmtQ(s.expired, a.unita)}</span>`);
  if (s.next) {
    const n = daysBetween(today(), s.next);
    chips.push(n <= cfg().giorniAvviso ? `<span class="chip amb">${n === 0 ? 'Scade oggi' : n === 1 ? 'Scade domani' : `Scade tra ${n} giorni`}</span>` : `<span class="chip">Prossima scadenza ${fmtDs(s.next)}</span>`);
  }
  if (+a.scortaMin > 0 && s.usable < +a.scortaMin) chips.push(`<span class="chip amb">Sotto scorta</span>`);
  return `<button type="button" class="row" data-act="open-art" data-id="${esc(a.id)}">
    <span class="m"><b>${esc(a.nome)}</b><span>${esc(CAT[a.categoria] || CAT.materia)} · ${s.n === 1 ? '1 lotto' : `${s.n} lotti`} in giacenza</span></span>
    <span class="s"><span class="q">${fmtQ(s.usable, a.unita)}</span>${chips.join('')}</span></button>`;
}
function magAcq() {
  const q = UI.q.mag.trim().toLowerCase(), Dd = drv();
  let arts = [...S.data.articoli.values()].filter(a => !a.archiviato);
  if (UI.magCat !== 'tutti') arts = arts.filter(a => (a.categoria || 'materia') === UI.magCat);
  if (q) arts = arts.filter(a => String(a.nome).toLowerCase().includes(q) || (Dd.artLots.get(a.id) || []).some(l => l.lottoF.toLowerCase().includes(q)));
  arts.sort(byName);
  return `<div class="bar">${seg('magCat', [['tutti', 'Tutti'], ['materia', 'Materie prime'], ['rivendita', 'Rivendita'], ['imballaggio', 'Imballaggi']])}</div>
    ${arts.length ? `<div class="list">${arts.map(artRow).join('')}</div>` : empty(q ? 'Nessun articolo corrisponde alla ricerca.' : 'Nessun articolo in questa categoria.')}`;
}
function magProd() {
  const q = UI.q.mag.trim().toLowerCase(), Dd = drv();
  const out = [...S.data.ricette.values()].sort(byName).map(r => {
    const lots = (Dd.ricLots.get(r.id) || []).filter(l => l.res > EPS && (!q || `${r.nome} ${l.p.lotto}`.toLowerCase().includes(q)));
    if (!lots.length) return '';
    const s = stockOf(lots);
    return `<div class="grp"><div class="grp-h"><button type="button" class="lnk" data-act="open-ric" data-id="${esc(r.id)}">${esc(r.nome)}</button><span class="q">${fmtQ(s.usable, r.resaUnita)}${s.expired > EPS ? ` <small>+ ${fmtQ(s.expired, r.resaUnita)} scaduti</small>` : ''}</span></div><div class="list">${lots.map(prodRow).join('')}</div></div>`;
  }).join('');
  return out || empty(q ? 'Nessun prodotto corrisponde alla ricerca.' : 'Nessun prodotto in giacenza.');
}

/* ---------- Acquisti ---------- */
function vAcquisti() {
  return `<div class="ph"><div><h1>Acquisti</h1><p>Fatture e DDT: ogni riga diventa un lotto di magazzino con lotto del fornitore, scadenza e costo.</p></div>
    <div class="acts w"><button type="button" class="btn pri" data-act="new-doc">${IC.plus}Registra documento</button><button type="button" class="btn" data-act="new-forn">Nuovo fornitore</button></div></div>
    <div class="bar">${acqSeg(UI.acqSeg)}${search('acq', UI.acqSeg === 'doc' ? 'Cerca numero, fornitore, articolo o lotto' : 'Cerca fornitore')}</div>
    ${UI.acqSeg === 'doc' ? acqDocs() : acqForn()}`;
}
const acqSeg = cur => `<div class="seg" role="group">${[['doc', 'Documenti'], ['prezzi', 'Prezzi'], ['forn', 'Fornitori']].map(([v, t]) => `<button type="button" data-act="acqseg" data-v="${v}" aria-pressed="${cur === v}">${t}</button>`).join('')}</div>`;
function acqDocs() {
  const q = UI.q.acq.trim().toLowerCase();
  let docs = [...S.data.documenti.values()];
  if (q) docs = docs.filter(d => [d.numero, fornName(d.fornitoreId), TIPI[d.tipo], ...(d.righe || []).flatMap(r => [S.data.articoli.get(r.articoloId)?.nome, r.lotto])].join(' ').toLowerCase().includes(q));
  docs.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || (b.creato || 0) - (a.creato || 0));
  if (!docs.length) return empty(q ? 'Nessun documento corrisponde alla ricerca.' : 'Nessun acquisto registrato. Registra la prima fattura o il primo DDT.');
  return `<div class="list">${docs.map(d => {
    const n = (d.righe || []).length, att = (d.allegati || []).length;
    const noPrice = d.tipo !== 'inventario' && (d.righe || []).some(r => r.importo == null || r.importo === '');
    return `<button type="button" class="row" data-act="open-doc" data-id="${esc(d.id)}"><span class="m"><b>${esc(docName(d))}</b><span>${esc(fornName(d.fornitoreId) || (d.tipo === 'inventario' ? 'Merce già in magazzino' : 'Fornitore non indicato'))} · ${n === 1 ? '1 riga' : `${n} righe`}${att ? ` · ${att === 1 ? '1 allegato' : `${att} allegati`}` : ''}${d.tipo === 'ddt' && d.fatturaRif ? ` · fattura ${esc(d.fatturaRif)}` : ''}</span></span><span class="s"><span class="q">${EUR(docTot(d))}</span>${d.soloPrezzi ? '<span class="chip">Solo storico prezzi</span>' : ''}${noPrice ? '<span class="chip amb">Prezzi da inserire</span>' : ''}</span></button>`;
  }).join('')}</div>`;
}
function acqForn() {
  const q = UI.q.acq.trim().toLowerCase();
  let fs = [...S.data.fornitori.values()];
  if (q) fs = fs.filter(f => `${f.nome} ${f.piva || ''} ${f.note || ''}`.toLowerCase().includes(q));
  fs.sort(byName);
  if (!fs.length) return empty(q ? 'Nessun fornitore corrisponde alla ricerca.' : 'Nessun fornitore. Aggiungilo con «Nuovo fornitore».');
  const docs = [...S.data.documenti.values()];
  return `<div class="list">${fs.map(f => {
    const mine = docs.filter(d => d.fornitoreId === f.id), last = mine.map(d => d.data).sort().pop();
    return `<button type="button" class="row" data-act="open-forn" data-id="${esc(f.id)}"><span class="m"><b>${esc(f.nome)}</b><span>${mine.length === 1 ? '1 documento' : `${mine.length} documenti`}${last ? ' · ultimo ' + fmtD(last) : ''}${f.note ? ' · ' + esc(f.note) : ''}</span></span></button>`;
  }).join('')}</div>`;
}

/* ---------- Impostazioni ---------- */
function vImpostazioni() {
  const c = cfg(), n = countSample();
  const where = S.mode === 'cloud' ? 'I dati sono salvati nell’archivio di questa pagina su claude.ai e si vedono da ogni dispositivo con cui la apri.' : S.mode === 'local' ? 'I dati sono salvati solo in questo browser: esporta spesso un backup.' : 'In questa vista i dati non vengono salvati.';
  return `<div class="ph"><div><h1>Impostazioni</h1><p>${esc(where)}</p></div></div>
    <form class="card" id="cfgForm">
      <label class="fld"><span>Nome dell'attività</span><input type="text" id="cfg-nome" name="nome" value="${esc(c.nome)}" placeholder="Es. Bar Centrale" ${S.ro ? 'disabled' : ''}></label>
      <div class="g2"><label class="fld"><span>Avviso scadenze (giorni prima)</span><input type="text" id="cfg-gg" name="giorniAvviso" inputmode="numeric" value="${esc(c.giorniAvviso)}" ${S.ro ? 'disabled' : ''}></label>
      <label class="fld"><span>IVA sulle vendite (%)</span><input type="text" id="cfg-iva" name="iva" inputmode="decimal" value="${esc(fmtIn(c.iva))}" ${S.ro ? 'disabled' : ''}></label></div>
      <p class="hint" style="margin:-4px 0 14px">L'IVA serve solo a calcolare il food cost sul prezzo di vendita.</p>
      <div class="g2"><label class="fld"><span>Segnala rincari oltre (%)</span><input type="text" id="cfg-sr" name="sogliaRincaro" inputmode="decimal" value="${esc(fmtIn(c.sogliaRincaro))}" ${S.ro ? 'disabled' : ''}></label></div>
      <p class="hint" style="margin:-4px 0 14px">In «Oggi» compare un avviso quando un prodotto comprato negli ultimi 30 giorni costa più di questa percentuale rispetto all'acquisto precedente.</p>
      <button type="submit" class="btn pri w">Salva impostazioni</button>
    </form>
    <h2>Backup ed esportazioni</h2>
    <div class="card"><p class="muted">Il backup contiene tutto: schede, acquisti, lotti, movimenti. Serve anche per spostare i dati su un altro sistema.</p>
      <div class="acts"><button type="button" class="btn dl" data-act="dl-backup">${IC.down}Esporta backup</button><label class="btn w">Importa backup<input type="file" accept="application/json,.json" data-file="import"></label><button type="button" class="btn dl" data-act="dl-csv">${IC.down}Giacenze in CSV</button></div>
      ${S.mode !== 'local' && !S.downloads ? '<p class="hint">Il download dei file non è disponibile in questa vista.</p>' : ''}</div>
    ${n ? `<h2>Dati di esempio</h2><div class="card"><p>Ci sono ${n} elementi di esempio (biscotti, crema pasticcera, tartellette, i loro acquisti e lotti). Le registrazioni fatte da te non vengono toccate.</p><button type="button" class="btn dan w" data-act="del-sample">Elimina dati di esempio</button></div>` : ''}`;
}

/* ---------- Prezzi d'acquisto ---------- */
function vPrezzi() {
  const k = PERIODI[UI.prezziP] ? UI.prezziP : '3m', start = periodStart(k), Dd = drv(), q = UI.q.prz.trim().toLowerCase();
  const rows = [];
  for (const id of Dd.prices.keys()) { const a = S.data.articoli.get(id); if (a) rows.push({a, ps: priceStats(id, start)}); }
  const head = `<div class="ph"><div><h1>Prezzi d'acquisto</h1><p>Prezzo al kg, al litro o al pezzo preso da fatture e DDT, IVA esclusa: così confronti anche confezioni di misura diversa.</p></div>
    <div class="acts"><button type="button" class="btn dl" data-act="dl-prezzi">${IC.down}Esporta CSV</button></div></div>
    <div class="bar">${acqSeg('prezzi')}</div>`;
  if (!rows.length) return head + empty('Ancora nessun prezzo: registra fatture o DDT con gli importi delle righe. Puoi inserire anche fatture vecchie spuntando «Solo storico prezzi», così vedi subito l’andamento.');
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
  const prodRows = list.map(({a, ps}) => `<button type="button" class="row" data-act="open-prezzi" data-id="${esc(a.id)}">
      <span class="m"><b>${esc(a.nome)}</b><span>Ultimo ${EUR(ps.last.p)} ${perU(a.unita)} il ${fmtD(ps.last.date)}${fornName(ps.last.forn) ? ' · ' + esc(fornName(ps.last.forn)) : ''}</span><span>${ps.s.length === 1 ? '1 acquisto' : ps.s.length + ' acquisti'}${Math.abs(ps.extra) >= 0.005 ? ` · ${ps.extra > 0 ? `+${EUR(ps.extra)} spesi in più` : `${EUR(-ps.extra)} risparmiati`}` : ''}</span></span>
      <span class="s">${spark(ps.s)}${ps.inP.length ? delta(ps.chg) : '<span class="chip">Nessun acquisto</span>'}</span></button>`).join('');
  const iva = cfg().iva;
  const imp = [...S.data.ricette.values()].filter(r => !r.archiviato).map(r => {
    const rq = +r.resaQta, now = recCostOf(r, [r.id]), then = recCostOf(r, [r.id], id => priceAt(id, start));
    if (!(rq > 0) || now.miss.length || then.miss.length || !(then.tot > 0)) return null;
    const cN = now.tot / rq, cT = then.tot / rq, pr = +r.prezzoVendita, net = pr > 0 ? pr / (1 + iva / 100) : 0;
    return {r, cN, cT, ch: (cN - cT) / cT, fN: net ? cN / net * 100 : null, fT: net ? cT / net * 100 : null};
  }).filter(x => x && Math.abs(x.ch) >= 0.005).sort((x, y) => y.ch - x.ch);
  const fc = v => num(Math.round(v * 10) / 10) + '%';
  const impRows = imp.map(x => { const u = unitOk(x.r.resaUnita); return `<button type="button" class="row" data-act="open-ric" data-id="${esc(x.r.id)}"><span class="m"><b>${esc(x.r.nome)}</b><span>Costo ${u === 'pz' ? 'al pezzo' : 'al ' + u}: ${EUR(x.cT)} → ${EUR(x.cN)}</span>${x.fN != null ? `<span>Food cost ${fc(x.fT)} → ${fc(x.fN)}</span>` : ''}</span><span class="s">${delta(x.ch)}</span></button>`; }).join('');
  const missing = [...S.data.documenti.values()].filter(d => d.tipo !== 'inventario' && (d.righe || []).some(r => r.importo == null || r.importo === '')).sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  return head + `<div class="bar">${seg('prezziP', Object.entries(PERIODI).map(([v, [t]]) => [v, t]))}</div>
    <p class="finding">${esc(finding)}</p>
    <div class="stats"><div class="stat ${tot > 0.005 ? 'up' : tot < -0.005 ? 'down' : ''}"><b>${tot > 0.005 ? '+' : tot < -0.005 ? '−' : ''}${EUR(Math.abs(tot))}</b><span>${tot < -0.005 ? 'Risparmiati' : 'Spesi in più'} rispetto ${esc(ref)}</span></div><div class="stat"><b>${up.length}</b><span>${up.length === 1 ? 'Prodotto rincarato' : 'Prodotti rincarati'}</span></div><div class="stat"><b>${down.length}</b><span>${down.length === 1 ? 'Prodotto calato' : 'Prodotti calati'}</span></div></div>
    <h2>Prodotti</h2><p class="muted" style="margin-top:-4px">Variazione del prezzo ${k === 'tutto' ? 'dal primo acquisto registrato' : `negli ultimi ${PERIODI[k][0]}`}, dai rincari che pesano di più.</p>
    <div class="bar">${search('prz', 'Cerca prodotto')}</div>
    ${prodRows ? `<div class="list">${prodRows}</div>` : empty('Nessun prodotto corrisponde alla ricerca.')}
    <h2>Costo delle schede</h2>
    <p class="muted" style="margin-top:-4px">Costo per unità oggi e con i prezzi di ${k === 'tutto' ? 'quando hai iniziato a registrarli' : 'inizio periodo'}.</p>
    ${impRows ? `<div class="list">${impRows}</div>` : empty('Nessuna variazione di costo nelle schede in questo periodo.')}
    ${missing.length ? `<h2>Prezzi da completare</h2><p class="muted" style="margin-top:-4px">${missing.length === 1 ? 'Un documento ha' : missing.length + ' documenti hanno'} righe senza importo. Quando arriva la fattura, apri il documento e inserisci gli importi: entrano subito nello storico.</p><div class="list">${missing.slice(0, 8).map(d => `<button type="button" class="row" data-act="open-doc" data-id="${esc(d.id)}"><span class="m"><b>${esc(docName(d))}</b><span>${esc(fornName(d.fornitoreId) || 'Fornitore non indicato')}</span></span><span class="s"><span class="chip amb">Prezzi da inserire</span></span></button>`).join('')}</div>` : ''}`;
}
