// Procedural WebAudio: no files. Cheerful Sun/Moon-flavoured music generated from per-track recipes
// (seeded, so every track always plays the same tune), fanfare jingles that duck the music, and
// synthesized SFX. Plucked/mallet instruments are rendered once per note into small AudioBuffers;
// bass, pads, brass and drums are live oscillators/noise. Contract: docs/ARCHITECTURE.md "ctx.audio".
import { rng } from './math.js';

export const TRACKS = ['title', 'town', 'route', 'cave', 'night', 'battle_wild', 'battle_trainer', 'battle_champion', 'battle_legend', 'eclissi', 'romance', 'victory', 'evolution', 'off'];
export const JINGLES = ['heal', 'catch', 'levelup', 'item', 'quest', 'evolved'];
export const SFX = ['ui_tap', 'ui_open', 'ui_close', 'step_grass', 'step_sand', 'step_wood', 'step_stone', 'grass_rustle', 'encounter', 'alert', 'ball_throw',
  'ball_shake', 'ball_click', 'ball_burst', 'hit', 'hit_super', 'hit_weak', 'faint', 'heal', 'coin', 'door', 'ferry_horn', 'scooter', 'splash', 'paint',
  'whistle', 'chest', 'pickup', 'throw', 'kiss', 'heart'];

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10], DORIAN = [0, 2, 3, 5, 7, 9, 10], PHRYG = [0, 1, 3, 5, 7, 8, 10], LYDIAN = [0, 2, 4, 6, 7, 9, 11];

// Track recipes. prog: chord degrees (0-based in the scale), one per bar. drums: k=kick s=snare h=hat .=rest (16 steps).
const RECIPES = {
  title:    { bpm: 104, root: 60, scale: MAJOR, prog: [0, 5, 3, 4, 0, 5, 1, 4], lead: 'bell', arp: 'pluck', bass: 'round', pad: 0.07, drums: 'k...h...k.k.h...', density: 0.5, swing: 0, leadVol: 0.2, brass: 0 },
  town:     { bpm: 112, root: 65, scale: MAJOR, prog: [0, 3, 4, 0, 5, 3, 1, 4], lead: 'marimba', arp: 'pluck', bass: 'bouncy', pad: 0.05, drums: 'k..hs.h.k.hhs.h.', density: 0.58, swing: 0.12, leadVol: 0.24, brass: 0 },
  route:    { bpm: 132, root: 62, scale: MAJOR, prog: [0, 4, 5, 3, 0, 4, 3, 4], lead: 'pluck', arp: 'marimba', bass: 'drive', pad: 0.05, drums: 'k.hhs.hhk.hks.hh', density: 0.66, swing: 0.06, leadVol: 0.22, brass: 0.05 },
  cave:     { bpm: 84, root: 57, scale: DORIAN, prog: [0, 0, 5, 6, 0, 0, 3, 4], lead: 'bell', arp: 'bell', bass: 'round', pad: 0.09, drums: 'k.......h.......', density: 0.26, swing: 0, leadVol: 0.16, brass: 0 },
  night:    { bpm: 76, root: 67, scale: MAJOR, prog: [0, 5, 3, 4, 0, 2, 3, 4], lead: 'musicbox', arp: 'musicbox', bass: 'round', pad: 0.08, drums: '................', density: 0.34, swing: 0.1, leadVol: 0.18, brass: 0 },
  battle_wild:     { bpm: 160, root: 57, scale: MINOR, prog: [0, 0, 5, 6, 0, 0, 3, 4], lead: 'square', arp: 'pluck', bass: 'gallop', pad: 0.04, drums: 'k.hsk.hsk.hskshs', density: 0.72, swing: 0, leadVol: 0.13, brass: 0.12 },
  battle_trainer:  { bpm: 168, root: 59, scale: MINOR, prog: [0, 6, 5, 4, 0, 6, 3, 4], lead: 'square', arp: 'pluck', bass: 'gallop', pad: 0.04, drums: 'k.hsk.hsk.hskshs', density: 0.76, swing: 0, leadVol: 0.13, brass: 0.15 },
  battle_champion: { bpm: 174, root: 62, scale: DORIAN, prog: [0, 6, 3, 4, 0, 6, 5, 4], lead: 'square', arp: 'pluck', bass: 'gallop', pad: 0.05, drums: 'kkhsk.hskkhsk.ss', density: 0.8, swing: 0, leadVol: 0.13, brass: 0.18 },
  battle_legend:   { bpm: 150, root: 55, scale: PHRYG, prog: [0, 1, 0, 6, 0, 1, 5, 4], lead: 'bell', arp: 'pluck', bass: 'gallop', pad: 0.09, drums: 'k..sk.hsk..sk.ss', density: 0.6, swing: 0, leadVol: 0.18, brass: 0.2 },
  eclissi:  { bpm: 120, root: 52, scale: PHRYG, prog: [0, 1, 0, 6, 0, 1, 3, 1], lead: 'square', arp: 'bell', bass: 'drive', pad: 0.08, drums: 'k...s..kk...s...', density: 0.42, swing: 0, leadVol: 0.11, brass: 0.1 },
  romance:  { bpm: 72, root: 63, scale: LYDIAN, prog: [0, 3, 1, 4, 0, 3, 5, 4], lead: 'ep', arp: 'ep', bass: 'round', pad: 0.1, drums: '................', density: 0.3, swing: 0.14, leadVol: 0.2, brass: 0 },
  victory:  { bpm: 124, root: 67, scale: MAJOR, prog: [0, 3, 4, 0, 5, 3, 4, 4], lead: 'square', arp: 'pluck', bass: 'bouncy', pad: 0.05, drums: 'k.hsk.hsk.hsk.hs', density: 0.6, swing: 0, leadVol: 0.12, brass: 0.1 },
  evolution:{ bpm: 96, root: 60, scale: LYDIAN, prog: [0, 1, 0, 1, 3, 4, 3, 4], lead: 'bell', arp: 'musicbox', bass: 'round', pad: 0.1, drums: 'k.......k.......', density: 0.4, swing: 0, leadVol: 0.16, brass: 0 },
};

