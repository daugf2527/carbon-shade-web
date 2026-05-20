import Phaser from "phaser";
import { AudioUnlockGate } from "./audio/AudioUnlockGate.js";
import { NORMALIZED_SPRITE_SHEETS, registerDnfAction } from "./SpriteFrameLibrary.js";
import { getRuntimeEvidenceCollector } from "../runtime/evidence/RuntimeEvidenceCollector.js";
import { initializeActionManifestForRuntime } from "./bootActionManifest.js";

export class BootScene extends Phaser.Scene {
  private readonly audioGate = new AudioUnlockGate();

  constructor() {
    super("boot");
  }

  preload(): void {
    const evidence = getRuntimeEvidenceCollector(typeof __BUILD_HASH__ !== "undefined" ? __BUILD_HASH__ : "local-dev");
    for (const sheet of Object.values(NORMALIZED_SPRITE_SHEETS)) {
      evidence.recordExpectedAsset({ key: sheet.key, url: sheet.url });
    }

    this.load.on(Phaser.Loader.Events.FILE_COMPLETE, (key: string) => {
      const sheet = Object.values(NORMALIZED_SPRITE_SHEETS).find(candidate => candidate.key === key);
      if (!sheet) return;
      evidence.recordAssetLoaded({ key, url: sheet.url });
    });

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: { key?: string; src?: string; url?: string }) => {
      const key = file.key ?? "unknown";
      evidence.recordAssetFailed({ key, url: file.src ?? file.url, error: "loaderror" });
    });

    for (const sheet of Object.values(NORMALIZED_SPRITE_SHEETS)) {
      this.load.spritesheet(sheet.key, sheet.url, {
        frameWidth: sheet.cellW,
        frameHeight: sheet.cellH,
      });
    }

    // DNF swordman actions — individual PNGs + meta.json per action
    const DNF_ACTIONS_MANIFEST: Array<{ name: string; frameCount: number }> = [
      { name: "stay", frameCount: 6 },
      { name: "dash", frameCount: 8 },
      { name: "jump", frameCount: 16 },
      { name: "damage1", frameCount: 1 },
      { name: "damage2", frameCount: 1 },
      { name: "hitback", frameCount: 9 },
      { name: "down", frameCount: 6 },
      { name: "overturn", frameCount: 1 },
      { name: "attack1", frameCount: 10 },
      { name: "attack2", frameCount: 11 },
      { name: "attack3", frameCount: 9 },
    ];
    const DNF_BASE_DIR = "assets/dnf/character/swordman";
    const DNF_EQUIPMENT_LAYERS = ["coat_a", "hair_a", "pants_a", "shoes_a"];

    for (const { name, frameCount } of DNF_ACTIONS_MANIFEST) {
      const prefix = `dnf_swordman_${name}`;
      // Load body frames
      for (let i = 0; i < frameCount; i++) {
        const idx = String(i).padStart(2, "0");
        this.load.image(`${prefix}_${idx}`, `${DNF_BASE_DIR}/${name}/frame_${idx}.png`);
      }
      this.load.json(`${prefix}_meta`, `${DNF_BASE_DIR}/${name}/meta.json`);

      // Load equipment layer frames (only for stay action for now)
      if (name === "stay") {
        for (const layer of DNF_EQUIPMENT_LAYERS) {
          const layerDir = `${DNF_BASE_DIR}/${name}/${layer}`;
          // Check if layer-meta.json exists by trying to load it
          this.load.json(`${prefix}_${layer}_meta`, `${layerDir}/layer-meta.json`);
          for (let i = 0; i < frameCount; i++) {
            const idx = String(i).padStart(2, "0");
            this.load.image(`${prefix}_${layer}_${idx}`, `${layerDir}/frame_${idx}.png`);
          }
        }
      }
    }
  }

  create(): void {
    getRuntimeEvidenceCollector().recordCombatSnapshot({ bootSceneReady: true });

    const { width, height } = this.cameras.main;
    this.cameras.main.setBackgroundColor("#0d0e12");

    this.add.text(width / 2, height / 2 - 96, "碳影", {
      fontFamily: '"Source Han Serif SC", "Noto Serif SC", "Songti SC", "SimSun", serif',
      fontSize: "72px",
      color: "#d8c9a8",
      align: "center",
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 36, "Carbon Shade", {
      fontFamily: '"Source Han Serif SC", "Noto Serif SC", "Songti SC", "SimSun", serif',
      fontSize: "22px",
      color: "#c97b3e",
      align: "center",
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 4, "硅光照世，碳影问心", {
      fontFamily: '"Source Han Serif SC", "Noto Serif SC", "Songti SC", "SimSun", serif',
      fontSize: "14px",
      color: "#4a5868",
      align: "center",
    }).setOrigin(0.5);

    const button = this.add.rectangle(width / 2, height / 2 + 80, 240, 56, 0x15171d)
      .setStrokeStyle(2, 0xc97b3e)
      .setInteractive({ useHandCursor: true });

    const label = this.add.text(width / 2, height / 2 + 80, "进入明庭", {
      fontFamily: '"Source Han Serif SC", "Noto Serif SC", "Songti SC", "SimSun", serif',
      fontSize: "18px",
      color: "#d8c9a8",
      align: "center",
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 140, "Combat Lab v0.3 · Scene Selector", {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "11px",
      color: "#4a5868",
      align: "center",
    }).setOrigin(0.5);

    let errorText: Phaser.GameObjects.Text | null = null;
    const showBootError = (error: unknown): void => {
      const message = error instanceof Error ? error.message : String(error);
      if (!errorText) {
        errorText = this.add.text(width / 2, height / 2 + 200, "", {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: "13px",
          color: "#b34254",
          align: "center",
          wordWrap: { width: Math.min(780, width - 80) },
        }).setOrigin(0.5);
      }
      errorText.setText(`Action manifest failed to load:\n${message}`);
    };

    const startCombat = async (): Promise<void> => {
      await this.audioGate.unlock().catch(() => undefined);
      try {
        await initializeActionManifestForRuntime();
      } catch (error) {
        showBootError(error);
        throw error;
      }
      const dnfActions = ["stay", "dash", "jump", "damage1", "damage2", "hitback", "down", "overturn", "attack1", "attack2", "attack3"];
      for (const name of dnfActions) {
        const meta = this.cache.json.get(`dnf_swordman_${name}_meta`);
        if (meta) registerDnfAction(`swordman_${name}`, meta, `dnf_swordman_${name}`);
      }
      this.game.registry.set("audioGate", this.audioGate);
      this.scene.start("scene-select");
    };

    button.on("pointerup", () => void startCombat());
    label.on("pointerup", () => void startCombat());
    this.input.keyboard?.once("keydown-ENTER", () => void startCombat());
    this.input.keyboard?.once("keydown-SPACE", () => void startCombat());
  }
}
