// Story-owned 3D props, all procedural toon (Sun/Moon look: chunky rounded shapes, saturated colours,
// outlines on key props): treasure chests, gift/throwable objects, race rings, job markers, parcel and
// cash box, the Eclissi camp, paint balls and splats, dizzy stars, sparkle bursts, the starter stand.
// Each builder returns a THREE.Object3D; animated ones expose userData.update(dt, t) and are ticked by
// the story's `animate` set (story/index.js).
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function mesh(geo, mat, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = opts.cast ?? true; m.receiveShadow = opts.receive ?? false;
  if (opts.rx) m.rotation.x = opts.rx; if (opts.ry) m.rotation.y = opts.ry; if (opts.rz) m.rotation.z = opts.rz;
  if (opts.s) m.scale.setScalar(opts.s);
  return m;
}

/** A rounded 5-point star (bevelled extrusion), centred. */
export function starGeometry(r = 0.12, depth = 0.05) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? r * 0.48 : r;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i) s.lineTo(x, y); else s.moveTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.5, bevelSize: r * 0.12, bevelSegments: 2 });
  g.center(); g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- chest
export function buildChest(ctx, { gold = false } = {}) {
  const { toon, kit } = ctx;
  const wood = toon.mat(gold ? '#c0392b' : '#b97b47', { rim: 0.2 }), band = toon.mat('#ffd23f', { rim: 0.4 }), dark = toon.mat('#6b4426');
  const g = new THREE.Group(); g.name = 'chest';
  const body = mesh(kit.roundedBox(0.9, 0.5, 0.6, 0.08, 2), wood, 0, 0.25, 0);
  const inner = mesh(new THREE.BoxGeometry(0.78, 0.04, 0.48), dark, 0, 0.49, 0, { cast: false });
  g.add(body, inner);
  for (const x of [-0.3, 0.3]) g.add(mesh(kit.roundedBox(0.1, 0.52, 0.64, 0.03, 1), band, x, 0.25, 0));
  // lid on a hinge at the back edge
  const hinge = new THREE.Group(); hinge.position.set(0, 0.5, -0.3); g.add(hinge);
  const lidGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 18, 1, false, 0, Math.PI); lidGeo.rotateZ(Math.PI / 2);
  const lid = mesh(lidGeo, wood, 0, 0, 0.3); lid.scale.set(1, 0.75, 1); hinge.add(lid);
  for (const x of [-0.3, 0.3]) { const bg = new THREE.CylinderGeometry(0.315, 0.315, 0.1, 18, 1, false, 0, Math.PI); bg.rotateZ(Math.PI / 2); const b = mesh(bg, band, x, 0, 0.3); b.scale.set(1, 0.75, 1); hinge.add(b); }
  const lock = mesh(kit.roundedBox(0.16, 0.2, 0.08, 0.03, 1), band, 0, 0.43, 0.31);
  g.add(lock);
  // treasure glow inside (shown when opening)
  const glow = mesh(new THREE.SphereGeometry(0.22, 16, 10), toon.glow('#ffe27a', 1.6), 0, 0.48, 0, { cast: false });
  glow.scale.set(1.5, 0.35, 1); glow.visible = false; g.add(glow);
  toon.outline(g, { width: 0.018, skip: m => m === glow || m === inner });
  g.userData.setOpen = k => { hinge.rotation.x = -k * 1.9; glow.visible = k > 0.05; glow.scale.set(1.5 * k, 0.35 + k * 0.3, k); lock.visible = k < 0.3; };
  g.userData.setOpen(0);
  return g;
}

