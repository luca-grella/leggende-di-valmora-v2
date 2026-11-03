// Minimal GLB writer: skinned meshes sharing one skeleton, textures, morph targets.
import fs from 'node:fs';

export function writeGLB(file, model) {
  // model: { bones:[{name,parent,head:[x,y,z],tail}], meshes:[{name,pos,nrm,uv,joints,weights,index,material,morphs:[{name,pos}]}], materials:[{name,color,map,normalMap,alpha,rough,metal,double}], images }
  const json = { asset: { version: '2.0', generator: 'valmora-mh-build (MakeHuman CC0 assets)' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [], materials: [], textures: [], images: [], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }], skins: [] };
  const chunks = []; let off = 0;
  const pushBuf = (buf, target) => {
    const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
    const bv = { buffer: 0, byteOffset: off, byteLength: buf.byteLength }; if (target) bv.target = target;
    chunks.push(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)); off += buf.byteLength;
    json.bufferViews.push(bv); return json.bufferViews.length - 1;
  };
  const acc = (arr, type, ctype, target, minmax) => {
    const bv = pushBuf(arr, target);
    const n = { VEC2: 2, VEC3: 3, VEC4: 4, SCALAR: 1, MAT4: 16 }[type];
    const a = { bufferView: bv, componentType: ctype, count: arr.length / n, type };
    if (minmax) { const mn = Array(n).fill(Infinity), mx = Array(n).fill(-Infinity); for (let i = 0; i < arr.length; i++) { const k = i % n; if (arr[i] < mn[k]) mn[k] = arr[i]; if (arr[i] > mx[k]) mx[k] = arr[i]; } a.min = mn; a.max = mx; }
    json.accessors.push(a); return json.accessors.length - 1;
  };
  // root node + bones
  const root = { name: model.name, children: [] }; json.nodes.push(root); json.scenes[0].nodes.push(0);
  const boneIdx = model.bones.map((b, i) => {
    const p = b.parent >= 0 ? model.bones[b.parent].head : [0, 0, 0];
    json.nodes.push({ name: b.name, translation: [b.head[0] - p[0], b.head[1] - p[1], b.head[2] - p[2]], extras: { tail: b.tail, head: b.head } });
    return json.nodes.length - 1;
  });
  model.bones.forEach((b, i) => { if (b.parent >= 0) { const pn = json.nodes[boneIdx[b.parent]]; (pn.children ||= []).push(boneIdx[i]); } else root.children.push(boneIdx[i]); });
  const ibm = new Float32Array(model.bones.length * 16);
  model.bones.forEach((b, i) => { const o = i * 16; ibm[o] = ibm[o + 5] = ibm[o + 10] = ibm[o + 15] = 1; ibm[o + 12] = -b.head[0]; ibm[o + 13] = -b.head[1]; ibm[o + 14] = -b.head[2]; });
  json.skins.push({ joints: boneIdx, inverseBindMatrices: acc(ibm, 'MAT4', 5126), skeleton: boneIdx[0] });
  // images/textures
  const texCache = new Map();
  const tex = (img) => {
    if (texCache.has(img.file)) return texCache.get(img.file);
    const data = fs.readFileSync(img.file);
    const bv = pushBuf(new Uint8Array(data));
    json.images.push({ name: img.name, bufferView: bv, mimeType: img.file.endsWith('.png') ? 'image/png' : 'image/jpeg' });
    json.textures.push({ sampler: 0, source: json.images.length - 1 });
    const t = json.textures.length - 1; texCache.set(img.file, t); return t;
  };
  for (const m of model.materials) {
    const mat = { name: m.name, pbrMetallicRoughness: { baseColorFactor: m.color || [1, 1, 1, 1], metallicFactor: m.metal ?? 0, roughnessFactor: m.rough ?? 0.7 } };
    if (m.map) mat.pbrMetallicRoughness.baseColorTexture = { index: tex(m.map) };
    if (m.normalMap) mat.normalTexture = { index: tex(m.normalMap), scale: m.normalScale ?? 1 };
    if (m.alpha === 'MASK') { mat.alphaMode = 'MASK'; mat.alphaCutoff = m.cutoff ?? 0.5; }
    if (m.alpha === 'BLEND') mat.alphaMode = 'BLEND';
    if (m.double) mat.doubleSided = true;
    json.materials.push(mat);
  }
  for (const me of model.meshes) {
    const attrs = {
      POSITION: acc(me.pos, 'VEC3', 5126, 34962, true),
      NORMAL: acc(me.nrm, 'VEC3', 5126, 34962),
      TEXCOORD_0: acc(me.uv, 'VEC2', 5126, 34962),
      JOINTS_0: acc(me.joints, 'VEC4', 5123, 34962),
      WEIGHTS_0: acc(me.weights, 'VEC4', 5126, 34962),
    };
    const prim = { attributes: attrs, indices: acc(me.index, 'SCALAR', 5125, 34963), material: me.material };
    const extras = {};
    if (me.morphs?.length) { prim.targets = me.morphs.map(t => ({ POSITION: acc(t.pos, 'VEC3', 5126, 34962, true) })); extras.targetNames = me.morphs.map(t => t.name); }
    json.meshes.push({ name: me.name, primitives: [prim], extras, weights: me.morphs?.length ? me.morphs.map(() => 0) : undefined });
    json.nodes.push({ name: me.name, mesh: json.meshes.length - 1, skin: 0 });
    root.children.push(json.nodes.length - 1);
  }
  const bin = Buffer.concat(chunks); const binPad = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
  json.buffers.push({ byteLength: binPad.length });
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
  const hdr = Buffer.alloc(12); hdr.writeUInt32LE(0x46546C67, 0); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(12 + 8 + js.length + 8 + binPad.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binPad.length, 0); bh.writeUInt32LE(0x004E4942, 4);
  fs.writeFileSync(file, Buffer.concat([hdr, jh, js, bh, binPad]));
}
