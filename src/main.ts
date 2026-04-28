import Phaser from "phaser";
import { BootScene } from "./game/BootScene.js";
import { CombatScene } from "./game/CombatScene.js";

type CombatLabRuntime = { scene?: CombatScene; kernel?: CombatScene["kernel"] };

const app = document.getElementById("app") ?? document.body;
const runtime = window as typeof window & { combatLab?: CombatLabRuntime };
runtime.combatLab = runtime.combatLab ?? {};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: app,
  width: 1280,
  height: 720,
  backgroundColor: "#0b1220",
  pixelArt: true,
  scene: [BootScene, CombatScene],
  render: { antialias: false, pixelArt: true },
  fps: { target: 60, forceSetTimeOut: false },
});

const controls = document.createElement("div");
controls.innerHTML = [
  '<button id="run-scenario">Run deterministic scenario</button>',
  '<button id="reset">Reset</button>',
  '<button id="export-replay">Export Replay</button>',
  '<button id="export-handfeel">Export Handfeel Report</button>',
].join("");
app.appendChild(controls);

document.getElementById("run-scenario")?.addEventListener("click", () => {
  runtime.combatLab?.scene?.runScenario();
  logJson();
});

document.getElementById("reset")?.addEventListener("click", () => {
  runtime.combatLab?.scene?.reset();
  logJson();
});


document.getElementById("export-handfeel")?.addEventListener("click", () => {
  const report = runtime.combatLab?.kernel?.exportHandfeelReport?.() ?? {};
  const reportJson = JSON.stringify(report, null, 2);
  const blob = new Blob([reportJson], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "handfeel-report.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  console.log(reportJson);
});

document.getElementById("export-replay")?.addEventListener("click", () => {
  const replay = runtime.combatLab?.kernel?.replay.export() ?? {};
  const replayJson = JSON.stringify(replay, null, 2);
  const blob = new Blob([replayJson], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "replay.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  logJson();
});

function logJson(): void {
  const kernel = runtime.combatLab?.kernel;
  if (!kernel) {
    console.log(JSON.stringify({ status: "booting", note: "Open the Boot scene and click Start" }, null, 2));
    return;
  }

  console.log(JSON.stringify({ scenario: kernel.scenario, debug: kernel.debugSnapshot() }, null, 2));
  console.log(JSON.stringify(kernel.replay.export(), null, 2));
}

logJson();

Object.assign(window as typeof window, { combatLab: runtime.combatLab, combatLabGame: game });
