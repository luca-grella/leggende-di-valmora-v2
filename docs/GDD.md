# Leggende di Valmora 2 — Game Design Document

Monster-collector RPG in 3D for the browser, installable as an iPhone PWA. Rebuilt from scratch:
v1 (Three.js + Vite, https://luca-grella.github.io/leggende-di-valmora/) is only a **source of content**
(species, moves, story, trainers, romance, shady jobs, items). v1's graphics (photo textures,
Rocketbox people, flat robotic posing) are **not** reused: Luca found them ugly and robotic.
Tech and feel come from Lenza Lenta v2 (no build step, three r160 vendored, PWA, iPhone touch).

All in-game text is **Italian**. Docs and code are in English. Player/owner: Luca, plays on iPhone.

## Pillars
1. **Looks like Pokémon Sun & Moon.** Stylized, warm, saturated tropical colours, soft toon shading
   (2-3 light bands + soft rim light), thin dark outlines on characters and creatures, rounded
   smooth shapes, no photo textures. One coherent style for everything (terrain, buildings,
   people, Velmon, UI). Everything is **modelled procedurally in code**: no downloaded
   models, textures, HDRIs, fonts or sounds.
2. **Alive, never robotic.** Every movement is eased: acceleration and deceleration, smooth
   turning, idle breathing, blinking, head look-at, secondary motion (hair, ponytails, scarves,
   tails, ears, antennae), squash-and-stretch on Velmon. Cross-faded animation clips, never
   snapping poses. Cameras glide with damping and eased cuts.
3. **Dense islands, not empty open world.** A compact archipelago of handcrafted towns and
   routes: every 10 m there is something (a house, a fence, flowers, an NPC, tall grass, a
   chest, a trainer, a sign). Travel between islands by bridges and ferries.
4. **Classic monster-collector loop.** Walk in tall grass → wild Velmon → turn-based battle in a
   close-up arena → catch with Sfere → level up → evolve with a show. Trainers spot you
   and challenge you. A champion in every town. Story in 3 chapters against the Eclissi.
5. **A real iPhone app.** Full-screen PWA, portrait and landscape, safe areas, virtual
   joystick + context action button, no zoom/selection glitches, offline, 60 fps target on
   iPhone 12+ (low draw calls, merged static geometry, instancing).
6. **Adult romance, tasteful and opt-in.** 14 women with personalities, ways to win them,
   dates and outings, acted with the same characters and close-up cameras. Strict limits
   (see Romance). Off by default.

## Look
- **Palette (tropical Alola feel):** sea shallows `#4fe0d2` → lagoon `#2bb7c9` → deep `#1673a8`;
  sand `#f6dfa0`; grass `#7dcb4c` / `#9bd85a` / tall grass `#3f9e3a`; path dirt `#d9b27a`;
  rock `#b9a48c`; wood `#b97b47`; roofs coral `#e8674a`, teal `#2fa8a0`, sun `#f5b83d`,
  lilac `#9b7fd1`; walls cream `#fff2d8`; flowers hot pink `#ff5f9e`, yellow `#ffd23f`,
  white; sky day `#8fd8ff` → horizon `#d8f4ff`, sunset `#ffb07a`, night `#22305e`.
  Shadows are cool purple-blue, never black. Each island tints this palette (snow, moor,
  canyon, volcano) without leaving the style.
- **Shading:** `MeshToonMaterial` with a shared 3-step gradient ramp + hemisphere fill, rim
  light on characters/Velmon, inverted-hull outlines (characters, Velmon, key props only),
  vertex colours on merged scenery. Subtle bloom only on emissive things (lamps, flames,
  aurora). Soft blob shadows under actors on low quality; one shadow-casting sun on mid/high.
- **People (Sun/Moon proportions):** about 5 heads tall, big expressive heads with large eyes
  (iris + highlight), eyebrows and mouth shapes that animate, smooth rounded limbs, hands
  as mitten + thumb, chunky shoes, clean silhouettes, hair as smooth sculpted volumes with
  physics-like secondary motion. Adults (romance women are clearly adult: taller, mature
  faces and outfits). Skin tones varied.
