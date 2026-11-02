// The shared Sun/Moon look: toon materials on one soft 3-band ramp with a cool purple-blue shade
// (never black), crisp warm rim light, toon-consistent cast shadows, skin/eye/glow helpers and
// inverted-hull outlines with near-constant on-screen width. Every area builds its meshes with these
// (docs/ARCHITECTURE.md "Core API").
//
// Light units: three r160 physical units (no legacy ×π). ctx.time.lighting() already returns
// intensities in these units, so World can assign them directly (sun.intensity = L.sunIntensity).
import * as THREE from 'three';

/** Named colours from docs/GDD.md "Look". */
export const PALETTE = {
  sea: '#4fe0d2', lagoon: '#2bb7c9', deep: '#1673a8', sand: '#f6dfa0', grass: '#7dcb4c', grass2: '#9bd85a', tallGrass: '#3f9e3a',
  path: '#d9b27a', rock: '#b9a48c', wood: '#b97b47', roofCoral: '#e8674a', roofTeal: '#2fa8a0', roofSun: '#f5b83d', roofLilac: '#9b7fd1',
  wall: '#fff2d8', pink: '#ff5f9e', yellow: '#ffd23f', white: '#ffffff', skyDay: '#8fd8ff', skyHorizon: '#d8f4ff', sunset: '#ffb07a',
  night: '#22305e', outline: '#2a2140', shadow: '#5b5f9e', skin: '#f6d0b1',
};

// Ramp bands (input: dot(N,L)*0.5+0.5): shade value, mid value, band edges and edge softness.
const SHADE = 0.5, MID = 0.8;
const EDGE_LO = 0.47, EDGE_HI = 0.6, SOFT = 0.035;

/** Build the shared gradient ramp (256×1, linear filtering → soft but crisp band edges). */
function buildRamp() {
  const N = 256, data = new Uint8Array(N * 4);
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    const v = SHADE + (MID - SHADE) * ss(EDGE_LO - SOFT, EDGE_LO + SOFT, x) + (1 - MID) * ss(EDGE_HI - SOFT, EDGE_HI + SOFT, x);
    const b = Math.round(v * 255);
    data.set([b, b, b, 255], i * 4);
  }
  const t = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  t.name = 'toon-ramp';
  return t;
}

const S = SHADE.toFixed(3);
// Replacement for three's lights_toon_pars_fragment: tinted shade band; cast shadows clamp to the
// shade band (toon look) instead of dropping to ambient-only darkness.
const TOON_LIGHTS = /* glsl */`
varying vec3 vViewPosition;
struct ToonMaterial { vec3 diffuseColor; };
uniform vec3 uShadeTint;
float toonRamp( float dotNL ) {
  vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.5 );
  #ifdef USE_GRADIENTMAP
    return texture2D( gradientMap, coord ).r;
  #else
    return mix( ${S}, 1.0, smoothstep( 0.5, 0.56, coord.x ) );
  #endif
}
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  float g = toonRamp( dot( geometryNormal, directLight.direction ) );
  vec3 col = directLight.color;
  #if NUM_DIR_LIGHTS > 0
  if ( dot( directLight.direction, directionalLights[ 0 ].direction ) > 0.9999 ) {
    vec3 full = directionalLights[ 0 ].color;
    float k = clamp( dot( col, vec3( 1.0 ) ) / max( dot( full, vec3( 1.0 ) ), 1e-4 ), 0.0, 1.0 );
    g = mix( min( g, ${S} ), g, k );
    col = full;
  }
  #endif
  vec3 tint = mix( uShadeTint, vec3( 1.0 ), smoothstep( ${S}, 1.0, g ) );
  reflectedLight.directDiffuse += g * tint * col * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct RE_Direct_Toon
#define RE_IndirectDiffuse RE_IndirectDiffuse_Toon
`;

// Crisp rim light, stronger on the sun-facing side, tinted by the time of day.
const TOON_RIM = /* glsl */`
#include <lights_fragment_end>
#ifdef TOON_RIM
{
  float ndv = 1.0 - clamp( dot( normal, geometryViewDir ), 0.0, 1.0 );
  float rimK = smoothstep( 0.58, 0.74, ndv );
  float side = 0.55;
  #if NUM_DIR_LIGHTS > 0
    side = 0.3 + 0.7 * clamp( dot( normal, directionalLights[ 0 ].direction ) * 0.6 + 0.55, 0.0, 1.0 );
  #endif
  reflectedLight.directDiffuse += uRimColor * ( diffuseColor.rgb * 0.45 + 0.55 ) * rimK * side * uRim;
}
#endif
`;

