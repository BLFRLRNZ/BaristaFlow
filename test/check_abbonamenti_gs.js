// Abbonamenti nel ponte (apps-script/claude-ponte.gs), fuori da Google: foglio, proprietà, email e attivatori finti.
// Fasi nel tempo (in regola, in scadenza, in ritardo, limitato, sospeso), scelte a mano, prova gratuita, pagamenti,
// interventi, avvisi ai bar, risposta all'app, ultimo contatto, impostazioni, riepilogo per email, colonne dei primi ponti.
const fs = require('fs'), path = require('path');
const {crea, foglioFinto} = require('./gs_sandbox');
const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'claude-ponte.gs'), 'utf8');

let fails = 0;
const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const OWNER = 'ponte.bar@gmail.com';
let now = Date.parse('2026-11-24T10:00:00+01:00');
const al = s => { now = Date.parse(s + 'T10:00:00+01:00'); };
const api = {calls: []};
const UrlFetchApp = {fetch: (url, o) => {
  const body = JSON.parse(o.payload); api.calls.push(body);
  const testo = body.max_tokens === 64 ? 'ok' : JSON.stringify({leggibile: true, prodotto: 'Farina', marca: '', ean: '', lotto: 'L1', scadenza: '2027-01-31', tipoScadenza: 'entro',
    confezionamento: '', quantita: 1, unita: 'kg', ingredienti: '', allergeni: [], tracce: [], conservazione: '', dubbi: []});
  return {getResponseCode: () => 200, getContentText: () => JSON.stringify({type: 'message', stop_reason: 'end_turn', content: [{type: 'text', text: testo}], usage: {input_tokens: 3000, output_tokens: 400}})};
}};

// --- un foglio «Bar» dei primi ponti: sette colonne, «Attivo» al posto di «Servizio» ---
const F = foglioFinto();
const s = crea(src, {now: () => now, SpreadsheetApp: F.app, UrlFetchApp, attivo: () => OWNER, email: OWNER});
const vecchio = F.app.getActiveSpreadsheet().insertSheet('Bar');
vecchio.appendRow(['Bar', 'Codice', 'Attivo', 'Foto al mese', 'Foto nel mese', 'Ultima lettura', 'Note']);
vecchio.appendRow(['Bar Vecchio', 'BF-VECC-HIO2', 'sì', 50, 3, '', 'di prima']);
vecchio.appendRow(['Bar Spento', 'BF-SPEN-TO22', 'no', '', 0, '', '']);
s.props.set('CHIAVE_API', 'sk-ant-api03-prova-0123456789abcdefghij');
const P = (a, d) => s.pannello(a, d || {});
let st = P('stato').stato;
check(F.sheets.Bar.rows[0].length === 17 && F.sheets.Bar.rows[0][2] === 'Servizio' && F.sheets.Bar.rows[0][16] === 'Gratis fino al', 'il foglio «Bar» dei primi ponti prende le colonne nuove');
check(['Pagamenti', 'Interventi', 'Avvisi'].every(n => F.sheets[n] && F.sheets[n].rows[0][0] === 'ID'), 'nascono i fogli «Pagamenti», «Interventi» e «Avvisi»');
const vb = st.bar.find(b => b.codice === 'BF-VECC-HIO2'), sb = st.bar.find(b => b.codice === 'BF-SPEN-TO22');
check(vb.modo === 'automatico' && vb.abb.fase === 'libero' && vb.abb.stato === 'attivo' && vb.tetto === 50 && vb.note === 'di prima' && sb.abb.stato === 'sospeso', 'i bar di prima: «sì» diventa automatico (senza abbonamento, attivo), «no» resta sospeso');
const get = q => JSON.parse(s.doGet({parameter: q}).t);
const post = b => JSON.parse(s.doPost({postData: {contents: JSON.stringify(b)}}).t);
const leggi = c => post({codice: c, foto: [{tipo: 'image/jpeg', dati: 'AAEC/w=='}]});

