import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const k = new CombatKernel();
const grunt = k.actors.find(a => a.id === "grunt")!;
const player = k.player;

grunt.position.x = 525;
grunt.position.z = 0;
// HP 54: shockwave(30) + pillar1(12) = 42, pillar2(12) = -2 => DEATH on pillar 2
grunt.resources.hp = 54;

k.requestAction(player, "RagingFury");
k.runTicks(40);

const hitConfirmed = k.bus.archive.filter(
  e => e.type === "HitConfirmed" && e.targetActorId === "grunt"
);
const hitRejectedDead = k.bus.archive.filter(
  e => e.type === "HitRejected"
    && e.targetActorId === "grunt"
    && (e.payload as Record<string, unknown>).rejectedReason === "target_dead"
);

// grunt dies on pillar 2; pillars 3-10 should be rejected as target_dead
assert.ok(hitRejectedDead.length >= 2,
  `Expected >=2 target_dead rejections, got ${hitRejectedDead.length}`);
console.log(`OK: ${hitConfirmed.length} hits before death, ${hitRejectedDead.length} rejected(target_dead) after`);
