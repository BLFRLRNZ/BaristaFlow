import json, pathlib, sys, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from mock import MOCK_TEMPLATE

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEEDS = json.loads((ROOT / "esempi" / "dati-esempio.json").read_text(encoding="utf-8"))
URL = (ROOT / "index.html").as_uri()
fails, errors = [], []
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)

def newpage(br, mock):
    ctx = br.new_context(viewport={"width": 390, "height": 844}, timezone_id="Europe/Rome", locale="it-IT")
    pg = ctx.new_page()
    pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00")
    if mock: pg.add_init_script(mock)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    return ctx, pg

with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])

    # 1. sola lettura
    ctx, pg = newpage(br, MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEEDS)).replace("__CAN__", "false").replace("__DBNULL__", "false"))
    pg.goto(URL); pg.wait_for_selector("text=La giornata al banco"); pg.wait_for_timeout(300)
    check(pg.locator("main .btn.pri:visible").count() == 0, "sola lettura: nessun pulsante di creazione")
    check(pg.locator("#sync").inner_text() == "Sola lettura", "sola lettura indicata in alto")
    pg.locator(".lab", has_text="CRE-231126-1").click(); pg.wait_for_timeout(300)
    check(pg.locator(".sheet .sh-foot").is_hidden(), "sola lettura: nessuna azione nel lotto")
    check(pg.locator(".sheet .btn.dan:visible").count() == 0, "sola lettura: niente Elimina")
    ctx.close()

    # 2. archivio non disponibile (prova)
    ctx, pg = newpage(br, MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEEDS)).replace("__CAN__", "true").replace("__DBNULL__", "true"))
    pg.goto(URL); pg.wait_for_selector("text=La giornata al banco"); pg.wait_for_timeout(300)
    check("non viene salvato" in pg.locator("main").inner_text(), "prova: avviso dati non salvati")
    check(pg.locator("#sync").inner_text() == "Prova: non salva", "prova: stato in alto")
    ctx.close()

    # 3. fuori da claude.ai: dati nel browser, persistono al ricaricamento
    ctx, pg = newpage(br, None)
    pg.goto(URL); pg.wait_for_selector("text=La giornata al banco"); pg.wait_for_timeout(300)
    check("solo in questo browser" in pg.locator("main").inner_text(), "locale: avviso dati nel browser")
    pg.goto(URL + "#acquisti"); pg.wait_for_selector("text=Acquisti")
    pg.locator("main .btn", has_text="Nuovo fornitore").click()
    pg.fill(".sheet [data-k=nome]", "Forno Rossi")
    pg.locator(".sheet .btn.pri").click(); pg.wait_for_timeout(200)
    pg.reload(); pg.wait_for_selector("text=Acquisti"); pg.locator("main .seg button", has_text="Fornitori").click()
    check(pg.locator("main .row", has_text="Forno Rossi").count() == 1, "locale: fornitore salvato dopo il ricaricamento")
    ctx.close()

    # 4. casi limite con dati di esempio
    ctx, pg = newpage(br, MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEEDS)).replace("__CAN__", "true").replace("__DBNULL__", "false"))
    pg.goto(URL + "#acquisti"); pg.wait_for_selector("text=Acquisti"); pg.wait_for_timeout(300)
    pg.locator("main .row", has_text="Fattura n. 889").click(); pg.wait_for_timeout(250)
    pg.locator(".sheet .btn.dan", has_text="Elimina documento").click(); pg.wait_for_timeout(200)
    check("già stati usati" in pg.locator("#toast").inner_text(), "non si elimina un documento con lotti usati")
    pg.locator(".sheet .btn.pri", has_text="Modifica documento").click(); pg.wait_for_timeout(250)
    form = pg.locator(".sheet-wrap").nth(1)
    form.locator("[data-k='righe.1.qta']").fill("5")
    form.locator(".btn.pri").click(); pg.wait_for_timeout(200)
    check("non può essere minore" in form.locator("#ferr").inner_text(), "quantità sotto il già usato rifiutata")
    form.locator("[data-k='righe.1.qta']").fill("100")
    form.locator(".btn.pri").click(); pg.wait_for_timeout(300)
    uova = pg.evaluate("window.__store.documenti['d-fatt889'].righe[1].qta")
    check(uova == 100, f"modifica quantità salvata ({uova})")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(100)
    # crema usata come ingrediente: non eliminabile
    pg.goto(URL + "#produzione"); pg.wait_for_selector("text=Produzione"); pg.wait_for_timeout(200)
    pg.locator("main .row", has_text="CRE-231126-1").click(); pg.wait_for_timeout(250)
    pg.locator(".sheet .btn.dan", has_text="Elimina lotto").click(); pg.wait_for_timeout(200)
    check("ingrediente di" in pg.locator("#toast").inner_text(), "lotto semilavorato usato non eliminabile")
    pg.keyboard.press("Escape")
    # produzione con giacenza insufficiente
    pg.locator("main .btn.pri", has_text="Nuova produzione").click()
    pg.select_option(".sheet [data-k=ricettaId]", "r-tartellette"); pg.wait_for_timeout(150)
    pg.fill(".sheet [data-k=qta]", "40"); pg.wait_for_timeout(450)
    crema_chip = pg.locator(".sheet .card", has_text="Crema pasticcera").locator("[id^=sum-]").inner_text().replace(" ", " ")
    check(crema_chip == "Mancano 600 g", f"manca crema: {crema_chip!r}")
    check(pg.locator("#forza").is_visible(), "compare 'Registra comunque'")
    pg.locator(".sheet .btn.pri", has_text="Registra lotto").click(); pg.wait_for_timeout(150)
    check("Mancano: Crema pasticcera (600 g)" in pg.locator("#ferr").inner_text(), "errore con quantità mancanti")
    pg.locator("#forza input").check()
    pg.locator(".sheet .btn.pri", has_text="Registra lotto").click(); pg.wait_for_timeout(400)
    body = pg.locator(".sheet .sh-body").inner_text()
    check("TAR-241126-2" in body and "Usato senza un lotto registrato" in body, "lotto salvato con quantità senza lotto")
    pid = [w for w in pg.evaluate("window.__writes") if w[1] == "produzioni"][-1][2]
    cons = pg.evaluate(f"window.__store.produzioni['{pid}'].consumi")
    nolot = [c for c in cons if c["lotId"] is None]
    check(len(nolot) == 1 and abs(nolot[0]["qta"] - 0.6) < 1e-9 and nolot[0]["refId"] == "r-crema", f"consumo senza lotto registrato {nolot}")
    crema_res = pg.evaluate("(() => { const p = window.__store.produzioni; let used = 0; for (const x of Object.values(p)) for (const c of x.consumi) if (c.lotId === 'p-cre231126') used += c.qta; return 1.2 - used; })()")
    check(abs(crema_res) < 1e-9, f"crema esaurita dopo la produzione ({crema_res})")
    pg.keyboard.press("Escape")
    # scarico per articolo su più lotti (FEFO) e rettifica di un lotto
    pg.goto(URL + "#magazzino"); pg.wait_for_selector("text=Magazzino"); pg.wait_for_timeout(200)
    pg.locator("main .row", has_text="Burro").click(); pg.wait_for_timeout(250)
    pg.locator(".sheet .btn.pri", has_text="Registra scarico").click(); pg.wait_for_timeout(200)
    f = pg.locator(".sheet-wrap").nth(1)
    f.locator(".seg button", has_text="Scartato").click()
    f.locator("[data-k=qta]").fill("1")
    f.locator(".btn.pri").click(); pg.wait_for_timeout(400)
    movs = pg.evaluate("Object.values(window.__store.movimenti).filter(m => m.tipo === 'scarto')")
    check(sorted((m["lotId"], m["delta"]) for m in movs) == [("d-ddt401:r1", -0.75), ("d-ddt452:r1", -0.25)], f"scarto FEFO su due lotti {[(m['lotId'], m['delta']) for m in movs]}")
    pg.locator(".sheet .row", has_text="LV-3211").click(); pg.wait_for_timeout(250)
    pg.locator(".sheet-wrap").nth(1).locator(".btn.pri", has_text="Scarico o rettifica").click(); pg.wait_for_timeout(200)
    f = pg.locator(".sheet-wrap").nth(2)
    f.locator(".seg button", has_text="Rettifica").click()
    f.locator("[data-k=contata]").fill("4,5")
    f.locator(".btn.pri").click(); pg.wait_for_timeout(400)
    kv = pg.locator(".sheet-wrap").nth(1).locator(".kv").inner_text().replace(" ", " ")
    check("Residuo\n4,5 kg" in kv, f"rettifica a 4,5 kg: {kv!r}")
    # elimina il movimento di rettifica
    pg.locator(".sheet-wrap").nth(1).locator(".row", has_text="Rettifica inventario").locator(".btn", has_text="Elimina").click(); pg.wait_for_timeout(150)
    pg.locator(".sheet-wrap").last.locator(".btn.dan", has_text="Elimina movimento").click(); pg.wait_for_timeout(400)
    kv = pg.locator(".sheet-wrap").nth(1).locator(".kv").inner_text().replace(" ", " ")
    check("Residuo\n4,3 kg" in kv, f"movimento eliminato, residuo tornato: {kv!r}")
    # cicli: la crema non può contenere sé stessa
    pg.goto(URL + "#schede"); pg.wait_for_selector("text=Schede tecniche"); pg.wait_for_timeout(200)
    pg.locator(".rc", has_text="Crema pasticcera").click(); pg.wait_for_timeout(250)
    pg.locator(".sheet .btn", has_text="Modifica scheda").click(); pg.wait_for_timeout(250)
    opts = pg.locator(".sheet-wrap").nth(1).locator("[data-k='ingredienti.0.ref'] option").evaluate_all("o => o.map(x => x.value)")
    check("ric:r-crema" not in opts, "la crema non compare tra i propri ingredienti")
    pg.locator(".sheet-wrap").nth(1).locator("[data-k=nome]").fill("Crema pasticcera classica")
    pg.locator(".sheet-wrap").nth(1).locator(".sh-head [data-act=close]").click(); pg.wait_for_timeout(150)
    check(pg.locator(".sheet-wrap").last.inner_text().count("Chiudere senza salvare") == 1, "chiede conferma prima di perdere modifiche")
    pg.locator(".sheet-wrap").last.locator(".btn.dan").click(); pg.wait_for_timeout(150)
    check(pg.locator(".sheet-wrap").count() == 1, "modulo chiuso senza salvare")
    ctx.close()
    br.close()

print("\nERRORI:" if errors else "\nNessun errore in console")
for e in errors: print("  ", e)
print(f"{len(fails)} controlli falliti")
sys.exit(1 if fails or errors else 0)
