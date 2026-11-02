// Capture ball (Sfera / Megasfera): toon halves + hinged lid + front button + inner light, outlined.
// play('throw'|'open'|'close'|'shake'|'click'|'burst') → Promise, driven by the game loop (eased, no snapping).
// The thrower moves `object` itself; 'throw' only starts the spin (any other anim stops it).
import * as THREE from 'three';

const KINDS = {
  sfera: { top: '#ee4a4a', accent: null },
  megasfera: { top: '#3d7fe6', accent: '#ff5a5a' },
};
const R = 0.13;

let geos = null;
function geometries() {
  if (geos) return geos;
  geos = {
    top: new THREE.SphereGeometry(R, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2 - 0.06),
    bottom: new THREE.SphereGeometry(R, 28, 12, 0, Math.PI * 2, Math.PI / 2 + 0.06, Math.PI / 2 - 0.06),
    inner: new THREE.CircleGeometry(R * 0.985, 28).rotateX(-Math.PI / 2),
    band: new THREE.CylinderGeometry(R * 0.985, R * 0.985, R * 0.13, 28, 1, true),
    ring: new THREE.CylinderGeometry(R * 0.3, R * 0.3, R * 0.16, 20).rotateX(Math.PI / 2),
    button: new THREE.CylinderGeometry(R * 0.19, R * 0.19, R * 0.12, 20).rotateX(Math.PI / 2),
    stripe: new THREE.SphereGeometry(R * 1.012, 6, 8, -0.22, 0.44, 0.22, Math.PI / 2 - 0.3),
    glow: new THREE.SphereGeometry(R * 1.6, 16, 10),
  };
  return geos;
}

function registry(ctx) {
  if (ctx.__sphereLive) return ctx.__sphereLive;
  const live = ctx.__sphereLive = new Set();
  ctx.loop.add(function spheres(dt) { for (const s of live) s._tick(dt); }, ctx.ORDER?.actors ?? 20);
  return live;
}

const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const EASE = {
  out: x => 1 - (1 - x) ** 3,
  back: x => { const s = 2.2; return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2; },
};

