// Il ponte di Claude (apps-script/claude-ponte.gs) fuori da Google: foglio, proprietà e API di Claude finti.
// Controlla bar e codici, tetto del mese, richiesta a Claude, pulizia dei dati letti, errori e registro delle letture.
const fs = require('fs'), path = require('path');
const {crea, foglioFinto} = require('./gs_sandbox');
const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'claude-ponte.gs'), 'utf8');

let fails = 0;
const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };

// --- l'API di Claude finta: registra le richieste e risponde come le si dice ---
const api = {calls: [], reply: null};
const UrlFetchApp = {fetch: (url, o) => {
  const body = JSON.parse(o.payload); api.calls.push({url, o, body});
  const r = api.reply(body);
  if (r.throw) throw new Error(r.throw);
  return {getResponseCode: () => r.code, getContentText: () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body))};
}};
const risposta = (dati, extra = {}) => ({code: 200, body: {id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'end_turn',
  content: [{type: 'text', text: typeof dati === 'string' ? dati : JSON.stringify(dati)}], usage: {input_tokens: 5000, output_tokens: 300}, ...extra}});
const BASE = {leggibile: true, prodotto: 'Farina di grano tenero tipo "00"', marca: 'Molino del Borgo', ean: '4006381333931', lotto: 'Lotto: MR-2611A',
  scadenza: '2027-05-31', tipoScadenza: 'Preferibilmente', confezionamento: '2026-11-02', quantita: 25, unita: 'kg',
  ingredienti: 'farina di GRANO tenero tipo 00', allergeni: ['glutine'], tracce: ['soia', 'glutine'], conservazione: 'In luogo fresco e asciutto', dubbi: []};

let now = Date.parse('2026-11-24T10:00:00+01:00');
const OWNER = 'ponte.bar@gmail.com';
let chi = '';   // chi apre la pagina: vuoto come per i bar e per chiunque non sia il proprietario
const ui = {menu: null, dialogo: null, createMenu(n) { const m = {nome: n, voci: [], addItem(a, f) { this.voci.push([a, f]); return this; }, addToUi() { ui.menu = this; }}; return m; },
  showModalDialog(h, titolo) { ui.dialogo = {h, titolo}; }};
const F = foglioFinto(ui);
const s = crea(src, {now: () => now, SpreadsheetApp: F.app, UrlFetchApp, attivo: () => chi, email: OWNER});
const out = r => JSON.parse(r.t);
const get = q => out(s.doGet({parameter: q}));
const post = b => out(s.doPost({postData: {contents: JSON.stringify(b)}}));
const FOTO = 'AAEC/w==';   // base64 qualunque: il ponte non la decodifica, la passa a Claude
const foto = (n = 1, extra = {}) => Array.from({length: n}, () => ({tipo: 'image/jpeg', dati: FOTO, ...extra}));

// fogli e bar
s.prepara_();
check(F.sheets.Bar && F.sheets.Letture && F.sheets.Bar.rows[0][1] === 'Codice' && F.sheets.Letture.rows[0][7] === 'Costo stimato ($)' && F.sheets.Bar.frozen === 1, 'prepara: fogli «Bar» e «Letture» con le intestazioni');
F.sheets.Bar.appendRow(['Bar Centrale', 'BF-7KQ3-M9XT', 'sì', 5, 0, '', '']);
F.sheets.Bar.appendRow(['Bar Chiuso', 'BF-AAAA-BBBB', 'no', 200, 0, '', '']);
F.sheets.Bar.appendRow(['Bar Nuovo', 'BF-CCCC-DDDD', '', '', 0, '', '']);

let r = get({});
check(r.ok && r.servizio === 'barista-flow-claude' && r.versione === 3 && /pannello si apre solo/.test(r.pannello), 'senza codice: il ponte risponde che c’è, e del pannello solo che non è per tutti');
r = get({codice: ' bf-7kq3-m9xt '});
check(r.ok && r.bar === 'Bar Centrale' && r.tetto === 5 && r.rimaste === 5, `codice con spazi e minuscole: ${JSON.stringify(r)}`);
check(get({codice: 'BF-ZZZZ-ZZZZ'}).errore === 'codice' && get({codice: 'x'}).errore === 'codice', 'codice sconosciuto o malformato');
r = get({codice: 'BF-AAAA-BBBB'});
check(r.ok && r.servizio.stato === 'sospeso' && r.servizio.manuale && r.lettura === false, 'bar con «no» nella terza colonna (i bar di prima): sospeso, ma il ponte gli risponde lo stesso');
r = get({codice: 'BF-CCCC-DDDD'});
check(r.ok && r.tetto === 200 && r.lettura === true && r.servizio.stato === 'attivo' && r.servizio.fase === 'libero', 'terza colonna e Foto al mese vuote: attivo, senza abbonamento, con il tetto predefinito di 200');

