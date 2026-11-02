// Procedural stylized human (Sun/Moon proportions, ~5 heads tall) on a real skeleton: body, face, hair,
// clothes and accessories are built in code as ONE SkinnedMesh with vertex colours (one draw call) plus
// ONE inverted-hull outline SkinnedMesh that shares the same vertex buffers (face details excluded).
//   buildHuman(ctx, look) → {object, model, mesh, outline, skeleton, bones, meshes, face, spec, look}
import * as THREE from 'three';
import { RigBuilder, ellipsoid, lathe, limb, ring, rod, tube, smoothProfile, sstep, col, mix } from './geo.js';
import { rigSpec, buildSkeleton, ARM_ANGLE } from './skeleton.js';
import { buildFace, createFace, FACE_PARTS } from './face.js';
import { buildHair, buildHat } from './hair.js';
import { normalizeLook } from './looks.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _t = new THREE.Vector3();

// ---- shared materials ------------------------------------------------------------------------
let CHAR_MAT = null, OUTLINE_MAT = null, OWN_RAMP = null;
export const rimUniforms = { rimColor: { value: new THREE.Color('#fff1dc') }, rimStrength: { value: 0.38 }, coolShade: { value: new THREE.Color('#3a3f8a') } };

/** Toon material on the shared ramp, vertex colours, soft warm rim and cool (never black) shade. */
export function characterMaterial(ctx) {
  if (CHAR_MAT) return CHAR_MAT;
  let ramp = ctx?.toon?.ramp;
  if (!ramp) {
    const d = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
    ramp = OWN_RAMP = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat); ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  }
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, rimUniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor; uniform float rimStrength; uniform vec3 coolShade;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          float rim = smoothstep(0.55, 0.9, 1.0 - ndv) * smoothstep(-0.3, 0.5, normal.y + 0.3);
          totalEmissiveRadiance += rimColor * rim * rimStrength * diffuseColor.rgb;
          totalEmissiveRadiance += coolShade * 0.06 * diffuseColor.rgb; }`);
  };
  m.customProgramCacheKey = () => 'valmora-human-toon';
  CHAR_MAT = m;
  return m;
}

/** Outline shell: extruded along the skinned view-space normal, width ~constant on screen (clamped). */
export function outlineMaterial(color = '#2a2140') {
  if (OUTLINE_MAT) return OUTLINE_MAT;
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.BackSide, fog: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOutline = { value: 0.0042 };
    sh.vertexShader = 'uniform float uOutline;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      #ifdef USE_SKINNING
      { float dz = -mvPosition.z;
        float w = uOutline * clamp(dz, 1.2, 9.0);
        mvPosition.xyz += normalize(transformedNormal) * w;
        gl_Position = projectionMatrix * mvPosition; }
      #endif`);
  };
  m.customProgramCacheKey = () => 'valmora-human-outline';
  OUTLINE_MAT = m;
  return m;
}

/**
 * Build a human. `look` may be partial (normalised here).
 * @returns {{object:THREE.Group, model:THREE.Group, mesh:THREE.SkinnedMesh, outline:THREE.SkinnedMesh, skeleton:THREE.Skeleton,
 *   bones:Object<string,THREE.Bone>, meshes:THREE.Mesh[], face:any, spec:object, look:object, height:number}}
 */
export function buildHuman(ctx, rawLook) {
  const L = rawLook?._n ? rawLook : { ...normalizeLook(rawLook), _n: true };
  const spec = rigSpec(L);
  const { bones, byName: B } = buildSkeleton(spec);
  const RB = new RigBuilder(spec.order);
  buildBody(RB, L, spec);
  buildFace(RB, L, spec);
  buildHair(RB, L, spec);
  buildHat(RB, L, spec);
  const { geometry, parts } = RB.build();

  const mesh = new THREE.SkinnedMesh(geometry, characterMaterial(ctx));
  mesh.name = 'human';
  mesh.castShadow = true; mesh.receiveShadow = false;   // no toon self-shadow (faces under hats/hair stay clean)
  mesh.add(B.root);
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);
  const sphere = new THREE.Sphere(V(0, 0.85 * spec.s, 0), 1.35);
  mesh.boundingSphere = sphere;

  // outline: same vertex buffers, an index without the face details
  const skip = new Uint8Array(geometry.attributes.position.count);
  for (const [name, list] of Object.entries(parts)) if (FACE_PARTS.has(name)) for (const r of list) skip.fill(1, r.start, r.start + r.count);
  const src = geometry.index.array, keep = [];
  for (let i = 0; i < src.length; i += 3) if (!skip[src[i]] && !skip[src[i + 1]] && !skip[src[i + 2]]) keep.push(src[i], src[i + 1], src[i + 2]);
  const og = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) og.setAttribute(k, geometry.attributes[k]);
  og.setIndex(keep);
  const outline = new THREE.SkinnedMesh(og, outlineMaterial(ctx?.toon?.palette?.outline));
  outline.name = 'human-outline'; outline.castShadow = false; outline.receiveShadow = false;
  outline.userData.isOutline = true; outline.raycast = () => {};
  outline.bind(skeleton, mesh.bindMatrix);
  outline.boundingSphere = sphere;
  outline.visible = ctx?.quality ? !!ctx.quality.outlines : true;

  const object = new THREE.Group(); object.name = 'human';
  const model = new THREE.Group(); model.name = 'model'; model.scale.setScalar(L.height);
  object.add(model); model.add(mesh, outline);
  const face = createFace(ctx, L, B, spec);
  return { object, model, mesh, outline, skeleton, bones: B, meshes: [mesh, outline], face, spec, look: L, height: (spec.top + 0.012) * L.height, parts };
}

