// Builds rigged GLB humans from MakeHuman CC0 data (base mesh, targets, mixamo rig + weights, mhclo proxies).
// usage: node build.mjs <config.json> <out.glb>
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { writeGLB } from './glb.mjs';

// MH_DATA = folder with mpfbsrc/ (unzipped MPFB 2.0.18 extension) and mh/ (unzipped CC0 asset packs)
const SP = process.env.MH_DATA || '.';
const MP = SP + '/mpfbsrc/data';
const SYS = SP + '/mh';           // extracted asset packs root (contains clothes/, eyes/, hair/, skins/ ...)
const TEX = SP + '/tex';          // resized textures
fs.mkdirSync(TEX, { recursive: true });
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];

// ---------- base mesh ----------
function parseObj(file) {
  const v = [], vt = [], faces = []; let group = '', mat = '';
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') v.push(+p[1], +p[2], +p[3]);
    else if (p[0] === 'vt') vt.push(+p[1], +p[2]);
    else if (p[0] === 'g') group = p.slice(1).join(' ');
    else if (p[0] === 'usemtl') mat = p[1];
    else if (p[0] === 'f') {
      const c = p.slice(1).map(s => { const q = s.split('/'); return [parseInt(q[0]) - 1, q[1] ? parseInt(q[1]) - 1 : -1]; });
      faces.push({ c, group, mat });
    }
  }
  return { v: Float64Array.from(v), vt, faces };
}
const base = parseObj(MP + '/3dobjs/base.obj');
const NV = base.v.length / 3;
const groups = JSON.parse(fs.readFileSync(MP + '/mesh_metadata/basemesh_vertex_groups.json', 'utf8'));
const inGroup = (name) => { const out = []; for (const [a, b] of groups[name]) for (let i = a; i <= b; i++) out.push(i); return out; };

function readTarget(rel) {
  const f = rel.startsWith('/') ? rel : MP + '/targets/' + rel + '.target.gz';
  const txt = zlib.gunzipSync(fs.readFileSync(f)).toString('utf8');
  const d = [];
  for (const line of txt.split('\n')) { const p = line.trim().split(/\s+/); if (p.length >= 4 && !line.startsWith('#')) d.push([+p[0], +p[1], +p[2], +p[3]]); }
  return d;
}
const V = Float64Array.from(base.v);
const applyTarget = (arr, d, w) => { for (const [i, x, y, z] of d) { arr[i * 3] += x * w; arr[i * 3 + 1] += y * w; arr[i * 3 + 2] += z * w; } };
for (const [t, w] of cfg.targets) applyTarget(V, readTarget(t), w);
// expression morph targets (deltas on base, applied on top of shaped mesh)
const morphDefs = (cfg.morphs || []).map(m => {
  const MV = Float64Array.from(V);
  for (const [t, w] of m.parts) applyTarget(MV, readTarget(t), w);
  return { name: m.name, V: MV };
});

// ---------- units / ground ----------
const S = 0.1;
const body = inGroup('body');
let minY = Infinity; for (const i of body) minY = Math.min(minY, V[i * 3 + 1]);
const P = (arr, i) => [arr[i * 3] * S, (arr[i * 3 + 1] - minY) * S, arr[i * 3 + 2] * S];
const mean = (arr, idx) => { const m = [0, 0, 0]; for (const i of idx) { const p = P(arr, i); m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; } return m.map(x => x / idx.length); };

// ---------- rig ----------
const rigJ = JSON.parse(fs.readFileSync(MP + '/rigs/standard/rig.mixamo.json', 'utf8')).bones;
const strip = n => n.replace('mixamorig:', '');
const order = []; const seen = new Set();
const visit = (n) => { if (seen.has(n)) return; const p = rigJ[n].parent; if (p) visit(p); seen.add(n); order.push(n); };
Object.keys(rigJ).forEach(visit);
const endPos = (e) => e.strategy === 'CUBE' ? mean(V, inGroup(e.cube_name)) : mean(V, e.vertex_indices);
const bones = order.map(n => ({ name: strip(n), parent: rigJ[n].parent ? order.indexOf(rigJ[n].parent) : -1, head: endPos(rigJ[n].head), tail: endPos(rigJ[n].tail) }));
const bi = Object.fromEntries(bones.map((b, i) => [b.name, i]));
// extra eye bones (children of Head)
for (const side of ['l', 'r']) {
  const c = mean(V, inGroup('helper-' + side + '-eye'));
  bones.push({ name: side === 'l' ? 'LeftEye' : 'RightEye', parent: bi.Head, head: c, tail: [c[0], c[1], c[2] + 0.02] });
  bi[bones[bones.length - 1].name] = bones.length - 1;
}

