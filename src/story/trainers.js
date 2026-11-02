// Route trainers + town champions (ported from v1 src/world/trainers.js, placed by hand at route POIs).
// Data shape (docs/ARCHITECTURE.md): {id:'r1.t1', area, poi:'r1.trainer1', cls, name, sex, look, team:[[speciesId, level]],
// reward, before:[], after:[], sight=13, champion?, town?}. Teams use evolved forms above evolution level + 2.
// Sight: 13 m cone ±35°, blocked by colliders when the world exposes them; on sight → '!' + alert sting,
// the player is held, the trainer walks up, says BEFORE, battle; beaten trainers say AFTER forever.
// Story bosses (Eclissi) reuse fight() with their own defs.
import { classLook, lookFor, STORY_LOOKS, tintLook } from './looks.js';
import { dist2, wrap, TOWN_NAMES } from './util.js';

const BEFORE = {
  Escursionista: ['Ho camminato tutto il giorno per trovare un avversario degno. Eccoti!', 'Gli scarponi sono pronti, e i miei Velmon anche!'],
  'Ragazza Pic-nic': ['Stavo per aprire il cestino del pranzo... ma prima una lotta!', 'I miei Velmon hanno mangiato bene: sono carichissimi!'],
  Pescatore: ['Non abboccava niente... ma tu sì! Lottiamo!', 'Pazienza e riflessi: ecco il segreto di un pescatore.'],
  Studente: ['Ho studiato tutte le tabelle dei tipi. Mettimi alla prova!', 'La teoria è chiara. Ora passiamo alla pratica!'],
  Ciclista: ['Frena! Prima di passare devi battermi!', 'Vado veloce in bici e ancora di più in lotta!'],
  Ranger: ['Proteggo questo sentiero. Vediamo se sei un allenatore rispettoso... e forte.', 'La natura premia chi si allena sul serio.'],
  Montanara: ['Quassù l\'aria è sottile, ma i miei Velmon no!', 'Chi sale fin qui deve avere fegato. Vediamo il tuo!'],
  Velista: ['Il vento è a favore: si lotta!', 'In mare aperto ho visto tempeste. Una lotta non mi spaventa!'],
  Surfista: ['Bella onda, amico! Ma prima cavalca questa lotta!', 'Tavola pronta, Velmon pronti. Andiamo!'],
  Esploratrice: ['Ho esplorato ogni anfratto di questa zona. Tu sei la scoperta di oggi!', 'Una mappa, una torcia e i miei Velmon: non mi serve altro.'],
};
const AFTER = {
  Escursionista: ['Accidenti, che passo che hai! Torno a camminare.', 'Mi servirà un altro giro del sentiero per riprendermi.'],
  'Ragazza Pic-nic': ['Uffa! Ora mi consolo con un panino.', 'Bella lotta! Vuoi una fragola? No? Peccato.'],
  Pescatore: ['Mi è scappato anche questo... Vabbè.', 'Sei come il pesce grosso: impossibile da prendere.'],
  Studente: ['Non era sul libro! Devo ripassare.', 'Interessante... prendo appunti sulla tua strategia.'],
  Ciclista: ['Hai bucato le mie ruote! In senso figurato, eh.', 'Troppo veloce per me, oggi.'],
  Ranger: ['Rispetto. Tieni d\'occhio questi sentieri, allenatore.', 'Ottima intesa con i tuoi Velmon. Si vede.'],
  Montanara: ['Brrr... mi hai lasciata di ghiaccio!', 'Scendi con calma: il sentiero è scivoloso.'],
  Velista: ['Vento contrario... ammaino le vele.', 'Mi hai lasciato in bonaccia!'],
  Surfista: ['Wipeout totale! Grande, amico!', 'Onda troppo grande per me. Rispetto!'],
  Esploratrice: ['Annotato sul diario: "allenatore fortissimo".', 'Torno a esplorare. Tu continua così!'],
};

