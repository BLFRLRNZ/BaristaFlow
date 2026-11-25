"""Comodità d'uso: Oggi per urgenza con i filtri, Indietro che chiude i fogli, movimenti, scorciatoie nei moduli."""
import json, pathlib, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from mock import MOCK_TEMPLATE

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEEDS = json.loads((ROOT / "test" / "dati-test.json").read_text(encoding="utf-8"))
# un secondo lotto scaduto, per «Smaltisci tutti»
SEEDS["documenti"]["d-ddt399"] = {"tipo": "ddt", "numero": "399", "data": "2026-10-30", "fornitoreId": "f-latteria", "note": "", "allegati": [], "creato": 1793260800000,
                                  "righe": [{"id": "r1", "articoloId": "a-burro", "qta": 0.5, "importo": 4.5, "lotto": "LV-3101", "scadenza": "2026-11-20"}]}
URL = (ROOT / "index.html").as_uri()
SHOTS = ROOT / "test" / "screenshot"; SHOTS.mkdir(exist_ok=True)
fails, errors = [], []
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)
T = lambda s: s.replace(" ", " ").replace(" ", " ")
groups = lambda pg: pg.locator("#todo .todo-h h3").all_inner_texts()

mock = MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEEDS)).replace("__CAN__", "true").replace("__DBNULL__", "false")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", has_touch=True)
    pg = ctx.new_page()
    pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00")
    pg.add_init_script(mock)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    pg.goto(URL); pg.wait_for_selector("#v-oggi .tiles"); pg.wait_for_timeout(300)

    # 1. Oggi per urgenza e riquadri che filtrano
    g = groups(pg)
    check(g == ["Da smaltire", "Scade nei prossimi 3 giorni", "Da ordinare", "Prezzi in aumento"], f"gruppi in ordine di urgenza {g}")
    check(T(pg.locator("#g-scaduti .todo-n").inner_text()) == "2" and pg.locator("#g-scaduti .btn", has_text="Smaltisci tutti").count() == 1, "due lotti da smaltire, con «Smaltisci tutti»")
    pg.locator("#tile-scadenza").click(); pg.wait_for_timeout(500)
    check(groups(pg) == ["Scade nei prossimi 3 giorni"] and pg.locator("#tile-scadenza").get_attribute("aria-pressed") == "true", "il riquadro delle scadenze filtra l'elenco")
    check("Mostra tutto" in pg.locator("#da-controllare").inner_text(), "con un filtro c'è «Mostra tutto»")
    pg.screenshot(path=str(SHOTS / "u_filtro.png"))
    pg.locator("#tile-scadenza").click(); pg.wait_for_timeout(200)
    check(groups(pg) == g, "toccato di nuovo, il riquadro toglie il filtro")
    pg.locator("#tile-rincari").click(); pg.wait_for_timeout(300)
    pg.locator("#da-controllare .lnk", has_text="Mostra tutto").click(); pg.wait_for_timeout(200)
    check(groups(pg) == g and pg.locator(".tile[aria-pressed=true]").count() == 0, "«Mostra tutto» toglie il filtro")

    # 2. smaltire: la riga scivola via, Annulla la riporta; «Smaltisci tutti» con un solo Annulla
    pg.locator("#g-scaduti .row", has_text="LV-3101").locator(".btn", has_text="Smaltisci").click(); pg.wait_for_timeout(120)
    moving = pg.evaluate("document.querySelector('#g-scaduti .row[style*=\"pointer-events\"]') !== null")
    pg.wait_for_timeout(700)
    check(moving and pg.locator("#g-scaduti .row").count() == 1, "la riga smaltita esce con un movimento e poi sparisce")
    pg.locator(".toast button", has_text="Annulla").click(); pg.wait_for_timeout(400)
    check(pg.locator("#g-scaduti .row").count() == 2, "Annulla riporta il lotto")
    pg.locator("#g-scaduti .btn", has_text="Smaltisci tutti").click(); pg.wait_for_timeout(900)
    check(pg.locator("#g-scaduti").count() == 0 and "Smaltiti 2 lotti scaduti" in T(pg.locator(".toast").last.inner_text()), "«Smaltisci tutti» smaltisce i due lotti")
    check(pg.locator(".tile b").first.inner_text() == "0", "nessun lotto scaduto dopo lo smaltimento")
    pg.locator(".toast button", has_text="Annulla").last.click(); pg.wait_for_timeout(500)
    check(pg.locator("#g-scaduti .row").count() == 2, "un solo Annulla riporta entrambi i lotti")

    # 3. Indietro chiude il foglio in cima senza lasciare la pagina
    pg.locator("#todo .row", has_text="Crema pasticcera").first.click(); pg.wait_for_timeout(400)
    check(pg.locator(".sheet").count() == 1, "dettaglio del lotto aperto")
    pg.go_back(); pg.wait_for_timeout(450)
    check(pg.locator(".sheet").count() == 0 and pg.locator("#v-oggi").count() == 1, "Indietro chiude il dettaglio e resta su Oggi")
    pg.wait_for_timeout(300)
    check(pg.locator(".sheet-ghost").count() == 0, "il foglio chiuso scende e poi sparisce")
    pg.locator("#todo .row", has_text="Crema pasticcera").first.click(); pg.wait_for_timeout(400)
    pg.locator(".sheet .sh-head [data-act=close]").click(); pg.wait_for_timeout(400)
    check(pg.evaluate("history.state?.barista") != "foglio", "chiudendo con la X la cronologia torna com'era")

    # 4. scorciatoie: produci di nuovo con la quantità abituale, date Oggi e Ieri
    pg.locator("#tabs .fab").click(); pg.wait_for_timeout(350)
    rep = pg.locator(".qrep .row")
    check(rep.count() == 3, f"nel + le produzioni recenti ({rep.count()})")
    nome, q = rep.first.locator("b").inner_text(), T(rep.first.locator(".q").inner_text())
    rep.first.click(); pg.wait_for_timeout(450)
    sel = pg.evaluate("document.querySelector('.sheet [data-k=ricettaId]').selectedOptions[0].textContent")
    check(sel == nome and q.startswith(pg.input_value(".sheet [data-k=qta]").replace(".", ",")), f"modulo già compilato: {sel}, {q}")
    check(pg.locator(".sheet .dchip[aria-pressed=true]").inner_text() == "Oggi", "la data di oggi è già scelta")
    code0 = pg.locator(".sheet .lotcode b").inner_text()
    pg.locator(".sheet .dchip", has_text="Ieri").click(); pg.wait_for_timeout(250)
    code1 = pg.locator(".sheet .lotcode b").inner_text()
    check(pg.input_value(".sheet [data-k=data]") == "2026-11-23" and code1.endswith("231126-1") and code0 != code1, f"«Ieri» cambia data e codice del lotto ({code0} → {code1})")
    pg.screenshot(path=str(SHOTS / "u_produci_di_nuovo.png"))
    # modulo modificato: Indietro chiede conferma, Indietro sulla conferma resta nel modulo
    pg.go_back(); pg.wait_for_timeout(400)
    check(pg.locator(".sheet").count() == 2 and "Chiudere senza salvare" in pg.locator(".sheet").last.inner_text(), "Indietro su un modulo modificato chiede conferma")
    pg.go_back(); pg.wait_for_timeout(400)
    check(pg.locator(".sheet").count() == 1, "Indietro sulla conferma torna al modulo")
    pg.locator(".sheet .sh-head [data-act=close]").click(); pg.wait_for_timeout(300)
    pg.locator(".sheet .btn.dan", has_text="Chiudi senza salvare").click(); pg.wait_for_timeout(450)
    check(pg.locator(".sheet").count() == 0, "chiuso senza salvare")

    # 5. documento d'acquisto: il tipo segue l'ultima volta del fornitore, i suoi articoli in cima
    pg.evaluate("location.hash = 'acquisti'"); pg.wait_for_timeout(500)
    pg.locator('#v-acquisti [data-act="new-doc"]').first.click(); pg.wait_for_timeout(350)
    lv = pg.evaluate("[...document.querySelectorAll('.sheet [data-k=fornitoreId] option')].find(o => o.textContent.includes('Latteria'))?.value")
    pg.select_option(".sheet [data-k=fornitoreId]", lv); pg.wait_for_timeout(250)
    tipo = pg.evaluate("document.querySelector('.sheet [data-act=fseg][aria-pressed=true]').textContent")
    og = pg.evaluate("document.querySelector('.sheet [data-k=\"righe.0.articoloId\"] optgroup')?.label") or ""
    check(tipo == "DDT" and "come l’ultimo documento" in pg.locator(".sheet").inner_text(), f"Latteria manda il DDT: tipo {tipo}")
    check(og == "Di solito da Latteria Val Verde" and pg.evaluate("document.activeElement?.dataset?.k") == "fornitoreId", f"articoli abituali in cima «{og}», il fuoco resta sul fornitore")
    pg.locator(".sheet [data-act=fseg]", has_text="Fattura").click(); pg.wait_for_timeout(150)
    pg.select_option(".sheet [data-k=fornitoreId]", lv); pg.wait_for_timeout(200)
    check(pg.evaluate("document.querySelector('.sheet [data-act=fseg][aria-pressed=true]').textContent") == "Fattura", "se il tipo l'hai scelto tu, resta il tuo")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(250)
    if pg.locator(".sheet .btn.dan").count(): pg.locator(".sheet .btn.dan").click(); pg.wait_for_timeout(400)

    # 6. ogni sezione ricorda dove eri; ritoccarla riporta in cima
    pg.evaluate("location.hash = 'magazzino'"); pg.wait_for_timeout(450)
    pg.evaluate("window.scrollTo(0, 600)"); pg.wait_for_timeout(150)
    pg.evaluate("location.hash = 'acquisti'"); pg.wait_for_timeout(450)
    check(pg.evaluate("window.scrollY") == 0, "una sezione nuova si apre dall'alto")
    pg.evaluate("location.hash = 'magazzino'"); pg.wait_for_timeout(550)
    check(abs(pg.evaluate("window.scrollY") - 600) < 5, "tornando in Magazzino ritrovi il punto in cui eri")
    pg.locator("#tabs a[data-tab=magazzino]").click(); pg.wait_for_timeout(800)
    check(pg.evaluate("window.scrollY") == 0, "toccare di nuovo Magazzino riporta in cima")
    ctx.close()

    # 7. con «riduci movimento» niente animazioni: il foglio si chiude subito
    ctx = br.new_context(viewport={"width": 390, "height": 844}, timezone_id="Europe/Rome", locale="it-IT", reduced_motion="reduce")
    pg = ctx.new_page(); pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00"); pg.add_init_script(mock)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.goto(URL); pg.wait_for_selector("#v-oggi .tiles"); pg.wait_for_timeout(200)
    pg.locator("#todo .row", has_text="Crema pasticcera").first.click(); pg.wait_for_timeout(200)
    pg.keyboard.press("Escape")
    check(pg.locator(".sheet-wrap, .sheet-ghost").count() == 0, "movimento ridotto: chiusura immediata")
    br.close()

print("\nERRORI:" if errors else "\nNessun errore in console")
for e in errors: print("  ", e)
print(f"{len(fails)} controlli falliti")
sys.exit(1 if fails or errors else 0)