// ---------------------------------------------------------------- gifts / throwables
export function buildGift(ctx, kind) {
  const { toon, kit } = ctx;
  const g = new THREE.Group(); g.name = 'gift:' + kind;
  let r = 0.15;
  switch (kind) {
    case 'mela': {
      g.add(mesh(new THREE.SphereGeometry(0.11, 16, 12), toon.mat('#e8443a', { rim: 0.3 }), 0, 0.11, 0));
      g.children[0].scale.set(1, 0.9, 1);
      g.add(mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.06, 6), toon.mat('#6b4426'), 0, 0.23, 0));
      const leaf = mesh(new THREE.SphereGeometry(0.035, 8, 6), toon.mat('#7dcb4c'), 0.03, 0.24, 0); leaf.scale.set(1.4, 0.4, 0.8); g.add(leaf);
      r = 0.11; break;
    }
    case 'vasofiori': {
      const potGeo = new THREE.CylinderGeometry(0.17, 0.12, 0.26, 16); g.add(mesh(potGeo, toon.mat('#e8674a'), 0, 0.13, 0));
      g.add(mesh(new THREE.TorusGeometry(0.17, 0.03, 8, 18), toon.mat('#c9503a'), 0, 0.26, 0, { rx: Math.PI / 2 }));
      g.add(mesh(new THREE.SphereGeometry(0.14, 12, 8), toon.mat('#3f9e3a'), 0, 0.3, 0));
      const cols = ['#ff5f9e', '#ffd23f', '#ffffff', '#9b7fd1', '#ff5f9e'];
      cols.forEach((c, i) => { const a = (i / cols.length) * Math.PI * 2; const f = mesh(new THREE.SphereGeometry(0.06, 10, 8), toon.mat(c, { rim: 0.3 }), Math.cos(a) * 0.1, 0.38 + (i % 2) * 0.05, Math.sin(a) * 0.1); f.scale.y = 0.7; g.add(f); g.add(mesh(new THREE.SphereGeometry(0.022, 6, 4), toon.mat('#ffd23f'), Math.cos(a) * 0.1, 0.42 + (i % 2) * 0.05, Math.sin(a) * 0.1, { cast: false })); });
      r = 0.2; break;
    }
    case 'palla': {
      g.add(mesh(new THREE.SphereGeometry(0.16, 18, 14), toon.mat('#ffd23f', { rim: 0.3 }), 0, 0.16, 0));
      g.add(mesh(new THREE.TorusGeometry(0.161, 0.022, 6, 24), toon.mat('#e8674a'), 0, 0.16, 0));
      g.add(mesh(new THREE.TorusGeometry(0.161, 0.022, 6, 24), toon.mat('#2fa8a0'), 0, 0.16, 0, { ry: Math.PI / 2 }));
      r = 0.16; break;
    }
    case 'libro': {
      g.add(mesh(kit.roundedBox(0.24, 0.07, 0.32, 0.02, 1), toon.mat('#5b7fe0'), 0, 0.035, 0));
      g.add(mesh(new THREE.BoxGeometry(0.21, 0.05, 0.3), toon.mat('#fff2d8'), 0.016, 0.035, 0, { cast: false }));
      g.add(mesh(new THREE.BoxGeometry(0.03, 0.073, 0.322), toon.mat('#ffd23f'), -0.105, 0.035, 0, { cast: false }));
      r = 0.14; break;
    }
    case 'cassa': default: {
      const wood = toon.mat('#c58a52'), slat = toon.mat('#8a5a32');
      g.add(mesh(kit.roundedBox(0.55, 0.5, 0.55, 0.04, 1), wood, 0, 0.25, 0));
      for (const y of [0.08, 0.42]) g.add(mesh(new THREE.BoxGeometry(0.57, 0.06, 0.57), slat, 0, y, 0));
      const x1 = mesh(new THREE.BoxGeometry(0.05, 0.6, 0.02), slat, 0, 0.25, 0.285, { rz: 0.72 }); g.add(x1);
      r = 0.3; break;
    }
  }
  toon.outline(g, { width: 0.012 });
  g.userData.radius = r;
  return g;
}

// ---------------------------------------------------------------- scenery bits
export function buildHat(ctx) {
  const { toon } = ctx;
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.03, 24), toon.mat('#f6dfa0'), 0, 0.02, 0));
  g.add(mesh(new THREE.SphereGeometry(0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon.mat('#f6dfa0'), 0, 0.03, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.05, 20, 1, true), toon.mat('#ff5f9e'), 0, 0.06, 0));
  toon.outline(g, { width: 0.012 });
  return g;
}

