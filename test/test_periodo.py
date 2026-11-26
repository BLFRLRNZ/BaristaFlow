"""Ricerca per periodo in Produzione e Acquisti: «dal… al…», scelte rapide, una data sola, date invertite, insieme alla
ricerca e ai filtri, riassunto con il conto (e il totale per gli acquisti), il periodo che resta cambiando pagina e il
pulsante per toglierlo."""
import json, pathlib, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from mock import MOCK_TEMPLATE

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEEDS = json.loads((ROOT / "test" / "dati-test.json").read_text(encoding="utf-8"))
P0 = SEEDS["produzioni"]["p-bis211126"]
def prod(pid, ric, nome, sig, data, qta, unita="pz"):
    lotto = f"{sig}-{data[8:10]}{data[5:7]}{data[2:4]}-1"
    SEEDS["produzioni"][pid] = {**P0, "lotto": lotto, "ricettaId": ric, "ricettaNome": nome, "data": data, "qta": qta, "unita": unita, "scadenza": data, "consumi": [], "creato": P0["creato"] - 10**9}
# agosto: lotti dal 9 al 26, uno esaurito (venduto tutto) e gli altri scaduti con giacenza
for pid, ric, nome, sig, data in [("p-a09", "r-biscotti", "Biscotti al burro", "BIS", "2026-08-09"), ("p-a10", "r-biscotti", "Biscotti al burro", "BIS", "2026-08-10"),
                                  ("p-a15", "r-tartellette", "Tartellette crema e nocciole", "TAR", "2026-08-15"), ("p-a25", "r-tartellette", "Tartellette crema e nocciole", "TAR", "2026-08-25"),
                                  ("p-a26", "r-biscotti", "Biscotti al burro", "BIS", "2026-08-26")]:
    prod(pid, ric, nome, sig, data, 30)
SEEDS["movimenti"]["m-a15"] = {"data": "2026-08-16", "tipo": "vendita", "lotKind": "prod", "lotId": "p-a15", "delta": -30, "nota": "", "creato": 1}
F = SEEDS["documenti"]["d-fatt889"]["fornitoreId"]
for i, (data, imp) in enumerate([("2026-08-05", 10), ("2026-08-10", 12.5), ("2026-08-20", 30), ("2026-08-25", 7.25), ("2026-08-30", 40)]):
    SEEDS["documenti"][f"d-ago{i}"] = {"tipo": "fattura", "numero": f"A{i}", "data": data, "fornitoreId": F, "note": "", "allegati": [], "creato": 1790000000000 + i,
                                       "righe": [{"id": "r1", "articoloId": "a-zucchero", "qta": 5, "importo": imp, "lotto": f"Z-A{i}", "scadenza": "2027-08-01"}]}
URL = (ROOT / "index.html").as_uri()
SHOTS = ROOT / "test" / "screenshot"; SHOTS.mkdir(exist_ok=True)
fails, errors = [], []
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)
T = lambda s: s.replace(" ", " ").replace(" ", " ")
def lotti(pg): return [x.split(" · ")[0] for x in pg.locator("#v-produzione .list .row .m > span:nth-child(2)").all_inner_texts() if " · " in x]
def docs(pg): return [T(x) for x in pg.locator("#v-acquisti .list .row .m b").all_inner_texts()]
def somm(pg): return T(pg.locator("#persum").inner_text()) if pg.locator("#persum").count() else None
def periodo(pg, k, da, a):
    pg.locator(f"#per-{k}").click(); pg.wait_for_timeout(300)
    pg.locator("#per-da").fill(da); pg.locator("#per-a").fill(a); pg.wait_for_timeout(100)
    pg.locator(".sheet .sh-foot .btn.pri", has_text="Mostra").click(); pg.wait_for_timeout(350)
def vai(pg, h, sel): pg.evaluate(f"location.hash = '{h}'"); pg.wait_for_selector(sel); pg.wait_for_timeout(300)

