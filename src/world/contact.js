// Contact shadows: a soft, cool ambient-occlusion blob under every human (one instanced draw call).
// The real shadow map gives the directional shadow; this grounds the feet (no "floating" characters)
// even under shade, indoors and at night, like SSAO would. Fades out when a body is above the ground
// (sitting on a bench, lying on a bed, riding) so it never shows a disc in mid air.
import * as THREE from 'three';

const MAX = 64;

/**
 * @param {any} ctx
 * @param {{groundY:(x:number,z:number)=>number}} world
 */
export function createContactShadows(ctx, world) {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#1e1a3a') }, uOpacity: { value: 0.5 } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying float vA;
      void main(){
        vUv = uv;
        #ifdef USE_INSTANCING_COLOR
          vA = instanceColor.r;
        #else
          vA = 1.0;
        #endif
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity;
      varying vec2 vUv; varying float vA;
      void main(){
        vec2 q = (vUv - 0.5) * 2.0;
        float d = length(q * vec2(1.0, 1.15));
        float a = 1.0 - smoothstep(0.15, 1.0, d);
        a = a * a * (0.6 + 0.4 * (1.0 - smoothstep(0.0, 0.45, d)));   // dense core under the feet, soft falloff
        gl_FragColor = vec4(uColor, a * vA * uOpacity);
      }`,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.name = 'contact-shadows'; mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.count = 0;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
  ctx.scene.add(mesh);

  let humans = null;
  import('../actors/human-api.js').then(m => { humans = m.HUMANS || null; }).catch(() => {});
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();

  function* sources() {
    if (humans) { for (const h of humans) yield h.object; return; }
    if (ctx.player?.object) yield ctx.player.object;
    const map = ctx.actors?.npcs;
    if (map) for (const n of map.values()) { const o = n.object || n.human?.object; if (o) yield o; }
  }
  const visibleUp = o => { for (let x = o; x; x = x.parent) { if (!x.visible) return false; if (x === ctx.scene) return true; } return false; };

  return {
    object: mesh,
    update() {
      let n = 0;
      const night = ctx.time?.lighting?.().night || 0;
      mat.uniforms.uOpacity.value = 0.5 - 0.12 * night;
      const cam = ctx.camera.position;
      for (const o of sources()) {
        if (n >= MAX) break;
        if (!o || !visibleUp(o)) continue;
        o.getWorldPosition(p);
        if ((p.x - cam.x) ** 2 + (p.z - cam.z) ** 2 > 70 * 70) continue;
        let gy = world.groundY?.(p.x, p.z);
        if (!Number.isFinite(gy)) gy = p.y;
        const lift = p.y - gy;
        const k = 1 - THREE.MathUtils.smoothstep(lift, 0.06, 0.7);
        if (k <= 0.02) continue;
        const sc = 0.95 * (o.userData?.contactScale || 1);
        m4.compose(s.set(p.x, gy + 0.03, p.z), q.identity(), p.set(sc, 1, sc));
        mesh.setMatrixAt(n, m4);
        mesh.instanceColor.setX(n, k);
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    },
    dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); },
  };
}
