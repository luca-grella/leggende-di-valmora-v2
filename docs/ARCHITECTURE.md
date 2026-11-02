# Leggende di Valmora 2 — Architecture & module contracts

Read `docs/GDD.md` first. This file is the **contract** between areas built in parallel by
different builders. Keep every public name below working. If you must deviate or add a public
name, append one line to `docs/CHANGES.md` (append-only, prefixed by your area, e.g.
`[world] added world.poi('alba.fountain')`). Never edit another area's files: if you need
something from another area, use the contract (optional chaining) and write the request in
CHANGES.md.

## Tech rules
- Static site, **no build step**, native ES modules, plain JavaScript (JSDoc where useful).
  Hosted on GitHub Pages under a sub-path → **all URLs relative** (no leading `/`).
- three.js **r160** vendored in `vendor/`, import map in `index.html`:
  `"three": "./vendor/three.module.min.js"`, `"three/addons/": "./vendor/addons/"`.
  Available addons: `postprocessing/{EffectComposer,RenderPass,ShaderPass,UnrealBloomPass,OutputPass,MaskPass,Pass}`,
  `shaders/{CopyShader,LuminosityHighPassShader,OutputShader}`, `utils/{BufferGeometryUtils,SkeletonUtils}`.
  Need another r160 addon? Copy it from `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/...` into
  `vendor/addons/` (engine area; ask in CHANGES.md).
- **No external runtime requests**: no CDN, no web fonts, no models, no audio files. Everything
  procedural, with ONE exception: the CC0 environment textures in `assets/textures/` used by the default
  graphics mode (see "Graphics modes" below; same origin, cached by the service worker on first fetch,
  never precached). Works offline once cached.
- World generation uses the seeded RNG `ctx.math.rng(seed)` (identical world on every load).
  Gameplay randomness may use `Math.random()`.
- **All player-visible text in Italian.** Code, comments, docs in English.
- Never touch other modules at **import time**. At `init(ctx)` you may use core and the areas
  initialised before you (order below), always with optional chaining (`ctx.world?.poi?.(...)`),
  because any area may be missing or broken while builders work. Cross-area calls are always
  safe after the bus event `game:start`.
- Every module exports `init(ctx)` (sync or async) returning its API object.
- One coherent look: **only use `ctx.toon` materials** (plus your own ShaderMaterial when
  needed, e.g. water, sky, grass, built on the same ramp/palette). No `MeshStandardMaterial`
  with photo-real settings. Surface detail only through `ctx.surfaces` (below), never a texture
  loaded by an area.

## Graphics modes (`?grafica=`) — QA must test BOTH
Read once at startup by `src/core/surfaces.js` (`ctx.surfaces.mode`, also `ctx.grafica`):
- **default → `immagini`**: CC0 photo textures (Poly Haven, `assets/textures/<layer>_col.jpg` + `_nh.jpg`,
  512 px, credits in `assets/textures/CREDITS.txt`) for ENVIRONMENT surfaces only: grass, dirt, sand,
  rock, cobble, plaster, roof, wood, bark, stone, thatch. Characters, Velmon, sky, water stay in code.
- **`?grafica=codice`**: everything in code. `src/core/surfgen.js` generates the same layers from tileable
  noise/Voronoi in a module Worker (main-thread fallback); the files in `assets/` are never requested.
- Both fill the SAME texture arrays (`uSurfCol`: RGB colour *detail* around 1.0 + height; `uSurfNor`: normal,
  cavity, gloss), so every shader is shared. Detail multiplies the palette / vertex colour: photos never bring
  their own colours, which keeps environment and characters one coherent painted look. The `leaf` layer
  (tree canopies) is procedural in both modes.
- Using it: `ctx.toon.mat(color, {surf: 'wood'})` (constant layer, triplanar in world space) or
  `{surf: 'attr'}` + a float vertex attribute `aSurf` = layer index + 1 (0 = plain). World `Builder` parts take
  `{surf: 'roof'}` (or `b.surf = 'stone'` for following parts); `b.rock()` defaults to `rock`. The terrain
  (`src/world/terrain.js`) blends sand → grass → dirt → cobbles → rock by texture HEIGHT.
- `ctx.surfaces.ready` resolves when all layers are in (neutral flat detail until then). Headless scenarios
  should `await L.ctx.surfaces.ready` before the first capture.

## Directory ownership (edit only your area; read anything)
| Area | Owns |
|---|---|
| engine | `index.html`, `manifest.webmanifest`, `sw.js`, `sw-assets.js`, `icons/**`, `vendor/**`, `tools/**`, `src/main.js`, `src/core/**`, `sandbox/core.html`, `README.md` |
| world | `src/world/**`, `sandbox/world.html` |
| actors | `src/actors/**`, `sandbox/actors.html` |
| creatures | `src/creatures/**`, `src/battle/**`, `sandbox/creatures.html`, `sandbox/battle.html` |
| story | `src/story/**`, `sandbox/story.html` |
| romance | `src/romance/**`, `sandbox/romance.html` |
| ui | `src/ui/**`, `css/**`, `sandbox/ui.html` |
| integration (later) | `src/game.js` (glue), then anything |

`docs/CHANGES.md` is shared, append-only. `tmp/` is git-ignored scratch space for screenshots.
Sandbox pages are private test benches: they boot the core with a test stage, init your module
(and whatever else exists), and call `ctx.debug.markReady()`.

