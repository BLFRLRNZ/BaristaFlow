import json, pathlib, sys, subprocess, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from mock import MOCK_TEMPLATE

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEEDS = json.loads((ROOT / "test" / "dati-test.json").read_text(encoding="utf-8"))
URL = (ROOT / "index.html").as_uri()
SHOTS = ROOT / "test" / "screenshot"; SHOTS.mkdir(exist_ok=True)
fails, errors = [], []
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)
T = lambda s: s.replace(" ", " ")

mock = MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEEDS)).replace("__CAN__", "true").replace("__DBNULL__", "false")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", has_touch=True)
    pg = ctx.new_page()
    pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00")
    pg.add_init_script(mock)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    pg.goto(URL); pg.wait_for_selector("#v-oggi"); pg.wait_for_timeout(300)

    # barra di navigazione del telefono: 4 sezioni + il pulsante centrale
    vis = pg.evaluate("[...document.querySelectorAll('#tabs > *')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.textContent.trim() || e.getAttribute('aria-label'))")
    check(vis == ["Oggi", "Produzione", "Nuova registrazione", "Magazzino", "Acquisti"], f"tab del telefono {vis}")

    # pulsante + e azioni rapide
    pg.locator(".fab").click(); pg.wait_for_timeout(250)
    qa = [T(x) for x in pg.locator(".sheet .qa b").all_inner_texts()]
    check(qa == ["Produzione", "Acquisto", "Scarico", "Scheda tecnica", "Articolo", "Fornitore", "Importa fatture"], f"azioni rapide {qa}")
    pg.wait_for_timeout(200); pg.screenshot(path=str(SHOTS / "m_azioni_rapide.png"))
    pg.locator(".sheet .qa", has_text="Scarico").click(); pg.wait_for_timeout(250)
    check(pg.locator(".sheet-wrap").count() == 1 and "Registra uno scarico" in pg.locator(".sh-head h2").inner_text(), "scarico rapido aperto")
    pg.fill("#q-scarico", "bisc"); pg.wait_for_timeout(250)
    rows = pg.locator(".sheet .row").all_inner_texts()
    check(len(rows) == 1 and "Biscotti al burro" in rows[0], f"ricerca nello scarico {rows}")
    check(pg.evaluate("document.activeElement.id") == "q-scarico", "il campo di ricerca resta attivo mentre scrivi")
    pg.locator(".sheet .row", has_text="Biscotti").click(); pg.wait_for_timeout(250)
    f = pg.locator(".sheet-wrap").last
    check("Scarico: Biscotti al burro" in f.locator(".sh-head h2").inner_text(), "dallo scarico rapido al modulo dello scarico")
    f.locator("[data-k=qta]").fill("5"); f.locator(".btn.pri").click(); pg.wait_for_timeout(300)
    mv = pg.evaluate("Object.values(window.__store.movimenti).filter(m => m.lotId === 'p-bis211126' && m.delta === -5).length")
    check(mv == 1, "vendita di 5 biscotti registrata")

    # ricerca globale
    pg.locator(".topbar .iconbtn.search").click(); pg.wait_for_timeout(250)
    pg.fill("#q-globale", "lv-32"); pg.wait_for_timeout(300)
    heads = pg.locator(".sheet .sres h3").all_inner_texts()
    check("Lotti dei fornitori" in heads, f"sezioni dei risultati {heads}")
    res = T(pg.locator(".sheet .sres").inner_text())
    check("LV-3211" in res and "LV-3240" in res, "trova i lotti del fornitore per codice")
    pg.fill("#q-globale", "889"); pg.wait_for_timeout(300)
    check("Fattura n. 889" in pg.locator(".sheet .sres").inner_text(), "trova la fattura per numero")
    pg.locator(".sheet .sres .row", has_text="Fattura n. 889").click(); pg.wait_for_timeout(250)
    check(pg.locator(".sheet-wrap").count() == 2, "il dettaglio si apre sopra la ricerca")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(100)
    check(pg.locator(".sheet-wrap").count() == 1 and pg.locator("#q-globale").input_value() == "889", "chiudendo il dettaglio torni ai risultati")
    pg.wait_for_timeout(150); pg.screenshot(path=str(SHOTS / "m_ricerca.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(100)

    # riordina dalla riga sotto scorta
    pg.locator("#todo .row", has_text="Acqua").locator(".btn", has_text="Riordina").click(); pg.wait_for_timeout(250)
    f = pg.locator(".sheet-wrap").last
    check(f.locator("[data-k=fornitoreId]").input_value() == "f-ingrosso" and f.locator("[data-k='righe.0.articoloId']").input_value() == "a-acqua", "riordina precompila fornitore e articolo")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(120)
    if pg.locator(".sheet-wrap").count() > 0:
        pg.locator(".sheet-wrap").last.locator(".btn.dan").click(); pg.wait_for_timeout(120)

    # esaurito con annulla
    pg.locator(".lab", has_text="BIS-211126-1").click(); pg.wait_for_timeout(250)
    pg.locator(".sheet .btn", has_text="Segna esaurito").click(); pg.wait_for_timeout(300)
    kv = T(pg.locator(".sheet .kv").inner_text())
    check("Residuo\n0 pz" in kv, f"lotto esaurito subito: {kv!r}")
    pg.locator("#toast button", has_text="Annulla").click(); pg.wait_for_timeout(300)
    kv = T(pg.locator(".sheet .kv").inner_text())
    check("Residuo\n15 pz" in kv, f"annulla ripristina il residuo: {kv!r}")
    pg.keyboard.press("Escape")

    # contapezzi nella produzione e anteprima del codice
    pg.goto(URL + "#produzione"); pg.wait_for_selector("#v-produzione"); pg.wait_for_timeout(150)
    pg.locator("main .btn.pri", has_text="Nuova produzione").click(); pg.wait_for_timeout(200)
    pg.select_option(".sheet [data-k=ricettaId]", "r-biscotti"); pg.wait_for_timeout(200)
    check(T(pg.locator(".sheet .lotcode b").inner_text()) == "BIS-241126-1", "anteprima del codice lotto")
    pg.locator(".sheet .stepper .btn").nth(1).click(); pg.locator(".sheet .stepper .btn").nth(1).click(); pg.wait_for_timeout(400)
    check(pg.locator(".sheet [data-k=qta]").input_value() == "62", "il contapezzi aumenta la quantità")
    vals = pg.locator(".sheet .lotpick input").evaluate_all("els => els.map(e => e.value)")
    check(vals[0] == "516,667", f"le quantità dei lotti seguono il contapezzi ({vals[0]})")
    pg.locator(".sheet .sh-head [data-act=close]").click(); pg.wait_for_timeout(150)
    if pg.locator(".sheet-wrap").count() > 1: pg.locator(".sheet-wrap").last.locator(".btn.dan").click(); pg.wait_for_timeout(120)

    # trascinare in basso chiude il foglio
    pg.locator("main .row").first.click(); pg.wait_for_timeout(350)
    hb = pg.locator(".sheet .sh-head").bounding_box()
    pg.mouse.move(hb["x"] + 60, hb["y"] + 20); pg.mouse.down(); pg.mouse.move(hb["x"] + 60, hb["y"] + 120, steps=5); pg.mouse.move(hb["x"] + 60, hb["y"] + 260, steps=5); pg.mouse.up(); pg.wait_for_timeout(300)
    check(pg.locator(".sheet-wrap").count() == 0, "trascinando in basso il foglio si chiude")

    # carosello delle etichette
    pg.goto(URL + "#oggi"); pg.wait_for_selector("#v-oggi"); pg.wait_for_timeout(200)
    x0 = pg.evaluate("document.getElementById('labels').scrollLeft")
    pg.locator(".carnav .btn").nth(1).click(); pg.wait_for_timeout(700)
    x1 = pg.evaluate("document.getElementById('labels').scrollLeft")
    check(x1 > x0, f"il carosello scorre ({x0} → {x1})")

    # titolo compatto nella barra quando si scorre
    pg.mouse.wheel(0, 600); pg.wait_for_timeout(300)
    check("scrolled" in pg.get_attribute("#topbar", "class"), "barra in alto compatta durante lo scorrimento")
    check(pg.locator("#tbTitle").inner_text() == "Oggi", "titolo della pagina nella barra")

    # scorciatoia da tastiera
    pg.set_viewport_size({"width": 1280, "height": 860}); pg.wait_for_timeout(100)
    pg.keyboard.press("/"); pg.wait_for_timeout(200)
    check(pg.locator(".sheet-wrap").count() == 1 and pg.evaluate("document.activeElement.id") == "q-globale", "il tasto / apre la ricerca")
    pg.keyboard.press("Escape")
    vis = pg.evaluate("[...document.querySelectorAll('#tabs > *')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.textContent.trim())")
    check(vis[0].startswith("Barista Flow") and "Nuova registrazione" in vis[1] and vis[-1] == "Impostazioni", f"barra laterale desktop {vis}")
    br.close()

# installabile: pagina servita da un sito, senza claude.ai
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "--bind", "127.0.0.1"], cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(0.8)
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
        pg = br.new_page()
        pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        pg.goto("http://localhost:8765/"); pg.wait_for_selector("#v-oggi"); pg.wait_for_timeout(800)
        check(pg.evaluate("!!document.querySelector('link[rel=manifest]')"), "manifest collegato")
        man = pg.evaluate("fetch('manifest.webmanifest').then(r => r.json())")
        check(man["name"] == "Barista Flow" and len(man["icons"]) == 3, "manifest valido")
        codes = pg.evaluate("Promise.all(['icone/icon-192.png','icone/icon-512.png','icone/icon-maskable-512.png','icone/icon-180.png','icone/icon.svg','sw.js'].map(u => fetch(u).then(r => r.status)))")
        check(codes == [200] * 6, f"icone e service worker raggiungibili {codes}")
        reg = pg.evaluate("navigator.serviceWorker.ready.then(r => !!r.active)")
        check(reg, "lavoro senza rete attivo (service worker)")
        pg.reload(); pg.wait_for_selector("#v-oggi")
        check("solo in questo browser" in pg.locator("main").inner_text(), "fuori da claude.ai i dati restano nel browser")
        br.close()
finally:
    srv.terminate()

print("\nERRORI:" if errors else "\nNessun errore in console")
for e in errors: print("  ", e)
print(f"{len(fails)} controlli falliti")
sys.exit(1 if fails or errors else 0)
