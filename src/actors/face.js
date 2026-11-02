// Expressive Sun/Moon face: big eyes (sclera, gradient iris, pupil, two highlights, lash line), brows,
// a mouth line with movable corners plus an open-mouth shape, blush. Everything is geometry inside the
// character's single skinned mesh; expressions only move/scale face bones (no extra draw calls).
//   buildFace(RB, look, spec)   adds the face parts to a RigBuilder (called by human.js)
//   createFace(ctx, look, bones) → controller {set(name, {dur}), talk(on), update(dt, scalars), blinkNow()}
import * as THREE from 'three';
import { ellipsoid, tube, col, mix, sstep } from './geo.js';

export const EXPRESSIONS = ['neutral', 'smile', 'grin', 'laugh', 'blush', 'shy', 'surprised', 'sad', 'angry', 'wink', 'closed', 'kiss', 'sleepy', 'smug'];

/** Parts that never get an outline shell. */
export const FACE_PARTS = new Set(['eyes', 'lids', 'brows', 'mouth', 'blush', 'freckles', 'nose']);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
/** Eye geometry metrics (multiplied by spec.hr). */
export const EYE = { w: 0.029, h: 0.04 };

/** Surface normal of the head ellipsoid at p (model space). */
function headNormal(spec, p) {
  const c = spec.headC, r = spec.headR;
  return V((p[0] - c[0]) / (r[0] * r[0]), (p[1] - c[1]) / (r[1] * r[1]), (p[2] - c[2]) / (r[2] * r[2])).normalize();
}

