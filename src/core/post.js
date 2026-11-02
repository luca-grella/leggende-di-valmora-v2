// Post-processing (mid/high only): MSAA scene (half float) → subtle bloom on emissive things only
// (lamps, flames, aurora: anything brighter than 1.0) → one final pass that converts to sRGB and applies
// the warm Sun/Moon grade (white balance, saturation, soft contrast, warm vignette, night lift, dither).
// Quality 'low' or setEnabled(false) → plain renderer.render (sRGB handled by the renderer).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { clamp, damp } from './math.js';

/** Renders the scene into its own multisampled target, then copies it into the composer read buffer. */
class SceneMSAAPass extends Pass {
  constructor(scene, camera, samples = 4) {
    super();
    this.scene = scene; this.camera = camera; this.needsSwap = false; this.samples = samples; this.rt = null;
    this.copy = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms), vertexShader: CopyShader.vertexShader, fragmentShader: CopyShader.fragmentShader, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    this.fsQuad = new FullScreenQuad(this.copy);
  }
  makeRT(w, h) { return new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.samples }); }
  setSize(w, h) { if (this.samples > 0) { if (!this.rt) this.rt = this.makeRT(w, h); else this.rt.setSize(w, h); } }
  setSamples(n) { if (n === this.samples) return; this.samples = n; this.rt?.dispose(); this.rt = null; }
  render(renderer, writeBuffer, readBuffer) {
    if (this.samples > 0) {
      if (!this.rt) this.rt = this.makeRT(readBuffer.width, readBuffer.height);
      renderer.setRenderTarget(this.rt); renderer.clear(); renderer.render(this.scene, this.camera);
      this.copy.uniforms.tDiffuse.value = this.rt.texture;
      renderer.setRenderTarget(readBuffer); this.fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(readBuffer); renderer.clear(); renderer.render(this.scene, this.camera);
    }
  }
  dispose() { this.rt?.dispose(); this.copy.dispose(); this.fsQuad.dispose(); }
}