// ---------- weights ----------
const wJ = JSON.parse(fs.readFileSync(MP + '/rigs/standard/weights.mixamo.json', 'utf8')).weights;
const vw = Array.from({ length: NV }, () => []);
for (const [bn, list] of Object.entries(wJ)) { const b = bi[strip(bn)]; if (b === undefined) continue; for (const [i, w] of list) vw[i].push([b, w]); }
const top4 = (list) => {
  const m = new Map(); for (const [b, w] of list) m.set(b, (m.get(b) || 0) + w);
  const a = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4); let s = a.reduce((t, x) => t + x[1], 0) || 1;
  if (!a.length) a.push([bi.Hips, 1]);
  while (a.length < 4) a.push([0, 0]);
  return a.map(([b, w]) => [b, w / s]);
};

// ---------- textures ----------
function texture(file, size, keepAlpha) {
  const nm = path.basename(file).replace(/\.\w+$/, '');
  const out = TEX + '/' + nm + '_' + size + (keepAlpha ? '.png' : '.jpg');
  if (!fs.existsSync(out)) {
    if (keepAlpha) execFileSync('sips', ['-Z', String(size), file, '--out', out], { stdio: 'ignore' });
    else execFileSync('sips', ['-Z', String(size), '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', file, '--out', out], { stdio: 'ignore' });
  }
  return { name: nm, file: out };
}
const materials = [];
const addMat = (m) => { materials.push(m); return materials.length - 1; };

// ---------- mesh assembly ----------
const meshes = [];
function buildMesh(name, faces, getPos, getW, uvs, matIndex, morphPos, keepV) {
  // faces: [{c:[[vi,ti]...]}]; getPos(vi, arr) -> [x,y,z]
  const key = new Map(); const pos = [], uv = [], jo = [], we = [], idx = [], src = [];
  for (const f of faces) {
    const ids = f.c.map(([vi, ti]) => {
      const k = vi * 100000 + ti; let id = key.get(k);
      if (id === undefined) { id = src.length; key.set(k, id); src.push(vi); pos.push(...getPos(vi, null)); uv.push(uvs[ti * 2], 1 - uvs[ti * 2 + 1]); for (const [b, w] of getW(vi)) { jo.push(b); we.push(w); } }
      return id;
    });
    for (let k = 1; k + 1 < ids.length; k++) idx.push(ids[0], ids[k], ids[k + 1]);
  }
  // smooth normals welded by source vertex
  const nAcc = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const pa = pos.slice(a * 3, a * 3 + 3), pb = pos.slice(b * 3, b * 3 + 3), pc = pos.slice(c * 3, c * 3 + 3);
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const id of [a, b, c]) { const s = src[id]; const q = nAcc.get(s) || [0, 0, 0]; q[0] += n[0]; q[1] += n[1]; q[2] += n[2]; nAcc.set(s, q); }
  }
  const nrm = new Float32Array(pos.length);
  src.forEach((s, i) => { const q = nAcc.get(s) || [0, 1, 0]; const l = Math.hypot(...q) || 1; nrm[i * 3] = q[0] / l; nrm[i * 3 + 1] = q[1] / l; nrm[i * 3 + 2] = q[2] / l; });
  const morphs = (morphPos || []).map(m => { const d = new Float32Array(pos.length); src.forEach((s, i) => { const p = m.get(s); d[i * 3] = p[0] - pos[i * 3]; d[i * 3 + 1] = p[1] - pos[i * 3 + 1]; d[i * 3 + 2] = p[2] - pos[i * 3 + 2]; }); return { name: m.name, pos: d }; })
    .filter(m => m.pos.some(x => Math.abs(x) > 1e-6));
  meshes.push({ name, pos: Float32Array.from(pos), nrm, uv: Float32Array.from(uv), joints: Uint16Array.from(jo), weights: Float32Array.from(we), index: Uint32Array.from(idx), material: matIndex, morphs });
}

