import { assert } from "./test-utils.js";
import type { ActionName, Actor } from "../../src/combat/types.js";
import { createActor } from "../../src/combat/actors/ActorFactory.js";
import { getAction } from "../../src/combat/actions/FrameDataAction.js";
import { HitResolver2D5 } from "../../src/combat/hit/HitResolver2D5.js";
import { HitDecisionResolver } from "../../src/combat/hit/HitDecisionResolver.js";
import { DamageResolver } from "../../src/combat/damage/DamageResolver.js";
import { ReactionResolver } from "../../src/combat/reaction/ReactionResolver.js";
import { StatusEffectSystem } from "../../src/combat/status/StatusEffectSystem.js";
import { CombatEventBus } from "../../src/combat/events/CombatEventBus.js";

function beginAction(actor: Actor, actionName: ActionName, localFrame = 1): void {
  actor.currentAction = {
    id: `${actor.id}-${actionName}`,
    actionName,
    ownerId: actor.id,
    startTick: 0,
    localFrame,
    phase: "active",
    commandSource: "debug",
    lockedFacing: actor.facing,
    facingLocked: true,
    movementLocked: true,
    activeHitboxIds: [],
    alreadyHitByGroup: new Map(),
    hitConfirmed: false,
    armorHitConfirmed: false,
    downedHitConfirmed: false,
    whiffed: false,
    cancelTokens: [],
    interrupted: false,
    hitStopFrozen: false,
  };
}

function decideHit(attacker: Actor, target: Actor, actionName: ActionName, hitboxIndex = 0) {
  const action = getAction(actionName);
  const hitbox = action.active[hitboxIndex];
  assert.ok(hitbox);
  beginAction(attacker, actionName, hitbox.start);
  const hitResolver = new HitResolver2D5();
  const decisionResolver = new HitDecisionResolver();
  const query = hitResolver.buildQuery(1, attacker, hitbox);
  const geometry = hitResolver.geometry(query, target);
  return decisionResolver.decide(1, query, hitbox, attacker, target, geometry);
}

{
  const player = createActor("player", "player", "player", 260, 0);
  const grunt = createActor("grunt", "enemy", "enemy", 310, 0);
  beginAction(grunt, "EnemyBasic", 1);

  const decision = decideHit(player, grunt, "NormalBasic1");
  assert.equal(decision.accepted, true);
  assert.equal(decision.rejectedReason, undefined);

  const damage = new DamageResolver().apply(grunt, new DamageResolver().requestFromHit(decision, "corr-test", "NormalBasic1"), {
    isCounter: decision.isCounter,
    isBackAttack: decision.isBackAttack,
    isCritical: false,
  });
  assert.equal(damage.finalDamage, 12);
  assert.equal(grunt.resources.hp, grunt.resources.maxHp - 12);

  const reaction = new ReactionResolver().resolve(grunt, decision);
  new ReactionResolver().apply(grunt, reaction, decision, player, 1);
  assert.equal(reaction, "light_stagger");
  assert.equal(grunt.reactionState, "light_stagger");
  assert.equal(grunt.currentAction, undefined);
  assert.ok((grunt.handfeel.hitFlashRemaining ?? 0) > 0);
}

{
  const player = createActor("player", "player", "player", 260, 0);
  const boss = createActor("boss", "boss", "enemy", 318, 0);
  const decision = decideHit(player, boss, "UpwardSlash");

  assert.equal(decision.accepted, true);
  assert.equal(decision.armorDecision?.baseType, "boss_super_armor");
  assert.equal(decision.armorDecision?.controlBlocked, true);
  assert.equal(decision.armorDecision?.finalReaction, "armor_feedback_only");

  const reaction = new ReactionResolver().resolve(boss, decision);
  new ReactionResolver().apply(boss, reaction, decision, player, 1);
  assert.equal(boss.reactionState, "armor_feedback_only");
  assert.equal(boss.velocity.y, 0);
  assert.equal(boss.velocity.x, 0);
}

{
  const player = createActor("player", "player", "player", 260, 0);
  const grunt = createActor("grunt", "enemy", "enemy", 310, 0);
  const action = getAction("NormalBasic1");
  const hitbox = action.active[0];
  assert.ok(hitbox);
  beginAction(player, "NormalBasic1", hitbox.start);
  player.currentAction?.alreadyHitByGroup.set(hitbox.hitGroupId, new Set([grunt.id]));

  const hitResolver = new HitResolver2D5();
  const decisionResolver = new HitDecisionResolver();
  const query = hitResolver.buildQuery(1, player, hitbox);
  const decision = decisionResolver.decide(1, query, hitbox, player, grunt, hitResolver.geometry(query, grunt));

  assert.equal(decision.accepted, false);
  assert.equal(decision.rejectedReason, "already_hit_in_group");
}

{
  const player = createActor("player", "player", "player", 260, 0);
  const target = createActor("grunt", "enemy", "enemy", 520, 0);
  const bus = new CombatEventBus();
  const status = new StatusEffectSystem();

  status.applyBleed(target, player.id, "ForceBleed", 0, bus, 1);
  const hpBefore = target.resources.hp;
  const reactionBefore = target.reactionState;
  const ticked = status.tick(target, 30, bus, false);

  assert.equal(ticked, true);
  assert.equal(target.resources.hp, hpBefore - 6);
  assert.equal(target.reactionState, reactionBefore);
  assert.equal(target.currentAction, undefined);
}
