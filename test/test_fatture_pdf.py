"""Lettura dei PDF delle fatture: foglio di stile dell'Agenzia, gestionale del fornitore, righe senza colonne, differita sui DDT, casi da scartare."""
import functools, http.server, io, pathlib, socket, sys, threading
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from mock import MOCK_TEMPLATE

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / "test" / "screenshot"; SHOTS.mkdir(exist_ok=True)
DIR = SHOTS / "fatture_pdf"; DIR.mkdir(exist_ok=True)
fails, errors = [], []
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)
T = lambda s: s.replace(" ", " ").replace(" ", " ")
COUNT = "Object.values(window.__store).reduce((s, c) => s + Object.keys(c).length, 0)"
W, H = A4
it = lambda v: f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def agenzia(path, numero, data, righe, tipo="TD01 fattura", ddt=None, forn=("Latteria Val Verde S.r.l.", "11111111111")):
    """Impaginazione del foglio di stile dell'Agenzia delle Entrate, usata da molti programmi."""
    c = canvas.Canvas(str(path), pagesize=A4); y = H - 50
    c.setFont("Helvetica-Bold", 9); c.drawString(40, y, "Cedente/prestatore (fornitore)"); c.drawString(310, y, "Cessionario/committente (cliente)")
    c.setFont("Helvetica", 8.5)
    left = [f"Identificativo fiscale ai fini IVA: IT{forn[1]}", f"Codice fiscale: {forn[1]}", f"Denominazione: {forn[0]}", "Regime fiscale: RF01 (ordinario)", "Indirizzo: Via dei Mulini 4", "Comune: Cittanova Provincia: RC", "Cap: 89022 Nazione: IT"]
    right = ["Identificativo fiscale ai fini IVA: IT01234567890", "Codice fiscale: 01234567890", "Denominazione: Bar di prova", "Indirizzo: Via Roma 1", "Comune: Cittanova Provincia: RC", "Cap: 89022 Nazione: IT", ""]
    for a, b in zip(left, right):
        y -= 12; c.drawString(40, y, a); c.drawString(310, y, b)
    y -= 30; c.setFont("Helvetica-Bold", 8)
    for x, t in [(40, "Tipologia documento"), (150, "Art. 73"), (210, "Numero documento"), (310, "Data documento"), (410, "Codice destinatario")]: c.drawString(x, y, t)
    y -= 12; c.setFont("Helvetica", 8.5)
    for x, t in [(40, tipo), (210, numero), (310, data), (410, "0000000")]: c.drawString(x, y, t)
    y -= 30; c.setFont("Helvetica-Bold", 8)
    cols = [(40, "Cod. articolo", "l"), (100, "Descrizione", "l"), (330, "Quantità", "r"), (395, "Prezzo unitario", "r"), (405, "UM", "l"), (470, "Sconto o magg.", "r"), (500, "%IVA", "r"), (560, "Prezzo totale", "r")]
    for x, t, al in cols: (c.drawRightString if al == "r" else c.drawString)(x, y, t)
    c.setFont("Helvetica", 8.5)
    if ddt: y -= 13; c.drawString(100, y, f"DDT n. {ddt[0]} del {ddt[1]}")
    imp = 0
    for r in righe:
        y -= 13
        if r.get("codice"): c.drawString(40, y, r["codice"])
        c.drawString(100, y, r["descr"])
        if r.get("qta") is not None: c.drawRightString(330, y, it(r["qta"]))
        c.drawRightString(395, y, f"{r['prezzo']:.8f}".replace(".", ","))
        if r.get("um"): c.drawString(405, y, r["um"])
        c.drawRightString(500, y, "4,00"); c.drawRightString(560, y, it(r["totale"])); imp += r["totale"]
    y -= 35; c.setFont("Helvetica-Bold", 9); c.drawString(40, y, "RIEPILOGHI IVA E TOTALI")
    y -= 14; c.setFont("Helvetica-Bold", 8)
    for x, t in [(40, "esigibilità iva / riferimenti normativi"), (250, "%IVA"), (330, "Spese accessorie"), (430, "Totale imponibile"), (520, "Totale imposta")]: c.drawString(x, y, t)
    y -= 12; c.setFont("Helvetica", 8.5)
    for x, t in [(40, "I (esigibilità immediata)"), (250, "4,00"), (330, "0,00"), (430, it(imp)), (520, it(imp * .04))]: c.drawString(x, y, t)
    y -= 22; c.setFont("Helvetica-Bold", 8)
    for x, t in [(40, "Importo bollo"), (150, "Sconto/Maggiorazione"), (300, "Arr."), (430, "Totale documento")]: c.drawString(x, y, t)
    y -= 12; c.setFont("Helvetica", 8.5); c.drawString(430, y, it(imp * 1.04))
    c.save()

