// Vegetation per island: Sun/Moon style trees (round blob canopies, curved palms, stacked pines,
// cypresses, jungle giants, saguaro cacti), bushes, rocks, flower clusters and grass tufts. Each kind
// is one vertex-coloured template drawn with streamed instancing and swayed by the wind shader.
// Also the ambient critters: butterflies by day, fireflies at night.
import * as THREE from 'three';
import { Builder } from './builder.js';
import { Streamer } from './instances.js';
import { OCC } from './occupancy.js';
import { rng, clamp, smoothstep } from '../core/math.js';
import { N, N2 } from './shape.js';

const TEMPLATES = new Map();

/** Tree / plant templates (local, ground at y = 0). */
function template(kind, C, variant = 0) {
  const key = kind + '|' + variant + '|' + C.leaf + C.trunk + (C.snow || 0);
  if (TEMPLATES.has(key)) return TEMPLATES.get(key);
  const b = new Builder({ seed: key, ao: true });
  b.jitter = 0.03;
  const R = rng(key);
  const light = new THREE.Color(C.leaf2).lerp(new THREE.Color('#fffbd0'), 0.18).getStyle();
  if (kind === 'round') {
    const h = variant ? 2.4 : 2.0;
    b.cyl(0.17, 0.3, h + 0.4, 0, (h + 0.4) / 2, 0, C.trunk, { seg: 7, grad: 0.3 });
    b.cyl(0.07, 0.1, 0.9, 0.35, h - 0.2, 0, C.trunk, { seg: 5, rz: -0.8 });
    const top = h + 1.0;
    b.sphere(1.55, 0, top, 0, C.leaf, { grad: 0.38, sy: 0.9 });
    b.sphere(1.12, 0.95, top - 0.35, 0.35, C.leafDark, { grad: 0.35 });
    b.sphere(1.08, -0.85, top - 0.3, -0.4, C.leaf, { grad: 0.35 });
    b.sphere(1.0, 0.2, top + 0.85, 0.15, light, { grad: 0.25 });
    if (variant) b.sphere(0.9, -0.3, top - 0.1, 0.95, C.leaf2, { grad: 0.3 });
  } else if (kind === 'palm') {
    const h = 4.6 + variant * 0.9, segs = 7;
    let px = 0;
    for (let i = 0; i < segs; i++) {
      const t = i / segs; px = Math.pow(t, 1.8) * h * 0.26;
      b.cyl(0.19 - t * 0.06, 0.23 - t * 0.06, h / segs + 0.06, px, (i + 0.5) * h / segs, 0, i % 2 ? '#a77344' : '#c08c58', { seg: 8, rz: -Math.pow(t, 0.8) * 0.33 });
    }
    const fr = 8;
    for (let k = 0; k < fr; k++) {
      const a = k / fr * Math.PI * 2 + R() * 0.3, droop = 0.35 + (k % 2) * 0.22;
      b.push(px + 0.05, h + 0.05, 0, a, 1, 0, -droop);
      b.dome(1, 1.35, 0, 0, k % 2 ? C.leaf : C.leaf2, { sx: 1.5, sy: 0.18, sz: 0.42, grad: 0.3 });
      b.dome(1, 2.55, -0.28, 0, k % 2 ? C.leafDark : C.leaf, { sx: 0.8, sy: 0.14, sz: 0.3, rz: -0.5 });
      b.pop();
    }
    for (let k = 0; k < 3; k++) b.sphere(0.17, px + Math.cos(k * 2.1) * 0.22, h - 0.18, Math.sin(k * 2.1) * 0.22, '#7a5230', { grad: 0.2 });
  } else if (kind === 'pine') {
    const s = 1 + variant * 0.25;
    b.cyl(0.14 * s, 0.24 * s, 1.6 * s, 0, 0.8 * s, 0, C.trunk, { seg: 6, grad: 0.3 });
    const tiers = [[1.7, 2.2, 1.9], [1.32, 1.9, 3.0], [0.92, 1.7, 4.05]];
    tiers.forEach(([r, hh, y], i) => {
      b.cone(r * s, hh * s, 0, y * s, 0, i === 2 ? C.leaf : i ? C.leaf : C.leafDark, { seg: 9, grad: 0.4 });
      if (C.snow) b.cone(r * s * 0.62, hh * s * 0.42, 0, (y + hh * 0.31) * s, 0, '#f4f9ff', { seg: 9, grad: 0.1 });
    });
  } else if (kind === 'cypress') {
    b.cyl(0.12, 0.18, 1.2, 0, 0.6, 0, C.trunk, { seg: 6 });
    b.sphere(0.95, 0, 2.9, 0, C.leafDark, { sy: 2.5, grad: 0.4 });
    b.sphere(0.6, 0.18, 4.2, 0.1, C.leaf, { sy: 1.6, grad: 0.3 });
  } else if (kind === 'jungle') {
    const h = 5.5 + variant * 1.2;
    b.cyl(0.32, 0.55, h, 0, h / 2, 0, '#8a5e3c', { seg: 8, grad: 0.35 });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; b.cone(0.3, 1.3, Math.sin(a) * 0.45, 0.55, Math.cos(a) * 0.45, '#7a5234', { seg: 5, rx: Math.cos(a) * 0.5, rz: -Math.sin(a) * 0.5 }); }
    b.sphere(2.3, 0, h + 0.6, 0, C.leafDark, { sy: 0.55, grad: 0.4 });
    b.sphere(1.7, 1.3, h + 0.2, 0.6, C.leaf, { sy: 0.6, grad: 0.35 });
    b.sphere(1.6, -1.2, h + 0.3, -0.7, C.leaf, { sy: 0.6, grad: 0.35 });
    b.sphere(1.3, 0.2, h + 1.25, -0.2, light, { sy: 0.6, grad: 0.25 });
    for (let k = 0; k < 4; k++) { const a = k * 1.7; b.cyl(0.03, 0.03, 2.2, Math.sin(a) * 1.6, h - 1.2, Math.cos(a) * 1.6, '#4f9a3a', { seg: 4 }); }
  } else if (kind === 'cactus') {
    const g = '#5aa84a', g2 = '#6fbf55';
    b.cyl(0.32, 0.36, 2.6, 0, 1.3, 0, g, { seg: 10, grad: 0.25 }); b.sphere(0.32, 0, 2.6, 0, g2, { grad: 0.1 });
    const arm = (sx, y, len) => { b.cyl(0.18, 0.18, 0.55, sx * 0.5, y, 0, g, { seg: 8, rz: sx * Math.PI / 2 }); b.cyl(0.2, 0.2, len, sx * 0.72, y + len / 2, 0, g2, { seg: 8 }); b.sphere(0.2, sx * 0.72, y + len, 0, g2); };
    arm(1, 1.1 + variant * 0.3, 0.9); arm(-1, 1.5, 0.7 + variant * 0.3);
    b.sphere(0.12, 0, 2.92, 0, '#ff6fa0');
  } else if (kind === 'bush') {
    b.sphere(0.78, 0, 0.5, 0, C.leaf, { sy: 0.78, grad: 0.4 });
    b.sphere(0.6, 0.6, 0.38, 0.2, C.leafDark, { sy: 0.8, grad: 0.4 });
    b.sphere(0.55, -0.55, 0.36, -0.15, C.leaf2, { sy: 0.8, grad: 0.35 });
    if (variant) for (let k = 0; k < 7; k++) { const a = k * 0.9, y = 0.55 + (k % 3) * 0.18; b.sphere(0.1, Math.sin(a) * 0.72, y, Math.cos(a) * 0.62, C.flowers[k % 2], { grad: 0 }); }
  } else if (kind === 'rock') {
    b.rock(1, 0, 0.25, 0, C.rock, { variant, sy: 0.9, grad: 0.3 });
    if (variant % 2) b.rock(0.55, 0.8, 0.15, 0.4, C.rockDark, { variant: variant + 1, grad: 0.3 });
  } else if (kind === 'tuft') {
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + R() * 0.5, r = 0.08 + R() * 0.06; b.cone(0.07, 0.42 + R() * 0.2, Math.sin(a) * r, 0.2, Math.cos(a) * r, C.grassDark, { seg: 3, open: true, rx: Math.cos(a) * 0.35, rz: -Math.sin(a) * 0.35, grad: 0.45 }); }
  } else if (kind === 'flower') {
    for (let k = 0; k < 4; k++) {
      const a = k * 1.9 + R(), r = k ? 0.16 + R() * 0.1 : 0, y = 0.2 + R() * 0.12, x = Math.sin(a) * r, z = Math.cos(a) * r;
      b.cyl(0.014, 0.014, y, x, y / 2, z, '#4f9a3a', { seg: 3 });
      b.cyl(0.12, 0.08, 0.05, x, y, z, C.petal, { seg: 6, jitter: 0.06 });
      b.sphere(0.045, x, y + 0.03, z, '#ffd23f', { grad: 0 });
    }
    b.cone(0.06, 0.22, 0.05, 0.1, 0.02, '#5cb848', { seg: 3, rz: 0.5 });
  } else if (kind === 'heather') {
    for (let k = 0; k < 5; k++) { const a = k * 1.3, r = k ? 0.22 : 0; b.sphere(0.2, Math.sin(a) * r, 0.16, Math.cos(a) * r, k % 2 ? '#a07fc0' : '#b894d8', { sy: 0.8, grad: 0.4 }); }
  } else if (kind === 'coral') {
    for (let k = 0; k < 5; k++) { const a = k * 1.25; b.cyl(0.05, 0.08, 0.5 + (k % 3) * 0.15, Math.sin(a) * 0.15, 0.25, Math.cos(a) * 0.15, k % 2 ? '#ff8a8a' : '#ffb07a', { seg: 5, rx: Math.cos(a) * 0.5, rz: -Math.sin(a) * 0.5 }); }
  }
  const g = b.geometry({ ao: kind !== 'flower' && kind !== 'tuft' });
  TEMPLATES.set(key, g);
  return g;
}

