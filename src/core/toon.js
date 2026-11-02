// The shared Sun/Moon look: toon materials on one soft 3-band ramp with a cool purple-blue shade
// (never black), crisp warm rim light, toon-consistent cast shadows, skin/eye/glow helpers and
// inverted-hull outlines with near-constant on-screen width. Every area builds its meshes with these
// (docs/ARCHITECTURE.md "Core API").
//
// Light units: three r160 physical units (no legacy ×π). ctx.time.lighting() already returns
// intensities in these units, so World can assign them directly (sun.intensity = L.sunIntensity).
import * as THREE from 'three';
import { SURF_GLSL, SURF } from './surfaces.js';

/** Named colours from docs/GDD.md "Look". */
export const PALETTE = {
  sea: '#4fe0d2', lagoon: '#2bb7c9', deep: '#1673a8', sand: '#f6dfa0', grass: '#7dcb4c', grass2: '#9bd85a', tallGrass: '#3f9e3a',
  path: '#d9b27a', rock: '#b9a48c', wood: '#b97b47', roofCoral: '#e8674a', roofTeal: '#2fa8a0', roofSun: '#f5b83d', roofLilac: '#9b7fd1',
  wall: '#fff2d8', pink: '#ff5f9e', yellow: '#ffd23f', white: '#ffffff', skyDay: '#8fd8ff', skyHorizon: '#d8f4ff', sunset: '#ffb07a',
  night: '#22305e', outline: '#2a2140', shadow: '#5b5f9e', skin: '#f6d0b1',
};

// Soft volumetric ramp (v2 "near real" pass, after Luca's feedback): input dot(N,L)*0.5+0.5 (half-Lambert).
// No hard bands any more: a smooth, wide terminator (painted/plush look, like Sun/Moon's in-game models)
// with a low floor so forms read in 3D; the shade is tinted cool and filled by the hemisphere light.
const SHADE = 0.34, MID = 0.72;
const EDGE_LO = 0.3, EDGE_HI = 0.78;

/** Build the shared gradient ramp (256×1, linear filtering → smooth gradient). */
function buildRamp() {
  const N = 256, data = new Uint8Array(N * 4);
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    // smooth body shading + a slightly brighter "key" plateau on the lit side
    const body = ss(EDGE_LO, EDGE_HI, x);
    const key = ss(0.66, 0.95, x);
    const v = SHADE + (MID - SHADE) * body + (1 - MID) * key;
    const b = Math.round(Math.min(1, v) * 255);
    data.set([b, b, b, 255], i * 4);
  }
  const t = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  t.name = 'toon-ramp';
  return t;
}