// --- un cliente con abbonamento mensile ---
let r = P('aggiungi', {nome: 'Bar Aurora', piano: 'mensile', canone: '', inizio: '2026-12-01'});
check(!r.ok && /canone/.test(r.messaggio), 'con un piano serve il canone');
check(!P('aggiungi', {nome: 'X', piano: 'settimanale', canone: '10'}).ok && !P('aggiungi', {nome: 'X', piano: 'mensile', canone: 'tanto'}).ok && !P('aggiungi', {nome: 'X', inizio: '31/12/2026'}).ok, 'piano, canone e date vanno controllati');
r = P('aggiungi', {nome: 'Bar Aurora', piano: 'mensile', canone: '39,90', inizio: '2026-12-01', ragione: 'Aurora s.n.c.', piva: '01234567890', telefono: '0965 123456', email: 'Bar.Aurora@Example.it', referente: 'Anna'});
const A = r.codice, rigaA = () => F.sheets.Bar.rows.find(x => x[1] === A), bA = () => P('stato').stato.bar.find(b => b.codice === A);
check(r.ok && rigaA()[13] === 'mensile' && rigaA()[14] === 39.9 && rigaA()[15] === "'2026-12-01" && rigaA()[8] === "'01234567890" && rigaA()[10] === "'0965 123456", `nel foglio: piano, canone, inizio e partita IVA come testo (${JSON.stringify(rigaA().slice(7))})`);
let b = bA();
check(b.piva === '01234567890' && b.telefono === '0965 123456' && b.email === 'bar.aurora@example.it' && b.ragione === 'Aurora s.n.c.' && b.referente === 'Anna', 'anagrafica riletta com’era (lo zero della partita IVA resta)');
check(b.abb.fase === 'scadenza' && b.abb.coperto === '2026-11-30' && b.abb.entro === '2026-12-01' && b.abb.giorni === -7 && b.abb.primo === true, `prima dell'inizio, senza pagamenti: il primo canone va pagato entro l'inizio (${JSON.stringify(b.abb)})`);
check(b.prossimo.importo === 39.9 && b.prossimo.fino === '2026-12-31', `il prossimo canone copre dicembre (${JSON.stringify(b.prossimo)})`);
r = get({codice: A, app: 'abc123def456'});
check(r.ok && r.lettura && r.servizio.stato === 'attivo' && r.servizio.fase === 'scadenza' && r.servizio.primo && r.servizio.prossimo.fase === 'ritardo' && r.servizio.prossimo.data === '2026-12-02' && r.servizio.entro === '2026-12-01', 'all’app: attivo, primo canone da pagare entro il 1° dicembre, in ritardo dal 2');

// pagamento di dicembre
check(!P('pagamento', {codice: A, importo: '0'}).ok && !P('pagamento', {codice: A, importo: '39,90', metodo: 'assegno'}).ok && !P('pagamento', {codice: 'BF-NONC-ESTE', importo: '10'}).ok, 'pagamento: importo, metodo e cliente vanno controllati');
r = P('pagamento', {codice: A, importo: '39,90', metodo: 'bonifico', fino: '2026-12-31', note: 'CRO 123'});
const pid = r.id;
check(r.ok && /^P-[0-9A-F]{10}$/.test(pid) && F.sheets.Pagamenti.rows.at(-1).join('|') === `${pid}|'2026-11-24|${A}|Bar Aurora|39.9|bonifico|'2026-12-31|CRO 123`, `pagamento nel foglio: ${F.sheets.Pagamenti.rows.at(-1).join('|')}`);
b = bA();
check(b.abb.fase === 'regola' && !b.abb.primo && b.abb.coperto === '2026-12-31' && b.prossimo.fino === '2027-01-31', 'pagato dicembre: in regola, il prossimo copre gennaio');
check(r.stato.pagamenti[0].id === pid && r.stato.pagamenti[0].importo === 39.9 && r.stato.pagamenti[0].data === '2026-11-24', 'il pagamento torna nello stato');

