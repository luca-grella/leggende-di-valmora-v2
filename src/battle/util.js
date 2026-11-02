// Battle-area private helpers: loop-time waits/tweens (they follow ctx.loop, so headless step() drives them and
// they pause with the game), easing, ground height.

export const EASE = {
  linear: x => x,
  inOut: x => x * x * (3 - 2 * x),
  out: x => 1 - (1 - x) ** 3,
  in: x => x * x * x,
  back: x => { const s = 1.9; return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2; },
};
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Resolve after `sec` seconds of game-loop time. */
export function wait(ctx, sec) {
  if (!(sec > 0)) return Promise.resolve();
  return new Promise(resolve => {
    let t = 0;
    const off = ctx.loop.add(function battleWait(dt) { t += dt; if (t >= sec) { off(); resolve(); } }, -1);
  });
}

/** Run fn(k 0..1, eased) every frame for `dur` seconds; resolves after fn(1). */
export function tween(ctx, dur, fn, ease = 'inOut') {
  const e = typeof ease === 'function' ? ease : EASE[ease] || EASE.inOut;
  if (!(dur > 0)) { fn(1, 1); return Promise.resolve(); }
  fn(0, 0);
  return new Promise(resolve => {
    let t = 0;
    const off = ctx.loop.add(function battleTween(dt) {
      t += dt;
      const k = clamp01(t / dur);
      try { fn(e(k), k); } catch (err) { console.warn('[battle] tween', err); }
      if (k >= 1) { off(); resolve(); }
    }, ctx.ORDER?.systems ?? 10);
  });
}

/** Call fn(dt, t) every frame until it returns true (or `max` seconds). */
export function during(ctx, fn, max = 30) {
  return new Promise(resolve => {
    let t = 0;
    const off = ctx.loop.add(function battleDuring(dt) {
      t += dt;
      let done = false;
      try { done = fn(dt, t); } catch (err) { console.warn('[battle] during', err); done = true; }
      if (done || t >= max) { off(); resolve(); }
    }, ctx.ORDER?.systems ?? 10);
  });
}

export function groundAt(ctx, x, z, fallback = 0) {
  const y = ctx.world?.groundY?.(x, z) ?? ctx.world?.heightAt?.(x, z) ?? ctx.stage?.heightAt?.(x, z);
  return Number.isFinite(y) ? y : fallback;
}

/** Promise that also resolves after `sec` of loop time (guards UI promises that might never settle). */
export function withTimeout(ctx, p, sec, value) {
  return Promise.race([p, wait(ctx, sec).then(() => value)]);
}
