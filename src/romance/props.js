// Procedural romance sets, Sun/Moon style: chunky rounded shapes, saturated warm colours, vertex-coloured
// and merged (1 draw call for solids + 1 for emissive bits + 1 point cloud for glow halos).
// Every builder takes WORLD positions (computed by scenes.js from where the actors really stand), so the
// table/chairs/blanket/scooter always line up with the pair pose, whatever conventions Actors uses.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createMotes } from './fx.js';

const C = {
  wood: '#b97b47', woodDark: '#7a4e2d', woodLight: '#d39a5e', cream: '#fff2d8', white: '#ffffff', red: '#e8574a', redDark: '#c23b32',
  redLight: '#f6a99a', green: '#5fae45', greenDark: '#3e7d32', glass: '#4f9a5a', straw: '#e9c46a', pasta: '#f3c75f', sauce: '#d8432e',
  wine: '#8e1b3a', wick: '#3b2a20', candle: '#fff3dc', metal: '#3a3f55', rose: '#e83c5a', rosePink: '#ff7aa2', lemon: '#ffd23f',
  sand: '#f6dfa0', strawberry: '#ff3b4e', bread: '#f2c98a', lettuce: '#8fd35a', tyre: '#2f2b3a', seat: '#5a3a2a',
};

/** Collects transformed, vertex-coloured geometries and merges them per material. */
function builder(ctx) {
  const lists = { solid: [], double: [], glow: [] };
  const o = new THREE.Object3D();
  const col = new THREE.Color();
  function put(list, geo, color, { p = [0, 0, 0], r = [0, 0, 0], s = 1, m = null } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (m) g.applyMatrix4(m);
    else {
      o.position.set(p[0], p[1], p[2]); o.rotation.set(r[0], r[1], r[2]);
      if (Array.isArray(s)) o.scale.set(s[0], s[1], s[2]); else o.scale.setScalar(s);
      o.updateMatrix(); g.applyMatrix4(o.matrix);
    }
    const pos = g.attributes.position, n = pos.count, arr = new Float32Array(n * 3);
    if (typeof color === 'function') {
      // per-triangle colour: fn(centroidX, centroidY, centroidZ, triIndex) → css colour
      for (let t = 0; t < n; t += 3) {
        const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3, cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3, cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
        col.set(color(cx, cy, cz, t / 3));
        for (let j = 0; j < 3; j++) arr.set([col.r, col.g, col.b], (t + j) * 3);
      }
    } else { col.set(color); for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (!g.attributes.normal) g.computeVertexNormals();
    list.push(g);
  }
  return {
    solid: (g, c, t) => put(lists.solid, g, c, t),
    double: (g, c, t) => put(lists.double, g, c, t),
    glow: (g, c, t) => put(lists.glow, g, c, t),
    build(name, { glowColor = '#ffcf6a', glowIntensity = 1.6, shadows = true } = {}) {
      const group = new THREE.Group(); group.name = name;
      const mk = (list, mat, cast) => {
        if (!list.length) return;
        const geo = mergeGeometries(list, false); list.forEach(g => g.dispose());
        const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = cast && shadows; mesh.receiveShadow = true;
        group.add(mesh);
      };
      mk(lists.solid, ctx.toon.matVC(), true);
      mk(lists.double, ctx.toon.matVC({ side: THREE.DoubleSide }), false);
      mk(lists.glow, ctx.toon.glow(glowColor, glowIntensity), false);
      return group;
    },
  };
}

const rb = (ctx, w, h, d, r = 0.03, seg = 2) => ctx.kit.roundedBox(w, h, d, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3), seg);
const local = (center, yaw) => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // local x → world (cos, -sin) ; local z → world (sin, cos)   (rotation about +y by yaw)
  return (lx, ly, lz) => [center.x + lx * c + lz * s, center.y + ly, center.z - lx * s + lz * c];
};

