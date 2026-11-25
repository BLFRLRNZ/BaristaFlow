import json, pathlib, sys, re
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

mock = MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEEDS)).replace("__CAN__", "true").replace("__DBNULL__", "false").replace("window.__downloads.push({filename})", "window.__downloads.push({filename, data})")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT")
    pg = ctx.new_page()
    pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00")
    pg.add_init_script(mock)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)

    # --- Oggi: avvisi di rincaro
    pg.goto(URL); pg.wait_for_selector("#v-oggi"); pg.wait_for_timeout(300)
    da = [T(x) for x in pg.locator("#todo .row").all_inner_texts()]
    rin = [x for x in da if "Rincaro" in x]
    check(len(rin) == 2 and "Nocciole tostate" in rin[0] and "+9,8%" in rin[0] and "Uova" in rin[1] and "+8,7%" in rin[1], f"avvisi rincaro in Oggi {rin}")

    # --- Prezzi: riepilogo 3 mesi
    pg.goto(URL + "#prezzi"); pg.wait_for_selector("#v-prezzi"); pg.wait_for_timeout(200)
    check(pg.locator('#tabs a[data-tab=acquisti][aria-current=page]').count() == 1, "scheda Acquisti evidenziata")
    fnd = T(pg.locator(".finding").inner_text())
    check(fnd == "Negli ultimi 3 mesi hai speso 19,18 € in più rispetto ai prezzi di inizio periodo: il rincaro che pesa di più è Nocciole tostate (+7,80 €).", f"frase riassuntiva: {fnd!r}")
    stats = [T(x) for x in pg.locator(".stat b").all_inner_texts()]
    check(stats == ["+19,18 €", "5", "1"], f"indicatori {stats}")
    rows = [T(x) for x in pg.locator("main h2:has-text('Prodotti') ~ .list").first.locator(".row").all_inner_texts()]
    check(rows[0].startswith("Nocciole tostate") and "+7,80 € spesi in più" in rows[0] and "▲ +16,1%" in rows[0], f"prima riga nocciole: {rows[0]!r}")
    check(rows[-1].startswith("Zucchero") and "2,20 € risparmiati" in rows[-1] and "▼ −12%" in rows[-1], f"ultima riga zucchero: {rows[-1]!r}")
    check(pg.locator("main .row .spark").count() >= 6, "minigrafici nelle righe")
    imp = [T(x) for x in pg.locator("main h2:has-text('Costo delle schede') + p + .list .row").all_inner_texts()]
    check(len(imp) == 3 and "Tartellette" in imp[0] and "+9%" in imp[0] and "Biscotti" in imp[1] and "+7,7%" in imp[1] and "Food cost 9,7% → 10,5%" in imp[1] and "Crema" in imp[2] and "+6,5%" in imp[2], f"impatto schede {imp}")
    pg.screenshot(path=str(SHOTS / "m_prezzi.png"), full_page=True)
    # periodo 12 mesi
    pg.locator("main .seg button", has_text="12 mesi").click(); pg.wait_for_timeout(150)
    fnd12 = T(pg.locator(".finding").inner_text())
    check(fnd12.startswith("Negli ultimi 12 mesi hai speso") and "ai prezzi di inizio periodo" in fnd12, f"12 mesi: {fnd12!r}")
    pg.locator("main .seg button", has_text="3 mesi").click(); pg.wait_for_timeout(100)

    # --- storico burro con due fornitori
    pg.locator("main .row", has_text="Burro").first.click(); pg.wait_for_timeout(400)
    sh = pg.locator(".sheet-wrap").last
    check(sh.locator(".fig svg circle.pt").count() == 6, f"6 acquisti nel grafico ({sh.locator('.fig svg circle.pt').count()})")
    check(sh.locator(".fig svg path.ln").count() == 1 and sh.locator(".fig svg circle.pt.c1").count() == 1, "linea per Latteria, punto singolo per l'altro fornitore")
    leg = sh.locator(".legend").inner_text()
    check("Latteria Val Verde" in leg and "Dolciaria Ingrosso" in leg, "legenda con i due fornitori")
    kv = T(sh.locator(".kv").inner_text())
    check("Ultimo prezzo al kg\n9,00 €" in kv and "uguale" in kv and "7,90–9,00 €" in kv, f"riquadri burro {kv!r}")
    check("Il più conveniente" in sh.locator(".list .row", has_text="Dolciaria Ingrosso").inner_text(), "fornitore più conveniente")
    trows = sh.locator(".tbl tbody tr").count()
    check(trows == 6, f"tabella con 6 acquisti ({trows})")
    box = sh.locator(".fig").bounding_box()
    pg.mouse.move(box["x"] + box["width"] * 0.62, box["y"] + box["height"] / 2); pg.wait_for_timeout(100)
    tip = T(sh.locator(".fig .tip").inner_text())
    check(not sh.locator(".fig .tip").is_hidden() and "€ al kg" in tip, f"tooltip al passaggio: {tip!r}")
    sh.locator(".fig").focus(); pg.keyboard.press("End"); pg.wait_for_timeout(80)
    tip = T(sh.locator(".fig .tip").inner_text())
    check(tip.startswith("21/11/2026") and "9,00 € al kg" in tip and "Latteria Val Verde" in tip, f"tooltip da tastiera: {tip!r}")
    pg.keyboard.press("ArrowLeft"); pg.keyboard.press("ArrowLeft"); pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(80)
    tip = T(sh.locator(".fig .tip").inner_text())
    check(tip.startswith("10/09/2026") and "8,10 € al kg" in tip and "Dolciaria Ingrosso" in tip, f"tooltip acquisto da altro fornitore: {tip!r}")
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(SHOTS / "m_prezzi_burro.png"), full_page=False)
    sh.locator(".sh-body").evaluate("e => e.scrollTop = 99999"); pg.wait_for_timeout(100)
    pg.screenshot(path=str(SHOTS / "m_prezzi_burro_tabella.png"), full_page=False)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(100)

    # --- articolo: riga prezzi
    pg.goto(URL + "#magazzino"); pg.wait_for_selector("#v-magazzino"); pg.wait_for_timeout(200)
    bur = T(pg.locator("main .row", has_text="Burro").inner_text())
    check("2 lotti in giacenza" in bur, f"le fatture solo prezzi non creano lotti: {bur!r}")
    pg.locator("main .row", has_text="Nocciole").click(); pg.wait_for_timeout(300)
    pr = T(pg.locator(".sheet .row", has_text="Ultimo").inner_text())
    check("Ultimo 18,00 € al kg" in pr and "prima 16,40 €" in pr and "+9,8% sul precedente" in pr, f"riga prezzi articolo {pr!r}")
    pg.keyboard.press("Escape")

    # --- fattura vecchia solo per lo storico
    pg.goto(URL + "#acquisti"); pg.wait_for_selector("#v-acquisti"); pg.wait_for_timeout(150)
    pg.locator("main .btn.pri", has_text="Registra documento").click(); pg.wait_for_timeout(200)
    pg.fill(".sheet [data-k=numero]", "455")
    pg.fill(".sheet [data-k=data]", "2026-05-15")
    pg.select_option(".sheet [data-k=fornitoreId]", "f-molino")
    pg.locator(".sheet [data-k=soloPrezzi]").check(); pg.wait_for_timeout(100)
    check(pg.locator(".sheet [data-k='righe.0.lotto']").is_hidden(), "lotto e scadenza nascosti se solo prezzi")
    pg.select_option(".sheet [data-k='righe.0.articoloId']", "a-farina")
    pg.fill(".sheet [data-k='righe.0.qta']", "25")
    pg.locator(".sheet .btn.pri").click(); pg.wait_for_timeout(150)
    check("serve l'importo" in pg.locator("#ferr").inner_text(), "importo obbligatorio per lo storico")
    pg.fill(".sheet [data-k='righe.0.importo']", "20,00")
    pg.locator(".sheet .btn.pri").click(); pg.wait_for_timeout(300)
    check(pg.locator(".sheet-wrap").count() == 0, "fattura storica salvata")
    check(pg.locator("main .row", has_text="Fattura n. 455").locator(".chip", has_text="Solo storico prezzi").count() == 1, "etichetta solo storico prezzi")
    pg.goto(URL + "#magazzino"); pg.wait_for_selector("#v-magazzino"); pg.wait_for_timeout(150)
    far = T(pg.locator("main .row", has_text="Farina 00").inner_text())
    check("24,2 kg" in far and "1 lotto" in far, f"giacenza farina invariata: {far!r}")

    # --- DDT con fattura collegata
    pg.goto(URL + "#acquisti"); pg.wait_for_selector("#v-acquisti"); pg.wait_for_timeout(150)
    pg.locator("main .row", has_text="DDT n. 452").click(); pg.wait_for_timeout(250)
    pg.locator(".sheet .btn.pri", has_text="Modifica documento").click(); pg.wait_for_timeout(200)
    f = pg.locator(".sheet-wrap").last
    f.locator("[data-k=fatturaRif]").fill("n. 1203 del 30/11")
    f.locator(".btn.pri").click(); pg.wait_for_timeout(300)
    check("Fattura collegata: n. 1203 del 30/11" in pg.locator(".sheet").inner_text(), "fattura collegata nel DDT")
    pg.keyboard.press("Escape")
    pg.goto(URL + "#oggi"); pg.wait_for_selector("#v-oggi"); pg.wait_for_timeout(200)
    pg.locator(".lab", has_text="TAR-241126-1").click(); pg.wait_for_timeout(300)
    check("fattura n. 1203 del 30/11" in pg.locator(".sheet").inner_text(), "fattura collegata visibile nella tracciabilità")
    pg.keyboard.press("Escape")

    # --- soglia rincari
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#v-impostazioni")
    pg.fill("#cfg-sr", "9")
    pg.locator("main .btn.pri", has_text="Salva impostazioni").click(); pg.wait_for_timeout(250)
    pg.goto(URL + "#oggi"); pg.wait_for_selector("#v-oggi"); pg.wait_for_timeout(200)
    rin = [x for x in pg.locator("#todo .row").all_inner_texts() if "Rincaro" in x]
    check(len(rin) == 1 and "Nocciole" in rin[0], f"con soglia 9% resta solo nocciole {len(rin)}")

    # --- CSV dello storico
    pg.goto(URL + "#prezzi"); pg.wait_for_selector("#v-prezzi"); pg.wait_for_timeout(150)
    pg.locator("main .btn", has_text="Esporta CSV").click(); pg.wait_for_timeout(150)
    csv = [d for d in pg.evaluate("window.__downloads") if d["filename"].startswith("Storico prezzi")][0]["data"]
    check("Burro;12/06/2026;Latteria Val Verde;Fattura n. 512 del 12/06/2026;5;kg;39,5;7,9" in csv, "CSV storico prezzi")

    # --- desktop e scuro
    pg.set_viewport_size({"width": 1280, "height": 900})
    pg.goto(URL + "#prezzi"); pg.wait_for_selector("#v-prezzi"); pg.wait_for_timeout(250)
    pg.screenshot(path=str(SHOTS / "d_prezzi.png"), full_page=False)
    pg.locator("main .row", has_text="Uova").first.click(); pg.wait_for_timeout(400)
    sh = pg.locator(".sheet-wrap").last
    box = sh.locator(".fig").bounding_box()
    pg.mouse.move(box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.5); pg.wait_for_timeout(120)
    pg.screenshot(path=str(SHOTS / "d_prezzi_uova.png"), full_page=False)
    pg.keyboard.press("Escape")
    pg.evaluate("document.documentElement.dataset.theme = 'dark'")
    pg.locator("main .row", has_text="Burro").first.click(); pg.wait_for_timeout(400)
    pg.screenshot(path=str(SHOTS / "d_prezzi_burro_dark.png"), full_page=False)
    pg.keyboard.press("Escape")
    pg.set_viewport_size({"width": 360, "height": 780})
    pg.goto(URL + "#prezzi"); pg.wait_for_selector("#v-prezzi"); pg.evaluate("document.documentElement.dataset.theme = 'dark'"); pg.wait_for_timeout(200)
    check(not pg.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1"), "nessuno scorrimento orizzontale a 360px")
    pg.locator("main .row", has_text="Burro").first.click(); pg.wait_for_timeout(400)
    over = pg.evaluate("(() => { const b = document.querySelector('.sheet .sh-body'); return b.scrollWidth > b.clientWidth + 1; })()")
    check(not over, "foglio prezzi senza scorrimento orizzontale a 360px")
    pg.screenshot(path=str(SHOTS / "m360_prezzi_burro_dark.png"), full_page=False)
    br.close()

print("\nERRORI:" if errors else "\nNessun errore in console")
for e in errors: print("  ", e)
print(f"{len(fails)} controlli falliti")
sys.exit(1 if fails or errors else 0)