/** Anime-style face lighting: shading normals on the front of the head lean toward the viewer so the
 *  face reads as one clean light area (no toon terminator across the cheeks). */
const _fn = new THREE.Vector3(0, 0.25, 1).normalize();
const faceNormal = (C) => (p, n) => { const f = sstep(-0.35, 0.55, n.z) * 0.7; n.lerp(_fn, f); };

// ===============================================================================================
function buildBody(RB, L, spec) {
  const J = spec.joints, P = spec.P, s = spec.s, hr = spec.hr;
  const fem = P.sex === 'f';
  const skinC = col(L.skin);
  const skin = () => skinC;
  const T = L.top, st = T.style, topC = col(T.color);
  const acc = col(T.accent || (topC.getHSL({}).l > 0.6 ? '#3a4a6a' : '#ffffff'));
  const botC = col(L.bottom.color), bs = L.bottom.style;
  const accC = col(L.accessoryColor || '#f5b83d');
  const maleSwim = st === 'swimsuit' && P.sex === 'm';
  const coversHips = st === 'dress' || st === 'coat' || (st === 'swimsuit' && !maleSwim);
  const waistY = 0.905;
  const pattern = (c, Y, a) => {
    if (T.pattern === 'stripes') return (Math.floor((Y - 0.9) / 0.042) % 2) ? mix(c, acc, 0.85) : c;
    if (T.pattern === 'dots') { const u = ((a / Math.PI) * 5 + 50) % 1, v = ((Y / 0.06) + 50) % 1; return (u - 0.5) ** 2 + (v - 0.5) ** 2 < 0.05 ? mix(c, acc, 0.9) : c; }
    return c;
  };

  // ------------------------------------------------------------------ torso (lathe incl. neck)
  const lerp = (a, b, t) => a + (b - a) * t;
  const prof = smoothProfile([
    [0.772, 0.0], [0.785, 0.07 * P.hip], [0.81, 0.118 * P.hip], [0.85, 0.142 * P.hip], [0.9, 0.15 * P.hip], [0.95, 0.143 * lerp(P.hip, P.waist, 0.45)],
    [1.01, 0.128 * P.waist], [1.06, 0.127 * P.waist], [1.11, 0.135 * lerp(P.waist, P.chest, 0.55)], [1.17, 0.148 * P.chest], [1.225, 0.153 * P.chest],
    [1.265, 0.145 * P.chest], [1.3, 0.12 * P.chest], [1.322, 0.082], [1.342, 0.054], [1.37, 0.047], [1.42, 0.044], [1.45, 0.0],
  ], 30);
  const rows = prof.map(([Y, r]) => {
    const g = Math.exp(-(((Y - 1.168) / 0.05) ** 2)) * P.bust;
    const depth = 0.74 + 0.05 * Math.exp(-(((Y - 0.88) / 0.06) ** 2)) + (Y > 1.33 ? 0.24 * sstep(1.33, 1.36, Y) : 0);
    const rx = r * s, rz = rx * depth + 0.012 * g * s;
    return [Y * s, rx, rz, 0, 0.012 * g * s - (Y > 1.3 ? 0.008 * s * sstep(1.3, 1.36, Y) : 0)];
  });
  const torsoAt = (y) => { let i = 0; while (i < rows.length - 2 && rows[i + 1][0] < y) i++; const a = rows[i], b = rows[i + 1]; const t = Math.min(1, Math.max(0, (y - a[0]) / (b[0] - a[0] || 1))); return { rx: lerp(a[1], b[1], t), rz: lerp(a[2], b[2], t), oz: lerp(a[4], b[4], t) }; };
  const necklineY = (a, front) => {
    const aa = Math.abs(a);
    switch (st) {
      case 'blouse': return front ? 1.338 - 0.07 * Math.max(0, 1 - aa / 0.45) : 1.338;
      case 'tank': return front ? 1.322 - 0.06 * Math.max(0, 1 - aa / 1.0) : 1.31;
      case 'dress': return front ? 1.315 - 0.05 * Math.max(0, 1 - aa / 0.9) : 1.3;
      case 'camisole': return front ? 1.26 - 0.03 * Math.max(0, 1 - aa / 0.8) : 1.25;
      case 'swimsuit': return front ? 1.27 - 0.03 * Math.max(0, 1 - aa / 0.8) : 1.24;
      default: return 1.338;
    }
  };
  const sleeveless = ['tank', 'camisole', 'swimsuit', 'dress'].includes(st);
  const strap = { tank: [0.055, 0.115], camisole: [0.075, 0.092], swimsuit: [0.068, 0.098], dress: [0.06, 0.112] }[st];
  const strapColor = (p) => {
    if (L.accessory === 'backpack') {
      const a = Math.abs(Math.atan2(p.x, p.z)), Y = p.y / s;
      if (Math.abs(Math.abs(p.x) / s - 0.088) < (p.z > 0 ? 0.016 : 0.022) && Y > (p.z > 0 ? 1.0 : 1.16)) return mix(accC, '#000', 0.35);
    }
    if (L.accessory === 'bag') {
      const Y = p.y / s, x = p.x / s, sgn = p.z > 0 ? 1 : -1;
      const ax = 0.11, ay = 1.3, bx = -0.15, by = 0.9;   // over the left shoulder down to the right hip
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (Y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
      const d = Math.hypot(x - (ax + (bx - ax) * t), Y - (ay + (by - ay) * t));
      if (d < 0.016 && (sgn > 0 || Y > 1.15)) return mix(accC, '#000', 0.3);
    }
    return null;
  };
  const torsoColor = (p) => {
    const Y = p.y / s, ax = Math.abs(p.x) / s, front = p.z > 0, a = Math.atan2(p.x, p.z), aa = Math.abs(a);
    const sc = strapColor(p); if (sc && Y < 1.34) return sc;
    // ---- bottoms
    if (Y < waistY && !coversHips) {
      if (bs === 'pyjama') return (Math.floor(a * 4) % 2) ? botC : mix(botC, '#ffffff', 0.35);
      if (Y > waistY - 0.03 && ['pants', 'shorts', 'skirt', 'long_skirt'].includes(bs)) return mix(botC, '#000', 0.28);
      if (bs === 'swim_shorts') return (Math.floor(a * 3) % 2) ? botC : mix(botC, '#ffffff', 0.5);
      return botC;
    }
    if (maleSwim) return skin();
    // ---- neckline / shoulders
    if (Y > necklineY(a, front)) {
      if (sleeveless) return skin();
      return skin();
    }
    if (sleeveless && Y > 1.235 && !(ax > strap[0] && ax < strap[1])) return skin();
    if (sleeveless && Y > 1.235 && (st === 'camisole' || st === 'swimsuit')) return mix(topC, acc, 0.4);
    // ---- per style
    let c = pattern(topC, Y, a);
    switch (st) {
      case 'jacket': case 'coat':
        if (front && aa < 0.3 && Y > 0.93) return st === 'coat' && T.accent === null ? mix(topC, '#000', 0.18) : acc;
        if (front && aa < 0.38 && Y > 0.93) return mix(topC, '#000', 0.22);
        if (st === 'coat' && Y < 0.95 && Y > 0.93) return mix(topC, '#000', 0.2);
        break;
      case 'shirt':
        if (front && aa < 0.045) return mix(topC, acc, 0.55);
        if (front && aa < 0.07 && ((Y * 100) % 6) < 1.4) return acc;
        break;
      case 'uniform':
        if (Y > 0.925 && Y < 0.96) return mix(topC, '#000', 0.55);
        if (front && aa < 0.035) return mix(topC, '#000', 0.25);
        if (front && ax > 0.045 && ax < 0.1 && Y > 1.1 && Y < 1.17) return mix(topC, '#000', 0.15);
        break;
      case 'hoodie':
        if (front && ax < 0.085 && Y > 0.95 && Y < 1.05) return mix(topC, '#000', 0.15);
        if (Y < 0.935) return mix(topC, '#000', 0.2);
        break;
      case 'dress':
        if (Y > 0.995 && Y < 1.03) return acc;
        break;
      case 'blouse':
        if (Y > necklineY(a, front) - 0.018) return acc;
        break;
      case 'camisole': case 'swimsuit': case 'tank':
        if (Y > necklineY(a, front) - 0.012) return mix(topC, acc, 0.6);
        break;
      default:
        if (Y > 1.32) return mix(topC, '#000', 0.12);   // crew collar rib
    }
    return c;
  };
  const torsoWeights = (p) => {
    const Y = p.y / s, ax = Math.abs(p.x) / s, side = p.x >= 0 ? 'L' : 'R';
    const a = sstep(0.93, 1.06, Y), b = sstep(1.08, 1.2, Y), n = sstep(1.33, 1.385, Y);
    let wh = 1 - a, ws = a * (1 - b), wc = b * (1 - n), wn = n;
    const wt = 0.45 * sstep(0.86, 0.79, Y) * sstep(0.0, 0.07, ax);
    wh *= 1 - wt;
    const wsh = 0.55 * sstep(0.08, 0.14, ax) * sstep(1.18, 1.29, Y) * (1 - n);
    wc *= 1 - wsh;
    return [['hips', wh], ['spine', ws], ['chest', wc], ['neck', wn], [`thigh_${side}`, wt], [`shoulder_${side}`, wsh]];
  };
  RB.add(lathe({ rows, seg: 24 }), { part: 'torso', color: torsoColor, weights: torsoWeights });

  // ------------------------------------------------------------------ collars, hood
  if (['shirt', 'uniform', 'coat', 'jacket'].includes(st)) {
    const y0 = 1.318 * s, y1 = 1.372 * s, r0 = 0.06 * s, r1 = (st === 'coat' ? 0.078 : 0.068) * s;
    const g = lathe({ rows: [[y0 - 0.004, r0 * 0.96, r0 * 0.9], [y0, r0, r0 * 0.94], [y1, r1, r1 * 0.95], [y1 + 0.004, r1 * 0.95, r1 * 0.9]], seg: 22, arc: [0.42, Math.PI * 2 - 0.84] });
    RB.add(g, { part: 'clothes', smooth: true, color: () => (st === 'uniform' ? mix(topC, '#000', 0.2) : st === 'shirt' ? topC : mix(topC, '#ffffff', 0.08)),
      weights: (p) => { const t = sstep(1.33 * s, 1.37 * s, p.y); return [['chest', 1 - t * 0.6], ['neck', t * 0.6]]; } });
  }
  if (st === 'hoodie') {
    const rz = torsoAt(1.3 * s).rz;
    RB.add(ellipsoid({ c: [0, 1.315 * s, -rz * 0.72], r: [0.115 * s, 0.065 * s, 0.07 * s], seg: [16, 10], deform: (v, u) => { if (u.z > 0.3) v.z *= 0.6; } }), { part: 'clothes', bone: 'chest', color: () => mix(topC, '#000', 0.12) });
    for (const k of [1, -1]) RB.add(tube({ points: [V(0.03 * k * s, 1.33 * s, torsoAt(1.33 * s).rz + 0.004), V(0.032 * k * s, 1.27 * s, torsoAt(1.27 * s).rz + 0.01), V(0.034 * k * s, 1.22 * s, torsoAt(1.22 * s).rz + 0.012)], radii: [[0, 0.004], [1, 0.005]], seg: 5, rings: 5 }), { part: 'clothes', bone: 'chest', color: () => acc });
  }
  if (st === 'uniform') {
    const y = 1.17 * s, x = 0.07 * s, z = torsoAt(y).rz + torsoAt(y).oz;
    const gold = L.hat?.style === 'eclissi' || /5a3d8a|3d2a5e/i.test(T.color);
    if (gold) RB.add(ring({ c: [x, y, z * Math.sqrt(1 - (x / torsoAt(y).rx) ** 2) + 0.004], R: 0.02 * s, r: 0.006 * s, seg: [5, 12], rot: [0, 0, 0.6], arc: 4.2 }), { part: 'clothes', bone: 'chest', color: () => acc });
    else RB.add(ellipsoid({ c: [x, y, z * Math.sqrt(1 - (x / torsoAt(y).rx) ** 2) + 0.002], r: [0.016 * s, 0.02 * s, 0.006], seg: [8, 6] }), { part: 'clothes', bone: 'chest', color: () => acc });
  }

  // ------------------------------------------------------------------ skirts, dress, coat tails
  const skirtDef = { skirt: { hem: 0.6, flare: 1.32 }, long_skirt: { hem: 0.25, flare: 1.5 } }[bs] && !coversHips ? { skirt: { hem: 0.6, flare: 1.32 }, long_skirt: { hem: 0.25, flare: 1.5 } }[bs] : null;
  const dressDef = st === 'dress' ? { hem: 0.55, flare: 1.4, color: topC } : st === 'coat' ? { hem: 0.55, flare: 1.18, color: topC, open: true } : null;
  const sk = dressDef || (skirtDef ? { ...skirtDef, color: botC } : null);
  if (sk) {
    const yTop = 0.935 * s, hemY = sk.hem * s;
    const t0 = torsoAt(0.92 * s);
    const r0 = t0.rx + 0.006 * s, rz0 = t0.rz + 0.008 * s;
    const rH = Math.max(0.15 * P.hip * s, (P.hipX * 2 + 0.06) * s) * sk.flare * (bs === 'long_skirt' ? 0.92 : 1);
    const N = 9, rowsS = [];
    rowsS.push([hemY, rH * 0.93, rH * 0.84]);
    for (let i = 0; i <= N; i++) {
      const t = i / N, y = hemY + 0.004 + (yTop - hemY - 0.004) * t;
      const k = 1 - Math.pow(t, 1.6);           // flare grows toward the hem
      const r = r0 + (rH - r0) * k * (1 - 0.15 * t), rz = rz0 + (rH * 0.9 - rz0) * k * (1 - 0.15 * t);
      rowsS.push([y, r, rz]);
    }
    rowsS.push([yTop + 0.012 * s, r0 * 0.96, rz0 * 0.94]);
    const g = lathe({ rows: rowsS, seg: 24, arc: sk.open ? [0.32, Math.PI * 2 - 0.64] : null });
    const lim = bs === 'long_skirt' && !dressDef ? 0.5 : 0.55;
    RB.add(g, {
      part: 'clothes', smooth: true,
      color: (p) => { const Y = p.y / s; let c = sk.color; if (Y < sk.hem + 0.03) c = dressDef && st === 'dress' ? acc : mix(sk.color, '#000', 0.15); if (st === 'dress' && T.pattern) c = pattern(c, Y, Math.atan2(p.x, p.z)); return c; },
      weights: (p) => { const a = lim * sstep(yTop - 0.02, hemY + 0.08 * s, p.y); const sx = Math.max(-1, Math.min(1, p.x / (0.1 * s))); return [['hips', 1 - a], ['thigh_L', a * (0.5 + 0.5 * sx)], ['thigh_R', a * (0.5 - 0.5 * sx)]]; },
    });
  }

  // ------------------------------------------------------------------ legs + shoes
  const legPants = ['pants', 'pyjama'].includes(bs) ;
  const shortsLen = bs === 'shorts' ? 0.17 : bs === 'swim_shorts' ? 0.2 : 0;
  for (const [side, k] of [['L', 1], ['R', -1]]) {
    const hip = J[`thigh_${side}`], ank = J[`foot_${side}`];
    const Ls = hip[1] - ank[1];
    const lt = P.limb * s;
    const ex = legPants ? 0.007 * s : 0;
    const radii = [[0, (0.098 * P.hip) * lt + ex], [0.22, 0.088 * lt + ex], [0.47, 0.064 * lt + ex], [0.56, 0.068 * lt + ex], [0.68, 0.064 * lt + ex], [0.86, 0.05 * lt + ex], [1, (legPants ? 0.054 : 0.044) * lt]];
    if (shortsLen) { const t = shortsLen / (Ls / s); radii.splice(2, 0, [t - 0.01, 0.08 * lt + 0.008 * s], [t + 0.012, 0.075 * lt]); radii.sort((a, b) => a[0] - b[0]); }
    const g = limb({ a: [hip[0], hip[1] + 0.02 * s, 0], b: [ank[0], ank[1] + 0.03 * s, 0], seg: 11, rings: 12, flatten: 0.95, radii, extendA: 0.6, extendB: 0.5 });
    RB.add(g, {
      part: 'legs',
      color: (p) => {
        const d = (hip[1] - p.y) / s;
        if (legPants) { if (d > Ls / s - 0.06) return mix(botC, '#000', 0.2); return bs === 'pyjama' ? ((Math.floor(d / 0.06) % 2) ? botC : mix(botC, '#fff', 0.35)) : botC; }
        if (shortsLen) { if (d < shortsLen - 0.02) return bs === 'swim_shorts' ? ((Math.floor(Math.atan2(p.x - hip[0], p.z) * 2) % 2) ? botC : mix(botC, '#fff', 0.5)) : botC; if (d < shortsLen + 0.006) return mix(botC, '#000', 0.2); }
        if (coversHips && st === 'swimsuit' && d < 0.035) return topC;
        return skin();
      },
      weights: (p) => {
        const d = (hip[1] - p.y);
        const t = sstep(0.36 * s, 0.43 * s, d), f = sstep(Ls - 0.05 * s, Ls + 0.02 * s, d);
        return [['hips', 0.18 * sstep(0.04 * s, -0.03 * s, d)], [`thigh_${side}`, 1 - t], [`shin_${side}`, t * (1 - f)], [`foot_${side}`, t * f]];
      },
    });
    buildShoe(RB, L, spec, side, k, skin);
  }

  // ------------------------------------------------------------------ arms + hands
  const sleeve = { tshirt: 0.11, shirt: 0.13, blouse: 0.21, hoodie: 0.55, jacket: 0.55, coat: 0.55, uniform: 0.55, dress: 0.0, tank: 0, camisole: 0, swimsuit: 0 }[st] ?? 0.1;
  const sleeveLen = maleSwim ? 0 : sleeve * s;
  const longSleeve = sleeve > 0.4;
  for (const [side, k] of [['L', 1], ['R', -1]]) {
    const ua = J[`upperarm_${side}`], wr = J[`hand_${side}`];
    const dir = V(Math.sin(ARM_ANGLE) * k, -Math.cos(ARM_ANGLE), 0);
    const len = spec.UA + spec.FA, lt = P.limb * s;
    const ex = (tt) => (sleeveLen && tt * len < sleeveLen ? 0.007 * s : 0);
    const tS = sleeveLen / len;
    const radii = [[0, 0.055 * lt + ex(0)], [0.22, 0.048 * lt + ex(0.22)], [0.5, 0.039 * lt + ex(0.5)], [0.6, 0.041 * lt + ex(0.6)], [1, 0.034 * lt + ex(0.99)]];
    if (sleeveLen && !longSleeve) radii.push([tS - 0.02, (st === 'blouse' ? 0.06 : 0.052) * lt], [tS + 0.02, 0.043 * lt]);
    if (longSleeve) radii.push([0.97, 0.04 * lt]);
    radii.sort((a, b) => a[0] - b[0]);
    const g = limb({ a: ua, b: [wr[0] + dir.x * 0.006, wr[1] + dir.y * 0.006, 0], seg: 9, rings: 12, flatten: 0.95, ref: [0, 0, 1], radii, extendA: 1, extendB: 0.5 });
    const base = V(...ua);
    const sOf = p => _t.copy(p).sub(base).dot(dir);
    RB.add(g, {
      part: 'arms',
      color: (p) => {
        const d = sOf(p);
        if (sleeveLen && d < sleeveLen) {
          if (d > sleeveLen - 0.022 * s) return longSleeve ? mix(topC, '#000', 0.2) : (st === 'blouse' ? acc : mix(topC, '#000', 0.12));
          return T.pattern === 'stripes' ? ((Math.floor(d / 0.045) % 2) ? mix(topC, acc, 0.85) : topC) : topC;
        }
        if (sleeveless && d < 0.02 * s && !maleSwim && st !== 'dress') return skin();
        return skin();
      },
      weights: (p) => {
        const d = sOf(p);
        const e = sstep(spec.UA - 0.04 * s, spec.UA + 0.04 * s, d), h = sstep(len - 0.01 * s, len + 0.025 * s, d);
        const sh = 0.32 * sstep(0.02, -0.05, d);
        return [[`shoulder_${side}`, sh], [`upperarm_${side}`, (1 - e) * (1 - sh)], [`lowerarm_${side}`, e * (1 - h)], [`hand_${side}`, e * h]];
      },
    });
    // mitten hand + thumb
    const hs = s * (fem ? 1.0 : 1.08) * P.limb ** 0.3;
    const hc = V(...wr).addScaledVector(dir, 0.045 * hs);
    const handRot = new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), dir);
    RB.add(ellipsoid({ c: hc.toArray(), r: [0.025 * hs, 0.05 * hs, 0.037 * hs], seg: [10, 7], rot: handRot, deform: (v) => { if (v.y < 0) v.z *= 1 - 0.25 * (-v.y / (0.05 * hs)); } }), { part: 'hands', color: skin, bone: `hand_${side}` });
    const th = hc.clone().add(V(0, 0, 0.034 * hs)).addScaledVector(dir, -0.018 * hs).add(V(-0.008 * k * hs, 0, 0));
    RB.add(ellipsoid({ c: th.toArray(), r: [0.014 * hs, 0.026 * hs, 0.014 * hs], seg: [8, 6], rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, -0.4 * k)).premultiply(handRot) }), { part: 'hands', color: skin, bone: `hand_${side}` });
  }

  // ------------------------------------------------------------------ head
  const C = spec.headC, R = spec.headR;
  const cheek = mix(L.skin, '#ff8a8a', fem ? 0.22 : 0.08);
  const headColor = (p) => {
    const dx = Math.abs(p.x) - 0.09 * hr, dy = p.y - (C[1] - 0.07 * hr);
    const ch = Math.exp(-(dx * dx) / (0.0012 * hr * hr) - (dy * dy) / (0.0006 * hr * hr)) * (p.z > C[2] ? 1 : 0);
    return ch > 0.01 ? skinC.clone().lerp(cheek, Math.min(1, ch)) : skinC;
  };
  RB.add(ellipsoid({ c: C, r: R, seg: [24, 16], deform: (v, u) => {
    if (u.y < 0) {
      const k = Math.pow(-u.y, 1.6);
      v.x *= 1 - 0.3 * k * (u.z > -0.2 ? 1 : 0.5);
      if (u.z > 0) v.z += 0.012 * hr * sstep(-0.7, -1, u.y) * u.z;
    }
    if (u.z < -0.2) v.z *= 1.04;
  } }), { part: 'head', color: headColor, bone: 'head', normal: faceNormal(C) });
  // ears (soft, mostly hidden by the hair)
  for (const k of [1, -1]) RB.add(ellipsoid({ c: [k * R[0] * 0.95, C[1] - 0.02 * hr, C[2] - 0.01 * hr], r: [0.018 * hr, 0.034 * hr, 0.024 * hr], seg: [8, 6], rot: [0, 0.4 * k, 0] }), { part: 'head', color: () => mix(L.skin, '#e07a6a', 0.15), bone: 'head' });

  // ------------------------------------------------------------------ accessories
  const acc2 = L.accessory;
  if (acc2 === 'backpack') {
    const y = 1.1 * s, t = torsoAt(y);
    const pc = [0, y, -t.rz - 0.062 * s];
    RB.add(ellipsoid({ c: pc, r: [0.12 * s, 0.145 * s, 0.072 * s], seg: [14, 10], deform: (v, u) => { const kk = 1 + 0.12 * (1 - Math.abs(u.y)); v.x *= Math.min(1.1, kk); } }), { part: 'pack', bone: 'back', color: (p) => (p.y > y + 0.09 * s ? mix(accC, '#000', 0.2) : accC) });
    RB.add(ellipsoid({ c: [0, y - 0.05 * s, pc[2] - 0.06 * s], r: [0.075 * s, 0.06 * s, 0.03 * s], seg: [10, 8] }), { part: 'pack', bone: 'back', color: () => mix(accC, '#ffffff', 0.25) });
  } else if (acc2 === 'glasses' || acc2 === 'sunglasses') {
    const fc = col(acc2 === 'sunglasses' ? '#1e1e24' : (L.accessoryColor || '#3a3a3a'));
    for (const [side, k] of [['L', 1], ['R', -1]]) {
      const e = J[`eye_${side}`];
      const yaw = Math.atan2(e[0], 0.25);
      if (acc2 === 'glasses') RB.add(ring({ c: [e[0], e[1], e[2] + 0.018 * hr], R: 0.037 * hr, r: 0.0042 * hr, seg: [5, 18], rot: [0, yaw, 0] }), { part: 'glasses', bone: 'head', color: () => fc });
      else RB.add(ellipsoid({ c: [e[0], e[1] + 0.004 * hr, e[2] + 0.02 * hr], r: [0.042 * hr, 0.032 * hr, 0.007 * hr], seg: [12, 8], rot: [0, yaw, 0] }), { part: 'glasses', bone: 'head', color: () => col('#22223a') });
      RB.add(rod({ a: [e[0] + 0.036 * hr * k, e[1] + 0.004 * hr, e[2] + 0.012 * hr], b: [R[0] * 0.99 * k, e[1] + 0.012 * hr, C[2] - 0.02 * hr], ra: 0.0035 * hr, seg: 5 }), { part: 'glasses', bone: 'head', color: () => fc });
    }
    RB.add(rod({ a: [J.eye_R[0] + 0.035 * hr, J.eye_R[1] + 0.006 * hr, J.eye_R[2] + 0.02 * hr], b: [J.eye_L[0] - 0.035 * hr, J.eye_L[1] + 0.006 * hr, J.eye_L[2] + 0.02 * hr], ra: 0.0035 * hr, seg: 5 }), { part: 'glasses', bone: 'head', color: () => fc });
  } else if (acc2 === 'scarf') {
    const y = 1.33 * s;
    RB.add(ring({ c: [0, y, 0.004], R: 0.066 * s, r: 0.026 * s, seg: [8, 18], rot: [Math.PI / 2, 0, 0] }), { part: 'clothes', color: (p) => ((Math.floor((Math.atan2(p.x, p.z) + 4) * 3) % 2) ? accC : mix(accC, '#fff', 0.4)),
      weights: (p) => [['chest', 0.6], ['neck', 0.4]] });
    const z0 = torsoAt(1.28 * s).rz + 0.03 * s;
    RB.add(tube({ points: [V(0.05 * s, y - 0.01, 0.07 * s), V(0.06 * s, 1.25 * s, z0), V(0.065 * s, 1.14 * s, torsoAt(1.14 * s).rz + torsoAt(1.14 * s).oz + 0.018 * s)], radii: [[0, 0.03 * s], [1, 0.032 * s]], seg: 8, rings: 8, flatten: 0.35, up: [0, 0, 1] }),
      { part: 'clothes', color: () => accC, weights: (p) => { const t = sstep(1.3 * s, 1.16 * s, p.y); return [['chest', 1 - t], ['scarf', t]]; } });
  } else if (acc2 === 'necklace') {
    const y = 1.312 * s;
    const t = torsoAt(y);
    RB.add(ring({ c: [0, y, t.oz + 0.004], R: 0.062 * s, r: 0.0032 * s, seg: [4, 20], rot: [Math.PI / 2 + 0.55, 0, 0] }), { part: 'clothes', bone: 'chest', color: () => accC });
    const py = 1.268 * s, pt = torsoAt(py);
    RB.add(ellipsoid({ c: [0, py, pt.rz + pt.oz + 0.006], r: [0.011 * s, 0.014 * s, 0.006 * s], seg: [8, 6] }), { part: 'clothes', bone: 'chest', color: () => mix(accC, '#ffffff', 0.25) });
  } else if (acc2 === 'bag') {
    RB.add(ellipsoid({ c: [-0.175 * s, 0.9 * s, 0.03 * s], r: [0.04 * s, 0.075 * s, 0.1 * s], seg: [10, 8], deform: (v, u) => { if (u.y > 0.6) v.y *= 0.9; } }), { part: 'clothes', bone: 'hips', color: (p) => (p.y > 0.95 * s ? mix(accC, '#000', 0.2) : accC) });
  }
}

