"""Tema in Impostazioni: automatico (come il telefono), chiaro o scuro; resta dopo la riapertura, senza lampi."""
import json, pathlib, sys
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
CHIARO, SCURO = "rgb(241, 241, 236)", "rgb(12, 19, 17)"
STATO = """(() => ({tema: document.documentElement.dataset.theme || '', sfondo: getComputedStyle(document.body).backgroundColor,
  meta: [...document.querySelectorAll('meta[name=theme-color]')].map(m => m.content), salvato: localStorage.getItem('bf-tema') || '',
  premuto: [...document.querySelectorAll('[data-act=tema][aria-pressed=true]')].map(b => b.textContent)}))()"""
# il tema com'è nell'istante in cui il documento è pronto, prima dello script dell'app: così si vede se c'è un lampo
PRIMA = "document.addEventListener('readystatechange', () => { if (document.readyState === 'interactive') window.__primo = getComputedStyle(document.documentElement).colorScheme; }, {once: true});"

mock = MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEEDS)).replace("__CAN__", "true").replace("__DBNULL__", "false")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])

    # 1. telefono in chiaro: in Impostazioni si passa allo scuro e resta
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", color_scheme="light", has_touch=True)
    pg = ctx.new_page(); pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00"); pg.add_init_script(mock); pg.add_init_script(PRIMA)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#v-impostazioni"); pg.wait_for_timeout(300)
    s = pg.evaluate(STATO)
    check([b.strip() for b in pg.locator("[data-act=tema]").all_inner_texts()] == ["Automatico", "Chiaro", "Scuro"], "in Aspetto tre scelte: Automatico, Chiaro, Scuro")
    check(s["premuto"] == ["Automatico"] and s["tema"] == "" and s["sfondo"] == CHIARO, f"di partenza segue il telefono (chiaro) {s}")
    pg.locator("[data-act=tema][data-v=dark]").click(); pg.wait_for_timeout(200)
    s = pg.evaluate(STATO)
    check(s["tema"] == "dark" and s["sfondo"] == SCURO and s["premuto"] == ["Scuro"] and s["salvato"] == "dark", f"Scuro: l'app diventa scura subito {s}")
    check(s["meta"] == ["#0c1311", "#0c1311"], f"anche la barra del browser e del telefono diventa scura {s['meta']}")
    check("Sempre scuro" in pg.locator("#v-impostazioni .setgrp", has_text="Aspetto").inner_text(), "la nota spiega la scelta")
    pg.screenshot(path=str(SHOTS / "t_impostazioni_scuro.png"))
    pg.reload(); pg.wait_for_selector("#v-impostazioni"); pg.wait_for_timeout(300)
    s = pg.evaluate(STATO)
    check(pg.evaluate("window.__primo") == "dark" and s["sfondo"] == SCURO and s["premuto"] == ["Scuro"], "riaperta è scura fin dal primo istante, senza lampo chiaro")
    pg.evaluate("location.hash = 'oggi'"); pg.wait_for_selector("#v-oggi .tiles"); pg.wait_for_timeout(400)
    pg.screenshot(path=str(SHOTS / "t_oggi_scuro.png"))
    ctx.close()

    # 2. telefono in scuro: si sceglie Chiaro, poi si torna ad Automatico
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", color_scheme="dark", has_touch=True)
    pg = ctx.new_page(); pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00"); pg.add_init_script(mock)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#v-impostazioni"); pg.wait_for_timeout(300)
    check(pg.evaluate(STATO)["sfondo"] == SCURO, "con il telefono in scuro, Automatico è scuro")
    pg.locator("[data-act=tema][data-v=light]").click(); pg.wait_for_timeout(200)
    s = pg.evaluate(STATO)
    check(s["tema"] == "light" and s["sfondo"] == CHIARO and s["meta"] == ["#f1f1ec", "#f1f1ec"], f"Chiaro anche col telefono in scuro {s}")
    pg.locator("[data-act=tema][data-v=auto]").click(); pg.wait_for_timeout(200)
    s = pg.evaluate(STATO)
    check(s["tema"] == "" and s["sfondo"] == SCURO and s["salvato"] == "" and s["meta"] == ["#f1f1ec", "#0c1311"], f"Automatico torna a seguire il telefono {s}")
    ctx.close()

    # 3. sul computer, in sola lettura: il tema si cambia lo stesso (è del dispositivo, non dei dati)
    ro = MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(SEEDS)).replace("__CAN__", "false").replace("__DBNULL__", "false")
    ctx = br.new_context(viewport={"width": 1280, "height": 860}, timezone_id="Europe/Rome", locale="it-IT", color_scheme="light")
    pg = ctx.new_page(); pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00"); pg.add_init_script(ro)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.goto(URL + "#impostazioni"); pg.wait_for_selector("#v-impostazioni"); pg.wait_for_timeout(300)
    pg.locator("[data-act=tema][data-v=dark]").click(); pg.wait_for_timeout(200)
    check(pg.evaluate(STATO)["sfondo"] == SCURO, "anche in sola lettura")
    pg.screenshot(path=str(SHOTS / "t_computer_scuro.png"))
    ctx.close()
    br.close()

print("\n".join(errors) if errors else "nessun errore in console")
if fails or errors:
    print(f"\n{len(fails)} controlli falliti, {len(errors)} errori"); sys.exit(1)
print("\ntutto ok")
