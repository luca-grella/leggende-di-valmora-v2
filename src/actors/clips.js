// Hand-authored clip library (pose tables + easing; conventions documented in anim.js). Every clip starts
// from STAND so all body bones are always keyed (never blended with the bind A-pose). Root offsets (`pos`)
// are authored for a body scale of 1 and scaled per character by the Human (kids sit/lie correctly too).
//
// Height conventions (object origin = the floor the feet stand on):
//   sit_*       hips rest on a seat SIT_H = 0.45 m above the origin (bench / chair / bed edge / sofa)
//   sit_ground  hips on the ground at the origin             kneel  knees on the ground
//   lie_back    lying on the back on the origin plane, head toward −z (pairs rotate the object)
//   swim        origin = water surface, shoulders just above it
//   ride_*      origin = the vehicle seat surface
// Names in CLIP_NAMES are the contract; the extra clips below are used by pairs.js and the player.
import { defineClip, mirror } from './anim.js';

/** Seat height the sitting clips are authored for (metres above the character origin). */
export const SIT_H = 0.45;

/** Neutral standing pose: relaxed arms a little away from the body, soft elbows, chin up for the 3/4 camera. */
export const STAND = {
  pos: [0, 0, 0],
  hips: [0, 0, 0], spine: [2, 0, 0], chest: [-2, 0, 0], neck: [0, 0, 0], head: [-3, 0, 0],
  shL: [0, 0, 0], shR: [0, 0, 0],
  uaL: [3, 0, -34], uaR: [3, 0, 34], faL: [-14, 0, 0], faR: [-14, 0, 0], hL: [0, 0, 0], hR: [0, 0, 0],
  thL: [0, 0, 1.5], thR: [0, 0, -1.5], knL: [0, 0, 0], knR: [0, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0],
  mouth: 0, eyes: 1, brow: 0,
};

const C = {};
const add = (name, def) => { C[name] = defineClip(name, { base: STAND, ...def }); };
/** Keep only the listed channels of a pose (for building variants). */
const pick = (p, keys) => Object.fromEntries(keys.filter(k => p[k] !== undefined).map(k => [k, p[k]]));
const ARMS = ['shL', 'shR', 'uaL', 'uaR', 'faL', 'faR', 'hL', 'hR'];
const LEGS = ['thL', 'thR', 'knL', 'knR', 'ftL', 'ftR'];

// =============================================================================== idle
add('idle', {
  duration: 5.2, loop: true,
  keys: [[0, {}]],
  osc: {
    pos: { x: [0.008, 1, 0], y: [0.003, 2, 0.1] },
    hips: { z: [1.3, 1, 0.25], y: [1, 1, 0.5] }, spine: { z: [-1.1, 1, 0.25], x: [0.6, 2, 0] }, chest: { y: [1.4, 1, 0.6] },
    head: { y: [2.5, 1, 0.1], x: [1.1, 2, 0.3], z: [1, 1, 0.7] },
    knL: { x: [2.2, 1, 0.75] }, knR: { x: [2.2, 1, 0.25] }, thL: { x: [-1, 1, 0.75] }, thR: { x: [-1, 1, 0.25] },
    uaL: { x: [1.4, 1, 0.4], z: [1, 1, 0.1] }, uaR: { x: [1.4, 1, 0.9], z: [-1, 1, 0.6] }, faL: { x: [-2, 1, 0.2] }, faR: { x: [-2, 1, 0.7] },
  },
});

/** Feminine idle: weight on the right leg, soft contrapposto, hands loosely in front. */
const IDLE_F = {
  hips: [0, 4, 4], spine: [2, -2, -3], chest: [-3, -3, -1.5], head: [-3, 5, 3],
  thL: [-3, 0, 4], knL: [9, 0, 0], ftL: [-5, 0, 0], thR: [0, 0, -3], knR: [0, 0, 0],
  uaL: [-4, 0, -33], faL: [-30, 0, 0], hL: [0, -10, 0], uaR: [-2, 0, 32], faR: [-26, 0, 0], hR: [0, 10, 0],
};
add('idle_f', {
  duration: 6, loop: true,
  keys: [[0, IDLE_F]],
  osc: {
    pos: { x: [0.006, 1, 0], y: [0.003, 2, 0.1] },
    hips: { z: [1.2, 1, 0.25] }, spine: { z: [-1, 1, 0.25], x: [0.6, 2, 0] }, chest: { y: [1.6, 1, 0.6] },
    head: { y: [3, 1, 0.1], x: [1, 2, 0.3], z: [1.5, 1, 0.7] },
    knL: { x: [3, 1, 0.75] }, uaL: { x: [1.4, 1, 0.4] }, uaR: { x: [1.4, 1, 0.9] }, faL: { x: [-3, 1, 0.2] }, faR: { x: [-3, 1, 0.7] },
  },
});

add('idle_look', {
  duration: 4, meta: { look: 0.15 },
  keys: [
    [0, {}],
    [0.5, { head: [-2, 12, 0], chest: [-2, 5, 0] }],
    [1.0, { uaL: [-40, 0, -26], faL: [-120, 0, 0], hL: [-20, 0, 0], head: [-10, 36, -3], chest: [-3, 12, 0], spine: [1, 4, 0], brow: 0.6, eyes: 0.75 }, 'back'],
    [1.6, { head: [-12, 28, -2] }],
    [2.2, { head: [-9, -32, 4], chest: [-3, -10, 0], spine: [1, -4, 0], hips: [0, -3, 0] }],
    [2.8, { head: [-8, -26, 3] }],
    [3.4, { uaL: STAND.uaL, faL: STAND.faL, hL: [0, 0, 0], head: STAND.head, chest: STAND.chest, spine: STAND.spine, hips: [0, 0, 0], brow: 0, eyes: 1 }],
    [4, {}],
  ],
});

add('idle_stretch', {
  duration: 3.8, meta: { look: 0, breathe: 0 },
  keys: [
    [0, {}],
    [0.55, { chest: [-6, 0, 0], head: [-10, 0, 0], shL: [0, 0, 8], shR: [0, 0, -8], uaL: [-60, 0, -10], faL: [-90, 0, 0], uaR: [-60, 0, 10], faR: [-90, 0, 0] }],
    [1.2, { uaL: [-168, 0, 18], faL: [-14, 0, 0], uaR: [-168, 0, -18], faR: [-14, 0, 0], hL: [-30, 0, 0], hR: [-30, 0, 0],
      chest: [-12, 0, 0], spine: [-4, 0, 0], head: [-22, 0, 0], pos: [0, 0.03, 0], ftL: [14, 0, 0], ftR: [14, 0, 0], eyes: 0, mouth: 0.75, brow: 0.6 }, 'out'],
    [1.75, { spine: [-4, 0, 9], chest: [-12, 0, 6], hips: [0, 0, -4], head: [-20, 0, 6] }],
    [2.25, { spine: [-4, 0, -9], chest: [-12, 0, -6], hips: [0, 0, 4], head: [-20, 0, -6] }],
    [2.75, { uaL: [-10, 0, -40], faL: [-30, 0, 0], uaR: [-10, 0, 40], faR: [-30, 0, 0], hL: [0, 0, 0], hR: [0, 0, 0], spine: [4, 0, 0], chest: [2, 0, 0], hips: [0, 0, 0],
      head: [4, 0, 0], pos: [0, -0.02, 0], ftL: [0, 0, 0], ftR: [0, 0, 0], eyes: 0.6, mouth: 0, brow: 0, shL: [0, 0, 0], shR: [0, 0, 0] }, 'inOut'],
    [3.8, {}],
  ],
});

