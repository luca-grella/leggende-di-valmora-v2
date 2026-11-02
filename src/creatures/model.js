// Procedural Sun/Moon-style Velmon models. One rigid-skinned toon mesh (vertex colours, rim light,
// hit/silhouette flash) + one glow mesh (flames, eye shine) + one outline shell = ≤ 3 draw calls.
// Animations are procedural poses (anims.js) cross-faded every frame, plus blinking, look-at and
// spring-driven secondary motion on ears/tails. Geometry is built once per species and shared.
import * as THREE from 'three';
import { designVelmon } from './designs.js';
import { ANIM_INFO, POSES } from './anims.js';
import { SPECIES } from './species.js';

const templates = new Map();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _inv = new THREE.Matrix4(), _c = new THREE.Color();

/** Height in metres for a species (v1 size hint → cute Sun/Moon scale). */
export function speciesHeight(id) {
  const sp = SPECIES[id];
  const h = 0.5 + (sp?.model?.size ?? 0.7) * 0.8;
  return sp?.legendary ? h * 1.25 : h;
}

function template(id) {
  let T = templates.get(id);
  if (T) return T;
  const { builder: b, meta, stage } = designVelmon(id);
  const bones = b.bones.map(bone => ({
    name: bone.name, parent: bone.parent?.isBone ? b.bones.indexOf(bone.parent) : -1,
    pos: bone.position.clone(), meta: bone.userData.meta || {},
  }));
  const geos = b.geometries();
  geos.body.computeBoundingBox();
  const bb = geos.body.boundingBox;
  const unitH = bb.max.y + (meta.hover || 0);
  const scale = speciesHeight(id) / unitH;
  const index = Object.fromEntries(bones.map((d, i) => [d.name, i]));
  const legs = bones.map((d, i) => ({ d, i })).filter(x => /^leg/.test(x.d.name)).map(x => ({ i: x.i, phase: x.d.meta.phase ?? 0 }));
  const arms = ['armL', 'armR'].filter(n => n in index).map((n, j) => ({ i: index[n], phase: bones[index[n]].meta.phase ?? (j ? Math.PI : 0) }));
  const tails = bones.map(d => d.name).filter(n => /^tail\d/.test(n));
  for (const g of Object.values(geos)) if (g) { g.computeBoundingSphere(); }
  T = {
    id, geos, bones, index, scale, unitH, stage,
    radius: Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z) * scale,
    meta: { ...meta, legs, arms, tails, reach: 0 },
  };
  templates.set(id, T);
  return T;
}

