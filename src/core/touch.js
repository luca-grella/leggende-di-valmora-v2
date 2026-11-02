// Fallback touch controls (engine): floating joystick (appears under the left thumb), A context button
// showing ctx.interact.current, B and Corri. The UI area owns the real controls (src/ui/controls.js);
// main.js / sandboxes mount this only when the UI module is missing, so the game is always playable on
// iPhone. The UI may also reuse it: createTouchControls(ctx, root) → {show(bool), destroy()}.

const CSS = `
.vt-zone{position:absolute;left:0;top:0;bottom:0;width:55%;touch-action:none;pointer-events:auto}
.vt-base{position:absolute;width:124px;height:124px;margin:-62px 0 0 -62px;border-radius:50%;pointer-events:none;
  background:radial-gradient(circle at 50% 45%,rgba(255,255,255,.34),rgba(255,255,255,.12) 62%,rgba(255,255,255,.2));
  border:3px solid rgba(255,255,255,.75);box-shadow:0 6px 18px rgba(42,33,64,.25),inset 0 0 0 2px rgba(42,33,64,.08);
  opacity:0;transform:scale(.7);transition:opacity .18s ease,transform .22s cubic-bezier(.3,1.5,.5,1)}
.vt-base.on{opacity:1;transform:scale(1)}
.vt-knob{position:absolute;left:50%;top:50%;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;
  background:linear-gradient(#ffffff,#d9f3ff);border:3px solid #2a2140;box-shadow:0 4px 0 #2a2140}
.vt-btns{position:absolute;right:calc(18px + env(safe-area-inset-right));bottom:calc(22px + env(safe-area-inset-bottom));
  width:190px;height:170px;pointer-events:none}
.vt-btn{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:50%;
  font:900 15px ui-rounded,"SF Pro Rounded",system-ui,sans-serif;color:#2a2140;border:3px solid #2a2140;pointer-events:auto;
  touch-action:none;user-select:none;-webkit-user-select:none;box-shadow:0 5px 0 #2a2140,0 8px 16px rgba(42,33,64,.25);
  transition:transform .12s ease,box-shadow .12s ease,opacity .2s ease}
.vt-btn.down{transform:translateY(4px);box-shadow:0 1px 0 #2a2140,0 3px 8px rgba(42,33,64,.25)}
.vt-a{right:0;bottom:30px;width:92px;height:92px;background:linear-gradient(#ffe27a,#f5b83d)}
.vt-a .ic{font-size:26px;line-height:1}.vt-a .lb{font-size:12px;margin-top:2px;max-width:80px;text-align:center;line-height:1.05}
.vt-a.idle{opacity:.55}
.vt-b{right:104px;bottom:0;width:62px;height:62px;background:linear-gradient(#ffffff,#d7e9ff)}
.vt-run{right:112px;bottom:84px;width:56px;height:56px;font-size:12px;background:linear-gradient(#bff5d6,#6fd39a)}
.vt-run.on{background:linear-gradient(#ffd0a8,#ff8f5a)}
.vt-root{position:fixed;inset:0;z-index:30;pointer-events:none;transition:opacity .25s ease}
.vt-root.hidden{opacity:0}.vt-root.hidden *{pointer-events:none!important}
`;

/**
 * @param {any} ctx core context (input, interact, busy, bus)
 * @param {HTMLElement} [root]
 * @param {{force?:boolean}} [opts] force: mount even on non-touch devices
 */
