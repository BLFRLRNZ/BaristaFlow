"""Scheda di produzione in PDF: si crea solo quando la si chiede dal lotto. Controlla che il file sia un PDF valido
(qpdf e pypdf), con intestazione del bar, prodotto, lotto, date, quantità, operatore, allergeni e ingredienti con i lotti
(anche quelli dei semilavorati); che una produzione lunga vada su più pagine con l'intestazione della tabella ripetuta;
che i caratteri speciali escano giusti; che fuori da claude.ai il file si scarichi sul computer e su iPhone passi dal
foglio di condivisione."""
import base64, json, pathlib, shutil, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright
import pypdf
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from mock import MOCK_TEMPLATE

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEEDS = json.loads((ROOT / "test" / "dati-test.json").read_text(encoding="utf-8"))
SEEDS["impostazioni"] = {"generale": {"nome": "Bar Aurora", "indirizzo": "Via Roma 1, Cittanova", "piva": "01234567890", "registrato": 1}}
# una produzione lunga (45 ingredienti) con nome e note pieni di caratteri da proteggere
P0 = SEEDS["produzioni"]["p-bis211126"]
lotti = [(d, r) for d, doc in SEEDS["documenti"].items() if not doc.get("soloPrezzi") for r in doc["righe"]]
SEEDS["ricette"]["r-speciale"] = {**SEEDS["ricette"]["r-biscotti"], "nome": "Crostata (albicocche) «speciale» – più buona", "sigla": "CRS"}
SEEDS["produzioni"]["p-lunga"] = {**P0, "lotto": "CRS-241126-1", "ricettaId": "r-speciale", "ricettaNome": "Crostata (albicocche) «speciale» – più buona",
    "data": "2026-11-24", "scadenza": "2026-11-28", "operatore": "Zoë D'Amico", "note": "Forno a 180 °C \\ ventilato (prova)",
    "consumi": [{"tipo": "art", "refId": lotti[i % len(lotti)][1]["articoloId"], "nome": "x", "lotId": f"{lotti[i % len(lotti)][0]}:{lotti[i % len(lotti)][1]['id']}", "qta": 0.001} for i in range(45)]}
URL = (ROOT / "index.html").as_uri()
SHOTS = ROOT / "test" / "screenshot"; SHOTS.mkdir(exist_ok=True)
TMP = pathlib.Path(tempfile.mkdtemp())
fails, errors = [], []
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)
def pdf_ok(path):
    r = subprocess.run(["qpdf", "--check", str(path)], capture_output=True, text=True) if shutil.which("qpdf") else None
    return r is None or r.returncode == 0
def testo(path): return [pg.extract_text() for pg in pypdf.PdfReader(str(path)).pages]
def foto(path, nome):
    if shutil.which("pdftoppm"): subprocess.run(["pdftoppm", "-r", "70", "-png", "-f", "1", "-l", "1", str(path), str(SHOTS / nome)], check=False)
# il salvataggio di claude.ai: si tiene il file per controllarlo
GRAB = """(() => { const orig = window.claude.use; window.claude.use = name => orig(name).then(c => name !== 'downloads' || !c ? c : {save: async x => {
  const d = x.data; let s = ''; if (d instanceof Uint8Array) for (let i = 0; i < d.length; i += 8192) s += String.fromCharCode(...d.subarray(i, i + 8192));
  (window.__dl ||= []).push({filename: x.filename, b64: d instanceof Uint8Array ? btoa(s) : null}); return c.save(x); }}); })();"""

