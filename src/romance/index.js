// Romance area (18+, opt-in, default off). Contract: docs/ARCHITECTURE.md "Romance API"; rules: docs/GDD.md "Romance".
//
// The 14 women are Actors NPCs at `<town>.girlN`. With the adult setting off they are ordinary friendly
// villagers (no ❤, no romance lines, quests hidden). With it on, each has a quest `rom_<id>`:
//   stage 0 meet + her request (gift in hand / coins / a battle / beat a champion / catch N species)
//   stage 1 date at her spot at her favourite time (day / sunset / night) → scenes.date
//   stage 2 evening at her home (enter her house, or "Andiamo da te") → scenes.home → the morning after
//   stage 3 together: evenings at her home again, outings (osteria, scooter, bagno, picnic)
// Bond ("intesa") grows with dates, nights and outings; tiers 0/1/2 at 0, 2, 5 change her lines.
import { GIRLS, WHEN, GIFT_TEXT, TOWN_NAMES } from './girls.js';
import { MOODS, BOND_LINES } from './moods.js';
import { OUTINGS } from './outings.js';
import { createScenes } from './scenes.js';
import { createClock, createSafe, pick, fill } from './util.js';

const DEFAULT = () => ({ stage: 0, bond: 0, dates: 0, nights: 0, outings: {}, met: false });
const SPECIES_NAMES = { tizzone: 'Tizzone', voltino: 'Voltino', fulminax: 'Fulminax', ratolux: 'Ratolux', vampistro: 'Vampistro', desertauro: 'Desertauro', leonardente: 'Leonardente' };

