// Carried gift objects (mela, vasofiori, palla, libro, cassa): they lie at T.grab1..3 in every town.
// A → pick up (two-hand carry via ctx.player.carry), A again → throw (arc with gravity and bounces;
// a hit stuns a guard). give() hands the held object to someone (romance gifts) and the object returns
// to its spot later. Contract: story.grab {held, pickUp(kind, obj), drop(), give()} + held:change event.
import * as THREE from 'three';
import { GIFTS } from './items.js';
import { buildGift } from './props.js';
import { TOWNS, dist2 } from './util.js';

const TOWN_GIFTS = {
  alba: ['mela', 'vasofiori', 'palla'], petalo: ['vasofiori', 'mela', 'libro'], fulgida: ['cassa', 'mela', 'palla'],
  muschio: ['libro', 'mela', 'vasofiori'], fosco: ['libro', 'cassa', 'mela'], cristallo: ['palla', 'libro', 'cassa'],
  corallo: ['vasofiori', 'palla', 'cassa'], sole: ['mela', 'palla', 'vasofiori'], ramata: ['cassa', 'libro', 'mela'],
};
const G = 14;   // gravity (snappier arcs read better from the 3/4 camera)

export function createGrab(ctx) {
  const K = () => ctx.story.kit;
  const items = [];            // {id, kind, obj, home:{x,y,z}, state:'rest'|'held'|'fly'|'gone', vel, respawnT}
  let held = null, acc = 0;
  const tmp = new THREE.Vector3();

  function emit() { ctx.bus.emit('held:change', { kind: held?.kind || null }); ctx.save.state.story.held = held?.kind || null; ctx.save.commit(); }

  function place(it, x, z) {
    it.obj.position.set(x, K().groundY(x, z), z);
    it.obj.rotation.set(0, Math.random() * Math.PI * 2, 0);
    if (!it.obj.parent || it.obj.parent !== ctx.scene) ctx.scene.add(it.obj);
  }

  function spawnAt(id, kind, p) {
    const obj = buildGift(ctx, kind);
    const it = { id, kind, obj, home: { x: p.x, z: p.z }, state: 'rest', vel: new THREE.Vector3(), respawnT: 0 };
    place(it, p.x, p.z);
    items.push(it);
    ctx.interact.register({
      id: 'story.grab.' + id, pos: () => (it.state === 'rest' ? it.obj.position : null), radius: 1.3,
      label: `Prendi ${GIFTS[kind].name}`, icon: GIFTS[kind].icon,
      enabled: () => it.state === 'rest' && !held && !ctx.player?.vehicle && it.obj.visible,
      run: () => grab.pickUp(kind, it),
    });
    return it;
  }

  function build() {
    for (const town of TOWNS) {
      (TOWN_GIFTS[town] || []).forEach((kind, i) => {
        const id = `${town}.grab${i + 1}`;
        if (items.some(x => x.id === id)) return;
        const p = K().poi(id);
        if (p) spawnAt(id, kind, p);
      });
    }
  }

  async function throwHeld() {
    if (!held) return;
    const it = held;
    const f = ctx.player?.facing ?? ctx.player?.object?.rotation?.y ?? 0;
    const dir = { x: Math.sin(f), z: Math.cos(f) };
    let released = null;
    try { released = await ctx.player?.throwHeld?.(dir); } catch (e) { console.warn('[grab] throwHeld', e); }
    // flight starts from the hands (or wherever the actors left the object)
    const o = it.obj;
    o.getWorldPosition(tmp);
    if (o.parent !== ctx.scene) { ctx.scene.add(o); }
    o.position.copy(tmp);
    if (released == null && !ctx.player?.throwHeld) { const pp = K().playerPos(); if (pp) o.position.set(pp.x + dir.x * 0.5, (pp.y || 0) + 1.2, pp.z + dir.z * 0.5); }
    const heavy = GIFTS[it.kind].heavy;
    it.vel.set(dir.x * (heavy ? 6 : 9), heavy ? 3.2 : 4.2, dir.z * (heavy ? 6 : 9));
    it.state = 'fly'; it.bounces = 0;
    held = null; emit();
    K().sfx('throw');
  }

  const grab = {
    get held() { return held?.kind || null; },
    get heldObject() { return held?.obj || null; },
    items,
    /** Pick up a gift: kind + the world item record (or any Object3D for scripted carries). */
    pickUp(kind, it) {
      if (held) return false;
      if (!it?.obj && it?.isObject3D) it = { id: 'temp.' + kind, kind, obj: it, home: null, state: 'rest', vel: new THREE.Vector3() };
      if (!it) return false;
      it.state = 'held'; held = it;
      if (ctx.player?.carry) { try { ctx.player.carry(it.obj); } catch (e) { console.warn('[grab] carry', e); } }
      else if (ctx.player?.object) { ctx.player.object.add(it.obj); it.obj.position.set(0, 1.15, 0.38); it.obj.rotation.set(0, 0, 0); }
      K().sfx('pickup');
      K().toast(`Hai preso ${GIFTS[kind]?.name || kind}. A per lanciarla, oppure regalala a qualcuno.`, { icon: GIFTS[kind]?.icon });
      emit();
      return true;
    },
    /** Put the held object down in front of the player. */
    drop() {
      if (!held) return;
      const it = held; held = null;
      try { ctx.player?.carry?.(null); } catch { /* optional */ }
      const pp = K().playerPos(), f = ctx.player?.facing ?? 0;
      if (it.home !== null && pp) { it.state = 'rest'; place(it, pp.x + Math.sin(f) * 0.7, pp.z + Math.cos(f) * 0.7); }
      else it.obj.removeFromParent();
      emit();
    },
    /** Hand the held object over (romance gifts). Returns the kind, or null if empty-handed. */
    give() {
      if (!held) return null;
      const it = held; held = null;
      try { ctx.player?.carry?.(null); } catch { /* optional */ }
      it.obj.removeFromParent();
      if (it.home) { it.state = 'gone'; it.respawnT = 90; } else it.state = 'gone';
      K().sfx('heart');
      emit();
      return it.kind;
    },
    throw: throwHeld,
  };

  // A while carrying → throw (low priority: an NPC in range wins, so you can hand gifts over)
  ctx.interact.register({
    id: 'story.grab.throw', pos: () => (held ? K().playerPos() : null), radius: 0.5, priority: -1,
    label: 'Lancia', icon: '🫳', enabled: () => !!held && !ctx.player?.vehicle, run: throwHeld,
  });

  ctx.loop.add(function storyGrab(dt) {
    acc += dt;
    for (const it of items) {
      if (it.state === 'fly') {
        it.vel.y -= G * dt;
        const o = it.obj.position;
        o.addScaledVector(it.vel, dt);
        it.obj.rotation.x += dt * 7; it.obj.rotation.z += dt * 4;
        // guards (or anyone the crime module cares about) get bonked
        if (ctx.story.crime?.hitTest?.(o, 0.5 + (it.obj.userData.radius || 0.15), 'throw')) { it.vel.multiplyScalar(-0.25); it.vel.y = 2; }
        const gy = K().groundY(o.x, o.z);
        if (o.y <= gy) {
          o.y = gy;
          if (it.bounces < (GIFTS[it.kind].bouncy ? 4 : 1) && Math.abs(it.vel.y) > 1.5) {
            it.vel.y = -it.vel.y * (GIFTS[it.kind].bouncy ? 0.62 : 0.3); it.vel.x *= 0.6; it.vel.z *= 0.6; it.bounces++;
            K().sfx(it.kind === 'palla' ? 'step_grass' : 'step_wood', { vol: 0.5 });
          } else {
            it.state = 'rest'; it.obj.rotation.set(0, it.obj.rotation.y, 0);
            if (ctx.world?.isWater?.(o.x, o.z)) { it.state = 'gone'; it.respawnT = 20; it.obj.removeFromParent(); K().sfx('splash'); }
          }
        }
      }
    }
    if (acc < 0.5) return;
    const step = acc; acc = 0;
    const pp = K().playerPos();
    for (const it of items) {
      // lost/given objects come back home when you are not looking
      if (it.state === 'gone' && it.home) {
        it.respawnT -= step;
        if (it.respawnT <= 0 && (!pp || dist2(pp, it.home) > 25)) { it.state = 'rest'; place(it, it.home.x, it.home.z); }
      }
      if (it.state === 'rest' && it.obj.parent === ctx.scene) it.obj.visible = !ctx.world?.interior && (!pp || dist2(pp, it.obj.position) < 70);
    }
  }, ctx.ORDER.systems);

  ctx.bus.on('game:start', () => { build(); held = null; ctx.save.state.story.held = null; });
  ctx.bus.on('area:enter', () => build());
  return grab;
}
