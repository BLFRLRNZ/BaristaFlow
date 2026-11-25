/* ---------- fatture dalla posta: una casella Gmail collegata con uno script di Google ----------
   Lo script (apps-script/fatture-dalla-posta.gs) elenca gli allegati XML, P7M, ZIP e PDF arrivati nella casella
   e li passa all'app. Le mail nuove finiscono in una coda; «Importa fatture» le scarica e le legge come i file scelti a mano. */
const POSTA_GS = /*POSTA_GS*/'';
const POSTA = {busy: false, last: 0, timer: 0};
const postaCfg = () => S.data.impostazioni.get('posta') || null;
const postaOk = () => S.mode === 'local';   // su claude.ai la pagina non può chiamare siti esterni
const postaOn = () => { const p = postaCfg(); return postaOk() && !!(p && p.url && p.chiave); };
const postaCoda = () => (postaOn() && Array.isArray(postaCfg().coda) ? postaCfg().coda : []);
const postaMail = coda => new Set(coda.map(x => String(x.id).split(':')[0])).size;   // una mail = una fattura, anche con XML e PDF allegati
const postaScript = k => POSTA_GS.replace('__CHIAVE__', k);
const postaLink = p => p.url + (p.url.includes('?') ? '&' : '?') + 'k=' + encodeURIComponent(p.chiave);   // per collegare un altro dispositivo senza rifare lo script
const POSTA_TRENTA = 30 * 864e5;
function postaChiave() {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fmtWhen(ts) {
  const d = new Date(+ts); if (!+ts || isNaN(d)) return '';
  const iso = isoOf(d), hm = d.toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'});
  return `${iso === today() ? 'oggi' : iso === isoOf(new Date(Date.now() - 864e5)) ? 'ieri' : 'il ' + fmtD(iso)} alle ${hm}`;
}

/* --- chiamate allo script --- */
async function postaFetch(p, params) {
  const u = new URL(p.url);
  u.searchParams.set('k', p.chiave);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 45000);
  let txt;
  try { const r = await fetch(u.href, {signal: ctl.signal, cache: 'no-store'}); if (!r.ok) throw Object.assign(new Error('http'), {code: 'risposta'}); txt = await r.text(); }
  finally { clearTimeout(t); }
  let j; try { j = JSON.parse(txt); } catch { throw Object.assign(new Error('json'), {code: 'risposta'}); }
  if (!j || j.ok !== true) throw Object.assign(new Error('script'), {code: String(j?.errore || 'risposta')});
  return j;
}
function postaErr(e) {
  if (e?.code === 'chiave') return 'La chiave non corrisponde: copia di nuovo lo script da Barista Flow, incollalo e pubblica una nuova versione.';
  if (e?.name === 'AbortError') return 'Lo script non ha risposto in tempo: riprova tra poco.';
  if (!navigator.onLine) return 'Sei senza connessione: la posta si controlla quando torna.';
  if (!e?.code || e.code === 'risposta') return 'Lo script non risponde: controlla l’URL (finisce con /exec) e che l’accesso sia «Chiunque».';
  return 'Lo script ha dato un errore: ' + String(e.code).slice(0, 160);
}

