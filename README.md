# Barista Flow

Web app per gestire banco e laboratorio di un bar: schede tecniche dei prodotti, lotti di produzione con scadenze e fatture degli ingredienti, giacenze di magazzino e analisi dei prezzi d'acquisto. Funziona dal browser, sul telefono come sul computer.

## Cosa fa

- **Schede tecniche**: ricetta e grammature, resa, durata, conservazione, procedimento e prezzo di vendita. I 14 allergeni si calcolano dagli ingredienti. L'elenco ingredienti per il cartello è in ordine di peso, con gli allergeni in maiuscolo. Costo e food cost si calcolano dalle fatture. Un semilavorato (per esempio la crema pasticcera) si può usare come ingrediente di altre schede.
- **Produzione a lotti**: da ogni scheda si registra un lotto, con codice tipo `BIS-241126-1` (come si scrive il codice si sceglie in Impostazioni). L'app propone per primi i lotti di ingredienti che scadono prima e scarta quelli scaduti. La scadenza del lotto si calcola dalla durata della scheda.
- **Tracciabilità nei due sensi**: dal lotto prodotto risali a ogni ingrediente, con lotto del fornitore, scadenza e fattura o DDT (anche la foto o il PDF allegato). Da un lotto del fornitore vedi in quali prodotti è finito, utile in caso di richiamo.
- **Banco, lo scontrino interno**: i prodotti in vendita a tasti grandi. Si toccano quelli venduti, si preme Invio e il magazzino si aggiorna subito (dettagli più sotto).
- **Magazzino**: giacenze lotto per lotto di materie prime, prodotti da rivendere, imballaggi e prodotti propri. Si registrano vendite, scarti, uso interno e rettifiche d'inventario, e si impostano le scorte minime.
- **Prezzi d'acquisto**: storico del prezzo al kg, al litro o al pezzo per ogni prodotto, con grafico e confronto fra fornitori. Mostra quanto si è speso in più nel periodo, quali prodotti sono rincarati o calati e quanto è cambiato il costo delle schede. In «Oggi» compare un avviso per i rincari recenti.
- **Pagina «Oggi»**: le cose da fare divise per urgenza (da smaltire, scade oggi, fatture da importare, prossimi giorni, da ordinare, prezzi in aumento). I riquadri in alto filtrano l'elenco.
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
3. si pubblica come app web (Esegui il deployment → Nuovo deployment → App web; Esegui come: Io; Chi ha accesso: Chiunque) e si incolla nell'app l'URL che finisce con `/exec`.

L'app salva il collegamento nel browser in cui lo fai, come il resto dei dati. Per un secondo dispositivo non si rifà lo script: in Impostazioni si copia il «link per un altro dispositivo», che contiene URL e chiave, e lo si incolla lì in «Collega la posta».

L'app controlla la casella quando si apre, quando si torna su di essa e ogni 15 minuti mentre è aperta. Le fatture arrivate compaiono in «Oggi» e in Acquisti; «Importa fatture» le scarica e le legge come i file scelti a mano, quindi quelle dei fornitori già abbinati risultano pronte. Se una mail contiene la stessa fattura in XML e in PDF vale l'XML; le fatture che non sono merce, come luce e telefono, si tolgono con «Non importare». Lo script risponde solo a chi conosce l'URL e la chiave.

Il collegamento funziona dall'app pubblicata su un sito, come GitHub Pages; la versione su claude.ai non può chiamare siti esterni.

Per aggiornare uno script già pubblicato: si sostituisce il testo con quello copiato dall'app, poi Esegui il deployment → Gestisci deployment → modifica → Versione: Nuova versione. L'URL resta lo stesso; se Google chiede nuovi permessi si esegue di nuovo `prova`.

### Notifiche sul telefono

Ogni giorno, all'ora scelta, il telefono riceve una notifica di Barista Flow con i lotti scaduti da smaltire, quelli che scadono oggi o nei prossimi giorni e gli articoli da riordinare, anche con l'app chiusa. Se si vuole, arriva una notifica anche per ogni fattura nella casella. Funzionano con Chrome su Android e, su iPhone e iPad (iOS 16.4 o successivo), con l'app aggiunta alla schermata Home e aperta da lì. Si attivano da Impostazioni → Notifiche sul telefono, dove si sceglie l'ora e si può mandare una notifica di prova.

Le manda lo stesso script di Google, senza servizi di terze parti:

