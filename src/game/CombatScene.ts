// @ts-nocheck
import Phaser from "phaser";
import { getAction } from "../combat/actions/FrameDataAction.js";
import type { DebugSnapshot } from "../combat/debug/DebugOverlay.js";
import { CombatKernel } from "../combat/kernel/CombatKernel.js";
import { FixedStepSimulation } from "../combat/kernel/FixedStepSimulation.js";
import { CameraController } from "./CameraController.js";
import { AudioUnlockGate } from "./audio/AudioUnlockGate.js";
import { DebugLayer } from "./layers/DebugLayer.js";
import { getCombatSpriteSpec, type SpriteSpec } from "./SpriteFrameLibrary.js";
import { getRuntimeEvidenceCollector, recordKernelCombatEvidence } from "../runtime/evidence/RuntimeEvidenceCollector.js";

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

type CombatLabRuntime = { scene?: CombatScene; kernel?: CombatKernel };
type GameplayKeyEvent = { code: string; repeat: boolean; preventDefault(): void };

export class CombatScene extends Phaser.Scene {
  kernel!: CombatKernel;
  simulation!: FixedStepSimulation;
  private cameraController!: CameraController;
  private debugLayer!: DebugLayer;
  private audioGate: AudioUnlockGate | null = null;
  private readonly feedbackGraphics: Phaser.GameObjects.Graphics[] = [];
  private readonly worldWidth = 2400;
  private readonly worldHeight = 720;
  private readonly groundLineY = 540;
  private readonly backgroundLayers: Phaser.GameObjects.Graphics[] = [];
  private groundGraphics: Phaser.GameObjects.Graphics | null = null;
  private debugText: Phaser.GameObjects.Text | null = null;
  private hudGraphics: Phaser.GameObjects.Graphics | null = null;
  private hudText: Phaser.GameObjects.Text | null = null;
  private slowMotionActive = false;
  private debugOverlayVisible = false;
  private playerHitFlashUntil = 0;
  // F1: FPS regression tracking
  private fpsSamples: number[] = [];
  private lowFpsStartTime = 0;
  private fpsWarningActive = false;
  private static readonly FPS_LOW_THRESHOLD = 45;
  private static readonly FPS_WARN_DURATION_MS = 3000;
  // F2: Tick cost measurement
  private lastTickCostMs = 0;
  private readonly actorViews = new Map<string, ActorView>();
  private readonly gameplayKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS", "KeyX", "KeyJ", "KeyZ", "KeyK", "KeyC", "KeyL", "Space", "F5", "F6", "F7", "F8", "F9"]);

  constructor() {
    super("combat");
  }

  create(): void {
    this.kernel = new CombatKernel({ enableReplay: true });
    this.simulation = new FixedStepSimulation(this.kernel);
    this.cameraController = new CameraController(this.worldWidth, this.worldHeight);
    this.debugLayer = new DebugLayer(this, this.groundLineY);
    this.audioGate = (this.game.registry.get("audioGate") as AudioUnlockGate | undefined) ?? null;
    this.bindFeedbackHandlers();
    this.cameras.main.setBackgroundColor("#0b1220");

    this.createBackground();
    this.createGround();
    this.createHudOverlay();
    this.createDebugOverlay();

    this.cameraController.bind(this.cameras.main, () => this.kernel.player.position.x);

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    const runtime = window as typeof window & { combatLab?: CombatLabRuntime };
    runtime.combatLab = runtime.combatLab ?? {};
    runtime.combatLab.scene = this;
    runtime.combatLab.kernel = this.kernel;
    getRuntimeEvidenceCollector().recordCombatSceneReady();
    this.recordRuntimeEvidence();

    this.refresh();
  }

  update(_time: number, delta: number): void {
    const tickStart = performance.now();
    this.simulation.update(delta);
    this.cameraController.tick();
    this.lastTickCostMs = performance.now() - tickStart;

    // F1: FPS regression tracking
    const fps = this.game.loop.actualFps ?? 0;
    this.fpsSamples.push(fps);
    if (this.fpsSamples.length > 60) this.fpsSamples.shift();
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
  }