## Files and their exports (stubs exist for all of them)
```
src/main.js                 boot (engine)
src/game.js                 export function init(ctx)                       (integration glue, later)

src/core/index.js           export async function createCore(opts) → ctx;  export { ORDER, THREE }
src/core/bus.js             export function createBus()
src/core/loop.js            export const ORDER; export function createLoop({render})
src/core/save.js            export const SAVE_KEY = 'valmora-v2'; export function defaultState(); export function createSave({bus})
src/core/flags.js           export function createFlags({save, bus})
src/core/time.js            export function createTime({bus, save}); export function lightingAt(hours); export function phaseOf(hours)
src/core/input.js           export function createInput({bus, getYaw})
src/core/camera.js          export function createCameraRig({camera, ctx}); export const CLOSEUPS
src/core/toon.js            export function createToon({renderer, quality}); export const PALETTE
src/core/meshkit.js         export const kit (mergeStatic, instanced, vcolor, roundedBox, capsule, blob, dispose)
src/core/quality.js         export function createQuality({renderer, bus, save, override})
src/core/post.js            export function createPost({renderer, scene, camera, ctx})
src/core/audio.js           export function createAudio({bus, save})
src/core/busy.js            export function createBusy({bus})
src/core/interact.js        export function createInteract(ctx)
src/core/fade.js            export function createFade()
src/core/math.js            export const math
src/core/debug.js           export function createDebug(ctx, expose)
src/core/stage.js           export function createTestStage(ctx, opts)
src/core/pwa.js             export function installGestureGuards(); export function registerServiceWorker({params, onUpdate}); export const isStandalone, isIOS

src/world/index.js          export async function init(ctx) → World
src/world/map.js            export const ISLANDS, AREAS, TOWNS, ROUTES, FERRIES, GATES, INTERIORS, POIS; export function poiId(...)
src/world/palette.js        export const WORLD_COLORS (per-island tints of core PALETTE)
src/world/terrain.js        export function buildTerrain(ctx, island) → {mesh, heightAt}
src/world/water.js          export function buildWater(ctx) → {object, update(dt,t)}
src/world/sky.js            export function buildSky(ctx) → {object, sun, hemi, update(dt)}
src/world/vegetation.js     export function buildVegetation(ctx, island, heightAt) → {object, update(dt,t)}
src/world/tallgrass.js      export function buildTallGrass(ctx, patches) → {object, isIn(x,z), rustle(x,z), update(dt,t)}
src/world/buildings.js      export function buildHouse(ctx, def), buildCenter(ctx, def), buildShop(ctx, def), buildLandmark(ctx, def)
src/world/props.js          export function buildProps(ctx, list) → {object}
src/world/colliders.js      export function createColliders() → {add, remove, resolve(from,to,r), blocked(x,z,r)}
src/world/interiors.js      export function buildInterior(ctx, def) → {object, pois, colliders, searchSpots}
src/world/ferry.js          export function createFerries(ctx, world) → {travel(ferryId)}

src/actors/index.js         export function init(ctx) → Actors (also sets ctx.player)
src/actors/human.js         export function buildHuman(ctx, look) → {object, skeleton, bones, meshes, face}
src/actors/skeleton.js      export const BONES; export function buildSkeleton(proportions)
src/actors/clips.js         export const CLIPS (name → clip definition); export const CLIP_NAMES
src/actors/animator.js      export class Animator (play, crossfade, layers, lookAt, breathing, blink)
src/actors/face.js          export const EXPRESSIONS; export function createFace(ctx, look)
src/actors/looks.js         export const LOOKS (named presets); export function randomLook(seed, opts)
src/actors/human-api.js     export class Human (public object returned by createHuman)
src/actors/player.js        export function createPlayer(ctx, actors) → Player
src/actors/npc.js           export function createNpcs(ctx, actors) → {spawn, get, remove, ambient}
src/actors/pairs.js         export const PAIR_KINDS; export function stagePair(ctx, kind, opts), endPair(ctx, opts)

src/creatures/index.js      export function init(ctx) → Creatures
src/creatures/species.js    export TYPES, TYPE_COLORS, CHART, effectiveness, MOVES, SPECIES, STARTERS, PREVO   (ported from v1)
src/creatures/monster.js    export MAX_LEVEL, xpForLevel, statsFor, movesAt, createMonster, nameOf, stats, maxHp, gainXp, heal, pendingEvolution, evolve
src/creatures/encounters.js export const ENCOUNTERS; export function rollEncounter(areaId, isNight, rnd)
src/creatures/model.js      export function buildVelmon(ctx, speciesId) → VelmonModel
src/creatures/anims.js      export const VELMON_ANIMS
src/creatures/sphere.js     export function buildSphere(ctx, kind) → SphereModel
src/creatures/team.js       export function createTeam(ctx) → Team
src/creatures/dex.js        export function createDex(ctx) → Dex
src/creatures/thumbs.js     export function createThumbnails(ctx) → {get(speciesId, size)}
src/battle/index.js         export function init(ctx) → Battle
src/battle/battle.js        export class BattleRun (state machine for one battle)
src/battle/arena.js         export function buildArena(ctx, at) → {object, slots:{ally, foe, player, trainer}, dispose()}
src/battle/damage.js        export function computeDamage(att, def, moveId, rnd) → {damage, eff, crit, miss}
src/battle/capture.js       export function catchChance(mon, ballKind) ; export async function throwBall(ctx, run, ballKind) → bool
src/battle/ai.js            export function chooseMove(foe, target) → moveId
src/battle/evolution.js     export async function playEvolution(ctx, mon, toSpecies)
src/battle/fx.js            export function createFx(ctx) → {play(kind, from, to) → Promise}

src/story/index.js          export function init(ctx) → Story
src/story/items.js          export const ITEMS; export const GIFTS
src/story/economy.js        export function createEconomy(ctx) → Economy
src/story/bag.js            export function createBag(ctx) → Bag
src/story/shop.js           export function createShop(ctx) → Shop
src/story/dialogue.js       export function createDialogue(ctx) → Dialogue
src/story/quests.js         export function createQuests(ctx) → Quests (engine)
src/story/chapters.js       export const CHAPTERS (prologue, main1..main3 defs); export function wireChapters(ctx)
src/story/sidequests.js     export const SIDEQUESTS; export function wireSideQuests(ctx)
src/story/npcs.js           export const STORY_NPCS; export function spawnStoryNpcs(ctx)
src/story/trainers.js       export const TRAINERS; export function createTrainers(ctx) → Trainers
src/story/crime.js          export function createCrime(ctx) → Crime  (fixers, jobs, wanted, guards)
src/story/scooter.js        export function buildScooter(ctx, color) → Vehicle
src/story/grab.js           export function createGrab(ctx) → Grab (carry/throw gift objects)
src/story/chests.js         export function createChests(ctx) → Chests
src/story/centers.js        export function createCenters(ctx) → {heal(townId), blackout()}

src/romance/index.js        export function init(ctx) → Romance
src/romance/girls.js        export const GIRLS (14)
src/romance/moods.js        export const MOODS (dolce, audace, timida, ironica lines); export const BOND_LINES
src/romance/choices.js      export const ALLOWED_CHOICES; export function validateChoices(list); export function choiceLines(mood, choiceId)
src/romance/outings.js      export const OUTINGS (osteria, scooter, bagno, picnic)
src/romance/scenes.js       export function createScenes(ctx) → {date(girl), home(girl), outing(girl, kind)}

src/ui/index.js             export function init(ctx) → UI
src/ui/dom.js               export const el, $, $$  (tiny DOM helpers)
src/ui/hud.js               export function createHud(ctx)
src/ui/dialog.js            export function createDialog(ctx) → {say, choose, confirm}
src/ui/controls.js          export function createControls(ctx) → touch joystick + buttons
src/ui/tracker.js           export function createTracker(ctx) → objective arrow
src/ui/markers.js           export function createMarkers(ctx) → {set, remove}
src/ui/toast.js             export function createToasts(ctx) → {toast, banner, areaBanner}
src/ui/title.js             export function createTitle(ctx) → {show()}
src/ui/battlehud.js         export function createBattleHud(ctx) → BattleHud
src/ui/cheats.js            export function wireCheats(ctx, hud)
src/ui/sheets/index.js      export function createSheets(ctx) → {open(name, data), close(), isOpen()}
src/ui/sheets/{menu,team,bag,dex,journal,map,settings,shop,box,summary}.js   export function render(ctx, root, data)
css/base.css, css/hud.css, css/sheets.css, css/battle.css
```
Builders may add private files inside their area freely (no contract needed).

## Boot sequence (`src/main.js`, engine)
```js
const ctx = await createCore({ canvasParent: #game })      // renderer, scene, camera, loop, bus, input, save, flags, time,
                                                          // toon, kit, cameraRig, quality, post, audio, busy, interact, fade, debug
ctx.world     = await initModule('./world/index.js')       // falls back to ctx.createTestStage() if missing
ctx.actors    = await initModule('./actors/index.js')      // sets ctx.player (falls back to the test-stage dummy)
ctx.creatures = await initModule('./creatures/index.js')
ctx.battle    = await initModule('./battle/index.js')
ctx.story     = await initModule('./story/index.js')
ctx.romance   = await initModule('./romance/index.js')
ctx.ui        = await initModule('./ui/index.js')
ctx.game      = await initModule('./game.js')
bus.emit('save:loaded', {state}); loop.start(); bus.emit('game:ready', {ctx})
ctx.ui ? ctx.ui.title() : ctx.startGame(false)             // title screen → ctx.startGame(newGame)
```
`ctx.startGame(newGame)` (main.js): if `newGame` → `ctx.save.reset()` (keeps settings) then emits
`game:start {newGame}`. Modules place the player/NPCs/state from the save on `game:start`.
URL params: `?debug` exposes `window.__valmora`; `?skiptitle` starts directly (continue);
`?newgame` with `?skiptitle` starts a fresh game; `?quality=low|mid|high`.

Loop order (`ctx.ORDER`): input −1000, time 1, `systems` 10 (story, creatures logic, battle),
`actors` 20, `world` 30, `camera` 40, `ui` 50. Rendering after all callbacks.

