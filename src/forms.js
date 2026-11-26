/* ---------- moduli ---------- */
const opt = (v, t, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`;
const fseg = (k, cur, opts) => `<div class="seg" role="group">${opts.map(([v, t]) => `<button type="button" data-act="fseg" data-k="${k}" data-v="${esc(v)}" aria-pressed="${cur === v}">${esc(t)}</button>`).join('')}</div>`;
const algToggles = (k, arr) => `<div class="algrid">${ALG.map(([v, t]) => `<button type="button" class="altog" data-act="altog" data-k="${k}" data-v="${v}" aria-pressed="${arr.includes(v)}">${esc(t)}</button>`).join('')}</div>`;
const fornOpts = cur => [...S.data.fornitori.values()].sort(byName).map(f => opt(f.id, f.nome, cur)).join('');
/* nei documenti d'acquisto i fornitori usati di recente stanno in cima */
function fornOptsRecenti(cur) {
  const all = [...S.data.fornitori.values()].sort(byName), last = new Map();
  for (const d of S.data.documenti.values()) if (d.fornitoreId && validIso(d.data) && d.tipo !== 'inventario' && (last.get(d.fornitoreId) || '') < d.data) last.set(d.fornitoreId, d.data);
  const rec = all.filter(f => last.has(f.id)).sort((a, b) => last.get(b.id).localeCompare(last.get(a.id))).slice(0, 4);
  if (all.length <= 5 || rec.length < 2) return all.map(f => opt(f.id, f.nome, cur)).join('');
  return `<optgroup label="Usati di recente">${rec.map(f => opt(f.id, f.nome, cur)).join('')}</optgroup><optgroup label="Tutti i fornitori">${all.map(f => opt(f.id, f.nome, cur)).join('')}</optgroup>`;
}
/* gli articoli che compri di solito da un fornitore, dai più frequenti */
function artAbituali(fornId) {
  const n = new Map();
  for (const d of S.data.documenti.values()) if (fornId && d.fornitoreId === fornId) for (const r of d.righe || []) n.set(r.articoloId, (n.get(r.articoloId) || 0) + 1);
  return [...n.entries()].map(([id, k]) => ({a: S.data.articoli.get(id), k})).filter(x => x.a && !x.a.archiviato).sort((x, y) => y.k - x.k || byName(x.a, y.a)).slice(0, 8).map(x => x.a);
}
/* una data con le scelte rapide Oggi e Ieri */
function dateFld(k, label, v) {
  const t = today(), y = addDays(t, -1);
  return `<div class="fld-d"><label class="fld"><span>${esc(label)}</span><input type="date" data-k="${k}" value="${esc(v)}"></label><span class="dchips">${[[t, 'Oggi'], [y, 'Ieri']].map(([d, n]) => `<button type="button" class="dchip" data-act="dset" data-k="${k}" data-v="${d}" aria-pressed="${v === d}" aria-label="${esc(label)}: ${n.toLowerCase()}">${n}</button>`).join('')}</span></div>`;
}
const strip = o => { const c = clone(o) || {}; delete c.id; return c; };
const splitRef = ref => { const i = String(ref || '').indexOf(':'); return i < 0 ? ['art', ''] : [ref.slice(0, i), ref.slice(i + 1)]; };
const foot = (label) => `<button type="button" class="btn" data-act="close">Annulla</button><button type="button" class="btn pri" data-act="save">${esc(label)}</button>`;
/* ridisegna il modulo tenendo il punto in cui eri */
function repaintKeep(o, el) { const k = el?.dataset?.k; paintSheet(o); if (k) $(`[data-k="${k}"]`, o.el)?.focus({preventScroll: true}); }
function setPath(o, path, v) { const ks = path.split('.'); let x = o; for (let i = 0; i < ks.length - 1; i++) { x = x[ks[i]]; if (x == null) return; } x[ks[ks.length - 1]] = v; }
function artOptions(cur) {
  const arts = [...S.data.articoli.values()].filter(a => !a.archiviato || a.id === cur).sort(byName);
  return Object.keys(CAT).map(c => { const xs = arts.filter(a => (a.categoria || 'materia') === c); return xs.length ? `<optgroup label="${CAT[c]}">${xs.map(a => opt(a.id, a.nome, cur)).join('')}</optgroup>` : ''; }).join('');
}

/* articolo */
function formArticolo(id, onSaved, pre) {
  const ex = id ? S.data.articoli.get(id) : null;
  const st = ex
    ? {nome: ex.nome || '', categoria: CAT[ex.categoria] ? ex.categoria : 'materia', unita: unitOk(ex.unita) || 'kg', pesoPz: +ex.pesoPz > 0 ? fmtIn(+ex.pesoPz) : '', etichetta: ex.etichetta || '', allergeni: algSort(ex.allergeni || []), conservazione: CONS[ex.conservazione] ? ex.conservazione : 'ambiente', scortaMin: +ex.scortaMin > 0 ? fmtIn(+ex.scortaMin) : '', fornitoreId: ex.fornitoreId || '', prezzoVendita: +ex.prezzoVendita > 0 ? fmtIn(+ex.prezzoVendita) : '', note: ex.note || ''}
    : {nome: pre?.nome || '', categoria: CAT[pre?.categoria] ? pre.categoria : 'materia', unita: unitOk(pre?.unita) || 'kg', pesoPz: '', etichetta: '', allergeni: [], conservazione: 'ambiente', scortaMin: '', fornitoreId: pre?.fornitoreId && S.data.fornitori.has(pre.fornitoreId) ? pre.fornitoreId : '', prezzoVendita: '', note: ''};
  const locked = !!ex && ((drv().artLots.get(id) || []).length > 0 || [...S.data.ricette.values()].some(r => (r.ingredienti || []).some(g => g.tipo !== 'ric' && g.refId === id)));
  openSheet({form: true, st, title: ex ? 'Modifica articolo' : 'Nuovo articolo',
    body: () => `<label class="fld"><span>Nome</span><input type="text" data-k="nome" value="${esc(st.nome)}" placeholder="Es. Farina 00" autocomplete="off"></label>
      <div class="fld"><span>Tipo di articolo</span>${fseg('categoria', st.categoria, [['materia', 'Materia prima'], ['rivendita', 'Rivendita'], ['imballaggio', 'Imballaggio']])}</div>
      <div class="g2"><label class="fld"><span>Unità di giacenza</span><select data-k="unita" ${locked ? 'disabled' : ''}>${opt('kg', 'Chili (kg)', st.unita)}${opt('l', 'Litri (l)', st.unita)}${opt('pz', 'Pezzi (pz)', st.unita)}</select>${locked ? '<small class="hint">Bloccata: l’articolo ha già lotti o è in una scheda.</small>' : ''}</label>
      <label class="fld" id="f-pz" ${st.unita === 'pz' ? '' : 'hidden'}><span>Peso di un pezzo (g)</span><input type="text" inputmode="decimal" data-k="pesoPz" value="${esc(st.pesoPz)}" placeholder="Es. 55"><small class="hint">Permette di usarlo in grammi nelle ricette.</small></label></div>
      <label class="fld" id="f-pv" ${st.categoria === 'rivendita' ? '' : 'hidden'}><span>Prezzo di vendita € IVA inclusa, <span id="f-pv-u">${perU(st.unita)}</span></span><input type="text" inputmode="decimal" data-k="prezzoVendita" value="${esc(st.prezzoVendita)}" placeholder="Facoltativo" autocomplete="off"><small class="hint">Compare sul tasto del Banco e fa il totale dello scontrino.</small></label>
      <label class="fld"><span>Nome nell'elenco ingredienti</span><input type="text" data-k="etichetta" value="${esc(st.etichetta)}" placeholder="Es. farina di GRANO tenero tipo 00" autocomplete="off"><small class="hint">Scrivi in MAIUSCOLO la parola dell'allergene. Se lo lasci vuoto viene usato il nome, con l'allergene tra parentesi.</small></label>
      <div class="fld"><span>Allergeni contenuti</span>${algToggles('allergeni', st.allergeni)}</div>
      <div class="g2"><label class="fld"><span>Conservazione</span><select data-k="conservazione">${opt('ambiente', 'Ambiente', st.conservazione)}${opt('frigo', 'Frigorifero', st.conservazione)}${opt('freezer', 'Congelatore', st.conservazione)}</select></label>
      <label class="fld"><span>Scorta minima</span><input type="text" inputmode="decimal" data-k="scortaMin" value="${esc(st.scortaMin)}" placeholder="Nessuna"></label></div>
      <label class="fld"><span>Fornitore abituale</span><select data-k="fornitoreId"><option value="">Nessuno</option>${fornOpts(st.fornitoreId)}</select></label>
      <label class="fld"><span>Note</span><textarea data-k="note" rows="3">${esc(st.note)}</textarea></label>
      <p class="err" id="ferr" role="alert"></p>`,
    foot: () => foot(ex ? 'Salva modifiche' : 'Crea articolo'),
    onField: (k, o) => {
      if (k === 'unita') { $('#f-pz', o.el).hidden = st.unita !== 'pz'; $('#f-pv-u', o.el).textContent = perU(st.unita); }
      if (k === 'categoria') $('#f-pv', o.el).hidden = st.categoria !== 'rivendita';
    },
    onSave: async o => {
      const nome = st.nome.trim();
      if (!nome) return ferr(o, "Scrivi il nome dell'articolo.");
      if ([...S.data.articoli.values()].some(a => a.id !== id && String(a.nome || '').trim().toLowerCase() === nome.toLowerCase())) return ferr(o, 'Esiste già un articolo con questo nome.');
      let pesoPz = null;
      if (st.unita === 'pz' && String(st.pesoPz).trim()) { pesoPz = pnum(st.pesoPz); if (!(pesoPz > 0)) return ferr(o, 'Peso del pezzo non valido.'); }
      let sm = 0;
      if (String(st.scortaMin).trim()) { sm = pnum(st.scortaMin); if (!(sm >= 0)) return ferr(o, 'Scorta minima non valida.'); }
      // il prezzo di vendita serve solo a quello che si rivende al banco
      let pv = null;
      if (st.categoria === 'rivendita' && String(st.prezzoVendita).trim()) { pv = pnum(st.prezzoVendita); if (!(pv >= 0)) return ferr(o, 'Prezzo di vendita non valido.'); pv = pv > 0 ? r6(pv) : null; }
      const doc = {...(ex ? strip(ex) : {}), nome, categoria: st.categoria, unita: locked ? ex.unita : st.unita, pesoPz, etichetta: st.etichetta.trim(), allergeni: algSort(st.allergeni), conservazione: st.conservazione, scortaMin: sm, fornitoreId: st.fornitoreId, prezzoVendita: pv, note: st.note.trim(), archiviato: !!ex?.archiviato, creato: ex?.creato || Date.now()};
      const nid = id || uid();
      if (await put('articoli', nid, doc)) { o.dirty = false; closeSheet(); toast(ex ? 'Articolo aggiornato' : `Articolo «${nome}» creato`); onSaved?.(nid); }
    }});
}

/* fornitore */
function formFornitore(id, onSaved) {
  const ex = id ? S.data.fornitori.get(id) : null;
  const st = {nome: ex?.nome || '', piva: ex?.piva || '', telefono: ex?.telefono || '', email: ex?.email || '', note: ex?.note || ''};
  const docs = ex ? [...S.data.documenti.values()].filter(d => d.fornitoreId === id).sort((a, b) => String(b.data).localeCompare(String(a.data))) : [];
  openSheet({form: true, st, title: ex ? ex.nome || 'Fornitore' : 'Nuovo fornitore',
    body: () => `<label class="fld"><span>Ragione sociale</span><input type="text" data-k="nome" value="${esc(st.nome)}" placeholder="Es. Molino del Borgo" autocomplete="off" ${S.ro ? 'disabled' : ''}></label>
      <div class="g2"><label class="fld"><span>Partita IVA</span><input type="text" data-k="piva" value="${esc(st.piva)}" inputmode="numeric" autocomplete="off" ${S.ro ? 'disabled' : ''}></label>
      <label class="fld"><span>Telefono</span><input type="text" data-k="telefono" value="${esc(st.telefono)}" inputmode="tel" autocomplete="off" ${S.ro ? 'disabled' : ''}></label></div>
      <label class="fld"><span>Email</span><input type="text" data-k="email" value="${esc(st.email)}" inputmode="email" autocomplete="off" ${S.ro ? 'disabled' : ''}></label>
      <label class="fld"><span>Note</span><textarea data-k="note" rows="3" placeholder="Es. consegna martedì e venerdì" ${S.ro ? 'disabled' : ''}>${esc(st.note)}</textarea></label>
      ${docs.length ? `<h3>Documenti di questo fornitore</h3><div class="list">${docs.map(d => `<button type="button" class="row" data-act="open-doc" data-id="${esc(d.id)}">${av(DOCAB[d.tipo] || 'DOC')}<span class="m"><b>${esc(docName(d))}</b><span>${(d.righe || []).length} righe</span></span><span class="s"><span class="q">${EUR(docTot(d))}</span></span></button>`).join('')}</div>` : ''}
      ${ex && !docs.length ? `<div class="morebar w"><button type="button" class="btn dan" data-act="del-forn" data-id="${esc(id)}">Elimina fornitore</button></div>` : ''}
      <p class="err" id="ferr" role="alert"></p>`,
    foot: () => S.ro ? '' : foot(ex ? 'Salva modifiche' : 'Crea fornitore'),
    onSave: async o => {
      const nome = st.nome.trim();
      if (!nome) return ferr(o, 'Scrivi il nome del fornitore.');
      if ([...S.data.fornitori.values()].some(f => f.id !== id && String(f.nome || '').trim().toLowerCase() === nome.toLowerCase())) return ferr(o, 'Esiste già un fornitore con questo nome.');
      const doc = {...(ex ? strip(ex) : {}), nome, piva: st.piva.trim(), telefono: st.telefono.trim(), email: st.email.trim(), note: st.note.trim(), creato: ex?.creato || Date.now()};
      const nid = id || uid();
      if (await put('fornitori', nid, doc)) { o.dirty = false; closeSheet(); toast(ex ? 'Fornitore aggiornato' : `Fornitore «${nome}» creato`); onSaved?.(nid); }
    }});
}

/* documento d'acquisto: ogni riga è un lotto */
function formDocumento(id, pre) {
  const ex = id ? S.data.documenti.get(id) : null;
  const newRiga = () => ({id: uid(), articoloId: '', qta: '', unita: '', importo: '', lotto: '', scadenza: ''});
  const st = ex
    ? {tipo: TIPI[ex.tipo] ? ex.tipo : 'fattura', numero: ex.numero || '', data: ex.data || today(), fornitoreId: ex.fornitoreId || '', fatturaRif: ex.fatturaRif || '', soloPrezzi: !!ex.soloPrezzi, note: ex.note || '', allegati: clone(ex.allegati || []), righe: (ex.righe || []).map(r => ({id: r.id, articoloId: r.articoloId, qta: fmtIn(+r.qta), unita: unitOk(S.data.articoli.get(r.articoloId)?.unita) || 'kg', importo: r.importo == null || r.importo === '' ? '' : fmtIn(+r.importo), lotto: r.lotto || '', scadenza: r.scadenza || ''}))}
    : {tipo: TIPI[pre?.tipo] ? pre.tipo : 'fattura', tipoTouched: !!pre?.tipo, numero: '', data: today(), fornitoreId: pre?.fornitoreId && S.data.fornitori.has(pre.fornitoreId) ? pre.fornitoreId : '', fatturaRif: '', soloPrezzi: false, note: '', allegati: [], righe: pre?.articoloId ? [{...newRiga(), articoloId: pre.articoloId, unita: unitOk(S.data.articoli.get(pre.articoloId)?.unita) || 'kg'}] : [newRiga()]};
  if (!st.righe.length) st.righe.push(newRiga());
  const priceOnly = () => st.soloPrezzi && st.tipo !== 'inventario';
  const usedLot = rid => { if (!ex) return null; const l = drv().acq.get(`${id}:${rid}`); return l && (l.used.length || l.mov.length) ? l : null; };
  const rigaHTML = (r, i) => {
    const a = S.data.articoli.get(r.articoloId), units = a ? buyUnits(a.unita) : ['kg'], used = usedLot(r.id), abit = artAbituali(st.fornitoreId);
    return `<div class="card"><div class="card-h"><b>Riga ${i + 1}</b>${used ? '<span class="chip">Già usata o scaricata</span>' : st.righe.length > 1 ? `<button type="button" class="btn" data-act="del-riga" data-i="${i}">Togli riga</button>` : ''}</div>
      <label class="fld"><span>Articolo</span><select data-k="righe.${i}.articoloId" ${used ? 'disabled' : ''}><option value="">Scegli l'articolo…</option>${abit.length ? `<optgroup label="Di solito da ${esc(fornName(st.fornitoreId))}">${abit.map(a => opt(a.id, a.nome, r.articoloId)).join('')}</optgroup>` : ''}${artOptions(r.articoloId)}<option value="__new">+ Nuovo articolo…</option></select></label>
      <div class="g3"><label class="fld"><span>Quantità</span><input type="text" inputmode="decimal" data-k="righe.${i}.qta" value="${esc(r.qta)}" placeholder="0" autocomplete="off"></label>
      <label class="fld"><span>Unità</span><select data-k="righe.${i}.unita">${units.map(u => opt(u, u, units.includes(r.unita) ? r.unita : units[0])).join('')}</select></label>
      <label class="fld"><span>Importo € senza IVA</span><input type="text" inputmode="decimal" data-k="righe.${i}.importo" value="${esc(r.importo)}" placeholder="0,00" autocomplete="off"></label></div>
      <div class="g2" ${priceOnly() ? 'hidden' : ''}><label class="fld"><span>Lotto del fornitore</span><input type="text" data-k="righe.${i}.lotto" value="${esc(r.lotto)}" placeholder="Come sulla confezione" autocomplete="off"></label>
      <label class="fld"><span>Scadenza</span><input type="date" data-k="righe.${i}.scadenza" value="${esc(r.scadenza)}"></label></div></div>`;
  };
  const attHTML = o => `<div class="att">${st.allegati.map((a, i) => `<span class="chip">${esc(a.nome || 'Allegato')}<button type="button" class="attx" data-act="del-att" data-i="${i}" aria-label="Togli ${esc(a.nome || 'allegato')}">×</button></span>`).join('')}</div>
    ${S.assets ? `<label class="btn">${IC.plus}Allega foto o PDF<input type="file" accept="image/*,application/pdf" data-file="att" multiple></label>${o?.uploading ? ' <span class="hint">Caricamento in corso…</span>' : ''}` : '<small class="hint">Gli allegati si possono aggiungere aprendo la pagina su claude.ai come proprietario o editor.</small>'}`;
  openSheet({form: true, st, title: ex ? 'Modifica documento' : 'Registra acquisto',
    body: () => { const o = stack.find(x => x.st === st); return `<div class="fld"><span>Tipo di documento</span>${fseg('tipo', st.tipo, [['fattura', 'Fattura'], ['ddt', 'DDT'], ['scontrino', 'Scontrino'], ['inventario', 'Inventario iniziale']])}</div>
      ${st.tipo === 'inventario' ? '<p class="note">«Inventario iniziale» serve a caricare la merce che hai già in magazzino quando cominci a usare Barista Flow.</p>' : ''}
      <div class="g2"><label class="fld"><span>Numero</span><input type="text" data-k="numero" value="${esc(st.numero)}" placeholder="${st.tipo === 'inventario' ? 'Facoltativo' : 'Es. 1187'}" autocomplete="off"></label>
      ${dateFld('data', 'Data', st.data)}</div>
      <label class="fld"><span>Fornitore${st.tipo === 'inventario' ? ' (facoltativo)' : ''}</span><select data-k="fornitoreId"><option value="">Scegli il fornitore…</option>${fornOptsRecenti(st.fornitoreId)}<option value="__new">+ Nuovo fornitore…</option></select></label>
      ${st.tipoAuto ? `<p class="hint" style="margin:-6px 0 14px">${esc(TIPI[st.tipo] || 'Documento')}, come l’ultimo documento di ${esc(fornName(st.fornitoreId))}.</p>` : ''}
      ${st.tipo === 'ddt' ? `<label class="fld"><span>Fattura collegata (facoltativa)</span><input type="text" data-k="fatturaRif" value="${esc(st.fatturaRif)}" placeholder="Es. n. 1203 del 30/11, quando arriva" autocomplete="off"></label>` : ''}
      ${st.tipo !== 'inventario' ? `<label class="chk"><input type="checkbox" data-k="soloPrezzi" ${st.soloPrezzi ? 'checked' : ''}>Solo storico prezzi: non carica merce in magazzino</label><p class="hint" style="margin:-4px 0 14px">Per inserire fatture vecchie e vedere subito l’andamento dei prezzi, senza toccare le giacenze.</p>` : ''}
      <div class="fld"><span>Foto o PDF del documento</span>${attHTML(o)}</div>
      <h3>Righe del documento</h3><p class="hint" style="margin:-4px 0 10px">${priceOnly() ? 'Per lo storico bastano articolo, quantità e importo della riga.' : 'Ogni riga diventa un lotto in magazzino: indica il lotto e la scadenza scritti sulla confezione. L’importo serve allo storico dei prezzi.'}</p>
      ${st.righe.map(rigaHTML).join('')}
      <p><button type="button" class="btn" data-act="add-riga">${IC.plus}Aggiungi riga</button></p>
      <label class="fld"><span>Note</span><textarea data-k="note" rows="3">${esc(st.note)}</textarea></label>
      <p class="err" id="ferr" role="alert"></p>`; },
    foot: () => foot(ex ? 'Salva modifiche' : 'Registra documento'),
    onField: (k, o, kind, el) => {
      const m = k.match(/^righe\.(\d+)\.articoloId$/);
      if (m) {
        const r = st.righe[+m[1]];
        if (r.articoloId === '__new') { r.articoloId = ''; el.value = ''; formArticolo(null, nid => { r.articoloId = nid; r.unita = unitOk(S.data.articoli.get(nid)?.unita) || 'kg'; paintSheet(o); }); return; }
        r.unita = unitOk(S.data.articoli.get(r.articoloId)?.unita) || 'kg'; paintSheet(o); return;
      }
      if (k === 'fornitoreId' && st.fornitoreId === '__new') { st.fornitoreId = ''; el.value = ''; formFornitore(null, nid => { st.fornitoreId = nid; paintSheet(o); }); return; }
      if (k === 'fornitoreId') {
        // un fornitore nuovo per questo documento: il tipo segue l'ultima volta (chi manda sempre il DDT, chi la fattura)
        const last = !ex && !st.tipoTouched ? [...S.data.documenti.values()].filter(d => d.fornitoreId === st.fornitoreId && ['fattura', 'ddt', 'scontrino'].includes(d.tipo)).sort((a, b) => String(b.data).localeCompare(String(a.data)) || (b.creato || 0) - (a.creato || 0))[0] : null;
        if (last) st.tipo = last.tipo; else if (st.tipoAuto) st.tipo = 'fattura';
        st.tipoAuto = !!last && last.tipo !== 'fattura';
        repaintKeep(o, el); return;
      }
      if (k === 'tipo') { st.tipoTouched = true; st.tipoAuto = false; }
      if (k === 'tipo' || k === 'soloPrezzi') paintSheet(o);
    },
    onSave: async o => {
      if (o.uploading) return ferr(o, 'Attendi la fine del caricamento degli allegati.');
      if (priceOnly() && ex && (ex.righe || []).some(r => usedLot(r.id))) return ferr(o, 'Alcuni lotti di questo documento sono già stati usati: non può diventare solo storico prezzi.');
      if (!validIso(st.data)) return ferr(o, 'Indica la data del documento.');
      if (st.tipo !== 'inventario' && !S.data.fornitori.has(st.fornitoreId)) return ferr(o, 'Scegli il fornitore: serve per risalire alla provenienza dei lotti.');
      const righe = [];
      for (const [i, r] of st.righe.entries()) {
        if (!r.articoloId && !String(r.qta).trim() && !String(r.importo).trim() && !String(r.lotto).trim()) continue;
        const a = S.data.articoli.get(r.articoloId);
        if (!a) return ferr(o, `Riga ${i + 1}: scegli l'articolo.`);
        const q = r6(conv(pnum(r.qta), unitOk(r.unita) || a.unita, a.unita, +a.pesoPz || 0));
        if (!(q > 0)) return ferr(o, `Riga ${i + 1} (${a.nome}): quantità non valida.`);
        let imp = null;
        if (String(r.importo).trim()) { imp = pnum(r.importo); if (!(imp >= 0)) return ferr(o, `Riga ${i + 1} (${a.nome}): importo non valido.`); imp = Math.round(imp * 100) / 100; }
        if (priceOnly() && imp == null) return ferr(o, `Riga ${i + 1} (${a.nome}): per lo storico prezzi serve l'importo.`);
        if (!priceOnly() && r.scadenza && !validIso(r.scadenza)) return ferr(o, `Riga ${i + 1} (${a.nome}): scadenza non valida.`);
        const l = ex ? drv().acq.get(`${id}:${r.id}`) : null;
        if (l) { const min = r6(l.usedQ - l.movQ); if (q < min - EPS) return ferr(o, `Riga ${i + 1} (${a.nome}): sono già stati usati o scaricati ${fmtQ(min, a.unita).replace(/ /g, ' ')}, la quantità non può essere minore.`); }
        righe.push({id: r.id, articoloId: a.id, qta: q, importo: imp, lotto: priceOnly() ? '' : String(r.lotto).trim(), scadenza: priceOnly() ? '' : (r.scadenza || '')});
      }
      if (!righe.length) return ferr(o, 'Aggiungi almeno una riga con articolo e quantità.');
      if (ex) for (const orr of (ex.righe || [])) if (!righe.some(x => x.id === orr.id) && usedLot(orr.id)) return ferr(o, 'Una riga già usata in produzione non può essere tolta.');
      const doc = {...(ex ? strip(ex) : {}), tipo: st.tipo, numero: st.numero.trim(), data: st.data, fornitoreId: st.fornitoreId || '', fatturaRif: st.tipo === 'ddt' ? st.fatturaRif.trim() : '', soloPrezzi: priceOnly(), note: st.note.trim(), allegati: st.allegati, righe, creato: ex?.creato || Date.now()};
      const nid = id || uid();
      if (await put('documenti', nid, doc)) { o.dirty = false; closeSheet(); toast(ex ? 'Documento aggiornato' : priceOnly() ? `Documento registrato nello storico prezzi: ${righe.length === 1 ? '1 riga' : righe.length + ' righe'}` : `Documento registrato: ${righe.length === 1 ? '1 lotto' : righe.length + ' lotti'} in magazzino`); }
    }});
}
async function uploadAtt(o, files) {
  if (!S.assets) return;
  o.uploading = true; paintSheet(o);
  for (const f of files) {
    const n = String(f.name || '');
    const type = /^image\/(png|jpeg|gif|webp)$/.test(f.type) ? f.type : (f.type === 'application/pdf' || /\.pdf$/i.test(n)) ? 'application/pdf' : /\.jpe?g$/i.test(n) ? 'image/jpeg' : /\.png$/i.test(n) ? 'image/png' : null;
    if (!type) { toast(`${n}: formato non supportato. Usa una foto JPG o PNG oppure un PDF.`, true); continue; }
    try { const r = await S.assets.upload(f, {type}); o.st.allegati.push({id: r.id, nome: n.slice(0, 120) || 'Allegato', tipo: type}); o.dirty = true; }
    catch (e) { toast(e?.code === 'too_large' ? `${n}: file troppo grande (massimo 20 MB).` : `${n}: caricamento non riuscito.`, true); }
  }
  o.uploading = false;
  if (stack.includes(o)) paintSheet(o);
}

