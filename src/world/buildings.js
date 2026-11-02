// Sun/Moon style buildings, authored from rounded primitives into a shared Builder (merged per town
// cell later): chunky rounded walls on a stone plinth, thick roofs with overhang and white eave trim,
// bright doors with frames and porch steps, framed windows that glow at night, shutters, flower boxes,
// chimneys, awnings. Nine town styles (village, villa, city, jungle, stone, chalet, stilts, hut,
// adobe), the Centro Cura (red roof + white emblem), the Bottega (blue striped awning), the lab, the
// osteria, the Eclissi depot and the town landmarks.
import * as THREE from 'three';
import { Builder } from './builder.js';
import { rng } from '../core/math.js';

const WHITE = '#ffffff', TRIM = '#fffaf0', GLASS = '#bfe6ff', GLASS2 = '#9fd4f5';

/** Per-style look (wall/roof palettes and features). */
const STYLE = {
  village: { walls: ['#fff2d8', '#ffe6c2', '#fff7e8', '#ffeacc'], plinth: '#d8c6a4', roof: 'gable', pitch: 0.5, shutters: true, boxes: true, chimney: true },
  villa: { walls: ['#ffd9cc', '#ffe8c4', '#fde2ee', '#fff0dc'], plinth: '#e0c4a0', roof: 'hip', roofs: ['#e8674a', '#e8824a', '#d9654f'], pitch: 0.5, shutters: true, boxes: true, arches: true },
  city: { walls: ['#ffe8cf', '#e8f2ff', '#fff4d6', '#ffe0d6'], plinth: '#c8b8a8', roof: 'flat', balcony: true, awning: true },
  jungle: { walls: ['#c8915a', '#d29e66', '#bf8650'], plinth: '#8a6a4a', roof: 'thatch', roofs: ['#5bb06a', '#6fbf6a', '#c9a04a'], pitch: 0.75, planks: true, stilts: 0.5 },
  stone: { walls: ['#e2ddd4', '#d6d0c6', '#e8e2d8'], plinth: '#9a94a4', roof: 'gable', pitch: 0.75, stone: true, timber: true, chimney: true },
  chalet: { walls: ['#d9a56e', '#cf9862', '#e0ae78'], plinth: '#a8b4c4', roof: 'gable', pitch: 0.82, planks: true, snow: true, chimney: true, shutters: true },
  stilts: { walls: ['#e8f6ff', '#fff6e6', '#dff6f0', '#ffe9e0'], plinth: '#b98552', roof: 'gable', pitch: 0.5, planks: true, stilts: 1.1, shutters: true },
  hut: { walls: ['#e8c890', '#f0d4a0', '#dcb880'], plinth: '#7a6a72', roof: 'cone', roofs: ['#d8b060', '#c9a050', '#e0bc6a'], round: true },
  adobe: { walls: ['#f4d8b4', '#ecc89c', '#f8dcc0'], plinth: '#d49c64', roof: 'adobe', vigas: true },
};

/** Base frame for a building: pushes its transform on the builder (door faces local +z). */
function frame(b, def, heightAt) {
  const y = def.y ?? heightAt?.(def.x, def.z) ?? 0;
  b.at(def.x, def.z);
  b.push(def.x, y, def.z, def.facing || 0);
  return y;
}

function door(b, x, z, y, col, { w = 1.1, h = 2.0, frameCol = TRIM, round = true, awning = null, step = true } = {}) {
  b.box(w + 0.32, h + 0.2, 0.14, x, y + h / 2 + 0.05, z + 0.02, frameCol, { round: 0.06 });
  b.box(w, h, 0.16, x, y + h / 2, z + 0.06, col, { round: round ? 0.12 : 0.03 });
  b.box(w * 0.36, h * 0.22, 0.04, x - w * 0.2, y + h * 0.66, z + 0.15, GLASS, { mat: 'windows', round: 0.04 });
  b.sphere(0.06, x + w * 0.32, y + h * 0.48, z + 0.17, '#ffd23f');
  if (step) b.box(w + 0.6, 0.18, 0.7, x, y + 0.09, z + 0.35, '#e6dccb', { round: 0.06 });
  if (awning) b.box(w + 0.7, 0.14, 0.75, x, y + h + 0.32, z + 0.38, awning, { round: 0.06, rx: 0.22 });
}

function window_(b, x, y, z, { w = 0.9, h = 0.95, frameCol = TRIM, shutter = null, box = null, round = false, flowers } = {}) {
  b.box(w + 0.2, h + 0.2, 0.12, x, y, z + 0.02, frameCol, { round: round ? Math.min(w, h) * 0.45 : 0.06 });
  b.box(w, h, 0.1, x, y, z + 0.07, GLASS, { mat: 'windows', round: round ? Math.min(w, h) * 0.42 : 0.04, grad: 0.25 });
  if (!round) { b.box(0.06, h, 0.04, x, y, z + 0.12, frameCol); b.box(w, 0.06, 0.04, x, y, z + 0.12, frameCol); }
  if (shutter) for (const s of [-1, 1]) b.box(w * 0.48, h + 0.12, 0.07, x + s * (w * 0.5 + 0.3), y, z + 0.05, shutter, { round: 0.04 });
  if (box) {
    b.box(w + 0.3, 0.24, 0.36, x, y - h / 2 - 0.2, z + 0.2, box, { round: 0.06 });
    for (let k = 0; k < 4; k++) b.sphere(0.13, x - w / 2 + 0.05 + k * (w / 3), y - h / 2 - 0.02, z + 0.24, flowers[k % flowers.length], { grad: 0 });
    for (let k = 0; k < 3; k++) b.sphere(0.11, x - w / 2 + 0.2 + k * (w / 3), y - h / 2 - 0.07, z + 0.3, '#5cb848', { grad: 0.2 });
  }
}

