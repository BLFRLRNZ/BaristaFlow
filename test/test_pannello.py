"""La console del ponte nel browser, a misura di telefono: lo script vero (apps-script/claude-ponte.gs) gira in un Google finto
(test/fake_pannello.js) che serve la pagina come HtmlService e risponde a google.script.run.
Primo avvio guidato (chiave provata prima di salvarla, indirizzo per i bar, primo cliente con il codice da mandare),
abbonamento (primo canone, pagamento proposto e registrato, modifica e rimozione), servizio scelto a mano, piano,
interventi da fatturare, anagrafica con telefono ed email, nuovo codice, Claude con il tetto e le letture, testo che resta
mentre il ponte risponde, clienti da seguire e badge, incassi e margini, avvisi ai bar, regole degli abbonamenti, riepilogo
per email, impostazioni di Claude, avviso dei crediti finiti, ricerca fra molti clienti, eliminazione, tema scuro, computer
e pagina chiusa a chi non è il proprietario."""
import datetime, json, pathlib, re, socket, subprocess, sys, urllib.request, zoneinfo
from urllib.parse import unquote
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / "test" / "screenshot"; SHOTS.mkdir(exist_ok=True)
DIR = SHOTS / "pannello"; DIR.mkdir(exist_ok=True)
SENZA_TOAST = "#toast{display:none!important}"   # nelle foto delle pagine, senza i messaggi passeggeri
fails = []
def check(c, m):
    print(("OK   " if c else "FAIL ") + m)
    if not c: fails.append(m)
T = lambda s: re.sub(r"[  ]", " ", s)

def libera():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); n = s.getsockname()[1]; s.close(); return n
PORT = libera()
BASE = f"http://127.0.0.1:{PORT}"
URL = BASE + "/macros/s/PROVA/exec"
OWNER = "ponte.bar@gmail.com"
OGGI = datetime.datetime.now(zoneinfo.ZoneInfo("Europe/Rome")).date()
iso = lambda d: d.isoformat()
def piu_mesi(d, n):   # come piuMesi_ del ponte: lo stesso giorno n mesi dopo, il 31 diventa l'ultimo del mese
    m = d.month - 1 + n; y = d.year + m // 12; m = m % 12 + 1
    fine = (datetime.date(y + (m == 12), m % 12 + 1, 1) - datetime.timedelta(days=1)).day
    return datetime.date(y, m, min(d.day, fine))
