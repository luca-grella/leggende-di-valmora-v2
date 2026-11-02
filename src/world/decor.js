// Set dressing so that "every 10 m there is something": town hedges/fences with gaps at the streets,
// flower beds by the doors, themed route scenery (fences, windmills, standing stones, snowmen, shrine
// lanterns, beach umbrellas, glowing lava rocks) and beach furniture. Reserves its spots in the
// occupancy grid so vegetation never lands on top.
import { addProp } from './props.js';
import { OCC } from './occupancy.js';
import { rng } from '../core/math.js';

const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

export function decorateTown(b, T, desc) {
  const R = rng('decor:' + T.id), C = desc.colors, h = desc.hf.heightAt, occ = desc.occ;
  // perimeter: hedges or fences, open where streets/paths leave the town
  const ring = T.r - 2.5;
  const exits = T.def.exits.map(([x, z]) => Math.atan2(x, z));
  for (const k of ['dock', 'beach']) { const d = T.def[k]; if (d) exits.push(Math.atan2(d.x - T.x, d.z - T.z)); }
  const kind = { villa: 'hedge', city: 'hedge', jungle: 'hedge', stone: 'fence', chalet: 'fence', stilts: 'fence', hut: 'fence', adobe: 'fence', village: 'fence' }[T.style] || 'fence';
  const fcol = { village: '#ffffff', stone: '#a8a2b4', chalet: '#b07c4a', stilts: '#e8f6ff', hut: '#b98552', adobe: '#d49c64' }[T.style] || '#ffffff';
  const segLen = 3.2, n = Math.floor(TAU * ring / segLen);
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) / n * TAU;
    if (exits.some(e => Math.abs(angDiff(a, e)) < 7 / ring)) continue;
    const x = T.x + Math.sin(a) * ring, z = T.z + Math.cos(a) * ring;
    if (!T.isFree(x, z, 1.4, true)) continue;
    if (h(x, z) < 0.5) continue;
    addProp(b, { type: kind, x, z, rot: a + Math.PI / 2, len: segLen + 0.05, color: fcol }, h, C);
  }
  // flower beds beside doors, a bench or barrels here and there
  for (const bd of T.buildings) {
    if (bd.kind === 'depot') continue;
    const fx = Math.sin(bd.facing), fz = Math.cos(bd.facing), sx = fz, sz = -fx;
    for (const side of [-1, 1]) {
      const off = bd.w / 2 - 1.05;
      if (off < 1.4) continue;
      const x = bd.x + fx * (bd.d / 2 + 0.55) + sx * side * off, z = bd.z + fz * (bd.d / 2 + 0.55) + sz * side * off;
      addProp(b, { type: 'flowerbed', x, z, rot: bd.facing, len: Math.min(2.2, bd.w / 2 - 1.3) }, h, C);
    }
  }
  // snowmen / tiki torches / extra planters by style
  const extras = T.style === 'chalet' ? 'snowman' : T.style === 'hut' ? 'lantern' : T.style === 'stone' ? 'stone' : 'planter';
  for (let i = 0; i < 6; i++) {
    const a = R() * TAU, rr = T.plazaR + 3 + R() * (T.r - T.plazaR - 8);
    const x = T.x + Math.sin(a) * rr, z = T.z + Math.cos(a) * rr;
    if (!T.isFree(x, z, 1.4, true)) continue;
    addProp(b, { type: extras, x, z, rot: R() * TAU }, h, C);
    T.spots.push({ x, z, r: 1.2 });
  }
  void occ;
}

