// Prova lo script di Google (apps-script/fatture-dalla-posta.gs) fuori da Google: casella Gmail finta,
// proprietà dello script in memoria, servizi push finti. La crittografia si confronta con quella di Node
// e con i vettori di prova delle RFC 6979 e 8291; le notifiche si decifrano come farebbe il telefono.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const {crea, nuovoTelefono, decifra, verificaJwt, att, msg, buf, b64u, unb64u} = require('./gs_sandbox');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'fatture-dalla-posta.gs'), 'utf8');
const KEY = 'Ab3dEf6hIj9kLm2nOp5qRs8t';
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fails++; };

const day = 864e5;
let NOW = Date.UTC(2026, 10, 24, 9, 0);   // 10:00 in Italia
let MAILS = [
  msg('m1', NOW - 2 * day, [att('IT11111111111_001.xml', '<FatturaElettronica/>'), att('logo.png', 'png'), att('IT11111111111_001.pdf', '%PDF-1.4')]),
  msg('m2', NOW - 90 * day, [att('vecchia.xml', '<x/>')]),
  msg('m3', NOW - 3600e3, [att('LOTTO.ZIP', 'PK'), att('firmata.xml.p7m', 'MIIB')])
];
const sandbox = key => crea(SRC.replace('__CHIAVE__', key), {now: () => NOW, mails: () => MAILS});
const out = r => ({mime: r.mime, j: JSON.parse(r.t)});
const get = (s, p) => out(s.doGet({parameter: p}));
const post = (s, body, q = {}) => out(s.doPost({parameter: q, postData: {contents: JSON.stringify(body)}}));

/* ---------- fatture dalla posta ---------- */
let s = sandbox('__CHIAVE__');
check(get(s, {k: '__CHIAVE__'}).j.errore === 'chiave', 'senza la chiave dell\'app non risponde');
s = sandbox(KEY);
check(get(s, {k: 'sbagliata'}).j.errore === 'chiave' && get(s, {}).j.errore === 'chiave' && post(s, {op: 'stato', k: 'x'}).j.errore === 'chiave', 'chiave sbagliata o assente: rifiutata, anche in POST');
let r = get(s, {k: KEY, dal: String(NOW - 7 * day)});
check(r.mime === 'json' && r.j.ok === true && r.j.casella === 'fatture.bar@gmail.com' && r.j.versione === 2, 'risponde in JSON con la casella collegata e la versione');
check(JSON.stringify(r.j.file.map(f => f.id)) === JSON.stringify(['m1:0', 'm1:2', 'm3:0', 'm3:1']), `solo XML, PDF, ZIP e P7M, in ordine di arrivo: ${r.j.file.map(f => f.nome).join(', ')}`);
check(s.queries.at(-1) === 'has:attachment after:' + Math.floor((NOW - 8 * day) / 1000), `ricerca con un giorno di margine: ${s.queries.at(-1)}`);
r = get(s, {k: KEY, dal: '0'});
check(!r.j.file.some(f => f.id.startsWith('m2')), 'al primo collegamento non va oltre 60 giorni');
r = get(s, {k: KEY, op: 'file', id: 'm1:2'});
check(r.j.ok && r.j.nome === 'IT11111111111_001.pdf' && Buffer.from(r.j.b64, 'base64').toString() === '%PDF-1.4', 'scarica l\'allegato chiesto');
check(get(s, {k: KEY, op: 'file', id: 'm9:0'}).j.errore === 'allegato non trovato', 'allegato inesistente: errore chiaro');

/* ---------- crittografia ---------- */
s = sandbox(KEY);
const vmFn = (name, ...a) => s[name](...a);
const S = code => vm.runInContext(code, s);

// SBOX e AES-128-GCM contro Node
check(S('SBOX[0] === 0x63 && SBOX[1] === 0x7c && SBOX[0x53] === 0xed && SBOX[0xff] === 0x16'), 'tabella S di AES corretta');
let gcmOk = true;
for (const len of [0, 1, 15, 16, 17, 33, 100, 257]) {
  const k = crypto.randomBytes(16), iv = crypto.randomBytes(12), pt = crypto.randomBytes(len);
  const c = crypto.createCipheriv('aes-128-gcm', k, iv), ref = Buffer.concat([c.update(pt), c.final(), c.getAuthTag()]);
  if (!buf(vmFn('gcm', [...k], [...iv], [...pt])).equals(ref)) { gcmOk = false; console.log('   AES-GCM diverso con lunghezza', len); }
}
check(gcmOk, 'AES-128-GCM uguale a Node per testi di 0-257 byte');

// P-256: chiave pubblica ed ECDH contro Node
let ecOk = true;
for (let i = 0; i < 4; i++) {
  const a = crypto.createECDH('prime256v1'), b = crypto.createECDH('prime256v1'); a.generateKeys(); b.generateKeys();
  s.__d = BigInt('0x' + a.getPrivateKey('hex'));
  const pub = buf(S('puntoBytes(ecMul(__d, EC.G))'));
  s.__q = [...b.getPublicKey()];
  const sh = buf(S('by(ecMul(__d, puntoDa(__q))[0], 32)'));
  if (!pub.equals(a.getPublicKey()) || !sh.equals(a.computeSecret(b.getPublicKey()))) ecOk = false;
}
check(ecOk, 'P-256: chiave pubblica e segreto ECDH uguali a Node');