/** Add eyes, lids, brows, nose, mouth, blush (and freckles) to the builder. */
export function buildFace(RB, L, spec) {
  const hr = spec.hr, J = spec.joints;
  const fem = spec.P.sex === 'f';
  const kid = spec.P.age === 'kid';
  const eW = EYE.w * hr * (kid ? 1.08 : 1), eH = EYE.h * hr * (kid ? 1.08 : 1) * (fem ? 1.04 : 0.96);
  const iris = col(L.eyes);
  const lashC = mix(L.hair.color, '#1c1420', 0.7);
  for (const [side, k] of [['L', 1], ['R', -1]]) {
    const e = J[`eye_${side}`];
    const n = headNormal(spec, e);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n);
    // a slight inward tilt of the eye shape (outer corner a bit higher) reads friendlier
    const tilt = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), 0.08 * k);
    const Q = q.clone().multiply(tilt);
    const at = (x, y, z) => V(x, y, z).applyQuaternion(Q).add(V(...e)).toArray();
    const rot = Q;
    // sclera (slightly blue-white at the bottom like anime eyes)
    RB.add(ellipsoid({ c: at(0, 0, -0.001), r: [eW, eH, 0.007 * hr], seg: [14, 9], rot }), { part: 'eyes', bone: `eye_${side}`,
      color: (p) => { const ly = (p.y - e[1]) / eH; return mix('#ffffff', '#dfe8ff', sstep(0.2, -0.9, ly)); } });
    // iris: dark top → light bottom
    const iW = eW * 0.78, iH = eH * 0.84;
    RB.add(ellipsoid({ c: at(0.002 * k * -1, -0.003 * hr, 0.0035 * hr), r: [iW, iH, 0.006 * hr], seg: [12, 8], rot }), { part: 'eyes', bone: `eye_${side}`,
      color: (p) => { const ly = (p.y - e[1]) / eH; return mix(mix(iris, '#000', 0.55), mix(iris, '#ffffff', 0.28), sstep(0.55, -0.7, ly)); } });
    // pupil
    RB.add(ellipsoid({ c: at(0.002 * k * -1, -0.001 * hr, 0.0075 * hr), r: [iW * 0.45, iH * 0.5, 0.004 * hr], seg: [8, 6], rot }), { part: 'eyes', bone: `eye_${side}`, color: () => mix(iris, '#0a0610', 0.8) });
    // highlights (same light direction on both eyes: upper-left of the screen = character's right)
    RB.add(ellipsoid({ c: at(-0.0085 * hr, 0.012 * hr, 0.0105 * hr), r: [0.0078 * hr, 0.0092 * hr, 0.003 * hr], seg: [6, 4], rot }), { part: 'eyes', bone: `eye_${side}`, color: 0xffffff });
    RB.add(ellipsoid({ c: at(0.0075 * hr, -0.0125 * hr, 0.0102 * hr), r: [0.0036 * hr, 0.0036 * hr, 0.002 * hr], seg: [5, 3], rot }), { part: 'eyes', bone: `eye_${side}`, color: 0xffffff });
    // lash line over the top of the eye (moves with the lid bone; flips into ∪ / ∩ when closed)
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * (1.04 - i / 8 * 1.12);   // from inner corner (slightly below) over the top to the outer corner
      const x = Math.cos(a) * eW * 1.08 * k * -1, y = Math.sin(a) * eH * 1.04 - (i === 8 && fem ? -0.002 : 0);
      pts.push(V(...at(x, y, 0.0085 * hr)));
    }
    if (fem) pts.push(V(...at(-k * eW * 1.42, eH * 0.42, 0.0075 * hr)));  // outer flick
    RB.add(tube({ points: pts, radii: [[0, 0.0022 * hr], [0.25, 0.0042 * hr], [0.8, 0.0048 * hr], [1, fem ? 0.0012 * hr : 0.003 * hr]], seg: 5, rings: 10, flatten: 0.5, up: () => n }),
      { part: 'lids', color: () => lashC, bone: `lid_${side}` });
    // brow: a soft arc
    const b = J[`brow_${side}`];
    const bn = headNormal(spec, b);
    const bq = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), bn);
    const bat = (x, y) => V(x, y, 0.004 * hr).applyQuaternion(bq).add(V(...b));
    const bw = 0.03 * hr;
    RB.add(tube({ points: [bat(-k * bw, -0.004 * hr), bat(-k * bw * 0.2, 0.004 * hr), bat(k * bw * 0.6, 0.003 * hr), bat(k * bw, -0.003 * hr)],
      radii: [[0, 0.0045 * hr], [0.35, 0.0052 * hr], [1, 0.0022 * hr]], seg: 5, rings: 6, flatten: 0.45, up: () => bn }),
    { part: 'brows', color: () => mix(L.hair.style === 'bald' ? '#8a7a6a' : L.hair.color, '#1c1420', 0.35), bone: `brow_${side}` });
  }
  // nose: a tiny soft bump
  {
    const y = spec.headC[1] - 0.068 * hr, z = spec.fz(0, y);
    RB.add(ellipsoid({ c: [0, y, z - 0.002], r: [0.011 * hr, 0.012 * hr, 0.012 * hr], seg: [8, 6] }), { part: 'nose', bone: 'head', color: () => mix(L.skin, '#c0705a', 0.12) });
  }
  // mouth line (corners on mouth_L / mouth_R) and the open mouth (jaw: scaled from 0)
  {
    const m = J.mouth, mw = 0.028 * hr;
    const n = headNormal(spec, m);
    const z = (x) => spec.fz(x, m[1]) + 0.0035 * hr;
    const pts = [];
    for (let i = 0; i <= 6; i++) { const x = -mw + (2 * mw * i) / 6; pts.push(V(x, m[1] - 0.0035 * hr * (1 - (x / mw) ** 2), z(x))); }
    const lineC = L.lips ? mix(L.lips, '#3a1418', 0.25) : mix(L.skin, '#5a1e22', 0.75);
    RB.add(tube({ points: pts, radii: [[0, 0.0018 * hr], [0.5, 0.0028 * hr], [1, 0.0018 * hr]], seg: 5, rings: 8, flatten: 0.6, up: () => n }), {
      part: 'mouth', color: () => lineC,
      weights: (p) => { const t = sstep(0.004 * hr, mw * 0.95, Math.abs(p.x)); return [[p.x > 0 ? 'mouth_L' : 'mouth_R', t], ['mouth', 1 - t]]; },
    });
    // open mouth: flat top, round bottom; tongue at the bottom
    RB.add(ellipsoid({ c: [0, m[1] - 0.002 * hr, z(0) - 0.0055 * hr], r: [mw * 0.92, 0.026 * hr, 0.006 * hr], seg: [12, 7], rot: new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n),
      deform: (v) => { if (v.y > 0) v.y *= 0.12; } }), {
      part: 'mouth', bone: 'jaw', color: (p) => (p.y < m[1] - 0.017 * hr ? col('#e8707e') : col('#7a2232')),
    });
  }
  // blush discs (scaled in by the expression) + a faint permanent cheek tint for women in human.js
  for (const k of [1, -1]) {
    const x = 0.088 * hr * k, y = spec.headC[1] - 0.068 * hr;
    const p = [x, y, spec.fz(x, y) + 0.002 * hr];
    const n = headNormal(spec, p);
    RB.add(ellipsoid({ c: p, r: [0.024 * hr, 0.012 * hr, 0.003 * hr], seg: [8, 4], rot: new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n) }), { part: 'blush', bone: 'blush', color: () => mix(L.skin, '#ff5f7e', 0.55) });
  }
  if (L.freckles) {
    for (const k of [1, -1]) for (let i = 0; i < 5; i++) {
      const x = (0.07 + 0.012 * (i % 3)) * hr * k, y = spec.headC[1] - (0.055 + 0.01 * ((i * 7) % 3)) * hr;
      const p = [x, y, spec.fz(x, y) + 0.0012];
      RB.add(ellipsoid({ c: p, r: [0.0032 * hr, 0.0032 * hr, 0.0015], seg: [5, 4] }), { part: 'freckles', bone: 'head', color: () => mix(L.skin, '#8a4a2a', 0.45) });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Expression controller

/** Target parameters per expression. smile -1..1 (corner height), width -1..1 (pucker..wide),
 *  open eye openness (1.15 = wide), shape of closed eyes (-1 relaxed ∪, +1 happy ∩), brow raise / tilt
 *  (+ = inner corners up, worried), mouthOpen 0..1, round 0..1 (o-shape), blush 0..1, gaze y. */
const BASE = { openL: 1, openR: 1, shape: -1, browL: 0, browR: 0, tilt: 0, smileL: 0.22, smileR: 0.22, width: 0, mouthOpen: 0, round: 0, blush: 0, gaze: 0 };
const X = (o) => ({ ...BASE, ...o });
export const EXPRESSION_PARAMS = {
  neutral: X({}),
  smile: X({ smileL: 0.85, smileR: 0.85, browL: 0.15, browR: 0.15, openL: 0.94, openR: 0.94 }),
  grin: X({ smileL: 1, smileR: 1, mouthOpen: 0.5, width: 0.35, browL: 0.3, browR: 0.3, openL: 0.86, openR: 0.86 }),
  laugh: X({ openL: 0, openR: 0, shape: 1, smileL: 1, smileR: 1, mouthOpen: 0.85, width: 0.25, browL: 0.45, browR: 0.45 }),
  blush: X({ smileL: 0.5, smileR: 0.5, blush: 1, tilt: 0.35, openL: 0.9, openR: 0.9 }),
  shy: X({ openL: 0.62, openR: 0.62, smileL: 0.35, smileR: 0.35, blush: 0.85, tilt: 0.55, gaze: -1, width: -0.2 }),
  surprised: X({ openL: 1.16, openR: 1.16, browL: 1, browR: 1, mouthOpen: 0.6, round: 1, width: -0.4, smileL: 0, smileR: 0 }),
  sad: X({ openL: 0.78, openR: 0.78, tilt: 0.9, browL: 0.1, browR: 0.1, smileL: -0.75, smileR: -0.75, gaze: -0.5 }),
  angry: X({ openL: 0.82, openR: 0.82, tilt: -1, browL: -0.35, browR: -0.35, smileL: -0.6, smileR: -0.6, width: 0.15 }),
  wink: X({ openL: 1, openR: 0, shape: 1, smileL: 0.95, smileR: 0.75, browL: 0.25, browR: -0.1 }),
  closed: X({ openL: 0, openR: 0, shape: -1, smileL: 0.3, smileR: 0.3 }),
  kiss: X({ openL: 0, openR: 0, shape: -1, width: -1, mouthOpen: 0.16, round: 1, smileL: 0.1, smileR: 0.1, blush: 0.55, tilt: 0.2 }),
  sleepy: X({ openL: 0.32, openR: 0.36, browL: -0.15, browR: -0.15, smileL: 0.05, smileR: 0.05, mouthOpen: 0.04, gaze: -0.4 }),
  smug: X({ openL: 0.62, openR: 0.74, smileL: 0.95, smileR: 0.15, browL: 0.45, browR: -0.15, tilt: -0.25 }),
};

/**
 * @param {any} ctx
 * @param {object} look
 * @param {Object<string,THREE.Bone>} [bones]  face bones (given by human.js)
 * @param {object} [spec]
 */
export function createFace(ctx, look, bones = null, spec = null) {
  const cur = { ...EXPRESSION_PARAMS.neutral }, goal = { ...EXPRESSION_PARAMS.neutral };
  let rate = 10, name = 'neutral', speaking = false, t = Math.random() * 10;
  let blinkT = 1 + Math.random() * 3, blink = 0, blinkLen = 0.15, gazeX = 0, gazeY = 0, gazeT = 1 + Math.random() * 2;
  const hr = spec?.hr ?? 1;
  const eH = EYE.h * hr;
  const base = {};
  if (bones) for (const k of ['eye_L', 'eye_R', 'lid_L', 'lid_R', 'brow_L', 'brow_R', 'mouth_L', 'mouth_R', 'jaw']) base[k] = bones[k]?.position.clone();

  const face = {
    get expression() { return name; },
    /** Change expression with an eased transition of `dur` seconds. Unknown names fall back to neutral. */
    set(n, { dur = 0.2 } = {}) {
      const p = EXPRESSION_PARAMS[n] || EXPRESSION_PARAMS.neutral;
      name = EXPRESSION_PARAMS[n] ? n : 'neutral';
      Object.assign(goal, p);
      rate = 4 / Math.max(0.03, dur);
    },
    talk(on) { speaking = !!on; },
    get talking() { return speaking; },
    blinkNow() { if (blink <= 0) { blink = blinkLen; } },
    /**
     * Apply to the bones (after the animation mixer and the procedural layers).
     * s: clip scalars {eyes (0..1 multiplier), mouth (0..1 add), brow (-1..1 add)}; eyeShift: look-at glance.
     */
    update(dt, s = {}, eyeShift = 0) {
      if (!bones) return;
      t += dt;
      const k = 1 - Math.exp(-rate * dt);
      for (const key in goal) cur[key] += (goal[key] - cur[key]) * k;
      // blink (skipped while the eyes are already closed)
      blinkT -= dt;
      if (blinkT <= 0) { blink = blinkLen; blinkT = 2 + Math.random() * 4; if (Math.random() < 0.18) blinkT = 0.22; }
      let bl = 1;
      if (blink > 0) { blink -= dt; bl = 1 - Math.sin(Math.max(0, blink) / blinkLen * Math.PI) * 0.97; }
      // idle saccades: tiny eye darts every few seconds
      gazeT -= dt;
      if (gazeT <= 0) { gazeT = 1.2 + Math.random() * 3; gazeX = (Math.random() - 0.5) * 0.5; gazeY = (Math.random() - 0.5) * 0.3; }
      const eyesMul = s.eyes ?? 1;
      for (const [side, sign] of [['L', 1], ['R', -1]]) {
        const eye = bones[`eye_${side}`], lid = bones[`lid_${side}`];
        let open = (side === 'L' ? cur.openL : cur.openR) * eyesMul;
        const wide = Math.max(0, open - 1);
        open = Math.min(1, open) * bl;
        // shape of the closed eye: blend between relaxed (∪) and happy (∩) by the expression's shape
        const shape = bl < 0.999 && cur.shape < 0.5 ? -1 : cur.shape;
        const closedSy = shape > 0 ? 0.48 : -0.42, closedDy = shape > 0 ? -0.3 : 0.1;
        const wOpen = sstep(0, 0.38, open);
        eye.scale.set(1 + wide * 0.4, Math.max(0.02, open) * (1 + wide), 1);
        eye.position.copy(base[`eye_${side}`]);
        eye.position.x += (gazeX * 0.004 + eyeShift) * hr * wOpen;
        eye.position.y += (gazeY * 0.003 + cur.gaze * 0.006) * hr * wOpen;
        // lash line: follows the top of the (scaled) eye while open, morphs into the closed shape near 0
        lid.position.copy(base[`lid_${side}`]);
        lid.scale.set(1 + wide * 0.3, closedSy + (open * (1 + wide) - closedSy) * wOpen, 1);
        lid.position.y += closedDy * eH * (1 - wOpen) + cur.gaze * 0.006 * hr * wOpen;
        // brows
        const brow = bones[`brow_${side}`];
        brow.position.copy(base[`brow_${side}`]);
        brow.position.y += ((side === 'L' ? cur.browL : cur.browR) + (s.brow || 0)) * 0.012 * hr;
        brow.rotation.set(0, 0, cur.tilt * 0.32 * -sign);
        // mouth corners
        const c = bones[`mouth_${side}`];
        c.position.copy(base[`mouth_${side}`]);
        c.position.y += (side === 'L' ? cur.smileL : cur.smileR) * 0.0075 * hr;
        c.position.x += sign * (cur.width * 0.006 - cur.round * cur.mouthOpen * 0.004) * hr;
      }
      // open mouth (+ chatter while talking)
      let mo = cur.mouthOpen + (s.mouth || 0);
      if (speaking) mo += Math.max(0, Math.sin(t * 14.5) * 0.4 + Math.sin(t * 23.3) * 0.25 + 0.12) * 0.75;
      mo = Math.min(1.1, Math.max(0, mo));
      const jaw = bones.jaw;
      const w = 1 + cur.width * 0.25 - cur.round * 0.45;
      jaw.scale.set(Math.max(0.05, w * (0.55 + 0.45 * Math.min(1, mo * 2))), Math.max(0.001, mo), 1);
      // squash the line when the mouth is round (o-shape)
      bones.mouth.scale.set(1 - cur.round * 0.4 * Math.min(1, mo * 4), 1, 1);
      bones.blush.scale.setScalar(Math.max(0.001, cur.blush));
      for (const n of ['eye_L', 'eye_R', 'lid_L', 'lid_R', 'brow_L', 'brow_R', 'mouth', 'blush']) bones[n].updateMatrixWorld(true);
    },
  };
  return face;
}
