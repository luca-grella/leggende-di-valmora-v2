// Bag: counts in save.state.story.bag, item use on Velmon (heal / revive). Contract: docs/ARCHITECTURE.md
// "Story API" → story.bag. Balls are consumed by the battle (bag.remove) when thrown.
import { ITEMS } from './items.js';

export function createBag(ctx) {
  const K = () => ctx.story?.kit;
  const b = () => {
    const st = (ctx.save.state.story ||= {});
    if (!st.bag || typeof st.bag !== 'object') st.bag = {};
    return st.bag;
  };
  const changed = id => { ctx.save.commit(); ctx.bus.emit('bag:change', { id, n: b()[id] || 0 }); };
  const maxHp = m => K()?.maxHp(m) ?? m.maxHp ?? m.hp;
  const name = m => K()?.monName(m) ?? m.nickname ?? m.species;

  const bag = {
    count: id => b()[id] || 0,
    has: id => (b()[id] || 0) > 0,
    add(id, n = 1) {
      if (!ITEMS[id]) console.warn('[bag] unknown item', id);
      b()[id] = (b()[id] || 0) + n; changed(id); return b()[id];
    },
    remove(id, n = 1) {
      if ((b()[id] || 0) < n) return false;
      b()[id] -= n; if (b()[id] <= 0) delete b()[id];
      changed(id); return true;
    },
    /** [{id, n, item}] in a stable, readable order (balls, medicine, key items). */
    list() {
      const order = Object.keys(ITEMS);
      return Object.entries(b()).filter(([, n]) => n > 0)
        .sort(([a], [c]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(c) + 1 || 99))
        .map(([id, n]) => ({ id, n, item: ITEMS[id] || { name: id, icon: '❔', desc: '' } }));
    },
    /** Items usable in a context: 'battle' (balls + medicine) or 'field' (medicine). */
    usable(context = 'field') {
      return bag.list().filter(({ item }) => (context === 'battle' ? item.battle : item.field));
    },
    canUse(id, mon) {
      const it = ITEMS[id];
      if (!it || !mon || !bag.has(id)) return false;
      if (it.revive) return (mon.hp ?? 0) <= 0;
      if (it.heal) return mon.hp > 0 && mon.hp < maxHp(mon);
      return false;
    },
    /** Uses the item on a Velmon; returns the Italian message, or null when it would do nothing. */
    use(id, mon) {
      if (!bag.canUse(id, mon)) return null;
      const it = ITEMS[id];
      bag.remove(id, 1);
      let msg;
      if (it.revive) { mon.hp = Math.max(1, Math.ceil(maxHp(mon) / 2)); msg = `${name(mon)} è di nuovo in forze!`; }
      else {
        const before = mon.hp;
        mon.hp = Math.min(maxHp(mon), mon.hp + it.heal);
        msg = it.heal > 999 ? `${name(mon)} ha di nuovo tutti i PS!` : `${name(mon)} recupera ${mon.hp - before} PS.`;
      }
      ctx.save.commit();
      ctx.bus.emit('team:change', {});
      ctx.bus.emit('item:used', { id, uid: mon.uid });
      return msg;
    },
  };
  return bag;
}
