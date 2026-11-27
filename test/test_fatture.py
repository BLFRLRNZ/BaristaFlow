"""Importazione delle fatture elettroniche: XML, .p7m (DER, BER a pezzi, base64), zip, fattura differita sui DDT, fornitore e articolo nuovi."""
import base64, io, json, pathlib, sys, zipfile
from xml.sax.saxutils import escape
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from mock import MOCK_TEMPLATE

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / "index.html").as_uri()
SHOTS = ROOT / "test" / "screenshot"; SHOTS.mkdir(exist_ok=True)
DIR = SHOTS / "fatture"; DIR.mkdir(exist_ok=True)
fails, errors = [], []
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)
T = lambda s: s.replace(" ", " ").replace(" ", " ")
COUNT = "Object.values(window.__store).reduce((s, c) => s + Object.keys(c).length, 0)"

# ---------- fatture di prova ----------
def fattura(numero, data, nome, piva, righe, tipo="TD01", ddt=(), sempl=False):
    linee = []
    for i, r in enumerate(righe, 1):
        x = [f"<NumeroLinea>{i}</NumeroLinea>"]
        if r.get("tipoCP"): x.append(f"<TipoCessionePrestazione>{r['tipoCP']}</TipoCessionePrestazione>")
        if r.get("codice"): x.append(f"<CodiceArticolo><CodiceTipo>INTERNO</CodiceTipo><CodiceValore>{r['codice']}</CodiceValore></CodiceArticolo>")
        x.append(f"<Descrizione>{escape(r['descr'])}</Descrizione>")
        if r.get("qta") is not None: x.append(f"<Quantita>{r['qta']:.2f}</Quantita>")
        if r.get("um"): x.append(f"<UnitaMisura>{r['um']}</UnitaMisura>")
        x.append(f"<PrezzoUnitario>{r['prezzo']:.6f}</PrezzoUnitario><PrezzoTotale>{r['totale']:.2f}</PrezzoTotale><AliquotaIVA>4.00</AliquotaIVA>")
        if r.get("lotto"): x.append(f"<AltriDatiGestionali><TipoDato>LOTTO</TipoDato><RiferimentoTesto>{r['lotto']}</RiferimentoTesto></AltriDatiGestionali>")
        if r.get("scad"): x.append(f"<AltriDatiGestionali><TipoDato>SCADENZA</TipoDato><RiferimentoData>{r['scad']}</RiferimentoData></AltriDatiGestionali>")
        linee.append("<DettaglioLinee>" + "".join(x) + "</DettaglioLinee>")
    tot = sum(r["totale"] for r in righe)
    dd = "".join(f"<DatiDDT><NumeroDDT>{n}</NumeroDDT><DataDDT>{d}</DataDDT></DatiDDT>" for n, d in ddt)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<FatturaElettronicaHeader>
<DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>{piva}</IdCodice></IdTrasmittente><ProgressivoInvio>0001</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione><CodiceDestinatario>0000000</CodiceDestinatario></DatiTrasmissione>
<CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>{piva}</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>{escape(nome)}</Denominazione></Anagrafica><RegimeFiscale>RF01</RegimeFiscale></DatiAnagrafici>
<Sede><Indirizzo>Via dei Mulini</Indirizzo><NumeroCivico>4</NumeroCivico><CAP>89022</CAP><Comune>Cittanova</Comune><Provincia>RC</Provincia><Nazione>IT</Nazione></Sede><Contatti><Email>ordini@esempio.example</Email></Contatti></CedentePrestatore>
<CessionarioCommittente><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>Bar di prova</Denominazione></Anagrafica></DatiAnagrafici><Sede><Indirizzo>Via Roma 1</Indirizzo><CAP>89022</CAP><Comune>Cittanova</Comune><Nazione>IT</Nazione></Sede></CessionarioCommittente>
</FatturaElettronicaHeader>
<FatturaElettronicaBody>
<DatiGenerali><DatiGeneraliDocumento><TipoDocumento>{tipo}</TipoDocumento><Divisa>EUR</Divisa><Data>{data}</Data><Numero>{numero}</Numero><ImportoTotaleDocumento>{tot * 1.04:.2f}</ImportoTotaleDocumento></DatiGeneraliDocumento>{dd}</DatiGenerali>
<DatiBeniServizi>{''.join(linee)}<DatiRiepilogo><AliquotaIVA>4.00</AliquotaIVA><ImponibileImporto>{tot:.2f}</ImponibileImporto><Imposta>{tot * .04:.2f}</Imposta><EsigibilitaIVA>I</EsigibilitaIVA></DatiRiepilogo></DatiBeniServizi>
</FatturaElettronicaBody>
</p:FatturaElettronica>""".encode("utf-8")

def tlv(tag, c):
    n = len(c)
    ln = bytes([n]) if n < 128 else bytes([0x80 | ((n.bit_length() + 7) // 8)]) + n.to_bytes((n.bit_length() + 7) // 8, "big")
    return bytes([tag]) + ln + c
OID_SIGNED, OID_DATA = bytes.fromhex("06092a864886f70d010702"), bytes.fromhex("06092a864886f70d010701")
CERT = tlv(0xA0, tlv(0x30, tlv(0x30, tlv(0x02, b"\x05") + tlv(0x04, b"\x30\x03\x01\x01\xff") + tlv(0x0c, b"Firma di prova"))))
SIGNER = tlv(0x31, tlv(0x30, tlv(0x02, b"\x01") + tlv(0x04, b"\x00" * 32)))
def p7m_der(xml):   # busta CAdES come quelle firmate: contenuto, certificato, firmatario
    encap = tlv(0x30, OID_DATA + tlv(0xA0, tlv(0x04, xml)))
    return tlv(0x30, OID_SIGNED + tlv(0xA0, tlv(0x30, tlv(0x02, b"\x01") + tlv(0x31, tlv(0x30, bytes.fromhex("0609608648016503040201"))) + encap + CERT + SIGNER)))
def p7m_ber(xml, chunk=700):   # lunghezze indefinite e contenuto a pezzi
    parts = b"".join(tlv(0x04, xml[i:i + chunk]) for i in range(0, len(xml), chunk))
    encap = b"\x30\x80" + OID_DATA + b"\xa0\x80" + b"\x24\x80" + parts + b"\x00\x00" + b"\x00\x00" + b"\x00\x00"
    return b"\x30\x80" + OID_SIGNED + b"\xa0\x80" + b"\x30\x80" + tlv(0x02, b"\x01") + tlv(0x31, b"") + encap + CERT + SIGNER + b"\x00\x00" + b"\x00\x00" + b"\x00\x00"

LAT = ("Latteria Val Verde S.r.l.", "11111111111")
f1188 = fattura("1188", "2026-11-20", *LAT, [
    {"codice": "BUR1", "descr": "BURRO PANETTO 1KG", "qta": 6, "um": "PZ", "prezzo": 9.45, "totale": 56.70, "lotto": "LV-5521", "scad": "2027-01-10"},
    {"codice": "LAT1", "descr": "LATTE INTERO FRESCO LT 1", "qta": 12, "um": "LT", "prezzo": 1.29, "totale": 15.48},
    {"codice": "PAN6", "descr": "PANNA FRESCA 35% CT 6X0,5LT", "qta": 1, "um": "CT", "prezzo": 13.35, "totale": 13.35},
    {"descr": "SPESE DI TRASPORTO", "prezzo": 5, "totale": 5}])
f1189 = fattura("1189", "2026-11-21", *LAT, [
    {"codice": "BUR1", "descr": "BURRO PANETTO 1KG", "qta": 4, "um": "PZ", "prezzo": 9.45, "totale": 37.80},
    {"codice": "LAT1", "descr": "LATTE INTERO FRESCO LT 1", "qta": 10, "um": "LT", "prezzo": 1.29, "totale": 12.90},
    {"descr": "SPESE DI TRASPORTO", "prezzo": 5, "totale": 5}])
fcas = fattura("77", "2026-11-22", "Caseificio Monti S.n.c.", "22222222222", [
    {"descr": "RICOTTA VACCINA 1,5KG", "qta": 2, "um": "PZ", "prezzo": 6.90, "totale": 13.80}])
fnc = fattura("NC12", "2026-11-22", *LAT, [{"codice": "BUR1", "descr": "RESO BURRO PANETTO 1KG", "qta": 1, "um": "PZ", "prezzo": 9.45, "totale": 9.45}], tipo="TD04")
fbev = fattura("B-501", "2026-11-23", "Bevande del Sud S.r.l.", "33333333333", [
    {"descr": "ACQUA NATURALE 0,5L CT 24", "qta": 3, "um": "CT", "prezzo": 5.76, "totale": 17.28},
    {"descr": "CAUZIONE VUOTI", "qta": 1, "um": "NR", "prezzo": 0, "totale": 0, "tipoCP": "AC"}])
ftor = fattura("T/318", "2026-11-23", "Torrefazione Aurora S.r.l.", "44444444444", [
    {"descr": "CAFFE IN GRANI MISCELA BAR 1KG", "qta": 6, "um": "KG", "prezzo": 21.90, "totale": 131.40}])
meta = b'<?xml version="1.0" encoding="UTF-8"?><ns2:FileMetadati xmlns:ns2="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/messaggi/v1.0"><IdentificativoSdI>123</IdentificativoSdI></ns2:FileMetadati>'
files = {"IT11111111111_01188.xml": f1188, "IT11111111111_01189.xml": f1189, "IT22222222222_00077.xml.p7m": p7m_der(fcas), "IT11111111111_NC12.xml": fnc, "IT11111111111_01188_MT_001.xml": meta}
for n, b in files.items(): (DIR / n).write_bytes(b)
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("fatture/IT33333333333_B501.xml.p7m", p7m_ber(fbev))
    z.writestr("fatture/IT44444444444_T318.xml.p7m", base64.encodebytes(p7m_der(ftor)))
    z.writestr("fatture/IT44444444444_T318_MT_001.xml", meta)
    z.writestr("fatture/IT11111111111_NC12.xml", fnc)
(DIR / "fatture_novembre.zip").write_bytes(buf.getvalue())

def newpage(br, mock, w=390, h=844):
    ctx = br.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, timezone_id="Europe/Rome", locale="it-IT", has_touch=w < 900)
    pg = ctx.new_page()
    pg.clock.set_fixed_time("2026-11-24T10:00:00+01:00")
    if mock: pg.add_init_script(mock)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    return ctx, pg
def shot(pg, name):
    pg.wait_for_timeout(350); pg.screenshot(path=str(SHOTS / f"{name}.png"), full_page=False)
top = lambda pg: pg.locator(".sheet-wrap").last
def statuses(pg):
    return {T(r.locator("b").inner_text()): T(r.locator(".chip").inner_text()) for r in pg.locator(".sheet-wrap").first.locator(".list .row").all()}
def docs(pg, js):
    return pg.evaluate(f"Object.entries(window.__store.documenti).map(([id, d]) => ({{id, ...d}})).filter(d => {js})")

empty = MOCK_TEMPLATE.replace("__SEEDS__", "{}").replace("__CAN__", "true").replace("__DBNULL__", "false")
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
    ctx, pg = newpage(br, empty)
    pg.goto(URL); pg.wait_for_selector("#v-oggi .welcome")
    pg.locator(".wl-opts .qa", has_text="Esplora").click()
    pg.wait_for_function(f"{COUNT} > 400 && !document.querySelector('.sheet-wrap')", timeout=30000)

    # 1. dal pulsante in Acquisti: tre fatture, una nota di credito e un file di metadati
    pg.goto(URL + "#acquisti"); pg.wait_for_selector("#v-acquisti")
    pg.locator("main .btn", has_text="Importa fatture").click(); pg.wait_for_timeout(300)
    pg.set_input_files(".sheet input[data-file=fe]", [str(DIR / n) for n in files])
    pg.wait_for_selector(".sheet .list .row"); pg.wait_for_timeout(300)
    s = statuses(pg)
    check(len(s) == 4, f"quattro documenti letti, metadati saltati: {list(s)}")
    check(s.get("Fattura n. 1188 del 20/11/2026", "").startswith("Da controllare"), f"1188 da controllare: {s.get('Fattura n. 1188 del 20/11/2026')}")
    check(s.get("Fattura n. 77 del 22/11/2026") == "Fornitore nuovo", "il .p7m firmato si legge: fornitore nuovo")
    check(s.get("Fattura n. NC12 del 22/11/2026") == "Nota di credito: non si carica", "nota di credito non caricata")
    check("saltato" in pg.locator(".sheet .sh-body").inner_text(), "avviso del file di metadati saltato")
    shot(pg, "f_elenco")

    # 2. prima fattura del fornitore: proposte da controllare
    pg.locator(".sheet .row", has_text="Fattura n. 1188").click(); pg.wait_for_timeout(350)
    t = top(pg)
    sel = lambda i: t.locator(f'[data-k="righe.{i}.a"]')
    names = [T(sel(i).locator("option:checked").inner_text()) for i in range(4)]
    check(names == ["Burro", "Latte intero fresco", "Panna fresca 35%", "Non è merce: non caricare"], f"articoli proposti {names}")
    facts = [t.locator(f'[data-k="righe.{i}.fat"]').input_value() for i in range(3)]
    check(facts == ["1", "1", "3"], f"conversioni proposte {facts} (1 PZ = 1 kg, 1 LT = 1 l, 1 CT = 6 × 0,5 l)")
    check(t.locator('[data-k="righe.0.lotto"]').input_value() == "LV-5521" and t.locator('[data-k="righe.0.scad"]').input_value() == "2027-01-10", "lotto e scadenza letti dalla fattura")
    check(t.locator(".chip", has_text="Proposto").count() == 3, "le proposte sono da controllare")
    check("9,45 € al kg" in T(t.locator("#fe-h-0").inner_text()), f"prezzo al kg: {t.locator('#fe-h-0').inner_text()}")
    t.locator('[data-k="righe.2.fat"]').fill("2,5"); pg.wait_for_timeout(100)
    check("2,5 l" in T(t.locator("#fe-h-2").inner_text()), "la conversione aggiorna la quantità in magazzino")
    t.locator('[data-k="righe.2.fat"]').fill("3")
    shot(pg, "f_controllo")
    t.locator(".btn.pri", has_text="Importa fattura").click(); pg.wait_for_timeout(700)
    d = docs(pg, "d.numero === '1188'")
    check(len(d) == 1 and d[0]["fornitoreId"] == "es-f-latteria" and not d[0]["soloPrezzi"], "fattura registrata sul fornitore già presente")
    r = {x["articoloId"]: x for x in d[0]["righe"]} if d else {}
    check(r.get("es-a-burro", {}).get("qta") == 6 and r.get("es-a-latte", {}).get("qta") == 12 and r.get("es-a-panna", {}).get("qta") == 3 and len(r) == 3, f"quantità in giacenza {[(k, v['qta']) for k, v in r.items()]}")
    check(r.get("es-a-burro", {}).get("importo") == 56.7 and r.get("es-a-burro", {}).get("lotto") == "LV-5521", "importo e lotto del burro")
    forn = pg.evaluate("window.__store.fornitori['es-f-latteria']")
    check(forn.get("piva") == "11111111111" and len(forn.get("abbinamenti", {})) == 4, f"il fornitore impara partita IVA e abbinamenti {forn.get('piva')} {list(forn.get('abbinamenti', {}))}")

    # 3. la seconda dello stesso fornitore è pronta: si importa con un tocco
    s = statuses(pg)
    check(s.get("Fattura n. 1188 del 20/11/2026") == "Importata" and s.get("Fattura n. 1189 del 21/11/2026") == "Pronta", f"stati dopo la prima: {s}")
    pg.locator(".sheet .sh-foot .btn.pri", has_text="pronta").click(); pg.wait_for_timeout(700)
    d = docs(pg, "d.numero === '1189'")
    check(len(d) == 1 and sorted(x["qta"] for x in d[0]["righe"]) == [4, 10], "1189 importata con gli abbinamenti ricordati")

    # 4. fornitore e articolo nuovi dalla fattura firmata
    pg.locator(".sheet .row", has_text="Fattura n. 77").click(); pg.wait_for_timeout(350)
    t = top(pg)
    check(T(t.locator('[data-k="forn"] option:checked').inner_text()) == "+ Crea «Caseificio Monti S.n.c.»", "propone di creare il fornitore")
    t.locator('[data-k="righe.0.a"]').select_option("__new"); pg.wait_for_timeout(350)
    a = top(pg)
    check(a.locator('[data-k="nome"]').input_value() == "Ricotta vaccina" and a.locator('[data-k="unita"]').input_value() == "kg", f"nuovo articolo precompilato: {a.locator('[data-k=nome]').input_value()!r}")
    a.locator(".btn.pri", has_text="Crea articolo").click(); pg.wait_for_timeout(400)
    t = top(pg)
    check(t.locator('[data-k="righe.0.fat"]').input_value() == "1,5", "conversione 1 PZ = 1,5 kg")
    t.locator(".btn.pri", has_text="Importa fattura").click(); pg.wait_for_timeout(700)
    cas = pg.evaluate("Object.entries(window.__store.fornitori).filter(([id, f]) => f.nome === 'Caseificio Monti S.n.c.').map(([id, f]) => ({id, ...f}))")
    ric = pg.evaluate("Object.values(window.__store.articoli).find(a => a.nome === 'Ricotta vaccina')")
    d = docs(pg, "d.numero === '77'")
    check(len(cas) == 1 and cas[0]["piva"] == "22222222222" and "Cittanova" in cas[0]["note"], "fornitore creato con partita IVA e sede")
    check(ric and cas and ric["fornitoreId"] == cas[0]["id"], "il nuovo articolo prende il fornitore")
    check(len(d) == 1 and d[0]["righe"][0]["qta"] == 3, "ricotta: 2 pezzi da 1,5 kg = 3 kg")

    # 5. stessi file di nuovo: già importate
    pg.set_input_files(".sheet input[data-file=fe]", [str(DIR / "IT11111111111_01188.xml")]); pg.wait_for_timeout(500)
    check(statuses(pg).get("Fattura n. 1188 del 20/11/2026") == "Importata", "nello stesso elenco resta importata")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(250)
    pg.locator("main .btn", has_text="Importa fatture").click(); pg.wait_for_timeout(250)
    pg.set_input_files(".sheet input[data-file=fe]", [str(DIR / "IT11111111111_01188.xml")]); pg.wait_for_selector(".sheet .list .row"); pg.wait_for_timeout(300)
    check(statuses(pg).get("Fattura n. 1188 del 20/11/2026") == "Già importata", "riaprendo: già importata")

    # 6. zip con .p7m a pezzi, .p7m in base64, metadati e nota di credito
    pg.set_input_files(".sheet input[data-file=fe]", [str(DIR / "fatture_novembre.zip")]); pg.wait_for_timeout(600)
    s = statuses(pg)
    check(s.get("Fattura n. B-501 del 23/11/2026", "").startswith("Da controllare") and s.get("Fattura n. T/318 del 23/11/2026", "").startswith("Da controllare"), f"dallo zip le due fatture firmate: {s}")
    pg.locator(".sheet .row", has_text="B-501").click(); pg.wait_for_timeout(350)
    t = top(pg)
    check(T(t.locator('[data-k="righe.0.a"] option:checked').inner_text()) == "Acqua naturale 0,5 l" and t.locator('[data-k="righe.0.fat"]').input_value() == "24", "acqua: 1 CT = 24 pezzi")
    check(T(t.locator('[data-k="righe.1.a"] option:checked').inner_text()) == "Non è merce: non caricare", "cauzione dei vuoti saltata")
    t.locator(".btn.pri", has_text="Importa fattura").click(); pg.wait_for_timeout(600)
    d = docs(pg, "d.numero === 'B-501'")
    check(len(d) == 1 and d[0]["righe"][0]["qta"] == 72 and d[0]["fornitoreId"] == "es-f-bevande", "acqua: 3 cartoni = 72 pezzi su Bevande del Sud")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(250)

    # 7. fattura differita sul DDT della latteria arrivato senza prezzi
    ddt = docs(pg, "d.fornitoreId === 'es-f-latteria' && d.tipo === 'ddt' && d.righe.some(r => r.importo == null)")
    check(len(ddt) == 1, "c'è il DDT senza prezzi")
    ddt = ddt[0]
    CODE = {"es-a-burro": ("BUR1", "BURRO PANETTO 1KG", "PZ", 1, 9.47), "es-a-latte": ("LAT1", "LATTE INTERO FRESCO LT 1", "LT", 1, 1.30),
            "es-a-panna": ("PAN05", "PANNA FRESCA 35% 0,5LT", "PZ", .5, 2.25), "es-a-mascarpone": ("MAS5", "MASCARPONE 500G", "PZ", .5, 3.85)}
    righe = [{"codice": CODE[x["articoloId"]][0], "descr": CODE[x["articoloId"]][1], "qta": x["qta"] / CODE[x["articoloId"]][3], "um": CODE[x["articoloId"]][2], "prezzo": CODE[x["articoloId"]][4], "totale": round(x["qta"] / CODE[x["articoloId"]][3] * CODE[x["articoloId"]][4], 2)} for x in ddt["righe"]]
    (DIR / "differita.xml").write_bytes(fattura("1201", "2026-11-24", *LAT, righe, tipo="TD24", ddt=[(ddt["numero"], ddt["data"])]))
    pg.locator("main .btn", has_text="Importa fatture").click(); pg.wait_for_timeout(250)
    pg.set_input_files(".sheet input[data-file=fe]", [str(DIR / "differita.xml")]); pg.wait_for_selector(".sheet .list .row"); pg.wait_for_timeout(300)
    pg.locator(".sheet .row", has_text="Fattura n. 1201").click(); pg.wait_for_timeout(350)
    t = top(pg)
    check("li hai già registrati" in T(t.locator(".note").first.inner_text()) and t.locator('[data-k="solo"]').is_checked(), "riconosce il DDT già registrato")
    check(not t.locator('[data-k="righe.0.lotto"]').is_visible(), "senza lotti: la merce è già in magazzino")
    shot(pg, "f_differita")
    t.locator(".btn.pri", has_text="Importa fattura").click(); pg.wait_for_timeout(700)
    after = docs(pg, f"d.id === '{ddt['id']}'")[0]
    check(all(x["importo"] is not None for x in after["righe"]) and after["fatturaRif"] == "n. 1201 del 24/11/2026", f"DDT completato: {after['fatturaRif']} {[x['importo'] for x in after['righe']]}")
    burro = next((x for x in after["righe"] if x["articoloId"] == "es-a-burro"), None)
    check(burro is None or abs(burro["importo"] - round(burro["qta"] * 9.47, 2)) < .011, "prezzo del burro dalla fattura")
    check(len(docs(pg, "d.numero === '1201'")) == 0, "nessun carico doppio di merce")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(250)
    pg.locator("main .btn", has_text="Importa fatture").click(); pg.wait_for_timeout(250)
    pg.set_input_files(".sheet input[data-file=fe]", [str(DIR / "differita.xml")]); pg.wait_for_selector(".sheet .list .row"); pg.wait_for_timeout(300)
    check(statuses(pg).get("Fattura n. 1201 del 24/11/2026") == "Già importata", "la differita risulta già importata")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(250)

    # 8. dal pulsante + e senza dati di esempio, fuori da claude.ai
    ctx.close()
    ctx, pg = newpage(br, None)
    pg.goto(URL); pg.wait_for_selector("#v-oggi .welcome")
    pg.locator(".wl-opts .qa", has_text="Registra").click(); pg.wait_for_timeout(300)
    pg.fill(".sheet [data-k=nome]", "Bar Prova"); pg.locator(".sheet .btn.pri").click(); pg.wait_for_selector("#v-oggi .steps")
    pg.locator(".fab").click(); pg.wait_for_timeout(300)
    pg.locator(".sheet .qa", has_text="Importa fatture").click(); pg.wait_for_timeout(300)
    pg.set_input_files(".sheet input[data-file=fe]", [str(DIR / "IT11111111111_01189.xml")]); pg.wait_for_selector(".sheet .list .row"); pg.wait_for_timeout(300)
    pg.locator(".sheet .row", has_text="1189").click(); pg.wait_for_timeout(350)
    t = top(pg)
    t.locator('[data-k="righe.0.a"]').select_option("__new"); pg.wait_for_timeout(350)
    top(pg).locator(".btn.pri", has_text="Crea articolo").click(); pg.wait_for_timeout(400)
    t = top(pg)
    t.locator('[data-k="righe.1.a"]').select_option("__skip"); pg.wait_for_timeout(150)
    t.locator(".btn.pri", has_text="Importa fattura").click(); pg.wait_for_timeout(600)
    st = pg.evaluate("JSON.parse(localStorage.getItem('barista-flow-v1'))")
    dd = [d for d in st.get("documenti", {}).values() if d["numero"] == "1189"]
    art = [a for a in st.get("articoli", {}).values()]
    check(len(dd) == 1 and len(dd[0]["righe"]) == 1 and art and art[0]["nome"] == "Burro panetto" and dd[0]["righe"][0]["qta"] == 4, f"nel browser: fattura con un articolo nuovo ({[a['nome'] for a in art]})")
    check(len(st.get("fornitori", {})) == 1 and not any(v.get("esempio") for c in st.values() for v in c.values()), "fornitore creato, niente segni di prova")
    ctx.close()
    br.close()

print("\nERRORI CONSOLE:" if errors else "\nNessun errore in console")
for e in errors: print("  ", e)
print(f"\n{len(fails)} controlli falliti")
sys.exit(1 if fails or errors else 0)
