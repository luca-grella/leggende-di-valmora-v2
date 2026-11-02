// Surface detail for environment materials (ground, rock, stone, wood, bark, roofs, walls, paths).
// Two graphics modes, chosen once at startup with the URL parameter `grafica`:
//   default            'immagini' → CC0 photo textures (Poly Haven, assets/textures/*.jpg, 512 px), harmonised
//   ?grafica=codice    'codice'   → everything generated in code (src/core/surfgen.js, in a Worker); the
//                                   files in assets/ are never requested.
// Both modes fill the SAME two texture arrays, so every shader is shared:
//   uSurfCol (RGBA8 array): RGB = colour detail around 1.0 (stored ×0.5), A = height
//   uSurfNor (RGBA8 array): RG = tangent normal, B = cavity/AO, A = gloss
// Detail multiplies the palette / vertex colour of the mesh: textures add structure, never their own
// photo colours, so environment and characters keep one coherent painted look.
import * as THREE from 'three';
import { finalize } from './surfgen.js';

/** Layer table: name → index, world size of one tile (metres), how much photo hue/contrast to keep (immagini), proc = always code. */
export const SURF_LAYERS = [
  { name: 'grass', tile: 2.2, chroma: 0.3, contrast: 1.5 },
  { name: 'dirt', tile: 3.2, chroma: 0.3, contrast: 0.9 },
  { name: 'sand', tile: 3.0, chroma: 0.2, contrast: 0.8 },
  { name: 'rock', tile: 4.5, chroma: 0.15, contrast: 1.0 },
  { name: 'cobble', tile: 2.4, chroma: 0.25, contrast: 1.0 },
  { name: 'plaster', tile: 2.2, chroma: 0.15, contrast: 1.6 },
  { name: 'roof', tile: 1.8, chroma: 0.25, contrast: 0.9 },
  { name: 'wood', tile: 1.6, chroma: 0.2, contrast: 0.85 },
  { name: 'bark', tile: 1.4, chroma: 0.15, contrast: 0.9 },
  { name: 'stone', tile: 2.4, chroma: 0.25, contrast: 0.9 },
  { name: 'thatch', tile: 2.0, chroma: 0.25, contrast: 0.9 },
  // vegetation canopies: always generated in code in both modes (it is not an environment photo surface)
  { name: 'leaf', tile: 1.7, proc: true },
];
export const SURF = Object.fromEntries(SURF_LAYERS.map((l, i) => [l.name, i]));
export const SURF_COUNT = SURF_LAYERS.length;

/**
 * GLSL shared by every surface-aware shader. Requires `uSurfCol`, `uSurfNor`, `uSurfScale[]`, `uSurfOn` uniforms
 * (surfaces.uniforms). surfPlanar(): one projection (ground); surfTri(): triplanar with skipped weak axes.
 */