def caseificio(path):
    """Gestionale del fornitore: carta intestata, titolo con numero e data, sconto e lotto sotto la riga."""
    c = canvas.Canvas(str(path), pagesize=A4)
    c.setFont("Helvetica-Bold", 15); c.drawString(40, H - 55, "CASEIFICIO MONTI S.N.C.")
    c.setFont("Helvetica", 9); c.drawString(40, H - 70, "di Monti Paolo & C."); c.drawString(40, H - 82, "Via Roma 10 - 89022 Cittanova (RC)"); c.drawString(40, H - 94, "P.IVA 22222222222 - Tel. 0966 000000")
    c.drawString(350, H - 120, "Spett.le"); c.drawString(350, H - 132, "BAR DI PROVA"); c.drawString(350, H - 144, "Via Roma 1 - 89022 Cittanova"); c.drawString(350, H - 156, "P.IVA 01234567890")
    c.setFont("Helvetica-Bold", 12); c.drawString(40, H - 190, "FATTURA N. 78 del 23/11/2026")
    y = H - 225; c.setFont("Helvetica-Bold", 9)
    for x, t, r in [(40, "Codice", 0), (95, "Descrizione", 0), (330, "U.M.", 0), (390, "Q.tà", 1), (440, "Prezzo", 1), (475, "Sc.%", 1), (530, "Importo", 1), (560, "IVA", 1)]: (c.drawRightString if r else c.drawString)(x, y, t)
    c.setFont("Helvetica", 9)
    rows = [("RIC15", "RICOTTA VACCINA 1,5KG", "PZ", "2", "6,90", "", "13,80", "Lotto L2611 Scad. 05/12/2026"), ("MOZ250", "MOZZARELLA FIOR DI LATTE 250G", "PZ", "10", "1,20", "10", "10,80", None)]
    for cod, d, um, q, p, sc, imp, extra in rows:
        y -= 15
        for x, t, r in [(40, cod, 0), (95, d, 0), (330, um, 0), (390, q, 1), (440, p, 1), (475, sc, 1), (530, imp, 1), (560, "4", 1)]:
            if t: (c.drawRightString if r else c.drawString)(x, y, t)
        if extra: y -= 11; c.setFont("Helvetica", 7.5); c.drawString(95, y, extra); c.setFont("Helvetica", 9)
    y -= 40
    for t, v in [("Totale imponibile", "24,60"), ("IVA 4%", "0,98"), ("TOTALE FATTURA €", "25,58")]:
        c.drawString(380, y, t); c.drawRightString(560, y, v); y -= 14
    c.save()

