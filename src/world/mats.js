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
  const solid = T.matVC();
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
    const m = T.matUnique('#ffffff', { vertexColors: true, side: o.side ?? THREE.FrontSide });
    const U = { uSway: { value: sway }, uSwayBase: { value: base } };
    extendToon(m, 'wind', sh => {
      Object.assign(sh.uniforms, WIND, U);
      sh.vertexShader = 'uniform float uTime, uWind, uSway, uSwayBase;\n' + sh.vertexShader.replace('#include <begin_vertex>', WIND_VERT);
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
