// The shady side of Valmora (ported from v1 src/world/crime.js), cartoonish and bloodless:
// fixers (Er Faina in the Fulgida alleys, Zio Murena on the Corallo docks) hand out jobs — Consegna
// (timed parcel delivery), Colpo (grab a stall's cash box, then lose the guards), Corsa (8 glowing rings
// along a route), Lotta clandestina (bet on a battle) — and sell the Spara-vernice. Guards in blue react
// only to what they see: they chase at walking pace (running at 3★), search where they lost you and give
// up; hiding indoors drops the trail. Caught → Arrenditi / Mazzetta / Opponi resistenza. Scooters can be
// "borrowed", drawers searched (owners don't like it). Contract: story.crime {wanted, addWanted, clearWanted,
// job, hasBlaster} + wanted:change, job:start, job:end.
import * as THREE from 'three';
import { buildScooter } from './scooter.js';
import { buildJobMarker, buildRing, buildParcel, buildCashBox, buildDizzy, buildSplat, buildPaintBall, paintColor, buildBurst } from './props.js';
import { lookFor, STORY_LOOKS, classLook } from './looks.js';
import { ITEMS } from './items.js';
import { dist2, mmss, pick, wrap, TOWN_NAMES } from './util.js';

const FIXERS = [
  { id: 'fixer.faina', name: 'Er Faina', town: 'fulgida', at: 'fulgida.alley', look: 'fixer', route: 'r2',
    hello: ['Psst! Sì, dico a te. Cerchi lavoretti... discreti?', 'In questa città gira un sacco di grana. Basta sapere dove guardare.', 'Ehi, campione. Ho roba fresca per te. Lavoro, intendo.'] },
  { id: 'fixer.murena', name: 'Zio Murena', town: 'corallo', at: 'corallo.docks', look: 'murena', route: 'r6',
    hello: ['Ehi, ragazzo. Al porto arrivano casse che nessuno deve vedere.', 'Il mare porta di tutto. Anche lavoretti per chi ha il fegato.', 'Zio Murena paga sempre. Prima o poi.'] },
];
const GUARD_TOWNS = ['alba', 'fulgida', 'corallo'];
const SCOOTERS = [['alba', '#ffd23f'], ['fulgida', '#3a8fe0'], ['corallo', '#e8443a']];
const FIGHTERS = [['Tony Due Denti', 'm'], ['La Vipera', 'f'], ['Rocco il Muro', 'm'], ['Gina Pugno Duro', 'f'], ['Il Barone', 'm']];
const FIGHT_SPECIES = ['topolux', 'pipistro', 'voltino', 'roccione', 'sabbiolo', 'fiammello', 'ombrale', 'scoiattolo', 'granchio', 'goccino'];
const GUARD_SPECIES = ['voltino', 'roccione', 'pipistro', 'scoiattolo', 'sabbiolo', 'topolux'];
const BLASTER_PRICE = 400;
const SHOUTS = ['👮 Alt! Fermati!', '👮 Eccolo! È lui!', '👮 Ehi tu, fermo lì!', '👮 Guardia cittadina! Non muoverti!'];
const CAUGHT_LINES = ['Alt! Guardia cittadina! Mani bene in vista!', 'Ti ho preso, furfante! Niente scherzi.', 'Fine della corsa, amico. Adesso facciamo due chiacchiere.'];
const LOOT = [{ coins: 40 }, { coins: 80 }, { items: { pozione: 1 } }, { coins: 120 }, { items: { sfera: 2 } }, null, { coins: 60 }, { items: { superpozione: 1 } }, null];