// Jingles: [midi, beats] (−1 = rest), tempo in bpm, instrument
const JINGLE_DEF = {
  heal: { bpm: 150, inst: 'bell', notes: [[72, 1], [72, 0.5], [74, 0.5], [76, 1], [72, 1], [79, 1.5], [-1, 0.5], [77, 0.5], [76, 0.5], [74, 0.5], [72, 2]] },
  catch: { bpm: 170, inst: 'square', notes: [[67, 0.5], [72, 0.5], [76, 0.5], [79, 1], [76, 0.5], [79, 0.5], [84, 2]] },
  levelup: { bpm: 180, inst: 'square', notes: [[72, 0.5], [76, 0.5], [79, 0.5], [84, 1.5]] },
  item: { bpm: 150, inst: 'marimba', notes: [[76, 0.5], [79, 0.5], [84, 0.5], [88, 1.5]] },
  quest: { bpm: 140, inst: 'square', notes: [[72, 0.5], [72, 0.5], [72, 0.5], [76, 1], [74, 0.5], [77, 0.5], [79, 2]] },
  evolved: { bpm: 140, inst: 'bell', notes: [[67, 0.5], [72, 0.5], [76, 0.5], [79, 0.5], [84, 1], [83, 0.5], [84, 2.5]] },
};

