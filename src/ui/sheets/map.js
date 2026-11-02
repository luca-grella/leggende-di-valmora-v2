// Sheet "map": a stylized archipelago map (SVG) built from ctx.world.minimap(): sea with soft wave pattern,
// islands with sandy shores tinted per island, routes, ferry lines, town pins with labels, the tracked
// objective (pulsing star) and the player (arrow). Drag to pan, pinch / ± to zoom, ◎ re-centres on the player.
// When the world has no minimap data yet it draws a fallback layout of the 7 islands from the GDD.
import { el, onTap } from '../dom.js';
import { icon } from '../icons.js';

const TINT = {
  aurora: ['#9bd85a', '#6fbf3e'], giada: ['#5fbf5a', '#3f9e3a'], nebbia: ['#b49ad8', '#8f74bd'], gelida: ['#eef6ff', '#bfd8ef'],
  coralline: ['#a6e07a', '#7cc95a'], sole: ['#7fcf5a', '#4e9a3a'], ramato: ['#e59a62', '#c9733f'],
};
const FALLBACK = {
  bounds: { minX: -700, maxX: 700, minZ: -700, maxZ: 700 },
  isl: [['aurora', 'Isola Aurora', 0, 0, 230], ['giada', 'Isola di Giada', 440, -380, 150], ['nebbia', 'Isola della Nebbia', 0, -500, 150],
    ['gelida', 'Isola Gelida', -440, -420, 165], ['coralline', 'Isole Coralline', 20, 470, 140], ['sole', 'Isola del Sole', 450, 420, 150], ['ramato', 'Altopiano Ramato', -450, 380, 160]],
  towns: [['alba', 'Borgo Alba', 0, 30], ['petalo', 'Villa Petalo', -160, 10], ['fulgida', 'Città Fulgida', 160, -20], ['muschio', 'Borgo Muschio', 440, -370],
    ['fosco', 'Castelfosco', 0, -500], ['cristallo', 'Borgo Cristallo', -440, -400], ['corallo', 'Porto Corallo', 20, 450], ['sole', 'Baia del Sole', 450, 410], ['ramata', 'Rocca Ramata', -450, 370]],
  routes: [['r1', 'alba', 'petalo'], ['r2', 'alba', 'fulgida'], ['r3', 'fulgida', 'muschio'], ['r4', 'muschio', 'fosco'], ['r5', 'fosco', 'cristallo']],
  ferries: [['alba_corallo', 'alba', 'corallo'], ['corallo_sole', 'corallo', 'sole'], ['petalo_ramata', 'petalo', 'ramata'], ['fulgida_corallo', 'fulgida', 'corallo']],
};

function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function blob(cx, cz, r, seed) {
  const rnd = seeded(seed), n = 22, pts = [];
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.16 * Math.sin(a * 2 + ph[0]) + 0.1 * Math.sin(a * 3 + ph[1]) + 0.06 * Math.sin(a * 5 + ph[2]);
    pts.push([cx + Math.cos(a) * r * k, cz + Math.sin(a) * r * k * 0.82]);
  }
  return pts;
}
/** Smooth closed path through points (Catmull-Rom → cubic Bézier). */
function smoothPath(pts, closed = true) {
  if (!pts?.length) return '';
  const P = i => pts[(i + pts.length) % pts.length];
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const p0 = closed ? P(i - 1) : pts[Math.max(0, i - 1)], p1 = P(i), p2 = closed ? P(i + 1) : pts[Math.min(pts.length - 1, i + 1)], p3 = closed ? P(i + 2) : pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + (closed ? ' Z' : '');
}
const pt = p => (Array.isArray(p) ? { x: p[0], z: p[1] } : p && typeof p === 'object' ? { x: p.x, z: p.z } : null);

function readMap(ctx) {
  let m = null;
  try { m = ctx.world?.minimap?.() || null; } catch { m = null; }
  if (m?.islands?.length) return { ...m, fallback: false };
  const F = FALLBACK;
  return {
    fallback: true, bounds: F.bounds,
    islands: F.isl.map(([id, name, x, z, r], i) => ({ id, name, cx: x, cz: z, outline: id === 'coralline' ? null : blob(x, z, r, i * 97 + 13), parts: id === 'coralline' ? [blob(x - 40, z, r * 0.7, 501), blob(x + 110, z + 50, r * 0.32, 502), blob(x - 150, z + 70, r * 0.26, 503)] : null })),
    towns: F.towns.map(([id, name, x, z]) => ({ id, name, x, z })),
    routes: F.routes.map(([id, a, b]) => ({ id, a, b })),
    ferries: F.ferries.map(([id, a, b]) => ({ id, a, b })),
  };
}

