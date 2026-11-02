// UI area entry point. Builds every UI piece (HUD, dialogue, touch controls, tracker, markers, toasts, title,
// battle HUD, sheets), wires the keyboard/gamepad focus stack and runs one loop callback (order ui = 50).
// Layering: #ui (z 20, under the core fade) holds the world-facing UI (controls, markers, tracker, HUD,
// letterbox, battle HUD, title); #ui-top (z 50, above the fade) holds sheets, dialogue and toasts, so text and
// menus stay readable while the screen is faded out.
import { el, setTapFeedback } from './dom.js';
import { createFocus } from './focus.js';
import { createHud } from './hud.js';
import { createDialog } from './dialog.js';
import { createControls } from './controls.js';
import { createTracker } from './tracker.js';
import { createMarkers } from './markers.js';
import { createToasts } from './toast.js';
import { createTitle } from './title.js';
import { createBattleHud } from './battlehud.js';
import { wireCheats } from './cheats.js';
import { createSheets } from './sheets/index.js';

/** Busy tags that hide the exploration HUD completely (dialogue only dims it). */
const HIDE_HUD = ['battle', 'scene', 'title', 'cutscene', 'travel'];

/** @param {any} ctx */
export function init(ctx) {
  const root = document.getElementById('ui') || document.body.appendChild(el('div#ui'));
  root.classList.add('vui');
  let top = document.getElementById('ui-top');
  if (!top) { top = el('div#ui-top'); document.body.append(top); }
  top.classList.add('vui');

  // tap feedback: soft click + tiny haptic (ctx.haptic respects the Vibrazione setting)
  setTapFeedback(() => { ctx.audio?.sfx?.('ui_tap', { vol: 0.45 }); ctx.haptic?.(6); });

  const focus = createFocus(ctx);

  // world-facing layers (DOM order = stacking order inside #ui)
  const controls = createControls(ctx, root);
  const markers = createMarkers(ctx, root);
  const tracker = createTracker(ctx, root);
  const hud = createHud(ctx, root);
  const letterboxEl = el('div.layer.letterbox', el('div.lb-bar.top'), el('div.lb-bar.bot'));
  root.append(letterboxEl);
  const battle = createBattleHud(ctx, root, focus);
  const title = createTitle(ctx, root, focus);

  // top layers (above the fade)
  const sheets = createSheets(ctx, top, focus);
  const dialog = createDialog(ctx, top, focus);
  const toasts = createToasts(ctx, top);

  // ── letterbox: explicit (story dialogue, romance) or automatic during scenes/cutscenes ──
  let lbManual = false;
  const has = t => !!ctx.busy?.has?.(t);
  const syncLetterbox = () => {
    const on = (lbManual || has('scene') || has('cutscene')) && !has('title');
    letterboxEl.classList.toggle('on', on);
    root.classList.toggle('lb-on', on);
    top.classList.toggle('lb-on', on);
  };

  // ── mode classes: CSS hides/dims HUD, tracker and markers from the busy tags ──
  function syncMode() {
    const inBattle = has('battle') || !!battle.isOpen;
    root.classList.toggle('m-hidehud', HIDE_HUD.some(has) || inBattle);
    root.classList.toggle('m-dialog', has('dialog'));
    root.classList.toggle('m-sheet', has('sheet'));
    root.classList.toggle('m-battle', inBattle);
    top.classList.toggle('m-battle', inBattle);
    syncLetterbox();
  }
  ctx.bus.on('busy:change', syncMode);

  // ── location plate on entering a new area (not during battles / title) ──
  ctx.bus.on('area:enter', ({ id, name, kind } = {}) => {
    if (has('battle') || has('title')) return;
    const def = ctx.world?.areaDef?.(id);
    toasts.areaBanner(name || def?.name || id, { kind: kind || def?.kind });
  });

  // ── 18+ switched off: drop heart markers at once (romance also reacts to settings:change) ──
  ctx.bus.on('settings:change', ({ key, value } = {}) => {
    if (key === 'adult' && !value) for (const id of markers.ids()) if (markers.iconOf(id) === '❤' || markers.iconOf(id) === '❤️') markers.remove(id);
  });

  let lastBattleOpen = false;
  function update(dt) {
    if (battle.isOpen !== lastBattleOpen) { lastBattleOpen = battle.isOpen; syncMode(); }
    // 1. the focus stack (dialogue, sheets, battle menus, title) gets A/B/Menu/Map first
    const consumed = focus.update();
    // 2. free exploration: Tab/P opens the menu, M the map
    if (!consumed && !ctx.busy.is() && !title.open) {
      if (ctx.input?.pressed?.('menu')) sheets.open('menu');
      else if (ctx.input?.pressed?.('map')) sheets.open('map');
    }
    dialog.update(dt);
    battle.tick(dt);
    hud.update(dt);
    controls.update(dt);
    tracker.update(dt);
    markers.update(dt);
  }
  ctx.loop.add(update, ctx.ORDER?.ui ?? 50);

  const ui = {
    root, top, hud, controls, tracker, battle, focus,
    title: () => title.show(),
    titleOpen: () => title.open,
    hideTitle: () => title.hide(),
    say: dialog.say, choose: dialog.choose, confirm: dialog.confirm,
    get dialogOpen() { return dialog.open; },
    toast: toasts.toast, banner: toasts.banner, areaBanner: toasts.areaBanner,
    sheet: (name, data) => sheets.open(name, data),
    closeSheet: () => sheets.close(),
    isOpen: () => sheets.isOpen(),
    get sheetName() { return sheets.current; },
    marker: (id, target, opts) => markers.set(id, target, opts),
    removeMarker: id => markers.remove(id),
    letterbox(on) { lbManual = !!on; syncLetterbox(); },
    get letterboxOn() { return letterboxEl.classList.contains('on'); },
  };
  wireCheats(ctx, hud);
  syncMode();

  // debug helper (only with ?debug): L.ui('sheet', 'team'), L.ui('say', 'Quercia', ['Ciao!'])
  try { ctx.debug?.register?.('ui', (fn, ...args) => (typeof ui[fn] === 'function' ? ui[fn](...args) : ui[fn])); } catch { /* optional */ }
  return ui;
}