export function createAudio({ bus, save }) {
  const S = () => (save?.state?.settings || {});
  let ac = null, N = null, noiseBuf = null;
  const bufCache = new Map();
  let track = 'off', pending = null, song = null, nextT = 0, step = 0, timer = 0, duckUntil = 0;
  const lastSfx = new Map();

  // ------------------------------------------------------------------------------------------
  function build() {
    N = {};
    N.master = ac.createGain(); N.master.gain.value = 0.9;
    N.comp = ac.createDynamicsCompressor();
    N.comp.threshold.value = -14; N.comp.knee.value = 10; N.comp.ratio.value = 3.5; N.comp.attack.value = 0.008; N.comp.release.value = 0.22;
    N.master.connect(N.comp).connect(ac.destination);
    N.music = ac.createGain(); N.music.gain.value = S().music ?? 0.6;
    N.fade = ac.createGain(); N.fade.gain.value = 0;
    N.duck = ac.createGain(); N.duck.gain.value = 1;
    N.mIn = ac.createGain(); N.mIn.gain.value = 0.8;
    N.mIn.connect(N.fade).connect(N.duck).connect(N.music).connect(N.master);
    N.sfx = ac.createGain(); N.sfx.gain.value = S().sfx ?? 0.8; N.sfx.connect(N.master);
    N.jingle = ac.createGain(); N.jingle.gain.value = 0.9; N.jingle.connect(N.music);
    // reverb
    N.verb = ac.createConvolver(); N.verb.buffer = impulse(2.4, 2.8);
    N.verbOut = ac.createGain(); N.verbOut.gain.value = 0.5; N.verb.connect(N.verbOut).connect(N.master);
    N.mVerb = ac.createGain(); N.mVerb.gain.value = 0.22; N.duck.connect(N.mVerb); N.mVerb.connect(N.verb);
    N.sVerb = ac.createGain(); N.sVerb.gain.value = 0.12; N.sfx.connect(N.sVerb); N.sVerb.connect(N.verb);
    // echo for leads
    N.echo = ac.createDelay(1.5); N.echoFb = ac.createGain(); N.echoFb.gain.value = 0.28;
    N.echoLp = ac.createBiquadFilter(); N.echoLp.type = 'lowpass'; N.echoLp.frequency.value = 2600;
    N.lead = ac.createGain(); N.lead.connect(N.mIn);
    N.echoIn = ac.createGain(); N.echoIn.gain.value = 0.18;
    N.lead.connect(N.echoIn).connect(N.echo).connect(N.echoLp).connect(N.echoFb).connect(N.echo); N.echoLp.connect(N.mIn);
    // pad filter
    N.padF = ac.createBiquadFilter(); N.padF.type = 'lowpass'; N.padF.frequency.value = 1400; N.padF.Q.value = 0.3; N.padF.connect(N.mIn);
    // noise
    const len = ac.sampleRate * 2; noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  function impulse(sec, decay) {
    const sr = ac.sampleRate, len = Math.floor(sr * sec), b = ac.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < len; i++) { const t = i / len, a = 0.3 + 0.65 * t; lp = lp * a + (Math.random() * 2 - 1) * (1 - a); d[i] = (i < sr * 0.01 ? 0 : lp) * Math.pow(1 - t, decay); }
    }
    return b;
  }

  // ---- rendered instruments ------------------------------------------------------------------
  function getBuf(inst, midi) {
    const k = inst + midi;
    let b = bufCache.get(k);
    if (b) return b;
    const f = mtof(midi), sr = ac.sampleRate;
    if (inst === 'pluck') b = renderPluck(sr, f);
    else b = renderAdditive(sr, f, inst);
    bufCache.set(k, b);
    return b;
  }
  function renderPluck(sr, f) {
    const len = Math.floor(sr * 1.6), b = ac.createBuffer(1, len, sr), out = b.getChannelData(0);
    const L = Math.max(2, Math.round(sr / f)), line = new Float32Array(L);
    let lp = 0; for (let i = 0; i < L; i++) { lp = lp * 0.5 + (Math.random() * 2 - 1) * 0.5; line[i] = lp; }
    let idx = 0, prev = 0;
    for (let n = 0; n < len; n++) {
      const cur = line[idx]; line[idx] = (cur + prev) * 0.4985; prev = cur; idx = (idx + 1) % L;
      out[n] = cur * (n < 40 ? n / 40 : 1) * 0.9;
    }
    tail(out, sr); return b;
  }
  function renderAdditive(sr, f, kind) {
    const P = {
      marimba: { dur: 0.9, parts: [[1, 1, 7], [3.93, 0.25, 22], [9.2, 0.08, 40]], att: 0.002 },
      bell: { dur: 2.2, parts: [[1, 1, 2.2], [2.01, 0.45, 3.4], [3.0, 0.25, 4.5], [4.17, 0.18, 6], [5.43, 0.1, 9]], att: 0.003 },
      musicbox: { dur: 1.6, parts: [[1, 1, 3.4], [2, 0.3, 5], [3.01, 0.18, 7], [6.4, 0.06, 14]], att: 0.002 },
      ep: { dur: 1.8, parts: [[1, 1, 1.6], [2, 0.35, 2.6], [3, 0.12, 4], [7.1, 0.06, 9]], att: 0.006 },
      square: { dur: 0.7, parts: [[1, 1, 2.2], [3, 0.33, 3], [5, 0.2, 4], [7, 0.14, 5], [9, 0.11, 6]], att: 0.004 },
    }[kind] || { dur: 1, parts: [[1, 1, 3]], att: 0.003 };
    const len = Math.floor(sr * P.dur), b = ac.createBuffer(1, len, sr), out = b.getChannelData(0);
    for (const [ratio, amp, dec] of P.parts) {
      const w = 2 * Math.PI * f * ratio / sr; if (f * ratio > sr * 0.45) continue;
      for (let n = 0; n < len; n++) out[n] += Math.sin(w * n) * amp * Math.exp(-dec * n / sr);
    }
    const a = Math.floor(P.att * sr);
    for (let n = 0; n < len; n++) out[n] *= (n < a ? n / a : 1) * 0.32;
    tail(out, sr); return b;
  }
  function tail(d, sr) { const f = Math.floor(sr * 0.05); for (let i = 0; i < f; i++) d[d.length - 1 - i] *= i / f; }

  function playBuf(inst, midi, t, vol, dest, pan = 0) {
    const s = ac.createBufferSource(); s.buffer = getBuf(inst, midi);
    const g = ac.createGain(); g.gain.value = vol;
    let node = s.connect(g);
    if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
    node.connect(dest); s.start(t);
  }
  function osc(type, freq, t, dur, vol, dest, { attack = 0.01, release = 0.08, detune = 0, filter = 0, glideTo = 0 } = {}) {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, Math.max(t + attack, t + dur - release)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = o.connect(g);
    if (filter) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; n = g.connect(f); }
    n.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function noise(t, dur, vol, dest, { type = 'bandpass', freq = 2000, q = 1, attack = 0.002, sweepTo = 0 } = {}) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }

  // ---- song generation (seeded per track) ------------------------------------------------------
  function makeSong(name) {
    const R = RECIPES[name]; const r = rng('valmora-music-' + name);
    const sc = R.scale, steps = 16;
    const deg = (d, oct = 0) => R.root + sc[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + oct);
    const chordTones = c => [c, c + 2, c + 4];
    // a 4-bar phrase over prog[0..3] (and the second half over prog[4..7])
    const phrase = (bars, vary) => {
      const notes = []; let last = 7 + chordTones(bars[0])[0];
      for (let b = 0; b < bars.length; b++) {
        const ct = chordTones(bars[b]);
        for (let s = 0; s < steps; s++) {
          const strong = s % 4 === 0, p = strong ? R.density + 0.25 : (s % 2 === 0 ? R.density * 0.6 : R.density * 0.25);
          if (b === bars.length - 1 && s >= 8) { if (s === 8) notes.push({ bar: b, s, d: 7 + ct[0], len: 8 }); continue; }  // phrase cadence
          if (r() > p) continue;
          let d;
          if (strong || r() < 0.4) { const opts = ct.flatMap(x => [x + 7, x + 14]); d = opts.reduce((a, x) => (Math.abs(x - last) < Math.abs(a - last) ? x : a), opts[0]); if (r() < 0.3) d = opts[Math.floor(r() * opts.length)]; }
          else d = last + (r() < 0.5 ? 1 : -1) * (r() < 0.75 ? 1 : 2);
          d = Math.max(5, Math.min(16, d));
          if (vary && r() < 0.25) d += r() < 0.5 ? 1 : -1;
          const len = strong ? (r() < 0.5 ? 2 : 3) : 1;
          notes.push({ bar: b, s, d, len }); last = d;
        }
      }
      return notes;
    };
    const A = phrase(R.prog.slice(0, 4), false), B = phrase(R.prog.slice(4, 8), false), A2 = phrase(R.prog.slice(0, 4), true);
    // 16 bars: A B A2 B (melody rests every other A to breathe in calm tracks)
    const form = [A, B, A2, B];
    return { R, deg, form, bars: 16 };
  }

  function scheduleStep(t, st) {
    const sg = song; if (!sg) return;
    const R = sg.R, bar = Math.floor(st / 16) % sg.bars, s = st % 16;
    const chord = R.prog[bar % R.prog.length];
    const spb = 60 / R.bpm / 4;
    const dest = N.mIn;
    // drums
    const ch = R.drums[s];
    if (ch === 'k') { osc('sine', 120, t, 0.18, 0.5, dest, { attack: 0.002, release: 0.12, glideTo: 42 }); }
    if (ch === 's') { noise(t, 0.16, 0.16, dest, { freq: 1800, q: 0.7 }); osc('triangle', 220, t, 0.08, 0.1, dest, { attack: 0.002, release: 0.06, glideTo: 160 }); }
    if (ch === 'h' || (R.drums !== '................' && s % 2 === 1 && R.density > 0.5)) noise(t, 0.04, ch === 'h' ? 0.06 : 0.025, dest, { type: 'highpass', freq: 7000, q: 0.5 });
    // bass
    const root = sg.deg(chord, -2);
    const bassPat = { round: [0, 8], bouncy: [0, 6, 8, 14], drive: [0, 2, 4, 6, 8, 10, 12, 14], gallop: [0, 3, 4, 6, 8, 11, 12, 14] }[R.bass] || [0, 8];
    if (bassPat.includes(s)) {
      const fifth = (R.bass === 'bouncy' && (s === 6 || s === 14)) || (R.bass === 'gallop' && s % 8 === 4) ? 7 : 0;
      const oct = R.bass === 'drive' && s % 4 === 2 ? 12 : 0;
      const dur = R.bass === 'round' ? spb * 7 : spb * 1.7;
      osc('triangle', mtof(root + fifth + oct), t, dur, 0.26, dest, { attack: 0.005, release: Math.min(0.1, dur * 0.4) });
      osc('square', mtof(root + fifth + oct), t, dur, 0.035, dest, { attack: 0.005, release: Math.min(0.1, dur * 0.4), filter: 700 });
    }
    // pad: chord at bar start
    if (s === 0 && R.pad > 0) {
      for (const k of [0, 2, 4]) for (const det of [-7, 7]) osc('sawtooth', mtof(sg.deg(chord + k, -1)), t, spb * 16, R.pad * 0.35, N.padF, { attack: 0.35, release: 0.5, detune: det });
    }
    // brass stabs on battle tracks
    if (R.brass && (s === 0 || s === 6 || (s === 12 && bar % 2 === 1))) {
      for (const k of [0, 2, 4]) osc('sawtooth', mtof(sg.deg(chord + k, 0)), t, spb * 1.6, R.brass * 0.5, dest, { attack: 0.01, release: 0.06, filter: 2200 });
    }
    // arpeggio
    if (R.arp && s % 2 === 0 && (R.density > 0.35 || s % 4 === 0)) {
      const arpSeq = [0, 2, 4, 7, 4, 2, 0, 2];
      const d = chord + arpSeq[(s / 2) % 8];
      playBuf(R.arp, sg.deg(d, 0), t, 0.11, dest, ((s / 2) % 2 ? 0.3 : -0.3));
    }
    // melody
    const ph = sg.form[Math.floor(bar / 4) % 4], lb = bar % 4;
    for (const n of ph) if (n.bar === lb && n.s === s) {
      const midi = sg.deg(n.d, 0) - 12 + (R.lead === 'musicbox' || R.lead === 'bell' ? 12 : 0);
      if (R.lead === 'square') osc('square', mtof(midi), t, spb * n.len * 0.95, R.leadVol, N.lead, { attack: 0.006, release: 0.05, filter: 3200 });
      else playBuf(R.lead, midi, t, R.leadVol * 1.6, N.lead);
    }
  }

  function scheduler() {
    if (!ac || !song) return;
    const spb = 60 / song.R.bpm / 4;
    while (nextT < ac.currentTime + 0.18) {
      const sw = step % 2 === 1 ? song.R.swing * spb : 0;
      scheduleStep(nextT + sw, step);
      nextT += spb; step++;
    }
  }

  function startTrack(name) {
    if (!ac) return;
    const g = N.fade.gain, now = ac.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + 0.6);
    clearTimeout(pending);
    pending = setTimeout(() => {
      song = RECIPES[name] ? makeSong(name) : null;
      step = 0; nextT = ac.currentTime + 0.05;
      if (song) { const t = ac.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(0, t); g.linearRampToValueAtTime(1, t + 1.0); }
    }, 620);
  }

  // ---- SFX ---------------------------------------------------------------------------------
  function playSfx(name, vol = 1, pitch = 1) {
    const t = ac.currentTime + 0.005, d = N.sfx, P = pitch;
    switch (name) {
      case 'ui_tap': osc('sine', 880 * P, t, 0.06, 0.18 * vol, d, { attack: 0.002, release: 0.04, glideTo: 1100 * P }); break;
      case 'ui_open': osc('sine', 520 * P, t, 0.12, 0.16 * vol, d, { attack: 0.004, glideTo: 980 * P }); playBuf('marimba', 84, t + 0.04, 0.25 * vol, d); break;
      case 'ui_close': osc('sine', 900 * P, t, 0.12, 0.14 * vol, d, { attack: 0.004, glideTo: 480 * P }); break;
      case 'step_grass': noise(t, 0.09, 0.07 * vol, d, { freq: 2600 * P, q: 0.6, sweepTo: 1400 }); break;
      case 'step_sand': noise(t, 0.12, 0.07 * vol, d, { type: 'lowpass', freq: 1500 * P, q: 0.4 }); break;
      case 'step_wood': osc('triangle', 190 * P, t, 0.07, 0.16 * vol, d, { attack: 0.002, release: 0.05, glideTo: 130 }); noise(t, 0.03, 0.04 * vol, d, { freq: 3000 }); break;
      case 'step_stone': noise(t, 0.05, 0.08 * vol, d, { freq: 4200 * P, q: 1.4 }); break;
      case 'grass_rustle': for (let i = 0; i < 5; i++) noise(t + i * 0.05, 0.14, 0.09 * vol, d, { freq: 2200 + i * 300, q: 0.6, sweepTo: 3600 }); break;
      case 'encounter': for (let i = 0; i < 6; i++) osc('square', mtof(76 + (i % 2 ? 5 : 0) + i), t + i * 0.06, 0.07, 0.07 * vol, d, { attack: 0.002, release: 0.03, filter: 3000 }); break;
      case 'alert': osc('square', 1046, t, 0.09, 0.12 * vol, d, { attack: 0.002, release: 0.03, filter: 3500 }); osc('square', 1568, t + 0.1, 0.16, 0.12 * vol, d, { attack: 0.002, release: 0.06, filter: 3500 }); break;
      case 'ball_throw': noise(t, 0.35, 0.12 * vol, d, { freq: 600, q: 1.2, sweepTo: 2800 }); break;
      case 'ball_shake': osc('triangle', 260 * P, t, 0.08, 0.2 * vol, d, { attack: 0.002, release: 0.05 }); noise(t, 0.05, 0.08 * vol, d, { freq: 1200 }); osc('triangle', 220 * P, t + 0.12, 0.08, 0.16 * vol, d, { attack: 0.002, release: 0.05 }); break;
      case 'ball_click': osc('square', 1500, t, 0.03, 0.12 * vol, d, { attack: 0.001, release: 0.02, filter: 4000 }); playBuf('bell', 91, t + 0.05, 0.4 * vol, d); break;
      case 'ball_burst': noise(t, 0.3, 0.2 * vol, d, { type: 'lowpass', freq: 3000, sweepTo: 400 }); osc('sine', 700, t, 0.25, 0.12 * vol, d, { glideTo: 1600 }); break;
      case 'hit': noise(t, 0.16, 0.3 * vol, d, { type: 'lowpass', freq: 2200 * P, sweepTo: 300 }); osc('sine', 160 * P, t, 0.14, 0.32 * vol, d, { attack: 0.002, glideTo: 60 }); break;
      case 'hit_super': noise(t, 0.28, 0.36 * vol, d, { type: 'lowpass', freq: 4000, sweepTo: 200 }); osc('square', 220, t, 0.22, 0.18 * vol, d, { attack: 0.002, glideTo: 55, filter: 1800 }); osc('sine', 110, t + 0.03, 0.3, 0.35 * vol, d, { glideTo: 40 }); break;
      case 'hit_weak': noise(t, 0.1, 0.14 * vol, d, { type: 'lowpass', freq: 1200 }); osc('sine', 200, t, 0.1, 0.14 * vol, d, { glideTo: 120 }); break;
      case 'faint': osc('square', 660, t, 0.7, 0.1 * vol, d, { attack: 0.01, glideTo: 90, filter: 1600 }); break;
      case 'heal': for (let i = 0; i < 5; i++) playBuf('bell', 79 + [0, 4, 7, 12, 16][i], t + i * 0.07, 0.28 * vol, d); break;
      case 'coin': osc('square', 988, t, 0.07, 0.1 * vol, d, { attack: 0.002, release: 0.02, filter: 5000 }); osc('square', 1319, t + 0.07, 0.22, 0.1 * vol, d, { attack: 0.002, release: 0.15, filter: 5000 }); break;
      case 'door': osc('triangle', 140, t, 0.12, 0.2 * vol, d, { attack: 0.004, glideTo: 90 }); noise(t + 0.02, 0.2, 0.06 * vol, d, { freq: 500, q: 0.8 }); break;
      case 'ferry_horn': for (const f of [110, 138.6]) osc('sawtooth', f, t, 1.4, 0.12 * vol, d, { attack: 0.08, release: 0.35, filter: 700 }); break;
      case 'scooter': osc('sawtooth', 70 * P, t, 0.5, 0.1 * vol, d, { attack: 0.03, release: 0.2, filter: 500, glideTo: 120 * P }); break;
      case 'splash': noise(t, 0.45, 0.25 * vol, d, { type: 'lowpass', freq: 3500, sweepTo: 500 }); noise(t + 0.05, 0.3, 0.1 * vol, d, { freq: 5000, q: 0.5 }); break;
      case 'paint': noise(t, 0.25, 0.2 * vol, d, { freq: 900, q: 0.8, sweepTo: 3000 }); osc('sine', 300, t, 0.2, 0.12 * vol, d, { glideTo: 900 }); break;
      case 'whistle': osc('sine', 1800, t, 0.18, 0.12 * vol, d, { attack: 0.01, release: 0.05 }); osc('sine', 2300, t + 0.2, 0.32, 0.12 * vol, d, { attack: 0.01, release: 0.1 }); break;
      case 'chest': [72, 76, 79, 84].forEach((m, i) => playBuf('marimba', m, t + i * 0.08, 0.35 * vol, d)); break;
      case 'pickup': osc('sine', 600 * P, t, 0.14, 0.16 * vol, d, { attack: 0.004, glideTo: 1200 * P }); break;
      case 'throw': noise(t, 0.22, 0.12 * vol, d, { freq: 900, q: 1, sweepTo: 2400 }); break;
      case 'kiss': osc('sine', 1200, t, 0.06, 0.12 * vol, d, { attack: 0.002, release: 0.03, glideTo: 1900 }); noise(t, 0.03, 0.05 * vol, d, { freq: 4000, q: 2 }); break;
      case 'heart': playBuf('bell', 84, t, 0.3 * vol, d); playBuf('bell', 88, t + 0.1, 0.3 * vol, d); playBuf('bell', 91, t + 0.2, 0.26 * vol, d); break;
      default: osc('sine', 660 * P, t, 0.08, 0.12 * vol, d); break;
    }
  }

  // ------------------------------------------------------------------------------------------
  const audio = {
    get context() { return ac; },
    get unlocked() { return !!ac && ac.state === 'running'; },
    /** Current music track name. */
    get track() { return track; },
    TRACKS, JINGLES, SFX,
    /** Create/resume the AudioContext (call from a user gesture; the core does it on the first tap/key). */
    unlock() {
      try {
        if (!ac) {
          const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
          ac = new AC({ latencyHint: 'interactive' }); build();
          timer = setInterval(scheduler, 40);
          if (track !== 'off') startTrack(track);
        }
        if (ac.state === 'suspended') ac.resume();
        // iOS: a silent buffer inside the gesture fully unlocks output
        const b = ac.createBuffer(1, 1, 22050), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0);
      } catch { return false; }
      return ac.state === 'running' || ac.state === 'suspended';
    },
    /** One-shot effect: sfx(name, {vol=1, pitch=1}). Same name is rate-limited to every 40 ms. */
    sfx(name, { vol = 1, pitch = 1 } = {}) {
      if (!ac || ac.state !== 'running') return;
      const now = performance.now();
      if (now - (lastSfx.get(name) || 0) < 40) return;
      lastSfx.set(name, now);
      try { playSfx(name, vol, pitch); } catch (e) { console.warn('[audio] sfx failed', name, e); }
    },
    /** Switch music (crossfade). 'off' fades out. Same track → no restart. */
    music(name = 'off') {
      if (!TRACKS.includes(name)) { console.warn('[audio] unknown track', name); name = 'off'; }
      if (name === track) return;
      track = name;
      if (ac) startTrack(name);
    },
    /** Short fanfare; ducks the music while it plays. Resolves when done. */
    jingle(name) {
      const J = JINGLE_DEF[name];
      if (!J || !ac || ac.state !== 'running') return Promise.resolve();
      const beat = 60 / J.bpm; let t = ac.currentTime + 0.06, total = 0;
      for (const [m, b] of J.notes) {
        if (m > 0) {
          if (J.inst === 'square') { osc('square', mtof(m), t, beat * b * 0.92, 0.12, N.jingle, { attack: 0.004, release: 0.05, filter: 3400 }); osc('triangle', mtof(m - 12), t, beat * b * 0.92, 0.12, N.jingle, { attack: 0.004, release: 0.05 }); }
          else { playBuf(J.inst, m, t, 0.5, N.jingle); playBuf(J.inst, m - 12, t, 0.18, N.jingle); }
        }
        t += beat * b; total += beat * b;
      }
      const g = N.duck.gain, now = ac.currentTime; duckUntil = now + total + 0.3;
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0.12, now + 0.12);
      g.setValueAtTime(0.12, duckUntil); g.linearRampToValueAtTime(1, duckUntil + 0.8);
      return new Promise(r => setTimeout(r, (total + 0.35) * 1000));
    },
    /** setVolumes({music, sfx}) 0..1, saved in settings. */
    setVolumes(v = {}) {
      const st = (save.state.settings ||= {});
      if (Number.isFinite(v.music)) st.music = Math.max(0, Math.min(1, v.music));
      if (Number.isFinite(v.sfx)) st.sfx = Math.max(0, Math.min(1, v.sfx));
      if (N) { N.music.gain.setTargetAtTime(st.music ?? 0.6, ac.currentTime, 0.05); N.sfx.gain.setTargetAtTime(st.sfx ?? 0.8, ac.currentTime, 0.05); }
      save.commit();
    },
  };

  // suspend in the background (battery), resume when visible
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend?.(); else ac.resume?.();
  });
  return audio;
}
