/**
 * swordman-reaction-formulas.test.ts — engine integration truth for swordman reaction routing.
 *
 * Keeps the old integration intent but moves it onto the engine scene-style kernel. This covers
 * event payloads, reaction kinds, airborne launch, down routing, and facing-signed knockback.
 */

import { assert } from "../static/test-utils.js";
import { buildEngineSceneKernel, primeTargetForAction } from "../fixtures/engineSceneHarness.js";

function runAction(actionName: string, options: { facing?: 1 | -1; offset?: number; ticks?: number } = {}) {
  const { kernel, player, grunt } = buildEngineSceneKernel(42);
  const facing = options.facing ?? 1;
  const offset = options.offset ?? 30;
  const ticks = options.ticks ?? 12;
  let reactionObserved: string | null = null;
  kernel.bus.on("ReactionApplied", (event) => {
    const payload = event.payload as { finalReaction?: string };
    if (payload.finalReaction) reactionObserved = payload.finalReaction;
  });

  primeTargetForAction(kernel, player, grunt, facing, offset);
  kernel.requestAction(player.id, actionName);
  for (let i = 0; i < ticks; i += 1) kernel.tick();

  return { kernel, player, grunt, reactionObserved };
}

// Test 1: attack3 triggers launch + airborne state.
{
  const { grunt, reactionObserved } = runAction("attack3", { ticks: 16 });
  assert.equal(reactionObserved, "launch", `attack3 should emit launch, got ${reactionObserved}`);
  assert.equal(grunt.reaction?.kind, "airborne", `attack3 should leave engine reaction kind airborne, got ${grunt.reaction?.kind}`);
  assert.ok((grunt.airborne?.vy ?? 0) > 0, `attack3 should set positive airborne.vy, got ${grunt.airborne?.vy}`);
  console.log("✓ Test 1: attack3 → launch");
}

// Test 2: attack1 triggers light stagger / engine hit reaction.
{
  const { grunt, reactionObserved } = runAction("attack1");
  assert.equal(reactionObserved, "light_stagger", `attack1 should emit light_stagger, got ${reactionObserved}`);
  assert.equal(grunt.reaction?.kind, "hit", `attack1 should fold to engine hit reaction, got ${grunt.reaction?.kind}`);
  console.log("✓ Test 2: attack1 → light_stagger/hit");
}

// Test 3: dashattack routes to the horizon/stagger branch.
{
  const { grunt, reactionObserved } = runAction("dashattack");
  assert.equal(reactionObserved, "light_stagger", `dashattack should emit light_stagger, got ${reactionObserved}`);
  assert.equal(grunt.reaction?.kind, "stagger", `dashattack should leave engine stagger reaction, got ${grunt.reaction?.kind}`);
  console.log(`✓ Test 3: dashattack → ${reactionObserved}`);
}

// Test 4: attack2 also routes through the horizon/stagger branch.
{
  const { grunt, reactionObserved } = runAction("attack2");
  assert.equal(reactionObserved, "light_stagger", `attack2 should emit light_stagger, got ${reactionObserved}`);
  assert.equal(grunt.reaction?.kind, "stagger", `attack2 should leave engine stagger reaction, got ${grunt.reaction?.kind}`);
  console.log(`✓ Test 4: attack2 → ${reactionObserved}`);
}

// Test 5: facing left flips knockback sign for a push-capable/down action.
{
  const { grunt, reactionObserved } = runAction("chargecrashfinish", { facing: -1, ticks: 6 });
  assert.equal(reactionObserved, "downed", `chargecrashfinish should emit downed, got ${reactionObserved}`);
  assert.equal(grunt.reaction?.kind, "down", `chargecrashfinish should route to engine down, got ${grunt.reaction?.kind}`);
  assert.ok((grunt.knockback?.vx ?? 0) < 0, `facing left should produce negative knockback.vx, got ${grunt.knockback?.vx}`);
  console.log("✓ Test 5: facing left → negative knockback");
}

// Test 6: attack3 launch uses PVF truth rather than a zero/default stub.
{
  const { grunt } = runAction("attack3", { ticks: 16 });
  assert.equal(grunt.reaction?.launchVy, 300, `attack3 launch should preserve PVF liftUp=300 at hit time, got ${grunt.reaction?.launchVy}`);
  console.log("✓ Test 6: PVF launch truth active");
}

console.log("\n✅ All swordman reaction formula tests passed");
