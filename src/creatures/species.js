// Ported verbatim from v1 (src/creatures/species.js). The v1 'model' params are only a starting hint:
// v2 models are redesigned Sun/Moon style by the creatures builder (docs/GDD.md "Velmon").
// Types, moves and the Velmon species. All names and creatures are original.

export const TYPES = ['Normale', 'Fuoco', 'Acqua', 'Erba', 'Elettro', 'Ghiaccio', 'Roccia', 'Terra', 'Volante', 'Coleottero', 'Spettro'];

export const TYPE_COLORS = {
  Normale: '#a8a77a', Fuoco: '#ee8130', Acqua: '#6390f0', Erba: '#7ac74c', Elettro: '#f7d02c', Ghiaccio: '#96d9d6',
  Roccia: '#b6a136', Terra: '#e2bf65', Volante: '#a98ff3', Coleottero: '#a6b91a', Spettro: '#735797',
};

// attacker -> { defender: multiplier }
export const CHART = {
  Normale: { Roccia: 0.5, Spettro: 0 },
  Fuoco: { Erba: 2, Ghiaccio: 2, Coleottero: 2, Acqua: 0.5, Roccia: 0.5, Fuoco: 0.5 },
  Acqua: { Fuoco: 2, Roccia: 2, Terra: 2, Erba: 0.5, Acqua: 0.5 },
  Erba: { Acqua: 2, Roccia: 2, Terra: 2, Fuoco: 0.5, Erba: 0.5, Volante: 0.5, Coleottero: 0.5 },
  Elettro: { Acqua: 2, Volante: 2, Erba: 0.5, Elettro: 0.5, Terra: 0 },
  Ghiaccio: { Erba: 2, Terra: 2, Volante: 2, Fuoco: 0.5, Acqua: 0.5, Ghiaccio: 0.5 },
  Roccia: { Fuoco: 2, Ghiaccio: 2, Volante: 2, Coleottero: 2, Terra: 0.5 },
  Terra: { Fuoco: 2, Elettro: 2, Roccia: 2, Erba: 0.5, Coleottero: 0.5, Volante: 0 },
  Volante: { Erba: 2, Coleottero: 2, Elettro: 0.5, Roccia: 0.5 },
  Coleottero: { Erba: 2, Fuoco: 0.5, Volante: 0.5, Spettro: 0.5 },
  Spettro: { Spettro: 2, Normale: 0 },
};

export function effectiveness(moveType, defTypes) {
  if (!Array.isArray(defTypes)) defTypes = defTypes ? [defTypes] : [];
  return defTypes.reduce((m, t) => m * (CHART[moveType]?.[t] ?? 1), 1);
}

