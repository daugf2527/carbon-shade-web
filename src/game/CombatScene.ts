// @ts-nocheck
import Phaser from "phaser";
import type { DebugSnapshot } from "../combat/debug/DebugOverlay.js";
import { FixedStepSimulation } from "../combat/kernel/FixedStepSimulation.js";
import { CameraController } from "./CameraController.js";
import { AudioUnlockGate } from "./audio/AudioUnlockGate.js";
import { DnfLayeredSprite } from "./DnfLayeredSprite.js";
import { DebugLayer } from "./layers/DebugLayer.js";
import { getCombatSpriteSpec, _debugLastPlayerSprite, type SpriteSpec } from "./SpriteFrameLibrary.js";
import { getRuntimeEvidenceCollector, recordKernelCombatEvidence } from "../runtime/evidence/RuntimeEvidenceCollector.js";
import { TouchControls } from "./TouchControls.js";
import { InputRecorder } from "../combat/replay/InputRecorder.js";
// Engine imports (P3.1 — runtime switch from CombatKernel to EngineKernel)
import { EngineKernel } from "../engine/kernel/EngineKernel.js";
import { Actor, statsFromPlayerShard, statsFromGoblinTruth } from "../engine/core/Actor.js";
import { aiConfigFromGoblinTruth } from "../engine/core/MonsterAIConfig.js";
import { SWORDMAN_TRUTH } from "../data/manifest/truth/swordman.js";
import type { AniDef } from "../engine/core/AnimationPlayer.js";
import { ActionSystem } from "../engine/kernel/systems/ActionSystem.js";
import { InputSystem } from "../engine/kernel/systems/InputSystem.js";
import { AnimationSystem } from "../engine/kernel/systems/AnimationSystem.js";
import { CombatResolutionSystem } from "../engine/kernel/systems/CombatResolutionSystem.js";
import { HitstunSystem } from "../engine/kernel/systems/HitstunSystem.js";
import { AirborneSystem } from "../engine/kernel/systems/AirborneSystem.js";
import { KnockbackSystem } from "../engine/kernel/systems/KnockbackSystem.js";
import { EnemyAISystem } from "../engine/kernel/systems/EnemyAISystem.js";
import { StatusSystem } from "../engine/kernel/systems/StatusSystem.js";
import { ResourceSystem } from "../engine/kernel/systems/ResourceSystem.js";
import { MovementSystem } from "../engine/kernel/systems/MovementSystem.js";
import { JumpSystem } from "../engine/kernel/systems/JumpSystem.js";
import { DownSystem } from "../engine/kernel/systems/DownSystem.js";
import { monsterStatsAtLevel } from "../engine/core/MonsterScaling.js";

interface ActorSnapshot {
  id: string;
  hp: number;
  pos: { x: number; y: number; z: number };
  reaction: string;
  action: string | null;
  dead: boolean;
  facing?: "left" | "right";
  lockedFacing?: "left" | "right";
  locomotion?: "idle" | "walk" | "run";
  hitFlashRemaining?: number;
  visualRecoilRemaining?: number;
  visualRecoilX?: number;
  visualRecoilZ?: number;
}

interface ActorView {
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  sprite: Phaser.GameObjects.Image;
  layeredSprite?: DnfLayeredSprite;
  legsL: Phaser.GameObjects.Rectangle;
  legsR: Phaser.GameObjects.Rectangle;
  body: Phaser.GameObjects.Rectangle;
  head: Phaser.GameObjects.Rectangle;
  face: Phaser.GameObjects.Rectangle;
  weapon: Phaser.GameObjects.Graphics;
  hpBack: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  state: Phaser.GameObjects.Text;
}

type CombatLabRuntime = { scene?: CombatScene; kernel?: EngineKernel; kernelReady?: boolean };
type GameplayKeyEvent = { code: string; repeat: boolean; preventDefault(): void };

interface CombatStats {
  sessionStartTick: number;
  // hit/damage
  hits: number;
  misses: number; // armor_feedback_only counted separately
  armorBlocks: number;
  totalDamageDealt: number;
  totalDamageReceived: number;
  damageByAction: Record<string, number>;
  hitsByAction: Record<string, number>;
  damageToTarget: Record<string, number>;
  // reactions
  reactionCounts: Record<string, number>;
  // actor deaths
  deaths: Record<string, number>;
  // actions
  actionsUsed: Record<string, number>;
  // status effects applied by player
  statusApplied: Record<string, number>;
  // performance
  peakTickCostMs: number;
  fpsSamples60: number[];
}

function makeCombatStats(tick: number): CombatStats {
  return {
    sessionStartTick: tick, hits: 0, misses: 0, armorBlocks: 0,
    totalDamageDealt: 0, totalDamageReceived: 0,
    damageByAction: {}, hitsByAction: {}, damageToTarget: {},
    reactionCounts: {}, deaths: {}, actionsUsed: {},
    statusApplied: {}, peakTickCostMs: 0, fpsSamples60: [],
  };
}

export class CombatScene extends Phaser.Scene {
  kernel!: EngineKernel;
  simulation!: FixedStepSimulation;
  private cameraController!: CameraController;
  private debugLayer!: DebugLayer;
  private audioGate: AudioUnlockGate | null = null;
  private readonly feedbackGraphics: Phaser.GameObjects.Graphics[] = [];
  private _stats: CombatStats = makeCombatStats(0);
  private readonly worldWidth = 3600;
  private readonly worldHeight = 1080;
  private readonly groundLineY = 810;
  private readonly backgroundLayers: Phaser.GameObjects.Graphics[] = [];
  private groundGraphics: Phaser.GameObjects.Graphics | null = null;
  private debugText: Phaser.GameObjects.Text | null = null;
  private hudGraphics: Phaser.GameObjects.Graphics | null = null;
  private hudText: Phaser.GameObjects.Text | null = null;
  private slowMotionActive = false;
  private debugOverlayVisible = false;
  private dnfDebugText: Phaser.GameObjects.Text | null = null;
  // F1: FPS regression tracking
  private fpsSamples: number[] = [];
  private lowFpsStartTime = 0;
  private fpsWarningActive = false;
  private static readonly FPS_LOW_THRESHOLD = 45;
  private static readonly FPS_WARN_DURATION_MS = 3000;
  // F2: Tick cost measurement
  private lastTickCostMs = 0;
  private readonly actorViews = new Map<string, ActorView>();
  private readonly gameplayKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyX", "KeyJ", "KeyZ", "KeyK", "KeyC", "KeyL", "Space", "F5", "F6", "F7", "F8", "F9"]);
  private touchControls: TouchControls | null = null;
  private readonly inputRecorder = new InputRecorder();
  private recIndicator: Phaser.GameObjects.Text | null = null;

  constructor() {
    super("combat");
  }

