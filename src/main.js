/* ---------- file scaricabili ---------- */
async function saveFile(filename, data) {
  filename = filename.replace(/[\\/:*?"<>|]+/g, '-');
  if (S.mode === 'local') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data])); a.download = filename;
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return;
  }
  if (!S.downloads) { toast('Il download non è disponibile in questa vista.', true); return; }
  try { await S.downloads.save({filename, data}); }
  catch (e) {
    const c = e?.code;
    if (c === 'declined') return;
    if (c === 'host_unavailable') toast('Questa app non può salvare file: apri la pagina dal browser o dal computer.', true);
    else if (c === 'rate_limited') toast('Attendi un attimo e riprova.', true);
    else toast('Download non riuscito.', true);
  }
}
const bizLine = () => { const c = cfg(); return [c.nome, c.indirizzo, c.piva ? 'P.IVA ' + c.piva : ''].filter(Boolean).map(esc).join(' · '); };
function printable(title, body) {
  return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>body{font:15px/1.5 Arial,Helvetica,sans-serif;color:#111;max-width:800px;margin:28px auto;padding:0 20px}h1{font-size:26px;margin:0 0 4px}h2{font-size:17px;margin:24px 0 8px;border-bottom:1.5px solid #333;padding-bottom:4px}table{width:100%;border-collapse:collapse;margin:4px 0}th,td{border-bottom:1px solid #bbb;padding:6px 6px;text-align:left;vertical-align:top}th{font-size:13px;color:#444}.n{text-align:right;white-space:nowrap}.muted{color:#555}.box{border:1.5px solid #111;padding:10px 14px;margin:8px 0}table.kv th{width:34%}.nw{white-space:nowrap}.sub td:first-child{padding-left:22px}section{page-break-inside:avoid;margin-bottom:22px}@media print{body{margin:0}}</style></head><body>${bizLine() ? `<p class="muted" style="margin:0 0 14px">${bizLine()}</p>` : ''}${body}<p class="muted" style="margin-top:30px">Barista Flow · documento generato il ${fmtD(today())}</p></body></html>`;
}
function schedaDoc(r) {
  const u = unitOk(r.resaUnita), info = labelInfo(r, [r.id]), c = recCostOf(r, [r.id]);
  const rows = (r.ingredienti || []).map(g => { const it = itemOf(g.tipo, g.refId); return `<tr><td>${esc(it?.nome || 'Ingrediente eliminato')}${g.tipo === 'ric' ? ' (semilavorato)' : ''}</td><td class="n">${fmtQ(+g.qta, g.unita)}</td></tr>`; }).join('');
  return printable(`Scheda tecnica ${r.nome}`, `<h1>Scheda tecnica: ${esc(r.nome)}</h1><p class="muted">${esc(r.categoria || '')}${r.semilavorato ? ' · semilavorato' : ''} · sigla lotti ${esc(r.sigla || autoSigla(r.nome))}</p>
    <table class="kv"><tr><th>Resa</th><td>${fmtQ(+r.resaQta, u)}${u === 'pz' && +r.pesoPz > 0 ? ` da ${num(+r.pesoPz)} g` : ''}</td></tr><tr><th>Durata</th><td>${esc(shelfTxt(r))} · ${esc(scadLabel(r.tipoScadenza).toLowerCase())}</td></tr><tr><th>Conservazione</th><td>${esc(r.conservazione || 'Non indicata')}</td></tr><tr><th>Costo ingredienti</th><td>${EUR(c.tot)}${+r.resaQta > 0 && !c.miss.length ? ` · ${EUR(c.tot / +r.resaQta)} ${u === 'pz' ? 'al pezzo' : 'al ' + u}` : ''}</td></tr></table>
    <h2>Ingredienti</h2><table><tr><th>Ingrediente</th><th class="n">Quantità</th></tr>${rows}</table>
    <h2>Allergeni</h2><p>${info.al.length ? esc(info.al.map(k => ALGN[k]).join(', ')) : 'Nessuno dei 14 allergeni principali'}${info.tr.length ? `<br>Può contenere tracce di: ${esc(info.tr.map(k => ALGN[k].toLowerCase()).join(', '))}` : ''}</p>
    <h2>Elenco ingredienti per il cartello</h2><div class="box">${emph(esc(labelPlain(r, [r.id]))).replace(/\n/g, '<br>')}</div>
    ${r.procedimento ? `<h2>Procedimento</h2><p style="white-space:pre-wrap">${esc(r.procedimento)}</p>` : ''}${r.note ? `<h2>Note</h2><p style="white-space:pre-wrap">${esc(r.note)}</p>` : ''}`);
}
function lottoDoc(id) {
  const l = drv().prod.get(id); if (!l) return '';
  const p = l.p, u = lotUnit(l), al = algSort(p.allergeni || []), tr = algSort((p.tracce || []).filter(x => !al.includes(x)));
  const rows = (cs, depth, path) => cs.map(c => {
    const it = itemOf(c.tipo, c.refId), q = fmtQ(+c.qta, it ? baseOf(c.tipo, it) : ''), cls = depth ? ' class="sub"' : '', pre = depth ? '— '.repeat(depth) : '';
    if (!c.lotId) return `<tr${cls}><td>${pre}${esc(it?.nome || c.nome)}</td><td class="n">${q}</td><td colspan="4">senza lotto registrato</td></tr>`;
    if (c.tipo === 'ric') { const lp = drv().prod.get(c.lotId); if (!lp) return `<tr${cls}><td>${pre}${esc(it?.nome || c.nome)}</td><td class="n">${q}</td><td colspan="4">lotto eliminato</td></tr>`; return `<tr${cls}><td>${pre}${esc(it?.nome || c.nome)}</td><td class="n">${q}</td><td class="nw">${esc(lp.p.lotto)}</td><td>${fmtD(lp.scad)}</td><td>produzione interna</td><td>prodotto il ${fmtD(lp.data)}</td></tr>${path.includes(c.lotId) ? '' : rows(lp.p.consumi || [], depth + 1, [...path, c.lotId])}`; }
    const la = drv().acq.get(c.lotId);
    if (!la) return `<tr${cls}><td>${pre}${esc(it?.nome || c.nome)}</td><td class="n">${q}</td><td colspan="4">documento eliminato</td></tr>`;
    return `<tr${cls}><td>${pre}${esc(it?.nome || c.nome)}</td><td class="n">${q}</td><td class="nw">${esc(la.lottoF || '—')}</td><td>${fmtD(la.scad)}</td><td>${esc(fornName(la.doc.fornitoreId) || '—')}</td><td>${esc(docName(la.doc))}</td></tr>`;
  }).join('');
  return printable(`Lotto ${p.lotto}`, `<h1>Lotto ${esc(p.lotto)}</h1><p class="muted">${esc(lotName(l))}</p>
    <table class="kv"><tr><th>Prodotto il</th><td>${fmtD(p.data)}</td></tr><tr><th>${esc(scadLabel(p.tipoScadenza))}</th><td>${fmtD(l.scad)}</td></tr><tr><th>Quantità prodotta</th><td>${fmtQ(l.qta, u)}</td></tr><tr><th>Residuo</th><td>${fmtQ(l.res, u)}</td></tr>${p.operatore ? `<tr><th>Operatore</th><td>${esc(p.operatore)}</td></tr>` : ''}</table>
    <h2>Allergeni</h2><p>${al.length ? esc(al.map(k => ALGN[k]).join(', ')) : 'Nessuno dei 14 allergeni principali'}${tr.length ? `<br>Può contenere tracce di: ${esc(tr.map(k => ALGN[k].toLowerCase()).join(', '))}` : ''}</p>
    <h2>Materie prime e lotti utilizzati</h2><table><tr><th>Ingrediente</th><th class="n">Quantità</th><th>Lotto</th><th>Scadenza</th><th>Fornitore</th><th>Documento</th></tr>${rows(p.consumi || [], 0, [id])}</table>
    ${p.note ? `<h2>Note</h2><p style="white-space:pre-wrap">${esc(p.note)}</p>` : ''}`);
}
function libroDoc() {
  const rs = [...S.data.ricette.values()].filter(r => !r.archiviato && !r.semilavorato).sort(byName);
  return printable('Libro ingredienti', `<h1>Libro degli ingredienti e degli allergeni</h1><p class="muted">Prodotti di nostra produzione in vendita. Per qualsiasi informazione sugli allergeni chiedi al personale.</p>
    ${rs.map(r => `<section><h2>${esc(r.nome)}</h2><p>${emph(esc(labelPlain(r, [r.id]))).replace(/\n/g, '<br>')}</p></section>`).join('') || '<p>Nessun prodotto.</p>'}`);
}
const csvCell = v => { let s = String(v ?? '').replace(/ /g, ' '); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function csvGiacenze() {
  const Dd = drv(), rows = [['Tipo', 'Nome', 'Lotto', 'Origine', 'Fornitore', 'Scadenza', 'Residuo', 'Unità', 'Stato']];
  for (const l of [...Dd.acq.values()].filter(l => l.res > EPS).sort((a, b) => lotName(a).localeCompare(lotName(b), 'it') || byScad(a, b))) rows.push([CAT[l.item?.categoria] || CAT.materia, lotName(l), l.lottoF, docName(l.doc), fornName(l.doc.fornitoreId), l.scad ? fmtD(l.scad) : '', String(l.res).replace('.', ','), lotUnit(l), st(l).t]);
  for (const l of [...Dd.prod.values()].filter(l => l.res > EPS).sort((a, b) => lotName(a).localeCompare(lotName(b), 'it') || byScad(a, b))) rows.push(['Produzione', lotName(l), l.p.lotto, `Prodotto il ${fmtD(l.data)}`, '', fmtD(l.scad), String(l.res).replace('.', ','), lotUnit(l), st(l).t]);
  return '\ufeff' + rows.map(r => r.map(csvCell).join(';')).join('\r\n');
}
function csvPrezzi() {
  const rows = [['Articolo', 'Data', 'Fornitore', 'Documento', 'Quantità', 'Unità', 'Importo senza IVA', 'Prezzo unitario']];
  for (const [id, s] of drv().prices) {
    const a = S.data.articoli.get(id); if (!a) continue;
    for (const x of s) rows.push([a.nome, fmtD(x.date), fornName(x.forn), docName(S.data.documenti.get(x.docId)), String(r6(x.q)).replace('.', ','), unitOk(a.unita), String(r6(x.imp)).replace('.', ','), String(Math.round(x.p * 10000) / 10000).replace('.', ',')]);
  }
  rows.splice(1, rows.length - 1, ...rows.slice(1).sort((a, b) => a[0].localeCompare(b[0], 'it') || a[1].split('/').reverse().join('').localeCompare(b[1].split('/').reverse().join(''))));
  return '\ufeff' + rows.map(r => r.map(csvCell).join(';')).join('\r\n');
}
function backupJSON() {
  const out = {app: 'barista-flow', versione: 1, esportato: new Date().toISOString(), dati: {}};
  for (const c of COLS) out.dati[c] = [...S.data[c].values()].map(v => clone(v));
  return JSON.stringify(out, null, 1);
}
async function importBackup(file) {
  let obj;
  try { obj = JSON.parse(await file.text()); } catch { toast('Il file non è un backup valido.', true); return; }
  if (!obj || !['barista-flow', 'gestionale-bar'].includes(obj.app) || typeof obj.dati !== 'object' || !obj.dati) { toast('Il file non è un backup di Barista Flow.', true); return; }
  const ops = [];
  for (const c of COLS) for (const v of (Array.isArray(obj.dati[c]) ? obj.dati[c] : [])) {
    if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !/^[A-Za-z0-9_\-~:@+]{1,120}$/.test(v.id)) continue;
    ops.push([c, v.id, strip(v)]);
  }
  if (!ops.length) { toast('Il backup non contiene dati.', true); return; }
  const demo = sampleOps();
  if (!(await ask(demo.length ? `Stai usando i dati di esempio: li cancello e importo ${ops.length} elementi dal backup. Continuo?` : `Importo ${ops.length} elementi dal backup. Quelli con lo stesso codice verranno sostituiti, gli altri restano. Continuo?`, demo.length ? 'Cancella esempi e importa' : 'Importa', !!demo.length))) return;
  if (demo.length) {
    const keep = new Set(ops.map(([c, id]) => c + '/' + id)), del0 = demo.filter(([c, id]) => !keep.has(c + '/' + id));
    if (del0.length && (await runOps('Cancello i dati di prova', del0)) < del0.length) { toast('Non sono riuscito a cancellare tutti i dati di esempio: riprova.', true); return; }
  }
  const ok = await runOps('Importo il backup', ops);
  toast(ok === ops.length ? `Importati ${ok} elementi.` : `Importati ${ok} elementi su ${ops.length}: riprova per i mancanti.`, ok < ops.length);
}

/* ---------- azioni ---------- */
const guard = () => { if (S.ro) { toast('Hai accesso solo in lettura.', true); return false; } return true; };
const sheetOf = el => { const w = el.closest('.sheet-wrap'); return w ? stack.find(x => x.el === w) : null; };
const ACT = {
  close: () => requestClose(),
  ask: b => top()?.resolve?.(b.dataset.v === '1'),
  save: async () => {
    const o = top(); if (!o?.onSave || o.saving) return;
    o.saving = true; $$('.sh-foot .btn', o.el).forEach(x => { x.disabled = true; });
    try { await o.onSave(o); } finally { o.saving = false; if (stack.includes(o)) $$('.sh-foot .btn', o.el).forEach(x => { x.disabled = false; }); }
  },
  seg: b => { UI[b.dataset.k] = b.dataset.v; renderMain(); },
  'todo-all': () => { UI.todoAll = true; renderMain(); },
  jump: b => { if (b.dataset.all && !UI.todoAll) { UI.todoAll = true; renderMain(); } const el = document.getElementById(b.dataset.to); if (el) el.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'}); },
  fseg: b => { const o = sheetOf(b); if (!o) return; setPath(o.st, b.dataset.k, b.dataset.v); o.dirty = true; $$(`[data-act=fseg][data-k="${b.dataset.k}"]`, o.el).forEach(x => x.setAttribute('aria-pressed', x === b)); o.onField?.(b.dataset.k, o, 'change', b); },
  altog: b => { const o = sheetOf(b); if (!o) return; const arr = o.st[b.dataset.k], v = b.dataset.v, i = arr.indexOf(v); if (i < 0) arr.push(v); else arr.splice(i, 1); o.dirty = true; b.setAttribute('aria-pressed', i < 0); o.onField?.(b.dataset.k, o, 'change', b); },
  'toggle-arch': () => { UI.schArch = !UI.schArch; renderMain(); },
  'new-prod': b => { if (guard()) formProduzione(b.dataset.ric); },
  'new-doc': () => { if (guard()) formDocumento(); },
  'new-ric': () => { if (guard()) formRicetta(); },
  'new-art': () => { if (guard()) formArticolo(); },
  'new-forn': () => { if (guard()) formFornitore(); },
  'open-lotto': b => sheetLotto(b.dataset.id),
  'open-acq': b => sheetLottoAcq(b.dataset.id),
  'open-ric': b => sheetScheda(b.dataset.id),
  'open-art': b => sheetArticolo(b.dataset.id),
  'open-doc': b => sheetDocumento(b.dataset.id),
  'open-forn': b => formFornitore(b.dataset.id),
  'open-prezzi': b => sheetPrezzi(b.dataset.id),
  nav: b => { if (route() !== b.dataset.to) location.hash = b.dataset.to; },
  quick: () => sheetQuick(),
  qgo: b => { const a = b.dataset.go; closeSheet(); if (a === 'scarico') sheetScarico(); else ACT[a]?.(b); },
  'scarico-go': b => { const t = {item: true, tipo: b.dataset.tipo, id: b.dataset.id}; closeSheet(); formMov(t); },
  search: () => sheetSearch(),
  car: b => scrollLabels(+b.dataset.dir),
  riordina: b => { if (!guard()) return; const a = S.data.articoli.get(b.dataset.id); if (a) formDocumento(null, {fornitoreId: a.fornitoreId, articoloId: a.id}); },
  step: b => { const o = sheetOf(b); if (!o) return; const v = pnum(o.st.qta), nv = Math.max(1, Math.round((isNaN(v) ? 0 : v) + +b.dataset.d)); o.st.qta = String(nv); const i = $('[data-k=qta]', o.el); if (i) i.value = o.st.qta; o.dirty = true; o.onField?.('qta', o, 'input', i); },
  'dl-prezzi': () => saveFile(`Storico prezzi ${today()}.csv`, csvPrezzi()),
  'add-riga': b => { const o = sheetOf(b); o.st.righe.push({id: uid(), articoloId: '', qta: '', unita: '', importo: '', lotto: '', scadenza: ''}); o.dirty = true; paintSheet(o); const s = $$('.card', o.el).pop(); s?.scrollIntoView({block: 'nearest'}); $('select', s)?.focus({preventScroll: true}); },
  'del-riga': b => { const o = sheetOf(b); o.st.righe.splice(+b.dataset.i, 1); o.dirty = true; paintSheet(o); },
  'add-ing': b => { const o = sheetOf(b); o.st.ingredienti.push({ref: '', qta: '', unita: 'g'}); o.dirty = true; paintSheet(o); const s = $$('.card', o.el).pop(); s?.scrollIntoView({block: 'nearest'}); $('select', s)?.focus({preventScroll: true}); },
  'del-ing': b => { const o = sheetOf(b); o.st.ingredienti.splice(+b.dataset.i, 1); o.dirty = true; paintSheet(o); },
  'del-att': b => { const o = sheetOf(b); o.st.allegati.splice(+b.dataset.i, 1); o.dirty = true; paintSheet(o); },
  'mov-all': b => { const o = sheetOf(b); o.st.qta = fmtIn(o.totRes); const i = $('[data-k=qta]', o.el); if (i) i.value = o.st.qta; o.dirty = true; },
  mov: b => { if (guard()) formMov({kind: b.dataset.kind, id: b.dataset.id}); },
  'mov-item': b => { if (guard()) formMov({item: true, tipo: b.dataset.tipo, id: b.dataset.id}); },
  esaurito: b => {
    if (!guard()) return;
    const l = drv().prod.get(b.dataset.id); if (!l || l.res <= EPS) return;
    movWithUndo({data: today(), tipo: 'vendita', lotKind: 'prod', lotId: l.key, delta: -l.res, nota: 'Lotto esaurito', creato: Date.now()}, `Lotto ${l.p.lotto} esaurito: ${nb(fmtQ(l.res, lotUnit(l)))} venduti`);
  },
  smaltisci: b => {
    if (!guard()) return;
    const l = drv()[b.dataset.kind === 'prod' ? 'prod' : 'acq'].get(b.dataset.id); if (!l || l.res <= EPS) return;
    movWithUndo({data: today(), tipo: 'scarto', lotKind: l.kind, lotId: l.key, delta: -l.res, nota: 'Smaltito perché scaduto', creato: Date.now()}, `Smaltiti ${nb(fmtQ(l.res, lotUnit(l)))} di ${lotName(l)}`);
  },
  'del-mov': async b => {
    if (!guard()) return;
    if (!(await ask('Elimino questo movimento? La giacenza torna com’era prima.', 'Elimina movimento', true))) return;
    if (await del('movimenti', b.dataset.id)) toast('Movimento eliminato');
  },
  'edit-prod': b => { if (guard()) formEditProd(b.dataset.id); },
  'del-prod': async b => {
    if (!guard()) return;
    const l = drv().prod.get(b.dataset.id); if (!l) return;
    if (l.used.length) { toast(`Questo lotto è ingrediente di ${l.used.length === 1 ? 'un altro lotto' : l.used.length + ' lotti'}: elimina prima quelli.`, true); return; }
    if (!(await ask(`Elimino il lotto ${l.p.lotto}? Gli ingredienti usati tornano disponibili in magazzino.`, 'Elimina lotto', true))) return;
    for (const m of l.mov) await del('movimenti', m.id, true);
    if (await del('produzioni', l.key)) { if (top()?.live) closeSheet(); toast(`Lotto ${l.p.lotto} eliminato`); }
  },
  'edit-ric': b => { if (guard()) formRicetta(b.dataset.id); },
  'dup-ric': b => { if (guard()) formRicetta(null, b.dataset.id); },
  'arch-ric': async b => {
    if (!guard()) return;
    const r = S.data.ricette.get(b.dataset.id); if (!r) return;
    if (await put('ricette', r.id, {...strip(r), archiviato: !r.archiviato})) toast(r.archiviato ? 'Scheda ripristinata' : 'Scheda archiviata: non compare più tra i prodotti da produrre');
  },
  'del-ric': async b => {
    if (!guard()) return;
    const r = S.data.ricette.get(b.dataset.id); if (!r) return;
    const prods = (drv().ricLots.get(r.id) || []).length, users = [...S.data.ricette.values()].filter(x => x.id !== r.id && (x.ingredienti || []).some(g => g.tipo === 'ric' && g.refId === r.id));
    if (prods || users.length) { toast(prods ? 'Ci sono lotti prodotti con questa scheda: puoi archiviarla, non eliminarla.' : `È ingrediente di ${users.map(x => x.nome).join(', ')}: puoi archiviarla.`, true); return; }
    if (!(await ask(`Elimino la scheda «${r.nome}»?`, 'Elimina scheda', true))) return;
    if (await del('ricette', r.id)) { if (top()?.live) closeSheet(); toast('Scheda eliminata'); }
  },
  'edit-art': b => { if (guard()) formArticolo(b.dataset.id); },
  'arch-art': async b => {
    if (!guard()) return;
    const a = S.data.articoli.get(b.dataset.id); if (!a) return;
    if (await put('articoli', a.id, {...strip(a), archiviato: !a.archiviato})) toast(a.archiviato ? 'Articolo ripristinato' : 'Articolo archiviato');
  },
  'del-art': async b => {
    if (!guard()) return;
    const a = S.data.articoli.get(b.dataset.id); if (!a) return;
    const inDocs = (drv().artLots.get(a.id) || []).length, inRec = [...S.data.ricette.values()].some(r => (r.ingredienti || []).some(g => g.tipo !== 'ric' && g.refId === a.id));
    if (inDocs || inRec) { toast('L’articolo compare in acquisti o schede: puoi archiviarlo, non eliminarlo.', true); return; }
    if (!(await ask(`Elimino l'articolo «${a.nome}»?`, 'Elimina articolo', true))) return;
    if (await del('articoli', a.id)) { if (top()?.live) closeSheet(); toast('Articolo eliminato'); }
  },
  'edit-doc': b => { if (guard()) formDocumento(b.dataset.id); },
  'del-doc': async b => {
    if (!guard()) return;
    const d = S.data.documenti.get(b.dataset.id); if (!d) return;
    const busy = (d.righe || []).some(r => { const l = drv().acq.get(`${d.id}:${r.id}`); return l && (l.used.length || l.mov.length); });
    if (busy) { toast('Alcuni lotti di questo documento sono già stati usati o scaricati: non si può eliminare.', true); return; }
    if (!(await ask(`Elimino ${docName(d)}? Le sue righe escono dal magazzino.`, 'Elimina documento', true))) return;
    if (await del('documenti', d.id)) {
      if (S.assets) for (const a of (d.allegati || [])) { try { await S.assets.delete(a.id); } catch { /* resta orfano */ } }
      if (top()?.live) closeSheet(); toast('Documento eliminato');
    }
  },
  'del-forn': async b => {
    if (!guard()) return;
    const f = S.data.fornitori.get(b.dataset.id); if (!f) return;
    if (!(await ask(`Elimino il fornitore «${f.nome}»?`, 'Elimina fornitore', true))) return;
    if (await del('fornitori', f.id)) { const o = top(); if (o) { o.dirty = false; closeSheet(); } toast('Fornitore eliminato'); }
  },
  'copy-ing': async b => {
    const r = S.data.ricette.get(b.dataset.id); if (!r) return;
    try { await navigator.clipboard.writeText(labelPlain(r, [r.id])); toast('Testo copiato: incollalo nel cartello ingredienti'); }
    catch { toast('Copia non riuscita: seleziona il testo e copialo a mano.', true); }
  },
  'dl-scheda': b => { const r = S.data.ricette.get(b.dataset.id); if (r) saveFile(`Scheda tecnica - ${r.nome}.html`, schedaDoc(r)); },
  'dl-lotto': b => { const p = S.data.produzioni.get(b.dataset.id); if (p) saveFile(`Lotto ${p.lotto}.html`, lottoDoc(p.id)); },
  'dl-libro': () => saveFile(`Libro ingredienti ${today()}.html`, libroDoc()),
  'dl-csv': () => saveFile(`Giacenze ${today()}.csv`, csvGiacenze()),
  'dl-backup': () => saveFile(`Backup Barista Flow ${today()}.json`, backupJSON()),
  'del-sample': () => { if (guard()) clearSample(); },
  'fe-import': () => sheetFatture(),
  'fe-open': b => { const e = FE.list[+b.dataset.i]; if (e?.f) sheetFattura(e); },
  'fe-all': () => feAll(),
  'load-sample': () => loadSample(),
  'reset-sample': () => { if (guard()) resetSample(); },
  register: () => { if (!guard()) return; while (stack.length) closeSheet(); if (registered()) clearSample(); else formRegistra(); },
  prova: () => sheetProva(),
  'inv-start': () => { if (guard()) formDocumento(null, {tipo: 'inventario'}); },
  'primi-hide': () => { lsSet('bf-primi-passi', 'no'); renderMain(); toast('Primi passi nascosti'); }
};

const nb = t => String(t).replace(/\u00a0/g, ' ');
async function movWithUndo(m, msg) {
  const id = uid();
  if (await put('movimenti', id, m)) toast(msg, false, {label: 'Annulla', fn: async () => { if (await del('movimenti', id)) toast('Operazione annullata'); }});
}

/* ---------- eventi ---------- */
function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const f = ACT[b.dataset.act]; if (!f) return;
  e.preventDefault();
  f(b, e);
}
function onFieldEvent(e, kind) {
  const t = e.target;
  if (t.dataset && t.dataset.q !== undefined) { if (kind === 'input') { UI.q[t.dataset.q] = t.value; renderMain(); } return; }
  if (t.dataset && (t.dataset.gq || t.dataset.sq)) {
    if (kind !== 'input') return;
    const o = sheetOf(t); if (!o) return;
    o.q = t.value; const sel = [t.selectionStart, t.selectionEnd], id = t.id;
    clearTimeout(o.qt);
    o.qt = setTimeout(() => { if (!stack.includes(o)) return; paintSheet(o); const i = document.getElementById(id); if (i) { i.focus({preventScroll: true}); try { i.setSelectionRange(sel[0], sel[1]); } catch { /* nessuna selezione */ } } }, 120);
    return;
  }
  if (t.type === 'file') { if (kind === 'change') onFile(t); return; }
  const k = t.dataset?.k; if (!k) return;
  const o = sheetOf(t); if (!o || !o.st) return;
  const isText = t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'date'].includes(t.type));
  if ((kind === 'input') !== isText) return;
  setPath(o.st, k, t.type === 'checkbox' ? t.checked : t.value);
  o.dirty = true;
  o.onField?.(k, o, kind, t);
}
function onFile(t) {
  const files = [...(t.files || [])]; t.value = '';
  if (!files.length) return;
  if (t.dataset.file === 'import') { if (guard()) importBackup(files[0]); }
  else if (t.dataset.file === 'att') { const o = sheetOf(t); if (o) uploadAtt(o, files); }
  else if (t.dataset.file === 'fe') { const o = sheetOf(t); if (o) feAddFiles(o, files); }
}
async function saveCfg(f) {
  if (!guard()) return;
  const fd = new FormData(f), prev = S.data.impostazioni.get('generale'), c = cfg();
  const txt = (k, max, cur) => fd.has(k) ? String(fd.get(k) || '').trim().slice(0, max) : cur;
  const nome = txt('nome', 80, c.nome), indirizzo = txt('indirizzo', 140, c.indirizzo), piva = txt('piva', 20, c.piva);
  const g = Math.round(pnum(fd.get('giorniAvviso'))), iva = pnum(fd.get('iva')), sr = pnum(fd.get('sogliaRincaro'));
  if (!(g >= 0 && g <= 60)) { toast('Avviso scadenze: scrivi un numero di giorni da 0 a 60.', true); return; }
  if (!(iva >= 0 && iva <= 50)) { toast('Percentuale IVA non valida.', true); return; }
  if (!(sr >= 0 && sr <= 100)) { toast('Soglia dei rincari: scrivi una percentuale da 0 a 100.', true); return; }
  const reg = prev?.registrato || (nome && !countSample() ? Date.now() : null);
  if (await put('impostazioni', 'generale', {...(prev ? strip(prev) : {}), nome, indirizzo, piva, giorniAvviso: g, iva, sogliaRincaro: sr, ...(reg ? {registrato: reg} : {})})) toast('Impostazioni salvate');
}
function wire() {
  document.addEventListener('click', onClick);
  document.addEventListener('input', e => onFieldEvent(e, 'input'));
  document.addEventListener('change', e => onFieldEvent(e, 'change'));
  document.addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'cfgForm') saveCfg(e.target); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && stack.length) { e.preventDefault(); requestClose(); return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if (((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) && !stack.length) { e.preventDefault(); sheetSearch(); return; }
    if (document.activeElement?.id === 'labels' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); scrollLabels(e.key === 'ArrowRight' ? 1 : -1); }
  });
  window.addEventListener('hashchange', () => { while (stack.length) closeSheet(); paint(); window.scrollTo(0, 0); });
  const tb = $('#topbar'); let ticking = false;
  window.addEventListener('scroll', () => { if (ticking) return; ticking = true; requestAnimationFrame(() => { tb.classList.toggle('scrolled', window.scrollY > 36); ticking = false; }); }, {passive: true});
}

