// Tiny DOM helpers (ui area). `el` is the public helper from the contract; the rest is private sugar.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * el('div.cls#id', {attrs}, ...children). Attribute keys: `onxxx` adds a listener, `html` sets innerHTML,
 * `text` sets textContent, `style` accepts a string or an object, `class` appends classes; false/null values are skipped.
 */
export function el(tag, attrs = {}, ...kids) {
  if (attrs == null || typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs)) { kids.unshift(attrs); attrs = {}; }
  const [t, ...rest] = tag.split(/(?=[.#])/);
  const e = document.createElement(t || 'div');
  for (const r of rest) r[0] === '.' ? e.classList.add(r.slice(1)) : (e.id = r.slice(1));
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'class') for (const c of String(v).split(/\s+/)) c && e.classList.add(c);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(3)) if (k != null && k !== false) e.append(k.nodeType ? k : String(k));
  return e;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Fast, reliable tap on touch + mouse: fires on pointerup inside the element if the pointer did not travel
 * (so scrolling lists does not trigger taps). Returns an unbind function.
 */
export function onTap(node, fn, { slop = 12, sfx = true } = {}) {
  let id = null, x0 = 0, y0 = 0, moved = false;
  const down = e => {
    if (e.button > 0) return;
    id = e.pointerId; x0 = e.clientX; y0 = e.clientY; moved = false;
    node.classList.add('pressed');
  };
  const move = e => { if (e.pointerId === id && Math.hypot(e.clientX - x0, e.clientY - y0) > slop) { moved = true; node.classList.remove('pressed'); } };
  const up = e => {
    if (e.pointerId !== id) return;
    id = null; node.classList.remove('pressed');
    if (moved || node.disabled || node.classList.contains('disabled')) return;
    if (sfx) tapFeedback();
    fn(e);
  };
  const cancel = () => { id = null; node.classList.remove('pressed'); };
  node._tap = () => { if (!node.disabled && !node.classList.contains('disabled')) { tapFeedback(); fn({ type: 'activate', target: node }); } };
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('pointerleave', cancel);
  // keyboard activation (focus + Enter) for accessibility
  node.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === node) { e.preventDefault(); e.stopPropagation(); fn(e); } });
  return () => { node.removeEventListener('pointerdown', down); node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', up); };
}

/** Shared feedback hook (set by ui/index.js): tap sound + light haptic. */
let feedback = () => {};
export function setTapFeedback(fn) { feedback = fn || (() => {}); }
export function tapFeedback() { try { feedback(); } catch { /* ignore */ } }

/** Wait n ms. */
export const wait = ms => new Promise(r => setTimeout(r, ms));
/** Next animation frame(s) — falls back to a timeout when rAF is throttled (hidden tab, headless). */
export function nextFrame() { return new Promise(r => { let done = false; const f = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 50); }); }

/** Remove an element after its exit animation (class `out`), with a timeout fallback. */
export function leave(node, ms = 260, cls = 'out') {
  if (!node || !node.isConnected) return Promise.resolve();
  node.classList.add(cls);
  return new Promise(r => setTimeout(() => { node.remove(); r(); }, ms));
}

/** Animate a number in a text node from its current value to `to` (eased). */
export function countTo(node, to, { ms = 650, fmt = n => n.toLocaleString('it-IT') } = {}) {
  const from = +(node.dataset.v ?? to) || 0;
  node.dataset.v = to;
  if (from === to) { node.textContent = fmt(to); return; }
  const t0 = performance.now();
  const id = (node._countId = (node._countId || 0) + 1);
  const step = () => {
    if (node._countId !== id) return;
    const k = Math.min(1, (performance.now() - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    node.textContent = fmt(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
  };
  step();
  setTimeout(() => { if (node._countId === id) node.textContent = fmt(to); }, ms + 120);   // rAF may be throttled
}
