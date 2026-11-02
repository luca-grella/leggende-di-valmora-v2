// Colliders (circles + oriented boxes) in a spatial hash, plus walkable surfaces (docks, bridges,
// decks, interior floors). resolve() pushes a moving circle out of every overlapping shape, which
// makes the player slide smoothly along walls, fences and tree trunks instead of stopping dead.
const CELL = 8;
const key = (i, j) => (i + 4096) * 8192 + (j + 4096);
const EMPTY = [];

/**
 * Shapes: {type:'circle', x, z, r} | {type:'box', x, z, hw, hd, rot}. Optional: tag, off (disabled).
 * Surfaces: {type:'box', x, z, hw, hd, rot, y} | {type:'disc', x, z, r, y} |
 *           {type:'span', x0, z0, x1, z1, hw, y0, y1, arch}
 */
export function createColliders() {
  const grid = new Map(), sgrid = new Map();
  const byId = new Map();
  let seq = 0;

  function bbox(c) {
    if (c.type === 'circle' || c.type === 'disc') return [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r];
    if (c.type === 'box') { const r = Math.hypot(c.hw, c.hd); return [c.x - r, c.z - r, c.x + r, c.z + r]; }
    if (c.type === 'span') { const r = c.hw + 0.5; return [Math.min(c.x0, c.x1) - r, Math.min(c.z0, c.z1) - r, Math.max(c.x0, c.x1) + r, Math.max(c.z0, c.z1) + r]; }
    return [c.x, c.z, c.x, c.z];
  }
  function cells(c, fn) {
    const [x0, z0, x1, z1] = bbox(c);
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) fn(key(i, j));
  }
  const near = (map, x, z) => map.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || EMPTY;
  const nearR = (map, x, z, r, out) => {
    out.length = 0;
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
      const l = map.get(key(i, j)); if (l) for (const c of l) if (!out.includes(c)) out.push(c);
    }
    return out;
  };
  const tmpList = [];
  const L = { x: 0, z: 0 };
  function toLocal(c, x, z) {
    const dx = x - c.x, dz = z - c.z, co = Math.cos(c.rot || 0), si = Math.sin(c.rot || 0);
    L.x = dx * co - dz * si; L.z = dx * si + dz * co; return L;
  }

  /** Push point (x,z) radius r out of shape c. Returns [nx, nz] or null when not overlapping. */
  function push(c, x, z, r) {
    if (c.type === 'circle') {
      const dx = x - c.x, dz = z - c.z, rr = c.r + r, d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) return null;
      const d = Math.sqrt(d2) || 1e-4;
      return [c.x + dx / d * rr, c.z + dz / d * rr];
    }
    if (c.type === 'box') {
      const l = toLocal(c, x, z);
      const hx = c.hw, hz = c.hd;
      const qx = Math.max(-hx, Math.min(hx, l.x)), qz = Math.max(-hz, Math.min(hz, l.z));
      let dx = l.x - qx, dz = l.z - qz, d2 = dx * dx + dz * dz;
      let nx, nz;
      if (d2 > 1e-10) {
        if (d2 >= r * r) return null;
        const d = Math.sqrt(d2); nx = qx + dx / d * r; nz = qz + dz / d * r;
      } else {
        // centre inside the box: push out through the nearest face
        const px = hx - Math.abs(l.x), pz = hz - Math.abs(l.z);
        if (px < pz) { nx = Math.sign(l.x || 1) * (hx + r); nz = l.z; } else { nx = l.x; nz = Math.sign(l.z || 1) * (hz + r); }
      }
      const co = Math.cos(c.rot || 0), si = Math.sin(c.rot || 0);
      return [c.x + nx * co + nz * si, c.z - nx * si + nz * co];
    }
    return null;
  }

  function surfaceY(s, x, z) {
    if (s.off) return null;
    if (s.type === 'box') { const l = toLocal(s, x, z); return Math.abs(l.x) <= s.hw && Math.abs(l.z) <= s.hd ? s.y : null; }
    if (s.type === 'disc') return (x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r ? s.y : null;
    if (s.type === 'span') {
      const dx = s.x1 - s.x0, dz = s.z1 - s.z0, L2 = dx * dx + dz * dz;
      const t = ((x - s.x0) * dx + (z - s.z0) * dz) / L2;
      if (t < -0.02 || t > 1.02) return null;
      const tc = Math.max(0, Math.min(1, t));
      const px = s.x0 + dx * tc - x, pz = s.z0 + dz * tc - z;
      if (px * px + pz * pz > s.hw * s.hw) return null;
      return s.y0 + (s.y1 - s.y0) * tc + (s.arch || 0) * Math.sin(Math.PI * tc);
    }
    return null;
  }

  const api = {
    /** Add a collider shape → id. */
    add(c) {
      if (!c.type) c.type = c.hw != null ? 'box' : 'circle';
      if (c.type === 'circle' && !(c.r > 0)) c.r = 0.5;
      const id = c.id ?? ++seq; c.id = id;
      byId.set(id, c); cells(c, k => { if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c); });
      return id;
    },
    remove(id) {
      const c = byId.get(id); if (!c) return;
      byId.delete(id);
      if (c.isSurface) cells(c, k => { const l = sgrid.get(k); if (l) { const i = l.indexOf(c); if (i >= 0) l.splice(i, 1); } });
      else cells(c, k => { const l = grid.get(k); if (l) { const i = l.indexOf(c); if (i >= 0) l.splice(i, 1); } });
    },
    /** Remove every shape with the given group tag (used when an island/interior is disposed). */
    removeGroup(group) { for (const [id, c] of byId) if (c.group === group) api.remove(id); },
    setOff(id, off) { const c = byId.get(id); if (c) c.off = !!off; },
    get(id) { return byId.get(id); },
    addSurface(s) {
      const id = s.id ?? ++seq; s.id = id; s.isSurface = true;
      byId.set(id, s); cells(s, k => { if (!sgrid.has(k)) sgrid.set(k, []); sgrid.get(k).push(s); });
      return id;
    },
    /** Highest surface at x,z (or null). */
    surfaceAt(x, z, below = Infinity) {
      let best = null;
      for (const s of near(sgrid, x, z)) { const y = surfaceY(s, x, z); if (y != null && y <= below && (best == null || y > best)) best = y; }
      return best;
    },
    /** Move a circle from → to, sliding along shapes. Returns {x, z}. */
    resolve(from, to, r = 0.35) {
      let x = to.x, z = to.z;
      for (let it = 0; it < 3; it++) {
        let moved = false;
        for (const c of nearR(grid, x, z, r + 1, tmpList)) {
          if (c.off) continue;
          const p = push(c, x, z, r);
          if (p) { x = p[0]; z = p[1]; moved = true; }
        }
        if (!moved) break;
      }
      // never tunnel more than the requested step
      const dx = x - from.x, dz = z - from.z, d = Math.hypot(dx, dz), want = Math.hypot(to.x - from.x, to.z - from.z) + 0.05;
      if (d > want && d > 0) { x = from.x + dx / d * want; z = from.z + dz / d * want; }
      return { x, z };
    },
    /** True when a circle at x,z overlaps any shape. */
    blocked(x, z, r = 0.35) {
      for (const c of nearR(grid, x, z, r + 1, tmpList)) if (!c.off && push(c, x, z, r)) return true;
      return false;
    },
    /** Segment test for line of sight (trainer sight): true when a shape crosses a→b. */
    segmentBlocked(ax, az, bx, bz, step = 1) {
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step));
      for (let i = 1; i < n; i++) { const t = i / n; if (api.blocked(ax + (bx - ax) * t, az + (bz - az) * t, 0.05)) return true; }
      return false;
    },
    count: () => byId.size,
  };
  return api;
}