// il tempo passa
const fase = () => { const x = bA().abb; return `${x.fase}/${x.stato}/${x.giorni}${x.prossimo ? '→' + x.prossimo.fase + '@' + x.prossimo.data : ''}`; };
al('2026-12-24'); check(fase() === 'regola/attivo/-8→ritardo@2027-01-02', `24 dicembre: ancora in regola (${fase()})`);
al('2026-12-25'); check(fase() === 'scadenza/attivo/-7→ritardo@2027-01-02', `25 dicembre: in scadenza, sette giorni prima (${fase()})`);
al('2026-12-31'); check(fase() === 'scadenza/attivo/-1→ritardo@2027-01-02', `31 dicembre: ultimo giorno coperto (${fase()})`);
al('2027-01-01'); check(fase() === 'scadenza/attivo/0→ritardo@2027-01-02', `1° gennaio: il rinnovo va pagato oggi, non è ancora ritardo (${fase()})`);
al('2027-01-02'); check(fase() === 'ritardo/attivo/1→limitato@2027-01-12', `2 gennaio: un giorno di ritardo, si limita il 12 (${fase()})`);
check(get({codice: A}).lettura && leggi(A).ok, 'in ritardo la lettura con Claude va ancora');
al('2027-01-11'); check(fase() === 'ritardo/attivo/10→limitato@2027-01-12', `11 gennaio: ultimo giorno di tolleranza (${fase()})`);
al('2027-01-12'); check(fase() === 'limitato/limitato/11→sospeso@2027-02-01', `12 gennaio: limitato, sola lettura dal 1° febbraio (${fase()})`);
let n0 = api.calls.length;
r = get({codice: A});
check(r.ok && !r.lettura && r.servizio.stato === 'limitato' && leggi(A).errore === 'limitato' && api.calls.length === n0, 'limitato: l’app lo sa, e la lettura si ferma prima di chiamare Claude');
al('2027-01-31'); check(fase() === 'limitato/limitato/30→sospeso@2027-02-01', `31 gennaio: ancora limitato (${fase()})`);
al('2027-02-01'); check(fase() === 'sospeso/sospeso/31', `1° febbraio: sospeso (${fase()})`);
check(get({codice: A}).servizio.stato === 'sospeso' && leggi(A).errore === 'sospeso', 'sospeso: all’app lo stato, alla lettura l’errore');
// a mano
P('servizio', {codice: A, modo: 'attivo'});
check(fase() === 'sospeso/attivo/31' && bA().abb.modo === 'attivo' && get({codice: A}).servizio.manuale && leggi(A).ok, 'attivo a mano: vale su tutto, anche sul ritardo');
P('servizio', {codice: A, modo: 'automatico'});
// paga gennaio: torna in regola subito
r = P('pagamento', {codice: A, importo: '39,90', metodo: 'contanti', fino: bA().prossimo.fino});
check(r.ok && fase() === 'scadenza/attivo/0→ritardo@2027-02-02' && get({codice: A}).lettura, `pagato gennaio il 1° febbraio: subito attivo, febbraio da pagare oggi (${fase()})`);
// modificare e togliere un pagamento
r = P('pagamento', {id: pid, codice: A, data: '2026-11-25', importo: '40', metodo: 'carta', fino: '2026-12-31'});
const rp = F.sheets.Pagamenti.rows.find(x => x[0] === pid);
check(r.ok && rp[1] === "'2026-11-25" && rp[4] === 40 && rp[5] === 'carta' && F.sheets.Pagamenti.rows.length === 3, 'pagamento modificato al suo posto');
r = P('togli-pagamento', {id: pid});
check(r.ok && !F.sheets.Pagamenti.rows.some(x => x[0] === pid) && !P('togli-pagamento', {id: pid}).ok, 'pagamento tolto (e una seconda volta non c’è più)');

