// Prova realistica: due personaggi MakeHuman (CC0) in un salotto serale, posa procedurale + IK.
import * as THREE from 'three';
import { GLTFLoader } from './lib/GLTFLoader.js';
import { RoundedBoxGeometry } from './lib/RoundedBoxGeometry.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion;
const DUR = 36;                                  // scene length (s), then loops
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, params.has('dpr') ? +params.get('dpr') : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a120c);
scene.fog = new THREE.Fog(0x1a120c, 7, 14);
const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 40);

// ---------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(0xffd9b0, 0x2a1a10, 0.35); scene.add(hemi);
const lampPos = new V3(-1.55, 1.55, -0.55);
const key = new THREE.SpotLight(0xffb36b, 34, 9, 0.95, 0.85, 1.6);   // floor-lamp key light
key.position.copy(lampPos).add(new V3(0.05, -0.08, 0.1));
key.target.position.set(0.0, 0.55, 0.25); scene.add(key, key.target);
key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
key.shadow.camera.near = 0.2; key.shadow.camera.far = 6;
const glow = new THREE.PointLight(0xffa860, 3.2, 3.2, 1.8); glow.position.copy(lampPos); scene.add(glow);
const fill = new THREE.PointLight(0xffc690, 2.6, 7, 1.6); fill.position.set(1.7, 1.25, 1.6); scene.add(fill);       // table lamp, right
const rim = new THREE.DirectionalLight(0x8fa6d8, 0.35); rim.position.set(1.5, 2.2, -3); scene.add(rim);             // cool window light
const candle = new THREE.PointLight(0xff9a50, 0.9, 2.2, 2); candle.position.set(1.42, 0.78, 0.2); scene.add(candle);

// ---------------------------------------------------------------- room
const texL = new THREE.TextureLoader();
const tex = (f, rep, srgb = true) => { const t = texL.load(f); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const room = new THREE.Group(); scene.add(room);
{
  const floorM = new THREE.MeshStandardMaterial({ map: tex('assets/tex/floor_diff.jpg', [3, 3]), normalMap: tex('assets/tex/floor_nor.jpg', [3, 3], false), color: 0x9a7356, roughness: 0.62 });
  floorM.normalScale.set(0.6, 0.6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), floorM); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; room.add(floor);
  const wallM = new THREE.MeshStandardMaterial({ map: tex('assets/tex/wall_diff.jpg', [3, 1.2]), color: 0xd9b48f, roughness: 0.95 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.2), wallM); back.position.set(0, 1.6, -1.25); back.receiveShadow = true; room.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), wallM); left.position.set(-3.2, 1.6, 1.5); left.rotation.y = Math.PI / 2; left.receiveShadow = true; room.add(left);
  // skirting board
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(9, 0.1, 0.02), new THREE.MeshStandardMaterial({ color: 0xefe3d0, roughness: 0.6 })); skirt.position.set(0, 0.05, -1.24); room.add(skirt);
  // window with night sky + curtains (right side of the back wall)
  const sky = document.createElement('canvas'); sky.width = 64; sky.height = 128; const g = sky.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#0d1530'); gr.addColorStop(0.7, '#25335e'); gr.addColorStop(1, '#4a4a6e'); g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(255,${200 + Math.random() * 55 | 0},150,${0.3 + Math.random() * 0.6})`; g.fillRect(Math.random() * 64, 80 + Math.random() * 40, 1.5, 1.5); }
  const skyT = new THREE.CanvasTexture(sky); skyT.colorSpace = THREE.SRGBColorSpace;
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), new THREE.MeshBasicMaterial({ map: skyT })); win.position.set(1.75, 1.55, -1.24); room.add(win);
  const frameM = new THREE.MeshStandardMaterial({ color: 0xf2eadf, roughness: 0.5 });
  for (const [w, h, x, y] of [[1.2, 0.06, 0, 0.78], [1.2, 0.06, 0, -0.78], [0.06, 1.6, 0.58, 0], [0.06, 1.6, -0.58, 0], [0.04, 1.5, 0, 0]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), frameM); b.position.set(1.75 + x, 1.55 + y, -1.22); room.add(b); }
  const curtM = new THREE.MeshStandardMaterial({ color: 0x7a3b2e, roughness: 0.95, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    const cg = new THREE.PlaneGeometry(0.5, 2.3, 24, 1); const p = cg.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 28) * 0.035);
    cg.computeVertexNormals(); const c = new THREE.Mesh(cg, curtM); c.position.set(1.75 + sx * 0.78, 1.45, -1.17); c.castShadow = true; c.receiveShadow = true; room.add(c);
  }
  // framed picture above the sofa (warm abstract landscape)
  const pc = document.createElement('canvas'); pc.width = 256; pc.height = 160; const p2 = pc.getContext('2d');
  const pg = p2.createLinearGradient(0, 0, 0, 160); pg.addColorStop(0, '#e9b77a'); pg.addColorStop(0.55, '#c9785a'); pg.addColorStop(1, '#5e4a5a'); p2.fillStyle = pg; p2.fillRect(0, 0, 256, 160);
  p2.fillStyle = '#f6dca0'; p2.beginPath(); p2.arc(180, 62, 18, 0, 7); p2.fill();
  p2.fillStyle = '#3e3a4c'; p2.beginPath(); p2.moveTo(0, 125); for (let x = 0; x <= 256; x += 16) p2.lineTo(x, 112 - Math.sin(x / 30) * 14 - Math.sin(x / 11) * 4); p2.lineTo(256, 160); p2.lineTo(0, 160); p2.fill();
  const picT = new THREE.CanvasTexture(pc); picT.colorSpace = THREE.SRGBColorSpace;
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.62), new THREE.MeshStandardMaterial({ map: picT, roughness: 0.8 })); pic.position.set(-0.15, 1.72, -1.215); room.add(pic);
  const pf = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.7, 0.03), new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.5 })); pf.position.set(-0.15, 1.72, -1.235); room.add(pf);
  // rug
  const rugC = document.createElement('canvas'); rugC.width = 256; rugC.height = 160; const r2 = rugC.getContext('2d');
  r2.fillStyle = '#b9a58a'; r2.fillRect(0, 0, 256, 160); r2.strokeStyle = '#8a5a44'; r2.lineWidth = 6; r2.strokeRect(10, 10, 236, 140); r2.lineWidth = 2; r2.strokeRect(22, 22, 212, 116);
  for (let i = 0; i < 4000; i++) { r2.fillStyle = `rgba(${90 + Math.random() * 60 | 0},${70 + Math.random() * 40 | 0},50,0.08)`; r2.fillRect(Math.random() * 256, Math.random() * 160, 2, 2); }
  const rugT = new THREE.CanvasTexture(rugC); rugT.colorSpace = THREE.SRGBColorSpace;
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.9), new THREE.MeshStandardMaterial({ map: rugT, roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.006, 0.75); rug.receiveShadow = true; room.add(rug);
}

