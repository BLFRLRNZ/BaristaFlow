import json, pathlib, sys, re
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEEDS = json.loads((ROOT / "test" / "dati-test.json").read_text(encoding="utf-8"))
SHOTS = ROOT / "test" / "screenshot"; SHOTS.mkdir(exist_ok=True)
URL = (ROOT / "index.html").as_uri()

MOCK = r"""
(() => {
  const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
  const store = JSON.parse(JSON.stringify(__SEEDS__));
  for (const c of ['fornitori','articoli','documenti','ricette','produzioni','movimenti','impostazioni']) store[c] ||= {};
  const subs = {};
  const snap = c => { const docs = Object.entries(store[c] || {}).map(([id, v]) => { const d = deepFreeze(JSON.parse(JSON.stringify(v))); return {id, exists: true, data: () => d, metadata: {fromCache: false, hasPendingWrites: false}}; }); return {docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {fromCache: false, hasPendingWrites: false}}; };
  const emit = c => setTimeout(() => (subs[c] || []).forEach(f => f(snap(c))), 25);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const db = {
    collection(c) { return {
      onSnapshot(next, err) { (subs[c] ||= []).push(next); emit(c); return () => {}; },
      doc(id) { return {
        async set(v) { await wait(15); if (JSON.stringify(v).length > 250000) throw {code: 'invalid_argument'}; (store[c] ||= {})[id] = JSON.parse(JSON.stringify(v)); window.__writes.push(['set', c, id]); emit(c); },
        async delete() { await wait(15); if (store[c]) delete store[c][id]; window.__writes.push(['del', c, id]); emit(c); },
        async get() { const v = store[c]?.[id]; return {id, exists: !!v, data: () => v}; }
      }; }
    }; }
  };
  window.__store = store; window.__writes = []; window.__downloads = [];
  let n = 0;
  const caps = {
    db,
    user: {can: async () => true, isOwner: async () => true, canEdit: async () => true, id: async () => 'u1'},
    downloads: {save: async ({filename, data}) => { window.__downloads.push({filename, data: typeof data === 'string' ? data : '[binario]'}); return {status: 'saved'}; }},
    assets: {upload: async (blob, opts) => { n++; return {id: 'asset' + String(n).padStart(27, '0'), url: '/_blob/x' + n, sizeBytes: blob.size, contentType: (opts && opts.type) || blob.type}; }, delete: async () => ({deleted: true}), list: async () => ({assets: [], usage: {}})}
  };
  window.claude = {use: name => new Promise(r => setTimeout(() => r(caps[name] ?? null), 40))};
})();
""".replace("__SEEDS__", json.dumps(SEEDS))

errors = []
fails = []
def check(cond, msg):
    print(("OK   " if cond else "FAIL ") + msg)
    if not cond: fails.append(msg)

def text(page, sel):
    return page.locator(sel).first.inner_text()

