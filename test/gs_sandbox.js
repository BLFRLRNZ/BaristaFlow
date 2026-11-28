// Ambiente Google finto per eseguire lo script di Barista Flow fuori da Google:
// Gmail, proprietà dello script, lucchetto, attivatori, UrlFetchApp e Utilities (con la crittografia di Node).
const vm = require('vm'), crypto = require('crypto');

const signed = b => [...b].map(x => (x > 127 ? x - 256 : x));
const buf = a => Buffer.from([...a].map(x => x & 255));
const b64u = b => Buffer.from(b).toString('base64url');
const unb64u = s => Buffer.from(String(s), 'base64url');
const att = (name, data) => { const b = Buffer.isBuffer(data) ? data : Buffer.from(String(data)); return {getName: () => name, getSize: () => b.length, getBytes: () => signed(b)}; };
const msg = (id, t, atts, subj, from) => ({getId: () => id, getDate: () => new Date(t), getFrom: () => from || 'Fatture <noreply@servizio.example>', getSubject: () => subj || 'Copia fattura ' + id, getAttachments: () => atts});

function crea(src, o = {}) {
  const now = o.now || (() => Date.now()), mails = o.mails || (() => []);
  const props = o.props || new Map(), triggers = o.triggers || [], fetches = [], codes = o.codes || {};
  const s = {
    Date: class extends Date { constructor(...a) { if (a.length) super(...a); else super(now()); } static now() { return now(); } },
    queries: [],
    GmailApp: {
      search: q => { s.queries.push(q); const m = mails(); return [{getMessages: () => m.slice(0, 2)}, {getMessages: () => m.slice(2)}]; },
      getMessageById: id => mails().find(m => m.getId() === id) || null
    },
    // chi apre la pagina: con «Esegui come: Io» Google lo dice solo quando è il proprietario (o.attivo); vuoto per tutti gli altri
    Session: {getEffectiveUser: () => ({getEmail: () => o.email || 'fatture.bar@gmail.com'}),
      getActiveUser: () => ({getEmail: () => (typeof o.attivo === 'function' ? o.attivo() : o.attivo) || ''})},
    Utilities: {
      DigestAlgorithm: {SHA_256: 'sha256'},
      computeDigest: (alg, b) => signed(crypto.createHash('sha256').update(buf(b)).digest()),
      computeHmacSha256Signature: (v, k) => signed(crypto.createHmac('sha256', buf(k)).update(buf(v)).digest()),
      base64Encode: b => buf(b).toString('base64'),
      base64EncodeWebSafe: b => buf(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64Decode: str => { if (/[^A-Za-z0-9+/=]/.test(str)) throw new Error('base64'); return signed(Buffer.from(str, 'base64')); },
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, f) => {
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(d).map(x => [x.type, x.value]));
        return f === 'yyyy-MM-dd' ? `${p.year}-${p.month}-${p.day}` : `${p.hour}:${p.minute}`;
      }
    },
    PropertiesService: {getScriptProperties: () => ({
      getProperty: k => (props.has(k) ? props.get(k) : null),
      setProperty: (k, v) => { if (Buffer.byteLength(String(v)) > 9 * 1024) throw new Error('valore troppo lungo: ' + k); props.set(k, String(v)); },
      deleteProperty: k => { props.delete(k); }
    })},
    LockService: {getScriptLock: () => ({waitLock() {}, releaseLock() {}})},
    ScriptApp: {
      getProjectTriggers: () => triggers.map(f => ({getHandlerFunction: () => f.fn, _t: f})),
      deleteTrigger: t => { const i = triggers.indexOf(t && t._t); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: fn => ({timeBased: () => ({
        everyMinutes: m => ({create: () => triggers.push({fn, m})}),
        everyDays: d => ({atHour: h => ({inTimezone: tz => ({create: () => triggers.push({fn, d, h, tz})})})})
      })})
    },
    MailApp: {sendEmail: m => { s.inviate.push(m); }},
    inviate: [],
    UrlFetchApp: {fetch: (url, opt) => { fetches.push({url, o: opt}); return {getResponseCode: () => codes[url] || 201}; }},
    ContentService: {MimeType: {JSON: 'json'}, createTextOutput: t => ({t, mime: '', setMimeType(m) { this.mime = m; return this; }})},
    HtmlService: {createHtmlOutput: html => ({html: String(html), title: '', metas: {}, w: 0, h: 0,
      setTitle(x) { this.title = x; return this; }, addMetaTag(n, c) { this.metas[n] = c; return this; },
      setWidth(x) { this.w = x; return this; }, setHeight(x) { this.h = x; return this; }, getContent() { return this.html; }})},
    Logger: {lines: [], log(x) { this.lines.push(String(x)); }},
    props, triggers, fetches, codes
  };
  if (o.SpreadsheetApp) s.SpreadsheetApp = o.SpreadsheetApp;   // il foglio del ponte di Claude
  if (o.UrlFetchApp) s.UrlFetchApp = o.UrlFetchApp;            // risposte su misura (per esempio l'API di Claude)
  vm.createContext(s);
  vm.runInContext(src, s);
  return s;
}