// ---------------------------------------------------------------- sofa
const SEAT = 0.45;                               // top of the seat cushions
const sofa = new THREE.Group(); room.add(sofa);
{
  const fabric = new THREE.MeshPhysicalMaterial({ color: 0x5d6b5c, roughness: 0.92, sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x9fae98) });
  const add = (w, h, d, x, y, z, r = 0.05, m = fabric) => { const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; sofa.add(b); return b; };
  add(2.3, 0.26, 0.92, 0, 0.21, -0.72 + 0.46, 0.04);                      // base
  add(1.0, 0.13, 0.7, -0.51, SEAT - 0.065, -0.05, 0.06);                  // seat cushions
  add(1.0, 0.13, 0.7, 0.51, SEAT - 0.065, -0.05, 0.06);
  add(2.3, 0.62, 0.2, 0, 0.62, -0.62, 0.07);                              // back frame
  const bc1 = add(1.0, 0.44, 0.18, -0.51, 0.7, -0.48, 0.08); bc1.rotation.x = -0.12;   // back cushions
  const bc2 = add(1.0, 0.44, 0.18, 0.51, 0.7, -0.48, 0.08); bc2.rotation.x = -0.12;
  add(0.18, 0.3, 0.92, -1.06, 0.5, -0.26, 0.07);                          // arm rests
  add(0.18, 0.3, 0.92, 1.06, 0.5, -0.26, 0.07);
  const pil = new THREE.MeshPhysicalMaterial({ color: 0xc98f5a, roughness: 0.9, sheen: 0.6, sheenColor: new THREE.Color(0xf0c08a) });
  const p1 = add(0.16, 0.42, 0.46, -0.9, 0.66, -0.12, 0.08, pil); p1.rotation.z = 0.35;   // her back pillow
  const p2 = add(0.14, 0.36, 0.36, 0.86, 0.62, -0.38, 0.08, new THREE.MeshPhysicalMaterial({ color: 0xa04e3c, roughness: 0.9, sheen: 0.5 })); p2.rotation.z = -0.25;
  const legM = new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.5 });
  for (const x of [-1.08, 1.08]) for (const z of [-0.66, 0.14]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.08, 10), legM); l.position.set(x, 0.04, z); sofa.add(l); }
  // throw blanket over the left arm rest
  const tb = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.04, 0.7, 2, 0.02), new THREE.MeshStandardMaterial({ color: 0xe7dcc8, roughness: 1 })); tb.position.set(-1.06, 0.665, -0.2); tb.castShadow = tb.receiveShadow = true; sofa.add(tb);
}
// floor lamp (left, behind the sofa)
{
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.35, metalness: 0.8 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 12), metal); pole.position.set(lampPos.x, 0.75, lampPos.z); room.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 24), metal); base.position.set(lampPos.x, 0.015, lampPos.z); room.add(base);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.26, 0.32, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0xffe2b8, emissive: 0xffa95a, emissiveIntensity: 1.6, side: THREE.DoubleSide, roughness: 1 }));
  shade.position.copy(lampPos).add(new V3(0, 0.04, 0)); room.add(shade);
  // side table + table lamp + candle (right)
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3122, roughness: 0.45 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 32), wood); top.position.set(1.55, 0.6, 0.15); top.castShadow = top.receiveShadow = true; room.add(top);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.6, 12), wood); leg.position.set(1.55, 0.3, 0.15); room.add(leg);
  const tl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.2, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xfff0d8, emissive: 0xffb070, emissiveIntensity: 1.3, side: THREE.DoubleSide }));
  tl.position.set(1.62, 0.98, 0.05); room.add(tl);
  const tlb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.3 })); tlb.position.set(1.62, 0.7, 0.05); room.add(tlb);
  fill.position.set(1.62, 0.98, 0.05);
  const cand = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0xf5ecd8, roughness: 0.7, emissive: 0x402010 })); cand.position.set(1.42, 0.675, 0.24); room.add(cand);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd08a })); flame.scale.y = 1.8; flame.position.set(1.42, 0.755, 0.24); room.add(flame);
  room.userData.flame = flame;
  // plant (left corner)
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.36, 20), new THREE.MeshStandardMaterial({ color: 0xc7b49a, roughness: 0.8 })); pot.position.set(-2.2, 0.18, -0.85); room.add(pot);
  const leafM = new THREE.MeshStandardMaterial({ color: 0x3d5a32, roughness: 0.7, side: THREE.DoubleSide });
  for (let i = 0; i < 14; i++) {
    const lf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI), leafM); const a = i * 2.4;
    lf.scale.set(0.35, 1, 0.12); lf.position.set(-2.2 + Math.cos(a) * 0.16, 0.6 + (i % 5) * 0.12, -0.85 + Math.sin(a) * 0.16);
    lf.rotation.set(Math.sin(a) * 0.6, a, Math.cos(a) * 0.6); lf.castShadow = true; room.add(lf);
  }
}

