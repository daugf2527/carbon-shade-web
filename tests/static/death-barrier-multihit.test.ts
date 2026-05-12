import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";

const k = new CombatKernel();
const grunt = k.actors.find(a => a.id === "grunt")!;
const player = k.player;

// Place grunt right in RagingFury's fire zone (player at x≈390, fire extends rightward)
grunt.position.x = 395;
grunt.position.z = 0;
// HP 12: dies instantly on shockwave (38 dmg), all 10 pillars rejected as target_dead
grunt.resources.hp = 12;

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