## Core API (`ctx`) — engine
- `ctx.THREE`, `ctx.renderer`, `ctx.scene`, `ctx.camera`, `ctx.VERSION`, `ctx.params`
  (URLSearchParams), `ctx.isDebug`, `ctx.ORDER`, `ctx.viewport` `{width, height, portrait,
  aspect, pixelRatio}`, `ctx.haptic(pattern)`, `ctx.startGame(newGame)`.
- `ctx.loop` — `add(fn(dt,t), order=0) → remove`, `remove(fn)`, `start()`, `stop()`,
  `pause(bool)`, `paused`, `t`, `dt`, `frame`, `fps`, `tick(dt)`, `render()`. dt clamped ≤ 0.05.
- `ctx.bus` — `on(evt, fn) → off`, `once`, `off`, `emit(evt, payload)`; `'*'` listens to all.
- `ctx.input` — `move {x, z, mag}` (world space, camera-relative, mag 0..1), `moveScreen {x, y}`,
  `run` (bool: Shift held, run toggle, Corri button, or joystick ≥ 0.95), `pressed(name)`
  one-frame edge, `released(name)`, `isDown(name)` for names `a` (E/Enter/Space), `b`
  (Esc/Backspace), `menu` (Tab/P), `map` (M), `blaster` (F), `runToggle` (R);
  `setJoystick(x, y)` (UI joystick, −1..1, y up), `setButton(name, down)` (UI touch buttons),
  `press(name)` (programmatic one-shot), `enabled` (false → move zero, presses still work),
  `isTouch`, `lastDevice` (`keyboard|touch`). Keyboard cheats: **Shift+M** emits
  `cheat:money`, **Shift+L** emits `cheat:level` (no repeat).
- `ctx.busy` — global lock for dialogue, battles, scenes, sheets: `push(tag) → release()`,
  `is()` (any lock), `has(tag)`, `tags`. Emits `busy:change {busy, tags}`. While busy: the player
  does not move from input, `ctx.interact` is paused, encounters/trainer sight/guards pause, UI
  hides touch controls. Tags in use: `dialog`, `battle`, `scene`, `sheet`, `title`, `travel`, `cutscene`.
- `ctx.interact` — the single "context action" service: `register({id, pos, radius=1.6,
  label='Parla', icon='💬', priority=0, enabled?:()=>bool, run:()=>void|Promise}) → unregister`,
  `unregister(id)`, `current` (best enabled def in range of `ctx.player.position`, recomputed every
  frame, null when busy), `run()` (runs `current`; the core calls it on `input.pressed('a')`;
  further presses are ignored until the returned promise settles). `pos` may be `{x,z}`, a
  `Vector3` or a function returning one (moving NPCs). The UI A-button shows `current.label/icon`.
- `ctx.fade` — full-screen DOM fade above the canvas, below UI dialogs: `out(ms=350, color='#000')`,
  `in(ms=350)`, `flash(color='#fff', ms=250)`, `through(asyncFn, {ms, color})` (out → fn → in) → Promise.
- `ctx.save` — `state` (plain object, schema below), `commit()` (debounced write, also every 30 s),
  `flush() → bool` (write now; the UI Salva button), `reset({keepSettings=true})`, `export() → string`,
  `import(str|obj) → bool`, `firstLaunch` (no save existed), `available` (localStorage works).
  Each area owns its sub-object of `state` (see schema) and must create missing fields itself.
- `ctx.flags` — story/world progression flags stored in `save.state.flags`: `get(name)`,
  `set(name, value=true)`, `has(name)` (truthy), `all()`. Emits `flag:set {name, value}`.
- `ctx.time` — `hours` (0..24 float), `day`, `phase` (`dawn` 5-7, `day` 7-17, `sunset` 17-20,
  `night` 20-5), `isNight` (hours ≥ 20 or < 5), `scale` (real seconds per game hour, default 120
  → 48 min/day), `paused`, `set(h, day?)`, `skipTo(h)` (forward, may increment day), `format()` "18:30",
  `lighting()` → `{sky, horizon, fog, sun, sunIntensity, sunDir:{x,y,z}, hemiSky, hemiGround, hemiIntensity,
  ambient, lampsOn, stars}` interpolated colours for the current hour (World applies them). Emits
  `time:phase {phase}`, `time:day {day}`, `time:hour {hour}` (integer hour changes).
- `ctx.toon` — the shared look:
  - `mat(color, opts?) → Material` cached `MeshToonMaterial` with the shared ramp. `opts`:
    `{emissive, emissiveIntensity, transparent, opacity, side, vertexColors, rim (0..1), fog=true, flatShading}`.
  - `matVC(opts?)` — shared vertex-colour toon material for merged scenery.
  - `skin(color)` — toon skin (warm terminator, soft rim) for humans; `eye(color)`, `glow(color, intensity)`.
  - `outline(root, {width=0.02, color=PALETTE.outline, skip?(mesh)})` — inverted-hull outlines on
    every mesh under `root` (SkinnedMesh supported, shares the skeleton). No-op on quality `low`. Returns root.
  - `ramp` (DataTexture), `palette` (= `PALETTE`: named colours from the GDD incl. `outline '#2a2140'`,
    `shadow '#5b5f9e'`).
- `ctx.kit` — mesh helpers: `mergeStatic(group) → Group` (bakes world matrices, one mesh per
  material, disposes sources), `instanced(geometry, material, transforms[{x,y,z,ry,s}], {castShadow}) → InstancedMesh`,
  `vcolor(geometry, color) → geometry`, `roundedBox(w, h, d, r=0.1, seg=2)`, `capsule(r, len, capSeg, radSeg)`,
  `blob(r, {seed, wobble=0.1, detail=2})`, `dispose(object)`.
- `ctx.cameraRig` (see Camera) — `follow(obj)`, `followed`, `snap()`, `setExplore(params)`,
  `zoom`, `shot(spec, opts) → Promise`, `closeUp(kind, args, opts) → Promise`, `orbit(target, opts)`,
  `release(opts) → Promise`, `shake(amount)`, `mode`, `toScreen(vec3) → {x, y, behind}` (0..1, y down),
  `effectiveYaw`.
- `ctx.quality` — `tier` (`low|mid|high`), `setting` (incl. `auto`), `set(tier|'auto')`, `pixelRatio`,
  `shadows`, `shadowMapSize`, `drawDistance`, `grassDensity` (0..1), `outlines` (bool), `post` (bool).
  Emits `quality:change`. Auto picks `mid` on phones, `high` on desktop; an FPS watchdog steps down.
- `ctx.post` — `render()`, `setEnabled(bool)`, `bloom(strength)`, `grade({warmth, saturation, vignette})`.
  Bloom only on mid/high. The loop calls `post.render()`.
- `ctx.audio` — procedural WebAudio (no files): `unlock()` (first gesture), `sfx(name, {vol, pitch})`,
  `music(track)`, `jingle(name)` (ducks the music), `setVolumes({music, sfx})`.
  Tracks: `title town route cave night battle_wild battle_trainer battle_champion battle_legend
  eclissi romance victory evolution off`. Jingles: `heal catch levelup item quest evolved`.
  SFX: `ui_tap ui_open ui_close step_grass step_sand step_wood step_stone grass_rustle encounter
  alert ball_throw ball_shake ball_click ball_burst hit hit_super hit_weak faint heal coin door
  ferry_horn scooter splash paint whistle chest pickup throw kiss heart`.
- `ctx.math` — `rng(seed) → () => [0,1)`, `hash2(x,z)`, `noise2(x,z)`, `fbm(x,z,oct)`, `clamp`, `lerp`,
  `smoothstep`, `damp(a, b, lambda, dt)`, `dampAngle`, `angleDiff`, `easeInOut`, `easeOutBack`, `easeOutCubic`.
- `ctx.debug` — see Debug.
- `ctx.createTestStage({ground=true, dummy=true})` → `{ground, dummy, lights, heightAt}`: lit grass
  disc + capsule dummy followed by the camera (used by sandboxes and when World/Actors are missing).

