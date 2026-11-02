// Archipelago data: islands, areas (towns, routes, caves), ferries, gates, interiors, POIs.
// Ids are part of the contract (docs/ARCHITECTURE.md "World API"). 1 unit = 1 m, x = east, z = south
// (north is up on screen with the default camera yaw 0). Geometry-free: layout.js turns this data into
// town/route/cave plans and fills POIS at import time (deterministic, no three.js needed).
import { buildLayout } from './layout.js';

/**
 * Island shape = union of soft ellipses ("lobes"), coast wobble by noise.
 * `hills` scales the inland relief, `feature` adds a landmark relief (volcano, peak, mesas, cliffs).
 */
export const ISLANDS = [
  { id: 'aurora', name: 'Isola Aurora', hills: 1.0,
    lobes: [[0, 8, 205, 118], [-262, 6, 112, 100], [278, -12, 120, 108], [0, 112, 70, 48], [-150, -40, 70, 60], [150, 20, 70, 70]] },
  { id: 'giada', name: 'Isola di Giada', hills: 1.6,
    lobes: [[470, -340, 140, 118], [395, -262, 72, 58], [540, -250, 60, 50]] },
  { id: 'nebbia', name: 'Isola della Nebbia', hills: 1.2,
    lobes: [[30, -530, 165, 108], [175, -462, 95, 60], [300, -410, 82, 26], [-70, -590, 70, 50]] },
  { id: 'gelida', name: 'Isola Gelida', hills: 2.0,
    lobes: [[-385, -470, 150, 120], [-430, -615, 95, 80], [-300, -540, 60, 60]], feature: { kind: 'peak', x: -432, z: -636, h: 26, r: 70 } },
  { id: 'coralline', name: 'Isole Coralline', hills: 0.5,
    lobes: [[15, 440, 108, 70], [150, 470, 42, 30], [215, 445, 30, 24], [268, 482, 40, 32], [-60, 480, 40, 30]] },
  { id: 'sole', name: 'Isola del Sole', hills: 1.0,
    lobes: [[445, 430, 128, 106], [505, 345, 85, 75]], feature: { kind: 'volcano', x: 520, z: 330, h: 30, r: 62 } },
  { id: 'ramato', name: 'Altopiano Ramato', hills: 1.0,
    lobes: [[-420, 395, 150, 118], [-520, 470, 70, 60], [-330, 320, 50, 40]], feature: { kind: 'mesas' } },
];

