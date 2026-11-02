// Small romance-private helpers: loop-time waits/tweens (they pause with the loop and headless tests drive
// them with __valmora.step), safe wrappers around other areas (all optional), POI lookup with a sandbox
// fallback layout, and line picking.
import * as THREE from 'three';

export const pick = list => (Array.isArray(list) && list.length ? list[Math.floor(Math.random() * list.length)] : list || '');
export const sample = (list, n) => [...(list || [])].sort(() => Math.random() - 0.5).slice(0, n);
export const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
export const easeIO = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = t => 1 - Math.pow(1 - t, 3);

/** Loop-time scheduler shared by the romance area. */
export function createClock(ctx) {
  let now = 0;
  const timers = [], tweens = [], tickers = new Set();
  ctx.loop.add(function romanceClock(dt) {
    now += dt;
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].t <= now) { const r = timers[i].resolve; timers.splice(i, 1); r(); }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      try { tw.fn(tw.ease(tw.t), tw.t); } catch (e) { console.warn('[romance] tween', e); tw.t = 1; }
      if (tw.t >= 1) { tweens.splice(i, 1); tw.resolve(); }
    }
    for (const f of tickers) { try { f(dt, now); } catch (e) { console.warn('[romance] tick', e); tickers.delete(f); } }
  }, (ctx.ORDER?.actors ?? 20) + 1);
  return {
    get now() { return now; },
    wait(sec) { return new Promise(resolve => timers.push({ t: now + Math.max(0, sec), resolve })); },
    until(fn, max = 20) {
      return new Promise(resolve => {
        const t0 = now;
        const check = () => { let ok = false; try { ok = !!fn(); } catch { ok = false; } if (ok || now - t0 > max) resolve(ok); else timers.push({ t: now, resolve: check }); };
        check();
      });
    },
    tween(dur, fn, ease = easeIO) { return new Promise(resolve => tweens.push({ t: 0, dur: Math.max(1e-3, dur), fn, ease, resolve })); },
    /** Per-frame callback until the returned remover is called. */
    tick(fn) { tickers.add(fn); return () => tickers.delete(fn); },
  };
}

/** Town centres for the sandbox fallback layout (when World has no POIs, e.g. sandbox/romance.html). */
const FALLBACK_TOWNS = ['alba', 'petalo', 'fulgida', 'muschio', 'fosco', 'cristallo', 'corallo', 'sole', 'ramata'];

/** Sandbox-only POI: a deterministic spot near the origin so every scene can run on the test stage. */
function fallbackPoi(id) {
  const [town, key] = String(id).split('.');
  if (!FALLBACK_TOWNS.includes(town) || !key) return null;
  const table = {
    girl1: [3, 2, Math.PI], girl2: [-3, 2, Math.PI], girl3: [3, -2, 0], girl4: [-3, -2, 0],
    date: [0, 6, 0], picnic: [-5, 5, 0.6], viewpoint: [0, 9, 0], bench: [5, 5, 0], plaza: [0, 0, 0], arrive: [0, -6, Math.PI],
    ride: [6, -4, 0], scooter: [6, -4, 0], swim: [0, 10, 0], beach: [0, 9, 0], osteria: [-6, -1, 0.3], landmark: [0, 3, 0],
  };
  const t = table[key];
  return t ? { x: t[0], y: 0, z: t[1], facing: t[2], fallback: true } : null;
}

/** Interior POI fallback (sandbox): the house is a 6×6 room at the origin. */
function fallbackInteriorPoi(id) {
  const m = String(id).match(/^(house\.\w+\.\d+)\.(\w+)$/);
  if (!m) return null;
  const t = { door: [0, 2.6, Math.PI], owner: [1, 0.5, Math.PI], sofa: [-1.4, 0.4, 0], bed: [1.6, -1.6, Math.PI], table: [0, 0, 0], window: [0, -2.8, 0] }[m[2]];
  return t ? { x: t[0], y: 0, z: t[1], facing: t[2], fallback: true } : null;
}

