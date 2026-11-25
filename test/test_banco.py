"""Banco, lo scontrino interno: tasti dei prodotti in vendita, quantità, Invio che scarica i lotti (prima quelli che
scadono prima), annullare, scontrini di oggi, tastiera, prezzo della rivendita, riapertura sul Banco."""
import json, pathlib, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from mock import MOCK_TEMPLATE

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEEDS = json.loads((ROOT / "test" / "dati-test.json").read_text(encoding="utf-8"))
P0 = SEEDS["produzioni"]["p-bis211126"]
def prod(pid, ric, nome, lotto, data, qta, scad):
    return {**P0, "lotto": lotto, "ricettaId": ric, "ricettaNome": nome, "data": data, "qta": qta, "scadenza": scad, "consumi": [], "creato": P0["creato"] - 1000}
# un lotto di biscotti più vecchio (scade prima: si vende per primo) e uno di tartellette già scaduto (non si vende)
SEEDS["produzioni"]["p-bis181126"] = prod("p-bis181126", "r-biscotti", "Biscotti al burro", "BIS-181126-1", "2026-11-18", 10, "2026-11-25")
SEEDS["produzioni"]["p-tar201126"] = prod("p-tar201126", "r-tartellette", "Tartellette crema e nocciole", "TAR-201126-1", "2026-11-20", 5, "2026-11-22")
# una scheda mai prodotta (esaurita), una archiviata (non compare), un succo di rivendita solo scaduto
R0 = SEEDS["ricette"]["r-biscotti"]
SEEDS["ricette"]["r-torta"] = {**R0, "nome": "Torta di mele", "sigla": "TOM", "prezzoVendita": 2.5, "creato": R0["creato"] + 1}
SEEDS["ricette"]["r-vecchia"] = {**R0, "nome": "Ciambella vecchia", "sigla": "CIA", "archiviato": True, "creato": R0["creato"] + 2}
A0 = SEEDS["articoli"]["a-acqua"]
SEEDS["articoli"]["a-acqua"] = {**A0, "prezzoVendita": 1}
SEEDS["articoli"]["a-succo"] = {**A0, "nome": "Succo di pesca 20 cl", "prezzoVendita": 2, "creato": A0["creato"] + 1}
SEEDS["documenti"]["d-succo"] = {"tipo": "ddt", "numero": "77", "data": "2026-10-01", "fornitoreId": "f-ingrosso", "note": "", "allegati": [], "creato": 1790000000000,
                                 "righe": [{"id": "r1", "articoloId": "a-succo", "qta": 6, "importo": 3, "lotto": "S1", "scadenza": "2026-11-20"}]}
URL = (ROOT / "index.html").as_uri()
SHOTS = ROOT / "test" / "screenshot"; SHOTS.mkdir(exist_ok=True)
fails, errors = [], []
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)
T = lambda s: s.replace(" ", " ").replace(" ", " ")
BANCO_MOVS = "Object.entries(window.__store.movimenti).filter(([, m]) => m.banco).map(([id, m]) => ({id, ...m}))"

def newpage(br, mock, w, h, scheme="light", touch=True):
    ctx = br.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", color_scheme=scheme, has_touch=touch)
    pg = ctx.new_page()
    pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00")
    if mock: pg.add_init_script(mock)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    return ctx, pg

