// Body physicality helpers (private to the actors area):
//   - bodyMetrics(spec, look): radii of the procedural body (torso profile, limbs, head, shoes) in bind model units.
//   - surfacePoint(human, region, params, outP, outN): a point ON the body surface (world) + its outward normal, used
//     to put hands, feet and mouths on a partner (shoulders, back, hair, neck, ear, thighs, shins, feet...).
//   - twoBoneIKPole: two-bone IK with an elbow/knee pole hint; handQuat: palm/finger orientation.
//   - ccdReach: spine → head CCD so the mouth reaches a point (kisses, whispers).
//   - FootPlanter: feet planted during the walk/run stance (no sliding), idle feet stay put and step when the body
//     turns or drifts, feet follow uneven ground; plus locomotion stride calibration per body.
//   - support spheres: the body rests ON a seat / the floor / a mattress (lowest body point = the surface).
import * as THREE from 'three';
import { ARM_ANGLE } from './skeleton.js';
import { rotateWorld, setWorldQuat, clamp, groundNormal } from './procedural.js';
import { CLIPS } from './clips.js';
import { sample, ALIAS } from './anim.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _t = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qk = new THREE.Quaternion();
const _mat = new THREE.Matrix4(), _mat2 = new THREE.Matrix4();
const V3 = () => new THREE.Vector3();
const S_ = [V3(), V3(), V3(), V3(), V3()];                       // surfacePoint
const K_ = [V3(), V3(), V3(), V3(), V3(), V3(), V3(), V3(), V3(), V3()]; const KQ = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()]; // twoBoneIKPole
const H_ = [V3(), V3(), V3(), V3(), V3(), V3()];                  // handQuat
const C_ = [V3(), V3(), V3(), V3(), V3()]; const CQ = new THREE.Quaternion(); // ccdReach
const _eul = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const D2R = Math.PI / 180;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ===================================================================================== metrics
const METRICS = new WeakMap();
/** Body radii in bind model units (before the model's height scale). */
export function bodyMetrics(spec, look) {
  const shoeKey = look?.shoes?.style || 'sneakers';
  let byShoe = METRICS.get(spec);
  if (!byShoe) { byShoe = new Map(); METRICS.set(spec, byShoe); }
  let M = byShoe.get(shoeKey);
  if (M) return M;
  const P = spec.P, s = spec.s, lt = P.limb * s;
  const fem = P.sex === 'f';
  const prof = [
    [0.8, 0.12 * P.hip], [0.85, 0.142 * P.hip], [0.9, 0.15 * P.hip], [0.95, 0.143 * lerp(P.hip, P.waist, 0.45)], [1.01, 0.128 * P.waist], [1.06, 0.127 * P.waist],
    [1.11, 0.135 * lerp(P.waist, P.chest, 0.55)], [1.17, 0.148 * P.chest], [1.225, 0.153 * P.chest], [1.265, 0.145 * P.chest], [1.3, 0.12 * P.chest],
    [1.322, 0.082], [1.342, 0.054], [1.37, 0.047], [1.42, 0.044],
  ];
  /** torso half-width / half-depth at normalised height Y (= y / s) */
  const torso = (Y, out = { rx: 0, rz: 0 }) => {
    let i = 0; while (i < prof.length - 2 && prof[i + 1][0] < Y) i++;
    const A = prof[i], B = prof[i + 1], t = clamp((Y - A[0]) / (B[0] - A[0]), 0, 1);
    const r = lerp(A[1], B[1], t) * s;
    const g = Math.exp(-(((Y - 1.168) / 0.05) ** 2)) * P.bust;
    const depth = 0.74 + 0.05 * Math.exp(-(((Y - 0.88) / 0.06) ** 2)) + (Y > 1.33 ? 0.24 * sstep(1.33, 1.36, Y) : 0);
    out.rx = r; out.rz = r * depth + 0.012 * g * s;
    return out;
  };
  const shoes = look?.shoes?.style || 'sneakers';
  const fs = s * (fem ? 1.08 : 1.2);
  const bare = shoes === 'barefoot' || shoes === 'sandals';
  const footR = bare ? [0.042 * fs, 0.04 * fs, 0.094 * fs] : [0.05 * fs, 0.047 * fs, 0.105 * fs];
  const hs = s * (fem ? 1.0 : 1.08) * P.limb ** 0.3;
  M = {
    s, lt, hs, fs, torso,
    thighR: u => lerp(0.098 * P.hip, 0.066, u) * lt,
    shinR: u => lerp(0.066, 0.046, u) * lt,
    upperArmR: u => lerp(0.055, 0.041, u) * lt,
    foreArmR: u => lerp(0.041, 0.034, u) * lt,
    footC: [0, 0.046 * s, 0.035 * fs], footR,
    palm: { along: 0.045 * hs, thick: 0.025 * hs },
    /** collision radius around the body (shoulders + arms) */
    radius: (P.shoulderX + 0.06) * s,
    hipBottom: 0.148 * s,
  };
  byShoe.set(shoeKey, M);
  return M;
}

