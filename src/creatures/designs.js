// Procedural Sun/Moon-style Velmon designs. Every species is assembled from rounded parts on a small
// bone rig (see geo.js Builder). The v1 `model` params (shape, colours, parts) drive the design; v2
// re-sculpts them cuter: big heads and eyes on first stages, sturdier bodies on evolved forms.
// Units: a stage-1 Velmon is ~1 unit tall; model.js scales it to metres.
import * as THREE from 'three';
import { G, Builder, onSurface } from './geo.js';
import { SPECIES, PREVO } from './species.js';

const col = c => new THREE.Color(c);
const hex = c => '#' + col(c).getHexString();
const mix = (a, b, t) => '#' + col(a).lerp(col(b), t).getHexString();
const shade = (c, k) => { const x = col(c); const h = {}; x.getHSL(h); return '#' + x.setHSL(h.h, Math.min(1, h.s * (k < 1 ? 1.05 : 0.95)), Math.max(0, Math.min(1, h.l * k))).getHexString(); };
const lum = c => { const x = col(c); return 0.299 * x.r + 0.587 * x.g + 0.114 * x.b; };
const list = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** Per-species art tweaks on top of the v1 params. */
const VARIANT = {
  germoglio: { leafColor: '#a7e36b' }, arbusto: { leafColor: '#8fd65c', flowerColor: '#ff7eb6' }, silvarco: { leafColor: '#5fae45', flowerColor: '#ffb3d1' },
  tizzone: { snout: true }, brace: { snout: true }, vulcanide: { snout: true, brows: true },
  ondina: { snout: true, shellColor: '#ffb3c7' }, marea: { snout: true, shellColor: '#ffc2d4' },
  lanuvo: { face: '#e9c9a4' }, nembolana: { face: '#f3dcc2' }, nevino: { face: '#ffffff', blush: '#b8dcff' }, valangone: { face: '#ffffff', blush: '#b8dcff', brows: true },
  topolux: { snout: true }, ratolux: { snout: true, brows: true }, scoiattolo: { snout: true }, ghiandaro: { snout: true },
  voltino: { snout: true, earTip: '#3a2c12' }, fulminax: { snout: true, earTip: '#3a2c12', brows: true },
  sabbiolo: { snout: true }, desertauro: { snout: true, brows: true },
  fiammello: { snout: true, maneColor: '#ffb347' }, leonardente: { snout: true, maneColor: '#ffcf5a', brows: true },
  roccione: { pebble: true }, colossasso: { brows: true },
  goccino: {}, cascatone: { brows: false },
  granchio: {}, granchione: { brows: true },
  pipistro: {}, vampistro: { brows: true },
  ombrale: {}, tenebrale: { brows: true },
  abissale: { snout: true, brows: true },
  grifalco: { brows: true }, cristalla: {}, aurorante: { legend: true, brows: true },
};

function stageOf(id) { let s = 0, p = PREVO[id]; while (p) { s++; p = PREVO[p]; } return s; }

/** Build the rig for one species. Returns the Builder (bones, parts) and meta for anims. */
export function designVelmon(speciesId) {
  const sp = SPECIES[speciesId];
  if (!sp) throw new Error('unknown species ' + speciesId);
  const P = sp.model, V = VARIANT[speciesId] || {};
  const stage = sp.legendary ? 2 : stageOf(speciesId);
  const b = new Builder();
  const body = hex(P.body), belly = hex(P.belly ?? P.body);
  const C = {
    body, belly, eye: hex(P.eye ?? 0x1d1d1d), dark: shade(body, 0.62), light: shade(body, 1.18),
    paw: mix(body, belly, 0.45), blush: V.blush || mix(body, '#ff6f91', 0.6),
    accent: hex(P.accent ?? P.horn ?? P.crest ?? P.beak ?? P.wings ?? belly), face: V.face || belly,
  };
  const D = { b, P, V, C, stage, id: speciesId, k: [1, 0.9, 0.8][stage], extras: list(P.extra), head: null, back: null, tail: null, meta: { loco: 'legs', hover: 0, flap: null, eyeGlow: lum(C.eye) > 0.55 } };
  b.bone('root', null, [0, 0, 0]);
  const SHAPES = { quad, biped, bird, fluffy, bug, blob, butterfly, bat, ghost, rock, crab };
  (SHAPES[P.shape] || quad)(D);
  accessories(D);
  return { builder: b, meta: D.meta, stage };
}

// ---------------------------------------------------------------- face ----
function face(D, { c, r, bone = 'head', spread = 30, pitch = 8, size = 1, mouth = null, cheeks = true, brows = D.V.brows, nose = null }) {
  const { b, C } = D;
  const R = r[0];
  if (nose) b.add(G.ell(R * 0.09, R * 0.06, R * 0.06, 10, 8), { bone, p: nose, color: '#3a2630', outline: false });
  const ex = 0.25 * R * size, ey = 0.32 * R * size, ez = 0.14 * R * size;
  const glowEyes = D.meta.eyeGlow;
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const { p, q } = onSurface(c, r, s * spread, pitch, -ez * 0.35);
    b.bone('eye' + side, bone, p);
    const at = (lx, ly, lz) => add3(p, new THREE.Vector3(lx, ly, lz).applyQuaternion(q).toArray());
    b.add(G.ell(ex, ey, ez, 18, 14), { bone: 'eye' + side, p, q, color: C.eye, outline: false, glow: glowEyes });
    if (glowEyes) b.add(G.ell(ex * 0.38, ey * 0.62, ez * 0.6, 12, 10), { bone: 'eye' + side, p: at(0, -ey * 0.05, ez * 0.62), q, color: '#2a1838', outline: false });
    else b.add(G.ell(ex * 0.72, ey * 0.5, ez * 0.6, 14, 10), { bone: 'eye' + side, p: at(0, -ey * 0.38, ez * 0.55), q, color: mix(C.eye, '#8fb8ff', 0.35), outline: false });
    // two highlights, same light direction on both eyes (upper left in screen)
    b.add(G.ell(ex * 0.36, ey * 0.34, ez * 0.4, 10, 8), { bone: 'eye' + side, p: at(ex * 0.3, ey * 0.38, ez * 0.75), q, color: '#ffffff', outline: false, glow: true });
    b.add(G.ell(ex * 0.16, ey * 0.15, ez * 0.3, 8, 6), { bone: 'eye' + side, p: at(-ex * 0.32, -ey * 0.42, ez * 0.75), q, color: '#ffffff', outline: false, glow: true });
    if (brows) {
      const bp = onSurface(c, r, s * spread * 0.95, pitch + 24 * size, 0);
      b.add(G.ell(ex * 1.05, ey * 0.22, ez * 0.7, 12, 8), { bone, p: bp.p, q: bp.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), s * -0.32)), color: shade(C.body, 0.45), outline: false });
    }
    if (cheeks) {
      const cp = onSurface(c, r, s * (spread + 24), pitch - 16, 0.002);
      b.add(G.ell(ex * 0.7, ey * 0.42, ez * 0.25, 12, 8), { bone, p: cp.p, q: cp.q, color: D.P.cheeks != null ? hex(D.P.cheeks) : C.blush, outline: false });
    }
  }
  // mouth (bone scales open), with a tongue that shows when open
  if (mouth === false) return;
  const m = mouth || onSurface(c, r, 0, pitch - 30, -0.004);
  b.bone('mouth', bone, m.p);
  const mq = m.q;
  b.add(G.ell(R * 0.15, R * 0.045, R * 0.06, 14, 8), { bone: 'mouth', p: m.p, q: mq, color: '#5a1f2e', outline: false });
  b.add(G.ell(R * 0.09, R * 0.03, R * 0.05, 10, 8), { bone: 'mouth', p: add3(m.p, new THREE.Vector3(0, -R * 0.022, R * 0.012).applyQuaternion(mq).toArray()), q: mq, color: '#ff7f8f', outline: false });
}

function ellipsoidHead(D, c, r, opts = {}) {
  D.head = { c, r };
  D.b.add(G.ell(r[0], r[1], r[2], 26, 20), { bone: 'head', p: c, color: opts.color || D.C.body });
}

