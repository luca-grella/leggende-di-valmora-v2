// Touch controls (ui area): floating joystick (appears under the left thumb, left half), big A button with the
// label/icon of ctx.interact.current, B, Corri (run toggle) and 🎯 (paint blaster, when owned). Everything is
// forwarded to ctx.input. Hidden while ctx.busy.is(). On keyboard-only devices the A button turns into a
// compact prompt ("E · Parla") and the touch-only buttons hide.
import { el, clamp } from './dom.js';
import { icon } from './icons.js';

const R = 52;   // knob travel (px)

export function createControls(ctx, root) {
  const layer = el('div.layer.controls');

  // ── joystick ──
  const zone = el('div.joy-zone');
  const knob = el('div.joy-knob');
  const base = el('div.joy-base', el('div.joy-ring'), el('div.joy-arrows', ['u', 'r', 'd', 'l'].map(d => el('i.' + d))), knob);
  const ghost = el('div.joy-ghost', el('div.joy-ghost-knob'));
  zone.append(ghost, base);
  let jid = null, ox = 0, oy = 0, kx = 0, ky = 0;
  zone.addEventListener('pointerdown', e => {
    if (jid !== null) return;
    jid = e.pointerId;
    try { zone.setPointerCapture(jid); } catch { /* ignore */ }
    const r = zone.getBoundingClientRect();
    ox = clamp(e.clientX, r.left + R + 6, r.right - R - 6);
    oy = clamp(e.clientY, r.top + R + 6, r.bottom - R - 6);
    base.style.transform = `translate3d(${ox - r.left}px, ${oy - r.top}px, 0)`;
    base.classList.add('on'); ghost.classList.add('off');
    move(e);
    e.preventDefault();
  });
  function move(e) {
    if (e.pointerId !== jid) return;
    let dx = e.clientX - ox, dy = e.clientY - oy;
    const d = Math.hypot(dx, dy);
    if (d > R * 1.45) { // the base follows the thumb
      const k = (d - R * 1.45) / d; ox += dx * k; oy += dy * k; dx = e.clientX - ox; dy = e.clientY - oy;
      const r = zone.getBoundingClientRect();
      base.style.transform = `translate3d(${ox - r.left}px, ${oy - r.top}px, 0)`;
    }
    const m = Math.min(1, Math.hypot(dx, dy) / R), a = Math.atan2(dy, dx);
    kx = Math.cos(a) * m * R; ky = Math.sin(a) * m * R;
    knob.style.transform = `translate3d(${kx.toFixed(1)}px, ${ky.toFixed(1)}px, 0)`;
    base.classList.toggle('max', m >= 0.95);
    ctx.input.setJoystick(kx / R, -ky / R);
  }
  zone.addEventListener('pointermove', move);
  const endJoy = e => {
    if (e && e.pointerId !== jid) return;
    jid = null; ctx.input.setJoystick(0, 0);
    base.classList.remove('on', 'max'); ghost.classList.remove('off');
    knob.style.transform = 'translate3d(0,0,0)';
  };
  zone.addEventListener('pointerup', endJoy);
  zone.addEventListener('pointercancel', endJoy);
  zone.addEventListener('lostpointercapture', endJoy);

  // ── buttons ──
  /** A hold-able button forwarded to input.setButton(name). */
  function holdButton(node, name, { onDown } = {}) {
    let pid = null;
    node.addEventListener('pointerdown', e => {
      if (pid !== null) return;
      pid = e.pointerId;
      try { node.setPointerCapture(pid); } catch { /* ignore */ }
      node.classList.add('pressed');
      if (name) ctx.input.setButton(name, true);
      onDown?.();
      ctx.haptic?.(8);
      e.preventDefault(); e.stopPropagation();
    });
    const up = e => {
      if (e.pointerId !== pid) return;
      pid = null; node.classList.remove('pressed');
      if (name) ctx.input.setButton(name, false);
    };
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', up);
    return () => { if (pid !== null) { pid = null; node.classList.remove('pressed'); if (name) ctx.input.setButton(name, false); } };
  }

  const aIc = el('span.a-ic');
  const aLabel = el('span.a-label');
  const aKey = el('span.a-key', 'E');
  const aBtn = el('button.cbtn.a-btn', { type: 'button', 'aria-label': 'Azione' }, el('span.a-face', el('span.a-letter', 'A'), aIc), el('span.a-tag', aKey, aLabel));
  const bBtn = el('button.cbtn.b-btn', { type: 'button', 'aria-label': 'Indietro' }, el('span.b-letter', 'B'));
  const runBtn = el('button.cbtn.run-btn', { type: 'button', 'aria-label': 'Corri' }, el('span.run-ic', { html: icon('run') }), el('span.run-t', 'Corri'));
  const blastBtn = el('button.cbtn.blast-btn.hidden', { type: 'button', 'aria-label': 'Spara-vernice' }, el('span.blast-ic', { html: icon('target') }));
  const cluster = el('div.cluster', blastBtn, runBtn, bBtn, aBtn);

  const relA = holdButton(aBtn, 'a', { onDown: () => { aBtn.classList.remove('boing'); void aBtn.offsetWidth; aBtn.classList.add('boing'); } });
  const relB = holdButton(bBtn, 'b');
  const relBlast = holdButton(blastBtn, 'blaster');
  let runOn = false;
  const relRun = holdButton(runBtn, null, { onDown: () => { ctx.input.press('runToggle'); runOn = !runOn; ownToggle = true; syncRun(); } });
  let ownToggle = false;
  function syncRun() { runBtn.classList.toggle('on', runOn); }

  layer.append(zone, cluster);
  root.append(layer);

  // ── state ──
  let manual = true, blaster = false, lastSig = '', visible = null;
  function setVisible(v) {
    if (v === visible) return;
    visible = v;
    layer.classList.toggle('off', !v);
    if (!v) releaseAll();
  }
  function releaseAll() {
    if (jid !== null) endJoy();
    relA(); relB(); relBlast(); relRun();
  }

  function update() {
    const busy = ctx.busy.is();
    setVisible(manual && !busy);
    // keyboard R toggles run too: keep the button in sync
    if (ctx.input.pressed('runToggle') && !ownToggle) { runOn = !runOn; syncRun(); }
    ownToggle = false;
    const touch = ctx.input.isTouch || ctx.input.lastDevice === 'touch';
    layer.classList.toggle('touch', touch);
    const cur = ctx.interact?.current;
    const label = cur?.label || '';
    const ic = cur?.icon || '';
    const sig = `${label}|${ic}|${touch}`;
    if (sig !== lastSig) {
      lastSig = sig;
      aLabel.textContent = label;
      aIc.innerHTML = ic ? icon(ic) : '';
      aBtn.classList.toggle('has', !!cur);
      aBtn.classList.toggle('has-ic', !!ic);
      aBtn.setAttribute('aria-label', label || 'Azione');
      if (cur) { aBtn.classList.remove('ready'); void aBtn.offsetWidth; aBtn.classList.add('ready'); }
    }
    const owned = blaster || !!ctx.story?.crime?.hasBlaster || !!ctx.save?.state?.story?.crime?.blaster;
    blastBtn.classList.toggle('hidden', !owned);
  }

  // auto-run setting: turn the toggle on at start if requested
  const applyAutoRun = () => {
    const want = !!ctx.save?.state?.settings?.autoRun;
    if (want !== runOn) { ctx.input.press('runToggle'); runOn = want; ownToggle = true; syncRun(); }
  };
  ctx.bus.on('game:start', applyAutoRun);
  ctx.bus.on('settings:change', ({ key } = {}) => { if (key === 'autoRun') applyAutoRun(); });

  return {
    el: layer, update, releaseAll,
    show(v = true) { manual = !!v; update(); },
    setBlaster(v) { blaster = !!v; blastBtn.classList.toggle('hidden', !v); },
  };
}
