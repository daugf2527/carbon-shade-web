import Phaser from "phaser";
import type { CombatKernel } from "../combat/kernel/CombatKernel.js";

const DIR_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as const;
const DIR_PAIRS = {
  ArrowLeft: "ArrowRight",
  ArrowRight: "ArrowLeft",
  ArrowUp: "ArrowDown",
  ArrowDown: "ArrowUp",
} as const;

function isTouchDevice(): boolean {
  return ("ontouchstart" in window) || ((window as any).matchMedia?.("(pointer: coarse)").matches);
}

export class TouchControls {
  private scene: Phaser.Scene;
  private kernel: CombatKernel;
  private joystickBase: Phaser.GameObjects.Graphics;
  private joystickThumb: Phaser.GameObjects.Graphics;
  private joystickCenter = { x: 200, y: 870 };
  private joystickRadius = 90;
  private thumbRadius = 45;
  private joystickPointerId: number | null = null;
  private heldDirs = new Set<string>();
  private buttons: Array<{
    graphics: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
    x: number;
    y: number;
    radius: number;
    code: string;
    pointerId: number | null;
  }> = [];

  constructor(scene: Phaser.Scene, kernel: CombatKernel) {
    this.scene = scene;
    this.kernel = kernel;

    if (!isTouchDevice()) {
      // Create invisible controls that won't render
      this.joystickBase = scene.add.graphics().setVisible(false);
      this.joystickThumb = scene.add.graphics().setVisible(false);
      return;
    }

    // Joystick base (outer circle)
    this.joystickBase = scene.add.graphics().setScrollFactor(0).setDepth(300);
    this.drawJoystickBase();

    // Joystick thumb (inner circle)
    this.joystickThumb = scene.add.graphics().setScrollFactor(0).setDepth(301);
    this.drawJoystickThumb(this.joystickCenter.x, this.joystickCenter.y);

    // Attack buttons
    const btnDefs = [
      { x: 1770, y: 930, code: "KeyX", label: "A", color: 0x3b82f6 },
      { x: 1650, y: 840, code: "KeyJ", label: "B", color: 0xef4444 },
      { x: 1875, y: 840, code: "KeyK", label: "C", color: 0x22c55e },
      { x: 1762, y: 750, code: "KeyC", label: "D", color: 0xeab308 },
    ];

    for (const def of btnDefs) {
      const gfx = scene.add.graphics().setScrollFactor(0).setDepth(300);
      const label = scene.add.text(def.x, def.y, def.label, {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: "20px",
        color: "#ffffff",
        fontStyle: "bold",
      }).setOrigin(0.5).setScrollFactor(0).setDepth(302);

      this.drawButton(gfx, def.x, def.y, 42, def.color);
      this.buttons.push({ graphics: gfx, label, x: def.x, y: def.y, radius: 42, code: def.code, pointerId: null });
    }

    // Input handlers
    scene.input.on("pointerdown", this.handlePointerDown, this);
    scene.input.on("pointermove", this.handlePointerMove, this);
    scene.input.on("pointerup", this.handlePointerUp, this);
    scene.input.on("pointerout", this.handlePointerUp, this);
  }

  private drawJoystickBase(): void {
    this.joystickBase.clear();
    this.joystickBase.fillStyle(0xffffff, 0.12);
    this.joystickBase.fillCircle(this.joystickCenter.x, this.joystickCenter.y, this.joystickRadius);
    this.joystickBase.lineStyle(1, 0xffffff, 0.2);
    this.joystickBase.strokeCircle(this.joystickCenter.x, this.joystickCenter.y, this.joystickRadius);
  }

  private drawJoystickThumb(x: number, y: number): void {
    this.joystickThumb.clear();
    this.joystickThumb.fillStyle(0xffffff, 0.3);
    this.joystickThumb.fillCircle(x, y, this.thumbRadius);
  }