/* scheda tecnica */
function formRicetta(id, fromId) {
  const ex = id ? S.data.ricette.get(id) : null, src = ex || (fromId ? S.data.ricette.get(fromId) : null);
  const newIng = () => ({ref: '', qta: '', unita: 'g'});
  const st = src
    ? {nome: ex ? src.nome || '' : `${src.nome} (copia)`, sigla: ex ? src.sigla || '' : '', categoria: src.categoria || '', semilavorato: !!src.semilavorato, resaQta: fmtIn(+src.resaQta), resaUnita: unitOk(src.resaUnita) || 'pz', pesoPz: +src.pesoPz > 0 ? fmtIn(+src.pesoPz) : '', shelfLife: String(Math.round(+src.shelfLife || 0)), tipoScadenza: src.tipoScadenza === 'entro' ? 'entro' : 'preferibilmente', conservazione: src.conservazione || '', procedimento: src.procedimento || '', tracce: algSort(src.tracce || []), prezzoVendita: +src.prezzoVendita > 0 ? fmtIn(+src.prezzoVendita) : '', note: src.note || '', ingredienti: (src.ingredienti || []).map(g => ({ref: `${g.tipo === 'ric' ? 'ric' : 'art'}:${g.refId}`, qta: fmtIn(+g.qta), unita: unitOk(g.unita) || 'g'}))}
    : {nome: '', sigla: '', categoria: '', semilavorato: false, resaQta: '', resaUnita: 'pz', pesoPz: '', shelfLife: '', tipoScadenza: 'preferibilmente', conservazione: '', procedimento: '', tracce: [], prezzoVendita: '', note: '', ingredienti: [newIng(), newIng(), newIng()]};
  if (!st.ingredienti.length) st.ingredienti.push(newIng());
  const lockedUnit = !!ex && (drv().ricLots.get(id) || []).length > 0;
  const cats = [...new Set([...S.data.ricette.values()].map(r => r.categoria).filter(Boolean))];
  const ingOptions = cur => {
    const arts = [...S.data.articoli.values()].filter(a => !a.archiviato || `art:${a.id}` === cur).sort(byName);
    const semi = [...S.data.ricette.values()].filter(r => r.semilavorato && r.id !== id && !(id && usesRec(r.id, id)) && (!r.archiviato || `ric:${r.id}` === cur)).sort(byName);
    return `<option value="">Scegli…</option>${Object.keys(CAT).map(c => { const xs = arts.filter(a => (a.categoria || 'materia') === c); return xs.length ? `<optgroup label="${CAT[c]}">${xs.map(a => opt('art:' + a.id, a.nome, cur)).join('')}</optgroup>` : ''; }).join('')}${semi.length ? `<optgroup label="Semilavorati">${semi.map(r => opt('ric:' + r.id, r.nome, cur)).join('')}</optgroup>` : ''}<option value="__new">+ Nuovo articolo…</option>`;
  };
  const ingHTML = (g, i) => {
    const [tipo, refId] = splitRef(g.ref), it = refId ? itemOf(tipo, refId) : null;
    const units = it ? unitOpts(baseOf(tipo, it), +it.pesoPz || 0) : ['g', 'kg', 'ml', 'l', 'pz'];
    return `<div class="card"><div class="g3"><label class="fld"><span>Ingrediente ${i + 1}</span><select data-k="ingredienti.${i}.ref">${ingOptions(g.ref)}</select></label>
      <label class="fld"><span>Quantità</span><input type="text" inputmode="decimal" data-k="ingredienti.${i}.qta" value="${esc(g.qta)}" placeholder="0" autocomplete="off"></label>
      <label class="fld"><span>Unità</span><select data-k="ingredienti.${i}.unita">${units.map(u => opt(u, u, units.includes(g.unita) ? g.unita : units[0])).join('')}</select></label></div>
      ${st.ingredienti.length > 1 ? `<button type="button" class="lnk" data-act="del-ing" data-i="${i}">Togli ingrediente</button>` : ''}</div>`;
  };
  const draft = () => ({ingredienti: st.ingredienti.map(g => { const [tipo, refId] = splitRef(g.ref); return {tipo, refId, qta: pnum(g.qta), unita: g.unita}; }).filter(g => g.refId && g.qta > 0), tracce: st.tracce});
  const perU = () => st.resaUnita === 'pz' ? 'al pezzo' : 'al ' + st.resaUnita;
  const preview = () => {
    const r = draft(), path = id ? [id] : [], x = labelInfo(r, path), c = recCostOf(r, path), rq = pnum(st.resaQta);
    return `<h3>Anteprima automatica</h3><p><b>Allergeni:</b> ${x.al.length ? esc(x.al.map(k => ALGN[k]).join(', ')) : 'nessuno'}${x.tr.length ? ` · può contenere tracce di ${esc(x.tr.map(k => ALGN[k].toLowerCase()).join(', '))}` : ''}</p>
      <p><b>Ingredienti:</b> ${x.ing ? emph(esc(x.ing)) : '—'}</p>
      <p style="margin:0"><b>Costo stimato:</b> ${r.ingredienti.length ? EUR(c.tot) : '—'}${rq > 0 && r.ingredienti.length && !c.miss.length ? ` · ${EUR(c.tot / rq)} ${perU()}` : ''}${c.miss.length ? ` <span class="muted">(senza prezzo d'acquisto: ${esc(c.miss.join(', '))})</span>` : ''}</p>`;
  };
  openSheet({form: true, st, title: ex ? 'Modifica scheda tecnica' : 'Nuova scheda tecnica',
    body: () => `<label class="fld"><span>Nome del prodotto</span><input type="text" data-k="nome" value="${esc(st.nome)}" placeholder="Es. Biscotti al burro" autocomplete="off"></label>
      <div class="g3"><label class="fld"><span>Categoria</span><input type="text" data-k="categoria" value="${esc(st.categoria)}" list="catlist" placeholder="Es. Dolci" autocomplete="off"></label>
      <label class="fld"><span>${cfg().lotti.sigla ? 'Sigla dei lotti' : 'Sigla'}</span><input type="text" data-k="sigla" value="${esc(st.sigla)}" placeholder="${esc(autoSigla(st.nome))}" maxlength="6" autocomplete="off"></label>
      <label class="chk" style="align-self:end;margin-bottom:14px"><input type="checkbox" data-k="semilavorato" ${st.semilavorato ? 'checked' : ''}>Semilavorato</label></div>
      <datalist id="catlist">${cats.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>
      <p class="hint" style="margin:-6px 0 14px">Semilavorato: una preparazione (crema, frolla, impasto) che puoi usare come ingrediente in altre schede, con il suo lotto.</p>
      <div class="g3"><label class="fld"><span>Resa della ricetta</span><input type="text" inputmode="decimal" data-k="resaQta" value="${esc(st.resaQta)}" placeholder="Es. 60" autocomplete="off"></label>
      <label class="fld"><span>Unità della resa</span><select data-k="resaUnita" ${lockedUnit ? 'disabled' : ''}>${opt('pz', 'pezzi', st.resaUnita)}${opt('kg', 'kg', st.resaUnita)}${opt('l', 'litri', st.resaUnita)}</select>${lockedUnit ? '<small class="hint">Bloccata: ci sono già lotti prodotti.</small>' : ''}</label>
      <label class="fld" id="f-ppz" ${st.resaUnita === 'pz' ? '' : 'hidden'}><span>Peso di un pezzo (g)</span><input type="text" inputmode="decimal" data-k="pesoPz" value="${esc(st.pesoPz)}" placeholder="Facoltativo" autocomplete="off"></label></div>
      <h3>Ingredienti per questa resa</h3>
      ${st.ingredienti.map(ingHTML).join('')}
      <p><button type="button" class="btn" data-act="add-ing">${IC.plus}Aggiungi ingrediente</button></p>
      <h3>Durata e conservazione</h3>
      <div class="g2"><label class="fld"><span>Durata in giorni</span><input type="text" inputmode="numeric" data-k="shelfLife" value="${esc(st.shelfLife)}" placeholder="Es. 15" autocomplete="off"><small class="hint">0 se va consumato in giornata.</small></label>
      <label class="fld"><span>Tipo di scadenza</span><select data-k="tipoScadenza">${opt('preferibilmente', 'Da consumarsi preferibilmente entro', st.tipoScadenza)}${opt('entro', 'Da consumarsi entro', st.tipoScadenza)}</select></label></div>
      <label class="fld"><span>Come si conserva</span><input type="text" data-k="conservazione" value="${esc(st.conservazione)}" placeholder="Es. In frigorifero a 0–4 °C" autocomplete="off"></label>
      <label class="fld"><span>Procedimento</span><textarea data-k="procedimento" rows="6">${esc(st.procedimento)}</textarea></label>
      <div class="fld"><span>Può contenere tracce di</span>${algToggles('tracce', st.tracce)}<small class="hint">Solo le contaminazioni possibili in laboratorio: gli allergeni degli ingredienti sono calcolati in automatico.</small></div>
      <div class="g2"><label class="fld"><span>Prezzo di vendita € IVA inclusa, ${perU()}</span><input type="text" inputmode="decimal" data-k="prezzoVendita" value="${esc(st.prezzoVendita)}" placeholder="Facoltativo" autocomplete="off"></label></div>
      <label class="fld"><span>Note</span><textarea data-k="note" rows="3">${esc(st.note)}</textarea></label>
      <div class="preview" id="ricprev">${preview()}</div>
      <p class="err" id="ferr" role="alert"></p>`,
    foot: () => foot(ex ? 'Salva scheda' : 'Crea scheda'),
    onField: (k, o, kind, el) => {
      const m = k.match(/^ingredienti\.(\d+)\.ref$/);
      if (m) {
        const g = st.ingredienti[+m[1]];
        if (g.ref === '__new') { g.ref = ''; el.value = ''; formArticolo(null, nid => { const a = S.data.articoli.get(nid); g.ref = 'art:' + nid; g.unita = unitOpts(unitOk(a?.unita) || 'kg', +a?.pesoPz || 0)[0]; paintSheet(o); }); return; }
        const [tipo, refId] = splitRef(g.ref), it = itemOf(tipo, refId);
        g.unita = it ? unitOpts(baseOf(tipo, it), +it.pesoPz || 0)[0] : 'g';
        paintSheet(o); return;
      }
      if (k === 'resaUnita') { paintSheet(o); return; }
      clearTimeout(o.pt);
      o.pt = setTimeout(() => { const p = $('#ricprev', o.el); if (p) p.innerHTML = preview(); }, 220);
    },
    onSave: async o => {
      const nome = st.nome.trim();
      if (!nome) return ferr(o, 'Scrivi il nome del prodotto.');
      const rq = pnum(st.resaQta);
      if (!(rq > 0)) return ferr(o, 'Indica la resa: quanti pezzi, chili o litri ottieni con questa ricetta.');
      let pesoPz = null;
      if (st.resaUnita === 'pz' && String(st.pesoPz).trim()) { pesoPz = pnum(st.pesoPz); if (!(pesoPz > 0)) return ferr(o, 'Peso del pezzo non valido.'); }
      const ingredienti = [];
      for (const [i, g] of st.ingredienti.entries()) {
        if (!g.ref && !String(g.qta).trim()) continue;
        const [tipo, refId] = splitRef(g.ref), it = itemOf(tipo, refId);
        if (!it) return ferr(o, `Ingrediente ${i + 1}: sceglilo dall'elenco.`);
        const q = pnum(g.qta);
        if (!(q > 0)) return ferr(o, `${it.nome}: quantità non valida.`);
        if (isNaN(conv(q, g.unita, baseOf(tipo, it), +it.pesoPz || 0))) return ferr(o, `${it.nome}: unità non compatibile.`);
        if (tipo === 'ric' && id && usesRec(refId, id)) return ferr(o, `${it.nome} contiene già questa scheda e non può esserne un ingrediente.`);
        ingredienti.push({tipo, refId, qta: r6(q), unita: g.unita});
      }
      if (!ingredienti.length) return ferr(o, 'Aggiungi almeno un ingrediente con la sua quantità.');
      const sl = String(st.shelfLife).trim() === '' ? NaN : Math.round(pnum(st.shelfLife));
      if (!(sl >= 0)) return ferr(o, 'Indica la durata in giorni (0 se va consumato in giornata).');
      let prezzo = null;
      if (String(st.prezzoVendita).trim()) { prezzo = pnum(st.prezzoVendita); if (!(prezzo >= 0)) return ferr(o, 'Prezzo di vendita non valido.'); }
      if (ex && ex.semilavorato && !st.semilavorato) {
        const users = [...S.data.ricette.values()].filter(r => r.id !== id && (r.ingredienti || []).some(g => g.tipo === 'ric' && g.refId === id));
        if (users.length) return ferr(o, `È ingrediente di: ${users.map(r => r.nome).join(', ')}. Toglilo da lì prima di cambiarlo.`);
      }
      const sigla = st.sigla.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || autoSigla(nome);
      const doc = {...(ex ? strip(ex) : {}), nome, sigla, categoria: st.categoria.trim(), semilavorato: !!st.semilavorato, resaQta: r6(rq), resaUnita: lockedUnit ? ex.resaUnita : st.resaUnita, pesoPz, ingredienti, shelfLife: sl, tipoScadenza: st.tipoScadenza, conservazione: st.conservazione.trim(), procedimento: st.procedimento.trim(), tracce: algSort(st.tracce), prezzoVendita: prezzo, note: st.note.trim(), archiviato: !!ex?.archiviato, creato: ex?.creato || Date.now()};
      const nid = id || uid();
      if (await put('ricette', nid, doc)) { o.dirty = false; closeSheet(); toast(ex ? 'Scheda aggiornata' : `Scheda «${nome}» creata`); if (!ex) sheetScheda(nid); }
    }});
}

/* produzione di un lotto con scelta dei lotti degli ingredienti (prima quelli che scadono prima) */
function formProduzione(ricId, pre) {
  const recs = [...S.data.ricette.values()].filter(r => !r.archiviato).sort(byName);
  if (!recs.length) { toast('Prima crea una scheda tecnica.', true); return; }
  const st = {ricettaId: ricId && S.data.ricette.has(ricId) ? ricId : '', data: today(), qta: pre?.qta ? String(pre.qta) : '', scadenza: '', scadTouched: false, operatore: lsGet('bf-operatore') || '', note: '', forza: false, righe: []};
  const alloc = rg => {
    let rem = rg.valid ? rg.needBase : 0;
    for (const l of rg.lots) { const q = Math.min(l.res, Math.max(0, rem)); l.q = q > EPS ? fmtIn(q / rg.fct) : ''; rem = r6(rem - q); }
  };
  const build = () => {
    const r = S.data.ricette.get(st.ricettaId); st.righe = [];
    if (!r) return;
    if (!String(st.qta).trim()) st.qta = fmtIn(+r.resaQta);
    if (!st.scadTouched && validIso(st.data)) st.scadenza = addDays(st.data, Math.max(0, Math.round(+r.shelfLife || 0)));
    const k = pnum(st.qta) / +r.resaQta, Dd = drv();
    st.righe = (r.ingredienti || []).map(g => {
      const it = itemOf(g.tipo, g.refId), base = baseOf(g.tipo, it), pz = +it?.pesoPz || 0;
      const du = unitOk(g.unita) || base, fct = conv(1, du, base, pz), baseQ = it ? conv(+g.qta, g.unita, base, pz) : NaN;
      const ok = !!it && baseQ > 0 && fct > 0, needBase = ok && k > 0 ? r6(baseQ * k) : NaN;
      const all = (g.tipo === 'ric' ? Dd.ricLots : Dd.artLots).get(g.refId) || [];
      const live = all.filter(l => l.res > EPS);
      const avail = live.filter(l => !(l.scad && l.scad < st.data));
      const rg = {tipo: g.tipo, refId: g.refId, nome: it?.nome || 'Ingrediente eliminato', base, du, fct, baseQ, ok, needBase, valid: ok && needBase > 0, expired: live.length - avail.length,
        lots: avail.map(l => ({key: l.key, res: l.res, scad: l.scad, q: '', label: l.kind === 'prod' ? `Lotto ${l.p.lotto}` : `Lotto ${l.lottoF || 'senza codice'}`,
          meta: l.kind === 'prod' ? `prodotto ${fmtDs(l.data)} · scad. ${fmtDs(l.scad)} · disponibili ${fmtQ(l.res, base)}` : `scad. ${fmtDs(l.scad)} · disponibili ${fmtQ(l.res, base)} · ${l.doc.tipo === 'inventario' ? 'inventario' : (TIPI[l.doc.tipo] || 'Doc.') + (l.doc.numero ? ' ' + l.doc.numero : '')}`}))};
      alloc(rg);
      return rg;
    });
  };
  const rescale = o => {
    const r = S.data.ricette.get(st.ricettaId); if (!r) return;
    const k = pnum(st.qta) / +r.resaQta;
    st.righe.forEach((rg, i) => {
      rg.needBase = rg.ok && k > 0 ? r6(rg.baseQ * k) : NaN; rg.valid = rg.ok && rg.needBase > 0;
      alloc(rg);
      rg.lots.forEach((l, j) => { const inp = $(`[data-k="righe.${i}.lots.${j}.q"]`, o.el); if (inp) inp.value = l.q; });
      const nd = $(`#need-${i}`, o.el); if (nd) nd.textContent = rg.valid ? `servono ${fmtQ(rg.needBase / rg.fct, rg.du)}` : '—';
    });
    prodDyn(o);
  };
  const ingPick = (rg, i) => {
    const exTxt = rg.expired ? (rg.expired === 1 ? '1 lotto scaduto escluso' : `${rg.expired} lotti scaduti esclusi`) : '';
    return `<div class="card"><div class="ing-h"><b>${esc(rg.nome)}</b><span class="q" id="need-${i}">${rg.valid ? `servono ${fmtQ(rg.needBase / rg.fct, rg.du)}` : '—'}</span></div>
      ${rg.lots.length ? rg.lots.map((l, j) => `<label class="lotpick"><span class="t"><b>${esc(l.label)}</b><span>${esc(l.meta)}</span></span><span class="in"><input type="text" inputmode="decimal" data-k="righe.${i}.lots.${j}.q" value="${esc(l.q)}" autocomplete="off" aria-label="${esc(rg.nome)}, quantità dal ${esc(l.label)}"><span>${esc(rg.du)}</span></span></label>`).join('')
        : `<p class="hint" style="margin:0 0 8px">Nessun lotto disponibile in magazzino${exTxt ? ` (${exTxt})` : ''}. Registra l'acquisto da Acquisti.</p>`}
      ${rg.lots.length && exTxt ? `<p class="hint">${exTxt}.</p>` : ''}
      <span class="chip" id="sum-${i}"></span></div>`;
  };
  if (st.ricettaId) build();
  openSheet({form: true, st, title: 'Nuova produzione',
    body: () => {
      const r = S.data.ricette.get(st.ricettaId), u = unitOk(r?.resaUnita);
      return `<label class="fld"><span>Prodotto da scheda tecnica</span><select data-k="ricettaId"><option value="">Scegli il prodotto…</option>${recs.map(x => opt(x.id, x.nome, st.ricettaId)).join('')}</select></label>
      ${r ? `<div class="g3">${dateFld('data', 'Data di produzione', st.data)}
        <label class="fld"><span>Quantità prodotta (${u === 'pz' ? 'pezzi' : u})</span>${u === 'pz' ? `<span class="stepper"><button type="button" class="btn" data-act="step" data-d="-1" aria-label="Un pezzo in meno">${IC.minus}</button><input type="text" inputmode="decimal" data-k="qta" value="${esc(st.qta)}" autocomplete="off"><button type="button" class="btn" data-act="step" data-d="1" aria-label="Un pezzo in più">${IC.plus}</button></span>` : `<input type="text" inputmode="decimal" data-k="qta" value="${esc(st.qta)}" autocomplete="off">`}</label>
        <label class="fld"><span>${esc(scadLabel(r.tipoScadenza))}</span><input type="date" data-k="scadenza" value="${esc(st.scadenza)}"></label></div>
        <p class="hint" style="margin:-6px 0 12px">Resa della scheda: ${fmtQ(+r.resaQta, u)}. Scadenza calcolata con la durata della scheda (${esc(shelfTxt(r))}): puoi cambiarla.</p>
        ${validIso(st.data) ? `<div class="lotcode">${IC.tag}<span>Codice del lotto</span><b>${esc(lotCode(r, st.data))}</b></div>` : ''}
        <p class="note" id="scadwarn" hidden></p>
        <h3>Ingredienti e lotti usati</h3>
        <p class="hint" style="margin:-4px 0 10px">Per ogni ingrediente sono proposti per primi i lotti che scadono prima. Correggi le quantità se hai usato lotti diversi.</p>
        ${st.righe.map(ingPick).join('') || empty('La scheda non ha ingredienti.')}
        <label class="chk" id="forza" hidden><input type="checkbox" data-k="forza" ${st.forza ? 'checked' : ''}>Registra comunque: le quantità mancanti restano senza lotto</label>
        <div class="g2"><label class="fld"><span>Operatore</span><input type="text" data-k="operatore" value="${esc(st.operatore)}" placeholder="Chi ha prodotto" autocomplete="off"></label></div>
        <label class="fld"><span>Note</span><textarea data-k="note" rows="3">${esc(st.note)}</textarea></label>` : ''}
      <p class="err" id="ferr" role="alert"></p>`;
    },
    foot: () => foot('Registra lotto'),
    after: o => prodDyn(o),
    onField: (k, o) => {
      if (k === 'ricettaId') { st.qta = ''; st.scadTouched = false; st.forza = false; build(); paintSheet(o); return; }
      if (k === 'data') { if (validIso(st.data)) { build(); paintSheet(o); } return; }
      if (k === 'qta') { clearTimeout(o.qt); o.qt = setTimeout(() => rescale(o), 250); return; }
      if (k === 'scadenza') { st.scadTouched = true; prodDyn(o); return; }
      if (/^righe\.\d+\.lots\.\d+\.q$/.test(k)) prodDyn(o);
    },
    onSave: async o => {
      const r = S.data.ricette.get(st.ricettaId);
      if (!r) return ferr(o, 'Scegli il prodotto da produrre.');
      const qta = pnum(st.qta);
      if (!(qta > 0)) return ferr(o, 'Quantità prodotta non valida.');
      if (!validIso(st.data)) return ferr(o, 'Data di produzione non valida.');
      if (!validIso(st.scadenza)) return ferr(o, 'Indica la scadenza del lotto.');
      if (st.scadenza < st.data) return ferr(o, 'La scadenza è prima della data di produzione.');
      if (!st.righe.length) return ferr(o, 'La scheda non ha ingredienti: completala prima di produrre.');
      const consumi = [], missing = [];
      for (const rg of st.righe) {
        if (!rg.valid) return ferr(o, `Ingrediente non valido nella scheda: ${rg.nome}. Correggi la scheda tecnica.`);
        let tot = 0;
        for (const l of rg.lots) {
          const v = String(l.q).trim() === '' ? 0 : pnum(l.q);
          if (!(v >= 0)) return ferr(o, `${rg.nome}: quantità non valida.`);
          const vb = r6(v * rg.fct);
          if (vb > l.res + EPS) return ferr(o, `${rg.nome}: dal ${l.label} puoi usare al massimo ${fmtQ(l.res / rg.fct, rg.du).replace(/ /g, ' ')}.`);
          if (vb > EPS) { consumi.push({tipo: rg.tipo, refId: rg.refId, nome: rg.nome, lotId: l.key, qta: vb}); tot += vb; }
        }
        const miss = r6(rg.needBase - tot);
        if (miss > Math.max(EPS, rg.needBase * 1e-6)) {
          if (st.forza) consumi.push({tipo: rg.tipo, refId: rg.refId, nome: rg.nome, lotId: null, qta: miss});
          else missing.push(`${rg.nome} (${fmtQ(miss / rg.fct, rg.du).replace(/ /g, ' ')})`);
        }
      }
      if (missing.length) { const f = $('#forza', o.el); if (f) f.hidden = false; return ferr(o, `Mancano: ${missing.join(', ')}. Registra l'acquisto mancante oppure spunta «Registra comunque».`); }
      const doc = {lotto: lotCode(r, st.data), ricettaId: r.id, ricettaNome: r.nome, data: st.data, qta: r6(qta), unita: unitOk(r.resaUnita) || 'pz', scadenza: st.scadenza, tipoScadenza: r.tipoScadenza === 'entro' ? 'entro' : 'preferibilmente', operatore: st.operatore.trim(), note: st.note.trim(), consumi, allergeni: algSort([...recAllergensOf(r, [r.id])]), tracce: algSort([...recTracceOf(r, [r.id])]), creato: Date.now()};
      if (doc.operatore) lsSet('bf-operatore', doc.operatore);
      const nid = uid();
      if (await put('produzioni', nid, doc)) { o.dirty = false; closeSheet(); toast(`Lotto ${doc.lotto} registrato`); sheetLotto(nid); }
    }});
}
function prodDyn(o) {
  const st = o.st; let miss = false, minScad = null, minName = '';
  st.righe.forEach((rg, i) => {
    let tot = 0;
    rg.lots.forEach(l => { const v = pnum(l.q); if (v > 0) { tot += v; if (l.scad && (!minScad || l.scad < minScad)) { minScad = l.scad; minName = rg.nome; } } });
    const el = $(`#sum-${i}`, o.el); if (!el) return;
    if (!rg.valid) { el.className = 'chip red'; el.textContent = 'Ingrediente non valido: controlla la scheda'; miss = true; return; }
    const need = rg.needBase / rg.fct, diff = r6(tot - need), tol = Math.max(EPS, need * 1e-6);
    if (diff < -tol) { el.className = 'chip amb'; el.textContent = `Mancano ${fmtQ(-diff, rg.du)}`; miss = true; }
    else if (diff > tol) { el.className = 'chip'; el.textContent = `${fmtQ(diff, rg.du)} in più della ricetta`; }
    else { el.className = 'chip ok'; el.textContent = 'Quantità coperta'; }
  });
  const f = $('#forza', o.el); if (f && !st.forza) f.hidden = !miss;
  const w = $('#scadwarn', o.el);
  if (w) {
    const show = !!minScad && validIso(st.scadenza) && st.scadenza > minScad;
    w.hidden = !show;
    if (show) w.textContent = `Nota: un ingrediente usato scade prima del prodotto (${minName}, ${fmtD(minScad)}). Va bene per i prodotti cotti; per creme e prodotti freschi verifica la scadenza.`;
  }
}

