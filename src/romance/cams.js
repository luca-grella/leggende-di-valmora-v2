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

  function go(spec, dur, drift = true) {
    const my = ++token;
    const p = rig().shot(spec, { dur, ease: dur ? 'inOut' : 'cut' });
    if (drift) p.then(() => {
      if (my !== token) return;
      const to = new THREE.Vector3().copy(spec.position).lerp(spec.target, 0.07);
      const side = new THREE.Vector3().subVectors(spec.target, spec.position).cross(new THREE.Vector3(0, 1, 0)).setLength(0.12);
      to.add(side); to.y += 0.03;
      rig().shot({ position: to, target: spec.target, fov: (spec.fov || 30) - 1 }, { dur: 7 });
    });
    return p;
  }

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
      const maxV = tight ? 1.05 : 1.3, margin = asp < 1 ? 0.3 : 0.42;
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
      theta = Math.min(theta, 1.15);
      const d = V / (2 * tanH);
      const dir = new THREE.Vector3().copy(n).multiplyScalar(Math.cos(theta)).addScaledVector(axis, -Math.sin(theta));
      const position = new THREE.Vector3().copy(mid).addScaledVector(dir, d);
      position.y = mid.y + 0.1 + d * 0.06;
      const target = new THREE.Vector3(mid.x, mid.y - V * 0.12, mid.z);
      return go({ position, target, fov }, dur);
    },

    /** Her face over his shoulder (good for her lines on portrait screens). */
    over(a, b, { dur = 0.9, fov = 28 } = {}) {
      const A = headOf(a), B = headOf(b);
      const axis = new THREE.Vector3(B.x - A.x, 0, B.z - A.z); if (axis.lengthSq() < 1e-4) axis.set(0, 0, 1); axis.normalize();
      const n = new THREE.Vector3(-axis.z, 0, axis.x);
      const sign = tmp.subVectors(ctx.camera.position, A).dot(n) >= 0 ? 1 : -1;
      // far enough to the side that his head only edges into the frame and her face stays clear
      const narrow = aspect() < 1;
      const position = new THREE.Vector3().copy(A).addScaledVector(axis, narrow ? -1.2 : -1.05).addScaledVector(n, (narrow ? 0.8 : 0.62) * sign);
      position.y = A.y + 0.12;
      const target = new THREE.Vector3(B.x, B.y - 0.1, B.z).addScaledVector(n, -0.1 * sign);
      return go({ position, target, fov }, dur);
    },

    /** From above the bed: two heads on the pillows, blanket up to the shoulders. */
    top(a, b, facing = 0, { dur = 1.4 } = {}) {
      const A = headOf(a), B = headOf(b);
      const c = new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5);
      const foot = new THREE.Vector3(-Math.sin(facing), 0, -Math.cos(facing));
      const side = new THREE.Vector3(foot.z, 0, -foot.x);
      const position = new THREE.Vector3().copy(c).addScaledVector(foot, 0.62).addScaledVector(side, 0.18);
      position.y = c.y + 1.3;
      const target = new THREE.Vector3().copy(c).addScaledVector(foot, 0.12);
      target.y = c.y - 0.05;
      return go({ position, target, fov: 36 }, dur);
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
      const A = headOf(a), B = headOf(b);
      const mid = new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5);
      const fwd = new THREE.Vector3(Math.sin(viewYaw), 0, Math.cos(viewYaw));
      const position = new THREE.Vector3().copy(mid).addScaledVector(fwd, -2.1);
      position.y = mid.y + 0.35;
      const target = new THREE.Vector3().copy(mid).addScaledVector(fwd, 20); target.y = mid.y - 0.8;
      return go({ position, target, fov: 42 }, dur);
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
