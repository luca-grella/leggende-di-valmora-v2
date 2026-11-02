// Dialogue: ui.say / ui.choose wrapped with the close-up camera, letterbox bars and acting
// (the speaker turns to the listener, talks with mouth + gesture + expression, the player looks back).
// Consecutive lines keep the shot: the camera only glides back to explore a moment after the last line,
// so conversations made of several say() calls never bounce. Contract: docs/ARCHITECTURE.md story.dialogue.
//
// say(speaker, lines, {actor?, listener?, camera='dialog'|'portrait'|'none', expression?, gesture?, color?})
//   lines: string | (string | {t, e?: expression, g?: gesture})[]
// choose(title, options, {actor?, cancel=true, style?}) → index | -1
// Extras (story-private, also used by romance if it wants): narrate(lines), hold(), release(), required(...).

const GESTURES = new Set(['talk_gesture', 'wave', 'nod', 'shake_head', 'point', 'laugh', 'surprised', 'cheer', 'defeat', 'think']);

export function createDialogue(ctx) {
  const K = () => ctx.story.kit;
  const cam = { on: false, key: null, rel: null, release: null, holds: 0, actors: new Set(), token: 0 };

  const playerHuman = () => ctx.player?.human || null;
  const playerObj = () => ctx.player?.object || ctx.cameraRig?.followed || null;
  const headOf = h => h?.head || h?.object || null;

  async function shoot(actor, listener, kind) {
    const a = K().objOf(actor), b = K().objOf(listener) || playerObj();
    if (!a || !ctx.cameraRig?.closeUp) return;
    const key = kind + ':' + (a.uuid || '') + ':' + (b?.uuid || '');
    clearTimeout(cam.rel); cam.rel = null; cam.token++;
    if (!cam.on) {
      cam.on = true;
      cam.release = ctx.busy.push('dialog');
      try { ctx.ui?.letterbox?.(true); } catch { /* ui optional */ }
    }
    if (cam.key === key) return;
    const first = !cam.key;
    cam.key = key;
    const args = kind === 'portrait' ? { target: a, side: 1 } : { a, b };
    try { ctx.cameraRig.closeUp(kind === 'portrait' ? 'portrait' : 'dialog', args, { dur: first ? 0.75 : 0.55 }); } catch (e) { console.warn('[dialogue] camera', e); }
  }

  function scheduleRelease() {
    if (!cam.on || cam.holds > 0) return;
    const token = ++cam.token;
    // loop-time debounce: the next say() in the same conversation cancels it
    K().wait(0.22).then(() => { if (token === cam.token && cam.holds === 0) endShot(); });
  }

  function endShot() {
    if (!cam.on) return;
    cam.on = false; cam.key = null;
    try { ctx.ui?.letterbox?.(false); } catch { /* ui optional */ }
    for (const h of cam.actors) { try { h.lookAt?.(null); h.setExpression?.('neutral', { dur: 0.4 }); } catch { /* actor optional */ } }
    cam.actors.clear();
    try { playerHuman()?.lookAt?.(null); } catch { /* optional */ }
    const rel = cam.release; cam.release = null;
    const busyElse = ctx.busy.tags.some(t => t === 'battle' || t === 'scene');
    const p = busyElse ? Promise.resolve() : (ctx.cameraRig?.release?.({ dur: 0.7 }) || Promise.resolve());
    rel?.();
    return p;
  }

  function chunks(lines) {
    const list = Array.isArray(lines) ? lines : [lines];
    const out = [];
    let cur = null;
    for (const l of list) {
      if (l == null || l === '') continue;
      if (typeof l === 'string') { if (!cur) out.push(cur = { lines: [] }); cur.lines.push(l); }
      else { out.push({ lines: [l.t], e: l.e, g: l.g }); cur = null; }
    }
    return out;
  }

  async function act(human, { expression, gesture }) {
    if (!human) return;
    try {
      if (expression) human.setExpression?.(expression, { dur: 0.25 });
      if (gesture && GESTURES.has(gesture)) human.play?.(gesture, { loop: false, fade: 0.25 })?.then?.(() => human.play?.('idle', { fade: 0.35 }));
    } catch (e) { console.warn('[dialogue] act', e); }
  }

  const dlg = {
    async say(speaker, lines, opts = {}) {
      const { actor = null, listener = null, camera = 'dialog', expression, gesture, color } = opts;
      const human = K().humanOf(actor);
      const list = chunks(lines);
      if (!list.length) return;
      if (actor && camera !== 'none') await shoot(actor, listener, camera);
      const lh = K().humanOf(listener) || playerHuman();
      if (human) {
        cam.actors.add(human);
        try { human.lookAt?.(headOf(lh) || playerObj()); } catch { /* optional */ }
        try { lh?.lookAt?.(headOf(human)); } catch { /* optional */ }
      }
      cam.holds++;
      try {
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          await act(human, { expression: c.e || (i === 0 ? expression : null), gesture: c.g || (i === 0 ? gesture : null) });
          try { human?.talk?.(true); } catch { /* optional */ }
          try {
            if (ctx.ui?.say) await ctx.ui.say(speaker || '', c.lines, { color });
            else if (ctx.isDebug) console.info(`[say] ${speaker ? speaker + ': ' : ''}${c.lines.join(' / ')}`);
          } finally { try { human?.talk?.(false); } catch { /* optional */ } }
        }
      } finally { cam.holds--; scheduleRelease(); }
    },

    async choose(title, options, opts = {}) {
      const { actor = null, cancel = true, style } = opts;
      if (actor) await shoot(actor, opts.listener, 'dialog');
      cam.holds++;
      try {
        if (!ctx.ui?.choose) return cancel ? -1 : 0;
        const r = await ctx.ui.choose(title, options, { cancel, style });
        return typeof r === 'number' ? r : -1;
      } finally { cam.holds--; scheduleRelease(); }
    },

    /** A choice that must be answered (no cancel); after 3 cancels (e.g. a stub UI) the first enabled option wins. */
    async required(title, options, opts = {}) {
      for (let i = 0; i < 3; i++) {
        const r = await dlg.choose(title, options, { ...opts, cancel: false });
        if (r >= 0 && r < options.length && !options[r].disabled) return r;
      }
      return Math.max(0, options.findIndex(o => !o.disabled));
    },

    /** Narration box (no speaker, no camera change). */
    narrate(lines, opts = {}) { return dlg.say('', lines, { ...opts, camera: 'none' }); },

    /** Keep the current shot (and the dialog busy lock) across non-dialogue steps of a scene. */
    hold() { cam.holds++; let done = false; return () => { if (done) return; done = true; cam.holds--; scheduleRelease(); }; },
    /** End the close-up now. */
    release() { cam.token++; return endShot() || Promise.resolve(); },
    get active() { return cam.on; },
    /** Forget the current framing (a scene moved the camera): the next say() re-frames its speaker. */
    invalidate() { cam.key = null; },
  };
  return dlg;
}
