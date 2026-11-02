// Cheats (ui area): triple tap (within 600 ms) on the coin counter → cheat:money, on the team strip →
// cheat:level. Keyboard Shift+M / Shift+L are emitted by core input. Story pays the coins (and toasts);
// the level-up is handled by whoever listens to cheat:level (creatures / integration).
export function wireCheats(ctx, hud) {
  const taps = (elm, evt) => {
    if (!elm) return;
    let n = 0, t0 = 0;
    elm.addEventListener('pointerdown', () => {
      const now = performance.now();
      if (now - t0 > 600) n = 0;
      if (n === 0) t0 = now;
      if (++n === 3) {
        n = 0;
        ctx.haptic?.([12, 30, 12]);
        elm.classList.remove('cheat'); void elm.offsetWidth; elm.classList.add('cheat');
        ctx.bus.emit(evt);
      }
    });
  };
  taps(hud?.coinsEl, 'cheat:money');
  taps(hud?.teamEl, 'cheat:level');
}
