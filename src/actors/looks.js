// Look presets (shape: docs/ARCHITECTURE.md "Data shapes" → Look), normalisation and seeded random
// villagers. A look is plain data consumed by human.js. All romance women are clearly adult.
import { rng } from '../core/math.js';

export const HAIR_STYLES = ['short', 'spiky', 'bob', 'long', 'ponytail', 'bun', 'curly', 'braid', 'pixie', 'twintails', 'bald'];
export const TOP_STYLES = ['tshirt', 'tank', 'shirt', 'blouse', 'hoodie', 'jacket', 'dress', 'uniform', 'coat', 'camisole', 'swimsuit'];
export const BOTTOM_STYLES = ['shorts', 'pants', 'skirt', 'long_skirt', 'pyjama', 'swim_shorts', 'none'];
export const SHOE_STYLES = ['sneakers', 'sandals', 'boots', 'heels', 'flats', 'barefoot'];
export const HAT_STYLES = ['cap', 'sunhat', 'beanie', 'chef', 'guard', 'eclissi'];
export const ACCESSORIES = ['backpack', 'glasses', 'sunglasses', 'scarf', 'necklace', 'bag'];

export const SKIN_TONES = ['#fbe0cc', '#f6d5c0', '#f1c7a3', '#e8b88a', '#e0ac69', '#d99a6c', '#c68642', '#a86b3c', '#8d5524', '#6e4024'];
const HAIR_NATURAL = ['#2b1b10', '#3b2a20', '#5a3a24', '#7a4a2a', '#8d5524', '#a8642e', '#c0392b', '#e0b46a', '#f5d76e', '#141414'];
const HAIR_FUN = ['#2fa8a0', '#9b7fd1', '#ff7eb6', '#4a6fd8'];
const EYES = ['#4a2c1a', '#2a1a12', '#3f6fb5', '#2e8b6a', '#7a4a2a', '#5a3a8a', '#1f8fa0', '#8a5a2a'];
const CLOTH = ['#e8674a', '#2fa8a0', '#f5b83d', '#9b7fd1', '#ff5f9e', '#4fa3e0', '#7dcb4c', '#ffffff', '#f2e6c8', '#3a4a6a', '#d9534f', '#ffd23f', '#5ac0a0', '#c07ad8', '#ff9a4d'];
const DARK = ['#3a4a6a', '#2c2f3a', '#5a4632', '#4a6a8a', '#6a4a7a', '#2f5f4a', '#7a3a3a'];

const HEX = /^#?[0-9a-f]{6}$/i;
const c = (v, d) => (typeof v === 'number' ? '#' + v.toString(16).padStart(6, '0') : typeof v === 'string' && HEX.test(v) ? (v[0] === '#' ? v : '#' + v) : d);
const pickIn = (v, list, d) => (list.includes(v) ? v : d);

/** Normalise a (possibly partial) look into the full schema the mesh builder expects. Never throws. */
export function normalizeLook(raw = {}) {
  const L = raw || {};
  const sex = L.sex === 'm' ? 'm' : 'f';
  const age = ['kid', 'elder'].includes(L.age) ? L.age : 'adult';
  const hair = typeof L.hair === 'string' ? { style: L.hair } : (L.hair || {});
  const top = typeof L.top === 'string' ? { style: L.top } : (L.top || {});
  const bottom = typeof L.bottom === 'string' ? { style: L.bottom } : (L.bottom || {});
  const shoes = typeof L.shoes === 'string' ? { style: L.shoes } : (L.shoes || {});
  const hat = typeof L.hat === 'string' ? { style: L.hat } : (L.hat || null);
  const topStyle = pickIn(top.style, TOP_STYLES, 'tshirt');
  let bottomStyle = pickIn(bottom.style, BOTTOM_STYLES, sex === 'f' ? 'skirt' : 'pants');
  // 'none' is only valid under a dress, a swimsuit or a long coat; anything else gets shorts (never underwear)
  if (bottomStyle === 'none' && !['dress', 'swimsuit', 'coat'].includes(topStyle)) bottomStyle = 'shorts';
  // a men's swimsuit is swim shorts with no top: keep it consistent
  if (topStyle === 'swimsuit' && sex === 'm' && !['swim_shorts', 'shorts'].includes(bottomStyle)) bottomStyle = 'swim_shorts';
  const defHair = age === 'elder' ? '#d8d4cc' : '#5a3a24';
  return {
    sex, age,
    height: Number.isFinite(L.height) ? Math.min(1.1, Math.max(0.9, L.height)) : 1,
    build: Number.isFinite(L.build) ? Math.min(1, Math.max(0, L.build)) : 0.5,
    skin: c(L.skin, '#f1c7a3'),
    hair: { style: pickIn(hair.style, [...HAIR_STYLES, 'none'], sex === 'm' ? 'short' : 'long'), color: c(hair.color, defHair) },
    eyes: c(L.eyes, '#4a2c1a'),
    lips: L.lips ? c(L.lips, null) : null,
    freckles: !!L.freckles,
    top: { style: topStyle, color: c(top.color, '#2fa8a0'), accent: c(top.accent, null), pattern: ['stripes', 'dots'].includes(top.pattern) ? top.pattern : null },
    bottom: { style: bottomStyle, color: c(bottom.color, '#3a4a6a') },
    shoes: { style: pickIn(shoes.style, SHOE_STYLES, 'sneakers'), color: c(shoes.color, '#e8674a') },
    hat: hat && HAT_STYLES.includes(hat.style) ? { style: hat.style, color: c(hat.color, '#e8674a'), accent: c(hat.accent, null) } : null,
    accessory: pickIn(L.accessory, ACCESSORIES, null),
    accessoryColor: c(L.accessoryColor, null),
  };
}