// senza chiave non si chiama Claude
api.reply = () => risposta(BASE);
r = post({codice: 'BF-7KQ3-M9XT', foto: foto()});
check(r.errore === 'chiave_api' && api.calls.length === 0, 'senza chiave API: errore e nessuna chiamata');
check(/chiave_api/.test(F.sheets.Letture.rows.at(-1)[8]), 'l’errore resta nel registro delle letture');
s.props.set('CHIAVE_API', 'sk-ant-prova-0123456789abcdefghij');

// lettura di lotto e scadenza
r = post({codice: 'BF-7KQ3-M9XT', cosa: 'lotto', foto: foto(2), articolo: 'Farina 00', fornitore: 'Molino del Borgo'});
const c = api.calls.at(-1), b = c.body, cont = b.messages[0].content;
check(c.url === 'https://api.anthropic.com/v1/messages' && c.o.headers['x-api-key'] === 'sk-ant-prova-0123456789abcdefghij' && c.o.headers['anthropic-version'] === '2023-06-01' && c.o.muteHttpExceptions, 'chiamata all’API di Claude con chiave e versione');
check(b.model === 'claude-haiku-5-5' && b.output_config.effort === 'low' && b.output_config.format.type === 'json_schema' && b.max_tokens >= 2000 && !b.thinking, `modello ${b.model}, impegno basso, risposta strutturata`);
const sc = b.output_config.format.schema;
check(sc.additionalProperties === false && sc.required.length === Object.keys(sc.properties).length && sc.required.every(k => sc.properties[k]), 'schema chiuso, tutti i campi obbligatori');
check(cont.length === 3 && cont[0].type === 'image' && cont[1].type === 'image' && cont[0].source.media_type === 'image/jpeg' && cont[0].source.data === FOTO && cont[2].type === 'text', 'prima le due foto, poi il testo');
check(/«Farina 00»/.test(cont[2].text) && /Molino del Borgo/.test(cont[2].text) && /lascia vuoti ingredienti/.test(cont[2].text) && /lotto/i.test(b.system), 'il testo dice articolo, fornitore e cosa serve');
check(r.ok && r.dati.lotto === 'MR-2611A' && r.dati.scadenza === '2027-05-31' && r.dati.tipoScadenza === 'preferibilmente' && r.dati.ean === '4006381333931' && r.dati.quantita === 25 && r.dati.unita === 'kg', `dati letti e puliti: ${JSON.stringify(r.dati)}`);
check(r.dati.ingredienti === '' && r.dati.allergeni.length === 0 && r.dati.tracce.length === 0 && r.dati.conservazione === '', 'per lotto e scadenza niente ingredienti né allergeni');
check(r.rimaste === 3 && r.tetto === 5, `contate 2 foto: ne restano ${r.rimaste}`);
check(F.sheets.Bar.rows[1][4] === 2 && F.sheets.Bar.rows[1][5] instanceof Date, 'nel foglio «Bar»: foto del mese e ultima lettura');
const L = F.sheets.Letture.rows.at(-1);
check(L[1] === 'Bar Centrale' && L[2] === 'BF-7KQ3-M9XT' && L[3] === 'lotto e scadenza' && L[4] === 2 && L[5] === 5000 && L[6] === 300 && Math.abs(L[7] - 0.00065) < 1e-9 && L[8] === 'ok', `registro: ${JSON.stringify(L.slice(1))}`);
check(get({codice: 'BF-7KQ3-M9XT'}).rimaste === 3, 'la prova del collegamento vede le foto rimaste');