// =============================================================================== locomotion (phase 0 = left heel strike)
// Duration 1.0 = one full cycle; the Animator phase-locks the cycle to the distance travelled.
const WALK = {
  contact: { pos: [0.008, -0.012, 0], hips: [0, -7, 2], spine: [3, 0, -1], chest: [-3, 10, 0], head: [-3, -4, 1],
    thL: [-27, 0, 1.5], knL: [5, 0, 0], ftL: [-14, 0, 0], thR: [17, 0, -1.5], knR: [20, 0, 0], ftR: [20, 0, 0],
    uaL: [20, 0, -34], faL: [-12, 0, 0], uaR: [-22, 0, 34], faR: [-30, 0, 0], hL: [6, 0, 0], hR: [-6, 0, 0] },
  down: { pos: [0.016, -0.036, 0], hips: [0, -5, 4], spine: [4, 0, -2], chest: [-3, 7, 0], head: [-2, -3, 1],
    thL: [-21, 0, 1.5], knL: [17, 0, 0], ftL: [0, 0, 0], thR: [13, 0, -1.5], knR: [40, 0, 0], ftR: [22, 0, 0],
    uaL: [15, 0, -34], faL: [-13, 0, 0], uaR: [-17, 0, 34], faR: [-27, 0, 0] },
  pass: { pos: [0.019, 0.006, 0], hips: [0, 0, 4], spine: [3, 0, -2], chest: [-3, 0, 0], head: [-3, 0, 1],
    thL: [-2, 0, 1.5], knL: [6, 0, 0], ftL: [0, 0, 0], thR: [-20, 0, -1.5], knR: [62, 0, 0], ftR: [10, 0, 0],
    uaL: [3, 0, -34], faL: [-15, 0, 0], uaR: [-3, 0, 34], faR: [-19, 0, 0], hL: [0, 0, 0], hR: [0, 0, 0] },
  up: { pos: [0.012, 0.026, 0], hips: [0, 5, 2], spine: [3, 0, -1], chest: [-3, -8, 0], head: [-3, 3, 1],
    thL: [14, 0, 1.5], knL: [8, 0, 0], ftL: [14, 0, 0], thR: [-29, 0, -1.5], knR: [32, 0, 0], ftR: [-6, 0, 0],
    uaL: [-15, 0, -34], faL: [-27, 0, 0], uaR: [15, 0, 34], faR: [-12, 0, 0], hL: [-4, 0, 0], hR: [4, 0, 0] },
};
const cycle = (K) => [
  [0, K.contact], [0.125, K.down], [0.25, K.pass], [0.375, K.up],
  [0.5, mirror(K.contact)], [0.625, mirror(K.down)], [0.75, mirror(K.pass)], [0.875, mirror(K.up)],
];
add('walk', { duration: 1, loop: true, meta: { look: 0.7 }, keys: cycle(WALK), osc: { head: { y: [2, 1, 0.2] } } });

const RUN = {
  contact: { pos: [0, -0.03, 0], hips: [0, -10, 2], spine: [10, 0, -1], chest: [-2, 14, 0], neck: [0, 0, 0], head: [-9, -5, 0],
    thL: [-38, 0, 2], knL: [16, 0, 0], ftL: [-8, 0, 0], thR: [22, 0, -2], knR: [62, 0, 0], ftR: [28, 0, 0],
    uaL: [36, 0, -36], faL: [-70, 0, 0], uaR: [-46, 0, 30], faR: [-104, 0, 0], hL: [8, 0, 0], hR: [-6, 0, 0] },
  down: { pos: [0, -0.075, 0], hips: [0, -7, 4], spine: [12, 0, -2], chest: [-2, 10, 0], head: [-10, -3, 0],
    thL: [-25, 0, 2], knL: [38, 0, 0], ftL: [8, 0, 0], thR: [12, 0, -2], knR: [92, 0, 0], ftR: [30, 0, 0],
    uaL: [28, 0, -36], faL: [-74, 0, 0], uaR: [-36, 0, 31], faR: [-100, 0, 0] },
  pass: { pos: [0, 0.0, 0], hips: [0, 0, 3], spine: [10, 0, -1], chest: [-2, 0, 0], head: [-9, 0, 0],
    thL: [6, 0, 2], knL: [22, 0, 0], ftL: [20, 0, 0], thR: [-42, 0, -2], knR: [112, 0, 0], ftR: [12, 0, 0],
    uaL: [0, 0, -36], faL: [-84, 0, 0], uaR: [-6, 0, 32], faR: [-90, 0, 0], hL: [0, 0, 0], hR: [0, 0, 0] },
  up: { pos: [0, 0.065, 0], hips: [0, 8, 2], spine: [10, 0, 0], chest: [-2, -12, 0], head: [-9, 4, 0],
    thL: [30, 0, 2], knL: [44, 0, 0], ftL: [30, 0, 0], thR: [-58, 0, -2], knR: [84, 0, 0], ftR: [-6, 0, 0],
    uaL: [-40, 0, -34], faL: [-100, 0, 0], uaR: [32, 0, 34], faR: [-72, 0, 0], hL: [-6, 0, 0], hR: [6, 0, 0] },
};
add('run', { duration: 1, loop: true, meta: { look: 0.4 }, keys: cycle(RUN) });

// =============================================================================== talk & gestures
add('talk', {
  duration: 3.6, loop: true, meta: { look: 1 },
  keys: [
    [0, { uaR: [-16, 0, 34], faR: [-62, 0, 0], hR: [0, 30, 0] }],
    [0.7, { uaR: [-30, 0, 24], faR: [-58, 0, 0], hR: [-10, 50, 0], chest: [-3, 6, 0], brow: 0.5 }],
    [1.3, { uaR: [-20, 0, 32], faR: [-70, 0, 0], hR: [0, 30, 0], chest: [-2, 0, 0], brow: 0 }],
    [2.0, { uaR: [-6, 0, 34], faR: [-32, 0, 0], uaL: [-22, 0, -32], faL: [-64, 0, 0], hL: [-10, -40, 0], head: [-4, 0, -5] }],
    [2.7, { uaL: [-8, 0, -34], faL: [-26, 0, 0], hL: [0, 0, 0], uaR: [-28, 0, 28], faR: [-72, 0, 0], head: [-5, 0, 0], brow: 0.4 }],
  ],
  osc: { head: { x: [2.5, 4, 0], y: [4, 1, 0.2] }, chest: { y: [2.5, 1, 0.5] }, spine: { z: [1.2, 1, 0.1] } },
});