// il telefono: la sua coppia di chiavi e il segreto di autenticazione, come nell'iscrizione alle notifiche
function nuovoTelefono(ep) {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return {ecdh, auth, sub: {endpoint: ep, keys: {p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth)}}};
}
// decifra come un telefono (RFC 8291) con la crittografia di Node
function decifra(body, tel) {
  const salt = body.subarray(0, 16), idlen = body[20], as = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const ecdh = tel.ecdh.computeSecret(as), ua = tel.ecdh.getPublicKey();
  const ikm = Buffer.from(crypto.hkdfSync('sha256', ecdh, tel.auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua, as]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  if (pt[pt.length - 1] !== 2) throw new Error('delimitatore mancante');
  return JSON.parse(pt.subarray(0, pt.length - 1).toString('utf8'));
}
// verifica la firma VAPID con la crittografia di Node
function verificaJwt(jwt, pubB64) {
  const [h, p, sg] = jwt.split('.'), pub = unb64u(pubB64);
  const key = crypto.createPublicKey({key: {kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33))}, format: 'jwk'});
  const ok = crypto.verify('sha256', Buffer.from(h + '.' + p), {key, dsaEncoding: 'ieee-p1363'}, unb64u(sg));
  return {ok, head: JSON.parse(unb64u(h)), claims: JSON.parse(unb64u(p))};
}

// un foglio di calcolo in memoria (il foglio del ponte di Claude): come Google, setValues vuole le dimensioni giuste
function foglioFinto(ui) {
  const sheets = {};
  const mk = name => {
    const rows = [];
    const sh = {
      rows, frozen: 0,
      getDataRange: () => ({getValues: () => rows.map(r => r.slice())}),
      getLastRow: () => rows.length,
      appendRow: r => { rows.push(r.slice()); },
      getRange: (r, c, nr = 1, nc = 1) => ({
        setValues: vs => {
          if (vs.length !== nr || vs.some(x => x.length !== nc)) throw new Error(`setValues: servono ${nr}×${nc} valori`);
          for (let i = 0; i < nr; i++) { rows[r - 1 + i] = rows[r - 1 + i] || []; for (let j = 0; j < nc; j++) rows[r - 1 + i][c - 1 + j] = vs[i][j]; }
        },
        getValues: () => Array.from({length: nr}, (_, i) => Array.from({length: nc}, (_, j) => { const v = (rows[r - 1 + i] || [])[c - 1 + j]; return v === undefined ? '' : v; })),
        setFontWeight() { return this; }
      }),
      setFrozenRows: n => { sh.frozen = n; },
      deleteRow: r => { if (r < 2 || r > rows.length) throw new Error('deleteRow: riga ' + r); rows.splice(r - 1, 1); }
    };
    sheets[name] = sh; return sh;
  };
  return {sheets, app: {getActiveSpreadsheet: () => ({getSheetByName: n => sheets[n] || null, insertSheet: n => mk(n), getSpreadsheetTimeZone: () => 'Europe/Rome'}),
    getUi: () => { if (ui) return ui; throw new Error('niente interfaccia nelle prove'); }}};
}

module.exports = {crea, foglioFinto, nuovoTelefono, decifra, verificaJwt, att, msg, signed, buf, b64u, unb64u};
