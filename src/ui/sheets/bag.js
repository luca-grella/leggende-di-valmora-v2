// Sheet "bag": pockets (Cure, Sfere, Strumenti) with item rows; tap an item to see it and Usa it on a Velmon
// (target chosen with the team sheet in pick mode, ctx.story.bag.canUse/use). Shows the carried gift object.
import { el, onTap } from '../dom.js';
import { icon } from '../icons.js';
import { sheets, empty, tabs } from './kit.js';
import { bagList, itemKind, party, monInfo } from '../data.js';

const POCKETS = [
  { id: 'heal', label: 'Cure', icon: 'heart' },
  { id: 'balls', label: 'Sfere', icon: 'ball' },
  { id: 'key', label: 'Strumenti', icon: 'bag' },
];
let lastPocket = 'heal';

export function render(ctx, root, data = {}) {
  const all = bagList(ctx);
  const byKind = { heal: [], balls: [], key: [] };
  for (const r of all) (byKind[itemKind(r.item)] || byKind.key).push(r);
  if (!byKind[lastPocket].length) lastPocket = POCKETS.find(p => byKind[p.id].length)?.id || lastPocket;

  const held = ctx.story?.grab?.held ?? ctx.save?.state?.story?.held;
  if (held) {
    const g = ctx.story?.GIFTS?.[held];
    root.append(el('div.bag-held', el('span.bh-ic', { html: icon('hand') }), el('span', 'In mano: ', el('b', g?.name || held))));
  }

  const list = el('div.bag-list');
  const t = tabs(POCKETS.map(p => ({ ...p, count: byKind[p.id].reduce((s, r) => s + r.n, 0) })), lastPocket, id => { lastPocket = id; fill(); });
  root.append(t.el, list);

  function fill() {
    list.replaceChildren();
    const rows = byKind[lastPocket];
    if (!rows.length) { list.append(empty('bag', 'Questa tasca è vuota', lastPocket === 'balls' ? 'Le Sfere si comprano in Bottega.' : null)); return; }
    rows.forEach((r, i) => {
      const it = r.item;
      const ic = it.ball ? (it.ball > 1 ? 'mega' : 'ball') : (it.icon || 'bag');
      const usable = !!(it.heal || it.revive);
      const useBtn = usable ? el('button.btn.small.leaf.bi-use', { type: 'button' }, 'Usa') : null;
      const node = el('div.bag-item', el('span.bi-ic', { html: icon(ic) }),
        el('div.bi-body', el('div.bi-top', el('span.bi-name', it.name || r.id), el('span.bi-n.num', '×' + r.n)), el('div.bi-desc', it.desc || '')),
        useBtn || (it.ball ? el('span.bi-note', 'In lotta') : null));
      node.style.setProperty('--i', i);
      if (useBtn) onTap(useBtn, () => useItem(r.id, it));
      list.append(node);
    });
  }

  async function useItem(id, it) {
    if (!party(ctx).length) { ctx.ui?.toast?.('Non hai Velmon in squadra', { icon: 'ball' }); return; }
    const canUse = mon => {
      const c = ctx.story?.bag?.canUse?.(id, mon);
      if (c === true) return true;
      if (typeof c === 'string') return c;
      const inf = monInfo(ctx, mon);
      if (it.revive) return inf.fainted ? true : 'Non è esausto';
      if (it.heal) return inf.fainted ? 'È esausto' : inf.hp >= inf.maxHp ? 'PS al massimo' : true;
      return 'Non ha effetto';
    };
    const idx = await sheets().open('team', { pick: true, title: `Usa ${it.name} su…`, check: canUse });
    if (idx == null || idx < 0) return;
    const mon = party(ctx)[idx];
    const msg = ctx.story?.bag?.use?.(id, mon);
    if (msg) { ctx.ui?.toast?.(msg, { icon: it.icon || 'heart' }); ctx.audio?.jingle?.('heal'); }
    else ctx.ui?.toast?.('Non ha effetto…', { icon: 'close' });
    sheets().rerender();
  }

  fill();
}