/** Wraps a built group with optional halos and a disposer. */
function finish(ctx, group, halos = [], haloOpts = {}) {
  const extras = [];
  if (halos.length) { const m = createMotes(ctx, halos, { mode: 'halo', color: '#ffae42', core: '#fff6d8', size: 0.22, ...haloOpts }); group.add(m.object); extras.push(m); }
  return {
    object: group,
    update(dt) { for (const e of extras) e.update(dt); },
    dispose() { group.removeFromParent(); ctx.kit.dispose(group); for (const e of extras) e.dispose(); },
  };
}

// ---------------------------------------------------------------------------------------------
function chair(ctx, B, at, ry, cushion = C.red) {
  const M = new THREE.Matrix4().compose(new THREE.Vector3(at.x, at.y, at.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
  const add = (g, c, p, r = [0, 0, 0]) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(1, 1, 1));
    B.solid(g, c, { m: M.clone().multiply(m) });
  };
  add(rb(ctx, 0.46, 0.06, 0.44, 0.025), C.wood, [0, 0.44, 0]);
  add(rb(ctx, 0.4, 0.05, 0.38, 0.025), cushion, [0, 0.49, 0.01]);
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) add(new THREE.CylinderGeometry(0.025, 0.03, 0.44, 8), C.woodDark, [x, 0.22, z]);
  // backrest behind the sitter (sitter faces +z of the chair)
  for (const x of [-0.19, 0.19]) add(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), C.woodDark, [x, 0.7, -0.2]);
  add(rb(ctx, 0.44, 0.13, 0.04, 0.02), C.wood, [0, 0.86, -0.2]);
  add(rb(ctx, 0.4, 0.06, 0.035, 0.015), C.woodLight, [0, 0.68, -0.2]);
}

/**
 * Osteria dehors: square table with gingham cloth, chianti candle, two plates of pasta, wine, bread,
 * two chairs under the sitters and a string of warm bulbs on two poles behind.
 * @param {{center:{x,y,z}, yaw:number, seats:{x,y,z,ry}[], side?:number}} L yaw: local +x points from a to b
 */
