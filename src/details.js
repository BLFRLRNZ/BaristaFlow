/* ---------- fogli (dettagli e moduli) ---------- */
const stack = [];
const top = () => stack[stack.length - 1];
function openSheet(o) {
  o.prevFocus = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet${o.small ? ' small' : ''}${o.form ? ' form' : ''}" role="dialog" aria-modal="true"><div class="grab" aria-hidden="true"></div><div class="sh-head"><h2></h2><button type="button" class="btn icon" data-act="close" aria-label="Chiudi">${IC.x}</button></div><div class="sh-body"></div><div class="sh-foot"></div></div>`;
  wrap.addEventListener('click', e => { if (e.target === wrap) requestClose(); });
  dragToClose(wrap);
  o.el = wrap; stack.push(o);
  $('#sheets').append(wrap);
  document.documentElement.style.overflow = 'hidden';
  holdHistory();
  paintSheet(o);
  o.mount?.(o);
  const f = o.form && matchMedia('(pointer: fine)').matches ? $('.sh-body input:not([type=file]):not([disabled]), .sh-body select:not([disabled])', wrap) : null;
  (f || $('[data-act=close]', wrap)).focus({preventScroll: true});
  return o;
}
function paintSheet(o) {
  const title = typeof o.title === 'function' ? o.title() : o.title;
  const h = $('.sh-head h2', o.el); h.textContent = title; $('.sheet', o.el).setAttribute('aria-label', title);
  const b = $('.sh-body', o.el), f = $('.sh-foot', o.el);
  const html = o.body(); if (b._h !== html) { b.innerHTML = html; b._h = html; }
  const ft = o.foot ? o.foot() : '';
  if (f._h !== ft) { f.innerHTML = ft; f._h = ft; }
  f.hidden = !ft.trim();
  drawCharts(o.el);
  o.after?.(o);
}
/* trascina in basso la testata per chiudere il foglio (telefono) */
function dragToClose(wrap) {
  const sheet = $('.sheet', wrap), zones = [$('.grab', wrap), $('.sh-head', wrap)];
  let y0 = null, dy = 0, t0 = 0;
  const down = e => { if (e.target.closest('button') || matchMedia('(min-width: 760px)').matches) return; y0 = e.clientY; dy = 0; t0 = Date.now(); sheet.style.transition = 'none'; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = dy ? `translateY(${dy}px)` : ''; };
  const up = () => {
    if (y0 == null) return; y0 = null;
    const fast = dy > 60 && dy / Math.max(1, Date.now() - t0) > 0.6;
    sheet.style.transition = 'transform .22s ease-out';
    // chiudendo, il foglio riparte da dove l'ha lasciato il dito; se la chiusura non avviene torna su
    if (!(dy > 140 || fast)) { sheet.style.transform = ''; return; }
    const o = stack.find(x => x.el === wrap);
    requestClose().then(() => { if (stack.includes(o)) sheet.style.transform = ''; });
  };
  for (const z of zones) { z.addEventListener('pointerdown', down); z.addEventListener('pointermove', move); z.addEventListener('pointerup', up); z.addEventListener('pointercancel', up); }
}
function closeSheet() {
  const o = stack.pop(); if (!o) return;
  leaveSheet(o.el); o.onClose?.();
  if (!stack.length) document.documentElement.style.overflow = '';
  if (o.prevFocus && document.contains(o.prevFocus)) o.prevFocus.focus({preventScroll: true});
  releaseHistory();
}
/* il foglio chiuso esce subito dal DOM; al suo posto scende una copia inerte, così nessuna logica aspetta l'animazione */
function leaveSheet(wrap) {
  if (!wrap.isConnected || !wrap.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { wrap.remove(); return; }
  const body = $('.sh-body', wrap), y = body ? body.scrollTop : 0;
  const ghost = wrap.cloneNode(true), panel = ghost.firstElementChild;
  ghost.className = 'sheet-ghost'; ghost.inert = true; ghost.setAttribute('aria-hidden', 'true');
  panel.className = panel.className.replace(/\bsheet\b/, 'sheet-g');
  panel.removeAttribute('role'); panel.removeAttribute('aria-modal');
  for (const el of [ghost, ...ghost.querySelectorAll('[id],[data-act]')]) { el.removeAttribute('id'); el.removeAttribute('data-act'); }
  wrap.replaceWith(ghost);
  const gb = $('.sh-body', ghost); if (gb) gb.scrollTop = y;
  const wide = matchMedia('(min-width: 760px)').matches;
  const pa = panel.animate(wide ? [{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'scale(.97) translateY(8px)'}] : [{}, {transform: 'translateY(105%)'}], {duration: wide ? 160 : 240, easing: 'cubic-bezier(.4,0,.9,.6)', fill: 'forwards'});
  ghost.animate([{opacity: 1}, {opacity: 0}], {duration: wide ? 160 : 240, easing: 'ease-in', fill: 'forwards'});
  pa.finished.catch(() => {}).then(() => ghost.remove());
}
/* il tasto Indietro (del telefono o del browser) chiude il foglio in cima invece di lasciare la pagina:
   finché c'è un foglio aperto la cronologia ha una voce in più, che si consuma quando l'ultimo si chiude */
const hist = {held: false, hash: '', skip: 0};
function holdHistory() {
  if (hist.held) return;
  try { history.pushState({barista: 'foglio'}, ''); hist.held = true; hist.hash = location.hash; } catch { /* cronologia non disponibile */ }
}
function releaseHistory() {
  queueMicrotask(() => {
    if (stack.length || !hist.held) return;
    hist.held = false;
    if (location.hash !== hist.hash) return; // nel frattempo si è cambiata pagina: la voce resta indietro, innocua
    hist.skip++; history.back();
  });
}
window.addEventListener('popstate', () => {
  if (hist.skip) { hist.skip--; return; }
  if (!hist.held) return;
  hist.held = false;
  if (stack.length) { holdHistory(); requestClose(); }
});
async function requestClose() {
  const o = top(); if (!o) return;
  if (o.form && o.dirty && !(await ask('Chiudere senza salvare le modifiche?', 'Chiudi senza salvare', true))) return;
  if (top() === o) closeSheet();
}
function refreshSheets() { for (const o of stack) if (o.live) { const b = $('.sh-body', o.el), y = b.scrollTop; paintSheet(o); b.scrollTop = y; } }
function ask(msg, okLabel = 'Conferma', danger = false, noLabel = 'Annulla') {
  return new Promise(res => {
    let done = false;
    const o = openSheet({title: 'Conferma', small: true, body: () => `<p>${esc(msg)}</p>`, foot: () => `<button type="button" class="btn" data-act="ask" data-v="0">${esc(noLabel)}</button><button type="button" class="btn ${danger ? 'dan' : 'pri'}" data-act="ask" data-v="1">${esc(okLabel)}</button>`});
    o.resolve = v => { if (done) return; done = true; if (top() === o) closeSheet(); res(v); };
    o.onClose = () => { if (!done) { done = true; res(false); } };
  });
}
function toast(msg, bad, action) {
  const box = $('#toast'), t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  const sp = document.createElement('span'); sp.textContent = msg; t.append(sp);
  if (action) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label;
    b.addEventListener('click', () => { t.remove(); action.fn(); });
    t.append(b);
  }
  box.append(t);
  while (box.children.length > 2) box.firstElementChild.remove();
  if (!action?.stay) setTimeout(() => t.remove(), action ? 7000 : bad ? 6500 : 2800);
}
const ferr = (o, msg) => { const e = $('#ferr', o.el); if (e) { e.textContent = msg; e.scrollIntoView({block: 'nearest'}); } else toast(msg, true); return false; };