  create(): void {
    // ── P3.1: EngineKernel replaces CombatKernel ──
    this.kernel = new EngineKernel(42);

    // Register cross-cutting systems first (some domain systems depend on them)
    // (P2b systems: Math/DataStore/Timer/Time/Predicate — not needed for basic combat loop)

    // Wire action→animation bridge
    const actions = new ActionSystem();
    this.defineActions(actions);

    // Register domain systems in phase order (kernel sorts, insertion order is tiebreaker)
    this.kernel.registerSystem(new InputSystem(actions, "attack1"));       // INPUT phase: reads intent → requests actions
    this.kernel.registerSystem(new MovementSystem());              // INPUT phase: intent.dir → actor.x displacement
    this.kernel.registerSystem(new JumpSystem());                  // INPUT phase: intent.button=jump → airborne launch
    this.kernel.registerSystem(actions);                         // INPUT phase: dispatches pending requests
    this.kernel.registerSystem(new EnemyAISystem(actions));     // AI phase: enemy decision → request
    this.kernel.registerSystem(new AnimationSystem());          // ANIMATE phase: advance frames
    this.kernel.registerSystem(new CombatResolutionSystem());   // DETECTION phase: hit→damage→reaction
    this.kernel.registerSystem(new HitstunSystem());            // RESOLVE phase: tick hitstun
    this.kernel.registerSystem(new DownSystem());               // RESOLVE phase: knockdown counter + getup immunity
    this.kernel.registerSystem(new AirborneSystem());           // CLEANUP phase: gravity + ground
    this.kernel.registerSystem(new KnockbackSystem());          // CLEANUP phase: horizontal knockback slide
    this.kernel.registerSystem(new StatusSystem());             // CLEANUP phase: bleed DOT (09-Status)
    this.kernel.registerSystem(new ResourceSystem());           // LOGIC phase: MP regen + cooldown (08-Resource)

    // Create actors with PVF-truth-driven stats (browser env — truth comes from compiled-in
    // SWORDMAN_TRUTH const + mirrored GOBLIN_TRUTH, not filesystem shard loading).
    // SOT: verification/baseline-shards/players/swordman.json (.chr) → src/data/manifest/truth/swordman.ts
    //
    // statsFromPlayerShard reads chr.growth.{hpMax,physicalDefense,...}.values[0] = level-1 PVF base:
    //   hpMax=180, mpMax=140, physicalDefense=7.5 (all real PVF base).
    // Two fields are deliberately OVERRIDDEN off the raw base — see truth-coverage-matrix.md:
    //   - physicalAttack: PVF base=7.5, LV70-sum=82.8 (ActorFactory's accumulation method). Either
    // PVF-truth stats at level 70 (target version: pre-Metastasis LV70 cap).
    // statsFromPlayerShard evaluates chr.growth curve; moveSpeed is raw PVF value (850 = 85% of
    // SPEED_VALUE_DEFAULT 1000). MovementSystem converts to px/s via xNormalMoveVelocity formula.
    const PLAYER_LEVEL = 70;
    const playerStats = statsFromPlayerShard(SWORDMAN_TRUTH.chr as unknown as Record<string, unknown>, PLAYER_LEVEL);
    const playerActor = new Actor("player", "player", playerStats);
    playerActor.x = 390;
    this.kernel.addActor(playerActor, true);

    // grunt = goblin scaled to dungeon level using PVF abilityCategory (goblinthrower.mob).
    // Base curve is local_baseline; abilityCategory modifiers are PVF tier3 truth.
    const GOBLIN_ABILITY_CATEGORY = {
      "hp max": { op: "*" as const, value: 65 },
      "equipment_physical_attack": { op: "*" as const, value: 75 },
      "equipment_physical_defense": { op: "*" as const, value: 80 },
    };
    const gruntStats = {
      ...monsterStatsAtLevel(PLAYER_LEVEL, GOBLIN_ABILITY_CATEGORY, 350),
      hitRecovery: 500,  // PVF mob.hitRecovery
    };
    const grunt = new Actor("grunt", "monster", gruntStats);
    grunt.aiConfig = aiConfigFromGoblinTruth(); // 03-AI: PVF sight 300px / attackDelay 3000ms→180 ticks
    // 站位：player x=390，攻击盒达 player.x+50/60；grunt 受击盒 ±20，grunt.x≤460 才命中。
    // 440 让玩家原地按 Atk1/2/3 即可打中 grunt（移动系统 02-Move 仍 P4 未做，无法走位贴近）。
    grunt.x = 440;
    this.kernel.addActor(grunt, false);

    // ── FixedStepSimulation unchanged (P3.1: EngineKernel satisfies TickableKernel via structural typing) ──
    this.simulation = new FixedStepSimulation(this.kernel as unknown as import("../combat/kernel/FixedStepSimulation.js").TickableKernel);
    this.cameraController = new CameraController(this.worldWidth, this.worldHeight);
    this.debugLayer = new DebugLayer(this, this.groundLineY);
    this.audioGate = (this.game.registry.get("audioGate") as AudioUnlockGate | undefined) ?? null;
    this._stats = makeCombatStats(0);
    this.bindFeedbackHandlers();
    this.bindStatsListeners();
    this.cameras.main.setBackgroundColor("#0b1220");

    this.createBackground();
    this.createGround();
    this.createHudOverlay();
    this.createDebugOverlay();

    this.cameraController.bind(this.cameras.main, () => this.kernel.player.x);
    this.touchControls = new TouchControls(this, this.kernel);
    this.createRecIndicator();

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    const runtime = window as typeof window & { combatLab?: CombatLabRuntime };
    runtime.combatLab = runtime.combatLab ?? {};
    runtime.combatLab.scene = this;
    runtime.combatLab.kernel = this.kernel;
    runtime.combatLab.kernelReady = true;
    getRuntimeEvidenceCollector().recordCombatSceneReady();
    this.recordRuntimeEvidence();

    this.refresh();
  }

  /** Register action→animation mappings for the engine ActionSystem (P3.1). */
  private defineActions(actions: ActionSystem): void {
    // ── Helper: simple attack animation with hitbox on the middle frame ──
    const attack = (frames: number, hitFrame: number, boxW = 50, boxH = 80): AniDef => {
      const result: AniDef["frames"] = [];
      for (let i = 0; i < frames; i++) {
        result.push({
          index: i,
          delay: 1000 / 60,
          attackBoxes: i === hitFrame ? [{ x1: 0, y1: 0, z1: -30, x2: boxW, y2: boxH, z2: 30 }] : [],
          damageBoxes: [],
        });
      }
      return { framesCount: frames, loop: false, frames: result };
    };
    // ── Helper: non-attack animation (no hitboxes) ──
    const idle = (frames = 1): AniDef => ({
      framesCount: frames,
      loop: frames === 1,
      frames: Array.from({ length: frames }, (_, i) => ({
        index: i, delay: 1000 / 60, attackBoxes: [], damageBoxes: [],
      })),
    });

    // Basic attacks
    actions.define("attack1", attack(4, 1));
    actions.define("attack2", attack(5, 2, 55, 85));
    actions.define("attack3", attack(6, 3, 60, 90));
    actions.define("dashattack", attack(4, 2, 65, 80));
    actions.define("jumpattack", attack(5, 2, 50, 70));

    // Movement / utility
    actions.define("stay", idle(1));
    actions.define("move", idle(2));
    actions.define("Backstep", idle(2));
    actions.define("QuickRebound", idle(2));

    // Frenzy skills (placeholder — same structure as basic attacks, larger hitboxes)
    actions.define("FrenzyBasic1", attack(5, 2, 60, 85));
    actions.define("FrenzyBasic2", attack(5, 2, 65, 90));
    actions.define("FrenzyBasic3", attack(6, 3, 70, 95));
    actions.define("UpwardSlash", attack(5, 2, 55, 100));
    actions.define("MountainousWheel", attack(6, 3, 75, 90));
    actions.define("RagingFury", attack(8, 4, 80, 100));
    actions.define("Bloodlust", attack(6, 3, 70, 95));
  }

  update(_time: number, delta: number): void {
    const tickStart = performance.now();
    this.simulation.update(delta);
    this.cameraController.tick();
    this.lastTickCostMs = performance.now() - tickStart;
    if (this.lastTickCostMs > this._stats.peakTickCostMs) this._stats.peakTickCostMs = this.lastTickCostMs;

    // Input recording/replay tick
    if (this.inputRecorder.isReplaying()) {
      this.inputRecorder.tickReplay(this.kernel);
    }

    // F1: FPS regression tracking
    const fps = this.game.loop.actualFps ?? 0;
    this.fpsSamples.push(fps);
    if (this.fpsSamples.length > 60) this.fpsSamples.shift();
    // stats fps sampling (keep last 60 for avg)
    this._stats.fpsSamples60.push(fps);
    if (this._stats.fpsSamples60.length > 60) this._stats.fpsSamples60.shift();
    if (this.fpsSamples.length >= 30) {
      const avgFps = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
      if (avgFps < CombatScene.FPS_LOW_THRESHOLD) {
        if (this.lowFpsStartTime === 0) this.lowFpsStartTime = performance.now();
        else if (!this.fpsWarningActive && performance.now() - this.lowFpsStartTime > CombatScene.FPS_WARN_DURATION_MS) {
          this.fpsWarningActive = true;
          console.warn(`[FPS] Sustained low FPS: avg=${avgFps.toFixed(1)} over ${((performance.now() - this.lowFpsStartTime) / 1000).toFixed(1)}s (tick=${this.kernel.tickCount})`);
        }
      } else {
        this.lowFpsStartTime = 0;
        this.fpsWarningActive = false;
      }
    }

    this.refresh();
    this.updateDnfDebugOverlay();
    this.updateRecIndicator();
  }

  runScenario(): void {
    this.kernel.runDeterministicScenario();
    this.refresh();
    this.recordRuntimeEvidence();
  }

