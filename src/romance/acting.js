// Romance choreography with real bodies (actors physicality API): the home evening and the standing
// moments of dates are acted here instead of through generic pair kinds, so every pose knows the real
// furniture (sofa front, seat height, bed and mattress) and every change of pose is a visible transition
// (stand up, walk, turn, sit down, kneel) instead of a cut or a glide.
//
//   set = acting.homeSet(girl)         sofa / bed / floor geometry from World's interior plan
//   await acting.begin(sc)             both performers become "staged" (no crowd collisions, the player
//                                      controller keeps its hands off); acting.end(sc) undoes it
//   await acting.act(sc, set, id)      one ALLOWED_CHOICES id: moves both into the needed pose, then
//                                      hands / mouths / feet on the partner's body (contacts are re-evaluated
//                                      every frame, a spacing solver closes the last centimetres)
//   acting.shot(sc)                    close-up for the current pose (cams.fit from the real body points)
//   await acting.undress(sc, set)      both take their clothes off down to the underwear, animated
//   await acting.toBed(sc, set, how)   to the bed (she leads for "guide"), onto the edge, …
//   acting.intoBed(sc, set)            (behind a fade) lying under an opaque tucked blanket
//   await acting.slipOff(sc, set)      the implied moment under the sheet (garment dropped beside the bed)
//
// Limits (docs/GDD.md "Romance"): never beyond the underwear; in bed the blanket covers everything from
// the chest down and the bed cameras are clamped above it; feet actions are medium shots, never close-ups.
import * as THREE from 'three';
import { pick } from './util.js';

const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const fwdOf = f => ({ x: Math.sin(f), z: Math.cos(f) });
/** A character's right-hand side for facing f (its left is local +x). */
const rightOf = f => ({ x: -Math.cos(f), z: Math.sin(f) });
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ease = u => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const wrap = a => { a %= PI * 2; if (a > PI) a -= PI * 2; if (a < -PI) a += PI * 2; return a; };
const shuffle = list => { const l = list.slice(); for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; };

/** Which body pose each choice needs, by the pose the couple is in now. */
const FACE_ACTS = new Set(['kiss', 'hair', 'whisper', 'kiss_neck', 'lick_neck', 'ear']);
const FEET = new Set(['feet', 'kiss_feet', 'lick_feet']);