add('talk_gesture', {
  duration: 2.4, meta: { look: 0.8 },
  keys: [
    [0, {}],
    [0.35, { uaL: [-34, 0, -26], faL: [-70, 0, 0], hL: [-16, -50, 0], uaR: [-34, 0, 26], faR: [-70, 0, 0], hR: [-16, 50, 0], chest: [-4, 0, 0], head: [-6, 0, 0], brow: 0.6 }, 'back'],
    [0.75, { uaL: [-26, 0, -10], faL: [-52, 0, 0], hL: [-30, -70, 0], uaR: [-26, 0, 10], faR: [-52, 0, 0], hR: [-30, 70, 0], shL: [0, 0, 8], shR: [0, 0, -8], head: [-8, 0, 6] }],
    [1.2, { uaL: [-30, 0, -26], faL: [-74, 0, 0], uaR: [-36, 0, 26], faR: [-84, 0, 0], hR: [-10, 30, 0], head: [-2, 0, -4], shL: [0, 0, 0], shR: [0, 0, 0] }],
    [1.6, { uaR: [-44, 0, 24], faR: [-64, 0, 0], hR: [-20, 40, 0], head: [2, 0, 0], brow: 0.2 }],
    [2.4, { ...pick(STAND, ARMS), head: STAND.head, chest: STAND.chest, brow: 0 }],
  ],
});

// The overhead camera foreshortens an arm straight up: the wave stays wide and sweeps in a visible plane.
add('wave', {
  duration: 2, meta: { look: 1 },
  keys: [
    [0, {}],
    [0.2, { pos: [0, -0.02, 0], knL: [8, 0, 0], knR: [8, 0, 0], uaR: [-30, 0, -8], faR: [-62, 0, 0] }],
    [0.4, { pos: [0, 0.01, 0], knL: [0, 0, 0], knR: [0, 0, 0], uaR: [-40, 0, -62], faR: [-34, 0, 0], hR: [-10, 0, 0], chest: [-5, 8, 5], head: [-8, 0, 6], mouth: 0.4, brow: 0.7 }, 'back'],
    [0.6, { uaR: [-50, 0, -74], faR: [-20, 0, 0], hR: [-20, 0, -15], pos: [0, 0, 0] }], [0.8, { uaR: [-46, 0, -56], faR: [-70, 0, 0], hR: [-10, 0, 15] }],
    [1.0, { uaR: [-50, 0, -74], faR: [-20, 0, 0], hR: [-20, 0, -15] }], [1.2, { uaR: [-46, 0, -56], faR: [-70, 0, 0], hR: [-10, 0, 15] }],
    [1.4, { uaR: [-42, 0, -76], faR: [-16, 0, 0], hR: [-10, 0, 0] }],
    [2.0, { ...STAND, mouth: 0.15 }],
  ],
});

add('nod', {
  duration: 0.9, meta: { look: 0.6 },
  keys: [[0, {}], [0.2, { head: [14, 0, 0], neck: [5, 0, 0], brow: 0.3 }], [0.42, { head: [-6, 0, 0], neck: [0, 0, 0] }], [0.62, { head: [9, 0, 0] }], [0.9, { head: STAND.head, brow: 0 }]],
});
add('shake_head', {
  duration: 1.1, meta: { look: 0.4 },
  keys: [[0, {}], [0.18, { head: [2, 18, 0], brow: -0.3 }], [0.38, { head: [2, -18, 0] }], [0.58, { head: [2, 15, 0] }], [0.78, { head: [2, -10, 0] }], [1.1, { head: STAND.head, brow: 0 }]],
  osc: { chest: { y: [2, 2, 0] } },
});

add('point', {
  duration: 2, meta: { look: 0.2 },
  keys: [
    [0, {}],
    [0.35, { uaR: [-82, 0, 18], faR: [-6, 0, 0], hR: [-12, 0, 0], chest: [-3, 12, 0], spine: [2, 4, 0], head: [-6, 8, 0], uaL: [6, 0, -30], brow: 0.5 }, 'back'],
    [0.6, { uaR: [-80, 0, 16], hR: [-8, 0, 0] }],
    [1.4, { uaR: [-84, 0, 18] }],
    [2.0, { ...STAND }],
  ],
});

add('laugh', {
  duration: 2.2, meta: { look: 0.5 },
  keys: [
    [0, {}],
    [0.3, { spine: [-6, 0, 0], chest: [-10, 0, 0], head: [-18, 0, 0], uaL: [-30, 0, -40], faL: [-90, 0, 0], uaR: [-24, 0, 40], faR: [-80, 0, 0], eyes: 0, mouth: 0.9, brow: 0.6 }],
    [0.5, { chest: [-6, 0, 0], head: [-14, 0, 3], pos: [0, -0.012, 0] }], [0.7, { chest: [-11, 0, 0], head: [-19, 0, -2], pos: [0, 0, 0] }],
    [0.9, { chest: [-6, 0, 0], head: [-14, 0, 3], pos: [0, -0.012, 0] }], [1.1, { spine: [10, 0, 0], chest: [8, 0, 0], head: [6, 0, 0], pos: [0, -0.02, 0] }],
    [1.35, { spine: [12, 0, 0], chest: [6, 0, 0], head: [2, 0, -4] }], [1.6, { spine: [8, 0, 0], head: [-2, 0, 2] }],
    [2.2, { ...STAND, mouth: 0.2 }],
  ],
});

add('surprised', {
  duration: 1.4, meta: { look: 0.4 },
  keys: [
    [0, {}],
    [0.12, { pos: [0, 0.03, -0.04], chest: [-12, 0, 0], head: [-14, 0, 0], shL: [0, 0, 12], shR: [0, 0, -12], uaL: [-50, 0, -28], faL: [-110, 0, 0], hL: [-30, 0, 0],
      uaR: [-50, 0, 28], faR: [-110, 0, 0], hR: [-30, 0, 0], thL: [6, 0, 2], knL: [10, 0, 0], eyes: 1.2, mouth: 0.7, brow: 1 }, 'snap'],
    [0.6, { chest: [-8, 0, 0], head: [-10, 0, 0], pos: [0, 0, -0.05], thL: [4, 0, 2] }],
    [1.4, { ...STAND, pos: [0, 0, -0.05], eyes: 1, mouth: 0, brow: 0.3 }],
  ],
});

add('cheer', {
  duration: 1.7, meta: { look: 0, footIK: 0.2 },
  keys: [
    [0, {}],
    [0.25, { pos: [0, -0.12, 0], thL: [-30, 0, 5], thR: [-30, 0, -5], knL: [56, 0, 0], knR: [56, 0, 0], ftL: [-22, 0, 0], ftR: [-22, 0, 0],
      spine: [16, 0, 0], head: [6, 0, 0], uaL: [10, 0, -28], faL: [-110, 0, 0], uaR: [10, 0, 28], faR: [-110, 0, 0] }],
    [0.48, { pos: [0, 0.3, 0], thL: [-24, 0, 8], thR: [-18, 0, -8], knL: [50, 0, 0], knR: [40, 0, 0], ftL: [20, 0, 0], ftR: [20, 0, 0],
      spine: [-6, 0, 0], chest: [-10, 0, 0], head: [-20, 0, 0], uaL: [-150, 0, 30], faL: [-30, 0, 0], uaR: [-150, 0, -30], faR: [-30, 0, 0], mouth: 1, eyes: 0.1, brow: 1 }, 'out'],
    [0.66, { pos: [0, 0.27, 0] }],
    [0.86, { pos: [0, -0.1, 0], thL: [-26, 0, 5], thR: [-26, 0, -5], knL: [48, 0, 0], knR: [48, 0, 0], ftL: [-20, 0, 0], ftR: [-20, 0, 0], spine: [12, 0, 0], head: [-6, 0, 0] }, 'in'],
    [1.1, { pos: [0, 0.01, 0], thL: [0, 0, 2], thR: [0, 0, -2], knL: [4, 0, 0], knR: [4, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0], spine: [2, 0, 0], uaL: [-130, 0, 30], uaR: [-130, 0, -30] }],
    [1.7, { ...STAND, mouth: 0.4 }],
  ],
  events: [{ t: 0.86, name: 'land' }],
});

