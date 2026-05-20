import Phaser from "phaser";

export const CARBON_PALETTE = {
  ink: 0x0d0e12,
  veil: 0x15171d,
  ember: 0xc97b3e,
  bone: 0xd8c9a8,
  glow: 0x6ec5ff,
  mist: 0x4a5868,
  shadeLine: 0x2a2d36,
  debt: 0xb34254,
} as const;

export const CARBON_PALETTE_HEX = {
  ink: "#0d0e12",
  veil: "#15171d",
  ember: "#c97b3e",
  bone: "#d8c9a8",
  glow: "#6ec5ff",
  mist: "#4a5868",
  shadeLine: "#2a2d36",
  debt: "#b34254",
} as const;

export const SERIF_FONT_STACK = '"Source Han Serif SC", "Noto Serif SC", "Songti SC", "SimSun", serif';
export const MONO_FONT_STACK = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

const BUTTON_SIZE = 56;
const BUTTON_MARGIN = 24;

export function attachReturnControls(scene: Phaser.Scene): void {
  scene.input.keyboard?.on("keydown-ESC", () => {
    scene.scene.start("scene-select");
  });

  const container = scene.add.container(BUTTON_MARGIN + BUTTON_SIZE / 2, BUTTON_MARGIN + BUTTON_SIZE / 2);
  container.setDepth(10000);
  container.setScrollFactor(0);

  const bg = scene.add.graphics();
  bg.fillStyle(CARBON_PALETTE.veil, 0.78);
  bg.fillRoundedRect(-BUTTON_SIZE / 2, -BUTTON_SIZE / 2, BUTTON_SIZE, BUTTON_SIZE, 8);
  bg.lineStyle(2, CARBON_PALETTE.ember, 0.9);
  bg.strokeRoundedRect(-BUTTON_SIZE / 2, -BUTTON_SIZE / 2, BUTTON_SIZE, BUTTON_SIZE, 8);

  const arrow = scene.add.graphics();
  arrow.lineStyle(3, CARBON_PALETTE.ember, 1);
  arrow.beginPath();
  arrow.moveTo(8, -10);
  arrow.lineTo(-8, 0);
  arrow.lineTo(8, 10);
  arrow.strokePath();

  const hitArea = scene.add.rectangle(0, 0, BUTTON_SIZE, BUTTON_SIZE, 0x000000, 0);
  hitArea.setInteractive({ useHandCursor: true });

  container.add([bg, arrow, hitArea]);

  hitArea.on("pointerover", () => {
    bg.clear();
    bg.fillStyle(CARBON_PALETTE.veil, 0.95);
    bg.fillRoundedRect(-BUTTON_SIZE / 2, -BUTTON_SIZE / 2, BUTTON_SIZE, BUTTON_SIZE, 8);
    bg.lineStyle(2, CARBON_PALETTE.bone, 1);
    bg.strokeRoundedRect(-BUTTON_SIZE / 2, -BUTTON_SIZE / 2, BUTTON_SIZE, BUTTON_SIZE, 8);
  });

  hitArea.on("pointerout", () => {
    bg.clear();
    bg.fillStyle(CARBON_PALETTE.veil, 0.78);
    bg.fillRoundedRect(-BUTTON_SIZE / 2, -BUTTON_SIZE / 2, BUTTON_SIZE, BUTTON_SIZE, 8);
    bg.lineStyle(2, CARBON_PALETTE.ember, 0.9);
    bg.strokeRoundedRect(-BUTTON_SIZE / 2, -BUTTON_SIZE / 2, BUTTON_SIZE, BUTTON_SIZE, 8);
  });

  hitArea.on("pointerup", () => {
    scene.scene.start("scene-select");
  });
}
