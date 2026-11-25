// Prova lo script di Google (apps-script/fatture-dalla-posta.gs) con una casella Gmail finta.
const fs = require('fs'), path = require('path'), vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'fatture-dalla-posta.gs'), 'utf8');
const KEY = 'Ab3dEf6hIj9kLm2nOp5qRs8t';
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fails++; };

const NOW = Date.UTC(2026, 10, 24, 9, 0);
const day = 864e5;
const att = (name, text) => ({getName: () => name, getSize: () => Buffer.byteLength(text), getBytes: () => [...Buffer.from(text)]});
const msg = (id, t, atts) => ({getId: () => id, getDate: () => new Date(t), getFrom: () => 'Fatture <noreply@servizio.example>', getSubject: () => 'Copia fattura ' + id, getAttachments: () => atts});
const MAILS = [
  msg('m1', NOW - 2 * day, [att('IT11111111111_001.xml', '<FatturaElettronica/>'), att('logo.png', 'png'), att('IT11111111111_001.pdf', '%PDF-1.4')]),
  msg('m2', NOW - 90 * day, [att('vecchia.xml', '<x/>')]),
  msg('m3', NOW - 3600e3, [att('LOTTO.ZIP', 'PK'), att('firmata.xml.p7m', 'MIIB')])
];
const queries = [];
function sandbox(key) {
  const s = {
    Date: class extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } },
    GmailApp: {
      search: (q, start, max) => { queries.push([q, start, max]); return [{getMessages: () => MAILS.slice(0, 2)}, {getMessages: () => MAILS.slice(2)}]; },
      getMessageById: id => MAILS.find(m => m.getId() === id) || null
    },
    Session: {getEffectiveUser: () => ({getEmail: () => 'fatture.bar@gmail.com'})},
    Utilities: {base64Encode: b => Buffer.from(b).toString('base64')},
    ContentService: {MimeType: {JSON: 'json'}, createTextOutput: t => ({t, mime: '', setMimeType(m) { this.mime = m; return this; }})},
    Logger: {lines: [], log(x) { this.lines.push(String(x)); }}
  };
  vm.createContext(s);
  vm.runInContext(SRC.replace('__CHIAVE__', key), s);
  return s;
}
const call = (s, p) => { const r = s.doGet({parameter: p}); return {mime: r.mime, j: JSON.parse(r.t)}; };

// lo script così com'è nel repository non risponde a nessuno
let s = sandbox('__CHIAVE__');
check(call(s, {k: '__CHIAVE__'}).j.errore === 'chiave', 'senza la chiave dell\'app non risponde');

s = sandbox(KEY);
check(call(s, {k: 'sbagliata'}).j.errore === 'chiave' && call(s, {}).j.errore === 'chiave', 'chiave sbagliata o assente: rifiutata');

let r = call(s, {k: KEY, dal: String(NOW - 7 * day)});
check(r.mime === 'json' && r.j.ok === true && r.j.casella === 'fatture.bar@gmail.com', 'risponde in JSON con la casella collegata');
check(JSON.stringify(r.j.file.map(f => f.id)) === JSON.stringify(['m1:0', 'm1:2', 'm3:0', 'm3:1']), `solo XML, PDF, ZIP e P7M, in ordine di arrivo: ${r.j.file.map(f => f.nome).join(', ')}`);
check(r.j.file[0].data === NOW - 2 * day && r.j.file[0].da.includes('servizio.example') && r.j.file[0].oggetto === 'Copia fattura m1', 'data, mittente e oggetto della mail');
const q = queries[queries.length - 1];
check(q[0] === 'has:attachment after:' + Math.floor((NOW - 8 * day) / 1000), `ricerca con un giorno di margine: ${q[0]}`);

r = call(s, {k: KEY, dal: '0'});
check(!r.j.file.some(f => f.id.startsWith('m2')) && queries[queries.length - 1][0].endsWith(String(Math.floor((NOW - 60 * day) / 1000))), 'al primo collegamento non va oltre 60 giorni');

r = call(s, {k: KEY, op: 'file', id: 'm1:2'});
check(r.j.ok && r.j.nome === 'IT11111111111_001.pdf' && Buffer.from(r.j.b64, 'base64').toString() === '%PDF-1.4', 'scarica l\'allegato chiesto');
check(call(s, {k: KEY, op: 'file', id: 'm9:0'}).j.errore === 'allegato non trovato' && call(s, {k: KEY, op: 'file', id: 'm1:7'}).j.ok === false, 'allegato inesistente: errore chiaro');

s.GmailApp.search = () => { throw new Error('Servizio non disponibile'); };
check(call(s, {k: KEY}).j.errore === 'Servizio non disponibile', 'un errore di Gmail arriva all\'app come testo');

s = sandbox(KEY); s.prova();
check(s.Logger.lines[0].startsWith('Casella fatture.bar@gmail.com: 4 allegati'), 'la funzione di prova elenca gli allegati');

console.log(fails ? `\n${fails} controlli falliti` : '\nScript della posta: tutto a posto');
process.exit(fails ? 1 : 0);
