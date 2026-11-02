// Two-person staging (a = the player, b = a woman) for dialogue and romance scenes. Places both humans
// around an anchor, plays coordinated clips and makes the bodies really touch:
//   - hands lie ON the partner's body surface (palms oriented on her shoulders, back, waist, hair, legs, feet)
//     through Human.touch() contacts, with kneading / stroking motion along the surface;
//   - mouths reach their target (lips, neck, ear, foot) with the spine→head CCD (Human.mouthTo);
//   - a contact solver adjusts the spacing every frame: chests meet in a hug, lips meet in a kiss, the
//     masseur moves until his hands rest on her, and bodies never interpenetrate (torso / head checks);
//   - every body rests on its support (seat, floor, mattress) and feet stay planted;
//   - standing poses are moved to free ground (no partner inside a table, a wall or a tree).
// Clothes: as dressed by the caller (romance may swap to underwear with Human.setOutfit / undress — never less);
// `lie_blanket` adds an opaque blanket from the shoulders down. Feet scenes are medium shots (camera: caller).
//   stagePair(ctx, kind, {a, b, anchor:{x, y?, z, facing} | poiId, fade=0.6, seatY?, vehicle?, distance?, seat?}) → Promise
//   endPair(ctx, {a, b, fade=0.6}) → Promise
import * as THREE from 'three';
import { SIT_H } from './clips.js';
import { Human } from './human-api.js';

export const PAIR_KINDS = ['face', 'walk_together', 'sit_bench', 'sit_table', 'sit_ground', 'hug', 'kiss', 'stroke_hair', 'massage_shoulders', 'massage_back', 'massage_legs',
  'massage_feet', 'kiss_feet', 'kiss_neck', 'ear_nibble', 'whisper', 'guide', 'lie_blanket', 'picnic_lap', 'scooter_ride', 'swim'];
/** Standing kinds: their anchor is moved to free ground. */
const STANDING = new Set(['face', 'hug', 'kiss', 'stroke_hair', 'kiss_neck', 'ear_nibble', 'whisper']);

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _c = new THREE.Vector3(), _d = new THREE.Vector3();
const PAIRS = new Set();
let loopAdded = false;

const H = (x) => (x instanceof Human ? x : x?.human instanceof Human ? x.human : null);
const fwdOf = (f) => ({ x: Math.sin(f), z: Math.cos(f) });
/** Character's right-hand side for facing f (its left is local +x). */
const rightOf = (f) => ({ x: -Math.cos(f), z: Math.sin(f) });
/** World "left" of a human right now. */
const leftDir = (h, out) => out.set(1, 0, 0).applyQuaternion(h.object.getWorldQuaternion(_q)).setY(0).normalize();
const fwdDir = (h, out) => out.set(0, 0, 1).applyQuaternion(h.object.getWorldQuaternion(_q)).setY(0).normalize();
const ease = u => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

function groundY(ctx, x, z) {
  const w = ctx.world;
  if (w?.groundY) { const y = w.groundY(x, z); if (Number.isFinite(y)) return y; }
  if (ctx.stage?.heightAt) return ctx.stage.heightAt(x, z);
  return 0;
}

function ensureLoop(ctx) {
  if (loopAdded) return;
  loopAdded = true;
  ctx.loop.add(function actorsPairs(dt) {
    for (const p of PAIRS) {
      for (const tw of p.tweens) {
        tw.t = Math.min(1, tw.t + dt / tw.dur);
        const e = ease(tw.t);
        tw.h.object.position.lerpVectors(tw.from, tw.to, e);
        tw.h.object.rotation.y = tw.r0 + tw.dr * e;
      }
      p.tweens = p.tweens.filter(t => t.t < 1);
      try { p.update?.(dt, p); } catch (e) { console.warn('[actors] pair update', e); }
      if (!p.tweens.length) for (const f of p.fits) solveFit(f, dt);
    }
  }, (ctx.ORDER?.actors ?? 20) - 0.5);
}

/**
 * Spacing solver: moves `h` along `dir` (from its authored `base`) so err() → 0 (err > 0 = move toward the
 * partner). Bounded to [min, max] metres, eased.
 */
function solveFit(f, dt) {
  const e = f.err(f);
  if (!Number.isFinite(e)) return;
  f.shift = clamp(f.shift + clamp(e, -0.12, 0.12) * Math.min(1, f.rate * dt), f.min, f.max);
  f.h.object.position.set(f.base.x + f.dir.x * f.shift, f.h.object.position.y, f.base.z + f.dir.z * f.shift);
}

/** Find the NPC record owning a human (to freeze its wandering). */
function npcOf(ctx, h) { for (const n of ctx.actors?.npcs?.values?.() || []) if (n.human === h) return n; return null; }

