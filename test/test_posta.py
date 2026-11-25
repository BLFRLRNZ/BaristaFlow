"""Fatture dalla posta: collegamento allo script di Google, arrivi, importazione, errori.
Lo script vero gira nell'account Google del bar; qui lo sostituisce un piccolo server con le stesse risposte
(e lo stesso rimando a un altro indirizzo che fa Google), su un'origine diversa da quella dell'app."""
import base64, functools, http.server, json, pathlib, re, socket, sys, threading
from urllib.parse import urlparse, parse_qs
from xml.sax.saxutils import escape
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from mock import MOCK_TEMPLATE

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIR = ROOT / "test" / "screenshot" / "posta"; DIR.mkdir(parents=True, exist_ok=True)
SHOTS = ROOT / "test" / "screenshot"
fails, errors = [], []
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)
T = lambda s: s.replace(" ", " ").replace(" ", " ")

def fattura(numero, data, nome, piva, righe):
    linee = "".join(f"<DettaglioLinee><NumeroLinea>{i}</NumeroLinea><Descrizione>{escape(r['descr'])}</Descrizione>"
                    + (f"<Quantita>{r['qta']:.2f}</Quantita><UnitaMisura>{r['um']}</UnitaMisura>" if r.get("qta") else "")
                    + f"<PrezzoUnitario>{r['prezzo']:.6f}</PrezzoUnitario><PrezzoTotale>{r['totale']:.2f}</PrezzoTotale><AliquotaIVA>4.00</AliquotaIVA></DettaglioLinee>"
                    for i, r in enumerate(righe, 1))
    tot = sum(r["totale"] for r in righe)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
