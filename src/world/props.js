// Props, authored into the shared Builder (merged with the town/route batch): benches, street lamps
// (glowing at night), planters, market stalls with striped awnings and fruit, signs, mailboxes,
// barrels, crates, railings, tents, campfires, banners, fences, hedges, windmills, standing stones,
// beach umbrellas, boats, snowmen, shrine lanterns… plus bridges, piers, cave mouths and route gates.
import * as THREE from 'three';
import { Builder } from './builder.js';
import { rng } from '../core/math.js';

const WOOD = '#b97b47', WOOD2 = '#9a6a43', WOOD3 = '#c99460', IRON = '#4a4a5e', WHITE = '#ffffff';

/** Add one prop to builder b (world coords; y from heightAt). */
export function addProp(b, p, heightAt, C = {}) {
  const y = p.y ?? heightAt(p.x, p.z);
  b.at(p.x, p.z); b.push(p.x, y, p.z, p.rot || 0, p.s || 1);
  const R = rng('prop' + Math.round(p.x * 10) + ',' + Math.round(p.z * 10));
  switch (p.type) {
    case 'bench':
      b.box(1.7, 0.1, 0.5, 0, 0.45, 0, WOOD3, { round: 0.04 });
      b.box(1.7, 0.45, 0.08, 0, 0.78, -0.24, WOOD3, { round: 0.04, rx: -0.12 });
      for (const s of [-1, 1]) { b.box(0.1, 0.45, 0.45, s * 0.72, 0.22, 0, IRON, { round: 0.03 }); b.box(0.08, 0.5, 0.08, s * 0.72, 0.72, -0.24, IRON); }
      b.rect(0, 0, 0.85, 0.3);
      break;
    case 'lamp':
      b.cyl(0.18, 0.24, 0.3, 0, 0.15, 0, IRON, { seg: 8 });
      b.cyl(0.06, 0.08, 3.0, 0, 1.6, 0, IRON, { seg: 6 });
      b.cyl(0.26, 0.18, 0.12, 0, 3.08, 0, IRON, { seg: 8 });
      b.sphere(0.26, 0, 3.32, 0, '#fff0b8', { mat: 'glow' });
      b.cone(0.34, 0.26, 0, 3.66, 0, IRON, { seg: 8 });
      b.glow(0, 3.3, 0, '#ffc070', 1.2, 'lamp');
      b.circle(0, 0, 0.22);
      break;
    case 'planter':
      b.box(1.3, 0.55, 1.3, 0, 0.27, 0, '#d8c6a4', { round: 0.1 });
      b.sphere(0.62, 0, 0.75, 0, C.leaf || '#5cb848', { sy: 0.7, grad: 0.3 });
      for (let k = 0; k < 6; k++) { const a = k * 1.05; b.sphere(0.13, Math.sin(a) * 0.45, 0.95, Math.cos(a) * 0.45, (C.flowers || ['#ff5f9e', '#ffd23f'])[k % 2]); }
      b.circle(0, 0, 0.7);
      break;
    case 'stall': {
      const col = p.color || '#e8674a';
      b.box(2.6, 0.9, 1.1, 0, 0.45, 0.2, WOOD3, { round: 0.06 });
      b.box(2.7, 0.1, 1.2, 0, 0.92, 0.2, WOOD, { round: 0.03 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.05, 0.05, 2.3, sx * 1.25, 1.15, sz * 0.6 + 0.2, WOOD2, { seg: 5 });
      for (let k = 0; k < 6; k++) b.box(2.9 / 6 + 0.01, 0.1, 1.7, -1.45 + (k + 0.5) * 2.9 / 6, 2.35, 0.3, k % 2 ? WHITE : col, { rx: 0.2, round: 0.03 });
      for (let k = 0; k < 6; k++) b.sphere(0.24, -1.45 + (k + 0.5) * 2.9 / 6, 2.1, 1.14, k % 2 ? WHITE : col, { sy: 0.5, sz: 0.4 });
      const fruit = ['#ff5f5f', '#ffd23f', '#ff9a3c', '#7fc24a', '#b48cff'];
      for (let k = 0; k < 4; k++) { b.box(0.55, 0.16, 0.45, -0.95 + k * 0.63, 1.03, 0.25, WOOD2, { round: 0.03 }); for (let j = 0; j < 4; j++) b.sphere(0.1, -1.1 + k * 0.63 + (j % 2) * 0.22, 1.18, 0.15 + (j >> 1) * 0.2, fruit[(k + j) % 5]); }
      b.rect(0, 0.2, 1.35, 0.6);
      break;
    }
    case 'sign':
      b.cyl(0.07, 0.08, 1.4, -0.55, 0.7, 0, WOOD2, { seg: 6 }); b.cyl(0.07, 0.08, 1.4, 0.55, 0.7, 0, WOOD2, { seg: 6 });
      b.box(1.5, 0.75, 0.12, 0, 1.15, 0.02, WOOD3, { round: 0.1 });
      b.box(1.28, 0.53, 0.04, 0, 1.15, 0.09, '#f5e6c8', { round: 0.06 });
      for (let k = 0; k < 3; k++) b.box(0.9 - k * 0.2, 0.06, 0.02, -0.1 + k * 0.05, 1.28 - k * 0.12, 0.12, '#8a6a4a');
      b.circle(0, 0, 0.4);
      break;
    case 'mailbox':
      b.cyl(0.05, 0.05, 1.0, 0, 0.5, 0, WOOD2, { seg: 5 });
      b.box(0.36, 0.32, 0.5, 0, 1.12, 0, '#e8474a', { round: 0.14 });
      b.box(0.04, 0.18, 0.12, 0.2, 1.25, -0.1, '#ffd23f');
      b.circle(0, 0, 0.22);
      break;
    case 'barrel':
      b.cyl(0.38, 0.34, 0.9, 0, 0.45, 0, WOOD, { seg: 10, grad: 0.2 });
      b.torus(0.37, 0.035, 0, 0.2, 0, IRON, { rx: Math.PI / 2 }); b.torus(0.37, 0.035, 0, 0.72, 0, IRON, { rx: Math.PI / 2 });
      b.cyl(0.33, 0.33, 0.04, 0, 0.9, 0, WOOD2, { seg: 10 });
      b.circle(0, 0, 0.42);
      break;
    case 'crates':
      b.box(0.85, 0.75, 0.85, 0, 0.37, 0, WOOD3, { round: 0.05 });
      b.box(0.9, 0.08, 0.08, 0, 0.37, 0.43, WOOD2, { rz: 0.7 });
      b.box(0.65, 0.6, 0.65, 0.1, 1.05, 0.05, WOOD, { round: 0.05, ry: 0.4 });
      b.box(0.7, 0.55, 0.7, 0.85, 0.27, -0.2, WOOD3, { round: 0.05, ry: -0.3 });
      b.rect(0.35, 0, 0.85, 0.55);
      break;
    case 'railing': {
      const len = p.len || 5;
      for (let k = 0; k <= Math.round(len / 1.2); k++) b.box(0.12, 0.9, 0.12, -len / 2 + k * len / Math.round(len / 1.2), 0.45, 0, WHITE, { round: 0.04 });
      b.box(len + 0.1, 0.1, 0.12, 0, 0.88, 0, WHITE, { round: 0.04 }); b.box(len, 0.07, 0.08, 0, 0.48, 0, WHITE);
      b.rect(0, 0, len / 2, 0.12);
      break;
    }
    case 'tent': {
      const col = p.color || '#5b3a8a';
      b.extrude([[-1.4, 0], [1.4, 0], [0, 1.9]], 2.6, 0, 0, 0, col, {});
      b.extrude([[-0.5, 0], [0.5, 0], [0, 1.1]], 0.05, 0, 0, 1.32, '#2a2140', {});
      b.box(3.2, 0.06, 3.0, 0, 0.03, 0, '#7a6a8a', { round: 0.02 });
      b.rect(0, 0, 1.45, 1.35);
      break;
    }
    case 'campfire':
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; b.rock(0.2, Math.sin(a) * 0.6, 0.08, Math.cos(a) * 0.6, '#8a8494', { variant: k }); }
      for (let k = 0; k < 4; k++) b.cyl(0.07, 0.07, 0.9, 0, 0.15, 0, WOOD2, { ry: k * 0.8, rz: Math.PI / 2 - 0.25, seg: 5 });
      b.cone(0.3, 0.75, 0, 0.5, 0, '#ff8a3c', { mat: 'glowAlways', seg: 7 });
      b.cone(0.16, 0.5, 0.06, 0.48, 0.02, '#ffe07a', { mat: 'glowAlways', seg: 6 });
      b.glow(0, 0.6, 0, '#ff9a4a', 2, 'fire');
      b.circle(0, 0, 0.7);
      break;
    case 'banner': {
      const col = p.color || '#5b3a8a';
      b.cyl(0.06, 0.06, 3.2, 0, 1.6, 0, IRON, { seg: 6 }); b.sphere(0.1, 0, 3.25, 0, '#ffc93c');
      b.box(0.9, 1.6, 0.05, 0.48, 2.3, 0, col, { round: 0.02 });
      b.cyl(0.3, 0.3, 0.06, 0.48, 2.45, 0.04, '#2a2140', { rx: Math.PI / 2, seg: 14 }); b.torus(0.3, 0.04, 0.48, 2.45, 0.06, '#ffc93c', {});
      b.circle(0, 0, 0.2);
      break;
    }
    case 'altar':
      b.cyl(3.4, 3.6, 0.4, 0, 0.2, 0, '#e8eef6', { seg: 16 });
      b.cyl(2.6, 2.8, 0.4, 0, 0.55, 0, '#d4dceb', { seg: 16 });
      b.box(1.8, 1.1, 1.0, 0, 1.3, 0, '#f4f7fb', { round: 0.15 });
      b.sphere(0.45, 0, 2.2, 0, '#ffd27a', { mat: 'glowAlways' });
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; b.cyl(0.22, 0.26, 2.6, Math.sin(a) * 3.0, 1.5, Math.cos(a) * 3.0, '#f4f7fb', { seg: 8 }); b.sphere(0.2, Math.sin(a) * 3.0, 2.95, Math.cos(a) * 3.0, '#ffb07a', { mat: 'glowAlways' }); }
      b.glow(0, 2.2, 0, '#ffd27a', 3, 'altar');
      b.rect(0, 0, 0.95, 0.55);
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; b.circle(Math.sin(a) * 3.0, Math.cos(a) * 3.0, 0.3); }
      break;
    case 'fence': {
      const len = p.len || 3, col = p.color || WOOD3;
      const n = Math.max(1, Math.round(len / 1.5));
      for (let k = 0; k <= n; k++) b.box(0.13, 0.85, 0.13, -len / 2 + k * len / n, 0.42, 0, col, { round: 0.05 });
      b.box(len + 0.06, 0.1, 0.07, 0, 0.66, 0, col, { round: 0.03 }); b.box(len + 0.06, 0.1, 0.07, 0, 0.32, 0, col, { round: 0.03 });
      b.rect(0, 0, len / 2, 0.1);
      break;
    }
    case 'hedge': {
      const len = p.len || 3;
      b.box(len, 0.95, 0.8, 0, 0.48, 0, C.leafDark || '#4f9a3a', { round: 0.36, grad: 0.35 });
      b.box(len - 0.2, 0.3, 0.6, 0, 0.95, 0, C.leaf || '#5cb848', { round: 0.14 });
      if (R() < 0.6) for (let k = 0; k < Math.round(len); k++) b.sphere(0.09, -len / 2 + 0.4 + k, 0.7 + R() * 0.3, 0.41, (C.flowers || ['#ff5f9e'])[k % (C.flowers || ['a']).length]);
      b.rect(0, 0, len / 2, 0.4);
      break;
    }
    case 'windmill':
      b.cyl(1.5, 2.0, 6.0, 0, 3.0, 0, '#fff2d8', { seg: 10, grad: 0.15 });
      b.cone(2.0, 2.2, 0, 7.1, 0, '#e8674a', { seg: 10 });
      b.box(0.9, 1.6, 0.1, 0, 0.8, 1.92, '#b97b47', { round: 0.3 });
      b.push(0, 6.2, 2.1, 0, 1, 0, p.spin || 0.3);
      for (let k = 0; k < 4; k++) { b.push(0, 0, 0, 0, 1, 0, k * Math.PI / 2); b.box(0.18, 3.4, 0.08, 0, 1.8, 0, WOOD2); b.box(0.9, 2.6, 0.04, 0.5, 2.0, 0, '#fff8ee', { round: 0.04 }); b.pop(); }
      b.sphere(0.3, 0, 0, 0, '#e8674a');
      b.pop();
      b.circle(0, 0, 2.0);
      break;
    case 'stone':
      b.rock(0.7, 0, 1.4, 0, C.rock || '#a8a2b4', { sx: 0.8, sy: 2.2, sz: 0.55, variant: Math.floor(R() * 6) });
      b.circle(0, 0, 0.7);
      break;
    case 'umbrella': {
      const col = p.color || '#ff5f9e';
      b.cyl(0.04, 0.04, 2.3, 0, 1.15, 0, WHITE, { seg: 5, rz: 0.1 });
      for (let k = 0; k < 8; k++) b.cone(1.25, 0.55, 0.12, 2.35, 0, k % 2 ? WHITE : col, { seg: 8 });
      b.cone(1.27, 0.56, 0.12, 2.34, 0, col, { seg: 8 });
      b.box(0.8, 0.04, 1.8, 0.9, 0.03, 0.4, ['#ffd23f', '#3fa6d9', '#ff8a5c'][Math.floor(R() * 3)], { round: 0.02, ry: 0.2 });
      b.circle(0, 0, 0.12);
      break;
    }
    case 'lounger':
      b.box(0.7, 0.1, 1.8, 0, 0.35, 0, WHITE, { round: 0.04 }); b.box(0.7, 0.1, 0.7, 0, 0.6, -0.8, WHITE, { round: 0.04, rx: -0.6 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.05, 0.35, 0.05, sx * 0.3, 0.17, sz * 0.8, '#c8c8d0');
      b.rect(0, 0, 0.38, 0.95);
      break;
    case 'boat': {
      const col = p.color || '#3fa6d9';
      b.box(1.5, 0.55, 3.6, 0, 0.28, 0, col, { round: 0.26 });
      b.box(1.25, 0.12, 3.2, 0, 0.5, 0, WOOD3, { round: 0.05 });
      b.cone(0.75, 1.0, 0, 0.28, 2.1, col, { rx: Math.PI / 2, seg: 8, sx: 1, sz: 0.55 });
      b.box(1.4, 0.1, 0.25, 0, 0.62, -0.5, WOOD, { round: 0.03 });
      break;
    }
    case 'bollard':
      b.cyl(0.16, 0.2, 0.55, 0, 0.27, 0, IRON, { seg: 8 }); b.cyl(0.24, 0.24, 0.08, 0, 0.56, 0, IRON, { seg: 8 });
      break;
    case 'snowman':
      b.sphere(0.6, 0, 0.55, 0, '#f6fbff'); b.sphere(0.44, 0, 1.3, 0, '#f6fbff'); b.sphere(0.32, 0, 1.9, 0, '#f6fbff');
      b.cone(0.07, 0.35, 0, 1.9, 0.38, '#ff8a3c', { rx: Math.PI / 2, seg: 6 });
      b.sphere(0.045, -0.11, 2.0, 0.28, '#2a2140'); b.sphere(0.045, 0.11, 2.0, 0.28, '#2a2140');
      b.torus(0.3, 0.07, 0, 1.68, 0, '#e8474a', { rx: Math.PI / 2 });
      b.cyl(0.22, 0.25, 0.3, 0, 2.25, 0, '#3f7fbf', { seg: 10 });
      b.circle(0, 0, 0.6);
      break;
    case 'lantern':
      b.box(0.5, 0.25, 0.5, 0, 0.12, 0, '#c4cbd8', { round: 0.05 });
      b.cyl(0.1, 0.12, 1.0, 0, 0.7, 0, '#c4cbd8', { seg: 6 });
      b.box(0.5, 0.45, 0.5, 0, 1.4, 0, '#e8eef6', { round: 0.08 });
      b.box(0.32, 0.28, 0.52, 0, 1.4, 0, '#ffd27a', { mat: 'glow' });
      b.cone(0.45, 0.35, 0, 1.8, 0, '#9fb0c4', { seg: 4, ry: Math.PI / 4 });
      b.glow(0, 1.4, 0, '#ffd27a', 1, 'lantern');
      b.circle(0, 0, 0.3);
      break;
    case 'lava':
      b.rock(0.8, 0, 0.2, 0, '#4f4757', { variant: Math.floor(R() * 6), sy: 0.7 });
      b.sphere(0.3, 0.2, 0.45, 0.1, '#ff6a2a', { mat: 'glowAlways', sy: 0.4 });
      b.circle(0, 0, 0.8);
      break;
    case 'pylon':
      for (const s of [-1, 1]) b.box(0.18, 7, 0.18, s * 0.7, 3.5, 0, '#9fa8b8', { rz: -s * 0.08 });
      for (let k = 0; k < 4; k++) b.box(1.6 - k * 0.15, 0.1, 0.1, 0, 1.4 + k * 1.6, 0, '#9fa8b8');
      b.box(3.2, 0.14, 0.14, 0, 6.8, 0, '#9fa8b8');
      b.circle(0, 0, 0.8);
      break;
    case 'flowerbed': {
      const len = p.len || 2.4;
      b.box(len, 0.25, 0.8, 0, 0.12, 0, '#c8a070', { round: 0.08 });
      b.box(len - 0.15, 0.1, 0.65, 0, 0.27, 0, '#8a6a4a', { round: 0.04 });
      for (let k = 0; k < Math.round(len * 3); k++) b.sphere(0.12, -len / 2 + 0.2 + k * (len - 0.4) / Math.max(1, Math.round(len * 3) - 1), 0.42, (k % 2 - 0.5) * 0.3, (C.flowers || ['#ff5f9e', '#ffd23f'])[k % (C.flowers || [1, 2]).length]);
      break;
    }
    case 'picnic':
      b.box(1.8, 0.08, 0.9, 0, 0.75, 0, WOOD3, { round: 0.04 });
      for (const s of [-1, 1]) { b.box(1.8, 0.06, 0.32, 0, 0.45, s * 0.75, WOOD3, { round: 0.03 }); b.box(0.08, 0.75, 1.7, s * 0.75, 0.37, 0, WOOD2, { rz: 0 }); }
      b.rect(0, 0, 0.95, 0.95);
      break;
    default:
      break;
  }
  b.pop();
}

