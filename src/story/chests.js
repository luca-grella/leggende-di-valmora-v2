// Hidden treasure chests at world POIs chest.1..32 (routes, caves, beaches). Toon wooden chests with gold
// bands; A → the lid swings open with a glow and a burst of stars, the loot pops out. Opened chests stay
// open (save.state.story.chests[id] = true). Only chests near the player are visible (cheap draw calls).
import { buildChest, buildBurst } from './props.js';
import { ITEMS } from './items.js';
import { dist2 } from './util.js';

const COUNT = 32;
/** Loot by chest number (deterministic, generous enough to make exploring worth it). */
function lootOf(n) {
  const table = [
    { items: { pozione: 2 } }, { coins: 300 }, { items: { sfera: 3 } }, { items: { superpozione: 1 } }, { coins: 500 },
    { items: { megasfera: 2 } }, { items: { ravviva: 1 } }, { coins: 800 }, { items: { sfera: 5 } }, { items: { pozione: 3, superpozione: 1 } },
  ];
  const l = table[(n - 1) % table.length];
  if (n % 8 === 0) return { coins: 1200, items: { ravviva: 1 } };     // the rare golden ones
  return l;
}

export function createChests(ctx) {
  const K = () => ctx.story.kit;
  const st = () => ((ctx.save.state.story ||= {}).chests ||= {});
  const live = new Map();      // id → {obj, p}
  let acc = 0;

  async function open(id, rec) {
    if (st()[id]) return;
    const n = +id.split('.')[1] || 1;
    const loot = lootOf(n);
    st()[id] = true; ctx.save.commit();
    await K().busy('scene', async () => {
      try { ctx.player?.human?.face?.({ x: rec.p.x, z: rec.p.z }); ctx.player?.human?.play?.('pickup', { loop: false }); } catch { /* optional */ }
      K().sfx('chest');
      await K().tween(0.6, k => rec.obj.userData.setOpen(k), t => 1 - Math.pow(1 - t, 3));
      ctx.story.fx.add(buildBurst(ctx, n % 8 === 0 ? '#ff8fd0' : '#ffe27a', { count: 16 }), { x: rec.p.x, y: rec.p.y + 0.6, z: rec.p.z });
      K().jingle('item');
      await K().wait(0.5);
    });
    const parts = [];
    if (loot.coins) { ctx.story.economy.earn(loot.coins, 'chest'); parts.push(`💰 ${loot.coins}`); }
    for (const [it, q] of Object.entries(loot.items || {})) { ctx.story.bag.add(it, q); parts.push(`${q}× ${ITEMS[it]?.name || it}`); }
    await K().say('', [`Hai trovato un forziere! Dentro c'era: ${parts.join(', ')}.`]);
    rec.obj.userData.setOpen(0.85);
    ctx.bus.emit('chest:open', { id });
  }

  function build() {
    for (let n = 1; n <= COUNT; n++) {
      const id = `chest.${n}`;
      if (live.has(id)) continue;
      const p = K().poi(id); if (!p) continue;
      const obj = buildChest(ctx, { gold: n % 8 === 0 });
      const y = p.y ?? K().groundY(p.x, p.z);
      obj.position.set(p.x, y, p.z); obj.rotation.y = p.facing || 0;
      obj.userData.setOpen(st()[id] ? 0.85 : 0);
      obj.visible = false;
      ctx.scene.add(obj);
      const rec = { obj, p: { x: p.x, y, z: p.z } };
      live.set(id, rec);
      ctx.interact.register({
        id: 'story.' + id, pos: rec.p, radius: 1.5, label: 'Apri', icon: '🎁', priority: 1,
        enabled: () => !st()[id] && obj.visible, run: () => open(id, rec),
      });
    }
  }

  ctx.bus.on('game:start', () => { build(); for (const [id, r] of live) r.obj.userData.setOpen(st()[id] ? 0.85 : 0); });
  ctx.bus.on('area:enter', () => build());

  ctx.loop.add(function storyChests(dt) {
    acc += dt; if (acc < 0.3) return; acc = 0;
    const pp = K().playerPos(); if (!pp) return;
    const indoor = !!ctx.world?.interior;
    for (const r of live.values()) r.obj.visible = !indoor && dist2(pp, r.p) < 70;
  }, ctx.ORDER.systems);

  return {
    opened: id => !!st()[id],
    count: () => Object.keys(st()).filter(k => st()[k]).length,
    total: () => live.size || COUNT,
    /** Debug: open the nearest chest instantly. */
    nearest() { const pp = K().playerPos(); let best = null, bd = 1e9; for (const [id, r] of live) { const d = dist2(pp, r.p); if (d < bd) { bd = d; best = id; } } return best; },
    open: id => (live.get(id) ? open(id, live.get(id)) : Promise.resolve()),
  };
}