- **Velmon:** chubby, rounded, big eyes, readable silhouettes, 1-3 accent colours, tiny
  emissive details (flames, sparks, aura). Each species unique (body shape + parts).
- **Buildings:** chunky rounded houses, thick roofs with overhang, bright doors, flower
  boxes, awnings, string lights, fences, lanterns. Pokémon-Center-like **Centro Cura** (red
  roof + white emblem) and **Bottega** (blue awning) in every town.
- **Day/night:** a game day lasts 48 real minutes. Dusk turns everything orange-pink, night is
  deep blue with lit windows, lamps, fireflies, stars. Sleeping at a Centro Cura skips to 8:00.

## Camera
- **Explore:** overhead three-quarter view that follows the player like Sun/Moon and Lenza
  Lenta: pitch ~50°, distance ~13 m, FOV 35°, fixed yaw per area (map data may set a yaw per
  town/route so streets read well), smooth follow with look-ahead in the movement direction,
  closer framing (distance ~9) indoors. Portrait screens use a slightly higher, farther camera.
  No manual rotation needed (optional pinch/two-finger zoom 0.8-1.3).
- **Close-ups** (eased cut or glide, letterbox bars in UI):
  - `dialog`: two-shot at head height over the listener's shoulder, slight drift.
  - `battle`: arena shots — intro sweep, ally over-the-shoulder, foe hero shot, attack
    tracking, hit shake, faint.
  - `capture`: follows the thrown Sfera, then close on the shaking ball (1-3 shakes).
  - `evolution`: slow orbit around the glowing Velmon, flash, reveal.
  - `romance`: soft two-shot (faces and shoulders), shallow framing, warm light; `romance_top`
    for lying under the blanket (heads and shoulders only). Never a close-up of feet or body.
  - `portrait`: one character, for story reveals.

## Controls
| | Keyboard | Touch (iPhone) |
|---|---|---|
| Move | WASD / arrows | virtual joystick (appears where the left thumb touches, left half) |
| Run | hold Shift (or toggle R) | push the joystick to the edge, or the Corri button |
| Context action (talk, enter, read, pick up, throw, ride, confirm) | E / Enter / Space | big **A** button (label + icon of the current action) |
| Back / cancel | Esc / Backspace | **B** button / ✕ on sheets |
| Menu (Squadra, Zaino, Velmondex, Missioni, Mappa, Opzioni, Salva) | Tab / P | ☰ |
| Map | M | 🗺 (inside menu and HUD) |
| Paint blaster (when owned) | F | 🎯 |
| Advance dialogue | E / Enter / Space / click | tap anywhere |
| **Cheat: +1000 monete** | **Shift+M** | **triple tap on the coin counter** |
| **Cheat: lead Velmon +1 level** | **Shift+L** | **triple tap on the team strip** |

Touch controls hide during dialogue, battles (battle has its own buttons), scenes and sheets.

## World — "Arcipelago di Valmora"
v1's 9 regions on a 3×3 grid become **7 islands** linked by routes (on land and bridges) and
ferries. 1 unit = 1 m. Whole archipelago ≈ 1400 × 1400 m, but only the current island (and
the neighbour you see across the water) is built/visible. Towns are ~70-110 m across and
dense; routes are 150-320 m long, winding, with tall grass patches, ledges, trainers, items,
signs, a rest spot. Islands have beaches and at least one cave.

| Island | Town (id) | Look | Wild levels |
|---|---|---|---|
| **Isola Aurora** (centre, start) | **Borgo Alba** (`alba`), **Villa Petalo** (`petalo`, west coast, ex Costa Fiorita), **Città Fulgida** (`fulgida`, east, the big city) | green valley, flower fields, vineyards, white cliffs; the city has a plaza, market stalls, alleys | 3-14 |
| **Isola di Giada** (NE) | **Borgo Muschio** (`muschio`) | dense jungle, giant trees, hidden temple ruins | 10-18 |
| **Isola della Nebbia** (N) | **Castelfosco** (`fosco`) | misty moor, purple heather, ruined castle | 14-22 |
| **Isola Gelida** (NW) | **Borgo Cristallo** (`cristallo`) + **Santuario dell'Alba** on the peak | snow, pines, frozen lake, aurora at night | 22-34 |
| **Isole Coralline** (S) | **Porto Corallo** (`corallo`) | harbour on stilts, lagoon, coral islets, palm beach | 18-26 |
| **Isola del Sole** (SE) | **Baia del Sole** (`sole`) | tropical bay, volcano, black-sand beach | 30-40 |
| **Altopiano Ramato** (SW) | **Rocca Ramata** (`ramata`) | red canyon, mesas, cacti, desert village | 26-36 |

