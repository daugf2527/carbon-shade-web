import Phaser from "phaser";
import { AudioUnlockGate } from "./audio/AudioUnlockGate.js";
import { NORMALIZED_SPRITE_SHEETS } from "./SpriteFrameLibrary.js";

type RuntimeEvidence = {
  buildHash?: string;
  assets?: {
    expected: { key: string; url: string }[];
    loaded: { key: string; url?: string }[];
    failed: { key: string; url?: string; error?: string }[];
  };
  combat?: Record<string, unknown>;
};

function runtimeEvidence(): RuntimeEvidence {
  const runtime = window as typeof window & { combatLab?: { evidence?: RuntimeEvidence } };
  runtime.combatLab = runtime.combatLab ?? {};
  runtime.combatLab.evidence = runtime.combatLab.evidence ?? {};
  return runtime.combatLab.evidence;
}

export class BootScene extends Phaser.Scene {
  private readonly audioGate = new AudioUnlockGate();

  constructor() {
    super("boot");
  }

  preload(): void {
    const evidence = runtimeEvidence();
    evidence.buildHash = typeof __BUILD_HASH__ !== "undefined" ? __BUILD_HASH__ : "local-dev";
    evidence.assets = {
      expected: Object.values(NORMALIZED_SPRITE_SHEETS).map(sheet => ({ key: sheet.key, url: sheet.url })),
      loaded: [],
      failed: [],
    };

    this.load.on(Phaser.Loader.Events.FILE_COMPLETE, (key: string) => {
      const sheet = Object.values(NORMALIZED_SPRITE_SHEETS).find(candidate => candidate.key === key);
      if (!sheet || evidence.assets?.loaded.some(item => item.key === key)) return;
      evidence.assets?.loaded.push({ key, url: sheet.url });
    });

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: { key?: string; src?: string; url?: string }) => {
      const key = file.key ?? "unknown";
      if (evidence.assets?.failed.some(item => item.key === key)) return;
      evidence.assets?.failed.push({ key, url: file.src ?? file.url, error: "loaderror" });
    });

    for (const sheet of Object.values(NORMALIZED_SPRITE_SHEETS)) {
      this.load.spritesheet(sheet.key, sheet.url, {
        frameWidth: sheet.cellW,
        frameHeight: sheet.cellH,
      });
    }
  }

  create(): void {
    const evidence = runtimeEvidence();
    evidence.combat = { ...(evidence.combat ?? {}), bootSceneReady: true };

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
