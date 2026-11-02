// Bottega: stock by town (later towns sell better items), buying, the clerk NPC at `shop.T.counter`.
// open(townId) shows the UI 'shop' sheet with {townId, townName, stock, buy(id, n) → bool, coins()}
// and resolves when it closes; without a shop sheet it falls back to a ui.choose flow.
import { ITEMS, SHOP_ORDER } from './items.js';
import { TOWNS, TOWN_NAMES } from './util.js';
import { lookFor, STORY_LOOKS } from './looks.js';

/** 0: basics · 1: + Megasfera, Superpozione · 2: + Ravviva */
const TIER = { alba: 0, petalo: 0, fulgida: 1, muschio: 2, fosco: 2, corallo: 2, cristallo: 2, sole: 2, ramata: 2 };
const TIER_ITEMS = [['sfera', 'pozione'], ['megasfera', 'superpozione'], ['ravviva']];

export function createShop(ctx) {
  const K = () => ctx.story.kit;

  const shop = {
    stock(townId = 'alba') {
      const tier = Math.max(TIER[townId] ?? 0, ctx.flags.has('ch1_done') ? 1 : 0);
      const ids = new Set(TIER_ITEMS.slice(0, tier + 1).flat());
      return SHOP_ORDER.filter(id => ids.has(id)).map(id => ({ id, price: ITEMS[id].price, item: ITEMS[id] }));
    },
    /** Buy n of id; Pokémon-style bonus: 10 Sfere → 1 Megasfera in omaggio. */
    buy(id, n = 1) {
      const it = ITEMS[id];
      n = Math.max(1, Math.floor(n));
      if (!it || it.shop === false) return false;
      if (!ctx.story.economy.spend(it.price * n, 'shop')) { K().sfx('ui_close'); return false; }
      ctx.story.bag.add(id, n);
      K().sfx('coin');
      if (id === 'sfera' && n >= 10) { ctx.story.bag.add('megasfera', 1); K().toast('Omaggio della Bottega: 1 Megasfera!', { icon: '🎁' }); }
      ctx.bus.emit('shop:buy', { id, n });
      return true;
    },
    async open(townId) {
      const town = townId || ctx.world?.area || 'alba';
      const data = { townId: town, townName: TOWN_NAMES[town] || '', stock: shop.stock(town), buy: (id, n) => shop.buy(id, n), coins: () => ctx.story.economy.coins };
      if (ctx.ui?.sheet) {
        K().sfx('ui_open');
        const closed = ctx.ui.sheet('shop', data);
        if (closed?.then) await closed;
        else { await K().wait(0.05); await K().until(() => !ctx.ui.isOpen?.(), 3600); }
        return;
      }
      await fallbackShop(data);
    },
  };

  async function fallbackShop(data) {
    for (;;) {
      const opts = data.stock.map(s => ({ icon: s.item.icon, label: `${s.item.name} · 💰 ${s.price}`, sub: `${s.item.desc} (ne hai ${ctx.story.bag.count(s.id)})` }));
      const i = await K().choose(`Bottega — hai 💰 ${data.coins()}`, [...opts, { icon: '👋', label: 'Esci' }]);
      if (i < 0 || i >= data.stock.length) return;
      const s = data.stock[i];
      const qs = [1, 5, 10].filter(q => q * s.price <= data.coins());
      if (!qs.length) { await K().say('Commesso', ['Mi spiace, non hai abbastanza monete.']); continue; }
      const j = await K().choose(`Quante ${s.item.name}?`, qs.map(q => ({ label: `${q} · 💰 ${q * s.price}` })));
      if (j < 0) continue;
      if (shop.buy(s.id, qs[j])) K().toast(`Hai comprato ${qs[j]}× ${s.item.name}!`, { icon: s.item.icon });
    }
  }

  for (const town of TOWNS) {
    ctx.story.npcs.define({
      id: `clerk.${town}`, name: 'Commesso Bottega', look: lookFor(ctx, 'clerk', STORY_LOOKS.clerk), at: `shop.${town}.counter`, kind: 'clerk',
      label: 'Compra', icon: '🛒',
      talk: async (c, npc) => {
        await K().say('Commesso', [`Benvenuto alla Bottega di ${TOWN_NAMES[town]}! Dai un'occhiata.`], { actor: npc, expression: 'smile', gesture: 'wave' });
        await ctx.story.dialogue.release();
        await shop.open(town);
        await K().say('Commesso', ['Grazie e torna presto!'], { actor: npc, expression: 'smile', gesture: 'nod' });
      },
    });
  }
  return shop;
}
