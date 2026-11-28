/*
 * Barista Flow · il ponte: abbonamenti dei bar e lettura con Claude
 *
 * Questo script sta nel tuo account Google, dentro un foglio Google, ed è il centro del servizio che dai ai bar:
 * - tiene i tuoi clienti (foglio «Bar») con anagrafica e abbonamento, i pagamenti («Pagamenti»), gli interventi da
 *   fatturare («Interventi») e gli avvisi per i bar («Avvisi»);
 * - dice al Barista Flow di ogni bar come sta il suo abbonamento (in regola, in scadenza, in ritardo, limitato,
 *   sospeso) e gli passa i tuoi avvisi: in ritardo il bar vede un promemoria, limitato si ferma la lettura con Claude,
 *   sospeso l'app va in sola lettura, con i dati sempre visibili ed esportabili;
 * - custodisce la chiave API di Claude (i bar non la vedono mai), legge con Claude le foto delle etichette, conta le
 *   foto del mese di ogni bar e segna ogni lettura nel foglio «Letture»;
 * - ha un pannello: aprendo l'URL dell'app web con il tuo account Google gestisci tutto da lì; ogni mattina, se vuoi,
 *   ti manda per email scadenze e ritardi. A chiunque altro lo stesso indirizzo risponde soltanto che il ponte c'è.
 * Come si installa: README di Barista Flow, sezione «Il ponte».
 */

// Valori di partenza: si cambiano dal pannello (Impostazioni), senza toccare lo script.
var MODELLO = 'claude-haiku-5-5';
var IMPEGNO = 'low';                                // effort di Claude: low, medium o high
var PREZZO_ENTRATA = 0.10, PREZZO_USCITA = 0.50;    // dollari per milione di token (richieste fino a 100.000 token)
var TETTO = 200;                                    // foto al mese per bar, se nella sua riga non ne scrivi altre
var PREAVVISO = 7;                                  // giorni prima della scadenza in cui il bar vede il promemoria
var LIMITA_DOPO = 10;                               // giorni di ritardo dopo i quali il servizio si limita da solo (0: mai)
var SOSPENDI_DOPO = 30;                             // giorni di ritardo dopo i quali l'app va in sola lettura (0: mai)
var CAMBIO = 0.89;                                  // euro per un dollaro, per i margini: Claude costa in dollari
var ORA_EMAIL = 8;                                  // ora del riepilogo del mattino
// Fissi
var MAX_FOTO = 3;                                   // foto per lettura: fronte, retro, timbro
var MAX_BASE64 = 6 * 1024 * 1024;                   // grandezza massima di una foto, già in base64
var FUSO = 'Europe/Rome';
var VERSIONE = 3;

var FOGLIO_BAR = 'Bar', FOGLIO_LETTURE = 'Letture', FOGLIO_PAGAMENTI = 'Pagamenti', FOGLIO_INTERVENTI = 'Interventi', FOGLIO_AVVISI = 'Avvisi';
var TESTA_BAR = ['Bar', 'Codice', 'Servizio', 'Foto al mese', 'Foto nel mese', 'Ultima lettura', 'Note', 'Ragione sociale', 'Partita IVA',
  'Referente', 'Telefono', 'Email', 'Indirizzo', 'Piano', 'Canone (€)', 'Inizio', 'Gratis fino al'];
var TESTA_LETTURE = ['Data e ora', 'Bar', 'Codice', 'Cosa', 'Foto', 'Token in entrata', 'Token in uscita', 'Costo stimato ($)', 'Esito'];
var TESTA_PAGAMENTI = ['ID', 'Data', 'Codice', 'Bar', 'Importo (€)', 'Metodo', 'Copre fino al', 'Note'];
var TESTA_INTERVENTI = ['ID', 'Data', 'Codice', 'Bar', 'Descrizione', 'Importo (€)', 'Stato', 'Note'];
var TESTA_AVVISI = ['ID', 'Testo', 'A chi', 'Dal', 'Al', 'Importante', 'Creato'];
var COL = {nome: 0, codice: 1, servizio: 2, tetto: 3, foto: 4, ultima: 5, note: 6, ragione: 7, piva: 8, referente: 9, telefono: 10, email: 11,
  indirizzo: 12, piano: 13, canone: 14, inizio: 15, prova: 16};
var PIANI = {mensile: 1, trimestrale: 3, semestrale: 6, annuale: 12};   // mesi coperti da un canone
var MODI = ['automatico', 'attivo', 'limitato', 'sospeso'];
var METODI = ['bonifico', 'contanti', 'carta', 'altro'];
var STATI_INTERVENTO = ['da fatturare', 'fatturato', 'pagato'];
var ALLERGENI = ['glutine', 'crostacei', 'uova', 'pesce', 'arachidi', 'soia', 'latte', 'frutta_guscio', 'sedano', 'senape', 'sesamo', 'solfiti', 'lupini', 'molluschi'];
var CAMPI_DUBBI = ['prodotto', 'ean', 'lotto', 'scadenza', 'confezionamento', 'quantita', 'ingredienti', 'allergeni'];
var PREDEFINITE = {modello: MODELLO, impegno: IMPEGNO, prezzoEntrata: PREZZO_ENTRATA, prezzoUscita: PREZZO_USCITA, tetto: TETTO, indirizzo: '',
  preavviso: PREAVVISO, limitaDopo: LIMITA_DOPO, sospendiDopo: SOSPENDI_DOPO, contatto: '', cambio: CAMBIO,
  emailAttiva: false, emailOra: ORA_EMAIL, email: '', emailSempre: false};

/* ---------- menu del foglio: il pannello anche da qui, sul computer ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Barista Flow').addItem('Apri il pannello', 'apriPannello').addToUi();
}
function apriPannello() {
  SpreadsheetApp.getUi().showModalDialog(paginaPannello_().setWidth(480).setHeight(700), 'Barista Flow · Claude');
}

/* ---------- richieste ---------- */
// GET ?codice=…&app=… (dall'app del bar): abbonamento, avvisi e foto rimaste; il ponte segna quando il bar si è fatto vivo.
// GET senza codice: al proprietario del ponte, entrato con il suo account Google, il pannello; agli altri solo che il ponte c'è.
// POST (testo JSON): {codice, cosa: 'lotto' | 'articolo', foto: [{tipo, dati}], articolo, fornitore} legge l'etichetta.
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.codice) {
    var b = trovaBar(p.codice);
    if (b.errore) return json({ok: false, errore: b.errore});
    visto_(b.codice, p.app);
    return json({ok: true, bar: b.nome, tetto: b.tetto, usate: b.usate, rimaste: Math.max(0, b.tetto - b.usate), versione: VERSIONE,
      lettura: b.abb.stato === 'attivo', servizio: perIlBar_(b.abb), avvisi: avvisiPer_(b.codice), contatto: imp_().contatto});
  }
  if (proprietario_()) return paginaPannello_();
  return json({ok: true, servizio: 'barista-flow-claude', versione: VERSIONE,
    pannello: 'Questo è il ponte di Barista Flow. Il pannello si apre solo con l’account Google che lo ha pubblicato: entra con quello e ricarica la pagina.'});
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
  if (b.abb.stato !== 'attivo') return {ok: false, errore: b.abb.stato};   // limitato o sospeso: niente lettura
  var foto = Array.isArray(p.foto) ? p.foto : [];
  var male = function (f) { return !f || typeof f.dati !== 'string' || !f.dati || f.dati.length > MAX_BASE64 || /[^A-Za-z0-9+/=]/.test(f.dati) || !/^image\/(jpeg|png|webp)$/.test(f.tipo || 'image/jpeg'); };
  if (!foto.length || foto.length > MAX_FOTO || foto.some(male)) return {ok: false, errore: 'foto'};
  if (b.usate + foto.length > b.tetto) return {ok: false, errore: 'tetto', tetto: b.tetto, rimaste: Math.max(0, b.tetto - b.usate)};
  var cosa = p.cosa === 'articolo' ? 'articolo' : 'lotto', c = imp_();
  var contenuto = foto.map(function (f) { return {type: 'image', source: {type: 'base64', media_type: f.tipo || 'image/jpeg', data: f.dati}}; });
  contenuto.push({type: 'text', text: richiesta(p, cosa)});   // prima le foto, poi il testo: Claude le legge meglio così
  var r = chiama({model: c.modello, max_tokens: 4000, system: ISTRUZIONI, output_config: {effort: c.impegno, format: {type: 'json_schema', schema: SCHEMA}}, messages: [{role: 'user', content: contenuto}]});
  if (!r.ok) { segna(b, cosa, foto.length, 0, 0, r.errore + (r.messaggio ? ' · ' + r.messaggio : '')); return {ok: false, errore: r.errore}; }
  // da qui i token sono spesi: le foto contano anche se la risposta non serve
  var j = r.j, u = j.usage || {}, tin = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0), tout = u.output_tokens || 0;
  var n = conta(b, foto.length, costo_(tin, tout)), resto = {tetto: b.tetto, rimaste: Math.max(0, b.tetto - n)};
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
function chiama(body, kk) {   // kk: una chiave da provare prima di salvarla; senza, quella salvata
  var k = kk || chiave();
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
  var c = codiceValido_(codice);
  if (!c) return {errore: 'codice'};
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FOGLIO_BAR);
  if (!sh) return {errore: 'codice'};
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][1] || '').trim().toUpperCase() !== c) continue;
    var b = barDaRiga_(v[i], i);
    b.nome = b.nome || 'Bar'; b.tetto = b.tetto || imp_().tetto; b.usate = usate(c);
    b.abb = abbonamento_(b, pagatoFino_(c), oggi_());
    return b;
  }
  return {errore: 'codice'};
}
function barDaRiga_(r, i) {
  var g = function (k) { var x = r[COL[k]]; return x == null ? '' : x; }, s = function (k) { return String(g(k)).replace(/^'/, '').trim(); };
  var t = Number(g('tetto')), u = g('ultima'), piano = s('piano').toLowerCase(), canone = euro_(g('canone'));
  return {riga: i + 1, nome: s('nome'), codice: s('codice').toUpperCase(), modo: modo_(g('servizio')), tetto: t > 0 ? Math.floor(t) : null,
    ultima: u && typeof u.getTime === 'function' ? u.getTime() : null, note: s('note'),
    ragione: s('ragione'), piva: s('piva'), referente: s('referente'), telefono: s('telefono'), email: s('email'), indirizzo: s('indirizzo'),
    piano: PIANI[piano] ? piano : '', canone: canone > 0 ? canone : 0, inizio: iso_(g('inizio')), prova: iso_(g('prova'))};
}
function modo_(x) {   // la scelta a mano della colonna «Servizio»; il «sì» dei bar di prima vuol dire automatico
  var s = String(x == null ? '' : x).trim().toLowerCase();
  if (x === false || /^(no|n|0|falso|false|sospeso)$/.test(s)) return 'sospeso';
  return s === 'limitato' || s === 'attivo' ? s : 'automatico';
}
function mese() { return oggi_().slice(0, 7); }
function oggi_() { return Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd'); }
function usoRec_(pr, c) {   // foto e costo del bar nel mese in corso
  var x; try { x = JSON.parse(pr.getProperty('uso|' + c) || '{}') || {}; } catch (e) { x = {}; }
  return x.mese === mese() ? {n: Number(x.n) || 0, costo: Number(x.costo) || 0} : {n: 0, costo: 0};
}
function usoDi(pr, c) { return usoRec_(pr, c).n; }
function usate(c) { return usoDi(PropertiesService.getScriptProperties(), c); }
function conta(b, n, costo) {   // una chiave per bar, che riparte da zero il mese dopo, più i totali di ogni mese
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var pr = PropertiesService.getScriptProperties(), m = mese(), u = usoRec_(pr, b.codice), co = Number(costo) || 0;
    u.n += n; u.costo = tondo_(u.costo + co);
    pr.setProperty('uso|' + b.codice, JSON.stringify({mese: m, n: u.n, costo: u.costo}));
    var tot = mesiRec_(pr), t = tot[m] || {f: 0, c: 0, l: 0};
    t.f += n; t.c = tondo_(t.c + co); t.l += 1; tot[m] = t;
    var ks = Object.keys(tot).sort(); while (ks.length > 24) delete tot[ks.shift()];
    pr.setProperty('MESI', JSON.stringify(tot));
    // la riga si cerca di nuovo: nel frattempo dal pannello o dal foglio si può aver tolto un bar
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FOGLIO_BAR), riga = sh ? rigaDi_(sh, b.codice) : 0;
    if (riga) sh.getRange(riga, 5, 1, 2).setValues([[u.n, new Date()]]);
    return u.n;
  } finally { lock.releaseLock(); }
}
function segna(b, cosa, n, tin, tout, esito) {
  foglio(FOGLIO_LETTURE, TESTA_LETTURE).appendRow([new Date(), cella_(b.nome), b.codice, cosa === 'articolo' ? 'nuovo articolo' : 'lotto e scadenza', n, tin, tout, costo_(tin, tout), cella_(String(esito).slice(0, 300))]);
}
function costo_(tin, tout) { var c = imp_(); return Math.round((tin * c.prezzoEntrata + tout * c.prezzoUscita) / 1e6 * 1e5) / 1e5; }
function tondo_(x) { return Math.round(x * 1e6) / 1e6; }
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
var _imp = null;   // le impostazioni lette una volta per richiesta
function imp_() {
  if (_imp) return _imp;
  var x; try { x = JSON.parse(PropertiesService.getScriptProperties().getProperty('IMPOSTAZIONI') || '{}') || {}; } catch (e) { x = {}; }
  var r = {};
  for (var k in PREDEFINITE) r[k] = x[k] != null && x[k] !== '' ? x[k] : PREDEFINITE[k];
  return (_imp = r);
}

/* ---------- abbonamenti ---------- */
// Si paga in anticipo: ogni pagamento copre fino a un giorno («Copre fino al»). Senza pagamenti l'abbonamento è coperto
// fino al giorno prima dell'inizio, o fino a «Gratis fino al» se c'è un periodo di prova. Il canone successivo va pagato
// entro il giorno dopo l'ultimo coperto; da lì si contano i giorni di ritardo: prima un promemoria, poi limitato (niente
// lettura con Claude né fatture dalla posta), poi sospeso (sola lettura).
function abbonamento_(b, pagato, oggi) {
  var c = imp_(), r = {stato: 'attivo', fase: 'libero', coperto: '', entro: '', giorni: 0, prossimo: null, modo: b.modo};
  if (b.piano && b.canone > 0) {
    var cop = [pagato, b.prova].filter(Boolean).sort().pop() || (b.inizio ? piuGiorni_(b.inizio, -1) : '');
    r.primo = !pagato && !b.prova;   // non ha ancora pagato niente: il primo canone si paga all'inizio
    r.gratis = !!b.prova && !(pagato >= b.prova);   // la copertura viene dalla prova gratuita
    if (!cop) r.fase = 'regola';   // piano senza inizio né pagamenti: non c'è ancora niente da chiedere
    else {
      var entro = piuGiorni_(cop, 1), d = giorni_(entro, oggi);   // giorni di ritardo: 0 si paga oggi, 1 andava pagato ieri
      r.coperto = cop; r.entro = entro; r.giorni = d;
      if (d <= 0) { r.fase = -d <= c.preavviso ? 'scadenza' : 'regola'; r.prossimo = {fase: 'ritardo', data: piuGiorni_(entro, 1)}; }
      else if (c.sospendiDopo > 0 && d > c.sospendiDopo) { r.fase = 'sospeso'; r.stato = 'sospeso'; }
      else if (c.limitaDopo > 0 && d > c.limitaDopo) {
        r.fase = 'limitato'; r.stato = 'limitato';
        if (c.sospendiDopo > 0) r.prossimo = {fase: 'sospeso', data: piuGiorni_(entro, c.sospendiDopo + 1)};
      } else {
        r.fase = 'ritardo';
        if (c.limitaDopo > 0) r.prossimo = {fase: 'limitato', data: piuGiorni_(entro, c.limitaDopo + 1)};
        else if (c.sospendiDopo > 0) r.prossimo = {fase: 'sospeso', data: piuGiorni_(entro, c.sospendiDopo + 1)};
      }
    }
  }
  if (b.modo !== 'automatico') { r.stato = b.modo; if (b.modo !== 'attivo') r.prossimo = null; }   // scelto a mano: vale su tutto
  return r;
}
function perIlBar_(a) { return {stato: a.stato, fase: a.fase, coperto: a.coperto, entro: a.entro, giorni: a.giorni, prossimo: a.prossimo, primo: !!a.primo, gratis: !!a.gratis, manuale: a.modo !== 'automatico'}; }
function prossimoFino_(b, cop) {   // fin dove arriva il prossimo canone
  var da = cop ? piuGiorni_(cop, 1) : (b.inizio || oggi_());
  return piuGiorni_(piuMesi_(da, PIANI[b.piano] || 1), -1);
}
function visto_(c, app) {   // quando il bar si è fatto vivo e con quale versione dell'app: una scrittura ogni dieci minuti al massimo
  try {
    var pr = PropertiesService.getScriptProperties(), k = 'visto|' + c, v = String(app || '').replace(/[^\w.-]/g, '').slice(0, 24), x = vistoRec_(pr, c) || {};
    if (Date.now() - (x.t || 0) < 10 * 60000 && (!v || x.v === v)) return;
    pr.setProperty(k, JSON.stringify({t: Date.now(), v: v || x.v || ''}));
  } catch (e) { /* non è importante */ }
}
function vistoRec_(pr, c) { try { return JSON.parse(pr.getProperty('visto|' + c) || 'null'); } catch (e) { return null; } }
function avvisiPer_(c) {
  var o = oggi_();
  return avvisi_().filter(function (x) { return (x.a === 'tutti' || x.a === c) && (!x.dal || x.dal <= o) && (!x.al || x.al >= o); })
    .slice(0, 5).map(function (x) { return {id: x.id, testo: x.testo, importante: x.importante}; });
}

/* date AAAA-MM-GG: si contano a giorni interi, senza ore né fusi orari */
function iso_(v) {   // una data del foglio come AAAA-MM-GG; vuoto se non c'è o non è una data
  if (v && typeof v.getTime === 'function') return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, fusoFoglio_(), 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim().replace(/^'/, '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && dataVera(s) ? s : '';
}
function fusoFoglio_() { try { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || FUSO; } catch (e) { return FUSO; } }
function utc_(s) { return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }
function giorni_(a, b) { return Math.round((utc_(b) - utc_(a)) / 864e5); }
function piuGiorni_(s, n) { return new Date(utc_(s) + n * 864e5).toISOString().slice(0, 10); }
function piuMesi_(s, n) {   // lo stesso giorno n mesi dopo; il 31 diventa l'ultimo del mese
  var y = +s.slice(0, 4), m = +s.slice(5, 7) - 1 + n, d = +s.slice(8, 10), fine = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, fine))).toISOString().slice(0, 10);
}

/* ---------- il pannello ---------- */
// Si apre solo al proprietario: con «Esegui come: Io» Google rivela chi apre la pagina soltanto quando è chi ha
// pubblicato il ponte; per tutti gli altri l'indirizzo è vuoto.
function proprietario_() {
  try {
    var a = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    var e = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
    return !!a && a === e;
  } catch (err) { return false; }
}
function paginaPannello_() {
  var st = null;
  try { st = stato_(); } catch (err) { st = null; }   // la pagina allora lo chiede da sé e mostra l'errore
  var dati = JSON.stringify(st).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return HtmlService.createHtmlOutput(PANNELLO.replace('/*STATO*/null', function () { return dati; }))
    .setTitle('Barista Flow · Claude')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}
