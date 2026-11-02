// World-anchored icons over heads ('!' trainer spotted, '❤' romance, '?' quest, '★', '💬') (ui area).
// Projected every frame with ctx.cameraRig.toScreen; bubbles pop in with a spring and bob gently.
// No per-frame allocations: one Vector3 and one screen object are reused.
import { el } from './dom.js';
import { icon } from './icons.js';

const STYLE = {
  '!': { cls: 'alert', html: '<b>!</b>' },
  '?': { cls: 'quest', html: '<b>?</b>' },
  '❤': { cls: 'heart', icon: 'heart' }, '❤️': { cls: 'heart', icon: 'heart' },
  '★': { cls: 'star', icon: 'star' }, '⭐': { cls: 'star', icon: 'star' },
  '💬': { cls: 'talk', icon: 'talk' },
};

export function createMarkers(ctx, root) {
  const layer = el('div.layer.markers');
  root.append(layer);
  const map = new Map();
  const THREE = ctx.THREE;
  const v = THREE ? new THREE.Vector3() : null;
  const scr = { x: 0, y: 0, behind: false };

  function set(id, target, opts = {}) {
    if (id == null || !target) return;
    const { icon: ic = '!', color, offsetY = 0.35 } = opts;
    let m = map.get(id);
    if (!m) {
      const node = el('div.marker', el('div.mk-bubble'), el('div.mk-tail'));
      layer.append(node);
      m = { node, bubble: node.firstChild, target, offsetY, visible: false, born: performance.now() };
      map.set(id, m);
    }
    m.target = target; m.offsetY = offsetY;
    if (m.icon !== ic || m.color !== color) {
      m.icon = ic; m.color = color;
      const st = STYLE[ic] || { cls: 'custom', icon: ic };
      m.node.className = 'marker ' + st.cls + (m.visible ? '' : ' hidden');
      m.bubble.innerHTML = st.html || icon(st.icon);
      if (color) m.node.style.setProperty('--mk', color); else m.node.style.removeProperty('--mk');
      m.node.classList.remove('pop'); void m.node.offsetWidth; m.node.classList.add('pop');
      if (ic === '!') ctx.haptic?.([10, 40, 10]);
    }
  }

  function remove(id) {
    const m = map.get(id);
    if (!m) return;
    map.delete(id);
    m.node.classList.add('out');
    setTimeout(() => m.node.remove(), 220);
  }

  function update() {
    if (!map.size || !v) return;
    const rig = ctx.cameraRig;
    const W = ctx.viewport?.width || innerWidth, H = ctx.viewport?.height || innerHeight;
    // close-ups (dialogue, scenes, battles): only the transient alert markers stay, NPC bubbles would float in the shot
    const closeUp = !!rig && rig.mode !== 'explore' && rig.mode !== 'release' && !!ctx.busy?.is?.();
    for (const [id, m] of map) {
      const t = m.target;
      if (closeUp && id !== 'encounter' && !String(id).startsWith('spot')) { hide(m); continue; }
      if (t.isObject3D) {
        if (!t.parent && t.type !== 'Scene') { hide(m); continue; }
        t.updateWorldMatrix?.(true, false);
        v.setFromMatrixPosition(t.matrixWorld);
        if (!isVisibleChain(t)) { hide(m); continue; }
      } else v.set(t.x || 0, t.y || 0, t.z || 0);
      v.y += m.offsetY + (t.isObject3D && t.userData?.markerY ? t.userData.markerY : 0);
      rig?.toScreen?.(v, scr);
      if (scr.behind || scr.x < -0.1 || scr.x > 1.1 || scr.y < -0.1 || scr.y > 1.1) { hide(m); continue; }
      if (!m.visible) { m.visible = true; m.node.classList.remove('hidden'); }
      m.node.style.transform = `translate3d(${(scr.x * W).toFixed(1)}px, ${(scr.y * H).toFixed(1)}px, 0)`;
    }
  }
  function hide(m) { if (m.visible) { m.visible = false; m.node.classList.add('hidden'); } }
  function isVisibleChain(o) { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; }

  return { set, remove, update, has: id => map.has(id), ids: () => [...map.keys()], iconOf: id => map.get(id)?.icon ?? null,
    clear() { for (const id of [...map.keys()]) remove(id); } };
}
