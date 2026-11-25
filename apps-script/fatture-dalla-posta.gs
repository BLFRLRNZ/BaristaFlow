/*
 * Barista Flow · Fatture dalla posta
 *
 * Passa a Barista Flow le fatture che arrivano come allegato (XML, P7M, ZIP o PDF)
 * nella casella Gmail dell'account con cui crei questo script.
 * Come si installa: in Barista Flow, Impostazioni → Fatture dalla posta.
 */

// La sceglie l'app: lo script copiato da Barista Flow la contiene già.
var CHIAVE = '__CHIAVE__';

// Quali mail guardare, con la ricerca di Gmail. Con una casella usata solo per le fatture va bene così;
// altrimenti limita al mittente, per esempio: 'from:fatture@servizio.it has:attachment'
var RICERCA = 'has:attachment';

var ALLEGATI = /\.(xml|p7m|zip|pdf)$/i;
var GIORNI = 60;   // non si guarda più indietro di così

// La prima volta premi «Esegui» con questa funzione: Google chiede il permesso di leggere Gmail
// e nel registro compaiono gli allegati che lo script passerebbe all'app.
function prova() {
  var r = elenco(0);
  Logger.log('Casella ' + r.casella + ': ' + r.file.length + ' allegati negli ultimi ' + GIORNI + ' giorni');
  r.file.forEach(function (f) { Logger.log(new Date(f.data).toLocaleString() + '  ' + f.nome + '  da ' + f.da); });
}

// L'app chiama l'indirizzo dell'app web: ?k=chiave&dal=millisecondi per l'elenco, ?k=chiave&op=file&id=… per un allegato
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (String(CHIAVE).length < 16 || p.k !== CHIAVE) return risposta({ok: false, errore: 'chiave'});
  try {
    return risposta(p.op === 'file' ? file(p.id) : elenco(Number(p.dal) || 0));
  } catch (err) {
    return risposta({ok: false, errore: String((err && err.message) || err)});
  }
}

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

function risposta(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
