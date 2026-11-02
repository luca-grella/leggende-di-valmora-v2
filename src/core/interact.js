// The single "context action" service. Any area registers interactables; every frame the best one
// in range of the player becomes `current` (shown on the UI A button) and runs on input 'a'.
// Scoring prefers higher priority, then things in front of the player, then distance; a small
// hysteresis keeps the current target from flickering between two close candidates.
import { Vector3 } from 'three';

export function createInteract(ctx) {
  const defs = new Map();
  let running = false;
  const P = { x: 0, z: 0 };
  const posOf = d => {
    const p = typeof d.pos === 'function' ? d.pos() : d.pos;
    if (!p) return null;
    if (p.isObject3D) { p.getWorldPosition(_v); return _v; }
    return p;
  };
  const _v = new Vector3();

  const api = {
    /** Best enabled interactable in range (null while busy or running). */
    current: null,
    /** True while a run() promise is pending. */
    get running() { return running; },
    /**
     * register({id, pos, radius=1.6, label='Parla', icon='💬', priority=0, enabled?, run}) → unregister.
     * pos: {x,z} | Vector3 | Object3D | () => {x,z}. Re-registering an id replaces it.
     */
    register(def) {
      if (!def?.id || typeof def.run !== 'function') throw new Error('interact.register needs {id, run}');
      defs.set(def.id, { radius: 1.6, label: 'Parla', icon: '💬', priority: 0, ...def });
      return () => { if (defs.get(def.id)?.run === def.run) api.unregister(def.id); };
    },
    unregister(id) { defs.delete(id); if (api.current?.id === id) api.current = null; },
    get(id) { return defs.get(id) || null; },
    list: () => [...defs.values()],
    /** Run `current` (the core calls it on input.pressed('a')). Returns the run promise. */
    async run(def = api.current) {
      if (!def || running) return;
      running = true; api.current = null;
      ctx.bus?.emit('interact:run', { id: def.id });
      try { await def.run(); } catch (e) { console.error('[interact] run failed', def.id, e); } finally { running = false; }
    },
    update() {
      const pl = ctx.player?.position || ctx.cameraRig?.followed?.position;
      if (!pl || running || ctx.busy?.is?.() || ctx.player?.control === false) { api.current = null; return; }
      P.x = pl.x; P.z = pl.z;
      const f = ctx.player?.facing ?? ctx.player?.object?.rotation?.y ?? 0;
      const fx = Math.sin(f), fz = Math.cos(f);
      let best = null, bestScore = Infinity;
      for (const d of defs.values()) {
        let ok = true;
        if (d.enabled) { try { ok = d.enabled(); } catch { ok = false; } }
        if (!ok) continue;
        const q = posOf(d); if (!q) continue;
        const dx = q.x - P.x, dz = q.z - P.z, dist = Math.hypot(dx, dz);
        if (dist > d.radius) continue;
        const front = dist > 0.01 ? (dx * fx + dz * fz) / dist : 1;     // −1 behind … 1 in front
        let score = dist * (1.25 - 0.35 * front) - d.priority * 10;
        if (api.current && d.id === api.current.id) score -= 0.25;      // hysteresis
        if (score < bestScore) { bestScore = score; best = d; }
      }
      api.current = best;
      if (best && ctx.input?.pressed?.('a')) api.run(best);
    },
  };
  return api;
}
