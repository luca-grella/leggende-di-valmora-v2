// Route pickups and signs (story-private). Every route has three item balls at R.item1..3 (a red/white
// ball that bobs and sparkles; A → the item goes in the bag, picked once per save in
// save.state.story.pickups) and a wooden sign at R.sign that reads the route name and a tip.
import { buildBall, buildBurst } from './props.js';
import { ITEMS } from './items.js';
import { dist2 } from './util.js';

const ROUTES = ['r1', 'r2', 'r3', 'r4', 'r5', 'santuario', 'r6', 'r7', 'r8'];
/** Loot per route (three items each), tuned to the levels of the route. */
const LOOT = {
  r1: [['pozione', 1], ['sfera', 2], ['pozione', 1]],
  r2: [['sfera', 3], ['pozione', 2], ['megasfera', 1]],
  r3: [['superpozione', 1], ['sfera', 3], ['pozione', 2]],
  r4: [['megasfera', 2], ['ravviva', 1], ['superpozione', 1]],
  r5: [['ravviva', 1], ['megasfera', 2], ['superpozione', 2]],
  santuario: [['superpozione', 2], ['ravviva', 2], ['megasfera', 3]],
  r6: [['megasfera', 2], ['superpozione', 1], ['sfera', 5]],
  r7: [['ravviva', 1], ['superpozione', 2], ['megasfera', 3]],
  r8: [['superpozione', 2], ['megasfera', 2], ['ravviva', 1]],
};
const TIPS = {
  r1: 'Nell\'erba alta si nascondono i Velmon selvatici. Fai attenzione... o vai a cercarli!',
  r2: 'I mulini girano anche di notte. Attenzione: i Pipistro escono al buio.',
  r3: 'Il Ponte di Giada collega Città Fulgida alla giungla. Non sporgerti!',
  r4: 'Le pietre della brughiera sono più vecchie del castello. Gli Ombrale le adorano.',
  r5: 'Passo Gelido: neve e vento. Portati delle Superpozioni.',
  santuario: 'Il Santuario dell\'Alba. Chi sale con il cuore puro vede sorgere il sole per primo.',
  r6: 'Lagune Coralline: con la bassa marea si cammina sui banchi di sabbia.',
  r7: 'Sentiero del Vulcano: la sabbia nera scotta. Bevi tanta acqua!',
  r8: 'Canyon Ramato: gli archi di roccia fanno eco. Prova a gridare il tuo nome!',
};

export function createPickups(ctx) {
  const K = () => ctx.story.kit;
  const st = () => ((ctx.save.state.story ||= {}).pickups ||= {});
  const live = new Map();          // id → {obj, p}
  let acc = 0;

  async function take(id, rec) {
    if (st()[id]) return;
    const [route, n] = id.split('.item');
    const [item, q] = LOOT[route]?.[(+n || 1) - 1] || ['pozione', 1];
    st()[id] = true; ctx.save.commit();
    await K().busy('scene', async () => {
      try { ctx.player?.human?.face?.({ x: rec.p.x, z: rec.p.z }); ctx.player?.human?.play?.('pickup', { loop: false })?.then?.(() => ctx.player?.human?.play?.('idle')); } catch { /* optional */ }
      K().sfx('pickup');
      await K().tween(0.35, k => { rec.obj.position.y = rec.p.y + 0.15 + k * 0.6; rec.obj.scale.setScalar(1.5 * (1 - k)); });
      rec.obj.visible = false;
      ctx.story.fx.add(buildBurst(ctx, '#ffe27a', { count: 10, speed: 2.4, life: 0.6 }), { x: rec.p.x, y: rec.p.y + 0.6, z: rec.p.z });
    });
    ctx.story.bag.add(item, q);
    K().jingle('item');
    await K().narrate([`Hai trovato ${q > 1 ? q + '× ' : ''}${ITEMS[item]?.name || item}! ${ITEMS[item]?.icon || ''}`]);
  }

  function build() {
    for (const r of ROUTES) {
      for (let n = 1; n <= 3; n++) {
        const id = `${r}.item${n}`;
        if (live.has(id)) continue;
        const p = K().poi(id); if (!p) continue;
        const obj = buildBall(ctx, n === 3 ? 'megasfera' : 'sfera');
        const y = p.y ?? K().groundY(p.x, p.z);
        const rec = { obj, p: { x: p.x, y, z: p.z } };
        obj.scale.setScalar(1.5);
        obj.visible = false;
        obj.userData.update = (dt, t) => { if (!st()[id]) { obj.position.y = y + 0.05 + Math.abs(Math.sin(t * 2.2 + n)) * 0.12; obj.rotation.y = t * 0.8; } };
        ctx.story.fx.add(obj, { x: p.x, y, z: p.z });
        live.set(id, rec);
        ctx.interact.register({
          id: 'story.pickup.' + id, pos: rec.p, radius: 1.4, label: 'Raccogli', icon: '✨', priority: 1,
          enabled: () => !st()[id] && obj.visible, run: () => take(id, rec),
        });
      }
      const sid = `${r}.sign`;
      if (!live.has(sid)) {
        const p = K().poi(sid);
        if (p) {
          live.set(sid, { sign: true, p });
          ctx.interact.register({
            id: 'story.sign.' + r, pos: { x: p.x, z: p.z }, radius: 1.6, label: 'Leggi', icon: '🪧',
            run: async () => {
              const name = ctx.world?.areaDef?.(r)?.name || r;
              await K().narrate([`「 ${name} 」`, TIPS[r] || '']);
            },
          });
        }
      }
    }
  }

  ctx.bus.on('game:start', () => { build(); for (const [id, r] of live) if (r.obj) r.obj.visible = !st()[id]; });
  ctx.bus.on('area:enter', () => build());

  ctx.loop.add(function storyPickups(dt) {
    acc += dt; if (acc < 0.3) return; acc = 0;
    const pp = K().playerPos(); if (!pp) return;
    const indoor = !!ctx.world?.interior;
    for (const [id, r] of live) if (r.obj) r.obj.visible = !indoor && !st()[id] && dist2(pp, r.p) < 60;
  }, ctx.ORDER.systems);

  return { picked: id => !!st()[id], count: () => Object.keys(st()).length };
}