/** @type {{id:string, kind:'town'|'route'|'cave'|'beach'|'sanctuary', name:string, island:string, levels?:number[], music:string, camera?:object}[]} */
export const AREAS = [
  { id: 'alba', kind: 'town', name: 'Borgo Alba', island: 'aurora', music: 'town', camera: { yaw: 0, distance: 13, pitch: 50 } },
  { id: 'petalo', kind: 'town', name: 'Villa Petalo', island: 'aurora', music: 'town', camera: { yaw: 0, distance: 13, pitch: 50 } },
  { id: 'fulgida', kind: 'town', name: 'Città Fulgida', island: 'aurora', music: 'town', camera: { yaw: 0, distance: 14, pitch: 52 } },
  { id: 'muschio', kind: 'town', name: 'Borgo Muschio', island: 'giada', music: 'town', camera: { yaw: 0, distance: 13, pitch: 50 } },
  { id: 'fosco', kind: 'town', name: 'Castelfosco', island: 'nebbia', music: 'town', camera: { yaw: 0, distance: 13, pitch: 50 } },
  { id: 'cristallo', kind: 'town', name: 'Borgo Cristallo', island: 'gelida', music: 'town', camera: { yaw: 0, distance: 13, pitch: 50 } },
  { id: 'corallo', kind: 'town', name: 'Porto Corallo', island: 'coralline', music: 'town', camera: { yaw: 0, distance: 13, pitch: 50 } },
  { id: 'sole', kind: 'town', name: 'Baia del Sole', island: 'sole', music: 'town', camera: { yaw: 0, distance: 13, pitch: 50 } },
  { id: 'ramata', kind: 'town', name: 'Rocca Ramata', island: 'ramato', music: 'town', camera: { yaw: 0, distance: 13, pitch: 50 } },
  { id: 'spiaggia_alba', kind: 'beach', name: "Spiaggia dell'Alba", island: 'aurora', music: 'route', camera: { yaw: 0, distance: 13.5, pitch: 48 } },
  { id: 'r1', kind: 'route', name: 'Percorso 1 · Sentiero dei Fiori', island: 'aurora', levels: [3, 7], music: 'route', camera: { yaw: 0, distance: 14, pitch: 50 } },
  { id: 'r2', kind: 'route', name: 'Percorso 2 · Via dei Mulini', island: 'aurora', levels: [8, 14], music: 'route', camera: { yaw: 0, distance: 14, pitch: 50 } },
  { id: 'r3', kind: 'route', name: 'Percorso 3 · Ponte di Giada', island: 'giada', levels: [10, 18], music: 'route', camera: { yaw: 0, distance: 14, pitch: 50 } },
  { id: 'r4', kind: 'route', name: 'Percorso 4 · Brughiera', island: 'nebbia', levels: [14, 22], music: 'route', camera: { yaw: 0, distance: 14, pitch: 50 } },
  { id: 'r5', kind: 'route', name: 'Percorso 5 · Passo Gelido', island: 'gelida', levels: [22, 30], music: 'route', camera: { yaw: 0, distance: 14, pitch: 50 } },
  { id: 'santuario', kind: 'sanctuary', name: "Santuario dell'Alba", island: 'gelida', levels: [28, 34], music: 'route', camera: { yaw: 0, distance: 15, pitch: 52 } },
  { id: 'r6', kind: 'route', name: 'Percorso 6 · Lagune Coralline', island: 'coralline', levels: [18, 26], music: 'route', camera: { yaw: 0, distance: 14, pitch: 50 } },
  { id: 'r7', kind: 'route', name: 'Percorso 7 · Sentiero del Vulcano', island: 'sole', levels: [30, 40], music: 'route', camera: { yaw: 0, distance: 14, pitch: 52 } },
  { id: 'r8', kind: 'route', name: 'Percorso 8 · Canyon Ramato', island: 'ramato', levels: [26, 36], music: 'route', camera: { yaw: 0, distance: 14, pitch: 52 } },
  { id: 'grotta_sussurro', kind: 'cave', name: 'Grotta del Sussurro', island: 'nebbia', levels: [16, 22], music: 'cave', camera: { yaw: 0, distance: 11.5, pitch: 54 } },
  { id: 'grotta_cristallo', kind: 'cave', name: 'Grotta di Cristallo', island: 'gelida', levels: [24, 32], music: 'cave', camera: { yaw: 0, distance: 11.5, pitch: 54 } },
  { id: 'grotta_marina', kind: 'cave', name: 'Grotta Marina', island: 'coralline', levels: [20, 26], music: 'cave', camera: { yaw: 0, distance: 11.5, pitch: 54 } },
  { id: 'grotta_vulcano', kind: 'cave', name: 'Grotta del Vulcano', island: 'sole', levels: [32, 40], music: 'cave', camera: { yaw: 0, distance: 11.5, pitch: 54 } },
];

export const TOWNS = AREAS.filter(a => a.kind === 'town').map(a => a.id);

/** Land connections (route id → the two ends). */
export const ROUTES = [
  { id: 'r1', a: 'alba', b: 'petalo' },
  { id: 'r2', a: 'alba', b: 'fulgida' },
  { id: 'r3', a: 'fulgida', b: 'muschio', gate: 'bridge_r3' },
  { id: 'r4', a: 'muschio', b: 'fosco' },
  { id: 'r5', a: 'fosco', b: 'cristallo', gate: 'pass_r5' },
  { id: 'santuario', a: 'cristallo', b: null },
  { id: 'r6', a: 'corallo', b: null },
  { id: 'r7', a: 'sole', b: null },
  { id: 'r8', a: 'ramata', b: null },
];

export const FERRIES = [
  { id: 'alba_corallo', a: 'alba', b: 'corallo' },
  { id: 'corallo_sole', a: 'corallo', b: 'sole', gate: 'ferry_sole' },
  { id: 'petalo_ramata', a: 'petalo', b: 'ramata', gate: 'ferry_ramata' },
  { id: 'fulgida_corallo', a: 'fulgida', b: 'corallo', gate: 'ferry_fulgida_corallo' },
];

/** gate id → flags; the gate is open when ANY of the flags is set. */
export const GATES = {
  bridge_r3: ['ch1_done'],
  ferry_sole: ['ch2_started'],
  ferry_ramata: ['ch2_started'],
  pass_r5: ['ch3_started', 'champion_fosco'],
  ferry_fulgida_corallo: ['ch2_done'],
};