function release(h, fade = 0.3) {
  h.clearHandTargets(fade); h.clearFootTargets?.(fade); h.mouthTo?.(null, { fade });
  h.stopUpper(fade); h.stop();
}

function cleanup(ctx, p) {
  PAIRS.delete(p);
  for (const o of p.props) { o.removeFromParent(); o.traverse?.(m => { if (m.geometry) m.geometry.dispose(); }); }
  p.props.length = 0;
  for (const h of [p.a, p.b]) {
    if (!h) continue;
    if (h._pair === p) h._pair = null;
    h._partner = null;
    release(h);
  }
}

/**
 * Stage two humans. a/b: Human, Npc or the player. anchor: {x, y?, z, facing} (y = floor / bed / water level) or a POI id;
 * default = between them. Resolves once both are placed (walk_together / guide keep strolling until endPair).
 */
export async function stagePair(ctx, kind, opts = {}) {
  const a = H(opts.a) || ctx.player?.human, b = H(opts.b);
  if (!a || !b) { console.warn('[actors] stagePair needs two humans'); return null; }
  if (!PAIR_KINDS.includes(kind)) { console.warn('[actors] unknown pair kind', kind); return null; }
  ensureLoop(ctx);
  let anchor = opts.anchor;
  if (typeof anchor === 'string') anchor = ctx.world?.poi?.(anchor) || null;
  if (!anchor) {
    const pa = a.object.position, pb = b.object.position;
    anchor = { x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2, facing: Math.atan2(pb.x - pa.x, pb.z - pa.z) };
  }
  anchor = { x: anchor.x, z: anchor.z, y: anchor.y, facing: Number.isFinite(anchor.facing) ? anchor.facing : 0 };
  const prev = a._pair || b._pair;
  const smooth = !!prev && (opts.fade ?? 0.6) <= 0;                     // switching pose inside a scene: glide
  if (prev) cleanup(ctx, prev);
  if (b._pair && b._pair !== prev) cleanup(ctx, b._pair);
  // standing poses: keep both bodies out of furniture / walls / trees
  if (STANDING.has(kind) && !smooth && ctx.actors?.findFree) {
    const fr = ctx.actors.findFree(anchor.x, anchor.z, 0.62, { except: [a, b], maxDist: 1.2, people: false });
    anchor.x = fr.x; anchor.z = fr.z;
  }

  const p = { kind, a, b, anchor, props: [], tweens: [], fits: [], update: null, t: 0, opts };
  a._pair = b._pair = p; a._partner = b; b._partner = a;
  // lock both: player control off, NPC wandering frozen
  p.playerWasCtl = prev?.playerWasCtl ?? (ctx.player?.human === a ? ctx.player.control : null);
  if (ctx.player?.human === a && ctx.player.setControl) ctx.player.setControl(false);
  if (ctx.player?.human === b && ctx.player.setControl) ctx.player.setControl(false);
  const nb = npcOf(ctx, b); p.npcB = nb; p.npcWasFrozen = prev?.npcWasFrozen ?? nb?.frozen ?? false; nb?.freeze(true);
  if (ctx.player?.lookAt) ctx.player._lookLocked = true;

  const fade = opts.fade ?? 0.6;
  const place = () => setup(ctx, p, smooth);
  if (fade > 0 && ctx.fade?.through) await ctx.fade.through(async () => { place(); }, { ms: Math.round(fade * 1000) });
  else place();
  PAIRS.add(p);
  ctx.bus?.emit('pair:stage', { kind });
  return p;
}

