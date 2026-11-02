// Battle effects: a tiny instanced particle engine (one InstancedMesh per shape, ≤ 8 draw calls while active,
// hidden when idle) and one recipe per Velmon type: flames, water jets, leaves, sparks + bolts, frost shards,
// falling rocks, ground spikes, wind rings, bug swarms, ghost wisps, impact stars. Plus non-move effects for
// the battle (hit, dust, sphere release/absorb, catch stars, level-up, evolution).
// play(kind, from, to) → Promise that resolves at the moment of impact (the hit is timed on it); leftover
// particles keep animating. from/to: Object3D (aimed at its centre) or {x,y,z}.
import * as THREE from 'three';
import { G } from '../creatures/geo.js';

const CAP = 220;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Type → recipe name. */
const BY_TYPE = {
  Fuoco: 'fire', Acqua: 'water', Erba: 'leaves', Elettro: 'spark', Ghiaccio: 'frost', Roccia: 'rocks',
  Terra: 'quake', Volante: 'wind', Coleottero: 'bugs', Spettro: 'ghost', Normale: 'impact',
};

export function createFx(ctx) {
  const scene = ctx.scene;
  const root = new THREE.Group(); root.name = 'battle-fx';
  const toonMat = c => { const m = ctx.toon.mat(c).clone(); return m; };
  const basic = () => new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false, toneMapped: false });
  const flameGeo = G.tear(2.2, 10); flameGeo.scale(0.5, 0.5, 0.5);
  const leafGeo = G.tear(2.4, 8); leafGeo.scale(0.5, 0.5, 0.14);
  const shapes = {
    orb: [new THREE.IcosahedronGeometry(0.5, 1), basic()],
    flame: [flameGeo, basic()],
    star: [G.star(0.5, 0.45, 0.18), basic()],
    ring: [new THREE.TorusGeometry(0.5, 0.06, 6, 28).rotateX(Math.PI / 2), basic()],
    leaf: [leafGeo, toonMat('#ffffff')],
    shard: [new THREE.OctahedronGeometry(0.5, 0).scale(0.45, 1, 0.45), toonMat('#ffffff')],
    rock: [new THREE.DodecahedronGeometry(0.5, 0), toonMat('#ffffff')],
    bolt: [new THREE.BoxGeometry(0.5, 1, 0.5), basic()],
  };
  const pools = {};
  for (const [k, [geo, mat]] of Object.entries(shapes)) {
    const mesh = new THREE.InstancedMesh(geo, mat, CAP);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, _c.set('#ffffff'));
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 4;
    mesh.name = 'fx-' + k;
    root.add(mesh);
    pools[k] = { mesh, list: [] };
  }

  /**
   * Spawn one particle. o: {p, v, g=0, drag=0, life=1, delay=0, s0=0.1, s1=0, sx/sy/sz shape factors, c0, c1,
   * rot:[x,y,z], spin:[x,y,z], align (orient +Y along velocity), stretch (y scale by speed), home:{to, k} (steer)}
   */
  function spawn(shape, o) {
    const P = pools[shape]; if (!P || P.list.length >= CAP) return null;
    const p = {
      p: new THREE.Vector3().copy(o.p), v: new THREE.Vector3().copy(o.v || _v.set(0, 0, 0)), g: o.g || 0, drag: o.drag || 0,
      life: o.life || 1, age: -(o.delay || 0), s0: o.s0 ?? 0.1, s1: o.s1 ?? 0, sx: o.sx ?? 1, sy: o.sy ?? 1, sz: o.sz ?? 1,
      c0: new THREE.Color(o.c0 || '#ffffff'), c1: new THREE.Color(o.c1 || o.c0 || '#ffffff'),
      rot: new THREE.Euler(...(o.rot || (shape === 'ring' ? [0, 0, 0] : [rnd(0, 6), rnd(0, 6), rnd(0, 6)]))), spin: o.spin || [0, 0, 0],
      align: !!o.align, flip: !!o.flip, stretch: o.stretch || 0, home: o.home || null, ease: o.ease || 'out', wob: o.wob || 0, seed: Math.random() * 10,
    };
    P.list.push(p);
    return p;
  }

  function update(dt) {
    let any = false;
    for (const k in pools) {
      const P = pools[k], L = P.list, mesh = P.mesh;
      let n = 0;
      for (let i = 0; i < L.length; i++) {
        const p = L[i];
        p.age += dt;
        if (p.age < 0) { L[n++] = p; continue; }
        if (p.age >= p.life) continue;
        const t = p.age / p.life;
        if (p.home) {
          _v.copy(p.home.to).sub(p.p);
          const want = _v.multiplyScalar(p.home.k);
          p.v.lerp(want, 1 - Math.exp(-(p.home.turn ?? 6) * dt));
        }
        p.v.y -= p.g * dt;
        if (p.drag) p.v.multiplyScalar(Math.exp(-p.drag * dt));
        p.p.addScaledVector(p.v, dt);
        if (p.wob) p.p.y += Math.sin(p.age * 18 + p.seed) * p.wob * dt;
        p.rot.x += p.spin[0] * dt; p.rot.y += p.spin[1] * dt; p.rot.z += p.spin[2] * dt;
        L[n++] = p;
      }
      L.length = n;
      // write instances (only those born)
      let w = 0;
      for (let i = 0; i < n; i++) {
        const p = L[i];
        if (p.age < 0) continue;
        const t = clamp01(p.age / p.life);
        const e = p.ease === 'pop' ? Math.sin(Math.min(1, t * 1.15) * Math.PI) : p.ease === 'in' ? t * t : 1 - (1 - t) * (1 - t);
        const sc = p.ease === 'pop' ? p.s0 * e + p.s1 * t : p.s0 + (p.s1 - p.s0) * e;
        if (p.align && p.v.lengthSq() > 1e-6) { _v.copy(p.v).normalize(); if (p.flip) _v.negate(); _q.setFromUnitVectors(UP, _v).multiply(_tmpQ.setFromAxisAngle(UP, p.rot.y)); }
        else _q.setFromEuler(p.rot);
        const st = 1 + p.stretch * p.v.length();
        _s.set(sc * p.sx, sc * p.sy * st, sc * p.sz);
        _m.compose(p.p, _q, _s);
        mesh.setMatrixAt(w, _m);
        mesh.setColorAt(w, _c.copy(p.c0).lerp(p.c1, t));
        w++;
      }
      mesh.count = w;
      mesh.visible = w > 0;
      if (w) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; any = true; }
    }
    if (any && !root.parent) scene.add(root);
  }
  const _tmpQ = new THREE.Quaternion();
  ctx.loop.add(function battleFx(dt) { update(dt); }, ctx.ORDER?.actors ?? 20);

  // ---- helpers -------------------------------------------------------------------------------
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  /** Centre of an Object3D (by userData.height) or a plain point. */
  function centre(o, out = new THREE.Vector3(), k = 0.5) {
    if (!o) return out.set(0, 0, 0);
    if (o.isObject3D) {
      o.getWorldPosition(out);
      const h = o.userData?.height ?? 0.8;
      out.y += h * k * (o.scale?.y ?? 1);
      return out;
    }
    return out.set(o.x || 0, o.y || 0, o.z || 0);
  }
  function sizeOf(o) { return o?.isObject3D ? (o.userData?.height ?? 0.8) : 0.8; }
  /** Loop-time wait (works with headless step()). */
  function wait(sec) {
    return new Promise(resolve => {
      let t = 0;
      const off = ctx.loop.add(function fxWait(dt) { t += dt; if (t >= sec) { off(); resolve(); } }, -1);
    });
  }
  const frame = (from, to) => {
    const a = centre(from, new THREE.Vector3(), 0.55), b = centre(to, new THREE.Vector3(), 0.5);
    const d = new THREE.Vector3().subVectors(b, a); const dist = d.length() || 1; d.divideScalar(dist);
    const side = new THREE.Vector3(-d.z, 0, d.x).normalize();
    return { a, b, d, dist, side, h: sizeOf(to) };
  };

  // ---- recipes -------------------------------------------------------------------------------
  const R = {
    /** generic impact: star pop + orbs */
    hit(from, to, { big = false, color = '#fff6b0' } = {}) {
      const b = centre(to, new THREE.Vector3(), 0.5);
      const n = big ? 9 : 6;
      spawn('star', { p: b, life: 0.32, s0: big ? 0.55 : 0.38, s1: 0.1, ease: 'pop', c0: '#ffffff', c1: color, rot: [0, 0, rnd(0, 6)], spin: [0, 0, 6] });
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        spawn('orb', { p: b, v: new THREE.Vector3(Math.cos(a) * 3.2, Math.sin(a) * 2.6 + 0.6, rnd(-1, 1)), drag: 5, life: 0.35, s0: 0.12, s1: 0, c0: '#ffffff', c1: color });
      }
      spawn('ring', { p: b, life: 0.3, s0: 0.2, s1: big ? 1.6 : 1.1, c0: '#ffffff', c1: color, rot: [rnd(-0.3, 0.3), 0, rnd(-0.3, 0.3)] });
      return Promise.resolve();
    },
    impact(from, to) { return R.hit(from, to, { big: true, color: '#ffe066' }); },
    dust(from, to, { n = 10, color = '#e8d8b8', r = 0.5 } = {}) {
      const b = centre(to || from, new THREE.Vector3(), 0);
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2);
        spawn('orb', { p: tmpA.set(b.x + Math.cos(a) * r * 0.4, b.y + 0.05, b.z + Math.sin(a) * r * 0.4), v: new THREE.Vector3(Math.cos(a) * rnd(0.8, 1.8), rnd(0.3, 0.9), Math.sin(a) * rnd(0.8, 1.8)), drag: 2.5, life: rnd(0.5, 0.8), s0: rnd(0.12, 0.2), s1: 0.02, c0: color, c1: '#fffaf0', ease: 'pop' });
      }
      return Promise.resolve();
    },
    async fire(from, to) {
      const F = frame(from, to); const T = 0.42;
      for (let i = 0; i < 34; i++) {
        const delay = (i / 34) * 0.32;
        const spread = new THREE.Vector3(rnd(-0.5, 0.5), rnd(-0.25, 0.45), rnd(-0.5, 0.5));
        const core = i % 3 === 0;
        spawn('flame', { p: F.a, v: F.d.clone().multiplyScalar(F.dist / T).add(spread), delay, life: T + 0.06, s0: core ? 0.12 : 0.18, s1: core ? 0.16 : rnd(0.28, 0.36), sx: 0.75, sz: 0.75, sy: 1.25, c0: core ? '#ffffff' : '#ffe46b', c1: core ? '#ffd23f' : '#ff4a12', align: true, flip: true, stretch: 0.025, ease: 'out', rot: [0, rnd(0, 6), 0] });
      }
      await wait(T + 0.12);
      for (let i = 0; i < 20; i++) spawn('flame', { p: tmpA.copy(F.b).add(tmpB.set(rnd(-0.35, 0.35), rnd(-0.45, 0.05), rnd(-0.35, 0.35))), v: new THREE.Vector3(rnd(-0.6, 0.6), rnd(1.4, 2.8), rnd(-0.6, 0.6)), drag: 1.2, life: rnd(0.45, 0.75), s0: rnd(0.26, 0.4), s1: 0.02, sx: 0.7, sz: 0.7, sy: 1.3, c0: i % 4 ? '#ffd86b' : '#ffffff', c1: '#ff3d10', align: true, ease: 'in', rot: [0, rnd(0, 6), 0] });
      spawn('ring', { p: F.b, life: 0.35, s0: 0.3, s1: 1.8, c0: '#ffd36b', c1: '#ff6a1a' });
    },
    async water(from, to) {
      const F = frame(from, to); const T = 0.38;
      for (let i = 0; i < 24; i++) {
        const delay = (i / 24) * 0.3;
        spawn('orb', { p: F.a, v: F.d.clone().multiplyScalar(F.dist / T).add(new THREE.Vector3(rnd(-0.25, 0.25), rnd(0.2, 0.9), rnd(-0.25, 0.25))), g: 3.5, delay, life: T, s0: rnd(0.12, 0.2), s1: rnd(0.08, 0.14), c0: '#e8fbff', c1: '#4aa8ff', align: true, stretch: 0.12, sx: 0.8, sz: 0.8 });
      }
      await wait(T + 0.08);
      for (let i = 0; i < 20; i++) {
        const a = rnd(0, Math.PI * 2), sp = rnd(1.2, 2.6);
        spawn('orb', { p: F.b, v: new THREE.Vector3(Math.cos(a) * sp, rnd(2.2, 4), Math.sin(a) * sp), g: 9, life: rnd(0.55, 0.8), s0: rnd(0.08, 0.14), s1: 0.03, c0: '#ffffff', c1: '#5ab8ff', align: true, stretch: 0.06 });
      }
      spawn('ring', { p: tmpA.copy(F.b).setY(F.b.y - F.h * 0.4), life: 0.45, s0: 0.3, s1: 2.0, c0: '#ffffff', c1: '#6ccaff' });
    },
    async leaves(from, to) {
      const F = frame(from, to); const T = 0.6;
      for (let i = 0; i < 14; i++) {
        const s = i % 2 ? 1 : -1;
        spawn('leaf', { p: F.a, v: F.side.clone().multiplyScalar(s * rnd(2, 3.5)).add(new THREE.Vector3(0, rnd(0.5, 2), 0)).addScaledVector(F.d, 1.5), home: { to: F.b, k: 7, turn: 4.5 }, delay: i * 0.035, life: T + 0.15, s0: 0.3, s1: 0.22, c0: i % 3 ? '#8fdc4a' : '#c8f07a', c1: '#4fae3a', spin: [rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)] });
      }
      await wait(T);
      for (let i = 0; i < 10; i++) spawn('leaf', { p: F.b, v: new THREE.Vector3(rnd(-2.5, 2.5), rnd(0.5, 3), rnd(-2.5, 2.5)), g: 4, drag: 1.5, life: rnd(0.6, 0.9), s0: 0.24, s1: 0.05, c0: '#a6e35a', c1: '#3f8f30', spin: [rnd(-10, 10), rnd(-10, 10), rnd(-10, 10)] });
      R.hit(from, to, { color: '#c8f07a' });
    },
    async spark(from, to) {
      const F = frame(from, to);
      for (let i = 0; i < 12; i++) spawn('star', { p: F.a, v: F.d.clone().multiplyScalar(F.dist / 0.3).add(new THREE.Vector3(rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1))), delay: i * 0.015, life: 0.3, s0: 0.2, s1: 0.1, c0: '#ffffff', c1: '#ffe14a', spin: [0, 0, 14] });
      await wait(0.26);
      // a zig-zag bolt from the sky onto the target
      const top = tmpA.copy(F.b).add(tmpB.set(rnd(-0.3, 0.3), 3.2, rnd(-0.3, 0.3)));
      let p = top.clone();
      const N = 6;
      for (let i = 0; i < N; i++) {
        const t = (i + 1) / N;
        const q = new THREE.Vector3().lerpVectors(top, F.b, t);
        if (i < N - 1) q.add(tmpB.set(rnd(-0.45, 0.45), 0, rnd(-0.45, 0.45)));
        const mid = p.clone().add(q).multiplyScalar(0.5), len = p.distanceTo(q);
        const dir = q.clone().sub(p).normalize();
        const seg = spawn('bolt', { p: mid, life: 0.32, s0: 1, s1: 1, sx: 0.12, sy: len, sz: 0.12, c0: '#ffffff', c1: '#ffe14a', ease: 'in' });
        if (seg) { seg.align = false; seg.rot.setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir)); }
        p = q;
      }
      for (let i = 0; i < 14; i++) spawn('star', { p: F.b, v: new THREE.Vector3(rnd(-3, 3), rnd(0, 3), rnd(-3, 3)), drag: 4, life: rnd(0.3, 0.5), s0: 0.16, s1: 0, c0: '#ffffff', c1: '#ffd21a', spin: [0, 0, 18] });
      spawn('ring', { p: F.b, life: 0.3, s0: 0.3, s1: 1.6, c0: '#ffffff', c1: '#ffe14a' });
    },
    async frost(from, to) {
      const F = frame(from, to); const T = 0.4;
      for (let i = 0; i < 16; i++) spawn('shard', { p: F.a, v: F.d.clone().multiplyScalar(F.dist / T).add(new THREE.Vector3(rnd(-0.5, 0.5), rnd(-0.2, 0.6), rnd(-0.5, 0.5))), delay: i * 0.02, life: T, s0: 0.2, s1: 0.16, c0: '#ffffff', c1: '#9fe6ff', align: true });
      for (let i = 0; i < 14; i++) spawn('orb', { p: F.a, v: F.d.clone().multiplyScalar(F.dist / (T + 0.2)).add(new THREE.Vector3(rnd(-0.8, 0.8), rnd(-0.3, 0.8), rnd(-0.8, 0.8))), delay: i * 0.03, life: T + 0.2, s0: 0.07, s1: 0.04, c0: '#ffffff', c1: '#d8f6ff' });
      await wait(T);
      const base = centre(to, new THREE.Vector3(), 0);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const s = spawn('shard', { p: tmpA.set(base.x + Math.cos(a) * 0.35 * F.h, base.y + 0.1, base.z + Math.sin(a) * 0.35 * F.h), life: 0.9, s0: 0.5 * F.h + 0.2, s1: 0.0, ease: 'pop', c0: '#e8fbff', c1: '#7cd4ff' });
        if (s) s.rot.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
      }
      R.hit(from, to, { color: '#bff0ff' });
    },
    async rocks(from, to) {
      const F = frame(from, to);
      for (let i = 0; i < 7; i++) spawn('rock', { p: tmpA.copy(F.b).add(tmpB.set(rnd(-0.5, 0.5), rnd(2.4, 3.6), rnd(-0.5, 0.5))), v: new THREE.Vector3(0, -2, 0), g: 18, delay: i * 0.05, life: 0.55, s0: rnd(0.25, 0.4), s1: rnd(0.2, 0.3), c0: '#b9a48c', c1: '#9c8670', spin: [rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)], ease: 'out' });
      await wait(0.5);
      R.dust(null, to, { n: 12, color: '#d9c4a0', r: F.h });
      for (let i = 0; i < 8; i++) spawn('rock', { p: F.b, v: new THREE.Vector3(rnd(-2.5, 2.5), rnd(1.5, 3), rnd(-2.5, 2.5)), g: 12, life: 0.6, s0: 0.12, s1: 0.04, c0: '#a8927a', c1: '#8a7560', spin: [rnd(-9, 9), rnd(-9, 9), 0] });
      ctx.cameraRig?.shake?.(0.35);
    },
    async quake(from, to) {
      const F = frame(from, to);
      const base = centre(to, new THREE.Vector3(), 0);
      ctx.cameraRig?.shake?.(0.45);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + rnd(-0.2, 0.2), r = rnd(0.3, 0.7) * Math.max(1, F.h);
        const s = spawn('shard', { p: tmpA.set(base.x + Math.cos(a) * r, base.y, base.z + Math.sin(a) * r), delay: i * 0.03, life: 0.75, s0: rnd(0.45, 0.7), s1: 0, ease: 'pop', c0: '#c9a06a', c1: '#8f6a3e' });
        if (s) s.rot.set(Math.sin(a) * 0.4, rnd(0, 3), -Math.cos(a) * 0.4);
      }
      await wait(0.25);
      R.dust(null, to, { n: 14, color: '#d9b27a', r: F.h + 0.3 });
    },
    async wind(from, to) {
      const F = frame(from, to); const T = 0.45;
      for (let i = 0; i < 6; i++) {
        const s = spawn('ring', { p: F.a, v: F.d.clone().multiplyScalar(F.dist / T), delay: i * 0.06, life: T, s0: 0.25, s1: 0.8, c0: '#ffffff', c1: '#cfe9ff' });
        if (s) s.rot.setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, F.d));
      }
      for (let i = 0; i < 16; i++) spawn('flame', { p: tmpA.copy(F.a).addScaledVector(F.side, rnd(-0.6, 0.6)), v: F.d.clone().multiplyScalar(F.dist / T * rnd(0.9, 1.2)).add(new THREE.Vector3(0, rnd(-0.3, 0.3), 0)), delay: rnd(0, 0.25), life: T, s0: 0.12, s1: 0.06, sx: 0.4, sz: 0.4, c0: '#ffffff', c1: '#d6ecff', align: true, stretch: 0.1 });
      await wait(T + 0.05);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        spawn('flame', { p: F.b, v: new THREE.Vector3(Math.cos(a) * 3, rnd(-0.5, 1), Math.sin(a) * 3), drag: 3, life: 0.4, s0: 0.12, s1: 0, sx: 0.4, sz: 0.4, c0: '#ffffff', c1: '#cfe9ff', align: true, stretch: 0.12 });
      }
      spawn('ring', { p: F.b, life: 0.35, s0: 0.3, s1: 1.8, c0: '#ffffff', c1: '#d6ecff' });
    },
    async bugs(from, to) {
      const F = frame(from, to); const T = 0.55;
      for (let i = 0; i < 16; i++) spawn('orb', { p: tmpA.copy(F.a).add(tmpB.set(rnd(-0.3, 0.3), rnd(-0.2, 0.3), rnd(-0.3, 0.3))), v: F.side.clone().multiplyScalar(rnd(-3, 3)).add(new THREE.Vector3(0, rnd(0, 2), 0)), home: { to: F.b, k: 6, turn: 7 }, wob: 6, delay: i * 0.025, life: T + 0.1, s0: 0.09, s1: 0.07, c0: '#e8ff7a', c1: '#8fbf2a' });
      await wait(T);
      for (let i = 0; i < 10; i++) spawn('star', { p: F.b, v: new THREE.Vector3(rnd(-2.5, 2.5), rnd(0, 2.5), rnd(-2.5, 2.5)), drag: 4, life: 0.4, s0: 0.14, s1: 0, c0: '#f4ffb0', c1: '#a6b91a', spin: [0, 0, 12] });
      R.hit(from, to, { color: '#d9ec7a' });
    },
    async ghost(from, to) {
      const F = frame(from, to);
      const n = 10;
      const swirl = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, r = 0.9 + F.h * 0.4;
        const p = spawn('orb', { p: tmpA.set(F.b.x + Math.cos(a) * r, F.b.y + rnd(-0.2, 0.4), F.b.z + Math.sin(a) * r), life: 0.75, s0: 0.0, s1: 0.0, c0: '#d7b8ff', c1: '#6a3fb5' });
        if (p) { p.ang = a; p.r = r; swirl.push(p); }
      }
      // spiral inwards
      let t = 0;
      await new Promise(resolve => {
        const fn = dt => {
          t += dt;
          for (const p of swirl) {
            const k = clamp01(t / 0.6), rr = p.r * (1 - k * k);
            p.ang += dt * (4 + k * 8);
            p.p.set(F.b.x + Math.cos(p.ang) * rr, p.p.y, F.b.z + Math.sin(p.ang) * rr);
            p.s0 = p.s1 = 0.2 * Math.sin(Math.min(1, k * 1.2) * Math.PI) + 0.05;
          }
          if (t >= 0.6) { off(); resolve(); }
        };
        const off = ctx.loop.add(fn, ctx.ORDER?.actors ?? 20);
      });
      spawn('ring', { p: F.b, life: 0.4, s0: 1.8, s1: 0.1, c0: '#b48cff', c1: '#3d2b6b', ease: 'in' });
      R.hit(from, to, { color: '#c6a8ff' });
    },
    // ---- non-move effects ----
    release(at) {           // sphere opens: white light burst
      const b = centre(at, new THREE.Vector3(), 0.5);
      for (let i = 0; i < 14; i++) {
        const a = rnd(0, Math.PI * 2), e = rnd(-0.4, 0.9);
        spawn('orb', { p: b, v: new THREE.Vector3(Math.cos(a) * 2.6, e * 2.6, Math.sin(a) * 2.6), drag: 5, life: 0.45, s0: 0.12, s1: 0, c0: '#ffffff', c1: '#fff0a8' });
      }
      spawn('ring', { p: b, life: 0.35, s0: 0.2, s1: 1.4, c0: '#ffffff', c1: '#ffe9a8' });
      return Promise.resolve();
    },
    absorb(from, to) {      // Velmon → ball: streaks converge
      const a = centre(from, new THREE.Vector3(), 0.5), b = centre(to, new THREE.Vector3(), 0.5);
      for (let i = 0; i < 16; i++) spawn('orb', { p: tmpA.copy(a).add(tmpB.set(rnd(-0.4, 0.4), rnd(-0.4, 0.4), rnd(-0.4, 0.4))), v: new THREE.Vector3(rnd(-1, 1), rnd(0, 1), rnd(-1, 1)), home: { to: b, k: 9, turn: 9 }, delay: i * 0.012, life: 0.35, s0: 0.1, s1: 0.02, c0: '#ffffff', c1: '#ff7a7a', align: true, stretch: 0.08 });
      return wait(0.3);
    },
    stars(at) {             // caught!
      const b = centre(at, new THREE.Vector3(), 0.5);
      for (let i = 0; i < 3; i++) spawn('star', { p: b, v: new THREE.Vector3((i - 1) * 1.1, 2.4, 0.2), g: 3.5, life: 0.9, s0: 0.22, s1: 0.12, ease: 'out', c0: '#fff7c0', c1: '#ffcf3a', rot: [0, 0, 0], spin: [0, 0, 4] });
      return Promise.resolve();
    },
    sparkle(at, { color = '#ffe066', n = 12 } = {}) {
      const b = centre(at, new THREE.Vector3(), 0.3);
      const h = sizeOf(at);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        spawn('star', { p: tmpA.set(b.x + Math.cos(a) * 0.5 * h, b.y, b.z + Math.sin(a) * 0.5 * h), v: new THREE.Vector3(0, rnd(1.2, 2.2), 0), delay: rnd(0, 0.3), life: rnd(0.6, 0.9), s0: 0.14, s1: 0, ease: 'pop', c0: '#ffffff', c1: color, spin: [0, 0, 6] });
      }
      return Promise.resolve();
    },
    levelup(at) {
      const b = centre(at, new THREE.Vector3(), 0);
      const h = sizeOf(at);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 4;
        spawn('orb', { p: tmpA.set(b.x + Math.cos(a) * 0.55 * h, b.y + (i / 18) * 0.3, b.z + Math.sin(a) * 0.55 * h), v: new THREE.Vector3(-Math.sin(a) * 0.8, rnd(1.6, 2.4), Math.cos(a) * 0.8), delay: i * 0.03, life: 0.8, s0: 0.09, s1: 0, ease: 'pop', c0: '#ffffff', c1: '#7ad4ff' });
      }
      spawn('ring', { p: tmpA.copy(b).setY(b.y + 0.05), life: 0.6, s0: 0.3, s1: 1.4 * h + 0.4, c0: '#ffffff', c1: '#7ad4ff' });
      return Promise.resolve();
    },
    evolveIn(at) {          // light motes spiralling into the Velmon
      const b = centre(at, new THREE.Vector3(), 0.5);
      const h = sizeOf(at);
      for (let i = 0; i < 26; i++) {
        const a = rnd(0, Math.PI * 2), r = rnd(0.8, 1.3) * Math.max(0.7, h);
        spawn('orb', { p: tmpA.set(b.x + Math.cos(a) * r, b.y + rnd(-0.5, 0.8) * h, b.z + Math.sin(a) * r), v: new THREE.Vector3(-Math.sin(a) * 1.6, 0.3, Math.cos(a) * 1.6), home: { to: b, k: 2.6, turn: 2.5 }, delay: rnd(0, 0.6), life: 0.85, s0: 0.06, s1: 0.015, c0: '#ffffff', c1: '#bfe8ff', align: true, stretch: 0.12 });
      }
      return Promise.resolve();
    },
    evolveBurst(at) {
      const b = centre(at, new THREE.Vector3(), 0.5);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2, e = rnd(-0.5, 0.9);
        spawn('flame', { p: b, v: new THREE.Vector3(Math.cos(a) * 5, e * 4, Math.sin(a) * 5), drag: 3, life: 0.7, s0: 0.25, s1: 0, sx: 0.5, sz: 0.5, c0: '#ffffff', c1: '#ffe9a0', align: true, stretch: 0.1 });
      }
      for (let i = 0; i < 3; i++) spawn('ring', { p: b, delay: i * 0.08, life: 0.6, s0: 0.3, s1: 3 + i, c0: '#ffffff', c1: '#ffeec0', rot: [rnd(-0.4, 0.4), 0, rnd(-0.4, 0.4)] });
      R.sparkle(at, { n: 16, color: '#ffd23f' });
      return Promise.resolve();
    },
  };

  const fx = {
    /** kind: a type name (Fuoco, Acqua…), a recipe name, or 'move:<moveId>' handled by the caller. */
    play(kind, from, to, opts) {
      const name = BY_TYPE[kind] || kind;
      const r = R[name];
      if (!r) { console.warn('[fx] unknown effect', kind); return Promise.resolve(); }
      try { return Promise.resolve(r(from, to, opts)); } catch (e) { console.warn('[fx] failed', kind, e); return Promise.resolve(); }
    },
    /** True when the move type plays a ranged effect (the attacker does 'special'), false for a physical lunge. */
    isRanged(type) { return !['Normale'].includes(type); },
    clear() { for (const k in pools) { pools[k].list.length = 0; pools[k].mesh.count = 0; pools[k].mesh.visible = false; } },
    wait,
    root,
    dispose() { fx.clear(); root.removeFromParent(); },
  };
  return fx;
}
