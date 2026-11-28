/* ---------- lettura con Claude: lotto e scadenza da una foto dell'etichetta ----------
   Le foto non vanno a Claude direttamente: passano da un «ponte» (apps-script/claude-ponte.gs), uno script di Google
   nell'account di chi gestisce il servizio. Il ponte tiene la chiave API, riconosce il bar dal codice e conta le foto. */
const CLAUDE = {note: new WeakMap(), busy: new WeakSet()};   // per riga del modulo: esito dell'ultima lettura, lettura in corso
const claudeCfg = () => S.data.impostazioni.get('claude') || null;
const claudeOk = () => S.mode === 'local';   // su claude.ai la pagina non può chiamare siti esterni
const claudeOn = () => { const c = claudeCfg(); return claudeOk() && !S.ro && !servLimitato() && !!(c && c.url && c.codice); };   // limitato o sospeso: ferma
const getPath = (o, path) => String(path || '').split('.').reduce((x, k) => (x == null ? x : x[k]), o);
const CLAUDE_LATO = 2000;   // lato lungo delle foto mandate: abbastanza per i timbri piccoli, leggere da spedire

async function claudeReq(c, body) {
  const u = new URL(c.url);
  if (!body) { u.searchParams.set('codice', c.codice); u.searchParams.set('app', appVersione()); }   // con la versione: chi gestisce il servizio vede chi va aggiornato
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 60000);
  let txt;
  try {   // GET o POST con un testo JSON: richieste «semplici», che lo script di Google accetta da un altro sito
    const r = await fetch(u.href, body ? {method: 'POST', body: JSON.stringify({...body, codice: c.codice}), signal: ctl.signal, cache: 'no-store'} : {signal: ctl.signal, cache: 'no-store'});
    if (!r.ok) throw Object.assign(new Error('http'), {code: 'risposta'});
    txt = await r.text();
  } finally { clearTimeout(t); }
  let j; try { j = JSON.parse(txt); } catch { throw Object.assign(new Error('json'), {code: 'risposta'}); }
  if (!j || j.ok !== true) throw Object.assign(new Error('ponte'), {code: String(j?.errore || 'risposta'), j});
  return j;
}
function claudeErr(e) {
  const c = e?.code, j = e?.j || {};
  if (c === 'codice') return 'Il codice del bar non è riconosciuto: controllalo in Impostazioni → Lettura con Claude.';
  if (c === 'sospeso') return 'La lettura con Claude è sospesa per questo bar: senti chi ti ha installato Barista Flow.';
  if (c === 'limitato') return 'La lettura con Claude è ferma per questo bar: trovi i dettagli in Oggi.';
  if (c === 'tetto') return `Le foto di questo mese sono finite${j.tetto ? ` (${j.tetto})` : ''}: ripartono il primo del mese. Lotto e scadenza si scrivono a mano.`;
  if (c === 'foto' || c === 'immagine') return 'Questa foto non si può leggere: rifalla, oppure scegli un’altra immagine.';
  if (c === 'chiave_api' || c === 'crediti') return 'Il servizio di lettura non è disponibile in questo momento: avvisa chi ti ha installato Barista Flow.';
  if (c === 'occupato') return 'Claude è molto occupato: riprova tra un minuto.';
  if (c === 'rifiuto') return 'Claude non ha letto questa foto: prova con una foto solo dell’etichetta.';
  if (e?.name === 'AbortError') return 'La lettura ci ha messo troppo: riprova.';
  if (!navigator.onLine) return 'Sei senza connessione: per leggere l’etichetta serve la rete.';
  if (!c || c === 'risposta') return 'Il servizio di lettura non risponde: controlla l’indirizzo in Impostazioni → Lettura con Claude.';
  return 'La lettura non è riuscita: riprova.';
}

/* --- la foto: rimpicciolita in JPEG, con l'orientamento giusto --- */
async function claudeFoto(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw Object.assign(new Error('img'), {code: 'immagine'}); }
  const k = Math.min(1, CLAUDE_LATO / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  const url = cv.toDataURL('image/jpeg', .85);
  return {tipo: 'image/jpeg', dati: url.slice(url.indexOf(',') + 1)};
}