def bevande(path):
    """Righe scritte come testo unico, senza intestazioni di colonna riconoscibili."""
    c = canvas.Canvas(str(path), pagesize=A4); c.setFont("Helvetica-Bold", 13); c.drawString(40, H - 55, "BEVANDE DEL SUD SRL")
    c.setFont("Helvetica", 9); c.drawString(40, H - 70, "Zona Industriale - Taurianova (RC)"); c.drawString(40, H - 82, "P.IVA 33333333333")
    c.setFont("Helvetica-Bold", 11); c.drawString(40, H - 120, "Fattura nr. B-502 del 24/11/2026")
    c.setFont("Courier", 9); y = H - 160
    c.drawString(40, y, "Prodotti consegnati")
    for line in ["ACQUA NATURALE 0,5L CT24        3      5,76     17,28    22%", "COLA VETRO 33CL CT24            2     15,60     31,20    22%"]:
        y -= 14; c.drawString(40, y, line)
    y -= 30; c.drawString(40, y, "Totale imponibile 48,48"); y -= 14; c.drawString(40, y, "Totale IVA 10,67"); y -= 14; c.drawString(40, y, "Totale documento 59,15")
    c.save()

def semplice(path, lines, font="Helvetica"):
    c = canvas.Canvas(str(path), pagesize=A4); c.setFont(font, 10); y = H - 60
    for l in lines: c.drawString(40, y, l); y -= 14
    c.save()

def scansione(path):
    c = canvas.Canvas(str(path), pagesize=A4)
    for i in range(30): c.rect(40, H - 80 - i * 20, 500, 12, fill=1, stroke=0)
    c.save()

agenzia(DIR / "latteria_1290.pdf", "1290", "23-11-2026", [
    {"codice": "BUR1", "descr": "BURRO PANETTO 1KG", "qta": 6, "um": "PZ", "prezzo": 9.45, "totale": 56.70},
    {"codice": "LAT1", "descr": "LATTE INTERO FRESCO LT 1", "qta": 12, "um": "LT", "prezzo": 1.29, "totale": 15.48},
    {"codice": "PAN6", "descr": "PANNA FRESCA 35% CT 6X0,5LT", "qta": 1, "um": "CT", "prezzo": 13.35, "totale": 13.35},
    {"descr": "SPESE DI TRASPORTO", "prezzo": 5, "totale": 5.0}])
caseificio(DIR / "caseificio_78.pdf")
bevande(DIR / "bevande_b502.pdf")
scansione(DIR / "scansione.pdf")
semplice(DIR / "nota_credito.pdf", ["LATTERIA VAL VERDE S.R.L.", "P.IVA 11111111111", "NOTA DI CREDITO N. 12 del 22/11/2026", "Reso burro  1  9,45  9,45"])
semplice(DIR / "ddt.pdf", ["LATTERIA VAL VERDE S.R.L.", "P.IVA 11111111111", "DOCUMENTO DI TRASPORTO N. 900 del 24/11/2026", "Burro  6  PZ"])
buf = io.BytesIO(); w = PdfWriter(); w.append(PdfReader(str(DIR / "caseificio_78.pdf"))); w.encrypt("segreta"); w.write(buf)
(DIR / "protetta.pdf").write_bytes(buf.getvalue())
PDFS = ["latteria_1290.pdf", "caseificio_78.pdf", "bevande_b502.pdf", "scansione.pdf", "nota_credito.pdf", "protetta.pdf", "ddt.pdf"]

# altri impaginati: due pagine (con e senza intestazioni ripetute), «Articolo» come descrizione, tabella fitta, quantità attaccata alla descrizione
def it(v): return f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
DOLCI = [("ZUC1", "ZUCCHERO SEMOLATO 1KG", "PZ", 10, 1.15), ("FAR0", "FARINA 00 KG 1", "PZ", 20, 0.89), ("CAC2", "CACAO AMARO 250G", "PZ", 4, 3.40), ("UOV6", "UOVA FRESCHE CAT.A X6", "CF", 12, 2.10),
         ("LIEV", "LIEVITO VANIGLIATO 16G X3", "CF", 6, 0.95), ("VAN1", "VANILLINA BUSTINE X5", "CF", 5, 1.10), ("SAL1", "SALE FINO 1KG", "PZ", 2, 0.45), ("MIE5", "MIELE MILLEFIORI 500G", "PZ", 3, 5.20)]