## Camera (`src/core/camera.js`, engine)
- **Explore**: follows `followed` with damping; pitch 50°, distance 13, FOV 35, fixed yaw (from area
  data), look-ahead 1.2 m in the movement direction; `setExplore({distance, pitch, yaw, fov, height,
  lookAhead})` animates to new params over 0.8 s (World calls it on `area:enter` and interiors with
  distance ~9). Portrait: distance ×1.15, pitch +4°. Optional pinch zoom changes `zoom` 0.8..1.3.
- `shot({position, target, fov}, {dur=0.8, ease='inOut'|'cut'})` → resolves when arrived.
- `closeUp(kind, args, {dur=0.8, ease})` → computes a shot from the actors' world positions:

| kind | args | framing |
|---|---|---|
| `dialog` | `{a, b}` Object3D speaker/listener | over-the-shoulder of `b` on `a`'s face, head height, gentle drift |
| `portrait` | `{target, side=1}` | single character, chest-up |
| `battle_intro` | `{ally, foe}` | sweep from foe to wide (animated, ~2 s) |
| `battle_wide` | `{ally, foe}` | both Velmon, low-angle 3/4 |
| `battle_ally` | `{ally, foe}` | behind ally's shoulder looking at foe |
| `battle_foe` | `{ally, foe}` | hero shot of foe |
| `capture` | `{target}` Object3D (the ball) | close, low, slight orbit |
| `evolution` | `{target}` | slow orbit until `release`/next shot |
| `romance` | `{a, b, tight=false}` | soft two-shot of faces and shoulders |
| `romance_top` | `{center, facing}` | from above the bed, heads/shoulders only |
| `ride` | `{target}` | side tracking shot (scooter, ferry) |

- `orbit(target, {radius=4, height=1.5, speed=0.2})`, `release({dur=0.8})` back to explore,
  `shake(0..1)`, `snap()` after teleports. Close-ups never frame feet or bodies below the waist
  in romance scenes.

## World API (`ctx.world`) — world
```
await init(ctx) → world   // builds islands, water, sky, vegetation, towns, routes, interiors (lazy), registers doors/ferries in ctx.interact
world.heightAt(x, z)            terrain height
world.groundY(x, z)             walkable surface (terrain, bridges, docks, interior floors)
world.isWater(x, z), world.waterLevel (0)
world.walkable(x, z)
world.resolveMove(from{x,z}, to{x,z}, radius) → {x, z}   slides along colliders, blocks deep water/cliffs/gated routes
world.areaAt(x, z) → areaId|null;  world.area → current area id (player);  world.areaDef(id) → Area
world.encounterZoneAt(x, z) → areaId|null   tall grass on routes, anywhere in caves
world.rustle(x, z)              grass rustle FX (creatures calls it on encounter)
world.poi(id) → {x, y, z, facing}|null;  world.pois(prefix) → [{id, x, y, z, facing}]
world.enterInterior(interiorId) → Promise   fade, build lazily, teleport player inside, camera indoor
world.exitInterior() → Promise              back to the door outside
world.interior → current interior id | null
world.setDoorLocked(interiorId, bool)
world.searchSpots(interiorId) → [{id, x, z, kind:'drawer'|'wardrobe'|'fridge'|'shelf'|'chest'}]
world.travel(ferryId) → Promise   ferry ride vignette, respects GATES
world.canPass(gateId) → bool      (reads ctx.flags)
world.setBeacon(pos{x,z}|null, color='#ffc93c')   golden light column over the tracked objective
world.addProp(object3D, {x, z, collider?:{r}|{hx,hz,rot}}) → id;  world.removeProp(id)
world.colliders.add(shape) → id;  world.colliders.remove(id)
world.minimap() → {bounds, islands:[{id, name, outline:[[x,z]...]}], towns:[{id, name, x, z}], routes:[{id, name, points}], ferries:[{id, a, b}]}
world.lampsOn (bool), world.sun (DirectionalLight)
```
World registers its own loop update, applies `ctx.time.lighting()`, emits `area:enter`,
`interior:enter/exit`, `ferry:travel`, calls `ctx.cameraRig.setExplore(area.camera)` and
`ctx.audio.music(area.music)` (unless busy with battle/scene).

**Area ids** (fixed): towns `alba petalo fulgida muschio fosco cristallo corallo sole ramata`;
routes `r1 r2 r3 r4 r5 santuario r6 r7 r8`; caves `grotta_sussurro grotta_cristallo grotta_marina
grotta_vulcano`; beaches `spiaggia_alba` (+ any extra beach areas world wants). Islands `aurora giada
nebbia gelida coralline sole ramato`. Ferries `alba_corallo corallo_sole petalo_ramata fulgida_corallo`.
Gates: `bridge_r3` (flag `ch1_done`), `ferry_sole` and `ferry_ramata` (flag `ch2_started`),
`pass_r5` (flag `ch3_started` or `champion_fosco`), `ferry_fulgida_corallo` (flag `ch2_done`).

