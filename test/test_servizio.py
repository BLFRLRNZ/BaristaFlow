"""Abbonamento nell'app del bar: all'avvio l'app chiede al ponte (con la sua versione) lo stato dell'abbonamento e gli avvisi
di chi gestisce il servizio. In regola nessun avviso; in scadenza un promemoria; in ritardo un avviso con le date dei passi
successivi; limitato si fermano la lettura con Claude e le fatture dalla posta (e scollegare non toglie il limite);
sospeso l'app è in sola lettura, con i dati sempre esportabili e gli avvisi delle scadenze che continuano. Senza risposta
dal ponte vale l'ultima; scelte a mano di chi gestisce; bar tolto dal ponte. Il ponte vero è provato da
check_abbonamenti_gs.js: qui lo sostituisce un piccolo server con le stesse risposte."""
import functools, http.server, json, pathlib, re, socket, sys, threading, uuid
from urllib.parse import urlparse, parse_qs
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / "test" / "screenshot"; SHOTS.mkdir(exist_ok=True)
DIR = SHOTS / "servizio"; DIR.mkdir(exist_ok=True)
fails, errors = [], []
SENZA_TOAST = "#toast{display:none!important}"   # nelle foto delle pagine, senza i messaggi passeggeri
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)
T = lambda s: re.sub(r"\s+", " ", re.sub(r"[  ]", " ", s)).strip()
FOTO = DIR / "etichetta.jpg"; Image.new("RGB", (800, 600), (245, 240, 225)).save(FOTO, "JPEG")

# ---------- il ponte finto (e lo script della posta del bar) ----------
CODICE, CODICE2, CONTATTO = "BF-7KQ3-M9XT", "BF-NUOV-OC0D", "Mario Rossi, 333 1234567"
def serv(**k):
    return {"stato": "attivo", "fase": "regola", "coperto": "2026-12-31", "entro": "2027-01-01", "giorni": -38,
            "prossimo": {"fase": "ritardo", "data": "2027-01-02"}, "primo": False, "gratis": False, "manuale": False, **k}
REGOLA = serv()
SCADENZA = serv(fase="scadenza", coperto="2026-11-30", entro="2026-12-01", giorni=-7, prossimo={"fase": "ritardo", "data": "2026-12-02"})
RITARDO = serv(fase="ritardo", coperto="2026-11-20", entro="2026-11-21", giorni=3, prossimo={"fase": "limitato", "data": "2026-12-01"})
LIMITATO = serv(stato="limitato", fase="limitato", coperto="2026-11-10", entro="2026-11-11", giorni=13, prossimo={"fase": "sospeso", "data": "2026-12-12"})
SOSPESO = serv(stato="sospeso", fase="sospeso", coperto="2026-10-20", entro="2026-10-21", giorni=34, prossimo=None)
STATE = {"calls": [], "posta": [], "servizio": REGOLA, "avvisi": [], "contatto": CONTATTO, "giu": False, "codici": {CODICE}, "risposte": {}}
VUOTI = {"leggibile": True, "prodotto": "", "marca": "", "ean": "", "lotto": "", "scadenza": "", "tipoScadenza": "", "confezionamento": "",
         "quantita": 0, "unita": "", "ingredienti": "", "allergeni": [], "tracce": [], "conservazione": "", "dubbi": []}
