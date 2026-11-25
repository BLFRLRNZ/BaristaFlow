"""Benvenuto, dati di esempio in tutte le sezioni, prova, registrazione del bar e primi passi."""
import json, pathlib, sys, subprocess
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from mock import MOCK_TEMPLATE

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / "index.html").as_uri()
SHOTS = ROOT / "test" / "screenshot"; SHOTS.mkdir(exist_ok=True)
fails, errors = [], []
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)
T = lambda s: s.replace(" ", " ").replace(" ", " ")
COUNT = "Object.values(window.__store).reduce((s, c) => s + Object.keys(c).length, 0)"
SAMPLE = "Object.values(window.__store).flatMap(c => Object.values(c)).filter(x => x.esempio).length"

def newpage(br, mock, w=390, h=844, scheme="light"):
    ctx = br.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", color_scheme=scheme, has_touch=w < 900)
    pg = ctx.new_page()
    pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00")
    if mock: pg.add_init_script(mock)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    return ctx, pg

def shot(pg, name, full=True):
    pg.wait_for_timeout(350)
    pg.screenshot(path=str(SHOTS / f"{name}.png"), full_page=full)

empty = MOCK_TEMPLATE.replace("__SEEDS__", "{}").replace("__CAN__", "true").replace("__DBNULL__", "false")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])

    # 1. primo avvio su claude.ai: benvenuto con le due scelte
    ctx, pg = newpage(br, empty)
    pg.goto(URL); pg.wait_for_selector("#v-oggi .welcome"); pg.wait_for_timeout(200)
    opts = [T(x) for x in pg.locator(".wl-opts .qa b").all_inner_texts()]
    check(opts == ["Esplora con i dati di esempio", "Registra il tuo bar"], f"scelte del benvenuto {opts}")
    check(pg.locator("#demoPill").is_hidden() and pg.locator(".tiles").count() == 0, "benvenuto senza indicatori né avviso di prova")
    shot(pg, "e_benvenuto")

    # 2. carica il bar di esempio
    pg.locator(".wl-opts .qa", has_text="Esplora").click()
    pg.wait_for_function(f"{COUNT} > 400 && !document.querySelector('.sheet-wrap')", timeout=30000)
    pg.wait_for_selector("#v-oggi .demo"); pg.wait_for_timeout(500)
    n0 = pg.evaluate(SAMPLE); total = pg.evaluate(COUNT)
    check(n0 == total and n0 > 400, f"caricati {n0} elementi, tutti segnati come esempio")
    counts = pg.evaluate("Object.fromEntries(Object.entries(window.__store).map(([c, v]) => [c, Object.keys(v).length]))")
    check(counts["fornitori"] == 9 and counts["articoli"] == 34 and counts["ricette"] == 10 and counts["produzioni"] > 60 and counts["documenti"] > 120 and counts["movimenti"] > 150, f"tutte le raccolte riempite {counts}")
    tiles = [int(x) for x in pg.locator(".tile b").all_inner_texts()]
    check(tiles[0] >= 1 and tiles[1] >= 3 and tiles[2] >= 2 and tiles[3] == 3, f"indicatori di Oggi {tiles}")
    check(pg.locator(".lab").count() >= 6, f"etichette in vetrina {pg.locator('.lab').count()}")
    todo = T(pg.locator("#todo").inner_text())
    check("Smaltisci" in todo and "Riordina" in todo and "Rincaro" in todo, "da fare: smaltire, riordinare, rincari")
    check(pg.locator("#demoPill").is_visible() and pg.locator("#sync").is_hidden(), "in alto: dati di esempio")
    check(T(pg.locator("#demoPill").inner_text()) == "Esempio" and pg.locator("#topbar .tb-names b").bounding_box()["height"] < 26, "sul telefono la pillola è corta e il nome resta su una riga")
    more = pg.locator("#todo .row", has_text="Altri")
    check(more.count() == 1 and "in scadenza" in more.inner_text(), "le scadenze in più sono raccolte in una riga")
    n_rows = pg.locator("#todo .row").count()
    oggi_n = pg.locator("#g-oggi .row").count()
    shot(pg, "e_oggi")
    more.click(); pg.wait_for_timeout(150)
    check(pg.locator("#todo .row").count() == n_rows - 1 + (tiles[1] - oggi_n) - 4, "toccando si vede tutto l'elenco")
    check(pg.locator(".steps").count() == 0, "niente primi passi durante la prova")

    # 3. ogni sezione ha dati
    def section(hash_, sel, name, minimo):
        pg.goto(URL + "#" + hash_); pg.wait_for_selector("#v-" + hash_); pg.wait_for_timeout(200)
        n = pg.locator(sel).count()
        check(n >= minimo, f"{hash_}: {n} righe")
        shot(pg, "e_" + name)
    section("produzione", "main .list .row", "produzione", 8)
    pg.locator("main .seg button", has_text="Tutti").click(); pg.wait_for_timeout(150)
    check(pg.locator("main .list .row").count() > 60, "produzione: tutti i lotti delle quattro settimane")
    section("schede", "main .rc", "schede", 9)
    cats = [T(x) for x in pg.locator("main .bar .seg button").all_inner_texts()]
    check(cats == ["Tutte", "Dolci da forno", "Pasticceria fresca", "Salato", "Semilavorati"], f"categorie delle schede {cats}")
    pg.locator("main .lnk", has_text="archiviate").click(); pg.wait_for_timeout(150)
    check(pg.locator("main .rc", has_text="Torta alle nocciole").count() == 1, "una scheda archiviata")
    pg.locator("main .lnk", has_text="attive").click()
    section("magazzino", "main .list .row", "magazzino", 30)
    pg.locator("main .seg button", has_text="Prodotti").click(); pg.wait_for_timeout(150)
    check(pg.locator("main .grp").count() >= 5, "magazzino: prodotti in giacenza")
    section("acquisti", "main .list .row", "acquisti", 120)
    acq = T(pg.locator("main .list").inner_text())
    check("Prezzi da inserire" in acq and "Solo storico prezzi" in acq and "Inventario iniziale" in acq and "Scontrino" in acq and "fattura n. " in acq, "acquisti: DDT senza prezzi, storico, inventario, scontrini, fattura collegata")
    section("prezzi", "main .list .row", "prezzi", 25)
    check("in più" in pg.locator(".finding").inner_text(), "prezzi: si spende di più")
    for per in ["6 mesi", "12 mesi", "Tutto"]:
        pg.locator("main .seg button", has_text=per).click(); pg.wait_for_timeout(120)
    check(pg.locator("main .list").nth(1).locator(".row").count() >= 5, "prezzi: costo delle schede che cambia")
    section("fornitori", "main .list .row", "fornitori", 9)

    # 4. grafico dei prezzi del burro con due fornitori
    pg.goto(URL + "#prezzi"); pg.wait_for_selector("#v-prezzi")
    pg.locator("main .row", has_text="Burro").first.click(); pg.wait_for_timeout(400)
    leg = T(pg.locator(".sheet .legend").inner_text())
    check("Latteria Val Verde" in leg and "Cash & Carry Centro" in leg, f"grafico burro con due fornitori: {leg!r}")
    check(pg.locator(".sheet .fig .ln").count() >= 1 and pg.locator(".sheet .fig .pt").count() >= 15, "linea e punti del grafico")
    box = pg.locator(".sheet .fig").bounding_box()
    pg.mouse.move(box["x"] + box["width"] * .8, box["y"] + box["height"] * .5); pg.wait_for_timeout(150)
    check(pg.locator(".sheet .tip").is_visible(), "suggerimento al passaggio")
    shot(pg, "e_grafico_burro", full=False)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)

    # 5. tracciabilità di un lotto di oggi: tartellette con crema e frolla
    pg.goto(URL + "#oggi"); pg.wait_for_selector("#v-oggi .demo")
    pg.locator(".lab", has_text="TAR-241126-1").click(); pg.wait_for_timeout(400)
    body = T(pg.locator(".sheet .sh-body").inner_text())
    check("Crema pasticcera" in body and "Pasta frolla" in body and "CRE-" in body and "FRO-" in body, "tartellette: semilavorati con il loro lotto")
    check("LV-" in body and "Latteria Val Verde" in body, "dentro i semilavorati i lotti della latteria")
    shot(pg, "e_lotto", full=False)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)

    # 6. durante la prova quello che inserisci è di prova
    pg.locator(".fab").click(); pg.wait_for_timeout(250)
    pg.locator(".sheet .qa", has_text="Fornitore").click(); pg.wait_for_timeout(250)
    pg.fill(".sheet [data-k=nome]", "Forno Prova"); pg.locator(".sheet .btn.pri").click(); pg.wait_for_timeout(300)
    mine = pg.evaluate("Object.values(window.__store.fornitori).filter(f => f.nome === 'Forno Prova').map(f => f.esempio)")
    check(mine == [True], f"fornitore della prova segnato come esempio {mine}")

    # 7. scheda informativa e «riporta a oggi»
    pg.locator("#demoPill").click(); pg.wait_for_timeout(300)
    check("bar di esempio" in pg.locator(".sheet .sh-body").inner_text(), "la pillola spiega la prova")
    pg.locator(".sheet .btn", has_text="Riporta a oggi").click(); pg.wait_for_timeout(200)
    pg.locator(".sheet-wrap").last.locator(".btn.pri", has_text="Riporta a oggi").click()
    pg.wait_for_function(f"!Object.values(window.__store.fornitori).some(f => f.nome === 'Forno Prova') && !document.querySelector('.sheet-wrap')", timeout=30000)
    pg.wait_for_timeout(400)
    check(pg.evaluate(SAMPLE) == n0 and pg.evaluate(COUNT) == n0, "esempi rimessi come all'inizio")

    # 8. registrazione del bar: cancella gli esempi
    pg.goto(URL + "#oggi"); pg.wait_for_selector("#v-oggi .demo")
    pg.locator(".demo .btn", has_text="Registra il tuo bar").click(); pg.wait_for_timeout(300)
    check(str(n0) in pg.locator(".sheet .note").inner_text(), "il modulo avvisa quanti dati di prova cancella")
    pg.locator(".sheet .btn.pri").click(); pg.wait_for_timeout(150)
    check("nome del bar" in pg.locator("#ferr").inner_text(), "il nome è obbligatorio")
    pg.fill(".sheet [data-k=nome]", "Bar Aurora"); pg.fill(".sheet [data-k=indirizzo]", "Via Roma 1, Cittanova"); pg.fill(".sheet [data-k=piva]", "01234567890")
    shot(pg, "e_registrazione", full=False)
    pg.locator(".sheet .btn.pri", has_text="Registra e inizia").click()
    pg.wait_for_function(f"{COUNT} === 1 && !document.querySelector('.sheet-wrap')", timeout=30000)
    pg.wait_for_selector("#v-oggi .steps"); pg.wait_for_timeout(300)
    g = pg.evaluate("window.__store.impostazioni.generale")
    check(g["nome"] == "Bar Aurora" and g["indirizzo"] == "Via Roma 1, Cittanova" and g["piva"] == "01234567890" and g["registrato"] > 0, f"impostazioni registrate {g}")
    check(T(pg.locator("#bizName").inner_text()) == "Bar Aurora" and pg.locator("#demoPill").is_hidden() and pg.locator(".demo").count() == 0, "dopo la registrazione: nome in alto, niente prova")
    tb = pg.locator(".toast").last.bounding_box()
    check(tb is not None and tb["x"] >= 0 and tb["x"] + tb["width"] <= 390, f"l'avviso lungo resta dentro lo schermo {tb}")
    steps = pg.locator(".steps .row b").all_inner_texts()
    check(steps == ["Aggiungi i fornitori", "Carica la merce che hai già", "Crea la prima scheda tecnica", "Registra la prima produzione"], f"primi passi {steps}")
    shot(pg, "e_primi_passi")

    # 9. primi passi: inventario iniziale precompilato, avanzamento, nascondi
    pg.locator(".steps .row", has_text="Carica la merce").click(); pg.wait_for_timeout(300)
    check(pg.locator(".sheet [data-act=fseg][data-v=inventario]").get_attribute("aria-pressed") == "true", "inventario iniziale già scelto")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    pg.locator(".steps .row", has_text="Aggiungi i fornitori").click(); pg.wait_for_timeout(250)
    pg.fill(".sheet [data-k=nome]", "Molino Rossi"); pg.locator(".sheet .btn.pri").click(); pg.wait_for_timeout(300)
    check(pg.locator(".steps .chip").inner_text() == "1 di 4" and pg.locator(".steps .row.done").count() == 1, "un passo fatto")
    check(pg.evaluate("Object.values(window.__store.fornitori)[0].esempio") is None, "dopo la registrazione i dati sono tuoi")
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#v-impostazioni")
    check(pg.locator("#cfg-nome").input_value() == "Bar Aurora" and pg.locator("main .btn", has_text="Carica i dati di esempio").count() == 0, "impostazioni: dati del bar, niente esempi con dati propri")
    pg.goto(URL + "#oggi"); pg.wait_for_selector("#v-oggi .steps")
    pg.locator(".steps .lnk", has_text="Nascondi").click(); pg.wait_for_timeout(200)
    check(pg.locator(".steps").count() == 0, "primi passi nascosti")
    ctx.close()

    # 10. fuori da claude.ai (GitHub Pages): esempi nel browser, restano dopo il ricaricamento
    ctx, pg = newpage(br, None)
    pg.goto(URL); pg.wait_for_selector("#v-oggi .welcome")
    pg.locator(".wl-opts .qa", has_text="Esplora").click()
    pg.wait_for_selector("#v-oggi .demo", timeout=10000); pg.wait_for_timeout(300)
    stored = pg.evaluate("(() => { const s = JSON.parse(localStorage.getItem('barista-flow-v1')); return Object.values(s).reduce((t, c) => t + Object.keys(c).length, 0); })()")
    kb = pg.evaluate("localStorage.getItem('barista-flow-v1').length / 1024")
    check(stored > 400 and kb < 600, f"esempi salvati nel browser: {stored} elementi, {kb:.0f} KB")
    pg.reload(); pg.wait_for_selector("#v-oggi .demo"); pg.wait_for_timeout(300)
    check(pg.locator(".lab").count() >= 6, "dopo il ricaricamento gli esempi ci sono ancora")
    pg.evaluate("window.scrollTo(0, 400)"); pg.wait_for_timeout(300)
    check(pg.evaluate("getComputedStyle(document.getElementById('demoPill')).opacity") == "0", "scorrendo, la pillola lascia spazio al titolo")
    shot(pg, "e_locale_scorrimento", full=False)
    pg.evaluate("window.scrollTo(0, 0)")
    pg.locator("#demoPill").click(); pg.wait_for_timeout(250)
    pg.locator(".sheet .btn.pri", has_text="Registra il tuo bar").click(); pg.wait_for_timeout(300)
    pg.fill(".sheet [data-k=nome]", "Caffè Centrale"); pg.locator(".sheet .btn.pri").click(); pg.wait_for_timeout(600)
    left = pg.evaluate("Object.entries(JSON.parse(localStorage.getItem('barista-flow-v1'))).filter(([c, v]) => Object.keys(v).length).map(([c]) => c)")
    check(left == ["impostazioni"], f"nel browser resta solo la registrazione {left}")
    ctx.close()

    # 11. importare un backup durante la prova lo sostituisce agli esempi
    ctx, pg = newpage(br, empty)
    pg.goto(URL); pg.wait_for_selector("#v-oggi .welcome")
    pg.locator(".wl-opts .qa", has_text="Esplora").click()
    pg.wait_for_function(f"{COUNT} > 400 && !document.querySelector('.sheet-wrap')", timeout=30000)
    bk = ROOT / "test" / "screenshot" / "backup-prova.json"
    bk.write_text(json.dumps({"app": "barista-flow", "versione": 1, "dati": {"fornitori": [{"id": "f1", "nome": "Fornitore del backup", "creato": 1}]}}), encoding="utf-8")
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#v-impostazioni")
    pg.set_input_files("input[data-file=import]", str(bk)); pg.wait_for_timeout(300)
    check("cancello" in pg.locator(".sheet .sh-body").inner_text(), "avvisa che gli esempi vengono cancellati")
    pg.locator(".sheet .btn.dan", has_text="Cancella esempi e importa").click()
    pg.wait_for_function(f"{COUNT} === 1", timeout=30000); pg.wait_for_timeout(300)
    f1 = pg.evaluate("window.__store.fornitori.f1")
    check(f1 and f1["nome"] == "Fornitore del backup" and "esempio" not in f1, f"backup importato senza segni di prova {f1}")
    ctx.close()

    # 12. telefono 360 px in tema scuro e computer, con gli esempi
    for (w, h, scheme, name) in [(360, 780, "dark", "e_m360_scuro"), (1280, 860, "light", "e_d_oggi"), (1280, 860, "dark", "e_d_prezzi_scuro")]:
        ctx, pg = newpage(br, empty, w, h, scheme)
        pg.goto(URL); pg.wait_for_selector("#v-oggi .welcome")
        pg.locator(".wl-opts .qa", has_text="Esplora").click()
        pg.wait_for_function(f"{COUNT} > 400 && !document.querySelector('.sheet-wrap')", timeout=30000)
        pg.wait_for_selector("#v-oggi .demo")
        if "prezzi" in name:
            pg.goto(URL + "#prezzi"); pg.wait_for_selector("#v-prezzi")
        over = pg.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
        check(not over, f"{name}: nessuno scorrimento orizzontale")
        shot(pg, name, full=w < 900)
        ctx.close()

    # 13. sola lettura con archivio vuoto: niente benvenuto con pulsanti
    ctx, pg = newpage(br, MOCK_TEMPLATE.replace("__SEEDS__", "{}").replace("__CAN__", "false").replace("__DBNULL__", "false"))
    pg.goto(URL); pg.wait_for_selector("#v-oggi"); pg.wait_for_timeout(300)
    check(pg.locator(".welcome").count() == 0, "sola lettura: nessun benvenuto")
    ctx.close()
    br.close()

print("\nERRORI CONSOLE:" if errors else "\nNessun errore in console")
for e in errors: print("  ", e)
print(f"\n{len(fails)} controlli falliti")
sys.exit(1 if fails or errors else 0)