  private drawButton(gfx: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, color: number): void {
    gfx.clear();
    gfx.fillStyle(color, 0.35);
    gfx.fillCircle(x, y, radius);
    gfx.lineStyle(2, color, 0.6);
    gfx.strokeCircle(x, y, radius);
  }

  private handlePointerDown = (pointer: Phaser.Input.Pointer): void => {
    const dx = pointer.x - this.joystickCenter.x;
    const dy = pointer.y - this.joystickCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Joystick zone
    if (dist < this.joystickRadius + 60 && this.joystickPointerId === null) {
      this.joystickPointerId = pointer.id;
      this.updateJoystick(pointer.x, pointer.y);
      return;
    }

    // Attack buttons
    for (const btn of this.buttons) {
      const bdx = pointer.x - btn.x;
      const bdy = pointer.y - btn.y;
      if (Math.sqrt(bdx * bdx + bdy * bdy) < btn.radius + 20 && btn.pointerId === null) {
        btn.pointerId = pointer.id;
        this.kernel.inputState.keyDown(btn.code);
        return;
      }
    }
  };

  private handlePointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === this.joystickPointerId) {
      this.updateJoystick(pointer.x, pointer.y);
    }
  };

  private handlePointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === this.joystickPointerId) {
      this.joystickPointerId = null;
      this.drawJoystickThumb(this.joystickCenter.x, this.joystickCenter.y);
      this.releaseAllDirs();
      return;
    }

    for (const btn of this.buttons) {
      if (pointer.id === btn.pointerId) {
        btn.pointerId = null;
        this.kernel.inputState.keyUp(btn.code);
        return;
      }
    }
  };

  private updateJoystick(px: number, py: number): void {
    const dx = px - this.joystickCenter.x;
    const dy = py - this.joystickCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(dist, this.joystickRadius);
    const angle = Math.atan2(dy, dx);

    const tx = this.joystickCenter.x + Math.cos(angle) * clampedDist;
    const ty = this.joystickCenter.y + Math.sin(angle) * clampedDist;
    this.drawJoystickThumb(tx, ty);

    const newDirs = new Set<string>();
    if (clampedDist > this.thumbRadius * 0.4) {
      // Right half → ArrowRight
      if (angle > -Math.PI * 0.45 && angle < Math.PI * 0.45) {
        newDirs.add("ArrowRight");
      }
      // Left half → ArrowLeft
      if (angle > Math.PI * 0.55 || angle < -Math.PI * 0.55) {
        newDirs.add("ArrowLeft");
      }
      // Up half → ArrowUp
      if (angle < -Math.PI * 0.1 && angle > -Math.PI * 0.9) {
        newDirs.add("ArrowUp");
      }
      // Down half → ArrowDown
      if (angle > Math.PI * 0.1 && angle < Math.PI * 0.9) {
        newDirs.add("ArrowDown");
      }
    }

    // Release directions no longer held
    for (const dir of this.heldDirs) {
      if (!newDirs.has(dir)) {
        this.kernel.inputState.keyUp(dir);
      }
    }
    // Press new directions
    for (const dir of newDirs) {
      if (!this.heldDirs.has(dir)) {
        this.kernel.inputState.keyDown(dir);
      }
    }
    this.heldDirs = newDirs;
  }

  private releaseAllDirs(): void {
    for (const dir of this.heldDirs) {
      this.kernel.inputState.keyUp(dir);
    }
    this.heldDirs.clear();
  }

  destroy(): void {
    this.releaseAllDirs();
    this.scene.input.off("pointerdown", this.handlePointerDown, this);
    this.scene.input.off("pointermove", this.handlePointerMove, this);
    this.scene.input.off("pointerup", this.handlePointerUp, this);
    this.scene.input.off("pointerout", this.handlePointerUp, this);
    this.joystickBase.destroy();
    this.joystickThumb.destroy();
    for (const btn of this.buttons) {
      btn.graphics.destroy();
      btn.label.destroy();
    }
    this.buttons.length = 0;
  }
}
