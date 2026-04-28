import Phaser from "phaser";
import type { CombatKernel } from "../../combat/kernel/CombatKernel.js";
import { getAction } from "../../combat/actions/FrameDataAction.js";
import { actorHurtRect, pushRect } from "../../combat/util/geometry.js";
import type { Rect2D5 } from "../../combat/types.js";

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

  sync(kernel: CombatKernel): void {
    const archiveSize = kernel.bus.archive.length;
    if (archiveSize < this.lastArchiveSize) {
      this.lastArchiveSize = 0;
      this.flashUntil.clear();
    }

    const now = this.scene.time.now;
    for (const event of kernel.bus.archive.slice(this.lastArchiveSize)) {
      if (event.type === "HitConfirmed" && event.targetActorId) {
        this.flashUntil.set(event.targetActorId, now + 80);
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
      const hurt = actor.hurtBoxes[0];
      if (hurt) {
        const rect = actorHurtRect(actor.position, hurt);
        const projected = this.projectRect(rect, 0x60a5fa);
        this.strokeRect(this.hurtboxGraphics, projected, 0x3b82f6, actor.flags.dead ? 0.12 : 0.35, 1);
      }

      const push = pushRect(actor.position, actor.pushBox.w, actor.pushBox.d);
      const pushProjected = this.projectPushRect(push);
      this.strokeRect(this.pushboxGraphics, pushProjected, 0x22c55e, actor.flags.dead ? 0.12 : 0.28, 1);

      const action = actor.currentAction ? getAction(actor.currentAction.actionName) : null;
      if (action && actor.currentAction && !actor.flags.dead) {
        for (const hitbox of action.active) {
          if (actor.currentAction.localFrame < hitbox.start || actor.currentAction.localFrame > hitbox.end) continue;
          const query = kernel.hitResolver.buildQuery(kernel.tickCount, actor, hitbox);
          const projected = this.projectRect(query.box, 0xef4444);
          this.strokeRect(this.hitboxGraphics, projected, 0xef4444, 0.65, 2);
        }
      }

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

  private projectActorBody(actor: CombatKernel["actors"][number]): { x: number; y: number; w: number; h: number } {
    const baseY = this.groundLineY + actor.position.z - actor.position.y;
    return { x: actor.position.x - 16, y: baseY - 48, w: 32, h: 48 };
  }

  private projectPushRect(rect: Rect2D5): { x: number; y: number; w: number; h: number } {
    const screenY = this.groundLineY + rect.z;
    return { x: rect.x - rect.w / 2, y: screenY - Math.max(12, rect.d) / 2, w: rect.w, h: Math.max(12, rect.d) };
  }

  private projectRect(rect: Rect2D5, _color: number): { x: number; y: number; w: number; h: number } {
    const screenY = this.groundLineY + rect.z - rect.y;
    return { x: rect.x - rect.w / 2, y: screenY - rect.h / 2, w: rect.w, h: rect.h };
  }

  private strokeRect(graphics: Phaser.GameObjects.Graphics, rect: { x: number; y: number; w: number; h: number }, color: number, alpha: number, lineWidth: number): void {
    graphics.lineStyle(lineWidth, color, alpha);
    graphics.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }
}
