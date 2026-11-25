/*
 * Barista Flow · script di Google
 *
 * - passa a Barista Flow le fatture che arrivano come allegato (XML, P7M, ZIP o PDF)
 *   nella casella Gmail dell'account con cui crei questo script;
 * - manda sul telefono le notifiche di Barista Flow (scadenze, scorte, fatture arrivate),
 *   anche quando l'app è chiusa.
 * Come si installa: in Barista Flow, Impostazioni → Fatture dalla posta.
 */

// La sceglie l'app: lo script copiato da Barista Flow la contiene già.
var CHIAVE = '__CHIAVE__';

// Quali mail guardare, con la ricerca di Gmail. Con una casella usata solo per le fatture va bene così;
// altrimenti limita al mittente, per esempio: 'from:fatture@servizio.it has:attachment'
var RICERCA = 'has:attachment';

var ALLEGATI = /\.(xml|p7m|zip|pdf)$/i;
var GIORNI = 60;   // non si guarda più indietro di così
var VERSIONE = 2;

// La prima volta premi «Esegui» con questa funzione: Google chiede i permessi (Gmail, notifiche, controllo
// ogni 15 minuti) e nel registro compaiono gli allegati che lo script passerebbe all'app.
function prova() {
  installa();
  var r = elenco(0);
  Logger.log('Casella ' + r.casella + ': ' + r.file.length + ' allegati negli ultimi ' + GIORNI + ' giorni');
  r.file.forEach(function (f) { Logger.log(new Date(f.data).toLocaleString() + '  ' + f.nome + '  da ' + f.da); });
  Logger.log('Dispositivi iscritti alle notifiche: ' + (leggi('iscrizioni') || []).length);
}

