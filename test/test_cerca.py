"""Ricerca unica nella lente: foglio a tutta altezza con il campo in cima (sul telefono la tastiera non lo copre),
scelta di cosa cercare, filtri per tipo di documento, stato dei lotti e categoria, periodo, ricerca anche senza scrivere,
più parole insieme, accenti, date e mesi, gruppi con «Vedi tutti», «Mostra altri», scelte che restano, e nessuna ricerca
rimasta nelle pagine (tranne il Banco, che fa parte dello scontrino)."""
import json, pathlib, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from mock import MOCK_TEMPLATE

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEEDS = json.loads((ROOT / "test" / "dati-test.json").read_text(encoding="utf-8"))
P0 = SEEDS["produzioni"]["p-bis211126"]
# agosto: lotti dal 9 al 26 (uno venduto tutto) e cinque fatture
for pid, ric, nome, sig, data in [("p-a09", "r-biscotti", "Biscotti al burro", "BIS", "2026-08-09"), ("p-a10", "r-biscotti", "Biscotti al burro", "BIS", "2026-08-10"),
                                  ("p-a15", "r-tartellette", "Tartellette crema e nocciole", "TAR", "2026-08-15"), ("p-a25", "r-tartellette", "Tartellette crema e nocciole", "TAR", "2026-08-25"),
                                  ("p-a26", "r-biscotti", "Biscotti al burro", "BIS", "2026-08-26")]:
    SEEDS["produzioni"][pid] = {**P0, "lotto": f"{sig}-{data[8:10]}{data[5:7]}{data[2:4]}-1", "ricettaId": ric, "ricettaNome": nome, "data": data, "qta": 30, "scadenza": data, "consumi": [], "creato": P0["creato"] - 10**9}
SEEDS["movimenti"]["m-a15"] = {"data": "2026-08-16", "tipo": "vendita", "lotKind": "prod", "lotId": "p-a15", "delta": -30, "nota": "", "creato": 1}
F = SEEDS["documenti"]["d-fatt889"]["fornitoreId"]
for i, (data, imp) in enumerate([("2026-08-05", 10), ("2026-08-10", 12.5), ("2026-08-20", 30), ("2026-08-25", 7.25), ("2026-08-30", 40)]):
    SEEDS["documenti"][f"d-ago{i}"] = {"tipo": "fattura", "numero": f"A{i}", "data": data, "fornitoreId": F, "note": "", "allegati": [], "creato": 1790000000000 + i,
                                       "righe": [{"id": "r1", "articoloId": "a-zucchero", "qta": 5, "importo": imp, "lotto": f"Z-A{i}", "scadenza": "2027-08-01"}]}
SEEDS["articoli"]["a-caffe"] = {**SEEDS["articoli"]["a-zucchero"], "nome": "Caffè in grani", "etichetta": ""}
URL = (ROOT / "index.html").as_uri()
SHOTS = ROOT / "test" / "screenshot"; SHOTS.mkdir(exist_ok=True)
fails, errors = [], []
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)
T = lambda s: s.replace(" ", " ").replace(" ", " ")
def apri(pg):
    pg.locator(".topbar .iconbtn.search").click(); pg.wait_for_timeout(350)
def scrivi(pg, t): pg.fill("#q-globale", t); pg.wait_for_timeout(350)
def cosa(pg, t): pg.locator(".cerca-cosa .dchip", has_text=t).first.click(); pg.wait_for_timeout(300)
def filtro(pg, t): pg.locator(".cerca-f .dchip", has_text=t).first.click(); pg.wait_for_timeout(300)
def gruppi(pg): return {h.split("\n")[0].strip(): int(h.split("\n")[-1]) for h in pg.locator(".sres-h").all_inner_texts()}
def somm(pg): return T(pg.locator("#persum").inner_text()) if pg.locator("#persum").count() else None
def righe(pg): return [T(x) for x in pg.locator(".sheet .sres .list > .row .m b").all_inner_texts()]
def codici(pg): return sorted(x.split(" · ")[0] for x in pg.locator(".sheet .sres .list > .row .m > span:nth-child(2)").all_inner_texts())
def periodo(pg, da, a):
    pg.locator("#per-cerca").click(); pg.wait_for_timeout(300)
    pg.locator("#per-da").fill(da); pg.locator("#per-a").fill(a)
    pg.locator(".sheet .sh-foot .btn.pri", has_text="Mostra").click(); pg.wait_for_timeout(350)

