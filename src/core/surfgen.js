// Surface detail generator, shared by both graphics modes (see src/core/surfaces.js):
//  - 'codice'   → every layer is generated here from tileable noise / Voronoi (no files at all);
//  - 'immagini' → CC0 photo textures decoded on the main thread go through the same `finalize()`.
// Output per layer (size×size, row 0 = v 0):
//   col RGBA8: RGB = harmonised colour DETAIL (linear, 1.0 = the palette colour, stored ×0.5), A = height
//   nor RGBA8: RG = tangent-space normal xy, B = cavity / ambient occlusion, A = gloss (wet stone, polished tops)
// "Detail" (not colour) is what keeps the look coherent: the palette / vertex colour of every mesh stays
// the base colour, textures only add structure (grain, cracks, blades, tiles) with a little hue variation.
// Runs as a module Worker (codice) or imported on the main thread (fallback + immagini finalize).

const TAU = Math.PI * 2;

// ---- tileable noise ---------------------------------------------------------------------------
function hash2i(i, j, s) {
  let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = t => t * t * (3 - 2 * t);
/** Periodic value noise: lattice of p×q cells over the unit tile. u,v in [0,1). */
function vnoise(u, v, p, q, s) {
  const x = u * p, y = v * q, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const i0 = ((i % p) + p) % p, j0 = ((j % q) + q) % q, i1 = (i0 + 1) % p, j1 = (j0 + 1) % q;
  const a = hash2i(i0, j0, s), b = hash2i(i1, j0, s), c = hash2i(i0, j1, s), d = hash2i(i1, j1, s);
  const sx = fade(fx), sy = fade(fy);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
/** Periodic fbm, base lattice b (cells per tile, anisotropic via ax/ay), oct octaves. 0..1 */
function fbm(u, v, b, oct, s, ax = 1, ay = 1, gain = 0.5) {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(u, v, Math.max(1, Math.round(b * ax * f)), Math.max(1, Math.round(b * ay * f)), s + o * 31);
    norm += amp; amp *= gain; f *= 2;
  }
  return sum / norm;
}
const ridge = n => 1 - Math.abs(n * 2 - 1);
/** Periodic Voronoi (n×m jittered cells). Returns [F1, F2, cellId 0..1, dx, dy] (reused array). */
const VOR = [0, 0, 0, 0, 0];
function voronoi(u, v, n, m, s, jit = 0.85) {
  const x = u * n, y = v * m, ci = Math.floor(x), cj = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0, bx = 0, by = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const ii = ci + di, jj = cj + dj, wi = ((ii % n) + n) % n, wj = ((jj % m) + m) % m;
    const px = ii + 0.5 + (hash2i(wi, wj, s) - 0.5) * jit, py = jj + 0.5 + (hash2i(wi, wj, s + 7) - 0.5) * jit;
    const dx = px - x, dy = py - y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < f1) { f2 = f1; f1 = d; id = hash2i(wi, wj, s + 13); bx = dx; by = dy; } else if (d < f2) f2 = d;
  }
  VOR[0] = f1; VOR[1] = f2; VOR[2] = id; VOR[3] = bx; VOR[4] = by;
  return VOR;
}
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---- procedural layers --------------------------------------------------------------------------
// Each returns {h, l, r, g, b}: height 0..1, luminance detail (~1 mean), chroma ratios (~1).
const OUT = { h: 0, l: 1, r: 1, g: 1, b: 1 };
function set(h, l, r = 1, g = 1, b = 1) { OUT.h = h; OUT.l = l; OUT.r = r; OUT.g = g; OUT.b = b; return OUT; }

