// Sheet "dex": the Velmondex — 45 entries in species order as a grid of round portraits (silhouettes when only
// seen, a ? when unknown), seen/caught counters, tap a known entry for its page (types, description, family).
import { el, onTap } from '../dom.js';
import { icon } from '../icons.js';
import { empty } from './kit.js';
import { speciesTable, speciesOf } from '../data.js';
import { thumb, typeChips } from '../widgets.js';

export function render(ctx, root) {
  const SP = speciesTable(ctx);
  const ids = Object.keys(SP);
  if (!ids.length) { root.append(empty('dex', 'Il Velmondex non è ancora pronto')); return; }
  const st = ctx.save?.state?.creatures || {};
  const seen = ctx.creatures?.dex?.seen || st.seen || {};
  const caught = ctx.creatures?.dex?.caught || st.caught || {};
  const nSeen = ids.filter(id => seen[id] || caught[id]).length, nCaught = ids.filter(id => caught[id]).length;

  const detail = el('div.dex-detail.hidden');
  const head = el('div.dex-head',
    el('div.dx-count', el('span.dx-ic', { html: icon('sparkle') }), 'Visti ', el('b.num', String(nSeen))),
    el('div.dx-count', el('span.dx-ic', { html: icon('ball') }), 'Catturati ', el('b.num', String(nCaught))),
    el('div.dx-prog', el('i', { style: { width: (nCaught / ids.length * 100).toFixed(1) + '%' } })));
  const grid = el('div.dex-grid');
  ids.forEach((id, i) => {
    const isSeen = !!(seen[id] || caught[id]), isCaught = !!caught[id];
    const cell = el('button.dex-cell' + (isSeen ? '' : '.unknown') + (isCaught ? '.caught' : ''), { type: 'button' },
      el('span.dx-no.num', '#' + String(i + 1).padStart(3, '0')),
      isSeen ? thumb(ctx, id, { size: 96, silhouette: !isCaught }) : el('span.thumb.q', '?'),
      el('span.dx-name', isSeen ? SP[id].name : '???'),
      isCaught ? el('span.dx-ball', { html: icon('ball') }) : null);
    onTap(cell, () => { if (isSeen) showDetail(id, i, isCaught); });
    grid.append(cell);
  });
  root.append(head, detail, grid);

  function showDetail(id, i, isCaught) {
    const sp = speciesOf(ctx, id);
    const fam = [];
    // walk back to the base form, then forward through evolutions
    const prevo = ctx.creatures?.PREVO || Object.fromEntries(Object.entries(SP).filter(([, s]) => s.evo).map(([k, s]) => [s.evo.to, k]));
    let base = id; while (prevo[base]) base = prevo[base];
    for (let cur = base, n = 0; cur && n < 4; cur = SP[cur]?.evo?.to, n++) fam.push(cur);
    const close = el('button.dx-close', { type: 'button', 'aria-label': 'Chiudi', html: icon('close') });
    detail.replaceChildren(el('div.dxd-card.panel.plain',
      close,
      el('div.dxd-top', thumb(ctx, id, { size: 160, silhouette: !isCaught, cls: 'big' }),
        el('div.dxd-info', el('div.dxd-no.num', '#' + String(i + 1).padStart(3, '0')), el('div.dxd-name', sp.name), typeChips(ctx, sp.types),
          el('p.dxd-desc', isCaught ? (sp.desc || '') : 'Cattura questo Velmon per saperne di più.'))),
      fam.length > 1 ? el('div.dxd-fam', fam.map((f, k) => [k ? el('span.dxd-arrow', { html: icon('next') }) : null,
        el('div.dxd-f' + (f === id ? '.on' : ''), thumb(ctx, f, { size: 96, silhouette: !(caught[f]) }), el('small', (seen[f] || caught[f]) ? SP[f].name : '???'),
          SP[f]?.evo && k < fam.length - 1 ? null : null)])) : null));
    detail.classList.remove('hidden');
    onTap(close, () => detail.classList.add('hidden'));
    detail.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }
}
