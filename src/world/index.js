// World: the Arcipelago di Valmora. Builds the island the player is on (terrain, sea, towns with
// merged buildings and props, routes, bridges, piers, tall grass, vegetation, cave mouths, gates),
// streams the neighbour islands in progressively as the player approaches (far ones are cheap
// low-poly silhouettes), builds interiors and caves lazily in far pockets, applies the day/night
// lighting, tracks the current area and implements the World API (docs/ARCHITECTURE.md).
import * as THREE from 'three';
import { ISLANDS, AREAS, TOWNS, ROUTES, FERRIES, GATES, INTERIORS, POIS, LAYOUT, poiId } from './map.js';
import { colorsFor } from './palette.js';
import { createHeightfield } from './heightfield.js';
import { buildTerrainGen } from './terrain.js';
import { buildWater } from './water.js';
import { buildSky } from './sky.js';
import { buildVegetation } from './vegetation.js';
import { buildTallGrass } from './tallgrass.js';
import { buildBuilding, buildLandmark } from './buildings.js';
import { addProp, addBridge, addDock, addCaveMouth, buildGate } from './props.js';
import { buildInterior } from './interiors.js';
import { buildCave, caveSDF } from './caves.js';
import { createFerries } from './ferry.js';
import { createColliders } from './colliders.js';
import { createWorldMats, WIND } from './mats.js';
import { buildOccupancy, OCC } from './occupancy.js';
import { Builder } from './builder.js';
import { decorateTown, decorateRoute, decorateBeach } from './decor.js';
import { buildPaths } from './paths.js';
import { INTERIOR_ORIGIN, inRect, segDist } from './layout.js';
import { polyQuery } from './shape.js';
import { rng, smoothstep, clamp } from '../core/math.js';

const AREA = Object.fromEntries(AREAS.map(a => [a.id, a]));
const ISL = Object.fromEntries(ISLANDS.map(i => [i.id, i]));
const NEAR_BUILD = 150;     // start streaming an island when the focus is this close to its box
const FAR_DROP = 330;       // dispose a built island when farther than this
const BUDGET_MS = 7;