/* ---------- richieste dell'app ---------- */
// GET ?k=chiave&dal=… elenca gli allegati; ?op=file&id=… ne scarica uno; ?op=vapid dà la chiave pubblica delle notifiche.
// POST (testo JSON con k e op): iscrivi, disiscrivi, stato (riepilogo di scadenze e scorte), prova-notifica.
function doGet(e) { return rispondi((e && e.parameter) || {}); }
function doPost(e) {
  var p = {};
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}') || {}; } catch (err) { p = {}; }
  if (!p.k && e && e.parameter && e.parameter.k) p.k = e.parameter.k;
  return rispondi(p);
}
function rispondi(p) {
  if (String(CHIAVE).length < 16 || p.k !== CHIAVE) return risposta({ok: false, errore: 'chiave', versione: VERSIONE});
  var out;
  try {
    if (p.op === 'file') out = file(p.id);
    else if (p.op === 'vapid') out = {ok: true, pub: vapid().pub};
    else if (p.op === 'iscrivi') out = iscrivi(p);
    else if (p.op === 'disiscrivi') out = disiscrivi(p);
    else if (p.op === 'stato') out = salvaStato(p);
    else if (p.op === 'prova-notifica') out = provaNotifica();
    else out = elenco(Number(p.dal) || 0);
  } catch (err) {
    out = {ok: false, errore: String((err && err.message) || err)};
  }
  out.versione = VERSIONE;
  return risposta(out);
}
function risposta(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- fatture dalla posta ---------- */
// allegati delle mail arrivate dopo «dal», con un giorno di margine: i doppioni li scarta l'app
function elenco(dal) {
  var da = Math.max(dal - 864e5, Date.now() - GIORNI * 864e5);
  var fili = GmailApp.search(RICERCA + ' after:' + Math.floor(da / 1000), 0, 200);
  var out = [];
  fili.forEach(function (filo) {
    filo.getMessages().forEach(function (m) {
      var t = m.getDate().getTime();
      if (t < da) return;
      m.getAttachments({includeInlineImages: false}).forEach(function (a, i) {
        if (ALLEGATI.test(a.getName())) out.push({id: m.getId() + ':' + i, nome: a.getName(), data: t, da: m.getFrom(), oggetto: m.getSubject(), byte: a.getSize()});
      });
    });
  });
  out.sort(function (a, b) { return a.data - b.data; });
  return {ok: true, casella: Session.getEffectiveUser().getEmail(), adesso: Date.now(), file: out.slice(0, 300)};
}
function file(id) {
  var parti = String(id || '').split(':');
  var m = parti[0] ? GmailApp.getMessageById(parti[0]) : null;
  var a = m ? m.getAttachments({includeInlineImages: false})[Number(parti[1])] : null;
  if (!a) return {ok: false, errore: 'allegato non trovato'};
  return {ok: true, nome: a.getName(), b64: Utilities.base64Encode(a.getBytes())};
}

/* ---------- notifiche: iscrizioni e riepilogo ---------- */
function iscrivi(p) {
  var s = p.sub || {}, k = s.keys || {}, ep = String(s.endpoint || '');
  if (!/^https:\/\/\S+$/.test(ep) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/\S*$/.test(ep)) return {ok: false, errore: 'iscrizione non valida'};
  if (deb64u(k.p256dh || '').length !== 65 || deb64u(k.auth || '').length !== 16) return {ok: false, errore: 'iscrizione non valida'};
  return conLock(function () {
    var subs = (leggi('iscrizioni') || []).filter(function (x) { return x.endpoint !== ep; });
    subs.push({endpoint: ep, p256dh: k.p256dh, auth: k.auth, quando: Date.now(), da: String(p.da || '').slice(0, 80)});
    scrivi('iscrizioni', subs.slice(-20));
    var n = impostaNotifiche(leggi('notifiche') || {}, p);
    if (!n.fattureDal) n.fattureDal = Date.now();   // le fatture già arrivate non si notificano
    scrivi('notifiche', n);
    installa();
    return {ok: true, dispositivi: subs.length};
  });
}
function disiscrivi(p) {
  return conLock(function () {
    var subs = (leggi('iscrizioni') || []).filter(function (x) { return x.endpoint !== String(p.endpoint || ''); });
    scrivi('iscrizioni', subs);
    return {ok: true, dispositivi: subs.length};
  });
}
function salvaStato(p) {
  var st = p.stato || {};
  return conLock(function () {
    scrivi('stato', {lotti: (st.lotti || []).slice(0, 400), scorte: (st.scorte || []).slice(0, 200), giorni: Number(st.giorni) >= 0 ? Number(st.giorni) : 3, quando: Date.now()});
    scrivi('notifiche', impostaNotifiche(leggi('notifiche') || {}, p));
    return {ok: true};
  });
}
function impostaNotifiche(n, p) {
  if (/^\d\d:\d\d$/.test(String(p.ora || ''))) n.ora = p.ora;
  if (p.fuso) n.fuso = String(p.fuso).slice(0, 60);
  if (p.temi) n.temi = {scadenze: p.temi.scadenze !== false, scorte: p.temi.scorte !== false, fatture: p.temi.fatture !== false};
  if (p.origine) n.origine = String(p.origine).slice(0, 200);
  return n;
}
function provaNotifica() {
  var esiti = inviaATutti({title: 'Barista Flow', body: 'Le notifiche funzionano: ogni giorno qui trovi scadenze e scorte da controllare.', tag: 'prova', url: './#impostazioni'});
  if (!esiti.length) return {ok: false, errore: 'nessun dispositivo iscritto'};
  return {ok: true, inviate: esiti.filter(function (c) { return c >= 200 && c < 300; }).length, esiti: esiti};
}

/* ---------- controllo ogni 15 minuti ---------- */
function installa() {
  var c = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'controllo'; });
  if (!c) ScriptApp.newTrigger('controllo').timeBased().everyMinutes(15).create();
}
function controllo() {
  if (!(leggi('iscrizioni') || []).length) return;
  var n = leggi('notifiche') || {}, temi = n.temi || {}, fuso = n.fuso || 'Europe/Rome', ora = new Date();
  var oggi = Utilities.formatDate(ora, fuso, 'yyyy-MM-dd'), hm = Utilities.formatDate(ora, fuso, 'HH:mm');
  // fatture arrivate dall'ultimo controllo
  if (temi.fatture !== false) {
    var dal = n.fattureDal || Date.now(), nuove = {}, ultimo = dal;
    if (n.fattureDal) elenco(dal).file.forEach(function (f) { if (f.data > dal) { nuove[f.id.split(':')[0]] = f.oggetto || f.nome; ultimo = Math.max(ultimo, f.data); } });
    var ogg = Object.keys(nuove).map(function (k) { return nuove[k]; });
    aggiorna(function (m) { m.fattureDal = ultimo; });
    if (ogg.length) inviaATutti({title: 'Barista Flow', body: ogg.length === 1 ? 'È arrivata una fattura dalla posta: ' + String(ogg[0]).slice(0, 80) : 'Sono arrivate ' + ogg.length + ' fatture dalla posta.', tag: 'fatture', url: './#acquisti'});
  }
  // avvisi del giorno, una volta sola, dall'ora scelta in poi
  if (n.inviata === oggi || hm < (n.ora || '08:00')) return;
  aggiorna(function (m) { m.inviata = oggi; });
  var msg = avvisi(leggi('stato'), oggi, temi);
  if (msg) inviaATutti(msg);
}
function aggiorna(fn) { conLock(function () { var m = leggi('notifiche') || {}; fn(m); scrivi('notifiche', m); }); }

