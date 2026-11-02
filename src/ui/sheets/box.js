// Sheet "box" (Centro Cura PC): party on top, the Box below as a grid. Tap a party Velmon to deposit it
// (at least one stays), tap a boxed one to withdraw it (party max 6). Long lists scroll.
import { el, onTap } from '../dom.js';
import { icon } from '../icons.js';
import { sheets, section, empty } from './kit.js';
import { party, box, monInfo } from '../data.js';
import { thumb, hpBar } from '../widgets.js';

export function render(ctx, root) {
  const P = party(ctx), Bx = box(ctx);
  const T = ctx.creatures?.team;
  const cell = (mon, i, where) => {
    const inf = monInfo(ctx, mon);
    const b = el('button.bx-cell' + (inf.fainted ? '.faint' : ''), { type: 'button' }, thumb(ctx, mon.species, { size: 96 }),
      el('span.bx-name', inf.name), el('span.bx-lv', 'Lv ' + inf.level), hpBar(inf.hpFrac));
    b.style.setProperty('--i', i);
    onTap(b, async () => {
      if (where === 'party') {
        if (P.length <= 1) { ctx.ui?.toast?.('Ti serve almeno un Velmon in squadra!', { icon: 'ball' }); return; }
        const ok = await ctx.ui.confirm(`Depositare ${inf.name} nel Box?`, { yes: 'Deposita', no: 'No' });
        if (ok) { T?.toBox?.(i); ctx.audio?.sfx?.('ui_close'); }
      } else {
        if (P.length >= 6) { ctx.ui?.toast?.('La squadra è piena (6 Velmon)', { icon: 'ball' }); return; }
        const ok = await ctx.ui.confirm(`Ritirare ${inf.name} dal Box?`, { yes: 'Ritira', no: 'No' });
        if (ok) { T?.fromBox?.(i); ctx.audio?.sfx?.('ui_open'); }
      }
      sheets().rerender();
    });
    return b;
  };
  root.append(
    section(`Squadra (${P.length}/6)`, P.length ? el('div.bx-grid.party', P.map((m, i) => cell(m, i, 'party'))) : empty('ball', 'Squadra vuota')),
    section(`Box (${Bx.length})`, Bx.length ? el('div.bx-grid', Bx.map((m, i) => cell(m, i, 'box'))) : empty('box', 'Il Box è vuoto', 'I Velmon catturati con la squadra piena finiscono qui.')));
}
