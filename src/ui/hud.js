// HUD (ui area): coins (top-left), clock + area (top-centre), team strip with 6 balls (top-right) with the
// map/menu buttons under it, wanted stars and the shady-job mission card. Updates itself from bus events.
import { el, onTap, countTo } from './dom.js';
import { icon } from './icons.js';
import { monInfo, party, coins, areaName, shortName, hpClass } from './data.js';

const PHASE_ICON = { dawn: 'dawn', day: 'sun', sunset: 'sunset', night: 'moon' };

export function createHud(ctx, root) {
  const layer = el('div.layer.hud');

  // ── coins ──
  const coinNum = el('span.coin-n.num', '0');
  const coinsEl = el('button.pill.hud-coins', { type: 'button', 'aria-label': 'Monete' }, el('span.coin-ic', { html: icon('coin') }), coinNum);
  const coinFx = el('div.coin-fx');
  const wanted = el('div.hud-wanted.hidden');
  const mission = el('div.hud-mission.panel.plain.hidden');
  const left = el('div.hud-left', coinsEl, coinFx, wanted, mission);

  // ── clock + area ──
  const clockIc = el('span.clock-ic');
  const clockT = el('span.clock-t.num', '9:00');
  const areaT = el('span.area-t');
  const center = el('div.hud-center', el('div.pill.hud-clock', clockIc, clockT), areaT);

  // ── team strip + buttons ──
  const teamEl = el('button.pill.hud-team', { type: 'button', 'aria-label': 'Squadra' });
  const slots = [];
  for (let i = 0; i < 6; i++) {
    const s = el('span.tslot', el('span.tball'), el('span.thp', el('i')));
    slots.push(s); teamEl.append(s);
  }
  const mapBtn = el('button.round.hud-btn', { type: 'button', 'aria-label': 'Mappa', html: icon('map') });
  const menuBtn = el('button.round.hud-btn', { type: 'button', 'aria-label': 'Menu', html: icon('menu') });
  const right = el('div.hud-right', teamEl, el('div.hud-btns', mapBtn, menuBtn));

  layer.append(left, center, right);
  root.append(layer);

  onTap(mapBtn, () => ctx.ui?.sheet('map'));
  onTap(menuBtn, () => ctx.ui?.sheet('menu'));
  // a single tap on the team strip opens the team (after the triple-tap window, so the cheat stays clean)
  let teamTapTimer = 0, teamTaps = 0;
  teamEl.addEventListener('pointerup', () => {
    teamTaps++; clearTimeout(teamTapTimer);
    teamTapTimer = setTimeout(() => { if (teamTaps === 1 && !ctx.busy.is()) ctx.ui?.sheet('team'); teamTaps = 0; }, 820);
  });

  // ── state ──
  let shown = true, lastCoins = null, lastTeamSig = '', lastClock = '', lastArea = '', wantedN = 0;
  let missionData = null, missionLeft = 0, missionTimerEl = null, lastMissionSec = -1;

  function setCoins(n, delta) {
    if (lastCoins === null) { coinNum.dataset.v = n; coinNum.textContent = n.toLocaleString('it-IT'); }
    else countTo(coinNum, n);
    if (lastCoins !== null && delta) {
      const f = el('span.coin-delta' + (delta < 0 ? '.neg' : ''), (delta > 0 ? '+' : '−') + Math.abs(delta).toLocaleString('it-IT'));
      coinFx.append(f); setTimeout(() => f.remove(), 1300);
      coinsEl.classList.remove('bump'); void coinsEl.offsetWidth; coinsEl.classList.add('bump');
    }
    lastCoins = n;
  }

  function renderTeam(force = false) {
    const p = party(ctx);
    const infos = p.slice(0, 6).map(m => monInfo(ctx, m));
    const sig = infos.map(i => i ? `${i.mon.species}:${i.hp}/${i.maxHp}` : '-').join('|');
    if (sig === lastTeamSig && !force) return;
    lastTeamSig = sig;
    slots.forEach((s, i) => {
      const inf = infos[i];
      s.querySelector('.tball').innerHTML = icon(!inf ? 'ballEmpty' : inf.fainted ? 'ballFaint' : 'ball');
      s.classList.toggle('empty', !inf);
      s.classList.toggle('faint', !!inf?.fainted);
      const bar = s.querySelector('.thp');
      bar.className = 'thp ' + (inf ? hpClass(inf.hpFrac) : 'none');
      bar.firstChild.style.width = inf ? (inf.hpFrac * 100).toFixed(1) + '%' : '0%';
      s.title = inf ? `${inf.name} Lv ${inf.level}` : '';
    });
  }

  function renderClock() {
    const t = ctx.time;
    const txt = t?.format?.() || '';
    if (txt !== lastClock) {
      lastClock = txt; clockT.textContent = txt;
      const ph = t?.phase || 'day';
      if (clockIc.dataset.ph !== ph) { clockIc.dataset.ph = ph; clockIc.innerHTML = icon(PHASE_ICON[ph] || 'sun'); }
      center.dataset.phase = ph;
    }
  }

  function setArea(name) {
    const n = shortName(name);
    if (n === lastArea) return;
    lastArea = n; areaT.textContent = n;
    areaT.classList.toggle('hidden', !n);
    areaT.classList.remove('in'); void areaT.offsetWidth; areaT.classList.add('in');
  }

  function setWanted(n) {
    n = Math.max(0, Math.min(3, n | 0));
    const up = n > wantedN; wantedN = n;
    wanted.classList.toggle('hidden', n === 0);
    layer.parentNode?.classList?.toggle('has-wanted', n > 0);
    wanted.replaceChildren(...[0, 1, 2].map(i => el('span.wstar' + (i < n ? '.on' : ''), { html: icon(i < n ? 'star' : 'starEmpty') })));
    if (up) { wanted.classList.remove('alarm'); void wanted.offsetWidth; wanted.classList.add('alarm'); }
    wanted.setAttribute('aria-label', `Ricercato: ${n} stelle`);
  }

  /** {title, goal, timer} — timer: seconds remaining (number, counted down here) or a function returning seconds. */
  function setMission(m) {
    missionData = m || null;
    mission.classList.toggle('hidden', !m);
    layer.parentNode?.classList?.toggle('has-mission', !!m);
    if (!m) { mission.replaceChildren(); return; }
    missionLeft = typeof m.timer === 'number' ? m.timer : 0;
    missionTimerEl = m.timer != null ? el('span.ms-timer.num') : null;
    lastMissionSec = -1;
    mission.replaceChildren(
      el('div.ms-head', el('span.ms-ic', { html: icon('target') }), el('span.ms-title', m.title || 'Lavoretto'), missionTimerEl),
      m.goal ? el('div.ms-goal', m.goal) : null);
    mission.classList.remove('in'); void mission.offsetWidth; mission.classList.add('in');
  }
  function tickMission(dt) {
    if (!missionData || !missionTimerEl) return;
    let sec;
    if (typeof missionData.timer === 'function') sec = +missionData.timer() || 0;
    else { missionLeft = Math.max(0, missionLeft - dt); sec = missionLeft; }
    const s = Math.ceil(sec);
    if (s === lastMissionSec) return;
    lastMissionSec = s;
    missionTimerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    missionTimerEl.classList.toggle('urgent', s <= 10);
  }

  function refresh() {
    setCoins(coins(ctx), 0);
    renderTeam(true);
    renderClock();
    const aid = ctx.world?.area || ctx.save?.state?.player?.area;
    setArea(ctx.world?.interior ? interiorName(ctx.world.interior, aid) : areaName(ctx, aid));
    setWanted(ctx.story?.crime?.wanted ?? ctx.save?.state?.story?.crime?.wanted ?? 0);
  }
  function interiorName(id, aid) {
    const k = String(id).split('.')[0];
    const map = { center: 'Centro Cura', shop: 'Bottega', home: 'Casa', lab: 'Laboratorio', osteria: 'Osteria', depot: 'Magazzino', house: 'Casa' };
    return map[k] || areaName(ctx, aid);
  }

  const on = (e, f) => ctx.bus.on(e, f);
  on('coins:change', ({ coins: c, delta } = {}) => setCoins(c ?? coins(ctx), delta || 0));
  on('team:change', () => renderTeam());
  on('velmon:levelup', () => renderTeam(true));
  on('velmon:evolved', () => renderTeam(true));
  on('battle:end', () => renderTeam(true));
  on('area:enter', ({ id, name } = {}) => setArea(name || areaName(ctx, id)));
  on('interior:enter', ({ id } = {}) => setArea(interiorName(id, ctx.world?.area)));
  on('interior:exit', () => setArea(areaName(ctx, ctx.world?.area || ctx.save?.state?.player?.area)));
  on('wanted:change', ({ level } = {}) => setWanted(level ?? 0));
  on('time:hour', () => renderClock());
  on('time:phase', () => renderClock());
  on('game:start', () => refresh());
  on('save:new', () => refresh());

  let acc = 0;
  function update(dt) {
    acc += dt;
    tickMission(dt);
    if (acc > 0.5) { acc = 0; renderClock(); renderTeam(); }
  }

  refresh();
  return {
    el: layer, coinsEl, teamEl, mapBtn, menuBtn,
    show(v = true) { shown = !!v; layer.classList.toggle('off', !shown); },
    get shown() { return shown; },
    setWanted, setMission, refresh, update,
  };
}