// prova gratuita
al('2027-02-10');
r = P('aggiungi', {nome: 'Bar Prova', piano: 'trimestrale', canone: '99', inizio: '2027-02-01', prova: '2027-03-15'});
const PR = r.codice, bP = () => P('stato').stato.bar.find(x => x.codice === PR);
check(bP().abb.coperto === '2027-03-15' && bP().abb.fase === 'regola' && bP().prossimo.fino === '2027-06-15', `prova fino al 15 marzo: in regola; il primo trimestre arriva al 15 giugno (${bP().prossimo.fino})`);
al('2027-03-16'); check(bP().abb.fase === 'scadenza' && bP().abb.giorni === 0, 'finita la prova: il primo canone va pagato oggi');
al('2027-03-17'); check(bP().abb.fase === 'ritardo', 'il giorno dopo, senza pagare: in ritardo');
check(get({codice: PR}).servizio.gratis === true && get({codice: A}).servizio.gratis === false, 'all’app: la copertura viene dalla prova gratuita (e per chi paga no)');
r = P('pagamento', {codice: PR, importo: '99', metodo: 'bonifico', fino: bP().prossimo.fino});
check(r.ok && get({codice: PR}).servizio.gratis === false && get({codice: PR}).servizio.fase === 'regola', 'pagato il primo trimestre: non è più la prova');
// annuale e fine mese
al('2027-02-10');
r = P('aggiungi', {nome: 'Bar Anno', piano: 'annuale', canone: '390', inizio: '2027-01-31'});
check(P('stato').stato.bar.find(x => x.codice === r.codice).prossimo.fino === '2028-01-30', 'annuale dal 31 gennaio: coperto fino al 30 gennaio dell’anno dopo');
check(s.piuMesi_('2027-01-31', 1) === '2027-02-28' && s.piuMesi_('2028-01-31', 1) === '2028-02-29' && s.giorni_('2026-12-31', '2027-01-01') === 1 && s.piuGiorni_('2027-03-28', 3) === '2027-03-31', 'conti con le date: fine mese, bisestile, cambio d’anno, ora legale');

// --- interventi ---
check(!P('intervento', {codice: A, descrizione: ''}).ok && !P('intervento', {codice: A, descrizione: 'x', stato: 'regalato'}).ok, 'intervento: serve la descrizione, e lo stato è uno dei tre');
r = P('intervento', {codice: A, descrizione: 'Installazione e formazione', importo: '120', data: '2027-02-01'});
const iid = r.id;
check(r.ok && /^I-/.test(iid) && r.stato.interventi[0].stato === 'da fatturare' && r.stato.interventi[0].importo === 120 && r.stato.interventi[0].bar === 'Bar Aurora', 'intervento da fatturare');
r = P('intervento', {id: iid, codice: A, descrizione: 'Installazione e formazione', importo: '120', data: '2027-02-01', stato: 'pagato'});
check(r.ok && r.stato.interventi.length === 1 && r.stato.interventi[0].stato === 'pagato', 'intervento segnato come pagato');

// --- avvisi ---
r = P('avviso', {testo: 'Domenica 14 aggiornamento: l’app si ricarica da sola.', a: 'tutti', dal: '2027-02-10', al: '2027-02-14'});
const avTutti = r.id;
P('avviso', {testo: 'Ricordati di mandarmi le foto del nuovo menu', a: A, importante: true});
P('avviso', {testo: 'Avviso futuro', a: 'tutti', dal: '2027-03-01'});
check(!P('avviso', {testo: '', a: 'tutti'}).ok && !P('avviso', {testo: 'x', a: 'BF-NONC-ESTE'}).ok && !P('avviso', {testo: 'x', dal: '2027-02-10', al: '2027-02-01'}).ok, 'avviso: testo, destinatario e date vanno controllati');
let av = get({codice: A}).avvisi;
check(av.length === 2 && av.some(x => x.importante && /menu/.test(x.testo)) && av.some(x => /Domenica/.test(x.testo)), 'il bar vede gli avvisi per tutti e quelli per lui, non quelli futuri');
check(get({codice: PR}).avvisi.length === 1, 'un altro bar non vede gli avvisi degli altri');
al('2027-02-15'); check(get({codice: A}).avvisi.length === 1, 'finito il periodo, l’avviso non c’è più');
P('togli-avviso', {id: avTutti}); check(!F.sheets.Avvisi.rows.some(x => x[0] === avTutti), 'avviso tolto');