function velmonMaterial(ctx) {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ctx.toon.ramp });
  const u = {
    uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uRim: { value: 0.3 }, uRimColor: { value: new THREE.Color('#fff2dc') },
  };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform float uFlash;\nuniform vec3 uFlashColor;\nuniform float uRim;\nuniform vec3 uRimColor;\n' +
      sh.fragmentShader.replace('#include <opaque_fragment>', `{
        float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        outgoingLight += uRimColor * smoothstep(0.6, 0.85, rimF) * uRim;
        outgoingLight = mix(outgoingLight, uFlashColor, uFlash);
      }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'velmon-toon-1';
  m.userData.u = u;
  return m;
}

function glowMaterial(ctx) {
  return (ctx.__velmonGlowMat ||= new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
}

/** One loop callback updates every live Velmon that is attached to a scene graph. */
function registry(ctx) {
  if (ctx.__velmonLive) return ctx.__velmonLive;
  const live = ctx.__velmonLive = new Set();
  ctx.loop.add(function velmonModels(dt) {
    for (const m of live) if (m.object.parent) m._auto(dt);
  }, ctx.ORDER?.actors ?? 20);
  return live;
}

function makeWriter(index) {
  const P = {
    buf: null, ch: null,
    reset(buf, ch) {
      P.buf = buf; P.ch = ch;
      for (let o = 0; o < buf.length; o += 9) { buf[o] = buf[o + 1] = buf[o + 2] = buf[o + 3] = buf[o + 4] = buf[o + 5] = 0; buf[o + 6] = buf[o + 7] = buf[o + 8] = 1; }
      ch.eyes = 1; ch.mouth = 0; ch.glow = 0; ch.flash = 0;
    },
    pos(n, x, y, z) { const i = index[n]; if (i !== undefined) { const o = i * 9, b = P.buf; b[o] += x; b[o + 1] += y; b[o + 2] += z; } },
    rot(n, x, y, z) { const i = index[n]; if (i !== undefined) P.rotI(i, x, y, z); },
    rotI(i, x, y, z) { const o = i * 9 + 3, b = P.buf; b[o] += x; b[o + 1] += y; b[o + 2] += z; },
    scl(n, x, y, z) { const i = index[n]; if (i !== undefined) { const o = i * 9 + 6, b = P.buf; b[o] *= x; b[o + 1] *= y; b[o + 2] *= z; } },
  };
  return P;
}

/**
 * @returns {{object:THREE.Group, speciesId:string, height:number, radius:number, play:Function, lookAt:Function,
 *   setGlow:Function, setSilhouette:Function, update:Function, dispose:Function}}
 */
export function buildVelmon(ctx, speciesId, { scale = 1 } = {}) {
  const T = template(speciesId);
  const object = new THREE.Group();
  object.name = 'velmon:' + speciesId;
  const rig = new THREE.Group();
  const s = T.scale * scale;
  rig.scale.setScalar(s);
  object.add(rig);

  const bones = T.bones.map(d => { const b = new THREE.Bone(); b.name = d.name; b.position.copy(d.pos); b.userData.rest = d.pos; return b; });
  T.bones.forEach((d, i) => (d.parent >= 0 ? bones[d.parent].add(bones[i]) : rig.add(bones[i])));
  object.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);

  const mat = velmonMaterial(ctx);
  const body = new THREE.SkinnedMesh(T.geos.body, mat);
  body.castShadow = true; body.frustumCulled = false; body.name = 'velmon-body';
  rig.add(body);
  rig.updateMatrixWorld(true);
  body.bind(skeleton);
  let glow = null;
  if (T.geos.glow) {
    glow = new THREE.SkinnedMesh(T.geos.glow, glowMaterial(ctx));
    glow.frustumCulled = false; glow.name = 'velmon-glow';
    rig.add(glow); glow.bind(skeleton, body.bindMatrix);
  }
  if (ctx.quality?.outlines && T.geos.outline) {
    const src = new THREE.SkinnedMesh(T.geos.outline, mat);
    src.bind(skeleton, body.bindMatrix);
    const ws = s < 0.55 ? 0.03 : s < 0.9 ? 0.022 : 0.016;
    ctx.toon.outline(src, { width: ws });
    const shell = src.children.find(c => c.userData.isOutline);
    if (shell) { shell.frustumCulled = false; rig.add(shell); shell.bind(skeleton, body.bindMatrix); }
  }

  const N = bones.length;
  const meta = { ...T.meta, reach: 0.6 / s };
  const P = makeWriter(T.index);
  const bufA = new Float32Array(N * 9), bufB = new Float32Array(N * 9);
  const chA = {}, chB = {};
  let cur = { name: 'idle', t: Math.random() * 3, loop: true, dur: 0, hold: false, resolve: null };
  let prev = null, fade = 1, fadeDur = 0.2;
  let blinkT = 1 + Math.random() * 3, blink = 0;
  let lookTarget = null, lookYaw = 0, lookPitch = 0;
  let glowV = 0, glowTarget = 0, sil = 0;
  const glowColor = new THREE.Color('#ffffff');
  const base = T.meta.baseGlow ? { c: new THREE.Color(T.meta.baseGlow.color), v: T.meta.baseGlow.v } : null;
  const spring = { v: 0, x: 0, prevY: 0 };
  const iEyeL = T.index.eyeL, iEyeR = T.index.eyeR, iMouth = T.index.mouth, iHead = T.index.head, iRoot = T.index.root;
  const springBones = ['earL', 'earR', 'tail0', 'tail1', 'tail2', 'wingL', 'wingR'].map(n => T.index[n]).filter(i => i !== undefined);
  let frameStamp = -1;

  function evalPose(a, buf, ch) {
    P.reset(buf, ch);
    POSES[a.name](P, a.t, meta);
  }

  function tick(dt) {
    // advance anims
    cur.t += dt;
    if (!cur.loop && cur.t >= cur.dur) {
      if (cur.hold) cur.t = cur.dur;
      const r = cur.resolve; cur.resolve = null;
      if (!cur.hold) { const done = cur; play('idle', { fade: 0.28 }); done.t = done.dur; }
      r?.();
    }
    evalPose(cur, bufA, chA);
    if (prev && fade < 1) {
      prev.t += dt; if (!prev.loop && prev.t > prev.dur) prev.t = prev.dur;
      fade = Math.min(1, fade + dt / fadeDur);
      evalPose(prev, bufB, chB);
      const k = fade * fade * (3 - 2 * fade);
      for (let i = 0; i < bufA.length; i++) bufA[i] = bufB[i] + (bufA[i] - bufB[i]) * k;
      for (const key in chA) chA[key] = chB[key] + (chA[key] - chB[key]) * k;
    } else prev = null;

    // secondary motion: a damped spring driven by the root's vertical velocity
    const ry = bufA[iRoot * 9 + 1];
    const vy = dt > 0 ? (ry - spring.prevY) / dt : 0;
    spring.prevY = ry;
    if (dt > 0) {
      const target = Math.max(-0.6, Math.min(0.6, -vy * 0.22));
      spring.v += ((target - spring.x) * 140 - spring.v * 9) * dt;
      spring.x += spring.v * dt;
    }
    // blink
    blinkT -= dt;
    if (blinkT <= 0) { blink = 0.16; blinkT = 1.8 + Math.random() * 3.2; if (Math.random() < 0.18) blinkT = 0.25; }
    let bl = 1;
    if (blink > 0) { blink -= dt; bl = Math.abs((Math.max(0, blink) / 0.16) * 2 - 1); }
    // look-at (head yaw/pitch, smoothed)
    let ty = 0, tp = 0;
    if (lookTarget) {
      const tw = lookTarget.isObject3D ? lookTarget.getWorldPosition(_w) : _w.copy(lookTarget);
      object.updateWorldMatrix(true, false);
      _v.copy(tw).applyMatrix4(_inv.copy(object.matrixWorld).invert());
      ty = Math.max(-0.75, Math.min(0.75, Math.atan2(_v.x, _v.z)));
      tp = Math.max(-0.3, Math.min(0.3, -Math.atan2(_v.y - T.unitH * s * 0.7, Math.hypot(_v.x, _v.z)) * 0.6));
    }
    const kl = 1 - Math.exp(-6 * dt);
    lookYaw += (ty - lookYaw) * kl; lookPitch += (tp - lookPitch) * kl;

    // apply to bones
    for (let i = 0; i < N; i++) {
      const b = bones[i], o = i * 9, r = b.userData.rest;
      b.position.set(r.x + bufA[o], r.y + bufA[o + 1], r.z + bufA[o + 2]);
      b.rotation.set(bufA[o + 3], bufA[o + 4], bufA[o + 5]);
      b.scale.set(bufA[o + 6], bufA[o + 7], bufA[o + 8]);
    }
    for (const i of springBones) bones[i].rotation.x += spring.x * (bones[i].name.startsWith('wing') ? 0.3 : 1);
    if (iHead !== undefined) { bones[iHead].rotation.y += lookYaw; bones[iHead].rotation.x += lookPitch; }
    const eyes = Math.max(0.06, chA.eyes * bl);
    if (iEyeL !== undefined) bones[iEyeL].scale.y *= eyes;
    if (iEyeR !== undefined) bones[iEyeR].scale.y *= eyes;
    if (iMouth !== undefined) { const m = chA.mouth; bones[iMouth].scale.y *= 1 + m * 3.4; bones[iMouth].scale.x *= 1 + m * 0.2; }

    // material: flash/silhouette + glow
    mat.userData.u.uFlash.value = Math.max(chA.flash, sil);
    if (glow) glow.visible = sil < 0.5;          // flames / eye shine vanish inside the white silhouette
    glowV += (glowTarget - glowV) * (1 - Math.exp(-8 * dt));
    const g = Math.max(glowV, chA.glow * 0.42);
    if (g > 0.003) { mat.emissive.copy(glowColor); mat.emissiveIntensity = g; }
    else if (base) { mat.emissive.copy(base.c); mat.emissiveIntensity = base.v * (0.75 + 0.25 * Math.sin(cur.t * 2)); }
    else mat.emissiveIntensity = 0;
  }

  function play(name, { loop, fade: f } = {}) {
    if (!POSES[name]) { console.warn('[velmon] unknown anim', name); return Promise.resolve(); }
    const info = ANIM_INFO[name] || {};
    const old = cur;
    old.resolve?.(); old.resolve = null;
    prev = old; fade = 0; fadeDur = f ?? (name === 'hit' ? 0.06 : name === 'appear' ? 0.01 : 0.2);
    return new Promise(resolve => {
      cur = { name, t: 0, loop: loop ?? !!info.loop, dur: info.dur || 1, hold: !!info.hold, resolve: null };
      if (cur.loop) resolve(); else cur.resolve = resolve;
      if (name === 'appear') { prev = null; fade = 1; }
    });
  }

  const live = registry(ctx);
  const model = {
    object, speciesId, rig, skeleton,
    height: speciesHeight(speciesId) * scale, radius: T.radius * scale, stage: T.stage,
    get anim() { return cur.name; },
    play,
    lookAt(target) { lookTarget = target || null; },
    setGlow(v = 0, color) { glowTarget = Math.max(0, v); if (color != null) glowColor.set(color); },
    setSilhouette(v = 0) { sil = Math.max(0, Math.min(1, v)); },
    /** Attack lunge distance in metres (battle sets it from the gap between slots). */
    setReach(m) { meta.reach = m / s; },
    update(dt = 0) { if (dt > 0 && frameStamp === ctx.loop.frame) return; frameStamp = ctx.loop.frame; tick(dt); },
    _auto(dt) { if (frameStamp === ctx.loop.frame) return; frameStamp = ctx.loop.frame; tick(dt); },
    dispose() {
      live.delete(model);
      object.removeFromParent();
      mat.dispose();
      cur.resolve?.(); cur.resolve = null;
    },
  };
  object.userData.velmon = model;
  object.userData.height = model.height;          // camera close-ups frame by these
  object.userData.radius = model.radius;
  live.add(model);
  tick(0);
  return model;
}
