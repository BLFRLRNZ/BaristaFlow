"""Scarico delle vendite spento (Impostazioni → Vendite → «Solo scadenze»): il Banco si spegne, i lotti di produzione
restano in vetrina fino alla scadenza e poi vanno in archivio senza «da smaltire», la rivendita resta solo negli acquisti
e nei prezzi; materie prime e semilavorati si scaricano e si avvisano come sempre. Riaccendendo, tutto torna com'era."""
import json, pathlib, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from mock import MOCK_TEMPLATE

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEEDS = json.loads((ROOT / "test" / "dati-test.json").read_text(encoding="utf-8"))
P0 = SEEDS["produzioni"]["p-bis211126"]
def prod(ric, nome, lotto, data, qta, scad, unita="pz"):
    return {**P0, "lotto": lotto, "ricettaId": ric, "ricettaNome": nome, "data": data, "qta": qta, "unita": unita, "scadenza": scad, "consumi": [], "creato": P0["creato"] - 1000}
# biscotti scaduti ieri (con 10 pezzi mai scaricati), tartellette che scadono oggi, crema (semilavorato) scaduta
SEEDS["produzioni"]["p-bis181126"] = prod("r-biscotti", "Biscotti al burro", "BIS-181126-1", "2026-11-18", 10, "2026-11-23")
SEEDS["produzioni"]["p-tar221126"] = prod("r-tartellette", "Tartellette crema e nocciole", "TAR-221126-1", "2026-11-22", 8, "2026-11-24")
SEEDS["produzioni"]["p-cre201126"] = prod("r-crema", "Crema pasticcera", "CRE-201126-1", "2026-11-20", 0.5, "2026-11-22", "kg")
# acqua (rivendita) già scaduta in un lotto vecchio
SEEDS["documenti"]["d-acqvecchia"] = {"tipo": "ddt", "numero": "12", "data": "2026-09-01", "fornitoreId": SEEDS["documenti"]["d-fatt889"]["fornitoreId"], "note": "", "allegati": [], "creato": 1790000000000,
                                      "righe": [{"id": "r1", "articoloId": "a-acqua", "qta": 6, "importo": 1.5, "lotto": "A-OLD", "scadenza": "2026-11-20"}]}
URL = (ROOT / "index.html").as_uri()
SHOTS = ROOT / "test" / "screenshot"; SHOTS.mkdir(exist_ok=True)
fails, errors = [], []
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)
T = lambda s: s.replace(" ", " ").replace(" ", " ")
TILES = "[...document.querySelectorAll('#v-oggi .tiles .tile b, #v-oggi .tiles .tile .n')].map(e => e.textContent.trim())"
def gruppo(pg, gid):
    loc = pg.locator(f"#g-{gid} .row .m b")
    return [T(x) for x in loc.all_inner_texts()] if pg.locator(f"#g-{gid}").count() else []
def oggi(pg):
    pg.evaluate("location.hash = 'oggi'"); pg.wait_for_selector("#v-oggi .tiles"); pg.wait_for_timeout(300)
    return {g: gruppo(pg, g) for g in ["scaduti", "oggi", "prossimi", "scorta"]}