// il testo della notifica: lotti scaduti, che scadono oggi o a breve, articoli da riordinare
function avvisi(st, oggi, temi) {
  if (!st) return null;
  var righe = [], lotti = st.lotti || [], fine = piuGiorni(oggi, st.giorni >= 0 ? st.giorni : 3);
  if (temi.scadenze !== false) {
    var scaduti = lotti.filter(function (l) { return l.s < oggi; }), oggiL = lotti.filter(function (l) { return l.s === oggi; });
    var presto = lotti.filter(function (l) { return l.s > oggi && l.s <= fine; });
    if (scaduti.length) righe.push((scaduti.length === 1 ? '1 lotto scaduto' : scaduti.length + ' lotti scaduti') + ' da smaltire: ' + nomi(scaduti));
    if (oggiL.length) righe.push('Scade oggi: ' + nomi(oggiL));
    if (presto.length) righe.push('In scadenza: ' + nomi(presto, true));
  }
  if (temi.scorte !== false && (st.scorte || []).length) righe.push('Da riordinare: ' + nomi(st.scorte));
  if (!righe.length) return null;
  return {title: 'Barista Flow', body: righe.join('\n'), tag: 'avvisi-' + oggi, url: './#oggi'};
}
function nomi(xs, conData) {
  var u = [];
  xs.forEach(function (x) { var t = String(x.n || '') + (conData && x.s ? ' (' + x.s.slice(8, 10) + '/' + x.s.slice(5, 7) + ')' : ''); if (t && u.indexOf(t) < 0) u.push(t); });
  return u.slice(0, 3).join(', ') + (u.length > 3 ? ' e altri ' + (u.length - 3) : '');
}
function piuGiorni(iso, g) {
  var d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + g));
  return d.toISOString().slice(0, 10);
}

