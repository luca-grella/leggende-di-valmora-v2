// Toasts (small pills under the HUD), big banners ("Nuovo Campione di …!", quest complete) with a star burst,
// and the Sun/Moon location plate shown when entering an area (ui area).
import { el, leave } from './dom.js';
import { icon } from './icons.js';

const KIND_ICON = { town: 'town', route: 'route', cave: 'cave', beach: 'beach', sanctuary: 'shrine' };

export function createToasts(ctx, root) {
  const layer = el('div.layer.toast-layer');
  const stack = el('div.toasts');
  const bannerHost = el('div.banner-host');
  const plateHost = el('div.plate-host');
  layer.append(plateHost, stack, bannerHost);
  root.append(layer);

  // ── toasts ──
  function toast(text, { icon: ic, ms = 2200 } = {}) {
    if (!text) return;
    const t = el('div.toast', ic ? el('span.t-ic', { html: icon(ic) }) : null, el('span.t-txt', String(text)));
    stack.append(t);
    while (stack.children.length > 3) stack.firstChild.remove();
    ctx.audio?.sfx?.('ui_open', { vol: 0.35, pitch: 1.3 });
    setTimeout(() => leave(t, 320), ms);
  }

  // ── banners (queued) ──
  const queue = [];
  let showing = false;
  function banner(title, sub, { ms = 2600, icon: ic = 'star' } = {}) {
    queue.push({ title, sub, ms, ic });
    if (!showing) nextBanner();
  }
  function nextBanner() {
    const b = queue.shift();
    if (!b) { showing = false; return; }
    showing = true;
    const burst = el('div.bn-burst', Array.from({ length: 10 }, (_, i) => { const s = el('i', { html: icon(i % 3 ? 'sparkle' : 'star') }); s.style.setProperty('--a', `${i * 36}deg`); s.style.setProperty('--d', `${(i % 3) * 0.05}s`); return s; }));
    const node = el('div.banner', burst,
      el('div.bn-ribbon', el('span.bn-ic', { html: icon(b.ic) }), el('div.bn-title', String(b.title || '')), el('span.bn-ic', { html: icon(b.ic) })),
      b.sub ? el('div.bn-sub', String(b.sub)) : null);
    bannerHost.append(node);
    ctx.audio?.jingle?.('quest');
    setTimeout(() => leave(node, 420).then(() => setTimeout(nextBanner, 120)), b.ms);
  }

  // ── area plate ──
  let lastPlate = '', lastPlateAt = 0, plateNode = null;
  function areaBanner(name, { sub, kind } = {}) {
    if (!name) return;
    const now = performance.now();
    if (name === lastPlate && now - lastPlateAt < 4000) return;   // world and ui may both ask
    lastPlate = name; lastPlateAt = now;
    if (plateNode) leave(plateNode, 300);
    const [main, second] = String(name).split(' · ');
    const node = el('div.plate',
      el('div.pl-ic', { html: icon(KIND_ICON[kind] || 'pin') }),
      el('div.pl-body', el('div.pl-name', main), second || sub ? el('div.pl-sub', second || sub) : null));
    plateNode = node;
    plateHost.append(node);
    setTimeout(() => { leave(node, 500); if (plateNode === node) plateNode = null; }, 3000);
  }

  return { toast, banner, areaBanner };
}
