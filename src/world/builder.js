// Static geometry builder: buildings and props are authored as many small primitives under a transform
// stack, coloured per part (vertex colours with a little jitter and an optional vertical gradient),
// then merged per material and per spatial cell, so a whole town costs a handful of draw calls.
// A soft contact darkening near the ground is baked into the vertex colours (cheap fake AO).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, clamp, smoothstep, lerp } from '../core/math.js';

const CELL = 48;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color(), _M = new THREE.Matrix4(), _N = new THREE.Matrix3();
const FLAT = new WeakMap();
/** Non-indexed position/normal arrays of a template (cached). */
function flat(geo) {
  let f = FLAT.get(geo);
  if (!f) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    f = { n: g.attributes.position.count, pos: Float32Array.from(g.attributes.position.array), nor: Float32Array.from(g.attributes.normal.array) };
    FLAT.set(geo, f);
  }
  return f;
}
/** Concatenate {pos, nor, col} parts into one BufferGeometry. */
function concat(list) {
  let n = 0; for (const p of list) n += p.pos.length;
  const pos = new Float32Array(n), nor = new Float32Array(n), col = new Float32Array(n);
  let o = 0; for (const p of list) { pos.set(p.pos, o); nor.set(p.nor, o); col.set(p.col, o); o += p.pos.length; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const GEO = new Map();   // shared template geometries (never disposed)

/** Rounded box centred at the origin with smooth normals (seg 1 = cheap). */
export function roundedBox(w, h, d, r = 0.08, seg = 1) {
  const k = `rb${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r.toFixed(3)}|${seg}`;
  if (GEO.has(k)) return GEO.get(k);
  r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  // 3×3 subdivision per face: inner rows sit at ±(half − r), outer rows are pushed out by r along
  // the corner direction → bevelled edges with smooth normals (reads as rounded under toon shading)
  const g = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3);
  const p = g.attributes.position, nr = g.attributes.normal;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const o = new THREE.Vector3();
  const side = t => (Math.abs(t) > 0.4 ? Math.sign(t) : 0);
  for (let i = 0; i < p.count; i++) {
    const sx = side(p.getX(i)), sy = side(p.getY(i)), sz = side(p.getZ(i));
    const cx = Math.sign(p.getX(i)) * hw, cy = Math.sign(p.getY(i)) * hh, cz = Math.sign(p.getZ(i)) * hd;
    o.set(sx, sy, sz); if (o.lengthSq() < 1e-6) o.set(nr.getX(i), nr.getY(i), nr.getZ(i));
    o.normalize();
    p.setXYZ(i, cx + o.x * r, cy + o.y * r, cz + o.z * r);
    nr.setXYZ(i, o.x, o.y, o.z);
  }
  g.deleteAttribute('uv');
  GEO.set(k, g);
  return g;
}

/** Lumpy rock: icosahedron with seeded displacement (shared vertices keep it watertight). */
export function rockGeometry(seed = 1, detail = 1) {
  const k = `rock${seed}|${detail}`;
  if (GEO.has(k)) return GEO.get(k);
  const g = new THREE.IcosahedronGeometry(1, detail);
  const R = rng(seed);
  const p = g.attributes.position, map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(key)) map.set(key, 0.8 + R() * 0.36);
    const s = map.get(key);
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.78, p.getZ(i) * s);
  }
  g.computeVertexNormals();
  g.deleteAttribute('uv');
  GEO.set(k, g);
  return g;
}

/** Icosphere with radial (smooth) normals: reads as a soft rounded blob under the toon ramp. */
export function smoothSphere(detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  return g;
}

export function shared(key, make) { if (!GEO.has(key)) { const g = make(); g.deleteAttribute?.('uv'); GEO.set(key, g); } return GEO.get(key); }