export function buildTable(ctx, L) {
  const B = builder(ctx), P = local(L.center, L.yaw), halos = [];
  const y0 = L.center.y;
  // table
  B.solid(rb(ctx, 0.84, 0.05, 0.84, 0.02), C.wood, { p: P(0, 0.72, 0), r: [0, L.yaw, 0] });
  for (const [x, z] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]]) B.solid(new THREE.CylinderGeometry(0.035, 0.04, 0.72, 8), C.woodDark, { p: P(x, 0.36, z) });
  // gingham cloth (top + four drapes)
  const cell = 0.1;
  const ging = (u, v) => { const a = Math.floor(u / cell + 100) % 2, b = Math.floor(v / cell + 100) % 2; return a && b ? C.redDark : a || b ? C.red : C.cream; };
  const top = new THREE.PlaneGeometry(1.0, 1.0, 10, 10); top.rotateX(-Math.PI / 2);
  B.double(top, (x, y, z) => ging(x + 0.5, z + 0.5), { p: P(0, 0.752, 0), r: [0, L.yaw, 0] });
  for (let k = 0; k < 4; k++) {
    const d = new THREE.PlaneGeometry(1.0, 0.2, 10, 2);
    // vertical drape at the edge, slightly flared
    d.translate(0, -0.1, 0); d.rotateX(0.08); d.translate(0, 0, 0.5);
    d.rotateY((k * Math.PI) / 2);
    B.double(d, (x, y, z) => ging((k % 2 ? z : x) + 0.5, -y + 0.05), { p: P(0, 0.752, 0), r: [0, L.yaw, 0] });
  }
  // fiasco with candle
  const fy = 0.755;
  B.solid(new THREE.SphereGeometry(0.085, 14, 10), C.glass, { p: P(0, fy + 0.085, 0) });
  B.solid(new THREE.SphereGeometry(0.092, 14, 6, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), C.straw, { p: P(0, fy + 0.085, 0) });
  B.solid(new THREE.CylinderGeometry(0.022, 0.03, 0.12, 10), C.glass, { p: P(0, fy + 0.21, 0) });
  B.solid(new THREE.CylinderGeometry(0.018, 0.018, 0.08, 10), C.candle, { p: P(0, fy + 0.31, 0) });
  B.solid(new THREE.CylinderGeometry(0.03, 0.022, 0.025, 10), C.candle, { p: P(0, fy + 0.265, 0) });
  B.glow(new THREE.ConeGeometry(0.014, 0.045, 8), '#ffd27a', { p: P(0, fy + 0.375, 0) });
  halos.push({ x: P(0, fy + 0.38, 0)[0], y: P(0, fy + 0.38, 0)[1], z: P(0, fy + 0.38, 0)[2] });
  // plates of pasta, glasses, cutlery for both
  for (const sx of [-1, 1]) {
    const px = sx * 0.25;
    B.solid(new THREE.CylinderGeometry(0.14, 0.11, 0.025, 20), C.white, { p: P(px, fy + 0.013, 0.02) });
    B.solid(ctx.kit.blob(0.075, { seed: 3 + sx, wobble: 0.18, detail: 2 }), C.pasta, { p: P(px, fy + 0.045, 0.02), s: [1, 0.45, 1] });
    B.solid(ctx.kit.blob(0.04, { seed: 7 + sx, wobble: 0.15, detail: 1 }), C.sauce, { p: P(px, fy + 0.07, 0.02), s: [1, 0.5, 1] });
    B.solid(new THREE.SphereGeometry(0.012, 6, 4), C.green, { p: P(px + 0.02, fy + 0.085, 0.03) });
    // glass of red
    const gx = sx * 0.22, gz = -0.2;
    B.solid(new THREE.CylinderGeometry(0.03, 0.035, 0.008, 12), '#efe6ff', { p: P(gx, fy + 0.004, gz) });
    B.solid(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 6), '#efe6ff', { p: P(gx, fy + 0.045, gz) });
    B.solid(new THREE.SphereGeometry(0.04, 12, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), '#efe6ff', { p: P(gx, fy + 0.125, gz) });
    B.solid(new THREE.SphereGeometry(0.033, 12, 6, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4), C.wine, { p: P(gx, fy + 0.125, gz) });
    // fork
    B.solid(rb(ctx, 0.012, 0.006, 0.16, 0.003, 1), '#c9cfdc', { p: P(px + sx * 0.17, fy + 0.004, 0.02), r: [0, L.yaw, 0] });
  }
  // bread basket
  B.solid(new THREE.SphereGeometry(0.08, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), C.woodLight, { p: P(0.05, fy + 0.07, 0.24), s: [1.2, 0.8, 1] });
  for (let i = 0; i < 3; i++) B.solid(ctx.kit.blob(0.035, { seed: i, wobble: 0.2, detail: 1 }), C.bread, { p: P(0.02 + i * 0.035, fy + 0.075, 0.24 + (i - 1) * 0.02), s: [1.4, 0.8, 1] });
  // chairs under the sitters
  for (const s of L.seats || []) chair(ctx, B, s, s.ry, C.red);
  // string lights on two poles behind the table (local -z side, away from the default camera side)
  const side = L.side || -1;
  const pa = P(-1.35, 0, side * 0.95), pb = P(1.35, 0, side * 0.95);
  for (const q of [pa, pb]) {
    B.solid(new THREE.CylinderGeometry(0.045, 0.06, 2.6, 8), C.woodDark, { p: [q[0], y0 + 1.3, q[2]] });
    B.solid(new THREE.SphereGeometry(0.06, 8, 6), C.woodLight, { p: [q[0], y0 + 2.62, q[2]] });
    B.solid(new THREE.CylinderGeometry(0.16, 0.13, 0.22, 10), '#d9774a', { p: [q[0], y0 + 0.11, q[2]] });
  }
  const A = new THREE.Vector3(pa[0], y0 + 2.5, pa[2]), Bv = new THREE.Vector3(pb[0], y0 + 2.5, pb[2]);
  const pts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; const p = A.clone().lerp(Bv, t); p.y -= Math.sin(t * Math.PI) * 0.38; pts.push(p); }
  B.solid(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.008, 4), C.metal);
  for (let i = 1; i < 16; i += 2) {
    const p = pts[i];
    B.solid(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 6), C.metal, { p: [p.x, p.y - 0.02, p.z] });
    B.glow(new THREE.SphereGeometry(0.04, 10, 8), '#ffd27a', { p: [p.x, p.y - 0.07, p.z], s: [1, 1.2, 1] });
    halos.push({ x: p.x, y: p.y - 0.07, z: p.z });
  }
  // a potted lemon tree at the end of the lights
  const lt = P(1.35, 0, side * 0.95 - side * 0.0);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26;
    B.solid(ctx.kit.blob(0.2, { seed: i * 3, wobble: 0.12, detail: 1 }), i % 2 ? C.green : C.greenDark, { p: [lt[0] + Math.cos(a) * 0.14, y0 + 0.62 + (i % 3) * 0.08, lt[2] + Math.sin(a) * 0.14] });
  }
  for (let i = 0; i < 4; i++) B.solid(new THREE.SphereGeometry(0.035, 8, 6), C.lemon, { p: [lt[0] + Math.cos(i * 1.7) * 0.22, y0 + 0.6 + (i % 2) * 0.12, lt[2] + Math.sin(i * 1.7) * 0.22], s: [1, 1.25, 1] });
  return finish(ctx, B.build('romance-table'), halos, { size: 0.32 });
}