- l'app gli passa un riepilogo (lotti con scadenza nei prossimi 30 giorni o già scaduti, articoli sotto la scorta minima) ogni volta che i dati cambiano;
- lo script controlla ogni 15 minuti e, dall'ora scelta, manda la notifica del giorno una volta sola;
- le notifiche seguono lo standard Web Push: firma VAPID (ES256, con il numero della firma ricavato come nella RFC 6979) e messaggio cifrato per il dispositivo (RFC 8291: ECDH P-256, HKDF, AES-128-GCM), scritti nello script perché Apps Script non li offre. La chiave privata resta nelle proprietà dello script.

Lo script conosce i dati dell'ultima volta che l'app è stata usata: per le scadenze va bene, perché le date si sanno in anticipo; per le scorte vale l'ultimo aggiornamento.

Con «Solo scadenze» (vedi sotto) l'app manda i lotti di produzione a parte: lo script li avvisa il giorno della scadenza e nei giorni prima, poi li lascia stare perché sono in archivio. Serve lo script dalla versione 3; con uno più vecchio l'app chiede di aggiornarlo, e intanto le notifiche non parlano di quei lotti.

## Banco: lo scontrino interno

Alla cassa il bar batte solo il reparto, quindi l'app non può sapere cosa è stato venduto. Il Banco serve a questo: dopo lo scontrino fiscale si batte lo scontrino interno in Barista Flow e i prodotti venduti escono dal magazzino, senza dover contare la vetrina a fine giornata.

- Ci sono tutti i prodotti in vendita: le schede tecniche (non i semilavorati) e gli articoli di rivendita, come bibite e cornetti. Sono tasti grandi, divisi per categoria e sempre nello stesso ordine, con giacenza e prezzo. In alto ci sono la ricerca e le categorie.
- Ogni tocco aggiunge un pezzo (100 g o 100 ml per i prodotti a peso o a volume); il tasto **−** ne toglie uno. In basso c'è lo scontrino in corso con il totale: toccandolo si aprono le righe, dove le quantità si cambiano o si scrivono.
- Con **Invio** si registra una vendita per ogni lotto, prima quelli che scadono prima. I lotti scaduti non si vendono e non si va mai oltre la giacenza. Lo scontrino si salva tutto o niente.
- Subito dopo si può annullare dall'avviso. Più tardi lo si annulla dalla riga «Ultimo scontrino» in basso, oppure da «Scontrini di oggi» in fondo alla pagina, dove ci sono anche i pezzi e il totale della giornata. In questi due casi l'app chiede conferma.
- Sul computer lo scontrino sta in un riquadro di lato e basta la tastiera: Invio nella ricerca aggiunge l'unico prodotto trovato, Invio su una quantità la conferma, poi Invio registra.
- Sul telefono si entra dal pulsante **Banco** in «Oggi» (sul computer è nella barra laterale). Se l'app resta sul Banco, quando si riapre torna lì: comodo per il telefono o il tablet della cassa.
- Il prezzo di vendita viene dalla scheda tecnica e, per la rivendita, dall'articolo (campo «Prezzo di vendita», IVA inclusa). Senza prezzo il prodotto si vende lo stesso, ma non entra nel totale.

Nei movimenti le vendite del Banco hanno la nota «Banco, ore 10:42», il codice dello scontrino (`banco`) e il prezzo unitario del momento (`prezzo`).

## Vendite: scarico al Banco o solo scadenze

Battere ogni vendita anche nell'app non sempre si può fare: con la coda al banco rallenta troppo. In Impostazioni → Vendite si sceglie come lavora il bar, e la scelta vale per tutti i dispositivi:

- **Scarico al Banco** (di partenza): i prodotti venduti escono dal magazzino con lo scontrino interno, come descritto sopra.
- **Solo scadenze**: il Banco si spegne e sparisce dai menu, ma la funzione resta e si riaccende quando si vuole. Il controllo si ferma alle materie prime in magazzino e al loro scarico con le produzioni:
  - un lotto di produzione resta «in vetrina» con la quantità prodotta fino alla scadenza, con l'avviso in «Oggi» e nelle notifiche nei giorni prima e il giorno stesso; dopo va in archivio, senza «da smaltire» e senza scarichi da registrare;
  - i semilavorati, che si consumano nelle produzioni, restano con giacenza, scadenza e «da smaltire» come le materie prime;
  - la rivendita (bibite, cornetti surgelati…) resta negli acquisti e nei grafici dei prezzi, senza giacenza, scorta minima né avvisi;
  - in Produzione i filtri diventano «Attivi», «In archivio» e «Tutti»; nello scarico rapido restano solo materie prime, imballaggi e semilavorati.

