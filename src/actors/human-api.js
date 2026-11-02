// Public Human object returned by actors.createHuman (contract: docs/ARCHITECTURE.md "Actors API").
// One procedural Sun/Moon character = skinned mesh + outline (2 draw calls), the clip Animator and the
// procedural layers applied every frame after the mixer:
//   lean into turns / acceleration · breathing · body resting on its support (seat / floor / knees / mattress) ·
//   feet planted (stance lock while walking, idle re-steps, uneven ground) · look-at · mouth reach (CCD) ·
//   hand IK onto body-surface contacts (palm oriented on the partner) · foot IK targets · face (expressions,
//   blink, saccades, talking mouth) · spring jiggle on hair, hats, backpacks and scarves.
// Outfit swaps (clothes ↔ underwear) only replace the skinned geometry: the pose and the animation carry on.
// Humans auto-update on the actors loop (index.js iterates HUMANS); body collisions live in bodies.js.
import * as THREE from 'three';
import { buildHuman, buildHumanGeometry } from './human.js';
import { normalizeLook, underwearLook } from './looks.js';
import { bakeLibrary } from './anim.js';
import { CLIPS, UPPER_OK, SIT_H } from './clips.js';
import { Animator } from './animator.js';
import { LookAt, Jiggle } from './procedural.js';
import { ARM_ANGLE } from './skeleton.js';
import { bodyMetrics, surfacePoint, resolveContact, twoBoneIKPole, handQuat, ccdReach, calibrateLoco, FootPlanter, CLIP_SUPPORT, lowestPoint } from './contact.js';

let LIB = null;
/** Baked clip library shared by every human. */
export function clipLibrary() { if (!LIB) LIB = bakeLibrary(CLIPS); return LIB; }

/** Every live Human (the actors loop updates them). */
export const HUMANS = new Set();

const _p = new THREE.Vector3(), _p2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _n = new THREE.Vector3(), _ax = new THREE.Vector3(), _cam = new THREE.Vector3(), _f = new THREE.Vector3();
const _s = new THREE.Vector3(), _al = new THREE.Vector3(), _pole = new THREE.Vector3(), _fb = new THREE.Vector3(), _w = new THREE.Vector3();
const _qh = new THREE.Quaternion(), _qa = new THREE.Quaternion();
const wrap = a => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
const easeInOut = u => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
/** Attach slots → bone. */
const SLOTS = { handR: 'prop_R', handL: 'prop_L', head: 'hat', back: 'back', hips: 'hips' };
/** Clips after which the character must stand up before doing anything standing. */
const SEATED = new Set(['sit_down', 'sit_idle', 'sit_feet']);
/** Floor / water / vehicle poses: leaving them uses a longer cross-fade. */
const GROUNDED = new Set(['sit_ground', 'sit_legs', 'sit_knees', 'kneel', 'kneel_bow', 'kneel_down', 'kneel_sit', 'kneel_reach', 'lie_back', 'sleep', 'defeat', 'swim', 'ride_scooter', 'ride_passenger']);
/** One-shot transitions: the support may push the body up (never through the seat) but not pull it down. */
const TRANSITION = new Set(['sit_down', 'stand_up', 'kneel_down', 'defeat']);
/** Planting distance from the camera (m) — beyond it feet just play the clip. */
const PLANT_DIST = 24;
const BOTTOMS = ['pants', 'shorts', 'skirt', 'long_skirt', 'pyjama', 'swim_shorts'];

/** Bodies with the same sex/age/build share one skeleton: an outfit change can swap the geometry only. */
const sameFrame = (a, b) => a && b && a.sex === b.sex && a.age === b.age && a.build === b.build;
const geoKey = (L) => JSON.stringify([L.top, L.bottom, L.shoes, L.hat, L.hair, L.accessory, L.accessoryColor, L.skin, L.eyes, L.lips, L.freckles]);