// ---------------------------------------------------------------------------------------------
/** Picnic: gingham blanket, wicker basket, strawberries, lemonade, sandwiches, wild flowers. */
export function buildPicnic(ctx, L, { tint = C.red } = {}) {
  const B = builder(ctx), P = local(L.center, L.yaw);
  const dark = new THREE.Color(tint).multiplyScalar(0.78).getStyle(), light = new THREE.Color(tint).lerp(new THREE.Color('#ffffff'), 0.55).getStyle();
  const cell = 0.16;
  const blanket = new THREE.PlaneGeometry(2.3, 1.7, 23, 17);
  blanket.rotateX(-Math.PI / 2);
  const bp = blanket.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), z = bp.getZ(i);
    const edge = Math.max(Math.abs(x) / 1.15, Math.abs(z) / 0.85);
    bp.setY(i, 0.012 * Math.sin(x * 5.1) * Math.cos(z * 4.3) - Math.max(0, edge - 0.93) * 0.35);
  }
  blanket.computeVertexNormals();
  B.double(blanket, (x, y, z) => { const a = Math.floor((x + 1.15) / cell) % 2, b = Math.floor((z + 0.85) / cell) % 2; return a && b ? dark : a || b ? light : C.cream; }, { p: P(0, 0.02, 0), r: [0, L.yaw, 0] });
  // basket (behind, local -z)
  const bz = -0.55, bx = 0.62;
  B.solid(rb(ctx, 0.46, 0.24, 0.32, 0.05), (x, y) => (Math.floor((y + 10) / 0.045) % 2 ? '#c58a4a' : '#a96e36'), { p: P(bx, 0.15, bz), r: [0, L.yaw + 0.25, 0] });
  B.solid(rb(ctx, 0.48, 0.04, 0.34, 0.02), '#9a6532', { p: P(bx, 0.29, bz), r: [0.12, L.yaw + 0.25, 0] });
  B.solid(new THREE.TorusGeometry(0.17, 0.018, 6, 16, Math.PI), '#9a6532', { p: P(bx, 0.29, bz), r: [0, L.yaw + 0.25, 0] });
  B.solid(rb(ctx, 0.2, 0.05, 0.2, 0.02), (x, y, z) => (Math.floor((x + z + 10) / 0.05) % 2 ? C.red : C.cream), { p: P(bx - 0.12, 0.31, bz + 0.05), r: [0.4, L.yaw, 0.3] });
  // bowl of strawberries
  const sx = -0.15, sz = -0.42;
  B.solid(new THREE.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#ffffff', { p: P(sx, 0.12, sz), s: [1, 0.7, 1] });
  B.solid(new THREE.CylinderGeometry(0.104, 0.104, 0.01, 16), '#ffd6de', { p: P(sx, 0.115, sz) });
  for (let i = 0; i < 8; i++) {
    const a = i * 0.8 + 0.3, r = i < 5 ? 0.06 : 0.02, y = i < 5 ? 0.13 : 0.16;
    const q = P(sx + Math.cos(a) * r, y, sz + Math.sin(a) * r);
    B.solid(new THREE.ConeGeometry(0.024, 0.05, 8), C.strawberry, { p: q, r: [Math.PI, 0, (i - 4) * 0.15] });
    B.solid(new THREE.ConeGeometry(0.02, 0.014, 6), C.green, { p: [q[0], q[1] + 0.028, q[2]] });
  }
  // lemonade bottle + two cups
  B.solid(new THREE.CylinderGeometry(0.04, 0.045, 0.2, 12), '#fff2a8', { p: P(0.18, 0.12, -0.5) });
  B.solid(new THREE.CylinderGeometry(0.015, 0.025, 0.06, 10), '#fff2a8', { p: P(0.18, 0.25, -0.5) });
  B.solid(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10), C.red, { p: P(0.18, 0.29, -0.5) });
  B.solid(new THREE.CylinderGeometry(0.04, 0.032, 0.08, 12), '#7ec8e3', { p: P(0.32, 0.06, -0.32) });
  B.solid(new THREE.CylinderGeometry(0.04, 0.032, 0.08, 12), '#ffa4c4', { p: P(-0.38, 0.06, -0.3) });
  // sandwiches on a plate
  B.solid(new THREE.CylinderGeometry(0.15, 0.12, 0.02, 20), '#ffffff', { p: P(-0.5, 0.035, -0.5) });
  for (let i = 0; i < 2; i++) {
    const q = P(-0.53 + i * 0.08, 0.07, -0.5 + i * 0.03);
    B.solid(new THREE.CylinderGeometry(0.08, 0.08, 0.025, 3), C.bread, { p: q, r: [0, i * 1.1, 0] });
    B.solid(new THREE.CylinderGeometry(0.083, 0.083, 0.01, 3), C.lettuce, { p: [q[0], q[1] + 0.017, q[2]], r: [0, i * 1.1, 0] });
    B.solid(new THREE.CylinderGeometry(0.08, 0.08, 0.022, 3), C.bread, { p: [q[0], q[1] + 0.033, q[2]], r: [0, i * 1.1, 0] });
  }
  // wild flowers around the blanket
  const fl = ['#ff5f9e', '#ffd23f', '#ffffff', '#9b7fd1'];
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7 + 0.4, r = 1.35 + (i % 3) * 0.15;
    const q = P(Math.cos(a) * r * 0.95, 0, Math.sin(a) * r * 0.75);
    B.solid(new THREE.CylinderGeometry(0.008, 0.01, 0.18, 4), C.greenDark, { p: [q[0], q[1] + 0.09, q[2]] });
    for (let k = 0; k < 5; k++) B.solid(new THREE.SphereGeometry(0.026, 6, 4), fl[i % 4], { p: [q[0] + Math.cos(k * 1.256) * 0.032, q[1] + 0.185, q[2] + Math.sin(k * 1.256) * 0.032], s: [1, 0.55, 1] });
    B.solid(new THREE.SphereGeometry(0.02, 6, 4), C.lemon, { p: [q[0], q[1] + 0.19, q[2]] });
  }
  return finish(ctx, B.build('romance-picnic'));
}

