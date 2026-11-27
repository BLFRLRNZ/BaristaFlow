/*
 * Barista Flow · lettura con Claude (il ponte)
 *
 * Questo script sta nel tuo account Google, dentro un foglio che ti fa da pannello:
 * - custodisce la chiave API di Claude: i bar non la vedono mai;
 * - riconosce ogni bar dal suo codice (foglio «Bar») e gli conta le foto del mese;
 * - manda le foto a Claude Haiku e restituisce all'app lotto, scadenza e gli altri dati letti;
 * - segna ogni lettura nel foglio «Letture», con i token e il costo stimato.
 * Come si installa: README di Barista Flow, sezione «Lettura con Claude».
 */

var MODELLO = 'claude-haiku-5-5';
var IMPEGNO = 'low';                                // effort di Claude: low, medium o high
var PREZZO_ENTRATA = 0.10, PREZZO_USCITA = 0.50;    // dollari per milione di token (richieste fino a 100.000 token)
var TETTO = 200;                                    // foto al mese per bar, se nella sua riga non ne scrivi altre
var MAX_FOTO = 3;                                   // foto per lettura: fronte, retro, timbro
var MAX_BASE64 = 6 * 1024 * 1024;                   // grandezza massima di una foto, già in base64
var FUSO = 'Europe/Rome';
var VERSIONE = 1;

var FOGLIO_BAR = 'Bar', FOGLIO_LETTURE = 'Letture';
var TESTA_BAR = ['Bar', 'Codice', 'Attivo', 'Foto al mese', 'Foto nel mese', 'Ultima lettura', 'Note'];
var TESTA_LETTURE = ['Data e ora', 'Bar', 'Codice', 'Cosa', 'Foto', 'Token in entrata', 'Token in uscita', 'Costo stimato ($)', 'Esito'];
var ALLERGENI = ['glutine', 'crostacei', 'uova', 'pesce', 'arachidi', 'soia', 'latte', 'frutta_guscio', 'sedano', 'senape', 'sesamo', 'solfiti', 'lupini', 'molluschi'];
var CAMPI_DUBBI = ['prodotto', 'ean', 'lotto', 'scadenza', 'confezionamento', 'quantita', 'ingredienti', 'allergeni'];