// RFC 6979 A.2.5: P-256, SHA-256, messaggio «sample»
s.__d = 0xC9AFA9D845BA75166B5C215767B1D6934E50C3DB36E89B127B8A622B120F6721n;
const k6979 = S('kFirma(__d, sha256(utf8("sample")))').toString(16).toUpperCase();
const sig = buf(S('firmaES256(utf8("sample"), __d)')).toString('hex').toUpperCase();
check(k6979 === 'A6E3C57DD01ABE90086538398355DD4C3B17AA873382B0F24D6129493D8AAD60', 'RFC 6979: numero della firma come nel vettore di prova');
check(sig === 'EFD48B2AACB6A8FD1140DD9CD45E81D69D2C877B56AAF991C34D0EA84EAF3716' + 'F7CB1C942D657C41D436C7A1B6E29F65F3E900DBB9AFF4064DC4AB2F843ACDA8', 'RFC 6979: firma ES256 come nel vettore di prova');

// RFC 8291, appendice A
const A = {
  pt: 'When I grow up, I want to be a watermelon',
  asPriv: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', uaPub: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg', salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
};
s.__fissi = {d: BigInt('0x' + unb64u(A.asPriv).toString('hex')), sale: [...unb64u(A.salt)]};
const body8291 = b64u(buf(vmFn('cifra', A.pt, A.uaPub, A.auth, s.__fissi)));
check(body8291 === A.body, 'RFC 8291: messaggio cifrato identico all\'esempio della norma');

// decifra come un telefono (con Node): intestazione, ECDH, HKDF, AES-128-GCM

/* ---------- notifiche dall'inizio alla fine ---------- */
s = sandbox(KEY);
const tel = nuovoTelefono('https://web.push.apple.com/QGuQyavXutnMtr');
check(post(s, {k: KEY, op: 'iscrivi', sub: {endpoint: 'ftp://x', keys: {}}}).j.errore === 'iscrizione non valida', 'iscrizione non valida: rifiutata');
r = post(s, {k: KEY, op: 'iscrivi', sub: tel.sub, ora: '08:00', fuso: 'Europe/Rome', temi: {scadenze: true, scorte: true, fatture: true}, da: 'iPhone'});
check(r.j.ok && r.j.dispositivi === 1 && s.triggers.length === 1 && s.triggers[0].fn === 'controllo' && s.triggers[0].m === 15, 'iscrizione salvata e controllo ogni 15 minuti installato');
post(s, {k: KEY, op: 'iscrivi', sub: tel.sub});
check(s.triggers.length === 1 && JSON.parse(s.props.get('iscrizioni')).length === 1, 'stesso telefono di nuovo: niente doppioni');
const pub = get(s, {k: KEY, op: 'vapid'}).j.pub;
check(unb64u(pub).length === 65 && unb64u(pub)[0] === 4 && get(s, {k: KEY, op: 'vapid'}).j.pub === pub, 'chiave pubblica VAPID: 65 byte, sempre la stessa');

const STATO = {giorni: 2, lotti: [{n: 'Crostata', s: '2026-11-22'}, {n: 'Biscotti', s: '2026-11-23'}, {n: 'Crema pasticcera', s: '2026-11-24'}, {n: 'Tiramisù', s: '2026-11-25'}, {n: 'Frolla', s: '2026-11-26'}, {n: 'Torta di mele', s: '2026-12-10'}],
  scorte: [{n: 'Cacao amaro'}, {n: 'Vaschette'}]};
check(post(s, {k: KEY, op: 'stato', stato: STATO, ora: '08:00'}).j.ok, 'riepilogo di scadenze e scorte salvato');

