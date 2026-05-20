import type Phaser from "phaser";
import { EquipmentAlignScene } from "./scenes/EquipmentAlignScene.js";
import { CombatScene } from "./CombatScene.js";

export type SceneCategory = "asset" | "kernel" | "handfeel" | "regression";

export interface SceneEntry {
  key: string;
  title: string;
  description: string;
  category: SceneCategory;
  sceneClass: new (...args: unknown[]) => Phaser.Scene;
}

export const CATEGORY_ORDER: SceneCategory[] = ["asset", "kernel", "handfeel", "regression"];

export const CATEGORY_LABELS: Record<SceneCategory, string> = {
  asset: "资源验证",
  kernel: "内核行为",
  handfeel: "手感原型",
  regression: "数据回归",
};

export const SCENE_REGISTRY: SceneEntry[] = [
  {
    key: "equipment-align",
    title: "Equipment Layer Alignment",
    description: "Verify 4-layer costume sprite alignment on 500×500 canvas",
    category: "asset",
    sceneClass: EquipmentAlignScene as unknown as new (...args: unknown[]) => Phaser.Scene,
  },
  {
    key: "combat",
    title: "Combat Training Ground",
    description: "事件驱动战斗内核 · 完整 hit chain · normalized spritesheet 渲染",
    category: "handfeel",
    sceneClass: CombatScene as unknown as new (...args: unknown[]) => Phaser.Scene,
  },
];

export function getScenesByCategory(category: SceneCategory): SceneEntry[] {
  return SCENE_REGISTRY.filter(entry => entry.category === category);
}

export function getCategoryCount(category: SceneCategory): number {
  return getScenesByCategory(category).length;
}
