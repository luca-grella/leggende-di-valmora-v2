// Character surface look, layered on top of the actors' shared character material at runtime (the
// actors area owns the bodies; this only adds shading, chained after their own onBeforeCompile):
//  - skin (detected from the vertex colour: warm hue, moderate saturation): soft warm subsurface glow
//    in the shade and a faint sheen on the lit side, so skin reads as skin and not as plastic;
//  - clothes (everything else below the head): fine woven-fabric micro pattern in bind-pose space
//    (it moves with the body, never swims), soft fold variation and a velvety grazing sheen, faded with
//    camera distance (visible in dialogues and close-ups, invisible and free far away);
//  - hair (above the neck, not skin): strand streaks along the bind-pose height and a soft sheen band.
// Same in both graphics modes (no textures).

const VERT_PARS = 'varying vec3 vBindP; varying vec3 vBindN;\n';
const VERT = /* glsl */`
#include <begin_vertex>
vBindP = position; vBindN = normal;
`;
const FRAG_PARS = /* glsl */`
varying vec3 vBindP; varying vec3 vBindN;
uniform float uCharTop;
float clHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float clNoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(clHash(i), clHash(i + vec3(1,0,0)), f.x), mix(clHash(i + vec3(0,1,0)), clHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(clHash(i + vec3(0,0,1)), clHash(i + vec3(1,0,1)), f.x), mix(clHash(i + vec3(0,1,1)), clHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
const FRAG = /* glsl */`
#include <emissivemap_fragment>
{
  vec3 c = diffuseColor.rgb;
  float mx = max(c.r, 1e-3);
  float gr = c.g / mx, br = c.b / mx;
  // skin: red dominant, green 0.3..0.85 of red, blue below green (fair to deep skin tones)
  float skin = step(c.b, c.g) * step(c.g, c.r) * smoothstep(0.28, 0.36, gr) * (1.0 - smoothstep(0.82, 0.9, gr)) * (1.0 - smoothstep(0.62, 0.72, br));
  float camD = length(vViewPosition);
  float near = 1.0 - smoothstep(2.5, 7.0, camD);
  vec3 nV = normalize(normal);
  float ndv = clamp(dot(nV, normalize(vViewPosition)), 0.0, 1.0);
  float head = smoothstep(uCharTop * 0.8, uCharTop * 0.84, vBindP.y);   // above the neck (≈5 heads tall)
  // the face (eyes, brows, mouth) sits on the front of the head below the hairline: never treated as hair
  head *= 1.0 - step(0.3, vBindN.z) * step(vBindP.y, uCharTop * 0.95);
  float lum = dot(c, vec3(0.3, 0.59, 0.11));
  if (skin > 0.5) {
    // subsurface: warm red-orange light bleeding into the shade side, a hint of sheen
    totalEmissiveRadiance += c * vec3(0.07, 0.022, 0.006);
    totalEmissiveRadiance += vec3(1.0, 0.92, 0.85) * pow(1.0 - ndv, 4.0) * 0.035;
  } else if (head > 0.5) {
    // hair: strand streaks (thin vertical noise in bind space) + a soft sheen band
    vec3 bp = vBindP * vec3(160.0, 9.0, 160.0);
    float str = clNoise(bp) * 0.6 + clNoise(bp * 2.1 + 7.0) * 0.4;
    diffuseColor.rgb *= mix(1.0, 0.84 + 0.3 * str, near * 0.9 + 0.1);
    float band = smoothstep(0.35, 0.6, ndv) * (1.0 - smoothstep(0.6, 0.85, ndv)) * smoothstep(0.0, 0.5, nV.y + 0.3);
    totalEmissiveRadiance += (c * 0.5 + 0.12) * band * 0.18 * (0.6 + 0.4 * str);
  } else {
    // fabric: weave threads (~3 mm) on the dominant bind-pose plane + soft folds + grazing sheen
    vec3 an = abs(vBindN);
    vec2 uv = an.x > an.z ? vBindP.zy : vBindP.xy;
    vec2 t = uv * 1500.0;
    float weave = 0.5 + 0.25 * (sin(t.x) + sin(t.y + (sin(t.x * 0.5) > 0.0 ? 1.57 : 0.0)));
    float folds = clNoise(vBindP * vec3(9.0, 4.0, 9.0));
    diffuseColor.rgb *= 1.0 - (0.09 * weave * near) - 0.07 * (folds - 0.5);
    totalEmissiveRadiance += c * pow(1.0 - ndv, 3.0) * 0.07;
  }
}
`;

/**
 * Patch the shared character material (idempotent). Returns true when applied.
 * @param {any} ctx
 * @param {any} material the actors' character material (MeshToonMaterial, vertex colours)
 */
export function enhanceCharacterMaterial(ctx, material) {
  if (!material || material.userData.charLook) return false;
  material.userData.charLook = true;
  const base = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey?.() || '';
  const U = { uCharTop: { value: 1.0 } };
  material.userData.charLookU = U;
  material.onBeforeCompile = (sh, r) => {
    base?.call(material, sh, r);
    Object.assign(sh.uniforms, U);
    if (!sh.vertexShader.includes('#include <begin_vertex>') || !sh.fragmentShader.includes('#include <emissivemap_fragment>')) return;
    sh.vertexShader = VERT_PARS + sh.vertexShader.replace('#include <begin_vertex>', VERT);
    sh.fragmentShader = FRAG_PARS + sh.fragmentShader.replace('#include <emissivemap_fragment>', FRAG);
  };
  material.customProgramCacheKey = () => baseKey + '|charlook';
  material.needsUpdate = true;
  return true;
}

/** Hook: once the game is up, find the actors' shared material and enhance it. */
export function installCharacterLook(ctx) {
  const apply = async () => {
    try {
      const m = await import('../actors/human.js');
      const mat = m.characterMaterial?.(ctx);
      if (enhanceCharacterMaterial(ctx, mat)) {
        // bind-pose head top: the rig is built in model units (~1 = full height); measure from a live mesh
        let top = 0;
        ctx.scene.traverse(o => { if (o.isSkinnedMesh && o.material === mat && o.geometry?.boundingBox == null) o.geometry.computeBoundingBox(); if (o.isSkinnedMesh && o.material === mat) top = Math.max(top, o.geometry.boundingBox.max.y); });
        mat.userData.charLookU.uCharTop.value = top > 0.3 ? top : 1.0;
      }
    } catch (e) { console.warn('[charlook]', e?.message || e); }
  };
  ctx.bus.once?.('game:ready', apply) || ctx.bus.on('game:ready', apply);
}
