"""Un anno di lavoro: centinaia di documenti e lotti. Le pagine restano leggere (si disegnano i più recenti, gli altri
a gruppi), la ricerca guarda in tutto e il passaggio tra le pagine fotografa solo lo schermo."""
import json, pathlib, subprocess, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from mock import MOCK_TEMPLATE

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / "index.html").as_uri()
fails, errors = [], []
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)

# i dati di esempio di oggi, con i documenti moltiplicati per quattro (copie più vecchie, solo storico prezzi)
GEN = r"""
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = ['core.js', 'esempi.js'].map(f => fs.readFileSync(path.join(process.argv[1], 'src', f), 'utf8')).join('\n');
const ctx = {console, Intl, Date, Math, JSON, Map, Set, Array, Object, String, Number, isNaN, isFinite, Promise, setTimeout};
vm.createContext(ctx); vm.runInContext(src + ';globalThis.__b = buildSample;', ctx);
const data = ctx.__b('2026-11-24'), docs = Object.entries(data.documenti);
for (let k = 1; k <= 3; k++) for (const [id, d] of docs) {
  const dd = new Date(d.data + 'T00:00:00Z'); dd.setUTCDate(dd.getUTCDate() - 120 * k);
  data.documenti[id + '-x' + k] = {...d, data: dd.toISOString().slice(0, 10), numero: (d.numero || '') + '-' + k, soloPrezzi: true, creato: d.creato - k * 1e9};
}
process.stdout.write(JSON.stringify(data));
"""
seeds = json.loads(subprocess.run(["node", "-e", GEN, str(ROOT)], capture_output=True, text=True, check=True).stdout)
ndocs = len(seeds["documenti"])
old = min(seeds["documenti"].items(), key=lambda kv: kv[1]["data"])
mock = MOCK_TEMPLATE.replace("__SEEDS__", json.dumps(seeds)).replace("__CAN__", "true").replace("__DBNULL__", "false")

with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", has_touch=True)
    pg = ctx.new_page()
    pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00")
    pg.add_init_script(mock)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    pg.goto(URL); pg.wait_for_selector("#v-oggi .tiles"); pg.wait_for_timeout(300)

    # 1. il passaggio tra le pagine sfuma lo schermo, non tutta la pagina (che con un anno di dati è lunghissima)
    vt = pg.evaluate("[getComputedStyle(document.getElementById('main')).viewTransitionName, getComputedStyle(document.getElementById('topbar')).viewTransitionName]")
    check(vt == ["none", "barra"], f"si fotografa lo schermo, la barra in alto resta ferma {vt}")

    # 2. Acquisti: i 40 più recenti, gli altri a gruppi
    pg.evaluate("location.hash = 'acquisti'"); pg.wait_for_selector("#v-acquisti"); pg.wait_for_timeout(500)
    docs = lambda: pg.locator("#v-acquisti .row[data-act=open-doc]").count()
    h = pg.evaluate("document.documentElement.scrollHeight")
    check(ndocs > 500 and docs() == 40 and h < 7000, f"{ndocs} documenti, ne compaiono 40 e la pagina resta corta ({h}px)")
    check(f"Ne restano {ndocs - 40} più vecchi" in pg.locator("#acq-altri").inner_text(), "la riga dice quanti ne restano")
    pg.locator("#acq-altri").click(); pg.wait_for_timeout(200)
    check(docs() == 80 and pg.evaluate("document.activeElement.id") == "acq-altri", "«Mostra altri» ne aggiunge 40 e resta sotto il dito")
    # la ricerca guarda anche nei documenti non ancora mostrati
    num = old[1]["numero"]
    pg.fill("#q-acq", num); pg.wait_for_timeout(250)
    check(docs() >= 1 and num in pg.locator("#v-acquisti .list").inner_text(), f"la ricerca trova il documento più vecchio ({num}, {old[1]['data']})")
    pg.fill("#q-acq", ""); pg.wait_for_timeout(250)
    check(docs() == 40, "con un'altra ricerca si riparte dai primi 40")

    # 3. Produzione, tutti i lotti
    pg.evaluate("location.hash = 'produzione'"); pg.wait_for_selector("#v-produzione"); pg.wait_for_timeout(300)
    pg.locator("main .seg button", has_text="Tutti").click(); pg.wait_for_timeout(200)
    lots = lambda: pg.locator("#v-produzione .row[data-act=open-lotto]").count()
    check(lots() == 40 and pg.locator("#prod-altri").count() == 1, "tutti i lotti: i 40 più recenti e «Mostra altri»")
    pg.locator("main .seg button", has_text="Con giacenza").click(); pg.wait_for_timeout(200)
    check(pg.locator("#prod-altri").count() == 0, "con giacenza: l'elenco è corto e tutto intero")
    br.close()

print("\n".join(errors) if errors else "nessun errore in console")
if fails or errors:
    print(f"\n{len(fails)} controlli falliti, {len(errors)} errori"); sys.exit(1)
print("\ntutto ok")