export class Builder {
  /** @param {{seed?:string, groundAt?:(x:number,z:number)=>number, ao?:boolean}} o */
  constructor(o = {}) {
    this.R = rng(o.seed || 'builder');
    this.groundAt = o.groundAt || (() => 0);
    this.parts = new Map();
    this.stack = [new THREE.Matrix4()];
    this.cellFixed = null;
    this.colliders = [];
    this.surfaces = [];
    this.glows = [];
    this.jitter = 0.04;
    this.noShadow = false;
    this.aoOn = o.ao ?? true;
  }
  get M() { return this.stack[this.stack.length - 1]; }
  push(x = 0, y = 0, z = 0, ry = 0, s = 1, rx = 0, rz = 0) {
    _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
    if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
    _m.compose(_p.set(x, y, z), _q, _s);
    this.stack.push(this.M.clone().multiply(_m));
    return this;
  }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  world(x, y, z, out = new THREE.Vector3()) { return out.set(x, y, z).applyMatrix4(this.M); }
  yaw() { const e = new THREE.Vector3(0, 0, 1).transformDirection(this.M); return Math.atan2(e.x, e.z); }
  at(x, z) { this.cellFixed = `${Math.floor(x / CELL)}_${Math.floor(z / CELL)}`; return this; }
  free() { this.cellFixed = null; return this; }
  _key(mat, wx, wz) {
    const cell = this.cellFixed || `${Math.floor(wx / CELL)}_${Math.floor(wz / CELL)}`;
    return `${mat}|${cell}|${this.noShadow ? 'n' : 's'}`;
  }