/** Bridges: wooden (arched planks, posts, railings), rope (sagging planks, rope rails), stone (arched). */
export function addBridge(b, br, heightAt) {
  const pts = br.pts;
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1] || 1;
  const yAt = s => br.y0 + (br.y1 - br.y0) * (s / L) + br.arch * Math.sin(Math.PI * s / L);
  const out = { surfaces: [], colliders: [] };
  const hw = br.hw;
  const col = br.kind === 'stone' ? '#d8cfc0' : br.kind === 'rope' ? '#c08c58' : WOOD3;
  b.free();
  let next = 0, postNext = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, ry = Math.atan2(dx, dz);
    const s0 = cum[i], s1 = cum[i + 1];
    const y0 = yAt(s0), y1 = yAt(s1);
    out.surfaces.push({ type: 'span', x0: ax, z0: az, x1: bx, z1: bz, hw: hw + 0.25, y0: y0, y1: y1, arch: 0 });
    // side rails as colliders (thin boxes along the segment)
    for (const s of [-1, 1]) out.colliders.push({ type: 'box', x: (ax + bx) / 2 + Math.cos(ry) * s * (hw + 0.15), z: (az + bz) / 2 - Math.sin(ry) * s * (hw + 0.15), hw: 0.1, hd: l / 2 + 0.05, rot: ry, tag: 'rail' });
    const pitch = Math.atan2(y1 - y0, l);
    if (br.kind === 'stone') {
      b.at((ax + bx) / 2, (az + bz) / 2).push((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2, ry, 1, -pitch);
      b.box(hw * 2 + 0.6, 0.5, l + 0.05, 0, -0.2, 0, col, { round: 0.1, grad: 0.2 });
      for (const s of [-1, 1]) b.box(0.4, 0.6, l + 0.05, s * (hw + 0.25), 0.3, 0, '#c4b8a6', { round: 0.12 });
      b.pop();
    } else {
      while (next < s1) {
        const t = (next - s0) / (s1 - s0), x = ax + dx * t, z = az + dz * t, y = y0 + (y1 - y0) * t;
        b.at(x, z).push(x, y, z, ry, 1, -pitch);
        b.box(hw * 2 + 0.2, 0.12, br.kind === 'rope' ? 0.38 : 0.46, 0, -0.06, 0, (Math.round(next * 2) % 3) ? col : WOOD, { round: 0.03, jitter: 0.08 });
        b.pop();
        next += br.kind === 'rope' ? 0.55 : 0.5;
      }
      while (postNext < s1) {
        const t = (postNext - s0) / (s1 - s0), x = ax + dx * t, z = az + dz * t, y = y0 + (y1 - y0) * t;
        b.at(x, z).push(x, y, z, ry);
        for (const s of [-1, 1]) {
          b.cyl(0.08, 0.09, br.kind === 'rope' ? 1.1 : 1.0, s * (hw + 0.1), 0.5, 0, WOOD2, { seg: 6 });
          if (br.kind !== 'rope') { const deep = y - Math.min(heightAt(x, z), -0.5) + 0.3; b.cyl(0.14, 0.14, deep, s * (hw - 0.1), -deep / 2, 0, WOOD2, { seg: 6 }); }
        }
        b.pop();
        postNext += br.kind === 'rope' ? 3.5 : 2.8;
      }
      // rails
      b.at((ax + bx) / 2, (az + bz) / 2).push((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2, ry, 1, -pitch);
      for (const s of [-1, 1]) {
        if (br.kind === 'rope') { b.cyl(0.035, 0.035, l + 0.05, s * (hw + 0.1), 0.95, 0, '#e2c890', { rx: Math.PI / 2, seg: 4 }); b.cyl(0.03, 0.03, l + 0.05, s * (hw + 0.1), 0.5, 0, '#e2c890', { rx: Math.PI / 2, seg: 4 }); }
        else { b.box(0.12, 0.1, l + 0.06, s * (hw + 0.1), 0.98, 0, WOOD, { round: 0.03 }); b.box(0.08, 0.08, l + 0.06, s * (hw + 0.1), 0.55, 0, WOOD, { round: 0.02 }); }
        if (br.kind !== 'rope') b.box(0.18, 0.3, l + 0.05, s * (hw - 0.05), -0.25, 0, WOOD2, {});   // stringers
      }
      b.pop();
    }
  }
  if (br.kind === 'stone') {   // arch underneath the river crossing
    const mx = (pts[0][0] + pts[pts.length - 1][0]) / 2, mz = (pts[0][1] + pts[pts.length - 1][1]) / 2;
    const ry = Math.atan2(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]);
    b.at(mx, mz).push(mx, yAt(L / 2) - 0.45, mz, ry + Math.PI / 2);
    b.torus(L * 0.33, 0.55, 0, -L * 0.12, 0, '#c4b8a6', { arc: Math.PI, sz: 1, sx: 1, sy: 1 });
    b.box(L * 0.25, 1.4, hw * 2 + 0.5, -L * 0.42, -0.6, 0, '#c4b8a6', { round: 0.2, ry: Math.PI / 2 });
    b.pop();
  }
  b.free();
  return out;
}