/* ---------- menu del foglio ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Barista Flow')
    .addItem('Prepara i fogli', 'prepara')
    .addItem('Imposta la chiave API', 'impostaChiave')
    .addItem('Prova la chiave API', 'provaChiave')
    .addSeparator()
    .addItem('Aggiungi un bar', 'aggiungiBar')
    .addToUi();
}
function prepara() {
  foglio(FOGLIO_BAR, TESTA_BAR); foglio(FOGLIO_LETTURE, TESTA_LETTURE);
  avvisa('Fogli pronti.' + (chiave() ? '' : ' Ora imposta la chiave API dal menu Barista Flow.'));
}
function impostaChiave() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Chiave API di Claude', 'Incollala qui. La crei su platform.claude.com, in Impostazioni → Chiavi API. Resta nelle proprietà dello script, non nel foglio.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var k = String(r.getResponseText() || '').trim();
  if (!/^sk-ant-\S{20,}$/.test(k)) { ui.alert('Non sembra una chiave di Claude: comincia con sk-ant-.'); return; }
  PropertiesService.getScriptProperties().setProperty('CHIAVE_API', k);
  ui.alert('Chiave salvata. Provala dal menu Barista Flow → Prova la chiave API.');
}
function provaChiave() {
  var r = chiama({model: MODELLO, max_tokens: 64, thinking: {type: 'disabled'}, output_config: {effort: 'low'}, messages: [{role: 'user', content: 'Rispondi solo: ok'}]});
  avvisa(r.ok ? 'La chiave funziona: ' + MODELLO + ' risponde.' : 'Non funziona (' + r.errore + '): ' + (r.messaggio || ''));
}
function aggiungiBar() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Nuovo bar', 'Nome del bar:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var nome = String(r.getResponseText() || '').trim(); if (!nome) return;
  var codice = nuovoCodice();
  foglio(FOGLIO_BAR, TESTA_BAR).appendRow([nome, codice, 'sì', TETTO, 0, '', '']);
  ui.alert('Codice di «' + nome + '»: ' + codice + '\n\nNel Barista Flow del bar: Impostazioni → Lettura con Claude, con l’URL dell’app web di questo script e questo codice.');
}

/* ---------- richieste dell'app ---------- */
// GET ?codice=… prova il collegamento e dice quante foto restano; senza codice risponde solo che il ponte c'è.
// POST (testo JSON): {codice, cosa: 'lotto' | 'articolo', foto: [{tipo, dati}], articolo, fornitore} legge l'etichetta.
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.codice) return json({ok: true, servizio: 'barista-flow-claude', versione: VERSIONE});
  var b = trovaBar(p.codice);
  if (b.errore) return json({ok: false, errore: b.errore});
  return json({ok: true, bar: b.nome, tetto: b.tetto, usate: b.usate, rimaste: Math.max(0, b.tetto - b.usate), versione: VERSIONE});
}
function doPost(e) {
  var p;
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}') || {}; } catch (err) { return json({ok: false, errore: 'richiesta'}); }
  return json(leggi(p));
}
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function leggi(p) {
  var b = trovaBar(p.codice);
  if (b.errore) return {ok: false, errore: b.errore};
  var foto = Array.isArray(p.foto) ? p.foto : [];
  var male = function (f) { return !f || typeof f.dati !== 'string' || !f.dati || f.dati.length > MAX_BASE64 || /[^A-Za-z0-9+/=]/.test(f.dati) || !/^image\/(jpeg|png|webp)$/.test(f.tipo || 'image/jpeg'); };
  if (!foto.length || foto.length > MAX_FOTO || foto.some(male)) return {ok: false, errore: 'foto'};
  if (b.usate + foto.length > b.tetto) return {ok: false, errore: 'tetto', tetto: b.tetto, rimaste: Math.max(0, b.tetto - b.usate)};
  var cosa = p.cosa === 'articolo' ? 'articolo' : 'lotto';
  var contenuto = foto.map(function (f) { return {type: 'image', source: {type: 'base64', media_type: f.tipo || 'image/jpeg', data: f.dati}}; });
  contenuto.push({type: 'text', text: richiesta(p, cosa)});   // prima le foto, poi il testo: Claude le legge meglio così
  var r = chiama({model: MODELLO, max_tokens: 4000, system: ISTRUZIONI, output_config: {effort: IMPEGNO, format: {type: 'json_schema', schema: SCHEMA}}, messages: [{role: 'user', content: contenuto}]});
  if (!r.ok) { segna(b, cosa, foto.length, 0, 0, r.errore + (r.messaggio ? ' · ' + r.messaggio : '')); return {ok: false, errore: r.errore}; }
  // da qui i token sono spesi: le foto contano anche se la risposta non serve
  var j = r.j, u = j.usage || {}, tin = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0), tout = u.output_tokens || 0;
  var n = conta(b, foto.length), resto = {tetto: b.tetto, rimaste: Math.max(0, b.tetto - n)};
  if (j.stop_reason === 'refusal') { segna(b, cosa, foto.length, tin, tout, 'rifiuto'); return merge({ok: false, errore: 'rifiuto'}, resto); }
  if (j.stop_reason === 'max_tokens') { segna(b, cosa, foto.length, tin, tout, 'risposta troncata'); return merge({ok: false, errore: 'claude'}, resto); }
  var testo = (j.content || []).filter(function (c) { return c && c.type === 'text'; }).map(function (c) { return c.text; }).join('');
  var d = null; try { d = JSON.parse(testo); } catch (err) { d = null; }
  if (!d || typeof d !== 'object') { segna(b, cosa, foto.length, tin, tout, 'risposta non leggibile'); return merge({ok: false, errore: 'claude'}, resto); }
  var dati = pulisci(d, cosa);
  segna(b, cosa, foto.length, tin, tout, dati.leggibile ? 'ok' : 'etichetta non leggibile');
  return merge({ok: true, dati: dati}, resto);
}
function merge(a, b) { for (var k in b) a[k] = b[k]; return a; }