export const SURF_GLSL = /* glsl */`
precision highp sampler2DArray;
uniform sampler2DArray uSurfCol, uSurfNor;
uniform float uSurfScale[${SURF_COUNT}];
uniform vec4 uSurfOn;   // x on/off, y detail strength, z normal strength, w cavity strength
struct Surf { vec3 col; float h; vec2 n; float ao; float gloss; };
Surf surfSample(vec2 uv, float layer) {
  vec4 c = texture(uSurfCol, vec3(uv, layer));
  vec4 n = texture(uSurfNor, vec3(uv, layer));
  Surf s; s.col = c.rgb * 2.0; s.h = c.a; s.n = n.xy * 2.0 - 1.0; s.ao = n.z; s.gloss = n.w;
  return s;
}
// world-space planar sample on xz (ground), with a second rotated, larger octave to hide tiling
Surf surfPlanar(vec2 wp, int layer) {
  float sc = 1.0 / uSurfScale[layer];
  Surf a = surfSample(wp * sc, float(layer));
  vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * wp * sc * 0.37 + 0.31;
  a.col *= mix(vec3(1.0), texture(uSurfCol, vec3(q, float(layer))).rgb * 2.0, 0.4);
  return a;
}
// triplanar: world position + world normal → detail colour, perturbed world normal, cavity, gloss.
// Axes with a tiny weight are skipped (walls and floors cost one sample pair).
void surfTri(vec3 wp, vec3 wn, int layer, out vec3 col, out vec3 nW, out float ao, out float gloss) {
  float sc = 1.0 / uSurfScale[layer], L = float(layer);
  vec3 w = pow(abs(wn), vec3(4.0)); w /= max(dot(w, vec3(1.0)), 1e-4);
  col = vec3(0.0); ao = 0.0; gloss = 0.0;
  vec3 pert = vec3(0.0); float ws = 0.0;
  if (w.x > 0.03) { Surf s = surfSample(wp.zy * sc, L); col += s.col * w.x; ao += s.ao * w.x; gloss += s.gloss * w.x; pert += vec3(0.0, s.n.y, s.n.x) * w.x; ws += w.x; }
  if (w.y > 0.03) { Surf s = surfSample(wp.xz * sc, L); col += s.col * w.y; ao += s.ao * w.y; gloss += s.gloss * w.y; pert += vec3(s.n.x, 0.0, s.n.y) * w.y; ws += w.y; }
  if (w.z > 0.03) { Surf s = surfSample(wp.xy * sc, L); col += s.col * w.z; ao += s.ao * w.z; gloss += s.gloss * w.z; pert += vec3(s.n.x, s.n.y, 0.0) * w.z; ws += w.z; }
  ws = max(ws, 1e-4); col /= ws; ao /= ws; gloss /= ws;
  nW = normalize(wn + pert / ws * uSurfOn.z);
}
`;

/**
 * @param {{renderer:THREE.WebGLRenderer, quality:any, params:URLSearchParams}} o
 */
