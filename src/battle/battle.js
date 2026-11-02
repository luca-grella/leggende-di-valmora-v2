// One battle: transition → arena on the spot → intro (wild appears / trainer sends out) → turns
// (Lotta / Zaino / Squadra / Fuga) → faint, XP, level-ups, new moves → end (catch, win, lose, run) → evolutions →
// cleanup. Rules from v1 (docs/GDD.md "Battle, catch, evolution"). The HUD/menus are ctx.ui.battle; without it
// (or with ctx.battle.auto = true) the battle plays itself (headless tests, missing UI).
import * as THREE from 'three';
import { SPECIES, MOVES, TYPE_COLORS } from '../creatures/species.js';
import { nameOf, stats, maxHp, gainXp, learnMove, pendingEvolution } from '../creatures/monster.js';
import { buildVelmon } from '../creatures/model.js';
import { buildSphere } from '../creatures/sphere.js';
import { buildArena } from './arena.js';
import { computeDamage } from './damage.js';
import { chooseMove } from './ai.js';
import { throwBall, playerThrow } from './capture.js';
import { playEvolution } from './evolution.js';
import { wait, tween } from './util.js';

/** Moves acted as a physical lunge (+ impact); every other move is a ranged/special effect of its type. */
const CONTACT = new Set(['azione', 'graffio', 'carica', 'iperbotta', 'beccata', 'puntura', 'leccata']);
const MUSIC = { wild: 'battle_wild', trainer: 'battle_trainer', guard: 'battle_trainer', bet: 'battle_trainer', champion: 'battle_champion', boss: 'eclissi', legendary: 'battle_legend' };
const TRAINERISH = new Set(['trainer', 'champion', 'boss', 'guard', 'bet']);

export class BattleRun {
  /**
   * @param {any} ctx
   * @param {{kind?:string, foes:object[], trainer?:any, at?:{x:number,z:number,facing?:number}, canRun?:boolean, canCatch?:boolean, music?:string}} opts
   * @param {{fx:any, auto?:boolean}} deps
   */
  constructor(ctx, opts, deps) {
    this.ctx = ctx;
    this.kind = opts.kind || 'wild';
    this.foes = (opts.foes || []).filter(Boolean);
    this.trainer = opts.trainer || null;
    this.isTrainer = TRAINERISH.has(this.kind) || !!this.trainer;
    this.canRun = opts.canRun ?? (this.kind === 'wild');
    this.canCatch = opts.canCatch ?? (this.kind === 'wild' || this.kind === 'legendary');
    this.music = opts.music || MUSIC[this.kind] || 'battle_wild';
    this.at = opts.at || null;
    this.fx = deps.fx;
    this.auto = !!deps.auto;
    this.hud = this.auto ? null : (ctx.ui?.battle || null);
    this.trash = [];
    this.leveled = new Set();
    this.participants = new Set();
    this.runTries = 0;
    this.result = null;
  }

