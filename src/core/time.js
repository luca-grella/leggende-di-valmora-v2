// Game clock: 1 game hour = `scale` real seconds (default 120 → a 48-minute day) and the
// day/night lighting table (World applies it to sky, sun, hemisphere light and fog; the core
// applies it to the toon shade/rim tint and the post grade).
//
// Intensities are three r160 physical units: assign them directly (sun.intensity = L.sunIntensity,
// hemi.intensity = L.hemiIntensity). Tuned for ctx.toon materials: noon lit side ≈ base colour.
import * as THREE from 'three';

export function phaseOf(h) {
  if (h >= 5 && h < 7) return 'dawn';
  if (h >= 7 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'sunset';
  return 'night';
}

// Key hours → colours (warm tropical day, pink-orange sunset, deep blue night but still readable).
// si/hi: sun/hemisphere intensity. warm: dusk warmth 0..1. night: 0..1. rim: rim-light colour.
const KEYS = [
  { h: 0, sky: '#1b2656', horizon: '#33437e', fog: '#2a3766', sun: '#a9b8ff', si: 1.4, hs: '#6a7ad0', hg: '#2a2a4a', hi: 1.4, lamps: 1, stars: 1, warm: 0, night: 1, rim: '#9fb6ff' },
  { h: 4.6, sky: '#26306a', horizon: '#5a4f88', fog: '#3a3d72', sun: '#b3b4ff', si: 1.3, hs: '#6370b8', hg: '#30284a', hi: 1.4, lamps: 1, stars: 0.9, warm: 0.1, night: 0.9, rim: '#b5b4ff' },
  { h: 6, sky: '#6f8fd8', horizon: '#ffb48e', fog: '#d9a9a4', sun: '#ffc39a', si: 1.7, hs: '#b4b9e8', hg: '#7a5a5a', hi: 1.2, lamps: 0.6, stars: 0.2, warm: 0.75, night: 0.25, rim: '#ffd2b0' },
  { h: 7.5, sky: '#76c2f2', horizon: '#ffe2c0', fog: '#cfe3ee', sun: '#ffe2b8', si: 2.35, hs: '#b8dcff', hg: '#8f7a58', hi: 0.95, lamps: 0, stars: 0, warm: 0.25, night: 0, rim: '#fff0d8' },
  { h: 12, sky: '#4fb6f5', horizon: '#cdeefc', fog: '#bfe0f0', sun: '#fff1d8', si: 2.55, hs: '#b9defc', hg: '#9a865e', hi: 0.88, lamps: 0, stars: 0, warm: 0, night: 0, rim: '#fff8ea' },
  { h: 16, sky: '#5bb4ee', horizon: '#ffe6c4', fog: '#d6e2dc', sun: '#ffe4b4', si: 2.5, hs: '#b8dafc', hg: '#9a8058', hi: 0.9, lamps: 0, stars: 0, warm: 0.15, night: 0, rim: '#fff0d4' },
  { h: 18, sky: '#8a86d6', horizon: '#ffa874', fog: '#f0b296', sun: '#ffbe98', si: 2.15, hs: '#c9bdf0', hg: '#86686e', hi: 1.2, lamps: 0.4, stars: 0, warm: 1, night: 0.05, rim: '#ffbe8a' },
  { h: 19.2, sky: '#5a5aae', horizon: '#ff8e7a', fog: '#b98aa0', sun: '#ffa896', si: 1.7, hs: '#a6a2dc', hg: '#544660', hi: 1.3, lamps: 1, stars: 0.3, warm: 0.85, night: 0.4, rim: '#ffae9a' },
  { h: 20.5, sky: '#2c3878', horizon: '#6a5a9a', fog: '#3e4278', sun: '#b9b0ff', si: 1.4, hs: '#6a72c0', hg: '#2e2a4c', hi: 1.4, lamps: 1, stars: 0.85, warm: 0.2, night: 0.9, rim: '#aab4ff' },
  { h: 24, sky: '#1b2656', horizon: '#33437e', fog: '#2a3766', sun: '#a9b8ff', si: 1.4, hs: '#6a7ad0', hg: '#2a2a4a', hi: 1.4, lamps: 1, stars: 1, warm: 0, night: 1, rim: '#9fb6ff' },
];
const cA = new THREE.Color(), cB = new THREE.Color();
const mix = (a, b, t) => '#' + cA.set(a).lerp(cB.set(b), t).getHexString();
const sm = t => t * t * (3 - 2 * t);

/**
 * Interpolated lighting for an hour (0..24):
 * {sky, horizon, fog, sun, sunIntensity, sunDir:{x,y,z} (unit, towards the sun), hemiSky, hemiGround,
 *  hemiIntensity, ambient, lampsOn, lamps (0..1), stars (0..1), warmth (0..1), night (0..1), rim, moon (bool)}
 * At night the "sun" is the moon (cool, dim, high in the sky) so shadows and the toon bands stay readable.
 */
export function lightingAt(hours) {
  const h = ((hours % 24) + 24) % 24;
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = sm(Math.min(1, Math.max(0, (h - a.h) / (b.h - a.h || 1))));
  const L = (k) => a[k] + (b[k] - a[k]) * t;
  // sun arc: rises east (+x) at 6:00, sets west (-x) at 18:30; moon arc during the night
  const day = h >= 5.5 && h < 19.5;
  let ang;
  if (day) ang = ((h - 5.5) / 14) * Math.PI;
  else ang = (((h - 19.5 + 24) % 24) / 10) * Math.PI;
  const up = 0.35 + 0.65 * Math.sin(ang);              // keep some height: long readable shadows, never flat
  const dir = { x: Math.cos(ang) * 0.75, y: up, z: 0.42 };
  const n = Math.hypot(dir.x, dir.y, dir.z); dir.x /= n; dir.y /= n; dir.z /= n;
  const lamps = L('lamps');
  return {
    sky: mix(a.sky, b.sky, t), horizon: mix(a.horizon, b.horizon, t), fog: mix(a.fog, b.fog, t),
    sun: mix(a.sun, b.sun, t), sunIntensity: L('si'), sunDir: dir, moon: !day,
    hemiSky: mix(a.hs, b.hs, t), hemiGround: mix(a.hg, b.hg, t), hemiIntensity: L('hi'), ambient: L('hi'),
    lampsOn: lamps > 0.5, lamps, stars: L('stars'), warmth: L('warm'), night: L('night'), rim: mix(a.rim, b.rim, t),
  };
}

export function createTime({ bus, save }) {
  const st = () => (save.state.time ||= { hours: 9, day: 1 });
  let lastPhase = phaseOf(st().hours), lastHour = Math.floor(st().hours);
  let cacheH = -1, cacheL = null;
  const time = {
    /** Real seconds per game hour (120 → 48-minute day). */
    scale: 120,
    paused: false,
    get hours() { return st().hours; },
    get day() { return st().day; },
    get phase() { return phaseOf(st().hours); },
    get isNight() { const h = st().hours; return h >= 20 || h < 5; },
    /** Set the clock (no day change unless given). */
    set(h, day) { st().hours = ((h % 24) + 24) % 24; if (day != null) st().day = day; time._check(); },
    /** Jump forward to hour h (increments the day if h is earlier than now). */
    skipTo(h) {
      const s = st();
      if (h <= s.hours) { s.day++; bus.emit('time:day', { day: s.day }); }
      s.hours = ((h % 24) + 24) % 24; time._check(); save.commit?.();
    },
    format(h = st().hours) { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; },
    /** Current lighting (cached per ~6 game seconds). */
    lighting() {
      const h = st().hours;
      if (cacheL && Math.abs(h - cacheH) < 0.0017) return cacheL;
      cacheH = h; cacheL = lightingAt(h);
      return cacheL;
    },
    update(dt) {
      if (time.paused) return;
      const s = st();
      s.hours += dt / time.scale;
      if (s.hours >= 24) { s.hours -= 24; s.day++; bus.emit('time:day', { day: s.day }); }
      time._check();
    },
    _check() {
      const p = time.phase, hr = Math.floor(st().hours);
      if (p !== lastPhase) { lastPhase = p; bus.emit('time:phase', { phase: p }); }
      if (hr !== lastHour) { lastHour = hr; bus.emit('time:hour', { hour: hr }); }
    },
  };
  return time;
}