/** Tileable value-noise texture (R: soft fbm for cloud shadows, G: finer detail). */
function buildNoise(size = 128) {
  let seed = 1337;
  const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const oct = [[4, 0.5], [8, 0.27], [16, 0.15], [32, 0.08]];
  const grids = oct.map(([n]) => { const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = R(); return g; });
  const data = new Uint8Array(size * size * 4);
  const sample = (k, x, y) => {
    const [n] = oct[k], g = grids[k];
    const fx = x / size * n, fy = y / size * n, x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const at = (i, j) => g[((j % n + n) % n) * n + ((i % n + n) % n)];
    const a0 = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx, a1 = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a0 + (a1 - a0) * sy;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0; for (let k = 0; k < 4; k++) v += sample(k, x, y) * oct[k][1];
    const d = sample(2, x * 3 + 11, y * 3 + 5) * 0.6 + sample(3, x * 2, y * 2) * 0.4;
    const o = (y * size + x) * 4;
    data[o] = Math.max(0, Math.min(255, v * 255)); data[o + 1] = Math.max(0, Math.min(255, d * 255)); data[o + 2] = 128; data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true; t.name = 'world-noise';
  return t;
}

const S = SHADE.toFixed(3);
// Replacement for three's lights_toon_pars_fragment: smooth ramp, cool tinted shade, soft cast shadows
// (they fall towards the shade floor, never to black), drifting cloud shadows on the sun light and a
// soft Blinn-Phong sheen (gives materials a touch of real surface response).
const TOON_LIGHTS = /* glsl */`
varying vec3 vViewPosition;
struct ToonMaterial { vec3 diffuseColor; };
uniform vec3 uShadeTint;
uniform mat4 uCamWorld;
uniform sampler2D uNoiseTex;
uniform vec4 uCloud;      // offset.xy, strength, cover
uniform float uSheen;
#ifndef SURF_ON
float gSurfGloss = 0.0;
#endif
float toonRamp( float dotNL ) {
  vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.5 );
  #ifdef USE_GRADIENTMAP
    return texture2D( gradientMap, coord ).r;
  #else
    return mix( ${S}, 1.0, smoothstep( 0.3, 0.8, coord.x ) );
  #endif
}
float valmoraCloud() {
  if ( uCloud.z <= 0.0 ) return 1.0;
  vec3 wp = ( uCamWorld * vec4( -vViewPosition, 1.0 ) ).xyz;
  float n = texture2D( uNoiseTex, wp.xz * 0.0045 + uCloud.xy ).r;
  float c = smoothstep( 1.0 - uCloud.w, 1.0 - uCloud.w + 0.22, n );
  return 1.0 - uCloud.z * c;
}
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  float ndl = dot( geometryNormal, directLight.direction );
  float g = toonRamp( ndl );
  vec3 col = directLight.color;
  float lit = 1.0;
  #if NUM_DIR_LIGHTS > 0
  if ( dot( directLight.direction, directionalLights[ 0 ].direction ) > 0.9999 ) {
    vec3 full = directionalLights[ 0 ].color;
    float k = clamp( dot( col, vec3( 1.0 ) ) / max( dot( full, vec3( 1.0 ) ), 1e-4 ), 0.0, 1.0 );
    k *= valmoraCloud();
    lit = k;
    g = mix( min( g, ${S} ) * 0.9, g, k );
    col = full;
  }
  #endif
  vec3 tint = mix( uShadeTint, vec3( 1.0 ), smoothstep( ${S}, 0.95, g ) );
  reflectedLight.directDiffuse += g * tint * col * BRDF_Lambert( material.diffuseColor );
  // soft sheen: broad, faint highlight only where the sun really hits
  vec3 hv = normalize( directLight.direction + geometryViewDir );
  float sp = pow( max( dot( geometryNormal, hv ), 0.0 ), 28.0 + 60.0 * gSurfGloss ) * smoothstep( 0.0, 0.25, ndl ) * lit;
  reflectedLight.directDiffuse += col * sp * ( uSheen * 0.05 + gSurfGloss * 0.5 );   // (toon output ignores directSpecular)
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

// Surface detail (src/core/surfaces.js) for environment materials: triplanar colour detail, normal and
// cavity from the shared texture arrays. Layer from the vertex attribute aSurf (layer + 1, 0 = none) on
// merged scenery, or a constant layer per material. A tiny gloss term feeds the sun sheen.
const SURF_VERT_PARS = /* glsl */`
#ifdef SURF_ATTR
attribute float aSurf;
#endif
varying float vSurf; varying vec3 vSurfW; varying vec3 vSurfN;
`;
const SURF_VERT = /* glsl */`
#include <worldpos_vertex>
{
  #ifdef SURF_ATTR
    vSurf = aSurf - 1.0;
  #else
    vSurf = SURF_CONST;
  #endif
  vec4 sp = vec4(transformed, 1.0);
  vec3 sn = objectNormal;
  #ifdef USE_INSTANCING
    sp = instanceMatrix * sp; sn = mat3(instanceMatrix) * sn;
  #endif
  vSurfW = (modelMatrix * sp).xyz;
  vSurfN = normalize(mat3(modelMatrix) * sn);
}`;
const SURF_FRAG_PARS = /* glsl */`
varying float vSurf; varying vec3 vSurfW; varying vec3 vSurfN;
float gSurfGloss = 0.0;
` + SURF_GLSL;
const SURF_COLOR = /* glsl */`
#include <color_fragment>
vec3 surfNW = vec3(0.0); bool surfHas = false;
if (vSurf > -0.5 && uSurfOn.x > 0.5) {
  vec3 sc; float sao, sg;
  surfTri(vSurfW, normalize(vSurfN), int(vSurf + 0.5), sc, surfNW, sao, sg);
  // distance fade: far surfaces keep the plain painted colour (no shimmer)
  float sd = 1.0 - smoothstep(45.0, 110.0, length(vViewPosition));
  diffuseColor.rgb *= mix(vec3(1.0), sc, uSurfOn.y * sd);
  diffuseColor.rgb *= mix(1.0, clamp(sao * 1.55, 0.35, 1.25), 0.75 * uSurfOn.w * sd);
  gSurfGloss = sg * sd;
  surfHas = sd > 0.01;
}`;
const SURF_NORMAL = /* glsl */`
#include <normal_fragment_maps>
if (surfHas) normal = normalize(mix(normal, normalize(mat3(viewMatrix) * surfNW) * (gl_FrontFacing ? 1.0 : 1.0), 0.85));
`;
let SURF_U = null;

/**
 * @param {{renderer:THREE.WebGLRenderer, quality:any}} opts
 */
export function createToon({ renderer, quality }) {
  const ramp = buildRamp();
  // shared uniforms, driven by the time of day through toon.setLighting (called by the core)
  const shared = {
    uShadeTint: { value: new THREE.Color(0.62, 0.62, 0.95) },  // cool lilac multiplier for the shade band
    uRimColor: { value: new THREE.Color('#fff1d6') },
    uCamWorld: { value: new THREE.Matrix4() },
    uNoiseTex: { value: buildNoise() },
    uCloud: { value: new THREE.Vector4(0, 0, 0, 0.42) },     // offset x/y, strength (0 = off), cover
    uSheen: { value: 1 },
  };
  const cache = new Map();
  const outlineMats = new Map();
  const _c = new THREE.Color(), _d = new THREE.Vector3();
  let sun = null, lastL = null, cloudsOn = true, cloudDay = 1;

  /** Patch a MeshToonMaterial with the Valmora lighting model. */
  function patch(m, { rim = 0, shadeTint = null, sheen = 1, surf = null } = {}) {
    m.userData.rim = rim;
    m.userData.uRim = { value: rim };
    m.userData.uSheen = m.userData.uSheen || { value: sheen };
    const shade = shadeTint ? { value: new THREE.Color(shadeTint) } : shared.uShadeTint;
    m.userData.uShadeTint = shade;
    // surf: 'attr' (vertex attribute aSurf = layer + 1) or a layer name (constant); needs toon.useSurfaces()
    const surfOn = !!surf && !!SURF_U && (surf === 'attr' || surf in SURF);
    m.userData.surf = surfOn ? surf : null;
    // meshes without an aSurf buffer must read 0 (plain), not a stale generic attribute value
    if (surfOn && surf === 'attr') m.defaultAttributeValues = { ...(m.defaultAttributeValues || {}), aSurf: [0] };
    m.onBeforeCompile = sh => {
      sh.uniforms.uShadeTint = shade;
      sh.uniforms.uRimColor = shared.uRimColor;
      sh.uniforms.uRim = m.userData.uRim;
      sh.uniforms.uCamWorld = shared.uCamWorld; sh.uniforms.uNoiseTex = shared.uNoiseTex; sh.uniforms.uCloud = shared.uCloud;
      sh.uniforms.uSheen = m.userData.uSheen;
      if (surfOn) {
        Object.assign(sh.uniforms, SURF_U);
        const def = '#define SURF_ON\n' + (surf === 'attr' ? '#define SURF_ATTR\n' : `#define SURF_CONST ${SURF[surf].toFixed(1)}\n`);
        sh.vertexShader = def + sh.vertexShader
          .replace('#include <common>', '#include <common>\n' + SURF_VERT_PARS)
          .replace('#include <worldpos_vertex>', SURF_VERT);
        sh.fragmentShader = def + sh.fragmentShader
          .replace('#include <common>', '#include <common>\n' + SURF_FRAG_PARS)
          .replace('#include <color_fragment>', SURF_COLOR)
          .replace('#include <normal_fragment_maps>', SURF_NORMAL);
      }
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <lights_toon_pars_fragment>', TOON_LIGHTS + (rim > 0 ? '#define TOON_RIM\nuniform vec3 uRimColor;\nuniform float uRim;\n' : ''))
        .replace('#include <lights_fragment_end>', TOON_RIM);
    };
    m.customProgramCacheKey = () => 'valmora-toon' + (rim > 0 ? '-rim' : '') + (surfOn ? '-surf-' + surf : '');
    return m;
  }

  const keyOf = (c, o) => (c?.isColor ? '#' + c.getHexString() : String(c)) + '|' + JSON.stringify(o || {});

  const toon = {
    ramp, palette: PALETTE, uniforms: shared, SHADE,
    /** Plug the surface-detail textures in (core, before any world material is created). */
    useSurfaces(s) { SURF_U = s?.uniforms || null; toon.surfaces = s || null; },
    surfaces: null,

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
      patch(m, { rim: o.rim || 0, shadeTint: o.shadeTint, sheen: o.sheen ?? 1, surf: o.surf });
      m.name = 'toon ' + k;
      cache.set(k, m);
      return m;
    },
    /** A fresh (uncached) toon material, safe to animate (colour, opacity, emissive). */
    matUnique(color = '#ffffff', o = {}) {
      const m = toon.mat(color, o).clone();
      m.userData = { ...m.userData, uSheen: { value: o.sheen ?? 1 } };
      patch(m, { rim: o.rim || 0, shadeTint: o.shadeTint, sheen: o.sheen ?? 1, surf: o.surf });
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
    outline(root, { width = 0.015, color = PALETTE.outline, skip } = {}) {
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
      shared.uShadeTint.value.setRGB(0.74 + 0.1 * warm - 0.1 * night, 0.76 - 0.06 * warm - 0.06 * night, 0.98 + 0.02 * night);
      // cloud shadows: strongest at midday, gone at night (the moon light stays even)
      cloudDay = (1 - night) * (1 - 0.5 * warm);
      shared.uRimColor.value.set(L.rim || '#fff1d6');
    },
    /** Called by the core after the camera update: camera matrix for world-space effects, cloud drift. */
    frame(camera, dt = 1 / 60) {
      camera.updateMatrixWorld();
      shared.uCamWorld.value.copy(camera.matrixWorld);
      const c = shared.uCloud.value;
      c.x = (c.x + dt * 0.0016) % 1; c.y = (c.y + dt * 0.0009) % 1;
      c.z = cloudsOn ? 0.3 * cloudDay : 0;
    },
    /** Drifting cloud shadows on/off (World turns them off indoors and in caves). */
    set clouds(v) { cloudsOn = !!v; },
    get clouds() { return cloudsOn; },
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
