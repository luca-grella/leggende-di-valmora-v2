// Layout generator: turns map.js data into concrete plans — town buildings/streets/props, route
// polylines with height profiles, bridges, tall-grass patches, caves, interiors — and fills POIS.
// Pure data (no three.js), deterministic (seeded rng). Geometry builders read these plans.
import { rng, clamp, smoothstep, lerp } from '../core/math.js';
import { createShape, makePoly, polyQuery, polyAt } from './shape.js';

/** Building footprints [width (local x), depth (local z)]. */
export const FOOT = { house: [7, 6], home: [7.6, 6.6], center: [11, 8.5], shop: [8.6, 7], lab: [13, 9], osteria: [9.4, 7.2], depot: [12, 10] };
/** Landmark collision radius. */
export const LANDMARK_R = { well: 1.7, gazebo: 3.4, fountain: 4.2, bigtree: 3.6, castle: 5, crystal: 2.6, lighthouse: 2.6, totem: 1.8, arch: 3.4 };

export const INTERIOR_ORIGIN = { x: 5000, z: 5000, step: 64, cols: 10 };
export const CAVE_ORIGIN = { x: -6000, z: 6000, step: 520 };

const TAU = Math.PI * 2;
const dirOf = f => [Math.sin(f), Math.cos(f)];
const faceTo = (dx, dz) => Math.atan2(dx, dz);