// ---------------------------------------------------------------------------------------------
/** Night beach: two striped towels, a warm lantern, glitter on the water. */
export function buildBeach(ctx, L, { tint = '#26c6da' } = {}) {
  const B = builder(ctx), P = local(L.center, L.yaw), halos = [];
  // towels on the sand, on the land side (local -z)
  for (const [x, c] of [[-0.42, tint], [0.42, '#ffd23f']]) {
    B.solid(rb(ctx, 0.62, 0.025, 1.5, 0.012, 1), (cx, cy, cz) => {
      const v = Math.floor((cz - L.center.z + 10) / 0.18 + (cx - L.center.x) * 0.0) % 2; return v ? c : '#ffffff';
    }, { p: P(x, 0.015, -2.2), r: [0, L.yaw + (x > 0 ? 0.08 : -0.06), 0] });
  }
  // lantern
  const q = P(0.95, 0, -1.6);
  B.solid(new THREE.CylinderGeometry(0.1, 0.12, 0.05, 10), C.metal, { p: [q[0], q[1] + 0.025, q[2]] });
  B.glow(new THREE.CylinderGeometry(0.075, 0.075, 0.18, 10), '#ffc56a', { p: [q[0], q[1] + 0.14, q[2]] });
  for (let k = 0; k < 4; k++) B.solid(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 4), C.metal, { p: [q[0] + Math.cos(k * 1.57 + 0.78) * 0.08, q[1] + 0.14, q[2] + Math.sin(k * 1.57 + 0.78) * 0.08] });
  B.solid(new THREE.ConeGeometry(0.11, 0.07, 10), C.metal, { p: [q[0], q[1] + 0.27, q[2]] });
  B.solid(new THREE.TorusGeometry(0.05, 0.008, 4, 10, Math.PI), C.metal, { p: [q[0], q[1] + 0.3, q[2]] });
  halos.push({ x: q[0], y: q[1] + 0.15, z: q[2] });
  // a few shells and a starfish on the sand
  for (let i = 0; i < 5; i++) {
    const s = P(-1.1 + i * 0.5, 0.02, -1.3 - (i % 2) * 0.5);
    B.solid(new THREE.SphereGeometry(0.04, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), i % 2 ? '#ffe0d6' : '#ffd1a8', { p: s, s: [1, 0.6, 1.2], r: [0, i, 0] });
  }
  const st = P(-0.9, 0.015, -2.6);
  for (let k = 0; k < 5; k++) B.solid(new THREE.ConeGeometry(0.03, 0.12, 5), '#ff8a5c', { p: [st[0] + Math.cos(k * 1.256) * 0.05, st[1], st[2] + Math.sin(k * 1.256) * 0.05], r: [Math.PI / 2, 0, -k * 1.256 + Math.PI / 2], s: [1, 1, 0.4] });
  const built = finish(ctx, B.build('romance-beach', { glowColor: '#ffc56a' }), halos, { size: 0.5 });
  // glitter on the water in front (local +z)
  const pts = [];
  for (let i = 0; i < 70; i++) { const p = P((Math.random() - 0.5) * 9, 0, 1 + Math.random() * 9); pts.push({ x: p[0], y: (ctx.world?.waterLevel ?? 0) + 0.04, z: p[2] }); }
  const glitter = createMotes(ctx, pts, { mode: 'glitter', color: '#bfe9ff', core: '#ffffff', size: 0.16 });
  built.object.add(glitter.object);
  const u = built.update, d = built.dispose;
  built.update = dt => { u(dt); glitter.update(dt); };
  built.dispose = () => { d(); glitter.dispose(); };
  return built;
}