export const GEN = {
  leaf(u, v) {
    // overlapping leaves: per cell an elongated, rotated dome; the highest leaf wins (layering)
    const n = 11, x = u * n, y = v * n, ci = Math.floor(x), cj = Math.floor(y);
    let best = 0, lum = 0.8, vein = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      for (let k = 0; k < 2; k++) {
        const ii = ci + di, jj = cj + dj, wi = ((ii % n) + n) % n, wj = ((jj % n) + n) % n, s = 301 + k * 17;
        const px = ii + hash2i(wi, wj, s), py = jj + hash2i(wi, wj, s + 1);
        const a = hash2i(wi, wj, s + 2) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        const dx = x - px, dy = y - py, lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
        const r = 0.55 + hash2i(wi, wj, s + 3) * 0.35;
        const d = Math.sqrt((lx / r) ** 2 + (ly / (r * 0.48)) ** 2);
        if (d >= 1) continue;
        const top = hash2i(wi, wj, s + 4) * 0.5;
        const h = (1 - d * d) * 0.6 + top;
        if (h > best) { best = h; lum = 0.8 + hash2i(wi, wj, s + 5) * 0.28 + (1 - d) * 0.14; vein = Math.abs(ly) < 0.03 * r ? 1 : 0; }
      }
    }
    const h = best;
    const l = best > 0 ? lum * (1 - vein * 0.1) : 0.62;
    return set(h, l, 1 - (lum - 0.9) * 0.1, 1, 1 - (lum - 0.9) * 0.25);
  },
  grass(u, v) {
    // dense blades: anisotropic streaks in many directions (two rotated fields), clumps, dry tips
    const c = fbm(u, v, 6, 3, 11);
    const b1 = fbm(u, v, 48, 2, 21, 1, 0.25), b2 = fbm(u, v, 48, 2, 23, 0.25, 1), b3 = fbm(u, v, 64, 2, 25);
    const blades = Math.max(ridge(b1), ridge(b2)) * 0.6 + b3 * 0.4;
    const h = clamp01(blades * 0.7 + c * 0.35 - 0.05);
    const dry = sstep(0.62, 0.8, fbm(u, v, 10, 2, 29)) * 0.6;
    const l = 0.62 + h * 0.75 + (c - 0.5) * 0.25;
    return set(h, l, 1 + dry * 0.12, 1 + (h - 0.5) * 0.06, 1 - dry * 0.2 - h * 0.06);
  },
  dirt(u, v) {
    const n = fbm(u, v, 5, 5, 41);
    const vr = voronoi(u, v, 22, 22, 43);
    const peb = sstep(0.32, 0.12, vr[0]) * (vr[2] > 0.55 ? 1 : 0);
    const vr2 = voronoi(u, v, 60, 60, 47);
    const grit = sstep(0.3, 0.1, vr2[0]) * (vr2[2] > 0.6 ? 0.6 : 0);
    const h = clamp01(n * 0.6 + peb * 0.5 + grit * 0.25);
    const l = 0.74 + n * 0.42 + peb * (0.04 + vr[2] * 0.16) + grit * 0.05 - (1 - n) * 0.1;
    const warm = fbm(u, v, 4, 2, 49) - 0.5;
    return set(h, l, 1 + warm * 0.12, 1, 1 - warm * 0.16 + peb * 0.1);
  },
  sand(u, v) {
    const w = fbm(u, v, 3, 3, 61);
    const rip = Math.sin((v * 9 + w * 2.2 + u * 1.0) * TAU) * 0.5 + 0.5;
    const grain = vnoise(u, v, 256, 256, 63);
    const shell = sstep(0.18, 0.08, voronoi(u, v, 18, 18, 67)[0]) * (VOR[2] > 0.82 ? 1 : 0);
    const h = clamp01(rip * 0.35 + w * 0.4 + grain * 0.25 + shell * 0.3);
    const l = 0.9 + rip * 0.07 + (grain - 0.5) * 0.16 + (w - 0.5) * 0.12 + shell * 0.15;
    return set(h, l, 1 + shell * 0.05, 1, 1 + (grain - 0.5) * 0.05);
  },
  rock(u, v) {
    const r = ridge(fbm(u, v, 4, 5, 81));
    const vr = voronoi(u, v, 6, 7, 83, 0.9);
    const crack = sstep(0.0, 0.08, vr[1] - vr[0]);
    const strata = Math.sin((v * 7 + fbm(u, v, 3, 3, 85) * 1.5) * TAU) * 0.5 + 0.5;
    const h = clamp01(r * 0.55 + strata * 0.2 + vr[0] * 0.25) * (0.35 + 0.65 * crack);
    const lich = sstep(0.66, 0.78, fbm(u, v, 8, 3, 87)) * 0.5;
    const l = 0.6 + h * 0.65 + (vr[2] - 0.5) * 0.18 - (1 - crack) * 0.2;
    return set(h, l, 1 - lich * 0.1, 1 + lich * 0.12, 1 - lich * 0.08);
  },
  cobble(u, v) {
    const vr = voronoi(u, v, 9, 9, 101, 0.7);
    const edge = vr[1] - vr[0];
    const dome = sstep(0.0, 0.32, edge);
    const n = fbm(u, v, 16, 3, 103);
    const id = vr[2];
    const grout = 1 - sstep(0.02, 0.09, edge);
    const h = clamp01(dome * (0.75 + n * 0.25) - grout * 0.2);
    const l = (0.78 + (id - 0.5) * 0.42 + (n - 0.5) * 0.2 + dome * 0.12) * (1 - grout * 0.45);
    const hue = (hash2i(Math.floor(id * 977), 3, 105) - 0.5);
    return set(h, l, 1 + hue * 0.08, 1, 1 - hue * 0.1 - grout * 0.06);
  },
  plaster(u, v) {
    const blot = fbm(u, v, 4, 4, 121);
    const grain = fbm(u, v, 64, 2, 123);
    const cr = voronoi(u, v, 5, 5, 125, 1.0);
    const crack = (1 - sstep(0.0, 0.025, cr[1] - cr[0])) * sstep(0.6, 0.75, fbm(u, v, 6, 2, 127));
    const h = clamp01(0.5 + (grain - 0.5) * 0.4 + (blot - 0.5) * 0.5 - crack * 0.2);
    const l = 0.94 + (blot - 0.5) * 0.18 + (grain - 0.5) * 0.06 - crack * 0.12;
    return set(h, l, 1 + (blot - 0.5) * 0.04, 1, 1 - (blot - 0.5) * 0.05);
  },
  roof(u, v) {
    // overlapping barrel tiles: 8 columns × 10 rows, rows offset; each tile bulges across u, steps down v
    const rows = 10, cols = 8;
    const y = v * rows, row = Math.floor(y), fy = y - row;
    const x = u * cols + (row % 2) * 0.5, col = Math.floor(x), fx = x - col;
    const id = hash2i(((col % cols) + cols) % cols, row % rows, 141);
    const barrel = Math.sin(fx * Math.PI);
    const lip = sstep(0.0, 0.12, fy) * (0.75 + 0.25 * fy);
    const n = fbm(u, v, 24, 2, 143);
    const h = clamp01(barrel * 0.65 * lip + fy * 0.25 + (n - 0.5) * 0.1);
    const gap = 1 - sstep(0.0, 0.1, Math.min(fx, 1 - fx));
    const l = (0.75 + barrel * 0.25 + (id - 0.5) * 0.35 + (n - 0.5) * 0.12) * (1 - (1 - lip) * 0.45) * (1 - gap * 0.3);
    return set(h, l, 1 + (id - 0.5) * 0.08, 1 - (id - 0.5) * 0.04, 1 - (id - 0.5) * 0.08);
  },
  wood(u, v) {
    // vertical planks (6 per tile), grain along v, gaps, occasional knots
    const planks = 6, x = u * planks, p = Math.floor(x), fx = x - p;
    const id = hash2i(p % planks, 0, 161);
    const off = id * 3.1;
    const grain = fbm(((u * 1 + off) % 1 + 1) % 1, v, 40, 3, 163, 1, 0.06);
    const rings = Math.sin((grain * 9 + fx * 2) * TAU) * 0.5 + 0.5;
    const kv = voronoi(u, v, 6, 3, 165);
    const knot = sstep(0.16, 0.0, kv[0]) * (kv[2] > 0.75 ? 1 : 0);
    const gap = 1 - sstep(0.0, 0.05, Math.min(fx, 1 - fx));
    const h = clamp01(0.62 + (grain - 0.5) * 0.4 + rings * 0.08 - gap * 0.6 - knot * 0.2);
    const l = (0.8 + (id - 0.5) * 0.3 + (grain - 0.5) * 0.45 + rings * 0.08 - knot * 0.35) * (1 - gap * 0.55);
    return set(h, l, 1 + (id - 0.5) * 0.06, 1, 1 - (id - 0.5) * 0.08);
  },
  bark(u, v) {
    const f = fbm(u, v, 10, 4, 181, 1, 0.12);
    const ridges = ridge(f);
    const cr = fbm(u, v, 14, 2, 183, 1, 0.3);
    const deep = sstep(0.42, 0.22, ridges + (cr - 0.5) * 0.3);
    const moss = sstep(0.68, 0.8, fbm(u, v, 5, 2, 185));
    const h = clamp01(ridges * 0.85 + cr * 0.15 - deep * 0.3);
    const l = 0.62 + h * 0.7 - deep * 0.25;
    return set(h, l, 1 - moss * 0.12, 1 + moss * 0.15, 1 - moss * 0.12);
  },
  stone(u, v) {
    // irregular stone wall: horizontally stretched cells, rough faces, mortar
    const vr = voronoi(u, v, 5, 8, 201, 0.75);
    const edge = vr[1] - vr[0];
    const face = sstep(0.0, 0.22, edge);
    const n = fbm(u, v, 12, 4, 203);
    const mortar = 1 - sstep(0.03, 0.1, edge);
    const h = clamp01(face * (0.65 + n * 0.35) - mortar * 0.2);
    const l = (0.74 + (vr[2] - 0.5) * 0.4 + (n - 0.5) * 0.3 + face * 0.1) * (1 - mortar * 0.25);
    const hue = vr[2] - 0.5;
    return set(h, l, 1 + hue * 0.08, 1 + hue * 0.02, 1 - hue * 0.1 + mortar * 0.04);
  },
  thatch(u, v) {
    const rows = 6, y = v * rows, row = Math.floor(y), fy = y - row;
    const straw = fbm(u, v, 90, 2, 221, 1, 0.08);
    const s2 = fbm(u, v, 140, 2, 223, 1, 0.1);
    const h = clamp01(ridge(straw) * 0.6 + s2 * 0.2 + fy * 0.35);
    const l = (0.72 + h * 0.45) * (0.7 + 0.3 * sstep(0.0, 0.2, fy));
    const dry = fbm(u, v, 5, 2, 225) - 0.5;
    return set(h, l, 1 + dry * 0.1, 1 + dry * 0.04, 1 - dry * 0.15);
  },
};

