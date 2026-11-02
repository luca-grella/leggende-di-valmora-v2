// Island shapes and the base (un-flattened) relief. Pure math, no three.js: used by the layout
// generator (route heights, bridge detection) and by the heightfield (towns/routes flattening on top).
import { createNoise, clamp, smoothstep, lerp } from '../core/math.js';

export const N = createNoise(7171);
export const N2 = createNoise(9091);

const MESAS = [[-470, 330, 26, 7.5], [-360, 450, 22, 6.5], [-540, 380, 20, 8], [-470, 470, 18, 6], [-330, 400, 14, 5.5], [-560, 450, 16, 7]];

/**
 * @param {any[]} islands ISLANDS from map.js
 */
export function createShape(islands) {
  const isl = islands.map(i => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [cx, cz, rx, rz] of i.lobes) { x0 = Math.min(x0, cx - rx); x1 = Math.max(x1, cx + rx); z0 = Math.min(z0, cz - rz); z1 = Math.max(z1, cz + rz); }
    return { ...i, box: [x0 - 70, z0 - 70, x1 + 70, z1 + 70] };
  });

  /** Signed distance to the coast in metres (approx, positive on land) and the island. */
  function coastOf(I, x, z) {
    let best = -1e9;
    for (const [cx, cz, rx, rz] of I.lobes) {
      const dx = (x - cx) / rx, dz = (z - cz) / rz;
      const e = Math.sqrt(dx * dx + dz * dz);
      const k = Math.min(rx, rz) * 0.6 + Math.max(rx, rz) * 0.4;
      const s = (1 - e) * k;
      if (s > best) best = s;
    }
    // wobbly coastline
    best += N.noise2(x * 0.018, z * 0.018) * 10 + N.noise2(x * 0.06 + 3.1, z * 0.06) * 3;
    return best;
  }

  /** {island, s} for the island with the largest coast distance at x,z. */
  function islandAt(x, z) {
    let bi = null, bs = -1e9;
    for (const I of isl) {
      const b = I.box;
      if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
      const s = coastOf(I, x, z);
      if (s > bs) { bs = s; bi = I; }
    }
    return { island: bi, s: bi ? bs : -200 };
  }

  function feature(I, x, z, s) {
    const f = I.feature; if (!f) return 0;
    if (f.kind === 'peak') {
      const d = Math.hypot(x - f.x, z - f.z);
      const k = 1 - smoothstep(0, f.r, d);
      return f.h * k * k * (3 - 2 * k) * 0.9 + N.ridged(x * 0.03, z * 0.03, 3) * 2 * k;
    }
    if (f.kind === 'volcano') {
      const d = Math.hypot(x - f.x, z - f.z);
      const cone = Math.pow(1 - smoothstep(0, f.r, d), 1.4) * f.h;
      const crater = (1 - smoothstep(6, 13, d)) * 9;
      return cone - crater;
    }
    if (f.kind === 'mesas') {
      let h = 0;
      for (const [mx, mz, r, mh] of MESAS) {
        const d = Math.hypot(x - mx, z - mz) + N.noise2(x * 0.08, z * 0.08) * 3;
        h = Math.max(h, mh * (1 - smoothstep(r - 2.5, r + 1.5, d)));
      }
      return h;
    }
    return 0;
  }

  /** Base relief without towns/routes (metres, sea level 0). */
  function baseHeight(x, z) {
    const { island: I, s } = islandAt(x, z);
    if (!I || s < 0) {
      const d = I ? -s : 200;
      return Math.max(-9, -0.12 - 0.11 * d - 0.0045 * d * d);
    }
    const beach = 0.15 + 0.8 * smoothstep(0, 9, s);
    const inland = smoothstep(6, 34, s);
    const hills = I.hills * (N.fbm(x * 0.011, z * 0.011, 3) * 2.2 + 1.3 + N2.noise2(x * 0.03, z * 0.03) * 0.6);
    return beach + inland * Math.max(0.3, hills) + feature(I, x, z, s);
  }

  return { islands: isl, islandAt, coastOf, baseHeight, feature, MESAS };
}

/** Closest point on a polyline: returns {d, s (arc length), i (segment), t, x, z, dx, dz (unit dir)}. */
export function polyQuery(poly, x, z, out = {}) {
  const P = poly.pts, S = poly.cum;
  let bd = Infinity;
  for (let i = 0; i < P.length - 1; i++) {
    const ax = P[i][0], az = P[i][1], bx = P[i + 1][0], bz = P[i + 1][1];
    const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
    let t = ((x - ax) * vx + (z - az) * vz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + vx * t, pz = az + vz * t, d = Math.hypot(x - px, z - pz);
    if (d < bd) { bd = d; const L = Math.sqrt(L2); out.d = d; out.i = i; out.t = t; out.x = px; out.z = pz; out.s = S[i] + L * t; out.dx = vx / L; out.dz = vz / L; }
  }
  return out;
}

/** Catmull-Rom resample of control points every `step` metres → {pts, cum, length, box}. */
export function makePoly(ctrl, step = 2) {
  const pts = [];
  const P = ctrl;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const segL = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(segL / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push([P[P.length - 1][0], P[P.length - 1][1]]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { pts, cum, length: cum[cum.length - 1], box: [x0, z0, x1, z1] };
}

/** Point + direction at arc length s. */
export function polyAt(poly, s) {
  const { pts, cum } = poly;
  s = clamp(s, 0, poly.length);
  let i = 0; while (i < cum.length - 2 && cum[i + 1] < s) i++;
  const L = cum[i + 1] - cum[i] || 1, t = (s - cum[i]) / L;
  const dx = (pts[i + 1][0] - pts[i][0]) / L, dz = (pts[i + 1][1] - pts[i][1]) / L;
  return { x: lerp(pts[i][0], pts[i + 1][0], t), z: lerp(pts[i][1], pts[i + 1][1], t), dx, dz, i, t };
}
