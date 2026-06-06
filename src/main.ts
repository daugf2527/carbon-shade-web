import Phaser from "phaser";
import { BootScene } from "./game/BootScene.js";
import { CombatScene } from "./game/CombatScene.js";
import { SceneSelectScene } from "./game/SceneSelectScene.js";
import { SCENE_REGISTRY } from "./game/sceneRegistry.js";

type CombatLabRuntime = {
  scene?: CombatScene;
  kernel?: CombatScene["kernel"];
  kernelReady: boolean;
  evidence?: Record<string, unknown>;
};

const params = new URLSearchParams(window.location.search);
const directScene = params.get("scene");

const app = document.getElementById("app") ?? document.body;
const runtime = window as typeof window & { combatLab?: CombatLabRuntime };
runtime.combatLab = runtime.combatLab ?? { kernelReady: false };

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

game.registry.set("directScene", directScene);

Object.assign(window as typeof window, { combatLab: runtime.combatLab, combatLabGame: game });

// ── 轻量全局错误捕获（黑屏排查遗留）─────────────────────────────────────────────
// 把未捕获的 JS 错误打到 console.error，便于排查启动/渲染问题。不渲染任何 DOM（不挡画面）。
// 早先的可视诊断 HUD 已移除（黑屏确认是浏览器加载中间态，非游戏 bug）。
window.addEventListener("error", (e) => {
  console.error("[combatLab uncaught]", e.message, e.error?.stack ?? "");
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[combatLab unhandledrejection]", e.reason);
});