/** Per-layer finishing parameters: normal strength (from height), cavity strength, gloss bias. */
const FIN = {
  grass: { nk: 3.2, ak: 0.9, gloss: 0.1 }, dirt: { nk: 3.4, ak: 1.0, gloss: 0.1 }, sand: { nk: 1.3, ak: 0.5, gloss: 0.15 },
  rock: { nk: 5, ak: 1.2, gloss: 0.25 }, cobble: { nk: 5, ak: 1.3, gloss: 0.45 }, plaster: { nk: 2.0, ak: 0.6, gloss: 0.1 },
  roof: { nk: 5, ak: 1.2, gloss: 0.35 }, wood: { nk: 3.4, ak: 1.0, gloss: 0.25 }, bark: { nk: 5, ak: 1.3, gloss: 0.1 },
  stone: { nk: 5, ak: 1.2, gloss: 0.3 }, thatch: { nk: 4, ak: 1.0, gloss: 0.1 }, leaf: { nk: 3, ak: 1.1, gloss: 0.45 },
};

/** Generate one procedural layer → {col, nor} Uint8Arrays (size² × 4). */
export function generateLayer(name, size) {
  const g = GEN[name];
  const n = size * size;
  const H = new Float32Array(n), C = new Float32Array(n * 3);
  for (let j = 0; j < size; j++) {
    const v = j / size;
    for (let i = 0; i < size; i++) {
      const o = g(i / size, v);
      const k = j * size + i;
      H[k] = o.h; C[k * 3] = o.l * o.r; C[k * 3 + 1] = o.l * o.g; C[k * 3 + 2] = o.l * o.b;
    }
  }
  return finalize(name, size, C, H, null);
}