/** Gable / hip / flat / thatch / cone / adobe roof over a w×d box of wall height H (local frame). */
function roof(b, kind, w, d, H, col, S, R, { snow = false } = {}) {
  const ov = 0.4, pitch = S.pitch || 0.6;
  if (kind === 'gable' || kind === 'hip' || kind === 'thatch') {
    const hd = d / 2 + ov, rise = hd * Math.tan(pitch), len = hd / Math.cos(pitch) + 0.1, th = kind === 'thatch' ? 0.5 : 0.34;
    const ww = w + ov * 2 + (kind === 'hip' ? -0.2 : 0);
    // gable ends (wall-coloured triangles)
    const eh = rise * (1 - (d / 2) / hd);
    b.extrude([[-d / 2, 0], [d / 2, 0], [d / 2, eh], [0, rise], [-d / 2, eh]], w - 0.04, 0, H, 0, S.wallCol, { ry: Math.PI / 2 });
    for (const s of [1, -1]) {
      b.box(ww, th, len, 0, H + rise / 2 + th * 0.3, s * hd / 2, col, { rx: s * pitch, round: 0.12, grad: 0.22 });
      if (kind !== 'thatch') b.box(ww + 0.06, 0.1, 0.16, 0, H - 0.02 + th * 0.2, s * (hd - 0.02), TRIM, { round: 0.04 });   // eave trim
      if (snow) b.box(ww - 0.1, 0.18, len * 0.85, 0, H + rise / 2 + th * 0.62 + 0.08, s * hd / 2 * 0.92, '#f6fbff', { rx: s * pitch, round: 0.09 });
    }
    b.cyl(0.2, 0.2, ww + 0.1, 0, H + rise + th * 0.45, 0, kind === 'thatch' ? '#8a6a3a' : shade(col, 0.82), { rz: Math.PI / 2, seg: 8 });   // ridge
    return H + rise;
  }
  if (kind === 'flat') {
    b.box(w + 0.5, 0.36, d + 0.5, 0, H + 0.18, 0, shade(col, 0.95), { round: 0.12 });
    b.box(w + 0.3, 0.42, 0.22, 0, H + 0.5, d / 2 + 0.1, S.wallCol, { round: 0.08 });
    b.box(w + 0.3, 0.42, 0.22, 0, H + 0.5, -d / 2 - 0.1, S.wallCol, { round: 0.08 });
    b.box(0.22, 0.42, d + 0.3, w / 2 + 0.1, H + 0.5, 0, S.wallCol, { round: 0.08 });
    b.box(0.22, 0.42, d + 0.3, -w / 2 - 0.1, H + 0.5, 0, S.wallCol, { round: 0.08 });
    // rooftop clutter: water tank, vent, little garden
    const tx = (R() - 0.5) * w * 0.5;
    b.cyl(0.5, 0.5, 0.9, tx, H + 0.85, -d * 0.18, '#9fb4c4', { seg: 10 }); b.cone(0.55, 0.3, tx, H + 1.45, -d * 0.18, '#7f94a4', { seg: 10 });
    b.box(0.6, 0.4, 0.6, -tx, H + 0.55, d * 0.12, '#d8d8e0', { round: 0.06 });
    return H + 0.7;
  }
  if (kind === 'cone') {
    const r = Math.max(w, d) / 2 + 0.7;
    b.cone(r, 2.6, 0, H + 1.3, 0, col, { seg: 12, grad: 0.3 });
    b.cone(r * 0.25, 0.8, 0, H + 2.7, 0, shade(col, 0.8), { seg: 8 });
    b.torus(r - 0.15, 0.12, 0, H + 0.12, 0, shade(col, 0.75), { rx: Math.PI / 2 });
    return H + 3;
  }
  if (kind === 'adobe') {
    b.box(w + 0.2, 0.3, d + 0.2, 0, H + 0.15, 0, shade(S.wallCol, 0.92), { round: 0.14 });
    b.box(w + 0.2, 0.5, 0.3, 0, H + 0.4, d / 2, S.wallCol, { round: 0.14 });
    for (let k = -2; k <= 2; k++) b.cyl(0.09, 0.09, 0.8, k * w / 5.5, H - 0.25, d / 2 + 0.15, '#8a5a36', { rx: Math.PI / 2, seg: 6 });   // vigas
    return H + 0.6;
  }
  return H;
}

function shade(c, k) { return '#' + new THREE.Color(c).multiplyScalar(k).getHexString(); }