/* --- controllo della casella: all'avvio, quando si torna sull'app e ogni 15 minuti mentre è aperta --- */
async function postaSync(manual) {
  const p = postaCfg();
  if (!postaOn() || POSTA.busy || !allLoaded() || S.ro) return null;
  if (!manual && !navigator.onLine) return null;
  POSTA.busy = true; POSTA.last = Date.now(); refreshSheets();
  let n = null;
  try {
    const j = await postaFetch(p, {dal: p.dal || Date.now() - POSTA_TRENTA});
    const cur = postaCfg(); if (!cur || cur.url !== p.url) return null;   // scollegata o cambiata nel frattempo
    const files = (Array.isArray(j.file) ? j.file : []).filter(x => x && typeof x.id === 'string' && x.id.length < 200);
    const visti = {...(cur.visti || {})}, coda = [...(cur.coda || [])];
    const nuovi = files.filter(x => !visti[x.id]);
    for (const x of nuovi) {
      visti[x.id] = +x.data || Date.now();
      coda.push({id: x.id, nome: String(x.nome || 'allegato').slice(0, 120), data: +x.data || Date.now(), da: String(x.da || '').slice(0, 120), oggetto: String(x.oggetto || '').slice(0, 160)});
    }
    const old = Date.now() - 120 * 864e5;
    for (const k of Object.keys(visti)) if (visti[k] < old) delete visti[k];
    const dal = Math.max(+cur.dal || 0, ...files.map(x => +x.data || 0)) || Date.now() - POSTA_TRENTA;
    await put('impostazioni', 'posta', {...strip(cur), visti, coda, dal, controllata: Date.now(), casella: String(j.casella || cur.casella || '').slice(0, 120), errore: ''}, true);
    n = nuovi.length;
    const m = postaMail(nuovi), o = stack.find(x => x.fe);
    if (m) toast(m === 1 ? 'È arrivata una fattura dalla posta' : `Sono arrivate ${m} fatture dalla posta`, false, o ? null : {label: 'Vedi', fn: () => sheetFatture()});
    else if (manual) toast('Nessuna fattura nuova nella posta');
    if (o && n) fePostaLoad(o);
  } catch (e) {
    const msg = postaErr(e), cur = postaCfg();
    if (cur) await put('impostazioni', 'posta', {...strip(cur), errore: msg, controllata: Date.now()}, true);
    if (manual) toast(msg, true);
  } finally { POSTA.busy = false; refreshSheets(); }
  return n;
}
function postaStart() {
  clearInterval(POSTA.timer); POSTA.timer = 0;
  if (!postaOn()) return;
  POSTA.timer = setInterval(() => { if (document.visibilityState === 'visible' && Date.now() - POSTA.last > 14 * 60e3) postaSync(); }, 60e3);
  postaSync();
}
function postaBoot() {   // appena l'archivio è caricato
  let n = 0;
  const t = setInterval(() => { if (allLoaded() || ++n > 80) { clearInterval(t); postaStart(); } }, 250);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && postaOn() && Date.now() - POSTA.last > 10 * 60e3) postaSync(); });
async function postaRiparti() {   // finita la prova, le fatture importate con gli esempi sono state cancellate: si riprendono dalla posta
  const p = postaCfg(); if (!p || !p.url) return;
  await put('impostazioni', 'posta', {...strip(p), visti: {}, coda: [], dal: Date.now() - POSTA_TRENTA}, true);
  postaSync();
}
async function postaOff() {
  if (!(await ask('Scollego la posta? Le fatture già importate restano; quelle arrivate e non ancora importate escono dall’elenco.', 'Scollega', true))) return;
  clearInterval(POSTA.timer); POSTA.timer = 0;
  if (await del('impostazioni', 'posta')) toast('Posta scollegata. Lo script resta nel tuo account Google: puoi eliminarlo da script.google.com.');
}

/* --- nell'elenco di «Importa fatture» --- */
async function fePostaLoad(o) {
  const p = postaCfg(); if (!p || o.busy) return;
  const todo = postaCoda().filter(x => !FE.list.some(e => e.posta === x.id));
  if (!todo.length) return;
  o.busy = 'posta'; paintSheet(o);
  const vuoti = [];
  for (const x of todo) {
    let file;
    try { const j = await postaFetch(p, {op: 'file', id: x.id}); file = new File([Uint8Array.from(atob(String(j.b64 || '')), c => c.charCodeAt(0))], String(j.nome || x.nome)); }
    catch (err) { FE.list.push({key: 'posta:' + x.id, file: x.nome, posta: x.id, retry: true, err: 'non scaricato dalla posta. ' + postaErr(err)}); continue; }
    const {out, ignored} = await feRead([file]);
    for (const e of out) e.posta = x.id;
    FE.list.push(...out); FE.ignored += ignored;
    if (!out.length) vuoti.push(x.id);   // metadati del Sistema di Interscambio o doppione (lo stesso documento in XML e in PDF)
  }
  o.busy = false;
  await fePostaClose(vuoti);
  if (stack.includes(o)) paintSheet(o);
}
/* un allegato esce dalla coda quando tutte le sue fatture sono importate, già presenti, scartate o non leggibili */
async function fePostaClose(extra = []) {
  const p = postaCfg(); if (!p || !(p.coda || []).length) return;
  const by = new Map();
  for (const e of FE.list) if (e.posta) { if (!by.has(e.posta)) by.set(e.posta, []); by.get(e.posta).push(e); }
  const fine = e => !e.retry && (e.done || e.scartata || !e.f || ['dup', 'skip', 'err'].includes(feStatus(e).k));
  const coda = p.coda.filter(x => !extra.includes(x.id) && !(by.has(x.id) && by.get(x.id).every(fine)));
  if (coda.length !== p.coda.length) await put('impostazioni', 'posta', {...strip(p), coda}, true);
}
function postaBar() {
  if (!postaOk() || S.ro) return '';
  const p = postaCfg();
  if (!postaOn()) return `<p class="note posta-bar">${IC.mail}<span>Vuoi che le fatture arrivino da sole dalla posta? <button type="button" class="lnk" data-act="posta-setup">Collega la posta</button></span></p>`;
  const what = p.errore ? esc(p.errore) : `Posta collegata${p.casella ? ` (${esc(p.casella)})` : ''}: ${p.controllata ? 'controllata ' + esc(fmtWhen(p.controllata)) : 'non ancora controllata'}.`;
  return `<p class="note posta-bar${p.errore ? ' warn' : ''}">${p.errore ? IC.alert : IC.mail}<span>${what} <button type="button" class="lnk" data-act="posta-sync" ${POSTA.busy ? 'disabled' : ''}>${POSTA.busy ? 'Controllo…' : 'Controlla adesso'}</button></span></p>`;
}
function postaRow() {
  const n = postaMail(postaCoda());
  return n ? `<button type="button" class="row" data-act="fe-import">${av(IC.mail, 'amb')}<span class="m"><b>${n === 1 ? 'Una fattura arrivata' : n + ' fatture arrivate'} dalla posta</b><span>Controllale e importale negli acquisti</span></span></button>` : '';
}

