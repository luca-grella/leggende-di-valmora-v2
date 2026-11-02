// Story NPC roster: every story-owned person (quest givers, Eclissi, trainers, guards, fixers, clerks,
// townsfolk with tips) is declared once with `define(def)` and spawned through the actors area only
// while the player is on that NPC's island (and while def.present(ctx) is true). Markers ('!' quest,
// '?' waiting, '★' champion…) are re-evaluated on story events.
//
// def: {id, name, look, at: poiId|{x,z,facing}, island?, interior?, wander?, schedule?, label?, icon?,
//       talk?: (ctx, npc, def) => Promise, marker?: (ctx) => icon|null, present?: (ctx) => bool, kind?}
import { interiorOf, isInteriorPoi, TOWNS } from './util.js';
import { STORY_LOOKS, lookFor, tintLook, SKINS } from './looks.js';

/** All defined story NPC defs (filled at runtime by chapters, side quests, trainers, crime, shops). */
export const STORY_NPCS = [];

const RESYNC_EVENTS = ['quest:start', 'quest:step', 'quest:complete', 'flag:set', 'trainer:beaten', 'settings:change', 'time:hour',
  'job:start', 'job:end', 'bag:change', 'velmon:caught', 'held:change', 'romance:stage'];

/** Townsfolk with tips and local colour (two per town, at T.npc5 / T.npc6). */
const TOWNSFOLK = {
  alba: [
    ['Teo', 'kid', ['Lo sai? Nell\'erba alta si nascondono i Velmon selvatici!', 'Se ti senti fortissimo, sfida il Campione vicino al pozzo.']],
    ['Signora Lena', 'mamma', ['Borgo Alba è piccolo, ma ha il tramonto più bello dell\'arcipelago.', 'Dalla spiaggia parte il traghetto per Porto Corallo.']],
  ],
  petalo: [
    ['Giardiniere Ugo', 'fisher', ['I fiori di Villa Petalo profumano fino al mare.', 'I Farfallina adorano i campi a est, sul Sentiero dei Fiori.']],
    ['Marta', 'vendor', ['Dal molo partono le barche per l\'Altopiano Ramato... quando il mare lo permette.']],
  ],
  fulgida: [
    ['Sandro', 'clerk', ['Città Fulgida non dorme mai. Occhio alle guardie in blu: vedono tutto!', 'Nei vicoli gira gente strana. Io non ci andrei.']],
    ['Rita', 'vendor', ['Al mercato trovi di tutto. Ma tieni d\'occhio il portafoglio.']],
  ],
  muschio: [
    ['Ranger Ivo', 'fisher', ['La giungla di Giada è piena di Fogliolo. Sembrano cespugli finché non ti mordono!', 'Le rovine del tempio? Dicono che di notte si sentano voci...']],
    ['Nora', 'irene', ['Gli alberi qui hanno più di mille anni.']],
  ],
  fosco: [
    ['Ettore', 'ginepro', ['La nebbia di Castelfosco nasconde gli Ombrale. Di notte sono il doppio.', 'Il castello in rovina era dei signori della brughiera.']],
    ['Lia la Pastora', 'vendor', ['Le pecore? No, sono Lanuvo. Più soffici, meno belanti.']],
  ],
  cristallo: [
    ['Piero', 'fisher', ['Copriti bene: lassù al Santuario fa un freddo cane.', 'Di notte, sopra il lago ghiacciato, si vede l\'aurora.']],
    ['Alice', 'irene', ['I Nevino fanno pupazzi di neve per gioco. Giuro!']],
  ],
  corallo: [
    ['Capitano Bruno', 'fisher', ['Il porto più bello del sud! Le palafitte le ha costruite mio nonno.', 'Nelle lagune trovi Goccino e Granchietto a volontà.']],
    ['Elena', 'vendor', ['Il pesce fresco arriva all\'alba. I turisti arrivano a mezzogiorno.']],
  ],
  sole: [
    ['Dario', 'kid', ['Il vulcano brontola ma non erutta da cent\'anni. Credo.', 'La sabbia nera scotta a mezzogiorno: cammina sui bordi!']],
    ['Chiara', 'irene', ['I Fiammello si scaldano sulle rocce laviche. Non toccarli!']],
  ],
  ramata: [
    ['Gino il Vecchio', 'ginepro', ['Nel canyon gli echi rispondono. A volte anche i Sabbiolo.']],
    ['Irma', 'vendor', ['Qui l\'acqua vale più dell\'oro. E i cactus... meglio guardarli da lontano.']],
  ],
};