export const MOVES = {
  azione: { name: 'Azione', type: 'Normale', power: 40, acc: 100 },
  graffio: { name: 'Graffio', type: 'Normale', power: 40, acc: 100 },
  carica: { name: 'Carica Furiosa', type: 'Normale', power: 70, acc: 90 },
  braciere: { name: 'Braciere', type: 'Fuoco', power: 40, acc: 100 },
  vampata: { name: 'Vampata', type: 'Fuoco', power: 75, acc: 90 },
  pistolacqua: { name: 'Pistolacqua', type: 'Acqua', power: 40, acc: 100 },
  ondata: { name: 'Ondata', type: 'Acqua', power: 75, acc: 90 },
  fogliame: { name: 'Fogliame', type: 'Erba', power: 40, acc: 100 },
  frustaliana: { name: 'Frustaliana', type: 'Erba', power: 70, acc: 95 },
  scintilla: { name: 'Scintilla', type: 'Elettro', power: 40, acc: 100 },
  saetta: { name: 'Saetta', type: 'Elettro', power: 80, acc: 85 },
  nevischio: { name: 'Nevischio', type: 'Ghiaccio', power: 40, acc: 100 },
  gelata: { name: 'Gelata', type: 'Ghiaccio', power: 75, acc: 90 },
  sassata: { name: 'Sassata', type: 'Roccia', power: 45, acc: 95 },
  frana: { name: 'Frana', type: 'Roccia', power: 75, acc: 90 },
  fango: { name: 'Colpo di Fango', type: 'Terra', power: 40, acc: 100 },
  sisma: { name: 'Sisma', type: 'Terra', power: 85, acc: 90 },
  beccata: { name: 'Beccata', type: 'Volante', power: 35, acc: 100 },
  raffica: { name: 'Raffica', type: 'Volante', power: 65, acc: 95 },
  puntura: { name: 'Puntura', type: 'Coleottero', power: 35, acc: 100 },
  ronzio: { name: 'Ronzio', type: 'Coleottero', power: 65, acc: 95 },
  leccata: { name: 'Leccata', type: 'Spettro', power: 30, acc: 100 },
  ombrartiglio: { name: 'Ombrartiglio', type: 'Spettro', power: 70, acc: 95 },
  // stronger moves learned by evolved Velmon
  iperbotta: { name: 'Iperbotta', type: 'Normale', power: 95, acc: 85 },
  fiammata: { name: 'Fiammata', type: 'Fuoco', power: 95, acc: 85 },
  idrocannone: { name: 'Idrocannone', type: 'Acqua', power: 95, acc: 85 },
  tempestaverde: { name: 'Tempesta Verde', type: 'Erba', power: 95, acc: 85 },
  tuono: { name: 'Tuono', type: 'Elettro', power: 95, acc: 80 },
  bufera: { name: 'Bufera', type: 'Ghiaccio', power: 95, acc: 85 },
  pioggiamassi: { name: 'Pioggia di Massi', type: 'Roccia', power: 95, acc: 85 },
  uragano: { name: 'Uragano', type: 'Volante', power: 90, acc: 85 },
  sciame: { name: 'Sciame', type: 'Coleottero', power: 85, acc: 90 },
  incubo: { name: 'Incubo', type: 'Spettro', power: 90, acc: 90 },
};

