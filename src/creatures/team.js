// Party (max 6) + Box, stored in save.state.creatures. Contract: docs/ARCHITECTURE.md "Creatures & Battle API".
import { maxHp, heal, normalize } from './monster.js';

export const PARTY_MAX = 6;

/** save.state.creatures with every field present (old saves are filled in and monsters normalised once). */
export function creaturesState(ctx) {
  const st = ctx.save.state;
  const c = (st.creatures && typeof st.creatures === 'object') ? st.creatures : (st.creatures = {});
  if (!Array.isArray(c.party)) c.party = [];
  if (!Array.isArray(c.box)) c.box = [];
  if (!c.seen || typeof c.seen !== 'object') c.seen = {};
  if (!c.caught || typeof c.caught !== 'object') c.caught = {};
  if (c.starter === undefined) c.starter = null;
  if (!checked.has(c)) {
    checked.add(c);
    c.party = c.party.filter(m => m && typeof m === 'object').map(normalize);
    c.box = c.box.filter(m => m && typeof m === 'object').map(normalize);
  }
  return c;
}
const checked = new WeakSet();

export function createTeam(ctx) {
  const st = () => creaturesState(ctx);
  const changed = () => { ctx.save.commit(); ctx.bus.emit('team:change', {}); };
  const team = {
    get party() { return st().party; },
    get box() { return st().box; },
    lead() { return st().party[0] || null; },
    firstAlive() { return st().party.find(m => m.hp > 0) || null; },
    alive() { return st().party.filter(m => m.hp > 0); },
    allFainted() { return st().party.length > 0 && st().party.every(m => m.hp <= 0); },
    /** Adds a monster to the party, or to the Box when the party is full. */
    add(mon) {
      const s = st();
      normalize(mon);
      if (s.party.length < PARTY_MAX) { s.party.push(mon); changed(); return 'party'; }
      s.box.push(mon); changed(); return 'box';
    },
    swap(i, j) {
      const p = st().party;
      if (!p[i] || !p[j] || i === j) return;
      [p[i], p[j]] = [p[j], p[i]]; changed();
    },
    toBox(i) {
      const s = st();
      if (s.party.length <= 1 || !s.party[i]) return false;
      // never leave the party without a Velmon able to fight
      if (s.party[i].hp > 0 && s.party.filter((m, k) => k !== i && m.hp > 0).length === 0) return false;
      s.box.push(...s.party.splice(i, 1)); changed(); return true;
    },
    fromBox(j) {
      const s = st();
      if (s.party.length >= PARTY_MAX || !s.box[j]) return false;
      s.party.push(...s.box.splice(j, 1)); changed(); return true;
    },
    /** Swap a party member with a Box member in one go. */
    exchange(i, j) {
      const s = st();
      if (!s.party[i] || !s.box[j]) return false;
      [s.party[i], s.box[j]] = [s.box[j], s.party[i]]; changed(); return true;
    },
    healAll() { st().party.forEach(heal); changed(); },
    byUid(uid) { const s = st(); return s.party.find(m => m.uid === uid) || s.box.find(m => m.uid === uid) || null; },
    maxHp,
  };
  return team;
}
