# Barista Flow

Web app per gestire banco e laboratorio di un bar: schede tecniche dei prodotti, lotti di produzione con scadenze e fatture degli ingredienti, giacenze di magazzino e analisi dei prezzi d'acquisto. Funziona dal browser, sul telefono come sul computer.

## Cosa fa

- **Schede tecniche**: ricetta e grammature, resa, durata, conservazione, procedimento e prezzo di vendita. I 14 allergeni si calcolano dagli ingredienti. L'elenco ingredienti per il cartello è in ordine di peso, con gli allergeni in maiuscolo. Costo e food cost si calcolano dalle fatture. Un semilavorato (per esempio la crema pasticcera) si può usare come ingrediente di altre schede.
- **Produzione a lotti**: da ogni scheda si registra un lotto, con codice tipo `BIS-241126-1`. L'app propone per primi i lotti di ingredienti che scadono prima e scarta quelli scaduti. La scadenza del lotto si calcola dalla durata della scheda.
- **Tracciabilità nei due sensi**: dal lotto prodotto risali a ogni ingrediente, con lotto del fornitore, scadenza e fattura o DDT (anche la foto o il PDF allegato). Da un lotto del fornitore vedi in quali prodotti è finito, utile in caso di richiamo.
- **Magazzino**: giacenze lotto per lotto di materie prime, prodotti da rivendere, imballaggi e prodotti propri. Si registrano vendite, scarti, uso interno e rettifiche d'inventario, e si impostano le scorte minime.
- **Prezzi d'acquisto**: storico del prezzo al kg, al litro o al pezzo per ogni prodotto, con grafico e confronto fra fornitori. Mostra quanto si è speso in più nel periodo, quali prodotti sono rincarati o calati e quanto è cambiato il costo delle schede. In «Oggi» compare un avviso per i rincari recenti.
- **Pagina «Oggi»**: lotti scaduti da smaltire, prodotti in scadenza, articoli sotto scorta e rincari.
- **Esportazioni**: scheda tecnica e scheda lotto stampabili, libro ingredienti, giacenze e storico prezzi in CSV, backup completo in JSON.

## Dove salva i dati

- **Pagina aperta da claude.ai** (artifact): i dati stanno nell'archivio della pagina e si vedono da ogni dispositivo. Chi ha il permesso di modifica può registrare produzioni e scarichi.
- **File `index.html` aperto da browser o pubblicato** (per esempio con GitHub Pages): i dati restano nel browser che si usa (localStorage). Conviene esportare spesso il backup da Impostazioni.

Il backup JSON contiene tutto e si reimporta da Impostazioni. È anche il formato con cui spostare i dati su un database condiviso.

## Struttura

```
index.html            l'app completa in un solo file (generato da build.py)
build.py              unisce src/ in index.html
src/
  shell.html          struttura della pagina
  style.css           stile (tema chiaro e scuro)
  core.js             dati, calcolo di lotti, giacenze, costi, allergeni, prezzi
  views.js            pagine: Oggi, Produzione, Schede, Magazzino, Acquisti, Prezzi, Impostazioni
  details.js          dettagli: lotto, lotto del fornitore, articolo, scheda, documento, storico prezzi con grafico
  forms.js            moduli: articolo, fornitore, documento d'acquisto, scheda tecnica, produzione, scarichi
  main.js             azioni, esportazioni, avvio e collegamento all'archivio
esempi/
  genera_esempi.py    crea dati-esempio.json
  dati-esempio.json   dati di esempio (biscotti, crema, tartellette, acquisti e storico prezzi)
test/                 prove automatiche nel browser
```

## Modello dei dati

| Raccolta | Contenuto |
|---|---|
| `fornitori` | ragione sociale, P. IVA, contatti |
| `articoli` | materie prime, prodotti da rivendere, imballaggi: unità (kg, l, pz), allergeni, nome in etichetta, scorta minima |
| `documenti` | fatture, DDT, scontrini, inventario iniziale. Ogni riga è un lotto: quantità, importo, lotto del fornitore, scadenza. Con `soloPrezzi` alimenta solo lo storico prezzi. |
| `ricette` | schede tecniche: ingredienti (articoli o semilavorati), resa, durata, tracce, prezzo |
| `produzioni` | lotti prodotti con i consumi: quale lotto di ogni ingrediente e quanto |
| `movimenti` | vendite, scarti, uso interno, rettifiche (variazione con segno su un lotto) |
| `impostazioni` | nome dell'attività, giorni di preavviso, IVA, soglia dei rincari |

Le giacenze non vengono salvate ma calcolate: quantità caricata, meno i consumi delle produzioni, più i movimenti.

## Sviluppo

Si modifica `src/` e poi si rigenera l'app:

```
python3 build.py
```

Le prove usano Python con Playwright e Google Chrome:

```
python3 esempi/genera_esempi.py
python3 test/test_app.py
python3 test/test_modes.py
python3 test/test_prezzi.py
```

## Nota sulle etichette

L'elenco ingredienti e gli allergeni vengono costruiti dai dati inseriti negli articoli e nelle schede. Prima di esporli al pubblico vanno sempre controllati.
