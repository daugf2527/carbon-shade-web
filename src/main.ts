import Phaser from "phaser";
import { BootScene } from "./game/BootScene.js";
import { CombatScene } from "./game/CombatScene.js";
import { SceneSelectScene } from "./game/SceneSelectScene.js";
import { SCENE_REGISTRY } from "./game/sceneRegistry.js";

type CombatLabRuntime = { scene?: CombatScene; kernel?: CombatScene["kernel"]; evidence?: Record<string, unknown> };

const app = document.getElementById("app") ?? document.body;
const runtime = window as typeof window & { combatLab?: CombatLabRuntime };
runtime.combatLab = runtime.combatLab ?? {};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: app,
  width: 1920,
  height: 1080,
  backgroundColor: "#0d0e12",
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, SceneSelectScene, ...SCENE_REGISTRY.map(entry => entry.sceneClass)],
  render: { antialias: false, pixelArt: true },
  fps: { target: 60, forceSetTimeOut: false },
});

Object.assign(window as typeof window, { combatLab: runtime.combatLab, combatLabGame: game });
