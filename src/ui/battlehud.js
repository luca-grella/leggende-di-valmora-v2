// Battle HUD (ui area), Sun/Moon style: foe plate (top-left) and ally plate (bottom-right) with HP bars that
// drain smoothly, XP bar, trainer ball counters, a dark message box with typewriter, the command wheel
// (big LOTTA + Zaino / Squadra / Fuga), type-coloured move buttons with effectiveness hints, team and item pickers.
import { el, onTap, tapFeedback, leave } from './dom.js';
import { icon } from './icons.js';
import { monInfo, typeColor, movesTable, itemDef, bagList, itemKind } from './data.js';
import { thumb, typeChip, typeChips, hpBar, setBar } from './widgets.js';

const CPS = 55;

export function createBattleHud(ctx, root, focus) {
  const layer = el('div.layer.battle-layer');
  // plates
  const foePlate = el('div.bplate.foe');
  const allyPlate = el('div.bplate.ally');
  const foeBalls = el('div.bballs.foe');
  const allyBalls = el('div.bballs.ally');
  // message box
  const msgText = el('div.bmsg-text');
  const msgNext = el('div.bmsg-next', { html: '<svg viewBox="0 0 40 30" class="ic"><path d="M4 4 H36 L20 26 Z" fill="#ffc93c" stroke="#2a2140" stroke-width="4" stroke-linejoin="round"/></svg>' });
  const msg = el('div.bmsg', msgText, msgNext);
  // menus
  const cmd = el('div.bcmd');
  const moves = el('div.bmoves');
  const picker = el('div.bpick');
  layer.append(foePlate, foeBalls, allyPlate, allyBalls, msg, cmd, moves, picker);
  root.append(layer);

  let isOpen = false, ally = null, foe = null, popMsg = null;
  const shownHp = { ally: 0, foe: 0 };

  // ── plates ──
  function buildPlate(plate, mon, side) {
    const inf = monInfo(ctx, mon);
    if (!inf) { plate.replaceChildren(); return; }
    const caught = side === 'foe' && !!(ctx.creatures?.dex?.caught?.[inf.mon.species] ?? ctx.save?.state?.creatures?.caught?.[inf.mon.species]);
    const bar = hpBar(inf.hpFrac);
    const kids = [
      el('div.bp-top',
        caught ? el('span.bp-caught', { html: icon('ball') }) : null,
        el('span.bp-name', inf.name),
        el('span.bp-lv', 'Lv', el('b', inf.level))),
      el('div.bp-hp', el('span.bp-hpl', 'PS'), bar),
    ];
    if (side === 'ally') {
      kids.push(el('div.bp-nums.num', el('span.bp-hpn', String(inf.hp)), ' / ', el('span', String(inf.maxHp))));
      kids.push(hpBar(inf.xpFrac, { xp: true }));
    }
    plate.replaceChildren(...kids);
    plate.dataset.uid = inf.mon.uid || inf.mon.id || inf.mon.species;
    plate.dataset.lv = inf.level;
    shownHp[side] = inf.hp;
  }
  function animatePlate(plate, mon, side) {
    const inf = monInfo(ctx, mon);
    if (!inf) return;
    const uid = inf.mon.uid || inf.mon.id || inf.mon.species;
    if (plate.dataset.uid !== String(uid) || plate.dataset.lv !== String(inf.level) || !plate.firstChild) {
      buildPlate(plate, mon, side);
      plate.classList.remove('flash'); void plate.offsetWidth; plate.classList.add('flash');
      return;
    }
    const bars = plate.querySelectorAll('.bar');
    setBar(bars[0], inf.hpFrac);
    if (side === 'ally' && bars[1]) setBar(bars[1], inf.xpFrac, true);
    if (inf.hp < shownHp[side]) { plate.classList.remove('hit'); void plate.offsetWidth; plate.classList.add('hit'); }
    // count the HP number
    const n = plate.querySelector('.bp-hpn');
    if (n) {
      const from = shownHp[side], to = inf.hp, t0 = performance.now(), ms = 500;
      const step = () => { const k = Math.min(1, (performance.now() - t0) / ms); n.textContent = String(Math.round(from + (to - from) * k)); if (k < 1) requestAnimationFrame(step); };
      step(); setTimeout(() => { n.textContent = String(to); }, ms + 80);
    }
    shownHp[side] = inf.hp;
  }
  function balls(node, count, total = 6) {
    if (count == null) { node.replaceChildren(); return; }
    const alive = typeof count === 'number' ? count : count.alive ?? 0;
    const tot = typeof count === 'number' ? Math.max(count, 1) : count.total ?? alive;
    node.replaceChildren(...Array.from({ length: Math.min(total, tot) }, (_, i) => el('span.bb', { html: icon(i < alive ? 'ball' : 'ballFaint') })));
  }

  // ── message box ──
  let msgCur = null;
  function showMsg(on) { msg.classList.toggle('on', on); }
  function message(text, { wait = true } = {}) {
    return new Promise(resolve => {
      hideMenus();
      showMsg(true);
      const chars = [];
      msgText.replaceChildren();
      let word = null;
      for (const ch of String(text ?? '')) {
        const s = el('span.ch'); s.textContent = ch; chars.push(s);
        if (ch === ' ') { msgText.append(s); word = null; } else { if (!word) { word = el('span.w'); msgText.append(word); } word.append(s); }
      }
      msgNext.classList.remove('on');
      const finish = () => {
        if (msgCur.typed) return;
        for (let i = msgCur.n; i < chars.length; i++) chars[i].classList.add('v');
        msgCur.n = chars.length; msgCur.typed = true;
        if (wait) msgNext.classList.add('on');
        else msgCur.autoT = setTimeout(done, 650);
      };
      const done = () => {
        if (!msgCur || msgCur.resolved) return;
        msgCur.resolved = true; clearTimeout(msgCur.autoT);
        popMsg?.(); popMsg = null;
        msgNext.classList.remove('on');
        msgCur = null;
        resolve();
      };
      const adv = () => { if (!msgCur) return; if (!msgCur.typed) finish(); else if (wait) { tapFeedback(); done(); } };
      if (msgCur && !msgCur.resolved) { clearTimeout(msgCur.autoT); msgCur.cancel?.(); }
      msgCur = { chars, n: 0, t: 0, typed: chars.length === 0, finish, adv, cancel: () => resolve(), resolved: false };
      popMsg?.();
      popMsg = focus.push({ ok: adv, back: adv, menu: () => {} });
      if (msgCur.typed) finish();
    });
  }
  msg.addEventListener('pointerup', () => msgCur?.adv());
  function tick(dt) {
    const m = msgCur;
    if (!m || m.typed) return;
    m.t += dt * (ctx.input?.isDown?.('a') ? 2.5 : 1);
    while (m.n < m.chars.length && m.t >= 0) { m.chars[m.n++].classList.add('v'); m.t -= 1 / CPS; }
    if (m.n >= m.chars.length) m.finish();
  }

  function hideMenus() { cmd.classList.remove('on'); moves.classList.remove('on'); picker.classList.remove('on'); }

  /** Shared focus/selection for a set of buttons. */
  function selectable(buttons, { initial = 0, cols = 1, onPick, onBack }) {
    let sel = initial;
    const set = i => { sel = (i + buttons.length) % buttons.length; buttons.forEach((b, j) => b.classList.toggle('sel', j === sel)); };
    set(initial);
    buttons.forEach((b, i) => b.addEventListener('pointerenter', () => set(i)));
    const pop = focus.push({
      ok: () => onPick(sel), back: () => onBack?.(), menu: () => onBack?.(),
      nav: (dx, dy) => { if (cols > 1 && dx) set(sel + dx); else if (dy) set(sel + dy * cols); else if (dx) set(sel + dx); tapFeedback(); },
    });
    return pop;
  }

  // ── command menu ──
  function menu({ canRun = true } = {}) {
    return new Promise(resolve => {
      hideMenus();
      const allyName = monInfo(ctx, ally)?.name || 'il tuo Velmon';
      msgText.replaceChildren(el('span.v', `Cosa deve fare ${allyName}?`));
      showMsg(true); msgNext.classList.remove('on');
      const fight = el('button.bc-fight', { type: 'button' }, el('span.bc-fight-in', el('span.bc-fic', { html: icon('star') }), el('span', 'Lotta')));
      const bag = el('button.bc-pill.bag', { type: 'button' }, el('span.bc-ic', { html: icon('bag') }), 'Zaino');
      const team = el('button.bc-pill.team', { type: 'button' }, el('span.bc-ic', { html: icon('ball') }), 'Squadra');
      const run = el('button.bc-pill.run' + (canRun ? '' : '.disabled'), { type: 'button' }, el('span.bc-ic', { html: icon('run') }), 'Fuga');
      cmd.replaceChildren(el('div.bc-side', team, bag, run), fight);
      const opts = [['fight', fight], ['team', team], ['bag', bag], ['run', run]];
      let pop = null;
      const pick = i => {
        const [k, b] = opts[i];
        if (k === 'run' && !canRun) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); ctx.haptic?.(20); return; }
        pop?.(); cmd.classList.remove('on');
        tapFeedback();
        resolve(k);
      };
      opts.forEach(([, b], i) => onTap(b, () => pick(i), { sfx: false }));
      pop = selectable(opts.map(o => o[1]), { onPick: pick });
      requestAnimationFrame(() => cmd.classList.add('on'));
      setTimeout(() => cmd.classList.add('on'), 30);
    });
  }

  // ── moves ──
  function effLabel(moveType) {
    const fi = monInfo(ctx, foe);
    if (!fi || !ctx.creatures?.effectiveness) return null;
    const e = ctx.creatures.effectiveness(moveType, fi.types);
    if (e === 0) return ['none', 'Nessun effetto'];
    if (e > 1) return ['super', 'Superefficace'];
    if (e < 1) return ['weak', 'Poco efficace'];
    return null;
  }
  function movesMenu(mon) {
    return new Promise(resolve => {
      hideMenus();
      const M = movesTable(ctx);
      const ids = (mon?.moves || []).slice(0, 4);
      const btns = ids.map(id => {
        const mv = M[id] || { name: id, type: 'Normale', power: 0, acc: 100 };
        const eff = effLabel(mv.type);
        const b = el('button.bm', { type: 'button' },
          el('span.bm-name', mv.name),
          el('span.bm-row', typeChip(ctx, mv.type), el('span.bm-pw', mv.power ? `Pot. ${mv.power}` : '—'), el('span.bm-acc', `Prec. ${mv.acc ?? 100}`)),
          eff ? el('span.bm-eff.' + eff[0], eff[1]) : null);
        b.style.setProperty('--tc', typeColor(ctx, mv.type));
        return b;
      });
      const back = el('button.bm-back', { type: 'button' }, el('span', { html: icon('back') }), 'Indietro');
      moves.replaceChildren(el('div.bm-grid', btns), back);
      let pop = null;
      const done = v => { pop?.(); moves.classList.remove('on'); resolve(v); };
      btns.forEach((b, i) => onTap(b, () => done(ids[i])));
      onTap(back, () => done(null));
      pop = selectable(btns.length ? btns : [back], { cols: 2, onPick: i => done(btns.length ? ids[i] : null), onBack: () => done(null) });
      showMsg(false);
      requestAnimationFrame(() => moves.classList.add('on'));
      setTimeout(() => moves.classList.add('on'), 30);
    });
  }

  // ── pickers ──
  function openPicker(titleText, items, { cancel = true }) {
    return new Promise(resolve => {
      hideMenus();
      showMsg(false);
      const close = el('button.bp-x', { type: 'button', 'aria-label': 'Chiudi', html: icon('close') });
      const list = el('div.bpk-list.scroll', items.map(x => x.node));
      const card = el('div.bpk.panel', el('div.bpk-head', el('div.bpk-title', titleText), cancel ? close : null), list);
      picker.replaceChildren(card);
      let pop = null;
      const done = v => { pop?.(); picker.classList.remove('on'); resolve(v); };
      items.forEach((x, i) => onTap(x.node, () => { if (!x.disabled) done(x.value); }));
      if (cancel) onTap(close, () => done(null));
      pop = selectable(items.map(x => x.node), { initial: Math.max(0, items.findIndex(x => !x.disabled)), onPick: i => { if (!items[i]?.disabled) done(items[i].value); }, onBack: () => { if (cancel) done(null); } });
      requestAnimationFrame(() => picker.classList.add('on'));
      setTimeout(() => picker.classList.add('on'), 30);
    });
  }

  async function pickTeam(party, { forced = false } = {}) {
    const activeUid = ally?.uid ?? ally?.id;
    const items = (party || []).map((m, i) => {
      const inf = monInfo(ctx, m);
      const active = m === ally || (activeUid != null && (m.uid ?? m.id) === activeUid);
      const disabled = !inf || inf.fainted || active;
      const node = el('button.bpk-row' + (disabled ? '.disabled' : ''), { type: 'button' },
        thumb(ctx, m.species, { size: 96 }),
        el('div.bpk-body',
          el('div.bpk-top', el('span.bpk-name', inf?.name || '?'), el('span.bpk-lv', 'Lv ' + (inf?.level ?? '?'))),
          el('div.bpk-hp', hpBar(inf?.hpFrac ?? 0), el('span.num', `${inf?.hp ?? 0}/${inf?.maxHp ?? 0}`))),
        active ? el('span.bpk-tag', 'In campo') : inf?.fainted ? el('span.bpk-tag.ko', 'Esausto') : null);
      return { node, value: i, disabled };
    });
    const r = await openPicker(forced ? 'Scegli il prossimo Velmon' : 'Chi mandi in campo?', items, { cancel: !forced });
    return r == null ? -1 : r;
  }

  async function pickItem(list, { context = 'battle' } = {}) {
    let rows = Array.isArray(list) ? list : bagList(ctx);
    rows = rows.map(r => (typeof r === 'string' ? { id: r, n: ctx.story?.bag?.count?.(r) ?? 1, item: itemDef(ctx, r) } : { ...r, item: r.item || itemDef(ctx, r.id) }));
    if (context === 'battle') rows = rows.filter(r => itemKind(r.item) !== 'key');
    if (!rows.length) {
      await message('Lo zaino è vuoto…', { wait: true });
      return null;
    }
    const items = rows.map(r => ({
      value: r.id,
      node: el('button.bpk-row.item', { type: 'button' },
        el('span.bpk-iic', { html: icon(r.item.ball ? (r.item.ball > 1 ? 'mega' : 'ball') : (r.item.icon || 'bag')) }),
        el('div.bpk-body', el('div.bpk-top', el('span.bpk-name', r.item.name || r.id), el('span.bpk-n.num', '×' + r.n)), el('div.bpk-desc', r.item.desc || ''))),
    }));
    return openPicker('Zaino', items, { cancel: true });
  }

  // ── open / close ──
  function open({ ally: a, foe: f, trainer, allyCount } = {}) {
    ally = a || null; foe = f || null;
    isOpen = true;
    layer.classList.add('on');
    buildPlate(foePlate, foe, 'foe');
    buildPlate(allyPlate, ally, 'ally');
    balls(foeBalls, trainer ? (trainer.count ?? 1) : null);
    if (trainer?.name) foeBalls.prepend(el('span.bb-name', String(trainer.name)));
    balls(allyBalls, allyCount ?? (ctx.creatures?.team?.alive?.()?.length ?? null));
    foePlate.classList.toggle('trainer', !!trainer);
    for (const p of [foePlate, allyPlate, foeBalls, allyBalls]) { p.classList.remove('in'); void p.offsetWidth; p.classList.add('in'); }
    msgText.replaceChildren(); showMsg(false);
  }
  function upd({ ally: a, foe: f, allyCount, foeCount } = {}) {
    if (a !== undefined) { ally = a; animatePlate(allyPlate, a, 'ally'); }
    if (f !== undefined) { foe = f; animatePlate(foePlate, f, 'foe'); }
    if (allyCount !== undefined) balls(allyBalls, allyCount);
    if (foeCount !== undefined) balls(foeBalls, foeCount);
  }
  function close() {
    isOpen = false;
    hideMenus(); showMsg(false);
    popMsg?.(); popMsg = null;
    if (msgCur && !msgCur.resolved) { msgCur.resolved = true; msgCur.cancel?.(); msgCur = null; }
    layer.classList.remove('on');
  }

  return {
    el: layer, tick, open, close,
    update: upd,
    message, menu, moves: movesMenu, pickTeam, pickItem,
    get isOpen() { return isOpen; },
  };
}