export function createSafe(ctx) {
  const S = {
    poi(id, { fallback = true } = {}) {
      if (!id) return null;
      let p = null;
      try { p = ctx.world?.poi?.(id) || null; } catch { p = null; }
      if (!p) { try { p = ctx.story?.kit?.poi?.(id) || null; } catch { p = null; } }
      if (!p && fallback && !ctx.world?.poi) p = fallbackPoi(id) || fallbackInteriorPoi(id);
      return p;
    },
    groundY(x, z) { try { return ctx.world?.groundY?.(x, z) ?? ctx.world?.heightAt?.(x, z) ?? 0; } catch { return 0; } },
    isWater(x, z) { try { return !!ctx.world?.isWater?.(x, z); } catch { return false; } },
    walkable(x, z) { try { return ctx.world?.walkable ? !!ctx.world.walkable(x, z) : true; } catch { return true; } },
    say(speaker, lines, opts = {}) {
      const list = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
      if (!list.length) return Promise.resolve();
      if (ctx.story?.dialogue?.say) return ctx.story.dialogue.say(speaker, list, { camera: 'none', ...opts });
      if (ctx.ui?.say) return ctx.ui.say(speaker, list.map(l => (typeof l === 'string' ? l : l.t)), {});
      if (ctx.isDebug) console.info(`[romance say] ${speaker}: ${list.map(l => (typeof l === 'string' ? l : l.t)).join(' / ')}`);
      return Promise.resolve();
    },
    async choose(title, options, { cancel = true, style = 'romance' } = {}) {
      if (!ctx.ui?.choose) return cancel ? -1 : 0;
      const r = await ctx.ui.choose(title, options, { cancel, style });
      return typeof r === 'number' ? r : -1;
    },
    async confirm(text, o) { try { return ctx.ui?.confirm ? !!(await ctx.ui.confirm(text, o)) : true; } catch { return true; } },
    toast(text, o) { try { ctx.ui?.toast?.(text, o); } catch { /* ui optional */ } },
    banner(t, s) { try { ctx.ui?.banner?.(t, s); } catch { /* ui optional */ } },
    sfx(name, o) { try { ctx.audio?.sfx?.(name, o); } catch { /* audio optional */ } },
    jingle(name) { try { ctx.audio?.jingle?.(name); } catch { /* audio optional */ } },
    music(track) { try { ctx.audio?.music?.(track); } catch { /* audio optional */ } },
    haptic(p) { try { if (ctx.save.state.settings?.haptics !== false) ctx.haptic?.(p); } catch { /* optional */ } },
    letterbox(on) { try { ctx.ui?.letterbox?.(on); } catch { /* ui optional */ } },
    grade(o) { try { ctx.post?.grade?.(o); } catch { /* post optional */ } },
    async fadeOut(ms = 450, color = '#000') { try { await ctx.fade?.out?.(ms, color); } catch { /* optional */ } },
    async fadeIn(ms = 500) { try { await ctx.fade?.in?.(ms); } catch { /* optional */ } },
    /** Out → fn → in, robust if fade is missing. */
    async through(fn, { ms = 450, color = '#000' } = {}) {
      await S.fadeOut(ms, color);
      try { return await fn(); } finally { await S.fadeIn(ms + 100); }
    },
    play(h, clip, o) { try { return h?.play?.(clip, o) || Promise.resolve(); } catch { return Promise.resolve(); } },
    expr(h, name, o) { try { h?.setExpression?.(name, o); } catch { /* optional */ } },
    lookAt(h, target, o) { try { h?.lookAt?.(target, o); } catch { /* optional */ } },
    face(h, a, o) { try { return h?.face?.(a, o) || Promise.resolve(); } catch { return Promise.resolve(); } },
    teleport(h, x, z, facing) {
      if (!h) return;
      try { if (h.teleport) h.teleport(x, z, facing); else { h.object.position.set(x, S.groundY(x, z), z); if (facing != null) h.object.rotation.y = facing; } }
      catch (e) { console.warn('[romance] teleport', e); }
    },
    headPos(h, out = new THREE.Vector3()) {
      if (h?.head?.isObject3D) return h.head.getWorldPosition(out);
      const o = h?.object || h;
      if (o?.isObject3D) { o.getWorldPosition(out); out.y += 1.5; return out; }
      return out.set(0, 1.5, 0);
    },
    worldPos(h, out = new THREE.Vector3()) {
      const o = h?.object || h;
      if (o?.isObject3D) return o.getWorldPosition(out);
      return out.set(o?.x || 0, o?.y || 0, o?.z || 0);
    },
  };
  return S;
}