add('defeat', {
  duration: 2.6, meta: { look: 0 },
  keys: [
    [0, {}],
    [0.5, { spine: [18, 0, 0], chest: [10, 0, 0], head: [22, 0, 0], shL: [0, 0, -6], shR: [0, 0, 6], uaL: [4, 0, -40], faL: [-8, 0, 0], uaR: [4, 0, 40], faR: [-8, 0, 0], eyes: 0.4, brow: -0.6, mouth: 0.1 }],
    [1.2, { pos: [0, -0.32, 0.02], thL: [-58, 0, 6], thR: [-58, 0, -6], knL: [96, 0, 0], knR: [96, 0, 0], ftL: [-36, 0, 0], ftR: [-36, 0, 0],
      spine: [36, 0, 0], head: [16, 0, 0], uaL: [-40, 0, -24], faL: [-20, 0, 0], hL: [-20, 0, 0], uaR: [-40, 0, 24], faR: [-20, 0, 0], hR: [-20, 0, 0] }, 'inOut'],
    [1.9, { spine: [34, 0, 0], head: [20, 0, 4] }],
    [2.6, { pos: [0, -0.3, 0.02], spine: [36, 0, 0], head: [18, 0, 0] }],
  ],
  hold: true,
});

/** Hand on the chin, the other arm crossed under it. */
const THINK = { uaR: [-44, 0, 42], faR: [-138, 0, 0], hR: [-10, 0, 10], uaL: [-14, 0, -42], faL: [-100, 0, 0], hL: [0, -40, 0], head: [-6, 0, -9], chest: [-3, 4, 0], brow: 0.5, eyes: 0.8 };
add('think', {
  duration: 3.4, loop: true, meta: { look: 0.2 },
  keys: [[0, THINK], [1.7, { head: [-8, -8, -6] }]],
  osc: { hR: { x: [4, 4, 0] }, head: { z: [2, 1, 0] } },
});