/** Glowing race ring (vertical torus) with a soft inner disc. */
export function buildRing(ctx, color = '#3ad1ff') {
  const { toon } = ctx;
  const g = new THREE.Group(); g.name = 'race-ring';
  const ring = mesh(new THREE.TorusGeometry(2.1, 0.22, 12, 40), toon.glow(color, 1.1), 0, 2.4, 0, { cast: false });
  const halo = mesh(new THREE.TorusGeometry(2.1, 0.42, 8, 40), toon.mat(color, { transparent: true, opacity: 0.25, emissive: color, emissiveIntensity: 0.6 }), 0, 2.4, 0, { cast: false });
  const disc = mesh(new THREE.CircleGeometry(1.9, 32), toon.mat(color, { transparent: true, opacity: 0.12, emissive: color, emissiveIntensity: 0.5, side: THREE.DoubleSide }), 0, 2.4, 0, { cast: false });
  for (const m of [halo, disc]) { m.material.depthWrite = false; m.renderOrder = 2; }
  g.add(ring, halo, disc);
  const stars = [];
  for (let i = 0; i < 6; i++) { const s = mesh(starGeometry(0.16, 0.04), toon.glow('#ffffff', 1.2), 0, 2.4, 0, { cast: false }); stars.push(s); g.add(s); }
  g.userData.update = (dt, t) => {
    const k = 1 + Math.sin(t * 4) * 0.04; ring.scale.setScalar(k); halo.scale.setScalar(k * (1 + Math.sin(t * 2) * 0.05));
    stars.forEach((s, i) => { const a = t * 1.4 + (i / stars.length) * Math.PI * 2; s.position.set(Math.cos(a) * 2.1, 2.4 + Math.sin(a) * 2.1, 0); s.rotation.z = t * 3 + i; });
  };
  return g;
}

/** Ground marker + light column for job targets (delivery contact, stall, ring direction). */
export function buildJobMarker(ctx, color = '#ffd23f') {
  const { toon } = ctx;
  const g = new THREE.Group(); g.name = 'job-marker';
  const col = mesh(new THREE.CylinderGeometry(0.55, 0.9, 14, 20, 1, true), toon.mat(color, { transparent: true, opacity: 0.22, emissive: color, emissiveIntensity: 0.9, side: THREE.DoubleSide }), 0, 7, 0, { cast: false });
  col.material.depthWrite = false; col.renderOrder = 3;
  const ring = mesh(new THREE.TorusGeometry(1.1, 0.07, 6, 36), toon.glow(color, 1.3), 0, 0.06, 0, { rx: Math.PI / 2, cast: false });
  const arrow = new THREE.Group();
  const cone = mesh(new THREE.ConeGeometry(0.32, 0.5, 4), toon.glow(color, 1.1), 0, 0, 0, { rx: Math.PI, cast: false });
  arrow.add(cone); arrow.position.y = 2.8; g.add(col, ring, arrow);
  g.userData.update = (dt, t) => { arrow.position.y = 2.8 + Math.sin(t * 3) * 0.25; arrow.rotation.y = t * 1.5; ring.scale.setScalar(1 + (t * 0.8 % 1) * 0.35); ring.material.opacity = 1; };
  return g;
}

export function buildParcel(ctx) {
  const { toon, kit } = ctx;
  const g = new THREE.Group();
  g.add(mesh(kit.roundedBox(0.46, 0.36, 0.34, 0.04, 1), toon.mat('#c58a52'), 0, 0, 0));
  g.add(mesh(new THREE.BoxGeometry(0.47, 0.37, 0.06), toon.mat('#e8674a'), 0, 0, 0, { cast: false }));
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.37, 0.35), toon.mat('#e8674a'), 0, 0, 0, { cast: false }));
  toon.outline(g, { width: 0.012 });
  return g;
}

export function buildCashBox(ctx) {
  const { toon, kit } = ctx;
  const g = new THREE.Group();
  g.add(mesh(kit.roundedBox(0.42, 0.26, 0.3, 0.04, 1), toon.mat('#3d7a6a', { rim: 0.3 }), 0, 0.13, 0));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.08, 0.02), toon.mat('#ffd23f'), 0, 0.17, 0.155));
  const coin = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 14), toon.glow('#ffd23f', 0.5), 0.08, 0.28, 0, { rx: 0.3 });
  g.add(coin);
  toon.outline(g, { width: 0.012 });
  return g;
}

