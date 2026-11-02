// Test stage (sandboxes, and the game while World/Actors are missing): a small tropical islet in a
// turquoise lagoon with palms, flowers, bushes and rocks, a gradient sky dome, day/night lighting from
// ctx.time, and a chibi dummy that walks with eased acceleration/turning, bob and idle breathing.
// Everything uses ctx.toon / ctx.kit, so it doubles as the engine's look reference.
import * as THREE from 'three';
import { damp, angleDamp, rng } from './math.js';

const SKY_VERT = /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const SKY_FRAG = /* glsl */`uniform vec3 top, horizon, sunCol; uniform vec3 sunDir; uniform float stars; varying vec3 vDir;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main(){
  vec3 d = normalize(vDir); float y = max(d.y, 0.0);
  vec3 c = mix(horizon, top, pow(y, 0.55));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  c += sunCol * (pow(s, 24.0) * 0.35 + pow(s, 600.0) * 1.2) * (1.0 - stars * 0.6);
  vec3 g = floor(d * 160.0); float st = step(0.9965, h(g)) * smoothstep(0.05, 0.4, y) * stars;
  c += vec3(st);
  gl_FragColor = vec4(c, 1.0);
}`;

const SEA_VERT = /* glsl */`
varying vec3 vW;
#include <fog_pars_vertex>
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const SEA_FRAG = /* glsl */`
uniform float time, shore; uniform vec3 shallow, lagoon, deep, foam, light; varying vec3 vW;
#include <fog_pars_fragment>
void main(){
  float r = length(vW.xz);
  float d = r - shore;
  float wav = sin(vW.x * 0.35 + time * 0.8) * 0.5 + sin(vW.z * 0.42 - time * 0.6) * 0.5;
  vec3 c = mix(shallow, lagoon, smoothstep(1.0, 7.0, d + wav * 0.6));
  c = mix(c, deep, smoothstep(16.0, 45.0, d));
  // toon sparkle bands
  float sp = step(0.93, sin(vW.x * 1.7 + time * 1.3 + sin(vW.z * 1.1)) * sin(vW.z * 1.5 - time));
  c += sp * 0.12 * smoothstep(3.0, 12.0, d);
  // shore foam: two soft rings that breathe in and out
  float f = 1.0 - smoothstep(0.0, 0.55, abs(d - 0.6 - 0.35 * sin(time * 1.1)));
  f = max(f, (1.0 - smoothstep(0.0, 0.3, abs(d - 2.2 - 0.5 * sin(time * 0.9 + 1.7)))) * 0.6);
  c = mix(c, foam, f * 0.85);
  gl_FragColor = vec4(c * light, 1.0);
  #include <fog_fragment>
}`;

const domeY = (x, z) => Math.max(0, 0.22 * (1 - (x * x + z * z) / (24.4 * 24.4)));

/**
 * @param {any} ctx
 * @param {{ground?:boolean, dummy?:boolean, lighting?:boolean}} [opts] lighting: drive sky/sun/fog from ctx.time
 */
export function createTestStage(ctx, { ground = true, dummy = true, lighting = true } = {}) {
  const { scene, toon, kit, quality } = ctx;
  const P = toon.palette;
  const group = new THREE.Group(); group.name = 'test-stage';
  const hemi = new THREE.HemisphereLight('#cdeeff', '#a8946a', 1.0);
  const sun = new THREE.DirectionalLight('#fff6e2', 2.4);
  sun.position.set(12, 20, 8);
  group.add(hemi, sun, sun.target);
  toon.trackSun(sun, { radius: 22 });
  const out = { group, lights: { hemi, sun }, heightAt: domeY, ground: null, dummy: null, sky: null, update: null };

  // ---- sky dome -----------------------------------------------------------------------------
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color('#5cc3ff') }, horizon: { value: new THREE.Color('#d8f4ff') }, sunCol: { value: new THREE.Color('#fff6e2') }, sunDir: { value: new THREE.Vector3(0.5, 0.6, 0.3) }, stars: { value: 0 } },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false; sky.name = 'sky';
  group.add(sky); out.sky = sky;

  let seaMat = null;
  if (ground) {
    const R = 24;
    // sea
    seaMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        time: { value: 0 }, shore: { value: R + 2.2 }, shallow: { value: new THREE.Color(P.sea) }, lagoon: { value: new THREE.Color(P.lagoon) },
        deep: { value: new THREE.Color(P.deep) }, foam: { value: new THREE.Color('#ffffff') }, light: { value: new THREE.Color(1, 1, 1) },
      }]),
      vertexShader: SEA_VERT, fragmentShader: SEA_FRAG,
      fog: true,
    });
    const sea = new THREE.Mesh(new THREE.CircleGeometry(300, 64), seaMat);
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.35; sea.receiveShadow = false; sea.name = 'sea';
    group.add(sea);

    // island: sand rim + grass top, gently domed, vertex-coloured and merged
    const scenery = new THREE.Group();
    const r = rng('test-stage');
    const island = new THREE.CylinderGeometry(R + 2.6, R + 4.5, 1.2, 72, 1);
    kit.vcolor(island, P.sand);
    const isl = new THREE.Mesh(island, toon.matVC()); isl.position.y = -0.6; scenery.add(isl);
    const top = new THREE.CircleGeometry(R + 0.4, 72, 0, Math.PI * 2);
    top.rotateX(-Math.PI / 2);
    { // dome + colour noise (two grass tones, darker towards the edge)
      const p = top.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color(), a = new THREE.Color(P.grass), b = new THREE.Color(P.grass2);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z) / (R + 0.4);
        p.setY(i, 0.22 * (1 - d * d));
        const n = 0.5 + 0.5 * Math.sin(x * 0.31 + Math.sin(z * 0.27) * 2) * Math.cos(z * 0.23);
        c.lerpColors(a, b, n);
        col.set([c.r, c.g, c.b], i * 3);
      }
      top.setAttribute('color', new THREE.BufferAttribute(col, 3)); top.computeVertexNormals();
    }
    scenery.add(new THREE.Mesh(top, toon.matVC()));
    // a winding dirt path
    const pathPts = []; for (let i = 0; i <= 40; i++) { const t = i / 40; pathPts.push(new THREE.Vector3(-R * 0.9 + t * R * 1.8, 0, Math.sin(t * 5) * 3.5)); }
    const curve = new THREE.CatmullRomCurve3(pathPts);
    const pathG = new THREE.TubeGeometry(curve, 80, 1.1, 8, false); pathG.scale(1, 0.05, 1);
    { const pp = pathG.attributes.position; for (let i = 0; i < pp.count; i++) pp.setY(i, pp.getY(i) + domeY(pp.getX(i), pp.getZ(i)) + 0.012); pathG.computeVertexNormals(); }
    kit.vcolor(pathG, P.path); scenery.add(new THREE.Mesh(pathG, toon.matVC()));
    // rocks and bushes
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, d = R * (0.55 + r() * 0.4), s = 0.5 + r() * 0.9;
      const bush = i % 3 !== 0;
      const g = kit.blob(s, { seed: i * 3.1, wobble: bush ? 0.12 : 0.18, detail: 2 });
      if (bush) g.scale(1.2, 0.85, 1.2); else g.scale(1.1, 0.7, 1);
      kit.vcolor(g, bush ? (i % 2 ? '#4fae3c' : '#5cbf45') : P.rock);
      const m = new THREE.Mesh(g, toon.matVC()); m.position.set(Math.cos(a) * d, bush ? s * 0.55 : s * 0.25, Math.sin(a) * d); m.rotation.y = r() * 6;
      scenery.add(m);
    }
    // palms (curved trunk rings + leaf fans), merged
    const palm = (x, z, h, lean) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = lean;
      const segs = 7; let px = 0, py = 0;
      for (let i = 0; i < segs; i++) {
        const t = i / segs, seg = new THREE.CylinderGeometry(0.2 - t * 0.06, 0.24 - t * 0.06, h / segs + 0.05, 9);
        kit.vcolor(seg, i % 2 ? '#a77344' : '#b98552');
        const m = new THREE.Mesh(seg, toon.matVC()); px = Math.pow(t, 1.8) * h * 0.28; py = (i + 0.5) * h / segs;
        m.position.set(px, py, 0); m.rotation.z = -Math.pow(t, 0.8) * 0.35; g.add(m);
      }
      for (let k = 0; k < 7; k++) {
        const leaf = new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
        leaf.scale(1.75, 0.22, 0.42); leaf.translate(1.6, 0, 0);
        kit.vcolor(leaf, k % 2 ? '#3fae4a' : '#56c255');
        const m = new THREE.Mesh(leaf, toon.matVC()); m.position.set(px + 0.1, h + 0.05, 0);
        m.rotation.set(0, (k / 7) * Math.PI * 2, -0.38 - (k % 2) * 0.15); g.add(m);
      }
      const nut = new THREE.SphereGeometry(0.16, 8, 6); kit.vcolor(nut, '#7a5230');
      for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(nut, toon.matVC()); m.position.set(px + Math.cos(k * 2.1) * 0.22, h - 0.15, Math.sin(k * 2.1) * 0.22); g.add(m); }
      scenery.add(g);
    };
    palm(-R * 0.72, -R * 0.42, 5.2, 0.4); palm(R * 0.62, -R * 0.55, 4.6, 2.2); palm(R * 0.8, R * 0.25, 5.6, 3.4); palm(-R * 0.45, R * 0.7, 4.8, 5.1);
    // a small signpost and fence by the path
    const post = new THREE.Mesh(kit.vcolor(kit.roundedBox(0.16, 1.3, 0.16, 0.05), P.wood), toon.matVC()); post.position.set(3.5, 0.65, -2.2); scenery.add(post);
    const sign = new THREE.Mesh(kit.vcolor(kit.roundedBox(1.2, 0.6, 0.12, 0.06), '#d99a5b'), toon.matVC()); sign.position.set(3.5, 1.25, -2.2); scenery.add(sign);
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Mesh(kit.vcolor(kit.roundedBox(0.14, 0.8, 0.14, 0.05), '#fff2d8'), toon.matVC()); f.position.set(-12 + i * 1.3, 0.42, -6.5); scenery.add(f);
    }
    const rail = new THREE.Mesh(kit.vcolor(kit.roundedBox(8.2, 0.12, 0.1, 0.04), '#fff2d8'), toon.matVC()); rail.position.set(-8.1, 0.6, -6.5); scenery.add(rail);
    const merged = kit.mergeStatic(scenery);
    merged.traverse(o => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = true; } });
    group.add(merged);
    out.ground = merged;

    // flowers (instanced): stem-less toon blossoms in GDD pinks/yellows/whites
    const fl = []; const colors = [P.pink, P.yellow, '#ffffff', '#ff8fb8', '#ffb347'];
    for (let i = 0; i < 160; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 0.92;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(z - Math.sin((x / (R * 1.8) + 0.5) * 5) * 3.5) < 1.6) continue;  // keep the path clear
      fl.push({ x, y: domeY(x, z), z, ry: r() * 6, s: 0.7 + r() * 0.6, color: colors[i % colors.length] });
    }
    const petal = new THREE.CylinderGeometry(0.17, 0.12, 0.12, 6); petal.translate(0, 0.08, 0);
    const flowers = kit.instanced(petal, toon.mat('#ffffff'), fl, { castShadow: false });
    flowers.name = 'flowers'; group.add(flowers);
    // grass tufts (instanced cones)
    const tuft = new THREE.ConeGeometry(0.12, 0.5, 4); tuft.translate(0, 0.25, 0);
    const tf = []; for (let i = 0; i < 220; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 0.95; const tx = Math.cos(a) * d, tz = Math.sin(a) * d; tf.push({ x: tx, y: domeY(tx, tz) - 0.05, z: tz, ry: r() * 6, s: 0.6 + r() * 0.8, rz: (r() - 0.5) * 0.4 }); }
    const tufts = kit.instanced(tuft, toon.mat(P.tallGrass), tf, { castShadow: false });
    tufts.name = 'tufts'; group.add(tufts);
  }

  if (dummy) out.dummy = buildDummy(ctx, group);

  scene.add(group);

  // ---- lighting from the clock, sea animation --------------------------------------------------
  const dir = new THREE.Vector3();
  out.update = function stageUpdate(dt, t) {
    if (seaMat) seaMat.uniforms.time.value = t;
    if (!lighting) return;
    const L = ctx.time.lighting();
    skyMat.uniforms.top.value.set(L.sky); skyMat.uniforms.horizon.value.set(L.horizon);
    skyMat.uniforms.sunCol.value.set(L.sun); skyMat.uniforms.sunDir.value.set(L.sunDir.x, L.sunDir.y, L.sunDir.z); skyMat.uniforms.stars.value = L.stars;
    sky.position.copy(ctx.camera.position);
    if (!scene.background?.isColor) scene.background = new THREE.Color();
    scene.background.set(L.horizon);
    if (scene.fog) { scene.fog.color.set(L.fog); scene.fog.near = 70; scene.fog.far = 230; }
    sun.color.set(L.sun); sun.intensity = L.sunIntensity;
    sun.position.copy(sun.target.position).addScaledVector(dir.set(L.sunDir.x, L.sunDir.y, L.sunDir.z), 70);
    hemi.color.set(L.hemiSky); hemi.groundColor.set(L.hemiGround); hemi.intensity = L.hemiIntensity;
    if (seaMat) seaMat.uniforms.light.value.setRGB(1 - L.night * 0.55, 1 - L.night * 0.45, 1 - L.night * 0.2);
  };
  ctx.loop.add(out.update, ctx.ORDER.world);
  out.update(0, 0);
  ctx.cameraRig.snap();
  return out;
}

/** Chibi placeholder hero: walks with eased acceleration/turning, bob, lean and idle breathing. */
function buildDummy(ctx, parent) {
  const { toon, kit } = ctx;
  const d = new THREE.Group(); d.name = 'dummy';
  d.userData.height = 1.45;
  const body = new THREE.Group(); d.add(body);
  const torso = new THREE.Mesh(kit.capsule(0.27, 0.36, 6, 16), toon.mat('#ff7a59', { rim: 0.3 })); torso.position.y = 0.62; torso.castShadow = true;
  const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.2, 16), toon.mat('#3d6fd8', { rim: 0.2 })); shorts.position.y = 0.42; shorts.castShadow = true;
  const head = new THREE.Group(); head.position.y = 1.12;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 18), toon.skin()); skull.scale.set(1, 0.95, 0.95); skull.castShadow = true;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), toon.mat('#5a3420', { rim: 0.25 }));
  hair.position.set(0, 0.03, -0.03); hair.rotation.x = -0.25;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.37, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), toon.mat('#e8474a', { rim: 0.3 })); cap.position.y = 0.06; cap.rotation.x = -0.12;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 20, 1, false, -Math.PI / 2, Math.PI), toon.mat('#ffffff')); brim.position.set(0, 0.12, 0.22); brim.rotation.x = 0.12;
  const eyeG = new THREE.CapsuleGeometry(0.045, 0.06, 4, 8);
  const eyeL = new THREE.Mesh(eyeG, toon.eye('#2a1a12')); eyeL.position.set(-0.11, -0.01, 0.3); eyeL.userData.noOutline = true;
  const eyeR = eyeL.clone(); eyeR.position.x = 0.11;
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), toon.glow('#ffffff', 1)); shine.position.set(0.02, 0.04, 0.04); shine.userData.noOutline = true;
  eyeL.add(shine); eyeR.add(shine.clone());
  head.add(skull, hair, cap, brim, eyeL, eyeR);
  const legG = kit.capsule(0.09, 0.2, 4, 8), shoe = new THREE.SphereGeometry(0.12, 12, 8);
  const mkLeg = x => { const g = new THREE.Group(); g.position.set(x, 0.36, 0); const l = new THREE.Mesh(legG, toon.skin()); l.position.y = -0.14; const s = new THREE.Mesh(shoe, toon.mat('#ffffff', { rim: 0.2 })); s.scale.set(1, 0.6, 1.35); s.position.set(0, -0.3, 0.04); l.castShadow = s.castShadow = true; g.add(l, s); return g; };
  const legL = mkLeg(-0.13), legR = mkLeg(0.13);
  const armG = kit.capsule(0.075, 0.26, 4, 8);
  const mkArm = x => { const g = new THREE.Group(); g.position.set(x, 0.8, 0); const a = new THREE.Mesh(armG, toon.skin()); a.position.y = -0.17; a.castShadow = true; g.add(a); return g; };
  const armL = mkArm(-0.33), armR = mkArm(0.33);
  body.add(torso, shorts, head, legL, legR, armL, armR);
  toon.outline(d, { width: 0.018 });
  // blob shadow (visible when real shadows are off)
  const blobMat = new THREE.MeshBasicMaterial({ color: '#3a3070', transparent: true, opacity: 0.28, depthWrite: false });
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), blobMat); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; blob.renderOrder = 1;
  d.add(blob);
  d.position.set(0, 0.2, 4);
  parent.add(d);
  ctx.cameraRig.follow(d);

  const st = { speed: 0, facing: 0, phase: 0, idle: 0, lean: 0 };
  ctx.loop.add(function stageDummy(dt, t) {
    if (ctx.player && ctx.player.object !== d) return;
    blob.visible = !ctx.quality.shadows;
    const m = ctx.input.move, busy = ctx.busy.is() || ctx.player?.control === false;
    const mag = busy ? 0 : m.mag;
    const target = mag * (ctx.input.run ? 5.6 : 2.6);
    // acceleration ~10 m/s², quicker braking
    const acc = target > st.speed ? 10 : 14;
    st.speed += Math.sign(target - st.speed) * Math.min(Math.abs(target - st.speed), acc * dt);
    if (mag > 0.05) st.facing = angleDamp(st.facing, Math.atan2(m.x, m.z), 1 / 0.12, dt);
    d.rotation.y = st.facing;
    if (st.speed > 0.01) {
      const nx = d.position.x + Math.sin(st.facing) * st.speed * dt, nz = d.position.z + Math.cos(st.facing) * st.speed * dt;
      const res = ctx.world?.resolveMove?.({ x: d.position.x, z: d.position.z }, { x: nx, z: nz }, 0.35) || { x: nx, z: nz };
      const rr = Math.hypot(res.x, res.z), lim = 23.5;
      if (!ctx.world && rr > lim) { res.x *= lim / rr; res.z *= lim / rr; }
      d.position.x = res.x; d.position.z = res.z;
    }
    const gy = ctx.world?.groundY?.(d.position.x, d.position.z);
    d.position.y = Number.isFinite(gy) ? gy : domeY(d.position.x, d.position.z);
    // gait: phase advances with distance; bob, limb swing, lean into acceleration
    const k = Math.min(1, st.speed / 5.6);
    st.phase += st.speed * dt * 2.3;
    const sw = Math.sin(st.phase), walkW = Math.min(1, st.speed / 1.2);
    legL.rotation.x = sw * 0.7 * walkW; legR.rotation.x = -sw * 0.7 * walkW;
    armL.rotation.x = -sw * 0.6 * walkW; armR.rotation.x = sw * 0.6 * walkW;
    armL.rotation.z = damp(armL.rotation.z, -0.12 - k * 0.2, 6, dt); armR.rotation.z = -armL.rotation.z;
    st.idle += dt;
    const breathe = Math.sin(st.idle * 2.2) * 0.012 * (1 - walkW);
    body.position.y = Math.abs(Math.cos(st.phase)) * 0.06 * walkW + breathe;
    torso.scale.set(1 + breathe * 0.8, 1 - breathe * 0.5, 1 + breathe * 0.8);
    st.lean = damp(st.lean, k * 0.16, 5, dt);
    body.rotation.x = st.lean;
    head.rotation.y = damp(head.rotation.y, Math.sin(st.idle * 0.4) * 0.25 * (1 - walkW), 2, dt);
    head.rotation.z = Math.sin(st.phase) * 0.04 * walkW;
  }, ctx.ORDER.actors);
  return d;
}