I dati non cambiano: riaccendendo lo scarico al Banco, giacenze e movimenti tornano come prima.

## Codice dei lotti

In Impostazioni → Codice dei lotti si sceglie come si chiamano i lotti di produzione. Di partenza è il codice di sempre: sigla del prodotto, giorno-mese-anno e numero del giorno (`BIS-241126-1`). Si può scegliere:

- **Lettere all'inizio**: fisse per tutti i lotti, per esempio `L` (fino a 6 lettere o cifre).
- **Sigla del prodotto**: sì o no. La sigla si sceglie nella scheda tecnica (di partenza sono le prime tre lettere del nome). Con la sigla ogni prodotto ha la sua numerazione; senza, i lotti di tutti i prodotti si contano insieme.
- **Numerazione**:
  - data e numero del giorno: `241126-1`;
  - giorno dell'anno (data giuliana) e numero del giorno: `26328-1`;
  - anno e numero, che riparte ogni anno: `26-1`;
  - numero progressivo, che non riparte mai: `1`, `2`, `3`…
- **Cifre del numero**: senza zeri davanti o da 2 a 5 cifre (`0001`).
- **Separatore**: trattino, barra, punto o niente.
- **Parti da**, con anno e numero o con il progressivo: per continuare una numerazione tenuta prima a mano. Con l'anno vale solo per l'anno in cui si scrive; dall'anno dopo si riparte da 1.

Un riquadro mostra il prossimo codice dell'ultimo prodotto fatto e cambia mentre si sceglie, prima di salvare. Le scelte valgono per i lotti nuovi: quelli già registrati tengono il loro codice. Il numero va avanti dal più alto già usato con lo stesso inizio, quindi non si ripete e non riprende i numeri dei lotti eliminati.

## Pensata per l'uso al banco

