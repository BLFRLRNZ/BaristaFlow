/* ---------- dati di esempio: un bar già avviato, con le date riferite al giorno in cui si caricano ---------- */
const ES_GIORNI = 28, ES_STORICO = 540;
const ES_FORN = {
  // giorni di consegna (0 = domenica), documento di consegna, ogni quanti giorni c'è una fattura nello storico, fatture all'anno / 365
  molino: {nome: 'Molino del Borgo', note: 'Farine e pane in cassetta. Consegna il mercoledì, ordine entro lunedì.', email: 'ordini@molinodelborgo.example', gg: [3], tipo: 'fattura', storico: 61, ritmo: 1.7},
  latteria: {nome: 'Latteria Val Verde', note: 'Burro, latte, panna e mascarpone. Consegna martedì e venerdì con DDT, fattura riepilogativa a fine mese.', email: 'ordini@latteriavalverde.example', gg: [2, 5], tipo: 'ddt', storico: 0, ritmo: .9},
  dolciaria: {nome: 'Dolciaria Sud Ingrosso', note: 'Ingredienti per pasticceria e surgelati. Consegna il lunedì.', email: 'vendite@dolciariasud.example', gg: [1], tipo: 'fattura', storico: 42, ritmo: 6.1},
  torrefazione: {nome: 'Torrefazione Aurora', note: 'Caffè tostato ogni settimana. Consegna il giovedì.', email: '', gg: [4], tipo: 'fattura', storico: 30, ritmo: 2.4},
  ortofrutta: {nome: 'Ortofrutta Il Sole', note: 'Frutta e verdura: lunedì e giovedì entro le 8.', email: '', gg: [1, 4], tipo: 'fattura', storico: 42, ritmo: 3.3},
  bevande: {nome: 'Bevande del Sud', note: 'Acqua, bibite e birra. Consegna il mercoledì, ritiro dei vuoti a ogni giro.', email: 'ordini@bevandedelsud.example', gg: [3], tipo: 'fattura', storico: 61, ritmo: 4.2},
  cascina: {nome: 'Cascina Le Rondini', note: 'Uova fresche di galline allevate a terra. Consegna il sabato.', email: '', gg: [6], tipo: 'fattura', storico: 30, ritmo: .6},
  cash: {nome: 'Cash & Carry Centro', note: 'Spesa al banco: tonno, maionese e acquisti urgenti.', email: '', gg: [5], tipo: 'scontrino', storico: 91, ritmo: 0},
  imballi: {nome: 'Cartotecnica Imballi', note: 'Sacchetti, vaschette e bicchieri. Ordine minimo 150 €.', email: 'info@cartotecnicaimballi.example', gg: [2], tipo: 'fattura', storico: 91, ritmo: 2.8}
};
const ES_ART = [
  // chiave, nome, categoria, unità, peso del pezzo, nome in etichetta, allergeni, conservazione, scorta minima, fornitore, confezione, durata in giorni,
  // prezzi [giorni fa, € per unità], stagione [ampiezza, giorno dell'anno del prezzo più alto]
  ['farina', 'Farina 00', 'materia', 'kg', 0, 'farina di GRANO tenero tipo 00', ['glutine'], 'ambiente', 10, 'molino', 25, 240, [[540, .86], [360, .9], [200, .89], [0, .88]]],
  ['pane', 'Pane per tramezzini', 'materia', 'kg', 0, 'pane per tramezzini (farina di GRANO tenero, acqua, olio di semi di girasole, lievito, sale)', ['glutine'], 'ambiente', 0, 'molino', 1, 12, [[540, 3.1], [300, 3.3], [100, 3.45], [0, 3.6]]],
  ['burro', 'Burro', 'materia', 'kg', 0, 'BURRO', ['latte'], 'frigo', 2, 'latteria', 1, 45, [[540, 7.9], [420, 8.05], [300, 8.4], [180, 8.6], [60, 8.85], [0, 8.95]]],
  ['latte', 'Latte intero fresco', 'materia', 'l', 0, 'LATTE intero', ['latte'], 'frigo', 2, 'latteria', 1, 7, [[540, 1.18], [300, 1.22], [120, 1.26], [0, 1.29]]],
  ['panna', 'Panna fresca 35%', 'materia', 'l', 0, 'panna fresca (LATTE)', ['latte'], 'frigo', .5, 'latteria', .5, 12, [[540, 4.1], [250, 4.3], [0, 4.45]]],
  ['mascarpone', 'Mascarpone', 'materia', 'kg', 0, 'MASCARPONE', ['latte'], 'frigo', .5, 'latteria', .5, 25, [[540, 6.9], [270, 7.2], [0, 7.6]]],
  ['uova', 'Uova fresche cat. A', 'materia', 'pz', 60, 'UOVA', ['uova'], 'frigo', 30, 'cascina', 30, 28, [[540, .21], [400, .22], [250, .24], [150, .25], [0, .27]]],
  ['zucchero', 'Zucchero semolato', 'materia', 'kg', 0, 'zucchero', [], 'ambiente', 5, 'dolciaria', 5, 720, [[540, 1.32], [360, 1.24], [180, 1.12], [0, 1.06]]],
  ['amido', 'Amido di mais', 'materia', 'kg', 0, 'amido di mais', [], 'ambiente', .5, 'dolciaria', 1, 540, [[540, 3.1], [0, 3.25]]],
  ['lievito', 'Lievito per dolci', 'materia', 'kg', 0, 'agenti lievitanti (difosfato disodico, carbonato acido di sodio), amido di mais', [], 'ambiente', .2, 'dolciaria', 1, 360, [[540, 6.4], [0, 6.6]]],
  ['sale', 'Sale fino', 'materia', 'kg', 0, 'sale', [], 'ambiente', .5, 'dolciaria', 1, 1500, [[540, .45], [0, .48]]],
  ['cacao', 'Cacao amaro in polvere', 'materia', 'kg', 0, 'cacao magro in polvere', [], 'ambiente', 1, 'dolciaria', 1, 540, [[540, 9.8], [400, 12.5], [300, 15.9], [200, 15.2], [100, 14.1], [0, 13.2]]],
  ['cioccolato', 'Cioccolato fondente 55%', 'materia', 'kg', 0, 'cioccolato fondente (pasta di cacao, zucchero, burro di cacao, emulsionante: lecitina di SOIA)', ['soia'], 'ambiente', 1, 'dolciaria', 1, 365, [[540, 11.5], [400, 13.4], [300, 15.8], [150, 15.3], [0, 14.9]]],
  ['nocciole', 'Nocciole tostate', 'materia', 'kg', 0, 'NOCCIOLE', ['frutta_guscio'], 'ambiente', .3, 'dolciaria', 1, 240, [[540, 15.8], [360, 16.9], [220, 18.8], [0, 19.5]]],
  ['confettura', 'Confettura di albicocche', 'materia', 'kg', 0, 'confettura di albicocche (albicocche, zucchero, gelificante: pectina, correttore di acidità: acido citrico)', [], 'ambiente', 1, 'dolciaria', 3, 300, [[540, 4.3], [0, 4.6]]],
  ['savoiardi', 'Savoiardi', 'materia', 'kg', 0, 'savoiardi (farina di FRUMENTO, zucchero, UOVA, agenti lievitanti)', ['glutine', 'uova'], 'ambiente', .5, 'dolciaria', 1, 180, [[540, 6.2], [0, 6.8]]],
  ['frutti', 'Frutti di bosco surgelati', 'materia', 'kg', 0, 'frutti di bosco (lamponi, mirtilli, more, ribes)', [], 'freezer', .5, 'dolciaria', 1, 365, [[540, 8.2], [0, 8.9]]],
  ['caffe', 'Caffè in grani, miscela bar', 'materia', 'kg', 0, 'caffè', [], 'ambiente', 4, 'torrefazione', 1, 300, [[540, 17.5], [400, 18.4], [270, 19.6], [150, 20.1], [0, 20.5]]],
  ['decaf', 'Caffè decaffeinato in grani', 'materia', 'kg', 0, 'caffè decaffeinato', [], 'ambiente', .5, 'torrefazione', .5, 300, [[540, 19.8], [270, 21.5], [0, 22.6]]],
  ['mele', 'Mele Golden', 'materia', 'kg', 0, 'mele', [], 'frigo', 1, 'ortofrutta', 1, 30, [[540, 1.6], [0, 1.75]], [.08, 200]],
  ['limoni', 'Limoni', 'materia', 'kg', 0, 'limoni', [], 'frigo', .5, 'ortofrutta', 1, 21, [[540, 1.9], [0, 2.1]], [.15, 215]],
  ['arance', 'Arance da spremuta', 'materia', 'kg', 0, 'arance', [], 'ambiente', 5, 'ortofrutta', 5, 14, [[540, 1.15], [0, 1.3]], [.18, 230]],
  ['pomodori', 'Pomodori ramati', 'materia', 'kg', 0, 'pomodori', [], 'frigo', 0, 'ortofrutta', .5, 7, [[540, 2.1], [0, 2.3]], [.2, 30]],
  ['tonno', "Tonno all'olio d'oliva", 'materia', 'kg', 0, "TONNO all'olio di oliva", ['pesce'], 'ambiente', .4, 'cash', 1, 900, [[540, 11.5], [200, 12.4], [0, 12.9]]],
  ['maionese', 'Maionese', 'materia', 'kg', 0, "maionese (olio di semi di girasole, TUORLO d'UOVO, aceto, SENAPE, sale, succo di limone)", ['uova', 'senape'], 'frigo', .2, 'cash', 1, 120, [[540, 4.9], [0, 5.4]]],
  ['cornetti', 'Cornetti surgelati da cuocere', 'rivendita', 'pz', 0, '', ['glutine', 'uova', 'latte', 'soia'], 'freezer', 100, 'dolciaria', 50, 180, [[540, .27], [300, .29], [0, .32]]],
  ['acqua', 'Acqua naturale 0,5 l', 'rivendita', 'pz', 0, '', [], 'ambiente', 48, 'bevande', 24, 365, [[540, .21], [0, .24]]],
  ['frizzante', 'Acqua frizzante 0,5 l', 'rivendita', 'pz', 0, '', [], 'ambiente', 24, 'bevande', 24, 365, [[540, .21], [0, .24]]],
  ['cola', 'Cola in vetro 33 cl', 'rivendita', 'pz', 0, '', [], 'ambiente', 24, 'bevande', 24, 270, [[540, .58], [300, .61], [120, .64], [0, .65]]],
  ['succo', 'Succo di pesca 20 cl', 'rivendita', 'pz', 0, '', [], 'ambiente', 12, 'bevande', 24, 300, [[540, .42], [0, .46]]],
  ['birra', 'Birra chiara 33 cl', 'rivendita', 'pz', 0, '', ['glutine'], 'ambiente', 12, 'bevande', 24, 270, [[540, .72], [0, .81]]],
  ['sacchetti', 'Sacchetti di carta per alimenti', 'imballaggio', 'pz', 0, '', [], 'ambiente', 200, 'imballi', 1000, 0, [[540, .022], [0, .026]]],
  ['vaschette', 'Vaschette per pasticceria', 'imballaggio', 'pz', 0, '', [], 'ambiente', 150, 'imballi', 500, 0, [[540, .085], [0, .095]]],
  ['bicchieri', 'Bicchieri da asporto 4 oz', 'imballaggio', 'pz', 0, '', [], 'ambiente', 300, 'imballi', 1000, 0, [[540, .048], [0, .052]]]
];
const ES_NOTE_ART = {
  burro: 'Panetti da 1 kg.',
  caffe: 'Miscela 80% arabica e 20% robusta. Macinatura da regolare ogni mattina.',
  uova: 'Fino a qualche mese fa le prendevamo da Dolciaria Sud Ingrosso.',
  cornetti: 'Cottura 18 minuti a 175 °C, da sfornare in giornata.',
  arance: 'Per le spremute: circa 3 arance a bicchiere.'
};
/* articoli che nel periodo non sono stati riordinati: la giacenza di partenza è fissa e finiscono sotto scorta */
const ES_FISSO = {cacao: .6, vaschette: 300};
const ES_RIC = {
  frolla: {nome: 'Pasta frolla', sigla: 'FRO', cat: 'Semilavorati', semi: true, resa: 2.2, u: 'kg', shelf: 4, tipo: 'entro', tracce: ['frutta_guscio'],
    ing: [['farina', 1000, 'g'], ['burro', 600, 'g'], ['zucchero', 400, 'g'], ['uova', 4, 'pz'], ['sale', 2, 'g']],
    cons: 'In frigorifero a 0–4 °C, avvolta nella pellicola',
    proc: "Lavorare il burro freddo a pezzetti con lo zucchero e il sale.\nUnire le uova una alla volta, poi la farina setacciata, impastando il minimo indispensabile.\nAppiattire, avvolgere nella pellicola e far riposare almeno 2 ore in frigorifero prima dell'uso."},
  crema: {nome: 'Crema pasticcera', sigla: 'CRE', cat: 'Semilavorati', semi: true, resa: 1.3, u: 'kg', shelf: 3, tipo: 'entro',
    ing: [['latte', 1, 'l'], ['zucchero', 250, 'g'], ['uova', 5, 'pz'], ['amido', 80, 'g']],
    cons: 'In frigorifero a 0–4 °C, coperta con pellicola a contatto',
    proc: "Scaldare il latte senza farlo bollire.\nSbattere le uova con lo zucchero e unire l'amido setacciato.\nVersare il latte caldo a filo, riportare sul fuoco e cuocere mescolando per 2 minuti dal bollore.\nAbbattere subito la temperatura (sotto i 10 °C entro 2 ore) e conservare coperta in frigorifero."},
  biscotti: {nome: 'Biscotti al burro', sigla: 'BIS', cat: 'Dolci da forno', resa: 60, u: 'pz', pesoPz: 16, shelf: 15, tipo: 'preferibilmente', tracce: ['frutta_guscio'], prezzo: .6,
    ing: [['farina', 500, 'g'], ['burro', 250, 'g'], ['zucchero', 200, 'g'], ['uova', 2, 'pz'], ['sale', 1, 'g']],
    cons: 'In luogo fresco e asciutto, in contenitore chiuso',
    proc: "Lavorare il burro morbido con lo zucchero e il sale. Unire le uova, poi la farina setacciata.\nRiposo dell'impasto 1 ora in frigorifero, stendere a 5 mm e coppare.\nCuocere a 170 °C per 12–14 minuti e lasciar raffreddare su griglia prima di confezionare.",
    note: 'Nello stesso laboratorio si lavorano le nocciole.'},
  cookies: {nome: 'Cookies cioccolato e nocciole', sigla: 'COO', cat: 'Dolci da forno', resa: 40, u: 'pz', pesoPz: 30, shelf: 10, tipo: 'preferibilmente', prezzo: 1.2,
    ing: [['farina', 450, 'g'], ['burro', 250, 'g'], ['zucchero', 250, 'g'], ['uova', 2, 'pz'], ['cioccolato', 300, 'g'], ['nocciole', 100, 'g'], ['lievito', 6, 'g'], ['sale', 2, 'g']],
    cons: 'In luogo fresco e asciutto, in contenitore chiuso',
    proc: "Montare il burro morbido con lo zucchero e unire le uova.\nAggiungere farina, lievito e sale, poi il cioccolato a pezzi e le nocciole tritate grossolanamente.\nFormare palline da 30 g, appiattirle appena e cuocere a 180 °C per 11 minuti."},
  crostata: {nome: 'Crostata di albicocche', sigla: 'CRO', cat: 'Dolci da forno', resa: 10, u: 'pz', pesoPz: 105, shelf: 4, tipo: 'preferibilmente', prezzo: 2.5,
    ing: [['@frolla', 600, 'g'], ['confettura', 450, 'g']],
    cons: 'A temperatura ambiente, sotto campana',
    proc: "Stendere la frolla a 4 mm e foderare una tortiera da 24 cm, tenendo da parte i ritagli.\nBucherellare il fondo, distribuire la confettura e completare con la griglia di frolla.\nCuocere a 175 °C per 35 minuti. Tagliare in 10 fette a freddo."},
  tortamele: {nome: 'Torta di mele', sigla: 'TOM', cat: 'Dolci da forno', resa: 12, u: 'pz', pesoPz: 110, shelf: 4, tipo: 'preferibilmente', prezzo: 2.5,
    ing: [['farina', 300, 'g'], ['zucchero', 200, 'g'], ['uova', 4, 'pz'], ['burro', 120, 'g'], ['latte', 120, 'ml'], ['mele', 800, 'g'], ['lievito', 16, 'g']],
    cons: 'A temperatura ambiente, sotto campana',
    proc: "Montare uova e zucchero, unire il burro fuso tiepido e il latte.\nAggiungere farina e lievito setacciati, poi metà delle mele a cubetti.\nVersare nello stampo da 26 cm, coprire con le mele a fette e cuocere a 170 °C per 45 minuti. Tagliare in 12 fette a freddo."},
  tartellette: {nome: 'Tartellette crema e frutti di bosco', sigla: 'TAR', cat: 'Pasticceria fresca', resa: 18, u: 'pz', pesoPz: 75, shelf: 2, tipo: 'entro', prezzo: 1.8,
    ing: [['@frolla', 600, 'g'], ['@crema', 650, 'g'], ['frutti', 200, 'g']],
    cons: 'In frigorifero a 0–4 °C',
    proc: "Foderare gli stampini con la frolla stesa a 3 mm e cuocere in bianco a 175 °C per 15 minuti.\nA freddo farcire con la crema pasticcera usando la sac à poche.\nDecorare con i frutti di bosco scongelati in frigorifero e asciugati. Esporre in vetrina refrigerata."},
  tiramisu: {nome: 'Tiramisù in coppetta', sigla: 'TIR', cat: 'Pasticceria fresca', resa: 12, u: 'pz', pesoPz: 110, shelf: 3, tipo: 'entro', prezzo: 3.5,
    ing: [['mascarpone', 500, 'g'], ['uova', 4, 'pz'], ['zucchero', 120, 'g'], ['savoiardi', 300, 'g'], ['caffe', 60, 'g'], ['cacao', 15, 'g']],
    cons: 'In frigorifero a 0–4 °C',
    proc: "Preparare 8 espressi e lasciarli raffreddare.\nCuocere uova e zucchero a bagnomaria fino a 82 °C mescolando, poi montare fino a raffreddamento e unire il mascarpone.\nComporre le coppette alternando savoiardi bagnati nel caffè e crema.\nSpolverare di cacao, coprire ed etichettare. Riposo di 4 ore in frigorifero prima della vendita.",
    note: 'Uova pastorizzate a 82 °C con lo zucchero.'},
  tramezzini: {nome: 'Tramezzini tonno e pomodoro', sigla: 'TRA', cat: 'Salato', resa: 12, u: 'pz', pesoPz: 95, shelf: 1, tipo: 'entro', prezzo: 2.8,
    ing: [['pane', 600, 'g'], ['tonno', 300, 'g'], ['maionese', 150, 'g'], ['pomodori', 300, 'g']],
    cons: 'In frigorifero a 0–4 °C, nella vetrina refrigerata',
    proc: "Sgocciolare il tonno e mescolarlo con la maionese.\nLavare e affettare i pomodori, asciugarli bene.\nFarcire le fette di pane, rifilare i bordi e tagliare a triangolo. Avvolgere nella pellicola ed etichettare."},
  nocciole: {nome: 'Torta alle nocciole', sigla: 'TNO', cat: 'Dolci da forno', resa: 12, u: 'pz', pesoPz: 90, shelf: 5, tipo: 'preferibilmente', prezzo: 2.8, arch: true,
    ing: [['farina', 200, 'g'], ['zucchero', 200, 'g'], ['uova', 4, 'pz'], ['burro', 150, 'g'], ['nocciole', 200, 'g'], ['lievito', 16, 'g']],
    cons: 'A temperatura ambiente, sotto campana',
    proc: "Montare uova e zucchero, unire il burro fuso e le nocciole tritate finemente.\nAggiungere farina e lievito setacciati.\nCuocere a 170 °C per 40 minuti in stampo da 24 cm.",
    note: 'Tolta dal banco: con il rincaro delle nocciole il costo era diventato troppo alto. Da riprendere se i prezzi scendono.'}
};
/* produzioni: ricetta, ogni quanti giorni, quanti giorni prima di oggi (resto), quantità */
const ES_PIANO = [['biscotti', 7, 5, 60], ['cookies', 7, 2, 40], ['crostata', 3, 2, 10], ['tortamele', 4, 3, 12], ['tartellette', 2, 0, 18], ['tiramisu', 3, 0, 12], ['tramezzini', 2, 1, 12]];
/* vendite medie al giorno */
const ES_VENDITE = {biscotti: 7.5, cookies: 5, crostata: 3, tortamele: 3, tartellette: 8.5, tiramisu: 3.6, tramezzini: 5.5};
/* consumi al banco e vendite di rivendita al giorno, registrati la domenica */
const ES_USO = [
  ['caffe', 'uso', .85, 'Caffè al banco'], ['decaf', 'uso', .07, 'Caffè al banco'], ['latte', 'uso', 3.2, 'Cappuccini e latte macchiato'],
  ['panna', 'uso', .06, 'Caffè con panna'], ['arance', 'uso', 2.6, 'Spremute'], ['limoni', 'uso', .25, 'Tè e bibite al banco'],
  ['cornetti', 'vendita', 36, 'Cornetti sfornati e venduti'], ['acqua', 'vendita', 14, 'Vendite della settimana'], ['frizzante', 'vendita', 9, 'Vendite della settimana'],
  ['cola', 'vendita', 6, 'Vendite della settimana'], ['succo', 'vendita', 4, 'Vendite della settimana'], ['birra', 'vendita', 3, 'Vendite della settimana'],
  ['sacchetti', 'uso', 18, 'Asporto'], ['vaschette', 'uso', 7, 'Asporto pasticceria'], ['bicchieri', 'uso', 22, 'Caffè da asporto']
];