/* ---------- pezzi comuni dei dettagli ---------- */
function allegatiHTML(doc) {
  const a = (doc.allegati || []).filter(x => x && typeof x.id === 'string' && /^[A-Za-z0-9_-]+$/.test(x.id));
  if (!a.length) return '';
  return `<div class="att">${a.map(x => {
    const url = '/_blob/' + encodeURIComponent(x.id), img = /^image\//.test(x.tipo || '');
    return `<a href="${url}" target="_blank" rel="noopener">${img ? `<img src="${url}" alt="" loading="lazy">` : ''}${esc(x.nome || 'Allegato')}</a>`;
  }).join('')}</div>`;
}
function movList(l) {
  if (!l.mov.length) return empty('Nessuno scarico o rettifica registrati.');
  const u = lotUnit(l);
  const ic = {vendita: IC.sell, scarto: IC.trash, uso: IC.chef, rettifica: IC.box};
  return `<div class="list">${[...l.mov].sort((a, b) => String(b.data).localeCompare(String(a.data)) || (b.creato || 0) - (a.creato || 0)).map(m => `<div class="row">${av(ic[m.tipo] || IC.box, m.tipo === 'scarto' ? 'red' : '')}<span class="m"><b>${esc(MOV[m.tipo] || 'Movimento')} · ${fmtQ(Math.abs(+m.delta || 0), u)}${+m.delta > 0 ? ' in più' : ''}</b><span>${fmtD(m.data)}${m.nota ? ' · ' + esc(m.nota) : ''}</span></span><span class="s"><button type="button" class="btn sm w" data-act="del-mov" data-id="${esc(m.id)}">Elimina</button></span></div>`).join('')}</div>`;
}
function consumoItem(c, path) {
  const Dd = drv(), it = itemOf(c.tipo, c.refId), nome = it?.nome || c.nome || 'Ingrediente eliminato';
  const qty = fmtQ(+c.qta, it ? baseOf(c.tipo, it) : '');
  if (!c.lotId) return `<div class="tr warn"><div class="tr-h"><b>${esc(nome)}</b><span class="q">${qty}</span></div><div class="tr-meta"><span>Usato senza un lotto registrato in magazzino</span></div></div>`;
  if (c.tipo === 'ric') {
    const lp = Dd.prod.get(c.lotId);
    if (!lp) return `<div class="tr warn"><div class="tr-h"><b>${esc(nome)}</b><span class="q">${qty}</span></div><div class="tr-meta"><span>Il lotto del semilavorato è stato eliminato</span></div></div>`;
    const sub = path.includes(c.lotId) ? '' : `<div class="sub"><p class="hint" style="margin:0">Ingredienti del lotto ${esc(lp.p.lotto)} (quantità riferite all'intero lotto)</p>${(lp.p.consumi || []).map(cc => consumoItem(cc, [...path, c.lotId])).join('')}</div>`;
    return `<div class="tr"><div class="tr-h"><b>${esc(nome)}</b><span class="q">${qty}</span></div><div class="tr-meta"><span>Semilavorato, <button type="button" class="lnk" data-act="open-lotto" data-id="${esc(lp.key)}">lotto ${esc(lp.p.lotto)}</button></span><span>prodotto il ${fmtD(lp.data)}</span><span>scadenza ${fmtD(lp.scad)}</span></div>${sub}</div>`;
  }
  const la = Dd.acq.get(c.lotId);
  if (!la) return `<div class="tr warn"><div class="tr-h"><b>${esc(nome)}</b><span class="q">${qty}</span></div><div class="tr-meta"><span>Il documento d'acquisto di questo lotto è stato eliminato</span></div></div>`;
  return `<div class="tr"><div class="tr-h"><b>${esc(nome)}</b><span class="q">${qty}</span></div>
    <div class="tr-meta"><span>Lotto fornitore <b>${esc(la.lottoF || 'non indicato')}</b></span><span>scadenza ${fmtD(la.scad)}</span>${fornName(la.doc.fornitoreId) ? `<span>${esc(fornName(la.doc.fornitoreId))}</span>` : ''}</div>
    <div class="tr-meta"><button type="button" class="lnk" data-act="open-doc" data-id="${esc(la.doc.id)}">${esc(docName(la.doc))}</button>${la.doc.tipo === 'ddt' && la.doc.fatturaRif ? `<span>fattura ${esc(la.doc.fatturaRif)}</span>` : ''}<button type="button" class="lnk" data-act="open-acq" data-id="${esc(la.key)}">dettaglio lotto</button></div>${allegatiHTML(la.doc)}</div>`;
}
function fwdTree(l, depth = 0) {
  if (!l.used.length) return depth ? '' : empty('Non ancora usato in produzione.');
  const u = lotUnit(l), Dd = drv();
  return `<div class="${depth ? 'sub' : 'trace'}">${l.used.map(x => {
    const lp = Dd.prod.get(x.prodId); if (!lp) return '';
    const s = st(lp);
    return `<div class="tr"><div class="tr-h"><button type="button" class="lnk" data-act="open-lotto" data-id="${esc(lp.key)}">${esc(lp.p.lotto)}</button><span class="q">${fmtQ(x.qta, u)}</span></div>
      <div class="tr-meta"><span>${esc(lotName(lp))}</span><span>prodotto il ${fmtD(lp.data)}</span>${lp.vetrina ? '' : `<span>residuo ${fmtQ(lp.res, lotUnit(lp))}</span>`}<span class="chip ${s.c}">${esc(s.t)}</span></div>${depth < 4 ? fwdTree(lp, depth + 1) : ''}</div>`;
  }).join('')}</div>`;
}

