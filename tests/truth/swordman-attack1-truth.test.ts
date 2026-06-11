/**
 * swordman-attack1-truth.test.ts — engine scene-style truth guard for attack1.
 *
 * Proves the engine scene kernel still lands a single PVF-driven attack1 hit with sane damage,
 * emits HitConfirmed, and preserves the player/grunt truth envelope used by CombatScene.
 */

import { assert } from "../static/test-utils.js";
import { buildEngineSceneKernel, primeTargetForAction } from "../fixtures/engineSceneHarness.js";

const { kernel, player, grunt } = buildEngineSceneKernel(42);

// 1. Player truth stats still come from the swordman truth shard path.
assert.ok(player.stats.physicalAttack >= 50 && player.stats.physicalAttack <= 150, `player physicalAttack should stay on swordman truth (~82.8), got ${player.stats.physicalAttack}`);
assert.ok(player.stats.hpMax >= 800 && player.stats.hpMax <= 1100, `player hpMax should stay on swordman truth (~952.5), got ${player.stats.hpMax}`);
assert.equal(player.hp, player.stats.hpMax, "player should start full HP");

// 2. attack1 starts idle and the grunt begins alive in scene-like stats.
assert.equal(player.currentActionName, null, "player should start without an action");
assert.ok(grunt.hp > 0, `grunt should start alive, got hp=${grunt.hp}`);

// 3. Place the grunt in the same scene-like attack range and trigger attack1 once.
primeTargetForAction(kernel, player, grunt, 1, 30);
const hpBefore = grunt.hp;
let hitCount = 0;
let observedActionName: string | null = null;
let observedReaction: string | null = null;
kernel.bus.on("HitConfirmed", (event) => {
  const payload = event.payload as {
    attackerId?: string;
    targetId?: string;
    actionName?: string;
    finalReaction?: string;
  };
  if (payload.attackerId === "player" && payload.targetId === "grunt") {
    hitCount += 1;
    observedActionName = payload.actionName ?? null;
    observedReaction = payload.finalReaction ?? null;
  }
});

kernel.requestAction(player.id, "attack1");
for (let i = 0; i < 12; i += 1) kernel.tick();

// 4. attack1 should land exactly once per action instance and deal sensible damage.
assert.equal(hitCount, 1, `attack1 should hit grunt exactly once per instance, got ${hitCount}`);
const hpAfter = grunt.hp;
const hpDrop = hpBefore - hpAfter;
assert.ok(hpDrop > 0, `grunt hp should drop after attack1, before=${hpBefore} after=${hpAfter}`);
assert.ok(hpAfter > 0, `grunt should survive one attack1 hit, hp=${hpAfter}/${grunt.stats.hpMax}`);
assert.ok(hpDrop >= 5 && hpDrop <= 80, `attack1 damage should stay in the expected truth envelope (5-80), got ${hpDrop}`);
assert.equal(observedActionName, "attack1", `HitConfirmed should preserve actionName=attack1, got ${String(observedActionName)}`);
assert.equal(observedReaction, "light_stagger", `attack1 should report light_stagger, got ${String(observedReaction)}`);

console.log(`PoC truth test PASS — attack1 dealt ${hpDrop} damage (${hpBefore} → ${hpAfter} HP), player physAtk=${player.stats.physicalAttack}, maxHp=${player.stats.hpMax}`);