/** Named presets. Romance women: distinct silhouettes (hair style/colour), outfits and skin tones. */
export const LOOKS = {
  // ---- player & story -------------------------------------------------------------------------
  player: { sex: 'm', age: 'adult', height: 1, build: 0.45, skin: '#f1c7a3', eyes: '#3a2a1a', hair: { style: 'short', color: '#3b2a20' },
    top: { style: 'tshirt', color: '#2fa8a0', accent: '#ffd23f' }, bottom: { style: 'shorts', color: '#2c3a5a' },
    shoes: { style: 'sneakers', color: '#e8674a' }, hat: { style: 'cap', color: '#e8674a' }, accessory: 'backpack', accessoryColor: '#f5b83d' },
  quercia: { sex: 'f', age: 'adult', height: 1.04, build: 0.45, skin: '#f1c7a3', eyes: '#2e8b6a', hair: { style: 'bun', color: '#8d4a24' },
    top: { style: 'coat', color: '#ffffff', accent: '#7dcb4c' }, bottom: { style: 'pants', color: '#4a5a7a' }, shoes: { style: 'flats', color: '#5a4632' }, accessory: 'glasses', accessoryColor: '#7a3a2a' },
  ginepro: { sex: 'm', age: 'elder', height: 1, build: 0.55, skin: '#e8b88a', eyes: '#4a2c1a', hair: { style: 'bald', color: '#d8d4cc' },
    top: { style: 'coat', color: '#f6f6f2', accent: '#9b7fd1' }, bottom: { style: 'pants', color: '#5a4632' }, shoes: { style: 'flats', color: '#3a2a20' }, accessory: 'glasses', accessoryColor: '#3a3a3a' },
  rosa: { sex: 'f', age: 'elder', height: 0.94, build: 0.65, skin: '#f6d5c0', eyes: '#4a2c1a', hair: { style: 'bun', color: '#eeeae4' },
    top: { style: 'blouse', color: '#c07ad8', accent: '#ffffff', pattern: 'dots' }, bottom: { style: 'long_skirt', color: '#5a6a3a' }, shoes: { style: 'flats', color: '#7a4a2a' }, accessory: 'scarf', accessoryColor: '#ff9a4d' },
  fornaio: { sex: 'm', age: 'adult', height: 1, build: 0.85, skin: '#e0ac69', eyes: '#3a2a1a', hair: { style: 'short', color: '#2b1b10' },
    top: { style: 'shirt', color: '#ffffff', accent: '#e8674a' }, bottom: { style: 'pants', color: '#5a4632' }, shoes: { style: 'boots', color: '#5a3a24' }, hat: { style: 'chef', color: '#ffffff' } },
  ada: { sex: 'f', age: 'adult', height: 1, build: 0.65, skin: '#e8b88a', eyes: '#5a3a24', hair: { style: 'braid', color: '#a8642e' },
    top: { style: 'blouse', color: '#fff2d8', accent: '#e8674a' }, bottom: { style: 'long_skirt', color: '#8a5a3a' }, shoes: { style: 'flats', color: '#5a3a24' }, hat: { style: 'chef', color: '#ffffff' } },
  neve: { sex: 'f', age: 'adult', height: 1.05, build: 0.45, skin: '#fbe0cc', eyes: '#3f6fb5', hair: { style: 'long', color: '#dfeefa' },
    top: { style: 'coat', color: '#9fd0f5', accent: '#ffffff' }, bottom: { style: 'pants', color: '#eef4fa' }, shoes: { style: 'boots', color: '#ffffff' }, accessory: 'scarf', accessoryColor: '#3f6fb5' },
  notte: { sex: 'f', age: 'adult', height: 1.06, build: 0.45, skin: '#f6d5c0', eyes: '#c0392b', hair: { style: 'ponytail', color: '#3a1f5a' },
    top: { style: 'uniform', color: '#3d2a5e', accent: '#ffd23f' }, bottom: { style: 'pants', color: '#1e1a2a' }, shoes: { style: 'boots', color: '#1e1a2a' }, accessory: 'sunglasses' },
  granmaestro: { sex: 'm', age: 'adult', height: 1.08, build: 0.6, skin: '#e8b88a', eyes: '#ffd23f', hair: { style: 'spiky', color: '#e8e6f0' },
    top: { style: 'coat', color: '#2a1840', accent: '#ffd23f' }, bottom: { style: 'pants', color: '#1e1a2a' }, shoes: { style: 'boots', color: '#1e1a2a' } },
  eclissi_grunt: { sex: 'm', age: 'adult', height: 1, build: 0.55, skin: '#e8b88a', eyes: '#2a1a12', hair: { style: 'short', color: '#2b1b10' },
    top: { style: 'uniform', color: '#5a3d8a', accent: '#ffd23f' }, bottom: { style: 'pants', color: '#2a1f3a' }, shoes: { style: 'boots', color: '#2a1f3a' }, hat: { style: 'eclissi', color: '#5a3d8a' } },
  guard: { sex: 'm', age: 'adult', height: 1.04, build: 0.65, skin: '#d99a6c', eyes: '#2a1a12', hair: { style: 'short', color: '#2b1b10' },
    top: { style: 'uniform', color: '#2f5fa8', accent: '#ffd23f' }, bottom: { style: 'pants', color: '#1b2440' }, shoes: { style: 'boots', color: '#14161e' }, hat: { style: 'guard', color: '#2f5fa8' } },
  fixer: { sex: 'm', age: 'adult', height: 1.02, build: 0.6, skin: '#c68642', eyes: '#2a1a12', hair: { style: 'short', color: '#141414' },
    top: { style: 'jacket', color: '#2c2f3a', accent: '#d9534f' }, bottom: { style: 'pants', color: '#2c2f3a' }, shoes: { style: 'sneakers', color: '#ffffff' }, accessory: 'sunglasses' },
  champion: { sex: 'm', age: 'adult', height: 1.05, build: 0.55, skin: '#e0ac69', eyes: '#c0392b', hair: { style: 'spiky', color: '#c0392b' },
    top: { style: 'jacket', color: '#e8674a', accent: '#ffffff' }, bottom: { style: 'pants', color: '#2c2f3a' }, shoes: { style: 'sneakers', color: '#ffd23f' } },
  // ---- the romance women (all adults) ----------------------------------------------------------
  sofia: { sex: 'f', age: 'adult', height: 1.0, build: 0.45, skin: '#f1c7a3', eyes: '#2e8b6a', hair: { style: 'long', color: '#e0b46a' }, lips: '#e86a7a',
    top: { style: 'blouse', color: '#f48fb1', accent: '#ffffff' }, bottom: { style: 'skirt', color: '#ffffff' }, shoes: { style: 'flats', color: '#ff5f9e' }, accessory: 'necklace', accessoryColor: '#ffd23f' },
  elisa: { sex: 'f', age: 'adult', height: 1.03, build: 0.5, skin: '#e0ac69', eyes: '#4a2c1a', hair: { style: 'ponytail', color: '#2b1b10' }, lips: '#c0303a',
    top: { style: 'tank', color: '#d32f2f', accent: '#ffd23f' }, bottom: { style: 'shorts', color: '#262626' }, shoes: { style: 'sneakers', color: '#ffffff' } },
  bianca: { sex: 'f', age: 'adult', height: 1.02, build: 0.4, skin: '#f6d5c0', eyes: '#5a3a8a', hair: { style: 'bob', color: '#141414' }, lips: '#b8304a',
    top: { style: 'shirt', color: '#ffffff', accent: '#37474f' }, bottom: { style: 'pants', color: '#37474f' }, shoes: { style: 'boots', color: '#1e1e24' }, accessory: 'glasses', accessoryColor: '#1e1e24' },
  greta: { sex: 'f', age: 'adult', height: 0.97, build: 0.5, skin: '#f6d5c0', eyes: '#2e8b6a', hair: { style: 'braid', color: '#c0392b' }, freckles: true,
    top: { style: 'hoodie', color: '#7ac74c', accent: '#fff2d8' }, bottom: { style: 'long_skirt', color: '#6d4c41' }, shoes: { style: 'flats', color: '#6d4c41' } },
  viola: { sex: 'f', age: 'adult', height: 1.0, build: 0.5, skin: '#e8b88a', eyes: '#5a3a8a', hair: { style: 'curly', color: '#5b2a86' }, lips: '#a8307a',
    top: { style: 'dress', color: '#9c27b0', accent: '#e1bee7' }, bottom: { style: 'none', color: '#9c27b0' }, shoes: { style: 'sandals', color: '#e1bee7' }, accessory: 'necklace', accessoryColor: '#ffffff' },
  ilaria: { sex: 'f', age: 'adult', height: 0.98, build: 0.45, skin: '#f1c7a3', eyes: '#7a4a2a', hair: { style: 'bob', color: '#8d5524' },
    top: { style: 'blouse', color: '#9cba5a', accent: '#fff2d8' }, bottom: { style: 'long_skirt', color: '#795548' }, shoes: { style: 'flats', color: '#5a3a24' }, accessory: 'glasses', accessoryColor: '#7a4a2a' },
  vanessa: { sex: 'f', age: 'adult', height: 1.06, build: 0.45, skin: '#f6d5c0', eyes: '#3f6fb5', hair: { style: 'long', color: '#f5d76e' }, lips: '#d0203a',
    top: { style: 'jacket', color: '#1e1e24', accent: '#d32f2f' }, bottom: { style: 'skirt', color: '#1e1e24' }, shoes: { style: 'heels', color: '#d32f2f' }, accessory: 'necklace', accessoryColor: '#ffd23f' },
  nina: { sex: 'f', age: 'adult', height: 1.0, build: 0.5, skin: '#c68642', eyes: '#1f8fa0', hair: { style: 'pixie', color: '#283593' }, lips: '#7a3a6a',
    top: { style: 'hoodie', color: '#3949ab', accent: '#ffd23f' }, bottom: { style: 'pants', color: '#212121' }, shoes: { style: 'sneakers', color: '#ffd23f' }, accessory: 'bag', accessoryColor: '#ffd23f' },
  perla: { sex: 'f', age: 'adult', height: 0.99, build: 0.45, skin: '#e0ac69', eyes: '#1f8fa0', hair: { style: 'twintails', color: '#f2f2f6' },
    top: { style: 'tank', color: '#4dd0e1', accent: '#ff5f9e' }, bottom: { style: 'shorts', color: '#fff59d' }, shoes: { style: 'sandals', color: '#ff5f9e' }, hat: { style: 'sunhat', color: '#f6dfa0', accent: '#4dd0e1' } },
  lucia: { sex: 'f', age: 'adult', height: 1.04, build: 0.55, skin: '#8d5524', eyes: '#7a4a2a', hair: { style: 'curly', color: '#141414' }, lips: '#a8303a',
    top: { style: 'tank', color: '#ff9800', accent: '#ffd23f' }, bottom: { style: 'long_skirt', color: '#fff3e0' }, shoes: { style: 'sandals', color: '#a86b3c' }, accessory: 'necklace', accessoryColor: '#ffd23f' },
  carmen: { sex: 'f', age: 'adult', height: 1.05, build: 0.55, skin: '#c68642', eyes: '#4a2c1a', hair: { style: 'long', color: '#2b1b10' }, lips: '#b0102a',
    top: { style: 'dress', color: '#b71c1c', accent: '#1e1e24' }, bottom: { style: 'none', color: '#b71c1c' }, shoes: { style: 'boots', color: '#5a3a24' } },
  morgana: { sex: 'f', age: 'adult', height: 1.04, build: 0.4, skin: '#fbe0cc', eyes: '#9b7fd1', hair: { style: 'long', color: '#311b92' }, lips: '#6a1a5a',
    top: { style: 'coat', color: '#1e1a2a', accent: '#9b7fd1' }, bottom: { style: 'long_skirt', color: '#4a148c' }, shoes: { style: 'boots', color: '#1e1a2a' }, accessory: 'necklace', accessoryColor: '#c07ad8' },
  stella: { sex: 'f', age: 'adult', height: 0.98, build: 0.45, skin: '#fbe0cc', eyes: '#3f6fb5', hair: { style: 'bun', color: '#b8c8d8' },
    top: { style: 'coat', color: '#90caf9', accent: '#ffffff' }, bottom: { style: 'pants', color: '#eceff1' }, shoes: { style: 'boots', color: '#ffffff' }, hat: { style: 'beanie', color: '#ffffff' }, accessory: 'scarf', accessoryColor: '#4fa3e0' },
  marina: { sex: 'f', age: 'adult', height: 1.03, build: 0.5, skin: '#d99a6c', eyes: '#1f8fa0', hair: { style: 'ponytail', color: '#1d3c5a' }, freckles: true, lips: '#c0505a',
    top: { style: 'tank', color: '#ffffff', accent: '#1d3c5a', pattern: 'stripes' }, bottom: { style: 'shorts', color: '#3b5f8f' }, shoes: { style: 'sandals', color: '#a86b3c' }, accessory: 'necklace', accessoryColor: '#4fe0d2' },
};