<FatturaElettronicaHeader><DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>{piva}</IdCodice></IdTrasmittente><ProgressivoInvio>1</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione><CodiceDestinatario>0000000</CodiceDestinatario></DatiTrasmissione>
<CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>{piva}</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>{escape(nome)}</Denominazione></Anagrafica><RegimeFiscale>RF01</RegimeFiscale></DatiAnagrafici><Sede><Indirizzo>Via Roma 3</Indirizzo><CAP>89022</CAP><Comune>Cittanova</Comune><Nazione>IT</Nazione></Sede></CedentePrestatore>
<CessionarioCommittente><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>Bar di prova</Denominazione></Anagrafica></DatiAnagrafici><Sede><Indirizzo>Via Roma 1</Indirizzo><CAP>89022</CAP><Comune>Cittanova</Comune><Nazione>IT</Nazione></Sede></CessionarioCommittente></FatturaElettronicaHeader>
<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Divisa>EUR</Divisa><Data>{data}</Data><Numero>{numero}</Numero><ImportoTotaleDocumento>{tot * 1.04:.2f}</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
<DatiBeniServizi>{linee}<DatiRiepilogo><AliquotaIVA>4.00</AliquotaIVA><ImponibileImporto>{tot:.2f}</ImponibileImporto><Imposta>{tot * .04:.2f}</Imposta></DatiRiepilogo></DatiBeniServizi></FatturaElettronicaBody>
</p:FatturaElettronica>""".encode("utf-8")

LATTE = [{"descr": "BURRO PANETTO 1KG", "qta": 6, "um": "PZ", "prezzo": 9.45, "totale": 56.70}, {"descr": "LATTE INTERO FRESCO LT 1", "qta": 12, "um": "LT", "prezzo": 1.29, "totale": 15.48}]
def pdf(path, lines):
    c = canvas.Canvas(str(path), pagesize=A4); y = 800
    for l in lines:
        if isinstance(l, tuple):
            for x, t, r in l: (c.drawRightString if r else c.drawString)(x, y, t)
        else: c.drawString(40, y, l)
        y -= 16
    c.save(); return path.read_bytes()
COLS = ((40, "Descrizione", 0), (330, "Q.tà", 1), (410, "Prezzo", 1), (500, "Importo", 1))
copia_pdf = pdf(DIR / "copia_2001.pdf", ["LATTERIA VAL VERDE S.R.L.", "P.IVA 11111111111", "FATTURA N. 2001 del 23/11/2026", "", COLS,
                ((40, "BURRO PANETTO 1KG", 0), (330, "6", 1), (410, "9,45", 1), (500, "56,70", 1)), ((40, "LATTE INTERO FRESCO LT 1", 0), (330, "12", 1), (410, "1,29", 1), (500, "15,48", 1)),
                "", ((300, "Totale imponibile", 0), (500, "72,18", 1)), ((300, "Totale documento", 0), (500, "75,07", 1))])
volantino = pdf(DIR / "volantino.pdf", ["PASTICCERIA ALL'INGROSSO", "Promozioni di Natale", "Panettoni artigianali", "Pandori classici", "Torroni morbidi", "Ordina entro il 10 dicembre"])

day = 864e5
NOW = 1795510800000   # 2026-11-24 10:00 ora italiana, come l'orologio della pagina
def ms(s): return NOW + s * 60e3   # minuti rispetto ad adesso
STATE = {"chiave": "", "mail": [
    {"id": "m1", "t": ms(-25 * 60 - 105), "da": "Servizio fatture <noreply@fatture.example>", "ogg": "Copia fattura 2001", "att": [("IT11111111111_2001.pdf", copia_pdf), ("IT11111111111_2001.xml", fattura("2001", "2026-11-23", "Latteria Val Verde S.r.l.", "11111111111", LATTE))]},
    {"id": "m2", "t": ms(-16 * 60 - 20), "da": "Servizio fatture <noreply@fatture.example>", "ogg": "Copia fattura E-77", "att": [("IT55555555555_E77.xml", fattura("E-77", "2026-11-23", "Energia Sud S.p.A.", "55555555555", [{"descr": "Fornitura energia elettrica ottobre 2026", "prezzo": 182.4, "totale": 182.4}]))]},
    {"id": "m3", "t": ms(-150), "da": "Ingrosso <promo@ingrosso.example>", "ogg": "Promozioni", "att": [("volantino.pdf", volantino)]},
    {"id": "m0", "t": NOW - 75 * day, "da": "x", "ogg": "vecchia", "att": [("vecchia.xml", fattura("1", "2026-09-10", "Latteria Val Verde S.r.l.", "11111111111", LATTE))]},
], "calls": []}

class Google(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def out(self, code, body=b"", ctype="application/json", extra=()):
        self.send_response(code); self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Content-Type", ctype)
        for k, v in extra: self.send_header(k, v)
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        u = urlparse(self.path); q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if u.path == "/macros/s/PROVA/exec": return self.out(302, extra=[("Location", "/macros/echo?" + u.query)])   # come script.google.com
        if u.path != "/macros/echo": return self.out(404)
        STATE["calls"].append(q)
        if not STATE["chiave"] or q.get("k") != STATE["chiave"]: r = {"ok": False, "errore": "chiave"}
        elif q.get("op") == "file":
            mid, i = (q.get("id", "") + ":").split(":")[:2]
            m = next((m for m in STATE["mail"] if m["id"] == mid), None)
            a = m["att"][int(i)] if m and i.isdigit() and int(i) < len(m["att"]) else None
            r = {"ok": True, "nome": a[0], "b64": base64.b64encode(a[1]).decode()} if a else {"ok": False, "errore": "allegato non trovato"}
        else:
            da = max(float(q.get("dal", 0) or 0) - day, NOW - 60 * day)
            files = [{"id": f"{m['id']}:{i}", "nome": n, "data": m["t"], "da": m["da"], "oggetto": m["ogg"], "byte": len(b)} for m in STATE["mail"] if m["t"] >= da for i, (n, b) in enumerate(m["att"])]
            r = {"ok": True, "casella": "fatture.bar@gmail.com", "adesso": NOW, "file": sorted(files, key=lambda f: f["data"])}
        self.out(200, json.dumps(r).encode())

def serve(handler):
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
app, APORT = serve(functools.partial(Quiet, directory=str(ROOT)))
goo, GPORT = serve(Google)
URL = f"http://127.0.0.1:{APORT}/index.html"
SCRIPT_URL = f"http://127.0.0.1:{GPORT}/macros/s/PROVA/exec"

SEED = json.loads((ROOT / "test" / "dati-test.json").read_text(encoding="utf-8"))
SEED["impostazioni"] = {"generale": {"nome": "Bar di prova", "registrato": 1}}
INIT = "if (!localStorage.getItem('barista-flow-v1')) localStorage.setItem('barista-flow-v1', %s);" % json.dumps(json.dumps(SEED))

def newpage(br, init):
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", has_touch=True)
    ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=f"http://127.0.0.1:{APORT}")
    pg = ctx.new_page(); pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00")
    pg.add_init_script(init)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    return ctx, pg
posta = lambda pg: pg.evaluate("JSON.parse(localStorage.getItem('barista-flow-v1')).impostazioni.posta || null")
docs = lambda pg, js: pg.evaluate(f"Object.values(JSON.parse(localStorage.getItem('barista-flow-v1')).documenti).filter(d => {js})")
top = lambda pg: pg.locator(".sheet-wrap").last
def toast(pg, text, timeout=15000):
    pg.wait_for_function("t => [...document.querySelectorAll('#toast .toast')].some(x => x.textContent.includes(t))", arg=text, timeout=timeout)
def statuses(pg):
    return {T(r.locator("b").inner_text()): (T(r.locator(".chip").inner_text()), T(r.locator(".m > span").first.inner_text())) for r in pg.locator(".sheet-wrap").first.locator(".list .row").all()}
def shot(pg, name): pg.wait_for_timeout(350); pg.screenshot(path=str(SHOTS / f"{name}.png"))

with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx, pg = newpage(br, INIT)
    pg.goto(URL); pg.wait_for_selector("#v-oggi"); pg.wait_for_timeout(400)
    check("dalla posta" not in pg.locator("#v-oggi").inner_text(), "senza collegamento nessun avviso della posta")

    # collegamento
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#posta")
    pg.locator("#posta .btn", has_text="Collega la posta").click(); pg.wait_for_timeout(350)
    t = top(pg)
    gs = t.locator(".posta-gs pre").text_content()
    key = re.search(r"var CHIAVE = '([^']+)';", gs)
    check(key and len(key.group(1)) == 24 and "__CHIAVE__" not in gs, "lo script da copiare contiene già la chiave del collegamento")
    key = key.group(1)
    t.locator("[data-act=posta-copia]").click(); toast(pg, "Script copiato")
    check(pg.evaluate("navigator.clipboard.readText()") == gs, "«Copia lo script» lo mette negli appunti, uguale a quello mostrato")
    shot(pg, "posta_collega")
    t.locator("[data-k=url]").fill("indirizzo a caso"); t.locator("[data-act=save]").click(); pg.wait_for_timeout(250)
    check("Incolla l’URL" in t.locator("#ferr").inner_text(), "URL non valido: spiegato")
    t.locator("[data-k=url]").fill(SCRIPT_URL); t.locator("[data-act=save]").click(); pg.wait_for_timeout(700)
    check("La chiave non corrisponde" in t.locator("#ferr").inner_text(), f"script con un'altra chiave: {t.locator('#ferr').inner_text()!r}")
    t.locator("[data-act=close]").first.click(); pg.wait_for_timeout(150)
    if pg.locator(".sheet-wrap").count(): pg.locator(".sheet-wrap .btn", has_text="Chiudi senza salvare").click(); pg.wait_for_timeout(200)
    pg.locator("#posta .btn", has_text="Collega la posta").click(); pg.wait_for_timeout(350)
    t = top(pg)
    check(key in t.locator(".posta-gs pre").text_content(), "riaprendo, la chiave resta la stessa dello script già copiato")
    STATE["chiave"] = key
    t.locator("[data-k=url]").fill(SCRIPT_URL); t.locator("[data-act=save]").click()
    toast(pg, "Posta collegata: fatture.bar@gmail.com")
    toast(pg, "Sono arrivate 3 fatture dalla posta")
    ps = posta(pg)
    check(ps and [x["id"] for x in ps["coda"]] == ["m1:0", "m1:1", "m2:0", "m3:0"] and ps["dal"] == STATE["mail"][2]["t"], f"in coda gli allegati delle ultime settimane, non quelli vecchi: {ps and [x['nome'] for x in ps['coda']]}")
    pg.wait_for_timeout(300)
    card = T(pg.locator("#posta").inner_text())
    check("Collegata a fatture.bar@gmail.com" in card and "oggi alle 10:00" in card and "3 fatture da importare" in card, "Impostazioni: casella, ultimo controllo e fatture da importare")
    shot(pg, "posta_impostazioni")

    # avviso in Oggi e importazione
    pg.goto(URL + "#oggi"); pg.wait_for_selector("#v-oggi"); pg.wait_for_timeout(300)
    row = pg.locator("#v-oggi .row", has_text="dalla posta")
    check(row.count() == 1 and "3 fatture arrivate dalla posta" in T(row.inner_text()), "Oggi: «3 fatture arrivate dalla posta» fra le cose da fare")
    shot(pg, "posta_oggi")
    row.click()
    pg.wait_for_function("document.querySelectorAll('.sheet-wrap .list .row').length >= 3 && !document.querySelector('.sheet-wrap .sh-body').textContent.includes('Scarico')", timeout=30000); pg.wait_for_timeout(300)
    s = statuses(pg)
    print("   ", s)
    f2001 = s.get("Fattura n. 2001 del 23/11/2026")
    check(f2001 and not f2001[1].startswith("PDF") and f2001[0].startswith("Da controllare"), f"stessa fattura in PDF e XML: una sola voce, letta dall'XML {f2001}")
    check(s.get("Fattura n. E-77 del 23/11/2026", ("",))[0] == "Fornitore nuovo", "bolletta della luce: fornitore nuovo")
    check(s.get("volantino.pdf", ("",))[0].startswith("Righe non riconosciute"), "un PDF che non è una fattura: segnalato")
    check("Posta collegata (fatture.bar@gmail.com): controllata oggi alle 10:00" in T(top(pg).locator(".posta-bar").inner_text()), "in cima all'elenco: posta collegata e ultimo controllo")
    check([x["id"] for x in posta(pg)["coda"]] == ["m1:0", "m2:0"], f"volantino e doppione XML escono dalla coda: {[x['id'] for x in posta(pg)['coda']]}")
    shot(pg, "posta_elenco")

    pg.locator(".sheet .row", has_text="Fattura n. E-77").click(); pg.wait_for_timeout(400)
    t = top(pg)
    check(t.locator(".sh-foot .btn", has_text="Non importare").count() == 1, "una fattura arrivata per posta si può non importare")
    t.locator(".sh-foot .btn", has_text="Non importare").click(); toast(pg, "Non importata")
    check(statuses(pg).get("Fattura n. E-77 del 23/11/2026", ("",))[0] == "Non importata" and [x["id"] for x in posta(pg)["coda"]] == ["m1:0"], "bolletta scartata: esce dalla coda")

    pg.locator(".sheet .row", has_text="Fattura n. 2001").click(); pg.wait_for_timeout(400)
    t = top(pg)
    for i, a in enumerate(["a-burro", "a-latte"]):
        sel = t.locator(f'[data-k="righe.{i}.a"]')
        if sel.input_value() != a: sel.select_option(a); pg.wait_for_timeout(150)
    t.locator('[data-k="righe.0.fat"]').fill("1"); t.locator('[data-k="righe.1.fat"]').fill("1")
    t.locator(".sh-foot .btn", has_text="Importa fattura").click(); pg.wait_for_timeout(800)
    d = docs(pg, "d.numero === '2001'")
    check(len(d) == 1 and sorted((r["articoloId"], r["qta"], r["importo"]) for r in d[0]["righe"]) == [("a-burro", 6, 56.7), ("a-latte", 12, 15.48)], "fattura importata dall'XML arrivato per posta")
    check(posta(pg)["coda"] == [] and statuses(pg).get("Fattura n. 2001 del 23/11/2026", ("",))[0] == "Importata", "importata: la coda è vuota")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check("dalla posta" not in pg.locator("#v-oggi").inner_text(), "in Oggi l'avviso sparisce")

    # nuovi controlli: niente doppioni, poi una fattura nuova
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#posta")
    pg.locator("#posta .btn", has_text="Controlla adesso").click(); toast(pg, "Nessuna fattura nuova nella posta")
    check(posta(pg)["coda"] == [], "le mail già viste non tornano in coda")
    STATE["mail"].append({"id": "m4", "t": ms(-20), "da": "Servizio fatture <noreply@fatture.example>", "ogg": "Copia fattura 2002", "att": [("IT11111111111_2002.xml", fattura("2002", "2026-11-24", "Latteria Val Verde S.r.l.", "11111111111", LATTE))]})
    pg.locator("#posta .btn", has_text="Controlla adesso").click(); toast(pg, "È arrivata una fattura dalla posta")
    pg.goto(URL + "#acquisti"); pg.wait_for_selector("#v-acquisti")
    b = pg.locator("main .btn", has_text="Importa fatture")
    check("1 dalla posta" in T(b.inner_text()), f"Acquisti: il pulsante segnala la fattura arrivata ({T(b.inner_text())!r})")
    shot(pg, "posta_acquisti")
    b.click()
    pg.wait_for_function("[...document.querySelectorAll('.sheet-wrap .list .row b')].some(b => b.textContent.includes('2002'))", timeout=30000); pg.wait_for_timeout(300)
    check(statuses(pg).get("Fattura n. 2002 del 24/11/2026", ("",))[0] == "Pronta", "stesso fornitore e stessi articoli: la seconda è già pronta")
    pg.locator(".sh-foot .btn", has_text="Importa la fattura pronta").click(); pg.wait_for_timeout(800)
    check(len(docs(pg, "d.numero === '2002'")) == 1 and posta(pg)["coda"] == [], "importata con un tocco, coda vuota")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(250)

    # errori: chiave cambiata, poi di nuovo a posto al riavvio dell'app
    STATE["chiave"] = "un'altra chiave qualsiasi"
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#posta"); pg.wait_for_timeout(400)
    pg.locator("#posta .btn", has_text="Controlla adesso").click(); toast(pg, "La chiave non corrisponde")
    pg.wait_for_timeout(300)
    check("La chiave non corrisponde" in pg.locator("#posta .note.warn").inner_text(), "l'errore resta visibile in Impostazioni")
    STATE["chiave"] = key
    n0 = len(STATE["calls"])
    pg.reload(); pg.wait_for_selector("#posta"); pg.wait_for_function(f"document.querySelector('#posta') && !document.querySelector('#posta .note.warn')", timeout=15000)
    check(len(STATE["calls"]) > n0, "all'avvio dell'app la posta si controlla da sola")

    pg.locator("#posta .btn", has_text="Scollega").click(); pg.wait_for_timeout(250)
    pg.locator(".sheet-wrap .btn", has_text="Scollega").click(); toast(pg, "Posta scollegata")
    pg.wait_for_timeout(300)
    check(posta(pg) is None and pg.locator("#posta .btn", has_text="Collega la posta").count() == 1, "scollegata: si può ricollegare")
    ctx.close()

    # su claude.ai la pagina non può chiamare Google: lo spiega
    ctx, pg = newpage(br, MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEED)).replace("__CAN__", "true").replace("__DBNULL__", "false"))
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#posta")
    check("GitHub Pages" in pg.locator("#posta").inner_text() and pg.locator("#posta .btn").count() == 0, "versione su claude.ai: spiega dove si collega")
    ctx.close()
    br.close()
app.shutdown(); goo.shutdown()

print("\nERRORI CONSOLE:" if errors else "\nNessun errore in console")
for e in errors: print("  ", e)
print(f"\n{len(fails)} controlli falliti")
sys.exit(1 if fails or errors else 0)
