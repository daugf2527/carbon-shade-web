import Phaser from "phaser";
import type { EngineKernel } from "../../engine/kernel/EngineKernel.js";
import type { Actor } from "../../engine/core/Actor.js";
import type { AniBox } from "../../engine/core/AnimationPlayer.js";

/** Default body damage box (matches CombatResolutionSystem.DEFAULT_BODY_BOX) for actors with no animation. */
const DEFAULT_BODY_BOX: AniBox = { x1: -20, y1: 0, z1: -20, x2: 20, y2: 80, z2: 20 };

export class DebugLayer {
  private readonly hitboxGraphics: Phaser.GameObjects.Graphics;
  private readonly hurtboxGraphics: Phaser.GameObjects.Graphics;
  private readonly pushboxGraphics: Phaser.GameObjects.Graphics;
  private readonly flashGraphics: Phaser.GameObjects.Graphics;
  private visible = false;
  private boxesVisible = false;
  private lastArchiveSize = 0;
  private readonly flashUntil = new Map<string, number>();

  constructor(private readonly scene: Phaser.Scene, private readonly groundLineY: number) {
    this.hurtboxGraphics = this.scene.add.graphics().setScrollFactor(1).setDepth(120);
    this.pushboxGraphics = this.scene.add.graphics().setScrollFactor(1).setDepth(121);
    this.hitboxGraphics = this.scene.add.graphics().setScrollFactor(1).setDepth(122);
    this.flashGraphics = this.scene.add.graphics().setScrollFactor(1).setDepth(123);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.hurtboxGraphics.setVisible(visible && this.boxesVisible);
    this.pushboxGraphics.setVisible(visible && this.boxesVisible);
    this.hitboxGraphics.setVisible(visible && this.boxesVisible);
    this.flashGraphics.setVisible(visible);
  }

  toggleVisible(): boolean {
    this.setVisible(!this.visible);
    return this.visible;
  }

  toggleBoxesVisible(): boolean {
    this.boxesVisible = !this.boxesVisible;
    this.hurtboxGraphics.setVisible(this.visible && this.boxesVisible);
    this.pushboxGraphics.setVisible(this.visible && this.boxesVisible);
    this.hitboxGraphics.setVisible(this.visible && this.boxesVisible);
    return this.boxesVisible;
  }

  // ── P3.1: adapted to EngineKernel (engine events are flat; Actor uses x/y/z + animationPlayer) ──
  sync(kernel: EngineKernel): void {
    const archiveSize = kernel.bus.archive.length;
    if (archiveSize < this.lastArchiveSize) {
      this.lastArchiveSize = 0;
      this.flashUntil.clear();
    }

    const now = this.scene.time.now;
    for (const event of kernel.bus.archive.slice(this.lastArchiveSize)) {
      if (event.type === "HitConfirmed") {
        const defenderId = (event.payload as { defenderId?: string }).defenderId;
        if (defenderId) this.flashUntil.set(defenderId, now + 80);
      }
    }
    this.lastArchiveSize = archiveSize;

    this.hurtboxGraphics.clear();
    this.pushboxGraphics.clear();
    this.hitboxGraphics.clear();
    this.flashGraphics.clear();

    this.hurtboxGraphics.setVisible(this.visible && this.boxesVisible);
    this.pushboxGraphics.setVisible(this.visible && this.boxesVisible);
    this.hitboxGraphics.setVisible(this.visible && this.boxesVisible);
    this.flashGraphics.setVisible(this.visible);

    if (!this.visible) return;

    for (const actor of kernel.actors) {
      // Hurtboxes: current frame's damageBoxes, or default body box.
      const frame = actor.animationPlayer.currentFrame;
      const dmgBoxes = frame?.damageBoxes?.length ? frame.damageBoxes : [DEFAULT_BODY_BOX];
      for (const box of dmgBoxes) {
        const rect = this.projectLocalBox(actor, box);
        this.strokeRect(this.hurtboxGraphics, rect, 0x3b82f6, actor.isDead ? 0.12 : 0.35, 1);
      }

      // Pushbox: engine has no pushBox concept — draw a simple ground footprint.
      const pushRect = this.projectPushFootprint(actor);
      this.strokeRect(this.pushboxGraphics, pushRect, 0x22c55e, actor.isDead ? 0.12 : 0.28, 1);

      // Hitboxes: engine returns world-space attack boxes for the current frame.
      if (!actor.isDead) {
        for (const wb of kernel.debugHitBoxes(actor.id)) {
          const rect = this.projectWorldBox(wb.x, wb.y, wb.w, wb.h);
          this.strokeRect(this.hitboxGraphics, rect, 0xef4444, 0.65, 2);
        }
      }

      // Hit flash
      const flashUntil = this.flashUntil.get(actor.id);
      if (flashUntil && flashUntil > now) {
        const body = this.projectActorBody(actor);
        this.flashGraphics.fillStyle(0xffffff, 0.26);
        this.flashGraphics.fillRect(body.x, body.y, body.w, body.h);
      } else if (flashUntil) {
        this.flashUntil.delete(actor.id);
      }
    }
  }

  destroy(): void {
    this.hurtboxGraphics.destroy();
    this.pushboxGraphics.destroy();
    this.hitboxGraphics.destroy();
    this.flashGraphics.destroy();
    this.flashUntil.clear();
  }

  // ── Projection helpers (engine: x=horizontal, y=height-up, z=depth ~0) ──

  private actorZ(actor: Actor): number {
    return (actor as Actor & { z?: number }).z ?? 0;
  }

  private projectActorBody(actor: Actor): { x: number; y: number; w: number; h: number } {
    const baseY = this.groundLineY + this.actorZ(actor) - actor.y;
    return { x: actor.x - 16, y: baseY - 48, w: 32, h: 48 };
  }

  /** Local AniBox (around actor origin) → screen rect. Facing flips horizontal extent. */
  private projectLocalBox(actor: Actor, box: AniBox): { x: number; y: number; w: number; h: number } {
    const sign = actor.facing === -1 ? -1 : 1;
    const lx1 = box.x1 * sign;
    const lx2 = box.x2 * sign;
    const worldXMin = actor.x + Math.min(lx1, lx2);
    const worldW = Math.abs(lx2 - lx1);
    const yLo = Math.min(box.y1, box.y2);
    const yHi = Math.max(box.y1, box.y2);
    const screenTop = this.groundLineY + this.actorZ(actor) - actor.y - yHi;
    return { x: worldXMin, y: screenTop, w: worldW, h: yHi - yLo };
  }

  /** World-space attack box {x,y,w,h} (x=left, y=bottom in world height-up) → screen rect. */
  private projectWorldBox(x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
    const screenTop = this.groundLineY - (y + h);
    return { x, y: screenTop, w, h };
  }

  private projectPushFootprint(actor: Actor): { x: number; y: number; w: number; h: number } {
    const width = actor.id === "boss" ? 68 : 36;
    const depth = 18;
    const screenY = this.groundLineY + this.actorZ(actor);
    return { x: actor.x - width / 2, y: screenY - depth / 2, w: width, h: depth };
  }

  private strokeRect(graphics: Phaser.GameObjects.Graphics, rect: { x: number; y: number; w: number; h: number }, color: number, alpha: number, lineWidth: number): void {
    graphics.lineStyle(lineWidth, color, alpha);
    graphics.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }
}