NOW = Date.UTC(2026, 10, 24, 6, 50);   // 07:50 in Italia
s.fetches.length = 0; s.controllo();
check(s.fetches.length === 0, 'prima dell\'ora scelta nessuna notifica');
NOW = Date.UTC(2026, 10, 24, 7, 5);    // 08:05
s.controllo();
check(s.fetches.length === 1, 'all\'ora scelta parte una notifica');
let f = s.fetches[0], h = f.o.headers;
check(f.url === tel.sub.endpoint && f.o.method === 'post' && h['Content-Encoding'] === 'aes128gcm' && h.TTL === '43200' && f.o.contentType === 'application/octet-stream', 'richiesta al servizio push con le intestazioni giuste');
const m = /^vapid t=([^,]+), k=(\S+)$/.exec(h.Authorization);
const jwt = m && verificaJwt(m[1], m[2]);
check(m && m[2] === pub && jwt.ok && jwt.head.alg === 'ES256', 'firma VAPID verificata da Node con la chiave pubblica dello script');
check(jwt && jwt.claims.aud === 'https://web.push.apple.com' && jwt.claims.sub === 'mailto:fatture.bar@gmail.com' && jwt.claims.exp === Math.floor(NOW / 1000) + 43200, `dati VAPID: ${JSON.stringify(jwt && jwt.claims)}`);
let note = decifra(buf(f.o.payload), tel);
console.log('    ' + note.body.replace(/\n/g, ' | '));
check(note.title === 'Barista Flow' && note.tag === 'avvisi-2026-11-24' && note.url === './#oggi', 'il telefono decifra la notifica: titolo, etichetta e pagina da aprire');
check(note.body === '2 lotti scaduti da smaltire: Crostata, Biscotti\nScade oggi: Crema pasticcera\nIn scadenza: Tiramisù (25/11), Frolla (26/11)\nDa riordinare: Cacao amaro, Vaschette', 'testo: scaduti, oggi, entro 2 giorni, da riordinare');
NOW = Date.UTC(2026, 10, 24, 10, 0); s.controllo();
check(s.fetches.length === 1, 'una volta sola al giorno');
NOW = Date.UTC(2026, 10, 25, 7, 20); s.controllo();
note = decifra(buf(s.fetches[1].o.payload), tel);
check(s.fetches.length === 2 && note.body.startsWith('3 lotti scaduti da smaltire: Crostata, Biscotti, Crema pasticcera\nScade oggi: Tiramisù'), 'il giorno dopo i conti si rifanno da soli');

// fattura arrivata
MAILS.push(msg('m4', NOW + 60e3, [att('IT22222222222_78.xml', '<x/>'), att('IT22222222222_78.pdf', '%PDF')], 'Fattura 78 - Caseificio Monti'));
NOW += 15 * 60e3; s.controllo();
note = s.fetches[2] && decifra(buf(s.fetches[2].o.payload), tel);
check(s.fetches.length === 3 && note.body === 'È arrivata una fattura dalla posta: Fattura 78 - Caseificio Monti' && note.url === './#acquisti', 'fattura arrivata: una notifica sola anche con XML e PDF');
NOW += 15 * 60e3; s.controllo();
check(s.fetches.length === 3, 'la stessa fattura non si notifica due volte');

// temi spenti, niente da dire, prova, dispositivo sparito
post(s, {k: KEY, op: 'stato', stato: {giorni: 2, lotti: [], scorte: [{n: 'Cacao amaro'}]}, temi: {scadenze: true, scorte: false, fatture: true}});
NOW = Date.UTC(2026, 10, 26, 7, 30); s.controllo();
check(s.fetches.length === 3, 'scorte spente e nessuna scadenza: nessuna notifica');
r = post(s, {k: KEY, op: 'prova-notifica'});
note = decifra(buf(s.fetches[3].o.payload), tel);
check(r.j.ok && r.j.inviate === 1 && note.body.startsWith('Le notifiche funzionano'), 'notifica di prova inviata e decifrata');
const tel2 = nuovoTelefono('https://fcm.googleapis.com/fcm/send/abc:def');
post(s, {k: KEY, op: 'iscrivi', sub: tel2.sub});
s.codes[tel.sub.endpoint] = 410;
r = post(s, {k: KEY, op: 'prova-notifica'});
check(r.j.inviate === 1 && JSON.stringify(r.j.esiti) === '[410,201]' && JSON.parse(s.props.get('iscrizioni')).map(x => x.endpoint).join() === tel2.sub.endpoint, 'telefono che non esiste più (410): tolto; l\'altro riceve');
check(decifra(buf(s.fetches.at(-1).o.payload), tel2).tag === 'prova' && verificaJwt(/t=([^,]+)/.exec(s.fetches.at(-1).o.headers.Authorization)[1], pub).claims.aud === 'https://fcm.googleapis.com', 'anche Android (Chrome) riceve, con il suo indirizzo VAPID');
post(s, {k: KEY, op: 'disiscrivi', endpoint: tel2.sub.endpoint});
check(post(s, {k: KEY, op: 'prova-notifica'}).j.errore === 'nessun dispositivo iscritto', 'senza dispositivi la prova lo dice');

// riepilogo grande: spezzato nelle proprietà e riletto uguale
const tanti = {giorni: 3, lotti: Array.from({length: 400}, (_, i) => ({n: 'Prodotto con un nome piuttosto lungo àèì ' + i, s: '2026-12-' + String(1 + i % 28).padStart(2, '0')})), scorte: []};
post(s, {k: KEY, op: 'stato', stato: tanti});
check(JSON.stringify(S('leggi("stato")').lotti) === JSON.stringify(tanti.lotti) && Number(s.props.get('stato#')) > 1, `riepilogo di 400 lotti salvato in ${s.props.get('stato#')} parti e riletto uguale`);

// la prima esecuzione dall'editor
s = sandbox(KEY); s.prova();
check(s.Logger.lines[0].startsWith('Casella fatture.bar@gmail.com:') && s.triggers.length === 1, 'la funzione di prova elenca gli allegati e installa il controllo');

console.log(fails ? `\n${fails} controlli falliti` : '\nScript di Google: tutto a posto');
process.exit(fails ? 1 : 0);
