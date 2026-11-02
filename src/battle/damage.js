// Damage formula (docs/GDD.md "Battle", v1 rules): ((2·L/5+2)·P·A/D/50+2) × STAB 1.5 × effectiveness ×
// random(0.85..1), crit 1/16 ×1.5, accuracy check. Physical/special split does not exist (A = atk, D = def).
import { SPECIES, MOVES, effectiveness } from '../creatures/species.js';
import { stats } from '../creatures/monster.js';

/** @returns {{damage:number, eff:number, crit:boolean, miss:boolean, stab:boolean, type:string}} */
export function computeDamage(att, def, moveId, rnd = Math.random) {
  const mv = MOVES[moveId] || MOVES.azione;
  const atypes = SPECIES[att.species]?.types || [], dtypes = SPECIES[def.species]?.types || [];
  const eff = effectiveness(mv.type, dtypes);
  if (rnd() * 100 >= (mv.acc ?? 100)) return { damage: 0, eff, crit: false, miss: true, stab: false, type: mv.type };
  const A = stats(att).atk, D = Math.max(1, stats(def).def);
  const stab = atypes.includes(mv.type);
  const crit = rnd() < 1 / 16;
  const base = (((2 * att.level) / 5 + 2) * mv.power * (A / D)) / 50 + 2;
  const damage = eff === 0 ? 0 : Math.max(1, Math.floor(base * (stab ? 1.5 : 1) * eff * (crit ? 1.5 : 1) * (0.85 + rnd() * 0.15)));
  return { damage, eff, crit: eff > 0 && crit, miss: false, stab, type: mv.type };
}