const HOUSES = { alba: 6, fulgida: 6, corallo: 5 };
/** Interior ids (see docs/ARCHITECTURE.md). */
export const INTERIORS = [
  'home.player', 'lab.alba', 'depot.fulgida',
  ...TOWNS.flatMap(t => [`center.${t}`, `shop.${t}`, ...Array.from({ length: HOUSES[t] || 4 }, (_, i) => `house.${t}.${i + 1}`)]),
  ...['alba', 'fulgida', 'corallo', 'petalo'].map(t => `osteria.${t}`),
];

// ---- town definitions (private to world; the layout generator reads them) ------------------------
// slots: building placements in town-local metres [kind, x, z, facing(0=+z door south,1=+x,2=-z,3=-x)].
// exits: points on the town edge where streets lead (routes, beach, dock).
export const TOWN_DEFS = {
  alba: {
    x: 0, z: 0, r: 52, base: 1.4, style: 'village', landmark: 'well', plazaR: 12,
    slots: [['lab', 0, -40, 0], ['center', -13, -22, 0], ['shop', 12, -21, 0], ['home', -15, 25, 0], ['house', -31, -9, 1], ['house', 31, -9, 3],
      ['house', -31, 12, 1], ['house', 31, 12, 3], ['house', 15, 25, 0], ['house', 36, 31, 0], ['osteria', -36, 31, 0]],
    exits: [[-52, 2], [52, -4], [0, 54]], dock: { x: 14, z: 156, facing: 0 }, beach: { x: 0, z: 118, facing: 0 }, scooter: true, guards: true,
  },
  petalo: {
    x: -268, z: 6, r: 50, base: 1.2, style: 'villa', landmark: 'gazebo', plazaR: 12,
    slots: [['center', -12, -22, 0], ['shop', 12, -21, 0], ['house', 30, -10, 3], ['house', 30, 13, 3], ['house', -14, 26, 0], ['house', 14, 26, 0], ['osteria', -30, -12, 1]],
    exits: [[52, 0], [-56, 4], [-30, 52]], dock: { x: -330, z: 82, facing: -Math.PI / 4 }, beach: { x: -352, z: 10, facing: -Math.PI / 2 },
  },
  fulgida: {
    x: 282, z: -14, r: 62, base: 1.6, style: 'city', landmark: 'fountain', plazaR: 15,
    slots: [['center', -14, -26, 0], ['shop', 14, -25, 0], ['house', -36, -12, 1], ['house', -36, 14, 1], ['house', 38, -12, 3], ['house', 38, 14, 3],
      ['house', -18, 32, 0], ['house', 18, 32, 0], ['osteria', -38, -36, 0], ['depot', 34, 50, 0]],
    exits: [[-64, 8], [22, -64], [0, 66]], dock: { x: 300, z: 92, facing: 0 }, market: true, scooter: true, guards: true,
  },
  muschio: {
    x: 470, z: -352, r: 46, base: 2.0, style: 'jungle', landmark: 'bigtree', plazaR: 12,
    slots: [['center', -12, -21, 0], ['shop', 12, -20, 0], ['house', -28, -6, 1], ['house', 28, -6, 3], ['house', -24, 18, 0], ['house', 24, 18, 0]],
    exits: [[-16, 34], [-48, -4]], dock: null,
  },
  fosco: {
    x: 0, z: -546, r: 48, base: 2.2, style: 'stone', landmark: 'castle', plazaR: 12,
    slots: [['center', -12, -21, 0], ['shop', 12, -20, 0], ['house', -28, -6, 1], ['house', 28, -6, 3], ['house', -20, 22, 0], ['house', 20, 22, 0]],
    exits: [[50, 8], [-50, 4]], dock: null,
  },
  cristallo: {
    x: -392, z: -462, r: 46, base: 3.0, style: 'chalet', landmark: 'crystal', plazaR: 12,
    slots: [['center', -12, -21, 0], ['shop', 12, -20, 0], ['house', -28, -4, 1], ['house', 28, -4, 3], ['house', -18, 22, 0], ['house', 18, 22, 0]],
    exits: [[48, -4], [-6, -48], [40, 26]], dock: null,
  },
  corallo: {
    x: 15, z: 438, r: 52, base: 1.0, style: 'stilts', landmark: 'lighthouse', plazaR: 12,
    slots: [['center', -13, -20, 0], ['shop', 13, -19, 0], ['house', -32, -6, 1], ['house', 32, -4, 3], ['house', -32, 16, 1], ['house', -14, 28, 0], ['house', 14, 28, 0], ['osteria', 32, 18, 3]],
    exits: [[54, 4], [0, -54], [-6, 54]], dock: { x: 10, z: 366, facing: Math.PI }, beach: { x: -4, z: 506, facing: 0 }, market: true, scooter: true, guards: true,
  },
  sole: {
    x: 438, z: 440, r: 46, base: 1.2, style: 'hut', landmark: 'totem', plazaR: 12,
    slots: [['center', -12, -20, 0], ['shop', 12, -19, 0], ['house', -28, -6, 1], ['house', 28, -6, 3], ['house', -18, 22, 0], ['house', 18, 22, 0]],
    exits: [[30, -38], [-50, 0], [0, 50]], dock: { x: 330, z: 436, facing: -Math.PI / 2 }, beach: { x: 446, z: 516, facing: 0 },
  },
  ramata: {
    x: -418, z: 392, r: 46, base: 1.6, style: 'adobe', landmark: 'arch', plazaR: 12,
    slots: [['center', -12, -20, 0], ['shop', 12, -19, 0], ['house', -28, -6, 1], ['house', 28, -6, 3], ['house', -18, 22, 0], ['house', 18, 22, 0]],
    exits: [[-48, 10], [44, -24]], dock: { x: -306, z: 288, facing: Math.PI * 0.8 },
  },
};