function buildSample(T = today()) {
  const N = ES_GIORNI, W = addDays(T, -(N - 1)), INV = addDays(W, -1), START = addDays(T, -ES_STORICO), UOVA_DA = addDays(T, -150), yday = addDays(T, -1);
  const h = (...p) => { const s = p.join('|'); let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } x ^= x >>> 15; x = Math.imul(x, 2246822507); x ^= x >>> 13; x = Math.imul(x, 3266489909); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
  const dow = iso => parseIso(iso).getUTCDay();
  const doy = iso => daysBetween(`${iso.slice(0, 4)}-01-01`, iso);
  const ts = (iso, hh, mm = 0) => { const [y, mo, d] = iso.split('-').map(Number); return new Date(y, mo - 1, d, hh, mm).getTime(); };
  const eom = iso => { const d = parseIso(iso); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10); };
  const fid = k => 'es-f-' + k, aid = k => 'es-a-' + k, rid = k => 'es-r-' + k;
  const A = {};
  for (const x of ES_ART) A[x[0]] = {k: x[0], nome: x[1], cat: x[2], unita: x[3], pesoPz: x[4], etichetta: x[5], allergeni: x[6], cons: x[7], min: x[8], forn: x[9], pack: x[10], shelf: x[11], prezzi: x[12], stag: x[13]};
  const price = (a, iso, f = a.forn) => {
    const ago = daysBetween(iso, T), kp = a.prezzi;
    let p = ago >= kp[0][0] ? kp[0][1] : kp[kp.length - 1][1];
    for (let i = 0; i < kp.length - 1; i++) { const [g0, p0] = kp[i], [g1, p1] = kp[i + 1]; if (ago <= g0 && ago >= g1) { p = p1 + (p0 - p1) * (ago - g1) / (g0 - g1); break; } }
    if (a.stag) p *= 1 + a.stag[0] * Math.cos(2 * Math.PI * (doy(iso) - a.stag[1]) / 365);
    p *= 1 + (h('p', a.k, iso) - .5) * .018;
    if (f !== a.forn) p *= f === 'cash' ? 1.04 : .95;
    const dec = p < 1 ? 3 : 2;
    return Math.round(p * 10 ** dec) / 10 ** dec;
  };
  const algOf = k => { const out = new Set(); for (const [ik] of ES_RIC[k].ing) (ik[0] === '@' ? [...algOf(ik.slice(1))] : A[ik].allergeni).forEach(x => out.add(x)); return out; };
  const trOf = k => { const out = new Set(ES_RIC[k].tracce || []); for (const [ik] of ES_RIC[k].ing) if (ik[0] === '@') trOf(ik.slice(1)).forEach(x => out.add(x)); return out; };
  const lotF = (f, iso, k, id) => {
    const n = 1000 + Math.floor(h('l', id, k) * 9000), yy = iso.slice(2, 4), mm = iso.slice(5, 7), dd = iso.slice(8, 10);
    return {molino: `MB${yy}${mm}-${n % 90 + 10}`, latteria: `LV-${n}`, dolciaria: `DS${n}${n % 7}`, torrefazione: `TA${yy}${mm}${dd}`, ortofrutta: `OS-${dd}${mm}`,
      bevande: `L${yy.slice(1)}${String(doy(iso)).padStart(3, '0')}`, cascina: `CR${dd}${mm}`, cash: `CC${n}`}[f] || '';
  };

  /* la simulazione gira due volte: a secco per misurare i consumi giornalieri, poi davvero con acquisti, lotti e movimenti */
  function sim(dry, cons) {
    const lots = new Map(), all = [], docs = {}, prods = {}, movs = {}, pend = new Map(), nProd = {}, nOrd = {};
    let nDoc = 0, nMov = 0;
    const lotsOf = (kind, k) => { const key = kind + ':' + k; let a = lots.get(key); if (!a) lots.set(key, a = []); return a; };
    const ok = (l, iso) => l.res > EPS && l.data <= iso && (!l.scad || l.scad >= iso);
    const avail = (kind, k, iso) => r6(lotsOf(kind, k).filter(l => ok(l, iso)).reduce((s, l) => s + l.res, 0));
    const fefo = (a, b) => (a.scad || '9999').localeCompare(b.scad || '9999') || a.data.localeCompare(b.data);
    const take = (kind, k, q, iso) => {
      const out = []; let rem = r6(q);
      for (const l of lotsOf(kind, k).filter(x => ok(x, iso)).sort(fefo)) {
        if (rem <= EPS) break;
        const x = r6(Math.min(l.res, rem)); l.res = r6(l.res - x); rem = r6(rem - x); out.push([l, x]);
      }
      return out;
    };
    const newDoc = (f, iso, tipo, x = {}) => {
      const id = 'es-d-' + String(++nDoc).padStart(3, '0');
      return (docs[id] = {id, tipo, numero: '', data: iso, fornitoreId: f ? fid(f) : '', fatturaRif: '', soloPrezzi: !!x.storico, note: x.note || '', allegati: [], righe: [], creato: ts(iso, x.urg ? 11 : tipo === 'inventario' ? 18 : 8) + nDoc * 1000, _f: f, _urg: !!x.urg});
    };
    const addRiga = (d, k, q, p, scad) => {
      const a = A[k], id = 'r' + (d.righe.length + 1), q6 = r6(q);
      let sc = '', lotto = '';
      if (!d.soloPrezzi) {
        sc = scad ?? (a.shelf ? addDays(d.data, Math.max(2, Math.round(a.shelf * (.85 + .3 * h('s', d.id, k))))) : '');
        lotto = lotF(d._f || a.forn, d._f ? d.data : addDays(d.data, -6), k, d.id);
      }
      d.righe.push({id, articoloId: aid(k), qta: q6, importo: Math.round(q6 * p * 100) / 100, lotto, scadenza: sc});
      if (!d.soloPrezzi) { const l = {kind: 'acq', key: `${d.id}:${id}`, item: k, qta: q6, res: q6, scad: sc, data: d.data}; lotsOf('art', k).push(l); all.push(l); }
    };
    const avg = k => { const c = cons[k] || []; let s = 0; for (let j = 0; j < N - 1; j++) s += c[j] || 0; return s / (N - 1); };
    const nextDel = (f, day) => { for (let j = day + 1; j < day + 9; j++) if (ES_FORN[f].gg.includes(dow(addDays(W, j)))) return j; return day + 7; };
    const safety = a => (a.shelf && a.shelf <= 14 ? 1 : 3);
    /* quanto ordinare per arrivare alla consegna successiva, con un margine, senza scendere sotto la scorta minima */
    const order = (a, day) => {
      const until = nextDel(a.forn, day) - 1 + safety(a);
      let need = 0; for (let j = day; j <= until; j++) need += j < N - 1 ? (cons[a.k]?.[j] || 0) : Math.max(cons[a.k]?.[j] || 0, avg(a.k));
      const by = addDays(W, Math.min(until, day + 2));
      const stock = lotsOf('art', a.k).filter(l => l.res > EPS && (!l.scad || l.scad >= by)).reduce((s, l) => s + l.res, 0);
      const miss = r6(need + a.min - stock);
      return miss > EPS ? r6(Math.ceil(r6(miss / a.pack) - 1e-9) * a.pack) : 0;
    };
    const useArt = (k, q, iso, day) => {
      if (dry) { const c = cons[k] || (cons[k] = []); c[day] = r6((c[day] || 0) + q); return [[null, r6(q)]]; }
      const have = avail('art', k, iso);
      if (have < q - EPS) {   // manca qualcosa: spesa urgente al Cash & Carry
        const d = Object.values(docs).find(x => x._urg && x.data === iso) || newDoc('cash', iso, 'scontrino', {urg: true, note: 'Spesa urgente: merce finita prima della consegna.'});
        const a = A[k]; addRiga(d, k, Math.ceil(r6((q - have) / a.pack) - 1e-9) * a.pack, price(a, iso, 'cash'));
      }
      return take('art', k, q, iso);
    };
    const addMov = (iso, tipo, l, delta, nota, hh = 19, mm = 30) => {
      if (dry) return;
      const id = 'es-m-' + String(++nMov).padStart(3, '0');
      movs[id] = {data: iso, tipo, lotKind: l.kind, lotId: l.key, delta: r6(delta), nota, creato: ts(iso, hh, mm) + nMov * 1000};
    };
    const addPend = (l, tipo, nota, q, iso) => {
      if (dry || !l) return;
      let m = pend.get(l); if (!m) pend.set(l, m = new Map());
      const key = tipo + '|' + nota, b = m.get(key) || {tipo, nota, q: 0, last: iso};
      b.q = r6(b.q + q); b.last = iso; m.set(key, b);
    };
    const flush = (l, notaFine) => {
      const m = pend.get(l); if (!m) return;
      for (const b of m.values()) if (b.q > EPS) addMov(b.last, b.tipo, l, -b.q, notaFine && b.tipo === 'vendita' ? notaFine : b.nota);
      pend.delete(l);
    };
    const opOf = (rk, iso) => { const c = ES_RIC[rk].cat, o = c === 'Pasticceria fresca' ? 'Marco' : c === 'Salato' ? 'Sara' : 'Giulia'; return o === 'Giulia' && dow(iso) === 1 ? 'Marco' : o; };
    const produce = (rk, qty, iso, day) => {
      const r = ES_RIC[rk], f = qty / r.resa;
      for (const [ik, q, u] of r.ing) if (ik[0] === '@') {   // i semilavorati si preparano quando mancano
        const sk = ik.slice(1), s = ES_RIC[sk], need = r6(conv(q, u, s.u, 0) * f), have = avail('ric', sk, iso);
        if (have < need - EPS) produce(sk, r6(s.resa * Math.ceil(r6((need - have) / s.resa) - 1e-9)), iso, day);
      }
      const consumi = [];
      for (const [ik, q, u] of r.ing) {
        const isR = ik[0] === '@', k = isR ? ik.slice(1) : ik, need = r6(conv(q, u, isR ? ES_RIC[k].u : A[k].unita, isR ? 0 : A[k].pesoPz) * f);
        for (const [l, x] of (isR ? take('ric', k, need, iso) : useArt(k, need, iso, day))) consumi.push({tipo: isR ? 'ric' : 'art', refId: isR ? rid(k) : aid(k), nome: isR ? ES_RIC[k].nome : A[k].nome, lotId: l ? l.key : null, qta: x});
      }
      const code = `${r.sigla}-${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(2, 4)}`, n = nProd[code] = (nProd[code] || 0) + 1, lotto = `${code}-${n}`, id = 'es-p-' + lotto, scad = addDays(iso, r.shelf);
      nOrd[iso] = (nOrd[iso] || 0) + 1;
      prods[id] = {lotto, ricettaId: rid(rk), ricettaNome: r.nome, data: iso, qta: r6(qty), unita: r.u, scadenza: scad, tipoScadenza: r.tipo, operatore: opOf(rk, iso), note: '', consumi, allergeni: algSort([...algOf(rk)]), tracce: algSort([...trOf(rk)]), creato: ts(iso, 6, 10) + nOrd[iso] * 9 * 6e4};
      const l = {kind: 'prod', key: id, item: rk, qta: r6(qty), res: r6(qty), scad, data: iso};
      lotsOf('ric', rk).push(l); all.push(l);
    };

    if (!dry) {
      /* storico dei prezzi: fatture dei mesi prima di cominciare a usare l'app, solo per l'andamento dei prezzi */
      for (const [f, F] of Object.entries(ES_FORN)) {
        const dates = [];
        if (f === 'latteria') for (let d = eom(addDays(INV, -31)); d >= START; d = eom(addDays(d.slice(0, 8) + '01', -1))) dates.push(d);
        else for (let d = addDays(INV, -(4 + Math.floor(h('st', f) * Math.min(F.storico, 20)))); d >= START; d = addDays(d, -F.storico)) dates.push(d);
        for (const [i, d] of dates.reverse().entries()) {
          if (f === 'cascina' && d < UOVA_DA) continue;
          const arts = Object.values(A).filter(a => (a.forn === f && (a.k !== 'uova' || d >= UOVA_DA)) || (f === 'dolciaria' && a.k === 'uova' && d < UOVA_DA));
          const extra = f === 'cash' ? [i % 2 ? 'burro' : null, i === 2 ? 'cioccolato' : null].filter(Boolean) : [];
          const days = f === 'latteria' ? 30 : F.storico;
          const doc = newDoc(f, d, f === 'cash' ? 'scontrino' : 'fattura', {storico: true});
          for (const a of [...arts, ...extra.map(k => A[k])]) {
            const base = extra.includes(a.k) ? (a.k === 'burro' ? 4 : 2) : Math.max(avg(a.k) * days, a.pack);
            addRiga(doc, a.k, Math.ceil(r6(base / a.pack) - 1e-9) * a.pack, price(a, d, f));
          }
        }
      }
      /* il giorno prima di cominciare: inventario della merce già in casa */
      const inv = newDoc('', INV, 'inventario', {note: 'Merce già in magazzino il primo giorno con Barista Flow.'});
      for (const a of Object.values(A)) {
        let q = ES_FISSO[a.k];
        if (q == null) {
          let first = 0; while (first < 7 && !ES_FORN[a.forn].gg.includes(dow(addDays(W, first)))) first++;
          let need = a.min; for (let j = 0; j < first + safety(a); j++) need += cons[a.k]?.[j] || 0;
          const step = a.unita === 'pz' ? Math.max(1, Math.round(a.pack / 4)) : a.pack >= 10 ? a.pack / 5 : a.pack;
          q = need > EPS ? r6(Math.ceil(r6(need / step) - 1e-9) * step) : 0;
        }
        if (q > EPS) addRiga(inv, a.k, q, price(a, INV), a.shelf ? addDays(INV, Math.max(3, Math.round(a.shelf * (.4 + .3 * h('i', a.k))))) : '');
      }
    }

    for (let day = 0; day < N; day++) {
      const iso = addDays(W, day), oggi = day === N - 1, j = N - 1 - day, we = [0, 6].includes(dow(iso));
      // la mattina si smaltisce quello che è scaduto: quello scaduto ieri resta da fare oggi
      if (!oggi) for (const l of all) if (l.res > EPS && l.scad && l.scad < iso) { flush(l); addMov(iso, 'scarto', l, -l.res, 'Smaltito perché scaduto', 7, 40); l.res = 0; }
      // consegne dei fornitori
      if (!dry) for (const [f, F] of Object.entries(ES_FORN)) {
        if (!F.gg.includes(dow(iso))) continue;
        const lines = Object.values(A).filter(a => a.forn === f && ES_FISSO[a.k] == null).map(a => [a, order(a, day)]).filter(x => x[1] > 0);
        if (!lines.length) continue;
        const d = newDoc(f, iso, F.tipo);
        for (const [a, q] of lines) addRiga(d, a.k, q, price(a, iso, f));
      }
      // produzioni del giorno
      for (const [rk, every, phase, qty] of ES_PIANO) if (j % every === phase) produce(rk, qty, iso, day);
      if (oggi) break;   // le vendite e i consumi di oggi non sono ancora registrati
      // vendite al banco dei prodotti, prima i lotti che scadono prima; dei lotti scaduti ieri restano due pezzi da smaltire oggi
      for (const [rk, mean] of Object.entries(ES_VENDITE)) {
        let q = Math.round(mean * (rk === 'tramezzini' ? (we ? .6 : 1.15) : (we ? 1.3 : .9)) * (.7 + .6 * h('v', rk, iso)));
        for (const l of lotsOf('ric', rk).filter(x => ok(x, iso)).sort(fefo)) {
          const x = Math.min(q, l.scad === yday ? Math.max(0, r6(l.res - 2)) : l.res);
          if (q <= 0) break; if (x <= EPS) continue;
          l.res = r6(l.res - x); q = r6(q - x);
          addPend(l, 'vendita', 'Vendite al banco', x, iso);
          if (l.res <= EPS) flush(l, 'Lotto esaurito');
        }
      }
      for (const l of lotsOf('ric', 'biscotti')) if (l.data === addDays(iso, -1) && l.res >= 4) { l.res = r6(l.res - 4); addPend(l, 'uso', 'Offerti con il caffè', 4, iso); }
      // consumi al banco e rivendita
      for (const [k, tipo, rate, nota] of ES_USO) {
        const a = A[k]; let q = rate * (.8 + .4 * h('u', k, iso)) * (we ? 1.15 : 1);
        q = a.unita === 'pz' ? Math.round(q) : Math.round(q * 100) / 100;
        if (q > 0) for (const [l, x] of useArt(k, q, iso, day)) addPend(l, tipo, nota, x, iso);
      }
      // la domenica: conta di inventario, poi si registrano consumi e vendite della settimana
      if (dow(iso) === 0) {
        if (j >= 7 && j < 14) {
          if (dry) { const c = cons.farina || (cons.farina = []); c[day] = r6((c[day] || 0) + .35); }
          else { const l = lotsOf('art', 'farina').filter(x => ok(x, iso)).sort(fefo)[0]; if (l && l.res > .5) { addMov(iso, 'rettifica', l, -.35, 'Conta di inventario: sacco aperto più leggero', 20, 10); l.res = r6(l.res - .35); } }
        }
        if (j < 7 && !dry) { const l = lotsOf('art', 'cornetti').filter(x => ok(x, iso)).sort(fefo)[0]; if (l) { addMov(iso, 'rettifica', l, 6, 'Conta del congelatore: 6 pezzi in più', 20, 15); l.res = r6(l.res + 6); } }
        for (const l of all) if (l.kind === 'acq') flush(l);
      }
    }
    for (const l of all) flush(l);
    return {docs, prods, movs};
  }

  const cons = {};
  sim(true, cons);
  const {docs, prods, movs} = sim(false, cons);
  const docList = Object.values(docs).sort((a, b) => a.data.localeCompare(b.data) || a.creato - b.creato);

  /* l'ultimo DDT della latteria è arrivato senza prezzi: si completano con la fattura */
  const lastLat = docList.filter(d => d._f === 'latteria' && !d.soloPrezzi).pop();
  if (lastLat) { lastLat.righe.forEach(r => { r.importo = null; }); lastLat.note = 'Prezzi in fattura a fine mese.'; }
  /* tre rincari all'ultimo acquisto; per gli altri articoli nessuno sopra la soglia */
  const priced = k => docList.filter(d => d.tipo !== 'inventario').flatMap(d => d.righe.filter(r => r.articoloId === aid(k) && r.importo != null));
  const unit = r => r.importo / r.qta, setP = (r, p) => { r.importo = Math.round(r.qta * p * 100) / 100; };
  const RINC = {burro: .058, caffe: .068, cola: .062};
  for (const k of Object.keys(A)) {
    const s = priced(k); if (s.length < 2) continue;
    const pv = unit(s[s.length - 2]), last = s[s.length - 1];
    if (RINC[k]) setP(last, pv * (1 + RINC[k]));
    else if (unit(last) > pv * 1.04) setP(last, pv * 1.015);
  }
  /* numeri dei documenti: progressivi nell'anno; i DDT della latteria rimandano alla fattura di fine mese */
  const seq = {};
  const numOf = (f, tipo, iso, id) => { const key = `${f}|${tipo}|${iso.slice(0, 4)}`, n = Math.max(Math.floor(doy(iso) * ES_FORN[f].ritmo * (tipo === 'ddt' ? 2.5 : 1)) + 1 + Math.floor(h('n', id) * 3), (seq[key] || 0) + 1); seq[key] = n; return String(n); };
  for (const d of docList) {
    if (d.tipo === 'inventario') continue;
    d.numero = d.tipo === 'scontrino' ? String(100 + Math.floor(h('sc', d.id) * 8800)).padStart(4, '0') : numOf(d._f, d.tipo, d.data, d.id);
    if (d.tipo === 'ddt' && d.data.slice(0, 7) < T.slice(0, 7)) { const e = eom(d.data); d.fatturaRif = `n. ${Math.floor(doy(e) * ES_FORN.latteria.ritmo) + 1} del ${fmtD(e)}`; }
  }

  const E = {esempio: true}, out = {fornitori: {}, articoli: {}, ricette: {}, documenti: {}, produzioni: {}, movimenti: {}};
  let c0 = ts(START, 9);
  for (const [k, F] of Object.entries(ES_FORN)) out.fornitori[fid(k)] = {nome: F.nome, piva: '', telefono: '', email: F.email, note: F.note, creato: c0 += 6e4, ...E};
  for (const a of Object.values(A)) out.articoli[aid(a.k)] = {nome: a.nome, categoria: a.cat, unita: a.unita, pesoPz: a.pesoPz || null, etichetta: a.etichetta, allergeni: algSort(a.allergeni), conservazione: a.cons, scortaMin: a.min, fornitoreId: fid(a.forn), note: ES_NOTE_ART[a.k] || '', archiviato: false, creato: c0 += 6e4, ...E};
  for (const [k, r] of Object.entries(ES_RIC)) out.ricette[rid(k)] = {nome: r.nome, sigla: r.sigla, categoria: r.cat, semilavorato: !!r.semi, resaQta: r.resa, resaUnita: r.u, pesoPz: r.pesoPz || null,
    ingredienti: r.ing.map(([ik, q, u]) => ik[0] === '@' ? {tipo: 'ric', refId: rid(ik.slice(1)), qta: q, unita: u} : {tipo: 'art', refId: aid(ik), qta: q, unita: u}),
    shelfLife: r.shelf, tipoScadenza: r.tipo, conservazione: r.cons, procedimento: r.proc, tracce: algSort(r.tracce || []), prezzoVendita: r.prezzo || null, note: r.note || '', archiviato: !!r.arch, creato: c0 += 6e4, ...E};
  for (const d of docList) { const {id, _f, _urg, ...v} = d; out.documenti[id] = {...v, ...E}; }
  for (const [id, p] of Object.entries(prods)) out.produzioni[id] = {...p, ...E};
  for (const [id, m] of Object.entries(movs)) out.movimenti[id] = {...m, ...E};
  return out;
}

