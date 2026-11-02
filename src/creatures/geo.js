// Private helpers for procedural Velmon: rounded primitives and a rigid-skinning builder that merges
// every part into ONE vertex-coloured SkinnedMesh (+ one glow mesh + one outline shell) = ≤ 3 draw calls.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const Y = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Color();

/** Ensure an indexed geometry with only position + normal. */
function clean(g) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.index) g = mergeVertices(g);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** Smooth normals across UV seams after a vertex warp. */
function resmooth(g) {
  g.deleteAttribute('normal');
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const m = mergeVertices(g, 1e-4);
  m.computeVertexNormals();
  return m;
}

export const G = {
  /** Ellipsoid. */
  ell(rx, ry = rx, rz = rx, w = 20, h = 14) { const g = new THREE.SphereGeometry(1, w, h); g.scale(rx, ry, rz); return g; },
  /** Teardrop along +Y: round base radius 1 at y=0, pointed tip at y=h (scale it afterwards). */
  tear(h = 2, seg = 14, sharp = 1.5) {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(1e-3, Math.cos(a)), Math.sin(a))); }
    for (let j = 1; j <= 9; j++) { const s = j / 9; pts.push(new THREE.Vector2(Math.max(1e-3, Math.pow(1 - s, sharp)), s * h)); }
    pts[0].x = 1e-3; pts[pts.length - 1].x = 1e-3;
    return resmooth(new THREE.LatheGeometry(pts, seg));
  },
  /** Generic lathe from [[r, y], ...] (bottom → top). */
  lathe(pts, seg = 16) { return resmooth(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(1e-3, r), y)), seg)); },
  torus(R, r, arc = Math.PI * 2, rs = 8, ts = 20) { return new THREE.TorusGeometry(R, r, rs, ts, arc); },
  cyl(rt, rb, h, seg = 10) { return new THREE.CylinderGeometry(rt, rb, h, seg, 1); },
  box(w, h, d) { return new THREE.BoxGeometry(w, h, d); },
  /** Bumpy ellipsoid (rocks, wool, foliage). */
  bumpy(rx, ry, rz, { amp = 0.08, freq = 3, seed = 1, w = 22, h = 16 } = {}) {
    const g = new THREE.SphereGeometry(1, w, h), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i);
      const n = Math.sin(_v.x * freq + seed) * Math.sin(_v.y * freq * 1.3 + seed * 2.1) * Math.sin(_v.z * freq * 0.9 + seed * 0.7)
        + 0.5 * Math.sin(_v.x * freq * 2.3 - seed) * Math.sin(_v.z * freq * 2.1 + seed);
      _v.multiplyScalar(1 + n * amp);
      p.setXYZ(i, _v.x * rx, _v.y * ry, _v.z * rz);
    }
    return resmooth(g);
  },
  /** Mochi / drop: wide soft bottom, round or pointed top. */
  drop(r = 1, h = 1.2, tip = 0) {
    const pts = [];
    for (let i = 0; i <= 18; i++) {
      const s = i / 18, y = s * h;
      let rr = Math.sin(Math.min(1, s * 1.05) * Math.PI) ** 0.62 * r * (1 - s * 0.18);
      if (tip > 0 && s > 0.55) rr *= 1 - Math.pow((s - 0.55) / 0.45, 1.2) * tip;
      pts.push([rr, y]);
    }
    pts[0][0] = 0; pts[pts.length - 1][0] = 0;
    return G.lathe(pts, 22);
  },
  /** Five-pointed flat star (sparkles, crowns). */
  star(r = 1, inner = 0.45, depth = 0.25) {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? r * inner : r; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: r * 0.08, bevelThickness: r * 0.08, bevelSegments: 1 });
    g.translate(0, 0, -depth / 2);
    return g;
  },
  /** Warp positions: fn(v: Vector3) mutates v. Re-smooths normals. */
  warp(g, fn) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i); fn(_v); p.setXYZ(i, _v.x, _v.y, _v.z); }
    return resmooth(g);
  },
};

