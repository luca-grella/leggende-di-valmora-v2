// The ONLY intimate choices that may exist (docs/GDD.md "Romance"). Scenes must call validateChoices()
// before showing a menu. Each maps to an actors pair kind; the camera is always a medium/tight two-shot
// of faces and shoulders (feet actions are a medium two-shot showing both faces, never a foot close-up).
import { MOODS } from './moods.js';

export const ALLOWED_CHOICES = Object.freeze({
  kiss: { label: 'Baciala', icon: '💋', pair: 'kiss' },
  hair: { label: 'Accarezzale i capelli', icon: '✋', pair: 'stroke_hair' },
  shoulders: { label: 'Massaggiale le spalle', icon: '💆', pair: 'massage_shoulders' },
  back: { label: 'Massaggiale la schiena', icon: '🤲', pair: 'massage_back' },
  legs: { label: 'Massaggiale le gambe', icon: '🦵', pair: 'massage_legs' },
  feet: { label: 'Massaggiale i piedi', icon: '🦶', pair: 'massage_feet' },
  kiss_feet: { label: 'Baciale i piedi', icon: '👣', pair: 'kiss_feet' },
  lick_feet: { label: 'Leccale i piedi', icon: '👣', pair: 'kiss_feet' },
  kiss_neck: { label: 'Baciale il collo', icon: '😘', pair: 'kiss_neck' },
  lick_neck: { label: 'Leccale il collo', icon: '😘', pair: 'kiss_neck' },
  ear: { label: "Mordicchiale l'orecchio", icon: '😏', pair: 'ear_nibble' },
  hug: { label: 'Stringila a te', icon: '🤗', pair: 'hug' },
  // agreed with Luca: undressing stops at the underwear (outfit swap behind a fade, never nudity)
  undress: { label: 'Spogliatevi a vicenda', icon: '👙', pair: null, sub: 'Restando in intimo' },
  whisper: { label: "Sussurrale qualcosa all'orecchio", icon: '🗣️', pair: 'whisper' },
  guide: { label: 'Lasciati guidare da lei…', icon: '🔥', pair: 'guide' },
  continue: { label: 'Continua', icon: '➡️', pair: null },
  stop: { label: 'Basta così', icon: '🌙', pair: null },
});

/** Throws if any id is not in ALLOWED_CHOICES. Returns the list for chaining. */
export function validateChoices(list) {
  for (const id of list) if (!Object.prototype.hasOwnProperty.call(ALLOWED_CHOICES, id)) throw new Error(`[romance] choice not allowed: ${id}`);
  return list;
}

/** How each choice is acted: hearts that float up, camera tightness, sound. Pure presentation. */
export const CHOICE_FX = {
  kiss: { hearts: 3, tight: true, sfx: 'kiss' },
  hair: { hearts: 1, tight: true, sfx: 'heart' },
  shoulders: { hearts: 1, tight: false, sfx: 'heart' },
  back: { hearts: 1, tight: false, sfx: 'heart' },
  legs: { hearts: 1, tight: false, sfx: 'heart' },
  feet: { hearts: 1, tight: false, sfx: 'heart' },
  kiss_feet: { hearts: 2, tight: false, sfx: 'kiss' },
  lick_feet: { hearts: 2, tight: false, sfx: 'heart' },
  kiss_neck: { hearts: 2, tight: true, sfx: 'kiss' },
  lick_neck: { hearts: 2, tight: true, sfx: 'heart' },
  ear: { hearts: 2, tight: true, sfx: 'heart' },
  hug: { hearts: 2, tight: true, sfx: 'heart' },
  whisper: { hearts: 1, tight: true, sfx: 'heart' },
  undress: { hearts: 2, tight: false, sfx: 'heart' },
  guide: { hearts: 4, tight: true, sfx: 'heart' },
};

/** Menu groups used when a context offers many choices (keeps the list short on an iPhone). */
export const CHOICE_GROUPS = [
  { id: 'baci', label: 'Baci', icon: '💋', items: ['kiss', 'kiss_neck', 'lick_neck', 'ear'] },
  { id: 'coccole', label: 'Coccole', icon: '🤗', items: ['hug', 'hair', 'whisper'] },
  { id: 'massaggi', label: 'Massaggi', icon: '💆', items: ['shoulders', 'back', 'legs', 'feet'] },
  { id: 'intimo', label: 'Spogliatevi a vicenda', icon: '👙', items: ['undress'] },
  { id: 'piedi', label: 'Coccole ai piedi', icon: '👣', items: ['kiss_feet', 'lick_feet'] },
];

/** Generic reactions, used when a personality has no line for a choice. */
const GENERIC = {
  kiss: ['Mmh... ancora.', 'Non smettere.'],
  hair: ['Continua così... mi rilassa.'],
  shoulders: ['Oh sì, proprio lì...'],
  back: ['Più giù... no, ecco, perfetto.'],
  legs: ['Hai le mani calde...'],
  feet: ['Dopo una giornata in piedi è il paradiso.'],
  kiss_feet: ['Ehi! ...Che tipo strano che sei. Mi piace.'],
  lick_feet: ['Ahahah! No, il solletico no! ...Va bene, ancora un po\'.'],
  kiss_neck: ['Ehi... così mi fai venire i brividi.'],
  lick_neck: ['Mi stai facendo impazzire, lo sai?'],
  ear: ['Ehi, piano! ...No, non smettere.'],
  hug: ['Mi piace stare così.'],
  whisper: ['Ma che cose dici! ...Dillo ancora.'],
  undress: ['Ehi... non guardarmi così, mi fai arrossire.', 'Va bene... ma solo fin qui, eh.', 'Che caldo che fa stasera, vero?'],
  guide: ['Chiudi gli occhi... e fidati di me.', 'Mmh... vedo che hai capito.'],
};

/** Lines for a choice by personality (moods.js), falling back to generic lines. */
export function choiceLines(mood, choiceId) {
  validateChoices([choiceId]);
  if (choiceId === 'guide') return (MOODS[mood]?.guide?.[0]) || GENERIC.guide;
  return MOODS[mood]?.choices?.[choiceId] || GENERIC[choiceId] || [];
}
