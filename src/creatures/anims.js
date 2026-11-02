// Velmon animations: procedural, eased poses on the species rig (no keyframes). Each anim writes
// bone offsets/rotations/scales + face channels into a pose; model.js cross-fades between poses
// and adds blinking, look-at and spring-driven secondary motion (ears, tails, antennae).

/** Animation names (contract). */
export const VELMON_ANIMS = ['idle', 'walk', 'attack', 'special', 'hit', 'faint', 'happy', 'sleep', 'appear'];

/** dur in seconds for one-shots; hold = keep the last pose (faint). */
export const ANIM_INFO = {
  idle: { loop: true }, walk: { loop: true }, sleep: { loop: true },
  attack: { dur: 0.82 }, special: { dur: 1.25 }, hit: { dur: 0.6 }, happy: { dur: 1.15 },
  faint: { dur: 1.35, hold: true }, appear: { dur: 0.7 },
};

const S = Math.sin, PI = Math.PI, TAU = PI * 2;
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const ramp = (t, a, b) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const bump = (t, a, b) => (t <= a || t >= b ? 0 : S(PI * (t - a) / (b - a)));
const outCubic = x => 1 - Math.pow(1 - x, 3);
const inCubic = x => x * x * x;
const outBack = (x, s = 1.9) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);

/** Shared ambient layer: breathing, hover bob, tails, ears, wings at rest. a = amount (0..1). */
function ambient(P, t, M, a = 1, speed = 1) {
  const br = S(t * 2.6 * speed);
  P.scl('root', 1 - 0.012 * br * a, 1 + 0.026 * br * a, 1 - 0.012 * br * a);
  if (M.hover) P.pos('root', 0, M.hover + 0.045 * S(t * 2.1) * a, 0);
  P.rot('head', 0.045 * S(t * 1.3 + 1) * a, 0.06 * S(t * 0.55) * a, 0.05 * S(t * 0.7) * a);
  P.rot('earL', 0, 0, 0.09 * S(t * 2.1) * a);
  P.rot('earR', 0, 0, -0.09 * S(t * 2.1 + 0.6) * a);
  for (let i = 0; i < M.tails.length; i++) P.rot(M.tails[i], 0.06 * S(t * 1.7 - i) * a, 0.24 * S(t * 2.4 * speed - i * 0.75) * a, 0);
  P.scl('flame', 1 + 0.1 * S(t * 13.1), 1 + 0.16 * S(t * 9.7 + 1), 1 + 0.1 * S(t * 11.3 + 2));
  P.rot('armL', 0, 0, 0.07 * br * a); P.rot('armR', 0, 0, -0.07 * br * a);
  P.rot('handL', -0.15 - 0.15 * S(t * 1.9), 0, 0); P.rot('handR', -0.15 - 0.15 * S(t * 1.9 + 1.4), 0, 0);
  wings(P, t, M, 1, a);
}

function wings(P, t, M, power = 1, a = 1) {
  if (M.flap === 'z') {
    const f = S(t * 9 * power);
    P.rot('wingL', 0, 0, 0.55 * f * power); P.rot('wingR', 0, 0, -0.55 * f * power);
    if (M.hover) P.pos('root', 0, 0.03 * S(t * 9 * power + PI / 2), 0);
  } else if (M.flap === 'y') {
    const f = S(t * 7 * power);
    P.rot('wingL', 0, -(0.35 + 0.45 * f) * power, 0); P.rot('wingR', 0, (0.35 + 0.45 * f) * power, 0);
    if (M.hover) P.pos('root', 0, 0.025 * S(t * 7 * power + PI / 2), 0);
  } else if (M.flap === 'fold') {
    P.rot('wingL', 0, 0, 0.07 * S(t * 2.6) * a); P.rot('wingR', 0, 0, -0.07 * S(t * 2.6) * a);
  }
}

function legsCycle(P, M, w, amp) {
  for (const L of M.legs) P.rotI(L.i, amp * S(w + L.phase), 0, 0);
  for (const A of M.arms) P.rotI(A.i, -amp * 0.8 * S(w + A.phase), 0, 0);
}