// ---------------------------------------------------------------- shapes ----
function quad(D) {
  const { b, C, stage, k, V } = D;
  const bl = [1, 1.12, 1.25][stage], bw = 1 + stage * 0.07;
  b.bone('body', 'root', [0, 0.36, 0]);
  b.add(G.ell(0.25 * bw, 0.22 + stage * 0.02, 0.33 * bl, 24, 18), { p: [0, 0.37, -0.04], color: C.body });
  b.add(G.ell(0.19 * bw, 0.15, 0.26 * bl, 20, 14), { p: [0, 0.3, 0.01], color: C.belly });
  const legs = [['FL', 0.15 * bw, 0.17 * bl, 0], ['FR', -0.15 * bw, 0.17 * bl, Math.PI], ['BL', 0.15 * bw, -0.24 * bl, Math.PI], ['BR', -0.15 * bw, -0.24 * bl, 0]];
  const lh = 0.13 + stage * 0.02;
  for (const [n, x, z, ph] of legs) {
    b.bone('leg' + n, 'body', [x, 0.27, z], { phase: ph });
    b.add(G.ell(0.075 * bw, lh, 0.08 * bw, 14, 10), { bone: 'leg' + n, p: [x, 0.14, z], color: C.body });
    b.add(G.ell(0.085 * bw, 0.055, 0.1 * bw, 14, 10), { bone: 'leg' + n, p: [x, 0.05, z + 0.025], color: C.paw });
  }
  const hc = [0, 0.5 + 0.17 * k + stage * 0.04, 0.22 * bl + 0.05 * k];
  const hr = [0.29 * k, 0.26 * k, 0.25 * k];
  b.bone('neck', 'body', [0, 0.46, 0.18 * bl]);
  b.bone('head', 'neck', [0, hc[1] - 0.12 * k, hc[2] - 0.06]);
  if (stage > 0) b.add(G.ell(0.14 * bw, 0.16, 0.15, 14, 10), { bone: 'neck', p: [0, 0.48 + stage * 0.03, 0.2 * bl], color: C.body });
  ellipsoidHead(D, hc, hr);
  let mouth = null, nose = null;
  if (V.snout !== false) {
    const sc = add3(hc, [0, -0.08 * k, 0.19 * k]);
    b.add(G.ell(0.13 * k, 0.085 * k, 0.11 * k, 16, 12), { bone: 'head', p: sc, color: C.belly });
    nose = add3(sc, [0, 0.045 * k, 0.1 * k]);
    mouth = onSurface(sc, [0.13 * k, 0.085 * k, 0.11 * k], 0, -32, -0.003);
  }
  face(D, { c: hc, r: hr, spread: 33, pitch: 12, mouth, nose });
  D.back = { p: [0, 0.58 + stage * 0.03, -0.06 * bl], n: [0, 1, -0.15] };
  D.tail = { p: [0, 0.4, -0.34 * bl], dir: [0, 0.35, -1] };
}

function biped(D) {
  const { b, C, stage, k, V } = D;
  const bs = [1, 1.08, 1.16][stage];
  b.bone('body', 'root', [0, 0.3, 0]);
  b.add(G.ell(0.24 * bs, 0.26 * bs, 0.21 * bs, 24, 18), { p: [0, 0.32 * bs, 0], color: C.body });
  b.add(G.ell(0.17 * bs, 0.19 * bs, 0.1 * bs, 18, 14), { p: [0, 0.3 * bs, 0.13 * bs], color: C.belly });
  for (const [s, ph] of [[1, 0], [-1, Math.PI]]) {
    const n = s > 0 ? 'BL' : 'BR';
    b.bone('leg' + n, 'body', [0.12 * s * bs, 0.17, 0], { phase: ph });
    b.add(G.ell(0.085 * bs, 0.1 * bs, 0.085 * bs, 14, 10), { bone: 'leg' + n, p: [0.12 * s * bs, 0.12, 0], color: C.body });
    b.add(G.ell(0.09 * bs, 0.06, 0.125 * bs, 14, 10), { bone: 'leg' + n, p: [0.13 * s * bs, 0.05, 0.04], color: C.paw });
    const an = s > 0 ? 'armL' : 'armR';
    b.bone(an, 'body', [0.2 * s * bs, 0.43 * bs, 0.02], { phase: ph + Math.PI });
    b.add(G.ell(0.055 * bs, 0.11 * bs, 0.055 * bs, 12, 10), { bone: an, p: [0.26 * s * bs, 0.34 * bs, 0.05], r: [0, 0, 0.45 * s], color: C.body });
    b.add(G.ell(0.06 * bs, 0.055 * bs, 0.06 * bs, 12, 10), { bone: an, p: [0.3 * s * bs, 0.25 * bs, 0.07], color: C.paw });
  }
  const hc = [0, 0.52 * bs + 0.24 * k, 0.03];
  const hr = [0.3 * k, 0.27 * k, 0.27 * k];
  b.bone('head', 'body', [0, 0.52 * bs, 0]);
  ellipsoidHead(D, hc, hr);
  let mouth = null, nose = null;
  if (V.snout) {
    const sc = add3(hc, [0, -0.09 * k, 0.2 * k]);
    b.add(G.ell(0.14 * k, 0.09 * k, 0.1 * k, 16, 12), { bone: 'head', p: sc, color: C.belly });
    nose = add3(sc, [0, 0.05 * k, 0.09 * k]);
    mouth = onSurface(sc, [0.14 * k, 0.09 * k, 0.1 * k], 0, -30, -0.003);
  }
  face(D, { c: hc, r: hr, spread: 30, pitch: 10, mouth, nose });
  D.back = { p: [0, 0.5 * bs, -0.17 * bs], n: [0, 0.4, -1] };
  D.tail = { p: [0, 0.2, -0.17 * bs], dir: [0, 0.2, -1] };
}

