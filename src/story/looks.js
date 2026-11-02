// Looks for story characters, trainers, guards and fixers (shape: docs/ARCHITECTURE.md "Data shapes" → Look).
// The actors area's LOOKS presets win when they exist (complete looks); these are the story's own designs and
// the fallback. Bright Sun/Moon outfits: one strong colour + one accent per character, readable from above.
const SKINS = ['#f6d0b1', '#f1c7a3', '#e7b48f', '#d9a07a', '#c68863', '#a96f4f', '#8a5a3e'];
const L = (sex, age, skin, hair, top, bottom, shoes, extra = {}) => ({
  sex, age, height: 1, build: 0.5, skin, hair, eyes: '#4a2c1a', top, bottom, shoes, ...extra,
});

export const STORY_LOOKS = {
  mamma: L('f', 'adult', SKINS[1], { style: 'bun', color: '#7a4a2a' }, { style: 'blouse', color: '#ffb35c', accent: '#fff2d8' }, { style: 'long_skirt', color: '#5b7fe0' }, { style: 'flats', color: '#e8674a' }, { accessory: 'necklace', height: 0.98 }),
  quercia: L('f', 'adult', SKINS[2], { style: 'ponytail', color: '#a0522d' }, { style: 'coat', color: '#ffffff', accent: '#2fa8a0' }, { style: 'pants', color: '#3e4a6b' }, { style: 'sneakers', color: '#2fa8a0' }, { accessory: 'glasses', height: 1.02 }),
  ginepro: L('m', 'elder', SKINS[1], { style: 'short', color: '#d8d8d8' }, { style: 'coat', color: '#f4f1e8', accent: '#7dcb4c' }, { style: 'pants', color: '#6b4a2e' }, { style: 'boots', color: '#5a3a22' }, { accessory: 'glasses' }),
  rosa: L('f', 'elder', SKINS[0], { style: 'bun', color: '#eeeeee' }, { style: 'blouse', color: '#b45cc8', accent: '#ffd23f' }, { style: 'long_skirt', color: '#5c2a7a' }, { style: 'flats', color: '#7a4a2a' }, { accessory: 'scarf', height: 0.92 }),
  fornaio: L('m', 'adult', SKINS[3], { style: 'short', color: '#3b2416' }, { style: 'shirt', color: '#ffffff', accent: '#f5b83d' }, { style: 'pants', color: '#8a5a3e' }, { style: 'boots', color: '#5a3a22' }, { hat: { style: 'chef', color: '#ffffff' }, build: 0.75 }),
  ada: L('f', 'adult', SKINS[3], { style: 'braid', color: '#5a3018' }, { style: 'blouse', color: '#ffffff', accent: '#f5b83d' }, { style: 'skirt', color: '#8a5a3e' }, { style: 'flats', color: '#5a3a22' }, { hat: { style: 'chef', color: '#ffffff' }, build: 0.6 }),
  neve: L('f', 'adult', SKINS[0], { style: 'long', color: '#f2f4ff' }, { style: 'coat', color: '#cfe8ff', accent: '#9b7fd1' }, { style: 'long_skirt', color: '#8aa2c8' }, { style: 'boots', color: '#ffffff' }, { accessory: 'scarf', eyes: '#5b7fe0', height: 1.04 }),
  notte: L('f', 'adult', SKINS[4], { style: 'long', color: '#c9b8f0' }, { style: 'uniform', color: '#3a1d5c', accent: '#ffd23f' }, { style: 'pants', color: '#1d1430' }, { style: 'boots', color: '#1d1430' }, { hat: { style: 'eclissi', color: '#2a1a40' }, eyes: '#b02a6a', height: 1.04 }),
  granmaestro: L('m', 'adult', SKINS[5], { style: 'spiky', color: '#e0d4ff' }, { style: 'coat', color: '#1d1030', accent: '#ffd23f' }, { style: 'pants', color: '#120a20' }, { style: 'boots', color: '#120a20' }, { hat: { style: 'eclissi', color: '#5a2a8a' }, height: 1.1, build: 0.6 }),
  eclissi_grunt: L('m', 'adult', SKINS[2], { style: 'short', color: '#222031' }, { style: 'uniform', color: '#2a2140', accent: '#9b7fd1' }, { style: 'pants', color: '#1d1430' }, { style: 'boots', color: '#1d1430' }, { hat: { style: 'eclissi', color: '#5a2a8a' } }),
  eclissi_grunt_f: L('f', 'adult', SKINS[4], { style: 'ponytail', color: '#7a3ad1' }, { style: 'uniform', color: '#2a2140', accent: '#9b7fd1' }, { style: 'pants', color: '#1d1430' }, { style: 'boots', color: '#1d1430' }, { hat: { style: 'eclissi', color: '#5a2a8a' } }),
  guard: L('m', 'adult', SKINS[3], { style: 'short', color: '#2a1a12' }, { style: 'uniform', color: '#2f5fd8', accent: '#ffd23f' }, { style: 'pants', color: '#1d2a5c' }, { style: 'boots', color: '#14182a' }, { hat: { style: 'guard', color: '#1d2a5c' }, build: 0.65 }),
  guard_f: L('f', 'adult', SKINS[1], { style: 'bun', color: '#3b2416' }, { style: 'uniform', color: '#2f5fd8', accent: '#ffd23f' }, { style: 'pants', color: '#1d2a5c' }, { style: 'boots', color: '#14182a' }, { hat: { style: 'guard', color: '#1d2a5c' } }),
  fixer: L('m', 'adult', SKINS[2], { style: 'spiky', color: '#151515' }, { style: 'jacket', color: '#3a3a44', accent: '#e8674a' }, { style: 'pants', color: '#1b1b22' }, { style: 'sneakers', color: '#ffffff' }, { accessory: 'sunglasses', hat: { style: 'cap', color: '#e8674a' } }),
  murena: L('m', 'elder', SKINS[5], { style: 'bald', color: '#cccccc' }, { style: 'tank', color: '#2bb7c9', accent: '#ffffff' }, { style: 'shorts', color: '#1673a8' }, { style: 'sandals', color: '#6b4a2e' }, { accessory: 'sunglasses', build: 0.8 }),
  contact: L('m', 'adult', SKINS[4], { style: 'curly', color: '#1d1410' }, { style: 'hoodie', color: '#4a4a58', accent: '#ffd23f' }, { style: 'pants', color: '#22222c' }, { style: 'sneakers', color: '#e8674a' }, { accessory: 'sunglasses' }),
  nurse: L('f', 'adult', SKINS[0], { style: 'twintails', color: '#ff8fb8' }, { style: 'dress', color: '#ffffff', accent: '#ff5f9e' }, { style: 'none', color: '#ffffff' }, { style: 'flats', color: '#ff5f9e' }, { hat: { style: 'cap', color: '#ffffff' } }),
  clerk: L('m', 'adult', SKINS[2], { style: 'short', color: '#4a2c1a' }, { style: 'shirt', color: '#5b9dff', accent: '#ffffff' }, { style: 'pants', color: '#2c3a5c' }, { style: 'sneakers', color: '#ffffff' }, { hat: { style: 'cap', color: '#2f5fd8' } }),
  vendor: L('f', 'adult', SKINS[3], { style: 'curly', color: '#3b2416' }, { style: 'blouse', color: '#ffd23f', accent: '#e8674a' }, { style: 'long_skirt', color: '#2fa8a0' }, { style: 'sandals', color: '#8a5a3e' }, { accessory: 'bag' }),
  gino: L('m', 'adult', SKINS[1], { style: 'short', color: '#c45a2a' }, { style: 'shirt', color: '#f5b83d', accent: '#2f5fd8' }, { style: 'shorts', color: '#2f5fd8' }, { style: 'sneakers', color: '#ffffff' }, { hat: { style: 'cap', color: '#2f5fd8' }, accessory: 'bag', freckles: true }),
  pina: L('f', 'elder', SKINS[1], { style: 'bun', color: '#dcdcdc' }, { style: 'coat', color: '#9b7fd1', accent: '#ffffff' }, { style: 'long_skirt', color: '#5a4a7a' }, { style: 'flats', color: '#3b2a4a' }, { accessory: 'glasses', height: 0.9 }),
  lia: L('f', 'kid', SKINS[2], { style: 'twintails', color: '#f5c04a' }, { style: 'dress', color: '#ff8fb8', accent: '#ffffff' }, { style: 'none', color: '#ffffff' }, { style: 'sandals', color: '#e8674a' }, { freckles: true }),
  irene: L('f', 'adult', SKINS[5], { style: 'pixie', color: '#1d1410' }, { style: 'jacket', color: '#7dcb4c', accent: '#ffd23f' }, { style: 'shorts', color: '#5a4a3a' }, { style: 'boots', color: '#6b4a2e' }, { accessory: 'backpack', hat: { style: 'sunhat', color: '#f6dfa0' } }),
  kid: L('m', 'kid', SKINS[3], { style: 'spiky', color: '#3b2416' }, { style: 'tshirt', color: '#e8674a', accent: '#ffffff' }, { style: 'shorts', color: '#2f5fd8' }, { style: 'sneakers', color: '#ffd23f' }, { hat: { style: 'cap', color: '#2fa8a0' } }),
  fisher: L('m', 'elder', SKINS[4], { style: 'short', color: '#bbbbbb' }, { style: 'jacket', color: '#f5b83d', accent: '#1673a8' }, { style: 'pants', color: '#1673a8' }, { style: 'boots', color: '#2a2a2a' }, { hat: { style: 'sunhat', color: '#f5b83d' } }),
};