// ---------------------------------------------------------------- characters
const loader = new GLTFLoader();
function prepCharacter(gltf) {
  const root = gltf.scene; const B = {}; const meshes = [];
  root.traverse(o => {
    if (o.isBone) B[o.name] = o;
    if (o.isSkinnedMesh) {
      meshes.push(o); o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
      const m = o.material; m.envMapIntensity = 0.6;
      if (o.name === 'hair' || o.name === 'eyebrows' || o.name === 'eyelashes') { m.alphaToCoverage = true; m.side = THREE.DoubleSide; if (o.name !== 'hair') o.castShadow = false; }
      if (o.name === 'eyes') { m.roughness = 0.12; o.castShadow = false; }
      if (o.name === 'body') { m.roughness = 0.52; m.sheen = 0; m.emissive = new THREE.Color(0x2a0d06); m.emissiveIntensity = 0.25; }
    }
  });
  const up0 = (n) => {
    if (/Arm|ForeArm/.test(n)) return new V3(0, 0, -1);
    if (/Hand$/.test(n)) return new V3(0, -1, 0);
    if (/Foot|Toe/.test(n)) return new V3(0, 1, 0);
    if (/Eye/.test(n)) return new V3(0, 1, 0);
    return new V3(0, 0, 1);
  };
  for (const [n, b] of Object.entries(B)) {
    const h = new V3().fromArray(b.userData.head), t = new V3().fromArray(b.userData.tail);
    b.userData.h0 = h; b.userData.dir0 = t.clone().sub(h).normalize(); b.userData.up0 = up0(n);
    b.userData.rest = new Q();
  }
  for (const b of Object.values(B)) for (const c of b.children) if (c.isBone) c.userData.seg = c.userData.h0.distanceTo(b.userData.h0);
  scene.add(root);
  const morph = (name, v) => { for (const m of meshes) { const i = m.morphTargetDictionary?.[name]; if (i !== undefined) m.morphTargetInfluences[i] = v; } };
  return { root, B, meshes, morph };
}