// L'unica porta del pannello: la pagina chiama google.script.run.pannello(azione, dati).
function pannello(azione, dati) {
  if (!proprietario_()) throw new Error('Il pannello si apre solo con l’account Google che ha pubblicato il ponte.');
  var d = dati && typeof dati === 'object' ? dati : {};
  switch (String(azione)) {
    case 'stato': return {ok: true, stato: stato_()};
    case 'chiave': return salvaChiave_(d);
    case 'prova': return provaChiave_();
    case 'impostazioni': return salvaImpostazioni_(d);
    case 'aggiungi': return aggiungiBar_(d);
    case 'cliente': return salvaCliente_(d);
    case 'servizio': return salvaServizio_(d);
    case 'codice': return cambiaCodice_(d);
    case 'elimina': return eliminaBar_(d);
    case 'pagamento': return salvaPagamento_(d);
    case 'togli-pagamento': return togli_(FOGLIO_PAGAMENTI, d.id);
    case 'intervento': return salvaIntervento_(d);
    case 'togli-intervento': return togli_(FOGLIO_INTERVENTI, d.id);
    case 'avviso': return salvaAvviso_(d);
    case 'togli-avviso': return togli_(FOGLIO_AVVISI, d.id);
    case 'letture': var lc = codiceValido_(d.codice); return {ok: true, letture: ultimeLetture_(lc, 25), uso: lc ? usoRec_(PropertiesService.getScriptProperties(), lc) : null};
    case 'riepilogo': return provaRiepilogo_();
  }
  throw new Error('Azione sconosciuta: ' + azione);
}

function stato_() {
  prepara_();
  var pr = PropertiesService.getScriptProperties(), k = chiave(), o = oggi_(), pag = pagamenti_();
  return {
    versione: VERSIONE,
    account: String(Session.getEffectiveUser().getEmail() || ''),
    chiave: {impostata: !!k, fine: k ? k.slice(-4) : ''},
    imp: imp_(), predefinite: PREDEFINITE, oggi: o, mese: o.slice(0, 7),
    bar: elencoBar_().map(function (b) {
      var u = usoRec_(pr, b.codice);
      b.usate = u.n; b.costo = u.costo; b.abb = abbonamento_(b, pagatoFino_(b.codice, pag), o); b.visto = vistoRec_(pr, b.codice);
      b.prossimo = b.piano && b.canone > 0 ? {importo: b.canone, fino: prossimoFino_(b, b.abb.coperto)} : null;   // il canone da registrare
      delete b.riga; return b;
    }),
    pagamenti: pag.map(senzaRiga_), interventi: interventi_().map(senzaRiga_), avvisi: avvisi_().map(senzaRiga_),
    mesi: mesi_(pr), letture: ultimeLetture_('', 30), riepilogo: orologio_() ? 'attivo' : ''
  };
}
// i fogli che mancano si creano; il foglio «Bar» dei primi ponti prende le colonne nuove (la terza diventa «Servizio»)
function prepara_() {
  var sh = foglio(FOGLIO_BAR, TESTA_BAR), n = TESTA_BAR.length, testa = sh.getRange(1, 1, 1, n).getValues()[0];
  if (String(testa[n - 1]) !== TESTA_BAR[n - 1] || String(testa[2]) !== TESTA_BAR[2]) sh.getRange(1, 1, 1, n).setValues([TESTA_BAR]);
  foglio(FOGLIO_LETTURE, TESTA_LETTURE); foglio(FOGLIO_PAGAMENTI, TESTA_PAGAMENTI); foglio(FOGLIO_INTERVENTI, TESTA_INTERVENTI); foglio(FOGLIO_AVVISI, TESTA_AVVISI);
}

/* chiave API e impostazioni */
function salvaChiave_(d) {
  var k = String(d.chiave || '').replace(/\s+/g, '');
  if (!/^sk-ant-[\w-]{20,}$/.test(k)) return no_('Non sembra una chiave di Claude: comincia con sk-ant- e va copiata intera dalla Console.');
  var r = prova_(k, imp_().modello);   // prima la prova: una chiave che Claude rifiuta non si salva
  if (!r.ok && r.errore === 'chiave_api') return no_('Claude non accetta questa chiave (' + r.messaggio + '). Controlla di averla copiata intera.');
  PropertiesService.getScriptProperties().setProperty('CHIAVE_API', k);
  return {ok: true, prova: r, stato: stato_()};
}
function provaChiave_() {
  var k = chiave();
  if (!k) return no_('La chiave API non è ancora impostata.');
  return {ok: true, prova: prova_(k, imp_().modello), stato: stato_()};
}
function prova_(k, modello) {
  var r = chiama({model: modello, max_tokens: 64, thinking: {type: 'disabled'}, output_config: {effort: 'low'}, messages: [{role: 'user', content: 'Rispondi solo: ok'}]}, k);
  return r.ok ? {ok: true, modello: modello} : {ok: false, errore: r.errore, messaggio: r.messaggio || ''};
}
// si salva solo quello che arriva; il resto resta com'era
function salvaImpostazioni_(d) {
  var cur = imp_(), x = {}, k;
  for (k in PREDEFINITE) x[k] = cur[k];
  var intero = function (v, min, max) { var n = numero_(v); return n >= min && n <= max && n === Math.floor(n) ? n : null; };
  if (d.modello != null) { x.modello = String(d.modello).trim().toLowerCase(); if (!/^claude-[a-z0-9][a-z0-9.-]{1,60}$/.test(x.modello)) return no_('Il modello si scrive come claude-haiku-5-5.'); }
  if (d.impegno != null) { x.impegno = String(d.impegno); if (['low', 'medium', 'high'].indexOf(x.impegno) < 0) return no_('L’impegno è basso, medio o alto.'); }
  if (d.prezzoEntrata != null) x.prezzoEntrata = numero_(d.prezzoEntrata);
  if (d.prezzoUscita != null) x.prezzoUscita = numero_(d.prezzoUscita);
  if (!(x.prezzoEntrata >= 0 && x.prezzoEntrata <= 1000 && x.prezzoUscita >= 0 && x.prezzoUscita <= 1000)) return no_('I prezzi sono dollari per milione di token: numeri fra 0 e 1000.');
  if (d.tetto != null) { x.tetto = String(d.tetto).trim() === '' ? TETTO : intero(d.tetto, 1, 100000); if (x.tetto === null) return no_('Le foto al mese sono un numero intero fra 1 e 100.000.'); }
  if (d.indirizzo != null) { var ind = indirizzo_(d.indirizzo); if (ind.errore) return no_(ind.errore); x.indirizzo = ind.url; }
  if (d.preavviso != null) { x.preavviso = intero(d.preavviso, 0, 60); if (x.preavviso === null) return no_('Il preavviso è un numero di giorni fra 0 e 60.'); }
  if (d.limitaDopo != null) { x.limitaDopo = intero(d.limitaDopo, 0, 365); if (x.limitaDopo === null) return no_('Dopo quanti giorni limitare: un numero fra 0 e 365 (0: mai).'); }
  if (d.sospendiDopo != null) { x.sospendiDopo = intero(d.sospendiDopo, 0, 365); if (x.sospendiDopo === null) return no_('Dopo quanti giorni sospendere: un numero fra 0 e 365 (0: mai).'); }
  if (x.limitaDopo > 0 && x.sospendiDopo > 0 && x.sospendiDopo <= x.limitaDopo) return no_('La sospensione deve venire dopo la limitazione: più giorni di ritardo.');
  if (d.contatto != null) x.contatto = testo_(d.contatto, 140);
  if (d.cambio != null) { x.cambio = numero_(d.cambio); if (!(x.cambio >= 0.1 && x.cambio <= 10)) return no_('Il cambio è quanti euro vale un dollaro, per esempio 0,89.'); }
  if (d.email != null) { x.email = testo_(d.email, 120).toLowerCase(); if (x.email && !emailValida_(x.email)) return no_('L’indirizzo email non sembra giusto.'); }
  if (d.emailAttiva != null) x.emailAttiva = !!d.emailAttiva;
  if (d.emailOra != null) { x.emailOra = intero(d.emailOra, 0, 23); if (x.emailOra === null) return no_('L’ora del riepilogo va da 0 a 23.'); }
  if (d.emailSempre != null) x.emailSempre = !!d.emailSempre;
  var avviso = '';
  if (x.modello !== cur.modello && chiave()) {   // un modello nuovo si prova prima di usarlo con i bar
    var r = prova_(chiave(), x.modello);
    if (!r.ok && /^404\b/.test(r.messaggio)) return no_('Claude non conosce il modello «' + x.modello + '»: controlla il nome.');
    if (!r.ok) avviso = 'Salvato, ma la prova del modello non è riuscita: ' + r.messaggio;
  }
  PropertiesService.getScriptProperties().setProperty('IMPOSTAZIONI', JSON.stringify(x));
  _imp = null;
  if (x.emailAttiva !== cur.emailAttiva || x.emailOra !== cur.emailOra || (x.emailAttiva && !orologio_())) orologio_(true);
  return {ok: true, avviso: avviso, stato: stato_()};
}
function indirizzo_(u) {   // l'URL dell'app web da dare ai bar, ripulito dall'account (/u/1/) e dai parametri
  u = String(u == null ? '' : u).trim();
  if (!u) return {url: ''};
  var m = /^https:\/\/script\.google\.com\/(macros|a\/macros\/[a-z0-9.-]+)(?:\/u\/\d+)?\/s\/([\w-]{20,})\/(exec|dev)\/?(?:[?#].*)?$/i.exec(u);
  if (!m) return {errore: 'Non è l’URL di un’app web di Google: comincia con https://script.google.com/macros/s/ e finisce con /exec.'};
  if (m[3].toLowerCase() === 'dev') return {errore: 'Questo è l’indirizzo di prova (finisce con /dev) e funziona solo per te: usa quello che finisce con /exec.'};
  return {url: 'https://script.google.com/' + m[1] + '/s/' + m[2] + '/exec'};
}

/* clienti */
function elencoBar_() {
  var v = foglio(FOGLIO_BAR, TESTA_BAR).getDataRange().getValues(), r = [];
  for (var i = 1; i < v.length; i++) { var b = barDaRiga_(v[i], i); if (b.codice) r.push(b); }
  return r;
}
function datiCliente_(d, nuovo) {   // i campi del cliente controllati; {errore} se qualcosa non va
  var x = {nome: testo_(d.nome, 80), note: testo_(d.note, 300), tetto: tettoBar_(d.tetto), ragione: testo_(d.ragione, 120),
    piva: testo_(d.piva, 20).replace(/\s/g, '').toUpperCase(), referente: testo_(d.referente, 80), telefono: testo_(d.telefono, 30),
    email: testo_(d.email, 120).toLowerCase(), indirizzo: testo_(d.indirizzo, 200), piano: testo_(d.piano, 20).toLowerCase(),
    canone: String(d.canone == null ? '' : d.canone).trim() === '' ? 0 : euro_(d.canone), inizio: dataData_(d.inizio), prova: dataData_(d.prova)};
  if (!x.nome) return {errore: nuovo ? 'Scrivi il nome del bar.' : 'Il nome del bar non può restare vuoto.'};
  if (x.tetto === null) return {errore: 'Foto al mese: un numero intero fra 1 e 100.000, oppure vuoto per il predefinito.'};
  if (x.piva && !/^[A-Z0-9]{8,20}$/.test(x.piva)) return {errore: 'La partita IVA (o il codice fiscale) ha solo lettere e cifre.'};
  if (x.telefono && !/^[+0-9 ()./-]{5,30}$/.test(x.telefono)) return {errore: 'Il telefono ha solo cifre, spazi e +.'};
  if (x.email && !emailValida_(x.email)) return {errore: 'L’email del cliente non sembra giusta.'};
  if (x.piano && !PIANI[x.piano]) return {errore: 'Il piano è mensile, trimestrale, semestrale o annuale.'};
  if (x.inizio === null || x.prova === null) return {errore: 'Una data non è valida.'};
  if (!(x.canone >= 0 && x.canone <= 100000)) return {errore: 'Il canone è un importo in euro, per esempio 39 o 39,90.'};
  if (x.piano && !(x.canone > 0)) return {errore: 'Con un piano serve il canone, in euro.'};
  if (x.piano && !x.inizio) x.inizio = oggi_();
  if (!x.piano) x.canone = 0;
  return x;
}
function aggiungiBar_(d) {
  var x = datiCliente_(d, true);
  if (x.errore) return no_(x.errore);
  return conLucchetto_(function () {
    var sh = foglio(FOGLIO_BAR, TESTA_BAR), cod = codiceLibero_(sh);
    sh.appendRow([cella_(x.nome), cod, 'automatico', x.tetto, 0, ''].concat(campiCliente_(x)));
    return {ok: true, codice: cod, stato: stato_()};
  });
}
function campiCliente_(x) {   // le colonne dalla 7 (Note) alla 17 (Gratis fino al)
  return [cella_(x.note), cella_(x.ragione), testo1_(x.piva), cella_(x.referente), testo1_(x.telefono), cella_(x.email), cella_(x.indirizzo),
    x.piano, x.canone || '', testo1_(x.inizio), testo1_(x.prova)];
}
function salvaCliente_(d) {
  var c = codiceValido_(d.codice), x = datiCliente_(d, false);
  if (x.errore) return no_(x.errore);
  return conLucchetto_(function () {
    var r = rigaBar_(c); if (!r) return sparito_();
    r.sh.getRange(r.riga, 1, 1, 1).setValues([[cella_(x.nome)]]);
    r.sh.getRange(r.riga, 4, 1, 1).setValues([[x.tetto]]);
    r.sh.getRange(r.riga, 7, 1, 11).setValues([campiCliente_(x)]);
    return {ok: true, stato: stato_()};
  });
}
function salvaServizio_(d) {   // la scelta a mano: automatico (segue l'abbonamento), attivo, limitato o sospeso
  var c = codiceValido_(d.codice), modo = String(d.modo || '');
  if (MODI.indexOf(modo) < 0) return no_('Il servizio è automatico, attivo, limitato o sospeso.');
  return conLucchetto_(function () {
    var r = rigaBar_(c); if (!r) return sparito_();
    r.sh.getRange(r.riga, 3, 1, 1).setValues([[modo]]);
    return {ok: true, stato: stato_()};
  });
}
function cambiaCodice_(d) {   // il vecchio codice smette subito di valere; foto del mese, pagamenti, interventi e avvisi passano al nuovo
  var c = codiceValido_(d.codice);
  return conLucchetto_(function () {
    var r = rigaBar_(c); if (!r) return sparito_();
    var nuovo = codiceLibero_(r.sh), pr = PropertiesService.getScriptProperties(), u = pr.getProperty('uso|' + c), v = pr.getProperty('visto|' + c);
    r.sh.getRange(r.riga, 2, 1, 1).setValues([[nuovo]]);
    if (u != null) { pr.setProperty('uso|' + nuovo, u); pr.deleteProperty('uso|' + c); }
    if (v != null) { pr.setProperty('visto|' + nuovo, v); pr.deleteProperty('visto|' + c); }
    pr.setProperty('prima|' + nuovo, JSON.stringify([c].concat(precedenti_(pr, c)).slice(0, 20)));   // per ritrovarne le letture
    pr.deleteProperty('prima|' + c);
    [[FOGLIO_PAGAMENTI, 3], [FOGLIO_INTERVENTI, 3], [FOGLIO_AVVISI, 3]].forEach(function (f) {
      var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(f[0]); if (!sh) return;
      sh.getDataRange().getValues().forEach(function (x, i) { if (i && String(x[f[1] - 1]).trim().toUpperCase() === c) sh.getRange(i + 1, f[1], 1, 1).setValues([[nuovo]]); });
    });
    return {ok: true, codice: nuovo, stato: stato_()};
  });
}
function eliminaBar_(d) {   // la riga sparisce dal foglio «Bar»; letture, pagamenti e interventi restano nei loro fogli
  var c = codiceValido_(d.codice);
  return conLucchetto_(function () {
    var r = rigaBar_(c); if (!r) return sparito_();
    r.sh.deleteRow(r.riga);
    var pr = PropertiesService.getScriptProperties();
    ['uso|', 'prima|', 'visto|'].forEach(function (k) { pr.deleteProperty(k + c); });
    return {ok: true, stato: stato_()};
  });
}
function rigaBar_(c) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FOGLIO_BAR), r = sh && c ? rigaDi_(sh, c) : 0;
  return r ? {sh: sh, riga: r} : null;
}
function rigaDi_(sh, c) {
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][1] || '').trim().toUpperCase() === c) return i + 1;
  return 0;
}
function codiceLibero_(sh) {
  var usati = sh.getDataRange().getValues().map(function (r) { return String(r[1] || '').trim().toUpperCase(); }), c = nuovoCodice();
  for (var i = 0; i < 20 && usati.indexOf(c) >= 0; i++) c = nuovoCodice();
  return c;
}
function codiceValido_(c) { c = String(c || '').trim().toUpperCase(); return /^[A-Z0-9-]{6,40}$/.test(c) ? c : ''; }
function tettoBar_(v) {   // vuoto: il predefinito delle impostazioni; null: non valido
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  var n = numero_(s);
  return n >= 1 && n <= 100000 && n === Math.floor(n) ? n : null;
}
function nomeBar_(c) { var r = rigaBar_(c); return r ? String(r.sh.getRange(r.riga, 1, 1, 1).getValues()[0][0] || '').replace(/^'/, '') : ''; }

/* pagamenti, interventi e avvisi: una riga ciascuno, ritrovata dal suo ID */
function righe_(nome, fn) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!sh) return [];
  return sh.getDataRange().getValues().slice(1).map(function (r, i) { var x = fn(r); x.riga = i + 2; x.id = String(r[0] || ''); return x; })
    .filter(function (x) { return x.id; });
}
function pagamenti_() {
  return righe_(FOGLIO_PAGAMENTI, function (r) {
    return {data: iso_(r[1]), codice: String(r[2] || '').trim().toUpperCase(), bar: String(r[3] || '').replace(/^'/, ''), importo: euro_(r[4]) || 0,
      metodo: String(r[5] || ''), fino: iso_(r[6]), note: String(r[7] == null ? '' : r[7]).replace(/^'/, '')};
  }).sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; });
}
function interventi_() {
  return righe_(FOGLIO_INTERVENTI, function (r) {
    var st = String(r[6] || '').toLowerCase();
    return {data: iso_(r[1]), codice: String(r[2] || '').trim().toUpperCase(), bar: String(r[3] || '').replace(/^'/, ''), descrizione: String(r[4] || '').replace(/^'/, ''),
      importo: euro_(r[5]) || 0, stato: STATI_INTERVENTO.indexOf(st) >= 0 ? st : 'da fatturare', note: String(r[7] == null ? '' : r[7]).replace(/^'/, '')};
  }).sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; });
}
function avvisi_() {
  return righe_(FOGLIO_AVVISI, function (r) {
    var a = String(r[2] || '').trim();
    return {testo: String(r[1] || '').replace(/^'/, ''), a: /^tutti$/i.test(a) || !a ? 'tutti' : a.toUpperCase(), dal: iso_(r[3]), al: iso_(r[4]),
      importante: r[5] === true || /^(sì|si|true|vero|1)$/i.test(String(r[5])), creato: iso_(r[6])};
  }).sort(function (a, b) { return (a.dal || a.creato) < (b.dal || b.creato) ? 1 : -1; });
}
function pagatoFino_(codice, tutti) { var m = ''; (tutti || pagamenti_()).forEach(function (p) { if (p.codice === codice && p.fino > m) m = p.fino; }); return m; }
function senzaRiga_(x) { var y = {}; for (var k in x) if (k !== 'riga') y[k] = x[k]; return y; }
// scrive la riga con questo ID, o ne aggiunge una nuova
function scriviRiga_(nome, testa, id, valori) {
  var sh = foglio(nome, testa), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === id) { sh.getRange(i + 1, 1, 1, valori.length).setValues([valori]); return; }
  sh.appendRow(valori);
}
function togli_(nome, id) {
  id = String(id || '');
  return conLucchetto_(function () {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome), v = sh ? sh.getDataRange().getValues() : [];
    for (var i = 1; i < v.length; i++) if (String(v[i][0]) === id) { sh.deleteRow(i + 1); return {ok: true, stato: stato_()}; }
    return no_('Questa riga non c’è più: forse l’hai già tolta.');
  });
}
function nuovoId_(p) { return p + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(); }
function salvaPagamento_(d) {
  var c = codiceValido_(d.codice), data = dataData_(d.data) || oggi_(), importo = euro_(d.importo), metodo = String(d.metodo || 'bonifico'), fino = dataData_(d.fino), note = testo_(d.note, 200);
  if (data === null || fino === null) return no_('Una data non è valida.');
  if (!(importo > 0 && importo <= 1000000)) return no_('L’importo è in euro, per esempio 39 o 39,90.');
  if (METODI.indexOf(metodo) < 0) return no_('Il metodo è bonifico, contanti, carta o altro.');
  return conLucchetto_(function () {
    if (!rigaBar_(c)) return sparito_();
    var id = String(d.id || '') || nuovoId_('P');
    scriviRiga_(FOGLIO_PAGAMENTI, TESTA_PAGAMENTI, id, [id, testo1_(data), c, cella_(nomeBar_(c)), importo, metodo, testo1_(fino), cella_(note)]);
    return {ok: true, id: id, stato: stato_()};
  });
}
function salvaIntervento_(d) {
  var c = codiceValido_(d.codice), data = dataData_(d.data) || oggi_(), descr = testo_(d.descrizione, 200), importo = String(d.importo == null ? '' : d.importo).trim() === '' ? 0 : euro_(d.importo),
    st = String(d.stato || 'da fatturare'), note = testo_(d.note, 200);
  if (data === null) return no_('La data non è valida.');
  if (!descr) return no_('Scrivi che intervento è.');
  if (!(importo >= 0 && importo <= 1000000)) return no_('L’importo è in euro, per esempio 80 o 80,50.');
  if (STATI_INTERVENTO.indexOf(st) < 0) return no_('Lo stato è da fatturare, fatturato o pagato.');
  return conLucchetto_(function () {
    if (!rigaBar_(c)) return sparito_();
    var id = String(d.id || '') || nuovoId_('I');
    scriviRiga_(FOGLIO_INTERVENTI, TESTA_INTERVENTI, id, [id, testo1_(data), c, cella_(nomeBar_(c)), cella_(descr), importo, st, cella_(note)]);
    return {ok: true, id: id, stato: stato_()};
  });
}
function salvaAvviso_(d) {
  var testo = String(d.testo == null ? '' : d.testo).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 280),
    a = String(d.a || 'tutti') === 'tutti' ? 'tutti' : codiceValido_(d.a), dal = dataData_(d.dal) || oggi_(), al = dataData_(d.al);
  if (!testo) return no_('Scrivi il testo dell’avviso.');
  if (!a) return no_('Scegli a chi va l’avviso.');
  if (dal === null || al === null) return no_('Una data non è valida.');
  if (al && al < dal) return no_('L’avviso deve finire dopo che comincia.');
  return conLucchetto_(function () {
    if (a !== 'tutti' && !rigaBar_(a)) return sparito_();
    var id = String(d.id || '') || nuovoId_('A');
    scriviRiga_(FOGLIO_AVVISI, TESTA_AVVISI, id, [id, cella_(testo), a, testo1_(dal), testo1_(al), !!d.importante, testo1_(oggi_())]);
    return {ok: true, id: id, stato: stato_()};
  });
}

