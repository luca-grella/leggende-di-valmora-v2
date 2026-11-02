// Keyboard/gamepad-style focus stack (ui area, private). The topmost handler receives A (E/Enter/Space),
// B (Esc/Backspace), Menu (Tab/P) and arrow navigation. A/B come from ctx.input.pressed() inside the game
// loop, so a key that closes a dialog can never also trigger ctx.interact on the same frame. Handlers pushed
// during a frame ignore that frame's presses (the press that opened them).
export function createFocus(ctx) {
  const stack = [];
  const frame = () => ctx.loop?.frame ?? 0;
  const api = {
    /** h: {ok?(), back?(), menu?(), nav?(dx, dy)} → pop() */
    push(h) {
      h._frame = frame();
      stack.push(h);
      return () => { const i = stack.indexOf(h); if (i >= 0) stack.splice(i, 1); };
    },
    top: () => stack[stack.length - 1] || null,
    get size() { return stack.length; },
    /** Called by the UI loop. Returns true when a handler consumed a press. */
    update() {
      const h = api.top();
      if (!h || h._frame === frame()) return !!h;
      const inp = ctx.input;
      if (inp.pressed('a')) { h.ok?.(); return true; }
      if (inp.pressed('b')) { h.back?.(); return true; }
      if (inp.pressed('menu')) { (h.menu || h.back)?.(); return true; }
      if (inp.pressed('map')) { h.map?.(); return true; }
      return true;
    },
  };
  const NAV = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
  window.addEventListener('keydown', e => {
    const d = NAV[e.code];
    if (!d || e.target?.closest?.('input, textarea')) return;
    const h = api.top();
    if (!h?.nav) return;
    h.nav(d[0], d[1]);
    e.preventDefault();
  });
  return api;
}