/* modifica dei dati di un lotto già prodotto */
function formEditProd(id) {
  const l = drv().prod.get(id); if (!l) return;
  const p = l.p, u = lotUnit(l);
  const st = {qta: fmtIn(l.qta), scadenza: p.scadenza || '', operatore: p.operatore || '', note: p.note || ''};
  openSheet({form: true, st, title: `Modifica lotto ${p.lotto}`,
    body: () => `<p class="muted">Ingredienti e lotti usati non si modificano: se sono sbagliati, elimina il lotto e registralo di nuovo.</p>
      <div class="g2"><label class="fld"><span>Quantità prodotta (${esc(u)})</span><input type="text" inputmode="decimal" data-k="qta" value="${esc(st.qta)}" autocomplete="off"></label>
      <label class="fld"><span>${esc(scadLabel(p.tipoScadenza))}</span><input type="date" data-k="scadenza" value="${esc(st.scadenza)}"></label></div>
      <label class="fld"><span>Operatore</span><input type="text" data-k="operatore" value="${esc(st.operatore)}" autocomplete="off"></label>
      <label class="fld"><span>Note</span><textarea data-k="note" rows="3">${esc(st.note)}</textarea></label>
      <p class="err" id="ferr" role="alert"></p>`,
    foot: () => foot('Salva modifiche'),
    onSave: async o => {
      const cur = drv().prod.get(id); if (!cur) return ferr(o, 'Il lotto non esiste più.');
      const q = pnum(st.qta);
      if (!(q > 0)) return ferr(o, 'Quantità non valida.');
      const min = r6(cur.usedQ - cur.movQ);
      if (q < min - EPS) return ferr(o, `Sono già stati usati o scaricati ${fmtQ(min, u).replace(/ /g, ' ')}: la quantità non può essere minore.`);
      if (!validIso(st.scadenza) || st.scadenza < cur.p.data) return ferr(o, 'Scadenza non valida.');
      if (await put('produzioni', id, {...strip(cur.p), qta: r6(q), scadenza: st.scadenza, operatore: st.operatore.trim(), note: st.note.trim()})) { o.dirty = false; closeSheet(); toast('Lotto aggiornato'); }
    }});
}