// ===================================================================================== surface points
const tmpT = { rx: 0, rz: 0 };
/** Named presets → [base region, params]. */
const PRESETS = {
  back: ['torso', { u: 0.55, a: Math.PI }], upper_back: ['torso', { u: 0.85, a: Math.PI }], lower_back: ['torso', { u: 0.12, a: Math.PI }],
  chest: ['torso', { u: 0.7, a: 0 }], belly: ['torso', { u: 0.2, a: 0 }],
  waist_L: ['torso', { u: 0.22, a: Math.PI / 2 }], waist_R: ['torso', { u: 0.22, a: -Math.PI / 2 }],
  side_L: ['torso', { u: 0.5, a: Math.PI / 2 }], side_R: ['torso', { u: 0.5, a: -Math.PI / 2 }],
  neck_L: ['neck', { u: 0.4, a: Math.PI / 2 + 0.25 }], neck_R: ['neck', { u: 0.4, a: -Math.PI / 2 - 0.25 }], nape: ['neck', { u: 0.5, a: Math.PI }], throat: ['neck', { u: 0.3, a: 0 }],
  mouth: ['head', { mouth: true }], lips: ['head', { mouth: true }],
  cheek_L: ['head', { el: -0.32, az: 0.85 }], cheek_R: ['head', { el: -0.32, az: -0.85 }],
  ear_L: ['head', { el: -0.12, az: Math.PI / 2 }], ear_R: ['head', { el: -0.12, az: -Math.PI / 2 }],
  forehead: ['head', { el: 0.42, az: 0 }], crown: ['head', { el: 1.25, az: Math.PI }],
  hair: ['head', { el: 0.5, az: Math.PI, hair: true }], hair_L: ['head', { el: 0.3, az: Math.PI / 2 + 0.5, hair: true }], hair_R: ['head', { el: 0.3, az: -Math.PI / 2 - 0.5, hair: true }],
  knee_L: ['shin_L', { u: 0.02, a: 0 }], knee_R: ['shin_R', { u: 0.02, a: 0 }],
  lap_L: ['thigh_L', { u: 0.45, a: 0 }], lap_R: ['thigh_R', { u: 0.45, a: 0 }],
  calf_L: ['shin_L', { u: 0.35, a: Math.PI }], calf_R: ['shin_R', { u: 0.35, a: Math.PI }],
  instep_L: ['foot_L', { u: 0.5 }], instep_R: ['foot_R', { u: 0.5 }], toes_L: ['foot_L', { u: 1 }], toes_R: ['foot_R', { u: 1 }],
  ankle_L: ['foot_L', { u: 0 }], ankle_R: ['foot_R', { u: 0 }], sole_L: ['foot_L', { sole: true }], sole_R: ['foot_R', { sole: true }],
  hand_L: ['palm_L', {}], hand_R: ['palm_R', {}],
};
const LIMBS = {
  thigh_L: ['thigh_L', 'shin_L', 'thighR'], thigh_R: ['thigh_R', 'shin_R', 'thighR'], shin_L: ['shin_L', 'foot_L', 'shinR'], shin_R: ['shin_R', 'foot_R', 'shinR'],
  upperarm_L: ['upperarm_L', 'lowerarm_L', 'upperArmR'], upperarm_R: ['upperarm_R', 'lowerarm_R', 'upperArmR'],
  forearm_L: ['lowerarm_L', 'hand_L', 'foreArmR'], forearm_R: ['lowerarm_R', 'hand_R', 'foreArmR'],
};
export const SURFACE_REGIONS = ['torso', 'neck', 'head', 'shoulder_L', 'shoulder_R', ...Object.keys(LIMBS), 'foot_L', 'foot_R', 'palm_L', 'palm_R', ...Object.keys(PRESETS)];

