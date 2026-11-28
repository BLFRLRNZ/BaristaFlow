// Google finto per provare il pannello del ponte nel browser: esegue il ponte vero (apps-script/claude-ponte.gs) con un
// foglio in memoria e un'API di Claude finta, e serve la pagina come HtmlService, con un google.script.run che chiama
// le funzioni dello script (solo quelle pubbliche, con dati e risposte che passano da JSON come su Google).
// Uso: node test/fake_pannello.js PORTA
const http = require('http'), fs = require('fs'), path = require('path');
const {crea, foglioFinto} = require('./gs_sandbox');

const port = +process.argv[2];
const OWNER = 'ponte.bar@gmail.com';
let chi = OWNER, ritardo = 120, modo = 'ok';
const F = foglioFinto(), calls = [];
const BASE = {leggibile: true, prodotto: 'Farina 00', marca: 'Molino del Borgo', ean: '', lotto: 'MR-2611A', scadenza: '2027-05-31', tipoScadenza: 'preferibilmente',
  confezionamento: '', quantita: 25, unita: 'kg', ingredienti: '', allergeni: [], tracce: [], conservazione: '', dubbi: []};
const UrlFetchApp = {fetch: (url, o) => {
  const body = JSON.parse(o.payload), key = o.headers['x-api-key'];
  calls.push({url, body, key});
  const reply = (code, b) => ({getResponseCode: () => code, getContentText: () => JSON.stringify(b)});
  const err = (code, type, message) => reply(code, {type: 'error', error: {type, message}});
  if (/RIFIUTATA/.test(key)) return err(401, 'authentication_error', 'invalid x-api-key');
  if (!/^claude-(haiku|sonnet)-5-5$/.test(body.model)) return err(404, 'not_found_error', 'model: ' + body.model);
  if (modo === 'crediti') return err(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.');
  const piccola = body.max_tokens === 64;
  return reply(200, {id: 'msg_1', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn',
    content: [{type: 'text', text: piccola ? 'ok' : JSON.stringify(BASE)}], usage: piccola ? {input_tokens: 14, output_tokens: 2} : {input_tokens: 3200, output_tokens: 420}});
}};
const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'claude-ponte.gs'), 'utf8');
const s = crea(src, {SpreadsheetApp: F.app, UrlFetchApp, attivo: () => chi, email: OWNER});

// google.script.run come lo mette Google nelle pagine di HtmlService: withSuccessHandler/withFailureHandler e poi la funzione
const SHIM = `<script>window.google = {script: {run: (function () {
  function runner(ok, ko) {
    return new Proxy({}, {get: function (t, fn) {
      if (fn === 'withSuccessHandler') return function (f) { return runner(f, ko); };
      if (fn === 'withFailureHandler') return function (f) { return runner(ok, f); };
      return function () {
        var args = Array.prototype.slice.call(arguments);
        fetch('/__rpc', {method: 'POST', body: JSON.stringify({fn: fn, args: args})}).then(function (r) { return r.json(); })
          .then(function (j) { if ('errore' in j) { if (ko) ko(new Error(j.errore)); } else if (ok) ok(j.r); }, function (e) { if (ko) ko(e); });
      };
    }});
  }
  return runner(null, null);
})()}};</script>`;

const conDate = x => x && typeof x === 'object' && (typeof x.getTime === 'function' || Object.values(x).some(conDate));

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const send = (code, obj, type = 'application/json; charset=utf-8') => {
      res.writeHead(code, {'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store'});
      res.end(typeof obj === 'string' ? obj : JSON.stringify(obj));
    };
    try {
      switch (u.pathname) {
        case '/macros/s/PROVA/exec': {
          const e = {parameter: Object.fromEntries(u.searchParams), postData: req.method === 'POST' ? {contents: body} : undefined};
          const out = req.method === 'POST' ? s.doPost(e) : s.doGet(e);
          // come HtmlService: titolo e meta (il viewport di addMetaTag) li mette Google nella pagina che fa da cornice
          const metas = Object.entries(out.metas || {}).map(([n, c]) => `<meta name="${n}" content="${c}">`).join('\n');
          if (out.html != null) return send(200, out.html.replace('<head>', `<head>\n${metas}\n<title>${out.title}</title>\n${SHIM}`), 'text/html; charset=utf-8');
          return send(200, out.t);
        }
        case '/__rpc': {
          const {fn, args} = JSON.parse(body);
          if (typeof s[fn] !== 'function' || /_$/.test(fn)) return send(200, {errore: 'Script function not found: ' + fn});
          setTimeout(() => {
            try {
              const r = s[fn](...JSON.parse(JSON.stringify(args)));
              if (conDate(r)) return send(200, {errore: 'google.script.run non passa le date'});
              send(200, {r: r === undefined ? null : JSON.parse(JSON.stringify(r))});
            } catch (err) { send(200, {errore: 'Error: ' + err.message}); }
          }, ritardo);
          return;
        }
        case '/__chi': chi = body; return send(200, {ok: true});
        case '/__claude': modo = body; return send(200, {ok: true});
        case '/__ritardo': ritardo = +body; return send(200, {ok: true});
        case '/__state': return send(200, {sheets: Object.fromEntries(Object.entries(F.sheets).map(([k, v]) => [k, v.rows])), props: Object.fromEntries(s.props), calls, triggers: s.triggers.map(x => ({fn: x.fn, h: x.h, tz: x.tz})), inviate: s.inviate});
        default: return send(404, {});
      }
    } catch (e) { send(500, {errore: String((e && e.stack) || e)}); }
  });
}).listen(port, '127.0.0.1', () => console.log('pronto'));