**Interior ids**: `home.player` (player's house in Alba), `lab.alba` (Prof.ssa Quercia), for
every town T: `center.T` (Centro Cura), `shop.T` (Bottega), `house.T.1` … `house.T.N` with
N ≥ 4 (Alba, Fulgida 6; Corallo 5), `osteria.T` for `alba fulgida corallo petalo`, `depot.fulgida`
(Eclissi warehouse). Interior POIs: `<interior>.door` (inside spawn), `.owner` (resident spot),
`.bed` (double bed centre, facing = head direction), `.sofa`, `.table`, `.counter` (shop/center
clerk), `.pc` (center box), `.window`.

**Outdoor POIs** that World must provide (facing in radians, 0 = +z):
- every town T: `T.arrive`, `T.plaza`, `T.landmark`, `T.champion`, `T.center_door`, `T.shop_door`,
  `T.date`, `T.picnic`, `T.viewpoint`, `T.bench`, `T.npc1`…`T.npc6`, `T.girl1`…`T.girl4`,
  `T.grab1`…`T.grab3` (where gift objects lie), `T.house1_door`…; port towns also `T.dock`,
  beach towns (`alba` via spiaggia_alba, `petalo corallo sole`) `T.swim`; `alba fulgida corallo` `T.scooter`,
  `T.ride` (scooter ride start); `fulgida corallo` `T.stall1`, `T.stall2`, `T.drop1`…`T.drop3`.
- every route R: `R.start`, `R.end`, `R.trainer1`…`R.trainer3`, `R.sign`, `R.item1`…`R.item3`, `R.rest`.
- story specials: `alba.lab_door`, `alba.home_door`, `alba.well` (= landmark), `r1.briciola`,
  `r1.camp`, `r1.camp_grunt1`, `r1.camp_grunt2`, `fulgida.alley` (Er Faina), `fulgida.depot`,
  `fulgida.depot_grunt1/2`, `fulgida.depot_boss`, `corallo.docks` (Zio Murena), `corallo.beach`
  (Marina date), `cristallo.neve`, `santuario.altar`, `santuario.boss`, `santuario.legend`,
  `petalo.ginepro`, `alba.quercia` (outside the lab), `alba.rosa`, `alba.fornaio`, `muschio.ada`,
  `chest.1`…`chest.32` (hidden chests across routes/caves/beaches), `guard.<T>.1..3` for
  `fulgida corallo alba` (guard posts).

## Actors API (`ctx.actors`, `ctx.player`) — actors
Procedural stylized humans (Sun/Moon proportions, ~5 heads tall), real skeleton
(`THREE.Bone` + `SkinnedMesh`, one draw call per body + outline), keyframe clips with
cross-fades plus procedural layers (breathing, blink, look-at, secondary motion on hair/ponytail).
```
init(ctx) → actors   (sets ctx.player; spawns the player at save position on game:start)
actors.createHuman(look, {id?, name?}) → Human
actors.spawnNpc({id, name, look, at: poiId|{x,z,facing}, wander?:{radius=4, pause:[2,6]}|null,
                 schedule?:[{from, to, at: poiId}], talk?:()=>void|Promise, label='Parla',
                 marker?:'!'|'❤'|'?'|null, interior?: interiorId}) → Npc
actors.npc(id) → Npc|null;  actors.npcs → Map(id → Npc);  actors.removeNpc(id)
actors.ambient(areaId, count) → spawns generic villagers (auto for towns on area:enter)
actors.stagePair(kind, {a: Human, b: Human, anchor:{x, y?, z, facing}, fade=0.6}) → Promise
actors.endPair({a, b}) → Promise
actors.looks (LOOKS presets), actors.randomLook(seed, {sex, age}), actors.clips (CLIP_NAMES), actors.PAIR_KINDS
```
**Human**: `id`, `object` (Group, feet at origin, facing +z), `height`, `head` (Object3D for markers),
`play(clip, {loop=true, fade=0.25, speed=1}) → Promise` (resolves at the end of non-loop clips),
`lookAt(target: Object3D|Vector3|null, {weight=1})`, `setExpression(name, {dur=0.2})`,
`talk(on)` (mouth layer), `attach(slot, obj|null)` slots `handR handL head back hips`,
`setLook(look)`, `moveTo({x,z}, {run=false, stopDist=0.15}) → Promise`, `face(angle|{x,z}, {dur=0.4}) → Promise`,
`teleport(x, z, facing)`, `setVisible(bool)`, `dispose()`. Humans auto-update on the actors loop.

**Clips** (minimum): `idle idle_look idle_stretch walk run talk talk_gesture wave nod shake_head
point laugh surprised cheer defeat think sit_down sit_idle stand_up sit_ground kneel lie_back
pickup carry_idle carry_walk throw throw_ball search ride_scooter swim sleep`.
**Expressions**: `neutral smile grin laugh blush shy surprised sad angry wink closed kiss sleepy smug`.
**Pair kinds** (a = player, b = woman; clothes as set by the caller — at most underwear, see Outfits;
loops are gentle): `face walk_together
sit_bench sit_table sit_ground hug kiss stroke_hair massage_shoulders massage_back massage_legs
massage_feet kiss_feet kiss_neck ear_nibble whisper guide lie_blanket picnic_lap scooter_ride swim`.
`lie_blanket` adds an opaque blanket covering both from the shoulders down (only heads/shoulders visible).
`massage_feet` / `kiss_feet` are medium shots: she sits on the bed/sofa edge; massage: her right foot
rests on his lap (he kneels back on his heels) and both palms knead it; kiss: she raises the foot in
front of his face, his hands cradle heel and ankle, the kisses travel by themselves between instep,
toes and ankle (no menu, no close-up). Every kind uses real contact (see Body physicality).

### Body physicality (actors) — `src/actors/contact.js`, `bodies.js`, `human-api.js`
Coordinated bodies: nothing slides, floats, overlaps or sinks; hands, feet and mouths land ON surfaces.
- **Locomotion**: walk/run cycles with arm–leg opposition, pelvis weight shift over the stance foot,
  counter-rotating chest, lean into turns/acceleration. Stride measured on each body
  (`calibrateLoco`, per proportions) so the cycle is phase-locked to the distance actually travelled.
  **Feet planted** (`FootPlanter`, every human within 24 m of the camera): during the stance the foot is
  locked where it landed (flat, ankle at rest height, tilted to the slope for the player); standing
  still both feet stay put and step one at a time (arc) when the body turns (`face()`) or drifts; hips
  drop when a leg can't reach. Autopilot (`moveTo`) eases in/out (~5 m/s² start) and turns smoothly.
- **Collisions** (`actors.bodies`, loop order actors+0.6, replaces the old game.js pass): every visible
  human (player, NPCs, trainers, scene extras) is a capsule of radius `human.radius` (shoulders+arms,
  ≈0.2–0.25 m adults). Overlaps are pushed apart through `world.resolveMove` (never into walls,
  furniture, trees, props): walkers give way to standers, two walkers share, seated/kneeling/lying
  people never move. `moveTo` walkers steer around people ahead. World colliders are resolved by
  movers (radius ≥ 0.28). Pair-staged humans are skipped (pairs.js solves their contact).
  `human.collide = false` opts out. `actors.findFree(x, z, r, {except, maxDist, people})` → free spot
  (no collider, nobody there); stagePair moves standing kinds there, endPair puts both back on free ground.
- **Support** (body rests on a surface): clips declare a support (`seat` sit_*, `floor` sit_ground/legs/
  knees, `knees` kneel*, `lie` lie_back/sleep); every frame the lowest point of the support spheres
  (buttocks+thighs / knees+toes / back+head) is put exactly on the surface: seat = `support.seatY`
  (default origin+0.45), floor = `support.floorY` (default origin), mattress = `support.lieY`. Seated
  feet are IK'd flat onto the floor whatever the seat height. Transitions (sit_down, stand_up,
  kneel_down) can only push up (never through the seat).

**Human — physicality API** (all optional, additive to the contract above):
```
human.radius                              body collision radius (m);  human.collide (bool);  human.planting (bool)
human.surface(region, params?, outP?, outN?) → Vector3   point ON the body surface (world) + outward normal
human.setHandTarget(side 'L'|'R', target|null, {weight=1, fade=0.35, fingers, elbow, normal, press=0.004, offset})
human.touch(side, other, region, params?, {fade, slide: t => params, fingers, elbow, press, offset})   palm ON a body
human.reach(side, target, opts)           alias of setHandTarget
human.setFootTarget(side, target|null, {weight, fade, normal})   sole of the foot on a point / a body region
human.mouthTo(target|null, {weight, fade, offset=0.006})          lips to a point / region (spine→head CCD)
human.lookAt(target|null, {weight})       head look-at (exists; the mouth reach overrides it while active)
human.reachError {L, R, mouth} (m) · human.reachVec {L, R, mouth, footL, footR} (wanted − achieved, world)
human.setSupport({seatY, floorY, lieY} | null)
human.sitOn({x, z, y: seat top, facing}, {walk=true, run, floorY, clip='sit_idle'|'sit_feet'}) → Promise   walks, turns, sits back onto it
human.kneelAt({x, z, facing}, {walk=true, bow=false, floorY}) → Promise    (kneel_down → kneel)
human.sitGround({x, z, facing}, {walk=true, clip='sit_ground'|'sit_legs'|'sit_knees'}) → Promise
human.lieOn({x, z, y: surface top, facing: toward the head}, {clip='lie_back'})   instant (use a fade)
human.standUp() → Promise                 off a seat (glides forward) or up from the floor
human.grounded                            seated / kneeling / lying / riding
human.setOutfit('clothes'|'underwear'|'top'|look, {color})   instant outfit swap (geometry only)
human.undress({animate=true, color}) → Promise · human.dress({animate}) → Promise · human.prepareOutfit('underwear')
human.outfit ('clothes'|'top'|'underwear'|'custom') · human.baseLook (the clothes)
```
Targets: a **contact** `{human, region, params?, slide?: t → params, offset?}` (re-evaluated every frame:
the palm lies flat on the surface, fingers along the reach direction or `fingers`, elbow out/down or
`elbow`), a `Vector3`, an `Object3D`, or `fn(out, t) → Vector3` (add `normal` to lay the palm flat on a
table, a wall…). `slide(t)` may return `{u, a, el, az, lift (m off the surface), region}` to stroke,
knead or travel across regions. **Regions**: `torso {u 0 hips..1 shoulders, a 0 front/π back/+π/2 its
left}`, `neck {u, a}`, `head {el, az, hair}`, `shoulder_L/R {u 0 neck..1 deltoid}`, `thigh_* shin_*
upperarm_* forearm_* {u along, a around (0 front)}`, `foot_L/R {u 0 ankle..0.5 instep..1 toes, sole}`,
`palm_L/R`; presets `back upper_back lower_back chest belly waist_L/R side_L/R neck_L/R nape throat mouth
lips cheek_L/R ear_L/R forehead crown hair hair_L/R knee_L/R lap_L/R calf_L/R instep_L/R toes_L/R
ankle_L/R sole_L/R hand_L/R` (list: `actors.SURFACE_REGIONS`). Extra params override a preset's.
**Pair contact solver** (pairs.js): after placing both, the mover's spacing is adjusted every frame along
the anchor axis from signed errors: chests meet in a hug (slight press), lips meet halfway in a kiss,
the masseur moves until both palms rest on her, the kneeling partner until mouth/hands reach the foot;
head/torso overlap pushes apart (bounded ±0.2–0.4 m). New clips: `kneel_down kneel_sit kneel_reach
undress_top undress_bottom` (+ `kneel_bow`).

