"""Genera test/dati-test.json: i dati fissi su cui girano i test (al 24/11/2026). I dati di esempio dell'app sono in src/esempi.js."""
import json, datetime, pathlib

def ts(d, h=8, m=0):
    return int(datetime.datetime(*map(int, d.split("-")), h, m, tzinfo=datetime.timezone(datetime.timedelta(hours=1))).timestamp() * 1000)

fornitori = {
    "f-molino": {"nome": "Molino del Borgo", "piva": "", "telefono": "", "email": "", "note": "Farine", "creato": ts("2026-11-01")},
    "f-latteria": {"nome": "Latteria Val Verde", "piva": "", "telefono": "", "email": "", "note": "Burro, latte e panna: consegna martedì e venerdì", "creato": ts("2026-11-01", 9)},
    "f-ingrosso": {"nome": "Dolciaria Ingrosso", "piva": "", "telefono": "", "email": "", "note": "Zucchero, uova, frutta secca, bevande, imballaggi", "creato": ts("2026-11-01", 10)},
}
def art(nome, unita, etichetta, allergeni, cons, scorta, forn, cat="materia", pesoPz=None, note=""):
    return {"nome": nome, "categoria": cat, "unita": unita, "pesoPz": pesoPz, "etichetta": etichetta, "allergeni": allergeni, "conservazione": cons, "scortaMin": scorta, "fornitoreId": forn, "note": note, "archiviato": False, "creato": ts("2026-11-01", 11)}
articoli = {
    "a-farina": art("Farina 00", "kg", "farina di GRANO tenero tipo 00", ["glutine"], "ambiente", 10, "f-molino"),
    "a-burro": art("Burro", "kg", "burro", ["latte"], "frigo", 2, "f-latteria"),
    "a-zucchero": art("Zucchero semolato", "kg", "zucchero", [], "ambiente", 5, "f-ingrosso"),
    "a-uova": art("Uova fresche cat. A", "pz", "UOVA", ["uova"], "frigo", 30, "f-ingrosso", pesoPz=55),
    "a-latte": art("Latte intero fresco", "l", "LATTE intero", ["latte"], "frigo", 4, "f-latteria"),
    "a-amido": art("Amido di mais", "kg", "amido di mais", [], "ambiente", 0.5, "f-ingrosso"),
    "a-nocciole": art("Nocciole tostate", "kg", "NOCCIOLE", ["frutta_guscio"], "ambiente", 0.5, "f-ingrosso"),
    "a-acqua": art("Acqua naturale 0,5 l", "pz", "", [], "ambiente", 24, "f-ingrosso", cat="rivendita"),
    "a-sacchetti": art("Sacchetti carta per alimenti", "pz", "", [], "ambiente", 100, "f-ingrosso", cat="imballaggio"),
}
def riga(i, a, q, imp, lotto, scad):
    return {"id": f"r{i}", "articoloId": a, "qta": q, "importo": imp, "lotto": lotto, "scadenza": scad}
documenti = {
    "d-ddt401": {"tipo": "ddt", "numero": "401", "data": "2026-11-02", "fornitoreId": "f-latteria", "note": "", "allegati": [], "creato": ts("2026-11-02", 9),
                 "righe": [riga(1, "a-burro", 1, 9.0, "LV-3150", "2026-11-23")]},
    "d-fatt1187": {"tipo": "fattura", "numero": "1187", "data": "2026-11-10", "fornitoreId": "f-molino", "note": "", "allegati": [], "creato": ts("2026-11-10", 9),
                   "righe": [riga(1, "a-farina", 25, 22.5, "MB2610-44", "2027-05-31")]},
    "d-fatt889": {"tipo": "fattura", "numero": "889", "data": "2026-11-20", "fornitoreId": "f-ingrosso", "note": "", "allegati": [], "creato": ts("2026-11-20", 9),
                  "righe": [riga(1, "a-zucchero", 10, 11.0, "Z-55821", "2028-01-31"), riga(2, "a-uova", 90, 22.5, "3IT078CS012", "2026-12-10"),
                            riga(3, "a-nocciole", 2, 36.0, "NC-0927", "2027-03-15"), riga(4, "a-amido", 1, 3.2, "AM-112", "2027-08-30"),
                            riga(5, "a-acqua", 24, 6.0, "L6213", "2027-10-01"), riga(6, "a-sacchetti", 500, 12.0, "", "")]},
    "d-ddt452": {"tipo": "ddt", "numero": "452", "data": "2026-11-21", "fornitoreId": "f-latteria", "note": "", "allegati": [], "creato": ts("2026-11-21", 9),
                 "righe": [riga(1, "a-burro", 5, 45.0, "LV-3211", "2026-12-12"), riga(2, "a-latte", 6, 7.8, "LV-3240", "2026-11-26")]},
}
def storico(id_, num, data, forn, righe):
    documenti[id_] = {"tipo": "fattura", "numero": num, "data": data, "fornitoreId": forn, "note": "", "allegati": [], "soloPrezzi": True, "creato": ts(data, 9),
                      "righe": [riga(i + 1, a, q, imp, "", "") for i, (a, q, imp) in enumerate(righe)]}
