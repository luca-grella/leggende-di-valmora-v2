// Two-person staging (a = the player, b = a woman) for dialogue and romance scenes. Places both humans
// around an anchor, plays coordinated clips and puts the hands where they belong with IK (around the back,
// on the shoulders, in the hair, holding hands), sets look-at and expressions. Both always stay clothed;
// `lie_blanket` adds a blanket from the shoulders down. Feet scenes are medium shots (no foot detail).
// Camera framing is the caller's job (ctx.cameraRig.closeUp('romance' | 'romance_top', …)).
//   stagePair(ctx, kind, {a, b, anchor:{x, y?, z, facing} | poiId, fade=0.6, seatY?, vehicle?, distance?}) → Promise
//   endPair(ctx, {a, b, fade=0.6}) → Promise
import * as THREE from 'three';
import { SIT_H } from './clips.js';
import { Human } from './human-api.js';

export const PAIR_KINDS = ['face', 'walk_together', 'sit_bench', 'sit_table', 'sit_ground', 'hug', 'kiss', 'stroke_hair', 'massage_shoulders', 'massage_back', 'massage_legs',
  'massage_feet', 'kiss_feet', 'kiss_neck', 'ear_nibble', 'whisper', 'guide', 'lie_blanket', 'picnic_lap', 'scooter_ride', 'swim'];

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const PAIRS = new Set();
let loopAdded = false;

const H = (x) => (x instanceof Human ? x : x?.human instanceof Human ? x.human : null);
const fwdOf = (f) => ({ x: Math.sin(f), z: Math.cos(f) });
/** Character's right-hand side for facing f (its left is local +x). */
const rightOf = (f) => ({ x: -Math.cos(f), z: Math.sin(f) });
/** World "left" of a human right now. */
const leftDir = (h, out) => out.set(1, 0, 0).applyQuaternion(h.object.getWorldQuaternion(_q)).setY(0).normalize();
const fwdDir = (h, out) => out.set(0, 0, 1).applyQuaternion(h.object.getWorldQuaternion(_q)).setY(0).normalize();

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
        const e = tw.t < 0.5 ? 2 * tw.t * tw.t : 1 - (-2 * tw.t + 2) ** 2 / 2;
        tw.h.object.position.lerpVectors(tw.from, tw.to, e);
        tw.h.object.rotation.y = tw.r0 + tw.dr * e;
      }
      p.tweens = p.tweens.filter(t => t.t < 1);
      try { p.update?.(dt, p); } catch (e) { console.warn('[actors] pair update', e); }
    }
  }, (ctx.ORDER?.actors ?? 20) - 0.5);
}

/** Find the NPC record owning a human (to freeze its wandering). */
function npcOf(ctx, h) { for (const n of ctx.actors?.npcs?.values?.() || []) if (n.human === h) return n; return null; }