export function render(ctx, root) {
  const M = readMap(ctx);
  const B = M.bounds || { minX: -700, maxX: 700, minZ: -700, maxZ: 700 };
  const W = B.maxX - B.minX, H = B.maxZ - B.minZ;
  const town = id => M.towns?.find(t => t.id === id);
  const endPt = e => (typeof e === 'string' ? town(e) : pt(e));
  const S = Math.max(W, H) / 1000;                 // stroke scale

  // ── SVG ──
  const NS = 'http://www.w3.org/2000/svg';
  let svg = `<svg xmlns="${NS}" class="mp-svg" viewBox="${B.minX} ${B.minZ} ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <defs>
      <radialGradient id="mpSea" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#5fe3d6"/><stop offset=".55" stop-color="#2bb7c9"/><stop offset="1" stop-color="#1673a8"/></radialGradient>
      <pattern id="mpWave" width="${60 * S}" height="${34 * S}" patternUnits="userSpaceOnUse"><path d="M0 ${17 * S} q${15 * S} ${-9 * S} ${30 * S} 0 t${30 * S} 0" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="${2.6 * S}" stroke-linecap="round"/></pattern>
      <filter id="mpShadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="${6 * S}" stdDeviation="${5 * S}" flood-color="#0b4a6e" flood-opacity=".35"/></filter>
    </defs>
    <rect x="${B.minX - W}" y="${B.minZ - H}" width="${W * 3}" height="${H * 3}" fill="url(#mpSea)"/>
    <rect x="${B.minX - W}" y="${B.minZ - H}" width="${W * 3}" height="${H * 3}" fill="url(#mpWave)"/>`;
  // ferries (under islands)
  for (const f of M.ferries || []) {
    const a = endPt(f.a), b = endPt(f.b); if (!a || !b) continue;
    const open = !f.gate || ctx.world?.canPass?.(f.gate) !== false;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, dx = b.x - a.x, dz = b.z - a.z;
    const cx = mx - dz * 0.18, cz = mz + dx * 0.18;
    svg += `<path d="M${a.x} ${a.z} Q${cx} ${cz} ${b.x} ${b.z}" fill="none" stroke="${open ? '#fff' : '#a9c6d6'}" stroke-opacity=".9" stroke-width="${5 * S}" stroke-dasharray="${14 * S} ${12 * S}" stroke-linecap="round"/>`;
    svg += `<g transform="translate(${cx * 0.5 + mx * 0.5} ${cz * 0.5 + mz * 0.5}) scale(${0.34 * S})"><circle r="44" fill="#fff" stroke="#2a2140" stroke-width="7"/><g transform="translate(-50 -50)">${icon(open ? 'ferry' : 'lock').replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g></g>`;
  }
  // islands
  for (const isl of M.islands || []) {
    const [c0, c1] = TINT[isl.id] || TINT.aurora;
    const shapes = isl.parts || [isl.outline];
    for (const o of shapes) {
      if (!o?.length) continue;
      const d = smoothPath(o.map(p => (Array.isArray(p) ? p : [p.x, p.z])));
      svg += `<g filter="url(#mpShadow)"><path d="${d}" fill="#f6dfa0" stroke="#f6dfa0" stroke-width="${26 * S}" stroke-linejoin="round"/></g>`;
      svg += `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="${34 * S}" stroke-linejoin="round" style="mix-blend-mode:screen" opacity=".35"/>`;
      svg += `<path d="${d}" fill="${c0}" stroke="${c1}" stroke-width="${5 * S}" stroke-linejoin="round"/>`;
    }
    const c = isl.cx != null ? { x: isl.cx, z: isl.cz } : centroid(isl.outline);
    if (c && isl.name) svg += `<text class="mp-isl" x="${c.x}" y="${c.z + 70 * S}" font-size="${22 * S}" text-anchor="middle">${isl.name}</text>`;
  }
  // routes
  for (const r of M.routes || []) {
    let pts = r.points?.length ? r.points.map(p => (Array.isArray(p) ? p : [p.x, p.z])) : null;
    if (!pts) { const a = endPt(r.a), b = endPt(r.b); if (!a || !b) continue; pts = [[a.x, a.z], [(a.x + b.x) / 2 + (b.z - a.z) * 0.08, (a.z + b.z) / 2 - (b.x - a.x) * 0.08], [b.x, b.z]]; }
    const d = smoothPath(pts, false);
    svg += `<path d="${d}" fill="none" stroke="#2a2140" stroke-opacity=".35" stroke-width="${15 * S}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#f3d39a" stroke-width="${9 * S}" stroke-linecap="round"/>`;
  }
  // towns
  const here = ctx.world?.area || ctx.save?.state?.player?.area;
  for (const t of M.towns || []) {
    const cur = t.id === here;
    svg += `<g class="mp-town${cur ? ' cur' : ''}" transform="translate(${t.x} ${t.z})"><circle r="${(cur ? 17 : 13) * S}" fill="${cur ? '#ffc93c' : '#fff'}" stroke="#2a2140" stroke-width="${5 * S}"/><circle r="${5 * S}" fill="#ff6a4d"/>
      <text y="${-24 * S}" font-size="${(cur ? 26 : 22) * S}" text-anchor="middle" stroke-width="${7 * S}">${t.name}</text></g>`;
  }
  // objective
  const obj = (() => { try { return ctx.story?.quests?.objective?.() || null; } catch { return null; } })();
  let objPt = obj?.target ? pt(obj.target) : obj?.areaId ? town(obj.areaId) : null;
  if (objPt) svg += `<g class="mp-obj" transform="translate(${objPt.x} ${objPt.z})"><circle class="mp-pulse" r="${30 * S}" fill="#ffc93c" opacity=".45"/><g transform="scale(${0.42 * S}) translate(-50 -58)">${inner('star')}</g></g>`;
  // player
  const p = ctx.player?.position || ctx.cameraRig?.followed?.position;
  const inMap = p && !ctx.world?.interior;
  const px = p ? p.x : 0, pz = p ? p.z : 0;
  if (inMap) {
    const f = ctx.player?.facing ?? 0;
    svg += `<g class="mp-me" transform="translate(${px} ${pz})"><circle class="mp-pulse me" r="${26 * S}" fill="#ff5b4a" opacity=".35"/><g transform="rotate(${(180 - f * 180 / Math.PI).toFixed(1)}) scale(${0.36 * S}) translate(-50 -50)">${inner('player')}</g></g>`;
  }
  svg += '</svg>';

  // ── viewport with pan/zoom ──
  const stageEl = el('div.mp-stage', { html: svg });
  const view = el('div.mp-view', stageEl);
  const zoomIn = el('button.round.mp-z', { type: 'button', 'aria-label': 'Ingrandisci' }, '+');
  const zoomOut = el('button.round.mp-z', { type: 'button', 'aria-label': 'Riduci' }, '−');
  const centre = el('button.round.mp-z', { type: 'button', 'aria-label': 'Centra', html: icon('pin') });
  const ctrls = el('div.mp-ctrls', zoomIn, zoomOut, centre);
  const legend = el('div.mp-legend',
    el('span', el('i', { html: icon('player') }), 'Tu'),
    obj ? el('span', el('i', { html: icon('star') }), obj.title || 'Obiettivo') : null,
    el('span', el('i', { html: icon('ferry') }), 'Traghetto'));
  const placeName = here ? (ctx.world?.areaDef?.(here)?.name || '') : '';
  const where = el('div.mp-where', el('span', { html: icon('pin') }), placeName || 'Arcipelago di Valmora');
  root.append(el('div.mp-wrap', view, where, ctrls, legend));
  root.classList.add('mp-root');

  let z = 1, tx = 0, ty = 0;
  const apply = (smooth = false) => { stageEl.style.transition = smooth ? 'transform .35s cubic-bezier(.3,.7,.3,1)' : 'none'; stageEl.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`; };
  const clampPan = () => {
    const r = view.getBoundingClientRect();
    const lim = (r.width * z) / 2 + r.width * 0.1, limY = (r.height * z) / 2 + r.height * 0.1;
    tx = Math.max(-lim, Math.min(lim, tx)); ty = Math.max(-limY, Math.min(limY, ty));
  };
  function focusOn(x, zz, zoom, smooth = true) {
    const r = view.getBoundingClientRect();
    const s = Math.min(r.width / W, r.height / H);   // svg units → px at zoom 1
    z = zoom; tx = -((x - (B.minX + W / 2)) * s) * z; ty = -((zz - (B.minZ + H / 2)) * s) * z;
    clampPan(); apply(smooth);
  }
  const zoomBy = (k, smooth = true) => { const nz = Math.max(1, Math.min(5, z * k)); tx *= nz / z; ty *= nz / z; z = nz; clampPan(); apply(smooth); };
  onTap(zoomIn, () => zoomBy(1.5));
  onTap(zoomOut, () => zoomBy(1 / 1.5));
  onTap(centre, () => (inMap ? focusOn(px, pz, 2.6) : focusOn(B.minX + W / 2, B.minZ + H / 2, 1)));

  // drag + pinch
  const ptrs = new Map();
  let pinch0 = 0, z0 = 1;
  view.addEventListener('pointerdown', e => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { view.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); z0 = z; }
  });
  view.addEventListener('pointermove', e => {
    const prev = ptrs.get(e.pointerId); if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (ptrs.size === 1) { tx += cur.x - prev.x; ty += cur.y - prev.y; clampPan(); apply(); }
    ptrs.set(e.pointerId, cur);
    if (ptrs.size === 2 && pinch0) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const nz = Math.max(1, Math.min(5, z0 * d / pinch0)); tx *= nz / z; ty *= nz / z; z = nz; clampPan(); apply(); }
  });
  const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; };
  view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
  view.addEventListener('wheel', e => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, false); }, { passive: false });

  // start centred on the player (or the whole map)
  requestAnimationFrame(() => (inMap && !M.fallback ? focusOn(px, pz, 2.2, false) : focusOn(B.minX + W / 2, B.minZ + H / 2, 1, false)));
  return { noAutoRefresh: true };
}

function inner(name) { return icon(name).replace(/^<svg[^>]*>|<\/svg>$/g, ''); }
function centroid(o) {
  if (!o?.length) return null;
  let x = 0, z = 0; for (const p of o) { x += Array.isArray(p) ? p[0] : p.x; z += Array.isArray(p) ? p[1] : p.z; }
  return { x: x / o.length, z: z / o.length };
}