/** The Eclissi outpost on Percorso 1: two purple tents, a crackling campfire, crates and a banner. */
export function buildCamp(ctx) {
  const { toon, kit } = ctx;
  const g = new THREE.Group(); g.name = 'eclissi-camp';
  const purple = toon.mat('#5a2a8a', { rim: 0.2 }), dark = toon.mat('#2a2140'), gold = toon.mat('#ffd23f'), wood = toon.mat('#8a5a32');
  const tent = (x, z, ry, s = 1) => {
    const t = new THREE.Group(); t.position.set(x, 0, z); t.rotation.y = ry; t.scale.setScalar(s);
    const geo = new THREE.ConeGeometry(1.6, 2.2, 4, 1); geo.rotateY(Math.PI / 4); geo.scale(1, 1, 1.25);
    t.add(mesh(geo, purple, 0, 1.1, 0));
    t.add(mesh(new THREE.BoxGeometry(0.9, 1.1, 0.05), dark, 0, 0.55, 1.13, { rx: -0.33 }));
    t.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), wood, 0, 2.4, 0));
    const flag = mesh(new THREE.BoxGeometry(0.4, 0.26, 0.02), gold, 0.2, 2.55, 0); t.add(flag);
    return t;
  };
  g.add(tent(-2.4, -1.2, 0.5), tent(2.6, -1.6, -0.4, 0.9));
  // banner with the Eclissi emblem (a dark sun eclipsed by a crescent)
  const banner = new THREE.Group(); banner.position.set(0, 0, -3.2);
  for (const x of [-0.9, 0.9]) banner.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 8), wood, x, 1.5, 0));
  banner.add(mesh(new THREE.BoxGeometry(1.8, 1.4, 0.05), purple, 0, 2.2, 0));
  banner.add(mesh(new THREE.CircleGeometry(0.45, 24), gold, 0, 2.25, 0.03, { cast: false }));
  banner.add(mesh(new THREE.CircleGeometry(0.4, 24), dark, 0.16, 2.3, 0.04, { cast: false }));
  g.add(banner);
  for (const [x, z, r] of [[-3.6, 1.2, 0.3], [-3.0, 1.8, 0.9], [3.8, 0.8, 0.2]]) g.add(mesh(kit.roundedBox(0.7, 0.7, 0.7, 0.05, 1), toon.mat('#b07a48'), x, 0.35, z, { ry: r }));
  // campfire
  const fire = new THREE.Group(); fire.position.set(0, 0, 0.8);
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; fire.add(mesh(new THREE.DodecahedronGeometry(0.16, 0), toon.mat('#9a8a7a'), Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55)); }
  for (let i = 0; i < 3; i++) fire.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 6), wood, 0, 0.12, 0, { rz: Math.PI / 2, ry: (i / 3) * Math.PI }));
  const flames = [];
  [['#ff7a2a', 0.32, 0.7], ['#ffb347', 0.22, 0.55], ['#fff3a0', 0.12, 0.38]].forEach(([c, r, h], i) => {
    const f = mesh(new THREE.ConeGeometry(r, h, 10), toon.glow(c, 1.6), 0, 0.2 + h / 2, 0, { cast: false }); f.userData.base = h; flames.push(f); fire.add(f); void i;
  });
  g.add(fire);
  const light = new THREE.PointLight('#ff9a4d', 0, 9, 1.8); light.position.set(0, 1.2, 0.8); g.add(light);
  toon.outline(g, { width: 0.02, skip: m => flames.includes(m) });
  g.userData.update = (dt, t) => {
    flames.forEach((f, i) => { const k = 1 + Math.sin(t * (9 + i * 3) + i) * 0.12 + Math.sin(t * 23 + i) * 0.05; f.scale.set(1 - (k - 1) * 0.6, k, 1 - (k - 1) * 0.6); f.rotation.y = t * (1 + i); });
    light.intensity = (ctx.time?.isNight || ctx.time?.phase === 'sunset' ? 6 : 1.5) * (1 + Math.sin(t * 13) * 0.15);
  };
  return g;
}

/** Dizzy stars that circle over a stunned guard's head. */
export function buildDizzy(ctx) {
  const { toon } = ctx;
  const g = new THREE.Group(); g.name = 'dizzy';
  const stars = [0, 1, 2].map(i => { const s = mesh(starGeometry(0.11, 0.04), toon.glow('#ffd23f', 0.9), 0, 0, 0, { cast: false }); g.add(s); return s; });
  g.userData.update = (dt, t) => stars.forEach((s, i) => { const a = t * 4 + (i / 3) * Math.PI * 2; s.position.set(Math.cos(a) * 0.38, Math.sin(t * 6 + i) * 0.05, Math.sin(a) * 0.38); s.rotation.y = -a; });
  return g;
}