function cleanup(ctx, p, { keepPlace = false } = {}) {
  PAIRS.delete(p);
  for (const o of p.props) { o.removeFromParent(); o.traverse?.(m => { if (m.geometry) m.geometry.dispose(); }); }
  p.props.length = 0;
  for (const h of [p.a, p.b]) {
    if (!h) continue;
    if (h._pair === p) h._pair = null;
    h.clearHandTargets(0.3);
    h.stopUpper(0.3);
    h.stop();
  }
  if (!keepPlace) return;
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

  const p = { kind, a, b, anchor, props: [], tweens: [], update: null, t: 0, opts };
  a._pair = b._pair = p;
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
    for (const [h, k] of [[a, -1], [b, 1]]) {
      if (!h) continue;
      h.lookAt(null); h.talk(false); h.setExpression('neutral', { dur: 0.4 });
      if (h.attached?.('back')?.userData?.pairProp) h.attach('back', null);
      const wasDown = h.clip !== 'locomotion';
      if (fade > 0) { h.animator.stopUpper(0); h.animator.play('locomotion', { fade: 0 }); }
      else h.play('idle', { fade: 0.5 });
      if (wasDown || fade > 0) {
        const x = anchor.x + fw.x * 0.55 * k, z = anchor.z + fw.z * 0.55 * k;
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
      p.tweens.push({ h, from: h.object.position.clone(), to, r0, dr, t: 0, dur: 0.55 });
    } else { h.object.position.copy(to); h.object.rotation.y = facing; h.resetSprings(); }
    if (ctx.player?.human === h) ctx.player.facing = facing;
  };
  const clip = (h, name, o = {}) => h.play(name, { fade: smooth ? 0.5 : 0, loop: true, ...o });
  const upper = (h, name) => h.play(name, { layer: 'upper', fade: smooth ? 0.5 : 0.01, loop: true });
  const look = (h, t, w = 1) => h.lookAt(t, { weight: w });
  const expr = (h, e) => h.setExpression(e, { dur: smooth ? 0.4 : 0.05 });
  const fade = smooth ? 0.5 : 0.08;
  const back = f + Math.PI;

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
      // hands meet between the two shoulders, at hip height
      const meet = (out) => {
        a.bonePos(guide ? 'shoulder_L' : 'shoulder_R', out); b.bonePos(guide ? 'shoulder_R' : 'shoulder_L', _w);
        out.add(_w).multiplyScalar(0.5); out.y -= 0.5 * a.look.height;
        if (!guide) { fwdDir(a, _w); out.addScaledVector(_w, 0.06); }
        return out;
      };
      if (guide) { upper(a, 'follow_hand'); upper(b, 'lead_hand'); a.setHandTarget('L', meet, { fade: 0.5 }); b.setHandTarget('R', meet, { fade: 0.5 }); look(a, b); look(b, a, 0.6); expr(b, 'smug'); expr(a, 'blush'); }
      else { upper(a, 'hold_hand_R'); upper(b, 'hold_hand_L'); a.setHandTarget('R', meet, { fade: 0.5 }); b.setHandTarget('L', meet, { fade: 0.5 }); look(a, b, 0.5); look(b, a, 0.5); expr(a, 'smile'); expr(b, 'smile'); }
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
      const y = seatY - SIT_H;
      put(a, at(0, -0.3), f, y); put(b, at(0, 0.3), f, y);
      clip(a, 'sit_idle'); clip(b, 'sit_idle');
      look(a, b, 0.7); look(b, a, 0.6); expr(a, 'smile'); expr(b, 'smile');
      break;
    }
    case 'sit_table': {
      const y = seatY - SIT_H;
      put(a, at(-0.72, 0), f, y); put(b, at(0.72, 0), back, y);
      clip(a, 'sit_idle'); clip(b, 'sit_idle');
      look(a, b); look(b, a); expr(a, 'smile'); expr(b, 'smile');
      break;
    }
    case 'sit_ground': {
      put(a, at(0, -0.3), f); put(b, at(0, 0.3), f);
      clip(a, 'sit_ground'); clip(b, 'sit_knees');
      look(a, b, 0.6); look(b, a, 0.7); expr(a, 'smile'); expr(b, 'blush');
      break;
    }
    case 'hug': {
      put(a, at(-0.2, 0), f); put(b, at(0.2, 0), back);
      clip(a, 'hug'); clip(b, 'hug_high');
      a.setHandTarget('L', behind(b, 'spine', -0.07, 0.13, a, 1), { fade });
      a.setHandTarget('R', behind(b, 'spine', 0.0, 0.13, a, -1), { fade });
      b.setHandTarget('L', behind(a, 'neck', -0.06, 0.1, b, 1), { fade });
      b.setHandTarget('R', behind(a, 'neck', -0.06, 0.1, b, -1), { fade });
      look(a, null); look(b, null); expr(a, 'closed'); expr(b, 'blush');
      break;
    }
    case 'kiss': {
      put(a, at(-0.21, 0), f); put(b, at(0.21, 0), back);
      clip(a, 'kiss_lean'); clip(b, 'kiss_receive');
      a.setHandTarget('L', side(b, 'spine', 0.02, -1, 0.12), { fade });
      a.setHandTarget('R', side(b, 'spine', 0.02, 1, 0.12), { fade });
      b.setHandTarget('L', behind(a, 'neck', -0.04, 0.09, b, 1), { fade });
      b.setHandTarget('R', behind(a, 'neck', -0.04, 0.09, b, -1), { fade });
      look(a, b, 0.5); look(b, a, 0.5); expr(a, 'kiss'); expr(b, 'kiss');
      break;
    }
    case 'stroke_hair': {
      put(a, at(-0.27, 0), f); put(b, at(0.27, 0), back);
      clip(a, 'idle'); clip(b, 'shy'); upper(a, 'stroke');
      // the hand slides down her hair from the crown to the shoulder, lifts away and starts again
      a.setHandTarget('R', (out, t) => {
        const u = (t / 2.6) % 1, down = Math.min(1, u / 0.7), lift = u > 0.7 ? Math.sin(((u - 0.7) / 0.3) * Math.PI) : 0;
        const e = down < 0.5 ? 2 * down * down : 1 - (-2 * down + 2) ** 2 / 2;
        b.head.getWorldPosition(out); leftDir(b, _w);
        const yTop = 0.12, yLow = -0.12;
        out.y += (u > 0.7 ? yLow + (yTop - yLow) * ((u - 0.7) / 0.3) : yTop + (yLow - yTop) * e) * b.look.height;
        out.addScaledVector(_w, (0.14 + 0.05 * lift) * b.look.height);
        fwdDir(b, _w); out.addScaledVector(_w, -0.03);
        return out;
      }, { fade: 0.6 });
      look(a, b); look(b, a, 0.4); expr(a, 'smile'); expr(b, 'closed');
      break;
    }
    case 'massage_shoulders': case 'massage_back': {
      const backRub = kind === 'massage_back';
      const seated = opts.seat === true;
      if (seated) { put(b, at(0, 0), f, seatY - SIT_H); clip(b, 'sit_idle'); put(a, at(-0.42, 0), f, floor); clip(a, 'idle'); }
      else { put(b, at(0.05, 0), f); clip(b, 'sit_knees'); put(a, at(-0.5, 0), f); clip(a, 'kneel'); }
      upper(a, 'massage');
      for (const [s, k, ph] of [['L', 1, 0], ['R', -1, Math.PI]]) {
        a.setHandTarget(s, (out, t) => {
          if (backRub) { b.bonePos('spine', out); fwdDir(b, _w); out.addScaledVector(_w, -0.12 * b.look.height); leftDir(b, _w); out.addScaledVector(_w, 0.06 * k); out.y += 0.05 + 0.05 * Math.sin(t * 1.6 + ph); }
          else { b.bonePos(k > 0 ? 'shoulder_L' : 'shoulder_R', out); leftDir(b, _w); out.addScaledVector(_w, 0.05 * k); out.y += 0.05; fwdDir(b, _w); out.addScaledVector(_w, -0.02); }
          // kneading circles, the hands alternate
          out.y += 0.012 * Math.sin(t * 4.2 + ph); fwdDir(b, _w); out.addScaledVector(_w, 0.012 * Math.cos(t * 4.2 + ph));
          return out;
        }, { fade: 0.5 });
      }
      look(a, b, 0.5); look(b, null); expr(a, 'smile'); expr(b, 'closed');
      break;
    }
    case 'massage_legs': {
      put(b, at(0, 0), f); clip(b, 'sit_legs');
      // he kneels at her right side, facing her legs
      put(a, at(0.45, 0.48), f - Math.PI / 2 + 0.25); clip(a, 'kneel'); upper(a, 'massage');
      for (const [s, ph] of [['L', 0], ['R', Math.PI]]) {
        a.setHandTarget(s, (out, t) => {
          const u = 0.5 + 0.5 * Math.sin(t * 1.3 + ph * 0.3);
          b.bonePos(s === 'L' ? 'shin_R' : 'shin_L', out); b.bonePos(s === 'L' ? 'thigh_R' : 'thigh_L', _w);
          out.lerp(_w, 0.25 + 0.35 * u); out.y += 0.07;
          return out;
        }, { fade: 0.5 });
      }
      look(a, b, 0.5); look(b, a, 0.7); expr(a, 'smile'); expr(b, 'blush');
      break;
    }
    case 'massage_feet': case 'kiss_feet': {
      const kissing = kind === 'kiss_feet';
      put(b, at(0, 0), f, seatY - SIT_H); clip(b, 'sit_feet');
      put(a, at(kissing ? 0.92 : 1.0, 0.05), back); clip(a, kissing ? 'kneel_bow' : 'kneel'); upper(a, 'massage');
      a.setHandTarget('L', (out, t) => { b.bonePos('foot_R', out); out.y += 0.05; leftDir(a, _w); out.addScaledVector(_w, 0.05); out.y += 0.01 * Math.sin(t * 3); return out; }, { fade: 0.5 });
      a.setHandTarget('R', (out, t) => { b.bonePos('foot_R', out); out.y += 0.03; leftDir(a, _w); out.addScaledVector(_w, -0.05); fwdDir(a, _w); out.addScaledVector(_w, 0.03 + 0.012 * Math.sin(t * 3 + 1)); return out; }, { fade: 0.5 });
      look(a, kissing ? b.bones.foot_R : b, kissing ? 0.8 : 0.6); look(b, a, 0.8);
      expr(a, kissing ? 'kiss' : 'smile'); expr(b, kissing ? 'laugh' : 'smile');
      break;
    }
    case 'kiss_neck': case 'ear_nibble': {
      const ear = kind === 'ear_nibble';
      put(a, at(-0.2, -0.06), f + 0.12); put(b, at(0.2, 0.06), back + 0.12);
      clip(a, 'lean_neck'); clip(b, ear ? 'shy' : 'tilt_away');
      a.setHandTarget('L', side(b, 'spine', 0.03, -1, 0.12), { fade });
      a.setHandTarget('R', side(b, 'spine', 0.03, 1, 0.12), { fade });
      look(a, null); look(b, null);
      expr(a, ear ? 'grin' : 'closed'); expr(b, ear ? 'laugh' : 'closed');
      break;
    }
    case 'whisper': {
      put(a, at(-0.22, -0.1), f + 0.25); put(b, at(0.24, 0.05), back + 0.3);
      clip(a, 'whisper'); clip(b, 'shy');
      look(a, b, 0.3); look(b, null); expr(a, 'smug'); expr(b, 'blush');
      break;
    }
    case 'lie_blanket': {
      // anchor = bed centre (y = mattress top), facing = where the heads are
      const y = Number.isFinite(anchor.y) ? anchor.y : floor + 0.5;
      put(a, at(-0.06, -0.3), back, y); put(b, at(-0.06, 0.3), back, y);
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
      put(b, at(0, 0), f); clip(b, 'sit_legs');
      // he lies at her right side with his head on her lap
      const head = at(0.36, 0.02), dir = { x: -rt.x, z: -rt.z };          // body → head points to her left (toward her lap)
      const hips = { x: head.x - dir.x * 0.63, z: head.z - dir.z * 0.63 };
      put(a, hips, Math.atan2(dir.x, dir.z) + Math.PI, floor + 0.07);
      clip(a, 'lie_back');
      b.setHandTarget('R', (out, t) => { a.head.getWorldPosition(out); out.y += 0.12 + 0.015 * Math.sin(t * 1.4); fwdDir(b, _w); out.addScaledVector(_w, 0.02 * Math.cos(t * 1.4)); return out; }, { fade: 0.6 });
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
      b.setHandTarget('L', side(a, 'spine', 0.02, 1, 0.1, 0.08), { fade: 0.5 });
      b.setHandTarget('R', side(a, 'spine', 0.02, -1, 0.1, 0.08), { fade: 0.5 });
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

/**
 * Hand target behind a partner's bone (around the back): bone + the partner's back direction × depth +
 * the hugger's own left/right × spread (k = +1 left hand, −1 right hand), dy up.
 */
function behind(partner, bone, dy, depth, hugger, k, spread = 0.09) {
  return (out) => {
    partner.bonePos(bone, out); out.y += dy * partner.look.height;
    fwdDir(partner, _w); out.addScaledVector(_w, -depth * partner.look.height);
    leftDir(hugger, _w); out.addScaledVector(_w, k * spread);
    return out;
  };
}
/** Hand target on a partner's side (waist): bone + partner's left × k × spread, slightly forward. */
function side(partner, bone, dy, k, spread, fwd = 0.0) {
  return (out) => {
    partner.bonePos(bone, out); out.y += dy * partner.look.height;
    leftDir(partner, _w); out.addScaledVector(_w, k * spread * partner.look.height);
    if (fwd) { fwdDir(partner, _w); out.addScaledVector(_w, fwd); }
    return out;
  };
}

/** Soft quilted blanket draped over two bodies lying side by side (local +z = toward the heads). */
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