export function createTouchControls(ctx, root = document.body, { force = false } = {}) {
  if (!force && !ctx.input.isTouch) return { show() {}, destroy() {}, mounted: false };
  if (!document.getElementById('vt-style')) {
    const st = document.createElement('style'); st.id = 'vt-style'; st.textContent = CSS; document.head.appendChild(st);
  }
  const wrap = document.createElement('div'); wrap.className = 'vt-root';
  wrap.innerHTML = `<div class="vt-zone"><div class="vt-base"><div class="vt-knob"></div></div></div>
    <div class="vt-btns"><div class="vt-btn vt-a idle"><span class="ic">A</span><span class="lb"></span></div>
    <div class="vt-btn vt-b">B</div><div class="vt-btn vt-run">Corri</div></div>`;
  root.appendChild(wrap);
  const zone = wrap.querySelector('.vt-zone'), base = wrap.querySelector('.vt-base'), knob = wrap.querySelector('.vt-knob');
  const btnA = wrap.querySelector('.vt-a'), btnB = wrap.querySelector('.vt-b'), btnRun = wrap.querySelector('.vt-run');
  const R = 52;
  let pid = null, ox = 0, oy = 0, kx = 0, ky = 0, visible = true, runOn = false;

  const setKnob = (x, y) => { knob.style.transform = `translate(${x}px,${y}px)`; };
  zone.addEventListener('pointerdown', e => {
    if (pid !== null) return;
    pid = e.pointerId; zone.setPointerCapture?.(pid);
    const r = zone.getBoundingClientRect();
    ox = e.clientX - r.left; oy = e.clientY - r.top;
    base.style.left = ox + 'px'; base.style.top = oy + 'px'; base.classList.add('on');
    kx = ky = 0; setKnob(0, 0);
    e.preventDefault();
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== pid) return;
    const r = zone.getBoundingClientRect();
    let dx = e.clientX - r.left - ox, dy = e.clientY - r.top - oy;
    const m = Math.hypot(dx, dy);
    if (m > R) {
      // drag the base along when the thumb goes far (floating stick)
      const over = m - R; ox += dx / m * over; oy += dy / m * over;
      base.style.left = ox + 'px'; base.style.top = oy + 'px';
      dx = dx / m * R; dy = dy / m * R;
    }
    kx = dx; ky = dy; setKnob(dx, dy);
    ctx.input.setJoystick(dx / R, -dy / R);
  });
  const end = e => {
    if (e.pointerId !== pid) return;
    pid = null; base.classList.remove('on');
    ctx.input.setJoystick(0, 0);
    // eased knob return
    const k0x = kx, k0y = ky, t0 = performance.now();
    const back = now => { const t = Math.min(1, (now - t0) / 160), e2 = 1 - Math.pow(1 - t, 3); setKnob(k0x * (1 - e2), k0y * (1 - e2)); if (t < 1) requestAnimationFrame(back); };
    requestAnimationFrame(back);
  };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);

  const hold = (el, name, onDown) => {
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('down'); onDown ? onDown() : ctx.input.setButton(name, true); ctx.haptic?.(8); });
    const up = () => { el.classList.remove('down'); if (!onDown) ctx.input.setButton(name, false); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
  };
  hold(btnA, 'a'); hold(btnB, 'b');
  hold(btnRun, 'run', () => { runOn = !runOn; btnRun.classList.toggle('on', runOn); ctx.input.press('runToggle'); });

  // A button label follows the current context action
  let lastLabel = null, raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const cur = ctx.interact?.current;
    const label = cur ? `${cur.icon || ''}|${cur.label || ''}` : '';
    if (label !== lastLabel) {
      lastLabel = label;
      btnA.classList.toggle('idle', !cur);
      btnA.querySelector('.ic').textContent = cur?.icon || 'A';
      btnA.querySelector('.lb').textContent = cur?.label || '';
    }
    const hide = !visible || ctx.busy?.is?.();
    if (wrap.classList.contains('hidden') !== hide) {
      wrap.classList.toggle('hidden', hide);
      if (hide && pid !== null) { pid = null; base.classList.remove('on'); ctx.input.setJoystick(0, 0); }
    }
  };
  raf = requestAnimationFrame(tick);

  return {
    mounted: true, el: wrap,
    show(v) { visible = !!v; },
    destroy() { cancelAnimationFrame(raf); wrap.remove(); ctx.input.setJoystick(0, 0); },
  };
}