function bird(D) {
  const { b, C, stage, k, P, V } = D;
  const legend = !!V.legend;
  const s = legend ? 1.15 : [1, 1.05, 1.12][stage];
  const yb = [0.3, 0.33, 0.42][stage] * (legend ? 1.1 : 1);
  b.bone('body', 'root', [0, yb, 0]);
  b.add(G.ell(0.26 * s, (0.26 + stage * 0.02) * s, (0.27 + stage * 0.04) * s, 24, 18), { p: [0, yb, -0.02], color: C.body });
  b.add(G.ell(0.19 * s, 0.19 * s, 0.13 * s, 18, 14), { p: [0, yb - 0.03, 0.15 * s + stage * 0.02], color: C.belly });
  // feet
  const fc = hex(P.beak ?? 0xf2b134);
  for (const [sd, ph] of [[1, 0], [-1, Math.PI]]) {
    const n = sd > 0 ? 'BL' : 'BR';
    const top = yb - 0.18 * s;
    b.bone('leg' + n, 'body', [0.1 * sd * s, top, 0.02], { phase: ph });
    b.add(G.cyl(0.02, 0.022, top, 8), { bone: 'leg' + n, p: [0.1 * sd * s, top / 2, 0.02], color: fc });
    for (const a of [-0.5, 0, 0.5]) b.add(G.ell(0.025, 0.02, 0.06, 8, 6), { bone: 'leg' + n, p: [0.1 * sd * s + Math.sin(a) * 0.045, 0.02, 0.06 + Math.cos(a) * 0.03], r: [0, a, 0], color: fc });
  }
  // head
  const hc = stage === 0 ? [0, yb + 0.27 * s, 0.06] : [0, yb + (0.3 + stage * 0.06) * s, 0.1 + stage * 0.03];
  const hr = [0.24 * k * s, 0.22 * k * s, 0.23 * k * s];
  b.bone('head', 'body', [0, yb + 0.12 * s, 0.04]);
  if (stage > 0) b.add(G.ell(0.13 * s, 0.17 * s, 0.13 * s, 14, 10), { bone: 'head', p: [0, yb + 0.16 * s + stage * 0.03, 0.08], color: C.body });
  ellipsoidHead(D, hc, hr);
  // beak: upper on head, lower on mouth bone
  const bp = onSurface(hc, hr, 0, -10, -0.02);
  b.bone('mouth', 'head', bp.p);
  const bc = hex(P.beak ?? 0xf2b134);
  b.add(G.tear(1.7, 12), { bone: 'head', p: add3(bp.p, [0, 0.008, 0]), dir: [0, 0.05, 1], s: [0.07 * k * s, 0.07 * k * s, 0.05 * k * s], color: bc });
  b.add(G.tear(1.3, 10), { bone: 'mouth', p: add3(bp.p, [0, -0.022, -0.005]), dir: [0, -0.35, 1], s: [0.05 * k * s, 0.05 * k * s, 0.035 * k * s], color: shade(bc, 0.85) });
  face(D, { c: hc, r: hr, spread: 36, pitch: 14, mouth: false, cheeks: stage < 2 });
  // wings
  if (legend) {
    D.meta.loco = 'fly'; D.meta.hover = 0.35; D.meta.flap = 'z';
    for (const sd of [1, -1]) {
      const wn = sd > 0 ? 'wingL' : 'wingR';
      b.bone(wn, 'body', [0.2 * sd, yb + 0.1, -0.02]);
      for (let i = 0; i < 5; i++) {
        const a = 0.55 - i * 0.28, len = 0.42 - Math.abs(i - 1.2) * 0.05;
        const d = [sd * Math.cos(a), Math.sin(a) + 0.15, -0.25];
        b.add(G.tear(3.2, 10), { bone: wn, p: [0.24 * sd, yb + 0.12, -0.04 - i * 0.02], dir: d, roll: sd * 0.2, s: [0.07, len / 3.2, 0.025], color: i % 2 ? C.body : shade(C.body, 1.1) });
        b.add(G.tear(2, 8), { bone: wn, p: add3([0.24 * sd, yb + 0.12, -0.04 - i * 0.02], d, len * 0.82), dir: d, roll: sd * 0.2, s: [0.05, 0.09, 0.02], glow: true, color: i % 2 ? '#ff7a1a' : '#ffc23d' });
      }
    }
  } else {
    D.meta.loco = 'hop'; D.meta.flap = 'fold';
    for (const sd of [1, -1]) {
      const wn = sd > 0 ? 'wingL' : 'wingR';
      b.bone(wn, 'body', [0.22 * sd * s, yb + 0.1 * s, 0]);
      b.add(G.ell(0.07 * s, 0.2 * s, 0.14 * s, 14, 12), { bone: wn, p: [0.27 * sd * s, yb - 0.01, -0.03], r: [0.25, 0, 0.18 * sd], color: shade(C.body, 0.9) });
      b.add(G.ell(0.05 * s, 0.15 * s, 0.1 * s, 12, 10), { bone: wn, p: [0.29 * sd * s, yb - 0.1 * s, -0.09], r: [0.6, 0, 0.12 * sd], color: shade(C.body, 0.78) });
    }
  }
  // crest
  if (P.crest != null) {
    const cc = hex(P.crest);
    for (let i = 0; i < 3; i++) {
      const sp = onSurface(hc, hr, 0, 70 - i * 12, -0.02);
      b.add(G.tear(2.4, 10), { bone: 'head', p: sp.p, dir: [0, 1, -0.5 - i * 0.45], s: [0.045 * k * s * (1 - i * 0.15), 0.07 * k * s, 0.02], color: i === 1 ? shade(cc, 0.85) : cc, glow: legend });
    }
  }
  D.back = { p: [0, yb + 0.22 * s, -0.12], n: [0, 1, -0.3] };
  D.tail = { p: [0, yb - 0.02, -0.25 * s - stage * 0.03], dir: [0, 0.35, -1] };
}

function fluffy(D) {
  const { b, C, stage, k, P } = D;
  const s = [1, 1.06, 1.12][stage];
  const yb = 0.42 * s;
  b.bone('body', 'root', [0, yb, 0]);
  b.add(G.bumpy(0.33 * s, 0.29 * s, 0.32 * s, { amp: 0.07, freq: 6.5, seed: 3 }), { p: [0, yb, -0.02], color: C.body });
  const puffs = [[0.24, 0.12, 0.12], [-0.24, 0.12, 0.12], [0.2, 0.18, -0.18], [-0.2, 0.18, -0.18], [0, 0.26, -0.05], [0.27, -0.05, -0.08], [-0.27, -0.05, -0.08], [0, 0.05, -0.3]];
  puffs.forEach(([x, y, z], i) => b.add(G.bumpy(0.13 * s, 0.12 * s, 0.13 * s, { amp: 0.08, freq: 5, seed: i }), { p: [x * s, yb + y * s, z * s], color: i % 2 ? C.body : shade(C.body, 0.97) }));
  for (const [n, x, z, ph] of [['FL', 0.15, 0.13, 0], ['FR', -0.15, 0.13, Math.PI], ['BL', 0.15, -0.15, Math.PI], ['BR', -0.15, -0.15, 0]]) {
    b.bone('leg' + n, 'body', [x * s, 0.14, z * s], { phase: ph });
    b.add(G.ell(0.06 * s, 0.1, 0.065 * s, 12, 10), { bone: 'leg' + n, p: [x * s, 0.08, z * s], color: shade(C.face, 0.72) });
  }
  const hc = [0, yb + 0.02, 0.22 * s];
  const hr = [0.2 * k * s, 0.18 * k * s, 0.14 * k * s];
  b.bone('head', 'body', [0, yb, 0.1]);
  D.head = { c: hc, r: hr };
  b.add(G.ell(hr[0], hr[1], hr[2], 22, 16), { bone: 'head', p: hc, color: C.face });
  b.add(G.bumpy(0.19 * s, 0.1 * s, 0.13 * s, { amp: 0.1, freq: 6, seed: 9 }), { bone: 'head', p: add3(hc, [0, hr[1] * 0.95, -0.05]), color: C.body });
  face(D, { c: hc, r: hr, spread: 34, pitch: 6, size: 1.15 });
  if (P.horns != null) {
    const hcol = hex(P.horns);
    for (const sd of [1, -1]) b.add(G.torus(0.07 * s, 0.028 * s, Math.PI * 1.5, 8, 18), { bone: 'head', p: [sd * hr[0] * 1.02, hc[1] + 0.04, hc[2] - 0.05], r: [0, Math.PI / 2, sd > 0 ? 0.6 : Math.PI - 0.6], color: hcol });
  }
  if (P.hover) { D.meta.hover = P.hover; D.meta.loco = 'float'; }
  D.back = { p: [0, yb + 0.3 * s, -0.08], n: [0, 1, -0.2] };
  D.tail = { p: [0, yb - 0.05, -0.3 * s], dir: [0, 0.2, -1] };
}

function bug(D) {
  const { b, C, stage, k, P } = D;
  const s = [1, 1.1, 1.2][stage];
  b.bone('body', 'root', [0, 0.27, 0]);
  b.add(G.ell(0.17 * s, 0.16 * s, 0.19 * s, 18, 14), { p: [0, 0.27, 0.02], color: C.body });
  b.add(G.ell(0.13 * s, 0.11 * s, 0.1 * s, 14, 10), { p: [0, 0.23, 0.12 * s], color: C.belly });
  b.bone('tail0', 'body', [0, 0.28, -0.14 * s]);
  b.add(G.ell(0.2 * s, 0.17 * s, 0.27 * s, 20, 14), { bone: 'tail0', p: [0, 0.29, -0.33 * s], color: C.body });
  for (let i = 0; i < 3; i++) b.add(G.torus(0.145 * s - Math.abs(i - 1) * 0.03, 0.022, Math.PI * 2, 6, 22), { bone: 'tail0', p: [0, 0.29, (-0.22 - i * 0.11) * s], color: C.belly, outline: false, s: [1, 1.05, 1] });
  // six legs, tripod gait
  const L = [['FL', 1, 0.1, 0], ['FR', -1, 0.1, Math.PI], ['ML', 1, -0.02, Math.PI], ['MR', -1, -0.02, 0], ['BL', 1, -0.14, 0], ['BR', -1, -0.14, Math.PI]];
  for (const [n, sd, z, ph] of L) {
    b.bone('leg' + n, 'body', [0.13 * sd * s, 0.22, z * s], { phase: ph });
    b.add(G.ell(0.025, 0.12, 0.025, 8, 8), { bone: 'leg' + n, p: [0.2 * sd * s, 0.13, z * s], r: [0, 0, 0.55 * sd], color: C.dark });
    b.add(G.ell(0.035, 0.03, 0.05, 8, 6), { bone: 'leg' + n, p: [0.25 * sd * s, 0.03, z * s + 0.02], color: C.dark });
  }
  const hc = [0, 0.48 * s + 0.04, 0.19 * s];
  const hr = [0.25 * k * s, 0.22 * k * s, 0.22 * k * s];
  b.bone('head', 'body', [0, 0.36, 0.12 * s]);
  ellipsoidHead(D, hc, hr);
  face(D, { c: hc, r: hr, spread: 36, pitch: 8, size: 1.25 });
  // antennae on ear bones
  for (const sd of [1, -1]) {
    const en = sd > 0 ? 'earL' : 'earR';
    const base = onSurface(hc, hr, sd * 22, 62, -0.01).p;
    b.bone(en, 'head', base);
    b.add(G.ell(0.014, 0.13, 0.014, 6, 8), { bone: en, p: add3(base, [sd * 0.03, 0.12, 0.03]), r: [0.25, 0, -0.25 * sd], color: C.dark });
    b.add(G.ell(0.035, 0.035, 0.035, 10, 8), { bone: en, p: add3(base, [sd * 0.065, 0.245, 0.07]), color: C.belly });
  }
  // folded wings on the back
  if (P.wings) for (const sd of [1, -1]) {
    const wn = sd > 0 ? 'wingL' : 'wingR';
    b.bone(wn, 'body', [0.06 * sd, 0.4, -0.05]);
    b.add(G.ell(0.11 * s, 0.025, 0.3 * s, 14, 8), { bone: wn, p: [0.09 * sd * s, 0.43, -0.25 * s], r: [-0.15, 0.18 * sd, 0.2 * sd], color: mix(C.belly, '#ffffff', 0.35) });
  }
  D.meta.flap = P.wings ? 'fold' : null;
  D.back = { p: [0, 0.43, -0.05], n: [0, 1, 0] };
  D.tail = null;
}