/** Generic shell: plinth, walls (rect or round), roof, return wall height. */
function shell(b, w, d, H, S, wallCol, roofCol, R, o = {}) {
  const lift = S.stilts || 0;
  if (lift) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.14, 0.17, lift + 0.6, sx * (w / 2 - 0.3), lift / 2 - 0.3, sz * (d / 2 - 0.3), '#8a5a36', { seg: 6 });
    b.box(w + 0.7, 0.2, d + 0.9, 0, lift, 0.25, '#c08c58', { round: 0.05 });         // deck
    b.box(1.3, lift, 0.9, 0, lift / 2, d / 2 + 1.0, '#b07c4a', { round: 0.05, rx: -0.5 });   // ramp
  } else {
    b.box(w + 0.3, 0.75, d + 0.3, 0, -0.18, 0, S.plinth, { round: 0.12 });
  }
  const y0 = lift ? lift + 0.1 : 0.15;
  b.push(0, y0, 0);
  if (S.round) {
    b.cyl(w / 2, w / 2 + 0.05, H, 0, H / 2, 0, wallCol, { seg: 16, grad: 0.12 });
  } else {
    b.box(w, H, d, 0, H / 2, 0, wallCol, { round: 0.22, grad: 0.1 });
    if (S.stone) for (let k = 0; k < 14; k++) b.box(0.5 + R() * 0.4, 0.28, 0.06, (R() - 0.5) * (w - 1), 0.3 + R() * (H - 0.6), d / 2 + 0.01, shade(wallCol, 0.86), { round: 0.08 });
    if (S.planks) for (let k = 1; k < Math.floor(H / 0.45); k++) { b.box(w + 0.02, 0.05, 0.03, 0, k * 0.45, d / 2 + 0.005, shade(wallCol, 0.84)); b.box(0.03, 0.05, d + 0.02, w / 2 + 0.005, k * 0.45, 0, shade(wallCol, 0.84)); b.box(0.03, 0.05, d + 0.02, -w / 2 - 0.005, k * 0.45, 0, shade(wallCol, 0.84)); }
    if (S.timber) { for (const sx of [-1, 1]) b.box(0.16, H, 0.08, sx * (w / 2 - 0.1), H / 2, d / 2 + 0.02, '#6a4a3a'); b.box(w, 0.16, 0.08, 0, H - 0.1, d / 2 + 0.02, '#6a4a3a'); }
    // corner pillars (soft, darker) give the chunky toy look
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.26, H, 0.26, sx * (w / 2 - 0.04), H / 2, sz * (d / 2 - 0.04), shade(wallCol, 0.93), { round: 0.1 });
  }
  S.wallCol = wallCol;
  const top = roof(b, o.roof || S.roof, w, d, H, roofCol, S, R, { snow: S.snow });
  b.pop();
  return { y0, top: top + y0 };
}

/**
 * House (also the player's home). def: {builder?, x, z, w, d, facing, style, colors, seed, storeys, colorIdx, kind, heightAt}
 * Returns {object?} when no builder was given; otherwise adds colliders to def.builder.
 */
export function buildHouse(ctx, def) {
  const own = !def.builder;
  const b = def.builder || new Builder({ seed: 'house' + def.seed, groundAt: def.heightAt });
  const S = { ...STYLE[def.style] || STYLE.village };
  const R = rng(def.seed || 1);
  const C = def.colors || {};
  const roofs = S.roofs || C.roofs || ['#e8674a', '#2fa8a0', '#f5b83d', '#9b7fd1'];
  const wallCol = R.pick(S.walls);
  const roofCol = def.kind === 'home' ? '#3f7fd9' : roofs[(def.colorIdx || 0) % roofs.length];
  const doorCol = def.kind === 'home' ? '#e8474a' : R.pick(C.door || ['#3fa6d9', '#e8674a', '#f5b83d', '#7fc24a', '#9b7fd1']);
  const flowers = C.flowers || ['#ff5f9e', '#ffd23f', '#ffffff'];
  const w = def.w, d = def.d, storeys = def.storeys || 1;
  const H = storeys === 2 ? 5.2 : S.round ? 2.8 : 3.0;
  frame(b, def, def.heightAt);
  const { y0 } = shell(b, w, d, H, S, wallCol, roofCol, R);
  const fz = (S.round ? w / 2 : d / 2) + 0.02;
  door(b, 0, fz, y0, doorCol, { awning: S.awning || storeys === 2 ? R.pick(['#e8674a', '#2fa8a0', '#f5b83d']) : null, frameCol: S.stone ? '#c8c0b8' : TRIM });
  const wy = y0 + 1.75, shut = S.shutters ? shade(doorCol, 0.95) : null, box = S.boxes || def.kind === 'home' ? '#b97b47' : null;
  if (S.round) {
    window_(b, -w * 0.3, wy, fz - 0.35, { w: 0.6, h: 0.6, round: true });
    window_(b, w * 0.3, wy, fz - 0.35, { w: 0.6, h: 0.6, round: true });
  } else {
    for (const sx of [-1, 1]) window_(b, sx * (w / 2 - 1.35), wy, d / 2, { shutter: shut, box, flowers, round: S.arches && sx > 0 });
    // side windows
    b.push(w / 2, 0, 0, Math.PI / 2); window_(b, 0, wy, 0, { w: 0.8, h: 0.8, round: true }); b.pop();
    b.push(-w / 2, 0, 0, -Math.PI / 2); window_(b, 0, wy, 0, { w: 0.8, h: 0.8, shutter: shut }); b.pop();
    if (storeys === 2) {
      for (const sx of [-1, 0, 1]) window_(b, sx * (w / 2 - 1.3) * (sx ? 1 : 0), y0 + 3.9, d / 2, { w: 0.8, h: 1.0 });
      if (S.balcony) { b.box(w * 0.55, 0.14, 0.9, 0, y0 + 3.0, d / 2 + 0.45, '#e6dccb', { round: 0.05 }); for (let k = 0; k < 7; k++) b.box(0.06, 0.6, 0.06, -w * 0.26 + k * w * 0.087, y0 + 3.35, d / 2 + 0.85, WHITE); b.box(w * 0.55, 0.08, 0.08, 0, y0 + 3.66, d / 2 + 0.85, WHITE); }
    }
  }
  if (S.chimney) { b.box(0.6, 1.6, 0.6, w * 0.28, y0 + H + 1.0, -d * 0.18, S.stone ? '#a8a2b4' : '#d98a6a', { round: 0.08 }); b.box(0.72, 0.18, 0.72, w * 0.28, y0 + H + 1.85, -d * 0.18, '#8a7a7a', { round: 0.05 }); }
  if (S.vigas) b.box(1.6, 0.12, 0.8, 0, y0 + 2.3, d / 2 + 0.4, '#8a5a36', { round: 0.04 });
  // wall lamp by the door (glows at night)
  b.box(0.12, 0.3, 0.12, 0.95, y0 + 2.2, fz + 0.1, '#5a4a4a', { round: 0.03 });
  b.sphere(0.13, 0.95, y0 + 2.05, fz + 0.2, '#ffd98a', { mat: 'glow', grad: 0 });
  b.glow(0.95, y0 + 2.05, fz + 0.3, '#ffc070', 0.8, 'wall');
  b.rect(0, 0, w / 2 + 0.05, d / 2 + 0.05, 0, 'building');
  if (S.stilts) b.rect(0, 0.35, w / 2 + 0.4, d / 2 + 0.5, 0, 'building');
  b.pop();
  return own ? { object: b.build(ctx.worldMats?.forBuilder?.() || { solid: ctx.toon.matVC() }), colliders: b.colliders } : { colliders: b.colliders };
}

