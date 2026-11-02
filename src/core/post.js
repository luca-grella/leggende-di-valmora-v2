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

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, exposure: { value: 1 }, warmth: { value: 0.06 }, saturation: { value: 1.08 }, contrast: { value: 0.1 },
    vignette: { value: 0.22 }, lift: { value: 0.015 }, aspect: { value: 1.6 }, time: { value: 0 }, tint: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
uniform sampler2D tDiffuse;
uniform float exposure, warmth, saturation, contrast, vignette, lift, aspect, time;
uniform vec3 tint;
varying vec2 vUv;
vec3 toSRGB(vec3 c){ return mix(c * 12.92, pow(c, vec3(0.41666)) * 1.055 - 0.055, step(0.0031308, c)); }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  vec3 c = texture2D(tDiffuse, vUv).rgb * exposure * tint;
  // soft shoulder only above 1.0 (bloomed emissives), toon colours below stay untouched
  c = min(c, vec3(1.0) + (c - 1.0) * 0.25);
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
  c = mix(vec3(l2), c, saturation);
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
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: FinalShader.vertexShader, fragmentShader: FinalShader.fragmentShader, depthTest: false, depthWrite: false });
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
  const finalPass = new FinalPass();
  composer.addPass(scenePass); composer.addPass(bloomPass); composer.addPass(finalPass);

  // base parameters; the time of day adds an offset on top when `auto`
  const params = { warmth: 0.06, saturation: 1.08, vignette: 0.22, contrast: 0.1, exposure: 1, bloom: 0.45, lift: 0.015 };
  const live = { warmth: params.warmth, sat: params.saturation, exposure: 1, night: 0 };
  let userEnabled = true;

  const post = {
    composer, params,
    passes: { scene: scenePass, bloom: bloomPass, final: finalPass },
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
  }

  post.applyQuality();
  return post;
}