/* ---------- invio delle notifiche (Web Push: RFC 8030, 8291, 8292) ---------- */
function inviaATutti(msg) {
  var subs = leggi('iscrizioni') || [], esiti = [], via = [];
  subs.forEach(function (s) {
    var c;
    try { c = inviaPush(s, msg); } catch (err) { c = 0; }
    esiti.push(c);
    if (c === 404 || c === 410) via.push(s.endpoint);   // il dispositivo ha tolto il permesso o reinstallato l'app
  });
  if (via.length) conLock(function () { scrivi('iscrizioni', (leggi('iscrizioni') || []).filter(function (x) { return via.indexOf(x.endpoint) < 0; })); });
  aggiorna(function (m) { m.esito = {quando: Date.now(), codici: esiti}; });
  return esiti;
}
function inviaPush(sub, msg) {
  var v = vapid(), aud = sub.endpoint.match(/^https?:\/\/[^\/]+/)[0];
  var mail = Session.getEffectiveUser().getEmail(), n = leggi('notifiche') || {};
  var claims = {aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: mail ? 'mailto:' + mail : (n.origine || 'mailto:barista-flow@example.com')};
  var r = UrlFetchApp.fetch(sub.endpoint, {method: 'post', contentType: 'application/octet-stream', payload: s8(cifra(JSON.stringify(msg), sub.p256dh, sub.auth)), muteHttpExceptions: true,
    headers: {'TTL': '43200', 'Urgency': 'normal', 'Content-Encoding': 'aes128gcm', 'Authorization': 'vapid t=' + firmaJwt(claims, v) + ', k=' + v.pub}});
  return r.getResponseCode();
}
// coppia di chiavi VAPID dello script: la privata resta qui, la pubblica va all'app
function vapid() {
  var v = leggi('vapid');
  if (v && v.d && v.pub) return v;
  return conLock(function () {
    var w = leggi('vapid'); if (w && w.d && w.pub) return w;
    var d = scalareCasuale();
    w = {d: d.toString(16), pub: b64u(puntoBytes(ecMul(d, EC.G)))};
    scrivi('vapid', w);
    return w;
  });
}
function firmaJwt(claims, v) {
  var input = b64u(utf8(JSON.stringify({typ: 'JWT', alg: 'ES256'}))) + '.' + b64u(utf8(JSON.stringify(claims)));
  return input + '.' + b64u(firmaES256(utf8(input), BigInt('0x' + v.d)));
}
// RFC 8291: cifratura del messaggio per il dispositivo (ECDH P-256, HKDF-SHA-256, AES-128-GCM)
function cifra(testo, p256dh, auth, fissi) {   // fissi: chiave effimera e sale fissi, solo per le prove
  var ua = deb64u(p256dh), sec = deb64u(auth), Q = puntoDa(ua);
  var d = fissi ? fissi.d : scalareCasuale(), as = puntoBytes(ecMul(d, EC.G));
  var ecdh = by(ecMul(d, Q)[0], 32);
  var ikm = hkdf(sec, ecdh, cat(utf8('WebPush: info'), [0], ua, as), 32);
  var sale = fissi ? fissi.sale : casuali(16);
  var cek = hkdf(sale, ikm, cat(utf8('Content-Encoding: aes128gcm'), [0]), 16);
  var nonce = hkdf(sale, ikm, cat(utf8('Content-Encoding: nonce'), [0]), 12);
  return cat(sale, [0, 0, 16, 0], [65], as, gcm(cek, nonce, cat(utf8(testo), [2])));
}

/* ---------- archivio dello script ---------- */
function conLock(fn) {
  var l = LockService.getScriptLock(); l.waitLock(20000);
  try { return fn(); } finally { l.releaseLock(); }
}
// le proprietà dello script tengono al massimo 9 kB per voce: i valori lunghi si spezzano
function leggi(nome) {
  var P = PropertiesService.getScriptProperties(), n = Number(P.getProperty(nome + '#') || 0), s = '';
  if (!n) s = P.getProperty(nome) || '';
  for (var i = 0; i < n; i++) s += P.getProperty(nome + '#' + i) || '';
  try { return s ? JSON.parse(s) : null; } catch (err) { return null; }
}
function scrivi(nome, val) {
  var P = PropertiesService.getScriptProperties(), s = JSON.stringify(val), old = Number(P.getProperty(nome + '#') || 0);
  for (var i = 0; i < old; i++) P.deleteProperty(nome + '#' + i);
  P.deleteProperty(nome + '#'); P.deleteProperty(nome);
  if (s.length <= 3000) { P.setProperty(nome, s); return; }
  var parti = Math.ceil(s.length / 3000);
  for (var j = 0; j < parti; j++) P.setProperty(nome + '#' + j, s.slice(j * 3000, (j + 1) * 3000));
  P.setProperty(nome + '#', String(parti));
}