/** Centro Cura: red roof, white walls, glass doors, big white emblem with a red cross. */
export function buildCenter(ctx, def) {
  const own = !def.builder;
  const b = def.builder || new Builder({ seed: 'center', groundAt: def.heightAt });
  const w = def.w, d = def.d, H = 3.6;
  frame(b, def, def.heightAt);
  b.box(w + 0.4, 0.75, d + 0.4, 0, -0.18, 0, '#e6dccb', { round: 0.12 });
  b.push(0, 0.15, 0);
  b.box(w, H, d, 0, H / 2, 0, '#fffaf2', { round: 0.3, grad: 0.08 });
  b.box(w + 0.04, 0.7, d + 0.04, 0, 0.35, 0, '#e8474a', { round: 0.2 });                     // red skirt band
  // roof: thick rounded red slab with a soft dome on top
  b.box(w + 1.0, 0.55, d + 1.0, 0, H + 0.25, 0, '#e8474a', { round: 0.26, grad: 0.15 });
  b.box(w + 1.06, 0.12, d + 1.06, 0, H - 0.06, 0, WHITE, { round: 0.05 });
  b.dome(1, 0, H + 0.5, 0, '#ff5a5a', { sx: w * 0.36, sy: 1.0, sz: d * 0.36, grad: 0.2 });
  // emblem: white disc + red cross, on a front sign
  b.cyl(1.05, 1.05, 0.2, 0, H + 0.9, d / 2 + 0.25, WHITE, { rx: Math.PI / 2, seg: 20 });
  b.box(1.0, 0.32, 0.08, 0, H + 0.9, d / 2 + 0.38, '#e8474a', { round: 0.04 });
  b.box(0.32, 1.0, 0.08, 0, H + 0.9, d / 2 + 0.38, '#e8474a', { round: 0.04 });
  b.torus(1.05, 0.08, 0, H + 0.9, d / 2 + 0.25, '#e8474a', {});
  // glass doors + canopy
  b.box(2.6, 2.4, 0.12, 0, 1.2, d / 2 + 0.04, '#d8d8e0', { round: 0.05 });
  b.box(1.15, 2.2, 0.1, -0.62, 1.12, d / 2 + 0.1, GLASS2, { mat: 'windows', round: 0.04 });
  b.box(1.15, 2.2, 0.1, 0.62, 1.12, d / 2 + 0.1, GLASS2, { mat: 'windows', round: 0.04 });
  b.box(3.4, 0.2, 1.4, 0, 2.75, d / 2 + 0.7, '#e8474a', { round: 0.08 });
  b.box(3.6, 0.2, 1.2, 0, 0.0, d / 2 + 0.75, '#e6dccb', { round: 0.06 });
  for (const sx of [-1, 1]) { window_(b, sx * (w / 2 - 1.6), 1.9, d / 2, { w: 1.7, h: 1.2 }); b.box(0.5, 0.5, 0.5, sx * 2.2, 0.25, d / 2 + 0.6, '#e8474a', { round: 0.12 }); b.sphere(0.42, sx * 2.2, 0.75, d / 2 + 0.6, '#5cb848', { grad: 0.3 }); }
  b.sphere(0.16, 1.6, 2.4, d / 2 + 0.2, '#fff2c0', { mat: 'glow' }); b.sphere(0.16, -1.6, 2.4, d / 2 + 0.2, '#fff2c0', { mat: 'glow' });
  b.glow(0, 2.5, d / 2 + 0.6, '#ffe0b0', 1.4, 'door');
  b.pop();
  b.rect(0, 0, w / 2 + 0.1, d / 2 + 0.1, 0, 'building');
  b.pop();
  return own ? { object: b.build(ctx.worldMats?.forBuilder?.() || { solid: ctx.toon.matVC() }), colliders: b.colliders } : { colliders: b.colliders };
}