export function createRoster(ctx) {
  const K = () => ctx.story.kit;
  const defs = new Map();
  const live = new Map();            // id → Npc
  const markers = new Map();         // id → icon
  let started = false, island = null, syncQueued = false;

  function islandOf(def) {
    if (def.island) return def.island;
    const at = typeof def.at === 'string' ? def.at : null;
    return at ? K().islandOfPoi(at) : null;
  }

  async function runTalk(def) {
    if (!def.talk) return;
    const npc = live.get(def.id) || null;
    ctx.bus.emit('story:talk', { id: def.id });
    try { await def.talk(ctx, npc, def); } catch (e) { console.error('[story] talk failed', def.id, e); }
    roster.refresh();
  }

  function spawn(def) {
    const actors = ctx.actors;
    if (!actors?.spawnNpc) return null;
    const interior = def.interior || (typeof def.at === 'string' && isInteriorPoi(def.at) ? interiorOf(def.at) : null);
    let at = def.at;
    if (typeof at === 'string' && !interior) {
      const p = K().poi(at);
      if (!p) return null;                       // POI not there (yet): retry on the next sync
      at = { x: p.x + (def.offset?.x || 0), z: p.z + (def.offset?.z || 0), facing: def.facing ?? p.facing ?? 0 };
    }
    try {
      const npc = actors.spawnNpc({
        id: def.id, name: def.name, look: def.look, at, wander: def.wander ?? null, schedule: def.schedule,
        talk: def.talk ? () => runTalk(def) : undefined, label: def.label || 'Parla', icon: def.icon,
        marker: null, interior: interior || undefined,
      });
      if (npc) { npc.storyDef = def; def.onSpawn?.(ctx, npc); }
      return npc || null;
    } catch (e) { console.warn('[story] spawnNpc failed', def.id, e); return null; }
  }

  function despawn(id) {
    const npc = live.get(id);
    live.delete(id); markers.delete(id);
    try { if (npc?.remove) npc.remove(); else ctx.actors?.removeNpc?.(id); } catch (e) { console.warn('[story] removeNpc', id, e); }
    try { ctx.ui?.removeMarker?.('npc:' + id); } catch { /* ui optional */ }
  }

  function setMarker(id, npc, icon) {
    if (markers.get(id) === icon) return;
    markers.set(id, icon);
    try { npc?.setMarker?.(icon || null); } catch (e) { console.warn('[story] marker', e); }
  }

  const roster = {
    defs, live, list: STORY_NPCS,
    define(def) {
      if (!def?.id) return;
      if (defs.has(def.id)) { const i = STORY_NPCS.indexOf(defs.get(def.id)); if (i >= 0) STORY_NPCS.splice(i, 1); }
      defs.set(def.id, def); STORY_NPCS.push(def);
      if (started) roster.queue();
    },
    undefine(id) { despawn(id); const d = defs.get(id); defs.delete(id); const i = STORY_NPCS.indexOf(d); if (i >= 0) STORY_NPCS.splice(i, 1); },
    get: id => live.get(id) || null,
    def: id => defs.get(id) || null,
    /** Run an NPC's talk handler (also works headless, without actors). */
    talk(id) { const d = defs.get(id); return d ? runTalk(d) : Promise.resolve(); },
    /** Where an NPC is (live position, else its POI). */
    posOf(id) {
      const n = live.get(id);
      if (n?.object) return n.object.position;
      const d = defs.get(id);
      return d ? K().poi(d.at) : null;
    },
    queue() { if (syncQueued) return; syncQueued = true; queueMicrotask(() => { syncQueued = false; roster.sync(); }); },
    /** Spawn/despawn for the current island and story state, then markers. */
    sync() {
      if (!started) return;
      island = K().playerIsland();
      for (const def of defs.values()) {
        let want = (def.always || !islandOf(def) || islandOf(def) === island);
        if (want && def.present) { try { want = !!def.present(ctx); } catch (e) { console.warn('[story] present()', def.id, e); want = false; } }
        const has = live.has(def.id);
        if (want && !has) { const npc = spawn(def); if (npc) live.set(def.id, npc); }
        else if (!want && has) despawn(def.id);
      }
      roster.refresh();
    },
    /** Re-evaluate markers only. */
    refresh() {
      for (const [id, npc] of live) {
        const def = defs.get(id);
        let icon = null;
        try { icon = def?.marker?.(ctx) || null; } catch (e) { console.warn('[story] marker()', id, e); }
        setMarker(id, npc, icon);
      }
    },
    /** Move an NPC back to its POI (after a walk-up or a chase). */
    async home(id, { run = false } = {}) {
      const n = live.get(id), d = defs.get(id);
      if (!n || !d || d.interior) return;
      const p = K().poi(d.at); if (!p) return;
      try { await (n.goTo ? n.goTo({ x: p.x, z: p.z }, { run }) : n.human?.moveTo?.({ x: p.x, z: p.z }, { run })); } catch { /* optional */ }
      try { if (p.facing != null) await n.human?.face?.(p.facing); } catch { /* optional */ }
    },
    start() { started = true; roster.sync(); },
  };

  for (const e of RESYNC_EVENTS) ctx.bus.on(e, () => roster.queue());
  ctx.bus.on('area:enter', ({ island: isl } = {}) => { if (!isl || isl !== island) roster.queue(); else roster.refresh(); });
  return roster;
}

/** Define the generic story NPCs (townsfolk with tips). Called once from story/index.js. */
export function spawnStoryNpcs(ctx) {
  const roster = ctx.story.npcs;
  if (!roster) return;
  TOWNS.forEach((town, ti) => {
    (TOWNSFOLK[town] || []).forEach(([name, lookName, lines], i) => {
      const base = lookFor(ctx, lookName, STORY_LOOKS[lookName]);
      const look = tintLook(base, { skin: SKINS[(ti * 2 + i * 3) % SKINS.length] });
      roster.define({
        id: `folk.${town}.${i + 1}`, name, look, at: `${town}.npc${5 + i}`, kind: 'folk',
        wander: { radius: 3.5, pause: [3, 7] },
        talk: async (c, npc) => {
          const k = c.story.kit;
          const counts = (c.save.state.story.talkCount ||= {});
          const key = `folk.${town}.${i}`;
          const idx = counts[key] = (counts[key] || 0) + 1;
          await k.say(name, [lines[(idx - 1) % lines.length]], { actor: npc, gesture: idx % 2 ? 'talk_gesture' : 'nod', expression: 'smile' });
        },
      });
    });
  });
}