function blob(D) {
  const { b, C, stage, P } = D;
  const s = [1, 1.08, 1.15][stage];
  const water = SPECIES[D.id].types.includes('Acqua');
  b.bone('body', 'root', [0, 0.3, 0]);
  b.add(G.drop(0.36 * s, 0.66 * s, water ? 0.75 : 0.15), { p: [0, 0, 0], color: C.body });
  b.add(G.ell(0.24 * s, 0.2 * s, 0.1 * s, 18, 12), { p: [0, 0.22 * s, 0.27 * s], color: C.belly });
  for (const [sd, ph] of [[1, 0], [-1, Math.PI]]) {
    const n = sd > 0 ? 'BL' : 'BR';
    b.bone('leg' + n, 'body', [0.15 * sd * s, 0.05, 0.12]);
    b.add(G.ell(0.08 * s, 0.05, 0.09 * s, 12, 8), { bone: 'leg' + n, p: [0.15 * sd * s, 0.035, 0.15 * s], color: shade(C.body, 0.85) });
  }
  const hc = [0, 0.3 * s, 0], hr = [0.335 * s, 0.33 * s, 0.335 * s];
  b.bone('head', 'body', [0, 0.3 * s, 0]);
  D.head = { c: hc, r: hr };
  face(D, { c: hc, r: hr, spread: 26, pitch: 6, size: 0.95 });
  if (P.glossy) {
    const g1 = onSurface([0, 0.33 * s, 0], [0.33 * s, 0.33 * s, 0.33 * s], -38, 42, 0.005);
    b.add(G.ell(0.04 * s, 0.1 * s, 0.015, 10, 8), { p: g1.p, q: g1.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.5)), color: '#ffffff', glow: true });
    const g2 = onSurface([0, 0.33 * s, 0], [0.33 * s, 0.33 * s, 0.33 * s], -52, 22, 0.005);
    b.add(G.ell(0.022 * s, 0.03 * s, 0.012, 8, 6), { p: g2.p, q: g2.q, color: '#ffffff', glow: true });
  }
  D.meta.loco = 'hop';
  D.back = { p: [0, (water ? 0.58 : 0.62) * s, -0.02], n: [0, 1, -0.1] };
  D.tail = { p: [0, 0.2 * s, -0.3 * s], dir: [0, 0.3, -1] };
}

function butterfly(D) {
  const { b, C, stage, k, P } = D;
  const s = [1, 1.12][stage] || 1.12;
  D.meta.loco = 'fly'; D.meta.hover = 0.42; D.meta.flap = 'y';
  b.bone('body', 'root', [0, 0.33, 0]);
  b.add(G.ell(0.1 * s, 0.13 * s, 0.1 * s, 14, 12), { p: [0, 0.33, 0], color: C.body });
  b.bone('tail0', 'body', [0, 0.24, -0.02]);
  b.add(G.ell(0.075 * s, 0.15 * s, 0.075 * s, 12, 10), { bone: 'tail0', p: [0, 0.14, -0.05], r: [-0.25, 0, 0], color: C.body });
  for (let i = 0; i < 2; i++) b.add(G.torus(0.068 * s - i * 0.012, 0.012, Math.PI * 2, 6, 16), { bone: 'tail0', p: [0, 0.18 - i * 0.06, -0.04 - i * 0.015], r: [Math.PI / 2 - 0.25, 0, 0], color: hex(P.wings), outline: false });
  const hc = [0, 0.53 * s, 0.04], hr = [0.18 * k * s, 0.165 * k * s, 0.17 * k * s];
  b.bone('head', 'body', [0, 0.42, 0.02]);
  ellipsoidHead(D, hc, hr);
  face(D, { c: hc, r: hr, spread: 32, pitch: 4, size: 1.2 });
  for (const sd of [1, -1]) {
    const en = sd > 0 ? 'earL' : 'earR';
    const base = onSurface(hc, hr, sd * 22, 64, -0.01).p;
    b.bone(en, 'head', base);
    b.add(G.ell(0.012, 0.12, 0.012, 6, 8), { bone: en, p: add3(base, [sd * 0.035, 0.11, 0]), r: [0, 0, -0.35 * sd], color: C.dark });
    b.add(G.ell(0.03, 0.03, 0.03, 10, 8), { bone: en, p: add3(base, [sd * 0.08, 0.22, 0]), color: hex(P.wings) });
  }
  const wc = hex(P.wings), rim = shade(wc, 0.55), spot = mix(wc, '#ffffff', 0.65);
  for (const sd of [1, -1]) {
    const wn = sd > 0 ? 'wingL' : 'wingR';
    b.bone(wn, 'body', [0.05 * sd, 0.4, -0.08]);
    const up = [0.26 * sd * s, 0.56 * s, -0.11], lo = [0.19 * sd * s, 0.27 * s, -0.11];
    b.add(G.ell(0.25 * s, 0.21 * s, 0.014, 22, 12), { bone: wn, p: up, r: [0, 0, -0.38 * sd], color: wc });
    b.add(G.ell(0.27 * s, 0.23 * s, 0.009, 22, 10), { bone: wn, p: add3(up, [0.005 * sd, 0.005, 0]), r: [0, 0, -0.38 * sd], color: rim, outline: false });
    b.add(G.ell(0.17 * s, 0.14 * s, 0.014, 18, 10), { bone: wn, p: lo, r: [0, 0, 0.5 * sd], color: wc });
    b.add(G.ell(0.185 * s, 0.155 * s, 0.009, 18, 8), { bone: wn, p: add3(lo, [0.004 * sd, -0.004, 0]), r: [0, 0, 0.5 * sd], color: rim, outline: false });
    b.add(G.ell(0.07 * s, 0.06 * s, 0.02, 12, 8), { bone: wn, p: add3(up, [0.06 * sd * s, 0.04 * s, 0]), color: spot, outline: false });
    b.add(G.ell(0.035 * s, 0.03 * s, 0.02, 10, 8), { bone: wn, p: add3(up, [-0.07 * sd * s, -0.06 * s, 0]), color: spot, outline: false });
    b.add(G.ell(0.045 * s, 0.04 * s, 0.02, 10, 8), { bone: wn, p: add3(lo, [0.03 * sd * s, -0.03 * s, 0]), color: spot, outline: false });
  }
  D.back = { p: [0, 0.45, -0.08], n: [0, 1, -0.3] };
  D.tail = null;
}

