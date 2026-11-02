// Shared sandbox boot (engine area). Each sandbox/<area>.html calls boot([...areas]) with the areas it
// needs, in boot order. Exposes window.__valmora (debug) and marks ready, so tools/shot.mjs scenarios work.
import { createCore } from '../src/core/index.js';

const PATHS = {
  world: '../src/world/index.js', actors: '../src/actors/index.js', creatures: '../src/creatures/index.js', battle: '../src/battle/index.js',
  story: '../src/story/index.js', romance: '../src/romance/index.js', ui: '../src/ui/index.js', game: '../src/game.js',
};

export async function boot(areas = [], { stage = true } = {}) {
  const ctx = await createCore({ canvasParent: document.getElementById('game'), debug: true });
  if (stage && !areas.includes('world')) ctx.createTestStage({ ground: true, dummy: true });
  for (const a of areas) {
    let m = null;
    try { m = await import(PATHS[a]); }
    catch (e) {
      if (/Failed to fetch dynamically imported module|Importing a module script failed|404/i.test(String(e?.message || e))) console.warn(`[sandbox] ${a} not present yet — skipped`);
      else console.warn(`[sandbox] ${a} failed to load`, e);
    }
    if (m) { try { ctx[a] = (await m.init(ctx)) ?? null; } catch (e) { console.warn(`[sandbox] ${a}.init threw`, e); } }
    // World missing or broken: fall back to the engine test stage so the other areas still have ground
    if (a === 'world' && !ctx.world && stage) ctx.createTestStage({ ground: true, dummy: true });
  }
  if (!ctx.player && ctx.stage?.dummy) { const d = ctx.stage.dummy; ctx.player = { object: d, position: d.position, radius: 0.35, placeholder: true, teleport(x, z) { d.position.set(x, 0, z); } }; }
  else if (ctx.player?.object) { if (ctx.stage?.dummy) ctx.stage.dummy.visible = false; ctx.cameraRig.follow(ctx.player.object); }
  // engine fallback joystick/A/B when the UI area is not in this sandbox (?touch forces it on desktop)
  if (!ctx.ui?.controls) ctx.touchFallback = ctx.createTouchControls(document.getElementById('ui') || document.body, { force: ctx.params.has('touch') });
  ctx.startGame = (newGame = false) => { if (newGame) ctx.save.reset(); ctx.bus.emit('game:start', { newGame }); };
  ctx.cameraRig.snap();
  ctx.loop.start();
  ctx.bus.emit('game:ready', { ctx });
  if (!ctx.params.has('notstart')) ctx.startGame(ctx.params.has('newgame'));
  return ctx;
}
