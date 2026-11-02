// Public Human object returned by actors.createHuman (contract: docs/ARCHITECTURE.md "Actors API").
// One procedural Sun/Moon character = skinned mesh + outline (2 draw calls), the clip Animator and the
// procedural layers applied every frame after the mixer:
//   lean into turns / acceleration · breathing · feet on the ground (two-bone IK, player only) · look-at
//   (chest/neck/head + eyes) · hand IK onto targets (hugs, massages, holding hands) · face (expressions,
//   blink, saccades, talking mouth) · spring jiggle on hair, hats, backpacks and scarves.
// Humans auto-update on the actors loop (index.js iterates HUMANS).
import * as THREE from 'three';
import { buildHuman } from './human.js';
import { normalizeLook } from './looks.js';
import { bakeLibrary } from './anim.js';
import { CLIPS, UPPER_OK } from './clips.js';
import { Animator } from './animator.js';
import { LookAt, Jiggle, twoBoneIK, groundNormal } from './procedural.js';
import { ARM_ANGLE } from './skeleton.js';

let LIB = null;
/** Baked clip library shared by every human. */
export function clipLibrary() { if (!LIB) LIB = bakeLibrary(CLIPS); return LIB; }

/** Every live Human (the actors loop updates them). */
export const HUMANS = new Set();

const _p = new THREE.Vector3(), _p2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _n = new THREE.Vector3(), _ax = new THREE.Vector3(), _cam = new THREE.Vector3(), _f = new THREE.Vector3();
const _qi = new THREE.Quaternion(), _qe = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrap = a => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const easeInOut = u => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
/** Attach slots → bone. */
const SLOTS = { handR: 'prop_R', handL: 'prop_L', head: 'hat', back: 'back', hips: 'hips' };
/** Clips after which the character must stand up before doing anything standing. */
const SEATED = new Set(['sit_down', 'sit_idle', 'sit_feet']);
/** Floor / water / vehicle poses: leaving them uses a longer cross-fade. */
const GROUNDED = new Set(['sit_ground', 'sit_legs', 'sit_knees', 'kneel', 'kneel_bow', 'lie_back', 'sleep', 'defeat', 'swim', 'ride_scooter', 'ride_passenger']);

export class Human {
  /**
   * @param {any} ctx
   * @param {object} look  (partial looks are normalised)
   * @param {{id?:string, name?:string, footIK?:boolean, autoUpdate?:boolean}} [opts]
   */
  constructor(ctx, look, { id = null, name = '', footIK = false, autoUpdate = true } = {}) {
    this.ctx = ctx; this.id = id; this.name = name;
    this.object = new THREE.Group(); this.object.name = 'human:' + (id || name || 'anon');
    this.head = new THREE.Object3D(); this.head.name = 'head-anchor';
    this.object.userData.head = this.head; this.object.userData.human = this;
    this.footIK = footIK;
    this._attach = {};                                   // slot → {socket, obj}
    this._hand = { L: { target: null, w: 0, goal: 0, fade: 0.3, offset: null }, R: { target: null, w: 0, goal: 0, fade: 0.3, offset: null } };
    this._lookTarget = null; this._lookWeight = 1;
    this._move = null;                                   // moveTo autopilot
    this._turn = null;                                   // face() tween
    this._speed = 0; this._turnRate = 0; this._accel = 0; this._drive = null;
    this._roll = 0; this._pitch = 0; this._breath = Math.random() * 6; this._exert = 0; this._t = Math.random() * 10;
    this._hipDrop = 0; this._accum = 0;
    this._talkGesture = false; this._carry = false;
    this.onStep = null;                                  // (data) → void  footstep hook
    this.onEvent = null;                                 // (evt, clip, data) → void
    this._build(look);
    if (autoUpdate) HUMANS.add(this);
  }