// ---------------------------------------------------------------- pose helpers
const _m4 = new THREE.Matrix4();
function frameQ(d, u, out = new Q()) {
  const x = d.clone().normalize(); const z = new V3().crossVectors(x, u); if (z.lengthSq() < 1e-8) z.set(0, 0, 1); z.normalize();
  const y = new V3().crossVectors(z, x); _m4.makeBasis(x, y, z); return out.setFromRotationMatrix(_m4);
}
function setWorld(bone, W) { const pq = bone.parent.getWorldQuaternion(new Q()); bone.quaternion.copy(pq.invert().multiply(W)); bone.updateMatrixWorld(true); }
function aimQ(bone, dir, up) { const u = bone.userData; return frameQ(dir, up).multiply(frameQ(u.dir0, u.up0).invert()); }
function aim(bone, dir, up) { setWorld(bone, aimQ(bone, dir, up)); }
const wpos = (b) => b.getWorldPosition(new V3());
const wquat = (b) => b.getWorldQuaternion(new Q());
function ik2(a, b, c, target, pole, upB) {
  const A = wpos(a); const l1 = b.userData.seg, l2 = c.userData.seg;
  const D = target.clone().sub(A); let d = D.length(); D.normalize(); d = THREE.MathUtils.clamp(d, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.9995);
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d); const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const P = pole.clone(); P.sub(D.clone().multiplyScalar(P.dot(D))).normalize();
  const K = A.clone().addScaledVector(D, x).addScaledVector(P, h); const T = A.clone().addScaledVector(D, d);
  aim(a, K.clone().sub(A), P);
  aim(b, T.clone().sub(K), upB ? upB(T.clone().sub(K).normalize(), P) : P);
  return { K, T, reach: d };
}
// frame of a posed bone, in world: dir (head->tail) and up (rest up rotated)
function boneFrame(b) { const q = wquat(b); return { o: wpos(b), d: b.userData.dir0.clone().applyQuaternion(q), u: b.userData.up0.clone().applyQuaternion(q), q }; }
const ss = (a, b, t) => { const x = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
// piecewise smooth track: keys [[t, v], ...]
function track(keys) { return (t) => { if (t <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) { if (t <= keys[i][0]) { const [t0, v0] = keys[i - 1], [t1, v1] = keys[i]; return v0 + (v1 - v0) * ss(t0, t1, t); } } return keys[keys.length - 1][1]; }; }
const lerpV = (a, b, t) => a.clone().lerp(b, t);
const nrm = (x, y, z) => new V3(x, y, z).normalize();
const noise = (t, s) => Math.sin(t * 0.71 + s) * 0.6 + Math.sin(t * 1.37 + s * 2.1) * 0.3 + Math.sin(t * 2.9 + s * 3.7) * 0.1;

// measure a body region in a bone's rest frame (for contact points)
function measure(ch, boneName, minW = 0.5) {
  const body = ch.meshes.find(m => m.name === 'body'); const g = body.geometry; const bi = body.skeleton.bones.findIndex(b => b.name === boneName);
  const pos = g.attributes.position, sk = g.attributes.skinIndex, sw = g.attributes.skinWeight; const b = ch.B[boneName].userData;
  const X = b.dir0.clone(), Y = b.up0.clone().sub(X.clone().multiplyScalar(b.up0.dot(X))).normalize(), Z = new V3().crossVectors(X, Y);
  const pts = [];
  for (let i = 0; i < pos.count; i++) {
    let w = 0; for (let k = 0; k < 4; k++) if (sk.getComponent(i, k) === bi) w += sw.getComponent(i, k);
    if (w < minW) continue;
    const p = new V3().fromBufferAttribute(pos, i).sub(b.h0); pts.push([p.dot(X), p.dot(Y), p.dot(Z)]);
  }
  return pts;
}

// ---------------------------------------------------------------- load
const loadEl = document.getElementById('load');
let her, him, footInfo, palmInfo, ready = false;
async function load() {
  const [a, b] = await Promise.all([loader.loadAsync('assets/lei.glb'), loader.loadAsync('assets/lui.glb')]);
  her = prepCharacter(a); him = prepCharacter(b);
  // her right foot geometry (in foot rest frame: x = ankle->toes, y = dorsum normal, z = lateral)
  const fp = measure(her, 'RightFoot', 0.45);
  const xs = fp.map(p => p[0]); const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const slab = (x0, x1) => fp.filter(p => p[0] > x0 && p[0] < x1);
  const mid = slab(xMin + (xMax - xMin) * 0.35, xMin + (xMax - xMin) * 0.6);
  footInfo = {
    xMin, xMax,
    soleY: Math.min(...mid.map(p => p[1])), topY: Math.max(...mid.map(p => p[1])),
    zMin: Math.min(...mid.map(p => p[2])), zMax: Math.max(...mid.map(p => p[2])),
    fore: slab(xMin + (xMax - xMin) * 0.55, xMin + (xMax - xMin) * 0.75),
  };
  footInfo.foreTop = Math.max(...footInfo.fore.map(p => p[1]));
  const hp = measure(him, 'LeftHand', 0.6);
  palmInfo = { palm: Math.max(...hp.map(p => p[1])), back: Math.min(...hp.map(p => p[1])), len: Math.max(...hp.map(p => p[0])) };
  ready = true;
}

// ---------------------------------------------------------------- choreography
// timeline (s): 0-4 settle, 4-15 massage, 15.5-18.5 she offers the foot, 18-22 kiss, 22-30 look & smile, 30-36 rest/fade
const TL = {
  hands: track([[0, 0], [1.2, 0], [3.4, 1], [33, 1], [35, 0.6]]),
  massage: track([[3, 0], [4.5, 1], [15, 1], [16.5, 0.15], [22.5, 0.15], [24, 0.6], [30, 0.4], [33, 0]]),
  lift: track([[15.2, 0], [18.2, 1], [22.6, 1], [25, 0]]),
  kiss: track([[17.6, 0], [19.6, 1], [21.4, 1], [23.0, 0]]),
  herLookHim: track([[0, 0.3], [3, 0.3], [5, 0.15], [10, 0.2], [12.5, 0.8], [15, 0.85], [17, 0.5], [21, 0.4], [23, 1], [33, 1], [35, 0.6]]),
  hisLookHer: track([[0, 1], [2.5, 1], [4.2, 0], [11, 0], [12.5, 0.9], [14.5, 0.9], [15.5, 0], [22.5, 0], [23.6, 1], [33, 1]]),
  herSmile: track([[0, 0.2], [6, 0.3], [8, 0.65], [12, 0.5], [13, 0.9], [15, 0.7], [20, 0.9], [23.5, 1], [30, 0.9], [34, 0.5]]),
  hisSmile: track([[0, 0.3], [12.5, 0.4], [13.5, 0.85], [15, 0.5], [22.5, 0.5], [23.8, 1], [30, 0.9], [34, 0.5]]),
  herEyesHalf: track([[5, 0], [7, 0.55], [10.5, 0.55], [12, 0], [19, 0], [20, 0.45], [22, 0.45], [23, 0]]),
  herRecline: track([[0, 0.9], [6, 1], [12, 1.05], [15, 0.85], [19, 0.75], [23, 0.85], [27, 0.8], [33, 0.95]]),
  fade: (t) => Math.max(1 - ss(0, 1.0, t), ss(DUR - 1.2, DUR, t)),
};

function poseHer(t) {
  const B = her.B; const lift = TL.lift(t); const recl = TL.herRecline(t);
  const f = nrm(1, 0, 0.42);                               // she faces him (+x) and partly the camera
  const side = new V3().crossVectors(new V3(0, 1, 0), f);  // her left
  const breath = Math.sin(t * 2 * Math.PI / 4.6);
  // foot targets in his lap (computed from his rest hips so the two rigs do not fight)
  const lap = HIM.hips.clone();
  const gF = HIM.face, gL = new V3().crossVectors(new V3(0, 1, 0), gF);
  const rightAnkle = lap.clone().addScaledVector(gF, 0.30).addScaledVector(gL, -0.03).add(new V3(0, 0.165, 0));
  const leftAnkle = lap.clone().addScaledVector(gF, 0.08).addScaledVector(gL, -0.16).add(new V3(0, 0.15, 0));
  // offered foot: lifted, pointed, towards his face
  const offer = lap.clone().addScaledVector(gF, 0.3).addScaledVector(gL, -0.05).add(new V3(0, 0.33, 0));
  rightAnkle.lerp(offer, lift);
  rightAnkle.y += noise(t, 1) * 0.004; leftAnkle.y += noise(t, 2) * 0.003;
  // hips: slide so the legs are slightly bent
  const legL = her.B.RightLeg.userData.seg + her.B.RightFoot.userData.seg;
  const hipY = SEAT + 0.105;
  const hipsPos = new V3(rightAnkle.x - legL * 0.86 - 0.02, hipY, 0.0);
  hipsPos.x = Math.min(hipsPos.x, -0.42);
  B.Hips.position.copy(hipsPos).sub(new V3().subVectors(B.Hips.userData.h0, B.Hips.position).multiplyScalar(0)).sub(new V3(0, 0, 0));
  B.Hips.position.copy(hipsPos);
  // pelvis & spine recline
  const back = f.clone().negate();
  const pelvUp = lerpV(new V3(0, 1, 0), back, 0.45 * recl).normalize();
  const chestUp = lerpV(new V3(0, 1, 0), back, (0.9 + breath * 0.02) * recl).normalize();
  const fwd = (up) => f.clone().sub(up.clone().multiplyScalar(f.dot(up))).normalize();
  aim(B.Hips, pelvUp, fwd(pelvUp));
  const sp = [B.Spine, B.Spine1, B.Spine2];
  sp.forEach((b, i) => { const u = lerpV(pelvUp, chestUp, (i + 1) / 3).normalize(); aim(b, u, fwd(u)); });
  // head: look at his face / at her foot
  const head = wpos(B.Head); const hisHead = wpos(him.B.Head).add(new V3(0, 0.08, 0.02));
  const footP = wpos(B.RightFoot);
  const look = lerpV(footP.clone().sub(head).normalize(), hisHead.clone().sub(head).normalize(), TL.herLookHim(t)).normalize();
  look.y += 0.03 + noise(t, 4) * 0.02;
  const neckUp = lerpV(chestUp, new V3(0, 1, 0), 0.55).normalize();
  aim(B.Neck, neckUp, fwd(neckUp).lerp(look, 0.3));
  const headUp = lerpV(neckUp, new V3(0, 1, 0), 0.5).add(side.clone().multiplyScalar(0.12 + noise(t, 7) * 0.03)).normalize();
  const hf = look.clone().sub(headUp.clone().multiplyScalar(look.dot(headUp))).normalize();
  aim(B.Head, headUp, hf);
  aimEyes(her, hisHead.clone().lerp(footP, 1 - TL.herLookHim(t)));
  // legs
  const kneeUp = new V3(0, 1, 0).addScaledVector(side, 0.25);
  const footFrame = (ankle, tPoint, sideSign) => {
    // relaxed: toes up, sole towards him; offered: pointed towards him, dorsum up
    const toesRelax = nrm(0, 1, 0).addScaledVector(f, 0.45).addScaledVector(side, -0.25 * sideSign).normalize();
    const topRelax = f.clone().negate().addScaledVector(new V3(0, 1, 0), 0.4).addScaledVector(side, -0.35 * sideSign).normalize();
    const toesOffer = f.clone().addScaledVector(new V3(0, 1, 0), -0.1).addScaledVector(side, 0.05).normalize();
    const topOffer = nrm(0, 1, 0).addScaledVector(f, 0.15).addScaledVector(side, -0.4).normalize();
    return { d: lerpV(toesRelax, toesOffer, tPoint).normalize(), u: lerpV(topRelax, topOffer, tPoint).normalize() };
  };
  ik2(B.RightUpLeg, B.RightLeg, B.RightFoot, rightAnkle, kneeUp.clone().addScaledVector(side, -0.4).add(new V3(0, lift * 0.3, 0)));
  const fr = footFrame(rightAnkle, lift, 1); aim(B.RightFoot, fr.d, fr.u);
  aim(B.RightToeBase, fr.d.clone().addScaledVector(fr.u, -0.15 * lift), fr.u);
  ik2(B.LeftUpLeg, B.LeftLeg, B.LeftFoot, leftAnkle, kneeUp);
  const fl = footFrame(leftAnkle, 0, -1); aim(B.LeftFoot, fl.d, fl.u); aim(B.LeftToeBase, fl.d, fl.u);
  // arms: right hand resting on her belly, left hand on the pillow / arm rest
  const hp = wpos(B.Hips); const chest = wpos(B.Spine2);
  const rHand = hp.clone().lerp(chest, 0.45).addScaledVector(f, 0.15).addScaledVector(side, -0.07).add(new V3(0, 0.03 + breath * 0.004, 0));
  const lHand = wpos(B.LeftUpLeg).addScaledVector(f, 0.16).addScaledVector(side, 0.04).add(new V3(0, 0.1, 0));
  armIK(her, 'Right', rHand, nrm(0, -1, 0).addScaledVector(f, 0.3), f.clone().addScaledVector(side, 0.6).normalize(), side.clone().negate().add(new V3(0, -0.5, 0)), 0.25);
  armIK(her, 'Left', lHand, nrm(0, -1, 0).addScaledVector(side, -0.2), f.clone().addScaledVector(side, -0.2).normalize(), side.clone().add(new V3(0, -0.6, -0.1)), 0.3);
  her.morph('smile', TL.herSmile(t));
  her.morph('blink', Math.max(TL.herEyesHalf(t), blink(t, 0.3)));
  her.root.updateMatrixWorld(true);
}

const HIM = { hips: new V3(0.5, SEAT + 0.105, -0.02), face: nrm(-0.38, 0, 1) };
function poseHim(t) {
  const B = him.B; const g = HIM.face; const L = new V3().crossVectors(new V3(0, 1, 0), g); // his left
  const breath = Math.sin(t * 2 * Math.PI / 4.1 + 1);
  const kiss = TL.kiss(t); const massage = TL.massage(t); const hands = TL.hands(t);
  B.Hips.position.copy(HIM.hips);
  const toHer = nrm(-1, 0, 0.1);
  const pelvUp = nrm(0, 1, 0).addScaledVector(g, -0.18).normalize();
  const lean = 0.25 + massage * 0.12 + noise(t, 3) * 0.02;
  const chestUp = nrm(0, 1, 0).addScaledVector(g, lean * 0.6).addScaledVector(toHer, lean * 0.5 + 0.05).normalize();
  const fwd = (up, f) => f.clone().sub(up.clone().multiplyScalar(f.dot(up))).normalize();
  const face = g.clone().lerp(toHer, 0.35).normalize();
  aim(B.Hips, pelvUp, fwd(pelvUp, g));
  [B.Spine, B.Spine1, B.Spine2].forEach((b, i) => { const u = lerpV(pelvUp, chestUp, (i + 1) / 3).normalize(); u.y += breath * 0.006 * i; aim(b, u.normalize(), fwd(u, face)); });
  // legs: feet on the floor, knees apart a little
  for (const [s, sg] of [['Left', 1], ['Right', -1]]) {
    const hip = wpos(B[s + 'UpLeg']);
    const ank = hip.clone().addScaledVector(g, 0.43).addScaledVector(L, sg * 0.08); ank.y = 0.085;
    ik2(B[s + 'UpLeg'], B[s + 'Leg'], B[s + 'Foot'], ank, g.clone().addScaledVector(L, sg * 0.25).add(new V3(0, 0.3, 0)));
    aim(B[s + 'Foot'], g.clone().addScaledVector(L, sg * 0.15).add(new V3(0, -0.42, 0)).normalize(), nrm(0, 1, 0).addScaledVector(g, 0.4));
    aim(B[s + 'ToeBase'], g.clone().addScaledVector(L, sg * 0.15).normalize(), new V3(0, 1, 0));
  }
  // her right foot frame (posed already)
  const F = boneFrame(her.B.RightFoot); const Fz = new V3().crossVectors(F.d, F.u).normalize(); const Fy = new V3().crossVectors(Fz, F.d).normalize();
  const fi = footInfo; const span = fi.xMax - fi.xMin;
  const footPt = (x, y, z) => F.o.clone().addScaledVector(F.d, x).addScaledVector(Fy, y).addScaledVector(Fz, z);
  // kiss: bend the spine (CCD) so his mouth reaches the top of her forefoot
  const kissTarget = footPt(fi.xMin + span * 0.66, fi.foreTop + 0.012, 0);
  const headLook = lerpV(wpos(her.B.Head).add(new V3(0, 0.06, 0)), footPt(fi.xMin + span * 0.5, 0, 0), 1 - TL.hisLookHer(t));
  poseHead(him, headLook, chestUp, 0.6, t);
  if (kiss > 0.001) {
    const mouth = () => { const h = boneFrame(B.Head); const fz = h.u; return h.o.clone().addScaledVector(h.d, 0.045).addScaledVector(fz, 0.105); };
    const save = [B.Spine, B.Spine1, B.Spine2, B.Neck, B.Head].map(b => b.quaternion.clone());
    for (let it = 0; it < 10; it++) {
      for (const j of [B.Neck, B.Spine2, B.Spine1, B.Spine]) {
        const J = wpos(j); const e = mouth().sub(J).normalize(); const tg = kissTarget.clone().sub(J).normalize();
        const q = new Q().setFromUnitVectors(e, tg); const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
        const lim = j === B.Neck ? 0.25 : 0.12; if (ang > lim) q.slerp(new Q(), 1 - lim / ang);
        setWorld(j, q.multiply(wquat(j)));
        poseHead(him, kissTarget, null, 1, t, true);
      }
    }
    const solved = [B.Spine, B.Spine1, B.Spine2, B.Neck, B.Head].map(b => b.quaternion.clone());
    [B.Spine, B.Spine1, B.Spine2, B.Neck, B.Head].forEach((b, i) => { b.quaternion.copy(save[i]).slerp(solved[i], kiss); b.updateMatrixWorld(true); });
  }
  aimEyes(him, kiss > 0.5 ? kissTarget : headLook);
  // hands on her foot: palms on the sides of the foot, fingers wrapping over the top, thumbs on the sole
  const m = massage * hands;
  const slideL = Math.sin(t * 2.3) * 0.012 * m, slideR = Math.sin(t * 2.3 + 1.9) * 0.012 * m;
  const gap = 0.006;
  const sides = { Left: fi.zMax, Right: fi.zMin };          // his left hand on +z of her foot frame
  for (const [s, sg] of [['Left', 1], ['Right', -1]]) {
    const zSide = sides[s] + sg * (gap + 0.002);
    const xAlong = fi.xMin + span * (s === 'Left' ? 0.46 : 0.3) + (s === 'Left' ? slideL : slideR) - 0.03 * TL.lift(t);
    const yMid = fi.soleY * 0.55 + fi.topY * 0.2;
    const contact = footPt(xAlong, yMid, zSide);
    const palmN = Fz.clone().multiplyScalar(-sg).addScaledVector(Fy, 0.25).normalize();   // pointing into the foot
    const handDir = Fy.clone().addScaledVector(F.d, -0.15 * sg).addScaledVector(Fz, -0.1 * sg).normalize(); // towards her (over the top)
    // wrist position from the palm contact: palm centre sits ~0.045 along the hand and palmInfo.palm below the bone
    const hd = handDir.clone().sub(palmN.clone().multiplyScalar(handDir.dot(palmN))).normalize();
    let wrist = contact.clone().addScaledVector(palmN, -(palmInfo.palm + 0.002)).addScaledVector(hd, -0.045);
    // hands rest on his thighs before reaching
    const restW = wpos(B[s + 'UpLeg']).addScaledVector(g, 0.25).add(new V3(0, 0.1, 0)).addScaledVector(L, sg * 0.03);
    wrist = restW.lerp(wrist, hands);
    const pn = new V3(0, -1, 0).lerp(palmN, hands).normalize(); const hdd = g.clone().lerp(hd, hands).normalize();
    armIK(him, s, wrist, pn, hdd, L.clone().multiplyScalar(sg).add(new V3(0, -0.6, 0)).addScaledVector(g, -0.4), 0.4);
    // fingers: curl around the top; thumb pressing on the sole in small circles
    const curl = 0.35 + 0.25 * hands + Math.sin(t * 4.6 + sg) * 0.08 * m;
    fingers(him, s, curl, 0.25 + Math.sin(t * 4.6 + sg * 1.3) * 0.25 * m);
  }
  him.morph('smile', TL.hisSmile(t));
  him.morph('blink', Math.max(blink(t, 1.7), kiss * 0.8));
  him.root.updateMatrixWorld(true);
}

function poseHead(ch, target, chestUp, w, t, headOnly) {
  const B = ch.B; const head = wpos(B.Head);
  const look = target.clone().sub(head).normalize();
  if (!headOnly) {
    const nu = boneFrame(B.Spine2).d.lerp(new V3(0, 1, 0), 0.4).normalize();
    aim(B.Neck, nu, look.clone().sub(nu.clone().multiplyScalar(look.dot(nu))).normalize());
  }
  const base = boneFrame(B.Neck).d;
  const hu = base.clone().lerp(new V3(0, 1, 0), 0.3).addScaledVector(look, -0.25 * look.y).normalize();
  // pitch the head towards the target: tilt "up" away from look direction
  const pitched = hu.clone().addScaledVector(look, -Math.max(-0.4, Math.min(0.7, -look.y * 0.8))).normalize();
  const hf = look.clone().sub(pitched.clone().multiplyScalar(look.dot(pitched))).normalize();
  aim(B.Head, pitched, hf);
}
function aimEyes(ch, target) {
  for (const s of ['LeftEye', 'RightEye']) {
    const e = ch.B[s]; const p = wpos(e); const d = target.clone().sub(p).normalize();
    const hq = wquat(ch.B.Head); const hf = new V3(0, 0, 1).applyQuaternion(hq); const hu = new V3(0, 1, 0).applyQuaternion(hq);
    const dd = hf.clone().lerp(d, 0.85).normalize();
    aim(e, dd, hu);
  }
}
function armIK(ch, s, wrist, palmN, handDir, pole, twist) {
  const B = ch.B;
  aim(B[s + 'Shoulder'], B[s + 'Shoulder'].userData.dir0.clone().add(new V3(0, -0.08, 0.05)).normalize().applyQuaternion(wquat(B.Spine2)), new V3(0, 0, 1).applyQuaternion(wquat(B.Spine2)));
  const upB = (dirF, P) => {
    // share some wrist twist with the forearm (no twist bones in this rig)
    const q = aimQ(B[s + 'Hand'], handDir, palmN);
    const rest = aimQ(B[s + 'ForeArm'], dirF, P);
    const palmLocal = new V3(0, -1, 0).applyQuaternion(frameQ(B[s + 'ForeArm'].userData.dir0, B[s + 'ForeArm'].userData.up0).invert());
    const sgn = Math.sign(palmLocal.z) || 1;
    const want = new V3().crossVectors(palmN.clone().multiplyScalar(sgn), dirF).normalize();
    return P.clone().lerp(want, twist).normalize();
  };
  ik2(B[s + 'Arm'], B[s + 'ForeArm'], B[s + 'Hand'], wrist, pole, upB);
  aim(B[s + 'Hand'], handDir, palmN);
}
function fingers(ch, s, curl, thumb) {
  const sg = s === 'Left' ? -1 : 1; const B = ch.B;
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) {
    const k = f === 'Index' ? 0.85 : f === 'Pinky' ? 1.15 : 1;
    for (let i = 1; i <= 3; i++) { const b = B[s + 'Hand' + f + i]; if (!b) continue; b.quaternion.setFromAxisAngle(new V3(0, 0, 1), sg * curl * k * (i === 1 ? 0.8 : 1.1)); }
  }
  for (let i = 1; i <= 3; i++) { const b = B[s + 'HandThumb' + i]; if (!b) continue; b.quaternion.setFromAxisAngle(new V3(0, 1, 0), -sg * (i === 1 ? 0.25 : 0.1 + thumb * 0.4)); }
  B[s + 'Hand'].updateMatrixWorld(true);
}
function blink(t, seed) { const p = 3.7 + seed; const x = ((t + seed * 2.3) % p) / p; return x > 0.96 ? Math.sin((x - 0.96) / 0.04 * Math.PI) : 0; }