// ---- shoes -----------------------------------------------------------------------------------
function buildShoe(RB, L, spec, side, k, skin) {
  const J = spec.joints, s = spec.s;
  const ank = J[`foot_${side}`];
  const sty = L.shoes.style, sc = col(L.shoes.color);
  const fem = spec.P.sex === 'f';
  const fs = s * (fem ? 1.08 : 1.2);
  const bone = `foot_${side}`;
  const sole = (y0) => (v) => { if (v.y < y0) v.y = y0 - (v.y - y0) * 0.1; };
  const bc = [ank[0] + 0.004 * k, 0.05 * s, 0.035 * fs];
  switch (sty) {
    case 'sneakers': case 'boots': case 'flats': case 'heels': {
      const r = sty === 'heels' ? [0.042 * fs, 0.04 * fs, 0.095 * fs] : sty === 'flats' ? [0.047 * fs, 0.045 * fs, 0.102 * fs] : [0.052 * fs, 0.048 * fs, 0.108 * fs];
      const cc = sty === 'heels' ? [bc[0], 0.058 * s, bc[2] + 0.008] : sty === 'flats' ? [bc[0], 0.048 * s, bc[2]] : bc;
      RB.add(ellipsoid({ c: cc, r, seg: [16, 10], deform: (v) => { sole(-r[1] * 0.62)(v); if (sty === 'heels' && v.z > 0) v.y -= v.z * 0.35; if (v.z > 0.04 * fs) v.y += (v.z - 0.04 * fs) * 0.25; } }), {
        part: 'shoes', bone,
        color: (p) => {
          const h = p.y;
          if (sty === 'sneakers') { if (h < 0.02 * s) return col('#ffffff'); if (p.z > bc[2] + 0.03 * fs && h > 0.065 * s && Math.abs(p.x - bc[0]) < 0.02 * fs) return mix(sc, '#ffffff', 0.7); return sc; }
          if (h < 0.012 * s) return mix(sc, '#000', 0.45);
          return sc;
        },
      });
      if (sty === 'heels') RB.add(rod({ a: [bc[0], 0.0, bc[2] - 0.06 * fs], b: [bc[0], 0.045 * s, bc[2] - 0.065 * fs], ra: 0.011 * fs, rb: 0.016 * fs, seg: 8 }), { part: 'shoes', bone, color: () => mix(sc, '#000', 0.3) });
      if (sty === 'boots') {
        const shaft = limb({ a: [ank[0], 0.27 * s, 0.0], b: [ank[0], 0.07 * s, 0.01], seg: 12, rings: 5, radii: [[0, 0.054 * s], [1, 0.056 * s]], extendA: 0.25, extendB: 0 });
        RB.add(shaft, { part: 'shoes', color: (p) => (p.y > 0.25 * s ? mix(sc, '#fff', 0.15) : sc), weights: (p) => [[`shin_${side}`, sstep(0.07 * s, 0.15 * s, p.y)], [bone, 1 - sstep(0.07 * s, 0.15 * s, p.y)]] });
      }
      break;
    }
    case 'sandals': case 'barefoot': {
      RB.add(ellipsoid({ c: [bc[0], 0.046 * s, bc[2] + 0.004], r: [0.042 * fs, 0.04 * fs, 0.094 * fs], seg: [14, 8], deform: sole(-0.022 * fs) }), {
        part: 'shoes', bone,
        color: (p) => (sty === 'sandals' && (Math.abs(p.z - (bc[2] + 0.03 * fs)) < 0.012 * fs || Math.abs(p.z - (bc[2] - 0.035 * fs)) < 0.01 * fs) && p.y > 0.03 * s ? sc : skin()),
      });
      if (sty === 'sandals') RB.add(ellipsoid({ c: [bc[0], 0.011 * s, bc[2] + 0.004], r: [0.047 * fs, 0.011 * s, 0.1 * fs], seg: [14, 5] }), { part: 'shoes', bone, color: () => mix(sc, '#000', 0.25) });
      break;
    }
    default: break;
  }
}