/** Return both to standing next to each other (fade through black). */
export async function endPair(ctx, opts = {}) {
  const a = H(opts.a) || ctx.player?.human, b = H(opts.b);
  const p = a?._pair || b?._pair;
  const fade = opts.fade ?? 0.6;
  const restore = () => {
    const anchor = p?.anchor || (a ? { x: a.object.position.x, z: a.object.position.z, facing: a.facing } : null);
    if (p) cleanup(ctx, p);
    const f = anchor?.facing ?? 0, fw = fwdOf(f);
    let ax = anchor.x, az = anchor.z;
    if (ctx.actors?.findFree) { const fr = ctx.actors.findFree(ax, az, 0.62, { except: [a, b], maxDist: 2, people: false }); ax = fr.x; az = fr.z; }
    for (const [h, k] of [[a, -1], [b, 1]]) {
      if (!h) continue;
      h.lookAt(null); h.talk(false); h.setExpression('neutral', { dur: 0.4 });
      h.setSupport?.(null);
      if (h.attached?.('back')?.userData?.pairProp) h.attach('back', null);
      const wasDown = h.clip !== 'locomotion';
      if (fade > 0) { h.animator.stopUpper(0); h.animator.play('locomotion', { fade: 0 }); }
      else h.play('idle', { fade: 0.5 });
      if (wasDown || fade > 0) {
        const x = ax + fw.x * 0.55 * k, z = az + fw.z * 0.55 * k;
        h.teleport(x, z, k < 0 ? f : f + Math.PI);
      }
      h.object.position.y = groundY(ctx, h.object.position.x, h.object.position.z);
      h.resetSprings();
    }
    if (ctx.player?.human && (ctx.player.human === a || ctx.player.human === b)) {
      ctx.player.facing = ctx.player.human.object.rotation.y;
      ctx.player.setControl?.(p?.playerWasCtl ?? true);
      if (ctx.player.lookAt) ctx.player.lookAt(null);
    }
    if (p?.npcB && !p.npcWasFrozen) p.npcB.freeze(false);
  };
  if (fade > 0 && ctx.fade?.through) await ctx.fade.through(async () => { restore(); }, { ms: Math.round(fade * 1000) });
  else restore();
  ctx.bus?.emit('pair:end', { kind: p?.kind || null });
}

// ------------------------------------------------------------------------------------------------ contact measures
/** Signed gap between two surface points along `dir` (> 0: apart, < 0: overlapping). */
function gap(h1, r1, p1, h2, r2, p2, dir) {
  h1.surface(r1, p1, _a); h2.surface(r2, p2, _b);
  return _b.sub(_a).dot(dir);
}
/** Overlap (m, ≥ 0) of the two heads (ellipsoids approximated by spheres). */
function headOverlap(h1, h2, k = 0.86) {
  h1.head.getWorldPosition(_a); h2.head.getWorldPosition(_b);
  const r = (h1.spec.headR[0] * h1.look.height + h2.spec.headR[0] * h2.look.height) * k;
  return Math.max(0, r - _a.distanceTo(_b));
}
const avgHands = (h) => (h.reachError.L + h.reachError.R) * 0.5;
/** Signed reach error along a fit's direction (> 0: the target is further on → move toward it). */
const proj = (v, f) => v.x * f.dir.x + v.z * f.dir.z;
const handsAlong = (h, f) => (proj(h.reachVec.L, f) + proj(h.reachVec.R, f)) * 0.5;