mock = MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEEDS)).replace("__CAN__", "true").replace("__DBNULL__", "false")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", has_touch=True)
    pg = ctx.new_page(); pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00"); pg.add_init_script(mock); pg.add_init_script(GRAB)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    pg.goto(URL + "#produzione"); pg.wait_for_selector("#v-produzione"); pg.wait_for_timeout(400)

    # 1. dal lotto, su richiesta
    pg.locator("#v-produzione .row", has_text="TAR-241126-1").click(); pg.wait_for_timeout(400)
    b = pg.locator(".sheet [data-act=pdf-lotto]")
    box, sh = b.bounding_box(), pg.locator(".sheet .sh-body").bounding_box()
    check(b.count() == 1 and "Scheda di produzione PDF" in b.inner_text() and box["y"] + box["height"] < sh["y"] + sh["height"], "nel lotto il pulsante del PDF si vede senza scorrere")
    check(pg.evaluate("window.__dl") is None and not any(w[1] not in ("produzioni", "movimenti") for w in pg.evaluate("window.__writes")), "prima di chiederlo non si crea niente")
    pg.screenshot(path=str(SHOTS / "p_lotto.png"))
    nw = len(pg.evaluate("window.__writes"))
    b.click(); pg.wait_for_timeout(500)
    dl = pg.evaluate("window.__dl")
    check(len(dl) == 1 and dl[0]["filename"] == "Scheda di produzione TAR-241126-1.pdf" and dl[0]["b64"], f"un PDF per quel lotto {[d['filename'] for d in dl]}")
    check(len(pg.evaluate("window.__writes")) == nw, "il PDF non si salva nei dati")
    f1 = TMP / "tar.pdf"; f1.write_bytes(base64.b64decode(dl[0]["b64"]))
    raw = f1.read_bytes()
    check(raw.startswith(b"%PDF-1.4") and raw.rstrip().endswith(b"%%EOF") and pdf_ok(f1), "è un PDF valido")
    t = testo(f1)
    t0 = t[0]
    check(len(t) == 1 and pypdf.PdfReader(str(f1)).metadata.title == "Scheda di produzione TAR-241126-1", "una pagina, con il titolo nel file")
    for frase, cosa in [("Bar Aurora · Via Roma 1, Cittanova · P.IVA 01234567890", "intestazione del bar"), ("SCHEDA DI PRODUZIONE", "titolo"),
                        ("Tartellette crema e nocciole", "prodotto"), ("Lotto TAR-241126-1", "codice del lotto"), ("Data di produzione\n24/11/2026", "data di produzione"),
                        ("Da consumarsi entro\n26/11/2026", "scadenza"), ("Quantità prodotta\n20 pz", "quantità"), ("Operatore\nGiulia", "operatore"),
                        ("Contiene: Glutine, Uova, Latte, Frutta a guscio", "allergeni"), ("Farina 00 300 g MB2610-44 31/05/2027 Molino del Borgo · Fattura n. 1187", "ingrediente con lotto, scadenza e fornitore"),
                        ("Crema pasticcera 600 g CRE-231126-1 26/11/2026 Produzione interna del 23/11/2026", "semilavorato con il suo lotto"),
                        ("– Latte intero fresco 1 l LV-3240", "ingredienti del semilavorato"), ("Firma dell’operatore", "spazio per la firma"), ("Pagina 1 di 1", "numero di pagina")]:
        check(frase in t0, f"nel PDF: {cosa}")
    foto(f1, "p_scheda")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(250)

    # 2. produzione lunga: più pagine, intestazione della tabella ripetuta, caratteri speciali
    pg.locator("#v-produzione .row", has_text="CRS-241126-1").click(); pg.wait_for_timeout(400)
    pg.locator(".sheet [data-act=pdf-lotto]").click(); pg.wait_for_timeout(500)
    dl = pg.evaluate("window.__dl")
    f2 = TMP / "lunga.pdf"; f2.write_bytes(base64.b64decode(dl[-1]["b64"]))
    t = testo(f2)
    check(len(t) >= 2 and pdf_ok(f2) and all(f"Pagina {i + 1} di {len(t)}" in x for i, x in enumerate(t)), f"45 ingredienti: più pagine numerate ({len(t)})")
    check("eliminato" not in "".join(t) and sum(x.count("Fattura n.") + x.count("DDT n.") for x in t) == 45, "ogni ingrediente con il suo documento d'acquisto")
    check(all("Ingrediente Quantità Lotto Scadenza Provenienza" in x for x in t), "l'intestazione della tabella si ripete sulla seconda pagina")
    check("Crostata (albicocche) «speciale» – più buona" in t[0] and "Zoë D'Amico" in t[0] and "Forno a 180 °C \\ ventilato (prova)" in t[-1], "parentesi, virgolette, accenti e barre rovesciate escono giusti")
    foto(f2, "p_lunga")

    # 3. sola lettura: il PDF si può chiedere lo stesso
    ro = br.new_context(viewport={"width": 390, "height": 844}, timezone_id="Europe/Rome", locale="it-IT")
    pr = ro.new_page(); pr.clock.set_fixed_time("2026-11-24T10:00:00+01:00")
    pr.add_init_script(MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEEDS)).replace("__CAN__", "false").replace("__DBNULL__", "false")); pr.add_init_script(GRAB)
    pr.goto(URL + "#produzione"); pr.wait_for_selector("#v-produzione"); pr.wait_for_timeout(400)
    pr.locator("#v-produzione .row", has_text="BIS-211126-1").click(); pr.wait_for_timeout(400)
    pr.locator(".sheet [data-act=pdf-lotto]").click(); pr.wait_for_timeout(500)
    check([d["filename"] for d in pr.evaluate("window.__dl") or []] == ["Scheda di produzione BIS-211126-1.pdf"], "anche in sola lettura")
    ro.close()
    br.close()