/**
 * World point on a human's body surface and its outward normal.
 * Regions (params in brackets, all optional):
 *   torso {u: 0 hips .. 1 shoulders, a: angle around the body, 0 front, π back, +π/2 its left}
 *   neck {u, a} · head {el, az, hair} (elevation / azimuth on the head ellipsoid; hair: on top of the hair volume)
 *   shoulder_L/R {u: 0 neck .. 1 deltoid} · thigh_* shin_* upperarm_* forearm_* {u: 0 .. 1 along the bone, a around it, 0 = front}
 *   foot_L/R {u: 0 ankle .. 0.5 instep .. 1 toes, sole} · palm_L/R
 *   presets: back upper_back lower_back chest belly waist_L/R side_L/R neck_L/R nape throat mouth cheek_L/R ear_L/R forehead crown
 *            hair hair_L/R knee_L/R lap_L/R calf_L/R instep_L/R toes_L/R ankle_L/R sole_L/R hand_L/R
 * Extra params override the preset's (e.g. surface('back', {u: 0.3, a: Math.PI - 0.5})). `out` normal optional.
 */
export function surfacePoint(h, region, params = {}, outP = new THREE.Vector3(), outN = null) {
  let base = region, prm = params;
  const pre = PRESETS[region];
  if (pre) { base = pre[0]; prm = { ...pre[1], ...params }; }
  const B = h.bones, S = h.spec, J = S.joints, M = bodyMetrics(S, h.look);
  const s = S.s;
  let bone = null;
  const [p, n, _c, _d, _e] = S_;
  if (base === 'torso') {
    const u = clamp(prm.u ?? 0.5, 0, 1), a = prm.a ?? 0;
    const Y = lerp(0.93, 1.29, u);
    M.torso(Y, tmpT);
    p.set(tmpT.rx * Math.sin(a), Y * s, tmpT.rz * Math.cos(a));
    n.set(Math.sin(a) / tmpT.rx, 0, Math.cos(a) / tmpT.rz).normalize();
    bone = Y < 1.0 ? 'hips' : Y < 1.12 ? 'spine' : 'chest';
  } else if (base === 'neck') {
    const u = clamp(prm.u ?? 0.5, 0, 1), a = prm.a ?? 0, r = 0.047 * s;
    p.set(r * Math.sin(a), lerp(1.35, 1.41, u) * s, r * Math.cos(a) * 1.05);
    n.set(Math.sin(a), 0, Math.cos(a));
    bone = 'neck';
  } else if (base === 'head') {
    const C = S.headC, R = S.headR;
    if (prm.mouth) {
      const m = J.mouth; p.set(m[0], m[1], m[2] + 0.004 * S.hr); n.set(0, -0.12, 1).normalize();
    } else {
      const el = prm.el ?? 0, az = prm.az ?? 0, k = prm.hair ? (h.look.hair?.style === 'bald' ? 1.0 : 1.18) : 1.0;
      const dx = Math.cos(el) * Math.sin(az), dy = Math.sin(el), dz = Math.cos(el) * Math.cos(az);
      p.set(C[0] + R[0] * k * dx, C[1] + R[1] * k * dy, C[2] + R[2] * k * dz);
      n.set(dx / R[0], dy / R[1], dz / R[2]).normalize();
    }
    bone = 'head';
  } else if (base === 'shoulder_L' || base === 'shoulder_R') {
    const k = base.endsWith('L') ? 1 : -1, u = clamp(prm.u ?? 0.55, 0, 1);
    p.set(k * lerp(0.07, S.P.shoulderX + 0.025, u) * s, (1.345 - 0.004 * u) * s, -0.004 * s);
    n.set(0.22 * k * u, 1, 0).normalize();
    bone = `shoulder_${k > 0 ? 'L' : 'R'}`;
  } else if (LIMBS[base]) {
    const [b0, b1, rf] = LIMBS[base];
    const u = clamp(prm.u ?? 0.5, 0, 1), a = prm.a ?? 0;
    const j0 = J[b0], j1 = J[b1];
    const ax = _c.set(j1[0] - j0[0], j1[1] - j0[1], j1[2] - j0[2]);
    const len = ax.length(); ax.divideScalar(len || 1);
    const zf = _d.set(0, 0, 1); const xf = _e.crossVectors(zf, ax).normalize(); zf.crossVectors(ax, xf).normalize();
    const r = M[rf](u);
    n.copy(xf).multiplyScalar(Math.sin(a)).addScaledVector(zf, Math.cos(a)).normalize();
    p.set(j0[0], j0[1], j0[2]).addScaledVector(ax, u * len).addScaledVector(n, r);
    bone = b0;
  } else if (base === 'foot_L' || base === 'foot_R') {
    const side = base.slice(-1), k = side === 'L' ? 1 : -1, ank = J[`foot_${side}`];
    const [rx, ry, rz] = M.footR, c = M.footC;
    const cx = ank[0] + 0.004 * k, cy = c[1], cz = c[2];
    if (prm.sole) { p.set(cx, 0.002, cz); n.set(0, -1, 0); }
    else {
      const u = clamp(prm.u ?? 0.5, 0, 1);
      if (u < 0.25) {      // front of the ankle → top of the foot
        const t = u / 0.25;
        _c.set(ank[0], ank[1] + 0.012 * s, ank[2] + 0.045 * s);
        const zz = cz - 0.25 * rz, yy = cy + ry * Math.sqrt(1 - 0.0625);
        p.set(lerp(_c.x, cx, t), lerp(_c.y, yy, t), lerp(_c.z, zz, t));
        n.set(0, lerp(0.35, 0.9, t), lerp(0.94, 0.44, t)).normalize();
      } else {
        const zt = lerp(-0.25, 0.86, (u - 0.25) / 0.75);
        const yy = Math.sqrt(Math.max(0.02, 1 - zt * zt));
        p.set(cx, cy + ry * yy, cz + rz * zt);
        n.set(0, yy / ry, zt / rz).normalize();
      }
    }
    bone = `foot_${side}`;
  } else if (base === 'palm_L' || base === 'palm_R') {
    const side = base.slice(-1), k = side === 'L' ? 1 : -1, wr = J[`hand_${side}`];
    const al = _c.set(Math.sin(ARM_ANGLE) * k, -Math.cos(ARM_ANGLE), 0), pn = _d.set(-k * Math.SQRT1_2, -Math.SQRT1_2, 0);
    p.set(wr[0], wr[1], wr[2]).addScaledVector(al, M.palm.along).addScaledVector(pn, M.palm.thick);
    n.copy(pn);
    bone = `hand_${side}`;
  } else {
    console.warn('[actors] unknown surface region', region);
    return h.bonePos('chest', outP);
  }
  if (prm.lift) p.addScaledVector(n, prm.lift / (h.look.height || 1));      // lift (m) off the surface along the normal
  const bn = B[bone];
  const j = J[bone];
  outP.set(p.x - j[0], p.y - j[1], p.z - j[2]);
  bn.localToWorld(outP);
  if (outN) { bn.getWorldQuaternion(CQ); outN.copy(n).applyQuaternion(CQ).normalize(); }
  return outP;
}