/* ---------- avvio ---------- */
function subscribe() {
  const timer = setTimeout(() => { if (S.fresh.size < COLS.length) { S.slow = true; bump(); } }, 10000);
  for (const c of COLS) {
    S.db.collection(c).onSnapshot(snap => {
      const m = new Map();
      for (const d of snap.docs) { const v = d.data(); if (v && typeof v === 'object') m.set(d.id, {...v, id: d.id}); }
      S.data[c] = m; S.got.add(c);
      if (!snap.metadata?.fromCache) S.fresh.add(c);
      if (S.fresh.size === COLS.length) { clearTimeout(timer); S.slow = false; }
      bump();
    }, err => {
      S.got.add(c); S.fresh.add(c);
      if (err?.code === 'revoked') { S.ro = true; document.body.classList.add('ro'); }
      if (!S.errShown) { S.errShown = true; toast('Una parte dei dati non è raggiungibile in questo momento. Ricarica la pagina più tardi.', true); }
      bump();
    });
  }
}
async function init() {
  wire(); paint();
  const w = window.claude;
  if (!w || typeof w.use !== 'function') { S.db = localDB('barista-flow-v1'); S.mode = 'local'; document.body.classList.remove('nodl'); }
  else {
    const get = n => Promise.resolve().then(() => w.use(n)).catch(() => null);
    const [db, user] = await Promise.all([get('db'), get('user')]);
    S.user = user;
    if (db) { S.db = db; S.mode = 'cloud'; } else { S.db = localDB(null); S.mode = 'temp'; }
    if (user && db) { try { if ((await user.can('data.write')) === false) S.ro = true; } catch { /* nessuna informazione */ } }
    get('downloads').then(d => { S.downloads = d; document.body.classList.toggle('nodl', !d); bump(); });
    get('assets').then(a => { S.assets = a; bump(); });
  }
  document.body.classList.toggle('ro', S.ro);
  setupPWA();
  subscribe();
  paint();
}
init();