// nuovo articolo: tutto, con date, codici e allergeni puliti
api.reply = () => risposta({...BASE, lotto: 'L 23145', scadenza: '31/05/2027', ean: '1234567890123', quantita: .5, unita: 'KG', dubbi: ['Lotto', 'qualcosa']});
r = post({codice: 'BF-7KQ3-M9XT', cosa: 'articolo', foto: foto(1, {tipo: 'image/png'})});
check(r.ok && r.dati.lotto === '23145' && r.dati.scadenza === '' && r.dati.ean === '' && r.dati.quantita === .5 && r.dati.unita === 'kg', `L staccata tolta, data e codice a barre non validi scartati: ${JSON.stringify(r.dati)}`);
check([...r.dati.dubbi].sort().join() === 'ean,lotto,scadenza', `dubbi: quelli di Claude più data e codice scartati (${r.dati.dubbi})`);
check(r.dati.ingredienti === 'farina di GRANO tenero tipo 00' && r.dati.allergeni.join() === 'glutine' && r.dati.tracce.join() === 'soia' && r.dati.conservazione === 'In luogo fresco e asciutto', 'per il nuovo articolo ingredienti, allergeni e tracce (senza ripetere gli allergeni)');
check(/Compila tutti i campi/.test(api.calls.at(-1).body.messages[0].content.at(-1).text) && api.calls.at(-1).body.messages[0].content[0].source.media_type === 'image/png', 'la richiesta chiede tutti i campi; la foto PNG resta PNG');
check(F.sheets.Letture.rows.at(-1)[3] === 'nuovo articolo' && r.rimaste === 2, 'registro e conteggio del nuovo articolo');
api.reply = () => risposta({...BASE, lotto: 'L23145'});
check(post({codice: 'BF-7KQ3-M9XT', foto: foto()}).dati.lotto === 'L23145', 'L attaccata al codice: resta');

// tetto del mese: si ferma prima di chiamare Claude
let n0 = api.calls.length;
r = post({codice: 'BF-7KQ3-M9XT', foto: foto(2)});
check(r.errore === 'tetto' && r.rimaste === 1 && api.calls.length === n0, `tetto: ${JSON.stringify(r)}`);

// foto non accettate
const bar2 = 'BF-CCCC-DDDD';
for (const [f, m] of [[foto(4), 'quattro foto'], [[], 'nessuna foto'], [foto(1, {dati: 'non base64!'}), 'base64 sbagliato'], [foto(1, {tipo: 'image/gif'}), 'GIF'], [foto(1, {dati: 'A'.repeat(6 * 1024 * 1024 + 4)}), 'foto troppo grande']])
  check(post({codice: bar2, foto: f}).errore === 'foto', `foto rifiutata: ${m}`);
check(api.calls.length === n0, 'per le foto rifiutate nessuna chiamata a Claude');
check(out(s.doPost({postData: {contents: '{non json'}})).errore === 'richiesta', 'richiesta non leggibile');
check(post({codice: 'BF-AAAA-BBBB', foto: foto()}).errore === 'sospeso' && api.calls.length === n0, 'bar sospeso: nessuna chiamata');