/**
 * A contact descriptor resolved every frame: {human, region, params?, offset?: m along the normal, slide?: fn(t) → params
 * (may also return {region} to travel across regions, and {lift} in metres off the surface)}
 * Returns true and fills outP/outN.
 */
export function resolveContact(c, t, outP, outN) {
  const h = c.human?.bones ? c.human : c.human?.human;
  if (!h?.bones) return false;
  let prm = c.params || {};
  if (c.slide) prm = { ...prm, ...c.slide(t) };
  surfacePoint(h, prm.region || c.region, prm, outP, outN || _n);
  if (c.offset) outP.addScaledVector(outN || _n, c.offset);
  return true;
}

// ===================================================================================== IK helpers
/**
 * Two-bone IK with a pole hint. `pole` (world point) attracts the middle joint (elbow out, knee forward).
 * endQ: wanted world rotation of the end bone (null = keep the animated one). weight blends the position.
 */
export function twoBoneIKPole(upper, mid, end, target, weight, fallbackAxis, endQ = null, pole = null, poleW = 1) {
  if (weight <= 1e-4) return;
  const [_a, _b, _c, _d, _e, _t, _u, _v, _n] = K_; const [_qk, _q2, _q] = KQ;
  end.getWorldQuaternion(_qk);
  if (endQ) _qk.copy(endQ);
  const keep = _q2.copy(_qk);
  upper.getWorldPosition(_a); mid.getWorldPosition(_b); end.getWorldPosition(_c);
  _t.copy(_c).lerp(target, weight);
  const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c);
  const dist = clamp(_a.distanceTo(_t), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  _u.subVectors(_a, _b); _v.subVectors(_c, _b);
  const cur = _u.angleTo(_v);
  const want = Math.acos(clamp((l1 * l1 + l2 * l2 - dist * dist) / (2 * l1 * l2), -1, 1));
  _n.crossVectors(_u, _v);
  if (_n.lengthSq() < 1e-8) _n.copy(fallbackAxis); else _n.normalize();
  _q.setFromAxisAngle(_n, want - cur);
  rotateWorld(mid, _q);
  end.getWorldPosition(_c);
  _u.subVectors(_c, _a).normalize(); _v.subVectors(_t, _a).normalize();
  _q.setFromUnitVectors(_u, _v);
  rotateWorld(upper, _q);
  if (pole && poleW > 0) {
    // swing the chain around the shoulder→target axis so the middle joint points at the pole
    const axis = _d.subVectors(_t, _a); const L = axis.length();
    if (L > 1e-4) {
      axis.divideScalar(L);
      mid.getWorldPosition(_b);
      _u.subVectors(_b, _a); _u.addScaledVector(axis, -_u.dot(axis));
      _v.subVectors(pole, _a); _v.addScaledVector(axis, -_v.dot(axis));
      if (_u.lengthSq() > 1e-8 && _v.lengthSq() > 1e-8) {
        _u.normalize(); _v.normalize();
        let ang = Math.acos(clamp(_u.dot(_v), -1, 1));
        if (_e.crossVectors(_u, _v).dot(axis) < 0) ang = -ang;
        _q.setFromAxisAngle(axis, ang * clamp(poleW, 0, 1) * weight);
        rotateWorld(upper, _q);
      }
    }
  }
  setWorldQuat(end, keep);
}