mock = MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEEDS)).replace("__CAN__", "true").replace("__DBNULL__", "false")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", has_touch=True)
    pg = ctx.new_page(); pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00"); pg.add_init_script(mock)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    pg.goto(URL + "#produzione"); pg.wait_for_selector("#v-produzione"); pg.wait_for_timeout(400)

    # 1. Produzione: dal 10 al 25 agosto
    check(pg.locator("#per-prod").inner_text().strip() == "Periodo" and somm(pg) is None, "c'è il pulsante «Periodo», nessun periodo di partenza")
    pg.screenshot(path=str(SHOTS / "r_produzione.png"))
    pg.locator("#per-prod").click(); pg.wait_for_timeout(300)
    check("Periodo dei lotti prodotti" in pg.locator(".sheet .sh-head").inner_text() and pg.locator("#per-da").count() == 1, "si apre il foglio con «Dal» e «Al»")
    pg.locator("#per-da").fill("2026-08-10"); pg.locator("#per-a").fill("2026-08-25"); pg.wait_for_timeout(100)
    pg.screenshot(path=str(SHOTS / "r_foglio.png"))
    pg.locator(".sheet .sh-foot .btn.pri", has_text="Mostra").click(); pg.wait_for_timeout(350)
    check(pg.locator(".sheet-wrap").count() == 0 and sorted(lotti(pg)) == ["BIS-100826-1", "TAR-150826-1", "TAR-250826-1"], f"i lotti dal 10 al 25 agosto, estremi compresi {lotti(pg)}")
    check(somm(pg) == "3 lotti, prodotti dal 10/08/2026 al 25/08/2026" and pg.locator("#v-produzione .bar .seg button[aria-pressed=true]").inner_text() == "Tutti", f"riassunto e filtro su «Tutti», anche i lotti finiti ({somm(pg)})")
    check(T(pg.locator("#per-prod").inner_text()).strip() == "10/08 – 25/08" and pg.locator(".per-x").count() == 1, "il pulsante mostra il periodo e c'è la × per toglierlo")
    pg.screenshot(path=str(SHOTS / "r_produzione_periodo.png"))
    # insieme alla ricerca e ai filtri
    pg.fill("#q-prod", "tartellette"); pg.wait_for_timeout(250)
    check(sorted(lotti(pg)) == ["TAR-150826-1", "TAR-250826-1"] and somm(pg) == "2 lotti trovati, prodotti dal 10/08/2026 al 25/08/2026", f"con la ricerca ({somm(pg)})")
    pg.fill("#q-prod", ""); pg.wait_for_timeout(250)
    pg.locator("#v-produzione .bar .seg button", has_text="Esauriti").click(); pg.wait_for_timeout(250)
    check(lotti(pg) == ["TAR-150826-1"] and somm(pg) == "1 lotto esaurito, prodotto dal 10/08/2026 al 25/08/2026", f"con il filtro degli esauriti ({somm(pg)})")
    pg.locator("#v-produzione .bar .seg button", has_text="Tutti").click(); pg.wait_for_timeout(250)
    # resta cambiando pagina
    vai(pg, "oggi", "#v-oggi"); vai(pg, "produzione", "#v-produzione")
    check(len(lotti(pg)) == 3 and "10/08 – 25/08" in T(pg.locator("#per-prod").inner_text()), "il periodo resta cambiando pagina")
    # una data sola, date invertite, scelte rapide
    periodo(pg, "prod", "2026-11-23", "")
    check(sorted(lotti(pg)) == ["CRE-231126-1", "TAR-241126-1"] and somm(pg).endswith("dal 23/11/2026"), f"solo «dal»: fino a oggi ({somm(pg)})")
    periodo(pg, "prod", "", "2026-08-10")
    check(sorted(lotti(pg)) == ["BIS-090826-1", "BIS-100826-1"] and somm(pg).endswith("fino al 10/08/2026"), f"solo «al» ({somm(pg)})")
    periodo(pg, "prod", "2026-08-26", "2026-08-25")
    check(sorted(lotti(pg)) == ["BIS-260826-1", "TAR-250826-1"] and somm(pg).endswith("dal 25/08/2026 al 26/08/2026"), f"date invertite: si raddrizzano ({somm(pg)})")
    pg.locator("#per-prod").click(); pg.wait_for_timeout(300)
    pg.locator(".sheet .dchip", has_text="Mese scorso").click(); pg.wait_for_timeout(350)
    check(pg.locator(".sheet-wrap").count() == 0 and somm(pg) == "0 lotti, prodotti dal 01/10/2026 al 31/10/2026" and "Nessun lotto prodotto dal 01/10/2026 al 31/10/2026" in pg.locator("main").inner_text(), f"«Mese scorso» si applica subito ({somm(pg)})")
    pg.locator("#per-prod").click(); pg.wait_for_timeout(300)
    pg.locator("#per-da").fill("2026-01-01"); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check(pg.locator(".sheet-wrap").count() == 0 and somm(pg).endswith("dal 01/10/2026 al 31/10/2026"), "chiudere il foglio senza «Mostra» non cambia niente e non chiede conferma")
    pg.locator(".per-x").click(); pg.wait_for_timeout(300)
    check(somm(pg) is None and pg.locator("#per-prod").inner_text().strip() == "Periodo" and len(lotti(pg)) == 8, f"la × toglie il periodo ({len(lotti(pg))} lotti)")

    # 2. Acquisti: dal 10 al 25 agosto, con il totale
    vai(pg, "acquisti", "#v-acquisti")
    periodo(pg, "acq", "2026-08-10", "2026-08-25")
    check(docs(pg) == ["Fattura n. A3 del 25/08/2026", "Fattura n. A2 del 20/08/2026", "Fattura n. 755 del 18/08/2026", "Fattura n. A1 del 10/08/2026"], f"i documenti del periodo, dal più recente {docs(pg)}")
    t755 = sum(r["importo"] for r in SEEDS["documenti"]["d-fatt755"]["righe"]) if "d-fatt755" in SEEDS["documenti"] else 49
    check(somm(pg) == f"4 documenti dal 10/08/2026 al 25/08/2026 · {7.25 + 30 + 12.5 + t755:.2f} € senza IVA".replace(".", ","), f"riassunto con il totale ({somm(pg)})")
    pg.screenshot(path=str(SHOTS / "r_acquisti_periodo.png"))
    pg.fill("#q-acq", "A2"); pg.wait_for_timeout(250)
    check(docs(pg) == ["Fattura n. A2 del 20/08/2026"] and somm(pg) == "1 documento trovato dal 10/08/2026 al 25/08/2026 · 30,00 € senza IVA", f"con la ricerca ({somm(pg)})")
    pg.fill("#q-acq", ""); pg.wait_for_timeout(250)
    vai(pg, "produzione", "#v-produzione")
    check(somm(pg) is None, "il periodo degli acquisti non tocca la produzione")
    vai(pg, "acquisti", "#v-acquisti")
    pg.locator("#per-acq").click(); pg.wait_for_timeout(300)
    pg.locator(".sheet .sh-foot .btn", has_text="Togli il periodo").click(); pg.wait_for_timeout(300)
    check(pg.locator(".sheet-wrap").count() == 0 and somm(pg) is None and len(docs(pg)) == len(SEEDS["documenti"]), "«Togli il periodo» dal foglio")

    # 3. sul computer
    pg.set_viewport_size({"width": 1280, "height": 860}); periodo(pg, "acq", "2026-08-10", "2026-08-25")
    pg.screenshot(path=str(SHOTS / "r_acquisti_desktop.png"))
    br.close()

errors = [e for e in errors if "favicon" not in e]
check(not errors, f"nessun errore nella console {errors[:3]}")
print("\n" + ("TUTTO OK" if not fails else f"{len(fails)} CONTROLLI FALLITI"))
sys.exit(1 if fails else 0)