  // ------------------------------------------------------------------------------------------ build
  _build(look) {
    const ctx = this.ctx;
    const L = { ...normalizeLook(look), _n: true };
    const built = buildHuman(ctx, L);
    const prev = this.animator ? { name: this.animator.current, upper: this.animator.upperName } : null;
    if (this.model) { this.object.remove(this.model); this._disposeBuilt(); }
    this.built = built; this.look = L; this.model = built.model; this.bones = built.bones; this.spec = built.spec; this.faceCtl = built.face;
    this.mesh = built.mesh; this.outline = built.outline; this.skeleton = built.skeleton; this.meshes = built.meshes;
    this.height = built.height;
    this.object.add(this.model);
    this.object.userData.height = this.height;
    this.object.userData.radius = 0.3;
    const B = this.bones, S = this.spec;
    // head anchor (≈ face centre; the camera adds a little for eye level, markers float above)
    B.head.add(this.head);
    this.head.position.set(0, S.headC[1] - 0.03 * S.hr - S.joints.head[1], S.headC[2] - S.joints.head[2]);
    // bind pose for the per-frame reset
    this._bind = built.skeleton.bones.map(b => ({ b, p: b.position.clone() }));
    // animator
    const idle = L.sex === 'f' && L.age === 'adult' ? 'idle_f' : 'idle';
    this.animator = new Animator(this.mesh, clipLibrary(), { idle });
    this.animator.defaultFor = () => this._defaultClip();
    this.animator.onEvent = (evt, clip, data) => {
      if (evt === 'step') this.onStep?.(data);
      this.onEvent?.(evt, clip, data);
    };
    this.lookAtCtl = new LookAt(built);
    this._setupJiggles();
    // re-attach props
    for (const [slot, a] of Object.entries(this._attach)) { const o = a.obj; delete this._attach[slot]; if (o) this.attach(slot, o); }
    this._resetPose();
    this.animator.play(prev?.name && prev.name !== 'locomotion' && this.animator.has(prev.name) ? prev.name : 'locomotion', { fade: 0 });
    if (prev?.upper) this.animator.play(prev.upper, { layer: 'upper', fade: 0 });
    this.model.updateMatrixWorld(true);
  }

  _setupJiggles() {
    const B = this.bones, st = this.look.hair.style, J = [];
    const tipOf = (child) => child.position.clone();
    if (['long', 'ponytail', 'braid'].includes(st)) {
      J.push(new Jiggle(B.hair1, tipOf(B.hair2), { k: 90, damp: 0.3, max: 0.3 }));
      J.push(new Jiggle(B.hair2, tipOf(B.hair3), { k: 60, damp: 0.26, max: 0.45 }));
      J.push(new Jiggle(B.hair3, new THREE.Vector3(0, -0.15, 0.01), { k: 50, damp: 0.24, max: 0.5 }));
    } else if (st === 'bun') J.push(new Jiggle(B.hair1, new THREE.Vector3(0, -0.06, -0.06), { k: 220, damp: 0.3, max: 0.1 }));
    if (st === 'twintails') for (const s of ['L', 'R']) {
      J.push(new Jiggle(B[`hair${s}`], tipOf(B[`hair${s}2`]), { k: 80, damp: 0.28, max: 0.35 }));
      J.push(new Jiggle(B[`hair${s}2`], new THREE.Vector3(0, -0.2, 0), { k: 55, damp: 0.24, max: 0.45 }));
    }
    if (this.look.hat && ['sunhat', 'chef'].includes(this.look.hat.style)) J.push(new Jiggle(B.hat, new THREE.Vector3(0, 0.25, 0), { k: 180, damp: 0.3, max: 0.1 }));
    if (this.look.accessory === 'backpack') J.push(new Jiggle(B.back, new THREE.Vector3(0, -0.16, -0.06), { k: 120, damp: 0.3, max: 0.16 }));
    if (this.look.accessory === 'scarf') J.push(new Jiggle(B.scarf, new THREE.Vector3(0, -0.16, 0.02), { k: 90, damp: 0.28, max: 0.3 }));
    this._jig = J;
  }

  _resetPose() { for (const { b, p } of this._bind) { b.position.copy(p); b.quaternion.identity(); b.scale.set(1, 1, 1); } }

  _disposeBuilt() {
    this.animator?.dispose();
    this.mesh?.geometry.dispose(); this.outline?.geometry.dispose(); this.skeleton?.dispose?.();
  }