/**
 * World rotation for a hand whose fingers point along `along` with the palm facing `palmDir` (unit vectors,
 * orthogonalised here). side 'L'|'R'.
 */
export function handQuat(side, along, palmDir, out = new THREE.Quaternion()) {
  const [_u, _v, _n, _a, _b, _c] = H_;
  const k = side === 'L' ? 1 : -1;
  const pn = _u.copy(palmDir).normalize();
  const al = _v.copy(along).addScaledVector(pn, -along.dot(pn));
  if (al.lengthSq() < 1e-6) al.set(0, -1, 0).addScaledVector(pn, -pn.y);
  al.normalize();
  const th = _n.crossVectors(al, pn).multiplyScalar(-k);
  _mat.makeBasis(al, pn, th);
  // bind basis: along (k sin45, -cos45, 0), palm (-k/√2, -1/√2, 0), thumb (0,0,1)
  const bal = _a.set(Math.sin(ARM_ANGLE) * k, -Math.cos(ARM_ANGLE), 0), bpn = _b.set(-k * Math.SQRT1_2, -Math.SQRT1_2, 0), bth = _c.set(0, 0, 1);
  _mat2.makeBasis(bal, bpn, bth).transpose();
  _mat.multiply(_mat2);
  return out.setFromRotationMatrix(_mat);
}

/**
 * CCD: rotate `chain` (root → tip bones) so the world point returned by effector(out) reaches `target`.
 * weights per bone (0..1 share), maxAngle per bone (rad). w: overall blend.
 */
export function ccdReach(chain, weights, maxAngle, effector, target, w, iterations = 3) {
  if (w <= 1e-3) return;
  const [_a, _m, _u, _v, _n] = C_; const _q = CQ;
  for (let it = 0; it < iterations; it++) {
    for (let i = chain.length - 1; i >= 0; i--) {
      const bone = chain[i];
      bone.getWorldPosition(_a);
      effector(_m);
      _u.subVectors(_m, _a); _v.subVectors(target, _a);
      if (_u.lengthSq() < 1e-8 || _v.lengthSq() < 1e-8) continue;
      _u.normalize(); _v.normalize();
      let ang = Math.acos(clamp(_u.dot(_v), -1, 1));
      if (ang < 1e-4) continue;
      ang = Math.min(ang * weights[i] * w, maxAngle[i] / iterations);
      _n.crossVectors(_u, _v); if (_n.lengthSq() < 1e-10) continue; _n.normalize();
      _q.setFromAxisAngle(_n, ang);
      rotateWorld(bone, _q);
    }
  }
}