export const POSES = {
  idle(P, t, M) {
    ambient(P, t, M);
    if (M.loco === 'hop') {         // birds and blobs bounce now and then
      const c = t % 3.1;
      const h = bump(c, 0.2, 0.55);
      P.pos('root', 0, 0.07 * h, 0);
      const sq = bump(c, 0.0, 0.2) + bump(c, 0.55, 0.75);
      P.scl('root', 1 + 0.07 * sq, 1 - 0.1 * sq + 0.06 * h, 1 + 0.07 * sq);
    }
    if (M.crab) { P.rot('armL', 0, 0.08 * S(t * 1.3), 0); P.rot('armR', 0, -0.08 * S(t * 1.3 + 1), 0); }
  },
  walk(P, t, M) {
    const w = t * TAU * 1.9;
    ambient(P, t, M, 0.6, 1.6);
    if (M.loco === 'hop') {
      const h = Math.abs(S(w * 0.5));
      P.pos('root', 0, 0.12 * h, 0);
      P.scl('root', 1 + 0.08 * (1 - h) ** 4, 1 - 0.13 * (1 - h) ** 4 + 0.05 * h, 1);
      P.rot('root', -0.08 * h, 0, 0);
    } else if (M.loco === 'fly' || M.loco === 'float') {
      P.rot('root', 0.16, 0, 0.05 * S(w * 0.5));
      wings(P, t, M, 1.25);
    } else {
      legsCycle(P, M, w, 0.6);
      P.pos('root', 0, 0.025 * Math.abs(S(w)), 0);
      P.rot('root', 0, 0, 0.035 * S(w));
      P.rot('body', 0.02, 0.05 * S(w), 0);
    }
    for (let i = 0; i < M.tails.length; i++) P.rot(M.tails[i], 0, 0.2 * S(w - i * 0.8), 0);
  },
  attack(P, t, M) {
    ambient(P, t, M, 0.3);
    const R = M.reach;
    const anticip = -0.14 * ramp(t, 0, 0.2) * (1 - ramp(t, 0.2, 0.34));
    const fwd = outCubic(ramp(t, 0.2, 0.4)) * (1 - ramp(t, 0.55, 0.82));
    P.pos('root', 0, 0.13 * bump(t, 0.2, 0.52), R * fwd + anticip);
    P.rot('root', -0.22 * bump(t, 0, 0.32) + 0.28 * bump(t, 0.24, 0.58), 0, 0);
    const sq = bump(t, 0, 0.3), st = bump(t, 0.2, 0.46);
    P.scl('root', 1 + 0.08 * sq - 0.04 * st, 1 - 0.16 * sq + 0.04 * st, 1 + 0.22 * st);
    P.rot('head', -0.15 * sq + 0.2 * st, 0, 0);
    legsCycle(P, M, t * TAU * 4, 0.7 * bump(t, 0.15, 0.6));
    P.rot('armL', -1.3 * bump(t, 0.2, 0.6), 0, 0.3 * bump(t, 0.2, 0.6)); P.rot('armR', -1.3 * bump(t, 0.24, 0.62), 0, -0.3 * bump(t, 0.24, 0.62));
    P.rot('handL', -0.6 * bump(t, 0.2, 0.5), 0, 0); P.rot('handR', -0.6 * bump(t, 0.22, 0.52), 0, 0);
    if (M.flap) wings(P, t, M, 1.6);
    P.ch.mouth = bump(t, 0.16, 0.7); P.ch.eyes = 1 - 0.25 * bump(t, 0, 0.7);
  },
  special(P, t, M) {
    ambient(P, t, M, 0.3);
    const charge = ramp(t, 0, 0.5), release = bump(t, 0.5, 0.95), after = ramp(t, 0.85, 1.25);
    const shiver = S(t * 70) * 0.035 * charge * (1 - ramp(t, 0.5, 0.55));
    P.rot('root', -0.28 * charge * (1 - ramp(t, 0.48, 0.6)) + 0.22 * release, 0, shiver);
    P.pos('root', 0, 0.06 * charge * (1 - after) + 0.08 * release, 0.12 * release);
    const sc = 1 + 0.12 * release;
    P.scl('root', sc - 0.06 * charge * (1 - release), sc + 0.08 * charge * (1 - release), sc);
    P.rot('head', -0.2 * charge * (1 - release) + 0.15 * release, 0, 0);
    P.rot('armL', -0.9 * charge, 0, 0.8 * release); P.rot('armR', -0.9 * charge, 0, -0.8 * release);
    P.rot('earL', -0.3 * release, 0, 0.35 * charge); P.rot('earR', -0.3 * release, 0, -0.35 * charge);
    if (M.flap) wings(P, t, M, 1 + charge);
    P.ch.glow = charge * (1 - ramp(t, 0.8, 1.2));
    P.ch.mouth = ramp(t, 0.3, 0.55) * (1 - ramp(t, 0.9, 1.2));
    P.ch.eyes = 1 - 0.5 * charge * (1 - release);
  },
  hit(P, t, M) {
    ambient(P, t, M, 0.2);
    const k = t < 0.07 ? t / 0.07 : Math.exp(-(t - 0.07) * 6.5);
    P.pos('root', 0, 0.04 * k, -0.2 * k);
    P.rot('root', -0.38 * k, 0, 0.16 * S(t * 42) * k);
    P.scl('root', 1 + 0.12 * k, 1 - 0.2 * k, 1 + 0.06 * k);
    P.rot('head', -0.3 * k, 0, 0);
    P.rot('earL', -0.5 * k, 0, 0.3 * k); P.rot('earR', -0.5 * k, 0, -0.3 * k);
    P.rot('armL', 0, 0, 0.9 * k); P.rot('armR', 0, 0, -0.9 * k);
    P.ch.flash = (t < 0.09 || (t > 0.17 && t < 0.26)) ? 0.85 : 0;
    P.ch.eyes = t < 0.42 ? 0.12 : 1; P.ch.mouth = 0.45 * k;
  },
  faint(P, t, M) {
    const fall = inCubic(ramp(t, 0.35, 1.0)), sink = ramp(t, 0.55, 1.35);
    ambient(P, t, M, 1 - ramp(t, 0, 0.4));
    if (M.hover) P.pos('root', 0, -M.hover * ramp(t, 0.1, 0.8), 0);
    P.rot('root', 0.12 * S(t * 14) * (1 - ramp(t, 0, 0.4)), 0, 0.85 * fall);
    P.pos('root', 0.08 * fall, -0.75 * sink, 0);
    P.scl('root', 1 - 0.4 * sink, 1 - 0.5 * sink - 0.1 * fall, 1 - 0.4 * sink);
    const d = ramp(t, 0.1, 0.6);
    P.rot('head', 0.55 * d, 0, 0.2 * d);
    P.rot('earL', 0.6 * d, 0, -0.4 * d); P.rot('earR', 0.6 * d, 0, 0.4 * d);
    P.rot('wingL', 0, 0, -0.5 * d); P.rot('wingR', 0, 0, 0.5 * d);
    P.rot('armL', 0, 0, 0.4 * d); P.rot('armR', 0, 0, -0.4 * d);
    for (let i = 0; i < M.tails.length; i++) P.rot(M.tails[i], 0.4 * ramp(t, 0.1, 0.7), 0, 0);
    const f = 1 - 0.8 * ramp(t, 0.2, 0.9);
    P.scl('flame', f, f, f);
    P.ch.eyes = 0; P.ch.mouth = 0.3 * bump(t, 0, 0.5);
  },
  happy(P, t, M) {
    ambient(P, t, M, 0.5);
    const h1 = bump(t, 0.08, 0.45), h2 = bump(t, 0.6, 1.0);
    P.pos('root', 0, 0.2 * h1 + 0.24 * h2, 0);
    const land = bump(t, 0.0, 0.1) + bump(t, 0.45, 0.6) + bump(t, 1.0, 1.15);
    P.scl('root', 1 + 0.1 * land - 0.04 * (h1 + h2), 1 - 0.16 * land + 0.08 * (h1 + h2), 1 + 0.1 * land);
    P.rot('root', 0, TAU * outCubic(ramp(t, 0.6, 1.0)), 0);
    P.rot('head', -0.15 * (h1 + h2), 0, 0.15 * S(t * 8));
    P.rot('armL', -0.4 * (h1 + h2), 0, 1.0 * (h1 + h2)); P.rot('armR', -0.4 * (h1 + h2), 0, -1.0 * (h1 + h2));
    P.rot('earL', 0, 0, 0.3 * (h1 + h2)); P.rot('earR', 0, 0, -0.3 * (h1 + h2));
    if (M.flap) wings(P, t, M, 1.5);
    legsCycle(P, M, t * 14, 0.35 * (h1 + h2));
    P.ch.eyes = 0.28; P.ch.mouth = 1;
  },
  sleep(P, t, M) {
    const br = S(t * 1.5);
    P.scl('root', 1 + 0.02 * br, 0.9 + 0.04 * br, 1 + 0.02 * br);
    if (M.hover) P.pos('root', 0, M.hover * 0.35, 0);
    P.rot('head', 0.38, 0, 0.12);
    P.rot('earL', 0.4, 0, -0.3); P.rot('earR', 0.4, 0, 0.3);
    for (let i = 0; i < M.tails.length; i++) P.rot(M.tails[i], 0.2, 0.08 * S(t * 0.8 - i), 0);
    P.rot('wingL', 0, 0, -0.35); P.rot('wingR', 0, 0, 0.35);
    P.ch.eyes = 0; P.ch.mouth = 0.12 + 0.06 * br;
  },
  appear(P, t, M) {
    ambient(P, t, M, 1);
    const g = outBack(clamp01(t / 0.55));
    const s = Math.max(0.001, g);
    P.scl('root', s, s, s);
    P.pos('root', 0, 0.15 * bump(t, 0, 0.5), 0);
    P.ch.flash = 1 - ramp(t, 0.05, 0.6);
    P.ch.mouth = bump(t, 0.25, 0.7); P.ch.eyes = t < 0.2 ? 0.2 : 1;
  },
};