/** @param {any} ctx */
export function init(ctx) {
  const clock = createClock(ctx);
  const S = createSafe(ctx);
  const st = () => {
    const s = (ctx.save.state.romance ||= { girls: {} });
    if (!s.girls || typeof s.girls !== 'object') s.girls = {};
    return s;
  };
  const g = id => {
    const all = st().girls;
    const cur = all[id];
    if (!cur || typeof cur !== 'object') return (all[id] = DEFAULT());
    for (const [k, v] of Object.entries(DEFAULT())) if (cur[k] === undefined) cur[k] = v;
    return cur;
  };
  const girls = GIRLS.map(x => ({ ...x, npc: null }));
  const byId = id => girls.find(x => x.id === id) || null;
  const enabled = () => !!ctx.save.state.settings?.adult;
  const tierOf = bond => (bond >= 5 ? 2 : bond >= 2 ? 1 : 0);
  const qid = id => 'rom_' + id;
  const townName = t => TOWN_NAMES[t] || t;
  const vars = girl => ({ name: girl.name, town: townName(girl.town), when: WHEN[girl.when]?.short || '' });

  /** Her lines for a key: per-girl override (non-empty) → personality. */
  function line(girl, key) {
    const own = girl.lines?.[key];
    if (Array.isArray(own) ? own.length : own) return own;
    return MOODS[girl.mood]?.[key] || [];
  }
  const L = (girl, key) => { const l = line(girl, key); return (Array.isArray(l) ? l : [l]).filter(Boolean).map(s => fill(s, vars(girl))); };
  const one = (girl, key) => fill(pick(line(girl, key)), vars(girl));

  const scenes = createScenes(ctx, {
    clock, safe: S, line,
    state: id => g(id),
    tier: id => tierOf(g(id).bond),
    refresh: id => refresh(id),
  });

  // ---- progression ------------------------------------------------------------------------------
  function setStage(id, stage) {
    const s = g(id);
    if (stage <= s.stage) return;
    s.stage = stage;
    ctx.save.commit();
    ctx.bus.emit('romance:stage', { id, stage });
    syncQuest(id);
    refresh(id);
  }
  function addBond(id, n = 1) {
    const s = g(id), before = tierOf(s.bond);
    s.bond += n;
    ctx.save.commit();
    ctx.bus.emit('romance:bond', { id, bond: s.bond });
    const girl = byId(id);
    if (tierOf(s.bond) > before) S.banner(`❤ Intesa più profonda con ${girl.name}`, before === 0 ? 'Ora ti cerca con gli occhi...' : 'Siete inseparabili.');
    else S.toast(`❤ Intesa con ${girl.name}: ${s.bond}`, { icon: '❤', ms: 2200 });
    return s.bond;
  }

  // ---- quests (adult: hidden by the quest engine when 18+ is off) ---------------------------------
  function taskText(girl) {
    const t = girl.task;
    if (t.type === 'gift') return `Porta a ${girl.name} ${GIFT_TEXT[t.item]?.a || t.item}, tenendolo in mano${GIFT_TEXT[t.item]?.hint || ''}`;
    if (t.type === 'money') return `Fai un regalo di 💰 ${t.amount} a ${girl.name}`;
    if (t.type === 'battle') return `Batti ${girl.name} in una lotta (${t.team.map(s => SPECIES_NAMES[s] || s).join(', ')})`;
    if (t.type === 'champion') return `Sconfiggi il Campione di ${townName(t.town)}, poi torna da ${girl.name}`;
    if (t.type === 'caught') return `Cattura ${t.n} specie diverse di Velmon, poi torna da ${girl.name}`;
    return `Parla con ${girl.name}`;
  }
  function askLine(girl) {
    const own = girl.lines?.ask;
    if (own) return fill(own, vars(girl));
    const t = girl.task;
    if (t.type === 'gift') { const a = (GIFT_TEXT[t.item]?.a || t.item); return `Sai cosa mi farebbe piacere? ${a[0].toUpperCase()}${a.slice(1)}. Portamelo in mano e ne riparliamo.`; }
    if (t.type === 'money') return `Una ragazza ha i suoi vizi... diciamo ${t.amount} monete per un vestito nuovo?`;
    if (t.type === 'battle') return 'Esco solo con chi mi batte a una lotta tra Velmon. Quando vuoi.';
    if (t.type === 'champion') return `Il Campione di ${townName(t.town)}... battilo e avrai la mia attenzione.`;
    return `Mi piacciono gli allenatori seri. Torna quando avrai catturato ${t.n} specie diverse.`;
  }
  const npcPos = girl => { const o = girl.npc?.object; if (o) return { x: o.position.x, z: o.position.z }; const p = S.poi(girl.poi); return p ? { x: p.x, z: p.z } : null; };
  function dateSpotId(girl) {
    for (const id of [...(girl.dateSpot || []), `${girl.town}.date`, `${girl.town}.viewpoint`, `${girl.town}.plaza`]) if (S.poi(id)) return id;
    return girl.poi;
  }
  const dateSpotPos = girl => { const p = S.poi(dateSpotId(girl)); return p ? { x: p.x, z: p.z } : null; };

  function registerQuests() {
    const Q = ctx.story?.quests;
    if (!Q?.register) return;
    for (const girl of girls) {
      const t = girl.task, W = WHEN[girl.when];
      Q.register({
        id: qid(girl.id), title: girl.questTitle || `❤ ${girl.name}`, adult: true, icon: '❤', giver: girl.name,
        steps: [
          { text: taskText(girl), at: t.type === 'champion' ? `${t.town}.champion` : t.type === 'caught' ? undefined : () => npcPos(girl), done: () => g(girl.id).stage >= 1 },
          { text: `Appuntamento con ${girl.name} ${W.text}: raggiungi il posto segnato`, at: () => dateSpotPos(girl), done: () => g(girl.id).stage >= 2 },
          { text: `Passa la serata a casa di ${girl.name} (${townName(girl.town)})`, at: `${girl.home}.owner`, done: () => g(girl.id).stage >= 3 },
        ],
      });
    }
  }
  function syncQuest(id) {
    const Q = ctx.story?.quests;
    if (!Q?.start || !g(id).met) return;
    try {
      if (Q.stepOf(qid(id)) == null) Q.start(qid(id), { silent: !enabled() });
      Q.check?.();
    } catch (e) { console.warn('[romance] quest sync', e); }
  }

  // ---- NPCs --------------------------------------------------------------------------------------
  function refresh(id) {
    const girl = byId(id);
    const npc = girl?.npc;
    if (!npc) return;
    const on = enabled();
    try {
      npc.setMarker?.(on && !scenes.active ? '❤' : null);
      npc.setLabel?.(on ? `Parla con ${girl.name}` : 'Parla');
    } catch (e) { console.warn('[romance] npc refresh', e); }
  }
  const refreshAll = () => girls.forEach(x => refresh(x.id));

  function spawnAll() {
    if (!ctx.actors?.spawnNpc) return;
    for (const girl of girls) {
      if (girl.npc && ctx.actors.npc?.('girl.' + girl.id)) continue;
      const p = S.poi(girl.poi);
      if (!p) { if (ctx.isDebug) console.info('[romance] no POI for', girl.poi); continue; }
      try {
        girl.npc = ctx.actors.spawnNpc({
          id: 'girl.' + girl.id, name: girl.name, look: girl.look,
          at: { x: p.x, z: p.z, facing: p.facing ?? 0 },
          wander: { radius: 2.2, pause: [3, 7] },
          talk: () => romance.talk(girl.id),
          label: enabled() ? `Parla con ${girl.name}` : 'Parla',
          marker: enabled() ? '❤' : null,
        }) || null;
      } catch (e) { console.warn('[romance] spawn', girl.id, e); girl.npc = null; }
    }
    refreshAll();
  }

  // ---- talk ----------------------------------------------------------------------------------------
  const sayTo = (girl, lines, o = {}) => S.say(girl.name, lines, { actor: girl.npc || undefined, camera: girl.npc ? 'dialog' : 'none', ...o });
  const chooseFrom = (title, options, o = {}) => (ctx.story?.dialogue?.choose
    ? ctx.story.dialogue.choose(title, options, { cancel: true, style: 'romance', ...o })
    : S.choose(title, options, { cancel: true, ...o }));
  const heartsOn = girl => { const h = girl.npc?.human; if (h) { const p = S.headPos(h); p.y += 0.3; scenes.hearts.burst(p, 3); } S.sfx('heart'); };

  async function thanks(girl) {
    heartsOn(girl);
    S.jingle('item');
    await sayTo(girl, L(girl, 'thanks'), { expression: girl.mood === 'timida' ? 'blush' : 'smile' });
    setStage(girl.id, 1);
    S.toast(`❤ Appuntamento con ${girl.name} ${WHEN[girl.when].text}`, { icon: '❤', ms: 3000 });
  }

  function champBeaten(town) {
    const id = `champion.${town}`;
    try { if (ctx.story?.trainers?.beaten?.(id)) return true; } catch { /* optional */ }
    return !!(ctx.flags?.has?.(`champion_${town}`) || ctx.save.state.story?.beaten?.[id]);
  }
  function caughtCount() {
    try { const n = ctx.story?.kit?.caughtCount?.() ?? ctx.creatures?.dex?.countCaught?.(); if (Number.isFinite(n)) return n; } catch { /* optional */ }
    return Object.keys(ctx.save.state.creatures?.caught || {}).length;
  }
  const party = () => ctx.creatures?.team?.party || ctx.save.state.creatures?.party || [];

  async function monster(species, level) {
    try { const m = ctx.story?.kit?.monster?.(species, level); if (m) return m; } catch { /* optional */ }
    try { const mod = await import('../creatures/monster.js'); const m = mod.createMonster?.(species, level); if (m) return m; } catch { /* optional */ }
    return { uid: 'rom' + Math.random().toString(36).slice(2), species, nickname: null, level, xp: level ** 3, hp: 10 + level * 3, moves: [] };
  }

  async function taskTurn(girl) {
    const t = girl.task;
    if (t.type === 'gift') {
      const held = ctx.story?.grab?.held || null;
      if (held === t.item) {
        try { ctx.story.grab.give(); } catch (e) { console.warn('[romance] give', e); }
        S.play(girl.npc?.human, 'cheer', { loop: false, fade: 0.25 });
        await thanks(girl);
      } else if (held) {
        await sayTo(girl, [`Carino, ${GIFT_TEXT[held]?.the || 'il pensiero'}... ma non è quello che ti ho chiesto.`, askLine(girl)], { expression: 'smile' });
      } else await sayTo(girl, [one(girl, 'remind'), askLine(girl)]);
      return;
    }
    if (t.type === 'money') {
      const coins = ctx.story?.economy?.coins ?? ctx.save.state.story?.coins ?? 0;
      if (coins < t.amount) { await sayTo(girl, [one(girl, 'remind'), `Torna quando avrai almeno 💰 ${t.amount}, tesoro.`]); return; }
      await sayTo(girl, [askLine(girl)]);
      const i = await chooseFrom(`Regalare 💰 ${t.amount} a ${girl.name}?`, [{ label: `Sì, ecco ${t.amount} monete`, icon: '💰' }, { label: 'Non ora', icon: '✋' }], { actor: girl.npc });
      if (i !== 0) { await sayTo(girl, [one(girl, 'notNow')]); return; }
      const ok = ctx.story?.economy?.spend ? ctx.story.economy.spend(t.amount) : false;
      if (!ok) { await sayTo(girl, ['Mh, sembra che le tasche siano vuote. Un\'altra volta.']); return; }
      S.sfx('coin');
      await thanks(girl);
      return;
    }
    if (t.type === 'battle') {
      if (!ctx.battle?.start) { await sayTo(girl, [askLine(girl)]); return; }
      if (!party().some(m => (m.hp ?? 1) > 0)) { await sayTo(girl, ['Con la squadra a pezzi? Passa dal Centro Cura, poi ne riparliamo.']); return; }
      await sayTo(girl, [askLine(girl)]);
      const i = await chooseFrom(`Lottare con ${girl.name}?`, [{ label: 'Lottiamo!', icon: '⚔️' }, { label: 'Non ora', icon: '✋' }], { actor: girl.npc });
      if (i !== 0) return;
      const top = Math.max(5, ...party().map(m => m.level || 1));
      const lvl = Math.max(6, top - 1);
      const foes = [];
      for (const sp of t.team) { let s = sp; try { s = ctx.story?.kit?.formFor?.(sp, lvl) || sp; } catch { s = sp; } foes.push(await monster(s, lvl)); }
      try { await ctx.story?.dialogue?.release?.(); } catch { /* optional */ }
      let res = 'lose';
      try {
        res = await ctx.battle.start({
          kind: 'trainer', foes, canRun: false, canCatch: false,
          trainer: { id: 'girl.' + girl.id, name: girl.name, npc: girl.npc || undefined, look: girl.look, before: [], after: [] },
        });
      } catch (e) { console.warn('[romance] battle', e); return; }
      await clock.until(() => !ctx.busy.has('battle') && !ctx.battle?.active, 20);
      if (res === 'win') {
        await sayTo(girl, L(girl, 'won'), { expression: 'smile' });
        await thanks(girl);
      } else if (res !== 'run') await sayTo(girl, L(girl, 'lost'), { expression: 'smug' });
      return;
    }
    if (t.type === 'champion') {
      if (champBeaten(t.town)) await thanks(girl);
      else await sayTo(girl, [one(girl, 'remind'), askLine(girl)]);
      return;
    }
    if (t.type === 'caught') {
      const n = caughtCount();
      if (n >= t.n) await thanks(girl);
      else await sayTo(girl, [one(girl, 'remind'), `Finora hai catturato ${n} specie su ${t.n}. Forza!`]);
    }
  }

  /** Start her date now (in her time window) or wait for it (the clock skips under a fade). */
  async function goDate(girl, { wait = false } = {}) {
    if (scenes.active || g(girl.id).stage !== 1) return;
    const W = WHEN[girl.when];
    if (wait && !W.ok(ctx.time?.hours ?? 12)) {
      await S.through(async () => { try { ctx.time?.skipTo?.(W.start); } catch { /* optional */ } await clock.wait(0.3); }, { ms: 600 });
    }
    const r = await scenes.date(girl);
    if (!r) return;
    g(girl.id).dates++;
    setStage(girl.id, 2);
    addBond(girl.id, 1);
    S.toast(`🏠 ${girl.name} ti aspetta a casa sua (${townName(girl.town)})`, { icon: '❤', ms: 3200 });
    // she walks back to her spot
    try { const p = S.poi(girl.poi); if (p) girl.npc?.goTo?.({ x: p.x, z: p.z }); } catch { /* optional */ }
  }

  async function goHome(girl) {
    if (scenes.active) return;
    try { await ctx.story?.dialogue?.release?.(); } catch { /* optional */ }
    await homeScene(girl);
  }

  let homeRunning = false;
  async function homeScene(girl) {
    if (!girl || homeRunning || scenes.active || !enabled() || g(girl.id).stage < 2) return;
    // the evening happens inside her house: enter it first (interior:enter brings us back here)
    if (ctx.world?.enterInterior && ctx.world.interior !== girl.home) {
      try { await ctx.world.enterInterior(girl.home); return; } catch (e) { console.warn('[romance] enterInterior', e); }
    }
    homeRunning = true;
    try {
      const was = g(girl.id).stage;
      const r = await scenes.home(girl);
      if (r?.night) {
        g(girl.id).nights++;
        setStage(girl.id, 3);
        addBond(girl.id, 1);
        if (was < 3) S.toast(`❤ Ora tu e ${girl.name} state insieme. Invitala a uscire quando vuoi!`, { icon: '❤', ms: 3600 });
      }
    } finally { homeRunning = false; }
  }

  async function goOuting(girl, kind) {
    if (scenes.active || !OUTINGS[kind]) return false;
    const ok = await scenes.outing(girl, kind);
    if (ok) {
      const s = g(girl.id);
      s.outings[kind] = (s.outings[kind] || 0) + 1;
      addBond(girl.id, 1);
    }
    return ok;
  }

  async function talk(id) {
    const girl = byId(id);
    if (!girl || scenes.active) return;
    if (!enabled()) {
      await sayTo(girl, [pick(girl.lines?.friendly?.length ? girl.lines.friendly : ['Ciao! Bella giornata, vero?'])], { expression: 'smile' });
      return;
    }
    const s = g(id);
    if (!s.met) {
      s.met = true;
      ctx.save.commit();
      await sayTo(girl, [...L(girl, 'meet'), ...L(girl, 'bio')], { expression: girl.mood === 'timida' ? 'shy' : girl.mood === 'audace' ? 'smug' : 'smile' });
      await sayTo(girl, [askLine(girl)]);
      syncQuest(id);
      refresh(id);
      return;
    }
    if (s.stage === 0) { await taskTurn(girl); return; }
    if (s.stage === 1) {
      const W = WHEN[girl.when], now = W.ok(ctx.time?.hours ?? 12);
      await sayTo(girl, L(girl, 'waitDate'), { expression: 'smile' });
      const i = await chooseFrom(`Appuntamento con ${girl.name}`, [
        now ? { label: 'Andiamo adesso', icon: '❤', sub: 'Al vostro posto' } : { label: `Aspetta ${W.short}`, icon: '🕰️', sub: W.text },
        { label: 'Più tardi', icon: '👋' },
      ], { actor: girl.npc });
      if (i === 0) await goDate(girl, { wait: !now });
      return;
    }
    if (s.stage === 2) {
      await sayTo(girl, L(girl, 'waitHome'), { expression: 'smile' });
      const i = await chooseFrom(girl.name, [{ label: 'Andiamo da te', icon: '🏠' }, { label: 'Più tardi', icon: '👋' }], { actor: girl.npc });
      if (i === 0) await goHome(girl);
      return;
    }
    // together
    const tier = tierOf(s.bond);
    await sayTo(girl, [one(girl, 'after'), pick(BOND_LINES[tier])], { expression: 'smile' });
    const keys = Object.keys(OUTINGS);
    const opts = keys.map(k => ({ label: `Invitala: ${OUTINGS[k].title}`, icon: OUTINGS[k].icon, sub: s.outings[k] ? `Fatto ${s.outings[k]} ${s.outings[k] === 1 ? 'volta' : 'volte'}` : undefined }));
    opts.push({ label: 'Andiamo da te', icon: '🏠', sub: 'Una serata a casa sua' }, { label: 'Solo un saluto', icon: '👋' });
    const hearts = '❤'.repeat(1 + tier) + '♡'.repeat(2 - tier);
    const i = await chooseFrom(`${girl.name} · intesa ${hearts}`, opts, { actor: girl.npc });
    if (i >= 0 && i < keys.length) await goOuting(girl, keys[i]);
    else if (i === keys.length) await goHome(girl);
    else if (i === keys.length + 1) await sayTo(girl, [pick(['Ti aspetto. Non farmi aspettare troppo.', 'Lascio la porta socchiusa...', 'Porta il tuo sorriso migliore.', 'Ciao, tu.'])], { expression: 'smile' });
  }

  // ---- the world: date spots and her home ---------------------------------------------------------
  let interactsDone = false;
  function registerInteract() {
    if (!ctx.interact?.register || interactsDone) return;
    interactsDone = true;
    for (const girl of girls) {
      try {
        ctx.interact.register({
          id: 'romance.date.' + girl.id, pos: () => dateSpotPos(girl), radius: 2.4, priority: 2,
          label: `Aspetta ${girl.name}`, icon: '❤',
          enabled: () => enabled() && g(girl.id).stage === 1 && !ctx.world?.interior && !scenes.active,
          run: () => goDate(girl, { wait: true }),
        });
      } catch (e) { console.warn('[romance] interact', e); }
    }
  }

  // arriving at the date spot inside her time window starts the date
  let acc = 0;
  ctx.loop.add(function romanceDates(dt) {
    acc += dt;
    if (acc < 0.3) return;
    acc = 0;
    if (!enabled() || scenes.active || ctx.busy.is() || ctx.world?.interior) return;
    const pp = ctx.player?.position || ctx.player?.object?.position;
    if (!pp) return;
    const h = ctx.time?.hours ?? 12;
    for (const girl of girls) {
      if (g(girl.id).stage !== 1 || !WHEN[girl.when].ok(h)) continue;
      const p = dateSpotPos(girl);
      if (p && (pp.x - p.x) ** 2 + (pp.z - p.z) ** 2 < 3.2 * 3.2) { goDate(girl); return; }
    }
  }, ctx.ORDER?.systems ?? 10);

  ctx.bus.on('interior:enter', ({ id } = {}) => {
    const girl = girls.find(x => x.home === id);
    if (!girl || !enabled() || g(girl.id).stage < 2 || scenes.active) return;
    clock.until(() => !ctx.busy.has('travel') && !ctx.busy.has('dialog'), 6).then(() => { if (ctx.world?.interior === id || !ctx.world) homeScene(girl); });
  });

  // ---- settings, start ---------------------------------------------------------------------------
  ctx.bus.on('settings:change', ({ key } = {}) => {
    if (key !== 'adult') return;
    refreshAll();
    if (enabled()) girls.forEach(x => syncQuest(x.id));
    try { ctx.story?.quests?.refresh?.(true); } catch { /* optional */ }
  });
  ctx.bus.on('game:start', () => {
    for (const x of girls) g(x.id);
    spawnAll();
    registerInteract();
    if (enabled()) girls.forEach(x => syncQuest(x.id));
  });
  registerQuests();

  const romance = {
    girls,
    enabled,
    stage: id => g(id).stage,
    bond: id => g(id).bond,
    tier: id => tierOf(g(id).bond),
    talk,
    date: id => { const x = byId(id); return x ? goDate(x) : Promise.resolve(); },
    home: id => homeScene(byId(id)),
    outing: (id, kind) => { const x = byId(id); return x ? goOuting(x, kind) : Promise.resolve(false); },
    get active() { return scenes.active; },
  };

  // debug helpers (only with ?debug): __valmora.romance.set('sofia', 3, 4), .outing('sofia', 'picnic') …
  try {
    if (ctx.isDebug) {
      ctx.debug?.register?.('romance', {
        state: id => (id ? { ...g(id) } : JSON.parse(JSON.stringify(st()))),
        set(id, stage, bond) { const s = g(id); s.met = true; s.stage = stage; if (bond != null) s.bond = bond; ctx.save.commit(); ctx.bus.emit('romance:stage', { id, stage }); syncQuest(id); refresh(id); return { ...s }; },
        talk: id => talk(id), date: id => scenes.date(byId(id)), outing: (id, k) => scenes.outing(byId(id), k),
        // enters her house when World has interiors (the evening starts on interior:enter), else plays it here
        home: id => { const x = byId(id); if (g(id).stage < 2) { g(id).stage = 2; g(id).met = true; } return homeScene(x).then(() => clock.until(() => scenes.active || homeRunning, 10)).then(() => clock.until(() => !scenes.active && !homeRunning, 300)); },
        abort: () => scenes.abort(), scenes, romance: () => romance,
      });
    }
  } catch { /* debug optional */ }

  return romance;
}
