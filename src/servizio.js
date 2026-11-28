/* ---------- abbonamento: il Barista Flow del bar chiede al ponte come sta il suo abbonamento ----------
   Con l'indirizzo del servizio e il codice del bar (gli stessi della lettura con Claude) l'app chiede al ponte, all'avvio
   e ogni ora in cui resta aperta, lo stato dell'abbonamento e gli avvisi di chi gestisce il servizio. L'ultima risposta
   resta in questo browser: senza rete vale quella, e scollegare la lettura non la cancella. Prima della scadenza c'è un
   promemoria in Oggi; limitato si fermano la lettura con Claude e le fatture dalla posta; sospeso l'app va in sola
   lettura, con i dati sempre visibili ed esportabili. Gli avvisi delle scadenze dei prodotti non si fermano mai. */
const SERV = {busy: false, last: 0, timer: 0};
const servCache = () => { try { const x = JSON.parse(lsGet('bf-servizio') || 'null'); return x && typeof x === 'object' && x.servizio ? x : null; } catch { return null; } };
const servStato = () => (S.mode === 'local' && servCache()?.servizio.stato) || 'attivo';
const servLimitato = () => servStato() !== 'attivo';   // limitato o sospeso
const appVersione = () => document.querySelector('meta[name="barista-versione"]')?.content || '';
const avvisiLetti = () => { try { const x = JSON.parse(lsGet('bf-avvisi-letti') || '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };
const servData = iso => {   // 1° dicembre, 31 gennaio 2027
  if (!validIso(iso)) return '';
  const d = new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return d.toLocaleDateString('it-IT', iso.slice(0, 4) === today().slice(0, 4) ? {day: 'numeric', month: 'long'} : {day: 'numeric', month: 'long', year: 'numeric'}).replace(/^1 /, '1° ');
};

/* --- la risposta del ponte --- */
function servSalva(j) {   // null: il ponte non conosce più questo codice
  if (!j) { if (servStato() === 'attivo') lsSet('bf-servizio', ''); }   // via i promemoria; un limite o una sospensione restano finché il bar non mette un codice valido
  else {
    const s = j.servizio && typeof j.servizio === 'object' ? j.servizio : {stato: 'attivo', fase: 'libero'};   // un ponte di prima: niente abbonamenti
    const p = s.prossimo && validIso(s.prossimo.data) ? {fase: String(s.prossimo.fase || ''), data: s.prossimo.data} : null;
    lsSet('bf-servizio', JSON.stringify({
      servizio: {stato: ['attivo', 'limitato', 'sospeso'].includes(s.stato) ? s.stato : 'attivo', fase: String(s.fase || ''), coperto: validIso(s.coperto) ? s.coperto : '',
        entro: validIso(s.entro) ? s.entro : '', giorni: +s.giorni || 0, prossimo: p, primo: !!s.primo, gratis: !!s.gratis, manuale: !!s.manuale},
      avvisi: (Array.isArray(j.avvisi) ? j.avvisi : []).slice(0, 5).map(a => ({id: String(a?.id || '').slice(0, 40), testo: String(a?.testo || '').slice(0, 280), importante: !!a?.importante})).filter(a => a.id && a.testo),
      contatto: String(j.contatto || '').slice(0, 140), t: Date.now()}));
  }
  servApplica();
}
// 'ok', 'codice' (codice cambiato o bar tolto dal ponte), 'rete' (vale l'ultima risposta) o null (niente da chiedere, o già in corso)
async function servCheck(force) {
  const c = claudeCfg();
  if (!claudeOk() || !c?.url || !c?.codice) return null;
  if (!navigator.onLine) return 'rete';
  if (SERV.busy || (!force && Date.now() - SERV.last < 60 * 60e3)) return null;
  SERV.busy = true; SERV.last = Date.now(); bump();   // «Controllo…» sui pulsanti
  try { servSalva(await claudeReq(c)); return 'ok'; }
  catch (e) {
    if (e?.code === 'codice') { servSalva(null); return 'codice'; }
    return 'rete';
  } finally { SERV.busy = false; bump(); }
}
function servApplica() {   // sospeso: sola lettura, come per chi non ha il permesso di scrivere
  const sosp = servStato() === 'sospeso';
  if (sosp && !S.ro) { S.ro = true; S.roServizio = true; }
  else if (!sosp && S.roServizio) { S.ro = false; S.roServizio = false; }
  document.body.classList.toggle('ro', S.ro);
  bump();
}
function servBoot() {   // all'avvio vale subito l'ultima risposta; appena l'archivio è caricato si chiede al ponte
  servApplica();
  let n = 0;
  const t = setInterval(() => { if (allLoaded() || ++n > 80) { clearInterval(t); servCheck(true); } }, 250);
  SERV.timer = setInterval(() => { if (document.visibilityState === 'visible') servCheck(); }, 5 * 60e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') servCheck(); });
}
async function servRicontrolla() {
  const r = await servCheck(true);
  if (r === 'rete') toast(navigator.onLine ? 'Il servizio non risponde: riprova tra poco.' : 'Sei senza connessione: per controllare l’abbonamento serve la rete.', true);
  else if (r === 'codice') toast(claudeErr({code: 'codice'}), true);
  else if (r === 'ok') { const m = servMessaggio(); toast(m ? m.t + '.' : 'Abbonamento in regola.', servLimitato()); }
}

/* --- quello che il bar legge --- */
function servMessaggio() {
  const c = servCache();
  if (!c || S.mode !== 'local') return null;
  const s = c.servizio, d = servData, chi = c.contatto ? `${s.manuale ? 'Per informazioni' : 'Per rinnovare'}: ${c.contatto}.` : 'Senti chi ti ha installato Barista Flow.';
  const poi = s.prossimo?.fase === 'limitato' ? ` Dal ${d(s.prossimo.data)} si fermano la lettura con Claude e le fatture dalla posta.`
    : s.prossimo?.fase === 'sospeso' ? ` Dal ${d(s.prossimo.data)} l’app va in sola lettura.` : '';
  if (s.stato === 'sospeso') return {tono: 'bad', ancora: true, t: 'Barista Flow è in sola lettura',
    d: `${s.manuale ? 'Il servizio è sospeso.' : 'L’abbonamento è scaduto.'} Puoi vedere ed esportare i tuoi dati, ma non registrarne di nuovi. ${chi}`};
  if (s.stato === 'limitato') return {tono: 'bad', ancora: true, t: s.manuale ? 'Servizio limitato' : s.gratis ? 'Prova gratuita finita' : 'Abbonamento scaduto',
    d: `La lettura con Claude e le fatture dalla posta sono ferme.${poi} ${chi}`};
  if (s.manuale) return null;   // attivo per scelta di chi gestisce il servizio
  if (s.fase === 'ritardo') return {tono: 'warn', ancora: true, t: s.gratis ? 'Prova gratuita finita' : 'Abbonamento da rinnovare',
    d: `${s.gratis ? `La prova gratuita è finita il ${d(s.coperto)}.` : `${s.primo ? 'Il primo canone' : 'Il rinnovo'} andava pagato entro il ${d(s.entro)}.`}${poi} ${chi}`};
  if (s.fase === 'scadenza') return {tono: 'warn', t: s.gratis ? 'Prova gratuita in scadenza' : s.primo ? 'Primo canone' : 'Abbonamento in scadenza',
    d: `${s.gratis ? (s.giorni === 0 ? 'La prova gratuita è finita ieri: il primo canone va pagato oggi.' : `La prova gratuita finisce il ${d(s.coperto)}.`)
      : s.primo ? (s.giorni === 0 ? 'Il primo canone va pagato oggi.' : `Il primo canone va pagato entro il ${d(s.entro)}.`)
      : s.giorni === 0 ? 'Il rinnovo va pagato oggi.' : `L’abbonamento è pagato fino al ${d(s.coperto)}.`} ${chi}`};
  return null;
}
// in cima a Oggi: lo stato dell'abbonamento e gli avvisi di chi gestisce il servizio
function servNote() {
  const m = servMessaggio(), c = servCache(), letti = avvisiLetti();
  const av = (c && S.mode === 'local' ? c.avvisi : []).filter(a => !letti.includes(a.id));
  return (m ? `<div class="note serv ${m.tono}" role="status">${m.tono === 'bad' ? IC.alert : IC.clock}<span><b>${esc(m.t)}</b> ${esc(m.d)}${m.ancora
      ? ` <button type="button" class="lnk" data-act="serv-check" ${SERV.busy ? 'disabled' : ''}>${SERV.busy ? 'Controllo…' : 'Controlla di nuovo'}</button>` : ''}</span></div>` : '') +
    av.map(a => `<div class="note avviso${a.importante ? ' bad' : ''}">${a.importante ? IC.alert : IC.info}<span>${esc(a.testo)}</span><button type="button" class="iconbtn x" data-act="avviso-letto" data-id="${esc(a.id)}" aria-label="Ho letto, togli l’avviso">${IC.x}</button></div>`).join('');
}
// in Impostazioni → Lettura con Claude: una riga sull'abbonamento
function servRiga() {
  const c = servCache(); if (!c || S.mode !== 'local') return '';
  const s = c.servizio, m = servMessaggio(), quando = c.t ? ` Controllato ${fmtWhen(c.t)}.` : '';
  if (m) return `<p class="note serv ${m.tono}">${m.tono === 'bad' ? IC.alert : IC.clock}<span><b>${esc(m.t)}</b> ${esc(m.d)}${esc(quando)}</span></p>`;
  if (s.fase === 'regola' && s.coperto) return `<p class="muted">${s.gratis ? 'Prova gratuita' : 'Abbonamento in regola'} fino al ${esc(servData(s.coperto))}.${esc(quando)}</p>`;
  return '';
}
function avvisoLetto(b) {
  const id = b.dataset.id, l = avvisiLetti().filter(x => x !== id);
  l.push(id); lsSet('bf-avvisi-letti', JSON.stringify(l.slice(-50)));
  bump();
}
