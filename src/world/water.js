// The sea: one wave-displaced plane that follows the camera (snapped to its grid, so the waves never
// swim), coloured in crisp toon bands by the depth baked per island (shallows → lagoon → deep),
// with rolling shore foam rings, caustic glints in the shallows, sparkles and night-time dimming.
// The same plane is the water of rivers (carved below sea level) and lagoons.
import * as THREE from 'three';
import { GLSL_NOISE } from './terrain.js';

const SIZE = 640, SEG = 128;

const VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
uniform float uTime;
uniform sampler2D uTex; uniform vec4 uBox; uniform float uHas;
varying vec3 vW; varying float vDepth, vShore, vWave;
${GLSL_NOISE}
vec2 waterData(vec2 p){
  vec2 uv = (p - uBox.xy) / (uBox.zw - uBox.xy);
  float inside = uHas * step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec4 t = texture2D(uTex, clamp(uv, 0.0, 1.0));
  return mix(vec2(8.0, 24.0), vec2(t.r * 8.0, t.g * 24.0), inside);
}
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 wd = waterData(wp.xz);
  float amp = 0.07 * smoothstep(0.0, 2.5, wd.x) + 0.012;
  float w = sin(dot(wp.xz, vec2(0.23, 0.11)) + uTime * 1.0) * 0.55 + sin(dot(wp.xz, vec2(-0.13, 0.27)) + uTime * 1.4) * 0.3 + sin(dot(wp.xz, vec2(0.37, -0.31)) + uTime * 2.1) * 0.15;
  wp.y += w * amp;
  vW = wp.xyz; vDepth = wd.x; vShore = wd.y; vWave = w;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform float uTime, uNight, uOpacity;
uniform vec3 uShallow, uLagoon, uDeep, uFoam, uLight, uSparkle;
uniform vec3 uSkyTop, uSkyHor, uSunDir, uSunCol;
uniform sampler2D uTex; uniform vec4 uBox; uniform float uHas;
varying vec3 vW; varying float vDepth, vShore, vWave;
${GLSL_NOISE}
// gradient of the vertex swell + two scrolling ripple layers → shading normal
vec3 waterNormal(vec2 p, float t, float amp){
  vec2 k1 = vec2(0.23, 0.11), k2 = vec2(-0.13, 0.27), k3 = vec2(0.37, -0.31);
  vec2 gw = k1 * cos(dot(p, k1) + t) * 0.55 + k2 * cos(dot(p, k2) + t * 1.4) * 0.3 + k3 * cos(dot(p, k3) + t * 2.1) * 0.15;
  gw *= amp;
  float e = 0.12;
  vec2 q1 = p * 0.9 + vec2(t * 0.11, t * 0.07), q2 = p * 2.3 - vec2(t * 0.16, -t * 0.12);
  float a0 = vnoise(q1), ax = vnoise(q1 + vec2(e, 0.0)), az = vnoise(q1 + vec2(0.0, e));
  float b0 = vnoise(q2), bx = vnoise(q2 + vec2(e, 0.0)), bz = vnoise(q2 + vec2(0.0, e));
  vec2 gr = vec2(ax - a0, az - a0) / e * 0.09 + vec2(bx - b0, bz - b0) / e * 0.045;
  return normalize(vec3(-(gw.x + gr.x), 1.0, -(gw.y + gr.y)));
}
void main(){
  vec2 p = vW.xz;
  // per-pixel depth (smoother than the vertex value near the shore)
  vec2 uv = (p - uBox.xy) / (uBox.zw - uBox.xy);
  float inside = uHas * step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec4 T = texture2D(uTex, clamp(uv, 0.0, 1.0));
  float depth = mix(8.0, T.r * 8.0, inside), shore = mix(24.0, T.g * 24.0, inside);
  float t = uTime;
  float n1 = vnoise(p * 0.12 + vec2(t * 0.05, t * 0.03)), n2 = vnoise(p * 0.37 - vec2(t * 0.07, -t * 0.04));
  float d = depth + (n1 - 0.5) * 0.7;
  // depth colour: soft painted gradient shallows → lagoon → deep (still banded a touch, Alola style)
  vec3 col = mix(uShallow, uLagoon, smoothstep(0.6, 1.8, d));
  col = mix(col, uDeep, smoothstep(2.6, 5.2, d));
  col = mix(col, uDeep * 0.8, smoothstep(6.5, 8.0, d + n2 * 0.6));
  // caustic web in the shallows
  float c1 = vnoise(p * 1.3 + vec2(t * 0.21, t * 0.13)), c2 = vnoise(p * 1.7 - vec2(t * 0.17, -t * 0.15) + 3.1);
  float caus = smoothstep(0.9, 0.97, 1.0 - abs(c1 - c2) * 3.0);
  col += caus * 0.08 * (1.0 - smoothstep(0.4, 2.2, depth)) * (1.0 - uNight);
  // sparkles on wave crests
  float sp = smoothstep(0.9, 0.95, vnoise(p * 2.4 + vec2(t * 0.6, -t * 0.4)) * 0.75 + (vWave * 0.5 + 0.5) * 0.3);
  col += uSparkle * sp * 0.3 * smoothstep(1.2, 3.0, depth);
  // shore foam: contact line + two rings rolling in
  float br = vnoise(p * 0.45 + vec2(t * 0.08, -t * 0.05));
  float contact = 1.0 - smoothstep(0.03, 0.08 + br * 0.06, depth);
  float ph = fract(shore * 0.22 - t * 0.18 + br * 0.25);
  float ring = (1.0 - smoothstep(0.03, 0.07, abs(ph - 0.5))) * (1.0 - smoothstep(1.0, 5.0, shore)) * smoothstep(0.4, 0.55, br + 0.1);
  float ph2 = fract(shore * 0.22 - t * 0.18 + 0.5 + br * 0.25);
  ring = max(ring, (1.0 - smoothstep(0.02, 0.05, abs(ph2 - 0.5))) * (1.0 - smoothstep(1.0, 3.5, shore)) * 0.6 * smoothstep(0.45, 0.6, br + 0.1));
  float foam = clamp(max(contact, ring), 0.0, 1.0);
  col = mix(col, uFoam, foam * 0.9);
  // sky reflection (fresnel) + sun glitter streak; calmer in the shallows
  float amp = 0.07 * smoothstep(0.0, 2.5, depth) + 0.012;
  vec3 N = waterNormal(p, t, amp * 1.0 + 0.04);
  vec3 V = normalize(cameraPosition - vW);
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uSkyHor, uSkyTop, pow(clamp(R.y, 0.0, 1.0), 0.5));
  col = mix(col, sky, clamp(fres * 0.85, 0.0, 0.6) * (1.0 - foam) * smoothstep(0.2, 2.5, depth));
  float sg = pow(max(dot(R, normalize(uSunDir)), 0.0), 220.0) * 3.0 + pow(max(dot(R, normalize(uSunDir)), 0.0), 24.0) * 0.12;
  col += uSunCol * sg * (1.0 - foam) * (1.0 - uNight * 0.5) * smoothstep(0.3, 1.5, depth);
  col *= uLight;
  float a = mix(0.55, 0.93, smoothstep(0.05, 1.6, depth));
  a = max(a, fres * 0.8 * smoothstep(0.2, 2.5, depth));
  a = max(a, foam * 0.95);
  a = mix(a, 1.0, smoothstep(5.0, 7.5, depth));
  gl_FragColor = vec4(col, a * uOpacity);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/**
 * @param {any} ctx
 * @returns {{object:THREE.Mesh, update:(dt:number,t:number)=>void, setIsland:(tex:THREE.Texture|null, box:number[]|null)=>void}}
 */
