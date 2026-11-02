// Debug hooks: window.__valmora (only with ?debug). Headless scenario scripts drive the game with
// step() because requestAnimationFrame does not run reliably headless or in hidden tabs.
import * as THREE from 'three';

export function createDebug(ctx, expose) {
  let resolveReady;
  const ready = new Promise(r => { resolveReady = r; });
  const errors = [];
  if (expose) {
    window.addEventListener('error', e => errors.push(String(e.message || e)));
    window.addEventListener('unhandledrejection', e => errors.push('unhandled: ' + String(e.reason?.message || e.reason)));
  }
  const dbg = {
    ctx, THREE, ready, isReady: false, errors,
    markReady() { if (!dbg.isReady) { dbg.isReady = true; resolveReady(ctx); } },
    step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) ctx.loop.tick(dt); ctx.loop.render(); return ctx.loop.t; },
    advance(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) ctx.loop.tick(dt); return ctx.loop.t; },
    render() { ctx.loop.render(); },
    freeze(v = true) { if (v) ctx.loop.stop(); else ctx.loop.start(); },
    start(newGame = false) { return ctx.startGame?.(newGame); },
    teleport(x, z) {
      if (typeof x === 'string') { const p = ctx.world?.poi?.(x); if (!p) { console.warn('[debug] unknown poi', x); return null; } z = p.z; x = p.x; }
      if (ctx.player?.teleport) ctx.player.teleport(x, z);
      else { const o = ctx.cameraRig.followed; if (o) o.position.set(x, ctx.world?.groundY?.(x, z) ?? 0, z); }
      ctx.cameraRig.snap();
      return { x, z };
    },
    setTime(h, day) { ctx.time.set(h, day); return ctx.time.format(); },
    give(id, n = 1) {
      if (id === 'coins') return ctx.story?.economy?.earn?.(n, 'debug') ?? console.warn('[debug] story not loaded');
      return ctx.story?.bag?.add?.(id, n) ?? console.warn('[debug] story not loaded');
    },
    battle(speciesId, level = 5) { return ctx.creatures?.encounters?.force?.(speciesId, level) ?? console.warn('[debug] creatures not loaded'); },
    quality(t) { ctx.quality.set(t, { persist: false }); return ctx.quality.tier; },
    snapshot(type = 'image/png') { ctx.loop.render(); return ctx.renderer.domElement.toDataURL(type); },
    logEvents(v = true) { ctx.bus.log = v; },
    register(name, fn) { if (name in dbg) console.warn('[debug] overriding', name); dbg[name] = fn; },
    info() {
      const r = ctx.renderer.info;
      return {
        tier: ctx.quality.tier, calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures,
        loopT: +ctx.loop.t.toFixed(3), frame: ctx.loop.frame, viewport: { ...ctx.viewport }, area: ctx.world?.area ?? null,
        busy: ctx.busy.tags, errors: errors.length, time: ctx.time.format(),
        modules: Object.fromEntries(['world', 'actors', 'player', 'creatures', 'battle', 'story', 'romance', 'ui', 'game'].map(k => [k, !!ctx[k]])),
      };
    },
  };
  ctx.bus.on('game:ready', () => dbg.markReady());
  if (expose) window.__valmora = dbg;
  return dbg;
}