// Inverted hull: push along the normal, scaled with view distance so the line stays ~constant on screen.
const OUTLINE_VERT = /* glsl */`
#include <begin_vertex>
{
  vec4 mvp0 = modelViewMatrix * vec4( transformed, 1.0 );
  float camD = isPerspectiveMatrix( projectionMatrix ) ? -mvp0.z : 10.0;
  transformed += normalize( normal ) * uOutline * clamp( camD / 10.0, 0.45, 2.2 );
}
`;

/**
 * @param {{renderer:THREE.WebGLRenderer, quality:any}} opts
 */
export function createToon({ renderer, quality }) {
  const ramp = buildRamp();
  // shared uniforms, driven by the time of day through toon.setLighting (called by the core)
  const shared = {
    uShadeTint: { value: new THREE.Color(0.62, 0.62, 0.95) },  // cool lilac multiplier for the shade band
    uRimColor: { value: new THREE.Color('#fff1d6') },
  };
  const cache = new Map();
  const outlineMats = new Map();
  const _c = new THREE.Color(), _d = new THREE.Vector3();
  let sun = null, lastL = null;

  /** Patch a MeshToonMaterial with the Valmora lighting model. */
  function patch(m, { rim = 0, shadeTint = null } = {}) {
    m.userData.rim = rim;
    m.userData.uRim = { value: rim };
    const shade = shadeTint ? { value: new THREE.Color(shadeTint) } : shared.uShadeTint;
    m.userData.uShadeTint = shade;
    m.onBeforeCompile = sh => {
      sh.uniforms.uShadeTint = shade;
      sh.uniforms.uRimColor = shared.uRimColor;
      sh.uniforms.uRim = m.userData.uRim;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <lights_toon_pars_fragment>', TOON_LIGHTS + (rim > 0 ? '#define TOON_RIM\nuniform vec3 uRimColor;\nuniform float uRim;\n' : ''))
        .replace('#include <lights_fragment_end>', TOON_RIM);
    };
    m.customProgramCacheKey = () => 'valmora-toon' + (rim > 0 ? '-rim' : '');
    return m;
  }

  const keyOf = (c, o) => (c?.isColor ? '#' + c.getHexString() : String(c)) + '|' + JSON.stringify(o || {});

  const toon = {
    ramp, palette: PALETTE, uniforms: shared, SHADE,

    /**
     * Cached toon material. opts: {emissive, emissiveIntensity, transparent, opacity, side, vertexColors,
     * rim (0..1), fog=true, flatShading, depthWrite, shadeTint}. Materials are shared: clone before mutating.
     */
    mat(color = '#ffffff', o = {}) {
      const k = keyOf(color, o);
      let m = cache.get(k);
      if (m) return m;
      m = new THREE.MeshToonMaterial({
        color: new THREE.Color(color), gradientMap: ramp,
        emissive: o.emissive ? new THREE.Color(o.emissive) : new THREE.Color(0), emissiveIntensity: o.emissiveIntensity ?? 1,
        transparent: !!o.transparent, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide,
        vertexColors: !!o.vertexColors, fog: o.fog ?? true,
      });
      if (o.flatShading) m.flatShading = true;
      if (o.depthWrite === false) m.depthWrite = false;
      patch(m, { rim: o.rim || 0, shadeTint: o.shadeTint });
      m.name = 'toon ' + k;
      cache.set(k, m);
      return m;
    },
    /** A fresh (uncached) toon material, safe to animate (colour, opacity, emissive). */
    matUnique(color = '#ffffff', o = {}) {
      const m = toon.mat(color, o).clone();
      patch(m, { rim: o.rim || 0, shadeTint: o.shadeTint });
      return m;
    },
    /** Shared vertex-colour toon material for merged scenery (white base × vertex colours). */
    matVC(o = {}) { return toon.mat('#ffffff', { ...o, vertexColors: true }); },
    /** Toon skin: warm rosy terminator and a soft rim. */
    skin(color = PALETTE.skin, o = {}) { return toon.mat(color, { rim: 0.32, shadeTint: '#f0a8a8', ...o }); },
    /** Eye material (dark iris that stays readable in the shade; pass a light colour for sclera). */
    eye(color = '#2a1a12') { return toon.mat(color, { emissive: color, emissiveIntensity: 0.3 }); },
    /** Emissive glow (lamps, flames, sparks). Intensity > 1 feeds the bloom on mid/high. */
    glow(color = '#ffd23f', intensity = 1.2) { return toon.mat(color, { emissive: color, emissiveIntensity: intensity }); },

    /**
     * Inverted-hull outline shells for every mesh under root. No-op on quality low.
     * width is in metres at 10 m from the camera (auto-scaled with distance).
     * color: a CSS colour or 'auto' (darkened mesh colour, Sun/Moon style). Returns root.
     * Meshes with userData.noOutline are skipped.
     */
    outline(root, { width = 0.02, color = PALETTE.outline, skip } = {}) {
      if (!quality?.outlines || !root) return root;
      const list = [];
      root.traverse(o => { if (o.isMesh && !o.isInstancedMesh && !o.userData.isOutline && !o.userData.noOutline && !(skip && skip(o))) list.push(o); });
      for (const o of list) {
        if (o.children.some(c => c.userData.isOutline)) continue;
        let c = color;
        if (color === 'auto') {
          const base = Array.isArray(o.material) ? o.material[0]?.color : o.material?.color;
          const hsl = { h: 0, s: 0, l: 0 }; (base || _c.set(PALETTE.outline)).getHSL(hsl);
          c = '#' + _c.setHSL(hsl.h, Math.min(1, hsl.s * 0.7 + 0.15), Math.min(0.2, hsl.l * 0.3)).getHexString();
        }
        const m = outlineMaterial(c, width);
        const shell = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, m) : new THREE.Mesh(o.geometry, m);
        if (o.isSkinnedMesh) shell.bind(o.skeleton, o.bindMatrix);
        shell.userData.isOutline = true; shell.castShadow = false; shell.receiveShadow = false;
        shell.frustumCulled = o.frustumCulled; shell.renderOrder = o.renderOrder;
        shell.raycast = () => {};
        o.add(shell);
      }
      return root;
    },
    /** Remove outline shells under root (e.g. before re-dressing a character). */
    removeOutline(root) {
      const rm = [];
      root?.traverse(o => { if (o.userData.isOutline) rm.push(o); });
      rm.forEach(o => o.removeFromParent());
      return root;
    },

    /**
     * Register the one shadow-casting sun (World / test stage). The core then fits its shadow camera
     * around the followed player every frame (texel-snapped: no shimmering) and applies the quality's
     * shadow settings. radius = half size of the shadowed square in metres.
     */
    trackSun(light, { radius = 24 } = {}) {
      sun = light || null;
      if (!sun) return null;
      sun.userData.shadowRadius = radius;
      if (!sun.target.parent && sun.parent) sun.parent.add(sun.target);
      applySunQuality();
      return sun;
    },
    get sun() { return sun; },

    /** Called by the core every frame with ctx.time.lighting(): tints the shade band and the rim light. */
    setLighting(L) {
      if (!L || L === lastL) return;            // ctx.time.lighting() is cached: skip identical frames
      lastL = L;
      const night = L.night ?? 0, warm = L.warmth ?? 0;
      // day: cool lilac shade; dusk: rosy violet; night: deep blue
      shared.uShadeTint.value.setRGB(0.6 + 0.1 * warm - 0.08 * night, 0.62 - 0.05 * warm - 0.04 * night, 0.95 + 0.03 * night);
      shared.uRimColor.value.set(L.rim || '#fff1d6');
    },
    /** Called by the core after the camera update: shadow camera follows `center`. */
    updateShadow(center) {
      if (!sun || !sun.castShadow || !center) return;
      const r = sun.userData.shadowRadius || 24, cam = sun.shadow.camera;
      if (cam.right !== r || cam.far !== 160) { Object.assign(cam, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 160 }); cam.updateProjectionMatrix(); }
      _d.copy(sun.position).sub(sun.target.position);
      if (_d.lengthSq() < 1e-6) _d.set(0.5, 1, 0.3);
      _d.normalize();
      const texel = (2 * r) / (sun.shadow.mapSize.x || 1024);
      const tx = Math.round(center.x / texel) * texel, tz = Math.round(center.z / texel) * texel;
      sun.target.position.set(tx, center.y || 0, tz);
      sun.position.copy(sun.target.position).addScaledVector(_d, 70);
      sun.target.updateMatrixWorld();
    },
    applyQuality: () => applySunQuality(),
  };

  function applySunQuality() {
    if (!sun) return;
    const size = quality?.shadowMapSize || 1024;
    sun.castShadow = !!quality?.shadows;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose(); sun.shadow.map = null;
    }
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.04;
  }

  function outlineMaterial(color, width) {
    const k = color + '|' + width;
    let m = outlineMats.get(k);
    if (m) return m;
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.BackSide, fog: true });
    m.onBeforeCompile = sh => {
      sh.uniforms.uOutline = { value: width };
      sh.vertexShader = 'uniform float uOutline;\n' + sh.vertexShader.replace('#include <begin_vertex>', OUTLINE_VERT);
    };
    m.customProgramCacheKey = () => 'valmora-outline';
    m.userData.isOutlineMaterial = true;
    m.name = 'outline ' + k;
    outlineMats.set(k, m);
    return m;
  }

  return toon;
}
