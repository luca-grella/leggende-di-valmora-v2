// Shared world materials, all built on ctx.toon (same ramp, shade tint and rim as characters):
// solid vertex-colour scenery, windows that light up at night, glowing bulbs/crystals, and the
// wind-swayed vegetation material (vertex shader sway driven by one shared uniform block).
import * as THREE from 'three';

/** Chain an extra onBeforeCompile on a toon material (keeps the Valmora lighting patch). */
export function extendToon(m, key, fn) {
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { base?.call(m, sh, r); fn(sh); };
  const k = m.customProgramCacheKey?.() || '';
  m.customProgramCacheKey = () => k + '|' + key;
  return m;
}

export const WIND = { uTime: { value: 0 }, uWind: { value: 1 }, uPush: { value: new THREE.Vector4(0, 0, -9999, 0) } };
/** See-through for vegetation between the camera and the player (set every frame by src/game.js):
 *  uOccA = camera position, uOccB = player chest position, uOccR = radius (0 = off). */
export const OCCLUDE = { uOccA: { value: new THREE.Vector3() }, uOccB: { value: new THREE.Vector3(0, -9999, 0) }, uOccR: { value: 0 } };

const OCC_VERT = /* glsl */`
#include <project_vertex>
{
  vec4 ow = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    ow = instanceMatrix * ow;
  #endif
  vOccW = (modelMatrix * ow).xyz;
}`;
const OCC_FRAG = /* glsl */`
#include <clipping_planes_fragment>
if (uOccR > 0.0) {
  vec3 ab = uOccB - uOccA;
  float L2 = max(dot(ab, ab), 1e-4);
  float t = clamp(dot(vOccW - uOccA, ab) / L2, 0.0, 1.0);
  float d = length(vOccW - (uOccA + ab * t));
  float before = (1.0 - t) * sqrt(L2);            // metres before the player along the view line
  float k = (1.0 - smoothstep(uOccR * 0.55, uOccR, d)) * smoothstep(0.6, 2.2, before);
  // 4x4 ordered dither: soft-looking see-through without transparency sorting
  vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
  float th = (mod(q.x + q.y * 2.0, 4.0) * 4.0 + mod(q.y + q.x * 3.0, 4.0) + 0.5) / 16.0;
  // close to the player: a soft see-through; well in front of the player (near the camera) foliage vanishes
  // completely, so a big canopy never paints a dotted veil over the whole phone screen
  float cap = mix(0.82, 1.05, smoothstep(3.0, 5.0, before));
  if (k * cap > th) discard;
}`;

const WIND_VERT = /* glsl */`
#include <begin_vertex>
{
  vec3 ip = vec3(0.0);
  #ifdef USE_INSTANCING
    ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
  #endif
  float hgt = max(0.0, position.y - uSwayBase);
  float k = hgt * hgt * uSway;
  float ph = uTime * 1.3 + ip.x * 0.21 + ip.z * 0.17;
  float s = sin(ph) * 0.65 + sin(ph * 2.3 + 1.7) * 0.25;
  transformed.x += s * k * uWind;
  transformed.z += cos(ph * 0.8 + 0.6) * k * 0.45 * uWind;
}`;

/**
 * @param {any} ctx
 */
export function createWorldMats(ctx) {
  const T = ctx.toon;
  const emissiveFromColor = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance *= vColor;\n#endif');
  };
  const solid = T.matVC({ surf: 'attr' });   // surface detail from the builder's aSurf attribute
  // windows: pale glass by day, warm light at night (emissive driven by lamps)
  const windows = extendToon(T.matUnique('#ffffff', { vertexColors: true, emissive: '#ffc867', emissiveIntensity: 0 }), 'win', () => {});
  // bulbs, lanterns, crystals: emissive = vertex colour × intensity
  const glow = extendToon(T.matUnique('#ffffff', { vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0.35 }), 'glowvc', emissiveFromColor);
  // always-glowing (crystals in caves, campfire, lava)
  const glowAlways = extendToon(T.matUnique('#ffffff', { vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0.9 }), 'glowvc2', emissiveFromColor);

  /** Wind-swayed vertex-colour material (trees, bushes, flowers). sway: bend strength, base: height where bending starts. */
  const windCache = new Map();
  function wind(sway = 0.012, base = 0.4, o = {}) {
    const key = `${sway}|${base}|${o.side || 0}`;
    if (windCache.has(key)) return windCache.get(key);
    const m = T.matUnique('#ffffff', { vertexColors: true, side: o.side ?? THREE.FrontSide, surf: 'attr' });
    const U = { uSway: { value: sway }, uSwayBase: { value: base } };
    extendToon(m, 'wind', sh => {
      Object.assign(sh.uniforms, WIND, U, OCCLUDE);
      sh.vertexShader = 'uniform float uTime, uWind, uSway, uSwayBase;\nvarying vec3 vOccW;\n' + sh.vertexShader.replace('#include <begin_vertex>', WIND_VERT).replace('#include <project_vertex>', OCC_VERT);
      sh.fragmentShader = 'uniform vec3 uOccA, uOccB;\nuniform float uOccR;\nvarying vec3 vOccW;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', OCC_FRAG);
    });
    m.customProgramCacheKey = (k => () => k)(m.customProgramCacheKey() + key);
    windCache.set(key, m);
    return m;
  }
  const mats = { solid, windows, glow, glowAlways, wind, water: solid };
  mats.forBuilder = () => ({ solid, windows, glow, glowAlways });
  /** Night lamps 0..1 → window/bulb emission. */
  mats.setLamps = (k, inCave = false) => {
    windows.emissiveIntensity = 0.05 + k * 0.95;
    glow.emissiveIntensity = 0.3 + k * 1.3;
    glowAlways.emissiveIntensity = inCave ? 1.4 : 0.9 + k * 0.5;
  };
  return mats;
}
