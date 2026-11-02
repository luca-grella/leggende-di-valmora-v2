// Title screen (ui area): illustrated tropical sky, sun rays, drifting clouds, islands and waves (all CSS/SVG),
// the "Leggende di Valmora" logo, "Tocca per iniziare", then Continua / Nuova partita / Opzioni.
// At the first start it asks the 18+ question (default off) before starting. Pushes busy 'title'.
import { el, onTap, leave, wait } from './dom.js';
import { icon } from './icons.js';

const ISLANDS_SVG = `
<svg class="ti-isles" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs>
    <linearGradient id="tiFar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd3c4"/><stop offset="1" stop-color="#6bbfb6"/></linearGradient>
    <linearGradient id="tiNear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9bd85a"/><stop offset="1" stop-color="#5fae3c"/></linearGradient>
    <linearGradient id="tiSand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0c2"/><stop offset="1" stop-color="#f6dfa0"/></linearGradient>
  </defs>
  <path d="M40 210 Q120 120 210 150 Q260 100 330 160 Q380 170 420 210 Z" fill="url(#tiFar)" opacity=".85"/>
  <path d="M760 214 Q820 150 880 168 Q930 110 990 150 Q1050 140 1110 214 Z" fill="url(#tiFar)" opacity=".85"/>
  <path d="M1010 152 l18 -60 l18 60 Z" fill="#b9a48c" opacity=".7"/>
  <g class="ti-main">
    <path d="M300 236 Q360 130 470 140 Q540 70 640 110 Q720 86 790 150 Q860 170 900 236 Z" fill="url(#tiNear)" stroke="#2a2140" stroke-width="4" stroke-linejoin="round"/>
    <path d="M280 240 Q600 206 920 240 Z" fill="url(#tiSand)" stroke="#2a2140" stroke-width="4" stroke-linejoin="round"/>
    <g stroke="#2a2140" stroke-width="4" stroke-linejoin="round">
      <rect x="520" y="128" width="46" height="40" rx="6" fill="#fff2d8"/><path d="M510 132 L543 104 L576 132 Z" fill="#e8674a"/><rect x="536" y="146" width="14" height="22" rx="3" fill="#2fa8a0"/>
      <rect x="590" y="138" width="40" height="34" rx="6" fill="#fff2d8"/><path d="M582 142 L610 118 L638 142 Z" fill="#2fa8a0"/>
      <rect x="452" y="150" width="36" height="30" rx="6" fill="#fff2d8"/><path d="M444 154 L470 132 L496 154 Z" fill="#f5b83d"/>
      <path d="M706 168 L714 92 L730 92 L738 168 Z" fill="#fff"/><path d="M712 112 H732 M710 132 H734 M708 152 H736" stroke="#ff6a4d" stroke-width="7"/><rect x="706" y="76" width="32" height="18" rx="4" fill="#ffe28a"/><path d="M702 78 L722 60 L742 78 Z" fill="#e8674a"/>
    </g>
    <g class="ti-palm" stroke="#2a2140" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M370 226 Q366 180 384 150" fill="none" stroke-width="9"/><path d="M370 226 Q366 180 384 150" fill="none" stroke="#b97b47" stroke-width="5"/>
      <path d="M384 150 Q350 132 326 150 Q352 146 384 152 Z M384 150 Q400 120 432 128 Q406 136 386 154 Z M384 150 Q366 120 376 104 Q384 128 388 150 Z M384 150 Q418 150 430 172 Q408 158 384 154 Z" fill="#4f9a2c"/>
    </g>
  </g>
</svg>`;

const LOGO_SVG = `
<svg class="ti-logo-svg" viewBox="0 0 600 230" aria-label="Leggende di Valmora">
  <defs>
    <linearGradient id="tiGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6b8"/><stop offset=".45" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff9f1c"/></linearGradient>
    <linearGradient id="tiRib" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a6a"/><stop offset="1" stop-color="#e2492e"/></linearGradient>
  </defs>
  <g class="ti-rib">
    <path d="M150 18 H450 L470 44 L450 70 H150 L130 44 Z" fill="url(#tiRib)" stroke="#2a2140" stroke-width="6" stroke-linejoin="round"/>
    <text x="300" y="56" text-anchor="middle" font-size="34" font-weight="900" fill="#fff" letter-spacing="6" style="font-family:var(--font)">LEGGENDE DI</text>
  </g>
  <g style="font-family:var(--font)" font-weight="900" text-anchor="middle" letter-spacing="2">
    <text x="300" y="186" font-size="118" fill="#1d2f7a" stroke="#1d2f7a" stroke-width="30" stroke-linejoin="round" transform="translate(0 10)">VALMORA</text>
    <text x="300" y="186" font-size="118" fill="url(#tiGold)" stroke="#2448b8" stroke-width="16" stroke-linejoin="round" paint-order="stroke">VALMORA</text>
    <text x="300" y="186" font-size="118" fill="url(#tiGold)">VALMORA</text>
  </g>
  <path class="ti-shine" d="M90 120 L140 120 L110 200 L60 200 Z" fill="#fff" opacity=".0"/>
</svg>`;

