"""Codice dei lotti di produzione scelto in Impostazioni: lettere all'inizio, sigla del prodotto, numerazione (data,
giorno dell'anno, anno, progressivo), cifre, separatore e «Parti da». Di partenza resta il codice di sempre
(BIS-241126-1); l'anteprima segue le scelte prima di salvare; il numero va avanti dal più alto già usato, per prodotto
con la sigla e per tutti senza; con l'anno «Parti da» vale solo per l'anno in cui è stato scritto."""
import datetime, json, pathlib, sys
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
T = lambda s: s.replace(" ", " ").replace(" ", " ")

def imp(pg):
    pg.evaluate("location.hash = 'impostazioni'"); pg.wait_for_selector("#v-impostazioni #cfg-lprev"); pg.wait_for_timeout(250)
def prev(pg): return T(pg.locator("#cfg-lprev b").inner_text())
def lex(pg): return {v: T(pg.locator(f"[data-lex={v}]").inner_text()) for v in ["data", "giuliana", "anno", "progressivo"]}
def salva(pg):
    pg.locator("#cfgForm button[type=submit]").click(); pg.wait_for_timeout(450)
    return T(pg.locator("#toast").inner_text())
def num(pg, v): pg.locator(f".opt:has(input[name=lotNumero][value={v}])").click(); pg.wait_for_timeout(100)
ORA = [datetime.datetime.fromisoformat("2026-11-24T10:00:00+01:00")]
def orologio(pg, iso=None):
    """ogni lotto un minuto dopo il precedente: così «l'ultimo prodotto» dell'anteprima è sempre lo stesso"""
    ORA[0] = datetime.datetime.fromisoformat(iso) if iso else ORA[0] + datetime.timedelta(minutes=1)
    pg.clock.set_fixed_time(ORA[0].isoformat())
def produci(pg, ric):
    """registra un lotto della scheda ric (anche con ingredienti mancanti) e dice il codice mostrato e quello salvato"""
    orologio(pg)
    pg.evaluate("location.hash = 'produzione'"); pg.wait_for_selector("#v-produzione"); pg.wait_for_timeout(200)
    pg.locator("main .btn.pri", has_text="Nuova produzione").click(); pg.wait_for_timeout(250)
    pg.select_option(".sheet [data-k=ricettaId]", ric); pg.wait_for_timeout(250)
    if not pg.input_value(".sheet [data-k=qta]"): pg.fill(".sheet [data-k=qta]", "1"); pg.wait_for_timeout(400)
    shown = T(pg.locator(".sheet .lotcode b").inner_text())
    if pg.locator("#forza").is_visible(): pg.locator("#forza input").check()
    pg.locator(".sheet .btn.pri", has_text="Registra lotto").click(); pg.wait_for_timeout(450)
    if pg.locator("#forza").count() and pg.locator("#forza").is_visible() and not pg.locator("#forza input").is_checked():
        pg.locator("#forza input").check(); pg.locator(".sheet .btn.pri", has_text="Registra lotto").click(); pg.wait_for_timeout(450)
    pid = [w for w in pg.evaluate("window.__writes") if w[1] == "produzioni"][-1][2]
    saved = pg.evaluate(f"window.__store.produzioni['{pid}'].lotto")
    toast = T(pg.locator("#toast").inner_text())
    while pg.locator(".sheet-wrap").count(): pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    return shown, saved, toast