mock = MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEEDS)).replace("__CAN__", "true").replace("__DBNULL__", "false")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])

    # 1. telefono: dal pulsante in Oggi al Banco
    ctx, pg = newpage(br, mock, 390, 844)
    pg.goto(URL); pg.wait_for_selector("#v-oggi .tiles"); pg.wait_for_timeout(300)
    vis = pg.evaluate("[...document.querySelectorAll('#tabs > *')].filter(e => getComputedStyle(e).display !== 'none').map(e => e.textContent.trim() || e.getAttribute('aria-label'))")
    check(vis == ["Oggi", "Produzione", "Nuova registrazione", "Magazzino", "Acquisti"], f"la barra in basso del telefono resta com'era {vis}")
    pg.locator("#v-oggi .bk-entry").click(); pg.wait_for_selector("#v-banco"); pg.wait_for_timeout(400)
    check(pg.evaluate("location.hash") == "#banco" and pg.locator("#tbTitle").inner_text() == "Banco", "il pulsante Banco di Oggi apre il Banco")
    tiles = [T(x) for x in pg.locator(".bt .bt-n").all_inner_texts()]
    check(tiles == ["Biscotti al burro", "Tartellette crema e nocciole", "Torta di mele", "Acqua naturale 0,5 l", "Succo di pesca 20 cl"], f"in vendita i prodotti (non i semilavorati né gli archiviati) e la rivendita {tiles}")
    check(pg.locator(".bk-gh").all_inner_texts() == ["Dolci", "Rivendita"], "tasti divisi per categoria, la rivendita in fondo")
    st = {T(pg.locator(".bt", has_text=n).locator(".bt-n").inner_text()): T(pg.locator(".bt", has_text=n).locator(".bt-f").inner_text()) for n in ["Biscotti", "Tartellette", "Torta di mele", "Acqua", "Succo"]}
    check(st == {"Biscotti al burro": "30 pz\n0,60 €", "Tartellette crema e nocciole": "14 pz\n1,80 €", "Torta di mele": "Esaurito\n2,50 €", "Acqua naturale 0,5 l": "14 pz\n1,00 €", "Succo di pesca 20 cl": "Scaduto\n2,00 €"}, f"giacenza vendibile (senza i lotti scaduti) e prezzo sui tasti {st}")
    check(pg.locator(".bk-bar").count() == 0, "a scontrino vuoto e senza vendite la barra non c'è")
    pg.screenshot(path=str(SHOTS / "b_banco.png"))

    # 2. tocchi: ogni tocco ne aggiunge uno, il meno ne toglie uno; esauriti e scaduti non entrano
    bis = pg.locator(".bt", has_text="Biscotti al burro")
    for _ in range(3): bis.locator(".bt-add").click()
    check(bis.locator(".bt-q").inner_text() == "3" and "sel" in bis.get_attribute("class"), "tre tocchi: 3 biscotti nello scontrino")
    bis.locator(".bt-sub").click()
    check(bis.locator(".bt-q").inner_text() == "2", "il meno ne toglie uno")
    pg.locator(".bt", has_text="Acqua naturale").locator(".bt-add").click()
    check(T(pg.locator(".bk-bar.on .bk-sum").inner_text()) == "3 pezzi\n2,20 € · Modifica", f"in basso lo scontrino in corso {T(pg.locator('.bk-bar.on .bk-sum').inner_text())!r}")
    pg.locator(".bt", has_text="Torta di mele").locator(".bt-add").dispatch_event("click"); pg.wait_for_timeout(100)   # aria-disabled: il tocco spiega perché
    check("non risulta in giacenza" in T(pg.locator(".toast").last.inner_text()) and pg.locator(".bt", has_text="Torta di mele").locator(".bt-q").count() == 0, "un prodotto esaurito non entra e si spiega perché")
    pg.locator(".bt", has_text="Succo").locator(".bt-add").dispatch_event("click"); pg.wait_for_timeout(100)
    check("solo merce scaduta" in T(pg.locator(".toast").last.inner_text()), "con solo merce scaduta il tasto lo dice")
    pg.locator(".bt", has_text="Tartellette").locator(".bt-add").click()
    pg.screenshot(path=str(SHOTS / "b_scontrino.png"))

    # 3. il foglio dello scontrino: quantità scritte, oltre la giacenza si ferma lì
    pg.locator(".bk-sum").click(); pg.wait_for_timeout(400)
    check([T(x) for x in pg.locator(".sheet .bk-rn b").all_inner_texts()] == ["Biscotti al burro", "Acqua naturale 0,5 l", "Tartellette crema e nocciole"], "nel foglio le righe nell'ordine dei tocchi")
    q = pg.locator(".sheet [data-bq='ric:r-tartellette']"); q.fill("20"); q.press("Enter"); pg.wait_for_timeout(200)
    check(pg.locator(".sheet [data-bq='ric:r-tartellette']").input_value() == "14" and "ne restano solo 14 pz" in T(pg.locator(".toast").last.inner_text()), "oltre la giacenza la quantità si ferma a quella")
    check(pg.evaluate("document.activeElement.dataset.act") == "banco-invio", "dopo Invio su una quantità tocca al pulsante Invio")
    q = pg.locator(".sheet [data-bq='ric:r-tartellette']"); q.fill("2"); q.press("Enter")
    q = pg.locator(".sheet [data-bq='ric:r-biscotti']"); q.fill("25"); q.press("Enter"); pg.wait_for_timeout(200)
    check(T(pg.locator(".sheet .bk-tot").inner_text()) == "28 pezzi\n19,60 €", f"totale con le quantità scritte {T(pg.locator('.sheet .bk-tot').inner_text())!r}")
    pg.screenshot(path=str(SHOTS / "b_foglio.png"))
    pg.locator(".sheet [data-act=banco-invio]").click(); pg.wait_for_timeout(600)

    # 4. Invio: un movimento per lotto, prima il lotto che scade prima, mai quelli scaduti
    ms = pg.evaluate(BANCO_MOVS)
    got = sorted((m["lotId"], m["delta"], m.get("prezzo"), m["tipo"], m["nota"]) for m in ms)
    check(got == sorted([("p-bis181126", -10, 0.6, "vendita", "Banco, ore 10:00"), ("p-bis211126", -15, 0.6, "vendita", "Banco, ore 10:00"),
                         ("d-fatt889:r5", -1, 1, "vendita", "Banco, ore 10:00"), ("p-tar241126", -2, 1.8, "vendita", "Banco, ore 10:00")]), f"vendite scritte per lotto {got}")
    check(len({m["banco"] for m in ms}) == 1 and all(m["data"] == "2026-11-24" for m in ms), "un solo scontrino, con la data di oggi")
    check(pg.locator(".sheet-wrap").count() == 0 and pg.locator(".bt.sel").count() == 0, "dopo Invio il foglio si chiude e lo scontrino si svuota")
    check("Scontrino registrato: 28 pezzi · 19,60 €" in T(pg.locator(".toast").last.inner_text()), "avviso con pezzi e totale")
    check(T(pg.locator(".bt", has_text="Biscotti").locator(".bt-s").inner_text()) == "5 pz", "la giacenza sul tasto si aggiorna subito")
    check("Ultimo scontrino · 10:00" in T(pg.locator(".bk-bar").inner_text()), "in basso resta l'ultimo scontrino")
    pg.screenshot(path=str(SHOTS / "b_dopo_invio.png"))
    pg.locator(".toast button", has_text="Annulla").click(); pg.wait_for_timeout(500)
    check(pg.evaluate(BANCO_MOVS) == [] and T(pg.locator(".bt", has_text="Biscotti").locator(".bt-s").inner_text()) == "30 pz", "Annulla nell'avviso toglie tutto lo scontrino")
    check(pg.locator(".bk-bar").count() == 0, "senza scontrini la barra sparisce")

    # 5. l'ultimo scontrino si annulla anche dopo, con una conferma
    pg.locator(".bt", has_text="Acqua naturale").locator(".bt-add").click()
    pg.locator(".bk-bar .bk-inv").click(); pg.wait_for_timeout(500)
    pg.locator(".bk-bar .btn", has_text="Annulla").click(); pg.wait_for_timeout(350)
    check("Annullo lo scontrino delle 10:00 (1 pezzo, 1,00 €)?" in T(pg.locator(".sheet").inner_text()), "la conferma dice quale scontrino")
    pg.locator(".sheet .btn", has_text="No, lascialo").click(); pg.wait_for_timeout(300)
    check(len(pg.evaluate(BANCO_MOVS)) == 1, "«No, lascialo» non tocca niente")
    pg.locator(".bk-bar .btn", has_text="Annulla").click(); pg.wait_for_timeout(300)
    pg.locator(".sheet .btn", has_text="Sì, annulla").click(); pg.wait_for_timeout(500)
    check(pg.evaluate(BANCO_MOVS) == [] and "Scontrino annullato" in T(pg.locator(".toast").last.inner_text()), "«Sì, annulla» lo cancella")

    # 6. scontrini di oggi; Svuota con Ripristina
    for name in ["Biscotti", "Acqua naturale"]:
        pg.locator(".bt", has_text=name).locator(".bt-add").click(); pg.locator(".bk-bar .bk-inv").click(); pg.wait_for_timeout(450)
    pg.locator(".bt", has_text="Tartellette").locator(".bt-add").click(); pg.locator(".bt", has_text="Tartellette").locator(".bt-add").click()
    pg.locator(".bk-bar .bk-x").click(); pg.wait_for_timeout(150)
    check(pg.locator(".bt.sel").count() == 0 and "Scontrino svuotato" in T(pg.locator(".toast").last.inner_text()), "la X svuota lo scontrino")
    pg.locator(".toast button", has_text="Ripristina").click(); pg.wait_for_timeout(150)
    check(pg.locator(".bt", has_text="Tartellette").locator(".bt-q").inner_text() == "2", "Ripristina lo riporta com'era")
    pg.locator(".bk-bar .bk-inv").click(); pg.wait_for_timeout(500)
    stat = T(pg.locator(".bk-stat").inner_text())
    rows = [T(x) for x in pg.locator(".bk-list .row .m").all_inner_texts()]
    check(stat == "3 scontrini · 4 pezzi · 5,20 €", f"riepilogo della giornata {stat!r}")
    check(rows == ["10:00 · 3,60 €\nTartellette crema e nocciole ×2", "10:00 · 1,00 €\nAcqua naturale 0,5 l ×1", "10:00 · 0,60 €\nBiscotti al burro ×1"], f"scontrini dal più recente {rows}")
    pg.locator(".bk-list .row", has_text="Acqua naturale").locator(".btn", has_text="Annulla").click(); pg.wait_for_timeout(300)
    pg.locator(".sheet .btn", has_text="Sì, annulla").click(); pg.wait_for_timeout(500)
    check(T(pg.locator(".bk-stat").inner_text()) == "2 scontrini · 3 pezzi · 4,20 €", "si annulla anche uno scontrino più vecchio")
    pg.locator("#bk-oggi").scroll_into_view_if_needed(); pg.wait_for_timeout(200)
    pg.screenshot(path=str(SHOTS / "b_oggi.png"))

    # 7. ricerca: Invio aggiunge l'unico prodotto trovato, poi Invio registra
    pg.fill("#q-banco", "tart"); pg.wait_for_timeout(150)
    check([T(x) for x in pg.locator(".bt .bt-n").all_inner_texts()] == ["Tartellette crema e nocciole"], "la ricerca filtra i tasti")
    pg.locator("#q-banco").press("Enter"); pg.wait_for_timeout(150)
    check(pg.locator("#q-banco").input_value() == "" and pg.locator(".bt", has_text="Tartellette").locator(".bt-q").inner_text() == "1" and len(pg.locator(".bt").all()) == 5, "Invio nella ricerca aggiunge il prodotto e pulisce la ricerca")
    n0 = len(pg.evaluate(BANCO_MOVS))
    pg.locator("#q-banco").press("Enter"); pg.wait_for_timeout(500)
    check(len(pg.evaluate(BANCO_MOVS)) == n0 + 1 and pg.locator(".bt.sel").count() == 0, "Invio a ricerca vuota registra lo scontrino")
    pg.locator(".seg button", has_text="Rivendita").click(); pg.wait_for_timeout(150)
    check([T(x) for x in pg.locator(".bt .bt-n").all_inner_texts()] == ["Acqua naturale 0,5 l", "Succo di pesca 20 cl"] and pg.locator(".bk-gh").count() == 0, "le categorie filtrano i tasti")
    pg.locator(".seg button", has_text="Tutti").click(); pg.wait_for_timeout(100)
    ctx.close()

    # 8. computer: voce nella barra laterale, riquadro dello scontrino, tastiera
    ctx, pg = newpage(br, mock, 1280, 860, touch=False)
    pg.goto(URL); pg.wait_for_selector("#v-oggi .tiles"); pg.wait_for_timeout(300)
    side = [x.strip() for x in pg.locator("#tabs a").all_inner_texts()]
    check(side == ["Oggi", "Banco", "Produzione", "Magazzino", "Acquisti", "Impostazioni"] and pg.locator("#v-oggi .bk-entry").is_hidden(), f"sul computer il Banco è nella barra laterale {side}")
    pg.locator("#tabs a[data-tab=banco]").click(); pg.wait_for_selector("#v-banco"); pg.wait_for_timeout(500)
    check(pg.locator("#tabs a[data-tab=banco][aria-current=page]").count() == 1 and pg.locator(".bk-side").is_visible(), "voce evidenziata e riquadro dello scontrino di lato")
    check(pg.locator("#bk-invio").is_disabled() and "Tocca i prodotti venduti" in pg.locator(".bk-side").inner_text(), "a scontrino vuoto Invio è spento")
    for _ in range(2): pg.locator(".bt", has_text="Biscotti").locator(".bt-add").click()
    pg.locator(".bt", has_text="Acqua naturale").locator(".bt-add").click()
    check(pg.evaluate("document.activeElement.id") == "bk-art-a-acqua", "dopo il tocco il tasto resta selezionato (tastiera)")
    q = pg.locator(".bk-side [data-bq='art:a-acqua']"); q.fill("3"); q.press("Enter"); pg.wait_for_timeout(150)
    check(pg.evaluate("document.activeElement.id") == "bk-invio" and T(pg.locator(".bk-side .bk-tot").inner_text()) == "5 pezzi\n4,20 €", "quantità scritta, poi il cursore va su Invio")
    pg.screenshot(path=str(SHOTS / "b_computer.png"))
    pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
    ms = pg.evaluate(BANCO_MOVS)
    check(sorted((m["lotId"], m["delta"]) for m in ms) == [("d-fatt889:r5", -3), ("p-bis181126", -2)], f"Invio dalla tastiera registra lo scontrino {ms}")
    check("Ultimo scontrino · 10:00" in T(pg.locator(".bk-side .bk-last").inner_text()), "di lato l'ultimo scontrino da annullare")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
    check(len(pg.evaluate(BANCO_MOVS)) == 2, "Invio a scontrino vuoto non fa niente")
    # su iPhone il tocco su Invio può arrivare prima che il campo confermi la quantità scritta: vale lo stesso
    pg.locator(".bt", has_text="Biscotti").locator(".bt-add").click()
    pg.evaluate("(() => { const i = document.querySelector(\".bk-side [data-bq='ric:r-biscotti']\"); i.value = '4'; i.dispatchEvent(new Event('input', {bubbles: true})); })()")
    pg.locator("#bk-invio").dispatch_event("click"); pg.wait_for_timeout(500)
    last = [m for m in pg.evaluate(BANCO_MOVS) if m["lotId"] in ("p-bis181126", "p-bis211126")]
    check(sorted(m["delta"] for m in last) == [-4, -2], f"la quantità scritta vale anche senza conferma {[m['delta'] for m in last]}")

    # 9. prezzo di vendita della rivendita, nell'articolo
    pg.evaluate("location.hash = 'magazzino'"); pg.wait_for_timeout(400)
    pg.locator(".row", has_text="Acqua naturale").click(); pg.wait_for_timeout(400)
    check("Prezzo di vendita" in T(pg.locator(".sheet .kv").inner_text()) and "1,00 €" in T(pg.locator(".sheet .kv").inner_text()), "il dettaglio dell'articolo mostra il prezzo di vendita")
    pg.locator(".sheet .btn", has_text="Modifica").click(); pg.wait_for_timeout(400)
    check(pg.locator("#f-pv").is_visible() and pg.locator("#f-pv input").input_value() == "1" and "al pezzo" in pg.locator("#f-pv").inner_text(), "nel modulo il prezzo di vendita della rivendita")
    pg.locator(".sheet [data-act=fseg][data-v=materia]").click()
    check(pg.locator("#f-pv").is_hidden(), "una materia prima non ha prezzo di vendita")
    pg.locator(".sheet [data-act=fseg][data-v=rivendita]").click()
    pg.locator("#f-pv input").fill("1,2"); pg.locator(".sheet .btn.pri", has_text="Salva").click(); pg.wait_for_timeout(500)
    check(pg.evaluate("window.__store.articoli['a-acqua'].prezzoVendita") == 1.2, "prezzo salvato")
    pg.evaluate("history.back()"); pg.wait_for_timeout(300)
    pg.evaluate("location.hash = 'banco'"); pg.wait_for_timeout(400)
    check(T(pg.locator(".bt", has_text="Acqua naturale").locator(".bt-p").inner_text()) == "1,20 €", "il tasto mostra il prezzo nuovo")
    ctx.close()

    # 10. sola lettura: si guardano i tasti, non si vende
    ro = MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEEDS)).replace("__CAN__", "false").replace("__DBNULL__", "false")
    ctx, pg = newpage(br, ro, 390, 844)
    pg.goto(URL + "#banco"); pg.wait_for_selector("#v-banco .bt"); pg.wait_for_timeout(300)
    pg.locator(".bt", has_text="Biscotti").locator(".bt-add").click(); pg.wait_for_timeout(100)
    check(pg.locator(".bt.sel").count() == 0 and "solo in lettura" in pg.locator(".toast").last.inner_text() and pg.locator(".bk-bar").count() == 0, "in sola lettura il tocco non vende")
    ctx.close()

    # 11. dati nel browser: chi lascia l'app sul Banco la ritrova lì; Banco vuoto senza prodotti
    ctx, pg = newpage(br, None, 390, 844)
    pg.goto(URL); pg.wait_for_selector("#main section"); pg.wait_for_timeout(200)
    pg.evaluate("localStorage.setItem('bf-banco', '1')")
    pg.goto(URL); pg.wait_for_selector("#v-banco"); pg.wait_for_timeout(200)
    check(pg.evaluate("location.hash") == "#banco" and "Non c’è ancora niente da vendere" in pg.locator("#v-banco").inner_text(), "riaperta, l'app torna sul Banco (vuoto, con le spiegazioni)")
    pg.locator("#tabs a[data-tab=oggi]").click(); pg.wait_for_timeout(300)
    pg.goto(URL); pg.wait_for_selector("#main section"); pg.wait_for_timeout(200)
    check(pg.locator("#v-banco").count() == 0 and pg.evaluate("localStorage.getItem('bf-banco')") == "", "lasciata su Oggi, si riapre su Oggi")
    ctx.close()

    # 12. dati di esempio: le vendite al banco sono di prova e se ne vanno con gli esempi
    empty = MOCK_TEMPLATE.replace("__SEEDS__", "{}").replace("__CAN__", "true").replace("__DBNULL__", "false")
    ctx, pg = newpage(br, empty, 390, 844, scheme="dark")
    pg.goto(URL); pg.wait_for_selector("#v-oggi .welcome")
    pg.locator(".wl-opts .qa", has_text="Esplora").click()
    pg.wait_for_function("Object.values(window.__store).reduce((s, c) => s + Object.keys(c).length, 0) > 400 && !document.querySelector('.sheet-wrap')", timeout=30000)
    pg.evaluate("location.hash = 'banco'"); pg.wait_for_selector("#v-banco .bt"); pg.wait_for_timeout(300)
    pg.locator(".bt", has_text="Cookies").locator(".bt-add").click(); pg.locator(".bt", has_text="Cola in vetro").locator(".bt-add").click()
    check(T(pg.locator(".bk-sum").inner_text()) == "2 pezzi\n3,70 € · Modifica", "negli esempi anche la rivendita ha il prezzo")
    pg.screenshot(path=str(SHOTS / "b_esempi_scuro.png"))
    pg.locator(".bk-bar .bk-inv").click(); pg.wait_for_timeout(600)
    ms = pg.evaluate(BANCO_MOVS)
    check(len(ms) == 2 and all(m.get("esempio") for m in ms), "durante la prova le vendite sono segnate come esempio")
    ctx.close()
    br.close()

print("\n".join(errors) if errors else "nessun errore in console")
if fails or errors:
    print(f"\n{len(fails)} controlli falliti, {len(errors)} errori"); sys.exit(1)
print("\ntutto ok")