/* ---------- byte e codifiche ---------- */
function u8(a) { var o = []; for (var i = 0; i < a.length; i++) o.push(a[i] & 255); return o; }   // byte di Google (con segno) → 0-255
function s8(a) { return a.map(function (b) { return b > 127 ? b - 256 : b; }); }
function cat() { var o = []; for (var i = 0; i < arguments.length; i++) o = o.concat(arguments[i]); return o; }
function zeri(n, v) { var o = []; for (var i = 0; i < n; i++) o.push(v || 0); return o; }
function utf8(s) { var b = unescape(encodeURIComponent(s)), o = []; for (var i = 0; i < b.length; i++) o.push(b.charCodeAt(i)); return o; }
function b64u(bytes) { return Utilities.base64EncodeWebSafe(s8(bytes)).replace(/=+$/, ''); }
function deb64u(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; try { return u8(Utilities.base64Decode(s)); } catch (err) { return []; } }
function sha256(b) { return u8(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s8(b))); }
function hmac(key, data) { return u8(Utilities.computeHmacSha256Signature(s8(data), s8(key))); }
function hkdf(sale, ikm, info, len) { return hmac(hmac(sale, ikm), cat(info, [1])).slice(0, len); }
function bi(b) { var x = 0n; for (var i = 0; i < b.length; i++) x = (x << 8n) | BigInt(b[i]); return x; }
function by(x, len) { var o = zeri(len); for (var i = len - 1; i >= 0; i--) { o[i] = Number(x & 255n); x >>= 8n; } return o; }
function casuali(n) {   // UUID casuali di Google passati per SHA-256
  var o = [];
  while (o.length < n) o = o.concat(sha256(utf8(Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random())));
  return o.slice(0, n);
}

/* ---------- curva P-256 ed ECDSA ---------- */
var EC = {
  p: 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn,
  n: 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n,
  b: 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn,
  G: [0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n, 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n]
};
function mod(a, m) { var r = a % m; return r < 0n ? r + m : r; }
function inv(a, m) {   // inverso modulare, Euclide esteso
  var r0 = mod(a, m), r1 = m, s0 = 1n, s1 = 0n, q, t;
  while (r1) { q = r0 / r1; t = r0 - q * r1; r0 = r1; r1 = t; t = s0 - q * s1; s0 = s1; s1 = t; }
  return mod(s0, m);
}
function ecAdd(P, Q) {   // punti in coordinate affini; null è il punto all'infinito
  if (!P) return Q; if (!Q) return P;
  var p = EC.p, l;
  if (P[0] === Q[0]) {
    if (mod(P[1] + Q[1], p) === 0n) return null;
    l = mod(3n * P[0] * P[0] - 3n, p) * inv(2n * P[1], p) % p;
  } else l = mod(Q[1] - P[1], p) * inv(Q[0] - P[0], p) % p;
  var x = mod(l * l - P[0] - Q[0], p);
  return [x, mod(l * (P[0] - x) - P[1], p)];
}
function ecMul(k, P) { var R = null, A = P; while (k > 0n) { if (k & 1n) R = ecAdd(R, A); A = ecAdd(A, A); k >>= 1n; } return R; }
function puntoBytes(Q) { return cat([4], by(Q[0], 32), by(Q[1], 32)); }
function puntoDa(b) {
  if (b.length !== 65 || b[0] !== 4) throw new Error('chiave del dispositivo non valida');
  var x = bi(b.slice(1, 33)), y = bi(b.slice(33)), p = EC.p;
  if (mod(y * y - (x * x * x - 3n * x + EC.b), p) !== 0n) throw new Error('chiave del dispositivo non valida');
  return [x, y];
}
function scalareCasuale() { return mod(bi(casuali(32)), EC.n - 1n) + 1n; }
// RFC 6979: il numero segreto di ogni firma si ricava dalla chiave e dal messaggio, senza bisogno di caso
function kFirma(d, h1) {
  var x = by(d, 32), h = by(mod(bi(h1), EC.n), 32), V = zeri(32, 1), K = zeri(32, 0);
  K = hmac(K, cat(V, [0], x, h)); V = hmac(K, V);
  K = hmac(K, cat(V, [1], x, h)); V = hmac(K, V);
  for (var i = 0; i < 100; i++) {
    V = hmac(K, V);
    var k = bi(V);
    if (k > 0n && k < EC.n) return k;
    K = hmac(K, cat(V, [0])); V = hmac(K, V);
  }
  throw new Error('firma non riuscita');
}
function firmaES256(msg, d) {
  var h = sha256(msg), e = bi(h), k = kFirma(d, h), r = mod(ecMul(k, EC.G)[0], EC.n);
  var s = mod(inv(k, EC.n) * mod(e + r * d, EC.n), EC.n);
  return cat(by(r, 32), by(s, 32));
}

