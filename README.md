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

## Primo avvio: dati di esempio e registrazione del bar

Al primo avvio l'app propone due strade:

- **Esplora con i dati di esempio**: riempie tutte le sezioni con un bar già avviato. Ci sono 9 fornitori, 34 articoli e 10 schede tecniche, comprese crema pasticcera e pasta frolla usate come semilavorati. Poi quattro settimane di consegne, produzioni, vendite, scarti e inventari, e diciotto mesi di fatture per i grafici dei prezzi, con burro, caffè e nocciole che rincarano, e zucchero e cacao che negli ultimi mesi calano. Le date sono sempre riferite al giorno in cui si caricano: in «Oggi» ci sono un lotto scaduto da smaltire, prodotti in scadenza, due articoli da riordinare e tre rincari recenti.
- **Registra il tuo bar**: nome, indirizzo e partita IVA, che compaiono in alto nell'app e sulle schede tecniche e sui documenti dei lotti scaricati o stampati.

Durante la prova si può fare tutto liberamente. Anche quello che si inserisce viene segnato come prova. Quando si registra il bar, i dati di esempio e le prove vengono cancellati e si parte da zero, con una lista di **primi passi**: fornitori, inventario iniziale, prima scheda, prima produzione. Da Impostazioni si possono anche riportare gli esempi alla data di oggi.

Gli esempi si generano in `src/esempi.js` con una simulazione giorno per giorno. Gli acquisti seguono i consumi, si usano prima i lotti che scadono prima e quello che scade si smaltisce: così giacenze, lotti e fatture tornano sempre. `test/check_esempi.js` lo verifica su date diverse.

## Fatture dei fornitori: XML e PDF

In Acquisti, o dal pulsante **+**, «Importa fatture» legge le fatture dei fornitori. Accetta l'XML della fattura elettronica (`.xml`, firmato `.p7m` o tanti insieme in uno `.zip`) oppure il PDF. Gli XML si scaricano dal portale Fatture e Corrispettivi dell'Agenzia delle Entrate o dal gestionale del commercialista; i PDF sono quelli che i fornitori mandano per mail. Tutto si legge nel browser, sul telefono: i file non vengono mandati da nessuna parte.

- Il fornitore si riconosce dalla partita IVA o dal nome; se manca, si crea con partita IVA, sede ed email.
- La prima volta si abbina ogni riga a un articolo, con la conversione proposta dalla descrizione (per esempio «CT 24» diventa 24 pezzi, «6X0,5LT» 3 litri). Le righe che non sono merce, come trasporto e cauzioni, si saltano. Da quel momento le fatture di quel fornitore risultano «Pronte» e si importano con un tocco.
- Se la fattura riporta lotto e scadenza, vengono letti; altrimenti si aggiungono a mano.
- Una fattura differita sui DDT già registrati non carica di nuovo la merce: completa i prezzi dei DDT e li collega alla fattura.
- Le note di credito, i file di ricevute e i metadati del Sistema di Interscambio vengono saltati, e le fatture già importate vengono riconosciute.

### Fatture in PDF

