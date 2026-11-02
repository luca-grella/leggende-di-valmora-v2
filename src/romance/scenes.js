// Romance scenes, acted with the real characters: the player's Human and her Npc's Human, posed with
// ctx.actors.stagePair (pair kinds from docs/ARCHITECTURE.md) and framed by romance close-ups (cams.js:
// faces and shoulders only). Three scene kinds:
//   date(girl)          first date at her spot at her favourite time: she waits, a walk together, the view,
//                       the first kiss, she invites you home
//   home(girl)          evening at her place: candles, talk on the sofa, up to 3 rounds of ALLOWED_CHOICES, then
//                       the night is implied (lie_blanket + top framing, heads and shoulders only) → morning after
//   outing(girl, kind)  osteria / scooter / bagno / picnic with props, extras and choices (outings.js)
// Every intimate menu goes through validateChoices(); innocent extras through validateExtras().
// Limits (docs/GDD.md "Romance"): characters stay clothed, no nudity/anatomy, nothing explicit is shown or
// described, foot actions are medium two-shots of both faces, never a foot close-up.
import * as THREE from 'three';
import { ALLOWED_CHOICES, CHOICE_FX, CHOICE_GROUPS, validateChoices, choiceLines } from './choices.js';
import { OUTINGS, EXTRAS, validateExtras, inHours } from './outings.js';
import { MOODS, BOND_LINES, NARRATION, EXPRESSION } from './moods.js';
import { WHEN, TOWN_NAMES } from './girls.js';
import { createCams } from './cams.js';
import { createHearts, createMotes, createSplash, scatter } from './fx.js';
import { buildTable, buildPicnic, buildBeach, buildCandles, buildScooterFallback } from './props.js';
import { createClock, createSafe, pick, sample, fill } from './util.js';

const TAU = Math.PI * 2;
const WARM = { warmth: 0.22, saturation: 1.14, vignette: 0.4 };
const NEUTRAL = { warmth: 0.06, saturation: 1.08, vignette: 0.22 };
/** Baseline gap (m) for pair kinds acted face to face, used only when Actors did not pose the pair. */
const GAP = { face: 1.0, kiss: 0.56, hug: 0.5, whisper: 0.55, ear_nibble: 0.55, kiss_neck: 0.55, stroke_hair: 0.6, guide: 0.6 };
/** Pair kinds acted on a seat (sofa, cushion); the others stand/kneel on the floor. */
const SEATED = new Set(['sit_bench', 'massage_feet', 'kiss_feet']);
const SIDE_BY_SIDE = new Set(['walk_together', 'scooter_ride', 'sit_bench', 'sit_ground', 'picnic_lap', 'lie_blanket', 'swim']);
const opt = id => ({ label: ALLOWED_CHOICES[id].label, icon: ALLOWED_CHOICES[id].icon });

/**
 * @param {any} ctx
 * @param {{state?:(id:string)=>any, tier?:(id:string)=>number, line?:(girl:any,key:string)=>any, refresh?:(id:string)=>void,
 *          clock?:any, safe?:any}} [hooks] provided by romance/index.js (optional, the contract signature holds)
 */
