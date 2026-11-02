// Sky dome (gradient, sun/moon disc, soft toon clouds, stars), the shadow-casting sun and the
// hemisphere fill. update() applies ctx.time.lighting(): sky, fog, sun colour/direction, hemi.
import * as THREE from 'three';

const VERT = /* glsl */`varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const FRAG = /* glsl */`
uniform vec3 uTop, uHorizon, uSun, uCloud, uCloudShade; uniform vec3 uSunDir; uniform float uStars, uTime, uMoon, uNight;
varying vec3 vDir;
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1., 0.)), u.x), mix(h21(i + vec2(0., 1.)), h21(i + 1.), u.x), u.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.; for (int i = 0; i < 5; i++) { s += a * vn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
// cumulus density on the cloud plane: domain-warped fbm, flat-ish bottoms, puffy tops
float cloudD(vec2 q){
  vec2 w = vec2(fbm(q * 0.5 + 3.1), fbm(q * 0.5 - 1.7));
  float n = fbm(q + w * 1.4);
  return smoothstep(0.5, 0.78, n);
}
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 sd = normalize(uSunDir);
  float mu = dot(d, sd);
  // sky gradient: deep zenith, luminous horizon band (aerial perspective), warmer towards the sun (Mie)
  float hy = clamp(y, 0.0, 1.0);
  vec3 c = mix(uHorizon, uTop, pow(hy, 0.42));
  c = mix(c, uHorizon * 1.04 + 0.03, exp(-hy * 9.0) * 0.55);
  c = mix(c, uHorizon * 0.9, smoothstep(0.0, -0.3, y));
  float mie = pow(max(mu, 0.0), 6.0) * 0.22 + pow(max(mu, 0.0), 48.0) * 0.4;
  c += uSun * mie * (1.0 - uNight * 0.7) * (0.6 + 0.4 * exp(-hy * 3.0));
  // sun / moon disc with a soft limb
  float disc = smoothstep(mix(0.99935, 0.99962, uMoon), mix(0.99965, 0.9998, uMoon), mu);
  c = mix(c, mix(vec3(1.25, 1.18, 1.0), vec3(0.93, 0.95, 1.0), uMoon), disc);
  // stars
  vec3 g = floor(d * 170.0);
  float st = step(0.9968, h21(g.xy + g.z * 7.13)) * smoothstep(0.04, 0.35, y) * uStars;
  c += vec3(st) * (0.6 + 0.4 * sin(uTime * 3.0 + g.x));
  // painted cumulus on a high plane: lit tops, soft shaded bellies, silver lining against the sun
  if (y > 0.015) {
    vec2 q = d.xz / (y + 0.1) * 1.35 + vec2(uTime * 0.01, uTime * 0.0035);
    float den = cloudD(q);
    if (den > 0.001) {
      vec2 toSun = normalize(sd.xz + 1e-4) * 0.22;
      float dSun = cloudD(q + toSun);
      float lit = clamp(1.0 - (dSun - den * 0.55) * 1.6, 0.0, 1.0);
      vec3 shade = mix(uCloudShade, uCloudShade * vec3(0.92, 0.9, 1.02), 0.5);
      vec3 cc = mix(shade, uCloud, 0.25 + 0.75 * lit);
      float rimL = pow(max(mu, 0.0), 10.0) * (1.0 - den) * 1.4;
      cc += uSun * rimL * (1.0 - uNight);
      float fadeH = smoothstep(0.015, 0.16, y);
      cc = mix(uHorizon, cc, 0.35 + 0.65 * smoothstep(0.02, 0.3, y));   // distant clouds melt into the haze
      c = mix(c, cc, den * fadeH * 0.95);
    }
    // thin high cirrus streaks
    vec2 q2 = d.xz / (y + 0.25) * vec2(0.6, 2.4) + vec2(uTime * 0.004, 0.0);
    float ci = smoothstep(0.55, 0.85, fbm(q2 * 1.3)) * smoothstep(0.08, 0.4, y) * 0.22;
    c = mix(c, uCloud, ci * (1.0 - uNight * 0.6));
  }
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * @param {any} ctx
 * @returns {{object:THREE.Group, sun:THREE.DirectionalLight, hemi:THREE.HemisphereLight, update:(dt:number)=>void, lighting:any, setOverride:(o:any)=>void}}
 */
export function buildSky(ctx) {
  const group = new THREE.Group(); group.name = 'sky';
  const U = {
    uTop: { value: new THREE.Color('#5cc3ff') }, uHorizon: { value: new THREE.Color('#d8f4ff') }, uSun: { value: new THREE.Color('#fff6e2') },
    uCloud: { value: new THREE.Color('#ffffff') }, uCloudShade: { value: new THREE.Color('#c9d6f2') },
    uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.3) }, uStars: { value: 0 }, uTime: { value: 0 }, uMoon: { value: 0 }, uNight: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
  dome.renderOrder = -10; dome.frustumCulled = false; dome.name = 'sky-dome';
  group.add(dome);
  const hemi = new THREE.HemisphereLight('#cdeeff', '#a8946a', 1.0);
  const sun = new THREE.DirectionalLight('#fff6e2', 2.4);
  sun.position.set(30, 60, 20);
  group.add(hemi, sun, sun.target);
  ctx.toon.trackSun(sun, { radius: 26 });

  const dir = new THREE.Vector3(), cA = new THREE.Color(), cB = new THREE.Color();
  let override = null;   // {sky, horizon, fog, sun, sunIntensity, hemiSky, hemiGround, hemiIntensity, fogNear, fogFar} (interiors, caves)
  const out = {
    object: group, sun, hemi, dome, lighting: null,
    setOverride(o) { override = o || null; },
    update(dt) {
      U.uTime.value += dt;
      const L = ctx.time.lighting();
      out.lighting = L;
      const O = override;
      U.uTop.value.set(L.sky); U.uHorizon.value.set(L.horizon); U.uSun.value.set(L.sun);
      U.uSunDir.value.set(L.sunDir.x, L.sunDir.y, L.sunDir.z); U.uStars.value = L.stars; U.uMoon.value = L.moon ? 1 : 0; U.uNight.value = L.night;
      U.uCloud.value.copy(cA.set('#ffffff').lerp(cB.set(L.sun), 0.35 + L.warmth * 0.3)).multiplyScalar(1 - L.night * 0.55);
      U.uCloudShade.value.copy(cA.set(L.sky).lerp(cB.set(L.horizon), 0.5)).multiplyScalar(0.92);
      dome.position.copy(ctx.camera.position);
      const scene = ctx.scene;
      if (!scene.background?.isColor) scene.background = new THREE.Color();
      if (!scene.fog) scene.fog = new THREE.Fog('#cdeefa', 60, 220);
      scene.background.set(O?.background || L.horizon);
      scene.fog.color.set(O?.fog || L.fog);
      scene.fog.near = O?.fogNear ?? 75; scene.fog.far = O?.fogFar ?? 260;
      sun.color.set(O?.sun || L.sun); sun.intensity = O?.sunIntensity ?? L.sunIntensity;
      const sd = O?.sunDir || L.sunDir;
      sun.position.copy(sun.target.position).addScaledVector(dir.set(sd.x, sd.y, sd.z), 70);
      hemi.color.set(O?.hemiSky || L.hemiSky); hemi.groundColor.set(O?.hemiGround || L.hemiGround); hemi.intensity = O?.hemiIntensity ?? L.hemiIntensity;
      dome.visible = !O?.hideSky;
    },
  };
  return out;
}