// --- nuovo codice: pagamenti, interventi e avvisi lo seguono ---
r = P('codice', {codice: A});
const A2 = r.codice;
check(F.sheets.Pagamenti.rows.slice(1).every(x => x[2] !== A) && F.sheets.Pagamenti.rows.some(x => x[2] === A2) && F.sheets.Interventi.rows.some(x => x[2] === A2) && F.sheets.Avvisi.rows.some(x => x[2] === A2), 'col nuovo codice pagamenti, interventi e avvisi restano del cliente');
const bA2 = P('stato').stato.bar.find(x => x.codice === A2);
check(bA2.abb.coperto === '2027-01-31' && get({codice: A2}).avvisi.length === 1, 'abbonamento e avvisi continuano col codice nuovo');

// --- ultimo contatto e versione ---
al('2027-02-15');
get({codice: A2, app: 'v1a2b3c4d5e6'});
let vv = P('stato').stato.bar.find(x => x.codice === A2).visto;
check(vv && vv.v === 'v1a2b3c4d5e6' && vv.t === now, 'il ponte segna quando il bar si è fatto vivo e con quale versione');
const t0 = vv.t; now += 5 * 60000; get({codice: A2, app: 'v1a2b3c4d5e6'});
check(P('stato').stato.bar.find(x => x.codice === A2).visto.t === t0, 'entro dieci minuti non riscrive');
get({codice: A2, app: 'nuova-versione'});
check(P('stato').stato.bar.find(x => x.codice === A2).visto.v === 'nuova-versione', 'con una versione nuova sì');
check(get({codice: A2, app: '<script>'}).ok && !JSON.stringify(P('stato').stato).includes('<script>'), 'la versione si ripulisce');

// --- impostazioni dell'abbonamento ---
check(!P('impostazioni', {limitaDopo: 20, sospendiDopo: 10}).ok && !P('impostazioni', {preavviso: 90}).ok && !P('impostazioni', {cambio: '0'}).ok && !P('impostazioni', {email: 'niente'}).ok, 'impostazioni sbagliate rifiutate');
r = P('impostazioni', {preavviso: '3', limitaDopo: '0', sospendiDopo: '15', contatto: '  Luca ·  333 1234567 ', cambio: '0,9'});
check(r.ok && r.stato.imp.preavviso === 3 && r.stato.imp.limitaDopo === 0 && r.stato.imp.sospendiDopo === 15 && r.stato.imp.contatto === 'Luca · 333 1234567' && r.stato.imp.cambio === 0.9 && r.stato.imp.modello === 'claude-haiku-5-5', 'impostazioni salvate senza toccare le altre');
al('2027-02-10');   // Bar Aurora coperto fino al 31 gennaio: 10 giorni di ritardo
let bb = P('stato').stato.bar.find(x => x.codice === A2).abb;
check(bb.fase === 'ritardo' && bb.prossimo.fase === 'sospeso' && bb.prossimo.data === '2027-02-17', `senza limitazione: dal ritardo si passa alla sospensione il 17 (${JSON.stringify(bb)})`);
check(get({codice: A2}).contatto === 'Luca · 333 1234567', 'all’app anche il tuo contatto');
P('impostazioni', {preavviso: '7', limitaDopo: '10', sospendiDopo: '30'});

