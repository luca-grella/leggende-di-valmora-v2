// Coins: the single owner of money (save.state.story.coins). Listens to cheat:money (+1000).
export function createEconomy(ctx) {
  const st = () => (ctx.save.state.story ||= {});
  const emit = (delta, reason) => { ctx.save.commit(); ctx.bus.emit('coins:change', { coins: st().coins, delta, reason }); };
  const eco = {
    get coins() { return Math.max(0, Math.floor(st().coins || 0)); },
    earn(n, reason = '') {
      n = Math.round(n); if (!n) return eco.coins;
      st().coins = eco.coins + n; emit(n, reason);
      if (n > 0) { try { ctx.audio?.sfx?.('coin'); } catch { /* audio optional */ } }
      return st().coins;
    },
    spend(n, reason = 'spend') {
      n = Math.round(n);
      if (eco.coins < n) return false;
      st().coins = eco.coins - n; emit(-n, reason);
      return true;
    },
    /** Takes up to n coins (fines, blackout); returns what was actually taken. */
    lose(n, reason = 'fine') {
      const take = Math.min(eco.coins, Math.max(0, Math.round(n)));
      if (take) { st().coins = eco.coins - take; emit(-take, reason); }
      return take;
    },
  };
  ctx.bus.on('cheat:money', () => { eco.earn(1000, 'cheat'); ctx.ui?.toast?.('+1000 monete 💰', { icon: '💰' }); });
  return eco;
}