function bat(D) {
  const { b, C, stage, k, P } = D;
  const s = [1, 1.12][stage] || 1.12;
  D.meta.loco = 'fly'; D.meta.hover = 0.42; D.meta.flap = 'z';
  b.bone('body', 'root', [0, 0.35, 0]);
  b.add(G.ell(0.27 * s, 0.25 * s, 0.25 * s, 24, 18), { p: [0, 0.36, 0], color: C.body });
  b.add(G.ell(0.17 * s, 0.14 * s, 0.08 * s, 16, 12), { p: [0, 0.3, 0.2 * s], color: C.belly });
  const hc = [0, 0.38, 0.0], hr = [0.27 * s, 0.25 * s, 0.25 * s];
  b.bone('head', 'body', [0, 0.38, 0]);
  D.head = { c: hc, r: hr };
  face(D, { c: hc, r: hr, spread: 30, pitch: 14, size: 1.05 });
  // fangs on the mouth bone
  const mp = D.b.abs[D.b.index.mouth].toArray();
  for (const sd of [1, -1]) b.add(G.tear(2, 8), { bone: 'mouth', p: add3(mp, [sd * 0.025, -0.005, 0.012]), dir: [0, -1, 0.15], s: [0.014, 0.016, 0.012], color: '#ffffff', outline: false });
  for (const sd of [1, -1]) {
    const wn = sd > 0 ? 'wingL' : 'wingR';
    b.bone(wn, 'body', [0.22 * sd * s, 0.4, -0.02]);
    const base = [0.25 * sd * s, 0.42, -0.03], wc = hex(P.wings);
    const fingers = [[0.55, 0.42], [0.1, 0.46], [-0.35, 0.38]];
    fingers.forEach(([a, len], i) => {
      const d = [sd * Math.cos(a), Math.sin(a), -0.1];
      b.add(G.tear(3, 10, 1.2), { bone: wn, p: base, dir: d, roll: Math.PI / 2, s: [0.1 * s, len * s / 3, 0.02], color: i === 1 ? wc : shade(wc, 1.15) });
    });
    b.add(G.ell(0.025, 0.025, 0.025, 8, 6), { bone: wn, p: add3(base, [sd * Math.cos(0.55), Math.sin(0.55), 0], 0.42 * s), color: C.dark });
  }
  for (const [sd] of [[1], [-1]]) {
    const n = sd > 0 ? 'BL' : 'BR';
    b.bone('leg' + n, 'body', [0.1 * sd, 0.15, 0]);
    b.add(G.ell(0.04, 0.05, 0.05, 8, 6), { bone: 'leg' + n, p: [0.1 * sd * s, 0.12, 0.02], color: C.dark });
  }
  D.back = { p: [0, 0.6 * s, -0.05], n: [0, 1, -0.2] };
  D.tail = null;
}

function ghost(D) {
  const { b, C, stage, k, P } = D;
  const s = [1, 1.15][stage] || 1.15;
  D.meta.loco = 'float'; D.meta.hover = 0.28;
  if (P.glow != null) D.meta.baseGlow = { color: hex(P.glow), v: 0.22 };
  b.bone('body', 'root', [0, 0.45, 0]);
  const hc = [0, 0.5 * s, 0], hr = [0.3 * s, 0.29 * s, 0.28 * s];
  b.add(G.ell(hr[0], hr[1], hr[2], 26, 20), { p: hc, color: C.body });
  b.add(G.ell(0.2 * s, 0.16 * s, 0.1 * s, 16, 12), { p: [0, 0.4 * s, 0.2 * s], color: C.belly });
  // wispy tail on a chain
  let prev = 'body', p0 = [0, 0.36 * s, -0.02];
  const seg = [[0.23, [0, 0.32, -0.05]], [0.15, [0, 0.19, -0.15]], [0.08, [0, 0.1, -0.24]]];
  seg.forEach(([r, pc], i) => {
    const pp = pc.map((v, j) => (j === 1 ? v * s : v * s));
    b.bone('tail' + i, prev, i === 0 ? p0 : pp);
    b.add(G.ell(r * s, r * 0.95 * s, r * s, 18, 12), { bone: 'tail' + i, p: pp, color: i === 2 ? C.belly : C.body });
    prev = 'tail' + i;
  });
  for (const [sd, an] of [[1, 'armL'], [-1, 'armR']]) {
    b.bone(an, 'body', [0.26 * sd * s, 0.48 * s, 0.04]);
    b.add(G.tear(1.6, 10), { bone: an, p: [0.3 * sd * s, 0.44 * s, 0.06], dir: [sd, -0.6, 0.2], s: [0.07 * s, 0.07 * s, 0.06 * s], color: C.body });
  }
  b.bone('head', 'body', [0, 0.5 * s, 0]);
  D.head = { c: hc, r: hr };
  face(D, { c: hc, r: hr, spread: 28, pitch: 12, size: 1.2, cheeks: false });
  D.back = { p: [0, 0.78 * s, -0.02], n: [0, 1, 0] };
  D.tail = null;
}

function rock(D) {
  const { b, C, stage, P, V } = D;
  const s = [1, 1.15][stage] || 1.15;
  b.bone('body', 'root', [0, 0.34 * s, 0]);
  b.add(G.bumpy(0.37 * s, 0.32 * s, 0.34 * s, { amp: 0.1, freq: 2.6, seed: stage + 2 }), { p: [0, 0.34 * s, 0], color: C.body });
  b.add(G.bumpy(0.23 * s, 0.17 * s, 0.1 * s, { amp: 0.06, freq: 3, seed: 5 }), { p: [0, 0.22 * s, 0.26 * s], color: C.belly });
  for (const [n, x, z, ph] of [['FL', 0.2, 0.14, 0], ['FR', -0.2, 0.14, Math.PI], ['BL', 0.2, -0.15, Math.PI], ['BR', -0.2, -0.15, 0]]) {
    b.bone('leg' + n, 'body', [x * s, 0.12, z * s], { phase: ph });
    b.add(G.bumpy(0.1 * s, 0.09, 0.11 * s, { amp: 0.08, freq: 3, seed: x + z }), { bone: 'leg' + n, p: [x * s, 0.07, z * s], color: C.dark });
  }
  for (const [sd, an] of [[1, 'armL'], [-1, 'armR']]) {
    b.bone(an, 'body', [0.3 * sd * s, 0.4 * s, 0.05]);
    b.add(G.bumpy(0.11 * s, 0.13 * s, 0.11 * s, { amp: 0.09, freq: 3, seed: sd + 4 }), { bone: an, p: [0.39 * sd * s, 0.28 * s, 0.1 * s], color: shade(C.body, 0.9) });
  }
  const hc = [0, 0.36 * s, 0.02], hr = [0.36 * s, 0.31 * s, 0.33 * s];
  b.bone('head', 'body', [0, 0.36 * s, 0]);
  D.head = { c: hc, r: hr };
  D.V = { ...V, brows: true };
  face(D, { c: hc, r: hr, spread: 25, pitch: 14, size: 0.9, cheeks: true });
  if (V.pebble) {
    b.add(G.ell(0.02, 0.08, 0.02, 6, 8), { p: [0.02, 0.69 * s, -0.02], r: [0, 0, -0.2], color: '#6aa84f' });
    b.add(G.tear(1.6, 8), { p: [0.05, 0.75 * s, -0.02], dir: [1, 0.6, 0], s: [0.05, 0.05, 0.015], color: '#8fd65c' });
    b.add(G.tear(1.6, 8), { p: [0.0, 0.75 * s, -0.02], dir: [-1, 0.8, 0], s: [0.04, 0.04, 0.012], color: '#7cc84c' });
  }
  D.back = { p: [0, 0.64 * s, -0.08], n: [0, 1, -0.3] };
  D.tail = null;
}