/* --- nella riga di un acquisto: il pulsante e l'esito dell'ultima lettura --- */
// st: lo stato del modulo; i: la riga; lot e scad: dove scrivere; art e forn: dove sono articolo e fornitore nello stato
function claudeRiga(st, i, keys) {
  if (!claudeOn()) return '';
  const riga = st.righe[i], busy = CLAUDE.busy.has(riga), nota = CLAUDE.note.get(riga);
  return `<div class="leggi">${busy ? `<span class="btn sm" aria-busy="true">${IC.cam}Sto leggendo l’etichetta…</span>`
    : `<label class="btn sm">${IC.cam}${nota ? 'Leggi un’altra foto' : 'Leggi l’etichetta'}<input type="file" accept="image/*" multiple data-file="etichetta" data-lot="${esc(keys.lot)}" data-scad="${esc(keys.scad)}" data-art="${esc(keys.art)}" data-forn="${esc(keys.forn)}"></label>`}
    ${nota ? `<p class="note${nota.warn ? ' warn' : ''}">${nota.warn ? IC.alert : IC.check}<span>${nota.html}</span></p>` : ''}</div>`;
}
const claudeParole = s => norm(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length > 3 && !['tipo', 'della', 'delle', 'dello', 'con', 'senza', 'gusto', 'confezione'].includes(w));
// l'etichetta è dell'articolo della riga? basta una parola in comune (anche solo l'inizio), altrimenti si avvisa
function claudeSimile(art, d) {
  const a = claudeParole(art?.nome), e = claudeParole(`${d.prodotto || ''} ${d.marca || ''}`);
  if (!a.length || !e.length) return true;
  return a.some(w => e.some(x => x === w || (w.length > 4 && x.length > 4 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))));
}
function claudeNota(d, art, rimaste) {
  const out = [], dub = new Set(d.dubbi || []);
  let warn = false;
  if (d.leggibile === false) return {warn: true, html: 'In questa foto non riesco a leggere un’etichetta: rifalla più vicina, dritta e con più luce.'};
  if (d.lotto || d.scadenza) {
    const tipo = d.tipoScadenza === 'entro' ? ' (da consumarsi entro)' : d.tipoScadenza === 'preferibilmente' ? ' (preferibilmente entro)' : '';
    out.push(`Dall’etichetta: ${[d.lotto ? `lotto <b>${esc(d.lotto)}</b>` : 'lotto non trovato', d.scadenza ? `scadenza <b>${esc(fmtD(d.scadenza))}</b>${tipo}` : 'scadenza non trovata'].join(', ')}. Controlla prima di salvare.`);
  } else { warn = true; out.push('Non ho trovato né lotto né scadenza: fotografa il timbro, spesso è sul retro o sul fondo della confezione.'); }
  const dl = dub.has('lotto') && !!d.lotto, dsc = dub.has('scadenza') && !!d.scadenza;
  if (dl || dsc) { warn = true; out.push(`${dl && dsc ? 'Lotto e scadenza letti' : dl ? 'Lotto letto' : 'Scadenza letta'} con qualche dubbio: confronta con la confezione.`); }
  if (!d.scadenza && dub.has('scadenza') && d.lotto) { warn = true; out.push('La scadenza non si legge bene: scrivila tu.'); }
  if (art && !claudeSimile(art, d)) { warn = true; out.push(`L’etichetta sembra di «${esc(d.prodotto || d.marca)}», non di «${esc(art.nome)}»: controlla di aver fotografato la confezione giusta.`); }
  else if (!art && d.prodotto) out.push(`Prodotto: ${esc(d.prodotto)}.`);
  if (rimaste != null && rimaste <= 10) out.push(rimaste ? `Restano ${rimaste} foto questo mese.` : 'Le foto di questo mese sono finite.');
  return {warn, html: out.join(' ')};
}
async function claudeLeggi(o, ds, files) {
  const c = claudeCfg(), riga = getPath(o.st, String(ds.lot || '').replace(/\.[^.]+$/, ''));
  if (!claudeOn() || !riga || typeof riga !== 'object' || CLAUDE.busy.has(riga)) return;
  const fs = files.filter(f => !f.type || /^image\//.test(f.type)).slice(0, 3);
  if (!fs.length) { toast('Scegli una foto dell’etichetta.', true); return; }
  CLAUDE.busy.add(riga); CLAUDE.note.delete(riga); paintSheet(o);
  let nota;
  try {
    const foto = [];
    for (const f of fs) foto.push(await claudeFoto(f));
    const art = S.data.articoli.get(getPath(o.st, ds.art)), forn = S.data.fornitori.get(getPath(o.st, ds.forn));
    const j = await claudeReq(c, {cosa: 'lotto', foto, articolo: art?.nome || '', fornitore: forn?.nome || ''});
    const d = j.dati || {};
    if (d.leggibile !== false) {
      if (d.lotto) setPath(o.st, ds.lot, String(d.lotto).slice(0, 60));
      if (d.scadenza && validIso(d.scadenza)) setPath(o.st, ds.scad, d.scadenza);
      o.dirty = true;
    }
    nota = claudeNota(d, art, j.rimaste);
    claudeConta(j);
  } catch (e) {
    nota = {warn: true, html: esc(claudeErr(e))};
    if (e?.code === 'limitato' || e?.code === 'sospeso') servCheck(true);   // l'abbonamento è cambiato da poco: si aggiorna
    if (e?.j?.rimaste != null) claudeConta(e.j);
  } finally { CLAUDE.busy.delete(riga); }
  CLAUDE.note.set(riga, nota);
  if (stack.includes(o)) paintSheet(o);
}
function claudeConta(j) {   // quante foto restano: si vede in Impostazioni
  const c = claudeCfg(); if (!c || j?.rimaste == null) return;
  put('impostazioni', 'claude', {...strip(c), rimaste: +j.rimaste, tetto: +j.tetto || c.tetto || null, aggiornato: Date.now()}, true);
}

/* --- Impostazioni → Lettura con Claude --- */
function claudeCard() {
  const head = '<div class="setgrp" id="claude"><h2>Lettura con Claude</h2><div class="card">';
  if (S.roServizio && claudeCfg()?.url) return `${head}${servRiga()}<div class="acts"><button type="button" class="btn" data-act="serv-check" ${SERV.busy ? 'disabled' : ''}>${SERV.busy ? 'Controllo…' : 'Controlla l’abbonamento'}</button><button type="button" class="btn" data-act="claude-setup">Cambia codice</button></div></div></div>`;   // sospeso: si ricontrolla, o si mette il codice nuovo
  if (S.ro) return '';
  if (!claudeOk()) return `${head}<p class="muted">Con una foto dell’etichetta Claude scrive lotto e scadenza nelle righe degli acquisti. Si collega dall’app pubblicata sul tuo sito (GitHub Pages): da qui la pagina non può collegarsi.</p></div></div>`;
  const c = claudeCfg();
  if (!c?.url) return `${head}<p>Fotografi l’etichetta e Claude scrive lotto e scadenza nelle righe degli acquisti; tu controlli e salvi. Serve il collegamento che ti dà chi ti ha installato Barista Flow: l’indirizzo del servizio e il codice del tuo bar.</p><button type="button" class="btn pri w" data-act="claude-setup">${IC.cam}Collega la lettura</button></div></div>`;
  return `${head}<p>Collegata${c.bar ? ` come <b>${esc(c.bar)}</b>` : ''}. ${c.rimaste != null ? `Foto disponibili questo mese: <b>${esc(c.rimaste)}</b>${c.tetto ? ` su ${esc(c.tetto)}` : ''}${c.aggiornato ? `, al ${esc(fmtWhen(c.aggiornato))}` : ''}.` : ''}</p>
    ${servRiga()}<p class="hint">Negli acquisti, sotto lotto e scadenza di ogni riga, c’è «Leggi l’etichetta».</p>
    <div class="acts"><button type="button" class="btn" data-act="claude-prova">Prova il collegamento</button><button type="button" class="btn" data-act="claude-setup">Modifica</button><button type="button" class="btn dan" data-act="claude-off">Scollega</button></div></div></div>`;
}
function formClaude() {
  if (!(S.roServizio || guard()) || !claudeOk()) return;   // sospeso: il codice si può ancora cambiare
  const c = claudeCfg() || {}, st = {url: c.url || '', codice: c.codice || ''};
  openSheet({form: true, st, title: c.url ? 'Lettura con Claude' : 'Collega la lettura con Claude',
    body: () => `<p class="muted">Fotografi l’etichetta di una confezione e Claude legge lotto e scadenza; tu controlli e salvi. Le foto passano da un servizio di chi ti ha installato Barista Flow, che le manda a Claude: né l’app né il servizio le conservano.</p>
      <label class="fld"><span>Indirizzo del servizio</span><input type="url" data-k="url" value="${esc(st.url)}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" spellcheck="false"></label>
      <label class="fld"><span>Codice del bar</span><input type="text" data-k="codice" value="${esc(st.codice)}" placeholder="Es. BF-7KQ3-M9XT" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
      <p class="hint" style="margin-top:-6px">Indirizzo e codice te li dà chi ti ha installato Barista Flow. Il codice vale solo per il tuo bar: non condividerlo.</p>
      <p class="err" id="ferr" role="alert"></p>`,
    foot: () => foot(c.url ? 'Prova e salva' : 'Prova e collega'),
    onSave: async o => {
      const url = st.url.trim(), codice = st.codice.trim().toUpperCase();
      if (!/^https:\/\/\S+$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/\S*$/i.test(url)) return ferr(o, 'Scrivi l’indirizzo del servizio: comincia con https:// e di solito finisce con /exec.');
      try { new URL(url); } catch { return ferr(o, 'Questo indirizzo non è valido.'); }
      if (!/^[A-Z0-9-]{6,40}$/.test(codice)) return ferr(o, 'Scrivi il codice del bar, per esempio BF-7KQ3-M9XT.');
      let j;
      try { j = await claudeReq({url, codice}); }
      catch (e) { return ferr(o, claudeErr(e)); }
      const rec = {url, codice, bar: String(j.bar || '').slice(0, 80), tetto: +j.tetto || null, rimaste: j.rimaste != null ? +j.rimaste : null, aggiornato: Date.now()};
      if (!(await put('impostazioni', 'claude', rec))) return;
      o.dirty = false; closeSheet(); servSalva(j);
      if (servLimitato()) toast('Collegata, ma la lettura con Claude è ferma per questo bar: trovi i dettagli in Oggi.', true);
      else toast(`Lettura con Claude collegata${rec.bar ? ': ' + rec.bar : ''}${rec.rimaste != null ? `, ${rec.rimaste} foto disponibili questo mese` : ''}`);
    }});
}
async function claudeProva() {
  const c = claudeCfg(); if (!c) return;
  try {
    const j = await claudeReq(c); claudeConta(j); servSalva(j);   // insieme al collegamento si aggiorna l'abbonamento
    if (servLimitato()) toast(claudeErr({code: servStato()}), true);
    else toast(`Collegamento a posto${j.bar ? ' (' + j.bar + ')' : ''}: ${j.rimaste} foto disponibili questo mese.`);
  } catch (e) { if (e?.code === 'codice') servSalva(null); toast(claudeErr(e), true); }
}
async function claudeOff() {
  if (!(await ask('Scollego la lettura con Claude? Lotti e scadenze già salvati restano; poi si scrivono a mano.', 'Scollega', true))) return;
  if (await del('impostazioni', 'claude')) toast('Lettura con Claude scollegata.');
}