L'XML contiene i dati esatti della fattura; il PDF è un'impaginazione da cui i dati vanno ricostruiti. Il testo si estrae con [pdf.js](https://mozilla.github.io/pdf.js/) di Mozilla (in `vendor/pdfjs/`, licenza Apache 2.0), che si carica solo quando serve. Poi `src/fatture.js` ricompone righe e colonne dalla posizione delle parole:

- fornitore e partita IVA dalla carta intestata, numero e data, imponibile e totale, i DDT citati;
- le righe dalle intestazioni di colonna (Descrizione, Quantità, Prezzo, Importo, anche scritte attaccate) oppure, se non ci sono, dalle righe in cui quantità × prezzo = importo;
- fatture su più pagine, con o senza intestazioni ripetute e righe di riporto, lotto e scadenza scritti sotto la riga, sconti, righe che non sono merce come il trasporto.

Ogni riga si verifica con quantità × prezzo, e la somma delle righe con l'imponibile. Quando i conti tornano e fornitore e articoli sono già abbinati, anche il PDF risulta «Pronto» e si importa con un tocco; altrimenti resta «Da controllare», con numero, data, quantità e importi modificabili e il testo letto dal PDF consultabile. Le scansioni e le foto non contengono testo e non si leggono; i PDF protetti da password, le note di credito e i DDT vengono riconosciuti e non si caricano.

Il lettore di PDF è un modulo JavaScript: funziona se l'app è servita da un indirizzo web (GitHub Pages, o `python3 -m http.server` in locale), non aprendo `index.html` come file.

### Fatture dalla posta

Le fatture che arrivano per mail possono comparire da sole in «Importa fatture», senza scaricarle e caricarle a mano. Serve una casella Gmail, meglio se usata solo per le fatture, in cui arrivino le copie con il file allegato (XML, P7M, ZIP o PDF): dal servizio dove il bar riceve le fatture si attiva l'invio di una copia a quell'indirizzo.

Fa da ponte `apps-script/fatture-dalla-posta.gs`, un piccolo script di Google Apps Script, gratuito, che gira nell'account Google della casella. Legge solo gli allegati delle mail che corrispondono alla ricerca impostata nello script (di base tutte quelle con allegati) e li passa all'app. Si installa da Impostazioni → Fatture dalla posta, che guida passo per passo e copia lo script con la chiave del collegamento già scritta:

1. con l'account della casella si crea un progetto su script.google.com e si incolla lo script;
2. si esegue la funzione `prova`, che chiede il permesso di leggere Gmail;
3. si pubblica come app web (esegui come: il proprio account; accesso: chiunque) e si incolla nell'app l'URL che finisce con `/exec`.

L'app controlla la casella quando si apre, quando si torna su di essa e ogni 15 minuti mentre è aperta. Le fatture arrivate compaiono in «Oggi» e in Acquisti; «Importa fatture» le scarica e le legge come i file scelti a mano, quindi quelle dei fornitori già abbinati risultano pronte. Se una mail contiene la stessa fattura in XML e in PDF vale l'XML; le fatture che non sono merce, come luce e telefono, si tolgono con «Non importare». Lo script risponde solo a chi conosce l'URL e la chiave.

Il collegamento funziona dall'app pubblicata su un sito, come GitHub Pages; la versione su claude.ai non può chiamare siti esterni.

## Pensata per l'uso al banco

- Il pulsante **+** al centro della barra in basso apre le registrazioni rapide: produzione, acquisto, scarico, scheda, articolo e fornitore.
- La **ricerca** in alto (o il tasto `/` sul computer) trova lotti, anche del fornitore, prodotti, articoli, fatture e fornitori.
- Le azioni si fanno direttamente dalle righe: **Smaltisci** su un lotto scaduto, **Riordina** su un articolo sotto scorta (apre l'acquisto già compilato con fornitore e articolo). Quando i prodotti in scadenza sono tanti, «Oggi» ne mostra quattro e raccoglie gli altri in una riga.
- Le operazioni veloci, come segnare un lotto esaurito o smaltire, partono subito e si possono **annullare** dall'avviso in basso.
- Le schede si aprono dal basso e si chiudono trascinandole giù. Nella produzione c'è il contapezzi e l'anteprima del codice lotto.
- Tema chiaro e scuro automatici, layout per telefono e barra laterale da computer.

## Installarla sul telefono

Quando l'app è pubblicata su un sito, per esempio con GitHub Pages, si può installare:

- **iPhone (Safari)**: Condividi → Aggiungi alla schermata Home.
- **Android (Chrome)**: menu ⋮ → Installa app.

Si apre a tutto schermo con la sua icona e funziona anche senza rete, grazie a `sw.js`. Prima prova la rete, quindi mostra sempre l'ultima versione pubblicata.

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
  quick.js            pulsante +, scarico rapido, ricerca globale, installazione sul telefono
  fatture.js          lettura delle fatture XML (anche .p7m e .zip) e PDF, abbinamento agli articoli
  posta.js            fatture dalla posta: collegamento allo script di Google, controllo della casella, fatture arrivate
  esempi.js           bar di esempio (simulazione con date riferite a oggi), prova e registrazione del bar
  main.js             azioni, esportazioni, avvio e collegamento all'archivio
manifest.webmanifest  nome, colori e icone per installare l'app
sw.js                 funzionamento senza rete
icone/                icona dell'app (SVG e PNG)
vendor/pdfjs/         pdf.js di Mozilla, per estrarre il testo dai PDF (licenza Apache 2.0)
apps-script/          script di Google Apps Script che passa all'app gli allegati delle mail con le fatture
test/                 prove automatiche nel browser
  dati-test.json      dati fissi su cui girano le prove (creati da genera_dati_test.py)
  check_esempi.js     controlla la coerenza dei dati di esempio
  check_posta_gs.js   prova lo script di Google con una casella Gmail finta
```

## Modello dei dati

| Raccolta | Contenuto |
|---|---|
| `fornitori` | ragione sociale, P. IVA, contatti, abbinamenti fra le righe delle sue fatture e gli articoli |
| `articoli` | materie prime, prodotti da rivendere, imballaggi: unità (kg, l, pz), allergeni, nome in etichetta, scorta minima |
| `documenti` | fatture, DDT, scontrini, inventario iniziale. Ogni riga è un lotto: quantità, importo, lotto del fornitore, scadenza. Con `soloPrezzi` alimenta solo lo storico prezzi. |
| `ricette` | schede tecniche: ingredienti (articoli o semilavorati), resa, durata, tracce, prezzo |
| `produzioni` | lotti prodotti con i consumi: quale lotto di ogni ingrediente e quanto |
| `movimenti` | vendite, scarti, uso interno, rettifiche (variazione con segno su un lotto) |
| `impostazioni` | nome, indirizzo e partita IVA del bar, data di registrazione, giorni di preavviso, IVA, soglia dei rincari; nel documento `posta` il collegamento alla casella (URL dello script, chiave, mail già viste, fatture arrivate da importare) |

Gli elementi dei dati di esempio, e quelli inseriti durante la prova, hanno `esempio: true`.

Le giacenze non vengono salvate ma calcolate: quantità caricata, meno i consumi delle produzioni, più i movimenti.

## Sviluppo

Si modifica `src/` e poi si rigenera l'app:

```
python3 build.py
```

Le prove usano Python con Playwright e Google Chrome:

```
node test/check_esempi.js
python3 test/genera_dati_test.py
python3 test/test_app.py
python3 test/test_modes.py
python3 test/test_prezzi.py
python3 test/test_comodita.py
python3 test/test_esempi.py
python3 test/test_fatture.py
python3 test/test_fatture_pdf.py
node test/check_posta_gs.js
python3 test/test_posta.py
```

`test_fatture_pdf.py` crea fatture PDF di prova con impaginazioni diverse (foglio di stile dell'Agenzia, gestionali dei fornitori, testo a larghezza fissa, due pagine, tabelle fitte, scansioni, PDF protetti) e serve l'app da un piccolo server locale. Servono anche `reportlab` e `pypdf`. `test_posta.py` sostituisce lo script di Google con un piccolo server che dà le stesse risposte, da un indirizzo diverso da quello dell'app.

## Nota sulle etichette

L'elenco ingredienti e gli allergeni vengono costruiti dai dati inseriti negli articoli e nelle schede. Prima di esporli al pubblico vanno sempre controllati.