/** Point + orientation on an ellipsoid surface. yaw 0 = +z (front), pitch up positive (degrees). */
export function onSurface(c, r, yawDeg, pitchDeg, push = 0) {
  const yaw = yawDeg * Math.PI / 180, pitch = pitchDeg * Math.PI / 180;
  const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const k = 1 / Math.sqrt((d.x / r[0]) ** 2 + (d.y / r[1]) ** 2 + (d.z / r[2]) ** 2);
  const p = d.clone().multiplyScalar(k);
  const n = new THREE.Vector3(p.x / r[0] ** 2, p.y / r[1] ** 2, p.z / r[2] ** 2).normalize();
  p.addScaledVector(n, push).add(new THREE.Vector3(c[0], c[1], c[2]));
  _m.lookAt(n, ZERO, Y);
  const q = new THREE.Quaternion().setFromRotationMatrix(_m);
  return { p: [p.x, p.y, p.z], q, n };
}

/** Collects bones + rigid parts; build() returns meshes bound to one skeleton. */
export class Builder {
  constructor() { this.bones = []; this.index = {}; this.abs = []; this.parts = []; this.meta = {}; }
  /** Define a bone at absolute rest position (model space). */
  bone(name, parent, pos, meta = {}) {
    const b = new THREE.Bone(); b.name = name;
    const i = this.bones.length;
    this.bones.push(b); this.index[name] = i; this.abs.push(new THREE.Vector3(...pos));
    const pi = parent == null ? -1 : this.index[parent];
    if (parent != null && pi === undefined) throw new Error('bone parent missing ' + parent);
    if (pi >= 0) { this.bones[pi].add(b); b.position.copy(this.abs[i]).sub(this.abs[pi]); } else b.position.copy(this.abs[i]);
    b.userData.rest = b.position.clone();
    b.userData.meta = meta;
    return name;
  }
  has(name) { return name in this.index; }
  /**
   * Add a rigid part. opts: color, bone, p [x,y,z], r euler [x,y,z] (radians), s scalar|[x,y,z],
   * q Quaternion, dir [x,y,z] (aim local +Y along dir), roll (radians around the aimed axis),
   * glow (emissive group), outline (default true).
   */
  add(geo, o = {}) {
    const g = clean(geo.clone());
    const s = o.s ?? 1;
    _s.set(...(Array.isArray(s) ? s : [s, s, s]));
    if (o.q) _q.copy(o.q); else _q.setFromEuler(_e.set(...(o.r || [0, 0, 0])));
    if (o.dir) {
      _q2.setFromUnitVectors(Y, _v.set(...o.dir).normalize());
      _q.copy(_q2).multiply(new THREE.Quaternion().setFromAxisAngle(Y, o.roll || 0));
      if (o.q) _q.multiply(o.q);
    }
    _p.set(...(o.p || [0, 0, 0]));
    // scale first (local), then orient, then place
    g.applyMatrix4(_m.compose(_p, _q, _s));
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3); _c.set(o.color ?? '#ffffff');
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const bi = this.index[o.bone || 'body'] ?? 0;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    this.parts.push({ g, glow: !!o.glow, outline: o.outline !== false && !o.glow });
    return this;
  }
  /** Mirror helper: adds the part at +x with bone nameL and at -x with bone nameR. */
  pair(geo, o, bone) {
    const p = o.p || [0, 0, 0], r = o.r || [0, 0, 0];
    this.add(geo, { ...o, bone: bone ? bone + 'L' : o.bone, p, r });
    const dir = o.dir ? [-o.dir[0], o.dir[1], o.dir[2]] : undefined;
    this.add(geo, { ...o, bone: bone ? bone + 'R' : o.bone, p: [-p[0], p[1], p[2]], r: [r[0], -r[1], -r[2]], dir, roll: o.roll != null ? -o.roll : undefined });
    return this;
  }
  /** Merge parts → {body, glow, outline} geometries. */
  geometries() {
    const pick = f => { const l = this.parts.filter(f).map(p => p.g); return l.length ? mergeGeometries(l, false) : null; };
    const out = { body: pick(p => !p.glow), glow: pick(p => p.glow), outline: pick(p => p.outline) };
    for (const p of this.parts) p.g.dispose();
    return out;
  }
}
