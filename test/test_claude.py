"""Lettura con Claude: Impostazioni (indirizzo e codice del bar), il pulsante «Leggi l'etichetta» nelle righe degli acquisti
e delle fatture importate, la foto rimpicciolita in JPEG, lotto e scadenza compilati con la nota da controllare, dubbi,
etichetta di un altro prodotto, foto illeggibile, tetto del mese, scollegamento e pagina su claude.ai (senza lettura).
Il ponte vero è uno script di Google (apps-script/claude-ponte.gs, provato da check_claude_gs.js); qui lo sostituisce
un piccolo server con le stesse risposte e lo stesso rinvio di script.google.com, da un indirizzo diverso da quello dell'app."""
import base64, functools, http.server, io, json, pathlib, re, socket, sys, threading, time, uuid
from urllib.parse import urlparse, parse_qs
from xml.sax.saxutils import escape
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from mock import MOCK_TEMPLATE

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / "test" / "screenshot"; SHOTS.mkdir(exist_ok=True)
DIR = SHOTS / "claude"; DIR.mkdir(exist_ok=True)
fails, errors = [], []
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)
T = lambda s: re.sub(r"[  ]", " ", s)
src = (ROOT / "test" / "test_fatture.py").read_text()
exec(src[src.index("def fattura("):src.index("def tlv(")])   # la fattura XML di test_fatture.py