function crab(D) {
  const { b, C, stage, P } = D;
  const s = [1, 1.15][stage] || 1.15;
  b.bone('body', 'root', [0, 0.24, 0]);
  b.add(G.ell(0.34 * s, 0.18 * s, 0.26 * s, 24, 16), { p: [0, 0.25, 0], color: C.body });
  b.add(G.ell(0.28 * s, 0.1 * s, 0.21 * s, 20, 12), { p: [0, 0.17, 0.03], color: C.belly });
  b.add(G.ell(0.2 * s, 0.08 * s, 0.16 * s, 18, 10), { p: [0, 0.37 * s, -0.03], color: shade(C.body, 1.12), outline: false });
  // eye stalks: ear bones, eyes on top
  b.bone('head', 'body', [0, 0.3, 0.12]);
  for (const sd of [1, -1]) {
    const en = sd > 0 ? 'earL' : 'earR', side = sd > 0 ? 'L' : 'R';
    b.bone(en, 'head', [0.1 * sd * s, 0.36 * s, 0.15 * s]);
    b.add(G.cyl(0.025, 0.032, 0.15, 8), { bone: en, p: [0.1 * sd * s, 0.43 * s, 0.16 * s], color: C.body });
    const ep = [0.1 * sd * s, 0.53 * s, 0.17 * s];
    b.bone('eye' + side, en, ep);
    b.add(G.ell(0.07 * s, 0.075 * s, 0.07 * s, 16, 12), { bone: 'eye' + side, p: ep, color: '#ffffff' });
    b.add(G.ell(0.045 * s, 0.055 * s, 0.03 * s, 12, 10), { bone: 'eye' + side, p: add3(ep, [0, 0, 0.055 * s]), color: C.eye, outline: false });
    b.add(G.ell(0.016 * s, 0.018 * s, 0.01, 8, 6), { bone: 'eye' + side, p: add3(ep, [0.012, 0.02, 0.083 * s]), color: '#ffffff', outline: false, glow: true });
    if (stage > 0) b.add(G.ell(0.075 * s, 0.022, 0.05, 10, 6), { bone: 'eye' + side, p: add3(ep, [0, 0.065 * s, 0.02]), r: [0, 0, -0.35 * sd], color: shade(C.body, 0.5), outline: false });
  }
  const mp = [0, 0.24, 0.255 * s];
  b.bone('mouth', 'head', mp);
  b.add(G.ell(0.05, 0.016, 0.02, 12, 8), { bone: 'mouth', p: mp, color: '#5a1f2e', outline: false });
  for (const sd of [1, -1]) {
    const cp = onSurface([0, 0.25, 0], [0.34 * s, 0.18 * s, 0.26 * s], sd * 40, -5, 0.002);
    b.add(G.ell(0.05, 0.03, 0.01, 10, 8), { p: cp.p, q: cp.q, color: C.blush, outline: false });
  }
  D.head = { c: [0, 0.25, 0], r: [0.34 * s, 0.18 * s, 0.26 * s] };
  for (const sd of [1, -1]) {
    const an = sd > 0 ? 'armL' : 'armR', hn = sd > 0 ? 'handL' : 'handR';
    b.bone(an, 'body', [0.28 * sd * s, 0.25, 0.12 * s]);
    b.add(G.ell(0.06, 0.055, 0.12, 12, 8), { bone: an, p: [0.36 * sd * s, 0.26, 0.2 * s], r: [0, 0.6 * sd, 0], color: C.body });
    b.add(G.ell(0.13 * s, 0.1 * s, 0.15 * s, 18, 12), { bone: an, p: [0.43 * sd * s, 0.28, 0.35 * s], color: C.body });
    b.bone(hn, an, [0.43 * sd * s, 0.33, 0.3 * s]);
    b.add(G.ell(0.085 * s, 0.05 * s, 0.13 * s, 14, 10), { bone: hn, p: [0.43 * sd * s, 0.38 * s, 0.42 * s], r: [-0.2, 0, 0], color: shade(C.body, 1.06) });
  }
  const L = [['FL', 1, 0.08, 0], ['FR', -1, 0.08, Math.PI], ['ML', 1, -0.06, Math.PI], ['MR', -1, -0.06, 0], ['BL', 1, -0.18, 0], ['BR', -1, -0.18, Math.PI]];
  for (const [n, sd, z, ph] of L) {
    b.bone('leg' + n, 'body', [0.28 * sd * s, 0.2, z * s], { phase: ph });
    b.add(G.ell(0.028, 0.03, 0.12, 8, 6), { bone: 'leg' + n, p: [0.38 * sd * s, 0.14, z * s], r: [0, Math.PI / 2, -0.7 * sd], color: shade(C.body, 0.85) });
  }
  D.meta.crab = true;
  D.back = { p: [0, 0.42 * s, -0.05], n: [0, 1, -0.2] };
  D.tail = null;
}

// ---------------------------------------------------------- accessories ----
function accessories(D) {
  const { b, P, C, V, k, head } = D;
  if (head && P.ears && !b.has('earL')) ears(D, P.ears);
  if (D.tail && P.tail && !b.has('tail0')) tail(D, P.tail);
  for (const x of D.extras) extra(D, x);
}

function ears(D, kind) {
  const { b, C, k, head, V } = D;
  const { c, r } = head;
  const sz = r[0] / 0.29;
  const inner = mix(C.belly, '#ff9db5', 0.4);
  for (const sd of [1, -1]) {
    const en = sd > 0 ? 'earL' : 'earR';
    const yaw = { leaf: 52, pointy: 42, round: 50, long: 34, fin: 78 }[kind] ?? 45;
    const pitch = { leaf: 48, pointy: 52, round: 46, long: 58, fin: 10 }[kind] ?? 50;
    const base = onSurface(c, r, sd * yaw, pitch, -0.02 * sz);
    b.bone(en, 'head', base.p);
    if (kind === 'leaf') {
      const lc = V.leafColor || C.light;
      b.add(G.tear(2.2, 12), { bone: en, p: base.p, dir: [0.75 * sd, 1, -0.15], roll: sd * 0.4, s: [0.09 * sz, 0.12 * sz, 0.025 * sz], color: lc });
      b.add(G.ell(0.006 * sz, 0.1 * sz, 0.012 * sz, 6, 6), { bone: en, p: add3(base.p, [0.75 * sd, 1, -0.15].map(v => v * 0.08 * sz)), dir: [0.75 * sd, 1, -0.15], color: shade(lc, 0.7), outline: false });
    } else if (kind === 'pointy') {
      b.add(G.tear(2.6, 12, 1.25), { bone: en, p: base.p, dir: [0.42 * sd, 1, -0.08], s: [0.085 * sz, 0.085 * sz, 0.05 * sz], color: C.body });
      b.add(G.tear(2.2, 10, 1.25), { bone: en, p: add3(base.p, [0.01 * sd, 0.02 * sz, 0.03 * sz]), dir: [0.42 * sd, 1, 0.05], s: [0.05 * sz, 0.07 * sz, 0.03 * sz], color: inner, outline: false });
    } else if (kind === 'round') {
      const p = add3(base.p, [0.04 * sd * sz, 0.06 * sz, 0]);
      b.add(G.ell(0.1 * sz, 0.1 * sz, 0.035 * sz, 18, 12), { bone: en, p, r: [0, -0.25 * sd, -0.35 * sd], color: C.body });
      b.add(G.ell(0.065 * sz, 0.065 * sz, 0.02 * sz, 14, 10), { bone: en, p: add3(p, [0, 0, 0.02 * sz]), r: [0, -0.25 * sd, -0.35 * sd], color: inner, outline: false });
    } else if (kind === 'long') {
      const d = [0.3 * sd, 1, -0.2];
      b.add(G.ell(0.06 * sz, 0.2 * sz, 0.035 * sz, 14, 12), { bone: en, p: add3(base.p, d, 0.17 * sz), dir: d, color: C.body });
      b.add(G.ell(0.035 * sz, 0.14 * sz, 0.015 * sz, 10, 10), { bone: en, p: add3(add3(base.p, d, 0.15 * sz), [0, 0, 0.025 * sz]), dir: d, color: inner, outline: false });
      if (V.earTip) b.add(G.ell(0.05 * sz, 0.06 * sz, 0.032 * sz, 12, 10), { bone: en, p: add3(base.p, d, 0.33 * sz), dir: d, color: V.earTip });
    } else if (kind === 'fin') {
      b.add(G.tear(2, 12), { bone: en, p: base.p, dir: [sd, 0.45, -0.55], roll: Math.PI / 2, s: [0.09 * sz, 0.1 * sz, 0.025 * sz], color: C.belly });
    }
  }
}

function chain(D, n, len, dirs, parent = 'body') {
  const { b } = D;
  let p = D.tail.p.slice(), prev = parent;
  const pts = [];
  for (let i = 0; i < n; i++) {
    b.bone('tail' + i, prev, p, { phase: i * 0.7 });
    const d = new THREE.Vector3(...dirs[Math.min(i, dirs.length - 1)]).normalize().toArray();
    const mid = add3(p, d, len * 0.5);
    pts.push({ p: p.slice(), mid, d, end: add3(p, d, len) });
    prev = 'tail' + i;
    p = add3(p, d, len);
  }
  return pts;
}

