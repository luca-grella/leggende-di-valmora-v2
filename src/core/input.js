// Input: keyboard, gamepad and programmatic UI touch controls (joystick/buttons). Edges are computed
// once per frame (order −1000) so every module sees the same pressed()/released() flags.
// move is camera-relative in world space. Shift+M / Shift+L emit the cheat events.

const KEYMAP = {
  KeyE: 'a', Enter: 'a', Space: 'a', NumpadEnter: 'a',
  Escape: 'b', Backspace: 'b',
  Tab: 'menu', KeyP: 'menu', KeyM: 'map', KeyF: 'blaster', KeyR: 'runToggle',
};
const MOVE = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
// standard gamepad mapping
const GP_BUTTONS = { 0: 'a', 1: 'b', 2: 'blaster', 3: 'map', 9: 'menu', 8: 'menu', 5: 'run', 7: 'run' };
const DEAD = 0.12;

/**
 * @param {{bus:any, getYaw?:()=>number, save?:any}} opts getYaw: camera yaw (radians, 0 = camera at +z looking −z).
 */
export function createInput({ bus, getYaw = () => 0, save = null }) {
  const held = new Map();             // name → Set(source)
  const pendDown = new Map(), pendUp = new Map();
  const edgeDown = new Set(), edgeUp = new Set();
  const keys = new Set();             // physical move/shift codes held
  const joy = { x: 0, y: 0 }, gp = { x: 0, y: 0 };
  let gpPrev = {}, runToggle = false;

  const isHeld = n => (held.get(n)?.size || 0) > 0;
  function setHeld(name, source, v) {
    let s = held.get(name);
    if (!s) held.set(name, (s = new Set()));
    const was = s.size > 0;
    if (v) s.add(source); else s.delete(source);
    const now = s.size > 0;
    if (now && !was) pendDown.set(name, (pendDown.get(name) || 0) + 1);
    if (!now && was) pendUp.set(name, (pendUp.get(name) || 0) + 1);
  }

  const input = {
    /** World-space, camera-relative move vector; mag 0..1 (0 when disabled). */
    move: { x: 0, z: 0, mag: 0 },
    /** Raw screen-space move (x right, y up), −1..1. */
    moveScreen: { x: 0, y: 0 },
    /** Run: Shift held, R toggle, Corri button, gamepad shoulder (or auto-run setting). */
    run: false,
    /** false → move is zero (presses still work). */
    enabled: true,
    isTouch: (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window,
    /** 'keyboard' | 'touch' | 'gamepad' */
    lastDevice: 'keyboard',
    /** One-frame edge for a named button: a, b, menu, map, blaster, runToggle, run (+ any UI name). */
    pressed: n => edgeDown.has(n),
    released: n => edgeUp.has(n),
    isDown: n => isHeld(n),
    /** Programmatic one-shot press (UI icons, scenario scripts). */
    press(n) { pendDown.set(n, (pendDown.get(n) || 0) + 1); pendUp.set(n, (pendUp.get(n) || 0) + 1); },
    /** UI joystick: x right, y up, −1..1 (call setJoystick(0,0) on release). */
    setJoystick(x, y) {
      x = +x || 0; y = +y || 0;
      const m = Math.hypot(x, y), k = m > 1 ? 1 / m : 1;
      joy.x = x * k; joy.y = y * k;
      if (m > 0.02) input.lastDevice = 'touch';
    },
    /** UI touch button held state (a, b, run, menu, map, blaster…). */
    setButton(n, down) { setHeld(n, 'ui', !!down); input.lastDevice = 'touch'; },
    /** Release everything (blur, sheets…). */
    clear() {
      for (const [n, s] of held) if (s.size) { s.clear(); pendUp.set(n, (pendUp.get(n) || 0) + 1); }
      keys.clear(); joy.x = joy.y = 0;
    },
    /** Called once per frame by the core (order −1000). */
    update() {
      edgeDown.clear(); edgeUp.clear();
      pollGamepad();
      for (const n of pendDown.keys()) if (pendDown.get(n) > 0) { edgeDown.add(n); pendDown.set(n, 0); }
      for (const n of pendUp.keys()) if (pendUp.get(n) > 0 && !edgeDown.has(n)) { edgeUp.add(n); pendUp.set(n, 0); }
      if (edgeDown.has('runToggle')) runToggle = !runToggle;

      // analog sources first (joystick, gamepad), keyboard otherwise
      let sx = 0, sy = 0, analog = false;
      const jm = Math.hypot(joy.x, joy.y), gm = Math.hypot(gp.x, gp.y);
      if (jm > 0.02) { [sx, sy] = deadzone(joy.x, joy.y, jm); analog = true; }
      else if (gm > 0.02) { sx = gp.x; sy = gp.y; analog = true; }
      else {
        for (const k of keys) { const m = MOVE[k]; if (m) { sx += m[0]; sy += m[1]; } }
        const m = Math.hypot(sx, sy); if (m > 0) { sx /= m; sy /= m; }
      }
      const mag = Math.min(1, Math.hypot(sx, sy));
      input.moveScreen.x = sx; input.moveScreen.y = sy;
      const en = input.enabled;
      // screen right = (cos yaw, 0, −sin yaw), screen up (away from camera) = (−sin yaw, 0, −cos yaw)
      const yaw = getYaw?.() || 0, c = Math.cos(yaw), s = Math.sin(yaw);
      input.move.x = en && mag ? sx * c - sy * s : 0;
      input.move.z = en && mag ? -sx * s - sy * c : 0;
      input.move.mag = en ? mag : 0;

      const shift = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const autoRun = !!save?.state?.settings?.autoRun;
      // joystick at the edge no longer runs by itself: on a phone the thumb is almost always at the edge
      let run = isHeld('run') || runToggle;
      if (!analog) run = run || (autoRun ? !shift : shift);
      else if (autoRun && mag >= 0.7) run = true;
      input.run = run;
    },
  };

  /** Radial dead zone with a gentle response curve (fine control at small deflection). */
  function deadzone(x, y, m) {
    if (m < DEAD) return [0, 0];
    const t = Math.min(1, (m - DEAD) / (0.95 - DEAD));
    const out = 0.4 * t + 0.6 * t * t * (3 - 2 * t);          // smooth, slightly softer near centre; 1 at the edge
    return [(x / m) * out, (y / m) * out];
  }

  // ---- keyboard ----
  const typing = e => { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };
  window.addEventListener('keydown', e => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    input.lastDevice = 'keyboard';
    if (e.shiftKey && (e.code === 'KeyM' || e.code === 'KeyL')) {
      e.preventDefault();
      if (!e.repeat) bus?.emit(e.code === 'KeyM' ? 'cheat:money' : 'cheat:level');
      return;
    }
    if (MOVE[e.code] || e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.add(e.code);
    const n = KEYMAP[e.code];
    if (n) setHeld(n, 'kb:' + e.code, true);
    if (MOVE[e.code] || e.code === 'Tab' || e.code === 'Space' || e.code === 'Backspace') e.preventDefault();
  }, { passive: false });
  window.addEventListener('keyup', e => {
    keys.delete(e.code);
    const n = KEYMAP[e.code];
    if (n) setHeld(n, 'kb:' + e.code, false);
  });
  window.addEventListener('blur', () => input.clear());
  document.addEventListener('visibilitychange', () => { if (document.hidden) input.clear(); });
  window.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') { input.isTouch = true; input.lastDevice = 'touch'; } }, { passive: true, capture: true });

  // ---- gamepad ----
  function pollGamepad() {
    gp.x = gp.y = 0;
    let p = null;
    try { const pads = navigator.getGamepads ? navigator.getGamepads() : []; p = pads && [...pads].find(Boolean); } catch { p = null; }
    if (!p) return;
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0, m = Math.hypot(ax, ay);
    if (m > 0.18) { const k = Math.min(1, (m - 0.18) / 0.8) / m; gp.x = ax * k; gp.y = -ay * k; input.lastDevice = 'gamepad'; }
    // d-pad
    if (p.buttons[12]?.pressed) gp.y = 1; if (p.buttons[13]?.pressed) gp.y = -1;
    if (p.buttons[14]?.pressed) gp.x = -1; if (p.buttons[15]?.pressed) gp.x = 1;
    for (const [i, name] of Object.entries(GP_BUTTONS)) {
      const v = !!p.buttons[i]?.pressed;
      if (v !== !!gpPrev[i]) { setHeld(name, 'gp' + i, v); input.lastDevice = 'gamepad'; }
      gpPrev[i] = v;
    }
  }

  return input;
}
