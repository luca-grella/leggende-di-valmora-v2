// Terrain per island: frustum-culled chunks baked from the 1.5 m heightfield, smooth vertex colours
// for sand/sea bed plus per-vertex masks (grass, path, plaza, rock, tall-grass shade) that a toon
// shader turns into crisp, slightly wobbly Sun/Moon style edges: cobbled plazas, dirt paths with a
// rim, banded cliffs. Also bakes the water data texture (depth + distance to shore) for the sea.
import * as THREE from 'three';
import { clamp, smoothstep, lerp } from '../core/math.js';
import { polyQuery, N } from './shape.js';
import { GRID } from './heightfield.js';
import { segDist } from './layout.js';

const CHUNK = 32;
export const GLSL_NOISE = /* glsl */`
float vhash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(vhash(i), vhash(i + vec2(1., 0.)), u.x), mix(vhash(i + vec2(0., 1.)), vhash(i + 1.), u.x), u.y); }
`;

/** Terrain toon material for an island (own MeshToonMaterial on the shared ramp). */
export function terrainMaterial(ctx, colors) {
  const C = c => new THREE.Color(c);
  const mat = ctx.toon.matUnique('#ffffff', { vertexColors: true });
  const U = {
    uGrassA: { value: C(colors.grass) }, uGrassB: { value: C(colors.grass2) }, uGrassC: { value: C(colors.meadow) }, uGrassD: { value: C(colors.grassDark) },
    uPath: { value: C(colors.path) }, uPath2: { value: C(colors.path2) }, uPlaza: { value: C(colors.plaza) }, uPlaza2: { value: C(colors.plaza2) },
    uRock: { value: C(colors.rock) }, uRockDark: { value: C(colors.rockDark) }, uCliff: { value: C(colors.cliff) }, uSnow: { value: colors.snow || 0 },
  };
  mat.userData.U = U;
  const baseCompile = mat.onBeforeCompile;
  const baseKey = mat.customProgramCacheKey?.() || '';
  mat.onBeforeCompile = (sh, r) => {
    baseCompile?.call(mat, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGrass;\nattribute vec4 aMask;\nvarying float vGrass;\nvarying vec4 vMask;\nvarying vec3 vWPos;\nvarying float vNy;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrass = aGrass; vMask = aMask; vWPos = (modelMatrix * vec4(position, 1.0)).xyz; vNy = normal.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vGrass; varying vec4 vMask; varying vec3 vWPos; varying float vNy;
uniform vec3 uGrassA, uGrassB, uGrassC, uGrassD, uPath, uPath2, uPlaza, uPlaza2, uRock, uRockDark, uCliff; uniform float uSnow;
${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `
  vec2 wp = vWPos.xz;
  float n1 = vnoise(wp * 0.45), n2 = vnoise(wp * 0.07 + 7.1), n3 = vnoise(wp * 1.7 + 3.3), n4 = vnoise(wp * 0.021 + 1.9);
  vec3 col = vColor;
  // grass: two big tone patches + lighter meadows, tiny darker tufts
  vec3 g = mix(uGrassA, uGrassB, smoothstep(0.42, 0.58, n2));
  g = mix(g, uGrassC, smoothstep(0.62, 0.7, n4) * 0.65);
  g = mix(g, uGrassD, smoothstep(0.8, 0.84, n3) * 0.18);
  float gv = vGrass + (n1 - 0.5) * 0.32;
  float gm = step(0.5, gv);
  col = mix(col, g, gm);
  col *= 1.0 - 0.13 * gm * (1.0 - smoothstep(0.5, 0.56, gv));              // dark rim at the grass edge
  col *= 1.0 - 0.22 * vMask.w * gm;                                         // shade under tall grass / woods
  // dirt paths with a soft darker rim
  float pv = vMask.x + (n1 - 0.5) * 0.26 + (n3 - 0.5) * 0.08;
  float pm = step(0.5, pv);
  vec3 pc = mix(uPath, uPath2, smoothstep(0.3, 0.7, n3) * 0.6);
  pc *= 1.0 - 0.12 * (1.0 - smoothstep(0.5, 0.58, pv));
  col = mix(col, pc, pm);
  // cobbled plazas
  float zv = vMask.y + (n1 - 0.5) * 0.12;
  if (zv > 0.5) {
    vec2 q = wp * vec2(1.05, 1.4); q.x += floor(q.y) * 0.5;
    vec2 cell = floor(q), f = fract(q);
    float grout = smoothstep(0.0, 0.07, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * 1.4);
    vec3 tile = mix(uPlaza, uPlaza2, step(0.6, vhash(cell)));
    tile = mix(tile * 0.84, tile, grout);
    col = tile * (1.0 - 0.1 * (1.0 - smoothstep(0.5, 0.56, zv)));
  }
  // rock / cliffs with horizontal strata
  float rv = vMask.z + (n1 - 0.5) * 0.25;
  if (rv > 0.5) {
    float band = step(0.5, fract(vWPos.y * 0.55 + n2 * 0.6));
    vec3 rc = mix(uCliff, uRock, band * 0.7);
    rc = mix(rc, uRockDark, step(0.82, n3) * 0.5);
    rc = mix(rc, vec3(0.95, 0.97, 1.0), uSnow * smoothstep(0.6, 0.9, vNy));
    col = rc;
  }
  diffuseColor.rgb *= col;
`);
  };
  mat.customProgramCacheKey = () => baseKey + '|valmora-terrain';
  return mat;
}

/**
 * @param {any} ctx
 * @param {{id:string, colors:any, grid:any, layout:any, hf:any, owner:(x:number,z:number)=>boolean}} island
 * @returns {{mesh:THREE.Group, heightAt:(x:number,z:number)=>number, waterTex:THREE.DataTexture, waterBox:number[], material:THREE.Material}}
 */
export function buildTerrain(ctx, island) {
  const gen = buildTerrainGen(ctx, island);
  let r = gen.next(); while (!r.done) r = gen.next();
  return r.value;
}

export function* buildTerrainGen(ctx, island) {
  const { grid: g, layout: L, colors, hf } = island;
  const C = c => new THREE.Color(c);
  const cSand = C(colors.sand), cWet = C(colors.sandWet), cBed = C(colors.bed), cDeep = C(colors.bedDeep), cGrass = C(colors.grass);
  const towns = Object.values(L.towns).filter(t => t.island === island.id);
  const routes = Object.values(L.routes).filter(r => r.island === island.id);
  const paths = L.paths.filter(p => p.island === island.id);
  const beaches = L.beaches.filter(b => b.island === island.id);
  const q = {};
  const H = g.H, nx = g.nx, nz = g.nz;
  const hv = (i, j) => H[clamp(j, 0, nz - 1) * nx + clamp(i, 0, nx - 1)];
  const inBox = (b, x, z, pad) => x > b[0] - pad && x < b[2] + pad && z > b[1] - pad && z < b[3] + pad;

  const allPatches = routes.flatMap(Rt => Rt.patches.map(p => ({ ...p, ca: Math.cos(p.rot), sa: Math.sin(p.rot) })));
  function masks(x, z, h, slope, out, rd) {
    let path = 0, plaza = 0, shade = 0, grassBoost = 0;
    if (rd < 3) shade = (1 - smoothstep(0, 2.5, Math.max(0, rd))) * 0.22;                 // worn verge (ribbons draw the paths)
    for (const p of allPatches) {
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz > (p.rx + 2) ** 2) continue;
      const u = dx * p.sa + dz * p.ca, v = dx * p.ca - dz * p.sa;
      const e = (u / p.rx) ** 2 + (v / p.rz) ** 2;
      if (e < 1.3) { shade = Math.max(shade, 1 - smoothstep(0.8, 1.25, e)); grassBoost = 1; }
    }
    for (const T of towns) {
      const dx = x - T.x, dz = z - T.z; if (Math.abs(dx) > T.r + 10 || Math.abs(dz) > T.r + 10) continue;
      const d = Math.hypot(dx, dz);
      plaza = Math.max(plaza, 1 - smoothstep(T.plazaR - 0.6, T.plazaR + 0.6, d));
      const city = T.style === 'city';
      for (const s of T.streets) {
        const dd = segDist(s.ax, s.az, s.bx, s.bz, x, z);
        const m = 1 - smoothstep(s.w / 2 - 0.8, s.w / 2 + 0.6, dd);
        if (city) plaza = Math.max(plaza, m * 0.98);
      }
      for (const s of T.doorPaths) {
        const dd = segDist(s.ax, s.az, s.bx, s.bz, x, z);
        const m = 1 - smoothstep(s.w / 2 - 0.7, s.w / 2 + 0.5, dd);
        if (city) plaza = Math.max(plaza, m * 0.98);
      }
      for (const b of T.buildings) {   // paved footprint skirt (nobody sees the ground under houses)
        const dx2 = x - b.x, dz2 = z - b.z; if (dx2 * dx2 + dz2 * dz2 > (b.w + b.d) ** 2) continue;
        const c = Math.cos(b.facing), s = Math.sin(b.facing), lx = dx2 * c - dz2 * s, lz = dx2 * s + dz2 * c;
        if (Math.abs(lx) < b.w / 2 + 0.6 && Math.abs(lz) < b.d / 2 + 0.6) path = Math.max(path, 0.8);
      }
    }
    for (const B of L.bridges) if (B.island === island.id && B.river) {
      // the river bridge ends stay dirt
    }
    let rock = smoothstep(0.85, 1.25, slope);
    if (h > 3 && slope > 0.55) rock = Math.max(rock, smoothstep(0.55, 0.8, slope));
    out[0] = path; out[1] = plaza; out[2] = rock; out[3] = shade;
    return grassBoost;
  }

  const beachW = (x, z) => { let w = 0; for (const b of beaches) { const r = b.r || 26; w = Math.max(w, 1 - smoothstep(r * 0.6, r, Math.hypot(x - b.x, z - b.z))); } return w; };

  const mat = terrainMaterial(ctx, colors);
  const group = new THREE.Group(); group.name = 'terrain:' + island.id;
  const ci = Math.ceil((nx - 1) / CHUNK), cj = Math.ceil((nz - 1) / CHUNK);
  const col = new THREE.Color(), mOut = [0, 0, 0, 0];
  let tris = 0;
  for (let cy = 0; cy < cj; cy++) for (let cx = 0; cx < ci; cx++) {
    const i0 = cx * CHUNK, j0 = cy * CHUNK, i1 = Math.min(nx - 1, i0 + CHUNK), j1 = Math.min(nz - 1, j0 + CHUNK);
    let maxH = -Infinity, minH = Infinity;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const h = H[j * nx + i]; if (h > maxH) maxH = h; if (h < minH) minH = h; }
    if (maxH < -6) continue;
    // owned quads
    const w = i1 - i0 + 1, d = j1 - j0 + 1;
    const idx = [];
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
      const x = g.x0 + (i + 0.5) * GRID, z = g.z0 + (j + 0.5) * GRID;
      if (!island.owner(x, z)) continue;
      const a = (j - j0) * w + (i - i0), b = a + w;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    if (!idx.length) continue;
    const pos = new Float32Array(w * d * 3), nor = new Float32Array(w * d * 3), cols = new Float32Array(w * d * 3);
    const gr = new Float32Array(w * d), mk = new Float32Array(w * d * 4);
    let k = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++, k++) {
        const x = g.x0 + i * GRID, z = g.z0 + j * GRID, h = H[j * nx + i];
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        const ddx = hv(i - 1, j) - hv(i + 1, j), ddz = hv(i, j - 1) - hv(i, j + 1), ny = 2 * GRID, l = Math.hypot(ddx, ny, ddz);
        nor[k * 3] = ddx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = ddz / l;
        const slope = Math.hypot(ddx, ddz) / (2 * GRID);
        // base colour: sea bed → wet sand → sand
        if (h < 0) col.copy(cWet).lerp(cBed, smoothstep(0, 0.9, -h)).lerp(cDeep, smoothstep(1.5, 6, -h));
        else col.copy(cWet).lerp(cSand, smoothstep(0.05, 0.4, h));
        const n = N.noise2(x * 0.09, z * 0.09);
        const boost = masks(x, z, h, slope, mOut, g.RD ? g.RD[j * nx + i] : 99);
        let grass = h < 0.2 ? 0 : smoothstep(0.62, 1.05, h + n * 0.22);
        grass *= 1 - beachW(x, z) * (1 - smoothstep(1.6, 2.4, h));
        if (boost) grass = Math.max(grass, 1);
        gr[k] = grass;
        mk.set(mOut, k * 4);
        cols[k * 3] = col.r; cols[k * 3 + 1] = col.g; cols[k * 3 + 2] = col.b;
      }
      if ((j & 15) === 15) yield;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.setAttribute('aGrass', new THREE.BufferAttribute(gr, 1));
    geo.setAttribute('aMask', new THREE.BufferAttribute(mk, 4));
    geo.setIndex(idx);
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `terrain_${island.id}_${cx}_${cy}`;
    mesh.receiveShadow = true; mesh.castShadow = maxH > 4;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    tris += idx.length / 3;
    yield;
  }
  void cGrass;

  // ---- water data texture: R = depth (0..8 m), G = distance to shore (0..24 m), 1 texel = 2 grid cells
  const S = 2, TW = Math.ceil(nx / S), TH = Math.ceil(nz / S);
  const dist = new Float32Array(TW * TH), data = new Uint8Array(TW * TH * 4), INF = 1e9;
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) dist[j * TW + i] = hv(i * S, j * S) >= 0 ? 0 : INF;
  const a1 = 1, a2 = Math.SQRT2;
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    let v = dist[j * TW + i]; if (v === 0) continue;
    if (i > 0) v = Math.min(v, dist[j * TW + i - 1] + a1);
    if (j > 0) { v = Math.min(v, dist[(j - 1) * TW + i] + a1); if (i > 0) v = Math.min(v, dist[(j - 1) * TW + i - 1] + a2); if (i < TW - 1) v = Math.min(v, dist[(j - 1) * TW + i + 1] + a2); }
    dist[j * TW + i] = v;
  }
  for (let j = TH - 1; j >= 0; j--) for (let i = TW - 1; i >= 0; i--) {
    let v = dist[j * TW + i]; if (v === 0) continue;
    if (i < TW - 1) v = Math.min(v, dist[j * TW + i + 1] + a1);
    if (j < TH - 1) { v = Math.min(v, dist[(j + 1) * TW + i] + a1); if (i < TW - 1) v = Math.min(v, dist[(j + 1) * TW + i + 1] + a2); if (i > 0) v = Math.min(v, dist[(j + 1) * TW + i - 1] + a2); }
    dist[j * TW + i] = v;
  }
  const texel = GRID * S;
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    const h = hv(i * S, j * S), o = (j * TW + i) * 4;
    data[o] = clamp(-h / 8, 0, 1) * 255;
    data[o + 1] = clamp(dist[j * TW + i] * texel / 24, 0, 1) * 255;
    data[o + 2] = clamp(h / 8, 0, 1) * 255;
    data[o + 3] = 255;
  }
  const waterTex = new THREE.DataTexture(data, TW, TH, THREE.RGBAFormat);
  waterTex.magFilter = waterTex.minFilter = THREE.LinearFilter; waterTex.needsUpdate = true;
  const waterBox = [g.x0, g.z0, g.x0 + TW * texel, g.z0 + TH * texel];
  group.userData.tris = tris;
  return { mesh: group, heightAt: hf.heightAt, waterTex, waterBox, material: mat };
}