export function buildLayout(D) {
  const shape = createShape(D.ISLANDS);
  const POIS = D.POIS;
  const wrapA = a => { a = (a || 0) % TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
  const put = (id, x, z, facing = 0, extra) => { POIS[id] = { x: +x.toFixed(2), y: 0, z: +z.toFixed(2), facing: +wrapA(facing).toFixed(3), ...(extra || {}) }; return POIS[id]; };
  const areaById = Object.fromEntries(D.AREAS.map(a => [a.id, a]));

  const towns = {}, routes = {}, paths = [], bridges = [], plateaus = [], gates = [], docks = {}, caves = {}, beaches = [], interiors = {};
  const chests = [], rivers = [];

  // ---------------------------------------------------------------------------------------------
  // Towns
  // ---------------------------------------------------------------------------------------------
  for (const [id, def] of Object.entries(D.TOWN_DEFS)) {
    const R = rng('town:' + id);
    const area = areaById[id];
    const cx = def.x, cz = def.z;
    const T = { id, def, area, island: area.island, x: cx, z: cz, r: def.r, base: def.base, style: def.style, landmark: def.landmark,
      plazaR: def.plazaR, buildings: [], streets: [], props: [], trees: [], spots: [], doorPaths: [] };
    towns[id] = T;
    let houseN = 0;
    for (const [kind, lx, lz, f] of def.slots) {
      let [w, d] = FOOT[kind];
      if (def.style === 'city' && kind === 'house') d = 7.2;
      const ang = f * Math.PI / 2;
      let interior;
      if (kind === 'house') interior = `house.${id}.${++houseN}`;
      else if (kind === 'home') interior = 'home.player';
      else if (kind === 'lab') interior = 'lab.alba';
      else if (kind === 'depot') interior = 'depot.fulgida';
      else interior = `${kind}.${id}`;
      const [fx, fz] = dirOf(ang);
      const b = { kind, interior, x: cx + lx, z: cz + lz, w, d, facing: ang, rot: f, seed: R() * 1e6 | 0,
        storeys: def.style === 'city' && kind === 'house' ? 2 : 1, colorIdx: (houseN + T.buildings.length) % 4 };
      b.door = { x: b.x + fx * (d / 2), z: b.z + fz * (d / 2) };
      b.outside = { x: b.x + fx * (d / 2 + 1.4), z: b.z + fz * (d / 2 + 1.4), facing: ang };
      T.buildings.push(b);
    }
    // streets: plaza → exits; dock and beach links
    for (const [ex, ez] of def.exits) {
      const L = Math.hypot(ex, ez), ux = ex / L, uz = ez / L;
      T.streets.push({ ax: cx + ux * (def.plazaR - 1), az: cz + uz * (def.plazaR - 1), bx: cx + ex, bz: cz + ez, w: def.style === 'city' ? 5 : 4 });
    }
    // door paths: door → nearest point on plaza ring / streets
    for (const b of T.buildings) {
      const o = b.outside;
      let best = null, bd = Infinity;
      const tryP = (px, pz) => { const dd = Math.hypot(px - o.x, pz - o.z); if (dd < bd) { bd = dd; best = [px, pz]; } };
      const dc = Math.hypot(o.x - cx, o.z - cz);
      tryP(cx + (o.x - cx) / dc * (def.plazaR - 1), cz + (o.z - cz) / dc * (def.plazaR - 1));
      for (const s of T.streets) { const q = segClosest(s.ax, s.az, s.bx, s.bz, o.x, o.z); tryP(q[0], q[1]); }
      T.doorPaths.push({ ax: b.door.x, az: b.door.z, bx: o.x, bz: o.z, w: 2.2 });
      if (bd > 0.5) T.doorPaths.push({ ax: o.x, az: o.z, bx: best[0], bz: best[1], w: 2.4 });
    }
    T.lmR = LANDMARK_R[def.landmark] || 2;
    const isFree = (x, z, r = 1.2, streetsToo = true) => {
      if (Math.hypot(x - cx, z - cz) < T.lmR + r + 0.5) return false;
      for (const b of T.buildings) if (inRect(x, z, b, r + 0.8)) return false;
      if (streetsToo) {
        for (const s of T.streets.concat(T.doorPaths)) if (segDist(s.ax, s.az, s.bx, s.bz, x, z) < s.w / 2 + r) return false;
        if (Math.abs(Math.hypot(x - cx, z - cz) - T.plazaR) < r) return false;
      }
      for (const p of T.spots) if (Math.hypot(p.x - x, p.z - z) < r + (p.r || 1)) return false;
      return true;
    };
    T.isFree = isFree;
    const claim = (x, z, r = 1) => { T.spots.push({ x, z, r }); };

    // --- outdoor POIs
    const p = id + '.';
    const ex0 = def.exits[0], exL = Math.hypot(ex0[0], ex0[1]);
    put(p + 'arrive', cx + ex0[0] * (1 - 7 / exL), cz + ex0[1] * (1 - 7 / exL), faceTo(-ex0[0], -ex0[1]));
    put(p + 'landmark', cx - 1.6, cz + T.lmR + 2.2, Math.PI);
    put(p + 'champion', cx + 2.2, cz + T.lmR + 1.3, 0);
    put(p + 'plaza', cx + T.plazaR * 0.55, cz + T.plazaR * 0.45, -Math.PI * 0.75);
    claim(cx - 1.6, cz + T.lmR + 2.2, 0.8); claim(cx + 2.2, cz + T.lmR + 1.3, 0.8);
    for (const b of T.buildings) {
      const o = b.outside;
      if (b.kind === 'center') put(p + 'center_door', o.x, o.z, o.facing);
      else if (b.kind === 'shop') put(p + 'shop_door', o.x, o.z, o.facing);
      else if (b.kind === 'house') put(`${p}house${b.interior.split('.')[2]}_door`, o.x, o.z, o.facing);
      else if (b.kind === 'home') put(p + 'home_door', o.x, o.z, o.facing);
      else if (b.kind === 'lab') put(p + 'lab_door', o.x, o.z, o.facing);
      else if (b.kind === 'osteria') put(p + 'osteria_door', o.x, o.z, o.facing);
      else if (b.kind === 'depot') put(p + 'depot_door', o.x, o.z, o.facing);
      claim(o.x, o.z, 1.0);
    }
    // plaza ring: benches, lamps, (stalls)
    const ringR = T.plazaR + 1.6;
    const ringAngles = [];
    for (let i = 0; i < 8; i++) ringAngles.push(i / 8 * TAU + Math.PI / 8);
    const blockedAng = a => {
      const x = cx + Math.sin(a) * ringR, z = cz + Math.cos(a) * ringR;
      for (const s of T.streets.concat(T.doorPaths)) if (segDist(s.ax, s.az, s.bx, s.bz, x, z) < s.w / 2 + 1.4) return true;
      for (const b of T.buildings) if (inRect(x, z, b, 1.2)) return true;
      return false;
    };
    const freeAngles = ringAngles.filter(a => !blockedAng(a));
    let benchN = 0;
    for (const a of freeAngles) {
      const x = cx + Math.sin(a) * ringR, z = cz + Math.cos(a) * ringR;
      if (benchN < 3) {
        T.props.push({ type: 'bench', x, z, rot: a + Math.PI });
        if (benchN === 0) put(p + 'bench', x - Math.sin(a) * 0.9, z - Math.cos(a) * 0.9, a + Math.PI);
        claim(x, z, 1.6); benchN++;
      } else {
        T.props.push({ type: 'planter', x, z, rot: a }); claim(x, z, 1.2);
      }
    }
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU;
      const x = cx + Math.sin(a) * (T.plazaR + 0.4), z = cz + Math.cos(a) * (T.plazaR + 0.4);
      if (!blockedAng(a)) { T.props.push({ type: 'lamp', x, z, rot: 0 }); claim(x, z, 0.6); }
    }
    if (!POIS[p + 'bench']) put(p + 'bench', cx - T.plazaR + 1, cz + 1, Math.PI / 2);
    // street lamps every ~13 m, alternating sides
    for (const s of T.streets) {
      const L = Math.hypot(s.bx - s.ax, s.bz - s.az), ux = (s.bx - s.ax) / L, uz = (s.bz - s.az) / L;
      let side = 1;
      for (let t = 6; t < L - 2; t += 13) {
        const x = s.ax + ux * t - uz * side * (s.w / 2 + 0.8), z = s.az + uz * t + ux * side * (s.w / 2 + 0.8);
        if (isFree(x, z, 0.5, false)) { T.props.push({ type: 'lamp', x, z, rot: 0 }); claim(x, z, 0.6); }
        side = -side;
      }
    }
    // market stalls
    if (def.market) {
      let n = 0;
      for (const a of [Math.PI * 0.62, Math.PI * 1.38, Math.PI * 0.85, Math.PI * 1.15, 0.35, -0.35]) {
        if (n >= 4) break;
        const rr = T.plazaR - 2.6, x = cx + Math.sin(a) * rr, z = cz + Math.cos(a) * rr;
        if (Math.hypot(x - cx, z - cz) < T.lmR + 3) continue;
        let ok = true; for (const sp of T.spots) if (Math.hypot(sp.x - x, sp.z - z) < 3.2) ok = false;
        if (!ok) continue;
        T.props.push({ type: 'stall', x, z, rot: a + Math.PI, color: ['#e8674a', '#2fa8a0', '#f5b83d', '#9b7fd1'][n % 4] });
        n++;
        if (n <= 2) put(`${p}stall${n}`, x + Math.sin(a + Math.PI) * -1.6, z + Math.cos(a + Math.PI) * -1.6, a + Math.PI);
        claim(x, z, 2.2);
      }
    }
    // npc / girl / grab spots: candidates on the plaza and along streets
    const cands = [];
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + 0.2; cands.push([cx + Math.sin(a) * (T.plazaR - 3.5), cz + Math.cos(a) * (T.plazaR - 3.5), a + Math.PI]); }
    for (const s of T.streets) {
      const L = Math.hypot(s.bx - s.ax, s.bz - s.az), ux = (s.bx - s.ax) / L, uz = (s.bz - s.az) / L;
      for (const t of [L * 0.35, L * 0.7]) for (const side of [1, -1]) cands.push([s.ax + ux * t - uz * side * (s.w / 2 + 1.2), s.az + uz * t + ux * side * (s.w / 2 + 1.2), faceTo(uz * side, -ux * side)]);
    }
    for (const b of T.buildings) { const [fx, fz] = dirOf(b.facing); const sx = fz, sz = -fx; cands.push([b.outside.x + sx * 2.4 + fx * 0.8, b.outside.z + sz * 2.4 + fz * 0.8, b.facing]); }
    const takeSpot = (minD = 2.6, wantFree = true) => {
      for (let k = 0; k < cands.length; k++) {
        const [x, z, f] = cands[k];
        if (!cands[k].used && (!wantFree || isFree(x, z, 0.5, false))) {
          let ok = true; for (const sp of T.spots) if (Math.hypot(sp.x - x, sp.z - z) < minD) ok = false;
          if (ok) { cands[k].used = true; claim(x, z, 0.8); return [x, z, f]; }
        }
      }
      const a = R() * TAU; return [cx + Math.sin(a) * (T.plazaR + 3), cz + Math.cos(a) * (T.plazaR + 3), a];
    };
    R.shuffle(cands);
    for (let i = 1; i <= 6; i++) { const [x, z, f] = takeSpot(); put(`${p}npc${i}`, x, z, f); }
    for (let i = 1; i <= 4; i++) { const [x, z, f] = takeSpot(3); put(`${p}girl${i}`, x, z, f); }
    for (let i = 1; i <= 3; i++) { const [x, z, f] = takeSpot(2.4); put(`${p}grab${i}`, x, z, f); }
    // edge spots: viewpoint (towards the coast), date, picnic
    const edge = [];
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * TAU, rr = def.r - 6;
      const x = cx + Math.sin(a) * rr, z = cz + Math.cos(a) * rr;
      let exitD = Infinity; for (const [ex, ez] of def.exits) exitD = Math.min(exitD, Math.hypot(cx + ex - x, cz + ez - z));
      const coast = shape.islandAt(cx + Math.sin(a) * (def.r + 12), cz + Math.cos(a) * (def.r + 12)).s;
      edge.push({ a, x, z, score: (exitD > 14 ? 0 : -100) - coast * 0.6 + (isFree(x, z, 2) ? 0 : -60) });
    }
    edge.sort((u, v) => v.score - u.score);
    const vp = edge[0];
    T.viewpoint = vp;
    put(p + 'viewpoint', vp.x, vp.z, vp.a);
    T.props.push({ type: 'railing', x: vp.x + Math.sin(vp.a) * 1.6, z: vp.z + Math.cos(vp.a) * 1.6, rot: vp.a, len: 5 });
    T.props.push({ type: 'bench', x: vp.x - Math.cos(vp.a) * 2.6, z: vp.z + Math.sin(vp.a) * 2.6, rot: vp.a });
    claim(vp.x, vp.z, 2.5);
    if (def.beach) put(p + 'date', def.beach.x + 3, def.beach.z - 2, def.beach.facing);
    else put(p + 'date', vp.x - Math.cos(vp.a) * 1.4, vp.z + Math.sin(vp.a) * 1.4, vp.a);
    const pic = edge.find(e => Math.abs(angDiff(e.a, vp.a)) > 1.2 && isFree(e.x, e.z, 2.5)) || edge[3];
    put(p + 'picnic', pic.x, pic.z, pic.a + Math.PI);
    T.props.push({ type: 'tree', x: pic.x + Math.sin(pic.a) * 2.6, z: pic.z + Math.cos(pic.a) * 2.6, kind: 'big' });
    claim(pic.x, pic.z, 3);
    // drops (delivery points) near exits
    def.exits.forEach(([ex, ez], i) => {
      if (i >= 3) return;
      const L = Math.hypot(ex, ez), x = cx + ex * (1 - 12 / L) - ez / L * 4, z = cz + ez * (1 - 12 / L) + ex / L * 4;
      if (def.market) put(`${p}drop${i + 1}`, x, z, faceTo(-ex, -ez));
    });
    if (def.market && !POIS[p + 'drop3']) put(p + 'drop3', cx - def.r * 0.6, cz + def.r * 0.4, 0);
    if (def.market && !POIS[p + 'drop2']) put(p + 'drop2', cx + def.r * 0.6, cz + def.r * 0.4, 0);
    // scooter
    if (def.scooter) {
      const [x, z, f] = takeSpot(3);
      put(p + 'scooter', x, z, f);
      const s0 = T.streets[0];
      put(p + 'ride', lerp(s0.ax, s0.bx, 0.5), lerp(s0.az, s0.bz, 0.5), faceTo(s0.bx - s0.ax, s0.bz - s0.az));
    }
    // guards
    if (def.guards) {
      T.streets.forEach((s, i) => { if (i < 3) put(`guard.${id}.${i + 1}`, lerp(s.ax, s.bx, 0.55) + 2.6, lerp(s.az, s.bz, 0.55), 0); });
      for (let i = T.streets.length + 1; i <= 3; i++) put(`guard.${id}.${i}`, cx - T.plazaR - 2, cz - 3 + i * 2, Math.PI / 2);
    }
    // dock (pier) and beach
    if (def.dock) {
      const d = def.dock, [fx, fz] = dirOf(d.facing);
      const len = 18;
      docks[id] = { town: id, x: d.x, z: d.z, facing: d.facing, len, w: 3.4, y: 1.15, endX: d.x + fx * len, endZ: d.z + fz * len };
      put(p + 'dock', d.x + fx * (len - 2.2), d.z + fz * (len - 2.2), d.facing);
      // link street from the nearest exit to the pier root
      const [ex, ez] = nearestExit(def, d.x - cx, d.z - cz);
      paths.push({ id: `${id}.dockpath`, pts: [[cx + ex, cz + ez], [d.x - fx * 1, d.z - fz * 1]], width: 3.2, flatten: true, island: T.island });
    }
    if (def.beach) {
      const b = def.beach, [fx, fz] = dirOf(b.facing);
      put(p + 'swim', b.x + fx * 14, b.z + fz * 14, b.facing);
      put(id === 'corallo' ? 'corallo.beach' : p + 'beachspot', b.x - 4, b.z + 1, b.facing);
      beaches.push({ town: id, x: b.x, z: b.z, facing: b.facing, island: T.island });
      if (id !== 'alba') {
        const [ex, ez] = nearestExit(def, b.x - cx, b.z - cz);
        paths.push({ id: `${id}.beachpath`, pts: [[cx + ex, cz + ez], [b.x - fx * 6, b.z - fz * 6]], width: 3, flatten: false, island: T.island });
      }
    }
    // decorative trees inside the town (free spots)
    for (let i = 0; i < 70; i++) {
      const a = R() * TAU, rr = def.plazaR + 6 + R() * (def.r - def.plazaR - 6);
      const x = cx + Math.sin(a) * rr, z = cz + Math.cos(a) * rr;
      if (isFree(x, z, 2.2)) { T.trees.push({ x, z, s: 0.8 + R() * 0.5 }); claim(x, z, 2.2); }
    }
    // little extras per building (barrels, crates, mailboxes, flower beds) — positions only
    for (const b of T.buildings) {
      const [fx, fz] = dirOf(b.facing), sx = fz, sz = -fx;
      const side = R() < 0.5 ? 1 : -1;
      const mx = b.outside.x + sx * side * 2.2, mz = b.outside.z + sz * side * 2.2;
      if (isFree(mx, mz, 0.4, false)) { T.props.push({ type: b.kind === 'house' || b.kind === 'home' ? 'mailbox' : 'planter', x: mx, z: mz, rot: b.facing }); claim(mx, mz, 0.5); }
      const bx = b.x - sx * side * (b.w / 2 + 0.9) + fx * (b.d / 2 - 1), bz = b.z - sz * side * (b.w / 2 + 0.9) + fz * (b.d / 2 - 1);
      if (isFree(bx, bz, 0.5, false)) { T.props.push({ type: R() < 0.5 ? 'barrel' : 'crates', x: bx, z: bz, rot: R() * TAU }); claim(bx, bz, 0.8); }
    }
  }
  // story specials in towns
  {
    const A = towns.alba, lab = A.buildings.find(b => b.kind === 'lab'), [fx, fz] = dirOf(lab.facing);
    // (1.4 m out from the door line: the lab's planter, 2.2 m to the side of the door, stays clear of her)
    put('alba.quercia', lab.outside.x + fz * 2.6 + fx * 1.4, lab.outside.z - fx * 2.6 + fz * 1.4, lab.facing);
    POIS['alba.well'] = { ...POIS['alba.landmark'] };
    const h1 = A.buildings.find(b => b.interior === 'house.alba.1');
    put('alba.rosa', h1.outside.x + 1.8, h1.outside.z + 1.2, h1.facing);
    const sh = A.buildings.find(b => b.kind === 'osteria') || A.buildings.find(b => b.kind === 'shop');
    put('alba.fornaio', sh.outside.x - 2, sh.outside.z + 0.8, sh.facing);
    const F = towns.fulgida, dep = F.buildings.find(b => b.kind === 'depot'), [dx, dz] = dirOf(dep.facing);
    put('fulgida.depot', dep.outside.x + dx * 4, dep.outside.z + dz * 4, dep.facing + Math.PI);
    put('fulgida.depot_grunt1', dep.outside.x - dz * 2.4 + dx * 0.6, dep.outside.z + dx * 2.4 + dz * 0.6, dep.facing);
    put('fulgida.depot_grunt2', dep.outside.x + dz * 2.4 + dx * 0.6, dep.outside.z - dx * 2.4 + dz * 0.6, dep.facing);
    put('fulgida.depot_boss', dep.outside.x + dx * 0.2, dep.outside.z + dz * 0.2, dep.facing);
    F.props.push({ type: 'banner', x: dep.door.x - dz * 3.2 + dx * 0.4, z: dep.door.z + dx * 3.2 + dz * 0.4, rot: dep.facing, color: '#5b3a8a' });
    F.props.push({ type: 'banner', x: dep.door.x + dz * 3.2 + dx * 0.4, z: dep.door.z - dx * 3.2 + dz * 0.4, rot: dep.facing, color: '#5b3a8a' });
    put('fulgida.alley', F.x - 45, F.z - 25, Math.PI / 2);
    F.props.push({ type: 'crates', x: F.x - 47, z: F.z - 27, rot: 0.4 }, { type: 'barrel', x: F.x - 46.5, z: F.z - 22.5, rot: 0 }, { type: 'lamp', x: F.x - 43.5, z: F.z - 28, rot: 0 });
    const C = towns.corallo, cd = docks.corallo;
    put('corallo.docks', cd.x - 3.2, cd.z + 1.5, Math.PI / 2);
    const Cr = towns.cristallo; put('cristallo.neve', Cr.x - 2.6, Cr.z + Cr.lmR + 1.0, 0);
    const Pe = towns.petalo, ph = Pe.buildings.find(b => b.interior === 'house.petalo.1');
    put('petalo.ginepro', ph.outside.x - 1.8, ph.outside.z + 1, ph.facing);
    const Mu = towns.muschio, mh = Mu.buildings.find(b => b.interior === 'house.muschio.1');
    put('muschio.ada', mh.outside.x + 1.8, mh.outside.z + 1, mh.facing);
    if (!POIS['alba.beachspot']) put('alba.beachspot', 6, 128, 0);
    void C;
  }

  // ---------------------------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------------------------
  const townAt = (x, z, pad = 0) => { for (const T of Object.values(towns)) if (Math.hypot(x - T.x, z - T.z) < T.r + pad) return T; return null; };
  for (const [id, def] of Object.entries(D.ROUTE_DEFS)) {
    const R = rng('route:' + id);
    const area = areaById[id];
    const poly = makePoly(def.pts, 2);
    const n = poly.pts.length;
    const raw = poly.pts.map(([x, z]) => shape.baseHeight(x, z));
    // bridges over water (r3/r5) or sandbars/land bridges elsewhere
    const wet = raw.map(h => h < 0.55);
    const spans = [];
    if (def.bridge) {
      let i = 0;
      while (i < n) {
        if (!wet[i]) { i++; continue; }
        let j = i; while (j < n - 1 && wet[j + 1]) j++;
        spans.push([Math.max(0, i - 3), Math.min(n - 1, j + 3)]);
        i = j + 1;
      }
    }
    const inSpan = i => spans.some(([a, b]) => i >= a && i <= b);
    let prof = raw.map((h, i) => (inSpan(i) ? h : Math.max(h, def.sandbar ? 0.42 : 0.7)));
    const endA = townAt(poly.pts[0][0], poly.pts[0][1], 8), endB = townAt(poly.pts[n - 1][0], poly.pts[n - 1][1], 8);
    // smooth
    for (let pass = 0; pass < 4; pass++) {
      const out = prof.slice();
      for (let i = 0; i < n; i++) {
        if (inSpan(i)) continue;
        let s = 0, w = 0;
        for (let k = -5; k <= 5; k++) { const j = clamp(i + k, 0, n - 1); if (inSpan(j)) continue; const wk = 6 - Math.abs(k); s += prof[j] * wk; w += wk; }
        out[i] = w ? s / w : prof[i];
      }
      prof = out;
      if (endA) prof[0] = endA.base; if (endB) prof[n - 1] = endB.base;
    }
    // blend ends into town bases
    for (let i = 0; i < n; i++) {
      const s = poly.cum[i];
      if (endA) prof[i] = lerp(endA.base, prof[i], smoothstep(0, 18, s));
      if (endB) prof[i] = lerp(endB.base, prof[i], smoothstep(0, 18, poly.length - s));
    }
    const Rt = { id, def, area, island: area.island, poly, prof, width: def.width, theme: def.theme, spans: [], patches: [], props: [], trees: [], spots: [] };
    routes[id] = Rt;
    for (const [a, b] of spans) {
      const s0 = poly.cum[a], s1 = poly.cum[b];
      const y0 = prof[a] + 0.15, y1 = prof[b] + 0.15;
      const br = { id: `${id}.bridge${Rt.spans.length + 1}`, route: id, s0, s1, a, b, y0, y1, hw: def.rope ? 1.5 : 1.8, arch: def.rope ? -0.9 : 1.2, kind: def.rope ? 'rope' : 'wood', island: area.island, pts: poly.pts.slice(a, b + 1) };
      Rt.spans.push(br); bridges.push(br);
    }
    Rt.inBridge = s => Rt.spans.some(b => s > b.s0 - 3 && s < b.s1 + 3);
    Rt.heightAtS = s => { const f = s / poly.length * (n - 1), i = Math.min(n - 2, Math.floor(f)); return lerp(prof[i], prof[i + 1], f - i); };
    if (def.river) {   // small river crossing the route: stone bridge
      const rpoly = makePoly(def.river.pts, 3);
      rivers.push({ id: id + '.river', poly: rpoly, width: def.river.width, island: area.island });
      let best = null;
      for (let i = 0; i < n; i++) { const qq = polyQuery(rpoly, poly.pts[i][0], poly.pts[i][1]); if (!best || qq.d < best.d) best = { d: qq.d, s: poly.cum[i] }; }
      const span = def.river.width / 2 + 3;
      const a = polyAt(poly, best.s - span), b2 = polyAt(poly, best.s + span), y = Rt.heightAtS(best.s) + 0.25;
      const br = { id: id + '.bridge', route: id, s0: best.s - span, s1: best.s + span, y0: y, y1: y, hw: 1.9, arch: 0.55, kind: 'stone', island: area.island, pts: [[a.x, a.z], [b2.x, b2.z]], river: true };
      Rt.spans.push(br); bridges.push(br);
    }
    const L = poly.length;
    const at = (s, off = 0) => { const q = polyAt(poly, s); return { x: q.x - q.dz * off, z: q.z + q.dx * off, dx: q.dx, dz: q.dz }; };
    const landOK = (x, z) => shape.baseHeight(x, z) > 0.6 && !townAt(x, z, 4);
    const claim = (x, z, r) => Rt.spots.push({ x, z, r });
    const p = id + '.';
    const st = at(4), en = at(L - 4);
    put(p + 'start', st.x, st.z, faceTo(st.dx, st.dz));
    put(p + 'end', en.x, en.z, faceTo(-en.dx, -en.dz));
    const sg = at(8, def.width / 2 + 1.3);
    put(p + 'sign', sg.x, sg.z, faceTo(sg.dz, -sg.dx));
    Rt.props.push({ type: 'sign', x: sg.x, z: sg.z, rot: faceTo(sg.dz, -sg.dx), text: area.name });
    claim(sg.x, sg.z, 1.2);
    const safeS = s => { let k = 0; while (Rt.inBridge(s) && k++ < 60) s += 3; return clamp(s, 10, L - 10); };
    [0.28, 0.52, 0.76].forEach((f, i) => {
      const s = safeS(L * f), side = i % 2 ? -1 : 1, q = at(s, side * (def.width / 2 + 1.8));
      put(`${p}trainer${i + 1}`, q.x, q.z, faceTo(q.dz * side, -q.dx * side));
      claim(q.x, q.z, 2.2);
    });
    [0.18, 0.47, 0.86].forEach((f, i) => {
      const s = safeS(L * f), side = i % 2 ? 1 : -1;
      let off = def.width / 2 + 7 + R() * 4, q = at(s, side * off);
      for (let k = 0; k < 6 && !landOK(q.x, q.z); k++) { off *= 0.7; q = at(s, side * off); }
      put(`${p}item${i + 1}`, q.x, q.z, 0);
      claim(q.x, q.z, 1.5);
    });
    {
      const s = safeS(L * 0.62), q = at(s, -(def.width / 2 + 4.2));
      put(p + 'rest', q.x + q.dz * 0.9, q.z - q.dx * 0.9, faceTo(q.dz, -q.dx));
      Rt.props.push({ type: 'bench', x: q.x, z: q.z, rot: faceTo(q.dz, -q.dx) });
      Rt.trees.push({ x: q.x - q.dz * 2.6, z: q.z + q.dx * 2.6, s: 1.25, big: true });
      claim(q.x, q.z, 3.5);
    }
    // chests (2 per route)
    [0.36, 0.7].forEach((f, i) => {
      const s = safeS(L * f), side = i ? 1 : -1;
      let off = def.width / 2 + 12 + R() * 4, q = at(s, side * off);
      for (let k = 0; k < 6 && !landOK(q.x, q.z); k++) { off *= 0.7; q = at(s, side * off); }
      chests.push({ x: q.x, z: q.z, facing: faceTo(-q.dz * side, q.dx * side), where: id });
      claim(q.x, q.z, 1.5);
    });
    // tall grass patches
    let s = 14 + R() * 6;
    while (s < L - 14) {
      if (!Rt.inBridge(s) && !townAt(at(s).x, at(s).z, 6)) {
        const cross = R() < 0.55;
        const side = R() < 0.5 ? 1 : -1;
        const off = cross ? (R() - 0.5) * 2 : side * (def.width / 2 + 4.5 + R() * 3);
        const q = at(s, off);
        const pt = { x: q.x, z: q.z, rx: cross ? 6 + R() * 4 : 6 + R() * 5, rz: cross ? 4.2 + R() * 2 : 3.2 + R() * 2, rot: faceTo(q.dx, q.dz), seed: R() * 100 };
        if (shape.baseHeight(q.x, q.z) > 0.5 || def.sandbar) Rt.patches.push(pt);
      }
      s += 17 + R() * 12;
    }
    // r1 specials: Briciola in the grass, the Eclissi camp on the cliffs
    if (id === 'r1') {
      const pt = Rt.patches[Math.floor(Rt.patches.length * 0.4)] || Rt.patches[0];
      put('r1.briciola', pt.x, pt.z, 0);
      const camp = { x: -96, z: -64 };
      plateaus.push({ x: camp.x, z: camp.z, r: 15, h: 3.4, island: 'aurora', cliff: true });
      put('r1.camp', camp.x, camp.z + 2, 0);
      put('r1.camp_grunt1', camp.x - 3, camp.z + 6, 0);
      put('r1.camp_grunt2', camp.x + 3, camp.z + 6, 0);
      Rt.props.push({ type: 'tent', x: camp.x - 5, z: camp.z - 4, rot: 0.3, color: '#5b3a8a' }, { type: 'tent', x: camp.x + 5.5, z: camp.z - 3, rot: -0.4, color: '#5b3a8a' },
        { type: 'campfire', x: camp.x, z: camp.z - 1, rot: 0 }, { type: 'banner', x: camp.x - 1.5, z: camp.z + 8.5, rot: 0, color: '#5b3a8a' },
        { type: 'banner', x: camp.x + 1.5, z: camp.z + 8.5, rot: 0, color: '#5b3a8a' }, { type: 'crates', x: camp.x + 8, z: camp.z + 3, rot: 0.2 });
      claim(camp.x, camp.z, 12);
      const q = polyQuery(poly, camp.x, camp.z);
      paths.push({ id: 'r1.campspur', pts: [[q.x, q.z], [lerp(q.x, camp.x, 0.5) + 6, lerp(q.z, camp.z, 0.5)], [camp.x, camp.z + 9]], width: 3, flatten: true, island: 'aurora' });
      chests.push({ x: camp.x + 8, z: camp.z - 6, facing: Math.PI, where: 'r1.camp' });
    }
    if (id === 'santuario') {
      const e = poly.pts[n - 1];
      put('santuario.altar', e[0], e[1] - 4, Math.PI);
      put('santuario.boss', e[0], e[1] + 4, Math.PI);
      put('santuario.legend', e[0], e[1] - 6.5, 0);
      Rt.props.push({ type: 'altar', x: e[0], z: e[1] - 6, rot: 0 });
      claim(e[0], e[1] - 4, 6);
    }
  }
  // gates: barricades on routes
  {
    const r3 = routes.r3, b = r3.spans[0];
    const s = b ? b.s0 - 2 : 12, q = polyAt(r3.poly, s);
    gates.push({ id: 'bridge_r3', x: q.x, z: q.z, rot: faceTo(q.dx, q.dz), hw: 3.2, text: 'Ponte chiuso: lavori in corso' });
    const r5 = routes.r5, q5 = polyAt(r5.poly, 10);
    gates.push({ id: 'pass_r5', x: q5.x, z: q5.z, rot: faceTo(q5.dx, q5.dz), hw: 3.2, text: 'Passo Gelido chiuso: troppa neve' });
  }
  // cave entrances: rocky mound + spur path
  for (const [cid, cd] of Object.entries(D.CAVE_DEFS)) {
    const [ex, ez] = cd.entrance, [fx, fz] = dirOf(cd.facing);
    plateaus.push({ x: ex - fx * 7, z: ez - fz * 7, r: 10, h: 6, island: areaById[cid].island, mound: true });
    const Rt = routes[cd.route];
    const q = polyQuery(Rt.poly, ex + fx * 3, ez + fz * 3);
    paths.push({ id: cid + '.spur', pts: [[q.x, q.z], [ex + fx * 2.5, ez + fz * 2.5]], width: 3, flatten: true, island: areaById[cid].island });
  }
  // spiaggia dell'Alba
  {
    const A = towns.alba;
    beaches.push({ town: 'alba', x: 0, z: 128, facing: 0, island: 'aurora', area: 'spiaggia_alba', r: 42 });
    put('alba.swim', -16, 160, 0);
    put('spiaggia_alba.arrive', 0, 104, 0);
    paths.push({ id: 'alba.beachpath', pts: [[A.x, A.z + 54], [2, 84], [6, 108]], width: 3.4, flatten: false, island: 'aurora' });
  }
  for (const b of beaches) {
    const [fx, fz] = dirOf(b.facing);
    chests.push({ x: b.x + fz * 14 + fx * 2, z: b.z - fx * 14 + fz * 2, facing: b.facing, where: 'beach:' + b.town });
  }
  // landmark chest (Castelfosco ruins)
  chests.push({ x: towns.fosco.x + 14, z: towns.fosco.z - 36, facing: 0, where: 'fosco' });

  // ---------------------------------------------------------------------------------------------
  // Caves (pockets far away; entered with a fade)
  // ---------------------------------------------------------------------------------------------
  Object.entries(D.CAVE_DEFS).forEach(([cid, cd], k) => {
    const R = rng('cave:' + cid);
    const ox = CAVE_ORIGIN.x - k * CAVE_ORIGIN.step, oz = CAVE_ORIGIN.z;
    const chambers = [{ x: ox, z: oz, r: 9 }];
    const corridors = [];
    let a = Math.PI, px = ox, pz = oz, pr = 9;
    for (let i = 1; i < cd.chambers; i++) {
      a += (R() - 0.5) * 1.6; a = clamp(a, Math.PI * 0.45, Math.PI * 1.55);
      const r = 8 + R() * 6, len = pr + r + 4 + R() * 6;
      const x = px + Math.sin(a) * len, z = pz + Math.cos(a) * len;
      chambers.push({ x, z, r });
      corridors.push({ ax: px, az: pz, bx: x, bz: z, w: 4.6 });
      if (i >= 2 && R() < 0.45) {   // side chamber
        const b = a + (R() < 0.5 ? 1 : -1) * (1 + R() * 0.6), r2 = 6 + R() * 3, l2 = r + r2 + 3;
        const sx = x + Math.sin(b) * l2, sz = z + Math.cos(b) * l2;
        chambers.push({ x: sx, z: sz, r: r2, side: true });
        corridors.push({ ax: x, az: z, bx: sx, bz: sz, w: 3.8 });
      }
      px = x; pz = z; pr = r;
    }
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const c of chambers) { x0 = Math.min(x0, c.x - c.r - 8); x1 = Math.max(x1, c.x + c.r + 8); z0 = Math.min(z0, c.z - c.r - 8); z1 = Math.max(z1, c.z + c.r + 8); }
    const C = { id: cid, def: cd, island: areaById[cid].island, ox, oz, chambers, corridors, box: [x0, z0, x1, z1], seed: cd.seed };
    caves[cid] = C;
    put(cid + '.entrance', ox, oz + 5, Math.PI);
    put(cid + '.exit', ox, oz + 8.2, 0);
    const [fx, fz] = dirOf(cd.facing);
    put(cid + '.outside', cd.entrance[0] + fx * 3.2, cd.entrance[1] + fz * 3.2, cd.facing);
    const main = chambers.filter(c => !c.side);
    const sides = chambers.filter(c => c.side);
    const cs = [sides[0] || main[2], main[main.length - 1]];
    cs.forEach((c, i) => chests.push({ x: c.x + (i ? 0 : 2), z: c.z - c.r * 0.5, facing: 0, where: cid }));
    put(cid + '.trainer1', main[Math.min(2, main.length - 1)].x + 2, main[Math.min(2, main.length - 1)].z, Math.PI / 2);
    C.isIn = (x, z, pad = 0) => {
      for (const c of chambers) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r - pad) ** 2) return true;
      for (const s of corridors) if (segDist(s.ax, s.az, s.bx, s.bz, x, z) < s.w / 2 - pad) return true;
      return false;
    };
  });

  // chests: ids chest.1 … chest.32 (sorted by where for stability)
  chests.slice(0, 32).forEach((c, i) => put(`chest.${i + 1}`, c.x, c.z, c.facing, { where: c.where }));
  for (let i = chests.length + 1; i <= 32; i++) { const c = chests[i % chests.length]; put(`chest.${i}`, c.x + 3, c.z + 3, 0); }

  // ---------------------------------------------------------------------------------------------
  // Interiors (pockets far away; meshes are built lazily, layouts/POIs are here)
  // ---------------------------------------------------------------------------------------------
  D.INTERIORS.forEach((iid, k) => {
    const kind = iid.split('.')[0];
    const ox = INTERIOR_ORIGIN.x + (k % INTERIOR_ORIGIN.cols) * INTERIOR_ORIGIN.step, oz = INTERIOR_ORIGIN.z + Math.floor(k / INTERIOR_ORIGIN.cols) * INTERIOR_ORIGIN.step;
    const town = iid.split('.')[1] === 'player' ? 'alba' : iid.split('.')[1];
    const I = planInterior(iid, kind, ox, oz, town);
    interiors[iid] = I;
    for (const [name, p] of Object.entries(I.pois)) put(`${iid}.${name}`, p.x, p.z, p.facing);
  });
  // outside door spots for each interior
  const interiorDoors = {};
  for (const T of Object.values(towns)) for (const b of T.buildings) interiorDoors[b.interior] = { x: b.outside.x, z: b.outside.z, facing: b.facing, town: T.id, building: b };

  // ---------------------------------------------------------------------------------------------
  // Area shapes for areaAt()
  // ---------------------------------------------------------------------------------------------
  const areaShapes = [];
  for (const T of Object.values(towns)) areaShapes.push({ id: T.id, kind: 'town', type: 'circle', x: T.x, z: T.z, r: T.r + 4, prio: 3 });
  areaShapes.push({ id: 'spiaggia_alba', kind: 'beach', type: 'circle', x: 0, z: 132, r: 50, prio: 2 });
  for (const Rt of Object.values(routes)) areaShapes.push({ id: Rt.id, kind: Rt.area.kind, type: 'poly', poly: Rt.poly, r: 46, prio: 1 });
  for (const C of Object.values(caves)) areaShapes.push({ id: C.id, kind: 'cave', type: 'box', box: C.box, prio: 5 });

  return { shape, towns, routes, paths, bridges, plateaus, gates, docks, caves, beaches, interiors, interiorDoors, rivers, areaShapes, chests };
}