/* scarichi (vendita, scarto, uso interno) e rettifiche */
function formMov(t) {
  const Dd = drv();
  const lot = t.item ? null : (t.kind === 'prod' ? Dd.prod.get(t.id) : Dd.acq.get(t.id));
  if (!t.item && !lot) return;
  const it = t.item ? itemOf(t.tipo, t.id) : lot.item;
  if (t.item && !it) return;
  const lots = t.item ? ((t.tipo === 'ric' ? Dd.ricLots : Dd.artLots).get(t.id) || []).filter(l => l.res > EPS) : [lot];
  const u = t.item ? baseOf(t.tipo, it) : lotUnit(lot);
  const totRes = r6(lots.reduce((s, l) => s + Math.max(0, l.res), 0));
  const isProd = t.item ? t.tipo === 'ric' : lot.kind === 'prod';
  const types = [['vendita', 'Venduto'], ['scarto', 'Scartato'], ['uso', 'Uso interno']];
  if (!t.item) types.push(['rettifica', 'Rettifica']);
  const st = {tipo: (isProd || it?.categoria === 'rivendita') ? 'vendita' : 'scarto', qta: '', contata: '', data: today(), nota: ''};
  if (!t.item && lot.res <= EPS) st.tipo = 'rettifica';
  const name = t.item ? it.nome : lotName(lot);
  openSheet({form: true, st, title: `Scarico: ${name}`, totRes, u,
    body: () => `<p class="muted">${t.item ? `Giacenza ${fmtQ(totRes, u)} in ${lots.length === 1 ? '1 lotto' : lots.length + ' lotti'}: si scarica prima dai lotti che scadono prima.` : `${lot.kind === 'prod' ? 'Lotto ' + esc(lot.p.lotto) : 'Lotto del fornitore ' + esc(lot.lottoF || 'senza codice')} · residuo ${fmtQ(lot.res, u)}`}</p>
      <div class="fld"><span>Motivo</span>${fseg('tipo', st.tipo, types)}</div>
      ${st.tipo === 'rettifica'
        ? `<label class="fld"><span>Quantità contata davvero (${esc(u)})</span><input type="text" inputmode="decimal" data-k="contata" value="${esc(st.contata)}" placeholder="${esc(fmtIn(lot.res))}" autocomplete="off"><small class="hint">La giacenza del lotto viene portata a questo valore.</small></label>`
        : `<label class="fld"><span>Quantità (${esc(u)})</span><input type="text" inputmode="decimal" data-k="qta" value="${esc(st.qta)}" placeholder="0" autocomplete="off"></label>${totRes > EPS ? `<p><button type="button" class="btn" data-act="mov-all">Tutto il residuo: ${fmtQ(totRes, u)}</button></p>` : ''}`}
      <div class="g2">${dateFld('data', 'Data', st.data)}</div>
      <label class="fld"><span>Nota</span><input type="text" data-k="nota" value="${esc(st.nota)}" placeholder="Facoltativa" autocomplete="off"></label>
      <p class="err" id="ferr" role="alert"></p>`,
    foot: () => foot('Registra'),
    onField: (k, o) => { if (k === 'tipo') paintSheet(o); },
    onSave: async o => {
      if (!validIso(st.data)) return ferr(o, 'Data non valida.');
      if (st.tipo === 'rettifica') {
        const cur = drv()[lot.kind === 'prod' ? 'prod' : 'acq'].get(lot.key); if (!cur) return ferr(o, 'Il lotto non esiste più.');
        const c = pnum(st.contata);
        if (!(c >= 0)) return ferr(o, 'Indica la quantità contata.');
        const delta = r6(c - cur.res);
        if (Math.abs(delta) < EPS) { o.dirty = false; closeSheet(); toast('Nessuna differenza: la giacenza era già giusta.'); return; }
        if (await put('movimenti', uid(), {data: st.data, tipo: 'rettifica', lotKind: cur.kind, lotId: cur.key, delta, nota: st.nota.trim(), creato: Date.now()})) { o.dirty = false; closeSheet(); toast('Giacenza rettificata'); }
        return;
      }
      const q = pnum(st.qta);
      if (!(q > 0)) return ferr(o, 'Indica la quantità.');
      const fresh = lots.map(l => drv()[l.kind === 'prod' ? 'prod' : 'acq'].get(l.key)).filter(l => l && l.res > EPS);
      const avail = r6(fresh.reduce((s, l) => s + l.res, 0));
      if (q > avail + EPS) return ferr(o, `Puoi scaricare al massimo ${fmtQ(avail, u).replace(/ /g, ' ')}.`);
      const t0 = today();
      const ordered = st.tipo === 'scarto' ? fresh : [...fresh.filter(l => !(l.scad && l.scad < t0)), ...fresh.filter(l => l.scad && l.scad < t0)];
      let rem = q; const movs = [];
      for (const l of ordered) { if (rem <= EPS) break; const x = Math.min(l.res, rem); movs.push({data: st.data, tipo: st.tipo, lotKind: l.kind, lotId: l.key, delta: -r6(x), nota: st.nota.trim(), creato: Date.now()}); rem = r6(rem - x); }
      let ok = true;
      for (const m of movs) ok = (await put('movimenti', uid(), m)) && ok;
      if (ok) { o.dirty = false; closeSheet(); toast(`Scarico registrato: ${fmtQ(q, u).replace(/ /g, ' ')} (${MOV[st.tipo].toLowerCase()})`); }
    }});
}
