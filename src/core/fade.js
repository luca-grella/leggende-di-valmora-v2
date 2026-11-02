// Full-screen DOM fade above the canvas and below the UI dialogs (z-index 40). Eased CSS transitions;
// overlapping calls are safe (the latest one wins, earlier promises still resolve).
export function createFade() {
  const el = document.createElement('div');
  el.id = 'fade';
  el.style.cssText = 'position:fixed;inset:0;z-index:40;pointer-events:none;opacity:0;background:#000;will-change:opacity;transition:opacity 350ms ease';
  document.body.appendChild(el);
  let token = 0;
  const go = (op, ms, color) => new Promise(resolve => {
    const my = ++token;
    if (color) el.style.background = color;
    el.style.transition = `opacity ${Math.max(0, ms)}ms cubic-bezier(.45,0,.25,1)`;
    el.style.pointerEvents = op > 0 ? 'auto' : 'none';
    void el.offsetWidth;                       // commit the current opacity so the transition runs
    el.style.opacity = String(op);
    setTimeout(() => { if (my === token && op === 0) el.style.pointerEvents = 'none'; resolve(); }, Math.max(0, ms) + 20);
  });
  const fade = {
    el,
    /** Current target opacity (0 clear … 1 covered). */
    get covered() { return +el.style.opacity > 0.5; },
    out: (ms = 350, color = '#000') => go(1, ms, color),
    in: (ms = 350) => go(0, ms),
    async flash(color = '#fff', ms = 250) { await go(1, ms * 0.4, color); await go(0, ms * 0.6); },
    /** out → await fn() → in (fn errors still fade back in). */
    async through(fn, { ms = 350, color = '#000' } = {}) { await fade.out(ms, color); try { return await fn?.(); } finally { await fade.in(ms); } },
  };
  return fade;
}
