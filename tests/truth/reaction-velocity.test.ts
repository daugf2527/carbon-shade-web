/**
 * reaction-velocity.test.ts — engine truth guard for launch/knockback velocity wiring.
 *
 * Keeps the old file's intent but moves it onto the engine mainline: PVF liftUp / pushAside /
 * weaponHitInfo slot coefficients must flow into the engine's airborne + knockback work states
 * instead of the retired combat ReactionResolver.
 */

import { assert } from "../static/test-utils.js";
import { applyHitReaction } from "../../src/engine/core/ReactionResolver.js";
import { Actor, type ActorStats } from "../../src/engine/core/Actor.js";

const STATS: ActorStats = {
  hpMax: 10000,
  mpMax: 0,
  moveSpeed: 300,
  physicalAttack: 10,
  physicalDefense: 5,
};

function freshDefender(): Actor {
  return new Actor("def", "monster", STATS);
}

// 1. attack3 truth: slot0 launch=0 falls back to liftUp body → airborne.vy = 300.
{
  const def = freshDefender();
  const reaction = applyHitReaction(
    def,
    {
      hitReaction: "hit_lift_up",
      liftUpValue: 300,
      causesDown: true,
      attackLevel: 2,
      weaponLaunch: 0,
    },
    50,
    0,
  );

  assert.equal(reaction.kind, "airborne", `attack3 should route to airborne, got ${reaction.kind}`);
  assert.ok(def.airborne !== null, "attack3 should create an airborne work state");
  assert.equal(def.airborne?.vy, 300, `slot0 launch=0 should fall back to liftUp=300, got ${def.airborne?.vy}`);
  console.log("✓ Test 1: attack3 launch fallback -> airborne.vy=300");
}

// 2. chargecrashfinish truth: pushAside 300 × pushBack 0.2 = 60 px/s rightward.
{
  const def = freshDefender();
  const reaction = applyHitReaction(
    def,
    {
      hitReaction: "hit_down",
      causesDown: true,
      attackLevel: 2,
      pushAsideValue: 300,
      weaponPushBack: 0.2,
      attackerFacing: 1,
    },
    50,
    0,
  );

  assert.equal(reaction.kind, "down", `chargecrashfinish-style hit should route to down, got ${reaction.kind}`);
  assert.ok(def.knockback !== null, "non-zero pushBack should create a knockback work state");
  assert.equal(def.knockback?.vx, 60, `pushAside 300 × pushBack 0.2 should yield vx=60, got ${def.knockback?.vx}`);
  console.log("✓ Test 2: chargecrashfinish knockback truth -> vx=60");
}

// 3. unknown/legacy path stays usable: liftUp legacy bool still routes airborne without invented velocity.
{
  const def = freshDefender();
  const reaction = applyHitReaction(def, { liftUp: true }, 50, 0);

  assert.equal(reaction.kind, "airborne", `legacy liftUp bool should still route airborne, got ${reaction.kind}`);
  assert.equal(reaction.launchVy, 0, `legacy path without truth values should keep vy=0, got ${reaction.launchVy}`);
  console.log("✓ Test 3: legacy liftUp path preserved");
}

// 4. facing direction flips horizontal knockback sign.
{
  const right = freshDefender();
  applyHitReaction(
    right,
    {
      hitReaction: "hit_down",
      causesDown: true,
      pushAsideValue: 300,
      weaponPushBack: 0.2,
      attackerFacing: 1,
    },
    50,
    0,
  );

  const left = freshDefender();
  applyHitReaction(
    left,
    {
      hitReaction: "hit_down",
      causesDown: true,
      pushAsideValue: 300,
      weaponPushBack: 0.2,
      attackerFacing: -1,
    },
    50,
    0,
  );

  assert.equal(right.knockback?.vx, 60, `right-facing hit should push positive, got ${right.knockback?.vx}`);
  assert.equal(left.knockback?.vx, -60, `left-facing hit should push negative, got ${left.knockback?.vx}`);
  console.log("✓ Test 4: facing direction flips knockback sign");
}

// 5. attack1 slot0 pushBack=0 keeps horizontal velocity at zero.
{
  const def = freshDefender();
  applyHitReaction(
    def,
    {
      hitReaction: "hit_down",
      causesDown: false,
      attackLevel: 1,
      pushAsideValue: 30,
      weaponPushBack: 0,
      attackerFacing: 1,
    },
    50,
    0,
  );

  assert.equal(def.knockback, null, "slot0 pushBack=0 should not create knockback state");
  console.log("✓ Test 5: attack1 no pushback");
}

console.log("\nAll reaction velocity tests passed");