/**
 * Shared finishing step. C: linear colour detail per pixel (any scale: re-normalised to mean 1),
 * H: height 0..1, NXY: optional tangent normal xy (−1..1) from a photo normal map (else derived from H).
 * opts.chroma: how much hue variation to keep (photo textures are strongly tinted; codice already ~1).
 */
export function finalize(name, size, C, H, NXY, opts = {}) {
  const n = size * size, F = FIN[name] || FIN.plaster;
  const chromaKeep = opts.chroma ?? 1, contrast = opts.contrast ?? 1;
  // normalise: mean luminance → 1, keep only a fraction of the hue deviation
  let mr = 0, mg = 0, mb = 0;
  for (let k = 0; k < n; k++) { mr += C[k * 3]; mg += C[k * 3 + 1]; mb += C[k * 3 + 2]; }
  mr /= n; mg /= n; mb /= n;
  const mL = 0.2126 * mr + 0.7152 * mg + 0.0722 * mb || 1;
  // normalise height to 0..1
  let hMin = 1e9, hMax = -1e9;
  for (let k = 0; k < n; k++) { if (H[k] < hMin) hMin = H[k]; if (H[k] > hMax) hMax = H[k]; }
  const hS = 1 / Math.max(1e-4, hMax - hMin);
  for (let k = 0; k < n; k++) H[k] = (H[k] - hMin) * hS;
  // blurred height (box blur radius size/32, separable, wrapped) for cavity / AO
  const B = blurWrap(H, size, Math.max(2, size >> 5));
  const col = new Uint8Array(n * 4), nor = new Uint8Array(n * 4);
  const nk = F.nk * size / 256;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const k = j * size + i;
    const r = C[k * 3] / mr, g = C[k * 3 + 1] / mg, b = C[k * 3 + 2] / mb;   // per-channel ratio ~1
    let L = (0.2126 * C[k * 3] + 0.7152 * C[k * 3 + 1] + 0.0722 * C[k * 3 + 2]) / mL;
    L = Math.pow(Math.max(0, L), contrast);
    const lr = (0.2126 * r + 0.7152 * g + 0.0722 * b) || 1;
    const cr = lerp(1, r / lr, chromaKeep), cg = lerp(1, g / lr, chromaKeep), cb = lerp(1, b / lr, chromaKeep);
    col[k * 4] = Math.min(255, L * cr * 127.5);
    col[k * 4 + 1] = Math.min(255, L * cg * 127.5);
    col[k * 4 + 2] = Math.min(255, L * cb * 127.5);
    col[k * 4 + 3] = H[k] * 255;
    let nx, ny;
    if (NXY) { nx = NXY[k * 2]; ny = NXY[k * 2 + 1]; }
    else {
      const il = j * size + ((i + size - 1) % size), ir = j * size + ((i + 1) % size);
      const jd = ((j + size - 1) % size) * size + i, ju = ((j + 1) % size) * size + i;
      const dx = (H[ir] - H[il]) * nk, dy = (H[ju] - H[jd]) * nk;
      const l = Math.sqrt(dx * dx + dy * dy + 1);
      nx = -dx / l; ny = -dy / l;
    }
    const cav = clamp01(0.62 + (H[k] - B[k]) * F.ak * 1.6 + (H[k] - 0.5) * 0.25);
    nor[k * 4] = clamp01(nx * 0.5 + 0.5) * 255;
    nor[k * 4 + 1] = clamp01(ny * 0.5 + 0.5) * 255;
    nor[k * 4 + 2] = cav * 255;
    nor[k * 4 + 3] = clamp01(F.gloss * (0.4 + H[k] * 0.9)) * 255;
  }
  return { col, nor };
}

function blurWrap(src, size, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), w = 2 * r + 1;
  for (let j = 0; j < size; j++) {
    let s = 0; for (let d = -r; d <= r; d++) s += src[j * size + ((d + size) % size)];
    for (let i = 0; i < size; i++) {
      tmp[j * size + i] = s / w;
      s += src[j * size + ((i + r + 1) % size)] - src[j * size + ((i - r + size) % size)];
    }
  }
  for (let i = 0; i < size; i++) {
    let s = 0; for (let d = -r; d <= r; d++) s += tmp[((d + size) % size) * size + i];
    for (let j = 0; j < size; j++) {
      out[j * size + i] = s / w;
      s += tmp[((j + r + 1) % size) * size + i] - tmp[((j - r + size) % size) * size + i];
    }
  }
  return out;
}

// ---- worker entry -------------------------------------------------------------------------------
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = e => {
    const { names, size } = e.data || {};
    for (let i = 0; i < names.length; i++) {
      const { col, nor } = generateLayer(names[i], size);
      self.postMessage({ i, name: names[i], col, nor }, [col.buffer, nor.buffer]);
    }
    self.postMessage({ done: true });
  };
}
