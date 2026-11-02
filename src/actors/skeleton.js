// Bone hierarchy and Sun/Moon proportions (≈ 5 heads tall adults, ≈ 3.8 heads kids).
// Bind pose = "A-pose": arms 45° down, legs straight, character at the origin facing +z, its LEFT side
// is +x. EVERY bone has an identity bind rotation (axes aligned with the model), so clip poses are plain
// Euler angles in a predictable frame (see anim.js for the conventions).
import * as THREE from 'three';

export const ARM_ANGLE = Math.PI / 4;

/** Every bone name (order = skeleton order). Face bones drive expressions, hair bones secondary motion. */
export const BONES = [
  'root', 'hips', 'spine', 'chest', 'neck', 'head',
  'eye_L', 'eye_R', 'lid_L', 'lid_R', 'brow_L', 'brow_R', 'mouth', 'mouth_L', 'mouth_R', 'jaw', 'blush',
  'hat', 'hair1', 'hair2', 'hair3', 'hairL', 'hairL2', 'hairR', 'hairR2',
  'shoulder_L', 'upperarm_L', 'lowerarm_L', 'hand_L', 'prop_L',
  'shoulder_R', 'upperarm_R', 'lowerarm_R', 'hand_R', 'prop_R',
  'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R',
  'back', 'scarf', 'skirt',
];

/** Bones of the lower-body animation layer (everything else is upper body). */
export const LOWER = new Set(['root', 'hips', 'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R', 'skirt']);

/**
 * Proportions for a look. Body lengths scale with `s`, the head with `hr` (big heads = Sun/Moon).
 * `build` 0 (slim) .. 1 (sturdy) widens torso and limbs.
 */
export function proportions(look = {}) {
  const sex = look.sex === 'm' ? 'm' : 'f';
  const age = ['kid', 'elder'].includes(look.age) ? look.age : 'adult';
  const build = Number.isFinite(look.build) ? Math.min(1, Math.max(0, look.build)) : 0.5;
  const P = { sex, age, build, hunch: 0 };
  if (age === 'kid') Object.assign(P, { s: 0.66, hr: 1.0, shoulderX: 0.118, hipX: 0.062, limb: 0.82, chest: 0.78, waist: 0.84, hip: 0.8, bust: 0 });
  else if (sex === 'm') Object.assign(P, { s: 1, hr: 1.08, shoulderX: 0.172, hipX: 0.084, limb: 1.06, chest: 1.08, waist: 0.98, hip: 0.94, bust: 0 });
  else Object.assign(P, { s: 0.955, hr: 1.06, shoulderX: 0.142, hipX: 0.088, limb: 0.92, chest: 0.94, waist: 0.82, hip: 1.04, bust: 1 });
  if (age === 'elder') { P.s *= 0.975; P.waist *= 1.1; P.hunch = 1; }
  const b = build - 0.5;
  P.chest *= 1 + b * 0.22; P.waist *= 1 + b * 0.34; P.hip *= 1 + b * 0.16; P.limb *= 1 + b * 0.22; P.shoulderX *= 1 + b * 0.12;
  return P;
}

/**
 * Joint positions (model space, bind pose) and derived points for the mesh builder.
 * @returns {{P:object, joints:Object<string,number[]>, parent:Object<string,string|null>, order:string[],
 *   headC:number[], headR:number[], UA:number, FA:number, HAND:number, top:number, s:number, hr:number, fz:Function}}
 */