def dolci_testa(c, numero, pagina, di):
    c.setFont("Helvetica-Bold", 14); c.drawString(40, H - 55, "DOLCIARIA ROSSI SRL")
    c.setFont("Helvetica", 9); c.drawString(40, H - 70, "Via Garibaldi 45 - 89013 Gioia Tauro (RC)"); c.drawString(40, H - 82, "P.IVA 44444444444")
    c.setFont("Helvetica-Bold", 11); c.drawString(40, H - 115, f"FATTURA N. {numero} del 20/11/2026"); c.setFont("Helvetica", 9); c.drawRightString(560, H - 115, f"Pag. {pagina} di {di}")
def dolci_cols(c, y, cols, size=9):
    c.setFont("Helvetica-Bold", size)
    for x, t, r in cols: (c.drawRightString if r else c.drawString)(x, y, t)
    c.setFont("Helvetica", size)
def dolci_totali(c, y, x0, x1, tot):
    for t, v in [("Totale imponibile", it(tot)), ("IVA 10%", it(tot * .1)), ("TOTALE DOCUMENTO", it(tot * 1.1))]: c.drawString(x0, y, t); c.drawRightString(x1, y, v); y -= 14
DCOLS = [(40, "Codice", 0), (95, "Descrizione", 0), (330, "U.M.", 0), (390, "Q.tà", 1), (450, "Prezzo", 1), (520, "Importo", 1), (560, "IVA", 1)]
def dolci_riga(c, y, r):
    cod, d, um, q, p = r
    for x, t, rr in [(40, cod, 0), (95, d, 0), (330, um, 0), (390, str(q), 1), (450, it(p), 1), (520, it(q * p), 1), (560, "10", 1)]: (c.drawRightString if rr else c.drawString)(x, y, t)
def dolci_due_pagine(path, numero, ripeti):
    c = canvas.Canvas(str(path), pagesize=A4); dolci_testa(c, numero, 1, 2); y = H - 150; dolci_cols(c, y, DCOLS)
    parz = 0
    for r in DOLCI[:5]: y -= 15; dolci_riga(c, y, r); parz += r[3] * r[4]
    y -= 25; c.setFont("Helvetica-Bold", 9); c.drawString(95, y, "A riportare"); c.drawRightString(520, y, it(parz)); c.showPage()
    dolci_testa(c, numero, 2, 2); y = H - 150
    if ripeti: dolci_cols(c, y, DCOLS)
    else: c.setFont("Helvetica", 9)
    y -= 15; c.drawString(95, y, "Riporto"); c.drawRightString(520, y, it(parz))
    tot = parz
    for r in DOLCI[5:]: y -= 15; dolci_riga(c, y, r); tot += r[3] * r[4]
    dolci_totali(c, y - 40, 380, 560, tot); c.save()
def dolci_articolo(path, numero):
    c = canvas.Canvas(str(path), pagesize=A4); dolci_testa(c, numero, 1, 1); y = H - 150
    dolci_cols(c, y, [(40, "Codice", 0), (95, "Articolo", 0), (390, "Q.tà", 1), (450, "Prezzo", 1), (520, "Importo", 1)])
    tot = 0
    for cod, d, um, q, p in DOLCI[:3]:
        y -= 15; tot += q * p
        for x, t, rr in [(40, cod, 0), (95, d, 0), (390, str(q), 1), (450, it(p), 1), (520, it(q * p), 1)]: (c.drawRightString if rr else c.drawString)(x, y, t)
    dolci_totali(c, y - 40, 380, 560, tot); c.save()
