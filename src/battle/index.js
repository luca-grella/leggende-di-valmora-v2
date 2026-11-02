// Battle area entry point (contract: docs/ARCHITECTURE.md "Creatures & Battle API").
// battle.start(opts) → Promise<'win'|'lose'|'caught'|'run'>; one battle at a time. Pushes busy 'battle', emits
// battle:start / battle:end {result, kind, trainerId, foes}. Story pays rewards and runs the blackout on 'lose'.
import { BattleRun } from './battle.js';
import { createFx } from './fx.js';
import { normalize } from '../creatures/monster.js';

/** @param {any} ctx */
export function init(ctx) {
  const fx = createFx(ctx);
  let current = null;
  const battle = {
    active: false,
    /** Set true to let battles play themselves (tests; also used automatically when ctx.ui.battle is missing). */
    auto: ctx.params?.has?.('autobattle') || false,
    fx,
    get current() { return current; },
    async start(opts = {}) {
      if (battle.active) { console.warn('[battle] already running'); return 'run'; }
      const foes = (opts.foes || []).filter(Boolean).map(normalize);
      if (!foes.length) { console.warn('[battle] no foes'); return 'run'; }
      battle.active = true;
      const release = ctx.busy.push('battle');
      const info = { kind: opts.kind || 'wild', trainerId: opts.trainer?.id };
      ctx.bus.emit('battle:start', info);
      let result = 'run';
      try {
        current = new BattleRun(ctx, { ...opts, foes }, { fx, auto: battle.auto || !ctx.ui?.battle });
        current.prevTrack = ctx.audio?.track;
        current.fast = !!battle.fast; current.quiet = !!battle.quiet;
        result = await current.run();
      } catch (e) {
        console.error('[battle] failed', e);
      } finally {
        current = null;
        battle.active = false;
        release();
        ctx.creatures?.encounters?.cooldown?.(3);
        ctx.save?.commit?.();
      }
      ctx.bus.emit('battle:end', { result, kind: info.kind, trainerId: info.trainerId, foes });
      return result;
    },
  };
  ctx.debug?.register?.('battleAuto', (v = true, { fast = false, quiet = false } = {}) => { battle.auto = !!v; battle.fast = !!fast; battle.quiet = !!quiet; return battle.auto; });
  return battle;
}