// ---- route definitions: control points (world), path width, bridge spans, scenery theme ---------------
export const ROUTE_DEFS = {
  r1: { pts: [[-52, 2], [-80, -10], [-112, 6], [-140, 22], [-168, 8], [-196, -6], [-216, 4]], width: 4, theme: 'flowers',
    river: { pts: [[-150, -130], [-146, -60], [-140, 22], [-132, 80], [-128, 140]], width: 7 } },
  r2: { pts: [[52, -4], [84, -22], [118, -8], [150, 18], [184, 10], [220, -6]], width: 4, theme: 'windmills' },
  r3: { pts: [[304, -78], [312, -112], [328, -160], [350, -212], [384, -250], [424, -282], [454, -318]], width: 4, theme: 'jungle', bridge: true },
  r4: { pts: [[422, -356], [380, -390], [330, -408], [270, -416], [212, -444], [150, -480], [96, -510], [50, -540]], width: 4, theme: 'moor' },
  r5: { pts: [[-50, -544], [-96, -548], [-132, -546], [-180, -536], [-232, -520], [-280, -500], [-330, -476], [-346, -464]], width: 4, theme: 'snow', bridge: true, rope: true },
  santuario: { pts: [[-398, -508], [-380, -536], [-420, -556], [-386, -580], [-430, -600], [-404, -624], [-432, -640]], width: 4, theme: 'peak' },
  r6: { pts: [[69, 442], [104, 456], [150, 470], [186, 452], [215, 445], [244, 462], [268, 482]], width: 4, theme: 'lagoon', sandbar: true },
  r7: { pts: [[468, 402], [492, 382], [470, 352], [492, 322], [520, 300], [548, 314]], width: 4, theme: 'volcano' },
  r8: { pts: [[-466, 402], [-500, 420], [-494, 452], [-524, 470], [-530, 500]], width: 4, theme: 'canyon' },
};

/** Ferry docks (outdoor): the dock POI of each town is the boarding spot. */
export const FERRY_ROUTES = {
  alba_corallo: { a: 'spiaggia', b: 'corallo' },
  corallo_sole: { a: 'corallo', b: 'sole' },
  petalo_ramata: { a: 'petalo', b: 'ramata' },
  fulgida_corallo: { a: 'fulgida', b: 'corallo' },
};

/** Caves: outdoor entrance (route side), the cave interior lives in a far "pocket". */
export const CAVE_DEFS = {
  grotta_sussurro: { route: 'r4', entrance: [182, -486], facing: 0, seed: 11, chambers: 6 },
  grotta_cristallo: { route: 'r5', entrance: [-318, -440], facing: Math.PI * 0.5, seed: 23, chambers: 6 },
  grotta_marina: { route: 'r6', entrance: [288, 492], facing: -Math.PI / 2, seed: 37, chambers: 5 },
  grotta_vulcano: { route: 'r7', entrance: [552, 306], facing: -Math.PI / 2, seed: 41, chambers: 6 },
};

/** POI id → {x, y, z, facing}. Filled by layout.js (names listed in docs/ARCHITECTURE.md). */
export const POIS = {};

export const poiId = (...parts) => parts.join('.');

/** Full computed layout (town plans, route plans, caves, interiors). Private to the world area. */
export const LAYOUT = buildLayout({ ISLANDS, AREAS, TOWN_DEFS, ROUTE_DEFS, CAVE_DEFS, FERRIES, FERRY_ROUTES, INTERIORS, POIS });
