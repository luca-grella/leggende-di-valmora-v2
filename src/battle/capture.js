// Catch chance and the ball throw sequence (docs/GDD.md "Catch"):
// chance = clamp(((3 − 2·hp/maxHp)/3) × rate/255 × ball, 0.04, 0.95); Sfera ×1, Megasfera ×1.5.
// throwBall: throw clip → the Sfera arcs onto the foe → opens, light absorbs the Velmon → falls and bounces →
// close low camera → 1-3 shakes → click + stars (caught) or burst out (escaped).
import * as THREE from 'three';
import { SPECIES } from '../creatures/species.js';
import { maxHp } from '../creatures/monster.js';
import { buildSphere } from '../creatures/sphere.js';
import { wait, tween, during, groundAt } from './util.js';

export const BALL_MULT = { sfera: 1, megasfera: 1.5 };

export function catchChance(mon, ballKind = 'sfera') {
  const ball = BALL_MULT[ballKind] ?? 1;
  const f = Math.max(0, mon.hp) / Math.max(1, maxHp(mon));
  const rate = SPECIES[mon.species]?.legendary ? 6 : (SPECIES[mon.species]?.rate ?? 45);
  return Math.min(0.95, Math.max(0.04, ((3 - 2 * f) / 3) * (rate / 255) * ball));
}

/** Hand position of the thrower (fallback: chest height, a bit to the right). */
function handPos(run, out) {
  const o = run.playerObj;
  if (!o) return out.set(run.arena.slots.player.x, run.arena.slots.player.y + 1.3, run.arena.slots.player.z);
  o.getWorldPosition(out);
  const f = o.rotation.y;
  out.x += Math.cos(f) * -0.25 + Math.sin(f) * 0.2; out.z += -Math.sin(f) * -0.25 + Math.cos(f) * 0.2;
  out.y += 1.25;
  return out;
}

/**
 * Throw a capture ball at run.foeModel. Returns true when the Velmon is caught. The ball (on the ground) is left
 * in run.caughtBall when caught; the battle disposes it.
 */
export async function throwBall(ctx, run, ballKind = 'sfera', rnd = Math.random) {
  const foeM = run.foeModel, foeObj = foeM?.object;
  if (!foeObj) return false;
  const sphere = buildSphere(ctx, ballKind);
  ctx.scene.add(sphere.object);
  run.trash?.push(() => sphere.dispose());
  const S = sphere.object;
  const fx = run.fx;

  // 1. throw
  const human = run.playerHuman;
  run.cam?.('battle_wide');
  const clip = human?.play?.('throw_ball', { loop: false, fade: 0.15 });
  await wait(ctx, human ? 0.42 : 0.15);
  ctx.audio?.sfx?.('ball_throw');
  const from = handPos(run, new THREE.Vector3());
  const fp = foeObj.position;
  const h = foeM.height || 0.8;
  const hover = new THREE.Vector3(fp.x, fp.y + Math.max(0.9, h * 0.95) + 0.15, fp.z)
    .addScaledVector(run.arena.forward, -Math.min(0.5, (foeM.radius || 0.4) * 0.6));
  sphere.play('throw');
  const T = 0.72;
  S.position.copy(from);
  await tween(ctx, T, k => {
    S.position.lerpVectors(from, hover, k);
    S.position.y += Math.sin(k * Math.PI) * 1.5;
  }, 'linear');
  clip?.then?.(() => human?.play?.('idle', { fade: 0.3 }));

  // 2. hit, bounce back up a little, open and absorb
  ctx.audio?.sfx?.('hit_weak', { vol: 0.6 });
  const up = hover.clone().addScaledVector(run.arena.forward, -0.3); up.y += 0.25;
  await tween(ctx, 0.22, k => S.position.lerpVectors(hover, up, k), 'out');
  S.rotation.y = Math.atan2(-run.arena.forward.x, -run.arena.forward.z);   // button towards the player
  await sphere.play('open');
  ctx.audio?.sfx?.('ball_burst', { vol: 0.5, pitch: 1.3 });
  foeM.setSilhouette(1);
  fx?.play('absorb', foeObj, S);
  const fromP = foeObj.position.clone(), s0 = foeObj.scale.x;
  const ballC = S.position.clone().add(new THREE.Vector3(0, sphere.radius, 0));
  await tween(ctx, 0.42, k => {
    foeObj.scale.setScalar(s0 * (1 - k) + 0.001);
    foeObj.position.lerpVectors(fromP, ballC, k * k);
  }, 'in');
  foeObj.visible = false;
  run.arena?.showShadow?.('foe', false);
  await sphere.play('close');

  // 3. fall + bounces to the ground
  const gy = groundAt(ctx, S.position.x, S.position.z, fp.y);
  const y0 = S.position.y;
  let vy = 0, y = y0, bounces = 0;
  await during(ctx, dt => {
    vy -= 14 * dt; y += vy * dt;
    if (y <= gy) { y = gy; vy = -vy * 0.38; bounces++; ctx.audio?.sfx?.('ball_click', { vol: 0.5 - bounces * 0.15, pitch: 0.8 }); if (bounces >= 3 || Math.abs(vy) < 0.6) { S.position.y = gy; return true; } }
    S.position.y = y;
    return false;
  }, 3);
  run.cam?.('capture', { target: S });
  await wait(ctx, 0.55);

  // 4. shakes
  const p = catchChance(run.foe, ballKind);
  const caught = rnd() < p;
  const shakes = caught ? 3 : Math.floor(rnd() * 3) + (rnd() < p * 1.6 ? 1 : 0);
  for (let i = 0; i < Math.min(3, shakes); i++) {
    ctx.audio?.sfx?.('ball_shake');
    await sphere.play('shake');
    await wait(ctx, 0.38);
  }
  if (caught) {
    ctx.audio?.sfx?.('ball_click');
    sphere.play('click');
    fx?.play('stars', S);
    ctx.haptic?.([20, 40, 20]);
    await wait(ctx, 0.5);
    run.caughtBall = sphere;
    return true;
  }
  // 5. escape
  ctx.audio?.sfx?.('ball_burst');
  sphere.play('burst');
  fx?.play('release', S);
  foeObj.position.copy(fromP);
  foeObj.scale.setScalar(s0);
  foeObj.visible = true;
  run.arena?.showShadow?.('foe', true);
  foeM.play('appear');
  await tween(ctx, 0.5, k => foeM.setSilhouette(1 - k));
  foeM.setSilhouette(0);
  run.cam?.('battle_wide');
  await tween(ctx, 0.25, k => S.scale.setScalar(Math.max(0.001, 1 - k)), 'in');
  sphere.dispose();
  run.lastShakes = shakes;
  return false;
}
