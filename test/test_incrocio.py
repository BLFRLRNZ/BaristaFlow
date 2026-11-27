"""Incrocio di lotti, scadenze, DDT e fatture con il caso della farina: il DDT porta lotto e scadenza, la fattura differita
completa i prezzi senza caricare di nuovo la merce, dal lotto e dalla scheda di produzione si risale a DDT e fattura,
e la merce dei DDT che mancano nell'app entra con la fattura (oppure, se si sceglie, solo nello storico prezzi)."""
import base64, io, json, pathlib, re, sys
from xml.sax.saxutils import escape
from playwright.sync_api import sync_playwright
import pypdf
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from mock import MOCK_TEMPLATE

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / "index.html").as_uri()
SHOTS = ROOT / "test" / "screenshot"; SHOTS.mkdir(exist_ok=True)
DIR = SHOTS / "incrocio"; DIR.mkdir(exist_ok=True)
fails, errors = [], []
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)
T = lambda s: re.sub(r"[  ]", " ", s)
COUNT = "Object.values(window.__store).reduce((s, c) => s + Object.keys(c).length, 0)"

src = (ROOT / "test" / "test_fatture.py").read_text()
exec(src[src.index("def fattura("):src.index("def tlv(")])   # la stessa fattura XML di test_fatture.py
MOL = ("Molino del Borgo S.r.l.", "55555555555")
F00 = {"codice": "F00S25", "descr": "FARINA 00 SACCO 25KG", "um": "SC", "prezzo": 22.00}
def xml(nome, numero, righe, ddt=(), tipo="TD24"):
    p = DIR / nome; p.write_bytes(fattura(numero, "2026-11-24", *MOL, righe, tipo=tipo, ddt=ddt)); return p

GRAB = """(() => { const orig = window.claude.use; window.claude.use = name => orig(name).then(c => name !== 'downloads' || !c ? c : {save: async x => {
  const d = x.data; let s = ''; if (d instanceof Uint8Array) for (let i = 0; i < d.length; i += 8192) s += String.fromCharCode(...d.subarray(i, i + 8192));
  (window.__dl ||= []).push({filename: x.filename, b64: d instanceof Uint8Array ? btoa(s) : null}); return c.save(x); }}); })();"""
mock = MOCK_TEMPLATE.replace("__SEEDS__", "{}").replace("__CAN__", "true").replace("__DBNULL__", "false")

def act(pg, a, **data):   # come toccare un pulsante dell'app con quell'azione
    pg.evaluate("""([a, data]) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.act = a;
      for (const [k, v] of Object.entries(data)) b.dataset[k] = v; document.body.appendChild(b); b.click(); b.remove(); }""", [a, {k: str(v) for k, v in data.items()}])
    pg.wait_for_timeout(450)
top = lambda pg: pg.locator(".sheet-wrap").last
def close_all(pg):
    for _ in range(6):
        if not pg.locator(".sheet-wrap").count(): break
        pg.keyboard.press("Escape"); pg.wait_for_timeout(250)
def docs(pg, js):
    return pg.evaluate(f"Object.entries(window.__store.documenti).map(([id, d]) => ({{id, ...d}})).filter(d => {js})")
def caricato(pg, art):   # merce entrata in magazzino: righe dei documenti che caricano (non «solo storico prezzi»)
    return pg.evaluate(f"Object.values(window.__store.documenti).filter(d => !d.soloPrezzi).flatMap(d => d.righe || []).filter(r => r.articoloId === '{art}').reduce((s, r) => s + (+r.qta || 0), 0)")
def toast(pg): return T(pg.locator("#toast .toast").last.inner_text())
def statuses(pg):
    return {T(r.locator("b").inner_text()): T(r.locator(".chip").inner_text()) for r in pg.locator(".sheet-wrap").first.locator(".list .row").all()}