export function createActing(ctx, { clock, S, cams }) {
  const _a = V(), _b = V(), _c = V(), _d = V(), _w = V();
  const fits = new Set();
  clock.tick(dt => { for (const f of fits) solveFit(f, dt); });

  // ---- measures (same conventions as actors/pairs.js) ------------------------------------------------
  const gap = (h1, r1, p1, h2, r2, p2, dir) => { h1.surface(r1, p1, _a); h2.surface(r2, p2, _b); return _b.sub(_a).dot(dir); };
  function headOverlap(h1, h2, k = 0.86) {
    h1.head.getWorldPosition(_a); h2.head.getWorldPosition(_b);
    const r = (h1.spec.headR[0] * h1.look.height + h2.spec.headR[0] * h2.look.height) * k;
    return Math.max(0, r - _a.distanceTo(_b));
  }
  const proj = (v, d) => v.x * d.x + v.z * d.z;

  /** Spacing solver: slides h along dir from base so err() → 0 (err > 0 = move along dir). */
  function fit(sc, h, dir, err, { min = -0.2, max = 0.25, rate = 4 } = {}) {
    const f = { sc, h, base: h.object.position.clone(), dir: { x: dir.x, z: dir.z }, shift: 0, min, max, rate, err };
    fits.add(f);
    return f;
  }
  function solveFit(f, dt) {
    if (f.h.moving) return;
    let e;
    try { e = f.err(f); } catch { e = NaN; }
    if (!Number.isFinite(e)) return;
    f.shift = clamp(f.shift + clamp(e, -0.12, 0.12) * Math.min(1, f.rate * dt), f.min, f.max);
    const o = f.h.object.position;
    o.x = f.base.x + f.dir.x * f.shift; o.z = f.base.z + f.dir.z * f.shift;
  }
  const clearFits = sc => { for (const f of fits) if (f.sc === sc) fits.delete(f); };

  // ---- the set -----------------------------------------------------------------------------------------
  const blocked = (x, z, r) => {
    try { if (ctx.world?.colliders?.blocked?.(x, z, r)) return true; } catch { /* optional */ }
    return !S.walkable(x, z);
  };

  /**
   * Geometry of her home from World's interior plan (furniture local frame: +z = front; sofa backrest at
   * local −z, bed headboard at local −z). POIs are only a fallback (the sofa POI faces its backrest).
   */
  function homeSet(girl) {
    const iid = girl.home;
    const plan = ctx.world?.layout?.interiors?.[iid];
    const furn = plan?.furniture || [];
    const near = (type, p) => {
      let best = null, bd = Infinity;
      for (const f of furn) if (f.type === type) { const d = p ? (f.x - p.x) ** 2 + (f.z - p.z) ** 2 : 0; if (d < bd) { bd = d; best = f; } }
      return best;
    };
    const poi = n => S.poi(`${iid}.${n}`);
    const pSofa = poi('sofa'), pBed = poi('bed');
    const fSofa = near('sofa', pSofa), fBed = near('bed', pBed);
    const anyP = fSofa || pSofa || fBed || pBed || poi('owner') || poi('door') || { x: 0, z: 0 };
    const floorY = S.groundY(anyP.x, anyP.z);
    const set = { iid, floorY, plan, room: plan ? { x: plan.ox, z: plan.oz, w: plan.w, d: plan.d } : null };
    if (fSofa || pSofa) {
      const f = fSofa ? fSofa.rot || 0 : (pSofa.facing ?? 0);
      const c = fSofa ? { x: fSofa.x, z: fSofa.z } : { x: pSofa.x, z: pSofa.z };
      const F = fwdOf(f), R = rightOf(f);
      // buttocks a little behind the cushion centre (local z +0.06), cushion top 0.60 m, compressed a bit
      const at = (df, dr) => ({ x: c.x + F.x * df + R.x * dr, z: c.z + F.z * df + R.z * dr });
      set.sofa = { x: c.x, z: c.z, f, F, R, at, seatY: floorY + (fSofa ? 0.57 : 0.45), real: !!fSofa };
    }
    if (fBed || pBed) {
      // facing = toward the pillows (headboard at the bed's local −z)
      const f = fBed ? (fBed.rot || 0) + PI : (pBed.facing ?? PI);
      const c = fBed ? { x: fBed.x, z: fBed.z } : { x: pBed.x, z: pBed.z };
      const H = fwdOf(f);
      // the room side of the bed (the other long side is against the wall)
      let side = 1;
      const rc = set.room || { x: c.x + 3, z: c.z };
      const L1 = rightOf(f);
      if ((rc.x - c.x) * L1.x + (rc.z - c.z) * L1.z < 0) side = -1;
      const Lx = { x: L1.x * side, z: L1.z * side };                  // unit: bed centre → room side
      const at = (dh, dl) => ({ x: c.x + H.x * dh + Lx.x * dl, z: c.z + H.z * dh + Lx.z * dl });
      set.bed = { x: c.x, z: c.z, f, H, Lx, at, top: floorY + 0.64, quilt: floorY + 0.76, w: 2.0, l: 2.3, real: !!fBed };
    }
    return set;
  }

  /** Free floor near pref for a pose footprint (local [forward, right, radius] around the anchor). */
  function findSpot(pref, facing, footprint, { maxDist = 1.8, turns = [0, 0.35, -0.35, 0.7, -0.7, PI / 2, -PI / 2, PI] } = {}) {
    const ok = (x, z, f) => {
      const F = fwdOf(f), R = rightOf(f);
      for (const [df, dr, r] of footprint) if (blocked(x + F.x * df + R.x * dr, z + F.z * df + R.z * dr, r)) return false;
      return true;
    };
    for (const t of turns) if (ok(pref.x, pref.z, facing + t)) return { x: pref.x, z: pref.z, facing: facing + t };
    for (let ring = 1; ring * 0.15 <= maxDist; ring++) {
      const Rr = ring * 0.15, N = 8 + ring * 2;
      for (const t of turns.slice(0, 3)) for (let i = 0; i < N; i++) {
        const an = (i / N) * PI * 2, x = pref.x + Math.sin(an) * Rr, z = pref.z + Math.cos(an) * Rr;
        if (ok(x, z, facing + t)) return { x, z, facing: facing + t };
      }
    }
    return { x: pref.x, z: pref.z, facing, forced: true };
  }

  /** Where the floor poses happen: open floor in front of the sofa (or near her, without a sofa). */
  function floorPref(sc, set) {
    if (set.sofa) return { ...set.sofa.at(1.6, 0), facing: set.sofa.f };
    const p = S.worldPos(sc.b);
    return { x: p.x, z: p.z, facing: sc.b.object.rotation.y };
  }

  // ---- staging lifecycle ---------------------------------------------------------------------------------
  /** Both performers staged: crowd collisions off, the player controller hands-off (pair record). */
  function begin(sc) {
    if (sc.acting) return;
    const { a, b } = sc;
    const prev = a._pair || b._pair;
    if (prev && ctx.actors?.endPair && !prev.romance) {
      // a generic pair is still on: drop its contacts but keep both bodies where they are
      for (const k of ['fits', 'tweens']) if (Array.isArray(prev[k])) prev[k].length = 0;
      prev.update = null;
    }
    const rec = { kind: 'romance', romance: true, a, b, props: [], tweens: [], fits: [], update: null, opts: {}, t: 0,
      anchor: { x: a.object.position.x, z: a.object.position.z, facing: a.object.rotation.y },
      playerWasCtl: prev?.playerWasCtl ?? (ctx.player?.human === a ? ctx.player.control : true) };
    a._pair = b._pair = rec; a._partner = b; b._partner = a;
    sc.acting = { rec, collide: [a.collide, b.collide], state: 'free', fx: null };
    a.collide = false; b.collide = false;
    sc.pair = 'romance';
  }
  /** Keep endPair's restore anchor on the couple (it puts both back on free ground there). */
  function anchorHere(sc) {
    const r = sc.acting?.rec; if (!r) return;
    const pa = sc.a.object.position, pb = sc.b.object.position;
    r.anchor = { x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2, facing: sc.a.object.rotation.y };
  }
  function end(sc) {
    if (!sc.acting) return;
    release(sc, 0.3);
    stopFx(sc);
    removeBlanket(sc);
    const [ca, cb] = sc.acting.collide;
    sc.a.collide = ca; sc.b.collide = cb;
    sc.acting = null;
  }

  /** Every contact off (eased). */
  function release(sc, fade = 0.4) {
    clearFits(sc);
    for (const h of [sc.a, sc.b]) {
      try { h.clearHandTargets?.(fade); h.clearFootTargets?.(fade); h.mouthTo?.(null, { fade }); h.stopUpper?.(fade); } catch { /* optional */ }
    }
    stopFx(sc);
  }
  function stopFx(sc) { if (sc.acting?.fx) { try { sc.acting.fx(); } catch { /* */ } sc.acting.fx = null; } }
  const tick = (sc, fn) => { stopFx(sc); const off = clock.tick(fn); if (sc.acting) sc.acting.fx = off; return off; };

  // ---- moving bodies (all visible: no teleports while the screen is lit) ---------------------------------
  const race = (p, sec) => Promise.race([Promise.resolve(p).catch(() => false), clock.wait(sec)]);
  async function standUp(h) {
    if (!h.grounded) { h.setSupport?.(null); return; }
    await race(h.standUp(), 3);
  }
  /** Walk to p, then settle the last centimetres and turn to `facing`. */
  async function walkTo(h, p, facing, { speed = null } = {}) {
    await standUp(h);
    const o = h.object.position;
    if (Math.hypot(p.x - o.x, p.z - o.z) > 0.12) await race(h.moveTo(p, { stopDist: 0.06, ...(speed ? { speed } : {}) }), 6);
    const from = o.clone(), dx = p.x - from.x, dz = p.z - from.z;
    if (Math.hypot(dx, dz) > 0.005) await clock.tween(0.3, k => { o.x = from.x + dx * k; o.z = from.z + dz * k; });
    if (Number.isFinite(facing)) await race(h.face(facing, { dur: 0.45 }), 1.5);
  }
  /** Sit on the sofa seat (walks to its front, turns, sits back onto it). */
  async function sitSofa(h, set, dr, { clip = 'sit_idle', turn = 0, fwd = 0.16 } = {}) {
    const s = set.sofa, p = s.at(fwd, dr);
    if (h.grounded && h.clip !== 'sit_idle' && h.clip !== 'sit_feet') await standUp(h);
    if (h.grounded) {
      // already on the sofa: slide along the seat and turn, no standing up
      const o = h.object.position, from = o.clone(), r0 = h.object.rotation.y, dr0 = wrap(s.f + turn - r0);
      await clock.tween(0.6, k => { o.x = from.x + (p.x - from.x) * k; o.z = from.z + (p.z - from.z) * k; h.object.rotation.y = r0 + dr0 * k; });
      h.setSupport({ seatY: s.seatY, floorY: set.floorY });
      if (clip && h.clip !== clip) h.play(clip, { fade: 0.5, loop: true });
      return;
    }
    await race(h.sitOn({ x: p.x, z: p.z, y: s.seatY, facing: s.f }, { walk: true, floorY: set.floorY, clip }), 8);
    if (turn) { const r0 = h.object.rotation.y; await clock.tween(0.5, k => { h.object.rotation.y = r0 + turn * k; }); }
  }
  async function kneel(h, spot, clip = 'kneel', floorY) {
    await standUp(h);
    await race(h.kneelAt(spot, { walk: true, floorY }), 7);
    if (clip !== 'kneel') h.play(clip, { fade: 0.6, loop: true });
  }
  async function sitFloor(h, spot, clip, floorY) {
    await standUp(h);
    await race(h.sitGround(spot, { walk: true, clip, floorY }), 7);
    await clock.wait(0.6);
  }

  // ---- poses ---------------------------------------------------------------------------------------------
  /**
   * The couple's pose (state): 'sofa' side by side on the sofa (he on her right), 'stand' face to face,
   * 'knees' she sits on her heels on the floor and he kneels behind her, 'legs' she sits with her legs out
   * and he kneels at her right, 'feet' she on the sofa and he kneeling in front of her, 'bedside', 'bed'.
   */
  async function goState(sc, set, state, o = {}) {
    const st = sc.acting.state, { a, b } = sc;
    const sameSpot = st === state && !o.force;
    release(sc, 0.35);
    if (sameSpot) return;
    S.lookAt(a, b.head); S.lookAt(b, a.head, { weight: 0.7 });
    if (state === 'sofa' && set.sofa) {
      // she sits on the left cushion, he on her right; close enough to touch
      const p = [sitSofa(b, set, -0.24), (async () => { await clock.wait(0.35); await sitSofa(a, set, 0.24); })()];
      await Promise.all(p);
    } else if (state === 'stand') {
      const spot = standSpot(sc, set);
      const F = fwdOf(spot.facing);
      // she ends up where she is (or close), he in front of her
      const pb = { x: spot.x + F.x * 0.32, z: spot.z + F.z * 0.32 }, pa = { x: spot.x - F.x * 0.32, z: spot.z - F.z * 0.32 };
      await Promise.all([walkTo(b, pb, spot.facing + PI), (async () => { await clock.wait(0.25); await walkTo(a, pa, spot.facing); })()]);
    } else if (state === 'knees' || state === 'legs') {
      const pref = floorPref(sc, set);
      const knees = state === 'knees';
      // footprints: her body (and legs), his kneeling body behind / beside her
      const fp = knees ? [[0, 0, 0.3], [0.3, 0, 0.25], [-0.55, 0, 0.3], [-0.9, 0, 0.2]] : [[0, 0, 0.3], [0.5, 0, 0.22], [0.95, 0, 0.18], [0.45, -0.6, 0.3], [-0.35, 0, 0.25]];
      const spot = findSpot(pref, pref.facing, fp);
      sc.acting.floor = spot;
      const F = fwdOf(spot.facing), R = rightOf(spot.facing);
      if (knees) {
        const pa = { x: spot.x - F.x * 0.5, z: spot.z - F.z * 0.5, facing: spot.facing };
        await Promise.all([sitFloor(b, { x: spot.x, z: spot.z, facing: spot.facing }, 'sit_knees', set.floorY),
          (async () => { await clock.wait(0.5); await kneel(a, pa, 'kneel', set.floorY); })()]);
      } else {
        // he kneels on her right, facing her legs (turned toward her)
        const pa = { x: spot.x + F.x * 0.42 + R.x * 0.6, z: spot.z + F.z * 0.42 + R.z * 0.6, facing: spot.facing + PI / 2 - 0.2 };
        await Promise.all([sitFloor(b, { x: spot.x, z: spot.z, facing: spot.facing }, 'sit_legs', set.floorY),
          (async () => { await clock.wait(0.6); await kneel(a, pa, 'kneel_reach', set.floorY); })()]);
      }
    } else if (state === 'feet' && set.sofa) {
      const s = set.sofa;
      // she sits in the middle of the sofa (feet free), he kneels in front of her right foot
      // (perched a little forward: with her legs stretched out the knees clear the cushion lip, so the shins
      //  never pass through the seat front)
      const seatOn = sitSofa(b, set, -0.05, { clip: 'sit_feet', fwd: 0.16 });
      if (a.grounded && st === 'sofa') await standUp(a);
      const k = s.at(0.98, -0.12);
      await Promise.all([seatOn, (async () => { await clock.wait(0.3); await kneel(a, { ...k, facing: s.f + PI }, 'kneel_sit', set.floorY); })()]);
    }
    sc.acting.state = state;
    anchorHere(sc);
  }

  /** A free spot to stand face to face: in front of the sofa / near where they are. */
  function standSpot(sc, set) {
    let pref;
    if (sc.acting.state === 'sofa' && set.sofa) pref = { ...set.sofa.at(1.05, 0), facing: set.sofa.f + PI / 2 };
    else if (sc.acting.state === 'bedside' && set.bed) pref = { ...set.bed.at(0, 1.55), facing: Math.atan2(set.bed.H.x, set.bed.H.z) };
    else {
      const pa = S.worldPos(sc.a), pb = S.worldPos(sc.b);
      pref = { x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2, facing: Math.atan2(pb.x - pa.x, pb.z - pa.z) };
    }
    const fp = [[0, 0, 0.3], [0.35, 0, 0.26], [-0.35, 0, 0.26]];
    return findSpot(pref, pref.facing, fp, { turns: [0, 0.4, -0.4, 0.8, -0.8, PI / 2, -PI / 2] });
  }

  /** Contacts for one choice in the current state. Returns nothing; the pose keeps living until release. */
  function contacts(sc, set, id) {
    const { a, b } = sc, st = sc.acting.state;
    const fade = 0.55;
    const axis = new THREE.Vector3();
    const ax = () => { a.object.getWorldPosition(_c); b.object.getWorldPosition(_d); axis.set(_d.x - _c.x, 0, _d.z - _c.z).normalize(); return axis; };
    const look = (h, t, w = 1) => S.lookAt(h, t, { weight: w });
    const expr = (h, e) => S.expr(h, e, { dur: 0.45 });

    if (st === 'sofa') {
      // side by side, he on her right: her right side and his left side face each other
      const toHer = { x: -set.sofa.R.x, z: -set.sofa.R.z };
      const sofaFit = (err, o) => fit(sc, a, toHer, err, { min: -0.06, max: 0.16, rate: 3, ...o });
      if (id === 'kiss') {
        turnSeated(sc, 0.72);
        a.touch('L', b, 'cheek_R', { el: -0.25 }, { fade, fingers: 'up', press: 0.004 });
        b.touch('R', a, 'neck', { u: 0.45, a: PI / 2 + 0.6 }, { fade, elbow: 'down' });
        kissMouths(sc, 0.8);
        sofaFit(() => proj(a.reachVec.mouth, toHer) - proj(b.reachVec.mouth, toHer) - 3 * headOverlap(a, b, 0.8));
        look(a, b, 0.3); look(b, a, 0.3); expr(a, 'kiss'); expr(b, 'kiss');
      } else if (id === 'hair') {
        turnSeated(sc, 0.25);
        // his palm runs from the top of her head down the back of her hair, lifts off and starts again
        a.touch('L', b, 'head', { el: 0.95, az: -PI / 2 - 0.5, hair: true }, {
          fade: 0.6, fingers: 'down', elbow: 'down',
          slide: t => {
            const u = (t / 3.2) % 1, e = ease(Math.min(1, u / 0.72));
            if (u <= 0.72) return { el: 0.95 - 1.05 * e, az: -PI / 2 - 0.5 - 0.35 * e, lift: 0.003 };
            const r = (u - 0.72) / 0.28;
            return { el: -0.1 + 1.05 * r, az: -PI / 2 - 0.85 + 0.35 * r, lift: 0.003 + 0.05 * Math.sin(PI * r) };
          },
        });
        sofaFit(() => proj(a.reachVec.L, toHer) - 4 * headOverlap(a, b, 1.6), { max: 0.12 });
        look(a, b); look(b, a, 0.4); expr(a, 'smile'); expr(b, 'closed');
      } else if (id === 'whisper' || id === 'ear' || id === 'kiss_neck' || id === 'lick_neck') {
        turnSeated(sc, id === 'whisper' ? 0.3 : 0.42);
        const ear = id === 'ear', wh = id === 'whisper', lick = id === 'lick_neck';
        // his near arm around her: palm on her upper back (her far side); hers in his hair (neck) or on his chest
        a.touch('L', b, 'torso', { u: 0.84, a: PI - 0.65 }, { fade, press: 0.005, elbow: 'down' });
        if (ear || wh) b.touch('R', a, 'torso', { u: 0.62, a: PI / 2 - 0.35 }, { fade: 0.7, press: 0.004 });
        else b.touch('R', a, 'head', { el: 0.45, az: PI / 2 + 0.5, hair: true }, { fade: 0.8, fingers: 'up', elbow: 'down', slide: t => ({ el: 0.45 + 0.12 * Math.sin(t * 0.8), lift: 0.004 }) });
        const region = ear || wh ? 'ear_R' : 'neck_R';
        a.mouthTo({
          human: b, region, offset: wh ? 0.03 : ear ? 0.004 : 0.006,
          slide: ear || wh ? null : lick
            ? t => { const u = (t / 2.6) % 1; return { u: 0.15 + 0.6 * ease(Math.min(1, u / 0.8)), a: -PI / 2 - 0.25, lift: u > 0.8 ? 0.02 * Math.sin(PI * (u - 0.8) / 0.2) : 0.0 }; }
            : t => ({ u: 0.35 + 0.15 * Math.sin(t * 0.7), a: -PI / 2 - 0.25 + 0.15 * Math.sin(t * 0.5), lift: 0.01 * Math.max(0, Math.sin(t * 2.2)) }),
        }, { fade: 0.7, weight: wh ? 0.85 : 1 });
        sofaFit(() => proj(a.reachVec.mouth, toHer) - 3 * headOverlap(a, b, ear || wh ? 0.72 : 0.55), { max: 0.22 });
        // she tilts her head away (offers the neck) or turns a little toward him (whisper)
        if (!wh) { const away = b.head.getWorldPosition(V()); away.x -= set.sofa.R.x * 0.7; away.z -= set.sofa.R.z * 0.7; away.y += 0.3; look(b, away, 0.6); }
        else look(b, a, 0.3);
        look(a, null);
        expr(a, ear ? 'grin' : wh ? 'smug' : 'closed'); expr(b, ear ? 'laugh' : wh ? 'blush' : 'closed');
      }
    } else if (st === 'stand') {
      const toHer = ax().clone();
      const chests = () => Math.max(0, -gap(a, 'chest', { u: 0.68 }, b, 'chest', { u: 0.68 }, toHer));
      const standFit = (err, o) => fit(sc, a, toHer, err, { min: -0.22, max: 0.22, ...o });
      if (id === 'kiss') {
        a.touch('L', b, 'torso', { u: 0.24, a: -PI / 2 - 0.35 }, { fade });
        a.touch('R', b, 'torso', { u: 0.24, a: PI / 2 + 0.35 }, { fade });
        b.touch('L', a, 'neck', { u: 0.4, a: -PI + 0.9 }, { fade, elbow: 'down' });
        b.touch('R', a, 'neck', { u: 0.4, a: PI - 0.9 }, { fade, elbow: 'down' });
        a.play('kiss_lean', { fade: 0.6, loop: true }); b.play('kiss_receive', { fade: 0.6, loop: true });
        kissMouths(sc, 0.75);
        standFit(() => proj(a.reachVec.mouth, toHer) - proj(b.reachVec.mouth, toHer) - 3 * headOverlap(a, b, 0.8) - 2 * chests());
        look(a, b, 0.3); look(b, a, 0.3); expr(a, 'kiss'); expr(b, 'kiss');
      } else if (id === 'hug') {
        a.play('hug', { fade: 0.6, loop: true }); b.play('hug_high', { fade: 0.6, loop: true });
        a.touch('L', b, 'torso', { u: 0.42, a: -PI + 0.75 }, { fade, slide: t => ({ u: 0.42 + 0.03 * Math.sin(t * 0.9) }) });
        a.touch('R', b, 'torso', { u: 0.7, a: PI - 0.7 }, { fade, slide: t => ({ u: 0.7 + 0.03 * Math.sin(t * 0.8 + 1) }) });
        b.touch('L', a, 'torso', { u: 0.98, a: -PI + 0.55 }, { fade, elbow: 'down' });
        b.touch('R', a, 'torso', { u: 0.98, a: PI - 0.55 }, { fade, elbow: 'down' });
        standFit(() => gap(a, 'chest', { u: 0.68 }, b, 'chest', { u: 0.68 }, toHer) + 0.004 - 2 * headOverlap(a, b, 0.75), { min: -0.2, max: 0.18 });
        look(a, null); look(b, null); expr(a, 'closed'); expr(b, 'blush');
      } else if (id === 'hair') {
        b.play('shy', { fade: 0.6, loop: true }); a.play('stroke', { layer: 'upper', fade: 0.5, loop: true });
        a.touch('R', b, 'head', { el: 0.7, az: PI / 2 - 0.15, hair: true }, {
          fade: 0.6, fingers: 'down', elbow: 'down',
          slide: t => { const u = (t / 3) % 1, e = ease(Math.min(1, u / 0.72)); if (u <= 0.72) return { el: 0.75 - e, az: PI / 2 - 0.15 + 0.4 * e, lift: 0.003 }; const r = (u - 0.72) / 0.28; return { el: -0.25 + r, az: PI / 2 + 0.25 - 0.4 * r, lift: 0.003 + 0.05 * Math.sin(PI * r) }; },
        });
        a.touch('L', b, 'waist_R', {}, { fade });
        standFit(() => proj(a.reachVec.R, toHer) - 4 * headOverlap(a, b, 1.35) - 2 * Math.max(0, 0.08 - gap(a, 'chest', { u: 0.68 }, b, 'chest', { u: 0.68 }, toHer)), { min: -0.15, max: 0.15 });
        look(a, b); look(b, a, 0.4); expr(a, 'smile'); expr(b, 'closed');
      } else {
        // neck / ear / whisper standing: he leans to her right side, hands on her waist
        const ear = id === 'ear', wh = id === 'whisper', lick = id === 'lick_neck';
        a.play(wh ? 'whisper' : 'lean_neck', { fade: 0.6, loop: true }); b.play(ear || wh ? 'shy' : 'tilt_away', { fade: 0.6, loop: true });
        if (!wh) { a.touch('L', b, 'torso', { u: 0.24, a: -PI / 2 - 0.35 }, { fade }); a.touch('R', b, 'torso', { u: 0.24, a: PI / 2 + 0.35 }, { fade }); }
        else b.touch('L', a, 'torso', { u: 0.7, a: -0.5 }, { fade });
        a.mouthTo({
          human: b, region: ear || wh ? 'ear_R' : 'neck_R', offset: wh ? 0.03 : ear ? 0.004 : 0.006,
          slide: ear || wh ? null : lick ? t => { const u = (t / 2.6) % 1; return { u: 0.15 + 0.6 * ease(Math.min(1, u / 0.8)), a: -PI / 2 - 0.25 }; } : t => ({ u: 0.35 + 0.15 * Math.sin(t * 0.7), a: -PI / 2 - 0.25 + 0.15 * Math.sin(t * 0.5) }),
        }, { fade: 0.7, weight: wh ? 0.85 : 1 });
        standFit(() => proj(a.reachVec.mouth, toHer) - 3 * headOverlap(a, b, 0.7) - 2 * chests(), { min: -0.2, max: 0.22 });
        look(a, null); look(b, wh ? a : null, 0.3);
        expr(a, ear ? 'grin' : wh ? 'smug' : 'closed'); expr(b, ear ? 'laugh' : wh ? 'blush' : 'closed');
      }
    } else if (st === 'knees') {
      const F = fwdOf(sc.acting.floor.facing);
      // shoulders: kneeling upright behind her; back: sitting back on his heels, closer and lower
      const want = id === 'back' ? 'kneel_sit' : 'kneel';
      if (a.clip !== want) a.play(want, { fade: 0.7, loop: true });
      a.play('massage', { layer: 'upper', fade: 0.5, loop: true });
      for (const [s, k, ph] of [['L', 1, 0], ['R', -1, PI]]) {
        if (id === 'back') {
          a.touch(s, b, 'torso', { u: 0.5, a: PI - 0.38 * k }, {
            fade: 0.5, fingers: 'up', press: 0.008,
            slide: t => ({ u: 0.45 + 0.28 * Math.sin(t * 0.55 + ph * 0.25) + 0.03 * Math.sin(t * 4 + ph), a: PI - k * (0.38 + 0.06 * Math.cos(t * 4 + ph)), lift: 0.003 * (1 + Math.sin(t * 4 + ph)) }),
          });
        } else {
          a.touch(s, b, `shoulder_${s}`, { u: 0.55 }, {
            fade: 0.5, press: 0.008,
            slide: t => ({ u: 0.5 + 0.14 * Math.sin(t * 0.7 + ph * 0.2) + 0.04 * Math.sin(t * 4.2 + ph), lift: 0.004 * (1 + Math.sin(t * 4.2 + ph)) }),
          });
        }
      }
      fit(sc, a, F, () => (proj(a.reachVec.L, F) + proj(a.reachVec.R, F)) * 0.5 - 3 * Math.max(0, 0.035 - gap(a, 'chest', { u: 0.6 }, b, 'back', { u: 0.6 }, F)) - 2 * headOverlap(a, b, 1.0), { min: -0.2, max: 0.25 });
      look(a, b, 0.5); look(b, null); expr(a, 'smile'); expr(b, 'closed');
    } else if (st === 'legs') {
      const sp = sc.acting.floor, R = rightOf(sp.facing);
      const leg = ph => t => {
        const u = 0.5 + 0.5 * Math.sin(t * 0.6 + ph), l = 0.003 * (1 + Math.sin(t * 4 + ph));
        return u < 0.5 ? { region: 'thigh_R', u: 0.4 + u * 1.1, a: 0.3, lift: l } : { region: 'shin_R', u: (u - 0.5) * 1.3, a: 0.25, lift: l };
      };
      a.touch('L', b, 'thigh_R', {}, { fade: 0.5, slide: leg(0), press: 0.006 });
      a.touch('R', b, 'thigh_R', {}, { fade: 0.5, slide: leg(0.9), press: 0.006 });
      fit(sc, a, { x: -R.x, z: -R.z }, () => (proj(a.reachVec.L, { x: -R.x, z: -R.z }) + proj(a.reachVec.R, { x: -R.x, z: -R.z })) * 0.5, { min: -0.25, max: 0.3 });
      look(a, b, 0.5); look(b, a, 0.7); expr(a, 'smile'); expr(b, 'blush');
    } else if (st === 'feet') {
      const s = set.sofa, F = s.F, toHer = { x: -F.x, z: -F.z };
      // his knees never go into the sofa front (local +0.45, plus the knee's own thickness)
      const kneesOut = () => { let m = 0; for (const k of ['knee_L', 'knee_R']) { a.surface(k, {}, _a); m = Math.max(m, 0.53 - ((_a.x - s.x) * F.x + (_a.z - s.z) * F.z)); } return 3 * m; };
      if (id === 'feet') {
        // her right foot on his lap; one palm under the sole, the thumb working the instep
        b.setFootTarget('R', { human: a, region: 'lap_L', params: { u: 0.62 } }, { fade: 1.0 });
        a.touch('L', b, 'foot_R', { sole: true }, { fade: 0.7, press: 0.006, elbow: 'down', slide: t => ({ lift: 0.002 * (1 + Math.sin(t * 3)) }) });
        a.touch('R', b, 'foot_R', { u: 0.45 }, { fade: 0.7, press: 0.006, slide: t => ({ u: 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(t * 1.3)), lift: 0.003 * (1 + Math.sin(t * 4.5)) }) });
        fit(sc, a, toHer, () => -proj(b.reachVec.footR, toHer) + (proj(a.reachVec.L, toHer) + proj(a.reachVec.R, toHer)) * 0.15 - kneesOut(), { min: -0.3, max: 0.3 });
        look(a, b, 0.7); look(b, a, 0.8); expr(a, 'smile'); expr(b, 'smile');
      } else {
        // she lifts her right foot toward him; he cradles it (heel in one palm, the other on the ankle) and kisses
        // it — every time in a different order between the top of the foot, the toes and the ankle (no menu)
        const lick = id === 'lick_feet';
        const q = s.at(0.74, -0.12), spot = V(q.x, s.seatY + 0.12, q.z);
        b.setFootTarget('R', spot, { fade: 1.0, normal: V(-F.x, 1.3, -F.z).normalize() });
        a.touch('L', b, 'foot_R', { sole: true }, { fade: 0.7, press: 0.006, elbow: 'down' });
        a.touch('R', b, 'foot_R', { u: 0.04 }, { fade: 0.7, press: 0.006, elbow: 'down' });
        a.mouthTo({ human: b, region: 'foot_R', offset: 0.008, slide: footPath(lick) }, { fade: 0.9 });
        fit(sc, a, toHer, () => proj(a.reachVec.mouth, toHer) * 0.7 + (proj(a.reachVec.L, toHer) + proj(a.reachVec.R, toHer)) * 0.15 - kneesOut(), { min: -0.3, max: 0.32 });
        look(a, null); look(b, a, 0.8); expr(a, lick ? 'grin' : 'kiss'); expr(b, lick ? 'laugh' : 'smile');
      }
    }
  }

  /** Mouths meet halfway (each stops just before the middle point). */
  function kissMouths(sc, wb = 0.75) {
    const { a, b } = sc;
    const mid = (h, other, out) => { h.surface('mouth', {}, out); other.surface('mouth', {}, _w); _d.subVectors(_w, out); const L = _d.length(); out.addScaledVector(_d, L > 0.012 ? (L - 0.012) / (2 * L) : 0); return out; };
    a.mouthTo(out => mid(a, b, out), { fade: 0.7 });
    b.mouthTo(out => mid(b, a, out), { weight: wb, fade: 0.7 });
  }

  /**
   * Kisses / licks on her foot. Each call builds a fresh random order of spots among the top of the foot
   * (instep), the toes and the ankle; the mouth lifts off a little between them. Licks travel slowly along
   * the foot. No menu, no close-up: the camera stays on a medium shot.
   */
  function footPath(lick) {
    const SPOTS = { instep: 0.5, toes: 0.93, ankle: 0.1 };
    const order = shuffle(['instep', 'toes', 'ankle']);
    const seq = [];
    for (let r = 0; r < 4; r++) for (const k of (r ? shuffle(order) : order)) if (seq[seq.length - 1] !== SPOTS[k]) seq.push(SPOTS[k]);
    const T = lick ? 3.0 : 2.4;
    return t => {
      const i = Math.floor(t / T), u = (t % T) / T;
      const s0 = seq[i % seq.length], s1 = seq[(i + 1) % seq.length];
      if (lick) {
        // a slow lick toward the next spot, then a lift
        const e = ease(clamp(u / 0.75, 0, 1));
        return { u: s0 + (s1 - s0) * e, lift: u > 0.75 ? 0.035 * Math.sin(PI * (u - 0.75) / 0.25) : 0.0 };
      }
      // a kiss (hold), lift off, move to the next spot
      const e = ease(clamp((u - 0.6) / 0.4, 0, 1));
      return { u: s0 + (s1 - s0) * e, lift: 0.04 * Math.sin(PI * e) + (u < 0.12 ? 0.02 * (1 - u / 0.12) : 0) };
    };
  }

  /** Seated: both turn their shoulders toward each other (body yaw, the hips stay on the seat). */
  function turnSeated(sc, amt) {
    const s = sc.set?.sofa; if (!s) return;
    const { a, b } = sc;
    const ta = s.f + amt, tb = s.f - amt;             // he turns to his left, she to her right
    const ra = a.object.rotation.y, rb = b.object.rotation.y, da = wrap(ta - ra), db = wrap(tb - rb);
    if (Math.abs(da) + Math.abs(db) < 0.01) return;
    clock.tween(0.7, k => { a.object.rotation.y = ra + da * k; b.object.rotation.y = rb + db * k; });
  }

  /** The state a choice needs, from the current one. */
  function stateFor(sc, set, id) {
    const st = sc.acting.state;
    if (FEET.has(id)) return set.sofa ? 'feet' : 'stand';
    if (id === 'shoulders' || id === 'back') return 'knees';
    if (id === 'legs') return 'legs';
    if (id === 'hug') return 'stand';
    if (FACE_ACTS.has(id)) return st === 'stand' || !set.sofa ? 'stand' : 'sofa';
    return st;
  }

  /** Act a choice: transition into its pose, then the contacts. */
  async function act(sc, set, id) {
    sc.set = set;
    const want = stateFor(sc, set, id);
    if (want !== sc.acting.state) shotTransition(sc, set, want);
    await goState(sc, set, want);
    contacts(sc, set, id);
    sc.acting.last = id;
    await clock.wait(0.3);
  }

  // ---- undressing (animated, down to the underwear) ---------------------------------------------------
  async function undress(sc, set, { color = null } = {}) {
    const { a, b } = sc;
    if (b.outfit === 'underwear' && a.outfit === 'underwear') return;
    if (sc.acting.state !== 'stand' && sc.acting.state !== 'bedside') await goState(sc, set, 'stand');
    release(sc, 0.3);
    S.lookAt(a, b.head); S.lookAt(b, a.head);
    fullShot(sc, { dur: 1.0 });
    S.expr(b, 'shy');
    a.prepareOutfit?.('underwear'); b.prepareOutfit?.('underwear', { color });
    await clock.wait(0.5);
    // she starts, he follows a moment later; the pose and gaze carry through the outfit swaps
    const pb = race(b.undress({ animate: true, color }), 9);
    await clock.wait(0.9);
    const pa = race(a.undress({ animate: true }), 9);
    await Promise.all([pb, pa]);
    if (b.outfit !== 'underwear') b.setOutfit('underwear', { color });
    if (a.outfit !== 'underwear') a.setOutfit('underwear');
    S.expr(b, 'blush'); S.expr(a, 'smile');
    S.lookAt(a, b.head); S.lookAt(b, a.head);
    // she steps closer and rests her hands on his chest
    b.touch('L', a, 'chest', { a: 0.35, u: 0.72 }, { fade: 0.8 });
    b.touch('R', a, 'chest', { a: -0.35, u: 0.72 }, { fade: 0.8 });
    a.touch('L', b, 'waist_R', {}, { fade: 0.8 }); a.touch('R', b, 'waist_L', {}, { fade: 0.8 });
    const toHer = V().subVectors(b.object.position, a.object.position).setY(0).normalize();
    fit(sc, a, toHer, () => (proj(b.reachVec.L, toHer) + proj(b.reachVec.R, toHer)) * -0.5 + (proj(a.reachVec.L, toHer) + proj(a.reachVec.R, toHer)) * 0.5 - 2 * Math.max(0, 0.06 - gap(a, 'chest', { u: 0.68 }, b, 'chest', { u: 0.68 }, toHer)), { min: -0.15, max: 0.15 });
    sc.undressed = true;
  }
  /** Back into the clothes: animated when standing, else an instant swap (call behind a fade). */
  async function dress(sc, { animate = false } = {}) {
    for (const h of [sc.a, sc.b]) { try { if (h.outfit && h.outfit !== 'clothes') await (animate ? race(h.dress({ animate: true }), 6) : h.dress({ animate: false })); } catch { /* optional */ } }
    sc.undressed = false;
  }

  // ---- the bed -------------------------------------------------------------------------------------------
  /** Walk to the bed (hand in hand, or she leads him for "Lasciati guidare da lei…"), stand by it. */
  async function toBed(sc, set, how) {
    const { a, b } = sc;
    const B = set.bed;
    release(sc, 0.3);
    await Promise.all([standUp(a), standUp(b)]);
    const faceBed = Math.atan2(-B.Lx.x, -B.Lx.z);
    const pb = B.at(0.05, 1.3), pa = B.at(-0.05, 1.95);
    if (how === 'guide') {
      // her right hand back toward him, his left hand closes on hers
      b.play('lead_hand', { layer: 'upper', fade: 0.5, loop: true }); a.play('follow_hand', { layer: 'upper', fade: 0.5, loop: true });
      b.setHandTarget('R', out => { a.bonePos('shoulder_L', out); b.bonePos('shoulder_R', _w); out.add(_w).multiplyScalar(0.5); out.y -= 0.5 * a.look.height; return out; }, { fade: 0.6 });
      a.touch('L', b, 'hand_R', {}, { fade: 0.7, press: 0.006 });
      S.expr(b, 'smug'); S.expr(a, 'blush');
      S.lookAt(b, a.head, { weight: 0.5 }); S.lookAt(a, b.head);
    } else {
      b.play('hold_hand_L', { layer: 'upper', fade: 0.5, loop: true }); a.play('hold_hand_R', { layer: 'upper', fade: 0.5, loop: true });
      b.setHandTarget('L', out => { a.bonePos('shoulder_R', out); b.bonePos('shoulder_L', _w); out.add(_w).multiplyScalar(0.5); out.y -= 0.5 * a.look.height; return out; }, { fade: 0.6 });
      a.touch('R', b, 'hand_L', {}, { fade: 0.7, press: 0.006 });
      S.lookAt(b, a.head, { weight: 0.4 }); S.lookAt(a, b.head, { weight: 0.4 });
    }
    walkShot(sc);
    await Promise.all([walkTo(b, pb, faceBed + PI, { speed: 0.95 }), (async () => { await clock.wait(0.35); await walkTo(a, pa, faceBed, { speed: 0.95 }); })()]);
    release(sc, 0.4);
    sc.acting.state = 'bedside';
    anchorHere(sc);
  }

  /** Sit on the edge of the bed side by side (she pulls him down next to her). */
  async function sitBedEdge(sc, set) {
    const { a, b } = sc, B = set.bed;
    release(sc, 0.4);                                     // (hands off: the undress embrace / fits end here)
    const out = Math.atan2(B.Lx.x, B.Lx.z);
    const sb = B.at(0.25, 0.8), sa = B.at(-0.3, 0.8);
    walkShot(sc);
    // on top of the quilt (the bed's own duvet reaches the edge), feet on the floor
    await Promise.all([race(b.sitOn({ ...sb, y: B.quilt, facing: out }, { walk: true, floorY: set.floorY }), 7),
      (async () => { await clock.wait(0.5); await race(a.sitOn({ ...sa, y: B.quilt, facing: out }, { walk: true, floorY: set.floorY }), 7); })()]);
    S.lookAt(a, b.head); S.lookAt(b, a.head);
    b.touch('R', a, 'knee_L', {}, { fade: 0.8 });
    sc.acting.state = 'bededge';
  }

  /**
   * Lying side by side under the blanket (call while the screen is black). She lies on the room side. The
   * blanket is opaque, double-sided, drapes over every edge to near the floor and its surface is lifted
   * above every body point it covers, from the chest down.
   */
  function intoBed(sc, set) {
    const { a, b } = sc, B = set.bed;
    release(sc, 0);
    const y = B.quilt;
    for (const [h, dl] of [[b, 0.33], [a, -0.33]]) {
      const p = B.at(-0.1, dl);
      h.lieOn({ x: p.x, z: p.z, y, facing: B.f });
    }
    // settle the clips, then slide each body so the head rests on the pillow
    for (let i = 0; i < 3; i++) { try { a.update(0.2); b.update(0.2); } catch { /* */ } }
    for (const [h, dl] of [[b, 0.33], [a, -0.33]]) {
      h.head.getWorldPosition(_a);
      const along = (_a.x - B.x) * B.H.x + (_a.z - B.z) * B.H.z;          // head centre along the bed axis
      const want = 0.7;                                                     // pillow centre (local z −0.78)
      const d = want - along, o = h.object.position;
      o.x += B.H.x * d; o.z += B.H.z * d;
      const lat = (_a.x - B.x) * B.Lx.x + (_a.z - B.z) * B.Lx.z;
      o.x += B.Lx.x * (dl - lat) * 0.5; o.z += B.Lx.z * (dl - lat) * 0.5;
      h.setSupport({ lieY: y, floorY: y });
    }
    for (let i = 0; i < 2; i++) { try { a.update(0.1); b.update(0.1); } catch { /* */ } }
    S.lookAt(a, b.head); S.lookAt(b, a.head);
    S.expr(a, 'smile'); S.expr(b, 'blush');
    buildBlanket(sc, set);
    sc.acting.state = 'bed';
    anchorHere(sc);
  }

  // ---- blanket ---------------------------------------------------------------------------------------------
  function buildBlanket(sc, set) {
    removeBlanket(sc);
    const B = set.bed, { a, b } = sc;
    const W = B.w + 0.5, Lz = B.l + 0.3;                 // overhang on both long sides and at the foot
    const nx = 34, nz = 30;
    // the top edge: just above the collarbones of the higher one (covers everything from the chest down)
    let edge = -Infinity;
    for (const h of [a, b]) { h.surface('torso', { u: 0.88, a: 0 }, _a); edge = Math.max(edge, (_a.x - B.x) * B.H.x + (_a.z - B.z) * B.H.z); }
    if (!Number.isFinite(edge)) edge = 0.45;
    const foot = -B.l / 2 - 0.12;                         // past the foot end
    // body height field: many surface samples of both bodies (local bed coords: h along the head axis, l lateral)
    const samples = [];
    const add = (h, region, params) => { h.surface(region, params, _a); samples.push([(_a.x - B.x) * B.H.x + (_a.z - B.z) * B.H.z, (_a.x - B.x) * B.Lx.x + (_a.z - B.z) * B.Lx.z, _a.y]); };
    for (const h of [a, b]) {
      for (let u = 0; u <= 1.001; u += 0.125) for (let k = 0; k < 8; k++) add(h, 'torso', { u, a: (k / 8) * PI * 2 });
      for (const s of ['L', 'R']) {
        for (const lim of ['thigh_', 'shin_', 'upperarm_', 'forearm_']) for (let u = 0; u <= 1.001; u += 0.25) for (let k = 0; k < 4; k++) add(h, lim + s, { u, a: (k / 4) * PI * 2 });
        for (let u = 0; u <= 1.001; u += 0.5) add(h, 'foot_' + s, { u });
        add(h, 'palm_' + s, {});
        add(h, 'shoulder_' + s, { u: 0.9 });
      }
    }
    for (let i = samples.length - 1; i >= 0; i--) if (samples[i][0] > edge + 0.06) samples.splice(i, 1);
    const base = B.quilt + 0.04;
    const g = new THREE.PlaneGeometry(W, Lz, nx, nz);
    g.rotateX(-PI / 2);                                  // x = lateral, z = along (−z = head end after flip below)
    const pos = g.attributes.position, n = pos.count;
    const loc = new Float32Array(n * 2), stat = new Float32Array(n);
    const col = new Float32Array(n * 3);
    const cream = new THREE.Color('#fbeedd'), rose = new THREE.Color(sc.girl?.color || '#f4a7b9').lerp(new THREE.Color('#ffffff'), 0.55), sheet = new THREE.Color('#ffffff'), c = new THREE.Color();
    const hw = B.w / 2;
    for (let i = 0; i < n; i++) {
      const lx = pos.getX(i);                            // lateral (−W/2..W/2)
      const lz = pos.getZ(i);                            // −Lz/2..Lz/2 → map to bed axis h from foot..edge
      const hh = foot + (lz + Lz / 2) / Lz * (edge - foot) * 1.0;
      loc[i * 2] = hh; loc[i * 2 + 1] = lx;
      // the body underneath, softened (a quilt does not follow every bump)
      let top = base;
      for (const [sh, sl, sy] of samples) {
        const d2 = (sh - hh) ** 2 + (sl - lx) ** 2;
        if (d2 < 0.06) top = Math.max(top, sy + 0.05 - d2 * 0.9);
      }
      // drape over the long sides and the foot end, down to near the floor (tucked: no gap to look under)
      const over = Math.max(0, Math.abs(lx) - hw), overF = Math.max(0, foot + 0.12 - hh);
      let y = top;
      if (over > 0) y = Math.min(y, B.quilt + 0.02) - Math.min(B.quilt - set.floorY - 0.12, over * 4.2);
      if (overF > 0) y = Math.min(y, B.quilt + 0.02) - Math.min(B.quilt - set.floorY - 0.12, overF * 4.2);
      y += 0.006 * Math.sin(lx * 13) * Math.sin(hh * 11);
      stat[i] = y;
      const fold = edge - hh < 0.12;
      const quilt = (Math.floor((lx + 5) / 0.28) + Math.floor((hh + 5) / 0.28)) % 2;
      c.copy(fold ? sheet : quilt ? cream : rose);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = ctx.toon?.matUnique ? ctx.toon.matUnique('#ffffff', { vertexColors: true, side: THREE.DoubleSide })
      : new THREE.MeshToonMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.side = THREE.DoubleSide; mat.transparent = false; mat.opacity = 1; mat.depthWrite = true;
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'romance-blanket'; mesh.userData.noOcclude = true;
    mesh.frustumCulled = false;
    const grp = new THREE.Group(); grp.name = 'romance-blanket'; grp.add(mesh);
    ctx.scene.add(grp);
    const apply = (bulge) => {
      for (let i = 0; i < n; i++) {
        const hh = loc[i * 2], lx = loc[i * 2 + 1];
        let y = stat[i];
        if (bulge) { const d2 = (bulge.h - hh) ** 2 + (bulge.l - lx) ** 2; if (d2 < 0.05 && Math.abs(lx) < hw + 0.05) y = Math.max(y, bulge.y + 0.05 - d2 * 1.2); }
        // world position: bed centre + H * hh + Lx * lx
        pos.setXYZ(i, B.x + B.H.x * hh + B.Lx.x * lx, y, B.z + B.H.z * hh + B.Lx.z * lx);
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
    };
    apply(null);
    g.computeBoundingSphere();
    try { ctx.toon?.outline?.(grp, { width: 0.012 }); } catch { /* optional */ }
    sc.acting.blanket = { grp, mesh, apply, edge, B, dispose() { grp.removeFromParent(); g.dispose(); mat.dispose?.(); grp.traverse(o => { if (o !== mesh && o.geometry) o.geometry.dispose(); }); } };
    return sc.acting.blanket;
  }
  function removeBlanket(sc) { const bl = sc.acting?.blanket; if (bl) { bl.dispose(); sc.acting.blanket = null; } }

  // ---- the implied moment under the sheet ---------------------------------------------------------------
  /**
   * She slips her underwear off UNDER the blanket: only a hand / shoulder movement shows as a bulge that
   * travels under the quilt, then the garment slides out from under the drape on the room side and falls on
   * the floor beside the bed, where it stays. Her body keeps its underwear geometry (nothing is ever
   * rendered under the blanket); cameras stay on faces/shoulders and the floor beside the bed.
   */
  async function slipOff(sc, set, { color = null } = {}) {
    const { b } = sc, B = set.bed, bl = sc.acting.blanket;
    if (!bl) return;
    const side = 'R';
    // which of her hands is on the room side: her left is local +x
    b.object.getWorldQuaternion(new THREE.Quaternion());
    const leftW = V(1, 0, 0).applyQuaternion(b.object.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    const hand = leftW.x * B.Lx.x + leftW.z * B.Lx.z > 0 ? 'L' : 'R';
    void side;
    // path under the quilt (bed local h/l): hip → down the thigh → back up → out to the edge on the room side
    b.surface('torso', { u: 0.12, a: 0 }, _a);
    const hip = { h: (_a.x - B.x) * B.H.x + (_a.z - B.z) * B.H.z, l: (_a.x - B.x) * B.Lx.x + (_a.z - B.z) * B.Lx.z, y: _a.y };
    const keys = [
      [0.0, hip.h, hip.l + 0.12, 0],
      [0.25, hip.h - 0.25, hip.l + 0.14, 0],
      [0.45, hip.h - 0.5, hip.l + 0.12, 0],
      [0.6, hip.h - 0.3, hip.l + 0.18, 0],
      [0.8, Math.min(hip.h, 0.05) - 0.25, B.w / 2 - 0.06, -0.02],
      [1.0, Math.min(hip.h, 0.05) - 0.25, B.w / 2 + 0.04, -0.12],
    ];
    const at = (k) => {
      let i = 0; while (i < keys.length - 2 && keys[i + 1][0] < k) i++;
      const [k0, h0, l0, y0] = keys[i], [k1, h1, l1, y1] = keys[i + 1];
      const e = ease(clamp((k - k0) / (k1 - k0), 0, 1));
      return { h: h0 + (h1 - h0) * e, l: l0 + (l1 - l0) * e, dy: y0 + (y1 - y0) * e };
    };
    const target = V();
    let k = 0;
    const handTarget = out => { const q = at(k); out.set(B.x + B.H.x * q.h + B.Lx.x * q.l, hip.y + 0.02 + q.dy, B.z + B.H.z * q.h + B.Lx.z * q.l); return out; };
    b.setHandTarget(hand, handTarget, { fade: 0.5, fingers: 'down' });
    S.expr(b, 'smug');
    const dur = 4.2;
    tick(sc, () => {
      handTarget(target);
      const q = at(k);
      bl.apply(Math.abs(q.l) < B.w / 2 ? { h: q.h, l: q.l, y: Math.max(target.y, B.quilt - 0.02) } : null);
    });
    await clock.tween(dur, u => { k = u; }, t => t);
    // the garment slides out from under the drape and drops beside the bed
    const garment = buildGarment(color || b.look?.bottom?.color || sc.girl?.underwear || sc.girl?.color || '#ff8fb8');
    const land = landingSpot(set, hip.h);
    const startH = (land.x - B.x) * B.H.x + (land.z - B.z) * B.H.z;
    const start = B.at(startH + 0.05, B.w / 2 + 0.2);
    const y0 = B.quilt - 0.3, y1 = set.floorY + 0.012;
    garment.object.position.set(start.x, y0, start.z);
    const yaw = Math.atan2(B.Lx.x, B.Lx.z) + (Math.random() - 0.5) * 0.8;
    garment.object.rotation.set(-0.9, yaw, 0.3);
    ctx.scene.add(garment.object);
    sc.extras?.push(garment);
    b.setHandTarget(hand, null, { fade: 0.8 });
    bl.apply(null);
    stopFx(sc);
    await clock.tween(0.75, u => {
      const e = u * u;                                          // falls (accelerating), flutters, lands flat
      garment.object.position.set(start.x + (land.x - start.x) * u, y0 + (y1 - y0) * e + 0.06 * Math.sin(PI * u), start.z + (land.z - start.z) * u);
      garment.object.rotation.set(-0.9 * (1 - u), yaw + 0.6 * u, 0.3 * (1 - u) + 0.25 * Math.sin(u * 7) * (1 - u));
    }, t => t);
    garment.settle();
    S.sfx('ui_tap', { volume: 0.4 });
    return garment;
  }

  /** Where the garment lands: on the floor beside the bed, level with her hips, clear of the candles. */
  // (the candles stand by the head end of the bed, h ≈ +0.5: the garment always lands toward the foot)
  function landingSpot(set, hipH = -0.15) { const B = set.bed; return B.at(Math.min(hipH, 0.05) - 0.3, B.w / 2 + 0.45); }
  function hipH(sc, set) { const B = set.bed; sc.b.surface('torso', { u: 0.12, a: 0 }, _a); return (_a.x - B.x) * B.H.x + (_a.z - B.z) * B.H.z; }

  /** A small soft garment lying crumpled on the floor: a pair of briefs (toon, 2 draw calls). */
  function buildGarment(color) {
    // silhouette: waistband on top, curved leg openings down to a narrow gusset (flat on the floor)
    const sh = new THREE.Shape();
    sh.moveTo(-0.12, 0.08);
    sh.quadraticCurveTo(0, 0.095, 0.12, 0.08);
    sh.lineTo(0.115, 0.04);
    sh.quadraticCurveTo(0.05, 0.02, 0.035, -0.075);
    sh.lineTo(-0.035, -0.075);
    sh.quadraticCurveTo(-0.05, 0.02, -0.115, 0.04);
    sh.closePath();
    const g = new THREE.ShapeGeometry(sh, 10);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      // softly crumpled, a fold across the middle
      p.setZ(i, 0.008 * Math.sin(x * 45 + y * 30) + 0.016 * Math.exp(-((y - 0.01) ** 2) / 0.0012) * (1 - Math.abs(x) * 5));
    }
    g.computeVertexNormals();
    g.rotateX(-PI / 2);
    const mat = ctx.toon?.mat ? ctx.toon.mat(color, { side: THREE.DoubleSide, rim: 0.2 }) : new THREE.MeshToonMaterial({ color, side: THREE.DoubleSide });
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = true;
    // lace waistband
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.12, 0.01, -0.08), new THREE.Vector3(0, 0.012, -0.096), new THREE.Vector3(0.12, 0.01, -0.08));
    const bandG = new THREE.TubeGeometry(curve, 12, 0.006, 4, false);
    const band = new THREE.Mesh(bandG, ctx.toon?.mat ? ctx.toon.mat('#ffffff') : new THREE.MeshToonMaterial({ color: '#ffffff' }));
    const object = new THREE.Group(); object.name = 'romance-garment'; object.add(m, band);
    m.userData.noOcclude = true; band.userData.noOcclude = true;
    return {
      object,
      settle() { object.rotation.x = 0; object.rotation.z = 0; },
      dispose() { object.removeFromParent(); g.dispose(); bandG.dispose(); },
    };
  }

  // ---- cameras -------------------------------------------------------------------------------------------
  const P = (fn) => () => { try { return fn().filter(Boolean); } catch { return []; } };
  const headP = h => h.head.getWorldPosition(V());
  const surf = (h, r, p) => h.surface(r, p, V());

  function twoShot(sc, o = {}) {
    const { a, b } = sc;
    const pts = P(() => [headP(a), headP(b), surf(a, 'torso', { u: 0.8 }), surf(b, 'torso', { u: 0.8 })]);
    const ax = V().subVectors(b.object.position, a.object.position).setY(0);
    const yaw = Math.atan2(ax.x, ax.z);
    return cams.fit(pts, { yaws: [yaw + PI / 2, yaw - PI / 2, yaw + PI / 2 + 0.5, yaw - PI / 2 - 0.5], pitch: 0.12, minV: 0.75, ...o });
  }
  function fullShot(sc, o = {}) {
    const { a, b } = sc;
    const pts = P(() => [headP(a), headP(b), surf(a, 'thigh_L', { u: 0.6 }), surf(b, 'thigh_R', { u: 0.6 }), surf(a, 'torso', { u: 0.1 }), surf(b, 'torso', { u: 0.1 })]);
    const ax = V().subVectors(b.object.position, a.object.position).setY(0);
    const yaw = Math.atan2(ax.x, ax.z);
    return cams.fit(pts, { yaws: [yaw + PI / 2 + 0.25, yaw - PI / 2 - 0.25, yaw + PI / 2 + 0.7, yaw - PI / 2 - 0.7], pitch: 0.14, minV: 1.25, ...o });
  }
  function walkShot(sc) {
    const { a, b } = sc;
    const pts = P(() => [headP(a), headP(b), a.object.position.clone().setY(a.object.position.y + 0.7), b.object.position.clone().setY(b.object.position.y + 0.7)]);
    const yaw = Math.atan2(ctx.camera.position.x - b.object.position.x, ctx.camera.position.z - b.object.position.z);
    return cams.fit(pts, { yaws: [yaw, yaw + 0.6, yaw - 0.6], pitch: 0.3, minV: 1.6, margin: 1.5, dur: 1.4, live: true });
  }
  /** Camera while the couple moves into a new pose: a calm medium shot that follows them. */
  function shotTransition(sc) { walkShot(sc); }

  /** The close-up for the current pose (after act / undress …). */
  function shot(sc, o = {}) {
    const { a, b } = sc, st = sc.acting?.state, set = sc.set;
    if (st === 'sofa' && set?.sofa) {
      const s = set.sofa;
      const pts = P(() => [headP(a), headP(b), surf(a, 'torso', { u: 0.75 }), surf(b, 'torso', { u: 0.75 })]);
      // facing each other on the sofa: from the front = their profiles (kiss, whisper, neck)
      return cams.fit(pts, { yaws: [s.f + 0.12, s.f - 0.3, s.f + 0.45, s.f - 0.6], pitch: 0.08, minV: 0.75, ...o });
    }
    if (st === 'feet' && set?.sofa) {
      // medium shot: her face, her lifted foot and his face on it all readable together (never a foot close-up)
      const s = set.sofa;
      const pts = P(() => [headP(a), headP(b), surf(b, 'foot_R', { u: 0.5 }), surf(b, 'foot_R', { u: 1 }), surf(b, 'knee_R', {}), surf(a, 'torso', { u: 0.6 })]);
      return cams.fit(pts, { yaws: [s.f - PI / 2 + 0.3, s.f + PI / 2 - 0.3, s.f - PI / 2 + 0.6, s.f + PI / 2 - 0.6, s.f - 0.9, s.f + 0.9], pitch: 0.2, minV: 1.25, margin: 1.22, ...o });
    }
    if (st === 'knees' || st === 'legs') {
      const sp = sc.acting.floor, f = sp.facing;
      const pts = st === 'knees'
        ? P(() => [headP(a), headP(b), surf(b, 'torso', { u: 0.45 }), surf(a, 'palm_L', {}), surf(a, 'palm_R', {})])
        : P(() => [headP(a), headP(b), surf(b, 'foot_R', { u: 0.5 }), surf(b, 'knee_R', {}), surf(a, 'palm_L', {})]);
      const yaws = st === 'knees' ? [f + 0.55, f - 0.55, f + 1.0, f - 1.0] : [f + 0.35, f - 0.5, f + 0.9, f - 1.2];
      return cams.fit(pts, { yaws, pitch: st === 'legs' ? 0.42 : 0.2, minV: st === 'legs' ? 1.25 : 0.95, ...o });
    }
    if (st === 'bed') return bedShot(sc, set, o);
    if (st === 'bededge' && set?.bed) {
      const B = set.bed, out = Math.atan2(B.Lx.x, B.Lx.z);
      const pts = P(() => [headP(a), headP(b), surf(a, 'torso', { u: 0.4 }), surf(b, 'torso', { u: 0.4 })]);
      return cams.fit(pts, { yaws: [out - 0.35, out + 0.35, out], pitch: 0.12, minV: 0.9, ...o });
    }
    if (sc.acting?.last === 'hug' || sc.acting?.last === 'kiss') return twoShot(sc, { minV: 0.7, ...o });
    return twoShot(sc, o);
  }

  /**
   * In bed: from above the blanket on the foot side, looking down at the two faces on the pillows. The lens is
   * clamped well above the mattress and on the faces' side of the blanket edge, so nothing under it can be seen.
   */
  function bedShot(sc, set, o = {}) {
    const { a, b } = sc, B = set.bed;
    const pts = P(() => [headP(a), headP(b), surf(a, 'shoulder_L', { u: 0.9 }), surf(b, 'shoulder_R', { u: 0.9 }), surf(a, 'shoulder_R', { u: 0.9 }), surf(b, 'shoulder_L', { u: 0.9 })]);
    const yawOf = (k) => Math.atan2(-B.H.x * Math.cos(k) + B.Lx.x * Math.sin(k), -B.H.z * Math.cos(k) + B.Lx.z * Math.sin(k));
    return cams.fit(pts, { yaws: [yawOf(0.3), yawOf(0.6), yawOf(0)], pitch: 1.1, minV: 0.95, margin: 1.35, clamp: bedClamp(set), ...o });
  }
  /** Her face on the pillow and the floor beside the bed (where the garment lands), from the room side, high. */
  function sideBedShot(sc, set, landing, o = {}) {
    const { b } = sc, B = set.bed;
    const pts = P(() => [headP(b), surf(b, 'shoulder_R', { u: 0.9 }), surf(b, 'shoulder_L', { u: 0.9 }), landing.clone(), landing.clone().add(V(0, 0.15, 0))]);
    // from the room side, a little toward the foot of the bed, high: her face and the floor where it falls
    const yawOf = (k) => Math.atan2(B.Lx.x * Math.cos(k) - B.H.x * Math.sin(k), B.Lx.z * Math.cos(k) - B.H.z * Math.sin(k));
    // portrait: the band is shifted down (headroom above the faces, the landing spot low in the frame, clear of
    // the dialogue box while the garment falls) — same frame size, the faces sit in the upper middle
    const tall = (ctx.viewport?.aspect ?? (innerWidth / innerHeight)) < 1 ? { padTop: 0.28, padBottom: 0.1 } : {};
    return cams.fit(pts, { yaws: [yawOf(0.55), yawOf(0.85), yawOf(0.25)], pitch: 0.82, minV: 1.0, margin: 1.15, clamp: bedClamp(set), ...tall, ...o });
  }
  /** Camera positions allowed around the bed: high above the mattress and never past the blanket's top edge. */
  function bedClamp(set) {
    const B = set.bed;
    return pos => {
      pos.y = Math.max(pos.y, B.quilt + 0.95);
      const h = (pos.x - B.x) * B.H.x + (pos.z - B.z) * B.H.z;
      const maxH = 0.35;                                         // stays on the foot side of the faces
      if (h > maxH) { pos.x -= B.H.x * (h - maxH); pos.z -= B.H.z * (h - maxH); }
      return pos;
    };
  }

  return {
    homeSet, begin, end, release, act, goState, contacts, undress, dress, toBed, sitBedEdge, intoBed, slipOff,
    shot, twoShot, fullShot, bedShot, sideBedShot, walkShot, stateFor,
    landing: (sc, set) => { const p = landingSpot(set, hipH(sc, set)); return V(p.x, set.floorY, p.z); },
    state: sc => sc.acting?.state || null,
    ok: sc => !!(sc.a?.touch && sc.b?.touch && sc.a?.sitOn && sc.b?.sitOn && sc.a?.surface && sc.b?.surface),
    pickLine: pick,
  };
}
