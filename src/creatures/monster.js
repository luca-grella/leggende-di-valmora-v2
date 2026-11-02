// Ported from v1 (src/creatures/monster.js); battle formulas in docs/GDD.md.
// A single Velmon: level, experience, stats, moves and current HP.
// Monster shape (docs/ARCHITECTURE.md): {uid, species, nickname, level, xp, hp, moves: [moveId ≤ 4], caughtAt?}.

import { SPECIES, MOVES } from './species.js';

export const MAX_LEVEL = 100;
export const xpForLevel = (l) => l * l * l;

export function statsFor(speciesId, level) {
  const b = SPECIES[speciesId]?.base || { hp: 40, atk: 40, def: 40, spd: 40 };
  const st = (v) => Math.floor((v * 2 * level) / 100) + 5;
  return { hp: Math.floor((b.hp * 2 * level) / 100) + level + 10, atk: st(b.atk), def: st(b.def), spd: st(b.spd) };
}

export function movesAt(speciesId, level) {
  const learned = (SPECIES[speciesId]?.learn || []).filter(([l]) => l <= level).map(([, m]) => m);
  return [...new Set(learned)].slice(-4);
}

let uidN = 0;
export function newUid() {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* insecure context */ }
  return 'v' + Date.now().toString(36) + (uidN++).toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createMonster(speciesId, level, nickname = null) {
  if (!SPECIES[speciesId]) { console.warn('[creatures] unknown species', speciesId); speciesId = 'topolux'; }
  level = Math.max(1, Math.min(MAX_LEVEL, Math.round(level || 1)));
  const s = statsFor(speciesId, level);
  return { uid: newUid(), species: speciesId, nickname, level, xp: xpForLevel(level), hp: s.hp, moves: movesAt(speciesId, level) };
}

/** Old saves / foreign builders may lack fields: fill them in place. Returns the monster. */
export function normalize(m) {
  if (!m || typeof m !== 'object') return m;
  if (!m.uid) m.uid = m.id || newUid();
  if (!SPECIES[m.species]) m.species = 'topolux';
  m.level = Math.max(1, Math.min(MAX_LEVEL, Math.round(m.level || 1)));
  if (!Number.isFinite(m.xp) || m.xp < xpForLevel(m.level)) m.xp = xpForLevel(m.level);
  if (!Array.isArray(m.moves) || !m.moves.length) m.moves = movesAt(m.species, m.level);
  m.moves = m.moves.filter(id => MOVES[id]).slice(0, 4);
  if (!m.moves.length) m.moves = ['azione'];
  const mx = maxHp(m);
  if (!Number.isFinite(m.hp)) m.hp = mx;
  m.hp = Math.max(0, Math.min(mx, Math.round(m.hp)));
  if (m.nickname === undefined) m.nickname = null;
  return m;
}

export const nameOf = (m) => m?.nickname || SPECIES[m?.species]?.name || '???';
export const stats = (m) => statsFor(m.species, m.level);
export const maxHp = (m) => stats(m).hp;

/**
 * Adds experience and returns the list of events: {kind:'level', level}, {kind:'move', move: name, id}
 * (learned into a free slot), {kind:'learn', id, move: name} (4 moves already: the caller asks which to forget;
 * with autoLearn the oldest is replaced and a 'move' event is emitted instead, like v1).
 */
export function gainXp(m, amount, { autoLearn = true } = {}) {
  const events = [];
  m.xp += Math.max(0, Math.floor(amount));
  while (m.level < MAX_LEVEL && m.xp >= xpForLevel(m.level + 1)) {
    const before = maxHp(m);
    m.level += 1;
    if (m.hp > 0) m.hp += maxHp(m) - before;
    events.push({ kind: 'level', level: m.level });
    for (const [l, mv] of SPECIES[m.species].learn) {
      if (l === m.level && !m.moves.includes(mv)) {
        if (m.moves.length < 4) { m.moves.push(mv); events.push({ kind: 'move', move: MOVES[mv].name, id: mv }); }
        else if (autoLearn) { m.moves.shift(); m.moves.push(mv); events.push({ kind: 'move', move: MOVES[mv].name, id: mv }); }
        else events.push({ kind: 'learn', move: MOVES[mv].name, id: mv });
      }
    }
  }
  if (m.level >= MAX_LEVEL) m.xp = Math.min(m.xp, xpForLevel(MAX_LEVEL));
  return events;
}

/** Put `moveId` into slot `slot` (a free slot is used first). Returns true when learned. */
export function learnMove(m, moveId, slot) {
  if (!MOVES[moveId] || m.moves.includes(moveId)) return false;
  if (m.moves.length < 4) { m.moves.push(moveId); return true; }
  if (!(slot >= 0 && slot <= 3)) return false;
  m.moves[slot] = moveId;
  return true;
}

export function heal(m) {
  m.hp = maxHp(m);
}

// The species this Velmon is ready to evolve into, or null.
export function pendingEvolution(m) {
  const e = SPECIES[m.species]?.evo;
  return e && m.level >= e.level && m.hp > 0 ? e.to : null;
}

// Turns the Velmon into its evolved form: stats grow (the HP lost so far is
// kept) and it learns the new species' moves up to its level that it lacks.
export function evolve(m, to) {
  const lost = maxHp(m) - m.hp;
  m.species = to;
  m.hp = Math.max(1, maxHp(m) - lost);
  const learned = [];
  for (const [l, mv] of SPECIES[to].learn) {
    if (l <= m.level && !m.moves.includes(mv) && learned.length < 2) {
      if (m.moves.length >= 4) m.moves.shift();
      m.moves.push(mv);
      learned.push(MOVES[mv].name);
    }
  }
  return learned;
}
