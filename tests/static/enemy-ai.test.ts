import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const k = new CombatKernel();
const grunt = k.actors.find(a => a.id === "grunt")!;
// Place grunt within detection range (detectRange=360, player at x≈390)
grunt.position.x = 700;
const startX = grunt.position.x;

// AI needs time to detect, approach, and attack
k.runTicks(480);

assert.ok(grunt.position.x < startX, "Enemy AI must approach the player");
assert.ok(
  k.bus.archive.some(
    e => e.type === "ActionEntered" && e.targetActorId === "grunt" && (e.payload as any).actionName === "EnemyBasic",
  ),
  "Enemy AI must enter EnemyBasic",
);
assert.ok(
  k.bus.archive.some(
    e => e.type === "DamageApplied" && (e.payload as any).attackerId === "grunt" && (e.payload as any).sourceKind === "enemy_normal",
  ),
  "Enemy AI damage must be attributed to enemy_normal",
);
