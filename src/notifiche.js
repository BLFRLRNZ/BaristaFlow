/* ---------- notifiche sul telefono ----------
   L'app manda allo script di Google un riepilogo (lotti con la scadenza, articoli da riordinare) quando i dati cambiano;
   lo script, anche con l'app chiusa, ogni mattina all'ora scelta manda la notifica (Web Push) ai dispositivi iscritti. */
const NOTIF = {busy: false, syncing: false, t: 0};
const NOTIF_ORE = ['05:00', '05:30', '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '11:00', '12:00', '15:00', '18:00', '21:00'];
const NOTIF_TEMI = [['scadenze', 'Lotti scaduti e in scadenza'], ['scorte', 'Articoli da riordinare'], ['fatture', 'Fatture arrivate dalla posta']];
const notifCfg = () => postaCfg()?.notifiche || {};
const notifTemi = () => ({scadenze: true, scorte: true, fatture: true, ...(notifCfg().temi || {})});
const notifFuso = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome'; } catch { return 'Europe/Rome'; } };
const notifIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const notifDispositivo = () => notifIos() ? 'iPhone o iPad' : /Android/i.test(navigator.userAgent) ? 'Android' : 'Computer';
const nErr = msg => Object.assign(new Error(msg), {msg});
function notifSupporto() {
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (notifIos() && !standalone) return {ok: false, msg: 'Su iPhone le notifiche arrivano solo dall’app sulla schermata Home: in Safari tocca Condividi, poi «Aggiungi alla schermata Home», e apri Barista Flow da lì.'};
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return {ok: false, msg: 'Questo browser non riceve notifiche: usa Chrome su Android o l’app sulla schermata Home dell’iPhone.'};
  if (Notification.permission === 'denied') return {ok: false, msg: 'Le notifiche sono bloccate per Barista Flow: riattivale nelle impostazioni del telefono, alla voce Notifiche.'};
  return {ok: true};
}
async function notifSalva(patch) {
  const p = postaCfg(); if (!p) return false;
  return put('impostazioni', 'posta', {...strip(p), notifiche: {...(p.notifiche || {}), ...patch}}, true);
}
function notifHash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); }
async function swPronto() {
  if (!('serviceWorker' in navigator)) throw nErr('Questo browser non riceve notifiche.');
  return Promise.race([navigator.serviceWorker.ready, sleep(8000).then(() => { throw nErr('Il servizio dell’app non è ancora attivo: chiudi e riapri Barista Flow, poi riprova.'); })]);
}
const b64uBytes = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(s).length / 4) * 4, '=')), c => c.charCodeAt(0));

/* --- riepilogo per lo script: lotti con scadenza nei prossimi 30 giorni (o già scaduti) e articoli sotto scorta --- */
function notifRiepilogo() {
  const Dd = drv(), lim = addDays(today(), 30), ord = (a, b) => a.s.localeCompare(b.s) || a.n.localeCompare(b.n);
  const tutti = [...Dd.acq.values(), ...Dd.prod.values()].filter(l => l.res > EPS && l.scad && l.scad <= lim);
  const lotti = tutti.filter(l => !l.vetrina).map(l => ({n: lotName(l), s: l.scad})).sort(ord).slice(0, 400);
  // scarico delle vendite spento: i lotti in vetrina a parte, perché dopo la scadenza vanno in archivio e non sono
  // mai «da smaltire» (lo script li avvisa solo prima; uno script vecchio li ignora)
  const vetrina = tutti.filter(l => l.vetrina).map(l => ({n: lotName(l), s: l.scad})).sort(ord).slice(0, 200);
  const scorte = [...S.data.articoli.values()].filter(a => !a.archiviato && !soloAcquisti(a) && +a.scortaMin > 0 && artStock(a.id).usable < +a.scortaMin)
    .map(a => ({n: a.nome})).sort((a, b) => a.n.localeCompare(b.n)).slice(0, 200);
  return {lotti, scorte, giorni: cfg().giorniAvviso, ...(vetrina.length ? {vetrina} : {})};
}
async function notifSync(force) {
  const n = notifCfg(), p = postaCfg();
  if (!postaOn() || !n.attive || !allLoaded() || NOTIF.syncing || (S.ro && !S.roServizio)) return false;   // sospeso: gli avvisi delle scadenze continuano
  const stato = notifRiepilogo(), body = {op: 'stato', stato, ora: n.ora || '08:00', fuso: notifFuso(), temi: notifTemi(), origine: location.origin};
  const hash = notifHash(JSON.stringify([stato, body.ora, body.fuso, body.temi]));
  if (!force && hash === n.hash) return false;
  NOTIF.syncing = true;
  try { const j = await postaReq(p, null, body); await notifSalva({hash, inviato: Date.now(), errore: '', versione: +j.versione || 0}); return true; }
  catch (e) { await notifSalva({errore: postaErr(e)}); return false; }
  finally { NOTIF.syncing = false; }
}
function notifSoon() { clearTimeout(NOTIF.t); NOTIF.t = setTimeout(() => notifSync(), 4000); }   // dopo ogni modifica, a riposo