  /**
   * Add a template geometry with a local transform and a colour.
   * t: {x,y,z,rx,ry,rz,sx,sy,sz,mat,jitter,grad (0..1 darker bottom), top (colour for the top half)}
   */
  add(geo, color, t = {}) {
    const mat = t.mat || 'solid';
    _e.set(t.rx || 0, t.ry || 0, t.rz || 0, 'YXZ'); _q.setFromEuler(_e);
    _s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    _m.compose(_p.set(t.x || 0, t.y || 0, t.z || 0), _q, _s);
    _M.multiplyMatrices(this.M, _m);
    _N.getNormalMatrix(_M);
    const T = flat(geo);
    const n = T.n, sp = T.pos, sn = T.nor;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const e = _M.elements, ne = _N.elements;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n * 3; i += 3) {
      const x = sp[i], y = sp[i + 1], z = sp[i + 2];
      const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14];
      pos[i] = X; pos[i + 1] = Y; pos[i + 2] = Z;
      if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
      const a = sn[i], b = sn[i + 1], c = sn[i + 2];
      let nx = ne[0] * a + ne[3] * b + ne[6] * c, ny = ne[1] * a + ne[4] * b + ne[7] * c, nz = ne[2] * a + ne[5] * b + ne[8] * c;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nor[i] = nx / l; nor[i + 1] = ny / l; nor[i + 2] = nz / l;
    }
    _c.set(color);
    const j = t.jitter ?? this.jitter;
    const f = 1 + (this.R() - 0.5) * 2 * j;
    const grad = t.grad || 0, span = Math.max(1e-3, maxY - minY);
    const r = _c.r * f, g = _c.g * f, bl = _c.b * f;
    for (let i = 0; i < n * 3; i += 3) {
      const k = grad ? 1 - grad + grad * (pos[i + 1] - minY) / span : 1;
      col[i] = r * k; col[i + 1] = g * k; col[i + 2] = bl * k;
    }
    const key = this._key(mat, e[12], e[14]);
    if (!this.parts.has(key)) this.parts.set(key, { mat, list: [], shadow: !this.noShadow && !t.noShadow, ao: t.ao ?? this.aoOn });
    this.parts.get(key).list.push({ pos, nor, col });
    return this;
  }

  box(w, h, d, x, y, z, color, t = {}) {
    const r = Math.min(t.round ?? 0, w * 0.45, h * 0.45, d * 0.45);
    const geo = r > 0.004 ? roundedBox(w, h, d, r, 1) : shared(`b${w.toFixed(3)}_${h.toFixed(3)}_${d.toFixed(3)}`, () => new THREE.BoxGeometry(w, h, d));
    return this.add(geo, color, { ...t, x, y, z });
  }
  cyl(rt, rb, h, x, y, z, color, t = {}) {
    const seg = t.seg || 10;
    const geo = shared(`c${rt}_${rb}_${h}_${seg}_${t.open ? 1 : 0}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!t.open));
    return this.add(geo, color, { ...t, x, y, z });
  }
  cone(r, h, x, y, z, color, t = {}) {
    const seg = t.seg || 10;
    const geo = shared(`k${r}_${h}_${seg}_${t.open ? 1 : 0}`, () => new THREE.ConeGeometry(r, h, seg, 1, !!t.open));
    return this.add(geo, color, { ...t, x, y, z });
  }
  sphere(r, x, y, z, color, t = {}) {
    const d = t.detail ?? 1;
    const geo = shared(`s${d}`, () => smoothSphere(d));
    return this.add(geo, color, { ...t, x, y, z, sx: r * (t.sx ?? 1), sy: r * (t.sy ?? 1), sz: r * (t.sz ?? 1) });
  }
  dome(r, x, y, z, color, t = {}) {   // half sphere, flat bottom
    const geo = shared('dome', () => new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2));
    return this.add(geo, color, { ...t, x, y, z, sx: r * (t.sx ?? 1), sy: r * (t.sy ?? 1), sz: r * (t.sz ?? 1) });
  }
  rock(r, x, y, z, color, t = {}) {
    const v = t.variant ?? Math.floor(this.R() * 6);
    return this.add(rockGeometry(100 + v, t.detail ?? 1), color, { ...t, x, y, z, sx: r * (t.sx ?? 1), sy: r * (t.sy ?? 1), sz: r * (t.sz ?? 1) });
  }
  torus(r, tube, x, y, z, color, t = {}) {
    const geo = shared(`t${r}_${tube}_${t.arc || 'f'}`, () => new THREE.TorusGeometry(r, tube, 6, 16, t.arc || Math.PI * 2));
    return this.add(geo, color, { ...t, x, y, z });
  }
  /** Cylinder beam between two local points. */
  beam(a, b, r, color, t = {}) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    return this.cyl(r, r, len, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, color, { ...t, rx: e.x, ry: e.y, rz: e.z, seg: t.seg || 6 });
  }
  /** Extruded 2D shape (points [[x,y]…]) of thickness t along local z. */
  extrude(pts, depth, x, y, z, color, t = {}) {
    const key = 'ex' + pts.map(p => p.map(v => v.toFixed(2)).join(',')).join(';') + '|' + depth;
    const geo = shared(key, () => {
      const s = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
      const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 });
      g.translate(0, 0, -depth / 2);
      return g;
    });
    return this.add(geo, color, { ...t, x, y, z });
  }

  // ---- gameplay data in world space ----
  circle(x, z, r, tag) { const p = this.world(x, 0, z); this.colliders.push({ type: 'circle', x: p.x, z: p.z, r, tag }); return this; }
  rect(x, z, hw, hd, rot = 0, tag) { const p = this.world(x, 0, z); this.colliders.push({ type: 'box', x: p.x, z: p.z, hw, hd, rot: rot + this.yaw(), tag }); return this; }
  deck(x, z, hw, hd, y, rot = 0, tag) { const p = this.world(x, y, z); this.surfaces.push({ type: 'box', x: p.x, z: p.z, hw, hd, rot: rot + this.yaw(), y: p.y, tag }); return this; }
  glow(x, y, z, color = '#ffc070', size = 1, kind = 'lamp') { const p = this.world(x, y, z); this.glows.push({ x: p.x, y: p.y, z: p.z, color, size, kind }); return this; }

  /** Merge every part (all materials) into one geometry with vertex colours (instancing templates). */
  geometry({ ao = this.aoOn } = {}) {
    const list = [];
    for (const { list: l } of this.parts.values()) list.push(...l);
    this.parts.clear();
    if (!list.length) return new THREE.BufferGeometry();
    const g = concat(list);
    if (ao) {
      const p = g.attributes.position, c = g.attributes.color;
      for (let i = 0; i < p.count; i++) {
        const k = lerp(0.7, 1, smoothstep(-0.05, 0.6, p.getY(i) - this.groundAt(p.getX(i), p.getZ(i))));
        c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
      }
    }
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }

  /** Merge into meshes. materials: {name: Material}. */
  build(materials, { name = 'Static', matrixAuto = false } = {}) {
    const group = new THREE.Group(); group.name = name;
    for (const [key, { mat, list, shadow, ao }] of this.parts) {
      if (!list.length) continue;
      const g = concat(list);
      if (ao && mat !== 'glow') {
        const p = g.attributes.position, c = g.attributes.color;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          const gy = this.groundAt(x, z);
          const k = lerp(0.66, 1, smoothstep(-0.05, 0.7, y - gy));
          c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
        }
      }
      g.computeBoundingSphere(); g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, materials[mat] || materials.solid);
      mesh.name = key;
      mesh.castShadow = shadow && mat !== 'glow' && mat !== 'water';
      mesh.receiveShadow = mat !== 'glow';
      mesh.matrixAutoUpdate = matrixAuto;
      mesh.updateMatrix();
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}
