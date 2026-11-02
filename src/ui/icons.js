// Procedural SVG icon set for the UI (private to the ui area). Chunky, rounded, with a dark outline like the
// Sun/Moon menus. icon(name) → SVG markup string; iconEl(name) → element. Unknown names fall back to emoji text.
import { el } from './dom.js';

const O = '#2a2140';               // outline colour (PALETTE.outline)
const S = `stroke="${O}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"`;
const s3 = `stroke="${O}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"`;

const ICONS = {
  coin: `<circle cx="50" cy="50" r="40" fill="#ffc93c" ${S}/><circle cx="50" cy="50" r="28" fill="#ffe28a" stroke="#e09a12" stroke-width="5"/>
    <path d="M38 36 L50 66 L62 36" fill="none" stroke="#c97d06" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M24 34 A32 32 0 0 1 44 20" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>`,
  ball: `<circle cx="50" cy="50" r="40" fill="#fff" ${S}/><path d="M10 50 A40 40 0 0 1 90 50 Z" fill="#ff5b4a"/>
    <path d="M10 50 A40 40 0 0 1 90 50" fill="none" ${S}/><path d="M12 50 H88" ${S}/>
    <circle cx="50" cy="50" r="11" fill="#fff" ${S}/><circle cx="50" cy="50" r="4" fill="#d8eef6"/>
    <path d="M26 30 A28 28 0 0 1 40 20" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".75"/>`,
  ballFaint: `<circle cx="50" cy="50" r="40" fill="#e9e6ef" ${S}/><path d="M10 50 A40 40 0 0 1 90 50 Z" fill="#a7a1b8"/>
    <path d="M10 50 A40 40 0 0 1 90 50" fill="none" ${S}/><path d="M12 50 H88" ${S}/><circle cx="50" cy="50" r="11" fill="#e9e6ef" ${S}/>`,
  ballEmpty: `<circle cx="50" cy="50" r="36" fill="rgba(255,255,255,.35)" stroke="#8fb9c9" stroke-width="5" stroke-dasharray="9 8"/>`,
  mega: `<circle cx="50" cy="50" r="40" fill="#fff" ${S}/><path d="M10 50 A40 40 0 0 1 90 50 Z" fill="#3c8cf0"/>
    <path d="M24 22 L36 38 M76 22 L64 38" stroke="#ff5b4a" stroke-width="7" stroke-linecap="round"/>
    <path d="M10 50 A40 40 0 0 1 90 50" fill="none" ${S}/><path d="M12 50 H88" ${S}/><circle cx="50" cy="50" r="11" fill="#fff" ${S}/>`,
  menu: `<rect x="16" y="22" width="68" height="12" rx="6" fill="#fff" ${s3}/><rect x="16" y="44" width="68" height="12" rx="6" fill="#fff" ${s3}/><rect x="16" y="66" width="68" height="12" rx="6" fill="#fff" ${s3}/>`,
  map: `<path d="M12 24 L36 16 L64 26 L88 18 V76 L64 84 L36 74 L12 82 Z" fill="#9bd85a" ${S}/>
    <path d="M36 16 V74 M64 26 V84" stroke="${O}" stroke-width="4" opacity=".35"/>
    <path d="M22 60 Q30 46 42 52 T60 48" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="5 5" stroke-linecap="round"/>
    <circle cx="70" cy="44" r="8" fill="#ff5b4a" ${s3}/>`,
  bag: `<path d="M26 36 Q26 22 50 22 Q74 22 74 36 V80 Q74 86 68 86 H32 Q26 86 26 80 Z" fill="#ffb03a" ${S}/>
    <path d="M38 22 Q38 12 50 12 Q62 12 62 22" fill="none" ${S}/><rect x="34" y="50" width="32" height="20" rx="6" fill="#ffe28a" ${s3}/>
    <path d="M26 44 H74" stroke="${O}" stroke-width="4"/>`,
  dex: `<rect x="20" y="10" width="60" height="80" rx="16" fill="#ff6a4d" ${S}/><rect x="30" y="22" width="40" height="34" rx="8" fill="#9ee8ff" ${s3}/>
    <circle cx="42" cy="38" r="5" fill="${O}"/><circle cx="58" cy="38" r="5" fill="${O}"/><circle cx="50" cy="72" r="8" fill="#ffc93c" ${s3}/>`,
  journal: `<path d="M18 18 Q18 12 24 12 H76 Q82 12 82 18 V84 Q82 90 76 90 H24 Q18 90 18 84 Z" fill="#2bb7c9" ${S}/>
    <rect x="30" y="12" width="44" height="78" fill="#fff2d8" ${s3}/><path d="M40 32 H64 M40 46 H64 M40 60 H56" stroke="${O}" stroke-width="4.5" stroke-linecap="round" opacity=".55"/>
    <path d="M62 66 L66 76 L72 70" fill="none" stroke="#ff5b4a" stroke-width="5" stroke-linecap="round"/>`,
  settings: `<path d="M50 10 L58 12 L60 22 L68 26 L77 21 L83 27 L78 36 L82 44 L92 46 V54 L82 56 L78 64 L83 73 L77 79 L68 74 L60 78 L58 88 H42 L40 78 L32 74 L23 79 L17 73 L22 64 L18 56 L8 54 V46 L18 44 L22 36 L17 27 L23 21 L32 26 L40 22 L42 12 Z" fill="#b8c4e6" ${S}/>
    <circle cx="50" cy="50" r="14" fill="#fff" ${S}/>`,
  save: `<path d="M16 22 Q16 14 24 14 H70 L86 30 V78 Q86 86 78 86 H24 Q16 86 16 78 Z" fill="#9b7fd1" ${S}/>
    <rect x="30" y="14" width="36" height="22" fill="#fff" ${s3}/><rect x="28" y="54" width="44" height="32" rx="4" fill="#fff2d8" ${s3}/>
    <path d="M40 68 L48 76 L62 60" fill="none" stroke="#4f9a2c" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
  close: `<path d="M28 28 L72 72 M72 28 L28 72" stroke="${O}" stroke-width="15" stroke-linecap="round"/><path d="M28 28 L72 72 M72 28 L28 72" stroke="#fff" stroke-width="7" stroke-linecap="round"/>`,
  back: `<path d="M60 20 L30 50 L60 80" fill="none" stroke="${O}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M60 20 L30 50 L60 80" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,
  next: `<path d="M40 20 L70 50 L40 80" fill="none" stroke="${O}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M40 20 L70 50 L40 80" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,
  arrow: `<path d="M50 6 L86 52 H64 V92 H36 V52 H14 Z" fill="#ffc93c" ${S}/><path d="M50 18 L70 44" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/>`,
  star: `<path d="M50 8 L62 36 L92 38 L69 58 L77 88 L50 72 L23 88 L31 58 L8 38 L38 36 Z" fill="#ffc93c" ${S}/><path d="M40 40 L48 30" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>`,
  starEmpty: `<path d="M50 8 L62 36 L92 38 L69 58 L77 88 L50 72 L23 88 L31 58 L8 38 L38 36 Z" fill="rgba(255,255,255,.35)" stroke="#9aa6c8" stroke-width="5" stroke-linejoin="round"/>`,
  heart: `<path d="M50 86 C20 64 8 48 12 32 C16 16 38 12 50 30 C62 12 84 16 88 32 C92 48 80 64 50 86 Z" fill="#ff5f9e" ${S}/><path d="M26 30 Q30 22 38 24" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>`,
  heartEmpty: `<path d="M50 86 C20 64 8 48 12 32 C16 16 38 12 50 30 C62 12 84 16 88 32 C92 48 80 64 50 86 Z" fill="rgba(255,255,255,.5)" stroke="#d9a3bd" stroke-width="5" stroke-linejoin="round"/>`,
  sun: `<g stroke="${O}" stroke-width="5" stroke-linecap="round"><path d="M50 6 V18 M50 82 V94 M6 50 H18 M82 50 H94 M19 19 L27 27 M73 73 L81 81 M81 19 L73 27 M27 73 L19 81"/></g>
    <circle cx="50" cy="50" r="24" fill="#ffc93c" ${S}/><path d="M38 42 Q42 34 50 34" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>`,
  moon: `<path d="M62 12 A38 38 0 1 0 88 64 A30 30 0 1 1 62 12 Z" fill="#ffe28a" ${S}/><circle cx="40" cy="58" r="5" fill="#f0c85a"/><circle cx="52" cy="74" r="3.5" fill="#f0c85a"/>`,
  dawn: `<path d="M10 70 H90" ${S}/><path d="M22 70 A28 28 0 0 1 78 70 Z" fill="#ffb07a" ${S}/><g stroke="${O}" stroke-width="5" stroke-linecap="round"><path d="M50 18 V30 M18 34 L26 42 M82 34 L74 42"/></g><path d="M24 84 H76" stroke="${O}" stroke-width="5" stroke-linecap="round" opacity=".5"/>`,
  sunset: `<path d="M22 64 A28 28 0 0 1 78 64 Z" fill="#ff8a5c" ${S}/><path d="M8 64 H92" ${S}/><path d="M20 78 H80 M34 90 H66" stroke="#ff8a5c" stroke-width="6" stroke-linecap="round"/>`,
  run: `<path d="M18 62 Q18 44 34 44 L56 46 Q66 34 76 40 L86 58 Q90 70 78 72 H26 Q18 72 18 62 Z" fill="#ff6a4d" ${S}/><path d="M26 72 H82" ${S}/>
    <path d="M6 36 H28 M2 50 H16 M10 24 H34" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M6 36 H28 M2 50 H16 M10 24 H34" stroke="${O}" stroke-width="2" stroke-linecap="round" opacity=".4"/>`,
  target: `<circle cx="50" cy="50" r="38" fill="#fff" ${S}/><circle cx="50" cy="50" r="24" fill="#ff5f9e" ${s3}/><circle cx="50" cy="50" r="10" fill="#fff" ${s3}/>
    <path d="M50 4 V20 M50 80 V96 M4 50 H20 M80 50 H96" stroke="${O}" stroke-width="5" stroke-linecap="round"/>`,
  check: `<path d="M18 52 L40 74 L84 26" fill="none" stroke="${O}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 52 L40 74 L84 26" fill="none" stroke="#7dcb4c" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`,
  lock: `<path d="M32 44 V32 Q32 14 50 14 Q68 14 68 32 V44" fill="none" ${S} stroke-width="8"/><rect x="22" y="42" width="56" height="44" rx="10" fill="#ffc93c" ${S}/><circle cx="50" cy="62" r="6" fill="${O}"/>`,
  pin: `<path d="M50 92 C30 64 20 52 20 38 A30 30 0 0 1 80 38 C80 52 70 64 50 92 Z" fill="#ff5b4a" ${S}/><circle cx="50" cy="38" r="11" fill="#fff" ${s3}/>`,
  player: `<path d="M50 6 L84 84 L50 66 L16 84 Z" fill="#ff5b4a" ${S}/><path d="M50 22 L60 50" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/>`,
  ferry: `<path d="M12 56 H88 L78 80 H22 Z" fill="#fff" ${S}/><rect x="30" y="34" width="40" height="22" rx="4" fill="#2bb7c9" ${S}/><path d="M40 20 V34" ${S}/><path d="M40 20 L58 26 L40 30" fill="#ff5b4a" ${s3}/>`,
  town: `<path d="M16 48 L50 18 L84 48" fill="#e8674a" ${S}/><rect x="24" y="46" width="52" height="40" rx="4" fill="#fff2d8" ${S}/><rect x="42" y="60" width="16" height="26" rx="3" fill="#2fa8a0" ${s3}/>`,
  route: `<path d="M20 90 Q10 60 40 52 Q72 44 60 10" fill="none" stroke="${O}" stroke-width="20" stroke-linecap="round"/><path d="M20 90 Q10 60 40 52 Q72 44 60 10" fill="none" stroke="#d9b27a" stroke-width="12" stroke-linecap="round"/><path d="M70 74 q8 -14 0 -26 q-8 12 0 26" fill="#7dcb4c" ${s3}/>`,
  cave: `<path d="M8 84 L28 34 Q50 10 72 34 L92 84 Z" fill="#b9a48c" ${S}/><path d="M34 84 Q34 54 50 50 Q66 54 66 84 Z" fill="#3b3150" ${s3}/>`,
  beach: `<path d="M8 72 Q50 56 92 72 V90 H8 Z" fill="#f6dfa0" ${S}/><path d="M8 60 Q30 52 50 60 T92 60" fill="none" stroke="#2bb7c9" stroke-width="6" stroke-linecap="round"/><path d="M60 64 Q62 36 70 22" fill="none" ${S}/><path d="M70 22 Q54 16 46 28 M70 22 Q84 12 92 24 M70 22 Q72 34 84 40" fill="none" stroke="#4f9a2c" stroke-width="7" stroke-linecap="round"/>`,
  shrine: `<path d="M12 30 H88 L80 22 H20 Z" fill="#e8674a" ${S}/><path d="M18 40 H82" ${S}/><path d="M28 30 V88 M72 30 V88" ${S} stroke-width="8"/>`,
  sparkle: `<path d="M50 6 Q54 46 94 50 Q54 54 50 94 Q46 54 6 50 Q46 46 50 6 Z" fill="#fff6c8" ${S}/>`,
  cart: `<path d="M8 18 H22 L32 64 H80 L88 32 H26" fill="none" ${S}/><circle cx="38" cy="80" r="8" fill="#fff" ${S}/><circle cx="74" cy="80" r="8" fill="#fff" ${S}/><rect x="34" y="36" width="46" height="22" rx="4" fill="#2bb7c9" ${s3}/>`,
  box: `<rect x="12" y="20" width="76" height="62" rx="10" fill="#9b7fd1" ${S}/><rect x="22" y="30" width="56" height="28" rx="6" fill="#d9ccff" ${s3}/><circle cx="50" cy="70" r="5" fill="#fff" ${s3}/>`,
  swap: `<path d="M20 34 H74 L62 22 M80 66 H26 L38 78" fill="none" stroke="${O}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 34 H74 L62 22 M80 66 H26 L38 78" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
  up: `<path d="M20 64 L50 34 L80 64" fill="none" stroke="${O}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 64 L50 34 L80 64" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,
  hand: `<path d="M30 88 Q18 70 22 54 L26 40 Q30 34 34 40 V30 Q36 22 42 26 V20 Q46 12 52 20 V24 Q58 18 62 26 V34 Q68 28 72 36 V60 Q72 80 58 88 Z" fill="#ffd9b8" ${S}/>`,
  talk: `<path d="M14 24 Q14 14 24 14 H76 Q86 14 86 24 V58 Q86 68 76 68 H44 L28 84 V68 H24 Q14 68 14 58 Z" fill="#fff" ${S}/><circle cx="34" cy="41" r="5" fill="${O}"/><circle cx="50" cy="41" r="5" fill="${O}"/><circle cx="66" cy="41" r="5" fill="${O}"/>`,
};

/** Emoji → icon name (so data with emoji icons still renders with the SVG set). */
const EMOJI = { '💬': 'talk', '❤': 'heart', '❤️': 'heart', '★': 'star', '⭐': 'star', '🗺': 'map', '🗺️': 'map', '☰': 'menu', '🎯': 'target', '💰': 'coin', '🔴': 'ball', '🔵': 'mega' };

export const hasIcon = n => !!ICONS[n] || !!EMOJI[n];

/** SVG markup for `name` (or a span with the text when it is not an icon name, e.g. an emoji). */
export function icon(name, cls = '') {
  const key = ICONS[name] ? name : EMOJI[name];
  if (!key) return `<span class="emo ${cls}">${String(name ?? '').replace(/[<>&]/g, '')}</span>`;
  return `<svg class="ic ${cls}" viewBox="0 0 100 100" aria-hidden="true">${ICONS[key]}</svg>`;
}

/** Element version of icon(). */
export function iconEl(name, cls = '') {
  const w = el('span.icw' + (cls ? '.' + cls.split(' ').join('.') : ''));
  w.innerHTML = icon(name);
  return w;
}
