"""Notifiche sul telefono, dall'inizio alla fine: lo script vero di Google gira in un Google finto (test/fake_google.js),
il browser si iscrive, l'app manda il riepilogo, lo script cifra e firma le notifiche, il «telefono» le decifra
e il service worker dell'app le mostra. Il servizio push vero non si può raggiungere da qui: l'iscrizione del browser
è simulata con le chiavi del telefono finto."""
import functools, http.server, json, pathlib, socket, subprocess, sys, threading, time, urllib.request
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from mock import MOCK_TEMPLATE

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / "test" / "screenshot"
fails, errors = [], []
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)
T = lambda s: s.replace(" ", " ").replace(" ", " ")
def free():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p

GPORT = free()
fake = subprocess.Popen(["node", str(ROOT / "test" / "fake_google.js"), str(GPORT)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
assert fake.stdout.readline().strip() == "pronto"
G = f"http://127.0.0.1:{GPORT}"
def g(path, data=None):
    req = urllib.request.Request(G + path, data=None if data is None else (data if isinstance(data, bytes) else str(data).encode()), method="GET" if data is None else "POST")
    with urllib.request.urlopen(req) as r: return json.loads(r.read() or b"{}")
def gs(name):
    v = g("/__state")["props"].get(name)
    return json.loads(v) if v else None
def at(y, mo, d, h, mi): return int(datetime(y, mo, d, h - 1, mi, tzinfo=timezone.utc).timestamp() * 1000)   # ora italiana d'inverno

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
APORT = free()
app = http.server.ThreadingHTTPServer(("127.0.0.1", APORT), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=app.serve_forever, daemon=True).start()
ORIGIN = f"http://localhost:{APORT}"   # «localhost»: il browser considera sicura la pagina e accetta il service worker
URL = ORIGIN + "/index.html"
SCRIPT_URL = G + "/macros/s/PROVA/exec"

SUB = g("/__sub")
g("/__now", at(2026, 11, 24, 10, 0))   # l'orologio di Google come quello della pagina
SEED = json.loads((ROOT / "test" / "dati-test.json").read_text(encoding="utf-8"))
SEED["impostazioni"] = {"generale": {"nome": "Bar di prova", "registrato": 1}}
INIT = """
if (!localStorage.getItem('barista-flow-v1')) localStorage.setItem('barista-flow-v1', %s);
// iscrizione alle notifiche con le chiavi del telefono finto (il servizio push vero non è raggiungibile da qui)
(() => {
  const S = %s;
  if (!window.PushManager) return;
  const sub = {endpoint: S.endpoint, options: {}, toJSON: () => ({endpoint: S.endpoint, expirationTime: null, keys: S.keys}),
    unsubscribe: async () => { window.__unsub = (window.__unsub || 0) + 1; window.__sub = null; return true; }};
  PushManager.prototype.subscribe = async function (o) { window.__subOpts = {uvo: o.userVisibleOnly, key: Array.from(new Uint8Array(o.applicationServerKey.buffer || o.applicationServerKey))}; sub.options = {applicationServerKey: new Uint8Array(o.applicationServerKey).buffer}; window.__sub = sub; return sub; };
  PushManager.prototype.getSubscription = async function () { return window.__sub || null; };
})();
""" % (json.dumps(json.dumps(SEED)), json.dumps(SUB))

def newpage(br, init, ua=None):
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", has_touch=True, **({"user_agent": ua} if ua else {}))
    ctx.grant_permissions(["notifications", "clipboard-read", "clipboard-write"], origin=ORIGIN)
    pg = ctx.new_page(); pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00")
    pg.add_init_script(init)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    return ctx, pg
top = lambda pg: pg.locator(".sheet-wrap").last
def toast(pg, text, timeout=20000):
    pg.wait_for_function("t => [...document.querySelectorAll('#toast .toast')].some(x => x.textContent.includes(t))", arg=text, timeout=timeout)
def tiles(pg):
    return {T(b.locator("span").last.inner_text()): int(b.locator("b").inner_text()) for b in pg.locator("#v-oggi .tile").all()}
def card(pg): return T(pg.locator("#notifiche").inner_text())
def shot(pg, name): pg.wait_for_timeout(350); pg.screenshot(path=str(SHOTS / f"{name}.png"))

with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx, pg = newpage(br, INIT)
    cdp = ctx.new_cdp_session(pg); regs = []
    cdp.on("ServiceWorker.workerRegistrationUpdated", lambda e: regs.extend(e["registrations"]))
    cdp.send("ServiceWorker.enable")
    pg.goto(URL); pg.wait_for_selector("#v-oggi"); pg.wait_for_timeout(500)
    oggi = tiles(pg)
    sotto = sorted(T(r.locator("b").inner_text()) for r in pg.locator("#v-oggi .row", has_text="Sotto scorta").all())

    # prima serve lo script di Google: lo si collega dalla card delle notifiche
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#notifiche")
    check("collegalo prima" in card(pg), "senza script: la card spiega che serve collegarlo")
    pg.locator("#notifiche .btn", has_text="Collega lo script di Google").click(); pg.wait_for_timeout(350)
    t = top(pg); t.locator("[data-act=posta-copia]").click(); toast(pg, "Script copiato")
    copiato = pg.evaluate("navigator.clipboard.readText()")
    check("var VERSIONE = 2;" in copiato and "__CHIAVE__" not in copiato, "lo script copiato dall'app è quello con le notifiche, con la chiave")
    g("/__script", copiato)   # incollato e pubblicato su Google
    t.locator("[data-k=url]").fill(SCRIPT_URL); t.locator("[data-act=save]").click()
    toast(pg, "Posta collegata: fatture.bar@gmail.com"); pg.wait_for_timeout(400)
    check(pg.locator("#notifiche .btn", has_text="Attiva le notifiche").count() == 1 and "dalle 08:00" in T(pg.locator("#notifiche select").evaluate("s => 'dalle ' + s.value")), "script collegato: si possono attivare, alle 08:00 di base")
    check(pg.locator("#notifiche input[type=checkbox]:checked").count() == 3, "scadenze, scorte e fatture scelte di base")
    shot(pg, "notifiche_attiva")

    # attivazione: permesso, chiave dello script, iscrizione, riepilogo
    pg.locator("#notifiche .btn", has_text="Attiva le notifiche").click()
    toast(pg, "Notifiche attive: ogni giorno dalle 08:00")
    vap = gs("vapid"); opts = pg.evaluate("window.__subOpts")
    import base64
    pub = list(base64.urlsafe_b64decode(vap["pub"] + "=="))
    check(opts and opts["uvo"] is True and opts["key"] == pub, "il browser si iscrive con la chiave pubblica dello script e notifiche sempre visibili")
    subs = gs("iscrizioni")
    check(subs and subs[0]["endpoint"] == SUB["endpoint"] and subs[0]["p256dh"] == SUB["keys"]["p256dh"] and subs[0]["da"] == "Computer", "lo script ha l'iscrizione del dispositivo")
    check(g("/__state")["triggers"] == [{"fn": "controllo", "m": 15}], "nello script parte il controllo ogni 15 minuti")
    stato = gs("stato"); n = gs("notifiche")
    check(n["ora"] == "08:00" and n["fuso"] == "Europe/Rome" and n["temi"] == {"scadenze": True, "scorte": True, "fatture": True}, f"ora, fuso e temi nello script: {n}")
    scad = [l for l in stato["lotti"] if l["s"] < "2026-11-24"]; vicini = [l for l in stato["lotti"] if "2026-11-24" <= l["s"] <= "2026-11-27"]
    check(len(scad) == oggi["Lotti scaduti da smaltire"] and len(vicini) == oggi["In scadenza entro 3 giorni"], f"riepilogo coerente con Oggi: {len(scad)} scaduti, {len(vicini)} in scadenza")
    check(sorted(x["n"] for x in stato["scorte"]) == sotto and stato["giorni"] == 3, f"articoli da riordinare uguali a Oggi: {sotto}")
    pg.wait_for_timeout(300)
    check("Attive su questo dispositivo" in card(pg) and "aggiornate nello script oggi alle 10:00" in card(pg), "la card dice che sono attive e quando è stato mandato il riepilogo")
    shot(pg, "notifiche_attive")

    # notifica di prova: firmata, cifrata, decifrata dal «telefono» e mostrata dal service worker
    pg.locator("#notifiche .btn", has_text="Manda una notifica di prova").click(); toast(pg, "Notifica di prova inviata")
    ps = g("/__state")["pushes"]; pr = ps[-1]
    check(pr["jwtOk"] and pr["k"] == vap["pub"] and pr["claims"]["aud"] == f"http://localhost:{GPORT}" and pr["claims"]["sub"] == "mailto:fatture.bar@gmail.com", "firma VAPID valida, verificata con la chiave dello script")
    check(pr["note"] and pr["note"]["tag"] == "prova" and pr["note"]["body"].startswith("Le notifiche funzionano") and pr["headers"]["Content-Encoding"] == "aes128gcm", f"il telefono decifra la notifica di prova {pr['err']}")
    deadline = time.time() + 10
    while not [r for r in regs if r["scopeURL"].startswith(ORIGIN) and not r["isDeleted"]] and time.time() < deadline: pg.wait_for_timeout(200)
    rid = [r for r in regs if r["scopeURL"].startswith(ORIGIN) and not r["isDeleted"]][0]["registrationId"]
    def consegna(note):
        cdp.send("ServiceWorker.deliverPushMessage", {"origin": ORIGIN, "registrationId": rid, "data": json.dumps(note)})
        pg.wait_for_timeout(700)
        return pg.evaluate("navigator.serviceWorker.ready.then(r => r.getNotifications()).then(ns => ns.map(n => ({title: n.title, body: n.body, tag: n.tag, url: n.data && n.data.url})))")
    shown = consegna(pr["note"])
    check(any(x["tag"] == "prova" and x["title"] == "Barista Flow" and x["body"].startswith("Le notifiche funzionano") for x in shown), f"il service worker dell'app mostra la notifica: {shown}")

    # il mattino dopo, alle 08:05, con l'app chiusa
    g("/__now", at(2026, 11, 25, 7, 50)); g("/__run?fn=controllo")
    check(len(g("/__state")["pushes"]) == len(ps), "alle 07:50 ancora niente")
    g("/__now", at(2026, 11, 25, 8, 5)); g("/__run?fn=controllo")
    note = g("/__state")["pushes"][-1]["note"]
    print("    " + note["body"].replace("\n", " | "))
    presto = sorted({f"{l['n']} ({l['s'][8:10]}/{l['s'][5:7]})" for l in stato["lotti"] if "2026-11-25" < l["s"] <= "2026-11-28"}, key=lambda x: (x[-6:-1][3:] + x[-6:-1][:2], x))
    scaduti = [l for l in stato["lotti"] if l["s"] < "2026-11-25"]
    check(note["tag"] == "avvisi-2026-11-25" and note["url"] == "./#oggi", "notifica del giorno, che apre Oggi")
    check((not scaduti or f"{len(scaduti)} lott" in note["body"]) and "In scadenza: " in note["body"] and all(x.split(" (")[0] in note["body"] for x in presto[:3]), "nel testo scaduti e lotti in scadenza del riepilogo")
    check(("Da riordinare: " in note["body"]) == bool(sotto), "nel testo gli articoli da riordinare")
    shown = consegna(note)
    check(any(x["tag"] == "avvisi-2026-11-25" and x["body"] == note["body"] for x in shown), "notifica del giorno mostrata dal service worker")

    # fattura arrivata nella casella mentre l'app è chiusa
    g("/__mail", json.dumps({"id": "m7", "t": at(2026, 11, 25, 8, 30), "subject": "Fattura 2003 - Latteria Val Verde", "atts": [{"name": "IT11111111111_2003.xml", "b64": base64.b64encode(b"<x/>").decode()}]}))
    g("/__now", at(2026, 11, 25, 8, 35)); g("/__run?fn=controllo")
    note = g("/__state")["pushes"][-1]["note"]
    check(note["body"] == "È arrivata una fattura dalla posta: Fattura 2003 - Latteria Val Verde" and note["url"] == "./#acquisti", f"fattura arrivata: notifica che apre Acquisti ({note['body']})")

    # tocco sulla notifica con l'app aperta: il service worker indica la pagina
    pg.evaluate("navigator.serviceWorker.dispatchEvent(new MessageEvent('message', {data: {tipo: 'apri', hash: '#acquisti'}}))"); pg.wait_for_timeout(300)
    check(pg.evaluate("location.hash") == "#acquisti", "il tocco sulla notifica porta alla pagina giusta")

    # preferenze e riepilogo aggiornati da soli
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#notifiche"); pg.wait_for_timeout(300)
    pg.locator("#notifiche select").select_option("07:00"); toast(pg, "Salvato"); pg.wait_for_timeout(600)
    check(gs("notifiche")["ora"] == "07:00", "ora cambiata: lo script la usa dalla prossima notifica")
    pg.locator("#notifiche .chk", has_text="Articoli da riordinare").locator("input").uncheck(); pg.wait_for_timeout(800)
    check(gs("notifiche")["temi"]["scorte"] is False, "scorte tolte dalle notifiche")
    pg.locator("#cfg-gg").fill("2"); pg.locator("#cfgForm button[type=submit]").click(); toast(pg, "Impostazioni salvate")
    pg.wait_for_timeout(5500)
    check(gs("stato")["giorni"] == 2, "cambiano i dati dell'app: dopo pochi secondi lo script ha il riepilogo nuovo")

    # script di una versione precedente: l'app chiede di aggiornarlo
    import subprocess as sp
    vecchio = sp.run(["git", "show", "4f78915:apps-script/fatture-dalla-posta.gs"], cwd=ROOT, capture_output=True, text=True).stdout
    chiave = copiato.split("var CHIAVE = '")[1].split("'")[0]
    pg.locator("#notifiche .btn", has_text="Disattiva").click(); pg.wait_for_timeout(250)
    pg.locator(".sheet-wrap .btn", has_text="Disattiva").click(); toast(pg, "Notifiche disattivate")
    check(gs("iscrizioni") == [] and pg.evaluate("window.__unsub") == 1, "disattivate: il browser si disiscrive e lo script toglie il dispositivo")
    g("/__script", vecchio.replace("__CHIAVE__", chiave))
    pg.wait_for_timeout(300); pg.locator("#notifiche .btn", has_text="Attiva le notifiche").click()
    toast(pg, "versione precedente")
    g("/__script", copiato)
    ctx.close()

    # iPhone: solo dall'app sulla schermata Home
    IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"
    SEED2 = dict(SEED, impostazioni={**SEED["impostazioni"], "posta": {"url": SCRIPT_URL, "chiave": chiave, "casella": "fatture.bar@gmail.com"}})
    init2 = INIT.replace(json.dumps(json.dumps(SEED)), json.dumps(json.dumps(SEED2)))
    ctx, pg = newpage(br, init2, IPHONE)
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#notifiche"); pg.wait_for_timeout(400)
    check("Aggiungi alla schermata Home" in card(pg) and pg.locator("#notifiche .btn").count() == 0, "iPhone in Safari: spiega di aggiungerla alla schermata Home")
    pg.locator("#notifiche").scroll_into_view_if_needed(); shot(pg, "notifiche_iphone")
    ctx.close()
    ctx, pg = newpage(br, init2 + "Object.defineProperty(navigator, 'standalone', {get: () => true});", IPHONE)
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#notifiche"); pg.wait_for_timeout(400)
    check(pg.locator("#notifiche .btn", has_text="Attiva le notifiche").count() == 1, "iPhone dalla schermata Home: si possono attivare")
    ctx.close()

    # su claude.ai non c'è lo script: lo dice
    ctx, pg = newpage(br, MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEED)).replace("__CAN__", "true").replace("__DBNULL__", "false"))
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#notifiche")
    check("GitHub Pages" in card(pg) and pg.locator("#notifiche .btn").count() == 0, "versione su claude.ai: spiega da dove funzionano")
    ctx.close()
    br.close()
app.shutdown(); fake.terminate()

print("\nERRORI CONSOLE:" if errors else "\nNessun errore in console")
for e in errors: print("  ", e)
print(f"\n{len(fails)} controlli falliti")
sys.exit(1 if fails or errors else 0)