/** Bottega: teal/blue roof, striped blue awning over display windows, a sign with a bag icon. */
export function buildShop(ctx, def) {
  const own = !def.builder;
  const b = def.builder || new Builder({ seed: 'shop', groundAt: def.heightAt });
  const w = def.w, d = def.d, H = 3.2;
  const S = { ...STYLE[def.style] || STYLE.village };
  frame(b, def, def.heightAt);
  b.box(w + 0.3, 0.75, d + 0.3, 0, -0.18, 0, S.plinth || '#d8c6a4', { round: 0.12 });
  b.push(0, 0.15, 0);
  b.box(w, H, d, 0, H / 2, 0, '#f2fbff', { round: 0.26, grad: 0.08 });
  b.box(w + 0.04, 0.6, d + 0.04, 0, 0.3, 0, '#3fa6d9', { round: 0.18 });
  S.wallCol = '#f2fbff';
  roof(b, def.style === 'city' || def.style === 'adobe' ? 'flat' : 'gable', w, d, H, '#2f86c9', { ...S, pitch: 0.45 }, rng(7));
  // striped awning
  const n = 8, aw = w + 0.4;
  for (let k = 0; k < n; k++) b.box(aw / n + 0.01, 0.12, 1.5, -aw / 2 + (k + 0.5) * aw / n, 2.75, d / 2 + 0.62, k % 2 ? WHITE : '#3fa6d9', { rx: 0.36, round: 0.03 });
  for (let k = 0; k < n; k++) b.sphere(aw / n * 0.5, -aw / 2 + (k + 0.5) * aw / n, 2.42, d / 2 + 1.32, k % 2 ? WHITE : '#3fa6d9', { sy: 0.45, sz: 0.3 });
  door(b, 0, d / 2 + 0.02, 0, '#3fa6d9', { step: true });
  for (const sx of [-1, 1]) { window_(b, sx * (w / 2 - 1.55), 1.35, d / 2, { w: 1.6, h: 1.25 }); b.box(1.6, 0.35, 0.5, sx * (w / 2 - 1.55), 0.55, d / 2 + 0.3, '#b97b47', { round: 0.05 }); for (let k = 0; k < 3; k++) b.sphere(0.17, sx * (w / 2 - 1.55) - 0.5 + k * 0.5, 0.86, d / 2 + 0.3, ['#ff8a5c', '#ffd23f', '#7fc24a'][k]); }
  // sign with a shopping bag
  b.box(2.4, 0.8, 0.14, 0, H + 0.15, d / 2 + 0.22, WHITE, { round: 0.12 });
  b.box(0.6, 0.48, 0.1, 0, H + 0.08, d / 2 + 0.3, '#3fa6d9', { round: 0.08 });
  b.torus(0.17, 0.04, 0, H + 0.36, d / 2 + 0.3, '#3fa6d9', { arc: Math.PI });
  b.glow(0, 2.4, d / 2 + 0.8, '#ffe0b0', 1.1, 'door');
  b.pop();
  b.rect(0, 0, w / 2 + 0.1, d / 2 + 0.1, 0, 'building');
  b.pop();
  return own ? { object: b.build(ctx.worldMats?.forBuilder?.() || { solid: ctx.toon.matVC() }), colliders: b.colliders } : { colliders: b.colliders };
}

/** Professor's lab (wide, white with a teal roof, observatory dome, windmill antenna). */
export function buildLab(ctx, def) {
  const b = def.builder;
  const w = def.w, d = def.d, H = 3.6;
  frame(b, def, def.heightAt);
  b.box(w + 0.4, 0.75, d + 0.4, 0, -0.18, 0, '#d8d4cc', { round: 0.12 });
  b.push(0, 0.15, 0);
  b.box(w, H, d, 0, H / 2, 0, '#fbfdff', { round: 0.3, grad: 0.08 });
  b.box(w + 0.04, 0.5, d + 0.04, 0, 0.25, 0, '#2fa8a0', { round: 0.15 });
  b.box(w + 0.8, 0.45, d + 0.8, 0, H + 0.2, 0, '#2fa8a0', { round: 0.22, grad: 0.15 });
  b.cyl(1.8, 1.9, 1.1, w * 0.25, H + 0.95, -d * 0.1, '#e8eef4', { seg: 18 });
  b.dome(1.8, w * 0.25, H + 1.5, -d * 0.1, '#9fd4f5', { grad: 0.2 });
  b.box(0.5, 0.9, 1.8, w * 0.25, H + 2.2, -d * 0.1, '#5a6a7a', { round: 0.1, rx: 0.5 });
  b.cyl(0.07, 0.07, 3, -w * 0.32, H + 1.7, -d * 0.2, '#c8c8d0', { seg: 6 });
  for (let k = 0; k < 4; k++) b.box(0.18, 1.1, 0.05, -w * 0.32, H + 3.2, -d * 0.2 + 0.08, WHITE, { rz: k * Math.PI / 2, round: 0.05 });
  b.sphere(0.12, -w * 0.32, H + 3.2, -d * 0.2 + 0.12, '#e8474a');
  door(b, 0, d / 2 + 0.02, 0, '#2fa8a0', { w: 1.6, awning: '#2fa8a0' });
  for (const sx of [-1, 1]) for (const k of [0, 1]) window_(b, sx * (2.3 + k * 2.4), 1.9, d / 2, { w: 1.6, h: 1.3 });
  b.glow(0, 2.4, d / 2 + 0.6, '#ffe0b0', 1.1, 'door');
  b.pop();
  b.rect(0, 0, w / 2 + 0.1, d / 2 + 0.1, 0, 'building');
  b.pop();
  return { colliders: b.colliders };
}

