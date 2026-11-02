// Foe move choice (v1): weighted by power × effectiveness against the target (+10 so weak moves still appear),
// with a small bias to finish off a weakened target with its strongest move.
import { SPECIES, MOVES, effectiveness } from '../creatures/species.js';
import { maxHp } from '../creatures/monster.js';

export function chooseMove(foe, target, rnd = Math.random) {
  const ids = (foe?.moves || []).filter(id => MOVES[id]);
  if (!ids.length) return 'azione';
  const tt = SPECIES[target?.species]?.types || [];
  const own = SPECIES[foe.species]?.types || [];
  const score = id => { const m = MOVES[id]; return m.power * effectiveness(m.type, tt) * (own.includes(m.type) ? 1.25 : 1) * (m.acc / 100); };
  if (target && target.hp / maxHp(target) < 0.3 && rnd() < 0.6) return ids.reduce((a, b) => (score(b) > score(a) ? b : a));
  const opts = ids.map(id => ({ id, w: score(id) + 10 }));
  let r = rnd() * opts.reduce((s, o) => s + o.w, 0);
  for (const o of opts) { r -= o.w; if (r <= 0) return o.id; }
  return opts[0].id;
}