  runScenario(): void {
    this.kernel.runDeterministicScenario();
    this.refresh();
    this.recordRuntimeEvidence();
  }

  reset(): void {
    this.kernel.reset();
    this.bindFeedbackHandlers();
    this.simulation.resume();
    this.simulation.setSlowMotion(1);
    this.slowMotionActive = false;
    this.playerHitFlashUntil = 0;
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
    sky.fillRect(0, 0, this.worldWidth, 176);
    sky.fillStyle(0x312e81, 0.28);
    sky.fillRect(0, 164, this.worldWidth, 120);
    this.backgroundLayers.push(sky);

    const mountains = this.add.graphics().setDepth(-80).setScrollFactor(0.38);
    mountains.fillStyle(0x1e293b, 1);
    for (let i = 0; i < 8; i += 1) {
      const x = i * 320 - 80;
      mountains.fillTriangle(x, 344, x + 120, 232, x + 240, 344);
      mountains.fillTriangle(x + 120, 232, x + 240, 344, x + 360, 286);
    }
    this.backgroundLayers.push(mountains);

    const trees = this.add.graphics().setDepth(-60).setScrollFactor(0.75);
    for (let x = 32; x < this.worldWidth + 160; x += 168) {
      trees.fillStyle(0x166534, 1);
      trees.fillTriangle(x, 372, x + 22, 310, x + 44, 372);
      trees.fillTriangle(x + 12, 348, x + 34, 288, x + 56, 348);
      trees.fillStyle(0x7c2d12, 1);
      trees.fillRect(x + 20, 372, 6, 26);
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

    const horizonY = this.groundLineY - 118;
    for (let z = -120; z <= 120; z += 24) {
      const y = this.groundLineY + z;
      const distance = Math.abs(z) / 120;
      ground.lineStyle(1, 0x64748b, 0.12 + (1 - distance) * 0.18);
      ground.beginPath();
      ground.moveTo(0, y);
      ground.lineTo(this.worldWidth, y);
      ground.strokePath();
    }

    for (let x = 0; x <= this.worldWidth; x += 96) {
      const alpha = x % 192 === 0 ? 0.22 : 0.12;
      ground.lineStyle(1, 0x94a3b8, alpha);
      ground.beginPath();
      ground.moveTo(x, this.groundLineY);
      ground.lineTo(this.worldWidth / 2, horizonY);
      ground.strokePath();
    }

    this.groundGraphics = ground;
  }

  private createDebugOverlay(): void {
    this.debugText = this.add.text(16, 16, "", {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "12px",
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
    this.hudText = this.add.text(16, 58, "", {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "12px",
      color: "#e2e8f0",
    }).setScrollFactor(0).setDepth(211);
  }

  private bindFeedbackHandlers(): void {
    this.kernel.bus.on("ReactionApplied", event => {
      if (event.targetActorId !== "player") return;
      this.playerHitFlashUntil = this.time.now + 200;
      this.cameras.main.shake(100, 0.004);
    });

    this.kernel.bus.on("HitConfirmed", event => {
      const decision = event.payload as { hitbox?: { id?: string; baseDamage?: number; hitType?: string }; armorDecision?: { controlBlocked?: boolean } };
      if (decision.armorDecision?.controlBlocked) {
        this.audioGate?.playHit("armor");
        return;
      }
      if (event.sourceActorId === "player" && decision.hitbox?.id === "rf_shock") this.spawnRagingFuryShockwaveVfx();
      else if (event.sourceActorId === "player" && decision.hitbox?.id?.startsWith("rf_pillar_")) this.spawnRagingFuryPillarVfx(event.targetActorId, decision.hitbox.id);
      if (decision.hitbox?.id?.startsWith("upslash")) {
        this.audioGate?.playHit("uppercut");
      } else if (decision.hitbox?.id?.startsWith("rf_")) {
        this.audioGate?.playHit("burst");
      } else if ((decision.hitbox?.baseDamage ?? 0) >= 30) {
        this.audioGate?.playHit("heavy");
      } else if (event.sourceActorId === "player" && this.kernel.player.buffs.some(buff => buff.type === "frenzy")) {
        this.audioGate?.playHit("berserk");
      } else {
        this.audioGate?.playHit("light");
      }
    });

    this.kernel.bus.on("CameraShakeRequested", event => {
      const payload = event.payload as { intensity?: number; durationMs?: number };
      this.cameras.main.shake(payload.durationMs ?? 90, payload.intensity ?? 0.004);
    });

    this.kernel.bus.on("DamageNumberRequested", event => {
      if (!event.targetActorId) return;
      const actor = this.kernel.actors.find(candidate => candidate.id === event.targetActorId);
      if (!actor) return;
      const baseY = this.groundLineY + actor.position.z - actor.position.y;
      const amount = (event.payload as { amount?: number }).amount ?? 0;
      const damageText = this.add.text(actor.position.x, baseY - 92, `-${amount}`, {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: "18px",
        color: "#ef4444",
        stroke: "#1f2937",
        strokeThickness: 3,
      });
      damageText.setOrigin(0.5, 0.5);
      damageText.setDepth(260);
      this.tweens.add({
        targets: damageText,
        y: baseY - 132,
        alpha: 0,
        duration: 700,
        ease: "Sine.easeOut",
        onComplete: () => damageText.destroy(),
      });
    });

    this.kernel.bus.on("GrabAttached", event => {
      if (!event.targetActorId) return;
      const actor = this.kernel.actors.find(candidate => candidate.id === event.targetActorId);
      if (!actor) return;
      this.spawnBloodlustAttachVfx(actor.position.x, this.groundLineY + actor.position.z - actor.position.y - 34);
    });

    this.kernel.bus.on("VfxRequested", event => {
      const actorId = event.targetActorId ?? event.sourceActorId;
      if (!actorId) return;
      const actor = this.kernel.actors.find(candidate => candidate.id === actorId);
      if (!actor) return;
      const payload = event.payload as { vfx?: string };
      const baseY = this.groundLineY + actor.position.z - actor.position.y;
      const x = actor.position.x;
      const y = baseY - 32;

      if (payload.vfx === "armor_spark") {
        const effect = this.add.graphics().setDepth(255).setScrollFactor(1);
        effect.lineStyle(4, 0xfbbf24, 0.96);
        effect.beginPath();
        effect.moveTo(x - 18, y);
        effect.lineTo(x + 18, y);
        effect.moveTo(x, y - 18);
        effect.lineTo(x, y + 18);
        effect.moveTo(x - 13, y - 13);
        effect.lineTo(x + 13, y + 13);
        effect.moveTo(x - 13, y + 13);
        effect.lineTo(x + 13, y - 13);
        effect.strokePath();
        this.fadeGraphics(effect, 140, 1.4);
      } else if (payload.vfx === "bloodlust_eruption") {
        this.spawnBloodlustEruptionVfx(x, y, false);
      } else if (payload.vfx === "bloodlust_whiff_eruption") {
        this.spawnBloodlustEruptionVfx(x, y, true);
      } else {
        const effect = this.add.graphics().setDepth(255).setScrollFactor(1);
        effect.lineStyle(4, 0xffffff, 0.96);
        effect.beginPath();
        effect.moveTo(x - 18, y - 2);
        effect.lineTo(x + 20, y - 18);
        effect.moveTo(x - 16, y + 8);
        effect.lineTo(x + 18, y - 6);
        effect.lineStyle(2, 0xef4444, 0.92);
        effect.moveTo(x - 4, y + 12);
        effect.lineTo(x + 24, y + 2);
        effect.strokePath();
        this.fadeGraphics(effect, 140, 1.4);
      }
    });
  }

  private spawnBloodlustAttachVfx(x: number, y: number): void {
    const effect = this.add.graphics().setDepth(254).setScrollFactor(1);
    effect.lineStyle(3, 0xdc2626, 0.86);
    effect.strokeEllipse(x, y + 8, 54, 26);
    effect.lineStyle(2, 0xfca5a5, 0.72);
    effect.beginPath();
    effect.moveTo(x - 26, y + 7);
    effect.lineTo(x - 10, y - 8);
    effect.lineTo(x + 8, y + 10);
    effect.lineTo(x + 24, y - 5);
    effect.strokePath();
    this.fadeGraphics(effect, 260, 1.18);
  }

  private spawnBloodlustEruptionVfx(x: number, y: number, whiff: boolean): void {
    const effect = this.add.graphics().setDepth(256).setScrollFactor(1);
    effect.fillStyle(0x7f1d1d, whiff ? 0.36 : 0.52);
    effect.fillEllipse(x, y + 16, whiff ? 86 : 116, whiff ? 32 : 42);
    effect.lineStyle(whiff ? 3 : 5, 0xef4444, whiff ? 0.78 : 0.94);
    effect.beginPath();
    effect.moveTo(x - 44, y + 18);
    effect.quadraticCurveTo(x - 18, y - 34, x + 10, y - 4);
    effect.quadraticCurveTo(x + 32, y + 20, x + 58, y - 18);
    effect.strokePath();
    effect.lineStyle(2, 0xfca5a5, whiff ? 0.58 : 0.76);
    effect.beginPath();
    effect.moveTo(x - 28, y + 8);
    effect.lineTo(x + 42, y - 22);
    effect.moveTo(x - 16, y + 24);
    effect.lineTo(x + 34, y + 4);
    effect.strokePath();
    this.fadeGraphics(effect, whiff ? 220 : 300, whiff ? 1.35 : 1.55);
  }

  private spawnRagingFuryShockwaveVfx(): void {
    const player = this.kernel.player;
    const facingSign = player.facing === "left" ? -1 : 1;
    const x = player.position.x + 52 * facingSign;
    const y = this.groundLineY + player.position.z - player.position.y - 24;
    const effect = this.add.graphics().setDepth(252).setScrollFactor(1);
    effect.fillStyle(0x450a0a, 0.44);
    effect.fillEllipse(x, y + 18, 132, 30);
    effect.lineStyle(4, 0xef4444, 0.78);
    effect.beginPath();
    effect.moveTo(x - 62 * facingSign, y + 20);
    effect.lineTo(x + 64 * facingSign, y - 8);
    effect.moveTo(x - 42 * facingSign, y + 30);
    effect.lineTo(x + 58 * facingSign, y + 8);
    effect.strokePath();
    this.fadeGraphics(effect, 180, 1.28);
  }

  private spawnRagingFuryPillarVfx(targetActorId: string | undefined, hitboxId: string): void {
    const target = targetActorId ? this.kernel.actors.find(candidate => candidate.id === targetActorId) : undefined;
    const player = this.kernel.player;
    const ordinal = Number.parseInt(hitboxId.slice("rf_pillar_".length), 10);
    const waveOffset = Number.isFinite(ordinal) ? (ordinal - 5.5) * 5 : 0;
    const x = (target?.position.x ?? player.position.x + 48) + waveOffset;
    const y = this.groundLineY + (target?.position.z ?? player.position.z) - (target?.position.y ?? 0) - 40;
    const height = 74 + (Number.isFinite(ordinal) ? ordinal % 3 : 0) * 8;
    const effect = this.add.graphics().setDepth(253).setScrollFactor(1);
    effect.fillStyle(0x7f1d1d, 0.42);
    effect.fillEllipse(x, y + height / 2, 42, 20);
    effect.lineStyle(4, 0xdc2626, 0.88);
    effect.beginPath();
    effect.moveTo(x - 18, y + height);
    effect.quadraticCurveTo(x - 8, y + 24, x, y);
    effect.quadraticCurveTo(x + 12, y + 26, x + 18, y + height);
    effect.strokePath();
    effect.lineStyle(2, 0xfca5a5, 0.72);
    effect.beginPath();
    effect.moveTo(x - 4, y + height - 6);
    effect.lineTo(x + 4, y + 16);
    effect.moveTo(x + 8, y + height - 14);
    effect.lineTo(x - 8, y + 28);
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

      const model = this.kernel.actors.find(candidate => candidate.id === actor.id);
      const maxHp = model?.resources.maxHp ?? Math.max(actor.hp, 1);
      const hpRatio = Phaser.Math.Clamp(actor.hp / maxHp, 0, 1);
      const baseY = this.groundLineY + actor.pos.z - actor.pos.y;
      const frenzy = model?.buffs.some(buff => buff.type === "frenzy") ?? false;
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
      const hpBarWidth = isBoss ? 104 : isBuilding ? 88 : 52;
      const hpBarX = -hpBarWidth / 2;
      const hpY = isBoss ? -136 : isPlayer ? -112 : isImp ? -106 : -88;
      const labelY = hpY - 18;
      const stateY = hpY + 18;
      const facing = actor.lockedFacing ?? actor.facing ?? model?.facing ?? "right";
      const facingSign = facing === "left" ? -1 : 1;
      const hitFlash = (actor.hitFlashRemaining ?? model?.handfeel.hitFlashRemaining ?? 0) > 0;
      const visibleBodyColor = hitFlash ? 0xffffff : bodyColor;
      const visibleHeadColor = hitFlash ? 0xffffff : headColor;

      const recoilFrames = model?.handfeel.visualRecoilRemaining ?? actor.visualRecoilRemaining ?? 0;
      const recoilT = recoilFrames > 0 ? Math.min(1, recoilFrames / 6) : 0;
      const visualRecoilX = (model?.handfeel.visualRecoilX ?? actor.visualRecoilX ?? 0) * recoilT;
      const visualRecoilZ = (model?.handfeel.visualRecoilZ ?? actor.visualRecoilZ ?? 0) * recoilT;
      view.container.setPosition(actor.pos.x + visualRecoilX, baseY + visualRecoilZ);
      view.container.setDepth(Math.round(baseY));
      view.container.alpha = actor.dead ? 0.64 : 1;
      const spriteSpec = this.spriteSpecFor(actor, model);
      const usingSprite = spriteSpec !== null;
      const hurtTilt = actor.reaction === "light_stagger" || actor.reaction === "heavy_stagger" || actor.reaction === "knockback";
      const launched = actor.reaction === "launch" || actor.reaction === "air_hitstun" || actor.reaction === "falling";
      // Sprite sheets already include hurt/down/launch poses. Do not rotate the entire
      // container for sprite actors, otherwise skeleton/Boss frames turn sideways.
      view.container.angle = usingSprite ? 0 : actor.dead || actor.reaction === "downed" ? 90 : hurtTilt ? (facing === "right" ? -8 : 8) : launched ? -4 : 0;
      view.container.scaleY = usingSprite ? 1 : actor.reaction === "getting_up" ? 0.92 : launched ? 1.05 : 1;

      view.body.setFillStyle(visibleBodyColor, 1);
      view.body.setStrokeStyle(1, 0x0f172a, 1);
      view.head.setFillStyle(visibleHeadColor, 1);
      view.head.setPosition(facingSign === 1 ? -8 : -12, -72);
      view.face.setPosition(facingSign === 1 ? 7 : -13, -66);
      view.face.setFillStyle(hitFlash ? 0x111827 : 0x0f172a, 1);
      view.head.setStrokeStyle(1, 0x0f172a, 1);
      view.legsL.setFillStyle(legColor, 1);
      view.legsR.setFillStyle(legColor, 1);
      view.shadow.setFillStyle(0x000000, actor.dead ? 0.18 : 0.34);
      view.shadow.setSize(isBoss ? 120 : isBuilding ? 88 : isImp ? 48 : 52, isBoss ? 20 : isImp ? 9 : 12);

      if (spriteSpec) {
        // Normalized spritesheets use fixed-size cells and Phaser frame indices.
        // Runtime no longer uses full-sheet crop x/y as display-origin data.
        (view.sprite as any).setTexture(spriteSpec.key, spriteSpec.frame);
        (view.sprite as any).resetCrop?.();
        view.sprite.setOrigin(0.5, 1);
        view.sprite.setScale(spriteSpec.scale);
        view.sprite.setPosition(0, spriteSpec.offsetY ?? 2);
        view.sprite.setFlipX(facing === "left");
        view.sprite.setVisible(true);
        view.sprite.setAlpha(actor.dead ? 0.72 : hitFlash ? 0.94 : 1);
        if (hitFlash) (view.sprite as any).setTint?.(0xffdddd);
        else view.sprite.clearTint();
        view.body.setVisible(false);
        view.head.setVisible(false);
        view.face.setVisible(false);
        view.legsL.setVisible(false);
        view.legsR.setVisible(false);
      } else {
        view.sprite.setVisible(false);
        view.body.setVisible(true);
        view.head.setVisible(true);
        view.face.setVisible(true);
        view.legsL.setVisible(true);
        view.legsR.setVisible(true);
      }

      view.hpBack.setPosition(hpBarX, hpY);
      view.hpBack.setSize(hpBarWidth, 5);
      view.hpFill.setPosition(hpBarX, hpY);
      view.hpFill.setSize(hpBarWidth * hpRatio, 5);
      view.hpBack.setFillStyle(0x7f1d1d, 1);
      view.hpFill.setFillStyle(actor.dead ? 0x334155 : isBoss ? 0xf59e0b : isBuilding ? 0x22c55e : 0x22c55e, 1);

      view.label.setText(actor.id);
      view.label.setPosition(0, labelY);
      view.state.setText(`${actor.reaction}${actor.action ? `/${actor.action}` : ""}`);
      view.state.setPosition(0, stateY);
      view.state.setVisible(this.debugOverlayVisible);
      if (actor.reaction === "armor_feedback_only") view.state.setColor("#fbbf24");
      else if (hurtTilt || launched || actor.reaction === "downed") view.state.setColor("#fecaca");
      else view.state.setColor("#cbd5e1");

      view.weapon.clear();
      if (isPlayer && actor.action && !spriteSpec) {
        const action = getAction(actor.action as Parameters<typeof getAction>[0]);
        const isAttackAction = ["NormalBasic1", "NormalBasic2", "NormalBasic3", "DashAttack", "JumpAttack", "FrenzyBasic1", "FrenzyBasic2", "FrenzyBasic3", "UpwardSlash", "MountainousWheel", "RagingFury", "Bloodlust"].includes(actor.action);
        if (isAttackAction) {
          const localFrame = model?.currentAction?.localFrame ?? 0;
          const active = action.active.some(box => localFrame >= box.start && localFrame <= box.end);
          const frenzyColor = frenzy ? 0xef4444 : 0xd1d5db;
          const attackFacing = model?.currentAction?.lockedFacing ?? facing;
          const facingSign = attackFacing === "left" ? -1 : 1;
          const arcRadius = actor.action === "RagingFury" ? 92 : actor.action === "UpwardSlash" ? 70 : actor.action === "NormalBasic3" ? 72 : actor.action === "NormalBasic2" ? 62 : 52;
          const bladeY = actor.action === "UpwardSlash" ? -60 : -44;
          if (active) {
            view.weapon.lineStyle(10, 0x7f1d1d, 0.82);
            view.weapon.beginPath();
            if (actor.action === "UpwardSlash") {
              view.weapon.arc(34 * facingSign, -44, arcRadius, attackFacing === "left" ? 2.55 : -0.95, attackFacing === "left" ? 4.35 : 1.05, false);
            } else {
              view.weapon.arc(40 * facingSign, bladeY, arcRadius, attackFacing === "left" ? 2.55 : -0.65, attackFacing === "left" ? 3.95 : 0.78, false);
            }
            view.weapon.strokePath();
            view.weapon.lineStyle(5, frenzy ? 0xef4444 : 0xfef3c7, 0.95);
            view.weapon.beginPath();
            if (actor.action === "UpwardSlash") {
              view.weapon.arc(34 * facingSign, -44, arcRadius - 7, attackFacing === "left" ? 2.58 : -0.9, attackFacing === "left" ? 4.25 : 0.95, false);
            } else {
              view.weapon.arc(40 * facingSign, bladeY, arcRadius - 7, attackFacing === "left" ? 2.6 : -0.58, attackFacing === "left" ? 3.82 : 0.66, false);
            }
            view.weapon.strokePath();
            view.weapon.fillStyle(0xef4444, 0.6);
            view.weapon.fillCircle((66 + (actor.action === "NormalBasic3" ? 28 : 0)) * facingSign, bladeY + 4, actor.action === "NormalBasic3" ? 5 : 3);
          }
        }
      }
    }
  }

  private createActorView(id: string): ActorView {
    const container = this.add.container(0, 0);
    container.setScrollFactor(1);

    const shadow = this.add.ellipse(0, 10, 40, 12, 0x000000, 0.34);
    shadow.setOrigin(0.5, 0.5);

    const sprite = this.add.image(0, 0, "player_berserker_norm");
    sprite.setOrigin(0.5, 1);
    sprite.setVisible(false);

    const legsL = this.add.rectangle(-12, -12, 9, 18, 0x111827);
    legsL.setOrigin(0.5, 0.5);
    const legsR = this.add.rectangle(3, -12, 9, 18, 0x111827);
    legsR.setOrigin(0.5, 0.5);

    const body = this.add.rectangle(-16, -52, 32, 40, 0x2563eb);
    body.setOrigin(0, 0);
    body.setStrokeStyle(1, 0x0f172a, 1);

    const head = this.add.rectangle(-10, -72, 20, 18, 0xfca5a5);
    head.setOrigin(0, 0);
    head.setStrokeStyle(1, 0x0f172a, 1);

    const face = this.add.rectangle(7, -66, 4, 4, 0x0f172a);
    face.setOrigin(0.5, 0.5);

    const weapon = this.add.graphics().setScrollFactor(1).setDepth(140);

    const hpBack = this.add.rectangle(-21, -82, 42, 5, 0x7f1d1d);
    hpBack.setOrigin(0, 0);

    const hpFill = this.add.rectangle(-21, -82, 42, 5, 0x22c55e);
    hpFill.setOrigin(0, 0);
    hpFill.setScale(1, 1);

    const label = this.add.text(0, -74, id, {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "11px",
      color: "#f8fafc",
      align: "center",
    });
    label.setOrigin(0.5, 0.5);

    const state = this.add.text(0, -60, "", {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "10px",
      color: "#cbd5e1",
      align: "center",
    });
    state.setOrigin(0.5, 0.5);

    container.add([shadow, sprite, legsL, legsR, body, head, face, weapon, hpBack, hpFill, label, state]);

    return { container, shadow, sprite, legsL, legsR, body, head, face, weapon, hpBack, hpFill, label, state };
  }


  private spriteSpecFor(actor: ActorSnapshot, model?: any): SpriteSpec | null {
    return getCombatSpriteSpec({
      id: actor.id,
      action: actor.action ?? model?.currentAction?.actionName ?? null,
      reaction: actor.reaction,
      locomotion: actor.locomotion,
      tick: this.kernel.tickCount,
      localFrame: model?.currentAction?.localFrame ?? 0,
      dead: actor.dead,
    });
  }

  private syncHudOverlay(snapshot: DebugSnapshot): void {
    if (!this.hudGraphics || !this.hudText) return;
    const player = this.kernel.player;
    const maxHp = player.resources.maxHp || 1;
    const hpRatio = Phaser.Math.Clamp(player.resources.hp / maxHp, 0, 1);
    const frenzy = player.buffs.find(buff => buff.type === "frenzy");
    const frenzyRatio = frenzy ? Phaser.Math.Clamp((frenzy.expiresAtTick ?? snapshot.tick) - snapshot.tick, 0, 180) / 180 : 0;

    this.hudGraphics.clear();
    this.hudGraphics.fillStyle(0x0f172a, 0.75);
    this.hudGraphics.fillRoundedRect(12, 12, 340, 72, 10);
    this.hudGraphics.lineStyle(1, 0x334155, 1);
    this.hudGraphics.strokeRoundedRect(12, 12, 340, 72, 10);
    this.hudGraphics.fillStyle(0x7f1d1d, 1);
    this.hudGraphics.fillRect(24, 32, 180, 10);
    this.hudGraphics.fillStyle(0x22c55e, 1);
    this.hudGraphics.fillRect(24, 32, 180 * hpRatio, 10);
    this.hudGraphics.fillStyle(0x334155, 1);
    this.hudGraphics.fillRect(24, 52, 180, 8);
    this.hudGraphics.fillStyle(0xef4444, 1);
    this.hudGraphics.fillRect(24, 52, 180 * frenzyRatio, 8);

    this.hudText.setText([
      `HP ${player.resources.hp}/${maxHp}`,
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

    this.debugText.setText([
      `Tick: ${snapshot.tick} | Events: ${snapshot.eventCount} | Actors: ${snapshot.performance.actorCount}`,
      `Player: ${player ? `${player.action ?? "Idle"} @ x=${player.pos.x.toFixed(1)} facing=${this.kernel.player.facing}` : "missing"}`,
      `LastHit: ${snapshot.lastHit.actionName ?? "-"} ${snapshot.lastHit.finalReaction ?? ""} dmg=${snapshot.lastHit.finalDamage ?? 0}`,
      `Scenario: ${scenario}`,
      `TickCost: ${(snapshot.performance.tickCostMs ?? 0).toFixed(1)}ms | Pool: ${snapshot.performance.poolStatus}`,
    ]);
  }

  private syncPlayerFeedback(): void {
    if (!this.playerHitFlashUntil) return;
    const now = this.time.now;
    this.feedbackGraphics.forEach(graphics => graphics.clear());

    if (now > this.playerHitFlashUntil) {
      this.playerHitFlashUntil = 0;
      return;
    }

    const player = this.kernel.player;
    const baseY = this.groundLineY + player.position.z - player.position.y;
    const x = player.position.x - 16;
    const y = baseY - 48;

    const flash = this.feedbackGraphics[0] ?? this.add.graphics().setDepth(240).setScrollFactor(1);
    this.feedbackGraphics[0] = flash;
    flash.lineStyle(2, 0xf43f5e, 0.95);
    flash.strokeRect(x - 3, y - 3, 38, 54);
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
    if (event.code === "F6") {
      event.preventDefault();
      this.reset();
      return;
    }
    this.kernel.inputState.keyDown(event.code, event.repeat);
  };

  private handleKeyUp = (event: GameplayKeyEvent): void => {
    if (this.gameplayKeys.has(event.code)) event.preventDefault();
    this.kernel.inputState.keyUp(event.code);
  };

  private handleBlur = (): void => {
    this.kernel.inputState.clearAll();
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.simulation.pause();
      this.kernel.inputState.clearAll();
      return;
    }
    this.simulation.resume();
  };

  private shutdown = (): void => {
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
}
