// Quest engine. Quest def (docs/ARCHITECTURE.md "Story API"):
//   {id, title, main?, adult?, icon?, giver?, steps:[{text, at?: poiId|()=>({x,z})|{x,z}, near?: m, done?: (ctx)=>bool}],
//    reward?: {coins?, items?: {id: n}}, onComplete?: (ctx)=>void}
// Progress: save.state.story.quests[id] = stepIndex | 'done'; tracked id in save.state.story.tracked.
// The engine re-checks `done` on bus events and every second, completes `near` steps on arrival,
// publishes the tracked Objective ({questId, title, text, target, areaId, main}) with objective:change
// and drives world.setBeacon (golden light column), hidden indoors and when you are already there.
import { ITEMS } from './items.js';
import { areaOfPoi, interiorOf, isInteriorPoi, dist2 } from './util.js';

const CHECK_EVENTS = ['battle:end', 'velmon:caught', 'velmon:seen', 'trainer:beaten', 'chest:open', 'flag:set', 'bag:change',
  'interior:enter', 'interior:exit', 'area:enter', 'time:hour', 'held:change', 'job:start', 'job:end', 'wanted:change', 'team:change', 'quest:complete',
  'velmon:evolved', 'romance:stage', 'settings:change'];

/** Outdoor door POI of an interior (where to point the tracker when the target is inside). */
export function doorPoiOf(interior) {
  if (!interior) return null;
  const p = interior.split('.');
  switch (p[0]) {
    case 'home': return 'alba.home_door';
    case 'lab': return `${p[1]}.lab_door`;
    case 'center': return `${p[1]}.center_door`;
    case 'shop': return `${p[1]}.shop_door`;
    case 'house': return `${p[1]}.house${p[2]}_door`;
    case 'osteria': return `${p[1]}.osteria_door`;
    case 'depot': return `${p[1]}.depot_door`;
    default: return null;
  }
}