mock = MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEEDS)).replace("__CAN__", "true").replace("__DBNULL__", "false")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", has_touch=True)
    pg = ctx.new_page(); pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00"); pg.add_init_script(mock)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    pg.goto(URL); pg.wait_for_selector("#v-oggi .tiles"); pg.wait_for_timeout(300)

    # 1. di partenza: il codice di sempre, con sigla, data e numero del giorno
    imp(pg)
    check(pg.locator(".setgrp h2", has_text="Codice dei lotti").count() == 1, "in Impostazioni c'è «Codice dei lotti»")
    check(pg.input_value("#cfg-llet") == "" and pg.input_value("#cfg-lsep") == "-" and pg.locator("#cfg-lsig").is_checked()
          and pg.locator("input[name=lotNumero][value=data]").is_checked() and pg.input_value("#cfg-lcif") == "1", "di partenza: niente lettere, trattino, sigla, data e numero del giorno")
    check(pg.locator("#cfg-lpd-f").is_hidden() and pg.locator("#cfg-lpd-h").is_hidden(), "«Parti da» nascosto con la numerazione del giorno")
    check("Tartellette crema e nocciole" in pg.locator("#cfg-lprev").inner_text() and prev(pg) == "TAR-241126-2", f"anteprima: il prossimo lotto dell'ultimo prodotto ({prev(pg)})")
    check(lex(pg) == {"data": "241126-1, 241126-2…", "giuliana": "26328-1, 26328-2…", "anno": "26-1, 26-2…", "progressivo": "1, 2, 3…"}, f"un esempio sotto ogni numerazione {lex(pg)}")
    check("oggi è il 328°" in pg.locator(".opt", has_text="Giorno dell’anno").inner_text(), "il giorno dell'anno di oggi è spiegato")
    pg.locator(".setgrp", has_text="Codice dei lotti").scroll_into_view_if_needed(); pg.wait_for_timeout(150)
    pg.locator(".setgrp", has_text="Codice dei lotti").screenshot(path=str(SHOTS / "l_impostazioni.png"))
    shown, saved, _ = produci(pg, "r-biscotti")
    check(shown == saved == "BIS-241126-1", f"senza toccare niente il codice è quello di sempre ({shown}, {saved})")

    # 2. l'anteprima segue le scelte prima di salvare
    imp(pg)
    check(prev(pg) == "BIS-241126-2", f"anteprima sull'ultimo prodotto, i biscotti ({prev(pg)})")
    pg.fill("#cfg-llet", "l"); pg.wait_for_timeout(100)
    check(prev(pg) == "L-BIS-241126-1", f"lettere all'inizio, in maiuscolo ({prev(pg)})")
    pg.locator("#cfg-lsig").uncheck(); pg.wait_for_timeout(100)
    check(prev(pg) == "L-241126-1", f"senza sigla ({prev(pg)})")
    num(pg, "progressivo")
    check(prev(pg) == "L-1" and pg.locator("#cfg-lpd-f").is_visible() and "a mano" in pg.locator("#cfg-lpd-h").inner_text(), f"progressivo, con «Parti da» ({prev(pg)})")
    pg.select_option("#cfg-lcif", "4"); pg.wait_for_timeout(100)
    check(prev(pg) == "L-0001" and lex(pg)["progressivo"] == "0001, 0002, 0003…" and lex(pg)["data"] == "241126-0001, 241126-0002…", f"4 cifre, anche negli esempi ({prev(pg)}, {lex(pg)['progressivo']})")
    pg.fill("#cfg-lpd", "158"); pg.wait_for_timeout(100)
    check(prev(pg) == "L-0158", f"parti da 158 ({prev(pg)})")
    pg.select_option("#cfg-lsep", label="Nessuno"); pg.wait_for_timeout(100)
    check(prev(pg) == "L0158" and lex(pg)["anno"] == "260001, 260002…", f"senza separatore ({prev(pg)})")
    pg.select_option("#cfg-lsep", label="Barra (/)"); pg.wait_for_timeout(100)
    check(prev(pg) == "L/0158", f"con la barra ({prev(pg)})")
    pg.select_option("#cfg-lsep", label="Trattino (-)"); pg.wait_for_timeout(100)
    check(pg.evaluate("window.__store.impostazioni?.generale?.lotti") is None, "finché non si salva non cambia niente")
    pg.locator("#cfg-lprev").scroll_into_view_if_needed(); pg.wait_for_timeout(150)
    pg.screenshot(path=str(SHOTS / "l_anteprima.png"))

    # 3. salvato: lettere fisse e numero progressivo per tutti i prodotti
    t = salva(pg)
    check(t == "Impostazioni salvate: il prossimo lotto sarà L-0158", f"l'avviso dice il prossimo codice ({t!r})")
    g = pg.evaluate("window.__store.impostazioni.generale.lotti")
    check(g == {"lettere": "L", "sigla": False, "numero": "progressivo", "cifre": 4, "sep": "-", "partiDa": 158, "partiDaAnno": ""}, f"salvato {g}")
    shown, saved, t = produci(pg, "r-biscotti")
    check(shown == saved == "L-0158" and "Lotto L-0158 registrato" in t, f"primo lotto con il nuovo codice ({shown}, {saved}, {t!r})")
    shown, saved, _ = produci(pg, "r-crema")
    check(saved == "L-0159", f"senza sigla si contano tutti insieme ({saved})")
    pg.evaluate("location.hash = 'produzione'"); pg.wait_for_selector("#v-produzione"); pg.wait_for_timeout(250)
    row = pg.locator("#v-produzione .row", has_text="L-0158")
    check(row.count() == 1 and row.locator(".av").inner_text() == "BIS", "nell'elenco il tondino mostra la sigla del prodotto")
    check(pg.locator("#v-produzione .row", has_text="BIS-211126-1").count() == 1, "i lotti già registrati tengono il loro codice")
    pg.evaluate("location.hash = 'schede'"); pg.wait_for_selector("#v-schede"); pg.wait_for_timeout(200)
    pg.locator("#v-schede [data-act=open-ric]", has_text="Biscotti al burro").first.click(); pg.wait_for_timeout(350)
    dh = T(pg.locator(".sheet .dh .muted").inner_text())
    check("sigla BIS" in dh and "sigla lotti" not in dh, f"senza sigla nel codice la scheda dice solo «sigla» ({dh!r})")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)

    # 4. «Parti da» sbagliato: non si salva
    imp(pg)
    check(pg.input_value("#cfg-lpd") == "158" and prev(pg) == "L-0160" and "Crema pasticcera" in pg.locator("#cfg-lprev").inner_text(), f"riaperte, le impostazioni sono quelle salvate; anteprima sull'ultimo prodotto, la crema ({prev(pg)})")
    pg.fill("#cfg-lpd", "abc"); t = salva(pg)
    check("Parti da" in t and pg.evaluate("window.__store.impostazioni.generale.lotti.partiDa") == 158, f"«Parti da» non valido rifiutato ({t!r})")

    # 5. anno e numero con la sigla: ogni prodotto ha la sua numerazione, «Parti da» per quest'anno
    pg.locator("#cfg-lsig").check(); num(pg, "anno"); pg.select_option("#cfg-lcif", "3"); pg.fill("#cfg-lpd", "40"); pg.wait_for_timeout(100)
    check(prev(pg) == "L-CRE-26-040" and "quest’anno" in pg.locator("#cfg-lpd-h").inner_text(), f"anno con sigla, parti da 40 ({prev(pg)})")
    salva(pg)
    g = pg.evaluate("window.__store.impostazioni.generale.lotti")
    check(g["numero"] == "anno" and g["partiDa"] == 40 and g["partiDaAnno"] == "2026" and g["sigla"] is True, f"salvato per il 2026 {g}")
    _, a, _ = produci(pg, "r-crema"); _, b, _ = produci(pg, "r-biscotti"); _, c, _ = produci(pg, "r-biscotti")
    check((a, b, c) == ("L-CRE-26-040", "L-BIS-26-040", "L-BIS-26-041"), f"con la sigla ogni prodotto conta per conto suo ({a}, {b}, {c})")
    pg.evaluate("location.hash = 'schede'"); pg.wait_for_selector("#v-schede"); pg.wait_for_timeout(200)
    pg.locator("#v-schede [data-act=open-ric]", has_text="Biscotti al burro").first.click(); pg.wait_for_timeout(350)
    check("sigla lotti BIS" in T(pg.locator(".sheet .dh .muted").inner_text()), "con la sigla nel codice torna «sigla lotti»")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)

    # 6. anno nuovo: si riparte da 1, il «Parti da» dell'anno prima non vale più
    orologio(pg, "2027-01-10T09:00:00+01:00"); pg.evaluate("location.hash = 'oggi'"); pg.wait_for_selector("#v-oggi"); pg.wait_for_timeout(300)
    imp(pg)
    check(pg.input_value("#cfg-lpd") == "1" and prev(pg) == "L-BIS-27-001", f"nel 2027 si riparte da 1 ({pg.input_value('#cfg-lpd')}, {prev(pg)})")
    num(pg, "giuliana")
    check(prev(pg) == "L-BIS-27010-001" and "oggi è il 10°" in pg.locator(".opt", has_text="Giorno dell’anno").inner_text(), f"giorno dell'anno ({prev(pg)})")
    salva(pg)
    shown, saved, _ = produci(pg, "r-biscotti")
    check(saved == "L-BIS-27010-001", f"lotto con la data giuliana ({saved})")
    imp(pg)
    check(prev(pg) == "L-BIS-27010-002" and pg.locator("#cfg-lpd-f").is_hidden(), f"il prossimo dello stesso giorno ({prev(pg)})")

    # 7. sul computer e in sola lettura
    pg.set_viewport_size({"width": 1280, "height": 900}); pg.wait_for_timeout(300)
    pg.locator(".setgrp", has_text="Codice dei lotti").scroll_into_view_if_needed(); pg.wait_for_timeout(150)
    pg.locator(".setgrp", has_text="Codice dei lotti").screenshot(path=str(SHOTS / "l_impostazioni_desktop.png"))
    ro = br.new_context(viewport={"width": 390, "height": 844}, timezone_id="Europe/Rome", locale="it-IT")
    pr = ro.new_page(); pr.clock.set_fixed_time("2026-11-24T10:00:00+01:00")
    pr.add_init_script(MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEEDS)).replace("__CAN__", "false").replace("__DBNULL__", "false"))
    pr.goto(URL + "#impostazioni"); pr.wait_for_selector("#cfg-lprev"); pr.wait_for_timeout(300)
    check(pr.locator("#cfg-llet").is_disabled() and pr.locator("input[name=lotNumero]").first.is_disabled(), "in sola lettura le scelte sono bloccate")
    ro.close()

    br.close()

errors = [e for e in errors if "favicon" not in e]
check(not errors, f"nessun errore nella console {errors[:3]}")
print("\n" + ("TUTTO OK" if not fails else f"{len(fails)} CONTROLLI FALLITI"))
sys.exit(1 if fails else 0)
