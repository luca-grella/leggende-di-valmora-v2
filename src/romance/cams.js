// Romance framing on top of ctx.cameraRig.shot(): shots are computed from the actors' HEAD positions
// (so kneeling, sitting and lying poses frame correctly) and from the screen aspect, so portrait
// iPhones get an over-the-shoulder angle instead of a too-wide shot. Faces and shoulders only: the
// lower frame edge is kept around the waist or above, never on feet (docs/GDD.md "Camera").
// After each shot a slow push-in "breathing" drift keeps the picture alive.
import * as THREE from 'three';

const D2R = Math.PI / 180;

export function createCams(ctx) {
  const tmp = new THREE.Vector3();
  let token = 0;

  const rig = () => ctx.cameraRig;
  const aspect = () => ctx.viewport?.aspect || ctx.camera.aspect || 1;

  /** World position of a Human's (or Object3D's) head. */
  function headOf(h, out = new THREE.Vector3()) {
    if (!h) return out.set(0, 1.5, 0);
    if (h.head?.isObject3D) { h.head.getWorldPosition(out); return out; }
    const o = h.object || h;
    if (o.isObject3D) o.getWorldPosition(out); else out.set(o.x || 0, o.y || 0, o.z || 0);
    out.y += (h.height || 1.65) * 0.9;
    return out;
  }

  /**
   * Glide to a shot, then a slow push-in drift. `live` (optional) is a function returning the target point
   * every frame, so the frame follows the actors while their poses settle (sitting down, leaning in).
   */
  // ---- keep the lens out of furniture and walls: walk the camera in front of the first solid surface
  //      between the couple and the lens (or lift it), so no sofa arm / wall / bed fills the frame
  const ray = new THREE.Raycaster(), _d = new THREE.Vector3();
  function solids() {
    const out = [];
    ctx.scene.traverseVisible(o => {
      if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.userData?.noOcclude) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.side === THREE.BackSide || (m.transparent && m.opacity < 0.6) || m.depthWrite === false) return;
      for (let p = o.parent; p; p = p.parent) if (p.name === 'human' || p.userData?.velmon) return;
      out.push(o);
    });
    return out;
  }
  function clearShot(spec) {
    const tgt = spec.target?.isVector3 ? spec.target : null;
    if (!tgt || !spec.position) return spec;
    let list = null;
    const pos = spec.position.clone();
    // sample the centre of the frame AND its lower part (chests, left and right): foreground furniture (a
    // sofa back, the foot of a bed) usually sits below the line of sight to the faces
    const side = new THREE.Vector3(), from = new THREE.Vector3(), dir = new THREE.Vector3(), hp = new THREE.Vector3();
    const OFFS = [[0, 0], [0, -0.36], [0.3, -0.4], [-0.3, -0.4]];
    for (let k = 0; k < 4; k++) {
      _d.subVectors(pos, tgt); const dist = _d.length(); if (dist < 0.3) break;
      _d.normalize();
      side.set(-_d.z, 0, _d.x); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
      let hit = null;
      try {
        list = list || solids();
        for (const [sx, sy] of OFFS) {
          from.copy(tgt).addScaledVector(side, sx); from.y += sy;
          dir.subVectors(pos, from); const dd = dir.length(); dir.normalize();
          ray.set(from, dir); ray.near = sy ? 0.25 : 0.35; ray.far = dd + 0.25;
          const h = ray.intersectObjects(list, false)[0];
          // distance of the obstacle from the target, measured along the target→camera line
          if (h) { const along = hp.copy(h.point).sub(tgt).dot(_d); if (!hit || along < hit.distance) hit = { distance: along }; }
        }
      } catch { hit = null; }
      if (!hit) return { ...spec, position: pos };
      const safe = hit.distance - 0.22;
      if (safe >= Math.max(0.9, dist * 0.55)) { pos.copy(tgt).addScaledVector(_d, safe); return { ...spec, position: pos }; }
      pos.y += 0.45;                                       // too close: look from a little higher and retry
    }
    return { ...spec, position: pos };
  }

  function go(spec, dur, drift = true, live = null) {
    const my = ++token;
    spec = clearShot(spec);
    const p = rig().shot(live ? { ...spec, target: live } : spec, { dur, ease: dur ? 'inOut' : 'cut' });
    if (drift) p.then(() => {
      if (my !== token) return;
      const tgt = live ? live().clone() : spec.target;
      // slow push-in of a few centimetres (capped: far targets, like the view, must not pull the camera past the couple)
      const dir = new THREE.Vector3().subVectors(tgt, spec.position);
      const to = new THREE.Vector3().copy(spec.position).addScaledVector(dir.normalize(), Math.min(0.18, 0.07 * spec.position.distanceTo(tgt)));
      const side = new THREE.Vector3().subVectors(tgt, spec.position).cross(new THREE.Vector3(0, 1, 0)).setLength(0.12);
      to.add(side); to.y += 0.03;
      rig().shot({ position: to, target: live || spec.target, fov: (spec.fov || 30) - 1 }, { dur: 7 });
    });
    return p;
  }
  const _la = new THREE.Vector3(), _lb = new THREE.Vector3(), _lt = new THREE.Vector3();

  const cams = {
    headOf,
    /** Stop any pending drift (call before handing the camera back). */
    stop() { token++; },

    /**
     * Two-shot of a (player) and b (her). tight: closer (kiss, hug, whisper).
     * side: +1/-1 forces the side of the line of action, otherwise keeps the camera's current side.
     */
    two(a, b, { tight = false, side = null, dur = 1.1, fov = 30 } = {}) {
      const A = headOf(a), B = headOf(b);
      const mid = new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5);
      const axis = new THREE.Vector3(B.x - A.x, 0, B.z - A.z);
      let s = axis.length();
      if (s < 0.05) { const f = (b?.object || b)?.rotation?.y || 0; axis.set(-Math.sin(f), 0, -Math.cos(f)); s = 0.05; }
      axis.normalize();
      const n = new THREE.Vector3(-axis.z, 0, axis.x);
      const sign = side ?? (tmp.subVectors(ctx.camera.position, mid).dot(n) >= 0 ? 1 : -1);
      n.multiplyScalar(sign);
      const asp = aspect(), tanH = Math.tan((fov * D2R) / 2);
      // frame height V: faces and shoulders, never below the waist (maxV)
      // (portrait frames are narrow: allow a little more height so close couples stay near profile)
      const maxV = tight ? (asp < 1 ? 1.28 : 1.05) : 1.3, margin = asp < 1 ? 0.3 : 0.42;
      let V = Math.min(maxV, Math.max(tight ? 0.8 : 1.0, Math.abs(A.y - B.y) + 0.62) * (asp < 1 ? 1.08 : 1));
      // angle off the perpendicular so both heads fit side by side (0.35 = gentle three-quarter)
      let theta = 0.35;
      for (;;) {
        const need = (V * asp - margin) / s;
        if (need >= Math.cos(0.35)) { theta = 0.35; break; }
        theta = Math.acos(Math.max(0, Math.min(1, need)));
        if (theta <= 1.0 || V >= maxV) break;
        V = Math.min(maxV, V + 0.08);
      }
      // too far apart for a narrow (portrait) frame: over-the-shoulder on her face instead;
      // close together (kiss, hug): a steeper three-quarter that still shows both faces
      if (theta > 1.05 && s > 0.7) return cams.over(a, b, { dur, fov: fov - 2 });
      theta = Math.min(theta, s < 0.7 ? 0.9 : 1.15);
      const d = V / (2 * tanH);
      const dir = new THREE.Vector3().copy(n).multiplyScalar(Math.cos(theta)).addScaledVector(axis, -Math.sin(theta));
      const position = new THREE.Vector3().copy(mid).addScaledVector(dir, d);
      position.y = mid.y + 0.1 + d * 0.06;
      const target = new THREE.Vector3(mid.x, mid.y - V * 0.12, mid.z);
      const live = () => { headOf(a, _la); headOf(b, _lb); return _lt.addVectors(_la, _lb).multiplyScalar(0.5).setY((_la.y + _lb.y) / 2 - V * 0.12); };
      return go({ position, target, fov }, dur, true, live);
    },

    /**
     * Full two-shot for the feet actions (massage / kiss / lick her feet): side-on, both of them head to
     * toe, so what he does is clearly visible together with both faces. A medium-wide shot of the whole
     * pair, never a close-up of the foot.
     */
    full(a, b, { dur = 1.1, fov = 32 } = {}) {
      const A = headOf(a), B = headOf(b);
      const oa = (a?.object || a)?.position, ob = (b?.object || b)?.position;
      const floor = Math.min(oa?.y ?? A.y - 1.4, ob?.y ?? B.y - 1.4);
      const top = Math.max(A.y, B.y) + 0.22;
      const axis = new THREE.Vector3(B.x - A.x, 0, B.z - A.z);
      let s = axis.length();
      if (s < 0.05) { const f = (b?.object || b)?.rotation?.y || 0; axis.set(Math.sin(f), 0, Math.cos(f)); s = 0.05; }
      axis.normalize();
      const n = new THREE.Vector3(-axis.z, 0, axis.x);
      const mid = new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5);
      const sign = tmp.subVectors(ctx.camera.position, mid).dot(n) >= 0 ? 1 : -1;
      n.multiplyScalar(sign);
      const asp = aspect(), tanH = Math.tan((fov * D2R) / 2);
      const V = (top - floor) + 0.3, H = s + 1.1;
      const d = Math.max(V / (2 * tanH), H / asp / (2 * tanH)) * 1.04;
      // slightly towards her side (her face opens to the lens), a little from above
      const dir = new THREE.Vector3().copy(n).multiplyScalar(Math.cos(0.22)).addScaledVector(axis, Math.sin(0.22));
      const cy = (top + floor) / 2;
      const position = new THREE.Vector3().copy(mid).addScaledVector(dir, d);
      position.y = cy + 0.35 + d * 0.12;
      const target = new THREE.Vector3(mid.x, cy, mid.z);
      const live = () => { headOf(a, _la); headOf(b, _lb); return _lt.addVectors(_la, _lb).multiplyScalar(0.5).setY(cy); };
      return go({ position, target, fov }, dur, true, live);
    },

    /** Her face over his shoulder (good for her lines on portrait screens). */
    over(a, b, { dur = 0.9, fov = 28 } = {}) {
      const A = headOf(a), B = headOf(b);
      const axis = new THREE.Vector3(B.x - A.x, 0, B.z - A.z); if (axis.lengthSq() < 1e-4) axis.set(0, 0, 1); axis.normalize();
      const n = new THREE.Vector3(-axis.z, 0, axis.x);
      const sign = tmp.subVectors(ctx.camera.position, A).dot(n) >= 0 ? 1 : -1;
      // far enough to the side that his head only edges into the frame and her face stays clear
      const narrow = aspect() < 1;
      // (portrait: big Sun/Moon heads need a wider angle, his head just grazes the frame edge)
      const position = new THREE.Vector3().copy(A).addScaledVector(axis, narrow ? -1.0 : -1.05).addScaledVector(n, (narrow ? 1.1 : 0.62) * sign);
      position.y = A.y + 0.12;
      const target = new THREE.Vector3(B.x, B.y - 0.1, B.z).addScaledVector(n, narrow ? 0 : -0.1 * sign);
      const nn = n.clone().multiplyScalar(narrow ? 0 : -0.1 * sign);
      const live = () => { headOf(b, _lt); _lt.y -= 0.1; return _lt.add(nn); };
      return go({ position, target, fov }, dur, true, live);
    },

    /** From above the bed: two heads on the pillows, blanket up to the shoulders. */
    top(a, b, facing = 0, { dur = 1.4 } = {}) {
      const A = headOf(a), B = headOf(b);
      const c = new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5);
      const foot = new THREE.Vector3(-Math.sin(facing), 0, -Math.cos(facing));
      const side = new THREE.Vector3(foot.z, 0, -foot.x);
      // landscape: close, from above the blanket towards the pillows; portrait (narrow frame): higher up, so
      // both faces fit side by side and the frame shows the cosy bed under the blanket and the candles
      const narrow = aspect() < 1;
      const position = new THREE.Vector3().copy(c).addScaledVector(foot, narrow ? 1.05 : 0.62).addScaledVector(side, narrow ? 0.12 : 0.18);
      position.y = c.y + (narrow ? 2.75 : 1.3);
      const target = new THREE.Vector3().copy(c).addScaledVector(foot, 0.12);
      target.y = c.y - 0.05;
      return go({ position, target, fov: narrow ? 38 : 36 }, dur);
    },

    /** Establishing three-quarter shot of a set (props + both, from a distance). */
    wide(center, yaw = 0, { dist = 4.6, height = 2.0, fov = 34, dur = 1.4, side = 1 } = {}) {
      const a = yaw + side * 0.75 + Math.PI;
      const position = new THREE.Vector3(center.x + Math.sin(a) * dist, center.y + height, center.z + Math.cos(a) * dist);
      const target = new THREE.Vector3(center.x, center.y + 0.9, center.z);
      return go({ position, target, fov }, dur);
    },

    /** Behind the two of them, looking out at the view (sunset over the sea / the town). */
    panorama(a, b, viewYaw, { dur = 2.2 } = {}) {
      // a narrow portrait frame cannot hold both from behind without showing them below the waist:
      // there the faces two-shot is used (the view stays in the background)
      if (aspect() < 1) return cams.two(a, b, { dur: Math.min(dur, 1.4) });
      const A = headOf(a), B = headOf(b);
      const mid = new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5);
      const fwd = new THREE.Vector3(Math.sin(viewYaw), 0, Math.cos(viewYaw));
      // behind them, long lens: heads and shoulders in the lower frame, the view above (bottom edge ≈ waist)
      const position = new THREE.Vector3().copy(mid).addScaledVector(fwd, -2.9);
      position.y = mid.y + 0.12;
      const target = new THREE.Vector3().copy(mid).addScaledVector(fwd, 20); target.y = position.y;
      return go({ position, target, fov: 22 }, dur);
    },

    /** Side tracking shot that follows a moving object (scooter ride). */
    ride(obj, { radius = 4.6, height = 1.5 } = {}) {
      token++;
      const f = obj.rotation.y;
      const p = obj.position;
      return rig().shot({ position: new THREE.Vector3(p.x + Math.cos(f) * radius, p.y + height, p.z - Math.sin(f) * radius), target: new THREE.Vector3(p.x, p.y + 0.9, p.z), fov: 36 }, { dur: 0.9 })
        .then(() => rig().orbit(obj, { radius, height: height + 0.4, speed: 0.04 }));
    },

    async release() { token++; await rig().release({ dur: 1.0 }); },
  };
  return cams;
}