**Outfits** (romance only, agreed with Luca: down to the underwear, never nudity): `setLook` with the
same sex/age/build, `setOutfit` and `undress/dress` swap only the skinned geometry (`buildHumanGeometry`),
so the pose, clip, IK and expression carry on. `undress()`: top pulled over the head (swap at the moment
it covers the head: 'top' = bra/bare chest + bottoms still on; dresses, swimsuits and coats go straight
to the full set), then bottoms pushed down and stepped out of (swap → 'underwear': bra + briefs / briefs,
barefoot). Underwear is never removed by the actors API.

**Npc**: `id`, `name`, `human`, `object`, `setTalk(fn)`, `setLabel(text)`, `setMarker(icon|null)`,
`setWander(cfg|null)`, `goTo(poiId|{x,z}, {run}) → Promise`, `faceTo(obj|{x,z})`, `freeze(bool)`
(stop wandering, e.g. while talking), `remove()`. Talking: actors registers an interactable per NPC
with `talk`; during talk the NPC freezes, turns to the player and the player turns to it.
Markers are drawn by `ctx.ui.marker` (actors calls it with `npc.human.head`).

**Player** (`ctx.player`): `human`, `object`, `position` (= object.position), `facing`, `speed`,
`radius` (0.35), `state` (`idle|walk|run|ride|scene|battle`), `control` + `setControl(bool)`,
`teleport(x, z, facing?)` (uses world.groundY, snaps camera), `carry(obj|null)` (two-hand carry
clips), `held` (current carried object), `throwHeld(dir?) → Promise<obj>`, `throwBall() → Promise`
(throw_ball clip, resolves at release time), `mount(vehicle|null)` (vehicle `{object, seat:
Object3D, maxSpeed=11, accel=8, turnRate=2.8, kind:'scooter'}`), `look` (save.state.player.look).
Movement: walk 2.6 m/s (half stick), run 5.6 m/s, acceleration ~10 m/s², eased turning
(~0.12 s), smooth idle↔walk↔run blend by speed (stride calibrated on the body, feet planted),
feet on `world.groundY` (slope-aligned), `world.resolveMove`, body collisions (`actors.bodies`).
Writes `save.state.player {x, z, facing, area, interior}` on `save.commit()`.

## Creatures & Battle API — creatures
```
init(ctx) → ctx.creatures
creatures.SPECIES, MOVES, TYPES, TYPE_COLORS, effectiveness   (re-exports for UI)
creatures.createModel(speciesId, {scale=1}) → VelmonModel
creatures.createSphere(kind='sfera') → SphereModel
creatures.thumbnail(speciesId, size=128) → Promise<dataURL>   (offscreen render, cached)
creatures.team: { party, box, lead(), firstAlive(), alive(), add(mon) → 'party'|'box', swap(i,j),
                  toBox(i), fromBox(j), healAll(), allFainted() }
creatures.dex:  { seen, caught, markSeen(id), markCaught(id), countSeen(), countCaught() }
creatures.giveStarter(speciesId) → Monster (Lv 5)
creatures.levelUp(mon, n=1) → Promise   (messages via ui, new moves, evolution if due; used by the cheat)
creatures.evolve(mon) → Promise          (evolution scene)
creatures.encounters: { enabled, force(speciesId, level) → Promise<result> }
```
Encounters run on the `systems` loop: while the player moves inside `world.encounterZoneAt(...)`
and not busy, every ~1.2 s of movement roll ~9% → `rollEncounter(area, ctx.time.isNight)` →
`ctx.battle.start({kind:'wild', foes:[mon]})`.

**VelmonModel**: `object` (Group, origin on the ground, facing +z), `speciesId`, `height`, `radius`,
`play(anim, {loop}) → Promise` with anims `idle walk attack special hit faint happy sleep appear`,
`lookAt(target|null)`, `setGlow(0..1, color)`, `setSilhouette(0..1)` (white evolution silhouette),
`update(dt)` (auto-updated while in the scene), `dispose()`. Toon materials + outline, ≤ 3 draw calls.
**SphereModel**: `object`, `play('throw'|'open'|'close'|'shake'|'click'|'burst') → Promise`.

```
init(ctx) → ctx.battle
battle.start({ kind:'wild'|'trainer'|'champion'|'boss'|'legendary'|'guard'|'bet',
               foes: Monster[], trainer?: {id, name, npc?: Npc, look?, before?: string[], after?: string[]},
               at?: {x, z, facing}, canRun?, canCatch?, music? }) → Promise<'win'|'lose'|'caught'|'run'>
battle.active (bool)
```
Battle pushes busy `battle`, builds the arena at `at` (default: player position), places player
human behind the ally, trainer (existing NPC moved in, or a temporary human from `look`) behind
foes, drives camera close-ups, uses `ctx.ui.battle` for HUD/menus, `ctx.story.bag` for items,
grants XP, checks evolutions at the end, marks seen/caught, emits events. It does **not** pay
coins or handle blackout: it emits `battle:end {result, kind, trainerId, foes}` and the story pays
rewards (`trainer.reward`) / runs the blackout on `lose`.

## Story API (`ctx.story`) — story
```
init(ctx) → ctx.story
story.items (ITEMS), story.GIFTS
story.economy: { coins (getter), earn(n, reason?), spend(n) → bool }            emits coins:change
story.bag: { count(id), add(id, n=1), remove(id, n=1) → bool, list() → [{id, n, item}], canUse(id, mon), use(id, mon) → string|null }
story.shop: { open(townId) → Promise, buy(id, n) → bool, stock(townId) → [{id, price}] }
story.dialogue: { say(speaker, lines, {actor?: Human|Npc, listener?: Human, camera='dialog'|'portrait'|'none', expression?, gesture?}) → Promise,
                  choose(title, options, {actor?}) → Promise<index> }
story.quests: { register(def), start(id), advance(id, toStep?), complete(id), stepOf(id) → number|'done'|null,
                active() → [{id, def, step}], track(id|null), tracked, objective() → Objective|null, defs }
story.trainers: { list, beaten(id), markBeaten(id), challenge(id) → Promise }
story.crime: { wanted (0..3), addWanted(n, reason), clearWanted(), job → current job|null, hasBlaster }
story.grab: { held → kind|null, pickUp(kind, obj), drop(), give() → kind|null }   (wraps ctx.player.carry)
story.chests: { opened(id), count() }
story.centers: { heal(townId) → Promise, blackout() → Promise }
```
**Quest def**: `{id, title, main?:bool, adult?:bool, steps:[{text, at?: poiId|()=>({x,z}), near?: m,
done?: (ctx)=>bool}], reward?: {coins?, items?: {id: n}}, onComplete?: (ctx)=>void}`. Step
progress is saved as `save.state.story.quests[id] = stepIndex | 'done'`. The engine re-checks `done`
on relevant bus events (`battle:end`, `velmon:caught`, `trainer:beaten`, `chest:open`, …) and on
arrival `near` an `at` POI. Romance registers its quests with `adult: true` (hidden when 18+ is off).
**Objective**: `{questId, title, text, target:{x,z}|null, areaId|null, main}` — the UI tracker,
map and `world.setBeacon` use it (story calls setBeacon on `objective:change`).

