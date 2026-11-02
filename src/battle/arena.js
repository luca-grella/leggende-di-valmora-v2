// Close-up battle arena built on the spot (docs/GDD.md "Arena"): the battle happens where it started. Two soft
// light pads + blob shadows under the Velmon (they read well even with shadows off), a ring of swaying tall-grass
// tufts around wild battles, all conforming to world.groundY. Slots face each other along `at.facing`.
// Returns {object, slots:{ally, foe, player, trainer} (each {x, y, z, facing}), center, forward, right, gap, update(dt), dispose()}.
import * as THREE from 'three';

const GAP = 4.2;   // ally ↔ foe distance (m)

/** Disc with per-vertex alpha (centre a0 → edge a1): soft shadows / glows without textures. */
function softDisc(r, color, a0, a1, seg = 32, rings = 4) {
  const pos = [0, 0, 0], col = [], idx = [];
  const c = new THREE.Color(color);
  col.push(c.r, c.g, c.b, a0);
  for (let k = 1; k <= rings; k++) {
    const rr = (k / rings) * r, t = k / rings;
    const a = a0 + (a1 - a0) * (t * t * (3 - 2 * t));
    for (let i = 0; i < seg; i++) {
      const ang = (i / seg) * Math.PI * 2;
      pos.push(Math.cos(ang) * rr, 0, Math.sin(ang) * rr);
      col.push(c.r, c.g, c.b, a);
    }
  }
  for (let i = 0; i < seg; i++) idx.push(0, 1 + ((i + 1) % seg), 1 + i);
  for (let k = 1; k < rings; k++) {
    const a = 1 + (k - 1) * seg, b = 1 + k * seg;
    for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; idx.push(a + i, a + j, b + i, a + j, b + j, b + i); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

function ringLine(r, w, color, alpha) {
  const g = new THREE.RingGeometry(r - w, r, 48, 1).rotateX(-Math.PI / 2);
  const n = g.attributes.position.count, c = new THREE.Color(color), col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b, alpha], i * 4);
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  return g;
}