// ---- interiors ---------------------------------------------------------------------------------
/** Room plans: walls rect (w × d), furniture list, POIs, search spots. Local frame: door on +z wall. */
function planInterior(iid, kind, ox, oz, town) {
  const R = rng('int:' + iid);
  const sizes = { house: [10, 8], home: [11, 8.5], center: [15, 11], shop: [12, 9], lab: [16, 12], osteria: [14, 10], depot: [18, 13] };
  const [w, d] = sizes[kind] || sizes.house;
  const I = { id: iid, kind, town, ox, oz, w, d, furniture: [], pois: {}, search: [], colliders: [], seed: R() * 1e6 | 0 };
  const F = (type, x, z, rot = 0, extra) => { const f = { type, x: ox + x, z: oz + z, rot, ...(extra || {}) }; I.furniture.push(f); return f; };
  const P = (name, x, z, facing = 0) => { I.pois[name] = { x: ox + x, z: oz + z, facing }; };
  const S = (kind2, x, z, n = '') => I.search.push({ id: `${iid}.${kind2}${n}`, x: ox + x, z: oz + z, kind: kind2 });
  const hw = w / 2, hd = d / 2;
  P('door', 0, hd - 1.2, Math.PI);
  P('window', -hw * 0.45, -hd + 1.2, Math.PI);
  if (kind === 'house' || kind === 'home') {
    const flip = R() < 0.5 ? 1 : -1;
    F('bed', -flip * (hw - 1.4), -hd + 1.4, 0);                                   // head against the back wall
    P('bed', -flip * (hw - 1.4), -hd + 1.6, Math.PI);
    F('nightstand', -flip * (hw - 2.9), -hd + 0.5, 0);
    F('wardrobe', -flip * (hw - 0.5), 0.6, flip > 0 ? Math.PI / 2 : -Math.PI / 2); S('wardrobe', -flip * (hw - 1.3), 0.6);
    F('drawers', -flip * (hw - 4.2), -hd + 0.45, 0); S('drawer', -flip * (hw - 4.2), -hd + 1.3);
    F('kitchen', flip * (hw - 2.2), -hd + 0.5, 0); F('fridge', flip * (hw - 0.55), -hd + 0.55, 0); S('fridge', flip * (hw - 0.6), -hd + 1.4);
    F('table', flip * (hw - 2.6), 0.4, 0); P('table', flip * (hw - 2.6), 1.6, Math.PI);
    F('sofa', flip * 0.2, hd - 2.4, Math.PI); P('sofa', flip * 0.2, hd - 2.3, 0);
    F('shelf', flip * (hw - 0.35), hd - 2.4, flip > 0 ? -Math.PI / 2 : Math.PI / 2); S('shelf', flip * (hw - 1.1), hd - 2.4);
    F('rug', -flip * 1.2, 0.4, 0, { color: R.pick(['#e8674a', '#2fa8a0', '#9b7fd1', '#f5b83d']) });
    F('plant', -flip * (hw - 0.6), hd - 0.8, 0); F('lamp', -flip * (hw - 2.9), -hd + 0.5, 0, { onTop: true });
    if (kind === 'home') { F('tv', flip * 0.2, -hd + 0.4, 0); F('desk', -flip * 0.4, -hd + 0.5, 0); }
    P('owner', flip * (hw - 3.8), 0.9, -flip * Math.PI / 2);
  } else if (kind === 'center') {
    F('counter', 0, -hd + 3.2, 0, { len: 5.5, color: '#ffffff', accent: '#e8674a' }); P('counter', 0, -hd + 2.2, 0);
    F('healer', 0, -hd + 0.8, 0); F('pc', hw - 0.6, -1.0, -Math.PI / 2); P('pc', hw - 1.6, -1.0, Math.PI / 2);
    F('bench', -hw + 1.0, 0.2, Math.PI / 2); F('bench', -hw + 1.0, 2.8, Math.PI / 2); F('plant', -hw + 0.7, -hd + 0.7, 0); F('plant', hw - 0.7, -hd + 0.7, 0);
    F('rug', 0, 1.8, 0, { color: '#e8674a', w: 3, d: 5 }); P('owner', 0, -hd + 2.2, 0); P('sofa', -hw + 1.3, 1.5, Math.PI / 2); P('table', 2.5, 2, 0);
    F('shelf', hw - 0.35, 2.6, -Math.PI / 2);
  } else if (kind === 'shop') {
    F('counter', -1.5, -hd + 2.8, 0, { len: 4.5, color: '#3fa6d9', accent: '#ffffff' }); P('counter', -1.5, -hd + 1.8, 0);
    F('shelf', -hw + 0.35, -1, Math.PI / 2, { goods: true }); F('shelf', -hw + 0.35, 1.6, Math.PI / 2, { goods: true });
    F('shelf', hw - 0.35, -1, -Math.PI / 2, { goods: true }); F('shelf', hw - 0.35, 1.6, -Math.PI / 2, { goods: true });
    F('shelfback', 2.6, -hd + 0.35, 0, { goods: true }); F('crates', hw - 1.2, hd - 1.4, 0); F('plant', -hw + 0.7, hd - 0.8, 0);
    P('owner', -1.5, -hd + 1.8, 0); P('table', 1.5, 0.8, 0); S('shelf', hw - 1.2, 0.3);
  } else if (kind === 'lab') {
    F('labtable', 0, -0.6, 0); P('table', 0, 0.8, Math.PI); P('owner', 1.6, -2.2, 0);
    F('machine', -hw + 1.2, -hd + 1.0, 0); F('machine', hw - 1.2, -hd + 1.0, 0); F('bookshelf', -2.5, -hd + 0.4, 0); F('bookshelf', 2.5, -hd + 0.4, 0);
    F('bookshelf', -hw + 0.4, 1.5, Math.PI / 2); F('desk', hw - 1.4, 2.2, -Math.PI / 2); F('plant', -hw + 0.7, hd - 0.8, 0); F('plant', hw - 0.7, hd - 0.8, 0);
    F('rug', 0, 2.6, 0, { color: '#2fa8a0', w: 4, d: 3 }); S('shelf', -hw + 1.2, 1.5); P('counter', hw - 2.4, 2.2, Math.PI / 2);
  } else if (kind === 'osteria') {
    F('bar', 0, -hd + 2.0, 0, { len: 6 }); P('counter', 0, -hd + 1.1, 0); P('owner', 0, -hd + 1.1, 0);
    F('barrels', -hw + 1.0, -hd + 1.0, 0); F('barrels', hw - 1.0, -hd + 1.0, 0);
    const tables = [[-3.6, 0.8], [3.6, 0.8], [-3.6, 3.4], [3.6, 3.4], [0, 2.2]];
    tables.forEach(([x, z], i) => F('dtable', x, z, 0, { cloth: i % 2 ? '#e8674a' : '#ffffff' }));
    P('table', -3.6, 2.0, Math.PI); P('sofa', 3.6, 2.0, Math.PI);
    F('stringlights', 0, 0, 0, { w: w - 1, d: d - 1 }); F('plant', -hw + 0.7, hd - 0.8, 0);
  } else if (kind === 'depot') {
    for (let i = 0; i < 9; i++) F('crates', -hw + 2 + (i % 3) * 2.2 + (i > 5 ? 9 : 0), -hd + 2 + Math.floor(i / 3) * 2.4 * (i > 5 ? 0 : 1), R() * 0.4);
    F('banner', -3, -hd + 0.3, 0, { color: '#5b3a8a' }); F('banner', 3, -hd + 0.3, 0, { color: '#5b3a8a' }); F('desk', hw - 2, -hd + 1.5, 0);
    F('barrels', hw - 1.2, hd - 1.6, 0); P('owner', 0, -hd + 3, 0); P('table', hw - 2, -hd + 2.6, Math.PI); S('chest', hw - 2, -hd + 2.4);
  }
  return I;
}

// ---- small 2D helpers ----------------------------------------------------------------------------
export function segClosest(ax, az, bx, bz, x, z) {
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
  const t = clamp(((x - ax) * vx + (z - az) * vz) / L2, 0, 1);
  return [ax + vx * t, az + vz * t, t];
}
export function segDist(ax, az, bx, bz, x, z) { const [px, pz] = segClosest(ax, az, bx, bz, x, z); return Math.hypot(x - px, z - pz); }
/** Inside a building footprint (rotated by facing) expanded by pad. */
export function inRect(x, z, b, pad = 0) {
  const c = Math.cos(b.facing), s = Math.sin(b.facing), dx = x - b.x, dz = z - b.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) < b.w / 2 + pad && Math.abs(lz) < b.d / 2 + pad;
}
function nearestExit(def, x, z) { let best = def.exits[0], bd = Infinity; for (const e of def.exits) { const d = Math.hypot(e[0] - x, e[1] - z); if (d < bd) { bd = d; best = e; } } return best; }
function angDiff(a, b) { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
