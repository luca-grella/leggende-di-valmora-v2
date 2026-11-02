// Romance effects, all procedural and cheap (one draw call each):
//  - hearts: instanced chubby 3D hearts with an outline shell that pop (easeOutBack), float up with a
//    wobble, face the camera and shrink away;
//  - motes: GPU points for fireflies (night), drifting petals (day/sunset), water glitter, candle halos;
//  - splash: a short burst of water droplets.
import * as THREE from 'three';

const MAX_HEARTS = 24;

function heartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.16, -0.33, -0.56, -0.1, -0.56, 0.2);
  s.bezierCurveTo(-0.56, 0.46, -0.32, 0.6, -0.14, 0.52);
  s.bezierCurveTo(-0.06, 0.48, 0, 0.41, 0, 0.34);
  s.bezierCurveTo(0, 0.41, 0.06, 0.48, 0.14, 0.52);
  s.bezierCurveTo(0.32, 0.6, 0.56, 0.46, 0.56, 0.2);
  s.bezierCurveTo(0.56, -0.1, 0.16, -0.33, 0, -0.5);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 2, curveSegments: 7 });
  g.center();
  g.computeVertexNormals();
  return g;
}

/** Outline material for instanced meshes (inverted hull, pushed along normals in object space). */
function outlineMat(color, width) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.BackSide });
  m.onBeforeCompile = sh => {
    sh.uniforms.uOutline = { value: width };
    sh.vertexShader = 'uniform float uOutline;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * uOutline;');
  };
  m.customProgramCacheKey = () => 'romance-outline-' + width;
  return m;
}