// ---------- proxies (mhclo) ----------
function parseMhclo(file) {
  const L = fs.readFileSync(file, 'utf8').split('\n');
  const r = { refs: [], del: new Set(), scale: {}, dir: path.dirname(file) };
  let mode = '';
  for (const raw of L) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const p = line.split(/\s+/);
    if (p[0] === 'verts') { mode = 'verts'; continue; }
    if (p[0] === 'delete_verts') { mode = 'del'; continue; }
    if (mode === 'verts' && /^-?\d/.test(p[0])) {
      if (p.length === 1) r.refs.push({ v: [+p[0], +p[0], +p[0]], w: [1, 0, 0], o: [0, 0, 0] });
      else r.refs.push({ v: [+p[0], +p[1], +p[2]], w: [+p[3], +p[4], +p[5]], o: [+p[6], +p[7], +p[8]] });
      continue;
    }
    if (mode === 'del' && /^-?\d/.test(p[0])) {
      for (let k = 0; k < p.length; k++) { if (p[k + 1] === '-') { for (let i = +p[k]; i <= +p[k + 2]; i++) r.del.add(i); k += 2; } else r.del.add(+p[k]); }
      continue;
    }
    // keywords never start with a digit; keep mode
    if (p[0] === 'obj_file') r.obj = p[1];
    else if (p[0] === 'material') r.material = p[1];
    else if (/^[xyz]_scale$/.test(p[0])) r.scale[p[0][0]] = [+p[1], +p[2], +p[3]];
    else if (p[0] === 'name') r.name = p[1];
  }
  return r;
}
function parseMhmat(file) {
  const m = { dir: path.dirname(file) };
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const p = raw.trim().split(/\s+/);
    if (p[0] === 'diffuseTexture') m.diffuse = p[1];
    if (p[0] === 'normalmapTexture') m.normal = p[1];
    if (p[0] === 'diffuseColor') m.color = [+p[1], +p[2], +p[3]];
  }
  const res = (f) => { if (!f) return null; for (const c of [path.join(m.dir, f), path.join(m.dir, path.basename(f))]) if (fs.existsSync(c)) return c; return null; };
  m.diffuse = res(m.diffuse); m.normal = res(m.normal);
  return m;
}
const fitter = (clo, arr) => {
  const sc = {};
  for (const ax of ['x', 'y', 'z']) {
    const s = clo.scale[ax]; const k = { x: 0, y: 1, z: 2 }[ax];
    sc[ax] = s ? Math.abs(arr[s[0] * 3 + k] - arr[s[1] * 3 + k]) / s[2] : 1;
  }
  return (j) => {
    const r = clo.refs[j]; const p = [0, 0, 0];
    for (let k = 0; k < 3; k++) { const v = r.v[k]; p[0] += r.w[k] * arr[v * 3]; p[1] += r.w[k] * arr[v * 3 + 1]; p[2] += r.w[k] * arr[v * 3 + 2]; }
    p[0] += r.o[0] * sc.x; p[1] += r.o[1] * sc.y; p[2] += r.o[2] * sc.z;
    return [p[0] * S, (p[1] - minY) * S, p[2] * S];
  };
};
const deleted = new Set();
const proxies = [];
for (const px of cfg.proxies) {
  const clo = parseMhclo(SYS + '/' + px.mhclo);
  for (const d of clo.del) deleted.add(d);
  proxies.push({ px, clo });
}
// body
{
  const sk = parseMhmat(SYS + '/' + cfg.skin);
  const mi = addMat({ name: 'skin', map: texture(sk.diffuse, cfg.skinSize || 2048), normalMap: sk.normal && cfg.skinNormal ? texture(sk.normal, 1024) : null, normalScale: 0.6, rough: 0.55 });
  const bodySet = new Set(body);
  const faces = base.faces.filter(f => f.c.every(([v]) => bodySet.has(v) && !deleted.has(v)));
  const mp = morphDefs.map(m => { const map = new Map(); for (const f of faces) for (const [v] of f.c) if (!map.has(v)) map.set(v, P(m.V, v)); return Object.assign(map, { name: m.name }); });
  buildMesh('body', faces, (vi) => P(V, vi), (vi) => top4(vw[vi]), base.vt, mi, mp);
}
for (const { px, clo } of proxies) {
  const obj = parseObj(path.join(clo.dir, clo.obj));
  const fit = fitter(clo, V);
  const mfits = morphDefs.map(m => ({ name: m.name, fit: fitter(clo, m.V) }));
  const matFile = px.mhmat ? SYS + '/' + px.mhmat : path.join(clo.dir, clo.material);
  const mm = parseMhmat(matFile);
  const mi = addMat({ name: px.name, map: mm.diffuse ? texture(mm.diffuse, px.tex || 1024, !!px.alpha) : null, normalMap: mm.normal && px.normal !== false ? texture(mm.normal, 512) : null, color: px.color, alpha: px.alpha, cutoff: px.cutoff, double: px.double, rough: px.rough ?? 0.8 });
  const wfix = px.name === "eyes" ? ((j) => [[bi[fit(j)[0] > 0 ? "LeftEye" : "RightEye"], 1], [0, 0], [0, 0], [0, 0]]) : null;
  const getW = wfix || ((j) => { const r = clo.refs[j]; const l = []; for (let k = 0; k < 3; k++) for (const [b, w] of vw[r.v[k]]) l.push([b, w * r.w[k]]); return top4(l); });
  const morphPos = mfits.map(m => { const map = new Map(); for (const f of obj.faces) for (const [v] of f.c) if (!map.has(v)) map.set(v, m.fit(v)); return Object.assign(map, { name: m.name }); });
  buildMesh(px.name, obj.faces, (j) => fit(j), getW, obj.vt, mi, morphPos);
}
writeGLB(OUT, { name: cfg.name, bones, meshes, materials });
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes; meshes', meshes.map(m => `${m.name}:${m.pos.length / 3}v/${m.morphs.length}m`).join(' '));
console.log('height', Math.max(...meshes[0].pos.filter((_, i) => i % 3 === 1)).toFixed(3));
