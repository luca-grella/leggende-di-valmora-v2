// Clip player on top of THREE.AnimationMixer (adapted from Lenza Lenta v2). Each clip is baked in two halves
// (upper body / lower body) so that:
//   - a full-body clip plays both halves in sync;
//   - an UPPER override (wave, talk, carry, massage hands…) replaces only the upper half while the legs keep
//     doing the base clip (walking, sitting, kneeling);
//   - cross-fades are done per half with weights that always sum to 1 (never blended with the bind pose).
// Plus a LOCOMOTION blend (idle / walk / run by speed, the cycles phase-locked to the distance travelled so
// the feet never slide) and the face scalars (mouth / eyes / brow) sampled from the active clips.
// Procedural layers (breathing, blink, look-at, IK, jiggle) are applied by the Human after update().
import * as THREE from 'three';
import { sampleScalar } from './anim.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Locomotion tuning: natural speeds (m/s) and stride lengths (m per full cycle). */
export const LOCO = { walk: { clip: 'walk', speed: 2.6, stride: 1.42, minStride: 0.9 }, run: { clip: 'run', speed: 5.6, stride: 2.5 }, idle: 'idle' };

class Slot {
  constructor(anim, half) { this.anim = anim; this.half = half; this.entries = []; }
  get target() { return this.entries[this.entries.length - 1] || null; }
  /** Fade to key (clip name or 'locomotion'). Reuses an entry that is still fading out. */
  fadeTo(key, fade, { restart = true, time = null, speed = 1, loop = null } = {}) {
    const A = this.anim;
    let e = this.entries.find(x => x.key === key);
    if (e) this.entries.splice(this.entries.indexOf(e), 1);
    else {
      e = { key, w: this.entries.length ? 0 : 1, actions: [] };
      if (key === 'locomotion') {
        for (const n of [A.idleClip, LOCO.walk.clip, LOCO.run.clip]) { const a = A._action(n, this.half); if (a) e.actions.push({ name: n, action: a, sub: 0 }); }
      } else { const a = A._action(key, this.half); if (a) e.actions.push({ name: key, action: a, sub: 1 }); }
    }
    e.fade = Math.max(1e-3, fade);
    e.speed = speed;
    for (const it of e.actions) {
      const a = it.action, def = A.lib[it.name].def;
      const isLoop = key === 'locomotion' ? true : (loop ?? def.loop);
      a.setLoop(isLoop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !isLoop;
      a.timeScale = key === 'locomotion' && it.name !== A.idleClip ? 0 : speed;
      if (restart && key !== 'locomotion') { if (e.w < 0.999) a.reset(); else a.time = 0; }
      if (time !== null && key !== 'locomotion') a.time = Math.min(time, def.duration);
      if (!a.isRunning()) a.play();
      a.enabled = true; a.paused = false;
    }
    this.entries.push(e);
    if (fade <= 1e-3) for (const x of this.entries) x.w = x === e ? 1 : 0;
    return e;
  }
  update(dt) {
    const t = this.target; if (!t) return;
    t.w = Math.min(1, t.w + dt / t.fade);
    let rest = 0;
    for (const x of this.entries) if (x !== t) rest += x.w;
    const k = rest > 1e-6 ? (1 - t.w) / rest : 0;
    for (const x of this.entries) if (x !== t) x.w *= k;
    for (const x of this.entries) if (x !== t && x.w < 1e-3) for (const it of x.actions) if (!this.anim._usedElsewhere(it.action, x)) it.action.stop();
    if (this.entries.some(x => x !== t && x.w < 1e-3)) this.entries = this.entries.filter(x => x === t || x.w >= 1e-3);
    if (this.entries.length === 1) t.w = 1;
  }
  apply() { for (const e of this.entries) for (const it of e.actions) it.action.setEffectiveWeight(e.w * it.sub); }
}

export class Animator {
  /**
   * @param {THREE.Object3D} root  object whose descendants are the bones (the SkinnedMesh)
   * @param {Object<string,{def:object, full:THREE.AnimationClip, upper:THREE.AnimationClip, lower:THREE.AnimationClip}>} lib
   * @param {{idle?:string}} [opts] idle clip of the locomotion blend ('idle' or 'idle_f')
   */
  constructor(root, lib, { idle = 'idle' } = {}) {
    this.root = root; this.lib = lib; this.idleClip = lib[idle] ? idle : 'idle';
    this.mixer = new THREE.AnimationMixer(root);
    this.slots = { lower: new Slot(this, 'lower'), upper: new Slot(this, 'upper') };
    this.base = null;   // {name, opts, resolve, ended, prevT}
    this.over = null;   // upper override
    this.speed = 0; this.phase = 0; this.locoW = { idle: 1, walk: 0, run: 0 };
    this.meta = { footIK: 1, look: 1, breathe: 1, lean: 1, sit: 0 };
    this.scalars = { mouth: 0, eyes: 1, brow: 0 };
    /** (eventName, clipName, eventData) → void */
    this.onEvent = null;
    /** () → default clip name when a non-hold one-shot ends without `next` */
    this.defaultFor = () => 'locomotion';
  }