export function createSurfaces({ renderer, quality, params }) {
  const want = (params?.get('grafica') || '').toLowerCase();
  const mode = want === 'codice' ? 'codice' : 'immagini';
  const size = quality?.tier === 'low' ? 256 : 512;
  const n = SURF_COUNT, layerBytes = size * size * 4;
  // neutral start (flat detail, flat normal) so the world renders correctly before the data arrives
  const colData = new Uint8Array(layerBytes * n), norData = new Uint8Array(layerBytes * n);
  for (let k = 0; k < size * size * n; k++) {
    colData.set([128, 128, 128, 128], k * 4);
    norData.set([128, 128, 200, 30], k * 4);
  }
  const mk = (data, name) => {
    const t = new THREE.DataArrayTexture(data, size, size, n);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy?.() || 1);
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true; t.name = name;
    return t;
  };
  const colTex = mk(colData, 'surf-col'), norTex = mk(norData, 'surf-nor');

  const uniforms = {
    uSurfCol: { value: colTex }, uSurfNor: { value: norTex },
    uSurfScale: { value: SURF_LAYERS.map(l => l.tile) },
    uSurfOn: { value: new THREE.Vector4(1, 1, 1, 1) },
  };
  let loaded = 0;
  const api = {
    mode, size, layers: SURF_LAYERS, SURF, colTex, norTex, uniforms, glsl: SURF_GLSL,
    /** Layer index by name (−1 when unknown). */
    index: name => (name in SURF ? SURF[name] : -1),
    get loaded() { return loaded; },
    /** Resolves when every layer is in the textures (or failed → stays neutral). */
    ready: null,
    /** Detail on/off (quality low turns the extra normal/cavity work down). */
    applyQuality() {
      const low = quality?.tier === 'low';
      uniforms.uSurfOn.value.set(1, 1, low ? 0.6 : 1, low ? 0.7 : 1);
    },
  };

  function put(i, col, nor) {
    colData.set(col, i * layerBytes); norData.set(nor, i * layerBytes);
    loaded++;
    colTex.needsUpdate = true; norTex.needsUpdate = true;
  }

  api.ready = (mode === 'codice'
    ? loadCode(SURF_LAYERS.map((l, i) => i))
    : Promise.all([loadImages(), loadCode(SURF_LAYERS.map((l, i) => (l.proc ? i : -1)).filter(i => i >= 0))])
  ).catch(e => console.warn('[surfaces]', e));
  api.applyQuality();
  return api;

  // ---- procedural layers (all of them in 'codice', the leaf layer in both) in a Worker, main-thread fallback ----
  function loadCode(idx) {
    const names = idx.map(i => SURF_LAYERS[i].name);
    return new Promise(resolve => {
      if (!names.length) { resolve(); return; }
      const done = new Set();
      let worker = null;
      try { worker = new Worker(new URL('./surfgen.js', import.meta.url), { type: 'module' }); } catch { worker = null; }
      const fallback = async () => {
        const { generateLayer } = await import('./surfgen.js');
        for (let k = 0; k < names.length; k++) {
          if (done.has(k)) continue;
          const { col, nor } = generateLayer(names[k], size); put(idx[k], col, nor); done.add(k);
          await new Promise(r => setTimeout(r, 0));
        }
        resolve();
      };
      if (!worker) { fallback(); return; }
      const timer = setTimeout(() => { worker.terminate(); fallback(); }, 25000);
      worker.onmessage = e => {
        const d = e.data;
        if (d.done) { clearTimeout(timer); worker.terminate(); resolve(); return; }
        put(idx[d.i], d.col, d.nor); done.add(d.i);
      };
      worker.onerror = e => { console.warn('[surfaces] worker failed, generating on the main thread', e.message || e); clearTimeout(timer); worker.terminate(); fallback(); };
      worker.postMessage({ names, size });
    });
  }

  // ---- 'immagini': CC0 photo textures, harmonised to detail ----
  async function loadImages() {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const read = async url => {
      const img = new Image(); img.decoding = 'async'; img.src = url;
      await img.decode();
      g.clearRect(0, 0, size, size); g.drawImage(img, 0, 0, size, size);
      return g.getImageData(0, 0, size, size).data;
    };
    const lin = new Float32Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    for (let i = 0; i < SURF_LAYERS.length; i++) {
      const L = SURF_LAYERS[i];
      if (L.proc) continue;
      try {
        const [c, nh] = await Promise.all([read(`assets/textures/${L.name}_col.jpg`), read(`assets/textures/${L.name}_nh.jpg`)]);
        const N = size * size, C = new Float32Array(N * 3), H = new Float32Array(N), NXY = new Float32Array(N * 2);
        for (let j = 0; j < size; j++) {
          const src = (size - 1 - j) * size;   // flip: row 0 = v 0 (normal map green stays "up")
          for (let x = 0; x < size; x++) {
            const s = (src + x) * 4, k = j * size + x;
            C[k * 3] = lin[c[s]]; C[k * 3 + 1] = lin[c[s + 1]]; C[k * 3 + 2] = lin[c[s + 2]];
            H[k] = nh[s + 2] / 255;
            NXY[k * 2] = nh[s] / 127.5 - 1; NXY[k * 2 + 1] = nh[s + 1] / 127.5 - 1;
          }
        }
        // soften photo high-frequency noise a touch (painted look): blend each texel with its neighbours
        soften(C, size, 0.35);
        const { col, nor } = finalize(L.name, size, C, H, NXY, { chroma: L.chroma, contrast: L.contrast });
        put(i, col, nor);
      } catch (e) { console.warn('[surfaces] texture', L.name, e?.message || e); }
      await new Promise(r => setTimeout(r, 0));
    }
  }
}

function soften(C, size, k) {
  const src = C.slice();
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const o = (j * size + i) * 3, l = (j * size + (i + size - 1) % size) * 3, r = (j * size + (i + 1) % size) * 3;
    const u = (((j + 1) % size) * size + i) * 3, d = (((j + size - 1) % size) * size + i) * 3;
    for (let c = 0; c < 3; c++) C[o + c] = src[o + c] * (1 - k) + (src[l + c] + src[r + c] + src[u + c] + src[d + c]) * 0.25 * k;
  }
}