/** Pier / dock with posts, bollards, lamp and a moored dinghy. */
export function addDock(b, d) {
  const out = { surfaces: [], colliders: [] };
  const ry = d.facing, len = d.len, hw = d.w / 2, y = d.y;
  const cx = (d.x + d.endX) / 2, cz = (d.z + d.endZ) / 2;
  b.at(cx, cz).push(cx, y, cz, ry);
  for (let k = 0; k < Math.round(len / 0.5); k++) b.box(d.w, 0.14, 0.44, 0, -0.07, -len / 2 + 0.25 + k * 0.5, k % 4 ? WOOD3 : WOOD, { round: 0.03, jitter: 0.08 });
  for (let k = 0; k <= Math.round(len / 3); k++) for (const s of [-1, 1]) b.cyl(0.15, 0.15, y + 2.6, s * (hw - 0.05), -(y + 2.6) / 2 + 0.25, -len / 2 + k * len / Math.round(len / 3), WOOD2, { seg: 7 });
  for (const s of [-1, 1]) b.box(0.18, 0.2, len, s * (hw + 0.02), -0.18, 0, WOOD2);
  for (const s of [-1, 1]) { b.push(s * (hw - 0.3), 0, len / 2 - 1.0); addProp(b, { type: 'bollard', x: 0, z: 0, y: 0 }, () => 0); b.pop(); }
  b.push(hw - 0.3, 0, len / 2 - 4); addProp(b, { type: 'lamp', x: 0, z: 0, y: 0 }, () => 0); b.pop();
  b.push(-hw - 1.3, -y + 0.05, len / 2 - 4, 0.15); addProp(b, { type: 'boat', x: 0, z: 0, y: 0, color: '#e8674a' }, () => 0); b.pop();
  // ferry sign at the root
  b.push(hw + 0.6, 0, -len / 2 + 1.0, Math.PI / 2); addProp(b, { type: 'sign', x: 0, z: 0, y: 0 }, () => 0); b.pop();
  b.pop();
  out.surfaces.push({ type: 'box', x: cx, z: cz, hw: hw + 0.05, hd: len / 2 + 0.3, rot: ry, y });
  const fx = Math.sin(ry), fz = Math.cos(ry);
  for (const s of [-1, 1]) out.colliders.push({ type: 'box', x: cx + fz * s * (hw + 0.25), z: cz - fx * s * (hw + 0.25), hw: 0.12, hd: len / 2 - 0.6, rot: ry, tag: 'rail' });
  out.colliders.push({ type: 'box', x: d.endX + fx * 0.35, z: d.endZ + fz * 0.35, hw: hw + 0.3, hd: 0.12, rot: ry, tag: 'rail' });
  b.free();
  return out;
}

