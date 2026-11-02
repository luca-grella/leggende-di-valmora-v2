// Outings once you are together (ported from v1 OUTINGS; v1 'piedino' dropped). Intimate options are
// ALLOWED_CHOICES ids only (`only`); `extras` are innocent actions from EXTRAS (validated by validateExtras).
// `spot`: POI suffixes tried in her town (`<town>.<suffix>`), first found wins. `hours`: when it happens;
// if the clock is outside, the outing skips to `skipTo` ("Si fa sera..."). `base`: actors pair kind that
// sets the scene. `props`: what romance/props.js builds around the pair.

export const OUTINGS = {
  osteria: {
    title: 'Cena in osteria', icon: '🍝', spot: ['osteria', 'date', 'plaza'], hours: [19, 23.5], skipTo: 20, skipText: 'Si fa sera...',
    base: 'sit_table', props: 'table', music: 'romance',
    only: ['kiss', 'hair', 'whisper'], extras: ['vino', 'dolce'], rounds: 2,
    lines: ['Questo posto fa la pasta migliore di Valmora.', 'Brindiamo... a noi due?', 'Smettila di guardarmi così, ci vedono tutti!',
      'Hai un po\' di sugo sul mento. Lascia, faccio io.', 'Il cameriere ci guarda e sorride. Avrà capito tutto.'],
  },
  scooter: {
    title: 'Giro in scooter', icon: '🛵', spot: ['ride', 'scooter', 'arrive', 'plaza'], view: ['viewpoint', 'date'], hours: [16.5, 20.5], skipTo: 18.2, skipText: 'Il sole comincia a scendere...',
    base: 'scooter_ride', props: 'scooter', music: 'romance',
    only: ['whisper', 'kiss', 'hug'], extras: ['abbraccio_dietro', 'panorama'], rounds: 2,
    lines: ['Più veloce! No, più piano! ...Più veloce!', 'Mi tengo stretta, eh. Non farti strane idee.', 'Da qui sopra Valmora sembra un altro mondo.', 'Se cadiamo è colpa tua, sappilo.'],
  },
  bagno: {
    title: 'Bagno di notte', icon: '🌊', spot: ['swim', 'beach'], near: '.swim', hours: [20.5, 4.5], skipTo: 21.5, skipText: 'Scende la notte...',
    base: 'swim', props: 'beach', music: 'romance', swimwear: true,
    only: ['kiss', 'kiss_neck', 'hair', 'hug'], extras: ['schizzi', 'in_braccio'], rounds: 2,
    lines: ['L\'acqua è fresca! ...Scaldami tu.', 'Le stelle si riflettono nell\'acqua, guarda.', 'Chi arriva ultimo alla riva offre la cena!', 'Non schizzarmi! ...Ok, guerra!'],
  },
  picnic: {
    title: 'Pic-nic', icon: '🧺', spot: ['picnic', 'date', 'viewpoint'], hours: [9.5, 17.5], skipTo: 12.5, skipText: 'Arriva l\'ora di pranzo...',
    base: 'sit_ground', props: 'picnic', music: 'romance',
    only: ['kiss', 'legs', 'feet', 'hair'], extras: ['fragola', 'testa_in_grembo'], rounds: 2,
    lines: ['Ho preparato tutto io. Assaggia!', 'Sdraiamoci a guardare le nuvole.', 'Quella nuvola sembra un Lanuvo, vero?', 'Che silenzio... si sentono solo gli uccellini.'],
  },
};

/** Innocent outing actions. `pair`: optional actors pair kind; `fx`: romance fx; `cam`: special framing. */
export const EXTRAS = {
  vino: { label: 'Versale del vino', icon: '🍷', fx: 'sparkle', expr: 'smile', lines: ['Grazie... vuoi farmi ubriacare?', 'Un goccio solo. Va bene, due.', 'Alla nostra.'] },
  dolce: { label: 'Ordina un dolce da dividere', icon: '🍰', fx: 'hearts', expr: 'grin', lines: ['Un cucchiaio per uno. ...Ok, l\'ultimo è mio.', 'Sei dolce quasi quanto questa torta.'] },
  abbraccio_dietro: { label: 'Lasciati abbracciare da dietro', icon: '🤗', pair: 'scooter_ride', fx: 'hearts', expr: 'smile', lines: ['Sei caldo... posso restare così fino a casa?', 'Senti il mio cuore? Batte forte per la velocità. Solo per quella.'] },
  panorama: { label: 'Fermati a guardare il panorama', icon: '🌅', cam: 'panorama', expr: 'smile', lines: ['Che spettacolo... grazie per avermi portata qui.', 'Quando sono con te tutto sembra più bello.'] },
  schizzi: { label: 'Schizzala', icon: '💦', fx: 'splash', expr: 'laugh', sfx: 'splash', lines: ['Ah! Ora te la faccio pagare!', 'Sei un bambino! ...Prendi questo!'] },
  in_braccio: { label: 'Prendila in braccio nell\'acqua', icon: '🫂', pair: 'hug', fx: 'hearts', expr: 'surprised', lines: ['Ehi! Mettimi giù! ...No, aspetta, resta così.', 'Mi sento leggera come una piuma.'] },
  fragola: { label: 'Imboccala con una fragola', icon: '🍓', fx: 'hearts', expr: 'smile', attach: 'strawberry', lines: ['Mmh... dolcissima. Ne voglio un\'altra.', 'Ora tocca a me imboccare te.'] },
  testa_in_grembo: { label: 'Appoggia la testa sulle sue gambe', icon: '😴', pair: 'picnic_lap', fx: 'hearts', expr: 'smile', lines: ['Comodo? Ti accarezzo i capelli io, stavolta.', 'Potrei restare così tutto il pomeriggio.'] },
};

/** Throws on any extra that is not in EXTRAS (the innocent whitelist). */
export function validateExtras(list) {
  for (const id of list) if (!Object.prototype.hasOwnProperty.call(EXTRAS, id)) throw new Error(`[romance] extra not allowed: ${id}`);
  return list;
}

/** True when hour h is inside [a, b) (wrapping past midnight when a > b). */
export const inHours = (h, [a, b]) => (a <= b ? h >= a && h < b : h >= a || h < b);