/** Hand-placed route trainers (two or three per route, at R.trainer1..3). */
const ROUTE_TRAINERS = [
  ['r1', 1, 'Studente', 'm', 'Marco', [['pulcino', 4], ['topolux', 5]]],
  ['r1', 2, 'Ragazza Pic-nic', 'f', 'Giulia', [['farfallina', 5], ['lanuvo', 6]]],
  ['r2', 1, 'Ciclista', 'm', 'Paolo', [['voltino', 10], ['topolux', 9]]],
  ['r2', 2, 'Escursionista', 'm', 'Dario', [['lanuvo', 11], ['pulcino', 11], ['pipistro', 10]]],
  ['r2', 3, 'Studente', 'f', 'Chiara', [['voltino', 12], ['lanuvo', 13]]],
  ['r3', 1, 'Ranger', 'm', 'Tommaso', [['fogliolo', 14], ['scoiattolo', 13]]],
  ['r3', 2, 'Ragazza Pic-nic', 'f', 'Federica', [['grillo', 13], ['fogliolo', 15]]],
  ['r3', 3, 'Pescatore', 'm', 'Nico', [['scoiattolo', 16], ['grillo', 16], ['pipistro', 15]]],
  ['r4', 1, 'Ranger', 'f', 'Silvia', [['ombrale', 18], ['lanuvo', 17]]],
  ['r4', 2, 'Escursionista', 'm', 'Andrea', [['pipistro', 19], ['grillo', 19]]],
  ['r4', 3, 'Studente', 'm', 'Davide', [['ombrale', 20], ['pipistro', 20], ['lanuvo', 21]]],
  ['r5', 1, 'Montanara', 'f', 'Ginevra', [['nevino', 26], ['brinella', 25]]],
  ['r5', 2, 'Escursionista', 'm', 'Ugo', [['roccione', 27], ['nevino', 28]]],
  ['santuario', 1, 'Montanara', 'f', 'Noemi', [['brinella', 31], ['nevino', 32]]],
  ['santuario', 2, 'Ranger', 'm', 'Pietro', [['roccione', 33], ['brinella', 33], ['nevino', 34]]],
  ['r6', 1, 'Velista', 'm', 'Matteo', [['goccino', 21], ['granchio', 22]]],
  ['r6', 2, 'Surfista', 'f', 'Martina', [['goccino', 24], ['pulcino', 23]]],
  ['r6', 3, 'Pescatore', 'm', 'Fabio', [['granchio', 25], ['goccino', 25], ['farfallina', 24]]],
  ['r7', 1, 'Surfista', 'm', 'Leo', [['fiammello', 34], ['goccino', 33]]],
  ['r7', 2, 'Esploratrice', 'f', 'Camilla', [['fiammello', 37], ['scoiattolo', 36]]],
  ['r7', 3, 'Escursionista', 'm', 'Riccardo', [['granchio', 38], ['voltino', 38], ['fiammello', 39]]],
  ['r8', 1, 'Esploratrice', 'f', 'Beatrice', [['sabbiolo', 30], ['roccione', 29]]],
  ['r8', 2, 'Ciclista', 'm', 'Simone', [['voltino', 32], ['sabbiolo', 33]]],
  ['r8', 3, 'Ranger', 'f', 'Anna', [['roccione', 34], ['fiammello', 34], ['sabbiolo', 35]]],
];

/** One champion per town at its landmark (2 Velmon in Alba, 3 elsewhere; area max level + 2). */
const CHAMPIONS = [
  ['alba', 'Sergio', 'm', [['topolux', 6], ['pulcino', 7]], '#e8674a'],
  ['petalo', 'Flora', 'f', [['farfallina', 11], ['fogliolo', 11], ['lanuvo', 12]], '#ff5f9e'],
  ['fulgida', 'Max', 'm', [['voltino', 15], ['topolux', 16], ['pipistro', 15]], '#5b7fe0'],
  ['muschio', 'Selva', 'f', [['fogliolo', 19], ['scoiattolo', 19], ['grillo', 20]], '#3f9e3a'],
  ['fosco', 'Corvino', 'm', [['ombrale', 23], ['pipistro', 23], ['lanuvo', 24]], '#6b4a8a'],
  ['cristallo', 'Bora', 'f', [['nevino', 34], ['brinella', 35], ['roccione', 36]], '#7fd0ff'],
  ['corallo', 'Nettuno', 'm', [['goccino', 27], ['granchio', 27], ['farfallina', 28]], '#2bb7c9'],
  ['sole', 'Lava', 'f', [['fiammello', 41], ['goccino', 41], ['voltino', 42]], '#ff7a2a'],
  ['ramata', 'Duna', 'm', [['sabbiolo', 37], ['roccione', 37], ['fiammello', 38]], '#c45a2a'],
];

const top = team => Math.max(...team.map(([, l]) => l));

export const TRAINERS = [
  ...ROUTE_TRAINERS.map(([area, n, cls, sex, name, team], i) => ({
    id: `${area}.t${n}`, area, poi: `${area}.trainer${n}`, cls, sex, name: `${cls} ${name}`,
    look: classLook(cls, sex), team, reward: 40 * top(team), sight: 13,
    before: [BEFORE[cls][i % 2]], after: [AFTER[cls][i % 2]],
  })),
  ...CHAMPIONS.map(([town, name, sex, team, color]) => ({
    id: `champion.${town}`, area: town, poi: `${town}.champion`, cls: 'Campione', sex, champion: true, town,
    name: `${sex === 'f' ? 'Campionessa' : 'Campione'} ${name}`,
    look: tintLook(classLook('Campione', sex), { bottom: color }), team, reward: 120 * top(team), sight: 0,
    before: [`Sono ${sex === 'f' ? 'la Campionessa' : 'il Campione'} di ${TOWN_NAMES[town]}. Qui nessuno mi ha mai battuto!`, 'Fammi vedere che legame hai con i tuoi Velmon!'],
    after: [`Incredibile... Da oggi ${TOWN_NAMES[town]} ha un nuovo Campione: tu!`, 'Torna a trovarmi quando vuoi. Ti aspetto per la rivincita!'],
    afterBeaten: ['Il titolo è tuo, ma la rivincita prima o poi me la prendo!'],
  })),
];