storico("d-h0612", "512", "2026-06-12", "f-latteria", [("a-burro", 5, 39.5), ("a-latte", 6, 7.2)])
storico("d-h0702", "640", "2026-07-02", "f-ingrosso", [("a-zucchero", 10, 12.5), ("a-uova", 90, 18.9), ("a-nocciole", 2, 31.0)])
storico("d-h0805", "731", "2026-08-05", "f-molino", [("a-farina", 25, 21.5)])
storico("d-h0818", "755", "2026-08-18", "f-latteria", [("a-burro", 5, 41.5), ("a-latte", 6, 7.5)])
storico("d-h0910", "803", "2026-09-10", "f-ingrosso", [("a-zucchero", 10, 11.8), ("a-uova", 90, 19.8), ("a-nocciole", 2, 32.0), ("a-acqua", 24, 6.0), ("a-burro", 2, 16.2)])
storico("d-h0922", "890", "2026-09-22", "f-molino", [("a-farina", 25, 21.5)])
storico("d-h1015", "912", "2026-10-15", "f-latteria", [("a-burro", 5, 43.5), ("a-latte", 6, 7.68)])
storico("d-h1020", "851", "2026-10-20", "f-ingrosso", [("a-uova", 90, 20.7), ("a-nocciole", 2, 32.8)])

def ing(t, ref, q, u):
    return {"tipo": t, "refId": ref, "qta": q, "unita": u}
ricette = {
    "r-biscotti": {"nome": "Biscotti al burro", "sigla": "BIS", "categoria": "Dolci", "semilavorato": False, "resaQta": 60, "resaUnita": "pz", "pesoPz": 16,
                   "ingredienti": [ing("art", "a-farina", 500, "g"), ing("art", "a-burro", 250, "g"), ing("art", "a-zucchero", 200, "g"), ing("art", "a-uova", 2, "pz")],
                   "shelfLife": 15, "tipoScadenza": "preferibilmente", "conservazione": "In luogo fresco e asciutto, in contenitore chiuso",
                   "procedimento": "Lavorare il burro morbido con lo zucchero. Unire le uova una alla volta, poi la farina setacciata.\nRiposo dell'impasto 1 ora in frigorifero, stendere a 5 mm e coppare.\nCuocere a 170 °C per 12–14 minuti e lasciar raffreddare su griglia prima di confezionare.",
                   "tracce": ["frutta_guscio"], "prezzoVendita": 0.6, "note": "Nello stesso laboratorio si lavorano le nocciole.", "archiviato": False, "creato": ts("2026-11-01", 12)},
    "r-crema": {"nome": "Crema pasticcera", "sigla": "CRE", "categoria": "Semilavorati", "semilavorato": True, "resaQta": 1.2, "resaUnita": "kg", "pesoPz": None,
                "ingredienti": [ing("art", "a-latte", 1, "l"), ing("art", "a-zucchero", 250, "g"), ing("art", "a-uova", 4, "pz"), ing("art", "a-amido", 80, "g")],
                "shelfLife": 3, "tipoScadenza": "entro", "conservazione": "In frigorifero a 0–4 °C, coperta con pellicola a contatto",
                "procedimento": "Scaldare il latte. Sbattere uova e zucchero, unire l'amido.\nVersare il latte caldo a filo, riportare sul fuoco e cuocere mescolando fino al bollore.\nAbbattere subito la temperatura e conservare in frigorifero.",
                "tracce": [], "prezzoVendita": None, "note": "", "archiviato": False, "creato": ts("2026-11-01", 12, 10)},
    "r-tartellette": {"nome": "Tartellette crema e nocciole", "sigla": "TAR", "categoria": "Dolci", "semilavorato": False, "resaQta": 20, "resaUnita": "pz", "pesoPz": 75,
                      "ingredienti": [ing("art", "a-farina", 300, "g"), ing("art", "a-burro", 150, "g"), ing("art", "a-zucchero", 100, "g"), ing("art", "a-uova", 1, "pz"), ing("ric", "r-crema", 600, "g"), ing("art", "a-nocciole", 50, "g")],
                      "shelfLife": 2, "tipoScadenza": "entro", "conservazione": "In frigorifero a 0–4 °C",
                      "procedimento": "Preparare la frolla con farina, burro, zucchero e uovo; riposo 1 ora.\nFoderare gli stampini e cuocere in bianco a 175 °C per 15 minuti.\nA freddo farcire con la crema pasticcera e completare con nocciole tritate.",
                      "tracce": [], "prezzoVendita": 1.8, "note": "", "archiviato": False, "creato": ts("2026-11-01", 12, 20)},
}
def cons(t, ref, nome, lot, q):
    return {"tipo": t, "refId": ref, "nome": nome, "lotId": lot, "qta": q}
