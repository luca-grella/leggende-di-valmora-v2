// Creatures area entry point (contract: docs/ARCHITECTURE.md "Creatures & Battle API").
// Data (species, moves, types), procedural Velmon models + capture spheres, thumbnails, team/Box, Velmondex,
// starter, level-ups (also the Shift+L / triple-tap cheat) and evolutions outside battles, and wild encounters in
// tall grass / caves on the `systems` loop.
import { SPECIES, MOVES, TYPES, TYPE_COLORS, CHART, effectiveness, STARTERS, PREVO } from './species.js';
import { createMonster, nameOf, gainXp, xpForLevel, MAX_LEVEL, learnMove, pendingEvolution, maxHp, stats, normalize } from './monster.js';
import { buildVelmon, speciesHeight } from './model.js';
import { buildSphere } from './sphere.js';
import { createTeam, creaturesState } from './team.js';
import { createDex } from './dex.js';
import { createThumbnails } from './thumbs.js';
import { ENCOUNTERS, rollEncounter } from './encounters.js';
import { VELMON_ANIMS } from './anims.js';
import { playEvolution } from '../battle/evolution.js';

/** @param {any} ctx */
export function init(ctx) {
  const thumbs = createThumbnails(ctx);
  const team = createTeam(ctx);
  const dex = createDex(ctx);
  let levelling = false;

  const say = async (text) => {
    if (ctx.ui?.say) return ctx.ui.say('', text);
    ctx.ui?.toast?.(text);
  };

  /** Ask which move to forget (outside battles). */
  async function askLearn(mon, moveId) {
    const name = nameOf(mon), mv = MOVES[moveId];
    if (!ctx.ui?.choose) { mon.moves.shift(); mon.moves.push(moveId); return; }
    await say(`${name} vuole imparare ${mv.name}, ma conosce già 4 mosse.`);
    const opts = mon.moves.map(id => ({ label: MOVES[id]?.name || id, sub: `${MOVES[id]?.type} · Pot. ${MOVES[id]?.power}` }));
    opts.push({ label: `Non imparare ${mv.name}`, icon: '✖' });
    const i = await ctx.ui.choose(`Quale mossa deve dimenticare ${name}?`, opts, { cancel: false });
    if (i >= 0 && i < mon.moves.length) {
      const old = MOVES[mon.moves[i]]?.name;
      learnMove(mon, moveId, i);
      await say(`1, 2 e... puf! ${name} ha dimenticato ${old} e ha imparato ${mv.name}!`);
    } else await say(`${name} non ha imparato ${mv.name}.`);
  }

  const creatures = {
    SPECIES, MOVES, TYPES, TYPE_COLORS, CHART, effectiveness, STARTERS, PREVO, VELMON_ANIMS, ENCOUNTERS,
    /** Monster helpers for other areas (story builds trainer teams with these). */
    createMonster, nameOf, maxHp, stats, xpForLevel, speciesHeight,
    createModel: (speciesId, opts) => buildVelmon(ctx, speciesId, opts),
    createSphere: (kind = 'sfera') => buildSphere(ctx, kind),
    thumbnail: (speciesId, size = 128) => thumbs.get(speciesId, size),
    thumbs,
    team, dex,

    /** The starter from Prof.ssa Quercia (Lv 5). */
    giveStarter(speciesId) {
      const m = createMonster(SPECIES[speciesId] ? speciesId : 'germoglio', 5);
      creaturesState(ctx).starter = m.species;
      dex.markCaught(m.species);
      team.add(m);
      ctx.bus.emit('velmon:caught', { species: m.species, level: m.level, isNew: true, starter: true });
      return m;
    },

    /** +n levels with messages, new moves and the evolution if due (the Shift+L / triple-tap cheat). */
    async levelUp(mon = team.lead(), n = 1) {
      if (!mon) return;
      normalize(mon);
      const target = Math.min(MAX_LEVEL, mon.level + Math.max(1, n | 0));
      if (target <= mon.level) { ctx.ui?.toast?.(`${nameOf(mon)} è già al livello massimo!`); return; }
      const events = gainXp(mon, xpForLevel(target) - mon.xp, { autoLearn: false });
      ctx.save.commit();
      ctx.bus.emit('team:change', {});
      for (const e of events) {
        if (e.kind === 'level') {
          ctx.bus.emit('velmon:levelup', { uid: mon.uid, species: mon.species, level: e.level });
          if (e.level === target) {
            ctx.audio?.jingle?.('levelup');
            ctx.ui?.toast?.(`${nameOf(mon)} sale al livello ${e.level}!`, { icon: '⬆️' });
          }
        } else if (e.kind === 'move') ctx.ui?.toast?.(`${nameOf(mon)} impara ${e.move}!`, { icon: '✨' });
        else if (e.kind === 'learn') await askLearn(mon, e.id);
      }
      ctx.save.commit();
      ctx.bus.emit('team:change', {});
      if (pendingEvolution(mon) && !ctx.battle?.active) await creatures.evolve(mon);
    },

    /** Evolution scene for a Velmon that reached its level (outside battles). Resolves true if it evolved. */
    async evolve(mon) {
      const to = mon && pendingEvolution(mon);
      if (!to) return false;
      await playEvolution(ctx, mon, to);
      return mon.species === to;
    },

    encounters: null,
  };

  // ------------------------------------------------------------------ wild encounters ----
  const E = {
    enabled: true,
    /** chance per check and seconds of movement between checks (GDD: ~9% every ~1.2 s) */
    rate: 0.09, interval: 1.2,
    /** tests / sandboxes: treat everywhere as this area id */
    zoneOverride: null,
    cool: 2, moveT: 0, last: null, pending: false,
    cooldown(sec = 3) { E.cool = Math.max(E.cool, sec); E.moveT = 0; },
    /** Start a wild battle now. */
    async force(speciesId, level = 5) {
      if (!SPECIES[speciesId]) { console.warn('[creatures] unknown species', speciesId); return null; }
      if (!ctx.battle?.start) { console.warn('[creatures] battle area missing'); return null; }
      const mon = createMonster(speciesId, level);
      ctx.bus.emit('encounter', { species: speciesId, level: mon.level, area: ctx.world?.area ?? null, forced: true });
      return ctx.battle.start({ kind: SPECIES[speciesId].legendary ? 'legendary' : 'wild', foes: [mon] });
    },
    /** Roll the table of an area (does not start a battle). */
    roll: (areaId, night = !!ctx.time?.isNight) => rollEncounter(areaId, night),
  };
  creatures.encounters = E;

  async function trigger(zone) {
    const r = rollEncounter(zone, !!ctx.time?.isNight);
    if (!r) return;
    E.pending = true;
    try {
      const p = ctx.player, pos = p.position || p.object?.position;
      ctx.world?.rustle?.(pos.x, pos.z);
      ctx.audio?.sfx?.('grass_rustle');
      const mon = createMonster(r.species, r.level);
      ctx.bus.emit('encounter', { species: r.species, level: r.level, area: zone });
      const head = p.human?.head || p.object;
      try { ctx.ui?.marker?.('encounter', head, { icon: '!', color: '#ff5a5a' }); } catch { /* optional */ }
      ctx.audio?.sfx?.('alert');
      await ctx.battle.start({ kind: 'wild', foes: [mon] });
    } catch (e) { console.error('[creatures] encounter failed', e); }
    finally {
      try { ctx.ui?.removeMarker?.('encounter'); } catch { /* optional */ }
      E.pending = false;
      E.cooldown(3);
    }
  }

  ctx.loop.add(function encounters(dt) {
    if (!E.enabled || E.pending || !started) return;
    if (E.cool > 0) E.cool -= dt;
    const p = ctx.player, pos = p?.position || p?.object?.position;
    if (!pos) return;
    if (ctx.busy.is() || ctx.battle?.active || !ctx.battle?.start) { E.last = null; return; }
    if (!E.last) { E.last = { x: pos.x, z: pos.z }; return; }
    const d = Math.hypot(pos.x - E.last.x, pos.z - E.last.z);
    E.last.x = pos.x; E.last.z = pos.z;
    if (dt <= 0 || d / dt < 0.6 || d > 3) return;           // standing still, or a teleport
    E.moveT += dt;
    if (E.moveT < E.interval) return;
    E.moveT -= E.interval;
    if (E.cool > 0) return;
    const zone = E.zoneOverride || ctx.world?.encounterZoneAt?.(pos.x, pos.z);
    if (!zone || !ENCOUNTERS[zone]) return;
    if (!team.firstAlive()) return;
    if (Math.random() < E.rate) trigger(zone);
  }, ctx.ORDER?.systems ?? 10);

  let started = false;
  ctx.bus.on('game:start', () => { started = true; creaturesState(ctx); E.cooldown(2); E.last = null; });
  ctx.bus.on('save:loaded', () => creaturesState(ctx));

  // ------------------------------------------------------------------ cheat: lead +1 level ----
  ctx.bus.on('cheat:level', async () => {
    if (levelling || ctx.battle?.active) return;
    const lead = team.lead();
    if (!lead) { ctx.ui?.toast?.('Non hai ancora nessun Velmon!'); return; }
    levelling = true;
    try { await creatures.levelUp(lead, 1); } catch (e) { console.error('[creatures] level cheat', e); }
    finally { levelling = false; }
  });

  // ------------------------------------------------------------------ debug helpers ----
  ctx.debug?.register?.('velmon', (speciesId = 'germoglio', { x, z, facing = 0 } = {}) => {
    const m = buildVelmon(ctx, speciesId);
    const o = ctx.player?.object || ctx.cameraRig?.followed;
    const px = x ?? (o ? o.position.x + 1.5 : 0), pz = z ?? (o ? o.position.z : 0);
    m.object.position.set(px, ctx.world?.groundY?.(px, pz) ?? 0, pz);
    m.object.rotation.y = facing;
    ctx.scene.add(m.object);
    return m;
  });
  ctx.debug?.register?.('giveVelmon', (speciesId = 'germoglio', level = 5) => { const m = createMonster(speciesId, level); team.add(m); dex.markCaught(m.species); return m; });

  return creatures;
}
