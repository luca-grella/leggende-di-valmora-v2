// Objective tracker (ui area): reads ctx.story.quests.objective() at 4 Hz and shows the tracked step with a
// camera-relative direction arrow (eased rotation) and the distance. Tap it to open the journal.
// Portrait: under the top HUD; landscape/desktop: bottom centre.
import { el, onTap } from './dom.js';
import { icon } from './icons.js';
import { areaName } from './data.js';

export function createTracker(ctx, root) {
  const arrow = el('div.tr-arrow', { html: icon('arrow') });
  const dist = el('div.tr-dist.num');
  const compass = el('div.tr-compass', arrow, dist);
  const kind = el('span.tr-kind');
  const title = el('div.tr-title');
  const step = el('div.tr-step');
  const node = el('button.tracker.panel.plain.hidden', { type: 'button', 'aria-label': 'Obiettivo' }, compass, el('div.tr-body', el('div.tr-head', kind, title), step));
  const layer = el('div.layer.tracker-layer', node);
  root.append(layer);
  onTap(node, () => ctx.ui?.sheet('journal'));

  let obj = null, sig = '', acc = 1, angle = 0, targetAngle = 0, lastDist = -1, visible = false, manual = true;

  function read() {
    let o = null;
    try { o = ctx.story?.quests?.objective?.() || null; } catch (e) { o = null; }
    if (o && o.adult && !ctx.save?.state?.settings?.adult) o = null;
    obj = o;
    const s = o ? `${o.questId}|${o.title}|${o.text}|${!!o.target}|${o.areaId}|${o.main}` : '';
    if (s !== sig) {
      const changed = !!sig && !!s;
      sig = s;
      if (o) {
        kind.innerHTML = icon(o.main ? 'star' : 'journal');
        title.textContent = o.title || '';
        step.textContent = o.text || '';
        node.classList.toggle('main', !!o.main);
        if (changed) { node.classList.remove('flash'); void node.offsetWidth; node.classList.add('flash'); }
      }
    }
  }

  function update(dt) {
    acc += dt;
    if (acc >= 0.25) { acc = 0; read(); }
    const show = manual && !!obj && !ctx.busy.is();
    if (show !== visible) {
      visible = show;
      node.classList.toggle('hidden', !show && !obj);
      node.classList.toggle('off', !show);
    }
    if (!obj) return;
    const p = ctx.player?.position || ctx.cameraRig?.followed?.position;
    const t = obj.target;
    if (!t || !p) {
      compass.classList.add('noarrow');
      const here = obj.areaId && (ctx.world?.area === obj.areaId);
      const txt = obj.areaId ? (here ? 'Qui' : areaName(ctx, obj.areaId).split(' · ')[0]) : '';
      if (dist.textContent !== txt) dist.textContent = txt;
      return;
    }
    compass.classList.remove('noarrow');
    const dx = t.x - p.x, dz = t.z - p.z;
    const d = Math.hypot(dx, dz);
    // world → screen (inverse of the camera-relative input mapping): yaw 0 = camera at +z looking -z
    const yaw = ctx.cameraRig?.effectiveYaw || 0, c = Math.cos(yaw), s = Math.sin(yaw);
    const sx = dx * c - dz * s, sz = dx * s + dz * c;      // sz: +towards camera
    targetAngle = Math.atan2(sx, -sz);
    let diff = targetAngle - angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    angle += diff * (1 - Math.exp(-10 * dt));
    arrow.style.transform = `rotate(${angle.toFixed(3)}rad)`;
    const near = d < 6;
    compass.classList.toggle('near', near);
    const m = Math.round(d);
    if (m !== lastDist) {
      lastDist = m;
      dist.textContent = near ? 'Qui!' : m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : m + ' m';
    }
  }

  return {
    el: node, update,
    refresh() { acc = 1; },
    show(v = true) { manual = !!v; },
    get objective() { return obj; },
  };
}