/** Trainer classes: name + look (variants per sex) + where they appear. */
export const TRAINER_CLASSES = {
  Escursionista: { m: L('m', 'adult', SKINS[3], { style: 'short', color: '#5a3a22' }, { style: 'shirt', color: '#b97b47', accent: '#7dcb4c' }, { style: 'shorts', color: '#6b5a3a' }, { style: 'boots', color: '#5a3a22' }, { hat: { style: 'sunhat', color: '#8a6a3a' }, accessory: 'backpack', build: 0.7 }) },
  'Ragazza Pic-nic': { f: L('f', 'adult', SKINS[1], { style: 'bob', color: '#e8a040' }, { style: 'blouse', color: '#ff8fb8', accent: '#ffffff' }, { style: 'skirt', color: '#7dcb4c' }, { style: 'flats', color: '#ff5f9e' }, { hat: { style: 'sunhat', color: '#fff2d8' }, accessory: 'bag' }) },
  Pescatore: { m: L('m', 'adult', SKINS[4], { style: 'short', color: '#2a1a12' }, { style: 'tank', color: '#2bb7c9', accent: '#ffd23f' }, { style: 'pants', color: '#2c4a6b' }, { style: 'boots', color: '#ffd23f' }, { hat: { style: 'cap', color: '#ffd23f' } }) },
  Studente: { m: L('m', 'adult', SKINS[0], { style: 'short', color: '#1d1410' }, { style: 'shirt', color: '#5b7fe0', accent: '#ffffff' }, { style: 'pants', color: '#2c3a5c' }, { style: 'sneakers', color: '#ffffff' }, { accessory: 'glasses' }), f: L('f', 'adult', SKINS[2], { style: 'ponytail', color: '#3b2416' }, { style: 'shirt', color: '#5b7fe0', accent: '#ffffff' }, { style: 'skirt', color: '#2c3a5c' }, { style: 'flats', color: '#2c3a5c' }, { accessory: 'backpack' }) },
  Ciclista: { m: L('m', 'adult', SKINS[2], { style: 'spiky', color: '#ff7a2a' }, { style: 'tshirt', color: '#ffd23f', accent: '#1d1d1d' }, { style: 'shorts', color: '#1d1d1d' }, { style: 'sneakers', color: '#e8674a' }, { hat: { style: 'cap', color: '#1d1d1d' } }), f: L('f', 'adult', SKINS[3], { style: 'ponytail', color: '#1d1410' }, { style: 'tank', color: '#ffd23f', accent: '#1d1d1d' }, { style: 'shorts', color: '#1d1d1d' }, { style: 'sneakers', color: '#e8674a' }) },
  Ranger: { m: L('m', 'adult', SKINS[5], { style: 'short', color: '#1d1410' }, { style: 'shirt', color: '#5a8b2f', accent: '#f5b83d' }, { style: 'pants', color: '#3a5a22' }, { style: 'boots', color: '#3a2a1a' }, { hat: { style: 'sunhat', color: '#3a5a22' }, build: 0.65 }), f: L('f', 'adult', SKINS[1], { style: 'braid', color: '#c45a2a' }, { style: 'shirt', color: '#5a8b2f', accent: '#f5b83d' }, { style: 'pants', color: '#3a5a22' }, { style: 'boots', color: '#3a2a1a' }, { hat: { style: 'sunhat', color: '#3a5a22' } }) },
  Montanara: { f: L('f', 'adult', SKINS[0], { style: 'braid', color: '#f5c04a' }, { style: 'coat', color: '#e8443a', accent: '#ffffff' }, { style: 'pants', color: '#3a3a5a' }, { style: 'boots', color: '#5a3a22' }, { hat: { style: 'beanie', color: '#ffffff' }, accessory: 'scarf' }) },
  Velista: { m: L('m', 'adult', SKINS[2], { style: 'curly', color: '#3b2416' }, { style: 'shirt', color: '#ffffff', accent: '#2f5fd8' }, { style: 'shorts', color: '#2f5fd8' }, { style: 'sandals', color: '#8a5a3e' }, { hat: { style: 'cap', color: '#2f5fd8' } }), f: L('f', 'adult', SKINS[4], { style: 'long', color: '#2a1a12' }, { style: 'shirt', color: '#ffffff', accent: '#2f5fd8' }, { style: 'shorts', color: '#2f5fd8' }, { style: 'sandals', color: '#8a5a3e' }, { hat: { style: 'cap', color: '#ffffff' } }) },
  Surfista: { m: L('m', 'adult', SKINS[4], { style: 'curly', color: '#f5c04a' }, { style: 'tank', color: '#4fe0d2', accent: '#ff5f9e' }, { style: 'swim_shorts', color: '#ff5f9e' }, { style: 'sandals', color: '#ffd23f' }, { accessory: 'sunglasses' }), f: L('f', 'adult', SKINS[3], { style: 'long', color: '#f5c04a' }, { style: 'tank', color: '#ff5f9e', accent: '#4fe0d2' }, { style: 'shorts', color: '#4fe0d2' }, { style: 'sandals', color: '#ffd23f' }, { accessory: 'sunglasses' }) },
  Esploratrice: { f: L('f', 'adult', SKINS[2], { style: 'pixie', color: '#5a3018' }, { style: 'jacket', color: '#f5b83d', accent: '#5a3a22' }, { style: 'pants', color: '#6b5a3a' }, { style: 'boots', color: '#3a2a1a' }, { hat: { style: 'sunhat', color: '#b97b47' }, accessory: 'backpack' }) },
  Campione: {
    m: L('m', 'adult', SKINS[3], { style: 'spiky', color: '#1d1410' }, { style: 'jacket', color: '#1d1d2a', accent: '#ffc93c' }, { style: 'pants', color: '#7b1fa2' }, { style: 'sneakers', color: '#ffc93c' }, { hat: { style: 'cap', color: '#ffc93c' }, height: 1.05 }),
    f: L('f', 'adult', SKINS[1], { style: 'ponytail', color: '#e8443a' }, { style: 'jacket', color: '#1d1d2a', accent: '#ffc93c' }, { style: 'pants', color: '#7b1fa2' }, { style: 'sneakers', color: '#ffc93c' }, { height: 1.05 }),
  },
  Lottatore: { m: L('m', 'adult', SKINS[5], { style: 'bald', color: '#000000' }, { style: 'tank', color: '#e8443a', accent: '#1d1d1d' }, { style: 'pants', color: '#1d1d1d' }, { style: 'boots', color: '#1d1d1d' }, { build: 0.9, accessory: 'sunglasses' }), f: L('f', 'adult', SKINS[3], { style: 'ponytail', color: '#c41a4a' }, { style: 'tank', color: '#1d1d1d', accent: '#ff5f9e' }, { style: 'pants', color: '#3a1a2a' }, { style: 'boots', color: '#1d1d1d' }, { build: 0.6 }) },
};

/** Tint a look's main colours (to vary champions/villagers without new presets). */
export function tintLook(look, { top, bottom, hair, skin } = {}) {
  const l = JSON.parse(JSON.stringify(look));
  if (top) l.top.color = top;
  if (bottom) l.bottom.color = bottom;
  if (hair) l.hair.color = hair;
  if (skin) l.skin = skin;
  return l;
}

/** Look by preset name: the actors' complete preset if it exists, else the story's design. */
export function lookFor(ctx, name, fallback) {
  const a = ctx.actors?.looks?.[name];
  if (a && a.top && a.hair) return a;
  return fallback || STORY_LOOKS[name] || STORY_LOOKS.kid;
}

export function classLook(cls, sex) {
  const c = TRAINER_CLASSES[cls] || TRAINER_CLASSES.Escursionista;
  return c[sex] || c.m || c.f;
}
export { SKINS };
