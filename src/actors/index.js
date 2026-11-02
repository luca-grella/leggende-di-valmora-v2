// Actors area entry point (contract: docs/ARCHITECTURE.md "Actors API"). Procedural Sun/Moon humans,
// the player controller (ctx.player), NPCs (spawn, wander, schedules, talk, ambient villagers) and the
// two-person staging used by dialogue and romance scenes. Every Human auto-updates on the actors loop.
import { LOOKS, randomLook, normalizeLook, underwearLook } from './looks.js';
import { CLIP_NAMES, CLIPS } from './clips.js';
import { EXPRESSIONS } from './face.js';
import { PAIR_KINDS, stagePair, endPair } from './pairs.js';
import { Human, HUMANS, clipLibrary } from './human-api.js';
import { createNpcs } from './npc.js';
import { createPlayer } from './player.js';

/** @param {any} ctx */
export function init(ctx) {
  clipLibrary();                                   // bake once up front (≈ a few ms)
  const actors = {
    looks: LOOKS, randomLook, normalizeLook, underwearLook, clips: CLIP_NAMES, allClips: Object.keys(CLIPS), EXPRESSIONS, PAIR_KINDS,
    /** Create a free Human (not added to the scene: `ctx.scene.add(h.object)`). */
    createHuman: (look, opts = {}) => new Human(ctx, look, opts),
    stagePair: (kind, opts) => stagePair(ctx, kind, opts),
    endPair: opts => endPair(ctx, opts),
    get humans() { return HUMANS; },
  };
  const npcs = createNpcs(ctx, actors);
  Object.assign(actors, {
    spawnNpc: npcs.spawn, npc: npcs.get, removeNpc: npcs.remove, ambient: npcs.ambient, npcs: npcs.map, clearAmbient: npcs.clearAmbient,
  });

  // every human (player, NPCs, battle trainers, scene extras) is advanced here
  ctx.loop.add(function actorsUpdate(dt) {
    npcs.update(dt);
    for (const h of HUMANS) {
      try { h.update(dt); } catch (e) { console.error('[actors] update', h.id, e); HUMANS.delete(h); }
    }
  }, ctx.ORDER?.actors ?? 20);

  const player = createPlayer(ctx, actors);
  if (player) { ctx.player = player; actors.player = player; }

  if (ctx.isDebug && ctx.debug?.register) {
    ctx.debug.register('actorsInfo', () => ({ humans: HUMANS.size, npcs: npcs.map.size, visible: [...HUMANS].filter(h => h.object.visible && h.object.parent).length }));
  }
  return actors;
}