// ---------------------------------------------------------------- camera
// three gentle moves; distance is solved so the group fits both in portrait and landscape
const CAM = [
  { t: 0, yaw: 0.06, pitch: 0.2, fit: 1.0, at: new V3(-0.05, 0.78, 0.05) },
  { t: 9, yaw: 0.0, pitch: 0.17, fit: 0.86, at: new V3(0.02, 0.76, 0.08) },
  { t: 15, yaw: -0.32, pitch: 0.24, fit: 0.78, at: new V3(0.12, 0.78, 0.12) },
  { t: 23, yaw: -0.3, pitch: 0.22, fit: 0.8, at: new V3(0.08, 0.82, 0.08) },
  { t: 28, yaw: 0.22, pitch: 0.16, fit: 0.84, at: new V3(-0.05, 0.84, 0.05) },
  { t: 36, yaw: 0.26, pitch: 0.17, fit: 0.9, at: new V3(-0.05, 0.84, 0.05) },
];
function cameraAt(t) {
  let i = 0; while (i < CAM.length - 2 && t > CAM[i + 1].t) i++;
  const a = CAM[i], b = CAM[i + 1]; const k = ss(a.t, b.t, t);
  const yaw = a.yaw + (b.yaw - a.yaw) * k, pitch = a.pitch + (b.pitch - a.pitch) * k, fit = a.fit + (b.fit - a.fit) * k;
  const at = a.at.clone().lerp(b.at, k);
  const aspect = camera.aspect; const vfov = THREE.MathUtils.degToRad(camera.fov);
  const halfW = 1.05 * fit, halfH = 0.5 * fit;             // area to keep in frame (both bodies + her feet)
  const dW = halfW / Math.tan(Math.atan(Math.tan(vfov / 2) * aspect)); const dH = halfH / Math.tan(vfov / 2);
  const dist = Math.max(dW, dH) + 0.35;
  const dir = new V3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  camera.position.copy(at).addScaledVector(dir, dist);
  camera.position.x += Math.sin(t * 0.37) * 0.02; camera.position.y += Math.sin(t * 0.29) * 0.012;
  camera.lookAt(at);
}

