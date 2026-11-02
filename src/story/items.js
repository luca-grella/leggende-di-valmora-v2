// Bag items and carried gift objects (docs/GDD.md "Items & shop"). Shapes:
//   ITEMS[id] = {name, icon, price, desc, ball?, heal?, revive?, key?, battle?, field?, shop?:false}
//   GIFTS[kind] = {name ('la mela'), label ('Mela'), icon, throwable, heavy?, color}
export const ITEMS = {
  sfera: { name: 'Sfera', icon: '🔴', price: 200, ball: 1, battle: true, desc: 'Per catturare i Velmon selvatici.' },
  megasfera: { name: 'Megasfera', icon: '🔵', price: 600, ball: 1.5, battle: true, desc: 'Una Sfera più efficace: cattura più facilmente.' },
  pozione: { name: 'Pozione', icon: '🧪', price: 300, heal: 50, battle: true, field: true, desc: 'Ridà 50 PS a un Velmon.' },
  superpozione: { name: 'Superpozione', icon: '⚗️', price: 700, heal: 9999, battle: true, field: true, desc: 'Ridà tutti i PS a un Velmon.' },
  ravviva: { name: 'Ravviva', icon: '💫', price: 1200, revive: true, battle: true, field: true, desc: 'Rimette in piedi un Velmon esausto con metà PS.' },
  blaster: { name: 'Spara-vernice', icon: '🎯', price: 400, key: true, shop: false, desc: 'Stordisce le guardie con palle di vernice (F / 🎯). Ti rende ricercato.' },
  lettera: { name: 'Lettera di Quercia', icon: '✉️', price: 0, key: true, shop: false, desc: 'Una lettera sigillata per il Dott. Ginepro di Villa Petalo.' },
  pagnotta: { name: 'Pagnotta calda', icon: '🥖', price: 0, key: true, shop: false, desc: 'Il pane di Fornaio Bruno per sua sorella Ada, a Borgo Muschio.' },
  lettera_gino: { name: 'Lettera per Nonna Pina', icon: '💌', price: 0, key: true, shop: false, desc: 'Il postino Gino ti ha chiesto di portarla a Castelfosco.' },
  cappello: { name: 'Cappello di paglia', icon: '👒', price: 0, key: true, shop: false, desc: 'Un cappello portato via dal vento. È di Lia, a Villa Petalo.' },
};

/** Objects carried in hand (romance gifts, throwables). They live in the world, not in the bag. */
export const GIFTS = {
  mela: { name: 'la mela', label: 'Mela', icon: '🍎', throwable: true, color: '#e8443a' },
  vasofiori: { name: 'il vaso di fiori', label: 'Vaso di fiori', icon: '💐', throwable: true, color: '#ff5f9e' },
  palla: { name: 'la palla', label: 'Palla', icon: '⚽', throwable: true, bouncy: true, color: '#ffd23f' },
  libro: { name: 'il libro', label: 'Libro', icon: '📘', throwable: true, color: '#5b7fe0' },
  cassa: { name: 'la cassa', label: 'Cassa', icon: '📦', throwable: true, heavy: true, color: '#c58a52' },
};

/** Ids the Bottega can sell (in display order). */
export const SHOP_ORDER = ['sfera', 'megasfera', 'pozione', 'superpozione', 'ravviva'];
