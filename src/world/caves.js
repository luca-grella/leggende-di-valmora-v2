// Caves: built lazily in far pockets from the chamber/corridor plan (layout.js). The floor is a
// vertex-coloured grid that rises into rounded rocky walls outside the walkable shape (it reads as a
// cave seen from above), with stalagmites, puddles, glowing crystals or mushrooms (bloom), a light
// shaft at the exit, and dark toon lighting (World applies the override while inside).
import * as THREE from 'three';
import { Builder } from './builder.js';
import { segDist } from './layout.js';
import { rng, smoothstep, lerp } from '../core/math.js';
import { N } from './shape.js';
import { CAVE_COLORS } from './palette.js';

/** Signed distance to the walkable cave shape (negative inside). */
export function caveSDF(C, x, z) {
  let d = Infinity;
  for (const c of C.chambers) d = Math.min(d, Math.hypot(x - c.x, z - c.z) - c.r);
  for (const s of C.corridors) d = Math.min(d, segDist(s.ax, s.az, s.bx, s.bz, x, z) - s.w / 2);
  return d + N.noise2(x * 0.18, z * 0.18) * 0.9;
}

export function buildCave(ctx, C, mats) {
  const K = CAVE_COLORS[C.id] || CAVE_COLORS.grotta_sussurro;
  const R = rng('cave-build:' + C.id);
  const [x0, z0, x1, z1] = C.box;
  const S = 1.0;
  const nx = Math.ceil((x1 - x0) / S) + 1, nz = Math.ceil((z1 - z0) / S) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
  const cF = new THREE.Color(K.floor), cW = new THREE.Color(K.wall), cT = new THREE.Color(K.wall).lerp(new THREE.Color('#ffffff'), 0.12), c = new THREE.Color();
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * S, z = z0 + j * S, k = j * nx + i;
    const d = caveSDF(C, x, z);
    const n = N.fbm(x * 0.09, z * 0.09, 3);
    const h = d < 0 ? Math.max(-0.05, n * 0.06) : smoothstep(0, 2.6, d) * (4.5 + n * 2.5) + smoothstep(3, 9, d) * 2;
    H[k] = h;
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    if (d < 0) c.copy(cF).multiplyScalar(0.92 + n * 0.12 + (N.noise2(x * 0.5, z * 0.5) > 0.55 ? -0.08 : 0));
    else c.copy(cW).lerp(cT, smoothstep(3, 6, h)).multiplyScalar(1 - 0.25 * (1 - smoothstep(0, 1.2, d)));
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b2 = a + nx; idx.push(a, b2, a + 1, b2, b2 + 1, a + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, mats.solid);
  ground.name = 'cave-ground:' + C.id; ground.receiveShadow = true;

  // decorations
  const b = new Builder({ seed: 'cavedeco' + C.id, groundAt: () => 0 });
  b.free();
  const glowCols = [K.glow, K.accent];
  const colliders = [];
  const inside = (x, z, pad) => caveSDF(C, x, z) < -pad;
  for (const ch of C.chambers) {
    // ring of stalagmites near the wall, crystals/mushrooms in clusters
    for (let k = 0; k < Math.round(ch.r * 1.4); k++) {
      const a = R() * Math.PI * 2, rr = ch.r * (0.7 + R() * 0.28), x = ch.x + Math.sin(a) * rr, z = ch.z + Math.cos(a) * rr;
      if (!inside(x, z, 0.6)) continue;
      if (R() < 0.5) { const s = 0.4 + R() * 0.5; b.cone(s, 1.6 + R() * 1.6, x, 0.7, z, K.wall, { seg: 7, grad: 0.4 }); colliders.push({ type: 'circle', x, z, r: s * 0.9 }); }
      else cluster(x, z, 0.6 + R() * 0.6);
    }
    if (R() < 0.6) { const x = ch.x + (R() - 0.5) * ch.r, z = ch.z + (R() - 0.5) * ch.r; if (inside(x, z, 2)) b.cyl(1.4 + R(), 1.4 + R(), 0.04, x, 0.02, z, K.accent === '#ffffff' ? '#bfe6ff' : '#3fa0c8', { seg: 14, mat: 'glow', sz: 0.7 }); }
  }
  function cluster(x, z, s) {
    const kind = C.id === 'grotta_sussurro' ? 'mush' : 'crystal';
    const gc = glowCols[Math.floor(R() * 2)];
    for (let k = 0; k < 3; k++) {
      const dx = (R() - 0.5) * s, dz = (R() - 0.5) * s;
      if (kind === 'mush') { b.cyl(0.07 * s * 2, 0.09 * s * 2, 0.5 * s, x + dx, 0.25 * s, z + dz, '#e8e0f0', { seg: 6 }); b.dome(0.32 * s, x + dx, 0.48 * s, z + dz, gc, { mat: 'glowAlways', sy: 0.6 }); }
      else { const h = (0.8 + R()) * s; b.cyl(0.04, 0.2 * s, h, x + dx, h / 2, z + dz, gc, { seg: 6, mat: 'glowAlways', rz: (R() - 0.5) * 0.6, rx: (R() - 0.5) * 0.6 }); }
    }
    b.glow(x, 0.6, z, gc, 1.4, 'crystal');
    colliders.push({ type: 'circle', x, z, r: 0.35 * s + 0.2 });
  }
  // exit: a warm patch of daylight on the floor and two lanterns
  const ex = C.chambers[0];
  b.cyl(2.6, 2.6, 0.03, ex.x, 0.03, ex.z + 8.4, '#fff1c8', { seg: 18, mat: 'glow', sz: 0.7 });
  b.cyl(1.7, 1.7, 0.04, ex.x, 0.05, ex.z + 8.6, '#fffbe8', { seg: 16, mat: 'glow', sz: 0.7 });
  b.glow(ex.x, 0.5, ex.z + 8.5, '#fff1c8', 2, 'crystal');
  const deco = b.build(mats.forBuilder(), { name: 'cave-deco' });
  const group = new THREE.Group(); group.name = 'cave:' + C.id;
  group.add(ground, deco);
  return {
    object: group, colliders, glows: b.glows, color: K,
    isIn: (x, z, r = 0.35) => caveSDF(C, x, z) < -r * 0.6,
    heightAt: (x, z) => { const i = (x - x0) / S, j = (z - z0) / S; const ii = Math.max(0, Math.min(nx - 2, Math.floor(i))), jj = Math.max(0, Math.min(nz - 2, Math.floor(j))); const fx = i - ii, fz = j - jj; const a = H[jj * nx + ii], b1 = H[jj * nx + ii + 1], c1 = H[(jj + 1) * nx + ii], d1 = H[(jj + 1) * nx + ii + 1]; return lerp(lerp(a, b1, fx), lerp(c1, d1, fx), fz); },
    dispose() { geo.dispose(); deco.traverse(o => o.geometry?.dispose()); group.removeFromParent(); },
  };
}