export function createQuests(ctx) {
  const K = () => ctx.story.kit;
  const defs = {};
  const st = () => {
    const s = (ctx.save.state.story ||= {});
    if (!s.quests || typeof s.quests !== 'object') s.quests = {};
    return s;
  };
  const adultOn = () => !!ctx.save.state.settings?.adult;
  const visible = d => d && (!d.adult || adultOn()) && !d.hidden;
  let checking = false, lastSig = '', beaconSig = '', acc = 0, slow = 0;

  function rewardText(r) {
    if (!r) return '';
    const parts = [];
    if (r.coins) parts.push(`💰 ${r.coins}`);
    for (const [id, n] of Object.entries(r.items || {})) parts.push(`${n}× ${ITEMS[id]?.name || id}`);
    return parts.join(' · ');
  }

  const q = {
    defs,
    register(def) {
      if (!def?.id || !Array.isArray(def.steps)) { console.warn('[quests] bad def', def); return; }
      defs[def.id] = def;
    },
    stepOf: id => st().quests[id] ?? null,
    isDone: id => st().quests[id] === 'done',
    isActive: id => { const s = st().quests[id]; return s != null && s !== 'done'; },

    start(id, { silent = false, track } = {}) {
      const d = defs[id];
      if (!d) { console.warn('[quests] unknown quest', id); return false; }
      if (st().quests[id] != null) return false;
      st().quests[id] = 0;
      ctx.save.commit();
      ctx.bus.emit('quest:start', { id, step: 0 });
      if (!silent && visible(d)) {
        K().toast(`${d.main ? '★' : '📜'} Nuova missione: ${d.title}`, { icon: d.main ? '★' : '📜', ms: 2800 });
        K().sfx('ui_open');
      }
      if ((track ?? (d.main || !q.trackedId())) && visible(d)) q.track(id);
      q.check();
      q.refresh(true);
      return true;
    },

    advance(id, toStep) {
      const d = defs[id];
      const cur = st().quests[id];
      if (!d || cur == null || cur === 'done') return false;
      const next = toStep ?? cur + 1;
      if (next >= d.steps.length) { q.complete(id); return true; }
      if (next === cur) return false;
      st().quests[id] = next;
      ctx.save.commit();
      ctx.bus.emit('quest:step', { id, step: next });
      if (visible(d)) K().toast(`${d.title}: ${d.steps[next].text}`, { icon: d.main ? '★' : '📜', ms: 3000 });
      q.check();
      q.refresh(true);
      return true;
    },

    complete(id) {
      const d = defs[id];
      if (!d || st().quests[id] === 'done') return false;
      st().quests[id] = 'done';
      const r = d.reward || {};
      if (r.coins) ctx.story.economy.earn(r.coins, 'quest:' + id);
      for (const [it, n] of Object.entries(r.items || {})) ctx.story.bag.add(it, n);
      if (st().tracked === id) st().tracked = null;
      ctx.save.commit();
      if (visible(d)) {
        const rt = rewardText(r);
        K().banner(d.doneTitle || (d.main ? 'Capitolo completato!' : 'Missione completata!'), rt ? `${d.title} — ${rt}` : d.title);
        K().jingle('quest');
      }
      ctx.bus.emit('quest:complete', { id, reward: r });
      try { d.onComplete?.(ctx); } catch (e) { console.warn('[quests] onComplete', id, e); }
      q.refresh(true);
      return true;
    },

    /** [{id, def, step}] visible active quests, main first. */
    active() {
      const out = [];
      for (const [id, s] of Object.entries(st().quests)) {
        if (s === 'done' || s == null || !visible(defs[id])) continue;
        out.push({ id, def: defs[id], step: s });
      }
      return out.sort((a, b) => (b.def.main ? 1 : 0) - (a.def.main ? 1 : 0));
    },
    /** [{id, def}] visible completed quests (journal "Completate"). */
    completed() { return Object.entries(st().quests).filter(([id, s]) => s === 'done' && visible(defs[id])).map(([id]) => ({ id, def: defs[id] })); },

    track(id) {
      st().tracked = id && defs[id] ? id : null;
      ctx.save.commit();
      q.refresh(true);
    },
    /** Effective tracked quest id: the chosen one if still active, else the main quest, else one with a place. */
    trackedId() {
      const act = q.active();
      const chosen = st().tracked;
      if (chosen && act.some(a => a.id === chosen)) return chosen;
      return act.find(a => a.def.main)?.id || act.find(a => a.def.steps[a.step]?.at)?.id || act[0]?.id || null;
    },
    get tracked() { return q.trackedId(); },

    /** Where a step points, resolving interior targets to their door while you are outside. */
    targetOf(step) {
      if (!step?.at) return { target: null, areaId: null };
      const at = typeof step.at === 'function' ? step.at(ctx) : step.at;
      if (!at) return { target: null, areaId: null };
      let id = typeof at === 'string' ? at : null;
      const inside = ctx.world?.interior || null;
      if (id && isInteriorPoi(id)) {
        const intr = interiorOf(id);
        if (inside !== intr) id = inside ? null : doorPoiOf(intr);
      } else if (inside) {
        // target outdoors while you are inside: no arrow (the UI may say "Esci")
        return { target: null, areaId: id ? areaOfPoi(id) : null, outside: true };
      }
      const p = id ? K().poi(id) : (typeof at === 'object' ? at : null);
      const target = p ? { x: p.x, z: p.z } : null;
      let areaId = typeof at === 'string' ? areaOfPoi(at) : null;
      if (!areaId && target) { try { areaId = ctx.world?.areaAt?.(target.x, target.z) || null; } catch { areaId = null; } }
      return { target, areaId };
    },

    objective() {
      // a running shady job takes over the tracker (timed, and the player chose it just now)
      const job = ctx.story.crime?.job;
      if (job?.target && !(job.kind === 'theft' && job.goal === 'Semina le guardie!')) {
        return { questId: 'job', title: job.title, text: job.goal, target: { x: job.target.x, z: job.target.z }, areaId: null, main: false, job: true, outside: false, step: 0, steps: 1 };
      }
      const id = q.trackedId();
      if (!id) return null;
      const d = defs[id], s = st().quests[id], step = d.steps[s];
      if (!step) return null;
      const { target, areaId, outside } = q.targetOf(step);
      return { questId: id, title: d.title, text: step.text, target, areaId, main: !!d.main, outside: !!outside, step: s, steps: d.steps.length };
    },

    /** Re-check the `done` predicates of every active quest step until stable. */
    check() {
      if (checking) return;
      checking = true;
      try {
        for (let guard = 0; guard < 12; guard++) {
          let moved = false;
          for (const [id, s] of Object.entries(st().quests)) {
            if (s === 'done' || s == null) continue;
            const step = defs[id]?.steps[s];
            let ok = false;
            try { ok = !!step?.done?.(ctx); } catch (e) { console.warn('[quests] done()', id, e); }
            if (ok) { checking = false; q.advance(id); checking = true; moved = true; break; }
          }
          if (!moved) break;
        }
      } finally { checking = false; }
    },

    /** Publish objective:change + beacon if anything changed (force = recompute now). */
    refresh(force = false) {
      const o = q.objective();
      const t = o?.target;
      const sig = o ? `${o.questId}|${o.step}|${t ? Math.round(t.x) + ',' + Math.round(t.z) : '-'}|${o.text}` : 'none';
      if (force || sig !== lastSig) {
        if (sig !== lastSig) { lastSig = sig; ctx.bus.emit('objective:change', { objective: o }); }
      }
      // beacon: hidden indoors, during scenes and when you are already there
      const pp = K().playerPos();
      const near = t && pp ? dist2(pp, t) < 7 : false;
      const show = t && !near && !ctx.world?.interior;
      const bsig = show ? `${Math.round(t.x * 2)},${Math.round(t.z * 2)}` : 'off';
      if (bsig !== beaconSig) {
        beaconSig = bsig;
        try { ctx.world?.setBeacon?.(show ? { x: t.x, z: t.z } : null, o?.job ? '#ff7ad1' : o?.main ? '#ffc93c' : '#7fe0ff'); } catch (e) { console.warn('[quests] beacon', e); }
      }
    },

    /** Debug: jump a quest to a step (starts it if needed). */
    debugSet(id, step) {
      if (!defs[id]) return false;
      if (st().quests[id] == null) st().quests[id] = 0;
      if (step === 'done') q.complete(id); else { st().quests[id] = step; ctx.save.commit(); ctx.bus.emit('quest:step', { id, step }); }
      q.refresh(true);
      return true;
    },
  };

  for (const e of CHECK_EVENTS) ctx.bus.on(e, () => { q.check(); q.refresh(); });
  ctx.bus.on('game:start', () => { lastSig = ''; beaconSig = ''; q.check(); q.refresh(true); });

  ctx.loop.add(function storyQuests(dt) {
    acc += dt; slow += dt;
    if (acc < 0.25) return;
    acc = 0;
    if (ctx.busy.is()) return;
    // arrival steps
    const pp = K().playerPos();
    if (pp) {
      for (const [id, s] of Object.entries(st().quests)) {
        if (s === 'done' || s == null) continue;
        const step = defs[id]?.steps[s];
        if (!step?.near || !step.at || step.done) continue;
        const { target } = q.targetOf(step);
        if (target && dist2(pp, target) < step.near && !(typeof step.at === 'string' && isInteriorPoi(step.at) && ctx.world?.interior !== interiorOf(step.at))) { q.advance(id); break; }
      }
    }
    if (slow > 1) { slow = 0; q.check(); }
    q.refresh();
  }, ctx.ORDER.systems);

  return q;
}
