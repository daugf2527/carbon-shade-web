import Phaser from "phaser";
import { AudioUnlockGate } from "./audio/AudioUnlockGate.js";
import { NORMALIZED_SPRITE_SHEETS } from "./SpriteFrameLibrary.js";

export class BootScene extends Phaser.Scene {
  private readonly audioGate = new AudioUnlockGate();

  constructor() {
    super("boot");
  }

  preload(): void {
    for (const sheet of Object.values(NORMALIZED_SPRITE_SHEETS)) {
      this.load.spritesheet(sheet.key, sheet.url, {
        frameWidth: sheet.cellW,
        frameHeight: sheet.cellH,
      });
    }
  }

  create(): void {
    const { width, height } = this.cameras.main;
    this.cameras.main.setBackgroundColor("#0b1220");

    this.add.text(width / 2, height / 2 - 72, "Combat Lab 0.2-R3 Asset Pass", {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "34px",
      color: "#e2e8f0",
      align: "center",
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 28, "Sprite-integrated Training Ground", {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "16px",
      color: "#94a3b8",
      align: "center",
    }).setOrigin(0.5);

    const button = this.add.rectangle(width / 2, height / 2 + 56, 220, 52, 0x2563eb)
      .setStrokeStyle(2, 0x93c5fd)
      .setInteractive({ useHandCursor: true });

    const label = this.add.text(width / 2, height / 2 + 56, "Start Training Ground", {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "15px",
      color: "#ffffff",
      align: "center",
    }).setOrigin(0.5);

    const startCombat = async (): Promise<void> => {
      await this.audioGate.unlock().catch(() => undefined);
      this.game.registry.set("audioGate", this.audioGate);
      this.scene.start("combat");
    };

    button.on("pointerup", () => void startCombat());
    label.on("pointerup", () => void startCombat());
    this.input.keyboard?.once("keydown-ENTER", () => void startCombat());
    this.input.keyboard?.once("keydown-SPACE", () => void startCombat());
  }
}