// ---------------------------------------------------------------------------------------------
/** Candles in clusters (home evening) + a heart of rose petals on the floor near the bed. */
export function buildCandles(ctx, clusters, { petals = null } = {}) {
  const B = builder(ctx), halos = [];
  for (const cl of clusters) {
    const n = cl.n || 4;
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + (cl.seed || 0), r = i ? 0.09 + (i % 2) * 0.05 : 0;
      const h = 0.1 + ((i * 37) % 5) * 0.035;
      const x = cl.x + Math.cos(a) * r, z = cl.z + Math.sin(a) * r, y = cl.y;
      B.solid(new THREE.CylinderGeometry(0.032, 0.035, h, 12), i % 3 === 2 ? '#ffe3ef' : C.candle, { p: [x, y + h / 2, z] });
      B.solid(new THREE.SphereGeometry(0.02, 6, 4), C.candle, { p: [x + 0.02, y + h - 0.01, z], s: [0.6, 1.4, 0.6] });
      B.solid(new THREE.CylinderGeometry(0.003, 0.003, 0.02, 4), C.wick, { p: [x, y + h + 0.008, z] });
      B.glow(new THREE.ConeGeometry(0.014, 0.05, 8), '#ffd27a', { p: [x, y + h + 0.04, z] });
      halos.push({ x, y: y + h + 0.045, z });
    }
    if (cl.plate) B.solid(new THREE.CylinderGeometry(0.2, 0.18, 0.02, 20), '#c9a27a', { p: [cl.x, cl.y + 0.01, cl.z] });
  }
  if (petals) {
    // heart outline of petals on the floor
    const { x, y, z, yaw = 0, size = 0.55 } = petals;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = 0; i < 46; i++) {
      const t = (i / 46) * Math.PI * 2;
      const hx = 16 * Math.pow(Math.sin(t), 3) / 16, hz = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
      const lx = hx * size + (Math.random() - 0.5) * 0.05, lz = hz * size + (Math.random() - 0.5) * 0.05;
      B.solid(new THREE.SphereGeometry(0.03, 6, 3), i % 3 ? C.rose : C.rosePink, { p: [x + lx * c + lz * s, y + 0.008, z - lx * s + lz * c], s: [1.3, 0.18, 0.9], r: [0, Math.random() * 3, 0] });
    }
  }
  return finish(ctx, B.build('romance-candles', { shadows: false }), halos, { size: 0.26 });
}