  // ---------------------------------------------------------------- helpers ----
  get team() { return this.ctx.creatures?.team; }
  get party() { return this.team?.party || this.ctx.save.state.creatures?.party || []; }
  foeName(m = this.foe) {
    const n = nameOf(m);
    if (this.kind === 'legendary') return n;
    return this.isTrainer ? `${n} avversario` : `${n} selvatico`;
  }
  /** Battle message. wait=true waits for the tap (A); false auto-advances. */
  async say(text, { wait: w = true } = {}) {
    this.phase = 'say: ' + text;
    if (this.hud?.message) {
      try { await this.hud.message(text, { wait: w }); return; } catch (e) { console.warn('[battle] message', e); }
    }
    if (!this.quiet) console.info('[battle]', text);
    await wait(this.ctx, Math.min(2.2, 0.5 + text.length * 0.018) * (this.fast ? 0.25 : 1));
  }
  cam(kind, extra = null) {
    const ctx = this.ctx;
    const a = this.allyModel?.object?.visible ? this.allyModel.object : this.allyAnchor;
    const f = this.foeModel?.object?.visible ? this.foeModel.object : this.foeAnchor;
    try {
      // portrait phones: the rig's side-on framings get too wide, so frame along the battle axis (Sun/Moon style:
      // the ally big at the bottom, the foe in the upper middle)
      if (!extra && (kind === 'battle_wide' || kind === 'battle_intro' || kind === 'battle_ally')) {
        const spec = this.axisShot(kind);
        if (spec) return ctx.cameraRig.shot(spec, { dur: kind === 'battle_intro' ? 2.0 : kind === 'battle_ally' ? 0.7 : 0.9, ease: 'smooth', drift: 0.04 });
      }
      return ctx.cameraRig?.closeUp?.(kind, extra || { ally: a, foe: f }) || Promise.resolve();
    } catch (e) { console.warn('[battle] camera', e); return Promise.resolve(); }
  }
  /** Sun/Moon framings along the battle axis: the ally from behind (bottom), the foe facing us (upper middle). */
  axisShot(kind) {
    const A = this.arena; if (!A) return null;
    const portrait = (this.ctx.viewport?.aspect ?? (innerWidth / innerHeight)) < 0.9;
    const S = A.slots, fw = A.forward, rt = A.right;
    const ha = this.allyModel?.height ?? 0.9, hf = this.foeModel?.height ?? 0.9;
    const ally = new THREE.Vector3(S.ally.x, S.ally.y, S.ally.z), foe = new THREE.Vector3(S.foe.x, S.foe.y, S.foe.z);
    const big = Math.max(ha, hf);
    if (kind === 'battle_ally') {
      const pos = ally.clone().addScaledVector(fw, -2.4 - ha * 0.7).addScaledVector(rt, (portrait ? 0.65 : 1.1) + ha * 0.25); pos.y += ha + 0.75;
      const tgt = ally.clone().lerp(foe, 0.72); tgt.y += hf * 0.55;
      return { position: pos, target: tgt, fov: portrait ? 40 : 34 };
    }
    const pos = portrait
      ? ally.clone().addScaledVector(fw, -4.0 - big * 1.2).addScaledVector(rt, 1.55).setY(ally.y + 2.0 + big * 1.0)
      // landscape: further back and less to the side, so the player (behind the ally, on the left) stays whole
      // on screen next to the ally, the foe and the trainer
      : ally.clone().addScaledVector(fw, -3.0 - big * 0.7).addScaledVector(rt, 1.0 + big * 0.3).setY(ally.y + 1.15 + big * 0.6);
    const tgt = ally.clone().lerp(foe, portrait ? 0.56 : 0.5); tgt.y += big * (portrait ? 0.3 : 0.28);
    if (!portrait) tgt.addScaledVector(rt, -0.6);
    const spec = { position: pos, target: tgt, fov: 42 };
    if (kind === 'battle_intro') {
      const fpos = foe.clone().addScaledVector(fw, -(1.6 + hf * 1.2)).addScaledVector(rt, 0.4); fpos.y += hf * 0.6 + 0.2;
      const ftgt = foe.clone(); ftgt.y += hf * 0.55;
      spec.from = { position: fpos, target: ftgt, fov: 34 };
    }
    return spec;
  }
  hudUpdate(o) { try { this.hud?.update?.(o); } catch (e) { console.warn('[battle] hud', e); } }
  aliveFoes() { return this.foes.filter(m => m.hp > 0); }
  allyCount() { return this.party.filter(m => m.hp > 0).length; }

  // ---------------------------------------------------------------- main ----
  async run() {
    const ctx = this.ctx;
    let result = 'run';
    try {
      result = await this.main();
    } catch (e) {
      console.error('[battle] crashed', e);
      result = this.result || 'run';
    }
    try { await this.cleanup(result); } catch (e) { console.error('[battle] cleanup failed', e); }
    return result;
  }

  async main() {
    const ctx = this.ctx;
    if (!this.foes.length) return 'run';
    const ally0 = this.team?.firstAlive?.() || this.party.find(m => m.hp > 0);
    if (!ally0) { console.warn('[battle] no Velmon able to fight'); return this.party.length ? 'lose' : 'run'; }
    this.foe = this.foes.find(m => m.hp > 0) || this.foes[0];

    // seen
    for (const m of this.foes.slice(0, 1)) this.markSeen(m);

    // ---- transition in ----
    ctx.audio?.sfx?.('encounter');
    ctx.audio?.music?.(this.music);
    ctx.haptic?.([15, 40, 15]);
    if (ctx.fade) {
      await ctx.fade.flash('#ffffff', 180);
      await ctx.fade.flash('#ffffff', 180);
      await ctx.fade.out(240, '#10142a');
    }
    this.setup();
    this.hud?.open?.({ ally: null, foe: this.foe, trainer: this.isTrainer && this.trainer ? { name: this.trainer.name, count: this.foes.length } : null, allyCount: this.allyCount() });

    // ---- intro ----
    if (this.isTrainer) {
      this.foeModel.object.visible = false;
      if (this.trainerObj) ctx.cameraRig?.closeUp?.('portrait', { target: this.trainerHuman?.head ? this.trainerHuman : this.trainerObj }, { dur: 0, ease: 'cut' });
      else ctx.cameraRig?.closeUp?.('battle_intro', { ally: this.allyAnchor, foe: this.foeAnchor }, { dur: 0, ease: 'cut' });
      await ctx.fade?.in?.(320);
      this.trainerHuman?.play?.('wave', { loop: false });
      this.trainerHuman?.setExpression?.('grin');
      await this.say(this.trainer?.name ? `${this.trainer.name} ti sfida!` : 'Ti hanno sfidato!');
      const said = this.say(`${this.trainer?.name || 'L\'avversario'} manda in campo ${nameOf(this.foe)}!`, { wait: false });
      await this.sendOut('foe', this.foe);
      await said;
    } else {
      // the wild Velmon pops out of the grass
      this.foeModel.object.visible = true;
      this.foeModel.play('appear');
      ctx.world?.rustle?.(this.foeModel.object.position.x, this.foeModel.object.position.z);
      this.fx.play('dust', this.foeModel.object, null, { n: 8, color: '#bfe39a' });
      this.cam('battle_intro');
      await ctx.fade?.in?.(320);
      await wait(ctx, 0.5);
      this.foeModel.play('happy');
      await this.say(this.kind === 'legendary' ? `${nameOf(this.foe)} ti sbarra la strada!` : `Un ${nameOf(this.foe)} selvatico è apparso!`);
    }
    this.ally = ally0;
    const go = this.say(`Vai, ${nameOf(this.ally)}!`, { wait: false });
    await this.sendOut('ally', this.ally);
    await go;
    this.cam('battle_wide');

    // ---- turns ----
    for (let guard = 0; guard < 400; guard++) {
      const action = await this.chooseAction();
      if (!action) continue;
      const out = await this.turn(action);
      if (out) return out;
      const end = await this.afterTurn();
      if (end) return end;
    }
    return 'run';
  }

