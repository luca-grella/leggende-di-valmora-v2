// Helpers shared by the sheet renderers (ui area, private).
import { el, onTap } from '../dom.js';
import { icon } from '../icons.js';

let manager = null;
export const setManager = m => { manager = m; };
/** The sheet manager: {open(name, data), back(value), close(value), rerender(), current}. */
export const sheets = () => manager;

export const section = (title, ...kids) => el('section.sh-sec', title ? el('h3.sh-h', title) : null, ...kids);
export const empty = (ic, text, sub) => el('div.sh-empty', el('div.sh-empty-ic', { html: icon(ic) }), el('div.sh-empty-t', text), sub ? el('div.sh-empty-s', sub) : null);

/** Segmented tabs. items: [{id, label, icon?, count?}] → {el, set(id)} ; onChange(id). */
export function tabs(items, active, onChange) {
  const btns = items.map(it => {
    const b = el('button.tab', { type: 'button', 'data-id': it.id }, it.icon ? el('span.tab-ic', { html: icon(it.icon) }) : null, el('span', it.label), it.count != null ? el('span.tab-n' + (+it.count ? '' : '.zero'), String(it.count)) : null);
    onTap(b, () => set(it.id, true));
    return b;
  });
  const node = el('div.tabs', btns);
  function set(id, user) {
    active = id;
    btns.forEach(b => b.classList.toggle('on', b.dataset.id === id));
    if (user) onChange?.(id);
  }
  set(active, false);
  return { el: node, set, get active() { return active; } };
}

/** A big row button: icon, title, sub, right side. */
export function row({ icon: ic, title, sub, right, cls = '', onTap: fn }) {
  const b = el('button.sh-row' + (cls ? '.' + cls.split(' ').join('.') : ''), { type: 'button' },
    ic ? el('span.sr-ic', { html: icon(ic) }) : null,
    el('span.sr-body', el('span.sr-title', title), sub ? el('span.sr-sub', sub) : null),
    right != null ? (right.nodeType ? right : el('span.sr-right', String(right))) : null);
  if (fn) onTap(b, fn);
  return b;
}

/** iOS-like toggle switch. */
export function toggle(on, onChange) {
  const t = el('button.tgl' + (on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': String(!!on) }, el('i'));
  onTap(t, () => { on = !on; t.classList.toggle('on', on); t.setAttribute('aria-checked', String(on)); onChange?.(on, t); });
  return { el: t, set(v) { on = !!v; t.classList.toggle('on', on); t.setAttribute('aria-checked', String(on)); } };
}