// ===================================================================================== locomotion calibration
const CAL = new Map();
const LEG_CH = ['hips', 'thL', 'knL', 'ftL', 'thR', 'knR', 'ftR'];
/**
 * Measure, on this body, how far the stance foot travels per locomotion cycle (→ stride that keeps the feet
 * planted) and the foot height curve (→ stance detection). Cached per proportions.
 */
export function calibrateLoco(h) {
  const L = h.look, key = `${L.sex}|${L.age}|${L.build}|${L.height}|${L.shoes?.style}`;
  if (CAL.has(key)) return CAL.get(key);
  const B = h.bones, out = {};
  const saved = h.skeleton.bones.map(b => [b, b.position.clone(), b.quaternion.clone()]);
  const N = 48;
  for (const clip of ['walk', 'run']) {
    const def = CLIPS[clip];
    const ys = new Float32Array(N), zs = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const t = (i / N) * def.duration;
      for (const [b, p] of saved) { b.position.copy(p); b.quaternion.identity(); }
      for (const ch of LEG_CH) {
        const bn = B[ALIAS[ch]]; if (!bn) continue;
        const osc = (axis) => { const o = def.osc[ch]?.[axis]; return o ? o[0] * Math.sin(2 * Math.PI * ((o[1] ?? 1) * t / def.duration + (o[2] ?? 0))) : 0; };
        _eul.set((sample(def, ch, 0, t) + osc('x')) * D2R, (sample(def, ch, 1, t) + osc('y')) * D2R, (sample(def, ch, 2, t) + osc('z')) * D2R, 'XYZ');
        bn.quaternion.setFromEuler(_eul);
      }
      const py = sample(def, 'pos', 1, t);
      B.root.position.y += py * h.spec.s;
      h.model.updateMatrixWorld(true);
      B.foot_L.getWorldPosition(_a); h.object.worldToLocal(_a);
      ys[i] = _a.y; zs[i] = _a.z;
    }
    // stance = the part of the cycle where the foot travels backwards at (about) the body speed
    const minY = Math.min(...ys);
    const vel = new Float32Array(N);
    for (let i = 0; i < N; i++) vel[i] = (zs[(i + 1) % N] - zs[(i + N - 1) % N]) * N / 2;
    let est = 0, cnt = 0;
    for (let i = 0; i < N; i++) if (ys[i] < minY + 0.05 * h.height && vel[i] < 0) { est += -vel[i]; cnt++; }
    est = cnt ? est / cnt : 1.4;
    const back = [];
    for (let i = 0; i < N; i++) if (-vel[i] > 0.6 * est) back.push(-vel[i]);
    back.sort((x, y) => x - y);
    const stride = back.length ? back[Math.floor(back.length / 2)] : est;
    const st = new Float32Array(N);
    for (let i = 0; i < N; i++) st[i] = Math.min(1, Math.max(0, (-vel[i] / stride - 0.35) / 0.3)) * (ys[i] < minY + 0.09 * h.height ? 1 : 0);
    out[clip] = { stride: Math.max(0.4, stride), st, N };
  }
  for (const [b, p, q] of saved) { b.position.copy(p); b.quaternion.copy(q); }
  h.model.updateMatrixWorld(true);
  CAL.set(key, out);
  return out;
}

/** Stance factor 0..1 of the left foot at locomotion phase ph for a calibrated clip (right foot: ph + 0.5). */
function stanceAt(cal, ph) {
  const N = cal.N, x = (((ph % 1) + 1) % 1) * N, i = Math.floor(x) % N, f = x - Math.floor(x);
  return cal.st[i] * (1 - f) + cal.st[(i + 1) % N] * f;
}

// ===================================================================================== feet
/**
 * Keeps the feet planted: during the stance of the walk/run cycle the foot is locked where it landed; standing
 * still both feet stay put and take a small step (one at a time) when the body turns or drifts away from them;
 * every foot follows the ground (height + slope) and the hips drop when a leg cannot reach.
 */
export class FootPlanter {
  constructor(h) {
    this.h = h;
    this.feet = { L: this._foot(), R: this._foot() };
    this.drop = 0; this.w = 0;
  }
  _foot() { return { lock: new THREE.Vector3(), locked: false, lw: 0, swing: null, yaw: 0, target: new THREE.Vector3(), anim: new THREE.Vector3(), q: new THREE.Quaternion() }; }
  reset() { for (const f of Object.values(this.feet)) { f.locked = false; f.lw = 0; f.swing = null; } this.drop = 0; }

