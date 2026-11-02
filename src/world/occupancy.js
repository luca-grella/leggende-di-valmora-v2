// Coarse occupancy grid per island (2 m cells): roads, towns, tall grass, bridges, docks, beaches,
// camps and cave mouths are stamped so scattered scenery never lands on a path or a doorstep.
import { segDist } from './layout.js';

export const OCC = { FREE: 0, ROAD: 1, TOWN: 2, GRASS: 3, BUSY: 4, BEACH: 5, EDGE: 6 };
const RES = 2;

export function buildOccupancy(L, islandId) {
  const I = L.shape.islands.find(i => i.id === islandId);
  const [bx0, bz0, bx1, bz1] = I.box;
  const nx = Math.ceil((bx1 - bx0) / RES) + 1, nz = Math.ceil((bz1 - bz0) / RES) + 1;
  const A = new Uint8Array(nx * nz);
  const idx = (x, z) => { const i = Math.floor((x - bx0) / RES), j = Math.floor((z - bz0) / RES); return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i; };
  const stamp = (x, z, r, v, onlyIfFree = false) => {
    for (let j = Math.floor((z - r - bz0) / RES); j <= Math.floor((z + r - bz0) / RES); j++) for (let i = Math.floor((x - r - bx0) / RES); i <= Math.floor((x + r - bx0) / RES); i++) {
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const cx = bx0 + (i + 0.5) * RES, cz = bz0 + (j + 0.5) * RES;
      if ((cx - x) ** 2 + (cz - z) ** 2 > (r + RES * 0.5) ** 2) continue;
      const k = j * nx + i; if (!onlyIfFree || A[k] === 0) A[k] = v;
    }
  };
  const stampLine = (pts, r, v) => { for (let k = 0; k < pts.length - 1; k++) { const [ax, az] = pts[k], [bx, bz] = pts[k + 1]; const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5)); for (let t = 0; t <= n; t++) stamp(ax + (bx - ax) * t / n, az + (bz - az) * t / n, r, v); } };
  const mine = o => o.island === islandId;
  for (const T of Object.values(L.towns)) if (mine(T)) stamp(T.x, T.z, T.r + 3, OCC.TOWN);
  for (const b of L.beaches) if (mine(b)) stamp(b.x, b.z, (b.r || 26) * 0.75, OCC.BEACH, true);
  for (const R of Object.values(L.routes)) if (mine(R)) {
    stampLine(R.poly.pts, R.width / 2 + 2.2, OCC.ROAD);
    for (const p of R.patches) {
      const ca = Math.cos(p.rot), sa = Math.sin(p.rot);
      for (let u = -p.rx; u <= p.rx; u += 1.5) for (let v = -p.rz; v <= p.rz; v += 1.5) {
        if ((u / p.rx) ** 2 + (v / p.rz) ** 2 > 1.15) continue;
        stamp(p.x + u * sa + v * ca, p.z + u * ca - v * sa, 1.6, OCC.GRASS);
      }
    }
    for (const s of R.spots) stamp(s.x, s.z, s.r + 0.6, OCC.BUSY);
    for (const pr of R.props) stamp(pr.x, pr.z, pr.type === 'tent' ? 3 : 1.4, OCC.BUSY);
    for (const t of R.trees) stamp(t.x, t.z, 2.5, OCC.BUSY);
  }
  for (const p of L.paths) if (p.island === islandId) stampLine(p.pts, p.width / 2 + 1.8, OCC.ROAD);
  for (const b of L.bridges) if (mine(b)) stampLine(b.pts, b.hw + 2.5, OCC.ROAD);
  for (const d of Object.values(L.docks)) { const T = L.towns[d.town]; if (T && mine(T)) stampLine([[d.x, d.z], [d.endX, d.endZ]], 4, OCC.ROAD); }
  for (const p of L.plateaus) if (p.island === islandId && p.cliff) stamp(p.x, p.z, p.r - 1, OCC.BUSY);
  for (const C of Object.values(L.caves)) if (C.island === islandId) stamp(C.def.entrance[0], C.def.entrance[1], 5, OCC.BUSY);
  for (const g of L.gates) stamp(g.x, g.z, 4, OCC.BUSY);
  for (const c of L.chests) stamp(c.x, c.z, 1.5, OCC.BUSY);
  return {
    at(x, z) { const k = idx(x, z); return k < 0 ? OCC.EDGE : A[k]; },
    free(x, z) { const k = idx(x, z); return k >= 0 && A[k] === 0; },
    stamp, stampLine,
    /** Distance-ish test: no road within r. */
    clearOf(x, z, r, v = OCC.ROAD) { for (let dz = -r; dz <= r; dz += RES) for (let dx = -r; dx <= r; dx += RES) { const k = idx(x + dx, z + dz); if (k >= 0 && A[k] === v) return false; } return true; },
  };
}

export { segDist };