/** @param {any} ctx */
export async function init(ctx) {
  const L = LAYOUT;
  const hf = createHeightfield(L);
  const mats = createWorldMats(ctx);
  ctx.worldMats = mats;
  const colliders = createColliders();
  const root = new THREE.Group(); root.name = 'world';
  ctx.scene.add(root);
  const sky = buildSky(ctx); root.add(sky.object);
  const water = buildWater(ctx); root.add(water.object);
  const save = () => (ctx.save.state.world ||= { unlocked: {}, doors: {} });
  save().doors ||= {}; save().unlocked ||= {};
  const q = {};

  // ------------------------------------------------------------------------------------------------
  // Islands
  // ------------------------------------------------------------------------------------------------
  const islands = new Map();
  for (const I of L.shape.islands) islands.set(I.id, { id: I.id, def: I, box: I.box, built: false, job: null, group: null, silhouette: null, regs: [], gates: [] });
  const islandOf = (x, z) => L.shape.islandAt(x, z).island?.id || null;
  const boxDist = (b, x, z) => Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - z, 0, z - b[3]));

  /** Cheap low-poly silhouette (8 m grid + blob trees) for islands that are not built. */
  function buildSilhouette(S) {
    const C = colorsFor(S.id), I = S.def, step = 8;
    const [x0, z0, x1, z1] = I.box;
    const nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1;
    const pos = [], col = [], idx = [], c = new THREE.Color();
    const cs = new THREE.Color(C.sand), cg = new THREE.Color(C.grass), cr = new THREE.Color(C.rock), cb = new THREE.Color(C.bed);
    const H = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * step, z = z0 + j * step, h = Math.max(-3, hf.heightTowns(x, z));
      H[j * nx + i] = h;
      pos.push(x, h, z);
      if (h < 0) c.copy(cb); else if (h < 0.8) c.copy(cs); else if (h > 9) c.copy(cr); else c.copy(cg);
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + nx;
      if (Math.max(H[a], H[a + 1], H[b], H[b + 1]) < -1.5) continue;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const g = new THREE.Group(); g.name = 'silhouette:' + S.id;
    g.add(new THREE.Mesh(geo, mats.solid));
    // tree blobs and town roofs
    const b = new Builder({ seed: 'sil' + S.id, ao: false });
    const R = rng('sil' + S.id);
    for (let k = 0; k < 260; k++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0), h = hf.heightTowns(x, z);
      if (h < 1 || islandOf(x, z) !== S.id) continue;
      if (C.trees[0] === 'pine') b.cone(1.6, 4, x, h + 2, z, C.leafDark, { seg: 6 });
      else if (C.trees[0] === 'cactus') b.cyl(0.3, 0.3, 2.4, x, h + 1.2, z, '#5aa84a', { seg: 5 });
      else b.sphere(1.8, x, h + 2.6, z, R() < 0.5 ? C.leaf : C.leafDark, { detail: 0 });
    }
    for (const T of Object.values(L.towns)) if (T.island === S.id) for (const bd of T.buildings) b.box(bd.w, 3.2, bd.d, bd.x, T.base + 1.6, bd.z, C.roofs[bd.colorIdx % C.roofs.length], { ry: bd.facing });
    g.add(b.build(mats.forBuilder(), { name: 'sil-props' }));
    g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    return g;
  }

  /** Generator that builds one island (yields often; run with a time budget or to completion). */
  function* islandBuilder(S) {
    const id = S.id, C = colorsFor(id);
    const grid = yield* hf.bakeGen(id);
    const occ = buildOccupancy(L, id);
    const others = [...islands.values()].filter(o => o.id !== id).map(o => o.box);
    const desc = { id, colors: C, grid, layout: L, hf, occ, box: S.box, mats, owner: (x, z) => !others.some(b => x > b[0] && x < b[2] && z > b[1] && z < b[3]) || islandOf(x, z) === id, forest: id === 'giada' ? 0.25 : id === 'ramato' ? -0.3 : id === 'coralline' ? -0.15 : 0 };
    const group = new THREE.Group(); group.name = 'island:' + id;
    const terrain = yield* buildTerrainGen(ctx, desc);
    group.add(terrain.mesh);
    const pathMesh = buildPaths(ctx, desc);
    if (pathMesh) group.add(pathMesh);
    yield;
    const ids = [], surf = [], regs = [], glows = [];
    const b = new Builder({ seed: 'island' + id, groundAt: hf.heightAt });
    const hAt = hf.heightAt;
    // towns
    for (const T of Object.values(L.towns)) {
      if (T.island !== id) continue;
      for (const bd of T.buildings) {
        buildBuilding(ctx, { ...bd, builder: b, style: T.style, colors: C, heightAt: hAt, y: hAt(bd.x, bd.z) });
        regs.push(registerDoor(bd));
      }
      buildLandmark(ctx, { builder: b, x: T.x, z: T.z, kind: T.landmark, heightAt: hAt, colors: C });
      for (const p of T.props) if (p.type !== 'tree') addProp(b, p, hAt, C);
      decorateTown(b, T, desc);
      yield;
    }
    // routes
    for (const Rt of Object.values(L.routes)) {
      if (Rt.island !== id) continue;
      for (const p of Rt.props) addProp(b, p, hAt, C);
      decorateRoute(b, Rt, desc);
      const sg = Rt.props.find(p => p.type === 'sign');
      if (sg) regs.push(ctx.interact.register({ id: `sign:${Rt.id}`, pos: { x: sg.x, z: sg.z }, radius: 1.6, label: 'Leggi', icon: '📜', run: () => ctx.ui?.say?.('Cartello', [Rt.area.name, signText(Rt)]) }));
      yield;
    }
    for (const bch of L.beaches) if (bch.island === id) decorateBeach(b, bch, desc);
    // bridges, piers, cave mouths
    for (const br of L.bridges) {
      if (br.island !== id) continue;
      const o = addBridge(b, br, hAt);
      surf.push(...o.surfaces); for (const c of o.colliders) ids.push(colliders.add({ ...c, group: id }));
    }
    for (const d of Object.values(L.docks)) {
      if (L.towns[d.town]?.island !== id) continue;
      const o = addDock(b, d);
      surf.push(...o.surfaces); for (const c of o.colliders) ids.push(colliders.add({ ...c, group: id }));
      const dp = POIS[`${d.town}.dock`];
      if (dp && FERRIES.some(f => f.a === d.town || f.b === d.town)) regs.push(ctx.interact.register({ id: `dock:${d.town}`, pos: { x: dp.x, z: dp.z }, radius: 2.2, label: 'Traghetto', icon: '⛴️', priority: 1, run: () => ferries.dockMenu(d.town) }));
    }
    for (const Cv of Object.values(L.caves)) {
      if (Cv.island !== id) continue;
      const o = addCaveMouth(b, Cv, hAt, C);
      for (const c of o.colliders) ids.push(colliders.add({ ...c, group: id }));
      const op = POIS[`${Cv.id}.outside`];
      regs.push(ctx.interact.register({ id: `cave:${Cv.id}`, pos: { x: op.x, z: op.z }, radius: 2.4, label: 'Entra', icon: '🕳️', priority: 1, enabled: () => !ctx.world?.interior, run: () => enterCave(Cv.id) }));
    }
    yield;
    const statics = b.build(mats.forBuilder(), { name: 'static:' + id });
    group.add(statics);
    for (const c of b.colliders) ids.push(colliders.add({ ...c, group: id }));
    glows.push(...b.glows);
    for (const s of surf) ids.push(colliders.addSurface({ ...s, group: id }));
    yield;
    // vegetation + tall grass
    const veg = buildVegetation(ctx, desc, hAt);
    group.add(veg.object);
    for (const c of veg.colliders) ids.push(colliders.add({ ...c, group: id }));
    yield;
    const patches = [];
    for (const Rt of Object.values(L.routes)) if (Rt.island === id) for (const p of Rt.patches) patches.push({ ...p, route: Rt.id });
    const grass = buildTallGrass(ctx, patches, { heightAt: hAt, colors: C, name: id });
    group.add(grass.object);
    yield;
    // gates
    const gates = [];
    for (const g of L.gates) {
      if (islandOf(g.x, g.z) !== id) continue;
      const G = buildGate(ctx, g, hAt, mats);
      const st = { def: g, object: G.object, collider: G.collider, cid: null, reg: null };
      gates.push(st);
      applyGate(st, group);
    }
    // night light pools
    const pools = buildLightPools(glows, hAt);
    if (pools) group.add(pools);
    group.traverse(o => { if (o.isMesh && !o.isInstancedMesh) o.matrixAutoUpdate = false; });
    Object.assign(S, { built: true, group, terrain, veg, grass, ids, regs, gates, pools, occ, desc, waterTex: terrain.waterTex, waterBox: terrain.waterBox });
    root.add(group);
    if (S.silhouette) S.silhouette.visible = false;
    veg.refresh(); grass.refresh();
    if (current === S.id) water.setIsland(S.waterTex, S.waterBox);
    return S;
  }

  function signText(Rt) {
    const a = Rt.area;
    const lv = a.levels ? `Velmon selvatici: Lv ${a.levels[0]}-${a.levels[1]}.` : '';
    const ends = ROUTES.find(r => r.id === Rt.id);
    const to = [ends?.a, ends?.b].filter(Boolean).map(t => AREA[t]?.name).join(' ↔ ');
    return [to, lv, "Attenzione all'erba alta!"].filter(Boolean).join(' ');
  }

  function disposeIsland(S) {
    if (!S.built) return;
    colliders.removeGroup(S.id);
    for (const r of S.regs) try { r?.(); } catch { /* ignore */ }
    for (const g of S.gates) { if (g.reg) g.reg(); }
    S.veg?.dispose(); S.grass?.dispose();
    S.group.traverse(o => { if (o.isMesh && !o.isInstancedMesh) o.geometry?.dispose(); });
    S.terrain?.waterTex?.dispose();
    S.group.removeFromParent();
    hf.drop(S.id);
    Object.assign(S, { built: false, group: null, veg: null, grass: null, ids: [], regs: [], gates: [], terrain: null, waterTex: null });
    if (S.silhouette) S.silhouette.visible = true;
  }

  function finishJob(S) { if (!S.built) { if (!S.job) S.job = islandBuilder(S); let r; do { r = S.job.next(); } while (!r.done); S.job = null; } }
  function ensureIslandAt(x, z) {
    const id = islandOf(x, z);
    if (id) finishJob(islands.get(id));
    return id;
  }

  // gates -------------------------------------------------------------------------------------------
  const canPass = gateId => { const fl = GATES[gateId]; if (!fl) return true; return fl.some(f => ctx.flags?.has?.(f)); };
  function applyGate(st, group) {
    const open = canPass(st.def.id);
    if (open) {
      if (st.cid != null) { colliders.remove(st.cid); st.cid = null; }
      if (st.reg) { st.reg(); st.reg = null; }
      if (st.object.parent) {
        // fade the barricade away (shrink with a little squash)
        const o = st.object; let t = 0;
        const off = ctx.loop.add(dt => { t += dt / 0.6; const k = Math.max(0, 1 - t); o.scale.set(1 + (1 - k) * 0.2, k, 1 + (1 - k) * 0.2); o.updateMatrixWorld(true); if (t >= 1) { o.removeFromParent(); off(); } }, ctx.ORDER.world);
      }
    } else {
      if (!st.object.parent) group.add(st.object);
      if (st.cid == null) st.cid = colliders.add({ ...st.collider, group: 'gate' });
      if (!st.reg) st.reg = ctx.interact.register({ id: `gate:${st.def.id}`, pos: { x: st.def.x, z: st.def.z }, radius: 3.2, label: 'Leggi', icon: '🚧', run: () => ctx.ui?.say?.('Cartello', [st.def.text]) });
    }
  }
  ctx.bus.on('flag:set', () => { for (const S of islands.values()) if (S.built) for (const g of S.gates) applyGate(g, S.group); });

  // doors -------------------------------------------------------------------------------------------
  function registerDoor(bd) {
    const iid = bd.interior;
    return ctx.interact.register({
      id: `door:${iid}`, pos: { x: bd.outside.x - Math.sin(bd.facing) * 0.4, z: bd.outside.z - Math.cos(bd.facing) * 0.4 }, radius: 1.9,
      label: 'Entra', icon: '🚪', enabled: () => !world.interior,
      run: async () => {
        if (save().doors[iid]) { ctx.audio?.sfx?.('ui_tap'); ctx.ui?.toast?.('È chiuso a chiave.', { icon: '🔒' }); return; }
        await world.enterInterior(iid);
      },
    });
  }

  // light pools under lamps (additive discs, on at night) -------------------------------------------
  let poolTex = null;
  function buildLightPools(glows, hAt) {
    const list = glows.filter(g => g.kind === 'lamp' || g.kind === 'wall' || g.kind === 'door' || g.kind === 'pergola' || g.kind === 'fire' || g.kind === 'lantern' || g.kind === 'crystal' || g.kind === 'altar');
    if (!list.length) return null;
    if (!poolTex) {
      const n = 64, data = new Uint8Array(n * n * 4);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const d = Math.hypot(i - n / 2 + 0.5, j - n / 2 + 0.5) / (n / 2); const a = Math.pow(Math.max(0, 1 - d), 1.8); data.set([255, 255, 255, Math.round(a * 255)], (j * n + i) * 4); }
      poolTex = new THREE.DataTexture(data, n, n); poolTex.needsUpdate = true; poolTex.magFilter = poolTex.minFilter = THREE.LinearFilter;
    }
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: true, color: '#ffffff' });
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    list.forEach((g, i) => {
      const s = (g.kind === 'lamp' ? 6.5 : g.kind === 'fire' || g.kind === 'altar' ? 7 : 4.2) * Math.min(1.5, g.size || 1);
      const y = hAt(g.x, g.z) + 0.06;
      m.makeScale(s, 1, s).setPosition(g.x, y, g.z); mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(g.color).multiplyScalar(0.55));
    });
    mesh.name = 'light-pools'; mesh.renderOrder = 3; mesh.frustumCulled = true; mesh.computeBoundingSphere();
    mesh.userData.mat = mat;
    return mesh;
  }

  // ------------------------------------------------------------------------------------------------
  // Interiors and caves (pockets)
  // ------------------------------------------------------------------------------------------------
  const pockets = { interior: null, cave: null };   // {id, built, ids, regs}
  const interiorAt = (x, z) => {
    if (x < INTERIOR_ORIGIN.x - 40 || z < INTERIOR_ORIGIN.z - 40) return null;
    const col = Math.round((x - INTERIOR_ORIGIN.x) / INTERIOR_ORIGIN.step), row = Math.round((z - INTERIOR_ORIGIN.z) / INTERIOR_ORIGIN.step);
    const iid = INTERIORS[row * INTERIOR_ORIGIN.cols + col];
    return iid && L.interiors[iid] ? iid : null;
  };
  const caveAt = (x, z) => { for (const C of Object.values(L.caves)) { const b = C.box; if (x > b[0] && x < b[2] && z > b[1] && z < b[3]) return C.id; } return null; };

  function openInterior(iid) {
    if (pockets.interior?.id === iid) return pockets.interior;
    closeInterior();
    const plan = L.interiors[iid];
    const built = buildInterior(ctx, plan, mats);
    const ids = built.colliders.map(c => colliders.add({ ...c, group: 'pocket:' + iid }));
    for (const s of built.surfaces) ids.push(colliders.addSurface({ ...s, group: 'pocket:' + iid }));
    root.add(built.object);
    const regs = [ctx.interact.register({ id: `exit:${iid}`, pos: built.exit, radius: 1.6, label: 'Esci', icon: '🚪', priority: 1, run: () => world.exitInterior() })];
    pockets.interior = { id: iid, built, ids, regs, plan };
    return pockets.interior;
  }
  function closeInterior() {
    const P = pockets.interior; if (!P) return;
    colliders.removeGroup('pocket:' + P.id);
    P.regs.forEach(r => r());
    P.built.object.traverse(o => { if (o.isMesh) o.geometry?.dispose(); });
    P.built.object.removeFromParent();
    pockets.interior = null;
  }
  function openCave(cid) {
    if (pockets.cave?.id === cid) return pockets.cave;
    closeCave();
    const C = L.caves[cid];
    const built = buildCave(ctx, C, mats);
    const ids = built.colliders.map(c => colliders.add({ ...c, group: 'cave:' + cid }));
    root.add(built.object);
    const ex = POIS[`${cid}.exit`];
    const regs = [ctx.interact.register({ id: `cave-exit:${cid}`, pos: { x: ex.x, z: ex.z }, radius: 2.2, label: 'Esci', icon: '☀️', priority: 1, run: () => exitCave(cid) })];
    pockets.cave = { id: cid, built, ids, regs, C };
    return pockets.cave;
  }
  function closeCave() {
    const P = pockets.cave; if (!P) return;
    colliders.removeGroup('cave:' + P.id);
    P.regs.forEach(r => r());
    P.built.dispose();
    pockets.cave = null;
  }
  const through = async fn => { if (ctx.fade?.through) return ctx.fade.through(fn, { ms: 320 }); return fn(); };

  function teleportPlayer(x, z, facing) {
    const pl = ctx.player;
    if (pl?.teleport) pl.teleport(x, z, facing);
    else { const o = ctx.cameraRig.followed; if (o) { o.position.set(x, world.groundY(x, z), z); if (facing != null) o.rotation.y = facing; } }
    ctx.cameraRig.snap?.();
    lastStream = -1;
  }

  async function enterCave(cid) {
    const rel = ctx.busy.push('travel');
    try {
      await through(async () => {
        openCave(cid);
        const p = POIS[`${cid}.entrance`];
        teleportPlayer(p.x, p.z, p.facing);
        updateArea(true);
      });
    } finally { rel(); }
  }
  async function exitCave(cid) {
    const rel = ctx.busy.push('travel');
    try {
      await through(async () => {
        const p = POIS[`${cid}.outside`];
        ensureIslandAt(p.x, p.z);
        teleportPlayer(p.x, p.z, p.facing);
        closeCave();
        updateArea(true);
      });
    } finally { rel(); }
  }

  // ------------------------------------------------------------------------------------------------
  // Areas
  // ------------------------------------------------------------------------------------------------
  function areaAt(x, z) {
    if (caveAt(x, z)) return caveAt(x, z);
    const iid = interiorAt(x, z);
    if (iid) return L.interiors[iid].town;
    let best = null, bp = -1, bd = Infinity;
    for (const s of L.areaShapes) {
      let inside = false, d = 0;
      if (s.type === 'circle') { d = Math.hypot(x - s.x, z - s.z); inside = d < s.r; }
      else if (s.type === 'poly') { const b = s.poly.box; if (x < b[0] - s.r || x > b[2] + s.r || z < b[1] - s.r || z > b[3] + s.r) continue; polyQuery(s.poly, x, z, q); d = q.d; inside = d < s.r; }
      else continue;
      if (inside && (s.prio > bp || (s.prio === bp && d < bd))) { best = s.id; bp = s.prio; bd = d; }
    }
    if (best) return best;
    // wilderness: nearest town/route on the same island
    const isl = islandOf(x, z);
    if (!isl) return null;
    let nb = null, nd = Infinity;
    for (const T of Object.values(L.towns)) if (T.island === isl) { const d = Math.hypot(x - T.x, z - T.z) - T.r; if (d < nd) { nd = d; nb = T.id; } }
    for (const Rt of Object.values(L.routes)) if (Rt.island === isl) { polyQuery(Rt.poly, x, z, q); if (q.d < nd) { nd = q.d; nb = Rt.id; } }
    return nb;
  }

  let current = null;     // current island id (focus)
  let areaT = 0, lastStream = -1;
  function updateArea(force = false) {
    const p = ctx.player?.position || ctx.cameraRig.followed?.position;
    if (!p) return;
    const id = areaAt(p.x, p.z) || world.area;
    if (!id) return;
    const iid = interiorAt(p.x, p.z);
    if (iid !== world.interior) syncInterior(iid);
    const cid = caveAt(p.x, p.z);
    if (cid && pockets.cave?.id !== cid) openCave(cid);
    if (!cid && pockets.cave && !force) closeCave();
    if (id !== world.area || force) {
      const prev = world.area;
      world.area = id;
      const A = AREA[id];
      if (A && id !== prev) {
        ctx.bus.emit('area:enter', { id, kind: A.kind, name: A.name, island: A.island });
        if (ctx.save.state.player) ctx.save.state.player.area = id;
      }
      applyCamera();
      if (A && !ctx.busy.has('battle') && !ctx.busy.has('scene')) ctx.audio?.music?.(musicFor(A));
    }
  }
  const musicFor = A => (A.kind === 'town' && ctx.time.isNight ? 'night' : A.music || 'route');
  ctx.bus.on('time:phase', () => { const A = AREA[world.area]; if (A && A.kind === 'town' && !ctx.busy.is()) ctx.audio?.music?.(musicFor(A)); });
  function applyCamera() {
    const A = AREA[world.area];
    if (world.interior) ctx.cameraRig.setExplore?.({ distance: 9, pitch: 54, yaw: 0, lookAhead: 0.6 });
    else if (A?.camera) ctx.cameraRig.setExplore?.({ distance: A.camera.distance, pitch: A.camera.pitch, yaw: A.camera.yaw, lookAhead: 1.2 });
  }
  function syncInterior(iid) {
    if (iid) {
      openInterior(iid);
      world.interior = iid;
      if (ctx.save.state.player) ctx.save.state.player.interior = iid;
      ctx.bus.emit('interior:enter', { id: iid });
    } else if (world.interior) {
      const was = world.interior;
      world.interior = null;
      closeInterior();
      if (ctx.save.state.player) ctx.save.state.player.interior = null;
      ctx.bus.emit('interior:exit', { id: was });
    }
    applyCamera();
  }

  // ------------------------------------------------------------------------------------------------
  // Ground queries
  // ------------------------------------------------------------------------------------------------
  const inPocket = (x, z) => x > 4000 || x < -4000;
  function heightAt(x, z) {
    if (inPocket(x, z)) { if (pockets.cave && caveAt(x, z) === pockets.cave.id) return pockets.cave.built.heightAt(x, z); return 0; }
    return hf.heightAt(x, z);
  }
  function groundY(x, z) {
    const s = colliders.surfaceAt(x, z);
    if (inPocket(x, z)) { if (s != null) return s; const c = caveAt(x, z); if (c && pockets.cave?.id === c) return Math.min(0.1, pockets.cave.built.heightAt(x, z)); return 0; }
    const h = hf.heightAt(x, z);
    return s != null ? Math.max(s, h) : h;
  }
  function okGround(fx, fz, x, z, r) {
    if (inPocket(x, z)) {
      const c = caveAt(x, z);
      if (c) return caveSDF(L.caves[c], x, z) < -r * 0.6;
      return !!interiorAt(x, z);
    }
    const s = colliders.surfaceAt(x, z);
    if (s != null) return true;
    const h = hf.heightAt(x, z);
    if (h < -0.55) return false;                                   // deep water
    const h0 = colliders.surfaceAt(fx, fz) ?? hf.heightAt(fx, fz);
    const step = Math.hypot(x - fx, z - fz);
    if (h - h0 > Math.max(0.06, step * 1.05)) return false;        // cliff / steep ledge going up
    return true;
  }

  // ------------------------------------------------------------------------------------------------
  // Beacon
  // ------------------------------------------------------------------------------------------------
  const beacon = (() => {
    const g = new THREE.Group(); g.name = 'beacon'; g.visible = false;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#ffc93c') }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uTime; varying vec2 vUv; void main(){ float a = (1.0 - vUv.y) * (0.55 + 0.25 * sin(uTime * 3.0 - vUv.y * 9.0)); a *= smoothstep(0.0, 0.08, vUv.y); float edge = 1.0 - abs(vUv.x * 2.0 - 1.0); gl_FragColor = vec4(uColor * (1.0 + (1.0 - vUv.y) * 0.6), a * 0.65); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 22, 16, 1, true), mat); col.position.y = 11;
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffc93c', transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 32), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08;
    g.add(col, ring); col.renderOrder = 5; ring.renderOrder = 5;
    root.add(g);
    return { g, mat, ringMat, ring, target: null };
  })();

  // ------------------------------------------------------------------------------------------------
  // Props added by other areas
  // ------------------------------------------------------------------------------------------------
  const props = new Map(); let propSeq = 0;

  // ------------------------------------------------------------------------------------------------
  // World API
  // ------------------------------------------------------------------------------------------------
  const world = {
    ISLANDS, AREAS, TOWNS, ROUTES, FERRIES, GATES, INTERIORS, POIS, poiId,
    layout: L, mats, sky, water,
    waterLevel: 0,
    area: null,
    interior: null,
    lampsOn: false,
    get sun() { return sky.sun; },
    colliders,
    heightAt, groundY,
    isWater(x, z) { if (inPocket(x, z)) return false; return colliders.surfaceAt(x, z) == null && hf.heightAt(x, z) < -0.05; },
    walkable(x, z) { return okGround(x, z, x, z, 0.3) && !colliders.blocked(x, z, 0.3); },
    resolveMove(from, to, radius = 0.35) {
      let p = colliders.resolve(from, to, radius);
      if (okGround(from.x, from.z, p.x, p.z, radius)) return p;
      // slide along the obstacle: try each axis on its own
      const a = colliders.resolve(from, { x: to.x, z: from.z }, radius);
      if (okGround(from.x, from.z, a.x, a.z, radius)) return a;
      const b = colliders.resolve(from, { x: from.x, z: to.z }, radius);
      if (okGround(from.x, from.z, b.x, b.z, radius)) return b;
      return { x: from.x, z: from.z };
    },
    areaAt,
    areaDef: id => AREA[id] || null,
    encounterZoneAt(x, z) {
      const c = caveAt(x, z); if (c) return c;
      if (inPocket(x, z)) return null;
      const S = islands.get(islandOf(x, z));
      if (!S?.built || !S.grass) return null;
      for (const p of S.grass.patches) {
        const dx = x - p.x, dz = z - p.z;
        if (Math.abs(dx) > p.rx + 1 || Math.abs(dz) > p.rx + 1) continue;
        const u = dx * p.sa + dz * p.ca, v = dx * p.ca - dz * p.sa;
        if ((u / p.rx) ** 2 + (v / p.rz) ** 2 < 0.92) return p.route;
      }
      return null;
    },
    rustle(x, z) { const S = islands.get(islandOf(x, z)); S?.grass?.rustle(x, z); ctx.audio?.sfx?.('grass_rustle'); },
    poi(id) {
      const p = POIS[id]; if (!p) return null;
      return { x: p.x, y: groundY(p.x, p.z), z: p.z, facing: p.facing };
    },
    pois(prefix = '') { const out = []; for (const [id, p] of Object.entries(POIS)) if (id.startsWith(prefix)) out.push({ id, x: p.x, y: p.y, z: p.z, facing: p.facing }); return out; },
    async enterInterior(iid) {
      if (!L.interiors[iid]) { console.warn('[world] unknown interior', iid); return; }
      const rel = ctx.busy.push('travel');
      try {
        ctx.audio?.sfx?.('door');
        await through(async () => {
          openInterior(iid);
          const p = POIS[`${iid}.door`];
          teleportPlayer(p.x, p.z, p.facing);
          updateArea(true);
        });
      } finally { rel(); }
    },
    async exitInterior() {
      const iid = world.interior; if (!iid) return;
      const d = L.interiorDoors[iid];
      const rel = ctx.busy.push('travel');
      try {
        ctx.audio?.sfx?.('door');
        await through(async () => {
          const x = d ? d.x : POIS['alba.arrive'].x, z = d ? d.z : POIS['alba.arrive'].z;
          ensureIslandAt(x, z);
          teleportPlayer(x, z, d ? d.facing : 0);
          updateArea(true);
        });
      } finally { rel(); }
    },
    setDoorLocked(iid, v) { save().doors[iid] = !!v; ctx.save.commit?.(); },
    isDoorLocked: iid => !!save().doors[iid],
    searchSpots(iid) { return (L.interiors[iid]?.search || []).map(s => ({ ...s })); },
    travel(ferryId) { return ferries.travel(ferryId); },
    canPass,
    setBeacon(pos, color = '#ffc93c') {
      if (!pos) { beacon.g.visible = false; beacon.target = null; return; }
      beacon.target = { x: pos.x, z: pos.z };
      beacon.mat.uniforms.uColor.value.set(color); beacon.ringMat.color.set(color);
      beacon.g.visible = true;
    },
    addProp(obj, { x, z, y, collider } = {}) {
      const id = ++propSeq;
      if (x != null) obj.position.set(x, y ?? groundY(x, z), z);
      root.add(obj);
      let cid = null;
      if (collider) cid = colliders.add({ ...collider, x: collider.x ?? x, z: collider.z ?? z, type: collider.hw != null ? 'box' : 'circle', group: 'prop' });
      props.set(id, { obj, cid });
      return id;
    },
    removeProp(id) { const p = props.get(id); if (!p) return; p.obj.removeFromParent(); if (p.cid != null) colliders.remove(p.cid); props.delete(id); },
    minimap() { return minimap(); },
    /** Build the island containing x,z now (teleports, ferries). */
    ensureIslandAt,
    teleportPlayer,
    get docks() { return L.docks; },
    islandAt: islandOf,
    get islands() { return [...islands.values()].map(S => ({ id: S.id, built: S.built })); },
  };
  const ferries = createFerries(ctx, world);
  world.ferries = ferries;
  world.travel = id => ferries.travel(id);

  // ------------------------------------------------------------------------------------------------
  // Minimap data (marching squares on a coarse land mask per island, cached)
  // ------------------------------------------------------------------------------------------------
  let mm = null;
  function minimap() {
    if (mm) return mm;
    const STEP = 6;
    const outlines = [];
    for (const S of islands.values()) {
      const [x0, z0, x1, z1] = S.box;
      const nx = Math.ceil((x1 - x0) / STEP) + 1, nz = Math.ceil((z1 - z0) / STEP) + 1;
      const v = new Float32Array(nx * nz);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const x = x0 + i * STEP, z = z0 + j * STEP;
        v[j * nx + i] = islandOf(x, z) === S.id || i === 0 || j === 0 ? hf.heightTowns(x, z) : -5;
        if (i === 0 || j === 0 || i === nx - 1 || j === nz - 1) v[j * nx + i] = -5;
      }
      const parts = marching(v, nx, nz, x0, z0, STEP).filter(l => l.length > 6).sort((a, b) => b.length - a.length);
      if (parts.length) outlines.push({ id: S.id, name: S.def.name, outline: parts[0], parts, cx: S.def.lobes[0][0], cz: S.def.lobes[0][1] });
    }
    let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
    for (const o of outlines) for (const [x, z] of o.parts.flat()) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z); }
    mm = {
      bounds: { x0: bx0 - 30, z0: bz0 - 30, x1: bx1 + 30, z1: bz1 + 30, minX: bx0 - 30, minZ: bz0 - 30, maxX: bx1 + 30, maxZ: bz1 + 30 },
      islands: outlines,
      towns: TOWNS.map(id => ({ id, name: AREA[id].name, x: L.towns[id].x, z: L.towns[id].z, island: AREA[id].island })),
      routes: Object.values(L.routes).map(R => ({ id: R.id, name: R.area.name, points: R.poly.pts.filter((_, i) => i % 4 === 0 || i === R.poly.pts.length - 1).map(([x, z]) => [+x.toFixed(1), +z.toFixed(1)]) })),
      ferries: FERRIES.map(f => { const a = L.docks[f.a], b = L.docks[f.b]; return { id: f.id, a: a ? { x: a.endX, z: a.endZ, town: f.a } : null, b: b ? { x: b.endX, z: b.endZ, town: f.b } : null, gate: f.gate || null }; }),
      caves: Object.values(L.caves).map(C => ({ id: C.id, name: AREA[C.id].name, x: C.def.entrance[0], z: C.def.entrance[1] })),
      bridges: L.bridges.map(b => ({ id: b.id, points: [b.pts[0], b.pts[b.pts.length - 1]] })),
    };
    // live: gate state of ferries
    for (const f of mm.ferries) Object.defineProperty(f, 'open', { get: () => !f.gate || canPass(f.gate), enumerable: true });
    return mm;
  }

  // ------------------------------------------------------------------------------------------------
  // Loop
  // ------------------------------------------------------------------------------------------------
  let lightK = -1;
  const indoor = { background: '#2a1e1c', fog: '#2a1e1c', fogNear: 30, fogFar: 80, sun: '#fff1dc', sunIntensity: 1.7, sunDir: { x: 0.25, y: 1, z: 0.55 }, hemiSky: '#fff4e6', hemiGround: '#a88a6a', hemiIntensity: 1.25, hideSky: true };
  function caveLight(cid) {
    const K = pockets.cave?.built?.color || {};
    return { background: '#120c1c', fog: '#140e22', fogNear: 18, fogFar: 60, sun: '#b8a8ff', sunIntensity: 0.9, sunDir: { x: 0.2, y: 1, z: 0.4 }, hemiSky: K.glow || '#8a7ad0', hemiGround: '#2a2040', hemiIntensity: 1.1, hideSky: true, cid };
  }
  function tick(dt, t) {
    WIND.uTime.value = t;
    const L2 = ctx.time.lighting();
    const p = ctx.player?.position || ctx.cameraRig.followed?.position;
    const f = ctx.cameraRig.mode === 'explore' ? (ctx.cameraRig.followPos || p) : ctx.cameraRig.lookTarget;
    // island streaming
    const fx = f?.x ?? 0, fz = f?.z ?? 0;
    const pocket = inPocket(fx, fz);
    if (!pocket) {
      const isl = islandOf(fx, fz);
      if (isl && isl !== current) {
        current = isl;
        const S = islands.get(isl);
        finishJob(S);
        water.setIsland(S.waterTex, S.waterBox);
        water.setTint(isl === 'sole' ? '#3fd6c8' : isl === 'coralline' ? '#5ff0dc' : null, null);
      }
      // progressive build of neighbours, drop far ones
      const t0 = performance.now();
      for (const S of islands.values()) {
        const d = boxDist(S.box, fx, fz);
        if (!S.built && d < NEAR_BUILD) {
          if (!S.job) S.job = islandBuilder(S);
          while (performance.now() - t0 < BUDGET_MS) { const r = S.job.next(); if (r.done) { S.job = null; break; } }
          break;
        }
        if (S.built && d > FAR_DROP && S.id !== current) disposeIsland(S);
      }
    }
    // per-island updates (streamed instancing, wind, pools)
    const lamps = L2.lamps;
    for (const S of islands.values()) {
      if (!S.built) continue;
      S.group.visible = !pocket;
      if (pocket) continue;
      S.veg.update(dt, t); S.grass.update(dt, t);
      if (S.pools) { S.pools.userData.mat.opacity = smoothstep(0.15, 0.9, lamps) * 0.9; S.pools.visible = lamps > 0.12; }
    }
    if (!pocket) { const miss = [...islands.values()].find(S => !S.silhouette && !S.built); if (miss) { miss.silhouette = buildSilhouette(miss); root.add(miss.silhouette); } }
    for (const S of islands.values()) if (S.silhouette) S.silhouette.visible = !S.built && !pocket;
    // lighting
    const inCave = !!pockets.cave && pocket && caveAt(fx, fz);
    sky.setOverride(world.interior ? indoor : inCave ? caveLight() : null);
    sky.update(dt);
    water.object.visible = !pocket;
    if (!pocket) water.update(dt, t);
    if (Math.abs(lamps - lightK) > 0.01 || inCave) { lightK = lamps; mats.setLamps(world.interior ? Math.max(lamps, 0.15) : lamps, inCave); }
    world.lampsOn = L2.lampsOn;
    WIND.uWind.value = 0.85 + Math.sin(t * 0.21) * 0.25;
    // area tracking (4 Hz)
    areaT -= dt;
    if (areaT <= 0) { areaT = 0.25; updateArea(); }
    // beacon
    if (beacon.g.visible && beacon.target) {
      beacon.g.position.set(beacon.target.x, groundY(beacon.target.x, beacon.target.z), beacon.target.z);
      beacon.mat.uniforms.uTime.value = t;
      const k = (t * 0.8) % 1; beacon.ring.scale.setScalar(0.6 + k * 1.6); beacon.ringMat.opacity = 0.7 * (1 - k);
      const pd = p ? Math.hypot(p.x - beacon.target.x, p.z - beacon.target.z) : 99;
      beacon.g.scale.set(1, clamp(pd / 12, 0.25, 1), 1);
    }
  }
  ctx.loop.add(tick, ctx.ORDER.world);

  // ------------------------------------------------------------------------------------------------
  // Start: build the island the player stands on (or Alba) right away
  // ------------------------------------------------------------------------------------------------
  const sp = ctx.save.state.player || {};
  let startX = sp.x ?? 0, startZ = sp.z ?? 0;
  if (sp.interior && L.interiorDoors[sp.interior]) { startX = L.interiorDoors[sp.interior].x; startZ = L.interiorDoors[sp.interior].z; }
  else if (inPocket(startX, startZ)) { const c = caveAt(startX, startZ); const o = c && POIS[`${c}.outside`]; startX = o ? o.x : 0; startZ = o ? o.z : 0; }
  const startIsl = islandOf(startX, startZ) || 'aurora';
  current = startIsl;
  finishJob(islands.get(startIsl));
  const S0 = islands.get(startIsl);
  water.setIsland(S0.waterTex, S0.waterBox);
  sky.update(0); water.update(0, 0);
  ctx.bus.on('game:start', () => {
    const p = ctx.player?.position;
    if (p) {
      if (!inPocket(p.x, p.z)) ensureIslandAt(p.x, p.z);
      else if (ctx.save.state.player?.interior && !interiorAt(p.x, p.z)) { /* stale */ }
      ctx.player.object && (ctx.player.object.position.y = groundY(p.x, p.z));
    }
    world.area = null; updateArea(true);
  });
  ctx.bus.on('quality:change', () => { for (const S of islands.values()) if (S.built) { S.veg.refresh(); S.grass.refresh(); } });

  ctx.debug?.register?.('world', () => world);
  ctx.debug?.register?.('islands', () => [...islands.values()].map(S => ({ id: S.id, built: S.built })));
  return world;
}