/** Osteria: warm walls, tiled roof, a pergola with string lights and two outdoor tables. */
export function buildOsteria(ctx, def) {
  const b = def.builder;
  const R = rng(def.seed || 3);
  const w = def.w, d = def.d, H = 3.2;
  const S = { ...STYLE[def.style] || STYLE.village };
  frame(b, def, def.heightAt);
  const { y0 } = shell(b, w, d, H, { ...S, stilts: 0, round: false }, '#ffd9a8', '#c8553a', R, { roof: S.roof === 'flat' || S.roof === 'adobe' || S.roof === 'cone' || S.roof === 'thatch' ? 'gable' : S.roof });
  door(b, -1.4, d / 2 + 0.02, y0, '#8a4a2a', { w: 1.2, awning: '#c8553a' });
  window_(b, 1.7, y0 + 1.7, d / 2, { w: 1.6, h: 1.0, shutter: '#2fa8a0', box: '#8a5a36', flowers: ['#ff5f9e', '#ffffff'] });
  // sign: a wine glass
  b.box(0.12, 0.12, 1.0, -w / 2 + 0.3, y0 + 2.6, d / 2 + 0.5, '#5a4a3a');
  b.box(0.9, 0.7, 0.08, -w / 2 + 0.3, y0 + 2.15, d / 2 + 0.95, '#f5e6c8', { round: 0.1, ry: Math.PI / 2 });
  b.cone(0.18, 0.25, -w / 2 + 0.3, y0 + 2.25, d / 2 + 0.95, '#a8203a', { rx: Math.PI });
  // pergola
  const pz = d / 2 + 2.1;
  for (const sx of [-1, 1]) for (const sz of [0, 1]) b.cyl(0.08, 0.08, 2.5, sx * (w / 2 - 0.3), 1.25, pz - 1.6 + sz * 2.4, '#8a5a36', { seg: 6 });
  for (let k = 0; k < 5; k++) b.box(0.1, 0.1, 2.8, -w / 2 + 0.3 + k * (w - 0.6) / 4, 2.5, pz - 0.4, '#9a6a43');
  for (let k = 0; k < 9; k++) { const x = -w / 2 + 0.4 + k * (w - 0.8) / 8; b.sphere(0.07, x, 2.32 - Math.sin(k / 8 * Math.PI) * 0.2, pz + 0.75, ['#ffd98a', '#ffb0c8', '#bfe6ff'][k % 3], { mat: 'glow' }); }
  b.glow(0, 2.2, pz, '#ffc070', 1.6, 'pergola');
  for (const sx of [-1, 1]) {
    b.cyl(0.55, 0.55, 0.07, sx * 1.6, 0.76, pz, '#ffffff', { seg: 12 }); b.cyl(0.06, 0.06, 0.75, sx * 1.6, 0.38, pz, '#5a4a3a', { seg: 6 });
    for (const s2 of [-1, 1]) b.box(0.4, 0.45, 0.4, sx * 1.6 + s2 * 0.75, 0.23, pz, '#b97b47', { round: 0.06 });
  }
  b.pop();
  b.rect(0, 0, w / 2 + 0.05, d / 2 + 0.05, 0, 'building');
  b.pop();
  return { colliders: b.colliders };
}

/** Eclissi depot: ribbed grey-violet warehouse, big rolling shutter, purple trim. */
export function buildDepot(ctx, def) {
  const b = def.builder;
  const w = def.w, d = def.d, H = 4.2;
  frame(b, def, def.heightAt);
  b.box(w + 0.4, 0.75, d + 0.4, 0, -0.18, 0, '#8a8494', { round: 0.08 });
  b.push(0, 0.15, 0);
  b.box(w, H, d, 0, H / 2, 0, '#a8a2b8', { round: 0.12, grad: 0.15 });
  for (let k = 0; k < 14; k++) b.box(0.12, H - 0.2, 0.1, -w / 2 + 0.4 + k * (w - 0.8) / 13, H / 2, d / 2 + 0.03, '#948ea6');
  b.box(w + 0.6, 0.3, d + 0.6, 0, H + 0.2, 0, '#5b3a8a', { round: 0.1 });
  for (const s of [1, -1]) b.box(w + 0.6, 0.25, d / 2 + 0.6, 0, H + 0.55, s * (d / 4 + 0.1), '#6f6888', { rx: s * 0.28, round: 0.06 });
  b.box(4.2, 3.2, 0.16, 0, 1.6, d / 2 + 0.1, '#6f6888', { round: 0.05 });
  for (let k = 0; k < 9; k++) b.box(4.0, 0.06, 0.06, 0, 0.3 + k * 0.33, d / 2 + 0.2, '#5a5470');
  b.box(4.6, 0.3, 0.3, 0, 3.3, d / 2 + 0.2, '#5b3a8a', { round: 0.05 });
  // eclipse sign: dark disc with a gold ring
  b.cyl(0.8, 0.8, 0.12, 0, H - 0.3, d / 2 + 0.25, '#2a2140', { rx: Math.PI / 2, seg: 18 });
  b.torus(0.8, 0.08, 0, H - 0.3, d / 2 + 0.3, '#ffc93c', {});
  b.sphere(0.12, 2.6, 3.0, d / 2 + 0.3, '#c8a8ff', { mat: 'glow' }); b.sphere(0.12, -2.6, 3.0, d / 2 + 0.3, '#c8a8ff', { mat: 'glow' });
  b.pop();
  b.rect(0, 0, w / 2 + 0.1, d / 2 + 0.1, 0, 'building');
  b.pop();
  return { colliders: b.colliders };
}

/**
 * Landmark at the plaza centre. def: {builder, x, z, kind, heightAt, colors}
 * kinds: well gazebo fountain bigtree castle crystal lighthouse totem arch
 */