// ---------------------------------------------------------------- loop
const fadeEl = document.createElement('div'); fadeEl.style.cssText = 'position:fixed;inset:0;background:#000;pointer-events:none;z-index:1;opacity:1';
document.body.appendChild(fadeEl);
const bar = document.getElementById('bar');
let t0 = performance.now(), frozen = false, simT = 0;
function resize() {
  const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w < h ? 40 : 32; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();
function update(t) {
  poseHim(t); poseHer(t); poseHim(t);             // second pass: his hands follow her final foot pose
  cameraAt(t);
  const fl = room.userData.flame; fl.scale.set(1, 1.8 + Math.sin(t * 13) * 0.2, 1); candle.intensity = 0.9 + Math.sin(t * 11) * 0.08 + Math.sin(t * 17) * 0.05;
  fadeEl.style.opacity = TL.fade(t).toFixed(3);
  bar.style.width = (t / DUR * 100).toFixed(2) + '%';
}
function frame(now) {
  requestAnimationFrame(frame);
  if (!ready) return;
  if (!frozen) simT = ((now - t0) / 1000) % DUR;
  update(simT); renderer.render(scene, camera);
}
document.getElementById('replay').onclick = () => { t0 = performance.now(); simT = 0; };
const credits = document.getElementById('credits');
document.getElementById('credlink').onclick = async (e) => { e.preventDefault(); credits.style.display = 'block'; document.getElementById('credtext').textContent = await (await fetch('CREDITS.txt')).text(); };
document.getElementById('credclose').onclick = () => { credits.style.display = 'none'; };

// debug hook for headless capture
window.__scene = { ready: null, seek(t) { frozen = true; simT = t; update(t); renderer.render(scene, camera); return t; }, play() { frozen = false; t0 = performance.now() - simT * 1000; }, info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, footInfo, palmInfo }) };
window.__scene.ready = load().then(() => {
  // pre-pose once before the first frame so nothing pops
  update(0); renderer.compile(scene, camera);
  loadEl.style.opacity = 0; setTimeout(() => loadEl.remove(), 900);
  requestAnimationFrame(frame);
}).catch(err => { loadEl.textContent = 'Errore nel caricamento: ' + err.message; console.error(err); });
