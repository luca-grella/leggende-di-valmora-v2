// Velmondex: seen / caught species, stored in save.state.creatures.{seen, caught}.
import { creaturesState } from './team.js';

export function createDex(ctx) {
  const st = () => creaturesState(ctx);
  return {
    get seen() { return st().seen; },
    get caught() { return st().caught; },
    /** Returns true when the species is new to the Velmondex. */
    markSeen(id) { const s = st(); const isNew = !s.seen[id]; s.seen[id] = true; if (isNew) ctx.save.commit(); return isNew; },
    /** Returns true when the species had never been caught. */
    markCaught(id) { const s = st(); const isNew = !s.caught[id]; s.seen[id] = true; s.caught[id] = true; ctx.save.commit(); return isNew; },
    isSeen: id => !!st().seen[id],
    isCaught: id => !!st().caught[id],
    countSeen: () => Object.keys(st().seen).length,
    countCaught: () => Object.keys(st().caught).length,
  };
}