// ---- marching squares → closed loops of [x, z] --------------------------------------------------
function marching(v, nx, nz, x0, z0, S) {
  const segs = [];
  const lerpP = (ax, az, va, bx, bz, vb) => { const t = va / (va - vb); return [ax + (bx - ax) * t, az + (bz - az) * t]; };
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const x = x0 + i * S, z = z0 + j * S;
    const a = v[j * nx + i], b = v[j * nx + i + 1], c = v[(j + 1) * nx + i + 1], d = v[(j + 1) * nx + i];
    const code = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
    if (code === 0 || code === 15) continue;
    const T = () => lerpP(x, z, a, x + S, z, b), Rr = () => lerpP(x + S, z, b, x + S, z + S, c), B = () => lerpP(x + S, z + S, c, x, z + S, d), Lf = () => lerpP(x, z + S, d, x, z, a);
    const E = { 1: [[Lf, T]], 2: [[T, Rr]], 3: [[Lf, Rr]], 4: [[Rr, B]], 5: [[Lf, T], [Rr, B]], 6: [[T, B]], 7: [[Lf, B]], 8: [[B, Lf]], 9: [[B, T]], 10: [[T, Rr], [B, Lf]], 11: [[B, Rr]], 12: [[Rr, Lf]], 13: [[Rr, T]], 14: [[T, Lf]] }[code];
    for (const [p, q2] of E) segs.push([p(), q2()]);
  }
  const key = p => Math.round(p[0] * 20) + ',' + Math.round(p[1] * 20);
  const byKey = new Map();
  segs.forEach((sg, i) => { for (const e of [0, 1]) { const k = key(sg[e]); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(i); } });
  const used = new Uint8Array(segs.length);
  const loops = [];
  for (let i0 = 0; i0 < segs.length; i0++) {
    if (used[i0]) continue;
    used[i0] = 1;
    const loop = [segs[i0][0]];
    let cur = segs[i0][1], guard = 0;
    while (guard++ < 200000) {
      loop.push(cur);
      const l = byKey.get(key(cur)) || [];
      let next = -1;
      for (const k of l) if (!used[k]) { next = k; break; }
      if (next < 0) break;
      used[next] = 1;
      const sg = segs[next];
      cur = key(sg[0]) === key(cur) ? sg[1] : sg[0];
    }
    loops.push(loop.filter((_, i) => i % 2 === 0).map(([x, z]) => [+x.toFixed(1), +z.toFixed(1)]));
  }
  return loops;
}

export { OCC, inRect, segDist };
