// Sheet "team": the party (max 6) as Sun/Moon cards with thumbnail, types, HP. Tap → Scheda (summary),
// ↑ moves a Velmon up (the first one leads). Pick mode (data.pick) is used by the bag to choose a target:
// {pick:true, title, check?(mon) → true|string reason} → the sheet resolves with the chosen index.
import { el, onTap } from '../dom.js';
import { icon } from '../icons.js';
import { sheets, empty } from './kit.js';
import { party } from '../data.js';
import { monCard } from '../widgets.js';

export function render(ctx, root, data = {}) {
  const list = party(ctx);
  if (data.pick && data._title) data._title.textContent = data.title || 'Scegli un Velmon';
  if (!list.length) { root.append(empty('ball', 'Nessun Velmon in squadra', 'La Prof.ssa Quercia ti aspetta al laboratorio!')); return; }
  const wrap = el('div.team-list');
  list.forEach((mon, i) => {
    let reason = null;
    if (data.pick && data.check) { const r = data.check(mon); if (r !== true) reason = typeof r === 'string' ? r : 'Non si può usare'; }
    const up = !data.pick && i > 0 ? el('button.tm-up', { type: 'button', 'aria-label': 'Sposta su', html: icon('up') }) : null;
    const card = monCard(ctx, mon, { tag: i === 0 && !data.pick ? 'Capofila' : reason, extra: up });
    const btn = el('button.tm-card' + (reason ? '.disabled' : ''), { type: 'button' }, card);
    btn.style.setProperty('--i', i);
    onTap(btn, () => {
      if (data.pick) { sheets().back(i); return; }
      sheets().open('summary', { index: i, list: 'party' });
    });
    if (up) {
      up.addEventListener('pointerdown', e => e.stopPropagation());
      up.addEventListener('pointerup', e => e.stopPropagation());
      onTap(up, () => {
        if (ctx.creatures?.team?.swap) ctx.creatures.team.swap(i, i - 1);
        else { [list[i], list[i - 1]] = [list[i - 1], list[i]]; ctx.save?.commit?.(); ctx.bus.emit('team:change', {}); }
        sheets().rerender();
      });
    }
    wrap.append(btn);
  });
  root.append(wrap);
  if (!data.pick) root.append(el('div.sh-hint', 'Tocca un Velmon per la sua scheda · ', el('span.inl', { html: icon('up') }), ' lo sposta in alto'));
  return { noAutoRefresh: false };
}
