// Prologue + chapters 1-3 (ported from v1 src/story/quests.js, docs/GDD.md "Story").
// Quest defs live in CHAPTERS; wireChapters(ctx) registers them, defines the story cast (Mamma, Prof.ssa
// Quercia, Dott. Ginepro, Guardiana Neve, the Eclissi), the scripted scenes (wake-up, starter choice in the lab,
// first wild battle, letter, camp, depot, sanctuary, Aurorante, dawn ending) and the zone triggers that start
// them when you walk in. Every scene uses the dialog close-up camera, actor gestures and eased camera shots.
import * as THREE from 'three';
import { lookFor, STORY_LOOKS } from './looks.js';
import { buildCamp, buildAura, buildBurst, buildBall } from './props.js';
import { dist2 } from './util.js';

const QUERCIA = 'Prof.ssa Quercia', GINEPRO = 'Dott. Ginepro', NEVE = 'Guardiana Neve', MAMMA = 'Mamma';
const GRUNT = 'Recluta dell\'Eclissi', NOTTE = 'Comandante Notte', GM = 'Gran Maestro dell\'Eclissi';

const STARTER_INFO = {
  germoglio: { type: 'Erba', icon: '🌱', line: 'Germoglio, di tipo Erba. Calmo e testardo: cresce forte come una quercia.' },
  tizzone: { type: 'Fuoco', icon: '🔥', line: 'Tizzone, di tipo Fuoco. Ha un caratterino focoso, ma è affettuosissimo.' },
  ondina: { type: 'Acqua', icon: '💧', line: 'Ondina, di tipo Acqua. Giocherellona e curiosa: adora fare gli spruzzi.' },
};
const STARTERS = ['germoglio', 'tizzone', 'ondina'];

const beaten = (c, id) => !!c.save.state.story?.beaten?.[id];
const caught = (c, sp) => c.story.kit.hasCaught(sp);

/** Quest definitions (docs/ARCHITECTURE.md "Quest def"). */
export const CHAPTERS = [
  {
    id: 'prologo', title: 'Prologo · Benvenuto a Valmora', main: true, doneTitle: 'Prologo completato!',
    steps: [
      { text: 'Parla con la mamma', at: 'home.player.owner' },
      { text: 'Raggiungi il laboratorio della Prof.ssa Quercia', at: 'lab.alba.owner' },
      { text: 'Metti alla prova il tuo Velmon nell\'erba alta del Percorso 1', at: 'r1.start' },
      { text: 'Torna dalla Prof.ssa Quercia, davanti al laboratorio', at: 'alba.quercia' },
    ],
    reward: { items: { sfera: 5 } },
  },
  {
    id: 'main1', title: 'Capitolo 1 · L\'ombra dell\'Eclissi', main: true,
    steps: [
      { text: 'Sconfiggi il Campione di Borgo Alba (vicino al pozzo)', at: 'alba.champion', done: c => beaten(c, 'champion.alba') },
      { text: 'Parla con la Prof.ssa Quercia', at: 'alba.quercia' },
      { text: 'Porta la lettera al Dott. Ginepro a Villa Petalo', at: 'petalo.ginepro' },
      { text: 'Sconfiggi le due reclute dell\'Eclissi all\'accampamento sul Percorso 1', at: 'r1.camp', done: c => beaten(c, 'eclissi.camp1') && beaten(c, 'eclissi.camp2') },
      { text: 'Torna dal Dott. Ginepro', at: 'petalo.ginepro' },
    ],
    reward: { coins: 1500, items: { superpozione: 2 } },
  },
  {
    id: 'main2', title: 'Capitolo 2 · Il magazzino dell\'Eclissi', main: true,
    steps: [
      { text: 'Chiedi informazioni a Er Faina, nei vicoli di Città Fulgida', at: 'fulgida.alley' },
      { text: 'Sconfiggi le due reclute davanti al magazzino dell\'Eclissi', at: 'fulgida.depot', done: c => beaten(c, 'eclissi.depot1') && beaten(c, 'eclissi.depot2') },
      { text: 'Sconfiggi il Comandante Notte', at: 'fulgida.depot_boss', done: c => beaten(c, 'eclissi.notte') },
      { text: 'Racconta tutto alla Prof.ssa Quercia a Borgo Alba', at: 'alba.quercia' },
    ],
    reward: { coins: 3000, items: { ravviva: 2, superpozione: 2 } },
  },
  {
    id: 'main3', title: 'Capitolo 3 · Il santuario dell\'alba', main: true,
    steps: [
      { text: 'Vai a Borgo Cristallo e parla con la Guardiana Neve', at: 'cristallo.neve' },
      { text: 'Sali al santuario di Aurorante, in cima ai monti', at: 'santuario.altar' },
      { text: 'Sconfiggi il Gran Maestro dell\'Eclissi', at: 'santuario.boss', done: c => beaten(c, 'eclissi.granmaestro') },
      { text: 'Affronta Aurorante e prova a catturarlo', at: 'santuario.legend', done: c => caught(c, 'aurorante') },
    ],
    reward: { coins: 5000, items: { ravviva: 3 } },
  },
];

/** Generic zone triggers: run once each time the player walks into a radius while `when()` holds. */
export function createZones(ctx) {
  const K = ctx.story.kit;
  const list = [];
  let acc = 0;
  ctx.loop.add(function storyZones(dt) {
    acc += dt; if (acc < 0.2) return; acc = 0;
    const pp = K.playerPos(); if (!pp) return;
    const free = !ctx.busy.is() && !ctx.battle?.active;
    for (const z of list) {
      if (z.running) continue;
      const p = K.poi(z.at); if (!p) continue;
      const d = dist2(pp, p);
      if (d > z.r * 1.4 + 2) { z.armed = true; continue; }
      if (!free || !z.armed || d > z.r) continue;
      let ok = false;
      try { ok = !!z.when(ctx); } catch (e) { console.warn('[story] zone', z.id, e); }
      if (!ok) continue;
      z.armed = false; z.running = true;
      Promise.resolve().then(() => z.run(ctx)).catch(e => console.error('[story] zone run', z.id, e)).finally(() => { z.running = false; });
      break;
    }
  }, ctx.ORDER.systems);
  return { add(z) { list.push({ armed: true, r: 6, when: () => true, ...z }); }, list };
}