  /**
   * @param {number} dt
   * @param {number} w        overall planting weight (0 while sitting/kneeling/lying or far from the camera)
   * @param {(x:number, z:number) => number} ground
   * @param {{idle:number, walk:number, run:number}} locoW  locomotion weights; phase 0..1
   */
  update(dt, w, ground, locoW, phase, cal, slope = true) {
    const h = this.h, B = h.bones, o = h.object;
    this.w += (w - this.w) * (1 - Math.exp(-10 * dt));
    if (this.w < 0.01) { this.reset(); this.drop *= Math.exp(-8 * dt); return; }
    const rootY = o.position.y, yaw = o.rotation.y, H = h.look.height;
    const loco = h.animator.current === 'locomotion';
    // 1) stance weights
    const st = {};
    for (const side of ['L', 'R']) {
      const ph = side === 'L' ? phase : phase + 0.5;
      const sw = loco ? locoW.idle + locoW.walk * stanceAt(cal.walk, ph) + locoW.run * stanceAt(cal.run, ph) : 1;
      st[side] = sw;
    }
    // 2) animated foot positions + targets
    const fwd = _d.set(Math.sin(yaw), 0, Math.cos(yaw));
    const rest = h.spec.joints.foot_L[1] * H;                    // ankle height of a flat foot
    let need = 0;
    for (const side of ['L', 'R']) {
      const f = this.feet[side], other = this.feet[side === 'L' ? 'R' : 'L'];
      B[`foot_${side}`].getWorldPosition(f.anim);
      const hAbove = f.anim.y - rootY;                         // animated ankle height above the origin
      const g = ground(f.anim.x, f.anim.z);
      const gy = Number.isFinite(g) ? g : rootY;
      const idleish = loco ? locoW.idle : 1;
      if (f.swing) {
        // idle re-step: arc from the old spot to the animated one
        const S = f.swing;
        S.t = Math.min(1, S.t + dt / S.dur);
        const e = S.t < 0.5 ? 2 * S.t * S.t : 1 - (-2 * S.t + 2) ** 2 / 2;
        S.to.set(f.anim.x, gy + rest, f.anim.z);
        f.target.lerpVectors(S.from, S.to, e); f.target.y += Math.sin(Math.PI * S.t) * 0.055 * H;
        if (S.t >= 1) { f.swing = null; f.locked = true; f.lock.copy(S.to); f.yaw = yaw; f.lw = 1; }
      } else if (st[side] > 0.55) {
        if (!f.locked) { f.locked = true; f.lock.set(f.anim.x, gy + rest, f.anim.z); f.yaw = yaw; }
        // standing: drifted / twisted too far from the pose → step (one foot at a time)
        if (idleish > 0.8 && !other.swing) {
          const dx = f.anim.x - f.lock.x, dz = f.anim.z - f.lock.z;
          let dyaw = Math.abs(yaw - f.yaw) % (Math.PI * 2); if (dyaw > Math.PI) dyaw = Math.PI * 2 - dyaw;
          if (dx * dx + dz * dz > (0.13 * H) ** 2 || dyaw > 0.6) {
            f.swing = { from: f.lock.clone(), to: new THREE.Vector3(), t: 0, dur: 0.24 };
            f.locked = false;
          }
        }
        if (f.locked) {
          const gl = ground(f.lock.x, f.lock.z);
          f.lock.y = (Number.isFinite(gl) ? gl : rootY) + Math.max(rest, Math.min(hAbove, rest + 0.03 * H) * (1 - idleish) + rest * idleish);
          f.lw = Math.min(1, f.lw + dt / 0.06);
        }
      } else {
        f.locked = false;
        f.lw = Math.max(0, f.lw - dt / 0.09);
      }
      if (!f.swing) {
        // free (swinging) foot: animated, lifted onto the ground under it
        _e.set(f.anim.x, gy + hAbove, f.anim.z);
        f.target.copy(_e).lerp(f.lock, f.lw * (f.locked || f.lw > 0 ? 1 : 0));
      }
      // hips must come down when the leg can't reach (locked foot behind, slope)
      B[`thigh_${side}`].getWorldPosition(_a);
      const legLen = h.spec.joints[`thigh_${side}`][1] * H * 0.985 - h.spec.joints[`foot_${side}`][1] * H;
      const dd = _a.distanceTo(f.target);
      if (dd > legLen) need = Math.max(need, Math.min(0.3, (dd - legLen) * 1.1));
      // ground lower than the origin under a foot (downhill)
      const below = rootY - (f.target.y - rest);
      if (below > 0) need = Math.max(need, Math.min(0.35, below * st[side]));
    }
    this.drop += (need - this.drop) * (1 - Math.exp(-14 * dt));
    if (this.drop > 1e-4) { B.root.position.y -= (this.drop * this.w) / H; B.root.updateMatrixWorld(true); }
    // 3) IK
    for (const side of ['L', 'R']) {
      const f = this.feet[side];
      const th = B[`thigh_${side}`], sh = B[`shin_${side}`], ft = B[`foot_${side}`];
      ft.getWorldQuaternion(f.q);
      const plant = Math.max(f.lw, f.swing ? 0 : 0) * this.w;
      if (slope && plant > 0.02) {
        const gn = groundNormal(ground, f.target.x, f.target.z, _n);
        _q.setFromUnitVectors(UP, gn);
        f.q.premultiply(_q2.identity().slerp(_q, plant));
      }
      th.getWorldPosition(_a);
      _b.copy(_a).addScaledVector(fwd, 1.0); _b.y -= 0.25;                // knees forward
      sh.getWorldQuaternion(_q);
      const fallback = _c.set(1, 0, 0).applyQuaternion(_q);
      twoBoneIKPole(th, sh, ft, f.target, this.w, fallback, f.q, _b, 0.6);
    }
  }
}

