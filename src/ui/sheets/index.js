// Sheet manager (ui area): menu, team, bag, dex, journal, map, settings, shop, box, summary.
// A sheet is a big rounded card that springs up from the bottom (portrait) or pops in the centre (landscape),
// with a coloured header band, back/close buttons and a scrollable body handed to the sheet's render().
// Opening a sheet while another is open stacks it (✕/B goes back); Menu/Tab closes everything.
// open() returns a Promise resolved with the value passed to close()/back() when that sheet goes away.
// Pushes busy 'sheet' while any sheet is open; emits ui:sheet {name, open}.
import { el, onTap, tapFeedback, leave } from '../dom.js';
import { icon } from '../icons.js';
import { setManager } from './kit.js';
import * as menu from './menu.js';
import * as team from './team.js';
import * as bag from './bag.js';
import * as dex from './dex.js';
import * as journal from './journal.js';
import * as map from './map.js';
import * as settings from './settings.js';
import * as shop from './shop.js';
import * as box from './box.js';
import * as summary from './summary.js';

export const SHEETS = ['menu', 'team', 'bag', 'dex', 'journal', 'map', 'settings', 'shop', 'box', 'summary'];
const MODS = { menu, team, bag, dex, journal, map, settings, shop, box, summary };
const META = {
  menu: { title: 'Menu', icon: 'menu', hue: 'sea' },
  team: { title: 'Squadra', icon: 'ball', hue: 'coral' },
  bag: { title: 'Zaino', icon: 'bag', hue: 'sun' },
  dex: { title: 'Velmondex', icon: 'dex', hue: 'coral' },
  journal: { title: 'Missioni', icon: 'journal', hue: 'teal' },
  map: { title: 'Mappa', icon: 'map', hue: 'leaf' },
  settings: { title: 'Opzioni', icon: 'settings', hue: 'lilac' },
  shop: { title: 'Bottega', icon: 'cart', hue: 'sea' },
  box: { title: 'Box Velmon', icon: 'box', hue: 'lilac' },
  summary: { title: 'Scheda', icon: 'dex', hue: 'coral' },
};

