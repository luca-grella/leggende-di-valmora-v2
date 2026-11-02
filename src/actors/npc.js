// NPC manager: spawn story/generic NPCs, wander around a home spot, daily schedules, the talk
// interactable (NPC and player turn to each other), UI markers and ambient villagers that populate a
// town on area:enter. Only the ~12 nearest NPCs in the current place are visible (draw-call budget).
// Contract: docs/ARCHITECTURE.md "Actors API" / "Npc".
import { randomLook } from './looks.js';

const MAX_VISIBLE = 12, VIEW_DIST = 46;
const NAMES_F = ['Giulia', 'Chiara', 'Francesca', 'Martina', 'Sara', 'Alessia', 'Federica', 'Anna', 'Paola', 'Teresa', 'Rita', 'Lina', 'Noemi', 'Carla'];
const NAMES_M = ['Marco', 'Luca', 'Giorgio', 'Paolo', 'Andrea', 'Matteo', 'Davide', 'Franco', 'Tonino', 'Pietro', 'Sergio', 'Nino', 'Bruno', 'Enzo'];
const LINES = {
  adult: [
    'Che bella giornata, vero?', 'Hai visto quanti Velmon si nascondono nell\'erba alta?', 'Il Centro Cura è sempre aperto, se ti serve.',
    'Dicono che di notte compaiano Velmon rarissimi…', 'Oggi il mare è calmo come l\'olio.', 'Ciao! Sei nuovo da queste parti?',
    'Alla Bottega hanno le Sfere in offerta, credo.', 'Che caldo! Quasi quasi vado in spiaggia.', 'Hai già sfidato il Campione del paese?',
    'Se ti perdi, segui la luce dorata: porta sempre dove devi andare.', 'Mio cugino ha preso un Velmon cromatico. O almeno così dice lui.',
  ],
  kid: ['Da grande voglio diventare Campione!', 'Mi fai vedere il tuo Velmon? Dai, solo un attimo!', 'Ho trovato una conchiglia enorme in spiaggia!', 'Facciamo una gara di corsa? …Ah, sei troppo veloce.'],
  elder: ['Ai miei tempi i Velmon erano più grandi, sai?', 'Ragazzo mio, riposati ogni tanto.', 'Questo paese era tutto campi, una volta.', 'Ogni sera guardo il tramonto da quella panchina. Ti consiglio di farlo anche tu.'],
};
const rand = (a, b) => a + Math.random() * (b - a);