// --- riepilogo per email ---
check(!s.triggers.some(t => t.fn === 'riepilogoGiornaliero'), 'senza riepilogo, nessun attivatore');
r = P('impostazioni', {emailAttiva: true, emailOra: '7'});
let tr = s.triggers.filter(t => t.fn === 'riepilogoGiornaliero');
check(r.ok && tr.length === 1 && tr[0].d === 1 && tr[0].h === 7 && tr[0].tz === 'Europe/Rome' && r.stato.riepilogo === 'attivo', 'acceso: un attivatore ogni giorno alle 7, ora italiana');
P('impostazioni', {emailOra: '9'});
tr = s.triggers.filter(t => t.fn === 'riepilogoGiornaliero');
check(tr.length === 1 && tr[0].h === 9, 'cambiata l’ora: sempre uno solo, alle 9');
al('2027-02-10');
s.inviate.length = 0;
s.riepilogoGiornaliero();
let m = s.inviate[0];
check(m && m.to === OWNER && /in ritardo/.test(m.subject) && /Bar Aurora/.test(m.htmlBody) && /da pagare entro il 1\/02\/2027/.test(m.htmlBody) && /si limita il 12\/02\/2027/.test(m.htmlBody) && /0965 123456/.test(m.htmlBody), `il riepilogo del mattino: «${m && m.subject}»`);
check(m.name === 'Barista Flow' && /Bar Aurora/.test(m.body) && !/<b>/.test(m.body), 'con il testo semplice per chi non vede l’HTML');
al('2027-02-12'); s.inviate.length = 0; s.riepilogoGiornaliero();
check(/Cambiano oggi/.test(s.inviate[0].htmlBody) && /senza lettura con Claude/.test(s.inviate[0].htmlBody), 'il giorno in cui un bar si limita, il riepilogo lo dice');
// tutto in regola: niente email, a meno di chiederla sempre
P('pagamento', {codice: A2, importo: '39,90', fino: '2027-06-30'});
for (const x of P('stato').stato.bar.filter(x => x.codice !== A2 && x.piano)) P('elimina', {codice: x.codice});
P('servizio', {codice: 'BF-SPEN-TO22', modo: 'automatico'});
al('2027-03-01'); s.inviate.length = 0; s.riepilogoGiornaliero();
check(s.inviate.length === 0, 'niente da dire: niente email');
P('impostazioni', {emailSempre: true}); s.riepilogoGiornaliero();
check(s.inviate.length === 1 && /tutto in regola/.test(s.inviate[0].subject), 'con «anche quando è tutto in regola» arriva lo stesso');
P('impostazioni', {email: 'Amministrazione@Example.it'}); s.inviate.length = 0;
r = P('riepilogo');
check(r.ok && s.inviate.length === 1 && s.inviate[0].to === 'amministrazione@example.it' && r.a === 'amministrazione@example.it', 'prova del riepilogo, all’indirizzo scelto');
P('impostazioni', {emailAttiva: false});
check(!s.triggers.some(t => t.fn === 'riepilogoGiornaliero') && P('stato').stato.riepilogo === '', 'spento: l’attivatore se ne va');
s.inviate.length = 0; s.riepilogoGiornaliero(); check(s.inviate.length === 0, 'spento: anche se l’attivatore partisse, niente email');

// --- il cliente si modifica tutto insieme ---
r = P('cliente', {codice: A2, nome: 'Bar Aurora', piano: '', canone: '39,90', ragione: 'Aurora s.n.c.', piva: '01234567890', note: '=1+1'});
b = P('stato').stato.bar.find(x => x.codice === A2);
check(r.ok && b.piano === '' && b.canone === 0 && b.abb.fase === 'libero' && b.abb.stato === 'attivo' && F.sheets.Bar.rows.find(x => x[1] === A2)[6] === "'=1+1", 'senza piano: niente abbonamento, sempre attivo; la nota resta testo');
check(!JSON.stringify(P('stato').stato).match(/"\d{4}-\d{2}-\d{2}T/) && !s.pannello('stato').stato.bar.some(x => typeof x.ultima === 'object' && x.ultima), 'nello stato niente date come oggetti');

console.log(fails ? `\n${fails} controlli falliti` : '\nAbbonamenti nel ponte: tutto a posto');
process.exit(fails ? 1 : 0);
