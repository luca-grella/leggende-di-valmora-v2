// Ferries: dock interactions and the short boat-ride vignette (fade, the little ferry sails into the
// destination harbour under a tracking ride shot, horn, fade, the player steps onto the pier).
import * as THREE from 'three';
import { Builder } from './builder.js';
import { FERRIES, AREAS } from './map.js';

const NAME = Object.fromEntries(AREAS.map(a => [a.id, a.name]));

/** The ferry boat (own group, origin at the waterline, bow towards +z). */
export function buildFerryBoat(ctx, mats) {
  const b = new Builder({ seed: 'ferry', groundAt: () => -1 });
  b.box(4.2, 1.6, 11, 0, 0.4, 0, '#ffffff', { round: 0.7, grad: 0.15 });
  b.box(4.25, 0.45, 11.05, 0, -0.15, 0, '#e8474a', { round: 0.4 });
  b.box(4.3, 0.18, 10.4, 0, 0.75, 0, '#2f86c9', { round: 0.08 });
  b.cone(2.1, 3.2, 0, 0.4, 6.4, '#ffffff', { rx: Math.PI / 2, seg: 10, sx: 1, sz: 0.38 });
  b.box(3.9, 0.12, 10.2, 0, 1.22, -0.2, '#d9a46a', { round: 0.05 });
  b.box(3.0, 1.7, 4.0, 0, 2.1, -1.6, '#fff8ee', { round: 0.3 });
  for (let k = 0; k < 3; k++) for (const s of [-1, 1]) b.box(0.06, 0.6, 0.7, s * 1.52, 2.3, -3.0 + k * 1.3, '#9fd4f5', { mat: 'windows', round: 0.08 });
  b.box(3.3, 0.25, 4.4, 0, 3.05, -1.6, '#2fa8a0', { round: 0.1 });
  b.cyl(0.42, 0.5, 1.5, 0, 3.8, -2.6, '#e8474a', { seg: 12 }); b.cyl(0.5, 0.5, 0.25, 0, 4.6, -2.6, '#2a2140', { seg: 12 });
  b.cyl(0.04, 0.04, 2.2, 0, 4.2, 1.2, '#4a4a5e', { seg: 4 }); b.box(0.7, 0.4, 0.03, 0.36, 5.0, 1.2, '#ffd23f');
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) b.box(0.06, 0.6, 0.06, s * 1.9, 1.55, -4.2 + k * 1.6, '#ffffff');
  for (const s of [-1, 1]) b.box(0.08, 0.06, 9.0, s * 1.9, 1.85, 0, '#ffffff');
  b.torus(0.32, 0.1, 2.1, 1.5, 1.5, '#ff8a3c', { ry: Math.PI / 2 });
  const g = b.build(mats.forBuilder(), { name: 'ferry', matrixAuto: true });
  const root = new THREE.Group(); root.name = 'ferry-boat'; root.add(g);
  root.traverse(o => { if (o.isMesh) { o.matrixAutoUpdate = true; } });
  ctx.toon.outline?.(root, { width: 0.025 });
  return root;
}

/**
 * @param {any} ctx
 * @param {any} world internal world (needs: docks, ensureIslandOf(x,z), canPass, mats, teleportPlayer, setOverride)
 */
export function createFerries(ctx, world) {
  let busy = false;
  const ferriesAt = town => FERRIES.filter(f => f.a === town || f.b === town).map(f => ({ ...f, to: f.a === town ? f.b : f.a }));

  async function travel(ferryId, fromTown) {
    const F = FERRIES.find(f => f.id === ferryId);
    if (!F || busy) return false;
    if (F.gate && !world.canPass(F.gate)) {
      await ctx.ui?.say?.('Marinaio', ['Questa linea non è ancora in servizio.', 'Torna più avanti nella tua avventura!']);
      return false;
    }
    const from = fromTown || (world.area === F.b ? F.b : F.a);
    const to = from === F.a ? F.b : F.a;
    const dock = world.docks[to];
    if (!dock) return false;
    busy = true;
    const release = ctx.busy.push('travel');
    try {
      ctx.ui?.letterbox?.(true);
      await ctx.fade.out(450);
      world.ensureIslandAt(dock.x, dock.z);
      ctx.bus.emit('ferry:travel', { id: ferryId, from, to });
      // boat path: from open sea towards the side of the pier
      const fx = Math.sin(dock.facing), fz = Math.cos(dock.facing), sx = fz, sz = -fx;
      const end = new THREE.Vector3(dock.endX + fx * 4 + sx * 5.5, 0, dock.endZ + fz * 4 + sz * 5.5);
      const start = end.clone().add(new THREE.Vector3(fx * 46 + sx * 14, 0, fz * 46 + sz * 14));
      const boat = world.ferryBoat || (world.ferryBoat = buildFerryBoat(ctx, world.mats));
      ctx.scene.add(boat);
      const hide = ctx.player?.object; const wasVis = hide?.visible;
      if (hide) hide.visible = false;
      const place = t => {
        const e = t * t * (3 - 2 * t);
        boat.position.lerpVectors(start, end, e);
        const tt = ctx.loop.t;
        boat.position.y = Math.sin(tt * 1.6) * 0.12;
        boat.rotation.set(Math.sin(tt * 1.3) * 0.03, Math.atan2(end.x - start.x, end.z - start.z), Math.sin(tt * 1.1) * 0.04);
      };
      place(0);
      ctx.cameraRig.closeUp?.('ride', { target: boat }, { ease: 'cut', dur: 0 });
      await ctx.fade.in(450);
      ctx.audio?.sfx?.('ferry_horn');
      const dur = 4.8;
      await new Promise(res => {
        let t = 0;
        const off = ctx.loop.add(dt => { t += dt / dur; place(Math.min(1, t)); if (t >= 1) { off(); res(); } }, ctx.ORDER.world + 1);
      });
      await ctx.fade.out(400);
      boat.removeFromParent();
      if (hide) hide.visible = wasVis ?? true;
      const p = world.poi(`${to}.dock`) || { x: dock.x, z: dock.z, facing: dock.facing };
      world.teleportPlayer(p.x, p.z, p.facing + Math.PI);
      await ctx.cameraRig.release?.({ dur: 0, ease: 'cut' });
      ctx.cameraRig.snap();
      await ctx.fade.in(450);
    } catch (e) {
      console.warn('[world] ferry failed', e);
      await ctx.fade.in(200);
    } finally {
      ctx.ui?.letterbox?.(false);
      release(); busy = false;
    }
    return true;
  }

  /** Dock interaction: pick a destination among the lines of this harbour. */
  async function dockMenu(town) {
    const lines = ferriesAt(town);
    if (!lines.length) return;
    const opts = lines.map(l => ({ label: NAME[l.to] || l.to, icon: '⛴️', sub: l.gate && !world.canPass(l.gate) ? 'Non ancora in servizio' : 'Partenza immediata', disabled: !!(l.gate && !world.canPass(l.gate)) }));
    let i = 0;
    if (ctx.ui?.choose) i = await ctx.ui.choose('Traghetto: dove vuoi andare?', opts, { cancel: true });
    else if (ctx.ui?.confirm) i = (await ctx.ui.confirm(`Prendere il traghetto per ${opts[0].label}?`)) ? 0 : -1;
    if (i == null || i < 0) return;
    await travel(lines[i].id, town);
  }

  return { travel, dockMenu, ferriesAt, get busy() { return busy; } };
}