export function rigSpec(look = {}) {
  const P = proportions(look);
  const s = P.s, hr = P.hr;
  const J = {}, PAR = {}, order = [];
  const add = (name, parent, pos) => { J[name] = pos; PAR[name] = parent; order.push(name); };
  const headC = [0, 1.38 * s + 0.155 * hr, 0.012 * hr];
  const headR = [0.158 * hr, 0.17 * hr, 0.162 * hr];
  /** front surface z of the (undeformed) head ellipsoid at (x, y) */
  const fz = (x, y) => {
    const k = 1 - (x / headR[0]) ** 2 - ((y - headC[1]) / headR[1]) ** 2;
    return headC[2] + headR[2] * Math.sqrt(Math.max(0, k));
  };

  add('root', null, [0, 0, 0]);
  add('hips', 'root', [0, 0.92 * s, 0]);
  add('spine', 'hips', [0, 1.02 * s, 0]);
  add('chest', 'spine', [0, 1.17 * s, 0]);
  add('neck', 'chest', [0, 1.345 * s, 0]);
  add('head', 'neck', [0, 1.40 * s, 0]);
  // face (children of head)
  const eyeY = headC[1] - 0.024 * hr, eyeX = 0.06 * hr;
  for (const [side, k] of [['L', 1], ['R', -1]]) add(`eye_${side}`, 'head', [eyeX * k, eyeY, fz(eyeX * 0.9, eyeY)]);
  for (const [side, k] of [['L', 1], ['R', -1]]) add(`lid_${side}`, 'head', [eyeX * k, eyeY, fz(eyeX * 0.9, eyeY)]);
  const browY = headC[1] + 0.05 * hr;
  for (const [side, k] of [['L', 1], ['R', -1]]) add(`brow_${side}`, 'head', [0.062 * hr * k, browY, fz(0.062 * hr, browY)]);
  const mouthY = headC[1] - 0.112 * hr;
  const mz = fz(0, mouthY);
  add('mouth', 'head', [0, mouthY, mz]);
  add('mouth_L', 'mouth', [0.028 * hr, mouthY, fz(0.028 * hr, mouthY)]);
  add('mouth_R', 'mouth', [-0.028 * hr, mouthY, fz(0.028 * hr, mouthY)]);
  add('jaw', 'mouth', [0, mouthY, mz]);
  add('blush', 'head', [0, headC[1] - 0.07 * hr, headC[2] + headR[2] * 0.8]);
  add('hat', 'head', [0, headC[1] + 0.1 * hr, headC[2]]);
  // hair chains
  add('hair1', 'head', [0, headC[1] + 0.06 * hr, headC[2] - 0.13 * hr]);
  add('hair2', 'hair1', [0, headC[1] - 0.17 * hr, headC[2] - 0.21 * hr]);
  add('hair3', 'hair2', [0, headC[1] - 0.44 * hr, headC[2] - 0.22 * hr]);
  for (const [side, k] of [['L', 1], ['R', -1]]) {
    add(`hair${side}`, 'head', [0.15 * hr * k, headC[1] + 0.07 * hr, headC[2] - 0.05 * hr]);
    add(`hair${side}2`, `hair${side}`, [0.21 * hr * k, headC[1] - 0.17 * hr, headC[2] - 0.09 * hr]);
  }
  // arms (A-pose)
  const sn = Math.sin(ARM_ANGLE), cs = Math.cos(ARM_ANGLE);
  const UA = 0.272 * s, FA = 0.243 * s, HAND = 0.078 * s ** 0.6;
  const shY = 1.295 * s;
  for (const [side, k] of [['L', 1], ['R', -1]]) {
    add(`shoulder_${side}`, 'chest', [0.055 * k, shY - 0.01, 0]);
    const ua = [P.shoulderX * k, shY, 0];
    add(`upperarm_${side}`, `shoulder_${side}`, ua);
    const fa = [ua[0] + sn * UA * k, ua[1] - cs * UA, 0];
    add(`lowerarm_${side}`, `upperarm_${side}`, fa);
    const wr = [fa[0] + sn * FA * k, fa[1] - cs * FA, 0];
    add(`hand_${side}`, `lowerarm_${side}`, wr);
    add(`prop_${side}`, `hand_${side}`, [wr[0] + sn * HAND * k, wr[1] - cs * HAND, 0.012]);
  }
  for (const [side, k] of [['L', 1], ['R', -1]]) {
    add(`thigh_${side}`, 'hips', [P.hipX * k, 0.86 * s, 0]);
    add(`shin_${side}`, `thigh_${side}`, [P.hipX * k * 0.96, 0.47 * s, 0.005]);
    add(`foot_${side}`, `shin_${side}`, [P.hipX * k * 0.94, 0.085 * s, 0]);
  }
  add('back', 'chest', [0, 1.14 * s, -0.12 * s * P.chest]);
  add('scarf', 'chest', [0.05 * s, 1.3 * s, 0.085 * s * P.chest]);
  add('skirt', 'hips', [0, 0.8 * s, 0]);
  return { P, joints: J, parent: PAR, order, headC, headR, UA, FA, HAND, top: headC[1] + headR[1], s, hr, fz };
}

/**
 * Create the THREE.Bone hierarchy for a spec or for a look/proportions object. Bones get LOCAL
 * positions (child − parent) and identity rotations.
 * @returns {{bones: THREE.Bone[], byName: Object<string, THREE.Bone>, root: THREE.Bone, spec: object}}
 */
export function buildSkeleton(proportionsOrSpec = {}) {
  const spec = proportionsOrSpec.joints ? proportionsOrSpec : rigSpec(proportionsOrSpec);
  const byName = {}, bones = [];
  for (const name of spec.order) {
    const b = new THREE.Bone(); b.name = name;
    const p = spec.joints[name], parent = spec.parent[name];
    if (parent) {
      const pp = spec.joints[parent];
      b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
      byName[parent].add(b);
    } else b.position.set(...p);
    byName[name] = b; bones.push(b);
  }
  return { bones, byName, root: byName.root, spec };
}