// ------------------------------------------------------------------------------------------------
function setup(ctx, p, smooth) {
  const { a, b, anchor, kind, opts } = p;
  const f = anchor.facing, fw = fwdOf(f), rt = rightOf(f);
  const floor = Number.isFinite(anchor.y) ? anchor.y : groundY(ctx, anchor.x, anchor.z);
  const seatY = Number.isFinite(opts.seatY) ? opts.seatY : floor + SIT_H;
  const at = (df, dr) => ({ x: anchor.x + fw.x * df + rt.x * dr, z: anchor.z + fw.z * df + rt.z * dr });
  const put = (h, q, facing, y = floor) => {
    h.stop();
    const to = new THREE.Vector3(q.x, y, q.z);
    const near = h.object.position.distanceTo(to) < 1.2;
    if (smooth && near) {
      const r0 = h.object.rotation.y; let dr = (facing - r0) % (Math.PI * 2); if (dr > Math.PI) dr -= Math.PI * 2; if (dr < -Math.PI) dr += Math.PI * 2;
      p.tweens.push({ h, from: h.object.position.clone(), to, r0, dr, t: 0, dur: 0.6 });
    } else { h.object.position.copy(to); h.object.rotation.y = facing; h.resetSprings(); }
    if (ctx.player?.human === h) ctx.player.facing = facing;
    return to;
  };
  /** Spacing solver for h (moves along the anchor axis toward / away from the partner). */
  const fit = (h, base, dirSign, err, { min = -0.25, max = 0.3, rate = 5 } = {}) => {
    p.fits.push({ h, base: base.clone(), dir: { x: fw.x * dirSign, z: fw.z * dirSign }, shift: 0, min, max, rate, err });
  };
  const clip = (h, name, o = {}) => h.play(name, { fade: smooth ? 0.5 : 0, loop: true, ...o });
  const upper = (h, name) => h.play(name, { layer: 'upper', fade: smooth ? 0.5 : 0.01, loop: true });
  const look = (h, t, w = 1) => h.lookAt(t, { weight: w });
  const expr = (h, e) => h.setExpression(e, { dur: smooth ? 0.4 : 0.05 });
  const fade = smooth ? 0.55 : 0.12;
  const back = f + Math.PI;
  const axis = new THREE.Vector3(fw.x, 0, fw.z);                        // a → b direction for face-to-face kinds
  for (const h of [a, b]) h.setSupport(null);

  switch (kind) {
    case 'face': {
      put(a, at(-0.55, 0), f); put(b, at(0.55, 0), back);
      clip(a, 'idle'); clip(b, 'idle');
      look(a, b); look(b, a); expr(a, 'smile'); expr(b, 'smile');
      break;
    }
    case 'walk_together': case 'guide': {
      const guide = kind === 'guide';
      const dist = opts.distance ?? (guide ? 3.5 : 8);
      if (guide) { put(a, at(-0.35, 0.12), f); put(b, at(0.35, -0.12), f); }
      else { put(a, at(0, -0.3), f); put(b, at(0, 0.3), f); }
      clip(a, 'idle'); clip(b, 'idle');
      // her hand goes to the meeting point between the two shoulders; his palm closes on hers
      const meet = (out) => {
        a.bonePos(guide ? 'shoulder_L' : 'shoulder_R', out); b.bonePos(guide ? 'shoulder_R' : 'shoulder_L', _w);
        out.add(_w).multiplyScalar(0.5); out.y -= 0.5 * a.look.height;
        if (!guide) { fwdDir(a, _w); out.addScaledVector(_w, 0.06); }
        return out;
      };
      if (guide) {
        upper(a, 'follow_hand'); upper(b, 'lead_hand');
        b.setHandTarget('R', meet, { fade: 0.5 });
        a.touch('L', b, 'hand_R', {}, { fade: 0.6, press: 0.006 });
        look(a, b); look(b, a, 0.6); expr(b, 'smug'); expr(a, 'blush');
      } else {
        upper(a, 'hold_hand_R'); upper(b, 'hold_hand_L');
        b.setHandTarget('L', meet, { fade: 0.5 });
        a.touch('R', b, 'hand_L', {}, { fade: 0.6, press: 0.006 });
        look(a, b, 0.5); look(b, a, 0.5); expr(a, 'smile'); expr(b, 'smile');
      }
      // stroll forward together after the cut
      p.t = 0;
      p.update = (dt) => {
        p.t += dt;
        if (p.t > 0.4 && !p.walking) {
          p.walking = true;
          const sp = guide ? 0.9 : 1.15;
          const ta = at(dist - (guide ? 0.35 : 0), guide ? 0.12 : -0.3), tb = at(dist + (guide ? 0.35 : 0), guide ? -0.12 : 0.3);
          a.moveTo(ta, { speed: sp, stopDist: 0.1 }); b.moveTo(tb, { speed: sp, stopDist: 0.1 });
        }
      };
      break;
    }
    case 'sit_bench': {
      put(a, at(0, -0.3), f, floor); put(b, at(0, 0.3), f, floor);
      a.setSupport({ seatY, floorY: floor }); b.setSupport({ seatY, floorY: floor });
      clip(a, 'sit_idle'); clip(b, 'sit_idle');
      look(a, b, 0.7); look(b, a, 0.6); expr(a, 'smile'); expr(b, 'smile');
      break;
    }
    case 'sit_table': {
      put(a, at(-0.72, 0), f, floor); put(b, at(0.72, 0), back, floor);
      a.setSupport({ seatY, floorY: floor }); b.setSupport({ seatY, floorY: floor });
      clip(a, 'sit_idle'); clip(b, 'sit_idle');
      look(a, b); look(b, a); expr(a, 'smile'); expr(b, 'smile');
      break;
    }
    case 'sit_ground': {
      put(a, at(0, -0.33), f); put(b, at(0, 0.33), f);
      a.setSupport({ floorY: floor }); b.setSupport({ floorY: floor });
      clip(a, 'sit_ground'); clip(b, 'sit_knees');
      look(a, b, 0.6); look(b, a, 0.7); expr(a, 'smile'); expr(b, 'blush');
      break;
    }
    case 'hug': {
      const pa = put(a, at(-0.24, 0), f); put(b, at(0.24, 0), back);
      clip(a, 'hug'); clip(b, 'hug_high');
      // his arms around her back (left hand on her back-right, right hand higher on her back-left)
      a.touch('L', b, 'torso', { u: 0.42, a: -Math.PI + 0.75 }, { fade, slide: t => ({ u: 0.42 + 0.03 * Math.sin(t * 0.9) }) });
      a.touch('R', b, 'torso', { u: 0.7, a: Math.PI - 0.7 }, { fade, slide: t => ({ u: 0.7 + 0.03 * Math.sin(t * 0.8 + 1) }) });
      // her arms around his neck / upper back
      b.touch('L', a, 'torso', { u: 0.98, a: -Math.PI + 0.55 }, { fade, elbow: 'down' });
      b.touch('R', a, 'torso', { u: 0.98, a: Math.PI - 0.55 }, { fade, elbow: 'down' });
      // chests meet (slightly pressed), never through each other
      fit(a, pa, 1, () => gap(a, 'chest', { u: 0.68 }, b, 'chest', { u: 0.68 }, axis) + 0.004 - 2 * headOverlap(a, b, 0.75), { min: -0.2, max: 0.18 });
      look(a, null); look(b, null); expr(a, 'closed'); expr(b, 'blush');
      break;
    }
    case 'kiss': {
      const pa = put(a, at(-0.23, 0), f); put(b, at(0.23, 0), back);
      clip(a, 'kiss_lean'); clip(b, 'kiss_receive');
      a.touch('L', b, 'torso', { u: 0.24, a: -Math.PI / 2 - 0.35 }, { fade });       // hands on her waist
      a.touch('R', b, 'torso', { u: 0.24, a: Math.PI / 2 + 0.35 }, { fade });
      b.touch('L', a, 'neck', { u: 0.4, a: -Math.PI + 0.9 }, { fade, elbow: 'down' }); // hers behind his neck
      b.touch('R', a, 'neck', { u: 0.4, a: Math.PI - 0.9 }, { fade, elbow: 'down' });
      // lips meet halfway (each mouth stops just before the middle point)
      const mid = (h, other, out) => { h.surface('mouth', {}, out); other.surface('mouth', {}, _w); _d.subVectors(_w, out); const L = _d.length(); out.addScaledVector(_d, L > 0.012 ? (L - 0.012) / (2 * L) : 0); return out; };
      a.mouthTo((out) => mid(a, b, out), { fade: smooth ? 0.7 : 0.25 });
      b.mouthTo((out) => mid(b, a, out), { weight: 0.75, fade: smooth ? 0.7 : 0.25 });
      fit(a, pa, 1, (fx) => proj(a.reachVec.mouth, fx) - proj(b.reachVec.mouth, fx) - 3 * headOverlap(a, b, 0.8)
        - 2 * Math.max(0, -gap(a, 'chest', { u: 0.68 }, b, 'chest', { u: 0.68 }, axis)), { min: -0.2, max: 0.2 });
      look(a, b, 0.3); look(b, a, 0.3); expr(a, 'kiss'); expr(b, 'kiss');
      break;
    }
    case 'stroke_hair': {
      const pa = put(a, at(-0.3, 0), f); put(b, at(0.3, 0), back);
      clip(a, 'idle'); clip(b, 'shy'); upper(a, 'stroke');
      // his right palm slides down the side of her hair (temple → behind the ear → shoulder), lifts off and starts again
      a.touch('R', b, 'head', { el: 0.7, az: Math.PI / 2 - 0.15, hair: true }, {
        fade: 0.6, fingers: 'down', elbow: 'down',
        slide: (t) => {
          const u = (t / 3) % 1, down = Math.min(1, u / 0.72), e = ease(down);
          if (u <= 0.72) return { el: 0.75 - 1.0 * e, az: Math.PI / 2 - 0.15 + 0.4 * e, lift: 0.003 };
          const r = (u - 0.72) / 0.28;
          return { el: -0.25 + 1.0 * r, az: Math.PI / 2 + 0.25 - 0.4 * r, lift: 0.003 + 0.05 * Math.sin(Math.PI * r) };
        },
      });
      fit(a, pa, 1, (fx) => proj(a.reachVec.R, fx) - 4 * headOverlap(a, b, 1.35) - 2 * Math.max(0, 0.08 - gap(a, 'chest', { u: 0.68 }, b, 'chest', { u: 0.68 }, axis)), { min: -0.15, max: 0.15 });
      look(a, b); look(b, a, 0.4); expr(a, 'smile'); expr(b, 'closed');
      break;
    }
    case 'massage_shoulders': case 'massage_back': {
      const backRub = kind === 'massage_back';
      const seated = opts.seat === true;
      let pa;
      if (seated) {
        put(b, at(0, 0), f, floor); b.setSupport({ seatY, floorY: floor }); clip(b, 'sit_idle');
        pa = put(a, at(-0.45, 0), f, floor); clip(a, 'idle');
      } else {
        put(b, at(0.05, 0), f); b.setSupport({ floorY: floor }); clip(b, 'sit_knees');
        pa = put(a, at(-0.52, 0), f); a.setSupport({ floorY: floor }); clip(a, 'kneel');
      }
      upper(a, 'massage');
      for (const [s, k, ph] of [['L', 1, 0], ['R', -1, Math.PI]]) {
        if (backRub) {
          // palms flat on her back, fingers up, kneading circles that travel up and down either side of the spine
          a.touch(s, b, 'torso', { u: 0.5, a: Math.PI - 0.38 * k }, {
            fade: 0.5, fingers: 'up', press: 0.008,
            slide: (t) => ({ u: 0.45 + 0.28 * Math.sin(t * 0.55 + ph * 0.25) + 0.03 * Math.sin(t * 4 + ph), a: Math.PI - k * (0.38 + 0.06 * Math.cos(t * 4 + ph)), lift: 0.003 * (1 + Math.sin(t * 4 + ph)) }),
          });
        } else {
          // palms on top of her shoulders, fingers forward over them, alternating squeeze
          a.touch(s, b, `shoulder_${s}`, { u: 0.55 }, {
            fade: 0.5, press: 0.008,
            slide: (t) => ({ u: 0.5 + 0.14 * Math.sin(t * 0.7 + ph * 0.2) + 0.04 * Math.sin(t * 4.2 + ph), lift: 0.004 * (1 + Math.sin(t * 4.2 + ph)) }),
          });
        }
      }
      // close enough for the hands, never chest-into-back
      fit(a, pa, 1, (fx) => handsAlong(a, fx) - 3 * Math.max(0, 0.035 - gap(a, 'chest', { u: 0.6 }, b, 'back', { u: 0.6 }, axis)) - 2 * headOverlap(a, b, 1.0), { min: -0.2, max: 0.25 });
      look(a, b, 0.5); look(b, null); expr(a, 'smile'); expr(b, 'closed');
      break;
    }
    case 'massage_legs': {
      put(b, at(0, 0), f); b.setSupport({ floorY: floor }); clip(b, 'sit_legs');
      // he kneels back on his heels at her right side, facing her legs, and leans in from the hips
      const pa = put(a, at(0.42, 0.62), f + Math.PI / 2 - 0.2); a.setSupport({ floorY: floor }); clip(a, 'kneel_reach');
      // palms travel along her right leg: thigh → knee → calf, and back
      const leg = (ph) => (t) => {
        const u = 0.5 + 0.5 * Math.sin(t * 0.6 + ph);
        return u < 0.5 ? { region: 'thigh_R', u: 0.35 + u * 1.2, a: 0.3, lift: 0.003 * (1 + Math.sin(t * 4 + ph)) } : { region: 'shin_R', u: (u - 0.5) * 1.3, a: 0.25, lift: 0.003 * (1 + Math.sin(t * 4 + ph)) };
      };
      a.touch('L', b, 'thigh_R', {}, { fade: 0.5, slide: leg(0), press: 0.006 });
      a.touch('R', b, 'thigh_R', {}, { fade: 0.5, slide: leg(0.9), press: 0.006 });
      p.fits.push({ h: a, base: pa.clone(), dir: { x: -rt.x, z: -rt.z }, shift: 0, min: -0.25, max: 0.3, rate: 4, err: (fx) => handsAlong(a, fx) });
      look(a, b, 0.5); look(b, a, 0.7); expr(a, 'smile'); expr(b, 'blush');
      break;
    }
    case 'massage_feet': case 'kiss_feet': {
      const kissing = kind === 'kiss_feet';
      put(b, at(0, 0), f, floor); b.setSupport({ seatY, floorY: floor }); clip(b, 'sit_feet');
      const pa = put(a, at(kissing ? 0.95 : 0.9, 0.1), back); a.setSupport({ floorY: floor }); clip(a, 'kneel_sit');
      if (kissing) {
        // she raises her right foot in front of his face (a medium shot shows foot and face clearly)
        const q = at(0.6, 0.1), spot = new THREE.Vector3(q.x, seatY + 0.12, q.z);
        b.setFootTarget('R', spot, { fade: 1.0, normal: new THREE.Vector3(-fw.x, 1.3, -fw.z).normalize() });
        // his hands cradle it: one under the heel / sole, one on the ankle
        a.touch('L', b, 'foot_R', { sole: true }, { fade: 0.7, press: 0.006, elbow: 'down' });
        a.touch('R', b, 'foot_R', { u: 0.04 }, { fade: 0.7, press: 0.006, elbow: 'down' });
        // the kisses move by themselves between the top of the foot, the toes and the ankle (no menu, no close-up)
        const spots = [0.5, 0.95, 0.12, 0.62, 0.9, 0.2];
        a.mouthTo({ human: b, region: 'foot_R', offset: 0.008, slide: (t) => {
          const T = 3.2, i = Math.floor(t / T), u = (t % T) / T, e = ease(clamp((u - 0.7) / 0.3, 0, 1));
          const s0 = spots[i % spots.length], s1 = spots[(i + 1) % spots.length];
          return { u: s0 + (s1 - s0) * e, lift: 0.03 * Math.sin(Math.PI * e) };
        } }, { fade: 0.9 });
        fit(a, pa, -1, (fx) => proj(a.reachVec.mouth, fx) * 0.7 + handsAlong(a, fx) * 0.3, { min: -0.3, max: 0.35 });
      } else {
        // her right foot rests on his lap; he massages it with both hands (instep and sole)
        b.setFootTarget('R', { human: a, region: 'lap_L', params: { u: 0.62 } }, { fade: 1.0 });
        a.touch('L', b, 'foot_R', { sole: true }, { fade: 0.7, press: 0.006, elbow: 'down', slide: t => ({ lift: 0.002 * (1 + Math.sin(t * 3)) }) });
        a.touch('R', b, 'foot_R', { u: 0.45 }, { fade: 0.7, press: 0.006, slide: t => ({ u: 0.4 + 0.15 * Math.sin(t * 1.4), lift: 0.003 * (1 + Math.sin(t * 4.5)) }) });
        fit(a, pa, -1, (fx) => -proj(b.reachVec.footR, fx) + handsAlong(a, fx) * 0.3, { min: -0.3, max: 0.35 });
      }
      look(a, kissing ? null : b, 0.6); look(b, a, 0.8);
      expr(a, kissing ? 'kiss' : 'smile'); expr(b, kissing ? 'laugh' : 'smile');
      break;
    }
    case 'kiss_neck': case 'ear_nibble': case 'whisper': {
      const ear = kind === 'ear_nibble', wh = kind === 'whisper';
      const pa = put(a, at(-0.2, -0.07), f + 0.14); put(b, at(0.2, 0.07), back + 0.14);
      clip(a, wh ? 'whisper' : 'lean_neck'); clip(b, ear ? 'shy' : wh ? 'shy' : 'tilt_away');
      if (!wh) {
        a.touch('L', b, 'torso', { u: 0.24, a: -Math.PI / 2 - 0.35 }, { fade });
        a.touch('R', b, 'torso', { u: 0.24, a: Math.PI / 2 + 0.35 }, { fade });
      } else b.touch('L', a, 'torso', { u: 0.7, a: -0.5 }, { fade });
      // the clips lean his head to his left = her right side
      const region = ear || wh ? 'ear_R' : 'neck_R';
      a.mouthTo({ human: b, region, offset: wh ? 0.03 : ear ? 0.004 : 0.006, slide: ear || wh ? null : (t) => ({ u: 0.35 + 0.15 * Math.sin(t * 0.7), a: -Math.PI / 2 - 0.25 + 0.15 * Math.sin(t * 0.5) }) }, { fade: smooth ? 0.7 : 0.3, weight: wh ? 0.85 : 1 });
      fit(a, pa, 1, (fx) => proj(a.reachVec.mouth, fx) - 3 * headOverlap(a, b, 0.7) - 2 * Math.max(0, -gap(a, 'chest', { u: 0.68 }, b, 'chest', { u: 0.68 }, axis)), { min: -0.2, max: 0.22 });
      look(a, null); look(b, wh ? a : null, 0.3);
      expr(a, ear ? 'grin' : wh ? 'smug' : 'closed'); expr(b, ear ? 'laugh' : wh ? 'blush' : 'closed');
      break;
    }
    case 'lie_blanket': {
      // anchor = bed centre (y = mattress top), facing = where the heads are
      const y = Number.isFinite(anchor.y) ? anchor.y : floor + 0.5;
      put(a, at(-0.06, -0.3), back, y); put(b, at(-0.06, 0.3), back, y);
      a.setSupport({ lieY: y, floorY: y }); b.setSupport({ lieY: y, floorY: y });
      clip(a, 'lie_back'); clip(b, 'lie_back');
      look(a, b); look(b, a); expr(a, 'smile'); expr(b, 'blush');
      // wide and a little high: it must hide the bed's own duvet/sheets underneath
      const blanket = buildBlanket(ctx, { w: 1.85, l: 1.75, bodies: [-0.3, 0.3] });
      const c = at(-0.5, 0);
      blanket.position.set(c.x, y + 0.08, c.z); blanket.rotation.y = f;
      ctx.scene.add(blanket); p.props.push(blanket);
      break;
    }
    case 'picnic_lap': {
      put(b, at(0, 0), f); b.setSupport({ floorY: floor }); clip(b, 'sit_legs');
      // he lies at her right side with his head on her lap
      const head = at(0.36, 0.02), dir = { x: -rt.x, z: -rt.z };          // body → head points to her left (toward her lap)
      const hips = { x: head.x - dir.x * 0.63, z: head.z - dir.z * 0.63 };
      put(a, hips, Math.atan2(dir.x, dir.z) + Math.PI, floor);
      a.setSupport({ lieY: floor, floorY: floor });
      clip(a, 'lie_back');
      // her palm rests on his hair, stroking slowly
      b.touch('R', a, 'head', { el: 0.6, az: 0, hair: true }, { fade: 0.6, fingers: 'down', slide: t => ({ el: 0.55 + 0.3 * Math.sin(t * 0.9), lift: 0.004 }) });
      look(a, b); look(b, a); expr(a, 'smile'); expr(b, 'smile');
      break;
    }
    case 'scooter_ride': {
      const v = opts.vehicle || ctx.player?.vehicle || null;
      const seatA = new THREE.Vector3(), seatB = new THREE.Vector3();
      const follow = () => {
        if (v?.object) {
          v.object.updateMatrixWorld(true);
          (v.seat || v.object).getWorldPosition(seatA);
          if (v.pillion) v.pillion.getWorldPosition(seatB); else seatB.copy(seatA).addScaledVector(fwdDir({ object: v.object }, _w), -0.32);
          a.object.position.copy(seatA); b.object.position.copy(seatB);
          a.object.rotation.y = b.object.rotation.y = v.object.rotation.y;
        } else {
          const sa = at(0.12, 0), sb = at(-0.2, 0);
          a.object.position.set(sa.x, floor + 0.92, sa.z); b.object.position.set(sb.x, floor + 0.95, sb.z);
          a.object.rotation.y = b.object.rotation.y = f;
        }
      };
      follow();
      clip(a, 'ride_scooter'); clip(b, 'ride_passenger');
      // her arms around his waist, palms on his belly
      b.touch('L', a, 'torso', { u: 0.22, a: 0.55 }, { fade: 0.5 });
      b.touch('R', a, 'torso', { u: 0.22, a: -0.55 }, { fade: 0.5 });
      look(a, null); look(b, null); expr(a, 'grin'); expr(b, 'smile');
      if (ctx.player?.human === a && ctx.player.vehicle && v === ctx.player.vehicle) {
        // the player keeps driving: only the passenger follows the pillion
        p.update = () => { if (v?.object) { v.object.updateMatrixWorld(true); if (v.pillion) v.pillion.getWorldPosition(seatB); b.object.position.copy(seatB); b.object.rotation.y = v.object.rotation.y; } };
        ctx.player.setControl?.(p.playerWasCtl ?? true);
        a.play('ride_scooter', { fade: 0.2 });
      } else p.update = follow;
      break;
    }
    case 'swim': {
      const y = Number.isFinite(anchor.y) ? anchor.y : (ctx.world?.waterLevel ?? 0);
      put(a, at(-0.45, 0), f, y); put(b, at(0.45, 0), back, y);
      clip(a, 'swim'); clip(b, 'swim', { speed: 0.92 });
      look(a, b); look(b, a); expr(a, 'grin'); expr(b, 'laugh');
      break;
    }
    default: break;
  }
}