  reset(): void {
    // P3.1: EngineKernel.reset() takes actors array to reconstruct roster
    const playerActor = new Actor("player", "player", this.kernel.player.stats);
    playerActor.x = 390;
    // player/grunt reuse their live stats (PVF-truth, inherited from create()). The fallback
    // mirrors create()'s grunt truth (statsFromGoblinTruth) so reset() can never reintroduce the
    // old hardcoded baseline if grunt is ever missing.
    const gruntActor = new Actor("grunt", "monster", this.kernel.actors.find(a => a.id === "grunt")?.stats ?? statsFromGoblinTruth());
    gruntActor.aiConfig = this.kernel.actors.find(a => a.id === "grunt")?.aiConfig ?? aiConfigFromGoblinTruth();
    gruntActor.x = 440; // 与 create() 一致：贴近玩家攻击范围（grunt.x≤460 才被普攻命中）
    this.kernel.reset([{ actor: playerActor, isPlayer: true }, { actor: gruntActor }]);
    this.bindFeedbackHandlers();
    this.simulation.resume();
    this.simulation.setSlowMotion(1);
    this.slowMotionActive = false;
    for (const graphics of this.feedbackGraphics) graphics.clear();
    this.refresh();
    this.recordRuntimeEvidence();
  }

  private recordRuntimeEvidence(): void {
    recordKernelCombatEvidence(getRuntimeEvidenceCollector(), this.kernel);
  }

  refresh(): void {
    if (!this.kernel) return;
    const snapshot = this.kernel.debugSnapshot(this.lastTickCostMs);
    this.syncActors(snapshot);
    this.syncHudOverlay(snapshot);
    this.debugLayer.sync(this.kernel);
    this.syncPlayerFeedback();
    this.syncDebugOverlay(snapshot);
  }

  private createBackground(): void {
    const sky = this.add.graphics().setDepth(-100).setScrollFactor(0.15);
    sky.fillStyle(0x0f172a, 1);
    sky.fillRect(0, 0, this.worldWidth, this.worldHeight);
    sky.fillStyle(0x1e1b4b, 1);
    sky.fillRect(0, 0, this.worldWidth, 264);
    sky.fillStyle(0x312e81, 0.28);
    sky.fillRect(0, 246, this.worldWidth, 180);
    this.backgroundLayers.push(sky);

    const mountains = this.add.graphics().setDepth(-80).setScrollFactor(0.38);
    mountains.fillStyle(0x1e293b, 1);
    for (let i = 0; i < 12; i += 1) {
      const x = i * 480 - 120;
      mountains.fillTriangle(x, 516, x + 180, 348, x + 360, 516);
      mountains.fillTriangle(x + 180, 348, x + 360, 516, x + 540, 429);
    }
    this.backgroundLayers.push(mountains);

    const trees = this.add.graphics().setDepth(-60).setScrollFactor(0.75);
    for (let x = 48; x < this.worldWidth + 240; x += 252) {
      trees.fillStyle(0x166534, 1);
      trees.fillTriangle(x, 558, x + 33, 465, x + 66, 558);
      trees.fillTriangle(x + 18, 522, x + 51, 432, x + 84, 522);
      trees.fillStyle(0x7c2d12, 1);
      trees.fillRect(x + 30, 558, 9, 39);
    }
    this.backgroundLayers.push(trees);
  }

  private createGround(): void {
    const ground = this.add.graphics().setDepth(-20).setScrollFactor(1);
    ground.lineStyle(2, 0x334155, 1);
    ground.beginPath();
    ground.moveTo(0, this.groundLineY);
    ground.lineTo(this.worldWidth, this.groundLineY);
    ground.strokePath();

    ground.fillStyle(0x0f172a, 0.16);
    ground.fillRect(0, this.groundLineY, this.worldWidth, this.worldHeight - this.groundLineY);

    const horizonY = this.groundLineY - 177;
    for (let z = -180; z <= 180; z += 36) {
      const y = this.groundLineY + z;
      const distance = Math.abs(z) / 180;
      ground.lineStyle(1, 0x64748b, 0.12 + (1 - distance) * 0.18);
      ground.beginPath();
      ground.moveTo(0, y);
      ground.lineTo(this.worldWidth, y);
      ground.strokePath();
    }

    for (let x = 0; x <= this.worldWidth; x += 144) {
      const alpha = x % 288 === 0 ? 0.22 : 0.12;
      ground.lineStyle(1, 0x94a3b8, alpha);
      ground.beginPath();
      ground.moveTo(x, this.groundLineY);
      ground.lineTo(this.worldWidth / 2, horizonY);
      ground.strokePath();
    }

    this.groundGraphics = ground;
  }

  private createDebugOverlay(): void {
    this.debugText = this.add.text(24, 24, "", {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "16px",
      color: "#e2e8f0",
      backgroundColor: "rgba(15, 23, 42, 0.72)",
      padding: { left: 10, right: 10, top: 8, bottom: 8 },
      lineSpacing: 4,
    });
    this.debugText.setScrollFactor(0);
    this.debugText.setDepth(200);
    this.debugText.setVisible(false);
  }

  private createHudOverlay(): void {
    this.hudGraphics = this.add.graphics().setScrollFactor(0).setDepth(210);
    this.hudText = this.add.text(24, 87, "", {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "16px",
      color: "#e2e8f0",
    }).setScrollFactor(0).setDepth(211);
  }

  private bindFeedbackHandlers(): void {
    // ── P3.1: engine events are flat — all fields inside event.payload ──
    this.kernel.bus.on("ReactionApplied", event => {
      const p = event.payload as { targetActorId?: string; finalReaction?: string };
      if (p.targetActorId !== "player") return;
      const reaction = p.finalReaction ?? "";
      if (reaction === "launch" || reaction === "knockback" || reaction === "heavy_stagger") {
        this.cameraController.shake(0.6, 100);
      }
    });

    this.kernel.bus.on("HitConfirmed", event => {
      const p = event.payload as { attackerId?: string; defenderId?: string; dmg?: number };
      // Camera flash on player hit or dealing heavy damage
      if (p.defenderId === "player") {
        this.cameraController.flash(0xffffff, 0.12, 60);
      }
      // Audio fallback: engine doesn't expose hitbox ids yet, use damage magnitude
      const dmg = p.dmg ?? 0;
      if (p.attackerId === "player") {
        if (dmg >= 30) this.audioGate?.playHit("heavy");
        else this.audioGate?.playHit("light");
      }
    });

    // Camera feedback on heavy reactions (P3.1: handled inline, not via CameraShakeRequested)
    // bindCameraFeedbackHandlers removed — engine doesn't emit CameraShakeRequested/CameraFlashRequested

    this.kernel.bus.on("DamageNumberRequested", event => {
      const p = event.payload as { actorId?: string; amount?: number };
      if (!p.actorId) return;
      const actor = this.kernel.actors.find(candidate => candidate.id === p.actorId);
      if (!actor) return;
      const baseY = this.groundLineY + ((actor as Actor & { z?: number }).z ?? 0) - actor.y;
      const amount = p.amount ?? 0;
      const damageText = this.add.text(actor.x, baseY - 138, `-${amount}`, {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: "26px",
        color: "#ef4444",
        stroke: "#1f2937",
        strokeThickness: 3,
      });
      damageText.setOrigin(0.5, 0.5);
      damageText.setDepth(260);
      this.tweens.add({
        targets: damageText,
        y: baseY - 198,
        alpha: 0,
        duration: 700,
        ease: "Sine.easeOut",
        onComplete: () => damageText.destroy(),
      });
    });

    // GrabAttached / VfxRequested — engine doesn't emit these yet (P4), keep stub handlers
    this.kernel.bus.on("GrabAttached", _event => { /* P4 */ });
    this.kernel.bus.on("VfxRequested", _event => { /* P4 */ });
  }

