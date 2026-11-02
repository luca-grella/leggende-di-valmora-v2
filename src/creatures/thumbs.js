// Velmon thumbnails for the UI (Velmondex, team, box): the real 3D model rendered offscreen with the main renderer
// into a small render target (transparent background, 3/4 front view, idle pose), read back into a PNG data URL.
// Cached per species+size; renders are queued one per macrotask so opening the Velmondex never freezes a frame.
import * as THREE from 'three';
import { SPECIES } from './species.js';
import { buildVelmon } from './model.js';

export function createThumbnails(ctx) {
  const cache = new Map();          // key → Promise<dataURL>
  const done = new Map();           // key → dataURL
  let queue = Promise.resolve();
  let studio = null;

  function getStudio() {
    if (studio) return studio;
    const scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight('#e6f6ff', '#b39a7a', 1.25);
    const key = new THREE.DirectionalLight('#fff4e0', 2.3); key.position.set(2, 4, 3);
    const rim = new THREE.DirectionalLight('#bfe4ff', 1.0); rim.position.set(-3, 2, -2);
    scene.add(hemi, key, rim);
    const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 50);
    studio = { scene, camera };
    return studio;
  }

  function fallback(speciesId, size) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    const col = { Fuoco: '#ee8130', Acqua: '#6390f0', Erba: '#7ac74c', Elettro: '#f7d02c' }[SPECIES[speciesId]?.types?.[0]] || '#b9a4e8';
    g.fillStyle = col; g.beginPath(); g.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2); g.fill();
    return c.toDataURL();
  }

  function render(speciesId, size) {
    const r = ctx.renderer;
    if (!r || !SPECIES[speciesId]) return fallback(speciesId, size);
    const { scene, camera } = getStudio();
    const px = Math.min(512, Math.round(size * Math.min(2, Math.max(1, (ctx.viewport?.pixelRatio || 1)))));
    const rt = new THREE.WebGLRenderTarget(px, px, { samples: r.capabilities?.isWebGL2 ? 4 : 0 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const model = buildVelmon(ctx, speciesId);
    try {
      model.play('idle'); model.update(0.4);
      scene.add(model.object);
      model.object.rotation.y = -0.45;
      model.object.updateMatrixWorld(true);
      const h = model.height, rad = Math.max(model.radius, h * 0.45);
      const box = new THREE.Box3().setFromObject(model.object);
      const c = box.getCenter(new THREE.Vector3());
      const span = Math.max(box.max.y - box.min.y, (box.max.x - box.min.x) * 0.9, rad * 1.6);
      const dist = (span * 0.62) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      camera.position.set(c.x + dist * 0.12, c.y + dist * 0.22, c.z + dist);
      camera.lookAt(c.x, c.y - span * 0.02, c.z);
      camera.updateMatrixWorld(true);
      const prevTarget = r.getRenderTarget(), prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
      const prevShadow = r.shadowMap.autoUpdate;
      r.shadowMap.autoUpdate = false;
      r.setRenderTarget(rt);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, true);
      r.render(scene, camera);
      const buf = new Uint8Array(px * px * 4);
      r.readRenderTargetPixels(rt, 0, 0, px, px, buf);
      r.setRenderTarget(prevTarget);
      r.setClearColor(prevClear, prevAlpha);
      r.shadowMap.autoUpdate = prevShadow;
      // flip Y into a canvas
      const cv = document.createElement('canvas'); cv.width = cv.height = size;
      const tmp = document.createElement('canvas'); tmp.width = tmp.height = px;
      const g = tmp.getContext('2d');
      const img = g.createImageData(px, px);
      for (let y = 0; y < px; y++) img.data.set(buf.subarray((px - 1 - y) * px * 4, (px - y) * px * 4), y * px * 4);
      g.putImageData(img, 0, 0);
      const g2 = cv.getContext('2d');
      g2.imageSmoothingQuality = 'high';
      g2.drawImage(tmp, 0, 0, size, size);
      return cv.toDataURL('image/png');
    } catch (e) {
      console.warn('[thumbs] render failed', speciesId, e);
      return fallback(speciesId, size);
    } finally {
      model.dispose();
      rt.dispose();
    }
  }

  return {
    /** → Promise<dataURL> */
    get(speciesId, size = 128) {
      size = Math.max(16, Math.min(512, Math.round(size)));
      const k = speciesId + '@' + size;
      if (cache.has(k)) return cache.get(k);
      const p = queue = queue.then(() => new Promise(res => setTimeout(() => res(render(speciesId, size)), 0)));
      cache.set(k, p);
      p.then(u => done.set(k, u));
      return p;
    },
    /** Synchronous cached value (null until rendered). */
    peek(speciesId, size = 128) { return done.get(speciesId + '@' + size) || null; },
    clear() { cache.clear(); done.clear(); },
  };
}
