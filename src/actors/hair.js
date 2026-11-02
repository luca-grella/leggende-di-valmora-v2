// Sculpted Sun/Moon hair and hats, built from smooth volumes: a scalp shell with a soft hairline plus
// tapered locks (bangs, side locks, back strands, tails) that hang on the hair bones so they swing.
// Private to the actors area (used by human.js).
import * as THREE from 'three';
import { ellipsoid, tube, lathe, ring, smoothProfile, col, mix, sstep } from './geo.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

/** Hats that cover the crown (spikes/curls on top are skipped under them). */
const CROWN_HATS = new Set(['cap', 'beanie', 'chef', 'guard', 'eclissi', 'sunhat']);
/** Same jaw narrowing as the head ellipsoid (human.js), so hidden shell parts stay inside the face. */
const jaw = (v, u) => { if (u.y < 0) { const k = Math.pow(-u.y, 1.6); v.x *= 1 - 0.3 * k * (u.z > -0.2 ? 1 : 0.5); } };
/** Shell "inner" factor that hides the masked-out region at 0.86 of the head radius whatever the shell scale. */
const innerFor = (scale) => Math.min(0.95, 0.86 / scale);

export function buildHair(RB, L, spec) {
  const style = L.hair.style;
  if (style === 'none') return;
  const C = spec.headC, R = spec.headR, hr = spec.hr;
  const hc = col(L.hair.color);
  const shade = (k) => () => hc.clone().multiplyScalar(k);
  const hat = L.hat?.style || null;
  const crownHidden = hat && CROWN_HATS.has(hat);
  /** point on the (scaled) head ellipsoid in direction u */
  const on = (ux, uy, uz, k = 1.08) => { const u = V(ux, uy, uz).normalize(); return V(C[0] + u.x * R[0] * k, C[1] + u.y * R[1] * k, C[2] + u.z * R[2] * k); };
  const radial = (p) => V(p.x - C[0], (p.y - C[1]) * 0.8, p.z - C[2]).normalize();
  const hairline = (u) => { const front = sstep(-0.3, 0.85, u.z); const ear = Math.exp(-((u.z - 0.05) ** 2) / 0.05) * sstep(0.6, 0.9, Math.abs(u.x)); return -0.4 + 0.84 * front + 0.32 * ear; };
  /** weights along the back chain by height (head → hair1 → hair2 → hair3) */
  const backW = (p) => {
    const y1 = spec.joints.hair1[1], y2 = spec.joints.hair2[1], y3 = spec.joints.hair3[1];
    const a = sstep(y1 + 0.02, y2, p.y), b = sstep(y2, y3, p.y);
    return [['head', (1 - a) * 0.6], ['hair1', (1 - a) * 0.4 + a * (1 - b) * 0.3], ['hair2', a * (1 - b) * 0.7 + b * 0.25], ['hair3', b * 0.75]];
  };
  const sideW = (side) => (p) => {
    const y1 = spec.joints[`hair${side}`][1], y2 = spec.joints[`hair${side}2`][1];
    const a = sstep(y1 - 0.01, y2, p.y);
    return [['head', (1 - a) * 0.5], [`hair${side}`, (1 - a) * 0.5 + a * 0.3], [`hair${side}2`, a * 0.7]];
  };
  const lock = (pts, w0, opts = {}) => tube({ points: pts, radii: opts.radii || [[0, w0], [0.45, w0 * 1.05], [0.85, w0 * 0.55], [1, 0.0008]], seg: opts.seg || 6, rings: opts.rings || 7,
    flatten: opts.flatten ?? 0.38, up: (t, c) => radial(c), capB: false });

  // ---- scalp shell ------------------------------------------------------------------------------
  if (style !== 'bald') {
    const vol = { short: 1.07, spiky: 1.06, pixie: 1.07, curly: 1.1, bob: 1.1, long: 1.09, ponytail: 1.07, bun: 1.07, braid: 1.07, twintails: 1.08 }[style] || 1.08;
    const mask = (u) => sstep(hairline(u), hairline(u) + 0.07, u.y);
    RB.add(ellipsoid({ c: C, r: R.map(r => r * vol), seg: [24, 16], shell: { mask, inner: innerFor(vol) },
      deform: (v, u) => { jaw(v, u); v.y += 0.012 * Math.max(0, u.y) * hr; if (u.z < 0) v.z *= 1.03; } }),
    { part: 'hair', bone: 'head', color: (p) => { const u = radial(p); return hc.clone().multiplyScalar(0.93 + 0.1 * sstep(-0.2, 0.9, u.y)); } });
  } else if (spec.P.age === 'elder' || spec.P.sex === 'm') {
    // fringe around the back of a bald head
    const mask = (u) => sstep(-0.35, -0.2, u.y) * (1 - sstep(0.15, 0.3, u.y)) * (1 - sstep(0.2, 0.5, u.z));
    RB.add(ellipsoid({ c: C, r: R.map(r => r * 1.05), seg: [24, 16], shell: { mask, inner: innerFor(1.05) }, deform: jaw }), { part: 'hair', bone: 'head', color: shade(0.95) });
    return;
  } else return;

  // ---- bangs ------------------------------------------------------------------------------------
  const bang = (x0, x1, yEnd, w, out = 1.1, k = 1.08) => {
    const a = on(x0, 0.82, 0.55, k), m = on((x0 + x1) * 0.6, 0.45, 0.9, out), b = on(x1, yEnd, 0.95, k + 0.02);
    return lock([a, m, b], w);
  };
  const fem = spec.P.sex === 'f';
  if (style === 'short' || style === 'spiky' || style === 'curly') {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const x = -0.5 + i / (n - 1);
      RB.add(bang(x * 0.7, x * 0.95 + 0.06, 0.38 + 0.05 * Math.abs(x), 0.03 * hr), { part: 'bangs', bone: 'head', color: shade(1.02) });
    }
  } else if (style === 'pixie') {
    for (let i = 0; i < 4; i++) {
      const x = -0.35 + i * 0.22;
      RB.add(bang(x, x + 0.35, 0.22 - i * 0.04, 0.032 * hr), { part: 'bangs', bone: 'head', color: shade(1.02) });
    }
  } else {
    // soft curtain bangs split at the centre, ending around the brows
    const n = fem ? 6 : 5;
    for (let i = 0; i < n; i++) {
      const x = -0.62 + (1.24 * i) / (n - 1);
      const side = Math.sign(x) || 1;
      RB.add(bang(x * 0.6, x + side * 0.08, 0.2 + 0.1 * Math.abs(x) ** 1.5, 0.032 * hr), { part: 'bangs', bone: 'head', color: shade(1.02) });
    }
  }

  // ---- side locks framing the face (longer styles) -----------------------------------------------
  const sideLocks = (endY, w = 0.03) => {
    for (const k of [1, -1]) {
      const a = on(0.78 * k, 0.45, 0.45), m = on(0.95 * k, -0.15, 0.32, 1.13);
      const b = V(C[0] + k * R[0] * 1.02, endY, C[2] + R[2] * 0.25);
      RB.add(lock([a, m, b], w * hr, { radii: [[0, w * hr], [0.6, w * hr * 1.05], [1, 0.002]] }), { part: 'bangs', bone: 'head', color: shade(0.98) });
    }
  };

  // ---- back/side locks ring (bob, long) ----------------------------------------------------------
  const ringLocks = (n, endY, flare, w, weights, from = 0.75, to = TAU - 0.75) => {
    for (let i = 0; i < n; i++) {
      const phi = from + (to - from) * (i / (n - 1));           // 0 = front (+z)
      const sx = Math.sin(phi), sz = Math.cos(phi);
      const a = on(sx * 0.55, 0.85, sz * 0.55, 1.06), m = on(sx, 0.15, sz, 1.14);
      const lowY = Math.min(endY + 0.05, C[1] - R[1] * 0.6);
      const b1 = V(C[0] + sx * (R[0] * 1.12 + flare * 0.6), lowY, C[2] + sz * (R[2] * 1.12 + flare * 0.6));
      const b = V(C[0] + sx * (R[0] * 1.08 + flare), endY, C[2] + sz * (R[2] * 1.06 + flare));
      const curl = V(C[0] + sx * (R[0] * 0.98 + flare * 0.6), endY - 0.012, C[2] + sz * (R[2] * 0.98 + flare * 0.6));
      RB.add(lock([a, m, b1, b, curl], w * hr, { rings: 9, radii: [[0, w * hr * 0.8], [0.4, w * hr * 1.1], [0.85, w * hr * 0.9], [1, 0.004]] }),
        { part: 'hair', color: shade(0.92 + 0.08 * ((i % 2) ? 1 : 0.6)), weights });
    }
  };

  const headOnly = () => [['head', 1]];
  switch (style) {
    case 'bob':
      ringLocks(11, C[1] - R[1] * 0.92, 0.02, 0.05, headOnly);
      sideLocks(C[1] - R[1] * 0.85, 0.032);
      break;
    case 'long': {
      sideLocks(C[1] - R[1] * 1.25, 0.03);
      ringLocks(9, C[1] - R[1] * 0.75, 0.02, 0.05, headOnly, 0.95, TAU - 0.95);
      // back curtain: strands down to the shoulder blades
      const endY = spec.joints.hair3[1] - 0.06 * spec.s;
      const n = 7;
      for (let i = 0; i < n; i++) {
        const x = (-1 + (2 * i) / (n - 1));
        const a = on(x * 0.5, 0.6, -0.75, 1.07), m = on(x * 0.85, -0.25, -0.92, 1.16);
        const b = V(C[0] + x * R[0] * 0.95, C[1] - R[1] * 1.3, C[2] - R[2] * 1.05 + Math.abs(x) * 0.02);
        const e = V(C[0] + x * R[0] * 0.85, endY, C[2] - R[2] * 0.85 - 0.03 + Math.abs(x) * 0.03);
        RB.add(lock([a, m, b, e], 0.048 * hr, { rings: 10, radii: [[0, 0.04 * hr], [0.4, 0.055 * hr], [0.85, 0.045 * hr], [1, 0.003]], flatten: 0.45 }),
          { part: 'hair', color: shade(0.9 + 0.1 * (i % 2)), weights: backW });
      }
      break;
    }
    case 'ponytail': {
      sideLocks(C[1] - R[1] * 0.55, 0.026);
      const tie = V(...spec.joints.hair1).add(V(0, 0.01, -0.035 * hr));
      RB.add(ring({ c: tie.toArray(), R: 0.03 * hr, r: 0.011 * hr, seg: [6, 14], rot: [0.5, 0, 0] }), { part: 'hair', bone: 'hair1', color: () => col(L.top?.accent || '#ff5f9e') });
      const pts = [tie.clone().add(V(0, 0.005, -0.01)), tie.clone().add(V(0, -0.02, -0.09 * hr)), tie.clone().add(V(0, -0.2 * hr, -0.13 * hr)), tie.clone().add(V(0, -0.42 * hr, -0.09 * hr)), tie.clone().add(V(0, -0.55 * hr, -0.04 * hr))];
      RB.add(tube({ points: pts, radii: [[0, 0.035 * hr], [0.2, 0.06 * hr], [0.55, 0.055 * hr], [0.9, 0.025 * hr], [1, 0.002]], seg: 9, rings: 12, flatten: 0.85, up: [1, 0, 0] }),
        { part: 'hair', color: shade(0.96), weights: backW });
      break;
    }
    case 'twintails':
      sideLocks(C[1] - R[1] * 0.6, 0.026);
      for (const [side, k] of [['L', 1], ['R', -1]]) {
        const tie = V(...spec.joints[`hair${side}`]).add(V(0.015 * k, 0, 0));
        RB.add(ring({ c: tie.toArray(), R: 0.026 * hr, r: 0.01 * hr, seg: [6, 12], rot: [0, 0, Math.PI / 2 + 0.6 * k] }), { part: 'hair', bone: `hair${side}`, color: () => col(L.top?.accent || '#ff5f9e') });
        const pts = [tie.clone(), tie.clone().add(V(0.07 * k * hr, -0.04 * hr, -0.03 * hr)), tie.clone().add(V(0.11 * k * hr, -0.22 * hr, -0.05 * hr)), tie.clone().add(V(0.09 * k * hr, -0.46 * hr, -0.02 * hr))];
        RB.add(tube({ points: pts, radii: [[0, 0.03 * hr], [0.25, 0.05 * hr], [0.7, 0.042 * hr], [1, 0.002]], seg: 8, rings: 10, flatten: 0.8, up: [0, 0, 1] }),
          { part: 'hair', color: shade(0.97), weights: sideW(side) });
      }
      break;
    case 'bun': {
      sideLocks(C[1] - R[1] * 0.5, 0.024);
      const bc = on(0, 0.62, -0.78, 1.18);
      RB.add(ellipsoid({ c: bc.toArray(), r: [0.075 * hr, 0.07 * hr, 0.07 * hr], seg: [14, 10], deform: (v, u) => { v.multiplyScalar(1 + 0.06 * Math.sin(u.x * 9 + u.y * 7)); } }), { part: 'hair', bone: 'hair1', color: shade(0.97) });
      RB.add(ring({ c: on(0, 0.55, -0.72, 1.1).toArray(), R: 0.05 * hr, r: 0.011 * hr, seg: [6, 14], rot: [1.1, 0, 0] }), { part: 'hair', bone: 'hair1', color: () => col(L.top?.accent || '#ffd23f') });
      break;
    }
    case 'braid': {
      sideLocks(C[1] - R[1] * 0.6, 0.026);
      const start = on(0, -0.45, -0.95, 1.08);
      const pts = [start, start.clone().add(V(0.02, -0.12 * hr, -0.04 * hr)), start.clone().add(V(0.03, -0.3 * hr, -0.03 * hr)), start.clone().add(V(0.02, -0.55 * hr, 0))];
      const curve = new THREE.CatmullRomCurve3(pts);
      const N = 8;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1), p = curve.getPointAt(t), r = (0.045 - 0.018 * t) * hr;
        RB.add(ellipsoid({ c: p.toArray(), r: [r, r * 1.25, r * 0.9], seg: [10, 8], rot: [0.2, 0, (i % 2 ? 0.45 : -0.45)] }), { part: 'hair', color: shade(i % 2 ? 0.92 : 1), weights: backW });
      }
      const end = curve.getPointAt(1);
      RB.add(ring({ c: end.clone().add(V(0, -0.02 * hr, 0)).toArray(), R: 0.018 * hr, r: 0.008 * hr, seg: [6, 10], rot: [Math.PI / 2, 0, 0] }), { part: 'hair', color: () => col(L.top?.accent || '#ff5f9e'), weights: backW });
      RB.add(lock([end.clone().add(V(0, -0.02 * hr, 0)), end.clone().add(V(0, -0.08 * hr, 0.01))], 0.03 * hr, { radii: [[0, 0.025 * hr], [0.4, 0.032 * hr], [1, 0.002]], flatten: 0.7 }), { part: 'hair', color: shade(0.95), weights: backW });
      break;
    }
    case 'spiky':
      if (!crownHidden) {
        const dirs = [[0, 1, 0.1], [0.45, 0.85, -0.2], [-0.45, 0.85, -0.2], [0.2, 0.7, -0.65], [-0.2, 0.7, -0.65], [0.65, 0.5, -0.45], [-0.65, 0.5, -0.45], [0, 0.4, -0.9], [0.3, 0.95, 0.35], [-0.3, 0.95, 0.35]];
        for (const d of dirs) {
          const u = V(...d).normalize();
          const a = on(u.x, u.y, u.z, 0.95), b = on(u.x * 1.1, u.y * 1.05 + 0.15, u.z * 1.25 - 0.25, 1.5);
          RB.add(tube({ points: [a, a.clone().lerp(b, 0.5).add(V(0, 0.01, -0.01)), b], radii: [[0, 0.055 * hr], [0.6, 0.03 * hr], [1, 0.001]], seg: 7, rings: 7, flatten: 0.6, up: Math.hypot(u.x, u.z) > 0.2 ? [u.z, 0, -u.x] : [1, 0, 0], capB: false }),
            { part: 'hair', bone: 'head', color: shade(0.98) });
        }
      }
      break;
    case 'curly': {
      const N = crownHidden ? 40 : 70;
      for (let i = 0; i < N; i++) {
        const y = 1 - ((i + 0.5) / N) * 2, rr = Math.sqrt(1 - y * y), a = i * 2.39996;
        const u = V(Math.cos(a) * rr, y, Math.sin(a) * rr);
        if (u.y < hairline(u) + 0.1) continue;
        if (crownHidden && u.y > 0.15) continue;
        RB.add(ellipsoid({ c: on(u.x, u.y, u.z, 1.12).toArray(), r: [0.04 * hr, 0.038 * hr, 0.04 * hr], seg: [6, 4] }), { part: 'hair', bone: 'head', color: () => hc.clone().multiplyScalar(0.88 + (i % 3) * 0.07) });
      }
      if (fem) ringLocks(7, C[1] - R[1] * 0.9, 0.035, 0.05, headOnly, 1.1, TAU - 1.1);
      break;
    }
    case 'short':
      // sideburns + nape
      for (const k of [1, -1]) RB.add(lock([on(0.85 * k, 0.25, 0.25), on(0.97 * k, -0.25, 0.2, 1.04)], 0.022 * hr), { part: 'hair', bone: 'head', color: shade(0.95) });
      break;
    case 'pixie':
      for (const k of [1, -1]) RB.add(lock([on(0.8 * k, 0.3, 0.35), on(0.97 * k, -0.3, 0.25, 1.06)], 0.026 * hr), { part: 'hair', bone: 'head', color: shade(0.95) });
      RB.add(lock([on(0, 0.2, -0.95), on(0, -0.45, -0.95, 1.07)], 0.06 * hr, { flatten: 0.3 }), { part: 'hair', bone: 'head', color: shade(0.94) });
      break;
    default: break;
  }
}