  private bindStatsListeners(): void {
    const s = this._stats;
    this.kernel.bus.on("HitConfirmed", event => {
      const p = event.payload as { attackerId?: string; defenderId?: string; dmg?: number };
      const dmg = p.dmg ?? 0;
      const target = p.defenderId ?? "unknown";
      if (p.attackerId === "player") {
        s.hits++;
        s.totalDamageDealt += dmg;
        s.damageToTarget[target] = (s.damageToTarget[target] ?? 0) + dmg;
      } else {
        s.totalDamageReceived += dmg;
      }
    });
    this.kernel.bus.on("ReactionApplied", event => {
      const reaction = (event.payload as { finalReaction?: string }).finalReaction ?? "unknown";
      s.reactionCounts[reaction] = (s.reactionCounts[reaction] ?? 0) + 1;
    });
    // P3.1: engine emits "ActionStarted" (not "ActionEntered")
    this.kernel.bus.on("ActionStarted", event => {
      const p = event.payload as { actorId?: string; actionName?: string };
      if (p.actorId !== "player") return;
      const name = p.actionName ?? "unknown";
      s.actionsUsed[name] = (s.actionsUsed[name] ?? 0) + 1;
    });
    this.kernel.bus.on("ActorDied", event => {
      const p = event.payload as { actorId?: string };
      const id = p.actorId ?? "unknown";
      s.deaths[id] = (s.deaths[id] ?? 0) + 1;
    });
    // StatusApplied — engine doesn't emit this yet (P4).
    // IMPORTANT: emit端 (combat StatusEffectSystem) payload 字段是 `type` 不是 `kind`。
    // P4 实装读 payload 时用 `payload.type` (StatusEffectType)，不用 `payload.kind`。
    this.kernel.bus.on("StatusApplied", _event => { /* P4 */ });
  }

  printStats(): void {
    const s = this._stats;
    const ticks = this.kernel.tickCount - s.sessionStartTick;
    const seconds = (ticks / 60).toFixed(1);
    const avgFps = s.fpsSamples60.length
      ? (s.fpsSamples60.reduce((a, b) => a + b, 0) / s.fpsSamples60.length).toFixed(1)
      : "n/a";
    const actors = this.kernel.actors;
    const hpSnapshot = Object.fromEntries(
      actors.map(a => [a.id, `${a.hp}/${a.stats.hpMax}`])
    );
    const hitRate = s.hits + s.armorBlocks > 0
      ? ((s.hits / (s.hits + s.armorBlocks)) * 100).toFixed(0) + "%"
      : "n/a";
    const avgDmgPerHit = s.hits > 0 ? (s.totalDamageDealt / s.hits).toFixed(1) : "0";

    console.log("[COMBAT STATS] ===========================");
    console.log(`  duration      : ${seconds}s (${ticks} ticks)`);
    console.log(`  hits landed   : ${s.hits}  armor blocked: ${s.armorBlocks}  hit rate: ${hitRate}`);
    console.log(`  dmg dealt     : ${s.totalDamageDealt}  avg/hit: ${avgDmgPerHit}`);
    console.log(`  dmg received  : ${s.totalDamageReceived}`);
    console.log(`  dmg by action :`, s.damageByAction);
    console.log(`  hits by action:`, s.hitsByAction);
    console.log(`  dmg to target :`, s.damageToTarget);
    console.log(`  reactions     :`, s.reactionCounts);
    console.log(`  deaths        :`, Object.keys(s.deaths).length ? s.deaths : "(none)");
    console.log(`  status applied:`, Object.keys(s.statusApplied).length ? s.statusApplied : "(none)");
    console.log(`  actions used  :`, s.actionsUsed);
    console.log(`  hp snapshot   :`, hpSnapshot);
    console.log(`  avg fps: ${avgFps}  peak tick cost: ${s.peakTickCostMs.toFixed(2)}ms`);
    console.log("[COMBAT STATS] ===========================");
  }

  private spawnBloodlustAttachVfx(x: number, y: number): void {
    const effect = this.add.graphics().setDepth(254).setScrollFactor(1);
    effect.lineStyle(4, 0xdc2626, 0.86);
    effect.strokeEllipse(x, y + 12, 81, 39);
    effect.lineStyle(3, 0xfca5a5, 0.72);
    effect.beginPath();
    effect.moveTo(x - 39, y + 10);
    effect.lineTo(x - 15, y - 12);
    effect.lineTo(x + 12, y + 15);
    effect.lineTo(x + 36, y - 7);
    effect.strokePath();
    this.fadeGraphics(effect, 260, 1.18);
  }

  private spawnBloodlustEruptionVfx(x: number, y: number, whiff: boolean): void {
    const effect = this.add.graphics().setDepth(256).setScrollFactor(1);
    effect.fillStyle(0x7f1d1d, whiff ? 0.36 : 0.52);
    effect.fillEllipse(x, y + 24, whiff ? 129 : 174, whiff ? 48 : 63);
    effect.lineStyle(whiff ? 4 : 7, 0xef4444, whiff ? 0.78 : 0.94);
    effect.beginPath();
    effect.moveTo(x - 66, y + 27);
    effect.lineTo(x - 27, y - 51);
    effect.lineTo(x + 15, y - 6);
    effect.lineTo(x + 48, y + 30);
    effect.lineTo(x + 87, y - 27);
    effect.strokePath();
    effect.lineStyle(3, 0xfca5a5, whiff ? 0.58 : 0.76);
    effect.beginPath();
    effect.moveTo(x - 42, y + 12);
    effect.lineTo(x + 63, y - 33);
    effect.moveTo(x - 24, y + 36);
    effect.lineTo(x + 51, y + 6);
    effect.strokePath();
    this.fadeGraphics(effect, whiff ? 220 : 300, whiff ? 1.35 : 1.55);
  }

  private spawnRagingFuryShockwaveVfx(): void {
    const player = this.kernel.player;
    const facingSign = player.facing === "left" ? -1 : 1;
    const x = player.position.x + 78 * facingSign;
    const y = this.groundLineY + player.position.z - player.position.y - 36;
    const effect = this.add.graphics().setDepth(252).setScrollFactor(1);
    effect.fillStyle(0x450a0a, 0.44);
    effect.fillEllipse(x, y + 27, 198, 45);
    effect.lineStyle(6, 0xef4444, 0.78);
    effect.beginPath();
    effect.moveTo(x - 93 * facingSign, y + 30);
    effect.lineTo(x + 96 * facingSign, y - 12);
    effect.moveTo(x - 63 * facingSign, y + 45);
    effect.lineTo(x + 87 * facingSign, y + 12);
    effect.strokePath();
    this.fadeGraphics(effect, 180, 1.28);
  }

  private spawnRagingFuryPillarVfx(targetActorId: string | undefined, hitboxId: string): void {
    const target = targetActorId ? this.kernel.actors.find(candidate => candidate.id === targetActorId) : undefined;
    const player = this.kernel.player;
    const ordinal = Number.parseInt(hitboxId.slice("rf_pillar_".length), 10);
    const waveOffset = Number.isFinite(ordinal) ? (ordinal - 5.5) * 7.5 : 0;
    const x = (target?.position.x ?? player.position.x + 48) + waveOffset;
    const y = this.groundLineY + (target?.position.z ?? player.position.z) - (target?.position.y ?? 0) - 60;
    const height = 111 + (Number.isFinite(ordinal) ? ordinal % 3 : 0) * 12;
    const effect = this.add.graphics().setDepth(253).setScrollFactor(1);
    effect.fillStyle(0x7f1d1d, 0.42);
    effect.fillEllipse(x, y + height / 2, 63, 30);
    effect.lineStyle(6, 0xdc2626, 0.88);
    effect.beginPath();
    effect.moveTo(x - 27, y + height);
    effect.lineTo(x - 12, y + 36);
    effect.lineTo(x, y);
    effect.lineTo(x + 18, y + 39);
    effect.lineTo(x + 27, y + height);
    effect.strokePath();
    effect.lineStyle(3, 0xfca5a5, 0.72);
    effect.beginPath();
    effect.moveTo(x - 6, y + height - 9);
    effect.lineTo(x + 6, y + 24);
    effect.moveTo(x + 12, y + height - 21);
    effect.lineTo(x - 12, y + 42);
    effect.strokePath();
    this.fadeGraphics(effect, 170, 1.16);
  }

  private fadeGraphics(effect: Phaser.GameObjects.Graphics, duration: number, scale: number): void {
    this.tweens.add({
      targets: effect,
      alpha: 0,
      scaleX: scale,
      scaleY: scale,
      duration,
      ease: "Sine.easeOut",
      onComplete: () => effect.destroy(),
    });
  }