def ddt_form(pg, forn, art, numero, data, qta, lotto, scad):
    close_all(pg); act(pg, "new-doc"); sh = top(pg)
    sh.locator("select[data-k=fornitoreId]").select_option(forn); pg.wait_for_timeout(250)
    sh.locator('[data-act=fseg][data-k=tipo][data-v=ddt]').click(); pg.wait_for_timeout(250)
    sh.locator("[data-k=numero]").fill(numero)
    sh.locator("input[data-k=data]").fill(data)
    sh.locator('select[data-k="righe.0.articoloId"]').select_option(art); pg.wait_for_timeout(250)
    units = [T(x) for x in sh.locator('select[data-k="righe.0.unita"] option').all_inner_texts()]
    sh.locator('[data-k="righe.0.qta"]').fill(qta)
    sh.locator('[data-k="righe.0.lotto"]').fill(lotto)
    sh.locator('[data-k="righe.0.scadenza"]').fill(scad)
    sh.locator(".btn.pri").last.click(); pg.wait_for_timeout(600)
    return units
def importa(pg, path, numero):   # apre l'elenco delle fatture lette e poi quella da controllare
    close_all(pg)
    pg.goto(URL + "#acquisti"); pg.wait_for_selector("#v-acquisti")
    pg.locator("main .btn", has_text="Importa fatture").click(); pg.wait_for_timeout(300)
    pg.set_input_files(".sheet input[data-file=fe]", [str(path)])
    pg.wait_for_selector(".sheet .list .row"); pg.wait_for_timeout(300)
    stato = statuses(pg).get(f"Fattura n. {numero} del 24/11/2026", "")
    if stato in ("Già importata", "Importata"): return stato, None
    pg.locator(".sheet .row", has_text=f"Fattura n. {numero}").click(); pg.wait_for_timeout(400)
    return stato, top(pg)
def note_of(t): return T(t.locator(".note").first.inner_text()) if t.locator(".note").count() else ""
hint = lambda t, i: T(t.locator(f"#fe-h-{i}").inner_text())

