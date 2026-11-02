// Camera rig: Sun/Moon three-quarter follow camera + eased close-up shots (dialogue, battle,
// capture, evolution, romance, ride). Engine area; see docs/ARCHITECTURE.md "Camera".
//
// Everything glides: the follow target rides a critically damped spring, look-ahead comes from the
// followed object's real (smoothed) velocity, explore parameter changes tween over 0.8 s, shots ease
// from the current pose and then keep tracking their (moving) subjects with damping and a gentle
// hand-held drift. Shake is smooth noise, never random jitter. Pinch / wheel zoom 0.8..1.3 in explore.
import * as THREE from 'three';
import { damp, ease, clamp, wrapAngle } from './math.js';

export const CLOSEUPS = ['dialog', 'portrait', 'battle_intro', 'battle_wide', 'battle_ally', 'battle_foe', 'capture', 'evolution', 'romance', 'romance_top', 'ride'];

const D2R = Math.PI / 180;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const EASES = {
  inOut: ease.inOutCubic, out: ease.outCubic, in: ease.inCubic, linear: ease.linear, smooth: ease.inOutSine,
  back: t => ease.outBack(t, 1.2), cut: () => 1,
};

/** Resolve an Object3D | Human-like {object, head} | Vector3 | {x,y,z} | function → world position into out. */
function wpos(o, out) {
  if (typeof o === 'function') o = o();
  if (!o) return out.set(0, 0, 0);
  if (o.isObject3D) return o.getWorldPosition(out);
  if (o.object?.isObject3D) return o.object.getWorldPosition(out);
  return out.set(+o.x || 0, +o.y || 0, +o.z || 0);
}
const objOf = o => (o?.isObject3D ? o : o?.object?.isObject3D ? o.object : null);