  private syncActors(snapshot: DebugSnapshot): void {
    const actors = snapshot.actors as ActorSnapshot[];
    for (const actor of actors) {
      let view = this.actorViews.get(actor.id);
      if (!view) {
        view = this.createActorView(actor.id);
        this.actorViews.set(actor.id, view);
      }

      const maxHp = actor.maxHp ?? Math.max(actor.hp, 1);
      const hpRatio = Phaser.Math.Clamp(actor.hp / maxHp, 0, 1);
      const baseY = this.groundLineY + actor.pos.z - actor.pos.y;
      const frenzy = actor.buffs?.some(buff => (buff.type ?? buff) === "frenzy") ?? false;
      const isPlayer = actor.id === "player";
      const isBoss = actor.id === "boss";
      const isBuilding = actor.id === "building";
      const isImp = actor.id === "imp";
      const bodyColor = actor.dead
        ? 0x111827
        : isPlayer
          ? frenzy ? 0x991b1b : 0x334155
          : isBoss
            ? 0x7c1d1d
            : isBuilding
              ? 0x475569
              : actor.id === "dummy"
                ? 0x92400e
                : 0x365314;
      const headColor = actor.dead ? 0x334155 : isPlayer ? 0xfca5a5 : isBoss ? 0xfda4af : isBuilding ? 0x94a3b8 : actor.id === "dummy" ? 0xf59e0b : 0xa3e635;
      const legColor = actor.dead ? 0x1f2937 : isPlayer ? (frenzy ? 0x450a0a : 0x111827) : isBoss ? 0x450a0a : isBuilding ? 0x1f2937 : actor.id === "dummy" ? 0x451a03 : 0x1a2e05;
      const hpBarWidth = isBoss ? 156 : isBuilding ? 132 : 78;
      const hpBarX = -hpBarWidth / 2;
      const hpY = isBoss ? -204 : isPlayer ? -168 : isImp ? -159 : -132;
      const labelY = hpY - 27;
      const stateY = hpY + 27;
      const facing = actor.lockedFacing ?? actor.facing ?? "right";
      const facingSign = facing === "left" ? -1 : 1;
      const hitFlash = (actor.hitFlashRemaining ?? 0) > 0;
      const visibleBodyColor = hitFlash ? 0xffffff : bodyColor;
      const visibleHeadColor = hitFlash ? 0xffffff : headColor;

      const recoilFrames = actor.visualRecoilRemaining ?? 0;
      const recoilT = recoilFrames > 0 ? Math.min(1, recoilFrames / 6) : 0;
      const visualRecoilX = (actor.visualRecoilX ?? 0) * recoilT;
      const visualRecoilZ = (actor.visualRecoilZ ?? 0) * recoilT;
      view.container.setPosition(actor.pos.x + visualRecoilX, baseY + visualRecoilZ);
      view.container.setDepth(Math.round(baseY));
      view.container.alpha = actor.dead ? 0.64 : 1;
      const spriteSpec = this.spriteSpecFor(actor);
      const usingSprite = spriteSpec !== null;
      const hurtTilt = actor.reaction === "light_stagger" || actor.reaction === "heavy_stagger" || actor.reaction === "knockback";
      const launched = actor.reaction === "launch" || actor.reaction === "air_hitstun" || actor.reaction === "falling";
      const downedLike = actor.reaction === "downed" || actor.reaction === "dead" || actor.dead;
      // Sprite sheets already include hurt/down/launch poses. Do not rotate the entire
      // container for sprite actors, otherwise skeleton/Boss frames turn sideways.
      view.container.angle = usingSprite ? 0 : downedLike ? 90 : hurtTilt ? (facing === "right" ? -8 : 8) : launched ? -4 : 0;
      view.container.scaleY = usingSprite ? 1 : actor.reaction === "getting_up" ? 0.92 : launched ? 1.05 : 1;

      this.setRectFillIfChanged(view.body, visibleBodyColor, 1);
      view.body.setStrokeStyle(1, 0x0f172a, 1);
      this.setRectFillIfChanged(view.head, visibleHeadColor, 1);
      view.head.setPosition(facingSign === 1 ? -12 : -18, -108);
      view.face.setPosition(facingSign === 1 ? 10 : -19, -99);
      this.setRectFillIfChanged(view.face, hitFlash ? 0x111827 : 0x0f172a, 1);
      view.head.setStrokeStyle(1, 0x0f172a, 1);
      this.setRectFillIfChanged(view.legsL, legColor, 1);
      this.setRectFillIfChanged(view.legsR, legColor, 1);
      this.setEllipseFillIfChanged(view.shadow, 0x000000, actor.dead ? 0.18 : 0.34);
      this.setSizeIfChanged(view.shadow, isBoss ? 180 : isBuilding ? 132 : isImp ? 72 : 78, isBoss ? 30 : isImp ? 13 : 18);

      const useIdleCostumeLayers = this.shouldUseIdleCostumeLayers(actor, spriteSpec, view);
      if (spriteSpec) {
        if (useIdleCostumeLayers) {
          this.syncIdleCostumeLayers(view, spriteSpec, facing);
          view.sprite.setVisible(false);
        } else {
          // Normalized spritesheets use fixed-size cells and Phaser frame indices.
          // Runtime no longer uses full-sheet crop x/y as display-origin data.
          this.setSpriteTextureIfChanged(view.sprite, spriteSpec.key, spriteSpec.frame);
          (view.sprite as any).resetCrop?.();
          view.sprite.setOrigin(0.5, 1);
          view.sprite.setScale(spriteSpec.scale);
          view.sprite.setPosition(0, spriteSpec.offsetY ?? 2);
          view.sprite.setFlipX(facing === "left");
          view.sprite.setVisible(true);
          view.sprite.setAlpha(actor.dead ? 0.72 : hitFlash ? 0.94 : 1);
          this.setTintStateIfChanged(view.sprite, hitFlash);
          view.layeredSprite?.setVisible(false);
        }
        view.body.setVisible(false);
        view.head.setVisible(false);
        view.face.setVisible(false);
        view.legsL.setVisible(false);
        view.legsR.setVisible(false);
      } else {
        view.layeredSprite?.setVisible(false);
        view.sprite.setVisible(false);
        view.body.setVisible(true);
        view.head.setVisible(true);
        view.face.setVisible(true);
        view.legsL.setVisible(true);
        view.legsR.setVisible(true);
      }

      view.hpBack.setPosition(hpBarX, hpY);
      this.setSizeIfChanged(view.hpBack, hpBarWidth, 7);
      view.hpFill.setPosition(hpBarX, hpY);
      this.setSizeIfChanged(view.hpFill, hpBarWidth * hpRatio, 7);
      this.setRectFillIfChanged(view.hpBack, 0x7f1d1d, 1);
      this.setRectFillIfChanged(view.hpFill, actor.dead ? 0x334155 : isBoss ? 0xf59e0b : isBuilding ? 0x22c55e : 0x22c55e, 1);

      this.setTextIfChanged(view.label, actor.id);
      view.label.setPosition(0, labelY);
      this.setTextIfChanged(view.state, `${actor.reaction}${actor.action ? `/${actor.action}` : ""}`);
      view.state.setPosition(0, stateY);
      view.state.setVisible(this.debugOverlayVisible);
      if (actor.reaction === "armor_feedback_only") this.setColorIfChanged(view.state, "#fbbf24");
      else if (hurtTilt || launched || actor.reaction === "downed") this.setColorIfChanged(view.state, "#fecaca");
      else this.setColorIfChanged(view.state, "#cbd5e1");

      view.weapon.clear();
      if (isPlayer && actor.action && !spriteSpec) {
        const isAttackAction = ["attack1", "attack2", "attack3", "dashattack", "jumpattack", "FrenzyBasic1", "FrenzyBasic2", "FrenzyBasic3", "UpwardSlash", "MountainousWheel", "RagingFury", "Bloodlust"].includes(actor.action);
        if (isAttackAction) {
          const localFrame = actor.localFrame ?? 0;
          const active = localFrame >= 1 && localFrame <= 3; // P3.1: simplified active frame check (engine AniDef hitboxes on frames 1-4)
          const frenzyColor = frenzy ? 0xef4444 : 0xd1d5db;
          const attackFacing = actor.lockedFacing ?? facing;
          const facingSign = attackFacing === "left" ? -1 : 1;
          const arcRadius = actor.action === "RagingFury" ? 138 : actor.action === "UpwardSlash" ? 105 : actor.action === "attack3" ? 108 : actor.action === "attack2" ? 93 : 78;
          const bladeY = actor.action === "UpwardSlash" ? -90 : -66;
          if (active) {
            view.weapon.lineStyle(10, 0x7f1d1d, 0.82);
            view.weapon.beginPath();
            if (actor.action === "UpwardSlash") {
              view.weapon.arc(51 * facingSign, -66, arcRadius, attackFacing === "left" ? 2.55 : -0.95, attackFacing === "left" ? 4.35 : 1.05, false);
            } else {
              view.weapon.arc(60 * facingSign, bladeY, arcRadius, attackFacing === "left" ? 2.55 : -0.65, attackFacing === "left" ? 3.95 : 0.78, false);
            }
            view.weapon.strokePath();
            view.weapon.lineStyle(5, frenzy ? 0xef4444 : 0xfef3c7, 0.95);
            view.weapon.beginPath();
            if (actor.action === "UpwardSlash") {
              view.weapon.arc(51 * facingSign, -66, arcRadius - 10, attackFacing === "left" ? 2.58 : -0.9, attackFacing === "left" ? 4.25 : 0.95, false);
            } else {
              view.weapon.arc(60 * facingSign, bladeY, arcRadius - 10, attackFacing === "left" ? 2.6 : -0.58, attackFacing === "left" ? 3.82 : 0.66, false);
            }
            view.weapon.strokePath();
            view.weapon.fillStyle(0xef4444, 0.6);
            view.weapon.fillCircle((99 + (actor.action === "attack3" ? 42 : 0)) * facingSign, bladeY + 6, actor.action === "attack3" ? 7 : 4);
          }
        }
      }
    }
  }