Trainers data (`src/story/trainers.js`): `{id: 'r1.t1', area, poi: 'r1.trainer1', cls, name, look,
team: [[speciesId, level]], reward, before: string[], after: string[], sight=13, champion?:bool}`;
champions `id: 'champion.<town>'`. Sight: 13 m cone ±35°, blocked by colliders; on sight: emit
`trainer:spotted`, ui marker `!`, `ctx.audio.sfx('alert')`, walk to the player, battle.
Story listens to `cheat:money` → `economy.earn(1000)` + toast "+1000 monete 💰".

## Romance API (`ctx.romance`) — romance
```
init(ctx) → ctx.romance
romance.enabled() → bool  (save.state.settings.adult)
romance.girls → [{id, name, town, poi, home, mood, task, when, look, npc}]
romance.stage(id) → 0 meet | 1 date | 2 home | 3 together;  romance.bond(id) → number;  romance.tier(id) → 0|1|2
romance.talk(id) → Promise        (NPC talk handler)
romance.date(id), romance.home(id), romance.outing(id, kind) → Promise
```
`choices.js` exports `ALLOWED_CHOICES` — the **only** intimate options that may exist:
```
kiss 'Baciala' · hair 'Accarezzale i capelli' · shoulders 'Massaggiale le spalle' · back 'Massaggiale la schiena' ·
legs 'Massaggiale le gambe' · feet 'Massaggiale i piedi' · kiss_feet 'Baciale i piedi' · lick_feet 'Leccale i piedi' ·
kiss_neck 'Baciale il collo' · lick_neck 'Leccale il collo' · ear 'Mordicchiale l'orecchio' · hug 'Stringila a te' ·
whisper 'Sussurrale qualcosa all'orecchio' · undress 'Spogliatevi a vicenda' (restando in intimo) ·
guide 'Lasciati guidare da lei…' · continue 'Continua' · stop 'Basta così'
```
`validateChoices(list)` throws on anything else; scenes call it before every menu. Each choice maps
to a pair kind (`kiss→kiss`, `hair→stroke_hair`, `shoulders→massage_shoulders`, `back→massage_back`,
`legs→massage_legs`, `feet→massage_feet`, `kiss_feet|lick_feet→kiss_feet`, `kiss_neck|lick_neck→kiss_neck`,
`ear→ear_nibble`, `hug→hug`, `whisper→whisper`, `guide→guide`) and camera `romance` (medium two-shot);
outings still stage those pair kinds. Outing extras (non-intimate) are allowed:
wine, dessert, viewpoint, splash, carry her in the water, strawberries, head on her lap, hug from
behind on the scooter. Never: nudity, intimate parts, sexual acts shown/described, choosing parts
of the foot, foot close-ups; underwear stays on except the implied under-the-sheet moment (GDD).
v1 `undress`/`under` data is not ported.

**Acting** (`src/romance/acting.js`, used by the home evening and the date's moment; outings keep
stagePair): the couple's pose is a state on the real furniture of her home, read from
`world.layout.interiors[home].furniture` (sofa front = its local +z, seat 0.57 m; bed head = local −z,
quilt 0.76 m; the room side of the bed is the long side facing the room centre):
`sofa` (side by side, he on her right: seated kiss / hair / whisper / neck / ear), `stand` (face to face on
free floor: hug, undress, standing kiss…), `knees` (she on her heels on the floor, he kneeling behind:
shoulders, back), `legs` (she sits with legs out, he kneels at her right), `feet` (she on the sofa, he
kneeling in front: foot on his lap / foot lifted to his mouth), `bedside`, `bededge`, `bed`. Changing
state is always visible: stand up (`human.standUp`), walk (`moveTo`), turn, sit (`sitOn`), kneel
(`kneelAt`), sit on the floor (`sitGround`); only getting under the blanket happens behind a fade.
Floor poses search free floor for their footprint (`world.colliders.blocked`). Contacts use
`human.touch / mouthTo / setFootTarget` with a per-frame spacing solver (mouth / hand reach errors,
head and chest overlap, his knees kept out of the sofa). While acting, both humans carry a pair record
(`human._pair.romance = true`: crowd collisions and the player controller keep off; `endPair` on close
cleans it). Undressing = `human.undress()` animated, down to the underwear. Bed: `lieOn` on the quilt,
heads on the pillows, then romance's own opaque double-sided blanket (vertex heights lifted above
~400 body surface samples, drapes to 12 cm above the floor on the sides and the foot end, top edge
just under the collarbones, `userData.noOcclude`). `slipOff()`: her hand IK target travels under
the quilt (a moving bulge in the blanket), then a small garment mesh slides out from under the drape
and lands on the floor beside the bed (disposed on close). Cameras: `cams.fit(points, {yaws, pitch,
minV, padTop, padBottom, clamp})` frames live body points from the clearest of a few directions,
keeping them inside the band left by the letterbox and the dialogue box; feet shots use minV ≥
1.25 m (medium), bed shots `clamp` the lens ≥ 0.95 m above the quilt and on the foot side of the
faces. Debug: `__valmora.romance.scenes.acting`.
Romance reacts to `settings:change {key:'adult'}`: hides/shows hearts and registers/unregisters
its quests. When disabled, the women are plain NPCs with friendly lines.

## UI API (`ctx.ui`) — ui
```
init(ctx) → ctx.ui
ui.title() → shows the title screen; 18+ question when !settings.adultAsked; then ctx.startGame(newGame)
ui.say(speaker, lines: string|string[], {color?}) → Promise         typewriter, tap/A to advance; pushes busy 'dialog'
ui.choose(title, options:[{label, icon?, sub?, disabled?}], {cancel=true, style?:'default'|'romance'}) → Promise<index|-1>
ui.confirm(text, {yes='Sì', no='No'}) → Promise<bool>
ui.toast(text, {icon?, ms=2200});  ui.banner(title, sub?);  ui.areaBanner(name)
ui.sheet(name, data?) / ui.closeSheet() / ui.isOpen()   names: menu team bag dex journal map settings shop box summary
ui.hud: { show(bool), setWanted(n), setMission({title, goal, timer}|null), refresh() }
ui.controls: { show(bool), setBlaster(bool) }     (auto: hidden while busy; A label from ctx.interact.current)
ui.marker(id, target: Object3D|{x,y,z}, {icon:'!'|'❤'|'?'|'★'|'💬', color?, offsetY=0.35});  ui.removeMarker(id)
ui.letterbox(on)
ui.battle: { open({ally, foe, trainer?:{name, count}, allyCount}), update({ally, foe}) (animated bars),
             message(text, {wait=true}) → Promise, menu({canRun}) → Promise<'fight'|'bag'|'team'|'run'>,
             moves(mon) → Promise<moveId|null>, pickTeam(party, {forced}) → Promise<index|-1>,
             pickItem(list, {context:'battle'}) → Promise<id|null>, close() }
```
The HUD updates itself from bus events (`coins:change`, `team:change`, `area:enter`, `wanted:change`,
`objective:change`, `time:hour`). The objective tracker reads `ctx.story.quests.objective()` at 4 Hz and
points an arrow (camera-relative) with the distance. Settings sheet writes `save.state.settings` and
emits `settings:change {key, value}`; Salva → `ctx.save.flush()` + toast "Partita salvata";
Nuova partita → `ui.confirm` → `ctx.startGame(true)`. **Cheats**: triple tap (within 600 ms) on the
coin counter emits `cheat:money`, on the team strip `cheat:level`. Touch controls: floating joystick
(left half), A (context action, shows label), B, Corri, ☰, 🎯 when the blaster is owned; all inside
safe areas; hidden while `ctx.busy.is()`.