/** Soft quilted blanket draped over two bodies lying side by side (local +z = toward the heads). Opaque. */
function buildBlanket(ctx, { w = 1.5, l = 1.65, bodies = [-0.3, 0.3] } = {}) {
  const nx = 26, nz = 22;
  const g = new THREE.PlaneGeometry(w + 0.5, l, nx, nz);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const cream = new THREE.Color('#fbeedd'), rose = new THREE.Color('#f4a7b9'), sheet = new THREE.Color('#ffffff'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    // body bumps + drape over the bed edges + a soft roll at the top (folded sheet)
    let y = 0.2;
    for (const bx of bodies) y += 0.12 * Math.exp(-((x - bx) ** 2) / 0.04) * (0.7 + 0.3 * Math.exp(-((z - 0.35) ** 2) / 0.2));
    const edge = Math.max(0, Math.abs(x) - w / 2);
    y -= Math.min(0.5, edge * 1.8);
    const top = l / 2 - z;
    if (top < 0.12) y += 0.03 * Math.sin((top / 0.12) * Math.PI);
    y += 0.008 * Math.sin(x * 11) * Math.sin(z * 9);
    pos.setY(i, y);
    const quilt = (Math.floor((x + 5) / 0.25) + Math.floor((z + 5) / 0.25)) % 2;
    c.copy(top < 0.13 ? sheet : quilt ? cream : rose.clone().lerp(cream, 0.55));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mat = ctx.toon?.mat ? ctx.toon.mat('#ffffff', { vertexColors: true, side: THREE.DoubleSide }) : new THREE.MeshToonMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true; m.name = 'pair-blanket';
  const grp = new THREE.Group(); grp.add(m); grp.name = 'pair-blanket';
  ctx.toon?.outline?.(grp, { width: 0.012 });
  return grp;
}