/* ---------- prova con i dati di esempio e registrazione del bar ---------- */
const ownCount = () => COLS.reduce((s, c) => c === 'impostazioni' ? s : s + [...S.data[c].values()].filter(v => !v.esempio).length, 0);
const registered = () => { const g = S.data.impostazioni.get('generale') || {}; return !!g.registrato || (!!String(g.nome || '').trim() && !countSample()); };
const allLoaded = () => S.mode !== 'loading' && S.fresh.size >= COLS.length;   // finché l'archivio non è arrivato tutto non si sa se è vuoto
const showWelcome = () => allLoaded() && !S.ro && !registered() && !countSample() && !ownCount();
const sampleOps = () => COLS.flatMap(c => [...S.data[c].values()].filter(v => v.esempio).map(v => [c, v.id, null]));

/* scrive o cancella tanti elementi insieme: nel browser in un colpo solo, su claude.ai a gruppi con qualche nuovo tentativo */
async function writeMany(ops, onStep) {
  for (const [c, id, v] of ops) { if (v) S.data[c].set(id, {...clone(v), id}); else S.data[c].delete(id); }
  bump();
  if (S.db.bulk) { await S.db.bulk(ops.map(([c, id, v]) => [c, id, v ? strip(v) : null])); onStep?.(ops.length); return ops.length; }
  let done = 0, ok = 0;
  await pool(ops, 6, async ([c, id, v]) => {
    for (let t = 0; t < 4; t++) {
      try { const ref = S.db.collection(c).doc(id); if (v) await ref.set(strip(v)); else await ref.delete(); ok++; break; }
      catch (e) { if (t === 3 || ['invalid_argument', 'quota_exceeded', 'revoked'].includes(e?.code)) break; await sleep(400 * (t + 1) + Math.random() * 400); }
    }
    onStep?.(++done);
  });
  return ok;
}
async function runOps(title, ops) {
  if (!ops.length) return 0;
  if (S.db.bulk) return writeMany(ops);
  const o = {title, small: true, n: 0, body: () => `<p>${esc(title)}: ${o.n} di ${ops.length}.</p><div class="prog" role="progressbar" aria-label="${esc(title)}" aria-valuemin="0" aria-valuemax="${ops.length}" aria-valuenow="${o.n}"><span style="width:${Math.round(o.n / ops.length * 100)}%"></span></div><p class="hint">Ci vuole qualche secondo: non chiudere la pagina finché non ha finito.</p>`};
  openSheet(o);
  let t = 0;
  const ok = await writeMany(ops, n => { o.n = n; const now = Date.now(); if ((now - t > 150 || n === ops.length) && stack.includes(o)) { t = now; paintSheet(o); } });
  if (top() === o) closeSheet();
  return ok;
}
const goOggi = () => { if (route() !== 'oggi') location.hash = 'oggi'; window.scrollTo(0, 0); };