  _ground(x, z) {
    const w = this.ctx.world;
    if (w?.groundY) { const y = w.groundY(x, z); if (Number.isFinite(y)) return y; }
    if (w?.heightAt) { const y = w.heightAt(x, z); if (Number.isFinite(y)) return y; }
    const st = this.ctx.stage;
    if (st?.heightAt) return st.heightAt(x, z);
    return 0;
  }

  _defaultClip() {
    const cur = this.animator.current;
    if (cur && SEATED.has(cur)) return 'sit_idle';
    return 'locomotion';
  }

  // ------------------------------------------------------------------------------------------ public API
  /** Facing angle (radians, 0 = +z). */
  get facing() { return this.object.rotation.y; }
  set facing(a) { this.object.rotation.y = a; }
  /** Current ground speed (m/s). */
  get speed() { return this._speed; }
  /** Current base clip ('locomotion' while standing/walking). */
  get clip() { return this.animator.current; }
  get position() { return this.object.position; }

  /**
   * Play a clip: {loop (default: the clip's own), fade=0.25, speed=1, layer:'full'|'upper', next, hold, onEvent:{evt:fn}}.
   * 'idle' returns to standing/locomotion (standing up first when seated). Gestures automatically play on the
   * upper body while walking, sitting or carrying. Resolves at the end of one-shot clips (false if interrupted).
   */
  play(clip, opts = {}) {
    const A = this.animator;
    const name = clip === 'idle' || clip === 'locomotion' ? 'locomotion' : clip;
    if (!A.has(name)) { console.warn('[actors] unknown clip', clip); return Promise.resolve(false); }
    const o = { fade: 0.25, ...opts };
    if (o.loop === undefined) delete o.loop;
    const cur = A.current;
    const seated = cur && (SEATED.has(cur) || GROUNDED.has(cur));
    const moving = this._speed > 0.4;
    if (!o.layer && UPPER_OK.has(name) && (seated || moving || this._carry)) o.layer = 'upper';
    if (o.layer === 'upper') { if (name !== 'talk') this._talkGesture = false; return A.play(name, o); }
    // a full-body clip replaces any upper override (unless it's the carry pose)
    if (A.upperName && !this._carry) A.stopUpper(Math.min(0.25, o.fade));
    this._talkGesture = false;
    // standing clips from a seat: stand up first
    if (cur && SEATED.has(cur) && !SEATED.has(name) && name !== 'stand_up' && !GROUNDED.has(name)) {
      return A.play('stand_up', { fade: 0.2, hold: true }).then(ok => (ok ? A.play(name, { ...o, fade: 0.3 }) : false));
    }
    if (cur && GROUNDED.has(cur) && !GROUNDED.has(name) && opts.fade === undefined) o.fade = 0.6;   // ease out of the floor
    return A.play(name, o);
  }

  /** End an upper-body overlay (wave, talk, carry…). */
  stopUpper(fade = 0.3) { this._talkGesture = false; this.animator.stopUpper(fade); }

  /** Look at an Object3D / Vector3 / Human / Npc (its face) — null releases. */
  lookAt(target, { weight = 1 } = {}) {
    if (target instanceof Human) target = target.head;
    else if (target?.human instanceof Human) target = target.human.head;
    else if (target?.isObject3D && target.userData?.head) target = target.userData.head;
    this._lookTarget = target || null; this._lookWeight = weight;
  }
  get lookTarget() { return this._lookTarget; }

  /** Facial expression (see EXPRESSIONS), eased over dur seconds. */
  setExpression(name, { dur = 0.2 } = {}) { this.faceCtl.set(name, { dur }); }
  get expression() { return this.faceCtl.expression; }

  /** Mouth chatter on/off. While talking and standing still, gentle hand gestures play on the upper body. */
  talk(on, { gesture = true } = {}) {
    this.faceCtl.talk(!!on);
    const A = this.animator;
    if (on && gesture && !A.upperName && !this._carry && (A.current === 'locomotion' || SEATED.has(A.current))) {
      this._talkGesture = true;
      A.play('talk', { layer: 'upper', fade: 0.45, loop: true });
    } else if (!on && this._talkGesture) {
      this._talkGesture = false;
      if (A.upperName === 'talk') A.stopUpper(0.5);
    }
  }