  private setTextIfChanged(text: Phaser.GameObjects.Text, value: string | string[]): void {
    const next = Array.isArray(value) ? value.join("\n") : value;
    if (text.text !== next) text.setText(value);
  }

  private setColorIfChanged(text: Phaser.GameObjects.Text, value: string): void {
    if ((text.style as any).color !== value) text.setColor(value);
  }

  private setRectFillIfChanged(rect: Phaser.GameObjects.Rectangle, color: number, alpha = 1): void {
    const data = rect.data ?? rect.setDataEnabled().data;
    if (data.get("fillColor") !== color || data.get("fillAlpha") !== alpha) {
      rect.setFillStyle(color, alpha);
      data.set("fillColor", color);
      data.set("fillAlpha", alpha);
    }
  }

  private setEllipseFillIfChanged(ellipse: Phaser.GameObjects.Ellipse, color: number, alpha = 1): void {
    const data = ellipse.data ?? ellipse.setDataEnabled().data;
    if (data.get("fillColor") !== color || data.get("fillAlpha") !== alpha) {
      ellipse.setFillStyle(color, alpha);
      data.set("fillColor", color);
      data.set("fillAlpha", alpha);
    }
  }

  private setSizeIfChanged(gameObject: Phaser.GameObjects.Components.Size, width: number, height: number): void {
    if (gameObject.width !== width || gameObject.height !== height) gameObject.setSize(width, height);
  }

  private setSpriteTextureIfChanged(sprite: Phaser.GameObjects.Image, key: string, frame: number): void {
    const currentKey = sprite.texture?.key;
    const currentFrame = (sprite.frame as any)?.name;
    // Single-image textures have frame name "__BASE"; treat frame=0 as equivalent.
    const sameFrame = currentFrame === frame || (frame === 0 && currentFrame === "__BASE");
    if (currentKey !== key || !sameFrame) (sprite as any).setTexture(key, frame);
  }

  private setTintStateIfChanged(sprite: Phaser.GameObjects.Image, tinted: boolean): void {
    const data = sprite.data ?? sprite.setDataEnabled().data;
    if (data.get("tinted") === tinted) return;
    if (tinted) (sprite as any).setTint?.(0xffdddd);
    else sprite.clearTint();
    data.set("tinted", tinted);
  }

  private createActorView(id: string): ActorView {
    const container = this.add.container(0, 0);
    container.setScrollFactor(1);

    const shadow = this.add.ellipse(0, 15, 60, 18, 0x000000, 0.34);
    shadow.setOrigin(0.5, 0.5);

    const sprite = this.add.image(0, 0, "player_berserker_norm");
    sprite.setOrigin(0.5, 1);
    sprite.setVisible(false);

    const layeredSprite = id === "player" ? this.createPlayerIdleLayeredSprite() : undefined;
    layeredSprite?.setVisible(false);

    const legsL = this.add.rectangle(-18, -18, 13, 27, 0x111827);
    legsL.setOrigin(0.5, 0.5);
    const legsR = this.add.rectangle(4, -18, 13, 27, 0x111827);
    legsR.setOrigin(0.5, 0.5);

    const body = this.add.rectangle(-24, -78, 48, 60, 0x2563eb);
    body.setOrigin(0, 0);
    body.setStrokeStyle(1, 0x0f172a, 1);

    const head = this.add.rectangle(-15, -108, 30, 27, 0xfca5a5);
    head.setOrigin(0, 0);
    head.setStrokeStyle(1, 0x0f172a, 1);

    const face = this.add.rectangle(10, -99, 6, 6, 0x0f172a);
    face.setOrigin(0.5, 0.5);

    const weapon = this.add.graphics().setScrollFactor(1).setDepth(140);

    const hpBack = this.add.rectangle(-31, -123, 63, 7, 0x7f1d1d);
    hpBack.setOrigin(0, 0);

    const hpFill = this.add.rectangle(-31, -123, 63, 7, 0x22c55e);
    hpFill.setOrigin(0, 0);
    hpFill.setScale(1, 1);

    const label = this.add.text(0, -111, id, {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "16px",
      color: "#f8fafc",
      align: "center",
    });
    label.setOrigin(0.5, 0.5);

    const state = this.add.text(0, -90, "", {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "14px",
      color: "#cbd5e1",
      align: "center",
    });
    state.setOrigin(0.5, 0.5);

    const children: Phaser.GameObjects.GameObject[] = [shadow, sprite];
    if (layeredSprite) children.push(layeredSprite);
    children.push(legsL, legsR, body, head, face, weapon, hpBack, hpFill, label, state);
    container.add(children);

    return { container, shadow, sprite, layeredSprite, legsL, legsR, body, head, face, weapon, hpBack, hpFill, label, state };
  }

  private createPlayerIdleLayeredSprite(): DnfLayeredSprite | undefined {
    const bodyMeta = this.cache.json.get("dnf_swordman_stay_meta");
    if (!bodyMeta?.frames?.length) return undefined;

    const layerMetas = new Map<string, { frames: unknown[] }>();
    for (const layer of ["coat_a", "hair_a", "pants_a", "shoes_a"]) {
      const meta = this.cache.json.get(`dnf_swordman_stay_${layer}_meta`);
      if (meta?.frames?.length) layerMetas.set(layer, meta);
    }
    if (layerMetas.size === 0) return undefined;

    return new DnfLayeredSprite(this, 0, 0, "dnf_swordman_stay", bodyMeta, layerMetas as Map<string, any>);
  }

  private shouldUseIdleCostumeLayers(actor: ActorSnapshot, spriteSpec: SpriteSpec | null, view: ActorView): boolean {
    return actor.id === "player"
      && Boolean(view.layeredSprite)
      && spriteSpec?.key.startsWith("dnf_swordman_stay_") === true;
  }

  private syncIdleCostumeLayers(view: ActorView, spriteSpec: SpriteSpec, facing: "left" | "right"): void {
    if (!view.layeredSprite) return;
    const frame = this.frameIndexFromDnfTextureKey(spriteSpec.key);
    view.layeredSprite.setFrame(frame);
    view.layeredSprite.setPosition(0, 0);
    view.layeredSprite.setScale(facing === "left" ? -spriteSpec.scale : spriteSpec.scale, spriteSpec.scale);
    view.layeredSprite.setVisible(true);
  }

  private frameIndexFromDnfTextureKey(key: string): number {
    const match = key.match(/_(\d{2})$/);
    return match ? Number.parseInt(match[1], 10) : 0;
  }