/** Cave mouth: a rocky arch with a dark interior, facing `facing` (opening towards +facing). */
export function addCaveMouth(b, cave, heightAt, C = {}) {
  const [ex, ez] = cave.def.entrance, f = cave.def.facing;
  const y = heightAt(ex + Math.sin(f) * 2, ez + Math.cos(f) * 2);
  b.at(ex, ez).push(ex, y, ez, f);
  const rc = C.rock || '#b9a48c', rd = C.rockDark || '#94806c';
  for (let k = 0; k < 9; k++) { const a = (k / 8 - 0.5) * Math.PI * 1.1; b.rock(1.4 + (k % 3) * 0.3, Math.sin(a) * 3.0, 0.6 + Math.cos(a) * 2.6, -0.8 - Math.abs(Math.sin(a)) * 0.4, k % 2 ? rc : rd, { variant: k, sy: 1.1 }); }
  b.box(3.6, 3.4, 0.3, 0, 1.5, -1.6, '#1a1428', { round: 0.9 });
  b.dome(1, 0, 0.02, -0.8, '#2a2140', { sx: 1.7, sy: 0.05, sz: 1.2 });
  for (const s of [-1, 1]) { b.push(s * 2.6, 0, 1.1); addProp(b, { type: 'lantern', x: 0, z: 0, y: 0 }, () => 0); b.pop(); }
  b.pop();
  b.free();
  const fx = Math.sin(f), fz = Math.cos(f);
  return { colliders: [{ type: 'box', x: ex - fx * 1.4, z: ez - fz * 1.4, hw: 2.0, hd: 0.6, rot: f, tag: 'cave' }, { type: 'circle', x: ex + fz * 3.2 - fx * 0.5, z: ez - fx * 3.2 - fz * 0.5, r: 1.3 }, { type: 'circle', x: ex - fz * 3.2 - fx * 0.5, z: ez + fx * 3.2 - fz * 0.5, r: 1.3 }] };
}