export function wireChapters(ctx) {
  const S = ctx.story, K = S.kit, Q = S.quests, R = S.npcs;
  const zones = S.zones = createZones(ctx);
  for (const d of CHAPTERS) Q.register(d);

  const step = id => Q.stepOf(id);
  const is = (id, n) => Q.stepOf(id) === n;
  const done = id => Q.stepOf(id) === 'done';
  const active = id => Q.isActive(id);
  const say = (who, lines, o) => K.say(who, lines, o);
  const look = name => lookFor(ctx, name, STORY_LOOKS[name]);
  const lvl = (min, max, bonus = 0) => Math.max(min, Math.min(max, K.topLevel() + bonus));
  const flags = ctx.flags;

  // ------------------------------------------------------------------ helpers
  function giveStarterMon(id) {
    let mon = null;
    try { mon = ctx.creatures?.giveStarter?.(id) || null; } catch (e) { console.warn('[story] giveStarter', e); }
    if (!mon) {
      mon = K.monster(id, 5);
      const c = (ctx.save.state.creatures ||= { party: [], box: [], seen: {}, caught: {}, starter: null });
      (c.party ||= []).push(mon);
      ctx.bus.emit('team:change', {});
    }
    const c = (ctx.save.state.creatures ||= {});
    c.starter = id;
    for (const s of STARTERS) { try { ctx.creatures?.dex?.markSeen?.(s); } catch { /* optional */ } (c.seen ||= {})[s] ||= true; }
    try { ctx.creatures?.dex?.markCaught?.(id); } catch { /* optional */ }
    (c.caught ||= {})[id] ||= true;
    ctx.save.commit();
    syncEncounters();
    return mon;
  }

  /** No wild encounters before you own a Velmon (the creatures area owns the switch; we only close it). */
  function syncEncounters() {
    const enc = ctx.creatures?.encounters;
    if (!enc || !('enabled' in enc)) return;
    const has = K.party().length > 0;
    if (!has) { enc.enabled = false; enc._storyClosed = true; }
    else if (enc._storyClosed) { enc.enabled = true; enc._storyClosed = false; }
  }

  async function playerFace(p) { try { await ctx.player?.human?.face?.({ x: p.x, z: p.z }); } catch { /* optional */ } }
  function teleportPlayer(x, z, facing) {
    try { if (ctx.player?.teleport) ctx.player.teleport(x, z, facing); else ctx.cameraRig?.followed?.position.set(x, K.groundY(x, z), z); } catch (e) { console.warn('[story] teleport', e); }
    try { ctx.cameraRig?.snap?.(); } catch { /* optional */ }
  }

  /** A defeated Eclissi member runs off, then leaves the roster for good (flag fled.<id>). */
  async function flee(id, npc) {
    const pp = K.playerPos();
    const o = npc?.object?.position;
    if (o && pp) {
      const dx = o.x - pp.x, dz = o.z - pp.z, l = Math.hypot(dx, dz) || 1;
      try { npc.human?.setExpression?.('surprised'); } catch { /* optional */ }
      const to = { x: o.x + (dx / l) * 16, z: o.z + (dz / l) * 16 };
      try { (npc.goTo ? npc.goTo(to, { run: true }) : npc.human?.moveTo?.(to, { run: true }))?.catch?.(() => {}); } catch { /* optional */ }
      await K.wait(2.2);
    }
    flags.set('fled.' + id, true);
  }

  /** Eclissi bosses: trainer-like defs fought through story.trainers.fight (kind 'boss'). */
  const BOSSES = {
    'eclissi.camp1': {
      name: GRUNT, look: 'eclissi_grunt', at: 'r1.camp_grunt1', reward: () => 40 * lvl(6, 18),
      team: () => [['pipistro', lvl(6, 18)], ['topolux', lvl(6, 18)]],
      before: ['Ehi tu! Un ficcanaso!', 'L\'Eclissi non perdona chi mette il becco nei suoi affari!'],
      after: ['Ahia... il capo non sarà contento.'],
    },
    'eclissi.camp2': {
      name: GRUNT, look: 'eclissi_grunt_f', at: 'r1.camp_grunt2', reward: () => 40 * lvl(7, 18),
      team: () => [['ombrale', lvl(6, 18)], ['sabbiolo', lvl(6, 18)], ['voltino', lvl(7, 18)]],
      before: ['Hai battuto il mio collega? Fortuna del principiante.', 'Con me la fortuna non basta!'],
      after: ['Non finisce qui! Il capo ve la farà pagare!'],
    },
    'eclissi.depot1': {
      name: GRUNT, look: 'eclissi_grunt', at: 'fulgida.depot_grunt1', reward: () => 40 * lvl(18, 40),
      team: () => [['vampistro', lvl(18, 40)], ['ratolux', lvl(18, 40)]],
      before: ['Circolare! Questo magazzino è... ehm... chiuso per inventario.', 'Ah, sei quello di Villa Petalo? Allora niente chiacchiere!'],
      after: ['Il Comandante mi farà pulire i Vampistro per un mese...'],
    },
    'eclissi.depot2': {
      name: GRUNT, look: 'eclissi_grunt_f', at: 'fulgida.depot_grunt2', reward: () => 40 * lvl(18, 40),
      team: () => [['tenebrale', lvl(18, 40)], ['desertauro', lvl(18, 40)]],
      before: ['Nessuno entra nel magazzino dell\'Eclissi senza permesso!'],
      after: ['Va bene, va bene! Il Comandante è lì dentro. Arrangiati!'],
    },
    'eclissi.notte': {
      name: NOTTE, look: 'notte', at: 'fulgida.depot_boss', reward: 2500,
      team: () => [['vampistro', lvl(18, 42, 2)], ['tenebrale', lvl(18, 42, 2)], ['fulminax', lvl(18, 42, 2)]],
      before: ['Così sei tu quello che ha sgominato l\'avamposto di Villa Petalo.', 'Il Gran Maestro mi ha parlato di te. Vediamo se valevi tutto questo disturbo.'],
      after: ['Impossibile... battuta da un ragazzino.', 'Goditi la vittoria. Il Gran Maestro ha già quello che cercava: la mappa per il santuario di Aurorante, sui monti dell\'Isola Gelida.', 'Quando il Velmon leggendario sarà nostro, nessuno potrà fermare l\'Eclissi!'],
    },
    'eclissi.granmaestro': {
      name: GM, look: 'granmaestro', at: 'santuario.boss', reward: 5000,
      team: () => [['tenebrale', lvl(30, 55, 3)], ['vulcanide', lvl(30, 55, 3)], ['abissale', lvl(30, 55, 3)], ['colossasso', lvl(30, 55, 3)]],
      before: ['Ma prima ti toglierò di mezzo. Personalmente.'],
      after: ['No... non è possibile.', 'Prendilo pure, se ci riesci. Aurorante non si piega a nessuno.'],
    },
  };
  const bossDef = id => ({ id, boss: true, sight: 0, ...BOSSES[id], look: look(BOSSES[id].look) });

  async function fightBoss(id, npc, opts = {}) {
    const def = bossDef(id);
    const r = await S.trainers.fight(def, npc, { kind: 'boss', music: 'eclissi', ...opts });
    if (r === 'win') { Q.check(); flee(id, npc); }
    return r;
  }

  // ------------------------------------------------------------------ cast
  R.define({
    id: 'story.mamma', name: MAMMA, look: look('mamma'), at: 'home.player.owner', kind: 'story', wander: null,
    marker: () => (is('prologo', 0) ? '!' : null),
    talk: async (c, npc) => {
      if (is('prologo', 0)) { await mumIntro(npc); return; }
      const tired = K.party().some(m => (m.hp ?? 1) < K.maxHp(m));
      if (tired) {
        await say(MAMMA, ['Tesoro! I tuoi Velmon hanno l\'aria stanca.', 'Riposatevi un attimo qui a casa, vi preparo qualcosa di buono.'], { actor: npc, expression: 'smile', gesture: 'talk_gesture' });
        await S.dialogue.release();
        await ctx.fade.through(async () => { try { ctx.creatures?.team?.healAll?.(); } catch { /* optional */ } K.jingle('heal'); await K.wait(0.8); }, { ms: 500, color: '#fff2d8' });
        await say(MAMMA, ['Ecco fatto! Tutti in forma. Ora fila, il mondo ti aspetta!'], { actor: npc, expression: 'smile', gesture: 'wave' });
        return;
      }
      const lines = done('main3')
        ? ['Ho visto Aurorante volare sopra il paese stamattina... e ho pensato subito a te!', 'Sono tanto fiera di te, sai?']
        : active('main2') || active('main3')
          ? ['Ho sentito parlare dell\'Eclissi al telegiornale. Stai attento, eh!', 'E mangia qualcosa ogni tanto!']
          : ['Ti ricordi di quando avevi paura dei Topolux? Ora guardati!', 'Torna quando vuoi: per te e i tuoi Velmon qui c\'è sempre un letto.'];
      await say(MAMMA, lines, { actor: npc, expression: 'smile', gesture: 'talk_gesture' });
    },
  });

  R.define({
    id: 'story.quercia_lab', name: QUERCIA, look: look('quercia'), at: 'lab.alba.owner', kind: 'story', wander: null,
    present: () => !flags.has('starter_chosen'),
    marker: () => (is('prologo', 1) ? '!' : null),
    talk: async (c, npc) => {
      if (is('prologo', 1)) { await starterScene(npc); return; }
      await say(QUERCIA, ['Ciao! Sono un po\' presa con le ricerche... Passa dopo!'], { actor: npc, expression: 'smile', gesture: 'wave' });
    },
  });

  R.define({
    id: 'story.quercia', name: QUERCIA, look: look('quercia'), at: 'alba.quercia', kind: 'story', wander: null,
    present: () => flags.has('starter_chosen'),
    marker: () => (is('prologo', 3) || is('main1', 1) || is('main2', 3) ? '!' : null),
    talk: async (c, npc) => {
      if (is('prologo', 3)) return quercaGifts(npc);
      if (is('prologo', 2)) { await say(QUERCIA, ['Il Percorso 1 è appena fuori dal paese, verso ovest. Prova a camminare nell\'erba alta!'], { actor: npc, gesture: 'point' }); return; }
      if (is('main1', 0)) { await say(QUERCIA, ['Il Campione di Borgo Alba è lì vicino al pozzo.', 'Battilo e torna da me: ho un incarico importante per te.'], { actor: npc, gesture: 'point', expression: 'smile' }); return; }
      if (is('main1', 1)) return quercaLetter(npc);
      if (is('main2', 3)) return quercaAurorante(npc);
      const lines = active('main1') ? ['Villa Petalo è a ovest, in fondo al Sentiero dei Fiori. Il Dott. Ginepro ti aspetta.']
        : active('main2') ? ['Città Fulgida è a est, lungo la Via dei Mulini.', 'Stai attento: se l\'Eclissi ha un covo in città, non sarà sguarnito.']
          : active('main3') ? ['Borgo Cristallo è sull\'Isola Gelida, a nord-ovest. Ci arrivi dal Passo Gelido.', 'Copriti bene... e porta Superpozioni!']
            : [`Il tuo Velmondex segna ${K.seenCount()} specie viste e ${K.caughtCount()} catturate.`, done('main3') ? 'Grazie a te Valmora vede ancora l\'alba. Continua a esplorare!' : 'Continua così: ogni Velmon ha qualcosa da insegnarci.'];
      await say(QUERCIA, lines, { actor: npc, expression: 'smile', gesture: 'talk_gesture' });
    },
  });

  R.define({
    id: 'story.ginepro', name: GINEPRO, look: look('ginepro'), at: 'petalo.ginepro', kind: 'story', wander: { radius: 1.5, pause: [4, 9] },
    marker: () => (is('main1', 2) || is('main1', 4) ? '!' : null),
    talk: async (c, npc) => {
      if (is('main1', 2)) {
        S.bag.remove('lettera', 1);
        await say(GINEPRO, [
          { t: 'Una lettera di Quercia? Vediamo...', e: 'surprised', g: 'think' },
          { t: 'Proprio come temevo. L\'Eclissi ha piantato un accampamento qui vicino, sul Sentiero dei Fiori: rubano Velmon dalle fattorie.', e: 'sad', g: 'shake_head' },
          { t: 'Io sono troppo vecchio per le lotte. Vai tu e cacciali via! L\'accampamento è segnato sulla tua mappa.', e: 'neutral', g: 'point' },
        ], { actor: npc });
        Q.advance('main1');
        return;
      }
      if (is('main1', 3)) { await say(GINEPRO, ['L\'accampamento è sulle colline del Sentiero dei Fiori, tra Villa Petalo e Borgo Alba.', 'Fai attenzione, ragazzo.'], { actor: npc, gesture: 'point' }); return; }
      if (is('main1', 4)) {
        await say(GINEPRO, [
          { t: 'Li hai messi in fuga! I Velmon delle fattorie sono liberi.', e: 'laugh', g: 'cheer' },
          { t: 'Ma questo era solo un avamposto. Dalle loro carte, il covo dell\'Eclissi è a Città Fulgida, sotto il naso di tutti...', e: 'neutral', g: 'think' },
          { t: 'Prendi questo per il disturbo. Il viaggio vero comincia adesso.', e: 'smile', g: 'nod' },
        ], { actor: npc });
        Q.complete('main1');
        return;
      }
      await say(GINEPRO, [done('main1') ? 'Le fattorie sono tranquille, grazie a te. I Lanuvo hanno ripreso a dormire nei prati.' : 'La costa di Villa Petalo è bellissima in primavera. Peccato per tutti questi furti...'], { actor: npc, expression: 'smile' });
    },
  });

  R.define({
    id: 'story.neve', name: NEVE, look: look('neve'), at: 'cristallo.neve', kind: 'story', wander: null,
    marker: () => (is('main3', 0) ? '!' : null),
    talk: async (c, npc) => {
      if (is('main3', 0)) {
        await say(NEVE, [
          { t: 'Tu devi essere quello di cui parla la Professoressa. Ti aspettavo.', e: 'smile', g: 'nod' },
          { t: 'Il santuario di Aurorante è lassù, dove la neve non si scioglie mai. Da giorni vedo luci viola salire il sentiero.', e: 'neutral', g: 'point' },
          { t: 'L\'Eclissi è già in cammino. Sbrigati... e copriti bene.', e: 'sad' },
        ], { actor: npc });
        Q.advance('main3');
        return;
      }
      await say(NEVE, [done('main3') ? 'L\'alba è tornata a essere libera. Grazie, allenatore.' : 'Il santuario è in cima ai monti. Segui il sentiero oltre il paese.'], { actor: npc, expression: done('main3') ? 'smile' : 'neutral' });
    },
  });

  // Eclissi members
  const bossPresent = {
    'eclissi.camp1': () => step('main1') >= 3,
    'eclissi.camp2': () => step('main1') >= 3,
    'eclissi.depot1': () => active('main2'),
    'eclissi.depot2': () => active('main2'),
    'eclissi.notte': () => active('main2'),
    'eclissi.granmaestro': () => active('main3') && step('main3') >= 1,
  };
  for (const id of Object.keys(BOSSES)) {
    const b = BOSSES[id];
    R.define({
      id, name: b.name, look: look(b.look), at: b.at, kind: 'eclissi', wander: null, label: 'Parla', icon: '⚔️',
      present: () => !flags.has('fled.' + id) && !!bossPresent[id](),
      talk: (c, npc) => talkBoss(id, npc),
    });
  }

  async function talkBoss(id, npc) {
    if (beaten(ctx, id)) { await say(BOSSES[id].name, BOSSES[id].after.slice(-1), { actor: npc, expression: 'angry' }); return; }
    if (id.startsWith('eclissi.depot') && is('main2', 0)) { await say(GRUNT, ['Circolare, non c\'è niente da vedere qui.'], { actor: npc, expression: 'smug', gesture: 'shake_head' }); return; }
    if (id === 'eclissi.notte' && !(beaten(ctx, 'eclissi.depot1') && beaten(ctx, 'eclissi.depot2'))) {
      await say(NOTTE, [is('main2', 0) ? 'Hai sbagliato strada, moscerino.' : 'Prima passa sulle mie reclute, moscerino.'], { actor: npc, expression: 'smug', gesture: 'shake_head' });
      return;
    }
    if (id === 'eclissi.granmaestro' && is('main3', 1)) { await gmArrival(npc); return; }
    await fightBoss(id, npc);
  }

  // Er Faina knows where the Eclissi hides (chapter 2)
  S.hooks.fixer.push(async (fixer, npc) => {
    if (fixer.id !== 'fixer.faina' || !is('main2', 0)) return false;
    await say(fixer.name, [
      { t: 'L\'Eclissi? Gente che paga bene e fa troppe domande.', e: 'smug', g: 'think' },
      { t: 'Hanno un magazzino a sud della città, con le bandiere viola. Io non ti ho detto niente, eh.', e: 'neutral', g: 'point' },
      { t: 'E se ci vai, porta una squadra forte. Il loro comandante è una tosta.', e: 'smug', g: 'nod' },
    ], { actor: npc });
    Q.advance('main2');
    return true;
  });
  S.hooks.fixerMarker = f => (f.id === 'fixer.faina' && is('main2', 0) ? '!' : null);

  // ------------------------------------------------------------------ scenes
  async function intro() {
    if (flags.has('intro_seen')) return;
    flags.set('intro_seen', true);
    await K.busy('cutscene', async () => {
      await ctx.fade.out(10, '#000');
      const bed = K.poi('home.player.bed');
      if (ctx.world?.enterInterior && !(ctx.world.interior === 'home.player')) {
        const off = ctx.bus.on('interior:enter', ({ id } = {}) => {
          if (id !== 'home.player' || !bed) return;
          const f = bed.facing || 0;
          teleportPlayer(bed.x + Math.cos(f) * 1.1, bed.z - Math.sin(f) * 1.1, f + Math.PI / 2);
        });
        try { await ctx.world.enterInterior('home.player'); } catch (e) { console.warn('[story] intro enterInterior', e); }
        off?.();
      } else if (bed) teleportPlayer(bed.x + 1.1, bed.z, Math.PI / 2);
      try { ctx.player?.human?.setExpression?.('sleepy'); } catch { /* optional */ }
      await K.wait(0.3);
      await ctx.fade.in(1400);              // no-op when enterInterior already faded back in
    });
    try { ctx.player?.human?.play?.('idle_stretch', { loop: false })?.then?.(() => ctx.player?.human?.play?.('idle')); } catch { /* optional */ }
    try { ctx.cameraRig?.closeUp?.('portrait', { target: ctx.player?.object, side: 1 }, { dur: 1.2 }); } catch { /* optional */ }
    await K.narrate(['Ti svegli nella tua cameretta a Borgo Alba. Dalla finestra entra il profumo del mare.', 'Oggi è un giorno speciale... ma non ricordi bene perché.']);
    try { ctx.player?.human?.setExpression?.('neutral'); } catch { /* optional */ }
    const mum = R.get('story.mamma');
    if (mum) {
      const pp = K.playerPos();
      if (pp) {
        const o = mum.object.position, d = dist2(o, pp);
        if (d > 1.8) {
          const k = (d - 1.3) / d;
          try { await Promise.race([mum.goTo?.({ x: o.x + (pp.x - o.x) * k, z: o.z + (pp.z - o.z) * k }) || Promise.resolve(), K.wait(4)]); } catch { /* optional */ }
        }
      }
    }
    await mumIntro(mum);
    restoreCamera();
  }

  /** Back to the explore camera when a scene ends without an open dialogue shot. */
  function restoreCamera() {
    K.wait(0.35).then(() => {
      if (S.dialogue.active || ctx.busy.has('battle') || ctx.busy.has('scene')) return;
      const mode = ctx.cameraRig?.mode;
      if (mode && mode !== 'explore' && mode !== 'release') ctx.cameraRig.release?.({ dur: 0.8 });
    });
  }

  async function mumIntro(npc) {
    await say(MAMMA, [
      { t: 'Buongiorno, dormiglione! Finalmente sei sveglio.', e: 'smile', g: 'wave' },
      { t: 'La Prof.ssa Quercia è passata stamattina: ti aspetta al suo laboratorio, qui in paese.', e: 'smile', g: 'point' },
      { t: 'Ha detto che oggi avrai il tuo primo Velmon! Sei emozionato?', e: 'grin', g: 'talk_gesture' },
      { t: 'Su, vai! E torna a trovarmi ogni tanto: se i tuoi Velmon sono stanchi, qui c\'è sempre un letto.', e: 'smile', g: 'nod' },
    ], { actor: npc });
    if (is('prologo', 0)) Q.advance('prologo');
  }

  /** The lab: Quercia throws three Sfere, the starters pop out on the floor, you pick one with close-ups. */
  async function starterScene(npc) {
    if (S._starterBusy) return;
    S._starterBusy = true;
    const hold = S.dialogue.hold();
    const models = [];
    try {
      await say(QUERCIA, [
        { t: 'Eccoti finalmente! Benvenuto nel mio laboratorio.', e: 'smile', g: 'wave' },
        { t: 'Io studio i Velmon, le creature che vivono in tutto l\'arcipelago di Valmora.', e: 'smile', g: 'talk_gesture' },
        { t: 'E oggi uno di loro diventerà il tuo compagno di viaggio. Guarda qui!', e: 'grin', g: 'point' },
      ], { actor: npc });

      const T = K.poi('lab.alba.table') || K.poi('lab.alba.owner') || { ...(K.playerPos() || { x: 0, z: 0 }), facing: 0 };
      const f = T.facing || 0, fx = Math.sin(f), fz = Math.cos(f), sx = Math.cos(f), sz = -Math.sin(f);
      const y0 = K.groundY(T.x, T.z);
      // player steps back to watch, Quercia moves aside
      await K.busy('cutscene', async () => {
        const pp = { x: T.x - fx * 1.2, z: T.z - fz * 1.2 };
        try { await Promise.race([ctx.player?.human?.moveTo?.(pp) || Promise.resolve(), K.wait(2.5)]); } catch { /* optional */ }
        if (!ctx.player?.human?.moveTo) teleportPlayer(pp.x, pp.z, f);
        await playerFace({ x: T.x + fx * 3, z: T.z + fz * 3 });
        const qp = { x: T.x + fx * 0.9 + sx * 1.9, z: T.z + fz * 0.9 + sz * 1.9 };
        try { npc?.goTo?.(qp)?.catch?.(() => {}); } catch { /* optional */ }
        await K.shot({ x: T.x - fx * 3.4, y: y0 + 2.1, z: T.z - fz * 3.4 }, { x: T.x + fx * 0.5, y: y0 + 0.5, z: T.z + fz * 0.5 }, { fov: 40, dur: 1.1 });
        try { npc?.human?.play?.('throw_ball', { loop: false })?.then?.(() => npc?.human?.play?.('idle')); } catch { /* optional */ }
        K.sfx('ball_throw');
        await K.wait(0.35);
        // three balls pop open → the starters appear with a bounce
        for (let i = 0; i < 3; i++) {
          const x = T.x + fx * 0.6 + sx * (i - 1) * 0.95, z = T.z + fz * 0.6 + sz * (i - 1) * 0.95, y = K.groundY(x, z);
          const ball = S.fx.add(buildBall(ctx, 'sfera'), { x, y: y + 0.9, z });
          ball.scale.setScalar(1.4);
          await K.tween(0.28, k => { ball.position.y = y + 0.9 * (1 - k) + Math.sin(k * Math.PI) * 0.4; ball.rotation.x = k * 6; });
          K.sfx('ball_burst');
          S.fx.add(buildBurst(ctx, ['#7ac74c', '#ee8130', '#6390f0'][i], { count: 12, speed: 2.2, life: 0.6 }), { x, y: y + 0.3, z });
          S.fx.remove(ball);
          const m = K.velmon(STARTERS[i]);
          const obj = m?.object || buildBall(ctx, 'sfera');
          obj.position.set(x, y, z); obj.rotation.y = f + Math.PI; obj.scale.setScalar(0.01);
          ctx.scene.add(obj);
          models.push({ id: STARTERS[i], m, obj, x, y, z });
          try { m?.play?.('appear', { loop: false })?.then?.(() => m.play?.('idle')); } catch { /* optional */ }
          K.tween(0.45, k => obj.scale.setScalar(Math.max(0.01, k)), t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2));
          await K.wait(0.18);
        }
        await K.wait(0.5);
      });
      await say(QUERCIA, [{ t: 'Germoglio, Tizzone e Ondina! Tre Velmon rarissimi, cresciuti qui al laboratorio.', e: 'grin', g: 'talk_gesture' }, 'Avvicinati e guardali bene. Scegli con il cuore!'], { actor: npc, camera: 'none' });

      let chosen = null;
      while (!chosen) {
        await K.shot({ x: T.x - fx * 3.4, y: y0 + 2.1, z: T.z - fz * 3.4 }, { x: T.x + fx * 0.5, y: y0 + 0.5, z: T.z + fz * 0.5 }, { fov: 40, dur: 0.7 });
        const i = await S.dialogue.required('Quale Velmon scegli?', STARTERS.map(id => ({ icon: STARTER_INFO[id].icon, label: K.speciesName(id), sub: `Tipo ${STARTER_INFO[id].type}` })));
        const s = models[i];
        await K.shot({ x: s.x - fx * 1.9, y: s.y + 0.9, z: s.z - fz * 1.9 }, { x: s.x, y: s.y + 0.35, z: s.z }, { fov: 34, dur: 0.75 });
        try { s.m?.play?.('happy', { loop: false })?.then?.(() => s.m?.play?.('idle')); } catch { /* optional */ }
        K.sfx('ui_tap');
        await say(QUERCIA, [STARTER_INFO[s.id].line], { camera: 'none' });
        if (await K.confirm(`Scegli ${K.speciesName(s.id)}?`, { yes: 'Sì, lui!', no: 'Ci penso ancora' })) chosen = s;
      }

      // the others go back in their Sfere, the chosen one hops to you
      await K.busy('cutscene', async () => {
        for (const s of models) {
          if (s === chosen) continue;
          S.fx.add(buildBurst(ctx, '#ffffff', { count: 8, speed: 1.6, life: 0.5 }), { x: s.x, y: s.y + 0.3, z: s.z });
          K.tween(0.35, k => s.obj.scale.setScalar(Math.max(0.01, 1 - k))).then(() => { s.obj.removeFromParent(); try { s.m?.dispose?.(); } catch { /* optional */ } });
        }
        K.jingle('catch');
        try { chosen.m?.play?.('happy', { loop: true }); } catch { /* optional */ }
        try { ctx.player?.human?.setExpression?.('grin'); ctx.player?.human?.play?.('cheer', { loop: false })?.then?.(() => ctx.player?.human?.play?.('idle')); } catch { /* optional */ }
        const pp = K.playerPos() || { x: chosen.x, z: chosen.z };
        const sx0 = chosen.x, sz0 = chosen.z, tx = chosen.x + (pp.x - chosen.x) * 0.55, tz = chosen.z + (pp.z - chosen.z) * 0.55;
        await K.tween(0.8, k => { chosen.obj.position.set(sx0 + (tx - sx0) * k, chosen.y + Math.abs(Math.sin(k * Math.PI * 2)) * 0.35, sz0 + (tz - sz0) * k); });
        await K.wait(0.4);
      });
      const mon = giveStarterMon(chosen.id);
      flags.set('starter_chosen', true);
      K.banner(`Hai ricevuto ${K.speciesName(chosen.id)}!`, 'Il tuo primo Velmon');
      await say(QUERCIA, [
        { t: `Ottima scelta! ${K.speciesName(chosen.id)} sembra già pazzo di te.`, e: 'laugh', g: 'cheer' },
        { t: 'Mettiamolo subito alla prova: sul Percorso 1, appena fuori dal paese, l\'erba alta è piena di Velmon selvatici.', e: 'smile', g: 'point' },
        { t: 'Vai a dare un\'occhiata. Io ti aspetto fuori dal laboratorio!', e: 'smile', g: 'wave' },
      ], { actor: npc });
      await K.busy('cutscene', async () => {
        S.fx.add(buildBurst(ctx, '#ffe27a', { count: 10, speed: 1.8, life: 0.5 }), { x: chosen.obj.position.x, y: chosen.obj.position.y + 0.3, z: chosen.obj.position.z });
        K.sfx('ball_click');
        await K.tween(0.3, k => chosen.obj.scale.setScalar(Math.max(0.01, 1 - k)));
      });
      void mon;
      Q.advance('prologo');
    } catch (e) { console.error('[story] starter scene', e); }
    finally {
      for (const s of models) { s.obj.removeFromParent(); try { s.m?.dispose?.(); } catch { /* optional */ } }
      S._starterBusy = false;
      hold();
      restoreCamera();
      // a safety net: if anything above failed before the gift, still give a starter
      if (!K.party().length) { giveStarterMon('tizzone'); flags.set('starter_chosen', true); if (is('prologo', 1)) Q.advance('prologo'); }
    }
  }

  async function quercaGifts(npc) {
    await say(QUERCIA, [
      { t: 'Allora? Com\'è andata la tua prima lotta?', e: 'smile', g: 'talk_gesture' },
      { t: 'Ah, si vede dalla faccia: è stato fantastico! Tra voi c\'è già una bella intesa.', e: 'laugh', g: 'laugh' },
      { t: 'Tieni: questo è il Velmondex. Registra ogni Velmon che vedi e che catturi.', e: 'smile', g: 'nod' },
      { t: 'E queste sono 5 Sfere. Indebolisci un Velmon selvatico e lanciagliene una per catturarlo!', e: 'grin', g: 'point' },
    ], { actor: npc });
    flags.set('dex_obtained', true);
    flags.set('menu_unlocked', true);
    K.jingle('item');
    K.toast('Hai ricevuto il Velmondex! (☰ → Velmondex)', { icon: '📕', ms: 2600 });
    Q.complete('prologo');
    await say(QUERCIA, [
      { t: 'Ah, un\'ultima cosa. Ogni paese di Valmora ha un Campione, il più forte allenatore del posto.', e: 'neutral', g: 'think' },
      { t: 'Quello di Borgo Alba è lì, vicino al pozzo. Battilo e torna da me: ho un incarico importante per te.', e: 'smile', g: 'point' },
    ], { actor: npc });
    startMain('main1', 'Capitolo 1', 'L\'ombra dell\'Eclissi');
  }

  async function quercaLetter(npc) {
    await say(QUERCIA, [
      { t: 'Hai battuto il Campione! Allora sei pronto.', e: 'laugh', g: 'cheer' },
      { t: 'Negli ultimi giorni molti Velmon sono spariti. Si parla di un gruppo vestito di nero e viola: l\'Eclissi.', e: 'sad', g: 'shake_head' },
      { t: 'Porta questa lettera al mio collega, il Dott. Ginepro, a Villa Petalo, a ovest sulla costa. Lui sa di più.', e: 'neutral', g: 'point' },
    ], { actor: npc });
    S.bag.add('lettera', 1);
    K.jingle('item');
    K.toast('Hai ricevuto la Lettera di Quercia ✉️', { icon: '✉️' });
    Q.advance('main1');
  }

  async function quercaAurorante(npc) {
    await say(QUERCIA, [
      { t: 'Il Comandante Notte in persona? E l\'hai battuta? Incredibile...', e: 'surprised', g: 'surprised' },
      { t: 'Aurorante... il Velmon dell\'alba. Credevo fosse solo una leggenda.', e: 'neutral', g: 'think' },
      { t: 'Se l\'Eclissi riesce a catturarlo, potrà piegare il ciclo del giorno e della notte a suo piacimento.', e: 'sad', g: 'shake_head' },
      { t: 'Dobbiamo arrivare al santuario sull\'Isola Gelida prima di loro. Ti servirà una squadra fortissima.', e: 'neutral', g: 'point' },
      { t: 'La Guardiana Neve, a Borgo Cristallo, conosce il sentiero. Allenati, e preparati al viaggio!', e: 'smile', g: 'nod' },
    ], { actor: npc });
    Q.complete('main2');
  }

  function startMain(id, chapter, name) {
    if (Q.stepOf(id) != null) return;
    K.wait(2.6).then(() => { K.banner(chapter, name); K.jingle('quest'); });
    Q.start(id, { track: true });
  }

  // chapter hand-offs and gate flags
  CHAPTERS.find(d => d.id === 'main1').onComplete = () => {
    flags.set('ch1_done', true);
    K.wait(3.4).then(() => K.toast('Il ponte del Percorso 3 è di nuovo aperto!', { icon: '🌉', ms: 3000 }));
    flags.set('ch2_started', true);
    startMain('main2', 'Capitolo 2', 'Il magazzino dell\'Eclissi');
  };
  CHAPTERS.find(d => d.id === 'main2').onComplete = () => {
    flags.set('ch2_done', true);
    flags.set('ch3_started', true);
    K.wait(3.4).then(() => K.toast('Ora il traghetto Fulgida ↔ Corallo è in servizio.', { icon: '⛴️', ms: 3000 }));
    startMain('main3', 'Capitolo 3', 'Il santuario dell\'alba');
  };
  CHAPTERS.find(d => d.id === 'main3').onComplete = () => {
    flags.set('ch3_done', true);
    ending();
  };
  // ferries to Sole and Ramata open with chapter 2
  ctx.bus.on('quest:start', ({ id } = {}) => { if (id === 'main2') flags.set('ch2_started', true); if (id === 'main3') flags.set('ch3_started', true); });

  // ------------------------------------------------------------------ the camp (chapter 1)
  let camp = null;
  function syncCamp() {
    const want = step('main1') >= 3 && !done('main1') && K.playerIsland() === 'aurora';
    if (want && !camp) {
      const p = K.poi('r1.camp'); if (!p) return;
      camp = buildCamp(ctx);
      camp.rotation.y = p.facing || 0;
      S.fx.add(camp, { x: p.x, y: p.y ?? K.groundY(p.x, p.z), z: p.z });
      try { camp.userData.colliderId = ctx.world?.colliders?.add?.({ x: p.x, z: p.z, r: 0.9 }); } catch { /* optional */ }
    } else if (!want && camp) {
      try { if (camp.userData.colliderId != null) ctx.world?.colliders?.remove?.(camp.userData.colliderId); } catch { /* optional */ }
      S.fx.remove(camp, { dispose: true }); camp = null;
    }
  }
  for (const e of ['game:start', 'quest:step', 'quest:complete', 'quest:start', 'area:enter']) ctx.bus.on(e, () => syncCamp());

  // ------------------------------------------------------------------ Aurorante on the altar (chapter 3)
  let legend = null, legendBusy = false;
  function syncLegend() {
    const want = active('main3') && step('main3') >= 1 && !caught(ctx, 'aurorante') && K.playerIsland() === 'gelida';
    if (want && !legend) {
      const p = K.poi('santuario.legend'); if (!p) return;
      const root = new THREE.Group(); root.name = 'aurorante-altar';
      const m = K.velmon('aurorante', { scale: 1.5 });
      const body = m?.object || buildBall(ctx, 'megasfera');
      const hover = new THREE.Group(); hover.add(body); root.add(hover);
      root.add(buildAura(ctx, '#ffb347'));
      const aura = root.children[1];
      root.rotation.y = p.facing || 0;
      root.userData.update = (dt, t) => {
        hover.position.y = 0.6 + Math.sin(t * 1.3) * 0.18;
        aura.userData.update?.(dt, t);
      };
      S.fx.add(root, { x: p.x, y: p.y ?? K.groundY(p.x, p.z), z: p.z });
      try { m?.play?.('idle', { loop: true }); } catch { /* optional */ }
      legend = { root, m, p };
      ctx.interact.register({
        id: 'story.aurorante', pos: () => (legend ? legend.root.position : null), radius: 3.6, label: 'Avvicinati ad Aurorante', icon: '✨', priority: 3,
        enabled: () => !!legend && legend.root.visible && !legendBusy,
        run: () => faceLegend(),
      });
    } else if (!want && legend) {
      ctx.interact.unregister('story.aurorante');
      S.fx.remove(legend.root); try { legend.m?.dispose?.(); } catch { /* optional */ }
      legend = null;
    }
  }
  for (const e of ['game:start', 'quest:step', 'quest:complete', 'quest:start', 'area:enter', 'velmon:caught']) ctx.bus.on(e, () => syncLegend());

  async function faceLegend() {
    if (legendBusy || !legend) return;
    if (!is('main3', 3)) {
      await K.narrate([beaten(ctx, 'eclissi.granmaestro') ? '...' : 'Aurorante ti osserva dall\'alto, immobile. Prima devi fermare l\'Eclissi.']);
      return;
    }
    if (!K.hasAlive()) { await K.narrate(['La tua squadra è esausta. Aurorante non ti degna di uno sguardo.']); return; }
    legendBusy = true;
    try {
      const { p } = legend;
      await K.busy('cutscene', async () => {
        try { ctx.ui?.letterbox?.(true); } catch { /* optional */ }
        const f = p.facing || 0, y = (p.y ?? K.groundY(p.x, p.z));
        await K.shot({ x: p.x + Math.sin(f) * 4.2 + Math.cos(f) * 1.5, y: y + 1.2, z: p.z + Math.cos(f) * 4.2 - Math.sin(f) * 1.5 }, { x: p.x, y: y + 1.6, z: p.z }, { fov: 38, dur: 1.4 });
        try { legend.m?.play?.('special', { loop: false })?.then?.(() => legend?.m?.play?.('idle')); } catch { /* optional */ }
        K.sfx('heart', { pitch: 0.6 });
        ctx.cameraRig?.shake?.(0.25);
        await K.wait(0.8);
      });
      await K.narrate(['Aurorante spalanca le ali. L\'aria si fa calda come a mezzogiorno.', 'Ti sta mettendo alla prova!']);
      try { ctx.ui?.letterbox?.(false); } catch { /* optional */ }
      legend.root.visible = false;
      const res = ctx.battle?.start
        ? await ctx.battle.start({ kind: 'legendary', foes: [K.monster('aurorante', 45)], canRun: true, canCatch: true, music: 'battle_legend' })
        : 'caught';
      await K.afterBattle();
      Q.check();
      if (res === 'caught' || caught(ctx, 'aurorante')) { syncLegend(); return; }
      if (legend) legend.root.visible = true;
      if (res !== 'lose') {
        try { legend?.m?.play?.('appear', { loop: false })?.then?.(() => legend?.m?.play?.('idle')); } catch { /* optional */ }
        await K.narrate(['Aurorante si rialza e torna sull\'altare. Puoi riprovare quando vuoi.']);
      }
    } finally { legendBusy = false; try { ctx.ui?.letterbox?.(false); } catch { /* optional */ } restoreCamera(); }
  }

  async function gmArrival(npc) {
    if (S._gmScene) return;
    S._gmScene = true;
    try {
      const gm = npc || R.get('eclissi.granmaestro');
      await K.busy('cutscene', async () => {
        const a = K.poi('santuario.altar');
        if (a) {
          const y = a.y ?? K.groundY(a.x, a.z);
          await K.shot({ x: a.x + 9, y: y + 7, z: a.z + 9 }, { x: a.x, y: y + 1.5, z: a.z }, { fov: 42, dur: 1.6 });
          await K.wait(0.8);
        }
      });
      await K.narrate(['Il vento gelido si placa all\'improvviso. Sull\'altare, avvolto da una luce dorata, riposa Aurorante.']);
      await say(GM, [
        { t: 'Quindi sei tu. Il ragazzino che ha umiliato Notte.', e: 'smug', g: 'point' },
        { t: 'Guarda: Aurorante è a un passo. Con lui l\'Eclissi deciderà quando sorge il sole su Valmora.', e: 'grin', g: 'talk_gesture' },
      ], { actor: gm });
      if (is('main3', 1)) Q.advance('main3');
      await fightBoss('eclissi.granmaestro', gm);
    } finally { S._gmScene = false; restoreCamera(); }
  }

  async function ending() {
    await K.afterBattle();
    await K.wait(1.2);
    await K.busy('cutscene', async () => {
      try { ctx.ui?.letterbox?.(true); } catch { /* optional */ }
      await ctx.fade.out(1200, '#fff6e0');
      const a = K.poi('santuario.altar') || { x: -432, z: -636 };
      const y = a.y ?? K.groundY(a.x, a.z);
      const dx = -a.x, dz = -a.z, l = Math.hypot(dx, dz) || 1;
      ctx.time.set(5.4);
      await K.shot({ x: a.x - (dx / l) * 14, y: y + 26, z: a.z - (dz / l) * 14 }, { x: a.x + (dx / l) * 140, y: 0, z: a.z + (dz / l) * 140 }, { fov: 48, dur: 0, ease: 'cut' });
      await ctx.fade.in(1600);
      const h0 = ctx.time.hours;
      const sunrise = K.tween(9, k => ctx.time.set(h0 + k * 1.8), t => t);
      await K.narrate(['Il sole sorge sull\'arcipelago di Valmora.', 'L\'Eclissi è sconfitta, e Aurorante ha scelto di viaggiare con te.', 'Isole lontane, Velmon mai visti e nuove storie ti aspettano...']);
      await sunrise;
      K.banner('Leggende di Valmora', 'Fine del Capitolo 3 · Grazie per aver giocato!');
      K.jingle('victory');
      await K.wait(3.2);
      await ctx.fade.out(900, '#fff6e0');
      try { await ctx.cameraRig?.release?.({ dur: 0 }); } catch { /* optional */ }
      try { ctx.ui?.letterbox?.(false); } catch { /* optional */ }
      await ctx.fade.in(900);
    });
    K.toast('Puoi continuare a esplorare: sfida i Campioni e completa il Velmondex!', { icon: '🌅', ms: 4000 });
  }

  // ------------------------------------------------------------------ zone triggers
  // Lab: entering at prologue step 1 starts the starter scene by itself
  ctx.bus.on('interior:enter', ({ id } = {}) => {
    if (id !== 'lab.alba' || !is('prologo', 1)) return;
    K.wait(0.7).then(() => { if (is('prologo', 1) && !ctx.busy.is()) starterScene(R.get('story.quercia_lab')); });
  });
  // first wild battle on Percorso 1
  zones.add({
    id: 'tutorial', at: 'r1.start', r: 10, when: () => is('prologo', 2) && K.hasAlive(),
    run: async () => {
      const lead = K.party()[0];
      await K.busy('cutscene', async () => {
        const pp = K.playerPos();
        const f = ctx.player?.facing ?? 0;
        const gx = pp.x + Math.sin(f) * 3, gz = pp.z + Math.cos(f) * 3;
        try { ctx.world?.rustle?.(gx, gz); } catch { /* optional */ }
        K.sfx('grass_rustle'); await K.wait(0.6);
        try { ctx.world?.rustle?.(gx, gz); } catch { /* optional */ }
        K.sfx('alert');
        try { ctx.player?.human?.setExpression?.('surprised'); ctx.player?.human?.play?.('surprised', { loop: false })?.then?.(() => ctx.player?.human?.play?.('idle')); } catch { /* optional */ }
        await K.wait(0.7);
      });
      await K.narrate(['Qualcosa si muove nell\'erba alta... Un Velmon selvatico!', lead ? `Forza, ${K.monName(lead)}! Scegli «Lotta» e usa una mossa.` : '']);
      const res = ctx.battle?.start
        ? await ctx.battle.start({ kind: 'wild', foes: [K.monster(Math.random() < 0.5 ? 'pulcino' : 'topolux', 3)], canRun: false, canCatch: false, music: 'battle_wild' })
        : 'win';
      await K.afterBattle();
      if (res === 'lose') return;
      await K.narrate(['Ce l\'hai fatta! I Velmon diventano più forti lottando insieme a te.', 'Torna dalla Prof.ssa Quercia, davanti al laboratorio di Borgo Alba.']);
      if (is('prologo', 2)) Q.advance('prologo');
    },
  });
  // the camp grunts spot you
  zones.add({ id: 'camp1', at: 'r1.camp_grunt1', r: 8, when: () => is('main1', 3) && !beaten(ctx, 'eclissi.camp1') && K.hasAlive(), run: () => fightBoss('eclissi.camp1', R.get('eclissi.camp1'), { spotted: true }) });
  zones.add({ id: 'camp2', at: 'r1.camp_grunt2', r: 8, when: () => is('main1', 3) && beaten(ctx, 'eclissi.camp1') && !beaten(ctx, 'eclissi.camp2') && K.hasAlive(), run: () => fightBoss('eclissi.camp2', R.get('eclissi.camp2'), { spotted: true }) });
  // the depot guards spot you once Er Faina told you about them
  zones.add({ id: 'depot1', at: 'fulgida.depot_grunt1', r: 7, when: () => is('main2', 1) && !beaten(ctx, 'eclissi.depot1') && K.hasAlive(), run: () => fightBoss('eclissi.depot1', R.get('eclissi.depot1'), { spotted: true }) });
  zones.add({ id: 'depot2', at: 'fulgida.depot_grunt2', r: 7, when: () => is('main2', 1) && beaten(ctx, 'eclissi.depot1') && !beaten(ctx, 'eclissi.depot2') && K.hasAlive(), run: () => fightBoss('eclissi.depot2', R.get('eclissi.depot2'), { spotted: true }) });
  zones.add({ id: 'notte', at: 'fulgida.depot_boss', r: 6, when: () => is('main2', 2) && !beaten(ctx, 'eclissi.notte') && K.hasAlive(), run: () => fightBoss('eclissi.notte', R.get('eclissi.notte'), { spotted: true }) });
  // the sanctuary
  zones.add({ id: 'altar', at: 'santuario.altar', r: 15, when: () => is('main3', 1), run: () => gmArrival(R.get('eclissi.granmaestro')) });

  // no tall grass without a Velmon: a friendly voice sends you back
  ctx.bus.on('area:enter', ({ id, kind } = {}) => {
    syncEncounters();
    if (K.party().length || !(kind === 'route' || /^r\d$/.test(id || ''))) return;
    if (S._pushBack) return;
    S._pushBack = true;
    (async () => {
      await K.wait(0.2);
      await K.narrate(['«Ehi, aspetta!» Una voce ti chiama dal paese.', 'Senza un Velmon, l\'erba alta è pericolosa. Prima passa dal laboratorio della Prof.ssa Quercia!']);
      const p = K.poi('alba.plaza');
      if (p) await ctx.fade.through(async () => { teleportPlayer(p.x, p.z + 3, Math.PI); await K.wait(0.2); }, { ms: 400 });
    })().finally(() => { S._pushBack = false; });
  });

  // ------------------------------------------------------------------ start / continue
  function skipPrologue(starter = 'tizzone') {
    if (!K.party().length) giveStarterMon(starter);
    for (const f of ['intro_seen', 'starter_chosen', 'dex_obtained', 'menu_unlocked']) flags.set(f, true);
    if (!done('prologo')) {
      if (Q.stepOf('prologo') == null) Q.start('prologo', { silent: true, track: false });
      Q.complete('prologo');
    }
    if (Q.stepOf('main1') == null) Q.start('main1', { silent: true, track: true });
  }

  ctx.bus.on('game:start', ({ newGame } = {}) => {
    syncEncounters();
    const party = K.party().length;
    if (ctx.params?.has?.('skipintro') && Q.stepOf('prologo') !== 'done') { skipPrologue(); return; }
    // an old save (or a debug team) that already has Velmon but no story progress: skip the prologue silently
    if (Q.stepOf('prologo') == null && party > 0) { skipPrologue(); return; }
    if (Q.stepOf('prologo') == null) {
      Q.start('prologo', { silent: true, track: true });
      if (newGame || !flags.has('intro_seen')) K.wait(0.4).then(() => intro()).catch(e => console.error('[story] intro', e));
    }
    if (done('main1') && !flags.has('ch1_done')) flags.set('ch1_done', true);
    if (done('main2') && !flags.has('ch2_done')) flags.set('ch2_done', true);
  });

  return {
    CHAPTERS,
    skipPrologue,
    starterScene: () => starterScene(R.get('story.quercia_lab')),
    intro,
    ending,
    /** Debug: jump to the start of chapter n (1..3); previous chapters marked done. */
    debugChapter(n = 1) {
      skipPrologue();
      for (let i = 1; i < n; i++) { const id = 'main' + i; if (!done(id)) { if (Q.stepOf(id) == null) Q.start(id, { silent: true, track: false }); Q.complete(id); } }
      const id = 'main' + n;
      if (Q.stepOf(id) == null) Q.start(id, { track: true });
      return Q.objective();
    },
  };
}