def dolci_fitta(path, numero):
    """8 pt, colonne a 4 pt l'una dall'altra: importo e aliquota arrivano dal PDF come un solo testo."""
    c = canvas.Canvas(str(path), pagesize=A4); dolci_testa(c, numero, 1, 1); y = H - 150
    dolci_cols(c, y, [(40, "Descrizione", 0), (215, "U.M.", 1), (245, "Q.tà", 1), (280, "Prezzo", 1), (300, "Sc.", 1), (335, "Importo", 1), (339, "IVA", 0)], 8)
    tot = 0
    for cod, d, um, q, p in DOLCI[:4]:
        y -= 11; imp = round(q * p, 2); tot += imp
        for x, t, r in [(40, d, 0), (215, um, 1), (245, f"{q},000", 1), (280, it(p), 1), (335, it(imp), 1), (339, "10", 0)]: (c.drawRightString if r else c.drawString)(x, y, t)
    dolci_totali(c, y - 30, 200, 335, tot); c.save()
def dolci_incollata(path, numero):
    """La quantità nello stesso testo della descrizione."""
    c = canvas.Canvas(str(path), pagesize=A4); dolci_testa(c, numero, 1, 1); y = H - 150
    dolci_cols(c, y, [(40, "Descrizione", 0), (260, "Q.tà", 1), (330, "Prezzo", 1), (400, "Importo", 1), (404, "IVA", 0)])
    tot = 0
    for cod, d, um, q, p in DOLCI[:3]:
        y -= 15; imp = round(q * p, 2); tot += imp
        c.drawString(40, y, f"{d} {q}"); c.drawRightString(330, y, it(p)); c.drawString(400 - c.stringWidth(it(imp), "Helvetica", 9), y, f"{it(imp)} 10")
    dolci_totali(c, y - 40, 300, 440, tot); c.save()
dolci_due_pagine(DIR / "dolci_455.pdf", "455", True)
dolci_due_pagine(DIR / "dolci_456.pdf", "456", False)
dolci_articolo(DIR / "dolci_457.pdf", "457")
dolci_fitta(DIR / "dolci_458.pdf", "458")
dolci_incollata(DIR / "dolci_459.pdf", "459")
DOLCI_ATTESI = {"455": 8, "456": 8, "457": 3, "458": 4, "459": 3}

# l'app va servita da un indirizzo web: il lettore di PDF è un modulo che non si carica da file://
sock = socket.socket(); sock.bind(("127.0.0.1", 0)); PORT = sock.getsockname()[1]; sock.close()
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{PORT}/index.html"

def newpage(br, mock):
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", has_touch=True)
    pg = ctx.new_page(); pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00")
    if mock: pg.add_init_script(mock)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("response", lambda r: errors.append(f"HTTP {r.status} {r.url}") if r.status >= 400 else None)
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text} {m.location}") if m.type in ("error", "warning") else None)
    return ctx, pg
top = lambda pg: pg.locator(".sheet-wrap").last
def statuses(pg):
    return {T(r.locator("b").inner_text()): T(r.locator(".chip").inner_text()) for r in pg.locator(".sheet-wrap").first.locator(".list .row").all()}
def docs(pg, js):
    return pg.evaluate(f"Object.entries(window.__store.documenti).map(([id, d]) => ({{id, ...d}})).filter(d => {js})")
def shot(pg, name):
    pg.wait_for_timeout(350); pg.screenshot(path=str(SHOTS / f"{name}.png"))