function richiesta(p, cosa) {
  var art = String(p.articolo || '').replace(/\s+/g, ' ').trim().slice(0, 80), forn = String(p.fornitore || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return (art ? 'Etichetta che dovrebbe essere di «' + art + '»' + (forn ? ', comprato da ' + forn : '') + '. ' : '') +
    (cosa === 'articolo' ? 'Compila tutti i campi, compresi ingredienti, allergeni, tracce e conservazione.'
      : 'Servono soprattutto lotto e scadenza: lascia vuoti ingredienti, allergeni, tracce e conservazione.');
}

/* ---------- Claude ---------- */
var ISTRUZIONI = [
  'Leggi le foto dell’etichetta di un prodotto alimentare comprato da un bar (anche il retro e i timbri) e compila i campi.',
  'Scrivi solo quello che vedi nelle foto. Se un dato non c’è, lascialo vuoto (testo vuoto, 0 o elenco vuoto). Se lo leggi ma non sei sicuro di ogni carattere, scrivilo e metti il campo anche in «dubbi».',
  'lotto: il codice del lotto come stampato, senza la parola «Lotto» o «Lot» e senza la lettera L staccata davanti (L 23145 diventa 23145; L23145 resta L23145). Non confonderlo con codici articolo, codici a barre, orari o date.',
  'scadenza: la data di «da consumarsi entro» o «da consumarsi preferibilmente entro» (anche TMC, best before, exp), nel formato AAAA-MM-GG. Le date stampate sono di solito giorno/mese/anno. Se ci sono solo mese e anno, usa l’ultimo giorno del mese.',
  'tipoScadenza: «entro» per «da consumarsi entro», «preferibilmente» per «da consumarsi preferibilmente entro» o TMC, «non indicato» se non si capisce.',
  'confezionamento: la data di confezionamento o di produzione, se è stampata, nel formato AAAA-MM-GG.',
  'ean: solo le cifre sotto il codice a barre (8, 12, 13 o 14 cifre).',
  'quantita e unita: il contenuto netto della confezione: 25 kg diventa 25 e kg, 500 g diventa 0,5 e kg, 1 L diventa 1 e l; per prodotti a pezzi usa pz.',
  'ingredienti, allergeni, tracce, conservazione: compilali solo se la richiesta lo dice. Gli allergeni sono quelli evidenziati fra gli ingredienti (grassetto o maiuscolo); le tracce sono quelle di «può contenere».',
  'leggibile: false se nelle foto non c’è l’etichetta di un prodotto alimentare o è del tutto illeggibile.'
].join('\n');
var SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['leggibile', 'prodotto', 'marca', 'ean', 'lotto', 'scadenza', 'tipoScadenza', 'confezionamento', 'quantita', 'unita', 'ingredienti', 'allergeni', 'tracce', 'conservazione', 'dubbi'],
  properties: {
    leggibile: {type: 'boolean'},
    prodotto: {type: 'string', description: 'nome del prodotto come scritto in etichetta'},
    marca: {type: 'string'},
    ean: {type: 'string', description: 'solo cifre'},
    lotto: {type: 'string'},
    scadenza: {type: 'string', description: 'AAAA-MM-GG oppure vuoto'},
    tipoScadenza: {type: 'string', enum: ['entro', 'preferibilmente', 'non indicato']},
    confezionamento: {type: 'string', description: 'AAAA-MM-GG oppure vuoto'},
    quantita: {type: 'number'},
    unita: {type: 'string', enum: ['kg', 'l', 'pz', 'non indicata']},
    ingredienti: {type: 'string'},
    allergeni: {type: 'array', items: {type: 'string', enum: ALLERGENI}},
    tracce: {type: 'array', items: {type: 'string', enum: ALLERGENI}},
    conservazione: {type: 'string'},
    dubbi: {type: 'array', items: {type: 'string', enum: CAMPI_DUBBI}}
  }
};
function chiama(body) {
  var k = chiave();
  if (!k) return {ok: false, errore: 'chiave_api', messaggio: 'chiave API non impostata'};
  var res;
  try {
    res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: {'x-api-key': k, 'anthropic-version': '2023-06-01'}, payload: JSON.stringify(body)});
  } catch (err) { return {ok: false, errore: 'occupato', messaggio: String((err && err.message) || err).slice(0, 200)}; }
  var code = res.getResponseCode(), txt = res.getContentText(), j = null;
  try { j = JSON.parse(txt); } catch (err) { j = null; }
  if (code === 200 && j) return {ok: true, j: j};
  var msg = String((j && j.error && j.error.message) || txt || '').replace(/\s+/g, ' ').slice(0, 300);
  var errore = code === 401 || code === 403 ? 'chiave_api'
    : /credit balance|billing/i.test(msg) ? 'crediti'
    : code === 429 || code === 529 || code >= 500 ? 'occupato'
    : code === 413 || /image/i.test(msg) ? 'foto' : 'claude';
  return {ok: false, errore: errore, messaggio: code + ' ' + msg};
}

