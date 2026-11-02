// Dirt paths and streets as smooth ribbons laid on the terrain (one merged mesh per island): curvy,
// with a soft wobbly edge and a slightly darker rim, instead of grid-aligned zigzags in the terrain
// mask. City streets use the same ribbon with a cobble pattern.
import * as THREE from 'three';
import { extendToon } from './mats.js';
import { GLSL_NOISE } from './terrain.js';
import { SURF } from '../core/surfaces.js';

const VERT_PARS = 'attribute vec3 aEdge;\nvarying vec3 vEdge;\nvarying vec3 vPW;\n';
const FRAG = /* glsl */`
  float e = length(vec2(vEdge.x, vEdge.y));
  float n = vnoise(vPW.xz * 0.9) * 0.18 + vnoise(vPW.xz * 3.1) * 0.06;
  // ragged edge follows the texture relief: pebbles and cobbles poke into the grass
  int pl = vEdge.z > 0.5 ? ${SURF.cobble} : ${SURF.dirt};
  float th = texture(uSurfCol, vec3(vPW.xz / uSurfScale[pl], float(pl))).a;
  if (e > 0.97 + n - 0.09 + (th - 0.5) * 0.22) discard;
  vec3 pc = vColor;
  pc *= 0.93 + 0.1 * vnoise(vPW.xz * 0.5) + 0.04 * step(0.82, vnoise(vPW.xz * 2.3));
  pc *= 1.0 - 0.16 * smoothstep(0.74, 0.95, e - n * 0.5);   // worn darker rim
  diffuseColor.rgb = pc;
`;

/**
 * @param {any} ctx
 * @param {{id:string, layout:any, hf:any, colors:any}} desc
 */
export function buildPaths(ctx, desc) {
  const L = desc.layout, id = desc.id, C = desc.colors, h = desc.hf.heightAt;
  const runs = [];
  for (const Rt of Object.values(L.routes)) {
    if (Rt.island !== id) continue;
    let cur = [];
    Rt.poly.pts.forEach((p, i) => {
      const s = Rt.poly.cum[i];
      const onBridge = Rt.spans.some(b => s > b.s0 + 0.8 && s < b.s1 - 0.8);
      if (onBridge) { if (cur.length > 1) runs.push({ pts: cur, hw: Rt.width / 2, kind: 0 }); cur = []; }
      else cur.push(p);
    });
    if (cur.length > 1) runs.push({ pts: cur, hw: Rt.width / 2, kind: 0 });
  }
  for (const p of L.paths) if (p.island === id) runs.push({ pts: p.poly ? p.poly.pts : p.pts, hw: p.width / 2, kind: 0 });
  for (const T of Object.values(L.towns)) {
    if (T.island !== id) continue;
    const city = T.style === 'city' ? 1 : 0;
    for (const s of T.streets) runs.push({ pts: [[s.ax, s.az], [s.bx, s.bz]], hw: s.w / 2, kind: city, ext: 1.5, round: true });
    for (const s of T.doorPaths) runs.push({ pts: [[s.ax, s.az], [s.bx, s.bz]], hw: s.w / 2, kind: city, ext: 0.6 });
  }
  const pos = [], nor = [], col = [], edge = [], idx = [], srf = [];
  const cDirt = new THREE.Color(C.path), cCob = new THREE.Color(C.plaza), c = new THREE.Color();
  const ACROSS = 5;
  for (const r of runs) {
    // resample at ~1 m, extending the ends a little
    let pts = r.pts.map(p => [p[0], p[1]]);
    if (r.ext) {
      const [a, b] = [pts[0], pts[1]], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      pts[0] = [a[0] - (b[0] - a[0]) / l * r.ext * 0.3, a[1] - (b[1] - a[1]) / l * r.ext * 0.3];
      const [y2, z2] = [pts[pts.length - 2], pts[pts.length - 1]], l2 = Math.hypot(z2[0] - y2[0], z2[1] - y2[1]) || 1;
      pts[pts.length - 1] = [z2[0] + (z2[0] - y2[0]) / l2 * r.ext, z2[1] + (z2[1] - y2[1]) / l2 * r.ext];
    }
    const sp = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / 1.0));
      for (let k = 0; k < n; k++) sp.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
    }
    sp.push(pts[pts.length - 1]);
    if (sp.length < 2) continue;
    const base = pos.length / 3, W = r.hw + 0.55;
    let segLen = 1; { let tot = 0; for (let i = 1; i < sp.length; i++) tot += Math.hypot(sp[i][0] - sp[i - 1][0], sp[i][1] - sp[i - 1][1]); segLen = tot / Math.max(1, sp.length - 1); }
    for (let i = 0; i < sp.length; i++) {
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(sp.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      for (let k = 0; k < ACROSS; k++) {
        const u = k / (ACROSS - 1) * 2 - 1, off = u * W;
        const x = sp[i][0] - tz * off, z = sp[i][1] + tx * off;
        pos.push(x, Math.max(h(x, z), h(x + 0.7, z), h(x - 0.7, z), h(x, z + 0.7), h(x, z - 0.7)) + 0.05, z);
        nor.push(0, 1, 0);
        c.copy(r.kind ? cCob : cDirt);
        col.push(c.r, c.g, c.b);
        const dEnd = Math.min(i, sp.length - 1 - i) * segLen;
        edge.push(off / r.hw, r.round ? Math.max(0, 1 - dEnd / r.hw) : 0, r.kind);
        srf.push((r.kind ? SURF.cobble : SURF.dirt) + 1);
      }
      if (i > 0) for (let k = 0; k < ACROSS - 1; k++) {
        const p0 = base + (i - 1) * ACROSS + k, p1 = base + i * ACROSS + k;
        idx.push(p0, p0 + 1, p1, p1, p0 + 1, p1 + 1);
      }
    }
  }
  if (!idx.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 3));
  geo.setAttribute('aSurf', new THREE.Float32BufferAttribute(srf, 1));
  geo.setIndex(idx);
  // terrain-like normals from the heightfield for correct toon shading on slopes
  const P = geo.attributes.position, Nn = geo.attributes.normal;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), e = 0.75;
    const dx = h(x - e, z) - h(x + e, z), dz = h(x, z - e) - h(x, z + e), l = Math.hypot(dx, 2 * e, dz);
    Nn.setXYZ(i, dx / l, 2 * e / l, dz / l);
  }
  geo.computeBoundingSphere();
  const mat = extendToon(ctx.toon.matUnique('#ffffff', { vertexColors: true, surf: 'attr' }), 'pathribbon', sh => {
    sh.vertexShader = VERT_PARS + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = aEdge; vPW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vEdge;\nvarying vec3 vPW;\n' + sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_NOISE)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG);
  });
  mat.polygonOffset = true; mat.polygonOffsetFactor = -3; mat.polygonOffsetUnits = -4;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'paths:' + id; mesh.receiveShadow = true; mesh.renderOrder = 1; mesh.matrixAutoUpdate = false;
  return mesh;
}
