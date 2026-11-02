// Interiors: small cosy rooms built lazily in far "pockets" (layout.js plans them). Three tall walls
// and a low front wall (the camera looks in from the door side), plank or tile floors, wallpaper with
// a wainscot, windows of light, and Sun/Moon furniture: double beds with quilts, wardrobes, kitchens,
// fridges, sofas, bookshelves, the Centro Cura healing machine and PC, shop shelves full of goods,
// the lab's machines, the osteria bar with string lights, the Eclissi depot crates.
import * as THREE from 'three';
import { Builder } from './builder.js';
import { rng } from '../core/math.js';

const WOOD = '#b97b47', WOOD2 = '#9a6a43', WOOD3 = '#d9a46a', WHITE = '#ffffff';
const THEMES = {
  house: { floor: '#d9a46a', floor2: '#c99460', wall: '#fff0d8', wain: '#e8c8a0' },
  home: { floor: '#d9a46a', floor2: '#c99460', wall: '#e8f4ff', wain: '#9fc8e8' },
  center: { floor: '#fff6f0', floor2: '#ffe0e0', wall: '#fffaf6', wain: '#ff8a8a', tiles: true },
  shop: { floor: '#e8f4fb', floor2: '#cfe6f5', wall: '#f6fbff', wain: '#8fc8ec', tiles: true },
  lab: { floor: '#eef2f6', floor2: '#dde4ec', wall: '#fbfdff', wain: '#8fd8d0', tiles: true },
  osteria: { floor: '#b98552', floor2: '#a8763f', wall: '#ffe2bc', wain: '#c8784a' },
  depot: { floor: '#8a8494', floor2: '#7a7488', wall: '#a8a2b8', wain: '#6f6888', tiles: true },
};

