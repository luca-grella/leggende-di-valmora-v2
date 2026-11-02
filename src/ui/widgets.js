// Shared UI widgets (ui area, private): Velmon thumbnails, type chips, HP/XP bars, monster cards, steppers.
import { el } from './dom.js';
import { icon } from './icons.js';
import { monInfo, typeColor, hpClass } from './data.js';

const thumbCache = new Map();
/** <span class="thumb"> that fills itself with the creatures thumbnail (async), a ball while loading. */
export function thumb(ctx, speciesId, { size = 96, silhouette = false, cls = '' } = {}) {
  const box = el('span.thumb' + (silhouette ? '.sil' : '') + (cls ? '.' + cls : ''), { html: icon('ball', 'th-ph') });
  if (!speciesId) return box;
  const key = speciesId + '@' + size;
  const put = url => {
    if (!url) return;
    const img = el('img', { alt: '', draggable: 'false' });
    const ok = () => { box.classList.add('ok'); box.querySelector('.th-ph')?.remove(); };
    img.onload = ok;
    img.onerror = () => img.remove();
    img.src = url;
    box.append(img);
    if (img.complete && img.naturalWidth) ok();
  };
  if (thumbCache.has(key)) put(thumbCache.get(key));
  else {
    const p = ctx.creatures?.thumbnail?.(speciesId, size);
    if (p && typeof p.then === 'function') p.then(url => { thumbCache.set(key, url); put(url); }).catch(() => {});
    else if (typeof p === 'string') { thumbCache.set(key, p); put(p); }
  }
  return box;
}

export function typeChip(ctx, type) {
  const c = el('span.chip.type', type);
  c.style.background = typeColor(ctx, type);
  return c;
}
export const typeChips = (ctx, types) => el('span.types', (types || []).map(t => typeChip(ctx, t)));

/** HP bar element; call setHp(bar, frac) to update. */
export function hpBar(frac, { xp = false } = {}) {
  const b = el('div.bar' + (xp ? '.xp' : ''), el('i'));
  setBar(b, frac, xp);
  return b;
}
export function setBar(b, frac, xp = false) {
  const f = Math.max(0, Math.min(1, frac || 0));
  b.firstChild.style.width = (f * 100).toFixed(1) + '%';
  if (!xp) { b.classList.toggle('mid', hpClass(f) === 'mid'); b.classList.toggle('lo', hpClass(f) === 'lo'); }
}

/** Compact Velmon card (team lists, pickers). */
export function monCard(ctx, mon, { tag, extra } = {}) {
  const inf = monInfo(ctx, mon);
  if (!inf) return el('div.mcard.empty', el('span.thumb', { html: icon('ballEmpty') }), el('div.mc-body', el('div.mc-name.muted', 'Vuoto')));
  return el('div.mcard' + (inf.fainted ? '.faint' : ''),
    thumb(ctx, inf.mon.species, { size: 96 }),
    el('div.mc-body',
      el('div.mc-top', el('span.mc-name', inf.name), el('span.mc-lv', 'Lv', el('b', inf.level))),
      el('div.mc-mid', typeChips(ctx, inf.types), tag ? el('span.mc-tag', tag) : null),
      el('div.mc-hp', el('span.mc-hpl', 'PS'), hpBar(inf.hpFrac), el('span.mc-hpn.num', `${inf.hp}/${inf.maxHp}`))),
    extra || null);
}

/** − n + stepper. onChange(n). */
export function stepper(n, { min = 1, max = 99, onChange } = {}) {
  const val = el('span.st-n.num', String(n));
  const minus = el('button.st-b', { type: 'button', 'aria-label': 'Meno' }, '−');
  const plus = el('button.st-b', { type: 'button', 'aria-label': 'Più' }, '+');
  const set = v => { n = Math.max(min, Math.min(max, v)); val.textContent = String(n); minus.disabled = n <= min; plus.disabled = n >= max; onChange?.(n); };
  minus.addEventListener('click', () => set(n - 1));
  plus.addEventListener('click', () => set(n + 1));
  const node = el('div.stepper', minus, val, plus);
  set(n);
  return { el: node, get value() { return n; }, set, setMax(m) { max = m; set(n); } };
}