const TREE_R = { round: 0.42, palm: 0.32, pine: 0.4, cypress: 0.32, jungle: 0.75, cactus: 0.42 };
const TREE_SHADE = { round: 0.012, palm: 0.009, pine: 0.006, cypress: 0.008, jungle: 0.004, cactus: 0.0 };

/**
 * @param {any} ctx
 * @param {{id:string, colors:any, layout:any, hf:any, occ:any, box:number[]}} island
 * @param {(x:number,z:number)=>number} heightAt
 * @returns {{object:THREE.Group, update:(dt:number,t:number)=>void, colliders:any[], streamer:Streamer, dispose:()=>void}}
 */
export function buildVegetation(ctx, island, heightAt) {
  const C = island.colors, L = island.layout, occ = island.occ, id = island.id;
  const R = rng('veg:' + id);
  const dens = ctx.quality?.grassDensity ?? 0.7;
  const st = new Streamer('vegetation:' + id, 64, 5);
  const mats = island.mats;
  const sets = {};
  const setFor = (kind, variant, o = {}) => {
    const k = kind + variant + (o.tag || '');
    if (!sets[k]) {
      const sway = o.sway ?? TREE_SHADE[kind] ?? 0.01, base = o.base ?? (kind === 'palm' ? 1.5 : kind === 'jungle' ? 3 : 0.9);
      const mat = sway > 0 ? mats.wind(sway, base) : mats.solid;
      sets[k] = st.set(k, template(kind, { ...C, petal: o.petal || '#ffffff' }, variant), mat, { castShadow: !o.noShadow, cap: o.cap, radius: o.radius });
    }
    return sets[k];
  };
  const colliders = [];
  const tint = (base, amt) => { const c = new THREE.Color(1, 1, 1); c.offsetHSL((R() - 0.5) * 0.03, (R() - 0.5) * 0.1, (R() - 0.5) * amt); return c; };
  const placeTree = (kind, x, z, s = 1, collide = true) => {
    const h = heightAt(x, z);
    const variant = R() < 0.5 ? 0 : 1;
    setFor(kind, variant).add({ x, y: h - 0.05, z, ry: R() * Math.PI * 2, s: s * (0.85 + R() * 0.3), color: tint(null, 0.12) });
    if (collide) colliders.push({ type: 'circle', x, z, r: (TREE_R[kind] || 0.4) * s, tag: 'tree' });
  };
  const pickTree = () => R.pick(C.trees);

  // --- authored trees (towns, routes, picnic spots)
  for (const T of Object.values(L.towns)) {
    if (T.island !== id) continue;
    for (const t of T.trees) placeTree(T.style === 'stilts' || T.style === 'hut' ? 'palm' : pickTree() === 'cactus' ? 'cactus' : C.trees[0], t.x, t.z, t.s);
    for (const p of T.props) if (p.type === 'tree') placeTree(C.trees[0] === 'cactus' ? 'palm' : C.trees[0], p.x, p.z, 1.35);
  }
  for (const Rt of Object.values(L.routes)) {
    if (Rt.island !== id) continue;
    for (const t of Rt.trees) placeTree(C.trees[0] === 'cactus' ? 'palm' : C.trees[0], t.x, t.z, t.s || 1.2);
  }

  // --- scatter over the island
  const [bx0, bz0, bx1, bz1] = island.box;
  const STEP = 4.2;
  const flowerCols = C.flowers;
  for (let z = bz0; z < bz1; z += STEP) for (let x = bx0; x < bx1; x += STEP) {
    const jx = x + (R() - 0.5) * STEP * 0.9, jz = z + (R() - 0.5) * STEP * 0.9;
    if (!island.owner(jx, jz)) continue;
    const o = occ.at(jx, jz);
    const h = heightAt(jx, jz);
    if (h < 0.25) continue;
    const slope = island.hf.slopeAt(jx, jz);
    const forest = N.fbm(jx * 0.012 + 3.3, jz * 0.012 - 1.7, 3) + (island.forest || 0);
    const r = R();
    if (o === OCC.FREE) {
      if (slope > 0.95) { if (r < 0.25) rock(jx, jz, h); continue; }
      if (h < 0.8) {          // beach / dunes
        if (C.trees.includes('palm') && r < 0.06) placeTree('palm', jx, jz, 0.9 + R() * 0.3);
        else if (r < 0.1) addSmall('tuft', jx, jz, h, 0.7);
        continue;
      }
      const pTree = forest > 0.18 ? 0.42 : forest > 0.0 ? 0.12 : 0.035;
      if (r < pTree) { placeTree(pickTree(), jx, jz, 0.85 + R() * 0.45); continue; }
      if (r < pTree + 0.06) { const b = setFor('bush', R() < 0.35 ? 1 : 0); b.add({ x: jx, y: h - 0.08, z: jz, ry: R() * 6, s: 0.8 + R() * 0.6, color: tint(null, 0.1) }); continue; }
      if (r < pTree + 0.08) { rock(jx, jz, h); continue; }
      // flower meadows and tufts
      const fl = N2.noise2(jx * 0.03, jz * 0.03);
      if (fl > 0.35 && R() < dens) { for (let k = 0; k < 3; k++) flower(jx + (R() - 0.5) * 3, jz + (R() - 0.5) * 3); continue; }
      if (R() < 0.55 * dens) addSmall(C.snow ? 'tuft' : id === 'nebbia' && R() < 0.5 ? 'heather' : 'tuft', jx, jz, h, 0.8 + R() * 0.5);
    } else if (o === OCC.ROAD || o === OCC.BUSY) {
      if (R() < 0.12 * dens && occ.at(jx, jz) === OCC.ROAD && !occ.clearOf(jx, jz, 0, OCC.ROAD)) { /* keep roads clean */ }
    } else if (o === OCC.BEACH) {
      if (C.trees.includes('palm') && r < 0.035) placeTree('palm', jx, jz, 1);
    }
  }
  // flower borders along routes (theme 'flowers' gets whole fields)
  for (const Rt of Object.values(L.routes)) {
    if (Rt.island !== id) continue;
    const rich = Rt.theme === 'flowers' ? 1 : Rt.theme === 'peak' || Rt.theme === 'canyon' ? 0.15 : 0.45;
    const pts = Rt.poly.pts;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
      for (const side of [-1, 1]) {
        if (R() > rich * dens) continue;
        const off = Rt.width / 2 + 2.6 + R() * (Rt.theme === 'flowers' ? 9 : 2.5);
        const x = ax - dz / l * off * side, z = az + dx / l * off * side;
        if (occ.at(x, z) === OCC.FREE && heightAt(x, z) > 0.6) flower(x, z);
      }
    }
  }
  // coral heads in the lagoon shallows (coral island + sole)
  if (id === 'coralline' || id === 'sole') {
    for (let k = 0; k < 900; k++) {
      const x = bx0 + R() * (bx1 - bx0), z = bz0 + R() * (bz1 - bz0), h = heightAt(x, z);
      if (h < -0.4 && h > -2.2 && island.owner(x, z)) setFor('coral', 0, { sway: 0, noShadow: true }).add({ x, y: h, z, ry: R() * 6, s: 0.8 + R() * 0.8 });
    }
  }

  function rock(x, z, h) {
    const v = Math.floor(R() * 4), s = 0.45 + R() * 0.9;
    setFor('rock', v, { sway: 0 }).add({ x, y: h - 0.1 * s, z, ry: R() * 6, s, color: tint(null, 0.08) });
    if (s > 0.8) colliders.push({ type: 'circle', x, z, r: 0.8 * s, tag: 'rock' });
  }
  function flower(x, z) {
    const h = heightAt(x, z); if (h < 0.5) return;
    const ci = Math.floor(R() * flowerCols.length);
    setFor('flower', ci, { sway: 0.06, base: 0.05, petal: flowerCols[ci], noShadow: true, radius: 46, cap: 2500, tag: 'f' + ci }).add({ x, y: h - 0.02, z, ry: R() * 6, s: 0.9 + R() * 0.5 });
  }
  function addSmall(kind, x, z, h, s) {
    setFor(kind, 0, { sway: kind === 'tuft' ? 0.35 : 0.05, base: 0.0, noShadow: true, radius: 44, cap: 3000 }).add({ x, y: h - 0.04, z, ry: R() * 6, s, color: tint(null, 0.15) });
  }

  st.finish();
  const group = new THREE.Group(); group.name = 'veg:' + id;
  group.add(st.group);
  const critters = buildCritters(ctx, island, heightAt);
  group.add(critters.object);

  return {
    object: group, colliders, streamer: st,
    update(dt, t) {
      const f = ctx.cameraRig.mode === 'explore' ? ctx.cameraRig.followPos : ctx.cameraRig.lookTarget;
      st.update(f.x, f.z);
      critters.update(dt, t, f);
    },
    refresh() { st.update(st.lx + 100, st.lz, true); },
    dispose() { st.dispose(); critters.dispose(); group.removeFromParent(); },
  };
}

