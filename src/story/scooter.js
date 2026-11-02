// A chunky Vespa-style scooter (rounded toon body, chrome mirrors, glowing headlight) + vehicle params
// for ctx.player.mount(vehicle). Wheels spin and the body leans into turns from its own motion,
// so it looks alive whoever moves it (userData.update, ticked by the story fx set).
import * as THREE from 'three';

export function buildScooter(ctx, color = '#e8443a') {
  const { toon, kit } = ctx;
  const root = new THREE.Group(); root.name = 'scooter';
  const lean = new THREE.Group(); root.add(lean);            // the body leans, the root follows the ground
  const paint = toon.mat(color, { rim: 0.35 }), cream = toon.mat('#fff2d8'), dark = toon.mat('#2a2140'), chrome = toon.mat('#d8e4ee', { rim: 0.6 });
  const add = (geo, mat, x, y, z, r = {}) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(r.x || 0, r.y || 0, r.z || 0); if (r.s) m.scale.set(...r.s); m.castShadow = true; lean.add(m); return m; };

  // rear body: a fat rounded capsule, the classic Vespa hips
  add(kit.capsule(0.3, 0.55, 6, 14), paint, 0, 0.52, -0.32, { x: Math.PI / 2, s: [1.05, 1, 0.85] });
  add(kit.roundedBox(0.34, 0.1, 0.9, 0.05, 2), dark, 0, 0.3, 0.08);                         // floor board
  add(kit.roundedBox(0.5, 0.14, 0.62, 0.07, 2), toon.mat('#5a3a22'), 0, 0.86, -0.34);         // seat
  add(kit.roundedBox(0.5, 0.82, 0.16, 0.08, 2), paint, 0, 0.72, 0.5, { x: -0.18 });          // leg shield
  add(kit.roundedBox(0.36, 0.5, 0.08, 0.04, 2), cream, 0, 0.7, 0.44, { x: -0.18 });          // shield inner panel
  add(kit.capsule(0.05, 0.42, 4, 8), chrome, 0, 1.08, 0.6, { x: -0.25 });                     // steering column
  add(kit.roundedBox(0.3, 0.16, 0.16, 0.06, 2), paint, 0, 1.3, 0.66);                         // headset
  add(kit.capsule(0.03, 0.62, 4, 8), chrome, 0, 1.3, 0.62, { z: Math.PI / 2 });              // handlebar
  for (const s of [-1, 1]) {
    add(kit.capsule(0.04, 0.08, 4, 8), dark, s * 0.36, 1.3, 0.62, { z: Math.PI / 2 });       // grips
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), chrome, s * 0.22, 1.42, 0.6);
    add(new THREE.SphereGeometry(0.06, 12, 8), chrome, s * 0.22, 1.54, 0.6, { s: [1, 0.7, 0.35] }); // mirrors
  }
  const lamp = add(new THREE.SphereGeometry(0.1, 14, 10), toon.glow('#fff6c9', 1.4), 0, 1.32, 0.76, { s: [1, 1, 0.6] });
  add(new THREE.SphereGeometry(0.05, 10, 8), toon.glow('#ff4a3a', 1.2), 0, 0.62, -0.83, { s: [1.4, 0.8, 0.6] }); // tail light
  add(kit.capsule(0.15, 0.25, 6, 12), paint, 0, 0.45, 0.68, { x: Math.PI / 2, s: [0.9, 1, 0.7] }); // front mudguard

  const wheels = [];
  for (const z of [-0.58, 0.68]) {
    const w = new THREE.Group(); w.position.set(0, 0.24, z); lean.add(w);
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.075, 10, 22), dark); tyre.rotation.y = Math.PI / 2; tyre.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 14), cream); hub.rotation.z = Math.PI / 2;
    const dot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.12), dark);
    w.add(tyre, hub, dot); wheels.push(w);
  }
  toon.outline(root, { width: 0.015, skip: m => m === lamp });

  const seat = new THREE.Object3D(); seat.position.set(0, 0.92, -0.32); root.add(seat);
  const pillion = new THREE.Object3D(); pillion.position.set(0, 0.95, -0.62); root.add(pillion);

  // self-animation from motion: wheel spin + lean into turns + idle engine wobble
  const last = new THREE.Vector3(), tmp = new THREE.Vector3();
  let lastYaw = 0, speed = 0, leanZ = 0, init = false;
  root.userData.update = (dt, t) => {
    root.getWorldPosition(tmp);
    if (!init) { last.copy(tmp); lastYaw = root.rotation.y; init = true; }
    const v = dt > 0 ? tmp.distanceTo(last) / dt : 0; last.copy(tmp);
    speed += (v - speed) * Math.min(1, dt * 8);
    const yaw = root.rotation.y, dy = Math.atan2(Math.sin(yaw - lastYaw), Math.cos(yaw - lastYaw)); lastYaw = yaw;
    const want = Math.max(-0.28, Math.min(0.28, -(dy / Math.max(dt, 1e-3)) * 0.05 * Math.min(1, speed / 4)));
    leanZ += (want - leanZ) * Math.min(1, dt * 6);
    lean.rotation.z = leanZ;
    lean.position.y = speed > 0.2 ? Math.sin(t * 40) * 0.004 : 0;
    for (const w of wheels) w.rotation.x += (speed / 0.24) * dt;
    lamp.material.emissiveIntensity = ctx.time?.isNight ? 2.2 : 1.2;
  };

  return { object: root, seat, pillion, maxSpeed: 11, accel: 8, turnRate: 2.8, kind: 'scooter', color };
}