with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", color_scheme="light")
    page = ctx.new_page()
    page.clock.set_fixed_time("2026-11-24T10:00:00+01:00")
    page.add_init_script(MOCK)
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.goto(URL)
    page.wait_for_selector("#v-oggi", timeout=8000)
    page.wait_for_timeout(400)

    # --- Oggi
    tiles = page.locator(".tile b").all_inner_texts()
    check(tiles == ["1", "3", "1", "2"], f"indicatori Oggi {tiles}")
    labs = page.locator(".lab .lab-lot").all_inner_texts()
    check(labs == ["CRE-231126-1", "TAR-241126-1", "BIS-211126-1"], f"etichette in vetrina {labs}")
    res = page.locator(".lab").nth(0).locator(".lab-grid b").all_inner_texts()
    check(res[2].replace(" ", " ") == "600 g", f"residuo crema {res}")
    da = page.locator("#todo .row").all_inner_texts()
    check(len(da) == 7, f"righe da controllare = {len(da)}")
    check("Burro" in da[0] and "Scaduto ieri" in da[0], "primo da controllare: burro scaduto ieri")
    page.screenshot(path=str(SHOTS / "m_oggi.png"), full_page=True)

    # --- dettaglio lotto tartellette (tracciabilità con semilavorato)
    page.locator(".lab", has_text="TAR-241126-1").click()
    page.wait_for_selector(".sheet .big")
    body = text(page, ".sheet .sh-body")
    check("Crema pasticcera" in body and "CRE-231126-1" in body, "lotto TAR mostra la crema e il suo lotto")
    check("LV-3240" in body, "dentro la crema si vede il lotto del latte LV-3240")
    check("Fattura n. 889 del 20/11/2026" in body, "documento d'acquisto collegato")
    check("Residuo" in body and "14 pz" in body.replace(" pz", " pz"), "residuo 14 pz")
    m = re.search(r"([\d,]+) € in totale", body.replace(" ", " "))
    check(m and m.group(1) == "4,30", f"costo lotto TAR {m.group(1) if m else None}")
    page.wait_for_timeout(350); page.screenshot(path=str(SHOTS / "m_lotto_tar.png"), full_page=False)
    # apre il documento dalla tracciabilità
    page.locator(".sheet .lnk", has_text="Fattura n. 889").first.click()
    page.wait_for_timeout(200)
    check(page.locator(".sheet-wrap").count() == 2, "documento aperto sopra al lotto")
    body2 = page.locator(".sheet-wrap").nth(1).inner_text()
    check("Dolciaria Ingrosso" in body2 and "3IT078CS012" in body2, "dettaglio fattura con lotti")
    page.keyboard.press("Escape"); page.keyboard.press("Escape")
    page.wait_for_timeout(150)
    check(page.locator(".sheet-wrap").count() == 0, "Esc chiude i fogli")

    # --- schede tecniche
    page.goto(URL + "#schede"); page.wait_for_selector("#v-schede")
    cards = page.locator(".rc").all_inner_texts()
    check(len(cards) == 3, f"3 schede ({len(cards)})")
    bis = [c for c in cards if "Biscotti" in c][0].replace(" ", " ")
    check("0,057 €" in bis, f"costo biscotti al pezzo nella card: {bis!r}")
    page.locator(".rc", has_text="Biscotti al burro").click()
    page.wait_for_selector(".sheet .labeltext")
    sb = text(page, ".sheet .sh-body").replace(" ", " ")
    check("farina di GRANO tenero tipo 00, burro (LATTE), zucchero, UOVA" in sb, "elenco ingredienti ordinato e con allergeni")
    check("Può contenere tracce di frutta a guscio" in sb, "tracce frutta a guscio")
    fc = re.search(r"Food cost\n([\d,]+)%", sb)
    check(fc and fc.group(1) == "10,5", f"food cost {fc.group(1) if fc else None}")
    page.wait_for_timeout(350); page.screenshot(path=str(SHOTS / "m_scheda_bis.png"), full_page=False)
    page.locator(".sheet .btn", has_text="Copia testo").click()
    page.keyboard.press("Escape")
    page.locator(".rc", has_text="Tartellette").click()
    page.wait_for_selector(".sheet .labeltext")
    lt = text(page, ".sheet .labeltext")
    check(lt.startswith("Ingredienti: crema pasticcera (LATTE intero, zucchero, UOVA, amido di mais), farina di GRANO"), f"ingrediente composto: {lt[:120]!r}")
    page.keyboard.press("Escape")

    # --- nuova produzione biscotti (FEFO, lotto scaduto escluso)
    page.goto(URL + "#produzione"); page.wait_for_selector("#v-produzione")
    page.locator("main .btn.pri", has_text="Nuova produzione").click()
    page.wait_for_selector(".sheet select[data-k=ricettaId]")
    page.select_option(".sheet select[data-k=ricettaId]", "r-biscotti")
    page.wait_for_selector(".sheet .lotpick")
    cards = page.locator(".sheet .card").all_inner_texts()
    burro = [c for c in cards if c.startswith("Burro")][0]
    check("LV-3211" in burro and "LV-3150" not in burro and "1 lotto scaduto escluso" in burro, "burro: proposto LV-3211, scaduto escluso")
    vals = page.locator(".sheet .lotpick input").evaluate_all("els => els.map(e => e.value)")
    check(vals[:4] == ["500", "250", "200", "2"], f"quantità proposte {vals[:4]}")
    chips = page.locator(".sheet [id^=sum-]").all_inner_texts()
    check(all(c == "Quantità coperta" for c in chips), f"tutto coperto {chips}")
    check(page.locator(".sheet [data-k=scadenza]").input_value() == "2026-12-09", "scadenza calcolata +15 giorni")
    page.fill(".sheet [data-k=qta]", "30")
    page.wait_for_timeout(450)
    vals = page.locator(".sheet .lotpick input").evaluate_all("els => els.map(e => e.value)")
    check(vals[:4] == ["250", "125", "100", "1"], f"quantità dopo resa 30 {vals[:4]}")
    page.fill(".sheet [data-k=qta]", "60"); page.wait_for_timeout(450)
    page.fill(".sheet [data-k=operatore]", "Anna")
    page.screenshot(path=str(SHOTS / "m_produzione_form.png"), full_page=False)
    page.locator(".sheet .btn.pri", has_text="Registra lotto").click()
    page.wait_for_selector(".sheet .big:has-text('BIS-241126-1')", timeout=4000)
    check(True, "lotto BIS-241126-1 creato e aperto")
    check(page.evaluate("document.fonts.ready.then(() => [...document.fonts].some(f => f.family.replace(/\"/g, '') === 'Instrument Sans' && f.status === 'loaded'))"), "carattere Instrument Sans caricato dall'app, senza rete")
    pid = [w for w in page.evaluate("window.__writes") if w[1] == "produzioni"][-1][2]
    prod = page.evaluate(f"window.__store.produzioni['{pid}']")
    check([ (c['lotId'], c['qta']) for c in prod['consumi']] == [("d-fatt1187:r1", 0.5), ("d-ddt452:r1", 0.25), ("d-fatt889:r1", 0.2), ("d-fatt889:r2", 2)], f"consumi salvati {prod['consumi']}")
    check(prod["allergeni"] == ["glutine", "uova", "latte"] and prod["tracce"] == ["frutta_guscio"], "allergeni e tracce salvati sul lotto")
    # scarico di 10 pezzi
    page.locator(".sheet .btn.pri", has_text="Registra scarico").click()
    page.wait_for_selector(".sheet [data-k=qta]")
    page.fill(".sheet-wrap >> nth=1 >> [data-k=qta]", "10")
    page.locator(".sheet-wrap").nth(1).locator(".btn.pri", has_text="Registra").click()
    page.wait_for_timeout(300)
    kv = page.locator(".sheet .kv").first.inner_text().replace(" ", " ")
    check("Residuo\n50 pz" in kv, f"residuo dopo scarico: {kv!r}")
    page.wait_for_timeout(350); page.screenshot(path=str(SHOTS / "m_lotto_nuovo.png"), full_page=False)
    page.keyboard.press("Escape")

    # --- magazzino: farina 25 - 0,5 - 0,3 - 0,5 = 23,7
    page.goto(URL + "#magazzino"); page.wait_for_selector("#v-magazzino")
    far = page.locator(".row", has_text="Farina 00").inner_text().replace(" ", " ")
    check("23,7 kg" in far, f"giacenza farina {far!r}")
    bur = page.locator(".row", has_text="Burro").inner_text().replace(" ", " ")
    check("4,6 kg" in bur and "Scaduto 750 g" in bur, f"giacenza burro {bur!r}")
    acq = page.locator(".row", has_text="Acqua").inner_text()
    check("Sotto scorta" in acq, "acqua sotto scorta")
    page.screenshot(path=str(SHOTS / "m_magazzino.png"), full_page=True)
    # ricerca per lotto fornitore
    page.fill("#q-mag", "lv-3211")
    page.wait_for_timeout(150)
    check(page.locator("main .row").count() == 1 and page.locator("#q-mag").evaluate("e => e === document.activeElement"), "ricerca per lotto con focus mantenuto")
    page.fill("#q-mag", "")
    # richiamo: dove è finito il burro LV-3211
    page.locator(".row", has_text="Burro").click()
    page.wait_for_selector(".sheet .list .row")
    page.locator(".sheet .row", has_text="LV-3211").click()
    page.wait_for_timeout(200)
    rec = page.locator(".sheet-wrap").nth(1).inner_text()
    check("TAR-241126-1" in rec and "BIS-241126-1" in rec, "lotto burro LV-3211: usato in TAR e BIS")
    page.keyboard.press("Escape"); page.keyboard.press("Escape")
    # smaltimento burro scaduto dalla home
    page.goto(URL + "#oggi"); page.wait_for_selector("#v-oggi")
    page.locator("#todo .row", has_text="Burro").locator(".btn", has_text="Smaltisci").click()
    page.wait_for_timeout(800)
    check("Annulla" in page.locator("#toast").inner_text(), "smaltimento con Annulla, dopo che la riga è scivolata via")
    tiles = page.locator(".tile b").all_inner_texts()
    check(tiles[0] == "0", f"dopo lo smaltimento nessun lotto scaduto: {tiles}")

    # --- registra un acquisto con articolo nuovo creato al volo
    page.goto(URL + "#acquisti"); page.wait_for_selector("#v-acquisti")
    page.locator("main .btn.pri", has_text="Registra documento").click()
    page.wait_for_selector(".sheet [data-k=numero]")
    page.locator(".sheet .btn.pri", has_text="Registra documento").click()
    check("Scegli il fornitore" in text(page, "#ferr"), "errore se manca il fornitore")
    page.fill(".sheet [data-k=numero]", "77")
    page.select_option(".sheet [data-k=fornitoreId]", "f-ingrosso")
    page.select_option(".sheet [data-k='righe.0.articoloId']", "__new")
    page.wait_for_selector(".sheet-wrap >> nth=1")
    f2 = page.locator(".sheet-wrap").nth(1)
    f2.locator("[data-k=nome]").fill("Cioccolato fondente 70%")
    f2.locator(".altog", has_text="Soia").click()
    f2.locator("[data-k=etichetta]").fill("cioccolato fondente (pasta di cacao, zucchero, burro di cacao, emulsionante: lecitina di SOIA)")
    f2.locator(".btn.pri", has_text="Crea articolo").click()
    page.wait_for_timeout(250)
    check(page.locator(".sheet-wrap").count() == 1, "torna al documento dopo aver creato l'articolo")
    sel = page.locator(".sheet [data-k='righe.0.articoloId']").input_value()
    check(sel != "" , "articolo nuovo selezionato nella riga")
    page.fill(".sheet [data-k='righe.0.qta']", "2500")
    page.select_option(".sheet [data-k='righe.0.unita']", "g")
    page.fill(".sheet [data-k='righe.0.importo']", "27,50")
    page.fill(".sheet [data-k='righe.0.lotto']", "CF-881")
    page.fill(".sheet [data-k='righe.0.scadenza']", "2027-09-30")
    page.locator(".sheet .btn", has_text="Aggiungi riga").click()
    page.select_option(".sheet [data-k='righe.1.articoloId']", "a-burro")
    page.fill(".sheet [data-k='righe.1.qta']", "2")
    page.fill(".sheet [data-k='righe.1.lotto']", "LV-3300")
    page.fill(".sheet [data-k='righe.1.scadenza']", "2026-12-20")
    page.locator(".sheet input[data-file=att]").set_input_files(files=[{"name": "fattura77.jpg", "mimeType": "image/jpeg", "buffer": b"\xff\xd8\xff\xe0fakejpeg"}])
    page.wait_for_timeout(250)
    check("fattura77.jpg" in text(page, ".sheet .att"), "allegato caricato")
    page.screenshot(path=str(SHOTS / "m_documento_form.png"), full_page=False)
    page.locator(".sheet .btn.pri", has_text="Registra documento").click()
    page.wait_for_timeout(300)
    check(page.locator(".sheet-wrap").count() == 0, "documento salvato")
    docs = page.evaluate("Object.entries(window.__store.documenti).filter(([k,v]) => v.numero === '77').map(([k,v]) => v)")
    check(len(docs) == 1 and docs[0]["righe"][0]["qta"] == 2.5 and docs[0]["righe"][0]["importo"] == 27.5 and docs[0]["allegati"][0]["nome"] == "fattura77.jpg", f"documento salvato correttamente {docs[0]['righe'][0] if docs else None}")

    # --- nuova scheda tecnica con il cioccolato e la crema
    page.goto(URL + "#schede"); page.wait_for_selector("#v-schede")
    page.locator("main .btn.pri", has_text="Nuova scheda").click()
    page.wait_for_selector(".sheet [data-k=nome]")
    page.fill(".sheet [data-k=nome]", "Bignè al cioccolato")
    page.fill(".sheet [data-k=categoria]", "Dolci")
    page.fill(".sheet [data-k=resaQta]", "30")
    choc = page.evaluate("Object.entries(window.__store.articoli).find(([k,v]) => v.nome.startsWith('Cioccolato'))[0]")
    page.select_option(".sheet [data-k='ingredienti.0.ref']", "ric:r-crema")
    page.fill(".sheet [data-k='ingredienti.0.qta']", "900")
    page.select_option(".sheet [data-k='ingredienti.1.ref']", f"art:{choc}")
    page.fill(".sheet [data-k='ingredienti.1.qta']", "200")
    page.select_option(".sheet [data-k='ingredienti.2.ref']", "art:a-farina")
    page.fill(".sheet [data-k='ingredienti.2.qta']", "150")
    page.fill(".sheet [data-k=shelfLife]", "2")
    page.select_option(".sheet [data-k=tipoScadenza]", "entro")
    page.wait_for_timeout(350)
    pv = text(page, "#ricprev")
    check("Allergeni: Glutine, Uova, Soia, Latte" in pv, f"anteprima allergeni: {pv!r}")
    check("crema pasticcera (LATTE intero" in pv and "lecitina di SOIA" in pv, "anteprima elenco ingredienti")
    page.locator(".sheet .btn.pri", has_text="Crea scheda").click()
    page.wait_for_timeout(300)
    check(page.locator(".sheet .big", has_text="Bignè al cioccolato").count() == 1, "scheda creata e aperta")
    page.screenshot(path=str(SHOTS / "m_scheda_nuova.png"), full_page=False)
    page.keyboard.press("Escape")

    # --- downloads
    page.goto(URL + "#magazzino"); page.wait_for_selector("#v-magazzino")
    page.locator("main .btn", has_text="Esporta CSV").click()
    page.goto(URL + "#impostazioni"); page.wait_for_selector("#v-impostazioni")
    page.locator("main .btn", has_text="Esporta backup").click()
    page.goto(URL + "#schede"); page.wait_for_selector("#v-schede")
    page.locator("main .btn", has_text="Libro ingredienti").click()
    page.wait_for_timeout(200)
    dls = page.evaluate("window.__downloads")
    names = [d["filename"] for d in dls]
    check(any(n.endswith(".csv") for n in names) and any(n.endswith(".json") for n in names) and any(n.startswith("Libro") for n in names), f"download {names}")
    csv = [d for d in dls if d["filename"].endswith(".csv")][0]["data"]
    check("Farina 00;MB2610-44" in csv and ";23,7;kg;" in csv, "CSV giacenze")
    libro = [d for d in dls if d["filename"].startswith("Libro")][0]["data"]
    check("Bignè al cioccolato" in libro and "Crema pasticcera" not in libro, "libro ingredienti esclude i semilavorati")
    bk = json.loads([d for d in dls if d["filename"].endswith(".json")][0]["data"])
    check(bk["app"] == "barista-flow" and len(bk["dati"]["produzioni"]) == 4, "backup completo")

    # --- impostazioni
    page.goto(URL + "#impostazioni"); page.wait_for_selector("#v-impostazioni")
    page.fill("#cfg-nome", "Bar Aurora")
    page.fill("#cfg-gg", "1")
    page.locator("main .btn.pri", has_text="Salva impostazioni").click()
    page.wait_for_timeout(300)
    check(text(page, "#bizName") == "Bar Aurora", "nome attività nell'intestazione")
    page.goto(URL + "#oggi"); page.wait_for_selector("#v-oggi")
    tiles = page.locator(".tile").all_inner_texts()
    check("In scadenza entro domani" in tiles[1], f"preavviso 1 giorno: {tiles[1]!r}")

    # --- desktop e tema scuro
    page.set_viewport_size({"width": 1280, "height": 860})
    page.goto(URL + "#oggi"); page.wait_for_selector("#v-oggi"); page.wait_for_timeout(200)
    page.screenshot(path=str(SHOTS / "d_oggi.png"), full_page=False)
    page.locator(".lab", has_text="TAR-241126-1").click(); page.wait_for_timeout(250)
    page.screenshot(path=str(SHOTS / "d_lotto.png"), full_page=False)
    page.keyboard.press("Escape")
    page.evaluate("document.documentElement.dataset.theme = 'dark'")
    page.wait_for_timeout(100)
    page.screenshot(path=str(SHOTS / "d_oggi_dark.png"), full_page=False)
    page.goto(URL + "#schede"); page.wait_for_selector("#v-schede"); page.evaluate("document.documentElement.dataset.theme = 'dark'")
    page.locator(".rc", has_text="Tartellette").click(); page.wait_for_timeout(250)
    page.screenshot(path=str(SHOTS / "d_scheda_dark.png"), full_page=False)
    page.keyboard.press("Escape")
    page.set_viewport_size({"width": 360, "height": 780})
    page.goto(URL + "#produzione"); page.wait_for_selector("#v-produzione"); page.evaluate("document.documentElement.dataset.theme = 'dark'"); page.wait_for_timeout(150)
    page.screenshot(path=str(SHOTS / "m360_produzione_dark.png"), full_page=True)
    over = page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
    check(not over, "nessuno scorrimento orizzontale a 360px")

    # --- con dati propri niente avviso di prova né benvenuto
    page.goto(URL + "#oggi"); page.wait_for_selector("#v-oggi"); page.wait_for_timeout(200)
    check(page.locator(".demo, .welcome").count() == 0 and page.locator("#demoPill").is_hidden(), "nessun avviso di prova con i propri dati")
    marked = page.evaluate("Object.values(window.__store).flatMap(v => Object.values(v)).filter(x => x.esempio).length")
    check(marked == 0, f"quello che si inserisce fuori dalla prova non è segnato come esempio ({marked})")
    br.close()

print("\nERRORI CONSOLE:" if errors else "\nNessun errore in console")
for e in errors: print("  ", e)
print(f"\n{len(fails)} controlli falliti")
sys.exit(1 if fails or errors else 0)
