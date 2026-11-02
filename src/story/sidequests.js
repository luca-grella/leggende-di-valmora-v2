// Side quests (docs/GDD.md "Side quests"): ported from v1 — Il Topolux di Nonna Rosa (briciola), Pane caldo
// (pane), Re della strada (strada), Cacciatore di tesori (tesori), Collezionista (collezione) — plus new
// small ones per town: Il cappello di Lia (cappello, Villa Petalo), Posta per Castelfosco (lettera, Città
// Fulgida → Castelfosco), Scatti rari (foto, Borgo Muschio). Givers carry a '!' marker while they have
// something for you; the counting quests start by themselves the first time you do the thing they count.
import * as THREE from 'three';
import { lookFor, STORY_LOOKS } from './looks.js';
import { buildHat, buildBurst, buildBall } from './props.js';
import { dist2 } from './util.js';

const ROSA = 'Nonna Rosa', BRUNO = 'Fornaio Bruno', ADA = 'Fornaia Ada', LIA = 'Lia', GINO = 'Postino Gino', PINA = 'Nonna Pina', IRENE = 'Irene la fotografa';
const RARE = ['ombrale', 'brinella', 'granchio'];

export const SIDEQUESTS = [
  {
    id: 'briciola', title: 'Il Topolux di Nonna Rosa', giver: 'side.rosa',
    steps: [
      { text: 'Trova Briciola, il Topolux di Nonna Rosa, fuori Borgo Alba', at: 'r1.briciola' },
      { text: 'Riporta Briciola da Nonna Rosa', at: 'alba.rosa' },
    ],
    reward: { coins: 400, items: { pozione: 2 } },
  },
  {
    id: 'pane', title: 'Pane caldo', giver: 'side.bruno',
    steps: [{ text: 'Porta la pagnotta alla Fornaia Ada a Borgo Muschio', at: 'muschio.ada' }],
    reward: { coins: 600, items: { pozione: 1 } },
  },
  {
    id: 'strada', title: 'Re della strada',
    steps: [{ get text() { return `Sconfiggi 6 allenatori lungo i percorsi (${Math.min(6, countRoute())}/6)`; }, done: c => c.story.trainers.routeBeaten() >= 6 }],
    reward: { coins: 1500 },
  },
  {
    id: 'tesori', title: 'Cacciatore di tesori',
    steps: [{ get text() { return `Apri 5 forzieri nascosti (${Math.min(5, countChests())}/5)`; }, done: c => c.story.chests.count() >= 5 }],
    reward: { items: { ravviva: 2 } },
  },
  {
    id: 'collezione', title: 'Collezionista',
    steps: [{ get text() { return `Cattura 10 specie diverse di Velmon (${Math.min(10, countCaught())}/10)`; }, done: c => c.story.kit.caughtCount() >= 10 }],
    reward: { coins: 2000, items: { sfera: 10 } },
  },
  {
    id: 'cappello', title: 'Il cappello di Lia', giver: 'side.lia',
    steps: [
      { text: 'Cerca il cappello di paglia di Lia, volato verso il Sentiero dei Fiori', at: () => hatSpot() },
      { text: 'Riporta il cappello a Lia, a Villa Petalo', at: 'petalo.npc1' },
    ],
    reward: { coins: 300, items: { sfera: 3 } },
  },
  {
    id: 'lettera', title: 'Posta per Castelfosco', giver: 'side.gino',
    steps: [{ text: 'Consegna la lettera a Nonna Pina, a Castelfosco', at: 'fosco.npc1' }],
    reward: { coins: 800, items: { megasfera: 2 } },
  },
  {
    id: 'foto', title: 'Scatti rari', giver: 'side.irene',
    steps: [{ get text() { return `Registra nel Velmondex Ombrale, Brinella e Granchietto (${countRare()}/3)`; }, done: c => RARE.every(sp => c.story.kit.hasSeen(sp)) }],
    reward: { coins: 1500, items: { megasfera: 2, superpozione: 1 } },
  },
];

