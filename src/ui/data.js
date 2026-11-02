// Safe read-only accessors over other areas (ui area, private). Everything uses optional chaining and falls
// back to the save state, so the UI keeps working while other areas are missing or still stubs.

/** Species table (creatures area) or {}. */
export const speciesTable = ctx => ctx.creatures?.SPECIES || {};
export const movesTable = ctx => ctx.creatures?.MOVES || {};
export const typeColors = ctx => ctx.creatures?.TYPE_COLORS || {};
export const speciesOf = (ctx, id) => speciesTable(ctx)[id] || null;

export function typeColor(ctx, type) {
  return typeColors(ctx)[type] || { Normale: '#a8a77a', Fuoco: '#ee8130', Acqua: '#6390f0', Erba: '#7ac74c', Elettro: '#f7d02c', Ghiaccio: '#96d9d6',
    Roccia: '#b6a136', Terra: '#e2bf65', Volante: '#a98ff3', Coleottero: '#a6b91a', Spettro: '#735797' }[type] || '#9aa3b8';
}

/** Stats as in creatures/monster.js (fallback when the area does not expose them). */
function statsFor(sp, level) {
  const b = sp?.base || { hp: 40, atk: 40, def: 40, spd: 40 };
  const st = v => Math.floor((v * 2 * level) / 100) + 5;
  return { hp: Math.floor((b.hp * 2 * level) / 100) + level + 10, atk: st(b.atk), def: st(b.def), spd: st(b.spd) };
}
const xpFor = l => l * l * l;   // same curve as creatures/monster.js xpForLevel

/** Everything the UI shows about a Monster: {name, species, sp, types, level, hp, maxHp, hpFrac, xpFrac, stats, moves, fainted}. */
export function monInfo(ctx, mon) {
  if (!mon) return null;
  const sp = speciesOf(ctx, mon.species);
  const level = mon.level || 1;
  let stats = statsFor(sp, level);
  try { const s = ctx.creatures?.stats?.(mon); if (s && typeof s === 'object') stats = { ...stats, ...s }; } catch { /* fallback */ }
  let mh = null;
  try { mh = ctx.creatures?.maxHp?.(mon) ?? ctx.creatures?.team?.maxHp?.(mon); } catch { mh = null; }
  const maxHp = Math.max(1, +mh || stats.hp);
  const hp = Math.max(0, Math.min(maxHp, mon.hp ?? maxHp));
  const lo = xpFor(level), hi = xpFor(level + 1);
  const xpFrac = Math.max(0, Math.min(1, ((mon.xp ?? lo) - lo) / Math.max(1, hi - lo)));
  return {
    mon, sp, name: mon.nickname || sp?.name || mon.species || '???', speciesName: sp?.name || mon.species,
    types: sp?.types || [], level, hp, maxHp, hpFrac: hp / maxHp, xpFrac, xpToNext: Math.max(0, hi - (mon.xp ?? lo)),
    stats: { ...stats, hp: maxHp }, moves: mon.moves || [], fainted: hp <= 0, desc: sp?.desc || '', evo: sp?.evo || null,
  };
}

export const hpClass = f => (f > 0.5 ? '' : f > 0.2 ? 'mid' : 'lo');

export const party = ctx => ctx.creatures?.team?.party || ctx.save?.state?.creatures?.party || [];
export const box = ctx => ctx.creatures?.team?.box || ctx.save?.state?.creatures?.box || [];
export const coins = ctx => ctx.story?.economy?.coins ?? ctx.save?.state?.story?.coins ?? 0;

/** Item definition (story ITEMS) with a sane fallback. */
export function itemDef(ctx, id) {
  return ctx.story?.items?.[id] || { name: id, icon: '🎁', desc: '' };
}
export function bagList(ctx) {
  const l = ctx.story?.bag?.list?.();
  if (Array.isArray(l)) return l.map(r => ({ ...r, item: r.item || itemDef(ctx, r.id) }));
  const b = ctx.save?.state?.story?.bag || {};
  return Object.entries(b).filter(([, n]) => n > 0).map(([id, n]) => ({ id, n, item: itemDef(ctx, id) }));
}
/** Bag category of an item: balls | heal | key | other. */
export function itemKind(item) {
  if (!item) return 'other';
  if (item.ball) return 'balls';
  if (item.heal || item.revive) return 'heal';
  if (item.key) return 'key';
  return 'other';
}

/** Area display name from world data. */
export function areaName(ctx, id) {
  if (!id) return '';
  return ctx.world?.areaDef?.(id)?.name || ({ alba: 'Borgo Alba' })[id] || id;
}
/** Short area name for the HUD ("Percorso 1 · Sentiero dei Fiori" → "Percorso 1"). */
export const shortName = n => String(n || '').split(' · ')[0];

export const adultOn = ctx => !!ctx.save?.state?.settings?.adult;