export function createHearts(ctx) {
  const geo = heartGeometry();
  const mat = ctx.toon.mat('#ff5f9e', { emissive: '#ff2f74', emissiveIntensity: 0.28, rim: 0.4 });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX_HEARTS);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.renderOrder = 5;
  const palette = ['#ff5f9e', '#ff3d68', '#ff8fb8', '#ff6f91', '#ffb3c8'].map(c => new THREE.Color(c));
  for (let i = 0; i < MAX_HEARTS; i++) mesh.setColorAt(i, palette[i % palette.length]);
  const shell = ctx.quality?.outlines ? new THREE.InstancedMesh(geo, outlineMat(ctx.toon.palette.outline, 0.07), MAX_HEARTS) : null;
  if (shell) { shell.instanceMatrix = mesh.instanceMatrix; shell.frustumCulled = false; shell.renderOrder = 4; }
  const group = new THREE.Group(); group.name = 'romance-hearts';
  group.add(mesh); if (shell) group.add(shell);
  group.visible = false;

  const slots = Array.from({ length: MAX_HEARTS }, () => ({ on: false, t: 0, life: 2, x: 0, y: 0, z: 0, vx: 0, vz: 0, rise: 1, size: 0.2, ph: 0 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qz = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAX_HEARTS; i++) mesh.setMatrixAt(i, zero);
  let active = 0;
  const backOut = k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

  const api = {
    object: group,
    /** Pop n hearts around a world position. */
    burst(at, n = 3, { spread = 0.35, size = 0.22, rise = 0.9, life = 2.0, delay = 0.12 } = {}) {
      if (!group.parent) ctx.scene.add(group);
      for (let k = 0; k < n; k++) {
        const sl = slots.find(x => !x.on); if (!sl) break;
        Object.assign(sl, {
          on: true, t: -k * delay, life: life * (0.85 + Math.random() * 0.3),
          x: at.x + (Math.random() - 0.5) * spread, y: at.y + (Math.random() - 0.2) * 0.15, z: at.z + (Math.random() - 0.5) * spread,
          vx: (Math.random() - 0.5) * 0.25, vz: (Math.random() - 0.5) * 0.25, rise: rise * (0.8 + Math.random() * 0.4),
          size: size * (0.75 + Math.random() * 0.5), ph: Math.random() * 6.28,
        });
        active++;
      }
      group.visible = true;
    },
    update(dt) {
      if (!active) return;
      const cam = ctx.camera;
      let live = 0, top = -1;
      for (let i = 0; i < MAX_HEARTS; i++) {
        const h = slots[i];
        if (!h.on) continue;
        h.t += dt;
        if (h.t < 0) { mesh.setMatrixAt(i, zero); live++; top = i; continue; }
        const k = h.t / h.life;
        if (k >= 1) { h.on = false; active--; mesh.setMatrixAt(i, zero); continue; }
        live++; top = i;
        const pop = k < 0.18 ? backOut(k / 0.18) : 1;
        const out = k > 0.72 ? 1 - (k - 0.72) / 0.28 : 1;
        const sc = h.size * pop * out * out * (3 - 2 * out);
        const ease = 1 - Math.pow(1 - k, 2);
        p.set(h.x + h.vx * k + Math.sin(h.t * 3.2 + h.ph) * 0.06, h.y + h.rise * ease, h.z + h.vz * k);
        qz.setFromAxisAngle(Z, Math.sin(h.t * 2.4 + h.ph) * 0.28);
        q.copy(cam.quaternion).multiply(qz);
        s.setScalar(Math.max(sc, 1e-4));
        mesh.setMatrixAt(i, m4.compose(p, q, s));
      }
      mesh.instanceMatrix.needsUpdate = true;
      // draw only up to the last live slot (keeps idle instances out of the vertex count)
      mesh.count = top + 1; if (shell) shell.count = top + 1;
      if (!live) { active = 0; group.visible = false; }
    },
    clear() { for (const h of slots) h.on = false; active = 0; group.visible = false; },
    dispose() { group.removeFromParent(); geo.dispose(); },
  };
  return api;
}

// ---------------------------------------------------------------------------------------------
// Motes: GPU-animated points. Modes: 0 fireflies, 1 falling petals, 2 glitter, 3 halo (static glow)
const MOTE_VS = `
uniform float uTime, uSize, uScale, uMode, uRange;
attribute float aSeed;
varying float vA; varying float vSeed;
void main() {
  vec3 p = position;
  float t = uTime + aSeed * 37.0;
  vSeed = aSeed;
  if (uMode < 0.5) {
    p += vec3(sin(t * 0.55 + aSeed * 6.0) * 0.7, sin(t * 0.8 + aSeed * 3.0) * 0.35, cos(t * 0.5 + aSeed * 5.0) * 0.7);
    vA = smoothstep(0.15, 1.0, 0.5 + 0.5 * sin(t * 1.7 + aSeed * 20.0));
  } else if (uMode < 1.5) {
    float f = fract(t * 0.07 + aSeed);
    p.y += uRange * (1.0 - f);
    p.x += sin(t * 1.1 + aSeed * 9.0) * 0.45 + f * 0.8;
    p.z += cos(t * 0.9 + aSeed * 7.0) * 0.45;
    vA = smoothstep(0.0, 0.12, f) * (1.0 - smoothstep(0.85, 1.0, f));
  } else if (uMode < 2.5) {
    vA = pow(max(0.0, sin(t * 2.6 + aSeed * 40.0)), 8.0);
  } else {
    vA = 0.82 + 0.18 * sin(t * 9.0 + aSeed * 13.0) * sin(t * 5.3 + aSeed * 3.0);
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * uScale / max(0.1, -mv.z), 1.0, 256.0);
}`;
const MOTE_FS = `
uniform vec3 uColor; uniform vec3 uCore; uniform float uMode; uniform float uOpacity;
varying float vA; varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (uMode > 0.5 && uMode < 1.5) {
    float a = vSeed * 6.2831;
    c = mat2(cos(a), -sin(a), sin(a), cos(a)) * c;
    c.x *= 1.7;
    float d = length(c);
    float m = 1.0 - smoothstep(0.36, 0.44, d);
    vec3 col = mix(uCore, uColor, smoothstep(0.0, 0.4, d));
    gl_FragColor = vec4(col, m * vA * uOpacity);
    if (gl_FragColor.a < 0.02) discard;
    return;
  }
  float d = length(c) * 2.0;
  float glow = pow(max(0.0, 1.0 - d), 2.2);
  float core = 1.0 - smoothstep(0.0, 0.28, d);
  vec3 col = mix(uColor, uCore, core);
  gl_FragColor = vec4(col * (glow + core), (glow + core * 0.5) * vA * uOpacity);
  if (gl_FragColor.a < 0.01) discard;
}`;

/**
 * @param {any} ctx
 * @param {{x:number,y:number,z:number}[]} points base positions (world)
 * @param {{mode?:'fireflies'|'petals'|'glitter'|'halo', color?:string, core?:string, size?:number, range?:number, opacity?:number}} o
 */
export function createMotes(ctx, points, { mode = 'fireflies', color = '#ffe17a', core = '#fffbe6', size = 0.12, range = 3, opacity = 1 } = {}) {
  const n = points.length;
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  points.forEach((p, i) => { pos.set([p.x, p.y, p.z], i * 3); seed[i] = Math.random(); });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.computeBoundingSphere();
  const modeId = { fireflies: 0, petals: 1, glitter: 2, halo: 3 }[mode] ?? 0;
  const mat = new THREE.ShaderMaterial({
    vertexShader: MOTE_VS, fragmentShader: MOTE_FS, transparent: true, depthWrite: false,
    blending: modeId === 1 ? THREE.NormalBlending : THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uSize: { value: size }, uScale: { value: 600 }, uMode: { value: modeId }, uRange: { value: range },
      uColor: { value: new THREE.Color(color) }, uCore: { value: new THREE.Color(core) }, uOpacity: { value: opacity },
    },
  });
  const obj = new THREE.Points(geo, mat);
  obj.frustumCulled = false; obj.renderOrder = 6; obj.name = 'romance-motes-' + mode;
  return {
    object: obj,
    set opacity(v) { mat.uniforms.uOpacity.value = v; },
    get opacity() { return mat.uniforms.uOpacity.value; },
    update(dt) {
      mat.uniforms.uTime.value += dt;
      const cam = ctx.camera, h = ctx.renderer.domElement.height || 800;
      mat.uniforms.uScale.value = h / (2 * Math.tan((cam.fov * Math.PI) / 360));
    },
    dispose() { obj.removeFromParent(); geo.dispose(); mat.dispose(); },
  };
}