/** Route barricade (own object, removed when the gate opens). */
export function buildGate(ctx, g, heightAt, mats) {
  const b = new Builder({ seed: 'gate' + g.id, groundAt: heightAt });
  const y = heightAt(g.x, g.z);
  b.push(g.x, y, g.z, g.rot);
  for (const s of [-1, 1]) { b.box(0.3, 1.3, 0.3, s * g.hw, 0.65, 0, '#e6dccb', { round: 0.08 }); b.cone(0.3, 0.6, s * (g.hw + 0.7), 0.3, 0.4, '#ff8a3c', { seg: 8 }); b.cyl(0.32, 0.32, 0.12, s * (g.hw + 0.7), 0.13, 0.5, '#ffffff', { seg: 8 }); }
  for (let k = 0; k < 8; k++) b.box(g.hw * 2 / 8 + 0.01, 0.32, 0.12, -g.hw + (k + 0.5) * g.hw * 2 / 8, 0.95, 0, k % 2 ? '#ffffff' : '#e8474a', { round: 0.03 });
  for (let k = 0; k < 8; k++) b.box(g.hw * 2 / 8 + 0.01, 0.22, 0.12, -g.hw + (k + 0.5) * g.hw * 2 / 8, 0.45, 0, k % 2 ? '#e8474a' : '#ffffff', { round: 0.03 });
  b.push(g.hw + 1.4, 0, -0.6, -0.3); addProp(b, { type: 'sign', x: 0, z: 0, y: 0 }, () => 0); b.pop();
  b.pop();
  const object = b.build(mats.forBuilder(), { name: 'gate:' + g.id });
  return { object, collider: { type: 'box', x: g.x, z: g.z, hw: g.hw + 1.2, hd: 0.35, rot: g.rot, tag: 'gate' } };
}

/** Standalone props object (contract): builds the list into its own merged group. */
export function buildProps(ctx, list, { heightAt = () => 0, colors, mats } = {}) {
  const b = new Builder({ seed: 'props', groundAt: heightAt });
  for (const p of list) addProp(b, p, heightAt, colors);
  const M = mats?.forBuilder?.() || ctx.worldMats?.forBuilder?.() || { solid: ctx.toon.matVC() };
  return { object: b.build(M, { name: 'props' }), colliders: b.colliders, glows: b.glows };
}

export { THREE };
