import { assert } from "./test-utils.js";
import { Actor } from "../../src/engine/core/Actor.js";
import { BOSS_SUPER_ARMOR, BUILDING_ARMOR } from "../../src/engine/core/ArmorProfile.js";
import {
  buildEngineSceneKernel,
  buildSceneLikeGruntStats,
  primeTargetForAction,
} from "../fixtures/engineSceneHarness.js";

{
  const { kernel, player } = buildEngineSceneKernel(42);
  const building = new Actor("building", "monster", buildSceneLikeGruntStats());
  building.armorProfile = BUILDING_ARMOR;
  kernel.addActor(building, false);
  primeTargetForAction(kernel, player, building, 1, 30);

  const hpBefore = building.hp;
  let finalReaction: string | null = null;
  kernel.bus.on("HitConfirmed", (event) => {
    const payload = event.payload as { targetId?: string; finalReaction?: string };
    if (payload.targetId === "building") finalReaction = payload.finalReaction ?? null;
  });

  kernel.requestAction(player.id, "attack3");
  for (let i = 0; i < 16; i += 1) kernel.tick();

  assert.ok(building.hp < hpBefore, "BuildingArmor should still take damage");
  assert.equal(finalReaction, "armor_feedback_only", "BuildingArmor should block launch/control");
  assert.equal(building.y, 0, "BuildingArmor target should stay grounded");
  assert.equal(building.airborne, null, "BuildingArmor target should not enter airborne state");
}

{
  const { kernel, player } = buildEngineSceneKernel(42);
  const boss = new Actor("boss", "monster", buildSceneLikeGruntStats());
  boss.armorProfile = BOSS_SUPER_ARMOR;
  kernel.addActor(boss, false);
  primeTargetForAction(kernel, player, boss, 1, 30);

  let finalReaction: string | null = null;
  kernel.bus.on("HitConfirmed", (event) => {
    const payload = event.payload as { targetId?: string; finalReaction?: string };
    if (payload.targetId === "boss") finalReaction = payload.finalReaction ?? null;
  });

  kernel.requestAction(player.id, "attack3");
  for (let i = 0; i < 16; i += 1) kernel.tick();

  assert.equal(finalReaction, "armor_feedback_only", "BossSuperArmor should not launch");
  assert.equal(boss.y, 0, "BossSuperArmor target should stay grounded");
  assert.equal(boss.airborne, null, "BossSuperArmor target should not enter airborne state");
}
