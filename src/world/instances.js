// Streamed instancing: thousands of placements per kind (trees, bushes, flowers, grass clumps) kept
// in a spatial grid; only the ones within `radius` of the camera focus are copied into one
// InstancedMesh per kind (rebuilt when the focus moves a few metres). One draw call per kind, and the
// triangle count stays bounded no matter how big the island is.
import * as THREE from 'three';

const CELL = 16;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export class InstanceSet {
  /**
   * @param {string} name
   * @param {THREE.BufferGeometry} geo
   * @param {THREE.Material} mat
   * @param {{castShadow?:boolean, receiveShadow?:boolean, cap?:number}} o
   */
  constructor(name, geo, mat, o = {}) {
    this.name = name; this.geo = geo; this.mat = mat; this.o = o;
    this.m = [];            // flat matrices
    this.xz = [];
    this.n = 0;
    this.mesh = null;
    this.extra = o.extra || null;   // optional per-instance colour
    this.col = [];
  }
  /** t: {x, y, z, ry=0, s=1, sy?, rx?, rz?, color?} */
  add(t) {
    _e.set(t.rx || 0, t.ry || 0, t.rz || 0, 'YXZ'); _q.setFromEuler(_e);
    const s = t.s ?? 1; _s.set(t.sx ?? s, t.sy ?? s, t.sz ?? s);
    _m.compose(_p.set(t.x, t.y || 0, t.z), _q, _s);
    for (let i = 0; i < 16; i++) this.m.push(_m.elements[i]);
    this.xz.push(t.x, t.z);
    if (t.color) { const c = new THREE.Color(t.color); this.col.push(c.r, c.g, c.b); } else if (this.col.length) this.col.push(1, 1, 1);
    this.n++;
  }
  finish() {
    this.M = new Float32Array(this.m); this.m = null;
    this.XZ = new Float32Array(this.xz); this.xz = null;
    this.C = this.col.length ? new Float32Array(this.col) : null; this.col = null;
    this.grid = new Map();
    for (let i = 0; i < this.n; i++) {
      const k = Math.floor(this.XZ[i * 2] / CELL) + ',' + Math.floor(this.XZ[i * 2 + 1] / CELL);
      let l = this.grid.get(k); if (!l) this.grid.set(k, (l = [])); l.push(i);
    }
    const cap = Math.min(this.n, this.o.cap || 6000);
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, Math.max(1, cap));
    this.mesh.name = 'inst:' + this.name;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = !!this.o.castShadow;
    this.mesh.receiveShadow = this.o.receiveShadow ?? true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.C) this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, cap) * 3), 3);
    this.cap = cap;
    return this.mesh;
  }
  /** Copy the instances within r of (x,z) into the mesh. */
  stream(x, z, r) {
    if (!this.mesh) return;
    const arr = this.mesh.instanceMatrix.array, carr = this.mesh.instanceColor?.array;
    const r2 = r * r;
    let c = 0;
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    outer: for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const l = this.grid.get(i + ',' + j); if (!l) continue;
      for (const k of l) {
        const dx = this.XZ[k * 2] - x, dz = this.XZ[k * 2 + 1] - z;
        if (dx * dx + dz * dz > r2) continue;
        if (c >= this.cap) break outer;
        arr.set(this.M.subarray(k * 16, k * 16 + 16), c * 16);
        if (carr) { carr[c * 3] = this.C[k * 3]; carr[c * 3 + 1] = this.C[k * 3 + 1]; carr[c * 3 + 2] = this.C[k * 3 + 2]; }
        c++;
      }
    }
    this.mesh.count = c;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (carr) this.mesh.instanceColor.needsUpdate = true;
  }
  /** Nearest instance centres (for colliders / queries) as a callback over all. */
  forEach(fn) { for (let i = 0; i < this.n; i++) fn(this.XZ[i * 2], this.XZ[i * 2 + 1], i); }
  dispose() { this.mesh?.dispose(); }
}

/** A group of InstanceSets streamed together. */
export class Streamer {
  constructor(name, radius = 62, step = 5) { this.group = new THREE.Group(); this.group.name = name; this.sets = []; this.radius = radius; this.step = step; this.lx = 1e9; this.lz = 1e9; }
  set(name, geo, mat, o) { const s = new InstanceSet(name, geo, mat, o); this.sets.push(s); return s; }
  finish() { for (const s of this.sets) if (s.n) this.group.add(s.finish()); this.sets = this.sets.filter(s => s.n); return this; }
  update(x, z, force = false) {
    if (!force && Math.abs(x - this.lx) < this.step && Math.abs(z - this.lz) < this.step) return;
    this.lx = x; this.lz = z;
    for (const s of this.sets) s.stream(x, z, (s.o.radius || this.radius));
  }
  dispose() { for (const s of this.sets) s.dispose(); this.group.removeFromParent(); }
}