mock = MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEEDS)).replace("__CAN__", "true").replace("__DBNULL__", "false")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", has_touch=True)
    pg = ctx.new_page(); pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00"); pg.add_init_script(mock)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    pg.goto(URL); pg.wait_for_selector("#v-oggi .tiles"); pg.wait_for_timeout(300)

    # 1. nelle pagine non ci sono più ricerche: c'è solo la lente (e il Banco tiene la sua)
    for h, sel in [("produzione", "#v-produzione"), ("acquisti", "#v-acquisti"), ("magazzino", "#v-magazzino"), ("schede", "#v-schede"), ("fornitori", "#v-fornitori"), ("prezzi", "#v-prezzi")]:
        pg.evaluate(f"location.hash = '{h}'"); pg.wait_for_selector(sel); pg.wait_for_timeout(200)
        check(pg.locator("main input[type=search]").count() == 0 and pg.locator("main .btn.per").count() == 0, f"{h}: nessun campo di ricerca né periodo nella pagina")
    pg.evaluate("location.hash = 'banco'"); pg.wait_for_selector("#v-banco"); pg.wait_for_timeout(200)
    check(pg.locator("#q-banco").count() == 1, "il Banco tiene la sua ricerca")

    # 2. la lente: a tutta altezza, il campo in cima, già pronto per scrivere
    pg.evaluate("location.hash = 'oggi'"); pg.wait_for_selector("#v-oggi"); pg.wait_for_timeout(200)
    apri(pg)
    sh, box = pg.locator(".sheet").bounding_box(), pg.locator("#q-globale").bounding_box()
    check(sh["height"] > 780 and box["y"] < 160 and pg.evaluate("document.activeElement.id") == "q-globale", f"foglio alto {sh['height']:.0f}px, campo in cima a {box['y']:.0f}px e già attivo")
    check([T(x) for x in pg.locator(".cerca-cosa .dchip").all_inner_texts()] == ["Tutto", "Lotti prodotti", "Lotti acquistati", "Documenti", "Articoli", "Schede", "Fornitori"], "scelte di cosa cercare")
    check("si può cercare anche senza scrivere" in pg.locator(".sheet .sres").inner_text(), "senza niente scritto, la ricerca spiega cosa si può fare")
    pg.screenshot(path=str(SHOTS / "c_lente.png"))

    # 3. Tutto: gruppi con il loro numero; più parole, accenti, date, mesi
    scrivi(pg, "burro")
    g = gruppi(pg)
    check(g.get("Lotti acquistati") == 2 and g.get("Articoli") == 1 and g.get("Lotti prodotti", 0) >= 4 and "Documenti" in g, f"«burro» in tutti i tipi {g}")
    pg.screenshot(path=str(SHOTS / "c_burro.png"))
    check("Vedi tutti i" in pg.locator(".sheet .sres").inner_text(), "un gruppo lungo ha «Vedi tutti»")
    scrivi(pg, "burro latteria")
    check(gruppi(pg).get("Lotti acquistati") == 2 and "Lotti prodotti" not in gruppi(pg) and "Schede" not in gruppi(pg), f"due parole insieme: il burro della latteria {gruppi(pg)}")
    scrivi(pg, "caffe")
    check(righe(pg) == ["Caffè in grani"], f"senza accenti trova «Caffè» {righe(pg)}")
    scrivi(pg, "21/11")
    check(gruppi(pg).get("Lotti prodotti") == 1 and "BIS-211126-1" in pg.locator(".sheet .sres").inner_text(), f"per data {gruppi(pg)}")
    scrivi(pg, "agosto tartellette")
    check(gruppi(pg) == {"Lotti prodotti": 2}, f"per mese {gruppi(pg)}")
    scrivi(pg, "2026")
    pg.locator(".vedi .lnk", has_text="lotti prodotti").click(); pg.wait_for_timeout(300)
    check(pg.locator(".cerca-cosa .dchip[aria-pressed=true]").inner_text() == "Lotti prodotti" and somm(pg) == "8 lotti prodotti trovati", f"«Vedi tutti» passa a quel tipo ({somm(pg)})")

    # 4. un tipo solo, anche senza scrivere; stato e periodo
    scrivi(pg, "")
    check(somm(pg) == "8 lotti prodotti" and len(codici(pg)) == 8, f"senza scrivere: tutti i lotti prodotti ({somm(pg)})")
    periodo(pg, "2026-08-10", "2026-08-25")
    check(codici(pg) == ["BIS-100826-1", "TAR-150826-1", "TAR-250826-1"] and somm(pg) == "3 lotti prodotti dal 10/08/2026 al 25/08/2026", f"dal 10 al 25 agosto, estremi compresi ({somm(pg)})")
    check(T(pg.locator("#per-cerca").inner_text()).strip() == "10/08 – 25/08", "il pulsante mostra il periodo")
    pg.screenshot(path=str(SHOTS / "c_periodo.png"))
    filtro(pg, "Finiti")
    check(codici(pg) == ["TAR-150826-1"], f"solo i lotti finiti {codici(pg)}")
    filtro(pg, "Tutti")
    scrivi(pg, "tartellette")
    check(somm(pg) == "2 lotti prodotti trovati dal 10/08/2026 al 25/08/2026", f"periodo e parole insieme ({somm(pg)})")
    scrivi(pg, "")

    # 5. Documenti: tipo, periodo, totale
    cosa(pg, "Documenti")
    check([T(x) for x in pg.locator(".cerca-f .dchip").all_inner_texts()] == ["Tutti i tipi", "Fatture", "DDT", "Scontrini", "Inventario"], "per i documenti si sceglie il tipo")
    check(righe(pg)[:3] == ["Fattura n. A3 del 25/08/2026", "Fattura n. A2 del 20/08/2026", "Fattura n. 755 del 18/08/2026"] and somm(pg) == "4 documenti dal 10/08/2026 al 25/08/2026 · 98,75 € senza IVA", f"documenti del periodo con il totale ({somm(pg)})")
    filtro(pg, "DDT")
    check(somm(pg).startswith("0 documenti dal 10/08/2026") and "Nessun risultato" in pg.locator(".sheet .sres").inner_text(), f"nessun DDT in agosto ({somm(pg)})")
    pg.locator(".per-x").click(); pg.wait_for_timeout(300)
    check(somm(pg) == "2 documenti · 61,80 € senza IVA" and pg.locator("#per-cerca").inner_text().strip() == "Periodo", f"tolto il periodo: tutti i DDT ({somm(pg)})")

    # 6. Tutto con un periodo: solo lotti e documenti
    cosa(pg, "Tutto"); periodo(pg, "2026-08-10", "2026-08-25")
    check(set(gruppi(pg)) == {"Lotti prodotti", "Lotti acquistati", "Documenti"} and somm(pg) == "Lotti e documenti dal 10/08/2026 al 25/08/2026", f"con un periodo solo ciò che ha una data {gruppi(pg)}")
    # scelte rapide, data sola, date invertite, «Togli il periodo»
    pg.locator("#per-cerca").click(); pg.wait_for_timeout(300); pg.locator(".sheet .dchip", has_text="Mese scorso").click(); pg.wait_for_timeout(350)
    check(pg.locator(".sheet-wrap").count() == 1 and somm(pg) == "Lotti e documenti dal 01/10/2026 al 31/10/2026", f"«Mese scorso» subito ({somm(pg)})")
    cosa(pg, "Lotti prodotti"); periodo(pg, "2026-08-26", "2026-08-25")
    check(codici(pg) == ["BIS-260826-1", "TAR-250826-1"], f"date invertite si raddrizzano {codici(pg)}")
    periodo(pg, "2026-11-23", "")
    check(codici(pg) == ["CRE-231126-1", "TAR-241126-1"] and somm(pg).endswith("dal 23/11/2026"), f"solo «dal» ({somm(pg)})")
    pg.locator("#per-cerca").click(); pg.wait_for_timeout(300)
    pg.locator("#per-da").fill("2026-01-01"); pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check(pg.locator(".sheet-wrap").count() == 1 and somm(pg).endswith("dal 23/11/2026"), "chiudere il periodo senza «Mostra» non cambia niente")
    pg.locator("#per-cerca").click(); pg.wait_for_timeout(300)
    pg.locator(".sheet .sh-foot .btn", has_text="Togli il periodo").click(); pg.wait_for_timeout(300)
    check(pg.locator(".sheet-wrap").count() == 1 and somm(pg) == "8 lotti prodotti", f"«Togli il periodo» ({somm(pg)})")

    # 7. articoli per categoria, schede, fornitori
    cosa(pg, "Articoli"); filtro(pg, "Rivendita")
    check(righe(pg) == ["Acqua naturale 0,5 l"] and pg.locator("#per-cerca").count() == 0, f"articoli di rivendita, senza periodo {righe(pg)}")
    cosa(pg, "Schede")
    check(somm(pg) == "3 schede" and righe(pg) == ["Biscotti al burro", "Crema pasticcera", "Tartellette crema e nocciole"], f"schede {righe(pg)}")
    scrivi(pg, "crema"); check(somm(pg) == "2 schede trovate", f"schede trovate ({somm(pg)})")
    cosa(pg, "Fornitori"); scrivi(pg, "latteria")
    check(righe(pg) == ["Latteria Val Verde"], f"fornitori {righe(pg)}")

    # 8. dal risultato al dettaglio e ritorno; le scelte restano; Invio chiude la tastiera
    pg.locator(".sheet .sres .row", has_text="Latteria Val Verde").click(); pg.wait_for_timeout(300)
    check(pg.locator(".sheet-wrap").count() == 2, "il dettaglio si apre sopra la ricerca")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(250)
    check(pg.locator("#q-globale").input_value() == "latteria" and righe(pg) == ["Latteria Val Verde"], "chiudendo il dettaglio torni ai risultati")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    apri(pg)
    check(pg.locator(".cerca-cosa .dchip[aria-pressed=true]").inner_text() == "Fornitori" and pg.input_value("#q-globale") == "latteria"
          and pg.evaluate("[document.activeElement.selectionStart, document.activeElement.selectionEnd]") == [0, 8], "riaprendo la lente ritrovi la ricerca, con il testo già selezionato")
    pg.locator("#q-globale").press("Enter"); pg.wait_for_timeout(200)
    check(pg.evaluate("document.activeElement.id") != "q-globale", "Invio chiude la tastiera e lascia i risultati")
    # tanti risultati: «Mostra altri»
    cosa(pg, "Lotti acquistati"); scrivi(pg, "")
    n = int(somm(pg).split()[0])
    check(n == len(righe(pg)) and pg.locator("#cerca-altri").count() == 0, f"meno di 40: tutti subito ({n})")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # 9. lo scarico rapido, che ha un campo da scrivere, è alto anche lui
    pg.locator(".fab").click(); pg.wait_for_timeout(300)
    pg.locator(".sheet .qa", has_text="Scarico").click(); pg.wait_for_timeout(300)
    check(pg.locator(".sheet").bounding_box()["height"] > 780, "anche lo scarico rapido è a tutta altezza")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(250)

    # 10. sul computer: il tasto / apre la lente
    pg.set_viewport_size({"width": 1280, "height": 860}); pg.wait_for_timeout(200)
    pg.keyboard.press("/"); pg.wait_for_timeout(300)
    check(pg.evaluate("document.activeElement.id") == "q-globale", "il tasto / apre la lente")
    pg.locator(".cerca-cosa .dchip", has_text="Documenti").click(); pg.wait_for_timeout(300)
    pg.screenshot(path=str(SHOTS / "c_desktop.png"))
    br.close()

errors = [e for e in errors if "favicon" not in e]
check(not errors, f"nessun errore nella console {errors[:3]}")
print("\n" + ("TUTTO OK" if not fails else f"{len(fails)} CONTROLLI FALLITI"))
sys.exit(1 if fails else 0)
