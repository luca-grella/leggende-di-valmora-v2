// Sheet "menu": the pause menu — big round tiles (Squadra, Zaino, Velmondex, Missioni, Mappa, Opzioni, Salva),
// a trainer card strip (coins, Velmondex count, play time, location) and Nuova partita via Opzioni.
import { el, onTap } from '../dom.js';
import { icon } from '../icons.js';
import { sheets } from './kit.js';
import { coins, party, areaName } from '../data.js';

const TILES = [
  { id: 'team', label: 'Squadra', icon: 'ball', hue: 'coral' },
  { id: 'bag', label: 'Zaino', icon: 'bag', hue: 'sun' },
  { id: 'dex', label: 'Velmondex', icon: 'dex', hue: 'pink' },
  { id: 'journal', label: 'Missioni', icon: 'journal', hue: 'teal' },
  { id: 'map', label: 'Mappa', icon: 'map', hue: 'leaf' },
  { id: 'settings', label: 'Opzioni', icon: 'settings', hue: 'lilac' },
  { id: 'save', label: 'Salva', icon: 'save', hue: 'sea' },
];

export function render(ctx, root) {
  const st = ctx.save?.state || {};
  const seen = ctx.creatures?.dex?.countSeen?.() ?? Object.keys(st.creatures?.seen || {}).length;
  const caught = ctx.creatures?.dex?.countCaught?.() ?? Object.keys(st.creatures?.caught || {}).length;
  const pt = Math.floor(st.playTime || 0);
  const h = Math.floor(pt / 3600), m = Math.floor((pt % 3600) / 60);
  const quests = (() => { try { return ctx.story?.quests?.active?.()?.length ?? 0; } catch { return 0; } })();

  const card = el('div.tcard',
    el('div.tc-ball', { html: icon('ball') }),
    el('div.tc-body',
      el('div.tc-name', 'Scheda Allenatore'),
      el('div.tc-place', el('span', { html: icon('pin') }), areaName(ctx, ctx.world?.area || st.player?.area) || 'Valmora')),
    el('div.tc-stats',
      el('div.tc-st', el('span.tc-ic', { html: icon('coin') }), el('b.num', coins(ctx).toLocaleString('it-IT'))),
      el('div.tc-st', el('span.tc-ic', { html: icon('dex') }), el('b.num', `${caught}`), el('small', `/${seen} visti`)),
      el('div.tc-st', el('span.tc-ic', { html: icon('sun') }), el('b.num', `${h}:${String(m).padStart(2, '0')}`), el('small', 'ore'))));

  const grid = el('div.mgrid');
  TILES.forEach((t, i) => {
    const badge = t.id === 'team' ? party(ctx).length : t.id === 'journal' ? quests : null;
    const b = el('button.mtile.hue-' + t.hue, { type: 'button' },
      el('span.mt-disc', el('span.mt-ic', { html: icon(t.icon) }), badge ? el('span.badge', String(badge)) : null),
      el('span.mt-label', t.label));
    b.style.setProperty('--i', i);
    onTap(b, () => {
      if (t.id === 'save') {
        const ok = ctx.save?.flush?.();
        ctx.ui?.toast?.(ok === false ? 'Impossibile salvare su questo dispositivo' : 'Partita salvata', { icon: ok === false ? 'close' : 'save' });
        ctx.audio?.jingle?.('item');
        b.classList.remove('saved'); void b.offsetWidth; b.classList.add('saved');
        return;
      }
      sheets().open(t.id);
    });
    grid.append(b);
  });
  root.append(card, grid);
}