// ------------------------------------------------------------------------------------------------
export function buildHat(RB, L, spec) {
  const t = L.hat?.style; if (!t) return;
  const C = spec.headC, R = spec.headR, hr = spec.hr;
  const H = spec.joints.hat;
  const hc = col(L.hat.color || '#e8674a');
  const dark = (k = 0.25) => () => mix(hc, '#000', k);
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0, 0));
  const rel = (g) => { g.applyQuaternion(tilt); g.translate(H[0], H[1], H[2]); return g; };
  const shell = (mask, scale, inner = innerFor(scale), deform = null) => ellipsoid({ c: C, r: R.map(r => r * scale), seg: [24, 16], shell: { mask, inner }, deform: (v, u) => { jaw(v, u); deform?.(v, u); } });
  const hairPad = L.hair.style === 'curly' ? 1.05 : 1;
  switch (t) {
    case 'cap': {
      RB.add(shell(u => sstep(0.1, 0.2, u.y + 0.14 * Math.max(0, -u.z) - 0.05 * Math.max(0, u.z)), 1.16 * hairPad), { part: 'hat', bone: 'hat', color: (p) => (p.z > C[2] + R[2] * 0.7 && p.y > C[1] + R[1] * 0.35 && Math.abs(p.x) < 0.05 * hr ? col('#ffffff') : hc) });
      RB.add(ellipsoid({ c: [0, C[1] + R[1] * 0.42, C[2] + R[2] * 1.02], r: [0.13 * hr, 0.014 * hr, 0.1 * hr], seg: [14, 6], deform: (v) => { if (v.z < 0) v.z *= 0.2; v.y -= 0.9 * v.z * v.z; } }), { part: 'hat', bone: 'hat', color: dark(0.18) });
      RB.add(ellipsoid({ c: [0, C[1] + R[1] * 1.17 * hairPad, C[2]], r: [0.018 * hr, 0.012 * hr, 0.018 * hr], seg: [8, 6] }), { part: 'hat', bone: 'hat', color: dark(0.2) });
      break;
    }
    case 'beanie': {
      RB.add(shell(u => sstep(0.16, 0.24, u.y + 0.1 * u.z - 0.12 * Math.max(0, -u.z)), 1.17 * hairPad, 0.9, (v, u) => { if (u.y > 0.3) v.y += 0.02 * hr * u.y; }), { part: 'hat', bone: 'hat', color: (p) => hc.clone().multiplyScalar(0.94 + 0.08 * (Math.round(Math.atan2(p.x, p.z) * 7) % 2)) });
      RB.add(lathe({ origin: [C[0], C[1] + R[1] * 0.3, C[2]], rows: [[-0.035 * hr, R[0] * 1.13, R[2] * 1.13], [-0.025 * hr, R[0] * 1.19, R[2] * 1.19], [0.03 * hr, R[0] * 1.17, R[2] * 1.17], [0.04 * hr, R[0] * 1.1, R[2] * 1.1]], seg: 28 }), { part: 'hat', bone: 'hat', color: dark(0.15) });
      RB.add(ellipsoid({ c: [C[0], C[1] + R[1] * 1.28, C[2] - 0.01], r: [0.045 * hr, 0.042 * hr, 0.045 * hr], seg: [10, 8] }), { part: 'hat', bone: 'hat', color: () => mix(hc, '#fff', 0.6) });
      break;
    }
    case 'sunhat': {
      const yb = -0.01 * hr, BR = 0.36 * hr;
      const droop = r => -0.045 * hr * ((r - 0.17 * hr) / (BR - 0.17 * hr)) ** 2;
      const rs = [0.17, 0.2, 0.24, 0.28, 0.32, 0.36].map(x => x * hr);
      const top = rs.map(r => [yb + droop(r) + 0.007, r, r]);
      const rim = [[yb + droop(BR + 0.008) + 0.002, BR + 0.008, BR + 0.008], [yb + droop(BR + 0.008) - 0.006, BR + 0.006, BR + 0.006]];
      const bot = rs.slice().reverse().map(r => [yb + droop(r) - 0.007, r, r]);
      RB.add(rel(lathe({ rows: [...top, ...rim, ...bot].reverse(), seg: 36 })), { part: 'hat', bone: 'hat', color: (p) => hc.clone().multiplyScalar(Math.round(Math.hypot(p.x - H[0], p.z - H[2]) / 0.03) % 2 ? 0.95 : 1.03) });
      RB.add(rel(lathe({ rows: smoothProfile([[yb, 0.18 * hr], [yb + 0.05 * hr, 0.178 * hr], [yb + 0.1 * hr, 0.16 * hr], [yb + 0.13 * hr, 0.11 * hr], [yb + 0.14 * hr, 0.0]], 10).map(([y, r]) => [y, r, r * 0.97]), seg: 28 })), { part: 'hat', bone: 'hat', color: () => hc });
      RB.add(rel(lathe({ rows: [[yb + 0.004, 0.0], [yb + 0.005, 0.184 * hr], [yb + 0.04 * hr, 0.183 * hr], [yb + 0.045 * hr, 0.176 * hr]], seg: 28 })), { part: 'hat', bone: 'hat', color: () => col(L.hat.accent || '#ff5f9e') });
      RB.add(rel(ellipsoid({ c: [0.16 * hr, yb + 0.03 * hr, 0.07 * hr], r: [0.03 * hr, 0.03 * hr, 0.04 * hr], seg: [8, 6] })), { part: 'hat', bone: 'hat', color: () => col(L.hat.accent || '#ff5f9e') });
      break;
    }
    case 'chef': {
      RB.add(rel(lathe({ rows: [[-0.03 * hr, 0.0], [-0.029 * hr, R[0] * 1.15], [0.05 * hr, R[0] * 1.16], [0.055 * hr, 0.0]], seg: 26 })), { part: 'hat', bone: 'hat', color: 0xffffff });
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; RB.add(rel(ellipsoid({ c: [Math.sin(a) * 0.09 * hr, 0.14 * hr, Math.cos(a) * 0.09 * hr], r: [0.095 * hr, 0.09 * hr, 0.095 * hr], seg: [9, 7] })), { part: 'hat', bone: 'hat', color: 0xf8f8f4 }); }
      RB.add(rel(ellipsoid({ c: [0, 0.18 * hr, 0], r: [0.12 * hr, 0.09 * hr, 0.12 * hr], seg: [11, 8] })), { part: 'hat', bone: 'hat', color: 0xffffff });
      break;
    }
    case 'guard': case 'eclissi': {
      const guard = t === 'guard';
      const yb = -0.02 * hr;
      const rows = smoothProfile([[yb, 0.0], [yb + 0.001, R[0] * 1.12], [yb + 0.05 * hr, R[0] * 1.13], [yb + 0.11 * hr, R[0] * (guard ? 1.3 : 1.22)], [yb + 0.135 * hr, R[0] * (guard ? 1.28 : 1.15)], [yb + 0.145 * hr, 0.0]], 12).map(([y, r]) => [y, r, r * 0.97]);
      RB.add(rel(lathe({ rows, seg: 28 })), { part: 'hat', bone: 'hat', color: (p) => (p.y - H[1] < yb + 0.045 * hr ? (guard ? col('#1b2440') : col('#ffd23f')) : hc) });
      RB.add(rel(ellipsoid({ c: [0, yb + 0.012 * hr, R[2] * 1.05], r: [0.12 * hr, 0.012 * hr, 0.08 * hr], seg: [14, 6], deform: (v) => { if (v.z < 0) v.z *= 0.25; v.y -= 0.8 * v.z * v.z; } })), { part: 'hat', bone: 'hat', color: guard ? 0x14161e : 0x2a1840 });
      if (guard) RB.add(rel(ellipsoid({ c: [0, yb + 0.085 * hr, R[2] * 1.18], r: [0.025 * hr, 0.03 * hr, 0.008 * hr], seg: [8, 6], rot: [-0.3, 0, 0] })), { part: 'hat', bone: 'hat', color: 0xffd23f });
      else RB.add(rel(ring({ c: [0, yb + 0.085 * hr, R[2] * 1.14], R: 0.026 * hr, r: 0.007 * hr, seg: [5, 12], rot: [-0.3, 0, 0.6], arc: 4.2 })), { part: 'hat', bone: 'hat', color: 0xffd23f });
      break;
    }
    default: break;
  }
}