empty = MOCK_TEMPLATE.replace("__SEEDS__", "{}").replace("__CAN__", "true").replace("__DBNULL__", "false")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx, pg = newpage(br, empty)
    pg.goto(URL); pg.wait_for_selector("#v-oggi .welcome")
    pg.locator(".wl-opts .qa", has_text="Esplora").click()
    pg.wait_for_function(f"{COUNT} > 400 && !document.querySelector('.sheet-wrap')", timeout=30000)
    pg.goto(URL + "#acquisti"); pg.wait_for_selector("#v-acquisti")
    pg.locator("main .btn", has_text="Importa fatture").click(); pg.wait_for_timeout(300)
    pg.set_input_files(".sheet input[data-file=fe]", [str(DIR / n) for n in PDFS])
    pg.wait_for_function("document.querySelectorAll('.sheet-wrap .list .row').length >= 7", timeout=30000); pg.wait_for_timeout(300)
    s = statuses(pg)
    print("   ", s)
    check(s.get("Fattura n. 1290 del 23/11/2026", "").startswith("Da controllare"), "foglio di stile dell'Agenzia: numero e data letti")
    check(s.get("Fattura n. 78 del 23/11/2026") == "Fornitore nuovo", "gestionale del fornitore: numero e data dal titolo")
    check(s.get("Fattura n. B-502 del 24/11/2026", "").startswith("Da controllare"), "righe senza colonne: numero con lettere")
    check(s.get("scansione.pdf", "").startswith("È una scansione senza testo"), f"scansione riconosciuta: {s.get('scansione.pdf')}")
    check(s.get("Fattura n. 12 del 22/11/2026") == "Nota di credito: non si carica", "nota di credito in PDF scartata")
    check(s.get("protetta.pdf", "").startswith("Il PDF è protetto da password"), "PDF con password")
    check(s.get("ddt.pdf", s.get("Fattura n. 900 del 24/11/2026", "")).startswith("Sembra un DDT"), f"DDT in PDF: {[k for k in s if '900' in k or 'ddt' in k]}")
    pg.screenshot(path=str(SHOTS / "p_elenco.png"))

    # foglio di stile dell'Agenzia
    pg.locator(".sheet .row", has_text="Fattura n. 1290").click(); pg.wait_for_timeout(400)
    t = top(pg)
    check(t.locator('[data-k="numero"]').input_value() == "1290" and t.locator('[data-k="data"]').input_value() == "2026-11-23", "numero e data modificabili")
    check(T(t.locator('[data-k="forn"] option:checked').inner_text()) == "Latteria Val Verde", "fornitore riconosciuto dalla carta intestata")
    names = [T(t.locator(f'[data-k="righe.{i}.a"] option:checked').inner_text()) for i in range(4)]
    check(names == ["Burro", "Latte intero fresco", "Panna fresca 35%", "Non è merce: non caricare"], f"righe lette e proposte {names}")
    vals = [(t.locator(f'[data-k="righe.{i}.q"]').input_value(), t.locator(f'[data-k="righe.{i}.fat"]').input_value(), t.locator(f'[data-k="righe.{i}.imp"]').input_value()) for i in range(3)]
    check(vals == [("6", "1", "56,7"), ("12", "1", "15,48"), ("1", "3", "13,35")], f"quantità, conversioni e importi {vals}")
    check("torna con l'imponibile" in T(t.locator("#fe-sum").inner_text()), f"somma delle righe: {t.locator('#fe-sum').inner_text()}")
    t.locator(".fe-raw summary").click(); pg.wait_for_timeout(150)
    check("Prezzo totale" in t.locator(".fe-raw pre").inner_text(), "testo letto dal PDF consultabile")
    shot(pg, "p_agenzia")
    t.locator(".btn.pri", has_text="Importa fattura").click(); pg.wait_for_timeout(700)
    d = docs(pg, "d.numero === '1290'")
    check(len(d) == 1 and d[0]["data"] == "2026-11-23" and sorted((x["qta"], x["importo"]) for x in d[0]["righe"]) == [(3, 13.35), (6, 56.7), (12, 15.48)], f"fattura dal PDF registrata {d and d[0]['righe']}")

    # gestionale del fornitore: lotto e scadenza sotto la riga, sconto
    pg.locator(".sheet .row", has_text="Fattura n. 78").click(); pg.wait_for_timeout(400)
    t = top(pg)
    check(t.locator('[data-k="fnome"]').input_value() == "CASEIFICIO MONTI S.N.C." and t.locator('[data-k="fpiva"]').input_value() == "22222222222", f"fornitore nuovo dalla carta intestata: {t.locator('[data-k=fnome]').input_value()!r}")
    t.locator('[data-k="fnome"]').fill("Caseificio Monti S.n.c.")
    check("torna con l'imponibile" in T(t.locator("#fe-sum").inner_text()), "con lo sconto la somma torna")
    t.locator('[data-k="righe.0.a"]').select_option("__new"); pg.wait_for_timeout(350)
    a = top(pg); check(a.locator('[data-k="nome"]').input_value() == "Ricotta vaccina", "articolo precompilato"); a.locator(".btn.pri").click(); pg.wait_for_timeout(400)
    t = top(pg)
    check(t.locator('[data-k="righe.0.lotto"]').input_value() == "L2611" and t.locator('[data-k="righe.0.scad"]').input_value() == "2026-12-05", "lotto e scadenza dalla riga sotto")
    t.locator('[data-k="righe.1.a"]').select_option("__new"); pg.wait_for_timeout(350)
    a = top(pg); check(a.locator('[data-k="nome"]').input_value() == "Mozzarella fior di latte", "secondo articolo precompilato"); a.locator(".btn.pri").click(); pg.wait_for_timeout(400)
    t = top(pg)
    check(t.locator('[data-k="righe.1.fat"]').input_value() == "0,25", "mozzarella: 1 PZ = 0,25 kg")
    shot(pg, "p_caseificio")
    t.locator(".btn.pri", has_text="Importa fattura").click(); pg.wait_for_timeout(700)
    d = docs(pg, "d.numero === '78'")
    cas = pg.evaluate("Object.values(window.__store.fornitori).find(f => f.nome === 'Caseificio Monti S.n.c.')")
    check(cas and cas["piva"] == "22222222222", "fornitore creato con il nome corretto a mano")
    check(len(d) == 1 and [(x["qta"], x["importo"], x["lotto"], x["scadenza"]) for x in d[0]["righe"]] == [(3, 13.8, "L2611", "2026-12-05"), (2.5, 10.8, "", "")], f"righe del caseificio {d and d[0]['righe']}")

    # righe senza colonne
    pg.locator(".sheet .row", has_text="Fattura n. B-502").click(); pg.wait_for_timeout(400)
    t = top(pg)
    names = [T(t.locator(f'[data-k="righe.{i}.a"] option:checked').inner_text()) for i in range(2)]
    check(names == ["Acqua naturale 0,5 l", "Cola in vetro 33 cl"] and [t.locator(f'[data-k="righe.{i}.fat"]').input_value() for i in range(2)] == ["24", "24"], f"righe trovate da quantità × prezzo = importo {names}")
    t.locator(".btn.pri", has_text="Importa fattura").click(); pg.wait_for_timeout(700)
    d = docs(pg, "d.numero === 'B-502'")
    check(len(d) == 1 and d[0]["fornitoreId"] == "es-f-bevande" and sorted(x["qta"] for x in d[0]["righe"]) == [48, 72], "acqua e cola in pezzi su Bevande del Sud")

    # lo stesso PDF di nuovo: già importata
    pg.set_input_files(".sheet input[data-file=fe]", [str(DIR / "latteria_1290.pdf")]); pg.wait_for_timeout(600)
    check(statuses(pg).get("Fattura n. 1290 del 23/11/2026") == "Importata", "stesso PDF: risulta importata")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(250)

    # fattura differita in PDF sul DDT arrivato senza prezzi
    ddt = docs(pg, "d.fornitoreId === 'es-f-latteria' && d.tipo === 'ddt' && d.righe.some(r => r.importo == null)")[0]
    CODE = {"es-a-burro": ("BUR1", "BURRO PANETTO 1KG", "PZ", 1, 9.47), "es-a-latte": ("LAT1", "LATTE INTERO FRESCO LT 1", "LT", 1, 1.30),
            "es-a-panna": ("PAN05", "PANNA FRESCA 35% 0,5LT", "PZ", .5, 2.25), "es-a-mascarpone": ("MAS5", "MASCARPONE 500G", "PZ", .5, 3.85)}
    righe = [{"codice": CODE[x["articoloId"]][0], "descr": CODE[x["articoloId"]][1], "qta": x["qta"] / CODE[x["articoloId"]][3], "um": CODE[x["articoloId"]][2], "prezzo": CODE[x["articoloId"]][4], "totale": round(x["qta"] / CODE[x["articoloId"]][3] * CODE[x["articoloId"]][4], 2)} for x in ddt["righe"]]
    dd = f"{ddt['data'][8:10]}/{ddt['data'][5:7]}/{ddt['data'][:4]}"
    agenzia(DIR / "differita.pdf", "1301", "24-11-2026", righe, tipo="TD24 fattura differita", ddt=(ddt["numero"], dd))
    pg.locator("main .btn", has_text="Importa fatture").click(); pg.wait_for_timeout(250)
    pg.set_input_files(".sheet input[data-file=fe]", [str(DIR / "differita.pdf")]); pg.wait_for_selector(".sheet .list .row"); pg.wait_for_timeout(300)
    pg.locator(".sheet .row", has_text="Fattura n. 1301").click(); pg.wait_for_timeout(400)
    t = top(pg)
    check(t.locator('[data-k="solo"]').is_checked(), "il DDT citato nel PDF è riconosciuto")
    for i in range(len(righe)):
        if t.locator(f'[data-k="righe.{i}.a"]').input_value() == "": t.locator(f'[data-k="righe.{i}.a"]').select_option(ddt["righe"][i]["articoloId"]); pg.wait_for_timeout(120)
    t.locator(".btn.pri", has_text="Importa fattura").click(); pg.wait_for_timeout(700)
    after = docs(pg, f"d.id === '{ddt['id']}'")[0]
    check(all(x["importo"] is not None for x in after["righe"]) and after["fatturaRif"] == "n. 1301 del 24/11/2026", f"DDT completato dal PDF {after['fatturaRif']}")

    # altri impaginati dello stesso fornitore (nuovo)
    pg.set_input_files(".sheet input[data-file=fe]", [str(DIR / f"dolci_{n}.pdf") for n in DOLCI_ATTESI])
    pg.wait_for_function("['455','456','457','458','459'].every(n => [...document.querySelectorAll('.sheet-wrap .list .row b')].some(b => b.textContent.includes('n. ' + n + ' ')))", timeout=30000); pg.wait_for_timeout(300)
    s = statuses(pg)
    stati = {n: s.get(f"Fattura n. {n} del 20/11/2026") for n in DOLCI_ATTESI}
    check(all(v == "Fornitore nuovo" for v in stati.values()), f"altri impaginati letti senza dubbi: {stati}")
    for n, quante in DOLCI_ATTESI.items():
        pg.locator(".sheet .row", has_text=f"Fattura n. {n} ").click(); pg.wait_for_timeout(400)
        t = top(pg)
        righe = t.locator('select[data-k^="righe."][data-k$=".a"]').count()
        somma = T(t.locator("#fe-sum").inner_text())
        check(righe == quante and "torna con l'imponibile" in somma, f"n. {n}: {righe} righe di {quante}, {somma}")
        fq = [T(x) for x in t.locator(".fe-q").all_inner_texts()]
        check(not any("non torna" in x for x in fq), f"n. {n}: quantità × prezzo torna su ogni riga")
        if n == "458": check([x.split("= ")[-1] for x in fq] == ["11,50 €", "17,80 €", "13,60 €", "25,20 €"], f"tabella fitta: importi esatti, aliquota a parte {fq}")
        if n == "459": check([x.split(" ")[0] for x in fq] == ["10", "20", "4"] and T(t.locator(".fe-d").first.inner_text()) == "ZUCCHERO SEMOLATO 1KG", f"quantità ripresa dalla descrizione {fq}")
        if n == "456": shot(pg, "p_due_pagine")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    ctx.close()
    br.close()
srv.shutdown()

print("\nERRORI CONSOLE:" if errors else "\nNessun errore in console")
for e in errors: print("  ", e)
print(f"\n{len(fails)} controlli falliti")
sys.exit(1 if fails or errors else 0)