export function createScenes(ctx, hooks = {}) {
  const clock = hooks.clock || createClock(ctx);
  const S = hooks.safe || createSafe(ctx);
  const cams = createCams(ctx);
  const hearts = createHearts(ctx);
  const splash = createSplash(ctx);
  clock.tick(dt => { hearts.update(dt); splash.update(dt); });
  let current = null;

  // ---- data helpers ---------------------------------------------------------------------------
  const gstate = id => hooks.state?.(id) || { stage: 0, bond: 0, dates: 0, nights: 0, outings: {} };
  const tier = id => hooks.tier?.(id) ?? (gstate(id).bond >= 5 ? 2 : gstate(id).bond >= 2 ? 1 : 0);
  const vars = girl => ({ name: girl.name, town: TOWN_NAMES[girl.town] || girl.town, when: WHEN[girl.when]?.short || '' });
  /** Her line set for a key: per-girl override (non-empty) → personality → []. */
  function lines(girl, key) {
    if (hooks.line) return hooks.line(girl, key);
    const own = girl.lines?.[key];
    if (Array.isArray(own) ? own.length : own) return own;
    return MOODS[girl.mood]?.[key] || [];
  }
  const L = (girl, key) => { const l = lines(girl, key); return (Array.isArray(l) ? l : [l]).filter(Boolean).map(s => fill(s, vars(girl))); };
  const one = (girl, key) => fill(pick(lines(girl, key)), vars(girl));
  const bondLine = girl => pick(BOND_LINES[tier(girl.id)] || BOND_LINES[0]);
  const heartsText = id => '❤'.repeat(1 + tier(id)) + '♡'.repeat(2 - tier(id));

  // ---- performers -----------------------------------------------------------------------------
  function placeholderHuman(color) {
    const object = new THREE.Group();
    const head = new THREE.Object3D(); head.position.y = 1.55; object.add(head);
    const geo = ctx.kit?.capsule ? ctx.kit.capsule(0.22, 0.9, 4, 10) : new THREE.CapsuleGeometry(0.22, 0.9, 4, 10);
    const body = new THREE.Mesh(geo, ctx.toon.mat(color));
    body.position.y = 0.78; object.add(body);
    return {
      object, head, height: 1.6, placeholder: true,
      teleport(x, z, f) { object.position.set(x, S.groundY(x, z), z); if (f != null) object.rotation.y = f; },
      dispose() { object.removeFromParent(); geo.dispose(); },
    };
  }

  const playerLook = () => ctx.player?.look || ctx.save.state.player?.look || ctx.actors?.looks?.player || null;

  /** The two performers: the real player/her Npc humans, or temporary stand-ins (sandbox, missing areas). */
  function cast(girl) {
    const temps = [];
    const make = (look, id, name, color) => {
      let h = null;
      try { h = ctx.actors?.createHuman?.(look, { id, name }) || null; } catch (e) { console.warn('[romance] createHuman', e); }
      if (!h?.object) h = placeholderHuman(color);
      if (!h.object.parent) ctx.scene.add(h.object);
      temps.push(h);
      return h;
    };
    const a = ctx.player?.human || make(playerLook() || { sex: 'm', age: 'adult' }, 'romance.me', 'Tu', '#4fa3e0');
    const b = girl.npc?.human || make(girl.look, 'romance.' + girl.id, girl.name, girl.color || '#ff6fa3');
    return { a, b, temps };
  }

  /**
   * Stage a pair kind. Actors does the real posing; if it left both performers where they were (stub or
   * missing area) a simple face-to-face / side-by-side baseline keeps the scene readable.
   */
  async function pose(sc, kind, where, extra = {}) {
    // `where` is an anchor or a function kind → anchor (e.g. seated kinds on the sofa, standing ones in front of it)
    const anchor = typeof where === 'function' ? where(kind) : where;
    const pa = S.worldPos(sc.a).clone(), pb = S.worldPos(sc.b).clone();
    let staged = false, res = null;
    if (ctx.actors?.stagePair) {
      // fade 0: the scene does its own fades; between poses Actors glides smoothly
      const o = { a: sc.a, b: sc.b, anchor, fade: 0, ...(anchor?.opts || {}), ...extra };
      try { res = await ctx.actors.stagePair(kind, o); staged = true; } catch (e) { console.warn('[romance] stagePair', kind, e); }
    }
    // the real stagePair returns its pair record; a stub returns nothing and leaves both where they were
    const moved = S.worldPos(sc.a).distanceTo(pa) > 0.01 || S.worldPos(sc.b).distanceTo(pb) > 0.01;
    const posed = staged && (!!res || moved);
    if (!posed) baseline(sc, kind, anchor);
    sc.pair = kind; sc.anchor = anchor;
    // let the new clips settle a few frames so close-ups are computed from the real head positions
    await clock.wait(0.12);
    return posed;
  }

  /** Clips used by the baseline staging (a = him, b = her). */
  const BASE_CLIPS = {
    walk_together: ['walk', 'walk'], sit_bench: ['sit_idle', 'sit_idle'], sit_table: ['sit_idle', 'sit_idle'], sit_ground: ['sit_ground', 'sit_ground'],
    picnic_lap: ['lie_back', 'sit_ground'], lie_blanket: ['sleep', 'sleep'], scooter_ride: ['ride_scooter', 'ride_scooter'], swim: ['swim', 'swim'],
    massage_feet: ['kneel', 'sit_idle'], kiss_feet: ['kneel', 'sit_idle'], massage_legs: ['kneel', 'sit_idle'],
  };

  function baseline(sc, kind, an) {
    const [ca, cb] = BASE_CLIPS[kind] || ['idle', 'idle'];
    S.play(sc.a, ca, { fade: 0.4 }); S.play(sc.b, cb, { fade: 0.4 });
    if (kind === 'kiss') { S.expr(sc.a, 'kiss'); S.expr(sc.b, 'kiss'); }
    const f = an.facing || 0, dx = Math.sin(f), dz = Math.cos(f);
    if (SIDE_BY_SIDE.has(kind)) {
      // side by side, both facing `facing` (he on her left); on the scooter she sits behind him
      if (kind === 'scooter_ride') { S.teleport(sc.a, an.x, an.z, f); S.teleport(sc.b, an.x - dx * 0.32, an.z - dz * 0.32, f); return; }
      const sx = Math.cos(f) * 0.34, sz = -Math.sin(f) * 0.34;
      S.teleport(sc.a, an.x + sx, an.z + sz, f);
      S.teleport(sc.b, an.x - sx, an.z - sz, f);
      return;
    }
    const gap = GAP[kind] ?? 0.85;
    S.teleport(sc.a, an.x - dx * gap / 2, an.z - dz * gap / 2, f);
    S.teleport(sc.b, an.x + dx * gap / 2, an.z + dz * gap / 2, f + Math.PI);
  }

  /** Anchor from a POI or point; y defaults to the ground. */
  const anchorOf = (p, facing = p?.facing ?? 0, extra = {}) => (p ? { x: p.x, y: p.y ?? S.groundY(p.x, p.z), z: p.z, facing, ...extra } : null);

  // ---- scene lifecycle ------------------------------------------------------------------------
  async function open(girl, kind) {
    if (current) return null;
    const release = ctx.busy.push('scene');
    const { a, b, temps } = cast(girl);
    const pobj = ctx.player?.object;
    const sc = {
      girl, kind, a, b, temps, release, extras: [], restore: [], pair: null, anchor: null, riding: false,
      playerStart: pobj ? { x: pobj.position.x, z: pobj.position.z, facing: ctx.player.facing ?? pobj.rotation.y } : null,
      npcStart: girl.npc?.object ? { x: girl.npc.object.position.x, z: girl.npc.object.position.z, facing: girl.npc.object.rotation.y } : null,
      music: ctx.audio?.track || null,
    };
    current = sc;
    try { girl.npc?.freeze?.(true); } catch { /* optional */ }
    try { ctx.player?.setControl?.(false); } catch { /* optional */ }
    const hide = o => { if (!o) return; const v = o.visible; o.visible = false; sc.restore.push(() => { o.visible = v; }); };
    if (temps.includes(a) && pobj && pobj !== a.object) hide(pobj);
    if (temps.includes(b) && girl.npc?.object) hide(girl.npc.object);
    // the ❤ over her head would cover faces in close-ups (index.js restores it via hooks.refresh)
    try { girl.npc?.setMarker?.(null); } catch { /* optional */ }
    // a talk that led here may still hold the dialogue close-up: end it (the camera stays, we own it now)
    try { await ctx.story?.dialogue?.release?.(); } catch { /* optional */ }
    S.letterbox(true);
    S.music('romance');
    S.grade(WARM);
    ctx.bus.emit('romance:scene', { id: girl.id, kind, open: true });
    return sc;
  }

  async function close(sc, { place = 'stay', fade = true } = {}) {
    const finish = async () => {
      try { if (sc.pair && ctx.actors?.endPair) await ctx.actors.endPair({ a: sc.a, b: sc.b, fade: 0 }); } catch (e) { console.warn('[romance] endPair', e); }
      sc.riding = false;
      for (const r of sc.restore.splice(0).reverse()) { try { r(); } catch (err) { console.warn('[romance] restore', err); } }
      for (const e of sc.extras.splice(0)) { try { e.dispose?.(); } catch (err) { console.warn('[romance] dispose', err); } }
      for (const t of sc.temps) { try { t.dispose?.(); } catch { /* optional */ } t.object?.removeFromParent?.(); }
      hearts.clear();
      // where the player ends up
      if (place === 'start' && sc.playerStart) teleportPlayer(sc.playerStart.x, sc.playerStart.z, sc.playerStart.facing);
      else if (place && typeof place === 'object') teleportPlayer(place.x, place.z, place.facing);
      else if (!sc.temps.includes(sc.a)) { const p = S.worldPos(sc.a); teleportPlayer(p.x, p.z, sc.a.object.rotation.y); }
      // she goes back to her usual spot
      const npc = sc.girl.npc;
      if (sc.npcStart && npc) S.teleport(npc.human || npc, sc.npcStart.x, sc.npcStart.z, sc.npcStart.facing);
      cams.stop();
      try { await ctx.cameraRig?.release?.({ dur: 0 }); } catch { /* optional */ }
      try { ctx.cameraRig?.snap?.(); } catch { /* optional */ }
    };
    if (fade) await S.through(finish, { ms: 500 }); else await finish();
    S.letterbox(false);
    S.grade(NEUTRAL);
    if (sc.music && sc.music !== 'romance') S.music(sc.music);
    try { ctx.player?.setControl?.(true); } catch { /* optional */ }
    try { sc.girl.npc?.freeze?.(false); } catch { /* optional */ }
    for (const h of [sc.a, sc.b]) { try { h.lookAt?.(null); h.setExpression?.('neutral', { dur: 0.4 }); h.play?.('idle', { fade: 0.3 }); } catch { /* optional */ } }
    ctx.bus.emit('romance:scene', { id: sc.girl.id, kind: sc.kind, open: false });
    sc.release();
    current = null;
    hooks.refresh?.(sc.girl.id);
    try { ctx.save.commit(); } catch { /* optional */ }
  }

  function teleportPlayer(x, z, facing) {
    try {
      if (ctx.player?.teleport) ctx.player.teleport(x, z, facing);
      else if (ctx.player?.object) { ctx.player.object.position.set(x, S.groundY(x, z), z); if (facing != null) ctx.player.object.rotation.y = facing; }
    } catch (e) { console.warn('[romance] player teleport', e); }
  }

  /** Swap a Human's look for the scene (while the screen is faded) and restore it on close. */
  function dress(sc, h, look) {
    if (!h?.setLook || !look) return;
    const before = h.look;
    try { h.setLook(look); } catch (e) { console.warn('[romance] setLook', e); return; }
    sc.restore.push(() => { try { h.setLook(before); } catch { /* optional */ } });
  }
  const homeLook = g => ({ ...g.look, ...(g.homeLook || {}), hat: null });
  const swimLook = g => ({
    ...g.look, top: { style: 'swimsuit', color: g.swim?.color || g.color || '#26c6da', accent: '#ffffff' },
    bottom: { style: 'none', color: g.swim?.color || '#26c6da' }, shoes: { style: 'barefoot', color: g.look.skin }, hat: null, accessory: null,
  });
  const playerSwimLook = () => {
    const l = playerLook() || { sex: 'm', age: 'adult' };
    return { ...l, top: { style: 'tank', color: '#ffffff', accent: '#4fa3e0' }, bottom: { style: 'swim_shorts', color: '#1e88e5' }, shoes: { style: 'barefoot', color: l.skin || '#e0ac69' }, hat: null, accessory: null };
  };

  /** Ambient motes for an outdoor set: fireflies at night, drifting petals by day/sunset. */
  function ambience(sc, center) {
    const m = ctx.time?.isNight
      ? createMotes(ctx, scatter(center, 26, { rx: 4, rz: 4, y0: 0.4, y1: 2.6 }), { mode: 'fireflies', color: '#d8ff7a', core: '#ffffe0', size: 0.11 })
      : createMotes(ctx, scatter(center, 22, { rx: 3.5, rz: 3.5, y0: 0, y1: 0.4 }), { mode: 'petals', color: '#ff8fb8', core: '#ffe3ee', size: 0.16, range: 3.2 });
    ctx.scene.add(m.object);
    sc.extras.push(m);
    sc.restore.push(clock.tick(dt => m.update(dt)));
  }

  function addProp(sc, prop) {
    if (!prop) return null;
    if (!prop.object.parent) ctx.scene.add(prop.object);
    sc.extras.push(prop);
    if (prop.update) sc.restore.push(clock.tick(dt => prop.update(dt)));
    return prop;
  }

  const sayHer = (sc, list, o = {}) => S.say(sc.girl.name, list, { actor: sc.b, listener: sc.a, ...o });
  const narrate = list => S.say('', list, { camera: 'none' });
  const heartsAt = (h, n, o) => { const p = S.headPos(h); p.y += 0.25; hearts.burst(p, n, o); };
  const race = (p, sec) => Promise.race([Promise.resolve(p).catch(() => {}), clock.wait(sec)]);

  /** She reacts and talks: expression first, a small gesture, then the line. */
  async function react(sc, expr, list, gesture) {
    S.expr(sc.b, expr, { dur: 0.3 });
    if (gesture) S.play(sc.b, gesture, { loop: false, fade: 0.3 });
    await sayHer(sc, list);
  }

  // ---- intimate choices -----------------------------------------------------------------------
  function choiceText(girl, id) {
    const own = girl.lines?.choices?.[id];
    const list = own?.length ? own : choiceLines(girl.mood, id);
    return fill(pick(list), vars(girl));
  }
  function guideLines(girl) {
    const own = girl.lines?.guide;
    const sets = own?.length ? own : MOODS[girl.mood]?.guide || [choiceLines(girl.mood, 'guide')];
    const set = pick(sets);
    return (Array.isArray(set) ? set : [set]).map(s => fill(s, vars(girl)));
  }

  /** Act one ALLOWED_CHOICES id: pair pose, close-up, hearts, sound and her personal line. */
  async function act(sc, id, anchor) {
    validateChoices([id]);
    const c = ALLOWED_CHOICES[id], fx = CHOICE_FX[id] || {};
    if (!c.pair) return;
    const posed = await pose(sc, c.pair, anchor);
    if (!posed) { S.lookAt(sc.a, sc.b.head || sc.b.object); S.lookAt(sc.b, sc.a.head || sc.a.object, { weight: 0.6 }); }
    // feet actions: medium two-shot of both faces (never a foot close-up); everything else tighter
    await cams.two(sc.a, sc.b, { tight: !!fx.tight, dur: 1.0 });
    if (id === 'whisper') await narrate(NARRATION.whisper);
    await clock.wait(0.35);
    S.sfx(fx.sfx || 'heart'); S.haptic(fx.hearts > 2 ? [12, 40, 12] : 10);
    heartsAt(sc.b, fx.hearts || 1);
    hooks.counted?.(sc.girl.id, id);
    await react(sc, EXPRESSION[sc.girl.mood]?.[id] || 'smile', [choiceText(sc.girl, id)]);
  }

  /**
   * Menu of allowed choices (grouped when long, so it fits an iPhone), optional innocent extras, guide and stop.
   * Returns a choice id, 'guide', 'stop', {extra: id} or null.
   */
  async function menu(sc, title, allow, { guide = false, stop = true, extras = [] } = {}) {
    const ids = validateChoices(allow.slice());
    validateExtras(extras);
    const groups = CHOICE_GROUPS.map(g => ({ ...g, items: g.items.filter(i => ids.includes(i)) })).filter(g => g.items.length);
    const flat = ids.length <= 4;
    for (;;) {
      const opts = [];
      if (flat) for (const id of ids) opts.push({ kind: 'choice', id, ...opt(id) });
      else for (const g of groups) {
        opts.push(g.items.length === 1 ? { kind: 'choice', id: g.items[0], ...opt(g.items[0]) }
          : { kind: 'group', g, label: g.label, icon: g.icon, sub: g.items.map(i => ALLOWED_CHOICES[i].label).join(' · ') });
      }
      for (const e of extras) opts.push({ kind: 'extra', id: e, label: EXTRAS[e].label, icon: EXTRAS[e].icon });
      if (guide) opts.push({ kind: 'choice', id: 'guide', ...opt('guide') });
      if (stop) opts.push({ kind: 'choice', id: 'stop', ...opt('stop') });
      validateChoices(opts.filter(o => o.kind === 'choice').map(o => o.id));
      const i = await S.choose(title, opts.map(({ label, icon, sub }) => ({ label, icon, sub })), { cancel: false });
      const o = opts[i] || opts[0];
      if (!o) return null;
      if (o.kind === 'group') {
        const sub = validateChoices(o.g.items.slice());
        const j = await S.choose(`${o.g.icon} ${o.g.label}`, sub.map(opt), { cancel: true });
        if (j < 0 || j >= sub.length) continue;
        return sub[j];
      }
      return o.kind === 'extra' ? { extra: o.id } : o.id;
    }
  }

  // ---- the night (implied only) ----------------------------------------------------------------
  async function placeInBed(sc, bed) {
    const posed = await pose(sc, 'lie_blanket', bed);
    await clock.wait(0.6);                                   // the screen is black: let the glide finish
    S.expr(sc.b, 'smile'); S.expr(sc.a, 'smile');
    // from above the pillows: heads and shoulders, Actors' blanket covers the rest
    if (posed && bed.bed) { await cams.top(sc.a, sc.b, bed.facing ?? 0, { dur: 0 }); return; }
    // fallback (no lying pose available): cuddled up side by side on the edge of the bed, soft two-shot
    const f = bed.facing ?? 0, ox = Math.cos(f), oz = -Math.sin(f), hx = Math.sin(f), hz = Math.cos(f);
    const edge = bed.bed ? 1.0 : 0;
    const cx = bed.x + ox * edge, cz = bed.z + oz * edge, out = Math.atan2(ox, oz);
    S.teleport(sc.a, cx + hx * 0.3, cz + hz * 0.3, out); S.teleport(sc.b, cx - hx * 0.3, cz - hz * 0.3, out);
    S.play(sc.a, 'sit_idle', { fade: 0 }); S.play(sc.b, 'sit_idle');
    S.lookAt(sc.b, sc.a.head || sc.a.object, { weight: 0.5 });
    await cams.two(sc.a, sc.b, { dur: 0, side: 1 });
  }

  /** how: 'guide' (she leads, allusive lines), 'continue' (cuddles) or 'stop' (just sleep together). */
  async function night(sc, bed, how) {
    const g = sc.girl;
    if (how === 'guide') {
      await pose(sc, 'guide', sc.floor || sc.anchor || bed, { distance: 1.2 });
      await cams.two(sc.a, sc.b, { tight: true, dur: 1.2 });
      const gl = guideLines(g);
      S.expr(sc.b, EXPRESSION[g.mood]?.guide || 'smile');
      heartsAt(sc.b, 4, { spread: 0.5 });
      S.sfx('heart');
      await sayHer(sc, [gl[0]]);
      await S.fadeOut(900, '#1a0f24');
      await clock.wait(0.5);
      await narrate([pick(NARRATION.later)]);
      await placeInBed(sc, bed);
      await S.fadeIn(1200);
      if (gl.length > 1) await sayHer(sc, gl.slice(1), { expression: 'blush' });
    } else {
      if (how === 'stop') await react(sc, 'smile', [one(g, 'stop')]);
      await S.fadeOut(800, '#1a0f24');
      await placeInBed(sc, bed);
      await S.fadeIn(1100);
    }
    S.expr(sc.b, 'sleepy', { dur: 0.6 });
    await sayHer(sc, [one(g, 'bed')]);
    heartsAt(sc.b, 2, { size: 0.16, rise: 0.6 });
    await narrate([pick(NARRATION.night)]);
    // the night passes: a long fade to the morning
    await S.fadeOut(1400, '#0b0820');
    try { ctx.time?.skipTo?.(8); } catch { /* optional */ }
    await clock.wait(0.6);
    await narrate(NARRATION.morning);
    await S.fadeIn(1400);
    S.expr(sc.b, 'sleepy');
    await clock.wait(0.8);
    S.expr(sc.b, 'smile', { dur: 0.6 });
    await sayHer(sc, L(g, 'morning'));
    heartsAt(sc.b, 3);
    S.sfx('heart');
  }

  // ---- places ------------------------------------------------------------------------------------
  function dateSpot(girl) {
    for (const id of [...(girl.dateSpot || []), `${girl.town}.date`, `${girl.town}.viewpoint`, `${girl.town}.plaza`, girl.poi]) {
      const p = S.poi(id);
      if (p) return p;
    }
    return null;
  }

  /** Direction from a point towards the open view (the water, if any around), else the POI facing. */
  function viewYaw(p) {
    let best = null;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      let w = 0;
      for (let r = 4; r <= 24; r += 4) if (S.isWater(p.x + Math.sin(a) * r, p.z + Math.cos(a) * r)) w++;
      if (w && (!best || w > best.w)) best = { a, w };
    }
    return best ? best.a : (p.facing ?? 0);
  }

  // ---- date --------------------------------------------------------------------------------------
  async function date(girl) {
    const sc = await open(girl, 'date');
    if (!sc) return false;
    let kissed = false;
    try {
      const spot = dateSpot(girl) || S.worldPos(ctx.player?.object || sc.a);
      const vy = viewYaw(spot);
      const fx = Math.sin(vy), fz = Math.cos(vy);
      const gy = S.groundY(spot.x, spot.z);
      // she waits at the spot looking at the view, he arrives from behind
      await S.through(async () => {
        S.teleport(sc.b, spot.x, spot.z, vy);
        S.teleport(sc.a, spot.x - fx * 2.6 + fz * 0.7, spot.z - fz * 2.6 - fx * 0.7, vy);
        ambience(sc, { x: spot.x, y: gy, z: spot.z });
        S.play(sc.b, 'idle_look', { fade: 0.2 });
        S.play(sc.a, 'idle', { fade: 0.2 });
        await cams.wide({ x: spot.x - fx * 1.2, y: gy, z: spot.z - fz * 1.2 }, vy, { dist: 4.8, height: 1.7, dur: 0 });
      }, { ms: 500 });
      await clock.wait(0.6);
      // she turns, smiles and waves; he walks up to her
      const pa = S.worldPos(sc.a).clone();
      S.face(sc.b, { x: pa.x, z: pa.z }, { dur: 0.6 });
      await clock.wait(0.45);
      S.expr(sc.b, girl.mood === 'timida' ? 'shy' : 'smile');
      Promise.resolve(S.play(sc.b, 'wave', { loop: false, fade: 0.25 })).then(() => S.play(sc.b, 'idle', { fade: 0.35 }));
      S.lookAt(sc.b, sc.a.head || sc.a.object);
      await race(sc.a.moveTo?.({ x: spot.x - fx * 0.95, z: spot.z - fz * 0.95 }, { stopDist: 0.1 }), 3);
      await pose(sc, 'face', anchorOf({ x: spot.x - fx * 0.5, z: spot.z - fz * 0.5 }, vy + Math.PI));
      await cams.over(sc.a, sc.b);
      await sayHer(sc, L(girl, 'date'), { expression: girl.mood === 'timida' ? 'shy' : 'smile' });

      // a short walk together towards the view, tracked from the side
      const goal = { x: spot.x + fx * 2.0, z: spot.z + fz * 2.0 };
      const free = k => { const x = spot.x + fx * k, z = spot.z + fz * k; return S.walkable(x, z) && !S.isWater(x, z); };
      const walkOk = free(0.8) && free(1.6) && free(2.4) && !!sc.a.moveTo && !!sc.b.moveTo;
      // hand in hand: Actors strolls them `distance` metres forward
      const strolled = walkOk && await pose(sc, 'walk_together', anchorOf({ x: spot.x - fx * 0.6, z: spot.z - fz * 0.6 }, vy), { distance: 2.6 });
      const tA = new THREE.Vector3(), tB = new THREE.Vector3(), mid = new THREE.Vector3();
      const live = () => { S.headPos(sc.a, tA); S.headPos(sc.b, tB); return mid.addVectors(tA, tB).multiplyScalar(0.5); };
      ctx.cameraRig?.shot?.({
        position: () => { const m = live(); return new THREE.Vector3(m.x - fx * 3.0 + fz * 2.3, m.y + 0.45, m.z - fz * 3.0 - fx * 2.3); },
        target: () => { const m = live(); return new THREE.Vector3(m.x + fx * 0.6, m.y - 0.25, m.z + fz * 0.6); }, fov: 34,
      }, { dur: 1.2 });
      const sideX = Math.cos(vy) * 0.34, sideZ = -Math.sin(vy) * 0.34;
      if (strolled) await clock.wait(3.1);
      else if (walkOk) {
        await Promise.all([
          race(sc.a.moveTo({ x: goal.x + sideX, z: goal.z + sideZ }, { stopDist: 0.1 }), 4),
          race(sc.b.moveTo({ x: goal.x - sideX, z: goal.z - sideZ }, { stopDist: 0.1 }), 4),
        ]);
      } else await clock.wait(1.4);
      // the view
      const here = walkOk ? goal : spot;
      S.play(sc.a, 'idle', { fade: 0.4 }); S.play(sc.b, 'idle_look', { fade: 0.4 });
      S.face(sc.a, vy); S.face(sc.b, vy);
      await cams.panorama(sc.a, sc.b, vy);
      const spotLines = L(girl, 'spot');
      if (spotLines.length) await sayHer(sc, spotLines, { expression: 'smile' });
      await sayHer(sc, [bondLine(girl)]);

      // the moment
      const an = anchorOf(here, vy + Math.PI / 2);
      await pose(sc, 'face', an);
      await cams.two(sc.a, sc.b, { tight: false });
      S.expr(sc.b, girl.mood === 'audace' ? 'smug' : 'blush');
      let ch = await menu(sc, `${girl.name} ti guarda negli occhi...`, ['kiss', 'hug', 'whisper'], { stop: false });
      if (ch && ch !== 'kiss') {
        await act(sc, ch, an);
        S.expr(sc.b, 'blush');
        const nudge = { audace: 'E adesso? Non dirmi che ti fermi qui.', ironica: 'Tutto qui? ...Avanti, coraggio.', timida: 'E... e adesso?', dolce: 'E adesso... cosa aspetti?' };
        await sayHer(sc, [nudge[girl.mood] || nudge.dolce]);
        ch = await menu(sc, `${girl.name} chiude gli occhi...`, ['kiss'], { stop: true });
      }
      if (ch === 'kiss') {
        kissed = true;
        await act(sc, 'kiss', an);
        heartsAt(sc.b, 6, { spread: 0.6, size: 0.26 });
        S.sfx('heart'); S.haptic([15, 60, 15]);
        await sayHer(sc, L(girl, 'afterKiss'), { expression: girl.mood === 'timida' ? 'blush' : 'smile' });
      } else {
        await react(sc, 'smile', [girl.mood === 'timida' ? 'Va bene... andiamo piano. Mi piace anche così.' : 'Ok... sei un tipo misterioso. Mi piace.']);
      }
      await pose(sc, 'face', an);
      await cams.over(sc.a, sc.b);
      await sayHer(sc, L(girl, 'invite'), { expression: 'smile' });
    } catch (e) { console.warn('[romance] date', e); }
    await close(sc, { place: 'stay' });
    return { kissed };
  }

  // ---- evening at her place ----------------------------------------------------------------------
  async function home(girl) {
    const first = gstate(girl.id).stage < 3;
    const sc = await open(girl, 'home');
    if (!sc) return { night: false };
    let spent = false;
    try {
      // her NPC belongs inside her house for the evening (Actors only shows NPCs of the current place)
      if (girl.npc && 'interior' in girl.npc) {
        const prev = girl.npc.interior;
        girl.npc.interior = ctx.world?.interior || girl.home;
        sc.restore.push(() => { girl.npc.interior = prev; });
      }
      const H = girl.home;
      const door = S.poi(`${H}.door`), sofa = S.poi(`${H}.sofa`), bed = S.poi(`${H}.bed`), owner = S.poi(`${H}.owner`), table = S.poi(`${H}.table`), win = S.poi(`${H}.window`);
      const meet = owner || sofa || table || bed || door || S.worldPos(sc.a);
      const exit = door ? { x: door.x, z: door.z, facing: door.facing } : 'stay';
      const late = !(ctx.time?.isNight || ctx.time?.phase === 'sunset');
      await S.through(async () => {
        if (late) { try { ctx.time?.skipTo?.(20.5); } catch { /* optional */ } }
        dress(sc, sc.b, homeLook(girl));
        { const pl = playerLook(); if (pl?.hat) dress(sc, sc.a, { ...pl, hat: null }); }   // caps off indoors
        // candles on the table, by the bed and at the window; a heart of petals at the foot of the bed
        const clusters = [];
        if (table) clusters.push({ x: table.x, y: (table.y ?? S.groundY(table.x, table.z)) + 0.76, z: table.z, n: 3, seed: 1 });
        if (bed) {
          const f = bed.facing ?? 0, sx = Math.cos(f), sz = -Math.sin(f), by = bed.y ?? S.groundY(bed.x, bed.z);
          for (const s of [-1, 1]) clusters.push({ x: bed.x + sx * s * 1.15 + Math.sin(f) * 0.7, y: by, z: bed.z + sz * s * 1.15 + Math.cos(f) * 0.7, n: 4, seed: s + 2, plate: true });
        }
        if (win) clusters.push({ x: win.x, y: (win.y ?? S.groundY(win.x, win.z)) + 0.02, z: win.z, n: 3, seed: 5, plate: true });
        const petals = bed ? { x: bed.x - Math.sin(bed.facing ?? 0) * 1.6, y: bed.y ?? S.groundY(bed.x, bed.z), z: bed.z - Math.cos(bed.facing ?? 0) * 1.6, yaw: (bed.facing ?? 0) + Math.PI, size: 0.42 } : null;
        if (clusters.length) addProp(sc, buildCandles(ctx, clusters, { petals }));
        // she welcomes you inside
        const f = meet.facing ?? 0;
        S.teleport(sc.b, meet.x, meet.z, f);
        const pd = door || { x: meet.x + Math.sin(f) * 1.6, z: meet.z + Math.cos(f) * 1.6 };
        const ax = meet.x + (pd.x - meet.x) * 0.55, az = meet.z + (pd.z - meet.z) * 0.55;
        S.teleport(sc.a, ax, az, Math.atan2(meet.x - ax, meet.z - az));
        S.face(sc.b, { x: ax, z: az }, { dur: 0 });
        await cams.two(sc.a, sc.b, { dur: 0 });
      }, { ms: late ? 700 : 450 });
      if (late) await narrate(['Si fa sera...']);
      S.lookAt(sc.b, sc.a.head || sc.a.object); S.lookAt(sc.a, sc.b.head || sc.b.object);
      if (first) await sayHer(sc, L(girl, 'home'), { expression: girl.mood === 'timida' ? 'shy' : 'smile' });
      else await sayHer(sc, [one(girl, 'homeAgain'), bondLine(girl)], { expression: 'smile' });

      // later visits: an evening together or just a hello
      if (!first) {
        const i = await S.choose(`${girl.name} ${heartsText(girl.id)}`, [
          { label: 'Resta con lei stasera', icon: '🌙', sub: 'Candele, chiacchiere e coccole' },
          { label: 'Solo un saluto', icon: '👋' },
        ], { cancel: true });
        if (i !== 0) {
          await react(sc, 'smile', [one(girl, 'notNow')]);
          await close(sc, { place: exit });
          return { night: false };
        }
      }

      // anchors: seated kinds on the sofa, standing/kneeling ones on the floor in front of it (facing the bed)
      const f0 = sofa?.facing ?? meet.facing ?? 0;
      const seatA = sofa ? anchorOf(sofa, f0) : null;
      const floorP = sofa ? { x: sofa.x + Math.sin(f0) * 1.0, z: sofa.z + Math.cos(f0) * 1.0 } : meet;
      const floorA = anchorOf(floorP, bed ? Math.atan2(bed.x - floorP.x, bed.z - floorP.z) : f0 + Math.PI / 2);
      const where = kind => (seatA && SEATED.has(kind) ? seatA : floorA);
      sc.floor = floorA;
      // sit together on the sofa and talk
      await pose(sc, seatA ? 'sit_bench' : 'face', where);
      await clock.wait(0.4);
      await cams.two(sc.a, sc.b, { dur: 1.2 });
      await sayHer(sc, [pick(lines(girl, 'rounds'))], { expression: 'smile' });

      // up to 3 rounds; "Lasciati guidare da lei…" or "Basta così" end them early
      const all = Object.keys(ALLOWED_CHOICES).filter(k => k !== 'continue' && k !== 'stop' && k !== 'guide');
      let how = null;
      for (let r = 0; r < 3 && !how; r++) {
        const title = r === 0 ? `${girl.name} ${heartsText(girl.id)}` : fill(pick(lines(girl, 'rounds')), vars(girl)) || '...';
        const ch = await menu(sc, title, all, { guide: true, stop: true });
        if (ch === 'stop' || ch === 'guide') how = ch;
        else if (typeof ch === 'string') await act(sc, ch, where);
      }
      if (!how) {
        // after three rounds she takes your hand: it's late
        const ids = validateChoices(['guide', 'continue', 'stop']);
        const c = await S.choose(`${girl.name} ti prende la mano...`, ids.map(opt), { cancel: false });
        how = ids[c] || 'continue';
      }
      // bed anchor without y: Actors lays them on the mattress (floor + 0.5)
      await night(sc, bed ? { x: bed.x, z: bed.z, facing: bed.facing ?? 0, bed: true } : floorA, how);
      spent = true;
      // up and about: a last hug by the bed
      const wakeP = bed ? { x: bed.x - Math.sin(bed.facing ?? 0) * 1.6, z: bed.z - Math.cos(bed.facing ?? 0) * 1.6 } : floorA;
      await S.through(async () => {
        try { await ctx.actors?.endPair?.({ a: sc.a, b: sc.b, fade: 0 }); } catch { /* optional */ }
        await pose(sc, 'hug', anchorOf(wakeP, (bed?.facing ?? 0) + Math.PI / 2));
        await cams.two(sc.a, sc.b, { tight: true, dur: 0 });
      }, { ms: 400 });
      heartsAt(sc.b, 3);
      await sayHer(sc, [bondLine(girl)], { expression: 'smile' });
      await close(sc, { place: exit });
    } catch (e) {
      console.warn('[romance] home', e);
      if (current === sc) await close(sc, { fade: true });
    }
    return { night: spent };
  }

  // ---- outings -----------------------------------------------------------------------------------
  function outingSpot(girl, O) {
    for (const s of O.spot) { const p = S.poi(`${girl.town}.${s}`); if (p) return { p, town: girl.town }; }
    if (O.near) {
      // no beach in her town: the nearest beach town (a short trip, back home afterwards)
      for (const t of ['corallo', 'alba', 'sole', 'petalo']) { const p = S.poi(`${t}${O.near}`); if (p) return { p, town: t, away: t !== girl.town }; }
    }
    const p = dateSpot(girl);
    return p ? { p, town: girl.town } : null;
  }

  async function outing(girl, kind) {
    const O = OUTINGS[kind];
    if (!O) { console.warn('[romance] unknown outing', kind); return false; }
    validateChoices(O.only); validateExtras(O.extras);
    const where = outingSpot(girl, O);
    const sc = await open(girl, 'outing:' + kind);
    if (!sc) return false;
    let done = false;
    try {
      const spot = where?.p || S.worldPos(sc.a);
      const needSkip = !inHours(ctx.time?.hours ?? 12, O.hours);
      // she says yes where you asked her, then the scene cuts to the place
      S.lookAt(sc.b, sc.a.head || sc.a.object);
      await cams.two(sc.a, sc.b, { dur: 0.8 });
      await sayHer(sc, [one(girl, 'outingYes')], { expression: 'smile' });
      await S.through(async () => {
        if (needSkip) { try { ctx.time?.skipTo?.(O.skipTo); } catch { /* optional */ } }
        if (kind === 'bagno') { dress(sc, sc.b, swimLook(girl)); dress(sc, sc.a, playerSwimLook()); }
        await SETUP[kind](sc, spot);
      }, { ms: 650 });
      if (needSkip) await narrate([O.skipText]);
      if (where?.away) S.toast(`🌊 ${TOWN_NAMES[where.town] || where.town}`, { ms: 1800 });
      if (kind === 'scooter') await ride(sc, spot);

      await sayHer(sc, sample(O.lines, 2).map(s => fill(s, vars(girl))));
      await sayHer(sc, [bondLine(girl)], { expression: 'smile' });

      // rounds: the outing's innocent extras + its allowed choices
      for (let r = 0; r < (O.rounds || 2); r++) {
        const title = r === 0 ? `${O.icon} ${O.title} · ${girl.name} ${heartsText(girl.id)}` : `${girl.name} ti sorride...`;
        const ch = await menu(sc, title, O.only, { extras: O.extras, stop: true });
        if (ch === 'stop' || ch == null) break;
        if (typeof ch === 'object' && ch.extra) await extra(sc, ch.extra);
        else await act(sc, ch, sc.base);
        await restage(sc);
      }
      const evening = ctx.time?.isNight || ctx.time?.phase === 'sunset';
      await sayHer(sc, [one(girl, 'outingEnd').replace('giornata', evening ? 'serata' : 'giornata')], { expression: 'smile' });
      heartsAt(sc.b, 3);
      S.sfx('heart');
      done = true;
    } catch (e) { console.warn('[romance] outing', kind, e); }
    await close(sc, { place: where?.away ? 'start' : 'stay' });
    return done;
  }

  /** Back to the outing's base pose after an action that changed it. */
  async function restage(sc) {
    sc.riding = sc.baseKind === 'scooter_ride' && !sc.actorsRide;
    if (!sc.baseKind || sc.pair === sc.baseKind) return;
    await pose(sc, sc.baseKind, sc.base);
    await cams.two(sc.a, sc.b, { dur: 1.0 });
  }

  const SETUP = {
    async osteria(sc, spot) {
      const f = spot.facing ?? 0;
      const an = anchorOf(spot, f);
      // standing actions (kiss, hair, whisper) happen beside the table, not inside it
      const side = anchorOf({ x: an.x + Math.cos(f) * 1.35, z: an.z - Math.sin(f) * 1.35 }, f);
      sc.base = kind => (kind === 'sit_table' ? an : side); sc.baseKind = 'sit_table';
      await pose(sc, 'sit_table', an);
      await clock.wait(0.5);
      // table between the two of them and a chair under each (from where Actors really seated them)
      const A = S.worldPos(sc.a).clone(), B = S.worldPos(sc.b).clone();
      let yaw = Math.atan2(-(B.z - A.z), B.x - A.x);
      if (A.distanceTo(B) < 0.3) yaw = f;
      const c = { x: (A.x + B.x) / 2, y: an.y, z: (A.z + B.z) / 2 };
      // chair local +z is the sitter's facing (towards the table), the backrest behind
      const seats = [A, B].map(P => ({ x: P.x, y: an.y, z: P.z, ry: Math.atan2(c.x - P.x, c.z - P.z) }));
      addProp(sc, buildTable(ctx, { center: c, yaw, seats, side: -1 }));
      ambience(sc, c);
      await cams.wide(c, yaw + Math.PI / 2, { dist: 4.2, height: 1.9, dur: 0 });
      cams.two(sc.a, sc.b, { dur: 2.2 });
    },
    async picnic(sc, spot) {
      const f = spot.facing ?? 0;
      const an = anchorOf(spot, f, { ground: true });
      // a round cushion behind them: she sits on it for the feet massage, he kneels on the blanket
      const cx = an.x - Math.sin(f) * 0.6, cz = an.z - Math.cos(f) * 0.6;
      const cushion = anchorOf({ x: cx, z: cz }, f, { opts: { seatY: an.y + 0.32 } });
      sc.base = kind => (kind === 'massage_feet' || kind === 'kiss_feet' ? cushion : an); sc.baseKind = 'sit_ground';
      // the food goes in front of them (towards the camera), so the set is flipped
      addProp(sc, buildPicnic(ctx, { center: { x: an.x, y: an.y, z: an.z }, yaw: f + Math.PI }, { tint: sc.girl.color || '#e8574a' }));
      addProp(sc, pouf(cx, an.y, cz, sc.girl.color || '#ff8fb8'));
      await pose(sc, 'sit_ground', an);
      await clock.wait(0.5);
      ambience(sc, an);
      await cams.wide(an, f, { dist: 4.4, height: 2.1, dur: 0 });
      cams.two(sc.a, sc.b, { dur: 2.2 });
    },
    async bagno(sc, spot) {
      const sea = viewYaw(spot);
      const wl = ctx.world?.waterLevel ?? 0;
      // walk out until the water is about waist deep; the beach set stays behind them on the sand
      let wx = spot.x, wz = spot.z, firstWet = null;
      for (let r = 0; r <= 16; r += 0.5) {
        const x = spot.x + Math.sin(sea) * r, z = spot.z + Math.cos(sea) * r;
        if (!S.isWater(x, z)) continue;
        firstWet ||= { x, z };
        wx = x; wz = z;
        if (S.groundY(x, z) <= wl - 0.9) break;
      }
      if (!firstWet) { wx = spot.x + Math.sin(sea) * 2; wz = spot.z + Math.cos(sea) * 2; }
      const bed = Math.max(S.groundY(wx, wz), wl - 1.05);
      const an = { x: wx, y: wl, z: wz, facing: sea + Math.PI / 2, water: true };
      const stand = { x: wx, y: bed, z: wz, facing: sea + Math.PI / 2, water: true };
      sc.base = kind => (kind === 'swim' ? an : stand); sc.baseKind = 'swim';
      const sx = wx - Math.sin(sea) * 3, sz = wz - Math.cos(sea) * 3;
      const shore = { x: sx, y: S.groundY(sx, sz), z: sz };
      addProp(sc, buildBeach(ctx, { center: shore, yaw: sea }, { tint: sc.girl.color || '#26c6da' }));
      await pose(sc, 'swim', an);
      await clock.wait(0.5);
      const ff = createMotes(ctx, scatter(shore, 18, { rx: 5, rz: 3, y0: 0.5, y1: 2.4 }), { mode: 'fireflies', color: '#9fe8ff', core: '#ffffff', size: 0.1 });
      ctx.scene.add(ff.object); sc.extras.push(ff); sc.restore.push(clock.tick(dt => ff.update(dt)));
      await cams.panorama(sc.a, sc.b, sea, { dur: 0 });
      cams.two(sc.a, sc.b, { dur: 2.4 });
    },
    async scooter(sc, spot) {
      const f = spot.facing ?? 0;
      let vehicle = null;
      try { const m = await import('../story/scooter.js'); vehicle = m.buildScooter?.(ctx, sc.girl.color || '#ffcf4a') || null; } catch { vehicle = null; }
      if (!vehicle?.object) vehicle = buildScooterFallback(ctx, sc.girl.color || '#ffcf4a');
      const root = vehicle.object;
      root.position.set(spot.x, S.groundY(spot.x, spot.z), spot.z);
      root.rotation.set(0, f, 0);
      ctx.scene.add(root);
      sc.extras.push({ dispose() { root.removeFromParent(); try { ctx.kit?.dispose?.(root); } catch { /* optional */ } } });
      if (root.userData.update) sc.restore.push(clock.tick((dt, t) => root.userData.update(dt, t)));
      sc.vehicle = vehicle;
      const an = anchorOf(spot, f, { opts: { vehicle } });
      sc.base = an; sc.baseKind = 'scooter_ride'; sc.scooterAnchor = an;
      sc.riding = false;
      // Actors keeps both riders on seat/pillion while the pose lasts; otherwise our own follower does
      sc.actorsRide = await pose(sc, 'scooter_ride', an);
      // the riders follow the scooter: keep their offsets in scooter space
      root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
      const offA = S.worldPos(sc.a).clone().applyMatrix4(inv), offB = S.worldPos(sc.b).clone().applyMatrix4(inv);
      if (offA.length() > 1.5 || offB.length() > 1.5) { offA.set(0, 0, 0); offB.set(0, 0, -0.32); }
      const ryA = sc.a.object.rotation.y - f, ryB = sc.b.object.rotation.y - f;
      const w = new THREE.Vector3();
      sc.restore.push(clock.tick(() => {
        if (!sc.riding) return;
        root.updateMatrixWorld(true);
        w.copy(offA).applyMatrix4(root.matrixWorld); sc.a.object.position.copy(w); sc.a.object.rotation.y = root.rotation.y + ryA;
        w.copy(offB).applyMatrix4(root.matrixWorld); sc.b.object.position.copy(w); sc.b.object.rotation.y = root.rotation.y + ryB;
      }));
      sc.riding = !sc.actorsRide;
      await cams.wide({ x: spot.x, y: root.position.y, z: spot.z }, f, { dist: 4.6, height: 1.6, dur: 0 });
    },
  };

  /** Scooter: drive along a free path with a side tracking shot, then park at the viewpoint. */
  async function ride(sc, spot) {
    const root = sc.vehicle.object;
    // path: 1.2 m steps along the heading, steering around blocked ground and water
    const pts = [root.position.clone()];
    let hd = spot.facing ?? 0, x = root.position.x, z = root.position.z;
    for (let i = 0; i < 34; i++) {
      let ok = false;
      for (const d of [0, 0.22, -0.22, 0.45, -0.45, 0.8, -0.8]) {
        const h2 = hd + d, nx = x + Math.sin(h2) * 1.2, nz = z + Math.cos(h2) * 1.2;
        if (S.walkable(nx, nz) && !S.isWater(nx, nz)) { hd = h2 + Math.sin(i * 0.5) * 0.04; x = nx; z = nz; ok = true; break; }
      }
      if (!ok) break;
      pts.push(new THREE.Vector3(x, S.groundY(x, z), z));
    }
    sc.riding = !sc.actorsRide;
    S.sfx('scooter');
    cams.ride(root, { radius: 4.4, height: 1.3 });
    if (pts.length >= 6) {
      const curve = new THREE.CatmullRomCurve3(pts);
      const len = curve.getLength(), dur = Math.min(8, Math.max(4, len / 5.5));
      const p = new THREE.Vector3(), tng = new THREE.Vector3();
      await clock.tween(dur, k => {
        curve.getPointAt(k, p); curve.getTangentAt(k, tng);
        root.position.copy(p);
        root.rotation.y = Math.atan2(tng.x, tng.z);
      });
      await clock.wait(0.2);
    } else await clock.wait(3);
    await sayHer(sc, [pick(['Più veloce! ...No, più piano!', 'Tieni gli occhi sulla strada, non su di me!', 'Mi tengo forte, eh. Solo per sicurezza.'])], { expression: 'laugh' });
    // park at the viewpoint and stand next to the scooter, looking at the view
    const view = S.poi(`${sc.girl.town}.${OUTINGS.scooter.view?.[0] || 'viewpoint'}`) || S.poi(`${sc.girl.town}.date`) || { x: root.position.x, z: root.position.z, facing: root.rotation.y };
    const vy = viewYaw(view);
    await S.through(async () => {
      sc.riding = false;
      root.position.set(view.x, S.groundY(view.x, view.z), view.z);
      root.rotation.y = vy;
      sc.scooterAnchor = anchorOf(view, vy, { opts: { vehicle: sc.vehicle } });
      // hand in hand next to the parked scooter, looking at the view (walk_together with no stroll)
      const side = { x: view.x + Math.cos(vy) * 1.1, z: view.z - Math.sin(vy) * 1.1 };
      sc.baseKind = 'walk_together'; sc.base = anchorOf(side, vy, { opts: { distance: 0.01 } });
      try { await ctx.actors?.endPair?.({ a: sc.a, b: sc.b, fade: 0 }); } catch { /* optional */ }   // off the scooter: no glide
      await pose(sc, 'walk_together', sc.base);
      await clock.wait(0.6);                                  // black screen: let them stand up fully
      await cams.panorama(sc.a, sc.b, vy, { dur: 0 });
    }, { ms: 600 });
  }

  /** Innocent outing extras (outings.js EXTRAS). */
  async function extra(sc, id) {
    validateExtras([id]);
    const e = EXTRAS[id];
    if (e.pair) {
      const onScooter = e.pair === 'scooter_ride' && sc.scooterAnchor;
      const posed = await pose(sc, e.pair, onScooter ? sc.scooterAnchor : sc.base);
      sc.riding = !!onScooter && !posed;
    }
    if (e.cam === 'panorama') { const bp = typeof sc.base === 'function' ? sc.base(sc.baseKind) : sc.base; await cams.panorama(sc.a, sc.b, viewYaw(bp || S.worldPos(sc.a))); }
    else await cams.two(sc.a, sc.b, { tight: e.pair === 'hug' || e.pair === 'picnic_lap', dur: 1.0 });
    let held = null;
    if (e.attach === 'strawberry' && sc.a.attach) {
      held = strawberry();
      try { sc.a.attach('handR', held.object); } catch { held = null; }
    }
    if (held || id === 'vino' || id === 'dolce') S.play(sc.a, 'talk_gesture', { loop: false, fade: 0.25 });
    await clock.wait(0.4);
    if (e.fx === 'splash') {
      const p = S.worldPos(sc.b).clone(), q = S.worldPos(sc.a).clone();
      const dx = p.x - q.x, dz = p.z - q.z, l = Math.hypot(dx, dz) || 1, wy = (ctx.world?.waterLevel ?? p.y) + 0.05;
      splash.burst({ x: q.x + dx / l * 0.3, y: wy, z: q.z + dz / l * 0.3 }, { x: dx / l, z: dz / l }, 28);
      S.sfx('splash'); S.play(sc.b, 'laugh', { loop: false, fade: 0.2 });
      await clock.wait(0.55);
      splash.burst({ x: p.x - dx / l * 0.3, y: wy, z: p.z - dz / l * 0.3 }, { x: -dx / l, z: -dz / l }, 28);
      S.sfx('splash');
    } else if (e.fx === 'hearts') { heartsAt(sc.b, 2); S.sfx('heart'); }
    else if (e.fx === 'sparkle') { heartsAt(sc.b, 1, { size: 0.16 }); S.sfx('ui_tap'); }
    if (e.sfx && e.fx !== 'splash') S.sfx(e.sfx);
    await react(sc, e.expr || 'smile', [fill(pick(e.lines), vars(sc.girl))]);
    if (held) { try { sc.a.attach('handR', null); } catch { /* optional */ } held.dispose(); }
  }

  /** A round tufted cushion (picnic seat), toon + outline, 2 draw calls. */
  function pouf(x, y, z, color) {
    const object = new THREE.Group();
    const geo = ctx.kit?.capsule ? ctx.kit.capsule(0.26, 0.04, 4, 16) : new THREE.CapsuleGeometry(0.26, 0.04, 4, 16);
    const m = new THREE.Mesh(geo, ctx.toon.mat(color, { rim: 0.25 }));
    m.scale.set(1, 0.58, 1); m.position.y = 0.17; m.castShadow = true; m.receiveShadow = true;
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), ctx.toon.mat('#ffffff'));
    btn.position.y = 0.33;
    object.add(m, btn);
    object.position.set(x, y, z);
    try { ctx.toon.outline?.(object, { width: 0.012 }); } catch { /* optional */ }
    return { object, dispose() { object.removeFromParent(); geo.dispose(); btn.geometry.dispose(); } };
  }

  function strawberry() {
    const object = new THREE.Group();
    const bg = new THREE.ConeGeometry(0.035, 0.07, 10), lg = new THREE.ConeGeometry(0.03, 0.015, 6);
    const berry = new THREE.Mesh(bg, ctx.toon.mat('#ff3b4e', { rim: 0.3 }));
    berry.rotation.x = Math.PI; berry.position.y = 0.02;
    const leaf = new THREE.Mesh(lg, ctx.toon.mat('#5fae45'));
    leaf.position.y = 0.058;
    object.add(berry, leaf);
    return { object, dispose() { object.removeFromParent(); bg.dispose(); lg.dispose(); } };
  }

  return {
    date, home, outing,
    get active() { return !!current; },
    get current() { return current; },
    hearts, cams,
    /** Debug: abort a running scene (tests). */
    async abort() { if (current) await close(current, { fade: false }); },
  };
}
