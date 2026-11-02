# Tools

Node helpers for local testing. One-time setup: `cd tools && npm install` (installs `puppeteer-core`;
the tools drive the installed Google Chrome headless with SwiftShader WebGL — set `CHROME_PATH` to override).

## serve.mjs — static server
```
node tools/serve.mjs 8790        # serves the repo root, no caching
```
Run it in the background, one port per agent/area, and kill it when you are done.

## shot.mjs — screenshot + console check
```
node tools/shot.mjs <url> <out.png> [--mobile] [--landscape] [--w 1280 --h 800] [--wait 2500] [--script scenario.js] [--full]
```
- `--mobile` = iPhone-ish 390x844 touch viewport (DPR 2); add `--landscape` for 844x390.
- Prints console errors and warnings, uncaught page errors (exit code 1) and failed requests.
  404s of optional game modules under `src/` are summarised on one `[info]` line (expected while areas are being built).
- `--script` runs a scenario in the page after load (see below). Its return value is printed as `script result: {...}`.

## strip.mjs — animation contact sheet
```
node tools/strip.mjs <url> <out.png> [--script setup.js] [--frames 12] [--every 5] [--cols 6] [--cell 300]
                     [--focus] [--crop-size 0.55] [--crop x,y,w,h] [--frame-script per-frame.js]
```
Freezes the rAF loop, then for each frame: runs the per-frame hook, advances `--every` simulation steps of 1/60 s
(`__valmora.step`), and copies the canvas (or a crop) into a labelled grid cell (`#i  t=…s`).
- `--focus` crops a square around the object the camera follows (player or placeholder dummy) — ideal for reviewing a
  character or creature animation. `--crop-size` is the square's size as a fraction of the canvas height.
- Per-frame logic: `--frame-script f.js` (has `i`, `L` in scope) or define `window.__stripFrame = i => {...}` in the setup script.
- Tip: in the setup script, `L.ctx.time.paused = true; L.setTime(13)` fixes the light, `L.ctx.cameraRig.closeUp('portrait', {target: obj})`
  frames a character closer.

Example (actors):
```js
// tmp/actors/wave.js  (setup)
L.ctx.time.paused = true; L.setTime(11);
const h = L.ctx.actors.createHuman(L.ctx.actors.looks.sofia); L.ctx.scene.add(h.object);
L.ctx.cameraRig.closeUp('portrait', { target: h.object });
h.play('wave', { loop: false });
```
`node tools/strip.mjs "http://localhost:8792/sandbox/actors.html" tmp/actors/wave.png --script tmp/actors/wave.js --frames 18 --every 3 --focus`

## Scenario scripts (shot.mjs --script, strip.mjs --script)
A scenario is the body of an async function evaluated in the page. These helpers are in scope:

| name | what |
|---|---|
| `L` | `window.__valmora`, already awaited `ready` (resolves on bus `game:ready`; 20 s timeout). `null` if the page isn't in debug mode. |
| `sleep(ms)` | real-time wait |
| `waitFor(fn, ms=10000)` | poll until `fn()` is truthy, returns the value (or null on timeout) |
| `shot(name)` | `await shot('dusk')` saves an extra screenshot `<out>-dusk.png` right now (shot.mjs only) |

The page must expose the debug hooks: `index.html?debug`, or a sandbox that calls `createCore({ debug: true })` and
emits `ctx.bus.emit('game:ready')` (or calls `ctx.debug.markReady()`) once it is set up.

`window.__valmora` (= `ctx.debug`), full list in docs/ARCHITECTURE.md "Debug hook":

| hook | what |
|---|---|
| `ctx` | the whole context (`L.ctx.world`, `L.ctx.player`, `L.ctx.battle`, …) |
| `freeze(v=true)` | stop the rAF loop so only `step()` advances time — do this first for deterministic captures |
| `step(n=1, dt=1/60)` | run n simulation frames synchronously, render once at the end; returns `loop.t` |
| `advance(n=1, dt)` | like step but never renders |
| `render()` | render one frame now |
| `start(newGame)` | start the game (pages opened with `?skiptitle` start by themselves) |
| `teleport(x, z)` / `teleport('alba.plaza')` | move the player and snap the camera |
| `setTime(h, day?)` | set the clock |
| `give(id, n)` | `give('coins', 1000)`, `give('sfera', 5)` (Story) |
| `battle(speciesId, level)` | start a wild battle (Creatures/Battle) |
| `quality(tier)` | force `low|mid|high|auto` without saving |
| `snapshot()` | PNG data URL of the canvas |
| `logEvents(v=true)` | log every bus event |
| `register(name, fn)` | areas add their own helpers |
| `info()` | `{tier, calls, triangles, geometries, textures, loopT, frame, viewport, area, busy, errors, time, modules}` |
| `errors` | uncaught errors captured since load |

Typical scenario (`node tools/shot.mjs "http://localhost:8790/?debug&skiptitle" tmp/x.png --script tmp/x.js`):
```js
L.freeze();                       // deterministic from here on
L.ctx.time.paused = true;
L.setTime(18.6);                  // sunset
L.teleport('alba.plaza');
L.step(90);                       // 1.5 s of simulation, then render
await shot('sunset');
window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));   // walk "up" the screen
L.step(60);
window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
return L.info();
```
Programmatic input without the keyboard: `L.ctx.input.setJoystick(0, 1)`, `L.ctx.input.setButton('a', true)` /
`setButton('a', false)`, `L.ctx.input.press('menu')`. Cheats: `KeyboardEvent('keydown', {code:'KeyM', shiftKey:true})`.

Headless notes: requestAnimationFrame is unreliable headless, so always drive time with `step()`. `?debug` keeps the
saved/auto quality tier; force one with `&quality=mid` or `L.quality('low')`.