with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", has_touch=True)
    pg = ctx.new_page(); pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00"); pg.add_init_script(mock); pg.add_init_script(GRAB)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    pg.goto(URL); pg.wait_for_selector("#v-oggi .welcome")
    pg.locator(".wl-opts .qa", has_text="Esplora").click()
    pg.wait_for_function(f"{COUNT} > 400 && !document.querySelector('.sheet-wrap')", timeout=30000)
    FORN = pg.evaluate("Object.entries(window.__store.fornitori).find(([id, f]) => f.nome === 'Molino del Borgo')[0]")
    FAR = pg.evaluate("Object.entries(window.__store.articoli).find(([id, a]) => a.nome === 'Farina 00')[0]")
    ZUC = pg.evaluate("Object.entries(window.__store.articoli).find(([id, a]) => a.nome === 'Zucchero semolato')[0]")
    far0, zuc0 = caricato(pg, FAR), caricato(pg, ZUC)

    # 1. DDT a mano: la riga porta lotto e scadenza e carica la merce
    units = ddt_form(pg, FORN, FAR, "45", "2026-11-20", "50", "MR-2611A", "2027-05-31")
    check(units == ["kg", "g"], f"la farina si registra in kg o g: {units}")
    d45 = docs(pg, "d.tipo === 'ddt' && d.numero === '45'")
    check(len(d45) == 1 and d45[0]["righe"][0]["lotto"] == "MR-2611A" and d45[0]["righe"][0]["scadenza"] == "2027-05-31" and d45[0]["righe"][0].get("importo") is None, "DDT 45 con lotto e scadenza, ancora senza prezzi")
    d45 = d45[0]; KEY = f"{d45['id']}:{d45['righe'][0]['id']}"
    check(caricato(pg, FAR) - far0 == 50, "50 kg di farina in magazzino")

    # 2. fattura differita che cita il DDT 45: prezzi completati, nessun doppio carico
    stato, t = importa(pg, xml("IT55555555555_00312.xml", "312", [{**F00, "qta": 2, "totale": 44.00}], ddt=[("45", "2026-11-20")]), "312")
    check(stato == "Da controllare: 1 riga", f"prima volta col fornitore: la riga è da controllare ({stato})")
    check(note_of(t) == "Fattura dei DDT n. 45 del 20/11/2026: li hai già registrati.", f"avviso: {note_of(t)}")
    check(t.locator('[data-k="solo"]').is_checked() and t.locator('[data-k="carica"]').count() == 0, "merce già in magazzino; niente da caricare in più")
    check(T(t.locator('[data-k="righe.0.a"] option:checked').inner_text()) == "Farina 00" and t.locator('[data-k="righe.0.fat"]').input_value() == "25", "«SACCO 25KG»: Farina 00, 1 SC = 25 kg")
    check(hint(t, 0) == "Già in magazzino con i DDT: 50 kg · 0,88 € al kg" and not t.locator("#fe-l-0").is_visible(), f"riga: {hint(t, 0)}")
    t.locator(".btn.pri", has_text="Importa fattura").click(); pg.wait_for_timeout(800)
    check(toast(pg) == "Fattura collegata ai DDT: prezzi completati", f"avviso finale: {toast(pg)}")
    d = docs(pg, f"d.id === '{d45['id']}'")[0]
    check(d["righe"][0].get("importo") == 44 and d.get("fatturaRif") == "n. 312 del 24/11/2026", f"DDT 45: {d['righe'][0].get('importo')} €, {d.get('fatturaRif')}")
    check(not docs(pg, "d.numero === '312'") and caricato(pg, FAR) - far0 == 50, "nessun doppio carico di farina")
    ab = pg.evaluate(f"window.__store.fornitori['{FORN}'].abbinamenti || {{}}")
    check(ab.get("c:f00s25") == {"a": FAR, "f": 25}, f"il fornitore ricorda l'abbinamento {ab}")

    # 3. la fattura dopo è pronta: 3 sacchi = 75 kg, lotto e scadenza dall'XML
    stato, t = importa(pg, xml("IT55555555555_00314.xml", "314", [{**F00, "qta": 3, "totale": 66.00, "lotto": "MR-2611C", "scad": "2027-06-15"}], tipo="TD01"), "314")
    check(stato == "Pronta", f"seconda fattura: {stato}")
    t.locator(".btn.pri", has_text="Importa fattura").click(); pg.wait_for_timeout(800)
    d = docs(pg, "d.numero === '314'")
    check(len(d) == 1 and d[0]["righe"][0]["qta"] == 75 and d[0]["righe"][0]["lotto"] == "MR-2611C" and d[0]["righe"][0]["scadenza"] == "2027-06-15", "75 kg con lotto e scadenza")

    # 4. dal lotto della farina: fornitore, DDT e fattura
    close_all(pg); act(pg, "open-acq", id=KEY)
    txt = T(top(pg).inner_text())
    check("MR-2611A" in txt and "31/05/2027" in txt, "dettaglio del lotto: lotto del fornitore e scadenza")
    check("Da Molino del Borgo · DDT n. 45 del 20/11/2026 · fattura n. 312 del 24/11/2026" in txt, "dettaglio del lotto: fornitore, DDT e fattura")
    pg.wait_for_timeout(200); top(pg).screenshot(path=str(SHOTS / "incrocio_lotto.png"))

    # 5. produzione con quel lotto, poi la scheda in PDF
    RID = pg.evaluate(f"Object.entries(window.__store.ricette).filter(([id, r]) => !r.archiviato && (r.ingredienti || []).some(g => g.tipo !== 'ric' && g.refId === '{FAR}')).map(([id, r]) => id)")[0]
    close_all(pg); act(pg, "new-prod", ric=RID); sh = top(pg); pg.wait_for_timeout(300)
    inp = sh.locator('input[aria-label^="Farina 00, quantità dal"]')
    need = sum(float(inp.nth(i).input_value().replace(",", ".") or 0) for i in range(inp.count()))
    for i in range(inp.count()): inp.nth(i).fill("0")
    sh.locator('input[aria-label="Farina 00, quantità dal Lotto MR-2611A"]').fill(f"{need:g}".replace(".", ","))
    before = set(pg.evaluate("Object.keys(window.__store.produzioni)"))
    sh.locator(".btn.pri").last.click(); pg.wait_for_timeout(800)
    new = [k for k in pg.evaluate("Object.keys(window.__store.produzioni)") if k not in before]
    check(len(new) == 1 and any(c["lotId"] == KEY for c in pg.evaluate(f"window.__store.produzioni['{new[0]}'].consumi")), f"produzione con il lotto MR-2611A ({need:g})")
    close_all(pg); act(pg, "open-lotto", id=new[0])
    txt = T(top(pg).inner_text())
    check("MR-2611A" in txt and "DDT n. 45 del 20/11/2026" in txt and "fattura n. 312 del 24/11/2026" in txt, "nel lotto prodotto: lotto, DDT e fattura della farina")
    top(pg).locator("[data-act=pdf-lotto]").click(); pg.wait_for_timeout(800)
    dl = pg.evaluate("window.__dl || []")
    check(len(dl) == 1 and dl[0]["b64"], "scheda di produzione in PDF")
    pdf = base64.b64decode(dl[0]["b64"]); (DIR / "scheda.pdf").write_bytes(pdf)
    flat = re.sub(r"\s+", " ", " ".join(T(x.extract_text()) for x in pypdf.PdfReader(io.BytesIO(pdf)).pages))
    check("MR-2611A 31/05/2027 Molino del Borgo · DDT n. 45 del 20/11/2026 · fattura n. 312 del 24/11/2026" in flat, "nel PDF la provenienza della farina ha fornitore, DDT e fattura")

    # 6. fattura di due DDT, uno solo registrato: la merce dell'altro (zucchero) entra con la fattura
    ddt_form(pg, FORN, FAR, "48", "2026-11-22", "25", "MR-2611B", "2027-05-31")
    far1 = caricato(pg, FAR)
    x313 = xml("IT55555555555_00313.xml", "313", [{**F00, "qta": 1, "totale": 22.00},
        {"descr": "ZUCCHERO SEMOLATO 1KG", "qta": 10, "um": "PZ", "prezzo": 1.06, "totale": 10.60, "lotto": "ZS-0911", "scad": "2027-09-30"}], ddt=[("48", "2026-11-22"), ("49", "2026-11-23")])
    stato, t = importa(pg, x313, "313")
    check(stato == "Da controllare: 1 DDT non registrato", f"nell'elenco: {stato}")
    check(note_of(t) == "Fattura dei DDT n. 48 del 22/11/2026, n. 49 del 23/11/2026: ne hai registrati 1. Manca il DDT n. 49 del 23/11/2026.", f"avviso: {note_of(t)}")
    check(t.locator('[data-k="solo"]').is_checked() and t.locator('[data-k="carica"]').is_checked(), "prezzi del DDT 48 da completare e merce del 49 da caricare")
    check(hint(t, 0) == "Già in magazzino con i DDT: 25 kg · 0,88 € al kg" and not t.locator("#fe-l-0").is_visible(), f"farina: {hint(t, 0)}")
    check(hint(t, 1) == "Da caricare: 10 kg · 1,06 € al kg" and t.locator("#fe-l-1").is_visible() and t.locator('[data-k="righe.1.lotto"]').input_value() == "ZS-0911", f"zucchero: {hint(t, 1)}")
    pg.wait_for_timeout(200); t.screenshot(path=str(SHOTS / "incrocio_ddt_mancante.png"))
    t.locator(".btn.pri", has_text="Importa fattura").click(); pg.wait_for_timeout(800)
    check(toast(pg) == "Prezzi dei DDT completati e merce mancante caricata", f"avviso finale: {toast(pg)}")
    d48 = docs(pg, "d.tipo === 'ddt' && d.numero === '48'")[0]
    check(d48["righe"][0].get("importo") == 22 and d48.get("fatturaRif") == "n. 313 del 24/11/2026", "DDT 48 completato")
    d313 = docs(pg, "d.numero === '313'")
    check(len(d313) == 1 and not d313[0]["soloPrezzi"] and [(r["articoloId"], r["qta"], r["lotto"], r["scadenza"], r["importo"]) for r in d313[0]["righe"]] == [(ZUC, 10, "ZS-0911", "2027-09-30", 10.6)], f"fattura 313 con lo zucchero: {[(r['articoloId'], r['qta'], r['lotto']) for r in d313[0]['righe']] if d313 else '-'}")
    check("DDT n. 49 del 23/11/2026" in d313[0]["note"], "la nota dice di quale DDT è la merce")
    check(caricato(pg, ZUC) - zuc0 == 10 and caricato(pg, FAR) == far1, "zucchero +10 kg, farina invariata")
    stato, _ = importa(pg, x313, "313")
    check(stato == "Già importata", f"riaprendola: {stato}")

    # 7. stesso articolo in due DDT, uno solo registrato: entra solo la parte che manca
    ddt_form(pg, FORN, FAR, "50", "2026-11-23", "25", "MR-2611D", "2027-05-31")
    far2 = caricato(pg, FAR)
    stato, t = importa(pg, xml("IT55555555555_00315.xml", "315", [{**F00, "qta": 2, "totale": 44.00}], ddt=[("50", "2026-11-23"), ("51", "2026-11-24")]), "315")
    check(hint(t, 0) == "Con i DDT: 25 kg · Da caricare: 25 kg · 0,88 € al kg" and t.locator("#fe-l-0").is_visible(), f"farina: {hint(t, 0)}")
    t.locator('[data-k="righe.0.q"]').fill("1"); pg.wait_for_timeout(200)
    check(hint(t, 0) == "Già in magazzino con i DDT: 25 kg · 1,76 € al kg" and not t.locator("#fe-l-0").is_visible(), f"scrivendo 1 sacco la riga si aggiorna subito (stesso totale, prezzo al kg doppio): {hint(t, 0)}")
    t.locator('[data-k="righe.0.q"]').fill("2"); pg.wait_for_timeout(200)
    check(t.locator("#fe-l-0").is_visible(), "con 2 sacchi tornano lotto e scadenza")
    t.locator('[data-k="righe.0.lotto"]').fill("MR-2611E"); t.locator('[data-k="righe.0.scad"]').fill("2027-06-30")
    t.locator(".btn.pri", has_text="Importa fattura").click(); pg.wait_for_timeout(800)
    d315 = docs(pg, "d.numero === '315'")
    check(len(d315) == 1 and not d315[0]["soloPrezzi"] and [(r["qta"], r["lotto"], r["scadenza"], r["importo"]) for r in d315[0]["righe"]] == [(25, "MR-2611E", "2027-06-30", 22)], f"fattura 315: {[(r['qta'], r['lotto'], r['importo']) for r in d315[0]['righe']] if d315 else '-'}")
    check(docs(pg, "d.tipo === 'ddt' && d.numero === '50'")[0]["righe"][0].get("importo") == 22 and caricato(pg, FAR) - far2 == 25, "DDT 50 completato e solo 25 kg in più")

    # 8. senza spunta: la merce del DDT mancante resta solo nello storico prezzi
    ddt_form(pg, FORN, FAR, "52", "2026-11-21", "25", "MR-2611F", "2027-05-31")
    zuc1 = caricato(pg, ZUC)
    stato, t = importa(pg, xml("IT55555555555_00316.xml", "316", [{**F00, "qta": 1, "totale": 22.00},
        {"descr": "ZUCCHERO SEMOLATO 1KG", "qta": 5, "um": "PZ", "prezzo": 1.06, "totale": 5.30}], ddt=[("52", "2026-11-21"), ("53", "2026-11-22")]), "316")
    t.locator('[data-k="carica"]').uncheck(); pg.wait_for_timeout(300); t = top(pg)
    check(hint(t, 1) == "Solo storico prezzi: 5 kg · 1,06 € al kg" and not t.locator("#fe-l-1").is_visible(), f"zucchero: {hint(t, 1)}")
    t.locator(".btn.pri", has_text="Importa fattura").click(); pg.wait_for_timeout(800)
    check(toast(pg) == "Fattura collegata ai DDT: prezzi completati", f"avviso finale: {toast(pg)}")
    d316 = docs(pg, "d.numero === '316'")
    check(len(d316) == 1 and d316[0]["soloPrezzi"] and caricato(pg, ZUC) == zuc1, "fattura 316 solo storico prezzi: zucchero non caricato")

    close_all(pg)
    ctx.close(); br.close()

print("\nERRORI CONSOLE:" if errors else "\nNessun errore in console")
for e in errors: print("  ", e)
print(f"\n{len(fails)} controlli falliti")
sys.exit(1 if fails or errors else 0)
