/**
 * EquipmentAlignScene - DNF layered sprite alignment verification.
 *
 * Migrated from src/game/EquipmentTestScene.ts (2026-05-20) into the new
 * scene-selector architecture.
 */

import Phaser from "phaser";
import { DnfLayeredSprite, AlignmentMode } from "../DnfLayeredSprite.js";
import { attachReturnControls, CARBON_PALETTE_HEX, MONO_FONT_STACK } from "../sceneHelpers.js";

export class EquipmentAlignScene extends Phaser.Scene {
  private layeredSprite?: DnfLayeredSprite;
  private currentMode: AlignmentMode = "mode2_500x500_canvas";
  private modeText?: Phaser.GameObjects.Text;
  private instructionText?: Phaser.GameObjects.Text;

  private readonly MODES: AlignmentMode[] = [
    "mode1_imganchor_as_offset",
    "mode2_500x500_canvas",
    "mode3_relative_to_body",
    "mode4_ignore_imganchor",
    "mode5_negated_imganchor",
  ];

  constructor() {
    super("equipment-align");
  }

  create(): void {
    const { width, height } = this.cameras.main;
    this.cameras.main.setBackgroundColor(CARBON_PALETTE_HEX.ink);

    this.add.text(width / 2, 30, "Equipment Layer Alignment", {
      fontFamily: MONO_FONT_STACK,
      fontSize: "24px",
      color: CARBON_PALETTE_HEX.bone,
    }).setOrigin(0.5);

    this.instructionText = this.add.text(width / 2, 70, "SPACE 切换对齐模式 · ←/→ 切换帧 · Esc 返回明庭", {
      fontFamily: MONO_FONT_STACK,
      fontSize: "14px",
      color: CARBON_PALETTE_HEX.mist,
    }).setOrigin(0.5);

    this.modeText = this.add.text(width / 2, height - 40, "", {
      fontFamily: MONO_FONT_STACK,
      fontSize: "16px",
      color: CARBON_PALETTE_HEX.ember,
    }).setOrigin(0.5);

    const bodyMeta = this.cache.json.get("dnf_swordman_stay_meta");
    if (!bodyMeta) {
      this.add.text(width / 2, height / 2, "ERROR: Body meta not loaded", {
        fontFamily: MONO_FONT_STACK,
        fontSize: "18px",
        color: CARBON_PALETTE_HEX.debt,
      }).setOrigin(0.5);
      attachReturnControls(this);
      return;
    }

    const layerMetas = new Map<string, unknown>();
    const layers = ["coat_a", "hair_a", "pants_a", "shoes_a"];
    for (const layer of layers) {
      const meta = this.cache.json.get(`dnf_swordman_stay_${layer}_meta`);
      if (meta) layerMetas.set(layer, meta);
    }

    if (layerMetas.size === 0) {
      this.add.text(width / 2, height / 2, "ERROR: No equipment layers loaded", {
        fontFamily: MONO_FONT_STACK,
        fontSize: "18px",
        color: CARBON_PALETTE_HEX.debt,
      }).setOrigin(0.5);
      attachReturnControls(this);
      return;
    }

    this.layeredSprite = new DnfLayeredSprite(
      this,
      width / 2,
      height / 2 + 50,
      "dnf_swordman_stay",
      bodyMeta,
      layerMetas as Map<string, any>
    );
    this.layeredSprite.setScale(3);

    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0xff0000, 0.5);
    graphics.lineBetween(width / 2 - 20, height / 2 + 50, width / 2 + 20, height / 2 + 50);
    graphics.lineBetween(width / 2, height / 2 + 30, width / 2, height / 2 + 70);

    this.updateModeText();

    this.input.keyboard?.on("keydown-SPACE", () => this.cycleMode());
    this.input.keyboard?.on("keydown-LEFT", () => this.changeFrame(-1));
    this.input.keyboard?.on("keydown-RIGHT", () => this.changeFrame(1));

    attachReturnControls(this);
  }

  private cycleMode(): void {
    const currentIndex = this.MODES.indexOf(this.currentMode);
    const nextIndex = (currentIndex + 1) % this.MODES.length;
    this.currentMode = this.MODES[nextIndex];
    this.layeredSprite?.setAlignmentMode(this.currentMode);
    this.updateModeText();
  }

  private changeFrame(delta: number): void {
    if (!this.layeredSprite) return;
    const bodyMeta = this.cache.json.get("dnf_swordman_stay_meta");
    const maxFrames = bodyMeta.frames.length;
    const currentFrame = (this.layeredSprite as unknown as { currentFrame?: number }).currentFrame ?? 0;
    const newFrame = (currentFrame + delta + maxFrames) % maxFrames;
    this.layeredSprite.setFrame(newFrame);
    this.updateModeText();
  }

  private updateModeText(): void {
    const currentFrame = (this.layeredSprite as unknown as { currentFrame?: number } | undefined)?.currentFrame ?? 0;
    const modeNames: Record<AlignmentMode, string> = {
      mode1_imganchor_as_offset: "Mode 1: imgAnchor as direct offset",
      mode2_500x500_canvas: "Mode 2: 500×500 virtual canvas",
      mode3_relative_to_body: "Mode 3: Relative to body imgAnchor",
      mode4_ignore_imganchor: "Mode 4: Ignore imgAnchor",
      mode5_negated_imganchor: "Mode 5: Negated imgAnchor",
    };
    this.modeText?.setText(`${modeNames[this.currentMode]} | Frame: ${currentFrame}`);
  }
}