// errori dell'API: non contano le foto
const uso = () => get({codice: bar2}).usate;
const u0 = uso();
for (const [rep, err] of [[{code: 401, body: {type: 'error', error: {type: 'authentication_error', message: 'invalid x-api-key'}}}, 'chiave_api'],
  [{code: 429, body: {type: 'error', error: {type: 'rate_limit_error', message: 'Too many requests'}}}, 'occupato'],
  [{code: 529, body: {type: 'error', error: {type: 'overloaded_error', message: 'Overloaded'}}}, 'occupato'],
  [{code: 400, body: {type: 'error', error: {type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.'}}}, 'crediti'],
  [{code: 400, body: {type: 'error', error: {type: 'invalid_request_error', message: 'messages.0.content.0.image.source.base64: image exceeds 10 MB maximum'}}}, 'foto'],
  [{code: 400, body: {type: 'error', error: {type: 'invalid_request_error', message: 'Schema is too complex for compilation'}}}, 'claude'],
  [{throw: 'Address unavailable'}, 'occupato']]) {
  api.reply = () => rep;
  r = post({codice: bar2, foto: foto()});
  check(r.errore === err, `API ${rep.code || 'senza rete'}: ${r.errore}`);
}
check(uso() === u0, 'gli errori dell’API non consumano foto');
check(/^crediti · 400 Your credit balance/.test(F.sheets.Letture.rows.find(x => /^crediti/.test(x[8]))[8]), 'nel registro il motivo per esteso');

// risposte di Claude da non usare: le foto contano (i token sono spesi)
api.reply = () => risposta(BASE, {stop_reason: 'refusal', content: [{type: 'text', text: 'Non posso aiutare.'}]});
r = post({codice: bar2, foto: foto()});
check(r.errore === 'rifiuto' && uso() === u0 + 1 && F.sheets.Letture.rows.at(-1)[8] === 'rifiuto', 'rifiuto: errore, foto contata e segnata');
api.reply = () => risposta('niente JSON');
check(post({codice: bar2, foto: foto()}).errore === 'claude' && F.sheets.Letture.rows.at(-1)[8] === 'risposta non leggibile', 'risposta senza JSON');
api.reply = () => risposta(BASE, {stop_reason: 'max_tokens'});
check(post({codice: bar2, foto: foto()}).errore === 'claude' && F.sheets.Letture.rows.at(-1)[8] === 'risposta troncata', 'risposta troncata');
api.reply = () => risposta({...BASE, leggibile: false, lotto: '', scadenza: ''});
r = post({codice: bar2, foto: foto()});
check(r.ok && r.dati.leggibile === false && F.sheets.Letture.rows.at(-1)[8] === 'etichetta non leggibile', 'etichetta illeggibile: la risposta lo dice');

// il mese nuovo riparte da zero
now = Date.parse('2026-12-01T08:00:00+01:00');
r = get({codice: 'BF-7KQ3-M9XT'});
check(r.rimaste === 5 && r.usate === 0, `1° dicembre: di nuovo ${r.rimaste} foto`);
api.reply = () => risposta(BASE);
check(post({codice: 'BF-7KQ3-M9XT', foto: foto()}).rimaste === 4 && JSON.parse(s.props.get('uso|BF-7KQ3-M9XT')).mese === '2026-12', 'una chiave per bar, con il mese');

// la cifra di controllo dei codici a barre
check(s.gtin('4006381333931') && s.gtin('96385074') && s.gtin('036000291452') && !s.gtin('4006381333932') && !s.gtin('12345'), 'cifra di controllo di EAN-13, EAN-8 e UPC');

// ================= il pannello =================
const nega = () => { let e = ''; try { s.pannello('stato'); } catch (x) { e = x.message; } return e; };
const senzaDate = (x, p = 'stato') => { if (x && typeof x === 'object') { if (typeof x.getTime === 'function') return p; for (const k of Object.keys(x)) { const q = senzaDate(x[k], p + '.' + k); if (q) return q; } } return ''; };
const statoPagina = html => JSON.parse(/let ST = (.*?);   \/\/ lo stato/.exec(html)[1]);
chi = '';
check(/si apre solo con l’account Google/.test(nega()) && !s.doGet({parameter: {}}).html, 'pannello: a chi non è riconosciuto né pagina né azioni');
chi = 'qualcuno.altro@gmail.com';
check(/si apre solo/.test(nega()) && !s.doGet({parameter: {}}).html && get({}).servizio === 'barista-flow-claude', 'pannello: un altro account vede solo che il ponte c’è');
chi = ' Ponte.Bar@gmail.com';   // maiuscole e spazi: è sempre il proprietario
const pag = s.doGet({parameter: {}});
check(pag.html && pag.title === 'Barista Flow · Claude' && /width=device-width/.test(pag.metas.viewport), 'proprietario: la pagina del pannello, con titolo e viewport');
check(get({codice: 'BF-7KQ3-M9XT'}).bar === 'Bar Centrale', 'proprietario: con il codice il ponte risponde come ai bar');
const stIn = statoPagina(pag.html);
check(!pag.html.includes('/*STATO*/null') && stIn.bar.length === 3 && stIn.chiave.impostata && stIn.chiave.fine === 'ghij' && !pag.html.includes('sk-ant-prova'), 'la pagina porta già lo stato, con solo le ultime cifre della chiave');
const htmlFile = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'pannello.html'), 'utf8').replace(/\n$/, '');
check(s.PANNELLO === htmlFile, 'la pagina nello script è quella di apps-script/pannello.html (build.py rilanciato)');
let thr = ''; try { s.pannello('cancella-tutto'); } catch (x) { thr = x.message; }
check(/sconosciuta/.test(thr), 'azione sconosciuta: errore');

let st = s.pannello('stato').stato;
check(!senzaDate(st), `nello stato niente date, che google.script.run non passa: ${senzaDate(st) || 'nessuna'}`);
const bc = st.bar.find(b => b.codice === 'BF-7KQ3-M9XT'), bn = st.bar.find(b => b.codice === 'BF-CCCC-DDDD'), bk = st.bar.find(b => b.codice === 'BF-AAAA-BBBB');
check(bc.nome === 'Bar Centrale' && bc.abb.stato === 'attivo' && bc.modo === 'automatico' && bc.tetto === 5 && bc.usate === 1 && typeof bc.ultima === 'number' && bk.abb.stato === 'sospeso' && bk.modo === 'sospeso' && bn.tetto === null, 'stato: bar con tetto, foto del mese, ultima lettura e sospesi');
check(Math.abs(bc.costo - 0.00065) < 1e-9, `stato: costo del mese del bar (${bc.costo} $)`);
// novembre: 7 letture con token spesi (8 foto), da 5000 token in entrata e 300 in uscita l'una
const nov = st.mesi.find(m => m.mese === '2026-11');
check(st.mese === '2026-12' && st.mesi[0].mese === '2026-12' && st.mesi[0].foto === 1 && nov.foto === 8 && nov.letture === 7 && Math.abs(nov.costo - 7 * 0.00065) < 1e-9, `stato: totali mese per mese (${JSON.stringify(st.mesi)})`);
check(st.letture.length === Math.min(30, F.sheets.Letture.rows.length - 1) && st.letture[0].codice === 'BF-7KQ3-M9XT' && st.letture[0].esito === 'ok' && st.letture[0].t > st.letture[1].t, `stato: le ultime letture (${st.letture.length}), dalla più recente`);

for (let i = 0; i < 40; i++) F.sheets.Letture.appendRow([new Date(Date.parse('2026-12-01T09:00:00+01:00') + i * 60000), 'Bar Centrale', 'BF-7KQ3-M9XT', 'lotto e scadenza', 1, 4000, 200, 0.0005, 'ok']);
st = s.pannello('stato').stato;
check(st.letture.length === 30 && st.letture[0].t === Date.parse('2026-12-01T09:39:00+01:00') && s.pannello('letture', {codice: 'BF-7KQ3-M9XT'}).letture.length === 25, 'con un registro lungo: 30 letture nello stato, 25 nella scheda del bar');

// chiave API: si prova prima di salvarla
const prove = () => api.calls.filter(c => c.body.max_tokens === 64);
let rr = s.pannello('chiave', {chiave: 'abc'});
check(!rr.ok && /sk-ant-/.test(rr.messaggio), 'chiave: il formato sbagliato non si prova nemmeno');
api.reply = b => b.max_tokens === 64 ? {code: 401, body: {type: 'error', error: {type: 'authentication_error', message: 'invalid x-api-key'}}} : risposta(BASE);
rr = s.pannello('chiave', {chiave: ' sk-ant-api03-NUOVA-rifiutata-0000000000 \n'});
check(!rr.ok && /non accetta/.test(rr.messaggio) && s.props.get('CHIAVE_API') === 'sk-ant-prova-0123456789abcdefghij', 'chiave rifiutata da Claude: non si salva, resta quella di prima');
check(prove().at(-1).o.headers['x-api-key'] === 'sk-ant-api03-NUOVA-rifiutata-0000000000', 'la prova usa la chiave nuova, senza spazi né a capo');
api.reply = b => b.max_tokens === 64 ? {code: 400, body: {type: 'error', error: {type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.'}}} : risposta(BASE);
rr = s.pannello('chiave', {chiave: 'sk-ant-api03-SENZA-crediti-000000000000'});
check(rr.ok && rr.prova.errore === 'crediti' && s.props.get('CHIAVE_API') === 'sk-ant-api03-SENZA-crediti-000000000000' && rr.stato.chiave.fine === '0000', 'chiave giusta ma senza crediti: si salva e la prova lo dice');
api.reply = b => b.max_tokens === 64 ? risposta('ok') : risposta(BASE);
rr = s.pannello('chiave', {chiave: 'sk-ant-api03-BUONA-abcdefghijklmnop-WXYZ'});
check(rr.ok && rr.prova.ok && rr.prova.modello === 'claude-haiku-5-5' && rr.stato.chiave.fine === 'WXYZ', 'chiave buona: provata e salvata');
check(prove().at(-1).body.model === 'claude-haiku-5-5' && prove().at(-1).body.messages.length === 1, 'la prova è una richiesta piccola al modello impostato');
rr = s.pannello('prova');
check(rr.ok && rr.prova.ok && prove().at(-1).o.headers['x-api-key'] === 'sk-ant-api03-BUONA-abcdefghijklmnop-WXYZ', 'Prova: la chiave salvata risponde');

// impostazioni
rr = s.pannello('impostazioni', {modello: 'gpt-4'});
check(!rr.ok && /claude-haiku-5-5/.test(rr.messaggio), 'impostazioni: un modello che non è di Claude');
api.reply = b => b.model === 'claude-inesistente-9' ? {code: 404, body: {type: 'error', error: {type: 'not_found_error', message: 'model: claude-inesistente-9'}}} : b.max_tokens === 64 ? risposta('ok') : risposta(BASE);
rr = s.pannello('impostazioni', {modello: 'claude-inesistente-9'});
check(!rr.ok && /non conosce il modello/.test(rr.messaggio) && s.imp_().modello === 'claude-haiku-5-5', 'un modello che Claude non conosce non si salva');
for (const [d, m] of [[{impegno: 'massimo'}, 'impegno'], [{prezzoEntrata: '-1'}, 'prezzo negativo'], [{prezzoUscita: 'tanto'}, 'prezzo non numerico'], [{tetto: '0'}, 'tetto zero'], [{tetto: '12,5'}, 'tetto non intero']])
  check(!s.pannello('impostazioni', d).ok, `impostazioni rifiutate: ${m}`);
rr = s.pannello('impostazioni', {modello: 'Claude-Sonnet-5-5', impegno: 'medium', prezzoEntrata: '0,30', prezzoUscita: '1.5', tetto: '150'});
check(rr.ok && !rr.avviso && rr.stato.imp.modello === 'claude-sonnet-5-5' && rr.stato.imp.impegno === 'medium' && rr.stato.imp.prezzoEntrata === 0.3 && rr.stato.imp.prezzoUscita === 1.5 && rr.stato.imp.tetto === 150, `impostazioni salvate: ${JSON.stringify(rr.stato && rr.stato.imp)}`);
check(api.calls.at(-1).body.model === 'claude-sonnet-5-5' && api.calls.at(-1).body.max_tokens === 64, 'il modello nuovo si prova prima di salvarlo');
check(get({codice: 'BF-CCCC-DDDD'}).tetto === 150, 'il tetto predefinito nuovo vale per i bar senza un tetto loro');
api.reply = () => risposta(BASE);
r = post({codice: 'BF-CCCC-DDDD', foto: foto()});
check(r.ok && api.calls.at(-1).body.model === 'claude-sonnet-5-5' && api.calls.at(-1).body.output_config.effort === 'medium', 'le letture usano modello e impegno delle impostazioni');
check(Math.abs(F.sheets.Letture.rows.at(-1)[7] - (5000 * 0.3 + 300 * 1.5) / 1e6) < 1e-9, `costo stimato con i prezzi nuovi: ${F.sheets.Letture.rows.at(-1)[7]} $`);
api.reply = () => {
  throw new Error('nessuna chiamata a Claude per l’indirizzo');
};
const ID = 'AKfycbx0123456789abcdefghijklmnopqrstuvwxyz_-ABCDEFG';
for (const [u, m] of [[`https://script.google.com/macros/s/${ID}/dev`, 'indirizzo di prova /dev'], ['https://example.com/macros/s/xyz/exec', 'un altro sito'], ['ciao', 'non è un indirizzo']]) {
  rr = s.pannello('impostazioni', {indirizzo: u});
  check(!rr.ok, `indirizzo rifiutato: ${m} («${rr.messaggio}»)`);
}
check(/finisce con \/exec/.test(s.pannello('impostazioni', {indirizzo: `https://script.google.com/macros/s/${ID}/dev`}).messaggio), 'per /dev dice di usare quello con /exec');
rr = s.pannello('impostazioni', {indirizzo: ` https://script.google.com/macros/u/1/s/${ID}/exec?authuser=1 `});
check(rr.ok && rr.stato.imp.indirizzo === `https://script.google.com/macros/s/${ID}/exec`, 'indirizzo ripulito da account (/u/1/) e parametri');
rr = s.pannello('impostazioni', {indirizzo: `https://script.google.com/a/macros/bar.it/s/${ID}/exec`});
check(rr.ok && rr.stato.imp.indirizzo === `https://script.google.com/a/macros/bar.it/s/${ID}/exec`, 'indirizzo di un account Google Workspace');
check(s.imp_().modello === 'claude-sonnet-5-5' && s.imp_().tetto === 150, 'salvare l’indirizzo non tocca le altre impostazioni');
s.pannello('impostazioni', {indirizzo: `https://script.google.com/macros/s/${ID}/exec`});
api.reply = () => risposta(BASE);

// bar: aggiungere, modificare, sospendere, nuovo codice, eliminare
const nBar = () => F.sheets.Bar.rows.length - 1, riga = c => F.sheets.Bar.rows.find(x => x[1] === c);
check(!s.pannello('aggiungi', {nome: '  '}).ok && !s.pannello('aggiungi', {nome: 'X', tetto: 'tanti'}).ok && nBar() === 3, 'nuovo bar: serve il nome, e il tetto è un numero');
rr = s.pannello('aggiungi', {nome: '  Caffè   Roma ', note: 'Sig. Rossi'});
const cR = rr.codice, rigaR = F.sheets.Bar.rows.at(-1);
check(rr.ok && /^BF-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(cR) && rigaR[0] === 'Caffè Roma' && rigaR[1] === cR && rigaR[2] === 'automatico' && rigaR[3] === '' && rigaR[6] === 'Sig. Rossi' && rigaR.length === 17, `nuovo bar nel foglio: ${JSON.stringify(rigaR)}`);
check(rr.stato.bar.some(b => b.codice === cR && b.usate === 0 && b.tetto === null) && get({codice: cR}).tetto === 150, 'il codice nuovo vale subito, con il tetto predefinito');
rr = s.pannello('aggiungi', {nome: '=SOMMA(1;2)', tetto: '40'});
check(F.sheets.Bar.rows.at(-1)[0] === "'=SOMMA(1;2)" && F.sheets.Bar.rows.at(-1)[3] === 40, 'un nome che comincia con = resta testo, non diventa una formula');
rr = s.pannello('cliente', {codice: cR.toLowerCase(), nome: 'Caffè Roma 2', tetto: '3', note: ''});
check(rr.ok && riga(cR)[0] === 'Caffè Roma 2' && riga(cR)[3] === 3 && riga(cR)[6] === '', 'modifica: nome, tetto e note (anche col codice in minuscolo)');
check(!s.pannello('cliente', {codice: cR, nome: ''}).ok && /non c’è più/.test(s.pannello('cliente', {codice: 'BF-NONC-ESTE', nome: 'x'}).messaggio), 'modifica: nome vuoto, o bar che non c’è più');
s.pannello('cliente', {codice: cR, nome: 'Caffè Roma', tetto: '', note: 'Sig. Rossi'});
check(riga(cR)[3] === '' && get({codice: cR}).tetto === 150, 'tetto tolto: torna il predefinito');
s.pannello('cliente', {codice: cR, nome: 'Caffè Roma', tetto: '3', note: 'Sig. Rossi'});
check(!s.pannello('servizio', {codice: cR, modo: 'spento'}).ok, 'servizio: solo automatico, attivo, limitato o sospeso');
rr = s.pannello('servizio', {codice: cR, modo: 'sospeso'});
check(rr.ok && riga(cR)[2] === 'sospeso' && get({codice: cR}).servizio.stato === 'sospeso' && post({codice: cR, foto: foto()}).errore === 'sospeso' && rr.stato.bar.find(b => b.codice === cR).abb.stato === 'sospeso', 'sospeso dal pannello: il bar non legge');
rr = s.pannello('servizio', {codice: cR, modo: 'limitato'});
check(get({codice: cR}).lettura === false && post({codice: cR, foto: foto()}).errore === 'limitato', 'limitato: niente lettura con Claude, con il suo errore');
s.pannello('servizio', {codice: cR, modo: 'automatico'});
check(riga(cR)[2] === 'automatico' && get({codice: cR}).lettura === true, 'di nuovo automatico: legge');
r = post({codice: cR, foto: foto(2)});
check(r.ok && r.rimaste === 1, 'il bar nuovo legge: 2 foto su 3');
const uR = JSON.parse(s.props.get('uso|' + cR));
rr = s.pannello('codice', {codice: cR});
const cR2 = rr.codice;
check(rr.ok && cR2 !== cR && riga(cR2) && !riga(cR), 'nuovo codice nella riga, al posto del vecchio');
check(get({codice: cR}).errore === 'codice' && get({codice: cR2}).usate === 2 && s.props.get('uso|' + cR) == null && JSON.parse(s.props.get('uso|' + cR2)).costo === uR.costo, 'il vecchio codice non vale più; foto e costo del mese passano al nuovo');
post({codice: cR2, foto: foto()});
rr = s.pannello('codice', {codice: cR2});
const cR3 = rr.codice;
rr = s.pannello('letture', {codice: cR3});
check(rr.ok && rr.letture.length === 2 && rr.letture[0].codice === cR2 && rr.letture[1].codice === cR, 'le letture del bar comprendono quelle fatte con i codici di prima');
rr = s.pannello('letture', {codice: 'BF-7KQ3-M9XT'});
check(rr.ok && rr.letture.length === Math.min(25, F.sheets.Letture.rows.filter(x => x[2] === 'BF-7KQ3-M9XT').length) && rr.letture.every(x => x.codice === 'BF-7KQ3-M9XT'), `letture di un solo bar (${rr.letture.length})`);
// una lettura partita prima che un bar sopra venga tolto: il conteggio va comunque nella riga giusta
const bN = s.trovaBar('BF-CCCC-DDDD'), primaR = riga(cR3)[4];
rr = s.pannello('elimina', {codice: 'BF-AAAA-BBBB'});
check(rr.ok && !riga('BF-AAAA-BBBB') && nBar() === 4 && get({codice: 'BF-AAAA-BBBB'}).errore === 'codice', 'eliminato: sparisce dal foglio e il codice non vale più');
s.conta(bN, 1, 0.001);
check(riga('BF-CCCC-DDDD')[4] === s.usate('BF-CCCC-DDDD') && riga(cR3)[4] === primaR, 'la riga si ritrova dal codice: il conteggio non finisce sul bar sbagliato');
rr = s.pannello('elimina', {codice: cR3});
check(rr.ok && !riga(cR3) && s.props.get('uso|' + cR3) == null && s.props.get('prima|' + cR3) == null && F.sheets.Letture.rows.filter(x => x[2] === cR || x[2] === cR2).length === 2, 'eliminato con le sue proprietà; le letture restano nel registro');
check(!s.pannello('elimina', {codice: cR3}).ok, 'eliminare due volte: il bar non c’è più');
s.pannello('aggiungi', {nome: '</script><script>alert(1)</script>'});
const pag2 = s.doGet({parameter: {}}).html;
check(!pag2.includes('</script><script>alert(1)') && statoPagina(pag2).bar.some(b => b.nome === '</script><script>alert(1)</script>'), 'un nome con </script> non rompe la pagina e torna intero');
check(!senzaDate(s.pannello('stato').stato), 'dopo tutte le azioni, ancora nessuna data nello stato');

// il menu del foglio
s.onOpen();
check(ui.menu && ui.menu.nome === 'Barista Flow' && ui.menu.voci.length === 1 && ui.menu.voci[0][1] === 'apriPannello', 'menu del foglio: Apri il pannello');
s.apriPannello();
check(ui.dialogo && ui.dialogo.h.w === 480 && /^<!DOCTYPE html>/.test(ui.dialogo.h.html) && ui.dialogo.titolo === 'Barista Flow · Claude', 'dal foglio il pannello si apre in una finestra');

console.log(fails ? `\n${fails} controlli falliti` : '\nPonte di Claude: tutto a posto');
process.exit(fails ? 1 : 0);