produzioni = {
    "p-bis211126": {"lotto": "BIS-211126-1", "ricettaId": "r-biscotti", "ricettaNome": "Biscotti al burro", "data": "2026-11-21", "qta": 60, "unita": "pz", "scadenza": "2026-12-06", "tipoScadenza": "preferibilmente",
                    "operatore": "Giulia", "note": "", "allergeni": ["glutine", "uova", "latte"], "tracce": ["frutta_guscio"], "creato": ts("2026-11-21", 7),
                    "consumi": [cons("art", "a-farina", "Farina 00", "d-fatt1187:r1", 0.5), cons("art", "a-burro", "Burro", "d-ddt401:r1", 0.25), cons("art", "a-zucchero", "Zucchero semolato", "d-fatt889:r1", 0.2), cons("art", "a-uova", "Uova fresche cat. A", "d-fatt889:r2", 2)]},
    "p-cre231126": {"lotto": "CRE-231126-1", "ricettaId": "r-crema", "ricettaNome": "Crema pasticcera", "data": "2026-11-23", "qta": 1.2, "unita": "kg", "scadenza": "2026-11-26", "tipoScadenza": "entro",
                    "operatore": "Marco", "note": "", "allergeni": ["uova", "latte"], "tracce": [], "creato": ts("2026-11-23", 7),
                    "consumi": [cons("art", "a-latte", "Latte intero fresco", "d-ddt452:r2", 1), cons("art", "a-zucchero", "Zucchero semolato", "d-fatt889:r1", 0.25), cons("art", "a-uova", "Uova fresche cat. A", "d-fatt889:r2", 4), cons("art", "a-amido", "Amido di mais", "d-fatt889:r4", 0.08)]},
    "p-tar241126": {"lotto": "TAR-241126-1", "ricettaId": "r-tartellette", "ricettaNome": "Tartellette crema e nocciole", "data": "2026-11-24", "qta": 20, "unita": "pz", "scadenza": "2026-11-26", "tipoScadenza": "entro",
                    "operatore": "Giulia", "note": "", "allergeni": ["glutine", "uova", "latte", "frutta_guscio"], "tracce": [], "creato": ts("2026-11-24", 7),
                    "consumi": [cons("art", "a-farina", "Farina 00", "d-fatt1187:r1", 0.3), cons("art", "a-burro", "Burro", "d-ddt452:r1", 0.15), cons("art", "a-zucchero", "Zucchero semolato", "d-fatt889:r1", 0.1), cons("art", "a-uova", "Uova fresche cat. A", "d-fatt889:r2", 1), cons("ric", "r-crema", "Crema pasticcera", "p-cre231126", 0.6), cons("art", "a-nocciole", "Nocciole tostate", "d-fatt889:r3", 0.05)]},
}
movimenti = {
    "m-acqua1": {"data": "2026-11-22", "tipo": "vendita", "lotKind": "acq", "lotId": "d-fatt889:r5", "delta": -10, "nota": "", "creato": ts("2026-11-22", 20)},
    "m-bis1": {"data": "2026-11-23", "tipo": "vendita", "lotKind": "prod", "lotId": "p-bis211126", "delta": -40, "nota": "Vendite al banco", "creato": ts("2026-11-23", 20)},
    "m-tar1": {"data": "2026-11-24", "tipo": "vendita", "lotKind": "prod", "lotId": "p-tar241126", "delta": -6, "nota": "", "creato": ts("2026-11-24", 20)},
}
seeds = {"fornitori": fornitori, "articoli": articoli, "documenti": documenti, "ricette": ricette, "produzioni": produzioni, "movimenti": movimenti}
pathlib.Path(__file__).with_name("dati-test.json").write_text(json.dumps(seeds, ensure_ascii=False, indent=1), encoding="utf-8")
print(sum(len(c) for c in seeds.values()), "elementi di prova")