/* ---------- dettaglio lotto di produzione (tracciabilità) ---------- */
function sheetLotto(id) {
  openSheet({live: true, title: () => { const p = S.data.produzioni.get(id); return p ? `Lotto ${p.lotto}` : 'Lotto'; }, body: () => lottoBody(id), foot: () => lottoFoot(id)});
}
function lottoBody(id) {
  const l = drv().prod.get(id); if (!l) return empty('Questo lotto non esiste più.');
  const p = l.p, s = st(l), u = lotUnit(l), cost = lotCost(id);
  const al = algSort(p.allergeni || []), tr = algSort((p.tracce || []).filter(x => !al.includes(x)));
  const r = l.item;
  return `<div class="dh"><p class="muted">${esc(lotName(l))}</p><div class="big">${esc(p.lotto)}</div><span class="chip ${s.c}">${esc(s.t)}</span></div>
    <div class="kv"><div><small>Prodotto il</small><b>${fmtD(p.data)}</b></div><div><small>${esc(scadLabel(p.tipoScadenza))}</small><b>${fmtD(l.scad)}</b></div><div><small>Quantità prodotta</small><b>${fmtQ(l.qta, u)}</b></div>${l.vetrina ? `<div><small>Stato</small><b>${l.res > EPS ? 'In vetrina' : 'In archivio'}</b><small>${l.res > EPS ? 'fino alla scadenza' : 'scaduto, senza scarico'}</small></div>` : `<div><small>Residuo</small><b>${fmtQ(l.res, u)}</b></div>`}</div>
    ${l.vetrina ? '<p class="hint">Lo scarico delle vendite è spento (Impostazioni): il lotto resta in vetrina fino alla scadenza e poi va in archivio.</p>' : ''}
    <p class="muted">${p.operatore ? `Operatore: ${esc(p.operatore)} · ` : ''}${r ? `Scheda: <button type="button" class="lnk" data-act="open-ric" data-id="${esc(r.id)}">${esc(r.nome)}</button>` : 'Scheda tecnica eliminata'}</p>
    <p class="dl"><button type="button" class="btn" data-act="pdf-lotto" data-id="${esc(id)}">${IC.down}Scheda di produzione PDF</button></p>
    <h3>Allergeni</h3>${algChips(al, tr)}
    <h3>Materie prime e lotti utilizzati</h3>
    <div class="trace">${(p.consumi || []).map(c => consumoItem(c, [id])).join('') || empty('Nessun ingrediente registrato.')}</div>
    <h3>Costo del lotto</h3>
    <p>${EUR(cost.tot)} in totale, ${l.qta > 0 ? EUR(cost.tot / l.qta) : '—'} ${u === 'pz' ? 'al pezzo' : 'al ' + u}${cost.partial ? ' <span class="muted">(in parte stimato: manca il prezzo di qualche lotto)</span>' : ''}</p>
    ${l.used.length ? `<h3>Usato come ingrediente in</h3>${fwdTree(l)}` : ''}
    ${l.vetrina && !l.mov.length ? '' : `<h3>Scarichi e rettifiche</h3>${movList(l)}`}
    ${p.note ? `<h3>Note</h3><div class="prose">${esc(p.note)}</div>` : ''}
    <div class="morebar"><button type="button" class="btn w" data-act="edit-prod" data-id="${esc(id)}">Modifica</button><button type="button" class="btn dan w" data-act="del-prod" data-id="${esc(id)}">Elimina lotto</button></div>`;
}
function lottoFoot(id) {
  const l = drv().prod.get(id); if (!l || S.ro || l.vetrina) return '';
  const s = st(l);
  if (l.res <= EPS) return `<button type="button" class="btn" data-act="mov" data-kind="prod" data-id="${esc(id)}">Rettifica giacenza</button>`;
  return s.c === 'red'
    ? `<button type="button" class="btn" data-act="mov" data-kind="prod" data-id="${esc(id)}">Scarico o rettifica</button><button type="button" class="btn pri" data-act="smaltisci" data-kind="prod" data-id="${esc(id)}">Smaltisci il residuo</button>`
    : `<button type="button" class="btn" data-act="esaurito" data-id="${esc(id)}">Segna esaurito</button><button type="button" class="btn pri" data-act="mov" data-kind="prod" data-id="${esc(id)}">Registra scarico</button>`;
}