export function decorateRoute(b, Rt, desc) {
  const R = rng('decor:' + Rt.id), C = desc.colors, h = desc.hf.heightAt, occ = desc.occ;
  const pts = Rt.poly.pts, cum = Rt.poly.cum, L = Rt.poly.length;
  const at = (s, off) => {
    let i = 0; while (i < cum.length - 2 && cum[i + 1] < s) i++;
    const t = (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1), dx = (pts[i + 1][0] - pts[i][0]) / ((cum[i + 1] - cum[i]) || 1), dz = (pts[i + 1][1] - pts[i][1]) / ((cum[i + 1] - cum[i]) || 1);
    const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, z = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
    return { x: x - dz * off, z: z + dx * off, rot: Math.atan2(dx, dz) };
  };
  const free = (x, z, r = 1.2) => { for (let dx = -r; dx <= r; dx += r) for (let dz = -r; dz <= r; dz += r) if (occ.at(x + dx, z + dz) !== OCC.FREE) return false; return h(x, z) > 0.55; };
  const put = (p, r = 1.5) => { addProp(b, p, h, C); occ.stamp(p.x, p.z, r, OCC.BUSY); };
  // fences along the path (alternating stretches, both sides), skipping bridges and town ends
  if (Rt.theme !== 'lagoon' && Rt.theme !== 'peak') {
    for (let s = 24; s < L - 24; s += 3) {
      if (Rt.inBridge(s)) continue;
      const band = Math.floor(s / 27) % 3;
      if (band === 2) continue;
      const side = band === 0 ? 1 : -1;
      const p = at(s, side * (Rt.width / 2 + 1.05));
      if (occ.at(p.x, p.z) === OCC.GRASS || h(p.x, p.z) < 0.55) continue;
      let blocked = false; for (const sp of Rt.spots) if (Math.hypot(sp.x - p.x, sp.z - p.z) < sp.r + 1.5) blocked = true;
      if (blocked) continue;
      addProp(b, { type: 'fence', x: p.x, z: p.z, rot: p.rot + Math.PI / 2, len: 3.05, color: Rt.theme === 'snow' ? '#9a6a43' : '#c99460' }, h, C);
    }
  }
  const scatter = (type, count, minOff, maxOff, r = 2, extra = {}) => {
    let placed = 0;
    for (let k = 0; k < count * 8 && placed < count; k++) {
      const s = 10 + R() * (L - 20), side = R() < 0.5 ? 1 : -1, off = side * (minOff + R() * (maxOff - minOff));
      const p = at(s, off);
      if (!free(p.x, p.z, r)) continue;
      put({ type, x: p.x, z: p.z, rot: R() * TAU, ...extra }, r);
      placed++;
    }
  };
  switch (Rt.theme) {
    case 'flowers': scatter('planter', 4, 4, 9); scatter('picnic', 1, 8, 14, 2.5); break;
    case 'windmills': scatter('windmill', 3, 14, 26, 3.5); scatter('fence', 2, 6, 10); break;
    case 'jungle': scatter('stone', 3, 7, 16); break;
    case 'moor': {
      scatter('stone', 6, 6, 20);
      // a stone circle
      for (let k = 0; k < 20; k++) {
        const p = at(L * (0.3 + R() * 0.4), (R() < 0.5 ? 1 : -1) * (16 + R() * 8));
        if (!free(p.x, p.z, 7)) continue;
        for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; addProp(b, { type: 'stone', x: p.x + Math.sin(a) * 5.5, z: p.z + Math.cos(a) * 5.5, rot: a }, h, C); }
        occ.stamp(p.x, p.z, 7, OCC.BUSY);
        break;
      }
      break;
    }
    case 'snow': scatter('snowman', 3, 5, 12); scatter('lantern', 4, 3, 4, 1); break;
    case 'peak':
      for (let s = 12; s < L - 8; s += 16) for (const side of [-1, 1]) { const p = at(s, side * (Rt.width / 2 + 1.2)); if (h(p.x, p.z) > 0.6) addProp(b, { type: 'lantern', x: p.x, z: p.z, rot: p.rot }, h, C); }
      break;
    case 'lagoon': scatter('umbrella', 5, 5, 12, 1.8, { color: '#ff5f9e' }); scatter('lounger', 4, 5, 12); break;
    case 'volcano': scatter('lava', 10, 5, 18, 1.5); break;
    case 'canyon': scatter('stone', 5, 6, 14); scatter('barrel', 2, 4, 6); break;
    default: break;
  }
}

export function decorateBeach(b, bch, desc) {
  const R = rng('beach:' + bch.town), C = desc.colors, h = desc.hf.heightAt, occ = desc.occ;
  const cols = ['#ff5f9e', '#3fa6d9', '#ffd23f', '#2fa8a0'];
  let placed = 0;
  for (let k = 0; k < 120 && placed < 7; k++) {
    const a = R() * TAU, r = 4 + R() * ((bch.r || 26) * 0.55);
    const x = bch.x + Math.sin(a) * r, z = bch.z + Math.cos(a) * r, y = h(x, z);
    if (y < 0.25 || y > 1.3) continue;
    if (occ.at(x, z) === OCC.ROAD || occ.at(x, z) === OCC.BUSY) continue;
    addProp(b, { type: 'umbrella', x, z, rot: R() * TAU, color: cols[placed % cols.length] }, h, C);
    if (R() < 0.6) addProp(b, { type: 'lounger', x: x + 1.2, z: z + 0.4, rot: R() * TAU }, h, C);
    occ.stamp(x, z, 2.2, OCC.BUSY);
    placed++;
  }
  for (let k = 0; k < 60; k++) {
    const a = R() * TAU, r = (bch.r || 26) * (0.5 + R() * 0.4);
    const x = bch.x + Math.sin(a) * r, z = bch.z + Math.cos(a) * r, y = h(x, z);
    if (y > 0.05 && y < 0.35 && occ.at(x, z) !== OCC.ROAD) { addProp(b, { type: 'boat', x, z, rot: R() * TAU, color: R.pick(cols) }, h, C); occ.stamp(x, z, 3, OCC.BUSY); break; }
  }
}