// =============================================================================== sitting on a seat (SIT_H)
const SIT = {
  pos: [0, -0.335, -0.02], hips: [0, 0, 0], spine: [6, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [-4, 0, 0],
  thL: [-77, 0, 5], thR: [-77, 0, -5], knL: [80, 0, 0], knR: [80, 0, 0], ftL: [-2, 0, 0], ftR: [-2, 0, 0],
  uaL: [-14, 0, -30], faL: [-46, 0, 0], hL: [8, 0, 0], uaR: [-14, 0, 30], faR: [-46, 0, 0], hR: [8, 0, 0],
};
export const SIT_POSE = SIT;
add('sit_down', {
  duration: 1.3, next: 'sit_idle', meta: { footIK: 0, sit: 1, look: 0.3 },
  keys: [
    [0, {}],
    [0.45, { pos: [0, -0.16, 0.03], thL: [-48, 0, 4], thR: [-48, 0, -4], knL: [62, 0, 0], knR: [62, 0, 0], ftL: [-14, 0, 0], ftR: [-14, 0, 0],
      spine: [26, 0, 0], head: [-14, 0, 0], uaL: [-26, 0, -24], faL: [-40, 0, 0], uaR: [-26, 0, 24], faR: [-40, 0, 0] }],
    [0.9, { ...SIT, pos: [0, -0.34, -0.01], spine: [12, 0, 0] }, 'inOut'],
    [1.3, SIT],
  ],
});
add('sit_idle', {
  duration: 5.6, loop: true, meta: { footIK: 0, sit: 1, look: 1 },
  keys: [[0, SIT], [2.8, { spine: [4, 0, 2], head: [-6, 8, 2] }]],
  osc: { knL: { x: [5, 2, 0] }, knR: { x: [5, 2, 0.5] }, ftL: { x: [4, 2, 0.1] }, ftR: { x: [4, 2, 0.6] }, chest: { y: [2.5, 1, 0.2] }, head: { y: [6, 1, 0], z: [2, 1, 0.3] }, uaL: { x: [1.5, 1, 0] }, uaR: { x: [1.5, 1, 0.5] } },
});
add('stand_up', {
  duration: 1.2, meta: { footIK: 0.3, sit: 0.5, look: 0.3 },
  keys: [
    [0, SIT],
    [0.45, { pos: [0, -0.2, 0.06], thL: [-56, 0, 4], thR: [-56, 0, -4], knL: [74, 0, 0], knR: [74, 0, 0], ftL: [-16, 0, 0], ftR: [-16, 0, 0],
      spine: [32, 0, 0], head: [-18, 0, 0], uaL: [-20, 0, -24], faL: [-30, 0, 0], uaR: [-20, 0, 24], faR: [-30, 0, 0] }, 'inOut'],
    [1.2, { ...STAND }],
  ],
});
/** Sitting on a bed/sofa edge with the legs stretched forward a little (feet massage/kiss staging). */
const SIT_FEET = { ...SIT, spine: [-4, 0, 0], chest: [-6, 0, 0], head: [6, 0, 0], thL: [-82, 0, 4], thR: [-78, 0, -4], knL: [26, 0, 0], knR: [34, 0, 0], ftL: [10, 0, 0], ftR: [12, 0, 0],
  uaL: [28, 0, -26], faL: [-6, 0, 0], hL: [-30, 0, 0], uaR: [28, 0, 26], faR: [-6, 0, 0], hR: [-30, 0, 0] };
add('sit_feet', {
  duration: 5, loop: true, meta: { footIK: 0, sit: 1, look: 0.8 },
  keys: [[0, SIT_FEET], [2.5, { head: [4, 8, 4] }]],
  osc: { chest: { y: [2, 1, 0.2] }, head: { z: [2, 1, 0.3] } },
});

// =============================================================================== on the ground
/** Sitting on the ground, knees up, leaning back on the hands. */
const SIT_G = {
  pos: [0, -0.77, -0.05], hips: [-8, 0, 0], spine: [-2, 0, 0], chest: [-2, 0, 0], head: [2, 0, 0],
  thL: [-122, 0, 10], thR: [-122, 0, -10], knL: [104, 0, 0], knR: [104, 0, 0], ftL: [6, 0, 0], ftR: [6, 0, 0],
  uaL: [44, 0, -20], faL: [-2, 0, 0], hL: [-60, 0, 0], uaR: [44, 0, 20], faR: [-2, 0, 0], hR: [-60, 0, 0],
};
export const SIT_GROUND_POSE = SIT_G;
add('sit_ground', {
  duration: 6, loop: true, meta: { footIK: 0, sit: 1, look: 1 },
  keys: [[0, SIT_G], [3, { head: [0, 10, 3], chest: [-2, 4, 0] }]],
  osc: { knL: { x: [3, 1, 0] }, knR: { x: [3, 1, 0.5] }, head: { y: [5, 1, 0.2] }, chest: { y: [2, 1, 0.6] } },
});
/** Legs stretched out on the ground (picnic: his head rests on her lap). */
const SIT_LEGS = { ...SIT_G, hips: [-4, 0, 0], spine: [4, 0, 0], thL: [-84, 0, 4], thR: [-84, 0, -4], knL: [8, 0, 0], knR: [14, 0, 0], ftL: [-10, 0, 0], ftR: [-10, 0, 0],
  uaL: [30, 0, -22], faL: [-4, 0, 0], uaR: [30, 0, 22], faR: [-4, 0, 0] };
add('sit_legs', {
  duration: 6, loop: true, meta: { footIK: 0, sit: 1, look: 1 },
  keys: [[0, SIT_LEGS], [3, { head: [6, 8, 4] }]],
  osc: { head: { y: [4, 1, 0.2] }, chest: { y: [2, 1, 0.6] } },
});

/** Sitting on the ground hugging the knees (massage staging: the back stays free). */
const SIT_KNEES = { ...SIT_G, hips: [-2, 0, 0], spine: [14, 0, 0], chest: [6, 0, 0], head: [-2, 0, 0], thL: [-130, 0, 6], thR: [-130, 0, -6], knL: [118, 0, 0], knR: [118, 0, 0], ftL: [12, 0, 0], ftR: [12, 0, 0],
  uaL: [-58, 0, -30], faL: [-58, 0, 0], hL: [0, -30, 0], uaR: [-58, 0, 30], faR: [-58, 0, 0], hR: [0, 30, 0] };
add('sit_knees', {
  duration: 6, loop: true, meta: { footIK: 0, sit: 1, look: 0.6 },
  keys: [[0, SIT_KNEES], [3, { head: [4, 6, 4] }]],
  osc: { head: { z: [2, 1, 0.2] }, chest: { y: [1.5, 1, 0.6] } },
});
/** Kneeling upright on both knees (shins flat behind). */
const KNEEL = {
  pos: [0, -0.5, -0.02], hips: [0, 0, 0], spine: [6, 0, 0], chest: [0, 0, 0], head: [-2, 0, 0],
  thL: [-12, 0, 5], thR: [-12, 0, -5], knL: [102, 0, 0], knR: [102, 0, 0], ftL: [70, 0, 0], ftR: [70, 0, 0],
  uaL: [-6, 0, -30], faL: [-30, 0, 0], uaR: [-6, 0, 30], faR: [-30, 0, 0],
};
export const KNEEL_POSE = KNEEL;
add('kneel', {
  duration: 5, loop: true, meta: { footIK: 0, sit: 1, look: 1 },
  keys: [[0, KNEEL]],
  osc: { spine: { x: [1.5, 1, 0] }, head: { y: [4, 1, 0.2] }, chest: { y: [2, 1, 0.5] } },
});
/** Kneeling, bowing forward with the arms reaching low (feet massage / kiss staging; IK places the hands). */
add('kneel_bow', {
  duration: 4, loop: true, meta: { footIK: 0, sit: 1, look: 0.4 },
  keys: [[0, { ...KNEEL, pos: [0, -0.56, -0.06], thL: [-26, 0, 6], thR: [-26, 0, -6], knL: [118, 0, 0], knR: [118, 0, 0], spine: [34, 0, 0], chest: [12, 0, 0], head: [-6, 0, 0],
    uaL: [-48, 0, -24], faL: [-30, 0, 0], uaR: [-48, 0, 24], faR: [-30, 0, 0] }]],
  osc: { spine: { x: [2, 1, 0] }, chest: { y: [2, 1, 0.5] } },
});

/** Kneeling sitting back on the heels (thighs forward, a lap a foot can rest on). */
const KNEEL_SIT = {
  pos: [0, -0.62, -0.06], hips: [0, 0, 0], spine: [8, 0, 0], chest: [2, 0, 0], head: [-6, 0, 0],
  thL: [-72, 0, 7], thR: [-72, 0, -7], knL: [146, 0, 0], knR: [146, 0, 0], ftL: [44, 0, 0], ftR: [44, 0, 0],
  uaL: [-26, 0, -22], faL: [-46, 0, 0], hL: [10, 0, 0], uaR: [-26, 0, 22], faR: [-46, 0, 0], hR: [10, 0, 0],
};
export const KNEEL_SIT_POSE = KNEEL_SIT;
add('kneel_sit', {
  duration: 5, loop: true, meta: { footIK: 0, sit: 1, look: 1 },
  keys: [[0, KNEEL_SIT]],
  osc: { spine: { x: [1.5, 1, 0] }, head: { y: [4, 1, 0.2] }, chest: { y: [2, 1, 0.5] } },
});
/** Kneeling on the heels, bowing forward from the hips with both arms reaching low (massage on the floor, feet). */
add('kneel_reach', {
  duration: 4, loop: true, meta: { footIK: 0, sit: 1, look: 0.6 },
  keys: [[0, { ...KNEEL_SIT, hips: [30, 0, 0], thL: [-100, 0, 8], thR: [-100, 0, -8], spine: [20, 0, 0], chest: [10, 0, 0], neck: [-6, 0, 0], head: [-20, 0, 0],
    uaL: [-62, 0, -16], faL: [-26, 0, 0], hL: [10, 0, 0], uaR: [-62, 0, 16], faR: [-26, 0, 0], hR: [10, 0, 0] }]],
  osc: { spine: { x: [2, 1, 0] }, chest: { y: [2, 1, 0.5] } },
});

/** Going down on both knees (one knee first, hands steadying on the thigh); continues into 'kneel'. */
add('kneel_down', {
  duration: 1.25, next: 'kneel', meta: { footIK: 0, sit: 1, look: 0.4 },
  keys: [
    [0, {}],
    [0.4, { pos: [0, -0.2, 0.04], spine: [14, 0, 0], head: [-6, 0, 0], thR: [-58, 0, -4], knR: [66, 0, 0], ftR: [-6, 0, 0], thL: [6, 0, 5], knL: [52, 0, 0], ftL: [30, 0, 0],
      uaR: [-24, 0, 20], faR: [-52, 0, 0], uaL: [-10, 0, -28], faL: [-30, 0, 0] }],
    [0.8, { pos: [0, -0.42, 0.0], thR: [-50, 0, -4], knR: [90, 0, 0], thL: [-8, 0, 5], knL: [100, 0, 0], ftL: [66, 0, 0], spine: [10, 0, 0] }, 'inOut'],
    [1.25, KNEEL],
  ],
});

// =============================================================================== outfit (romance: down to the underwear, never less)
/** Top off over the head: crossed hands at the hem, pulled up over the head ('swap' = the garment covers the head). Also used to put it back on. */
add('undress_top', {
  duration: 2.3, meta: { look: 0, footIK: 1 },
  keys: [
    [0, {}],
    [0.4, { spine: [8, 0, 0], chest: [4, 0, 0], head: [8, 0, 0], uaL: [-26, 0, -4], faL: [-82, 0, 0], hL: [0, -30, 0], uaR: [-26, 0, 4], faR: [-82, 0, 0], hR: [0, 30, 0] }],
    [0.95, { spine: [-2, 0, 0], chest: [-6, 0, 0], head: [16, 0, 0], uaL: [-150, 0, 6], faL: [-70, 0, 0], hL: [-10, 0, 0], uaR: [-150, 0, -6], faR: [-70, 0, 0], hR: [-10, 0, 0], eyes: 0.2 }, 'inOut'],
    [1.2, { uaL: [-168, 0, 16], faL: [-36, 0, 0], uaR: [-168, 0, -16], faR: [-36, 0, 0], head: [6, 0, 0], eyes: 1 }],
    [1.65, { uaR: [-70, 0, 64], faR: [-20, 0, 0], hR: [10, 0, 0], uaL: [-20, 0, -30], faL: [-30, 0, 0], chest: [-2, -10, 0], head: [-4, -12, 0], mouth: 0.2 }, 'out'],
    [2.3, { ...STAND }],
  ],
  events: [{ t: 1.12, name: 'swap' }],
});
/** Bottoms off: thumbs at the waist, bend and push down, step out of them one foot at a time ('swap' at the knees). */
add('undress_bottom', {
  duration: 2.5, meta: { look: 0, footIK: 0.6 },
  keys: [
    [0, {}],
    [0.4, { uaL: [-6, 0, -12], faL: [-34, 0, 0], hL: [0, 0, -20], uaR: [-6, 0, 12], faR: [-34, 0, 0], hR: [0, 0, 20], head: [8, 0, 0] }],
    [1.05, { pos: [0, -0.1, -0.04], spine: [38, 0, 0], chest: [12, 0, 0], head: [6, 0, 0], thL: [-18, 0, 2], thR: [-18, 0, -2], knL: [30, 0, 0], knR: [30, 0, 0], ftL: [-8, 0, 0], ftR: [-8, 0, 0],
      uaL: [-56, 0, -10], faL: [-12, 0, 0], uaR: [-56, 0, 10], faR: [-12, 0, 0] }, 'inOut'],
    [1.55, { pos: [0, -0.03, -0.02], spine: [16, 0, 0], thL: [-34, 0, 4], knL: [62, 0, 0], ftL: [10, 0, 0], thR: [0, 0, -2], knR: [6, 0, 0], ftR: [0, 0, 0], uaL: [-20, 0, -34], faL: [-30, 0, 0], uaR: [-20, 0, 34], faR: [-30, 0, 0] }],
    [1.95, { thL: [0, 0, 2], knL: [4, 0, 0], ftL: [0, 0, 0], thR: [-34, 0, -4], knR: [62, 0, 0], ftR: [10, 0, 0], spine: [10, 0, 0] }],
    [2.5, { ...STAND }],
  ],
  events: [{ t: 1.1, name: 'swap' }],
});

/** Lying on the back, the body pivots around the hips; head toward −z. */
const LIE = {
  pos: [0, -0.8, 0], hips: [-90, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [8, 0, 0], head: [10, 0, 0],
  thL: [0, 0, 5], thR: [0, 0, -5], knL: [6, 0, 0], knR: [12, 0, 0], ftL: [-24, 0, 0], ftR: [-24, 0, 0],
  uaL: [6, 0, -36], faL: [-8, 0, 0], uaR: [6, 0, 36], faR: [-8, 0, 0],
};
export const LIE_POSE = LIE;
add('lie_back', {
  duration: 5, loop: true, meta: { footIK: 0, sit: 1, look: 0.6, breathe: 0.6 },
  keys: [[0, LIE]],
  osc: { chest: { x: [-1.5, 1, 0] }, head: { y: [4, 1, 0.3] } },
});
add('sleep', {
  duration: 5, loop: true, meta: { footIK: 0, sit: 1, look: 0, breathe: 0 },
  keys: [[0, { ...LIE, head: [10, 16, 0], faL: [-80, 0, 0], uaL: [-24, 0, -30], eyes: 0, mouth: 0.05 }]],
  osc: { chest: { x: [-2.5, 1, 0] }, spine: { x: [-1, 1, 0.1] }, uaL: { x: [1.5, 1, 0.05] }, uaR: { x: [1.5, 1, 0.05] } },
});

// =============================================================================== objects
add('pickup', {
  duration: 1.6, meta: { look: 0.2 },
  keys: [
    [0, {}],
    [0.45, { pos: [0, -0.34, 0], thL: [-66, 0, 10], thR: [-50, 0, -8], knL: [104, 0, 0], knR: [88, 0, 0], ftL: [-32, 0, 0], ftR: [-28, 0, 0],
      spine: [32, 0, 0], chest: [8, 0, 0], head: [12, 0, 0], uaL: [-50, 0, -16], faL: [-16, 0, 0], uaR: [-56, 0, 16], faR: [-14, 0, 0], hR: [20, 0, 0] }],
    [0.68, { uaR: [-52, 0, 14], faR: [-22, 0, 0], hR: [24, 0, 0] }],
    [1.0, { pos: [0, -0.2, 0], spine: [16, 0, 0], head: [4, 0, 0], uaR: [-36, 0, 18], faR: [-100, 0, 0], hR: [0, 0, 0], brow: 0.6, mouth: 0.3 }],
    [1.6, { ...STAND, mouth: 0.15 }],
  ],
  events: [{ t: 0.66, name: 'pick' }],
});

/** Holding a big object against the chest with both hands. */
const CARRY = { uaL: [-34, 0, -24], faL: [-82, 0, 0], hL: [0, -30, 10], uaR: [-34, 0, 24], faR: [-82, 0, 0], hR: [0, 30, -10], chest: [-5, 0, 0], spine: [-2, 0, 0], head: [-6, 0, 0] };
export const CARRY_POSE = CARRY;
add('carry_idle', {
  duration: 3.2, loop: true, meta: { look: 0.8 },
  keys: [[0, CARRY]],
  osc: { uaL: { x: [1.5, 1, 0] }, uaR: { x: [1.5, 1, 0.1] }, head: { y: [4, 1, 0.2] }, hips: { z: [1, 1, 0.25] } },
});
add('carry_walk', {
  duration: 1, loop: true, meta: { look: 0.6 },
  keys: cycle({
    contact: { ...WALK.contact, ...CARRY }, down: { ...WALK.down, ...CARRY, chest: [-3, 0, 0] },
    pass: { ...WALK.pass, ...CARRY }, up: { ...WALK.up, ...CARRY, chest: [-6, 0, 0] },
  }),
});

add('throw', {
  duration: 1.2, meta: { look: 0.2 },
  keys: [
    [0, CARRY],
    [0.4, { uaL: [-150, 0, -6], faL: [-60, 0, 0], uaR: [-150, 0, 6], faR: [-60, 0, 0], hL: [-30, 0, 0], hR: [-30, 0, 0],
      spine: [-10, 0, 0], chest: [-14, 0, 0], head: [-14, 0, 0], thR: [14, 0, -2], knL: [14, 0, 0], pos: [0, -0.02, -0.05], brow: 0.6 }, 'inOut'],
    [0.56, { uaL: [-70, 0, -10], faL: [-10, 0, 0], uaR: [-70, 0, 10], faR: [-10, 0, 0], hL: [10, 0, 0], hR: [10, 0, 0],
      spine: [20, 0, 0], chest: [6, 0, 0], head: [-6, 0, 0], thL: [-18, 0, 2], knL: [20, 0, 0], thR: [10, 0, -2], pos: [0, -0.03, 0.06], mouth: 0.6 }, 'snap'],
    [0.85, { uaL: [-40, 0, -24], faL: [-20, 0, 0], uaR: [-40, 0, 24], faR: [-20, 0, 0], spine: [12, 0, 0], mouth: 0.2 }],
    [1.2, { ...STAND, pos: [0, 0, 0.04] }],
  ],
  events: [{ t: 0.55, name: 'release' }],
});

add('throw_ball', {
  duration: 1.25, meta: { look: 0.1, lean: 0 },
  keys: [
    [0, {}],
    [0.38, { hips: [0, 24, 0], spine: [-4, 14, 0], chest: [-8, 22, 0], head: [-6, -38, 0], uaR: [10, 0, -60], faR: [-90, 0, 0], hR: [-30, 0, 0],
      uaL: [-60, 0, -40], faL: [-40, 0, 0], thL: [-24, 0, 4], knL: [12, 0, 0], thR: [14, 0, -4], knR: [16, 0, 0], ftL: [-10, 0, 0], pos: [0, -0.03, -0.06], brow: 0.7 }, 'inOut'],
    [0.6, { hips: [0, -20, 0], spine: [16, -12, 0], chest: [8, -22, 0], head: [-8, 0, 0], uaR: [-96, 0, 20], faR: [-14, 0, 0], hR: [20, 0, 0],
      uaL: [20, 0, -40], faL: [-60, 0, 0], thL: [-30, 0, 4], knL: [26, 0, 0], thR: [22, 0, -4], knR: [30, 0, 0], ftR: [30, 0, 0], pos: [0, -0.05, 0.1], mouth: 0.5 }, 'snap'],
    [0.85, { uaR: [-50, 0, 34], faR: [-20, 0, 0], spine: [20, -6, 0], head: [-10, 0, 0] }],
    [1.25, { ...STAND, pos: [0, 0, 0.08] }],
  ],
  events: [{ t: 0.58, name: 'release' }],
});

add('search', {
  duration: 2.6, meta: { look: 0 },
  keys: [
    [0, {}],
    [0.4, { spine: [30, 0, 0], chest: [8, 0, 0], head: [14, 0, 0], uaL: [-58, 0, -16], faL: [-40, 0, 0], uaR: [-58, 0, 16], faR: [-40, 0, 0], thL: [-8, 0, 2], knL: [14, 0, 0], knR: [14, 0, 0], pos: [0, -0.03, 0], brow: 0.4 }],
    [0.7, { uaL: [-48, 0, -24], faL: [-60, 0, 0], uaR: [-64, 0, 10], faR: [-24, 0, 0], head: [14, 8, 0] }],
    [1.0, { uaL: [-64, 0, -10], faL: [-24, 0, 0], uaR: [-48, 0, 24], faR: [-60, 0, 0], head: [14, -8, 0] }],
    [1.3, { uaL: [-48, 0, -24], faL: [-60, 0, 0], uaR: [-64, 0, 10], faR: [-24, 0, 0], head: [16, 6, 0] }],
    [1.6, { uaL: [-64, 0, -10], faL: [-24, 0, 0], uaR: [-48, 0, 24], faR: [-60, 0, 0], head: [16, -6, 0] }],
    [2.0, { spine: [10, 0, 0], head: [-8, 0, 0], uaR: [-30, 0, 20], faR: [-110, 0, 0], uaL: STAND.uaL, faL: STAND.faL, brow: 0.6, mouth: 0.3 }],
    [2.6, { ...STAND }],
  ],
  events: [{ t: 1.9, name: 'found' }],
});

// =============================================================================== vehicles & water
/** Riding a scooter: origin = seat surface, feet on the floorboard, hands on the handlebar. */
const RIDE = {
  pos: [0, -0.78, 0.02], hips: [0, 0, 0], spine: [8, 0, 0], chest: [2, 0, 0], head: [-10, 0, 0],
  thL: [-74, 0, 10], thR: [-74, 0, -10], knL: [70, 0, 0], knR: [70, 0, 0], ftL: [-4, 0, 0], ftR: [-4, 0, 0],
  uaL: [-62, 0, -6], faL: [-30, 0, 0], hL: [-10, 0, 0], uaR: [-62, 0, 6], faR: [-30, 0, 0], hR: [-10, 0, 0],
};
add('ride_scooter', {
  duration: 3, loop: true, meta: { footIK: 0, sit: 1, look: 0.5, lean: 0.4 },
  keys: [[0, RIDE]],
  osc: { head: { y: [5, 1, 0] }, chest: { y: [1.5, 1, 0.3] }, pos: { y: [0.004, 6, 0] } },
});
/** Passenger hugging the driver from behind. */
add('ride_passenger', {
  duration: 4, loop: true, meta: { footIK: 0, sit: 1, look: 0.3, lean: 0.4 },
  keys: [[0, { ...RIDE, spine: [16, 0, 0], chest: [6, 0, 0], head: [0, 24, 10], thL: [-70, 0, 16], thR: [-70, 0, -16], knL: [80, 0, 0], knR: [80, 0, 0],
    uaL: [-58, 0, -22], faL: [-70, 0, 0], hL: [0, -30, 0], uaR: [-58, 0, 22], faR: [-70, 0, 0], hR: [0, 30, 0], eyes: 0.4 }]],
  osc: { head: { z: [2, 1, 0] }, chest: { y: [1.5, 1, 0.3] } },
});

/** Treading water: origin = water surface, the body hangs below with the shoulders at the surface. */
const SWIM = {
  pos: [0, -1.24, 0], hips: [-10, 0, 0], spine: [10, 0, 0], chest: [4, 0, 0], head: [-8, 0, 0],
  uaL: [-30, 0, 20], faL: [-30, 0, 0], hL: [0, 0, 20], uaR: [-30, 0, -20], faR: [-30, 0, 0], hR: [0, 0, -20],
  thL: [-30, 0, 8], thR: [-10, 0, -8], knL: [50, 0, 0], knR: [40, 0, 0], ftL: [30, 0, 0], ftR: [30, 0, 0],
};
add('swim', {
  duration: 1.6, loop: true, meta: { footIK: 0, sit: 1, look: 0.8, breathe: 0.4 },
  keys: [[0, SWIM]],
  osc: {
    pos: { y: [0.03, 1, 0] }, uaL: { z: [16, 1, 0], x: [8, 1, 0.25] }, uaR: { z: [-16, 1, 0], x: [8, 1, 0.25] }, faL: { x: [10, 1, 0.1] }, faR: { x: [10, 1, 0.1] },
    hL: { z: [20, 1, 0.2] }, hR: { z: [-20, 1, 0.2] }, thL: { x: [18, 1, 0] }, thR: { x: [18, 1, 0.5] }, knL: { x: [20, 1, 0.2] }, knR: { x: [20, 1, 0.7] },
  },
});

// =============================================================================== couples (pairs.js adds hand IK on top)
/** Arms wrapped around the partner's back (her: around his neck when `high`). */
const HUG = { spine: [6, 0, 0], chest: [6, 0, 0], neck: [6, 0, 0], head: [4, 26, 8],
  uaL: [-66, 0, -6], faL: [-84, 0, 0], hL: [0, -40, 0], uaR: [-66, 0, 6], faR: [-84, 0, 0], hR: [0, 40, 0], eyes: 0.15, mouth: 0 };
add('hug', {
  duration: 4.4, loop: true, meta: { look: 0, footIK: 1 },
  keys: [[0, HUG], [2.2, { head: [6, 22, 10], chest: [6, 3, 0] }]],
  osc: { pos: { x: [0.006, 1, 0] }, hips: { y: [2, 1, 0.2] }, spine: { y: [2, 1, 0.25] } },
});
add('hug_high', {
  duration: 4.4, loop: true, meta: { look: 0, footIK: 1 },
  keys: [[0, { ...HUG, head: [-4, -26, -8], uaL: [-104, 0, 10], faL: [-74, 0, 0], uaR: [-104, 0, -10], faR: [-74, 0, 0], ftL: [8, 0, 0], ftR: [8, 0, 0], pos: [0, 0.01, 0] }],
    [2.2, { head: [-4, -22, -10] }]],
  osc: { hips: { y: [2, 1, 0.7] }, spine: { y: [2, 1, 0.75] } },
});
/** Leaning in for a kiss, hands on her waist. */
add('kiss_lean', {
  duration: 4, loop: true, meta: { look: 0, footIK: 1 },
  keys: [[0, { spine: [8, 0, 0], chest: [8, 0, 0], neck: [6, 0, 0], head: [8, 12, 8],
    uaL: [-50, 0, -6], faL: [-70, 0, 0], hL: [0, -30, 0], uaR: [-50, 0, 6], faR: [-70, 0, 0], hR: [0, 30, 0], eyes: 0 }]],
  osc: { head: { z: [2, 1, 0] }, pos: { x: [0.004, 1, 0] } },
});
/** On tiptoes, arms around his neck, face tilted up. */
add('kiss_receive', {
  duration: 4, loop: true, meta: { look: 0, footIK: 0.5 },
  keys: [[0, { pos: [0, 0.035, 0], ftL: [22, 0, 0], ftR: [22, 0, 0], thL: [-4, 0, 2], knL: [6, 0, 0], chest: [-8, 0, 0], neck: [-6, 0, 0], head: [-16, -12, -8],
    uaL: [-100, 0, 8], faL: [-70, 0, 0], hL: [0, -30, 0], uaR: [-100, 0, -8], faR: [-70, 0, 0], hR: [0, 30, 0], eyes: 0 }]],
  osc: { head: { z: [2, 1, 0.5] } },
});
/** One arm raised to her hair (IK slides the hand along the hair). */
add('stroke', {
  duration: 3, loop: true, meta: { look: 0.6 },
  keys: [[0, { chest: [2, 8, 0], head: [2, 4, 0], uaR: [-90, 0, 0], faR: [-60, 0, 0], hR: [0, 20, 0], uaL: [-30, 0, -24], faL: [-60, 0, 0] }]],
  osc: { chest: { y: [2, 1, 0] } },
});
/** Both hands forward/down onto the partner (shoulders, back, legs): the IK places and kneads. */
add('massage', {
  duration: 2, loop: true, meta: { look: 0.6 },
  keys: [[0, { spine: [12, 0, 0], chest: [6, 0, 0], head: [10, 0, 0], uaL: [-50, 0, -10], faL: [-50, 0, 0], hL: [10, 0, 0], uaR: [-50, 0, 10], faR: [-50, 0, 0], hR: [10, 0, 0] }]],
  osc: { spine: { x: [2, 2, 0] }, chest: { y: [3, 1, 0] } },
});
/** Leaning to her neck / ear (head tilted down and sideways). */
add('lean_neck', {
  duration: 4, loop: true, meta: { look: 0 },
  keys: [[0, { spine: [10, 0, 0], chest: [10, 6, 4], neck: [10, 0, 0], head: [16, 28, 14],
    uaL: [-54, 0, -4], faL: [-76, 0, 0], hL: [0, -30, 0], uaR: [-54, 0, 4], faR: [-76, 0, 0], hR: [0, 30, 0], eyes: 0.1 }]],
  osc: { head: { x: [3, 2, 0] } },
});
/** Whispering: lean in, one hand cupped at the mouth. */
add('whisper', {
  duration: 3, loop: true, meta: { look: 0 },
  keys: [[0, { spine: [8, 0, 0], chest: [6, 10, 4], neck: [6, 0, 0], head: [10, 30, 10], uaR: [-48, 0, 10], faR: [-128, 0, 0], hR: [0, 40, 0], eyes: 0.6 }]],
  osc: { head: { x: [1.5, 3, 0] } },
});
/** Her: head tilted away, eyes closed, hands loose (receiving a neck kiss / whisper). */
add('tilt_away', {
  duration: 4, loop: true, meta: { look: 0 },
  keys: [[0, { chest: [-4, 6, 0], neck: [-2, 0, -6], head: [-8, 20, -16], uaL: [-10, 0, -30], faL: [-50, 0, 0], uaR: [-20, 0, 26], faR: [-70, 0, 0], eyes: 0, mouth: 0.1 }]],
  osc: { head: { z: [2, 1, 0] }, chest: { y: [2, 1, 0.3] } },
});
/** Her: shy pose, hands together in front, head a little down. */
add('shy', {
  duration: 4, loop: true, meta: { look: 0.5 },
  keys: [[0, { ...IDLE_F, uaL: [-22, 0, -42], faL: [-48, 0, 0], hL: [0, -40, 0], uaR: [-22, 0, 42], faR: [-48, 0, 0], hR: [0, 40, 0], head: [8, 8, 8], chest: [2, 0, 0] }]],
  osc: { hips: { z: [1.5, 1, 0] }, head: { z: [2, 1, 0.3] }, knL: { x: [3, 1, 0.5] } },
});
/** Guide: she leads, one arm back holding his hand; he follows with the arm forward (upper-body overlays). */
add('lead_hand', {
  duration: 2, loop: true, meta: { look: 0.3 },
  keys: [[0, { uaR: [36, 0, 22], faR: [-14, 0, 0], hR: [0, 40, 0], chest: [-2, -14, 0], head: [-2, -30, 0] }]],
  osc: { head: { y: [6, 1, 0] } },
});
add('follow_hand', {
  duration: 2, loop: true, meta: { look: 0.8 },
  keys: [[0, { uaL: [-34, 0, -18], faL: [-16, 0, 0], hL: [0, -30, 0], chest: [-2, 4, 0] }]],
});
/** Holding hands side by side (left hand of a / right hand of b reach toward each other). */
add('hold_hand_L', { duration: 2, loop: true, keys: [[0, { uaL: [2, 0, -18], faL: [-16, 0, 0], hL: [0, -30, 0] }]] });
add('hold_hand_R', { duration: 2, loop: true, keys: [[0, { uaR: [2, 0, 18], faR: [-16, 0, 0], hR: [0, 30, 0] }]] });

/** Default gestures that may play on the upper body only (while walking or seated). */
export const UPPER_OK = new Set(['talk', 'talk_gesture', 'wave', 'nod', 'shake_head', 'point', 'laugh', 'surprised', 'think', 'throw_ball', 'carry_idle',
  'stroke', 'massage', 'whisper', 'lead_hand', 'follow_hand', 'hold_hand_L', 'hold_hand_R']);

/** Every clip definition (name → def). */
export const CLIPS = C;
/** Contract names (docs/ARCHITECTURE.md "Clips"). Extra private clips: idle_f, sit_feet, sit_legs, sit_knees, kneel_bow, ride_passenger,
 *  hug, hug_high, kiss_lean, kiss_receive, stroke, massage, lean_neck, whisper, tilt_away, shy, lead_hand, follow_hand, hold_hand_L/R. */
export const CLIP_NAMES = ['idle', 'idle_look', 'idle_stretch', 'walk', 'run', 'talk', 'talk_gesture', 'wave', 'nod', 'shake_head', 'point', 'laugh', 'surprised', 'cheer', 'defeat', 'think',
  'sit_down', 'sit_idle', 'stand_up', 'sit_ground', 'kneel', 'lie_back', 'pickup', 'carry_idle', 'carry_walk', 'throw', 'throw_ball', 'search', 'ride_scooter', 'swim', 'sleep'];
export { LEGS, ARMS };