giorni = lambda n: OGGI + datetime.timedelta(days=n)
fake = subprocess.Popen(["node", str(ROOT / "test" / "fake_pannello.js"), str(PORT)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
assert fake.stdout.readline().strip() == "pronto"

def post(path, body):
    return json.loads(urllib.request.urlopen(urllib.request.Request(BASE + path, data=body.encode(), method="POST")).read())
def ctl(path, body=""): return post(path, body)
def stato(): return json.loads(urllib.request.urlopen(BASE + "/__state").read())
def rpc(*args): return post("/__rpc", json.dumps({"fn": "pannello", "args": list(args)}))
def bar_app(codice, leggi=False, foto=1):   # il Barista Flow di un bar: controlla l'abbonamento o legge un'etichetta
    if not leggi: return json.loads(urllib.request.urlopen(URL + "?codice=" + codice + "&app=prova1").read())
    return post("/macros/s/PROVA/exec", json.dumps({"codice": codice, "cosa": "lotto", "foto": [{"tipo": "image/jpeg", "dati": "AAEC/w=="}] * foto}))
def attendi(pg): pg.wait_for_function("!document.querySelector('.busy')"); pg.wait_for_timeout(60)
def clic(pg, sel):   # svuota gli avvisi, clicca e aspetta che il ponte abbia risposto
    pg.evaluate("document.getElementById('toast').replaceChildren()"); pg.click(sel); attendi(pg)
def invio(pg, sel):
    pg.evaluate("document.getElementById('toast').replaceChildren()"); pg.press(sel, "Enter"); attendi(pg)
def toast(pg):       # gli avvisi comparsi dopo l'ultima azione
    try: pg.wait_for_selector("#toast .toast", timeout=3000)
    except Exception: return ""
    return T(" | ".join(pg.locator("#toast .toast").all_inner_texts()))
def aperto(pg): return pg.locator("#sheet").is_visible()
def testo(pg, sel): return T(pg.locator(sel).inner_text())
CHIUDI = "#sheet .sh-head [data-act=chiudi]"
def sub(pg, v): pg.click(f"#sheet [data-act=sub][data-v={v}]"); pg.wait_for_timeout(80)
def riga_bar(codice): return next((x for x in stato()["sheets"]["Bar"] if x[1] == codice), None)

try:
    with sync_playwright() as p:
        br = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True, args=["--no-sandbox"])
        ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, color_scheme="light", is_mobile=True, has_touch=True, locale="it-IT", timezone_id="Europe/Rome")
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
        for h in ("https://fonts.googleapis.com/**", "https://fonts.gstatic.com/**"): ctx.route(h, lambda r: r.abort())
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "ERR_FAILED" not in m.text else None)

        # ---------- primo avvio ----------
        pg.goto(URL)
        check(pg.locator(".guida li").count() == 3 and pg.locator(".guida li.ok").count() == 0 and pg.locator("#lista").count() == 0, "primo avvio: tre passi da fare, niente elenco vuoto")
        check(pg.locator(".tabs button").count() == 5 and pg.locator(".tabs [aria-current=page]").inner_text() == "Clienti", "in basso le cinque sezioni, su Clienti")
        pg.screenshot(path=str(DIR / "01_primo_avvio.png"), full_page=True, style=SENZA_TOAST)
        st = stato()["sheets"]
        check(all(n in st for n in ("Bar", "Letture", "Pagamenti", "Interventi", "Avvisi")) and st["Bar"][0][2] == "Servizio", "aprendo il pannello i fogli si preparano da soli")
        pg.click(".guida [data-act=chiave]")
        pg.fill("[data-k=chiave]", "abc"); clic(pg, "[data-act=salva-chiave]")
        check("sk-ant-" in testo(pg, "#ferr"), "chiave dal formato sbagliato: errore nel foglio")
        pg.fill("[data-k=chiave]", "sk-ant-api03-RIFIUTATA-00000000000000000000"); clic(pg, "[data-act=salva-chiave]")
        check("non accetta" in testo(pg, "#ferr") and "CHIAVE_API" not in stato()["props"], "chiave rifiutata da Claude: non si salva")
        pg.fill("[data-k=chiave]", "  sk-ant-api03-Buona0123456789abcdefghij-K7Qz  "); invio(pg, "[data-k=chiave]")
        check(not aperto(pg) and "claude-haiku-5-5 risponde" in toast(pg) and stato()["props"].get("CHIAVE_API") == "sk-ant-api03-Buona0123456789abcdefghij-K7Qz", "chiave buona (con Invio): provata e salvata")
        pg.click(".guida [data-act=indirizzo]")
        pg.fill("[data-k=indirizzo]", "https://script.google.com/macros/s/AKfycbPROVA0123456789abcdefghij/dev"); clic(pg, "[data-act=salva-indirizzo]")
        check("/exec" in testo(pg, "#ferr"), "indirizzo di prova /dev: dice di usare quello con /exec")
        IND = "https://script.google.com/macros/s/AKfycbPROVA0123456789abcdefghij/exec"
        pg.fill("[data-k=indirizzo]", IND.replace("/macros/", "/macros/u/1/") + "?authuser=1"); invio(pg, "[data-k=indirizzo]")
        check(not aperto(pg) and json.loads(stato()["props"]["IMPOSTAZIONI"])["indirizzo"] == IND, "indirizzo salvato, ripulito da account e parametri")

        # ---------- il primo cliente ----------
        pg.click(".guida [data-act=nuovo]")
        check(pg.locator("#sheet [data-seg=piano] [aria-pressed=true]").inner_text() == "Mensile" and pg.locator("#sheet [data-k=inizio]").input_value() == iso(OGGI), "nuovo cliente: mensile, dall'inizio di oggi")
        clic(pg, "[data-act=crea-cliente]")
        check("nome" in testo(pg, "#ferr"), "senza nome: errore")
        pg.fill("#sheet [data-k=nome]", "Bar Centrale"); clic(pg, "[data-act=crea-cliente]")
        check("canone" in testo(pg, "#ferr"), "con un piano serve il canone")
        pg.fill("#sheet [data-k=canone]", "39,90"); pg.fill("#sheet [data-k=note]", "cliente storico"); clic(pg, "[data-act=crea-cliente]")
        code = pg.locator("#sheet .code").inner_text()
        check(re.fullmatch(r"BF-[A-Z2-9]{4}-[A-Z2-9]{4}", code) and "Cliente aggiunto" in testo(pg, "#sheet .ok-banner") and pg.locator("#sheet [data-act=sub][aria-pressed=true]").inner_text() == "Cliente", f"creato ({code}): si apre sulla scheda Cliente, con codice e indirizzo")
        wa = pg.locator("#sheet a.btn[href^='https://wa.me/']")
        msg = unquote(wa.get_attribute("href").split("text=", 1)[1])
        check(IND in msg and code in msg and wa.get_attribute("target") == "_blank", "WhatsApp: messaggio con indirizzo e codice, in una finestra a parte")
        clic(pg, "[data-act=copia-msg]")
        check("copiato" in toast(pg).lower() and pg.evaluate("navigator.clipboard.readText()") == msg, "Copia il messaggio: negli appunti lo stesso testo")
        check("non si è ancora collegato." in testo(pg, "#sheet .conn") and ".." not in testo(pg, "#sheet .conn"), "il bar non si è ancora collegato")
        pg.screenshot(path=str(DIR / "02_nuovo_cliente.png"), style=SENZA_TOAST)
        r = bar_app(code)
        check(r["ok"] and r["servizio"]["fase"] == "scadenza" and r["servizio"]["primo"] and r["servizio"]["giorni"] == 0 and r["lettura"], "il bar si collega: primo canone da pagare oggi, lettura attiva")

        # ---------- abbonamento: primo canone e pagamento ----------
        sub(pg, "abbonamento")
        check(testo(pg, "#sheet .stato b.t") == "Primo canone da pagare" and "Va pagato oggi." in testo(pg, "#sheet .stato") and "amb" in pg.locator("#sheet .stato").get_attribute("class"), "Abbonamento: primo canone da pagare oggi, in ocra")
        pg.click("[data-act=nuovo-pagamento]")
        FINO = iso(piu_mesi(OGGI, 1) - datetime.timedelta(days=1))
        check(pg.locator("[data-k='pg.importo']").input_value() == "39,90" and pg.locator("[data-k='pg.fino']").input_value() == FINO and pg.locator("[data-k='pg.data']").input_value() == iso(OGGI), f"pagamento proposto: 39,90 €, oggi, coperto fino al {FINO}")
        pg.screenshot(path=str(DIR / "03_pagamento.png"), style=SENZA_TOAST)
        pg.fill("[data-k='pg.importo']", "0"); clic(pg, "[data-act=salva-pagamento]")
        check("importo" in testo(pg, "#pg-err").lower(), "importo zero: errore nel modulo")
        pg.fill("[data-k='pg.importo']", "39,90"); pg.click("[data-seg='pg.metodo'] [data-v=contanti]"); clic(pg, "[data-act=salva-pagamento]")
        check("Pagamento registrato" in toast(pg) and testo(pg, "#sheet .stato b.t") == "In regola" and pg.locator("#mod-pag").count() == 0, "registrato: in regola, il modulo si chiude")
        pp = stato()["sheets"]["Pagamenti"]
        check(len(pp) == 2 and pp[1][2] == code and pp[1][4] == 39.9 and pp[1][5] == "contanti" and pp[1][6] == "'" + FINO, f"nel foglio «Pagamenti»: {pp[1]}")
        check(pg.locator("#sheet .list .row").count() == 1 and "39,90 €" in testo(pg, "#sheet .list .row"), "il pagamento nell'elenco")
        pg.click("#sheet [data-act=mod-pagamento]")
        check(pg.locator("[data-seg='pg.metodo'] [aria-pressed=true]").inner_text() == "Contanti" and pg.locator("[data-k='pg.importo']").input_value() == "39,90", "toccando il pagamento si riapre con i suoi dati")
        pg.fill("[data-k='pg.note']", "ricevuta 12"); clic(pg, "[data-act=salva-pagamento]")
        check(stato()["sheets"]["Pagamenti"][1][7] == "ricevuta 12" and len(stato()["sheets"]["Pagamenti"]) == 2, "modificato al suo posto")
        pg.click("#sheet [data-act=mod-pagamento]"); clic(pg, "[data-act=togli-pagamento]")
        check("Pagamento tolto" in toast(pg) and len(stato()["sheets"]["Pagamenti"]) == 1 and testo(pg, "#sheet .stato b.t") == "Primo canone da pagare", "Togli: torna il primo canone da pagare")
        pg.click("[data-act=nuovo-pagamento]"); clic(pg, "[data-act=salva-pagamento]")

        # ---------- servizio a mano e piano ----------
        clic(pg, "#sheet [data-act=modo][data-v=sospeso]")
        check("sola lettura" in toast(pg) and testo(pg, "#sheet .stato b.t") == "Sospeso a mano" and bar_app(code)["servizio"]["stato"] == "sospeso" and riga_bar(code)[2] == "sospeso", "Sospeso a mano: il bar lo sa subito")
        check("sola lettura" in testo(pg, "#sheet .spieg"), "sotto, cosa vuol dire per il bar")
        clic(pg, "#sheet [data-act=modo][data-v=automatico]")
        check(testo(pg, "#sheet .stato b.t") == "In regola" and bar_app(code)["lettura"], "di nuovo automatico: segue l'abbonamento")
        pg.click("#sheet [data-seg='pi.piano'] [data-v=annuale]"); pg.fill("[data-k='pi.canone']", "390"); clic(pg, "[data-act=salva-piano]")
        rb = riga_bar(code)
        check("Abbonamento salvato" in toast(pg) and rb[13] == "annuale" and rb[14] == 390 and rb[6] == "cliente storico", "piano annuale da 390 €, le note restano")
        check("Annuale · 390 €" in testo(pg, "#sheet .stato .piano"), "nel riquadro il piano nuovo")

        # ---------- interventi ----------
        sub(pg, "interventi")
        pg.click("[data-act=nuovo-intervento]"); clic(pg, "[data-act=salva-intervento]")
        check("intervento" in testo(pg, "#in-err"), "intervento senza descrizione: errore")
        pg.fill("[data-k='in.descrizione']", "Installazione e formazione"); pg.fill("[data-k='in.importo']", "120"); clic(pg, "[data-act=salva-intervento]")
        check("Intervento salvato" in toast(pg) and "Da fatturare" in testo(pg, "#sheet .list") and "Interventi · 1" in testo(pg, "#sheet .sh-tabs"), "intervento da fatturare, contato sulla linguetta")
        pg.click("#sheet [data-act=mod-intervento]"); pg.click("[data-seg='in.stato'] [data-v=pagato]"); clic(pg, "[data-act=salva-intervento]")
        check("Pagato" in testo(pg, "#sheet .list") and stato()["sheets"]["Interventi"][1][6] == "pagato" and "Interventi · 1" not in testo(pg, "#sheet .sh-tabs"), "segnato come pagato")
        pg.screenshot(path=str(DIR / "04_interventi.png"), style=SENZA_TOAST)

        # ---------- cliente: anagrafica e nuovo codice ----------
        sub(pg, "cliente")
        pg.fill("[data-k='an.email']", "non-una-email"); clic(pg, "[data-act=salva-anagrafica]")
        check("email" in testo(pg, "#an-err"), "email sbagliata: errore")
        pg.fill("[data-k='an.ragione']", "Centrale s.r.l."); pg.fill("[data-k='an.piva']", "01234567890"); pg.fill("[data-k='an.telefono']", "0965 123456"); pg.fill("[data-k='an.email']", "Info@BarCentrale.it")
        clic(pg, "[data-act=salva-anagrafica]")
        rb = riga_bar(code)
        check(rb[7] == "Centrale s.r.l." and rb[8] == "'01234567890" and rb[10] == "'0965 123456" and rb[11] == "info@barcentrale.it" and rb[13] == "annuale", "anagrafica nel foglio, partita IVA e telefono come testo; l'abbonamento resta")
        check(pg.locator("#sheet a[href='tel:0965123456']").count() == 1 and pg.locator("#sheet a[href='mailto:info@barcentrale.it']").count() == 1, "telefono e email si toccano per chiamare o scrivere")
        pg.click("#sheet [data-act=chiedi][data-v=codice]")
        check("smette subito di funzionare" in testo(pg, "#sheet .conf"), "Nuovo codice: prima chiede conferma")
        clic(pg, "#sheet [data-act=cambia-codice]")
        code2 = pg.locator("#sheet .code").inner_text()
        check(code2 != code and bar_app(code)["errore"] == "codice" and bar_app(code2)["servizio"]["fase"] == "regola" and stato()["sheets"]["Pagamenti"][1][2] == code2, "nuovo codice: il vecchio non vale, pagamenti e abbonamento passano al nuovo")
        check("Collegato oggi" in testo(pg, "#sheet .conn") and "versione prova1" in testo(pg, "#sheet .conn"), "si vede quando il bar si è collegato, e con quale versione")
        pg.screenshot(path=str(DIR / "05_cliente.png"), style=SENZA_TOAST)

        # ---------- Claude: tetto e letture, senza perdere quello che si scrive ----------
        for _ in range(2): bar_app(code2, leggi=True, foto=2)
        ctl("/__ritardo", "900")
        sub(pg, "claude")
        pg.focus("[data-k='cl.tetto']"); pg.keyboard.type("50")
        pg.wait_for_selector("#sheet #lett-bar .row")
        check(pg.locator("[data-k='cl.tetto']").input_value() == "50" and pg.evaluate("document.activeElement.dataset.k") == "cl.tetto", "le letture arrivano mentre scrivi: testo e cursore restano")
        ctl("/__ritardo", "120")
        check(pg.locator("#sheet #lett-bar .row").count() == 2 and "4 di 200 foto" in testo(pg, "#sheet .nums"), "Claude: 4 di 200 foto, due letture")
        invio(pg, "[data-k='cl.tetto']")
        check(riga_bar(code2)[3] == 50 and "4 di 50 foto" in testo(pg, "#sheet .nums") and pg.evaluate("getComputedStyle(document.querySelector('#sheet .sheet')).animationName") == "none", "tetto 50 con Invio; il foglio si aggiorna senza rifare l'animazione")
        pg.keyboard.press("Escape")
        check(not aperto(pg), "Esc chiude il foglio")

        # ---------- clienti da seguire ----------
        def cliente(nome, **kw): return rpc("aggiungi", {"nome": nome, **kw})["r"]["codice"]
        cS = cliente("Bar Stazione", piano="mensile", canone="49", inizio=iso(giorni(-40)))
        cL = cliente("Caffè Roma", piano="mensile", canone="49", inizio=iso(giorni(-20)))
        cP = cliente("Pasticceria Dolce Vita", piano="trimestrale", canone="120", inizio=iso(giorni(-60)))
        rpc("pagamento", {"codice": cP, "importo": "120", "fino": iso(giorni(2))})
        cliente("Gelateria Polo")
        pg.click("[data-act=aggiorna]"); attendi(pg)
        chips = {T(r.locator(".m b").first.inner_text()): T(r.locator(".chip").inner_text()) for r in pg.locator("#lista .row").all()}
        check(chips == {"Bar Centrale": "In regola", "Bar Stazione": "Sospeso", "Caffè Roma": "Limitato", "Pasticceria Dolce Vita": "In scadenza", "Gelateria Polo": "Senza abbonamento"}, f"ogni cliente con il suo stato: {chips}")
        check(pg.locator(".tabs .n").inner_text() == "3" and "2 in ritardo" in testo(pg, ".hero .sub") and "1 in scadenza" in testo(pg, ".hero .sub"), "il numero rosso su Clienti: tre da seguire")
        pg.click("[data-act=filtro][data-v=seguire]")
        check([T(x) for x in pg.locator("#lista .row .m b").all_inner_texts()] == ["Bar Stazione", "Caffè Roma", "Pasticceria Dolce Vita"], "Da seguire: prima i sospesi, poi i limitati, poi le scadenze")
        pg.screenshot(path=str(DIR / "06_da_seguire.png"), style=SENZA_TOAST)
        pg.click("[data-act=filtro][data-v=tutti]")
        pg.locator("#lista .row", has_text="Caffè Roma").click()
        check(testo(pg, "#sheet .stato b.t") == "Limitato" and "niente lettura con Claude" in testo(pg, "#sheet .stato") and "va in sola lettura" in testo(pg, "#sheet .stato"), "Caffè Roma: limitato, e quando andrà in sola lettura")
        check(bar_app(cL)["servizio"]["stato"] == "limitato" and bar_app(cL, leggi=True)["errore"] == "limitato", "il bar limitato non legge con Claude")
        pg.keyboard.press("Escape")

        # ---------- incassi ----------
        pg.click("[data-act=tab][data-v=incassi]")
        check(T(pg.locator(".hero h1").inner_text()).startswith("159,90 €"), f"incassati questo mese: {T(pg.locator('.hero h1').inner_text())}")
        cifre = {T(x.locator("span").inner_text()): T(x.locator("b").inner_text()) for x in pg.locator(".cifra").all()}
        check(cifre.get("Canoni al mese") == "170,50 €" and cifre.get("In ritardo") == "98 €" and cifre.get("Da fatturare") == "0 €", f"canoni al mese, in ritardo, da fatturare: {cifre}")
        rit = [T(x) for x in pg.locator("h2:has-text('In ritardo') + .list .row").all_inner_texts()]
        check(len(rit) == 2 and "in sola lettura" in rit[0] and "limitato" in rit[1], f"in ritardo, dal più lungo: {rit}")
        check("Pasticceria Dolce Vita" in testo(pg, "h2:has-text('Prossimi 30 giorni') + .list") and "rinnovo entro il" in testo(pg, "h2:has-text('Prossimi 30 giorni') + .list"), "nei prossimi 30 giorni il rinnovo della pasticceria")
        pg.screenshot(path=str(DIR / "07_incassi.png"), full_page=True, style=SENZA_TOAST)
        pg.locator("h2:has-text('In ritardo') + .list .row").first.click()
        check(aperto(pg) and "Bar Stazione" in testo(pg, "#sheet .sh-head"), "da Incassi si apre la scheda del cliente")
        pg.keyboard.press("Escape")

        # ---------- avvisi ----------
        pg.click("[data-act=tab][data-v=avvisi]")
        pg.click("[data-act=avviso]:not([data-id])"); clic(pg, "[data-act=salva-avviso]")
        check("testo" in testo(pg, "#ferr"), "avviso senza testo: errore")
        pg.fill("#sheet [data-k=testo]", "Domenica dalle 8 alle 9 aggiorno Barista Flow.")
        check(testo(pg, "#conta") == "46/280", "il contatore dei caratteri")
        pg.fill("#sheet [data-k=al]", iso(giorni(3))); clic(pg, "[data-act=salva-avviso]")
        check("pubblicato" in toast(pg) and pg.locator("#app .list .row").count() == 1, "pubblicato: è in corso")
        pg.click("[data-act=avviso]:not([data-id])"); pg.fill("#sheet [data-k=testo]", "Mandami le foto del nuovo menu"); pg.select_option("#sheet [data-k=a]", cL); pg.check("#sheet [data-k=importante]"); clic(pg, "[data-act=salva-avviso]")
        av = bar_app(cL)["avvisi"]
        check(len(av) == 2 and any(x["importante"] for x in av) and len(bar_app(cP)["avvisi"]) == 1, "il bar vede gli avvisi per tutti e i suoi; gli altri no")
        check("Importante" in testo(pg, "#app .list") and "Caffè Roma" in testo(pg, "#app .list"), "nell'elenco: a chi va, ed è importante")
        pg.screenshot(path=str(DIR / "08_avvisi.png"), full_page=True, style=SENZA_TOAST)
        pg.locator("#app .list .row", has_text="Caffè Roma").click(); clic(pg, "[data-act=togli-avviso]")
        check("tolto" in toast(pg) and len(bar_app(cL)["avvisi"]) == 1, "avviso tolto")

        # ---------- impostazioni: regole, riepilogo per email, Claude ----------
        pg.click("[data-act=tab][data-v=impostazioni]")
        pg.fill("[data-k='abb.limitaDopo']", "40"); clic(pg, "[data-act=salva-abb]")
        check("dopo la limitazione" in testo(pg, "#abb-err"), "limitare dopo aver sospeso: errore")
        pg.fill("[data-k='abb.limitaDopo']", "25"); pg.fill("[data-k='abb.contatto']", "Luca · 333 1234567"); clic(pg, "[data-act=salva-abb]")
        imp = json.loads(stato()["props"]["IMPOSTAZIONI"])
        check("salvate" in toast(pg) and imp["limitaDopo"] == 25 and imp["contatto"] == "Luca · 333 1234567" and bar_app(cL)["servizio"]["fase"] == "ritardo" and bar_app(cL)["contatto"] == "Luca · 333 1234567", "limita dopo 25 giorni: Caffè Roma torna in ritardo; il bar vede il tuo contatto")
        pg.check("[data-k='em.emailAttiva']"); pg.select_option("[data-k='em.emailOra']", "7"); clic(pg, "[data-act=salva-email]")
        tr = stato()["triggers"]
        check("alle 07:00" in toast(pg) and len([x for x in tr if x["fn"] == "riepilogoGiornaliero"]) == 1 and tr[0]["h"] == 7 and tr[0]["tz"] == "Europe/Rome", "riepilogo acceso: ogni mattina alle 7, ora italiana")
        clic(pg, "[data-act=prova-email]")
        mail = stato()["inviate"][-1]
        check(OWNER in toast(pg) and mail["to"] == OWNER and "Bar Stazione" in mail["htmlBody"] and "ritardo" in mail["subject"], f"prova del riepilogo: «{mail['subject']}»")
        pg.uncheck("[data-k='em.emailAttiva']"); clic(pg, "[data-act=salva-email]")
        check("spento" in toast(pg) and not stato()["triggers"], "riepilogo spento: niente attivatore")
        pg.fill("[data-k='cl.modello']", "claude-inventato-1"); clic(pg, "[data-act=salva-imp]")
        check("non conosce" in testo(pg, "#cfg-err"), "modello sconosciuto: non si salva")
        pg.fill("[data-k='cl.modello']", "claude-sonnet-5-5"); pg.click("[data-act=impegno][data-v=medium]"); pg.fill("[data-k='cl.cambio']", "0,9"); clic(pg, "[data-act=salva-imp]")
        imp = json.loads(stato()["props"]["IMPOSTAZIONI"])
        check(imp["modello"] == "claude-sonnet-5-5" and imp["impegno"] == "medium" and imp["cambio"] == 0.9 and imp["limitaDopo"] == 25, "Claude: modello, impegno e cambio salvati, le regole restano")
        pg.screenshot(path=str(DIR / "09_impostazioni.png"), full_page=True, style=SENZA_TOAST)

        # ---------- crediti finiti ----------
        ctl("/__claude", "crediti")
        check(bar_app(cP, leggi=True).get("errore") == "crediti", "crediti finiti: il bar riceve l'errore")
        pg.click("[data-act=tab][data-v=letture]"); pg.click("[data-act=aggiorna]"); attendi(pg)
        check("crediti di Claude sono finiti" in testo(pg, ".alert") and "Ultimo tentativo: oggi" in testo(pg, ".alert"), "in Letture l'avviso: crediti finiti")
        pg.click("[data-act=fLett][data-v=errori]")
        check(pg.locator("#app .list").first.locator(".row").count() == 1 and "credit balance" in T(pg.locator("#app .list").first.inner_text()), "Letture → Errori: solo l'errore, con il motivo")
        ctl("/__claude", "ok"); bar_app(cP, leggi=True); pg.click("[data-act=aggiorna]"); attendi(pg)
        check(pg.locator(".alert").count() == 0, "dopo una lettura riuscita l'avviso sparisce")

        # ---------- tanti clienti: ricerca ed eliminazione ----------
        for n in ["Bar Sport", "Caffè del Corso", "Bar Duomo"]: cliente(n)
        pg.click("[data-act=tab][data-v=clienti]"); pg.click("[data-act=aggiorna]"); attendi(pg)
        nomi = [T(x) for x in pg.locator("#lista .row .m b").all_inner_texts()]
        check(len(nomi) == 8 and pg.locator("[data-k=cerca]").count() == 1 and nomi == sorted(nomi, key=str.casefold), f"più di sei clienti: ricerca, e ordine alfabetico ({nomi})")
        pg.fill("[data-k=cerca]", "caffè")
        check(pg.locator("#lista .row").count() == 2 and pg.evaluate("document.activeElement.dataset.k") == "cerca", "la ricerca filtra mentre scrivi")
        pg.fill("[data-k=cerca]", "0965")
        check(pg.locator("#lista .row").count() == 1, "si cerca anche per telefono")
        pg.fill("[data-k=cerca]", "")
        pg.screenshot(path=str(DIR / "10_clienti.png"), full_page=True, style=SENZA_TOAST)
        pg.locator("#lista .row", has_text="Bar Duomo").click(); sub(pg, "cliente")
        pg.click("#sheet [data-act=chiedi][data-v=elimina]")
        check("Eliminare Bar Duomo?" in testo(pg, "#sheet .conf"), "Elimina: prima chiede conferma")
        clic(pg, "#sheet [data-act=elimina]")
        check(not aperto(pg) and "eliminato" in toast(pg) and pg.locator("#lista .row", has_text="Bar Duomo").count() == 0, "eliminato: sparisce dall'elenco")

        # ---------- tema scuro e computer ----------
        pg.emulate_media(color_scheme="dark"); pg.wait_for_timeout(150)
        check(pg.evaluate("getComputedStyle(document.body).backgroundColor") == "rgb(12, 19, 17)", "tema scuro")
        pg.screenshot(path=str(DIR / "11_scuro.png"), full_page=True, style=SENZA_TOAST)
        pg.locator("#lista .row", has_text="Caffè Roma").click(); pg.wait_for_timeout(300)
        pg.screenshot(path=str(DIR / "12_scuro_cliente.png"), style=SENZA_TOAST)
        pg.keyboard.press("Escape"); pg.emulate_media(color_scheme="light")
        pg.set_viewport_size({"width": 1100, "height": 780}); pg.wait_for_timeout(150)
        pg.locator("#lista .row", has_text="Bar Centrale").click(); pg.wait_for_timeout(300)
        box = pg.locator("#sheet .sheet").bounding_box()
        check(box["width"] <= 620 and box["y"] > 20, "sul computer il foglio è una finestra al centro")
        pg.screenshot(path=str(DIR / "13_computer.png"), style=SENZA_TOAST)
        pg.keyboard.press("Escape"); pg.set_viewport_size({"width": 390, "height": 844})

        # ---------- chi non è il proprietario ----------
        ctl("/__chi", "")
        pg2 = ctx.new_page(); pg2.goto(URL)
        body = pg2.locator("body").inner_text()
        check("barista-flow-claude" in body and "pannello si apre solo" in body and pg2.locator("#app").count() == 0, "non proprietario: lo stesso indirizzo risponde solo che il ponte c'è")
        pg.click("[data-act=aggiorna]"); attendi(pg)
        check("Pannello chiuso" in testo(pg, "#app") and "Error" not in testo(pg, "#app") and pg.locator("#tabs").is_hidden(), "pagina già aperta ma senza il proprietario: si chiude e lo spiega")
        ctl("/__chi", OWNER)

        check(not errs, f"nessun errore nella pagina: {errs}")
        br.close()
finally:
    fake.terminate()

print(f"\n{len(fails)} controlli falliti" if fails else "\nConsole del ponte: tutto a posto")
sys.exit(1 if fails else 0)