  /** Attach an object to a slot (handR handL head back hips); null detaches (does not dispose). */
  attach(slot, obj) {
    const boneName = SLOTS[slot];
    if (!boneName) { console.warn('[actors] unknown attach slot', slot); return; }
    const prev = this._attach[slot];
    if (prev?.obj && prev.obj.parent === prev.socket) prev.socket.remove(prev.obj);
    if (!obj) { if (prev) prev.obj = null; return; }
    let socket = prev?.socket;
    if (!socket || socket.parent !== this.bones[boneName]) {
      socket = new THREE.Object3D(); socket.name = 'socket:' + slot;
      this.bones[boneName].add(socket);
      if (slot === 'handR' || slot === 'handL') {
        // palm centre: back along the hand from the fingertip bone, in bind (model) axes
        const k = slot === 'handL' ? 1 : -1;
        socket.position.set(-Math.sin(ARM_ANGLE) * k * 0.035, Math.cos(ARM_ANGLE) * 0.035, 0.012);
      } else if (slot === 'back') socket.position.set(0, 0, -0.1);
    }
    obj.parent?.remove(obj);
    socket.add(obj);
    this._attach[slot] = { socket, obj };
  }
  attached(slot) { return this._attach[slot]?.obj || null; }

  /** Rebuild with a new look (keeps position, facing, clip and attachments). */
  setLook(look) { this._build(look); }