/* --- Impostazioni --- */
function postaCard() {
  if (S.ro) return '';
  const head = '<div class="setgrp" id="posta"><h2>Fatture dalla posta</h2><div class="card">';
  if (!postaOk()) return `${head}<p class="muted">Le fatture che arrivano per mail possono comparire da sole in «Importa fatture». Si collega dall’app pubblicata sul tuo sito (GitHub Pages): da qui la pagina non può collegarsi a Google.</p></div></div>`;
  const p = postaCfg();
  if (!postaOn()) return `${head}<p>Le fatture che arrivano come allegato in una casella Gmail, XML o PDF, compaiono da sole in «Importa fatture». Fa da ponte un piccolo script di Google, gratuito, che prepari una volta sola.</p><button type="button" class="btn pri w" data-act="posta-setup">${IC.mail}Collega la posta</button></div></div>`;
  const n = postaMail(p.coda || []);
  return `${head}<p>Collegata a <b>${esc(p.casella || 'Gmail')}</b>. La posta si controlla quando apri l’app e ogni 15 minuti mentre è aperta${p.controllata ? `; ultimo controllo ${esc(fmtWhen(p.controllata))}` : ''}.</p>
    ${p.errore ? `<p class="note warn">${IC.alert}<span>${esc(p.errore)}</span></p>` : ''}
    ${n ? `<p><button type="button" class="lnk" data-act="fe-import">${n === 1 ? 'Una fattura da importare' : n + ' fatture da importare'}</button></p>` : ''}
    <div class="acts"><button type="button" class="btn" data-act="posta-sync" ${POSTA.busy ? 'disabled' : ''}>Controlla adesso</button><button type="button" class="btn" data-act="posta-link">${IC.copy}Link per un altro dispositivo</button><button type="button" class="btn" data-act="posta-setup">Modifica</button><button type="button" class="btn dan" data-act="posta-off">Scollega</button></div>
    <p class="hint" style="margin-top:10px">I dati dell’app restano su questo dispositivo: per ricevere le fatture anche su un altro, copia il link e incollalo lì in «Collega la posta».</p></div></div>`;
}
function formPosta() {
  if (!guard() || !postaOk()) return;
  let p = postaCfg() || {};
  if (!p.chiave) { p = {...p, chiave: postaChiave()}; put('impostazioni', 'posta', strip(p), true); }   // la chiave resta la stessa anche se chiudi e riapri
  const st = {url: p.url || ''}, key = p.chiave;
  openSheet({form: true, st, title: p.url ? 'Collegamento della posta' : 'Collega la posta',
    body: () => `<p class="muted">Le fatture che arrivano come allegato (XML, P7M, ZIP o PDF) in una casella Gmail compaiono da sole in «Importa fatture». Fa da ponte un piccolo script di Google, gratuito, che crei una volta sola con l’account di quella casella.</p>
      <ol class="steps">
        <li><b>La casella.</b> Meglio una casella Gmail solo per le fatture, per esempio fatture.nomedelbar@gmail.com. Nel servizio dove arrivano le fatture attiva l’invio di una copia via mail a quell’indirizzo, con il file allegato.</li>
        <li><b>Lo script.</b> Con l’account di quella casella apri <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">script.google.com</a>: si apre un progetto nuovo. Cancella il testo che c’è e incolla lo script.<span class="acts"><button type="button" class="btn sm" data-act="posta-copia">${IC.copy}Copia lo script</button></span></li>
        <li><b>Il permesso.</b> Premi Esegui con la funzione «prova». Google avvisa che l’app non è verificata: è il tuo script, quindi scegli Avanzate, poi Vai al progetto, e consenti la lettura di Gmail.</li>
        <li><b>La pubblicazione.</b> In alto a destra: Esegui il deployment, Nuovo deployment. Accanto a «Seleziona tipo» tocca l’ingranaggio e scegli App web. Esegui come: Io; Chi ha accesso: Chiunque (non «Chiunque abbia un Account Google»). Poi Esegui il deployment, copia l’URL dell’app web e incollalo qui sotto.</li>
      </ol>
      <label class="fld"><span>URL dell’app web</span><input type="url" data-k="url" value="${esc(st.url)}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" spellcheck="false"></label>
      <p class="hint" style="margin-top:-6px">Se la posta è già collegata su un altro dispositivo, incolla qui il link copiato da lì (Impostazioni → Fatture dalla posta): lo script non va rifatto.</p>
      <details class="fe-raw posta-gs"><summary>Vedi lo script</summary><pre>${esc(postaScript(key))}</pre></details>
      <p class="hint">Lo script copiato da qui contiene la chiave di questo collegamento. Chi ha l’URL e la chiave può leggere gli allegati delle fatture: non condividerli.</p>
      <p class="err" id="ferr" role="alert"></p>`,
    foot: () => foot(p.url ? 'Prova e salva' : 'Prova e collega'),
    onSave: async o => {
      let url = st.url.trim(), k = key;
      if (!/^https:\/\/\S+$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/\S*$/i.test(url)) return ferr(o, 'Incolla l’URL dell’app web: comincia con https://script.google.com/ e finisce con /exec.');
      try {   // link copiato da un altro dispositivo: contiene anche la chiave
        const u = new URL(url), kk = u.searchParams.get('k');
        if (kk != null) { if (kk.length < 16) return ferr(o, 'Il link non è completo: copialo di nuovo dall’altro dispositivo.'); k = kk; u.searchParams.delete('k'); url = u.href; }
      } catch { return ferr(o, 'Questo URL non è valido.'); }
      let j;
      try { j = await postaFetch({url, chiave: k}, {dal: Date.now() - POSTA_TRENTA}); }
      catch (e) { return ferr(o, postaErr(e)); }
      // stessa casella con un nuovo deployment: le mail già viste restano viste
      const cur = postaCfg() || p, casella = String(j.casella || '').slice(0, 120), same = !!cur.casella && cur.casella === casella;
      const rec = {...strip(cur), url, chiave: k, casella, dal: same && cur.dal ? cur.dal : Date.now() - POSTA_TRENTA, visti: same ? cur.visti || {} : {}, coda: same ? cur.coda || [] : [], controllata: 0, errore: ''};
      if (!(await put('impostazioni', 'posta', rec))) return;
      o.dirty = false; closeSheet();
      toast(rec.casella ? `Posta collegata: ${rec.casella}` : 'Posta collegata');
      postaStart();
    }});
}
async function postaCopia(b) {
  const o = sheetOf(b), k = postaCfg()?.chiave; if (!k) return;
  try { await navigator.clipboard.writeText(postaScript(k)); toast('Script copiato: incollalo nel progetto di script.google.com'); }
  catch {
    const d = o && $('.posta-gs', o.el);
    if (d) { d.open = true; const r = document.createRange(); r.selectNodeContents($('pre', d)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    toast('Non riesco a copiarlo da qui: ho selezionato il testo dello script, copialo tu.', true);
  }
}
async function postaLinkCopia() {
  const p = postaCfg(); if (!p?.url) return;
  try { await navigator.clipboard.writeText(postaLink(p)); toast('Link copiato: sull’altro dispositivo incollalo in Impostazioni → Fatture dalla posta → Collega la posta.'); }
  catch {
    openSheet({title: 'Link per un altro dispositivo', small: true,
      body: () => `<p>Copia questo link e incollalo sull’altro dispositivo, in Impostazioni → Fatture dalla posta → Collega la posta. Contiene la chiave: mandalo solo a te stesso.</p><pre class="posta-link">${esc(postaLink(p))}</pre>`});
  }
}