async function loadSample(replace) {
  if (!guard()) return;
  if (!allLoaded()) { toast('I dati non sono ancora arrivati tutti: riprova tra qualche secondo.', true); return; }
  if (ownCount()) { toast('Nell’archivio ci sono già dati tuoi: gli esempi si caricano solo in un archivio vuoto.', true); return; }
  const data = buildSample(today()), ops = [];
  for (const [c, docs] of Object.entries(data)) for (const [id, v] of Object.entries(docs)) ops.push([c, id, v]);
  if (replace) for (const c of COLS) for (const v of S.data[c].values()) if (v.esempio && !data[c]?.[v.id]) ops.push([c, v.id, null]);
  const ok = await runOps(replace ? 'Aggiorno i dati di esempio' : 'Carico i dati di esempio', ops);
  if (ok < ops.length) { toast(`Caricati ${ok} elementi su ${ops.length}: riprova da Impostazioni.`, true); return; }
  goOggi();
  toast(replace ? 'Esempi riportati alla data di oggi' : 'Ecco il bar di esempio: prova tutto liberamente');
}
async function resetSample() {
  if (!(await ask('Rimetto i dati di esempio come all’inizio, con le date di oggi. Quello che hai inserito durante la prova si perde.', 'Riporta a oggi'))) return;
  while (stack.length) closeSheet();
  await loadSample(true);
}
async function clearSample() {
  const items = sampleOps(); if (!items.length) return;
  if (!(await ask(`Cancello i dati di esempio e quello che hai inserito durante la prova (${items.length} elementi)?`, 'Cancella gli esempi', true))) return;
  while (stack.length) closeSheet();
  const ok = await runOps('Cancello i dati di prova', items);
  toast(ok === items.length ? 'Dati di esempio cancellati' : `Cancellati ${ok} elementi su ${items.length}: riprova per gli altri.`, ok < items.length);
  await postaRiparti();
}
function formRegistra() {
  const c = cfg(), st = {nome: c.nome, indirizzo: c.indirizzo, piva: c.piva};
  openSheet({form: true, st, title: 'Registra il tuo bar',
    body: () => { const n = countSample(); return `<p class="muted">Il nome compare in alto nell'app. Nome, indirizzo e partita IVA vanno anche sulle schede tecniche e sui documenti dei lotti che scarichi o stampi.</p>
      <label class="fld"><span>Nome del bar</span><input type="text" data-k="nome" value="${esc(st.nome)}" placeholder="Es. Bar Centrale" autocomplete="organization"></label>
      <label class="fld"><span>Indirizzo (facoltativo)</span><input type="text" data-k="indirizzo" value="${esc(st.indirizzo)}" placeholder="Es. Via Roma 1, Cittanova" autocomplete="street-address"></label>
      <label class="fld"><span>Partita IVA (facoltativa)</span><input type="text" data-k="piva" value="${esc(st.piva)}" inputmode="numeric" autocomplete="off"></label>
      ${n ? `<p class="note warn">${IC.alert}<span>Registrando il bar cancello i dati di esempio e tutto quello che hai inserito durante la prova (${n} elementi): si parte da zero con i tuoi dati.</span></p>` : ''}
      <p class="err" id="ferr" role="alert"></p>`; },
    foot: () => foot('Registra e inizia'),
    onSave: async o => {
      const nome = st.nome.trim().slice(0, 80);
      if (!nome) return ferr(o, 'Scrivi il nome del bar.');
      const prev = S.data.impostazioni.get('generale');
      if (!(await put('impostazioni', 'generale', {...(prev ? strip(prev) : {}), nome, indirizzo: st.indirizzo.trim().slice(0, 140), piva: st.piva.trim().slice(0, 20), registrato: Date.now()}))) return;
      o.dirty = false; closeSheet();
      const items = sampleOps();
      if (items.length) { const ok = await runOps('Cancello i dati di prova', items); if (ok < items.length) { toast(`${items.length - ok} dati di prova non sono stati cancellati: riprova da Impostazioni.`, true); return; } await postaRiparti(); }
      goOggi();
      toast(`Benvenuto, ${nome}! Si comincia dai primi passi.`);
    }});
}
function sheetProva() {
  const o = {title: 'Dati di esempio', small: true,
    body: () => `<p>Stai provando Barista Flow con un bar di esempio: fornitori, schede tecniche, quattro settimane di acquisti, produzioni e vendite, e diciotto mesi di prezzi d'acquisto.</p><p>Puoi produrre, scaricare, registrare acquisti e modificare tutto liberamente. ${registered() ? 'Quando vuoi, cancelli gli esempi e resti con i tuoi dati.' : 'Quando registri il tuo bar, gli esempi e quello che hai inserito durante la prova vengono cancellati.'}</p>`,
    foot: () => S.ro ? '' : `<button type="button" class="btn" data-act="reset-sample">Riporta a oggi</button><button type="button" class="btn ${registered() ? 'dan' : 'pri'}" data-act="register">${registered() ? 'Cancella gli esempi' : 'Registra il tuo bar'}</button>`};
  openSheet(o);
}