  /**
   * Walk (or run) to {x,z}. opts: {run=false, stopDist=0.15, speed, face (angle on arrival)}.
   * Resolves true on arrival, false if interrupted/stuck.
   */
  moveTo(p, { run = false, stopDist = 0.15, speed = null, face = null } = {}) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return Promise.resolve(false);
    this._cancelMove(false);
    this._turn?.resolve(false); this._turn = null;
    if (this.animator.current !== 'locomotion') this.play('idle', { fade: 0.3 });
    return new Promise(resolve => {
      this._move = { x: p.x, z: p.z, run, stopDist: Math.max(0.05, stopDist), speed: speed ?? (run ? 5.2 : 1.7), face, resolve, stuckT: 0, best: Infinity };
    });
  }
  _cancelMove(v) { if (this._move) { const m = this._move; this._move = null; m.resolve(v); } }
  /** Stop walking now (eases to a halt). */
  stop() { this._cancelMove(false); }
  get moving() { return !!this._move; }

  /** Turn to an angle or toward {x,z} / Object3D / Human, eased. Resolves when done. */
  face(target, { dur = 0.4 } = {}) {
    let ang = target;
    if (typeof target !== 'number') {
      const t = target?.isObject3D ? target.getWorldPosition(_p) : target?.object?.isObject3D ? target.object.getWorldPosition(_p) : target;
      if (!t || !Number.isFinite(t.x)) return Promise.resolve(false);
      const dx = t.x - this.object.position.x, dz = t.z - this.object.position.z;
      if (dx * dx + dz * dz < 1e-6) return Promise.resolve(true);
      ang = Math.atan2(dx, dz);
    }
    if (!Number.isFinite(ang)) return Promise.resolve(false);
    this._turn?.resolve(false); this._turn = null;
    const from = this.object.rotation.y, delta = wrap(ang - from);
    if (Math.abs(delta) < 0.02 || dur <= 0) { this.object.rotation.y = from + delta; return Promise.resolve(true); }
    return new Promise(resolve => {
      this._turn = { from, delta, t: 0, dur: Math.max(0.15, dur * (0.55 + 0.45 * Math.min(1, Math.abs(delta) / Math.PI))), resolve };
    });
  }

  /** Place on the ground at x,z (optionally facing); cancels walking and resets the springs. */
  teleport(x, z, facing) {
    this._cancelMove(false); this._turn?.resolve(false); this._turn = null;
    this.object.position.set(x, this._ground(x, z), z);
    if (Number.isFinite(facing)) this.object.rotation.y = facing;
    this._speed = 0; this._hipDrop = 0;
    for (const j of this._jig) j.reset();
  }

  setVisible(v) { this.object.visible = !!v; }

  /** World position of a bone (e.g. 'head', 'chest', 'hand_R', 'foot_L', 'shoulder_L'). */
  bonePos(name, out = new THREE.Vector3()) { const b = this.bones[name]; if (!b) return out.copy(this.object.position); return b.getWorldPosition(out); }

  /**
   * Hand IK: put the palm of `side` ('L'|'R') on a target — Vector3, Object3D, or fn(out:Vector3, t:number) → Vector3 —
   * blended in over `fade` seconds; null releases. offset: Vector3 added in world space.
   */
  setHandTarget(side, target, { weight = 1, fade = 0.35, offset = null } = {}) {
    const h = this._hand[side === 'L' ? 'L' : 'R'];
    if (target) { h.target = target; h.goal = weight; } else h.goal = 0;
    h.fade = Math.max(0.05, fade); h.offset = offset;
  }
  clearHandTargets(fade = 0.35) { this.setHandTarget('L', null, { fade }); this.setHandTarget('R', null, { fade }); }

  /**
   * Feed the locomotion blend directly (player controller): speed m/s, turnRate rad/s, accel m/s².
   * Call every frame; the autopilot (moveTo) overrides it.
   */
  drive(speed, turnRate = 0, accel = 0) { this._drive = { speed, turnRate, accel }; }

  /** Snap springs and smoothing after a teleport / restage. */
  resetSprings() { for (const j of this._jig) j.reset(); this._roll = this._pitch = this._hipDrop = 0; }

  dispose() {
    HUMANS.delete(this);
    this._cancelMove(false); this._turn?.resolve(false);
    this.object.removeFromParent();
    this._disposeBuilt();
  }

  // ------------------------------------------------------------------------------------------ per frame
  /** Advance the human by dt seconds (called by the actors loop). */
  update(dt) {
    if (!this.object.parent) return;
    this._t += dt;
    this._locomote(dt);
    if (!this.object.visible) return;
    // distance LOD: far characters animate at half rate
    const cam = this.ctx.camera;
    if (cam) {
      cam.getWorldPosition(_cam);
      const d2 = _cam.distanceToSquared(this.object.getWorldPosition(_p));
      // outlines only near the camera (they double the triangles and vanish at distance anyway)
      this.outline.visible = (this.ctx.quality ? !!this.ctx.quality.outlines : true) && d2 < 24 * 24;
      if (d2 > 34 * 34) {
        this._accum += dt;
        if ((this.ctx.loop?.frame ?? 0) % 2) return;
        dt = this._accum; this._accum = 0;
      } else this._accum = 0;
    }
    this._animate(dt);
  }

  _locomote(dt) {
    const o = this.object, m = this._move;
    let speedGoal = 0, turnRate = 0, accel = 0;
    if (m) {
      const dx = m.x - o.position.x, dz = m.z - o.position.z, dist = Math.hypot(dx, dz);
      if (dist <= m.stopDist) {
        this._move = null;
        if (Number.isFinite(m.face)) this.face(m.face, { dur: 0.35 });
        m.resolve(true);
      } else {
        const want = Math.atan2(dx, dz), diff = wrap(want - o.rotation.y);
        const before = o.rotation.y;
        o.rotation.y += diff * (1 - Math.exp(-9 * dt));
        turnRate = wrap(o.rotation.y - before) / Math.max(dt, 1e-4);
        const align = Math.max(0, Math.cos(diff));                       // slow down while turning sharply
        const brake = Math.sqrt(2 * 4 * Math.max(0, dist - m.stopDist * 0.5)) + 0.35;
        speedGoal = Math.min(m.speed, brake) * (0.2 + 0.8 * align * align);
        if (dist < m.best - 0.05) { m.best = dist; m.stuckT = 0; } else if ((m.stuckT += dt) > 1.6) { this._move = null; m.resolve(false); }
      }
      const k = speedGoal > this._speed ? 6 : 9;
      const prev = this._speed;
      this._speed += (speedGoal - this._speed) * (1 - Math.exp(-k * dt));
      accel = (this._speed - prev) / Math.max(dt, 1e-4);
      if (this._speed > 0.01) this._step(dt);
    } else if (this._drive) {
      ({ speed: speedGoal, turnRate, accel } = this._drive);
      this._speed = speedGoal;
      this._drive = null;
    } else if (this._speed > 0.001) {
      const prev = this._speed;
      this._speed *= Math.exp(-9 * dt);
      if (this._speed < 0.02) this._speed = 0;
      accel = (this._speed - prev) / Math.max(dt, 1e-4);
      this._step(dt);
    }
    // eased turn in place (the feet shuffle a little)
    const tw = this._turn;
    let shuffle = 0;
    if (tw) {
      tw.t += dt;
      const u = Math.min(1, tw.t / tw.dur), e = easeInOut(u);
      const before = o.rotation.y;
      o.rotation.y = tw.from + tw.delta * e;
      turnRate = wrap(o.rotation.y - before) / Math.max(dt, 1e-4);
      if (Math.abs(tw.delta) > 0.6 && this.animator.current === 'locomotion') shuffle = Math.sin(Math.PI * u) * Math.min(0.8, Math.abs(tw.delta) * 0.45);
      if (u >= 1) { this._turn = null; tw.resolve(true); }
    }
    this._turnRate = turnRate; this._accel = accel;
    this.animator.setSpeed(Math.max(this._speed, shuffle));
  }
  _step(dt) {
    const o = this.object, step = this._speed * dt;
    const from = { x: o.position.x, z: o.position.z };
    const to = { x: from.x + Math.sin(o.rotation.y) * step, z: from.z + Math.cos(o.rotation.y) * step };
    const r = this.ctx.world?.resolveMove?.(from, to, 0.3) || to;
    o.position.x = r.x; o.position.z = r.z;
    o.position.y += (this._ground(r.x, r.z) - o.position.y) * (1 - Math.exp(-20 * dt));
  }

  _animate(dt) {
    const B = this.bones, A = this.animator, S = this.spec;
    this._resetPose();
    // three's PropertyMixer only writes a bone when its blended value changed since the previous frame; the
    // procedural layers start from the bind pose every frame, so poison the "previous" buffer.
    { const mx = A.mixer, ai = mx._accuIndex; for (const pm of mx._bindings || []) { const e = pm.valueSize; pm.buffer[ai * e + e] = NaN; } }
    A.update(dt);
    const M = A.meta;
    // clip root offsets are authored for body scale 1
    B.root.position.multiplyScalar(S.s);

    // ---- lean into turns / acceleration ----
    const speed = this._speed;
    const rollGoal = Math.max(-0.2, Math.min(0.2, -this._turnRate * speed * 0.03)) * M.lean;
    const pitchGoal = Math.max(-0.1, Math.min(0.14, this._accel * 0.02 + Math.max(0, speed - 3) * 0.02)) * M.lean;
    this._roll += (rollGoal - this._roll) * (1 - Math.exp(-6 * dt));
    this._pitch += (pitchGoal - this._pitch) * (1 - Math.exp(-4 * dt));
    if (Math.abs(this._roll) > 1e-4) {
      B.root.quaternion.premultiply(_q.setFromAxisAngle(_ax.set(0, 0, 1), this._roll * 0.5));
      B.spine.quaternion.premultiply(_q.setFromAxisAngle(_ax.set(0, 0, 1), this._roll * 0.4));
    }
    if (Math.abs(this._pitch) > 1e-4) B.spine.quaternion.premultiply(_q.setFromAxisAngle(_ax.set(1, 0, 0), this._pitch));

    // ---- breathing (faster after running) ----
    this._exert += ((speed > 3.5 ? 1 : 0) - this._exert) * (1 - Math.exp(-(speed > 3.5 ? 0.3 : 0.1) * dt));
    this._breath += dt * (0.26 + 0.24 * this._exert) * Math.PI * 2;
    const br = Math.sin(this._breath) * M.breathe * (1 + 0.7 * this._exert);
    B.chest.quaternion.premultiply(_q.setFromAxisAngle(_ax.set(1, 0, 0), -0.016 * br));
    B.shoulder_L.quaternion.premultiply(_q.setFromAxisAngle(_ax.set(0, 0, 1), 0.018 * br));
    B.shoulder_R.quaternion.premultiply(_q.setFromAxisAngle(_ax.set(0, 0, 1), -0.018 * br));
    B.head.quaternion.premultiply(_q.setFromAxisAngle(_ax.set(1, 0, 0), 0.008 * br));

    this.object.updateMatrixWorld(true);

    // ---- feet on uneven ground ----
    const fw = this.footIK ? M.footIK : 0;
    if (fw > 0.01) this._footIK(dt, fw); else this._hipDrop *= Math.exp(-8 * dt);

    // ---- look-at ----
    this.lookAtCtl.update(dt, this._lookTarget, M.look * this._lookWeight);

    // ---- hands on targets ----
    this._handIK('L', dt); this._handIK('R', dt);

    // ---- face ----
    this.faceCtl.update(dt, A.scalars, this.lookAtCtl.eyeShift);

    // ---- secondary motion ----
    for (const j of this._jig) j.update(dt);
  }

  _handIK(side, dt) {
    const h = this._hand[side];
    h.w += Math.sign(h.goal - h.w) * Math.min(Math.abs(h.goal - h.w), dt / h.fade);
    if (h.w < 0.005) { if (h.goal === 0) h.target = null; return; }
    if (!h.target) return;
    const B = this.bones;
    const tgt = _p2;
    if (typeof h.target === 'function') { if (!h.target(tgt, this._t)) return; }
    else if (h.target.isObject3D) h.target.getWorldPosition(tgt);
    else tgt.copy(h.target);
    if (h.offset) tgt.add(h.offset);
    // wrist target = palm point minus the palm offset along the (animated) hand direction
    const k = side === 'L' ? 1 : -1;
    B[`hand_${side}`].getWorldQuaternion(_q);
    _n.set(Math.sin(ARM_ANGLE) * k, -Math.cos(ARM_ANGLE), 0).applyQuaternion(_q);
    tgt.addScaledVector(_n, -0.05 * this.look.height);
    B[`lowerarm_${side}`].getWorldQuaternion(_q2);
    const fallback = _ax.set(1, 0, 0).applyQuaternion(_q2);
    twoBoneIK(B[`upperarm_${side}`], B[`lowerarm_${side}`], B[`hand_${side}`], tgt, easeInOut(Math.min(1, h.w)), fallback);
  }

  _footIK(dt, w) {
    const B = this.bones, o = this.object;
    const rootY = o.position.y;
    let dyL = 0, dyR = 0;
    const PL = B.foot_L.getWorldPosition(_p), PR = B.foot_R.getWorldPosition(_f);
    const gL = this._ground(PL.x, PL.z), gR = this._ground(PR.x, PR.z);
    if (Number.isFinite(gL)) dyL = Math.max(-0.35, Math.min(0.35, gL - rootY)) * w;
    if (Number.isFinite(gR)) dyR = Math.max(-0.35, Math.min(0.35, gR - rootY)) * w;
    const drop = Math.min(dyL, dyR, 0) + Math.max(0, Math.min(dyL, dyR)) * 0.5;
    this._hipDrop += (drop - this._hipDrop) * (1 - Math.exp(-14 * dt));
    if (Math.abs(this._hipDrop) > 1e-4) { B.root.position.y += this._hipDrop / this.look.height; B.root.updateMatrixWorld(true); }
    if (Math.abs(dyL) < 0.01 && Math.abs(dyR) < 0.01) return;
    for (const [s, P0, dy] of [['L', PL.clone(), dyL], ['R', PR.clone(), dyR]]) {
      const th = B[`thigh_${s}`], sh = B[`shin_${s}`], ft = B[`foot_${s}`];
      const target = P0; target.y += dy;
      th.getWorldQuaternion(_q2);
      const fallback = _ax.set(1, 0, 0).applyQuaternion(_q2);
      ft.getWorldQuaternion(_qe);
      const lift = P0.y - dy - rootY - 0.1;
      const plant = (1 - sstep(0.04, 0.2, lift)) * w;
      const g = groundNormal((x, z) => this._ground(x, z), P0.x, P0.z, _n);
      _q2.setFromUnitVectors(UP, g);
      _qe.premultiply(_qi.identity().slerp(_q2, plant));
      twoBoneIK(th, sh, ft, target, 1, fallback, _qe);
    }
  }
}