export class Human {
  /**
   * @param {any} ctx
   * @param {object} look  (partial looks are normalised)
   * @param {{id?:string, name?:string, footIK?:boolean, autoUpdate?:boolean}} [opts]  footIK: also tilt the planted feet to the ground slope
   */
  constructor(ctx, look, { id = null, name = '', footIK = false, autoUpdate = true } = {}) {
    this.ctx = ctx; this.id = id; this.name = name;
    this.object = new THREE.Group(); this.object.name = 'human:' + (id || name || 'anon');
    this.head = new THREE.Object3D(); this.head.name = 'head-anchor';
    this.object.userData.head = this.head; this.object.userData.human = this;
    this.footIK = footIK;
    /** false → this body ignores the body-collision pass (bodies.js). */
    this.collide = true;
    /** false → feet just play the clips (no planting IK). */
    this.planting = true;
    /** {seatY, floorY, lieY} world heights the body rests on (null = the defaults: floor = origin, seat = origin + 0.45 m). */
    this.support = null;
    this._attach = {};                                   // slot → {socket, obj}
    const limb = () => ({ target: null, w: 0, goal: 0, fade: 0.3, offset: null, normal: null, fingers: null, elbow: null, press: 0.004 });
    this._hand = { L: limb(), R: limb() };
    this._foot = { L: limb(), R: limb() };
    this._mouth = { target: null, w: 0, goal: 0, fade: 0.5, offset: 0.006 };
    /** Distance (m) between where the hands / mouth are and where they were asked to be (pairs read it to adjust spacing). */
    this.reachError = { L: 0, R: 0, mouth: 0 };
    /** Same as vectors (wanted − achieved, world): their projection on a direction is a signed spacing error. */
    this.reachVec = { L: new THREE.Vector3(), R: new THREE.Vector3(), mouth: new THREE.Vector3(), footL: new THREE.Vector3(), footR: new THREE.Vector3() };
    this._lookTarget = null; this._lookWeight = 1;
    this._move = null;                                   // moveTo autopilot
    this._turn = null;                                   // face() tween
    this._slide = null;                                  // sitOn / standUp glide of the origin
    this._speed = 0; this._turnRate = 0; this._accel = 0; this._drive = null;
    this._roll = 0; this._pitch = 0; this._breath = Math.random() * 6; this._exert = 0; this._t = Math.random() * 10;
    this._accum = 0; this._lift = 0; this._near = true;
    this._talkGesture = false; this._carry = false;
    this._geo = new Map();                               // outfit geometry cache (key → {geometry, outlineGeometry})
    this.outfit = 'clothes';
    this._groundFn = (x, z) => this._ground(x, z);
    this.onStep = null;                                  // (data) → void  footstep hook
    this.onEvent = null;                                 // (evt, clip, data) → void
    this._build(look);
    this.baseLook = this.look;
    if (autoUpdate) HUMANS.add(this);
  }

  // ------------------------------------------------------------------------------------------ build
  _build(look) {
    const ctx = this.ctx;
    const L = look?._n ? look : { ...normalizeLook(look), _n: true };
    if (this.model && sameFrame(this.look, L)) { this._swapGeometry(L); return; }
    const built = buildHuman(ctx, L);
    const prev = this.animator ? { name: this.animator.current, upper: this.animator.upperName } : null;
    if (this.model) { this.object.remove(this.model); this._disposeBuilt(); }
    this.built = built; this.look = L; this.model = built.model; this.bones = built.bones; this.spec = built.spec; this.faceCtl = built.face;
    this.mesh = built.mesh; this.outline = built.outline; this.skeleton = built.skeleton; this.meshes = built.meshes;
    this._geo.clear(); this._geo.set(geoKey(L), { geometry: this.mesh.geometry, outlineGeometry: this.outline.geometry });
    this.height = built.height;
    this.object.add(this.model);
    this.metrics = bodyMetrics(this.spec, L);
    this.object.userData.height = this.height;
    this.object.userData.radius = this.radius;
    const B = this.bones, S = this.spec;
    // head anchor (≈ face centre; the camera adds a little for eye level, markers float above)
    B.head.add(this.head);
    this.head.position.set(0, S.headC[1] - 0.03 * S.hr - S.joints.head[1], S.headC[2] - S.joints.head[2]);
    // bind pose for the per-frame reset
    this._bind = built.skeleton.bones.map(b => ({ b, p: b.position.clone() }));
    // animator (strides measured on this body so the planted feet never slide)
    const idle = L.sex === 'f' && L.age === 'adult' ? 'idle_f' : 'idle';
    this.animator = new Animator(this.mesh, clipLibrary(), { idle });
    this.animator.defaultFor = () => this._defaultClip();
    this.animator.onEvent = (evt, clip, data) => {
      if (evt === 'step') this.onStep?.(data);
      this.onEvent?.(evt, clip, data);
    };
    this._resetPose();
    this._cal = calibrateLoco(this);
    this.animator.stride = { walk: this._cal.walk.stride, run: this._cal.run.stride };
    this._planter = new FootPlanter(this);
    this.lookAtCtl = new LookAt(built);
    this._setupJiggles();
    // re-attach props
    for (const [slot, a] of Object.entries(this._attach)) { const o = a.obj; delete this._attach[slot]; if (o) this.attach(slot, o); }
    this._resetPose();
    this.animator.play(prev?.name && prev.name !== 'locomotion' && this.animator.has(prev.name) ? prev.name : 'locomotion', { fade: 0 });
    if (prev?.upper) this.animator.play(prev.upper, { layer: 'upper', fade: 0 });
    this.model.updateMatrixWorld(true);
  }

