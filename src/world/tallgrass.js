// Tall grass (encounter zones): dense clumps of chunky pointed blades, dark at the roots and bright at
// the tips, swaying in the wind, parting around the player and shaking when an encounter rustles.
import * as THREE from 'three';
import { Builder } from './builder.js';
import { Streamer } from './instances.js';
import { extendToon, WIND } from './mats.js';
import { rng } from '../core/math.js';

const MAX_R = 4;

const VERT = /* glsl */`
#include <begin_vertex>
{
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float hgt = max(0.0, position.y);
  float k = hgt * hgt;
  float ph = uTime * 1.6 + ip.x * 0.37 + ip.z * 0.29;
  vec2 bend = vec2(sin(ph) * 0.11 + sin(ph * 2.7) * 0.03, cos(ph * 0.8) * 0.06) * uWind;
  // part around the player
  vec2 d = ip.xz - uPlayer.xy;
  float dl = length(d);
  float push = (1.0 - smoothstep(0.25, 1.1, dl)) * uPlayer.z;
  bend += normalize(d + 1e-4) * push * 0.55;
  // rustles (encounters)
  for (int i = 0; i < ${MAX_R}; i++) {
    vec4 r = uRustle[i];
    float age = uTime - r.z;
    if (age > 0.0 && age < 1.4) {
      float near = 1.0 - smoothstep(0.5, 3.2, length(ip.xz - r.xy));
      bend.x += sin(age * 34.0 + ip.x * 3.0) * 0.28 * near * (1.0 - age / 1.4) * r.w;
    }
  }
  // instance space: undo the instance yaw so bending is in world xz
  mat3 im = mat3(instanceMatrix);
  vec3 wb = vec3(bend.x, 0.0, bend.y);
  vec3 lb = transpose(im) * wb / max(dot(im[0], im[0]), 1e-4);
  transformed.xz += lb.xz * k;
  transformed.y -= length(bend) * k * 0.25;
}`;

/**
 * @param {any} ctx
 * @param {{x:number,z:number,rx:number,rz:number,rot:number,seed?:number}[]} patches
 * @param {{heightAt?:(x:number,z:number)=>number, colors?:any, name?:string}} [o]
 * @returns {{object:THREE.Group, isIn:(x:number,z:number)=>boolean, rustle:(x:number,z:number)=>void, update:(dt:number,t:number)=>void, dispose:()=>void}}
 */
export function buildTallGrass(ctx, patches, o = {}) {
  const heightAt = o.heightAt || (() => 0);
  const C = o.colors || { tallGrass: ctx.toon.palette.tallGrass, tallGrassTip: '#6fc24a' };
  const R = rng('tallgrass:' + (o.name || 'x'));
  // clump template
  const b = new Builder({ seed: 'tg' + C.tallGrass, ao: false });
  b.jitter = 0.05;
  const blades = 8;
  for (let k = 0; k < blades; k++) {
    const a = k / blades * Math.PI * 2 + R() * 0.4, r = 0.05 + R() * 0.12, h = 0.7 + R() * 0.3;
    b.cone(0.085, h, Math.sin(a) * r, h / 2, Math.cos(a) * r, k % 3 ? C.tallGrass : C.tallGrassTip, { seg: 3, open: true, rx: Math.cos(a) * 0.32, rz: -Math.sin(a) * 0.32, grad: 0.62, sx: 1.4, sz: 0.55, ry: a });
  }
  const geo = b.geometry({ ao: false });
  const U = { uPlayer: { value: new THREE.Vector3(0, 0, 0) }, uRustle: { value: Array.from({ length: MAX_R }, () => new THREE.Vector4(0, 0, -99, 0)) } };
  const mat = extendToon(ctx.toon.matUnique('#ffffff', { vertexColors: true, side: THREE.DoubleSide }), 'tallgrass', sh => {
    Object.assign(sh.uniforms, WIND, U);
    sh.vertexShader = `uniform float uTime, uWind; uniform vec3 uPlayer; uniform vec4 uRustle[${MAX_R}];\n` + sh.vertexShader.replace('#include <begin_vertex>', VERT);
  });
  const st = new Streamer('tallgrass', 40, 4);
  const set = st.set('clumps', geo, mat, { castShadow: false, cap: 7000 });
  const dens = ctx.quality?.grassDensity ?? 0.7;
  const step = 0.5 / Math.sqrt(Math.max(0.35, dens));
  const P = patches.map(p => ({ ...p, ca: Math.cos(p.rot), sa: Math.sin(p.rot) }));
  for (const p of P) {
    const ext = Math.max(p.rx, p.rz) + 0.6;
    for (let u = -ext; u <= ext; u += step) for (let v = -ext; v <= ext; v += step) {
      const uu = u + (R() - 0.5) * step * 0.8, vv = v + (R() - 0.5) * step * 0.8;
      const e = (uu / p.rx) ** 2 + (vv / p.rz) ** 2;
      const edge = 1 + (R() - 0.5) * 0.25;
      if (e > edge) continue;
      const x = p.x + uu * p.sa + vv * p.ca, z = p.z + uu * p.ca - vv * p.sa;
      const s = (0.75 + R() * 0.35) * (1 - Math.max(0, e - 0.65) * 0.9);
      set.add({ x, y: heightAt(x, z) - 0.05, z, ry: R() * Math.PI * 2, s, sy: s * (0.9 + R() * 0.25), color: new THREE.Color(1, 1, 1).offsetHSL((R() - 0.5) * 0.02, 0, (R() - 0.5) * 0.08) });
    }
  }
  st.finish();
  let ri = 0;
  const isIn = (x, z) => {
    for (const p of P) {
      const dx = x - p.x, dz = z - p.z;
      if (Math.abs(dx) > p.rx + 1 || Math.abs(dz) > p.rx + 1) continue;
      const u = dx * p.sa + dz * p.ca, v = dx * p.ca - dz * p.sa;
      if ((u / p.rx) ** 2 + (v / p.rz) ** 2 < 0.92) return true;
    }
    return false;
  };
  return {
    object: st.group, isIn, patches: P,
    rustle(x, z, strength = 1) { U.uRustle.value[ri++ % MAX_R].set(x, z, WIND.uTime.value, strength); },
    update(dt, t) {
      const f = ctx.cameraRig.mode === 'explore' ? ctx.cameraRig.followPos : ctx.cameraRig.lookTarget;
      st.update(f.x, f.z);
      const pl = ctx.player?.position;
      if (pl) U.uPlayer.value.set(pl.x, pl.z, 1); else U.uPlayer.value.z = 0;
    },
    refresh() { st.update(st.lx + 100, st.lz, true); },
    dispose() { st.dispose(); geo.dispose(); },
  };
}
