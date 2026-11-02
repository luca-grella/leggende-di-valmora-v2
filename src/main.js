// Leggende di Valmora 2 — boot. Every area is loaded with a dynamic import inside try/catch, so the
// game boots at any stage of development (missing or broken modules log a warning and are skipped).
import { createCore } from './core/index.js';
import { registerServiceWorker } from './core/pwa.js';

const isMissing = e => /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|404/i.test(String(e?.message || e));

async function load(path) {
  try { return await import(path); }
  catch (e) {
    if (isMissing(e)) console.warn(`[boot] ${path} not present yet — skipped`);
    else console.warn(`[boot] ${path} failed to load — skipped`, e);
    return null;
  }
}

/** Import `path` and call its init(ctx). */
async function initModule(name, path, ctx) {
  const mod = await load(path);
  if (!mod) return null;
  const init = mod.init || mod.default?.init || (typeof mod.default === 'function' ? mod.default : null);
  if (!init) { console.warn(`[boot] ${path} has no init(ctx) export — skipped`); return null; }
  try { return (await init(ctx)) ?? null; }
  catch (e) { console.warn(`[boot] ${name}.init threw — continuing without it`, e); return null; }
}

const setBootMessage = t => { const el = document.getElementById('boot-msg'); if (el) el.textContent = t; };
function hideBoot() {
  const el = document.getElementById('boot'); if (!el) return;
  el.style.transition = 'opacity .8s ease'; el.style.opacity = '0';
  setTimeout(() => el.remove(), 900);
}

async function boot() {
  const ctx = await createCore({ canvasParent: document.getElementById('game') || document.body });
  setBootMessage('Caricamento…');

  ctx.world = await initModule('world', './world/index.js', ctx);
  if (!ctx.world) ctx.createTestStage({ ground: true, dummy: true });
  ctx.actors = await initModule('actors', './actors/index.js', ctx);
  if (!ctx.player && ctx.stage?.dummy) {
    // placeholder player until the actors area provides one
    const d = ctx.stage.dummy;
    ctx.player = { object: d, position: d.position, get facing() { return d.rotation.y; }, radius: 0.35, state: 'idle', control: true,
      setControl(v) { this.control = v; }, teleport(x, z) { d.position.set(x, 0, z); ctx.cameraRig.snap(); }, placeholder: true };
  }
  if (ctx.player?.object && !ctx.player.placeholder) { if (ctx.stage?.dummy) ctx.stage.dummy.visible = false; ctx.cameraRig.follow(ctx.player.object); ctx.cameraRig.snap(); }
  ctx.creatures = await initModule('creatures', './creatures/index.js', ctx);
  ctx.battle = await initModule('battle', './battle/index.js', ctx);
  ctx.story = await initModule('story', './story/index.js', ctx);
  ctx.romance = await initModule('romance', './romance/index.js', ctx);
  ctx.ui = await initModule('ui', './ui/index.js', ctx);
  ctx.game = await initModule('game', './game.js', ctx);
  // Fallback touch controls (joystick + A/B/Corri) so the game stays playable on iPhone while the UI
  // area is missing or has no controls yet.
  if (!ctx.ui?.controls) ctx.touchFallback = ctx.createTouchControls(document.getElementById('ui') || document.body);

  let started = false;
  // New game after the game already started → wipe the save and reload clean (modules never re-init).
  ctx.startGame = (newGame = false) => {
    if (started) {
      if (!newGame) return;
      ctx.save.reset();
      try { sessionStorage.setItem('valmora-newgame', '1'); } catch { /* private mode */ }
      location.reload();
      return;
    }
    if (newGame) ctx.save.reset();
    started = true;
    ctx.bus.emit('game:start', { newGame: !!newGame || ctx.save.firstLaunch });
  };

  ctx.bus.emit('save:loaded', { state: ctx.save.state });
  ctx.loop.start();
  ctx.loop.render();
  hideBoot();
  ctx.bus.emit('game:ready', { ctx });
  registerServiceWorker({ params: ctx.params, onUpdate: () => ctx.ui?.toast?.('Aggiornamento pronto: riapri il gioco', { icon: '✨' }) });

  let pendingNew = false;
  try { pendingNew = sessionStorage.getItem('valmora-newgame') === '1'; sessionStorage.removeItem('valmora-newgame'); } catch { /* private mode */ }
  if (pendingNew) { started = true; ctx.bus.emit('game:start', { newGame: true }); }   // save already reset before the reload
  else if (ctx.ui?.title && !ctx.params.has('skiptitle')) ctx.ui.title();
  else ctx.startGame(ctx.params.has('newgame'));
}

boot().catch(e => { console.error('[boot] fatal', e); setBootMessage(String(e?.message || e)); });