  /** Same skeleton, new clothes: swap the skinned geometry only (pose, clip, IK and expression carry on). */
  _swapGeometry(L) {
    const key = geoKey(L);
    let g = this._geo.get(key);
    if (!g) {
      const b = buildHumanGeometry(L, this.spec);
      g = { geometry: b.geometry, outlineGeometry: b.outlineGeometry };
      this._geo.set(key, g);
      // keep the base outfit + at most two others
      if (this._geo.size > 3) for (const [k, v] of this._geo) {
        if (v === g || k === geoKey(this.baseLook || L) || v.geometry === this.mesh.geometry) continue;
        v.geometry.dispose(); v.outlineGeometry.dispose(); this._geo.delete(k); break;
      }
    }
    this.mesh.geometry = g.geometry; this.outline.geometry = g.outlineGeometry;
    this.look = L;
    this.model.scale.setScalar(L.height);
    this.height = (this.spec.top + 0.012) * L.height;
    this.object.userData.height = this.height;
    this.metrics = bodyMetrics(this.spec, L);
    this._setupJiggles();
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
    const seen = new Set();
    for (const g of this._geo.values()) { seen.add(g.geometry); g.geometry.dispose(); g.outlineGeometry.dispose(); }
    if (this.mesh && !seen.has(this.mesh.geometry)) { this.mesh.geometry.dispose(); this.outline?.geometry.dispose(); }
    this._geo.clear();
    this.skeleton?.dispose?.();
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
    if (cur === 'kneel_down') return 'kneel';
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
  /** Body collision radius (m): shoulders + arms of this body at its height. */
  get radius() { return Math.max(0.12, this.metrics.radius * this.look.height); }
  /** Seated / kneeling / lying / riding (not standing). */
  get grounded() { const c = this.animator.current; return !!c && (SEATED.has(c) || GROUNDED.has(c) || c === 'stand_up'); }

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

  /**
   * New look. Same sex/age/build → only the clothes/hair geometry is swapped (pose and animation carry on);
   * otherwise the body is rebuilt (keeps position, facing, clip and attachments).
   */
  setLook(look) {
    this._build(look);
    const L = this.look;
    // a plain look (not the underwear set) becomes the new "clothes" outfit
    if (L.top.style !== 'underwear') { this.baseLook = L; this.outfit = 'clothes'; } else this.outfit = 'underwear';
  }

  /**
   * Outfit swap on the same body: 'clothes' (the base look), 'underwear' (romance only: bra + briefs / briefs,
   * barefoot — never less), 'top' (top already off, bottoms still on; dresses / swimsuits / coats skip it and go
   * straight to the full underwear set) or a look object. Instant (geometry swap); see undress() / dress().
   */
  setOutfit(kind = 'clothes', { color = null } = {}) {
    const base = this.baseLook || this.look;
    let look;
    if (kind === 'clothes') look = base;
    else if (kind === 'underwear') look = { ...underwearLook(base, { color }), _n: true };
    else if (kind === 'top') {
      const uw = underwearLook(base, { color });
      if (BOTTOMS.includes(base.bottom?.style)) look = { ...base, top: uw.top, hat: null, accessory: uw.accessory, _n: true };
      else { look = { ...uw, _n: true }; kind = 'underwear'; }
    } else if (kind && typeof kind === 'object') { look = kind; kind = 'custom'; }
    else return;
    this._build(look);
    this.outfit = kind;
    this.ctx.bus?.emit?.('actor:outfit', { id: this.id, outfit: kind });
  }

  /** Build an outfit's geometry ahead of time (no hitch when it is put on later). */
  prepareOutfit(kind = 'underwear', opts = {}) {
    const run = () => {
      const base = this.baseLook || this.look;
      const look = kind === 'underwear' ? { ...underwearLook(base, opts), _n: true } : null;
      if (!look || !sameFrame(this.look, look) || !this.mesh) return;
      const key = geoKey(look);
      if (!this._geo.has(key)) { const b = buildHumanGeometry(look, this.spec); this._geo.set(key, { geometry: b.geometry, outlineGeometry: b.outlineGeometry }); }
    };
    (globalThis.requestIdleCallback || ((fn) => setTimeout(fn, 30)))(run);
  }

  /**
   * Take the clothes off down to the underwear with a gesture (top over the head, then the bottoms), swapping the
   * outfit at the covered moments. {animate=true, color}. Resolves when done. Never goes beyond the underwear.
   */
  async undress({ animate = true, color = null } = {}) {
    if (this.outfit === 'underwear') return true;
    if (!animate || this.grounded) { this.setOutfit('underwear', { color }); return true; }
    this.stop();
    const hasBottoms = BOTTOMS.includes((this.baseLook || this.look).bottom?.style);
    await this.play('undress_top', { fade: 0.25, onEvent: { swap: () => this.setOutfit(hasBottoms ? 'top' : 'underwear', { color }) } });
    if (this.outfit !== 'underwear') await this.play('undress_bottom', { fade: 0.2, onEvent: { swap: () => this.setOutfit('underwear', { color }) } });
    if (this.outfit !== 'underwear') this.setOutfit('underwear', { color });
    return true;
  }

  /** Back into the clothes (pull-on gesture unless animate=false). */
  async dress({ animate = true } = {}) {
    if (this.outfit === 'clothes') return true;
    if (!animate || this.grounded) { this.setOutfit('clothes'); return true; }
    this.stop();
    await this.play('undress_top', { fade: 0.25, onEvent: { swap: () => this.setOutfit('clothes') } });
    if (this.outfit !== 'clothes') this.setOutfit('clothes');
    return true;
  }

  /**
   * Walk (or run) to {x,z}. opts: {run=false, stopDist=0.15, speed, face (angle on arrival)}.
   * Resolves true on arrival, false if interrupted/stuck. Steers around other people (bodies.js).
   */
  moveTo(p, { run = false, stopDist = 0.15, speed = null, face = null } = {}) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return Promise.resolve(false);
    this._cancelMove(false);
    this._turn?.resolve(false); this._turn = null;
    if (this.animator.current !== 'locomotion') { this.support = null; this.play('idle', { fade: 0.3 }); }
    return new Promise(resolve => {
      this._move = { x: p.x, z: p.z, run, stopDist: Math.max(0.05, stopDist), speed: speed ?? (run ? 5.2 : 1.7), face, resolve, stuckT: 0, best: Infinity };
    });
  }
  _cancelMove(v) { if (this._move) { const m = this._move; this._move = null; m.resolve(v); } }
  /** Stop walking now (eases to a halt). */
  stop() { this._cancelMove(false); }
  get moving() { return !!this._move; }