/* --- attivare, provare, disattivare --- */
async function notifAttiva() {
  if (!guard() || NOTIF.busy) return;
  const sup = notifSupporto();
  if (!postaOn() || !sup.ok) { toast(sup.msg || 'Collega prima lo script di Google.', true); return; }
  NOTIF.busy = true; renderMain();
  try {
    // il permesso va chiesto subito, dentro il tocco sul pulsante (iPhone)
    if ((await Notification.requestPermission()) !== 'granted') throw nErr('Senza il permesso il telefono non mostra le notifiche: quando te lo chiede, tocca «Consenti».');
    const p = postaCfg(), j = await postaFetch(p, {op: 'vapid'});
    if (!j.pub) throw nErr('Lo script di Google è di una versione precedente: copia di nuovo lo script da «Fatture dalla posta», incollalo e pubblica una nuova versione.');
    const reg = await swPronto(), key = b64uBytes(j.pub);
    let sub = await reg.pushManager.getSubscription();
    const old = sub?.options?.applicationServerKey;
    if (sub && (!old || new Uint8Array(old).join() !== key.join())) { await sub.unsubscribe().catch(() => false); sub = null; }
    sub = sub || await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: key});
    const n = notifCfg(), ora = n.ora || '08:00';
    await postaReq(p, null, {op: 'iscrivi', sub: sub.toJSON(), ora, fuso: notifFuso(), temi: notifTemi(), da: notifDispositivo(), origine: location.origin});
    await notifSalva({attive: true, ora, endpoint: sub.endpoint, hash: '', errore: ''});
    await notifSync(true);
    toast(`Notifiche attive: ogni giorno dalle ${ora}. Prova a mandarne una.`);
  } catch (e) { toast(e.msg || postaErr(e), true); }
  finally { NOTIF.busy = false; bump(); }
}
async function notifProva() {
  if (NOTIF.busy) return;
  NOTIF.busy = true; renderMain();
  try {
    await notifSync();
    const j = await postaReq(postaCfg(), null, {op: 'prova-notifica'});
    if (j.inviate) toast(j.inviate === 1 ? 'Notifica di prova inviata: arriva tra pochi secondi.' : `Notifica di prova inviata a ${j.inviate} dispositivi.`);
    else toast(`Il servizio delle notifiche l’ha rifiutata (codice ${(j.esiti || []).join(', ')}): disattiva e riattiva le notifiche.`, true);
  } catch (e) { toast(e.code === 'nessun dispositivo iscritto' ? 'Nessun dispositivo iscritto: disattiva e riattiva le notifiche.' : postaErr(e), true); }
  finally { NOTIF.busy = false; bump(); }
}
async function notifSpegni() {   // senza domande: anche quando si scollega lo script
  const p = postaCfg(), n = notifCfg();
  try { const reg = await swPronto(), sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch { /* già spento */ }
  try { if (p?.url && n.endpoint) await postaReq(p, null, {op: 'disiscrivi', endpoint: n.endpoint}); } catch { /* lo script lo toglie al primo invio fallito */ }
  if (p) await notifSalva({attive: false, endpoint: '', hash: ''});
}
async function notifDisattiva() {
  if (!(await ask('Disattivo le notifiche su questo dispositivo?', 'Disattiva', true))) return;
  await notifSpegni(); toast('Notifiche disattivate su questo dispositivo.');
}
function notifImposta(k, v) {
  const n = notifCfg();
  if (k === 'ora' && NOTIF_ORE.includes(v)) notifSalva({ora: v}).then(() => notifSync(true));
  else if (NOTIF_TEMI.some(t => t[0] === k)) notifSalva({temi: {...notifTemi(), [k]: !!v}}).then(() => notifSync(true));
  if (n.attive) toast('Salvato: vale dalla prossima notifica.');
}

/* --- Impostazioni --- */
function notifCard() {
  if (S.ro) return '';
  const head = '<div class="setgrp" id="notifiche"><h2>Notifiche sul telefono</h2><div class="card">', end = '</div></div>';
  const cosa = 'Ogni giorno, all’ora che scegli, una notifica con i lotti scaduti o in scadenza e gli articoli da riordinare, anche quando l’app è chiusa. Se vuoi, anche quando arriva una fattura dalla posta.';
  if (!postaOk()) return `${head}<p class="muted">${cosa} Funziona dall’app pubblicata sul tuo sito (GitHub Pages) e installata sulla schermata Home.</p>${end}`;
  if (!postaOn()) return `${head}<p>${cosa}</p><p class="muted">Le notifiche partono dallo stesso script di Google delle fatture dalla posta: collegalo prima.</p><button type="button" class="btn w" data-act="posta-setup">${IC.mail}Collega lo script di Google</button>${end}`;
  const n = notifCfg(), sup = notifSupporto(), on = !!n.attive && sup.ok, t = notifTemi();
  if (!sup.ok) return `${head}<p>${cosa}</p><p class="note warn">${IC.info}<span>${esc(sup.msg)}</span></p>${end}`;
  const scelte = `<div class="g2"><label class="fld"><span>Ogni giorno dalle</span><select data-notif="ora">${NOTIF_ORE.map(o => `<option ${o === (n.ora || '08:00') ? 'selected' : ''}>${o}</option>`).join('')}</select></label></div>
    <div class="notif-temi">${NOTIF_TEMI.map(([k, l]) => `<label class="chk"><input type="checkbox" data-notif="${k}" ${t[k] ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
  if (!on) return `${head}<p>${cosa}</p>${scelte}<button type="button" class="btn pri w" data-act="notif-on" ${NOTIF.busy ? 'disabled' : ''}>${NOTIF.busy ? 'Attivo…' : 'Attiva le notifiche'}</button>
    <p class="hint" style="margin-top:10px">Il telefono ti chiede il permesso: tocca «Consenti».</p>${end}`;
  // con lo scarico delle vendite spento, le scadenze dei lotti in vetrina servono allo script dalla versione 3
  const vecchio = !vendite() && n.inviato && (+n.versione || 0) < 3;
  return `${head}<p><b>Attive su questo dispositivo.</b> ${cosa}</p>${scelte}
    ${n.errore ? `<p class="note warn">${IC.alert}<span>${esc(n.errore)}</span></p>` : ''}
    ${vecchio ? `<p class="note warn">${IC.info}<span>Per avere nelle notifiche anche le scadenze dei lotti di produzione, aggiorna lo script di Google: copialo di nuovo da «Fatture dalla posta» (Lo script c’è già? Come aggiornarlo).</span></p>` : ''}
    <div class="acts"><button type="button" class="btn" data-act="notif-prova" ${NOTIF.busy ? 'disabled' : ''}>Manda una notifica di prova</button><button type="button" class="btn dan" data-act="notif-off">Disattiva</button></div>
    <p class="hint" style="margin-top:10px">${n.inviato ? `Scadenze e scorte aggiornate nello script ${esc(fmtWhen(n.inviato))}: l’app le aggiorna da sola quando la usi.` : 'L’app aggiorna scadenze e scorte nello script da sola quando la usi.'}</p>${end}`;
}