Routes and connections (area ids in brackets):
| Route | Connects | Terrain | Wild Velmon (weights; night ×2 for Spettro) | Lv |
|---|---|---|---|---|
| Percorso 1 · Sentiero dei Fiori (`r1`) | Alba ↔ Petalo | meadow, flower fields, small river with bridge | pulcino 4, topolux 3, lanuvo 3, grillo 2, farfallina 1 | 3-7 |
| Percorso 2 · Via dei Mulini (`r2`) | Alba ↔ Fulgida | hills, windmills, pylons | topolux 3, voltino 3, pulcino 2, lanuvo 2, pipistro 2 | 8-14 |
| Percorso 3 · Ponte di Giada (`r3`) | Fulgida ↔ Muschio | long wooden bridge, then jungle | fogliolo 3, grillo 4, scoiattolo 3, pipistro 1 | 10-18 |
| Percorso 4 · Brughiera (`r4`) | Muschio ↔ Castelfosco | land bridge, moor, standing stones | ombrale 3, lanuvo 3, pipistro 3, grillo 2 | 14-22 |
| Percorso 5 · Passo Gelido (`r5`) | Castelfosco ↔ Cristallo | rope bridge, snowy pass | nevino 4, brinella 3, roccione 2, ombrale 1 | 22-30 |
| Sentiero del Santuario (`santuario`) | Cristallo ↔ Santuario dell'Alba | switchbacks to the peak | brinella 3, nevino 3, roccione 2 | 28-34 |
| Percorso 6 · Lagune Coralline (`r6`) | Corallo ↔ coral islets / Grotta Marina | sandbars, shallow lagoon, palms | goccino 4, granchio 3, pulcino 2, farfallina 1 | 18-26 |
| Percorso 7 · Sentiero del Vulcano (`r7`) | Sole ↔ volcano rim | black sand, lava rocks, jungle | fiammello 3, goccino 2, granchio 2, scoiattolo 2, voltino 1 | 30-40 |
| Percorso 8 · Canyon Ramato (`r8`) | Ramata ↔ mesa top | canyon floor, arches | sabbiolo 4, roccione 3, fiammello 2, voltino 1 | 26-36 |

