// Wild encounter tables by world area id (docs/GDD.md "World"). Spettro species weigh ×2 at night.
import { SPECIES } from './species.js';

export const ENCOUNTERS = {
  r1: { levels: [3, 7], table: { pulcino: 4, topolux: 3, lanuvo: 3, grillo: 2, farfallina: 1 } },
  r2: { levels: [8, 14], table: { topolux: 3, voltino: 3, pulcino: 2, lanuvo: 2, pipistro: 2 } },
  r3: { levels: [10, 18], table: { fogliolo: 3, grillo: 4, scoiattolo: 3, pipistro: 1 } },
  r4: { levels: [14, 22], table: { ombrale: 3, lanuvo: 3, pipistro: 3, grillo: 2 } },
  r5: { levels: [22, 30], table: { nevino: 4, brinella: 3, roccione: 2, ombrale: 1 } },
  santuario: { levels: [28, 34], table: { brinella: 3, nevino: 3, roccione: 2 } },
  r6: { levels: [18, 26], table: { goccino: 4, granchio: 3, pulcino: 2, farfallina: 1 } },
  r7: { levels: [30, 40], table: { fiammello: 3, goccino: 2, granchio: 2, scoiattolo: 2, voltino: 1 } },
  r8: { levels: [26, 36], table: { sabbiolo: 4, roccione: 3, fiammello: 2, voltino: 1 } },
  grotta_sussurro: { levels: [16, 22], table: { ombrale: 3, pipistro: 3, roccione: 2 } },
  grotta_cristallo: { levels: [24, 32], table: { nevino: 3, roccione: 3, brinella: 2 } },
  grotta_marina: { levels: [20, 26], table: { goccino: 3, granchio: 3, pipistro: 2 } },
  grotta_vulcano: { levels: [32, 40], table: { fiammello: 3, roccione: 2, sabbiolo: 2 } },
};

/** Pick a wild Velmon for an area, or null if the area has no table. */
export function rollEncounter(areaId, isNight, rnd = Math.random) {
  const e = ENCOUNTERS[areaId];
  if (!e) return null;
  const entries = Object.entries(e.table).map(([id, w]) => [id, w * (isNight && SPECIES[id]?.types.includes('Spettro') ? 2 : 1)]);
  let r = rnd() * entries.reduce((s, [, w]) => s + w, 0);
  const [species] = entries.find(([, w]) => (r -= w) < 0) || entries[0];
  const [lo, hi] = e.levels;
  return { species, level: lo + Math.floor(rnd() * (hi - lo + 1)) };
}