  private spriteSpecFor(actor: ActorSnapshot): SpriteSpec | null {
    return getCombatSpriteSpec({
      id: actor.id,
      action: actor.action ?? null,
      reaction: actor.reaction,
      locomotion: actor.locomotion,
      tick: this.kernel.tickCount,
      localFrame: actor.localFrame ?? 0,
      dead: actor.dead,
    });
  }

  private syncHudOverlay(snapshot: DebugSnapshot): void {
    if (!this.hudGraphics || !this.hudText) return;
    const playerSnap = (snapshot.actors as ActorSnapshot[]).find(a => a.id === "player");
    const maxHp = playerSnap?.maxHp || 1;
    const hpRatio = Phaser.Math.Clamp((playerSnap?.hp ?? 0) / maxHp, 0, 1);
    const frenzy = playerSnap?.buffs?.find(buff => (buff.type ?? buff) === "frenzy");
    const frenzyRatio = frenzy ? Phaser.Math.Clamp((frenzy.expiresAtTick ?? snapshot.tick) - snapshot.tick, 0, 180) / 180 : 0;

    this.hudGraphics.clear();
    this.hudGraphics.fillStyle(0x0f172a, 0.75);
    this.hudGraphics.fillRoundedRect(18, 18, 510, 108, 15);
    this.hudGraphics.lineStyle(1, 0x334155, 1);
    this.hudGraphics.strokeRoundedRect(18, 18, 510, 108, 15);
    this.hudGraphics.fillStyle(0x7f1d1d, 1);
    this.hudGraphics.fillRect(36, 48, 270, 15);
    this.hudGraphics.fillStyle(0x22c55e, 1);
    this.hudGraphics.fillRect(36, 48, 270 * hpRatio, 15);
    this.hudGraphics.fillStyle(0x334155, 1);
    this.hudGraphics.fillRect(36, 78, 270, 12);
    this.hudGraphics.fillStyle(0xef4444, 1);
    this.hudGraphics.fillRect(36, 78, 270 * frenzyRatio, 12);

    this.setTextIfChanged(this.hudText, [
      `HP ${playerSnap?.hp ?? 0}/${maxHp}`,
      `Frenzy ${frenzy ? Math.max(0, frenzy.expiresAtTick - snapshot.tick) : 0}`,
      `FPS ${(this.game.loop.actualFps ?? 0).toFixed(1)}  LastHit ${snapshot.lastHit.actionName ?? "-"} ${snapshot.lastHit.finalReaction ?? ""}`,
    ]);
  }

  private syncDebugOverlay(snapshot: DebugSnapshot): void {
    if (!this.debugText) return;
    const player = snapshot.actors.find(actor => (actor as ActorSnapshot).id === "player") as ActorSnapshot | undefined;
    const scenario = snapshot.scenario
      ? Object.entries(snapshot.scenario).map(([key, value]) => `${value ? "PASS" : "FAIL"} ${key}`).join(" | ")
      : "n/a";

    const lines: string[] = [
      `Tick: ${snapshot.tick} | Events: ${snapshot.eventCount} | Actors: ${snapshot.performance.actorCount}`,
    ];

    if (player) {
      const actionName = player.action ?? "stay";
      const localFrame = (player as any).localFrame ?? 0;
      // P3.1: engine has no FrameDataAction registry; show frame count from animationPlayer
      const frameProgress = `${localFrame}`;
      const lockedFacing = (player as any).lockedFacing ?? player.facing;

      lines.push(`Player: ${actionName} [${frameProgress}] facing=${player.facing} locked=${lockedFacing}`);

      const kernelPlayer = this.kernel.actors.find(a => a.id === "player");
      if (kernelPlayer) {
        // P3.1: engine Actor has no velocity field — show position only
        lines.push(`Pos: x=${player.pos.x.toFixed(1)} y=${player.pos.y.toFixed(1)} z=${player.pos.z.toFixed(1)}`);
      }

      const reactionState = player.reaction !== "none" ? player.reaction : "-";
      // P3.1: engine Actor has reaction.remainingTicks instead of handfeel.reactionRemaining
      const reactionFrames = (kernelPlayer as any)?.reaction?.remainingTicks ?? 0;
      const reactionInfo = reactionState !== "-" ? `${reactionState} (${reactionFrames}f)` : reactionState;
      lines.push(`Reaction: ${reactionInfo} | Locomotion: ${player.locomotion ?? "idle"}`);
    } else {
      lines.push(`Player: missing`);
    }

    const lastHit = snapshot.lastHit;
    if (lastHit.tick > 0 && snapshot.tick - lastHit.tick < 120) {
      const hpColor = (lastHit.hpAfter ?? 0) < 1000 ? "#ff4444" : "#ffffff";
      const hitInfo = `${lastHit.actionName ?? "-"} → ${lastHit.finalReaction ?? "?"} | dmg=${lastHit.finalDamage ?? 0} HP=${lastHit.hpAfter ?? "?"}`;
      lines.push(`LastHit: ${hitInfo}`);
      if (lastHit.hpAfter !== undefined && lastHit.hpAfter < 1000) {
        this.debugText.setColor(hpColor);
      }
    } else {
      lines.push(`LastHit: -`);
    }

    lines.push(`Scenario: ${scenario}`);
    lines.push(`TickCost: ${(snapshot.performance.tickCostMs ?? 0).toFixed(1)}ms | Pool: ${snapshot.performance.poolStatus}`);

    this.setTextIfChanged(this.debugText, lines);
  }

  private syncPlayerFeedback(): void {
    this.feedbackGraphics.forEach(graphics => graphics.clear());
  }

  private handleKeyDown = (event: GameplayKeyEvent): void => {
    if (this.gameplayKeys.has(event.code)) event.preventDefault();
    if (event.code === "F1") {
      event.preventDefault();
      this.debugOverlayVisible = this.debugLayer.toggleVisible();
      this.debugText?.setVisible(this.debugOverlayVisible);
      return;
    }
    if (event.code === "F2") {
      event.preventDefault();
      this.debugLayer.toggleBoxesVisible();
      return;
    }
    if (event.code === "F3") {
      event.preventDefault();
      this.slowMotionActive = !this.slowMotionActive;
      this.simulation.setSlowMotion(this.slowMotionActive ? 0.25 : 1);
      return;
    }
    if (event.code === "F4") {
      event.preventDefault();
      this.simulation.armSingleStep();
      return;
    }
    if (event.code === "KeyP") {
      event.preventDefault();
      this.printStats();
      return;
    }
    if (event.code === "F6") {
      event.preventDefault();
      this.reset();
      return;
    }
    if (event.code === "F7") {
      event.preventDefault();
      this.toggleRecording();
      return;
    }
    if (event.code === "F8") {
      event.preventDefault();
      this.replayLastRecording();
      return;
    }
    if (event.code === "F9") {
      event.preventDefault();
      this.exportRecording();
      return;
    }

    // Disable user input during replay
    if (this.inputRecorder.isReplaying()) return;

    // ── P3.1: write directly to actor.intent instead of kernel.inputState ──
    const player = this.kernel.player;
    if (!player) return;
    switch (event.code) {
      case "ArrowLeft":  player.intent = { ...player.intent, dir: -1 }; break;
      case "ArrowRight": player.intent = { ...player.intent, dir: 1 }; break;
      case "ArrowUp":    player.intent = { ...player.intent, zDir: -1 }; break;
      case "ArrowDown":  player.intent = { ...player.intent, zDir: 1 }; break;
      case "KeyX":
      case "KeyJ":       player.intent = { ...player.intent, attack: true }; break;
      case "KeyC":       this.kernel.requestAction("player", "Backstep"); break;
      case "KeyZ":       player.intent = { ...player.intent, quickRebound: true }; break;
      case "KeyS":       this.kernel.requestAction("player", "FrenzyBasic1"); break;
      case "KeyD":       this.kernel.requestAction("player", "FrenzyBasic2"); break;
      case "KeyF":       this.kernel.requestAction("player", "FrenzyBasic3"); break;
      case "KeyA":       this.kernel.requestAction("player", "UpwardSlash"); break;
      case "KeyG":       this.kernel.requestAction("player", "MountainousWheel"); break;
      case "KeyH":       this.kernel.requestAction("player", "RagingFury"); break;
      case "KeyK":       this.kernel.requestAction("player", "Bloodlust"); break;
      case "Space":      player.intent = { ...player.intent, button: "jump" }; break;
      default: break;
    }

    // Record input event for replay
    if (this.inputRecorder.isRecording()) {
      this.inputRecorder.recordInput(this.kernel.tickCount, "keydown", event.code);
    }
  };