mock = MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEEDS)).replace("__CAN__", "true").replace("__DBNULL__", "false")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", has_touch=True)
    pg = ctx.new_page(); pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00"); pg.add_init_script(mock)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    pg.goto(URL); pg.wait_for_selector("#v-oggi .tiles"); pg.wait_for_timeout(300)

    # 1. di partenza c'è lo scarico al Banco: tutto come prima
    o = oggi(pg)
    check(sorted(o["scaduti"]) == ["Acqua naturale 0,5 l", "Biscotti al burro", "Burro", "Crema pasticcera"] and o["scorta"] == ["Acqua naturale 0,5 l"], f"con il Banco: biscotti scaduti e acqua da smaltire, acqua sotto scorta {o}")
    check(pg.locator("#v-oggi .bk-entry").count() == 1, "con il Banco: pulsante Banco in Oggi")

    # 2. Impostazioni → Vendite → «Solo scadenze»
    pg.evaluate("location.hash = 'impostazioni'"); pg.wait_for_selector("#v-impostazioni"); pg.wait_for_timeout(300)
    check([T(x) for x in pg.locator(".opt b").all_inner_texts()] == ["Scarico al Banco", "Solo scadenze"] and pg.locator("input[name=vendite][value=banco]").is_checked(), "in Impostazioni due scelte, di partenza lo scarico al Banco")
    pg.locator(".opt", has_text="Solo scadenze").click()
    check(pg.locator("#cfg-ven-nota").is_visible(), "cambiando scelta l'app ricorda di salvare")
    pg.locator(".opt", has_text="Solo scadenze").scroll_into_view_if_needed(); pg.wait_for_timeout(150)
    pg.screenshot(path=str(SHOTS / "s_impostazioni.png"))
    pg.locator("#cfgForm button[type=submit]").click(); pg.wait_for_timeout(500)
    check(pg.evaluate("window.__store.impostazioni.generale.scaricoVendite") is False and "il Banco è spento" in T(pg.locator(".toast").last.inner_text()), "salvato: scarico delle vendite spento")

    # 3. Oggi: niente Banco; prodotti in vetrina solo con la scadenza, rivendita fuori dagli avvisi
    o = oggi(pg)
    check(sorted(o["scaduti"]) == ["Burro", "Crema pasticcera"], f"da smaltire solo materie prime e semilavorati {o['scaduti']}")
    check(o["oggi"] == ["Tartellette crema e nocciole"] and "Tartellette crema e nocciole" in o["prossimi"], f"le tartellette si avvisano prima della scadenza {o['oggi']} {o['prossimi']}")
    check(o["scorta"] == [], "la rivendita non va più sotto scorta")
    check(pg.locator("#v-oggi .bk-entry").count() == 0, "niente pulsante Banco")
    lab = pg.locator("#labels .lab", has_text="BIS-211126-1")
    check(lab.count() == 1 and "Prodotti60 pz" in T(lab.locator(".lab-grid").inner_text()).replace("\n", ""), "in vetrina i biscotti con la quantità prodotta, non un residuo")
    check(pg.locator("#labels .lab", has_text="BIS-181126-1").count() == 0, "i biscotti scaduti non sono più in vetrina")
    pg.screenshot(path=str(SHOTS / "s_oggi.png"))

    # 4. Produzione: attivi e archivio
    pg.evaluate("location.hash = 'produzione'"); pg.wait_for_selector("#v-produzione"); pg.wait_for_timeout(300)
    check([x.strip() for x in pg.locator("#v-produzione .bar .seg button").all_inner_texts()] == ["Attivi", "In archivio", "Tutti"], "filtri: Attivi, In archivio, Tutti")
    row = pg.locator("#v-produzione .row", has_text="BIS-211126-1")
    check(T(row.locator(".s").inner_text()) == "60 pz\nprodotti", f"lotto attivo: quanti se ne sono prodotti {T(row.locator('.s').inner_text())!r}")
    pg.locator("#v-produzione .bar .seg button", has_text="In archivio").click(); pg.wait_for_timeout(200)
    arch = pg.locator("#v-produzione .row", has_text="BIS-181126-1")
    check(arch.count() == 1 and "In archivio" in arch.inner_text(), "i biscotti scaduti sono in archivio")
    arch.click(); pg.wait_for_timeout(400)
    body = T(pg.locator(".sheet").inner_text())
    check("In archivio" in body and "Residuo" not in body and pg.locator(".sheet .sh-foot .btn").count() == 0, "lotto in archivio: senza residuo né scarichi")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.locator("#v-produzione .bar .seg button", has_text="Attivi").click(); pg.wait_for_timeout(200)
    pg.locator("#v-produzione .row", has_text="BIS-211126-1").click(); pg.wait_for_timeout(400)
    body = T(pg.locator(".sheet").inner_text())
    check("In vetrina" in body and "Residuo" not in body and pg.locator(".sheet .sh-foot .btn").count() == 0, "lotto attivo: in vetrina fino alla scadenza, senza scarichi")
    pg.screenshot(path=str(SHOTS / "s_lotto.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # 5. Magazzino: la rivendita solo con acquisti e prezzi; i prodotti per lotti in vetrina
    pg.evaluate("location.hash = 'magazzino'"); pg.wait_for_selector("#v-magazzino"); pg.wait_for_timeout(300)
    acqua = pg.locator("#v-magazzino .row", has_text="Acqua naturale")
    check("solo acquisti e prezzi" in T(acqua.inner_text()) and "Sotto scorta" not in acqua.inner_text(), f"acqua: solo acquisti e prezzi {T(acqua.inner_text())!r}")
    acqua.click(); pg.wait_for_timeout(400)
    body = T(pg.locator(".sheet").inner_text())
    check("Giacenza utilizzabile" not in body and "Acquisti" in body and "si tengono solo gli acquisti e i prezzi" in body, "dettaglio dell'acqua: acquisti e prezzi, niente giacenza")
    check(pg.locator(".sheet .sh-foot .btn", has_text="Registra scarico").count() == 0, "niente scarico per la rivendita")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    pg.locator("#v-magazzino .seg button", has_text="Prodotti").click(); pg.wait_for_timeout(250)
    heads = {T(h.locator(".lnk").inner_text()): T(h.locator(".q").inner_text()) for h in pg.locator("#v-magazzino .grp-h").all()}
    check(heads.get("Biscotti al burro") == "1 lotto in vetrina" and heads.get("Tartellette crema e nocciole") == "2 lotti in vetrina" and heads.get("Crema pasticcera") == "600 g + 500 g scaduti", f"prodotti per lotti in vetrina, semilavorati con la giacenza {heads}")

    # 6. scarico rapido: solo quello che si scarica davvero
    pg.locator("#tabs .fab").click(); pg.wait_for_timeout(300)
    pg.locator(".sheet .qa", has_text="Scarico").click(); pg.wait_for_timeout(350)
    nomi = [T(x) for x in pg.locator(".sheet .row .m b").all_inner_texts()]
    check("Crema pasticcera" in nomi and "Burro" in nomi and not {"Biscotti al burro", "Tartellette crema e nocciole", "Acqua naturale 0,5 l"} & set(nomi), f"nello scarico niente prodotti in vetrina né rivendita {nomi}")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # 7. il Banco spento
    pg.evaluate("location.hash = 'banco'"); pg.wait_for_selector("#v-banco"); pg.wait_for_timeout(300)
    check("Il Banco è spento" in pg.locator("#v-banco").inner_text() and pg.locator("#v-banco .bt").count() == 0, "aprendo il Banco: spento, con la spiegazione")

    # 8. si riaccende e torna tutto com'era
    pg.evaluate("location.hash = 'impostazioni'"); pg.wait_for_selector("#v-impostazioni"); pg.wait_for_timeout(300)
    pg.locator(".opt", has_text="Scarico al Banco").click()
    check(pg.locator("#cfg-ven-nota").is_visible(), "anche tornando indietro ricorda di salvare")
    pg.locator("#cfgForm button[type=submit]").click(); pg.wait_for_timeout(500)
    check(pg.evaluate("window.__store.impostazioni.generale.scaricoVendite") is True and "di nuovo acceso" in T(pg.locator(".toast").last.inner_text()), "riacceso")
    o = oggi(pg)
    check(sorted(o["scaduti"]) == ["Acqua naturale 0,5 l", "Biscotti al burro", "Burro", "Crema pasticcera"] and pg.locator("#v-oggi .bk-entry").count() == 1, "con il Banco di nuovo acceso torna tutto com'era")
    ctx.close()

    # 9. sul computer la voce Banco sparisce dalla barra laterale
    off = {**SEEDS, "impostazioni": {**SEEDS.get("impostazioni", {}), "generale": {**SEEDS.get("impostazioni", {}).get("generale", {}), "scaricoVendite": False}}}
    mock2 = MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(off)).replace("__CAN__", "true").replace("__DBNULL__", "false")
    ctx = br.new_context(viewport={"width": 1280, "height": 860}, timezone_id="Europe/Rome", locale="it-IT")
    pg = ctx.new_page(); pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00"); pg.add_init_script(mock2)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.goto(URL); pg.wait_for_selector("#v-oggi .tiles"); pg.wait_for_timeout(400)
    side = [x.strip() for x in pg.locator("#tabs a:visible").all_inner_texts()]
    check(side == ["Oggi", "Produzione", "Magazzino", "Acquisti", "Impostazioni"], f"barra laterale senza Banco {side}")
    pg.screenshot(path=str(SHOTS / "s_computer.png"))
    ctx.close()
    br.close()

print("\n".join(errors) if errors else "nessun errore in console")
if fails or errors:
    print(f"\n{len(fails)} controlli falliti, {len(errors)} errori"); sys.exit(1)
print("\ntutto ok")