export function buildWater(ctx) {
  const P = ctx.toon.palette;
  const blank = new THREE.DataTexture(new Uint8Array([255, 255, 0, 255]), 1, 1); blank.needsUpdate = true;
  const U = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uNight: { value: 0 }, uOpacity: { value: 1 },
    uShallow: { value: new THREE.Color(P.sea) }, uLagoon: { value: new THREE.Color(P.lagoon) }, uDeep: { value: new THREE.Color(P.deep) },
    uFoam: { value: new THREE.Color('#ffffff') }, uLight: { value: new THREE.Color(1, 1, 1) }, uSparkle: { value: new THREE.Color('#ffffff') },
    uTex: { value: blank }, uBox: { value: new THREE.Vector4(0, 0, 1, 1) }, uHas: { value: 0 },
    uSkyTop: { value: new THREE.Color('#5cc3ff') }, uSkyHor: { value: new THREE.Color('#d8f4ff') }, uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.3) }, uSunCol: { value: new THREE.Color('#fff6e2') },
  }]);
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, fog: true, depthWrite: false });
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sea'; mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.receiveShadow = false;
  const cell = SIZE / SEG;
  const cA = new THREE.Color();
  return {
    object: mesh, material: mat,
    setIsland(tex, box) {
      U.uTex.value = tex || blank; U.uHas.value = tex ? 1 : 0;
      if (box) U.uBox.value.set(box[0], box[1], box[2], box[3]);
    },
    /** Per-island tint of the shallows (e.g. black-sand bay, coral lagoon). */
    setTint(shallow, lagoon) { U.uShallow.value.set(shallow || P.sea); U.uLagoon.value.set(lagoon || P.lagoon); },
    update(dt, t) {
      U.uTime.value = t;
      const c = ctx.cameraRig?.followPos?.x != null && ctx.cameraRig.mode === 'explore' ? ctx.cameraRig.followPos : ctx.camera.position;
      mesh.position.set(Math.round(c.x / cell) * cell, 0, Math.round(c.z / cell) * cell);
      const L = ctx.time.lighting();
      U.uNight.value = L.night;
      // water picks up the sky: warm at dusk, deep blue at night
      cA.set(L.sun).lerp(cA.clone().set('#ffffff'), 0.55);
      U.uLight.value.setRGB(1, 1, 1).lerp(cA, L.warmth * 0.5).multiplyScalar(1 - L.night * 0.45);
      U.uLight.value.b = Math.min(1.1, U.uLight.value.b + L.night * 0.12);
      U.uSparkle.value.set(L.moon ? '#cfd8ff' : '#fffbe8');
      U.uSkyTop.value.set(L.sky); U.uSkyHor.value.set(L.horizon); U.uSunCol.value.set(L.sun).multiplyScalar(L.moon ? 0.35 : 1);
      U.uSunDir.value.set(L.sunDir.x, L.sunDir.y, L.sunDir.z);
    },
  };
}