// Tilt-shift (diorama depth of field, like Lenza Lenta v2): a sharp band around the followed subject,
// soft blur towards the top (far) and bottom (near) of the screen. Separable: H pass + V inside the final.
const TILT_COMMON = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 texel, dir;
uniform float focusY, band, falloff, radius;
varying vec2 vUv;
float tiltAmount(){
  float d = vUv.y - focusY;
  float far = d > 0.0 ? 1.0 : 0.75;
  return smoothstep(band, band + falloff, abs(d)) * far;
}
vec3 tiltBlur(){
  float r = tiltAmount() * radius;
  vec3 c0 = texture2D(tDiffuse, vUv).rgb;
  if (r < 0.35) return c0;
  vec3 acc = c0; float wsum = 1.0;
  for (int i = 1; i <= HALF; i++) {
    float x = float(i) / float(HALF);
    float w = exp(-x * x * 2.2);
    vec2 o = dir * texel * x * r;
    acc += (texture2D(tDiffuse, vUv + o).rgb + texture2D(tDiffuse, vUv - o).rgb) * w;
    wsum += 2.0 * w;
  }
  return acc / wsum;
}`;
const TILT_UNIFORMS = () => ({ texel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) }, dir: { value: new THREE.Vector2(1, 0) }, focusY: { value: 0.45 }, band: { value: 0.12 }, falloff: { value: 0.4 }, radius: { value: 0 } });
const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

class TiltPass extends Pass {
  constructor() {
    super();
    this.uniforms = { tDiffuse: { value: null }, ...TILT_UNIFORMS() };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, defines: { HALF: 4 }, vertexShader: VERT, fragmentShader: TILT_COMMON + 'void main(){ gl_FragColor = vec4(tiltBlur(), 1.0); }', depthTest: false, depthWrite: false });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, exposure: { value: 1 }, warmth: { value: 0.06 }, saturation: { value: 1.08 }, contrast: { value: 0.1 },
    vignette: { value: 0.22 }, lift: { value: 0.015 }, aspect: { value: 1.6 }, time: { value: 0 }, tint: { value: new THREE.Vector3(1, 1, 1) },
    ...TILT_UNIFORMS(),
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: TILT_COMMON + /* glsl */`
uniform float exposure, warmth, saturation, contrast, vignette, lift, aspect, time;
uniform vec3 tint;
vec3 toSRGB(vec3 c){ return mix(c * 12.92, pow(c, vec3(0.41666)) * 1.055 - 0.055, step(0.0031308, c)); }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 neutralTM(vec3 color){
  const float sc = 0.76, desat = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= off;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < sc) return color;
  const float d = 1.0 - sc;
  float np = 1.0 - d * d / (peak + d - sc);
  color *= np / peak;
  float g = 1.0 - 1.0 / (desat * (peak - np) + 1.0);
  return mix(color, vec3(np), g);
}
void main(){
  vec3 c = tiltBlur() * exposure * tint;
  // Khronos PBR Neutral tone mapping: soft highlight roll-off (sunlit sand, white walls, cobbles) that
  // keeps hues and saturation (the toon palette stays vivid, no AgX/ACES greying)
  c = neutralTM(c);
  c = toSRGB(clamp(c, 0.0, 1.0));
  // white balance (display space): warm = more red/yellow, less blue
  c *= vec3(1.0 + 0.07 * warmth, 1.0 + 0.02 * warmth, 1.0 - 0.08 * warmth);
  // split toning: cool lilac shadows, warm highlights (Alola sunlight)
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c += vec3(-0.012, -0.004, 0.03) * (1.0 - smoothstep(0.0, 0.5, l)) + vec3(0.02, 0.01, -0.018) * smoothstep(0.55, 1.0, l);
  // lifted blacks: never pitch black
  c = c * (1.0 - lift) + lift * vec3(0.55, 0.55, 0.85);
  c = clamp(c, 0.0, 1.0);
  c = mix(c, c * c * (3.0 - 2.0 * c), contrast);
  float l2 = dot(c, vec3(0.299, 0.587, 0.114));
  // selective: tame acid lime greens (grass/foliage) a touch, keep skin, sky, sea and roofs vivid
  float lime = smoothstep(0.04, 0.2, c.g - max(c.r, c.b)) * smoothstep(0.0, 0.15, c.r - c.b + 0.05);
  c = mix(vec3(l2), c, saturation * (1.0 - 0.14 * lime));
  c = mix(c, c * vec3(1.02, 0.99, 0.94), lime * 0.35);
  // warm vignette
  vec2 d = (vUv - 0.5) * vec2(min(aspect, 1.8), 1.0);
  float v = smoothstep(0.35, 1.1, length(d) * 1.1) * vignette;
  c = mix(c, c * vec3(0.92, 0.82, 0.86), v);
  c += (hash(gl_FragCoord.xy + fract(time) * 61.0) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`,
};

class FinalPass extends Pass {
  constructor() {
    super();
    this.uniforms = THREE.UniformsUtils.clone(FinalShader.uniforms);
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, defines: { HALF: 4 }, vertexShader: FinalShader.vertexShader, fragmentShader: FinalShader.fragmentShader, depthTest: false, depthWrite: false });
    this.uniforms.dir.value.set(0, 1);
    this.fsQuad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}

/**
 * @param {{renderer:THREE.WebGLRenderer, scene:THREE.Scene, camera:THREE.Camera, ctx:any}} opts
 */
export function createPost({ renderer, scene, camera, ctx }) {
  const size = new THREE.Vector2(); renderer.getSize(size);
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x * pr), Math.max(1, size.y * pr), { type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr); composer.setSize(size.x, size.y);

  const q = ctx.quality;
  const scenePass = new SceneMSAAPass(scene, camera, q?.msaa ?? 2);
  // threshold 1.0 on linear HDR: only emissive (glow intensity > 1) and very bright highlights bloom
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.45, 0.5, 1.0);
  const tiltPass = new TiltPass();
  const finalPass = new FinalPass();
  composer.addPass(scenePass); composer.addPass(bloomPass); composer.addPass(tiltPass); composer.addPass(finalPass);

  // base parameters; the time of day adds an offset on top when `auto`
  const params = { warmth: 0.08, saturation: 1.06, vignette: 0.24, contrast: 0.2, exposure: 0.98, bloom: 0.45, lift: 0.012, tilt: 1 };
  const _ndc = new THREE.Vector3();
  let focusY = 0.45, heightPx = size.y * pr;
  const live = { warmth: params.warmth, sat: params.saturation, exposure: 1, night: 0 };
  let userEnabled = true;

  const post = {
    composer, params,
    passes: { scene: scenePass, bloom: bloomPass, tilt: tiltPass, final: finalPass },
    /** Tilt-shift strength: 0 off, 1 default (subtle diorama), up to ~2.5. Close-ups use less. */
    tiltShift(v) { params.tilt = clamp(+v || 0, 0, 3); },
    /** Follow the time of day (dusk warmer, night bluer and lifted). */
    auto: true,
    get enabled() { return userEnabled && !!(ctx.quality?.post ?? true); },
    /** Draw a frame (the loop calls it). */
    render() {
      update();
      if (!post.enabled) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
      composer.render(ctx.loop?.dt || 1 / 60);
    },
    setEnabled(v) { userEnabled = !!v; },
    /** Bloom strength (0 off, default 0.45). Only on mid/high. */
    bloom(strength) { params.bloom = clamp(+strength || 0, 0, 3); },
    /** Colour grade: any of {warmth -1..1, saturation 0..2, vignette 0..1, contrast 0..1, exposure 0.3..2, lift 0..0.1}. */
    grade(o = {}) { for (const k of ['warmth', 'saturation', 'vignette', 'contrast', 'exposure', 'lift']) if (Number.isFinite(o[k])) params[k] = o[k]; },
    /** Core calls it on resize / quality change. */
    setSize(w, h, pixelRatio) {
      composer.setPixelRatio(pixelRatio); composer.setSize(w, h);
      finalPass.uniforms.aspect.value = w / Math.max(1, h);
      const pw = Math.max(1, Math.round(w * pixelRatio)), ph = Math.max(1, Math.round(h * pixelRatio));
      for (const p of [tiltPass, finalPass]) p.uniforms.texel.value.set(1 / pw, 1 / ph);
      heightPx = ph;
    },
    applyQuality() {
      scenePass.setSamples(ctx.quality?.msaa ?? 2);
      bloomPass.enabled = !!ctx.quality?.bloom;
    },
    dispose() { for (const p of composer.passes) p.dispose?.(); composer.dispose?.(); },
  };

  function update() {
    const dt = ctx.loop?.dt || 1 / 60;
    let tw = 0, te = 0, ts = 0, night = 0;
    if (post.auto && ctx.time?.lighting) {
      const L = ctx.time.lighting();
      night = L.night || 0;
      const dusk = (L.warmth || 0) * (1 - night);
      tw = 0.12 * dusk - 0.05 * night; te = 0.1 * night + 0.04 * dusk; ts = 0.1 * dusk - 0.12 * night;
    }
    live.warmth = damp(live.warmth, params.warmth + tw, 3, dt);
    live.sat = damp(live.sat, params.saturation + ts, 3, dt);
    live.exposure = damp(live.exposure, params.exposure + te, 3, dt);
    live.night = damp(live.night, night, 3, dt);
    if (!post.enabled) return;
    const u = finalPass.uniforms;
    u.warmth.value = live.warmth; u.saturation.value = live.sat; u.exposure.value = live.exposure;
    u.vignette.value = params.vignette; u.contrast.value = params.contrast; u.lift.value = params.lift + 0.02 * live.night;
    u.tint.value.set(1 - 0.06 * live.night, 1 - 0.02 * live.night, 1 + 0.06 * live.night);
    u.time.value = (u.time.value + dt) % 1000;
    bloomPass.strength = params.bloom * (1 + 0.5 * live.night);
    // tilt-shift band follows the subject: the player while exploring, the look target in close-ups
    // (close-ups get a shallower effect: faces and hands must stay sharp)
    const rig = ctx.cameraRig, explore = !rig || rig.mode === 'explore' || rig.mode === 'release';
    const fp = explore ? (rig?.followPos || null) : rig?.lookTarget;
    let fy = 0.45;
    if (fp) { _ndc.copy(fp).project(camera); if (_ndc.z < 1) fy = clamp(_ndc.y * 0.5 + 0.5, 0.15, 0.85); }
    focusY = damp(focusY, fy, 4, dt);
    const portrait = camera.aspect < 1;
    const strength = params.tilt * (explore ? 1 : 0.55);
    const radius = strength * 0.0034 * heightPx * (portrait ? 0.75 : 1);
    for (const p of [tiltPass, finalPass]) {
      const t = p.uniforms;
      t.focusY.value = focusY; t.radius.value = radius;
      t.band.value = explore ? (portrait ? 0.12 : 0.16) : 0.22; t.falloff.value = portrait ? 0.36 : 0.44;
    }
    tiltPass.enabled = radius > 0.3;
  }

  post.applyQuality();
  return post;
}
