// Body collisions between people (player, NPCs, battle trainers, scene actors): every standing human is a
// vertical capsule (radius = shoulders + arms of its body, see Human.radius). Each frame, after everyone moved:
//   - overlapping bodies are pushed apart, always through world.resolveMove (nobody is shoved into a wall,
//     a tree or a prop): whoever is walking gives way to whoever stands; two walkers share the push; seated,
//     kneeling or lying people never move;
//   - walkers on an autopilot (moveTo) steer around the people in front of them before touching (steer()).
// Pair-staged humans (stagePair) are excluded: their spacing is solved by pairs.js with a body-contact solver.
// The world colliders themselves (walls, furniture, trees, props) are resolved by world.resolveMove in the
// movers (Human._step, player controller).
//   createBodies(ctx, HUMANS) → {update(dt), steer(h, wantAngle, dist), near(x, z, r, except?), findFree(x, z, r, opts), list}
import * as THREE from 'three';

const wrap = a => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };

export function createBodies(ctx, HUMANS) {
  const list = [];
  const _v = new THREE.Vector3();

  const active = (h) => h.collide !== false && h.object.parent && h.object.visible && !h._pair && !h._mounted;
  const isPlayer = (h) => ctx.player?.human === h;
  /** 0 = immovable (seated, lying, scripted cut), 1 = fully movable */
  const mobility = (h) => {
    if (h.grounded) return 0;
    if (isPlayer(h)) return ctx.player.vehicle ? 0 : (ctx.player.speed > 0.05 ? 1 : 0.35);
    return h._speed > 0.05 ? 1 : 0.35;
  };
  const inside = (h) => !!ctx.world?.colliders?.blocked?.(h.object.position.x, h.object.position.z, 0.05);
  const shove = (h, dx, dz) => {
    const o = h.object.position, r = Math.max(0.28, h.radius);
    const to = { x: o.x + dx, z: o.z + dz };
    const q = ctx.world?.resolveMove?.({ x: o.x, z: o.z }, to, r) || to;
    o.x = q.x; o.z = q.z;
  };

  function gather() {
    list.length = 0;
    const P = ctx.player?.object?.position || ctx.camera?.position;
    for (const h of HUMANS) {
      if (!active(h)) continue;
      if (P && (Math.abs(h.object.position.x - P.x) > 30 || Math.abs(h.object.position.z - P.z) > 30)) continue;
      list.push(h);
    }
    return list;
  }

  function update(dt) {
    gather();
    const n = list.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const A = list[i], B = list[j], a = A.object.position, b = B.object.position;
      if (Math.abs(a.y - b.y) > 1.2) continue;
      const min = A.radius + B.radius;
      let dx = a.x - b.x, dz = a.z - b.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-4) { const f = A.facing; dx = Math.sin(f); dz = Math.cos(f); } else { dx /= d; dz /= d; }
      let ma = mobility(A), mb = mobility(B);
      // a walker never shoves someone standing still (clerks behind counters, people chatting): it slides round them
      if (ma === 1 && mb < 1) mb = 0; else if (mb === 1 && ma < 1) ma = 0;
      // someone placed inside furniture on purpose (behind a counter) is never moved
      if (ma < 1 && inside(A)) ma = 0;
      if (mb < 1 && inside(B)) mb = 0;
      if (ma + mb <= 0) continue;
      let push = min - d;
      // two people standing still that overlap (placed by a script): separate gently, no pop
      if (ma < 1 && mb < 1) push = Math.min(push, 0.6 * dt);
      const ka = ma / (ma + mb);
      if (ka > 0) shove(A, dx * push * ka, dz * push * ka);
      if (ka < 1) shove(B, -dx * push * (1 - ka), -dz * push * (1 - ka));
    }
  }

  /**
   * Avoidance for autopilot walkers: bend the wanted heading away from people ahead (within ~1.6 m, ±70°).
   * Returns the adjusted angle.
   */
  function steer(h, want, dist) {
    const p = h.object.position;
    let best = null, bestScore = 0;
    for (const o of HUMANS) {
      if (o === h || !active(o) || o === h._partner) continue;
      const q = o.object.position;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d > 1.7 || d < 1e-3 || d > dist + 0.3) continue;
      const ang = wrap(Math.atan2(dx, dz) - want);
      if (Math.abs(ang) > 1.2) continue;
      const clear = h.radius + o.radius + 0.12;
      const lateral = Math.abs(Math.sin(ang)) * d;                   // how far off our line they are
      if (lateral > clear) continue;
      const score = (1 - d / 1.7) * (1 - lateral / clear);
      if (score > bestScore) { bestScore = score; best = { ang, d, o }; }
    }
    if (!best) return want;
    // go round on the side they are not on (prefer the right, like people do)
    const side = best.ang > 0.05 ? -1 : best.ang < -0.05 ? 1 : -1;
    return want + side * Math.min(1.0, 0.35 + bestScore * 0.9);
  }

  /** Humans within r of x,z (optionally excluding one). */
  function near(x, z, r, except = null) {
    const out = [];
    for (const h of HUMANS) {
      if (h === except || !h.object.parent || !h.object.visible) continue;
      const q = h.object.position;
      if ((q.x - x) ** 2 + (q.z - z) ** 2 <= r * r) out.push(h);
    }
    return out;
  }

  /**
   * A free spot near x,z for a body of radius r (no world collider, nobody else there): spiral search.
   * opts {except: Human[], maxDist=1.5, people=true}. Returns {x, z, moved}.
   */
  function findFree(x, z, r = 0.3, { except = [], maxDist = 1.5, people = true } = {}) {
    const C = ctx.world?.colliders;
    const ok = (px, pz) => {
      if (C?.blocked && C.blocked(px, pz, r)) return false;
      if (ctx.world?.walkable && !ctx.world.walkable(px, pz)) return false;
      if (people) for (const h of HUMANS) {
        if (except.includes(h) || !active(h)) continue;
        const q = h.object.position, m = r + h.radius;
        if ((q.x - px) ** 2 + (q.z - pz) ** 2 < m * m) return false;
      }
      return true;
    };
    if (ok(x, z)) return { x, z, moved: false };
    for (let ring = 1; ring * 0.12 <= maxDist; ring++) {
      const R = ring * 0.12, N = 6 + ring * 3;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const px = x + Math.sin(a) * R, pz = z + Math.cos(a) * R;
        if (ok(px, pz)) return { x: px, z: pz, moved: true };
      }
    }
    return { x, z, moved: false };
  }

  return { update, steer, near, findFree, get list() { return list; }, _v };
}
