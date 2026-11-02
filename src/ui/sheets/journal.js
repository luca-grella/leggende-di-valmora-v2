// Sheet "journal" (Missioni): main quests ★ and side quests 📜 with the current step, progress dots and reward;
// tap a quest to track it (tracker arrow + map + beacon). Completed quests fold at the bottom. With 18+ on,
// an "Intesa" tab lists the women met (romance stage and bond hearts).
import { el, onTap } from '../dom.js';
import { icon } from '../icons.js';
import { sheets, empty, tabs, section } from './kit.js';
import { adultOn, areaName } from '../data.js';

let lastTab = 'main';
const STAGES = ['Conosciuta', 'Primo appuntamento', 'Serata a casa sua', 'Insieme'];

export function render(ctx, root) {
  const Q = ctx.story?.quests;
  const adult = adultOn(ctx);
  const defs = Q?.defs || {};
  let active = [];
  try { active = Q?.active?.() || []; } catch { active = []; }
  active = active.filter(a => adult || !(a.def || defs[a.id])?.adult);
  const done = Object.values(defs).filter(d => Q?.stepOf?.(d.id) === 'done' && (adult || !d.adult));
  const tracked = Q?.tracked ?? ctx.save?.state?.story?.tracked ?? null;
  const main = active.filter(a => (a.def || defs[a.id])?.main);
  const side = active.filter(a => !(a.def || defs[a.id])?.main);

  const T = [{ id: 'main', label: 'Storia', icon: 'star', count: main.length }, { id: 'side', label: 'Secondarie', icon: 'journal', count: side.length }];
  if (adult && ctx.romance?.girls?.length) T.push({ id: 'love', label: 'Intesa', icon: 'heart' });
  if (!T.find(t => t.id === lastTab)) lastTab = 'main';
  const body = el('div.jr-body');
  const t = tabs(T, lastTab, id => { lastTab = id; fill(); });
  root.append(t.el, body);

  function questCard(a, i) {
    const def = a.def || defs[a.id] || { title: a.id, steps: [] };
    const step = typeof a.step === 'number' ? a.step : 0;
    const s = def.steps?.[step];
    const on = tracked === a.id;
    const dots = el('div.jr-dots', (def.steps || []).map((_, k) => el('i' + (k < step ? '.d' : k === step ? '.c' : ''))));
    const reward = def.reward ? el('div.jr-reward', el('span', { html: icon('coin') }),
      [def.reward.coins ? `${def.reward.coins.toLocaleString('it-IT')} monete` : null,
       ...Object.entries(def.reward.items || {}).map(([id, n]) => `${n}× ${ctx.story?.items?.[id]?.name || id}`)].filter(Boolean).join(' · ')) : null;
    const where = s?.at && typeof s.at === 'string' ? areaName(ctx, s.at.split('.')[0]) : '';
    const card = el('button.jr-card' + (def.main ? '.main' : '') + (on ? '.on' : '') + (def.adult ? '.adult' : ''), { type: 'button' },
      el('span.jr-ic', { html: icon(def.adult ? 'heart' : def.main ? 'star' : 'journal') }),
      el('div.jr-main',
        el('div.jr-title', def.title || a.id),
        el('div.jr-step', s?.text || ''),
        where ? el('div.jr-where', el('span', { html: icon('pin') }), where) : null,
        dots, reward),
      el('span.jr-track', on ? 'Seguita' : 'Segui'));
    card.style.setProperty('--i', i);
    onTap(card, () => {
      Q?.track?.(on ? null : a.id);
      ctx.ui?.tracker?.refresh?.();
      ctx.ui?.toast?.(on ? 'Missione non più seguita' : `Segui: ${def.title}`, { icon: on ? 'close' : 'pin', ms: 1500 });
      sheets().rerender();
    });
    return card;
  }

  function fill() {
    body.replaceChildren();
    if (lastTab === 'love') { fillLove(); return; }
    const list = lastTab === 'main' ? main : side;
    if (!list.length) body.append(empty(lastTab === 'main' ? 'star' : 'journal', lastTab === 'main' ? 'Nessuna missione principale attiva' : 'Nessuna missione secondaria', 'Parla con gli abitanti per scoprirne di nuove.'));
    else body.append(el('div.jr-list', list.map(questCard)));
    const fin = done.filter(d => (lastTab === 'main') === !!d.main);
    if (fin.length) {
      const det = el('details.jr-done', el('summary', el('span', { html: icon('check') }), `Completate (${fin.length})`),
        el('div.jr-done-list', fin.map(d => el('div.jr-done-row', el('span', { html: icon(d.main ? 'star' : 'journal') }), d.title))));
      body.append(det);
    }
  }

  function fillLove() {
    const R = ctx.romance;
    const girls = (R?.girls || []).map(g => ({ g, stage: R.stage?.(g.id) ?? 0, tier: R.tier?.(g.id) ?? 0, bond: R.bond?.(g.id) ?? 0 }))
      .filter(x => x.stage > 0 || x.bond > 0 || ctx.save?.state?.romance?.girls?.[x.g.id]);
    if (!girls.length) { body.append(empty('heart', 'Non hai ancora conosciuto nessuna', 'Cerca il ❤ sopra la testa delle ragazze nei paesi.')); return; }
    body.append(el('div.jr-list', girls.map((x, i) => {
      const hearts = el('span.jr-hearts', [0, 1, 2].map(k => el('span', { html: icon(k <= x.tier && x.stage >= 3 ? 'heart' : k === 0 && x.stage > 0 ? 'heart' : 'heartEmpty') })));
      const c = el('div.jr-card.love', el('span.jr-ic', { html: icon('heart') }),
        el('div.jr-main', el('div.jr-title', x.g.name), el('div.jr-step', STAGES[Math.min(3, x.stage)] || ''), el('div.jr-where', el('span', { html: icon('pin') }), areaName(ctx, x.g.town))),
        hearts);
      c.style.setProperty('--i', i);
      return c;
    })));
  }

  fill();
}