/* ---------- dettaglio lotto acquistato (richiamo: dove è finito) ---------- */
function sheetLottoAcq(key) {
  openSheet({live: true, title: () => { const l = drv().acq.get(key); return l ? `${lotName(l)}` : 'Lotto'; }, body: () => acqBody(key), foot: () => acqFoot(key)});
}
function acqBody(key) {
  const l = drv().acq.get(key); if (!l) return empty('Questo lotto non esiste più.');
  const a = l.item, s = st(l), u = lotUnit(l);
  return `<div class="dh"><p class="muted">${esc(lotName(l))} · lotto del fornitore</p><div class="big">${esc(l.lottoF || 'Senza codice')}</div><span class="chip ${s.c}">${esc(s.t)}</span></div>
    <div class="kv"><div><small>${l.fuori ? 'Comprato' : 'Caricato'}</small><b>${fmtQ(l.qta, u)}</b></div>${l.fuori ? '' : `<div><small>Residuo</small><b>${fmtQ(l.res, u)}</b></div>`}<div><small>Scadenza</small><b>${fmtD(l.scad)}</b></div><div><small>Costo</small><b>${l.costU != null ? EUR(l.costU) : '—'}</b><small>${l.costU != null ? (u === 'pz' ? 'al pezzo' : 'al ' + u) : 'importo non indicato'}</small></div></div>
    <p>${fornName(l.doc.fornitoreId) ? `Da ${esc(fornName(l.doc.fornitoreId))} · ` : ''}<button type="button" class="lnk" data-act="open-doc" data-id="${esc(l.doc.id)}">${esc(docName(l.doc))}</button>${a ? ` · <button type="button" class="lnk" data-act="open-art" data-id="${esc(a.id)}">scheda articolo</button>` : ''}</p>
    ${allegatiHTML(l.doc)}
    ${l.fuori ? '<p class="hint">Lo scarico delle vendite è spento (Impostazioni): della rivendita si tengono solo gli acquisti e i prezzi.</p>' : ''}
    <h3>Dove è stato usato</h3><p class="hint" style="margin-top:-4px">Se il fornitore richiama questo lotto, qui trovi i prodotti che lo contengono.</p>${fwdTree(l)}
    ${l.fuori && !l.mov.length ? '' : `<h3>Scarichi e rettifiche</h3>${movList(l)}`}`;
}
function acqFoot(key) {
  const l = drv().acq.get(key); if (!l || S.ro || l.fuori) return '';
  const k = esc(key);
  if (l.res > EPS && st(l).c === 'red') return `<button type="button" class="btn" data-act="mov" data-kind="acq" data-id="${k}">Scarico o rettifica</button><button type="button" class="btn pri" data-act="smaltisci" data-kind="acq" data-id="${k}">Smaltisci il residuo</button>`;
  return `<button type="button" class="btn pri" data-act="mov" data-kind="acq" data-id="${k}">${l.res > EPS ? 'Scarico o rettifica' : 'Rettifica giacenza'}</button>`;
}

/* ---------- dettaglio articolo ---------- */
function sheetArticolo(id) {
  openSheet({live: true, title: () => S.data.articoli.get(id)?.nome || 'Articolo', body: () => artBody(id), foot: () => artFoot(id)});
}
function artBody(id) {
  const a = S.data.articoli.get(id); if (!a) return empty('Questo articolo non esiste più.');
  const lots = drv().artLots.get(id) || [], s = stockOf(lots), cost = drv().lastCost.get(id);
  const inUse = lots.filter(l => l.res > EPS), done = lots.filter(l => l.res <= EPS);
  const recs = [...S.data.ricette.values()].filter(r => (r.ingredienti || []).some(g => g.tipo !== 'ric' && g.refId === id)).sort(byName);
  const al = algSort(a.allergeni || []);
  return `<div class="dh"><p class="muted">${esc(CAT[a.categoria] || CAT.materia)} · ${esc(CONS[a.conservazione] || 'Ambiente')}${a.archiviato ? ' · archiviato' : ''}</p><div class="big" style="font-stretch:85%">${esc(a.nome)}</div></div>
    <div class="kv">${soloAcquisti(a) ? '' : `<div><small>Giacenza utilizzabile</small><b>${fmtQ(s.usable, a.unita)}</b></div><div><small>Scaduto da smaltire</small><b>${fmtQ(s.expired, a.unita)}</b></div><div><small>Scorta minima</small><b>${+a.scortaMin > 0 ? fmtQ(+a.scortaMin, a.unita) : '—'}</b></div>`}<div><small>Ultimo costo</small><b>${cost != null ? EUR(cost) : '—'}</b><small>${a.unita === 'pz' ? 'al pezzo' : 'al ' + esc(unitOk(a.unita))}</small></div>${a.categoria === 'rivendita' ? `<div><small>Prezzo di vendita</small><b>${+a.prezzoVendita > 0 ? EUR(+a.prezzoVendita) : '—'}</b><small>${+a.prezzoVendita > 0 ? 'IVA inclusa, ' + perU(a.unita) : 'Da aggiungere con Modifica'}</small></div>` : ''}</div>
    <h3>Prezzi d'acquisto</h3>${priceRow(id)}
    <h3>Allergeni e nome in etichetta</h3>${algChips(al, [])}<p style="margin-top:10px" class="labeltext">${emph(esc(artLabel(a)))}</p>
    ${soloAcquisti(a) ? `<p class="hint">Lo scarico delle vendite è spento (Impostazioni): della rivendita si tengono solo gli acquisti e i prezzi, senza giacenza né avvisi.</p>
    <h3>Acquisti</h3>${lots.length ? `<div class="list">${[...lots].sort((x, y) => y.data.localeCompare(x.data)).slice(0, 12).map(l => lotRow(l)).join('')}</div>` : empty('Nessun acquisto registrato.')}`
    : `<h3>Lotti in giacenza</h3>${inUse.length ? `<div class="list">${inUse.map(l => lotRow(l)).join('')}</div>` : empty('Nessun lotto in giacenza. Carica la merce registrando un acquisto.')}
    ${done.length ? `<details style="margin-top:12px"><summary class="lnk">Lotti esauriti (${done.length})</summary><div class="list" style="margin-top:10px">${done.map(l => lotRow(l)).join('')}</div></details>` : ''}`}
    <h3>Usato nelle schede</h3>${recs.length ? `<div class="chips">${recs.map(r => `<button type="button" class="btn" data-act="open-ric" data-id="${esc(r.id)}">${esc(r.nome)}</button>`).join('')}</div>` : '<p class="muted">Non è ancora in nessuna scheda tecnica.</p>'}
    ${a.fornitoreId && fornName(a.fornitoreId) ? `<p class="muted" style="margin-top:14px">Fornitore abituale: ${esc(fornName(a.fornitoreId))}</p>` : ''}
    ${a.note ? `<h3>Note</h3><div class="prose">${esc(a.note)}</div>` : ''}
    <div class="morebar w"><button type="button" class="btn" data-act="arch-art" data-id="${esc(id)}">${a.archiviato ? 'Ripristina articolo' : 'Archivia articolo'}</button><button type="button" class="btn dan" data-act="del-art" data-id="${esc(id)}">Elimina</button></div>`;
}
function artFoot(id) {
  const a = S.data.articoli.get(id); if (!a || S.ro) return '';
  const s = artStock(id);
  return `<button type="button" class="btn" data-act="edit-art" data-id="${esc(id)}">Modifica</button>${!soloAcquisti(a) && s.usable + s.expired > EPS ? `<button type="button" class="btn pri" data-act="mov-item" data-tipo="art" data-id="${esc(id)}">Registra scarico</button>` : `<button type="button" class="btn pri" data-act="new-doc">Registra acquisto</button>`}`;
}

