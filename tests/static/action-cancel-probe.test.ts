import { assert } from "./test-utils.js";
import { CombatKernel } from "../../src/combat/kernel/CombatKernel.js";
import type { ActionName, Actor } from "../../src/combat/types.js";

function setCurrentAction(actor: Actor, actionName: ActionName, localFrame: number, hitConfirmed: boolean): void {
  actor.currentAction = {
    id: `${actor.id}-${actionName}-probe`,
    actionName,
    ownerId: actor.id,
    startTick: 0,
    localFrame,
    phase: "recovery",
    commandSource: "debug",
    lockedFacing: actor.facing,
    facingLocked: true,
    movementLocked: true,
    activeHitboxIds: [],
    alreadyHitByGroup: new Map(),
    hitConfirmed,
    armorHitConfirmed: false,
    downedHitConfirmed: false,
    whiffed: !hitConfirmed,
    cancelTokens: [],
    interrupted: false,
    hitStopFrozen: false,
  };
}

{
  const kernel = new CombatKernel({ enableReplay: false });
  const player = kernel.player;
  setCurrentAction(player, "Bloodlust", 9, true);
  assert.equal(kernel.requestAction(player, "attack1"), false, "Bloodlust should not cancel into basic attack before its hit cancel frame");

  setCurrentAction(player, "Bloodlust", 10, true);
  assert.equal(kernel.requestAction(player, "attack1"), true, "Bloodlust should support basic attack cancel after confirmed hit cancel frame");
  assert.equal(player.currentAction?.actionName, "attack1");
}

{
  const kernel = new CombatKernel({ enableReplay: false });
  const player = kernel.player;
  setCurrentAction(player, "RagingFury", 12, true);
  assert.equal(kernel.requestAction(player, "attack1"), false, "RagingFury should not cancel into basic attack before its hit cancel frame");

  setCurrentAction(player, "RagingFury", 13, true);
  assert.equal(kernel.requestAction(player, "attack1"), true, "RagingFury should support basic attack cancel after confirmed hit cancel frame");
  assert.equal(player.currentAction?.actionName, "attack1");
}

{
  const kernel = new CombatKernel({ enableReplay: false });
  const player = kernel.player;
  setCurrentAction(player, "RagingFury", 48, false);
  assert.equal(kernel.requestAction(player, "attack1"), false, "RagingFury whiff cancel should stay closed before the whiff cancel frame");

  setCurrentAction(player, "RagingFury", 49, false);
  assert.equal(kernel.requestAction(player, "attack1"), true, "RagingFury whiff cancel should open at the configured whiff cancel frame");
  assert.equal(player.currentAction?.actionName, "attack1");
}