/** A tuft of tall grass blades (one geometry, instanced). */
function tuftGeometry() {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + i * 0.7, r = 0.08 + (i % 3) * 0.05;
    const h = 0.45 + ((i * 37) % 10) / 30;
    const b = new THREE.ConeGeometry(0.06, h, 4, 1);
    b.translate(0, h / 2, 0);
    b.rotateZ(Math.cos(a) * 0.25); b.rotateX(Math.sin(a) * 0.25);
    b.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    parts.push(b.toNonIndexed());
  }
  let count = 0; for (const p of parts) count += p.attributes.position.count;
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  let o = 0;
  const lo = new THREE.Color('#2f7f2c'), hi = new THREE.Color('#6fcf4a'), c = new THREE.Color();
  for (const p of parts) {
    const P = p.attributes.position;
    for (let i = 0; i < P.count; i++) {
      pos.set([P.getX(i), P.getY(i), P.getZ(i)], (o + i) * 3);
      c.copy(lo).lerp(hi, Math.min(1, P.getY(i) / 0.7));
      col.set([c.r, c.g, c.b], (o + i) * 3);
    }
    o += P.count; p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * @param {any} ctx
 * @param {{x:number, z:number, facing?:number, y?:number}} at  where the player stands (facing = towards the foe)
 * @param {{grass?:boolean, gap?:number}} [opts]
 */
export function buildArena(ctx, at, { grass = false, gap = GAP } = {}) {
  const object = new THREE.Group(); object.name = 'battle-arena';
  const ground = (x, z) => ctx.world?.groundY?.(x, z) ?? ctx.world?.heightAt?.(x, z) ?? ctx.stage?.heightAt?.(x, z) ?? at.y ?? 0;
  const facing = at.facing ?? 0;
  const fwd = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);          // matches the camera rig's battle axis
  // the ally stands a little in front of the player, the foe `gap` further on
  const allyP = new THREE.Vector3(at.x, 0, at.z).addScaledVector(fwd, 0.9);
  const foeP = allyP.clone().addScaledVector(fwd, gap);
  const center = allyP.clone().lerp(foeP, 0.5);
  const playerP = allyP.clone().addScaledVector(fwd, -1.55).addScaledVector(right, -0.95);
  const trainerP = foeP.clone().addScaledVector(fwd, 1.7).addScaledVector(right, -0.85);
  const slot = (p, f) => ({ x: p.x, y: ground(p.x, p.z), z: p.z, facing: f });
  const back = facing + Math.PI;
  const slots = {
    ally: slot(allyP, facing), foe: slot(foeP, back),
    player: slot(playerP, facing + 0.18), trainer: slot(trainerP, back + 0.18),
  };
  center.y = ground(center.x, center.z);

  const disposables = [];
  const vMat = (opts) => { const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: true, ...opts }); disposables.push(m); return m; };
  const shadowMat = vMat({ color: '#ffffff' });
  const padMat = vMat({ color: '#ffffff' });
  const geos = {
    shadow: softDisc(1, '#3b3570', 0.42, 0.0), pad: softDisc(1, '#fffbe6', 0.34, 0.0, 36, 5),
    ring: ringLine(1, 0.035, '#ffffff', 0.55),
  };
  disposables.push(...Object.values(geos));
  const pads = {};
  for (const k of ['ally', 'foe']) {
    const s = slots[k];
    const g = new THREE.Group(); g.position.set(s.x, s.y + 0.03, s.z);
    const pad = new THREE.Mesh(geos.pad, padMat); pad.scale.setScalar(1.35); pad.renderOrder = 1;
    const ring = new THREE.Mesh(geos.ring, padMat); ring.scale.setScalar(1.15); ring.position.y = 0.005; ring.renderOrder = 1;
    const shadow = new THREE.Mesh(geos.shadow, shadowMat); shadow.scale.setScalar(0.6); shadow.position.y = 0.01; shadow.renderOrder = 2;
    g.add(pad, ring, shadow);
    object.add(g);
    pads[k] = { group: g, shadow, ring };
  }
  // blob shadows for the humans
  for (const k of ['player', 'trainer']) {
    const s = slots[k];
    const sh = new THREE.Mesh(geos.shadow, shadowMat); sh.scale.setScalar(0.45); sh.position.set(s.x, s.y + 0.02, s.z); sh.renderOrder = 2;
    sh.visible = k === 'player';
    object.add(sh);
    pads[k] = { shadow: sh };
  }

  // tall grass ring (wild battles on routes)
  let tufts = null, tuftData = null;
  if (grass) {
    const geo = tuftGeometry(); disposables.push(geo);
    const mat = ctx.toon.mat('#ffffff', { vertexColors: true });
    const rng = ctx.math?.rng ? ctx.math.rng(Math.floor(at.x * 13 + at.z * 7)) : Math.random;
    tuftData = [];
    const R0 = gap * 0.5 + 2.2;
    for (let i = 0; i < 70 && (tuftData.length < 44); i++) {
      const a = rng() * Math.PI * 2;
      // ellipse around the arena; the half behind the ally stays open (that's where the cameras are)
      const rx = R0 + 0.8 + rng() * 2.4, rz = R0 * 1.15 + rng() * 2.4;
      const lx = Math.cos(a) * rx, lz = Math.sin(a) * rz;
      if (lz < -gap * 0.25 && Math.abs(lx) < R0 + 2.5) continue;
      const p = center.clone().addScaledVector(right, lx).addScaledVector(fwd, lz);
      if (p.distanceTo(new THREE.Vector3(slots.player.x, p.y, slots.player.z)) < 2.2) continue;
      tuftData.push({ x: p.x, y: ground(p.x, p.z) - 0.04, z: p.z, s: 0.7 + rng() * 0.6, ry: rng() * 6.28, ph: rng() * 6.28 });
    }
    tufts = new THREE.InstancedMesh(geo, mat, tuftData.length);
    tufts.name = 'arena-tufts'; tufts.receiveShadow = true; tufts.frustumCulled = false;
    object.add(tufts);
    ctx.toon.outline?.(tufts, { width: 0.012 });
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  let t = 0;
  function update(dt) {
    t += dt;
    if (tufts) {
      for (let i = 0; i < tuftData.length; i++) {
        const d = tuftData[i];
        const sw = Math.sin(t * 1.7 + d.ph) * 0.07 + Math.sin(t * 3.1 + d.ph * 2) * 0.025;
        _q.setFromEuler(_e.set(sw * 0.6, d.ry, sw));
        tufts.setMatrixAt(i, _m.compose(_p.set(d.x, d.y, d.z), _q, _s.set(d.s, d.s * (1 + 0.04 * Math.sin(t * 2 + d.ph)), d.s)));
      }
      tufts.instanceMatrix.needsUpdate = true;
    }
  }
  update(0);
  ctx.scene.add(object);
  const off = ctx.loop.add(function arena(dt) { update(dt); }, ctx.ORDER?.world ?? 30);

  return {
    object, slots, pads, center, forward: fwd, right, gap, update,
    /** Fit a pad/shadow to a Velmon's footprint. */
    fit(k, radius) {
      const p = pads[k]; if (!p) return;
      p.shadow.scale.setScalar(Math.max(0.35, radius * 1.15));
      if (p.ring) p.ring.scale.setScalar(Math.max(0.9, radius * 1.9));
      p.group?.children[0]?.scale.setScalar(Math.max(1.1, radius * 2.3));
    },
    showShadow(k, v) { if (pads[k]) pads[k].shadow.visible = !!v; },
    dispose() {
      off();
      object.removeFromParent();
      for (const d of disposables) d.dispose?.();
      tufts?.dispose?.();
    },
  };
}