  // ---------------------------------------------------------------- setup / cleanup ----
  setup() {
    const ctx = this.ctx;
    const pl = ctx.player;
    const pobj = pl?.object || ctx.cameraRig?.followed || null;
    this.playerObj = pobj;
    this.playerHuman = pl?.human || null;
    const px = pobj?.position.x ?? 0, pz = pobj?.position.z ?? 0;
    let facing = this.at?.facing ?? pl?.facing ?? pobj?.rotation?.y ?? 0;
    const tnpc = this.trainer?.npc;
    if (!this.at && tnpc?.object) {
      const t = tnpc.object.position;
      if (Math.hypot(t.x - px, t.z - pz) > 0.5) facing = Math.atan2(t.x - px, t.z - pz);
    }
    let at = this.at ? { x: this.at.x, z: this.at.z, facing } : { x: px, z: pz, facing };
    const zone = ctx.world?.encounterZoneAt?.(px, pz);
    const inCave = String(zone || ctx.world?.area || '').startsWith('grotta');
    const grass = this.kind === 'wild' && (ctx.world ? !!zone && !inCave : true);
    // the battle happens on the spot, but the World's tall grass would bury the Velmon and the cameras: World may
    // press it flat (world.flattenGrass, optional); otherwise the arena slides to the nearest clear ground
    this.flattened = false;
    if (ctx.world && !this.at && !inCave) {
      if (ctx.world.flattenGrass) {
        try { ctx.world.flattenGrass({ x: px + Math.sin(facing) * 2.9, z: pz + Math.cos(facing) * 2.9, r: 6.5 }); this.flattened = true; } catch (e) { console.warn('[battle] flattenGrass', e); }
      }
      if (!this.flattened) at = this.clearSpot(at) || at;
    }
    this.arena = buildArena(ctx, at, { grass });
    const S = this.arena.slots;

    // anchors so the camera can frame empty slots
    const anchor = (s, h) => { const o = new THREE.Object3D(); o.position.set(s.x, s.y, s.z); o.userData.height = h; o.userData.radius = 0.5; this.arena.object.add(o); return o; };
    this.allyAnchor = anchor(S.ally, 0.9);
    this.foeAnchor = anchor(S.foe, 0.9);

    // player behind the ally
    if (pobj) {
      this.savedPlayer = { x: pobj.position.x, y: pobj.position.y, z: pobj.position.z, ry: pobj.rotation.y, visible: pobj.visible };
      this.savedPlayer.facing = pl?.facing;
      pl?.setControl?.(false);
      if (pl?.teleport && !pl.placeholder) pl.teleport(S.player.x, S.player.z, S.player.facing);
      pobj.position.set(S.player.x, S.player.y, S.player.z);
      pobj.rotation.y = S.player.facing;
      pobj.visible = true;
      this.playerHuman?.play?.('idle', { fade: 0.2 });
    }
    // trainer behind the foe: the NPC that challenged us, or a temporary human from the look
    if (this.isTrainer && this.trainer) {
      let obj = tnpc?.object || null, human = tnpc?.human || null;
      if (obj) {
        this.savedTrainer = { obj, x: obj.position.x, y: obj.position.y, z: obj.position.z, ry: obj.rotation.y };
        tnpc.freeze?.(true);
      } else if (this.trainer.look && ctx.actors?.createHuman) {
        try {
          human = ctx.actors.createHuman(this.trainer.look, { id: 'battle-trainer', name: this.trainer.name });
          obj = human.object; ctx.scene.add(obj);
          this.trash.push(() => human.dispose?.());
        } catch (e) { console.warn('[battle] trainer human', e); }
      }
      if (obj) {
        human?.teleport?.(S.trainer.x, S.trainer.z, S.trainer.facing);
        obj.position.set(S.trainer.x, S.trainer.y, S.trainer.z);
        obj.rotation.y = S.trainer.facing;
        obj.visible = true;
        this.arena.showShadow('trainer', true);
      }
      this.trainerObj = obj; this.trainerHuman = human;
      human?.play?.('idle', { fade: 0.2 });
    }
    // the first foe model
    this.foeModel = this.makeModel('foe', this.foe);
    this.playerHuman?.lookAt?.(this.foeModel.object);
    this.trainerHuman?.lookAt?.(this.allyAnchor);
  }

