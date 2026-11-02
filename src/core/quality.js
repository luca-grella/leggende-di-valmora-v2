// Quality tiers: auto-detection (platform, GPU, DPR), manual override (?quality= or Opzioni), FPS watchdog
// that steps resolution then tier down when the game runs below ~45 fps for a while (auto only).

/** Settings per tier. Modules read ctx.quality.<field> and listen to 'quality:change'. */
export const TIERS = {
  low:  { pixelRatioCap: 1.25, shadows: false, shadowMapSize: 0,    drawDistance: 90,  grassDensity: 0.4, outlines: false, post: false, bloom: false, msaa: 0, particles: 0.5 },
  mid:  { pixelRatioCap: 1.5,  shadows: true,  shadowMapSize: 1024, drawDistance: 130, grassDensity: 0.7, outlines: true,  post: true,  bloom: true,  msaa: 2, particles: 0.75 },
  high: { pixelRatioCap: 2,    shadows: true,  shadowMapSize: 2048, drawDistance: 170, grassDensity: 1,   outlines: true,  post: true,  bloom: true,  msaa: 4, particles: 1 },
};
const ORDER = ['low', 'mid', 'high'];

function gpuInfo(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String((ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '');
  } catch { return ''; }
}

/** @returns {{tier:'low'|'mid'|'high', reason:string, gpu:string, software:boolean, platform:'ios'|'android'|'desktop'}} */
export function detectTier(renderer) {
  const gpu = gpuInfo(renderer), ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 4;
  const software = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  const platform = iOS ? 'ios' : android ? 'android' : 'desktop';
  if (software) return { tier: 'low', reason: 'software renderer', gpu, software, platform };
  if (iOS) return { tier: 'mid', reason: 'iPhone/iPad', gpu, software, platform };         // contract: mid on phones
  if (android) {
    if (mem <= 3 || cores <= 4 || /Mali-(4|T)|Adreno \(TM\) [345]\d\d|PowerVR/i.test(gpu)) return { tier: 'low', reason: 'weak android', gpu, software, platform };
    return { tier: 'mid', reason: 'android', gpu, software, platform };
  }
  if (/Intel.*(HD Graphics [2-5]\d\d0?|HD Graphics$|GMA)/i.test(gpu) || cores <= 2) return { tier: 'mid', reason: 'old integrated GPU', gpu, software, platform };
  return { tier: 'high', reason: 'desktop', gpu, software, platform };
}

/**
 * @param {{renderer:any, bus:any, save:any, override?:string|null, debug?:boolean}} opts
 */
export function createQuality({ renderer, bus, save, override = null, debug = false }) {
  const det = detectTier(renderer);
  const dpr = window.devicePixelRatio || 1;
  // headless/debug runs use a software renderer: show the real look (high) unless asked otherwise
  let autoTier = det.software && debug ? 'high' : det.tier;
  let prScale = 1;

  const q = {
    tier: 'mid',
    /** 'auto' or a forced tier (what Opzioni shows). */
    setting: 'auto',
    detected: det,
    pixelRatio: 1, shadows: true, shadowMapSize: 1024, drawDistance: 130, grassDensity: 0.7, outlines: true, post: true,
    bloom: true, msaa: 2, particles: 0.75,
    /** FPS watchdog (auto setting only; off in ?debug). */
    watchdog: !debug,
    /** set('auto'|'low'|'mid'|'high', {persist=true}) */
    set(t, { persist = true } = {}) {
      if (!['auto', ...ORDER].includes(t)) { console.warn('[quality] unknown tier', t); t = 'auto'; }
      q.setting = t; prScale = 1;
      if (persist && save?.state?.settings) { save.state.settings.quality = t; save.commit(); }
      apply(t === 'auto' ? autoTier : t);
    },
    /** One notch down (resolution first, then tier). Returns false when already at the bottom. */
    stepDown(reason = 'manual') {
      if (prScale > 0.76) { prScale = Math.max(0.75, prScale - 0.125); apply(q.tier, reason); return true; }
      const i = ORDER.indexOf(q.tier);
      if (i <= 0) return false;
      autoTier = ORDER[i - 1]; prScale = 1;
      apply(autoTier, reason);
      return true;
    },
    /** Called every rendered frame by the core with the real frame time (seconds). */
    sample(real) {
      if (!q.watchdog || q.setting !== 'auto' || document.hidden || real > 0.5 || real <= 0) return;
      if (grace > 0) { grace -= real; return; }
      acc += real; frames++;
      if (acc >= 4) {
        const fps = frames / acc; acc = 0; frames = 0;
        if (fps < 45) bad++; else bad = Math.max(0, bad - 1);
        if (bad >= 2) {
          bad = 0; grace = 4;
          if (q.stepDown(`fps ${fps.toFixed(0)}`)) console.info(`[quality] low fps (${fps.toFixed(0)}): now ${q.tier} @ ${q.pixelRatio.toFixed(2)}x`);
        }
      }
    },
  };
  let acc = 0, frames = 0, grace = 8, bad = 0;

  function fill(tier) {
    Object.assign(q, TIERS[tier], { tier });
    if (det.platform !== 'desktop') q.msaa = Math.min(q.msaa, 2);   // 2× DPR phones don't need 4× MSAA
    q.pixelRatio = Math.max(0.75, Math.min(dpr, TIERS[tier].pixelRatioCap) * prScale);
  }
  function apply(tier, reason = '') {
    const prev = q.tier;
    fill(tier);
    bus.emit('quality:change', { tier, prev, pixelRatio: q.pixelRatio, reason });
  }

  let initial = override || save?.state?.settings?.quality || 'auto';
  if (!['auto', ...ORDER].includes(initial)) initial = 'auto';
  q.setting = initial;
  fill(initial === 'auto' ? autoTier : initial);
  return q;
}