# 4. fuori da claude.ai: sul computer si scarica, su iPhone passa dal foglio di condivisione
SEED_LOCAL = "if (!localStorage.getItem('barista-flow-v1')) localStorage.setItem('barista-flow-v1', " + json.dumps(json.dumps(SEEDS)) + ");"
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8767", "--bind", "127.0.0.1"], cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(0.8)
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
        ctx = br.new_context(viewport={"width": 1280, "height": 860}, accept_downloads=True, service_workers="block")
        pg = ctx.new_page(); pg.add_init_script(SEED_LOCAL)
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        pg.goto("http://127.0.0.1:8767/#produzione"); pg.wait_for_selector("#v-produzione"); pg.wait_for_timeout(500)
        pg.locator("#v-produzione .row", has_text="TAR-241126-1").click(); pg.wait_for_timeout(400)
        with pg.expect_download() as d:
            pg.locator(".sheet [data-act=pdf-lotto]").click()
        f3 = TMP / "dl.pdf"; d.value.save_as(str(f3))
        check(d.value.suggested_filename == "Scheda di produzione TAR-241126-1.pdf" and f3.read_bytes().startswith(b"%PDF") and pdf_ok(f3), "sul computer il PDF si scarica")
        ctx.close()
        iph = p.devices["iPhone 13"]
        ctx = br.new_context(**{k: v for k, v in iph.items() if k != "default_browser_type"}, service_workers="block")
        pg = ctx.new_page(); pg.add_init_script(SEED_LOCAL)
        pg.add_init_script("""navigator.canShare = x => !!(x && x.files && x.files.length);
          navigator.share = async x => { window.__share = x.files.map(f => ({name: f.name, type: f.type, size: f.size})); window.__shareTitle = x.title; };""")
        pg.goto("http://127.0.0.1:8767/#produzione"); pg.wait_for_selector("#v-produzione"); pg.wait_for_timeout(500)
        pg.locator("#v-produzione .row", has_text="TAR-241126-1").click(); pg.wait_for_timeout(400)
        pg.locator(".sheet [data-act=pdf-lotto]").click(); pg.wait_for_timeout(500)
        sh = pg.evaluate("window.__share")
        check(sh == [{"name": "Scheda di produzione TAR-241126-1.pdf", "type": "application/pdf", "size": sh[0]["size"] if sh else 0}] and sh[0]["size"] > 2000, f"su iPhone il PDF va nel foglio di condivisione {sh}")
        ctx.close(); br.close()
finally:
    srv.terminate()

errors = [e for e in errors if "favicon" not in e]
check(not errors, f"nessun errore nella console {errors[:3]}")
print("\n" + ("TUTTO OK" if not fails else f"{len(fails)} CONTROLLI FALLITI"))
sys.exit(1 if fails else 0)