  has(name) { return name === 'locomotion' || !!this.lib[name]; }
  _action(name, half) { const c = this.lib[name]; if (!c) return null; return this.mixer.clipAction(half === 'upper' ? c.upper : c.lower); }
  _usedElsewhere(action, exceptEntry) {
    for (const s of Object.values(this.slots)) for (const e of s.entries) if (e !== exceptEntry && e.actions.some(it => it.action === action)) return true;
    return false;
  }

  /** Name of the current base clip ('locomotion' or a clip) and of the upper override (or null). */
  get current() { return this.base?.name || null; }
  get upperName() { return this.over?.name || null; }
  /** Normalised time 0..1 of the current base (or upper) clip. */
  progress(layer = 'base') {
    const st = layer === 'upper' ? this.over : this.base; if (!st || st.name === 'locomotion') return 0;
    const a = this._lead(st, layer); const d = this.lib[st.name].def.duration; return a ? Math.min(1, a.time / d) : 0;
  }
  _lead(st, layer) {
    const slot = layer === 'upper' ? this.slots.upper : this.slots.lower;
    const e = slot.entries.find(x => x.key === st.name) || this.slots.upper.entries.find(x => x.key === st.name);
    return e?.actions[0]?.action || null;
  }

  /**
   * Play a clip. opts: {fade=0.25, speed=1, loop, next, hold, layer:'full'|'upper', onEnd, onEvent:{name:fn}, fadeOut=0.25, time}
   * Returns a Promise that resolves true when the clip ends (false if it was interrupted). Loops resolve
   * when they are replaced (false).
   */
  play(name, opts = {}) {
    if (!this.has(name)) { console.warn('[actors] unknown clip', name); return Promise.resolve(false); }
    const fade = opts.fade ?? 0.25;
    const layer = opts.layer === 'upper' ? 'upper' : 'full';
    let resolve; const p = new Promise(r => { resolve = r; });
    const st = { name, opts, resolve, ended: false, prevT: 0 };
    if (layer === 'upper') {
      if (this.over && !this.over.ended) this.over.resolve(false);
      this.over = st;
      this.slots.upper.fadeTo(name, fade, { speed: opts.speed ?? 1, loop: opts.loop ?? null, time: opts.time ?? null });
    } else {
      const same = this.base && this.base.name === name && (name === 'locomotion' || (this.lib[name]?.def.loop && opts.restart === false));
      if (this.base && !this.base.ended) this.base.resolve(false);
      this.base = st;
      if (!same) {
        this.slots.lower.fadeTo(name, fade, { speed: opts.speed ?? 1, loop: opts.loop ?? null, time: opts.time ?? null });
        if (!this.over) this.slots.upper.fadeTo(name, fade, { speed: opts.speed ?? 1, loop: opts.loop ?? null, time: opts.time ?? null });
        else if (opts.keepUpper === false) this.stopUpper(fade);
      }
    }
    return p;
  }

  /** End the upper override and fade the upper body back to the base clip (time-synced). */
  stopUpper(fade = 0.3) {
    if (!this.over) return;
    if (!this.over.ended) { this.over.ended = true; this.over.resolve(false); }
    this.over = null;
    const b = this.base?.name || 'locomotion';
    const lower = this.slots.lower.entries.find(x => x.key === b);
    const t = b !== 'locomotion' ? lower?.actions[0]?.action.time ?? 0 : null;
    this.slots.upper.fadeTo(b, fade, { restart: false, time: t, speed: this.base?.opts.speed ?? 1, loop: this.base?.opts.loop ?? null });
  }

  /** Drive the locomotion blend (m/s). Only matters while 'locomotion' is the base. */
  setSpeed(v) { this.speed = Math.max(0, v); }