function priceRow(id) {
  const a = S.data.articoli.get(id), ps = priceStats(id, periodStart(UI.prezziP));
  if (!a || !ps) return '<p class="muted">Nessun prezzo registrato: inserisci gli importi nelle righe di fatture e DDT.</p>';
  return `<div class="list"><button type="button" class="row" data-act="open-prezzi" data-id="${esc(id)}">${av(IC.tag, ps.prev ? (dcls(ps.chgPrev) === 'up' ? 'red' : dcls(ps.chgPrev) === 'down' ? 'good' : '') : '')}<span class="m"><b>Ultimo ${EUR(ps.last.p)} ${perU(a.unita)}</b><span>${fmtD(ps.last.date)}${ps.prev ? ` · prima ${EUR(ps.prev.p)}` : ''} · ${ps.s.length === 1 ? '1 acquisto' : ps.s.length + ' acquisti'}</span><span class="mc">${ps.prev ? delta(ps.chgPrev, 'sul precedente') : ''}</span></span><span class="s">${spark(ps.s)}</span></button></div>`;
}

/* ---------- storico prezzi di un articolo ---------- */
function sheetPrezzi(id) {
  openSheet({live: true, title: () => `Prezzi: ${S.data.articoli.get(id)?.nome || 'articolo'}`, body: () => prezziBody(id)});
}
function supplierSeries(s) {
  const order = []; for (const x of s) if (!order.includes(x.forn)) order.push(x.forn);
  const fold = order.length > 3, keys = fold ? [order[0], order[1], '__altri'] : order;
  const of = x => fold ? (order.indexOf(x.forn) < 2 ? order.indexOf(x.forn) : 2) : order.indexOf(x.forn);
  const name = i => keys[i] === '__altri' ? 'Altri fornitori' : (fornName(keys[i]) || 'Fornitore non indicato');
  return {keys, of, name};
}
function prezziBody(id) {
  const a = S.data.articoli.get(id); if (!a) return empty('Questo articolo non esiste più.');
  const ps = priceStats(id, periodStart(UI.prezziP));
  if (!ps) return empty('Nessun prezzo registrato per questo articolo: inserisci gli importi nelle righe di fatture e DDT.');
  const u = unitOk(a.unita), s = ps.s, ser = supplierSeries(s);
  const months = (() => { const f = s[0].date, l = ps.last.date; return f === l ? fmtD(f) : `dal ${fmtD(f)} al ${fmtD(l)}`; })();
  const bySup = ser.keys.map((k, i) => { const xs = s.filter(x => ser.of(x) === i), q = xs.reduce((t, x) => t + x.q, 0), im = xs.reduce((t, x) => t + x.imp, 0); return {i, name: ser.name(i), last: xs[xs.length - 1], avg: q > 0 ? im / q : null, n: xs.length}; });
  const cheapest = bySup.length > 1 ? [...bySup].sort((x, y) => x.last.p - y.last.p)[0] : null;
  const rows = [...s].reverse().map((x, j, arr) => {
    const pv = arr[j + 1], ch = pv && pv.p > 0 ? (x.p - pv.p) / pv.p : null, d = S.data.documenti.get(x.docId);
    return `<tr><td data-l="Data">${fmtD(x.date)}</td><td data-l="Fornitore">${esc(fornName(x.forn) || '—')}${d ? `<small><button type="button" class="lnk" data-act="open-doc" data-id="${esc(d.id)}">${esc(docName(d))}</button></small>` : ''}</td><td class="n" data-l="Quantità">${fmtQ(x.q, u)}</td><td class="n" data-l="Importo">${EUR(x.imp)}</td><td class="n" data-l="Prezzo">${EUR(x.p)}</td><td class="n" data-l="Variazione">${ch == null ? '—' : `<span class="${dcls(ch)}">${Math.abs(ch) < 0.005 ? '=' : arw(ch > 0) + ' ' + pct(ch)}</span>`}</td></tr>`;
  }).join('');
  const label = `Andamento del prezzo ${perU(u)} di ${a.nome}, ${months}: da ${EUR(s[0].p)} a ${EUR(ps.last.p)}`;
  return `<div class="kv"><div><small>Ultimo prezzo ${perU(u)}</small><b>${EUR(ps.last.p)}</b><small>${fmtD(ps.last.date)}</small></div>
      <div><small>Rispetto all'acquisto prima</small><b class="${dcls(ps.chgPrev)}">${ps.prev ? (Math.abs(ps.chgPrev) < 0.005 ? 'uguale' : arw(ps.chgPrev > 0) + ' ' + pct(ps.chgPrev)) : '—'}</b><small>${ps.prev ? `prima ${EUR(ps.prev.p)}` : 'primo acquisto registrato'}</small></div>
      <div><small>Più basso – più alto</small><b>${numP(ps.min.p)}–${EUR(ps.max.p)}</b><small>${fmtDs(ps.min.date)} – ${fmtDs(ps.max.date)}</small></div>
      <div><small>Prezzo medio pagato</small><b>${EUR(ps.avg)}</b><small>su ${s.length === 1 ? '1 acquisto' : s.length + ' acquisti'}</small></div></div>
    <div class="chartcard">
      ${ser.keys.length > 1 ? `<div class="legend">${ser.keys.map((k, i) => `<span><i class="k c${i}"></i>${esc(ser.name(i))}</span>`).join('')}</div>` : `<p class="muted" style="margin:0 6px 4px;font-size:14px">${esc(ser.name(0))}</p>`}
      <div class="fig" data-chart="prezzi" data-id="${esc(id)}" tabindex="0" role="img" aria-label="${esc(label)}"></div>
      <p class="hint" style="margin:4px 6px 4px">Tocca o passa sopra il grafico per leggere ogni acquisto.</p>
    </div>
    ${cheapest ? `<h3>Per fornitore</h3><div class="list">${bySup.map(x => `<div class="row">${av(initials(x.name))}<span class="m"><b><i class="k c${x.i}" aria-hidden="true"></i> ${esc(x.name)}</b><span>Ultimo ${EUR(x.last.p)} il ${fmtD(x.last.date)} · media ${EUR(x.avg)} su ${x.n === 1 ? '1 acquisto' : x.n + ' acquisti'}</span></span>${x === cheapest ? '<span class="s"><span class="chip down">Il più conveniente</span></span>' : ''}</div>`).join('')}</div>` : ''}
    <h3>Tutti gli acquisti</h3>
    <div class="tw"><table class="tbl stack"><thead><tr><th>Data</th><th>Fornitore</th><th class="n">Quantità</th><th class="n">Importo</th><th class="n">Prezzo ${esc(perU(u))}</th><th class="n">Variazione</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="morebar"><button type="button" class="btn" data-act="open-art" data-id="${esc(id)}">Giacenze e lotti di ${esc(a.nome)}</button></div>`;
}