/** @returns {{object: THREE.Group, kind: string, radius: number, play: (name: string) => Promise<void>, setLight: Function, dispose: Function}} */
export function buildSphere(ctx, kind = 'sfera') {
  const K = KINDS[kind] || KINDS.sfera;
  const G = geometries();
  const T = ctx.toon;
  const object = new THREE.Group(); object.name = 'sphere:' + kind;
  const wobble = new THREE.Group(); wobble.position.y = R; object.add(wobble);        // pivot at the ball centre
  const spin = new THREE.Group(); wobble.add(spin);
  const bottom = new THREE.Mesh(G.bottom, T.mat('#fbf7f0', { rim: 0.35 }));
  const band = new THREE.Mesh(G.band, T.mat('#2a2140'));
  const lid = new THREE.Group(); lid.position.set(0, 0, -R); spin.add(lid);           // hinge on the back edge
  const top = new THREE.Mesh(G.top, T.mat(K.top, { rim: 0.35 })); top.position.z = R; lid.add(top);
  const innerTop = new THREE.Mesh(G.inner, T.mat('#2a2140', { side: THREE.DoubleSide })); innerTop.position.set(0, 0.002, R); lid.add(innerTop);
  const innerBottom = new THREE.Mesh(G.inner, new THREE.MeshBasicMaterial({ color: '#fff6d6' })); innerBottom.position.y = -0.003;
  if (K.accent) for (const s of [1, -1]) {
    const st = new THREE.Mesh(G.stripe, T.mat(K.accent)); st.rotation.y = s * Math.PI / 2; st.position.z = R; lid.add(st);
  }
  const ring = new THREE.Mesh(G.ring, T.mat('#2a2140')); ring.position.z = R * 0.97;
  const buttonMat = T.mat('#ffffff', { emissive: '#ff5050', emissiveIntensity: 0 }).clone();
  const button = new THREE.Mesh(G.button, buttonMat); button.position.z = R * 1.04;
  spin.add(bottom, band, innerBottom, ring, button);
  const glowMat = new THREE.MeshBasicMaterial({ color: '#fff4c2', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const glow = new THREE.Mesh(G.glow, glowMat); glow.visible = false; glow.renderOrder = 5;
  wobble.add(glow);
  for (const m of [bottom, top, ring, button]) m.castShadow = true;
  T.outline?.(spin, { width: 0.008, skip: o => o === innerTop || o === innerBottom || o === band });

  let tw = null;            // active tween {dur, t, fn, resolve}
  let spinning = 0, light = 0, lightTarget = 0;
  const run = (dur, fn) => new Promise(resolve => {
    const old = tw; tw = null; old?.resolve?.();
    tw = { dur, t: 0, fn, resolve };
    fn(0);
  });
  const settle = () => { spinning = 0; spin.rotation.set(0, 0, 0); };

  const anims = {
    throw() { spinning = 16; return Promise.resolve(); },
    open() {
      settle(); lightTarget = 1;
      return run(0.28, k => { lid.rotation.x = -1.95 * EASE.back(k); });
    },
    close() {
      settle();
      const from = lid.rotation.x;
      return run(0.2, k => { lid.rotation.x = from * (1 - EASE.out(k)); if (k > 0.6) lightTarget = 0; });
    },
    shake() {
      settle(); lid.rotation.x = 0;
      return run(0.72, k => {
        const s = Math.sin(k * Math.PI * 2) * Math.sin(k * Math.PI) * 0.62;
        wobble.rotation.z = s; wobble.position.x = -s * R * 0.6;
        buttonMat.emissive.set('#ff5050');
        buttonMat.emissiveIntensity = 0.9 * Math.sin(k * Math.PI);
        if (k >= 1) { wobble.rotation.z = 0; wobble.position.x = 0; buttonMat.emissiveIntensity = 0; }
      });
    },
    click() {
      settle(); lid.rotation.x = 0;
      buttonMat.emissive.set('#ffd23f');
      return run(0.45, k => {
        const sq = Math.sin(clamp01(k / 0.4) * Math.PI);
        wobble.scale.set(1 + 0.12 * sq, 1 - 0.14 * sq, 1 + 0.12 * sq);
        buttonMat.emissiveIntensity = 1.4 * (1 - k * 0.6);
        if (k >= 1) wobble.scale.set(1, 1, 1);
      });
    },
    burst() {
      settle(); lightTarget = 1.2;
      return run(0.38, k => {
        lid.rotation.x = -2.3 * EASE.out(clamp01(k / 0.35));
        wobble.position.y = R + 0.12 * Math.sin(k * Math.PI);
        if (k > 0.5) lightTarget = 0;
        if (k >= 1) wobble.position.y = R;
      });
    },
  };

  const live = registry(ctx);
  const sphere = {
    object, kind, radius: R,
    play(name) {
      const a = anims[name];
      if (!a) { console.warn('[sphere] unknown anim', name); return Promise.resolve(); }
      return a();
    },
    /** Inner light / glow 0..1 (eased). */
    setLight(v) { lightTarget = Math.max(0, v); },
    _tick(dt) {
      if (spinning) spin.rotation.x -= spinning * dt;
      light += (lightTarget - light) * (1 - Math.exp(-14 * dt));
      glow.visible = light > 0.01;
      glowMat.opacity = Math.min(0.85, light * 0.75);
      glow.scale.setScalar(0.6 + light * 0.9);
      if (tw) {
        tw.t += dt;
        const k = clamp01(tw.t / tw.dur);
        tw.fn(k);
        if (k >= 1) { const r = tw.resolve; tw = null; r?.(); }
      }
    },
    dispose() {
      live.delete(sphere);
      const r = tw?.resolve; tw = null; r?.();
      object.removeFromParent();
      for (const m of [glowMat, buttonMat, innerBottom.material]) m.dispose?.();
    },
  };
  object.userData.sphere = sphere;
  object.userData.height = R * 2; object.userData.radius = R;
  live.add(sphere);
  return sphere;
}
