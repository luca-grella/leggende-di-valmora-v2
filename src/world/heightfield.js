// Final terrain height: base island relief + plateaus (camp cliffs, cave mounds) + flattened towns,
// routes and paths + the carved river. Analytic everywhere; islands that are built bake a 1.5 m grid
// so heightAt() matches the rendered triangles exactly (feet never float or sink).
import { clamp, smoothstep, lerp } from '../core/math.js';
import { makePoly, polyQuery, N } from './shape.js';

export const GRID = 1.5;

export function createHeightfield(L) {
  const { shape, towns, routes, paths, plateaus, rivers } = L;
  const townList = Object.values(towns);
  const routeList = Object.values(routes);
  const q = {};

  for (const p of plateaus) p.top = shape.baseHeight(p.x, p.z) + p.h;

  /** Height before routes/paths (used to profile spur paths). */
  function heightTowns(x, z) {
    let h = shape.baseHeight(x, z);
    for (const p of plateaus) {
      const dx = x - p.x, dz = z - p.z; if (dx * dx + dz * dz > (p.r + 10) ** 2) continue;
      const d = Math.sqrt(dx * dx + dz * dz) + N.noise2(x * 0.15, z * 0.15) * 1.2;
      const k = p.cliff ? 1 - smoothstep(p.r - 1.5, p.r + 1.0, d) : Math.pow(1 - smoothstep(0, p.r + 6, d), 0.8);
      const top = p.mound ? p.top + N.noise2(x * 0.3, z * 0.3) * 1.2 : p.top;
      h = Math.max(h, lerp(h, top, k));
    }
    for (const T of townList) {
      const dx = x - T.x, dz = z - T.z; if (Math.abs(dx) > T.r + 16 || Math.abs(dz) > T.r + 16) continue;
      const d = Math.sqrt(dx * dx + dz * dz);
      const w = 1 - smoothstep(T.r - 8, T.r + 14, d);
      if (w > 0) h = lerp(h, T.base + N.noise2(x * 0.05, z * 0.05) * 0.12, w);
    }
    return h;
  }

  // spur/link path profiles
  for (const p of paths) {
    p.poly = makePoly(p.pts, 2);
    p.hw = p.width / 2;
    if (!p.flatten) continue;
    const n = p.poly.pts.length;
    let prof = p.poly.pts.map(([x, z]) => Math.max(0.6, heightTowns(x, z)));
    const a0 = prof[0], a1 = prof[n - 1];
    for (let pass = 0; pass < 3; pass++) {
      const out = prof.slice();
      for (let i = 1; i < n - 1; i++) { let s = 0, w = 0; for (let k = -3; k <= 3; k++) { const j = clamp(i + k, 0, n - 1); s += prof[j]; w++; } out[i] = s / w; }
      prof = out; prof[0] = a0; prof[n - 1] = a1;
    }
    p.prof = prof;
  }
  const profAt = (p, s) => { const n = p.prof.length, f = clamp(s / p.poly.length, 0, 1) * (n - 1), i = Math.min(n - 2, Math.floor(f)); return lerp(p.prof[i], p.prof[i + 1], f - i); };
  const inBox = (b, x, z, pad) => x > b[0] - pad && x < b[2] + pad && z > b[1] - pad && z < b[3] + pad;

  /** Full analytic height (metres). */
  function heightRaw(x, z) {
    let h = heightTowns(x, z);
    for (const Rt of routeList) {
      const hw = Rt.width / 2;
      if (!inBox(Rt.poly.box, x, z, hw + 10)) continue;
      polyQuery(Rt.poly, x, z, q);
      if (q.d > hw + 9 || Rt.inBridge(q.s)) continue;
      const w = 1 - smoothstep(hw + 0.6, hw + 9, q.d);
      h = lerp(h, Rt.heightAtS(q.s), w);
    }
    for (const p of paths) {
      if (!p.flatten || !inBox(p.poly.box, x, z, p.hw + 6)) continue;
      polyQuery(p.poly, x, z, q);
      if (q.d > p.hw + 5) continue;
      h = lerp(h, profAt(p, q.s), 1 - smoothstep(p.hw + 0.4, p.hw + 5, q.d));
    }
    for (const rv of rivers) {
      if (!inBox(rv.poly.box, x, z, rv.width)) continue;
      polyQuery(rv.poly, x, z, q);
      const hw = rv.width / 2;
      if (q.d < hw + 4) h = Math.min(h, lerp(-0.85, h, smoothstep(hw - 2, hw + 3.5, q.d + N.noise2(x * 0.2, z * 0.2) * 0.6)));
    }
    return h;
  }

  // ---- baked grids per island -------------------------------------------------------------------
  // Rasterised: towns/plateaus per cell, then routes, paths and rivers are stamped segment by segment
  // (nearest point per cell, exactly like heightRaw) — O(segments × nearby cells) instead of
  // O(cells × segments). Also produces RD: distance to the nearest path edge (verge shading).
  const grids = new Map();   // island id → {x0, z0, nx, nz, H, RD}
  function bake(island) { const g = bakeGen(island); let r = g.next(); while (!r.done) r = g.next(); return r.value; }
  function* bakeGen(island) {
    if (grids.has(island)) return grids.get(island);
    const I = shape.islands.find(i => i.id === island);
    const [bx0, bz0, bx1, bz1] = I.box;
    const x0 = Math.floor(bx0 / GRID) * GRID, z0 = Math.floor(bz0 / GRID) * GRID;
    const nx = Math.ceil((bx1 - x0) / GRID) + 1, nz = Math.ceil((bz1 - z0) / GRID) + 1;
    const H = new Float32Array(nx * nz), RD = new Float32Array(nx * nz).fill(99);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) H[j * nx + i] = heightTowns(x0 + i * GRID, z0 + j * GRID);
      if (j % 8 === 7) yield;
    }
    const D = new Float32Array(nx * nz).fill(1e9), S = new Float32Array(nx * nz);
    const touched = [];
    const stamp = (pts, cum, R) => {
      touched.length = 0;
      for (let k = 0; k < pts.length - 1; k++) {
        const ax = pts[k][0], az = pts[k][1], bx = pts[k + 1][0], bz = pts[k + 1][1];
        const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1, Ls = Math.sqrt(L2);
        const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - x0) / GRID)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + R - x0) / GRID));
        const j0 = Math.max(0, Math.floor((Math.min(az, bz) - R - z0) / GRID)), j1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz) + R - z0) / GRID));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = x0 + i * GRID, z = z0 + j * GRID;
          let t = ((x - ax) * vx + (z - az) * vz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = ax + vx * t - x, pz = az + vz * t - z, d = Math.sqrt(px * px + pz * pz);
          const c = j * nx + i;
          if (D[c] === 1e9) touched.push(c);
          if (d < D[c]) { D[c] = d; S[c] = cum[k] + Ls * t; }
        }
      }
    };
    const reset = () => { for (const c of touched) D[c] = 1e9; };
    const boxHit = (b, pad) => !(b[2] + pad < x0 || b[0] - pad > x0 + nx * GRID || b[3] + pad < z0 || b[1] - pad > z0 + nz * GRID);
    for (const Rt of routeList) {
      const hw = Rt.width / 2;
      if (!boxHit(Rt.poly.box, hw + 10)) continue;
      stamp(Rt.poly.pts, Rt.poly.cum, hw + 9);
      for (const c of touched) {
        const d = D[c];
        RD[c] = Math.min(RD[c], d - hw);
        if (d > hw + 9 || Rt.inBridge(S[c])) continue;
        const w = 1 - smoothstep(hw + 0.6, hw + 9, d);
        H[c] = lerp(H[c], Rt.heightAtS(S[c]), w);
      }
      reset(); yield;
    }
    for (const p of paths) {
      if (!boxHit(p.poly.box, p.hw + 6)) continue;
      stamp(p.poly.pts, p.poly.cum, p.hw + 5);
      for (const c of touched) {
        const d = D[c];
        RD[c] = Math.min(RD[c], d - p.hw);
        if (!p.flatten || d > p.hw + 5) continue;
        H[c] = lerp(H[c], profAt(p, S[c]), 1 - smoothstep(p.hw + 0.4, p.hw + 5, d));
      }
      reset();
    }
    for (const rv of rivers) {
      const hw = rv.width / 2;
      if (!boxHit(rv.poly.box, rv.width)) continue;
      stamp(rv.poly.pts, rv.poly.cum, hw + 4);
      for (const c of touched) {
        const d = D[c]; if (d >= hw + 4) continue;
        const x = x0 + (c % nx) * GRID, z = z0 + Math.floor(c / nx) * GRID;
        H[c] = Math.min(H[c], lerp(-0.85, H[c], smoothstep(hw - 2, hw + 3.5, d + N.noise2(x * 0.2, z * 0.2) * 0.6)));
      }
      reset();
    }
    const g = { island, x0, z0, nx, nz, H, RD, x1: x0 + (nx - 1) * GRID, z1: z0 + (nz - 1) * GRID };
    grids.set(island, g);
    return g;
  }
  function drop(island) { grids.delete(island); }

  function gridHeight(g, x, z) {
    const gx = (x - g.x0) / GRID, gz = (z - g.z0) / GRID;
    const i = Math.floor(gx), j = Math.floor(gz);
    if (i < 0 || j < 0 || i >= g.nx - 1 || j >= g.nz - 1) return null;
    const fx = gx - i, fz = gz - j, H = g.H, nx = g.nx;
    const a = H[j * nx + i], d = H[j * nx + i + 1], b = H[(j + 1) * nx + i], c = H[(j + 1) * nx + i + 1];
    if (fx + fz <= 1) return a + (d - a) * fx + (b - a) * fz;
    return c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
  }

  let lastGrid = null;
  /** Terrain height at x,z (grid when baked, analytic otherwise). */
  function heightAt(x, z) {
    if (lastGrid) { const h = gridHeight(lastGrid, x, z); if (h != null) return h; }
    for (const g of grids.values()) { const h = gridHeight(g, x, z); if (h != null) { lastGrid = g; return h; } }
    return heightRaw(x, z);
  }
  function slopeAt(x, z) {
    const e = 0.6;
    return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  }

  return { heightRaw, heightTowns, heightAt, slopeAt, bake, bakeGen, drop, grids, gridHeight };
}