export function createCameraRig({ camera, ctx }) {
  const explore = { distance: 13, pitch: 50, yaw: 0, fov: 35, height: 1.2, lookAhead: 1.2 };
  const cur = { ...explore };
  let tween = null;                                  // explore parameter tween {from, to, t, dur}

  // follow spring state
  const focus = V(), focusVel = V(), lastFollowed = V(), vel = V(), ahead = V();
  let hasFocus = false;

  // pose = what the camera shows before shake
  const pose = { pos: V(0, 12, 9), look: V(), fov: 35 };
  const explorePose = { pos: V(), look: V(), fov: 35 };
  let shot = null;                                    // active shot / orbit / blend
  let zoomTarget = 1;
  let trauma = 0, shakeT = 0;
  const tmp = V(), tmp2 = V(), tmp3 = V();
  const _box = new THREE.Box3(), _size = V();
  const sizeCache = new WeakMap();

  const rig = {
    /** 'explore' | 'shot' | 'orbit' | 'release' */
    mode: 'explore',
    /** Pinch / wheel zoom factor 0.8..1.3 (explore only). */
    zoom: 1,
    followed: null,
    /** Smoothed world point the explore camera follows (read-only). */
    followPos: focus,
    /** Current look-at point (read-only). */
    lookTarget: pose.look,
    /** Allow pinch / wheel zoom in explore. */
    zoomEnabled: true,
    get effectiveYaw() { return cur.yaw * D2R; },
    /** Current explore parameters (animated). */
    get explore() { return { ...cur }; },

    follow(o) { rig.followed = o || null; hasFocus = false; },
    /**
     * Animate the explore camera to new params over 0.8 s (World: area camera, interiors distance ~9).
     * {distance, pitch (deg), yaw (deg), fov, height, lookAhead, dur}
     */
    setExplore(p = {}) {
      const { dur = 0.8, ...rest } = p;
      for (const k of Object.keys(rest)) if (rest[k] == null || !(k in explore)) delete rest[k];
      Object.assign(explore, rest);
      const to = { ...explore };
      // shortest way round for yaw
      to.yaw = cur.yaw + wrapAngle((to.yaw - cur.yaw) * D2R) / D2R;
      if (dur <= 0) { Object.assign(cur, to); tween = null; return; }
      tween = { from: { ...cur }, to, t: 0, dur };
    },
    /** Jump to the target pose now (after teleports, area loads). */
    snap() {
      if (tween) { Object.assign(cur, tween.to); tween = null; }
      hasFocus = false;
      rig.zoom = zoomTarget;
      computeExplore(0);
      if (rig.mode === 'explore') { copyPose(pose, explorePose); apply(0); }
    },

    /**
     * Glide (or cut) to a framing. spec: {position, target, fov, from?: spec, roll?}; position/target may be
     * Vector3, {x,y,z}, Object3D or functions (live: the camera keeps tracking them after arriving).
     * opts: {dur=0.8, ease='inOut'|'out'|'in'|'linear'|'smooth'|'back'|'cut', drift=0 (hand-held sway, m)}.
     * Resolves when arrived. A new shot resolves the previous one immediately.
     */
    shot(spec, { dur = 0.8, ease: e = 'inOut', drift = 0, follow = 6 } = {}) {
      if (!spec) return Promise.resolve();
      return new Promise(resolve => {
        endShot();
        const from = { pos: pose.pos.clone(), look: pose.look.clone(), fov: pose.fov };
        if (spec.from) { evalSpec(spec.from, from); }
        const cut = e === 'cut' || dur <= 0;
        shot = { kind: 'shot', spec, from, t: cut ? 1 : 0, dur: cut ? 0 : dur, ease: EASES[e] || EASES.inOut, drift, follow,
          live: { pos: V(), look: V(), fov: 30 }, smooth: null, resolve, age: 0 };
        rig.mode = 'shot';
        if (cut) { evalSpec(spec, shot.live); shot.smooth = { pos: shot.live.pos.clone(), look: shot.live.look.clone(), fov: shot.live.fov }; copyPose(pose, shot.live); apply(0); finishArrive(); }
      });
    },
    /** Framing computed from the actors' positions (table in ARCHITECTURE.md). */
    closeUp(kind, a = {}, opts = {}) {
      const s = closeUpSpec(kind, a || {});
      if (!s) { console.warn('[camera] close-up needs its subjects:', kind); return Promise.resolve(); }
      const o = { dur: 0.8, drift: s.drift ?? 0, ...s.opts, ...opts };
      const p = rig.shot(s, o);
      if (kind === 'evolution' && s.orbitTarget) p.then(() => { if (shot?.spec === s) rig.orbit(s.orbitTarget, { radius: s.radius, height: s.h, speed: 0.25, lookHeight: s.lookH }); });
      return p;
    },
    /** Slow orbit around a target until the next shot / release. */
    orbit(target, { radius = 4, height = 1.5, speed = 0.2, lookHeight } = {}) {
      endShot();
      const c = wpos(target, tmp);
      const ang = Math.atan2(pose.pos.x - c.x, pose.pos.z - c.z);
      const from = { pos: pose.pos.clone(), look: pose.look.clone(), fov: pose.fov };
      shot = { kind: 'orbit', target, radius, height, speed, ang, lookHeight: lookHeight ?? height * 0.5, from, t: 0, dur: 0.7, ease: EASES.inOut, live: { pos: V(), look: V(), fov: pose.fov }, age: 0 };
      rig.mode = 'orbit';
    },
    /** Glide back to the explore camera (which keeps following the player during the glide). */
    release({ dur = 0.8, ease: e = 'inOut' } = {}) {
      return new Promise(resolve => {
        endShot();
        if (dur <= 0 || e === 'cut') { rig.mode = 'explore'; computeExplore(0); copyPose(pose, explorePose); apply(0); resolve(); return; }
        shot = { kind: 'release', from: { pos: pose.pos.clone(), look: pose.look.clone(), fov: pose.fov }, t: 0, dur, ease: EASES[e] || EASES.inOut, resolve };
        rig.mode = 'release';
      });
    },
    /** Add camera shake trauma (0..1). Decays smoothly. */
    shake(amount = 0.3) { trauma = Math.min(1, trauma + Math.max(0, amount)); },
    /** World point → screen {x, y} in 0..1 (y down), behind = not in front of the camera. */
    toScreen(p, out = {}) {
      wpos(p, tmp3).project(camera);
      out.x = (tmp3.x + 1) / 2; out.y = (1 - tmp3.y) / 2; out.behind = tmp3.z > 1 || tmp3.z < -1;
      return out;
    },
    /** Called by the core every frame (order camera = 40). */
    update(dt) {
      // explore params tween + zoom
      if (tween) {
        tween.t = Math.min(1, tween.t + dt / tween.dur);
        const k = ease.inOutCubic(tween.t);
        for (const key of Object.keys(tween.to)) cur[key] = tween.from[key] + (tween.to[key] - tween.from[key]) * k;
        if (tween.t >= 1) tween = null;
      }
      rig.zoom = damp(rig.zoom, zoomTarget, 8, dt);
      computeExplore(dt);

      if (rig.mode === 'explore' || !shot) { rig.mode = 'explore'; copyPose(pose, explorePose); }
      else if (shot.kind === 'shot') updateShot(dt);
      else if (shot.kind === 'orbit') updateOrbit(dt);
      else if (shot.kind === 'release') {
        shot.t = Math.min(1, shot.t + dt / shot.dur);
        blendPose(pose, shot.from, explorePose, shot.ease(shot.t));
        if (shot.t >= 1) { const r = shot.resolve; shot = null; rig.mode = 'explore'; r?.(); }
      }
      apply(dt);
    },
  };

  // ---------------------------------------------------------------------------------------------
  function copyPose(dst, src) { dst.pos.copy(src.pos); dst.look.copy(src.look); dst.fov = src.fov; }
  function blendPose(dst, a, b, k) {
    dst.pos.lerpVectors(a.pos, b.pos, k);
    dst.look.lerpVectors(a.look, b.look, k);
    dst.fov = a.fov + (b.fov - a.fov) * k;
  }
  function endShot() {
    if (shot?.resolve) { const r = shot.resolve; shot.resolve = null; r(); }
    shot = null;
  }
  function finishArrive() { if (shot?.resolve) { const r = shot.resolve; shot.resolve = null; r(); } }

  function evalSpec(spec, out) {
    const s = typeof spec === 'function' ? spec() : spec;
    wpos(s.position, out.pos); wpos(s.target, out.look);
    out.fov = s.fov || 30;
    return out;
  }

  function updateShot(dt) {
    const s = shot;
    s.age += dt;
    evalSpec(s.spec, s.live);
    if (!s.smooth) s.smooth = { pos: s.live.pos.clone(), look: s.live.look.clone(), fov: s.live.fov };
    else {
      // after arrival the shot keeps tracking moving subjects, softly
      const k = s.t >= 1 ? s.follow : 30;
      s.smooth.pos.x = damp(s.smooth.pos.x, s.live.pos.x, k, dt); s.smooth.pos.y = damp(s.smooth.pos.y, s.live.pos.y, k, dt); s.smooth.pos.z = damp(s.smooth.pos.z, s.live.pos.z, k, dt);
      s.smooth.look.x = damp(s.smooth.look.x, s.live.look.x, k, dt); s.smooth.look.y = damp(s.smooth.look.y, s.live.look.y, k, dt); s.smooth.look.z = damp(s.smooth.look.z, s.live.look.z, k, dt);
      s.smooth.fov = damp(s.smooth.fov, s.live.fov, k, dt);
    }
    if (s.t < 1) {
      s.t = Math.min(1, s.t + dt / s.dur);
      blendPose(pose, s.from, s.smooth, s.ease(s.t));
      if (s.t >= 1) finishArrive();
    } else copyPose(pose, s.smooth);
    if (s.drift > 0) {
      // gentle hand-held sway (looks alive, never distracting)
      const a = s.age;
      tmp.subVectors(pose.look, pose.pos).normalize();
      tmp2.set(-tmp.z, 0, tmp.x).normalize();
      const w = Math.min(1, a / 1.5) * s.drift;
      pose.pos.addScaledVector(tmp2, Math.sin(a * 0.37) * w).y += Math.sin(a * 0.29 + 1.3) * w * 0.5;
      pose.look.addScaledVector(tmp2, Math.sin(a * 0.23 + 0.7) * w * 0.4);
    }
  }

  function updateOrbit(dt) {
    const o = shot;
    o.age += dt; o.ang += o.speed * dt;
    const c = wpos(o.target, tmp);
    o.live.pos.set(c.x + Math.sin(o.ang) * o.radius, c.y + o.height, c.z + Math.cos(o.ang) * o.radius);
    o.live.look.set(c.x, c.y + o.lookHeight, c.z);
    o.live.fov = o.from.fov;
    if (o.t < 1) { o.t = Math.min(1, o.t + dt / o.dur); blendPose(pose, o.from, o.live, o.ease(o.t)); }
    else copyPose(pose, o.live);
  }

  function computeExplore(dt) {
    const portrait = !!ctx.viewport?.portrait;
    const dist = cur.distance * rig.zoom * (portrait ? 1.15 : 1);
    const pitch = (cur.pitch + (portrait ? 4 : 0)) * D2R, yaw = cur.yaw * D2R;
    if (rig.followed) {
      wpos(rig.followed, tmp);
      const jump = hasFocus ? tmp.distanceToSquared(lastFollowed) : Infinity;
      if (!hasFocus || jump > 64 || dt <= 0) {
        // first frame or teleport: snap
        focus.copy(tmp); focusVel.set(0, 0, 0); vel.set(0, 0, 0); ahead.set(0, 0, 0); hasFocus = true;
      } else {
        // smoothed velocity of the followed object → look-ahead (walk ≈ half, run = full)
        const iv = 1 / Math.max(dt, 1e-4);
        vel.x = damp(vel.x, (tmp.x - lastFollowed.x) * iv, 8, dt); vel.z = damp(vel.z, (tmp.z - lastFollowed.z) * iv, 8, dt);
        const sp = Math.hypot(vel.x, vel.z), k = sp > 0.05 ? Math.min(1, sp / 5.6) * cur.lookAhead / sp : 0;
        ahead.x = damp(ahead.x, vel.x * k, 2.2, dt); ahead.z = damp(ahead.z, vel.z * k, 2.2, dt);
        // critically damped spring toward the followed point (+ look-ahead)
        spring(focus, focusVel, tmp.x + ahead.x, tmp.y, tmp.z + ahead.z, dt);
      }
      lastFollowed.copy(tmp);
    }
    explorePose.look.set(focus.x, focus.y + cur.height, focus.z);
    explorePose.pos.set(
      explorePose.look.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      explorePose.look.y + Math.sin(pitch) * dist,
      explorePose.look.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    explorePose.fov = cur.fov;
  }

  // per-axis critically damped spring (omega: horizontal 6.5, vertical 4.5 → soft on stairs/slopes)
  function spring(p, v, tx, ty, tz, dt) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n; i++) {
      const wh = 6.5, wv = 4.5;
      v.x += (-2 * wh * v.x - wh * wh * (p.x - tx)) * h; p.x += v.x * h;
      v.z += (-2 * wh * v.z - wh * wh * (p.z - tz)) * h; p.z += v.z * h;
      v.y += (-2 * wv * v.y - wv * wv * (p.y - ty)) * h; p.y += v.y * h;
    }
  }

  function apply(dt) {
    camera.position.copy(pose.pos);
    // never go under the ground (hills behind the player, low battle shots on slopes)
    const gy = ctx.world?.groundY?.(camera.position.x, camera.position.z);
    if (Number.isFinite(gy) && camera.position.y < gy + 0.35) camera.position.y = gy + 0.35;
    tmp2.copy(pose.look);
    if (trauma > 0) {
      shakeT += dt * 22;
      const s = trauma * trauma, n1 = smoothNoise(shakeT), n2 = smoothNoise(shakeT + 31.7), n3 = smoothNoise(shakeT + 77.1);
      const amp = 0.22 * s * Math.max(0.4, camera.position.distanceTo(pose.look) / 8);
      camera.position.x += n1 * amp; camera.position.y += n2 * amp * 0.8;
      tmp2.x += n3 * amp * 0.4; tmp2.y += n1 * amp * 0.3;
      trauma = Math.max(0, trauma - dt * 1.6);
    }
    camera.lookAt(tmp2);
    if (Math.abs(camera.fov - pose.fov) > 1e-3) { camera.fov = pose.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
  }

  function smoothNoise(t) {
    const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
    const h = n => { const s = Math.sin(n * 127.1) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
    return h(i) * (1 - u) + h(i + 1) * u;
  }

  // ---------------------------------------------------------------------------------------------
  // Framing helpers
  const aspect = () => Math.max(0.3, ctx.viewport?.aspect || camera.aspect || 1);
  /** Distance needed to fit a half-width/half-height box in view. */
  function fitDist(halfW, halfH, fov) {
    const tv = Math.tan(fov * D2R / 2), th = tv * aspect();
    return Math.max(halfH / tv, halfW / th);
  }
  /** Approximate size of a subject (cached bounding box; Velmon / props). */
  function sizeOf(o) {
    const obj = objOf(o);
    if (!obj) return { h: 1, r: 0.5 };
    const ud = obj.userData || {};
    if (ud.height) return { h: ud.height, r: ud.radius || ud.height * 0.35 };
    const c = sizeCache.get(obj);
    if (c && performance.now() - c.at < 3000) return c;
    _box.setFromObject(obj, false);
    if (_box.isEmpty()) return { h: 1, r: 0.5 };
    _box.getSize(_size);
    const out = { h: Math.max(0.2, _size.y), r: Math.max(0.2, Math.max(_size.x, _size.z) / 2), at: performance.now() };
    sizeCache.set(obj, out);
    return out;
  }
  /** Face (eye level) world position of a character: human.head, userData.head, or height-based. */
  function headPos(o, out) {
    // Human.head, Npc.human.head, or a userData.head marker on the object
    const head = [o?.head, o?.human?.head, objOf(o)?.userData?.head].find(h => h?.isObject3D);
    if (head) { head.getWorldPosition(out); out.y += 0.06; return out; }
    wpos(o, out);
    const ud = objOf(o)?.userData || {};
    out.y += (ud.height || 1.62) * 0.9;
    return out;
  }
  function facingOf(o) {
    const obj = objOf(o);
    if (!obj) return 0;
    obj.getWorldDirection(tmp3);              // local +z in world
    return Math.atan2(tmp3.x, tmp3.z);
  }

  /** Close-up specs: functions re-evaluated every frame, so moving subjects stay framed. */
  function closeUpSpec(kind, a) {
    const A = a.a || a.ally || a.target, B = a.b || a.foe;
    const need = (...xs) => xs.every(Boolean);
    const pa = V(), pb = V(), ha = V(), hb = V(), d = V(), r = V(), mid = V();
    const axis = (p, q) => { d.subVectors(q, p); d.y = 0; if (d.lengthSq() < 1e-6) d.set(0, 0, 1); d.normalize(); r.set(-d.z, 0, d.x); };

    switch (kind) {
      case 'dialog': {
        if (!need(A, B)) return null;
        // over the listener's shoulder onto the speaker's face, head height; stays on the same side
        const side = a.side ?? 1;
        return {
          drift: 0.06, opts: { dur: 0.7 },
          position: () => {
            headPos(A, ha); headPos(B, hb); axis(hb, ha);
            const sep = Math.hypot(ha.x - hb.x, ha.z - hb.z);
            const back = 1.2 + Math.max(0, 2.2 - sep) * 0.25 + (ctx.viewport?.portrait ? 0.55 : 0);
            return pb.copy(hb).addScaledVector(d, -back).addScaledVector(r, 0.72 * side).setY(Math.max(ha.y, hb.y) + 0.1);
          },
          target: () => { headPos(A, ha); return mid.copy(ha).setY(ha.y - 0.06); },
          fov: 32,
        };
      }
      case 'portrait': {
        if (!need(A)) return null;
        const s = a.side || 1;
        return {
          drift: 0.04,
          position: () => {
            headPos(A, ha); const f = facingOf(A) + 0.38 * s;
            const dist = fitDist(0.45, 0.5, 30);
            return pa.set(ha.x + Math.sin(f) * dist, ha.y + 0.08, ha.z + Math.cos(f) * dist);
          },
          target: () => headPos(A, ha).setY(ha.y - 0.2),
          fov: 30,
        };
      }
      case 'battle_intro': case 'battle_wide': {
        if (!need(A, B)) return null;
        const wpPos = V(), wpLook = V();
        const wide = () => {
          wpos(A, pa); wpos(B, pb); axis(pa, pb);
          const sa = sizeOf(A), sb = sizeOf(B), sep = Math.hypot(pb.x - pa.x, pb.z - pa.z), top = Math.max(sa.h, sb.h);
          mid.addVectors(pa, pb).multiplyScalar(0.5);
          const halfW = sep * 0.5 + Math.max(sa.r, sb.r) + 0.8, halfH = top * 0.9 + 0.5;
          const dist = fitDist(halfW, halfH, 38) * 1.02;
          // low-angle 3/4 from the ally's side
          wpPos.copy(mid).addScaledVector(r, dist * 0.82).addScaledVector(d, -dist * 0.55).setY(mid.y + 0.9 + top * 0.4);
          // aim slightly towards the (nearer, larger-looking) ally so both stay inside the frame
          wpLook.copy(mid).lerp(pa, 0.12).setY(mid.y + top * 0.45);
          return wpPos;
        };
        const spec = { position: () => wide(), target: () => wpLook, fov: 38, opts: { dur: kind === 'battle_intro' ? 2.1 : 0.9, ease: 'smooth' } };
        if (kind === 'battle_intro') {
          // starts on a close hero shot of the foe, sweeps out to the wide framing
          wpos(A, pa); wpos(B, pb); axis(pb, pa);
          const sb = sizeOf(B);
          const dist = fitDist(sb.r + 0.4, sb.h * 0.6 + 0.2, 32);
          spec.from = { position: pb.clone().addScaledVector(d, dist).addScaledVector(r, -dist * 0.35).setY(pb.y + sb.h * 0.45), target: pb.clone().setY(pb.y + sb.h * 0.55), fov: 32 };
        }
        return spec;
      }
      case 'battle_ally': {
        if (!need(A, B)) return null;
        return {
          drift: 0.05, opts: { dur: 0.7 },
          position: () => {
            wpos(A, pa); wpos(B, pb); axis(pa, pb); const sa = sizeOf(A);
            // above and to the side of the trainer standing behind the ally: looks over both onto the foe
            return mid.copy(pa).addScaledVector(d, -(2.1 + sa.r * 1.4)).addScaledVector(r, 1.25 + sa.r * 0.8).setY(pa.y + sa.h * 1.1 + 0.85);
          },
          // aim between foe and ally so the ally's back stays in the lower foreground
          target: () => { wpos(A, pa); wpos(B, pb); const sa = sizeOf(A), sb = sizeOf(B); return hb.copy(pb).lerp(pa, 0.28).setY(pb.y * 0.72 + pa.y * 0.28 + sb.h * 0.42 + sa.h * 0.1); },
          fov: 36,
        };
      }
      case 'battle_foe': {
        if (!need(A, B)) return null;
        return {
          drift: 0.05, opts: { dur: 0.7 },
          position: () => {
            wpos(A, pa); wpos(B, pb); axis(pb, pa); const sb = sizeOf(B);
            const dist = fitDist(sb.r + 0.7, sb.h * 0.6 + 0.35, 30);
            return mid.copy(pb).addScaledVector(d, dist).addScaledVector(r, -dist * 0.3).setY(pb.y + sb.h * 0.35 + 0.25);
          },
          target: () => { wpos(B, pb); const sb = sizeOf(B); return hb.copy(pb).setY(pb.y + sb.h * 0.55); },
          fov: 30,
        };
      }
      case 'capture': {
        if (!need(A)) return null;
        // close and low on the ball, with a slow orbit
        const t0 = performance.now();
        wpos(A, pa);
        const base = Math.atan2(pose.pos.x - pa.x, pose.pos.z - pa.z);
        return {
          opts: { dur: 0.6, ease: 'out', follow: 10 },
          position: () => {
            wpos(A, pa); const ang = base + ((performance.now() - t0) / 1000) * 0.18;
            return mid.set(pa.x + Math.sin(ang) * 1.7, pa.y + 0.55, pa.z + Math.cos(ang) * 1.7);
          },
          target: () => wpos(A, pb).setY(pb.y + 0.12),
          fov: 30,
        };
      }
      case 'evolution': {
        if (!need(A)) return null;
        wpos(A, pa); const s = sizeOf(A);
        const radius = fitDist(s.r + 0.8, s.h * 0.6 + 0.4, 32), h = s.h * 0.6 + 0.4;
        const f = Math.atan2(pose.pos.x - pa.x, pose.pos.z - pa.z);
        return {
          opts: { dur: 1.2, ease: 'smooth' },
          position: pa.clone().add(V(Math.sin(f) * radius, h, Math.cos(f) * radius)),
          target: pa.clone().setY(pa.y + s.h * 0.5),
          fov: 32, orbitTarget: A, radius, h, lookH: s.h * 0.5,
        };
      }
      case 'romance': {
        if (!need(A, B)) return null;
        // Soft two-shot of faces and shoulders (never below the chest). Landscape: side two-shot.
        // Portrait (narrow): over the player's shoulder onto her face, tight.
        const tight = !!a.tight;
        return {
          drift: 0.04, opts: { dur: 1.0, ease: 'smooth' },
          position: () => {
            headPos(A, ha); headPos(B, hb);
            mid.addVectors(ha, hb).multiplyScalar(0.5);
            const sep = Math.hypot(ha.x - hb.x, ha.z - hb.z);
            if (aspect() < 1) {
              axis(ha, hb);
              const back = tight ? 0.75 : 1.05;
              return pa.copy(ha).addScaledVector(d, -back).addScaledVector(r, 0.42).setY(Math.max(ha.y, hb.y) + 0.12);
            }
            axis(ha, hb);
            const side = a.side ?? 1;
            // vertical room grows with the head height difference (she sits, he kneels) but stays chest-up
            const halfH = clamp(Math.abs(ha.y - hb.y) / 2 + (tight ? 0.3 : 0.42), 0.3, 0.62);
            const dist = Math.min(tight ? 2.0 : 2.8, fitDist(sep / 2 + (tight ? 0.28 : 0.42), halfH, 30));
            return pa.copy(mid).addScaledVector(r, dist * side).addScaledVector(d, -dist * 0.18).setY(mid.y + 0.16);
          },
          target: () => {
            headPos(A, ha); headPos(B, hb);
            if (aspect() < 1) return pb.copy(hb).setY(hb.y - 0.04);
            return pb.addVectors(ha, hb).multiplyScalar(0.5).setY(Math.max(ha.y, hb.y) - 0.08);
          },
          fov: 30,
        };
      }
      case 'romance_top': {
        // from above the bed: heads and shoulders only
        const c = a.center; if (!c) return null;
        const f = a.facing || 0;
        return {
          drift: 0.03, opts: { dur: 1.4, ease: 'smooth' },
          position: () => { wpos(c, pa); return mid.set(pa.x + Math.sin(f) * 1.05, pa.y + 2.3, pa.z + Math.cos(f) * 1.05); },
          target: () => { wpos(c, pa); return pb.set(pa.x + Math.sin(f) * 0.7, pa.y + 0.45, pa.z + Math.cos(f) * 0.7); },
          fov: 34,
        };
      }
      case 'ride': {
        if (!need(A)) return null;
        // side tracking shot: keeps alongside the vehicle, slightly ahead
        const side = a.side ?? 1;
        return {
          opts: { dur: 0.9, follow: 4 },
          position: () => {
            wpos(A, pa); const f = facingOf(A);
            return mid.set(pa.x + Math.cos(f) * 4.6 * side + Math.sin(f) * 1.2, pa.y + 1.7, pa.z - Math.sin(f) * 4.6 * side + Math.cos(f) * 1.2);
          },
          target: () => { wpos(A, pa); const f = facingOf(A); return pb.set(pa.x + Math.sin(f) * 0.9, pa.y + 1.0, pa.z + Math.cos(f) * 0.9); },
          fov: 36,
        };
      }
      default: return null;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Pinch (two fingers on the canvas) and wheel zoom, explore mode only.
  const el = ctx.renderer?.domElement;
  if (el) {
    const pts = new Map(); let pinch0 = 0, zoom0 = 1;
    const canZoom = () => rig.zoomEnabled && rig.mode === 'explore' && !ctx.busy?.is?.();
    el.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const [p, q] = [...pts.values()]; pinch0 = Math.hypot(p.x - q.x, p.y - q.y); zoom0 = zoomTarget; }
    });
    el.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch0 > 20 && canZoom()) {
        const [p, q] = [...pts.values()];
        zoomTarget = clamp(zoom0 * pinch0 / Math.max(20, Math.hypot(p.x - q.x, p.y - q.y)), 0.8, 1.3);
      }
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => {
      if (!canZoom() || e.ctrlKey) return;
      zoomTarget = clamp(zoomTarget * (1 + Math.sign(e.deltaY) * Math.min(0.08, Math.abs(e.deltaY) * 0.0012)), 0.8, 1.3);
    }, { passive: true });
  }

  computeExplore(0); copyPose(pose, explorePose); apply(0);
  return rig;
}
