import { assert } from "./test-utils.js";
import { Actor } from "../../src/engine/core/Actor.js";
import type { AniDef } from "../../src/engine/core/AnimationPlayer.js";
import { BOSS_SUPER_ARMOR } from "../../src/engine/core/ArmorProfile.js";
import {
  buildEngineSceneKernel,
  buildSceneLikeGruntStats,
  primeTargetForAction,
} from "../fixtures/engineSceneHarness.js";

function attack(frames: number, activeFrames: number[], boxW = 50, boxH = 80): AniDef {
  return {
    framesCount: frames,
    loop: false,
    frames: Array.from({ length: frames }, (_, index) => ({
      index,
      delay: 1000 / 60,
      attackBoxes: activeFrames.includes(index)
        ? [{ x1: 0, y1: 0, z1: -30, x2: boxW, y2: boxH, z2: 30 }]
        : [],
      damageBoxes: [],
    })),
  };
}

{
  const { kernel, player, grunt } = buildEngineSceneKernel(42);
  primeTargetForAction(kernel, player, grunt, 1, 30);

  let hitCount = 0;
  let finalReaction: string | null = null;
  let damage = 0;
  kernel.bus.on("HitConfirmed", (event) => {
    const payload = event.payload as {
      attackerId?: string;
      targetId?: string;
      finalReaction?: string;
      finalDamage?: number;
    };
    if (payload.attackerId === "player" && payload.targetId === "grunt") {
      hitCount += 1;
      finalReaction = payload.finalReaction ?? null;
      damage = payload.finalDamage ?? 0;
    }
  });

  const hpBefore = grunt.hp;
  kernel.requestAction(player.id, "attack1");
  for (let i = 0; i < 12; i += 1) kernel.tick();

  assert.equal(hitCount, 1, `attack1 should hit grunt once, got ${hitCount}`);
  assert.ok(damage > 0, `attack1 should deal damage, got ${damage}`);
  assert.ok(grunt.hp < hpBefore, `attack1 should lower grunt hp, before=${hpBefore} after=${grunt.hp}`);
  assert.ok(grunt.hp > 0, `attack1 should not one-shot grunt, hp=${grunt.hp}/${grunt.stats.hpMax}`);
  assert.equal(finalReaction, "light_stagger");
  assert.equal(grunt.reaction?.kind, "hit");
  assert.equal(grunt.currentActionName, null);
}

{
  const { kernel, player, actions } = buildEngineSceneKernel(42);
  const boss = new Actor("boss", "monster", buildSceneLikeGruntStats());
  boss.armorProfile = BOSS_SUPER_ARMOR;
  kernel.addActor(boss, false);
  actions.define("UpwardSlash", attack(5, [2], 55, 100));
  primeTargetForAction(kernel, player, boss, 1, 30);

  let hitCount = 0;
  let finalReaction: string | null = null;
  let damage = 0;
  kernel.bus.on("HitConfirmed", (event) => {
    const payload = event.payload as {
      attackerId?: string;
      targetId?: string;
      finalReaction?: string;
      finalDamage?: number;
    };
    if (payload.attackerId === "player" && payload.targetId === "boss") {
      hitCount += 1;
      finalReaction = payload.finalReaction ?? null;
      damage = payload.finalDamage ?? 0;
    }
  });

  kernel.requestAction(player.id, "UpwardSlash");
  for (let i = 0; i < 12; i += 1) kernel.tick();

  assert.equal(hitCount, 1, `UpwardSlash should hit boss once, got ${hitCount}`);
  assert.ok(damage > 0, `UpwardSlash should still damage armored boss, got ${damage}`);
  assert.equal(finalReaction, "armor_feedback_only");
  assert.equal(boss.reaction?.kind, "hit");
  assert.equal(boss.airborne, null);
  assert.equal(boss.knockback, null);
}

{
  const { kernel, player, grunt, actions } = buildEngineSceneKernel(42);
  actions.define("LoopingSlash", attack(4, [1, 2], 50, 80));
  primeTargetForAction(kernel, player, grunt, 1, 30);

  let hitCount = 0;
  kernel.bus.on("HitConfirmed", (event) => {
    const payload = event.payload as {
      attackerId?: string;
      targetId?: string;
      actionName?: string;
    };
    if (
      payload.attackerId === "player"
      && payload.targetId === "grunt"
      && payload.actionName === "LoopingSlash"
    ) {
      hitCount += 1;
    }
  });

  kernel.requestAction(player.id, "LoopingSlash");
  for (let i = 0; i < 8; i += 1) kernel.tick();

  assert.equal(hitCount, 1, `same active window should hit once even across consecutive active frames, got ${hitCount}`);
}

{
  const { kernel, grunt } = buildEngineSceneKernel(42);
  let appliedCount = 0;
  kernel.bus.on("StatusApplied", (event) => {
    const payload = event.payload as { actorId?: string; type?: string };
    if (payload.actorId === "grunt" && payload.type === "bleed") appliedCount += 1;
  });

  const hpBefore = grunt.hp;
  const reactionBefore = grunt.reaction;
  const actionBefore = grunt.currentActionName;
  kernel.requestBleed(grunt.id);
  for (let i = 0; i < 31; i += 1) kernel.tick();

  assert.equal(appliedCount, 1, `requestBleed should emit one StatusApplied for grunt, got ${appliedCount}`);
  assert.equal(grunt.hp, hpBefore - 6);
  assert.equal(grunt.reaction, reactionBefore);
  assert.equal(grunt.currentActionName, actionBefore);
}