export function createCrime(ctx) {
  const K = () => ctx.story.kit;
  const st = () => {
    const s = (ctx.save.state.story ||= {});
    s.crime ||= { wanted: 0, blaster: false, jobsDone: 0 };
    return s.crime;
  };
  const guards = new Map();       // npc id → guard record
  const extras = [];              // reinforcement npc ids
  const shots = [];
  const scooters = [];
  const searchUnreg = [];
  let job = null, calm = 0, grace = 0, hideT = 0, fireT = 0, arresting = false, hudAcc = 0, extraSeq = 0;

  // ------------------------------------------------------------------ wanted
  function setWanted(n, reason) {
    const before = st().wanted || 0;
    n = Math.max(0, Math.min(3, n));
    if (n === before) return;
    st().wanted = n; calm = 0; ctx.save.commit();
    try { ctx.ui?.hud?.setWanted?.(n); } catch { /* ui optional */ }
    ctx.bus.emit('wanted:change', { level: n, reason });
    if (n > before) {
      K().toast(`${reason || 'Sei ricercato!'} ${'★'.repeat(n)}`, { icon: '🚨', ms: 2600 });
      K().sfx('whistle'); K().haptic?.([30, 30, 30]);
      alertNearby();
      if (n >= 2) reinforce(n - before);
    } else if (n === 0) K().toast('Le guardie hanno perso le tue tracce!', { icon: '😮‍💨' });
    else K().toast(`Le guardie perdono le tue tracce... ${'★'.repeat(n)}`, { icon: '👀' });
  }

  function alertNearby() {
    const pp = K().playerPos(); if (!pp) return;
    for (const g of guards.values()) {
      const npc = npcOf(g);
      if (!npc || g.stun > 0 || g.state === 'chase') continue;
      if (dist2(npc.object.position, pp) < 45) { g.state = 'search'; g.lastSeen = { x: pp.x, z: pp.z }; g.searchT = 6; leavePatrol(g, npc); }
    }
  }

  /** Reinforcements arrive from behind when the stars go up (towns with guards only). */
  function reinforce(count) {
    const pp = K().playerPos(); const area = ctx.world?.area;
    if (!pp || !ctx.actors?.spawnNpc || ctx.world?.interior) return;
    if (area && !GUARD_TOWNS.includes(area)) return;
    for (let i = 0; i < count && extras.length < 3; i++) {
      const f = (ctx.player?.facing ?? 0) + Math.PI + (Math.random() - 0.5) * 1.2;
      const x = pp.x + Math.sin(f) * 26, z = pp.z + Math.cos(f) * 26;
      if (ctx.world?.walkable && !ctx.world.walkable(x, z)) continue;
      const id = `guard.extra.${++extraSeq}`;
      try {
        const npc = ctx.actors.spawnNpc({ id, name: 'Guardia', look: lookFor(ctx, 'guard', Math.random() < 0.4 ? STORY_LOOKS.guard_f : STORY_LOOKS.guard), at: { x, z, facing: f + Math.PI }, wander: null });
        if (!npc) continue;
        extras.push(id);
        guards.set(id, { id, town: area || null, home: { x, z }, state: 'search', lastSeen: { x: pp.x, z: pp.z }, searchT: 8, stun: 0, extra: true, retarget: 0 });
      } catch (e) { console.warn('[crime] reinforce', e); }
    }
  }

  // ------------------------------------------------------------------ guards
  function npcOf(g) { return ctx.story.npcs.get(g.id) || ctx.actors?.npc?.(g.id) || null; }
  function leavePatrol(g, npc) { try { npc.setWander?.(null); npc.freeze?.(false); } catch { /* optional */ } void g; }
  function backToPatrol(g, npc) {
    g.state = 'patrol'; g.shouted = false;
    try { npc.setMarker?.(null); if (!g.extra) npc.setWander?.({ radius: 6, pause: [2, 5] }); } catch { /* optional */ }
  }
  function goTo(npc, p, run) {
    try { (npc.goTo ? npc.goTo({ x: p.x, z: p.z }, { run }) : npc.human?.moveTo?.({ x: p.x, z: p.z }, { run }))?.catch?.(() => {}); } catch { /* optional */ }
  }

  function canSee(npc, pp) {
    if (ctx.world?.interior) return false;
    const o = npc.object.position, d = dist2(o, pp);
    if (d > 22) return false;
    if (d > 5) {
      const ang = Math.abs(wrap(Math.atan2(pp.x - o.x, pp.z - o.z) - npc.object.rotation.y));
      if (ang > 1.2) return false;
    }
    const cols = ctx.world?.colliders;
    if (typeof cols?.blocked === 'function') {
      const n = Math.floor(d / 1.5);
      for (let i = 1; i < n; i++) { const k = i / n; if (cols.blocked(o.x + (pp.x - o.x) * k, o.z + (pp.z - o.z) * k, 0.05)) return false; }
    }
    return true;
  }

  function stun(g, kind, color) {
    const npc = npcOf(g); if (!npc) return;
    g.stun = kind === 'paint' ? 12 : kind === 'battle' ? 20 : 8;
    g.state = 'stunned';
    try { npc.setMarker?.(null); npc.setWander?.(null); npc.freeze?.(true); npc.human?.setExpression?.('closed'); npc.human?.play?.('sit_ground', { fade: 0.3 }); } catch { /* optional */ }
    if (!g.dizzy) { g.dizzy = buildDizzy(ctx); ctx.story.fx.add(g.dizzy, null, npc.human?.head || npc.object); g.dizzy.position.y = npc.human?.head ? 0.35 : 2.0; }
    if (kind === 'paint' && !g.splat) { g.splat = buildSplat(ctx, color || paintColor()); npc.object.add(g.splat); }
    ctx.story.fx.add(buildBurst(ctx, color || '#ffd23f', { count: 10, speed: 2.2, life: 0.6 }), { x: npc.object.position.x, y: npc.object.position.y + 1.3, z: npc.object.position.z });
  }
  function unstun(g) {
    const npc = npcOf(g);
    g.dizzy && ctx.story.fx.remove(g.dizzy); g.dizzy = null;
    g.splat?.removeFromParent(); g.splat = null;
    if (npc) { try { npc.freeze?.(false); npc.human?.setExpression?.('angry'); npc.human?.play?.('stand_up', { loop: false })?.then?.(() => npc.human?.play?.('idle')); } catch { /* optional */ } }
    g.state = 'return';
  }

  /** Something flew at pos: stun the first guard it touches (thrown objects, paint). */
  function hitTest(pos, r = 0.6, kind = 'throw', color) {
    for (const g of guards.values()) {
      if (g.stun > 0) continue;
      const npc = npcOf(g); if (!npc?.object) continue;
      const o = npc.object.position;
      if (dist2(o, pos) < r && pos.y > o.y - 0.2 && pos.y < o.y + 2.1) {
        stun(g, kind, color);
        if (!st().wanted) setWanted(1, kind === 'paint' ? 'Hai impiastricciato una guardia!' : 'Hai colpito una guardia!');
        else K().toast('Bersaglio colpito! La guardia è stordita.', { icon: '💫' });
        K().sfx(kind === 'paint' ? 'paint' : 'hit');
        return true;
      }
    }
    return false;
  }

  async function caught(g) {
    if (arresting) return;
    arresting = true;
    const npc = npcOf(g);
    try {
      try { ctx.player?.mount?.(null); } catch { /* optional */ }
      g.state = 'arrest';
      try { npc?.setMarker?.(null); npc?.faceTo?.(ctx.player?.object); ctx.player?.human?.face?.({ x: npc.object.position.x, z: npc.object.position.z }); ctx.player?.human?.setExpression?.('surprised'); } catch { /* optional */ }
      await K().say('Guardia', [pick(CAUGHT_LINES)], { actor: npc, expression: 'angry', gesture: 'point' });
      const coins = ctx.story.economy.coins, fine = Math.round(coins * 0.1), bribe = 200 * Math.max(1, st().wanted);
      const opts = [{ icon: '🙌', label: 'Arrenditi', sub: `Paghi una multa di 💰 ${fine} e le stelle spariscono.` }];
      if (coins >= bribe) opts.push({ icon: '💶', label: 'Allunga una mazzetta', sub: `💰 ${bribe} e la guardia guarda dall'altra parte (forse).` });
      opts.push({ icon: '✊', label: 'Opponi resistenza', sub: 'Lotta contro i Velmon della guardia.' });
      const pickI = await ctx.story.dialogue.required('Ti hanno preso!', opts, { actor: npc });
      const choice = opts[pickI].label;
      if (choice === 'Arrenditi') {
        ctx.story.economy.lose(fine, 'fine');
        endArrest(g);
        crime.abortJob('Le guardie hanno sequestrato la refurtiva.', true);
        await K().say('Guardia', ['Saggia scelta. Multa pagata: sei libero.', 'E che non ti riveda più in giro a combinare guai!'], { actor: npc, expression: 'neutral', gesture: 'shake_head' });
        return;
      }
      if (choice === 'Allunga una mazzetta') {
        if (Math.random() < 0.8) {
          ctx.story.economy.spend(bribe, 'bribe');
          endArrest(g);
          await K().say('Guardia', ['Mmh... non ho visto niente. Sparisci, prima che cambi idea.'], { actor: npc, expression: 'smug', gesture: 'nod' });
          return;
        }
        await K().say('Guardia', ['Una mazzetta? A ME? Adesso sì che sei nei guai!'], { actor: npc, expression: 'angry', gesture: 'shake_head' });
        setWanted((st().wanted || 0) + 1, 'Tentata corruzione!');
      }
      await K().say('Guardia', ['Vuoi fare a modo tuo? Va bene, vediamo!'], { actor: npc, expression: 'angry' });
      await ctx.story.dialogue.release();
      const lv = Math.max(5, K().topLevel() - 2 + (st().wanted || 1));
      const foes = Array.from({ length: Math.min(Math.max(1, st().wanted), 2) }, () => { const sp = pick(GUARD_SPECIES); return K().monster(K().formFor(sp, lv), lv); });
      const res = ctx.battle?.start ? await ctx.battle.start({ kind: 'guard', foes, trainer: { id: g.id, name: 'Guardia', npc: npc || undefined, look: lookFor(ctx, 'guard', STORY_LOOKS.guard) }, canRun: false, canCatch: false, music: 'battle_trainer' }) : 'win';
      await K().afterBattle();
      if (res === 'win') {
        grace = 4;
        setWanted((st().wanted || 1) - 1);
        stun(g, 'battle');
        await K().say('Guardia', ['Ahia, ahia... mi arrendo! Vado a chiamare rinforzi... prima o poi.'], { actor: npc, expression: 'sad' });
      } else {
        crime.clearWanted(true);
        crime.abortJob('Le guardie hanno sequestrato la refurtiva.', true);
        g.state = 'return';
      }
    } catch (e) { console.error('[crime] arrest', e); }
    finally { arresting = false; }
  }

  function endArrest(g) {
    crime.clearWanted(true);
    g.state = 'return';
  }

  function updateGuards(dt) {
    const pp = K().playerPos();
    if (!pp) return;
    const wanted = st().wanted || 0;
    let chasingNear = false;
    for (const g of guards.values()) {
      const npc = npcOf(g);
      if (!npc?.object) continue;
      const o = npc.object.position, d = dist2(o, pp);
      if (g.stun > 0) {
        g.stun -= dt;
        if (g.stun <= 0) unstun(g);
        continue;
      }
      if (g.state === 'arrest') continue;
      if (!wanted && (g.state === 'chase' || g.state === 'search')) g.state = 'return';
      const sees = wanted > 0 && canSee(npc, pp);
      if (sees) {
        g.lastSeen = { x: pp.x, z: pp.z }; g.lostT = 0;
        if (g.state !== 'chase') {
          g.state = 'chase'; leavePatrol(g, npc);
          try { npc.setMarker?.('!'); npc.human?.setExpression?.('angry'); } catch { /* optional */ }
          if (!g.shouted) { g.shouted = true; K().toast(pick(SHOUTS), { icon: '👮', ms: 1500 }); K().sfx('whistle', { vol: 0.6 }); }
        }
      }
      g.retarget = (g.retarget || 0) - dt;
      if (g.state === 'chase') {
        if (!sees) { g.lostT = (g.lostT || 0) + dt; if (g.lostT > 2.5) { g.state = 'search'; g.searchT = 6; try { npc.setMarker?.('?'); } catch { /* optional */ } } }
        else if (d < 40) chasingNear = true;
        if (grace > 0) continue;
        if (g.retarget <= 0) { g.retarget = 0.35; goTo(npc, sees ? pp : g.lastSeen, wanted >= 3); }
        if (sees && d < 1.35) {
          g.grabT = (g.grabT || 0) + dt;
          if (g.grabT > 0.45 && !ctx.busy.is() && !arresting) { g.grabT = 0; caught(g); return; }
        } else g.grabT = 0;
      } else if (g.state === 'search') {
        const lp = g.lastSeen || g.home;
        if (dist2(o, lp) > 1.0) { if (g.retarget <= 0) { g.retarget = 0.6; goTo(npc, lp, false); } }
        else {
          g.searchT -= dt;
          if (g.retarget <= 0) { g.retarget = 1.4; try { npc.human?.face?.(npc.object.rotation.y + (Math.random() - 0.5) * 2.4, { dur: 0.8 }); } catch { /* optional */ } }
          if (g.searchT <= 0) { g.state = 'return'; try { npc.setMarker?.(null); npc.human?.setExpression?.('neutral'); } catch { /* optional */ } }
        }
      } else if (g.state === 'return') {
        if (g.extra) { if (!wanted && d > 30) removeExtra(g.id); else if (g.retarget <= 0) { g.retarget = 1; goTo(npc, g.home, false); } continue; }
        const h = g.home || K().poi(g.id);
        if (!h || dist2(o, h) < 1.2) backToPatrol(g, npc);
        else if (g.retarget <= 0) { g.retarget = 1; goTo(npc, h, false); }
      }
    }
    // the stars fade when nobody is on your heels for a while (faster outside towns)
    if (wanted) {
      const inTown = ctx.world?.areaDef?.(ctx.world?.area)?.kind === 'town';
      if (chasingNear) calm = 0; else calm += dt * (inTown ? 1 : 2.5);
      if (calm > 7 + wanted * 3) setWanted(wanted - 1);
      if (ctx.world?.interior) { hideT += dt; if (hideT > 8) { setWanted(0); hideT = 0; } } else hideT = 0;
    }
  }

  function removeExtra(id) {
    const i = extras.indexOf(id); if (i >= 0) extras.splice(i, 1);
    const g = guards.get(id); if (g?.dizzy) ctx.story.fx.remove(g.dizzy);
    guards.delete(id);
    try { ctx.actors?.removeNpc?.(id); } catch { /* optional */ }
  }

  // ------------------------------------------------------------------ paint blaster
  function fire() {
    if (!st().blaster || fireT > 0 || ctx.busy.is()) return;
    fireT = 0.45;
    const pp = K().playerPos(); if (!pp) return;
    const f = ctx.player?.facing ?? ctx.player?.object?.rotation?.y ?? 0;
    const fx = Math.sin(f), fz = Math.cos(f);
    let best = null, bd = 24;
    for (const g of guards.values()) {
      if (g.stun > 0) continue;
      const npc = npcOf(g); if (!npc?.object?.visible && npc?.object?.visible !== undefined) continue;
      const o = npc?.object?.position; if (!o) continue;
      const dx = o.x - pp.x, dz = o.z - pp.z, d = Math.hypot(dx, dz);
      if (d < bd && d > 0.01 && (dx * fx + dz * fz) / d > 0.55) { best = g; bd = d; }
    }
    const color = paintColor();
    const ball = buildPaintBall(ctx, color);
    const from = new THREE.Vector3(pp.x + fx * 0.6, (pp.y || 0) + 1.25, pp.z + fz * 0.6);
    const tn = best ? npcOf(best) : null;
    const to = tn ? tn.object.position.clone().setY(tn.object.position.y + 1.1) : from.clone().add(new THREE.Vector3(fx * 20, -1.2, fz * 20));
    ball.position.copy(from);
    ctx.scene.add(ball);
    shots.push({ ball, from, to, t: 0, dur: Math.max(0.15, from.distanceTo(to) / 32), target: best, color });
    try { ctx.player?.human?.play?.('throw', { loop: false, fade: 0.1 })?.then?.(() => ctx.player?.human?.play?.('idle')); } catch { /* optional */ }
    K().sfx('paint');
  }
  function updateShots(dt) {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.t = Math.min(1, s.t + dt / s.dur);
      s.ball.position.lerpVectors(s.from, s.to, s.t);
      s.ball.position.y += Math.sin(s.t * Math.PI) * 0.5;
      if (s.t >= 1) {
        s.ball.removeFromParent(); s.ball.geometry.dispose(); shots.splice(i, 1);
        ctx.story.fx.add(buildBurst(ctx, s.color, { count: 8, speed: 2, life: 0.5, size: 0.07 }), s.to);
        if (s.target && s.target.stun <= 0) hitTest(npcOf(s.target)?.object?.position?.clone().setY((npcOf(s.target)?.object?.position?.y || 0) + 1) || s.to, 1.2, 'paint', s.color);
      }
    }
  }

  // ------------------------------------------------------------------ jobs
  function setMission(m) { try { ctx.ui?.hud?.setMission?.(m); } catch { /* ui optional */ } }
  function addMarker(obj, p) { ctx.story.fx.add(obj, { x: p.x, y: K().groundY(p.x, p.z), z: p.z }); return obj; }
  function clearMarkers() { for (const o of job?.markers || []) ctx.story.fx.remove(o); if (job) job.markers = []; }
  function carry(obj) {
    if (ctx.story.grab.held) ctx.story.grab.drop();
    if (ctx.player?.carry) { try { ctx.player.carry(obj); } catch { /* optional */ } }
    else if (ctx.player?.object && obj) { ctx.player.object.add(obj); obj.position.set(0, 1.15, 0.38); }
  }
  function uncarry(obj) { try { ctx.player?.carry?.(null); } catch { /* optional */ } obj?.removeFromParent(); }

  function deliveryTargets(fixer) {
    const island = K().islandOfPoi(fixer.at);
    const ids = [`${fixer.town}.drop1`, `${fixer.town}.drop2`, `${fixer.town}.drop3`];
    for (const t of Object.keys(TOWN_NAMES)) if (t !== fixer.town && K().islandOf(t) === island) ids.push(`${t}.bench`, `${t}.plaza`);
    if (fixer.town === 'corallo') ids.push('r6.rest', 'r6.sign');
    return ids.map(id => ({ id, p: K().poi(id) })).filter(x => x.p && dist2(x.p, K().poi(fixer.at) || x.p) > 20);
  }

  async function startDelivery(fixer, npc) {
    const list = deliveryTargets(fixer);
    if (!list.length) { await K().say(fixer.name, ['Oggi niente consegne. Ripassa più tardi.'], { actor: npc }); return; }
    const tgt = pick(list), from = K().playerPos() || tgt.p;
    const d = dist2(from, tgt.p), time = Math.round((d * 1.15) / 11 + 45), pay = 500 + Math.round(d / 10) * 5;
    const town = tgt.id.split('.')[0], where = TOWN_NAMES[town] || 'laggiù';
    const parcel = buildParcel(ctx);
    job = { kind: 'delivery', title: '📦 Consegna', goal: `Porta il pacco al socio (${where})`, fixer, target: { x: tgt.p.x, z: tgt.p.z }, time, pay, parcel, markers: [] };
    job.markers.push(addMarker(buildJobMarker(ctx, '#ffd23f'), tgt.p));
    job.contactId = 'job.contact';
    try { ctx.actors?.spawnNpc?.({ id: job.contactId, name: 'Socio', look: lookFor(ctx, 'contact', STORY_LOOKS.contact), at: { x: tgt.p.x, z: tgt.p.z, facing: tgt.p.facing || 0 }, wander: null }); } catch { /* optional */ }
    await K().say(fixer.name, [`Porta questo pacco al mio socio a ${where}. Non aprirlo e non fare domande.`, `Hai ${mmss(time)}. Uno scooter ti farebbe comodo... 😏`], { actor: npc, gesture: 'point', expression: 'smug' });
    await ctx.story.dialogue.release();
    carry(parcel);
    ctx.bus.emit('job:start', { kind: 'delivery' });
  }

  async function startTheft(fixer, npc) {
    const stalls = [1, 2].map(n => ({ id: `${fixer.town}.stall${n}`, p: K().poi(`${fixer.town}.stall${n}`) })).filter(s => s.p);
    if (!stalls.length) { await K().say(fixer.name, ['Il mercato oggi è chiuso. Peccato.'], { actor: npc }); return; }
    const s = pick(stalls);
    job = { kind: 'theft', title: '💰 Colpo', goal: 'Arraffa l\'incasso della bancarella', fixer, stall: s.id, target: { x: s.p.x, z: s.p.z }, pay: 600, grabbed: false, markers: [] };
    job.markers.push(addMarker(buildJobMarker(ctx, '#ff5d5d'), s.p));
    await K().say(fixer.name, ['Vedi quella bancarella al mercato? Il venditore tiene l\'incasso in una cassetta.', 'Prendila e sparisci. Le guardie ti staranno addosso: seminale e la grana è tua.'], { actor: npc, gesture: 'point', expression: 'smug' });
    ctx.bus.emit('job:start', { kind: 'theft' });
  }

  function racePoints(fixer) {
    const mm = (() => { try { return ctx.world?.minimap?.(); } catch { return null; } })();
    let pts = mm?.routes?.find(r => r.id === fixer.route)?.points?.map(([x, z]) => ({ x, z })) || null;
    if (!pts || pts.length < 2) {
      const a = K().poi(`${fixer.route}.start`), b = K().poi(`${fixer.route}.end`);
      if (!a || !b) return null;
      pts = [a, b];
    }
    const home = K().poi(fixer.at) || pts[0];
    if (dist2(pts[pts.length - 1], home) < dist2(pts[0], home)) pts = [...pts].reverse();
    // resample: 8 rings, every ~22 m, starting ~20 m along the route
    const out = []; let acc = 0, next = 20;
    for (let i = 1; i < pts.length && out.length < 8; i++) {
      const a = pts[i - 1], b = pts[i], seg = dist2(a, b);
      while (acc + seg >= next && out.length < 8) {
        const k = (next - acc) / seg, x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
        out.push({ x, z, dir: Math.atan2(b.x - a.x, b.z - a.z) });
        next += 22;
      }
      acc += seg;
    }
    return out.length >= 3 ? out : null;
  }

  function showRings() {
    clearMarkers();
    job.pts.slice(job.idx, job.idx + 2).forEach((p, i) => {
      const r = buildRing(ctx, i === 0 ? '#3ad1ff' : '#b8c4d8');
      r.rotation.y = p.dir; if (i) r.scale.setScalar(0.7);
      job.markers.push(addMarker(r, p));
    });
    job.target = { x: job.pts[job.idx].x, z: job.pts[job.idx].z };
  }

  async function startRace(fixer, npc) {
    const pts = racePoints(fixer);
    if (!pts) { await K().say(fixer.name, ['Oggi la strada è piena di guardie. Niente corsa.'], { actor: npc }); return; }
    let len = dist2(K().poi(fixer.at) || pts[0], pts[0]);
    for (let i = 1; i < pts.length; i++) len += dist2(pts[i - 1], pts[i]);
    job = { kind: 'race', title: '🏁 Corsa', goal: `Cerchi: 0/${pts.length}`, fixer, pts, idx: 0, time: Math.round(len / 9 + 20), countdown: 3.6, pay: 500, markers: [] };
    showRings();
    await K().say(fixer.name, [`Corsa clandestina: ${pts.length} cerchi lungo la strada, ${mmss(job.time)} di tempo.`, 'A piedi è dura: uno scooter aiuta. Pronti...'], { actor: npc, gesture: 'point', expression: 'grin' });
    ctx.bus.emit('job:start', { kind: 'race' });
  }

  async function startFight(fixer, npc) {
    if (!K().hasAlive()) { await K().say(fixer.name, ['Con una squadra a pezzi? Passa prima dal Centro Cura.'], { actor: npc }); return; }
    const bets = [100, 300, 500].filter(b => b <= ctx.story.economy.coins);
    if (!bets.length) { await K().say(fixer.name, ['Qui si scommette almeno 💰 100. Torna quando hai i soldi.'], { actor: npc }); return; }
    const i = await K().choose('Quanto scommetti?', [...bets.map(b => ({ icon: '💰', label: `${b} monete`, sub: `Se vinci ne ricevi ${b * 2}.` })), { icon: '✋', label: 'Ci ho ripensato' }], { actor: npc });
    if (i < 0 || i >= bets.length) return;
    const bet = bets[i];
    const [name, sex] = pick(FIGHTERS);
    const size = bet >= 500 ? 3 : 2, lv = Math.max(5, K().topLevel() + (bet >= 500 ? 2 : bet >= 300 ? 1 : -1));
    const foes = Array.from({ length: size }, () => { const sp = pick(FIGHT_SPECIES), l = lv + Math.floor(Math.random() * 3) - 1; return K().monster(K().formFor(sp, l), l); });
    ctx.story.economy.spend(bet, 'bet');
    await K().say(fixer.name, [`Si scommettono 💰 ${bet}. Contro di te c'è ${name}. Niente regole: chi vince prende tutto!`], { actor: npc, gesture: 'point', expression: 'grin' });
    await ctx.story.dialogue.release();
    ctx.bus.emit('job:start', { kind: 'fight' });
    const res = ctx.battle?.start ? await ctx.battle.start({ kind: 'bet', foes, trainer: { id: 'bet.' + name, name, look: classLook('Lottatore', sex) }, canRun: false, canCatch: false, music: 'battle_trainer' }) : 'win';
    await K().afterBattle();
    if (res === 'win') {
      ctx.story.economy.earn(bet * 2, 'bet');
      st().jobsDone = (st().jobsDone || 0) + 1; ctx.save.commit();
      K().banner(`+ 💰 ${bet * 2}`, 'Scommessa vinta!');
      await K().say(fixer.name, ['Hai fatto il botto! Torna quando vuoi.'], { actor: npc, expression: 'laugh', gesture: 'cheer' });
      ctx.bus.emit('job:end', { kind: 'fight', success: true });
    } else {
      if (res !== 'lose') K().toast(`Hai perso la scommessa (💰 ${bet}).`, { icon: '💸' });
      ctx.bus.emit('job:end', { kind: 'fight', success: false });
    }
  }

  async function buyBlaster(fixer, npc) {
    if (!ctx.story.economy.spend(BLASTER_PRICE, 'blaster')) { await K().say(fixer.name, [`Costa 💰 ${BLASTER_PRICE}. Torna quando hai i soldi.`], { actor: npc }); return; }
    st().blaster = true; ctx.save.commit();
    ctx.story.bag.add('blaster', 1);
    try { ctx.ui?.controls?.setBlaster?.(true); } catch { /* ui optional */ }
    K().jingle('item');
    await K().say(fixer.name, ['Ecco qua, uno Spara-vernice nuovo di zecca.', 'Premi 🎯 (o F) per sparare: le guardie colpite restano stordite e coperte di vernice.', 'Ma occhio: sparare a una guardia ti rende ricercato!'], { actor: npc, gesture: 'talk_gesture', expression: 'grin' });
  }

  function endJob(ok, text) {
    const m = job; if (!m) return;
    clearMarkers();
    if (m.parcel) uncarry(m.parcel);
    if (m.box) uncarry(m.box);
    if (m.contactId) { try { ctx.actors?.removeNpc?.(m.contactId); } catch { /* optional */ } }
    job = null;
    setMission(null);
    if (ok) {
      ctx.story.economy.earn(m.pay, 'job:' + m.kind);
      st().jobsDone = (st().jobsDone || 0) + 1; ctx.save.commit();
      K().banner(`+ 💰 ${m.pay}`, 'Lavoro fatto!'); K().jingle('quest');
    } else K().banner(text || 'Il lavoro è andato male', 'Lavoro fallito');
    ctx.bus.emit('job:end', { kind: m.kind, success: !!ok });
  }

  async function updateJob(dt) {
    const m = job; if (!m || ctx.battle?.active) return;
    const pp = K().playerPos(); if (!pp) return;
    let timer = null;
    if (m.kind === 'delivery') {
      m.time -= dt; timer = m.time;
      if (dist2(pp, m.target) < 3.5 && !ctx.busy.is()) {
        const contact = ctx.actors?.npc?.(m.contactId);
        endJob(true);
        K().say('Socio', ['Puntuale come un orologio. Ecco la tua parte.', 'E ricorda: non ci siamo mai visti.'], { actor: contact, expression: 'smug', gesture: 'nod' });
        return;
      }
      if (m.time <= 0) return endJob(false, 'Sei arrivato tardi: il socio se n\'è andato.');
    } else if (m.kind === 'theft') {
      if (m.grabbed && !(st().wanted > 0)) return endJob(true);
    } else if (m.kind === 'race') {
      if (m.countdown > 0) {
        const before = Math.ceil(m.countdown);
        m.countdown -= dt;
        const now = Math.ceil(m.countdown);
        if (now !== before) { K().toast(now > 0 ? `${now}…` : 'VIA! 🏁', { ms: 800 }); K().sfx(now > 0 ? 'ui_tap' : 'whistle'); }
        timer = m.time;
      } else {
        m.time -= dt; timer = m.time;
        if (dist2(pp, m.pts[m.idx]) < 3.4) {
          const p = m.pts[m.idx];
          ctx.story.fx.add(buildBurst(ctx, '#3ad1ff', { count: 14, speed: 3 }), { x: p.x, y: K().groundY(p.x, p.z) + 2.4, z: p.z });
          K().sfx('coin');
          m.idx++;
          if (m.idx >= m.pts.length) return endJob(true);
          showRings();
        }
        if (m.time <= 0) return endJob(false, 'Tempo scaduto!');
        m.goal = `Cerchi: ${m.idx}/${m.pts.length}`;
      }
    }
    hudAcc += dt;
    if (hudAcc > 0.25) {
      hudAcc = 0;
      setMission({ title: m.title, goal: m.goal, timer: timer == null ? '' : mmss(Math.max(0, timer)), urgent: timer != null && timer < 15,
        dist: m.target && !(m.kind === 'theft' && m.grabbed) ? Math.round(dist2(pp, m.target)) : null });
    }
  }

  async function robStall(stallId) {
    const m = job;
    if (!m || m.kind !== 'theft' || m.stall !== stallId || m.grabbed) return;
    m.grabbed = true; m.goal = 'Semina le guardie!';
    clearMarkers();
    m.box = buildCashBox(ctx);
    carry(m.box);
    K().toast('Hai arraffato la cassetta!', { icon: '💰' });
    const vendor = ctx.story.npcs.get('vendor.' + stallId);
    try { vendor?.human?.setExpression?.('angry'); } catch { /* optional */ }
    await K().say('Venditore', ['Al ladro! Al ladro! GUARDIE!'], { actor: vendor, gesture: 'point', expression: 'angry' });
    setWanted(Math.max(2, (st().wanted || 0) + 2), 'Furto al mercato!');
  }

  // ------------------------------------------------------------------ fixers
  async function talkFixer(fixer, npc) {
    for (const hook of ctx.story.hooks.fixer) { try { if (await hook(fixer, npc)) return; } catch (e) { console.warn('[crime] fixer hook', e); } }
    if (st().wanted > 0) { await K().say(fixer.name, ['Sei matto? Hai le guardie alle calcagna! Prima seminale, poi parliamo.'], { actor: npc, expression: 'angry', gesture: 'shake_head' }); return; }
    if (job) {
      const i = await K().choose(`${fixer.name}: "Hai già un lavoro in corso."`, [{ icon: '👍', label: 'Ci sto lavorando' }, { icon: '✋', label: 'Lascio perdere il lavoro', sub: 'Il lavoro fallisce, niente paga.' }], { actor: npc });
      if (i === 1) endJob(false, 'Hai mollato il lavoro.');
      return;
    }
    await K().say(fixer.name, [pick(fixer.hello)], { actor: npc, gesture: 'talk_gesture', expression: 'smug' });
    const opts = [
      { icon: '📦', label: 'Consegna a tempo', sub: 'Porta un pacco "speciale" a un socio entro il tempo. Paga 💰 500+.', act: startDelivery },
      { icon: '💰', label: 'Colpo alla bancarella', sub: 'Arraffa l\'incasso del mercato e semina le guardie. Paga 💰 600.', act: startTheft },
      { icon: '🏁', label: 'Corsa clandestina', sub: 'Passa negli 8 cerchi lungo la strada prima che scada il tempo. Paga 💰 500.', act: startRace },
      { icon: '🥊', label: 'Lotta clandestina', sub: 'Scommetti sulla tua squadra in una lotta nel vicolo.', act: startFight },
    ];
    if (!st().blaster) opts.push({ icon: '🎯', label: `Spara-vernice · 💰 ${BLASTER_PRICE}`, sub: 'Palle di vernice: le guardie colpite restano stordite per un po\'.', act: buyBlaster });
    opts.push({ icon: '🚶', label: 'Niente, grazie' });
    const i = await K().choose(fixer.name, opts.map(({ icon, label, sub }) => ({ icon, label, sub })), { actor: npc });
    if (opts[i]?.act) await opts[i].act(fixer, npc);
    else if (i >= 0) await K().say(fixer.name, ['Come vuoi. Sai dove trovarmi.'], { actor: npc, expression: 'smug' });
  }

  // ------------------------------------------------------------------ drawers
  function bindSearch(interiorId) {
    while (searchUnreg.length) searchUnreg.pop()();
    let spots = [];
    try { spots = ctx.world?.searchSpots?.(interiorId) || []; } catch { spots = []; }
    const searched = ((ctx.save.state.story ||= {}).searched ||= {});
    for (const s of spots) {
      const key = `${interiorId}.${s.id}`;
      const label = { drawer: 'Fruga nel cassetto', wardrobe: 'Fruga nell\'armadio', fridge: 'Apri il frigo', shelf: 'Fruga sullo scaffale', chest: 'Apri il baule' }[s.kind] || 'Fruga';
      searchUnreg.push(ctx.interact.register({
        id: 'story.search.' + key, pos: { x: s.x, z: s.z }, radius: 1.3, label, icon: '🔍',
        enabled: () => !searched[key],
        run: () => searchSpot(interiorId, s, key),
      }));
    }
  }

  async function searchSpot(interiorId, s, key) {
    const searched = ctx.save.state.story.searched;
    searched[key] = true; ctx.save.commit();
    try { ctx.player?.human?.face?.({ x: s.x, z: s.z }); await ctx.player?.human?.play?.('search', { loop: false }); ctx.player?.human?.play?.('idle'); } catch { /* optional */ }
    K().sfx('chest', { vol: 0.5 });
    // an owner who sees you is not pleased
    const pp = K().playerPos();
    let owner = null;
    for (const npc of ctx.actors?.npcs?.values?.() || []) {
      if (!npc?.object?.visible || npc.storyDef?.kind === 'clerk') continue;
      if (dist2(npc.object.position, pp) < 6.5) { owner = npc; break; }
    }
    if (owner && Math.random() < 0.65) {
      try { owner.faceTo?.(ctx.player?.object); } catch { /* optional */ }
      await K().say(owner.name || 'Proprietario', [pick(['Ehi! Giù le mani dalla mia roba!', 'Ma che fai?! Chiamo le guardie!', 'Ladro! Fuori da casa mia!'])], { actor: owner, expression: 'angry', gesture: 'point' });
      setWanted((st().wanted || 0) + 1, 'Ti hanno visto rubare!');
    }
    const n = Object.keys(searched).length;
    const loot = s.kind === 'fridge' ? (n % 2 ? { items: { pozione: 1 } } : null) : LOOT[(n * 7 + key.length) % LOOT.length];
    if (!loot) { await K().narrate(['Niente di interessante...']); return; }
    const parts = [];
    if (loot.coins) { ctx.story.economy.earn(loot.coins, 'search'); parts.push(`💰 ${loot.coins}`); }
    for (const [id, q] of Object.entries(loot.items || {})) { ctx.story.bag.add(id, q); parts.push(`${q}× ${ITEMS[id]?.name || id}`); }
    K().jingle('item');
    await K().narrate([`Hai trovato: ${parts.join(', ')}!`]);
  }

  // ------------------------------------------------------------------ scooters
  function buildScooters() {
    for (const [town, color] of SCOOTERS) {
      if (scooters.some(s => s.town === town)) continue;
      const p = K().poi(`${town}.scooter`); if (!p) continue;
      const v = buildScooter(ctx, color);
      v.object.position.set(p.x, K().groundY(p.x, p.z), p.z);
      v.object.rotation.y = p.facing || 0;
      ctx.story.fx.add(v.object, null, ctx.scene);
      const rec = { town, v, home: { x: p.x, z: p.z, facing: p.facing || 0 } };
      scooters.push(rec);
      ctx.interact.register({
        id: 'story.scooter.' + town, pos: () => (ctx.player?.vehicle === v ? null : v.object.position), radius: 1.6,
        label: 'Sali sullo scooter', icon: '🛵', priority: 0.5,
        enabled: () => !ctx.player?.vehicle && !ctx.story.grab.held && v.object.visible !== false,
        run: () => mount(rec),
      });
    }
  }
  function mount(rec) {
    if (!ctx.player?.mount) { K().toast('(Guida non disponibile)', { icon: '🛵' }); return; }
    try { ctx.player.mount(rec.v); } catch (e) { console.warn('[crime] mount', e); return; }
    K().sfx('scooter');
    const pp = K().playerPos();
    const seen = [...guards.values()].some(g => { const n = npcOf(g); return n?.object && g.stun <= 0 && dist2(n.object.position, pp) < 22 && canSee(n, pp); });
    if (seen && !rec.borrowed) setWanted((st().wanted || 0) + 1, 'Furto di scooter!');
    else K().toast('Brum brum! A per scendere.', { icon: '🛵' });
    rec.borrowed = true;
  }
  ctx.interact.register({
    id: 'story.scooter.off', pos: () => (ctx.player?.vehicle?.kind === 'scooter' ? K().playerPos() : null), radius: 1, priority: 5,
    label: 'Scendi', icon: '🛵', enabled: () => ctx.player?.vehicle?.kind === 'scooter',
    run: () => { try { ctx.player.mount(null); } catch { /* optional */ } },
  });

  // ------------------------------------------------------------------ public API
  const crime = {
    get wanted() { return st().wanted || 0; },
    get job() { return job ? { kind: job.kind, title: job.title, goal: job.goal, target: job.target, time: job.time ?? null } : null; },
    get hasBlaster() { return !!st().blaster; },
    get jobsDone() { return st().jobsDone || 0; },
    addWanted(n = 1, reason) { setWanted((st().wanted || 0) + n, reason); },
    clearWanted(silent = false) {
      if (!st().wanted) return;
      if (silent) { st().wanted = 0; calm = 0; ctx.save.commit(); try { ctx.ui?.hud?.setWanted?.(0); } catch { /* optional */ } ctx.bus.emit('wanted:change', { level: 0 }); }
      else setWanted(0);
      for (const g of guards.values()) if (g.state === 'chase' || g.state === 'search') g.state = 'return';
    },
    /** End the current job as failed (blackout, arrest). onlyLoot: only theft/delivery lose their goods. */
    abortJob(text, onlyLoot = false) {
      if (!job) return;
      if (onlyLoot && !['theft', 'delivery'].includes(job.kind)) return;
      endJob(false, text);
    },
    hitTest, fire,
    fixers: FIXERS,
    guards,
    scooters,
    /** Debug helpers. */
    debug: { startJob: async (kind, fixerId = 'fixer.faina') => { const f = FIXERS.find(x => x.id === fixerId); const fn = { delivery: startDelivery, theft: startTheft, race: startRace, fight: startFight }[kind]; if (f && fn && !job) await fn(f, ctx.story.npcs.get(f.id)); return crime.job; }, rob: () => job?.stall && robStall(job.stall), endJob },
  };

  // ---- NPC definitions: fixers, guards, market vendors
  for (const f of FIXERS) {
    ctx.story.npcs.define({
      id: f.id, name: f.name, look: lookFor(ctx, f.look, STORY_LOOKS[f.look]), at: f.at, kind: 'fixer', wander: null, label: 'Parla', icon: '🕶️',
      marker: c => (c.story.hooks.fixerMarker?.(f) || null),
      talk: (c, npc) => talkFixer(f, npc),
    });
  }
  for (const town of GUARD_TOWNS) {
    for (let n = 1; n <= 3; n++) {
      const id = `guard.${town}.${n}`;
      ctx.story.npcs.define({
        id, name: 'Guardia', look: lookFor(ctx, 'guard', n === 2 ? STORY_LOOKS.guard_f : STORY_LOOKS.guard), at: id, kind: 'guard',
        wander: { radius: 6, pause: [2, 5] }, label: 'Parla',
        talk: async (c, npc) => {
          if (st().wanted > 0) { const g = guards.get(id); if (g) { caught(g); return; } }
          await K().say('Guardia', [pick(['Circolare, circolare. Qui è tutto tranquillo.', 'La guardia cittadina veglia su di te. E su quello che fai.', 'Hai visto qualcuno di sospetto? No? Meglio così.'])], { actor: npc, gesture: 'nod' });
        },
        onSpawn: (c, npc) => { const p = K().poi(id); guards.set(id, { id, town, home: p ? { x: p.x, z: p.z } : null, state: 'patrol', stun: 0, retarget: 0 }); void npc; },
      });
    }
  }
  for (const town of ['fulgida', 'corallo']) {
    for (const n of [1, 2]) {
      const sid = `${town}.stall${n}`;
      ctx.story.npcs.define({
        id: 'vendor.' + sid, name: n === 1 ? 'Fruttivendola' : 'Venditore di souvenir', look: lookFor(ctx, 'vendor', STORY_LOOKS.vendor), at: sid, kind: 'vendor', wander: null, label: 'Parla',
        talk: async (c, npc) => {
          if (job?.kind === 'theft' && job.stall === sid && !job.grabbed) { await robStall(sid); return; }
          await K().say(n === 1 ? 'Fruttivendola' : 'Venditore', [n === 1 ? 'Frutta fresca! Mango, papaia, fichi d\'india!' : 'Souvenir di ' + TOWN_NAMES[town] + '! Calamite, conchiglie, cartoline!'], { actor: npc, expression: 'smile', gesture: 'wave' });
        },
      });
      ctx.interact.register({
        id: 'story.rob.' + sid, pos: () => { const p = K().poi(sid); return p ? { x: p.x + Math.sin(p.facing || 0) * 1.2, z: p.z + Math.cos(p.facing || 0) * 1.2 } : null; }, radius: 1.8,
        label: 'Arraffa l\'incasso', icon: '💰', priority: 2,
        enabled: () => job?.kind === 'theft' && job.stall === sid && !job.grabbed, run: () => robStall(sid),
      });
    }
  }

  // ---- loops & events
  ctx.loop.add(function storyCrime(dt) {
    fireT -= dt; grace -= dt;
    updateShots(dt);
    if (ctx.battle?.active || ctx.busy.has('battle')) return;
    if (ctx.input?.pressed?.('blaster')) fire();
    if (!arresting && !ctx.busy.has('scene') && !ctx.busy.has('dialog')) updateGuards(dt);
    updateJob(dt);
  }, ctx.ORDER.systems);

  ctx.bus.on('interior:enter', ({ id } = {}) => { if (id) bindSearch(id); });
  ctx.bus.on('interior:exit', () => { while (searchUnreg.length) searchUnreg.pop()(); });
  ctx.bus.on('area:enter', () => { buildScooters(); for (const id of [...extras]) { const g = guards.get(id); if (!st().wanted || !g) removeExtra(id); } });
  ctx.bus.on('game:start', () => {
    buildScooters();
    try { ctx.ui?.hud?.setWanted?.(st().wanted || 0); ctx.ui?.controls?.setBlaster?.(!!st().blaster); } catch { /* ui optional */ }
    if (st().wanted) ctx.bus.emit('wanted:change', { level: st().wanted });
  });
  ctx.bus.on('game:ready', () => { try { ctx.ui?.controls?.setBlaster?.(!!st().blaster); } catch { /* optional */ } });
  return crime;
}