/* letture e mesi */
function ultimeLetture_(codice, n) {   // codice: solo quel bar, comprese le letture fatte con i suoi codici di prima
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FOGLIO_LETTURE), last = sh ? sh.getLastRow() : 0;
  if (last < 2) return [];
  var codici = codice ? [codice].concat(precedenti_(PropertiesService.getScriptProperties(), codice)) : [];
  var quante = Math.min(last - 1, codice ? 1500 : n), v = sh.getRange(last - quante + 1, 1, quante, 9).getValues(), r = [];
  for (var i = v.length - 1; i >= 0 && r.length < n; i--) {
    var x = v[i];
    if (codice && codici.indexOf(String(x[2] || '').trim().toUpperCase()) < 0) continue;
    r.push({t: x[0] && typeof x[0].getTime === 'function' ? x[0].getTime() : null, bar: String(x[1] || ''), codice: String(x[2] || ''), cosa: String(x[3] || ''),
      foto: Number(x[4]) || 0, tin: Number(x[5]) || 0, tout: Number(x[6]) || 0, costo: Number(x[7]) || 0, esito: String(x[8] || '')});
  }
  return r;
}
function precedenti_(pr, c) { var x; try { x = JSON.parse(pr.getProperty('prima|' + c) || '[]'); } catch (e) { x = []; } return Array.isArray(x) ? x : []; }
function mesiRec_(pr) { var x; try { x = JSON.parse(pr.getProperty('MESI') || '{}') || {}; } catch (e) { x = {}; } return x; }
function mesi_(pr) {
  var x = mesiRec_(pr);
  return Object.keys(x).sort().reverse().slice(0, 12).map(function (m) { var t = x[m] || {}; return {mese: m, foto: Number(t.f) || 0, costo: Number(t.c) || 0, letture: Number(t.l) || 0}; });
}

/* ---------- il riepilogo del mattino, per email ---------- */
// L'attivatore giornaliero lo installa il pannello quando lo accendi; parte all'ora scelta, nel fuso italiano.
function riepilogoGiornaliero() {
  var c = imp_();
  if (!c.emailAttiva) return;
  var r = riepilogo_();
  if (r.cose || c.emailSempre) manda_(r);
}
function provaRiepilogo_() { var r = riepilogo_(); manda_(r); return {ok: true, a: r.a, oggetto: r.oggetto}; }
function riepilogo_() {
  var st = stato_(), c = st.imp, o = st.oggi, r = {a: c.email || st.account, ritardo: [], limitati: [], sospesi: [], scadenze: [], cambiano: [], fatturare: [], gravi: []};
  st.bar.forEach(function (b) {
    var a = b.abb;
    if (a.modo === 'automatico' && ((a.fase === 'limitato' && a.giorni === c.limitaDopo + 1) || (a.fase === 'sospeso' && a.giorni === c.sospendiDopo + 1))) r.cambiano.push(b);
    if (a.stato === 'sospeso') r.sospesi.push(b);
    else if (a.stato === 'limitato') r.limitati.push(b);
    else if (a.fase === 'ritardo') r.ritardo.push(b);
    else if (a.fase === 'scadenza') r.scadenze.push(b);
  });
  r.fatturare = st.interventi.filter(function (x) { return x.stato === 'da fatturare'; });
  var ieri = Date.now() - 864e5;
  r.gravi = st.letture.filter(function (x) { return x.t > ieri && /^(crediti|chiave_api)\b/.test(x.esito); });
  r.cose = r.ritardo.length + r.limitati.length + r.sospesi.length + r.scadenze.length + r.cambiano.length + r.gravi.length;
  var parti = [];
  if (r.gravi.length) parti.push('problemi con Claude');
  if (r.ritardo.length + r.limitati.length + r.sospesi.length) parti.push((r.ritardo.length + r.limitati.length + r.sospesi.length) + ' in ritardo');
  if (r.scadenze.length) parti.push(r.scadenze.length + (r.scadenze.length === 1 ? ' scadenza' : ' scadenze'));
  r.oggetto = 'Barista Flow · ' + (parti.length ? parti.join(', ') : 'tutto in regola');
  r.st = st;
  return r;
}
function manda_(r) {
  var st = r.st, c = st.imp, eu = function (x) { return (Math.round(x * 100) / 100).toFixed(2).replace('.', ',') + ' €'; };
  var data = function (s) { return s ? +s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; };
  var h = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var riga = function (b, dett) { return '<li><b>' + h(b.nome) + '</b> · ' + h(dett) + (b.telefono ? ' · ' + h(b.telefono) : '') + '</li>'; };
  var sez = [], testo = [];
  var aggiungi = function (titolo, elenco, dett) {
    if (!elenco.length) return;
    sez.push('<h3 style="margin:18px 0 6px;font:600 15px sans-serif">' + h(titolo) + '</h3><ul style="margin:0;padding-left:18px">' + elenco.map(function (b) { return riga(b, dett(b)); }).join('') + '</ul>');
    testo.push(titolo + ':\n' + elenco.map(function (b) { return '- ' + b.nome + ' · ' + dett(b); }).join('\n'));
  };
  if (r.gravi.length) aggiungi('Claude', [r.gravi[0]].map(function (x) { return {nome: /^crediti/.test(x.esito) ? 'Crediti finiti' : 'Chiave API rifiutata', telefono: ''}; }), function () { return 'le letture si fermano per tutti i bar'; });
  aggiungi('Cambiano oggi', r.cambiano, function (b) { return b.abb.fase === 'sospeso' ? 'da oggi in sola lettura' : 'da oggi senza lettura con Claude'; });
  aggiungi('Sospesi', r.sospesi.filter(function (b) { return r.cambiano.indexOf(b) < 0; }), function (b) { return b.abb.modo === 'sospeso' ? 'sospeso a mano' : 'da pagare dal ' + data(b.abb.entro); });
  aggiungi('Limitati', r.limitati.filter(function (b) { return r.cambiano.indexOf(b) < 0; }), function (b) { return b.abb.modo === 'limitato' ? 'limitato a mano' : 'da pagare dal ' + data(b.abb.entro) + (b.abb.prossimo ? ', sola lettura dal ' + data(b.abb.prossimo.data) : ''); });
  aggiungi('In ritardo', r.ritardo, function (b) { return 'da pagare entro il ' + data(b.abb.entro) + ' · canone ' + eu(b.canone) + (b.abb.prossimo ? ' · ' + (b.abb.prossimo.fase === 'limitato' ? 'si limita' : 'va in sola lettura') + ' il ' + data(b.abb.prossimo.data) : ''); });
  aggiungi('In scadenza', r.scadenze, function (b) { return (b.abb.primo ? 'primo canone' : 'rinnovo') + ' entro il ' + data(b.abb.entro) + ' · canone ' + eu(b.canone); });
  var daf = r.fatturare.reduce(function (t, x) { return t + x.importo; }, 0);
  var piede = (r.fatturare.length ? 'Interventi da fatturare: ' + r.fatturare.length + ', per ' + eu(daf) + '. ' : '') + 'Foto lette questo mese: ' + ((st.mesi[0] && st.mesi[0].mese === st.mese) ? st.mesi[0].foto : 0) + '.';
  var html = '<div style="font:15px/1.5 sans-serif;color:#17211d;max-width:560px">' + (sez.length ? sez.join('') : '<p>Tutto in regola: nessun ritardo e nessuna scadenza vicina.</p>') +
    '<p style="margin-top:18px;color:#5c6661">' + h(piede) + '</p>' + (c.indirizzo ? '<p><a href="' + h(c.indirizzo) + '">Apri il pannello</a></p>' : '') + '</div>';
  MailApp.sendEmail({to: r.a, subject: r.oggetto, htmlBody: html, body: (testo.length ? testo.join('\n\n') : 'Tutto in regola.') + '\n\n' + piede, name: 'Barista Flow'});
}
// senza argomenti dice se l'attivatore c'è; con true lo rimette all'ora scelta (o lo toglie se il riepilogo è spento)
function orologio_(rifai) {
  var ts = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'riepilogoGiornaliero'; });
  if (!rifai) return ts.length > 0;
  ts.forEach(function (t) { ScriptApp.deleteTrigger(t); });
  var c = imp_();
  if (c.emailAttiva) ScriptApp.newTrigger('riepilogoGiornaliero').timeBased().everyDays(1).atHour(c.emailOra).inTimezone(FUSO).create();
  return c.emailAttiva;
}

/* piccoli aiuti */
function conLucchetto_(fn) { var lock = LockService.getScriptLock(); lock.waitLock(20000); try { return fn(); } finally { lock.releaseLock(); } }
function no_(m) { return {ok: false, messaggio: m}; }
function sparito_() { return no_('Questo bar non c’è più nel foglio: forse l’hai tolto da lì.'); }
function testo_(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); }
function numero_(v) { var s = String(v == null ? '' : v).trim().replace(',', '.'); return s && /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN; }
function euro_(v) { var n = typeof v === 'number' ? v : numero_(String(v == null ? '' : v).replace(/[€\s]/g, '')); return isFinite(n) ? Math.round(n * 100) / 100 : NaN; }
function dataData_(v) { var s = String(v == null ? '' : v).trim(); if (!s) return ''; return iso_(s) || null; }   // vuoto, una data AAAA-MM-GG, o null
function emailValida_(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); }
function cella_(s) { s = String(s == null ? '' : s); return /^[=+\-@]/.test(s) ? "'" + s : s; }   // un nome che comincia con = non diventa una formula
function testo1_(s) { return s ? "'" + s : ''; }   // date, partite IVA e telefoni restano testo: niente zeri persi, niente date girate

/* ---------- la pagina del pannello ----------
 * La scrive build.py a partire da apps-script/pannello.html: per cambiarla si modifica quel file e si rilancia build.py.
 * Così su Google si incolla un file solo. */
