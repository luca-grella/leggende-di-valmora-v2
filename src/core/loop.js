// Main loop: requestAnimationFrame, ordered callbacks (lower order first), dt clamp, pause when the
// page is hidden, per-callback error isolation (one broken module never stops the game).

export const ORDER = { input: -1000, time: 1, systems: 10, actors: 20, world: 30, camera: 40, ui: 50 };

/**
 * @param {{render:()=>void, onFrame?:(realDt:number)=>void}} opts
 */
export function createLoop({ render, onFrame }) {
  /** @type {{fn:Function, order:number, seq:number, errors:number, dead:boolean}[]} */
  let entries = [];
  let seq = 0, raf = 0, last = 0, running = false, userPaused = false, hiddenPaused = false;
  let dirty = false, iterating = false;
  const frameTimes = new Float32Array(60); let ftIdx = 0;

  const loop = {
    /** Elapsed game-loop seconds (only advances while not paused). */
    t: 0,
    /** Frame counter (simulation ticks). */
    frame: 0,
    /** Last dt handed to callbacks. */
    dt: 1 / 60,
    /** Smoothed real frames per second. */
    fps: 60,
    /** Max dt in seconds handed to callbacks (contract: ≤ 0.05). */
    maxDt: 0.05,
    /** Time scale (1 = normal). Debug / slow-motion effects. */
    timeScale: 1,
    get paused() { return userPaused || hiddenPaused; },
    get running() { return running; },

    /** Register fn(dt, t). Lower order runs first. Returns a remove function. */
    add(fn, order = 0) {
      if (typeof fn !== 'function') throw new TypeError('loop.add expects a function');
      entries.push({ fn, order: +order || 0, seq: seq++, errors: 0, dead: false });
      dirty = true;
      return () => loop.remove(fn);
    },
    remove(fn) {
      const e = entries.find(x => x.fn === fn && !x.dead);
      if (!e) return;
      e.dead = true;
      if (!iterating) entries = entries.filter(x => !x.dead); else dirty = true;
    },
    start() {
      if (running) return;
      running = true; last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
    /** pause(true|false). While paused callbacks don't run but the scene is still rendered. */
    pause(v = true) { userPaused = !!v; last = performance.now(); },
    _setHidden(v) { hiddenPaused = !!v; last = performance.now(); },
    /** Run one simulation step of dt seconds (no render). Used by the rAF frame and debug.step. */
    tick(dt) {
      if (dirty) { entries = entries.filter(x => !x.dead).sort((a, b) => a.order - b.order || a.seq - b.seq); dirty = false; }
      dt = Math.min(Math.max(+dt || 0, 0), loop.maxDt) * loop.timeScale;
      loop.dt = dt; loop.t += dt; loop.frame++;
      iterating = true;
      const list = entries, n = list.length;
      for (let i = 0; i < n; i++) {
        const e = list[i];
        if (e.dead) continue;
        try { e.fn(dt, loop.t); }
        catch (err) {
          e.errors++;
          if (e.errors <= 3 || e.errors % 300 === 0) console.error(`[loop] ${e.fn.name || 'callback'} (order ${e.order}) threw (${e.errors}x)`, err);
        }
      }
      iterating = false;
    },
    render() { try { render(); } catch (err) { console.error('[loop] render failed', err); } },
    /** Read-only snapshot for debugging. */
    list() { return entries.filter(e => !e.dead).map(e => ({ order: e.order, name: e.fn.name || '(anonymous)', errors: e.errors })); },
  };

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const real = Math.max(0, (now - last) / 1000); last = now;
    frameTimes[ftIdx++ % 60] = real;
    if (ftIdx % 15 === 0) {
      let s = 0; const n = Math.min(ftIdx, 60);
      for (let i = 0; i < n; i++) s += frameTimes[i];
      loop.fps = s > 0 ? n / s : 60;
    }
    if (hiddenPaused) return;
    if (!userPaused) loop.tick(real);
    loop.render();
    onFrame?.(real);
  }

  document.addEventListener('visibilitychange', () => loop._setHidden(document.hidden));
  loop._setHidden(document.hidden);
  return loop;
}