function tail(D, kind) {
  const { b, C, stage, V } = D;
  const sz = 1 + stage * 0.15;
  if (kind === 'thin') {
    const pts = chain(D, 3, 0.12 * sz, [[0, 0.2, -1], [0, 0.7, -0.7], [0, 1, 0.1]]);
    pts.forEach((q, i) => b.add(G.ell(0.03 - i * 0.005, 0.03 - i * 0.005, 0.075 * sz, 10, 8), { bone: 'tail' + i, p: q.mid, dir: q.d, roll: 0, s: 1, r: undefined, color: C.body }));
    b.add(G.ell(0.035, 0.035, 0.035, 10, 8), { bone: 'tail2', p: pts[2].end, color: C.belly });
  } else if (kind === 'fluffy') {
    const pts = chain(D, 3, 0.15 * sz, [[0, 0.8, -0.8], [0, 1, -0.1], [0, 0.6, 0.6]]);
    const rr = [0.09, 0.14, 0.13];
    pts.forEach((q, i) => b.add(G.bumpy(rr[i] * sz, rr[i] * sz, rr[i] * 1.2 * sz, { amp: 0.06, freq: 5, seed: i }), { bone: 'tail' + i, p: q.mid, color: i === 2 ? C.belly : C.body }));
  } else if (kind === 'leaf') {
    const pts = chain(D, 2, 0.1 * sz, [[0, 0.5, -1], [0, 1, -0.4]]);
    pts.forEach((q, i) => b.add(G.ell(0.03, 0.03, 0.06 * sz, 8, 8), { bone: 'tail' + i, p: q.mid, dir: q.d, color: C.body }));
    const lc = V.leafColor || C.light;
    b.add(G.tear(2.2, 12), { bone: 'tail1', p: pts[1].end, dir: [0, 1, -0.6], s: [0.11 * sz, 0.13 * sz, 0.03 * sz], color: lc });
  } else if (kind === 'flame') {
    const pts = chain(D, 2, 0.11 * sz, [[0, 0.35, -1], [0, 0.9, -0.6]]);
    pts.forEach((q, i) => b.add(G.ell(0.055 - i * 0.012, 0.055 - i * 0.012, 0.08 * sz, 12, 8), { bone: 'tail' + i, p: q.mid, dir: q.d, color: C.body }));
    b.bone('flame', 'tail1', pts[1].end);
    const hot = SPECIES[D.id].types.includes('Fuoco');
    b.add(G.tear(2.4, 12), { bone: 'flame', p: add3(pts[1].end, [0, -0.02, 0]), s: 0.085 * sz, color: hot ? '#ff7a1a' : C.accent, glow: true });
    b.add(G.tear(2, 10), { bone: 'flame', p: add3(pts[1].end, [0, 0, 0.03]), s: 0.05 * sz, color: '#ffe066', glow: true });
    D.meta.flame = true;
  } else if (kind === 'fin') {
    const pts = chain(D, 2, 0.11 * sz, [[0, 0.15, -1], [0, 0.4, -1]]);
    pts.forEach((q, i) => b.add(G.ell(0.07 - i * 0.02, 0.06 - i * 0.015, 0.09 * sz, 12, 8), { bone: 'tail' + i, p: q.mid, dir: q.d, color: C.body }));
    for (const sd of [1, -1]) b.add(G.tear(2, 10), { bone: 'tail1', p: pts[1].end, dir: [0.8 * sd, 0.5, -0.6], roll: Math.PI / 2, s: [0.07 * sz, 0.07 * sz, 0.02], color: C.belly });
  } else if (kind === 'feather') {
    b.bone('tail0', 'body', D.tail.p, { phase: 0 });
    const fc = D.P.crest != null ? hex(D.P.crest) : shade(C.body, 0.8);
    for (let i = -1; i <= 1; i++) b.add(G.tear(3, 10), { bone: 'tail0', p: D.tail.p, dir: [i * 0.35, 0.45, -1], roll: 0, s: [0.06 * sz, 0.07 * sz, 0.02], color: i === 0 ? fc : shade(C.body, 0.85) });
  } else if (kind === 'bolt') {
    b.bone('tail0', 'body', D.tail.p, { phase: 0 });
    const tc = shade(C.body, 0.92);
    let p = D.tail.p.slice();
    const segs = [[0, 0.6, -1, 0.1], [0.0, 1, 0.4, 0.13], [0, 0.8, -1, 0.16]];
    segs.forEach(([x, y, z, l], i) => {
      const d = new THREE.Vector3(x, y, z).normalize().toArray();
      b.add(G.box(0.045 * sz, l * sz, 0.12 * sz - i * 0.01), { bone: 'tail0', p: add3(p, d, l * sz * 0.5), dir: d, roll: Math.PI / 2, color: i === 0 ? shade(C.body, 0.55) : tc });
      p = add3(p, d, l * sz * 0.9);
    });
  }
}