// live counters for the dynamic step texts (bound in wireSideQuests)
let CTX = null;
const countRoute = () => CTX?.story?.trainers?.routeBeaten?.() ?? 0;
const countChests = () => CTX?.story?.chests?.count?.() ?? 0;
const countCaught = () => CTX?.story?.kit?.caughtCount?.() ?? 0;
const countRare = () => RARE.filter(sp => CTX?.story?.kit?.hasSeen?.(sp)).length;
const hatSpot = () => {
  const p = CTX?.story?.kit?.poi?.('r1.rest');
  return p ? { x: p.x + 1.6, z: p.z + 0.8 } : null;
};

export function wireSideQuests(ctx) {
  CTX = ctx;
  const S = ctx.story, K = S.kit, Q = S.quests, R = S.npcs;
  for (const d of SIDEQUESTS) Q.register(d);
  const step = id => Q.stepOf(id);
  const is = (id, n) => Q.stepOf(id) === n;
  const done = id => Q.stepOf(id) === 'done';
  const say = (who, lines, o) => K.say(who, lines, o);
  const look = name => lookFor(ctx, name, STORY_LOOKS[name]);
  const ready = () => ctx.flags.has('menu_unlocked');           // side quests open after the prologue

  // ------------------------------------------------------------------ Nonna Rosa + Briciola
  R.define({
    id: 'side.rosa', name: ROSA, look: look('rosa'), at: 'alba.rosa', kind: 'side', wander: { radius: 1.2, pause: [5, 10] },
    marker: () => (ready() && (step('briciola') == null || (is('briciola', 1) && bric.following)) ? '!' : null),
    talk: async (c, npc) => {
      const q = step('briciola');
      if (q == null) {
        if (!ready()) { await say(ROSA, ['Che bella giornata! Il mio Topolux, Briciola, adora correre nei prati.'], { actor: npc, expression: 'smile' }); return; }
        await say(ROSA, [
          { t: 'Oh, caro... il mio Topolux, Briciola, è scappato di nuovo!', e: 'sad', g: 'shake_head' },
          { t: 'L\'ho visto correre fuori dal paese, verso il Sentiero dei Fiori. Me lo riporteresti?', e: 'sad', g: 'point' },
          { t: 'Ti preparo una torta... e qualche moneta.', e: 'smile', g: 'nod' },
        ], { actor: npc });
        Q.start('briciola');
        return;
      }
      if (q === 1 && bric.following) {
        await say(ROSA, [{ t: 'Briciola! Eccoti, birbante!', e: 'laugh', g: 'cheer' }], { actor: npc });
        await briciolaHome(npc);
        await say(ROSA, [{ t: 'Grazie, tesoro. Tieni, te lo sei meritato.', e: 'smile', g: 'nod' }], { actor: npc });
        Q.complete('briciola');
        return;
      }
      await say(ROSA, [done('briciola') ? 'Briciola non è più scappato, grazie a te. Vero, Briciola?' : 'Hai trovato Briciola? È là fuori da qualche parte, sul Sentiero dei Fiori...'], { actor: npc, expression: done('briciola') ? 'smile' : 'sad' });
    },
  });

  /** Briciola: a little Topolux that wanders on Percorso 1, follows you once found, then lives with Rosa. */
  const bric = { obj: null, m: null, following: false, vel: new THREE.Vector3(), wanderT: 0, goal: null, anim: '' };
  function briciolaWanted() {
    if (K.playerIsland() !== 'aurora') return null;
    const q = step('briciola');
    if (q === 0) return 'route';
    if (q === 1) return 'follow';
    if (q === 'done') return 'home';
    return null;
  }
  function briciolaAnim(name) { if (bric.anim === name) return; bric.anim = name; try { bric.m?.play?.(name, { loop: true }); } catch { /* optional */ } }
  function syncBriciola() {
    const want = briciolaWanted();
    if (!want) { if (bric.obj) { S.fx.remove(bric.obj); try { bric.m?.dispose?.(); } catch { /* optional */ } bric.obj = null; bric.m = null; } bric.following = false; return; }
    if (!bric.obj) {
      bric.m = K.velmon('topolux', { scale: 0.85 });
      bric.obj = bric.m?.object || buildBall(ctx, 'sfera');
      bric.anim = '';
      bric.obj.userData.update = updateBriciola;
      S.fx.add(bric.obj);
      place(want);
    }
    bric.following = want === 'follow';
    if (want === 'home' && bric.mode !== 'home') place('home');
    bric.mode = want;
  }
  function place(mode) {
    const id = mode === 'route' ? 'r1.briciola' : 'alba.rosa';
    const p = K.poi(id);
    let x = p?.x ?? 0, z = p?.z ?? 0;
    if (mode === 'follow') { const pp = K.playerPos(); if (pp) { x = pp.x - 1; z = pp.z - 1; } }
    if (mode === 'home') { x += 1.2; z += 0.6; }
    bric.obj.position.set(x, K.groundY(x, z), z);
    bric.home = { x, z };
    bric.goal = null;
  }
  function updateBriciola(dt) {
    const o = bric.obj; if (!o) return;
    let target = null, speed = 2.2;
    if (bric.following) {
      const pp = K.playerPos(); if (!pp) return;
      const f = ctx.player?.facing ?? 0;
      target = { x: pp.x - Math.sin(f) * 1.1 + Math.cos(f) * 0.5, z: pp.z - Math.cos(f) * 1.1 - Math.sin(f) * 0.5 };
      const d = dist2(o.position, pp);
      speed = d > 4 ? 6.5 : 3.2;
      if (d > 25) { o.position.set(target.x, K.groundY(target.x, target.z), target.z); }
    } else {
      bric.wanderT -= dt;
      if (bric.wanderT <= 0 || !bric.goal) {
        bric.wanderT = 2.5 + Math.random() * 3;
        const r = bric.mode === 'route' ? 3.5 : 1.4, a = Math.random() * Math.PI * 2;
        bric.goal = Math.random() < 0.35 ? null : { x: bric.home.x + Math.cos(a) * r, z: bric.home.z + Math.sin(a) * r };
      }
      target = bric.goal;
      speed = bric.mode === 'route' ? 2.6 : 1.4;
    }
    let moving = false;
    if (target) {
      const dx = target.x - o.position.x, dz = target.z - o.position.z, d = Math.hypot(dx, dz);
      if (d > 0.25) {
        const want = new THREE.Vector3(dx / d, 0, dz / d).multiplyScalar(Math.min(speed, d * 3));
        bric.vel.lerp(want, Math.min(1, dt * 6));
        moving = true;
      }
    }
    if (!moving) bric.vel.multiplyScalar(Math.max(0, 1 - dt * 8));
    const v = bric.vel.length();
    if (v > 0.05) {
      o.position.x += bric.vel.x * dt; o.position.z += bric.vel.z * dt;
      const yaw = Math.atan2(bric.vel.x, bric.vel.z), dy = Math.atan2(Math.sin(yaw - o.rotation.y), Math.cos(yaw - o.rotation.y));
      o.rotation.y += dy * Math.min(1, dt * 10);
    }
    o.position.y = K.groundY(o.position.x, o.position.z) + (bric.m ? 0 : 0.1);
    briciolaAnim(v > 0.3 ? 'walk' : 'idle');
  }
  async function briciolaHome(npc) {
    if (!bric.obj) return;
    bric.following = false; bric.mode = 'home';
    const p = K.poi('alba.rosa');
    if (p) { bric.home = { x: p.x + 1.2, z: p.z + 0.6 }; bric.goal = bric.home; bric.wanderT = 3; }
    try { bric.m?.play?.('happy', { loop: false }); bric.anim = ''; } catch { /* optional */ }
    K.sfx('heart');
    if (bric.obj) S.fx.add(buildBurst(ctx, '#ff8fb8', { count: 10, speed: 1.8, life: 0.7 }), { x: bric.obj.position.x, y: bric.obj.position.y + 0.6, z: bric.obj.position.z });
    try { npc?.human?.play?.('kneel', { loop: false })?.then?.(() => npc?.human?.play?.('idle')); } catch { /* optional */ }
    await K.wait(1.2);
  }
  ctx.interact.register({
    id: 'story.briciola', pos: () => (bric.obj && is('briciola', 0) ? bric.obj.position : null), radius: 1.5, label: 'Prendi Briciola', icon: '🐭', priority: 2,
    enabled: () => !!bric.obj && is('briciola', 0),
    run: async () => {
      bric.goal = null; bric.vel.set(0, 0, 0);
      try { bric.m?.play?.('happy', { loop: false }); bric.anim = ''; } catch { /* optional */ }
      K.sfx('heart');
      S.fx.add(buildBurst(ctx, '#ff8fb8', { count: 10, speed: 1.8, life: 0.7 }), { x: bric.obj.position.x, y: bric.obj.position.y + 0.6, z: bric.obj.position.z });
      try { ctx.player?.human?.face?.({ x: bric.obj.position.x, z: bric.obj.position.z }); ctx.player?.human?.play?.('kneel', { loop: false })?.then?.(() => ctx.player?.human?.play?.('idle')); } catch { /* optional */ }
      await K.narrate(['Briciola squittisce felice e ti salta in braccio!', 'Ora ti segue ovunque. Riportalo da Nonna Rosa a Borgo Alba.']);
      Q.advance('briciola');
      syncBriciola();
    },
  });
  for (const e of ['game:start', 'quest:start', 'quest:step', 'quest:complete', 'area:enter']) ctx.bus.on(e, () => syncBriciola());

  // ------------------------------------------------------------------ Pane caldo
  R.define({
    id: 'side.bruno', name: BRUNO, look: look('fornaio'), at: 'alba.fornaio', kind: 'side', wander: null,
    marker: () => (ready() && step('pane') == null ? '!' : null),
    talk: async (c, npc) => {
      const q = step('pane');
      if (q == null && ready()) {
        await say(BRUNO, [
          { t: 'Ehi, giovane! Senti che profumo? Pane appena sfornato!', e: 'grin', g: 'wave' },
          { t: 'Mi porti questa pagnotta a mia sorella Ada, a Borgo Muschio? Lei ti pagherà bene.', e: 'smile', g: 'talk_gesture' },
          { t: 'Borgo Muschio è sull\'Isola di Giada: oltre Città Fulgida, attraversando il Ponte di Giada.', e: 'neutral', g: 'point' },
        ], { actor: npc });
        S.bag.add('pagnotta', 1);
        K.toast('Hai ricevuto una Pagnotta calda 🥖', { icon: '🥖' });
        Q.start('pane');
        return;
      }
      const line = done('pane') ? 'Ada mi ha scritto: il pane è arrivato ancora caldo! Sei un fulmine.'
        : q != null ? 'Borgo Muschio è a nord-est, sull\'Isola di Giada. Corri, che il pane si raffredda!'
          : 'Il pane migliore di Borgo Alba! Assaggia, assaggia.';
      await say(BRUNO, [line], { actor: npc, expression: 'smile', gesture: 'nod' });
    },
  });
  R.define({
    id: 'side.ada', name: ADA, look: look('ada'), at: 'muschio.ada', kind: 'side', wander: null,
    marker: () => (is('pane', 0) ? '!' : null),
    talk: async (c, npc) => {
      if (is('pane', 0)) {
        S.bag.remove('pagnotta', 1);
        await say(ADA, [
          { t: 'Il pane di mio fratello! Ha ancora quel profumo...', e: 'surprised', g: 'surprised' },
          { t: 'Ecco a te, e grazie mille! Salutami Bruno.', e: 'smile', g: 'nod' },
        ], { actor: npc });
        Q.complete('pane');
        return;
      }
      await say(ADA, ['Benvenuto a Borgo Muschio! Il pane migliore della selva è qui.'], { actor: npc, expression: 'smile', gesture: 'wave' });
    },
  });

  // ------------------------------------------------------------------ counting quests start by themselves
  ctx.bus.on('trainer:beaten', ({ id } = {}) => { if (/^(r\d|santuario)\.t\d$/.test(id || '') && step('strada') == null) Q.start('strada', { track: false }); });
  ctx.bus.on('chest:open', () => { if (step('tesori') == null) Q.start('tesori', { track: false }); });
  ctx.bus.on('velmon:caught', () => { if (step('collezione') == null && ready()) Q.start('collezione', { track: false }); });

  // ------------------------------------------------------------------ Il cappello di Lia
  R.define({
    id: 'side.lia', name: LIA, look: look('lia'), at: 'petalo.npc1', kind: 'side', wander: { radius: 2, pause: [2, 5] },
    marker: () => (ready() && (step('cappello') == null || is('cappello', 1)) ? '!' : null),
    talk: async (c, npc) => {
      const q = step('cappello');
      if (q == null && ready()) {
        await say(LIA, [
          { t: 'Uffa! Una folata di vento si è portata via il mio cappello di paglia!', e: 'sad', g: 'shake_head' },
          { t: 'È volato verso il Sentiero dei Fiori... Me lo riprendi? Per favore per favore per favore!', e: 'sad', g: 'point' },
        ], { actor: npc });
        Q.start('cappello');
        return;
      }
      if (q === 1) {
        S.bag.remove('cappello', 1);
        await say(LIA, [
          { t: 'Il mio cappello! Sei il migliore!', e: 'laugh', g: 'cheer' },
          { t: 'Tieni, sono le Sfere che ho trovato in spiaggia. A me servono solo per giocare a palla.', e: 'grin', g: 'nod' },
        ], { actor: npc });
        Q.complete('cappello');
        syncHat();
        return;
      }
      await say(LIA, [done('cappello') ? 'Guarda come mi sta bene il cappello! Il vento non me lo ruba più.' : q === 0 ? 'Il mio cappello è volato verso il Sentiero dei Fiori, vicino al posto dove ci si riposa.' : 'Ciao! Ti piace Villa Petalo? Ci sono più fiori che persone!'], { actor: npc, expression: 'smile', gesture: 'wave' });
    },
  });
  let hat = null;
  function syncHat() {
    const want = is('cappello', 0) && K.playerIsland() === 'aurora';
    if (want && !hat) {
      const p = hatSpot(); if (!p) return;
      hat = buildHat(ctx);
      const y = K.groundY(p.x, p.z);
      hat.userData.update = (dt, t) => { hat.rotation.y = Math.sin(t * 0.7) * 0.4; hat.position.y = y + 0.02 + Math.max(0, Math.sin(t * 2.3)) * 0.06; hat.rotation.z = Math.sin(t * 2.3) * 0.08; };
      S.fx.add(hat, { x: p.x, y, z: p.z });
    } else if (!want && hat) { S.fx.remove(hat); hat = null; }
  }
  ctx.interact.register({
    id: 'story.hat', pos: () => (hat ? hat.position : null), radius: 1.4, label: 'Raccogli il cappello', icon: '👒', priority: 2,
    enabled: () => !!hat && is('cappello', 0),
    run: async () => {
      try { ctx.player?.human?.play?.('pickup', { loop: false })?.then?.(() => ctx.player?.human?.play?.('idle')); } catch { /* optional */ }
      K.sfx('pickup');
      S.fx.add(buildBurst(ctx, '#ffe27a', { count: 8, speed: 1.6, life: 0.5 }), { x: hat.position.x, y: hat.position.y + 0.3, z: hat.position.z });
      S.bag.add('cappello', 1);
      Q.advance('cappello');
      syncHat();
      await K.narrate(['Hai trovato il cappello di paglia di Lia! 👒']);
    },
  });
  for (const e of ['game:start', 'quest:start', 'quest:step', 'quest:complete', 'area:enter']) ctx.bus.on(e, () => syncHat());

  // ------------------------------------------------------------------ Posta per Castelfosco
  R.define({
    id: 'side.gino', name: GINO, look: look('gino'), at: 'fulgida.npc1', kind: 'side', wander: { radius: 3, pause: [2, 5] },
    marker: () => (ready() && step('lettera') == null ? '!' : null),
    talk: async (c, npc) => {
      const q = step('lettera');
      if (q == null && ready()) {
        await say(GINO, [
          { t: 'Accidenti, accidenti! Ho consegnato tutta la posta... tranne questa!', e: 'surprised', g: 'surprised' },
          { t: 'È per Nonna Pina, a Castelfosco, sull\'Isola della Nebbia. Io lì non ci vado: la nebbia mi fa perdere!', e: 'sad', g: 'shake_head' },
          { t: 'Me la porti tu? Ti lascio la mia mancia. Promesso!', e: 'grin', g: 'talk_gesture' },
        ], { actor: npc });
        S.bag.add('lettera_gino', 1);
        K.toast('Hai ricevuto la Lettera per Nonna Pina 💌', { icon: '💌' });
        Q.start('lettera');
        return;
      }
      await say(GINO, [done('lettera') ? 'Nonna Pina mi ha mandato i biscotti per ringraziarti! Ne ho mangiati solo... tutti.' : q != null ? 'Castelfosco è a nord, oltre la Brughiera. Segui le pietre!' : 'Posta, posta! Gino non si ferma mai!'], { actor: npc, expression: 'smile', gesture: 'wave' });
    },
  });
  R.define({
    id: 'side.pina', name: PINA, look: look('pina'), at: 'fosco.npc1', kind: 'side', wander: null,
    marker: () => (is('lettera', 0) ? '!' : null),
    talk: async (c, npc) => {
      if (is('lettera', 0)) {
        S.bag.remove('lettera_gino', 1);
        await say(PINA, [
          { t: 'Una lettera per me? Fammi mettere gli occhiali...', e: 'surprised', g: 'think' },
          { t: 'È di mio nipote, dal Porto Corallo! Dice che sta bene e che ha catturato un Granchietto.', e: 'laugh', g: 'laugh' },
          { t: 'Grazie, caro. Prendi questo: io con le Megasfere non saprei proprio cosa farci.', e: 'smile', g: 'nod' },
        ], { actor: npc });
        Q.complete('lettera');
        return;
      }
      await say(PINA, ['La nebbia di Castelfosco è come una coperta: d\'inverno ci tiene al caldo.'], { actor: npc, expression: 'smile' });
    },
  });

  // ------------------------------------------------------------------ Scatti rari
  R.define({
    id: 'side.irene', name: IRENE, look: look('irene'), at: 'muschio.npc1', kind: 'side', wander: { radius: 2.5, pause: [3, 6] },
    marker: () => (ready() && (step('foto') == null) ? '!' : null),
    talk: async (c, npc) => {
      const q = step('foto');
      if (q == null && ready()) {
        await say(IRENE, [
          { t: 'Shh! Stavo aspettando che un Fogliolo si mettesse in posa...', e: 'shy', g: 'think' },
          { t: 'Preparo un libro sui Velmon più timidi dell\'arcipelago: Ombrale, Brinella e Granchietto.', e: 'smile', g: 'talk_gesture' },
          { t: 'Se li registri nel tuo Velmondex, mi mandi i dati? Ti ricompenso bene!', e: 'grin', g: 'nod' },
          { t: 'Gli Ombrale escono di notte sulla Brughiera, le Brinella vivono sull\'Isola Gelida e i Granchietto nelle Lagune Coralline.', e: 'neutral', g: 'point' },
        ], { actor: npc });
        Q.start('foto', { track: false });
        return;
      }
      if (done('foto')) { await say(IRENE, ['Il libro va in stampa il mese prossimo. Ci sarà il tuo nome nei ringraziamenti!'], { actor: npc, expression: 'laugh', gesture: 'cheer' }); return; }
      await say(IRENE, [`Per ora ne hai registrati ${countRare()} su 3. Non mollare!`], { actor: npc, expression: 'smile', gesture: 'nod' });
    },
  });

  return { SIDEQUESTS, briciola: bric };
}