class Ponte(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def out(self, code, body=b"", extra=()):
        self.send_response(code); self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Content-Type", "application/json")
        for k, v in extra: self.send_header(k, v)
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        u = urlparse(self.path); q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if u.path == "/posta":
            STATE["posta"].append({"get": q}); return self.out(200, json.dumps({"ok": True, "file": [], "casella": "fatture.bar@gmail.com"}).encode())
        if u.path == "/macros/s/PROVA/exec": return self.out(302, extra=[("Location", "/macros/echo?" + u.query)])   # come script.google.com
        if u.path != "/macros/echo": return self.out(404)
        if "t" in q: return self.out(200, json.dumps(STATE["risposte"].pop(q["t"], {"ok": False})).encode())
        STATE["calls"].append({"get": q})
        if STATE["giu"]: return self.out(500, b"errore")
        s = STATE["servizio"]
        r = {"ok": False, "errore": "codice"} if q.get("codice") not in STATE["codici"] else \
            {"ok": True, "bar": "Bar di prova", "tetto": 200, "usate": 3, "rimaste": 197, "versione": 3, "lettura": s["stato"] == "attivo",
             "servizio": s, "avvisi": STATE["avvisi"], "contatto": STATE["contatto"]}
        self.out(200, json.dumps(r).encode())
    def do_POST(self):
        u = urlparse(self.path); body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        if u.path == "/posta":
            STATE["posta"].append({"post": body}); return self.out(200, json.dumps({"ok": True, "versione": 5}).encode())
        if u.path != "/macros/s/PROVA/exec": return self.out(404)
        STATE["calls"].append({"post": body}); s = STATE["servizio"]
        r = {"ok": False, "errore": s["stato"]} if s["stato"] != "attivo" else {"ok": True, "dati": VUOTI, "tetto": 200, "rimaste": 196}
        t = uuid.uuid4().hex; STATE["risposte"][t] = r
        self.out(302, extra=[("Location", "/macros/echo?t=" + t)])
def serve(handler):
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
app, APORT = serve(functools.partial(Quiet, directory=str(ROOT)))
pon, PPORT = serve(Ponte)
URL = f"http://127.0.0.1:{APORT}/index.html"
PONTE, POSTA = f"http://127.0.0.1:{PPORT}/macros/s/PROVA/exec", f"http://127.0.0.1:{PPORT}/posta"

SEED = json.loads((ROOT / "test" / "dati-test.json").read_text(encoding="utf-8"))
ORA = 1795510800000   # 24/11/2026 10:00, l'ora ferma della pagina
SEED["impostazioni"] = {"generale": {"nome": "Bar di prova", "registrato": 1},
    "claude": {"url": PONTE, "codice": CODICE, "bar": "Bar di prova", "tetto": 200, "rimaste": 197, "aggiornato": ORA},
    "posta": {"url": POSTA, "chiave": "chiave-di-prova-0123456789", "casella": "fatture.bar@gmail.com", "dal": ORA - 864e5, "controllata": ORA - 3600e3, "visti": {"m1:0": ORA - 7200e3},
              "coda": [{"id": "m1:0", "nome": "fattura.xml", "data": ORA - 7200e3, "da": "ordini@molino.it", "oggetto": "Fattura 812"}], "notifiche": {"attive": True, "ora": "08:00"}}}
INIT = "if (location.protocol === 'http:' && !localStorage.getItem('barista-flow-v1')) localStorage.setItem('barista-flow-v1', %s);" % json.dumps(json.dumps(SEED))   # non su about:blank
FORN = next(k for k, f in SEED["fornitori"].items() if f["nome"] == "Molino del Borgo")
FAR = next(k for k, a in SEED["articoli"].items() if a["nome"] == "Farina 00")

def newpage(br, init, scheme="light"):
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", has_touch=True, color_scheme=scheme)
    pg = ctx.new_page(); pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00")
    pg.add_init_script(init)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") and "favicon" not in m.text and "500" not in m.text else None)
    return ctx, pg
store = lambda pg: pg.evaluate("JSON.parse(localStorage.getItem('barista-flow-v1'))")
cache = lambda pg: pg.evaluate("JSON.parse(localStorage.getItem('bf-servizio') || 'null')")
top = lambda pg: pg.locator(".sheet-wrap").last
def toast(pg): return T(pg.locator("#toast .toast").last.inner_text()) if pg.locator("#toast .toast").count() else ""
def via_toast(pg): pg.evaluate("document.querySelectorAll('#toast .toast').forEach(t => t.remove())")
def act(pg, a, **data):
    pg.evaluate("""([a, data]) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.act = a;
      for (const [k, v] of Object.entries(data)) b.dataset[k] = v; document.body.appendChild(b); b.click(); b.remove(); }""", [a, {k: str(v) for k, v in data.items()}])
    pg.wait_for_timeout(400)
def close_all(pg):
    for _ in range(10):
        if not pg.locator(".sheet-wrap").count(): break
        ok = pg.locator('.sheet-wrap [data-act=ask][data-v="1"]')
        if ok.count(): ok.last.click()
        else: pg.keyboard.press("Escape")
        pg.wait_for_timeout(250)
def aspetta(pg, cond, ms=10000):
    for _ in range(ms // 50):
        if cond(): return True
        pg.wait_for_timeout(50)
    return False
def ricarica(pg, vista="oggi"):   # una pagina nuova: l'app chiede al ponte appena l'archivio è caricato
    n = len(STATE["calls"])
    pg.goto("about:blank"); pg.goto(URL + "#" + vista); pg.wait_for_selector("#v-" + vista)
    aspetta(pg, lambda: len(STATE["calls"]) > n); pg.wait_for_timeout(500)
    return [c for c in STATE["calls"][n:] if "get" in c]
ro = lambda pg: "ro" in (pg.get_attribute("body", "class") or "").split()
stato = lambda pg: (cache(pg) or {}).get("servizio", {}).get("stato")
def nota(pg): return T(pg.locator("#v-oggi .note.serv").inner_text()) if pg.locator("#v-oggi .note.serv").count() else ""
def ricontrolla(pg, sel="#v-oggi .note.serv [data-act=serv-check]"):
    via_toast(pg); pg.locator(sel).click()
    pg.wait_for_selector("#toast .toast", timeout=10000); pg.wait_for_timeout(300)
    return toast(pg)
def acquisto(pg):
    close_all(pg); act(pg, "new-doc"); sh = top(pg)
    sh.locator("select[data-k=fornitoreId]").select_option(FORN); pg.wait_for_timeout(200)
    sh.locator('select[data-k="righe.0.articoloId"]').select_option(FAR); pg.wait_for_timeout(250)
    return sh

with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx, pg = newpage(br, INIT)

    # 1. in regola: l'app chiede, con la sua versione, e non dice niente
    gets = ricarica(pg)
    ver = pg.evaluate("document.querySelector('meta[name=\"barista-versione\"]').content")
    check(len(gets) == 1 and gets[0]["get"].get("codice") == CODICE and ver and gets[0]["get"].get("app") == ver, f"all’avvio una sola domanda al ponte, con codice e versione dell’app ({ver})")
    c = cache(pg)
    check(c and c["servizio"]["stato"] == "attivo" and c["servizio"]["coperto"] == "2026-12-31" and c["contatto"] == CONTATTO and c["t"] == ORA, "la risposta resta in questo browser")
    check(nota(pg) == "" and not pg.locator("#v-oggi .note.avviso").count(), "in regola: in Oggi nessun avviso")
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#claude")
    check("Abbonamento in regola fino al 31 dicembre. Controllato oggi alle 10:00." in T(pg.locator("#claude").inner_text()), "Impostazioni → Lettura con Claude: in regola fino al 31 dicembre")
    check(any("get" in x for x in STATE["posta"]), "in regola la posta si controlla")

    # 2. gli avvisi di chi gestisce il servizio
    STATE["avvisi"] = [{"id": "A-1", "testo": "Lunedì 1° dicembre la lettura con Claude sarà ferma dalle 14 alle 15 per manutenzione.", "importante": False},
                       {"id": "A-2", "testo": "È uscita una nuova versione di Barista Flow: chiudi e riapri l’app.", "importante": True}]
    ricarica(pg)
    av = pg.locator("#v-oggi .note.avviso")
    check(av.count() == 2 and "manutenzione" in T(av.nth(0).inner_text()) and pg.locator("#v-oggi .note.avviso.bad").count() == 1 and "nuova versione" in T(pg.locator("#v-oggi .note.avviso.bad").inner_text()),
          "in Oggi gli avvisi di chi gestisce il servizio, quello importante in rosso")
    av.nth(0).locator("[data-act=avviso-letto]").click(); pg.wait_for_timeout(300)
    check(pg.locator("#v-oggi .note.avviso").count() == 1 and "manutenzione" not in T(pg.locator("#v-oggi").inner_text()), "con la X l’avviso letto sparisce")
    ricarica(pg)
    check(pg.locator("#v-oggi .note.avviso").count() == 1, "e non torna quando l’app si riapre")
    STATE["avvisi"] = [STATE["avvisi"][1]]

    # 3. in scadenza: il promemoria
    STATE["servizio"] = SCADENZA; ricarica(pg)
    check(nota(pg) == "Abbonamento in scadenza L’abbonamento è pagato fino al 30 novembre. Per rinnovare: Mario Rossi, 333 1234567.", f"in scadenza: promemoria con la data e il contatto ({nota(pg)})")
    check(pg.locator("#v-oggi .note.serv.warn").count() == 1 and not pg.locator("#v-oggi .note.serv [data-act=serv-check]").count(), "promemoria in giallo, senza «Controlla di nuovo»")
    pg.screenshot(path=str(DIR / "01-scadenza.png"), style=SENZA_TOAST)
    for s, atteso, cosa in [
        (serv(fase="scadenza", coperto="2026-11-23", entro="2026-11-24", giorni=0), "Abbonamento in scadenza Il rinnovo va pagato oggi.", "il giorno della scadenza"),
        (serv(fase="scadenza", coperto="2026-11-30", entro="2026-12-01", giorni=-7, primo=True), "Primo canone Il primo canone va pagato entro il 1° dicembre.", "il primo canone, con «1°»"),
        (serv(fase="scadenza", coperto="2026-11-28", entro="2026-11-29", giorni=-5, gratis=True), "Prova gratuita in scadenza La prova gratuita finisce il 28 novembre.", "la prova gratuita"),
        (serv(fase="ritardo", coperto="2026-11-20", entro="2026-11-21", giorni=3, gratis=True, prossimo={"fase": "limitato", "data": "2026-12-01"}), "Prova gratuita finita La prova gratuita è finita il 20 novembre.", "la prova gratuita finita")]:
        STATE["servizio"] = s; ricarica(pg)
        check(nota(pg).startswith(atteso), f"{cosa}: «{nota(pg)[:90]}»")
    STATE["contatto"] = ""; STATE["servizio"] = SCADENZA; ricarica(pg)
    check(nota(pg).endswith("Senti chi ti ha installato Barista Flow."), "senza un contatto nelle impostazioni del ponte: «senti chi ti ha installato»")
    STATE["contatto"] = CONTATTO

    # 4. in ritardo: le date dei passi successivi; tutto funziona ancora
    STATE["servizio"] = RITARDO; np = len(STATE["posta"]); ricarica(pg)
    check(nota(pg) == "Abbonamento da rinnovare Il rinnovo andava pagato entro il 21 novembre. Dal 1° dicembre si fermano la lettura con Claude e le fatture dalla posta. Per rinnovare: Mario Rossi, 333 1234567. Controlla di nuovo",
          f"in ritardo: entro quando andava pagato e da quando si limita ({nota(pg)})")
    check(len(STATE["posta"]) > np, "in ritardo la posta si controlla ancora")
    pg.screenshot(path=str(DIR / "02-ritardo-e-avviso.png"), style=SENZA_TOAST)
    sh = acquisto(pg)
    check(sh.locator("input[data-file=etichetta]").count() > 0, "in ritardo la lettura con Claude c’è ancora")

    # 5. l'abbonamento cambia mentre l'app è aperta: la lettura risponde «limitato» e l'app si aggiorna
    STATE["servizio"] = LIMITATO; n = len(STATE["calls"])
    sh.locator("input[data-file=etichetta]").first.set_input_files([str(FOTO)])
    pg.wait_for_function("document.querySelector('.sheet-wrap:last-child .leggi .note') && !document.querySelector('.leggi [aria-busy]')", timeout=15000)
    check(T(sh.locator(".leggi .note").first.inner_text()) == "La lettura con Claude è ferma per questo bar: trovi i dettagli in Oggi.", "la lettura risponde «limitato»: spiegato nella riga")
    aspetta(pg, lambda: stato(pg) == "limitato"); pg.wait_for_timeout(300)
    check(any("get" in x for x in STATE["calls"][n:]), "e l’app chiede subito al ponte lo stato nuovo")
    close_all(pg)

    # 6. limitato: niente lettura con Claude né fatture dalla posta; il resto sì
    np = len(STATE["posta"]); ricarica(pg); pg.wait_for_timeout(1200)
    check(nota(pg) == "Abbonamento scaduto La lettura con Claude e le fatture dalla posta sono ferme. Dal 12 dicembre l’app va in sola lettura. Per rinnovare: Mario Rossi, 333 1234567. Controlla di nuovo",
          f"limitato: in rosso cosa è fermo e da quando va in sola lettura ({nota(pg)})")
    check(pg.locator("#v-oggi .note.serv.bad").count() == 1 and not ro(pg), "limitato non è sola lettura")
    check(not [x for x in STATE["posta"][np:] if "get" in x], "limitato: la posta non si controlla")
    pg.screenshot(path=str(DIR / "03-limitato.png"), style=SENZA_TOAST)
    sh = acquisto(pg)
    check(sh.locator("input[data-file=etichetta]").count() == 0 and sh.locator("[data-act=save]").count() == 1, "negli acquisti niente «Leggi l’etichetta», ma si registrano")
    close_all(pg); pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#posta")
    check("Ferma finché il servizio di Barista Flow non torna attivo" in T(pg.locator("#posta").inner_text()) and pg.locator("#posta [data-act=posta-sync]").is_disabled()
          and not pg.locator("#posta [data-act=fe-import]").count(), "Fatture dalla posta: ferma, «Controlla adesso» spento, la fattura in coda aspetta")
    check("Abbonamento scaduto" in T(pg.locator("#claude").inner_text()), "Lettura con Claude: lo stato dell’abbonamento")
    via_toast(pg); pg.locator("#claude [data-act=claude-prova]").click(); pg.wait_for_timeout(700)
    check(toast(pg) == "La lettura con Claude è ferma per questo bar: trovi i dettagli in Oggi.", f"«Prova il collegamento» non dice «a posto» ({toast(pg)})")

    # 7. scollegare la lettura non toglie il limite; ricollegandola l'app lo ridice
    pg.locator("#claude [data-act=claude-off]").click(); pg.wait_for_timeout(300); pg.locator('.sheet-wrap [data-act=ask][data-v="1"]').click(); pg.wait_for_timeout(500)
    check(not store(pg)["impostazioni"].get("claude") and stato(pg) == "limitato", "scollegata la lettura, l’abbonamento resta limitato")
    pg.goto(URL + "#oggi"); pg.wait_for_selector("#v-oggi"); pg.wait_for_timeout(200)
    check(nota(pg).startswith("Abbonamento scaduto"), "e in Oggi l’avviso resta")
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#claude"); via_toast(pg)
    pg.locator("#claude [data-act=claude-setup]").click(); pg.wait_for_timeout(300); t = top(pg)
    t.locator("[data-k=url]").fill(PONTE); t.locator("[data-k=codice]").fill(CODICE); t.locator("[data-act=save]").click(); pg.wait_for_timeout(800)
    check(toast(pg) == "Collegata, ma la lettura con Claude è ferma per questo bar: trovi i dettagli in Oggi.", f"ricollegata: dice che la lettura è ferma ({toast(pg)})")

    # 8. il bar paga, chi gestisce registra il pagamento: «Controlla di nuovo»
    pg.goto(URL + "#oggi"); pg.wait_for_selector("#v-oggi .note.serv")
    STATE["servizio"] = REGOLA
    check(ricontrolla(pg) == "Abbonamento in regola." and nota(pg) == "", "«Controlla di nuovo»: in regola, l’avviso sparisce")
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#posta")
    check(pg.locator("#posta [data-act=fe-import]").count() == 1 and not pg.locator("#posta [data-act=posta-sync]").is_disabled(), "e la posta riparte, con la fattura che aspettava")

    # 8b. un modulo aperto prima della sospensione non salva dopo
    pg.goto(URL + "#oggi"); pg.wait_for_selector("#v-oggi"); act(pg, "new-forn"); t = top(pg)
    t.locator("[data-k=nome]").fill("Caseificio Aspromonte")
    STATE["servizio"] = SOSPESO; n = len(STATE["calls"])
    pg.clock.set_fixed_time("2026-11-24T12:00:00+01:00")   # due ore dopo: l'app, tornando in primo piano, richiede
    pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    aspetta(pg, lambda: stato(pg) == "sospeso"); pg.wait_for_timeout(300); via_toast(pg)
    prima = len(store(pg)["fornitori"])
    t.locator("[data-act=save]").click(); pg.wait_for_timeout(500)
    check(stato(pg) == "sospeso" and len(STATE["calls"]) > n and ro(pg), "tornando in primo piano dopo un’ora l’app richiede: ora è sospeso")
    check(len(store(pg)["fornitori"]) == prima and toast(pg).startswith("Barista Flow è in sola lettura") and pg.locator(".sheet-wrap").count() == 1, f"il fornitore scritto prima non si salva più ({toast(pg)})")
    close_all(pg); pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00")

    # 9. sospeso: sola lettura, dati visibili ed esportabili, avvisi delle scadenze che continuano
    STATE["servizio"] = SOSPESO; ricarica(pg)
    check(ro(pg), "sospeso: l’app è in sola lettura")
    check(nota(pg) == "Barista Flow è in sola lettura L’abbonamento è scaduto. Puoi vedere ed esportare i tuoi dati, ma non registrarne di nuovi. Per rinnovare: Mario Rossi, 333 1234567. Controlla di nuovo", f"in Oggi spiegato in rosso ({nota(pg)})")
    check(pg.locator("#v-oggi .tiles").count() == 1 and T(pg.locator("#sync").inner_text()) == "Sola lettura" and "warn" in pg.get_attribute("#sync", "class"), "i dati si vedono; in alto, su ogni pagina, «Sola lettura»")
    pg.screenshot(path=str(DIR / "04-sospeso.png"), style=SENZA_TOAST)
    via_toast(pg); act(pg, "new-doc")
    check(toast(pg) == "Barista Flow è in sola lettura finché l’abbonamento è sospeso: puoi vedere ed esportare i dati." and not pg.locator(".sheet-wrap").count(), f"un pulsante per scrivere spiega perché non si può ({toast(pg)})")
    prima = len(store(pg)["fornitori"])
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#v-impostazioni")
    with pg.expect_download() as dl: pg.locator("[data-act=dl-backup]").first.click()
    d = dl.value; dati = json.loads(pathlib.Path(d.path()).read_text(encoding="utf-8"))
    check(d.suggested_filename == "Backup Barista Flow 2026-11-24.json" and len(dati["dati"]["fornitori"]) == prima, "il backup si scarica con tutti i dati")
    cl = T(pg.locator("#claude").inner_text())
    check("Barista Flow è in sola lettura" in cl and "Controllato oggi alle 10:00." in cl and pg.locator("#claude [data-act=serv-check]").count() == 1 and not pg.locator("#claude [data-act=claude-off]").count(),
          "Lettura con Claude: lo stato, «Controlla l’abbonamento» e niente «Scollega»")
    pg.locator("#claude").scroll_into_view_if_needed(); pg.screenshot(path=str(DIR / "05-sospeso-impostazioni.png"), style=SENZA_TOAST)
    pg.goto(URL + "#banco"); pg.wait_for_selector("#v-banco")
    check("L’abbonamento è sospeso: puoi guardare i prodotti, ma non registrare vendite." in T(pg.locator("#v-banco").inner_text()) and not pg.locator("#v-banco .bk-side").count(), "al Banco: si guardano i prodotti, non si vende")
    # gli avvisi delle scadenze: con lo stato da mandare cambiato (qui: tolta l'impronta dell'ultimo invio), l'app lo manda anche da sospesa
    pg.evaluate("(() => { const d = JSON.parse(localStorage.getItem('barista-flow-v1')); d.impostazioni.posta.notifiche.hash = ''; localStorage.setItem('barista-flow-v1', JSON.stringify(d)); })()")
    n = len(STATE["posta"]); ricarica(pg)
    check(ro(pg) and aspetta(pg, lambda: any(x.get("post", {}).get("op") == "stato" for x in STATE["posta"][n:]), 9000), "gli avvisi delle scadenze dei prodotti continuano a partire")

    # 10. il ponte non risponde: vale l'ultima risposta
    STATE["giu"] = True; ricarica(pg)
    check(ro(pg) and nota(pg).startswith("Barista Flow è in sola lettura"), "senza risposta dal ponte resta l’ultima: sempre in sola lettura")
    check(ricontrolla(pg) == "Il servizio non risponde: riprova tra poco.", "«Controlla di nuovo» senza risposta: spiegato")
    STATE["giu"] = False

    # 11. scelte a mano di chi gestisce il servizio
    STATE["servizio"] = serv(stato="sospeso", manuale=True, prossimo=None)
    ricontrolla(pg)
    check(nota(pg) == "Barista Flow è in sola lettura Il servizio è sospeso. Puoi vedere ed esportare i tuoi dati, ma non registrarne di nuovi. Per informazioni: Mario Rossi, 333 1234567. Controlla di nuovo", f"sospeso a mano ({nota(pg)})")
    STATE["servizio"] = serv(stato="limitato", manuale=True, prossimo=None)
    check(ricontrolla(pg) == "Servizio limitato." and not ro(pg), "da sospeso a limitato: la sola lettura si toglie")
    check(nota(pg) == "Servizio limitato La lettura con Claude e le fatture dalla posta sono ferme. Per informazioni: Mario Rossi, 333 1234567. Controlla di nuovo", f"limitato a mano ({nota(pg)})")
    STATE["servizio"] = serv(fase="ritardo", coperto="2026-11-20", entro="2026-11-21", giorni=3, manuale=True, prossimo=None)
    check(ricontrolla(pg) == "Abbonamento in regola." and nota(pg) == "", "attivo a mano anche se in ritardo: nessun avviso")

    # 12. chi gestisce cambia il codice del bar sospeso: la sospensione resta finché il bar non mette il codice nuovo
    STATE["servizio"] = SOSPESO; ricarica(pg); check(ro(pg), "di nuovo sospeso")
    STATE["codici"] = {CODICE2}
    check(ricontrolla(pg) == "Il codice del bar non è riconosciuto: controllalo in Impostazioni → Lettura con Claude." and ro(pg) and nota(pg).startswith("Barista Flow è in sola lettura"),
          "codice vecchio non più valido: la sospensione non si toglie")
    STATE["servizio"] = REGOLA
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#claude"); via_toast(pg)
    pg.locator("#claude [data-act=claude-setup]").click(); pg.wait_for_timeout(300); t = top(pg)
    t.locator("[data-k=codice]").fill(CODICE2); t.locator("[data-act=save]").click(); pg.wait_for_timeout(800)
    check(toast(pg) == "Lettura con Claude collegata: Bar di prova, 197 foto disponibili questo mese" and not ro(pg) and store(pg)["impostazioni"]["claude"]["codice"] == CODICE2,
          f"da sospeso si mette il codice nuovo: in regola, l’app torna libera ({toast(pg)})")
    # chi gestisce toglie il bar: i promemoria spariscono
    STATE["servizio"] = RITARDO; ricarica(pg); check(nota(pg).startswith("Abbonamento da rinnovare"), "in ritardo con il codice nuovo")
    STATE["codici"] = set()
    check(ricontrolla(pg).startswith("Il codice del bar non è riconosciuto") and nota(pg) == "" and cache(pg) is None and not ro(pg), "bar tolto dal ponte: via il promemoria, l’app resta libera")
    STATE["codici"] = {CODICE}; ctx.close()

    # 13. tema scuro
    ctx, pg = newpage(br, INIT, "dark")
    STATE["servizio"] = RITARDO; ricarica(pg); pg.screenshot(path=str(DIR / "06-ritardo-scuro.png"), style=SENZA_TOAST)
    STATE["servizio"] = SOSPESO; ricarica(pg); pg.screenshot(path=str(DIR / "07-sospeso-scuro.png"), style=SENZA_TOAST)
    ctx.close(); br.close()

app.shutdown(); pon.shutdown()
for e in errors: print("ERR ", e)
print(f"\n{len(fails)} controlli falliti, {len(errors)} errori nella pagina" if fails or errors else "\nAbbonamento nell'app: tutto a posto")
sys.exit(1 if fails or errors else 0)