export function createNpcs(ctx, actors) {
  const map = new Map();
  const ambientIds = new Set();
  let ambientArea = null, visT = 0, schedT = 0;

  const W = () => ctx.world;
  const playerPos = () => ctx.player?.position || ctx.cameraRig?.followed?.position || null;
  function resolveAt(at) {
    if (!at) return null;
    if (typeof at === 'string') { const p = W()?.poi?.(at); return p ? { x: p.x, z: p.z, facing: p.facing ?? 0 } : null; }
    if (Number.isFinite(at.x) && Number.isFinite(at.z)) return { x: at.x, z: at.z, facing: Number.isFinite(at.facing) ? at.facing : 0 };
    return null;
  }
  const inPlace = (npc) => (npc.interior || null) === (W()?.interior || null);

  // ------------------------------------------------------------------------------------------ spawn
  function spawn(def = {}) {
    const id = def.id || 'npc.' + Math.random().toString(36).slice(2, 8);
    if (map.has(id)) map.get(id).remove();
    const human = actors.createHuman(def.look || randomLook(id), { id, name: def.name || '' });
    ctx.scene.add(human.object);
    const S = human.spec;
    human.head.userData.markerY = (S.headR[1] * 1.05 + (human.look.hat ? 0.1 : 0.02)) * human.look.height - 0.1;
    const p = resolveAt(def.at);
    if (p) human.teleport(p.x, p.z, p.facing); else human.setVisible(false);

    let talkFn = def.talk || null, label = def.label || 'Parla', marker = def.marker || null;
    const icon = def.icon || '💬';
    let wander = null, frozen = false, removed = false, talking = false;
    let unregister = null;
    const npc = {
      id, name: def.name || '', human, object: human.object,
      interior: def.interior || null,
      home: p ? { ...p } : null,
      pendingAt: p ? null : def.at || null,
      schedule: Array.isArray(def.schedule) ? def.schedule : null,
      _schedAt: null, _wanderT: rand(1, 4), _markerOn: false, _dist: 0, _goto: false,
      get talking() { return talking; },
      get frozen() { return frozen; },
      get marker() { return marker; },
      setTalk(fn) { talkFn = fn || null; register(); },
      setLabel(t) { label = t || 'Parla'; register(); },
      setMarker(ic) { marker = ic || null; applyMarker(true); },
      /** {radius=4, pause:[2,6], speed} or null to stand still. */
      setWander(cfg) { wander = cfg ? { radius: 4, pause: [2, 6], ...cfg } : null; if (!wander && human.moving && !npc._goto) human.stop(); },
      get wander() { return wander; },
      /** Walk to a POI id or {x,z}; resolves true on arrival. Teleports when far away and off-screen. */
      goTo(target, { run = false, stopDist = 0.2, face = null } = {}) {
        const q = resolveAt(target);
        if (!q) return Promise.resolve(false);
        const pp = playerPos();
        if (!human.object.visible && (!pp || Math.hypot(pp.x - q.x, pp.z - q.z) > VIEW_DIST)) { human.teleport(q.x, q.z, q.facing); return Promise.resolve(true); }
        npc._goto = true;
        return human.moveTo(q, { run, stopDist, face: face ?? (typeof target === 'string' ? q.facing : null) }).finally(() => { npc._goto = false; });
      },
      /** Turn toward an Object3D / {x,z} / angle. */
      faceTo(t, o) { return human.face(t, o); },
      /** Stop wandering (e.g. while talking). */
      freeze(v = true) { frozen = !!v; if (frozen && human.moving && !npc._goto) human.stop(); },
      /** Place now (POI id or {x,z,facing}); becomes the new wander home. */
      place(at) { const q = resolveAt(at); if (q) { human.teleport(q.x, q.z, q.facing); npc.home = { ...q }; npc.pendingAt = null; } },
      /** Play a clip (shortcut to human.play). */
      play: (c, o) => human.play(c, o),
      /** Run the talk handler as if the player pressed A. */
      talk: () => talk(),
      remove() {
        if (removed) return; removed = true;
        unregister?.(); ctx.interact?.unregister?.('npc:' + id);
        try { ctx.ui?.removeMarker?.('npc:' + id); } catch { /* ui optional */ }
        if (map.get(id) === npc) map.delete(id);
        ambientIds.delete(id);
        human.dispose();
      },
      get removed() { return removed; },
    };
    if (def.wander) npc.setWander(def.wander);

    function register() {
      unregister?.(); unregister = null;
      if (!talkFn || removed || !ctx.interact?.register) return;
      unregister = ctx.interact.register({
        id: 'npc:' + id, label, icon, radius: 1.9, priority: 1,
        pos: () => (human.object.visible && human.object.parent ? human.object.position : null),
        lookAt: human.head,
        enabled: () => !!talkFn && !removed && human.object.visible && !talking,
        run: () => talk(),
      });
    }
    async function talk() {
      if (!talkFn || talking) return;
      talking = true;
      const wasFrozen = frozen;
      npc.freeze(true); human.stop();
      ctx.bus?.emit('npc:talk', { id });
      const pl = ctx.player, ph = pl?.human;
      try {
        await Promise.all([
          human.face(pl?.object || human.object.position, { dur: 0.35 }),
          ph ? (pl.face ? pl.face(human.object, { dur: 0.3 }) : ph.face(human.object, { dur: 0.3 })) : null,
        ]);
        if (ph) { human.lookAt(ph); if (pl.lookAt) pl.lookAt(human.head); else ph.lookAt(human); }
        await talkFn(npc);
      } catch (e) { console.error('[actors] npc talk', id, e); }
      finally {
        talking = false;
        if (!removed) { human.lookAt(null); human.talk(false); if (!wasFrozen) npc.freeze(false); npc._wanderT = rand(2, 5); }
        if (ph) { if (pl.lookAt) pl.lookAt(null); else ph.lookAt(null); }
      }
    }
    function applyMarker(force = false) {
      if (removed || !ctx.ui?.marker) return;
      if (marker && (force || !npc._markerOn)) { ctx.ui.marker('npc:' + id, human.head, { icon: marker }); npc._markerOn = true; }
      else if (!marker && npc._markerOn) { ctx.ui.removeMarker?.('npc:' + id); npc._markerOn = false; }
    }
    npc._applyMarker = applyMarker;
    register();
    map.set(id, npc);
    applyMarker();
    return npc;
  }

  // ------------------------------------------------------------------------------------------ ambient villagers
  function clearAmbient() { for (const id of [...ambientIds]) map.get(id)?.remove(); ambientIds.clear(); ambientArea = null; }
  /** Spawn `count` generic villagers wandering around the area's plaza (replaces the previous area's). */
  function ambient(areaId, count = 5) {
    if (!areaId) return [];
    if (ambientArea && ambientArea !== areaId) clearAmbient();
    if (ambientArea === areaId && ambientIds.size >= count) return [...ambientIds].map(id => map.get(id)).filter(Boolean);
    const centre = resolveAt(`${areaId}.plaza`) || resolveAt(`${areaId}.landmark`) || resolveAt(`${areaId}.arrive`);
    if (!centre) return [];
    ambientArea = areaId;
    const out = [];
    let seed = 0; for (const ch of areaId) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    for (let i = ambientIds.size; i < count; i++) {
      const look = randomLook(`${areaId}:${i}`, { sex: 'any', age: 'any' });
      const names = look.sex === 'f' ? NAMES_F : NAMES_M;
      const name = names[(seed + i * 7) % names.length];
      let x = centre.x, z = centre.z;
      for (let k = 0; k < 12; k++) {
        const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 6;
        const tx = centre.x + Math.cos(a) * r, tz = centre.z + Math.sin(a) * r;
        if (W()?.walkable?.(tx, tz) === false || W()?.isWater?.(tx, tz)) continue;
        x = tx; z = tz; break;
      }
      const lines = LINES[look.age] || LINES.adult;
      const id = `ambient.${areaId}.${i}`;
      const npc = spawn({
        id, name, look, at: { x, z, facing: Math.random() * Math.PI * 2 }, wander: { radius: 6, pause: [2.5, 7] },
        talk: async (n) => {
          const line = lines[Math.floor(Math.random() * lines.length)];
          n.human.setExpression(Math.random() < 0.6 ? 'smile' : 'grin');
          if (ctx.story?.dialogue?.say) await ctx.story.dialogue.say(name, [line], { actor: n.human, listener: ctx.player?.human });
          else if (ctx.ui?.say) { n.human.talk(true); await ctx.ui.say(name, line); n.human.talk(false); }
          n.human.setExpression('neutral', { dur: 0.5 });
        },
      });
      npc.home = { x: centre.x, z: centre.z, facing: 0 };
      ambientIds.add(id); out.push(npc);
    }
    return out;
  }
  ctx.bus?.on('area:enter', (e = {}) => {
    if (e.kind === 'town' && e.id) ambient(e.id, ctx.quality?.tier === 'low' ? 3 : 5);
    else if (ambientArea && e.id !== ambientArea) clearAmbient();
  });
  ctx.bus?.on('interior:enter', () => { for (const n of map.values()) if (n.pendingAt) n._retry = 0; });

  // ------------------------------------------------------------------------------------------ per frame
  const inWindow = (h, from, to) => (from <= to ? h >= from && h < to : h >= from || h < to);
  function update(dt) {
    const busy = ctx.busy?.is?.() || false;
    // pending POIs (interiors are built lazily)
    for (const n of map.values()) if (n.pendingAt && ((n._retry = (n._retry || 0) - dt) <= 0)) {
      n._retry = 0.5;
      const q = resolveAt(n.pendingAt);
      if (q) { n.human.teleport(q.x, q.z, q.facing); n.home = { ...q }; n.pendingAt = null; }
    }
    // schedules (1 Hz)
    schedT -= dt;
    if (schedT <= 0 && ctx.time) {
      schedT = 1;
      const h = ctx.time.hours;
      for (const n of map.values()) if (n.schedule && !n.talking) {
        const s = n.schedule.find(e => inWindow(h, e.from, e.to));
        if (s && s.at !== n._schedAt) {
          n._schedAt = s.at;
          const q = resolveAt(s.at);
          if (q) { n.home = { ...q }; n.goTo(s.at); }
        }
      }
    }
    // visibility: same place, near the player, the nearest MAX_VISIBLE
    visT -= dt;
    if (visT <= 0) {
      visT = 0.25;
      const pp = playerPos();
      const cand = [];
      for (const n of map.values()) {
        if (n.pendingAt || !inPlace(n)) { n._want = false; continue; }
        const d = pp ? Math.hypot(n.object.position.x - pp.x, n.object.position.z - pp.z) : 0;
        n._dist = d; n._want = d < VIEW_DIST;
        if (n._want) cand.push(n);
      }
      if (cand.length > MAX_VISIBLE) {
        cand.sort((a, b) => (a.talking ? -1e9 : a._dist) - (b.talking ? -1e9 : b._dist));
        for (let i = MAX_VISIBLE; i < cand.length; i++) cand[i]._want = false;
      }
      for (const n of map.values()) {
        if (n._want !== n.human.object.visible) n.human.setVisible(n._want);
        n._applyMarker?.();
      }
    }
    // wandering
    for (const n of map.values()) {
      const w = n.wander;
      if (!w || n.frozen || n.talking || n._goto || n.pendingAt || !n.home) continue;
      if (busy && n.human.object.visible && n._dist < 12) continue;     // don't stroll through a cutscene
      if (n.human.moving || n.human.clip !== 'locomotion') continue;
      n._wanderT -= dt;
      if (n._wanderT > 0) continue;
      const pause = w.pause || [2, 6];
      n._wanderT = rand(pause[0], pause[1]);
      if (Math.random() < 0.18 && n.human.object.visible) { n.human.play(Math.random() < 0.7 ? 'idle_look' : 'idle_stretch', { fade: 0.4 }); continue; }
      const R = w.radius ?? 4;
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
        const x = n.home.x + Math.cos(a) * r, z = n.home.z + Math.sin(a) * r;
        if (W()?.walkable?.(x, z) === false || W()?.isWater?.(x, z)) continue;
        if (Math.hypot(x - n.object.position.x, z - n.object.position.z) < 0.8) continue;
        n.human.moveTo({ x, z }, { speed: w.speed ?? rand(1.05, 1.45), stopDist: 0.25 });
        break;
      }
    }
  }

  return {
    map, spawn, update, ambient, clearAmbient,
    get: id => map.get(id) || null,
    remove: id => map.get(id)?.remove(),
  };
}