  /** Turn to an angle or toward {x,z} / Object3D / Human, eased (the planted feet step around). Resolves when done. */
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
      this._turn = { from, delta, t: 0, dur: Math.max(0.2, dur * (0.6 + 0.6 * Math.min(1, Math.abs(delta) / Math.PI))), resolve };
    });
  }

  /** Place on the ground at x,z (optionally facing); cancels walking and resets the springs and planted feet. */
  teleport(x, z, facing) {
    this._cancelMove(false); this._turn?.resolve(false); this._turn = null; this._slide?.resolve(false); this._slide = null;
    this.object.position.set(x, this._ground(x, z), z);
    if (Number.isFinite(facing)) this.object.rotation.y = facing;
    this._speed = 0;
    this.resetSprings();
  }

  setVisible(v) { this.object.visible = !!v; }

  /** World position of a bone (e.g. 'head', 'chest', 'hand_R', 'foot_L', 'shoulder_L'). */
  bonePos(name, out = new THREE.Vector3()) { const b = this.bones[name]; if (!b) return out.copy(this.object.position); return b.getWorldPosition(out); }

  /**
   * A point ON this body's surface (world) and its outward normal: surface('back', {u, a}), surface('shoulder_L'),
   * surface('foot_R', {u: 0.5}) … (regions in contact.js / docs/ARCHITECTURE.md). outN optional.
   */
  surface(region, params = {}, outP = new THREE.Vector3(), outN = null) { return surfacePoint(this, region, params, outP, outN); }

  /**
   * Hand IK. target: a contact on a body {human, region, params?, slide?: t → params, offset?} (the palm lies ON
   * that surface, oriented to it), or a Vector3 / Object3D / fn(out, t) → Vector3 (palm point; add `normal`
   * (Vector3 | fn(outN, t)) to lay the palm flat on a surface like a table). null releases.
   * opts: {weight=1, fade=0.35, offset (world Vector3), normal, fingers: Vector3|'down'|'up'|fn(out, t),
   *        elbow: 'out'|'down'|'back'|Vector3 (pole direction), press=0.004 m into the surface}
   */
  setHandTarget(side, target, { weight = 1, fade = 0.35, offset = null, normal = null, fingers = null, elbow = null, press = 0.004 } = {}) {
    const h = this._hand[side === 'L' ? 'L' : 'R'];
    if (target) Object.assign(h, { target, goal: weight, normal, fingers, elbow, press });
    else h.goal = 0;
    h.fade = Math.max(0.05, fade); h.offset = offset;
  }
  /** Same as setHandTarget (reads better in scene code). */
  reach(side, target, opts) { this.setHandTarget(side, target, opts); }
  /** Palm of `side` on a partner's body region: touch('R', her, 'shoulder_L', {u: 0.6}, {fade: 0.5, slide: t => ({u})}). */
  touch(side, human, region, params = {}, opts = {}) {
    const hh = human?.human || human;
    this.setHandTarget(side, hh && region ? { human: hh, region, params, slide: opts.slide, offset: opts.offset ?? 0 } : null, opts);
  }
  clearHandTargets(fade = 0.35) { this.setHandTarget('L', null, { fade }); this.setHandTarget('R', null, { fade }); }

  /**
   * Foot IK: the sole of `side` on a target (contact {human, region, …} | Vector3 | Object3D | fn(out, t)),
   * opts {weight=1, fade=0.4, normal (surface normal, default up)}. null releases.
   */
  setFootTarget(side, target, { weight = 1, fade = 0.4, normal = null } = {}) {
    const f = this._foot[side === 'L' ? 'L' : 'R'];
    if (target) Object.assign(f, { target, goal: weight, normal });
    else f.goal = 0;
    f.fade = Math.max(0.05, fade);
  }
  clearFootTargets(fade = 0.4) { this.setFootTarget('L', null, { fade }); this.setFootTarget('R', null, { fade }); }

  /**
   * Bring the mouth to a point (kiss, kiss on the neck / foot, whisper at the ear): spine → head CCD.
   * target: contact {human, region, params?, slide?} | Vector3 | Object3D | fn(out, t); null releases.
   * opts {weight=1, fade=0.5, offset=0.006 m off the surface}. Overrides the look-at while active.
   */
  mouthTo(target, { weight = 1, fade = 0.5, offset = 0.006 } = {}) {
    const m = this._mouth;
    if (target) Object.assign(m, { target, goal: weight, offset }); else m.goal = 0;
    m.fade = Math.max(0.05, fade);
  }

  /** Surfaces the body rests on: {seatY, floorY, lieY} (world y). null = defaults. */
  setSupport(s) { this.support = s ? { ...s } : null; }

  /**
   * Sit on a seat {x, z, y: seat top, facing: the way the sitter looks} (chair, bench, sofa, bed edge): walks to
   * the front of it (walk=false: appears there), turns, sits down while gliding back onto it; the hips rest on
   * the seat and the feet on the floor whatever the seat height. opts {walk=true, run, floorY, clip='sit_idle'|'sit_feet'}.
   */
  async sitOn(seat, { walk = true, run = false, floorY = null, clip = 'sit_idle' } = {}) {
    const s = this._spot(seat); if (!s) return false;
    const f = s.facing, front = { x: s.x + Math.sin(f) * 0.42, z: s.z + Math.cos(f) * 0.42 };
    if (this.grounded) await this.standUp();
    const was = this.collide; this.collide = false;                // the seat may be inside furniture colliders
    if (walk) await this.moveTo(front, { run, stopDist: 0.06 });
    else this.teleport(front.x, front.z, f);
    await this.face(f, { dur: 0.35 });
    const fy = Number.isFinite(floorY) ? floorY : this._ground(front.x, front.z);
    this.setSupport({ seatY: Number.isFinite(s.y) ? s.y : fy + SIT_H, floorY: fy });
    this._glide({ x: s.x, z: s.z }, 0.85, 0.15, fy);
    const ok = await this.play('sit_down', { fade: 0.25 });
    this.collide = was;
    if (ok && clip && clip !== 'sit_idle') this.play(clip, { fade: 0.45 });
    return ok;
  }

  /** Kneel at {x, z, facing} (walks there unless walk=false). opts {walk=true, bow=false, floorY}. */
  async kneelAt(spot, { walk = true, bow = false, floorY = null } = {}) {
    const s = this._spot(spot); if (!s) return false;
    if (this.grounded) await this.standUp();
    if (walk) await this.moveTo(s, { stopDist: 0.06 }); else this.teleport(s.x, s.z, s.facing);
    await this.face(s.facing, { dur: 0.35 });
    this.setSupport({ floorY: Number.isFinite(floorY) ? floorY : this._ground(s.x, s.z) });
    const ok = await this.play('kneel_down', { fade: 0.25 });
    if (bow) this.play('kneel_bow', { fade: 0.5 });
    return ok;
  }

  /** Sit on the floor / ground at {x, z, facing}. opts {walk=true, clip='sit_ground'|'sit_legs'|'sit_knees', floorY}. */
  async sitGround(spot, { walk = true, clip = 'sit_ground', floorY = null } = {}) {
    const s = this._spot(spot); if (!s) return false;
    if (this.grounded) await this.standUp();
    if (walk) await this.moveTo(s, { stopDist: 0.06 }); else this.teleport(s.x, s.z, s.facing);
    await this.face(s.facing, { dur: 0.35 });
    this.setSupport({ floorY: Number.isFinite(floorY) ? floorY : this._ground(s.x, s.z) });
    this.play(clip, { fade: 0.8 });
    return true;
  }

  /** Lie on the back on a surface {x, z, y: surface top, facing: toward where the head goes} (bed, blanket). Instant (use a fade). */
  lieOn(spot, { clip = 'lie_back' } = {}) {
    const s = this._spot(spot); if (!s) return false;
    this.teleport(s.x, s.z, s.facing + Math.PI);
    const y = Number.isFinite(s.y) ? s.y : this.object.position.y;
    this.object.position.y = y;
    this.setSupport({ lieY: y, floorY: y });
    this.play(clip, { fade: 0 });
    return true;
  }

  /** Get up from a seat / the floor (glides forward off a seat). Resolves when standing. */
  async standUp() {
    const A = this.animator, cur = A.current;
    if (!cur || cur === 'locomotion') { this.support = null; return true; }
    if (SEATED.has(cur)) {
      const f = this.facing;
      this._glide({ x: this.object.position.x + Math.sin(f) * 0.36, z: this.object.position.z + Math.cos(f) * 0.36 }, 0.75, 0.2, this.support?.floorY);
      const ok = await A.play('stand_up', { fade: 0.2, hold: true });
      A.play('locomotion', { fade: 0.3 });
      this.support = null;
      return ok;
    }
    A.play('locomotion', { fade: 0.6 });
    await new Promise(r => setTimeout(r, 450));
    this.support = null;
    return true;
  }

  _spot(p) {
    if (!p) return null;
    if (p.isObject3D) { p.getWorldPosition(_p); return { x: _p.x, y: p.userData?.seatY ?? _p.y, z: _p.z, facing: p.userData?.facing ?? p.rotation.y }; }
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
    return { x: p.x, y: p.y, z: p.z, facing: Number.isFinite(p.facing) ? p.facing : this.facing };
  }
  /** Glide the origin to {x,z} over dur seconds (after `delay`), keeping it on y (or the ground). */
  _glide(to, dur, delay = 0, y = null) {
    this._slide?.resolve(false);
    return new Promise(resolve => {
      this._slide = { from: this.object.position.clone(), to: new THREE.Vector3(to.x, Number.isFinite(y) ? y : this._ground(to.x, to.z), to.z), t: -delay, dur, resolve };
    });
  }

  /**
   * Feed the locomotion blend directly (player controller): speed m/s, turnRate rad/s, accel m/s².
   * Call every frame; the autopilot (moveTo) overrides it.
   */
  drive(speed, turnRate = 0, accel = 0) { this._drive = { speed, turnRate, accel }; }

  /** Snap springs, planted feet and smoothing after a teleport / restage. */
  resetSprings() { for (const j of this._jig) j.reset(); this._roll = this._pitch = 0; this._planter?.reset(); }

  dispose() {
    HUMANS.delete(this);
    this._cancelMove(false); this._turn?.resolve(false); this._slide?.resolve(false);
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
    // distance LOD: far characters animate at half rate and skip the foot planting
    const cam = this.ctx.camera;
    if (cam) {
      cam.getWorldPosition(_cam);
      const d2 = _cam.distanceToSquared(this.object.getWorldPosition(_p));
      // outlines only near the camera (they double the triangles and vanish at distance anyway)
      this.outline.visible = (this.ctx.quality ? !!this.ctx.quality.outlines : true) && d2 < 24 * 24;
      this._near = d2 < PLANT_DIST * PLANT_DIST;
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
        let want = Math.atan2(dx, dz);
        // steer around people in the way (bodies.js)
        const bodies = this.ctx.actors?.bodies;
        if (bodies && this.collide) want = bodies.steer(this, want, dist);
        const diff = wrap(want - o.rotation.y);
        const before = o.rotation.y;
        o.rotation.y += diff * (1 - Math.exp(-7 * dt));
        turnRate = wrap(o.rotation.y - before) / Math.max(dt, 1e-4);
        const align = Math.max(0, Math.cos(diff));                       // slow down while turning sharply
        const brake = Math.sqrt(2 * 3 * Math.max(0, dist - m.stopDist * 0.5)) + 0.3;
        speedGoal = Math.min(m.speed, brake) * (0.15 + 0.85 * align * align);
        if (dist < m.best - 0.05) { m.best = dist; m.stuckT = 0; } else if ((m.stuckT += dt) > 2.2) { this._move = null; m.resolve(false); }
      }
      // ease in (≈ 5 m/s² start) and out
      const k = speedGoal > this._speed ? 4.5 : 7;
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
      this._speed *= Math.exp(-7 * dt);
      if (this._speed < 0.02) this._speed = 0;
      accel = (this._speed - prev) / Math.max(dt, 1e-4);
      this._step(dt);
    }
    // eased turn in place (the planted feet step around by themselves)
    const tw = this._turn;
    if (tw) {
      tw.t += dt;
      const u = Math.min(1, tw.t / tw.dur), e = easeInOut(u);
      const before = o.rotation.y;
      o.rotation.y = tw.from + tw.delta * e;
      turnRate = wrap(o.rotation.y - before) / Math.max(dt, 1e-4);
      if (u >= 1) { this._turn = null; tw.resolve(true); }
    }
    // sitOn / standUp glide
    const sl = this._slide;
    if (sl) {
      sl.t += dt;
      const u = clamp(sl.t / sl.dur, 0, 1), e = easeInOut(u);
      if (sl.t >= 0) o.position.lerpVectors(sl.from, sl.to, e);
      if (u >= 1) { this._slide = null; sl.resolve(true); }
    }
    this._turnRate = turnRate; this._accel = accel;
    this.animator.setSpeed(this._speed);
  }
  _step(dt) {
    const o = this.object, step = this._speed * dt;
    const from = { x: o.position.x, z: o.position.z };
    const to = { x: from.x + Math.sin(o.rotation.y) * step, z: from.z + Math.cos(o.rotation.y) * step };
    const r = this.ctx.world?.resolveMove?.(from, to, Math.max(0.28, this.radius)) || to;
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

    // ---- lean into turns / acceleration (weight shift) ----
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

    // ---- the body rests on its support: hips on the seat, knees / bottom on the floor, back on the mattress ----
    const sitW = this._supportSolve(dt, M);

    // ---- feet planted on the ground (stance lock, idle steps, slopes) ----
    const pw = this.planting && this._near && !this._slide ? M.footIK * (1 - sitW) : 0;
    this._planter.update(dt, pw, this._groundFn, A.locoW, A.phase, this._cal, this.footIK);

    // ---- explicit foot targets ----
    this._footTargets(dt);

    // ---- look-at (the mouth reach takes over while it is active) ----
    this.lookAtCtl.update(dt, this._lookTarget, M.look * this._lookWeight * (1 - this._mouth.w));
    this._mouthIK(dt);

    // ---- hands on targets ----
    this._handIK('L', dt); this._handIK('R', dt);

    // ---- face ----
    this.faceCtl.update(dt, A.scalars, this.lookAtCtl.eyeShift);

    // ---- secondary motion ----
    for (const j of this._jig) j.update(dt);
  }

  /** Lift/lower the whole body so it rests on the surface of its pose; seated feet go onto the floor. → support weight */
  _supportSolve(dt, M) {
    const B = this.bones, clip = this.clip;
    const kind = this.animator.lib[clip]?.def.meta.support ?? CLIP_SUPPORT[clip];
    const gw = kind ? clamp((M.sit - 0.3) / 0.6, 0, 1) : 0;
    const oy = this.object.position.y, sp = this.support || {};
    let lift = 0;
    if (gw > 0.001) {
      const surf = kind === 'seat' ? (sp.seatY ?? oy + SIT_H) : kind === 'lie' ? (sp.lieY ?? oy) : (sp.floorY ?? oy);
      let need = surf - lowestPoint(this, kind);
      if (TRANSITION.has(clip)) need = Math.max(0, need);
      lift = clamp(need, -0.4, 0.5) * gw;
    }
    this._lift += (lift - this._lift) * (1 - Math.exp(-12 * dt));
    if (Math.abs(this._lift) > 1e-4) { B.root.position.y += this._lift / this.look.height; B.root.updateMatrixWorld(true); }
    if (kind === 'seat' && gw > 0.01) {
      // feet flat on the floor (seat higher/lower than authored: the knees adapt)
      const floor = sp.floorY ?? oy, fwd = _f.set(Math.sin(this.facing), 0, Math.cos(this.facing));
      for (const side of ['L', 'R']) {
        const ft = B[`foot_${side}`];
        surfacePoint(this, `foot_${side}`, { sole: true }, _s);
        const dy = floor - _s.y;
        if (Math.abs(dy) < 0.004) continue;
        ft.getWorldPosition(_p2); _p2.y += dy;
        B[`thigh_${side}`].getWorldPosition(_pole).addScaledVector(fwd, 1); _pole.y += 0.3;
        B[`shin_${side}`].getWorldQuaternion(_q); _fb.set(1, 0, 0).applyQuaternion(_q);
        twoBoneIKPole(B[`thigh_${side}`], B[`shin_${side}`], ft, _p2, gw, _fb, null, _pole, 0.5);
      }
    }
    return kind ? gw : 0;
  }

  /** Resolve a hand/foot/mouth target into world point (+ normal when known). → 'contact' | 'point' | null */
  _resolve(st, outP, outN) {
    const t = st.target;
    if (!t) return null;
    if (t.region) return resolveContact(t, this._t, outP, outN) ? 'contact' : null;
    if (typeof t === 'function') { if (!t(outP, this._t)) return null; }
    else if (t.isObject3D) t.getWorldPosition(outP);
    else outP.copy(t);
    if (st.offset?.isVector3) outP.add(st.offset);
    if (st.normal) { if (typeof st.normal === 'function') st.normal(outN, this._t); else outN.copy(st.normal); outN.normalize(); return 'contact'; }
    return 'point';
  }

  _handIK(side, dt) {
    const h = this._hand[side];
    h.w += Math.sign(h.goal - h.w) * Math.min(Math.abs(h.goal - h.w), dt / h.fade);
    if (h.w < 0.005) { if (h.goal === 0) h.target = null; this.reachError[side] = 0; this.reachVec[side].set(0, 0, 0); return; }
    if (!h.target) return;
    const B = this.bones, k = side === 'L' ? 1 : -1, H = this.look.height, Mx = this.metrics;
    const ua = B[`upperarm_${side}`], la = B[`lowerarm_${side}`], hb = B[`hand_${side}`];
    const tgt = _p2, nrm = _n;
    const mode = this._resolve(h, tgt, nrm);
    if (!mode) return;
    const w = easeInOut(Math.min(1, h.w));
    ua.getWorldPosition(_s);
    // elbow pole: out to the side and down (or the requested direction)
    const fwd = _f.set(Math.sin(this.facing), 0, Math.cos(this.facing)), left = _w.set(Math.cos(this.facing), 0, -Math.sin(this.facing));
    _pole.copy(_s);
    if (h.elbow?.isVector3) _pole.add(h.elbow);
    else if (h.elbow === 'down') _pole.y -= 1;
    else if (h.elbow === 'back') { _pole.addScaledVector(fwd, -0.8); _pole.y -= 0.5; }
    else { _pole.addScaledVector(left, 0.55 * k).addScaledVector(fwd, -0.25); _pole.y -= 0.75; }
    la.getWorldQuaternion(_q2); _fb.set(1, 0, 0).applyQuaternion(_q2);
    if (mode === 'contact') {
      // palm flat on the surface; fingers along the reach direction (or as asked)
      const fd = _al;
      if (typeof h.fingers === 'function') h.fingers(fd, this._t);
      else if (h.fingers?.isVector3) fd.copy(h.fingers);
      else if (h.fingers === 'down') fd.set(0, -1, 0);
      else if (h.fingers === 'up') fd.set(0, 1, 0);
      else fd.subVectors(tgt, _s);
      handQuat(side, fd, _ax.copy(nrm).negate(), _qh);
      // wrist = contact + normal·(palm thickness − press) − fingers·(wrist→palm centre)
      _al.set(Math.sin(ARM_ANGLE) * k, -Math.cos(ARM_ANGLE), 0).applyQuaternion(_qh);
      _p.copy(tgt).addScaledVector(nrm, Mx.palm.thick * H - h.press).addScaledVector(_al, -Mx.palm.along * H);
      hb.getWorldQuaternion(_qa);
      _qa.slerp(_qh, w);
      twoBoneIKPole(ua, la, hb, _p, w, _fb, _qa, _pole, 0.65);
      surfacePoint(this, `palm_${side}`, {}, _p);
      this.reachError[side] = _p.distanceTo(tgt); this.reachVec[side].subVectors(tgt, _p);
    } else {
      // legacy palm point: wrist target = palm point minus the palm offset along the animated hand direction
      hb.getWorldQuaternion(_q);
      _ax.set(Math.sin(ARM_ANGLE) * k, -Math.cos(ARM_ANGLE), 0).applyQuaternion(_q);
      tgt.addScaledVector(_ax, -0.05 * H);
      twoBoneIKPole(ua, la, hb, tgt, w, _fb, null, _pole, 0.4);
      hb.getWorldPosition(_p);
      this.reachError[side] = _p.distanceTo(tgt); this.reachVec[side].subVectors(tgt, _p);
    }
  }

  _footTargets(dt) {
    for (const side of ['L', 'R']) {
      const f = this._foot[side];
      f.w += Math.sign(f.goal - f.w) * Math.min(Math.abs(f.goal - f.w), dt / f.fade);
      if (f.w < 0.005) { if (f.goal === 0) f.target = null; continue; }
      if (!f.target) continue;
      const B = this.bones, H = this.look.height, S = this.spec, Mx = this.metrics;
      const mode = this._resolve(f, _p2, _n);
      if (!mode) continue;
      if (mode === 'point') _n.set(0, 1, 0);
      const w = easeInOut(Math.min(1, f.w));
      const th = B[`thigh_${side}`], sh = B[`shin_${side}`], ft = B[`foot_${side}`];
      ft.getWorldQuaternion(_qa);
      _ax.set(0, 1, 0).applyQuaternion(_qa);
      _q.setFromUnitVectors(_ax, _n);
      _qa.premultiply(_q2.identity().slerp(_q, w));
      // ankle = sole point + normal · ankle height − foot forward · (ankle → sole centre)
      _al.set(0, 0, 1).applyQuaternion(_qa);
      _p.copy(_p2).addScaledVector(_n, S.joints[`foot_${side}`][1] * H).addScaledVector(_al, -Mx.footC[2] * H);
      th.getWorldPosition(_pole).addScaledVector(_f.set(Math.sin(this.facing), 0, Math.cos(this.facing)), 1);
      sh.getWorldQuaternion(_q); _fb.set(1, 0, 0).applyQuaternion(_q);
      twoBoneIKPole(th, sh, ft, _p, w, _fb, _qa, _pole, 0.5);
      surfacePoint(this, `foot_${side}`, { sole: true }, _s);
      this.reachVec['foot' + side].subVectors(_p2, _s);
    }
  }

  _mouthIK(dt) {
    const m = this._mouth;
    m.w += Math.sign(m.goal - m.w) * Math.min(Math.abs(m.goal - m.w), dt / m.fade);
    if (m.w < 0.005) { if (m.goal === 0) m.target = null; this.reachError.mouth = 0; this.reachVec.mouth.set(0, 0, 0); return; }
    if (!m.target) return;
    const mode = this._resolve(m, _p2, _n);
    if (!mode) return;
    if (mode === 'contact') _p2.addScaledVector(_n, m.offset);
    const B = this.bones;
    const eff = (out) => surfacePoint(this, 'mouth', {}, out);
    ccdReach([B.spine, B.chest, B.neck, B.head], [0.15, 0.25, 0.5, 0.8], [0.35, 0.4, 0.6, 0.8], eff, _p2, easeInOut(Math.min(1, m.w)), 3);
    this.reachError.mouth = eff(_p).distanceTo(_p2); this.reachVec.mouth.subVectors(_p2, _p);
  }
}