## Events (bus)
| Event | Payload | Emitted by |
|---|---|---|
| `game:ready` | `{ctx}` | main |
| `game:start` | `{newGame}` | main (`ctx.startGame`) |
| `save:loaded` / `save:new` / `save:written` | `{state}` | main / core |
| `resize`, `quality:change` | viewport / quality | core |
| `time:phase` / `time:day` / `time:hour` | `{phase}` / `{day}` / `{hour}` | core |
| `busy:change` | `{busy, tags}` | core |
| `flag:set` | `{name, value}` | core |
| `cheat:money` / `cheat:level` | — | core input (Shift+M/L), ui (triple tap) |
| `settings:change` | `{key, value}` | ui |
| `area:enter` | `{id, kind, name, island}` | world |
| `interior:enter` / `interior:exit` | `{id}` | world |
| `ferry:travel` | `{id, from, to}` | world |
| `npc:talk` | `{id}` | actors |
| `encounter` | `{species, level, area}` | creatures |
| `battle:start` | `{kind, trainerId?}` | battle |
| `battle:end` | `{result, kind, trainerId?, foes}` | battle |
| `velmon:seen` / `velmon:caught` | `{species, level, isNew}` | creatures/battle |
| `velmon:levelup` | `{uid, species, level}` | creatures |
| `velmon:evolved` | `{uid, from, to}` | creatures |
| `team:change` | `{}` | creatures |
| `coins:change` | `{coins, delta, reason}` | story |
| `bag:change` | `{id, n}` | story |
| `quest:start` / `quest:step` / `quest:complete` | `{id, step?, reward?}` | story |
| `objective:change` | `{objective}` | story |
| `trainer:spotted` / `trainer:beaten` | `{id}` | story |
| `wanted:change` | `{level}` | story |
| `job:start` / `job:end` | `{kind, success?}` | story |
| `chest:open` | `{id}` | story |
| `held:change` | `{kind}` | story |
| `romance:stage` / `romance:bond` | `{id, stage}` / `{id, bond}` | romance |
| `romance:scene` | `{id, kind, open}` | romance |
| `ui:sheet` / `ui:dialog` | `{name, open}` / `{open}` | ui |

## Save schema (`ctx.save.state`, localStorage key `valmora-v2`)
```js
{
  v: 1, created: 0, playTime: 0,
  settings: { adult: false, adultAsked: false, music: 0.6, sfx: 0.8, quality: 'auto', haptics: true, autoRun: false }, // core creates, ui edits
  flags: {},                                                                       // core (ctx.flags)
  player: { x: 0, z: 0, facing: 0, area: 'alba', interior: null, lastCenter: 'alba', look: null }, // actors
  time: { hours: 9, day: 1 },                                                      // core
  world: { unlocked: {}, doors: {} },                                              // world
  creatures: { party: [], box: [], seen: {}, caught: {}, starter: null },          // creatures
  story: { coins: 300, bag: { pozione: 2 }, quests: {}, tracked: null, beaten: {}, chests: {},
           searched: {}, crime: { wanted: 0, blaster: false, jobsDone: 0 }, held: null },  // story
  romance: { girls: {} },   // romance: { [girlId]: { stage, bond, dates, nights, outings: {} } }
  ui: { tips: {} },                                                                // ui
}
```
`save.reset()` keeps `settings`. Areas must tolerate missing fields (old saves) and fill defaults.

## Data shapes
- **Monster**: `{uid, species, nickname: null, level, xp, hp, moves: [moveId ≤ 4], caughtAt?: areaId}`.
- **Look** (actors): `{sex:'m'|'f', age:'adult'|'kid'|'elder', height: 1 (0.9..1.1), build: 0.5,
  skin:'#f1c7a3', hair:{style:'short'|'spiky'|'bob'|'long'|'ponytail'|'bun'|'curly'|'braid'|'pixie'|'twintails'|'bald', color},
  eyes:'#4a2c1a', lips?, freckles?, top:{style:'tshirt'|'tank'|'shirt'|'blouse'|'hoodie'|'jacket'|'dress'|'uniform'|'coat'|'camisole'|'swimsuit', color, accent?},
  bottom:{style:'shorts'|'pants'|'skirt'|'long_skirt'|'pyjama'|'swim_shorts'|'none', color},
  shoes:{style:'sneakers'|'sandals'|'boots'|'heels'|'flats'|'barefoot', color}, hat?:{style:'cap'|'sunhat'|'beanie'|'chef'|'guard'|'eclissi', color},
  accessory?:'backpack'|'glasses'|'sunglasses'|'scarf'|'necklace'|'bag'}`. Named presets in `LOOKS`
  include `player`, `quercia`, `ginepro`, `rosa`, `fornaio`, `ada`, `neve`, `notte`, `granmaestro`,
  `eclissi_grunt`, `guard`, `fixer`, `champion`, and one per romance woman (`sofia` … `marina`) — the
  romance area may override looks in `girls.js`.
- **Area** (world/map.js): `{id, kind:'town'|'route'|'cave'|'beach'|'sanctuary', name, island,
  levels?:[min,max], music, camera?:{yaw, distance, pitch}}`.
- **Girl** (romance/girls.js): `{id, name, town, poi:'alba.girl1', home:'house.alba.4', mood:'dolce'|'audace'|'timida'|'ironica',
  task:{type:'gift', item}|{type:'money', amount}|{type:'battle', team:[species]}|{type:'champion', town}|{type:'caught', n},
  when:'day'|'sunset'|'night', look}`. Time windows: day 8-18, sunset 17-21, night 20-5.

## Debug hook (`window.__valmora`, only with `?debug`) — engine
`ready` (Promise, resolves on `game:ready`), `ctx`, `errors`, `markReady()`, `freeze(v=true)`,
`step(n=1, dt=1/60)` (n simulation frames synchronously, renders once; returns `loop.t`),
`advance(n, dt)` (no render), `render()`, `start(newGame=false)`, `teleport(x, z)` or
`teleport(poiId)`, `setTime(h, day?)`, `give(id, n)` (`'coins'` or an item id), `battle(speciesId,
level)` (wild battle), `snapshot()`, `quality(tier)`, `logEvents(v)`, `info()` →
`{tier, calls, triangles, geometries, textures, loopT, frame, viewport, area, busy, errors, modules}`,
`register(name, fn)` — any area may add its own helpers (`L.register('stage', (kind) => …)`).
Headless Chrome does not run rAF reliably: always drive time with `step()`.

## Performance budget (iPhone 12+, 60 fps on `mid`)
≤ 120 draw calls, ≤ 350k visible triangles, 1 shadow-casting directional light (2048 high / 1024 mid /
off low, fitted around the player), pixel ratio cap 2 / 1.5 / 1.25. Static scenery merged per island
section (`kit.mergeStatic`), vegetation/props/tall grass with `InstancedMesh`, only the current island
(+ visible neighbour silhouettes as cheap low-poly) in the scene, interiors built lazily and disposed.
Humans: 1 SkinnedMesh + 1 outline each, max ~12 visible NPCs near the player (others hidden by
distance). Velmon ≤ 3 draw calls. No per-frame allocations in hot loops.

## Testing
One-time: `cd tools && npm install`. `node tools/serve.mjs 8790` (one port per builder) serves the
repo; `node tools/shot.mjs "http://localhost:8790/?debug&skiptitle" tmp/x.png [--mobile] [--landscape]
[--script scenario.js]` takes a headless Chrome (SwiftShader) screenshot and prints console errors;
`node tools/strip.mjs` makes animation contact sheets (see `tools/README.md`). **Look at your
screenshots** (Read the PNG) and iterate until it looks like Sun/Moon. Fix every console error.
Test portrait (390×844) and landscape (844×390). Put screenshots in `tmp/` (git-ignored).