/**
 * Seeded generic villager look. opts: {sex:'m'|'f'|'any', age:'adult'|'kid'|'elder'|'any'}.
 * Same seed → same look.
 */
export function randomLook(seed = 1, { sex = 'any', age = 'adult' } = {}) {
  const r = rng(typeof seed === 'number' ? seed * 7919 + 13 : 'look:' + seed);
  const sx = sex === 'm' || sex === 'f' ? sex : (r() < 0.5 ? 'm' : 'f');
  const ag = ['adult', 'kid', 'elder'].includes(age) ? age : r.pick(['adult', 'adult', 'adult', 'kid', 'elder']);
  const hairStyles = sx === 'm' ? (ag === 'elder' ? ['short', 'bald', 'curly'] : ['short', 'spiky', 'curly', 'short', 'pixie'])
    : (ag === 'elder' ? ['bun', 'bob', 'curly'] : ag === 'kid' ? ['twintails', 'ponytail', 'bob', 'pixie', 'braid'] : ['long', 'ponytail', 'bob', 'bun', 'curly', 'braid', 'pixie']);
  const hairColor = ag === 'elder' ? r.pick(['#d8d4cc', '#eeeae4', '#a8a4a0']) : (r() < 0.12 ? r.pick(HAIR_FUN) : r.pick(HAIR_NATURAL));
  const tops = sx === 'm' ? ['tshirt', 'shirt', 'hoodie', 'jacket', 'tank', 'tshirt'] : ['tshirt', 'blouse', 'dress', 'tank', 'hoodie', 'jacket', 'blouse'];
  const top = r.pick(ag === 'elder' ? (sx === 'm' ? ['shirt', 'jacket', 'coat'] : ['blouse', 'dress', 'coat']) : tops);
  let bottom = sx === 'm' ? r.pick(['pants', 'shorts', 'pants']) : r.pick(['skirt', 'pants', 'shorts', 'long_skirt']);
  if (top === 'dress') bottom = 'none';
  if (ag === 'elder' && bottom === 'shorts') bottom = sx === 'f' ? 'long_skirt' : 'pants';
  const topColor = r.pick(CLOTH);
  let accent = r.pick(CLOTH); if (accent === topColor) accent = '#ffffff';
  const look = {
    sex: sx, age: ag,
    height: ag === 'kid' ? 1 : +(0.94 + r() * 0.12).toFixed(3),
    build: +(ag === 'elder' ? 0.45 + r() * 0.4 : 0.25 + r() * 0.55).toFixed(2),
    skin: r.pick(SKIN_TONES), eyes: r.pick(EYES),
    hair: { style: r.pick(hairStyles), color: hairColor },
    freckles: r() < 0.15,
    top: { style: top, color: topColor, accent, pattern: r() < 0.18 ? r.pick(['stripes', 'dots']) : null },
    bottom: { style: bottom, color: top === 'dress' ? topColor : r.pick(DARK.concat(['#f2e6c8', '#4a6a8a'])) },
    shoes: { style: r.pick(sx === 'f' ? ['sneakers', 'sandals', 'flats', 'boots'] : ['sneakers', 'sandals', 'boots']), color: r.pick(CLOTH.concat(DARK)) },
    hat: r() < 0.2 ? { style: r.pick(['cap', 'sunhat', 'beanie']), color: r.pick(CLOTH) } : null,
    accessory: r() < 0.35 ? r.pick(ag === 'kid' ? ['backpack', 'scarf'] : ACCESSORIES) : null,
    accessoryColor: r.pick(CLOTH),
  };
  if (sx === 'f' && ag !== 'kid' && r() < 0.4) look.lips = r.pick(['#e86a7a', '#c0303a', '#b8506a']);
  return look;
}