var PANNELLO = [
"<!DOCTYPE html>",
"<html lang=\"it\">",
"<head>",
"<base target=\"_top\">",
"<meta charset=\"utf-8\">",
"<meta name=\"color-scheme\" content=\"light dark\">",
"<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">",
"<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
"<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400..700&display=swap\">",
"<style>",
"/* La console del ponte: la stessa voce di Barista Flow (porcellana e marmo chiaro, verde Alpi per azioni e struttura,",
"   ottone come filo sottile, stati in bordeaux, ocra e salvia; un solo carattere, Instrument Sans). */",
":root{",
"  color-scheme:light dark;",
"  --bg:#f1f1ec;--surf:#fff;--surf2:#ecece5;--surf3:#e1e1d8;",
"  --edge:rgba(23,33,29,.09);--line:rgba(23,33,29,.10);--line2:rgba(23,33,29,.16);",
"  --ink:#17211d;--ink2:#5c6661;--ink3:#959d98;",
"  --pri:#1e3d33;--onpri:#f7f2e8;--pritint:rgba(30,61,51,.08);",
"  --brass:#b38e4f;--brasst:#7c5c24;",
"  --red:#a3281d;--redbg:#f7e7e3;--amb:#875600;--ambbg:#f5ecd7;--ambf:#d99c35;--good:#2b6944;--goodbg:#e2eee5;",
"  --sh1:0 1px 2px rgba(20,32,27,.05);",
"  --f:\"Instrument Sans\",ui-sans-serif,system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;",
"  --mono:ui-monospace,\"SF Mono\",Menlo,Consolas,monospace;",
"}",
"@media (prefers-color-scheme:dark){:root{",
"  --bg:#0c1311;--surf:#131c19;--surf2:#1b2622;--surf3:#26332e;",
"  --edge:rgba(237,233,224,.075);--line:rgba(237,233,224,.10);--line2:rgba(237,233,224,.16);",
"  --ink:#ede9e0;--ink2:#a6aea9;--ink3:#737d78;",
"  --pri:#d6bc86;--onpri:#12201b;--pritint:rgba(214,188,134,.13);",
"  --brass:#c9a96d;--brasst:#dcc18c;",
"  --red:#f29b8f;--redbg:#3a1a16;--amb:#ebc070;--ambbg:#33270f;--ambf:#d9a441;--good:#93cfa8;--goodbg:#14301f;",
"  --sh1:0 1px 2px rgba(0,0,0,.3);",
"}}",
"*{box-sizing:border-box;min-width:0}",
"[hidden]{display:none!important}",
"html{-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent}",
"body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 var(--f);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;padding-bottom:calc(env(safe-area-inset-bottom) + 84px)}",
"body.lock{overflow:hidden}",
"button,input,select,textarea{font:inherit;color:inherit}",
"p{margin:0 0 10px}",
"a{color:var(--brasst)}",
"svg.i{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}",
":focus-visible{outline:2px solid var(--brass);outline-offset:2px}",
".wrap{max-width:720px;margin:0 auto;padding:0 16px 24px}",
"",
"/* testata */",
".top{display:flex;align-items:center;gap:11px;padding:calc(env(safe-area-inset-top) + 14px) 0 6px}",
".logo{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:radial-gradient(130% 120% at 28% 18%,#2f5d4e 0%,#1b382f 55%,#12271f 100%);color:#f1e8d8;flex:none;box-shadow:inset 0 0 0 1px rgba(214,188,134,.42),0 1px 2px rgba(10,22,17,.25)}",
".logo svg{width:25px;height:25px}",
".names{display:grid;flex:1;line-height:1.15}",
".names b{font-size:18px;font-weight:650;letter-spacing:-.012em}",
".names small{font-size:12.5px;color:var(--ink2);letter-spacing:.01em}",
".iconbtn{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;border:0;background:transparent;color:var(--ink2);cursor:pointer;flex:none}",
".iconbtn:hover{background:var(--surf2);color:var(--ink)}",
".iconbtn.busy svg{animation:gira .8s linear infinite}",
"@keyframes gira{to{transform:rotate(360deg)}}",
"",
".hero{margin:18px 0 18px}",
".kick{margin:0 0 2px;font-size:15px;font-weight:500;color:var(--ink2)}",
".hero h1{margin:0;font-size:clamp(38px,11vw,48px);font-weight:600;line-height:1.05;letter-spacing:-.032em;font-variant-numeric:tabular-nums}",
".hero h1 span{font-size:.5em;font-weight:550;letter-spacing:-.01em;color:var(--ink2)}",
".hero .sub{margin:8px 0 0;color:var(--ink2);font-size:15.5px}",
".hero .sub b{color:var(--ink);font-weight:600}",
"",
".alert{display:flex;gap:12px;align-items:flex-start;margin:0 0 16px;padding:14px 16px;border-radius:16px;background:var(--redbg);color:var(--red)}",
".alert.amb{background:var(--ambbg);color:var(--amb)}",
".alert svg.i{margin-top:2px}",
".alert div{flex:1}",
".alert b{display:block;font-weight:650}",
".alert p{margin:2px 0 0;font-size:14.5px;line-height:1.45;color:inherit;opacity:.92}",
".alert .btn{margin-top:10px}",
"",
"/* barra in basso */",
".tabs{position:fixed;left:0;right:0;bottom:0;z-index:30;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));max-width:720px;margin:0 auto;padding:6px 6px calc(env(safe-area-inset-bottom) + 6px);background:color-mix(in srgb,var(--surf) 92%,transparent);backdrop-filter:saturate(160%) blur(18px);-webkit-backdrop-filter:saturate(160%) blur(18px);border-top:1px solid var(--line)}",
".tabs button{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;min-height:52px;padding:4px 0 2px;border:0;border-radius:12px;background:none;color:var(--ink2);font-size:11.5px;font-weight:550;letter-spacing:.01em;cursor:pointer}",
".tabs button svg.i{width:23px;height:23px}",
".tabs button[aria-current=page]{color:var(--pri)}",
".tabs button[aria-current=page] svg.i{stroke-width:2}",
".tabs .n{position:absolute;top:2px;left:calc(50% + 6px);min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--red);color:#fff;font-size:11px;font-weight:700;line-height:18px}",
"@media (min-width:760px){.tabs{border:1px solid var(--line);border-bottom:0;border-radius:18px 18px 0 0}}",
"",
"/* segmenti */",
".seg{display:flex;gap:2px;padding:3px;border-radius:13px;background:var(--surf2);box-shadow:inset 0 0 0 1px var(--edge);overflow-x:auto;scrollbar-width:none}",
".seg::-webkit-scrollbar{display:none}",
".seg button{appearance:none;flex:1 1 auto;min-height:38px;padding:0 12px;border:0;border-radius:10px;background:transparent;color:var(--ink2);font-weight:550;font-size:14px;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s}",
".seg button[aria-pressed=true]{background:var(--surf);color:var(--ink);font-weight:600;box-shadow:0 1px 2px rgba(20,32,27,.1),0 0 0 1px var(--edge)}",
".seg button.busy{opacity:.55;cursor:progress}",
".seg.sm{display:inline-flex}",
".seg.sm button{flex:none;min-height:34px;padding:0 13px}",
".fld .seg{margin:0}",
"",
"h2{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:28px 0 12px;font-size:21px;font-weight:650;line-height:1.2;letter-spacing:-.02em}",
"h2:first-child{margin-top:0}",
"h3{margin:0 0 8px;font-size:15.5px;font-weight:600;line-height:1.3}",
".card{margin:0 0 14px;padding:16px;border-radius:18px;background:var(--surf);box-shadow:var(--sh1),0 0 0 1px var(--edge)}",
".card>:last-child{margin-bottom:0}",
".muted{color:var(--ink2)}",
".hint{display:block;margin:4px 0 12px;font-size:14px;line-height:1.45;color:var(--ink2)}",
".foot{margin:34px 0 0;font-size:13px;color:var(--ink3);text-align:center}",
"",
"/* bottoni */",
".btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:48px;padding:0 18px;border:0;border-radius:12px;background:var(--surf);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line2);font-family:var(--f);font-weight:600;font-size:15px;line-height:1;cursor:pointer;text-decoration:none;white-space:nowrap;transition:transform .08s,background .15s,opacity .15s}",
".btn:hover{background:var(--surf2)}",
".btn:active{transform:scale(.98)}",
".btn.pri{background:var(--pri);color:var(--onpri);box-shadow:none}",
".btn.pri:hover{background:color-mix(in srgb,var(--pri) 88%,#fff)}",
".btn.dan{background:var(--redbg);color:var(--red);box-shadow:none}",
".btn.ghost{background:transparent;box-shadow:none}",
".btn.sm{height:38px;padding:0 14px;border-radius:10px;font-size:14px}",
".btn.w{width:100%}",
".btn.icon{width:40px;height:40px;padding:0;border-radius:50%}",
".btn[disabled]{opacity:.5;cursor:progress;transform:none}",
".btn.busy{position:relative;color:transparent!important}",
".btn.busy::after{content:\"\";position:absolute;width:18px;height:18px;border-radius:50%;border:2px solid currentColor;border-color:var(--ink2) transparent var(--ink2) transparent;animation:gira .8s linear infinite}",
".btn.pri.busy::after{border-color:var(--onpri) transparent var(--onpri) transparent}",
".btn svg.i{width:18px;height:18px}",
".acts{display:flex;flex-wrap:wrap;gap:8px}",
".acts .btn{flex:1 1 auto}",
"",
"/* campi */",
".fld{display:grid;gap:6px;margin:0 0 14px}",
".fld>span{font-size:13.5px;font-weight:550;color:var(--ink2)}",
"input[type=text],input[type=url],input[type=password],input[type=search],input[type=email],input[type=tel],input[type=date],select,textarea{width:100%;min-height:48px;padding:10px 14px;font-size:16px;color:var(--ink);background:var(--surf);border:1px solid var(--line2);border-radius:12px;-webkit-appearance:none;appearance:none;transition:border-color .15s,box-shadow .15s}",
"select{background-image:linear-gradient(45deg,transparent 50%,var(--ink2) 50%),linear-gradient(135deg,var(--ink2) 50%,transparent 50%);background-position:calc(100% - 20px) 21px,calc(100% - 15px) 21px;background-size:5px 5px;background-repeat:no-repeat;padding-right:38px}",
"textarea{min-height:96px;resize:vertical;line-height:1.5}",
"input::placeholder,textarea::placeholder{color:var(--ink3)}",
"input:focus,select:focus,textarea:focus{outline:none;border-color:var(--brass);box-shadow:0 0 0 3px color-mix(in srgb,var(--brass) 22%,transparent)}",
".g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 12px}",
".chk{display:flex;align-items:center;gap:12px;min-height:44px;margin:0 0 8px;font-weight:500;cursor:pointer}",
".chk input{width:21px;height:21px;margin:0;accent-color:var(--pri);flex:none}",
".err{margin:0 0 14px;padding:10px 14px;border-radius:12px;background:var(--redbg);color:var(--red);font-weight:600;font-size:14.5px}",
".err:empty{display:none}",
".conta{float:right;font-size:12.5px;color:var(--ink3);font-weight:500}",
"",
"/* primo avvio */",
".guida ol{list-style:none;margin:0;padding:0}",
".guida li{display:flex;align-items:center;gap:12px;padding:12px 0}",
".guida li+li{border-top:1px solid var(--line)}",
".guida .n{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;flex:none;background:var(--surf);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--brass) 60%,transparent);color:var(--brasst);font-weight:650;font-size:14px}",
".guida li.ok .n{background:var(--goodbg);box-shadow:none;color:var(--good)}",
".guida li.ok .n svg{width:17px;height:17px}",
".guida .m{flex:1;display:grid}",
".guida .m b{font-weight:600;line-height:1.3}",
".guida .m small{font-size:13.5px;color:var(--ink2);line-height:1.4}",
".guida li.ok .m b{color:var(--ink2)}",
"",
"/* elenchi */",
".list{background:var(--surf);border-radius:18px;box-shadow:var(--sh1),0 0 0 1px var(--edge);overflow:hidden}",
".row{position:relative;display:flex;align-items:center;gap:14px;width:100%;min-height:62px;padding:12px 16px;border:0;background:transparent;text-align:left;color:var(--ink);cursor:pointer;-webkit-appearance:none;appearance:none}",
".row.ro{cursor:default}",
"button.row:hover{background:color-mix(in srgb,var(--surf2) 60%,transparent)}",
".row+.row::before{content:\"\";position:absolute;top:0;right:0;left:16px;border-top:1px solid var(--line)}",
".row .m{flex:1;display:grid;gap:2px}",
".row .m b{font-weight:550;font-size:16px;line-height:1.3}",
".row .m>span{font-size:14px;color:var(--ink2);line-height:1.4;font-variant-numeric:tabular-nums}",
".row .m small{font-size:13px;color:var(--ink3);line-height:1.35;overflow-wrap:anywhere}",
".row .m>.tit{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--ink);font-size:16px}",
".row .s{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:6px;text-align:right}",
".row .s .t{font-size:13px;color:var(--ink2);white-space:nowrap}",
".row .s b{font-variant-numeric:tabular-nums;font-weight:650}",
".row .chev{color:var(--ink3)}",
".empty{padding:26px 20px;border-radius:18px;background:var(--surf);box-shadow:0 0 0 1px var(--edge);color:var(--ink2);text-align:center;font-size:15px}",
".hd{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px}",
".hd h2{margin:0}",
".filtri{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}",
".fch{appearance:none;min-height:36px;padding:0 14px;border:0;border-radius:999px;background:var(--surf2);color:var(--ink2);font:600 13.5px var(--f);cursor:pointer}",
".fch[aria-pressed=true]{background:var(--pri);color:var(--onpri)}",
".srch{margin:0 0 12px}",
"",
".meter{display:block;height:6px;margin:6px 0 2px;border-radius:99px;background:var(--surf2);overflow:hidden}",
".meter i{display:block;height:100%;border-radius:99px;background:var(--pri);min-width:3px}",
".meter.amb i{background:var(--ambf)}",
".meter.red i{background:var(--red)}",
".meter.big{height:9px;margin:10px 0 8px}",
"",
".chip{display:inline-flex;align-items:center;min-height:22px;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:650;line-height:1.25;background:var(--surf2);color:var(--ink2);white-space:nowrap}",
".chip.red{background:var(--redbg);color:var(--red)}",
".chip.amb{background:var(--ambbg);color:var(--amb)}",
".chip.okk{background:var(--goodbg);color:var(--good)}",
"",
"/* stato dell'abbonamento */",
".stato{padding:16px;border-radius:18px;margin:0 0 14px;background:var(--surf);box-shadow:var(--sh1),0 0 0 1px var(--edge)}",
".stato.okk{background:var(--goodbg);box-shadow:none;color:var(--good)}",
".stato.amb{background:var(--ambbg);box-shadow:none;color:var(--amb)}",
".stato.red{background:var(--redbg);box-shadow:none;color:var(--red)}",
".stato b.t{display:block;font-size:19px;font-weight:650;letter-spacing:-.015em;margin:0 0 4px}",
".stato p{margin:0 0 4px;font-size:14.5px;line-height:1.45;color:inherit}",
".stato .btn{margin-top:12px}",
".stato .piano{color:var(--ink2)}",
".stato.okk .piano,.stato.amb .piano,.stato.red .piano{color:inherit;opacity:.85}",
".spieg{margin:10px 0 0;font-size:14px;line-height:1.45;color:var(--ink2)}",
"",
"/* scheda del cliente */",
".conn{background:var(--pritint);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pri) 22%,transparent)}",
".kv{display:grid;gap:2px;margin:0 0 12px}",
".kv>span{font-size:13px;font-weight:550;color:var(--ink2)}",
".kv .val{display:flex;align-items:center;gap:6px}",
".kv .val>*:first-child{flex:1}",
".code{font-family:var(--mono);font-size:24px;font-weight:600;letter-spacing:.04em;user-select:all;-webkit-user-select:all}",
".url{font-family:var(--mono);font-size:13.5px;line-height:1.45;color:var(--ink);overflow-wrap:anywhere;user-select:all;-webkit-user-select:all}",
".kv .btn.icon{background:var(--surf)}",
".ok-banner{display:flex;gap:10px;align-items:center;margin:0 0 14px;padding:12px 14px;border-radius:14px;background:var(--goodbg);color:var(--good);font-weight:600}",
".nums{display:flex;flex-wrap:wrap;gap:4px 18px;font-size:14.5px;color:var(--ink2)}",
".nums b{color:var(--ink);font-weight:650;font-variant-numeric:tabular-nums}",
".conf{margin:12px 0 0;padding:14px;border-radius:14px;background:var(--surf2)}",
".conf p{font-size:14.5px;line-height:1.45}",
".modulo{margin:0 0 14px;padding:16px;border-radius:18px;background:var(--surf);box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--pri) 35%,transparent)}",
".contatti{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}",
"",
"/* soldi */",
".cifre{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0 0 14px}",
".cifra{padding:14px 16px;border-radius:16px;background:var(--surf);box-shadow:var(--sh1),0 0 0 1px var(--edge)}",
".cifra span{display:block;font-size:13px;font-weight:550;color:var(--ink2)}",
".cifra b{display:block;margin-top:2px;font-size:22px;font-weight:650;letter-spacing:-.02em;font-variant-numeric:tabular-nums}",
".cifra small{display:block;font-size:12.5px;color:var(--ink3)}",
".barra{display:block;height:6px;margin-top:6px;border-radius:99px;background:var(--surf2);overflow:hidden}",
".barra i{display:block;height:100%;background:var(--brass);border-radius:99px}",
"",
"/* foglio in basso */",
"#sheet{position:fixed;inset:0;z-index:50;display:flex;align-items:flex-end;justify-content:center}",
".scrim{position:absolute;inset:0;background:rgba(12,24,19,.42);animation:fade .2s ease-out}",
".sheet{position:relative;width:100%;max-width:620px;max-height:calc(100dvh - 12px);display:flex;flex-direction:column;background:var(--bg);border-radius:24px 24px 0 0;box-shadow:0 -12px 40px rgba(0,0,0,.18);animation:su .28s cubic-bezier(.2,.85,.25,1)}",
".sh-head{display:flex;align-items:center;gap:10px;padding:14px 12px 10px 20px}",
".sh-head h2{flex:1;margin:0;font-size:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}",
".sh-head .btn.icon{background:var(--surf);box-shadow:inset 0 0 0 1px var(--line2)}",
".sh-tabs{padding:0 16px 10px}",
".sh-body{flex:1;overflow:auto;padding:4px 16px 24px;overscroll-behavior:contain}",
".sh-foot{display:flex;gap:10px;padding:12px 16px calc(env(safe-area-inset-bottom) + 12px);border-top:1px solid var(--line)}",
".sh-foot .btn{flex:1 1 0}",
"@keyframes fade{from{opacity:0}}",
"@keyframes su{from{transform:translateY(40px);opacity:.4}}",
"@media (min-width:700px){#sheet{align-items:center}.sheet{border-radius:24px;max-height:min(88dvh,900px)}}",
"#sheet.fermo .scrim,#sheet.fermo .sheet{animation:none}   /* già aperto: cambia solo il contenuto */",
"@media (prefers-reduced-motion:reduce){.scrim,.sheet{animation:none}}",
"",
"#toast{position:fixed;left:0;right:0;bottom:calc(env(safe-area-inset-bottom) + 92px);z-index:70;display:grid;justify-items:center;gap:8px;padding:0 16px;pointer-events:none}",
".toast{max-width:560px;padding:12px 16px;border-radius:14px;background:#17211d;color:#f1efe8;font-size:14.5px;font-weight:550;line-height:1.4;box-shadow:0 10px 30px rgba(0,0,0,.25);animation:su .25s ease-out}",
".toast.ko{background:#7d1f16}",
"body.lock #toast{bottom:calc(env(safe-area-inset-bottom) + 18px)}",
".blocco{margin:60px auto;max-width:440px;text-align:center}",
".blocco h1{font-size:26px;letter-spacing:-.02em;margin:0 0 10px}",
".load{margin:60px 0;text-align:center;color:var(--ink2)}",
"</style>",
"</head>",
"<body>",
"<div class=\"wrap\">",
"  <header class=\"top\">",
"    <span class=\"logo\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M6.1 9.6l.55 4.3a4.3 4.3 0 0 0 4.27 3.8h1.16a4.3 4.3 0 0 0 4.27-3.8l.55-4.3M16.6 11.1h.9a1.85 1.85 0 0 1 0 3.7h-1.45M4.6 19.8c2.6.85 11.2.85 13.8 0\"/><path d=\"M6.1 9.6h10.8M10 3.6c.95.85-.95 1.85 0 2.75M13 3.6c.95.85-.95 1.85 0 2.75\" stroke=\"#d4b47c\"/></svg></span>",
"    <span class=\"names\"><b>Barista Flow</b><small>Console del servizio</small></span>",
"    <button type=\"button\" class=\"iconbtn\" data-act=\"aggiorna\" aria-label=\"Aggiorna\" title=\"Aggiorna\"><svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7\"/></svg></button>",
"  </header>",
"  <main id=\"app\"><p class=\"load\">Un attimo…</p></main>",
"</div>",
"<nav class=\"tabs\" id=\"tabs\" aria-label=\"Sezioni\" hidden></nav>",
"<div id=\"sheet\" hidden></div>",
"<div id=\"toast\" aria-live=\"polite\"></div>",
"<script>",
"\"use strict\";",
"let ST = /*STATO*/null;   // lo stato arriva già dentro la pagina; dopo ogni azione lo rimanda il ponte",
"const UI = {tab: 'clienti', filtro: 'tutti', cerca: '', fLett: 'tutte', sheet: null, sub: 'abbonamento', form: null, conferma: null, lett: null, imp: null, bozza: {}};",
"",
"/* ---------- aiuti ---------- */",
"const $ = (s, r = document) => r.querySelector(s);",
"const esc = s => String(s == null ? '' : s).replace(/[&<>\"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;'}[c]));",
"const nf = (a, b) => new Intl.NumberFormat('it-IT', {minimumFractionDigits: a, maximumFractionDigits: b});",
"const num = v => nf(0, 0).format(+v || 0);",
"const euro = v => { v = +v || 0; return (Number.isInteger(Math.round(v * 100) / 100) ? nf(0, 0).format(v) : nf(2, 2).format(v)) + ' €'; };",
"const euro2 = v => nf(2, 2).format(+v || 0);   // nei campi: 39,90",
"const dollari = v => { v = +v || 0; return (v === 0 ? '0' : v < 0.01 ? nf(2, 4).format(v) : nf(2, 2).format(v)) + ' $'; };",
"const prezzo = v => nf(2, 4).format(+v || 0);",
"const stessoGiorno = (a, b) => a.toDateString() === b.toDateString();",
"function quando(t) {",
"  if (!t) return '';",
"  const d = new Date(t), oggi = new Date(), ora = d.toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'});",
"  if (stessoGiorno(d, oggi)) return 'oggi ' + ora;",
"  if (stessoGiorno(d, new Date(oggi.getTime() - 864e5))) return 'ieri ' + ora;",
"  return d.toLocaleDateString('it-IT', d.getFullYear() === oggi.getFullYear() ? {day: 'numeric', month: 'short'} : {day: 'numeric', month: 'short', year: 'numeric'}) + ', ' + ora;",
"}",
"const dIso = s => { const [y, m, g] = String(s).split('-').map(Number); return new Date(y, m - 1, g); };",
"const isoD = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;",
"const piuGiorni = (s, n) => { const d = dIso(s); d.setDate(d.getDate() + n); return isoD(d); };",
"const giorni = (a, b) => Math.round((dIso(b) - dIso(a)) / 864e5);",
"function data(s, anno) {   // 31 dic (2027 se non è quest'anno)",
"  if (!s) return '';",
"  const d = dIso(s), y = ST && ST.oggi ? +ST.oggi.slice(0, 4) : new Date().getFullYear();",
"  return primo(d.toLocaleDateString('it-IT', anno || d.getFullYear() !== y ? {day: 'numeric', month: 'short', year: 'numeric'} : {day: 'numeric', month: 'short'}));",
"}",
"const primo = s => s.replace(/^1 /, '1° ');   // il primo del mese si scrive 1°",
"const dataLunga = s => s ? primo(dIso(s).toLocaleDateString('it-IT', {day: 'numeric', month: 'long', year: 'numeric'})) : '';",
"function nomeMese(m) {",
"  const [y, mo] = String(m).split('-').map(Number), s = new Date(y, mo - 1, 1).toLocaleDateString('it-IT', {month: 'long', year: 'numeric'});",
"  return s.charAt(0).toUpperCase() + s.slice(1);",
"}",
"const PIANI = {mensile: ['Mensile', 1, 'mese'], trimestrale: ['Trimestrale', 3, 'trimestre'], semestrale: ['Semestrale', 6, 'semestre'], annuale: ['Annuale', 12, 'anno']};",
"const METODI = {bonifico: 'Bonifico', contanti: 'Contanti', carta: 'Carta', altro: 'Altro'};",
"const STATI_INT = {'da fatturare': ['amb', 'Da fatturare'], fatturato: ['', 'Fatturato'], pagato: ['okk', 'Pagato']};",
"const IMPEGNI = {low: 'Basso', medium: 'Medio', high: 'Alto'};",
"const mensile = b => b.piano && b.canone ? b.canone / PIANI[b.piano][1] : 0;",
"const I = {",
"  plus: '<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M12 5v14M5 12h14\"/></svg>',",
"  check: '<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M5 12.5l4.5 4.5L19 7.5\"/></svg>',",
"  chev: '<svg class=\"i chev\" viewBox=\"0 0 24 24\"><path d=\"M9 5l7 7-7 7\"/></svg>',",
"  x: '<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M6 6l12 12M18 6L6 18\"/></svg>',",
"  copy: '<svg class=\"i\" viewBox=\"0 0 24 24\"><rect x=\"8\" y=\"8\" width=\"12\" height=\"12\" rx=\"2.5\"/><path d=\"M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8\"/></svg>',",
"  chat: '<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M20 11.5a7.5 7.5 0 0 1-11.1 6.6L4 19.5l1.4-4.6A7.5 7.5 0 1 1 20 11.5z\"/></svg>',",
"  alert: '<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M12 4l9 16H3l9-16zM12 10v4.5M12 17.5v.01\"/></svg>',",
"  tel: '<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z\"/></svg>',",
"  mail: '<svg class=\"i\" viewBox=\"0 0 24 24\"><rect x=\"3.5\" y=\"5.5\" width=\"17\" height=\"13\" rx=\"2.5\"/><path d=\"M4 7l8 6 8-6\"/></svg>',",
"  clienti: '<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M4 10.5h16M5 10.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8.5M3.5 10.5l2-5.5h13l2 5.5M10 20v-5h4v5\"/></svg>',",
"  incassi: '<svg class=\"i\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M15 8.6a4 4 0 1 0 0 6.8M7.5 11h6M7.5 13.2h6\"/></svg>',",
"  letture: '<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M4.5 8.5a2 2 0 0 1 2-2h2l1.5-2h4l1.5 2h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z\"/><circle cx=\"12\" cy=\"12.5\" r=\"3.3\"/></svg>',",
"  avvisi: '<svg class=\"i\" viewBox=\"0 0 24 24\"><path d=\"M4 10v4h3l6 4V6L7 10H4zM16.5 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11\"/></svg>',",
"  impostazioni: '<svg class=\"i\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z\"/></svg>'",
"};",
"",
"/* ---------- il ponte ---------- */",
"const run = (azione, dati = {}) => new Promise((ok, ko) => {",
"  const g = window.google && google.script && google.script.run;",
"  if (!g) return ko(new Error('Questa pagina funziona solo aperta dal ponte, su Google.'));",
"  g.withSuccessHandler(ok).withFailureHandler(ko).pannello(azione, dati);",
"});",
"const messaggioErrore = e => String((e && e.message) || e || 'Errore').replace(/^(Error|Exception|ScriptError):\\s*/i, '');",
"function toast(t, ko) {",
"  const box = $('#toast'), el = document.createElement('div');",
"  el.className = 'toast' + (ko ? ' ko' : ''); el.setAttribute('role', ko ? 'alert' : 'status'); el.textContent = t;",
"  box.appendChild(el);",
"  setTimeout(() => el.remove(), ko ? 6500 : Math.min(7000, 2600 + t.length * 25));",
"}",
"// esegue un'azione: il pulsante gira finché il ponte risponde; lo stato nuovo ridisegna la pagina",
"async function fai(btn, azione, dati, errEl) {",
"  if (btn) { btn.disabled = true; btn.classList.add('busy'); }",
"  if (errEl) errEl.textContent = '';",
"  try {",
"    const r = await run(azione, dati);",
"    if (r && r.stato) { ST = r.stato; render(); }",
"    if (r && r.ok === false) { const e = errEl && errEl.isConnected ? errEl : null; if (e) e.textContent = r.messaggio; else toast(r.messaggio, true); }",
"    return r;",
"  } catch (e) {",
"    const m = messaggioErrore(e);",
"    if (/si apre solo con l.account/i.test(m)) bloccato(m); else if (errEl && errEl.isConnected) errEl.textContent = m; else toast(m, true);",
"    return null;",
"  } finally {",
"    if (btn && btn.isConnected) { btn.disabled = false; btn.classList.remove('busy'); }",
"  }",
"}",
"function bloccato(m) {",
"  UI.sheet = null; renderSheet(); $('#tabs').hidden = true;",
"  $('#app').innerHTML = `<div class=\"blocco\"><h1>Pannello chiuso</h1><p class=\"muted\">${esc(m)}</p><p class=\"hint\">Se nel browser usi più account Google, apri la pagina con quello del ponte: per esempio da una finestra in incognito, entrando solo con quell’account.</p></div>`;",
"}",
"",
"/* ---------- lo stato di un abbonamento, come lo legge il gestore ---------- */",
"function abb(b) {",
"  const a = b.abb, cop = a.coperto, entro = a.entro, pr = a.prossimo;",
"  const poi = pr && pr.fase === 'limitato' ? `Dal ${data(pr.data)} si limita da solo: niente lettura con Claude.` : pr && pr.fase === 'sospeso' ? `Dal ${data(pr.data)} va in sola lettura.` : '';",
"  let r;",
"  if (a.fase === 'libero') r = {cls: '', chip: 'Senza abbonamento', t: 'Senza abbonamento', righe: ['Il servizio è sempre attivo.'], seguire: false};",
"  else if (a.fase === 'regola') r = {cls: 'okk', chip: 'In regola', t: 'In regola', righe: [cop ? `Coperto fino al ${dataLunga(cop)}.` : 'Ancora nessuna scadenza.'], seguire: false};",
"  else if (a.fase === 'scadenza') r = a.primo",
"    ? {cls: 'amb', chip: 'Primo canone', t: 'Primo canone da pagare', righe: [a.giorni === 0 ? 'Va pagato oggi.' : `Va pagato entro il ${dataLunga(entro)}.`], seguire: true}",
"    : {cls: 'amb', chip: a.giorni === 0 ? 'Da pagare oggi' : 'In scadenza', t: a.giorni === 0 ? 'Rinnovo da pagare oggi' : `Scade il ${dataLunga(cop)}`,",
"      righe: [a.giorni === 0 ? `Coperto fino a ieri, ${dataLunga(cop)}.` : `Il rinnovo va pagato entro il ${dataLunga(entro)}.`], seguire: true};",
"  else if (a.fase === 'ritardo') r = {cls: 'amb', chip: `In ritardo · ${a.giorni} gg`, t: `In ritardo di ${a.giorni} ${a.giorni === 1 ? 'giorno' : 'giorni'}`, righe: [`${a.primo ? 'Il primo canone' : 'Il rinnovo'} andava pagato entro il ${dataLunga(entro)}.`, poi], seguire: true};",
"  else if (a.fase === 'limitato') r = {cls: 'red', chip: 'Limitato', t: 'Limitato', righe: [`In ritardo di ${a.giorni} giorni: niente lettura con Claude né fatture dalla posta.`, poi], seguire: true};",
"  else r = {cls: 'red', chip: 'Sospeso', t: 'Sospeso', righe: [`In ritardo di ${a.giorni} giorni: l’app del bar è in sola lettura.`], seguire: true};",
"  if (a.modo === 'attivo') { r.chip = 'Attivo a mano'; r.cls = 'okk'; r.righe = r.righe.filter(x => !/^Dal /.test(x)).concat('Attivo a mano: l’abbonamento non lo ferma.'); }",
"  if (a.modo === 'limitato') { r = {cls: 'red', chip: 'Limitato a mano', t: 'Limitato a mano', righe: ['Niente lettura con Claude né fatture dalla posta, finché non lo cambi.'], seguire: true}; }",
"  if (a.modo === 'sospeso') { r = {cls: 'red', chip: 'Sospeso a mano', t: 'Sospeso a mano', righe: ['L’app del bar è in sola lettura, finché non lo cambi.'], seguire: true}; }",
"  r.righe = r.righe.filter(Boolean);",
"  return r;",
"}",
"const pianoTesto = b => b.piano ? `${PIANI[b.piano][0]} · ${euro(b.canone)}` : 'Senza abbonamento';",
"const daSeguire = () => ST.bar.filter(b => abb(b).seguire);",
"",
"/* ---------- la pagina ---------- */",
"const SEZIONI = [['clienti', 'Clienti'], ['incassi', 'Incassi'], ['letture', 'Letture'], ['avvisi', 'Avvisi'], ['impostazioni', 'Impostazioni']];",
"function render() {",
"  const app = $('#app');",
"  if (!ST) { app.innerHTML = '<p class=\"load\">Un attimo…</p>'; return; }",
"  const V = {clienti: vistaClienti, incassi: vistaIncassi, letture: vistaLetture, avvisi: vistaAvvisi, impostazioni: vistaImpostazioni}[UI.tab] || vistaClienti;",
"  app.innerHTML = `${V()}<p class=\"foot\">Entrato come ${esc(ST.account)} · ponte versione ${esc(ST.versione)}</p>`;",
"  const n = daSeguire().length, tabs = $('#tabs');",
"  tabs.hidden = false;",
"  tabs.innerHTML = SEZIONI.map(([k, t]) => `<button type=\"button\" data-act=\"tab\" data-v=\"${k}\"${UI.tab === k ? ' aria-current=\"page\"' : ''}>${I[k]}<span>${t}</span>${k === 'clienti' && n ? `<span class=\"n\">${n}</span>` : ''}</button>`).join('');",
"  if (UI.sheet) renderSheet();",
"}",
"function avvisiGravi() {",
"  if (!ST.chiave.impostata) return ST.bar.length ? `<div class=\"alert\">${I.alert}<div><b>Manca la chiave API</b><p>Senza chiave i bar non possono leggere le etichette con Claude.</p><button type=\"button\" class=\"btn sm dan\" data-act=\"chiave\">Imposta la chiave</button></div></div>` : '';",
"  for (const x of ST.letture) {   // dalla più recente: un errore grave conta solo se dopo non c'è stata una lettura riuscita",
"    const k = x.esito.split(' · ')[0];",
"    if (k === 'ok' || k === 'etichetta non leggibile') break;",
"    if (k === 'crediti') return `<div class=\"alert\">${I.alert}<div><b>I crediti di Claude sono finiti</b><p>Le letture si fermano per tutti i bar finché non ricarichi dalla Console di Claude. Ultimo tentativo: ${esc(quando(x.t))}.</p></div></div>`;",
"    if (k === 'chiave_api') return `<div class=\"alert\">${I.alert}<div><b>Claude rifiuta la chiave API</b><p>Le letture si fermano per tutti i bar: prova la chiave o sostituiscila. Ultimo tentativo: ${esc(quando(x.t))}.</p><button type=\"button\" class=\"btn sm dan\" data-act=\"tab\" data-v=\"impostazioni\">Vai alla chiave</button></div></div>`;",
"  }",
"  return '';",
"}",
"const hero = (kick, h1, sub) => `<section class=\"hero\"><p class=\"kick\">${kick}</p><h1>${h1}</h1>${sub ? `<p class=\"sub\">${sub}</p>` : ''}</section>`;",
"",
"/* clienti */",
"function vistaClienti() {",
"  const n = ST.bar.length, seg = daSeguire(), canoni = ST.bar.reduce((t, b) => t + mensile(b), 0);",
"  const ritardo = seg.filter(b => ['ritardo', 'limitato', 'sospeso'].includes(b.abb.fase) || b.abb.modo !== 'automatico' && b.abb.modo !== 'attivo').length, scad = seg.length - ritardo;",
"  const sub = n ? [ritardo ? `<b>${ritardo}</b> in ritardo` : '', scad ? `<b>${scad}</b> in scadenza` : '', canoni ? `canoni ${euro(canoni)} al mese` : ''].filter(Boolean).join(' · ') || 'tutti in regola' : 'ancora nessun cliente';",
"  const passi = [",
"    {ok: ST.chiave.impostata, t: 'Chiave API di Claude', d: 'Si crea su platform.claude.com.', act: 'chiave', b: 'Imposta'},",
"    {ok: !!ST.imp.indirizzo, t: 'Indirizzo per i bar', d: 'L’URL di questa pagina, che finisce con /exec.', act: 'indirizzo', b: 'Incolla'},",
"    {ok: n > 0, t: 'Il primo cliente', d: 'Il ponte gli crea il codice.', act: 'nuovo', b: 'Aggiungi'}",
"  ];",
"  const guida = passi.every(p => p.ok) ? '' : `<section class=\"card guida\"><h2>Per cominciare</h2><ol>${passi.map((p, i) => `<li class=\"${p.ok ? 'ok' : ''}\"><span class=\"n\">${p.ok ? I.check : i + 1}</span><span class=\"m\"><b>${p.t}</b><small>${p.d}</small></span>${p.ok ? '' : `<button type=\"button\" class=\"btn sm${i === passi.findIndex(x => !x.ok) ? ' pri' : ''}\" data-act=\"${p.act}\">${p.b}</button>`}</li>`).join('')}</ol></section>`;",
"  const top = hero(esc(nomeMese(ST.mese)), `${num(n)} <span>${n === 1 ? 'cliente' : 'clienti'}</span>`, sub) + avvisiGravi();",
"  if (guida && !n) return top + guida;",
"  const f = (v, t, c) => `<button type=\"button\" class=\"fch\" data-act=\"filtro\" data-v=\"${v}\" aria-pressed=\"${UI.filtro === v}\">${t}${c != null ? ` · ${c}` : ''}</button>`;",
"  return `${top}${guida}<div class=\"hd\"><h2>Clienti</h2><button type=\"button\" class=\"btn sm pri\" data-act=\"nuovo\">${I.plus}Nuovo cliente</button></div>",
"    <div class=\"filtri\">${f('tutti', 'Tutti', n)}${f('seguire', 'Da seguire', seg.length)}${f('regola', 'In regola', n - seg.length)}</div>",
"    ${n > 6 ? `<div class=\"srch\"><input type=\"search\" data-k=\"cerca\" value=\"${esc(UI.cerca)}\" placeholder=\"Cerca un cliente\" aria-label=\"Cerca un cliente\"></div>` : ''}",
"    <div id=\"lista\">${listaClienti()}</div>`;",
"}",
"function listaClienti() {",
"  const q = UI.cerca.trim().toLowerCase();",
"  const peso = b => ({sospeso: 0, limitato: 1, ritardo: 2, scadenza: 3}[b.abb.fase] ?? 9);",
"  const bar = ST.bar.filter(b => UI.filtro === 'tutti' || (UI.filtro === 'seguire') === abb(b).seguire)",
"    .filter(b => !q || [b.nome, b.codice, b.note, b.ragione, b.referente, b.telefono, b.email].join(' ').toLowerCase().includes(q))",
"    .sort((a, b) => UI.filtro === 'seguire' ? peso(a) - peso(b) || a.nome.localeCompare(b.nome, 'it', {sensitivity: 'base'}) : a.nome.localeCompare(b.nome, 'it', {sensitivity: 'base'}));",
"  if (!bar.length) return `<p class=\"empty\">${q ? 'Nessun cliente con questo nome.' : UI.filtro === 'seguire' ? 'Nessuno da seguire: tutti in regola.' : 'Nessun cliente qui.'}</p>`;",
"  return `<div class=\"list\">${bar.map(rigaCliente).join('')}</div>`;",
"}",
"function rigaCliente(b) {",
"  const s = abb(b), a = b.abb, tetto = b.tetto || ST.imp.tetto;",
"  const cop = a.fase === 'libero' ? '' : a.primo ? ` · entro il ${data(a.entro)}` : a.coperto ? ` · fino al ${data(a.coperto)}` : '';",
"  const visto = b.visto && b.visto.t ? `visto ${quando(b.visto.t)}` : 'mai collegato';",
"  return `<button type=\"button\" class=\"row\" data-act=\"apri\" data-c=\"${esc(b.codice)}\">",
"    <span class=\"m\"><span class=\"tit\"><b>${esc(b.nome || 'Senza nome')}</b><span class=\"chip ${s.cls}\">${esc(s.chip)}</span></span>",
"      <span>${esc(pianoTesto(b))}${esc(cop)}</span><small>Claude ${num(b.usate)}/${num(tetto)} · ${esc(visto)}</small></span>",
"    <span class=\"s\">${I.chev}</span></button>`;",
"}",
"",
"/* incassi */",
"function vistaIncassi() {",
"  const anno = ST.oggi.slice(0, 4), pag = ST.pagamenti;",
"  const delMese = pag.filter(p => p.data.slice(0, 7) === ST.mese).reduce((t, p) => t + p.importo, 0), dellAnno = pag.filter(p => p.data.slice(0, 4) === anno).reduce((t, p) => t + p.importo, 0);",
"  const canoni = ST.bar.reduce((t, b) => t + mensile(b), 0), claudeEur = ST.bar.reduce((t, b) => t + b.costo, 0) * ST.imp.cambio;",
"  const inRitardo = ST.bar.filter(b => b.piano && ['ritardo', 'limitato', 'sospeso'].includes(b.abb.fase)).sort((a, b) => b.abb.giorni - a.abb.giorni);",
"  const fra30 = piuGiorni(ST.oggi, 30), prossimi = ST.bar.filter(b => b.piano && b.abb.entro && ['regola', 'scadenza'].includes(b.abb.fase) && b.abb.entro <= fra30).sort((a, b) => a.abb.entro < b.abb.entro ? -1 : 1);",
"  const daFatt = ST.interventi.filter(x => x.stato === 'da fatturare'), fatt = ST.interventi.filter(x => x.stato === 'fatturato');",
"  const somma = l => l.reduce((t, x) => t + (x.importo != null ? x.importo : x.canone), 0);",
"  const riga = (b, dx, sx) => `<button type=\"button\" class=\"row\" data-act=\"apri\" data-c=\"${esc(b.codice)}\"><span class=\"m\"><b>${esc(b.nome)}</b><span>${sx}</span></span><span class=\"s\"><b>${dx}</b></span></button>`;",
"  const mesi = [];",
"  for (let i = 0; i < 12; i++) { const d = dIso(ST.oggi.slice(0, 7) + '-01'); d.setMonth(d.getMonth() - i); const m = isoD(d).slice(0, 7); mesi.push([m, pag.filter(p => p.data.slice(0, 7) === m).reduce((t, p) => t + p.importo, 0)]); }",
"  const max = Math.max(1, ...mesi.map(x => x[1])), primo = mesi.findIndex((x, i) => mesi.slice(i).every(y => !y[1]));",
"  const mesiVisti = primo > 0 ? mesi.slice(0, primo) : primo === 0 ? [] : mesi;",
"  return `${hero(esc(nomeMese(ST.mese)), `${euro(delMese)} <span>incassati</span>`, `<b>${euro(dellAnno)}</b> nel ${anno} · canoni ${euro(canoni)} al mese`)}",
"    <div class=\"cifre\">",
"      <div class=\"cifra\"><span>Canoni al mese</span><b>${euro(canoni)}</b><small>${euro(canoni * 12)} l’anno</small></div>",
"      <div class=\"cifra\"><span>Margine al mese</span><b>${euro(canoni - claudeEur)}</b><small>Claude ${euro(claudeEur)} (${dollari(claudeEur / ST.imp.cambio)})</small></div>",
"      <div class=\"cifra\"><span>In ritardo</span><b>${euro(somma(inRitardo))}</b><small>${inRitardo.length} ${inRitardo.length === 1 ? 'cliente' : 'clienti'}, almeno un canone</small></div>",
"      <div class=\"cifra\"><span>Da fatturare</span><b>${euro(somma(daFatt))}</b><small>${daFatt.length} ${daFatt.length === 1 ? 'intervento' : 'interventi'}${fatt.length ? ` · ${euro(somma(fatt))} fatturati` : ''}</small></div>",
"    </div>",
"    ${inRitardo.length ? `<h2>In ritardo</h2><div class=\"list\">${inRitardo.map(b => riga(b, euro(b.canone), `${b.abb.giorni} ${b.abb.giorni === 1 ? 'giorno' : 'giorni'} · ${esc(b.abb.modo === 'attivo' ? 'attivo a mano' : b.abb.fase === 'sospeso' ? 'in sola lettura' : b.abb.fase === 'limitato' ? 'limitato' : b.abb.prossimo ? `si limita il ${data(b.abb.prossimo.data)}` : 'promemoria')}`)).join('')}</div>` : ''}",
"    <h2>Prossimi 30 giorni</h2>${prossimi.length ? `<div class=\"list\">${prossimi.map(b => riga(b, euro(b.canone), `${b.abb.primo ? 'primo canone' : 'rinnovo'} entro il ${data(b.abb.entro)}`)).join('')}</div>` : '<p class=\"empty\">Nessun canone in scadenza nei prossimi 30 giorni.</p>'}",
"    ${daFatt.length ? `<h2>Interventi da fatturare</h2><div class=\"list\">${daFatt.map(x => { const b = ST.bar.find(y => y.codice === x.codice); return `<button type=\"button\" class=\"row\" ${b ? `data-act=\"apri\" data-c=\"${esc(b.codice)}\" data-sub=\"interventi\"` : 'disabled'}><span class=\"m\"><b>${esc(x.descrizione)}</b><span>${esc(b ? b.nome : x.bar)} · ${data(x.data)}</span></span><span class=\"s\"><b>${euro(x.importo)}</b></span></button>`; }).join('')}</div>` : ''}",
"    <h2>Canoni incassati, mese per mese</h2>${mesiVisti.length ? `<div class=\"list\">${mesiVisti.map(([m, v]) => `<div class=\"row ro\"><span class=\"m\"><b>${esc(nomeMese(m))}</b><span class=\"barra\"><i style=\"width:${Math.round(v / max * 100)}%\"></i></span></span><span class=\"s\"><b>${euro(v)}</b></span></div>`).join('')}</div>` : '<p class=\"empty\">Ancora nessun pagamento registrato.</p>'}",
"    ${pag.length ? `<h2>Ultimi pagamenti</h2><div class=\"list\">${pag.slice(0, 15).map(p => { const b = ST.bar.find(y => y.codice === p.codice); return `<button type=\"button\" class=\"row\" ${b ? `data-act=\"apri\" data-c=\"${esc(b.codice)}\"` : 'disabled'}><span class=\"m\"><b>${esc(b ? b.nome : p.bar)}</b><span>${data(p.data)} · ${esc(METODI[p.metodo] || p.metodo)}${p.fino ? ` · fino al ${data(p.fino)}` : ''}</span></span><span class=\"s\"><b>${euro(p.importo)}</b></span></button>`; }).join('')}</div>` : ''}",
"    <p class=\"hint\" style=\"margin-top:14px\">Il margine toglie dai canoni il costo di Claude del mese, in euro al cambio delle Impostazioni (${esc(prezzo(ST.imp.cambio))} € per dollaro).</p>`;",
"}",
"",
"/* letture */",
"const ESITI = {ok: ['okk', 'Letta'], 'etichetta non leggibile': ['amb', 'Illeggibile'], rifiuto: ['amb', 'Rifiutata'], 'risposta troncata': ['amb', 'Risposta troncata'],",
"  'risposta non leggibile': ['amb', 'Risposta non valida'], chiave_api: ['red', 'Chiave API'], crediti: ['red', 'Crediti finiti'], occupato: ['amb', 'Claude occupato'],",
"  foto: ['amb', 'Foto rifiutata'], claude: ['amb', 'Errore di Claude']};",
"function esito(e) {",
"  e = String(e || ''); const i = e.indexOf(' · '), k = i >= 0 ? e.slice(0, i) : e, [cls, lbl] = ESITI[k] || ['amb', k || '—'];",
"  return {cls, lbl, det: i >= 0 ? e.slice(i + 3) : '', ok: k === 'ok'};",
"}",
"function righeLetture(L, conBar) {",
"  return `<div class=\"list\">${L.map(x => { const e = esito(x.esito); return `<div class=\"row ro\">",
"    <span class=\"m\"><b>${esc(conBar ? x.bar || x.codice : x.cosa)}</b><span>${conBar ? esc(x.cosa) + ' · ' : ''}${num(x.foto)} foto${x.costo ? ' · ' + dollari(x.costo) : ''}</span>${e.det ? `<small>${esc(e.det)}</small>` : ''}</span>",
"    <span class=\"s\"><span class=\"t\">${esc(quando(x.t))}</span><span class=\"chip ${e.cls}\">${esc(e.lbl)}</span></span></div>`; }).join('')}</div>`;",
"}",
"function vistaLetture() {",
"  const tot = ST.mesi.find(m => m.mese === ST.mese) || {foto: 0, costo: 0, letture: 0};",
"  const L = ST.letture.filter(x => UI.fLett !== 'errori' || !esito(x.esito).ok);",
"  const f = (v, t) => `<button type=\"button\" data-act=\"fLett\" data-v=\"${v}\" aria-pressed=\"${UI.fLett === v}\">${t}</button>`;",
"  const mesi = ST.mesi.length ? `<h2>Mese per mese</h2><div class=\"list\">${ST.mesi.map(m => `<div class=\"row ro\"><span class=\"m\"><b>${esc(nomeMese(m.mese))}</b><span>${num(m.foto)} foto in ${num(m.letture)} ${m.letture === 1 ? 'lettura' : 'letture'}</span></span><span class=\"s\"><b>${dollari(m.costo)}</b></span></div>`).join('')}</div>` : '';",
"  return `${hero(esc(nomeMese(ST.mese)), `${num(tot.foto)} <span>${tot.foto === 1 ? 'foto letta' : 'foto lette'}</span>`, `<b>${dollari(tot.costo)}</b> stimati, circa ${euro(tot.costo * ST.imp.cambio)}`)}${avvisiGravi()}",
"    <div class=\"hd\"><h2>Ultime letture</h2><div class=\"seg sm\">${f('tutte', 'Tutte')}${f('errori', 'Errori')}</div></div>",
"    ${L.length ? righeLetture(L, true) : `<p class=\"empty\">${UI.fLett === 'errori' ? 'Nessun errore fra le ultime letture.' : 'Ancora nessuna lettura. Compariranno qui appena un bar fotografa un’etichetta.'}</p>`}",
"    ${mesi}",
"    <p class=\"hint\" style=\"margin-top:14px\">Il costo è una stima: il ponte lo calcola dai token di ogni lettura con i prezzi delle Impostazioni. Il saldo dei crediti è nella Console di Claude. Tutte le letture restano nel foglio «Letture».</p>`;",
"}",
"",
"/* avvisi */",
"function vistaAvvisi() {",
"  const o = ST.oggi, inCorso = ST.avvisi.filter(a => (!a.dal || a.dal <= o) && (!a.al || a.al >= o)), futuri = ST.avvisi.filter(a => a.dal > o), finiti = ST.avvisi.filter(a => a.al && a.al < o);",
"  const chi = a => a.a === 'tutti' ? 'Tutti i bar' : (ST.bar.find(b => b.codice === a.a) || {}).nome || 'Un cliente tolto';",
"  const quandoAv = a => a.al ? `dal ${data(a.dal)} al ${data(a.al)}` : `dal ${data(a.dal)}`;",
"  const righe = l => `<div class=\"list\">${l.map(a => `<button type=\"button\" class=\"row\" data-act=\"avviso\" data-id=\"${esc(a.id)}\"><span class=\"m\"><span class=\"tit\"><b>${esc(chi(a))}</b>${a.importante ? '<span class=\"chip red\">Importante</span>' : ''}</span><span>${esc(a.testo.length > 140 ? a.testo.slice(0, 140) + '…' : a.testo)}</span><small>${esc(quandoAv(a))}</small></span><span class=\"s\">${I.chev}</span></button>`).join('')}</div>`;",
"  return `${hero('Nel Barista Flow dei bar', `${num(inCorso.length)} <span>${inCorso.length === 1 ? 'avviso in corso' : 'avvisi in corso'}</span>`, 'Compaiono in «Oggi», in cima alla pagina, finché non scadono.')}",
"    <div class=\"hd\"><h2>In corso</h2><button type=\"button\" class=\"btn sm pri\" data-act=\"avviso\">${I.plus}Nuovo avviso</button></div>",
"    ${inCorso.length ? righe(inCorso) : '<p class=\"empty\">Nessun avviso in corso.</p>'}",
"    ${futuri.length ? `<h2>Programmati</h2>${righe(futuri)}` : ''}${finiti.length ? `<h2>Finiti</h2>${righe(finiti.slice(0, 10))}` : ''}",
"    <p class=\"hint\" style=\"margin-top:14px\">Promemoria e ritardi dell’abbonamento il bar li vede da solo: questi sono per tutto il resto, come una manutenzione o una novità.</p>`;",
"}",
"",
"/* impostazioni */",
"function vistaImpostazioni() {",
"  const c = ST.imp, p = ST.predefinite, v = UI.imp || (UI.imp = {impegno: c.impegno});",
"  const imp = k => `<button type=\"button\" data-act=\"impegno\" data-v=\"${k}\" aria-pressed=\"${v.impegno === k}\">${IMPEGNI[k]}</button>`;",
"  const ore = Array.from({length: 24}, (_, h) => `<option value=\"${h}\"${c.emailOra === h ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');",
"  return `${hero('Impostazioni', 'Il servizio', '')}",
"    <section class=\"card\" id=\"cfg-abb\"><h3>Abbonamenti</h3>",
"      <p class=\"hint\" style=\"margin-top:0\">Quando un canone scade senza pagamento, il bar vede un promemoria; poi il servizio si limita da solo (niente lettura con Claude né fatture dalla posta) e infine l’app va in sola lettura. I dati restano sempre visibili ed esportabili; gli avvisi delle scadenze dei prodotti non si fermano mai.</p>",
"      <div class=\"g2\"><label class=\"fld\"><span>Promemoria, giorni prima</span><input type=\"text\" inputmode=\"numeric\" data-k=\"abb.preavviso\" value=\"${esc(c.preavviso)}\"></label>",
"        <label class=\"fld\"><span>Limita dopo, giorni di ritardo</span><input type=\"text\" inputmode=\"numeric\" data-k=\"abb.limitaDopo\" value=\"${esc(c.limitaDopo)}\"></label></div>",
"      <label class=\"fld\"><span>Sola lettura dopo, giorni di ritardo</span><input type=\"text\" inputmode=\"numeric\" data-k=\"abb.sospendiDopo\" value=\"${esc(c.sospendiDopo)}\"></label>",
"      <p class=\"hint\" style=\"margin-top:-6px\">0 vuol dire mai: decidi tu, a mano, dalla scheda del cliente.</p>",
"      <label class=\"fld\"><span>Il tuo contatto, che il bar vede nei promemoria</span><input type=\"text\" data-k=\"abb.contatto\" value=\"${esc(c.contatto)}\" placeholder=\"Es. Luca · 333 1234567\" autocomplete=\"off\"></label>",
"      <p class=\"err\" id=\"abb-err\" role=\"alert\"></p>",
"      <button type=\"button\" class=\"btn pri w\" data-act=\"salva-abb\">Salva</button></section>",
"    <section class=\"card\" id=\"cfg-email\"><h3>Riepilogo per email</h3>",
"      <label class=\"chk\"><input type=\"checkbox\" data-k=\"em.emailAttiva\"${c.emailAttiva ? ' checked' : ''}><span>Ogni mattina mandami ritardi, scadenze e problemi con Claude</span></label>",
"      <div class=\"g2\"><label class=\"fld\"><span>Ora</span><select data-k=\"em.emailOra\">${ore}</select></label>",
"        <label class=\"fld\"><span>A chi</span><input type=\"email\" data-k=\"em.email\" value=\"${esc(c.email)}\" placeholder=\"${esc(ST.account)}\" autocomplete=\"off\" autocapitalize=\"off\"></label></div>",
"      <label class=\"chk\"><input type=\"checkbox\" data-k=\"em.emailSempre\"${c.emailSempre ? ' checked' : ''}><span>Anche quando è tutto in regola</span></label>",
"      <p class=\"err\" id=\"em-err\" role=\"alert\"></p>",
"      <div class=\"acts\"><button type=\"button\" class=\"btn pri\" data-act=\"salva-email\">Salva</button><button type=\"button\" class=\"btn\" data-act=\"prova-email\">Mandami una prova</button></div></section>",
"    <section class=\"card\"><h3>Chiave API di Claude</h3>",
"      ${ST.chiave.impostata ? `<p class=\"muted\">Impostata: finisce con <b style=\"font-family:var(--mono);color:var(--ink)\">…${esc(ST.chiave.fine)}</b>. Resta nelle proprietà dello script.</p>",
"        <div class=\"acts\"><button type=\"button\" class=\"btn\" data-act=\"prova\">Prova</button><button type=\"button\" class=\"btn\" data-act=\"chiave\">Sostituisci</button></div>`",
"      : `<p class=\"muted\">Non ancora impostata: senza, i bar non possono leggere.</p><button type=\"button\" class=\"btn pri w\" data-act=\"chiave\">Imposta la chiave</button>`}</section>",
"    <section class=\"card\"><h3>Indirizzo per i bar</h3>",
"      ${c.indirizzo ? `<p class=\"url\">${esc(c.indirizzo)}</p>` : '<p class=\"muted\">Non ancora impostato. È l’URL di questa pagina, che finisce con /exec: va ai bar insieme al codice.</p>'}",
"      <button type=\"button\" class=\"btn${c.indirizzo ? '' : ' pri'} w\" data-act=\"indirizzo\">${c.indirizzo ? 'Cambia' : 'Incolla l’indirizzo'}</button></section>",
"    <section class=\"card\" id=\"cfg\"><h3>Lettura con Claude</h3>",
"      <label class=\"fld\"><span>Modello</span><input type=\"text\" data-k=\"cl.modello\" value=\"${esc(c.modello)}\" placeholder=\"${esc(p.modello)}\" autocomplete=\"off\" autocapitalize=\"off\" spellcheck=\"false\"></label>",
"      <div class=\"fld\"><span>Impegno</span><div class=\"seg sm\" role=\"group\" aria-label=\"Impegno\">${imp('low')}${imp('medium')}${imp('high')}</div></div>",
"      <p class=\"hint\">Basso basta per lotti e scadenze, ed è il più veloce ed economico.</p>",
"      <label class=\"fld\"><span>Foto al mese per bar, se nella sua scheda non ne scrivi altre</span><input type=\"text\" inputmode=\"numeric\" data-k=\"cl.tetto\" value=\"${esc(c.tetto)}\" placeholder=\"${esc(p.tetto)}\" autocomplete=\"off\"></label>",
"      <h3 style=\"margin-top:20px\">Prezzi per il costo stimato</h3>",
"      <div class=\"g2\"><label class=\"fld\"><span>Entrata ($ per milione di token)</span><input type=\"text\" inputmode=\"decimal\" data-k=\"cl.prezzoEntrata\" value=\"${esc(prezzo(c.prezzoEntrata))}\" autocomplete=\"off\"></label>",
"        <label class=\"fld\"><span>Uscita ($ per milione di token)</span><input type=\"text\" inputmode=\"decimal\" data-k=\"cl.prezzoUscita\" value=\"${esc(prezzo(c.prezzoUscita))}\" autocomplete=\"off\"></label></div>",
"      <p class=\"hint\">Di partenza quelli di ${esc(p.modello)}: ${esc(prezzo(p.prezzoEntrata))} $ in entrata e ${esc(prezzo(p.prezzoUscita))} $ in uscita. Se cambi modello, aggiornali.</p>",
"      <label class=\"fld\"><span>Cambio: euro per un dollaro</span><input type=\"text\" inputmode=\"decimal\" data-k=\"cl.cambio\" value=\"${esc(prezzo(c.cambio))}\" autocomplete=\"off\"></label>",
"      <p class=\"hint\" style=\"margin-top:-6px\">Per i margini, perché Claude costa in dollari.</p>",
"      <p class=\"err\" id=\"cfg-err\" role=\"alert\"></p>",
"      <button type=\"button\" class=\"btn pri w\" data-act=\"salva-imp\">Salva</button></section>`;",
"}",
"",
"/* ---------- fogli in basso ---------- */",
"function apri(s) { UI.sheet = s; UI.conferma = null; UI.form = null; UI.bozza = {}; renderSheet(); const f = $('#sheet .sh-body input:not([type=hidden]):not([type=checkbox]),#sheet .sh-body textarea'); if (f && s.tipo !== 'cliente') f.focus(); }",
"function chiudi() { UI.sheet = null; UI.conferma = null; UI.form = null; UI.bozza = {}; renderSheet(); }",
"function renderSheet() {",
"  const box = $('#sheet');",
"  if (!UI.sheet) { box.hidden = true; box.classList.remove('fermo'); box.innerHTML = ''; document.body.classList.remove('lock'); return; }",
"  const f = FOGLI[UI.sheet.tipo](UI.sheet);",
"  if (!f) { chiudi(); return; }",
"  const prima = box.querySelector('.sh-body'), top = prima ? prima.scrollTop : 0;",
"  box.classList.toggle('fermo', !!prima);   // già aperto: niente animazione, cambia solo il contenuto",
"  box.hidden = false; document.body.classList.add('lock');",
"  box.innerHTML = `<div class=\"scrim\" data-act=\"chiudi\"></div><section class=\"sheet\" role=\"dialog\" aria-modal=\"true\" aria-label=\"${esc(f.titolo)}\">",
"    <header class=\"sh-head\"><h2>${esc(f.titolo)}</h2><button type=\"button\" class=\"btn icon\" data-act=\"chiudi\" aria-label=\"Chiudi\">${I.x}</button></header>",
"    ${f.tabs ? `<div class=\"sh-tabs\">${f.tabs}</div>` : ''}<div class=\"sh-body\">${f.corpo}</div>${f.piede ? `<footer class=\"sh-foot\">${f.piede}</footer>` : ''}</section>`;",
"  for (const [k, v] of Object.entries(UI.bozza)) {   // quello che stavi scrivendo resta",
"    const el = box.querySelector(`[data-k=\"${k}\"]`);",
"    if (!el) continue;",
"    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;",
"    const seg = box.querySelector(`[data-seg=\"${k}\"]`);",
"    if (seg) for (const x of seg.children) x.setAttribute('aria-pressed', x.dataset.v === v);",
"  }",
"  box.querySelector('.sh-body').scrollTop = top;",
"}",
"const seg = (k, voci, val) => `<div class=\"seg\" data-seg=\"${k}\" role=\"group\">${Object.entries(voci).map(([v, t]) => `<button type=\"button\" data-act=\"seg\" data-v=\"${esc(v)}\" aria-pressed=\"${v === val}\">${esc(t)}</button>`).join('')}</div><input type=\"hidden\" data-k=\"${k}\" value=\"${esc(val)}\">`;",
"const FOGLI = {",
"  chiave: () => ({titolo: 'Chiave API di Claude',",
"    corpo: `<p>La crei su <a href=\"https://platform.claude.com/\" target=\"_blank\" rel=\"noopener\">platform.claude.com</a>, in Impostazioni → Chiavi API. Se usi i crediti del piano Max, creala nell’organizzazione collegata al piano.</p>",
"      <label class=\"fld\"><span>Chiave API</span><input type=\"password\" data-k=\"chiave\" placeholder=\"sk-ant-…\" autocomplete=\"off\" autocapitalize=\"off\" spellcheck=\"false\"></label>",
"      <p class=\"hint\">Prima di salvarla il ponte la prova con Claude. Poi resta nelle proprietà dello script: qui ne vedrai solo le ultime quattro cifre.</p>",
"      <p class=\"err\" id=\"ferr\" role=\"alert\"></p>`,",
"    piede: '<button type=\"button\" class=\"btn pri\" data-act=\"salva-chiave\">Prova e salva</button>'}),",
"  indirizzo: () => ({titolo: 'Indirizzo per i bar',",
"    corpo: `<p>È l’URL dell’app web del ponte, quello di questa pagina: finisce con <b>/exec</b>. Lo trovi anche nell’editor di Apps Script, in Esegui il deployment → Gestisci deployment.</p>",
"      <label class=\"fld\"><span>URL dell’app web</span><input type=\"url\" data-k=\"indirizzo\" value=\"${esc(ST.imp.indirizzo)}\" placeholder=\"https://script.google.com/macros/s/…/exec\" autocomplete=\"off\" autocapitalize=\"off\" spellcheck=\"false\"></label>",
"      <p class=\"hint\">Va ai bar insieme al codice: nel loro Barista Flow è l’«Indirizzo del servizio».</p>",
"      <p class=\"err\" id=\"ferr\" role=\"alert\"></p>`,",
"    piede: '<button type=\"button\" class=\"btn pri\" data-act=\"salva-indirizzo\">Salva</button>'}),",
"  nuovo: () => ({titolo: 'Nuovo cliente',",
"    corpo: `<label class=\"fld\"><span>Nome del bar</span><input type=\"text\" data-k=\"nome\" maxlength=\"80\" autocomplete=\"off\" placeholder=\"Es. Bar Centrale\"></label>",
"      <div class=\"fld\"><span>Abbonamento</span>${seg('piano', {'': 'Nessuno', mensile: 'Mensile', trimestrale: 'Trimestr.', annuale: 'Annuale'}, UI.bozza.piano != null ? UI.bozza.piano : 'mensile')}</div>",
"      <div class=\"g2\"><label class=\"fld\"><span>Canone (€)</span><input type=\"text\" inputmode=\"decimal\" data-k=\"canone\" autocomplete=\"off\" placeholder=\"Es. 39,90\"></label>",
"        <label class=\"fld\"><span>Inizio</span><input type=\"date\" data-k=\"inizio\" value=\"${esc(ST.oggi)}\"></label></div>",
"      <label class=\"fld\"><span>Gratis fino al (facoltativo)</span><input type=\"date\" data-k=\"prova\"></label>",
"      <p class=\"hint\" style=\"margin-top:-6px\">Si paga in anticipo: il primo canone va pagato all’inizio, o finita la prova. Il semestrale si sceglie poi dalla scheda.</p>",
"      <label class=\"fld\"><span>Note</span><input type=\"text\" data-k=\"note\" maxlength=\"300\" autocomplete=\"off\" placeholder=\"Facoltative: referente, telefono…\"></label>",
"      <p class=\"err\" id=\"ferr\" role=\"alert\"></p>`,",
"    piede: '<button type=\"button\" class=\"btn pri\" data-act=\"crea-cliente\">Crea il cliente</button>'}),",
"  avviso: s => {",
"    const a = s.id ? ST.avvisi.find(x => x.id === s.id) : null;",
"    if (s.id && !a) return null;",
"    const opz = `<option value=\"tutti\">Tutti i bar</option>` + ST.bar.slice().sort((x, y) => x.nome.localeCompare(y.nome, 'it')).map(b => `<option value=\"${esc(b.codice)}\"${a && a.a === b.codice ? ' selected' : ''}>${esc(b.nome)}</option>`).join('');",
"    return {titolo: a ? 'Avviso' : 'Nuovo avviso',",
"      corpo: `<label class=\"fld\"><span>Testo <span class=\"conta\" id=\"conta\">${a ? a.testo.length : 0}/280</span></span><textarea data-k=\"testo\" maxlength=\"280\" placeholder=\"Es. Domenica dalle 8 alle 9 aggiorno Barista Flow: se si ricarica da solo, è normale.\">${esc(a ? a.testo : '')}</textarea></label>",
"        <label class=\"fld\"><span>A chi</span><select data-k=\"a\">${opz}</select></label>",
"        <div class=\"g2\"><label class=\"fld\"><span>Dal</span><input type=\"date\" data-k=\"dal\" value=\"${esc(a ? a.dal : ST.oggi)}\"></label><label class=\"fld\"><span>Al (facoltativo)</span><input type=\"date\" data-k=\"al\" value=\"${esc(a ? a.al : '')}\"></label></div>",
"        <label class=\"chk\"><input type=\"checkbox\" data-k=\"importante\"${a && a.importante ? ' checked' : ''}><span>Importante: si vede in rosso</span></label>",
"        <p class=\"err\" id=\"ferr\" role=\"alert\"></p>`,",
"      piede: `${a ? '<button type=\"button\" class=\"btn dan\" data-act=\"togli-avviso\">Togli</button>' : ''}<button type=\"button\" class=\"btn pri\" data-act=\"salva-avviso\">${a ? 'Salva' : 'Pubblica'}</button>`};",
"  },",
"  cliente: s => {",
"    const b = ST.bar.find(x => x.codice === s.codice);",
"    if (!b) return null;",
"    const t = (v, txt) => `<button type=\"button\" data-act=\"sub\" data-v=\"${v}\" aria-pressed=\"${UI.sub === v}\">${txt}</button>`;",
"    const nInt = ST.interventi.filter(x => x.codice === b.codice && x.stato === 'da fatturare').length;",
"    const corpo = {abbonamento: subAbbonamento, interventi: subInterventi, cliente: subCliente, claude: subClaude}[UI.sub] || subAbbonamento;",
"    return {titolo: b.nome || 'Cliente', tabs: `<div class=\"seg\">${t('abbonamento', 'Abbonamento')}${t('interventi', 'Interventi' + (nInt ? ` · ${nInt}` : ''))}${t('cliente', 'Cliente')}${t('claude', 'Claude')}</div>`,",
"      corpo: (s.appena ? `<p class=\"ok-banner\">${I.check}Cliente aggiunto: manda codice e indirizzo.</p>` : '') + corpo(b)};",
"  }",
"};",
"function subAbbonamento(b) {",
"  const s = abb(b), pag = ST.pagamenti.filter(p => p.codice === b.codice), tot = pag.reduce((t, p) => t + p.importo, 0), f = UI.form && UI.form.tipo === 'pagamento' ? UI.form : null;",
"  const modi = {automatico: 'Automatico', attivo: 'Attivo', limitato: 'Limitato', sospeso: 'Sospeso'};",
"  const spiega = {automatico: `Segue l’abbonamento: promemoria ${ST.imp.preavviso} giorni prima, ${ST.imp.limitaDopo ? `limitato dopo ${ST.imp.limitaDopo} giorni di ritardo` : 'mai limitato da solo'}, ${ST.imp.sospendiDopo ? `in sola lettura dopo ${ST.imp.sospendiDopo}` : 'mai in sola lettura da solo'}.`,",
"    attivo: 'Sempre attivo, anche se è in ritardo.', limitato: 'L’app funziona, ma senza lettura con Claude né fatture dalla posta.', sospeso: 'L’app va in sola lettura: il bar vede ed esporta i suoi dati, ma non ne registra di nuovi.'};",
"  const modulo = f ? modPagamento(b, f) : '';",
"  return `<section class=\"stato ${s.cls}\"><b class=\"t\">${esc(s.t)}</b>${s.righe.map(r => `<p>${esc(r)}</p>`).join('')}<p class=\"piano\">${esc(pianoTesto(b))}${b.piano ? ` · dal ${esc(data(b.inizio, true))}` : ''}${b.prova ? ` · gratis fino al ${esc(data(b.prova))}` : ''}</p>",
"      ${b.piano && !f ? `<button type=\"button\" class=\"btn pri w\" data-act=\"nuovo-pagamento\">${I.plus}Registra un pagamento</button>` : ''}</section>",
"    ${modulo}",
"    <section class=\"card\"><h3>Servizio</h3>${seg('modo', modi, b.abb.modo).replace(/data-act=\"seg\"/g, 'data-act=\"modo\"')}<p class=\"spieg\">${esc(spiega[b.abb.modo])}</p></section>",
"    <section class=\"card\" id=\"piano\"><h3>Abbonamento</h3>",
"      <div class=\"fld\"><span>Piano</span>${seg('pi.piano', {'': 'Nessuno', mensile: 'Mensile', trimestrale: 'Trim.', semestrale: 'Sem.', annuale: 'Annuale'}, b.piano)}</div>",
"      <div class=\"g2\"><label class=\"fld\"><span>Canone (€)</span><input type=\"text\" inputmode=\"decimal\" data-k=\"pi.canone\" value=\"${b.canone ? esc(euro2(b.canone)) : ''}\" autocomplete=\"off\"></label>",
"        <label class=\"fld\"><span>Inizio</span><input type=\"date\" data-k=\"pi.inizio\" value=\"${esc(b.inizio)}\"></label></div>",
"      <label class=\"fld\"><span>Gratis fino al</span><input type=\"date\" data-k=\"pi.prova\" value=\"${esc(b.prova)}\"></label>",
"      <p class=\"err\" id=\"pi-err\" role=\"alert\"></p>",
"      <button type=\"button\" class=\"btn w\" data-act=\"salva-piano\">Salva l’abbonamento</button></section>",
"    <h2 style=\"margin-top:22px\">Pagamenti${pag.length ? `<span class=\"muted\" style=\"font-size:15px;font-weight:550\">${euro(tot)} in tutto</span>` : ''}</h2>",
"    ${pag.length ? `<div class=\"list\">${pag.map(p => `<button type=\"button\" class=\"row\" data-act=\"mod-pagamento\" data-id=\"${esc(p.id)}\"><span class=\"m\"><b>${euro(p.importo)}</b><span>${data(p.data, true)} · ${esc(METODI[p.metodo] || p.metodo)}${p.note ? ' · ' + esc(p.note) : ''}</span></span><span class=\"s\">${p.fino ? `<span class=\"t\">fino al ${data(p.fino)}</span>` : ''}${I.chev}</span></button>`).join('')}</div>` : '<p class=\"empty\">Ancora nessun pagamento.</p>'}`;",
"}",
"function modPagamento(b, f) {",
"  const p = f.id ? ST.pagamenti.find(x => x.id === f.id) : null, sug = b.prossimo || {};",
"  return `<section class=\"modulo\" id=\"mod-pag\"><h3>${p ? 'Pagamento' : 'Nuovo pagamento'}</h3>",
"    <div class=\"g2\"><label class=\"fld\"><span>Importo (€)</span><input type=\"text\" inputmode=\"decimal\" data-k=\"pg.importo\" value=\"${esc(p ? euro2(p.importo) : sug.importo ? euro2(sug.importo) : '')}\" autocomplete=\"off\"></label>",
"      <label class=\"fld\"><span>Data</span><input type=\"date\" data-k=\"pg.data\" value=\"${esc(p ? p.data : ST.oggi)}\"></label></div>",
"    <div class=\"fld\"><span>Metodo</span>${seg('pg.metodo', METODI, p ? p.metodo : 'bonifico')}</div>",
"    <label class=\"fld\"><span>Copre fino al</span><input type=\"date\" data-k=\"pg.fino\" value=\"${esc(p ? p.fino : sug.fino || '')}\"></label>",
"    <p class=\"hint\" style=\"margin-top:-6px\">${p ? 'L’ultimo giorno pagato da questo canone.' : `Un ${b.piano ? PIANI[b.piano][2] : 'periodo'} dopo l’ultimo giorno pagato: è già scritto, cambialo se serve.`}</p>",
"    <label class=\"fld\"><span>Note</span><input type=\"text\" data-k=\"pg.note\" maxlength=\"200\" value=\"${esc(p ? p.note : '')}\" autocomplete=\"off\" placeholder=\"Es. CRO del bonifico\"></label>",
"    <p class=\"err\" id=\"pg-err\" role=\"alert\"></p>",
"    <div class=\"acts\">${p ? '<button type=\"button\" class=\"btn dan\" data-act=\"togli-pagamento\">Togli</button>' : ''}<button type=\"button\" class=\"btn\" data-act=\"annulla-form\">Annulla</button><button type=\"button\" class=\"btn pri\" data-act=\"salva-pagamento\">Salva</button></div></section>`;",
"}",
"function subInterventi(b) {",
"  const L = ST.interventi.filter(x => x.codice === b.codice), f = UI.form && UI.form.tipo === 'intervento' ? UI.form : null;",
"  const daf = L.filter(x => x.stato === 'da fatturare').reduce((t, x) => t + x.importo, 0);",
"  const x = f && f.id ? L.find(y => y.id === f.id) : null;",
"  const modulo = f ? `<section class=\"modulo\" id=\"mod-int\"><h3>${x ? 'Intervento' : 'Nuovo intervento'}</h3>",
"      <label class=\"fld\"><span>Che cosa</span><input type=\"text\" data-k=\"in.descrizione\" maxlength=\"200\" value=\"${esc(x ? x.descrizione : '')}\" autocomplete=\"off\" placeholder=\"Es. Installazione e formazione\"></label>",
"      <div class=\"g2\"><label class=\"fld\"><span>Importo (€)</span><input type=\"text\" inputmode=\"decimal\" data-k=\"in.importo\" value=\"${esc(x && x.importo ? euro2(x.importo) : '')}\" autocomplete=\"off\"></label>",
"        <label class=\"fld\"><span>Data</span><input type=\"date\" data-k=\"in.data\" value=\"${esc(x ? x.data : ST.oggi)}\"></label></div>",
"      <div class=\"fld\"><span>Stato</span>${seg('in.stato', {'da fatturare': 'Da fatturare', fatturato: 'Fatturato', pagato: 'Pagato'}, x ? x.stato : 'da fatturare')}</div>",
"      <label class=\"fld\"><span>Note</span><input type=\"text\" data-k=\"in.note\" maxlength=\"200\" value=\"${esc(x ? x.note : '')}\" autocomplete=\"off\"></label>",
"      <p class=\"err\" id=\"in-err\" role=\"alert\"></p>",
"      <div class=\"acts\">${x ? '<button type=\"button\" class=\"btn dan\" data-act=\"togli-intervento\">Togli</button>' : ''}<button type=\"button\" class=\"btn\" data-act=\"annulla-form\">Annulla</button><button type=\"button\" class=\"btn pri\" data-act=\"salva-intervento\">Salva</button></div></section>` : '';",
"  return `${modulo || `<button type=\"button\" class=\"btn pri w\" style=\"margin:0 0 14px\" data-act=\"nuovo-intervento\">${I.plus}Nuovo intervento</button>`}",
"    ${L.length ? `<p class=\"muted\">${daf ? `Da fatturare: <b style=\"color:var(--ink)\">${euro(daf)}</b>.` : 'Niente da fatturare.'} Manutenzioni, installazioni e servizi extra.</p>",
"      <div class=\"list\">${L.map(y => { const [c, t] = STATI_INT[y.stato]; return `<button type=\"button\" class=\"row\" data-act=\"mod-intervento\" data-id=\"${esc(y.id)}\"><span class=\"m\"><b>${esc(y.descrizione)}</b><span>${data(y.data, true)}${y.note ? ' · ' + esc(y.note) : ''}</span></span><span class=\"s\"><b>${euro(y.importo)}</b><span class=\"chip ${c}\">${t}</span></span></button>`; }).join('')}</div>`",
"      : (modulo ? '' : '<p class=\"empty\">Nessun intervento. Qui segni manutenzioni, installazioni e servizi extra da fatturare.</p>')}`;",
"}",
"function subCliente(b) {",
"  const ind = ST.imp.indirizzo, cf = UI.conferma, wa = 'https://wa.me/?text=' + encodeURIComponent(messaggio(b));",
"  const v = b.visto && b.visto.t ? (Date.now() - b.visto.t > 7 * 864e5 ? `Non si collega da ${Math.floor((Date.now() - b.visto.t) / 864e5)} giorni (ultima volta ${quando(b.visto.t)})` : `Collegato ${quando(b.visto.t)}`) + (b.visto.v ? ` · versione ${b.visto.v}` : '') : 'Il suo Barista Flow non si è ancora collegato';",
"  const confBox = cf === 'codice' ? `<div class=\"conf\"><p><b>Nuovo codice?</b> Quello attuale smette subito di funzionare: andrà scritto il nuovo nel Barista Flow del bar. Abbonamento, pagamenti e letture restano.</p><div class=\"acts\"><button type=\"button\" class=\"btn\" data-act=\"annulla\">Annulla</button><button type=\"button\" class=\"btn pri\" data-act=\"cambia-codice\">Cambia codice</button></div></div>`",
"    : cf === 'elimina' ? `<div class=\"conf\"><p><b>Eliminare ${esc(b.nome || 'questo cliente')}?</b> Sparisce dal foglio «Bar» e il suo codice smette di funzionare. Se ora è limitato o sospeso, la sua app resta così; altrimenti resta libera, senza lettura con Claude. Pagamenti, interventi e letture restano nei loro fogli.</p><div class=\"acts\"><button type=\"button\" class=\"btn\" data-act=\"annulla\">Annulla</button><button type=\"button\" class=\"btn dan\" data-act=\"elimina\">Elimina</button></div></div>` : '';",
"  return `<section class=\"card conn\">",
"      <div class=\"kv\"><span>Codice del bar</span><div class=\"val\"><b class=\"code\">${esc(b.codice)}</b><button type=\"button\" class=\"btn icon\" data-act=\"copia\" data-v=\"${esc(b.codice)}\" aria-label=\"Copia il codice\">${I.copy}</button></div></div>",
"      ${ind ? `<div class=\"kv\"><span>Indirizzo del servizio</span><div class=\"val\"><span class=\"url\">${esc(ind)}</span><button type=\"button\" class=\"btn icon\" data-act=\"copia\" data-v=\"${esc(ind)}\" aria-label=\"Copia l’indirizzo\">${I.copy}</button></div></div>",
"        <div class=\"acts\"><a class=\"btn pri\" href=\"${esc(wa)}\" target=\"_blank\" rel=\"noopener\">${I.chat}WhatsApp</a><button type=\"button\" class=\"btn\" data-act=\"copia-msg\">${I.copy}Copia il messaggio</button></div>`",
"      : `<p class=\"muted\">Per mandarli al bar serve anche l’indirizzo del ponte.</p><button type=\"button\" class=\"btn pri w\" data-act=\"indirizzo\">Incolla l’indirizzo</button>`}",
"      <p class=\"hint\" style=\"margin:12px 0 0\">Nel Barista Flow del bar: Impostazioni → Lettura con Claude. ${esc(v)}.</p></section>",
"    <section class=\"card\" id=\"ana\"><h3>Anagrafica</h3>",
"      ${b.telefono || b.email ? `<div class=\"contatti\">${b.telefono ? `<a class=\"btn sm\" href=\"tel:${esc(b.telefono.replace(/[^+0-9]/g, ''))}\">${I.tel}${esc(b.telefono)}</a>` : ''}${b.email ? `<a class=\"btn sm\" href=\"mailto:${esc(b.email)}\">${I.mail}Email</a>` : ''}</div>` : ''}",
"      <label class=\"fld\"><span>Nome del bar</span><input type=\"text\" data-k=\"an.nome\" maxlength=\"80\" value=\"${esc(b.nome)}\" autocomplete=\"off\"></label>",
"      <label class=\"fld\"><span>Ragione sociale</span><input type=\"text\" data-k=\"an.ragione\" maxlength=\"120\" value=\"${esc(b.ragione)}\" autocomplete=\"off\"></label>",
"      <div class=\"g2\"><label class=\"fld\"><span>Partita IVA</span><input type=\"text\" inputmode=\"numeric\" data-k=\"an.piva\" maxlength=\"20\" value=\"${esc(b.piva)}\" autocomplete=\"off\"></label>",
"        <label class=\"fld\"><span>Referente</span><input type=\"text\" data-k=\"an.referente\" maxlength=\"80\" value=\"${esc(b.referente)}\" autocomplete=\"off\"></label></div>",
"      <div class=\"g2\"><label class=\"fld\"><span>Telefono</span><input type=\"tel\" data-k=\"an.telefono\" maxlength=\"30\" value=\"${esc(b.telefono)}\" autocomplete=\"off\"></label>",
"        <label class=\"fld\"><span>Email</span><input type=\"email\" data-k=\"an.email\" maxlength=\"120\" value=\"${esc(b.email)}\" autocomplete=\"off\" autocapitalize=\"off\"></label></div>",
"      <label class=\"fld\"><span>Indirizzo</span><input type=\"text\" data-k=\"an.indirizzo\" maxlength=\"200\" value=\"${esc(b.indirizzo)}\" autocomplete=\"off\"></label>",
"      <label class=\"fld\"><span>Note</span><input type=\"text\" data-k=\"an.note\" maxlength=\"300\" value=\"${esc(b.note)}\" autocomplete=\"off\"></label>",
"      <p class=\"err\" id=\"an-err\" role=\"alert\"></p>",
"      <button type=\"button\" class=\"btn pri w\" data-act=\"salva-anagrafica\">Salva</button></section>",
"    <section class=\"card\"><h3>Codice e cliente</h3>",
"      <div class=\"acts\"><button type=\"button\" class=\"btn\" data-act=\"chiedi\" data-v=\"codice\">Nuovo codice</button><button type=\"button\" class=\"btn dan\" data-act=\"chiedi\" data-v=\"elimina\">Elimina</button></div>",
"      ${confBox}</section>`;",
"}",
"function subClaude(b) {",
"  return `<section class=\"card\" id=\"mese-bar\">${meseBar(b)}</section>",
"    <section class=\"card\" id=\"cl\"><h3>Foto al mese</h3>",
"      <label class=\"fld\"><span>Tetto di questo bar</span><input type=\"text\" inputmode=\"numeric\" data-k=\"cl.tetto\" value=\"${esc(b.tetto || '')}\" placeholder=\"${esc(ST.imp.tetto)}, il predefinito\" autocomplete=\"off\"></label>",
"      <p class=\"err\" id=\"cl-err\" role=\"alert\"></p>",
"      <button type=\"button\" class=\"btn pri w\" data-act=\"salva-tetto\">Salva</button></section>",
"    <h2 style=\"margin-top:22px\">Ultime letture</h2><div id=\"lett-bar\">${lettureBar(b.codice)}</div>`;",
"}",
"function meseBar(b) {",
"  const tetto = b.tetto || ST.imp.tetto, pct = Math.min(100, Math.round(b.usate / tetto * 100)), cls = b.usate >= tetto ? 'red' : pct >= 80 ? 'amb' : '';",
"  return `<h3>Questo mese</h3><span class=\"meter big ${cls}\"><i style=\"width:${pct}%\"></i></span>",
"      <div class=\"nums\"><span><b>${num(b.usate)}</b> di ${num(tetto)} foto${b.tetto ? '' : ' (predefinito)'}</span><span><b>${dollari(b.costo)}</b> stimati</span>${b.ultima ? `<span>ultima lettura ${esc(quando(b.ultima))}</span>` : ''}</div>",
"      ${b.abb.stato !== 'attivo' ? `<p class=\"spieg\" style=\"color:var(--red)\">Con il servizio ${b.abb.stato} la lettura con Claude è ferma.</p>` : ''}`;",
"}",
"function lettureBar(codice) {",
"  if (!UI.lett || UI.lett.codice !== codice) return '<p class=\"load\" style=\"margin:16px 0\">Carico le letture…</p>';",
"  return UI.lett.items.length ? righeLetture(UI.lett.items, false) : '<p class=\"empty\">Ancora nessuna lettura per questo bar.</p>';",
"}",
"function messaggio(b) {",
"  return ['Barista Flow · Lettura con Claude', 'In Barista Flow apri Impostazioni → Lettura con Claude e scrivi:', '', 'Indirizzo del servizio:', ST.imp.indirizzo, '', 'Codice del bar:', b.codice, '', 'Il codice vale solo per il tuo bar: non condividerlo.'].join('\\n');",
"}",
"async function copia(t) {",
"  try { await navigator.clipboard.writeText(t); return true; } catch (e) { /* nella pagina di Google a volte non si può: si prova alla vecchia maniera */ }",
"  const ta = document.createElement('textarea');",
"  ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';",
"  document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, t.length);",
"  let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }",
"  ta.remove(); return ok;",
"}",
"async function caricaLetture(codice) {",
"  try {",
"    const r = await run('letture', {codice});",
"    UI.lett = {codice, items: (r && r.letture) || []};",
"    const b = ST.bar.find(x => x.codice === codice);   // le foto del mese, fresche: intanto il bar può aver letto altre etichette",
"    if (b && r && r.uso) { b.usate = r.uso.n; b.costo = r.uso.costo; const m = $('#mese-bar'); if (m && UI.sheet && UI.sheet.codice === codice) m.innerHTML = meseBar(b); }",
"  } catch (e) { UI.lett = {codice, items: []}; toast(messaggioErrore(e), true); }",
"  const box = $('#lett-bar');   // solo l'elenco: il resto del foglio, e quello che stai scrivendo, non si tocca",
"  if (box && UI.sheet && UI.sheet.tipo === 'cliente' && UI.sheet.codice === codice) box.innerHTML = lettureBar(codice);",
"}",
"// i valori di un modulo: data-k=\"pg.importo\" → {importo}; le caselle danno vero o falso",
"const valori = (root, pre) => Object.fromEntries([...root.querySelectorAll('[data-k]')].filter(el => !pre || el.dataset.k.startsWith(pre + '.')).map(el => [pre ? el.dataset.k.slice(pre.length + 1) : el.dataset.k, el.type === 'checkbox' ? el.checked : el.value]));",
"const cliente = () => ST.bar.find(x => x.codice === UI.sheet.codice);",
"const campi = b => ({codice: b.codice, nome: b.nome, tetto: b.tetto || '', note: b.note, ragione: b.ragione, piva: b.piva, referente: b.referente, telefono: b.telefono, email: b.email, indirizzo: b.indirizzo, piano: b.piano, canone: b.canone || '', inizio: b.inizio, prova: b.prova});",
"const svuota = pre => { for (const k of Object.keys(UI.bozza)) if (k.startsWith(pre + '.')) delete UI.bozza[k]; };",
"",
"/* ---------- azioni ---------- */",
"const AZ = {",
"  tab: el => { UI.tab = el.dataset.v; render(); window.scrollTo({top: 0}); },",
"  filtro: el => { UI.filtro = el.dataset.v; render(); },",
"  fLett: el => { UI.fLett = el.dataset.v; render(); },",
"  aggiorna: async el => { el.classList.add('busy'); await fai(null, 'stato'); el.classList.remove('busy'); if (UI.sheet && UI.sheet.tipo === 'cliente' && UI.sub === 'claude') caricaLetture(UI.sheet.codice); },",
"  chiave: () => apri({tipo: 'chiave'}),",
"  indirizzo: () => apri({tipo: 'indirizzo'}),",
"  nuovo: () => apri({tipo: 'nuovo'}),",
"  avviso: el => apri({tipo: 'avviso', id: el.dataset.id || ''}),",
"  apri: el => { UI.lett = null; UI.sub = el.dataset.sub || 'abbonamento'; apri({tipo: 'cliente', codice: el.dataset.c}); },",
"  sub: el => { UI.sub = el.dataset.v; UI.form = null; UI.conferma = null; renderSheet(); $('#sheet .sh-body').scrollTop = 0; if (UI.sub === 'claude') caricaLetture(UI.sheet.codice); },",
"  chiudi: () => chiudi(),",
"  annulla: () => { UI.conferma = null; renderSheet(); },",
"  chiedi: el => { UI.conferma = el.dataset.v; renderSheet(); const c = $('#sheet .conf'); if (c) c.scrollIntoView({block: 'nearest', behavior: 'smooth'}); },",
"  seg: el => {   // un segmento dentro un modulo: il valore va nel campo nascosto accanto",
"    const box = el.parentNode, k = box.dataset.seg, inp = box.parentNode.querySelector(`input[data-k=\"${k}\"]`);",
"    for (const x of box.children) x.setAttribute('aria-pressed', x === el);",
"    if (inp) inp.value = el.dataset.v;",
"    if (el.closest('#sheet')) UI.bozza[k] = el.dataset.v;",
"  },",
"  'salva-chiave': async el => {",
"    const r = await fai(el, 'chiave', valori($('#sheet')), $('#ferr'));",
"    if (!r || !r.ok) return;",
"    chiudi(); esitoProva(r.prova, true);",
"  },",
"  prova: async el => { const r = await fai(el, 'prova'); if (r && r.ok) esitoProva(r.prova, false); },",
"  'salva-indirizzo': async el => {",
"    const r = await fai(el, 'impostazioni', {indirizzo: valori($('#sheet')).indirizzo}, $('#ferr'));",
"    if (r && r.ok) { chiudi(); toast(ST.imp.indirizzo ? 'Indirizzo salvato.' : 'Indirizzo tolto.'); }",
"  },",
"  'crea-cliente': async el => {",
"    const r = await fai(el, 'aggiungi', valori($('#sheet')), $('#ferr'));",
"    if (r && r.ok) { UI.lett = {codice: r.codice, items: []}; UI.sub = 'cliente'; apri({tipo: 'cliente', codice: r.codice, appena: true}); }",
"  },",
"  modo: async el => {",
"    const b = cliente(), m = el.dataset.v;",
"    if (m === b.abb.modo) return;",
"    const r = await fai(el, 'servizio', {codice: b.codice, modo: m});",
"    if (r && r.ok) toast({automatico: 'Il servizio segue l’abbonamento.', attivo: 'Sempre attivo.', limitato: 'Limitato: niente lettura con Claude né fatture dalla posta.', sospeso: 'Sospeso: l’app del bar va in sola lettura.'}[m]);",
"  },",
"  'salva-piano': async el => {",
"    const b = cliente(), v = valori($('#piano'), 'pi');",
"    const r = await fai(el, 'cliente', {...campi(b), ...v}, $('#pi-err'));",
"    if (r && r.ok) { svuota('pi'); toast('Abbonamento salvato.'); }",
"  },",
"  'salva-anagrafica': async el => {",
"    const b = cliente(), v = valori($('#ana'), 'an');",
"    const r = await fai(el, 'cliente', {...campi(b), ...v}, $('#an-err'));",
"    if (r && r.ok) { svuota('an'); toast('Salvato.'); }",
"  },",
"  'salva-tetto': async el => {",
"    const b = cliente(), r = await fai(el, 'cliente', {...campi(b), tetto: valori($('#cl'), 'cl').tetto}, $('#cl-err'));",
"    if (r && r.ok) { svuota('cl'); toast('Salvato.'); }",
"  },",
"  'nuovo-pagamento': () => { UI.form = {tipo: 'pagamento'}; svuota('pg'); renderSheet(); const m = $('#mod-pag'); if (m) { m.scrollIntoView({block: 'nearest'}); $('#mod-pag input').focus(); } },",
"  'mod-pagamento': el => { UI.form = {tipo: 'pagamento', id: el.dataset.id}; svuota('pg'); renderSheet(); $('#sheet .sh-body').scrollTop = 0; },",
"  'annulla-form': () => { UI.form = null; svuota('pg'); svuota('in'); renderSheet(); },",
"  'salva-pagamento': async el => {",
"    const b = cliente(), v = valori($('#mod-pag'), 'pg');",
"    const r = await fai(el, 'pagamento', {...v, id: UI.form.id || '', codice: b.codice}, $('#pg-err'));",
"    if (r && r.ok) { UI.form = null; svuota('pg'); renderSheet(); toast('Pagamento registrato.'); }",
"  },",
"  'togli-pagamento': async el => {",
"    const r = await fai(el, 'togli-pagamento', {id: UI.form.id}, $('#pg-err'));",
"    if (r && r.ok) { UI.form = null; svuota('pg'); renderSheet(); toast('Pagamento tolto.'); }",
"  },",
"  'nuovo-intervento': () => { UI.form = {tipo: 'intervento'}; svuota('in'); renderSheet(); const f = $('#mod-int input'); if (f) f.focus(); },",
"  'mod-intervento': el => { UI.form = {tipo: 'intervento', id: el.dataset.id}; svuota('in'); renderSheet(); $('#sheet .sh-body').scrollTop = 0; },",
"  'salva-intervento': async el => {",
"    const b = cliente(), v = valori($('#mod-int'), 'in');",
"    const r = await fai(el, 'intervento', {...v, id: UI.form.id || '', codice: b.codice}, $('#in-err'));",
"    if (r && r.ok) { UI.form = null; svuota('in'); renderSheet(); toast('Intervento salvato.'); }",
"  },",
"  'togli-intervento': async el => {",
"    const r = await fai(el, 'togli-intervento', {id: UI.form.id}, $('#in-err'));",
"    if (r && r.ok) { UI.form = null; svuota('in'); renderSheet(); toast('Intervento tolto.'); }",
"  },",
"  'salva-avviso': async el => {",
"    const v = valori($('#sheet')), r = await fai(el, 'avviso', {...v, id: UI.sheet.id || ''}, $('#ferr'));",
"    if (r && r.ok) { const nuovo = !UI.sheet.id; chiudi(); toast(nuovo ? 'Avviso pubblicato: i bar lo vedono alla prossima apertura.' : 'Avviso salvato.'); }",
"  },",
"  'togli-avviso': async el => {",
"    const r = await fai(el, 'togli-avviso', {id: UI.sheet.id}, $('#ferr'));",
"    if (r && r.ok) { chiudi(); toast('Avviso tolto.'); }",
"  },",
"  'cambia-codice': async el => {",
"    const vecchio = UI.sheet.codice, r = await fai(el, 'codice', {codice: vecchio});",
"    if (r && r.ok) { UI.conferma = null; UI.sheet = {tipo: 'cliente', codice: r.codice}; if (UI.lett) UI.lett.codice = r.codice; renderSheet(); toast('Nuovo codice: ' + r.codice + '. Il vecchio non vale più.'); }",
"  },",
"  elimina: async el => {",
"    const b = cliente(), r = await fai(el, 'elimina', {codice: b.codice});",
"    if (r && r.ok) { chiudi(); toast((b.nome || 'Il cliente') + ' eliminato.'); }",
"  },",
"  copia: async el => toast(await copia(el.dataset.v) ? 'Copiato.' : 'Non riesco a copiare: tieni premuto sul testo per selezionarlo.'),",
"  'copia-msg': async () => toast(await copia(messaggio(cliente())) ? 'Messaggio copiato: incollalo dove vuoi.' : 'Non riesco a copiare: usa WhatsApp o copia codice e indirizzo uno alla volta.'),",
"  impegno: el => { UI.imp.impegno = el.dataset.v; for (const x of el.parentNode.children) x.setAttribute('aria-pressed', x === el); },",
"  'salva-imp': async el => {",
"    const r = await fai(el, 'impostazioni', {...valori($('#cfg'), 'cl'), impegno: UI.imp.impegno}, $('#cfg-err'));",
"    if (r && r.ok) { UI.imp = null; render(); toast(r.avviso || 'Impostazioni salvate.', !!r.avviso); }",
"  },",
"  'salva-abb': async el => {",
"    const r = await fai(el, 'impostazioni', valori($('#cfg-abb'), 'abb'), $('#abb-err'));",
"    if (r && r.ok) toast('Regole degli abbonamenti salvate.');",
"  },",
"  'salva-email': async el => {",
"    const r = await fai(el, 'impostazioni', valori($('#cfg-email'), 'em'), $('#em-err'));",
"    if (r && r.ok) toast(ST.imp.emailAttiva ? `Riepilogo acceso: ogni mattina alle ${String(ST.imp.emailOra).padStart(2, '0')}:00.` : 'Riepilogo spento.');",
"  },",
"  'prova-email': async el => { const r = await fai(el, 'riepilogo', {}, $('#em-err')); if (r && r.ok) toast(`Mandato a ${r.a}: «${r.oggetto}».`); }",
"};",
"function esitoProva(p, salvata) {",
"  const pre = salvata ? 'Chiave salvata. ' : '';",
"  if (!p || p.ok) return toast(pre + 'Funziona: ' + ((p && p.modello) || ST.imp.modello) + ' risponde.');",
"  const m = {crediti: 'la chiave va, ma i crediti sono finiti: ricarica dalla Console.', occupato: 'Claude ora non risponde (occupato o senza rete): riprova fra poco.', chiave_api: 'Claude non accetta la chiave.'}[p.errore];",
"  toast(pre + 'Prova non riuscita: ' + (m || p.messaggio), true);",
"}",
"document.addEventListener('click', e => {",
"  const el = e.target.closest('[data-act]');",
"  if (!el || el.disabled) return;",
"  const f = AZ[el.dataset.act];",
"  if (f) { if (el.tagName !== 'A') e.preventDefault(); f(el); }",
"});",
"document.addEventListener('input', e => {",
"  const k = e.target.dataset.k;",
"  if (k === 'cerca') { UI.cerca = e.target.value; $('#lista').innerHTML = listaClienti(); }",
"  else if (k && e.target.closest('#sheet')) UI.bozza[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;",
"  if (k === 'testo') { const c = $('#conta'); if (c) c.textContent = `${e.target.value.length}/280`; }",
"});",
"document.addEventListener('change', e => { const k = e.target.dataset.k; if (k && e.target.closest('#sheet')) UI.bozza[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; });",
"document.addEventListener('keydown', e => {",
"  if (e.key === 'Escape' && UI.sheet) chiudi();",
"  if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox])')) {   // Invio in un campo: come il pulsante principale del suo modulo",
"    const box = e.target.closest('.modulo, .card, #sheet .sh-body') || document;",
"    const b = (e.target.closest('#sheet') && !e.target.closest('.modulo, .card') && $('#sheet .sh-foot .btn.pri')) || box.querySelector('.btn.pri');",
"    if (b) { e.preventDefault(); b.click(); }",
"  }",
"});",
"// tornando sulla pagina dopo un po', i numeri si aggiornano da soli",
"let nascosta = 0;",
"document.addEventListener('visibilitychange', () => {",
"  if (document.hidden) { nascosta = Date.now(); return; }",
"  if (nascosta && Date.now() - nascosta > 30000 && !UI.sheet) fai(null, 'stato');",
"});",
"",
"if (ST) render(); else fai(null, 'stato').then(() => { if (!ST && !$('.blocco')) $('#app').innerHTML = '<div class=\"blocco\"><h1>Il ponte non risponde</h1><p class=\"muted\">Ricarica la pagina fra poco.</p></div>'; });",
"</script>",
"</body>",
"</html>"
].join('\n');