export function createTrainers(ctx) {
  const K = () => ctx.story.kit;
  const st = () => ((ctx.save.state.story ||= {}).beaten ||= {});
  const byId = new Map(TRAINERS.map(t => [t.id, t]));
  const look0 = new Map();            // id → {base facing, next turn time}
  let busyFight = false, acc = 0;

  function teamOf(t) {
    const raw = typeof t.team === 'function' ? t.team(ctx) : t.team;
    return raw.map(([sp, lv]) => K().monster(K().formFor(sp, lv), lv));
  }

  /** Line-of-sight between two points (clear when the world exposes no collider query). */
  function clearLine(a, b) {
    const cols = ctx.world?.colliders;
    if (typeof cols?.segmentBlocked === 'function') { try { return !cols.segmentBlocked(a.x, a.z, b.x, b.z); } catch { return true; } }
    const blocked = typeof cols?.blocked === 'function' ? (x, z) => cols.blocked(x, z, 0.05) : null;
    if (!blocked) return true;
    const d = dist2(a, b), n = Math.floor(d / 1.2);
    for (let i = 1; i < n; i++) { const k = i / n; if (blocked(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k)) return false; }
    return true;
  }

  /** Walk an NPC up to the player (1.4 m in front of them), with a timeout so nothing can get stuck. */
  async function walkUp(npc) {
    const pp = K().playerPos(); if (!npc || !pp) return;
    const o = npc.object.position, d = dist2(o, pp);
    if (d < 1.8) return;
    const k = (d - 1.4) / d;
    const to = { x: o.x + (pp.x - o.x) * k, z: o.z + (pp.z - o.z) * k };
    const go = npc.goTo ? npc.goTo(to, { run: false }) : npc.human?.moveTo?.(to, { run: false });
    await Promise.race([go || Promise.resolve(), K().wait(Math.min(7, d / 1.6 + 1.5))]);
  }

  function faceEach(npc) {
    const pp = K().playerPos();
    if (!npc || !pp) return;
    try { npc.faceTo?.(ctx.player?.object || pp); } catch { /* optional */ }
    try { ctx.player?.human?.face?.({ x: npc.object.position.x, z: npc.object.position.z }); } catch { /* optional */ }
  }

  /**
   * Run a full trainer encounter for a def (route trainer, champion or story boss).
   * opts: {spotted, kind, music, canRun, onWin(ctx), onLose(ctx), quiet}
   * Resolves with 'win' | 'lose' | 'run' | 'refused'.
   */
  async function fight(t, npc, opts = {}) {
    if (busyFight) return 'refused';
    if (!K().hasAlive()) {
      await K().say(t.name, ['La tua squadra è esausta! Prima passa da un Centro Cura.'], { actor: npc });
      return 'refused';
    }
    busyFight = true;
    const kind = opts.kind || (t.champion ? 'champion' : t.boss ? 'boss' : 'trainer');
    let result = 'run';
    try {
      if (opts.spotted) {
        await K().busy('cutscene', async () => {
          ctx.bus.emit('trainer:spotted', { id: t.id });
          try { npc?.setMarker?.('!'); } catch { /* optional */ }
          K().sfx('alert'); K().haptic?.([20, 40, 20]);
          try { npc?.human?.setExpression?.('surprised'); ctx.player?.human?.setExpression?.('surprised'); } catch { /* optional */ }
          faceEach(npc);
          await K().wait(0.7);
          try { npc?.setMarker?.(null); } catch { /* optional */ }
          await walkUp(npc);
          faceEach(npc);
        });
      } else faceEach(npc);
      await K().say(t.name, t.before, { actor: npc, gesture: t.champion ? 'point' : 'talk_gesture', expression: t.boss ? 'smug' : 'grin' });
      await ctx.story.dialogue.release();
      const foes = teamOf(t);
      if (!ctx.battle?.start) { console.warn('[story] battle area missing: fight skipped'); return 'run'; }
      result = await ctx.battle.start({
        kind, foes, trainer: { id: t.id, name: t.name, npc: npc || undefined, look: t.look },
        canRun: false, canCatch: false, music: opts.music || (kind === 'champion' ? 'battle_champion' : kind === 'boss' ? 'eclissi' : 'battle_trainer'),
      }) || 'run';
      await K().afterBattle();
      if (result === 'win') {
        tr.markBeaten(t.id);
        const reward = typeof t.reward === 'function' ? t.reward(ctx) : t.reward;
        if (reward) { ctx.story.economy.earn(reward, 'trainer:' + t.id); K().toast(`Hai ricevuto ${reward} monete!`, { icon: '💰' }); }
        if (t.champion) {
          ctx.flags.set('champion_' + t.town, true);
          K().banner(`Nuovo Campione di ${TOWN_NAMES[t.town]}!`, `Hai battuto ${t.name}`);
          K().jingle('quest');
        }
        if (!opts.quiet) await K().say(t.name, t.after, { actor: npc, gesture: t.champion ? 'cheer' : 'defeat', expression: t.boss ? 'angry' : 'laugh' });
        await opts.onWin?.(ctx, npc);
      } else if (result === 'lose') await opts.onLose?.(ctx, npc);
    } catch (e) { console.error('[story] fight failed', t.id, e); }
    finally {
      busyFight = false;
      if (npc && t.poi && !t.boss) ctx.story.npcs.home(npc.id);
    }
    return result;
  }

  const tr = {
    list: TRAINERS,
    get: id => byId.get(id) || null,
    beaten: id => !!st()[id],
    markBeaten(id) { if (st()[id]) return; st()[id] = true; ctx.save.commit(); ctx.bus.emit('trainer:beaten', { id }); },
    /** Number of beaten route trainers (side quest "Re della strada"). */
    routeBeaten: () => TRAINERS.filter(t => !t.champion && st()[t.id]).length,
    challenge(id) {
      const t = byId.get(id);
      if (!t) return Promise.resolve('refused');
      return fight(t, ctx.story.npcs.get(t.id), { spotted: false });
    },
    fight,
    teamOf,
    get fighting() { return busyFight; },
  };

  // ---- NPC definitions
  for (const t of TRAINERS) {
    ctx.story.npcs.define({
      id: t.id, name: t.name, look: t.look, at: t.poi, kind: t.champion ? 'champion' : 'trainer', wander: null,
      label: () => (tr.beaten(t.id) ? 'Parla' : 'Sfida'), icon: t.champion ? '🏆' : '⚔️',
      marker: () => (t.champion && !tr.beaten(t.id) ? '★' : null),
      talk: async (c, npc) => {
        if (tr.beaten(t.id)) { faceEach(npc); await K().say(t.name, t.afterBeaten || t.after, { actor: npc, expression: 'smile', gesture: 'wave' }); return; }
        if (t.champion) {
          faceEach(npc);
          const i = await K().choose(`${t.name}: "Vuoi sfidarmi per il titolo?"`, [{ label: 'Sì, ti sfido!', icon: '🏆' }, { label: 'Non ancora', icon: '✋' }], { actor: npc });
          if (i !== 0) { await K().say(t.name, ['Allenati bene. Il titolo non scappa.'], { actor: npc }); return; }
        }
        await fight(t, npc, { spotted: false });
      },
    });
  }

  // ---- sight: looking around, spotting the player
  ctx.loop.add(function storyTrainerSight(dt) {
    acc += dt;
    if (acc < 0.1) return;
    const step = acc; acc = 0;
    const pp = K().playerPos();
    if (!pp || busyFight || ctx.busy.is() || ctx.world?.interior) return;
    const free = K().hasAlive() && !(ctx.story.crime?.wanted > 0) && !ctx.player?.vehicle && ctx.flags.has('menu_unlocked');
    for (const t of TRAINERS) {
      if (t.champion || !t.sight) continue;
      const npc = ctx.story.npcs.get(t.id);
      if (!npc?.object) continue;
      const o = npc.object.position, d = dist2(o, pp);
      if (d > 30) continue;
      // idle look-around (smooth turns handled by actors' face())
      let lk = look0.get(t.id);
      if (!lk) { lk = { base: npc.object.rotation.y, next: K().now + 2 + Math.random() * 4, side: 1 }; look0.set(t.id, lk); }
      if (K().now > lk.next && !tr.beaten(t.id)) {
        lk.side = -lk.side; lk.next = K().now + 3 + Math.random() * 4;
        try { npc.human?.face?.(lk.base + lk.side * (0.35 + Math.random() * 0.35), { dur: 0.9 }); } catch { /* optional */ }
      }
      if (!free || tr.beaten(t.id) || d > t.sight) continue;
      const fy = npc.object.rotation.y;
      const ang = Math.abs(wrap(Math.atan2(pp.x - o.x, pp.z - o.z) - fy));
      if ((ang < 0.61 || d < 2.2) && clearLine(o, pp)) { fight(t, npc, { spotted: true }); break; }
    }
    void step;
  }, ctx.ORDER.systems);

  return tr;
}

export { lookFor, STORY_LOOKS };