function furniture(b, f, I, R, C) {
  const x = f.x, z = f.z;
  b.push(x, 0, z, f.rot || 0);
  const out = [];   // collider rects [x, z, hw, hd] in local frame
  const pal = ['#e8674a', '#2fa8a0', '#9b7fd1', '#f5b83d', '#ff8fb8', '#3fa6d9'];
  switch (f.type) {
    case 'bed': {
      const quilt = R.pick(pal);
      b.box(2.0, 0.35, 2.3, 0, 0.2, 0, WOOD, { round: 0.08 });
      b.box(2.05, 1.2, 0.18, 0, 0.6, -1.1, WOOD2, { round: 0.1 });
      b.box(1.9, 0.28, 2.15, 0, 0.5, 0.05, WHITE, { round: 0.12 });
      b.box(1.95, 0.18, 1.45, 0, 0.66, 0.42, quilt, { round: 0.1 });
      b.box(1.97, 0.12, 0.3, 0, 0.7, -0.33, WHITE, { round: 0.06 });
      for (const s of [-1, 1]) b.box(0.75, 0.18, 0.42, s * 0.48, 0.73, -0.78, '#fff8ee', { round: 0.09 });
      out.push([0, 0, 1.0, 1.15]);
      break;
    }
    case 'nightstand':
      b.box(0.6, 0.6, 0.5, 0, 0.3, 0, WOOD3, { round: 0.06 }); b.box(0.5, 0.18, 0.04, 0, 0.4, 0.25, WOOD, {}); out.push([0, 0, 0.3, 0.25]);
      break;
    case 'lamp':
      b.cyl(0.12, 0.14, 0.12, 0, f.onTop ? 0.66 : 0.06, 0, '#e6dccb', { seg: 8 });
      b.cyl(0.03, 0.03, 0.35, 0, f.onTop ? 0.85 : 0.6, 0, '#5a4a4a', { seg: 4 });
      b.cyl(0.14, 0.22, 0.25, 0, f.onTop ? 1.08 : 1.2, 0, '#fff2c8', { mat: 'glow', seg: 10, open: false });
      break;
    case 'wardrobe':
      b.box(1.6, 2.1, 0.7, 0, 1.05, 0, WOOD3, { round: 0.08 });
      b.box(0.02, 1.8, 0.04, 0, 1.05, 0.36, WOOD2); for (const s of [-1, 1]) b.sphere(0.05, s * 0.12, 1.1, 0.38, '#ffd23f');
      b.box(1.66, 0.12, 0.76, 0, 2.12, 0, WOOD2, { round: 0.04 });
      out.push([0, 0, 0.8, 0.35]);
      break;
    case 'drawers':
      b.box(1.2, 0.85, 0.5, 0, 0.42, 0, WOOD3, { round: 0.06 });
      for (let k = 0; k < 3; k++) { b.box(1.05, 0.22, 0.04, 0, 0.18 + k * 0.26, 0.25, WOOD, { round: 0.03 }); b.sphere(0.04, 0, 0.18 + k * 0.26, 0.28, '#ffd23f'); }
      b.cyl(0.1, 0.1, 0.25, 0.35, 0.98, 0, '#7fd0ff', { seg: 8 }); b.sphere(0.12, 0.35, 1.18, 0, '#ff8fb8');
      out.push([0, 0, 0.6, 0.25]);
      break;
    case 'kitchen':
      b.box(2.4, 0.9, 0.62, 0, 0.45, 0, '#fff8ee', { round: 0.05 });
      b.box(2.45, 0.08, 0.66, 0, 0.92, 0, '#c8b8a8', { round: 0.02 });
      b.box(0.5, 0.06, 0.4, -0.6, 0.97, 0.02, '#4a4a5e', {}); for (const s of [-1, 1]) b.cyl(0.09, 0.09, 0.03, -0.6 + s * 0.12, 1.0, 0, '#2a2a3a', { seg: 8 });
      b.box(0.5, 0.04, 0.36, 0.55, 0.95, 0.02, '#9fd4f5', {}); b.cyl(0.02, 0.02, 0.3, 0.55, 1.1, -0.18, '#c8c8d0', { seg: 4 });
      b.box(2.4, 0.6, 0.36, 0, 1.9, -0.12, '#fff8ee', { round: 0.05 });
      for (let k = 0; k < 4; k++) b.box(0.04, 0.4, 0.02, -0.9 + k * 0.6, 1.9, 0.07, '#e6dccb');
      b.cyl(0.13, 0.11, 0.2, 0.0, 1.06, 0, '#e8674a', { seg: 8 });
      out.push([0, 0, 1.2, 0.32]);
      break;
    case 'fridge':
      b.box(0.8, 1.8, 0.7, 0, 0.9, 0, '#f2fbff', { round: 0.14 });
      b.box(0.76, 0.03, 0.02, 0, 1.25, 0.36, '#c8d8e0'); b.box(0.05, 0.4, 0.05, 0.3, 1.55, 0.38, '#c8c8d0'); b.box(0.05, 0.3, 0.05, 0.3, 0.9, 0.38, '#c8c8d0');
      b.box(0.15, 0.15, 0.02, -0.15, 1.5, 0.36, '#ff8fb8'); b.box(0.12, 0.12, 0.02, 0.05, 1.62, 0.36, '#ffd23f');
      out.push([0, 0, 0.4, 0.35]);
      break;
    case 'table': {
      b.cyl(0.62, 0.62, 0.08, 0, 0.76, 0, WOOD3, { seg: 16 }); b.cyl(0.08, 0.14, 0.74, 0, 0.37, 0, WOOD2, { seg: 8 });
      b.cyl(0.13, 0.11, 0.12, 0.15, 0.86, 0.1, '#ffffff', { seg: 8 }); b.sphere(0.07, -0.2, 0.86, -0.1, '#ff5f5f'); b.sphere(0.07, -0.1, 0.86, -0.18, '#ffd23f');
      for (const s of [-1, 1]) { b.box(0.45, 0.07, 0.45, s * 0.95, 0.46, 0, WOOD, { round: 0.04 }); b.box(0.45, 0.6, 0.07, s * 0.95 + s * 0.2, 0.75, 0, WOOD, { round: 0.03, ry: Math.PI / 2 }); for (const a of [-1, 1]) for (const c of [-1, 1]) b.box(0.05, 0.44, 0.05, s * 0.95 + a * 0.18, 0.22, c * 0.18, WOOD2); }
      out.push([0, 0, 0.65, 0.65]);
      break;
    }
    case 'sofa': {
      const col = R.pick(['#e8674a', '#2fa8a0', '#9b7fd1', '#3fa6d9']);
      b.box(2.1, 0.42, 0.9, 0, 0.25, 0, col, { round: 0.14 });
      b.box(2.1, 0.7, 0.28, 0, 0.6, -0.34, col, { round: 0.14 });
      for (const s of [-1, 1]) b.box(0.28, 0.55, 0.9, s * 1.0, 0.45, 0, col, { round: 0.14 });
      for (const s of [-1, 1]) b.box(0.85, 0.16, 0.62, s * 0.45, 0.52, 0.06, '#fff8ee', { round: 0.08 });
      b.box(0.4, 0.4, 0.14, -0.6, 0.72, -0.12, '#ffd23f', { round: 0.1, rz: 0.2 });
      out.push([0, 0, 1.12, 0.45]);
      break;
    }
    case 'shelf': case 'shelfback': case 'bookshelf': {
      const w = f.type === 'shelfback' ? 2.6 : 1.4;
      b.box(w, 1.9, 0.42, 0, 0.95, 0, WOOD3, { round: 0.05 });
      for (let r = 0; r < 4; r++) {
        b.box(w - 0.1, 0.05, 0.38, 0, 0.2 + r * 0.45, 0.02, WOOD2, {});
        for (let k = 0; k < Math.round(w * 4); k++) {
          const cx = -w / 2 + 0.15 + k * 0.24;
          if (f.goods) { if (k % 2 === 0) b.box(0.2, 0.26, 0.24, cx + 0.05, 0.35 + r * 0.45, 0.04, pal[(k + r) % pal.length], { round: 0.04 }); else b.cyl(0.08, 0.08, 0.24, cx, 0.34 + r * 0.45, 0.04, pal[(k * 3 + r) % pal.length], { seg: 8 }); }
          else if (R() < 0.85) b.box(0.07 + R() * 0.05, 0.28 + R() * 0.08, 0.28, cx, 0.36 + r * 0.45, 0.02, pal[Math.floor(R() * pal.length)], { round: 0.01 });
        }
      }
      out.push([0, 0, w / 2, 0.21]);
      break;
    }
    case 'rug':
      b.box(f.w || 2.6, 0.03, f.d || 1.8, 0, 0.015, 0, f.color || '#e8674a', { round: 0.01 });
      b.box((f.w || 2.6) - 0.3, 0.035, (f.d || 1.8) - 0.3, 0, 0.02, 0, '#fff4dc', { round: 0.01 });
      b.box((f.w || 2.6) - 0.5, 0.04, (f.d || 1.8) - 0.5, 0, 0.025, 0, f.color || '#e8674a', { round: 0.01 });
      break;
    case 'plant':
      b.cyl(0.25, 0.2, 0.45, 0, 0.22, 0, '#e8824a', { seg: 10 });
      b.sphere(0.4, 0, 0.75, 0, '#5cb848', { grad: 0.3 }); b.sphere(0.3, 0.15, 1.05, 0.05, '#7fd05a', { grad: 0.2 });
      out.push([0, 0, 0.25, 0.25]);
      break;
    case 'tv':
      b.box(1.4, 0.5, 0.45, 0, 0.25, 0, WOOD3, { round: 0.05 });
      b.box(1.2, 0.72, 0.08, 0, 0.9, 0, '#2a2a3a', { round: 0.05 }); b.box(1.08, 0.6, 0.02, 0, 0.9, 0.05, '#7fd0ff', { mat: 'glow' });
      b.box(0.5, 0.06, 0.25, 0.3, 0.53, 0.05, '#e8474a', { round: 0.02 });
      out.push([0, 0, 0.7, 0.25]);
      break;
    case 'desk':
      b.box(1.4, 0.07, 0.7, 0, 0.76, 0, WOOD3, { round: 0.03 });
      for (const s of [-1, 1]) b.box(0.07, 0.74, 0.65, s * 0.65, 0.37, 0, WOOD2);
      b.box(0.5, 0.35, 0.05, 0.1, 1.0, -0.2, '#3a3a4a', { round: 0.03 }); b.box(0.45, 0.28, 0.02, 0.1, 1.0, -0.17, '#9fe0ff', { mat: 'glow' });
      b.box(0.3, 0.04, 0.22, -0.4, 0.81, 0.05, '#fff8ee', { ry: 0.3 });
      out.push([0, 0, 0.7, 0.35]);
      break;
    case 'counter': {
      const len = f.len || 4;
      b.box(len, 1.05, 0.8, 0, 0.52, 0, f.color || WHITE, { round: 0.12 });
      b.box(len + 0.1, 0.1, 0.9, 0, 1.08, 0, f.accent || '#e8674a', { round: 0.05 });
      b.box(len - 0.2, 0.28, 0.04, 0, 0.6, 0.41, f.accent || '#e8674a', { round: 0.03 });
      b.box(0.4, 0.3, 0.3, len / 2 - 0.5, 1.28, 0, '#3a3a4a', { round: 0.04 });
      out.push([0, 0, len / 2, 0.4]);
      break;
    }
    case 'healer':
      b.box(2.2, 1.4, 0.7, 0, 0.7, 0, '#ffe8e8', { round: 0.2 });
      b.box(1.6, 0.5, 0.06, 0, 1.0, 0.36, '#9fe0ff', { mat: 'glow', round: 0.05 });
      for (let k = 0; k < 6; k++) { b.sphere(0.12, -0.5 + (k % 3) * 0.5, 1.48, -0.1 + Math.floor(k / 3) * 0.25, k % 2 ? '#ff6a6a' : '#ffffff', { mat: 'glow' }); }
      b.dome(0.95, 0, 1.42, 0, '#d8f0ff', { sy: 0.4 });
      out.push([0, 0, 1.1, 0.35]);
      break;
    case 'pc':
      b.box(0.9, 1.6, 0.6, 0, 0.8, 0, '#e8eef6', { round: 0.1 });
      b.box(0.7, 0.55, 0.04, 0, 1.15, 0.31, '#7fe0ff', { mat: 'glow', round: 0.04 });
      b.box(0.6, 0.15, 0.25, 0, 0.75, 0.38, '#c8d0dc', { round: 0.03, rx: 0.3 });
      out.push([0, 0, 0.45, 0.3]);
      break;
    case 'bench':
      b.box(1.8, 0.4, 0.55, 0, 0.3, 0, '#ff8a8a', { round: 0.12 }); b.box(1.8, 0.55, 0.2, 0, 0.6, -0.22, '#ff8a8a', { round: 0.1 });
      out.push([0, 0, 0.9, 0.28]);
      break;
    case 'crates':
      b.box(0.9, 0.8, 0.9, 0, 0.4, 0, WOOD3, { round: 0.05 }); b.box(0.7, 0.6, 0.7, 0.1, 1.1, 0, WOOD, { round: 0.05, ry: 0.3 });
      b.box(0.95, 0.08, 0.08, 0, 0.4, 0.46, WOOD2, { rz: 0.7 });
      out.push([0, 0, 0.5, 0.5]);
      break;
    case 'labtable':
      b.box(3.2, 0.95, 1.2, 0, 0.47, 0, '#e8eef6', { round: 0.08 }); b.box(3.3, 0.08, 1.3, 0, 0.98, 0, '#2fa8a0', { round: 0.04 });
      for (let k = 0; k < 3; k++) { b.cyl(0.12, 0.15, 0.1, -0.8 + k * 0.8, 1.07, 0, '#c8c8d0', { seg: 10 }); b.sphere(0.2, -0.8 + k * 0.8, 1.32, 0, ['#e8474a', '#ffffff', '#3fa6d9'][k], { grad: 0.1 }); b.box(0.42, 0.04, 0.03, -0.8 + k * 0.8, 1.32, 0.18, '#2a2140'); }
      out.push([0, 0, 1.6, 0.6]);
      break;
    case 'machine':
      b.box(1.4, 2.0, 0.9, 0, 1.0, 0, '#d8e0ea', { round: 0.14 });
      b.box(1.0, 0.6, 0.05, 0, 1.35, 0.46, '#7fe0ff', { mat: 'glow', round: 0.05 });
      for (let k = 0; k < 4; k++) b.sphere(0.07, -0.4 + k * 0.27, 0.8, 0.47, ['#ff6a6a', '#ffd23f', '#7fc24a', '#3fa6d9'][k], { mat: 'glow' });
      out.push([0, 0, 0.7, 0.45]);
      break;
    case 'bar': {
      const len = f.len || 6;
      b.box(len, 1.1, 0.8, 0, 0.55, 0, '#8a5a36', { round: 0.1 });
      b.box(len + 0.1, 0.1, 0.95, 0, 1.12, 0, WOOD3, { round: 0.04 });
      for (let k = 0; k < 5; k++) { b.cyl(0.2, 0.22, 0.06, -len / 2 + 0.8 + k * (len - 1.6) / 4, 0.75, 0.8, '#e8674a', { seg: 10 }); b.cyl(0.04, 0.04, 0.72, -len / 2 + 0.8 + k * (len - 1.6) / 4, 0.36, 0.8, '#4a4a5e', { seg: 4 }); }
      b.box(len - 0.6, 1.6, 0.35, 0, 1.6, -1.05, WOOD2, { round: 0.04 });
      for (let k = 0; k < 14; k++) b.cyl(0.06, 0.07, 0.32, -len / 2 + 0.6 + k * (len - 1.2) / 13, 1.95, -0.98, ['#3f8a4a', '#a8203a', '#e8c86a'][k % 3], { seg: 6 });
      out.push([0, 0, len / 2, 0.4]);
      break;
    }
    case 'barrels':
      for (const [dx, dz] of [[0, 0], [0.75, 0.1], [0.35, 0.65]]) { b.cyl(0.36, 0.32, 0.85, dx, 0.43, dz, WOOD, { seg: 10 }); b.torus(0.35, 0.03, dx, 0.2, dz, '#4a4a5e', { rx: Math.PI / 2 }); b.torus(0.35, 0.03, dx, 0.68, dz, '#4a4a5e', { rx: Math.PI / 2 }); }
      out.push([0.35, 0.3, 0.75, 0.7]);
      break;
    case 'dtable':
      b.box(1.4, 0.06, 1.0, 0, 0.76, 0, f.cloth || WHITE, { round: 0.03 });
      b.box(1.42, 0.25, 1.02, 0, 0.64, 0, f.cloth || WHITE, { round: 0.02 });
      b.box(0.1, 0.62, 0.1, 0, 0.31, 0, WOOD2);
      b.cyl(0.05, 0.06, 0.22, 0, 0.9, 0, '#a8203a', { seg: 6 }); b.sphere(0.06, 0.1, 0.84, 0.1, '#ffe07a', { mat: 'glow' });
      for (const s of [-1, 1]) { b.box(0.42, 0.07, 0.42, s * 0.95, 0.46, 0, WOOD, { round: 0.04 }); b.box(0.07, 0.55, 0.42, s * 1.15, 0.75, 0, WOOD, { round: 0.03 }); }
      out.push([0, 0, 0.72, 0.52]);
      break;
    case 'stringlights': {
      const w = f.w, d = f.d;
      for (let k = 0; k < 4; k++) { const zz = -d / 2 + 1 + k * (d - 2) / 3; for (let j = 0; j < 12; j++) { const xx = -w / 2 + 0.5 + j * (w - 1) / 11; b.sphere(0.07, xx, 2.75 - Math.sin(j / 11 * Math.PI) * 0.35, zz, ['#ffd98a', '#ffb0c8', '#bfe6ff'][(j + k) % 3], { mat: 'glow' }); } }
      break;
    }
    case 'banner':
      b.box(1.0, 1.8, 0.05, 0, 1.6, 0, f.color || '#5b3a8a', { round: 0.02 });
      b.cyl(0.32, 0.32, 0.05, 0, 1.8, 0.04, '#2a2140', { rx: Math.PI / 2, seg: 14 }); b.torus(0.32, 0.04, 0, 1.8, 0.06, '#ffc93c', {});
      break;
    default: break;
  }
  b.pop();
  return out.map(([lx, lz, hw, hd]) => {
    const c = Math.cos(f.rot || 0), s = Math.sin(f.rot || 0);
    return { type: 'box', x: x + lx * c + lz * s, z: z - lx * s + lz * c, hw, hd, rot: f.rot || 0, tag: 'furniture' };
  });
}