export function buildLandmark(ctx, def) {
  const own = !def.builder;
  const b = def.builder || new Builder({ seed: 'lm', groundAt: def.heightAt });
  const C = def.colors || {};
  const R = rng('lm' + def.kind);
  const y = def.heightAt?.(def.x, def.z) ?? 0;
  b.at(def.x, def.z); b.push(def.x, y, def.z, def.facing || 0);
  const k = def.kind;
  const stone = '#d8cfc0', stone2 = '#c4b8a6';
  if (k === 'well') {
    b.cyl(1.45, 1.55, 0.95, 0, 0.45, 0, stone, { seg: 16, grad: 0.2 });
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; b.box(0.62, 0.36, 0.3, Math.sin(a) * 1.5, 0.75, Math.cos(a) * 1.5, i % 2 ? stone2 : stone, { ry: a, round: 0.1 }); }
    b.cyl(1.22, 1.22, 0.06, 0, 0.8, 0, '#3fa0c8', { seg: 16, mat: 'glow' });
    for (const s of [-1, 1]) b.cyl(0.1, 0.12, 2.3, s * 1.25, 1.6, 0, '#9a6a43', { seg: 6 });
    b.cyl(0.08, 0.08, 2.7, 0, 2.5, 0, '#8a5a36', { rz: Math.PI / 2, seg: 6 });
    b.box(3.4, 0.22, 1.8, 0, 2.95, 0.42, '#e8674a', { rx: 0.5, round: 0.08 }); b.box(3.4, 0.22, 1.8, 0, 2.95, -0.42, '#e8674a', { rx: -0.5, round: 0.08 });
    b.cyl(0.22, 0.18, 0.35, 0.3, 2.05, 0, '#b97b47', { seg: 8 });
    b.circle(0, 0, 1.7);
  } else if (k === 'gazebo') {
    b.cyl(3.3, 3.4, 0.35, 0, 0.17, 0, '#f2e6d8', { seg: 8 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; b.cyl(0.13, 0.13, 2.6, Math.sin(a) * 2.9, 1.65, Math.cos(a) * 2.9, WHITE, { seg: 8 }); if (i !== 0) b.box(2.1, 0.08, 0.08, Math.sin(a + 0.39) * 2.75, 1.0, Math.cos(a + 0.39) * 2.75, WHITE, { ry: a + 0.39 + Math.PI / 2 }); }
    b.cone(3.8, 1.8, 0, 3.8, 0, '#e8824a', { seg: 8, grad: 0.25 }); b.sphere(0.25, 0, 4.8, 0, '#ffd23f');
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; b.sphere(0.2, Math.sin(a) * 3.3, 2.9, Math.cos(a) * 3.3, ['#ff5f9e', '#ffffff', '#ffd23f'][i % 3], { grad: 0 }); }
    for (let i = 1; i < 8; i++) { const a = i / 8 * Math.PI * 2; b.circle(Math.sin(a) * 2.9, Math.cos(a) * 2.9, 0.3); }
  } else if (k === 'fountain') {
    b.cyl(4.0, 4.15, 0.6, 0, 0.3, 0, stone, { seg: 24, grad: 0.15 });
    b.torus(4.0, 0.25, 0, 0.62, 0, stone2, { rx: Math.PI / 2 });
    b.cyl(3.75, 3.75, 0.05, 0, 0.5, 0, '#4fd0e0', { seg: 24, mat: 'glow' });
    b.cyl(0.5, 0.75, 1.6, 0, 1.2, 0, stone, { seg: 12 });
    b.cyl(1.5, 1.0, 0.35, 0, 2.05, 0, stone2, { seg: 16 });
    b.cyl(1.35, 1.35, 0.05, 0, 2.2, 0, '#6fe0f0', { seg: 16, mat: 'glow' });
    b.cyl(0.25, 0.35, 0.9, 0, 2.6, 0, stone, { seg: 10 });
    b.sphere(0.45, 0, 3.25, 0, '#9fe8ff', { mat: 'glow', sy: 1.3 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.sphere(0.22, Math.sin(a) * 1.15, 2.35, Math.cos(a) * 1.15, '#bff4ff', { mat: 'glow', sy: 0.6 }); }
    b.circle(0, 0, 4.2);
  } else if (k === 'bigtree') {
    b.cyl(1.2, 2.0, 7, 0, 3.5, 0, '#8a5e3c', { seg: 12, grad: 0.35 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.cone(0.6, 2.6, Math.sin(a) * 1.8, 0.9, Math.cos(a) * 1.8, '#7a5234', { seg: 6, rx: Math.cos(a) * 0.9, rz: -Math.sin(a) * 0.9 }); }
    b.sphere(4.6, 0, 9.0, 0, C.leafDark || '#3f9a3e', { sy: 0.62, grad: 0.4 });
    b.sphere(3.4, 2.6, 8.4, 1.4, C.leaf || '#5cb848', { sy: 0.65, grad: 0.35 }); b.sphere(3.2, -2.6, 8.6, -1.2, C.leaf || '#5cb848', { sy: 0.65, grad: 0.35 });
    b.sphere(2.6, 0.4, 10.8, -0.3, C.leaf2 || '#7fd05a', { sy: 0.65, grad: 0.25 });
    for (let i = 0; i < 10; i++) { const a = i * 0.63; b.sphere(0.14, Math.sin(a) * 4, 7.0 + (i % 3) * 0.6, Math.cos(a) * 3.8, '#ffe28a', { mat: 'glow' }); }
    b.box(1.3, 1.8, 0.2, 0, 1.0, 1.9, '#4a3020', { round: 0.4, rx: -0.18 });
    b.circle(0, 0, 3.6);
  } else if (k === 'castle') {
    const sc = '#bcb6c8', sc2 = '#a8a2b4';
    for (const [x, z, r, h] of [[-4, -2, 1.6, 6.5], [4, -2.5, 1.4, 4.8], [0, -5, 1.8, 8]]) {
      b.cyl(r, r + 0.2, h, x, h / 2, z, sc, { seg: 12, grad: 0.3 });
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.box(0.5, 0.6, 0.5, x + Math.sin(a) * r, h + 0.3, z + Math.cos(a) * r, sc2, { round: 0.08, ry: a }); }
      window_(b, x, h * 0.62, z + r - 0.05, { w: 0.5, h: 0.9, round: true, frameCol: sc2 });
    }
    b.box(8, 3.4, 1.2, 0, 1.7, -2.6, sc2, { round: 0.2 });
    b.box(1.8, 2.4, 0.3, 0, 1.2, -1.95, '#4a3a5a', { round: 0.5 });
    for (let i = 0; i < 9; i++) b.rock(0.5 + R() * 0.5, (R() - 0.5) * 9, 0.2, 0.5 + R() * 2, sc, { variant: i });
    b.cone(0.9, 1.6, 0, 8.8, -5, '#7f6fb8', { seg: 10 });
    b.cyl(0.04, 0.04, 1.4, 0, 10.2, -5, '#5a4a4a', { seg: 4 }); b.box(0.8, 0.45, 0.04, 0.4, 10.6, -5, '#7f6fb8');
    b.rect(0, -3.2, 5, 2.4, 0); b.circle(0, 0.6, 1.2);
  } else if (k === 'crystal') {
    b.cyl(2.2, 2.5, 0.6, 0, 0.3, 0, '#c4d2e2', { seg: 10 });
    const cr = (x, z, h, r, rz, rx) => { b.cyl(r * 0.2, r, h * 0.75, x, h * 0.37, z, '#9ff0ff', { seg: 6, rz, rx, mat: 'glowAlways' }); b.cone(r * 0.2 + 0.001, h * 0.25, x + Math.sin(-rz) * h * 0.85, h * 0.85, z + Math.sin(rx) * h * 0.85, '#dffcff', { seg: 6, rz, rx, mat: 'glowAlways' }); };
    cr(0, 0, 4.2, 0.75, 0, 0); cr(0.9, 0.3, 2.6, 0.5, -0.35, 0.1); cr(-0.8, 0.2, 2.2, 0.45, 0.4, -0.1); cr(0.1, -0.8, 2.0, 0.42, 0.05, -0.4);
    b.glow(0, 2, 0, '#9ff0ff', 2.5, 'crystal');
    b.circle(0, 0, 2.6);
  } else if (k === 'lighthouse') {
    b.cyl(2.2, 2.5, 0.8, 0, 0.4, 0, '#c8b8a8', { seg: 12 });
    for (let i = 0; i < 4; i++) b.cyl(1.5 - i * 0.12, 1.62 - i * 0.12, 2.2, 0, 1.9 + i * 2.2, 0, i % 2 ? '#e8474a' : WHITE, { seg: 16 });
    b.cyl(1.4, 1.4, 0.25, 0, 10.0, 0, '#5a5a6a', { seg: 16 });
    b.cyl(0.9, 0.9, 1.3, 0, 10.8, 0, '#fff2a8', { seg: 12, mat: 'glow' });
    b.cone(1.1, 1.1, 0, 12.0, 0, '#e8474a', { seg: 12 }); b.sphere(0.18, 0, 12.6, 0, '#ffd23f');
    door(b, 0, 1.55, 0.8, '#2fa8a0', { w: 0.9, h: 1.7, step: false });
    b.glow(0, 10.8, 0, '#fff2a8', 3, 'beacon');
    b.circle(0, 0, 2.6);
  } else if (k === 'totem') {
    b.cyl(1.6, 1.8, 0.4, 0, 0.2, 0, '#7a6a72', { seg: 10 });
    const cols = ['#e8674a', '#f5b83d', '#2fa8a0', '#9b7fd1'];
    for (let i = 0; i < 4; i++) {
      b.cyl(0.62, 0.66, 1.1, 0, 0.95 + i * 1.1, 0, cols[i], { seg: 10 });
      b.sphere(0.14, -0.22, 1.05 + i * 1.1, 0.58, WHITE); b.sphere(0.14, 0.22, 1.05 + i * 1.1, 0.58, WHITE);
      b.sphere(0.07, -0.22, 1.05 + i * 1.1, 0.7, '#2a2140'); b.sphere(0.07, 0.22, 1.05 + i * 1.1, 0.7, '#2a2140');
    }
    for (const s of [-1, 1]) b.box(1.6, 0.3, 0.6, s * 1.0, 4.0, 0, '#f5b83d', { rz: s * 0.35, round: 0.12 });
    for (let i = 0; i < 3; i++) b.cyl(0.1, 0.1, 1.2, (i - 1) * 2.4, 0.6, 1.6, '#5a4a4a', { seg: 6 }), b.sphere(0.22, (i - 1) * 2.4, 1.3, 1.6, '#ff9a4a', { mat: 'glow' });
    b.circle(0, 0, 1.8);
  } else if (k === 'arch') {
    const rc = C.rock || '#d0764a', rc2 = C.rockDark || '#b05a3a';
    for (const s of [-1, 1]) { b.rock(1.4, s * 2.6, 1.6, 0, rc, { sy: 2.3, variant: 2 + s }); b.rock(1.1, s * 2.4, 3.6, 0, rc2, { sy: 1.4, variant: 4 + s }); b.circle(s * 2.6, 0, 1.4); }
    b.box(7.0, 1.2, 1.8, 0, 4.9, 0, rc, { round: 0.5, grad: 0.3 });
    b.rock(0.9, 0, 5.6, 0, rc2, { sy: 0.7, variant: 5 });
    for (let i = 0; i < 6; i++) b.sphere(0.12, -2.4 + i * 0.95, 4.2, 0.95, ['#ff5f9e', '#ffd23f', '#2fa8a0'][i % 3], { mat: 'glow' });
  }
  b.pop();
  return own ? { object: b.build(ctx.worldMats?.forBuilder?.() || { solid: ctx.toon.matVC() }), colliders: b.colliders } : { colliders: b.colliders };
}

/** Dispatch on building kind. */
export function buildBuilding(ctx, def) {
  switch (def.kind) {
    case 'center': return buildCenter(ctx, def);
    case 'shop': return buildShop(ctx, def);
    case 'lab': return buildLab(ctx, def);
    case 'osteria': return buildOsteria(ctx, def);
    case 'depot': return buildDepot(ctx, def);
    default: return buildHouse(ctx, def);
  }
}

export { STYLE, shade };