/** Random points in a ring/box around a centre (helper for motes). */
export function scatter(center, n, { rx = 3, rz = 3, y0 = 0.3, y1 = 2.2, rng = Math.random } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng());
    out.push({ x: center.x + Math.cos(a) * r * rx, y: center.y + y0 + rng() * (y1 - y0), z: center.z + Math.sin(a) * r * rz });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
/** Water splash: droplets thrown up in arcs (instanced spheres, toon water colour). */
export function createSplash(ctx) {
  const N = 40;
  const geo = new THREE.IcosahedronGeometry(0.05, 1);
  const mesh = new THREE.InstancedMesh(geo, ctx.toon.mat('#bff6ff', { emissive: '#7fe6ff', emissiveIntensity: 0.35 }), N);
  mesh.frustumCulled = false; mesh.visible = false;
  const d = Array.from({ length: N }, () => ({ t: 9, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  let live = 0;
  return {
    object: mesh,
    burst(at, dir = { x: 0, z: 1 }, n = 26) {
      if (!mesh.parent) ctx.scene.add(mesh);
      for (let i = 0; i < Math.min(n, N); i++) {
        const a = (Math.random() - 0.5) * 1.6, sp = 1.4 + Math.random() * 2.2;
        const dx = dir.x * Math.cos(a) - dir.z * Math.sin(a), dz = dir.x * Math.sin(a) + dir.z * Math.cos(a);
        Object.assign(d[i], { t: 0, x: at.x, y: at.y, z: at.z, vx: dx * sp, vy: 2.2 + Math.random() * 2.4, vz: dz * sp, s: 0.6 + Math.random() * 1.2 });
      }
      live = 1; mesh.visible = true;
    },
    update(dt) {
      if (!live) return;
      let any = false;
      for (let i = 0; i < N; i++) {
        const k = d[i];
        if (k.t > 1.2) { m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, m4); continue; }
        any = true; k.t += dt;
        k.vy -= 9.8 * dt; k.x += k.vx * dt; k.y += k.vy * dt; k.z += k.vz * dt;
        p.set(k.x, k.y, k.z); s.setScalar(k.s * Math.max(0, 1 - k.t / 1.2));
        mesh.setMatrixAt(i, m4.compose(p, q, s));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (!any) { live = 0; mesh.visible = false; }
    },
    dispose() { mesh.removeFromParent(); geo.dispose(); },
  };
}
