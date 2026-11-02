// Evolution scene (docs/GDD.md "Evolution"): "Cosa? {nome} si sta evolvendo!" — slow orbit close-up, the Velmon
// glows white, light motes spiral in, the two silhouettes alternate faster and faster, flash, reveal of the new
// form (silhouette melts away), happy hop, fanfare. Cannot be cancelled.
// Used by the battle (with the ally model on the arena) and by creatures.evolve()/levelUp outside battles (then it
// stages its own model in front of the player).
import * as THREE from 'three';
import { SPECIES } from '../creatures/species.js';
import { nameOf, evolve as evolveData } from '../creatures/monster.js';
import { buildVelmon } from '../creatures/model.js';
import { wait, tween, during, groundAt } from './util.js';
import { createFx } from './fx.js';

/**
 * @param {any} ctx
 * @param {object} mon            Monster (mutated: species, hp, moves)
 * @param {string} toSpecies
 * @param {{model?: any, say?: (text: string) => Promise<any>, fx?: any, keepModel?: boolean}} [opts]
 *   model: the VelmonModel already on stage (battle); say: message function (battle HUD); keepModel: return the new
 *   model instead of disposing it (the battle keeps it on the arena).
 * @returns {Promise<{model: any, learned: string[]}>}
 */
export async function playEvolution(ctx, mon, toSpecies, opts = {}) {
  if (!mon || !SPECIES[toSpecies]) return { model: null, learned: [] };
  const fx = opts.fx || (ctx.__evoFx ||= createFx(ctx));
  const say = opts.say || (text => ctx.ui?.say ? ctx.ui.say('', text) : wait(ctx, 1.2));
  const ownStage = !opts.model;
  const release = ownStage ? ctx.busy?.push?.('cutscene') : null;
  const prevTrack = ctx.audio?.track;
  const before = nameOf(mon);
  let oldM = opts.model, stageObj = null;
  try {
    if (ownStage) {
      // stage the Velmon in front of the player, facing them
      // stage the Velmon between the player and the camera, facing the camera (its face reads, the player is behind)
      const pl = ctx.player?.object || ctx.cameraRig?.followed;
      const px = pl?.position.x ?? 0, pz = pl?.position.z ?? 0;
      const cam = ctx.camera?.position;
      let dx = cam ? cam.x - px : 0, dz = cam ? cam.z - pz : 1;
      const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const x = px + dx * 1.7 + dz * 0.5, z = pz + dz * 1.7 - dx * 0.5;
      oldM = buildVelmon(ctx, mon.species);
      oldM.object.position.set(x, groundAt(ctx, x, z, pl?.position.y ?? 0), z);
      oldM.object.rotation.y = Math.atan2(dx, dz);
      ctx.scene.add(oldM.object);
      stageObj = oldM.object;
      oldM.play('appear');
      ctx.player?.face?.({ x, z });
      ctx.player?.lookAt?.(oldM.object);
      await wait(ctx, 0.5);
    }
    const obj = oldM.object;
    ctx.audio?.music?.('evolution');
    ctx.cameraRig?.closeUp?.('evolution', { target: obj });
    oldM.play('idle');
    await say(`Cosa? ${before} si sta evolvendo!`);

    // build the new form, hidden, same place
    const newM = buildVelmon(ctx, toSpecies);
    newM.object.position.copy(obj.position);
    newM.object.rotation.copy(obj.rotation);
    newM.object.visible = false;
    newM.setSilhouette(1);
    newM.setGlow(1, '#fff8d8');
    obj.parent?.add(newM.object) ?? ctx.scene.add(newM.object);

    // glow up
    oldM.setGlow(1, '#fff8d8');
    fx.play('evolveIn', obj);
    await tween(ctx, 1.1, k => oldM.setSilhouette(k));
    fx.play('evolveIn', obj);
    // alternate the silhouettes, faster and faster
    const total = 3.0;
    let showNew = false, next = 0.5, acc = 0, flips = 0;
    const so = obj.scale.x, sn = newM.object.scale.x;
    await during(ctx, (dt, t) => {
      acc += dt;
      const interval = 0.5 * Math.pow(1 - Math.min(1, t / total), 1.6) + 0.045;
      if (acc >= next) {
        acc = 0; next = interval; showNew = !showNew; flips++;
        obj.visible = !showNew; newM.object.visible = showNew;
        ctx.audio?.sfx?.('ui_tap', { vol: 0.35, pitch: 0.8 + Math.min(1.2, t / total) });
        if (flips % 4 === 0 && t < total - 0.4) fx.play('evolveIn', obj);
      }
      // a soft pulse on whichever is visible
      const pulse = 1 + 0.05 * Math.sin(t * 22);
      obj.scale.setScalar(so * pulse); newM.object.scale.setScalar(sn * pulse);
      return t >= total;
    }, total + 1);
    obj.scale.setScalar(so); newM.object.scale.setScalar(sn);

    // flash + reveal
    ctx.fade?.flash?.('#ffffff', 520);
    ctx.cameraRig?.shake?.(0.25);
    obj.visible = false; newM.object.visible = true;
    fx.play('evolveBurst', newM.object);
    ctx.audio?.sfx?.('ball_burst', { pitch: 1.2 });
    await wait(ctx, 0.25);
    newM.play('happy');
    await tween(ctx, 0.9, k => { newM.setSilhouette(1 - k); newM.setGlow(1 - k, '#fff8d8'); }, 'out');
    newM.setSilhouette(0); newM.setGlow(0);

    // data
    const from = mon.species;
    const learned = evolveData(mon, toSpecies);
    ctx.creatures?.dex?.markCaught?.(toSpecies);
    ctx.save?.commit?.();
    ctx.bus.emit('velmon:evolved', { uid: mon.uid, from, to: toSpecies });
    ctx.bus.emit('team:change', {});
    ctx.audio?.jingle?.('evolved');
    await say(`Congratulazioni! ${before} si è evoluto in ${SPECIES[toSpecies].name}!`);
    for (const mv of learned) await say(`${nameOf(mon)} impara ${mv}!`);

    if (ownStage) {
      ctx.player?.lookAt?.(null);
      await tween(ctx, 0.35, k => newM.object.scale.setScalar(Math.max(0.001, 1 - k)), 'in');
      newM.dispose();
      oldM.dispose();
      await ctx.cameraRig?.release?.({ dur: 0.8 });
      return { model: null, learned };
    }
    oldM.object.visible = false;
    if (!opts.keepModel) newM.dispose();
    return { model: opts.keepModel ? newM : null, learned };
  } catch (e) {
    console.error('[evolution] failed', e);
    // make sure the data change still happens
    if (mon.species !== toSpecies) { try { evolveData(mon, toSpecies); ctx.bus.emit('team:change', {}); } catch { /* ignore */ } }
    if (stageObj) oldM?.dispose?.();
    return { model: null, learned: [] };
  } finally {
    if (ownStage) { ctx.player?.lookAt?.(null); if (prevTrack && prevTrack !== 'evolution') ctx.audio?.music?.(prevTrack); release?.(); }
  }
}