  private handleKeyUp = (event: GameplayKeyEvent): void => {
    if (this.gameplayKeys.has(event.code)) event.preventDefault();

    // Disable user input during replay
    if (this.inputRecorder.isReplaying()) return;

    // ── P3.1: clear intent on key release ──
    const player = this.kernel.player;
    if (!player) return;
    switch (event.code) {
      case "ArrowLeft":
      case "ArrowRight":
        player.intent = { ...player.intent, dir: 0 };
        break;
      case "ArrowUp":
      case "ArrowDown":
        player.intent = { ...player.intent, zDir: 0 };
        break;
      case "KeyX":
      case "KeyJ":
        player.intent = { ...player.intent, attack: false };
        break;
      case "Space":
        player.intent = { ...player.intent, button: "none" };
        break;
      case "KeyZ":
        player.intent = { ...player.intent, quickRebound: false };
        break;
      default: break;
    }

    // Record input event for replay
    if (this.inputRecorder.isRecording()) {
      this.inputRecorder.recordInput(this.kernel.tickCount, "keyup", event.code);
    }
  };

  private handleBlur = (): void => {
    // P3.1: clear player intent on blur
    const player = this.kernel.player;
    if (player) player.intent = { attack: false, dir: 0 };
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.simulation.pause();
      const player = this.kernel.player;
      if (player) player.intent = { attack: false, dir: 0 };
      return;
    }
    this.simulation.resume();
  };

  private shutdown = (): void => {
    this.touchControls?.destroy();
    this.touchControls = null;
    (window as any).removeEventListener?.("keydown", this.handleKeyDown);
    (window as any).removeEventListener?.("keyup", this.handleKeyUp);
    (window as any).removeEventListener?.("blur", this.handleBlur);
    (document as any).removeEventListener?.("visibilitychange", this.handleVisibilityChange);

    for (const view of this.actorViews.values()) view.container.destroy(true);
    this.actorViews.clear();

    for (const graphics of this.backgroundLayers) graphics.destroy();
    this.backgroundLayers.length = 0;
    this.groundGraphics?.destroy();
    this.groundGraphics = null;
    this.debugText?.destroy();
    this.debugText = null;
    this.hudGraphics?.destroy();
    this.hudGraphics = null;
    this.hudText?.destroy();
    this.hudText = null;
    for (const graphics of this.feedbackGraphics) graphics.destroy();
    this.feedbackGraphics.length = 0;
    this.debugLayer.destroy();

    const runtime = window as typeof window & { combatLab?: CombatLabRuntime };
    if (runtime.combatLab?.scene === this) runtime.combatLab.scene = undefined;
    if (runtime.combatLab?.kernel === this.kernel) runtime.combatLab.kernel = undefined;
  };

  private updateDnfDebugOverlay(): void {
    const d = _debugLastPlayerSprite;
    if (!this.dnfDebugText) {
      this.dnfDebugText = this.add.text(600, 10, "", {
        fontFamily: "monospace", fontSize: "13px", color: "#a5f3fc",
        backgroundColor: "#0f172a80", padding: { x: 6, y: 4 },
      }).setScrollFactor(0).setDepth(999);
      this.createDnfTestButtons();
    }
    const player = this.kernel.player;
    const lines = [
      `action: ${d.action || "-"}  reaction: ${d.reaction || "none"}`,
      `locomotion: ${d.locomotion || "idle"}  tick: ${d.tick}`,
      `dnf: ${d.dnfAction}  frame: ${d.frameKey}`,
      `pos: x=${player.x.toFixed(0)} y=${player.y.toFixed(0)} z=${((player as Actor & { z?: number }).z ?? 0).toFixed(1)}`,
    ];
    this.dnfDebugText.setText(lines);
  }

  private createDnfTestButtons(): void {
    const actions: Array<{ label: string; fn: () => void }> = [
      { label: "Stay", fn: () => { this.kernel.requestAction("player", "stay"); } },
      { label: "Walk→", fn: () => { const p = this.kernel.player; p.intent = { ...p.intent, dir: 1 }; } },
      { label: "Run→", fn: () => { const p = this.kernel.player; p.intent = { ...p.intent, dir: 1 }; } },
      { label: "Atk1", fn: () => { this.kernel.requestAction("player", "attack1"); } },
      { label: "Atk2", fn: () => { this.kernel.requestAction("player", "attack2"); } },
      { label: "Atk3", fn: () => { this.kernel.requestAction("player", "attack3"); } },
      { label: "Jump", fn: () => { this.kernel.requestAction("player", "jumpattack"); } },
      { label: "Backstep", fn: () => { this.kernel.requestAction("player", "Backstep"); } },
      { label: "UpSlash", fn: () => { this.kernel.requestAction("player", "UpwardSlash"); } },
      { label: "Hit", fn: () => { const p = this.kernel.player; p.reaction = { active: true, remainingTicks: 20, kind: "hit" }; } },
      { label: "Down", fn: () => { const p = this.kernel.player; p.reaction = { active: true, remainingTicks: 60, kind: "down" }; } },
    ];
    const startX = 10;
    const y = 95;
    let x = startX;
    for (const { label, fn } of actions) {
      const w = label.length * 9 + 16;
      const btn = this.add.rectangle(x + w / 2, y, w, 24, 0x1e3a5f)
        .setScrollFactor(0).setDepth(999).setStrokeStyle(1, 0x38bdf8)
        .setInteractive({ useHandCursor: true });
      this.add.text(x + 8, y - 7, label, {
        fontFamily: "monospace", fontSize: "12px", color: "#e0f2fe",
      }).setScrollFactor(0).setDepth(999);
      btn.on("pointerup", fn);
      x += w + 6;
    }
  }

  private createRecIndicator(): void {
    this.recIndicator = this.add.text(1820, 10, "", {
      fontFamily: "monospace",
      fontSize: "18px",
      fontStyle: "bold",
      color: "#ffffff",
      backgroundColor: "#dc2626",
      padding: { x: 8, y: 4 },
    }).setScrollFactor(0).setDepth(1000).setVisible(false);
  }

  private updateRecIndicator(): void {
    if (!this.recIndicator) return;

    if (this.inputRecorder.isRecording()) {
      this.recIndicator.setText("● REC");
      this.recIndicator.setBackgroundColor("#dc2626");
      this.recIndicator.setVisible(true);
    } else if (this.inputRecorder.isReplaying()) {
      const progress = this.inputRecorder.getReplayProgress();
      this.recIndicator.setText(`▶ REPLAY ${(progress * 100).toFixed(0)}%`);
      this.recIndicator.setBackgroundColor("#2563eb");
      this.recIndicator.setVisible(true);
    } else {
      this.recIndicator.setVisible(false);
    }
  }

  private toggleRecording(): void {
    if (this.inputRecorder.isRecording()) {
      const recording = this.inputRecorder.stopRecording(this.kernel);
      if (recording) {
        console.log(`[CombatScene] 录制完成: ${recording.duration} 帧, ${recording.inputs.length} 个输入事件`);
      }
    } else {
      if (this.inputRecorder.isReplaying()) {
        console.warn("[CombatScene] 回放中，无法开始录制");
        return;
      }
      this.inputRecorder.startRecording(this.kernel);
      console.log("[CombatScene] 开始录制");
    }
  }

  private replayLastRecording(): void {
    if (this.inputRecorder.isRecording()) {
      console.warn("[CombatScene] 录制中，无法开始回放");
      return;
    }

    if (this.inputRecorder.isReplaying()) {
      this.inputRecorder.stopReplay();
      console.log("[CombatScene] 停止回放");
      return;
    }

    const recording = this.inputRecorder.getCurrentRecording();
    if (!recording) {
      console.warn("[CombatScene] 没有可回放的录制");
      return;
    }

    const success = this.inputRecorder.startReplay(this.kernel);
    if (success) {
      console.log(`[CombatScene] 开始回放: ${recording.duration} 帧`);
    }
  }

  private exportRecording(): void {
    const json = this.inputRecorder.exportToJson();
    if (!json) {
      console.warn("[CombatScene] 没有可导出的录制");
      return;
    }

    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `input-recording-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log("[CombatScene] 录制已导出");
  }
}