// ---------------------------------------------------------------------------------------------
/** Fallback Vespa-style scooter (used only when Story's buildScooter is not available). */
export function buildScooterFallback(ctx, color = '#ffcf4a') {
  const B = builder(ctx);
  const body = color, trim = '#ffffff';
  B.solid(ctx.kit.blob(0.32, { seed: 4, wobble: 0.04, detail: 3 }), body, { p: [0, 0.48, -0.35], s: [0.85, 0.75, 1.25] });
  B.solid(rb(ctx, 0.34, 0.06, 0.7, 0.03), '#e9e2d0', { p: [0, 0.27, 0.15] });
  B.solid(rb(ctx, 0.4, 0.7, 0.12, 0.06), body, { p: [0, 0.6, 0.55], r: [-0.25, 0, 0] });
  B.solid(rb(ctx, 0.34, 0.1, 0.62, 0.05), C.seat, { p: [0, 0.78, -0.3] });
  B.solid(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), C.metal, { p: [0, 0.98, 0.6], r: [0, 0, Math.PI / 2] });
  B.solid(new THREE.CylinderGeometry(0.035, 0.035, 0.4, 8), C.metal, { p: [0, 0.8, 0.66], r: [0.3, 0, 0] });
  B.solid(rb(ctx, 0.2, 0.14, 0.14, 0.05), body, { p: [0, 1.0, 0.66] });
  B.glow(new THREE.SphereGeometry(0.06, 12, 8), '#fff4c2', { p: [0, 1.0, 0.74], s: [1, 1, 0.5] });
  for (const z of [0.6, -0.55]) {
    B.solid(new THREE.TorusGeometry(0.17, 0.065, 8, 18), C.tyre, { p: [0, 0.2, z], r: [0, Math.PI / 2, 0] });
    B.solid(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 12), trim, { p: [0, 0.2, z], r: [0, 0, Math.PI / 2] });
  }
  B.solid(rb(ctx, 0.3, 0.06, 0.4, 0.03), body, { p: [0, 0.4, 0.62], r: [0.2, 0, 0] });
  const group = B.build('romance-scooter', { glowColor: '#fff4c2', glowIntensity: 1.2 });
  ctx.toon.outline(group, { width: 0.015 });
  const seat = new THREE.Object3D(); seat.position.set(0, 0.84, -0.2); group.add(seat);
  return { object: group, seat, kind: 'scooter', dispose() { group.removeFromParent(); ctx.kit.dispose(group); } };
}