/* ---------- pulizia di quello che torna ---------- */
function pulisci(d, cosa) {
  var dubbi = [];
  var dub = function (k) { if (dubbi.indexOf(k) < 0) dubbi.push(k); };
  (Array.isArray(d.dubbi) ? d.dubbi : []).forEach(function (x) { x = String(x).toLowerCase(); if (CAMPI_DUBBI.indexOf(x) >= 0) dub(x); });
  var s = function (x, n) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, n); };
  var data = function (x, k) { var v = s(x, 20); if (!v) return ''; if (!dataVera(v)) { dub(k); return ''; } return v; };
  var ean = s(d.ean, 40).replace(/\D/g, '');
  if (ean && !gtin(ean)) { dub('ean'); ean = ''; }
  var tipo = String(d.tipoScadenza || '').toLowerCase(), u = String(d.unita || '').toLowerCase(), q = Number(d.quantita);
  var al = alg(d.allergeni), tr = alg(d.tracce).filter(function (x) { return al.indexOf(x) < 0; }), art = cosa === 'articolo';
  return {
    leggibile: d.leggibile !== false,
    prodotto: s(d.prodotto, 120), marca: s(d.marca, 60), ean: ean,
    lotto: s(d.lotto, 40).replace(/^(lotto|lot|l\.|l(?=\s))\s*[:.]?\s*/i, ''),
    scadenza: data(d.scadenza, 'scadenza'),
    tipoScadenza: tipo === 'entro' || tipo === 'preferibilmente' ? tipo : '',
    confezionamento: data(d.confezionamento, 'confezionamento'),
    quantita: q > 0 && q < 100000 ? Math.round(q * 1000) / 1000 : 0,
    unita: ['kg', 'l', 'pz'].indexOf(u) >= 0 ? u : '',
    ingredienti: art ? s(d.ingredienti, 2000) : '', allergeni: art ? al : [], tracce: art ? tr : [], conservazione: art ? s(d.conservazione, 200) : '',
    dubbi: dubbi
  };
}
function dataVera(v) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if (!m) return false;
  var y = +m[1], mo = +m[2], g = +m[3], dt = new Date(Date.UTC(y, mo - 1, g));
  return y >= 2000 && y <= 2100 && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === g;
}
function gtin(c) {   // cifra di controllo di EAN-8, UPC-A, EAN-13 e GTIN-14
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(c)) return false;
  var t = 0;
  for (var i = 0; i < c.length - 1; i++) t += +c[c.length - 2 - i] * (i % 2 === 0 ? 3 : 1);
  return (10 - t % 10) % 10 === +c[c.length - 1];
}
function alg(a) { var r = []; (Array.isArray(a) ? a : []).forEach(function (x) { x = String(x).toLowerCase(); if (ALLERGENI.indexOf(x) >= 0 && r.indexOf(x) < 0) r.push(x); }); return r; }

/* ---------- bar, conteggi e registro ---------- */
function trovaBar(codice) {
  var c = String(codice || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,40}$/.test(c)) return {errore: 'codice'};
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FOGLIO_BAR);
  if (!sh) return {errore: 'codice'};
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][1] || '').trim().toUpperCase() !== c) continue;
    if (sospeso(v[i][2])) return {errore: 'sospeso'};
    var t = Number(v[i][3]);
    return {riga: i + 1, nome: String(v[i][0] || '').trim() || 'Bar', codice: c, tetto: t > 0 ? Math.floor(t) : TETTO, usate: usate(c)};
  }
  return {errore: 'codice'};
}
function sospeso(x) { return x === false || /^(no|n|0|falso|false|sospeso)$/i.test(String(x == null ? '' : x).trim()); }
function mese() { return Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd').slice(0, 7); }
function usoDi(pr, c) { var x; try { x = JSON.parse(pr.getProperty('uso|' + c) || '{}') || {}; } catch (e) { x = {}; } return x.mese === mese() ? Number(x.n) || 0 : 0; }
function usate(c) { return usoDi(PropertiesService.getScriptProperties(), c); }
function conta(b, n) {   // una chiave per bar, che riparte da zero il mese dopo
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var pr = PropertiesService.getScriptProperties(), u = usoDi(pr, b.codice) + n;
    pr.setProperty('uso|' + b.codice, JSON.stringify({mese: mese(), n: u}));
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FOGLIO_BAR);
    if (sh) sh.getRange(b.riga, 5, 1, 2).setValues([[u, new Date()]]);
    return u;
  } finally { lock.releaseLock(); }
}
function segna(b, cosa, n, tin, tout, esito) {
  var costo = Math.round((tin * PREZZO_ENTRATA + tout * PREZZO_USCITA) / 1e6 * 1e5) / 1e5;
  foglio(FOGLIO_LETTURE, TESTA_LETTURE).appendRow([new Date(), b.nome, b.codice, cosa === 'articolo' ? 'nuovo articolo' : 'lotto e scadenza', n, tin, tout, costo, String(esito).slice(0, 300)]);
}
function foglio(nome, testa) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(nome);
  if (!sh) sh = ss.insertSheet(nome);
  if (sh.getLastRow() === 0) { sh.appendRow(testa); sh.setFrozenRows(1); }
  return sh;
}
function chiave() { return PropertiesService.getScriptProperties().getProperty('CHIAVE_API') || ''; }
function nuovoCodice() {
  var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + ':' + Date.now()), c = 'BF-';
  for (var i = 0; i < 8; i++) { c += A[(b[i] + 256) % A.length]; if (i === 3) c += '-'; }
  return c;
}
function avvisa(m) { try { SpreadsheetApp.getUi().alert(m); } catch (e) { Logger.log(m); } }