Ferries (dock interaction, fade, short boat-ride vignette): **Alba (Spiaggia dell'Alba) ↔
Corallo**, **Corallo ↔ Sole**, **Petalo ↔ Ramata**, **Fulgida ↔ Corallo** (after chapter 2).
Gates: Percorso 3 bridge opens after Chapter 1; ferries to Sole and Ramata after Chapter 2
begins; Percorso 5 after Castelfosco's champion or Chapter 3 start (flags, see ARCHITECTURE).

Caves (`grotta_sussurro` on r4, `grotta_cristallo` near Cristallo, `grotta_marina` on r6,
`grotta_vulcano` on r7): darker toon lighting, glowing crystals/mushrooms, encounters
everywhere (not only grass): ombrale/pipistro/roccione; nevino/roccione/brinella;
goccino/granchio/pipistro; fiammello/roccione/sabbiolo.

Every town has: **Centro Cura** (heal team, sleep to morning, PC box), **Bottega** (shop),
3-6 enterable houses with residents, furniture, searchable drawers/wardrobes/fridges,
a plaza with a landmark (well, fountain, statue, lighthouse…), benches, market stalls in
Fulgida and Corallo, the town **Campione** standing at the landmark, a date spot nearby
(beach, belvedere, garden) for the romance. Interiors are separate small rooms entered with a
fade (camera closer).

Ambient life: villagers wandering with routines (home at night), kids running, Velmon
crossing (non-battle ambient Velmon in towns: topolux, pulcino), birds, butterflies,
fireflies at night, boats bobbing, waves foam on beaches, wind in grass and palms.

## Velmon (ported from v1 `src/creatures/species.js`, names unchanged)
11 types: Normale, Fuoco, Acqua, Erba, Elettro, Ghiaccio, Roccia, Terra, Volante, Coleottero,
Spettro — same effectiveness chart, same 35 moves (power/accuracy), same base stats, catch
rates, XP yields and learnsets. **45 species**:

| Family | Types | Evolves at |
|---|---|---|
| Germoglio → Arbusto → Silvarco (starter) | Erba → Erba → Erba/Terra | 16, 32 |
| Tizzone → Brace → Vulcanide (starter) | Fuoco → Fuoco → Fuoco/Roccia | 16, 36 |
| Ondina → Marea → Abissale (starter) | Acqua → Acqua → Acqua/Ghiaccio | 16, 36 |
| Pulcino → Pennuto → Grifalco | Normale/Volante | 18, 36 |
| Topolux → Ratolux | Normale | 20 |
| Lanuvo → Nembolana | Normale → Normale/Volante | 24 |
| Grillino → Cicalone | Coleottero | 18 |
| Fogliolo → Cespuglione | Erba | 22 |
| Scoiattolo → Ghiandaro | Normale | 22 |
| Farfallina → Aurelia | Coleottero/Volante | 24 |
| Pipistro → Vampistro | Spettro/Volante | 22 |
| Ombrale → Tenebrale | Spettro | 30 |
| Voltino → Fulminax | Elettro | 26 |
| Roccione → Colossasso | Roccia/Terra | 36 |
| Sabbiolo → Desertauro | Terra | 30 |
| Fiammello → Leonardente | Fuoco | 36 |
| Goccino → Cascatone | Acqua | 24 |
| Granchietto → Granchione | Acqua/Roccia | 28 |
| Nevino → Valangone | Ghiaccio | 32 |
| Brinella → Cristalla | Ghiaccio/Volante | 34 |
| **Aurorante** (legendary, Lv 45 in the story) | Fuoco/Volante | — |

The v1 `model` params (body shape quad/biped/bird/fluffy/bug/blob/butterfly/bat/ghost/rock/crab,
colours, parts) are a **starting hint** only: v2 models are redesigned cuter and rounder,
Sun/Moon style, each with idle (breathing, blinking, ear/tail sway), walk/hop/fly, attack
(physical lunge), special (type effect: flames, water burst, leaves, sparks, frost, rocks,
wind, ghost fade), hit (squash + flash), faint (droop + sink), happy (hop) animations.

## Battle, catch, evolution
- **Encounters:** walking in tall grass (and anywhere in caves) rolls an encounter every
  ~1.2 s of movement (≈ 9% per check), species by area table, level in the area range.
  Ghost (Spettro) species weight ×2 at night. A rustle + "!" flash, then transition swirl.
- **Arena:** the battle happens where it started: the camera cuts to a close-up arena on
  the spot (ground under the two Velmon flattened/decorated; tall grass around), player
  character visible behind their Velmon (throw pose), the trainer behind theirs.
- **Turn-based** (v1 rules): faster Velmon attacks first; damage
  `((2·L/5+2)·P·A/D/50+2) × STAB 1.5 × effectiveness × random(0.85..1)`, crit 1/16 ×1.5,
  accuracy check. Menu: **Lotta** (4 moves with type colour and PP-less), **Zaino**
  (items), **Squadra** (switch), **Fuga** (wild only, speed-based chance).
  Messages in Italian: "È superefficace!", "Non è molto efficace…", "Non ha effetto…".
- **Catch:** Sfera (×1), Megasfera (×1.5). Chance as v1:
  `clamp(((3 − 2·hp/maxHp)/3) × rate/255 × ball, 0.04, 0.95)` (legendary: rate 6). Throw
  animation, absorb flash, 1-3 shakes, click + stars or burst out. New species → Velmondex
  entry. Team of 6, extra go to the Box (Centro Cura PC).
- **XP / levels:** XP = `species.xp × foeLevel / 7` (×1.5 for trainers), cubic curve, new
  moves at learnset levels (max 4; oldest replaced with a prompt "Dimenticare…?").
- **Evolution:** at the end of a battle, a Velmon at or above its evolution level evolves:
  "Cosa? {nome} si sta evolvendo!" — glow, silhouette pulse between forms, flash, reveal,
  happy animation, fanfare. Can't be cancelled in v2 (simpler; B does nothing).
- **Defeat:** all fainted → lose 1/10 of coins, fade, wake up in the last Centro Cura healed.

## Trainers (ported from v1 `src/world/trainers.js`)
- 2-3 per route, placed by hand at route POIs, classes: Escursionista, Ragazza Pic-nic,
  Pescatore, Studente, Ciclista, Ranger, Montanara, Velista (+ Surfista on Corallo/Sole,
  Esploratrice in caves). Italian first names from v1 list. Teams of 1-3 from the area's
  table at area levels (evolved forms above evolution level + 2). Reward 40 × top level.
- **Sight:** cone 13 m / ±35°, blocked by buildings; on sight: "!" bubble, music sting,
  player stops, trainer walks up, dialogue (v1 BEFORE/AFTER lines), battle.
  Beaten trainers stay beaten (save) and say their AFTER line.
- **Champions:** one per town at the landmark, team = area max level + 2 (2 Velmon in
  Alba, 3 elsewhere), reward 120 × level, banner "Nuovo Campione di …!".

## Story (ported from v1 `src/story/quests.js`)
**Prologo — "Benvenuto a Valmora"** (new): wake up in your room in Borgo Alba, mum says
Prof.ssa Quercia is waiting at her lab. Choose the starter (Germoglio, Tizzone or Ondina,
Lv 5, presented on a table with close-ups). First wild battle tutorial on Percorso 1
outskirts; Quercia gives 5 Sfere and the Velmondex. Unlocks the menu.

**Capitolo 1 · L'ombra dell'Eclissi**
1. Sconfiggi il Campione di Borgo Alba (vicino al pozzo).
2. Parla con la Prof.ssa Quercia → letter.
3. Porta la lettera al Dott. Ginepro a Villa Petalo.
4. Sconfiggi le due reclute dell'Eclissi all'accampamento (on Percorso 1 cliffs).
5. Torna dal Dott. Ginepro. Reward 1500 monete + 2 Superpozioni. Flag `ch1_done` (opens
   the bridge on Percorso 3).

**Capitolo 2 · Il magazzino dell'Eclissi**
1. Chiedi a Er Faina, nei vicoli di Città Fulgida.
2. Sconfiggi le due reclute davanti al magazzino (south of Fulgida, purple banners).
3. Sconfiggi il Comandante Notte.
4. Racconta tutto alla Prof.ssa Quercia (reveals Aurorante). Reward 3000 + 2 Ravviva +
   2 Superpozioni. Flag `ch2_done`.

**Capitolo 3 · Il santuario dell'alba**
1. Vai a Borgo Cristallo e parla con la Guardiana Neve.
2. Sali al santuario di Aurorante, in cima ai monti.
3. Sconfiggi il Gran Maestro dell'Eclissi.
4. Affronta Aurorante (Lv 45) e prova a catturarlo (retry allowed). Reward 5000 + 3
   Ravviva. Ending vignette: dawn over the archipelago. Flag `ch3_done`.

Dialogue lines are ported from v1 (Italian), lightly expanded. Story scenes use the dialog
close-up camera and actor gestures (talk, point, nod, surprised, laugh).

**Side quests:** Il Topolux di Nonna Rosa (find Briciola outside Alba, bring it back:
400 + 2 Pozioni), Pane caldo (Fornaio Bruno in Alba → Fornaia Ada in Muschio: 600 +
Pozione), Re della strada (beat 6 route trainers: 1500), Cacciatore di tesori (open 5
hidden chests: 2 Ravviva; 30+ chests total), Collezionista (catch 10 species: 2000 + 10
Sfere), plus new small ones per town (lost hat, deliver letter, photo of a rare Velmon) as
filler (optional, story builder's choice).

Journal (Missioni): main quests ★, side quests 📜, tap to track. Tracked objective shows at
the bottom of the HUD with a **direction arrow** and distance, on the map, and as a golden
light column in the world.

## Shady jobs (ported from v1 `src/world/crime.js`)
Cartoonish, no blood. Fixers: **Er Faina** (Fulgida alleys) and **Zio Murena** (Corallo
docks). Jobs: **Consegna** (timed delivery of a parcel to a contact on the same island,
pay 500+), **Colpo** (grab the cash box from a market stall, then lose the guards: 600),
**Corsa** (8 rings along a route, scooter recommended: 500), **Lotta clandestina** (bet
100-500 on a battle vs Tony Due Denti, La Vipera, Rocco il Muro, Gina Pugno Duro, Il Barone).
**Wanted level** 0-3 stars: guards (blue uniforms) notice only what they see, chase at
walking pace (faster at 3★), search where they lost you, give up after a while; hiding in a
house drops the trail. Caught: **Arrenditi** (fine 10% coins), **Mazzetta** (bribe 200×★),
**Opponi resistenza** (battle vs guard's Velmon). **Scooters** to steal (Alba, Fulgida,
Corallo), driven with the joystick. **Spara-vernice** (400 from Er Faina, F/🎯) stuns guards
(paint-covered, dizzy stars) but raises wanted. Throwable objects (vasi, mele, palle, libri,
casse) stun guards too. Searching drawers in houses gives coins/items; if the owner sees you,
+1★.

## Items & shop (ported from v1 `src/items.js`)
| id | Name | Price | Effect |
|---|---|---|---|
| `sfera` | Sfera | 200 | catch ×1 |
| `megasfera` | Megasfera | 600 | catch ×1.5 (new) |
| `pozione` | Pozione | 300 | +50 PS |
| `superpozione` | Superpozione | 700 | full PS |
| `ravviva` | Ravviva | 1200 | revive with half PS |
| `blaster` | Spara-vernice | 400 (Er Faina) | key item |
Carried gift objects (held in hand, not in the bag): `mela`, `vasofiori`, `palla`, `libro`, `cassa`.
Start: 300 monete, 5 Sfere (from Quercia), 2 Pozioni.

## Romance (18+, opt-in) — ported from v1 `src/story/romance.js`, with strict limits
**Toggle:** at the first start the title screen asks "Questo gioco contiene scene romantiche
per adulti (18+). Vuoi attivarle?" — **default off**; changeable anytime in Opzioni. When
off, the 14 women are ordinary friendly NPCs (no hearts, no romance lines, no romance
quests). All characters are adults.

**The 14 women** (town, personality, how to win her, favourite date time):
Sofia (Alba, dolce, gift mela, day) · Elisa (Alba, audace, battle tizzone+voltino, sunset) ·
Bianca (Alba, ironica, beat Alba's champion, night) · Greta (Alba, timida, 300 monete gift,
day) · Viola (Petalo, dolce, vasofiori, sunset) · Ilaria (Muschio, timida, libro, day) ·
Vanessa (Fulgida, audace, 1000 monete, night) · Nina (Fulgida, ironica, battle
fulminax+ratolux+vampistro, night) · Perla (Corallo, dolce, palla, day) · Lucia (Sole,
audace, catch 12 species, sunset) · Carmen (Ramata, audace, battle desertauro+leonardente,
sunset) · Morgana (Fosco, ironica, libro, night) · Stella (Cristallo, timida, beat
Cristallo's champion, night) · **Marina** (Corallo, audace-ironic harbour girl: vasofiori →
beach after 20:00 → her house; her own quest "Una sera a Porto Corallo").
Each has a distinct look (hair style/colour, outfit, skin), a ❤ marker when romance is on.

**Flow per woman** (a quest `rom_<id>`): 0 meet + her request → 1 date at her spot at her
favourite time (walk together, talk, kiss) → 2 evening at her home: talk, then up to 3
rounds of choices, then the night is implied → morning after line. Afterwards: visit her
anytime (home evening again) and invite her on **outings**: Cena in osteria (wine, share a
dessert, kiss, whisper, stroke her hair), Giro in scooter (hug from behind while riding,
stop at a viewpoint), Bagno di notte (wading/swimming at night in swimwear, framed from
the waist up: splash, carry her in the water, kiss, hug), Pic-nic (strawberries, head on her
lap, kiss, massage her legs/feet, stroke hair). **Bond** (intesa) grows with each outing and
night (tiers 0/1/2 at 0, 2, 5) and changes her lines.

**Allowed intimate choices — the ONLY ones that may exist:**
- Baciala · Accarezzale i capelli · Massaggiale le spalle · Massaggiale la schiena ·
  Massaggiale le gambe · Massaggiale i piedi · Baciale i piedi · Leccale i piedi ·
  Baciale il collo · Leccale il collo · Mordicchiale l'orecchio · Stringila a te ·
  Sussurrale qualcosa all'orecchio · "Lasciati guidare da lei…" (allusive lines per
  personality that name nothing) · Continua / Basta così.
- **Undressing** (agreed with Luca): "Spogliatevi a vicenda" and the way to bed take both
  **down to the underwear** with a visible animation (top over the head, bottoms off), never
  further. Everything is acted with real contact: hands lie on her shoulders/back/legs/feet,
  lips meet, hugs wrap, bodies sit/kneel/lie on the real sofa, floor and bed, nobody goes
  through anybody or any furniture, and every change of pose is a visible transition.
- Intimacy can be **implied**: lying together under an opaque, tucked blanket, only heads and
  shoulders visible. The single agreed exception to "underwear stays on": once under the
  blanket she slips her underwear off **under the sheet** — shown only as a shoulder / hand
  movement (a bulge travelling under the quilt), then the garment slides out from under the
  blanket and lies on the floor beside the bed. Nothing below the shoulders is ever visible
  from any angle (bed cameras are clamped above the blanket; her body keeps its underwear
  geometry under it anyway). Then the night passes, fade to the morning.
- Feet actions (massage, kiss, lick her feet): a **medium shot** where her face, her foot and
  his face/hands on it are all clearly visible; never an extreme close-up, and no menu for
  parts of the foot — the kisses vary by themselves between the top of the foot, the toes and
  the ankle, in a different order every time.
- **NEVER:** nudity or anatomy, options about intimate body parts, sexual acts shown or
  described, choosing parts of the foot, foot close-ups, removing underwear anywhere except
  the implied under-the-sheet moment above. v1's `undress` lines, `under` colours and
  anything similar are **not ported**.
- Lines are flirtatious, affectionate, funny; personality-specific (dolce, audace, timida,
  ironica), ported from v1 minus anything above.

## Save, new game, settings, cheats
- Autosave to localStorage (`valmora-v2`) on every important event and every 30 s; **Salva**
  button in the menu (toast "Partita salvata"); **Nuova partita** with confirmation (wipes
  save, keeps settings incl. the 18+ choice). Title screen: **Continua** / **Nuova partita**.
- Opzioni: Contenuti per adulti (18+) on/off, musica, effetti, qualità grafica
  (auto/bassa/media/alta), vibrazione, corsa automatica.
- Cheats always available: **Shift+M** / triple tap coin counter = +1000 monete (toast
  "+1000 monete 💰"); **Shift+L** / triple tap team strip = lead Velmon +1 level (level-up
  message, new moves, evolution if due).

## UI (Sun/Moon flavour)
Rounded panels with thick soft borders, gradient fills (white → pale cyan), drop shadows,
chunky rounded system font (`ui-rounded`), coloured type chips, HP bars green → yellow → red
that drain smoothly. HUD: coins (top-left), clock + area name (top-centre, area banner on
entering), team strip with 6 balls (top-right), wanted stars and mission timer when
relevant, objective tracker with arrow (bottom), joystick + A + B + ☰ (bottom corners,
respecting safe areas). Dialogue box at the bottom with speaker name tab and typewriter
text, ▼ indicator; choices as a vertical list of pill buttons. Sheets: Squadra, Zaino,
Velmondex (thumbnails rendered from the 3D models), Missioni, Mappa (stylized island map
with markers), Opzioni, Bottega, Box.

## Out of scope for now (ideas)
Chapter 4+ (gyms, Lega di Valmora), more legendaries, surfing/riding Velmon, trading,
clothing shop, photo mode, English localisation.