const PAINT = ['#ff3d9a', '#3ad1ff', '#7cfc4a', '#ffd23f', '#a46bff'];
export function paintColor() { return PAINT[Math.floor(Math.random() * PAINT.length)]; }
export function buildPaintBall(ctx, color) {
  const m = mesh(new THREE.SphereGeometry(0.13, 12, 10), ctx.toon.mat(color, { emissive: color, emissiveIntensity: 0.35, rim: 0.4 }), 0, 0, 0, { cast: false });
  return m;
}
/** Paint splats stuck on a character (children of its object). */
export function buildSplat(ctx, color) {
  const g = new THREE.Group(); g.name = 'paint-splat';
  const mat = ctx.toon.mat(color, { emissive: color, emissiveIntensity: 0.15 });
  for (let i = 0; i < 6; i++) {
    const s = mesh(new THREE.SphereGeometry(0.07 + Math.random() * 0.06, 8, 6), mat, (Math.random() - 0.5) * 0.4, 0.8 + Math.random() * 0.8, 0.16 + Math.random() * 0.05, { cast: false });
    s.scale.z = 0.35; g.add(s);
  }
  return g;
}

/** A burst of little stars/diamonds (chest open, heal, ring passed). Self-removing. */
export function buildBurst(ctx, color = '#ffe27a', { count = 14, speed = 3.2, life = 0.9, size = 0.09 } = {}) {
  const g = new THREE.Group(); g.name = 'burst';
  const geo = starGeometry(size, size * 0.4), mat = ctx.toon.glow(color, 1.4);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const s = new THREE.Mesh(geo, mat);
    const a = Math.random() * Math.PI * 2, up = 0.5 + Math.random();
    s.userData.v = V(Math.cos(a) * speed * (0.4 + Math.random() * 0.6), up * speed, Math.sin(a) * speed * (0.4 + Math.random() * 0.6));
    parts.push(s); g.add(s);
  }
  let age = 0;
  g.userData.update = dt => {
    age += dt;
    const k = Math.min(1, age / life);
    for (const s of parts) { s.userData.v.y -= 9 * dt; s.position.addScaledVector(s.userData.v, dt); s.rotation.z += dt * 8; s.scale.setScalar(1 - k * k); }
    if (k >= 1) { g.removeFromParent(); g.userData.dead = true; }
  };
  return g;
}

/** Rounded wooden stand with three cushions (the starter presentation in the lab). */
export function buildStarterStand(ctx) {
  const { toon, kit } = ctx;
  const g = new THREE.Group(); g.name = 'starter-stand';
  g.add(mesh(kit.roundedBox(2.2, 0.12, 0.8, 0.05, 2), toon.mat('#b97b47'), 0, 0.9, 0));
  for (const x of [-1, 1]) for (const z of [-0.3, 0.3]) g.add(mesh(kit.capsule(0.05, 0.75, 4, 8), toon.mat('#8a5a32'), x, 0.45, z));
  const cush = ['#7ac74c', '#ee8130', '#6390f0'];
  cush.forEach((c, i) => g.add(mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.08, 20), toon.mat(c, { rim: 0.3 }), (i - 1) * 0.7, 1.0, 0)));
  toon.outline(g, { width: 0.015 });
  g.userData.slots = [-0.7, 0, 0.7].map(x => V(x, 1.04, 0));
  return g;
}

/** Fallback Sfera when the creatures area has no sphere model: red/white toon ball with a button. */
export function buildBall(ctx, kind = 'sfera') {
  const { toon } = ctx;
  const g = new THREE.Group();
  const top = new THREE.SphereGeometry(0.12, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), bot = new THREE.SphereGeometry(0.12, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  g.add(mesh(top, toon.mat(kind === 'megasfera' ? '#2f5fd8' : '#e8443a', { rim: 0.3 }), 0, 0.12, 0), mesh(bot, toon.mat('#ffffff'), 0, 0.12, 0));
  g.add(mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 24), toon.mat('#2a2140'), 0, 0.12, 0, { rx: Math.PI / 2 }));
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12), toon.mat('#ffffff'), 0, 0.12, 0.118, { rx: Math.PI / 2 }));
  toon.outline(g, { width: 0.008 });
  return g;
}

/** Simple aura disc under the legendary (warm, pulsing). */
export function buildAura(ctx, color = '#ffb347') {
  const g = new THREE.Group();
  const d = mesh(new THREE.RingGeometry(0.9, 2.2, 40), ctx.toon.mat(color, { transparent: true, opacity: 0.35, emissive: color, emissiveIntensity: 1, side: THREE.DoubleSide }), 0, 0.05, 0, { rx: -Math.PI / 2, cast: false });
  d.material.depthWrite = false;
  g.add(d);
  g.userData.update = (dt, t) => { d.scale.setScalar(1 + Math.sin(t * 2) * 0.08); d.rotation.z = t * 0.3; };
  return g;
}