  /** Nearest arena placement (centre + facing) whose slots and camera side are free of tall grass and walkable. */
  clearSpot(at) {
    const W = this.ctx.world;
    const bad = (x, z) => {
      const zn = W.encounterZoneAt?.(x, z);
      if (zn && !String(zn).startsWith('grotta')) return true;
      if (W.isWater?.(x, z)) return true;
      if (W.walkable && W.walkable(x, z) === false) return true;
      return false;
    };
    const ok = (x, z, f) => {
      const fx = Math.sin(f), fz = Math.cos(f), rx = -fz, rz = fx;
      // local points: [along forward, along right] — player, ally, mid, foe, trainer, camera side
      const pts = [[0, 0], [0.9, 0], [3, 0], [5.1, 0], [6.8, -0.85], [-1.6, 1.7], [-0.6, -0.95], [3, 2.2], [3, -2.2], [5.1, 1.2], [5.1, -1.2]];
      return pts.every(([a, b]) => !bad(x + fx * a + rx * b, z + fz * a + rz * b));
    };
    const fs = [at.facing, at.facing + Math.PI / 2, at.facing - Math.PI / 2, at.facing + Math.PI];
    if (ok(at.x, at.z, at.facing)) return null;
    for (let r = 2; r <= 22; r += 2) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const x = at.x + Math.cos(a) * r, z = at.z + Math.sin(a) * r;
        for (const f of fs) if (ok(x, z, f)) return { x, z, facing: f };
      }
    }
    return null;
  }

  makeModel(side, mon) {
    const ctx = this.ctx, s = this.arena.slots[side];
    const m = buildVelmon(ctx, mon.species);
    m.object.position.set(s.x, s.y, s.z);
    m.object.rotation.y = s.facing;
    ctx.scene.add(m.object);
    m.setReach(Math.max(0.6, this.arena.gap - m.radius - 0.9));
    this.arena.fit(side, m.radius);
    this.arena.showShadow(side, true);
    const other = side === 'ally' ? this.foeModel : this.allyModel;
    if (other) { m.lookAt(other.object); other.lookAt(m.object); }
    else m.lookAt(side === 'ally' ? this.foeAnchor : this.allyAnchor);
    return m;
  }

  async cleanup(result) {
    const ctx = this.ctx;
    if (ctx.fade) await ctx.fade.out(300, '#10142a');
    try { this.hud?.close?.(); } catch { /* ignore */ }
    for (const f of this.trash.splice(0)) { try { f(); } catch { /* ignore */ } }
    this.allyModel?.dispose(); this.foeModel?.dispose();
    this.allyModel = this.foeModel = null;
    this.caughtBall?.dispose?.();
    this.arena?.dispose();
    this.fx.clear?.();
    if (this.flattened) { try { ctx.world?.flattenGrass?.(null); } catch { /* optional */ } }
    const pl = ctx.player, pobj = this.playerObj, sp = this.savedPlayer;
    if (pobj && sp) {
      if (pl?.teleport && !pl.placeholder) pl.teleport(sp.x, sp.z, Number.isFinite(sp.facing) ? sp.facing : sp.ry);
      pobj.position.set(sp.x, sp.y, sp.z);
      pobj.rotation.y = sp.ry;
      pobj.visible = sp.visible;
      this.playerHuman?.lookAt?.(null);
      this.playerHuman?.play?.('idle', { fade: 0.2 });
      pl?.setControl?.(true);
    }
    const st = this.savedTrainer;
    if (st) {
      this.trainerHuman?.teleport?.(st.x, st.z, st.ry);
      st.obj.position.set(st.x, st.y, st.z); st.obj.rotation.y = st.ry;
      this.trainerHuman?.lookAt?.(null);
      this.trainer?.npc?.freeze?.(false);
    }
    ctx.cameraRig?.release?.({ dur: 0 });
    ctx.cameraRig?.snap?.();
    // back to the area's music (World restores it on area changes; battles end in the same area)
    const area = ctx.world?.areaDef?.(ctx.world?.area);
    ctx.audio?.music?.(area?.music || this.prevTrack || 'route');
    if (ctx.fade) await ctx.fade.in(380);
  }

  // ---------------------------------------------------------------- send out / recall ----
  /** Throw a ball from the side's trainer to its slot, open it, the Velmon appears. */
  async sendOut(side, mon) {
    const ctx = this.ctx, S = this.arena.slots[side];
    if (side === 'ally') {
      this.allyModel?.dispose();
      this.allyModel = this.makeModel('ally', mon);
      this.ally = mon;
      this.participants.add(mon);
    } else if (!this.foeModel || this.foeModel.speciesId !== mon.species || !this.foeModel.object.parent) {
      this.foeModel?.dispose();
      this.foeModel = this.makeModel('foe', mon);
    }
    const model = side === 'ally' ? this.allyModel : this.foeModel;
    model.object.visible = false;
    const thrower = side === 'ally' ? this.playerObj : this.trainerObj;
    const human = side === 'ally' ? this.playerHuman : this.trainerHuman;
    const ball = buildSphere(ctx, 'sfera');
    ctx.scene.add(ball.object);
    let from = new THREE.Vector3();
    const to = new THREE.Vector3(S.x, S.y + 0.55, S.z);
    this.cam(side === 'ally' ? 'battle_wide' : 'battle_foe');
    this.phase = 'sendOut:throw ' + side;
    if (side === 'ally') from = await playerThrow(ctx, this, ball);
    else {
      if (thrower) { thrower.getWorldPosition(from); from.y += 1.3; } else from.set(S.x, S.y + 1.2, S.z).addScaledVector(this.arena.forward, 1.5);
      human?.play?.('throw_ball', { loop: false, fade: 0.15 });
      await wait(ctx, human ? 0.38 : 0.1);
    }
    this.phase = 'sendOut:arc ' + side;
    ctx.audio?.sfx?.('ball_throw', { vol: 0.7 });
    ball.play('throw');
    ball.object.position.copy(from);
    await tween(ctx, 0.55, k => { ball.object.position.lerpVectors(from, to, k); ball.object.position.y += Math.sin(k * Math.PI) * 0.9; }, 'linear');
    human?.play?.('idle', { fade: 0.35 });
    this.phase = 'sendOut:burst ' + side;
    await ball.play('burst');
    this.phase = 'sendOut:appear ' + side;
    ctx.audio?.sfx?.('ball_burst');
    this.fx.play('release', ball.object);
    model.object.visible = true;
    if (side === 'ally') this.hudUpdate({ ally: mon, allyCount: this.allyCount() });
    else this.hudUpdate({ foe: mon, foeCount: this.aliveFoes().length });
    model.play('appear');
    model.setSilhouette(1);
    tween(ctx, 0.35, k => ball.object.scale.setScalar(Math.max(0.001, 1 - k)), 'in').then(() => ball.dispose());
    await tween(ctx, 0.45, k => model.setSilhouette(1 - k));
    model.setSilhouette(0);
    this.phase = 'sendOut:done ' + side;
    if (side === 'foe') this.markSeen(mon);
    await wait(ctx, 0.15);
  }

  async recall(side) {
    const ctx = this.ctx;
    const model = side === 'ally' ? this.allyModel : this.foeModel;
    if (!model) return;
    const target = side === 'ally' ? this.playerObj : this.trainerObj;
    const o = model.object, p0 = o.position.clone(), s0 = o.scale.x;
    const p1 = new THREE.Vector3();
    if (target) { target.getWorldPosition(p1); p1.y += 1.1; } else p1.copy(p0).addScaledVector(this.arena.forward, side === 'ally' ? -1.5 : 1.5);
    model.setSilhouette(1);
    ctx.audio?.sfx?.('ball_throw', { vol: 0.5, pitch: 1.4 });
    this.fx.play('absorb', o, target || { x: p1.x, y: p1.y, z: p1.z });
    await tween(ctx, 0.4, k => { o.scale.setScalar(Math.max(0.001, s0 * (1 - k))); o.position.lerpVectors(p0, p1, k * 0.6); }, 'in');
    model.dispose();
    if (side === 'ally') this.allyModel = null; else this.foeModel = null;
    this.arena.showShadow(side, false);
  }

  // ---------------------------------------------------------------- choosing ----
  async chooseAction() {
    const ctx = this.ctx;
    this.cam('battle_wide');
    if (!this.hud) return { kind: 'move', id: chooseMove(this.ally, this.foe) };
    this.phase = 'menu';
    const cmd = await this.hud.menu({ canRun: this.canRun });
    this.phase = 'menu: ' + cmd;
    if (cmd === 'fight') {
      const id = await this.hud.moves(this.ally);
      this.phase = 'move: ' + id;
      return id ? { kind: 'move', id } : null;
    }
    if (cmd === 'bag') {
      const bag = ctx.story?.bag;
      if (!bag) { await this.say('Lo zaino non è disponibile.'); return null; }
      const list = bag.usable ? bag.usable('battle') : bag.list().filter(r => r.item?.battle);
      const id = await this.hud.pickItem(list, { context: 'battle' });
      if (!id) return null;
      const item = ctx.story?.items?.[id] || list.find(r => r.id === id)?.item || {};
      if (item.ball) {
        if (!this.canCatch) {
          await this.say(this.isTrainer ? 'Non puoi catturare il Velmon di un altro allenatore!' : 'Non puoi catturare questo Velmon!');
          return null;
        }
        return { kind: 'ball', id };
      }
      // medicine: Ravviva on a fainted teammate, the rest on the Velmon in battle
      let target = this.ally;
      if (item.revive) {
        const ko = this.party.filter(m => m.hp <= 0);
        if (!ko.length) { await this.say('Nessun Velmon è esausto.'); return null; }
        target = ko[0];
        if (ko.length > 1 && ctx.ui?.choose) {
          const i = await ctx.ui.choose('Chi vuoi rianimare?', ko.map(m => ({ label: `${nameOf(m)}  Lv ${m.level}` })), { cancel: true });
          if (i == null || i < 0) return null;
          target = ko[i];
        }
      }
      if (bag.canUse && !bag.canUse(id, target)) { await this.say('Non avrebbe alcun effetto.'); return null; }
      return { kind: 'item', id, target };
    }
    if (cmd === 'team') {
      const i = await this.hud.pickTeam(this.party, { forced: false });
      if (i == null || i < 0 || !this.party[i] || this.party[i] === this.ally || this.party[i].hp <= 0) return null;
      return { kind: 'switch', mon: this.party[i] };
    }
    if (cmd === 'run') {
      if (!this.canRun) { await this.say(this.isTrainer ? 'Non si scappa da una sfida!' : 'Non puoi scappare!'); return null; }
      return { kind: 'run' };
    }
    return null;
  }

  // ---------------------------------------------------------------- one turn ----
  /** Runs the player's action and the foe's reply. Returns a final result or null. */
  async turn(action) {
    const ctx = this.ctx;
    if (action.kind === 'run') {
      this.runTries++;
      const ok = stats(this.ally).spd >= stats(this.foe).spd || Math.random() < 0.55 + this.runTries * 0.15;
      if (ok) {
        ctx.audio?.sfx?.('step_grass');
        await this.say('Sei scappato senza problemi!');
        return 'run';
      }
      await this.say('Non riesci a scappare!', { wait: false });
      await this.useMove('foe', chooseMove(this.foe, this.ally));
      return null;
    }
    if (action.kind === 'switch') {
      await this.say(`Torna, ${nameOf(this.ally)}!`, { wait: false });
      await this.recall('ally');
      await this.say(`Vai, ${nameOf(action.mon)}!`, { wait: false });
      await this.sendOut('ally', action.mon);
      await this.useMove('foe', chooseMove(this.foe, this.ally));
      return null;
    }
    if (action.kind === 'item') {
      const bag = ctx.story?.bag;
      const msg = bag?.use?.(action.id, action.target);
      if (!msg) { await this.say('Non avrebbe alcun effetto.'); return null; }
      ctx.audio?.sfx?.('heal');
      if (action.target === this.ally && this.allyModel) this.fx.play('sparkle', this.allyModel.object, null, { color: '#7dff9a' });
      this.hudUpdate({ ally: this.ally, allyCount: this.allyCount() });
      await this.say(msg);
      await this.useMove('foe', chooseMove(this.foe, this.ally));
      return null;
    }
    if (action.kind === 'ball') {
      const bag = ctx.story?.bag;
      if (bag && !bag.remove(action.id, 1)) { await this.say('Non ne hai più!'); return null; }
      const item = ctx.story?.items?.[action.id];
      await this.say(`Lanci una ${item?.name || 'Sfera'}!`, { wait: false });
      const caught = await throwBall(ctx, this, action.ball || (action.id === 'megasfera' ? 'megasfera' : 'sfera'));
      if (caught) return await this.onCaught();
      const lines = ['Oh no! Si è liberato!', 'Ci eri quasi!', 'Argh! Mancava poco!', 'Accidenti! Era quasi preso!'];
      await this.say(lines[Math.min(3, this.lastShakes ?? 0)]);
      await this.useMove('foe', chooseMove(this.foe, this.ally));
      return null;
    }
    // fight: faster first (ties random)
    const a = stats(this.ally).spd, f = stats(this.foe).spd;
    const allyFirst = a > f || (a === f && Math.random() < 0.5);
    const foeMove = chooseMove(this.foe, this.ally);
    const order = allyFirst ? [['ally', action.id], ['foe', foeMove]] : [['foe', foeMove], ['ally', action.id]];
    for (const [side, id] of order) {
      if (this.ally.hp <= 0 || this.foe.hp <= 0) break;
      await this.useMove(side, id);
    }
    return null;
  }

  /** Attack animation + damage + messages for one move. */
  async useMove(side, moveId) {
    const ctx = this.ctx;
    const att = side === 'ally' ? this.ally : this.foe, def = side === 'ally' ? this.foe : this.ally;
    const attM = side === 'ally' ? this.allyModel : this.foeModel, defM = side === 'ally' ? this.foeModel : this.allyModel;
    if (!att || !def || att.hp <= 0 || def.hp <= 0 || !attM || !defM) return;
    const mv = MOVES[moveId] || MOVES.azione;
    const who = side === 'ally' ? nameOf(att) : this.foeName(att);
    this.cam(side === 'ally' ? 'battle_ally' : 'battle_foe');
    const said = this.say(`${who} usa ${mv.name}!`, { wait: false });
    await wait(ctx, 0.35);
    const r = computeDamage(att, def, moveId);
    const contact = CONTACT.has(moveId);
    // act
    if (contact) {
      attM.play('attack');
      await wait(ctx, 0.3);
    } else {
      attM.setGlow(0, TYPE_COLORS[mv.type] || '#ffffff');
      attM.play('special');
      await wait(ctx, 0.5);
      if (!r.miss) await this.fx.play(mv.type, attM.object, defM.object);
      else this.fx.play(mv.type, attM.object, { x: defM.object.position.x + this.arena.right.x * 1.5, y: defM.object.position.y + 0.6, z: defM.object.position.z + this.arena.right.z * 1.5 });
    }
    if (r.miss) {
      ctx.audio?.sfx?.('throw', { vol: 0.5 });
      await said;
      await this.say('Ma manca il bersaglio!', { wait: false });
      return;
    }
    // impact
    if (r.damage > 0) {
      defM.play('hit');
      this.fx.play('hit', null, defM.object, { big: r.eff > 1 || r.crit, color: mv.type === 'Normale' ? '#ffe066' : undefined });
      ctx.audio?.sfx?.(r.eff > 1 ? 'hit_super' : r.eff < 1 ? 'hit_weak' : 'hit');
      const frac = r.damage / Math.max(1, maxHp(def));
      ctx.cameraRig?.shake?.(Math.min(0.6, 0.12 + frac * 0.8 + (r.crit ? 0.15 : 0)));
      if (side === 'foe') ctx.haptic?.(r.eff > 1 ? [30, 30, 30] : 25);
    }
    def.hp = Math.max(0, def.hp - r.damage);
    if (side === 'ally') this.hudUpdate({ foe: def }); else this.hudUpdate({ ally: def });
    await said;
    await wait(ctx, 0.45);
    if (r.crit) await this.say('Brutto colpo!', { wait: false });
    if (r.eff === 0) await this.say(`Non ha effetto su ${side === 'ally' ? this.foeName(def) : nameOf(def)}…`, { wait: false });
    else if (r.eff > 1) await this.say('È superefficace!', { wait: false });
    else if (r.eff < 1) await this.say('Non è molto efficace…', { wait: false });
  }

  /** After both actions: faints, XP, next foe, forced switch. Returns a final result or null. */
  async afterTurn() {
    const ctx = this.ctx;
    if (this.foe.hp <= 0) {
      await this.faint('foe');
      await this.giveXp(this.foe);
      const next = this.aliveFoes()[0];
      if (next) {
        this.foe = next;
        await this.say(`${this.trainer?.name || 'L\'avversario'} manda in campo ${nameOf(next)}!`, { wait: false });
        await this.sendOut('foe', next);
        if (this.ally.hp > 0) return null;
      } else {
        return await this.onWin();
      }
    }
    if (this.ally.hp <= 0) {
      await this.faint('ally');
      const alive = this.party.filter(m => m.hp > 0);
      if (!alive.length) return await this.onLose();
      let mon = alive[0];
      if (this.hud?.pickTeam) {
        const i = await this.hud.pickTeam(this.party, { forced: true });
        if (i >= 0 && this.party[i]?.hp > 0) mon = this.party[i];
      }
      await this.say(`Vai, ${nameOf(mon)}!`, { wait: false });
      await this.sendOut('ally', mon);
    }
    return null;
  }

  async faint(side) {
    const ctx = this.ctx;
    const model = side === 'ally' ? this.allyModel : this.foeModel;
    const mon = side === 'ally' ? this.ally : this.foe;
    this.cam(side === 'ally' ? 'battle_ally' : 'battle_foe');
    ctx.audio?.sfx?.('faint');
    model?.play('faint');
    await wait(ctx, 0.9);
    this.fx.play('dust', model?.object, null, { n: 8 });
    await this.say(side === 'ally' ? `${nameOf(mon)} è esausto!` : `${this.foeName(mon)} è esausto!`);
    if (model) {
      const o = model.object, s0 = o.scale.x;
      await tween(ctx, 0.3, k => o.scale.setScalar(Math.max(0.001, s0 * (1 - k))), 'in');
      model.dispose();
    }
    if (side === 'ally') this.allyModel = null; else this.foeModel = null;
    this.arena.showShadow(side, false);
    if (side === 'ally') this.hudUpdate({ allyCount: this.allyCount() });
    else this.hudUpdate({ foeCount: this.aliveFoes().length });
  }

  // ---------------------------------------------------------------- XP / levels ----
  async giveXp(foe) {
    const ally = this.ally;
    if (!ally || ally.hp <= 0) return;
    this.cam('battle_wide');
    const xp = Math.max(1, Math.floor(((SPECIES[foe.species]?.xp ?? 50) * foe.level / 7) * (this.isTrainer ? 1.5 : 1)));
    const events = gainXp(ally, xp, { autoLearn: false });
    this.hudUpdate({ ally });
    await this.say(`${nameOf(ally)} guadagna ${xp} Punti Esperienza!`);
    await this.levelEvents(ally, events);
  }

  /** Messages, sparkles and move prompts for the events returned by gainXp. */
  async levelEvents(mon, events) {
    const ctx = this.ctx;
    for (const e of events) {
      if (e.kind === 'level') {
        this.leveled.add(mon);
        ctx.audio?.jingle?.('levelup');
        if (mon === this.ally && this.allyModel) { this.fx.play('levelup', this.allyModel.object); this.allyModel.play('happy'); }
        this.hudUpdate({ ally: this.ally });
        ctx.bus.emit('velmon:levelup', { uid: mon.uid, species: mon.species, level: e.level });
        await this.say(`${nameOf(mon)} sale al livello ${e.level}!`);
      } else if (e.kind === 'move') {
        await this.say(`${nameOf(mon)} impara ${e.move}!`);
      } else if (e.kind === 'learn') {
        await this.askLearn(mon, e.id);
      }
    }
    ctx.save?.commit?.();
    ctx.bus.emit('team:change', {});
  }

  async askLearn(mon, moveId) {
    const ctx = this.ctx;
    const name = nameOf(mon), mv = MOVES[moveId];
    await this.say(`${name} vuole imparare ${mv.name}, ma conosce già 4 mosse.`);
    let slot = 0;
    if (ctx.ui?.choose && !this.auto) {
      const opts = mon.moves.map(id => ({ label: MOVES[id]?.name || id, sub: `${MOVES[id]?.type} · Pot. ${MOVES[id]?.power}` }));
      opts.push({ label: `Non imparare ${mv.name}`, icon: '✖' });
      const i = await ctx.ui.choose(`Quale mossa deve dimenticare ${name}?`, opts, { cancel: false });
      slot = i >= 0 && i < mon.moves.length ? i : -1;
    }
    if (slot < 0) { await this.say(`${name} non ha imparato ${mv.name}.`); return; }
    const old = MOVES[mon.moves[slot]]?.name;
    learnMove(mon, moveId, slot);
    await this.say(`1, 2 e... puf! ${name} ha dimenticato ${old}...`, { wait: false });
    await this.say(`...e ha imparato ${mv.name}!`);
  }

  // ---------------------------------------------------------------- endings ----
  markSeen(mon) {
    const ctx = this.ctx;
    const isNew = ctx.creatures?.dex?.markSeen?.(mon.species);
    ctx.bus.emit('velmon:seen', { species: mon.species, level: mon.level, isNew: !!isNew });
  }

  async onCaught() {
    const ctx = this.ctx, mon = this.foe;
    this.result = 'caught';
    ctx.audio?.jingle?.('catch');
    await this.say(`Preso! ${nameOf(mon)} è stato catturato!`);
    const area = ctx.world?.area || null;
    mon.caughtAt = area;
    const isNew = ctx.creatures?.dex?.markCaught?.(mon.species);
    const where = this.team?.add?.(mon) || 'party';
    ctx.bus.emit('velmon:caught', { species: mon.species, level: mon.level, isNew: !!isNew });
    if (isNew) await this.say(`I dati di ${nameOf(mon)} sono stati aggiunti al Velmondex!`);
    if (where === 'box') await this.say(`La squadra è al completo: ${nameOf(mon)} è stato mandato nel Box del Centro Cura.`);
    // XP for the catch too (like the modern games)
    await this.giveXp(mon);
    await this.evolutions();
    return 'caught';
  }

  async onWin() {
    const ctx = this.ctx;
    this.result = 'win';
    ctx.audio?.music?.('victory');
    this.playerHuman?.play?.('cheer', { loop: false });
    if (this.isTrainer && this.trainer) {
      this.trainerHuman?.play?.('defeat', { loop: false });
      this.cam('battle_foe');
      await this.say(`Hai sconfitto ${this.trainer.name}!`);
    } else if (this.allyModel) {
      this.allyModel.play('happy');
    }
    await this.evolutions();
    return 'win';
  }

  async onLose() {
    this.result = 'lose';
    this.playerHuman?.play?.('defeat', { loop: false });
    await this.say('Non hai più Velmon in grado di lottare!');
    await this.say('Corri al Centro Cura più vicino!');
    return 'lose';
  }

  /** Every party Velmon that levelled up in this battle and reached its evolution level evolves on the arena. */
  async evolutions() {
    const ctx = this.ctx;
    for (const mon of this.party) {
      if (!this.leveled.has(mon)) continue;
      const to = pendingEvolution(mon);
      if (!to) continue;
      // put it on the ally slot if it's not the one out
      if (this.foeModel) { this.foeModel.dispose(); this.foeModel = null; this.arena.showShadow('foe', false); }
      if (this.ally !== mon || !this.allyModel) {
        if (this.allyModel) await this.recall('ally');
        this.allyModel = this.makeModel('ally', mon);
        this.allyModel.play('appear');
        this.ally = mon;
        await wait(ctx, 0.4);
      }
      const { model } = await playEvolution(ctx, mon, to, { model: this.allyModel, say: t => this.say(t), fx: this.fx, keepModel: true });
      if (model) { this.allyModel.dispose(); this.allyModel = model; this.arena.fit('ally', model.radius); }
      this.hudUpdate({ ally: mon });
      ctx.audio?.music?.(this.result === 'win' ? 'victory' : this.music);
    }
  }
}
