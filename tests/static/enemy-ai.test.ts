import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const k = new CombatKernel();
const grunt = k.actors.find(a => a.id === "grunt")!;
const startX = grunt.position.x;

k.runTicks(360);

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
