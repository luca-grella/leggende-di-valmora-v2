// Sheet "summary": one Velmon's card — big portrait on a type-tinted stage, name/level, types, HP and XP,
// stats with bars, moves with type colours, Velmondex text and evolution hint. ‹ › browse the list.
import { el, onTap } from '../dom.js';
import { icon } from '../icons.js';
import { sheets, empty } from './kit.js';
import { party, box, monInfo, typeColor, movesTable, speciesOf } from '../data.js';
import { thumb, typeChips, typeChip, hpBar } from '../widgets.js';

export function render(ctx, root, data = {}) {
  const list = data.list === 'box' ? box(ctx) : party(ctx);
  let i = Math.max(0, Math.min(list.length - 1, data.index | 0));
  const mon = data.mon || list[i];
  const inf = monInfo(ctx, mon);
  if (!inf) { root.append(empty('ball', 'Nessun Velmon')); return; }
  if (data._title) data._title.textContent = inf.name;

  const c0 = typeColor(ctx, inf.types[0]), c1 = typeColor(ctx, inf.types[1] || inf.types[0]);
  const stage = el('div.sm-stage', thumb(ctx, inf.mon.species, { size: 192, cls: 'big' }), el('div.sm-floor'));
  stage.style.setProperty('--c0', c0); stage.style.setProperty('--c1', c1);
  if (!data.mon && list.length > 1) {
    const prev = el('button.sm-nav.l', { type: 'button', 'aria-label': 'Precedente', html: icon('back') });
    const next = el('button.sm-nav.r', { type: 'button', 'aria-label': 'Successivo', html: icon('next') });
    onTap(prev, () => sheets().open('summary', { ...data, index: (i - 1 + list.length) % list.length }));
    onTap(next, () => sheets().open('summary', { ...data, index: (i + 1) % list.length }));
    stage.append(prev, next);
  }

  const head = el('div.sm-head',
    el('div.sm-name', inf.name, inf.mon.nickname ? el('small', ` (${inf.speciesName})`) : null),
    el('div.sm-lv', 'Lv', el('b', inf.level)),
    typeChips(ctx, inf.types));

  const vit = el('div.sm-vit',
    el('div.sm-row', el('span.sm-l', 'PS'), hpBar(inf.hpFrac), el('span.sm-v.num', `${inf.hp}/${inf.maxHp}`)),
    el('div.sm-row', el('span.sm-l', 'Esp.'), hpBar(inf.xpFrac, { xp: true }), el('span.sm-v.num', inf.level >= 100 ? 'MAX' : `−${inf.xpToNext.toLocaleString('it-IT')}`)));

  const STATS = [['Attacco', 'atk', '#ff6a4d'], ['Difesa', 'def', '#2bb7c9'], ['Velocità', 'spd', '#7dcb4c']];
  const stats = el('div.sm-stats', STATS.map(([lbl, k, col]) => {
    const v = inf.stats[k] || 0;
    const b = el('div.sm-sbar', el('i'));
    b.firstChild.style.width = Math.min(100, (v / Math.max(60, inf.level * 2.2 + 10)) * 100).toFixed(0) + '%';
    b.firstChild.style.background = col;
    return el('div.sm-stat', el('span.sm-l', lbl), b, el('b.num', String(v)));
  }));

  const M = movesTable(ctx);
  const moves = el('div.sm-moves', (inf.moves.length ? inf.moves : []).map(id => {
    const mv = M[id] || { name: id, type: 'Normale', power: 0, acc: 100 };
    const m = el('div.sm-move', el('span.smm-name', mv.name), typeChip(ctx, mv.type), el('span.smm-pw.num', mv.power ? `${mv.power}` : '—'), el('span.smm-acc.num', `${mv.acc ?? 100}%`));
    m.style.setProperty('--tc', typeColor(ctx, mv.type));
    return m;
  }));

  const evo = inf.evo ? speciesOf(ctx, inf.evo.to) : null;
  const info = el('div.sm-info',
    inf.desc ? el('p.sm-desc', inf.desc) : null,
    evo ? el('p.sm-evo', el('span', { html: icon('sparkle') }), `Si evolve in ${evo.name} al livello ${inf.evo.level}.`) : null,
    inf.mon.caughtAt ? el('p.sm-caught.muted', `Catturato a ${ctx.world?.areaDef?.(inf.mon.caughtAt)?.name || inf.mon.caughtAt}.`) : null);

  root.append(el('div.sm-top', stage, el('div.sm-side', head, vit)),
    el('div.sm-cols', el('div.sm-col', el('h3.sh-h', 'Statistiche'), stats), el('div.sm-col', el('h3.sh-h', 'Mosse'), moves)),
    info);
}
