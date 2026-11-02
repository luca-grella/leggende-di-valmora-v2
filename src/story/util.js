// Story-private helpers: POI lookup (with the sandbox test layout), loop-time waits and tweens,
// lazy access to the creatures data (monsters are built with the creatures area's own code),
// area → island mapping, small maths. Nothing here touches other areas at import time.
import * as THREE from 'three';

/** area id → island id (mirror of world/map.js, so the story works even without the world). */
export const AREA_ISLAND = {
  alba: 'aurora', petalo: 'aurora', fulgida: 'aurora', spiaggia_alba: 'aurora', r1: 'aurora', r2: 'aurora',
  muschio: 'giada', r3: 'giada', fosco: 'nebbia', r4: 'nebbia', grotta_sussurro: 'nebbia',
  cristallo: 'gelida', r5: 'gelida', santuario: 'gelida', grotta_cristallo: 'gelida',
  corallo: 'coralline', r6: 'coralline', grotta_marina: 'coralline',
  sole: 'sole', r7: 'sole', grotta_vulcano: 'sole', ramata: 'ramato', r8: 'ramato',
};
export const TOWN_NAMES = {
  alba: 'Borgo Alba', petalo: 'Villa Petalo', fulgida: 'Città Fulgida', muschio: 'Borgo Muschio', fosco: 'Castelfosco',
  cristallo: 'Borgo Cristallo', corallo: 'Porto Corallo', sole: 'Baia del Sole', ramata: 'Rocca Ramata',
};
export const TOWNS = Object.keys(TOWN_NAMES);
const INTERIOR_HEADS = ['home', 'lab', 'center', 'shop', 'house', 'osteria', 'depot'];

export const dist2 = (a, b) => Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.z ?? 0) - (b?.z ?? 0));
export const pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];
export const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/** Is this POI id inside an interior (e.g. 'lab.alba.table', 'house.corallo.2.owner')? */
export const isInteriorPoi = id => typeof id === 'string' && INTERIOR_HEADS.includes(id.split('.')[0]);
/** Interior id of an interior POI ('house.alba.3.owner' → 'house.alba.3', 'home.player.door' → 'home.player'). */
export function interiorOf(id) {
  if (!isInteriorPoi(id)) return null;
  const p = id.split('.');
  if (p[0] === 'house') return p.slice(0, 3).join('.');
  return p.slice(0, 2).join('.');
}
/** Area id a POI belongs to ('alba.plaza' → 'alba', 'shop.fulgida.counter' → 'fulgida', 'home.player' → 'alba'). */
export function areaOfPoi(id) {
  if (typeof id !== 'string') return null;
  const p = id.split('.');
  if (p[0] === 'home') return 'alba';
  if (isInteriorPoi(id)) return p[1];
  if (p[0] === 'guard') return p[1];
  if (AREA_ISLAND[p[0]]) return p[0];
  return null;
}