- Il pulsante **+** al centro della barra in basso apre le registrazioni rapide: produzione, acquisto, scarico, scheda, articolo e fornitore.
- La **ricerca** in alto (o il tasto `/` sul computer) trova lotti, anche del fornitore, prodotti, articoli, fatture e fornitori.
- Le azioni si fanno direttamente dalle righe: **Smaltisci** su un lotto scaduto (o **Smaltisci tutti** quando sono più di uno), **Riordina** su un articolo sotto scorta (apre l'acquisto già compilato con fornitore e articolo). Quando i prodotti in scadenza sono tanti, «Oggi» ne mostra quattro e raccoglie gli altri in una riga.
- Le operazioni veloci, come segnare un lotto esaurito o smaltire, partono subito e si possono **annullare** dall'avviso in basso. La riga smaltita scivola via e l'elenco si richiude senza salti; sul telefono una vibrazione breve conferma (dove il browser lo permette).
- Le schede si aprono dal basso e si chiudono trascinandole giù, con la X o con il tasto **Indietro** del telefono o del browser. Se un modulo ha modifiche non salvate, Indietro chiede prima conferma.
- Ogni sezione ricorda il punto in cui eri; toccando di nuovo la sezione in cui sei torni in cima. Il passaggio tra le pagine è una dissolvenza breve dello schermo visibile, veloce anche con le pagine lunghe (disattivata se nel telefono è attivo «riduci movimento»).
- Gli elenchi che crescono col tempo, cioè i documenti d'acquisto e i lotti esauriti, mostrano i 40 più recenti e gli altri a gruppi con «Mostra altri». La ricerca guarda sempre in tutti: così la sezione resta veloce anche dopo anni di fatture.
- Nel pulsante **+**, «Produci di nuovo» propone le produzioni più frequenti delle ultime sei settimane: un tocco apre il modulo già compilato con la quantità fatta più spesso. Nella produzione c'è il contapezzi e l'anteprima del codice lotto.
- Creando un **articolo nuovo** (dal Magazzino, dal + o dal Banco) si può scrivere subito la quantità comprata, per esempio 12,5 kg o 250 g: con «Crea e continua» si apre l'acquisto già compilato con articolo, quantità e fornitore abituale, e restano da aggiungere prezzo, lotto e scadenza. Dentro un acquisto o una fattura la quantità si scrive nella riga.
- Le date dei moduli hanno le scelte rapide **Oggi** e **Ieri**. Nei documenti d'acquisto i fornitori usati di recente stanno in cima, il tipo di documento segue l'ultima volta (chi manda il DDT, chi la fattura) e nelle righe compaiono per primi gli articoli che compri di solito da quel fornitore.
- Stile: verde Alpi (il marmo dei banconi) per azioni e struttura, ottone come filo sottile, superfici di porcellana; la sera diventa verde quasi nero con dettagli champagne, in automatico come il telefono. In Impostazioni → Aspetto si sceglie anche «Chiaro» o «Scuro» fisso: vale per quel dispositivo e si applica prima che la pagina si disegni, quindi aprendo in scuro non c'è nessun lampo chiaro. Un solo carattere, Instrument Sans, incluso nell'app: niente caratteri scaricati da Google, funziona anche senza rete. Layout per telefono e barra laterale da computer.

## Installarla sul telefono

Quando l'app è pubblicata su un sito, per esempio con GitHub Pages, si può installare:

- **iPhone (Safari)**: Condividi → Aggiungi alla schermata Home.
- **Android (Chrome)**: menu ⋮ → Installa app.

Si apre a tutto schermo con la sua icona e funziona anche senza rete, grazie a `sw.js`. Prima prova la rete e chiede sempre al sito se i file sono cambiati, invece di fidarsi della copia del browser: un aggiornamento arriva alla prima apertura. Se l'app è già aperta quando esce una versione nuova (per esempio è rimasta in sottofondo sul telefono), tornandoci compare l'avviso «Aggiorna». `build.py` scrive in `index.html` un'impronta della versione, che l'app confronta con quella del sito.

## Dove salva i dati

- **Pagina aperta da claude.ai** (artifact): i dati stanno nell'archivio della pagina e si vedono da ogni dispositivo. Chi ha il permesso di modifica può registrare produzioni e scarichi.
- **File `index.html` aperto da browser o pubblicato** (per esempio con GitHub Pages): i dati restano nel browser che si usa (localStorage). Conviene esportare spesso il backup da Impostazioni.

Il backup JSON contiene tutto e si reimporta da Impostazioni. È anche il formato con cui spostare i dati su un database condiviso.

## Struttura

```
index.html            l'app completa in un solo file (generato da build.py)
build.py              unisce src/ e il carattere in index.html
src/
  shell.html          struttura della pagina
  style.css           stile (tema chiaro e scuro)
  core.js             dati, calcolo di lotti, giacenze, costi, allergeni, prezzi
  views.js            pagine: Oggi, Produzione, Schede, Magazzino, Acquisti, Prezzi, Impostazioni
  details.js          dettagli: lotto, lotto del fornitore, articolo, scheda, documento, storico prezzi con grafico
  forms.js            moduli: articolo, fornitore, documento d'acquisto, scheda tecnica, produzione, scarichi
  quick.js            pulsante +, scarico rapido, ricerca globale, installazione sul telefono
  banco.js            Banco: tasti dei prodotti in vendita, scontrino interno, Invio, scontrini di oggi
  fatture.js          lettura delle fatture XML (anche .p7m e .zip) e PDF, abbinamento agli articoli
  posta.js            fatture dalla posta: collegamento allo script di Google, controllo della casella, fatture arrivate
  notifiche.js        notifiche sul telefono: iscrizione, ora e temi, riepilogo di scadenze e scorte per lo script
  esempi.js           bar di esempio (simulazione con date riferite a oggi), prova e registrazione del bar
  main.js             azioni, esportazioni, avvio e collegamento all'archivio
manifest.webmanifest  nome, colori e icone per installare l'app
sw.js                 funzionamento senza rete e notifiche
icone/                icona dell'app (SVG e PNG)
fonts/                Instrument Sans (WOFF2, solo caratteri latini) e la sua licenza OFL
vendor/pdfjs/         pdf.js di Mozilla, per estrarre il testo dai PDF (licenza Apache 2.0)
apps-script/          script di Google Apps Script: allegati delle mail con le fatture e notifiche sul telefono
test/                 prove automatiche nel browser
  dati-test.json      dati fissi su cui girano le prove (creati da genera_dati_test.py)
  check_esempi.js     controlla la coerenza dei dati di esempio
  check_posta_gs.js   prova lo script di Google: casella Gmail finta, crittografia contro Node e le RFC
  gs_sandbox.js       ambiente Google finto in cui gira lo script
  fake_google.js      Google finto per le prove nel browser: esegue lo script vero e fa da servizio push
```

## Modello dei dati

| Raccolta | Contenuto |
|---|---|
| `fornitori` | ragione sociale, P. IVA, contatti, abbinamenti fra le righe delle sue fatture e gli articoli |
| `articoli` | materie prime, prodotti da rivendere, imballaggi: unità (kg, l, pz), allergeni, nome in etichetta, scorta minima; per la rivendita il prezzo di vendita |
| `documenti` | fatture, DDT, scontrini, inventario iniziale. Ogni riga è un lotto: quantità, importo, lotto del fornitore, scadenza. Con `soloPrezzi` alimenta solo lo storico prezzi. |
| `ricette` | schede tecniche: ingredienti (articoli o semilavorati), resa, durata, tracce, prezzo |
| `produzioni` | lotti prodotti con i consumi: quale lotto di ogni ingrediente e quanto |
| `movimenti` | vendite, scarti, uso interno, rettifiche (variazione con segno su un lotto); quelle del Banco hanno anche `banco` (lo scontrino) e `prezzo` |
| `impostazioni` | nome, indirizzo e partita IVA del bar, data di registrazione, giorni di preavviso, IVA, soglia dei rincari, scarico delle vendite (`scaricoVendite`: falso con «Solo scadenze»), codice dei lotti (`lotti`: lettere, sigla, numerazione, cifre, separatore, «Parti da» e il suo anno); nel documento `posta` il collegamento alla casella (URL dello script, chiave, mail già viste, fatture arrivate da importare) e le notifiche di questo dispositivo (ora, temi, ultimo riepilogo mandato) |

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
python3 test/test_uso.py
python3 test/test_banco.py
python3 test/test_anno.py
python3 test/test_tema.py
python3 test/test_scadenze.py
python3 test/test_lotti.py
python3 test/test_esempi.py
python3 test/test_fatture.py
python3 test/test_fatture_pdf.py
node test/check_posta_gs.js
python3 test/test_posta.py
python3 test/test_notifiche.py
```

`test_lotti.py` prova il codice dei lotti: di partenza quello di sempre, l'anteprima che segue le scelte prima di salvare, lettere fisse e progressivo con «Parti da», separatori e cifre, la numerazione per prodotto con la sigla e per tutti senza, l'anno nuovo che riparte da 1, la data giuliana e la sola lettura. `test_scadenze.py` prova «Solo scadenze»: Banco spento, lotti di produzione in vetrina e poi in archivio, semilavorati e materie prime da smaltire come sempre, rivendita solo negli acquisti, e il ritorno allo scarico al Banco. `test_tema.py` prova il tema in Impostazioni: automatico, chiaro e scuro, la barra del browser e il ritorno senza lampi. `test_anno.py` carica un anno di lavoro (più di 500 documenti) e controlla che Acquisti e Produzione restino leggere, che la ricerca trovi anche i documenti più vecchi e che il passaggio tra le pagine fotografi solo lo schermo. `test_banco.py` prova il Banco: tasti, quantità, Invio per lotti (prima quelli che scadono prima), annullare, scontrini di oggi, tastiera, prezzo della rivendita, sola lettura e riapertura sul Banco. `test_uso.py` prova «Oggi» per urgenza con i filtri, Smaltisci tutti con un solo Annulla, il tasto Indietro sui fogli e sui moduli modificati, «Produci di nuovo», Oggi e Ieri, le abitudini dei fornitori, la memoria dello scorrimento e il movimento ridotto. `test_fatture_pdf.py` crea fatture PDF di prova con impaginazioni diverse (foglio di stile dell'Agenzia, gestionali dei fornitori, testo a larghezza fissa, due pagine, tabelle fitte, scansioni, PDF protetti) e serve l'app da un piccolo server locale. Servono anche `reportlab` e `pypdf`. `test_posta.py` sostituisce lo script di Google con un piccolo server che dà le stesse risposte, da un indirizzo diverso da quello dell'app. `test_notifiche.py` fa girare lo script vero in `fake_google.js`: il browser si iscrive, lo script firma e cifra le notifiche, il «telefono» le decifra e il service worker dell'app le mostra.

## Nota sulle etichette

L'elenco ingredienti e gli allergeni vengono costruiti dai dati inseriti negli articoli e nelle schede. Prima di esporli al pubblico vanno sempre controllati.