/** Butterflies (day) and fireflies (night) drifting around the camera focus. */
function buildCritters(ctx, island, heightAt) {
  const n = 18;
  const group = new THREE.Group(); group.name = 'critters';
  // butterfly: two wing triangles fanned around the body axis
  const wg = new THREE.BufferGeometry();
  const wv = [0, 0, 0, 0.16, 0.02, 0.1, 0.13, 0.02, -0.1, 0, 0, 0, -0.16, 0.02, 0.1, -0.13, 0.02, -0.1];
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wv, 3)); wg.computeVertexNormals();
  const wmat = ctx.toon.mat('#ffffff', { side: THREE.DoubleSide });
  const bfly = new THREE.InstancedMesh(wg, wmat, n); bfly.frustumCulled = false; bfly.name = 'butterflies';
  const cols = ['#ffd23f', '#ff8fb8', '#ffffff', '#8fd8ff', '#ffb07a'];
  for (let i = 0; i < n; i++) bfly.setColorAt(i, new THREE.Color(cols[i % cols.length]));
  const flyG = new THREE.SphereGeometry(0.06, 6, 4);
  const flies = new THREE.InstancedMesh(flyG, ctx.toon.glow('#d8ff7a', 2.2), n * 2); flies.frustumCulled = false; flies.name = 'fireflies';
  group.add(bfly, flies);
  const seeds = Array.from({ length: n * 2 }, (_, i) => ({ a: i * 2.39996, r: 4 + (i * 7.31 % 16), s: 0.4 + (i * 0.37 % 0.6), p: i * 1.7 }));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const home = [];
  return {
    object: group,
    update(dt, t, f) {
      const L = ctx.time.lighting();
      const day = 1 - L.night, night = L.night;
      bfly.visible = day > 0.5 && !island.noCritters;
      flies.visible = night > 0.5 && !island.noCritters;
      if (bfly.visible) {
        for (let i = 0; i < n; i++) {
          const s = seeds[i];
          if (!home[i] || Math.hypot(home[i].x - f.x, home[i].z - f.z) > 26) home[i] = { x: f.x + Math.cos(s.a + t * 0.01) * s.r, z: f.z + Math.sin(s.a) * s.r };
          const hx = home[i].x, hz = home[i].z;
          const x = hx + Math.sin(t * s.s + s.p) * 2.2 + Math.sin(t * 1.3 * s.s) * 0.6, z = hz + Math.cos(t * s.s * 0.8 + s.p) * 2.2;
          const y = Math.max(0.3, heightAt(x, z)) + 0.8 + Math.sin(t * 2.1 + s.p) * 0.35;
          const dx = Math.cos(t * s.s + s.p), dz = -Math.sin(t * s.s * 0.8 + s.p) * 0.8;
          const flap = Math.abs(Math.sin(t * 18 + s.p));
          e.set(0, Math.atan2(dx, dz), 0); q.setFromEuler(e); sc.set(0.25 + flap * 0.85, 1, 1);
          m.compose(p.set(x, y, z), q, sc); bfly.setMatrixAt(i, m);
        }
        bfly.instanceMatrix.needsUpdate = true;
      }
      if (flies.visible) {
        for (let i = 0; i < n * 2; i++) {
          const s = seeds[i];
          const x = f.x + Math.cos(s.a) * s.r + Math.sin(t * 0.3 * s.s + s.p) * 2.5, z = f.z + Math.sin(s.a) * s.r + Math.cos(t * 0.27 * s.s + s.p) * 2.5;
          const y = Math.max(0.2, heightAt(x, z)) + 0.6 + Math.sin(t * 0.9 + s.p) * 0.4;
          const blink = 0.4 + 0.6 * Math.max(0, Math.sin(t * 2.2 + s.p * 3));
          m.compose(p.set(x, y, z), q.identity(), sc.setScalar(blink)); flies.setMatrixAt(i, m);
        }
        flies.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() { bfly.dispose(); flies.dispose(); },
  };
}

export { clamp, smoothstep };