/* ---------- AES-128-GCM ---------- */
var SBOX = (function () {
  var s = zeri(256), p = 1, q = 1, r = function (x, k) { return ((x << k) | (x >> (8 - k))) & 255; };
  do {
    p = (p ^ (p << 1) ^ (p & 0x80 ? 0x1b : 0)) & 255;
    q = (q ^ (q << 1)) & 255; q = (q ^ (q << 2)) & 255; q = (q ^ (q << 4)) & 255; if (q & 0x80) q ^= 0x09;
    s[p] = q ^ r(q, 1) ^ r(q, 2) ^ r(q, 3) ^ r(q, 4) ^ 0x63;
  } while (p !== 1);
  s[0] = 0x63;
  return s;
})();
function xt(a) { return ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 255; }
function aesChiavi(key) {
  var w = key.slice(), rc = 1;
  for (var i = 16; i < 176; i += 4) {
    var t = w.slice(i - 4, i);
    if (i % 16 === 0) { t = [SBOX[t[1]] ^ rc, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]]; rc = xt(rc); }
    for (var j = 0; j < 4; j++) w.push(w[i - 16 + j] ^ t[j]);
  }
  return w;
}
function aesBlocco(w, input) {
  var s = input.map(function (b, i) { return b ^ w[i]; });
  for (var r = 1; r <= 10; r++) {
    s = s.map(function (b) { return SBOX[b]; });
    s = [s[0], s[5], s[10], s[15], s[4], s[9], s[14], s[3], s[8], s[13], s[2], s[7], s[12], s[1], s[6], s[11]];
    if (r < 10) {
      var m = [];
      for (var c = 0; c < 4; c++) {
        var a0 = s[4 * c], a1 = s[4 * c + 1], a2 = s[4 * c + 2], a3 = s[4 * c + 3], t = a0 ^ a1 ^ a2 ^ a3;
        m.push(a0 ^ t ^ xt(a0 ^ a1), a1 ^ t ^ xt(a1 ^ a2), a2 ^ t ^ xt(a2 ^ a3), a3 ^ t ^ xt(a3 ^ a0));
      }
      s = m;
    }
    for (var i = 0; i < 16; i++) s[i] ^= w[16 * r + i];
  }
  return s;
}
function gcm(key, iv, testo) {   // senza dati aggiuntivi: testo cifrato seguito dall'etichetta di 16 byte
  var w = aesChiavi(key), H = bi(aesBlocco(w, zeri(16))), R = 0xe1n << 120n, out = [], ctr = 2;
  var mul = function (X, Y) { var Z = 0n, V = Y; for (var i = 127; i >= 0; i--) { if ((X >> BigInt(i)) & 1n) Z ^= V; V = (V & 1n) ? (V >> 1n) ^ R : V >> 1n; } return Z; };
  for (var o = 0; o < testo.length; o += 16) {
    var ks = aesBlocco(w, cat(iv, by(BigInt(ctr++), 4))), blk = testo.slice(o, o + 16);
    for (var i = 0; i < blk.length; i++) out.push(blk[i] ^ ks[i]);
  }
  var Y = 0n;
  for (var j = 0; j < out.length; j += 16) { var b = out.slice(j, j + 16); while (b.length < 16) b.push(0); Y = mul(Y ^ bi(b), H); }
  Y = mul(Y ^ BigInt(out.length * 8), H);
  return out.concat(by(bi(aesBlocco(w, cat(iv, [0, 0, 0, 1]))) ^ Y, 16));
}
