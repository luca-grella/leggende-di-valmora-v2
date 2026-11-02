// The player: a procedural Human driven by a Sun/Moon style controller (exposed as ctx.player).
//   walk 2.6 m/s at half stick, run 5.6 m/s, ~10 m/s² acceleration, eased turning (~0.12 s), speed-driven
//   idle↔walk↔run blend (phase-locked, no foot sliding), lean into turns, feet on world.groundY with IK,
//   collisions through world.resolveMove, idle fidgets, footstep sounds, carrying/throwing, scooter riding.
// Contract: docs/ARCHITECTURE.md "Player".
import * as THREE from 'three';
import { LOOKS } from './looks.js';

const WALK = 2.6, RUN = 5.6, ACCEL = 10, DECEL = 14, RADIUS = 0.35;
const TURN_LAMBDA = 13;                       // facing damping (≈ 0.12 s to settle a quarter turn)
const IDLE_FIDGETS = ['idle_look', 'idle_stretch', 'idle_look'];
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _box = new THREE.Box3(), _s = new THREE.Vector3();
const wrap = a => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };

export function createPlayer(ctx, actors) {
  const st = () => {
    const s = ctx.save.state;
    if (!s.player || typeof s.player !== 'object') s.player = {};
    const p = s.player;
    for (const [k, v] of Object.entries({ x: 0, z: 0, facing: 0, area: 'alba', interior: null, lastCenter: 'alba', look: null })) if (p[k] === undefined) p[k] = v;
    return p;
  };
  const human = actors.createHuman(st().look || LOOKS.player, { id: 'player', name: 'Tu', footIK: true });
  const obj = human.object;
  obj.name = 'player';
  ctx.scene.add(obj);

  let facing = 0, speed = 0, control = true, held = null, vehicle = null, rideSpeed = 0, saveT = 0;
  let idleT = 0, idleNext = 9 + Math.random() * 6, fidget = 0;
  const lookAnchor = new THREE.Object3D();
  const carrySocket = new THREE.Object3D(); carrySocket.name = 'carry-socket';

  const groundY = (x, z) => {
    const w = ctx.world;
    if (w?.groundY) { const y = w.groundY(x, z); if (Number.isFinite(y)) return y; }
    if (ctx.stage?.heightAt) return ctx.stage.heightAt(x, z);
    return 0;
  };

  // ---- footsteps by surface ----
  human.onStep = (d) => {
    if (vehicle) return;
    const w = ctx.world;
    let name = 'step_grass';
    const kind = w?.areaDef?.(w?.area)?.kind;
    if (w?.interior) name = 'step_wood';
    else if (w?.surfaceAt) name = 'step_' + (w.surfaceAt(obj.position.x, obj.position.z) || 'grass');
    else if (kind === 'cave' || kind === 'sanctuary') name = 'step_stone';
    else if (kind === 'beach') name = 'step_sand';
    else if (kind === 'town') name = 'step_stone';
    const sp = d?.speed ?? speed;
    ctx.audio?.sfx?.(name, { vol: 0.22 + 0.2 * Math.min(1, sp / RUN), pitch: 0.94 + Math.random() * 0.12 + (d?.foot === 'R' ? 0.03 : 0) });
  };

  // ------------------------------------------------------------------------------------------ helpers
  function teleport(x, z, f) {
    if (vehicle) mount(null, { silent: true });
    human.teleport(x, z, Number.isFinite(f) ? f : facing);
    if (Number.isFinite(f)) facing = f;
    obj.rotation.y = facing;
    speed = 0;
    human.resetSprings();
    ctx.cameraRig?.snap?.();
    writeSave();
  }
  function writeSave() {
    const p = st();
    if (!vehicle) { p.x = +obj.position.x.toFixed(2); p.z = +obj.position.z.toFixed(2); p.facing = +facing.toFixed(3); }
    if (ctx.world) { p.area = ctx.world.area ?? p.area; p.interior = ctx.world.interior ?? null; }
  }
  const busy = () => ctx.busy?.is?.() || false;

  // ------------------------------------------------------------------------------------------ carrying
  /** Carry an object with both hands in front of the chest (null drops it into the scene where it is). */
  function carry(o) {
    if (held && held !== o) {
      if (held.parent === carrySocket) {
        held.getWorldPosition(_v); held.getWorldQuaternion(_q);
        ctx.scene.add(held); held.position.copy(_v); held.quaternion.copy(_q);
      }
    }
    held = o || null;
    human._carry = !!held;
    if (!held) {
      human.clearHandTargets(0.25);
      if (human.animator.upperName === 'carry_idle') human.stopUpper(0.3);
      carrySocket.removeFromParent();
      return;
    }
    // socket on the chest, a little forward; size the hands to the object
    human.bones.chest.add(carrySocket);
    _box.setFromObject(held); _box.getSize(_s);
    const r = Number.isFinite(_s.x) && _s.x > 0 ? Math.min(0.3, Math.max(0.08, Math.max(_s.x, _s.z) * 0.5)) : 0.15;
    carrySocket.position.set(0, -0.1, 0.15 + r * 0.8);
    held.parent?.remove(held);
    carrySocket.add(held);
    held.position.set(0, 0, 0); held.rotation.set(0, 0, 0);
    human.play('carry_idle', { layer: 'upper', fade: 0.25, loop: true });
    const side = (k) => (out) => { carrySocket.getWorldPosition(out); _v.set(k * r * 1.05, 0, 0).applyQuaternion(obj.quaternion); return out.add(_v); };
    human.setHandTarget('L', side(1), { fade: 0.3 });
    human.setHandTarget('R', side(-1), { fade: 0.3 });
  }

  /** Throw the carried object: plays 'throw', resolves with the object at release (left in the scene, world transform kept). */
  function throwHeld(dir) {
    const o = held;
    if (!o) return Promise.resolve(null);
    if (dir && Number.isFinite(dir.x) && Number.isFinite(dir.z) && (dir.x || dir.z)) { facing = Math.atan2(dir.x, dir.z); obj.rotation.y = facing; }
    human._carry = false;
    human.clearHandTargets(0.15);
    return new Promise(resolve => {
      let done = false;
      const release = () => {
        if (done) return; done = true;
        if (held === o) {
          held = null;
          if (o.parent === carrySocket) { o.getWorldPosition(_v); o.getWorldQuaternion(_q); ctx.scene.add(o); o.position.copy(_v); o.quaternion.copy(_q); }
          carrySocket.removeFromParent();
        }
        resolve(o);
      };
      human.play('throw', { fade: 0.15, onEvent: { release } }).then(() => release());
    });
  }

  /** Overarm throw of a capture sphere (battle). Optional ball object rides the right hand until release. */
  function throwBall(ball = null) {
    if (ball) human.attach('handR', ball);
    return new Promise(resolve => {
      let done = false;
      const release = () => {
        if (done) return; done = true;
        if (ball && human.attached('handR') === ball) {
          ball.getWorldPosition(_v); human.attach('handR', null); ctx.scene.add(ball); ball.position.copy(_v);
        }
        resolve(ball);
      };
      human.play('throw_ball', { fade: 0.15, layer: 'full', onEvent: { release } }).then(() => release());
    });
  }

  // ------------------------------------------------------------------------------------------ vehicles
  /** Mount a vehicle {object, seat, maxSpeed=11, accel=8, turnRate=2.8, kind} or null to get off. */
  function mount(v, { silent = false } = {}) {
    if (v === vehicle) return;
    if (vehicle) {
      const old = vehicle; vehicle = null; speed = 0; rideSpeed = 0;
      const f = old.object.rotation.y;
      const side = { x: old.object.position.x + Math.cos(f) * 0.9, z: old.object.position.z - Math.sin(f) * 0.9 };
      const r = ctx.world?.resolveMove?.({ x: old.object.position.x, z: old.object.position.z }, side, RADIUS) || side;
      human.play('idle', { fade: silent ? 0 : 0.35 });
      human.teleport(r.x, r.z, f);
      facing = f;
      ctx.bus?.emit('player:mount', { vehicle: null });
      if (!silent) ctx.cameraRig?.snap?.();
    }
    if (!v?.object) return;
    if (held) carry(null);
    vehicle = { maxSpeed: 11, accel: 8, turnRate: 2.8, kind: 'vehicle', ...v };
    vehicle = v;                                         // keep the caller's object (story compares identity)
    rideSpeed = 0;
    human.stop();
    human.play('ride_scooter', { fade: 0.3 });
    attachToSeat();
    ctx.bus?.emit('player:mount', { vehicle: v });
  }
  function attachToSeat() {
    const seat = vehicle.seat || vehicle.object;
    vehicle.object.updateMatrixWorld(true);
    seat.getWorldPosition(_v);
    obj.position.copy(_v);
    facing = vehicle.object.rotation.y;
    obj.rotation.y = facing;
  }
  function rideUpdate(dt) {
    const v = vehicle, o = v.object;
    const maxSpeed = v.maxSpeed ?? 11, accel = v.accel ?? 8, turnRate = v.turnRate ?? 2.8;
    const m = ctx.input?.move || { x: 0, z: 0, mag: 0 };
    const can = control && !busy();
    let throttle = can ? m.mag : 0, steer = 0;
    if (can && m.mag > 0.05) {
      const want = Math.atan2(m.x, m.z), diff = wrap(want - o.rotation.y);
      if (Math.abs(diff) > 2.3 && rideSpeed > 2) throttle = -1;              // pull back = brake
      steer = Math.max(-1, Math.min(1, diff * 2));
    }
    const target = throttle > 0 ? maxSpeed * throttle : 0;
    const a = throttle < 0 ? accel * 1.8 : target > rideSpeed ? accel : accel * 0.9;
    rideSpeed += Math.sign(target - rideSpeed) * Math.min(Math.abs(target - rideSpeed), a * dt);
    const tr = steer * turnRate * Math.min(1, 0.25 + rideSpeed / 4);
    o.rotation.y += tr * dt;
    if (rideSpeed > 0.01) {
      const step = rideSpeed * dt;
      const from = { x: o.position.x, z: o.position.z };
      const to = { x: from.x + Math.sin(o.rotation.y) * step, z: from.z + Math.cos(o.rotation.y) * step };
      const r = ctx.world?.resolveMove?.(from, to, 0.6) || to;
      const moved = Math.hypot(r.x - from.x, r.z - from.z);
      if (moved < step * 0.3) rideSpeed *= 0.5;                               // bumped into something
      o.position.x = r.x; o.position.z = r.z;
    }
    o.position.y += (groundY(o.position.x, o.position.z) - o.position.y) * (1 - Math.exp(-18 * dt));
    attachToSeat();
    human.drive(0, tr, 0);
    speed = rideSpeed;
  }

  // ------------------------------------------------------------------------------------------ per frame
  function update(dt) {
    if (!obj.parent) ctx.scene.add(obj);
    if (vehicle) { rideUpdate(dt); tick(dt); return; }
    if (human._pair || human.moving) {               // staged with a partner / scripted walk: hands off
      facing = obj.rotation.y; speed = human.moving ? human.speed : 0; tick(dt); return;
    }
    const m = ctx.input?.move || { x: 0, z: 0, mag: 0 };
    // pushing the stick interrupts one-shot gestures and gets up from a seat
    const cur = human.animator.current;
    if (control && !busy() && m.mag > 0.25 && cur && cur !== 'locomotion' && !['stand_up', 'sit_down', 'throw', 'throw_ball', 'pickup'].includes(cur)) {
      const def = human.animator.lib[cur]?.def;
      if (def && (!def.loop || cur === 'sit_idle' || cur === 'think' || cur === 'sit_ground' || cur === 'kneel')) human.play('idle', { fade: 0.25 });
    }
    const can = control && !busy() && human.animator.current === 'locomotion';
    let goal = 0, turnRate = 0;
    if (can && m.mag > 0.04) {
      const want = Math.atan2(m.x, m.z);
      const diff = wrap(want - facing);
      const before = facing;
      facing = wrap(facing + diff * (1 - Math.exp(-TURN_LAMBDA * dt)));
      turnRate = wrap(facing - before) / Math.max(dt, 1e-4);
      const run = !!ctx.input.run;
      goal = run ? RUN * Math.min(1, m.mag / 0.7) : WALK * Math.min(1, m.mag / 0.5);
      goal *= 0.3 + 0.7 * Math.max(0, Math.cos(diff));                       // ease off while turning hard
    }
    const prev = speed;
    const rate = goal > speed ? ACCEL : DECEL;
    speed += Math.sign(goal - speed) * Math.min(Math.abs(goal - speed), rate * dt);
    let accel = (speed - prev) / Math.max(dt, 1e-4);
    if (speed > 0.001) {
      const step = speed * dt;
      const from = { x: obj.position.x, z: obj.position.z };
      const to = { x: from.x + Math.sin(facing) * step, z: from.z + Math.cos(facing) * step };
      const r = ctx.world?.resolveMove?.(from, to, RADIUS) || to;
      const moved = Math.hypot(r.x - from.x, r.z - from.z);
      // walking into a wall: slow the legs down to the real speed (no running on the spot)
      if (moved < step * 0.98) { const real = moved / Math.max(dt, 1e-4); speed += (real - speed) * (1 - Math.exp(-10 * dt)); accel = 0; }
      obj.position.x = r.x; obj.position.z = r.z;
    }
    const gy = groundY(obj.position.x, obj.position.z);
    obj.position.y += (gy - obj.position.y) * (1 - Math.exp(-25 * dt));
    if (Math.abs(gy - obj.position.y) > 0.6) obj.position.y = gy;
    obj.rotation.y = facing;
    if (human.animator.current === 'locomotion') human.drive(speed, turnRate, accel);
    else { speed = 0; facing = obj.rotation.y; }
    tick(dt);
  }

  /** Shared per-frame chores: idle fidgets, glance at what A would interact with, save fields. */
  function tick(dt) {
    const A = human.animator;
    // idle fidgets
    const still = !vehicle && speed < 0.05 && A.current === 'locomotion' && !A.upperName && !busy() && control;
    if (still) {
      idleT += dt;
      if (idleT > idleNext) { idleT = 0; idleNext = 10 + Math.random() * 8; human.play(IDLE_FIDGETS[fidget++ % IDLE_FIDGETS.length], { fade: 0.4 }); }
    } else idleT = 0;
    // glance at the current interactable (NPC face or object)
    if (!busy() && !vehicle) {
      const cur = ctx.interact?.current;
      let target = null;
      if (cur) {
        const p = typeof cur.pos === 'function' ? cur.pos() : cur.pos;
        if (cur.lookAt?.isObject3D) target = cur.lookAt;
        else if (p?.isObject3D) target = p.userData?.head || p;
        else if (p && Number.isFinite(p.x)) { lookAnchor.position.set(p.x, (p.y ?? groundY(p.x, p.z)) + (cur.lookHeight ?? 0.9), p.z); if (!lookAnchor.parent) ctx.scene.add(lookAnchor); target = lookAnchor; }
      }
      if (target !== player._autoLook) { player._autoLook = target; if (!player._lookLocked) human.lookAt(target, { weight: 0.85 }); }
    }
    saveT += dt;
    if (saveT > 0.5) { saveT = 0; writeSave(); }
  }

  // ------------------------------------------------------------------------------------------ public
  const player = {
    human, object: obj, radius: RADIUS,
    get position() { return obj.position; },
    get facing() { return facing; },
    set facing(a) { facing = a; obj.rotation.y = a; },
    get speed() { return speed; },
    get state() {
      if (ctx.busy?.has?.('battle')) return 'battle';
      if (vehicle) return 'ride';
      if (ctx.busy?.has?.('scene') || ctx.busy?.has?.('cutscene') || human.animator.current !== 'locomotion') return 'scene';
      return speed > 3.6 ? 'run' : speed > 0.1 ? 'walk' : 'idle';
    },
    get control() { return control; },
    setControl(v) { control = !!v; if (!control) speed = Math.min(speed, 0.5); },
    teleport,
    carry, get held() { return held; }, throwHeld, throwBall,
    mount, get vehicle() { return vehicle; },
    get look() { return st().look || LOOKS.player; },
    /** Change the player's look (saved). */
    setLook(look) { st().look = look; human.setLook(look); ctx.save.commit?.(); },
    /** Turn to face a point / angle (eased). */
    face(target, o) { return human.face(target, o).then(r => { facing = obj.rotation.y; return r; }); },
    /** Lock the look-at (scenes): target or null to return to automatic glances. */
    lookAt(target, o) { player._lookLocked = !!target; human.lookAt(target, o); if (!target) player._autoLook = undefined; },
    _autoLook: undefined, _lookLocked: false,
  };

  ctx.loop.add(function playerUpdate(dt) { try { update(dt); } catch (e) { console.error('[actors] player', e); } }, (ctx.ORDER?.actors ?? 20) - 1);

  // ---- spawn from the save on game:start ----
  ctx.bus.on('game:start', ({ newGame } = {}) => {
    const p = st();
    if (p.look) human.setLook(p.look);
    let x = p.x, z = p.z, f = p.facing;
    const fresh = newGame || (!p.x && !p.z);
    if (fresh) {
      const poi = ctx.world?.poi?.('alba.arrive') || ctx.world?.poi?.('alba.plaza') || ctx.world?.spawn || null;
      if (poi) { x = poi.x; z = poi.z; f = poi.facing ?? 0; }
    }
    teleport(x || 0, z || 0, f || 0);
    // restore an interior (if World didn't already)
    if (!fresh && p.interior && ctx.world?.enterInterior && ctx.world.interior !== p.interior) {
      Promise.resolve(ctx.world.enterInterior(p.interior)).then(() => { facing = obj.rotation.y; }).catch(e => console.warn('[actors] interior restore', e));
    }
  });
  ctx.bus.on('interior:enter', () => { facing = obj.rotation.y; speed = 0; });
  ctx.bus.on('interior:exit', () => { facing = obj.rotation.y; speed = 0; });
  ctx.bus.on('busy:change', ({ busy: b } = {}) => { if (b && speed > 0) speed = Math.min(speed, 1); });

  { const p = st(); human.teleport(p.x || 0, p.z || 0, p.facing || 0); facing = p.facing || 0; }
  return player;
}