/** Story toolkit bound to ctx. */
export function createKit(ctx) {
  const warned = new Set();
  const timers = [];            // {t, resolve}
  const tweens = [];            // {t, dur, fn, ease, resolve}
  let now = 0;

  ctx.loop.add(function storyTimers(dt) {
    now += dt;
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].t <= now) { const r = timers[i].resolve; timers.splice(i, 1); r(); }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      try { tw.fn(tw.ease(tw.t), tw.t); } catch (e) { console.warn('[story] tween', e); tw.t = 1; }
      if (tw.t >= 1) { tweens.splice(i, 1); tw.resolve(); }
    }
  }, ctx.ORDER.systems - 2);

  const easeIO = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const K = {
    get now() { return now; },
    /** World/test-layout POI → {x, y, z, facing} | null. Accepts ids, {x,z} objects and functions. */
    poi(id) {
      if (!id) return null;
      if (typeof id === 'function') { try { return id() || null; } catch { return null; } }
      if (typeof id === 'object') return id;
      let p = null;
      try { p = ctx.world?.poi?.(id) || null; } catch { p = null; }
      if (!p && K.layout) p = K.layout[id] || null;
      if (!p && ctx.isDebug && !warned.has(id)) { warned.add(id); console.info('[story] POI not available yet:', id); }
      return p;
    },
    pois(prefix) {
      let list = [];
      try { list = ctx.world?.pois?.(prefix) || []; } catch { list = []; }
      if (!list.length && K.layout) list = Object.entries(K.layout).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => ({ id: k, ...v }));
      return list;
    },
    /** Sandbox-only fallback layout (set by story/index.js when the world has no POIs). */
    layout: null,
    groundY(x, z) { try { return ctx.world?.groundY?.(x, z) ?? 0; } catch { return 0; } },
    islandOf(areaId) { return ctx.world?.areaDef?.(areaId)?.island || AREA_ISLAND[areaId] || null; },
    islandOfPoi(id) { return K.islandOf(areaOfPoi(id)); },
    /** Current island of the player. */
    playerIsland() {
      const a = ctx.world?.area || ctx.save.state.player?.area || 'alba';
      return K.islandOf(a) || 'aurora';
    },
    playerPos() { return ctx.player?.position || ctx.player?.object?.position || ctx.cameraRig?.followed?.position || null; },
    /** Loop-time wait (pauses with the loop; headless tests drive it with step()). */
    wait(sec) { return new Promise(resolve => timers.push({ t: now + Math.max(0, sec), resolve })); },
    /** Resolve when fn() is truthy (checked every frame) or after `max` seconds. */
    until(fn, max = 30) {
      return new Promise(resolve => {
        const t0 = now;
        const check = () => { let ok = false; try { ok = fn(); } catch { ok = false; } if (ok || now - t0 > max) { resolve(ok); return; } timers.push({ t: now, resolve: check }); };
        check();
      });
    },
    tween(dur, fn, ease = easeIO) { return new Promise(resolve => tweens.push({ t: 0, dur: Math.max(1e-3, dur), fn, ease, resolve })); },
    say(speaker, lines, opts) { return ctx.story?.dialogue?.say(speaker, lines, opts) ?? Promise.resolve(); },
    choose(title, options, opts) { return ctx.story?.dialogue?.choose(title, options, opts) ?? Promise.resolve(-1); },
    toast(text, o) { try { ctx.ui?.toast?.(text, o); } catch (e) { console.warn(e); } if (!ctx.ui && ctx.isDebug) console.info('[toast]', text); },
    banner(t, s) { try { ctx.ui?.banner?.(t, s); } catch (e) { console.warn(e); } if (!ctx.ui && ctx.isDebug) console.info('[banner]', t, s || ''); },
    sfx(name, o) { try { ctx.audio?.sfx?.(name, o); } catch { /* audio optional */ } },
    jingle(name) { try { ctx.audio?.jingle?.(name); } catch { /* audio optional */ } },
    haptic(p) { try { ctx.haptic?.(p); } catch { /* optional */ } },
    /** Push a busy tag for the duration of fn. */
    async busy(tag, fn) { const rel = ctx.busy.push(tag); try { return await fn(); } finally { rel(); } },
    /** Wait until no battle is running (battles may release their busy tag a moment after battle:end). */
    afterBattle() { return K.until(() => !ctx.busy.has('battle') && !ctx.battle?.active, 20); },
    // ---- creatures data (lazy, tolerant) ----
    lib: null,
    async loadLib() {
      try {
        const [m, s] = await Promise.all([import('../creatures/monster.js'), import('../creatures/species.js')]);
        K.lib = { ...m, SPECIES: s.SPECIES };
      } catch (e) { console.warn('[story] creatures data unavailable, using fallbacks', e); K.lib = null; }
    },
    species(id) { return K.lib?.SPECIES?.[id] || null; },
    speciesName(id) { return K.species(id)?.name || (id ? id[0].toUpperCase() + id.slice(1) : '?'); },
    /** Evolved form for trainer teams: evolve while level ≥ evolution level + 2. */
    formFor(id, level) {
      let s = id, guard = 0;
      while (guard++ < 4) { const e = K.species(s)?.evo; if (e && level >= e.level + 2) s = e.to; else break; }
      return s;
    },
    /** A Monster built by the creatures area's createMonster (uid normalised), or a minimal fallback. */
    monster(species, level) {
      let m = null;
      try { m = K.lib?.createMonster?.(species, level) || null; } catch (e) { console.warn('[story] createMonster', e); }
      if (!m) m = { species, level, xp: level ** 3, hp: 10 + level * 3, moves: [], nickname: null };
      if (!m.uid) m.uid = m.id || (crypto.randomUUID ? crypto.randomUUID() : 'm' + Math.random().toString(36).slice(2));
      return m;
    },
    maxHp(m) { try { return K.lib?.maxHp?.(m) ?? m.maxHp ?? m.hp; } catch { return m.hp; } },
    monName(m) { try { return K.lib?.nameOf?.(m) || m.nickname || K.speciesName(m.species); } catch { return m.species; } },
    party() { return ctx.creatures?.team?.party || ctx.save.state.creatures?.party || []; },
    topLevel() { const p = K.party(); return p.length ? Math.max(...p.map(m => m.level || 1)) : 5; },
    hasAlive() { const p = K.party(); return p.some(m => (m.hp ?? 1) > 0); },
    caughtCount() { const c = ctx.creatures?.dex?.countCaught?.(); return c ?? Object.keys(ctx.save.state.creatures?.caught || {}).length; },
    seenCount() { const c = ctx.creatures?.dex?.countSeen?.(); return c ?? Object.keys(ctx.save.state.creatures?.seen || {}).length; },
    hasCaught(sp) {
      const c = ctx.creatures?.dex?.caught || ctx.save.state.creatures?.caught || {};
      if (c instanceof Set ? c.has(sp) : c[sp]) return true;
      const all = [...K.party(), ...(ctx.creatures?.team?.box || ctx.save.state.creatures?.box || [])];
      return all.some(m => m?.species === sp);
    },
    hasSeen(sp) { const s = ctx.creatures?.dex?.seen || ctx.save.state.creatures?.seen || {}; return (s instanceof Set ? s.has(sp) : !!s[sp]) || K.hasCaught(sp); },
    confirm(text, o) { return ctx.ui?.confirm ? ctx.ui.confirm(text, o) : Promise.resolve(true); },
    narrate(lines) { return ctx.story?.dialogue?.narrate(lines) ?? Promise.resolve(); },
    /** Smoothly move the camera to an explicit shot (no-op without the rig). */
    shot(position, target, { fov = 35, dur = 0.8, ease = 'inOut' } = {}) {
      ctx.story?.dialogue?.invalidate?.();
      try { return ctx.cameraRig?.shot?.({ position: new THREE.Vector3(position.x, position.y, position.z), target: new THREE.Vector3(target.x, target.y, target.z), fov }, { dur, ease }) || Promise.resolve(); } catch (e) { console.warn('[story] shot', e); return Promise.resolve(); }
    },
    /**
     * Frame a subject box (width across the view, height) from a horizontal direction `dir` (unit, subject → camera)
     * and an elevation, fitting both portrait and landscape screens; widens the FOV instead of backing out past
     * `maxDist` (small rooms). Returns the shot promise.
     */
    frame(center, dir, { width = 1.5, height = 1.2, elev = 20, fov = 36, maxDist = 99, dur = 0.8, ease = 'inOut' } = {}) {
      const aspect = ctx.viewport?.aspect || (innerWidth / Math.max(1, innerHeight));
      const e = (elev * Math.PI) / 180;
      let f = fov, d = 0;
      for (let i = 0; i < 12; i++) {
        const vf = (f * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
        d = 1.12 * Math.max((width / 2) / Math.tan(hf / 2), (height / 2) / Math.tan(vf / 2));
        if (d <= maxDist || f >= 64) break;
        f += 4;
      }
      d = Math.min(d, Math.max(maxDist, 1));
      const pos = { x: center.x + dir.x * Math.cos(e) * d, y: center.y + Math.sin(e) * d, z: center.z + dir.z * Math.cos(e) * d };
      return K.shot(pos, center, { fov: f, dur, ease });
    },
    /** A Velmon model from the creatures area (null when not available). */
    velmon(species, opts) { try { return ctx.creatures?.createModel?.(species, opts) || null; } catch (e) { console.warn('[story] createModel', species, e); return null; } },
    /** Human of an Npc or a Human. */
    humanOf(a) { return a?.human || a || null; },
    objOf(a) { return a?.object || a?.human?.object || (a?.isObject3D ? a : null); },
    v3: (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z),
  };
  return K;
}