/* grafico dello storico prezzi: disegnato alla dimensione reale, ridisegnato al ridimensionamento */
const figs = new Set();
const figRO = typeof ResizeObserver === 'function' ? new ResizeObserver(es => { for (const e of es) drawFig(e.target); }) : null;
function drawCharts(root) {
  for (const f of figs) if (!f.isConnected) { figRO?.unobserve(f); figs.delete(f); }
  for (const fig of $$('.fig[data-chart]', root)) {
    if (figs.has(fig)) continue;
    figs.add(fig); wireFig(fig); drawFig(fig); figRO?.observe(fig);
  }
}
function niceTicks(lo, hi, n) {
  const raw = (hi - lo) / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step, out = [];
  for (let v = a; v <= b + step / 2; v += step) out.push(r6(v));
  return {ticks: out, lo: a, hi: b, step};
}
function drawFig(fig) {
  const id = fig.dataset.id, s = priceList(id), a = S.data.articoli.get(id);
  const W = fig.clientWidth, H = fig.clientHeight;
  if (!W || !H || !s.length) { fig.innerHTML = ''; fig._m = null; return; }
  const narrow = W < 520, u = unitOk(a?.unita), ser = supplierSeries(s), day = 864e5;
  const tm = x => parseIso(x.date).getTime();
  let x0 = tm(s[0]), x1 = tm(s[s.length - 1]);
  if (x1 - x0 < 20 * day) { const c = (x0 + x1) / 2; x0 = c - 12 * day; x1 = c + 12 * day; }
  const padX = (x1 - x0) * 0.04; x0 -= padX; x1 += padX;
  let lo = Math.min(...s.map(x => x.p)), hi = Math.max(...s.map(x => x.p));
  if (hi - lo < hi * 0.04) { const c = (hi + lo) / 2; lo = c * 0.97; hi = c * 1.03; }
  const yt = niceTicks(lo, hi, narrow ? 3 : 4); lo = yt.lo; hi = yt.hi;
  const dec = Math.min(3, Math.max(2, -Math.floor(Math.log10(yt.step) + 1e-9)));
  const fy = v => new Intl.NumberFormat('it-IT', {style: 'currency', currency: 'EUR', minimumFractionDigits: dec, maximumFractionDigits: dec}).format(v);
  const m = {l: narrow ? 58 : 66, r: narrow ? 58 : 70, t: 12, b: 28};
  const X = t => m.l + (t - x0) / (x1 - x0) * (W - m.l - m.r), Y = v => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
  let g = '';
  for (const v of yt.ticks) { const y = Y(v).toFixed(1); g += `<line class="gl" x1="${m.l}" x2="${W - m.r + 8}" y1="${y}" y2="${y}"/><text class="ax" x="${m.l - 8}" y="${(+y + 4.5).toFixed(1)}" text-anchor="end">${esc(fy(v))}</text>`; }
  const ticks = [], span = x1 - x0;
  if (span < 75 * day) {
    const stepD = span < 30 * day ? 7 : 14; let t = Math.ceil(x0 / day) * day;
    for (; t <= x1; t += stepD * day) ticks.push({t, l: fmtDs(new Date(t).toISOString().slice(0, 10))});
  } else {
    const d = new Date(x0); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); d.setUTCMonth(d.getUTCMonth() + 1);
    for (; d.getTime() <= x1; d.setUTCMonth(d.getUTCMonth() + 1)) { const mo = d.toLocaleDateString('it-IT', {month: 'short', timeZone: 'UTC'}).replace('.', ''); ticks.push({t: d.getTime(), l: d.getUTCMonth() === 0 ? `${mo} ${String(d.getUTCFullYear()).slice(2)}` : mo}); }
  }
  const maxT = Math.max(2, Math.floor((W - m.l - m.r) / (narrow ? 64 : 76))), every = Math.ceil(ticks.length / maxT);
  ticks.filter((_, i) => i % every === 0).forEach(k => { g += `<text class="ax" x="${X(k.t).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(k.l)}</text>`; });
  ser.keys.forEach((k, i) => { const pts = s.filter(x => ser.of(x) === i); if (pts.length > 1) g += `<path class="ln c${i}" d="M${pts.map(x => `${X(tm(x)).toFixed(1)},${Y(x.p).toFixed(1)}`).join('L')}"/>`; });
  g += `<line class="xh" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/>`;
  s.forEach((x, j) => { g += `<circle class="pt c${ser.of(x)}" data-j="${j}" cx="${X(tm(x)).toFixed(1)}" cy="${Y(x.p).toFixed(1)}" r="4.5"/>`; });
  const L = s[s.length - 1];
  g += `<text class="lbl" x="${(X(tm(L)) + 10).toFixed(1)}" y="${(Y(L.p) + 4.5).toFixed(1)}">${esc(EUR(L.p))}</text>`;
  fig.innerHTML = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${g}</svg><div class="tip" hidden></div>`;
  fig._m = {s, ser, u, W, H, X: x => X(tm(x)), Y: x => Y(x.p)};
  if (fig._j != null && fig === document.activeElement) showTip(fig, fig._j);
}
function showTip(fig, j) {
  const M = fig._m; if (!M) return;
  j = Math.max(0, Math.min(M.s.length - 1, j)); fig._j = j;
  const at = M.s[j], same = M.s.filter(x => x.date === at.date), x = M.X(at);
  const xh = $('.xh', fig); xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.setAttribute('visibility', 'visible');
  $$('circle.pt', fig).forEach(c => c.setAttribute('r', M.s[+c.dataset.j].date === at.date ? 6.5 : 4.5));
  const tip = $('.tip', fig); tip.replaceChildren();
  const d = document.createElement('div'); d.className = 'd'; d.textContent = fmtD(at.date); tip.append(d);
  for (const p of same) {
    const r = document.createElement('div'); r.className = 'r';
    const k = document.createElement('i'); k.className = 'k c' + M.ser.of(p);
    const b = document.createElement('b'); b.textContent = `${EUR(p.p)} ${perU(M.u)}`;
    const sm = document.createElement('small'); sm.textContent = `${fornName(p.forn) || 'Fornitore non indicato'} · ${fmtQ(p.q, M.u)} per ${EUR(p.imp)}`;
    r.append(k, b, sm); tip.append(r);
  }
  tip.hidden = false;
  const tw = tip.offsetWidth, th = tip.offsetHeight, py = M.Y(same[0]);
  let left, topY;
  if (x + 14 + tw <= M.W - 2) { left = x + 14; topY = py - th / 2; }
  else if (x - 14 - tw >= 2) { left = x - tw - 14; topY = py - th / 2; }
  else { left = Math.max(2, Math.min(x - tw / 2, M.W - tw - 2)); topY = py > M.H / 2 ? py - th - 16 : py + 16; }
  tip.style.left = left + 'px';
  tip.style.top = Math.max(2, Math.min(topY, M.H - th - 2)) + 'px';
}
function hideTip(fig) {
  const tip = $('.tip', fig); if (tip) tip.hidden = true;
  const xh = $('.xh', fig); if (xh) xh.setAttribute('visibility', 'hidden');
  $$('circle.pt', fig).forEach(c => c.setAttribute('r', 4.5));
}
function nearestPt(fig, clientX) {
  const M = fig._m; if (!M) return 0;
  const px = clientX - fig.getBoundingClientRect().left; let best = 0, bd = Infinity;
  M.s.forEach((p, j) => { const dd = Math.abs(M.X(p) - px); if (dd < bd) { bd = dd; best = j; } });
  return best;
}
function wireFig(fig) {
  fig.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') showTip(fig, nearestPt(fig, e.clientX)); });
  fig.addEventListener('pointerdown', e => showTip(fig, nearestPt(fig, e.clientX)));
  fig.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && document.activeElement !== fig) hideTip(fig); });
  fig.addEventListener('focus', () => { if (fig._m) showTip(fig, fig._j ?? fig._m.s.length - 1); });
  fig.addEventListener('blur', () => hideTip(fig));
  fig.addEventListener('keydown', e => {
    if (!fig._m) return; const n = fig._m.s.length; let j = fig._j ?? n - 1;
    if (e.key === 'ArrowRight') j = Math.min(n - 1, j + 1); else if (e.key === 'ArrowLeft') j = Math.max(0, j - 1); else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = n - 1; else return;
    e.preventDefault(); showTip(fig, j);
  });
}

/* ---------- dettaglio scheda tecnica ---------- */
function sheetScheda(id) {
  openSheet({live: true, title: () => S.data.ricette.get(id)?.nome || 'Scheda tecnica', body: () => schedaBody(id), foot: () => schedaFoot(id)});
}
function schedaBody(id) {
  const r = S.data.ricette.get(id); if (!r) return empty('Questa scheda non esiste più.');
  const u = unitOk(r.resaUnita), rq = +r.resaQta, c = recCostOf(r, [id]), unitCost = rq > 0 && !c.miss.length ? c.tot / rq : null;
  const info = labelInfo(r, [id]), price = +r.prezzoVendita, iva = cfg().iva;
  const fc = unitCost != null && price > 0 ? unitCost / (price / (1 + iva / 100)) * 100 : null;
  const lots = (drv().ricLots.get(id) || []).filter(l => l.res > EPS);
  const rows = (r.ingredienti || []).map(g => {
    const it = itemOf(g.tipo, g.refId), lc = lineCost(g, [id]);
    const sub = it ? (g.tipo === 'ric' ? 'semilavorato' : artLabel(it)) : '';
    return `<tr><td>${it ? `<button type="button" class="lnk" data-act="${g.tipo === 'ric' ? 'open-ric' : 'open-art'}" data-id="${esc(it.id)}">${esc(it.nome)}</button>` : 'Ingrediente eliminato'}${sub ? `<small>${g.tipo === 'ric' ? esc(sub) : emph(esc(sub))}</small>` : ''}</td><td class="n">${fmtQ(+g.qta, g.unita)}</td><td class="n">${lc != null ? EUR(lc) : '—'}</td></tr>`;
  }).join('');
  return `<div class="dh"><p class="muted">${esc(r.categoria || 'Senza categoria')}${r.semilavorato ? ' · semilavorato, usabile come ingrediente' : ''} · ${cfg().lotti.sigla ? 'sigla lotti' : 'sigla'} ${esc(r.sigla || autoSigla(r.nome))}${r.archiviato ? ' · archiviata' : ''}</p><div class="big" style="font-stretch:85%">${esc(r.nome)}</div></div>
    <div class="kv"><div><small>Resa</small><b>${fmtQ(rq, u)}</b>${u === 'pz' && +r.pesoPz > 0 ? `<small>da ${num(+r.pesoPz)} g l'uno</small>` : ''}</div><div><small>Durata</small><b>${esc(shelfTxt(r))}</b><small>${esc(scadLabel(r.tipoScadenza).toLowerCase())}</small></div><div><small>Costo ${u === 'pz' ? 'al pezzo' : 'al ' + u}</small><b>${EUR(unitCost)}</b><small>${c.miss.length ? 'manca il prezzo di: ' + esc(c.miss.join(', ')) : 'da ultimi prezzi d’acquisto'}</small></div><div><small>Food cost</small><b>${fc != null ? num(Math.round(fc * 10) / 10) + '%' : '—'}</b><small>${price > 0 ? `su ${EUR(price)} IVA inclusa` : 'prezzo di vendita non indicato'}</small></div></div>
    <h3>Allergeni</h3>${algChips(info.al, info.tr)}
    <h3>Elenco ingredienti per il cartello</h3>
    <div class="labeltext"><p style="margin:0 0 6px"><b>Ingredienti:</b> ${emph(esc(info.ing || '—'))}.</p><p style="margin:0">${info.tr.length ? `Può contenere tracce di ${esc(info.tr.map(k => ALGN[k].toLowerCase()).join(', '))}.` : ''}</p></div>
    <p style="margin-top:8px"><button type="button" class="btn" data-act="copy-ing" data-id="${esc(id)}">${IC.copy}Copia testo</button></p>
    <h3>Ricetta per ${fmtQ(rq, u)}</h3>
    <div class="tw"><table class="tbl"><thead><tr><th>Ingrediente</th><th class="n">Quantità</th><th class="n">Costo</th></tr></thead><tbody>${rows}<tr class="tot"><td>Totale</td><td class="n"></td><td class="n">${c.miss.length ? 'parziale ' : ''}${EUR(c.tot)}</td></tr></tbody></table></div>
    <h3>Conservazione</h3><p>${esc(r.conservazione || 'Non indicata')}</p>
    ${r.procedimento ? `<h3>Procedimento</h3><div class="prose">${esc(r.procedimento)}</div>` : ''}
    ${r.note ? `<h3>Note</h3><div class="prose">${esc(r.note)}</div>` : ''}
    <h3>${lots[0]?.vetrina ? 'Lotti in vetrina' : 'Lotti in giacenza'}</h3>${lots.length ? `<div class="list">${lots.map(prodRow).join('')}</div>` : empty(vendite() || r.semilavorato ? 'Nessun lotto in giacenza.' : 'Nessun lotto in vetrina.')}
    <div class="morebar"><button type="button" class="btn dl" data-act="dl-scheda" data-id="${esc(id)}">${IC.down}Scarica scheda</button><button type="button" class="btn w" data-act="dup-ric" data-id="${esc(id)}">Duplica</button><button type="button" class="btn w" data-act="arch-ric" data-id="${esc(id)}">${r.archiviato ? 'Ripristina' : 'Archivia'}</button><button type="button" class="btn dan w" data-act="del-ric" data-id="${esc(id)}">Elimina</button></div>`;
}
function schedaFoot(id) {
  const r = S.data.ricette.get(id); if (!r || S.ro) return '';
  return `<button type="button" class="btn" data-act="edit-ric" data-id="${esc(id)}">Modifica scheda</button>${r.archiviato ? '' : `<button type="button" class="btn pri" data-act="new-prod" data-ric="${esc(id)}">Produci un lotto</button>`}`;
}

/* ---------- dettaglio documento d'acquisto ---------- */
function sheetDocumento(id) {
  openSheet({live: true, title: () => { const d = S.data.documenti.get(id); return d ? docName(d) : 'Documento'; }, body: () => docBody(id), foot: () => docFoot(id)});
}
function docBody(id) {
  const d = S.data.documenti.get(id); if (!d) return empty('Questo documento non esiste più.');
  const Dd = drv();
  const righe = (d.righe || []).map(r => {
    if (d.soloPrezzi) {
      const a = S.data.articoli.get(r.articoloId), u = unitOk(a?.unita), pu = +r.qta > 0 && r.importo != null && r.importo !== '' ? +r.importo / +r.qta : null;
      return `<button type="button" class="row" data-act="open-prezzi" data-id="${esc(r.articoloId)}">${av(catIc(a?.categoria))}<span class="m"><b>${esc(a?.nome || 'Articolo eliminato')}</b><span>${fmtQ(+r.qta, u)} · ${EUR(r.importo == null || r.importo === '' ? null : +r.importo)}</span></span><span class="s"><span class="q">${EUR(pu)} <small>${perU(u)}</small></span></span></button>`;
    }
    const l = Dd.acq.get(`${id}:${r.id}`); if (!l) return '';
    const s = st(l), u = lotUnit(l);
    return `<button type="button" class="row" data-act="open-acq" data-id="${esc(l.key)}">${av(catIc(l.item?.categoria), s.c)}<span class="m"><b>${esc(lotName(l))}</b><span>${fmtQ(l.qta, u)}${r.importo != null && r.importo !== '' ? ' · ' + EUR(+r.importo) : ''} · lotto ${esc(l.lottoF || 'non indicato')} · scad. ${fmtD(l.scad)}</span><span>${l.used.length ? `Usato in ${l.used.length === 1 ? '1 produzione' : l.used.length + ' produzioni'}` : 'Non ancora usato'}</span><span class="mc"><span class="chip ${s.c}">${esc(s.t)}</span></span></span><span class="s"><span class="q">${fmtQ(l.fuori ? l.qta : l.res, u)}</span><small class="muted">${l.fuori ? 'comprati' : 'residuo'}</small></span></button>`;
  }).join('');
  const f = S.data.fornitori.get(d.fornitoreId);
  return `<div class="kv"><div><small>Documento</small><b>${esc(TIPI[d.tipo] || 'Documento')}${d.numero ? ' ' + esc(d.numero) : ''}</b></div><div><small>Data</small><b>${fmtD(d.data)}</b></div><div><small>Fornitore</small><b style="font-stretch:90%;font-size:18px">${f ? esc(f.nome) : '—'}</b></div><div><small>Totale senza IVA</small><b>${EUR(docTot(d))}</b></div></div>
    ${d.tipo === 'ddt' && d.fatturaRif ? `<p class="muted">Fattura collegata: ${esc(d.fatturaRif)}</p>` : ''}
    ${d.soloPrezzi ? '<p class="note">Documento registrato solo per lo storico dei prezzi: non ha caricato merce in magazzino.</p>' : ''}
    ${(d.allegati || []).length ? `<h3>Allegati</h3>${allegatiHTML(d)}` : ''}
    <h3>${d.soloPrezzi ? 'Righe e prezzi' : 'Righe e lotti caricati'}</h3><div class="list">${righe || empty('Nessuna riga.')}</div>
    ${d.note ? `<h3>Note</h3><div class="prose">${esc(d.note)}</div>` : ''}
    <div class="morebar w"><button type="button" class="btn dan" data-act="del-doc" data-id="${esc(id)}">Elimina documento</button></div>`;
}
function docFoot(id) {
  if (!S.data.documenti.get(id) || S.ro) return '';
  return `<button type="button" class="btn pri" data-act="edit-doc" data-id="${esc(id)}">Modifica documento</button>`;
}
