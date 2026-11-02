// Save system: one plain state object persisted to localStorage. Each area owns its sub-object
// (see docs/ARCHITECTURE.md "Save schema") and fills missing fields itself.
//
// Autosave: debounced commit() from any area, automatic commits on important bus events and every
// 30 s once a game is running, a synchronous flush when the app goes to the background (iOS kills
// PWAs silently), and a rolling backup copy used if the main slot is ever corrupted.
export const SAVE_KEY = 'valmora-v2';
const BACKUP_KEY = SAVE_KEY + '.bak';
const VERSION = 1;

/** A fresh state (new game). */
export function defaultState() {
  return {
    v: VERSION, created: Date.now(), playTime: 0, started: false, savedAt: 0,
    settings: { adult: false, adultAsked: false, music: 0.6, sfx: 0.8, quality: 'auto', haptics: true, autoRun: false },
    flags: {},
    player: { x: 0, z: 0, facing: 0, area: 'alba', interior: null, lastCenter: 'alba', look: null },
    time: { hours: 9, day: 1 },
    world: { unlocked: {}, doors: {} },
    creatures: { party: [], box: [], seen: {}, caught: {}, starter: null },
    story: { coins: 300, bag: { pozione: 2 }, quests: {}, tracked: null, beaten: {}, chests: {}, searched: {},
      crime: { wanted: 0, blaster: false, jobsDone: 0 }, held: null },
    romance: { girls: {} },
    ui: { tips: {} },
  };
}

/** Fill missing keys of `obj` from `def` (two levels deep for nested plain objects). */
function fill(obj, def, depth = 0) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return structuredCloneSafe(def);
  for (const k of Object.keys(def)) {
    const dv = def[k];
    if (obj[k] === undefined || obj[k] === null && dv !== null && typeof dv === 'object') obj[k] = structuredCloneSafe(dv);
    else if (depth < 2 && dv && typeof dv === 'object' && !Array.isArray(dv) && obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) fill(obj[k], dv, depth + 1);
  }
  return obj;
}
function structuredCloneSafe(v) { return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v; }

/** Upgrade old saves in place (add steps when the schema version changes). */
function migrate(s) {
  if (!s || typeof s !== 'object') return null;
  if (!s.v) s.v = 1;
  // v1 → v2 … go here
  return s;
}

function readSlot(key) {
  try { const raw = localStorage.getItem(key); return raw ? migrate(JSON.parse(raw)) : null; }
  catch { return null; }
}

// Events that mean "something worth keeping happened" → debounced autosave.
const AUTOSAVE_EVENTS = ['battle:end', 'velmon:caught', 'velmon:evolved', 'velmon:levelup', 'team:change', 'quest:start', 'quest:step', 'quest:complete',
  'trainer:beaten', 'chest:open', 'flag:set', 'area:enter', 'interior:enter', 'interior:exit', 'ferry:travel', 'romance:stage', 'romance:bond',
  'coins:change', 'bag:change', 'settings:change', 'job:end', 'wanted:change', 'time:day'];

/** @param {{bus:any}} o */
export function createSave({ bus }) {
  let available = true;
  try { const k = '__valmora_probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); } catch { available = false; }
  let parsed = available ? readSlot(SAVE_KEY) : null;
  let recovered = false;
  if (!parsed && available) {
    try { if (localStorage.getItem(SAVE_KEY)) { parsed = readSlot(BACKUP_KEY); recovered = !!parsed; } } catch { /* ignore */ }
  }
  if (recovered) console.warn('[save] main slot unreadable: restored the backup copy');
  let timer = 0, active = false, lastBackup = 0;

  const save = {
    state: fill(parsed, defaultState()),
    /** No started game existed at boot (fresh install, or only settings were saved). */
    firstLaunch: !parsed || !parsed.started,
    /** localStorage works (false in some private modes: the game runs, nothing persists). */
    available,
    /** The save came from the backup slot. */
    recovered,
    /** A game was started in this state (Continua makes sense). */
    get hasGame() { return !!save.state.started; },
    /** Debounced write (400 ms). Any area may call it after changing its sub-object. */
    commit() { clearTimeout(timer); timer = setTimeout(() => save.flush(), 400); },
    /** Write now; returns true on success (the UI Salva button). */
    flush() {
      clearTimeout(timer);
      if (!available) return false;
      try {
        save.state.savedAt = Date.now();
        const json = JSON.stringify(save.state);
        localStorage.setItem(SAVE_KEY, json);
        // rolling backup at most every 2 minutes (protects against a corrupted main slot)
        if (Date.now() - lastBackup > 120000) { lastBackup = Date.now(); try { localStorage.setItem(BACKUP_KEY, json); } catch { /* quota */ } }
        bus?.emit('save:written', { state: save.state });
        return true;
      } catch (e) { console.warn('[save] write failed', e); return false; }
    },
    /** New game. Keeps settings (incl. the 18+ choice) unless keepSettings is false. */
    reset({ keepSettings = true } = {}) {
      const settings = save.state.settings;
      save.state = defaultState();
      if (keepSettings) save.state.settings = { ...save.state.settings, ...settings };
      try { localStorage.removeItem(BACKUP_KEY); } catch { /* ignore */ }
      lastBackup = 0;
      save.flush();
      bus?.emit('save:new', { state: save.state });
    },
    export() { return JSON.stringify(save.state); },
    import(d) {
      try {
        const s = migrate(typeof d === 'string' ? JSON.parse(d) : structuredCloneSafe(d));
        if (!s) return false;
        save.state = fill(s, defaultState());
        save.flush();
        bus?.emit('save:loaded', { state: save.state });
        return true;
      } catch { return false; }
    },
  };

  // autosave wiring
  bus?.on('game:start', () => { active = true; if (!save.state.started) { save.state.started = true; save.commit(); } });
  for (const ev of AUTOSAVE_EVENTS) bus?.on(ev, () => { if (active || ev === 'settings:change') save.commit(); });
  setInterval(() => { if (active) save.commit(); }, 30000);
  const now = () => { if (active || save.state.started) save.flush(); };
  window.addEventListener('pagehide', now);
  document.addEventListener('visibilitychange', () => { if (document.hidden) now(); });
  return save;
}