export function createSheets(ctx, root, focus) {
  const layer = el('div.layer.sheet-layer');
  const backdrop = el('div.sh-backdrop');
  layer.append(backdrop);
  root.append(layer);

  const stack = [];          // [{name, data, resolve, node, body, ret, scroll}]
  let releaseBusy = null, popFocus = null, sel = null;

  function chrome(entry) {
    const meta = META[entry.name] || { title: entry.name, icon: 'menu', hue: 'sea' };
    const titleEl = el('div.sh-title', entry.data?.title || meta.title);
    const back = el('button.sh-x.sh-back', { type: 'button', 'aria-label': 'Indietro', html: icon('back') });
    const close = el('button.sh-x', { type: 'button', 'aria-label': 'Chiudi', html: icon('close') });
    const head = el('div.sh-head', back, el('span.sh-hic', { html: icon(meta.icon) }), titleEl, el('div.sh-head-r'), close);
    const body = el('div.sh-body.scroll');
    const card = el('div.sh-card.hue-' + meta.hue + '.sh-' + entry.name, head, body);
    onTap(back, () => api.back());
    onTap(close, () => api.close());
    back.classList.toggle('hidden', stack.length < 1);
    entry.node = card; entry.body = body; entry.titleEl = titleEl; entry.headR = head.querySelector('.sh-head-r');
    return card;
  }

  function render(entry) {
    const mod = MODS[entry.name];
    try { entry.ret?.dispose?.(); } catch { /* ignore */ }
    entry.body.replaceChildren();
    entry.headR.replaceChildren();
    try { entry.ret = mod?.render?.(ctx, entry.body, { ...(entry.data || {}), _head: entry.headR, _title: entry.titleEl }) || null; }
    catch (e) { console.error('[ui] sheet render failed', entry.name, e); entry.body.append(el('div.sh-empty', 'Qualcosa è andato storto.')); }
    sel = null;
  }

  function showTop(dir = 1) {
    const top = stack[stack.length - 1];
    for (const e of stack) if (e !== top && e.node?.isConnected) { e.scroll = e.body.scrollTop; e.node.classList.add('under'); }
    if (!top) return;
    if (!top.node) { layer.append(chrome(top)); render(top); }
    top.node.classList.remove('under', 'out', 'out-back');
    top.node.classList.toggle('from-back', dir < 0);
    top.node.querySelector('.sh-back')?.classList.toggle('hidden', stack.length < 2);
    if (top.scroll) top.body.scrollTop = top.scroll;
  }

  function ensureOpen() {
    if (releaseBusy) return;
    releaseBusy = ctx.busy.push('sheet');
    layer.classList.add('on');
    popFocus = focus.push({
      ok: () => { const n = sel && sel.isConnected ? sel : null; if (n) (n._tap ? n._tap() : n.click()); else navSel(0, 1); },
      back: () => api.back(), menu: () => api.close(),
      map: () => { if (stack[stack.length - 1]?.name === 'map') api.close(); else api.open('map'); },
      nav: (dx, dy) => navSel(dx, dy),
    });
    ctx.audio?.sfx?.('ui_open');
  }
  function finishClose() {
    layer.classList.remove('on');
    popFocus?.(); popFocus = null;
    const r = releaseBusy; releaseBusy = null;
    setTimeout(() => r?.(), 30);
    ctx.audio?.sfx?.('ui_close');
  }

  // geometric keyboard navigation between buttons of the top card
  function navSel(dx, dy) {
    const top = stack[stack.length - 1]; if (!top) return;
    const cands = [...top.node.querySelectorAll('button:not(.disabled):not([disabled]):not(.hidden), input[type=range]')].filter(b => b.offsetParent !== null);
    if (!cands.length) return;
    if (!sel || !sel.isConnected || !cands.includes(sel)) { setSel(cands.find(c => !c.classList.contains('sh-x')) || cands[0]); return; }
    if (sel.matches('input[type=range]') && dx) { sel.value = +sel.value + dx * (+sel.step || 0.05); sel.dispatchEvent(new Event('input', { bubbles: true })); return; }
    const r = sel.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bs = Infinity;
    for (const c of cands) {
      if (c === sel) continue;
      const q = c.getBoundingClientRect(), x = q.left + q.width / 2 - cx, y = q.top + q.height / 2 - cy;
      const along = x * dx + y * dy; if (along <= 4) continue;
      const perp = Math.abs(x * dy) + Math.abs(y * dx);
      const s = along + perp * 2.2;
      if (s < bs) { bs = s; best = c; }
    }
    if (best) setSel(best);
  }
  function setSel(n) {
    sel?.classList.remove('kbsel');
    sel = n; n.classList.add('kbsel');
    n.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    tapFeedback();
  }

  const api = {
    open(name, data = {}) {
      if (!MODS[name]) { console.warn('[ui] unknown sheet', name); return Promise.resolve(null); }
      const top = stack[stack.length - 1];
      if (top?.name === name && !data?.forceNew) { top.data = data; render(top); return top.promise; }
      ensureOpen();
      const entry = { name, data };
      entry.promise = new Promise(r => { entry.resolve = r; });
      stack.push(entry);
      showTop(1);
      ctx.bus.emit('ui:sheet', { name, open: true });
      return entry.promise;
    },
    /** Close the top sheet (go back to the previous one). */
    back(value = null) {
      const e = stack.pop();
      if (!e) return;
      try { e.ret?.dispose?.(); } catch { /* ignore */ }
      leave(e.node, 260, stack.length ? 'out-back' : 'out');
      ctx.bus.emit('ui:sheet', { name: e.name, open: false });
      try { e.data?.onClose?.(value); } catch (err) { console.error(err); }
      e.resolve(value);
      if (stack.length) { const t = stack[stack.length - 1]; render(t); showTop(-1); tapFeedback(); }
      else finishClose();
    },
    /** Close every sheet. */
    close(value = null) { while (stack.length) api.back(value); },
    isOpen: () => stack.length > 0,
    get current() { return stack[stack.length - 1]?.name || null; },
    rerender() { const t = stack[stack.length - 1]; if (t) { const s = t.body.scrollTop; render(t); t.body.scrollTop = s; } },
  };
  onTap(backdrop, () => api.back(), { sfx: false });
  setManager(api);

  // live refresh of the visible sheet
  const REFRESH = { team: ['team:change'], bag: ['bag:change', 'team:change'], shop: ['coins:change', 'bag:change'], journal: ['quest:start', 'quest:step', 'quest:complete', 'objective:change'],
    dex: ['velmon:caught', 'velmon:seen'], box: ['team:change'], menu: ['coins:change'], summary: ['team:change'] };
  const pending = new Set();
  for (const [name, evs] of Object.entries(REFRESH)) for (const ev of evs) ctx.bus.on(ev, () => {
    const t = stack[stack.length - 1];
    if (t?.name !== name || t.ret?.noAutoRefresh || pending.has(name)) return;
    pending.add(name);
    setTimeout(() => { pending.delete(name); if (stack[stack.length - 1] === t) api.rerender(); }, 60);
  });
  return api;
}
