// Il ponte di Claude (apps-script/claude-ponte.gs) fuori da Google: foglio, proprietà e API di Claude finti.
// Controlla bar e codici, tetto del mese, richiesta a Claude, pulizia dei dati letti, errori e registro delle letture.
const fs = require('fs'), path = require('path');
const {crea} = require('./gs_sandbox');
const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'claude-ponte.gs'), 'utf8');

let fails = 0;
const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };

// --- un foglio di calcolo in memoria ---
function foglio() {
  const sheets = {};
  const mk = name => {
    const rows = [];
    const sh = {
      rows, frozen: 0,
      getDataRange: () => ({getValues: () => rows.map(r => r.slice())}),
      getLastRow: () => rows.length,
      appendRow: r => { rows.push(r.slice()); },
      getRange: (r, c, nr = 1, nc = 1) => ({
        setValues: vs => { for (let i = 0; i < nr; i++) { rows[r - 1 + i] = rows[r - 1 + i] || []; for (let j = 0; j < nc; j++) rows[r - 1 + i][c - 1 + j] = vs[i][j]; } },
        setFontWeight() { return this; }
      }),
      setFrozenRows: n => { sh.frozen = n; }
    };
    sheets[name] = sh; return sh;
  };
  return {sheets, app: {getActiveSpreadsheet: () => ({getSheetByName: n => sheets[n] || null, insertSheet: n => mk(n)}), getUi: () => { throw new Error('niente interfaccia nelle prove'); }}};
}

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
const F = foglio();
const s = crea(src, {now: () => now, SpreadsheetApp: F.app, UrlFetchApp});
const out = r => JSON.parse(r.t);
const get = q => out(s.doGet({parameter: q}));
const post = b => out(s.doPost({postData: {contents: JSON.stringify(b)}}));
const FOTO = 'AAEC/w==';   // base64 qualunque: il ponte non la decodifica, la passa a Claude
const foto = (n = 1, extra = {}) => Array.from({length: n}, () => ({tipo: 'image/jpeg', dati: FOTO, ...extra}));

// fogli e bar
s.prepara();
check(F.sheets.Bar && F.sheets.Letture && F.sheets.Bar.rows[0][1] === 'Codice' && F.sheets.Letture.rows[0][7] === 'Costo stimato ($)' && F.sheets.Bar.frozen === 1, 'prepara: fogli «Bar» e «Letture» con le intestazioni');
F.sheets.Bar.appendRow(['Bar Centrale', 'BF-7KQ3-M9XT', 'sì', 5, 0, '', '']);
F.sheets.Bar.appendRow(['Bar Chiuso', 'BF-AAAA-BBBB', 'no', 200, 0, '', '']);
F.sheets.Bar.appendRow(['Bar Nuovo', 'BF-CCCC-DDDD', '', '', 0, '', '']);

let r = get({});
check(r.ok && r.servizio === 'barista-flow-claude' && r.versione === 1, 'senza codice: il ponte risponde che c’è');
r = get({codice: ' bf-7kq3-m9xt '});
check(r.ok && r.bar === 'Bar Centrale' && r.tetto === 5 && r.rimaste === 5, `codice con spazi e minuscole: ${JSON.stringify(r)}`);
check(get({codice: 'BF-ZZZZ-ZZZZ'}).errore === 'codice' && get({codice: 'x'}).errore === 'codice', 'codice sconosciuto o malformato');
check(get({codice: 'BF-AAAA-BBBB'}).errore === 'sospeso', 'bar con «no» in Attivo: sospeso');
r = get({codice: 'BF-CCCC-DDDD'});
check(r.ok && r.tetto === 200, 'Attivo e Foto al mese vuoti: attivo, con il tetto predefinito di 200');

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

console.log(fails ? `\n${fails} controlli falliti` : '\nPonte di Claude: tutto a posto');
process.exit(fails ? 1 : 0);