export function createTitle(ctx, root, focus) {
  let node = null, release = null, popFocus = null, busyStart = false;

  function build() {
    const clouds = el('div.ti-clouds', [0, 1, 2, 3, 4].map(i => { const c = el('div.ti-cloud.c' + i); return c; }));
    const sparkles = el('div.ti-sparkles', Array.from({ length: 7 }, (_, i) => { const s = el('i', { html: icon('sparkle') }); s.style.setProperty('--i', i); return s; }));
    const waves = el('div.ti-waves', el('div.ti-wave.w1'), el('div.ti-wave.w2'), el('div.ti-wave.w3'));
    const logo = el('div.ti-logo', { html: LOGO_SVG }, el('div.ti-ball', { html: icon('ball') }));
    const tap = el('div.ti-tap', 'Tocca per iniziare');
    const menu = el('div.ti-menu.hidden');
    const ver = el('div.ti-ver', 'v' + (ctx.VERSION || '2'));
    const n = el('div.title', el('div.ti-sky'), el('div.ti-rays'), el('div.ti-sun'), clouds, el('div.ti-sea'), el('div.ti-isles-wrap', { html: ISLANDS_SVG }), waves, sparkles, el('div.ti-front', logo, tap, menu), ver);
    return { n, tap, menu };
  }

  function hasSave() { return !ctx.save?.firstLaunch || (ctx.save?.state?.creatures?.party?.length > 0); }

  async function askAdult() {
    const s = ctx.save.state.settings;
    if (s.adultAsked) return;
    const v = await adultQuestion(ctx, node, focus);
    s.adult = v; s.adultAsked = true;
    ctx.save.flush?.();
    ctx.bus.emit('settings:change', { key: 'adult', value: v });
  }

  async function start(newGame) {
    if (busyStart) return; busyStart = true;
    try {
      if (newGame && hasSave()) {
        const ok = await ctx.ui.confirm('Vuoi iniziare una nuova partita? Il salvataggio attuale verrà cancellato (le opzioni restano).', { yes: 'Sì, ricomincia', no: 'No' });
        if (!ok) return;
      }
      await askAdult();
      ctx.audio?.sfx?.('ui_open');
      await ctx.fade?.out?.(450, '#fff');
      hide();
      try { ctx.startGame?.(!!newGame); } catch (e) { console.error('[ui] startGame failed', e); }
      await wait(120);
      await ctx.fade?.in?.(650);
    } finally { busyStart = false; }
  }

  function reveal(parts) {
    if (!parts.menu.classList.contains('hidden')) return;
    parts.tap.classList.add('gone');
    const save = hasSave();
    const btns = [];
    if (save) btns.push(el('button.btn.big.sun.ti-b', { type: 'button' }, el('span', { html: icon('ball') }), 'Continua'));
    btns.push(el('button.btn.big.ti-b' + (save ? '.ghostish' : '.sun'), { type: 'button' }, el('span', { html: icon('sparkle') }), 'Nuova partita'));
    btns.push(el('button.btn.small.ghost.ti-b', { type: 'button' }, el('span', { html: icon('settings') }), 'Opzioni'));
    const acts = [];
    if (save) acts.push(() => start(false));
    acts.push(() => start(true));
    acts.push(() => ctx.ui?.sheet('settings', { fromTitle: true }));
    btns.forEach((b, i) => { onTap(b, acts[i]); b.style.setProperty('--i', i); });
    parts.menu.replaceChildren(...btns);
    parts.menu.classList.remove('hidden');
    let sel = 0;
    const setSel = i => { sel = (i + btns.length) % btns.length; btns.forEach((b, j) => b.classList.toggle('sel', j === sel)); };
    setSel(0);
    popFocus?.();
    popFocus = focus.push({ ok: () => acts[sel](), back: () => {}, menu: () => {}, nav: (dx, dy) => setSel(sel + (dy || dx)) });
  }

  function show() {
    if (node) return;
    const parts = build();
    node = parts.n;
    root.append(node);
    release = ctx.busy.push('title');
    ctx.audio?.music?.('title');
    const go = () => reveal(parts);
    node.addEventListener('pointerup', go, { once: true });
    popFocus = focus.push({ ok: go, back: go, menu: go });
    // auto reveal after a moment so keyboard / impatient users are never stuck
    setTimeout(() => { if (node === parts.n) go(); }, 2600);
  }

  function hide() {
    popFocus?.(); popFocus = null;
    if (node) { const n = node; node = null; leave(n, 400); }
    release?.(); release = null;
  }

  return { show, hide, get open() { return !!node; } };
}

/** The 18+ question panel. Resolves true (enable) / false. */
function adultQuestion(ctx, host, focus) {
  return new Promise(resolve => {
    const yes = el('button.btn.pink', { type: 'button' }, el('span', { html: icon('heart') }), 'Sì, ho almeno 18 anni');
    const no = el('button.btn.ghost', { type: 'button' }, 'No, grazie');
    const card = el('div.adult-card.panel',
      el('div.ad-head', el('span.ad-ic', { html: icon('heart') }), el('span.ad-badge', '18+')),
      el('div.ad-title', 'Contenuti per adulti'),
      el('p.ad-text', 'Questo gioco contiene scene romantiche per adulti (18+). Vuoi attivarle?'),
      el('p.ad-note', 'Sono spente se scegli No. Puoi cambiare idea quando vuoi in Opzioni.'),
      el('div.ad-btns', no, yes));
    const wrap = el('div.adult-wrap', card);
    (host || document.body).append(wrap);
    let sel = 0;
    const btns = [no, yes];
    const setSel = i => { sel = (i + 2) % 2; btns.forEach((b, j) => b.classList.toggle('sel', j === sel)); };
    setSel(0);
    const done = v => { pop(); leave(wrap, 300); resolve(v); };
    const pop = focus.push({ ok: () => done(sel === 1), back: () => done(false), nav: (dx, dy) => setSel(sel + (dx || dy)) });
    onTap(no, () => done(false));
    onTap(yes, () => done(true));
  });
}
