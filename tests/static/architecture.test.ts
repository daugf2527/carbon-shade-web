import { readFileSync } from "node:fs";
import path from "node:path";
import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";
import { FixedStepSimulation } from "../../src/combat/kernel/FixedStepSimulation.js";

const combatKernel = new CombatKernel();
assert.ok(
  combatKernel.bus
  && combatKernel.hitResolver
  && combatKernel.damageResolver
  && combatKernel.reactionResolver
  && combatKernel.hitStop
  && combatKernel.recoil
  && combatKernel.status
  && combatKernel.buffs
  && combatKernel.cooldowns
  && combatKernel.death
  && combatKernel.replay,
);

const combatSimulation = new FixedStepSimulation(combatKernel);
combatSimulation.update(17);
assert.equal(combatKernel.tickCount, 1);

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