// ===================================================================================== support (seat / floor / bed)
/** Spheres [bone, local offset (bind units ×s), radius (bind units ×s)] whose lowest point rests on the surface. */
export const SUPPORT = {
  seat: [['hips', [0, -0.07, -0.01], 0.085], ['thigh_L', 'mid', 'thighR'], ['thigh_R', 'mid', 'thighR']],
  floor: [['hips', [0, -0.07, -0.01], 0.085], ['thigh_L', 'mid', 'thighR'], ['thigh_R', 'mid', 'thighR'], ['foot_L', 'sole', 0], ['foot_R', 'sole', 0]],
  knees: [['shin_L', [0, 0, 0.0], 'knee'], ['shin_R', [0, 0, 0.0], 'knee'], ['foot_L', 'sole', 0], ['foot_R', 'sole', 0]],
  lie: [['hips', [0, 0, 0], 0.115], ['chest', [0, 0.04, 0], 0.12], ['head', 'head', 0]],
};
/** Clip → support kind (meta.support overrides). */
export const CLIP_SUPPORT = {
  sit_down: 'seat', sit_idle: 'seat', sit_feet: 'seat', stand_up: 'seat', undress_sit: 'seat',
  sit_ground: 'floor', sit_knees: 'floor', sit_legs: 'floor', kneel: 'knees', kneel_bow: 'knees', kneel_reach: 'knees', kneel_sit: 'knees', defeat: 'knees',
  lie_back: 'lie', sleep: 'lie', lie_side: 'lie',
};

/** Lowest world y of the support spheres of `kind` on human h. */
export function lowestPoint(h, kind) {
  const B = h.bones, S = h.spec, s = S.s, M = bodyMetrics(S, h.look), H = h.look.height;
  let low = Infinity;
  for (const [bone, off, rad] of SUPPORT[kind] || []) {
    const bn = B[bone]; if (!bn) continue;
    let r;
    if (off === 'mid') {
      const child = bone.startsWith('thigh') ? B['shin' + bone.slice(5)] : null;
      bn.getWorldPosition(_a); if (child) { child.getWorldPosition(_b); _a.lerp(_b, 0.55); }
      r = M[rad](0.55) * H;
    } else if (off === 'sole') {
      surfacePoint(h, bone, { sole: true }, _a); r = 0;
    } else if (off === 'head') {
      const C = S.headC, j = S.joints.head;
      _a.set(C[0] - j[0], C[1] - j[1], C[2] - j[2]); bn.localToWorld(_a); r = S.headR[2] * H * 0.97;
    } else {
      _a.set(off[0] * s, off[1] * s, off[2] * s); bn.localToWorld(_a);
      r = (rad === 'knee' ? M.shinR(0) : rad * s) * H;
    }
    low = Math.min(low, _a.y - r);
  }
  return low;
}