function extra(D, kind) {
  const { b, C, stage, P, V, head, k } = D;
  const back = D.back;
  const hsz = head ? head.r[0] / 0.29 : 1;
  const top = head ? onSurface(head.c, head.r, 0, 82, -0.015).p : back.p;
  if (kind === 'sprout') {
    const lc = V.leafColor || '#a7e36b';
    b.bone('back', 'body', back.p);
    b.add(G.ell(0.015, 0.06, 0.015, 6, 6), { bone: 'back', p: add3(back.p, [0, 0.05, 0]), color: '#5b9a3a' });
    for (const sd of [1, -1]) b.add(G.tear(2, 10), { bone: 'back', p: add3(back.p, [0, 0.1, 0]), dir: [sd, 0.7, 0], roll: 0, s: [0.06, 0.07, 0.018], color: sd > 0 ? lc : shade(lc, 0.9) });
  } else if (kind === 'flower') {
    const at = P.shape === 'blob' ? add3(back.p, [0.12, 0.05, 0.05]) : back.p;
    if (!b.has('back')) b.bone('back', 'body', at);
    const pc = V.flowerColor || '#ff7eb6';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.add(G.tear(1.4, 10), { bone: 'back', p: add3(at, [0, 0.06, 0]), dir: [Math.cos(a), 0.55, Math.sin(a)], s: [0.06, 0.07, 0.02], color: i % 2 ? pc : shade(pc, 1.08) });
    }
    b.add(G.ell(0.04, 0.035, 0.04, 10, 8), { bone: 'back', p: add3(at, [0, 0.08, 0]), color: '#ffd23f' });
  } else if (kind === 'tree') {
    if (!b.has('back')) b.bone('back', 'body', back.p);
    b.add(G.cyl(0.04, 0.065, 0.24, 10), { bone: 'back', p: add3(back.p, [0, 0.1, 0]), color: '#8a5a35' });
    const fol = [[0, 0.32, 0, 0.17], [0.11, 0.25, 0.02, 0.12], [-0.11, 0.26, -0.03, 0.13], [0, 0.27, -0.12, 0.12]];
    fol.forEach(([x, y, z, r], i) => b.add(G.bumpy(r, r * 0.9, r, { amp: 0.08, freq: 5, seed: i }), { bone: 'back', p: add3(back.p, [x, y, z]), color: i % 2 ? (V.leafColor || '#5fae45') : shade(V.leafColor || '#5fae45', 1.15) }));
    b.add(G.ell(0.03, 0.03, 0.03, 8, 6), { bone: 'back', p: add3(back.p, [0.07, 0.38, 0.1]), color: V.flowerColor || '#ffb3d1' });
  } else if (kind === 'horns') {
    if (!head) return;
    const hc = hex(P.horn ?? 0xfff1d6);
    for (const sd of [1, -1]) {
      const hp = onSurface(head.c, head.r, sd * 26, 62, -0.02);
      b.add(G.tear(2.8, 10, 1.3), { bone: 'head', p: hp.p, dir: [0.35 * sd, 1, -0.35], s: [0.045 * hsz, 0.05 * hsz, 0.045 * hsz], color: hc });
    }
  } else if (kind === 'shell') {
    if (!head) return;
    const sc = V.shellColor || '#ffb3c7';
    const sp = onSurface(head.c, head.r, 30, 58, 0.0);
    for (let i = -2; i <= 2; i++) b.add(G.ell(0.025, 0.07, 0.02, 8, 8), { bone: 'head', p: add3(sp.p, [i * 0.022, 0.0, 0]), r: [0, 0, -i * 0.28], color: i % 2 ? sc : shade(sc, 1.1) });
    b.add(G.ell(0.03, 0.02, 0.025, 8, 6), { bone: 'head', p: add3(sp.p, [0, -0.05, 0]), color: shade(sc, 0.85) });
  } else if (kind === 'fins') {
    const fc = P.accent != null ? hex(P.accent) : C.belly;
    if (b.has('armL')) for (const sd of [1, -1]) b.add(G.tear(2, 10), { bone: sd > 0 ? 'armL' : 'armR', p: [0.29 * sd, 0.33, -0.01], dir: [sd * 0.6, 0.2, -1], roll: Math.PI / 2, s: [0.05, 0.06, 0.015], color: fc });
    else { if (!b.has('back')) b.bone('back', 'body', back.p); b.add(G.tear(2.2, 10), { bone: 'back', p: back.p, dir: [0, 1, -0.6], roll: Math.PI / 2, s: [0.08, 0.1, 0.02], color: fc }); }
  } else if (kind === 'plates') {
    if (!b.has('back')) b.bone('back', 'body', back.p);
    const pc = hex(P.accent ?? 0x8fe3ff);
    for (let i = 0; i < 3; i++) b.add(G.tear(2.6, 6, 1), { bone: 'back', p: add3(back.p, [0, -0.02, 0.1 - i * 0.13]), dir: [0, 1, -0.3], s: [0.06 - i * 0.008, 0.07 - i * 0.01, 0.025], color: i % 2 ? pc : '#d8fbff', glow: i === 1 });
  } else if (kind === 'armor') {
    const ac = shade(C.body, 0.7);
    if (!b.has('back')) b.bone('back', 'body', back.p);
    for (const sd of [1, -1]) b.add(G.bumpy(0.12, 0.07, 0.11, { amp: 0.12, freq: 3, seed: sd }), { bone: 'back', p: add3(back.p, [0.15 * sd, -0.06, 0.06]), r: [0, 0, 0.5 * sd], color: ac });
    b.add(G.bumpy(0.13, 0.06, 0.14, { amp: 0.12, freq: 3, seed: 7 }), { bone: 'back', p: add3(back.p, [0, 0.0, -0.05]), color: ac });
  } else if (kind === 'flames') {
    if (P.shape === 'bird') return; // legendary: wing-tip flames already
    if (!b.has('back')) b.bone('back', 'body', back.p);
    if (!b.has('flame')) b.bone('flame', 'back', back.p);
    const spots = P.extra?.includes?.('mane') ? [[0.12, 0.02, 0.05], [-0.12, 0.02, 0.05], [0, 0.08, -0.06]] : [[0.1, 0.0, 0.05], [-0.1, 0.0, 0.05], [0, 0.04, -0.08]];
    spots.forEach(([x, y, z], i) => {
      b.add(G.tear(2.4, 10), { bone: 'flame', p: add3(back.p, [x, y, z]), s: 0.06, color: i === 2 ? '#ff5a1a' : '#ff8a1c', glow: true });
      b.add(G.tear(2, 8), { bone: 'flame', p: add3(back.p, [x, y + 0.01, z + 0.025]), s: 0.035, color: '#ffe066', glow: true });
    });
    D.meta.flame = true;
  } else if (kind === 'mane') {
    if (!head) return;
    const mc = V.maneColor || C.belly;
    for (let i = 0; i < 9; i++) {
      const a = -150 + i * (300 / 8);
      if (Math.abs(a) < 30) continue;
      const mp = onSurface(head.c, head.r, a, 18 + Math.cos(a * Math.PI / 180) * 10, -0.03);
      b.add(G.tear(2.2, 10), { bone: 'head', p: mp.p, dir: mp.n.clone().add(new THREE.Vector3(0, 0.2, -0.6)).toArray(), s: [0.08 * hsz, 0.07 * hsz, 0.05 * hsz], color: i % 2 ? mc : shade(mc, 0.88) });
    }
  } else if (kind === 'spikes') {
    if (!b.has('back')) b.bone('back', 'body', back.p);
    for (let i = 0; i < 4; i++) b.add(G.tear(2.6, 8, 1.2), { bone: 'back', p: add3(back.p, [0, -0.02 - i * 0.02, 0.12 - i * 0.11]), dir: [0, 1, -0.5], s: [0.045 - i * 0.004, 0.05, 0.03], color: shade(C.body, 0.72) });
  } else if (kind === 'leafhat') {
    if (!b.has('back')) b.bone('back', 'body', back.p);
    const lc = shade(C.body, 1.25);
    b.add(G.ell(0.015, 0.06, 0.015, 6, 6), { bone: 'back', p: add3(back.p, [0, 0.03, 0]), color: '#5b7a2a' });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      b.add(G.tear(2.2, 12), { bone: 'back', p: add3(back.p, [0, 0.03, 0]), dir: [Math.cos(a), 0.45, Math.sin(a)], roll: 0, s: [0.1, 0.12, 0.025], color: i % 2 ? lc : shade(lc, 0.9) });
    }
  } else if (kind === 'acorn') {
    if (!head) return;
    b.add(G.ell(0.17 * hsz, 0.09 * hsz, 0.17 * hsz, 18, 10), { bone: 'head', p: add3(top, [0, 0.02, 0]), color: '#8a5a2b' });
    b.add(G.ell(0.025, 0.05, 0.025, 6, 6), { bone: 'head', p: add3(top, [0, 0.11 * hsz, 0]), color: '#5b3a1a' });
  } else if (kind === 'tusks') {
    if (!b.has('mouth')) return;
    const mp = b.abs[b.index.mouth].toArray();
    for (const sd of [1, -1]) b.add(G.box(0.03, 0.04, 0.012), { bone: 'mouth', p: add3(mp, [sd * 0.017, -0.02, 0.01]), color: '#ffffff', outline: false });
  } else if (kind === 'scarf') {
    if (!head) return;
    const sy = head.c[1] - head.r[1] * 0.85;
    b.add(G.torus(head.r[0] * 0.75, 0.04, Math.PI * 2, 8, 22), { p: [0, sy, head.c[2] - 0.02], r: [Math.PI / 2, 0, 0], color: '#e8434a' });
    b.add(G.ell(0.045, 0.1, 0.02, 10, 8), { p: [head.r[0] * 0.5, sy - 0.08, head.c[2] + head.r[2] * 0.5], r: [0.2, 0, 0.25], color: '#d23a40' });
  } else if (kind === 'icicles') {
    if (!b.has('back')) b.bone('back', 'body', back.p);
    for (let i = 0; i < 4; i++) b.add(G.tear(3, 6, 1), { bone: 'back', p: add3(back.p, [(i - 1.5) * 0.06, -0.02, -0.02 - Math.abs(i - 1.5) * 0.03]), dir: [(i - 1.5) * 0.3, 1, -0.3], s: [0.03, 0.035, 0.03], color: i % 2 ? '#bfefff' : '#e8fbff', glow: i === 1 });
  } else if (kind === 'crown') {
    const cc = P.crownColor != null ? hex(P.crownColor) : '#ffcc33';
    const at = add3(top, [0, 0.01, 0]);
    const t = b.has('head') ? 'head' : 'body';
    b.add(G.cyl(0.07 * hsz, 0.075 * hsz, 0.045 * hsz, 14), { bone: t, p: at, color: cc });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.add(G.tear(2.4, 6, 1), { bone: t, p: add3(at, [Math.sin(a) * 0.06 * hsz, 0.02, Math.cos(a) * 0.06 * hsz]), s: 0.018 * hsz, color: cc });
    }
    b.add(G.ell(0.018, 0.018, 0.01, 8, 6), { bone: t, p: add3(at, [0, 0.005, 0.075 * hsz]), color: '#ff4d6d', glow: true });
  } else if (kind === 'bolts') {
    if (!head) return;
    for (const sd of [1, -1]) {
      const bp = onSurface(head.c, head.r, sd * 82, 10, 0);
      b.add(G.box(0.025, 0.09, 0.05), { bone: 'head', p: bp.p, q: bp.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.6 * sd)), color: '#fff3a0', glow: true });
    }
  }
}
