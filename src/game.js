// Integration glue: small bridges between areas that the module contracts do not cover on their own.
//  - see-through vegetation: trees/bushes between the camera and what it looks at dissolve (ordered
//    dither in the world wind material), so the player is never hidden behind foliage in the 3/4 view
//    or in close-ups;
//  - safety nets: a player at an invalid position (NaN, fell under the map) is brought back to the last
//    Centro Cura; a busy lock left behind by a broken scene is released after a long timeout, so the
//    game can never freeze for good on the iPhone (no console to reload from);
//  - the first save is written right after a new game starts (so "Continua" always exists);
//  - debug helpers under __valmora.game (with ?debug).
import * as THREE from 'three';
import { OCCLUDE } from './world/mats.js';

/** @param {any} ctx */
export function init(ctx) {
  const game = { version: ctx.VERSION };
  const target = new THREE.Vector3();
  let occlusion = true;

  // ---------------------------------------------------------------- see-through vegetation
  ctx.loop.add(function occlude() {
    const rig = ctx.cameraRig, p = ctx.player?.object;
    if (!occlusion || !rig || !p) { OCCLUDE.uOccR.value = 0; return; }
    const explore = rig.mode === 'explore' || rig.mode === 'release';
    if (explore || !rig.lookTarget) target.set(p.position.x, p.position.y + 1.0, p.position.z);
    else target.copy(rig.lookTarget);
    OCCLUDE.uOccA.value.copy(ctx.camera.position);
    OCCLUDE.uOccB.value.copy(target);
    OCCLUDE.uOccR.value = explore ? 2.4 : 1.6;
  }, (ctx.ORDER?.camera ?? 40) + 1);

  // ---------------------------------------------------------------- cloud shadows only outdoors
  ctx.loop.add(function clouds() {
    if (!ctx.toon) return;
    const w = ctx.world, area = String(w?.area || '');
    ctx.toon.clouds = !w?.interior && !area.startsWith('grotta');
  }, ctx.ORDER?.systems ?? 10);

  // ---------------------------------------------------------------- bodies never overlap
  // The player and the NPCs are solid to each other: soft circle separation every frame (the player is
  // pushed out of standing/talking NPCs; two walkers share the push), always through world.resolveMove so
  // nobody is shoved into a wall or a prop. Characters staged in a pair scene are left alone.
  const BODY_R = 0.31, crowd = [];
  const shove = (pos, dx, dz, r) => {
    const to = { x: pos.x + dx, z: pos.z + dz };
    const q = ctx.world?.resolveMove?.({ x: pos.x, z: pos.z }, to, r) || to;
    pos.x = q.x; pos.z = q.z;
  };
  ctx.loop.add(function bodies() {
    const pl = ctx.player, npcs = ctx.actors?.npcs;
    if (!pl?.object || pl.placeholder || !npcs) return;
    const P = pl.object.position;
    crowd.length = 0;
    for (const n of npcs.values()) {
      const h = n.human, o = h?.object;
      if (!o || n.removed || !o.visible || !o.parent || h._pair) continue;
      if (Math.abs(o.position.x - P.x) > 28 || Math.abs(o.position.z - P.z) > 28) continue;
      crowd.push(n);
    }
    const playerFree = !pl.human?._pair && !pl.vehicle && pl.object.visible && !ctx.busy.has('scene') && !ctx.busy.has('cutscene');
    const solid = n => n.frozen || n.talking || !n.human.moving;
    if (playerFree) for (const n of crowd) {
      const o = n.human.object.position;
      let dx = P.x - o.x, dz = P.z - o.z; const d = Math.hypot(dx, dz), min = BODY_R * 2;
      if (d >= min || Math.abs(P.y - o.y) > 1.2) continue;
      if (d < 1e-4) { dx = Math.sin(pl.facing || 0); dz = Math.cos(pl.facing || 0); } else { dx /= d; dz /= d; }
      const push = min - d, k = solid(n) ? 1 : 0.5;
      shove(P, dx * push * k, dz * push * k, 0.35);
      if (k < 1) shove(o, -dx * push * (1 - k), -dz * push * (1 - k), 0.3);
    }
    for (let i = 0; i < crowd.length; i++) for (let j = i + 1; j < crowd.length; j++) {
      const A = crowd[i], B = crowd[j], a = A.human.object.position, b = B.human.object.position;
      let dx = a.x - b.x, dz = a.z - b.z; const d = Math.hypot(dx, dz), min = BODY_R * 2;
      if (d >= min || Math.abs(a.y - b.y) > 1.2) continue;
      const sa = solid(A), sb = solid(B);
      if (sa && sb && d > 0.05) continue;                    // two people chatting stay where they were placed
      if (d < 1e-4) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
      const push = min - d, ka = sa ? 0 : sb ? 1 : 0.5;
      if (ka > 0) shove(a, dx * push * ka, dz * push * ka, 0.3);
      if (ka < 1) shove(b, -dx * push * (1 - ka), -dz * push * (1 - ka), 0.3);
    }
  }, (ctx.ORDER?.actors ?? 20) + 0.6);

  // ---------------------------------------------------------------- safety nets
  let lastGood = null, check = 0;
  ctx.loop.add(function safety(dt) {
    check += dt; if (check < 0.5) return; check = 0;
    const pl = ctx.player, o = pl?.object;
    if (!o || pl.placeholder) return;
    const { x, y, z } = o.position;
    const bad = !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || y < -30;
    if (!bad) { if (!ctx.busy.is() && !ctx.world?.interior) lastGood = { x, z, facing: pl.facing || 0 }; return; }
    console.warn('[game] player at an invalid position, rescuing', { x, y, z });
    const c = ctx.save.state.player?.lastCenter || 'alba';
    const p = ctx.world?.poi?.(`${c}.center_door`) || ctx.world?.poi?.(`${c}.plaza`) || lastGood || { x: 0, z: 0, facing: 0 };
    try {
      if (ctx.world?.interior) ctx.world.exitInterior?.();
      pl.teleport(p.x, p.z, p.facing || 0);
    } catch (e) { console.warn('[game] rescue failed', e); }
  }, ctx.ORDER?.systems ?? 10);

  // Locks that legitimately last long (battles, sheets, the title, an open dialogue) are never touched;
  // any other lock held for 120 s with no dialogue or battle running is dropped with a warning.
  const LONG_OK = ['battle', 'sheet', 'title', 'dialog'];
  let stuckFor = 0, stuckKey = '';
  ctx.loop.add(function busyWatch(dt) {
    const tags = ctx.busy.tags || [];
    const key = tags.join(',');
    const suspicious = tags.length > 0 && !tags.some(t => LONG_OK.includes(t)) && !ctx.ui?.dialogOpen && !ctx.battle?.active && !ctx.ui?.isOpen?.();
    if (!suspicious || key !== stuckKey) { stuckKey = key; stuckFor = 0; return; }
    stuckFor += dt;
    if (stuckFor < 120) return;
    stuckFor = 0;
    console.warn('[game] releasing a stuck busy lock:', key);
    try {
      ctx.busy.forceClear?.(LONG_OK);
      ctx.player?.setControl?.(true);
      ctx.cameraRig?.release?.({ dur: 0.6 });
      ctx.fade?.in?.(300);
    } catch (e) { console.warn('[game] busy watchdog', e); }
  }, ctx.ORDER?.systems ?? 10);

  // first save right after a new game starts, so "Continua" exists even if the app is closed at once
  ctx.bus.on('game:start', ({ newGame } = {}) => {
    if (newGame) setTimeout(() => { try { ctx.save.flush(); } catch { /* optional */ } }, 4000);
  });

  // ---------------------------------------------------------------- debug
  ctx.debug?.register?.('game', {
    occlusion: on => { occlusion = !!on; },
    state: () => ({ busy: ctx.busy.tags, area: ctx.world?.area, interior: ctx.world?.interior, cam: ctx.cameraRig?.mode,
      objective: ctx.story?.quests?.objective?.()?.text, party: ctx.creatures?.team?.party?.map(m => `${m.species}:${m.level}`) }),
  });
  return game;
}
