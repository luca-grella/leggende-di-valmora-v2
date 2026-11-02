// Story area entry point. Contract: docs/ARCHITECTURE.md "Story API" (ctx.story).
// Builds the private toolkit (kit: POIs, loop-time waits/tweens, creatures data), the animated-props set (fx),
// the story NPC roster (npcs), then the public services (economy, bag, shop, dialogue, quests, trainers, crime,
// grab, chests, centers) and finally wires the prologue, the three chapters and the side quests.
// Everything that touches other areas does it with optional chaining, so the story keeps working while
// world/actors/battle/ui are missing or half built (sandbox/story.html).
import * as THREE from 'three';
import { ITEMS, GIFTS } from './items.js';
import { createEconomy } from './economy.js';
import { createBag } from './bag.js';
import { createShop } from './shop.js';
import { createDialogue } from './dialogue.js';
import { createQuests } from './quests.js';
import { wireChapters } from './chapters.js';
import { wireSideQuests } from './sidequests.js';
import { spawnStoryNpcs, createRoster } from './npcs.js';
import { createTrainers } from './trainers.js';
import { createCrime } from './crime.js';
import { createGrab } from './grab.js';
import { createChests } from './chests.js';
import { createCenters } from './centers.js';
import { createPickups } from './pickups.js';
import { createKit } from './util.js';

/**
 * Animated story props: everything added here is parented (scene by default), optionally positioned,
 * and ticked through userData.update(dt, t) on the systems loop; objects that set userData.dead are dropped.
 */
function createFx(ctx) {
  const set = new Set();
  let t = 0;
  const fx = {
    last: null,
    add(obj, pos = null, parent = null) {
      if (!obj) return obj;
      (parent || ctx.scene).add(obj);
      if (pos) obj.position.set(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0);
      set.add(obj); fx.last = obj;
      return obj;
    },
    remove(obj, { dispose = false } = {}) {
      if (!obj) return;
      set.delete(obj);
      obj.removeFromParent();
      if (dispose) { try { ctx.kit?.dispose?.(obj); } catch { /* optional */ } }
    },
    get size() { return set.size; },
  };
  ctx.loop.add(function storyFx(dt) {
    t += dt;
    for (const o of set) {
      if (o.userData.dead) { set.delete(o); o.removeFromParent(); continue; }
      if (!o.parent) continue;
      try { o.userData.update?.(dt, t); } catch (e) { console.warn('[story] fx update', e); o.userData.update = null; }
    }
  }, ctx.ORDER.systems + 1);
  return fx;
}

/** @param {any} ctx */
export async function init(ctx) {
  const kit = createKit(ctx);
  const story = {
    items: ITEMS, GIFTS,
    kit,
    hooks: { fixer: [], fixerMarker: null },
  };
  ctx.story = story;            // sub-modules look each other up through ctx.story
  await kit.loadLib();

  // Sandbox fallback: without a world, the POIs come from the world's map data (read-only import).
  if (!ctx.world?.poi) {
    try { const m = await import('../world/map.js'); if (m?.POIS) kit.layout = m.POIS; } catch (e) { console.info('[story] no world map data for POIs', e?.message); }
  }

  story.fx = createFx(ctx);
  story.npcs = createRoster(ctx);
  Object.assign(story, {
    economy: createEconomy(ctx),
    bag: createBag(ctx),
    dialogue: createDialogue(ctx),
    quests: createQuests(ctx),
  });
  Object.assign(story, {
    shop: createShop(ctx),
    trainers: createTrainers(ctx),
    crime: createCrime(ctx),
    grab: createGrab(ctx),
    chests: createChests(ctx),
    centers: createCenters(ctx),
    pickups: createPickups(ctx),
  });
  spawnStoryNpcs(ctx);
  story.chapters = wireChapters(ctx);
  story.side = wireSideQuests(ctx);

  // save defaults (old saves, fresh state)
  const fill = () => {
    const s = (ctx.save.state.story ||= {});
    if (typeof s.coins !== 'number') s.coins = 300;
    if (!s.bag || typeof s.bag !== 'object') s.bag = { pozione: 2 };
    s.quests ||= {}; s.beaten ||= {}; s.chests ||= {}; s.searched ||= {}; s.pickups ||= {};
    s.crime ||= { wanted: 0, blaster: false, jobsDone: 0 };
    if (s.tracked === undefined) s.tracked = null;
  };
  fill();
  ctx.bus.on('save:loaded', fill);
  ctx.bus.on('save:new', fill);
  ctx.bus.on('game:start', () => {
    fill();
    story.npcs.start();
    ctx.bus.emit('coins:change', { coins: story.economy.coins, delta: 0, reason: 'load' });
  });

  registerDebug(ctx, story);
  return story;
}

function registerDebug(ctx, story) {
  if (!ctx.debug?.register) return;
  const K = story.kit;
  ctx.debug.register('story', {
    /** Jump a quest to a step: story.quest('main1', 3) or story.quest('briciola', 'done'). */
    quest: (id, step = 0) => story.quests.debugSet(id, step),
    objective: () => story.quests.objective(),
    active: () => story.quests.active().map(a => `${a.id}@${a.step}`),
    /** Run an NPC's talk handler (works without actors). */
    talk: id => story.npcs.talk(id),
    npcs: () => [...story.npcs.defs.keys()],
    live: () => [...story.npcs.live.keys()],
    job: (kind, fixer) => story.crime.debug.startJob(kind, fixer),
    wanted: n => (n ? story.crime.addWanted(n, 'debug') : story.crime.clearWanted()),
    chest: () => story.chests.open(story.chests.nearest()),
    fight: id => story.trainers.challenge(id),
    /** Teleport in front of a POI (world or fallback layout). */
    go(id) {
      const p = K.poi(id); if (!p) return null;
      const f = p.facing || 0;
      const x = p.x + Math.sin(f) * 2.2, z = p.z + Math.cos(f) * 2.2;
      if (ctx.player?.teleport) ctx.player.teleport(x, z, f + Math.PI);
      else ctx.cameraRig?.followed?.position.set(x, K.groundY(x, z), z);
      ctx.cameraRig?.snap?.();
      return { x, z };
    },
    chapter: n => story.chapters?.debugChapter?.(n),
    skipPrologue: () => story.chapters?.skipPrologue?.(),
    fx: () => story.fx.size,
    THREE,
  });
}