/**
 * @param {any} ctx
 * @param {any} def interior plan from layout.js ({id, kind, town, ox, oz, w, d, furniture, pois, search})
 * @returns {{object:THREE.Group, pois:Object, colliders:any[], searchSpots:any[], surfaces:any[], exit:{x:number,z:number}}}
 */
export function buildInterior(ctx, def, mats) {
  const I = def;
  const R = rng('room:' + I.id);
  const T = { ...(THEMES[I.kind] || THEMES.house) };
  if (I.kind === 'house') { T.wall = R.pick(['#fff0d8', '#ffe8ee', '#eef8e8', '#fff6dc', '#eaf2ff']); T.wain = R.pick(['#e8c8a0', '#d8a8b8', '#a8d0a0', '#9fc8e8']); }
  const b = new Builder({ seed: 'room' + I.id, groundAt: () => 0 });
  const { ox, oz, w, d } = I;
  const hw = w / 2, hd = d / 2, H = 3.1;
  b.free();
  b.push(ox, 0, oz);
  // floor: planks or tiles + a dark plinth under everything
  b.box(w + 3, 0.4, d + 3, 0, -0.26, 0, '#3a2a28', {});
  if (T.tiles) {
    for (let i = 0; i < Math.ceil(w); i++) for (let j = 0; j < Math.ceil(d); j++) b.box(0.98, 0.1, 0.98, -hw + 0.5 + i, -0.05, -hd + 0.5 + j, (i + j) % 2 ? T.floor : T.floor2, { round: 0.02, jitter: 0.01 });
  } else {
    for (let i = 0; i < Math.ceil(w / 0.5); i++) b.box(0.48, 0.1, d, -hw + 0.25 + i * 0.5, -0.05, 0, i % 3 ? T.floor : T.floor2, { round: 0.02, jitter: 0.05 });
  }
  // walls: back + sides tall, front low with a door gap
  const wallT = 0.3;
  b.box(w + wallT * 2, H, wallT, 0, H / 2, -hd - wallT / 2, T.wall, { grad: 0.12 });
  for (const s of [-1, 1]) b.box(wallT, H, d + wallT, s * (hw + wallT / 2), H / 2, -wallT / 2, T.wall, { grad: 0.12 });
  // wainscot + baseboard
  b.box(w, 1.0, 0.06, 0, 0.5, -hd + 0.03, T.wain, {}); b.box(w, 0.08, 0.1, 0, 1.0, -hd + 0.05, WHITE, {});
  for (const s of [-1, 1]) { b.box(0.06, 1.0, d, s * (hw - 0.03), 0.5, 0, T.wain, {}); b.box(0.1, 0.08, d, s * (hw - 0.05), 1.0, 0, WHITE, {}); }
  // wall tops (thick, rounded: reads as a cut-away doll house)
  b.box(w + wallT * 2 + 0.1, 0.16, wallT + 0.1, 0, H + 0.08, -hd - wallT / 2, '#8a6a5a', { round: 0.05 });
  for (const s of [-1, 1]) b.box(wallT + 0.1, 0.16, d + wallT + 0.1, s * (hw + wallT / 2), H + 0.08, -wallT / 2, '#8a6a5a', { round: 0.05 });
  // low front wall with door gap
  const gap = 1.6;
  for (const s of [-1, 1]) { const len = hw - gap / 2; b.box(len + wallT, 0.55, wallT, s * (gap / 2 + len / 2 + wallT / 2), 0.27, hd + wallT / 2, T.wall, {}); b.box(len + wallT + 0.1, 0.12, wallT + 0.1, s * (gap / 2 + len / 2 + wallT / 2), 0.6, hd + wallT / 2, '#8a6a5a', { round: 0.04 }); }
  b.box(gap + 0.2, 0.05, 0.9, 0, 0.02, hd + 0.3, '#c8553a', { round: 0.02 });   // doormat
  // back-wall windows (light) with curtains
  for (const xx of [-hw * 0.45, hw * 0.45]) {
    b.box(1.5, 1.3, 0.1, xx, 1.85, -hd + 0.02, WHITE, { round: 0.06 });
    b.box(1.3, 1.1, 0.06, xx, 1.85, -hd + 0.06, '#d8f0ff', { mat: 'windows', round: 0.04 });
    for (const s of [-1, 1]) b.box(0.32, 1.45, 0.06, xx + s * 0.78, 1.85, -hd + 0.12, R.pick(['#ff8fb8', '#f5b83d', '#8fd8d0', '#b48cff']), { round: 0.05 });
  }
  // a painting and a clock on the side walls
  b.box(0.06, 0.7, 0.9, -hw + 0.04, 1.9, -0.6, '#8a5a36', { round: 0.03 }); b.box(0.04, 0.55, 0.75, -hw + 0.07, 1.9, -0.6, R.pick(['#8fd8ff', '#ffb07a', '#9bd85a']), {});
  b.cyl(0.28, 0.28, 0.06, hw - 0.04, 2.2, 0.8, WHITE, { rz: Math.PI / 2, seg: 14 }); b.box(0.02, 0.16, 0.03, hw - 0.08, 2.24, 0.8, '#2a2140');
  b.pop();
  const colliders = [];
  // wall colliders
  colliders.push({ type: 'box', x: ox, z: oz - hd - 0.25, hw: hw + 0.5, hd: 0.3, rot: 0 });
  for (const s of [-1, 1]) colliders.push({ type: 'box', x: ox + s * (hw + 0.25), z: oz, hw: 0.3, hd: hd + 0.5, rot: 0 });
  for (const s of [-1, 1]) colliders.push({ type: 'box', x: ox + s * (gap / 2 + (hw - gap / 2) / 2 + 0.2), z: oz + hd + 0.15, hw: (hw - gap / 2) / 2 + 0.3, hd: 0.25, rot: 0 });
  colliders.push({ type: 'box', x: ox, z: oz + hd + 1.4, hw: gap, hd: 0.3, rot: 0 });   // beyond the door gap (exit is an action)
  for (const f of I.furniture) colliders.push(...furniture(b, f, I, R, T));
  const object = b.build((mats || ctx.worldMats).forBuilder(), { name: 'interior:' + I.id });
  object.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return {
    object, pois: I.pois, colliders, searchSpots: I.search,
    surfaces: [{ type: 'box', x: ox, z: oz, hw: hw + 1.5, hd: hd + 1.5, rot: 0, y: 0 }],
    exit: { x: ox, z: oz + hd - 0.3 },
    bounds: [ox - hw - 2, oz - hd - 2, ox + hw + 2, oz + hd + 3],
  };
}
