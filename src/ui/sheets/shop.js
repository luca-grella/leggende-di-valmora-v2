// Sheet "shop" (Bottega): the town stock (ctx.story.shop.stock(townId)) as shelves with price, owned count and
// a quantity stepper; Compra calls ctx.story.shop.buy(id, n). Coins shown live in the header.
// data: {townId, stock?:[{id, price}]}
import { el, onTap, countTo } from '../dom.js';
import { icon } from '../icons.js';
import { empty } from './kit.js';
import { coins, itemDef } from '../data.js';
import { stepper } from '../widgets.js';

export function render(ctx, root, data = {}) {
  const town = data.townId || ctx.world?.area || 'alba';
  const townName = ctx.world?.areaDef?.(town)?.name || '';
  if (data._title) data._title.textContent = data.title || 'Bottega';
  const wallet = el('span.num', coins(ctx).toLocaleString('it-IT'));
  data._head?.append(el('div.shop-wallet', el('span', { html: icon('coin') }), wallet));

  let stock = data.stock || ctx.story?.shop?.stock?.(town) || [];
  if (!stock.length) stock = Object.entries(ctx.story?.items || {}).filter(([, it]) => !it.key && it.price).map(([id, it]) => ({ id, price: it.price }));
  if (!stock.length) { root.append(empty('cart', 'Scaffali vuoti', 'Torna più tardi!')); return; }

  const clerk = el('div.shop-clerk', el('span.sc-ic', { html: icon('cart') }), el('div.sc-bubble', townName ? `Benvenuto alla Bottega di ${townName}! Cosa ti serve oggi?` : 'Benvenuto! Cosa ti serve oggi?'));
  const list = el('div.shop-list');
  stock.forEach((r, i) => {
    const it = itemDef(ctx, r.id);
    const owned = ctx.story?.bag?.count?.(r.id) ?? 0;
    const price = r.price ?? it.price ?? 0;
    const total = el('span.num', price.toLocaleString('it-IT'));
    const buy = el('button.btn.small.sun.shop-buy', { type: 'button' }, el('span', { html: icon('coin') }), total);
    const st = stepper(1, { min: 1, max: 99, onChange: n => { total.textContent = (n * price).toLocaleString('it-IT'); buy.classList.toggle('disabled', n * price > coins(ctx)); } });
    const ic = it.ball ? (it.ball > 1 ? 'mega' : 'ball') : (it.icon || 'bag');
    const row = el('div.shop-item', el('span.si-ic', { html: icon(ic) }),
      el('div.si-body', el('div.si-top', el('span.si-name', it.name || r.id), el('span.si-price', el('span', { html: icon('coin') }), price.toLocaleString('it-IT'))),
        el('div.si-desc', it.desc || ''), el('div.si-own', `Nello zaino: ${owned}`)),
      el('div.si-act', st.el, buy));
    row.style.setProperty('--i', i);
    buy.classList.toggle('disabled', price > coins(ctx));
    onTap(buy, () => {
      const n = st.value;
      const ok = ctx.story?.shop?.buy ? ctx.story.shop.buy(r.id, n) : false;
      if (ok) {
        ctx.audio?.sfx?.('coin');
        clerk.querySelector('.sc-bubble').textContent = n > 1 ? `Ecco a te ${n} ${it.name}! Grazie!` : `Ecco a te: ${it.name}! Grazie!`;
        countTo(wallet, coins(ctx));
        row.querySelector('.si-own').textContent = `Nello zaino: ${ctx.story?.bag?.count?.(r.id) ?? owned + n}`;
        row.classList.remove('bought'); void row.offsetWidth; row.classList.add('bought');
        refreshAffordable();
      } else {
        clerk.querySelector('.sc-bubble').textContent = 'Mi spiace, non hai abbastanza monete…';
        row.classList.remove('nope'); void row.offsetWidth; row.classList.add('nope');
        ctx.haptic?.(30);
      }
    });
    row._check = () => buy.classList.toggle('disabled', st.value * price > coins(ctx));
    list.append(row);
  });
  function refreshAffordable() { for (const r of list.children) r._check?.(); }
  root.append(clerk, list);
  return { noAutoRefresh: true };
}