# ---------- foto di prova ----------
def foto(nome, w, h, fmt):
    im = Image.new("RGB", (w, h), (245, 240, 225)); d = ImageDraw.Draw(im)
    d.rectangle([w // 10, h // 10, w * 9 // 10, h * 9 // 10], outline=(40, 40, 40), width=max(2, w // 200))
    d.text((w // 5, h // 3), "FARINA 00  LOTTO MR-2611A  TMC 31/05/2027", fill=(0, 0, 0))
    p = DIR / nome; im.save(p, fmt); return p
GRANDE, PNG = foto("grande.jpg", 4000, 3000, "JPEG"), foto("etichetta.png", 1200, 900, "PNG")
TESTO = DIR / "nota.txt"; TESTO.write_text("non è una foto")

# ---------- il ponte finto ----------
VUOTI = {"leggibile": True, "prodotto": "", "marca": "", "ean": "", "lotto": "", "scadenza": "", "tipoScadenza": "", "confezionamento": "",
         "quantita": 0, "unita": "", "ingredienti": "", "allergeni": [], "tracce": [], "conservazione": "", "dubbi": []}
STATE = {"calls": [], "next": None, "delay": 0, "risposte": {}}
def lettura(rimaste=199, **dati): return {"ok": True, "dati": {**VUOTI, **dati}, "tetto": 200, "rimaste": rimaste}
FARINA = dict(prodotto="Farina di grano tenero tipo 00", marca="Molino del Borgo", lotto="MR-2611A", scadenza="2027-05-31", tipoScadenza="preferibilmente", quantita=25, unita="kg")
class Ponte(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def out(self, code, body=b"", ctype="application/json", extra=()):
        self.send_response(code); self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Content-Type", ctype)
        for k, v in extra: self.send_header(k, v)
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        u = urlparse(self.path); q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if u.path == "/macros/s/PROVA/exec": return self.out(302, extra=[("Location", "/macros/echo?" + u.query)])   # come script.google.com
        if u.path != "/macros/echo": return self.out(404)
        if "t" in q: r = STATE["risposte"].pop(q["t"], {"ok": False})
        else:
            STATE["calls"].append({"get": q}); c = q.get("codice", "")
            r = {"ok": True, "bar": "Bar di prova", "tetto": 200, "usate": 0, "rimaste": 200, "versione": 1} if c == "BF-7KQ3-M9XT" else {"ok": False, "errore": "sospeso" if c == "BF-AAAA-BBBB" else "codice"}
        self.out(200, json.dumps(r).encode())
    def do_POST(self):
        if urlparse(self.path).path != "/macros/s/PROVA/exec": return self.out(404)
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        STATE["calls"].append({"post": body, "ctype": self.headers.get("Content-Type", "")})
        if STATE["delay"]: time.sleep(STATE["delay"])
        t = uuid.uuid4().hex; STATE["risposte"][t] = STATE["next"]
        self.out(302, extra=[("Location", "/macros/echo?t=" + t)])   # come lo script vero: la risposta si legge al rinvio
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
PONTE = f"http://127.0.0.1:{PPORT}/macros/s/PROVA/exec"

SEED = json.loads((ROOT / "test" / "dati-test.json").read_text(encoding="utf-8"))
SEED["impostazioni"] = {"generale": {"nome": "Bar di prova", "registrato": 1}}
INIT = "if (!localStorage.getItem('barista-flow-v1')) localStorage.setItem('barista-flow-v1', %s);" % json.dumps(json.dumps(SEED))
FORN = next(k for k, f in SEED["fornitori"].items() if f["nome"] == "Molino del Borgo")
FAR = next(k for k, a in SEED["articoli"].items() if a["nome"] == "Farina 00")

def newpage(br, init, w=390, h=844):
    ctx = br.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", has_touch=w < 900)
    pg = ctx.new_page(); pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00")
    pg.add_init_script(init)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") and "favicon" not in m.text else None)
    return ctx, pg
store = lambda pg: pg.evaluate("JSON.parse(localStorage.getItem('barista-flow-v1'))")
top = lambda pg: pg.locator(".sheet-wrap").last
def toast(pg): return T(pg.locator("#toast .toast").last.inner_text())
def act(pg, a, **data):
    pg.evaluate("""([a, data]) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.act = a;
      for (const [k, v] of Object.entries(data)) b.dataset[k] = v; document.body.appendChild(b); b.click(); b.remove(); }""", [a, {k: str(v) for k, v in data.items()}])
    pg.wait_for_timeout(400)
def close_all(pg):   # chiude i fogli; ai moduli modificati risponde «esci senza salvare»
    for _ in range(10):
        if not pg.locator(".sheet-wrap").count(): break
        ok = pg.locator('.sheet-wrap [data-act=ask][data-v="1"]')
        if ok.count(): ok.last.click()
        else: pg.keyboard.press("Escape")
        pg.wait_for_timeout(250)
def acquisto(pg):   # «Registra acquisto» con il Molino e la farina nella prima riga
    close_all(pg); act(pg, "new-doc"); sh = top(pg)
    sh.locator("select[data-k=fornitoreId]").select_option(FORN); pg.wait_for_timeout(200)
    sh.locator('select[data-k="righe.0.articoloId"]').select_option(FAR); pg.wait_for_timeout(250)
    return sh
def leggi(pg, sh, files, risposta, attesa=True):
    n = len(STATE["calls"]); STATE["next"] = risposta
    sh.locator("input[data-file=etichetta]").first.set_input_files([str(f) for f in files])
    if attesa: pg.wait_for_function(f"document.querySelector('.sheet-wrap:last-child .leggi .note') && !document.querySelector('.leggi [aria-busy]')", timeout=15000)
    pg.wait_for_timeout(150)
    return [c for c in STATE["calls"][n:] if "post" in c]
def nota(sh): return T(sh.locator(".leggi .note").first.inner_text()) if sh.locator(".leggi .note").count() else ""
def img(b64):
    im = Image.open(io.BytesIO(base64.b64decode(b64))); return im.format, im.size

with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx, pg = newpage(br, INIT)
    pg.goto(URL); pg.wait_for_selector("#v-oggi"); pg.wait_for_timeout(300)

    # 1. Impostazioni: collegare la lettura
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#claude")
    check("Collega la lettura" in T(pg.locator("#claude").inner_text()), "Impostazioni: «Lettura con Claude» da collegare")
    sh = acquisto(pg)
    check(sh.locator("input[data-file=etichetta]").count() == 0, "senza collegamento, nelle righe nessun «Leggi l’etichetta»")
    close_all(pg); pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#claude")
    pg.locator("#claude [data-act=claude-setup]").click(); pg.wait_for_timeout(300); t = top(pg)
    t.locator("[data-k=url]").fill("ftp://ponte"); t.locator("[data-act=save]").click(); pg.wait_for_timeout(200)
    check("Scrivi l’indirizzo del servizio" in t.locator("#ferr").inner_text(), "indirizzo non valido: spiegato")
    t.locator("[data-k=url]").fill(PONTE); t.locator("[data-k=codice]").fill("ab"); t.locator("[data-act=save]").click(); pg.wait_for_timeout(200)
    check("Scrivi il codice del bar" in t.locator("#ferr").inner_text(), "codice troppo corto: spiegato")
    t.locator("[data-k=codice]").fill("BF-ZZZZ-ZZZZ"); t.locator("[data-act=save]").click(); pg.wait_for_timeout(600)
    check("non è riconosciuto" in T(t.locator("#ferr").inner_text()) and STATE["calls"][-1]["get"]["codice"] == "BF-ZZZZ-ZZZZ", "codice sconosciuto: il ponte lo dice")
    t.locator("[data-k=codice]").fill("BF-AAAA-BBBB"); t.locator("[data-act=save]").click(); pg.wait_for_timeout(600)
    check("sospesa" in T(t.locator("#ferr").inner_text()), "bar sospeso: spiegato")
    t.locator("[data-k=codice]").fill(" bf-7kq3-m9xt "); t.locator("[data-act=save]").click(); pg.wait_for_timeout(700)
    check(toast(pg) == "Lettura con Claude collegata: Bar di prova, 200 foto disponibili questo mese", f"collegata: {toast(pg)}")
    c = store(pg)["impostazioni"].get("claude", {})
    check(c.get("url") == PONTE and c.get("codice") == "BF-7KQ3-M9XT" and c.get("bar") == "Bar di prova" and c.get("rimaste") == 200, f"salvati indirizzo e codice in maiuscolo: {c}")
    check("Collegata come Bar di prova. Foto disponibili questo mese: 200 su 200" in T(pg.locator("#claude").inner_text()), "la scheda dice bar e foto disponibili")
    pg.locator("#claude [data-act=claude-prova]").click(); pg.wait_for_timeout(600)
    check(toast(pg) == "Collegamento a posto (Bar di prova): 200 foto disponibili questo mese.", f"prova del collegamento: {toast(pg)}")

    # 2. una riga d'acquisto: foto grande, rimpicciolita, lotto e scadenza compilati
    sh = acquisto(pg)
    check(T(sh.locator(".leggi label.btn").inner_text()) == "Leggi l’etichetta", "sotto lotto e scadenza c’è «Leggi l’etichetta»")
    STATE["delay"] = 1.2
    calls = leggi(pg, sh, [GRANDE], lettura(**FARINA), attesa=False)
    pg.wait_for_selector(".leggi [aria-busy=true]", timeout=3000)
    check("Sto leggendo l’etichetta…" in T(sh.locator(".leggi").inner_text()), "mentre legge lo dice, e il pulsante non si tocca")
    pg.wait_for_function("document.querySelector('.leggi .note') && !document.querySelector('.leggi [aria-busy]')", timeout=15000); STATE["delay"] = 0
    req = [c for c in STATE["calls"] if "post" in c][-1]; b = req["post"]
    check(b["codice"] == "BF-7KQ3-M9XT" and b["cosa"] == "lotto" and b["articolo"] == "Farina 00" and b["fornitore"] == "Molino del Borgo" and len(b["foto"]) == 1, f"al ponte: codice, articolo e fornitore ({ {k: v for k, v in b.items() if k != 'foto'} })")
    check(req["ctype"].startswith("text/plain"), f"richiesta semplice, senza controlli preliminari: {req['ctype']}")
    fmt, size = img(b["foto"][0]["dati"])
    check(b["foto"][0]["tipo"] == "image/jpeg" and fmt == "JPEG" and size == (2000, 1500), f"foto da 4000×3000 mandata in JPEG {size[0]}×{size[1]}")
    check(sh.locator('[data-k="righe.0.lotto"]').input_value() == "MR-2611A" and sh.locator('[data-k="righe.0.scadenza"]').input_value() == "2027-05-31", "lotto e scadenza compilati nella riga")
    check(nota(sh) == "Dall’etichetta: lotto MR-2611A, scadenza 31/05/2027 (preferibilmente entro). Controlla prima di salvare." and not sh.locator(".leggi .note.warn").count(), f"nota: {nota(sh)}")
    check(T(sh.locator(".leggi label.btn").inner_text()) == "Leggi un’altra foto", "si può rileggere con un’altra foto")
    check(store(pg)["impostazioni"]["claude"].get("rimaste") == 199, "le foto rimaste si aggiornano")
    card = sh.locator(".card:has(.leggi)").first; card.scroll_into_view_if_needed(); pg.wait_for_timeout(250); card.screenshot(path=str(SHOTS / "claude_riga.png"))
    sh.locator("[data-k=numero]").fill("77"); sh.locator('[data-k="righe.0.qta"]').fill("25")
    sh.locator("[data-act=save]").click(); pg.wait_for_timeout(700)
    d = [d for d in store(pg)["documenti"].values() if d.get("numero") == "77"]
    check(len(d) == 1 and d[0]["righe"][0]["lotto"] == "MR-2611A" and d[0]["righe"][0]["scadenza"] == "2027-05-31", "salvato: la riga ha lotto e scadenza letti")

    # 3. etichette che non tornano
    sh = acquisto(pg)
    leggi(pg, sh, [GRANDE], lettura(prodotto="Zucchero semolato", marca="Dolciaria", lotto="Z-1", scadenza="2027-09-30"))
    check("sembra di «Zucchero semolato», non di «Farina 00»" in nota(sh) and sh.locator(".leggi .note.warn").count() == 1, f"etichetta di un altro prodotto: {nota(sh)}")
    leggi(pg, sh, [GRANDE], lettura(**{**FARINA, "dubbi": ["lotto"]}))
    check("Lotto letto con qualche dubbio" in nota(sh) and sh.locator(".leggi .note.warn").count() == 1, f"lotto incerto: {nota(sh)}")
    close_all(pg)
    sh = acquisto(pg)
    leggi(pg, sh, [GRANDE], lettura(leggibile=False))
    check("non riesco a leggere un’etichetta" in nota(sh) and sh.locator('[data-k="righe.0.lotto"]').input_value() == "", f"foto illeggibile: {nota(sh)}")
    leggi(pg, sh, [GRANDE], lettura(prodotto="Farina 00"))
    check("Non ho trovato né lotto né scadenza" in nota(sh), f"etichetta senza timbro: {nota(sh)}")
    leggi(pg, sh, [GRANDE], lettura(rimaste=7, **FARINA))
    check(nota(sh).endswith("Restano 7 foto questo mese."), f"poche foto rimaste: {nota(sh)}")
    n = len(STATE["calls"])
    sh.locator("input[data-file=etichetta]").first.set_input_files([str(TESTO)]); pg.wait_for_timeout(400)
    check(toast(pg) == "Scegli una foto dell’etichetta." and len(STATE["calls"]) == n, "un file che non è una foto: niente lettura")
    calls = leggi(pg, sh, [GRANDE, PNG], lettura(**FARINA))
    fs = calls[-1]["post"]["foto"]
    check(len(fs) == 2 and all(f["tipo"] == "image/jpeg" and img(f["dati"])[0] == "JPEG" for f in fs) and img(fs[1]["dati"])[1] == (1200, 900), "due foto (fronte e timbro): anche la PNG arriva in JPEG, quella piccola resta com’è")
    leggi(pg, sh, [GRANDE], {"ok": False, "errore": "tetto", "tetto": 200, "rimaste": 0})
    check(nota(sh).startswith("Le foto di questo mese sono finite (200)") and store(pg)["impostazioni"]["claude"].get("rimaste") == 0, f"tetto del mese: {nota(sh)}")
    leggi(pg, sh, [GRANDE], {"ok": False, "errore": "occupato"})
    check(nota(sh) == "Claude è molto occupato: riprova tra un minuto.", f"Claude occupato: {nota(sh)}")
    close_all(pg)

    # 4. nella fattura importata dall'XML, sulle righe con lotto e scadenza
    (DIR / "IT55555555555_00901.xml").write_bytes(fattura("901", "2026-11-24", "Molino del Borgo S.r.l.", "55555555555",
        [{"codice": "F00S25", "descr": "FARINA 00 SACCO 25KG", "qta": 2, "um": "SC", "prezzo": 22.00, "totale": 44.00}]))
    pg.goto(URL + "#acquisti"); pg.wait_for_selector("#v-acquisti")
    pg.locator("main .btn", has_text="Importa fatture").click(); pg.wait_for_timeout(300)
    pg.set_input_files(".sheet input[data-file=fe]", [str(DIR / "IT55555555555_00901.xml")])
    pg.wait_for_selector(".sheet .list .row"); pg.wait_for_timeout(300)
    pg.locator(".sheet .row", has_text="Fattura n. 901").click(); pg.wait_for_timeout(400); t = top(pg)
    check(t.locator("#fe-l-0 input[data-file=etichetta]").count() == 1, "nella riga della fattura c’è «Leggi l’etichetta»")
    calls = leggi(pg, t, [GRANDE], lettura(**FARINA))
    check(calls[-1]["post"]["articolo"] == "Farina 00" and calls[-1]["post"]["fornitore"] == "Molino del Borgo", "anche qui al ponte articolo e fornitore della riga")
    check(t.locator('[data-k="righe.0.lotto"]').input_value() == "MR-2611A" and t.locator('[data-k="righe.0.scad"]').input_value() == "2027-05-31", "lotto e scadenza nella riga della fattura")
    t.locator(".btn.pri", has_text="Importa fattura").click(); pg.wait_for_timeout(800)
    d = [d for d in store(pg)["documenti"].values() if d.get("numero") == "901"]
    check(len(d) == 1 and d[0]["righe"][0]["lotto"] == "MR-2611A" and d[0]["righe"][0]["scadenza"] == "2027-05-31" and d[0]["righe"][0]["qta"] == 50, "fattura importata con lotto e scadenza letti")
    close_all(pg)

    # 5. scollegare
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#claude")
    pg.locator("#claude .btn", has_text="Scollega").click(); pg.wait_for_timeout(250)
    pg.locator(".sheet-wrap .btn", has_text="Scollega").click(); pg.wait_for_timeout(500)
    check(toast(pg) == "Lettura con Claude scollegata." and "claude" not in store(pg)["impostazioni"], "scollegata")
    sh = acquisto(pg)
    check(sh.locator("input[data-file=etichetta]").count() == 0, "scollegata: il pulsante sparisce")
    close_all(pg); ctx.close()

    # 6. su claude.ai la pagina non può chiamare siti esterni: niente lettura, e la scheda lo spiega
    mock = MOCK_TEMPLATE.replace("__SEEDS__", json.dumps({**SEED, "impostazioni": {"generale": {"nome": "Bar di prova", "registrato": 1}, "claude": {"url": PONTE, "codice": "BF-7KQ3-M9XT"}}})).replace("__CAN__", "true").replace("__DBNULL__", "false")
    ctx, pg = newpage(br, mock)
    pg.goto((ROOT / "index.html").as_uri() + "#impostazioni"); pg.wait_for_selector("#claude")
    check("Si collega dall’app pubblicata sul tuo sito" in T(pg.locator("#claude").inner_text()), "su claude.ai la scheda spiega dove si collega")
    sh = acquisto(pg)
    check(sh.locator("input[data-file=etichetta]").count() == 0, "su claude.ai nessun pulsante nelle righe")
    close_all(pg); ctx.close()
    br.close()

print("\nERRORI CONSOLE:" if errors else "\nNessun errore in console")
for e in errors: print("  ", e)
print(f"\n{len(fails)} controlli falliti")
sys.exit(1 if fails or errors else 0)