// model: parameters for the procedural 3D model (see model.js)
export const SPECIES = {
  germoglio: {
    name: 'Germoglio', types: ['Erba'], base: { hp: 45, atk: 49, def: 49, spd: 45 }, rate: 45, xp: 64, evo: { to: 'arbusto', level: 16 },
    learn: [[1, 'azione'], [1, 'fogliame'], [9, 'graffio'], [16, 'frustaliana'], [24, 'carica']],
    model: { body: 0x7ccf7a, belly: 0xd8f5c4, shape: 'quad', size: 0.75, ears: 'leaf', tail: 'leaf', extra: 'sprout', eye: 0x1b3d1b },
    desc: 'Sulla schiena porta un germoglio che cresce con lui.',
  },
  tizzone: {
    name: 'Tizzone', types: ['Fuoco'], base: { hp: 39, atk: 52, def: 43, spd: 65 }, rate: 45, xp: 64, evo: { to: 'brace', level: 16 },
    learn: [[1, 'graffio'], [1, 'braciere'], [9, 'azione'], [16, 'vampata'], [24, 'carica']],
    model: { body: 0xf08a3c, belly: 0xffe0a3, shape: 'biped', size: 0.75, ears: 'pointy', tail: 'flame', eye: 0x2b1406 },
    desc: 'La fiamma sulla coda dice come si sente.',
  },
  ondina: {
    name: 'Ondina', types: ['Acqua'], base: { hp: 44, atk: 48, def: 65, spd: 43 }, rate: 45, xp: 64, evo: { to: 'marea', level: 16 },
    learn: [[1, 'azione'], [1, 'pistolacqua'], [9, 'graffio'], [16, 'ondata'], [24, 'carica']],
    model: { body: 0x5aa9e6, belly: 0xe5f4ff, shape: 'biped', size: 0.72, ears: 'fin', tail: 'fin', extra: 'shell', eye: 0x0d2235 },
    desc: 'Nuota più veloce di qualsiasi pesce della baia.',
  },
  pulcino: {
    name: 'Pulcino', types: ['Normale', 'Volante'], base: { hp: 40, atk: 45, def: 40, spd: 56 }, rate: 230, xp: 50, evo: { to: 'pennuto', level: 18 },
    learn: [[1, 'azione'], [5, 'beccata'], [15, 'raffica'], [25, 'carica']],
    model: { body: 0xc89a5b, belly: 0xf3dfb8, shape: 'bird', size: 0.5, wings: true, tail: 'feather', beak: 0xf2b134, eye: 0x1d1d1d },
    desc: 'Si alza in volo al primo rumore.',
  },
  topolux: {
    name: 'Topolux', types: ['Normale'], base: { hp: 30, atk: 56, def: 35, spd: 72 }, rate: 255, xp: 51, evo: { to: 'ratolux', level: 20 },
    learn: [[1, 'azione'], [4, 'graffio'], [14, 'carica']],
    model: { body: 0xa58bc2, belly: 0xefe6f7, shape: 'quad', size: 0.45, ears: 'round', tail: 'thin', eye: 0x1d1d1d },
    desc: 'Rosicchia qualunque cosa, anche le pietre.',
  },
  lanuvo: {
    name: 'Lanuvo', types: ['Normale'], base: { hp: 60, atk: 40, def: 55, spd: 35 }, rate: 200, xp: 60, evo: { to: 'nembolana', level: 24 },
    learn: [[1, 'azione'], [10, 'carica']],
    model: { body: 0xf5f1e6, belly: 0xf5f1e6, shape: 'fluffy', size: 0.7, ears: 'round', horns: 0x8a6d4b, eye: 0x222222 },
    desc: 'Il suo vello è morbido come una nuvola.',
  },
  grillo: {
    name: 'Grillino', types: ['Coleottero'], base: { hp: 40, atk: 50, def: 45, spd: 60 }, rate: 255, xp: 52, evo: { to: 'cicalone', level: 18 },
    learn: [[1, 'puntura'], [8, 'azione'], [16, 'ronzio']],
    model: { body: 0x8bbf3a, belly: 0xd9ec9c, shape: 'bug', size: 0.45, wings: true, antennae: true, eye: 0x111111 },
    desc: 'Canta tutta la notte nell\'erba alta.',
  },
  fogliolo: {
    name: 'Fogliolo', types: ['Erba'], base: { hp: 50, atk: 45, def: 55, spd: 40 }, rate: 190, xp: 60, evo: { to: 'cespuglione', level: 22 },
    learn: [[1, 'azione'], [6, 'fogliame'], [18, 'frustaliana']],
    model: { body: 0x4f9a46, belly: 0xb5e08a, shape: 'blob', size: 0.6, extra: 'leafhat', eye: 0x10240e },
    desc: 'Di giorno sembra un cespuglio qualunque.',
  },
  scoiattolo: {
    name: 'Scoiattolo', types: ['Normale'], base: { hp: 45, atk: 55, def: 40, spd: 75 }, rate: 190, xp: 58, evo: { to: 'ghiandaro', level: 22 },
    learn: [[1, 'graffio'], [10, 'azione'], [20, 'carica']],
    model: { body: 0xb5652d, belly: 0xf1d3b0, shape: 'quad', size: 0.5, ears: 'pointy', tail: 'fluffy', eye: 0x1d1d1d },
    desc: 'Nasconde bacche in cento posti diversi.',
  },
  farfallina: {
    name: 'Farfallina', types: ['Coleottero', 'Volante'], base: { hp: 45, atk: 40, def: 45, spd: 70 }, rate: 190, xp: 60, evo: { to: 'aurelia', level: 24 },
    learn: [[1, 'puntura'], [10, 'raffica'], [20, 'ronzio']],
    model: { body: 0x3b3b5c, belly: 0x3b3b5c, shape: 'butterfly', size: 0.55, wings: 0xff8fc8, antennae: true, eye: 0xffffff },
    desc: 'Le sue ali spargono una polvere luccicante.',
  },
  pipistro: {
    name: 'Pipistro', types: ['Spettro', 'Volante'], base: { hp: 45, atk: 55, def: 40, spd: 70 }, rate: 190, xp: 60, evo: { to: 'vampistro', level: 22 },
    learn: [[1, 'leccata'], [8, 'beccata'], [18, 'ombrartiglio'], [26, 'raffica']],
    model: { body: 0x4b3a68, belly: 0x9c8cc0, shape: 'bat', size: 0.5, wings: 0x2e2442, ears: 'pointy', eye: 0xffd23f },
    desc: 'Esce solo quando cala il buio.',
  },
  ombrale: {
    name: 'Ombrale', types: ['Spettro'], base: { hp: 40, atk: 60, def: 45, spd: 65 }, rate: 120, xp: 70, evo: { to: 'tenebrale', level: 30 },
    learn: [[1, 'leccata'], [12, 'ombrartiglio'], [26, 'carica']],
    model: { body: 0x6c4fa0, belly: 0x9f86d1, shape: 'ghost', size: 0.7, eye: 0xfff176, glow: 0x7e57c2 },
    desc: 'Vaga tra le rovine avvolto nella nebbia.',
  },
  voltino: {
    name: 'Voltino', types: ['Elettro'], base: { hp: 40, atk: 55, def: 40, spd: 85 }, rate: 150, xp: 65, evo: { to: 'fulminax', level: 26 },
    learn: [[1, 'scintilla'], [8, 'azione'], [18, 'saetta']],
    model: { body: 0xf7d02c, belly: 0xfff4b0, shape: 'quad', size: 0.5, ears: 'long', tail: 'bolt', eye: 0x2a2205, cheeks: 0xff5d5d },
    desc: 'Accumula elettricità nella coda a saetta.',
  },
  roccione: {
    name: 'Roccione', types: ['Roccia', 'Terra'], base: { hp: 55, atk: 70, def: 90, spd: 25 }, rate: 150, xp: 75, evo: { to: 'colossasso', level: 36 },
    learn: [[1, 'azione'], [6, 'sassata'], [16, 'fango'], [26, 'frana'], [34, 'sisma']],
    model: { body: 0x8d8473, belly: 0xb8ae9b, shape: 'rock', size: 0.8, eye: 0x1d1d1d },
    desc: 'Dorme per mesi immobile sui pendii.',
  },
  sabbiolo: {
    name: 'Sabbiolo', types: ['Terra'], base: { hp: 50, atk: 70, def: 70, spd: 40 }, rate: 150, xp: 70, evo: { to: 'desertauro', level: 30 },
    learn: [[1, 'graffio'], [8, 'fango'], [20, 'sassata'], [30, 'sisma']],
    model: { body: 0xd9a95b, belly: 0xf3dcab, shape: 'quad', size: 0.6, ears: 'long', tail: 'thin', extra: 'spikes', eye: 0x2a1a05 },
    desc: 'Scava tane profonde sotto le dune.',
  },
  fiammello: {
    name: 'Fiammello', types: ['Fuoco'], base: { hp: 50, atk: 75, def: 50, spd: 70 }, rate: 120, xp: 80, evo: { to: 'leonardente', level: 36 },
    learn: [[1, 'braciere'], [12, 'graffio'], [24, 'vampata'], [34, 'carica']],
    model: { body: 0xd8432f, belly: 0xffc36b, shape: 'quad', size: 0.7, ears: 'pointy', tail: 'flame', extra: 'mane', eye: 0x1d1d1d },
    desc: 'Vive vicino ai crateri del vulcano.',
  },
  goccino: {
    name: 'Goccino', types: ['Acqua'], base: { hp: 50, atk: 45, def: 50, spd: 55 }, rate: 190, xp: 60, evo: { to: 'cascatone', level: 24 },
    learn: [[1, 'pistolacqua'], [10, 'azione'], [22, 'ondata']],
    model: { body: 0x47b5e6, belly: 0xc9f0ff, shape: 'blob', size: 0.55, tail: 'fin', eye: 0x0b2333, glossy: true },
    desc: 'Sembra una goccia gigante che rimbalza.',
  },
  granchio: {
    name: 'Granchietto', types: ['Acqua', 'Roccia'], base: { hp: 45, atk: 75, def: 85, spd: 40 }, rate: 170, xp: 68, evo: { to: 'granchione', level: 28 },
    learn: [[1, 'pistolacqua'], [8, 'sassata'], [20, 'ondata'], [30, 'frana']],
    model: { body: 0xe25d4b, belly: 0xffc2a8, shape: 'crab', size: 0.55, eye: 0x111111 },
    desc: 'Le sue chele spezzano le conchiglie.',
  },
  nevino: {
    name: 'Nevino', types: ['Ghiaccio'], base: { hp: 55, atk: 55, def: 60, spd: 50 }, rate: 150, xp: 70, evo: { to: 'valangone', level: 32 },
    learn: [[1, 'nevischio'], [12, 'azione'], [24, 'gelata']],
    model: { body: 0xeaf6ff, belly: 0xffffff, shape: 'fluffy', size: 0.65, ears: 'round', extra: 'scarf', eye: 0x1d3557 },
    desc: 'Rotola giù dai pendii come una palla di neve.',
  },
  brinella: {
    name: 'Brinella', types: ['Ghiaccio', 'Volante'], base: { hp: 50, atk: 60, def: 50, spd: 80 }, rate: 120, xp: 78, evo: { to: 'cristalla', level: 34 },
    learn: [[1, 'nevischio'], [10, 'beccata'], [22, 'gelata'], [32, 'raffica']],
    model: { body: 0x9fd8f0, belly: 0xffffff, shape: 'bird', size: 0.6, wings: true, tail: 'feather', beak: 0x5b7c99, eye: 0x0d2235, crest: 0xffffff },
    desc: 'Le sue piume brillano come cristalli.',
  },

  // ---------- the legendary Velmon of the story ----------
  aurorante: {
    name: 'Aurorante', types: ['Fuoco', 'Volante'], base: { hp: 106, atk: 110, def: 90, spd: 110 }, rate: 6, xp: 300, legendary: true,
    learn: [[1, 'vampata'], [1, 'raffica'], [40, 'fiammata'], [45, 'uragano']],
    model: { body: 0xffb347, belly: 0xfff3dc, shape: 'bird', size: 1.45, wings: true, tail: 'feather', beak: 0xffd23f, eye: 0x7a1f00, crest: 0xff5a00, extra: ['crown', 'flames'] },
    desc: 'Si dice che ogni alba sia il battito delle sue ali.',
  },

  // ---------- evolved forms (evo: the species evolves into `to` at `level`) ----------
  arbusto: {
    name: 'Arbusto', types: ['Erba'], base: { hp: 60, atk: 62, def: 63, spd: 60 }, rate: 45, xp: 142, evo: { to: 'silvarco', level: 32 },
    learn: [[1, 'azione'], [1, 'fogliame'], [9, 'graffio'], [16, 'frustaliana'], [24, 'carica'], [30, 'fango']],
    model: { body: 0x5fb85a, belly: 0xcdeeb0, shape: 'quad', size: 0.95, ears: 'leaf', tail: 'leaf', extra: 'flower', eye: 0x1b3d1b },
    desc: 'Il germoglio è diventato un bocciolo che profuma di pioggia.',
  },
  silvarco: {
    name: 'Silvarco', types: ['Erba', 'Terra'], base: { hp: 80, atk: 82, def: 85, spd: 70 }, rate: 45, xp: 236,
    learn: [[1, 'frustaliana'], [1, 'fango'], [32, 'sisma'], [40, 'tempestaverde']],
    model: { body: 0x3f7f3a, belly: 0xa9d18e, shape: 'quad', size: 1.25, ears: 'leaf', tail: 'leaf', extra: ['tree', 'horns'], horn: 0x6b4a2f, eye: 0x10240e },
    desc: 'Sulla schiena gli cresce un albero intero. Gli uccelli ci fanno il nido.',
  },
  brace: {
    name: 'Brace', types: ['Fuoco'], base: { hp: 58, atk: 64, def: 58, spd: 80 }, rate: 45, xp: 142, evo: { to: 'vulcanide', level: 36 },
    learn: [[1, 'graffio'], [1, 'braciere'], [16, 'vampata'], [24, 'carica'], [30, 'sassata']],
    model: { body: 0xe0632a, belly: 0xffd08a, shape: 'biped', size: 0.95, ears: 'pointy', tail: 'flame', extra: 'horns', horn: 0xfff1d6, eye: 0x2b1406 },
    desc: 'Quando si arrabbia la coda diventa bianca dal calore.',
  },
  vulcanide: {
    name: 'Vulcanide', types: ['Fuoco', 'Roccia'], base: { hp: 78, atk: 92, def: 80, spd: 85 }, rate: 45, xp: 240,
    learn: [[1, 'vampata'], [1, 'sassata'], [36, 'frana'], [42, 'fiammata']],
    model: { body: 0xa83a22, belly: 0xffb35c, shape: 'biped', size: 1.25, ears: 'pointy', tail: 'flame', extra: ['armor', 'flames', 'horns'], horn: 0x2b2b2b, eye: 0xffd23f },
    desc: 'La sua corazza di lava si indurisce a contatto con l\'aria.',
  },
  marea: {
    name: 'Marea', types: ['Acqua'], base: { hp: 59, atk: 63, def: 80, spd: 58 }, rate: 45, xp: 142, evo: { to: 'abissale', level: 36 },
    learn: [[1, 'azione'], [1, 'pistolacqua'], [16, 'ondata'], [24, 'carica'], [30, 'nevischio']],
    model: { body: 0x3f8fd6, belly: 0xd6eeff, shape: 'biped', size: 0.95, ears: 'fin', tail: 'fin', extra: ['shell', 'fins'], eye: 0x0d2235 },
    desc: 'Cavalca le onde come se fossero sue.',
  },
  abissale: {
    name: 'Abissale', types: ['Acqua', 'Ghiaccio'], base: { hp: 82, atk: 80, def: 100, spd: 72 }, rate: 45, xp: 239,
    learn: [[1, 'ondata'], [1, 'nevischio'], [36, 'gelata'], [42, 'idrocannone']],
    model: { body: 0x2d6fb5, belly: 0xcfe8ff, shape: 'quad', size: 1.25, ears: 'fin', tail: 'fin', extra: ['plates', 'fins'], accent: 0x8fe3ff, eye: 0x0d2235 },
    desc: 'Le creste di ghiaccio sulla schiena brillano negli abissi.',
  },
  pennuto: {
    name: 'Pennuto', types: ['Normale', 'Volante'], base: { hp: 63, atk: 60, def: 55, spd: 71 }, rate: 120, xp: 122, evo: { to: 'grifalco', level: 36 },
    learn: [[1, 'azione'], [5, 'beccata'], [15, 'raffica'], [25, 'carica'], [32, 'uragano']],
    model: { body: 0xb07a3f, belly: 0xf3dfb8, shape: 'bird', size: 0.75, wings: true, tail: 'feather', beak: 0xf2b134, eye: 0x1d1d1d, crest: 0xd9472b },
    desc: 'Pattuglia il suo territorio dall\'alto dei pali della luce.',
  },
  grifalco: {
    name: 'Grifalco', types: ['Normale', 'Volante'], base: { hp: 83, atk: 80, def: 75, spd: 101 }, rate: 45, xp: 216,
    learn: [[1, 'raffica'], [1, 'carica'], [36, 'uragano'], [44, 'iperbotta']],
    model: { body: 0x8a5a2b, belly: 0xfff3dc, shape: 'bird', size: 1.15, wings: true, tail: 'feather', beak: 0xf2a100, eye: 0x1d1d1d, crest: 0xffd23f, extra: 'crown' },
    desc: 'Vola sopra le nuvole e vede un Topolux da due chilometri.',
  },
  ratolux: {
    name: 'Ratolux', types: ['Normale'], base: { hp: 55, atk: 81, def: 60, spd: 97 }, rate: 127, xp: 145,
    learn: [[1, 'azione'], [4, 'graffio'], [14, 'carica'], [28, 'iperbotta']],
    model: { body: 0x7e64a3, belly: 0xe0d4ef, shape: 'quad', size: 0.7, ears: 'round', tail: 'thin', extra: 'tusks', eye: 0x1d1d1d },
    desc: 'I suoi incisivi non smettono mai di crescere.',
  },
  nembolana: {
    name: 'Nembolana', types: ['Normale', 'Volante'], base: { hp: 85, atk: 60, def: 75, spd: 55 }, rate: 90, xp: 150,
    learn: [[1, 'azione'], [10, 'carica'], [24, 'raffica'], [34, 'uragano']],
    model: { body: 0xffffff, belly: 0xffffff, shape: 'fluffy', size: 0.95, ears: 'round', horns: 0xd4b26a, hover: 0.35, eye: 0x222222 },
    desc: 'Il vello è così leggero che galleggia a mezz\'aria come una nuvola.',
  },
  cicalone: {
    name: 'Cicalone', types: ['Coleottero'], base: { hp: 60, atk: 75, def: 70, spd: 75 }, rate: 120, xp: 140,
    learn: [[1, 'puntura'], [8, 'azione'], [16, 'ronzio'], [26, 'sciame']],
    model: { body: 0x5f8f2a, belly: 0xd9ec9c, shape: 'bug', size: 0.7, wings: true, antennae: true, extra: 'horns', horn: 0x2b2b2b, eye: 0x111111 },
    desc: 'Il suo canto si sente da una valle all\'altra.',
  },
  cespuglione: {
    name: 'Cespuglione', types: ['Erba'], base: { hp: 75, atk: 65, def: 80, spd: 50 }, rate: 90, xp: 150,
    learn: [[1, 'azione'], [6, 'fogliame'], [18, 'frustaliana'], [30, 'tempestaverde']],
    model: { body: 0x3e7f37, belly: 0xa6d97b, shape: 'blob', size: 0.9, extra: ['leafhat', 'flower'], eye: 0x10240e },
    desc: 'I fiori che porta in testa sbocciano solo con la luna piena.',
  },
  ghiandaro: {
    name: 'Ghiandaro', types: ['Normale'], base: { hp: 65, atk: 80, def: 60, spd: 95 }, rate: 90, xp: 147,
    learn: [[1, 'graffio'], [10, 'azione'], [20, 'carica'], [30, 'iperbotta']],
    model: { body: 0x8e4a1f, belly: 0xf1d3b0, shape: 'quad', size: 0.75, ears: 'pointy', tail: 'fluffy', extra: 'acorn', eye: 0x1d1d1d },
    desc: 'Porta in testa la ghianda più grande che abbia mai trovato.',
  },
  aurelia: {
    name: 'Aurelia', types: ['Coleottero', 'Volante'], base: { hp: 60, atk: 60, def: 60, spd: 95 }, rate: 90, xp: 160,
    learn: [[1, 'puntura'], [10, 'raffica'], [20, 'ronzio'], [30, 'sciame'], [38, 'uragano']],
    model: { body: 0x3b2d1a, belly: 0x3b2d1a, shape: 'butterfly', size: 0.8, wings: 0xffc93c, antennae: true, eye: 0xffffff },
    desc: 'Le sue ali dorate si vedono brillare da lontano al tramonto.',
  },
  vampistro: {
    name: 'Vampistro', types: ['Spettro', 'Volante'], base: { hp: 70, atk: 80, def: 60, spd: 95 }, rate: 90, xp: 159,
    learn: [[1, 'leccata'], [8, 'beccata'], [18, 'ombrartiglio'], [26, 'raffica'], [34, 'incubo']],
    model: { body: 0x3a2a55, belly: 0x7d6aa8, shape: 'bat', size: 0.75, wings: 0x6b1d3a, ears: 'pointy', eye: 0xff3d3d },
    desc: 'Plana silenzioso sui tetti nelle notti senza luna.',
  },
  tenebrale: {
    name: 'Tenebrale', types: ['Spettro'], base: { hp: 60, atk: 90, def: 65, spd: 90 }, rate: 45, xp: 190,
    learn: [[1, 'leccata'], [12, 'ombrartiglio'], [26, 'carica'], [30, 'incubo']],
    model: { body: 0x3d2b6b, belly: 0x6f58a8, shape: 'ghost', size: 1.0, eye: 0xff5cf0, glow: 0x9b59ff, extra: 'crown', crownColor: 0x9a7d2e },
    desc: 'Dicono che sia il signore di tutti i castelli in rovina.',
  },
  fulminax: {
    name: 'Fulminax', types: ['Elettro'], base: { hp: 60, atk: 85, def: 60, spd: 110 }, rate: 75, xp: 170,
    learn: [[1, 'scintilla'], [8, 'azione'], [18, 'saetta'], [32, 'tuono']],
    model: { body: 0xf2b705, belly: 0xfff1a8, shape: 'quad', size: 0.85, ears: 'long', tail: 'bolt', cheeks: 0xff5d5d, extra: 'bolts', eye: 0x2a2205 },
    desc: 'Corre così veloce che lascia una scia di scintille.',
  },
  colossasso: {
    name: 'Colossasso', types: ['Roccia', 'Terra'], base: { hp: 80, atk: 100, def: 125, spd: 40 }, rate: 45, xp: 220,
    learn: [[1, 'sassata'], [16, 'fango'], [26, 'frana'], [34, 'sisma'], [42, 'pioggiamassi']],
    model: { body: 0x6f675a, belly: 0x9a917f, shape: 'rock', size: 1.2, extra: ['armor', 'horns'], horn: 0xd8d0bf, eye: 0x1d1d1d },
    desc: 'Quando cammina le montagne tremano.',
  },
  desertauro: {
    name: 'Desertauro', types: ['Terra'], base: { hp: 75, atk: 100, def: 95, spd: 60 }, rate: 75, xp: 180,
    learn: [[1, 'graffio'], [8, 'fango'], [20, 'sassata'], [30, 'sisma'], [38, 'pioggiamassi']],
    model: { body: 0xc58a3e, belly: 0xf0d39c, shape: 'quad', size: 0.95, ears: 'long', tail: 'thin', extra: ['spikes', 'horns'], horn: 0xf5ead2, eye: 0x2a1a05 },
    desc: 'Le sue corna scavano gallerie nella roccia viva.',
  },
  leonardente: {
    name: 'Leonardente', types: ['Fuoco'], base: { hp: 80, atk: 105, def: 70, spd: 95 }, rate: 45, xp: 220,
    learn: [[1, 'braciere'], [12, 'graffio'], [24, 'vampata'], [34, 'carica'], [40, 'fiammata']],
    model: { body: 0xb8321f, belly: 0xffb347, shape: 'quad', size: 1.05, ears: 'pointy', tail: 'flame', extra: ['mane', 'flames'], eye: 0x1d1d1d },
    desc: 'Il suo ruggito fa tremare il vulcano.',
  },
  cascatone: {
    name: 'Cascatone', types: ['Acqua'], base: { hp: 80, atk: 65, def: 75, spd: 70 }, rate: 90, xp: 155,
    learn: [[1, 'pistolacqua'], [10, 'azione'], [22, 'ondata'], [32, 'idrocannone']],
    model: { body: 0x2f8fd0, belly: 0xbfe9ff, shape: 'blob', size: 0.85, tail: 'fin', extra: 'fins', eye: 0x0b2333, glossy: true },
    desc: 'Rimbalza così forte che solleva onde alte come una casa.',
  },
  granchione: {
    name: 'Granchione', types: ['Acqua', 'Roccia'], base: { hp: 65, atk: 105, def: 115, spd: 55 }, rate: 60, xp: 170,
    learn: [[1, 'pistolacqua'], [8, 'sassata'], [20, 'ondata'], [30, 'frana'], [38, 'pioggiamassi']],
    model: { body: 0xb8402f, belly: 0xffb08f, shape: 'crab', size: 0.85, extra: 'armor', eye: 0x111111 },
    desc: 'Con una chela sola spacca gli scogli.',
  },
  valangone: {
    name: 'Valangone', types: ['Ghiaccio'], base: { hp: 85, atk: 80, def: 85, spd: 55 }, rate: 60, xp: 180,
    learn: [[1, 'nevischio'], [12, 'azione'], [24, 'gelata'], [36, 'bufera']],
    model: { body: 0xdff1ff, belly: 0xffffff, shape: 'fluffy', size: 1.05, ears: 'round', extra: ['scarf', 'icicles'], eye: 0x1d3557 },
    desc: 'Una volta che inizia a rotolare non si ferma più.',
  },
  cristalla: {
    name: 'Cristalla', types: ['Ghiaccio', 'Volante'], base: { hp: 70, atk: 85, def: 70, spd: 105 }, rate: 45, xp: 200,
    learn: [[1, 'nevischio'], [10, 'beccata'], [22, 'gelata'], [32, 'raffica'], [40, 'bufera']],
    model: { body: 0x7cc8ea, belly: 0xffffff, shape: 'bird', size: 0.95, wings: true, tail: 'feather', beak: 0x3d6a8a, eye: 0x0d2235, crest: 0xe0f7ff, extra: 'icicles' },
    desc: 'Dove passa lei cade la neve, anche d\'estate.',
  },
};

export const STARTERS = ['germoglio', 'tizzone', 'ondina'];

// the species this one evolves from (null for first stages)
export const PREVO = Object.fromEntries(Object.entries(SPECIES).filter(([, s]) => s.evo).map(([id, s]) => [s.evo.to, id]));
