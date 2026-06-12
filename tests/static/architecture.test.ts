import { readFileSync } from "node:fs";
import path from "node:path";
import { assert } from "./test-utils.js";
import { EngineKernel } from "../../src/engine/kernel/EngineKernel.js";
import { FixedStepSimulation } from "../../src/runtime/loop/FixedStepSimulation.js";

const combatSceneSource = readFileSync(
  path.resolve("src/game/CombatScene.ts"),
  "utf8",
);

assert.ok(
  !combatSceneSource.includes("../combat/kernel/FixedStepSimulation.js"),
  "CombatScene should not import combat FixedStepSimulation",
);
assert.ok(
  !combatSceneSource.includes("../combat/debug/DebugOverlay.js"),
  "CombatScene should not import combat DebugSnapshot types",
);
assert.ok(
  !combatSceneSource.includes('this.kernel.bus.on("GrabAttached", _event => { /* P4 */ });'),
  "CombatScene should not leave GrabAttached as a silent stub",
);
assert.ok(
  !combatSceneSource.includes('this.kernel.bus.on("VfxRequested", _event => { /* P4 */ });'),
  "CombatScene should not leave VfxRequested as a silent stub",
);
assert.ok(
  !combatSceneSource.includes('this.kernel.bus.on("StatusApplied", _event => { /* P4 */ });'),
  "CombatScene should not leave StatusApplied as a silent stub",
);

const kernel = new EngineKernel(42);
const simulation = new FixedStepSimulation(kernel);
simulation.update(17);
assert.equal(kernel.tickCount, 1, "runtime-owned fixed-step loop should tick the engine kernel");

const snapshot = kernel.debugSnapshot();
assert.equal(typeof snapshot.tick, "number", "engine debugSnapshot should expose runtime tick shape");
assert.equal(typeof snapshot.lastHit.tick, "number", "engine debugSnapshot should expose runtime lastHit shape");
assert.equal(typeof snapshot.performance.actorCount, "number", "engine debugSnapshot should expose runtime performance counters");

console.log("architecture: runtime shell guard verified");