  update(dt) {
    // locomotion weights + phase-locked cycles (walk and run share phase 0 = left heel strike)
    const s = this.speed;
    const move = sstep(0.05, 0.85, s), fast = sstep(LOCO.walk.speed + 0.5, LOCO.run.speed - 0.4, s);
    this.locoW.idle = 1 - move; this.locoW.walk = move * (1 - fast); this.locoW.run = move * fast;
    const walkStride = LOCO.walk.minStride + (LOCO.walk.stride - LOCO.walk.minStride) * sstep(0.3, LOCO.walk.speed, s);
    const stride = walkStride + (LOCO.run.stride - walkStride) * fast;
    const prevPhase = this.phase;
    this.phase = (this.phase + (s / stride) * dt) % 1;
    if (this.base?.name === 'locomotion' && move > 0.3 && s > 0.2) {
      if (prevPhase > this.phase) this._emit('step', 'locomotion', { foot: 'L', speed: s });
      else if (prevPhase < 0.5 && this.phase >= 0.5) this._emit('step', 'locomotion', { foot: 'R', speed: s });
    }
    for (const slot of Object.values(this.slots)) for (const e of slot.entries) if (e.key === 'locomotion') {
      for (const it of e.actions) {
        if (it.name === this.idleClip) it.sub = this.locoW.idle;
        else { it.sub = it.name === LOCO.walk.clip ? this.locoW.walk : this.locoW.run; it.action.time = this.phase * this.lib[it.name].def.duration; }
      }
    }
    for (const slot of Object.values(this.slots)) { slot.update(dt); slot.apply(); }
    this.mixer.update(dt);
    this._events(this.base, 'lower');
    this._events(this.over, 'upper');
    this._blendMeta(dt);
    this._scalars();
  }

  _emit(evt, clip, data) { this.onEvent?.(evt, clip, data); }

  _events(st, layer) {
    if (!st || st.name === 'locomotion') return;
    const a = this._lead(st, layer); if (!a) return;
    const def = this.lib[st.name].def;
    const t = a.time;
    const looped = def.loop && t < st.prevT - 1e-4;
    for (const ev of def.events) {
      const hit = looped ? (ev.t > st.prevT || ev.t <= t) : (ev.t > st.prevT && ev.t <= t) || (st.prevT === 0 && ev.t === 0 && t > 0);
      if (hit) { this._emit(ev.name, st.name, ev); st.opts.onEvent?.[ev.name]?.(ev); }
    }
    st.prevT = t;
    const isLoop = st.opts.loop ?? def.loop;
    if (isLoop || st.ended) return;
    const fadeOut = st.opts.fadeOut ?? 0.25;
    const speed = Math.max(0.05, st.opts.speed ?? 1);
    if (t >= def.duration - fadeOut * speed - 1e-4) {
      st.ended = true;
      st.opts.onEnd?.(st.name);
      st.resolve(true);
      const next = st.opts.next ?? def.next;
      const hold = st.opts.hold ?? def.hold;
      if (layer === 'upper') { if (this.over === st && !hold) { if (next) this.play(next, { layer: 'upper', fade: fadeOut }); else this.stopUpper(fadeOut); } }
      else if (this.base === st) {
        if (next) this.play(next, { fade: fadeOut });
        else if (!hold) this.play(this.defaultFor(st.name), { fade: fadeOut });
      }
    }
  }

  _blendMeta(dt) {
    const M = this.meta;
    const acc = (slot, key, dflt) => { let s = 0, w = 0; for (const e of slot.entries) { const v = this._metaOf(e, key, dflt); s += v * e.w; w += e.w; } return w > 0 ? s / w : dflt; };
    const k = 1 - Math.exp(-10 * dt);
    M.footIK += (acc(this.slots.lower, 'footIK', 1) - M.footIK) * k;
    M.sit += (acc(this.slots.lower, 'sit', 0) - M.sit) * k;
    M.look += (acc(this.slots.upper, 'look', 1) - M.look) * k;
    M.breathe += (acc(this.slots.upper, 'breathe', 1) - M.breathe) * k;
    M.lean += (acc(this.slots.lower, 'lean', 1) - M.lean) * k;
  }
  _metaOf(e, key, dflt) {
    if (e.key === 'locomotion') return key === 'sit' ? 0 : key === 'look' ? 0.85 : 1;
    const m = this.lib[e.key]?.def.meta || {};
    return m[key] ?? dflt;
  }

  /** Weighted face scalars of the upper-body clips (mouth 0..1, eyes 0..1.2, brow −1..1). */
  _scalars() {
    const S = this.scalars; S.mouth = 0; S.eyes = 0; S.brow = 0;
    let wsum = 0;
    for (const e of this.slots.upper.entries) {
      if (e.key === 'locomotion' || e.w < 1e-3) { S.eyes += e.w; wsum += e.w; continue; }
      const def = this.lib[e.key]?.def; const a = e.actions[0]?.action;
      if (!def || !a) continue;
      const t = a.time;
      S.mouth += sampleScalar(def, 'mouth', t) * e.w;
      S.eyes += sampleScalar(def, 'eyes', t) * e.w;
      S.brow += sampleScalar(def, 'brow', t) * e.w;
      wsum += e.w;
    }
    if (wsum > 1e-4) { S.mouth /= wsum; S.eyes /= wsum; S.brow /= wsum; } else { S.eyes = 1; }
  }

  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.root); }
}
