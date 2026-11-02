// Leggende di Valmora 2 — Core. createCore() builds the engine every other area runs on and returns ctx.
// Contract: docs/ARCHITECTURE.md "Core API". Loop orders: input -1000, time 1, systems 10, actors 20,
// world 30, camera 40, ui 50; rendering after all callbacks.
import * as THREE from 'three';
import { createBus } from './bus.js';
import { createLoop, ORDER } from './loop.js';
import { createSave } from './save.js';
import { createFlags } from './flags.js';
import { createTime, lightingAt, phaseOf } from './time.js';
import { createInput } from './input.js';
import { createCameraRig } from './camera.js';
import { createToon } from './toon.js';
import { kit } from './meshkit.js';
import { createQuality } from './quality.js';
import { createPost } from './post.js';
import { createAudio } from './audio.js';
import { createBusy } from './busy.js';
import { createInteract } from './interact.js';
import { createFade } from './fade.js';
import { createDebug } from './debug.js';
import { createTestStage } from './stage.js';
import { createTouchControls } from './touch.js';
import { math } from './math.js';
import { installGestureGuards, createHaptics } from './pwa.js';

export const VERSION = '2.0.0-dev';

/**
 * @param {{canvasParent?:HTMLElement, debug?:boolean, quality?:string, startLoop?:boolean}} [opts]
 * @returns {Promise<any>} ctx
 */
export async function createCore(opts = {}) {
  const params = new URLSearchParams(location.search);
  const isDebug = opts.debug ?? params.has('debug');
  const parent = opts.canvasParent || document.body;
  const ctx = { THREE, math, kit, params, isDebug, ORDER, VERSION };
  ctx.createTestStage = o => (ctx.stage = createTestStage(ctx, o));
  ctx.createTouchControls = (root, o) => createTouchControls(ctx, root, o);
  ctx.bus = createBus();
  ctx.save = createSave({ bus: ctx.bus });
  ctx.flags = createFlags({ save: ctx.save, bus: ctx.bus });
  ctx.busy = createBusy({ bus: ctx.bus });

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false }); }
  catch (e) {
    parent.innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font:700 18px ui-rounded,system-ui,sans-serif;color:#5a2d1a;background:#ffd27a">WebGL non è disponibile su questo dispositivo.<br>Prova ad aggiornare il browser.</div>';
    throw e;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;           // toon colours stay saturated (grade in post)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;';
  canvas.setAttribute('aria-label', 'Leggende di Valmora');
  parent.appendChild(canvas);
  ctx.renderer = renderer;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8fd8ff');
  scene.fog = new THREE.Fog('#cdeefa', 70, 230);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 700);
  camera.position.set(0, 12, 9);
  scene.add(camera);                                    // children of the camera (UI-ish 3D bits) render too
  ctx.scene = scene; ctx.camera = camera;

  const qOverride = opts.quality || params.get('quality');
  ctx.quality = createQuality({ renderer, bus: ctx.bus, save: ctx.save, debug: isDebug,
    override: ['low', 'mid', 'high', 'auto'].includes(qOverride) ? qOverride : null });
  ctx.loop = createLoop({
    render: () => { renderer.info.reset(); ctx.post ? ctx.post.render() : renderer.render(scene, camera); },
    onFrame: real => ctx.quality.sample(real),
  });
  ctx.toon = createToon({ renderer, quality: ctx.quality });
  ctx.cameraRig = createCameraRig({ camera, ctx });
  ctx.input = createInput({ bus: ctx.bus, getYaw: () => ctx.cameraRig.effectiveYaw, save: ctx.save });
  ctx.time = createTime({ bus: ctx.bus, save: ctx.save });
  ctx.time.lightingAt = lightingAt; ctx.time.phaseOf = phaseOf;
  ctx.interact = createInteract(ctx);
  ctx.fade = createFade();
  ctx.audio = createAudio({ bus: ctx.bus, save: ctx.save });
  ctx.haptic = createHaptics(ctx);

  ctx.viewport = { width: 1, height: 1, portrait: false, pixelRatio: 1, aspect: 1 };
  const resize = () => {
    const vv = window.visualViewport;
    const w = Math.max(1, Math.round(parent === document.body ? (vv?.width || innerWidth) : parent.clientWidth || innerWidth));
    const h = Math.max(1, Math.round(parent === document.body ? (vv?.height || innerHeight) : parent.clientHeight || innerHeight));
    const pr = ctx.quality.pixelRatio;
    const changed = w !== ctx.viewport.width || h !== ctx.viewport.height || pr !== ctx.viewport.pixelRatio;
    Object.assign(ctx.viewport, { width: w, height: h, portrait: h > w, pixelRatio: pr, aspect: w / h });
    renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    ctx.post?.setSize?.(w, h, pr);
    if (changed) ctx.bus.emit('resize', { ...ctx.viewport });
  };
  resize();
  ctx.post = createPost({ renderer, scene, camera, ctx });
  ctx.post.setSize(ctx.viewport.width, ctx.viewport.height, ctx.viewport.pixelRatio);
  const applyQuality = () => {
    renderer.shadowMap.enabled = ctx.quality.shadows;
    ctx.toon.applyQuality(); ctx.post.applyQuality(); resize();
    // materials compiled with/without shadows must recompile
    scene.traverse(o => { const m = o.material; if (!m) return; (Array.isArray(m) ? m : [m]).forEach(x => { x.needsUpdate = true; }); });
  };
  ctx.bus.on('quality:change', applyQuality);
  renderer.shadowMap.enabled = ctx.quality.shadows;
  ctx.bus.on('settings:change', ({ key, value } = {}) => {
    if (key === 'quality') ctx.quality.set(value);
    if (key === 'music' || key === 'sfx') ctx.audio.setVolumes({ [key]: value });
  });

  ctx.loop.add(function coreInput() { ctx.input.update(); }, ORDER.input);
  ctx.loop.add(function coreTime(dt) {
    if (!ctx.busy.has('title')) ctx.time.update(dt);
    ctx.save.state.playTime = (ctx.save.state.playTime || 0) + dt;
    ctx.toon.setLighting(ctx.time.lighting());
  }, ORDER.time);
  ctx.loop.add(function coreInteract() { ctx.interact.update(); }, ORDER.systems - 1);
  ctx.loop.add(function coreCamera(dt) { ctx.cameraRig.update(dt); }, ORDER.camera);
  ctx.loop.add(function coreShadow() {
    const f = ctx.cameraRig.mode === 'explore' ? ctx.cameraRig.followPos : ctx.cameraRig.lookTarget;
    ctx.toon.updateShadow(f);
  }, ORDER.camera + 1);

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => { setTimeout(resize, 120); setTimeout(resize, 450); });
  window.visualViewport?.addEventListener('resize', resize);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); ctx.loop.pause(true); ctx.save.flush(); });
  canvas.addEventListener('webglcontextrestored', () => location.reload());
  const unlock = () => { if (ctx.audio.unlock()) for (const ev of ['pointerdown', 'keydown', 'touchend']) window.removeEventListener(ev, unlock, true); };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, true);
  installGestureGuards();

  ctx.debug = createDebug(ctx, isDebug);
  if (opts.startLoop) ctx.loop.start();
  return ctx;
}

export { ORDER, THREE, math, kit };
export default createCore;
