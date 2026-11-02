// Mesh helpers: merge static geometry, instancing, vertex colours, rounded primitives.
// Build-time helpers (allocations are fine here); nothing in this file runs per frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP = ['position', 'normal', 'uv', 'color'];

/** Normalise a geometry for merging: non-indexed, only position/normal/uv/color, all four present. */
function prep(g, needColor) {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(n.attributes)) if (!KEEP.includes(k)) n.deleteAttribute(k);
  for (const k of Object.keys(n.morphAttributes)) delete n.morphAttributes[k];
  const count = n.attributes.position.count;
  if (!n.attributes.normal) n.computeVertexNormals();
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
  if (needColor && !n.attributes.color) n.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  if (!needColor && n.attributes.color) n.deleteAttribute('color');
  if (n.attributes.color && n.attributes.color.itemSize === 4) {
    const c4 = n.attributes.color, c3 = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { c3[i * 3] = c4.getX(i); c3[i * 3 + 1] = c4.getY(i); c3[i * 3 + 2] = c4.getZ(i); }
    n.setAttribute('color', new THREE.Float32BufferAttribute(c3, 3));
  }
  n.clearGroups();
  return n;
}

export const kit = {
  /**
   * Bake every static mesh under group into one mesh per material (world matrices applied, sources
   * disposed). Instanced, skinned and outline meshes are skipped (kept out of the result).
   * Shadows: casts if any source cast; receives always. Returns a new Group (matrixAutoUpdate off).
   */
  mergeStatic(group) {
    group.updateMatrixWorld(true);
    const byMat = new Map();
    group.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.isOutline || !o.geometry?.attributes?.position) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.length > 1) { console.warn('[kit] mergeStatic: multi-material mesh skipped', o.name); return; }
      const mat = mats[0];
      let e = byMat.get(mat);
      if (!e) byMat.set(mat, (e = { list: [], cast: false }));
      e.list.push({ g: o.geometry, m: o.matrixWorld.clone() });
      e.cast = e.cast || o.castShadow !== false;
    });
    const out = new THREE.Group(); out.name = (group.name || 'static') + '-merged';
    const dispose = new Set();
    for (const [mat, e] of byMat) {
      const needColor = !!mat.vertexColors;
      const geos = e.list.map(({ g, m }) => { dispose.add(g); return prep(g, needColor).applyMatrix4(m); });
      const geo = mergeGeometries(geos, false);
      geos.forEach(g => g.dispose());
      if (!geo) { console.warn('[kit] mergeStatic: merge failed for', mat.name); continue; }
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = e.cast; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      out.add(mesh);
    }
    for (const g of dispose) g.dispose();
    out.matrixAutoUpdate = false;
    return out;
  },

  /**
   * InstancedMesh from transforms [{x, y, z, ry, rx?, rz?, s | sx/sy/sz, color?}].
   * Per-instance colour when any transform has `color`. Bounds are computed for frustum culling.
   */
  instanced(geometry, material, transforms, { castShadow = true, receiveShadow = true } = {}) {
    const im = new THREE.InstancedMesh(geometry, material, Math.max(1, transforms.length));
    im.count = transforms.length;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
    const colored = transforms.some(t => t.color != null);
    transforms.forEach((t, i) => {
      e.set(t.rx || 0, t.ry || 0, t.rz || 0); q.setFromEuler(e);
      p.set(t.x || 0, t.y || 0, t.z || 0);
      const u = t.s ?? 1; s.set(t.sx ?? u, t.sy ?? u, t.sz ?? u);
      im.setMatrixAt(i, m.compose(p, q, s));
      if (colored) im.setColorAt(i, c.set(t.color ?? '#ffffff'));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = castShadow; im.receiveShadow = receiveShadow;
    im.computeBoundingSphere?.(); im.computeBoundingBox?.();
    return im;
  },

  /** Paint a whole geometry with one vertex colour (for kit.mergeStatic + toon.matVC). */
  vcolor(geometry, color) {
    const c = new THREE.Color(color), n = geometry.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return geometry;
  },
  /** Vertical vertex-colour gradient (bottom → top), e.g. grass blades, tree trunks, sky domes. */
  vgradient(geometry, bottom, top) {
    geometry.computeBoundingBox();
    const b = geometry.boundingBox, h = Math.max(1e-6, b.max.y - b.min.y);
    const c0 = new THREE.Color(bottom), c1 = new THREE.Color(top), c = new THREE.Color();
    const p = geometry.attributes.position, a = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { c.lerpColors(c0, c1, (p.getY(i) - b.min.y) / h); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return geometry;
  },
  /** Box with rounded edges (smooth normals). */
  roundedBox(w, h, d, r = 0.1, seg = 2) {
    r = Math.min(r, w / 2, h / 2, d / 2);
    const g = new THREE.BoxGeometry(w, h, d, seg * 2 + 1, seg * 2 + 1, seg * 2 + 1), p = g.attributes.position, n = g.attributes.normal;
    const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const cx = Math.max(-hx, Math.min(hx, x)), cy = Math.max(-hy, Math.min(hy, y)), cz = Math.max(-hz, Math.min(hz, z));
      let dx = x - cx, dy = y - cy, dz = z - cz; const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      p.setXYZ(i, cx + dx * r, cy + dy * r, cz + dz * r);
      n.setXYZ(i, dx, dy, dz);
    }
    // merge the duplicated face-border vertices' normals → smooth rounded shading
    return mergeVerticesSmooth(g);
  },
  capsule(r = 0.3, len = 1, capSeg = 6, radSeg = 12) { return new THREE.CapsuleGeometry(r, len, capSeg, radSeg); },
  /** Organic rounded blob (rocks, bushes, Velmon bodies): seeded smooth wobble on an icosphere. */
  blob(r = 1, { seed = 1, wobble = 0.1, detail = 2 } = {}) {
    const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.hypot(x, y, z) || 1;
      const nx = x / l, ny = y / l, nz = z / l;
      const n = Math.sin(nx * 3.1 + seed) * Math.sin(ny * 2.7 + seed * 1.3) * Math.sin(nz * 3.3 + seed * 0.7)
        + 0.5 * Math.sin(nx * 5.3 - seed * 0.9) * Math.sin(nz * 4.1 + seed * 2.1);
      const k = 1 + n * wobble;
      p.setXYZ(i, nx * r * k, ny * r * k, nz * r * k);
    }
    return mergeVerticesSmooth(g);
  },
  /** Dispose geometries under obj (materials are shared toon materials: not disposed). */
  dispose(obj) {
    obj?.traverse?.(o => { if (o.geometry && !o.userData.isOutline) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose?.(); });
    obj?.removeFromParent?.();
  },
};

/** Weld coincident vertices and recompute smooth normals (keeps uv of the first vertex). */
function mergeVerticesSmooth(g) {
  const ni = g.index ? g.toNonIndexed() : g;
  const p = ni.attributes.position, uv = ni.attributes.uv;
  const map = new Map(), pos = [], uvs = [], idx = [];
  const q = 1e4;
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * q)},${Math.round(p.getY(i) * q)},${Math.round(p.getZ(i) * q)}`;
    let j = map.get(k);
    if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0); }
    idx.push(j);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setIndex(idx);
  out.computeVertexNormals();
  if (ni !== g) ni.dispose();
  g.dispose();
  return out;
}

export default kit;
