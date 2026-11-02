// Centro Cura (heal, sleep to morning, PC box) in every town + the blackout after a lost battle.
// The nurse stands at `center.T.counter`; the PC at `center.T.pc` opens the Box sheet.
import { TOWNS, TOWN_NAMES } from './util.js';
import { lookFor, STORY_LOOKS } from './looks.js';
import { buildBurst } from './props.js';

export function createCenters(ctx) {
  const K = () => ctx.story.kit;
  const pcUnreg = [];
  let blacking = false;

  async function healFx() {
    const p = K().playerPos();
    if (p) ctx.story.fx.add(buildBurst(ctx, '#ff8fb8', { count: 18, speed: 2.6 }), { x: p.x, y: (p.y || 0) + 1.2, z: p.z });
    K().jingle('heal'); K().sfx('heal');
  }

  const centers = {
    /** Heal the whole team at a town's Centro Cura (sets it as the respawn point). */
    async heal(townId = null) {
      const town = townId || ctx.world?.area || ctx.save.state.player?.lastCenter || 'alba';
      await K().busy('scene', async () => {
        try { ctx.creatures?.team?.healAll?.(); } catch (e) { console.warn('[centers] healAll', e); }
        if (TOWN_NAMES[town]) ctx.save.state.player.lastCenter = town;
        ctx.save.commit();
        await healFx();
        await K().wait(1.4);
      });
      K().toast('La tua squadra è in piena forma!', { icon: '💖' });
    },

    /** Sleep until 8:00 (fade). */
    async sleep() {
      await K().busy('scene', async () => {
        await ctx.fade.out(700, '#141a3a');
        ctx.time.skipTo(8);
        try { ctx.creatures?.team?.healAll?.(); } catch { /* optional */ }
        await K().wait(0.4);
        await ctx.fade.in(900);
      });
      K().toast(`Buongiorno! Sono le ${ctx.time.format()}.`, { icon: '☀️' });
    },

    /** All Velmon fainted: lose 1/10 of the coins, wake up healed in the last Centro Cura. */
    async blackout() {
      if (blacking) return;
      blacking = true;
      try {
        await K().afterBattle();
        const town = ctx.save.state.player?.lastCenter || 'alba';
        const lost = ctx.story.economy.lose(Math.floor(ctx.story.economy.coins / 10), 'blackout');
        await K().busy('scene', async () => {
          await ctx.fade.out(900, '#000');
          ctx.story.crime?.clearWanted?.(true);
          ctx.story.crime?.abortJob?.('Sei svenuto: il lavoro è saltato.');
          try { ctx.player?.mount?.(null); } catch { /* optional */ }
          try { ctx.story.grab?.drop?.(); } catch { /* optional */ }
          try { ctx.creatures?.team?.healAll?.(); } catch { /* optional */ }
          try { if (ctx.world?.interior) await ctx.world.exitInterior?.(); } catch { /* optional */ }
          try { await ctx.world?.enterInterior?.(`center.${town}`); } catch (e) { console.warn('[centers] blackout enter', e); }
          if (!ctx.world?.enterInterior) {
            const p = K().poi(`${town}.center_door`) || K().poi(`${town}.arrive`);
            if (p) ctx.player?.teleport?.(p.x, p.z, p.facing);
          }
          ctx.time.set((ctx.time.hours + 2) % 24);
          await K().wait(0.6);
          await ctx.fade.in(900);
        });
        const nurse = ctx.story.npcs.get(`nurse.${town}`);
        await K().say('Infermiera Gioia', [
          'Oh, finalmente ti sei svegliato! I tuoi Velmon erano esausti.',
          'Li abbiamo rimessi in sesto. Tu però riposati un attimo, eh!',
          ...(lost ? [`(Nella confusione hai perso 💰 ${lost}...)`] : []),
        ], { actor: nurse, expression: 'sad', gesture: 'nod' });
        ctx.save.commit();
      } finally { blacking = false; }
    },
    get blacking() { return blacking; },
  };

  // ---- nurses (one per town) and the PC
  for (const town of TOWNS) {
    ctx.story.npcs.define({
      id: `nurse.${town}`, name: 'Infermiera Gioia', look: lookFor(ctx, 'nurse', STORY_LOOKS.nurse), at: `center.${town}.counter`, kind: 'clerk',
      label: 'Cura', icon: '💖',
      talk: async (c, npc) => {
        await K().say('Infermiera Gioia', [`Benvenuto al Centro Cura di ${TOWN_NAMES[town]}!`], { actor: npc, expression: 'smile', gesture: 'wave' });
        const night = c.time.hours >= 19 || c.time.hours < 6;
        const opts = [{ label: 'Cura i miei Velmon', icon: '💖' }, { label: night ? 'Cura e riposa fino al mattino' : 'Riposa fino al mattino', icon: '🛏️' }, { label: 'No, grazie', icon: '👋' }];
        const i = await K().choose('Cosa desideri?', opts, { actor: npc });
        if (i === 0 || i === 1) {
          await K().say('Infermiera Gioia', ['Lasciali a me per un momento...'], { actor: npc, gesture: 'nod' });
          await ctx.story.dialogue.release();
          await centers.heal(town);
          if (i === 1) await centers.sleep();
          await K().say('Infermiera Gioia', ['Ecco fatto! I tuoi Velmon sono in piena forma.', 'Torna quando vuoi!'], { actor: npc, expression: 'smile', gesture: 'nod' });
        } else await K().say('Infermiera Gioia', ['A presto! Abbi cura dei tuoi Velmon.'], { actor: npc, expression: 'smile' });
      },
    });
  }

  ctx.bus.on('interior:enter', ({ id } = {}) => {
    while (pcUnreg.length) pcUnreg.pop()();
    if (!id?.startsWith('center.')) return;
    const town = id.split('.')[1];
    ctx.save.state.player.lastCenter = town; ctx.save.commit();
    const p = K().poi(`${id}.pc`);
    if (!p) return;
    pcUnreg.push(ctx.interact.register({
      id: `story.pc.${town}`, pos: { x: p.x, z: p.z }, radius: 1.4, label: 'Box', icon: '💻',
      run: async () => {
        K().sfx('ui_open');
        if (ctx.ui?.sheet) { ctx.ui.sheet('box'); await K().until(() => !ctx.ui.isOpen?.(), 3600); }
        else await K().say('', ['Il PC del Box si accende con un ronzio... (Box non disponibile)']);
      },
    }));
  });
  ctx.bus.on('interior:exit', () => { while (pcUnreg.length) pcUnreg.pop()(); });

  // every lost battle (wild, trainer, guard, bet…) ends in the Centro Cura
  ctx.bus.on('battle:end', ({ result } = {}) => { if (result === 'lose') centers.blackout(); });
  return centers;
}
