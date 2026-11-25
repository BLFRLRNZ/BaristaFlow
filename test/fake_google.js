// Google finto per le prove nel browser: esegue lo script vero, incollato dalla prova come si fa su script.google.com.
// Risponde come Google (rimando a un altro indirizzo, accesso da altri siti) e fa da servizio push: le notifiche che lo
// script manda vengono decifrate con le chiavi del «telefono» e la firma VAPID verificata.
// Uso: node test/fake_google.js PORTA
const http = require('http'), {crea, nuovoTelefono, decifra, verificaJwt, att, msg} = require('./gs_sandbox');

const port = +process.argv[2];
let NOW = Date.now(), s = null, seen = 0;
const props = new Map(), triggers = [], mails = [], outs = new Map(), pushes = [];
const tel = nuovoTelefono(`http://localhost:${port}/push/telefono`);

function raccogli() {
  if (!s) return;
  for (; seen < s.fetches.length; seen++) {
    const f = s.fetches[seen], h = (f.o && f.o.headers) || {}, m = /^vapid t=([^,]+), k=(\S+)$/.exec(h.Authorization || '');
    let note = null, jwt = null, err = '';
    try { note = decifra(Buffer.from(f.o.payload.map(x => x & 255)), tel); } catch (e) { err = String(e); }
    try { jwt = m && verificaJwt(m[1], m[2]); } catch (e) { err += String(e); }
    pushes.push({url: f.url, headers: h, note, jwtOk: !!(jwt && jwt.ok), claims: jwt && jwt.claims, k: m && m[2], err});
  }
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const send = (code, obj, extra = {}) => {
      res.writeHead(code, {'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', ...extra});
      res.end(typeof obj === 'string' ? obj : JSON.stringify(obj));
    };
    try {
      switch (u.pathname) {
        case '/__script': s = crea(body, {now: () => NOW, mails: () => mails, props, triggers}); seen = 0; return send(200, {ok: true});
        case '/__now': NOW = +body; return send(200, {ok: true});
        case '/__mail': { const m = JSON.parse(body); mails.push(msg(m.id, m.t, m.atts.map(a => att(a.name, Buffer.from(a.b64, 'base64'))), m.subject)); return send(200, {ok: true}); }
        case '/__run': s[u.searchParams.get('fn')](); raccogli(); return send(200, {ok: true});
        case '/__state': raccogli(); return send(200, {props: Object.fromEntries(props), triggers, pushes});
        case '/__sub': return send(200, tel.sub);
        case '/macros/s/PROVA/exec': {
          if (!s) return send(404, {errore: 'script non pubblicato'});
          const e = {parameter: Object.fromEntries(u.searchParams), postData: req.method === 'POST' ? {contents: body, type: req.headers['content-type']} : undefined};
          const r = req.method === 'POST' ? s.doPost(e) : s.doGet(e);
          raccogli();
          const id = Math.random().toString(36).slice(2);
          outs.set(id, r.t);
          return send(302, '', {Location: '/macros/echo?id=' + id});
        }
        case '/macros/echo': return send(200, outs.get(u.searchParams.get('id')) || '{}');
        default: return send(404, {});
      }
    } catch (e) { send(500, {errore: String((e && e.stack) || e)}); }
  });
}).listen(port, '127.0.0.1', () => console.log('pronto'));
